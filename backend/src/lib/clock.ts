/**
 * Injectable clock. Services take a Clock instead of calling `new Date()` directly,
 * so tests can move time forward (expired links, reminder schedule) without fake timers.
 */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

/** Test helper: a clock you can set and advance. */
export class FixedClock implements Clock {
  constructor(private current: Date) {}
  now() {
    return new Date(this.current);
  }
  set(d: Date) {
    this.current = d;
  }
  advanceDays(days: number) {
    this.current = new Date(this.current.getTime() + days * 86_400_000);
  }
}

export const DAY_MS = 86_400_000;
