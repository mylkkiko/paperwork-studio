/**
 * Test harness: a real Express app + real services on the TEST database, with controllable edges:
 *   clock   FixedClock (move time for expiry / reminders)
 *   pdf     FakePdfConverter by default; `realPdf: true` uses Gotenberg (Armenian rendering tests)
 *   mailer  MemoryMailer (inspect emails, extract signing tokens)
 *   queue   InlineGenerationQueue (generation runs in-process; `await ctx.queue.idle()`)
 *   core    StubCoreEngineClient over a CLONED dataset, so a test may change "Core Engine" data
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import type { Role, TemplateCategory } from '@prisma/client';
import { config, type Config } from '../../src/config';
import type { Deps } from '../../src/deps';
import { prisma } from '../../src/lib/prisma';
import { FixedClock } from '../../src/lib/clock';
import { StubCoreEngineClient } from '../../src/integrations/core-engine/StubCoreEngineClient';
import * as stubData from '../../src/integrations/core-engine/stub-data';
import { LocalStorageService } from '../../src/integrations/storage/LocalStorageService';
import { GotenbergPdfConverter } from '../../src/integrations/pdf/GotenbergPdfConverter';
import { MemoryMailer } from '../../src/integrations/mail/Mailer';
import { RuleBasedSummaryGenerator } from '../../src/services/summary/RuleBasedSummaryGenerator';
import { InlineGenerationQueue } from '../../src/jobs/queues';
import { createServices } from '../../src/services';
import { createApp } from '../../src/app';
import { hashPassword } from '../../src/services/auth.service';
import { DEMO_USERS, MERGE_FIELDS } from '../../prisma/seed';
import { FakePdfConverter } from './fake-pdf';
import { seedFile } from './docx';

export const GROUP = stubData.DEMO_GROUP_ID;
/** 21 Nov 2026, 10:00 UTC (14:00 in Yerevan) */
export const T0 = new Date('2026-11-21T10:00:00Z');

export type StubDataset = typeof stubData;
export const cloneDataset = (): StubDataset => structuredClone({ ...stubData });

/** Values that make the demo group ready for the student agreement. */
export const READY_VALUES = {
  commonValues: { 'contract.date': '2026-11-21', 'contract.amount': 450000 },
  overrides: { 'stu-007': { 'student.passport': 'AN7654321' }, 'stu-015': { 'student.address': 'ք. Երևան, Աբովյան փ. 52' } },
};

