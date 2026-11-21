import nodemailer, { type Transporter } from 'nodemailer';
import type { MailMessage, Mailer } from './Mailer';

export class NodemailerMailer implements Mailer {
  private readonly transport: Transporter;

  constructor(host: string, port: number, private readonly from: string) {
    // Mailpit accepts plain SMTP without auth/TLS. Production would add auth + secure options here.
    this.transport = nodemailer.createTransport({ host, port, secure: false, ignoreTLS: true });
  }

  async send(msg: MailMessage) {
    await this.transport.sendMail({ from: this.from, to: msg.to, subject: msg.subject, text: msg.text });
  }
}
