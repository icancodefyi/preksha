import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Local-filesystem object storage for MVP (ADR-03: content-hash addressed,
// immutable — never rewritten in place). Production swaps this module for a
// MinIO/S3-compatible client behind the same two functions; nothing above
// this layer (ingestion, evidence, reports) needs to change.
const ROOT = path.join(process.cwd(), "storage", "raw");

export function hashContent(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

/** Writes bytes under a content-hash key; re-writing the same hash is a no-op. */
export async function putObject(caseId: string, hash: string, buf: Buffer): Promise<string> {
  const dir = path.join(ROOT, caseId);
  await mkdir(dir, { recursive: true });
  const key = `${caseId}/${hash}`;
  const filePath = path.join(ROOT, key);
  await writeFile(filePath, buf, { flag: "wx" }).catch((err) => {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err; // already stored — immutable, fine
  });
  return key;
}

export async function getObject(objectStorageKey: string): Promise<Buffer> {
  return readFile(path.join(ROOT, objectStorageKey));
}
