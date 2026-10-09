import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = dirname(fileURLToPath(import.meta.url));

// The dist tests need the Pages base. Load it unless the caller already set one (CI, audit build).
const envFile = resolve(root, 'env/pages.env');
if (!process.env['BASE_PATH'] && existsSync(envFile)) process.loadEnvFile(envFile);

export default defineConfig({
  resolve: { alias: { '~': resolve(root, 'src') } },
  test: {
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['tests/unit/**/*.test.ts'], environment: 'node' },
      },
      {
        extends: true,
        test: { name: 'dist', include: ['tests/dist/**/*.test.ts'], environment: 'node' },
      },
    ],
  },
});
