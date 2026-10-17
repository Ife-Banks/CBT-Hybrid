import { writeZip, type ZipEntry } from '@cbt/exam-core';

/** A cell in an `.xlsx` sheet: a string or a number. */
export type SheetCell = string | number | null;

export interface SheetInput {
  name: string;
  rows: SheetCell[][];
}

/**
 * Build a minimal but valid `.xlsx` workbook (Office Open XML).
 *
 * An `.xlsx` file is a ZIP of XML parts; we reuse the deterministic stored-ZIP
 * writer from `@cbt/exam-core` so no third-party dependency is added. Strings are
 * written inline (`t="inlineStr"`) to avoid a shared-strings part.
 */
export function writeXlsx(sheet: SheetInput): Uint8Array {
  const encoder = new TextEncoder();
  const entries: ZipEntry[] = [
    { path: '[Content_Types].xml', data: encoder.encode(contentTypes()) },
    { path: '_rels/.rels', data: encoder.encode(rootRels()) },
    { path: 'xl/workbook.xml', data: encoder.encode(workbook(sheet.name)) },
    { path: 'xl/_rels/workbook.xml.rels', data: encoder.encode(workbookRels()) },
    { path: 'xl/worksheets/sheet1.xml', data: encoder.encode(sheetXml(sheet.rows)) },
  ];
  return writeZip(entries, { modifiedAt: new Date(Date.UTC(1980, 0, 1)) });
}

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

function contentTypes(): string {
  return (
    XML_HEADER +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '</Types>'
  );
}

function rootRels(): string {
  return (
    XML_HEADER +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>'
  );
}

function workbookRels(): string {
  return (
    XML_HEADER +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '</Relationships>'
  );
}

function workbook(sheetName: string): string {
  return (
    XML_HEADER +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheets><sheet name="' +
    escapeXml(sheetName.slice(0, 31) || 'Sheet1') +
    '" sheetId="1" r:id="rId1"/></sheets>' +
    '</workbook>'
  );
}

function sheetXml(rows: SheetCell[][]): string {
  const body = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((cell, columnIndex) => cellXml(columnIndex, rowIndex + 1, cell))
        .join('');
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join('');
  return (
    XML_HEADER +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<sheetData>${body}</sheetData>` +
    '</worksheet>'
  );
}

function cellXml(columnIndex: number, rowIndex: number, cell: SheetCell): string {
  const ref = `${columnName(columnIndex)}${rowIndex}`;
  if (cell === null || cell === undefined || cell === '') {
    return `<c r="${ref}"/>`;
  }
  if (typeof cell === 'number' && Number.isFinite(cell)) {
    return `<c r="${ref}"><v>${cell}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(cell))}</t></is></c>`;
}

/** 0-based column index to spreadsheet letters (A, B, ..., Z, AA, ...). */
export function columnName(index: number): string {
  let n = index;
  let name = '';
  do {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return name;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
