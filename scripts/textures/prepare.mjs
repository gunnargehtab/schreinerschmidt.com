// Wood-texture preparation (docs/configurator.md §4.4). Reads the manually downloaded Poly Haven
// 2K diffuse + nor_gl maps from textures-src/<textureId>/ and writes the web-ready WebP set to
// src/assets/textures/<species>/ plus src/assets/textures/manifest.json.
// Usage: npm run textures   (env TEXTURES_SRC / TEXTURES_OUT override the directories)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// Duplicated from src/lib/configurator/furniture/textures.ts; tests/unit/textures-prepare.test.ts
// keeps both tables in sync. Order is the stable manifest key order.
/** @type {Record<string, string>} */
export const TEXTURE_IDS = {
  eiche: 'oak_veneer_01',
  nussbaum: 'european_walnut_veneer_04',
  esche: 'ash_veneer',
  kernbuche: 'white_maple_veneer',
  kirsche: 'cherry_veneer',
};

// Real-world edge length of one texture tile in mm: the `dimensions` of each asset in the Poly Haven
// API (api.polyhaven.com/info/<id>, checked 2026-10-10).
export const DEFAULT_TEX_MM = 1000;
/** @type {Record<string, number>} */
export const TEX_MM = {
  oak_veneer_01: 1830,
  european_walnut_veneer_04: 1000,
  ash_veneer: 1000,
  white_maple_veneer: 1000,
  cherry_veneer: 1000,
};

// Per-species albedo calibration (docs/configurator.md §4.4). The Poly Haven scans are unfinished,
// light veneers with very flat tonal ranges (walnut p1–p99 spans ~15 of 255 levels), so each one is
// adjusted with ONE per-channel linear op on the sRGB values:
//   out = mul × (mean + (in − mean) × contrast)
// `mean` is the measured per-channel mean of the source, so `contrast` spreads the grain around the
// scan's own tone and `mul` then sets the species colour. Raw data flow only: no hand-painted
// textures. The seeded Kernbuche heart overlay is added at runtime by the viewer, not here.
//
// Calibrated 2026-10-10 against the source means (Eiche 161/126/87, Nussbaum 170/137/111,
// Esche 172/148/125, white maple 227/212/185, Kirsche 224/176/132):
/** @typedef {{ mul: [number, number, number]; contrast: number }} Adjust */
/** @type {Record<string, Adjust>} */
export const SPECIES_ADJUST = {
  // Oak veneer reads as oak as scanned; kept 1:1.
  eiche: { mul: [1, 1, 1], contrast: 1 }, // needs-review: calibrate against the owner's samples
  // The walnut scan is a pale, unfinished veneer (mean 170/137/111). Oiled European walnut is a
  // deep chocolate brown: darken to ≈ 102/73/54 and stretch the faint streaks ×2.2.
  nussbaum: { mul: [0.6, 0.53, 0.49], contrast: 2.2 }, // needs-review: calibrate against the owner's samples
  // Ash: a small lift towards the pale cream of oiled ash and a little more grain; otherwise the scan.
  esche: { mul: [1.08, 1.08, 1.05], contrast: 1.3 }, // needs-review: calibrate against the owner's samples
  // No CC0 Kernbuche scan: white maple becomes the pale pinkish-beige of steamed beech
  // (≈ 222/193/165); the reddish heart streaks come from the viewer's overlay.
  kernbuche: { mul: [0.98, 0.91, 0.89], contrast: 1.6 }, // needs-review: calibrate against the owner's samples
  // The cherry scan is light and orange (224/176/132); oiled cherry is a deeper, less saturated
  // red-brown (≈ 161/111/87), clearly apart from Kernbuche.
  kirsche: { mul: [0.72, 0.63, 0.66], contrast: 1.8 }, // needs-review: calibrate against the owner's samples
};
/** @type {Adjust} */
export const IDENTITY_ADJUST = { mul: [1, 1, 1], contrast: 1 };

/**
 * Coefficients for sharp's `linear(a, b)` (out = a × in + b, per channel, sRGB 0–255):
 * a = mul × contrast, b = mul × mean × (1 − contrast).
 * @param {Adjust} adjust
 * @param {[number, number, number]} mean  per-channel mean of the source (sRGB 0–255)
 * @returns {{ a: number[]; b: number[] }}
 */
