'use client';

import { useTranslations } from 'next-intl';
import type { ClauseChange, DiffSpan } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * Word-level diff: removed = diff-removed tint + strike-through, added = diff-added tint.
 * Colours come from tokens (readable in light and dark); strike-through and the legend mean colour isn't the only cue.
 */
export function DiffText({ spans, side }: { spans: DiffSpan[]; side: 'old' | 'new' }) {
  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed">
      {spans.map((s, i) => {
        if (s.type === 'equal') return <span key={i}>{s.value}</span>;
        if (s.type === 'removed' && side === 'old')
          return (
            <del key={i} className="diff-removed rounded-sm bg-diff-removed-bg px-0.5 text-diff-removed-fg decoration-diff-removed-fg/70" data-diff="removed">
              {s.value}
            </del>
          );
        if (s.type === 'added' && side === 'new')
          return (
            <ins key={i} className="diff-added rounded-sm bg-diff-added-bg px-0.5 font-medium text-diff-added-fg no-underline" data-diff="added">
              {s.value}
            </ins>
          );
        return null;
      })}
    </p>
  );
}

const rowStyle: Record<ClauseChange['status'], string> = {
  added: 'border-l-success-fg',
  removed: 'border-l-danger-fg',
  changed: 'border-l-warning-fg',
  unchanged: 'border-l-transparent',
};

/** One clause in the two-column comparison. */
export function ClauseRow({ change }: { change: ClauseChange }) {
  const t = useTranslations('compare');
  const label = (n: string | null) => (change.kind === 'preamble' ? t('preamble') : n ? t('clause', { number: n }) : change.title);
  const statusVariant = { added: 'success', removed: 'danger', changed: 'warning', unchanged: 'neutral' } as const;

  return (
    <div className={cn('grid gap-x-6 gap-y-3 border-b border-l-4 bg-surface px-4 py-4 last:border-b-0 md:grid-cols-2', rowStyle[change.status])} data-testid="clause-row" data-status={change.status}>
      <div className={cn('min-w-0', !change.oldText && 'hidden md:block')}>
        <div className="mb-1.5 flex items-center gap-2 text-xs font-medium text-text-muted">
          <span>{change.oldText ? label(change.oldNumber) : ''}</span>
        </div>
        {change.oldText &&
          (change.diff ? (
            <DiffText spans={change.diff} side="old" />
          ) : (
            <p className={cn('whitespace-pre-wrap text-sm leading-relaxed', change.status === 'removed' && 'diff-removed text-diff-removed-fg line-through decoration-diff-removed-fg/70')}>{change.oldText}</p>
          ))}
      </div>
      <div className={cn('min-w-0', !change.newText && 'hidden md:block')}>
        <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs font-medium text-text-muted">
          <span>{change.newText ? label(change.newNumber) : ''}</span>
          <Badge variant={statusVariant[change.status]}>{t(`status.${change.status}`)}</Badge>
          {change.moved && <Badge variant="outline">{t('moved', { from: change.oldNumber ?? '—', to: change.newNumber ?? '—' })}</Badge>}
        </div>
        {change.newText &&
          (change.diff ? (
            <DiffText spans={change.diff} side="new" />
          ) : (
            <p className={cn('whitespace-pre-wrap text-sm leading-relaxed', change.status === 'added' && 'diff-added text-diff-added-fg')}>{change.newText}</p>
          ))}
        {!change.newText && <p className="text-sm italic text-text-muted">{t('removedHere')}</p>}
      </div>
    </div>
  );
}
