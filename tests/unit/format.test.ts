import { describe, expect, it } from 'vitest';
import {
  EN_DASH,
  formatCurrency,
  formatCurrencyRange,
  formatDate,
  formatNumber,
  formatPhone,
  formatRange,
  formatUnit,
  isoDate,
  NNBSP,
  normalizeE164,
  range,
  telHref,
} from '../../src/lib/format';

describe('constants', () => {
  it('are U+202F and U+2013', () => {
    expect(NNBSP).toBe('\u202F');
    expect(EN_DASH).toBe('\u2013');
  });
});

describe('formatNumber', () => {
  it('uses German separators', () => {
    expect(formatNumber(1234.5)).toBe('1.234,5');
    expect(formatNumber(2.4)).toBe('2,4');
    expect(formatNumber(1_000_000)).toBe('1.000.000');
    expect(formatNumber(1 / 3)).toBe('0,33');
  });

  it('rejects non-finite values', () => {
    expect(() => formatNumber(Number.NaN)).toThrow();
  });
});

describe('formatCurrency', () => {
  it('puts U+202F before the euro sign', () => {
    expect(formatCurrency(1500)).toBe('1.500\u202F€');
    expect(formatCurrency(1234.5)).toBe('1.234,50\u202F€');
    expect(formatCurrency(1500, { cents: true })).toBe('1.500,00\u202F€');
    expect(formatCurrency(1500)).not.toMatch(/[ \u00A0]/);
  });
});

describe('formatUnit', () => {
  it('joins number and unit with U+202F', () => {
    expect(formatUnit(20, 'mm')).toBe('20\u202Fmm');
    expect(formatUnit(2.4, 'm')).toBe('2,4\u202Fm');
    expect(formatUnit(19, '%')).toBe('19\u202F%');
    expect(formatUnit(1200, 'mm')).toBe('1.200\u202Fmm');
  });
});

describe('ranges', () => {
  it('use an en dash without spaces and one unit', () => {
    expect(formatRange(10, 20, { unit: 'mm' })).toBe('10\u201320\u202Fmm');
    expect(formatRange(2.4, 3)).toBe('2,4\u20133');
    expect(formatRange(5, 5, { unit: 'cm' })).toBe('5\u202Fcm');
    expect(range('Mo', 'Fr')).toBe('Mo\u2013Fr');
    expect(formatCurrencyRange(1500, 3000)).toBe('1.500\u20133.000\u202F€');
    expect(formatCurrencyRange(9.5, 12)).toBe('9,50\u201312,00\u202F€');
  });

  it('reject inverted ranges', () => {
    expect(() => formatRange(3, 2)).toThrow();
    expect(() => formatCurrencyRange(3, 2)).toThrow();
  });
});

describe('dates', () => {
  it('formats German long, short and month dates in Europe/Berlin', () => {
    expect(formatDate('2026-10-09')).toBe('9. Oktober 2026');
    expect(formatDate(new Date('2026-03-01T00:00:00Z'), 'short')).toBe('01.03.2026');
    expect(formatDate('2026-09-30', 'month')).toBe('September 2026');
    // 23:30 UTC is already the next day in Berlin.
    expect(formatDate('2026-12-31T23:30:00Z', 'short')).toBe('01.01.2027');
  });

  it('isoDate returns YYYY-MM-DD', () => {
    expect(isoDate('2026-10-09')).toBe('2026-10-09');
    expect(isoDate(new Date('2026-01-05T12:00:00Z'))).toBe('2026-01-05');
  });

  it('rejects invalid dates', () => {
    expect(() => formatDate('kein Datum')).toThrow();
  });
});

describe('phone', () => {
  it('normalises and validates E.164', () => {
    expect(normalizeE164('+49 621 123456-0')).toBe('+496211234560');
    expect(() => normalizeE164('0621 123456')).toThrow(/E\.164/);
    expect(telHref('+49 621 1234567')).toBe('tel:+496211234567');
  });

  it('formats German numbers per DIN 5008', () => {
    expect(formatPhone('+496211234567')).toBe('0621 1234567');
    expect(formatPhone('+496211234567', { international: true })).toBe('+49 621 1234567');
    expect(formatPhone('+4962031234', { areaCodeLength: 4 })).toBe('06203 1234');
    expect(formatPhone('+41441234567')).toBe('+41441234567');
  });
});