export async function resetDb() {
  const tables = ['AuditLog', 'Reminder', 'Signature', 'SignatureRequest', 'Document', 'GenerationBatch', 'TemplateVersion', 'Template', 'MergeField', 'User', 'DocumentCounter'];
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`);
}

export interface ContextOptions {
  realPdf?: boolean;
  now?: Date;
  config?: Partial<Config>;
  dataset?: StubDataset;
}

export async function createTestContext(opts: ContextOptions = {}) {
  const clock = new FixedClock(opts.now ?? T0);
  const mailer = new MemoryMailer();
  const fakePdf = new FakePdfConverter();
  const queue = new InlineGenerationQueue();
  const dataset = opts.dataset ?? cloneDataset();
  const deps: Deps = {
    config: { ...config, ...opts.config },
    prisma,
    clock,
    core: new StubCoreEngineClient(dataset),
    storage: new LocalStorageService(mkdtempSync(join(tmpdir(), 'ps-test-storage-'))),
    pdf: opts.realPdf ? new GotenbergPdfConverter(config.GOTENBERG_URL) : fakePdf,
    mailer,
    summary: new RuleBasedSummaryGenerator(),
    queue,
  };
  const services = createServices(deps);
  queue.handler = services.processBatch;
  const app = createApp(deps, services);
  const api = request(app);

  const tokens: Partial<Record<Role, string>> = {};
  const users: Partial<Record<Role, { id: string; email: string }>> = {};

  const ctx = {
    deps,
    services,
    app,
    api,
    clock,
    mailer,
    fakePdf,
    queue,
    dataset,
    tokens,
    users,

    /** Users (one per role) + merge-field dictionary. Call after resetDb(). */
    async seedBase() {
      for (const u of DEMO_USERS) {
        const created = await prisma.user.create({ data: { name: u.name, email: u.email, role: u.role, passwordHash: await hashPassword(u.password) } });
        users[u.role] = { id: created.id, email: u.email };
        tokens[u.role] = (await services.auth.login(u.email, u.password)).token;
      }
      await prisma.mergeField.createMany({
        data: MERGE_FIELDS.map(([key, label, source, type, required = true]) => ({ key, label, source, type, required })),
      });
    },

    auth(role: Role) {
      return { authorization: `Bearer ${tokens[role]}` };
    },

    /** Create a template through the service (as the editor) and optionally publish v1. */
    async createTemplate(file: Buffer | string, opts2: { title?: string; category?: TemplateCategory; publish?: boolean } = {}) {
      const buf = typeof file === 'string' ? seedFile(file) : file;
      const { template, version, warnings } = await services.templates.create(users.editor!.id, {
        title: opts2.title ?? 'Ուսուցման պայմանագիր',
        category: opts2.category ?? 'student_agreement',
        file: buf,
      });
      if (opts2.publish !== false) await services.templates.publish(users.editor!.id, template.id, version.id);
      return { templateId: template.id, versionId: version.id, warnings };
    },

    /** Generate a batch through the API and wait until the inline job has finished. */
    async generate(body: Record<string, unknown>) {
      const res = await api.post('/api/batches').set(ctx.auth('coordinator')).send(body);
      if (res.status !== 202) throw new Error(`generate failed: ${res.status} ${JSON.stringify(res.body)}`);
      await queue.idle();
      // Sorted by recipient (stu-001, stu-002, …): numbers are allocated by parallel workers, so their order varies.
      const docs = await prisma.document.findMany({ where: { batchId: res.body.id }, orderBy: { recipientId: 'asc' } });
      return { batchId: res.body.id as string, docs };
    },

    /** Send documents and return the raw signing token from each email, keyed by document id. */
    async send(documentIds: string[]) {
      const before = mailer.sent.length;
      const res = await api.post('/api/documents/send').set(ctx.auth('coordinator')).send({ documentIds });
      if (res.status !== 200) throw new Error(`send failed: ${res.status} ${JSON.stringify(res.body)}`);
      const docs = await prisma.document.findMany({ where: { id: { in: documentIds } } });
      const tokensByDoc: Record<string, string> = {};
      for (const mail of mailer.sent.slice(before)) {
        const doc = docs.find((d) => d.recipientEmail === mail.to);
        const token = tokenFromMail(mail.text);
        if (doc && token) tokensByDoc[doc.id] = token;
      }
      return tokensByDoc;
    },

    /** The only way to sign: the coordinator records the handwritten signature with its scan (S-3). */
    async paperSign(documentId: string, opts: { signedAt?: string; file?: Buffer; name?: string } = {}) {
      let req = api.post(`/api/documents/${documentId}/paper-signature`).set(ctx.auth('coordinator'));
      if (opts.signedAt) req = req.field('signedAt', opts.signedAt);
      const res = await req.attach('file', opts.file ?? Buffer.from('%PDF-1.4\n%%EOF'), opts.name ?? 'scan.pdf');
      if (res.status !== 201) throw new Error(`paper signature failed: ${res.status} ${JSON.stringify(res.body)}`);
      return res.body;
    },
  };
  return ctx;
}

export type TestContext = Awaited<ReturnType<typeof createTestContext>>;

export function tokenFromMail(text: string): string | null {
  return text.match(/\/sign\/([A-Za-z0-9_-]+)/)?.[1] ?? null;
}

/** Fake PDF converter of a context, typed. */
export const fake = (ctx: TestContext) => ctx.fakePdf;
