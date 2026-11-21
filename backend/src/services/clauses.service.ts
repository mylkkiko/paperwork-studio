/**
 * Clause splitting (V-1).
 *
 * A template's paragraphs are grouped into clauses:
 *   - A paragraph that STARTS with a clause number begins a new clause:
 *       "1. Պայմանագրի առարկան"   -> number "1"
 *       "4.2. Վճարումը ..."        -> number "4.2"
 *       "2.1.3 ..."                -> number "2.1.3"
 *     The number must be followed by a dot, or be multi-level (contain a dot), and then whitespace.
 *     That rule keeps dates like "15 նոյեմբերի ..." or "21.11.2026" from being read as clause numbers.
 *   - A Word heading (Heading 1–3) without a number also begins a new clause.
 *   - Paragraphs before the first clause form the "preamble" clause.
 *   - Any other paragraph is appended to the current clause (e.g. signature lines under the last clause).
 */
import type { Paragraph } from './docx.service';

export type ClauseKind = 'preamble' | 'numbered' | 'heading';

export interface Clause {
  /** Stable identifier inside one version: "preamble", "n:4.2" or "h:<heading text>" */
  key: string;
  kind: ClauseKind;
  /** "4.2" for numbered clauses, null otherwise */
  number: string | null;
  /** First line, shortened — for display */
  title: string;
  /** Clause text WITHOUT the leading number (so renumbering alone is not a text change) */
  text: string;
}

// up to 4 levels, each 1–3 digits: "1", "4.2", "2.1.3", "1.2.3.4"
const NUMBER_RE = /^(\d{1,3}(?:\.\d{1,3}){0,3})(\.?)\s+/;

export function parseClauseNumber(paragraph: string): { number: string; rest: string } | null {
  const m = NUMBER_RE.exec(paragraph);
  if (!m) return null;
  const [whole, number, trailingDot] = m;
  if (!trailingDot && !number.includes('.')) return null; // "15 նոյեմբերի" is a date, not clause 15
  return { number, rest: paragraph.slice(whole.length) };
}

const shorten = (s: string, n = 80) => {
  const line = s.split('\n')[0];
  return line.length > n ? line.slice(0, n - 1) + '…' : line;
};

export function splitClauses(paragraphs: Paragraph[]): Clause[] {
  const clauses: Clause[] = [];
  let current: Clause | null = null;
  const usedKeys = new Set<string>();

  // Duplicate numbers / headings can happen in sloppy templates; suffix them so keys stay unique.
  const uniqueKey = (base: string) => {
    let key = base;
    for (let i = 2; usedKeys.has(key); i++) key = `${base}#${i}`;
    usedKeys.add(key);
    return key;
  };

  for (const p of paragraphs) {
    const numbered = parseClauseNumber(p.text);
    if (numbered) {
      current = { key: uniqueKey(`n:${numbered.number}`), kind: 'numbered', number: numbered.number, title: shorten(numbered.rest), text: numbered.rest };
      clauses.push(current);
    } else if (p.heading) {
      current = { key: uniqueKey(`h:${p.text.toLowerCase()}`), kind: 'heading', number: null, title: shorten(p.text), text: p.text };
      clauses.push(current);
    } else if (current) {
      current.text += '\n' + p.text;
    } else {
      current = { key: uniqueKey('preamble'), kind: 'preamble', number: null, title: shorten(p.text), text: p.text };
      clauses.push(current);
    }
  }
  return clauses;
}

/** True when no clause structure was found (only a preamble, or nothing). */
export function hasNoClauses(clauses: Clause[]): boolean {
  return !clauses.some((c) => c.kind !== 'preamble');
}
