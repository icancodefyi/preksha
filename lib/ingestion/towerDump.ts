import { parseCsvRows, type CsvParseResult } from "@/lib/ingestion/parseCsv";

export interface ParsedObservation {
  dumpId: string;
  phone: string | null;
  imei: string | null;
  timestamp: Date;
  cellId: string | null;
  event: string | null;
}

const REQUIRED = ["dump_id", "timestamp"];

export function parseTowerDumpCsv(buf: Buffer): CsvParseResult<ParsedObservation> {
  return parseCsvRows(buf, REQUIRED, (raw) => {
    const timestamp = new Date(raw.timestamp);
    if (Number.isNaN(timestamp.getTime())) throw new Error(`Invalid timestamp "${raw.timestamp}"`);
    return {
      dumpId: raw.dump_id,
      phone: raw.phone || null,
      imei: raw.imei || null,
      timestamp,
      cellId: raw.cell_id || null,
      event: raw.event || null,
    };
  });
}
