/**
 * Template library and version lifecycle (T-1..T-8, V-4/V-5).
 *
 * Lifecycle of a version:   draft ──publish──▶ published ──(next publish)──▶ archived
 *  - Every upload creates a NEW version (v1, v2, …). Files and versions are never modified or deleted,
 *    except that a draft's change summary can be edited, and status moves forward.
 *  - At most one published version per template: publishing archives the previous one (in one transaction).
 *  - Documents can only be generated from the published version.
 */
import { randomUUID } from 'node:crypto';
import type { Prisma, TemplateCategory, TemplateVersion, VersionStatus } from '@prisma/client';
import type { Deps } from '../deps';
import { conflict, notFound, unprocessable } from '../lib/errors';
import { DEFAULT_LOCALE, t, type Locale } from '../i18n';
import * as docx from './docx.service';
import { splitClauses, hasNoClauses, type Clause } from './clauses.service';
import { compareClauses, type Comparison } from './compare.service';
import type { AuditService } from './audit.service';
import type { MergeFieldsService } from './merge-fields.service';
import { buildValues, CATEGORY_RECIPIENT, RecipientsService, signatureText } from './recipients.service';
import { formatDateHy } from './formatters';

export interface UploadWarning {
  code: 'UNKNOWN_FIELD' | 'CLAUSES_NOT_DETECTED' | 'MISSING_SIGNATURE_FIELD';
  field?: string;
  message: string;
}

interface Analysis {
  fields: string[];
  clauses: Clause[];
  warnings: UploadWarning[];
}

const SIGNATURE_FIELD = 'signature.checkbox';

export class TemplatesService {
  constructor(
    private readonly d: Deps,
    private readonly audit: AuditService,
    private readonly mergeFields: MergeFieldsService,
    private readonly recipients: RecipientsService,
  ) {}

  // ---------------------------------------------------------------- upload analysis

  /** Fields, clauses and warnings for an uploaded .docx. Throws 422 for broken files/tags. */
  async analyze(file: Buffer, locale: Locale = DEFAULT_LOCALE): Promise<Analysis> {
    const fields = docx.extractFields(file);
    const clauses = splitClauses(await docx.extractParagraphs(file));
    const dictionary = await this.mergeFields.map();
    const warnings: UploadWarning[] = [];

    for (const field of fields) {
      if (!dictionary.has(field)) warnings.push({ code: 'UNKNOWN_FIELD', field, message: t(locale, 'warnings.UNKNOWN_FIELD', { field }) });
    }
    if (!fields.includes(SIGNATURE_FIELD)) {
      warnings.push({ code: 'MISSING_SIGNATURE_FIELD', field: SIGNATURE_FIELD, message: t(locale, 'warnings.MISSING_SIGNATURE_FIELD') });
    }
    // Word auto-numbering is invisible in the extracted text, so the clause comparison would see one big preamble.
    if (hasNoClauses(clauses) && docx.usesAutoNumbering(file)) {
      warnings.push({ code: 'CLAUSES_NOT_DETECTED', message: t(locale, 'warnings.CLAUSES_NOT_DETECTED') });
    }
    return { fields, clauses, warnings };
  }

  // ---------------------------------------------------------------- queries

  async list(filter: { category?: TemplateCategory; status?: VersionStatus; q?: string }) {
    const templates = await this.d.prisma.template.findMany({
      where: {
        category: filter.category,
        title: filter.q ? { contains: filter.q, mode: 'insensitive' } : undefined,
        versions: filter.status ? { some: { status: filter.status } } : undefined,
      },
      include: { versions: { select: { id: true, versionNumber: true, status: true, createdAt: true, publishedAt: true }, orderBy: { versionNumber: 'desc' } } },
      orderBy: { createdAt: 'desc' },
    });
    return templates.map(({ versions, ...tpl }) => ({
      ...tpl,
      latestVersion: versions[0] ?? null,
      publishedVersion: versions.find((v) => v.status === 'published') ?? null,
      hasDraft: versions.some((v) => v.status === 'draft'),
      versionCount: versions.length,
    }));
  }

