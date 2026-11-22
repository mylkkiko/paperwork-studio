import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { defaultLocale, isLocale, LOCALE_COOKIE } from './config';
import { missingMessage, reportI18nError } from './fallback';

/**
 * The UI language comes from a cookie (set by the language switcher), not from the URL,
 * so links like /sign/<token> in emails work unchanged. Armenian by default.
 */
export default getRequestConfig(async () => {
  const fromCookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(fromCookie) ? fromCookie : defaultLocale;
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    timeZone: 'Asia/Yerevan',
    getMessageFallback: missingMessage,
    onError: reportI18nError,
  };
});
