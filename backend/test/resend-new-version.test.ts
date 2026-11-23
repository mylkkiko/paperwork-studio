/**
 * S-6 (product owner addition #3): recipients who signed an older version get a document from the NEW version.
 * Manual values (amount, contract date) carry over from their signed document; Core Engine data is read fresh;
 * the new document is linked to the new template version; the email contains the change summary.
 */
import { prisma } from '../src/lib/prisma';
import { NBSP } from '../src/services/formatters';
import { docxText, seedFile } from './helpers/docx';
import { createTestContext, GROUP, resetDb, tokenFromMail, type TestContext } from './helpers/context';

let ctx: TestContext;
let templateId: string;
let v1: string;
let v2: string;
let docs: Awaited<ReturnType<TestContext['generate']>>['docs'];

beforeAll(async () => {
  await resetDb();
  ctx = await createTestContext();
  await ctx.seedBase();
  ({ templateId, versionId: v1 } = await ctx.createTemplate('student_agreement_v1.docx'));
  // v1 pack for 4 students with an amount agreed at the time
  ({ docs } = await ctx.generate({
    templateId,
    recipientType: 'student',
    groupId: GROUP,
    recipientIds: ['stu-001', 'stu-002', 'stu-003', 'stu-004'],
    commonValues: { 'contract.date': '2026-11-21', 'contract.amount': 450000 },
    overrides: { 'stu-002': { 'contract.amount': 400000 } }, // a discount for one student
  }));
  const tokens = await ctx.send(docs.map((d) => d.id));
  await ctx.paperSign(docs[0].id, { file: Buffer.from([0xff, 0xd8, 0xff, 0xe0]), name: 's.jpg' }); // stu-001 hands in paper (JPG scan)
  await ctx.api.post(`/api/documents/${docs[1].id}/paper-signature`).set(ctx.auth('coordinator')).attach('file', Buffer.from('%PDF-1.4'), 's.pdf'); // stu-002 on paper
  await ctx.api.post(`/api/sign/${tokens[docs[2].id]}/decline`).send({}); // stu-003 declines; stu-004 never signs

  const up = await ctx.api.post(`/api/templates/${templateId}/versions`).set(ctx.auth('editor')).attach('file', seedFile('student_agreement_v2.docx'), 'v2.docx');
  v2 = up.body.version.id;
  await ctx.api.post(`/api/templates/${templateId}/versions/${v2}/publish`).set(ctx.auth('editor'));

  // Core Engine data changes after the old documents were signed
  ctx.dataset.students[0].address = 'ք. Երևան, Սայաթ-Նովայի պող. 1, բն. 1';
  ctx.dataset.students[1].phone = '+374 99 000 000';
});

