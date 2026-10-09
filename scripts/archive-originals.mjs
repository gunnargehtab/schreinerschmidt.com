#!/usr/bin/env node
// Archives every original asset of the old Webflow site privately (outside git).
// Output: .cache/asset-originals/ (+ SHA256SUMS, index.json) and .cache/asset-originals.zip.
// This is archiving, not publishing: excluded/unlicensed assets are archived as well.
//
// Usage: node scripts/archive-originals.mjs [--from-site] [--force]
//   --from-site  also crawl the old site's HTML/CSS for additional CDN URLs
//   --force      re-download files that already exist

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

/**
 * One archived file as written to index.json.
 * @typedef {{ url: string, file: string, bytes?: number, contentType?: string | null, sha256?: string, fetchedAt?: string }} ArchiveRecord
 */

/**
 * Outcome of downloading one URL.
 * @typedef {{ status: 'downloaded' | 'skipped' | 'failed', record: ArchiveRecord, error?: string }} DownloadResult
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INVENTORY = path.join(ROOT, 'docs', 'content-inventory.md');
const CACHE_DIR = path.join(ROOT, '.cache');
const OUT_DIR = path.join(CACHE_DIR, 'asset-originals');
const ZIP_PATH = path.join(CACHE_DIR, 'asset-originals.zip');

const SITE_ORIGIN = 'https://www.schreinerschmidt.com';
const CDN_HOST = 'cdn.prod.website-files.com';
const CDN_BASE = `https://${CDN_HOST}/62e8c86393d73a7acebb0e1f/`;

const TIMEOUT_MS = 60_000;
const MAX_BYTES = 100 * 1024 * 1024;
const CONCURRENCY = 4;
const MEDIA_EXT = 'jpe?g|png|webp|gif|svg|avif|ico|mp4|webm|mov|m4v';
// Bare names in the inventory that carry no extension and no ID.
const BARE_NAME_HINTS = [
  'Sonnenplatze',
  'Robinie_Mocca',
  'schreiner_schmidt_terasse',
  'schreiner_schmidt_kuche',
  'schreiner_schmidt_boden',
  'schreiner_schmidt_Turen',
  'schreiner_schmidt_zu_hause',
  'Steel',
  'Admonter',
  'video_Schreiner',
  'AdobeStock',
];

const args = new Set(process.argv.slice(2));
const FROM_SITE = args.has('--from-site');
const FORCE = args.has('--force');

const hexIdRe = /^[0-9a-f]{24}_/i;
const mediaExtRe = new RegExp(`\\.(?:${MEDIA_EXT})$`, 'i');
const variantRe = /-p-\d+(?=\.[A-Za-z0-9]+$)/;

/**
 * @param {string} s
 * @returns {string}
 */
const safeDecode = (s) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/**
 * @param {unknown} err
 * @returns {string}
 */
const errorMessage = (err) => (err instanceof Error ? err.message : String(err));

/**
 * Returns the full CDN URL for a path or URL, with the -p-NNN variant suffix removed.
 * @param {string} raw
 * @returns {string | null}
 */
