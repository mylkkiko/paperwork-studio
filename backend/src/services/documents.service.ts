/**
 * Coordinator actions on generated documents (S-1, S-3, S-5 manual, S-6).
 *
 * Status flow:   created ─send─▶ sent ─open link─▶ viewed ─confirm─▶ signed
 *                                  │                  └─decline─▶ declined
 *                                  └──(link expired, no signature)──▶ expired ─send again─▶ sent
 * Paper signature can be recorded from created / sent / viewed / expired.
 * Signed and declined documents are final: no sending, no reminders.
 */
import type { DocumentStatus, Prisma } from '@prisma/client';
import type { Deps } from '../deps';
import { conflict, notFound, unprocessable } from '../lib/errors';
import { DEFAULT_LOCALE } from '../i18n';
import type { AuditService } from './audit.service';
import type { BatchesService } from './batches.service';
import type { MergeFieldsService } from './merge-fields.service';
import type { SignLinksService } from './sign-links.service';
import { compareClauses } from './compare.service';
import type { Clause } from './clauses.service';

const FINAL: DocumentStatus[] = ['signed', 'declined'];
const SENDABLE: DocumentStatus[] = ['created', 'sent', 'viewed', 'expired'];
const REMINDABLE: DocumentStatus[] = ['sent', 'viewed'];

/** List view shape: never includes dataSnapshot (it contains passport data) or storage paths. */
const listSelect = {
  id: true,
  number: true,
  batchId: true,
  templateVersionId: true,
  recipientType: true,
  recipientId: true,
  recipientName: true,
  recipientEmail: true,
  groupId: true,
  status: true,
  sentAt: true,
  viewedAt: true,
  declinedAt: true,
  createdAt: true,
  signedPdfPath: true,
  templateVersion: { select: { versionNumber: true, status: true, template: { select: { id: true, title: true, category: true } } } },
  signatures: { select: { method: true, signedAt: true, scanPath: true }, orderBy: { signedAt: 'desc' as const }, take: 1 },
  _count: { select: { reminders: true } },
} satisfies Prisma.DocumentSelect;

type ListRow = Prisma.DocumentGetPayload<{ select: typeof listSelect }>;

export function toListDto(d: ListRow) {
  const sig = d.signatures[0];
  return {
    id: d.id,
    number: d.number,
    batchId: d.batchId,
    recipientType: d.recipientType,
    recipientId: d.recipientId,
    recipientName: d.recipientName,
    recipientEmail: d.recipientEmail,
    groupId: d.groupId,
    status: d.status,
    sentAt: d.sentAt,
    viewedAt: d.viewedAt,
    declinedAt: d.declinedAt,
    createdAt: d.createdAt,
    template: d.templateVersion.template,
    templateVersionId: d.templateVersionId,
    versionNumber: d.templateVersion.versionNumber,
    isCurrentVersion: d.templateVersion.status === 'published',
    signedAt: sig?.signedAt ?? null,
    signatureMethod: sig?.method ?? null,
    hasScan: Boolean(sig?.scanPath),
    hasSignedPdf: Boolean(d.signedPdfPath),
    reminderCount: d._count.reminders,
  };
}

export interface DocumentFilter {
  batchId?: string;
  groupId?: string;
  status?: DocumentStatus;
  versionId?: string;
  templateId?: string;
}

export class DocumentsService {
  constructor(
    private readonly d: Deps,
    private readonly audit: AuditService,
    private readonly links: SignLinksService,
    private readonly batches: BatchesService,
    private readonly mergeFields: MergeFieldsService,
  ) {}

  async list(filter: DocumentFilter) {
    const rows = await this.d.prisma.document.findMany({
      where: {
        batchId: filter.batchId,
        groupId: filter.groupId,
        status: filter.status,
        templateVersionId: filter.versionId,
        templateVersion: filter.templateId ? { templateId: filter.templateId } : undefined,
      },
      select: listSelect,
      orderBy: [{ createdAt: 'desc' }, { number: 'asc' }],
    });
    return rows.map(toListDto);
  }

  private async load(id: string) {
    const doc = await this.d.prisma.document.findUnique({ where: { id }, include: { templateVersion: { include: { template: true } }, signatures: true } });
    if (!doc) throw notFound('Document');
    return doc;
  }

  /** Signed copy if there is one (online signature), otherwise the original. */
  async pdf(id: string, which: 'auto' | 'original' = 'auto') {
    const doc = await this.load(id);
    const path = which === 'auto' && doc.signedPdfPath ? doc.signedPdfPath : doc.pdfPath;
    return { buffer: await this.d.storage.get(path), fileName: `${doc.number}.pdf` };
  }

