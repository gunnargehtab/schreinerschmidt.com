// Texture pipeline (scripts/textures/prepare.mjs): grain orientation, normal-map channel fix,
// a full run on synthetic images in a temp dir, and the skip-when-missing behaviour.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';

sharp.cache(false); // Windows: cached file handles block temp-dir cleanup
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SPECIES_TEXTURES } from '../../src/lib/configurator/furniture/textures';
import {
  TEXTURE_IDS,
  TEX_MM,
  detectGrainAxis,
  prepare,
  rotateNormalChannels,
  toHex,
} from '../../scripts/textures/prepare.mjs';

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
      texMm: 1000,
      files: {
        albedo1024: 'eiche/albedo-1024.webp',
        albedo512: 'eiche/albedo-512.webp',
        normal512: 'eiche/normal-512.webp',
      },
    });
    expect(manifest.eiche.avgColor).toMatch(/^#[0-9a-f]{6}$/);
    expect(readFileSync(join(outputDir, 'manifest.json'), 'utf8').endsWith('}\n')).toBe(true);
  });

  it('tints Kernbuche reddish and keeps vertical grain unrotated', async () => {
    const id = TEXTURE_IDS['kernbuche']!;
    mkdirSync(join(inputDir, id));
    const grey = Buffer.alloc(600 * 1200 * 3, 200);
    await sharp(grey, { raw: { width: 600, height: 1200, channels: 3 } }).toFile(
      join(inputDir, id, `${id}_diff_2k.png`),
    );
    await sharp(grey, { raw: { width: 600, height: 1200, channels: 3 } }).toFile(
      join(inputDir, id, `${id}_nor_gl_2k.png`),
    );
    await prepare({ inputDir, outputDir, ...quiet });
    const manifest = JSON.parse(readFileSync(join(outputDir, 'manifest.json'), 'utf8'));
    const hex: string = manifest.kernbuche.avgColor;
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    expect(r).toBeGreaterThan(g!);
    expect(g).toBeGreaterThan(b!);
    const m = await sharp(readFileSync(join(outputDir, 'kernbuche/albedo-1024.webp'))).metadata();
    expect([m.width, m.height]).toEqual([512, 1024]);
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
