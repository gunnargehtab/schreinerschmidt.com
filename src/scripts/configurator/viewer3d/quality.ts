// Quality tier selection (docs/configurator.md §4.4 "Quality tiers", §4.13). Pure, so
// tests/unit/configurator/viewer3d/quality.test.ts covers it without a GPU.
//
// low:  Save-Data, a software rasteriser (SwiftShader, llvmpipe, softpipe) or deviceMemory ≤ 2 GB:
//       DPR 1, 512 px albedo, no normal map.
// high: DPR ≤ 2, 1K albedo + 512 normal.
import type { Quality } from './types';

export interface QualityInput {
  saveData: boolean;
  /** navigator.deviceMemory (GB), undefined where unsupported. */
  deviceMemory: number | undefined;
  /** gl.getParameter(gl.RENDERER). */
  renderer: string;
  dpr: number;
}

const SOFTWARE = /swiftshader|llvmpipe|softpipe|software/i;

export function selectQuality(i: QualityInput): Quality {
  const low = i.saveData || SOFTWARE.test(i.renderer) || (i.deviceMemory !== undefined && i.deviceMemory <= 2);
  return low
    ? { tier: 'low', dpr: 1, albedo: 512, normal: false }
    : { tier: 'high', dpr: Math.min(Math.max(i.dpr || 1, 1), 2), albedo: 1024, normal: true };
}
