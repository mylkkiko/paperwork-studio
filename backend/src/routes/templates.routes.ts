import { Router } from 'express';
import { z } from 'zod';
import type { Services } from '../services';
import { requireRole, userId } from '../middleware/auth';
import { requireFile, upload } from '../middleware/upload';
import { localeOf, sendFile } from '../lib/http';
import { categorySchema, versionStatusSchema } from './schemas';

export function templatesRoutes(s: Services) {
  const r = Router();

  r.get('/', async (req, res) => {
    const q = z.object({ category: categorySchema.optional(), status: versionStatusSchema.optional(), q: z.string().max(200).optional() }).parse(req.query);
    res.json({ items: await s.templates.list(q) });
  });

  r.post('/', requireRole('editor'), upload.single('file'), async (req, res) => {
    const body = z.object({ title: z.string().min(1).max(300), category: categorySchema }).parse(req.body);
    const file = requireFile(req.file, ['docx']);
    res.status(201).json(await s.templates.create(userId(req), { ...body, file: file.buffer }));
  });

  r.get('/:id', async (req, res) => {
    res.json(await s.templates.get(String(req.params.id)));
  });

  r.delete('/:id', requireRole('admin'), async (req, res) => {
    await s.templates.remove(userId(req), String(req.params.id));
    res.status(204).end();
  });

  r.post('/:id/versions', requireRole('editor'), upload.single('file'), async (req, res) => {
    const file = requireFile(req.file, ['docx']);
    res.status(201).json(await s.templates.addVersion(userId(req), String(req.params.id), file.buffer));
  });

  r.get('/:id/versions/:vid', async (req, res) => {
    const version = await s.templates.getVersion(String(req.params.id), String(req.params.vid));
    // The stored summary is Armenian; English is regenerated from the stored comparison on request.
    const locale = localeOf(req);
    const generatedSummary = version.comparison && locale !== 'hy' ? await s.templates.summarize(version.comparison as never, locale) : null;
    res.json({ ...version, generatedSummary });
  });

  r.patch('/:id/versions/:vid', requireRole('editor'), async (req, res) => {
    const body = z.object({ changeSummary: z.string().max(10_000) }).parse(req.body);
    res.json(await s.templates.updateSummary(userId(req), String(req.params.id), String(req.params.vid), body.changeSummary));
  });

  r.post('/:id/versions/:vid/publish', requireRole('editor'), async (req, res) => {
    res.json(await s.templates.publish(userId(req), String(req.params.id), String(req.params.vid)));
  });

  r.get('/:id/versions/:vid/preview', async (req, res) => {
    sendFile(res, await s.templates.preview(String(req.params.id), String(req.params.vid)), 'preview.pdf', { inline: true });
  });

  r.get('/:id/compare', async (req, res) => {
    const q = z.object({ from: z.string().uuid(), to: z.string().uuid() }).parse(req.query);
    const comparison = await s.templates.compare(String(req.params.id), q.from, q.to);
    res.json({ ...comparison, summary: await s.templates.summarize(comparison, localeOf(req)) });
  });

  return r;
}
