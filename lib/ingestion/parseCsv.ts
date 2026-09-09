import Papa from "papaparse";

export interface RowError {
  row: number; // 1-indexed, matches spreadsheet row (header excluded)
  message: string;
}

export interface CsvParseResult<T> {
  rows: T[];
  errors: RowError[];
}

/**
 * Generic CSV -> typed-row parser. Malformed rows are quarantined with
 * row-level detail (Phase 10 "ingestion partially succeeds") — valid rows
 * still commit, nothing is silently dropped.
 */
export function parseCsvRows<T>(
  buf: Buffer,
  requiredColumns: string[],
  mapRow: (raw: Record<string, string>) => T,
): CsvParseResult<T> {
  const text = buf.toString("utf-8");
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const rows: T[] = [];
  const errors: RowError[] = [];

  const headerFields = parsed.meta.fields ?? [];
  const missing = requiredColumns.filter((c) => !headerFields.includes(c));
  if (missing.length > 0) {
    errors.push({ row: 0, message: `Missing required column(s): ${missing.join(", ")}` });
    return { rows, errors };
  }

  parsed.data.forEach((raw, idx) => {
    try {
      const missingField = requiredColumns.find((c) => !raw[c] || raw[c].trim() === "");
      if (missingField) throw new Error(`Empty required field "${missingField}"`);
      rows.push(mapRow(raw));
    } catch (err) {
      errors.push({ row: idx + 1, message: err instanceof Error ? err.message : String(err) });
    }
  });

  return { rows, errors };
}
