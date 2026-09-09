import { prisma } from "@/lib/db/client";
import { putObject, hashContent } from "@/lib/storage/objectStore";

const METRICS = ["betweenness", "pagerank", "degree", "community", "disruption"];

// Phase 10 / Phase 2.5: the report states what was done and how (provenance-
// complete) and explicitly never asserts legal admissibility — see the
// "generated_by" + "note" fields below, which is the only place this claim
// is allowed to appear, and only to disclaim it.
export async function generateReport(caseId: string, title: string, generatedById: string) {
  const [kase, latestRuns, evidenceRows, filesRows, erAccepted] = await Promise.all([
    prisma.case.findUniqueOrThrow({ where: { id: caseId } }),
    Promise.all(
      METRICS.map((metric) =>
        prisma.analyticalRun.findFirst({ where: { caseId, metric }, orderBy: { computedAt: "desc" } }),
      ),
    ),
    prisma.evidence.findMany({ where: { caseId }, orderBy: { createdAt: "asc" } }),
    prisma.fileRecord.findMany({ where: { caseId } }),
    prisma.entityResolutionCandidate.findMany({ where: { caseId, status: "accepted" } }),
  ]);

  const reportBody = {
    case: { id: kase.id, title: kase.title, status: kase.status, sensitivity: kase.sensitivity },
    generated: { by: generatedById, at: new Date().toISOString() },
    sources: filesRows.map((f) => ({
      fileId: f.id,
      sourceType: f.sourceType,
      filename: f.filename,
      contentHash: f.contentHash,
      uploadedAt: f.uploadedAt,
    })),
    analytics: latestRuns.filter(Boolean).map((r) => ({
      metric: r!.metric,
      computedAt: r!.computedAt,
      runId: r!.id,
      result: r!.resultSummary,
    })),
    entityResolution: erAccepted.map((c) => ({
      entityA: c.entityARef,
      entityB: c.entityBRef,
      score: c.score,
      signals: c.signals,
      decidedAt: c.decidedAt,
    })),
    evidence: evidenceRows.map((e) => ({
      id: e.id,
      stage: e.stage,
      recordType: e.recordType,
      recordId: e.recordId,
      extractor: e.extractor,
      confidence: e.confidence,
      createdAt: e.createdAt,
    })),
    note:
      "This is an investigative working document generated from the case's ingested sources and " +
      "deterministic analytics. It is not a claim of legal admissibility — that determination requires " +
      "the applicable certification process (e.g. Section 65B, Indian Evidence Act) and is outside this " +
      "system's scope. Every fact above traces to a source record, extractor and timestamp (see 'sources' " +
      "and 'evidence').",
  };

  const buf = Buffer.from(JSON.stringify(reportBody, null, 2), "utf-8");
  const hash = hashContent(buf);
  const objectStorageKey = await putObject(caseId, `report-${hash}.json`, buf);

  const report = await prisma.report.create({
    data: {
      caseId,
      title,
      generatedById,
      citedEvidenceIds: evidenceRows.map((e) => e.id),
      objectStorageKey,
    },
  });

  return { report, body: reportBody };
}
