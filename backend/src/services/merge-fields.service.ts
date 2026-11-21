import type { FieldSource, FieldType, MergeField } from '@prisma/client';
import type { Deps } from '../deps';
import { conflict, notFound } from '../lib/errors';
import type { AuditService } from './audit.service';

export interface MergeFieldInput {
  key: string;
  label: string;
  source: FieldSource;
  type: FieldType;
  format?: string | null;
  required?: boolean;
}

export class MergeFieldsService {
  constructor(private readonly d: Pick<Deps, 'prisma'>, private readonly audit: AuditService) {}

  list() {
    return this.d.prisma.mergeField.findMany({ orderBy: { key: 'asc' } });
  }

  async map(): Promise<Map<string, MergeField>> {
    return new Map((await this.list()).map((f) => [f.key, f]));
  }

  async create(actorId: string, input: MergeFieldInput) {
    if (await this.d.prisma.mergeField.findUnique({ where: { key: input.key } })) {
      throw conflict('FIELD_EXISTS', `Merge field ${input.key} already exists`);
    }
    const field = await this.d.prisma.mergeField.create({ data: { ...input, required: input.required ?? true } });
    await this.audit.log(actorId, 'merge_field.created', 'MergeField', field.id, { key: field.key });
    return field;
  }

  /** The key is immutable: templates reference it. Change the label/type/source/required instead. */
  async update(actorId: string, id: string, input: Partial<Omit<MergeFieldInput, 'key'>>) {
    if (!(await this.d.prisma.mergeField.findUnique({ where: { id } }))) throw notFound('Merge field');
    const field = await this.d.prisma.mergeField.update({ where: { id }, data: input });
    await this.audit.log(actorId, 'merge_field.updated', 'MergeField', id, { changed: Object.keys(input) });
    return field;
  }
}
