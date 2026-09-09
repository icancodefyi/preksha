import { parseCsvRows, type CsvParseResult } from "@/lib/ingestion/parseCsv";

export interface ParsedCommEvent {
  callId: string;
  caller: string;
  receiver: string;
  timestamp: Date;
  durationSec: number;
  callType: string;
  callerCell: string | null;
  receiverCell: string | null;
  imeiCaller: string | null;
}

const REQUIRED = ["call_id", "caller", "receiver", "timestamp", "duration_sec", "call_type"];

export function parseCdrCsv(buf: Buffer): CsvParseResult<ParsedCommEvent> {
  return parseCsvRows(buf, REQUIRED, (raw) => {
    const timestamp = new Date(raw.timestamp);
    if (Number.isNaN(timestamp.getTime())) throw new Error(`Invalid timestamp "${raw.timestamp}"`);
    const durationSec = Number(raw.duration_sec);
    if (!Number.isFinite(durationSec) || durationSec < 0) {
      throw new Error(`Invalid duration_sec "${raw.duration_sec}"`);
    }
    return {
      callId: raw.call_id,
      caller: raw.caller,
      receiver: raw.receiver,
      timestamp,
      durationSec,
      callType: raw.call_type,
      callerCell: raw.caller_cell || null,
      receiverCell: raw.receiver_cell || null,
      imeiCaller: raw.imei_caller || null,
    };
  });
}
