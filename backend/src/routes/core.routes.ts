import { Router } from 'express';
import type { Deps } from '../deps';
import { notFound } from '../lib/errors';

/** Read-only proxy to the Core Engine. Passport numbers are stripped: lists never show them. */
export function coreRoutes(core: Deps['core']) {
  const r = Router();
  r.get('/groups', async (_req, res) => {
    res.json({ items: await core.listGroups() });
  });
  r.get('/groups/:id/students', async (req, res) => {
    if (!(await core.getGroup(req.params.id))) throw notFound('Group');
    const students = await core.listGroupStudents(req.params.id);
    res.json({ items: students.map(({ passport: _p, ...s }) => ({ ...s, hasPassport: Boolean(_p) })) });
  });
  r.get('/staff', async (_req, res) => {
    res.json({ items: await core.listStaff() });
  });
  r.get('/partners', async (_req, res) => {
    res.json({ items: await core.listPartners() });
  });
  return r;
}
