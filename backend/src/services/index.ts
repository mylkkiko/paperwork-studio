import type { Deps } from '../deps';
import { AuditService } from './audit.service';
import { AuthService } from './auth.service';
import { UsersService } from './users.service';
import { MergeFieldsService } from './merge-fields.service';
import { RecipientsService } from './recipients.service';
import { TemplatesService } from './templates.service';
import { BatchesService } from './batches.service';
import { SignLinksService } from './sign-links.service';
import { SigningService } from './signing.service';
import { DocumentsService } from './documents.service';
import { RemindersService } from './reminders.service';
import { SignaturesTableService } from './signatures-table.service';

/** Builds every service from the dependencies. One place to see how the pieces connect. */
export function createServices(d: Deps) {
  const audit = new AuditService(d);
  const auth = new AuthService(d);
  const users = new UsersService(d, audit);
  const mergeFields = new MergeFieldsService(d, audit);
  const recipients = new RecipientsService(d);
  const templates = new TemplatesService(d, audit, mergeFields, recipients);
  const batches = new BatchesService(d, audit, mergeFields, recipients);
  const links = new SignLinksService(d);
  const signing = new SigningService(d, audit, links);
  const documents = new DocumentsService(d, audit, links, batches, mergeFields);
  const reminders = new RemindersService(d, audit, links);
  const signatures = new SignaturesTableService(d, documents);

  /** What the generation job runs: generate, then (S-6) email the new documents if requested. */
  const processBatch = (batchId: string) =>
    batches.process(batchId, async (batch) => {
      if (batch.sendOnComplete === 'newVersion') await documents.sendNewVersionBatch(batch.id, batch.createdById);
    });

  return { audit, auth, users, mergeFields, recipients, templates, batches, links, signing, documents, reminders, signatures, processBatch };
}

export type Services = ReturnType<typeof createServices>;
