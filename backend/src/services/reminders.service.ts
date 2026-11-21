/**
 * Automatic reminders (S-5).
 *
 * Schedule: REMINDER_SCHEDULE_DAYS (default "2,5") = days after the document was (last) sent.
 * A scheduled job (BullMQ repeatable, hourly by default) calls runAuto():
 *   1. documents waiting for a signature (sent / viewed) whose links all expired -> status "expired"
 *   2. for the remaining waiting documents, if a schedule day has passed and no auto reminder was sent for
 *      it yet -> send ONE reminder (if the job was down and several days are overdue, only one email goes out).
 * Signed, declined, expired and not-yet-sent documents are never reminded.
 */
import type { Deps } from '../deps';
import { DAY_MS } from '../lib/clock';
import type { AuditService } from './audit.service';
import type { SignLinksService } from './sign-links.service';

/**
 * Which schedule day is due now, or null.
 * @param sentAt          when the document was last sent
 * @param lastAutoDay     highest schedule day already reminded since sentAt (0 if none)
 */
export function dueScheduleDay(sentAt: Date, now: Date, scheduleDays: number[], lastAutoDay: number): number | null {
  const elapsedDays = (now.getTime() - sentAt.getTime()) / DAY_MS;
  const due = scheduleDays.filter((d) => d > lastAutoDay && elapsedDays >= d);
  return due.length ? Math.max(...due) : null;
}

/** For display: dates when auto reminders will be sent. */
export function reminderDates(sentAt: Date, scheduleDays: number[]): Date[] {
  return scheduleDays.map((d) => new Date(sentAt.getTime() + d * DAY_MS));
}

export class RemindersService {
  constructor(
    private readonly d: Pick<Deps, 'prisma' | 'clock' | 'config'>,
    private readonly audit: AuditService,
    private readonly links: SignLinksService,
  ) {}

  async runAuto() {
    const now = this.d.clock.now();
    let expired = 0;
    let reminded = 0;

    const waiting = await this.d.prisma.document.findMany({
      where: { status: { in: ['sent', 'viewed'] }, sentAt: { not: null } },
      include: { templateVersion: { include: { template: true } }, reminders: { where: { type: 'auto' } } },
    });

    for (const doc of waiting) {
      const active = await this.links.activeRequest(doc.id);
      if (!active) {
        await this.d.prisma.document.update({ where: { id: doc.id }, data: { status: 'expired' } });
        await this.audit.log(null, 'document.expired', 'Document', doc.id, {});
        expired++;
        continue;
      }
      const sentAt = doc.sentAt!;
      const lastAutoDay = Math.max(0, ...doc.reminders.filter((r) => r.sentAt >= sentAt && r.scheduleDay).map((r) => r.scheduleDay!));
      const day = dueScheduleDay(sentAt, now, this.d.config.REMINDER_SCHEDULE_DAYS, lastAutoDay);
      if (day === null) continue;

      const { token } = await this.links.issueAdditional(doc.id, active.expiresAt);
      await this.links.email('reminder', doc, token, active.expiresAt);
      await this.d.prisma.reminder.create({ data: { documentId: doc.id, type: 'auto', scheduleDay: day, sentAt: now } });
      await this.audit.log(null, 'document.reminded', 'Document', doc.id, { type: 'auto', scheduleDay: day });
      reminded++;
    }
    return { checked: waiting.length, reminded, expired };
  }
}
