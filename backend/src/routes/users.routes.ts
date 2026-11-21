import { Router } from 'express';
import { z } from 'zod';
import type { Services } from '../services';
import { requireRole, userId } from '../middleware/auth';
import { roleSchema } from './schemas';

export function usersRoutes(s: Services) {
  const r = Router();
  r.use(requireRole('admin'));
  r.get('/', async (_req, res) => {
    res.json({ items: await s.users.list() });
  });
  r.post('/', async (req, res) => {
    const body = z.object({ name: z.string().min(1).max(200), email: z.string().email(), password: z.string().min(8), role: roleSchema }).parse(req.body);
    res.status(201).json(await s.users.create(userId(req), body));
  });
  r.patch('/:id', async (req, res) => {
    const body = z
      .object({ name: z.string().min(1).max(200).optional(), role: roleSchema.optional(), password: z.string().min(8).optional(), active: z.boolean().optional() })
      .parse(req.body);
    res.json(await s.users.update(userId(req), String(req.params.id), body));
  });
  return r;
}
