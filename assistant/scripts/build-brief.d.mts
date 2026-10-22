// Types of build-brief.mjs for the tests.
export const ROOT: string;
export const OUT: string;
export const PAGE_FIELDS: readonly (readonly [string, string, string])[];
export function frontmatter(text: string): { data: Record<string, unknown>; body: string };
export function firstSection(body: string): string;
export function buildBrief(root?: string): Promise<string>;
export function briefModule(root?: string): Promise<string>;
