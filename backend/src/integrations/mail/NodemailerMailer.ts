import nodemailer, { type Transporter } from 'nodemailer';
import type { MailMessage, Mailer } from './Mailer';

export interface SmtpOptions {
  host: string;
  port: number;
  /** true = TLS from the first byte (usually port 465); false = plain, upgraded with STARTTLS when offered (587) */
  secure: boolean;
  user?: string;
  password?: string;
  from: string;
}

export class NodemailerMailer implements Mailer {
  private readonly transport: Transporter;
  private readonly from: string;

  constructor(o: SmtpOptions) {
    this.from = o.from;
    this.transport = nodemailer.createTransport({
      host: o.host,
      port: o.port,
      secure: o.secure,
      auth: o.user ? { user: o.user, pass: o.password ?? '' } : undefined,
      // Local Mailpit: plain SMTP without auth or TLS (as before). Real servers with a login use STARTTLS when offered.
      ignoreTLS: !o.secure && !o.user,
    });
  }

  async send(msg: MailMessage) {
    await this.transport.sendMail({ from: this.from, to: msg.to, subject: msg.subject, text: msg.text });
  }
}
