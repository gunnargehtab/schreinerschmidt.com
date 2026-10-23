// Zero-dependency static server that mimics GitHub Pages for dist/ (docs/architecture.md §4).
// - mounts dist/ (or DIST_DIR) at BASE_PATH ("/" when unset)
// - 301 to the trailing-slash URL for directories, including the bare base
// - serves dir/index.html; 404.html with status 404 for every miss
// - 405 for anything other than GET/HEAD; path-traversal guard
// Never decide "is this a file?" from extname: the base itself ends in ".com".
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

// DIST_DIR (relative to the repo) serves a variant build, e.g. env/assistant.env's assistant build.
const REPO = fileURLToPath(new URL('../', import.meta.url));
const ROOT = resolve(REPO, process.env['DIST_DIR'] || 'dist');
const PORT = Number(process.env['PORT']) || 4173;
/** @param {string} s */
const trim = (s) => s.replace(/^\/+|\/+$/g, '');
const BASE = trim(process.env['BASE_PATH'] ?? '') ? `/${trim(process.env['BASE_PATH'] ?? '')}/` : '/';

/** @type {Record<string, string>} */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ktx2': 'image/ktx2',
  '.glb': 'model/gltf-binary',
  '.pdf': 'application/pdf',
};

const COMPRESSIBLE = /^(?:text\/|application\/(?:json|xml|manifest\+json)|image\/svg\+xml)/;

/** @param {import('node:http').IncomingMessage} req */
const acceptsGzip = (req) => /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''));

/** @param {string} p */
async function statOrNull(p) {
  try {
    return await stat(p);
  } catch {
    return null;
  }
}

/**
 * True when `p` is ROOT or lies inside it.
 * @param {string} p
 */
const insideRoot = (p) => p === ROOT || p.startsWith(ROOT + sep);

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {string} file
 * @param {number} status
 * @param {number} size
 */
async function sendFile(req, res, file, status, size) {
  const type = MIME[extname(file).toLowerCase()] ?? 'application/octet-stream';
  const headers = { 'Content-Type': type, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' };
  // GitHub Pages compresses text responses; do the same so Lighthouse sees realistic transfer sizes.
  if (COMPRESSIBLE.test(type)) {
    const body = await readFile(file);
    const gzip = acceptsGzip(req);
    const payload = gzip ? gzipSync(body) : body;
    res.writeHead(status, {
      ...headers,
      Vary: 'Accept-Encoding',
      ...(gzip ? { 'Content-Encoding': 'gzip' } : {}),
      'Content-Length': payload.length,
    });
    return void res.end(req.method === 'HEAD' ? undefined : payload);
  }
  res.writeHead(status, { ...headers, 'Content-Length': size });
  if (req.method === 'HEAD') return void res.end();
  createReadStream(file).pipe(res);
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 */
async function notFound(req, res) {
  const page = join(ROOT, '404.html');
  const raw = await readFile(page).catch(() => Buffer.from('404 Not Found\n'));
  const gzip = acceptsGzip(req);
  const body = gzip ? gzipSync(raw) : raw;
  res.writeHead(404, {
    'Content-Type': (await statOrNull(page)) ? MIME['.html'] : MIME['.txt'],
    'Content-Length': body.length,
    'Cache-Control': 'no-cache',
    Vary: 'Accept-Encoding',
    ...(gzip ? { 'Content-Encoding': 'gzip' } : {}),
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {string} location
 */
function redirect(res, location) {
  res.writeHead(301, { Location: location, 'Content-Length': 0 });
  res.end();
}

const server = createServer(async (req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': MIME['.txt'] });
      return void res.end('405 Method Not Allowed\n');
    }
    const { pathname, search } = new URL(req.url ?? '/', 'http://localhost');

    // Bare base without the slash: /schreinerschmidt.com -> /schreinerschmidt.com/
    if (BASE !== '/' && pathname === BASE.slice(0, -1)) return redirect(res, BASE + search);
    if (!pathname.startsWith(BASE)) return await notFound(req, res);

    let rel;
    try {
      rel = decodeURIComponent(pathname.slice(BASE.length));
    } catch {
      return await notFound(req, res);
    }
    if (rel.includes('\0')) return await notFound(req, res);

    const target = resolve(ROOT, `.${sep}${rel}`);
    if (!insideRoot(target)) return await notFound(req, res);

    const st = await statOrNull(target);
    if (st?.isDirectory()) {
      if (!pathname.endsWith('/')) return redirect(res, `${pathname}/${search}`);
      const index = join(target, 'index.html');
      const ist = await statOrNull(index);
      if (ist?.isFile()) return sendFile(req, res, index, 200, ist.size);
      return await notFound(req, res);
    }
    if (st?.isFile() && !pathname.endsWith('/')) return sendFile(req, res, target, 200, st.size);
    return await notFound(req, res);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': MIME['.txt'] });
    res.end('500 Internal Server Error\n');
  }
});

server.listen(PORT, () => {
  console.log(`serve-dist: http://localhost:${PORT}${BASE} -> ${ROOT}`);
});

for (const signal of /** @type {const} */ (['SIGINT', 'SIGTERM'])) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
