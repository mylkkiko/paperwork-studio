/**
 * Test fixture generator: a template whose clauses use Word AUTOMATIC numbering (w:numPr) instead of typed
 * numbers. Uploading it must produce the CLAUSES_NOT_DETECTED warning.   npx tsx scripts/make-autonumbered-docx.ts out.docx
 */
import { writeFileSync } from 'node:fs';
import { AlignmentType, Document, LevelFormat, Packer, Paragraph, TextRun } from 'docx';

export async function autoNumberedDocx(): Promise<Buffer> {
  const doc = new Document({
    numbering: { config: [{ reference: 'clauses', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.START }] }] },
    sections: [
      {
        children: [
          new Paragraph({ children: [new TextRun('ՊԱՅՄԱՆԱԳԻՐ № {{document.number}}')] }),
          new Paragraph({ numbering: { reference: 'clauses', level: 0 }, children: [new TextRun('Ուսանող՝ {{student.full_name}}')] }),
          new Paragraph({ numbering: { reference: 'clauses', level: 0 }, children: [new TextRun('Վճարումը՝ 10 օրվա ընթացքում։')] }),
          new Paragraph({ children: [new TextRun('{{signature.checkbox}}')] }),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}

if (require.main === module) autoNumberedDocx().then((b) => writeFileSync(process.argv[2] ?? 'autonumbered.docx', b));
