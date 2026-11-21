import { z } from 'zod';

export const roleSchema = z.enum(['admin', 'editor', 'coordinator']);
export const categorySchema = z.enum(['student_agreement', 'termination_act', 'enrollment_letter', 'vacation_order', 'partner_invoice']);
export const versionStatusSchema = z.enum(['draft', 'published', 'archived']);
export const recipientTypeSchema = z.enum(['student', 'staff', 'partner']);
export const documentStatusSchema = z.enum(['created', 'sent', 'viewed', 'signed', 'declined', 'expired']);
export const fieldKeySchema = z.string().regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/, 'Use dotted lowercase keys like student.full_name');

/** Raw value typed by a coordinator: text, number, or ISO date string. */
const rawValue = z.union([z.string(), z.number(), z.null()]);

export const batchInputSchema = z
  .object({
    templateVersionId: z.string().uuid().optional(),
    templateId: z.string().uuid().optional(),
    recipientType: recipientTypeSchema,
    groupId: z.string().min(1).nullish(),
    recipientIds: z.array(z.string().min(1)).max(500).optional(),
    commonValues: z.record(rawValue).optional(),
    overrides: z.record(z.record(rawValue)).optional(),
    excludedIds: z.array(z.string()).optional(),
  })
  .refine((b) => b.templateVersionId || b.templateId, { message: 'templateVersionId or templateId is required' });

export const optionalBool = z
  .enum(['true', 'false', '1', '0'])
  .optional()
  .transform((v) => v === 'true' || v === '1');
