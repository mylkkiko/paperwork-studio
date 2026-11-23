import 'dotenv/config';
import { z } from 'zod';

const blankAsUndefined = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== '' ? v : undefined));

/** All environment variables, validated once at startup. See .env.example for descriptions. */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  /** Public address of the site; every link in emails (/sign/<token>) is built from it. Read at startup. */
  PUBLIC_APP_URL: z.string().url().default('http://localhost:3100'),
  CORS_ORIGIN: z.string().default('*'),
  APP_TIMEZONE: z.string().default('Asia/Yerevan'),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string().default('redis://localhost:6380'),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default('8h'),
  STORAGE_DIR: z.string().default('./storage'),
  GOTENBERG_URL: z.string().default('http://localhost:3010'),
  /** smtp (default; local Mailpit or any SMTP server) | brevo (Brevo HTTP API, for hosts that block SMTP) */
  MAIL_TRANSPORT: z.enum(['smtp', 'brevo']).default('smtp'),
  BREVO_API_KEY: blankAsUndefined,
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_SECURE: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  SMTP_USER: blankAsUndefined,
  SMTP_PASSWORD: blankAsUndefined,
  MAIL_FROM: z.string().default('Paperwork Studio <no-reply@academy.am>'),
  /** Test environments only: every email goes to this one address instead of the real recipient. */
  MAIL_REDIRECT_TO: z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), z.string().trim().email().optional()),
  SIGN_LINK_TTL_DAYS: z.coerce.number().int().positive().default(14),
  REMINDER_SCHEDULE_DAYS: z
    .string()
    .default('2,5')
    .transform((s) => s.split(',').map((d) => Number(d.trim())).filter((d) => d > 0).sort((a, b) => a - b)),
  REMINDER_CRON: z.string().default('0 * * * *'),
  GENERATION_CONCURRENCY: z.coerce.number().int().positive().default(4),
});

export type Config = z.infer<typeof schema>;

/** Validate the environment. Throws (so the server refuses to start) on invalid or unsafe settings. */
export function parseConfig(env: NodeJS.ProcessEnv): Config {
  const parsed = schema.parse({
    ...env,
    // the old name still works, so existing .env files keep their email links
    PUBLIC_APP_URL: env.PUBLIC_APP_URL || env.APP_PUBLIC_URL || undefined,
  });
  if (parsed.NODE_ENV === 'production' && parsed.MAIL_REDIRECT_TO) {
    throw new Error(
      'MAIL_REDIRECT_TO is set while NODE_ENV=production. The email redirect is for test environments only; ' +
        'remove MAIL_REDIRECT_TO (or use NODE_ENV=development/test). Refusing to start.',
    );
  }
  if (parsed.MAIL_TRANSPORT === 'brevo') {
    if (!parsed.BREVO_API_KEY) throw new Error('MAIL_TRANSPORT=brevo needs BREVO_API_KEY. Refusing to start.');
    if (!/<[^<>\s]+@[^<>\s]+>\s*$|^[^<>\s]+@[^<>\s]+$/.test(parsed.MAIL_FROM.trim())) {
      throw new Error(`MAIL_TRANSPORT=brevo needs MAIL_FROM with an email address, e.g. "Paperwork Studio <docs@example.org>". Refusing to start.`);
    }
  }
  return parsed;
}

export const config: Config = parseConfig(process.env);

/** Logged at startup: which mail transport is active (never the key or password). */
export function mailTransportInfo(c: Pick<Config, 'MAIL_TRANSPORT' | 'MAIL_FROM' | 'SMTP_HOST' | 'SMTP_PORT' | 'SMTP_SECURE' | 'SMTP_USER'>): string {
  return c.MAIL_TRANSPORT === 'brevo'
    ? `Mail transport: brevo (HTTPS API), sender ${c.MAIL_FROM}`
    : `Mail transport: smtp ${c.SMTP_HOST}:${c.SMTP_PORT} (${c.SMTP_SECURE ? 'TLS' : 'STARTTLS if offered'}, ${c.SMTP_USER ? 'with login' : 'no login'}), sender ${c.MAIL_FROM}`;
}

/** Logged at startup. */
export function startupWarnings(c: Pick<Config, 'MAIL_REDIRECT_TO'>): string[] {
  return c.MAIL_REDIRECT_TO
    ? [`MAIL_REDIRECT_TO is set: EVERY outgoing email goes to ${c.MAIL_REDIRECT_TO} instead of the real recipient (test environments only).`]
    : [];
}
