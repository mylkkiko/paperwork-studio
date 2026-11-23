import type { ClauseChange, DocumentRow, Precheck, SignView } from '@/lib/types';

export const doc = (over: Partial<DocumentRow> = {}): DocumentRow => ({
  id: 'd1',
  number: 'PS-2026-000001',
  batchId: 'b1',
  recipientType: 'student',
  recipientId: 'stu-001',
  recipientName: 'Աննա Հակոբյան',
  recipientEmail: 'anna.hakobyan@student.academy.am',
  groupId: 'grp-web-2026-a',
  status: 'sent',
  sentAt: '2026-11-21T10:00:00Z',
  viewedAt: null,
  createdAt: '2026-11-21T09:00:00Z',
  template: { id: 't1', title: 'Ուսուցման պայմանագիր', category: 'student_agreement' },
  templateVersionId: 'v1',
  versionNumber: 1,
  isCurrentVersion: true,
  signedAt: null,
  signatureMethod: null,
  hasScan: false,
  reminderCount: 0,
  ...over,
});

export const precheck = (over: Partial<Precheck> = {}): Precheck => ({
  templateVersionId: 'v1',
  total: 3,
  ready: false,
  commonFields: [
    { key: 'contract.date', label: 'Պայմանագրի ամսաթիվ', type: 'date', required: true, value: null },
    { key: 'contract.amount', label: 'Ուսման վարձ', type: 'money', required: true, value: null },
  ],
  missingCommon: [],
  invalidValues: [],
  recipients: [
    { id: 'stu-001', name: 'Աննա Հակոբյան', email: 'anna@x.am', excluded: false, missing: [] },
    { id: 'stu-007', name: 'Նարե Հովհաննիսյան', email: 'nare@x.am', excluded: false, missing: [{ key: 'student.passport', label: 'Անձնագրի համար', source: 'core', type: 'text' }] },
    { id: 'stu-015', name: 'Մանե Ղազարյան', email: 'mane@x.am', excluded: false, missing: [{ key: 'student.address', label: 'Ուսանողի հասցե', source: 'core', type: 'text' }] },
  ],
  ...over,
});

export const change = (over: Partial<ClauseChange> = {}): ClauseChange => ({
  status: 'unchanged',
  moved: false,
  kind: 'numbered',
  oldNumber: '1.1',
  newNumber: '1.1',
  title: 'title',
  oldText: 'text',
  newText: 'text',
  similarity: 1,
  ...over,
});

export const signView = (over: Partial<SignView> = {}): SignView => ({
  documentNumber: 'PS-2026-000001',
  title: 'Ուսուցման պայմանագիր',
  versionNumber: 2,
  recipientName: 'Աննա Հակոբյան',
  status: 'sent',
  expiresAt: '2026-12-05T10:00:00Z',
  signedAt: null,
  signatureMethod: null,
  declinedAt: null,
  ...over,
});
