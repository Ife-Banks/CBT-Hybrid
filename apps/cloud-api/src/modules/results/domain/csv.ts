/** CSV cell: a string or number, or null for an empty field. */
export type CsvCell = string | number | null;

/**
 * Render rows to RFC 4180 CSV (CRLF line endings). Fields containing a comma,
 * quote or newline are quoted with embedded quotes doubled.
 */
export function toCsv(rows: CsvCell[][]): string {
  return rows.map((row) => row.map(csvField).join(',')).join('\r\n') + '\r\n';
}

function csvField(cell: CsvCell): string {
  if (cell === null || cell === undefined) return '';
  const value = String(cell);
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
