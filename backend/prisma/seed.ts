/**
 * Demo data. Idempotent: does nothing if users already exist (safe to run on every container start).
 *
 *   npm run db:seed
 *
 * Creates: 3 demo users (one per role), the merge-field dictionary, and the seed templates:
 *   - Ուսուցման պայմանագիր   v1 published, v2 draft (comparison demo: 3.2 removed, 4.2 changed, 6.2 added)
 *   - Պայմանագրի լուծման ակտ v1 published
 *   - Ընդունելության ծանուցում v1 published
 * Core Engine data (24 students, 5 staff, 3 partners) lives in the stub, not in the database.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FieldSource, FieldType, Role, TemplateCategory } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { createDeps } from '../src/container';
import { createServices } from '../src/services';
import { hashPassword } from '../src/services/auth.service';

export const DEMO_USERS: { name: string; email: string; password: string; role: Role }[] = [
  { name: 'Ադմին Ադմինյան', email: 'admin@academy.am', password: 'Admin123!', role: 'admin' },
  { name: 'Էդիտա Խմբագրյան', email: 'editor@academy.am', password: 'Editor123!', role: 'editor' },
  { name: 'Կարինե Համակարգողյան', email: 'coordinator@academy.am', password: 'Coord123!', role: 'coordinator' },
];

type F = [key: string, label: string, source: FieldSource, type: FieldType, required?: boolean];
export const MERGE_FIELDS: F[] = [
  ['student.full_name', 'Ուսանողի անուն ազգանուն', 'core', 'text'],
  ['student.passport', 'Անձնագրի համար', 'core', 'text'],
  ['student.address', 'Ուսանողի հասցե', 'core', 'text'],
  ['student.phone', 'Ուսանողի հեռախոս', 'core', 'text', false],
  ['student.email', 'Ուսանողի էլ. փոստ', 'core', 'text'],
  ['student.birth_date', 'Ծննդյան ամսաթիվ', 'core', 'date', false],
  ['group.name', 'Խումբ', 'core', 'text'],
  ['group.course_name', 'Դասընթաց', 'core', 'text'],
  ['group.start_date', 'Դասընթացի սկիզբ', 'core', 'date'],
  ['group.end_date', 'Դասընթացի ավարտ', 'core', 'date'],
  ['group.schedule', 'Դասացուցակ', 'core', 'text'],
  ['staff.full_name', 'Աշխատակցի անուն ազգանուն', 'core', 'text'],
  ['staff.position', 'Պաշտոն', 'core', 'text'],
  ['staff.email', 'Աշխատակցի էլ. փոստ', 'core', 'text', false],
  ['staff.phone', 'Աշխատակցի հեռախոս', 'core', 'text', false],
  ['partner.name', 'Գործընկեր', 'core', 'text'],
  ['partner.tax_id', 'ՀՎՀՀ', 'core', 'text'],
  ['partner.address', 'Գործընկերոջ հասցե', 'core', 'text'],
  ['partner.email', 'Գործընկերոջ էլ. փոստ', 'core', 'text', false],
  ['partner.contact_person', 'Կոնտակտային անձ', 'core', 'text', false],
  ['academy.name', 'Ակադեմիայի անվանում', 'core', 'text'],
  ['academy.director', 'Տնօրեն', 'core', 'text'],
  ['academy.address', 'Ակադեմիայի հասցե', 'core', 'text'],
  ['document.number', 'Փաստաթղթի համար', 'system', 'text'],
  ['document.date', 'Փաստաթղթի ամսաթիվ', 'system', 'date'],
  ['signature.checkbox', 'Ստորագրության վանդակ', 'system', 'text'],
  ['contract.date', 'Պայմանագրի ամսաթիվ', 'manual', 'date'],
  ['contract.amount', 'Ուսման վարձ', 'manual', 'money'],
  ['termination.contract_date', 'Լուծվող պայմանագրի ամսաթիվ', 'manual', 'date'],
  ['termination.date', 'Լուծման ամսաթիվ', 'manual', 'date'],
  ['termination.reason', 'Լուծման հիմք', 'manual', 'text'],
  ['termination.refund_amount', 'Վերադարձվող գումար', 'manual', 'money'],
  ['vacation.start_date', 'Արձակուրդի սկիզբ', 'manual', 'date'],
  ['vacation.end_date', 'Արձակուրդի ավարտ', 'manual', 'date'],
  ['vacation.days', 'Արձակուրդի օրեր', 'manual', 'number'],
  ['invoice.amount', 'Հաշվի գումար', 'manual', 'money'],
  ['invoice.due_date', 'Վճարման վերջնաժամկետ', 'manual', 'date'],
  ['invoice.description', 'Ծառայության նկարագրություն', 'manual', 'text'],
];

// Relative to the backend root (cwd) so it works both with tsx and compiled (dist/prisma/seed.js).
const TEMPLATE_DIR = process.env.SEED_TEMPLATE_DIR ?? join(process.cwd(), 'seed', 'templates');
const file = (name: string) => readFileSync(join(TEMPLATE_DIR, name));

export async function seed() {
  if ((await prisma.user.count()) > 0) {
    console.log('Seed: users already exist, skipping.');
    return false;
  }
  console.log('Seed: users…');
  for (const u of DEMO_USERS) {
    await prisma.user.create({ data: { name: u.name, email: u.email, role: u.role, passwordHash: await hashPassword(u.password) } });
  }

  console.log('Seed: merge fields…');
  for (const [key, label, source, type, required = true] of MERGE_FIELDS) {
    await prisma.mergeField.upsert({ where: { key }, update: {}, create: { key, label, source, type, required } });
  }

  console.log('Seed: templates…');
  const editor = await prisma.user.findUniqueOrThrow({ where: { email: 'editor@academy.am' } });
  // The seed never generates documents, so queue/pdf/mail are not used here.
  const services = createServices(createDeps({ enqueue: async () => undefined }));

  const createPublished = async (title: string, category: TemplateCategory, name: string) => {
    const { template, version } = await services.templates.create(editor.id, { title, category, file: file(name) });
    await services.templates.publish(editor.id, template.id, version.id);
    return template;
  };

  const agreement = await createPublished('Ուսուցման պայմանագիր', 'student_agreement', 'student_agreement_v1.docx');
  await services.templates.addVersion(editor.id, agreement.id, file('student_agreement_v2.docx'));
  await createPublished('Պայմանագրի լուծման ակտ', 'termination_act', 'termination_act_v1.docx');
  await createPublished('Ընդունելության ծանուցում', 'enrollment_letter', 'enrollment_letter_v1.docx');
  console.log('Seed: done.');
  return true;
}

if (require.main === module) {
  seed()
    .catch((err) => {
      console.error(err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
