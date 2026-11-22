/**
 * Generate-pack wizard: state, step validation and API payload. Kept free of React so it can be unit-tested.
 *
 *   1 template → 2 recipients → 3 precheck (fill / exclude) → 4 shared fields → 5 progress → 6 downloads + send
 */
import { z } from 'zod';
import type { Category, FieldType, Precheck, RecipientType } from './types';

export const STEPS = ['template', 'recipients', 'precheck', 'shared', 'progress', 'done'] as const;
export type Step = (typeof STEPS)[number];

export interface WizardState {
  templateId: string | null;
  templateVersionId: string | null;
  recipientType: RecipientType;
  groupId: string | null;
  /** Students: the selected subset of the group. Staff/partners: the chosen people. */
  recipientIds: string[];
  /** Values typed in the precheck step for one recipient: { "stu-007": { "student.passport": "AN..." } } */
  overrides: Record<string, Record<string, string>>;
  excludedIds: string[];
  /** Shared values for the whole pack (step 4) */
  commonValues: Record<string, string>;
  batchId: string | null;
}

export const initialState: WizardState = {
  templateId: null,
  templateVersionId: null,
  recipientType: 'student',
  groupId: null,
  recipientIds: [],
  overrides: {},
  excludedIds: [],
  commonValues: {},
  batchId: null,
};

/** Who a template category is usually generated for. */
export const CATEGORY_RECIPIENT: Record<Category, RecipientType> = {
  student_agreement: 'student',
  termination_act: 'student',
  enrollment_letter: 'student',
  vacation_order: 'staff',
  partner_invoice: 'partner',
};

/** Typed values: money/number as numbers, empty strings dropped (so the API sees "missing", not ""). */
function clean(values: Record<string, string>, types: Record<string, FieldType | undefined>) {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(values)) {
    const trimmed = (v ?? '').trim();
    if (!trimmed) continue;
    const type = types[k];
    out[k] = (type === 'money' || type === 'number') && isNumeric(trimmed) ? Number(trimmed.replace(/[\s ]/g, '')) : trimmed;
  }
  return out;
}

export const isNumeric = (v: string) => /^-?\d[\d\s ]*([.,]\d+)?$/.test(v.trim());

/** Request body for /batches/precheck and /batches. */
export function buildPayload(s: WizardState, fieldTypes: Record<string, FieldType | undefined> = {}) {
  const overrides: Record<string, Record<string, string | number>> = {};
  for (const [rid, values] of Object.entries(s.overrides)) {
    const c = clean(values, fieldTypes);
    if (Object.keys(c).length) overrides[rid] = c;
  }
  return {
    templateVersionId: s.templateVersionId!,
    recipientType: s.recipientType,
    groupId: s.recipientType === 'student' ? s.groupId : null,
    recipientIds: s.recipientIds,
    overrides,
    excludedIds: s.excludedIds,
    commonValues: clean(s.commonValues, fieldTypes),
  };
}

/** Field types known from the precheck (for number conversion). */
export function fieldTypesOf(p?: Precheck): Record<string, FieldType> {
  const types: Record<string, FieldType> = {};
  for (const f of p?.commonFields ?? []) types[f.key] = f.type;
  for (const r of p?.recipients ?? []) for (const m of r.missing) types[m.key] = m.type;
  return types;
}

export interface PrecheckSummary {
  included: number;
  excluded: number;
  needData: number;
  ready: number;
}

export function summarizePrecheck(p: Precheck): PrecheckSummary {
  const included = p.recipients.filter((r) => !r.excluded);
  const needData = included.filter((r) => r.missing.length > 0).length;
  return { included: included.length, excluded: p.recipients.length - included.length, needData, ready: included.length - needData };
}

/**
 * Can the user leave a step? Returns null if yes, or an i18n key (namespace "generate.errors") explaining why not.
 * Shared fields (step 4) are validated by their form schema instead.
 */
export function stepError(step: Step, s: WizardState, precheck?: Precheck): string | null {
  switch (step) {
    case 'template':
      return s.templateVersionId ? null : 'chooseTemplate';
    case 'recipients':
      if (s.recipientType === 'student' && !s.groupId) return 'chooseGroup';
      return s.recipientIds.length > 0 ? null : 'chooseRecipients';
    case 'precheck': {
      if (!precheck) return 'precheckPending';
      const sum = summarizePrecheck(precheck);
      if (sum.included === 0) return 'allExcluded';
      if (sum.needData > 0) return 'missingData';
      return null;
    }
    default:
      return null;
  }
}

/**
 * react-hook-form treats dots in names as nesting ("contract.amount" -> { contract: { amount } }),
 * so form fields use an encoded name.
 */
export const formName = (key: string) => key.replace(/\./g, '__');
export const fieldKey = (name: string) => name.replace(/__/g, '.');

/** Validation schema for the shared-fields form (keys encoded with formName), built from the template's fields. */
export function sharedFieldsSchema(fields: { key: string; type: FieldType; required: boolean }[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of fields) {
    let s: z.ZodTypeAny;
    if (f.type === 'date') s = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date');
    else if (f.type === 'money' || f.type === 'number') s = z.string().refine(isNumeric, 'number');
    else s = z.string().trim().min(1, 'required');
    shape[formName(f.key)] = f.required ? z.string().trim().min(1, 'required').pipe(s) : z.union([z.literal(''), s]);
  }
  return z.object(shape);
}

/** Input type for a merge-field type. */
export const inputType = (type: FieldType) => (type === 'date' ? 'date' : type === 'money' || type === 'number' ? 'text' : 'text');
export const inputMode = (type: FieldType) => (type === 'money' || type === 'number' ? 'numeric' : undefined);
