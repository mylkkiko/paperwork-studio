import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Role } from '@prisma/client';
import type { Services } from '../services';
import type { AuthUser } from '../services/auth.service';
import { forbidden, unauthorized } from '../lib/errors';

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

/** Requires "Authorization: Bearer <jwt>" and puts the user on req.user. */
export const authenticate =
  (services: Services): RequestHandler =>
  async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const header = req.header('authorization') ?? '';
      const [scheme, token] = header.split(' ');
      if (scheme?.toLowerCase() !== 'bearer' || !token) throw unauthorized();
      req.user = await services.auth.verify(token);
      next();
    } catch (err) {
      next(err);
    }
  };

/** Allow the listed roles. Admin can do everything, so admin always passes. */
export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (req.user.role === 'admin' || roles.includes(req.user.role)) return next();
    next(forbidden(`Requires role: ${roles.join(' or ')}`));
  };

export const userId = (req: Request) => req.user!.id;
