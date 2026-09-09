import { prisma } from "@/lib/db/client";
import { getObject } from "@/lib/storage/objectStore";
import { parseCdrCsv } from "@/lib/ingestion/cdr";
import { parseFinancialCsv } from "@/lib/ingestion/financial";
import { parseTowerDumpCsv } from "@/lib/ingestion/towerDump";
import { parseCctvCsv } from "@/lib/ingestion/cctv";
import type { RowError } from "@/lib/ingestion/parseCsv";
import { detectImeiSharing } from "@/lib/entity-resolution/imeiSharing";
import { extractText } from "@/lib/ingestion/extractText";
import { extractFirEntities } from "@/lib/ingestion/firExtractor";

export type SourceType = "fir" | "cdr" | "ipdr" | "financial" | "tower_dump" | "cctv" | "other";

// Structured (non-FIR) sources go straight from validated bytes to persisted
// rows — no OCR/NLP stage needed (Phase 5.1's pipeline collapses for these).
const STRUCTURED_SOURCES: SourceType[] = ["cdr", "financial", "tower_dump", "cctv"];

export function isStructuredSource(sourceType: string): sourceType is (typeof STRUCTURED_SOURCES)[number] {
  return (STRUCTURED_SOURCES as string[]).includes(sourceType);
}

/**
 * Runs one ingestion job end to end. Idempotent (Principle 9): re-running a
 * job for the same file skips rows already present via the (caseId, natural
 * key) unique constraint on each bulk table — createMany(skipDuplicates).
 */
export async function processJob(jobId: string): Promise<void> {
  const job = await prisma.ingestionJob.findUniqueOrThrow({
    where: { id: jobId },
    include: { file: true },
  });

  await prisma.ingestionJob.update({
    where: { id: jobId },
    data: { status: "running", startedAt: new Date(), attempt: { increment: 1 } },
  });

  try {
    if (job.file.sourceType === "fir") {
      await processFir(job.caseId, job.fileId);
      await prisma.ingestionJob.update({
        where: { id: jobId },
        data: { status: "succeeded", finishedAt: new Date() },
      });
      return;
    }

    if (!isStructuredSource(job.file.sourceType)) {
      // IPDR/CCTV: not yet implemented. Fail loud rather than silently
      // no-op (Principle 17) — future scope per docs Phase 12.1/13.
      throw new Error(`No processor registered yet for source_type "${job.file.sourceType}"`);
    }

    const bytes = await getObject(job.file.objectStorageKey);
    const { inserted, errors } = await persistStructuredRows(job.caseId, job.fileId, job.file.sourceType, bytes);
    console.log(`[ingestion] job ${jobId}: inserted ${inserted} row(s), ${errors.length} error(s)`);

    await prisma.evidence.create({
      data: {
        caseId: job.caseId,
        fileId: job.fileId,
        stage: "extraction",
        recordType: `${job.file.sourceType}_batch`,
        recordId: job.fileId,
        extractor: `${job.file.sourceType}_parser_v1`,
        confidence: 1.0, // deterministic CSV parse, not a probabilistic model
      },
    });

    // Incremental cross-reference (Phase 1 §0 / Gap #10): run the cheap
    // deterministic entity-resolution signal available from this source
    // right away rather than waiting for a separate batch step.
    if (job.file.sourceType === "cdr") {
      await detectImeiSharing(job.caseId);
    }

    await prisma.ingestionJob.update({
      where: { id: jobId },
      data: {
        status: errors.length > 0 ? "succeeded_with_errors" : "succeeded",
        finishedAt: new Date(),
        error: errors.length > 0 ? summarizeErrors(errors) : null,
      },
    });
  } catch (err) {
    await prisma.ingestionJob.update({
      where: { id: jobId },
      data: { status: "failed", finishedAt: new Date(), error: err instanceof Error ? err.message : String(err) },
    });
  }
}

// Note: Prisma's createMany({ skipDuplicates: true }) is unsupported on
// SQLite, so idempotent retries (Principle 9) are implemented portably here
// instead — filter out rows whose natural key already exists in this case
// before inserting. Same code path works unchanged once production moves to
// Postgres (ADR-02), rather than depending on provider-specific behavior.
async function persistStructuredRows(
  caseId: string,
  fileId: string,
  sourceType: string,
  bytes: Buffer,
): Promise<{ inserted: number; errors: RowError[] }> {
  if (sourceType === "cdr") {
    const { rows, errors } = parseCdrCsv(bytes);
    const existing = new Set(
      (await prisma.communicationEvent.findMany({ where: { caseId }, select: { callId: true } })).map(
        (r) => r.callId,
      ),
    );
    const fresh = rows.filter((r) => !existing.has(r.callId));
    const { count } = await prisma.communicationEvent.createMany({
      data: fresh.map((r) => ({ caseId, fileId, ...r })),
    });
    return { inserted: count, errors };
  }
  if (sourceType === "financial") {
    const { rows, errors } = parseFinancialCsv(bytes);
    const existing = new Set(
      (await prisma.transaction.findMany({ where: { caseId }, select: { txnId: true } })).map((r) => r.txnId),
    );
    const fresh = rows.filter((r) => !existing.has(r.txnId));
    const { count } = await prisma.transaction.createMany({
      data: fresh.map((r) => ({ caseId, fileId, ...r })),
    });
    return { inserted: count, errors };
  }
  if (sourceType === "tower_dump") {
    const { rows, errors } = parseTowerDumpCsv(bytes);
    const existing = new Set(
      (await prisma.observation.findMany({ where: { caseId }, select: { dumpId: true } })).map((r) => r.dumpId),
    );
    const fresh = rows.filter((r) => !existing.has(r.dumpId));
    const { count } = await prisma.observation.createMany({
      data: fresh.map((r) => ({ caseId, fileId, source: "tower_dump", ...r })),
    });
    return { inserted: count, errors };
  }
  if (sourceType === "cctv") {
    const { rows, errors } = parseCctvCsv(bytes);
    const existing = new Set(
      (await prisma.observation.findMany({ where: { caseId }, select: { dumpId: true } })).map((r) => r.dumpId),
    );
    const fresh = rows.filter((r) => !existing.has(r.dumpId));
    const { count } = await prisma.observation.createMany({
      data: fresh.map((r) => ({ caseId, fileId, source: "cctv", phone: null, imei: null, ...r })),
    });
    return { inserted: count, errors };
  }
  throw new Error(`Unhandled structured source_type "${sourceType}"`);
}

const EXTRACTOR_VERSION = "regex_gazetteer_v1";

async function processFir(caseId: string, fileId: string): Promise<void> {
  const file = await prisma.fileRecord.findUniqueOrThrow({ where: { id: fileId } });
  const bytes = await getObject(file.objectStorageKey);
  const narrative = await extractText(bytes, file.filename);
  const extracted = extractFirEntities(narrative);

  await prisma.$transaction([
    prisma.fir.create({
      data: {
        caseId,
        fileId,
        firNo: extracted.firNo,
        narrative,
        extractedEntities: extracted as unknown as object,
        extractorVersion: EXTRACTOR_VERSION,
      },
    }),
    prisma.evidence.create({
      data: {
        caseId,
        fileId,
        stage: "extraction",
        recordType: "fir_entity",
        recordId: fileId,
        extractor: EXTRACTOR_VERSION,
        confidence: extracted.confidence,
      },
    }),
  ]);
}

function summarizeErrors(errors: RowError[]): string {
  const head = errors.slice(0, 5).map((e) => `row ${e.row}: ${e.message}`).join("; ");
  return errors.length > 5 ? `${head}; +${errors.length - 5} more` : head;
}
