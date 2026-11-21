/**
 * Formatting of values for Armenian documents.
 *   formatDateHy(2026-11-21)  -> "21 նոյեմբերի 2026 թ."   (genitive month names)
 *   formatMoneyAmd(150000)    -> "150 000 ֏"
 * Thousands are separated with a NO-BREAK SPACE (U+00A0) so amounts never wrap across lines in Word/PDF.
 */
import { config } from '../config';

const MONTHS_GENITIVE = [
  'հունվարի', 'փետրվարի', 'մարտի', 'ապրիլի', 'մայիսի', 'հունիսի',
  'հուլիսի', 'օգոստոսի', 'սեպտեմբերի', 'հոկտեմբերի', 'նոյեմբերի', 'դեկտեմբերի',
];

export const NBSP = ' ';

/** Date parts in the academy's timezone (dates are stored in UTC). */
function partsInTz(date: Date, timeZone = config.APP_TIMEZONE) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  return { year: Number(p.year), month: Number(p.month), day: Number(p.day), hour: p.hour, minute: p.minute };
}

/** Accepts a Date or an ISO string ("2026-11-21" is treated as a calendar date, no timezone shift). */
export function toDate(value: Date | string): Date {
  if (value instanceof Date) return value;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  // Noon UTC keeps the calendar day the same in every timezone from -11 to +11.
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12));
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${value}`);
  return d;
}

export function formatDateHy(value: Date | string): string {
  const { day, month, year } = partsInTz(toDate(value));
  return `${day} ${MONTHS_GENITIVE[month - 1]} ${year} թ.`;
}

export function formatDateTimeHy(value: Date | string): string {
  const d = toDate(value);
  const { hour, minute } = partsInTz(d);
  return `${formatDateHy(d)}, ${hour}:${minute}`;
}

export function formatNumber(value: number | string): string {
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[\s ]/g, ''));
  if (!Number.isFinite(n)) throw new Error(`Invalid number: ${value}`);
  const [int, frac] = Math.abs(n).toString().split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return `${n < 0 ? '-' : ''}${grouped}${frac ? ',' + frac : ''}`;
}

export function formatMoneyAmd(value: number | string): string {
  return `${formatNumber(value)}${NBSP}֏`;
}

export type FieldType = 'text' | 'date' | 'money' | 'number';

/** Format a raw value for printing according to the merge-field type. Empty values stay empty. */
export function formatValue(type: FieldType, value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  switch (type) {
    case 'date':
      return formatDateHy(value as string | Date);
    case 'money':
      return formatMoneyAmd(value as number | string);
    case 'number':
      return formatNumber(value as number | string);
    default:
      return String(value);
  }
}
