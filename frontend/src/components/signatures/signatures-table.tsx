'use client';

import { useTranslations } from 'next-intl';
import { Bell, FileSignature, FileText, Paperclip } from 'lucide-react';
import type { DocumentRow } from '@/lib/types';
import { useFormat } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { DocumentStatusBadge } from '@/components/status-badge';

export const canRemind = (d: DocumentRow) => d.status === 'sent' || d.status === 'viewed';
export const canPaperSign = (d: DocumentRow) => d.status !== 'signed' && d.status !== 'declined';
export const canSend = (d: DocumentRow) => d.status !== 'signed' && d.status !== 'declined';

interface Props {
  rows: DocumentRow[];
  selected: string[];
  onSelect: (ids: string[]) => void;
  onRemind: (row: DocumentRow) => void;
  onPaper: (row: DocumentRow) => void;
  onView: (row: DocumentRow) => void;
  onScan: (row: DocumentRow) => void;
  remindingId?: string | null;
}

/**
 * S-4: recipient · status · document · template version · dates, with per-row actions.
 * Columns are ordered by importance (status right after the name); on phones the selection and recipient columns
 * stay pinned while the rest scrolls horizontally inside the card. The header row sticks while scrolling.
 */
export function SignaturesTable({ rows, selected, onSelect, onRemind, onPaper, onView, onScan, remindingId }: Props) {
  const t = useTranslations('signatures');
  const f = useFormat();
  const selectable = rows.filter(canSend).map((r) => r.id);
  const allSelected = selectable.length > 0 && selectable.every((id) => selected.includes(id));

  return (
    <Table containerClassName="md:max-h-[calc(100dvh-16rem)] md:overflow-y-auto">
      <THead>
        <TR>
          <TH sticky className="w-11 pr-0">
            <Checkbox checked={allSelected} disabled={!selectable.length} onCheckedChange={(v) => onSelect(v === true ? selectable : [])} aria-label={t('selectAll')} />
          </TH>
          <TH sticky className="max-sm:left-11 max-sm:shadow-[1px_0_0_var(--border)]">
            {t('recipient')}
          </TH>
          <TH>{t('status')}</TH>
          <TH>{t('document')}</TH>
          <TH>{t('version')}</TH>
          <TH>{t('sentAt')}</TH>
          <TH>{t('signedAt')}</TH>
          <TH numeric>{t('reminders')}</TH>
          <TH className="text-right">{t('actions')}</TH>
        </TR>
      </THead>
      <TBody>
        {rows.map((d) => (
          <TR key={d.id} data-testid={`sig-row-${d.recipientId}`} data-status={d.status} data-selected={selected.includes(d.id) || undefined}>
            <TD sticky className="w-11 pr-0">
              <Checkbox
                checked={selected.includes(d.id)}
                disabled={!canSend(d)}
                onCheckedChange={(v) => onSelect(v === true ? [...selected, d.id] : selected.filter((x) => x !== d.id))}
                aria-label={t('selectRow', { name: d.recipientName })}
              />
            </TD>
            <TD sticky className="min-w-40 max-sm:left-11 max-sm:max-w-44 max-sm:shadow-[1px_0_0_var(--border)]">
              <div className="font-medium">{d.recipientName}</div>
              <div className="max-w-48 truncate text-xs text-text-muted" title={d.recipientEmail ?? undefined}>
                {d.recipientEmail ?? '—'}
              </div>
            </TD>
            <TD>
              <DocumentStatusBadge status={d.status} />
            </TD>
            <TD>
              <button type="button" className="tabular whitespace-nowrap rounded-sm font-medium text-accent-text hover:underline" onClick={() => onView(d)}>
                {d.number}
              </button>
              <div className="max-w-40 truncate text-xs text-text-muted" title={d.template.title}>
                {d.template.title}
              </div>
            </TD>
            <TD>
              <span className="flex items-center gap-1.5 whitespace-nowrap">
                <span className="tabular">v{d.versionNumber}</span>
                {d.isCurrentVersion ? <Badge variant="success">{t('current')}</Badge> : <Badge variant="warning">{t('older')}</Badge>}
              </span>
            </TD>
            <TD className="tabular whitespace-nowrap text-text-muted" title={f.dateTime(d.sentAt)}>
              {f.date(d.sentAt)}
            </TD>
            <TD className="tabular whitespace-nowrap">
              {d.signedAt ? (
                <span className="flex items-center gap-1.5" title={`${t(`method.${d.signatureMethod}`)} · ${f.dateTime(d.signedAt)}`}>
                  {d.signatureMethod === 'paper' ? <Paperclip className="h-3.5 w-3.5 text-text-muted" aria-hidden /> : <FileSignature className="h-3.5 w-3.5 text-text-muted" aria-hidden />}
                  {f.date(d.signedAt)}
                </span>
              ) : (
                <span className="text-text-muted">—</span>
              )}
            </TD>
            <TD numeric>{d.reminderCount}</TD>
            <TD>
              {/* icon buttons keep the table narrow; the label is the tooltip and the accessible name */}
              <div className="flex justify-end gap-1">
                {canRemind(d) && (
                  <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => onRemind(d)} loading={remindingId === d.id} aria-label={t('remind')} title={t('remind')}>
                    {remindingId === d.id ? null : <Bell />}
                  </Button>
                )}
                {canPaperSign(d) && (
                  <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => onPaper(d)} aria-label={t('paper')} title={t('paper')}>
                    <Paperclip />
                  </Button>
                )}
                {d.hasScan && (
                  <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => onScan(d)} aria-label={t('scan')} title={t('scan')}>
                    <FileText />
                  </Button>
                )}
              </div>
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
