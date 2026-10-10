import { describe, expect, it } from 'vitest';
import { jobMeta, salaryText, visibleSalary, type SalaryFact } from '../../src/lib/jobs';

const salary = (status: SalaryFact['status']): SalaryFact => ({
  value: { min: 3000, max: 4000, unit: 'MONTH' },
  status,
});

describe('jobMeta', () => {
  it('maps employment types to German labels and appends the working hours', () => {
    expect(jobMeta(['FULL_TIME', 'PART_TIME'], '4-Tage-Woche')).toBe('Vollzeit · Teilzeit · 4-Tage-Woche');
  });

  it('keeps unknown types as they are and skips missing hours', () => {
    expect(jobMeta(['OTHER'])).toBe('OTHER');
  });
});

describe('salary', () => {
  it('formats the range with the unit', () => {
    expect(salaryText(salary('confirmed'))).toMatch(/^3\.000.4\.000.€ pro Monat$/);
  });

  it('publishes a confirmed salary everywhere', () => {
    expect(visibleSalary(salary('confirmed'), false)).toBeDefined();
  });

  it('shows an unconfirmed salary only in the demo', () => {
    expect(visibleSalary(salary('needs-review'), true)).toBeDefined();
    expect(visibleSalary(salary('needs-review'), false)).toBeUndefined();
    expect(visibleSalary(undefined, true)).toBeUndefined();
  });
});
