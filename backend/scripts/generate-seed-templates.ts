/**
 * Generates the Armenian seed templates as real .docx files.
 *
 *   npm run seed:templates
 *
 * Output: backend/seed/templates/*.docx (committed, but always reproducible from this script).
 *
 * Conventions used by every template (the rest of the system relies on them):
 *  - Merge fields use `{{key}}` delimiters, e.g. `{{student.full_name}}`.
 *    Each field is written inside a single Word run here; fields split across runs
 *    are a separate concern covered by tests in Phase 2.
 *  - Clause numbers are LITERAL text at the start of a paragraph ("4.2. ..."),
 *    not Word auto-numbering. Auto-numbering is invisible to text extraction
 *    (mammoth), so clause splitting would fail on it.
 *  - Every template contains `{{signature.checkbox}}` on its own paragraph.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { AlignmentType, Document, Packer, Paragraph, TextRun } from 'docx';

const OUT_DIR = join(__dirname, '..', 'seed', 'templates');
const FONT = 'Noto Serif Armenian';

/** One paragraph of a template. `heading` = bold top-level clause line. */
type Block =
  | { kind: 'title'; text: string }
  | { kind: 'right'; text: string }
  | { kind: 'heading'; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'blank' };

function toParagraph(b: Block): Paragraph {
  switch (b.kind) {
    case 'title':
      return new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 240 },
        children: [new TextRun({ text: b.text, bold: true, size: 28 })],
      });
    case 'right':
      return new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun(b.text)] });
    case 'heading':
      return new Paragraph({ spacing: { before: 200, after: 80 }, children: [new TextRun({ text: b.text, bold: true })] });
    case 'p':
      return new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 80 }, children: [new TextRun(b.text)] });
    case 'blank':
      return new Paragraph({ children: [] });
  }
}

async function writeDocx(fileName: string, title: string, blocks: Block[]) {
  const doc = new Document({
    creator: 'Paperwork Studio',
    title,
    styles: { default: { document: { run: { font: FONT, size: 24 } } } }, // 12pt
    sections: [{ children: blocks.map(toParagraph) }],
  });
  const buf = await Packer.toBuffer(doc);
  writeFileSync(join(OUT_DIR, fileName), buf);
  console.log(`  ✓ ${fileName}`);
}

// ---------------------------------------------------------------------------
// Student agreement — v1 and v2 share most clauses. v2 differences (comparison demo):
//   4.2  changed  — payment term 10 → 5 days
//   3.2  removed
//   6.2  added
// ---------------------------------------------------------------------------
function studentAgreement(version: 1 | 2): Block[] {
  const blocks: Block[] = [
    { kind: 'title', text: 'ՈՒՍՈՒՑՄԱՆ ՊԱՅՄԱՆԱԳԻՐ № {{document.number}}' },
    { kind: 'right', text: 'ք. Երևան, {{contract.date}}' },
    { kind: 'blank' },
    {
      kind: 'p',
      text:
        '«{{academy.name}}»-ը (այսուհետ՝ Ակադեմիա), ի դեմս տնօրեն {{academy.director}}, մի կողմից, ' +
        'և քաղաքացի {{student.full_name}} (անձնագիր՝ {{student.passport}}, հասցե՝ {{student.address}}, ' +
        'հեռ.՝ {{student.phone}}) (այսուհետ՝ Ուսանող), մյուս կողմից, կնքեցին սույն պայմանագիրը հետևյալի մասին․',
    },

    { kind: 'heading', text: '1. Պայմանագրի առարկան' },
    { kind: 'p', text: '1.1. Ակադեմիան պարտավորվում է Ուսանողին ուսուցանել «{{group.course_name}}» դասընթացով՝ {{group.name}} խմբի կազմում։' },
    { kind: 'p', text: '1.2. Ուսուցման սկիզբը՝ {{group.start_date}}, ավարտը՝ {{group.end_date}}։' },

    { kind: 'heading', text: '2. Ակադեմիայի պարտավորությունները' },
    { kind: 'p', text: '2.1. Ապահովել որակյալ դասավանդում և անհրաժեշտ ուսումնական նյութեր։' },
    { kind: 'p', text: '2.2. Ավարտական աշխատանքը հաջողությամբ հանձնելու դեպքում Ուսանողին տրամադրել հավաստագիր։' },

    { kind: 'heading', text: '3. Ուսանողի պարտավորությունները' },
    { kind: 'p', text: '3.1. Հաճախել դասերին և ժամանակին կատարել տնային առաջադրանքները։' },
  ];
  if (version === 1) {
    blocks.push({ kind: 'p', text: '3.2. Պահպանել Ակադեմիայի ներքին կարգապահական կանոնները և խնամքով վերաբերվել գույքին։' });
  }
  blocks.push(
    { kind: 'heading', text: '4. Վճարման պայմանները' },
    { kind: 'p', text: '4.1. Ուսուցման ընդհանուր արժեքը կազմում է {{contract.amount}}։' },
    {
      kind: 'p',
      text: `4.2. Վճարումը կատարվում է պայմանագիրը կնքելուց հետո ${version === 1 ? 10 : 5} աշխատանքային օրվա ընթացքում։`,
    },
    { kind: 'p', text: '4.3. Վճարման ուշացման դեպքում Ակադեմիան իրավունք ունի կասեցնել Ուսանողի մասնակցությունը դասերին։' },

    { kind: 'heading', text: '5. Պայմանագրի լուծումը' },
    { kind: 'p', text: '5.1. Կողմերից յուրաքանչյուրը կարող է լուծել պայմանագիրը՝ մյուս կողմին գրավոր ծանուցելով առնվազն 7 օր առաջ։' },

    { kind: 'heading', text: '6. Գաղտնիություն' },
    { kind: 'p', text: '6.1. Ակադեմիան պարտավորվում է չհրապարակել Ուսանողի անձնական տվյալները՝ բացառությամբ օրենքով նախատեսված դեպքերի։' },
  );
  if (version === 2) {
    blocks.push({
      kind: 'p',
      text: '6.2. Ուսանողը համաձայնում է, որ դասերի ընթացքում արված լուսանկարները կարող են օգտագործվել Ակադեմիայի կայքում՝ առանց անձնական տվյալների նշման։',
    });
  }
  blocks.push(
    { kind: 'heading', text: '7. Եզրափակիչ դրույթներ' },
    { kind: 'p', text: '7.1. Պայմանագիրն ուժի մեջ է մտնում ստորագրման պահից և գործում է մինչև կողմերի պարտավորությունների ամբողջական կատարումը։' },
    { kind: 'p', text: '7.2. Վեճերը լուծվում են բանակցությունների միջոցով, իսկ համաձայնության չգալու դեպքում՝ ՀՀ օրենսդրությամբ սահմանված կարգով։' },

    { kind: 'heading', text: '8. Կողմերի ստորագրությունները' },
    { kind: 'p', text: 'Ակադեմիա՝ «{{academy.name}}», տնօրեն {{academy.director}}  ____________' },
    { kind: 'p', text: 'Ուսանող՝ {{student.full_name}}' },
    { kind: 'p', text: '{{signature.checkbox}}' },
  );
  return blocks;
}

