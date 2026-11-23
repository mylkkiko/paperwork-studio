/**
 * Email settings: SMTP from .env, PUBLIC_APP_URL for links, and the MAIL_REDIRECT_TO test redirect
 * (never allowed in production).
 */
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { parseConfig, startupWarnings } from '../src/config';
import { MemoryMailer, RedirectingMailer, withRedirect } from '../src/integrations/mail/Mailer';
import { createTestContext, GROUP, READY_VALUES, resetDb, tokenFromMail } from './helpers/context';

const BASE = { DATABASE_URL: 'postgresql://x@localhost:5433/x', JWT_SECRET: 'test-secret-at-least-16-chars' };

describe('settings', () => {
  it('defaults: Mailpit on localhost:1025 without TLS or login, links to http://localhost:3100, no redirect', () => {
    const c = parseConfig({ ...BASE });
    expect(c).toMatchObject({ SMTP_HOST: 'localhost', SMTP_PORT: 1025, SMTP_SECURE: false, PUBLIC_APP_URL: 'http://localhost:3100' });
    expect([c.SMTP_USER, c.SMTP_PASSWORD, c.MAIL_REDIRECT_TO]).toEqual([undefined, undefined, undefined]);
  });

  it('reads SMTP and the public address from the environment', () => {
    const c = parseConfig({ ...BASE, SMTP_HOST: 'smtp.example.org', SMTP_PORT: '465', SMTP_SECURE: 'true', SMTP_USER: 'mailer', SMTP_PASSWORD: 's3cret', MAIL_FROM: 'Academy <docs@example.org>', PUBLIC_APP_URL: 'https://docs.example.org' });
    expect(c).toMatchObject({ SMTP_HOST: 'smtp.example.org', SMTP_PORT: 465, SMTP_SECURE: true, SMTP_USER: 'mailer', SMTP_PASSWORD: 's3cret', MAIL_FROM: 'Academy <docs@example.org>', PUBLIC_APP_URL: 'https://docs.example.org' });
  });

  it('the old APP_PUBLIC_URL name still works; PUBLIC_APP_URL wins', () => {
    expect(parseConfig({ ...BASE, APP_PUBLIC_URL: 'https://old.example.org' }).PUBLIC_APP_URL).toBe('https://old.example.org');
    expect(parseConfig({ ...BASE, APP_PUBLIC_URL: 'https://old.example.org', PUBLIC_APP_URL: 'https://new.example.org' }).PUBLIC_APP_URL).toBe('https://new.example.org');
  });

  it('an empty MAIL_REDIRECT_TO means "off"; an invalid one is rejected', () => {
    expect(parseConfig({ ...BASE, MAIL_REDIRECT_TO: '' }).MAIL_REDIRECT_TO).toBeUndefined();
    expect(parseConfig({ ...BASE, MAIL_REDIRECT_TO: '   ' }).MAIL_REDIRECT_TO).toBeUndefined();
    expect(() => parseConfig({ ...BASE, MAIL_REDIRECT_TO: 'not-an-email' })).toThrow();
  });
});

