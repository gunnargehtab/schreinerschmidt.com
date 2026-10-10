# Texture sources

All textures are CC0 from [Poly Haven](https://polyhaven.com), by Jenelle van Heerden. Real-world tile size (Poly Haven `dimensions`): `oak_veneer_01` 1830 mm, the others 1000 mm. Raw downloads are not committed (see `.gitignore`); only the processed WebP files in `src/assets/textures/` are.

| Species   | Poly Haven id               | URL                                               | Licence | Files expected                                                                                 | Downloaded |
| --------- | --------------------------- | ------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------- | ---------- |
| Eiche     | `oak_veneer_01`             | https://polyhaven.com/a/oak_veneer_01             | CC0     | `oak_veneer_01_diff_2k`, `oak_veneer_01_nor_gl_2k`                                             | 2026-10-10 |
| Nussbaum  | `european_walnut_veneer_04` | https://polyhaven.com/a/european_walnut_veneer_04 | CC0     | `european_walnut_veneer_04_diff_2k`, `european_walnut_veneer_04_nor_gl_2k`                     | 2026-10-10 |
| Esche     | `ash_veneer`                | https://polyhaven.com/a/ash_veneer                | CC0     | `ash_veneer_diff_2k`, `ash_veneer_nor_gl_2k`                                                   | 2026-10-10 |
| Kernbuche | `white_maple_veneer`        | https://polyhaven.com/a/white_maple_veneer        | CC0     | `white_maple_veneer_diff_2k`, `white_maple_veneer_nor_gl_2k` (tinted; no CC0 Kernbuche exists) | 2026-10-10 |
| Kirsche   | `cherry_veneer`             | https://polyhaven.com/a/cherry_veneer             | CC0     | `cherry_veneer_diff_2k`, `cherry_veneer_nor_gl_2k`                                             | 2026-10-10 |

## How to add the files

1. Open each URL above and download the **2K Diffuse** and the **nor_gl** (OpenGL normal) map manually as JPG or PNG. Scraping is forbidden.
2. Save them as:
   - `textures-src/<textureId>/<textureId>_diff_2k.<ext>`
   - `textures-src/<textureId>/<textureId>_nor_gl_2k.<ext>`

   `<ext>` is `jpg`, `jpeg` or `png`.

3. Run `npm run textures`. Species without raw files are skipped with a warning.
4. Copy the printed `avgColor` values into `src/lib/configurator/furniture/species.ts`, enter the download date in the table above, and enter the real-world tile size of a new texture in `TEX_MM` (`scripts/textures/prepare.mjs`).
