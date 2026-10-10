import { describe, expect, it } from 'vitest';
import { ServiceKey } from '../../src/lib/content-schema';
import { KONFIGURATOR_TYPEN, SERVICE_TO_TYP, TYP_LABELS, konfiguratorPath } from '../../src/lib/konfigurator-links';

describe('konfigurator links', () => {
  it('maps every service key to a known configurator type', () => {
    for (const key of ServiceKey.options) expect(KONFIGURATOR_TYPEN).toContain(SERVICE_TO_TYP[key]);
  });

  it('has a label for every type', () => {
    for (const typ of KONFIGURATOR_TYPEN) expect(TYP_LABELS[typ]).toBeTruthy();
  });

  it('builds the site-relative deep link', () => {
    expect(konfiguratorPath('boeden')).toBe('konfigurator/boden/');
    expect(konfiguratorPath('tueren')).toBe('konfigurator/tuer/');
    expect(konfiguratorPath('terrassen')).toBe('konfigurator/terrasse/');
    expect(konfiguratorPath('treppen')).toBe('konfigurator/treppe/');
  });
});
