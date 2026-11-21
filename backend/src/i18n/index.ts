import hy from './hy.json';
import en from './en.json';

export type Locale = 'hy' | 'en';
export const DEFAULT_LOCALE: Locale = 'hy';
const dictionaries: Record<Locale, unknown> = { hy, en };

export function isLocale(x: unknown): x is Locale {
  return x === 'hy' || x === 'en';
}

/**
 * Translate a dotted key with `{param}` placeholders.
 *   t('hy', 'summary.added', { clause: 'Կետ 6.2' })
 * Falls back to Armenian, then to the key itself, so a missing string is visible but never crashes.
 */
export function t(locale: Locale, key: string, params: Record<string, string | number> = {}): string {
  const lookup = (dict: unknown) =>
    key.split('.').reduce<unknown>((node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), dict);
  const template = lookup(dictionaries[locale]) ?? lookup(dictionaries[DEFAULT_LOCALE]);
  if (typeof template !== 'string') return key;
  // Only replace single-brace placeholders; `{{field}}` in warnings must survive.
  return template.replace(/(?<!\{)\{(\w+)\}(?!\})/g, (m, name) => (name in params ? String(params[name]) : m));
}
