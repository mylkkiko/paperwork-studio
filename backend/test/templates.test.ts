import { createHash } from 'node:crypto';
import { prisma } from '../src/lib/prisma';
import { extractFields, isolateSymbols, render, usesAutoNumbering } from '../src/services/docx.service';
import { autoNumberedDocx } from '../scripts/make-autonumbered-docx';
import { buildDocx, docxText, documentXml, patchXml, RENUMBER_V1, RENUMBER_V2, seedFile, splitRunDocx } from './helpers/docx';
import { createTestContext, GROUP, READY_VALUES, resetDb, type TestContext } from './helpers/context';

let ctx: TestContext;
beforeAll(async () => {
  await resetDb();
  ctx = await createTestContext();
  await ctx.seedBase();
});

const upload = (file: Buffer, fields: Record<string, string> = {}, name = 'template.docx') => {
  let req = ctx.api.post('/api/templates').set(ctx.auth('editor'));
  for (const [k, v] of Object.entries({ title: 'Թեստ', category: 'student_agreement', ...fields })) req = req.field(k, v);
  return req.attach('file', file, name);
};
const uploadVersion = (templateId: string, file: Buffer) =>
  ctx.api.post(`/api/templates/${templateId}/versions`).set(ctx.auth('editor')).attach('file', file, 'v.docx');
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

