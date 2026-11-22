import AdmZip from 'adm-zip';
import { PDFDocument } from 'pdf-lib';
import { prisma } from '../src/lib/prisma';
import { NBSP } from '../src/services/formatters';
import { nextDocumentNumber } from '../src/services/batches.service';
import { buildDocx, docxText } from './helpers/docx';
import { createTestContext, GROUP, READY_VALUES, resetDb, type TestContext } from './helpers/context';

let ctx: TestContext;
let tid: string;
let vid: string;
beforeAll(async () => {
  await resetDb();
  ctx = await createTestContext();
  await ctx.seedBase();
  ({ templateId: tid, versionId: vid } = await ctx.createTemplate('student_agreement_v1.docx'));
});

const precheck = (body: Record<string, unknown>) => ctx.api.post('/api/batches/precheck').set(ctx.auth('coordinator')).send(body);
const base = () => ({ templateVersionId: vid, recipientType: 'student', groupId: GROUP });
const binary = (path: string) =>
  ctx.api
    .get(path)
    .set(ctx.auth('coordinator'))
    .buffer(true)
    .parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });

describe('precheck (G-3, G-4)', () => {
  it('lists shared fields and the recipients with missing Core Engine data', async () => {
    const res = await precheck(base());
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ templateVersionId: vid, total: 24, ready: false });
    expect(res.body.commonFields.map((f: { key: string }) => f.key)).toEqual(['contract.date', 'contract.amount']);
    expect(res.body.missingCommon.map((f: { key: string }) => f.key)).toEqual(['contract.date', 'contract.amount']);
    const gaps = res.body.recipients.filter((r: { missing: unknown[] }) => r.missing.length);
    expect(gaps.map((r: { id: string; missing: { key: string }[] }) => [r.id, r.missing.map((m) => m.key)])).toEqual([
      ['stu-007', ['student.passport']],
      ['stu-015', ['student.address']],
    ]);
    // no passport numbers in the precheck payload
    expect(JSON.stringify(res.body)).not.toMatch(/AN\d{7}/);
  });

  it('is ready once shared values and manual fills are provided', async () => {
    const res = await precheck({ ...base(), ...READY_VALUES });
    expect(res.body).toMatchObject({ total: 24, ready: true, missingCommon: [] });
  });

  it('excluded recipients do not count, and their gaps do not block', async () => {
    const res = await precheck({ ...base(), commonValues: READY_VALUES.commonValues, excludedIds: ['stu-007', 'stu-015'] });
    expect(res.body).toMatchObject({ total: 22, ready: true });
    expect(res.body.recipients.find((r: { id: string }) => r.id === 'stu-007')).toMatchObject({ excluded: true, missing: [{ key: 'student.passport' }] });
  });

  it('a shared value can be given per recipient instead of for the whole pack', async () => {
    const overrides = Object.fromEntries(
      Array.from({ length: 24 }, (_, i) => [`stu-${String(i + 1).padStart(3, '0')}`, { 'contract.amount': 300000, 'student.passport': 'AN0000001', 'student.address': 'x' }]),
    );
    const res = await precheck({ ...base(), commonValues: { 'contract.date': '2026-11-21' }, overrides });
    expect(res.body).toMatchObject({ ready: true, missingCommon: [] });
  });

  it('rejects unknown groups, empty selections and bad input', async () => {
    expect((await precheck({ ...base(), groupId: 'grp-nope' })).status).toBe(404);
    expect((await precheck({ templateVersionId: vid, recipientType: 'student' })).status).toBe(400);
    expect((await precheck({ recipientType: 'student', groupId: GROUP })).body.error.code).toBe('VALIDATION_ERROR');
    expect((await precheck({ ...base(), recipientIds: ['nobody'] })).status).toBe(400);
  });

  it('create refuses missing data with details, and refuses an empty pack', async () => {
    const res = await ctx.api.post('/api/batches').set(ctx.auth('coordinator')).send({ ...base(), commonValues: READY_VALUES.commonValues });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatchObject({ code: 'MISSING_DATA', details: { missingCommon: [], recipients: [{ id: 'stu-007', missing: ['student.passport'] }, { id: 'stu-015', missing: ['student.address'] }] } });
    const ids = Array.from({ length: 24 }, (_, i) => `stu-${String(i + 1).padStart(3, '0')}`);
    const empty = await ctx.api.post('/api/batches').set(ctx.auth('coordinator')).send({ ...base(), ...READY_VALUES, excludedIds: ids });
    expect(empty.status).toBe(400);
  });
});

