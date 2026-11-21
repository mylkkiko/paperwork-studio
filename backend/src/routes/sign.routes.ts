import { Router } from 'express';
import { z } from 'zod';
import type { Services } from '../services';
import { clientInfo, sendFile } from '../lib/http';
import { badRequest } from '../lib/errors';

/** Public routes — no login. The token in the URL is the only credential. */
export function signRoutes(s: Services) {
  const r = Router();
  r.get('/:token', async (req, res) => {
    res.json(await s.signing.view(req.params.token, clientInfo(req)));
  });
  r.get('/:token/pdf', async (req, res) => {
    const f = await s.signing.pdf(req.params.token);
    sendFile(res, f.buffer, f.fileName, { inline: true });
  });
  r.post('/:token', async (req, res) => {
    const body = z.object({ agree: z.boolean() }).parse(req.body ?? {});
    if (!body.agree) throw badRequest('You must tick the confirmation checkbox');
    res.json(await s.signing.sign(req.params.token, clientInfo(req)));
  });
  r.post('/:token/decline', async (req, res) => {
    const body = z.object({ reason: z.string().max(1000).optional() }).parse(req.body ?? {});
    res.json(await s.signing.decline(req.params.token, body.reason, clientInfo(req)));
  });
  return r;
}
