/** UI languages. Documents are always Armenian, whatever the UI language. */
export const locales = ['hy', 'en', 'ru'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'hy';
export const LOCALE_COOKIE = 'NEXT_LOCALE';

export const localeNames: Record<Locale, string> = { hy: 'Հայերեն', en: 'English', ru: 'Русский' };

/** BCP-47 tags for Intl (dates, numbers). */
export const intlLocale: Record<Locale, string> = { hy: 'hy-AM', en: 'en-GB', ru: 'ru-RU' };

export const isLocale = (x: unknown): x is Locale => typeof x === 'string' && (locales as readonly string[]).includes(x);
