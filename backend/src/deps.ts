import type { PrismaClient } from '@prisma/client';
import type { Config } from './config';
import type { Clock } from './lib/clock';
import type { CoreEngineClient } from './integrations/core-engine/CoreEngineClient';
import type { StorageService } from './integrations/storage/StorageService';
import type { PdfConverter } from './integrations/pdf/PdfConverter';
import type { Mailer } from './integrations/mail/Mailer';
import type { SummaryGenerator } from './services/summary/SummaryGenerator';

/** Runs batch generation somewhere: BullMQ in the app, inline in tests. */
export interface GenerationQueue {
  enqueue(batchId: string): Promise<void>;
}

/** Everything a service may need. Built once in container.ts; tests build their own with fakes. */
export interface Deps {
  config: Config;
  prisma: PrismaClient;
  clock: Clock;
  core: CoreEngineClient;
  storage: StorageService;
  pdf: PdfConverter;
  mailer: Mailer;
  summary: SummaryGenerator;
  queue: GenerationQueue;
}