describe('field extraction (T-1, T-3)', () => {
  it('finds every field of the seed agreement in document order', () => {
    expect(extractFields(seedFile('student_agreement_v1.docx'))).toEqual([
      'document.number', 'contract.date', 'academy.name', 'academy.director', 'student.full_name', 'student.passport',
      'student.address', 'student.phone', 'group.course_name', 'group.name', 'group.start_date', 'group.end_date',
      'contract.amount', 'signature.checkbox',
    ]);
  });

  it('handles a field split across three Word runs with different formatting', async () => {
    const file = await splitRunDocx();
    // the fixture really is split in the XML...
    const xml = documentXml(file);
    expect(xml).toContain('{{stu</w:t>');
    expect(xml).not.toContain('{{student.full_name}}');
    // ...but is found and filled as one field
    expect(extractFields(file)).toEqual(['student.full_name', 'group.name', 'signature.checkbox']);
    const text = await docxText(render(file, { 'student.full_name': 'Աննա Հակոբյան', 'group.name': 'ՎԾ-2026-Ա', 'signature.checkbox': '☐' }));
    expect(text).toContain('Ուսանող՝ Աննա Հակոբյան, խումբ՝ ՎԾ-2026-Ա');
    expect(text).not.toContain('{{');
  });

  it('upload of a split-run template reports no unknown fields', async () => {
    const res = await upload(await splitRunDocx());
    expect(res.status).toBe(201);
    expect(res.body.warnings).toEqual([]);
    expect(res.body.version.fields).toEqual(['student.full_name', 'group.name', 'signature.checkbox']);
  });

  it('reports unknown fields as warnings, blocks publishing, and allows it once the field is in the dictionary', async () => {
    const file = patchXml(seedFile('termination_act_v1.docx'), (x) => x.replace('3. Լուծման հիմքը՝', '3. Կոշիկի չափս՝ {{student.shoe_size}}, հիմքը՝'));
    const res = await upload(file, { category: 'termination_act' });
    expect(res.status).toBe(201);
    expect(res.body.version.status).toBe('draft');
    expect(res.body.warnings).toEqual([{ code: 'UNKNOWN_FIELD', field: 'student.shoe_size', message: 'Անհայտ դաշտ՝ student.shoe_size' }]);

    const { id: tid } = res.body.template;
    const { id: vid } = res.body.version;
    const fields = (await ctx.api.get(`/api/templates/${tid}/versions/${vid}`).set(ctx.auth('editor'))).body.fields;
    expect(fields.find((f: { key: string }) => f.key === 'student.shoe_size')).toEqual({ key: 'student.shoe_size', known: false });
    expect(fields.find((f: { key: string }) => f.key === 'student.full_name')).toMatchObject({ known: true, source: 'core', type: 'text' });

    const blocked = await ctx.api.post(`/api/templates/${tid}/versions/${vid}/publish`).set(ctx.auth('editor'));
    expect(blocked.status).toBe(422);
    expect(blocked.body.error).toMatchObject({ code: 'UNKNOWN_FIELDS', details: ['student.shoe_size'] });

    const added = await ctx.api.post('/api/merge-fields').set(ctx.auth('admin')).send({ key: 'student.shoe_size', label: 'Կոշիկի չափս', source: 'manual', type: 'number' });
    expect(added.status).toBe(201);
    const ok = await ctx.api.post(`/api/templates/${tid}/versions/${vid}/publish`).set(ctx.auth('editor'));
    expect(ok.status).toBe(200);
  });

  it('warns when the signature checkbox field is missing', async () => {
    const res = await upload(await buildDocx(['1. Առարկան՝ {{student.full_name}}']));
    expect(res.body.warnings.map((w: { code: string }) => w.code)).toEqual(['MISSING_SIGNATURE_FIELD']);
  });

  it('broken tags -> 422 TEMPLATE_SYNTAX_ERROR with the tag and context', async () => {
    const res = await upload(await buildDocx(['Ուսանող՝ {{student.full_name', '{{signature.checkbox}}']));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('TEMPLATE_SYNTAX_ERROR');
    expect(res.body.error.details[0]).toMatchObject({ id: 'unclosed_tag', tag: expect.stringContaining('student.full_name') });
  });

  it('rejects non-docx files and corrupt zips', async () => {
    const pdf = Buffer.from('%PDF-1.4 fake');
    expect((await upload(pdf, {}, 'x.docx')).body.error.code).toBe('BAD_REQUEST');
    expect((await upload(seedFile('termination_act_v1.docx'), {}, 'x.pdf')).status).toBe(400);
    const corrupt = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(100)]);
    const res = await upload(corrupt);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_DOCX');
    expect((await ctx.api.post('/api/templates').set(ctx.auth('editor')).field('title', 'x').field('category', 'student_agreement')).status).toBe(400);
    expect((await upload(seedFile('termination_act_v1.docx'), { category: 'poems' })).body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('auto-numbering warning (product owner addition)', () => {
  it('Word automatic numbering with no typed numbers -> CLAUSES_NOT_DETECTED, draft still saved', async () => {
    const file = await autoNumberedDocx();
    expect(usesAutoNumbering(file)).toBe(true);
    const res = await upload(file, { category: 'vacation_order' });
    expect(res.status).toBe(201);
    expect(res.body.version.status).toBe('draft');
    expect(res.body.warnings).toEqual([
      { code: 'CLAUSES_NOT_DETECTED', message: 'Կետերը չեն հայտնաբերվել․ համարակալումը փոխարկեք սովորական տեքստի' },
    ]);
    expect(await prisma.templateVersion.count({ where: { id: res.body.version.id } })).toBe(1);
  });

  it('no warning when typed numbers exist, even if some list numbering is also used', async () => {
    const file = patchXml(await autoNumberedDocx(), (x) => x.replace('Վճարումը՝ 10', '2.1. Վճարումը՝ 10'));
    const res = await upload(file, { category: 'vacation_order' });
    expect(res.body.warnings).toEqual([]);
  });

  it('no warning for a letter without any numbering (it is simply one preamble clause)', async () => {
    const res = await upload(seedFile('enrollment_letter_v1.docx'), { category: 'enrollment_letter' });
    expect(res.body.warnings).toEqual([]);
  });
});

describe('checkbox symbols get their own run with an explicit font', () => {
  it('splits ☐ into a DejaVu Sans run and keeps the original run formatting around it', () => {
    const xml = '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">☐  Ստորագրություն՝ ___</w:t></w:r></w:p>';
    expect(isolateSymbols(xml)).toBe(
      '<w:p><w:r><w:rPr><w:b/></w:rPr></w:r><w:r><w:rPr><w:rFonts w:ascii="DejaVu Sans" w:hAnsi="DejaVu Sans" w:cs="DejaVu Sans" w:eastAsia="DejaVu Sans"/><w:b/></w:rPr><w:t>☐</w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">  Ստորագրություն՝ ___</w:t></w:r></w:p>',
    );
  });

  it('leaves runs without symbols untouched', () => {
    const xml = '<w:r><w:t>Աննա</w:t></w:r>';
    expect(isolateSymbols(xml)).toBe(xml);
  });

  it('works for runs without properties and replaces an existing font', () => {
    expect(isolateSymbols('<w:r><w:t>☑</w:t></w:r>')).toContain('<w:rPr><w:rFonts w:ascii="DejaVu Sans"');
    const out = isolateSymbols('<w:r><w:rPr><w:rStyle w:val="X"/><w:rFonts w:ascii="Arial"/></w:rPr><w:t>a☑b</w:t></w:r>');
    expect(out).toContain('<w:rPr><w:rStyle w:val="X"/><w:rFonts w:ascii="DejaVu Sans"');
    const symbolRun = out.match(/<w:r>(?:(?!<\/w:r>).)*☑<\/w:t><\/w:r>/)![0];
    expect(symbolRun).not.toContain('Arial');
    expect(out.match(/Arial/g)).toHaveLength(2); // "a" and "b" keep their font
  });
});

describe('version lifecycle (T-5, T-6)', () => {
  let tid: string;
  let v1: string;
  let v2: string;

  beforeAll(async () => {
    ({ templateId: tid, versionId: v1 } = await ctx.createTemplate('student_agreement_v1.docx', { title: 'Lifecycle', publish: false }));
  });

  it('v1 starts as a draft; generation from a draft is rejected', async () => {
    const tpl = await ctx.api.get(`/api/templates/${tid}`).set(ctx.auth('coordinator'));
    expect(tpl.body.versions).toEqual([expect.objectContaining({ id: v1, versionNumber: 1, status: 'draft' })]);
    const res = await ctx.api.post('/api/batches').set(ctx.auth('coordinator')).send({ templateVersionId: v1, recipientType: 'student', groupId: GROUP, ...READY_VALUES });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VERSION_NOT_PUBLISHED');
    const viaTemplate = await ctx.api.post('/api/batches/precheck').set(ctx.auth('coordinator')).send({ templateId: tid, recipientType: 'student', groupId: GROUP });
    expect(viaTemplate.status).toBe(404); // no published version yet
  });

  it('publishing v1 makes it the only published version', async () => {
    const res = await ctx.api.post(`/api/templates/${tid}/versions/${v1}/publish`).set(ctx.auth('editor'));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'published', publishedAt: expect.any(String) });
    expect(res.body.filePath).toBeUndefined(); // storage paths never leak
  });

  it('a new upload creates v2 as a draft with an automatic comparison and summary', async () => {
    const res = await uploadVersion(tid, seedFile('student_agreement_v2.docx'));
    expect(res.status).toBe(201);
    v2 = res.body.version.id;
    expect(res.body.version).toMatchObject({ versionNumber: 2, status: 'draft', comparedToId: v1 });
    expect(res.body.version.changeSummary).toBe('Կետ 3.2-ը հանվել է\nԿետ 4.2․ վճարման ժամկետը փոխվել է՝ 10 → 5 օր\nԿետ 6.2-ն ավելացվել է');
    expect(res.body.comparison.counts).toEqual({ added: 1, removed: 1, changed: 1, unchanged: 20, moved: 0 });
  });

  it('GET version returns the stored summary and, for ?locale=en, a regenerated English one', async () => {
    const res = await ctx.api.get(`/api/templates/${tid}/versions/${v2}?locale=en`).set(ctx.auth('editor'));
    expect(res.body.generatedSummary).toEqual(['Clause 3.2 removed', 'Clause 4.2: payment term changed from 10 to 5 days', 'Clause 6.2 added']);
    expect(res.body.clauses.length).toBe(22);
  });

  it('compare endpoint returns clauses, word diff and the summary', async () => {
    const res = await ctx.api.get(`/api/templates/${tid}/compare?from=${v1}&to=${v2}&locale=en`).set(ctx.auth('coordinator'));
    expect(res.status).toBe(200);
    expect(res.body.summary).toContain('Clause 4.2: payment term changed from 10 to 5 days');
    expect(res.body.changes.find((c: { newNumber: string }) => c.newNumber === '4.2').diff).toEqual(
      expect.arrayContaining([{ type: 'removed', value: '10' }, { type: 'added', value: '5' }]),
    );
    const other = await ctx.createTemplate('termination_act_v1.docx', { publish: false });
    expect((await ctx.api.get(`/api/templates/${tid}/compare?from=${v1}&to=${other.versionId}`).set(ctx.auth('editor'))).status).toBe(404);
  });

  it('the editor can edit the summary of a draft (V-5)', async () => {
    const res = await ctx.api.patch(`/api/templates/${tid}/versions/${v2}`).set(ctx.auth('editor')).send({ changeSummary: 'Վճարման ժամկետը կրճատվել է 5 օր։' });
    expect(res.status).toBe(200);
    expect(res.body.changeSummary).toBe('Վճարման ժամկետը կրճատվել է 5 օր։');
  });

  it('publishing v2 archives v1; published and archived versions are immutable', async () => {
    const v1Before = await prisma.templateVersion.findUniqueOrThrow({ where: { id: v1 } });
    const fileBefore = sha(await ctx.deps.storage.get(v1Before.filePath));

    expect((await ctx.api.post(`/api/templates/${tid}/versions/${v2}/publish`).set(ctx.auth('editor'))).status).toBe(200);
    const versions = await prisma.templateVersion.findMany({ where: { templateId: tid }, orderBy: { versionNumber: 'asc' } });
    expect(versions.map((v) => v.status)).toEqual(['archived', 'published']);
    expect(await prisma.templateVersion.count({ where: { templateId: tid, status: 'published' } })).toBe(1);

    // archived v1: same file, same content, still there
    const v1After = versions[0];
    expect(v1After.filePath).toBe(v1Before.filePath);
    expect(sha(await ctx.deps.storage.get(v1After.filePath))).toBe(fileBefore);
    expect(v1After.clauses).toEqual(v1Before.clauses);

    for (const vid of [v1, v2]) {
      const edit = await ctx.api.patch(`/api/templates/${tid}/versions/${vid}`).set(ctx.auth('editor')).send({ changeSummary: 'x' });
      expect(edit.status).toBe(409);
      expect(edit.body.error.code).toBe('VERSION_NOT_DRAFT');
      const pub = await ctx.api.post(`/api/templates/${tid}/versions/${vid}/publish`).set(ctx.auth('editor'));
      expect(pub.status).toBe(409);
    }
    expect((await prisma.templateVersion.findUniqueOrThrow({ where: { id: v2 } })).changeSummary).toBe('Վճարման ժամկետը կրճատվել է 5 օր։');
  });

  it('v3 is compared with the published v2 (not the archived v1)', async () => {
    const res = await uploadVersion(tid, seedFile('student_agreement_v1.docx'));
    expect(res.body.version).toMatchObject({ versionNumber: 3, comparedToId: v2 });
    expect(res.body.version.changeSummary).toContain('Կետ 4.2․ վճարման ժամկետը փոխվել է՝ 5 → 10 օր');
  });

  it('the renumbering fixture uploaded as v2 is summarised as "moved", not removed + added', async () => {
    const t = await ctx.createTemplate(await buildDocx(RENUMBER_V1), { title: 'Renumber' });
    const res = await uploadVersion(t.templateId, await buildDocx(RENUMBER_V2));
    expect(res.body.comparison.counts).toMatchObject({ added: 0, removed: 1, moved: 2 });
    expect(res.body.version.changeSummary.split('\n')).toEqual([
      'Կետ 3.2-ը հանվել է',
      'Կետ 3.2-ը տեղափոխվել է (3.3 → 3.2), բովանդակությունը չի փոխվել',
      'Կետ 3.3-ը տեղափոխվել է (3.4 → 3.3), բովանդակությունը չի փոխվել',
    ]);
  });

  it('first version on a template without a published version compares with the latest one', async () => {
    const t = await ctx.createTemplate('termination_act_v1.docx', { publish: false });
    const res = await uploadVersion(t.templateId, seedFile('termination_act_v1.docx'));
    expect(res.body.version.changeSummary).toBe('Փոփոխություններ չկան');
  });
});

describe('library queries and deletion (T-2, T-7, T-8)', () => {
  it('filters by category, status and title search', async () => {
    const all = (await ctx.api.get('/api/templates').set(ctx.auth('coordinator'))).body.items;
    expect(all.length).toBeGreaterThan(3);
    const terminations = (await ctx.api.get('/api/templates?category=termination_act').set(ctx.auth('coordinator'))).body.items;
    expect(terminations.every((t: { category: string }) => t.category === 'termination_act')).toBe(true);
    const drafts = (await ctx.api.get('/api/templates?status=draft').set(ctx.auth('coordinator'))).body.items;
    expect(drafts.every((t: { hasDraft: boolean }) => t.hasDraft)).toBe(true);
    const found = (await ctx.api.get('/api/templates?q=lifecy').set(ctx.auth('coordinator'))).body.items;
    expect(found.map((t: { title: string }) => t.title)).toEqual(['Lifecycle']);
    expect(found[0]).toMatchObject({ versionCount: 3, publishedVersion: { versionNumber: 2 }, latestVersion: { versionNumber: 3 } });
  });

  it('preview renders the version with demo data (cached after the first call)', async () => {
    const t = await ctx.createTemplate('student_agreement_v1.docx', { title: 'Preview' });
    const calls = ctx.fakePdf.calls.length;
    const res = await ctx.api.get(`/api/templates/${t.templateId}/versions/${t.versionId}/preview`).set(ctx.auth('coordinator')).buffer(true);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toMatch(/^inline/);
    const printed = (await docxText(ctx.fakePdf.calls[calls].docx)).replace(/\u00A0/g, ' ');
    expect(printed).toContain('Աննա Հակոբյան'); // first student of the demo group
    expect(printed).toContain('PS-DEMO-000000');
    expect(printed).toContain('150 000 ֏');
    expect(printed).toContain('☐  Ստորագրություն՝');
    await ctx.api.get(`/api/templates/${t.templateId}/versions/${t.versionId}/preview`).set(ctx.auth('coordinator'));
    expect(ctx.fakePdf.calls.length).toBe(calls + 1);
  });

  it('preview works for staff and partner categories', async () => {
    for (const [category, name] of [['vacation_order', 'Արմեն Սարգսյան'], ['partner_invoice', '«Կոդ Լաբ» ՍՊԸ']] as const) {
      const field = category === 'vacation_order' ? 'staff.full_name' : 'partner.name';
      const t = await ctx.createTemplate(await buildDocx([`Ստացող՝ {{${field}}}`, '{{signature.checkbox}}']), { category });
      const before = ctx.fakePdf.calls.length;
      expect((await ctx.api.get(`/api/templates/${t.templateId}/versions/${t.versionId}/preview`).set(ctx.auth('editor'))).status).toBe(200);
      expect(await docxText(ctx.fakePdf.calls[before].docx)).toContain(name);
    }
  });

  it('admin can delete an unused template; a template with generated documents cannot be deleted', async () => {
    const unused = await ctx.createTemplate('termination_act_v1.docx', { title: 'Unused' });
    expect((await ctx.api.delete(`/api/templates/${unused.templateId}`).set(ctx.auth('admin'))).status).toBe(204);
    expect((await ctx.api.get(`/api/templates/${unused.templateId}`).set(ctx.auth('admin'))).status).toBe(404);

    const used = await ctx.createTemplate('student_agreement_v1.docx', { title: 'Used' });
    await ctx.generate({ templateId: used.templateId, recipientType: 'student', groupId: GROUP, recipientIds: ['stu-001'], ...READY_VALUES });
    const res = await ctx.api.delete(`/api/templates/${used.templateId}`).set(ctx.auth('admin'));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TEMPLATE_IN_USE');
    expect((await ctx.api.get(`/api/templates/${used.templateId}`).set(ctx.auth('admin'))).body.documentCount).toBe(1);
  });

  it('audit log records template actions', async () => {
    const actions = (await ctx.api.get('/api/audit-log?limit=500').set(ctx.auth('admin'))).body.items.map((a: { action: string }) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['template.created', 'version.created', 'version.published', 'version.summary_updated', 'template.deleted', 'merge_field.created']));
  });
});
