import { Router } from 'express';
import { z } from 'zod';
import type { Services } from '../services';
import { clientInfo, sendFile } from '../lib/http';

/**
 * Public routes — no login. The token in the URL is the only credential.
 * There is deliberately no POST /:token: signatures are handwritten on paper and recorded by the coordinator.
 */
export function signRoutes(s: Services) {
  const r = Router();
  r.get('/:token', async (req, res) => {
    res.json(await s.signing.view(req.params.token, clientInfo(req)));
  });
  r.get('/:token/pdf', async (req, res) => {
    const f = await s.signing.pdf(req.params.token);
    sendFile(res, f.buffer, f.fileName, { inline: true });
  });
  r.post('/:token/decline', async (req, res) => {
    const body = z.object({ reason: z.string().max(1000).optional() }).parse(req.body ?? {});
    res.json(await s.signing.decline(req.params.token, body.reason, clientInfo(req)));
  });
  return r;
}
