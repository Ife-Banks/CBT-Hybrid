import { readZip } from '@cbt/exam-core';

/** A sheet-like view of a parsed file: normalised headers plus body rows. */
export interface Table {
  headers: string[];
  rows: Array<Record<string, string>>;
}

/** Normalise a column header: lower case, spaces to underscores. */
export function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, '_');
}

/** Turn a raw cell matrix into a header-keyed table (spec 7.3: headers are
 * matched case-insensitively and ignoring spaces). */
export function toTable(matrix: string[][]): Table {
  const [headerRow = [], ...body] = matrix;
  const headers = headerRow.map(normalizeHeader);
  const rows = body.map((cells) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      if (!header) return;
      record[header] = (cells[index] ?? '').trim();
    });
    return record;
  });
  return { headers, rows };
}

/**
 * Parse CSV text into a matrix. Handles quoted fields (with `""` escapes),
 * CRLF and a leading BOM. Blank lines are dropped.
 */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''));
}

/** Decode the handful of XML entities that appear in spreadsheet text. */
export function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, '&');
}

/** Column reference (`A`, `AB`) → zero-based index. */
function columnIndex(reference: string): number {
  const letters = /^[A-Z]+/.exec(reference.toUpperCase())?.[0] ?? 'A';
  let index = 0;
  for (const letter of letters) {
    index = index * 26 + (letter.charCodeAt(0) - 64);
  }
  return index - 1;
}

function parseSharedStrings(xml: string): string[] {
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) =>
    [...(match[1] ?? '').matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
      .map((text) => decodeXml(text[1] ?? ''))
      .join(''),
  );
}

function parseSheet(xml: string, shared: string[]): string[][] {
  const matrix: string[][] = [];
  for (const rowMatch of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const rowXml = rowMatch[1] ?? '';
    const row: string[] = [];
    for (const cellMatch of rowXml.matchAll(/<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cellMatch[1] ?? '';
      const inner = cellMatch[2] ?? '';
      const reference = /r="([A-Z]+\d+)"/.exec(attrs)?.[1] ?? '';
      const index = reference ? columnIndex(reference) : row.length;
      row[index] = cellValue(attrs, inner, shared);
    }
    for (let i = 0; i < row.length; i += 1) row[i] ??= '';
    matrix.push(row);
  }
  return matrix;
}

function cellValue(attrs: string, inner: string, shared: string[]): string {
  if (/t="inlineStr"/.test(attrs)) {
    return [...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
      .map((text) => decodeXml(text[1] ?? ''))
      .join('');
  }
  const value = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? '';
  if (/t="s"/.test(attrs)) {
    return shared[Number(value)] ?? '';
  }
  return decodeXml(value);
}

/** Parse the first worksheet of an `.xlsx` workbook into a matrix. */
export function parseXlsx(bytes: Uint8Array): string[][] {
  const entries = readZip(bytes);
  const decoder = new TextDecoder();
  const sharedEntry = entries.find((entry) => entry.path === 'xl/sharedStrings.xml');
  const sheetEntry =
    entries.find((entry) => entry.path === 'xl/worksheets/sheet1.xml') ??
    entries.find((entry) => /^xl\/worksheets\/.*\.xml$/.test(entry.path));

  if (!sheetEntry) {
    throw new ImportFileError('NO_WORKSHEET', 'The workbook has no worksheet.');
  }

  const shared = sharedEntry ? parseSharedStrings(decoder.decode(sharedEntry.data)) : [];
  return parseSheet(decoder.decode(sheetEntry.data), shared);
}

/** Parse a `.docx` into its paragraphs (text only, images ignored). */
export function parseDocxParagraphs(bytes: Uint8Array): string[] {
  const entries = readZip(bytes);
  const document = entries.find((entry) => entry.path === 'word/document.xml');
  if (!document) {
    throw new ImportFileError('NOT_A_DOCUMENT', 'The file is not a Word document.');
  }
  const xml = new TextDecoder().decode(document.data);
  return [...xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map((paragraph) =>
    [...(paragraph[0] ?? '').matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)]
      .map((text) => decodeXml(text[1] ?? ''))
      .join(''),
  );
}

/**
 * Turn Word question paragraphs (spec 9.2) into the same column shape the
 * spreadsheet importers produce, so one validator handles every format.
 */
export function docxQuestionsToRecords(paragraphs: string[]): Array<Record<string, string>> {
  const records: Array<Record<string, string>> = [];
  let current: Record<string, string> | null = null;

  for (const rawLine of paragraphs) {
    const line = rawLine.trim();
    if (line === '') {
      current = null;
      continue;
    }

    const questionStart = /^(?:Q\s*\d+|\d+)[.)]\s*(.+)$/i.exec(line);
    if (questionStart) {
      current = { question: (questionStart[1] ?? '').trim() };
      records.push(current);
      continue;
    }
    if (!current) continue;

    const option = /^(?:\(([A-Fa-f])\)|([A-Fa-f])[.)])\s*(.+)$/.exec(line);
    if (option) {
      const letter = (option[1] ?? option[2] ?? '').toLowerCase();
      current[`option_${letter}`] = (option[3] ?? '').trim();
      continue;
    }

    const keyword = /^(Answer|Marks|Topic|Difficulty|Explanation|Type|Case)\s*[:\-]\s*(.*)$/i.exec(line);
    if (keyword) {
      const key = (keyword[1] ?? '').toLowerCase();
      const value = (keyword[2] ?? '').trim();
      if (key === 'answer') current.correct = value;
      else if (key === 'marks') current.marks = value;
      else if (key === 'topic') current.topic = value;
      else if (key === 'difficulty') current.difficulty = value;
      else if (key === 'explanation') current.explanation = value;
      else if (key === 'type') current.type = value;
      else if (key === 'case') current.case_sensitive = /^y|true|1/i.test(value) ? 'yes' : 'no';
      continue;
    }

    current.question = `${current.question ?? ''} ${line}`.trim();
  }

  return records;
}

/** Raised when a file cannot be read at all (spec 7.3 `IMPORT_FILE_REJECTED`). */
export class ImportFileError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ImportFileError';
  }
}
