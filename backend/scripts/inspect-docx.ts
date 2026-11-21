/**
 * Debug helper: prints the extracted text, merge fields and a rough clause list of a .docx.
 *
 *   npm run inspect:docx -- seed/templates/student_agreement_v1.docx
 *
 * The clause regex here is only a preview; the real splitter lives in src/services (Phase 1).
 */
import mammoth from 'mammoth';

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('usage: inspect-docx <file.docx>');
  const { value: text } = await mammoth.extractRawText({ path: file });
  const paragraphs = text.split(/\n+/).map((p) => p.trim()).filter(Boolean);

  const fields = [...new Set([...text.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]))];
  const clauseNumbers = paragraphs
    .map((p) => p.match(/^(\d+(?:\.\d+)*)\.\s/)?.[1])
    .filter((n): n is string => Boolean(n));

  console.log(`File: ${file}`);
  console.log(`Paragraphs: ${paragraphs.length}`);
  console.log(`Fields (${fields.length}): ${fields.join(', ')}`);
  console.log(`Numbered clauses (${clauseNumbers.length}): ${clauseNumbers.join(' ')}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
