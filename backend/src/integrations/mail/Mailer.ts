export interface MailMessage {
  to: string;
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
