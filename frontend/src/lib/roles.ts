import type { Role } from './types';

/**
 * What each role may do in the UI. Mirrors the backend role checks (admin can do everything).
 * The UI hides what a role can't do; the API still enforces it (and 403s are handled gracefully).
 */
export const can = {
  manageTemplates: (r?: Role) => r === 'admin' || r === 'editor',
  deleteTemplates: (r?: Role) => r === 'admin',
  generate: (r?: Role) => r === 'admin' || r === 'coordinator',
  manageSignatures: (r?: Role) => r === 'admin' || r === 'coordinator',
  admin: (r?: Role) => r === 'admin',
};
