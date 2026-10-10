// Texture pipeline (scripts/textures/prepare.mjs): grain orientation, normal-map channel fix,
// a full run on synthetic images in a temp dir, and the skip-when-missing behaviour.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';

sharp.cache(false); // Windows: cached file handles block temp-dir cleanup
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SPECIES } from '../../src/lib/configurator/furniture/species';
import { SPECIES_TEXTURES } from '../../src/lib/configurator/furniture/textures';
import {
  IDENTITY_ADJUST,
  SPECIES_ADJUST,
  TEXTURE_IDS,
  TEX_MM,
  detectGrainAxis,
  linearCoefficients,
  prepare,
  rotateNormalChannels,
  toHex,
} from '../../scripts/textures/prepare.mjs';

const ROOT = new URL('../../', import.meta.url);
const hexToRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];

/** Greyscale stripes: `vertical` = stripes run along y (value changes along x). */
function stripes(size: number, vertical: boolean): Buffer {
  const buf = Buffer.alloc(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) buf[y * size + x] = ((vertical ? x : y) % 2) * 200 + 20;
  return buf;
}

/** RGB PNG with grain stripes; `grain` is the direction the stripes run in. */
function stripePng(w: number, h: number, grain: 'x' | 'y'): Promise<Buffer> {
  const raw = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = (((grain === 'y' ? x : y) >> 1) % 2) * 120 + 90;
      const i = (y * w + x) * 3;
      raw[i] = v;
      raw[i + 1] = v - 20;
      raw[i + 2] = v - 40;
    }
  }
  return sharp(raw, { raw: { width: w, height: h, channels: 3 } })
    .png()
    .toBuffer();
}

describe('detectGrainAxis', () => {
  it('reports the axis with the lower gradient', () => {
    expect(detectGrainAxis(stripes(32, true), 32, 32)).toBe('y'); // vertical grain, keep
    expect(detectGrainAxis(stripes(32, false), 32, 32)).toBe('x'); // horizontal grain, rotate
  });
});

describe('rotateNormalChannels', () => {
  // Encoded components: 255 = +1, 0 = -1, 128 = ~0 (negated: 127).
  const right = Buffer.from([255, 128, 255]); // normal tilted towards +X (right)
  const up = Buffer.from([128, 255, 255]); // tilted towards +Y (image top)

  it('clockwise: right becomes down, up becomes right', () => {
    expect([...rotateNormalChannels(right, 3, 'cw')]).toEqual([128, 0, 255]);
    expect([...rotateNormalChannels(up, 3, 'cw')]).toEqual([255, 127, 255]);
  });

  it('counter-clockwise: right becomes up, up becomes left', () => {
    expect([...rotateNormalChannels(right, 3, 'ccw')]).toEqual([127, 255, 255]);
    expect([...rotateNormalChannels(up, 3, 'ccw')]).toEqual([0, 128, 255]);
  });

  it('keeps B and extra channels and does not mutate the input', () => {
    const px = Buffer.from([10, 20, 30, 40]);
    expect([...rotateNormalChannels(px, 4, 'cw')]).toEqual([20, 245, 30, 40]);
    expect([...px]).toEqual([10, 20, 30, 40]);
  });

  it('matches sharp rotate(90), which is clockwise', async () => {
    // 2x1 image: left pixel tilts right, right pixel tilts up. After a clockwise turn the left
    // pixel ends up on top.
    const src = Buffer.concat([right, up]);
    const { data, info } = await sharp(src, { raw: { width: 2, height: 1, channels: 3 } })
      .rotate(90)
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([1, 2]);
    expect([...rotateNormalChannels(data, 3, 'cw')]).toEqual([128, 0, 255, 255, 127, 255]);
  });
});

describe('toHex', () => {
  it('formats and clamps sRGB values', () => {
    expect(toHex(0, 128, 255)).toBe('#0080ff');
    expect(toHex(300.4, -5, 15.6)).toBe('#ff0010');
  });
});

