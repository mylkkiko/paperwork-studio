'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronDown, Languages } from 'lucide-react';
import { localeNames, locales, LOCALE_COOKIE, type Locale } from '@/i18n/config';
import { cn } from '@/lib/utils';

const SHORT: Record<Locale, string> = { hy: 'Հայ', en: 'Eng', ru: 'Рус' };

/**
 * Stores the UI language in a cookie and re-renders server components with the new dictionary.
 * A native select keeps it keyboard/screen-reader friendly; `compact` shows a short code in the header.
 */
export function LanguageSwitcher({ className, compact = false }: { className?: string; compact?: boolean }) {
  const locale = useLocale() as Locale;
  const t = useTranslations('nav');
  const router = useRouter();
  const [pending, start] = useTransition();

  const change = (next: Locale) => {
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    start(() => router.refresh());
  };

  return (
    <label className={cn('relative inline-flex h-10 items-center rounded-md text-sm text-text transition-colors hover:bg-surface-muted', className)} title={t('language')}>
      <Languages className="pointer-events-none absolute left-2.5 h-4 w-4 text-text-muted" aria-hidden />
      <select
        aria-label={t('language')}
        className={cn('h-10 cursor-pointer appearance-none rounded-md bg-transparent pl-8 pr-7 text-sm', compact && 'w-24')}
        value={locale}
        disabled={pending}
        onChange={(e) => change(e.target.value as Locale)}
      >
        {locales.map((l) => (
          <option key={l} value={l}>
            {compact ? SHORT[l] : localeNames[l]}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-text-muted" aria-hidden />
    </label>
  );
}
