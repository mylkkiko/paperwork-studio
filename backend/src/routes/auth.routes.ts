import { Router } from 'express';
import { z } from 'zod';
import type { Services } from '../services';
import { authenticate } from '../middleware/auth';

export function authRoutes(s: Services) {
  const r = Router();
  r.post('/login', async (req, res) => {
    const body = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
    res.json(await s.auth.login(body.email, body.password));
  });
  r.get('/me', authenticate(s), (req, res) => {
    res.json({ user: req.user });
  });
  return r;
}
