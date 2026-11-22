import ExcelJS from 'exceljs';
import { prisma } from '../src/lib/prisma';
import { createTestContext, GROUP, READY_VALUES, resetDb, type TestContext } from './helpers/context';

let ctx: TestContext;
let templateId: string;
beforeAll(async () => {
  await resetDb();
  ctx = await createTestContext();
  await ctx.seedBase();
  ({ templateId } = await ctx.createTemplate('student_agreement_v1.docx'));
  const { docs } = await ctx.generate({ templateId, recipientType: 'student', groupId: GROUP, recipientIds: ['stu-001', 'stu-002', 'stu-003'], ...READY_VALUES });
  const tokens = await ctx.send([docs[0].id, docs[1].id]);
  await ctx.api.post(`/api/sign/${tokens[docs[0].id]}`).send({ agree: true });
  await ctx.api.post(`/api/documents/${docs[1].id}/remind`).set(ctx.auth('coordinator'));
});

const download = (query: string) =>
  ctx.api
    .get(`/api/signatures/export?${query}`)
    .set(ctx.auth('coordinator'))
    .buffer(true)
    .parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });

describe('signature table (S-4)', () => {
  it('shows recipient · document · version · status · signed at, sorted by name', async () => {
    const res = await ctx.api.get(`/api/signatures/table?groupId=${GROUP}`).set(ctx.auth('coordinator'));
    expect(res.body.items.map((r: { recipientName: string; status: string; versionNumber: number; reminderCount: number }) => [r.recipientName, r.status, r.versionNumber, r.reminderCount])).toEqual([
      ['Աննա Հակոբյան', 'signed', 1, 0],
      ['Դավիթ Գրիգորյան', 'sent', 1, 1],
      ['Մարիամ Պետրոսյան', 'created', 1, 0],
    ]);
    expect(res.body.items[0]).toMatchObject({ signatureMethod: 'online', signedAt: expect.any(String), hasSignedPdf: true, isCurrentVersion: true });
    expect(JSON.stringify(res.body)).not.toMatch(/AN\d{7}|dataSnapshot/);
  });

  it('filters by status, version and template', async () => {
    const q = (s: string) => ctx.api.get(`/api/signatures/table?${s}`).set(ctx.auth('coordinator'));
    expect((await q('status=signed')).body.items).toHaveLength(1);
    const version = await prisma.templateVersion.findFirstOrThrow({ where: { templateId } });
    expect((await q(`versionId=${version.id}`)).body.items).toHaveLength(3);
    expect((await q('templateId=00000000-0000-0000-0000-000000000000')).body.items).toHaveLength(0);
    expect((await q('status=nonsense')).status).toBe(400);
  });
});

describe('exports (S-7)', () => {
  it('CSV: UTF-8 BOM, Armenian headers and labels, one row per document', async () => {
    const res = await download(`format=csv&groupId=${GROUP}`);
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename\*=UTF-8''signatures-\d{4}-\d{2}-\d{2}\.csv$/);
    const text = (res.body as Buffer).toString('utf8');
    expect(text.startsWith('﻿')).toBe(true);
    const lines = text.slice(1).trim().split('\r\n');
    expect(lines[0]).toBe('Ստացող,Էլ. փոստ,Փաստաթուղթ,Ձևանմուշ,Տարբերակ,Կարգավիճակ,Եղանակ,Ուղարկվել է,Ստորագրվել է,Հիշեցումներ');
    expect(lines).toHaveLength(4);
    expect(lines[1]).toMatch(/^Աննա Հակոբյան,anna\.hakobyan@student\.academy\.am,PS-2026-\d{6},Ուսուցման պայմանագիր,v1,Ստորագրված,Առցանց,"21 նոյեմբերի 2026 թ\., 14:00","21 նոյեմբերի 2026 թ\., 14:00",0$/);
    expect(lines[2]).toMatch(/,Ուղարկված,,.*,,1$/);
  });

  it('CSV in English', async () => {
    const text = ((await download('format=csv&locale=en')).body as Buffer).toString('utf8');
    expect(text.split('\r\n')[0]).toBe('﻿Recipient,Email,Document,Template,Version,Status,Method,Sent at,Signed at,Reminders');
    expect(text).toContain(',Signed,Online,');
  });

  it('CSV escapes commas and quotes', async () => {
    await prisma.document.updateMany({ where: { recipientId: 'stu-003' }, data: { recipientName: 'Մարիամ "Մարո", Պետրոսյան' } });
    const text = ((await download('format=csv')).body as Buffer).toString('utf8');
    expect(text).toContain('"Մարիամ ""Մարո"", Պետրոսյան"');
  });

  it('XLSX has the same columns and rows', async () => {
    const res = await download(`format=xlsx&groupId=${GROUP}&locale=en`);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body as unknown as ArrayBuffer); // exceljs types expect an ArrayBuffer-backed Buffer
    const ws = wb.getWorksheet('Signatures')!;
    expect((ws.getRow(1).values as unknown[]).slice(1)).toEqual(['Recipient', 'Email', 'Document', 'Template', 'Version', 'Status', 'Method', 'Sent at', 'Signed at', 'Reminders']);
    expect(ws.rowCount).toBe(4);
    expect((ws.getRow(2).values as unknown[]).slice(1)).toEqual([
      'Աննա Հակոբյան', 'anna.hakobyan@student.academy.am', expect.stringMatching(/^PS-2026-/), 'Ուսուցման պայմանագիր', 'v1', 'Signed', 'Online',
      '21 նոյեմբերի 2026 թ., 14:00', '21 նոյեմբերի 2026 թ., 14:00', 0,
    ]);
  });

  it('applies the same filters as the table', async () => {
    const text = ((await download('format=csv&status=signed')).body as Buffer).toString('utf8');
    expect(text.trim().split('\r\n')).toHaveLength(2);
    expect((await ctx.api.get('/api/signatures/export?format=pdf').set(ctx.auth('coordinator'))).status).toBe(400);
  });
});
