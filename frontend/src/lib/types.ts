/** Shapes returned by the backend REST API (see backend/openapi.yaml). */
export type Role = 'admin' | 'editor' | 'coordinator';
export type Category = 'student_agreement' | 'termination_act' | 'enrollment_letter' | 'vacation_order' | 'partner_invoice';
export type VersionStatus = 'draft' | 'published' | 'archived';
export type DocumentStatus = 'created' | 'sent' | 'viewed' | 'signed' | 'declined' | 'expired';
export type RecipientType = 'student' | 'staff' | 'partner';
export type FieldType = 'text' | 'date' | 'money' | 'number';
export type FieldSource = 'core' | 'manual' | 'system';

export const CATEGORIES: Category[] = ['student_agreement', 'termination_act', 'enrollment_letter', 'vacation_order', 'partner_invoice'];
export const DOCUMENT_STATUSES: DocumentStatus[] = ['created', 'sent', 'viewed', 'signed', 'declined', 'expired'];

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  active?: boolean;
  createdAt?: string;
}

export interface UploadWarning {
  code: 'UNKNOWN_FIELD' | 'CLAUSES_NOT_DETECTED' | 'MISSING_SIGNATURE_FIELD';
  field?: string;
  message: string;
}

export interface VersionRef {
  id: string;
  versionNumber: number;
  status: VersionStatus;
  createdAt: string;
  publishedAt: string | null;
}

export interface TemplateListItem {
  id: string;
  title: string;
  category: Category;
  createdAt: string;
  latestVersion: VersionRef | null;
  publishedVersion: VersionRef | null;
  hasDraft: boolean;
  versionCount: number;
}

export interface TemplateDetail {
  id: string;
  title: string;
  category: Category;
  createdAt: string;
  documentCount: number;
  versions: (VersionRef & { warnings: UploadWarning[]; changeSummary: string | null; comparedToId: string | null })[];
}

export interface VersionField {
  key: string;
  known: boolean;
  label?: string;
  source?: FieldSource;
  type?: FieldType;
  required?: boolean;
}

export interface DiffSpan {
  type: 'equal' | 'added' | 'removed';
  value: string;
}

export interface ClauseChange {
  status: 'added' | 'removed' | 'changed' | 'unchanged';
  moved: boolean;
  kind: 'preamble' | 'numbered' | 'heading';
  oldNumber: string | null;
  newNumber: string | null;
  title: string;
  oldText: string | null;
  newText: string | null;
  similarity: number;
  diff?: DiffSpan[];
}

export interface Comparison {
  fromVersionId?: string;
  toVersionId?: string;
  changes: ClauseChange[];
  counts: { added: number; removed: number; changed: number; unchanged: number; moved: number };
  summary?: string[];
}

export interface VersionDetail extends VersionRef {
  templateId: string;
  fields: VersionField[];
  warnings: UploadWarning[];
  comparison: Comparison | null;
  comparedToId: string | null;
  changeSummary: string | null;
  generatedSummary: string[] | null;
}

export interface MergeField {
  id: string;
  key: string;
  label: string;
  source: FieldSource;
  type: FieldType;
  format: string | null;
  required: boolean;
}

export interface Group {
  id: string;
  name: string;
  courseName: string;
  startDate: string;
  endDate: string;
  schedule: string;
  studentCount: number;
}

export interface Student {
  id: string;
  fullName: string;
  email: string | null;
  hasPassport: boolean;
}
export interface Staff {
  id: string;
  fullName: string;
  position: string;
  email: string | null;
}
export interface Partner {
  id: string;
  name: string;
  taxId: string;
  email: string | null;
}

export interface MissingField {
  key: string;
  label: string;
  source: string;
  type: FieldType;
}

export interface Precheck {
  templateVersionId: string;
  total: number;
  ready: boolean;
  commonFields: { key: string; label: string; type: FieldType; required: boolean; value: unknown }[];
  missingCommon: MissingField[];
  invalidValues: { recipientId: string | null; key: string; value: unknown }[];
  recipients: { id: string; name: string; email: string | null; excluded: boolean; missing: MissingField[] }[];
}

export interface Batch {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  progress: number;
  total: number;
  error: string | null;
  recipientType: RecipientType;
  groupId: string | null;
  groupName: string | null;
  templateVersionId: string;
  template?: { id: string; title: string; category: Category; versionNumber: number };
  hasZip: boolean;
  hasMergedPdf: boolean;
  createdByName?: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface DocumentRow {
  id: string;
  number: string;
  batchId: string;
  recipientType: RecipientType;
  recipientId: string;
  recipientName: string;
  recipientEmail: string | null;
  groupId: string | null;
  status: DocumentStatus;
  sentAt: string | null;
  viewedAt: string | null;
  createdAt: string;
  template: { id: string; title: string; category: Category };
  templateVersionId: string;
  versionNumber: number;
  isCurrentVersion: boolean;
  signedAt: string | null;
  /** The app records only `paper`; `online` is reserved for a future qualified digital signature. */
  signatureMethod: 'online' | 'paper' | null;
  hasScan: boolean;
  reminderCount: number;
}

export interface SignView {
  documentNumber: string;
  title: string;
  versionNumber: number;
  recipientName: string;
  status: DocumentStatus;
  expiresAt: string;
  signedAt: string | null;
  /** The app records only `paper`; `online` is reserved for a future qualified digital signature. */
  signatureMethod: 'online' | 'paper' | null;
  declinedAt: string | null;
}

export interface SendResult {
  sent: number;
  results: { id: string; ok: boolean; code?: string }[];
}