const terminationAct: Block[] = [
  { kind: 'title', text: 'ԱԿՏ № {{document.number}}' },
  { kind: 'title', text: 'ուսուցման պայմանագրի լուծման մասին' },
  { kind: 'right', text: 'ք. Երևան, {{document.date}}' },
  { kind: 'blank' },
  {
    kind: 'p',
    text: '«{{academy.name}}»-ը (այսուհետ՝ Ակադեմիա), ի դեմս տնօրեն {{academy.director}}, և քաղաքացի {{student.full_name}} (այսուհետ՝ Ուսանող) կազմեցին սույն ակտը հետևյալի մասին․',
  },
  { kind: 'p', text: '1. Կողմերը համաձայնեցին լուծել {{termination.contract_date}} կնքված ուսուցման պայմանագիրը ({{group.name}} խումբ)։' },
  { kind: 'p', text: '2. Պայմանագիրը համարվում է լուծված {{termination.date}}։' },
  { kind: 'p', text: '3. Լուծման հիմքը՝ {{termination.reason}}։' },
  { kind: 'p', text: '4. Ուսանողին վերադարձման ենթակա գումարը կազմում է {{termination.refund_amount}}։' },
  { kind: 'p', text: '5. Կողմերը միմյանց նկատմամբ այլ ֆինանսական կամ իրավական պահանջներ չունեն։' },
  { kind: 'blank' },
  { kind: 'p', text: 'Ակադեմիա՝ տնօրեն {{academy.director}}  ____________' },
  { kind: 'p', text: 'Ուսանող՝ {{student.full_name}}' },
  { kind: 'p', text: '{{signature.checkbox}}' },
];

// A letter, intentionally without numbered clauses: the whole body becomes the "preamble" clause.
const enrollmentLetter: Block[] = [
  { kind: 'right', text: '№ {{document.number}}' },
  { kind: 'right', text: '{{document.date}}' },
  { kind: 'blank' },
  { kind: 'title', text: 'ԸՆԴՈՒՆԵԼՈՒԹՅԱՆ ԾԱՆՈՒՑՈՒՄ' },
  { kind: 'p', text: 'Հարգելի {{student.full_name}},' },
  {
    kind: 'p',
    text: 'Ուրախ ենք տեղեկացնել, որ Դուք ընդունվել եք «{{academy.name}}»-ի «{{group.course_name}}» դասընթացին և ընդգրկվել {{group.name}} խմբում։',
  },
  { kind: 'p', text: 'Դասընթացի սկիզբը՝ {{group.start_date}}, ավարտը՝ {{group.end_date}}։ Դասացուցակը՝ {{group.schedule}}։' },
  { kind: 'p', text: 'Դասերն անցկացվում են հետևյալ հասցեով՝ {{academy.address}}։' },
  { kind: 'p', text: 'Խնդրում ենք ստորագրել սույն ծանուցումը՝ հաստատելով դրա ստացումը։' },
  { kind: 'blank' },
  { kind: 'p', text: 'Հարգանքով՝ {{academy.director}}, տնօրեն' },
  { kind: 'blank' },
  { kind: 'p', text: 'Ստացա՝ {{student.full_name}}' },
  { kind: 'p', text: '{{signature.checkbox}}' },
];

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  console.log(`Writing seed templates to ${OUT_DIR}`);
  await writeDocx('student_agreement_v1.docx', 'Ուսուցման պայմանագիր', studentAgreement(1));
  await writeDocx('student_agreement_v2.docx', 'Ուսուցման պայմանագիր', studentAgreement(2));
  await writeDocx('termination_act_v1.docx', 'Պայմանագրի լուծման ակտ', terminationAct);
  await writeDocx('enrollment_letter_v1.docx', 'Ընդունելության ծանուցում', enrollmentLetter);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
