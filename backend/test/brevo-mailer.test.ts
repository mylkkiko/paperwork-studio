/** Brevo HTTP API transport (MAIL_TRANSPORT=brevo), with the HTTP call mocked. */
import { BREVO_URL, BrevoMailer, parseAddress } from '../src/integrations/mail/BrevoMailer';
import { RedirectingMailer, withRedirect } from '../src/integrations/mail/Mailer';
import { NodemailerMailer } from '../src/integrations/mail/NodemailerMailer';
import { mailTransportInfo, parseConfig } from '../src/config';
import { createMailer } from '../src/container';

const BASE = { DATABASE_URL: 'postgresql://x@localhost:5433/x', JWT_SECRET: 'test-secret-at-least-16-chars' };
const KEY = 'xkeysib-test-only-key';

function mockFetch(status = 201, body: unknown = { messageId: '<1@smtp-relay.mailin.fr>' }) {
  const calls: { url: string; init: { method: string; headers: Record<string, string>; body: string } }[] = [];
  const fn = jest.fn(async (url: string, init: { method: string; headers: Record<string, string>; body: string }) => {
    calls.push({ url, init });
    return { ok: status >= 200 && status < 300, status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) };
  });
  return { fn, calls };
}
const silentLog = () => ({ error: jest.fn() });

describe('Brevo transport', () => {
  it('posts the email to the Brevo API with the api-key header and the MAIL_FROM sender', async () => {
    const { fn, calls } = mockFetch();
    const mailer = new BrevoMailer(KEY, 'Paperwork Studio <docs@example.org>', fn, silentLog());
    await mailer.send({ to: 'anna@student.academy.am', toName: 'Աննա Հակոբյան', subject: 'Ստորագրման համար՝ X № 1', text: 'Հարգելի Աննա,\n\nhttps://docs.example.org/sign/abc' });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(BREVO_URL);
    expect(BREVO_URL).toBe('https://api.brevo.com/v3/smtp/email');
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.headers).toEqual({ 'api-key': KEY, 'content-type': 'application/json', accept: 'application/json' });
    expect(JSON.parse(calls[0].init.body)).toEqual({
      sender: { name: 'Paperwork Studio', email: 'docs@example.org' },
      to: [{ email: 'anna@student.academy.am' }],
      subject: 'Ստորագրման համար՝ X № 1',
      textContent: 'Հարգելի Աննա,\n\nhttps://docs.example.org/sign/abc',
    });
  });

  it('MAIL_REDIRECT_TO applies to Brevo too: one address, original recipient on the first line', async () => {
    const { fn, calls } = mockFetch();
    const mailer = withRedirect(new BrevoMailer(KEY, 'docs@example.org', fn, silentLog()), 'qa@example.org');
    await mailer.send({ to: 'anna@student.academy.am', toName: 'Աննա Հակոբյան', subject: 'S', text: 'Body' });
    const body = JSON.parse(calls[0].init.body);
    expect(body.to).toEqual([{ email: 'qa@example.org' }]);
    expect(body.textContent).toBe('Original recipient: Աննա Հակոբյան <anna@student.academy.am>\n\nBody');
    expect(body.sender).toEqual({ email: 'docs@example.org' });
  });

  it('an API error is logged with status and message and the send fails (as a failed SMTP send does)', async () => {
    const { fn } = mockFetch(401, { code: 'unauthorized', message: 'Key not found' });
    const log = silentLog();
    const mailer = new BrevoMailer(KEY, 'docs@example.org', fn, log);
    await expect(mailer.send({ to: 'a@b.am', subject: 'S', text: 'T' })).rejects.toThrow('Brevo API error 401 unauthorized: Key not found');
    expect(log.error).toHaveBeenCalledWith({ status: 401, code: 'unauthorized', message: 'Key not found' }, 'Brevo: send failed with HTTP 401: Key not found');
    expect(JSON.stringify(log.error.mock.calls)).not.toContain(KEY);
  });

  it('a non-JSON error body and a network error are reported too', async () => {
    const log = silentLog();
    await expect(new BrevoMailer(KEY, 'docs@example.org', mockFetch(502, 'Bad Gateway').fn, log).send({ to: 'a@b.am', subject: 'S', text: 'T' })).rejects.toThrow('Brevo API error 502: Bad Gateway');
    const down = jest.fn(async () => {
      throw new Error('getaddrinfo ENOTFOUND api.brevo.com');
    });
    await expect(new BrevoMailer(KEY, 'docs@example.org', down, log).send({ to: 'a@b.am', subject: 'S', text: 'T' })).rejects.toThrow('Brevo request failed: getaddrinfo ENOTFOUND api.brevo.com');
    expect(log.error).toHaveBeenCalledTimes(2);
  });

  it('parses MAIL_FROM', () => {
    expect(parseAddress('Paperwork Studio <no-reply@academy.am>')).toEqual({ name: 'Paperwork Studio', email: 'no-reply@academy.am' });
    expect(parseAddress('"Academy Docs" <docs@example.org>')).toEqual({ name: 'Academy Docs', email: 'docs@example.org' });
    expect(parseAddress('<docs@example.org>')).toEqual({ email: 'docs@example.org' });
    expect(parseAddress('docs@example.org')).toEqual({ email: 'docs@example.org' });
    expect(parseAddress('Paperwork Studio')).toBeNull();
  });
});

