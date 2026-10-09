import { createHash } from 'node:crypto';
import type { HTMLElement } from 'node-html-parser';
import { describe, it } from 'vitest';
import { distEnvMismatch, hasDist } from './pages';

export {
  DIST,
  ROOT,
  distEnvMismatch,
  getBase,
  hasDist,
  isDemo,
  isRedirectPage,
  listFiles,
  listHtmlFiles,
  loadPages,
  metaRefreshTarget,
  parseHtml,
  sitePaths,
  stripBase,
  withBase,
  type DistPage,
} from './pages';

let mismatch: string | null | undefined;

/**
 * Like `describe`, but skipped with a clear message when dist/ has not been built, and replaced by
 * a single failing test when dist/ was built for another env (Pages vs. audit build).
 */
export function describeDist(name: string, fn: () => void): void {
  if (!hasDist) {
    describe.skip(`${name} [skipped: dist/ not found, run "npm run build" first]`, fn);
    return;
  }
  mismatch ??= distEnvMismatch();
  const problem = mismatch;
  if (problem) {
    describe(name, () => {
      it('dist/ was built for the test env', () => {
        throw new Error(problem);
      });
    });
    return;
  }
  describe(name, fn);
}

export const sha256 = (code: string): string =>
  `'sha256-${createHash('sha256').update(code, 'utf8').digest('base64')}'`;

/** Parse a CSP header/meta value into `{ directive: [sources…] }`. */
export function parseCsp(content: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const part of content.split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name) out[name.toLowerCase()] = sources;
  }
  return out;
}

export function cspOf(root: HTMLElement): Record<string, string[]> | null {
  const meta = root
    .querySelectorAll('meta')
    .find((m) => m.getAttribute('http-equiv')?.toLowerCase() === 'content-security-policy');
  return meta ? parseCsp(meta.getAttribute('content') ?? '') : null;
}
