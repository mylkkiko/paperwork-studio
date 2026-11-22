import { createHash } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { prisma } from '../src/lib/prisma';
import { docxText } from './helpers/docx';
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
    expect(mail.text).toContain('Հղումը գործում է մինչև 5 դեկտեմբերի 2026 թ.'); // 21 Nov + 14 days

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

describe('signing online (S-1, S-2)', () => {
  let ctx: TestContext;
  let docs: Awaited<ReturnType<typeof setup>>['docs'];
  let tokens: Record<string, string>;
  beforeAll(async () => {
    ({ ctx, docs } = await setup(6));
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

  it('the signer can fetch the PDF with the token', async () => {
    const res = await ctx.api.get(`/api/sign/${tokens[docs[0].id]}/pdf`).buffer(true);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
  });

  it('confirming requires the checkbox', async () => {
    expect((await ctx.api.post(`/api/sign/${tokens[docs[0].id]}`).send({ agree: false })).status).toBe(400);
    expect((await ctx.api.post(`/api/sign/${tokens[docs[0].id]}`).send({})).status).toBe(400);
    expect(await statusOf(docs[0].id)).toBe('viewed');
  });

  it('signing stores time, IP and user agent, and re-renders the PDF with ☑', async () => {
    const before = ctx.fakePdf.calls.length;
    const res = await ctx.api.post(`/api/sign/${tokens[docs[0].id]}`).set('user-agent', 'Mozilla/5.0 (iPhone)').set('x-forwarded-for', '203.0.113.7').send({ agree: true });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'signed', signedAt: ctx.clock.now().toISOString(), documentNumber: docs[0].number });

    const sig = await prisma.signature.findFirstOrThrow({ where: { documentId: docs[0].id } });
    expect(sig).toMatchObject({ method: 'online', signerName: 'Աննա Հակոբյան', ip: '203.0.113.7', userAgent: 'Mozilla/5.0 (iPhone)', signedAt: ctx.clock.now() });

    // the signed copy: same document, only the checkbox line changed
    const signedDocx = ctx.fakePdf.calls[before].docx;
    const original = await docxText(await ctx.deps.storage.get(docs[0].docxPath));
    const signed = await docxText(signedDocx);
    expect(signed).toContain('☑  Հաստատված է առցանց՝ 22 նոյեմբերի 2026 թ., 14:00');
    expect(signed).not.toContain('☐');
    expect(signed.replace(/☑.*\n?/, '')).toBe(original.replace(/☐.*\n?/, ''));

    const doc = await prisma.document.findUniqueOrThrow({ where: { id: docs[0].id } });
    expect(doc.status).toBe('signed');
    expect(doc.signedPdfPath).toBeTruthy();
    expect(doc.pdfPath).not.toBe(doc.signedPdfPath); // the original stays as it was
  });

  it('without a proxy header the socket address is stored', async () => {
    await ctx.api.post(`/api/sign/${tokens[docs[3].id]}`).send({ agree: true });
    const sig = await prisma.signature.findFirstOrThrow({ where: { documentId: docs[3].id } });
    expect(sig.ip).toMatch(/127\.0\.0\.1|::1/);
  });

  it('a token signs only once; afterwards the link is a read-only receipt', async () => {
    const again = await ctx.api.post(`/api/sign/${tokens[docs[0].id]}`).send({ agree: true });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_SIGNED');
    expect(await prisma.signature.count({ where: { documentId: docs[0].id } })).toBe(1);
    const view = await ctx.api.get(`/api/sign/${tokens[docs[0].id]}`);
    expect(view.body).toMatchObject({ status: 'signed', signatureMethod: 'online' });
    expect((await ctx.api.post(`/api/sign/${tokens[docs[0].id]}/decline`).send({})).status).toBe(409);
  });

  it('the coordinator downloads the signed copy by default, the original on request', async () => {
    const doc = await prisma.document.findUniqueOrThrow({ where: { id: docs[0].id } });
    const signed = await ctx.api.get(`/api/documents/${doc.id}/pdf`).set(ctx.auth('coordinator')).buffer(true);
    const original = await ctx.api.get(`/api/documents/${doc.id}/pdf?original=1`).set(ctx.auth('coordinator')).buffer(true);
    expect(Buffer.from(signed.body).equals(await ctx.deps.storage.get(doc.signedPdfPath!))).toBe(true);
    expect(Buffer.from(original.body).equals(await ctx.deps.storage.get(doc.pdfPath))).toBe(true);
    await PDFDocument.load(signed.body);
  });

  it('two confirmations at the same moment produce exactly one signature', async () => {
    const t = tokens[docs[1].id];
    const results = await Promise.all([ctx.api.post(`/api/sign/${t}`).send({ agree: true }), ctx.api.post(`/api/sign/${t}`).send({ agree: true })]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await prisma.signature.count({ where: { documentId: docs[1].id } })).toBe(1);
  });

  it('wrong or malformed tokens -> 404', async () => {
    for (const t of ['A'.repeat(43), 'short', 'x'.repeat(300)]) {
      const res = await ctx.api.get(`/api/sign/${t}`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    }
    // a token with one character changed
    const t = tokens[docs[2].id];
    const tampered = (t[0] === 'A' ? 'B' : 'A') + t.slice(1);
    expect((await ctx.api.post(`/api/sign/${tampered}`).send({ agree: true })).status).toBe(404);
    expect(await statusOf(docs[2].id)).toBe('sent');
  });

  it('declining stores the reason and closes the document', async () => {
    const t = tokens[docs[2].id];
    const res = await ctx.api.post(`/api/sign/${t}/decline`).send({ reason: 'Գումարը սխալ է' });
    expect(res.body).toEqual({ status: 'declined' });
    expect(await prisma.document.findUniqueOrThrow({ where: { id: docs[2].id } })).toMatchObject({ status: 'declined', declineReason: 'Գումարը սխալ է' });
    expect((await ctx.api.post(`/api/sign/${t}`).send({ agree: true })).body.error.code).toBe('ALREADY_DECLINED');
    expect((await ctx.api.get(`/api/sign/${t}`)).body.status).toBe('declined');
    const resend = await ctx.api.post('/api/documents/send').set(ctx.auth('coordinator')).send({ documentIds: [docs[2].id] });
    expect(resend.body.results[0]).toMatchObject({ ok: false, code: 'DOCUMENT_FINAL' });
  });

  it('an expired token is rejected and the waiting document becomes expired', async () => {
    const t = tokens[docs[4].id];
    ctx.clock.set(new Date(T0.getTime() + 14 * DAY + 1000));
    const view = await ctx.api.get(`/api/sign/${t}`);
    expect(view.status).toBe(410);
    expect(view.body.error.code).toBe('TOKEN_EXPIRED');
    expect((await ctx.api.post(`/api/sign/${t}`).send({ agree: true })).status).toBe(410);
    expect(await statusOf(docs[4].id)).toBe('expired');
    // sending again revives it
    const fresh = (await ctx.send([docs[4].id]))[docs[4].id];
    expect(await statusOf(docs[4].id)).toBe('sent');
    expect((await ctx.api.post(`/api/sign/${fresh}`).send({ agree: true })).status).toBe(200);
  });

  it('every step is in the audit log', async () => {
    const actions = (await prisma.auditLog.findMany({ where: { entityId: { in: docs.map((d) => d.id) } } })).map((a) => a.action);
    expect(new Set(actions)).toEqual(new Set(['document.sent', 'document.viewed', 'document.signed', 'document.declined', 'document.expired']));
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

  it('revokes open links, so the email link becomes a receipt', async () => {
    const token = (await ctx.send([docs[1].id]))[docs[1].id];
    const pdf = Buffer.from('%PDF-1.4\n%%EOF');
    expect((await ctx.api.post(`/api/documents/${docs[1].id}/paper-signature`).set(ctx.auth('coordinator')).attach('file', pdf, 'scan.pdf')).status).toBe(201);
    expect((await ctx.api.get(`/api/sign/${token}`)).body).toMatchObject({ status: 'signed', signatureMethod: 'paper' });
    expect((await ctx.api.post(`/api/sign/${token}`).send({ agree: true })).status).toBe(409);
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
  // 0 signed online · 1 declined · 2 signed on paper · 3 sent · 4 viewed · 5 never sent
  beforeAll(async () => {
    ({ ctx, docs } = await setup(6));
    tokens = await ctx.send(docs.slice(0, 5).map((d) => d.id));
    await ctx.api.post(`/api/sign/${tokens[docs[0].id]}`).send({ agree: true });
    await ctx.api.post(`/api/sign/${tokens[docs[1].id]}/decline`).send({});
    await ctx.api.post(`/api/documents/${docs[2].id}/paper-signature`).set(ctx.auth('coordinator')).attach('file', Buffer.from('%PDF-1.4'), 's.pdf');
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
      const post = await ctx.api.post(`/api/sign/${tokens[docs[i].id]}`).send({ agree: true });
      expect(post.status).toBe(409); // final, not "expired"
    }
    expect(await Promise.all(docs.slice(0, 3).map((d) => statusOf(d.id)))).toEqual(['signed', 'declined', 'signed']);
    expect(await prisma.auditLog.count({ where: { action: 'document.expired', entityId: { in: docs.slice(0, 3).map((d) => d.id) } } })).toBe(0);
  });

  it('opening an expired link of a waiting document expires it (same rule as the job)', async () => {
    await prisma.document.update({ where: { id: docs[3].id }, data: { status: 'sent' } }); // pretend the job hasn't run yet
    expect((await ctx.api.get(`/api/sign/${tokens[docs[3].id]}`)).status).toBe(410);
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
    expect(mail.subject).toBe(`Հիշեցում․ Ուսուցման պայմանագիր № ${docs[0].number} փաստաթուղթը սպասում է Ձեր հաստատմանը`);
    const fromReminder = tokenFromMail(mail.text)!;
    expect(fromReminder).not.toBe(original[docs[0].id]);

    const requests = await prisma.signatureRequest.findMany({ where: { documentId: docs[0].id } });
    expect(requests).toHaveLength(2);
    expect(new Set(requests.map((r) => r.expiresAt.getTime()))).toEqual(new Set([T0.getTime() + 14 * DAY]));
    expect(requests.every((r) => r.revokedAt === null)).toBe(true);

    ctx.clock.set(new Date(T0.getTime() + 14 * DAY - 60_000)); // one minute before expiry
    expect((await ctx.api.get(`/api/sign/${original[docs[0].id]}`)).status).toBe(200);
    expect((await ctx.api.get(`/api/sign/${fromReminder}`)).status).toBe(200);

    // signing with the reminder link closes both
    expect((await ctx.api.post(`/api/sign/${fromReminder}`).send({ agree: true })).status).toBe(200);
    expect((await ctx.api.post(`/api/sign/${original[docs[0].id]}`).send({ agree: true })).body.error.code).toBe('ALREADY_SIGNED');
  });

  it('automatic reminder: both links work until expiry, then both are rejected', async () => {
    ctx.clock.set(new Date(T0.getTime() + 2 * DAY));
    const before = ctx.mailer.sent.length;
    await ctx.services.reminders.runAuto();
    const mail = ctx.mailer.sent.slice(before).find((m) => m.to === docs[1].recipientEmail)!;
    const fromReminder = tokenFromMail(mail.text)!;

    for (const t of [original[docs[1].id], fromReminder]) expect((await ctx.api.get(`/api/sign/${t}`)).status).toBe(200);

    ctx.clock.set(new Date(T0.getTime() + 14 * DAY + 1));
    for (const t of [original[docs[1].id], fromReminder]) {
      const res = await ctx.api.get(`/api/sign/${t}`);
      expect(res.status).toBe(410);
      expect(res.body.error.code).toBe('TOKEN_EXPIRED');
    }
    expect(await statusOf(docs[1].id)).toBe('expired');
  });

  it('the original link can sign after a reminder was sent', async () => {
    await resetDb();
    ({ ctx, docs } = await setup(1));
    const first = (await ctx.send([docs[0].id]))[docs[0].id];
    await ctx.api.post(`/api/documents/${docs[0].id}/remind`).set(ctx.auth('coordinator'));
    expect((await ctx.api.post(`/api/sign/${first}`).send({ agree: true })).status).toBe(200);
  });
});