describe('texture id table', () => {
  it('matches src/lib/configurator/furniture/textures.ts', () => {
    const fromSource = Object.fromEntries(Object.entries(SPECIES_TEXTURES).map(([k, v]) => [k, v.textureId]));
    expect(TEXTURE_IDS).toEqual(fromSource);
    expect(Object.keys(TEXTURE_IDS)).toEqual(Object.keys(SPECIES_TEXTURES));
    for (const id of Object.values(TEXTURE_IDS)) expect(TEX_MM).toHaveProperty(id);
  });
});

describe('species calibration table', () => {
  it('has a sane adjustment for every species', () => {
    expect(Object.keys(SPECIES_ADJUST)).toEqual(Object.keys(TEXTURE_IDS));
    for (const a of Object.values(SPECIES_ADJUST)) {
      expect(a.mul).toHaveLength(3);
      for (const m of a.mul) expect(m).toBeGreaterThan(0.3);
      for (const m of a.mul) expect(m).toBeLessThan(1.3);
      expect(a.contrast).toBeGreaterThanOrEqual(1);
      expect(a.contrast).toBeLessThanOrEqual(3);
    }
    expect(SPECIES_ADJUST['eiche']).toEqual(IDENTITY_ADJUST);
  });

  it('keeps Nussbaum dark, Kernbuche pale and Kirsche redder than Kernbuche', () => {
    // Source means from the Poly Haven scans (prepare.mjs header comment).
    const tone = (species: string, mean: [number, number, number]) =>
      SPECIES_ADJUST[species]!.mul.map((m, i) => m * mean[i]!) as [number, number, number];
    const nuss = tone('nussbaum', [170, 137, 111]);
    const kern = tone('kernbuche', [227, 212, 185]);
    const kirs = tone('kirsche', [224, 176, 132]);
    expect(nuss[0]).toBeLessThan(120);
    expect(nuss[0]).toBeGreaterThan(nuss[1]);
    expect(nuss[1]).toBeGreaterThan(nuss[2]);
    expect(kern[0]).toBeGreaterThan(205); // pale beech base; the heart comes from the viewer
    expect(kern[0] - kern[2]).toBeLessThan(80); // beige, not orange
    expect(kirs[0] - kirs[2]).toBeGreaterThan(60); // saturated red-brown
    expect(kirs[1]).toBeLessThan(kern[1] - 40); // clearly apart from Kernbuche
  });

  it('linearCoefficients: contrast pivots on the mean, mul scales both terms', () => {
    expect(linearCoefficients(IDENTITY_ADJUST, [100, 150, 200])).toEqual({ a: [1, 1, 1], b: [0, 0, 0] });
    const { a, b } = linearCoefficients({ mul: [0.5, 1, 2], contrast: 2 }, [100, 100, 100]);
    expect(a).toEqual([1, 2, 4]);
    expect(b).toEqual([-50, -100, -200]);
    // The mean maps to mul × mean, a value above it spreads away from the mean.
    expect(a[0]! * 100 + b[0]!).toBe(50);
    expect(a[0]! * 110 + b[0]!).toBe(60);
  });
});

