export interface MailMessage {
  to: string;
  /** Recipient's name, shown in the redirect note (test environments). */
  toName?: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(msg: MailMessage): Promise<void>;
}

/** Test double: keeps sent messages in memory. */
export class MemoryMailer implements Mailer {
  sent: MailMessage[] = [];
  async send(msg: MailMessage) {
    this.sent.push(msg);
  }
}

/**
 * Test environments (MAIL_REDIRECT_TO): every email goes to ONE address instead of the real recipient, with the
 * original recipient on the first line of the body. Never used in production (the config refuses to start).
 */
export class RedirectingMailer implements Mailer {
  constructor(
    private readonly inner: Mailer,
    readonly redirectTo: string,
  ) {}

  async send(msg: MailMessage) {
    const original = msg.toName ? `${msg.toName} <${msg.to}>` : `<${msg.to}>`;
    await this.inner.send({ to: this.redirectTo, subject: msg.subject, text: `Original recipient: ${original}\n\n${msg.text}` });
  }
}

/** Wraps the real mailer with the redirect when MAIL_REDIRECT_TO is set. */
export function withRedirect(mailer: Mailer, redirectTo: string | undefined): Mailer {
  return redirectTo ? new RedirectingMailer(mailer, redirectTo) : mailer;
}
