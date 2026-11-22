'use client';

import { useTranslations } from 'next-intl';
import { CheckCircle2 } from 'lucide-react';
import type { Precheck } from '@/lib/types';
import { inputMode, inputType, summarizePrecheck } from '@/lib/wizard';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface Props {
  precheck: Precheck;
  overrides: Record<string, Record<string, string>>;
  excludedIds: string[];
  onOverride: (recipientId: string, key: string, value: string) => void;
  onExclude: (recipientId: string, excluded: boolean) => void;
  /** show only recipients that need attention */
  onlyProblems?: boolean;
}

/**
 * Step 3: recipients with missing required data. Each missing value can be typed in inline (it applies to that
 * recipient only), or the recipient can be excluded from the pack.
 * One card per recipient on phones (inputs full width, always reachable); aligned columns from md up.
 */
export function PrecheckTable({ precheck, overrides, excludedIds, onOverride, onExclude, onlyProblems = false }: Props) {
  const t = useTranslations('generate.precheck');
  const sum = summarizePrecheck(precheck);
  const rows = precheck.recipients.filter((r) => !onlyProblems || r.missing.length > 0 || excludedIds.includes(r.id) || overrides[r.id]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2" data-testid="precheck-summary">
        <Badge variant="success">{t('ready', { count: sum.ready })}</Badge>
        <Badge variant={sum.needData ? 'danger' : 'neutral'}>{t('needData', { count: sum.needData })}</Badge>
        <Badge variant="neutral">{t('excluded', { count: sum.excluded })}</Badge>
      </div>
      {rows.length === 0 ? (
        <p className="flex items-center gap-2 rounded-md bg-success-bg p-3 text-sm text-success-fg">
          <CheckCircle2 className="h-4 w-4" aria-hidden /> {t('allComplete')}
        </p>
      ) : (
        <div className="flex flex-col gap-3 md:gap-0 md:overflow-hidden md:rounded-lg md:border">
          <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)_6rem] gap-4 border-b bg-surface-muted px-4 py-2.5 text-xs font-medium text-text-muted md:grid" aria-hidden>
            <span>{t('recipient')}</span>
            <span>{t('missing')}</span>
            <span className="text-center">{t('exclude')}</span>
          </div>
          {rows.map((r) => {
            const excluded = excludedIds.includes(r.id);
            // fields this recipient was missing originally, including those now filled in
            const filledKeys = Object.keys(overrides[r.id] ?? {});
            const keys = [...new Set([...r.missing.map((m) => m.key), ...filledKeys])];
            const meta = (key: string) => r.missing.find((m) => m.key === key);
            return (
              <div
                key={r.id}
                data-testid={`precheck-row-${r.id}`}
                // one checkbox, moved by grid areas: phones "name | exclude" over "fields"; md+ "name | fields | exclude"
                className={cn(
                  'grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-lg border bg-surface p-4 [grid-template-areas:"name_ex"_"fields_fields"]',
                  'md:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)_6rem] md:items-start md:gap-4 md:rounded-none md:border-0 md:border-b md:[grid-template-areas:"name_fields_ex"] md:last:border-b-0',
                  excluded && 'bg-surface-muted',
                )}
              >
                <div className={cn('min-w-0 [grid-area:name]', excluded && 'text-text-muted')}>
                  <div className="font-medium [overflow-wrap:anywhere]">{r.name}</div>
                  <div className="text-xs text-text-muted [overflow-wrap:anywhere]">{r.email}</div>
                </div>
                <div className="flex flex-col gap-3 [grid-area:fields]">
                  {keys.length === 0 ? (
                    <span className="text-sm text-text-muted">—</span>
                  ) : (
                    keys.map((key) => {
                      const m = meta(key);
                      const value = overrides[r.id]?.[key] ?? '';
                      return (
                        <label key={key} className="flex flex-col gap-1.5 text-sm">
                          <span className="text-text-muted">{m?.label ?? key}</span>
                          <Input
                            type={inputType(m?.type ?? 'text')}
                            inputMode={inputMode(m?.type ?? 'text')}
                            value={value}
                            disabled={excluded}
                            aria-label={`${r.name}: ${m?.label ?? key}`}
                            aria-invalid={!excluded && !value && !!m}
                            onChange={(e) => onOverride(r.id, key, e.target.value)}
                          />
                        </label>
                      );
                    })
                  )}
                </div>
                <label className="flex items-center gap-2 self-start text-sm [grid-area:ex] md:justify-center md:pt-1">
                  <Checkbox checked={excluded} onCheckedChange={(v) => onExclude(r.id, v === true)} aria-label={t('excludeRecipient', { name: r.name })} />
                  <span className="md:hidden" aria-hidden>
                    {t('exclude')}
                  </span>
                </label>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
