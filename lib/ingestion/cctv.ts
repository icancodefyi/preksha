import { parseCsvRows, type CsvParseResult } from "@/lib/ingestion/parseCsv";

export interface ParsedCctvObservation {
  dumpId: string;
  cellId: string | null; // camera_id
  event: string | null; // plate/description text
  timestamp: Date;
}

const REQUIRED = ["event_id", "camera_id", "timestamp"];

// Reuses the generic Observation table (source='cctv') — same shape as tower
// dump, different column names, no schema change needed (Phase 6.4: bulk
// point-observations stay uniform regardless of sensor type).
export function parseCctvCsv(buf: Buffer): CsvParseResult<ParsedCctvObservation> {
  return parseCsvRows(buf, REQUIRED, (raw) => {
    const timestamp = new Date(raw.timestamp);
    if (Number.isNaN(timestamp.getTime())) throw new Error(`Invalid timestamp "${raw.timestamp}"`);
    return {
      dumpId: raw.event_id,
      cellId: raw.camera_id || null,
      event: raw.plate ? `plate:${raw.plate}` : raw.note || null,
      timestamp,
    };
  });
}
