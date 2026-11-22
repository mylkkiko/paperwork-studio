'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { CATEGORIES, type Category, type UploadWarning, type VersionDetail } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, Select } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FileInput } from '@/components/ui/file-input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useErrorMessage } from './states';
import { WarningsList } from './warnings';

/** POST /templates returns `template`; POST /templates/:id/versions does not. */
interface UploadResult {
  template?: { id: string };
  version: VersionDetail;
  warnings: UploadWarning[];
}

const docxFile = z.custom<FileList>((v) => v instanceof FileList && v.length === 1 && v[0].name.toLowerCase().endsWith('.docx'), { message: 'docx' });

/**
 * Upload a template (.docx). With `templateId` it uploads a NEW VERSION of that template instead.
 * After upload, warnings (unknown fields, no clauses detected, ...) are shown before closing.
 */
export function UploadTemplateDialog({ open, onOpenChange, templateId }: { open: boolean; onOpenChange: (o: boolean) => void; templateId?: string }) {
  const t = useTranslations('upload');
  const tc = useTranslations('categories');
  const tCommon = useTranslations('common');
  const errorMessage = useErrorMessage();
  const qc = useQueryClient();
  const [result, setResult] = useState<{ templateId: string; versionId: string; warnings: UploadWarning[] } | null>(null);
  const isVersion = Boolean(templateId);

  const schema = z.object({
    title: isVersion ? z.string().optional() : z.string().trim().min(1, 'required'),
    category: isVersion ? z.string().optional() : z.enum(CATEGORIES as [Category, ...Category[]]),
    file: docxFile,
  });
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { title: '', category: 'student_agreement' } });

  const mutation = useMutation({
    mutationFn: async (v: Values): Promise<UploadResult> => {
      const fd = new FormData();
      fd.append('file', v.file[0]);
      if (isVersion) return api<UploadResult>(`/templates/${templateId}/versions`, { form: fd });
      fd.append('title', v.title!);
      fd.append('category', v.category!);
      return api<UploadResult>('/templates', { form: fd });
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['templates'] });
      const tid = res.template?.id ?? templateId!;
      qc.invalidateQueries({ queryKey: ['template', tid] });
      if (res.warnings.length) setResult({ templateId: tid, versionId: res.version.id, warnings: res.warnings });
      else {
        toast.success(t('uploaded', { version: res.version.versionNumber }));
        close();
      }
    },
  });

  const close = () => {
    onOpenChange(false);
    setTimeout(() => {
      setResult(null);
      form.reset();
      mutation.reset();
    }, 200);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent closeLabel={tCommon('close')}>
        <DialogHeader>
          <DialogTitle>{isVersion ? t('newVersionTitle') : t('title')}</DialogTitle>
          <DialogDescription>{t('hint')}</DialogDescription>
        </DialogHeader>
        {result ? (
          <>
            <Alert variant="warning">
              <AlertDescription>{t('savedWithWarnings')}</AlertDescription>
            </Alert>
            <WarningsList warnings={result.warnings} />
            <DialogFooter>
              <Button asChild>
                <Link href={`/templates/${result.templateId}`} onClick={close}>
                  {t('openTemplate')}
                </Link>
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="flex flex-col gap-4" noValidate>
            {!isVersion && (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="tpl-title">{t('name')}</Label>
                  <Input id="tpl-title" aria-invalid={!!form.formState.errors.title} {...form.register('title')} />
                  {form.formState.errors.title && <p className="text-xs text-destructive">{tCommon('required')}</p>}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="tpl-category">{t('category')}</Label>
                  <Select id="tpl-category" {...form.register('category')}>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {tc(c)}
                      </option>
                    ))}
                  </Select>
                </div>
              </>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tpl-file">{t('file')}</Label>
              <FileInput id="tpl-file" buttonLabel={tCommon('chooseFile')} emptyLabel={tCommon('noFileChosen')} accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" aria-invalid={!!form.formState.errors.file} {...form.register('file')} />
              {form.formState.errors.file && <p className="text-xs text-destructive">{t('fileInvalid')}</p>}
            </div>
            {mutation.error && (
              <Alert variant="destructive">
                <AlertDescription>{errorMessage(mutation.error)}</AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close}>
                {tCommon('cancel')}
              </Button>
              <Button type="submit" loading={mutation.isPending}>
                {t('submit')}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
