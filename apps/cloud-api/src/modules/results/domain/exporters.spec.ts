import { describe, expect, it } from 'vitest';
import { readZip } from '@cbt/exam-core';
import { toCsv } from './csv';
import { writePdf } from './pdf';
import { columnName, writeXlsx } from './xlsx';

describe('report encoders', () => {
  it('writes a valid xlsx workbook as a stored ZIP', () => {
    const bytes = writeXlsx({
      name: 'Results',
      rows: [
        ['Student', 'Percent'],
        ['Tunde Bello', 88.5],
      ],
    });
    const entries = readZip(bytes);
    const paths = entries.map((entry) => entry.path);
    expect(paths).toContain('[Content_Types].xml');
    expect(paths).toContain('xl/workbook.xml');
    expect(paths).toContain('xl/worksheets/sheet1.xml');

    const sheet = new TextDecoder().decode(
      entries.find((entry) => entry.path === 'xl/worksheets/sheet1.xml')!.data,
    );
    expect(sheet).toContain('<t xml:space="preserve">Tunde Bello</t>');
    expect(sheet).toContain('<v>88.5</v>');
    expect(sheet).toContain('r="A1"');
    expect(sheet).toContain('r="B2"');
  });

  it('names spreadsheet columns beyond Z', () => {
    expect(columnName(0)).toBe('A');
    expect(columnName(25)).toBe('Z');
    expect(columnName(26)).toBe('AA');
    expect(columnName(27)).toBe('AB');
  });

  it('writes a PDF with a header, xref and page objects', () => {
    const bytes = writePdf({ title: 'Class results', lines: ['Hello (world)'] });
    const text = Buffer.from(bytes).toString('latin1');
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text).toContain('/Type /Catalog');
    expect(text).toContain('(Hello \\(world\\)) Tj');
    expect(text).toContain('xref');
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
  });

  it('paginates a long PDF', () => {
    const lines = Array.from({ length: 120 }, (_, index) => `Line ${index}`);
    const text = Buffer.from(writePdf({ lines })).toString('latin1');
    expect(text).toContain('/Count 3');
  });

  it('renders CSV with quoting', () => {
    expect(
      toCsv([
        ['Student', 'Remark'],
        ['Ada, Obi', 'Said "well done"'],
      ]),
    ).toBe('Student,Remark\r\n"Ada, Obi","Said ""well done"""\r\n');
  });
});
