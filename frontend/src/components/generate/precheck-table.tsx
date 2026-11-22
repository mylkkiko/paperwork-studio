'use client';

import { useTranslations } from 'next-intl';
import { CheckCircle2 } from 'lucide-react';
import type { Precheck } from '@/lib/types';
import { inputMode, inputType, summarizePrecheck } from '@/lib/wizard';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
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
 */
export function PrecheckTable({ precheck, overrides, excludedIds, onOverride, onExclude, onlyProblems = false }: Props) {
  const t = useTranslations('generate.precheck');
  const sum = summarizePrecheck(precheck);
  const rows = precheck.recipients.filter((r) => !onlyProblems || r.missing.length > 0 || excludedIds.includes(r.id) || overrides[r.id]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2" data-testid="precheck-summary">
        <Badge variant="success">{t('ready', { count: sum.ready })}</Badge>
        <Badge variant={sum.needData ? 'destructive' : 'secondary'}>{t('needData', { count: sum.needData })}</Badge>
        <Badge variant="secondary">{t('excluded', { count: sum.excluded })}</Badge>
      </div>
      {rows.length === 0 ? (
        <p className="flex items-center gap-2 rounded-md border bg-success/10 p-3 text-sm">
          <CheckCircle2 className="h-4 w-4 text-success" /> {t('allComplete')}
        </p>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>{t('recipient')}</TH>
              <TH>{t('missing')}</TH>
              <TH className="w-28 text-center">{t('exclude')}</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => {
              const excluded = excludedIds.includes(r.id);
              // fields this recipient was missing originally, including those now filled in
              const filledKeys = Object.keys(overrides[r.id] ?? {});
              const keys = [...new Set([...r.missing.map((m) => m.key), ...filledKeys])];
              const meta = (key: string) => r.missing.find((m) => m.key === key);
              return (
                <TR key={r.id} className={cn(excluded && 'opacity-60')} data-testid={`precheck-row-${r.id}`}>
                  <TD>
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-muted-foreground">{r.email}</div>
                  </TD>
                  <TD>
                    {keys.length === 0 ? (
                      <span className="text-sm text-muted-foreground">—</span>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {keys.map((key) => {
                          const m = meta(key);
                          const value = overrides[r.id]?.[key] ?? '';
                          return (
                            <label key={key} className="flex flex-col gap-1 text-xs sm:flex-row sm:items-center sm:gap-2">
                              <span className="sm:w-44">{m?.label ?? key}</span>
                              <Input
                                className="h-8 sm:max-w-60"
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
                        })}
                      </div>
                    )}
                  </TD>
                  <TD className="text-center">
                    <Checkbox checked={excluded} onCheckedChange={(v) => onExclude(r.id, v === true)} aria-label={t('excludeRecipient', { name: r.name })} />
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
    </div>
  );
}
