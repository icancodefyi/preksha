// One-time: ports the existing demo dataset (lib/data/raw/*.json — 10k CDR
// rows, 600 financial, 150 tower-dump, 9 FIRs) through the REAL per-case
// ingestion pipeline (same putObject/FileRecord/IngestionJob/processJob path
// the HTTP upload + worker use) into a fresh case, instead of hand-seeding
// rows via Prisma. Proves the pipeline at realistic scale and gives the
// frontend a real case as rich as the static-seed demo it's replacing.
import Papa from "papaparse";
import { prisma } from "@/lib/db/client";
import { hashContent, putObject } from "@/lib/storage/objectStore";
import { processJob } from "@/lib/ingestion/pipeline";
import { runAnalytics } from "@/lib/analytics/run";
import cdrRaw from "@/lib/data/raw/cdr.json";
import finRaw from "@/lib/data/raw/financial.json";
import dumpRaw from "@/lib/data/raw/tower_dump.json";
import firsRaw from "@/lib/data/raw/firs.json";

async function ingestOne(caseId: string, uploaderId: string, sourceType: string, filename: string, buf: Buffer) {
  const contentHash = hashContent(buf);
  const objectStorageKey = await putObject(caseId, contentHash, buf);
  const file = await prisma.fileRecord.create({
    data: { caseId, sourceType, filename, contentHash, objectStorageKey, uploadedById: uploaderId },
  });
  const job = await prisma.ingestionJob.create({
    data: { fileId: file.id, caseId, stage: "validate", status: "queued" },
  });
  await processJob(job.id);
  const finished = await prisma.ingestionJob.findUniqueOrThrow({ where: { id: job.id } });
  console.log(`  ${filename}: ${finished.status}${finished.error ? ` (${finished.error.slice(0, 120)})` : ""}`);
}

function firToText(f: (typeof firsRaw)[number]): string {
  const accusedLine = f.accused.map((a) => a.name ?? a.alias).filter(Boolean).join(", ");
  return [
    `FIR No: ${f.fir_no}`,
    `Police Station: ${f.police_station}, ${f.district}, ${f.state}`,
    `Complainant: ${f.complainant.name}`,
    `Phone: ${f.complainant.phone ?? ""}`,
    `Accused: ${accusedLine}`,
    `Place of occurrence: ${f.complainant.address}`,
    `Section: ${f.sections.join(", ")}`,
    `Date: ${f.incident_date}`,
    "",
    `Narrative: ${f.narrative}`,
  ].join("\n");
}

async function main() {
  const investigator = await prisma.user.findUniqueOrThrow({ where: { username: "investigator1" } });
  const supervisor = await prisma.user.findUniqueOrThrow({ where: { username: "supervisor1" } });

  const kase = await prisma.case.create({
    data: { title: "NCR Network — Full Demo Dataset", status: "open", sensitivity: "standard", createdById: investigator.id },
  });
  await prisma.caseAssignment.createMany({
    data: [
      { caseId: kase.id, userId: investigator.id, accessLevel: "manage", grantedById: investigator.id },
      { caseId: kase.id, userId: supervisor.id, accessLevel: "contribute", grantedById: investigator.id },
    ],
  });
  console.log(`Created case ${kase.id} ("${kase.title}")`);

  console.log("Ingesting CDR...");
  await ingestOne(kase.id, investigator.id, "cdr", "cdr_seed_export.csv", Buffer.from(Papa.unparse(cdrRaw), "utf-8"));

  console.log("Ingesting financial...");
  await ingestOne(kase.id, investigator.id, "financial", "financial_seed_export.csv", Buffer.from(Papa.unparse(finRaw), "utf-8"));

  console.log("Ingesting tower dump...");
  await ingestOne(kase.id, investigator.id, "tower_dump", "tower_dump_seed_export.csv", Buffer.from(Papa.unparse(dumpRaw), "utf-8"));

  console.log(`Ingesting ${firsRaw.length} FIRs...`);
  for (const f of firsRaw) {
    await ingestOne(kase.id, investigator.id, "fir", `FIR_${f.fir_no.replace("/", "-")}.txt`, Buffer.from(firToText(f), "utf-8"));
  }

  console.log("Running analytics...");
  await runAnalytics(kase.id, investigator.id);

  const [events, txns, obs, firs] = await Promise.all([
    prisma.communicationEvent.count({ where: { caseId: kase.id } }),
    prisma.transaction.count({ where: { caseId: kase.id } }),
    prisma.observation.count({ where: { caseId: kase.id } }),
    prisma.fir.count({ where: { caseId: kase.id } }),
  ]);
  console.log(`\nDone. Case ${kase.id}: ${events} comm events, ${txns} transactions, ${obs} observations, ${firs} FIRs.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
