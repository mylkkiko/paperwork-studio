'use client';

import { useTranslations } from 'next-intl';
import type { ClauseChange, DiffSpan } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/** Word-level diff: red strike-through = removed, green underline = added. */
export function DiffText({ spans, side }: { spans: DiffSpan[]; side: 'old' | 'new' }) {
  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed">
      {spans.map((s, i) => {
        if (s.type === 'equal') return <span key={i}>{s.value}</span>;
        if (s.type === 'removed' && side === 'old')
          return (
            <del key={i} className="rounded bg-red-100 px-0.5 text-red-800 decoration-red-500" data-diff="removed">
              {s.value}
            </del>
          );
        if (s.type === 'added' && side === 'new')
          return (
            <ins key={i} className="rounded bg-green-100 px-0.5 text-green-800 no-underline" data-diff="added">
              {s.value}
            </ins>
          );
        return null;
      })}
    </p>
  );
}

const rowStyle: Record<ClauseChange['status'], string> = {
  added: 'border-l-4 border-l-green-500',
  removed: 'border-l-4 border-l-red-500',
  changed: 'border-l-4 border-l-amber-500',
  unchanged: 'border-l-4 border-l-transparent',
};

/** One clause in the two-column comparison. */
export function ClauseRow({ change }: { change: ClauseChange }) {
  const t = useTranslations('compare');
  const label = (n: string | null) => (change.kind === 'preamble' ? t('preamble') : n ? t('clause', { number: n }) : change.title);
  const statusVariant = { added: 'success', removed: 'destructive', changed: 'warning', unchanged: 'secondary' } as const;

  return (
    <div className={cn('grid gap-3 border-b bg-background p-3 md:grid-cols-2', rowStyle[change.status])} data-testid="clause-row" data-status={change.status}>
      <div className={cn('min-w-0', !change.oldText && 'hidden md:block')}>
        <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium">{change.oldText ? label(change.oldNumber) : ''}</span>
        </div>
        {change.oldText && (change.diff ? <DiffText spans={change.diff} side="old" /> : <p className={cn('whitespace-pre-wrap text-sm', change.status === 'removed' && 'text-red-800 line-through decoration-red-400')}>{change.oldText}</p>)}
      </div>
      <div className={cn('min-w-0', !change.newText && 'hidden md:block')}>
        <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium">{change.newText ? label(change.newNumber) : ''}</span>
          <Badge variant={statusVariant[change.status]}>{t(`status.${change.status}`)}</Badge>
          {change.moved && <Badge variant="outline">{t('moved', { from: change.oldNumber ?? '—', to: change.newNumber ?? '—' })}</Badge>}
        </div>
        {change.newText && (change.diff ? <DiffText spans={change.diff} side="new" /> : <p className={cn('whitespace-pre-wrap text-sm', change.status === 'added' && 'text-green-800')}>{change.newText}</p>)}
        {!change.newText && <p className="text-sm italic text-muted-foreground">{t('removedHere')}</p>}
      </div>
    </div>
  );
}
