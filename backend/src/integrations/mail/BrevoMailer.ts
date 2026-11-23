import type { MailMessage, Mailer } from './Mailer';
import { logger as defaultLogger } from '../../lib/logger';

/** "Paperwork Studio <no-reply@academy.am>" -> { name, email }; a bare address -> { email }. Null if there's no address. */
export function parseAddress(value: string): { name?: string; email: string } | null {
  const m = value.trim().match(/^(?:"?([^"<]*?)"?\s*)?<([^<>\s]+@[^<>\s]+)>$/);
  if (m) return m[1]?.trim() ? { name: m[1].trim(), email: m[2] } : { email: m[2] };
  return /^[^<>\s]+@[^<>\s]+$/.test(value.trim()) ? { email: value.trim() } : null;
}

export const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;
type Log = Pick<typeof defaultLogger, 'error'>;

/**
 * Brevo transactional email over HTTPS (for hosts that block outbound SMTP).
 * Same message as the SMTP transport: plain text, one recipient. A failed send throws, like a failed SMTP send.
 */
export class BrevoMailer implements Mailer {
  private readonly sender: { name?: string; email: string };

  constructor(
    private readonly apiKey: string,
    from: string,
    private readonly fetchImpl: Fetch = fetch as unknown as Fetch,
    private readonly log: Log = defaultLogger,
  ) {
    const sender = parseAddress(from);
    if (!sender) throw new Error(`MAIL_FROM must contain an email address for the Brevo transport, got "${from}"`);
    this.sender = sender;
  }

  async send(msg: MailMessage) {
    const body = { sender: this.sender, to: [{ email: msg.to }], subject: msg.subject, textContent: msg.text };
    let res: Awaited<ReturnType<Fetch>>;
    try {
      res = await this.fetchImpl(BREVO_URL, {
        method: 'POST',
        headers: { 'api-key': this.apiKey, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (err) {
      this.log.error({ err: (err as Error).message }, 'Brevo: request failed (network)');
      throw new Error(`Brevo request failed: ${(err as Error).message}`);
    }
    if (!res.ok) {
      const raw = await res.text().catch(() => '');
      let code: string | undefined;
      let message = raw;
      try {
        const json = JSON.parse(raw) as { code?: string; message?: string };
        code = json.code;
        message = json.message ?? raw;
      } catch {
        /* not JSON: keep the raw text */
      }
      this.log.error({ status: res.status, code, message }, `Brevo: send failed with HTTP ${res.status}: ${message}`);
      throw new Error(`Brevo API error ${res.status}${code ? ` ${code}` : ''}: ${message}`);
    }
  }
}