describe('committed textures', () => {
  const dir = new URL('src/assets/textures/', ROOT);
  const manifestFile = new URL('manifest.json', dir);
  const present = existsSync(manifestFile);

  it.skipIf(!present)(
    'manifest lists every species, its files exist, and their average colour is in species.ts',
    async () => {
      const manifest = JSON.parse(readFileSync(manifestFile, 'utf8')) as Record<
        string,
        { textureId: string; avgColor: string; texMm: number; files: Record<string, string> }
      >;
      expect(Object.keys(manifest)).toEqual(Object.keys(TEXTURE_IDS));
      for (const [species, entry] of Object.entries(manifest)) {
        expect(entry.textureId).toBe(TEXTURE_IDS[species]);
        expect(entry.texMm).toBe(TEX_MM[entry.textureId]);
        expect(entry.avgColor.toUpperCase()).toBe(SPECIES[species as keyof typeof SPECIES].avgColor);
        for (const file of Object.values(entry.files)) expect(existsSync(new URL(file, dir)), file).toBe(true);
      }
    },
  );

  it.skipIf(!present)('WebP files carry no EXIF, ICC or XMP and keep a vertical grain aspect', async () => {
    const manifest = JSON.parse(readFileSync(manifestFile, 'utf8')) as Record<
      string,
      { files: Record<string, string> }
    >;
    for (const entry of Object.values(manifest)) {
      for (const [key, file] of Object.entries(entry.files)) {
        const m = await sharp(readFileSync(new URL(file, dir))).metadata();
        expect(m.format, file).toBe('webp');
        expect(m.exif, file).toBeUndefined();
        expect(m.icc, file).toBeUndefined();
        expect(m.xmp, file).toBeUndefined();
        const edge = key === 'albedo1024' ? 1024 : 512;
        expect(Math.max(m.width ?? 0, m.height ?? 0), file).toBeLessThanOrEqual(edge);
      }
    }
  });

  it.skipIf(!present)('a species × tier download stays within the §4.13 texture budget', () => {
    const manifest = JSON.parse(readFileSync(manifestFile, 'utf8')) as Record<
      string,
      { files: Record<string, string> }
    >;
    const size = (file: string) => statSync(new URL(file, dir)).size / 1024;
    for (const entry of Object.values(manifest)) {
      expect(size(entry.files['albedo1024']!) + size(entry.files['normal512']!)).toBeLessThanOrEqual(260);
      expect(size(entry.files['albedo512']!)).toBeLessThanOrEqual(50);
    }
  });
});

