import { prisma } from '../src/lib/prisma';
import { dueScheduleDay, reminderDates } from '../src/services/reminders.service';
import { createTestContext, GROUP, READY_VALUES, resetDb, T0, type ContextOptions } from './helpers/context';

const DAY = 86_400_000;
const at = (days: number) => new Date(T0.getTime() + days * DAY);

describe('schedule computation (pure)', () => {
  const schedule = [2, 5];
  it.each([
    [1.99, 0, null],
    [2, 0, 2],
    [3, 2, null],
    [4.9, 2, null],
    [5, 2, 5],
    [6, 5, null],
    [6, 0, 5], // job was down for days: only the latest due reminder, not both
    [100, 5, null],
  ])('%s days after sending, last auto day %s -> %s', (days, last, expected) => {
    expect(dueScheduleDay(T0, at(days), schedule, last)).toBe(expected);
  });

  it('supports any schedule', () => {
    expect(dueScheduleDay(T0, at(1), [1, 3, 7], 0)).toBe(1);
    expect(dueScheduleDay(T0, at(8), [1, 3, 7], 3)).toBe(7);
    expect(dueScheduleDay(T0, at(8), [], 0)).toBeNull();
    expect(reminderDates(T0, [2, 5])).toEqual([at(2), at(5)]);
  });
});

async function setup(n: number, opts: ContextOptions = {}) {
  await resetDb();
  const ctx = await createTestContext(opts);
  await ctx.seedBase();
  const { templateId } = await ctx.createTemplate('student_agreement_v1.docx');
  const ids = Array.from({ length: n }, (_, i) => `stu-${String(i + 1).padStart(3, '0')}`);
  const { docs } = await ctx.generate({ templateId, recipientType: 'student', groupId: GROUP, recipientIds: ids, ...READY_VALUES });
  return { ctx, docs };
}

describe('automatic reminders (S-5)', () => {
  it('day 2 and day 5 after sending, once each, only to unsigned recipients', async () => {
    const { ctx, docs } = await setup(5);
    const tokens = await ctx.send(docs.slice(0, 4).map((d) => d.id)); // docs[4] is never sent
    await ctx.api.post(`/api/sign/${tokens[docs[0].id]}`).send({ agree: true });
    await ctx.api.post(`/api/sign/${tokens[docs[1].id]}/decline`).send({});
    await ctx.api.get(`/api/sign/${tokens[docs[3].id]}`); // viewed but not signed: still reminded
    const remindedIds = async () => (await prisma.reminder.findMany({ where: { type: 'auto' }, orderBy: { sentAt: 'asc' } })).map((r) => [r.documentId, r.scheduleDay]);

    ctx.clock.set(at(1.9));
    expect(await ctx.services.reminders.runAuto()).toMatchObject({ reminded: 0 });

    ctx.clock.set(at(2));
    const mailsBefore = ctx.mailer.sent.length;
    expect(await ctx.services.reminders.runAuto()).toEqual({ checked: 2, reminded: 2, expired: 0 });
    expect(ctx.mailer.sent.slice(mailsBefore).map((m) => m.to).sort()).toEqual([docs[2].recipientEmail, docs[3].recipientEmail].sort());
    expect(await remindedIds()).toEqual(expect.arrayContaining([[docs[2].id, 2], [docs[3].id, 2]]));

    ctx.clock.set(at(3));
    expect(await ctx.services.reminders.runAuto()).toMatchObject({ reminded: 0 }); // hourly runs don't repeat

    ctx.clock.set(at(5));
    expect(await ctx.services.reminders.runAuto()).toMatchObject({ reminded: 2 });
    ctx.clock.set(at(13));
    expect(await ctx.services.reminders.runAuto()).toMatchObject({ reminded: 0, expired: 0 });
    expect(await prisma.reminder.count()).toBe(4);
    expect(await prisma.reminder.count({ where: { documentId: { in: [docs[0].id, docs[1].id, docs[4].id] } } })).toBe(0);

    // every reminder is logged in the audit trail
    expect(await prisma.auditLog.count({ where: { action: 'document.reminded' } })).toBe(4);
  });

  it('if the job was down, a late run sends one reminder, not one per missed day', async () => {
    const { ctx, docs } = await setup(1);
    await ctx.send([docs[0].id]);
    ctx.clock.set(at(6));
    expect(await ctx.services.reminders.runAuto()).toMatchObject({ reminded: 1 });
    expect(await prisma.reminder.findMany()).toEqual([expect.objectContaining({ scheduleDay: 5, type: 'auto' })]);
    expect(await ctx.services.reminders.runAuto()).toMatchObject({ reminded: 0 });
  });

  it('sending again restarts the schedule from the new send date', async () => {
    const { ctx, docs } = await setup(1);
    await ctx.send([docs[0].id]);
    ctx.clock.set(at(5));
    await ctx.services.reminders.runAuto(); // day-5 reminder of the first send
    await ctx.send([docs[0].id]); // resend at day 5
    ctx.clock.set(at(6));
    expect(await ctx.services.reminders.runAuto()).toMatchObject({ reminded: 0 });
    ctx.clock.set(at(7)); // 2 days after the resend
    expect(await ctx.services.reminders.runAuto()).toMatchObject({ reminded: 1 });
    expect((await prisma.reminder.findMany({ orderBy: { sentAt: 'asc' } })).map((r) => r.scheduleDay)).toEqual([5, 2]);
  });

  it('the schedule is configurable', async () => {
    const { ctx, docs } = await setup(1, { config: { REMINDER_SCHEDULE_DAYS: [1, 3] } });
    await ctx.send([docs[0].id]);
    ctx.clock.set(at(1));
    expect(await ctx.services.reminders.runAuto()).toMatchObject({ reminded: 1 });
    ctx.clock.set(at(2));
    expect(await ctx.services.reminders.runAuto()).toMatchObject({ reminded: 0 });
    ctx.clock.set(at(3));
    expect(await ctx.services.reminders.runAuto()).toMatchObject({ reminded: 1 });
  });

  it('documents whose links expired are marked expired and never reminded again', async () => {
    const { ctx, docs } = await setup(1);
    await ctx.send([docs[0].id]);
    ctx.clock.set(at(15));
    expect(await ctx.services.reminders.runAuto()).toEqual({ checked: 1, reminded: 0, expired: 1 });
    ctx.clock.set(at(20));
    expect(await ctx.services.reminders.runAuto()).toEqual({ checked: 0, reminded: 0, expired: 0 });
    expect(await prisma.reminder.count()).toBe(0);
  });
});

