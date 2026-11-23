import { config } from './config';
import type { Deps, GenerationQueue } from './deps';
import { prisma } from './lib/prisma';
import { systemClock } from './lib/clock';
import { StubCoreEngineClient } from './integrations/core-engine/StubCoreEngineClient';
import { LocalStorageService } from './integrations/storage/LocalStorageService';
import { GotenbergPdfConverter } from './integrations/pdf/GotenbergPdfConverter';
import { NodemailerMailer } from './integrations/mail/NodemailerMailer';
import { withRedirect, type Mailer } from './integrations/mail/Mailer';
import { BrevoMailer } from './integrations/mail/BrevoMailer';
import type { Config } from './config';
import { RuleBasedSummaryGenerator } from './services/summary/RuleBasedSummaryGenerator';

/** MAIL_TRANSPORT picks SMTP or the Brevo HTTP API; MAIL_REDIRECT_TO (test only) wraps either one. */
export function createMailer(c: Config): Mailer {
  const transport =
    c.MAIL_TRANSPORT === 'brevo'
      ? new BrevoMailer(c.BREVO_API_KEY!, c.MAIL_FROM)
      : new NodemailerMailer({ host: c.SMTP_HOST, port: c.SMTP_PORT, secure: c.SMTP_SECURE, user: c.SMTP_USER, password: c.SMTP_PASSWORD, from: c.MAIL_FROM });
  return withRedirect(transport, c.MAIL_REDIRECT_TO);
}

/** Production wiring. Swap an implementation here (e.g. HttpCoreEngineClient, S3StorageService) and nothing else changes. */
export function createDeps(queue: GenerationQueue): Deps {
  return {
    config,
    prisma,
    clock: systemClock,
    core: new StubCoreEngineClient(),
    storage: new LocalStorageService(config.STORAGE_DIR),
    pdf: new GotenbergPdfConverter(config.GOTENBERG_URL),
    mailer: createMailer(config),
    summary: new RuleBasedSummaryGenerator(),
    queue,
  };
}