describe('generating the 24-student pack (G-5, G-6, G-7)', () => {
  let batchId: string;
  let docs: Awaited<ReturnType<TestContext['generate']>>['docs'];

  beforeAll(async () => {
    ({ batchId, docs } = await ctx.generate({ ...base(), ...READY_VALUES }));
  });

  it('creates 24 documents, each linked to the published version', async () => {
    expect(docs).toHaveLength(24);
    expect(new Set(docs.map((d) => d.templateVersionId))).toEqual(new Set([vid]));
    expect(new Set(docs.map((d) => d.recipientId)).size).toBe(24);
    expect(docs.every((d) => d.status === 'created' && d.groupId === GROUP)).toBe(true);
  });

  it('numbers are unique and follow PS-YYYY-000123', () => {
    expect(docs.every((d) => /^PS-2026-\d{6}$/.test(d.number))).toBe(true);
    expect(new Set(docs.map((d) => d.number)).size).toBe(24);
  });

  it('batch reports completed with progress 24 / 24', async () => {
    const res = await ctx.api.get(`/api/batches/${batchId}`).set(ctx.auth('coordinator'));
    expect(res.body).toMatchObject({ status: 'completed', progress: 24, total: 24, hasZip: true, hasMergedPdf: true, template: { id: tid, versionNumber: 1 } });
    expect(res.body.zipPath).toBeUndefined();
  });

  it('saves a data snapshot with every value used, already formatted', () => {
    const anna = docs.find((d) => d.recipientId === 'stu-001')!;
    const snap = anna.dataSnapshot as Record<string, string>;
    expect(Object.keys(snap).sort()).toEqual(
      ['academy.director', 'academy.name', 'contract.amount', 'contract.date', 'document.number', 'group.course_name', 'group.end_date', 'group.name', 'group.start_date', 'signature.checkbox', 'student.address', 'student.full_name', 'student.passport', 'student.phone'].sort(),
    );
    expect(snap).toMatchObject({
      'document.number': anna.number,
      'student.full_name': 'Աննա Հակոբյան',
      'contract.amount': `450${NBSP}000${NBSP}֏`,
      'contract.date': '21 նոյեմբերի 2026 թ.',
      'group.start_date': '1 դեկտեմբերի 2026 թ.',
      'signature.checkbox': '☐  Ստորագրություն՝ ____________',
    });
    expect((docs.find((d) => d.recipientId === 'stu-007')!.dataSnapshot as Record<string, string>)['student.passport']).toBe('AN7654321');
  });

  it('the filled .docx contains the recipient data', async () => {
    const docx = await ctx.deps.storage.get(docs[0].docxPath);
    const text = await docxText(docx);
    expect(text).toContain(`ՈՒՍՈՒՑՄԱՆ ՊԱՅՄԱՆԱԳԻՐ № ${docs[0].number}`);
    expect(text).toContain(docs[0].recipientName);
    expect(text).not.toContain('{{');
  });

  it('ZIP contains a PDF and a DOCX for every recipient, all valid', async () => {
    const res = await binary(`/api/batches/${batchId}/zip`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/zip');
    const zip = new AdmZip(res.body as Buffer);
    const names = zip.getEntries().map((e) => e.entryName);
    expect(names.filter((n) => n.startsWith('pdf/') && n.endsWith('.pdf'))).toHaveLength(24);
    expect(names.filter((n) => n.startsWith('docx/') && n.endsWith('.docx'))).toHaveLength(24);
    expect(names).toContain(`pdf/${docs[0].number} ${docs[0].recipientName}.pdf`);
    for (const e of zip.getEntries()) {
      const data = e.getData();
      if (e.entryName.endsWith('.pdf')) expect(data.subarray(0, 5).toString()).toBe('%PDF-');
      else expect(new AdmZip(data).getEntry('word/document.xml')).toBeTruthy();
    }
  });

  it('merged PDF is valid and has every page in number order', async () => {
    const res = await binary(`/api/batches/${batchId}/merged-pdf`);
    expect(res.headers['content-type']).toBe('application/pdf');
    const merged = await PDFDocument.load(res.body as Buffer);
    expect(merged.getPageCount()).toBe(24); // the fake converter makes 1-page PDFs
  });

  it('documents list omits personal data (no snapshot, no passport) and storage paths', async () => {
    const res = await ctx.api.get(`/api/documents?batchId=${batchId}`).set(ctx.auth('coordinator'));
    expect(res.body.items).toHaveLength(24);
    const raw = JSON.stringify(res.body);
    expect(raw).not.toMatch(/dataSnapshot|passport|AN\d{7}|pdfPath|docxPath/);
    expect(res.body.items[0]).toMatchObject({ versionNumber: 1, isCurrentVersion: true, template: { id: tid } });
  });

  it('serves PDF/DOCX per document after the role check', async () => {
    const pdf = await binary(`/api/documents/${docs[0].id}/pdf?inline=1`);
    expect(pdf.headers['content-disposition']).toMatch(/^inline; filename\*=UTF-8''PS-2026-/);
    const docx = await binary(`/api/documents/${docs[0].id}/docx`);
    expect(docx.headers['content-type']).toContain('wordprocessingml');
    expect(docx.headers['content-disposition']).toMatch(/^attachment/);
    expect((await ctx.api.get(`/api/documents/${docs[0].id}/scan`).set(ctx.auth('coordinator'))).status).toBe(404);
  });

  it('history shows who generated which version for which group (G-8)', async () => {
    const res = await ctx.api.get('/api/batches').set(ctx.auth('coordinator'));
    expect(res.body.items[0]).toMatchObject({ id: batchId, groupId: GROUP, groupName: 'ՎԾ-2026-Ա', createdByName: 'Կարինե Համակարգողյան', template: { versionNumber: 1 } });
    expect((await ctx.api.get(`/api/batches?groupId=${GROUP}&limit=1`).set(ctx.auth('coordinator'))).body.items).toHaveLength(1);
  });

  it('the snapshot and files never change when Core Engine data changes later', async () => {
    const anna = docs.find((d) => d.recipientId === 'stu-001')!;
    const pdfBefore = await ctx.deps.storage.get(anna.pdfPath);
    ctx.dataset.students[0].fullName = 'Աննա Հակոբյան-Սարգսյան';
    ctx.dataset.students[0].address = 'ք. Գյումրի, նոր հասցե';

    const after = await prisma.document.findUniqueOrThrow({ where: { id: anna.id } });
    expect(after.dataSnapshot).toEqual(anna.dataSnapshot);
    expect(after.recipientName).toBe('Աննա Հակոբյան');
    expect((await ctx.deps.storage.get(anna.pdfPath)).equals(pdfBefore)).toBe(true);

    // a NEW batch does pick up the new data
    const { docs: fresh } = await ctx.generate({ ...base(), recipientIds: ['stu-001'], ...READY_VALUES });
    expect((fresh[0].dataSnapshot as Record<string, string>)['student.full_name']).toBe('Աննա Հակոբյան-Սարգսյան');
    expect(fresh[0].number > anna.number).toBe(true);
    ctx.dataset.students[0].fullName = 'Աննա Հակոբյան';
  });

  it('excluded recipients are skipped', async () => {
    const { docs: some } = await ctx.generate({ ...base(), commonValues: READY_VALUES.commonValues, excludedIds: ['stu-007', 'stu-015'] });
    expect(some).toHaveLength(22);
    expect(some.map((d) => d.recipientId)).not.toEqual(expect.arrayContaining(['stu-007']));
    expect(some.map((d) => d.recipientId)).not.toContain('stu-015');
  });

  it('downloads before completion -> 422 BATCH_NOT_READY', async () => {
    const queued = await prisma.generationBatch.create({
      data: { templateVersionId: vid, recipientType: 'student', commonValues: {}, total: 1, createdById: ctx.users.coordinator!.id },
    });
    const res = await ctx.api.get(`/api/batches/${queued.id}/zip`).set(ctx.auth('coordinator'));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('BATCH_NOT_READY');
    expect((await ctx.api.get(`/api/batches/00000000-0000-0000-0000-000000000000`).set(ctx.auth('coordinator'))).status).toBe(404);
  });
});

describe('job robustness', () => {
  it('a failed conversion marks the batch failed; a retry continues without duplicates', async () => {
    let failures = 0;
    ctx.fakePdf.failOn = () => ++failures === 5; // the 5th conversion fails once
    const res = await ctx.api.post('/api/batches').set(ctx.auth('coordinator')).send({ ...base(), ...READY_VALUES });
    await ctx.queue.idle();
    const failed = await prisma.generationBatch.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(failed.status).toBe('failed');
    expect(failed.error).toContain('fake conversion failure');
    const partial = await prisma.document.count({ where: { batchId: res.body.id } });
    expect(partial).toBeGreaterThan(0);
    expect(partial).toBeLessThan(24);

    ctx.fakePdf.failOn = undefined;
    await ctx.services.processBatch(res.body.id); // what the BullMQ retry does
    const done = await prisma.generationBatch.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(done).toMatchObject({ status: 'completed', progress: 24, total: 24 });
    const docs = await prisma.document.findMany({ where: { batchId: res.body.id } });
    expect(new Set(docs.map((d) => d.recipientId)).size).toBe(24);
    expect(docs).toHaveLength(24);

    await ctx.services.processBatch(res.body.id); // already completed: no-op
    expect(await prisma.document.count({ where: { batchId: res.body.id } })).toBe(24);
  });

  it('document numbers stay unique under concurrent allocation', async () => {
    const numbers = await Promise.all(Array.from({ length: 30 }, () => nextDocumentNumber(prisma, 2031)));
    expect(new Set(numbers).size).toBe(30);
    expect(numbers.sort()[0]).toBe('PS-2031-000001');
    expect(await nextDocumentNumber(prisma, 2031)).toBe('PS-2031-000031');
  });
});

describe('staff and partner recipients (G-1)', () => {
  it('generates a vacation order for selected staff', async () => {
    const t = await ctx.createTemplate(
      await buildDocx(['ՀՐԱՄԱՆ № {{document.number}}', '1. {{staff.full_name}} ({{staff.position}}) արձակուրդ՝ {{vacation.start_date}}–{{vacation.end_date}}, {{vacation.days}} օր։', '{{signature.checkbox}}']),
      { category: 'vacation_order' },
    );
    const { docs } = await ctx.generate({
      templateId: t.templateId,
      recipientType: 'staff',
      recipientIds: ['stf-002', 'stf-003'],
      commonValues: { 'vacation.start_date': '2027-07-01', 'vacation.end_date': '2027-07-21', 'vacation.days': 21 },
    });
    expect(docs.map((d) => [d.recipientType, d.recipientName])).toEqual([
      ['staff', 'Լուսինե Աղաջանյան'],
      ['staff', 'Գարիկ Հովսեփյան'],
    ]);
    expect(docs[0].groupId).toBeNull();
    expect(await docxText(await ctx.deps.storage.get(docs[0].docxPath))).toContain('արձակուրդ՝ 1 հուլիսի 2027 թ.–21 հուլիսի 2027 թ., 21 օր');
  });

  it('generates a partner invoice and requires explicit recipients', async () => {
    const t = await ctx.createTemplate(await buildDocx(['ՀԱՇԻՎ № {{document.number}}', '{{partner.name}}, ՀՎՀՀ {{partner.tax_id}}', 'Գումար՝ {{invoice.amount}}', '{{signature.checkbox}}']), {
      category: 'partner_invoice',
    });
    expect((await precheck({ templateId: t.templateId, recipientType: 'partner' })).status).toBe(400);
    const { docs } = await ctx.generate({ templateId: t.templateId, recipientType: 'partner', recipientIds: ['prt-001'], commonValues: { 'invoice.amount': '1 200 000' } });
    const text = (await docxText(await ctx.deps.storage.get(docs[0].docxPath))).replace(/ /g, ' ');
    expect(text).toContain('«Կոդ Լաբ» ՍՊԸ, ՀՎՀՀ 02612345');
    expect(text).toContain('Գումար՝ 1 200 000 ֏');
  });

  it('invalid typed values are reported by precheck and refused before the job starts', async () => {
    const body = { ...base(), ...READY_VALUES, commonValues: { 'contract.date': 'someday', 'contract.amount': 1 }, overrides: { ...READY_VALUES.overrides, 'stu-003': { 'contract.amount': 'a lot' } } };
    const check = await precheck(body);
    expect(check.body).toMatchObject({ ready: false, invalidValues: [{ recipientId: null, key: 'contract.date', value: 'someday' }, { recipientId: 'stu-003', key: 'contract.amount', value: 'a lot' }] });
    const res = await ctx.api.post('/api/batches').set(ctx.auth('coordinator')).send(body);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_VALUES');
  });
});

describe('Core Engine routes', () => {
  it('list students without passport numbers', async () => {
    const res = await ctx.api.get(`/api/core/groups/${GROUP}/students`).set(ctx.auth('coordinator'));
    expect(res.body.items).toHaveLength(24);
    expect(res.body.items[0]).not.toHaveProperty('passport');
    expect(res.body.items.find((s: { id: string }) => s.id === 'stu-007').hasPassport).toBe(false);
    expect((await ctx.api.get('/api/core/groups/nope/students').set(ctx.auth('coordinator'))).status).toBe(404);
    expect((await ctx.api.get('/api/core/groups').set(ctx.auth('editor'))).body.items[0]).toMatchObject({ id: GROUP, studentCount: 24 });
    expect((await ctx.api.get('/api/core/staff').set(ctx.auth('editor'))).body.items).toHaveLength(5);
    expect((await ctx.api.get('/api/core/partners').set(ctx.auth('editor'))).body.items).toHaveLength(3);
  });
});
