import { describe, expect, it } from 'vitest';
import {
  docxQuestionsToRecords,
  parseCsv,
  parseDocxParagraphs,
  parseXlsx,
  toTable,
} from './formats';
import { buildTemplate } from './template-files';

describe('parseCsv', () => {
  it('handles quotes, commas and blank lines', () => {
    const rows = parseCsv('a,b\r\n"x, y",2\n\n"he said ""hi""",3\n');
    expect(rows).toEqual([
      ['a', 'b'],
      ['x, y', '2'],
      ['he said "hi"', '3'],
    ]);
  });

  it('normalises headers into a table', () => {
    const table = toTable(parseCsv('First Name,Last Name\nAda,Obi\n'));
    expect(table.headers).toEqual(['first_name', 'last_name']);
    expect(table.rows).toEqual([{ first_name: 'Ada', last_name: 'Obi' }]);
  });
});

describe('templates round-trip through their parsers', () => {
  it('an xlsx questions template reads back with the same headers', () => {
    const template = buildTemplate('questions', 'xlsx');
    const table = toTable(parseXlsx(template.body));
    expect(table.headers).toContain('question');
    expect(table.headers).toContain('correct');
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0]!.question).toContain('2^3');
  });

  it('a docx questions template parses into question records', () => {
    const template = buildTemplate('questions', 'docx');
    const records = docxQuestionsToRecords(parseDocxParagraphs(template.body));
    expect(records.length).toBeGreaterThan(0);
    expect(records[0]!.question).toContain('2^3');
    expect(records[0]!.option_a).toBe('6');
  });

  it('students and csv templates expose their columns', () => {
    expect(toTable(parseCsv(buildTemplate('students', 'csv').body.toString('utf8'))).headers).toEqual([
      'admission_no',
      'first_name',
      'last_name',
      'other_names',
      'gender',
      'date_of_birth',
      'class',
    ]);
  });
});