describe('"remind now" button (S-5)', () => {
  it('sends a reminder email and logs it', async () => {
    const { ctx, docs } = await setup(1);
    await ctx.send([docs[0].id]);
    const before = ctx.mailer.sent.length;
    const res = await ctx.api.post(`/api/documents/${docs[0].id}/remind`).set(ctx.auth('coordinator'));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ type: 'manual', documentId: docs[0].id });
    expect(ctx.mailer.sent.slice(before)).toHaveLength(1);
    expect(ctx.mailer.sent.at(-1)!.text).toContain('դեռ հաստատված չէ');
    const list = await ctx.api.get(`/api/documents?batchId=${docs[0].batchId}`).set(ctx.auth('coordinator'));
    expect(list.body.items[0].reminderCount).toBe(1);
  });

  it('refuses documents that are not sent, signed, declined or expired', async () => {
    const { ctx, docs } = await setup(4);
    const remind = (id: string) => ctx.api.post(`/api/documents/${id}/remind`).set(ctx.auth('coordinator'));

    expect((await remind(docs[0].id)).body.error.code).toBe('NOT_SENT');
    const tokens = await ctx.send(docs.slice(1).map((d) => d.id));
    await ctx.api.post(`/api/sign/${tokens[docs[1].id]}`).send({ agree: true });
    await ctx.api.post(`/api/sign/${tokens[docs[2].id]}/decline`).send({});
    for (const i of [1, 2]) {
      const res = await remind(docs[i].id);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('DOCUMENT_FINAL');
    }
    ctx.clock.set(at(15));
    const expired = await remind(docs[3].id);
    expect(expired.status).toBe(409);
    expect(expired.body.error.code).toBe('LINK_EXPIRED');
    expect((await remind('00000000-0000-0000-0000-000000000000')).status).toBe(404);
    expect(await prisma.reminder.count()).toBe(0);
  });
});
