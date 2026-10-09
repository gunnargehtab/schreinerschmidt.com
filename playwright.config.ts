import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const root = dirname(fileURLToPath(import.meta.url));

// Same env as `npm run build` / `npm run serve`, unless the caller already set one.
const envFile = resolve(root, 'env/pages.env');
if (!process.env['BASE_PATH'] && existsSync(envFile)) process.loadEnvFile(envFile);

// Normalise to `/x/` (or `/`). The base contains a dot, so always navigate with relative paths.
const raw = (process.env['BASE_PATH'] ?? '/').replace(/^\/+|\/+$/g, '');
const BASE = raw ? `/${raw}/` : '/';
const PORT = Number(process.env['PORT'] ?? 4173);
const baseURL = `http://localhost:${PORT}${BASE}`;
const CI = Boolean(process.env['CI']);

// Engine-independent checks (CSP, fonts) carry this tag and run in every engine project.
const crossEngine = /@cross-engine/;
// Specs that only belong to the no-js and a11y projects.
const dedicated = ['**/*.nojs.spec.ts', '**/*.a11y.spec.ts'];

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'node scripts/serve-dist.mjs',
    url: baseURL,
    reuseExistingServer: !CI,
    timeout: 30_000,
    env: {
      ...(process.env as Record<string, string>),
      BASE_PATH: BASE === '/' ? '/' : BASE.slice(0, -1),
      PORT: String(PORT),
    },
  },
  projects: [
    // Smoke specs run everywhere; firefox and webkit only run the tagged engine checks.
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: dedicated },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, grep: crossEngine, testIgnore: dedicated },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, grep: crossEngine, testIgnore: dedicated },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testIgnore: dedicated },
    {
      name: 'no-js',
      use: { ...devices['Desktop Chrome'], javaScriptEnabled: false },
      testMatch: ['**/*.nojs.spec.ts'],
    },
    {
      name: 'a11y',
      use: { ...devices['Desktop Chrome'], reducedMotion: 'reduce' },
      testMatch: ['**/*.a11y.spec.ts'],
    },
  ],
});
