/**
 * Armenian rendering against the REAL Gotenberg (LibreOffice) service: requires `docker compose up -d gotenberg`.
 * Text is extracted from the generated PDFs and compared with what must be printed.
 */
import { PDFDocument } from 'pdf-lib';
import { config } from '../src/config';
import { prisma } from '../src/lib/prisma';
import { pdfFonts, pdfLines } from './helpers/pdf-text';
import { createTestContext, GROUP, READY_VALUES, resetDb, type TestContext } from './helpers/context';

let ctx: TestContext;
let templateId: string;

beforeAll(async () => {
  const ok = await fetch(`${config.GOTENBERG_URL}/health`).then((r) => r.ok).catch(() => false);
  if (!ok) throw new Error(`Gotenberg is not reachable at ${config.GOTENBERG_URL}. Start it: docker compose up -d gotenberg`);
  await resetDb();
  ctx = await createTestContext({ realPdf: true });
  await ctx.seedBase();
  ({ templateId } = await ctx.createTemplate('student_agreement_v1.docx'));
});

describe('Armenian PDF rendering (real Gotenberg)', () => {
  let doc: Awaited<ReturnType<TestContext['generate']>>['docs'][number];
  let lines: string[];

  beforeAll(async () => {
    const { docs } = await ctx.generate({ templateId, recipientType: 'student', groupId: GROUP, recipientIds: ['stu-001'], ...READY_VALUES });
    doc = docs[0];
    lines = pdfLines(await ctx.deps.storage.get(doc.pdfPath));
  });

  /**
   * pdf.js reports punctuation positions slightly off where Armenian and Latin fonts mix ("ք Երևան. ," for
   * "ք. Երևան,"), although the page renders correctly. Compare words and digits only: punctuation removed,
   * whitespace collapsed. Spaced-out digits (the broken emoji-font fallback) would still fail these checks.
   */
  const norm = (l: string) => l.replace(/[.,։՝«»()\-․:]/g, ' ').replace(/\s+/g, ' ').trim();
  const has = (re: RegExp) => {
    if (!lines.some((l) => re.test(norm(l)))) throw new Error(`No line matches ${re}\n${lines.map(norm).join('\n')}`);
  };

  it('prints Armenian text', () => {
    has(/^ՈՒՍՈՒՑՄԱՆ ՊԱՅՄԱՆԱԳԻՐ №/);
    has(/^Թվային հմտությունների ակադեմիա ը այսուհետ Ակադեմիա/);
    has(/^Ուսանող Աննա Հակոբյան$/);
    has(/^4 2 Վճարումը կատարվում է պայմանագիրը կնքելուց հետո 10 աշխատանքային/);
  });

  it('prints dates in Armenian with genitive month names', () => {
    has(/^ք Երևան 21 նոյեմբերի 2026 թ$/);
    has(/սկիզբը 1 դեկտեմբերի 2026 թ ավարտը 31 մայիսի 2027 թ/);
  });

  it('prints the amount in AMD', () => {
    has(/կազմում է 450 000 ֏$/);
  });

  it('prints digits and Latin as normal text (no emoji-font fallback)', () => {
    has(/անձնագիր AN1235291 հասցե/); // digits stay together (the broken fallback spaced them out)
    has(/^91 107 213 այսուհետ Ուսանող/);
    const compact = lines.join('').replace(/[\s-]/g, '');
    expect(compact).toContain(doc.number.replace(/-/g, '')); // PS-2026-000001
  });

  it('prints the empty checkbox with the signature line', () => {
    expect(lines).toContainEqual(expect.stringMatching(/^☐ Ստորագրություն՝ _+$/));
  });

  it('embeds the Armenian document font, Noto Serif for digits and DejaVu Sans for the checkbox', async () => {
    const fonts = pdfFonts(await ctx.deps.storage.get(doc.pdfPath));
    expect(fonts).toEqual(expect.arrayContaining(['NotoSerifArmenian-Regular', 'NotoSerif-Regular', 'DejaVuSans']));
  });

});

describe('performance: 24-document pack with real conversion', () => {
  it('generates 24 PDFs + ZIP + merged PDF well within 2 minutes', async () => {
    const started = Date.now();
    const { batchId, docs } = await ctx.generate({ templateId, recipientType: 'student', groupId: GROUP, ...READY_VALUES });
    const seconds = (Date.now() - started) / 1000;
    expect(docs).toHaveLength(24);
    expect(seconds).toBeLessThan(120);
    const batch = await prisma.generationBatch.findUniqueOrThrow({ where: { id: batchId } });
    const merged = await PDFDocument.load(await ctx.deps.storage.get(batch.mergedPdfPath!));
    expect(merged.getPageCount()).toBe(48); // 2 pages per agreement
    // every document in the pack has its own recipient's name
    const names = new Set(docs.map((d) => d.recipientName));
    expect(names.size).toBe(24);
    console.log(`24-document pack generated in ${seconds.toFixed(1)} s`);
  }, 180_000);
});
