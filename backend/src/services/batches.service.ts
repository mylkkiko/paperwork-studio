/**
 * Batch generation (G-1..G-8).
 *
 *  precheck()  -> which recipients are missing required data, which shared fields must be entered
 *  create()    -> validates everything again, stores the batch, enqueues the job (BullMQ)
 *  process()   -> the job: for each recipient fill .docx -> PDF via Gotenberg -> store -> Document row;
 *                 then ZIP + one merged PDF for printing. Progress is written after every document.
 *
 * process() is idempotent: recipients that already have a document in this batch are skipped, so a retried
 * job continues where it stopped instead of creating duplicates.
 */
import archiver from 'archiver';
import { PassThrough } from 'node:stream';
import { PDFDocument } from 'pdf-lib';
import type { GenerationBatch, Prisma, RecipientType } from '@prisma/client';
import type { Deps } from '../deps';
import { badRequest, notFound, unprocessable } from '../lib/errors';
import { logger } from '../lib/logger';
import * as docx from './docx.service';
import type { AuditService } from './audit.service';
import type { MergeFieldsService } from './merge-fields.service';
import { buildValues, findMissing, RecipientsService, signatureText, type MissingField, type Recipient } from './recipients.service';
import { formatDateHy, formatValue, type FieldType } from './formatters';

export interface BatchInput {
  templateVersionId?: string;
  /** Alternative to templateVersionId: use the template's published version */
  templateId?: string;
  recipientType: RecipientType;
  groupId?: string | null;
  recipientIds?: string[];
  commonValues?: Record<string, unknown>;
  /** Per-recipient manual values: { "stu-007": { "student.passport": "AN1234567" } } */
  overrides?: Record<string, Record<string, unknown>>;
  excludedIds?: string[];
}

interface InternalBatchInput extends BatchInput {
  presetValues?: Record<string, Record<string, string>>;
  sendOnComplete?: 'newVersion' | null;
}

export interface PrecheckResult {
  templateVersionId: string;
  total: number;
  /** Manual fields shared by the whole pack (entered once, G-4) */
  commonFields: { key: string; label: string; type: string; required: boolean; value: unknown }[];
  missingCommon: MissingField[];
  /** Values that can't be formatted for their field type (e.g. "someday" for a date) */
  invalidValues: { recipientId: string | null; key: string; value: unknown }[];
  recipients: { id: string; name: string; email: string | null; excluded: boolean; missing: MissingField[] }[];
  ready: boolean;
}

/** Numbers like PS-2026-000123, unique across all documents. */
export async function nextDocumentNumber(prisma: Deps['prisma'], year: number): Promise<string> {
  // A single atomic statement: safe with concurrent workers, no explicit transaction needed.
  const rows = await prisma.$queryRaw<{ value: number }[]>`
    INSERT INTO "DocumentCounter" ("year", "value") VALUES (${year}, 1)
    ON CONFLICT ("year") DO UPDATE SET "value" = "DocumentCounter"."value" + 1
    RETURNING "value"`;
  return `PS-${year}-${String(rows[0].value).padStart(6, '0')}`;
}

/**
 * Run `fn` over items with at most `limit` in flight.
 * On the first error, workers stop taking new items and we wait for the in-flight ones to settle before throwing.
 * (Throwing immediately would leave workers running in the background after the batch is marked failed,
 * racing with the job's retry.)
 */
async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  let failure: { error: unknown } | null = null;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (!failure && next < items.length) {
      const item = items[next++];
      try {
        await fn(item);
      } catch (error) {
        failure ??= { error };
      }
    }
  });
  await Promise.all(workers);
  if (failure) throw (failure as { error: unknown }).error;
}

const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '_').trim();

export class BatchesService {
  constructor(
    private readonly d: Deps,
    private readonly audit: AuditService,
    private readonly mergeFields: MergeFieldsService,
    private readonly recipients: RecipientsService,
  ) {}

