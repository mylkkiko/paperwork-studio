import { prisma } from '../src/lib/prisma';
import { createTestContext, resetDb, type TestContext } from './helpers/context';

let ctx: TestContext;
beforeAll(async () => {
  await resetDb();
  ctx = await createTestContext();
  await ctx.seedBase();
});

describe('users (admin)', () => {
  it('lists users without password hashes', async () => {
    const res = await ctx.api.get('/api/users').set(ctx.auth('admin'));
    expect(res.body.items).toHaveLength(3);
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  it('creates a user who can then log in; duplicates are rejected', async () => {
    const res = await ctx.api.post('/api/users').set(ctx.auth('admin')).send({ name: 'Նոր Համակարգող', email: 'New@Academy.am', password: 'longenough1', role: 'coordinator' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ email: 'new@academy.am', role: 'coordinator', active: true });
    expect((await ctx.api.post('/api/auth/login').send({ email: 'new@academy.am', password: 'longenough1' })).status).toBe(200);
    const dup = await ctx.api.post('/api/users').set(ctx.auth('admin')).send({ name: 'x', email: 'new@academy.am', password: 'longenough1', role: 'editor' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('EMAIL_TAKEN');
    expect((await ctx.api.post('/api/users').set(ctx.auth('admin')).send({ name: 'x', email: 'y@academy.am', password: 'short', role: 'editor' })).status).toBe(400);
  });

  it('updates role, password and active flag; changes apply to existing tokens', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'new@academy.am' } });
    const token = (await ctx.api.post('/api/auth/login').send({ email: 'new@academy.am', password: 'longenough1' })).body.token;
    expect((await ctx.api.get('/api/batches').set('authorization', `Bearer ${token}`)).status).toBe(200);

    expect((await ctx.api.patch(`/api/users/${user.id}`).set(ctx.auth('admin')).send({ role: 'editor' })).body.role).toBe('editor');
    expect((await ctx.api.get('/api/batches').set('authorization', `Bearer ${token}`)).status).toBe(403);

    await ctx.api.patch(`/api/users/${user.id}`).set(ctx.auth('admin')).send({ password: 'anotherpass2' });
    expect((await ctx.api.post('/api/auth/login').send({ email: 'new@academy.am', password: 'anotherpass2' })).status).toBe(200);

    await ctx.api.patch(`/api/users/${user.id}`).set(ctx.auth('admin')).send({ active: false });
    expect((await ctx.api.get('/api/auth/me').set('authorization', `Bearer ${token}`)).status).toBe(401);
    expect((await ctx.api.post('/api/auth/login').send({ email: 'new@academy.am', password: 'anotherpass2' })).status).toBe(401);

    const actions = (await prisma.auditLog.findMany({ where: { entityId: user.id } })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['user.created', 'user.updated']));
    expect(JSON.stringify(await prisma.auditLog.findMany({ where: { entityId: user.id } }))).not.toContain('anotherpass2');
  });

  it('an admin cannot lock themselves out', async () => {
    const me = ctx.users.admin!.id;
    expect((await ctx.api.patch(`/api/users/${me}`).set(ctx.auth('admin')).send({ active: false })).body.error.code).toBe('SELF_LOCKOUT');
    expect((await ctx.api.patch(`/api/users/${me}`).set(ctx.auth('admin')).send({ role: 'editor' })).status).toBe(409);
    expect((await ctx.api.patch(`/api/users/${me}`).set(ctx.auth('admin')).send({ name: 'Ադմին' })).status).toBe(200);
    expect((await ctx.api.patch('/api/users/00000000-0000-0000-0000-000000000000').set(ctx.auth('admin')).send({ name: 'x' })).status).toBe(404);
  });
});

describe('merge-field dictionary (T-4)', () => {
  it('everyone can read it; it has the seeded fields with source and type', async () => {
    const res = await ctx.api.get('/api/merge-fields').set(ctx.auth('coordinator'));
    const byKey = Object.fromEntries(res.body.items.map((f: { key: string }) => [f.key, f]));
    expect(byKey['student.full_name']).toMatchObject({ source: 'core', type: 'text', required: true });
    expect(byKey['contract.amount']).toMatchObject({ source: 'manual', type: 'money' });
    expect(byKey['signature.checkbox']).toMatchObject({ source: 'system' });
  });

  it('admin adds and edits fields; keys are validated and unique', async () => {
    const created = await ctx.api.post('/api/merge-fields').set(ctx.auth('admin')).send({ key: 'contract.discount', label: 'Զեղչ', source: 'manual', type: 'money', required: false });
    expect(created.status).toBe(201);
    expect((await ctx.api.post('/api/merge-fields').set(ctx.auth('admin')).send({ key: 'contract.discount', label: 'x', source: 'manual', type: 'money' })).body.error.code).toBe('FIELD_EXISTS');
    expect((await ctx.api.post('/api/merge-fields').set(ctx.auth('admin')).send({ key: 'Bad Key', label: 'x', source: 'manual', type: 'text' })).status).toBe(400);
    const patched = await ctx.api.patch(`/api/merge-fields/${created.body.id}`).set(ctx.auth('admin')).send({ label: 'Զեղչի գումար', required: true });
    expect(patched.body).toMatchObject({ key: 'contract.discount', label: 'Զեղչի գումար', required: true });
    expect((await ctx.api.patch(`/api/merge-fields/${created.body.id}`).set(ctx.auth('admin')).send({ key: 'other.key' })).body.key).toBe('contract.discount');
    expect((await ctx.api.patch('/api/merge-fields/00000000-0000-0000-0000-000000000000').set(ctx.auth('admin')).send({ label: 'x' })).status).toBe(404);
  });

  it('audit log can be filtered by entity', async () => {
    const res = await ctx.api.get('/api/audit-log?entityType=MergeField&limit=10').set(ctx.auth('admin'));
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(res.body.items.every((a: { entityType: string }) => a.entityType === 'MergeField')).toBe(true);
  });
});
