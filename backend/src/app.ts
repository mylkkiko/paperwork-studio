import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import type { Deps } from './deps';
import type { Services } from './services';
import { errorHandler, notFoundHandler } from './lib/errors';
import { logger } from './lib/logger';
import { authenticate } from './middleware/auth';
import { authRoutes } from './routes/auth.routes';
import { usersRoutes } from './routes/users.routes';
import { mergeFieldsRoutes } from './routes/merge-fields.routes';
import { coreRoutes } from './routes/core.routes';
import { templatesRoutes } from './routes/templates.routes';
import { batchesRoutes } from './routes/batches.routes';
import { documentsRoutes } from './routes/documents.routes';
import { signaturesRoutes } from './routes/signatures.routes';
import { signRoutes } from './routes/sign.routes';
import { auditRoutes } from './routes/audit.routes';

/** Builds the Express app without listening, so tests can drive it with Supertest. */
export function createApp(deps: Deps, services: Services) {
  const app = express();
  // Behind Docker/Next proxies: take the client IP from X-Forwarded-For only when the hop is a private address.
  app.set('trust proxy', 'loopback, linklocal, uniquelocal');
  app.disable('x-powered-by');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' }, frameguard: false, contentSecurityPolicy: false }));
  app.use(cors({ origin: deps.config.CORS_ORIGIN === '*' ? true : deps.config.CORS_ORIGIN.split(','), exposedHeaders: ['Content-Disposition'] }));
  app.use(express.json({ limit: '1mb' }));
  if (deps.config.NODE_ENV !== 'test') app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/api/health' } }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Public
  app.use('/api/auth', authRoutes(services));
  app.use('/api/sign', signRoutes(services));

  // Everything below requires a valid JWT; role checks are inside each router.
  const auth = authenticate(services);
  app.use('/api/users', auth, usersRoutes(services));
  app.use('/api/merge-fields', auth, mergeFieldsRoutes(services));
  app.use('/api/core', auth, coreRoutes(deps.core));
  app.use('/api/templates', auth, templatesRoutes(services));
  app.use('/api/batches', auth, batchesRoutes(services));
  app.use('/api/documents', auth, documentsRoutes(services));
  app.use('/api/signatures', auth, signaturesRoutes(services));
  app.use('/api/audit-log', auth, auditRoutes(services));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
