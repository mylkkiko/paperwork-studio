/**
 * i18n consistency check (run: npm run i18n:check)
 *  1. hy / en / ru have exactly the same keys
 *  2. every message is valid ICU syntax
 *  3. every literal key used in code — t('key') where `const t = useTranslations('ns')` — exists
 * Dynamic keys (t(`status.${x}`)) are not checked here; the dictionaries list all their values explicitly.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { IntlMessageFormat } from 'intl-messageformat';

const LOCALES = ['hy', 'en', 'ru'];
const root = new URL('..', import.meta.url).pathname;
const dicts = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(readFileSync(join(root, 'messages', `${l}.json`), 'utf8'))]));
const errors = [];

const flatten = (obj, prefix = '') =>
  Object.entries(obj).flatMap(([k, v]) => (v && typeof v === 'object' ? flatten(v, `${prefix}${k}.`) : [[`${prefix}${k}`, v]]));
const flat = Object.fromEntries(LOCALES.map((l) => [l, Object.fromEntries(flatten(dicts[l]))]));

// 1. same keys
const base = Object.keys(flat.en);
for (const l of LOCALES) {
  const keys = new Set(Object.keys(flat[l]));
  for (const k of base) if (!keys.has(k)) errors.push(`${l}: missing key ${k}`);
  for (const k of keys) if (!flat.en[k]) errors.push(`${l}: extra key ${k} (not in en)`);
}

// 2. valid ICU
for (const l of LOCALES) {
  for (const [k, v] of Object.entries(flat[l])) {
    try {
      new IntlMessageFormat(v, l);
    } catch (e) {
      errors.push(`${l}: invalid ICU in ${k}: ${e.message}`);
    }
  }
}

// 3. literal keys used in code
const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(p);
  }
};
walk(join(root, 'src'));
let checked = 0;
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  // The same variable (usually `t`) may be bound to different namespaces in different functions of one file:
  // a key is accepted if it exists in any namespace bound to that name.
  const vars = new Map();
  for (const m of src.matchAll(/const\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*(?:'([^']*)')?\s*\)/g)) {
    vars.set(m[1], [...(vars.get(m[1]) ?? []), m[2] ?? '']);
  }
  for (const [v, namespaces] of vars) {
    for (const m of src.matchAll(new RegExp(`\\b${v}\\(\\s*'([^']+)'`, 'g'))) {
      const candidates = namespaces.map((ns) => (ns ? `${ns}.${m[1]}` : m[1]));
      checked++;
      if (!candidates.some((key) => key in flat.en)) errors.push(`${file.replace(root, '')}: unknown key ${candidates.join(' | ')}`);
    }
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  console.error(`\n✗ ${errors.length} i18n problem(s)`);
  process.exit(1);
}
console.log(`✓ i18n OK: ${base.length} keys × ${LOCALES.length} languages, ${checked} literal usages checked`);
