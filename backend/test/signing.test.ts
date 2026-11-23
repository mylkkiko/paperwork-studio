import { createHash } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { prisma } from '../src/lib/prisma';
import { createTestContext, GROUP, READY_VALUES, resetDb, T0, tokenFromMail, type TestContext } from './helpers/context';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const DAY = 86_400_000;

/** Fresh database + context + n generated (not yet sent) student documents. */
async function setup(n = 6) {
  await resetDb();
  const ctx = await createTestContext();
  await ctx.seedBase();
  const { templateId } = await ctx.createTemplate('student_agreement_v1.docx');
  const ids = Array.from({ length: n }, (_, i) => `stu-${String(i + 1).padStart(3, '0')}`);
  const { docs } = await ctx.generate({ templateId, recipientType: 'student', groupId: GROUP, recipientIds: ids, ...READY_VALUES });
  return { ctx, docs, templateId };
}

const statusOf = async (id: string) => (await prisma.document.findUniqueOrThrow({ where: { id } })).status;

describe('sending (S-2)', () => {
  let ctx: TestContext;
  let docs: Awaited<ReturnType<typeof setup>>['docs'];
  beforeAll(async () => ({ ctx, docs } = await setup(3)));

  it('emails a link with a 32-byte random token and stores only its hash', async () => {
    const tokens = await ctx.send([docs[0].id]);
    const token = tokens[docs[0].id];
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes base64url
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);

    const mail = ctx.mailer.sent.at(-1)!;
    expect(mail.to).toBe('anna.hakobyan@student.academy.am');
    expect(mail.subject).toBe(`Ստորագրման համար՝ Ուսուցման պայմանագիր № ${docs[0].number}`);
    expect(mail.text).toContain(`http://localhost:3100/sign/${token}`);
    expect(mail.text).toContain('Խնդրում ենք ծանոթանալ «Ուսուցման պայմանագիր» փաստաթղթին');
    expect(mail.text).toContain('Տպեք փաստաթուղթը, ստորագրեք ձեռքով ☐ վանդակի կողքին և հանձնեք այն Ձեր համակարգողին մինչև 5 դեկտեմբերի 2026 թ.'); // 21 Nov + 14 days
    expect(mail.text).not.toMatch(/հաստատ|առցանց/); // no "confirm" / "online" wording

    const req = await prisma.signatureRequest.findFirstOrThrow({ where: { documentId: docs[0].id } });
    expect(req.tokenHash).toBe(sha256(token));
    expect(req.expiresAt.getTime()).toBe(T0.getTime() + 14 * DAY);
    const everything = JSON.stringify(await prisma.signatureRequest.findMany()) + JSON.stringify(await prisma.auditLog.findMany());
    expect(everything).not.toContain(token);

    expect(await prisma.document.findUniqueOrThrow({ where: { id: docs[0].id } })).toMatchObject({ status: 'sent', sentAt: T0 });
  });

  it('link lifetime is configurable', async () => {
    const short = await createTestContext({ config: { SIGN_LINK_TTL_DAYS: 3 } });
    Object.assign(short.tokens, ctx.tokens);
    await short.api.post('/api/documents/send').set(short.auth('coordinator')).send({ documentIds: [docs[2].id] });
    const req = await prisma.signatureRequest.findFirstOrThrow({ where: { documentId: docs[2].id }, orderBy: { createdAt: 'desc' } });
    expect(req.expiresAt.getTime()).toBe(T0.getTime() + 3 * DAY);
  });

  it('sending again issues a new link and revokes the old one', async () => {
    const first = (await ctx.send([docs[1].id]))[docs[1].id];
    const second = (await ctx.send([docs[1].id]))[docs[1].id];
    expect(second).not.toBe(first);
    const old = await ctx.api.get(`/api/sign/${first}`);
    expect(old.status).toBe(410);
    expect(old.body.error.code).toBe('TOKEN_REVOKED');
    expect((await ctx.api.get(`/api/sign/${second}`)).status).toBe(200);
  });

  it('reports per-document failures instead of failing the whole request', async () => {
    await prisma.document.update({ where: { id: docs[2].id }, data: { recipientEmail: null } });
    const res = await ctx.api.post('/api/documents/send').set(ctx.auth('coordinator')).send({ documentIds: [docs[2].id, '00000000-0000-0000-0000-000000000000'] });
    expect(res.body).toEqual({
      sent: 0,
      results: [
        { id: docs[2].id, ok: false, code: 'NO_EMAIL' },
        { id: '00000000-0000-0000-0000-000000000000', ok: false, code: 'NOT_FOUND' },
      ],
    });
  });
});

