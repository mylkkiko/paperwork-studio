'use client';

import type { ReactNode } from 'react';
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl';
import { missingMessage, reportI18nError } from '@/i18n/fallback';

/** Client-side i18n with the visible "missing translation" marker (functions can't be passed from the server). */
export function IntlProvider({ locale, messages, children }: { locale: string; messages: AbstractIntlMessages; children: ReactNode }) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Yerevan" getMessageFallback={missingMessage} onError={reportI18nError}>
      {children}
    </NextIntlClientProvider>
  );
}
