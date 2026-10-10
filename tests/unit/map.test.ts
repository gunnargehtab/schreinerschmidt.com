import { describe, expect, it } from 'vitest';
import { MAP_POINT, mapUrl, routeUrl } from '../../src/lib/map';
import { MAP_POINT as SCRIPT_POINT } from '../../scripts/make-static-map.mjs';

describe('map links', () => {
  it('uses the same pin as the static map image', () => {
    expect(MAP_POINT).toEqual(SCRIPT_POINT);
  });

  it('builds the OSM route and map URLs from the pin (5 decimals)', () => {
    expect(routeUrl()).toBe('https://www.openstreetmap.org/directions?to=49.49074%2C8.52311');
    expect(mapUrl()).toBe('https://www.openstreetmap.org/?mlat=49.49074&mlon=8.52311#map=17/49.49074/8.52311');
    expect(routeUrl({ lat: 1, lon: 2 })).toBe('https://www.openstreetmap.org/directions?to=1.00000%2C2.00000');
  });
});
