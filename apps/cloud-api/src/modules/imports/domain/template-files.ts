import { writeZip } from '@cbt/exam-core';
import type { ImportFormat, ImportKind } from './types';
import { TEMPLATE_COLUMNS, TEMPLATE_EXAMPLES, templateFileName } from './templates';

export interface TemplateFile {
  filename: string;
  contentType: string;
  body: Buffer;
}

const MIME: Record<ImportFormat, string> = {
  csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

/** Build a downloadable import template (API spec 7.3 / section 9). */
export function buildTemplate(kind: ImportKind, format: ImportFormat): TemplateFile {
  const rows = [TEMPLATE_COLUMNS[kind], ...TEMPLATE_EXAMPLES[kind]];
  const filename = templateFileName(kind, format);

  if (format === 'csv') {
    return { filename, contentType: MIME.csv, body: Buffer.from(csvTemplate(rows), 'utf8') };
  }
  if (format === 'docx') {
    return { filename, contentType: MIME.docx, body: docxTemplate(rows) };
  }
  return { filename, contentType: MIME.xlsx, body: xlsxTemplate(rows) };
}

function csvTemplate(rows: string[][]): string {
  return rows.map((cells) => cells.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function columnName(index: number): string {
  let name = '';
  let n = index;
  do {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return name;
}

function zip(entries: Array<{ path: string; data: string }>): Buffer {
  const encoder = new TextEncoder();
  return Buffer.from(writeZip(entries.map((entry) => ({ path: entry.path, data: encoder.encode(entry.data) }))));
}

function xlsxTemplate(rows: string[][]): Buffer {
  const sheetRows = rows
    .map((cells, rowIndex) => {
      const cellXml = cells
        .map(
          (cell, colIndex) =>
            `<c r="${columnName(colIndex)}${rowIndex + 1}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(cell)}</t></is></c>`,
        )
        .join('');
      return `<row r="${rowIndex + 1}">${cellXml}</row>`;
    })
    .join('');

  return zip([
    {
      path: '[Content_Types].xml',
      data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '</Types>',
    },
    {
      path: '_rels/.rels',
      data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>',
    },
    {
      path: 'xl/workbook.xml',
      data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<sheets><sheet name="Import" sheetId="1" r:id="rId1"/></sheets></workbook>',
    },
    {
      path: 'xl/_rels/workbook.xml.rels',
      data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '</Relationships>',
    },
    {
      path: 'xl/worksheets/sheet1.xml',
      data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        `<sheetData>${sheetRows}</sheetData></worksheet>`,
    },
  ]);
}

function docxTemplate(rows: string[][]): Buffer {
  const [headers = [], ...examples] = rows;
  const lines: string[] = ['Import template. Delete these instructions before uploading.', ''];
  lines.push(`Columns: ${headers.join(', ')}`, '');
  examples.forEach((cells, questionIndex) => {
    lines.push(`${questionIndex + 1}. ${cells[headers.indexOf('question')] ?? cells[0] ?? ''}`);
    cells.forEach((cell, index) => {
      const header = headers[index] ?? '';
      if (header.startsWith('option_') && cell) {
        lines.push(`(${header.slice(-1).toUpperCase()}) ${cell}`);
      }
    });
    lines.push('Answer: ', '');
  });

  const paragraphs = lines
    .map((line) => `<w:p><w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`)
    .join('');

  return zip([
    {
      path: '[Content_Types].xml',
      data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
        '</Types>',
    },
    {
      path: '_rels/.rels',
      data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
        '</Relationships>',
    },
    {
      path: 'word/document.xml',
      data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
        `<w:body>${paragraphs}<w:sectPr/></w:body></w:document>`,
    },
  ]);
}
