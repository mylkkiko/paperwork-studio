'use client';

import { useTranslations } from 'next-intl';
import { AlertTriangle } from 'lucide-react';
import type { UploadWarning } from '@/lib/types';

/** Upload warnings, translated by code (the API message is Armenian). */
export function WarningsList({ warnings }: { warnings: UploadWarning[] }) {
  const t = useTranslations('warnings');
  if (!warnings.length) return null;
  return (
    <ul className="flex flex-col gap-1.5" data-testid="warnings">
      {warnings.map((w, i) => (
        <li key={i} className="flex items-start gap-2 rounded-md bg-warning-bg px-3 py-2 text-sm text-warning-fg">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span className="[overflow-wrap:anywhere]">{t(w.code, { field: w.field ?? '' })}</span>
        </li>
      ))}
    </ul>
  );
}
