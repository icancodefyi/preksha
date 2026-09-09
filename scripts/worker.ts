import { runWorkerLoop } from "@/lib/jobs/worker";

const controller = new AbortController();
process.on("SIGINT", () => controller.abort());
process.on("SIGTERM", () => controller.abort());

runWorkerLoop(controller.signal).catch((err) => {
  console.error("[worker] fatal error", err);
  process.exit(1);
});
