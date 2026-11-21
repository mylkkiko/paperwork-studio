import 'dotenv/config';
import { z } from 'zod';

/** All environment variables, validated once at startup. See .env.example for descriptions. */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  APP_PUBLIC_URL: z.string().default('http://localhost:3100'),
  CORS_ORIGIN: z.string().default('*'),
  APP_TIMEZONE: z.string().default('Asia/Yerevan'),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string().default('redis://localhost:6380'),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default('8h'),
  STORAGE_DIR: z.string().default('./storage'),
  GOTENBERG_URL: z.string().default('http://localhost:3010'),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().default(1025),
  MAIL_FROM: z.string().default('Paperwork Studio <no-reply@academy.am>'),
  SIGN_LINK_TTL_DAYS: z.coerce.number().int().positive().default(14),
  REMINDER_SCHEDULE_DAYS: z
    .string()
    .default('2,5')
    .transform((s) => s.split(',').map((d) => Number(d.trim())).filter((d) => d > 0).sort((a, b) => a - b)),
  REMINDER_CRON: z.string().default('0 * * * *'),
  GENERATION_CONCURRENCY: z.coerce.number().int().positive().default(4),
});

export type Config = z.infer<typeof schema>;
export const config: Config = schema.parse(process.env);
