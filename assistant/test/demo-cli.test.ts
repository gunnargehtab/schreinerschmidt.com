// Smoke test of `npm run demo` (phase 7f): the CLI writes index.html and one folder per fixture into
// DATA_DIR/demo, wiping what was there; `--live` never calls the API without a key and `--yes`.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ordnerName } from '../eval/demo/lauf';
import { FAELLE } from '../eval/fixtures/faelle';
import { cleanupDirs, tempDir } from './helpers';

afterAll(() => cleanupDirs());

const TSX = join(import.meta.dirname, '..', 'node_modules', '.bin', 'tsx');
const CLI = join(import.meta.dirname, '..', 'eval', 'demo.mts');

function demo(args: string[], env: Record<string, string>) {
  const { ANTHROPIC_API_KEY: _k, DATA_DIR: _d, ...rest } = process.env;
  return spawnSync(TSX, [CLI, ...args], {
    cwd: join(import.meta.dirname, '..'),
    env: { ...rest, ...env },
    encoding: 'utf8',
    timeout: 120_000,
  });
}

describe('npm run demo (CLI)', () => {
  it('writes index.html and the case folders into DATA_DIR/demo', () => {
    const data = tempDir();
    mkdirSync(join(data, 'demo'), { recursive: true });
    writeFileSync(join(data, 'demo', 'alt.txt'), 'from an earlier run');
    const r = demo(['--ohne-bilder'], { DATA_DIR: data });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('§11-Bar: bestanden.');
    expect(r.stdout).toContain('Empfehlung wie erwartet: 24 / 24');
    const out = join(data, 'demo');
    expect(existsSync(join(out, 'index.html'))).toBe(true);
    expect(existsSync(join(out, 'alt.txt'))).toBe(false);
    const ordner = readdirSync(out).filter((n) => n.startsWith('fall-'));
    expect(ordner.sort()).toEqual(FAELLE.map((f, i) => ordnerName(i + 1, f)).sort());
    // The run's store and outbox are temporary: nothing else lands in DATA_DIR.
    expect(readdirSync(data)).toEqual(['demo']);
  }, 120_000);

  it('--live needs a key, and with a key it stops at the cost estimate without --yes', () => {
    const data = tempDir();
    const ohne = demo(['--live'], { DATA_DIR: data });
    expect(ohne.status).toBe(2);
    expect(ohne.stdout).toContain('ANTHROPIC_API_KEY fehlt');
    const mit = demo(['--live'], { DATA_DIR: data, ANTHROPIC_API_KEY: 'sk-ant-test-not-a-key' });
    expect(mit.status).toBe(2);
    expect(mit.stdout).toContain('Geschätzte Kosten');
    expect(mit.stdout).toContain('--live --yes');
    expect(readdirSync(data)).toEqual([]);
  }, 60_000);
});
