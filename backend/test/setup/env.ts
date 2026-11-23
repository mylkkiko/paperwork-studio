/**
 * Runs before every test file (before app modules are imported).
 * Tests use their own database: `paperwork_test` (created by docker/postgres-init.sql).
 */
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://paperwork:paperwork@localhost:5433/paperwork_test?schema=public';
process.env.JWT_SECRET = 'test-secret-at-least-16-chars';
process.env.PUBLIC_APP_URL = 'http://localhost:3100';
delete process.env.MAIL_REDIRECT_TO; // never redirect in tests unless a test asks for it
process.env.REMINDER_SCHEDULE_DAYS = '2,5';
process.env.SIGN_LINK_TTL_DAYS = '14';
process.env.APP_TIMEZONE = 'Asia/Yerevan';
process.env.GOTENBERG_URL = process.env.GOTENBERG_URL ?? 'http://localhost:3010';
process.env.LOG_LEVEL = 'silent';
