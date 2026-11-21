import { Router } from 'express';
import { z } from 'zod';
import type { Services } from '../services';
import { requireRole, userId } from '../middleware/auth';
import { fieldKeySchema } from './schemas';

const base = {
  label: z.string().min(1).max(200),
  source: z.enum(['core', 'manual', 'system']),
  type: z.enum(['text', 'date', 'money', 'number']),
  format: z.string().max(50).nullish(),
  required: z.boolean().optional(),
};

export function mergeFieldsRoutes(s: Services) {
  const r = Router();
  r.get('/', async (_req, res) => {
    res.json({ items: await s.mergeFields.list() });
  });
  r.post('/', requireRole('admin'), async (req, res) => {
    const body = z.object({ key: fieldKeySchema, ...base }).parse(req.body);
    res.status(201).json(await s.mergeFields.create(userId(req), body));
  });
  r.patch('/:id', requireRole('admin'), async (req, res) => {
    const body = z.object(base).partial().parse(req.body);
    res.json(await s.mergeFields.update(userId(req), String(req.params.id), body));
  });
  return r;
}