  private async publishedVersion(input: BatchInput) {
    const version = input.templateVersionId
      ? await this.d.prisma.templateVersion.findUnique({ where: { id: input.templateVersionId }, include: { template: true } })
      : input.templateId
        ? await this.d.prisma.templateVersion.findFirst({ where: { templateId: input.templateId, status: 'published' }, include: { template: true } })
        : null;
    if (!version) throw notFound(input.templateVersionId ? 'Template version' : 'Published version of the template');
    if (version.status !== 'published') throw unprocessable('VERSION_NOT_PUBLISHED', 'Documents can only be generated from the published version');
    return version;
  }

  async precheck(input: InternalBatchInput): Promise<PrecheckResult> {
    const version = await this.publishedVersion(input);
    const dictionary = await this.mergeFields.map();
    const fields = version.fields as string[];
    const recipients = await this.recipients.resolve(input);
    if (recipients.length === 0) throw badRequest('No recipients selected');
    const common = input.commonValues ?? {};
    const excluded = new Set(input.excludedIds ?? []);

    const commonFields = fields
      .map((key) => dictionary.get(key))
      .filter((def) => def?.source === 'manual')
      .map((def) => ({ key: def!.key, label: def!.label, type: def!.type, required: def!.required, value: common[def!.key] ?? null }));

    // A shared field counts as missing if it's empty AND at least one included recipient has no override/preset for it.
    const commonKeys = new Set(commonFields.map((f) => f.key));
    const rows = recipients.map((r) => {
      const all = findMissing({ fields, dictionary, recipient: r, common, override: input.overrides?.[r.id], preset: input.presetValues?.[r.id] });
      return { id: r.id, name: r.name, email: r.email, excluded: excluded.has(r.id), missing: all.filter((m) => !commonKeys.has(m.key)), missingShared: all.filter((m) => commonKeys.has(m.key)) };
    });
    const included = rows.filter((r) => !r.excluded);
    const missingCommon = commonFields
      .filter((f) => included.some((r) => r.missingShared.some((m) => m.key === f.key)))
      .map((f) => ({ key: f.key, label: f.label, source: 'manual', type: f.type }));

    // Typed-in values must be formattable for their field type, so the job never fails on "someday" as a date.
    const invalidValues: PrecheckResult['invalidValues'] = [];
    const checkValues = (recipientId: string | null, values: Record<string, unknown> | undefined) => {
      for (const [key, value] of Object.entries(values ?? {})) {
        const def = dictionary.get(key);
        if (!def || value === null || value === '') continue;
        try {
          formatValue(def.type as FieldType, value);
        } catch {
          invalidValues.push({ recipientId, key, value });
        }
      }
    };
    checkValues(null, common);
    for (const [rid, values] of Object.entries(input.overrides ?? {})) if (!excluded.has(rid)) checkValues(rid, values);

    return {
      templateVersionId: version.id,
      total: included.length,
      commonFields,
      missingCommon,
      invalidValues,
      recipients: rows.map(({ missingShared: _ms, ...r }) => r),
      ready: included.length > 0 && missingCommon.length === 0 && invalidValues.length === 0 && included.every((r) => r.missing.length === 0),
    };
  }

  async create(actorId: string, input: InternalBatchInput) {
    const check = await this.precheck(input);
    if (check.total === 0) throw badRequest('All recipients are excluded');
    if (check.invalidValues.length) {
      throw unprocessable('INVALID_VALUES', 'Some values do not match their field type', check.invalidValues);
    }
    if (!check.ready) {
      throw unprocessable('MISSING_DATA', 'Some required values are missing. Fill them in or exclude the recipients.', {
        missingCommon: check.missingCommon,
        recipients: check.recipients.filter((r) => !r.excluded && r.missing.length).map((r) => ({ id: r.id, missing: r.missing.map((m) => m.key) })),
      });
    }
    const group = input.groupId ? await this.d.core.getGroup(input.groupId) : null;
    const includedIds = check.recipients.filter((r) => !r.excluded).map((r) => r.id);
    const batch = await this.d.prisma.generationBatch.create({
      data: {
        templateVersionId: check.templateVersionId,
        recipientType: input.recipientType,
        groupId: input.groupId ?? null,
        groupName: group?.name ?? null,
        recipientIds: includedIds,
        commonValues: (input.commonValues ?? {}) as Prisma.InputJsonValue,
        overrides: (input.overrides ?? {}) as Prisma.InputJsonValue,
        presetValues: (input.presetValues ?? {}) as Prisma.InputJsonValue,
        excludedIds: input.excludedIds ?? [],
        total: includedIds.length,
        sendOnComplete: input.sendOnComplete ?? null,
        createdById: actorId,
        createdAt: this.d.clock.now(),
      },
    });
    await this.audit.log(actorId, 'batch.created', 'GenerationBatch', batch.id, { templateVersionId: batch.templateVersionId, groupId: batch.groupId, total: batch.total });
    await this.d.queue.enqueue(batch.id);
    return this.dto(batch);
  }

