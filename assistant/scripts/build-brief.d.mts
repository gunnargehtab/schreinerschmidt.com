// Types of build-brief.mjs for the tests.
export const ROOT: string;
export const OUT: string;
export const WORDMARK_OUT: string;
export const WORDMARK_SRC: string;
export const PAGE_FIELDS: readonly (readonly [string, string, string])[];
export function frontmatter(text: string): { data: Record<string, unknown>; body: string };
export function firstSection(body: string): string;
export function buildBrief(root?: string): Promise<string>;
export function briefModule(root?: string): Promise<string>;
export function shopKontakt(root?: string): Record<string, string | null>;
export function wordmarkModule(root?: string): string;
