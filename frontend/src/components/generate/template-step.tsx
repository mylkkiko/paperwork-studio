'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import type { TemplateListItem } from '@/lib/types';
import { CATEGORY_RECIPIENT, type WizardState } from '@/lib/wizard';
import { EmptyState, QueryState } from '@/components/states';
import { cn } from '@/lib/utils';

/** Step 1: only templates with a PUBLISHED version can be used. */
export function TemplateStep({ state, onChange }: { state: WizardState; onChange: (patch: Partial<WizardState>) => void }) {
  const t = useTranslations('generate');
  const tc = useTranslations('categories');
  const query = useQuery({ queryKey: ['templates', { status: 'published' }], queryFn: () => api<{ items: TemplateListItem[] }>('/templates', { query: { status: 'published' } }) });
  return (
    <QueryState query={query}>
      {({ items }) => {
        const usable = items.filter((tpl) => tpl.publishedVersion);
        if (!usable.length) return <EmptyState>{t('noPublished')}</EmptyState>;
        return (
          <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label={t('steps.template')}>
            {usable.map((tpl) => {
              const selected = state.templateId === tpl.id;
              return (
                <button
                  key={tpl.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() =>
                    onChange({
                      templateId: tpl.id,
                      templateVersionId: tpl.publishedVersion!.id,
                      recipientType: CATEGORY_RECIPIENT[tpl.category],
                      recipientIds: [],
                      overrides: {},
                      excludedIds: [],
                      commonValues: {},
                    })
                  }
                  className={cn(
                    'flex flex-col gap-1 rounded-lg border bg-surface p-4 text-left shadow-sm transition-colors hover:border-accent/50 hover:bg-surface-muted',
                    selected && 'border-accent bg-accent-soft ring-1 ring-accent hover:bg-accent-soft',
                  )}
                >
                  <div className="font-medium [overflow-wrap:anywhere]">{tpl.title}</div>
                  <div className="mt-1 text-sm text-text-muted">
                    {tc(tpl.category)} · {t('publishedVersion', { version: tpl.publishedVersion!.versionNumber })}
                  </div>
                </button>
              );
            })}
          </div>
        );
      }}
    </QueryState>
  );
}
