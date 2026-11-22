'use client';

import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import { STEPS, type Step } from '@/lib/wizard';
import { cn } from '@/lib/utils';

export function Stepper({ current }: { current: Step }) {
  const t = useTranslations('generate.steps');
  const index = STEPS.indexOf(current);
  return (
    <ol className="mb-6 grid grid-cols-3 gap-2 sm:grid-cols-6" aria-label={t('label')}>
      {STEPS.map((s, i) => (
        <li key={s} className="flex items-center gap-2 text-xs sm:text-sm" aria-current={i === index ? 'step' : undefined}>
          <span
            className={cn(
              'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium',
              i < index && 'border-primary bg-primary text-primary-foreground',
              i === index && 'border-primary text-primary',
              i > index && 'text-muted-foreground',
            )}
          >
            {i < index ? <Check className="h-3.5 w-3.5" /> : i + 1}
          </span>
          <span className={cn('truncate', i === index ? 'font-medium' : 'text-muted-foreground')}>{t(s)}</span>
        </li>
      ))}
    </ol>
  );
}
