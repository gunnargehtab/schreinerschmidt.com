// Service-area tiers (docs/configurator.md §1 "Service areas"; owner to confirm).
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { SERVICE_MESSAGE, serviceArea } from '../../../src/lib/configurator/service-area';

describe('serviceArea', () => {
  it('68161 → kern, 69117 → region, 10115 → außerhalb', () => {
    expect(serviceArea('68161')).toEqual({ tier: 'kern', message: 'Die Adresse liegt in unserem Einzugsgebiet.' });
    expect(serviceArea('69117')).toEqual({ tier: 'region', message: 'Rhein-Neckar – Anfahrt nach Absprache.' });
    expect(serviceArea('10115')).toEqual({
      tier: 'aussen',
      message: 'Außerhalb unseres üblichen Gebiets – fragen Sie gern trotzdem.',
    });
  });

  it('covers Mannheim and Ludwigshafen ranges, 67/68/69 as region, and tolerates whitespace', () => {
    expect(serviceArea('68159')?.tier).toBe('kern');
    expect(serviceArea('68309')?.tier).toBe('kern');
    expect(serviceArea('67059')?.tier).toBe('kern');
    expect(serviceArea('67071')?.tier).toBe('kern');
    expect(serviceArea('68310')?.tier).toBe('region');
    expect(serviceArea('67072')?.tier).toBe('region');
    expect(serviceArea(' 68161 ')?.tier).toBe('kern');
    expect(serviceArea('70173')?.tier).toBe('aussen');
  });

  it('returns null for anything that is not five digits', () => {
    expect(serviceArea('')).toBeNull();
    expect(serviceArea('6816')).toBeNull();
    expect(serviceArea('68161a')).toBeNull();
    expect(serviceArea('D-68161')).toBeNull();
  });

  it('classifies every five-digit code into exactly one tier with its message', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 99999 }), (n) => {
        const plz = String(n).padStart(5, '0');
        const r = serviceArea(plz)!;
        expect(['kern', 'region', 'aussen']).toContain(r.tier);
        expect(r.message).toBe(SERVICE_MESSAGE[r.tier]);
        if (r.tier === 'kern') expect(/^6[78]/.test(plz)).toBe(true);
        if (!/^6[789]/.test(plz)) expect(r.tier).toBe('aussen');
      }),
    );
  });
});
