'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import type { Group, Partner, RecipientType, Staff, Student } from '@/lib/types';
import type { WizardState } from '@/lib/wizard';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/input';
import { QueryState } from '@/components/states';

interface Person {
  id: string;
  name: string;
  detail: string;
}

/** Step 2: a whole group (students, all selected by default) or individual staff/partners. */
export function RecipientsStep({ state, onChange }: { state: WizardState; onChange: (patch: Partial<WizardState>) => void }) {
  const t = useTranslations('generate');
  const tr = useTranslations('recipientType');
  const groups = useQuery({ queryKey: ['core', 'groups'], queryFn: () => api<{ items: Group[] }>('/core/groups') });

  const people = useQuery({
    queryKey: ['core', state.recipientType, state.groupId],
    enabled: state.recipientType !== 'student' || Boolean(state.groupId),
    queryFn: async (): Promise<Person[]> => {
      if (state.recipientType === 'student') {
        const { items } = await api<{ items: Student[] }>(`/core/groups/${state.groupId}/students`);
        return items.map((s) => ({ id: s.id, name: s.fullName, detail: s.email ?? '' }));
      }
      if (state.recipientType === 'staff') {
        const { items } = await api<{ items: Staff[] }>('/core/staff');
        return items.map((s) => ({ id: s.id, name: s.fullName, detail: s.position }));
      }
      const { items } = await api<{ items: Partner[] }>('/core/partners');
      return items.map((p) => ({ id: p.id, name: p.name, detail: p.taxId }));
    },
  });

  // A whole group is selected by default when it is chosen.
  useEffect(() => {
    if (state.recipientType === 'student' && people.data && state.recipientIds.length === 0) onChange({ recipientIds: people.data.map((p) => p.id) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people.data]);

  const toggle = (id: string, on: boolean) =>
    onChange({ recipientIds: on ? [...state.recipientIds, id] : state.recipientIds.filter((x) => x !== id), excludedIds: state.excludedIds.filter((x) => x !== id) });
  const allIds = people.data?.map((p) => p.id) ?? [];
  const allSelected = allIds.length > 0 && allIds.every((id) => state.recipientIds.includes(id));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rtype">{t('recipientType')}</Label>
          <Select id="rtype" value={state.recipientType} onChange={(e) => onChange({ recipientType: e.target.value as RecipientType, recipientIds: [], groupId: null, overrides: {}, excludedIds: [] })}>
            {(['student', 'staff', 'partner'] as const).map((r) => (
              <option key={r} value={r}>
                {tr(r)}
              </option>
            ))}
          </Select>
        </div>
        {state.recipientType === 'student' && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="group">{t('group')}</Label>
            <QueryState query={groups} rows={1}>
              {({ items }) => (
                <Select id="group" value={state.groupId ?? ''} onChange={(e) => onChange({ groupId: e.target.value || null, recipientIds: [], overrides: {}, excludedIds: [] })}>
                  <option value="">{t('chooseGroup')}</option>
                  {items.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} · {g.courseName} ({t('studentsCount', { count: g.studentCount })})
                    </option>
                  ))}
                </Select>
              )}
            </QueryState>
          </div>
        )}
      </div>

      {(state.recipientType !== 'student' || state.groupId) && (
        <QueryState query={people}>
          {(list) => (
            <div className="rounded-lg border bg-background">
              <label className="flex items-center gap-3 border-b px-3 py-2 text-sm font-medium">
                <Checkbox checked={allSelected} onCheckedChange={(v) => onChange({ recipientIds: v === true ? allIds : [] })} aria-label={t('selectAll')} />
                {t('selectedCount', { selected: state.recipientIds.length, total: list.length })}
              </label>
              <ul className="max-h-[420px] divide-y overflow-y-auto">
                {list.map((p) => (
                  <li key={p.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted/40">
                      <Checkbox checked={state.recipientIds.includes(p.id)} onCheckedChange={(v) => toggle(p.id, v === true)} />
                      <span className="flex-1">{p.name}</span>
                      <span className="text-xs text-muted-foreground">{p.detail}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </QueryState>
      )}
    </div>
  );
}
