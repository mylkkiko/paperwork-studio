'use client';

import { useLocale } from 'next-intl';
import { intlLocale, type Locale } from '@/i18n/config';

const TZ = 'Asia/Yerevan';

/**
 * Browsers ship little or no Armenian date data (Chrome prints "2026 M11 22"), so Armenian UI dates are
 * formatted here with the standard abbreviations. en/ru use Intl as usual.
 */
const HY_MONTHS_SHORT = ['հնվ', 'փտվ', 'մրտ', 'ապր', 'մյս', 'հնս', 'հլս', 'օգս', 'սեպ', 'հոկ', 'նոյ', 'դեկ'];

function parts(d: Date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return { day: Number(p.day), month: Number(p.month), year: p.year, hour: p.hour, minute: p.minute };
}

export function formatDate(iso: string | null | undefined, locale: Locale, withTime = false): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (locale === 'hy') {
    const p = parts(d);
    const date = `${p.day} ${HY_MONTHS_SHORT[p.month - 1]} ${p.year}`;
    return withTime ? `${date}, ${p.hour}:${p.minute}` : date;
  }
  return new Intl.DateTimeFormat(intlLocale[locale], { dateStyle: 'medium', ...(withTime ? { timeStyle: 'short' } : {}), timeZone: TZ }).format(d);
}

/** Locale-aware date formatting for the UI (documents themselves always use the full Armenian format). */
export function useFormat() {
  const locale = (useLocale() as Locale) ?? 'hy';
  return {
    date: (iso: string | null | undefined) => formatDate(iso, locale),
    dateTime: (iso: string | null | undefined) => formatDate(iso, locale, true),
    number: (n: number) => new Intl.NumberFormat(intlLocale[locale]).format(n),
  };
}