  async docx(id: string) {
    const doc = await this.load(id);
    return { buffer: await this.d.storage.get(doc.docxPath), fileName: `${doc.number}.docx` };
  }

  async scan(id: string) {
    const doc = await this.load(id);
    const sig = doc.signatures.find((s) => s.scanPath);
    if (!sig?.scanPath) throw notFound('Scan');
    const ext = sig.scanPath.split('.').pop()!;
    return { buffer: await this.d.storage.get(sig.scanPath), fileName: `${doc.number}-scan.${ext}`, ext };
  }

  /**
   * Email a fresh signing link for each document. Returns per-document results instead of failing the whole
   * request when one document can't be sent (already signed, no email).
   */
  async send(actorId: string, documentIds: string[], kind: 'signRequest' | 'newVersion' = 'signRequest', summaryFor?: (docId: string) => Promise<string>) {
    const results: { id: string; ok: boolean; code?: string }[] = [];
    for (const id of documentIds) {
      const doc = await this.d.prisma.document.findUnique({ where: { id }, include: { templateVersion: { include: { template: true } } } });
      if (!doc) {
        results.push({ id, ok: false, code: 'NOT_FOUND' });
        continue;
      }
      if (!SENDABLE.includes(doc.status)) {
        results.push({ id, ok: false, code: 'DOCUMENT_FINAL' });
        continue;
      }
      if (!doc.recipientEmail) {
        results.push({ id, ok: false, code: 'NO_EMAIL' });
        continue;
      }
      const { token, request } = await this.links.issueNew(id);
      await this.links.email(kind, doc, token, request.expiresAt, summaryFor ? await summaryFor(id) : undefined);
      await this.d.prisma.document.update({ where: { id }, data: { status: 'sent', sentAt: this.d.clock.now() } });
      await this.audit.log(actorId, 'document.sent', 'Document', id, { kind, expiresAt: request.expiresAt });
      results.push({ id, ok: true });
    }
    return { sent: results.filter((r) => r.ok).length, results };
  }

  /** "Remind now" button (S-5). */
  async remind(actorId: string, id: string) {
    const doc = await this.load(id);
    if (FINAL.includes(doc.status)) throw conflict('DOCUMENT_FINAL', `Document is ${doc.status}; no reminder needed`);
    if (doc.status === 'created') throw conflict('NOT_SENT', 'Document has not been sent yet');
    const active = await this.links.activeRequest(id);
    if (doc.status === 'expired' || !active) throw conflict('LINK_EXPIRED', 'The signing link has expired; send the document again');
    const { token } = await this.links.issueAdditional(id, active.expiresAt);
    await this.links.email('reminder', doc, token, active.expiresAt);
    const reminder = await this.d.prisma.reminder.create({ data: { documentId: id, type: 'manual', sentAt: this.d.clock.now() } });
    await this.audit.log(actorId, 'document.reminded', 'Document', id, { type: 'manual' });
    return reminder;
  }

  /** S-3: coordinator records a handwritten signature and uploads the scan. */
  async paperSignature(actorId: string, id: string, scan: { buffer: Buffer; ext: string }, input: { signerName?: string; signedAt?: Date }) {
    const doc = await this.load(id);
    if (FINAL.includes(doc.status)) throw conflict('DOCUMENT_FINAL', `Document is already ${doc.status}`);
    const scanPath = `scans/${doc.batchId}/${doc.number}-${Date.now()}.${scan.ext}`;
    await this.d.storage.put(scanPath, scan.buffer);
    const now = this.d.clock.now();
    const signature = await this.d.prisma.$transaction(async (tx) => {
      const sig = await tx.signature.create({
        data: { documentId: id, method: 'paper', signerName: input.signerName || doc.recipientName, signedAt: input.signedAt ?? now, scanPath, recordedById: actorId },
      });
      await tx.document.update({ where: { id }, data: { status: 'signed' } });
      await tx.signatureRequest.updateMany({ where: { documentId: id, revokedAt: null }, data: { revokedAt: now } });
      return sig;
    });
    await this.audit.log(actorId, 'document.paper_signed', 'Document', id, { signatureId: signature.id });
    const { scanPath: _p, ...dto } = signature;
    return { ...dto, hasScan: true };
  }