export function linearCoefficients(adjust, mean) {
  const { mul, contrast } = adjust;
  return {
    a: mul.map((m) => m * contrast),
    b: mul.map((m, i) => m * (mean[i] ?? 0) * (1 - contrast)),
  };
}

export const BUDGET_KB = { albedo1024: 160, albedo512: 50 };

const EXTS = ['jpg', 'jpeg', 'png'];

/**
 * Grain runs along the axis with the LOWER mean absolute gradient (along the grain the pixel
 * values barely change). Input: 8-bit greyscale raw buffer. Returns 'x' (grain horizontal, needs
 * rotation) or 'y' (grain vertical, the target).
 * @param {Uint8Array} grey
 * @param {number} width
 * @param {number} height
 * @returns {'x' | 'y'}
 */
export function detectGrainAxis(grey, width, height) {
  let gx = 0;
  let gy = 0;
  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width - 1; x++) {
      const i = y * width + x;
      gx += Math.abs((grey[i + 1] ?? 0) - (grey[i] ?? 0));
      gy += Math.abs((grey[i + width] ?? 0) - (grey[i] ?? 0));
    }
  }
  return gx < gy ? 'x' : 'y';
}

/**
 * Fix a tangent-space (OpenGL, +Y up) normal map after the IMAGE was rotated by 90 degrees.
 * Encoding: channel = (component * 0.5 + 0.5) * 255, so negation is 255 - value.
 * Rotating the image clockwise maps the in-plane vector (x, y) to (y, -x)
 * (right -> down, up -> right), hence  R' = G,  G' = 255 - R,  B unchanged.
 * Counter-clockwise maps (x, y) to (-y, x), hence  R' = 255 - G,  G' = R.
 * Operates on a raw buffer with `channels` interleaved 8-bit channels (>= 3); returns a copy.
 * @param {Uint8Array} raw
 * @param {number} channels
 * @param {'cw' | 'ccw'} [direction]
 * @returns {Buffer}
 */
export function rotateNormalChannels(raw, channels, direction = 'cw') {
  const out = Buffer.from(raw);
  for (let i = 0; i + 2 < raw.length; i += channels) {
    const r = raw[i] ?? 0;
    const g = raw[i + 1] ?? 0;
    if (direction === 'cw') {
      out[i] = g;
      out[i + 1] = 255 - r;
    } else {
      out[i] = 255 - g;
      out[i + 1] = r;
    }
  }
  return out;
}

/**
 * @param {number} r
 * @param {number} g
 * @param {number} b
 */
export function toHex(r, g, b) {
  /** @param {number} v */
  const h = (v) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/**
 * @param {string} dir
 * @param {string} base
 */
function findFile(dir, base) {
  for (const ext of EXTS) {
    const p = join(dir, `${base}.${ext}`);
    if (existsSync(p)) return p;
  }
  return null;
}

/** @param {string} file */
async function grainNeedsRotation(file) {
  const { data, info } = await sharp(file)
    .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return detectGrainAxis(data, info.width, info.height) === 'x';
}

/**
 * @param {string} species
 * @param {string} textureId
 * @param {string} inDir
 * @param {string} outDir
 */
async function processSpecies(species, textureId, inDir, outDir) {
  const diffFile = findFile(inDir, `${textureId}_diff_2k`);
  const normFile = findFile(inDir, `${textureId}_nor_gl_2k`);
  if (!diffFile || !normFile) return null;

  const rotate = await grainNeedsRotation(diffFile);

  let albedo = sharp(diffFile).removeAlpha();
  if (rotate) albedo = albedo.rotate(90);
  const adjust = SPECIES_ADJUST[species] ?? IDENTITY_ADJUST;
  if (adjust.contrast !== 1 || adjust.mul.some((m) => m !== 1)) {
    const src = await sharp(diffFile).removeAlpha().stats();
    const mean = /** @type {[number, number, number]} */ (src.channels.slice(0, 3).map((c) => c.mean));
    const { a, b } = linearCoefficients(adjust, mean);
    albedo = albedo.linear(a, b);
  }
  // Materialise once so the rotation and calibration apply before both resizes.
  const albedoPng = await albedo.png().toBuffer();

  let normal;
  if (rotate) {
    const { data, info } = await sharp(normFile).removeAlpha().rotate(90).raw().toBuffer({ resolveWithObject: true });
    normal = sharp(rotateNormalChannels(data, info.channels, 'cw'), {
      raw: { width: info.width, height: info.height, channels: info.channels },
    });
  } else {
    normal = sharp(normFile).removeAlpha();
  }

  const dir = join(outDir, species);
  mkdirSync(dir, { recursive: true });
  // No withMetadata(): sharp drops EXIF/ICC by default.
  const a1024 = await sharp(albedoPng)
    .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
  const a512 = await sharp(albedoPng)
    .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
  const n512 = await normal
    .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 90 })
    .toBuffer();
  writeFileSync(join(dir, 'albedo-1024.webp'), a1024);
  writeFileSync(join(dir, 'albedo-512.webp'), a512);
  writeFileSync(join(dir, 'normal-512.webp'), n512);

  const { channels } = await sharp(a1024).stats();
  const [cr, cg, cb] = channels.map((c) => c.mean);
  const avgColor = toHex(cr ?? 0, cg ?? 0, cb ?? 0);

  return {
    entry: {
      textureId,
      avgColor,
      texMm: TEX_MM[textureId] ?? DEFAULT_TEX_MM, // needs-review when not in TEX_MM
      files: {
        albedo1024: `${species}/albedo-1024.webp`,
        albedo512: `${species}/albedo-512.webp`,
        normal512: `${species}/normal-512.webp`,
      },
    },
    sizes: { albedo1024: a1024.length, albedo512: a512.length, normal512: n512.length },
  };
}

