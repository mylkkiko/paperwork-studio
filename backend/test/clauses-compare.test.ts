import { extractParagraphs } from '../src/services/docx.service';
import { hasNoClauses, parseClauseNumber, splitClauses, type Clause } from '../src/services/clauses.service';
import { compareClauses, similarity, tokenize, type Comparison } from '../src/services/compare.service';
import { RuleBasedSummaryGenerator } from '../src/services/summary/RuleBasedSummaryGenerator';
import { buildDocx, RENUMBER_V1, RENUMBER_V2, seedFile } from './helpers/docx';

const P = (texts: string[], headings: number[] = []) => texts.map((text, i) => ({ text, heading: headings.includes(i) }));
const clausesOf = async (file: Buffer) => splitClauses(await extractParagraphs(file));
const summary = new RuleBasedSummaryGenerator();
const brief = (c: Comparison) => c.changes.map((x) => `${x.status}${x.moved ? '/moved' : ''} ${x.oldNumber ?? '-'}→${x.newNumber ?? '-'}`);

describe('clause splitting (V-1)', () => {
  it('recognises clause numbers only at the start of a paragraph', () => {
    expect(parseClauseNumber('1. Առարկան')).toEqual({ number: '1', rest: 'Առարկան' });
    expect(parseClauseNumber('4.2. Վճարումը')).toEqual({ number: '4.2', rest: 'Վճարումը' });
    expect(parseClauseNumber('2.1.3 Ենթակետ')).toEqual({ number: '2.1.3', rest: 'Ենթակետ' });
    expect(parseClauseNumber('15 նոյեմբերի 2026 թ.')).toBeNull(); // a date, not clause 15
    expect(parseClauseNumber('21.11.2026 ամսաթվով')).toBeNull(); // a date
    expect(parseClauseNumber('Համաձայն 4.2 կետի')).toBeNull();
    expect(parseClauseNumber('2026 թ.')).toBeNull();
  });

  it('builds preamble, numbered clauses, headings and continuation paragraphs', () => {
    const clauses = splitClauses(
      P(['ՊԱՅՄԱՆԱԳԻՐ', 'ք. Երևան', '1. Առարկան', '1.1. Ուսուցում։', 'շարունակություն', 'Վճարման կարգը', 'Տեքստ', '2. Եզրափակիչ'], [5]),
    );
    expect(clauses.map((c) => [c.key, c.kind])).toEqual([
      ['preamble', 'preamble'],
      ['n:1', 'numbered'],
      ['n:1.1', 'numbered'],
      ['h:վճարման կարգը', 'heading'],
      ['n:2', 'numbered'],
    ]);
    expect(clauses[0].text).toBe('ՊԱՅՄԱՆԱԳԻՐ\nք. Երևան');
    expect(clauses[2].text).toBe('Ուսուցում։\nշարունակություն');
    expect(clauses[3].text).toBe('Վճարման կարգը\nՏեքստ');
  });

  it('keeps keys unique when a number repeats', () => {
    expect(splitClauses(P(['1. Ա', '1. Բ'])).map((c) => c.key)).toEqual(['n:1', 'n:1#2']);
  });

  it('splits the seed student agreement into a preamble + 21 numbered clauses', async () => {
    const clauses = await clausesOf(seedFile('student_agreement_v1.docx'));
    expect(clauses[0].kind).toBe('preamble');
    expect(clauses.filter((c) => c.kind === 'numbered').map((c) => c.number)).toEqual(
      ['1', '1.1', '1.2', '2', '2.1', '2.2', '3', '3.1', '3.2', '4', '4.1', '4.2', '4.3', '5', '5.1', '6', '6.1', '7', '7.1', '7.2', '8'],
    );
    expect(clauses.find((c) => c.number === '4.2')!.text).toContain('10 աշխատանքային օրվա');
    expect(hasNoClauses(clauses)).toBe(false);
  });

  it('treats a letter without numbering as a single preamble', async () => {
    const clauses = await clausesOf(seedFile('enrollment_letter_v1.docx'));
    expect(clauses).toHaveLength(1);
    expect(hasNoClauses(clauses)).toBe(true);
  });
});

