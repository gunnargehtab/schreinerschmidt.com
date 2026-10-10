// Types of the 3D viewer (docs/configurator.md §4). The viewer chunk is import()ed by
// preview/load3d.ts only; nothing outside viewer3d/ may import three.js.
import type { Build, Species } from '../../../lib/configurator/furniture/types';

/** Value of `data-viewer-state` on `[data-viewer]` (set by preview/load3d.ts). */
export type ViewerState = 'unsupported' | 'loading' | 'ready' | 'failed' | 'lost';

/** Camera presets of the view buttons (`data-view`). */
export type ViewPreset = 'vorne' | 'seite' | 'dreiviertel' | 'oben';

export type Tier = 'low' | 'high';

/** Quality tier (§4.4 "Quality tiers", §4.13): pixel ratio and texture sizes. */
export interface Quality {
  tier: Tier;
  dpr: number;
  albedo: 512 | 1024;
  normal: boolean;
}

export interface ViewerInit {
  /** The probed canvas and its WebGL2 context (§4.9: nothing downloads without one). */
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext;
  /** `[data-viewer]`: receives the canvas and the dimension overlay. */
  host: HTMLElement;
  /** The view-button group (`[data-view-controls]`), or null. */
  controls: HTMLElement | null;
  /** „Holzbild beispielhaft“ note (`[data-viewer-note]`), shown for Kernbuche, or null. */
  note: HTMLElement | null;
  build: Build;
  /** German sentence of a Build (describe()); the canvas label is `label + ': ' + describe(build)`. */
  describe: (b: Build) => string;
  label: string;
  /** Average albedo of a species as sRGB hex (SPECIES[].avgColor): the first-frame colour. */
  colour: (s: Species) => string;
  /** The WebGL context was lost: the caller disposes the viewer and falls back to the drawing. */
  onLost: () => void;
}

export interface Viewer {
  /** A new Build of the same furniture (parameter change): diffed by part id, textures follow. */
  update(b: Build): void;
  view(preset: ViewPreset): void;
  /** Azimuth in 15° steps (negative = left). */
  rotate(steps: number): void;
  /** Distance × factor, within the OrbitControls limits. */
  zoom(factor: number): void;
  reset(): void;
  /** §4.12: the 3/4 preset on paper as WebP (PNG fallback); null when the canvas cannot be read. */
  snapshot(): Promise<Blob | null>;
  dispose(): void;
}
