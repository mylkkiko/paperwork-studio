import { config } from './config';
import type { Deps, GenerationQueue } from './deps';
import { prisma } from './lib/prisma';
import { systemClock } from './lib/clock';
import { StubCoreEngineClient } from './integrations/core-engine/StubCoreEngineClient';
import { LocalStorageService } from './integrations/storage/LocalStorageService';
import { GotenbergPdfConverter } from './integrations/pdf/GotenbergPdfConverter';
import { NodemailerMailer } from './integrations/mail/NodemailerMailer';
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
    mailer: new NodemailerMailer(config.SMTP_HOST, config.SMTP_PORT, config.MAIL_FROM),
    summary: new RuleBasedSummaryGenerator(),
    queue,
  };
}
