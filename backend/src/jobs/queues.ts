/**
 * Background jobs (BullMQ + Redis):
 *  - "generation": one job per batch (G-7). Progress is stored on the batch row, so polling
 *    GET /api/batches/:id works from any API instance.
 *  - "reminders": a repeatable job on REMINDER_CRON that runs RemindersService.runAuto() (S-5).
 */
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import type { GenerationQueue } from '../deps';
import type { Services } from '../services';
import type { Config } from '../config';
import { logger } from '../lib/logger';

const connection = (url: string) => new IORedis(url, { maxRetriesPerRequest: null });

export class BullGenerationQueue implements GenerationQueue {
  private readonly queue: Queue;
  constructor(redisUrl: string) {
    this.queue = new Queue('generation', { connection: connection(redisUrl) });
  }
  async enqueue(batchId: string) {
    // jobId = batchId: enqueueing the same batch twice is a no-op.
    await this.queue.add('generate', { batchId }, { jobId: batchId, attempts: 2, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 100, removeOnFail: 100 });
  }
  close() {
    return this.queue.close();
  }
}

/** Test/dev helper: runs generation in-process right away (no Redis). `idle()` waits for running jobs. */
export class InlineGenerationQueue implements GenerationQueue {
  handler?: (batchId: string) => Promise<void>;
  private running = new Set<Promise<void>>();
  async enqueue(batchId: string) {
    const p = Promise.resolve()
      .then(() => this.handler!(batchId))
      .catch((err) => logger.error({ err, batchId }, 'inline generation failed'))
      .finally(() => this.running.delete(p));
    this.running.add(p);
  }
  async idle() {
    while (this.running.size) await Promise.all([...this.running]);
  }
}

export async function startWorkers(services: Services, config: Config) {
  const generation = new Worker('generation', async (job) => services.processBatch(job.data.batchId), {
    connection: connection(config.REDIS_URL),
    concurrency: 2,
  });
  generation.on('failed', (job, err) => logger.error({ err, batchId: job?.data.batchId }, 'generation job failed'));

  const reminderQueue = new Queue('reminders', { connection: connection(config.REDIS_URL) });
  await reminderQueue.upsertJobScheduler('auto-reminders', { pattern: config.REMINDER_CRON }, { name: 'run' });
  const reminders = new Worker(
    'reminders',
    async () => {
      const result = await services.reminders.runAuto();
      logger.info(result, 'auto reminders run');
      return result;
    },
    { connection: connection(config.REDIS_URL) },
  );

  return async () => {
    await Promise.all([generation.close(), reminders.close(), reminderQueue.close()]);
  };
}
