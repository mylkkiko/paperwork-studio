import type { MailMessage, Mailer } from './Mailer';
import { parseAddress } from './BrevoMailer';
import { logger as defaultLogger } from '../../lib/logger';

export const RESEND_URL = 'https://api.resend.com/emails';

type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;
type Log = Pick<typeof defaultLogger, 'error'>;

/**
 * Resend transactional email over HTTPS (for hosts that block outbound SMTP).
 * Same message as the other transports: plain text, one recipient. A failed send throws, like a failed SMTP send.
 */
export class ResendMailer implements Mailer {
  private readonly from: string;

  constructor(
    private readonly apiKey: string,
    from: string,
    private readonly fetchImpl: Fetch = fetch as unknown as Fetch,
    private readonly log: Log = defaultLogger,
  ) {
    const sender = parseAddress(from);
    if (!sender) throw new Error(`MAIL_FROM must contain an email address for the Resend transport, got "${from}"`);
    this.from = sender.name ? `${sender.name} <${sender.email}>` : sender.email;
  }

  async send(msg: MailMessage) {
    const body = { from: this.from, to: [msg.to], subject: msg.subject, text: msg.text };
    let res: Awaited<ReturnType<Fetch>>;
    try {
      res = await this.fetchImpl(RESEND_URL, {
        method: 'POST',
        headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (err) {
      this.log.error({ err: (err as Error).message }, 'Resend: request failed (network)');
      throw new Error(`Resend request failed: ${(err as Error).message}`);
    }
    if (!res.ok) {
      const raw = await res.text().catch(() => '');
      let name: string | undefined;
      let message = raw;
      try {
        // Resend errors: { statusCode, name, message }
        const json = JSON.parse(raw) as { name?: string; message?: string };
        name = json.name;
        message = json.message ?? raw;
      } catch {
        /* not JSON: keep the raw text */
      }
      this.log.error({ status: res.status, name, message }, `Resend: send failed with HTTP ${res.status}: ${message}`);
      throw new Error(`Resend API error ${res.status}${name ? ` ${name}` : ''}: ${message}`);
    }
  }
}
