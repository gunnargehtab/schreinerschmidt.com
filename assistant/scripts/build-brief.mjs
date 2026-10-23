// Builds the shop brief for Claude's system prompt (docs/angebot.md §6.3, docs/assistant.md §5.3)
// from src/content, keeping confirmed facts only: an entry or field flagged `needs-review` or
// `placeholder` is left out, and so is a data-collection entry without a `review` block (its
// schema default is `needs-review`). Page-copy blocks count as confirmed unless they carry a
// review mark, as on the site (src/lib/review-mark.ts). `[[Platzhalter: …]]` markers are removed.
//
// Besides src/content, the brief lists the project types the configurator offers
// (src/lib/configurator/labels.ts): that is the form the customer filled in, not a business claim.
//
// Output: src/claude/brief.generated.ts (committed). Deterministic: no dates, sorted input.
// `npm run brief` rewrites it; test/brief.test.ts re-runs buildBrief() and fails on drift.
//
// 7d: the same module exports SHOP_KONTAKT, the shop's contact details for the signature of the
// customer mails and the PDF (docs/angebot.md §8), again confirmed values only (null otherwise).
// `npm run brief` also writes src/pdf/wordmark.generated.ts, the site's wordmark PNG
// (src/assets/brand/wordmark.png, rights `own`) as base64 for the PDF letterhead, so the bundle
// needs no file from the site at run time (test/pdf.test.ts checks it for drift).
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'yaml';

const HERE = dirname(fileURLToPath(import.meta.url));
/** Repository root (assistant/scripts → ../..). */
export const ROOT = resolve(HERE, '..', '..');
export const OUT = resolve(HERE, '..', 'src', 'claude', 'brief.generated.ts');
export const WORDMARK_OUT = resolve(HERE, '..', 'src', 'pdf', 'wordmark.generated.ts');
export const WORDMARK_SRC = 'src/assets/brand/wordmark.png';

const FLAGGED = new Set(['needs-review', 'placeholder']);
const MARKER = /\s*\[\[Platzhalter:[^\]]*\]\]/g;

/** Page-copy fields that belong in the brief: [file, block, field]. */
export const PAGE_FIELDS = [
  ['leistungen.yaml', 'intro', 'text'],
  ['home.yaml', 'services', 'lead'],
  ['home.yaml', 'process', 'steps'],
];

const clean = (s) => String(s).replace(MARKER, '').replace(/\s+/g, ' ').trim();

/** Status of a data-collection review block; a missing block is the schema default `needs-review`. */
const entryStatus = (review) =>
  review && typeof review === 'object' && typeof review.status === 'string' ? review.status : 'needs-review';
const confirmed = (review) => entryStatus(review) === 'confirmed';
/** A `fact()` value counts only when its own status is confirmed. */
const factValue = (f) => (f && typeof f === 'object' && f.status === 'confirmed' ? f.value : undefined);
/** Page-copy block: unmarked or `confirmed` is published copy. */
const blockOk = (block) => block && typeof block === 'object' && !FLAGGED.has(block.review);

export function frontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  return m ? { data: parse(m[1]) ?? {}, body: m[2] ?? '' } : { data: {}, body: text };
}

