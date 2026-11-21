import { Router } from 'express';
import { z } from 'zod';
import type { Services } from '../services';
import { requireRole } from '../middleware/auth';

export function auditRoutes(s: Services) {
  const r = Router();
  r.get('/', requireRole('admin'), async (req, res) => {
    const q = z.object({ entityType: z.string().optional(), entityId: z.string().optional(), limit: z.coerce.number().int().positive().optional() }).parse(req.query);
    res.json({ items: await s.audit.list(q) });
  });
  return r;
}