describe('comparison (V-2, V-3)', () => {
  it('v1 → v2 demo: exactly 3.2 removed, 4.2 changed, 6.2 added, everything else unchanged', async () => {
    const cmp = compareClauses(await clausesOf(seedFile('student_agreement_v1.docx')), await clausesOf(seedFile('student_agreement_v2.docx')));
    const notUnchanged = cmp.changes.filter((c) => c.status !== 'unchanged');
    expect(notUnchanged.map((c) => [c.status, c.oldNumber, c.newNumber])).toEqual([
      ['removed', '3.2', null],
      ['changed', '4.2', '4.2'],
      ['added', null, '6.2'],
    ]);
    expect(cmp.counts).toEqual({ added: 1, removed: 1, changed: 1, unchanged: 20, moved: 0 });
  });

  it('word-level diff of the changed clause marks 10 removed and 5 added', async () => {
    const cmp = compareClauses(await clausesOf(seedFile('student_agreement_v1.docx')), await clausesOf(seedFile('student_agreement_v2.docx')));
    const c42 = cmp.changes.find((c) => c.newNumber === '4.2')!;
    expect(c42.diff!.filter((d) => d.type === 'removed').map((d) => d.value)).toEqual(['10']);
    expect(c42.diff!.filter((d) => d.type === 'added').map((d) => d.value)).toEqual(['5']);
    expect(c42.diff!.map((d) => d.value).join('')).toContain('աշխատանքային օրվա ընթացքում');
  });

  it('RENUMBERING fixture: 3.2 removed and old 3.3 → 3.2 with the same text is "unchanged, moved", not removed + added', async () => {
    const cmp = compareClauses(await clausesOf(await buildDocx(RENUMBER_V1)), await clausesOf(await buildDocx(RENUMBER_V2)));
    expect(brief(cmp)).toEqual([
      'unchanged -→-', // preamble
      'unchanged 3→3',
      'unchanged 3.1→3.1',
      'removed 3.2→-',
      'unchanged/moved 3.3→3.2',
      'unchanged/moved 3.4→3.3',
    ]);
    expect(cmp.counts).toMatchObject({ added: 0, removed: 1, changed: 0, moved: 2 });
    const removed = cmp.changes.find((c) => c.status === 'removed')!;
    expect(removed.oldText).toContain('կարգապահական'); // the clause that really disappeared
  });

  it('renumbered AND edited clause is "changed, moved" (similarity pass)', () => {
    const a = splitClauses(P(['1. Ներածություն', '2. Ուսանողը պարտավոր է հաճախել բոլոր դասերին և ժամանակին կատարել առաջադրանքները։']));
    const b = splitClauses(P(['1. Ներածություն', '1.5. Նոր դրույթ բոլորովին այլ բովանդակությամբ', '3. Ուսանողը պարտավոր է հաճախել բոլոր դասերին և ժամանակին կատարել բոլոր առաջադրանքները։']));
    const cmp = compareClauses(a, b);
    expect(brief(cmp)).toEqual(['unchanged 1→1', 'added -→1.5', 'changed/moved 2→3']);
  });

  it('a completely different clause under the same number is removed + added, not "changed"', () => {
    const cmp = compareClauses(splitClauses(P(['5. Պայմանագիրը լուծվում է գրավոր ծանուցմամբ։'])), splitClauses(P(['5. Ակադեմիան տրամադրում է հավաստագիր ավարտից հետո։'])));
    expect(brief(cmp)).toEqual(['removed 5→-', 'added -→5']);
  });

  it('similarity and tokenizer handle Armenian and merge tags', () => {
    expect(tokenize('Ուսանող՝ {{student.full_name}}, 10 օր')).toEqual(['ուսանող', '{{student.full_name}}', '10', 'օր']);
    expect(similarity('ա բ գ դ', 'ա բ գ դ')).toBe(1);
    expect(similarity('ա բ', 'գ դ')).toBe(0);
    expect(similarity('', '')).toBe(1);
  });
});