  /**
   * S-6: recipients who signed an OLDER version of the template get a new document generated from the current
   * published version, emailed automatically when generation finishes, with the change summary.
   * Manual values (amount, dates) are carried over from their signed document; Core Engine data is re-read.
   * Recipients who already have a document on the current version are skipped.
   */
  async resendNewVersion(actorId: string, input: { templateId: string; documentIds?: string[]; commonValues?: Record<string, unknown> }) {
    const published = await this.d.prisma.templateVersion.findFirst({ where: { templateId: input.templateId, status: 'published' } });
    if (!published) throw unprocessable('VERSION_NOT_PUBLISHED', 'The template has no published version');

    const signedOld = await this.d.prisma.document.findMany({
      where: {
        id: input.documentIds?.length ? { in: input.documentIds } : undefined,
        status: 'signed',
        templateVersion: { templateId: input.templateId },
        NOT: { templateVersionId: published.id },
      },
      // newest signed version first (createdAt only breaks ties)
      orderBy: [{ templateVersion: { versionNumber: 'desc' } }, { createdAt: 'desc' }],
    });
    const onCurrent = new Set(
      (await this.d.prisma.document.findMany({ where: { templateVersionId: published.id, status: { not: 'declined' } }, select: { recipientId: true } })).map((x) => x.recipientId),
    );
    // latest signed version per recipient, skipping those already on the current version
    const byRecipient = new Map<string, (typeof signedOld)[number]>();
    for (const doc of signedOld) if (!onCurrent.has(doc.recipientId) && !byRecipient.has(doc.recipientId)) byRecipient.set(doc.recipientId, doc);
    const docs = [...byRecipient.values()];
    if (docs.length === 0) return { batches: [], recipients: 0 };

    const dictionary = await this.mergeFields.map();
    // One batch per (recipient type, group) so the history stays readable.
    const groups = new Map<string, typeof docs>();
    for (const doc of docs) {
      const key = `${doc.recipientType}|${doc.groupId ?? ''}`;
      groups.set(key, [...(groups.get(key) ?? []), doc]);
    }
    const batches = [];
    for (const group of groups.values()) {
      const presetValues: Record<string, Record<string, string>> = {};
      for (const doc of group) {
        const snapshot = doc.dataSnapshot as Record<string, string>;
        presetValues[doc.recipientId] = Object.fromEntries(Object.entries(snapshot).filter(([k]) => dictionary.get(k)?.source === 'manual'));
      }
      batches.push(
        await this.batches.create(actorId, {
          templateVersionId: published.id,
          recipientType: group[0].recipientType,
          groupId: group[0].groupId,
          recipientIds: group.map((doc) => doc.recipientId),
          commonValues: input.commonValues,
          presetValues,
          sendOnComplete: 'newVersion',
        }),
      );
    }
    await this.audit.log(actorId, 'document.resend_new_version', 'Template', input.templateId, { recipients: docs.length, batches: batches.map((b) => b.id) });
    return { batches, recipients: docs.length };
  }

  /**
   * Called by the generation job when a batch with sendOnComplete='newVersion' finishes: email every new
   * document with the summary of changes between the version the recipient signed and the new one.
   */
  async sendNewVersionBatch(batchId: string, actorId: string) {
    const docs = await this.d.prisma.document.findMany({ where: { batchId }, include: { templateVersion: true } });
    if (docs.length === 0) return;
    const newVersion = docs[0].templateVersion;
    const summaryCache = new Map<string, string>();

    const summaryFor = async (docId: string) => {
      const doc = docs.find((x) => x.id === docId)!;
      const old = await this.d.prisma.document.findFirst({
        where: { recipientId: doc.recipientId, status: 'signed', templateVersion: { templateId: newVersion.templateId }, NOT: { templateVersionId: newVersion.id } },
        // the most recent version this recipient signed
        orderBy: [{ templateVersion: { versionNumber: 'desc' } }, { createdAt: 'desc' }],
        include: { templateVersion: true },
      });
      if (!old) return newVersion.changeSummary ?? '';
      const cached = summaryCache.get(old.templateVersionId);
      if (cached !== undefined) return cached;
      // The editor's (possibly edited) summary is exact when it compares against the version they signed.
      const text =
        newVersion.comparedToId === old.templateVersionId && newVersion.changeSummary
          ? newVersion.changeSummary
          : (await this.d.summary.generate(compareClauses(old.templateVersion.clauses as unknown as Clause[], newVersion.clauses as unknown as Clause[]), DEFAULT_LOCALE)).join('\n');
      const bullet = text
        .split('\n')
        .filter(Boolean)
        .map((l) => `• ${l}`)
        .join('\n');
      summaryCache.set(old.templateVersionId, bullet);
      return bullet;
    };
    await this.send(actorId, docs.map((x) => x.id), 'newVersion', summaryFor);
  }
}
