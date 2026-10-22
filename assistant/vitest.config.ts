// Backend tests (docs/angebot.md §11): in-process via app.request(), a temp DATA_DIR per test.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The shared src/ files would otherwise pick up the root tsconfig, which extends Astro's and fails
  // when only assistant/ is installed (CI).
  tsconfig: './tsconfig.json',
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // node:sqlite and the temp directories are per test; forks keep native state isolated.
    pool: 'forks',
  },
});