describe('prepare', () => {
  let dir: string;
  let inputDir: string;
  let outputDir: string;
  const quiet = { log: () => {}, warn: () => {} };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'textures-'));
    inputDir = join(dir, 'in');
    outputDir = join(dir, 'out');
    mkdirSync(inputDir);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5 }));

  it('skips species without raw files and writes nothing', async () => {
    const warnings: string[] = [];
    const res = await prepare({
      inputDir,
      outputDir,
      log: () => {},
      warn: (m: string) => warnings.push(m),
    });
    expect(res.processed).toEqual([]);
    expect(res.skipped).toEqual(Object.keys(TEXTURE_IDS));
    expect(warnings).toHaveLength(5);
    expect(existsSync(outputDir)).toBe(false);
  });

  it('processes a subset: rotates horizontal grain, writes webp files and the manifest', async () => {
    const id = TEXTURE_IDS['eiche']!;
    mkdirSync(join(inputDir, id));
    // 1200x600 with horizontal grain -> rotated to 600x1200, then scaled down.
    await sharp(await stripePng(1200, 600, 'x')).toFile(join(inputDir, id, `${id}_diff_2k.png`));
    const normal = Buffer.alloc(1200 * 600 * 3, 128);
    await sharp(normal, { raw: { width: 1200, height: 600, channels: 3 } }).toFile(
      join(inputDir, id, `${id}_nor_gl_2k.jpg`),
    );

    const res = await prepare({ inputDir, outputDir, ...quiet });
    expect(res.processed).toEqual(['eiche']);

    const a1024 = await sharp(readFileSync(join(outputDir, 'eiche/albedo-1024.webp'))).metadata();
    const a512 = await sharp(readFileSync(join(outputDir, 'eiche/albedo-512.webp'))).metadata();
    const n512 = await sharp(readFileSync(join(outputDir, 'eiche/normal-512.webp'))).metadata();
    expect([a1024.width, a1024.height]).toEqual([512, 1024]);
    expect([a512.width, a512.height]).toEqual([256, 512]);
    expect([n512.width, n512.height]).toEqual([256, 512]);
    for (const m of [a1024, a512, n512]) {
      expect(m.exif).toBeUndefined();
      expect(m.icc).toBeUndefined();
      expect(m.format).toBe('webp');
    }

    const manifest = JSON.parse(readFileSync(join(outputDir, 'manifest.json'), 'utf8'));
    expect(Object.keys(manifest)).toEqual(['eiche']);
    expect(manifest.eiche).toMatchObject({
      textureId: 'oak_veneer_01',
      texMm: 1830,
      files: {
        albedo1024: 'eiche/albedo-1024.webp',
        albedo512: 'eiche/albedo-512.webp',
        normal512: 'eiche/normal-512.webp',
      },
    });
    expect(manifest.eiche.avgColor).toMatch(/^#[0-9a-f]{6}$/);
    expect(readFileSync(join(outputDir, 'manifest.json'), 'utf8').endsWith('}\n')).toBe(true);
  });

  it('applies the species adjustment (mul × mean on a flat image) and keeps vertical grain unrotated', async () => {
    const flat = Buffer.alloc(600 * 1200 * 3, 200);
    for (const species of ['kernbuche', 'nussbaum'] as const) {
      const id = TEXTURE_IDS[species]!;
      mkdirSync(join(inputDir, id));
      await sharp(flat, { raw: { width: 600, height: 1200, channels: 3 } }).toFile(
        join(inputDir, id, `${id}_diff_2k.png`),
      );
      await sharp(flat, { raw: { width: 600, height: 1200, channels: 3 } }).toFile(
        join(inputDir, id, `${id}_nor_gl_2k.png`),
      );
    }
    await prepare({ inputDir, outputDir, ...quiet });
    const manifest = JSON.parse(readFileSync(join(outputDir, 'manifest.json'), 'utf8'));
    for (const species of ['kernbuche', 'nussbaum'] as const) {
      // A flat image has no contrast to stretch, so the result is exactly mul × 200 (± WebP noise).
      const rgb = hexToRgb(manifest[species].avgColor);
      const want = SPECIES_ADJUST[species]!.mul.map((m) => Math.round(m * 200));
      for (let i = 0; i < 3; i++)
        expect(Math.abs(rgb[i]! - want[i]!), `${species} channel ${i}`).toBeLessThanOrEqual(2);
      const m = await sharp(readFileSync(join(outputDir, `${species}/albedo-1024.webp`))).metadata();
      expect([m.width, m.height]).toEqual([512, 1024]);
    }
  });

  it('stretches the grain contrast around the source mean', async () => {
    const id = TEXTURE_IDS['nussbaum']!; // contrast 2.2
    mkdirSync(join(inputDir, id));
    // Two-tone vertical stripes at 190/210: mean 200, spread ±10 → ±22 after the stretch, × mul.
    const raw = Buffer.alloc(64 * 64 * 3);
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++) raw.fill(((x >> 3) & 1) * 20 + 190, (y * 64 + x) * 3, (y * 64 + x) * 3 + 3);
    await sharp(raw, { raw: { width: 64, height: 64, channels: 3 } })
      .png()
      .toFile(join(inputDir, id, `${id}_diff_2k.png`));
    await sharp(Buffer.alloc(64 * 64 * 3, 128), { raw: { width: 64, height: 64, channels: 3 } })
      .png()
      .toFile(join(inputDir, id, `${id}_nor_gl_2k.png`));
    await prepare({ inputDir, outputDir, ...quiet });
    const { data } = await sharp(readFileSync(join(outputDir, 'nussbaum/albedo-1024.webp')))
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { mul, contrast } = SPECIES_ADJUST['nussbaum']!;
    const red = (x: number) => data[(32 * 64 + x) * 3]!;
    expect(Math.abs(red(4) - mul[0] * (200 - 10 * contrast))).toBeLessThanOrEqual(3);
    expect(Math.abs(red(12) - mul[0] * (200 + 10 * contrast))).toBeLessThanOrEqual(3);
  });

  it('CLI exits 0 with skipped warnings when nothing is present', () => {
    const r = spawnSync(process.execPath, ['scripts/textures/prepare.mjs'], {
      encoding: 'utf8',
      env: { ...process.env, TEXTURES_SRC: inputDir, TEXTURES_OUT: outputDir },
    });
    expect(r.status).toBe(0);
    expect(r.stderr).toContain('skipped eiche');
    expect(existsSync(outputDir)).toBe(false);
  });
});
