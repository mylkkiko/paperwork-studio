/**
 * Turns Core Engine records into recipients with merge-field values, and builds the final value map
 * for one document.
 *
 * Value resolution for each field of the template, highest priority first:
 *   1. system   — document.number, document.date, signature.checkbox (the app decides)
 *   2. override — typed in by the coordinator in the precheck step for this recipient
 *   3. preset   — already-formatted values carried over from an older signed document (S-6)
 *   4. core     — from Core Engine (student/staff/partner/group/academy)
 *   5. common   — shared pack values (contract date, amount, ...) entered once per batch (G-4)
 * Raw values are formatted by the dictionary type (date / money / number) at the end.
 */
import type { MergeField, RecipientType } from '@prisma/client';
import type { Deps } from '../deps';
import { badRequest, notFound } from '../lib/errors';
import { t, DEFAULT_LOCALE } from '../i18n';
import { formatValue, type FieldType } from './formatters';
import type { Academy, Group } from '../integrations/core-engine/CoreEngineClient';

export interface Recipient {
  id: string;
  type: RecipientType;
  name: string;
  email: string | null;
  groupId: string | null;
  /** Raw values from Core Engine, keyed by merge-field key */
  core: Record<string, unknown>;
}

export interface RecipientSelection {
  recipientType: RecipientType;
  groupId?: string | null;
  recipientIds?: string[];
}

export const SYSTEM_KEYS = ['document.number', 'document.date', 'signature.checkbox'] as const;

const academyValues = (a: Academy) => ({ 'academy.name': a.name, 'academy.director': a.director, 'academy.address': a.address });
const groupValues = (g: Group | null | undefined) =>
  g
    ? { 'group.name': g.name, 'group.course_name': g.courseName, 'group.start_date': g.startDate, 'group.end_date': g.endDate, 'group.schedule': g.schedule }
    : {};

export class RecipientsService {
  constructor(private readonly d: Pick<Deps, 'core'>) {}

  /** Load recipients from Core Engine: a whole group, or individual ids. Order is stable (Core Engine order). */
  async resolve(sel: RecipientSelection): Promise<Recipient[]> {
    const academy = academyValues(await this.d.core.getAcademy());

    if (sel.recipientType === 'student') {
      let students;
      if (sel.groupId) {
        if (!(await this.d.core.getGroup(sel.groupId))) throw notFound('Group');
        students = await this.d.core.listGroupStudents(sel.groupId);
        if (sel.recipientIds?.length) students = students.filter((s) => sel.recipientIds!.includes(s.id));
      } else if (sel.recipientIds?.length) {
        students = await this.d.core.getStudents(sel.recipientIds);
      } else {
        throw badRequest('Select a group or at least one student');
      }
      const groups = new Map((await this.d.core.listGroups()).map((g) => [g.id, g]));
      return students.map((s) => ({
        id: s.id,
        type: 'student' as const,
        name: s.fullName,
        email: s.email ?? null,
        groupId: s.groupId,
        core: {
          ...academy,
          ...groupValues(groups.get(s.groupId)),
          'student.full_name': s.fullName,
          'student.passport': s.passport,
          'student.address': s.address,
          'student.phone': s.phone,
          'student.email': s.email,
          'student.birth_date': s.birthDate,
        },
      }));
    }

    if (!sel.recipientIds?.length) throw badRequest(`Select at least one ${sel.recipientType}`);

    if (sel.recipientType === 'staff') {
      const staff = await this.d.core.getStaff(sel.recipientIds);
      return staff.map((s) => ({
        id: s.id,
        type: 'staff' as const,
        name: s.fullName,
        email: s.email ?? null,
        groupId: null,
        core: { ...academy, 'staff.full_name': s.fullName, 'staff.position': s.position, 'staff.email': s.email, 'staff.phone': s.phone },
      }));
    }

    const partners = await this.d.core.getPartners(sel.recipientIds);
    return partners.map((p) => ({
      id: p.id,
      type: 'partner' as const,
      name: p.name,
      email: p.email ?? null,
      groupId: null,
      core: {
        ...academy,
        'partner.name': p.name,
        'partner.tax_id': p.taxId,
        'partner.address': p.address,
        'partner.email': p.email,
        'partner.contact_person': p.contactPerson,
      },
    }));
  }
}

const isEmpty = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

export interface BuildInput {
  fields: string[];
  dictionary: Map<string, MergeField>;
  recipient: Recipient;
  common: Record<string, unknown>;
  override?: Record<string, unknown>;
  preset?: Record<string, string>;
  system?: Partial<Record<(typeof SYSTEM_KEYS)[number], string>>;
}

export interface MissingField {
  key: string;
  label: string;
  source: string;
  type: string;
}

/**
 * Which required fields have no value for this recipient. System fields are never "missing".
 * `common` manual fields are reported here too; the precheck splits them into "shared" vs "per recipient".
 */
export function findMissing(input: Omit<BuildInput, 'system'>): MissingField[] {
  const missing: MissingField[] = [];
  for (const key of input.fields) {
    const def = input.dictionary.get(key);
    if (!def || def.source === 'system' || !def.required) continue;
    const value = input.override?.[key] ?? input.preset?.[key] ?? input.recipient.core[key] ?? input.common[key];
    if (isEmpty(value)) missing.push({ key, label: def.label, source: def.source, type: def.type });
  }
  return missing;
}

/** Build the formatted, flat value map used to fill the template (and saved as the document's data snapshot). */
export function buildValues(input: BuildInput): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of input.fields) {
    const sys = input.system?.[key as (typeof SYSTEM_KEYS)[number]];
    if (sys !== undefined) {
      out[key] = sys;
      continue;
    }
    if (input.override && !isEmpty(input.override[key])) {
      out[key] = format(input.dictionary.get(key), input.override[key]);
    } else if (input.preset && !isEmpty(input.preset[key])) {
      out[key] = input.preset[key];
    } else if (!isEmpty(input.recipient.core[key])) {
      out[key] = format(input.dictionary.get(key), input.recipient.core[key]);
    } else {
      out[key] = format(input.dictionary.get(key), input.common[key]);
    }
  }
  return out;
}

function format(def: MergeField | undefined, value: unknown): string {
  try {
    return formatValue((def?.type ?? 'text') as FieldType, value);
  } catch {
    throw badRequest(`Invalid value for ${def?.key ?? 'field'}: ${String(value)}`);
  }
}

/** Text that replaces {{signature.checkbox}}. */
export function signatureText(locale = DEFAULT_LOCALE) {
  return t(locale, 'signature.unsigned');
}

/** Template category -> who the documents are for. Used for preview data. */
export const CATEGORY_RECIPIENT: Record<string, RecipientType> = {
  student_agreement: 'student',
  termination_act: 'student',
  enrollment_letter: 'student',
  vacation_order: 'staff',
  partner_invoice: 'partner',
};
