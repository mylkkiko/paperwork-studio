import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { Role, User } from '@prisma/client';
import type { Deps } from '../deps';
import { unauthorized } from '../lib/errors';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export const toAuthUser = (u: User): AuthUser => ({ id: u.id, name: u.name, email: u.email, role: u.role });

export const hashPassword = (pw: string) => bcrypt.hash(pw, 10);

export class AuthService {
  constructor(private readonly d: Pick<Deps, 'prisma' | 'config'>) {}

  async login(email: string, password: string) {
    const user = await this.d.prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    // Same error for unknown email and wrong password, so emails can't be probed.
    if (!user || !user.active || !(await bcrypt.compare(password, user.passwordHash))) {
      throw unauthorized('Invalid email or password');
    }
    const token = jwt.sign({ sub: user.id, role: user.role }, this.d.config.JWT_SECRET, {
      expiresIn: this.d.config.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    });
    return { token, user: toAuthUser(user) };
  }

  /** Verifies the JWT and re-reads the user, so deactivated users and role changes take effect immediately. */
  async verify(token: string): Promise<AuthUser> {
    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(token, this.d.config.JWT_SECRET) as jwt.JwtPayload;
    } catch {
      throw unauthorized('Invalid or expired token');
    }
    const user = payload.sub ? await this.d.prisma.user.findUnique({ where: { id: payload.sub } }) : null;
    if (!user || !user.active) throw unauthorized('User no longer active');
    return toAuthUser(user);
  }
}
