/** Builders for .docx fixtures used across tests. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import PizZip from 'pizzip';
import mammoth from 'mammoth';
import { Document, Packer, Paragraph, TextRun } from 'docx';

export const SEED_DIR = join(__dirname, '..', '..', 'seed', 'templates');
export const seedFile = (name: string) => readFileSync(join(SEED_DIR, name));

/** A simple template: one paragraph per string, each in a single run. */
export async function buildDocx(paragraphs: string[]): Promise<Buffer> {
  const doc = new Document({ sections: [{ children: paragraphs.map((p) => new Paragraph({ children: [new TextRun(p)] })) }] });
  return Packer.toBuffer(doc);
}

/** Replace word/document.xml of a docx through a function (to craft split runs, broken tags, ...). */
export function patchXml(docx: Buffer, fn: (xml: string) => string): Buffer {
  const zip = new PizZip(docx);
  const xml = zip.file('word/document.xml')!.asText();
  const next = fn(xml);
  if (next === xml) throw new Error('patchXml: nothing changed');
  zip.file('word/document.xml', next);
  return zip.generate({ type: 'nodebuffer' });
}

/**
 * A docx in which `{{student.full_name}}` is stored as THREE runs with different formatting, the way Word saves it
 * after spell-check or partial bold: `{{stu` | `dent.full` (bold) | `_name}}`.
 */
export async function splitRunDocx(): Promise<Buffer> {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            children: [
              new TextRun('Ուսանող՝ {{stu'),
              new TextRun({ text: 'dent.full', bold: true }),
              new TextRun({ text: '_name}}', italics: true }),
              new TextRun(', խումբ՝ {{group.name}}'),
            ],
          }),
          new Paragraph({ children: [new TextRun('{{signature.checkbox}}')] }),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}

/** Raw run structure check: proves the fixture really is split in the XML. */
export function documentXml(docx: Buffer) {
  return new PizZip(docx).file('word/document.xml')!.asText();
}

export async function docxText(docx: Buffer) {
  return (await mammoth.extractRawText({ buffer: docx })).value;
}

/**
 * Renumbering fixture (requested by the product owner):
 *   v1: 3.1, 3.2 (A), 3.3 (B), 3.4 (C)
 *   v2: 3.1, 3.2 (B — old 3.3, same text), 3.3 (C — old 3.4, same text)
 * Expected: 3.2 removed; old 3.3 → 3.2 unchanged+moved; old 3.4 → 3.3 unchanged+moved; nothing added.
 */
export const RENUMBER_V1 = [
  'ՊԱՅՄԱՆԱԳԻՐ № {{document.number}}',
  '3. Ուսանողի պարտավորությունները',
  '3.1. Հաճախել դասերին և կատարել տնային առաջադրանքները։',
  '3.2. Պահպանել Ակադեմիայի ներքին կարգապահական կանոնները։',
  '3.3. Վճարել ուսման վարձը պայմանագրով սահմանված ժամկետում։',
  '3.4. Չխանգարել այլ ուսանողներին դասերի ընթացքում։',
  '{{signature.checkbox}}',
];
export const RENUMBER_V2 = [
  'ՊԱՅՄԱՆԱԳԻՐ № {{document.number}}',
  '3. Ուսանողի պարտավորությունները',
  '3.1. Հաճախել դասերին և կատարել տնային առաջադրանքները։',
  '3.2. Վճարել ուսման վարձը պայմանագրով սահմանված ժամկետում։',
  '3.3. Չխանգարել այլ ուսանողներին դասերի ընթացքում։',
  '{{signature.checkbox}}',
];
