import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { createTestContext, resetDb, type TestContext } from './helpers/context';

let ctx: TestContext;
beforeAll(async () => {
  await resetDb();
  ctx = await createTestContext();
  await ctx.seedBase();
});

describe('login', () => {
  it('returns a JWT and the user for valid credentials (email is case-insensitive)', async () => {
    const res = await ctx.api.post('/api/auth/login').send({ email: 'Coordinator@Academy.am', password: 'Coord123!' });
    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({ id: ctx.users.coordinator!.id, name: expect.any(String), email: 'coordinator@academy.am', role: 'coordinator' });
    expect(jwt.decode(res.body.token)).toMatchObject({ sub: ctx.users.coordinator!.id, role: 'coordinator' });
  });

  it('gives the same 401 for a wrong password and an unknown email', async () => {
    const a = await ctx.api.post('/api/auth/login').send({ email: 'editor@academy.am', password: 'nope' });
    const b = await ctx.api.post('/api/auth/login').send({ email: 'ghost@academy.am', password: 'nope' });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body).toEqual(b.body);
    expect(a.body.error).toEqual({ code: 'UNAUTHORIZED', message: 'Invalid email or password' });
  });

  it('validates the body', async () => {
    const res = await ctx.api.post('/api/auth/login').send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(res.body.error.details)).toBe(true);
  });

  it('rejects malformed JSON with a JSON error', async () => {
    const res = await ctx.api.post('/api/auth/login').set('content-type', 'application/json').send('{"email":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });

  it('GET /me returns the current user', async () => {
    const res = await ctx.api.get('/api/auth/me').set(ctx.auth('editor'));
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('editor');
  });

  it('rejects expired, forged and malformed tokens', async () => {
    const expired = jwt.sign({ sub: ctx.users.admin!.id, role: 'admin' }, ctx.deps.config.JWT_SECRET, { expiresIn: -10 });
    const forged = jwt.sign({ sub: ctx.users.admin!.id, role: 'admin' }, 'some-other-secret-value');
    for (const header of [`Bearer ${expired}`, `Bearer ${forged}`, 'Bearer', 'Basic abc', '']) {
      const res = await ctx.api.get('/api/auth/me').set('authorization', header);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    }
  });

  it('a deactivated user is locked out immediately, even with a valid token', async () => {
    const user = await prisma.user.create({ data: { name: 'Temp', email: 'temp@academy.am', role: 'editor', passwordHash: 'x', active: false } });
    const token = jwt.sign({ sub: user.id, role: 'editor' }, ctx.deps.config.JWT_SECRET);
    const res = await ctx.api.get('/api/auth/me').set('authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it('unknown routes return a JSON 404', async () => {
    const res = await ctx.api.get('/api/nope').set(ctx.auth('admin'));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ROUTE_NOT_FOUND');
  });
});

/**
 * Every protected route × every role. "allowed" lists the non-admin roles that pass (admin always passes).
 * For allowed roles we only assert the role check passed (status is not 401/403): the bogus ids/bodies used here
 * then fail validation or lookup, which other test files cover.
 */
describe('role checks on every protected route', () => {
  const X = randomUUID();
  const ANY: Role[] = ['editor', 'coordinator'];
  const routes: [method: 'get' | 'post' | 'patch' | 'delete', path: string, allowed: Role[]][] = [
    ['get', '/api/auth/me', ANY],
    ['get', '/api/users', []],
    ['post', '/api/users', []],
    ['patch', `/api/users/${X}`, []],
    ['get', '/api/merge-fields', ANY],
    ['post', '/api/merge-fields', []],
    ['patch', `/api/merge-fields/${X}`, []],
    ['get', '/api/core/groups', ANY],
    ['get', '/api/core/groups/grp-web-2026-a/students', ANY],
    ['get', '/api/core/staff', ANY],
    ['get', '/api/core/partners', ANY],
    ['get', '/api/templates', ANY],
    ['post', '/api/templates', ['editor']],
    ['get', `/api/templates/${X}`, ANY],
    ['delete', `/api/templates/${X}`, []],
    ['post', `/api/templates/${X}/versions`, ['editor']],
    ['get', `/api/templates/${X}/versions/${X}`, ANY],
    ['patch', `/api/templates/${X}/versions/${X}`, ['editor']],
    ['post', `/api/templates/${X}/versions/${X}/publish`, ['editor']],
    ['get', `/api/templates/${X}/versions/${X}/preview`, ANY],
    ['get', `/api/templates/${X}/compare?from=${X}&to=${X}`, ANY],
    ['post', '/api/batches/precheck', ['coordinator']],
    ['post', '/api/batches', ['coordinator']],
    ['get', '/api/batches', ['coordinator']],
    ['get', `/api/batches/${X}`, ['coordinator']],
    ['get', `/api/batches/${X}/zip`, ['coordinator']],
    ['get', `/api/batches/${X}/merged-pdf`, ['coordinator']],
    ['get', '/api/documents', ['coordinator']],
    ['get', `/api/documents/${X}/pdf`, ['coordinator']],
    ['get', `/api/documents/${X}/docx`, ['coordinator']],
    ['get', `/api/documents/${X}/scan`, ['coordinator']],
    ['post', '/api/documents/send', ['coordinator']],
    ['post', `/api/documents/${X}/remind`, ['coordinator']],
    ['post', `/api/documents/${X}/paper-signature`, ['coordinator']],
    ['post', '/api/documents/resend-new-version', ['coordinator']],
    ['get', '/api/signatures/table', ['coordinator']],
    ['get', '/api/signatures/export?format=csv', ['coordinator']],
    ['get', '/api/audit-log', []],
  ];

  it.each(routes)('%s %s without a token -> 401', async (method, path) => {
    const res = await ctx.api[method](path);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  const cases = routes.flatMap(([method, path, allowed]) =>
    (['admin', 'editor', 'coordinator'] as Role[]).map((role) => [role, method, path, role === 'admin' || allowed.includes(role)] as const),
  );

  it.each(cases)('%s: %s %s (allowed=%s)', async (role, method, path, allowed) => {
    const res = await ctx.api[method](path).set(ctx.auth(role)).send({});
    if (allowed) {
      expect([401, 403]).not.toContain(res.status);
    } else {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
  });
});

describe('public signing routes need no login', () => {
  it.each([
    ['get', '/api/sign/unknown-token'],
    ['get', '/api/sign/unknown-token/pdf'],
    ['post', '/api/sign/unknown-token/decline'],
  ] as const)('%s %s -> 404 for an unknown token (not 401)', async (method, path) => {
    const res = await ctx.api[method](path).send({});
    expect(res.status).toBe(404);
  });
});
