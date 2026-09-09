import { parseCsvRows, type CsvParseResult } from "@/lib/ingestion/parseCsv";

export interface ParsedTransaction {
  txnId: string;
  timestamp: Date;
  fromAccount: string;
  fromName: string;
  toAccount: string;
  toName: string;
  amount: number;
  method: string | null;
  bank: string | null;
  remark: string | null;
}

const REQUIRED = ["txn_id", "date", "from_account", "from_name", "to_account", "to_name", "amount"];

export function parseFinancialCsv(buf: Buffer): CsvParseResult<ParsedTransaction> {
  return parseCsvRows(buf, REQUIRED, (raw) => {
    const timeStr = raw.time && raw.time.trim() ? raw.time.trim() : "00:00:00";
    const timestamp = new Date(`${raw.date}T${timeStr}`);
    if (Number.isNaN(timestamp.getTime())) throw new Error(`Invalid date/time "${raw.date} ${raw.time}"`);
    const amount = Number(raw.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error(`Invalid amount "${raw.amount}"`);
    return {
      txnId: raw.txn_id,
      timestamp,
      fromAccount: raw.from_account,
      fromName: raw.from_name,
      toAccount: raw.to_account,
      toName: raw.to_name,
      amount,
      method: raw.method || null,
      bank: raw.bank || null,
      remark: raw.remark || null,
    };
  });
}
