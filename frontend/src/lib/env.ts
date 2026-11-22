/** Public runtime settings (inlined at build time by Next.js). */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api').replace(/\/$/, '');
export const APP_ENV = process.env.NEXT_PUBLIC_APP_ENV ?? 'development';
/** Demo logins with one-click buttons: dev/test only, never in production. */
export const SHOW_DEMO_LOGINS = APP_ENV !== 'production';
