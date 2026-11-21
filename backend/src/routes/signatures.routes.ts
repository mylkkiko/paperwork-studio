import { Router } from 'express';
import { z } from 'zod';
import type { Services } from '../services';
import { requireRole } from '../middleware/auth';
import { localeOf, sendFile } from '../lib/http';
import { documentStatusSchema, optionalBool } from './schemas';

const filterSchema = z.object({
  groupId: z.string().optional(),
  templateId: z.string().uuid().optional(),
  status: documentStatusSchema.optional(),
  versionId: z.string().uuid().optional(),
  olderVersion: optionalBool,
});

export function signaturesRoutes(s: Services) {
  const r = Router();
  r.use(requireRole('coordinator'));
  r.get('/table', async (req, res) => {
    res.json({ items: await s.signatures.table(filterSchema.parse(req.query)) });
  });
  r.get('/export', async (req, res) => {
    const { format, ...filter } = filterSchema.extend({ format: z.enum(['csv', 'xlsx']).default('csv') }).parse(req.query);
    const locale = localeOf(req);
    const stamp = new Date().toISOString().slice(0, 10);
    if (format === 'xlsx') sendFile(res, await s.signatures.xlsx(filter, locale), `signatures-${stamp}.xlsx`);
    else sendFile(res, await s.signatures.csv(filter, locale), `signatures-${stamp}.csv`);
  });
  return r;
}
