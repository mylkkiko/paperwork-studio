import type { Request, Response } from 'express';
import { isLocale, DEFAULT_LOCALE } from '../i18n';

const MIME: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  zip: 'application/zip',
  csv: 'text/csv; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  png: 'image/png',
  jpg: 'image/jpeg',
};

/** Send a file. `inline` lets the browser show PDFs in an <iframe>; otherwise it downloads. */
export function sendFile(res: Response, buffer: Buffer, fileName: string, opts: { inline?: boolean } = {}) {
  const ext = fileName.split('.').pop()!.toLowerCase();
  res.setHeader('Content-Type', MIME[ext] ?? 'application/octet-stream');
  res.setHeader('Content-Length', buffer.length);
  res.setHeader('Content-Disposition', `${opts.inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.end(buffer);
}

export const localeOf = (req: Request) => {
  const q = req.query.locale;
  return isLocale(q) ? q : DEFAULT_LOCALE;
};

export const clientInfo = (req: Request) => ({ ip: req.ip ?? null, userAgent: req.header('user-agent') ?? null });
