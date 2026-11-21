import type { Locale } from '../../i18n';
import type { Comparison } from '../compare.service';

/**
 * Turns a clause comparison into human-readable summary lines.
 * Today: RuleBasedSummaryGenerator. Extension point (V-6, P2): an LLM-backed implementation
 * can be registered in container.ts without changing callers.
 */
export interface SummaryGenerator {
  generate(comparison: Comparison, locale: Locale): Promise<string[]>;
}
