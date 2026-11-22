'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import type { Precheck } from '@/lib/types';
import { fieldKey, formName, inputMode, inputType, sharedFieldsSchema } from '@/lib/wizard';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Step 4: values shared by the whole pack (contract date, amount, …), entered once.
 * The form id lets the wizard's "Generate" button submit it.
 */
export function SharedFieldsForm({ fields, values, onSubmit, formId }: { fields: Precheck['commonFields']; values: Record<string, string>; onSubmit: (values: Record<string, string>) => void; formId: string }) {
  const t = useTranslations('generate.shared');
  const tType = useTranslations('fieldType');
  const schema = sharedFieldsSchema(fields);
  const form = useForm<Record<string, string>>({
    resolver: zodResolver(schema),
    defaultValues: Object.fromEntries(fields.map((f) => [formName(f.key), values[f.key] ?? ''])),
  });

  const submit = form.handleSubmit((encoded) => onSubmit(Object.fromEntries(Object.entries(encoded).map(([k, v]) => [fieldKey(k), v]))));

  if (fields.length === 0) {
    return (
      <form id={formId} onSubmit={submit}>
        <p className="text-sm text-muted-foreground">{t('none')}</p>
      </form>
    );
  }
  return (
    <form id={formId} onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
      {fields.map((f) => {
        const name = formName(f.key);
        const error = form.formState.errors[name]?.message as string | undefined;
        return (
          <div key={f.key} className="flex flex-col gap-1.5">
            <Label htmlFor={`shared-${name}`}>
              {f.label} {f.required && <span className="text-destructive">*</span>}
            </Label>
            <Input id={`shared-${name}`} type={inputType(f.type)} inputMode={inputMode(f.type)} aria-invalid={!!error} {...form.register(name)} />
            <span className="text-xs text-muted-foreground">
              <code>{`{{${f.key}}}`}</code> · {tType(f.type)}
            </span>
            {error && <p className="text-xs text-destructive">{t(`error.${error}`)}</p>}
          </div>
        );
      })}
    </form>
  );
}
