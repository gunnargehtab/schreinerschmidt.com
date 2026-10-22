// Production bundle (docs/angebot.md §2): one ESM file that inlines the shared configurator code
// from ../src (fields, conditions, service area, pricing, furniture generators). npm packages stay
// external and come from `npm ci --omit=dev` on the host.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/server.ts'],
  outfile: 'dist/server.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  packages: 'external',
  sourcemap: true,
  legalComments: 'none',
  logLevel: 'info',
});
