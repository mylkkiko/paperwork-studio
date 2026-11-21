import type { Role } from '@prisma/client';
import type { Deps } from '../deps';
import { conflict, notFound } from '../lib/errors';
import { hashPassword } from './auth.service';
import type { AuditService } from './audit.service';

const publicFields = { id: true, name: true, email: true, role: true, active: true, createdAt: true } as const;

export class UsersService {
  constructor(private readonly d: Pick<Deps, 'prisma'>, private readonly audit: AuditService) {}

  list() {
    return this.d.prisma.user.findMany({ select: publicFields, orderBy: { createdAt: 'asc' } });
  }

  async create(actorId: string, input: { name: string; email: string; password: string; role: Role }) {
    const email = input.email.toLowerCase().trim();
    if (await this.d.prisma.user.findUnique({ where: { email } })) throw conflict('EMAIL_TAKEN', 'A user with this email already exists');
    const user = await this.d.prisma.user.create({
      data: { name: input.name, email, role: input.role, passwordHash: await hashPassword(input.password) },
      select: publicFields,
    });
    await this.audit.log(actorId, 'user.created', 'User', user.id, { email, role: user.role });
    return user;
  }

  async update(actorId: string, id: string, input: { name?: string; role?: Role; password?: string; active?: boolean }) {
    if (!(await this.d.prisma.user.findUnique({ where: { id } }))) throw notFound('User');
    if (id === actorId && (input.active === false || (input.role && input.role !== 'admin'))) {
      throw conflict('SELF_LOCKOUT', 'You cannot deactivate yourself or remove your own admin role');
    }
    const user = await this.d.prisma.user.update({
      where: { id },
      data: {
        name: input.name,
        role: input.role,
        active: input.active,
        passwordHash: input.password ? await hashPassword(input.password) : undefined,
      },
      select: publicFields,
    });
    await this.audit.log(actorId, 'user.updated', 'User', id, { changed: Object.keys(input).filter((k) => k !== 'password') });
    return user;
  }
}