describe('the document link (S-2): view only, no online signing', () => {
  let ctx: TestContext;
  let docs: Awaited<ReturnType<typeof setup>>['docs'];
  let tokens: Record<string, string>;
  beforeAll(async () => {
    ({ ctx, docs } = await setup(4));
    tokens = await ctx.send(docs.map((d) => d.id));
  });

  it('opening the link shows the document and marks it viewed (once)', async () => {
    const res = await ctx.api.get(`/api/sign/${tokens[docs[0].id]}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ documentNumber: docs[0].number, title: 'Ուսուցման պայմանագիր', versionNumber: 1, recipientName: 'Աննա Հակոբյան', status: 'viewed', signedAt: null });
    expect(JSON.stringify(res.body)).not.toMatch(/AN\d{7}/);
    ctx.clock.advanceDays(1);
    await ctx.api.get(`/api/sign/${tokens[docs[0].id]}`);
    expect((await prisma.document.findUniqueOrThrow({ where: { id: docs[0].id } })).viewedAt).toEqual(T0);
    expect(await prisma.auditLog.count({ where: { entityId: docs[0].id, action: 'document.viewed' } })).toBe(1);
  });

  it('the signer can fetch the PDF (the generated document with the ☐ box) with the token', async () => {
    const res = await ctx.api.get(`/api/sign/${tokens[docs[0].id]}/pdf`).buffer(true);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    const doc = await prisma.document.findUniqueOrThrow({ where: { id: docs[0].id } });
    expect(Buffer.from(res.body).equals(await ctx.deps.storage.get(doc.pdfPath))).toBe(true);
  });

  it('POST /api/sign/:token no longer exists (404), whatever the body', async () => {
    for (const body of [{ agree: true }, { agree: false }, {}]) {
      const res = await ctx.api.post(`/api/sign/${tokens[docs[0].id]}`).send(body);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('ROUTE_NOT_FOUND');
    }
  });

  it('nothing on the public link can set a document to "signed"', async () => {
    const t = tokens[docs[1].id];
    const attempts = [
      ctx.api.get(`/api/sign/${t}`),
      ctx.api.get(`/api/sign/${t}/pdf`),
      ctx.api.post(`/api/sign/${t}`).send({ agree: true }),
      ctx.api.put(`/api/sign/${t}`).send({ agree: true }),
      ctx.api.patch(`/api/sign/${t}`).send({ status: 'signed' }),
      ctx.api.post(`/api/sign/${t}/sign`).send({ agree: true }),
      ctx.api.post(`/api/sign/${t}/confirm`).send({ agree: true }),
      ctx.api.post(`/api/documents/${docs[1].id}/paper-signature`).attach('file', Buffer.from('%PDF-1.4'), 's.pdf'), // no login
    ];
    for (const res of await Promise.all(attempts)) expect(res.body?.status).not.toBe('signed');
    expect(await statusOf(docs[1].id)).toBe('viewed');
    expect(await prisma.signature.count()).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: { in: ['document.signed', 'document.paper_signed'] } } })).toBe(0);
  });

  it('wrong or malformed tokens -> 404', async () => {
    for (const t of ['A'.repeat(43), 'short', 'x'.repeat(300)]) {
      const res = await ctx.api.get(`/api/sign/${t}`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    }
    const t = tokens[docs[2].id];
    const tampered = (t[0] === 'A' ? 'B' : 'A') + t.slice(1);
    expect((await ctx.api.post(`/api/sign/${tampered}/decline`).send({})).status).toBe(404);
    expect(await statusOf(docs[2].id)).toBe('sent');
  });

  it('declining stores the reason and closes the document; the link stays a read-only page', async () => {
    const t = tokens[docs[2].id];
    const res = await ctx.api.post(`/api/sign/${t}/decline`).send({ reason: 'Գումարը սխալ է' });
    expect(res.body).toEqual({ status: 'declined' });
    expect(await prisma.document.findUniqueOrThrow({ where: { id: docs[2].id } })).toMatchObject({ status: 'declined', declineReason: 'Գումարը սխալ է' });
    const again = await ctx.api.post(`/api/sign/${t}/decline`).send({});
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_DECLINED');
    expect((await ctx.api.get(`/api/sign/${t}`)).body.status).toBe('declined');
    expect((await ctx.api.get(`/api/sign/${t}/pdf`)).status).toBe(200);
    const resend = await ctx.api.post('/api/documents/send').set(ctx.auth('coordinator')).send({ documentIds: [docs[2].id] });
    expect(resend.body.results[0]).toMatchObject({ ok: false, code: 'DOCUMENT_FINAL' });
  });

  it('after the scan is uploaded the link shows "signed on paper" with the paper date, and decline is refused', async () => {
    const t = tokens[docs[3].id];
    await ctx.paperSign(docs[3].id, { signedAt: '2026-11-20T09:00:00Z' });
    expect((await ctx.api.get(`/api/sign/${t}`)).body).toMatchObject({ status: 'signed', signatureMethod: 'paper', signedAt: '2026-11-20T09:00:00.000Z' });
    const pdf = await ctx.api.get(`/api/sign/${t}/pdf`).buffer(true);
    expect(pdf.status).toBe(200);
    const decline = await ctx.api.post(`/api/sign/${t}/decline`).send({});
    expect(decline.status).toBe(409);
    expect(decline.body.error.code).toBe('ALREADY_SIGNED');
  });

  it('the coordinator downloads the generated PDF (the signed copy is the scan)', async () => {
    const doc = await prisma.document.findUniqueOrThrow({ where: { id: docs[3].id } });
    const res = await ctx.api.get(`/api/documents/${doc.id}/pdf`).set(ctx.auth('coordinator')).buffer(true);
    expect(Buffer.from(res.body).equals(await ctx.deps.storage.get(doc.pdfPath))).toBe(true);
    await PDFDocument.load(res.body);
    const scan = await ctx.api.get(`/api/documents/${doc.id}/scan`).set(ctx.auth('coordinator')).buffer(true);
    expect(scan.headers['content-type']).toBe('application/pdf');
  });

  it('every step is in the audit log', async () => {
    const actions = (await prisma.auditLog.findMany({ where: { entityId: { in: docs.map((d) => d.id) } } })).map((a) => a.action);
    expect(new Set(actions)).toEqual(new Set(['document.sent', 'document.viewed', 'document.declined', 'document.paper_signed']));
  });
});

/** The 14-day period is the deadline to hand in the signed paper document. */
describe('deadline (14 days to hand in the paper)', () => {
  let ctx: TestContext;
  let docs: Awaited<ReturnType<typeof setup>>['docs'];
  let tokens: Record<string, string>;
  // 0 sent · 1 viewed · 2 sent (late paper) · 3 sent (resent after expiry)
  beforeAll(async () => {
    ({ ctx, docs } = await setup(4));
    tokens = await ctx.send(docs.map((d) => d.id));
    await ctx.api.get(`/api/sign/${tokens[docs[1].id]}`);
  });

  it('nothing expires before the deadline', async () => {
    ctx.clock.set(new Date(T0.getTime() + 14 * DAY - 60_000));
    expect(await ctx.services.reminders.runAuto()).toMatchObject({ expired: 0 });
    expect(await Promise.all(docs.map((d) => statusOf(d.id)))).toEqual(['sent', 'viewed', 'sent', 'sent']);
  });

  it('after the deadline the link still shows the document, now marked expired', async () => {
    ctx.clock.set(new Date(T0.getTime() + 14 * DAY + 1000));
    const view = await ctx.api.get(`/api/sign/${tokens[docs[0].id]}`);
    expect(view.status).toBe(200);
    expect(view.body).toMatchObject({ documentNumber: docs[0].number, status: 'expired' });
    expect(await statusOf(docs[0].id)).toBe('expired'); // the sent document expired (not "viewed")
    expect((await prisma.document.findUniqueOrThrow({ where: { id: docs[0].id } })).viewedAt).toBeNull();
    const pdf = await ctx.api.get(`/api/sign/${tokens[docs[0].id]}/pdf`).buffer(true);
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(await prisma.auditLog.count({ where: { entityId: docs[0].id, action: 'document.expired' } })).toBe(1);
  });

  it('the scheduled job expires the viewed document too', async () => {
    expect(await ctx.services.reminders.runAuto()).toEqual({ checked: 3, reminded: 0, expired: 3 });
    expect(await Promise.all(docs.map((d) => statusOf(d.id)))).toEqual(['expired', 'expired', 'expired', 'expired']);
    expect((await ctx.api.get(`/api/sign/${tokens[docs[1].id]}`)).body.status).toBe('expired');
  });

  it('decline is rejected after the deadline', async () => {
    for (const i of [0, 1]) {
      const res = await ctx.api.post(`/api/sign/${tokens[docs[i].id]}/decline`).send({ reason: 'late' });
      expect(res.status).toBe(410);
      expect(res.body.error.code).toBe('TOKEN_EXPIRED');
      expect(await statusOf(docs[i].id)).toBe('expired');
    }
  });

  it('late paper: the coordinator can still upload the scan, expired -> signed', async () => {
    await ctx.paperSign(docs[2].id);
    expect(await statusOf(docs[2].id)).toBe('signed');
    expect((await ctx.api.get(`/api/sign/${tokens[docs[2].id]}`)).body).toMatchObject({ status: 'signed', signatureMethod: 'paper' });
  });

  it('sending again starts a new 14-day period and replaces the old link', async () => {
    const fresh = (await ctx.send([docs[3].id]))[docs[3].id];
    expect(await statusOf(docs[3].id)).toBe('sent');
    const req = await prisma.signatureRequest.findFirstOrThrow({ where: { documentId: docs[3].id, revokedAt: null } });
    expect(req.expiresAt.getTime()).toBe(ctx.clock.now().getTime() + 14 * DAY);
    const old = await ctx.api.get(`/api/sign/${tokens[docs[3].id]}`);
    expect(old.status).toBe(410);
    expect(old.body.error.code).toBe('TOKEN_REVOKED');
    expect((await ctx.api.get(`/api/sign/${fresh}`)).body.status).toBe('viewed');
  });
});

describe('paper signature (S-3)', () => {
  let ctx: TestContext;
  let docs: Awaited<ReturnType<typeof setup>>['docs'];
  beforeAll(async () => ({ ctx, docs } = await setup(3)));

  const PNG = Buffer.from('89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000D4944415478DA6364F8CF00000301010018DD8DB00000000049454E44AE426082', 'hex');

  it('records a paper signature with the scan, even before sending', async () => {
    const res = await ctx.api.post(`/api/documents/${docs[0].id}/paper-signature`).set(ctx.auth('coordinator')).field('signedAt', '2026-11-20T09:00:00Z').attach('file', PNG, 'scan.png');
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ method: 'paper', signerName: 'Աննա Հակոբյան', hasScan: true, recordedById: ctx.users.coordinator!.id, signedAt: '2026-11-20T09:00:00.000Z' });
    expect(res.body.scanPath).toBeUndefined();
    expect(await statusOf(docs[0].id)).toBe('signed');
    const scan = await ctx.api.get(`/api/documents/${docs[0].id}/scan`).set(ctx.auth('coordinator')).buffer(true);
    expect(scan.headers['content-type']).toBe('image/png');
    expect(Buffer.from(scan.body).equals(PNG)).toBe(true);
  });

  it('revokes open links, so the email link becomes a read-only page', async () => {
    const token = (await ctx.send([docs[1].id]))[docs[1].id];
    const pdf = Buffer.from('%PDF-1.4\n%%EOF');
    expect((await ctx.api.post(`/api/documents/${docs[1].id}/paper-signature`).set(ctx.auth('coordinator')).attach('file', pdf, 'scan.pdf')).status).toBe(201);
    expect(await prisma.signatureRequest.count({ where: { documentId: docs[1].id, revokedAt: null } })).toBe(0);
    expect((await ctx.api.get(`/api/sign/${token}`)).body).toMatchObject({ status: 'signed', signatureMethod: 'paper' });
    expect((await ctx.api.post(`/api/sign/${token}/decline`).send({})).status).toBe(409);
  });

  it('a paper signature without a scan is rejected and changes nothing', async () => {
    const token = (await ctx.send([docs[2].id]))[docs[2].id];
    for (const res of [
      await ctx.api.post(`/api/documents/${docs[2].id}/paper-signature`).set(ctx.auth('coordinator')),
      await ctx.api.post(`/api/documents/${docs[2].id}/paper-signature`).set(ctx.auth('coordinator')).field('signedAt', '2026-11-20T09:00:00Z'),
      await ctx.api.post(`/api/documents/${docs[2].id}/paper-signature`).set(ctx.auth('coordinator')).send({ signerName: 'X' }),
    ]) {
      expect(res.status).toBe(400);
    }
    expect(await statusOf(docs[2].id)).toBe('sent');
    expect(await prisma.signature.count({ where: { documentId: docs[2].id } })).toBe(0);
    expect((await ctx.api.get(`/api/sign/${token}`)).body.status).toBe('viewed');
  });

  it('the app creates only paper signatures', async () => {
    const methods = (await prisma.signature.findMany()).map((x) => x.method);
    expect(methods.length).toBeGreaterThan(0);
    expect(new Set(methods)).toEqual(new Set(['paper']));
  });

  it('accepts JPG; rejects other file types, a missing file, and final documents', async () => {
    const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
    expect((await ctx.api.post(`/api/documents/${docs[2].id}/paper-signature`).set(ctx.auth('coordinator')).attach('file', Buffer.from('hello'), 'x.txt')).status).toBe(400);
    expect((await ctx.api.post(`/api/documents/${docs[2].id}/paper-signature`).set(ctx.auth('coordinator'))).status).toBe(400);
    expect((await ctx.api.post(`/api/documents/${docs[2].id}/paper-signature`).set(ctx.auth('coordinator')).attach('file', jpg, 's.jpg')).status).toBe(201);
    const again = await ctx.api.post(`/api/documents/${docs[2].id}/paper-signature`).set(ctx.auth('coordinator')).attach('file', jpg, 's.jpg');
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('DOCUMENT_FINAL');
    expect((await ctx.api.post(`/api/documents/00000000-0000-0000-0000-000000000000/paper-signature`).set(ctx.auth('coordinator')).attach('file', jpg, 's.jpg')).status).toBe(404);
  });
});

/**
 * Product owner addition #1: expiry never changes signed or declined documents; only unsigned ones become "expired".
 */
describe('expiry only affects unsigned documents', () => {
  let ctx: TestContext;
  let docs: Awaited<ReturnType<typeof setup>>['docs'];
  let tokens: Record<string, string>;
  // 0 signed on paper (after viewing) · 1 declined · 2 signed on paper · 3 sent · 4 viewed · 5 never sent
  beforeAll(async () => {
    ({ ctx, docs } = await setup(6));
    tokens = await ctx.send(docs.slice(0, 5).map((d) => d.id));
    await ctx.api.get(`/api/sign/${tokens[docs[0].id]}`);
    await ctx.paperSign(docs[0].id);
    await ctx.api.post(`/api/sign/${tokens[docs[1].id]}/decline`).send({});
    await ctx.paperSign(docs[2].id);
    await ctx.api.get(`/api/sign/${tokens[docs[4].id]}`);
    ctx.clock.advanceDays(30);
  });

  it('the scheduled job expires only the waiting documents', async () => {
    const result = await ctx.services.reminders.runAuto();
    expect(result).toEqual({ checked: 2, reminded: 0, expired: 2 });
    expect(await Promise.all(docs.map((d) => statusOf(d.id)))).toEqual(['signed', 'declined', 'signed', 'expired', 'expired', 'created']);
    expect(await ctx.services.reminders.runAuto()).toEqual({ checked: 0, reminded: 0, expired: 0 });
  });

  it('opening an old link of a signed or declined document still shows it, unchanged', async () => {
    const signed = await ctx.api.get(`/api/sign/${tokens[docs[0].id]}`);
    expect(signed.status).toBe(200);
    expect(signed.body.status).toBe('signed');
    const declined = await ctx.api.get(`/api/sign/${tokens[docs[1].id]}`);
    expect(declined.body.status).toBe('declined');
    for (const i of [0, 1]) {
      const post = await ctx.api.post(`/api/sign/${tokens[docs[i].id]}/decline`).send({});
      expect(post.status).toBe(409); // final, not "expired"
    }
    expect(await Promise.all(docs.slice(0, 3).map((d) => statusOf(d.id)))).toEqual(['signed', 'declined', 'signed']);
    expect(await prisma.auditLog.count({ where: { action: 'document.expired', entityId: { in: docs.slice(0, 3).map((d) => d.id) } } })).toBe(0);
  });

  it('opening an expired link of a waiting document expires it (same rule as the job)', async () => {
    await prisma.document.update({ where: { id: docs[3].id }, data: { status: 'sent' } }); // pretend the job hasn't run yet
    const res = await ctx.api.get(`/api/sign/${tokens[docs[3].id]}`);
    expect(res.status).toBe(200); // the document is still shown, with status "expired"
    expect(res.body.status).toBe('expired');
    expect(await statusOf(docs[3].id)).toBe('expired');
  });
});

/**
 * Product owner addition #2: after a reminder, the old link AND the link from the reminder email both work
 * until the original expiry.
 */
describe('reminder links keep the old link working', () => {
  let ctx: TestContext;
  let docs: Awaited<ReturnType<typeof setup>>['docs'];
  let original: Record<string, string>;
  beforeAll(async () => {
    ({ ctx, docs } = await setup(3));
    original = await ctx.send(docs.map((d) => d.id));
  });

  it('manual reminder: both links work, with the same expiry', async () => {
    const before = ctx.mailer.sent.length;
    expect((await ctx.api.post(`/api/documents/${docs[0].id}/remind`).set(ctx.auth('coordinator'))).status).toBe(201);
    const mail = ctx.mailer.sent[before];
    expect(mail.subject).toBe(`Հիշեցում․ Ուսուցման պայմանագիր № ${docs[0].number} փաստաթուղթը սպասում է Ձեր ստորագրությանը`);
    const fromReminder = tokenFromMail(mail.text)!;
    expect(fromReminder).not.toBe(original[docs[0].id]);

    const requests = await prisma.signatureRequest.findMany({ where: { documentId: docs[0].id } });
    expect(requests).toHaveLength(2);
    expect(new Set(requests.map((r) => r.expiresAt.getTime()))).toEqual(new Set([T0.getTime() + 14 * DAY]));
    expect(requests.every((r) => r.revokedAt === null)).toBe(true);

    ctx.clock.set(new Date(T0.getTime() + 14 * DAY - 60_000)); // one minute before expiry
    expect((await ctx.api.get(`/api/sign/${original[docs[0].id]}`)).status).toBe(200);
    expect((await ctx.api.get(`/api/sign/${fromReminder}`)).status).toBe(200);

    // declining with the reminder link closes both
    expect((await ctx.api.post(`/api/sign/${fromReminder}/decline`).send({})).status).toBe(200);
    expect((await ctx.api.post(`/api/sign/${original[docs[0].id]}/decline`).send({})).body.error.code).toBe('ALREADY_DECLINED');
  });

  it('automatic reminder: both links work until the deadline, then both are read-only', async () => {
    ctx.clock.set(new Date(T0.getTime() + 2 * DAY));
    const before = ctx.mailer.sent.length;
    await ctx.services.reminders.runAuto();
    const mail = ctx.mailer.sent.slice(before).find((m) => m.to === docs[1].recipientEmail)!;
    const fromReminder = tokenFromMail(mail.text)!;

    for (const t of [original[docs[1].id], fromReminder]) expect((await ctx.api.get(`/api/sign/${t}`)).status).toBe(200);

    ctx.clock.set(new Date(T0.getTime() + 14 * DAY + 1));
    for (const t of [original[docs[1].id], fromReminder]) {
      const res = await ctx.api.get(`/api/sign/${t}`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('expired');
      const decline = await ctx.api.post(`/api/sign/${t}/decline`).send({});
      expect(decline.status).toBe(410);
      expect(decline.body.error.code).toBe('TOKEN_EXPIRED');
    }
    expect(await statusOf(docs[1].id)).toBe('expired');
  });

  it('the original link can still decline after a reminder was sent', async () => {
    await resetDb();
    ({ ctx, docs } = await setup(1));
    const first = (await ctx.send([docs[0].id]))[docs[0].id];
    await ctx.api.post(`/api/documents/${docs[0].id}/remind`).set(ctx.auth('coordinator'));
    expect((await ctx.api.post(`/api/sign/${first}/decline`).send({})).status).toBe(200);
  });
});
