import { parse } from "csv-parse/sync";

export type CsvRow = Record<string, string>;

export interface CsvTable {
  header: string[];
  rows: CsvRow[];
  /** Rows whose cell count differed from the header; rejected, never padded. */
  raggedRows: number;
}

/** RFC 4180 parse: leading BOM stripped, quoted commas/newlines/quotes handled, ragged rows counted. */
export function parseCsvTable(text: string): CsvTable {
  const records: string[][] = parse(text, {
    bom: true,
    relax_column_count: true,
    skip_empty_lines: true,
    trim: false,
  });
  const [header = [], ...body] = records;
  const rows: CsvRow[] = [];
  let raggedRows = 0;
  for (const cells of body) {
    if (cells.length !== header.length) {
      raggedRows += 1;
      continue;
    }
    const row: CsvRow = {};
    header.forEach((h, i) => {
      row[h] = cells[i] ?? "";
    });
    rows.push(row);
  }
  return { header, rows, raggedRows };
}

export function missingColumns(table: CsvTable, required: readonly string[]): string[] {
  return required.filter((c) => !table.header.includes(c));
}

/** Blank or non-numeric becomes null. */
export function numOrNull(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
