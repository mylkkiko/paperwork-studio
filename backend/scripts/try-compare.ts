/** Debug helper: compare two .docx templates and print the summary.  npx tsx scripts/try-compare.ts a.docx b.docx */
import { readFileSync } from 'node:fs';
import { extractParagraphs } from '../src/services/docx.service';
import { splitClauses } from '../src/services/clauses.service';
import { compareClauses } from '../src/services/compare.service';
import { RuleBasedSummaryGenerator } from '../src/services/summary/RuleBasedSummaryGenerator';

async function main() {
  const [a, b] = process.argv.slice(2);
  const ca = splitClauses(await extractParagraphs(readFileSync(a)));
  const cb = splitClauses(await extractParagraphs(readFileSync(b)));
  const cmp = compareClauses(ca, cb);
  console.log('counts', cmp.counts);
  for (const c of cmp.changes) if (c.status !== 'unchanged' || c.moved) console.log(c.status, c.oldNumber, '->', c.newNumber, c.moved ? '(moved)' : '');
  const gen = new RuleBasedSummaryGenerator();
  console.log((await gen.generate(cmp, 'hy')).join('\n'));
  console.log((await gen.generate(cmp, 'en')).join('\n'));
}
main();