function normalizeCdnUrl(raw) {
  let u = raw.replace(/\\\//g, '/').replace(/&amp;/g, '&').trim();
  u = u.replace(/[?#].*$/, '');
  u = u.replace(/^(["'(]+)/, '');
  while (u.endsWith(')') && (u.match(/\)/g) || []).length > (u.match(/\(/g) || []).length) {
    u = u.slice(0, -1);
  }
  u = u.replace(/ /g, '%20');
  if (u.startsWith('//')) u = `https:${u}`;
  if (!u.startsWith(CDN_BASE)) return null;
  const name = u.slice(CDN_BASE.length);
  if (!name || name.includes('/') || !mediaExtRe.test(name)) return null;
  return CDN_BASE + name.replace(variantRe, '');
}

/**
 * @param {string} url
 * @returns {string}
 */
const fileNameOf = (url) => safeDecode(url.slice(CDN_BASE.length)).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');

// ---------------------------------------------------------------------------
// 1. Inventory extraction
// ---------------------------------------------------------------------------
/**
 * @param {string} text
 * @returns {{ urls: Set<string>, names: string[], pages: string[] }}
 */
function parseInventory(text) {
  /** @type {Set<string>} */
  const urls = new Set();
  const fullRe = new RegExp(`[0-9a-f]{24}_[^\\s\`"<>]*?\\.(?:${MEDIA_EXT})(?![A-Za-z0-9])`, 'gi');
  for (const m of text.matchAll(fullRe)) {
    const url = normalizeCdnUrl(CDN_BASE + m[0]);
    if (url) urls.add(url);
  }

  // Names that are not fully qualified: extension-bearing spans without a hex ID.
  /** @type {Set<string>} */
  const names = new Set();
  const spanRe = /`([^`\n]+)`|"([^"\n]+)"/g;
  for (const m of text.matchAll(spanRe)) {
    const span = (m[1] ?? m[2] ?? '').replace(/^…/, '').trim();
    if (mediaExtRe.test(span) && !hexIdRe.test(span) && !/^https?:|\s{2,}/.test(span)) {
      names.add(span);
    }
  }
  for (const hint of BARE_NAME_HINTS) {
    if (text.includes(hint)) names.add(hint);
  }

  /** @type {Set<string>} */
  const pages = new Set(['/']);
  for (const m of text.matchAll(/^## `(\/[^`\s]*)`/gm)) {
    if (m[1]) pages.add(m[1]);
  }
  return { urls, names: [...names], pages: [...pages] };
}

// ---------------------------------------------------------------------------
// 2. Crawl the old site (HTML/CSS only)
// ---------------------------------------------------------------------------
/**
 * @param {string} url
 * @param {string[]} allowedHosts
 * @returns {Promise<string>}
 */
async function fetchText(url, allowedHosts) {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'follow' });
  if (!allowedHosts.includes(new URL(res.url).host)) throw new Error(`redirected to ${res.url}`);
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// Names may contain literal spaces (e.g. Webflow video names), so match lazily up to the media extension.
const cdnUrlRe = new RegExp(
  `(?:https?:)?\\\\?/\\\\?/cdn\\.prod\\.website-files\\.com\\\\?/62e8c86393d73a7acebb0e1f\\\\?/[^"'<>\\n]*?\\.(?:${MEDIA_EXT})(?![A-Za-z0-9])`,
  'gi',
);

/**
 * @param {string} text
 * @param {Set<string>} into
 * @returns {void}
 */
function collectCdnUrls(text, into) {
  for (const m of text.matchAll(cdnUrlRe)) {
    const url = normalizeCdnUrl(m[0]);
    if (url) into.add(url);
  }
}

/**
 * @param {string[]} pages
 * @returns {Promise<{ found: Set<string>, warnings: string[] }>}
 */
async function crawlSite(pages) {
  /** @type {Set<string>} */
  const found = new Set();
  /** @type {Set<string>} */
  const cssUrls = new Set();
  const siteHosts = [new URL(SITE_ORIGIN).host, 'schreinerschmidt.com'];
  /** @type {string[]} */
  const warnings = [];
  for (const p of pages) {
    const pageUrl = SITE_ORIGIN + p;
    try {
      const html = await fetchText(pageUrl, siteHosts);
      collectCdnUrls(html, found);
      for (const m of html.matchAll(/<link[^>]+href=["']([^"']+\.css[^"']*)["']/gi)) {
        const href = (m[1] ?? '').replace(/&amp;/g, '&');
        if (href.startsWith(`https://${CDN_HOST}/62e8c86393d73a7acebb0e1f/`)) cssUrls.add(href);
      }
      console.log(`crawl ok   ${pageUrl}`);
    } catch (err) {
      warnings.push(`${pageUrl}: ${errorMessage(err)}`);
      console.log(`crawl FAIL ${pageUrl} (${errorMessage(err)})`);
    }
  }
  for (const css of cssUrls) {
    try {
      collectCdnUrls(await fetchText(css, [CDN_HOST]), found);
      console.log(`crawl ok   ${css}`);
    } catch (err) {
      warnings.push(`${css}: ${errorMessage(err)}`);
    }
  }
  return { found, warnings };
}

// ---------------------------------------------------------------------------
// 3. Download
// ---------------------------------------------------------------------------
/**
 * @param {string} file
 * @returns {Promise<string>}
 */
async function sha256File(file) {
  const hash = createHash('sha256');
  await pipeline(createReadStream(file), hash);
  return hash.digest('hex');
}

/**
 * @param {string} url
 * @returns {Promise<DownloadResult>}
 */
async function download(url) {
  const file = fileNameOf(url);
  const target = path.join(OUT_DIR, file);
  /** @type {ArchiveRecord} */
  const record = { url, file };

  if (!FORCE && existsSync(target)) {
    const st = await stat(target);
    return {
      status: 'skipped',
      record: {
        ...record,
        bytes: st.size,
        contentType: null,
        sha256: await sha256File(target),
        fetchedAt: st.mtime.toISOString(),
      },
    };
  }

  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'follow' });
  if (new URL(res.url).host !== CDN_HOST) return { status: 'failed', error: `redirected to ${res.url}`, record };
  if (res.status !== 200) {
    await res.body?.cancel();
    return { status: 'failed', error: `HTTP ${res.status}`, record };
  }
  const declared = Number(res.headers.get('content-length') ?? 0);
  if (declared > MAX_BYTES) {
    await res.body?.cancel();
    return { status: 'failed', error: `too large (${declared} bytes)`, record };
  }
  const body = res.body;
  if (!body) throw new Error(`empty response body for ${url}`);

  const tmp = `${target}.part`;
  const hash = createHash('sha256');
  let bytes = 0;
  const meter = new Transform({
    transform(chunk, _enc, cb) {
      bytes += chunk.length;
      if (bytes > MAX_BYTES) return cb(new Error('exceeded 100 MB cap'));
      hash.update(chunk);
      cb(null, chunk);
    },
  });
  try {
    await pipeline(
      Readable.fromWeb(/** @type {import('node:stream/web').ReadableStream} */ (body)),
      meter,
      createWriteStream(tmp),
    );
  } catch (err) {
    await rm(tmp, { force: true });
    return { status: 'failed', error: errorMessage(err), record };
  }
  await rename(tmp, target);
  return {
    status: 'downloaded',
    record: {
      ...record,
      bytes,
      contentType: res.headers.get('content-type'),
      sha256: hash.digest('hex'),
      fetchedAt: new Date().toISOString(),
    },
  };
}

/**
 * @template T, R
 * @param {T[]} items
 * @param {(item: T) => Promise<R>} worker
 * @returns {Promise<R[]>}
 */
async function runPool(items, worker) {
  /** @type {R[]} */
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await worker(/** @type {T} */ (items[i]));
      }
    }),
  );
  return results;
}

