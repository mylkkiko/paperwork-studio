/** Resend HTTP API transport (MAIL_TRANSPORT=resend), with the HTTP call mocked. */
import { RESEND_URL, ResendMailer } from '../src/integrations/mail/ResendMailer';
import { RedirectingMailer, withRedirect } from '../src/integrations/mail/Mailer';
import { mailTransportInfo, parseConfig } from '../src/config';
import { createMailer } from '../src/container';

const BASE = { DATABASE_URL: 'postgresql://x@localhost:5433/x', JWT_SECRET: 'test-secret-at-least-16-chars' };
const KEY = 're_test_only_key_123';

function mockFetch(status = 200, body: unknown = { id: '49a3999c-0ce1-4ea6-ab68-afcd6dc2e794' }) {
  const calls: { url: string; init: { method: string; headers: Record<string, string>; body: string } }[] = [];
  const fn = jest.fn(async (url: string, init: { method: string; headers: Record<string, string>; body: string }) => {
    calls.push({ url, init });
    return { ok: status >= 200 && status < 300, status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) };
  });
  return { fn, calls };
}
const silentLog = () => ({ error: jest.fn() });

describe('Resend transport', () => {
  it('posts the email to the Resend API with a Bearer key and the MAIL_FROM sender', async () => {
    const { fn, calls } = mockFetch();
    const mailer = new ResendMailer(KEY, '"Paperwork Studio" <onboarding@resend.dev>', fn, silentLog());
    await mailer.send({ to: 'anna@student.academy.am', toName: 'Աննա Հակոբյան', subject: 'Ստորագրման համար՝ X № 1', text: 'Հարգելի Աննա,\n\nhttps://docs.example.org/sign/abc' });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(RESEND_URL);
    expect(RESEND_URL).toBe('https://api.resend.com/emails');
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.headers).toEqual({ authorization: `Bearer ${KEY}`, 'content-type': 'application/json', accept: 'application/json' });
    expect(JSON.parse(calls[0].init.body)).toEqual({
      from: 'Paperwork Studio <onboarding@resend.dev>',
      to: ['anna@student.academy.am'],
      subject: 'Ստորագրման համար՝ X № 1',
      text: 'Հարգելի Աննա,\n\nhttps://docs.example.org/sign/abc',
    });
  });

  it('MAIL_REDIRECT_TO applies: one address, original recipient on the first line', async () => {
    const { fn, calls } = mockFetch();
    const mailer = withRedirect(new ResendMailer(KEY, 'onboarding@resend.dev', fn, silentLog()), 'qa@example.org');
    await mailer.send({ to: 'anna@student.academy.am', toName: 'Աննա Հակոբյան', subject: 'S', text: 'Body' });
    const body = JSON.parse(calls[0].init.body);
    expect(body.to).toEqual(['qa@example.org']);
    expect(body.text).toBe('Original recipient: Աննա Հակոբյան <anna@student.academy.am>\n\nBody');
    expect(body.from).toBe('onboarding@resend.dev');
  });

  it('an API error is logged with status and message and the send fails; the key is never logged', async () => {
    const { fn } = mockFetch(403, { statusCode: 403, name: 'validation_error', message: 'You can only send testing emails to your own email address.' });
    const log = silentLog();
    const mailer = new ResendMailer(KEY, 'onboarding@resend.dev', fn, log);
    await expect(mailer.send({ to: 'a@b.am', subject: 'S', text: 'T' })).rejects.toThrow('Resend API error 403 validation_error: You can only send testing emails to your own email address.');
    expect(log.error).toHaveBeenCalledWith(
      { status: 403, name: 'validation_error', message: 'You can only send testing emails to your own email address.' },
      'Resend: send failed with HTTP 403: You can only send testing emails to your own email address.',
    );
    expect(JSON.stringify(log.error.mock.calls)).not.toContain(KEY);
  });

  it('a non-JSON error body and a network error are reported too', async () => {
    const log = silentLog();
    await expect(new ResendMailer(KEY, 'onboarding@resend.dev', mockFetch(502, 'Bad Gateway').fn, log).send({ to: 'a@b.am', subject: 'S', text: 'T' })).rejects.toThrow('Resend API error 502: Bad Gateway');
    const down = jest.fn(async () => {
      throw new Error('getaddrinfo ENOTFOUND api.resend.com');
    });
    await expect(new ResendMailer(KEY, 'onboarding@resend.dev', down, log).send({ to: 'a@b.am', subject: 'S', text: 'T' })).rejects.toThrow('Resend request failed: getaddrinfo ENOTFOUND api.resend.com');
    expect(log.error).toHaveBeenCalledTimes(2);
  });
});

describe('MAIL_TRANSPORT=resend setting', () => {
  it('needs RESEND_API_KEY and a sender address; refuses to start otherwise', () => {
    expect(() => parseConfig({ ...BASE, MAIL_TRANSPORT: 'resend' })).toThrow('MAIL_TRANSPORT=resend needs RESEND_API_KEY. Refusing to start.');
    expect(() => parseConfig({ ...BASE, MAIL_TRANSPORT: 'resend', BREVO_API_KEY: 'xkeysib-x' })).toThrow('needs RESEND_API_KEY'); // the other key doesn't count
    expect(() => parseConfig({ ...BASE, MAIL_TRANSPORT: 'resend', RESEND_API_KEY: KEY, MAIL_FROM: 'Paperwork Studio' })).toThrow('MAIL_TRANSPORT=resend needs MAIL_FROM with an email address');
    expect(parseConfig({ ...BASE, MAIL_TRANSPORT: 'resend', RESEND_API_KEY: KEY }).MAIL_TRANSPORT).toBe('resend');
  });

  it('the production guard for MAIL_REDIRECT_TO applies with resend as well', () => {
    expect(() => parseConfig({ ...BASE, NODE_ENV: 'production', MAIL_TRANSPORT: 'resend', RESEND_API_KEY: KEY, MAIL_REDIRECT_TO: 'qa@example.org' })).toThrow(/MAIL_REDIRECT_TO.*production/s);
  });

  it('createMailer picks Resend and wraps it with the redirect when set', () => {
    expect(createMailer(parseConfig({ ...BASE, MAIL_TRANSPORT: 'resend', RESEND_API_KEY: KEY }))).toBeInstanceOf(ResendMailer);
    expect(createMailer(parseConfig({ ...BASE, MAIL_TRANSPORT: 'resend', RESEND_API_KEY: KEY, MAIL_REDIRECT_TO: 'qa@example.org' }))).toBeInstanceOf(RedirectingMailer);
  });

  it('the startup line names the transport and never contains the key', () => {
    const line = mailTransportInfo(parseConfig({ ...BASE, MAIL_TRANSPORT: 'resend', RESEND_API_KEY: KEY, MAIL_FROM: 'Paperwork Studio <onboarding@resend.dev>' }));
    expect(line).toBe('Mail transport: resend (HTTPS API), sender Paperwork Studio <onboarding@resend.dev>');
    expect(line).not.toContain(KEY);
  });
});
