import { formatDateHy, formatDateTimeHy, formatMoneyAmd, formatNumber, formatValue, toDate, NBSP } from '../src/services/formatters';

describe('Armenian formatting', () => {
  const months = ['հունվարի', 'փետրվարի', 'մարտի', 'ապրիլի', 'մայիսի', 'հունիսի', 'հուլիսի', 'օգոստոսի', 'սեպտեմբերի', 'հոկտեմբերի', 'նոյեմբերի', 'դեկտեմբերի'];

  it.each(months.map((m, i) => [i + 1, m]))('month %i uses the genitive form %s', (month, name) => {
    expect(formatDateHy(`2026-${String(month).padStart(2, '0')}-15`)).toBe(`15 ${name} 2026 թ.`);
  });

  it('formats the spec example', () => {
    expect(formatDateHy('2026-11-21')).toBe('21 նոյեմբերի 2026 թ.');
  });

  it('uses the Yerevan timezone for instants (23:30 UTC is already the next day)', () => {
    expect(formatDateHy(new Date('2026-11-21T23:30:00Z'))).toBe('22 նոյեմբերի 2026 թ.');
    expect(formatDateTimeHy(new Date('2026-11-21T10:05:00Z'))).toBe('21 նոյեմբերի 2026 թ., 14:05');
  });

  it('keeps calendar dates stable regardless of timezone', () => {
    expect(toDate('2026-01-01').toISOString()).toBe('2026-01-01T12:00:00.000Z');
    expect(() => toDate('not a date')).toThrow('Invalid date');
  });

  it('formats AMD with non-breaking thousands separators', () => {
    expect(formatMoneyAmd(150000)).toBe(`150${NBSP}000${NBSP}֏`);
    expect(formatMoneyAmd('1 234 567')).toBe(`1${NBSP}234${NBSP}567${NBSP}֏`);
    expect(formatMoneyAmd(999)).toBe(`999${NBSP}֏`);
    expect(formatNumber(-1500.5)).toBe(`-1${NBSP}500,5`);
    expect(() => formatNumber('abc')).toThrow('Invalid number');
  });

  it('formats by merge-field type, leaving empty values empty', () => {
    expect(formatValue('date', '2026-03-08')).toBe('8 մարտի 2026 թ.');
    expect(formatValue('money', 450000)).toBe(`450${NBSP}000${NBSP}֏`);
    expect(formatValue('number', 10)).toBe('10');
    expect(formatValue('text', 'Աննա')).toBe('Աննա');
    expect(formatValue('money', null)).toBe('');
    expect(formatValue('text', '')).toBe('');
  });
});
