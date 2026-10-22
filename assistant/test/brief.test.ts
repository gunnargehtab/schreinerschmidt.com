// The shop brief (docs/angebot.md §6.3, docs/assistant.md §5.3): generated from confirmed content
// only, committed, and in sync with the generator. The "no flagged text" check walks src/content on
// its own (not with the generator's helpers) and collects every string of an entry, fact or page
// block flagged `needs-review` or `placeholder` (a data entry without `review` counts as flagged).
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { OUT, ROOT, briefModule, buildBrief, frontmatter } from '../scripts/build-brief.mjs';
import { SHOP_BRIEF } from '../src/claude/brief.generated';
import { briefBlock } from '../src/claude/brief';

const FLAGGED = new Set(['needs-review', 'placeholder']);

/** Every string below a value. */
function strings(x: unknown, out: string[]): void {
  if (typeof x === 'string') out.push(x);
  else if (Array.isArray(x)) for (const y of x) strings(y, out);
  else if (x && typeof x === 'object') for (const y of Object.values(x)) strings(y, out);
}

/** Strings of flagged nodes: data entries (review object, default flagged), facts and page blocks (review string). */
function flaggedStrings(node: unknown, entry: boolean, out: string[]): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const y of node) flaggedStrings(y, false, out);
    return;
  }
  const o = node as Record<string, unknown>;
  const review = o['review'];
  const status =
    typeof review === 'string'
      ? review
      : review && typeof review === 'object'
        ? (review as { status?: string }).status
        : typeof o['status'] === 'string' && 'value' in o
          ? (o['status'] as string)
          : entry
            ? 'needs-review'
            : undefined;
  if (status && FLAGGED.has(status)) {
    strings(o, out);
    return;
  }
  for (const y of Object.values(o)) flaggedStrings(y, false, out);
}

function collectFlagged(): string[] {
  const out: string[] = [];
  const content = join(ROOT, 'src/content');
  for (const f of readdirSync(join(content, 'services'))) {
    const { data, body } = frontmatter(readFileSync(join(content, 'services', f), 'utf8'));
    const before = out.length;
    flaggedStrings(data, true, out);
    if (out.length > before) out.push(...body.split(/\n+/));
  }
  for (const [file, entries] of [
    ['faqs.yaml', true],
    ['settings.yaml', true],
  ] as const) {
    const data = parse(readFileSync(join(content, file), 'utf8')) as Record<string, unknown>;
    for (const e of Object.values(data)) flaggedStrings(e, entries, out);
  }
  for (const f of readdirSync(join(content, 'pages'))) {
    const data = parse(readFileSync(join(content, 'pages', f), 'utf8')) as Record<string, unknown>;
    for (const block of Object.values(data)) flaggedStrings(block, false, out);
  }
  return out.map((s) => s.replace(/\[\[Platzhalter:[^\]]*\]\]/g, '').trim());
}

describe('shop brief', () => {
  it('is up to date with the generator (run `npm run brief` after content changes)', async () => {
    expect(readFileSync(OUT, 'utf8')).toBe(await briefModule());
    expect(SHOP_BRIEF).toBe(await buildBrief());
  });

  it('contains no text of a needs-review or placeholder entry, fact or block', () => {
    const flagged = collectFlagged().filter((s) => s.length >= 20);
    expect(flagged.length).toBeGreaterThan(50); // the walker found the flagged content
    for (const s of flagged) expect(SHOP_BRIEF, s).not.toContain(s);
    expect(SHOP_BRIEF).not.toContain('[[Platzhalter');
    // Unconfirmed facts that must not leak in any form.
    expect(SHOP_BRIEF).not.toMatch(/Andreas-Hofer|1799467822|1\.000|seit 2010|4-Tage|FSC|PEFC|Auro/);
  });

  it('is deterministic and states the gaps instead of guessing', async () => {
    expect(await buildBrief()).toBe(await buildBrief());
    expect(SHOP_BRIEF).toContain('## Einzugsgebiet');
    expect(SHOP_BRIEF).toContain('Keine bestätigten Angaben.');
    expect(SHOP_BRIEF).toContain('Möbel nach Maß');
    expect(SHOP_BRIEF).not.toMatch(/umweltfreundlich|nachhaltig|ökologisch|natürlich/i);
    expect(briefBlock()).toMatch(/^<betrieb>\n[\s\S]*\n<\/betrieb>$/);
  });
});
