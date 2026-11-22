'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ExternalLink, FileText } from 'lucide-react';
import { apiBlob } from '@/lib/api';
import { cn } from '@/lib/utils';
import { ErrorState, LoadingState } from './states';

/**
 * Shows a PDF in an <iframe>.
 *  - `src`: a public URL (signing page)
 *  - `apiPath`: a protected API path; fetched with the JWT and shown from a blob URL
 * Mobile browsers often can't display PDFs inline, so there is always an "open" link as well.
 */
export function PdfViewer({ src, apiPath, title, className }: { src?: string; apiPath?: string; title: string; className?: string }) {
  const t = useTranslations('common');
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!apiPath) return;
    let url: string | null = null;
    let cancelled = false;
    setBlobUrl(null);
    setError(null);
    apiBlob(apiPath)
      .then(({ blob }) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setBlobUrl(url);
      })
      .catch((e) => !cancelled && setError(e));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [apiPath]);

  const url = src ?? blobUrl;
  if (error) return <ErrorState error={error} />;
  if (!url) return <LoadingState rows={6} />;
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {/* Phones usually cannot show a PDF inside a page: a big "open" button instead of an empty frame. */}
      <a href={url} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 rounded-md border bg-muted/50 p-6 text-sm font-medium text-primary sm:hidden" data-testid="open-pdf-mobile">
        <FileText className="h-5 w-5" aria-hidden /> {t('openDocument')}
      </a>
      <iframe src={url} title={title} className="hidden h-[70vh] min-h-[420px] w-full rounded-md border bg-white sm:block" />
      <a href={url} target="_blank" rel="noreferrer" className="hidden items-center gap-1 self-start text-sm text-primary hover:underline sm:inline-flex">
        <ExternalLink className="h-4 w-4" aria-hidden /> {t('openPdf')}
      </a>
    </div>
  );
}
