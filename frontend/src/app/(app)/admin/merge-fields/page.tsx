'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Pencil, Plus, Search } from 'lucide-react';
import { api } from '@/lib/api';
import type { FieldSource, FieldType, MergeField } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input, Select } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { PageHeader, QueryState, useErrorMessage } from '@/components/states';

const SOURCES: FieldSource[] = ['core', 'manual', 'system'];
const TYPES: FieldType[] = ['text', 'date', 'money', 'number'];

export default function MergeFieldsPage() {
  const t = useTranslations('admin.fields');
  const tSource = useTranslations('fieldSource');
  const tType = useTranslations('fieldType');
  const [editing, setEditing] = useState<MergeField | 'new' | null>(null);
  const [q, setQ] = useState('');
  const query = useQuery({ queryKey: ['merge-fields'], queryFn: () => api<{ items: MergeField[] }>('/merge-fields') });
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (query.data?.items ?? []).filter((f) => !s || f.key.includes(s) || f.label.toLowerCase().includes(s));
  }, [query.data, q]);

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus /> {t('create')}
          </Button>
        }
      />
      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-text-muted" aria-hidden />
        <Input className="pl-8" placeholder={t('search')} aria-label={t('search')} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <QueryState query={query}>
        {() => (
          <Card>
            <Table>
              <THead>
                <TR>
                  <TH>{t('key')}</TH>
                  <TH>{t('label')}</TH>
                  <TH>{t('source')}</TH>
                  <TH>{t('type')}</TH>
                  <TH>{t('required')}</TH>
                  <TH className="text-right">{t('actions')}</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((f) => (
                  <TR key={f.id}>
                    <TD>
                      <code className="text-xs">{`{{${f.key}}}`}</code>
                    </TD>
                    <TD lang="hy">{f.label}</TD>
                    <TD>
                      <Badge variant={f.source === 'manual' ? 'warning' : f.source === 'system' ? 'secondary' : 'default'}>{tSource(f.source)}</Badge>
                    </TD>
                    <TD>{tType(f.type)}</TD>
                    <TD>{f.required ? '✓' : '—'}</TD>
                    <TD className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(f)}>
                        <Pencil /> {t('edit')}
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        )}
      </QueryState>
      <FieldDialog field={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function FieldDialog({ field, onClose }: { field: MergeField | 'new' | null; onClose: () => void }) {
  const t = useTranslations('admin.fields');
  const tSource = useTranslations('fieldSource');
  const tType = useTranslations('fieldType');
  const tCommon = useTranslations('common');
  const errorMessage = useErrorMessage();
  const qc = useQueryClient();
  const isNew = field === 'new';
  const schema = z.object({
    key: z.string().regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/, 'key'),
    label: z.string().trim().min(1, 'required'),
    source: z.enum(['core', 'manual', 'system']),
    type: z.enum(['text', 'date', 'money', 'number']),
    required: z.boolean(),
  });
  type Values = z.infer<typeof schema>;
  const defaults: Values = field && field !== 'new' ? { key: field.key, label: field.label, source: field.source, type: field.type, required: field.required } : { key: '', label: '', source: 'manual', type: 'text', required: true };
  const form = useForm<Values>({ resolver: zodResolver(schema), values: defaults });

  const save = useMutation({
    mutationFn: (v: Values) =>
      isNew ? api('/merge-fields', { body: v }) : api(`/merge-fields/${(field as MergeField).id}`, { method: 'PATCH', body: { label: v.label, source: v.source, type: v.type, required: v.required } }),
    onSuccess: () => {
      toast.success(t('saved'));
      qc.invalidateQueries({ queryKey: ['merge-fields'] });
      close();
    },
  });
  const close = () => {
    save.reset();
    onClose();
  };

  return (
    <Dialog open={!!field} onOpenChange={(o) => !o && close()}>
      <DialogContent closeLabel={tCommon('close')}>
        <DialogHeader>
          <DialogTitle>{isNew ? t('create') : t('editTitle')}</DialogTitle>
          {!isNew && <DialogDescription>{t('keyLocked')}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="flex flex-col gap-3" noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mf-key">{t('key')}</Label>
            <Input id="mf-key" placeholder="contract.discount" disabled={!isNew} {...form.register('key')} />
            {form.formState.errors.key && <p className="text-xs text-danger-fg">{t('keyInvalid')}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mf-label">{t('label')}</Label>
            <Input id="mf-label" lang="hy" {...form.register('label')} />
            {form.formState.errors.label && <p className="text-xs text-danger-fg">{tCommon('required')}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mf-source">{t('source')}</Label>
              <Select id="mf-source" {...form.register('source')}>
                {SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {tSource(s)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mf-type">{t('type')}</Label>
              <Select id="mf-type" {...form.register('type')}>
                {TYPES.map((s) => (
                  <option key={s} value={s}>
                    {tType(s)}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={form.watch('required')} onCheckedChange={(v) => form.setValue('required', v === true)} />
            {t('required')}
          </label>
          {save.error && (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage(save.error)}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              {tCommon('cancel')}
            </Button>
            <Button type="submit" loading={save.isPending}>
              {tCommon('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