describe('resend new version (S-6)', () => {
  it('the "signed an older version" filter finds exactly the two signers', async () => {
    const res = await ctx.api.get(`/api/signatures/table?templateId=${templateId}&olderVersion=true`).set(ctx.auth('coordinator'));
    expect(res.body.items.map((r: { recipientId: string; versionNumber: number; signatureMethod: string }) => [r.recipientId, r.versionNumber, r.signatureMethod])).toEqual([
      ['stu-001', 1, 'paper'],
      ['stu-002', 1, 'paper'],
    ]);
  });

  let newDocs: typeof docs;

  it('one action generates new documents for them and emails them automatically', async () => {
    const mailsBefore = ctx.mailer.sent.length;
    const res = await ctx.api.post('/api/documents/resend-new-version').set(ctx.auth('coordinator')).send({ templateId });
    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ recipients: 2, batches: [expect.objectContaining({ templateVersionId: v2, groupId: GROUP, sendOnComplete: 'newVersion' })] });
    await ctx.queue.idle();

    newDocs = await prisma.document.findMany({ where: { batchId: res.body.batches[0].id }, orderBy: { recipientId: 'asc' } });
    expect(newDocs.map((d) => d.recipientId)).toEqual(['stu-001', 'stu-002']);
    expect(newDocs.every((d) => d.status === 'sent')).toBe(true);

    const mails = ctx.mailer.sent.slice(mailsBefore);
    expect(mails.map((m) => m.to).sort()).toEqual(['anna.hakobyan@student.academy.am', 'davit.grigoryan@student.academy.am']);
  });

  it('new documents are linked to the new template version and get new numbers', () => {
    expect(newDocs.every((d) => d.templateVersionId === v2)).toBe(true);
    expect(newDocs.map((d) => d.number)).not.toEqual(expect.arrayContaining(docs.map((d) => d.number)));
  });

  it('manual values carry over from each signed document (including the per-student discount)', () => {
    const snap = (i: number) => newDocs[i].dataSnapshot as Record<string, string>;
    expect(snap(0)['contract.amount']).toBe(`450${NBSP}000${NBSP}֏`);
    expect(snap(1)['contract.amount']).toBe(`400${NBSP}000${NBSP}֏`);
    expect(snap(0)['contract.date']).toBe('21 նոյեմբերի 2026 թ.');
  });

  it('Core Engine data is read fresh', () => {
    expect((newDocs[0].dataSnapshot as Record<string, string>)['student.address']).toBe('ք. Երևան, Սայաթ-Նովայի պող. 1, բն. 1');
    expect((newDocs[1].dataSnapshot as Record<string, string>)['student.phone']).toBe('+374 99 000 000');
    // ...while the old signed documents keep what they were signed with
    expect((docs[0].dataSnapshot as Record<string, string>)['student.address']).toBe('ք. Երևան, Կոմիտասի պող. 15, բն. 8');
  });

  it('the generated file is the v2 text', async () => {
    const text = await docxText(await ctx.deps.storage.get(newDocs[0].docxPath));
    expect(text).toContain('5 աշխատանքային օրվա');
    expect(text).toContain('6.2.');
    expect(text).not.toContain('3.2.');
  });

  it('the email has the change summary and a working link to the new document', async () => {
    const mail = ctx.mailer.sent.find((m) => m.to === 'anna.hakobyan@student.academy.am' && m.subject.startsWith('Թարմացված'))!;
    expect(mail.subject).toBe(`Թարմացված փաստաթուղթ՝ Ուսուցման պայմանագիր № ${newDocs[0].number}`);
    expect(mail.text).toContain('• Կետ 3.2-ը հանվել է\n• Կետ 4.2․ վճարման ժամկետը փոխվել է՝ 10 → 5 օր\n• Կետ 6.2-ն ավելացվել է');
    const view = await ctx.api.get(`/api/sign/${tokenFromMail(mail.text)}`);
    expect(view.body).toMatchObject({ documentNumber: newDocs[0].number, versionNumber: 2 });
  });

  it('old signed documents stay untouched', async () => {
    const old = await prisma.document.findMany({ where: { id: { in: [docs[0].id, docs[1].id] } }, orderBy: { recipientId: 'asc' } });
    expect(old.map((d) => [d.status, d.templateVersionId])).toEqual([
      ['signed', v1],
      ['signed', v1],
    ]);
  });

  it('declined and never-signed recipients are not included, and nobody is resent twice', async () => {
    const res = await ctx.api.post('/api/documents/resend-new-version').set(ctx.auth('coordinator')).send({ templateId });
    expect(res.body).toEqual({ batches: [], recipients: 0 });
    const filter = await ctx.api.get(`/api/signatures/table?templateId=${templateId}&olderVersion=true`).set(ctx.auth('coordinator'));
    expect(filter.body.items).toEqual([]);
  });

  it('uses an edited summary when the editor changed it', async () => {
    // v3 with an edited summary; stu-001 signs v2, then v3 is published and resent
    const newV2Doc = newDocs[0];
    await ctx.paperSign(newV2Doc.id);
    const up = await ctx.api.post(`/api/templates/${templateId}/versions`).set(ctx.auth('editor')).attach('file', seedFile('student_agreement_v1.docx'), 'v3.docx');
    await ctx.api.patch(`/api/templates/${templateId}/versions/${up.body.version.id}`).set(ctx.auth('editor')).send({ changeSummary: 'Վճարման ժամկետը վերադարձվել է 10 օրի։' });
    await ctx.api.post(`/api/templates/${templateId}/versions/${up.body.version.id}/publish`).set(ctx.auth('editor'));

    const res = await ctx.api.post('/api/documents/resend-new-version').set(ctx.auth('coordinator')).send({ templateId, documentIds: [newV2Doc.id] });
    expect(res.body.recipients).toBe(1);
    await ctx.queue.idle();
    expect(ctx.mailer.sent.at(-1)!.text).toContain('• Վճարման ժամկետը վերադարձվել է 10 օրի։');
  });

  it('summary is computed between the signed version and the new one when versions were skipped', async () => {
    // stu-002 signed v1 on paper and never got v3; their summary must compare v1 -> v3 (no changes in text)
    const res = await ctx.api.post('/api/documents/resend-new-version').set(ctx.auth('coordinator')).send({ templateId });
    await ctx.queue.idle();
    expect(res.body.recipients).toBe(1);
    const mail = ctx.mailer.sent.at(-1)!;
    expect(mail.to).toBe('davit.grigoryan@student.academy.am');
    expect(mail.text).toContain('• Փոփոխություններ չկան');
  });

  it('requires a published version', async () => {
    const t = await ctx.createTemplate('termination_act_v1.docx', { publish: false });
    const res = await ctx.api.post('/api/documents/resend-new-version').set(ctx.auth('coordinator')).send({ templateId: t.templateId });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VERSION_NOT_PUBLISHED');
  });
});
