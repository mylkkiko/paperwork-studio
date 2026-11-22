'use client';

import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import { STEPS, type Step } from '@/lib/wizard';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

/**
 * Wizard progress. Phones: "Step 3 of 6 · Check data" + bar. Larger screens: connected steps
 * (done = filled with a check, current = accent ring and bold label, next = neutral outline). Labels wrap, never cut.
 */
export function Stepper({ current }: { current: Step }) {
  const t = useTranslations('generate.steps');
  const index = STEPS.indexOf(current);

  return (
    <div className="mb-6">
      <div className="flex flex-col gap-2 sm:hidden" aria-hidden>
        <p className="text-sm">
          <span className="text-text-muted">{t('counter', { current: index + 1, total: STEPS.length })}</span>
          <span className="text-text-muted"> · </span>
          <span className="font-medium">{t(current)}</span>
        </p>
        <Progress value={((index + 1) / STEPS.length) * 100} />
      </div>

      <ol className="hidden items-start sm:flex" aria-label={t('label')}>
        {STEPS.map((s, i) => {
          const done = i < index;
          const active = i === index;
          return (
            <li key={s} className="flex min-w-0 flex-1 items-start" aria-current={active ? 'step' : undefined}>
              <div className="flex min-w-0 flex-col items-center gap-2 px-1 text-center">
                <span
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors',
                    done && 'border-accent bg-accent text-accent-fg',
                    active && 'border-accent bg-surface text-accent-text ring-4 ring-accent-soft',
                    !done && !active && 'border-border-strong/50 bg-surface text-text-muted',
                  )}
                >
                  {done ? <Check className="h-4 w-4" aria-hidden /> : i + 1}
                </span>
                <span className={cn('text-xs leading-snug [overflow-wrap:anywhere]', active ? 'font-semibold text-text' : done ? 'text-text' : 'text-text-muted')}>{t(s)}</span>
              </div>
              {i < STEPS.length - 1 && <span className={cn('mt-4 h-0.5 flex-1 rounded-full', i < index ? 'bg-accent' : 'bg-border')} aria-hidden />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
