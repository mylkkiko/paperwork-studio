'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { DocumentRow } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FileInput } from '@/components/ui/file-input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useErrorMessage } from '@/components/states';

const ALLOWED = /\.(pdf|jpe?g|png)$/i;
const schema = z.object({
  file: z.custom<FileList>((v) => v instanceof FileList && v.length === 1 && ALLOWED.test(v[0].name), { message: 'file' }),
  signedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date'),
});
type Values = z.infer<typeof schema>;

const today = () => new Date().toISOString().slice(0, 10);

/** S-3: mark a document as signed on paper and upload the scan (PDF/JPG/PNG). */
export function PaperSignatureDialog({ doc, onClose }: { doc: DocumentRow | null; onClose: () => void }) {
  const t = useTranslations('signatures.paperDialog');
  const tCommon = useTranslations('common');
  const errorMessage = useErrorMessage();
  const qc = useQueryClient();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { signedAt: today() } });

  const mutation = useMutation({
    mutationFn: (v: Values) => {
      const fd = new FormData();
      fd.append('file', v.file[0]);
      fd.append('signedAt', `${v.signedAt}T12:00:00Z`);
      return api(`/documents/${doc!.id}/paper-signature`, { form: fd });
    },
    onSuccess: () => {
      toast.success(t('saved', { name: doc!.recipientName }));
      qc.invalidateQueries({ queryKey: ['signatures'] });
      qc.invalidateQueries({ queryKey: ['documents'] });
      close();
    },
  });
  const close = () => {
    form.reset({ signedAt: today() });
    mutation.reset();
    onClose();
  };

  return (
    <Dialog open={!!doc} onOpenChange={(o) => !o && close()}>
      <DialogContent closeLabel={tCommon('close')}>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{doc && t('hint', { name: doc.recipientName, number: doc.number })}</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="scan">{t('scan')}</Label>
            <FileInput id="scan" buttonLabel={tCommon('chooseFile')} emptyLabel={tCommon('noFileChosen')} accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" aria-invalid={!!form.formState.errors.file} {...form.register('file')} />
            {form.formState.errors.file && <p className="text-xs text-danger-fg">{t('fileInvalid')}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="signedAt">{t('signedAt')}</Label>
            <Input id="signedAt" type="date" max={today()} {...form.register('signedAt')} />
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
      </DialogContent>
    </Dialog>
  );
}
