/**
 * Clause-by-clause comparison of two template versions (V-2, V-3).
 *
 * Matching happens in three passes. Each pass only looks at clauses not yet matched:
 *
 *  1. IDENTICAL TEXT. Clauses whose text is identical are paired, even if their numbers differ.
 *     This is what detects a renumbered clause: old 3.3 -> new 3.2 with the same text is "unchanged, moved",
 *     not "3.2 changed + 3.3 removed". (Ties: a pair with the same number wins.)
 *  2. SAME NUMBER. Clauses with the same key (number or heading) are paired if their texts are at least
 *     loosely similar (≥ MIN_SAME_NUMBER_SIMILARITY). Below that, the clause was replaced by a different one,
 *     so we report removed + added instead of a misleading "changed".
 *  3. SIMILAR TEXT. Remaining clauses are paired greedily, best similarity first, if ≥ MIN_MOVED_SIMILARITY.
 *     This catches clauses that were both renumbered AND edited.
 *
 * Unpaired old clauses are "removed", unpaired new clauses are "added".
 * Paired clauses are "unchanged" (same text) or "changed" (with a word-level diff). `moved` is set when the
 * number changed.
 */
import { diffWordsWithSpace } from 'diff';
import type { Clause } from './clauses.service';

export const MIN_SAME_NUMBER_SIMILARITY = 0.3;
export const MIN_MOVED_SIMILARITY = 0.6;

export type ClauseStatus = 'added' | 'removed' | 'changed' | 'unchanged';

export interface DiffSpan {
  type: 'equal' | 'added' | 'removed';
  value: string;
}

export interface ClauseChange {
  status: ClauseStatus;
  moved: boolean;
  kind: Clause['kind'];
  oldNumber: string | null;
  newNumber: string | null;
  title: string;
  oldText: string | null;
  newText: string | null;
  /** 0..1, word-level Dice similarity (1 for identical) */
  similarity: number;
  /** Only for "changed" */
  diff?: DiffSpan[];
}

export interface Comparison {
  fromVersionId?: string;
  toVersionId?: string;
  changes: ClauseChange[];
  counts: Record<ClauseStatus, number> & { moved: number };
}

const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Words = runs of letters/digits (any script) plus merge-field tags as single tokens. */
export function tokenize(s: string): string[] {
  return s.toLowerCase().match(/\{\{[^}]+\}\}|[\p{L}\p{N}]+/gu) ?? [];
}

/** Dice coefficient on word multisets: 2·|common| / (|a| + |b|). */
export function similarity(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.length === 0 && tb.length === 0) return 1;
  const counts = new Map<string, number>();
  for (const w of ta) counts.set(w, (counts.get(w) ?? 0) + 1);
  let common = 0;
  for (const w of tb) {
    const c = counts.get(w) ?? 0;
    if (c > 0) {
      common++;
      counts.set(w, c - 1);
    }
  }
  return (2 * common) / (ta.length + tb.length);
}

export function wordDiff(oldText: string, newText: string): DiffSpan[] {
  return diffWordsWithSpace(oldText, newText).map((p) => ({
    type: p.added ? 'added' : p.removed ? 'removed' : 'equal',
    value: p.value,
  }));
}

export function compareClauses(oldClauses: Clause[], newClauses: Clause[]): Comparison {
  // pairOfNew[j] = index of the old clause matched to new clause j
  const pairOfNew = new Map<number, number>();
  const usedOld = new Set<number>();
  const pair = (i: number, j: number) => {
    pairOfNew.set(j, i);
    usedOld.add(i);
  };
  const freeOld = () => oldClauses.map((_, i) => i).filter((i) => !usedOld.has(i));
  const freeNew = () => newClauses.map((_, j) => j).filter((j) => !pairOfNew.has(j));

  // Pass 1: identical text (prefer the candidate with the same key)
  for (const j of freeNew()) {
    const text = normalize(newClauses[j].text);
    const candidates = freeOld().filter((i) => normalize(oldClauses[i].text) === text);
    if (candidates.length) {
      pair(candidates.find((i) => oldClauses[i].key === newClauses[j].key) ?? candidates[0], j);
    }
  }

  // Pass 2: same number / heading key, if loosely similar
  for (const j of freeNew()) {
    const i = freeOld().find((k) => oldClauses[k].key === newClauses[j].key);
    if (i !== undefined && similarity(oldClauses[i].text, newClauses[j].text) >= MIN_SAME_NUMBER_SIMILARITY) pair(i, j);
  }

  // Pass 3: best remaining similarity, greedy
  const candidates: { i: number; j: number; s: number }[] = [];
  for (const i of freeOld()) {
    for (const j of freeNew()) {
      const s = similarity(oldClauses[i].text, newClauses[j].text);
      if (s >= MIN_MOVED_SIMILARITY) candidates.push({ i, j, s });
    }
  }
  candidates.sort((a, b) => b.s - a.s);
  for (const c of candidates) {
    if (!usedOld.has(c.i) && !pairOfNew.has(c.j)) pair(c.i, c.j);
  }

  // Build the result in document order: walk the new version; emit removed old clauses where they used to be.
  const changes: ClauseChange[] = [];
  const emittedRemoved = new Set<number>();
  const emitRemovedBefore = (limit: number) => {
    for (let i = 0; i < limit; i++) {
      if (!usedOld.has(i) && !emittedRemoved.has(i)) {
        emittedRemoved.add(i);
        const o = oldClauses[i];
        changes.push({ status: 'removed', moved: false, kind: o.kind, oldNumber: o.number, newNumber: null, title: o.title, oldText: o.text, newText: null, similarity: 0 });
      }
    }
  };

  // Old index of the next matched clause after new position j: removed clauses before it are shown before an
  // added clause, so a replaced clause reads "removed 5, added 5" rather than the other way round.
  const nextPairedOld = (j: number) => {
    for (let k = j + 1; k < newClauses.length; k++) {
      const i = pairOfNew.get(k);
      if (i !== undefined) return i;
    }
    return oldClauses.length;
  };

  newClauses.forEach((n, j) => {
    const i = pairOfNew.get(j);
    if (i === undefined) {
      emitRemovedBefore(nextPairedOld(j));
      changes.push({ status: 'added', moved: false, kind: n.kind, oldNumber: null, newNumber: n.number, title: n.title, oldText: null, newText: n.text, similarity: 0 });
      return;
    }
    emitRemovedBefore(i);
    const o = oldClauses[i];
    const same = normalize(o.text) === normalize(n.text);
    changes.push({
      status: same ? 'unchanged' : 'changed',
      moved: o.number !== n.number,
      kind: n.kind,
      oldNumber: o.number,
      newNumber: n.number,
      title: n.title,
      oldText: o.text,
      newText: n.text,
      similarity: same ? 1 : similarity(o.text, n.text),
      diff: same ? undefined : wordDiff(o.text, n.text),
    });
  });
  emitRemovedBefore(oldClauses.length);

  const counts = { added: 0, removed: 0, changed: 0, unchanged: 0, moved: 0 };
  for (const c of changes) {
    counts[c.status]++;
    if (c.moved) counts.moved++;
  }
  return { changes, counts };
}