describe('summary (V-4)', () => {
  it('v1 → v2 summary mentions the 4.2 payment term with old and new values (hy + en)', async () => {
    const cmp = compareClauses(await clausesOf(seedFile('student_agreement_v1.docx')), await clausesOf(seedFile('student_agreement_v2.docx')));
    expect(await summary.generate(cmp, 'en')).toEqual(['Clause 3.2 removed', 'Clause 4.2: payment term changed from 10 to 5 days', 'Clause 6.2 added']);
    expect(await summary.generate(cmp, 'hy')).toEqual(['Կետ 3.2-ը հանվել է', 'Կետ 4.2․ վճարման ժամկետը փոխվել է՝ 10 → 5 օր', 'Կետ 6.2-ն ավելացվել է']);
  });

  it('renumbering summary says "moved, content unchanged"', async () => {
    const cmp = compareClauses(await clausesOf(await buildDocx(RENUMBER_V1)), await clausesOf(await buildDocx(RENUMBER_V2)));
    expect(await summary.generate(cmp, 'en')).toEqual([
      'Clause 3.2 removed',
      'Clause 3.2 moved (3.3 → 3.2), content unchanged',
      'Clause 3.3 moved (3.4 → 3.3), content unchanged',
    ]);
  });

  const one = (a: string, b: string) => compareClauses(splitClauses(P([a])), splitClauses(P([b])));

  it('detects changed amounts, dates and plain numbers specifically', async () => {
    expect(await summary.generate(one('4.1. Արժեքը կազմում է 150 000 ֏։', '4.1. Արժեքը կազմում է 180 000 ֏։'), 'en')).toEqual([
      'Clause 4.1: amount changed from 150 000 ֏ to 180 000 ֏',
    ]);
    expect(await summary.generate(one('1.2. Սկիզբը՝ 1 դեկտեմբերի 2026 թ.', '1.2. Սկիզբը՝ 15 դեկտեմբերի 2026 թ.'), 'en')).toEqual([
      'Clause 1.2: date changed from 1 դեկտեմբերի 2026 թ. to 15 դեկտեմբերի 2026 թ.',
    ]);
    expect(await summary.generate(one('1.2. Ամսաթիվ՝ 01.12.2026', '1.2. Ամսաթիվ՝ 15.12.2026'), 'en')).toEqual(['Clause 1.2: date changed from 01.12.2026 to 15.12.2026']);
    expect(await summary.generate(one('5.1. Ծանուցել 7 օր առաջ։', '5.1. Ծանուցել 14 օր առաջ։'), 'en')).toEqual(['Clause 5.1: term changed from 7 to 14 days']);
    expect(await summary.generate(one('2.3. Խմբում առավելագույնը 24 ուսանող։', '2.3. Խմբում առավելագույնը 20 ուսանող։'), 'en')).toEqual([
      'Clause 2.3: number changed from 24 to 20',
    ]);
    expect(await summary.generate(one('2.3. Ամսական 2 ամիս', '2.3. Ամսական 3 ամիս'), 'hy')).toEqual(['Կետ 2.3․ ժամկետը փոխվել է՝ 2 → 3 ամիս']);
  });

  it('falls back to "wording changed" when words change, and "no changes" for identical versions', async () => {
    expect(await summary.generate(one('7.1. Վեճերը լուծվում են բանակցություններով։', '7.1. Վեճերը լուծվում են դատական կարգով։'), 'en')).toEqual(['Clause 7.1: wording changed']);
    expect(await summary.generate(one('1. Ա', '1. Ա'), 'en')).toEqual(['No changes']);
    const pre = compareClauses(splitClauses(P(['Նախաբան մեկ երկու երեք'])), splitClauses(P(['Նախաբան մեկ երկու չորս'])));
    expect(await summary.generate(pre, 'en')).toEqual(['Preamble: wording changed']);
  });

  it('labels heading clauses by title', async () => {
    const cmp = compareClauses([] as Clause[], splitClauses(P(['Նոր բաժին'], [0])));
    expect(await summary.generate(cmp, 'en')).toEqual(['«Նոր բաժին» added']);
  });
});