describe('MAIL_REDIRECT_TO production guard', () => {
  it.each(['development', 'test'])('allowed with NODE_ENV=%s, with a startup warning', (env) => {
    const c = parseConfig({ ...BASE, NODE_ENV: env, MAIL_REDIRECT_TO: 'qa@example.org' });
    expect(c.MAIL_REDIRECT_TO).toBe('qa@example.org');
    expect(startupWarnings(c)).toEqual([expect.stringContaining('EVERY outgoing email goes to qa@example.org')]);
  });

  it('no warning when the redirect is off', () => {
    expect(startupWarnings(parseConfig({ ...BASE }))).toEqual([]);
  });

  it('refused with NODE_ENV=production', () => {
    expect(() => parseConfig({ ...BASE, NODE_ENV: 'production', MAIL_REDIRECT_TO: 'qa@example.org' })).toThrow(/MAIL_REDIRECT_TO.*production.*Refusing to start/s);
    expect(parseConfig({ ...BASE, NODE_ENV: 'production', MAIL_REDIRECT_TO: '' }).MAIL_REDIRECT_TO).toBeUndefined(); // empty = off is fine
  });

  it('the server process refuses to start in production with the redirect set', () => {
    const tsx = join(__dirname, '..', 'node_modules', '.bin', 'tsx');
    const res = spawnSync(tsx, [join(__dirname, '..', 'src', 'server.ts')], {
      cwd: join(__dirname, '..'),
      env: { PATH: process.env.PATH, ...BASE, NODE_ENV: 'production', MAIL_REDIRECT_TO: 'qa@example.org', LOG_LEVEL: 'silent' },
      encoding: 'utf8',
      timeout: 30_000,
    });
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain('MAIL_REDIRECT_TO is set while NODE_ENV=production');
  });
});

describe('RedirectingMailer', () => {
  it('sends every email to the redirect address, with the original recipient on the first line', async () => {
    const inner = new MemoryMailer();
    const mailer = new RedirectingMailer(inner, 'qa@example.org');
    await mailer.send({ to: 'anna@student.academy.am', toName: 'Աննա Հակոբյան', subject: 'Թեմա', text: 'Բարև' });
    await mailer.send({ to: 'no-name@example.org', subject: 'S', text: 'T' });
    expect(inner.sent).toEqual([
      { to: 'qa@example.org', subject: 'Թեմա', text: 'Original recipient: Աննա Հակոբյան <anna@student.academy.am>\n\nԲարև' },
      { to: 'qa@example.org', subject: 'S', text: 'Original recipient: <no-name@example.org>\n\nT' },
    ]);
  });

  it('withRedirect wraps only when an address is set', () => {
    const inner = new MemoryMailer();
    expect(withRedirect(inner, undefined)).toBe(inner);
    expect(withRedirect(inner, 'qa@example.org')).toBeInstanceOf(RedirectingMailer);
  });

  it('real flow: the signing emails and the reminder all go to the redirect address', async () => {
    await resetDb();
    const ctx = await createTestContext({ config: { PUBLIC_APP_URL: 'https://docs.example.org' } });
    ctx.deps.mailer = withRedirect(ctx.mailer, 'qa@example.org');
    await ctx.seedBase();
    const { templateId } = await ctx.createTemplate('student_agreement_v1.docx');
    const { docs } = await ctx.generate({ templateId, recipientType: 'student', groupId: GROUP, recipientIds: ['stu-001', 'stu-002'], ...READY_VALUES });
    await ctx.api.post('/api/documents/send').set(ctx.auth('coordinator')).send({ documentIds: docs.map((d) => d.id) });
    await ctx.api.post(`/api/documents/${docs[0].id}/remind`).set(ctx.auth('coordinator'));

    expect(ctx.mailer.sent).toHaveLength(3);
    expect(new Set(ctx.mailer.sent.map((m) => m.to))).toEqual(new Set(['qa@example.org']));
    const firstLines = ctx.mailer.sent.map((m) => m.text.split('\n')[0]).sort();
    expect(firstLines).toEqual(
      [
        'Original recipient: Աննա Հակոբյան <anna.hakobyan@student.academy.am>',
        'Original recipient: Աննա Հակոբյան <anna.hakobyan@student.academy.am>',
        'Original recipient: Դավիթ Գրիգորյան <davit.grigoryan@student.academy.am>',
      ].sort(),
    );
    // links use PUBLIC_APP_URL, and the redirected email still carries a working link
    const token = tokenFromMail(ctx.mailer.sent[0].text)!;
    expect(ctx.mailer.sent[0].text).toContain(`https://docs.example.org/sign/${token}`);
    expect((await ctx.api.get(`/api/sign/${token}`)).status).toBe(200);
  });
});
