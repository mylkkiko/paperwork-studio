/**
 * Direct API + Mailpit + database helpers for E2E SETUP steps (the behaviour under test always goes through the UI).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Setup calls go through the site's own /api proxy too (same path as the browser). */
export const API_URL = process.env.API_URL ?? `${process.env.BASE_URL ?? 'http://localhost:3100'}/api`;
export const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8025';
export const GROUP = 'grp-web-2026-a';
const SEED = join(__dirname, '..', '..', 'backend', 'seed', 'templates');
export const seedFile = (name: string) => join(SEED, name);

const PASSWORDS = { admin: 'Admin123!', editor: 'Editor123!', coordinator: 'Coord123!' } as const;
export type Role = keyof typeof PASSWORDS;

export class Api {
  private constructor(private token: string) {}

  static async as(role: Role) {
    const res = await fetch(`${API_URL}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `${role}@academy.am`, password: PASSWORDS[role] }) });
    if (!res.ok) throw new Error(`login ${role} failed: ${res.status}`);
    return new Api((await res.json()).token);
  }

  async call<T = any>(path: string, init: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
    const headers: Record<string, string> = { authorization: `Bearer ${this.token}` };
    let body: BodyInit | undefined;
    if (init.form) body = init.form;
    else if (init.body !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(init.body);
    }
    const res = await fetch(`${API_URL}${path}`, { method: init.method ?? (body ? 'POST' : 'GET'), headers, body });
    const text = await res.text();
    if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} -> ${res.status} ${text}`);
    return text ? JSON.parse(text) : (undefined as T);
  }

  private form(file: string, fields: Record<string, string> = {}) {
    const fd = new FormData();
    fd.append('file', new Blob([readFileSync(seedFile(file))]), file);
    for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    return fd;
  }

  /** New template from a seed file, v1 published. */
  async createPublishedTemplate(title: string, file = 'student_agreement_v1.docx') {
    const { template, version } = await this.call('/templates', { form: this.form(file, { title, category: 'student_agreement' }) });
    await this.call(`/templates/${template.id}/versions/${version.id}/publish`, { method: 'POST' });
    return { templateId: template.id as string, v1: version.id as string };
  }

  async uploadAndPublishVersion(templateId: string, file = 'student_agreement_v2.docx') {
    const { version } = await this.call(`/templates/${templateId}/versions`, { form: this.form(file) });
    await this.call(`/templates/${templateId}/versions/${version.id}/publish`, { method: 'POST' });
    return version.id as string;
  }

  /** Generate for some students and wait for the job. Returns documents keyed by recipient id. */
  async generate(templateId: string, recipientIds: string[]) {
    const batch = await this.call('/batches', {
      body: { templateId, recipientType: 'student', groupId: GROUP, recipientIds, commonValues: { 'contract.date': '2026-11-21', 'contract.amount': 450000 } },
    });
    for (let i = 0; i < 120; i++) {
      const b = await this.call(`/batches/${batch.id}`);
      if (b.status === 'completed') break;
      if (b.status === 'failed') throw new Error(`batch failed: ${b.error}`);
      await new Promise((r) => setTimeout(r, 500));
    }
    return this.documents({ batchId: batch.id });
  }

  async documents(query: Record<string, string>) {
    const { items } = await this.call(`/documents?${new URLSearchParams(query)}`);
    return Object.fromEntries(items.map((d: any) => [d.recipientId, d])) as Record<string, { id: string; number: string; recipientEmail: string; status: string; versionNumber: number }>;
  }

  send(documentIds: string[]) {
    return this.call('/documents/send', { body: { documentIds } });
  }

  /** The only way to sign: record the handwritten signature with its scan (setup only). */
  paperSign(documentId: string) {
    const fd = new FormData();
    fd.append('file', new Blob([SCAN_PDF], { type: 'application/pdf' }), 'scan.pdf');
    return this.call(`/documents/${documentId}/paper-signature`, { form: fd });
  }
}

/** A tiny but valid one-page PDF, used as the "scan" of a signed paper document. */
export const SCAN_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
);

interface MailSummary {
  ID: string;
  Subject: string;
  To: { Address: string }[];
}

/** Wait for an email to `to` whose subject contains every fragment; returns subject and text. */
export async function waitForMail(to: string, ...subjectIncludes: string[]): Promise<{ subject: string; text: string }> {
  for (let i = 0; i < 40; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}&limit=50`);
    const { messages } = (await res.json()) as { messages: MailSummary[] };
    const msg = messages.find((m) => subjectIncludes.every((s) => m.Subject.includes(s)));
    if (msg) {
      const full = await (await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`)).json();
      return { subject: msg.Subject, text: full.Text as string };
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No email to ${to} with subject containing ${subjectIncludes.join(' + ')}`);
}

/** Signing link from an email, rewritten to the frontend under test. */
export function linkFrom(text: string) {
  const m = text.match(/https?:\/\/[^\s/]+(\/sign\/[A-Za-z0-9_-]+)/);
  if (!m) throw new Error('no signing link in email');
  return m[1];
}

export const tokenOf = (path: string) => path.split('/').pop()!;

/**
 * The deadline is 14 days; E2E can't wait that long, so the test moves the link expiry into the past in the database
 * (the same thing that happens when the time passes). Requires the docker-compose Postgres.
 */
export function expireLinks(documentId: string) {
  const sql = `UPDATE "SignatureRequest" SET "expiresAt" = now() - interval '1 minute' WHERE "documentId" = '${documentId.replace(/[^0-9a-f-]/gi, '')}'`;
  execFileSync('docker', ['compose', 'exec', '-T', 'postgres', 'psql', '-U', 'paperwork', '-d', 'paperwork', '-c', sql], { cwd: join(__dirname, '..', '..') });
}

export const unique = (label: string) => `${label} ${new Date().toISOString().slice(11, 19)}-${Math.random().toString(36).slice(2, 6)}`;
