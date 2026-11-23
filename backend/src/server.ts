import { config, startupWarnings } from './config';
import { createDeps } from './container';
import { createServices } from './services';
import { createApp } from './app';
import { BullGenerationQueue, startWorkers } from './jobs/queues';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';

async function main() {
  for (const warning of startupWarnings(config)) logger.warn(warning);
  const queue = new BullGenerationQueue(config.REDIS_URL);
  const deps = createDeps(queue);
  const services = createServices(deps);
  const stopWorkers = await startWorkers(services, config);
  const app = createApp(deps, services);
  const server = app.listen(config.PORT, () => logger.info(`Paperwork Studio API on http://localhost:${config.PORT}`));

  const shutdown = async () => {
    logger.info('Shutting down…');
    server.close();
    await stopWorkers();
    await queue.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  logger.error({ err }, 'Failed to start');
  process.exit(1);
});
