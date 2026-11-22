import { API_URL, MAILPIT } from './api';

/** The stack must be running; start from an empty mailbox so email lookups are unambiguous. */
export default async function globalSetup() {
  const base = process.env.BASE_URL ?? 'http://localhost:3100';
  for (const [name, url] of [['frontend', `${base}/login`], ['backend', `${API_URL}/health`], ['mailpit', `${MAILPIT}/api/v1/info`]]) {
    const ok = await fetch(url).then((r) => r.ok).catch(() => false);
    if (!ok) throw new Error(`${name} is not reachable at ${url}. Start the stack first: docker compose up -d --build`);
  }
  await fetch(`${MAILPIT}/api/v1/messages`, { method: 'DELETE' });
}
