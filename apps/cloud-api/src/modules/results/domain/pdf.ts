/**
 * A tiny, dependency-free PDF writer for result reports.
 *
 * PDF is a line-oriented format of numbered objects and an xref table, so a
 * single-font, text-only document needs only a catalog, a page tree, a font and
 * one content stream per page. Non-ASCII characters are transliterated to `?`
 * because the built-in Helvetica font uses the WinAnsi/Latin-1 subset here.
 */
export interface PdfInput {
  title?: string;
  lines: string[];
}

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const FONT_SIZE = 11;
const LEADING = 16;
const LINES_PER_PAGE = Math.floor((PAGE_HEIGHT - MARGIN * 2) / LEADING);

export function writePdf(input: PdfInput): Uint8Array {
  const lines = input.lines.length > 0 ? input.lines : [''];
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += LINES_PER_PAGE) {
    pages.push(lines.slice(i, i + LINES_PER_PAGE));
  }

  const chunks: Buffer[] = [];
  let length = 0;
  const push = (value: string): void => {
    const bytes = Buffer.from(value, 'latin1');
    chunks.push(bytes);
    length += bytes.length;
  };

  const offsets: number[] = [];
  const startObject = (id: number): void => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
  };

  push('%PDF-1.4\n');

  startObject(1);
  push('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  startObject(2);
  const kids = pages.map((_, index) => `${4 + index * 2} 0 R`).join(' ');
  push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>\nendobj\n`);

  startObject(3);
  push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n');

  pages.forEach((pageLines, index) => {
    const pageId = 4 + index * 2;
    const contentId = pageId + 1;
    const content = pageContent(pageLines);
    startObject(pageId);
    push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
        `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`,
    );
    startObject(contentId);
    push(`<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream\nendobj\n`);
  });

  const objectCount = 3 + pages.length * 2 + 1;
  const xrefOffset = length;
  push(`xref\n0 ${objectCount}\n`);
  push('0000000000 65535 f\r\n');
  for (let id = 1; id < objectCount; id += 1) {
    push(`${String(offsets[id] ?? 0).padStart(10, '0')} 00000 n\r\n`);
  }
  push(`trailer\n<< /Size ${objectCount} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  return Buffer.concat(chunks);
}

function pageContent(lines: string[]): string {
  const startY = PAGE_HEIGHT - MARGIN;
  const parts = [
    'BT',
    `/F1 ${FONT_SIZE} Tf`,
    `${LEADING} TL`,
    `${MARGIN} ${startY.toFixed(2)} Td`,
  ];
  lines.forEach((line, index) => {
    parts.push(`(${escapePdf(line)}) Tj`);
    if (index < lines.length - 1) parts.push('T*');
  });
  parts.push('ET');
  return parts.join('\n');
}

function escapePdf(value: string): string {
  return value
    .replace(/[^\x20-\x7E]/g, '?')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}
