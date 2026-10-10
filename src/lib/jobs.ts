// Job display helpers shared by the Karriere pages and the JobCard: employment-type labels, salary
// text and the publication rule for an unconfirmed salary. Pure (no astro:*), so it is unit-tested.
// JobPosting JSON-LD has its own enum mapping in jsonld.ts.
import { formatCurrencyRange } from './format';

/** German labels for the schema.org employment types used in `src/content/jobs/*`. */
export const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  FULL_TIME: 'Vollzeit',
  PART_TIME: 'Teilzeit',
  CONTRACTOR: 'Freie Mitarbeit',
  TEMPORARY: 'befristet',
  INTERN: 'Praktikum',
};

/** German salary units, keyed by the schema.org unit text. */
export const SALARY_UNIT_LABELS: Record<string, string> = {
  HOUR: 'pro Stunde',
  MONTH: 'pro Monat',
  YEAR: 'pro Jahr',
};

export interface SalaryFact {
  value: { min: number; max: number; unit: string };
  status: 'confirmed' | 'needs-review' | 'placeholder';
}

/** "Vollzeit · 40 Std./Woche": employment types and working hours, joined with a middle dot. */
export function jobMeta(employmentType: readonly string[], workHours?: string): string {
  return [...employmentType.map((t) => EMPLOYMENT_TYPE_LABELS[t] ?? t), workHours].filter(Boolean).join(' · ');
}

/** "3.000–4.000 € pro Monat". */
export function salaryText({ value }: SalaryFact): string {
  return `${formatCurrencyRange(value.min, value.max)} ${SALARY_UNIT_LABELS[value.unit] ?? value.unit}`;
}

/**
 * The salary text to show, or `undefined`. A salary is published when confirmed; an unconfirmed one
 * shows only in the demo (inside a review mark), never in production.
 */
export function visibleSalary(salary: SalaryFact | undefined, demo: boolean): string | undefined {
  return salary && (salary.status === 'confirmed' || demo) ? salaryText(salary) : undefined;
}
