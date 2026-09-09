import { prisma } from "@/lib/db/client";
import { processJob } from "@/lib/ingestion/pipeline";

// Phase 1 §0 correction (Gap #10): pulls a BATCH of queued jobs and processes
// them concurrently, so FIR/CDR/financial jobs uploaded together for one case
// don't serialize behind each other — this is the ingestion-parallelism half
// of the fix. (Single worker process for MVP; production runs N of these —
// see docs/ARCHITECTURE.md ADR-04. With one process, claiming jobs isn't a
// race; a second worker process would need an atomic claim step first.)
const BATCH_SIZE = 5;
const POLL_INTERVAL_MS = 1000;
const IDLE_POLL_INTERVAL_MS = 3000;

async function claimBatch(): Promise<string[]> {
  const jobs = await prisma.ingestionJob.findMany({
    where: { status: "queued" },
    orderBy: { createdAt: "asc" },
    take: BATCH_SIZE,
    select: { id: true },
  });
  return jobs.map((j) => j.id);
}

export async function runWorkerLoop(signal?: AbortSignal): Promise<void> {
  console.log("[worker] started, polling for ingestion jobs...");
  while (!signal?.aborted) {
    const jobIds = await claimBatch();
    if (jobIds.length === 0) {
      await sleep(IDLE_POLL_INTERVAL_MS);
      continue;
    }
    console.log(`[worker] processing ${jobIds.length} job(s) in parallel`);
    await Promise.allSettled(jobIds.map((id) => processJob(id)));
    await sleep(POLL_INTERVAL_MS);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
