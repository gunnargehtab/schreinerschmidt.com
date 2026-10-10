// Quality tier selection (src/scripts/configurator/viewer3d/quality.ts, docs/configurator.md §4.4).
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { selectQuality } from '../../../../src/scripts/configurator/viewer3d/quality';

const gpu = 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)';

describe('selectQuality', () => {
  it('high tier: DPR ≤ 2, 1K albedo with a normal map', () => {
    expect(selectQuality({ saveData: false, deviceMemory: 8, renderer: gpu, dpr: 1 })).toEqual({
      tier: 'high',
      dpr: 1,
      albedo: 1024,
      normal: true,
    });
    expect(selectQuality({ saveData: false, deviceMemory: undefined, renderer: gpu, dpr: 3 }).dpr).toBe(2);
    expect(selectQuality({ saveData: false, deviceMemory: undefined, renderer: gpu, dpr: 0 }).dpr).toBe(1);
  });

  it('low tier for Save-Data, software rasterisers and ≤ 2 GB: DPR 1, 512 albedo, no normal map', () => {
    const low = { tier: 'low', dpr: 1, albedo: 512, normal: false };
    expect(selectQuality({ saveData: true, deviceMemory: 8, renderer: gpu, dpr: 2 })).toEqual(low);
    expect(selectQuality({ saveData: false, deviceMemory: 2, renderer: gpu, dpr: 2 })).toEqual(low);
    expect(
      selectQuality({
        saveData: false,
        deviceMemory: 8,
        renderer: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))',
        dpr: 2,
      }),
    ).toEqual(low);
    expect(
      selectQuality({ saveData: false, deviceMemory: 8, renderer: 'llvmpipe (LLVM 15.0.7, 256 bits)', dpr: 2 }),
    ).toEqual(low);
  });

  it('a real GPU driver through Mesa stays on the high tier', () => {
    expect(
      selectQuality({ saveData: false, deviceMemory: 8, renderer: 'Mesa Intel(R) Xe Graphics (TGL GT2)', dpr: 1 }).tier,
    ).toBe('high');
  });

  it('the tier is a pure function of its inputs', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.option(fc.double({ min: 0.25, max: 64, noNaN: true }), { nil: undefined }),
        fc.string(),
        fc.double({ min: 0, max: 4, noNaN: true }),
        (saveData, deviceMemory, renderer, dpr) => {
          const q = selectQuality({ saveData, deviceMemory, renderer, dpr });
          expect(q).toEqual(selectQuality({ saveData, deviceMemory, renderer, dpr }));
          expect(q.dpr).toBeGreaterThanOrEqual(1);
          expect(q.dpr).toBeLessThanOrEqual(2);
          if (q.tier === 'low') expect(q).toEqual({ tier: 'low', dpr: 1, albedo: 512, normal: false });
        },
      ),
    );
  });
});
