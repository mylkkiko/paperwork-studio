/**
 * Group signature table (S-4), "signed an older version" filter (S-6) and CSV/XLSX export (S-7).
 * Rows contain no passport-like data: only name, email, document number, version and status.
 */
import ExcelJS from 'exceljs';
import type { DocumentStatus } from '@prisma/client';
import type { Deps } from '../deps';
import { DEFAULT_LOCALE, t, type Locale } from '../i18n';
import { formatDateTimeHy } from './formatters';
import { toListDto, type DocumentsService } from './documents.service';

export interface TableFilter {
  groupId?: string;
  templateId?: string;
  status?: DocumentStatus;
  versionId?: string;
  /** Only signed documents on a non-current version whose recipient has no document on the current version */
  olderVersion?: boolean;
}

type Row = ReturnType<typeof toListDto>;

export const EXPORT_COLUMNS = ['recipient', 'email', 'document', 'template', 'version', 'status', 'method', 'sentAt', 'signedAt', 'reminders'] as const;

export class SignaturesTableService {
  constructor(
    private readonly d: Pick<Deps, 'prisma'>,
    private readonly documents: DocumentsService,
  ) {}

  async table(filter: TableFilter): Promise<Row[]> {
    let rows = await this.documents.list({ groupId: filter.groupId, templateId: filter.templateId, status: filter.status, versionId: filter.versionId });
    if (filter.olderVersion) {
      const onCurrent = new Set(rows.filter((r) => r.isCurrentVersion && r.status !== 'declined').map((r) => `${r.template.id}|${r.recipientId}`));
      rows = rows.filter((r) => r.status === 'signed' && !r.isCurrentVersion && !onCurrent.has(`${r.template.id}|${r.recipientId}`));
    }
    return rows.sort((a, b) => a.recipientName.localeCompare(b.recipientName, 'hy') || b.createdAt.getTime() - a.createdAt.getTime());
  }

  private cells(r: Row, locale: Locale) {
    return [
      r.recipientName,
      r.recipientEmail ?? '',
      r.number,
      r.template.title,
      `v${r.versionNumber}`,
      t(locale, `status.${r.status}`),
      r.signatureMethod ? t(locale, `method.${r.signatureMethod}`) : '',
      r.sentAt ? formatDateTimeHy(r.sentAt) : '',
      r.signedAt ? formatDateTimeHy(r.signedAt) : '',
      r.reminderCount,
    ];
  }

  headers(locale: Locale) {
    return EXPORT_COLUMNS.map((c) => t(locale, `export.${c}`));
  }

  async csv(filter: TableFilter, locale: Locale = DEFAULT_LOCALE): Promise<Buffer> {
    const rows = await this.table(filter);
    const esc = (v: unknown) => {
      const s = String(v ?? '');
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [this.headers(locale), ...rows.map((r) => this.cells(r, locale))].map((cols) => cols.map(esc).join(','));
    // BOM so Excel opens Armenian text as UTF-8
    return Buffer.from('﻿' + lines.join('\r\n') + '\r\n', 'utf8');
  }

  async xlsx(filter: TableFilter, locale: Locale = DEFAULT_LOCALE): Promise<Buffer> {
    const rows = await this.table(filter);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Paperwork Studio';
    const ws = wb.addWorksheet('Signatures');
    ws.addRow(this.headers(locale)).font = { bold: true };
    for (const r of rows) ws.addRow(this.cells(r, locale));
    ws.columns.forEach((col) => (col.width = 22));
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    return Buffer.from(await wb.xlsx.writeBuffer());
  }
}
