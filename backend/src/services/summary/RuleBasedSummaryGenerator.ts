/**
 * Rule-based change summary (V-4). One line per meaningful change, built from i18n phrases:
 *
 *   added               -> "Clause 6.2 added"
 *   removed             -> "Clause 3.2 removed"
 *   moved, same text    -> "Clause 3.2 moved (3.3 → 3.2), content unchanged"
 *   changed, and the ONLY difference is one or more values (numbers, dates, amounts):
 *       money           -> "Clause 4.1: amount changed from 100 000 ֏ to 150 000 ֏"
 *       date            -> "Clause 1.2: date changed from 01.12.2026 to 15.12.2026"
 *       number + unit   -> "Clause 4.2: payment term changed from 10 to 5 days"
 *       other number    -> "Clause 5.1: number changed from 7 to 10"
 *   any other change    -> "Clause 7.1: wording changed"
 *
 * How "only a value changed" is detected: every value token in a clause is replaced by a placeholder.
 * If the two placeholder "skeletons" are identical, the clause wording is the same and only values differ,
 * so we can name the old and new values. Otherwise the wording changed and we say so in general terms.
 */
import { t, type Locale } from '../../i18n';
import type { ClauseChange, Comparison } from '../compare.service';
import type { SummaryGenerator } from './SummaryGenerator';

type ValueKind = 'money' | 'date' | 'number';
interface ValueToken {
  kind: ValueKind;
  raw: string;
  /** text immediately after the value, used to detect units like "օր" / "days" */
  after: string;
}

const MONTHS = '(?:հունվարի|փետրվարի|մարտի|ապրիլի|մայիսի|հունիսի|հուլիսի|օգոստոսի|սեպտեմբերի|հոկտեմբերի|նոյեմբերի|դեկտեմբերի)';
// Order matters: dates and money first, so their digits are not taken as plain numbers.
const VALUE_RE = new RegExp(
  [
    `(?<date>\\d{1,2}\\.\\d{1,2}\\.\\d{4}|\\d{1,2} ${MONTHS} \\d{4}(?: թ\\.)?)`,
    `(?<money>\\d{1,3}(?:[ \\u00A0]\\d{3})+(?:[ \\u00A0]?(?:֏|դրամ|AMD))?|\\d+(?:[ \\u00A0]?(?:֏|դրամ|AMD)))`,
    `(?<number>\\d+(?:[.,]\\d+)?)`,
  ].join('|'),
  'gu',
);

function extractValues(text: string): { skeleton: string; values: ValueToken[] } {
  const values: ValueToken[] = [];
  const skeleton = text.replace(VALUE_RE, (...args) => {
    const groups = args[args.length - 1] as Record<string, string | undefined>;
    const offset = args[args.length - 3] as number;
    const raw = args[0] as string;
    const kind: ValueKind = groups.date ? 'date' : groups.money ? 'money' : 'number';
    values.push({ kind, raw, after: text.slice(offset + raw.length, offset + raw.length + 30) });
    return '\u0000';
  });
  return { skeleton: skeleton.replace(/\s+/g, ' ').trim(), values };
}

const UNIT_PATTERNS: [RegExp, string][] = [
  [/^\s*(?:աշխատանքային\s+|calendar\s+|working\s+|business\s+)?(?:օր|day)/iu, 'day'],
  [/^\s*(?:ամս|ամիս|month)/iu, 'month'],
  [/^\s*(?:տար|year)/iu, 'year'],
  [/^\s*(?:ժամ|hour)/iu, 'hour'],
];

function unitOf(after: string): string | null {
  for (const [re, unit] of UNIT_PATTERNS) if (re.test(after)) return unit;
  return null;
}

/** "payment" context makes the phrase more specific: "payment term" instead of "term". */
const PAYMENT_RE = /վճար|payment/iu;

export function clauseLabel(c: ClauseChange, locale: Locale): string {
  if (c.kind === 'preamble') return t(locale, 'summary.preamble');
  const number = c.newNumber ?? c.oldNumber;
  if (number) return t(locale, 'summary.clause', { number });
  return `«${c.title}»`;
}

/** Lines for a changed clause whose wording is identical except for values; null if wording changed. */
function valueChangeLines(c: ClauseChange, label: string, locale: Locale): string[] | null {
  const before = extractValues(c.oldText ?? '');
  const after = extractValues(c.newText ?? '');
  if (before.skeleton !== after.skeleton || before.values.length !== after.values.length) return null;

  const lines: string[] = [];
  before.values.forEach((oldV, idx) => {
    const newV = after.values[idx];
    if (oldV.raw === newV.raw) return;
    const params = { clause: label, old: oldV.raw, new: newV.raw };
    if (oldV.kind === 'money' || newV.kind === 'money') {
      lines.push(t(locale, 'summary.amountChanged', params));
    } else if (oldV.kind === 'date' || newV.kind === 'date') {
      lines.push(t(locale, 'summary.dateChanged', params));
    } else {
      const unit = unitOf(newV.after) ?? unitOf(oldV.after);
      if (unit) {
        const key = PAYMENT_RE.test(c.newText ?? '') ? 'summary.paymentTermChanged' : 'summary.termChanged';
        lines.push(t(locale, key, { ...params, unit: t(locale, `summary.unit.${unit}`) }));
      } else {
        lines.push(t(locale, 'summary.numberChanged', params));
      }
    }
  });
  return lines.length ? lines : null;
}

export class RuleBasedSummaryGenerator implements SummaryGenerator {
  async generate(comparison: Comparison, locale: Locale): Promise<string[]> {
    const lines: string[] = [];
    for (const c of comparison.changes) {
      const label = clauseLabel(c, locale);
      const moveParams = { clause: label, from: c.oldNumber ?? '—', to: c.newNumber ?? '—' };
      switch (c.status) {
        case 'added':
          lines.push(t(locale, 'summary.added', { clause: label }));
          break;
        case 'removed':
          lines.push(t(locale, 'summary.removed', { clause: label }));
          break;
        case 'unchanged':
          if (c.moved) lines.push(t(locale, 'summary.moved', moveParams));
          break;
        case 'changed': {
          if (c.moved) lines.push(t(locale, 'summary.movedChanged', moveParams));
          lines.push(...(valueChangeLines(c, label, locale) ?? [t(locale, 'summary.textChanged', { clause: label })]));
          break;
        }
      }
    }
    return lines.length ? lines : [t(locale, 'summary.noChanges')];
  }
}
