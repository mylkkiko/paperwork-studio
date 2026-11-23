import { config } from './config';
import type { Deps, GenerationQueue } from './deps';
import { prisma } from './lib/prisma';
import { systemClock } from './lib/clock';
import { StubCoreEngineClient } from './integrations/core-engine/StubCoreEngineClient';
import { LocalStorageService } from './integrations/storage/LocalStorageService';
import { GotenbergPdfConverter } from './integrations/pdf/GotenbergPdfConverter';
import { NodemailerMailer } from './integrations/mail/NodemailerMailer';
import { withRedirect } from './integrations/mail/Mailer';
import { RuleBasedSummaryGenerator } from './services/summary/RuleBasedSummaryGenerator';

/** Production wiring. Swap an implementation here (e.g. HttpCoreEngineClient, S3StorageService) and nothing else changes. */
export function createDeps(queue: GenerationQueue): Deps {
  return {
    config,
    prisma,
    clock: systemClock,
    core: new StubCoreEngineClient(),
    storage: new LocalStorageService(config.STORAGE_DIR),
    pdf: new GotenbergPdfConverter(config.GOTENBERG_URL),
    mailer: withRedirect(
      new NodemailerMailer({ host: config.SMTP_HOST, port: config.SMTP_PORT, secure: config.SMTP_SECURE, user: config.SMTP_USER, password: config.SMTP_PASSWORD, from: config.MAIL_FROM }),
      config.MAIL_REDIRECT_TO,
    ),
    summary: new RuleBasedSummaryGenerator(),
    queue,
  };
}
