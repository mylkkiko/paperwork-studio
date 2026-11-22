// Child-process helper for pdf-text.ts: pdfjs-dist is ESM-only and awkward to load inside Jest's CommonJS sandbox.
// Usage: node pdf-lines.mjs <file.pdf>   -> prints JSON array of lines (see pdf-text.ts for the algorithm).
import { readFileSync } from 'node:fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const doc = await getDocument({ data: new Uint8Array(readFileSync(process.argv[2])), verbosity: 0 }).promise;
const lines = [];
for (let i = 1; i <= doc.numPages; i++) {
  const content = await (await doc.getPage(i)).getTextContent();
  const items = content.items
    .filter((it) => it.str)
    .map((it) => ({ s: it.str, x: it.transform[4], y: Math.round(it.transform[5]), w: it.width }));
  const rows = new Map();
  for (const it of items) {
    const key = [...rows.keys()].find((y) => Math.abs(y - it.y) <= 2) ?? it.y;
    rows.set(key, [...(rows.get(key) ?? []), it]);
  }
  for (const y of [...rows.keys()].sort((a, b) => b - a)) {
    let line = '';
    let end = null;
    for (const it of rows.get(y).sort((a, b) => a.x - b.x)) {
      if (end !== null && it.x - end > 1.5 && !line.endsWith(' ') && !it.s.startsWith(' ')) line += ' ';
      line += it.s;
      end = it.x + it.w;
    }
    lines.push(line.replace(/[\s ]+/g, ' ').trim());
  }
}
process.stdout.write(JSON.stringify(lines));