/**
 * Process every species whose raw files exist. Missing species are skipped with a warning.
 * An existing manifest is merged so that subset runs keep earlier species.
 * Writes nothing when no species was processed.
 */
export async function prepare({
  inputDir = process.env.TEXTURES_SRC ?? join(root, 'textures-src'),
  outputDir = process.env.TEXTURES_OUT ?? join(root, 'src/assets/textures'),
  log = console.log,
  warn = console.warn,
} = {}) {
  const processed = [];
  const skipped = [];
  const manifestPath = join(outputDir, 'manifest.json');
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
  /** @param {number} n */
  const kbOf = (n) => n / 1024;

  for (const [species, textureId] of Object.entries(TEXTURE_IDS)) {
    const from = join(inputDir, textureId);
    const res = await processSpecies(species, textureId, from, outputDir);
    if (!res) {
      warn(`skipped ${species}: raw files for ${textureId} not found in ${from}`);
      skipped.push(species);
      continue;
    }
    manifest[species] = res.entry;
    processed.push({ species, ...res });
    if (kbOf(res.sizes.albedo1024) > BUDGET_KB.albedo1024)
      warn(
        `${species}: albedo-1024 is ${kbOf(res.sizes.albedo1024).toFixed(1)} KB (budget ${BUDGET_KB.albedo1024} KB)`,
      );
    if (kbOf(res.sizes.albedo512) > BUDGET_KB.albedo512)
      warn(`${species}: albedo-512 is ${kbOf(res.sizes.albedo512).toFixed(1)} KB (budget ${BUDGET_KB.albedo512} KB)`);
  }

  if (processed.length > 0) {
    /** @type {Record<string, unknown>} */
    const ordered = {};
    for (const species of Object.keys(TEXTURE_IDS)) {
      if (manifest[species]) ordered[species] = manifest[species];
    }
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(manifestPath, `${JSON.stringify(ordered, null, 2)}\n`);

    /** @param {number} n */
    const kb = (n) => `${kbOf(n).toFixed(1)} KB`.padStart(11);
    log('species      albedo-1024   albedo-512   normal-512   avgColor');
    for (const p of processed) {
      log(
        `${p.species.padEnd(12)} ${kb(p.sizes.albedo1024)}  ${kb(p.sizes.albedo512)}  ${kb(p.sizes.normal512)}   ${p.entry.avgColor}`,
      );
    }
    log('\nHint: copy these avgColor values into src/lib/configurator/furniture/species.ts:');
    for (const p of processed) log(`  ${p.species}: ${p.entry.avgColor}`);
  } else {
    log('No raw textures found; nothing written. See textures-src/SOURCES.md.');
  }
  return { processed: processed.map((p) => p.species), skipped };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  prepare().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