  async get(id: string) {
    const tpl = await this.d.prisma.template.findUnique({
      where: { id },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          select: { id: true, versionNumber: true, status: true, warnings: true, changeSummary: true, createdById: true, createdAt: true, publishedAt: true, comparedToId: true },
        },
      },
    });
    if (!tpl) throw notFound('Template');
    const documentCount = await this.d.prisma.document.count({ where: { templateVersion: { templateId: id } } });
    return { ...tpl, documentCount };
  }

  async getVersion(templateId: string, versionId: string) {
    const version = await this.d.prisma.templateVersion.findFirst({ where: { id: versionId, templateId } });
    if (!version) throw notFound('Template version');
    const dictionary = await this.mergeFields.map();
    const fields = (version.fields as string[]).map((key) => {
      const def = dictionary.get(key);
      return def ? { key, known: true, label: def.label, source: def.source, type: def.type, required: def.required } : { key, known: false };
    });
    const { filePath: _filePath, ...rest } = version;
    return { ...rest, fields };
  }

  private async loadVersion(templateId: string, versionId: string) {
    const v = await this.d.prisma.templateVersion.findFirst({ where: { id: versionId, templateId }, include: { template: true } });
    if (!v) throw notFound('Template version');
    return v;
  }

  // ---------------------------------------------------------------- commands

  async create(actorId: string, input: { title: string; category: TemplateCategory; file: Buffer }) {
    const analysis = await this.analyze(input.file);
    const templateId = randomUUID();
    const filePath = await this.storeFile(templateId, 1, input.file);
    const template = await this.d.prisma.template.create({
      data: {
        id: templateId,
        title: input.title,
        category: input.category,
        createdById: actorId,
        versions: { create: this.versionData(1, filePath, analysis, actorId) },
      },
      include: { versions: true },
    });
    const version = template.versions[0];
    await this.audit.log(actorId, 'template.created', 'Template', template.id, { title: template.title, category: template.category });
    await this.audit.log(actorId, 'version.created', 'TemplateVersion', version.id, { templateId, versionNumber: 1 });
    return { template: { id: template.id, title: template.title, category: template.category }, version: this.versionDto(version), warnings: analysis.warnings };
  }

  /**
   * New draft version. It is compared with the currently published version (or, if nothing is published yet,
   * with the latest version) and the summary is generated immediately (V-4).
   */
  async addVersion(actorId: string, templateId: string, file: Buffer) {
    const template = await this.d.prisma.template.findUnique({ where: { id: templateId }, include: { versions: { orderBy: { versionNumber: 'desc' } } } });
    if (!template) throw notFound('Template');
    const analysis = await this.analyze(file);
    const base = template.versions.find((v) => v.status === 'published') ?? template.versions[0] ?? null;
    const versionNumber = (template.versions[0]?.versionNumber ?? 0) + 1;
    const filePath = await this.storeFile(templateId, versionNumber, file);

    let comparison: Comparison | null = null;
    let summary: string | null = null;
    if (base) {
      comparison = { fromVersionId: base.id, ...compareClauses(base.clauses as unknown as Clause[], analysis.clauses) };
      summary = (await this.d.summary.generate(comparison, DEFAULT_LOCALE)).join('\n');
    }

    const version = await this.d.prisma.templateVersion.create({
      data: {
        ...this.versionData(versionNumber, filePath, analysis, actorId),
        templateId,
        comparison: (comparison ?? undefined) as Prisma.InputJsonValue | undefined,
        comparedToId: base?.id ?? null,
        changeSummary: summary,
      },
    });
    await this.audit.log(actorId, 'version.created', 'TemplateVersion', version.id, { templateId, versionNumber, comparedTo: base?.versionNumber ?? null });
    return { version: this.versionDto(version), warnings: analysis.warnings, comparison: comparison ? { ...comparison, toVersionId: version.id } : null };
  }

  /** V-5: the editor may rewrite the summary, only while the version is a draft. */
  async updateSummary(actorId: string, templateId: string, versionId: string, changeSummary: string) {
    const v = await this.loadVersion(templateId, versionId);
    if (v.status !== 'draft') throw conflict('VERSION_NOT_DRAFT', 'Only draft versions can be edited');
    const updated = await this.d.prisma.templateVersion.update({ where: { id: v.id }, data: { changeSummary } });
    await this.audit.log(actorId, 'version.summary_updated', 'TemplateVersion', v.id, {});
    return this.versionDto(updated);
  }

  async publish(actorId: string, templateId: string, versionId: string) {
    const v = await this.loadVersion(templateId, versionId);
    if (v.status !== 'draft') throw conflict('VERSION_NOT_DRAFT', `Version is ${v.status}; only drafts can be published`);
    const unknown = (v.warnings as unknown as UploadWarning[]).filter((w) => w.code === 'UNKNOWN_FIELD');
    // Re-check against the dictionary: an admin may have added the field since the upload.
    const dictionary = await this.mergeFields.map();
    const stillUnknown = unknown.filter((w) => w.field && !dictionary.has(w.field));
    if (stillUnknown.length) {
      throw unprocessable('UNKNOWN_FIELDS', 'Add these fields to the dictionary or fix the template before publishing', stillUnknown.map((w) => w.field));
    }

    const now = this.d.clock.now();
    const [archived, published] = await this.d.prisma.$transaction([
      this.d.prisma.templateVersion.updateMany({ where: { templateId, status: 'published' }, data: { status: 'archived' } }),
      this.d.prisma.templateVersion.update({ where: { id: v.id }, data: { status: 'published', publishedAt: now } }),
    ]);
    await this.audit.log(actorId, 'version.published', 'TemplateVersion', v.id, { templateId, versionNumber: v.versionNumber, archivedCount: archived.count });
    return this.versionDto(published);
  }

  async remove(actorId: string, templateId: string) {
    const template = await this.d.prisma.template.findUnique({ where: { id: templateId } });
    if (!template) throw notFound('Template');
    const used = await this.d.prisma.generationBatch.count({ where: { templateVersion: { templateId } } });
    if (used > 0) throw conflict('TEMPLATE_IN_USE', 'Documents were generated from this template; it cannot be deleted');
    await this.d.prisma.template.delete({ where: { id: templateId } });
    await this.d.storage.remove(`templates/${templateId}`);
    await this.d.storage.remove(`previews/${templateId}`);
    await this.audit.log(actorId, 'template.deleted', 'Template', templateId, { title: template.title });
  }

  async compare(templateId: string, fromId: string, toId: string): Promise<Comparison> {
    const [from, to] = await Promise.all([this.loadVersion(templateId, fromId), this.loadVersion(templateId, toId)]);
    const comparison = compareClauses(from.clauses as unknown as Clause[], to.clauses as unknown as Clause[]);
    return { fromVersionId: from.id, toVersionId: to.id, ...comparison };
  }

  async summarize(comparison: Comparison, locale: Locale) {
    return this.d.summary.generate(comparison, locale);
  }

  /**
   * T-8: PDF of the version filled with demo data (first matching Core Engine record + placeholder values).
   * Versions are immutable, so the PDF is cached in storage.
   */
  async preview(templateId: string, versionId: string): Promise<Buffer> {
    const v = await this.loadVersion(templateId, versionId);
    const cacheKey = `previews/${templateId}/${v.id}.pdf`;
    if (await this.d.storage.exists(cacheKey)) return this.d.storage.get(cacheKey);

    const recipientType = CATEGORY_RECIPIENT[v.template.category];
    const sample = await this.sampleRecipient(recipientType);
    const dictionary = await this.mergeFields.map();
    const fields = v.fields as string[];
    const today = this.d.clock.now();
    const common: Record<string, unknown> = {};
    for (const key of fields) {
      const def = dictionary.get(key);
      common[key] = def?.type === 'date' ? today : def?.type === 'money' ? 150000 : def?.type === 'number' ? 10 : `[${def?.label ?? key}]`;
    }
    const values = buildValues({
      fields,
      dictionary,
      recipient: sample,
      common,
      system: { 'document.number': 'PS-DEMO-000000', 'document.date': formatDateHy(today), 'signature.checkbox': signatureText() },
    });
    const filled = docx.render(await this.d.storage.get(v.filePath), values);
    const pdf = await this.d.pdf.docxToPdf(filled, 'preview.docx');
    await this.d.storage.put(cacheKey, pdf);
    return pdf;
  }

  private async sampleRecipient(type: 'student' | 'staff' | 'partner') {
    if (type === 'student') {
      const [group] = await this.d.core.listGroups();
      const [first] = await this.recipients.resolve({ recipientType: 'student', groupId: group.id });
      return first;
    }
    const ids = type === 'staff' ? (await this.d.core.listStaff()).map((s) => s.id) : (await this.d.core.listPartners()).map((p) => p.id);
    const [first] = await this.recipients.resolve({ recipientType: type, recipientIds: ids.slice(0, 1) });
    return first;
  }

  // ---------------------------------------------------------------- helpers

  /** Files get a random suffix so a path is never reused, even if a version number repeats after a delete. */
  private async storeFile(templateId: string, versionNumber: number, file: Buffer) {
    const key = `templates/${templateId}/v${versionNumber}-${randomUUID().slice(0, 8)}.docx`;
    await this.d.storage.put(key, file);
    return key;
  }

  private versionData(versionNumber: number, filePath: string, a: Analysis, actorId: string) {
    return {
      versionNumber,
      status: 'draft' as const,
      filePath,
      fields: a.fields,
      clauses: a.clauses as unknown as Prisma.InputJsonValue,
      warnings: a.warnings as unknown as Prisma.InputJsonValue,
      createdById: actorId,
    };
  }

  /** Never expose the storage path. */
  private versionDto(v: TemplateVersion) {
    const { filePath: _filePath, ...rest } = v;
    return rest;
  }
}
