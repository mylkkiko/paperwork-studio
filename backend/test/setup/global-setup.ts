import { execSync } from 'node:child_process';

/** Once per `npm test`: bring the test database schema up to date. */
export default async function globalSetup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://paperwork:paperwork@localhost:5433/paperwork_test?schema=public';
  try {
    execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });
  } catch (err) {
    const out = (err as { stdout?: Buffer; stderr?: Buffer });
    throw new Error(
      `Could not migrate the test database (${url}).\nIs Postgres running? Start it with: docker compose up -d postgres gotenberg\n` +
        (out.stderr?.toString() ?? '') + (out.stdout?.toString() ?? ''),
    );
  }
}