  async get(id: string) {
    const batch = await this.d.prisma.generationBatch.findUnique({ where: { id }, include: { templateVersion: { include: { template: true } } } });
    if (!batch) throw notFound('Batch');
    return this.dto(batch);
  }

  async list(filter: { groupId?: string; limit?: number }) {
    const batches = await this.d.prisma.generationBatch.findMany({
      where: { groupId: filter.groupId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(filter.limit ?? 50, 200),
      include: { templateVersion: { include: { template: true } } },
    });
    const creators = new Map(
      (await this.d.prisma.user.findMany({ where: { id: { in: [...new Set(batches.map((b) => b.createdById))] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]),
    );
    return batches.map((b) => ({ ...this.dto(b), createdByName: creators.get(b.createdById) ?? null }));
  }

  async file(id: string, kind: 'zip' | 'merged') {
    const batch = await this.d.prisma.generationBatch.findUnique({ where: { id } });
    if (!batch) throw notFound('Batch');
    const path = kind === 'zip' ? batch.zipPath : batch.mergedPdfPath;
    if (!path) throw unprocessable('BATCH_NOT_READY', `Batch is ${batch.status}; files are not ready yet`);
    return { buffer: await this.d.storage.get(path), fileName: `${batch.groupName ?? 'batch'}-${batch.id.slice(0, 8)}.${kind === 'zip' ? 'zip' : 'pdf'}` };
  }

  /** Public shape: no storage paths, no per-recipient personal data. */
  private dto(b: GenerationBatch & { templateVersion?: { versionNumber: number; template: { id: string; title: string; category: string } } }) {
    return {
      id: b.id,
      status: b.status,
      progress: b.progress,
      total: b.total,
      error: b.error,
      recipientType: b.recipientType,
      groupId: b.groupId,
      groupName: b.groupName,
      templateVersionId: b.templateVersionId,
      template: b.templateVersion ? { id: b.templateVersion.template.id, title: b.templateVersion.template.title, category: b.templateVersion.template.category, versionNumber: b.templateVersion.versionNumber } : undefined,
      commonValues: b.commonValues,
      excludedIds: b.excludedIds,
      hasZip: Boolean(b.zipPath),
      hasMergedPdf: Boolean(b.mergedPdfPath),
      sendOnComplete: b.sendOnComplete,
      createdById: b.createdById,
      createdAt: b.createdAt,
      finishedAt: b.finishedAt,
    };
  }

  // ------------------------------------------------------------------ the job

  async process(batchId: string, onDone?: (batch: GenerationBatch) => Promise<void>) {
    const batch = await this.d.prisma.generationBatch.findUnique({ where: { id: batchId }, include: { templateVersion: { include: { template: true } } } });
    if (!batch) throw new Error(`Batch ${batchId} not found`);
    if (batch.status === 'completed') return;

    try {
      await this.d.prisma.generationBatch.update({ where: { id: batchId }, data: { status: 'running', error: null } });
      const version = batch.templateVersion;
      const templateFile = await this.d.storage.get(version.filePath);
      const dictionary = await this.mergeFields.map();
      const fields = version.fields as string[];
      const ids = batch.recipientIds as string[];
      const recipients = (await this.recipients.resolve({ recipientType: batch.recipientType, groupId: batch.groupId, recipientIds: ids })).filter((r) => ids.includes(r.id));
      const overrides = batch.overrides as Record<string, Record<string, unknown>>;
      const presets = batch.presetValues as Record<string, Record<string, string>>;
      const common = batch.commonValues as Record<string, unknown>;

      const existing = await this.d.prisma.document.findMany({ where: { batchId }, select: { recipientId: true } });
      const done = new Set(existing.map((e) => e.recipientId));
      const todo = recipients.filter((r) => !done.has(r.id));
      await this.d.prisma.generationBatch.update({ where: { id: batchId }, data: { total: recipients.length, progress: done.size } });

      const now = this.d.clock.now();
      await mapLimit(todo, this.d.config.GENERATION_CONCURRENCY, async (r: Recipient) => {
        const number = await nextDocumentNumber(this.d.prisma, now.getUTCFullYear());
        const values = buildValues({
          fields,
          dictionary,
          recipient: r,
          common,
          override: overrides[r.id],
          preset: presets[r.id],
          system: {
            'document.number': number,
            'document.date': common['document.date'] ? formatDateHy(common['document.date'] as string) : formatDateHy(now),
            'signature.checkbox': signatureText(),
          },
        });
        const filled = docx.render(templateFile, values);
        const pdf = await this.d.pdf.docxToPdf(filled, `${number}.docx`);
        const base = `documents/${batchId}/${number}`;
        await Promise.all([this.d.storage.put(`${base}.docx`, filled), this.d.storage.put(`${base}.pdf`, pdf)]);
        await this.d.prisma.document.create({
          data: {
            number,
            batchId,
            templateVersionId: version.id,
            recipientType: r.type,
            recipientId: r.id,
            recipientName: r.name,
            recipientEmail: r.email,
            groupId: r.groupId,
            dataSnapshot: values,
            pdfPath: `${base}.pdf`,
            docxPath: `${base}.docx`,
            createdAt: now,
          },
        });
        await this.d.prisma.generationBatch.update({ where: { id: batchId }, data: { progress: { increment: 1 } } });
      });

      await this.buildPackFiles(batchId);
      const finished = await this.d.prisma.generationBatch.update({ where: { id: batchId }, data: { status: 'completed', finishedAt: this.d.clock.now() } });
      await this.audit.log(batch.createdById, 'batch.completed', 'GenerationBatch', batchId, { documents: finished.progress });
      if (onDone) await onDone(finished);
    } catch (err) {
      logger.error({ err, batchId }, 'Batch generation failed');
      await this.d.prisma.generationBatch.update({ where: { id: batchId }, data: { status: 'failed', error: (err as Error).message.slice(0, 500) } });
      throw err;
    }
  }

  /** ZIP with every PDF + DOCX, and one merged PDF in recipient order (for printing the whole pack). */
  private async buildPackFiles(batchId: string) {
    const docs = await this.d.prisma.document.findMany({ where: { batchId }, orderBy: { number: 'asc' } });
    const merged = await PDFDocument.create();
    const zip = archiver('zip', { zlib: { level: 6 } });
    const sink = new PassThrough();
    const chunks: Buffer[] = [];
    sink.on('data', (c: Buffer) => chunks.push(c));
    const finished = new Promise<void>((resolve, reject) => {
      sink.on('end', resolve);
      zip.on('error', reject);
    });
    zip.pipe(sink);

    for (const doc of docs) {
      const [pdf, docxBuf] = await Promise.all([this.d.storage.get(doc.pdfPath), this.d.storage.get(doc.docxPath)]);
      const name = safeName(`${doc.number} ${doc.recipientName}`);
      zip.append(pdf, { name: `pdf/${name}.pdf` });
      zip.append(docxBuf, { name: `docx/${name}.docx` });
      const src = await PDFDocument.load(pdf);
      for (const page of await merged.copyPages(src, src.getPageIndices())) merged.addPage(page);
    }
    await zip.finalize();
    await finished;

    const zipPath = `documents/${batchId}/pack.zip`;
    const mergedPath = `documents/${batchId}/pack.pdf`;
    await this.d.storage.put(zipPath, Buffer.concat(chunks));
    await this.d.storage.put(mergedPath, Buffer.from(await merged.save()));
    await this.d.prisma.generationBatch.update({ where: { id: batchId }, data: { zipPath, mergedPdfPath: mergedPath } });
  }
}
