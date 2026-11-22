'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Languages } from 'lucide-react';
import { localeNames, locales, LOCALE_COOKIE, type Locale } from '@/i18n/config';
import { cn } from '@/lib/utils';

/** Stores the UI language in a cookie and re-renders server components with the new dictionary. */
export function LanguageSwitcher({ className }: { className?: string }) {
  const locale = useLocale() as Locale;
  const t = useTranslations('nav');
  const router = useRouter();
  const [pending, start] = useTransition();

  const change = (next: Locale) => {
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    start(() => router.refresh());
  };

  return (
    <label className={cn('inline-flex items-center gap-1.5 text-sm', className)}>
      <Languages className="h-4 w-4 text-muted-foreground" aria-hidden />
      <span className="sr-only">{t('language')}</span>
      <select
        aria-label={t('language')}
        className="h-8 rounded-md border border-input bg-background px-2 text-sm"
        value={locale}
        disabled={pending}
        onChange={(e) => change(e.target.value as Locale)}
      >
        {locales.map((l) => (
          <option key={l} value={l}>
            {localeNames[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
