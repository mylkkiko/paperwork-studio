import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { formatDate } from '@/lib/format';
import { missingMessage } from '@/i18n/fallback';

describe('UI date formatting', () => {
  const iso = '2026-11-21T20:30:00Z'; // 22 Nov 00:30 in Yerevan
  it('Armenian uses its own month abbreviations (browsers print "2026 M11 22")', () => {
    expect(formatDate(iso, 'hy')).toBe('22 նոյ 2026');
    expect(formatDate(iso, 'hy', true)).toBe('22 նոյ 2026, 00:30');
  });
  it('English and Russian use Intl, in the Yerevan timezone', () => {
    expect(formatDate(iso, 'en')).toBe('22 Nov 2026');
    expect(formatDate(iso, 'ru')).toMatch(/^22 нояб\. 2026/);
    expect(formatDate(null, 'en')).toBe('—');
  });
});

describe('i18n', () => {
  it('missing translations render a visible marker', () => {
    expect(missingMessage({ namespace: 'dashboard', key: 'nope' })).toBe('⟦missing:dashboard.nope⟧');
  });
  it('hy / en / ru dictionaries are complete and every key used in code exists', () => {
    const out = execFileSync(process.execPath, ['scripts/check-i18n.mjs'], { encoding: 'utf8' });
    expect(out).toMatch(/✓ i18n OK/);
  });
});
