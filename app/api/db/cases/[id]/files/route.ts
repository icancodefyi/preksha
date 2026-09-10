import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { requireCaseAccess } from "@/lib/auth/authorize";
import { apiErrorResponse, ApiError } from "@/lib/http/errors";
import { writeAudit } from "@/lib/audit/log";
import { hashContent, putObject } from "@/lib/storage/objectStore";

export const runtime = "nodejs";

const ALLOWED_SOURCE_TYPES = ["fir", "cdr", "ipdr", "financial", "tower_dump", "cctv", "other"];
const MAX_BYTES = 50 * 1024 * 1024; // 50MB — generous for the routine-case CSV sizes (Phase 1 N1a)

export async function POST(req: NextRequest, ctx: RouteContext<"/api/db/cases/[id]/files">) {
  try {
    const { id: caseId } = await ctx.params;
    const user = await requireUser(req);
    await requireCaseAccess(user, caseId, "contribute");

    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    const sourceType = form?.get("source_type");
    if (!(file instanceof File) || typeof sourceType !== "string") {
      throw new ApiError(422, "validation_error", "multipart form must include a 'file' and 'source_type'");
    }
    if (!ALLOWED_SOURCE_TYPES.includes(sourceType)) {
      throw new ApiError(422, "validation_error", `source_type must be one of: ${ALLOWED_SOURCE_TYPES.join(", ")}`);
    }
    if (file.size === 0 || file.size > MAX_BYTES) {
      throw new ApiError(422, "validation_error", `file size must be between 1 byte and ${MAX_BYTES} bytes`);
    }
    // Minimal type gate for MVP (S7 file upload validation) — structured
    // sources are CSV only; broader MIME/malware scanning is a production
    // hardening item (docs/ARCHITECTURE.md Phase 9.2), not skipped silently.
    if (["cdr", "financial", "tower_dump", "cctv"].includes(sourceType) && !file.name.toLowerCase().endsWith(".csv")) {
      throw new ApiError(422, "validation_error", `source_type "${sourceType}" requires a .csv file`);
    }
    if (sourceType === "fir" && !/\.(pdf|txt)$/i.test(file.name)) {
      throw new ApiError(422, "validation_error", 'source_type "fir" requires a .pdf (text layer) or .txt file');
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const contentHash = hashContent(buf);

    const existing = await prisma.fileRecord.findUnique({
      where: { caseId_contentHash: { caseId, contentHash } },
    });
    if (existing) {
      // Phase 10 "duplicate file uploaded" — tell the caller, don't reprocess.
      return NextResponse.json({ file: existing, alreadyIngested: true });
    }

    const objectStorageKey = await putObject(caseId, contentHash, buf);

    const created = await prisma.$transaction(async (tx) => {
      const fileRow = await tx.fileRecord.create({
        data: {
          caseId,
          sourceType,
          filename: file.name,
          contentHash,
          objectStorageKey,
          uploadedById: user.id,
        },
      });
      const job = await tx.ingestionJob.create({
        data: { fileId: fileRow.id, caseId, stage: "validate", status: "queued" },
      });
      return { fileRow, job };
    });

    await writeAudit({
      actorId: user.id,
      action: "upload_file",
      caseId,
      resourceRef: `file:${created.fileRow.id}`,
      requestSummary: { sourceType, filename: file.name, sizeBytes: file.size },
    });

    return NextResponse.json(
      { file: created.fileRow, job: created.job, alreadyIngested: false },
      { status: 202 },
    );
  } catch (err) {
    return apiErrorResponse(err);
  }
}
