import { NextResponse } from "next/server";
import { evidenceChain, reconstructCrime, overview } from "@/lib/graph/enrich";
import { anchorEvidence, type ReportData } from "@/lib/graph/blockchain";

export const dynamic = "force-dynamic";

// Assembles everything a court-ready certificate needs in one payload.
export async function GET() {
  const { chain, root, verified } = evidenceChain();
  const anchor = anchorEvidence();
  const ov = overview();

  // Reconstruct the flagship robbery (FIR 1201/2023) — the richest cited timeline.
  const rec = reconstructCrime("1201/2023");

  const report: ReportData = {
    generatedAt: new Date().toISOString(),
    root,
    verified,
    chain: chain.map((c) => ({ id: c.id, label: c.label, sha256: c.sha256, verified: c.verified })),
    anchor,
    caseTitle: rec?.fir.title ?? "Investigation corpus",
    caseFirs: rec ? [rec.fir.fir_no] : [],
    reconstruction: rec
      ? rec.steps.map((s) => ({ phase: s.phase, time: s.time, title: s.title, source: s.source }))
      : null,
    summary:
      rec?.summary ??
      `Evidence chain over ${ov.stats.firs} FIRs, ${ov.stats.calls.toLocaleString("en-IN")} calls, ` +
        `${ov.stats.financial} transactions and ${ov.stats.towerDumps} tower dumps.`,
  };

  return NextResponse.json(report);
}
