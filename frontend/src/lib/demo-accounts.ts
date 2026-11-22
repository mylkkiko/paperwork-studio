import type { Role } from './types';

/**
 * Seeded demo accounts (see backend/prisma/seed.ts) for the one-click logins on the login page.
 * NEXT_PUBLIC_APP_ENV is inlined at build time, so in a production build this is a constant empty list and the
 * credentials are not shipped in the JavaScript bundle at all.
 */
export const DEMO_ACCOUNTS: { role: Role; email: string; password: string }[] =
  process.env.NEXT_PUBLIC_APP_ENV !== 'production'
    ? [
        { role: 'admin', email: 'admin@academy.am', password: 'Admin123!' },
        { role: 'editor', email: 'editor@academy.am', password: 'Editor123!' },
        { role: 'coordinator', email: 'coordinator@academy.am', password: 'Coord123!' },
      ]
    : [];
