/**
 * PDF text extraction for assertions.
 * LibreOffice writes Armenian, Latin and digits as separate text runs, and pdf.js returns them out of reading order.
 * Lines are therefore rebuilt from glyph POSITIONS: group items by y (±2pt), sort by x, add a space at visible gaps.
 * The work happens in pdf-lines.mjs (child process), because pdfjs-dist is ESM-only.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function pdfLines(pdf: Buffer): string[] {
  const file = join(mkdtempSync(join(tmpdir(), 'ps-pdf-')), 'doc.pdf');
  writeFileSync(file, pdf);
  const out = execFileSync(process.execPath, [join(__dirname, 'pdf-lines.mjs'), file], { cwd: join(__dirname, '..', '..') });
  return JSON.parse(out.toString('utf8'));
}

export const pdfText = (pdf: Buffer) => pdfLines(pdf).join('\n');

/** Embedded font names, e.g. ["DejaVuSans", "NotoSerifArmenian-Regular"]. */
export function pdfFonts(pdf: Buffer): string[] {
  const names = pdf.toString('latin1').match(/\/BaseFont\s*\/[A-Z]{6}\+[A-Za-z0-9-]+/g) ?? [];
  return [...new Set(names.map((n) => n.split('+')[1]))].sort();
}