// ---------------------------------------------------------------------------
// 4. Main
// ---------------------------------------------------------------------------
/**
 * @param {string} s
 * @returns {string}
 */
const norm = (s) =>
  safeDecode(s)
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, '')
    .replace(/[\s_-]+/g, '');

async function main() {
  const inventory = parseInventory(await readFile(INVENTORY, 'utf8'));
  const urls = new Set(inventory.urls);
  console.log(
    `inventory: ${inventory.urls.size} fully-qualified URLs, ${inventory.names.length} unresolved-candidate names`,
  );

  /** @type {string[]} */
  let crawlWarnings = [];
  if (FROM_SITE) {
    const { found, warnings } = await crawlSite(inventory.pages);
    crawlWarnings = warnings;
    const before = urls.size;
    for (const u of found) urls.add(u);
    console.log(`site crawl: ${found.size} CDN URLs, ${urls.size - before} new`);
  }

  // A name counts as resolved if a known URL's filename (without ID) matches it.
  const known = [...urls].map((u) => norm(fileNameOf(u).replace(hexIdRe, '')));
  const unresolved = inventory.names.filter((n) => {
    const nn = norm(n.replace(/^…/, ''));
    return !nn || !known.some((k) => k.includes(nn) || (nn.length > 6 && nn.includes(k)));
  });

  await mkdir(OUT_DIR, { recursive: true });
  const list = [...urls].sort();
  const results = await runPool(list, async (url) => {
    try {
      const r = await download(url);
      console.log(`${r.status.padEnd(10)} ${r.record.file}${r.error ? ` (${r.error})` : ''}`);
      return r;
    } catch (err) {
      console.log(`failed     ${fileNameOf(url)} (${errorMessage(err)})`);
      return { status: 'failed', error: errorMessage(err), record: { url, file: fileNameOf(url) } };
    }
  });

  /** @type {ArchiveRecord[]} */
  const ok = results.filter((r) => r.status !== 'failed').map((r) => r.record);
  ok.sort((a, b) => a.file.localeCompare(b.file));
  await writeFile(path.join(OUT_DIR, 'SHA256SUMS'), ok.map((r) => `${r.sha256}  ${r.file}`).join('\n') + '\n');
  await writeFile(path.join(OUT_DIR, 'index.json'), JSON.stringify(ok, null, 2) + '\n');

  /**
   * @param {string} s
   * @returns {number}
   */
  const count = (s) => results.filter((r) => r.status === s).length;
  const failed = results.filter((r) => r.status === 'failed');
  const totalBytes = ok.reduce((n, r) => n + (r.bytes ?? 0), 0);

  let zipInfo = 'not created';
  try {
    await rm(ZIP_PATH, { force: true });
    // Prefer Windows' bsdtar: GNU tar (e.g. from Git Bash) cannot write zip archives.
    const tar =
      process.platform === 'win32' ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
    execFileSync(tar, ['-a', '-c', '-f', ZIP_PATH, '-C', CACHE_DIR, 'asset-originals'], { stdio: 'pipe' });
    zipInfo = `${path.relative(ROOT, ZIP_PATH)} (${(await stat(ZIP_PATH)).size} bytes)`;
  } catch (err) {
    zipInfo = `FAILED: ${errorMessage(err).split('\n')[0]}`;
  }

  console.log('\n--- summary ---');
  console.log(`downloaded: ${count('downloaded')}`);
  console.log(`skipped:    ${count('skipped')}`);
  console.log(`failed:     ${failed.length}`);
  for (const f of failed) console.log(`  - ${f.record.file}: ${f.error}`);
  console.log(`unresolved names (${unresolved.length}):`);
  for (const n of unresolved) console.log(`  - ${n}`);
  if (crawlWarnings.length) {
    console.log('crawl warnings:');
    for (const w of crawlWarnings) console.log(`  - ${w}`);
  }
  console.log(`total bytes: ${totalBytes} (${(totalBytes / 1024 / 1024).toFixed(1)} MiB)`);
  console.log(`zip: ${zipInfo}`);
  if (failed.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