describe('MAIL_TRANSPORT setting', () => {
  it('defaults to smtp; brevo needs BREVO_API_KEY and a sender address', () => {
    expect(parseConfig({ ...BASE }).MAIL_TRANSPORT).toBe('smtp');
    expect(() => parseConfig({ ...BASE, MAIL_TRANSPORT: 'brevo' })).toThrow('MAIL_TRANSPORT=brevo needs BREVO_API_KEY');
    expect(() => parseConfig({ ...BASE, MAIL_TRANSPORT: 'brevo', BREVO_API_KEY: KEY, MAIL_FROM: 'Paperwork Studio' })).toThrow('needs MAIL_FROM with an email address');
    expect(() => parseConfig({ ...BASE, MAIL_TRANSPORT: 'sendgrid' })).toThrow();
    expect(parseConfig({ ...BASE, MAIL_TRANSPORT: 'brevo', BREVO_API_KEY: KEY }).MAIL_TRANSPORT).toBe('brevo');
  });

  it('the production guard for MAIL_REDIRECT_TO applies with brevo as well', () => {
    expect(() => parseConfig({ ...BASE, NODE_ENV: 'production', MAIL_TRANSPORT: 'brevo', BREVO_API_KEY: KEY, MAIL_REDIRECT_TO: 'qa@example.org' })).toThrow(/MAIL_REDIRECT_TO.*production/s);
  });

  it('createMailer picks the transport and wraps it with the redirect when set', () => {
    expect(createMailer(parseConfig({ ...BASE }))).toBeInstanceOf(NodemailerMailer);
    expect(createMailer(parseConfig({ ...BASE, MAIL_TRANSPORT: 'brevo', BREVO_API_KEY: KEY }))).toBeInstanceOf(BrevoMailer);
    const redirected = createMailer(parseConfig({ ...BASE, MAIL_TRANSPORT: 'brevo', BREVO_API_KEY: KEY, MAIL_REDIRECT_TO: 'qa@example.org' }));
    expect(redirected).toBeInstanceOf(RedirectingMailer);
  });

  it('the startup line names the transport and never contains the key or password', () => {
    const brevo = mailTransportInfo(parseConfig({ ...BASE, MAIL_TRANSPORT: 'brevo', BREVO_API_KEY: KEY, MAIL_FROM: 'Docs <docs@example.org>' }));
    expect(brevo).toBe('Mail transport: brevo (HTTPS API), sender Docs <docs@example.org>');
    const smtp = mailTransportInfo(parseConfig({ ...BASE, SMTP_HOST: 'smtp.example.org', SMTP_PORT: '587', SMTP_USER: 'u', SMTP_PASSWORD: 'p4ss' }));
    expect(smtp).toContain('Mail transport: smtp smtp.example.org:587');
    expect(brevo + smtp).not.toMatch(new RegExp(`${KEY}|p4ss`));
  });
});
