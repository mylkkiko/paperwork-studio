/**
 * The browser always talks to the API on the SAME origin as the site: relative "/api", proxied to the backend by a
 * Next.js rewrite (next.config.ts). No API address is baked into the build, so any public address works as is.
 */
export const API_BASE = '/api';
export const APP_ENV = process.env.NEXT_PUBLIC_APP_ENV ?? 'development';
/** Demo logins with one-click buttons: dev/test only, never in production. */
export const SHOW_DEMO_LOGINS = APP_ENV !== 'production';
