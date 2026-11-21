import { Router } from 'express';
import { z } from 'zod';
import type { Services } from '../services';
import { requireRole, userId } from '../middleware/auth';
import { requireFile, upload } from '../middleware/upload';
import { sendFile } from '../lib/http';
import { documentStatusSchema } from './schemas';

export function documentsRoutes(s: Services) {
  const r = Router();
  r.use(requireRole('coordinator'));

  r.get('/', async (req, res) => {
    const q = z
      .object({ batchId: z.string().uuid().optional(), groupId: z.string().optional(), status: documentStatusSchema.optional(), versionId: z.string().uuid().optional(), templateId: z.string().uuid().optional() })
      .parse(req.query);
    res.json({ items: await s.documents.list(q) });
  });

  r.post('/send', async (req, res) => {
    const body = z.object({ documentIds: z.array(z.string().uuid()).min(1).max(500) }).parse(req.body);
    res.json(await s.documents.send(userId(req), body.documentIds));
  });

  r.post('/resend-new-version', async (req, res) => {
    const body = z
      .object({ templateId: z.string().uuid(), documentIds: z.array(z.string().uuid()).optional(), commonValues: z.record(z.union([z.string(), z.number(), z.null()])).optional() })
      .parse(req.body);
    res.status(202).json(await s.documents.resendNewVersion(userId(req), body));
  });

  r.get('/:id/pdf', async (req, res) => {
    const f = await s.documents.pdf(String(req.params.id), req.query.original === '1' ? 'original' : 'auto');
    sendFile(res, f.buffer, f.fileName, { inline: req.query.inline === '1' });
  });
  r.get('/:id/docx', async (req, res) => {
    const f = await s.documents.docx(String(req.params.id));
    sendFile(res, f.buffer, f.fileName);
  });
  r.get('/:id/scan', async (req, res) => {
    const f = await s.documents.scan(String(req.params.id));
    sendFile(res, f.buffer, f.fileName, { inline: true });
  });

  r.post('/:id/remind', async (req, res) => {
    res.status(201).json(await s.documents.remind(userId(req), String(req.params.id)));
  });

  r.post('/:id/paper-signature', upload.single('file'), async (req, res) => {
    const body = z.object({ signerName: z.string().max(200).optional(), signedAt: z.coerce.date().optional() }).parse(req.body ?? {});
    const scan = requireFile(req.file, ['pdf', 'png', 'jpg']);
    res.status(201).json(await s.documents.paperSignature(userId(req), String(req.params.id), { buffer: scan.buffer, ext: scan.type }, body));
  });

  return r;
}
