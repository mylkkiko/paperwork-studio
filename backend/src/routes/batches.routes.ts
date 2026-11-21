import { Router } from 'express';
import { z } from 'zod';
import type { Services } from '../services';
import { requireRole, userId } from '../middleware/auth';
import { sendFile } from '../lib/http';
import { batchInputSchema } from './schemas';

export function batchesRoutes(s: Services) {
  const r = Router();
  r.use(requireRole('coordinator'));

  r.post('/precheck', async (req, res) => {
    res.json(await s.batches.precheck(batchInputSchema.parse(req.body)));
  });
  r.post('/', async (req, res) => {
    res.status(202).json(await s.batches.create(userId(req), batchInputSchema.parse(req.body)));
  });
  r.get('/', async (req, res) => {
    const q = z.object({ groupId: z.string().optional(), limit: z.coerce.number().int().positive().optional() }).parse(req.query);
    res.json({ items: await s.batches.list(q) });
  });
  r.get('/:id', async (req, res) => {
    res.json(await s.batches.get(String(req.params.id)));
  });
  r.get('/:id/zip', async (req, res) => {
    const f = await s.batches.file(String(req.params.id), 'zip');
    sendFile(res, f.buffer, f.fileName);
  });
  r.get('/:id/merged-pdf', async (req, res) => {
    const f = await s.batches.file(String(req.params.id), 'merged');
    sendFile(res, f.buffer, f.fileName, { inline: req.query.inline === '1' });
  });
  return r;
}