/** The first `## ` section of a markdown body, as plain text (no links, emphasis or markers). */
export function firstSection(body) {
  const parts = body.split(/^## .*$/m);
  const section = (parts[1] ?? parts[0] ?? '').trim();
  return clean(
    section
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[*_`>#]/g, '')
      .replace(/^\s*-\s+/gm, ''),
  );
}

async function projectTypes(root) {
  const mod = await import(pathToFileURL(join(root, 'src/lib/configurator/labels.ts')).href);
  return Object.values(mod.PROJECT_TYPE_LABELS).map((t) => `- ${t.label} (${t.hint})`);
}

function services(root) {
  const dir = join(root, 'src/content/services');
  const entries = readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => frontmatter(readFileSync(join(dir, f), 'utf8')))
    .filter((e) => confirmed(e.data.review))
    .sort((a, b) => (a.data.order ?? 0) - (b.data.order ?? 0));
  const lines = [];
  for (const { data, body } of entries) {
    lines.push(`- ${clean(data.title)}: ${clean(data.teaser ?? '')}`);
    const types = (data.types ?? []).map((t) => clean(t.name)).filter(Boolean);
    if (types.length) lines.push(`  Ausführungen: ${types.join(', ')}`);
    const intro = firstSection(body);
    if (intro) lines.push(`  ${intro}`);
  }
  return lines;
}

function faqs(root) {
  const data = parse(readFileSync(join(root, 'src/content/faqs.yaml'), 'utf8')) ?? {};
  return Object.keys(data)
    .sort()
    .map((k) => data[k])
    .filter((e) => e && confirmed(e.review))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .flatMap((e) => [`- ${clean(e.question)}`, `  ${clean(e.answer)}`]);
}

function settings(root) {
  const site = (parse(readFileSync(join(root, 'src/content/settings.yaml'), 'utf8')) ?? {}).site;
  if (!site || !confirmed(site.review)) return { betrieb: [], gebiet: [] };
  const betrieb = [];
  if (site.name) betrieb.push(`Name: ${clean(site.name)}`);
  if (site.owner?.title) betrieb.push(`Inhaber: ${clean(site.owner.title)}`);
  if (site.address?.city) betrieb.push(`Sitz: ${clean(site.address.city)}`);
  const area = factValue(site.areaServed);
  const gebiet = Array.isArray(area) && area.length ? [`- ${area.map(clean).join(', ')}`] : [];
  return { betrieb, gebiet };
}

/** A plain value, or a `fact()` value only when its own status is confirmed. */
const plain = (x) => {
  if (typeof x === 'string' || typeof x === 'number') return clean(x) || null;
  const f = factValue(x);
  return typeof f === 'string' || typeof f === 'number' ? clean(f) || null : null;
};

/** Confirmed contact details of the shop (signature of the customer mails, §8); all null until confirmed. */
export function shopKontakt(root = ROOT) {
  const site = (parse(readFileSync(join(root, 'src/content/settings.yaml'), 'utf8')) ?? {}).site;
  const none = {
    name: null,
    inhaber: null,
    titel: null,
    strasse: null,
    plz: null,
    ort: null,
    telefon: null,
    email: null,
  };
  if (!site || !confirmed(site.review)) return none;
  return {
    name: plain(site.name),
    inhaber: plain(site.owner?.name),
    titel: plain(site.owner?.title),
    strasse: plain(site.address?.street),
    plz: plain(site.address?.postalCode),
    ort: plain(site.address?.city),
    telefon: plain(site.phone?.display),
    email: plain(site.email),
  };
}

function pages(root) {
  const lines = [];
  for (const [file, block, field] of PAGE_FIELDS) {
    const data = parse(readFileSync(join(root, 'src/content/pages', file), 'utf8')) ?? {};
    const b = data[block];
    if (!blockOk(b) || b[field] === undefined) continue;
    const value = b[field];
    if (Array.isArray(value)) {
      for (const s of value) if (s && typeof s === 'object') lines.push(`- ${clean(s.title)}: ${clean(s.text)}`);
    } else lines.push(clean(value));
  }
  return lines;
}

const section = (title, lines, empty) => [`## ${title}`, ...(lines.length ? lines : [empty]), ''];
const NONE = 'Keine bestätigten Angaben.';

/** The brief as plain German text. */
export async function buildBrief(root = ROOT) {
  const s = settings(root);
  const out = [
    '# Betrieb (nur bestätigte Angaben)',
    '',
    ...section('Betrieb', s.betrieb, NONE),
    ...section('Projektarten im Konfigurator (Auswahl des Kunden, keine Zusage)', await projectTypes(root), NONE),
    ...section('Leistungen', [...pages(root), ...services(root)], NONE),
    ...section('Einzugsgebiet', s.gebiet, NONE),
    ...section('Was der Betrieb nicht macht', [], NONE),
    ...section('Häufige Fragen', faqs(root), NONE),
  ];
  return out.join('\n').trimEnd() + '\n';
}

/** Escapes a string for a template literal. */
const literal = (s) => s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');

/** A string literal as prettier writes it (single quotes unless that needs more escapes), or null. */
const tsString = (v) => {
  if (v === null) return 'null';
  if (v.includes("'") && !v.includes('"')) return JSON.stringify(v);
  return `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
};

/** The generated module's source. */
export async function briefModule(root = ROOT) {
  const kontakt = shopKontakt(root);
  return [
    '// GENERATED by assistant/scripts/build-brief.mjs from src/content (confirmed facts only).',
    '// Do not edit: run `npm run brief` in assistant/. test/brief.test.ts fails when it is stale.',
    `export const SHOP_BRIEF = \`${literal(await buildBrief(root))}\`;`,
    '',
    '/** Confirmed contact details of the shop (signature of customer mails and PDF); null: unconfirmed. */',
    'export interface ShopKontakt {',
    ...Object.keys(kontakt).map((k) => `  ${k}: string | null;`),
    '}',
    '',
    'export const SHOP_KONTAKT: ShopKontakt = {',
    ...Object.entries(kontakt).map(([k, v]) => `  ${k}: ${tsString(v)},`),
    '};',
    '',
  ].join('\n');
}

/** The wordmark module's source: the PNG as base64 (wrapped at 100 characters). */
export function wordmarkModule(root = ROOT) {
  const b64 = readFileSync(join(root, WORDMARK_SRC)).toString('base64');
  const lines = b64.match(/.{1,100}/g) ?? [];
  return [
    `// GENERATED by assistant/scripts/build-brief.mjs from ${WORDMARK_SRC} (rights: own, asset-manifest.json).`,
    '// Do not edit: run `npm run brief` in assistant/. test/pdf.test.ts fails when it is stale.',
    'export const WORDMARK_PNG_BASE64 =',
    ...lines.map((l, i) => `  '${l}'${i === lines.length - 1 ? ';' : ' +'}`),
    '',
  ].join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  writeFileSync(OUT, await briefModule());
  process.stdout.write(`wrote ${OUT}\n`);
  mkdirSync(dirname(WORDMARK_OUT), { recursive: true });
  writeFileSync(WORDMARK_OUT, wordmarkModule());
  process.stdout.write(`wrote ${WORDMARK_OUT}\n`);
}
