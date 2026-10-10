// OpenStreetMap links for the static Kontakt map (components/ui/StaticMap.astro) and the
// "Route planen" button on /kontakt/. One pin, one place: links open OSM only on click.

/**
 * Pin position (needs-review: it marks the street, not house no. 33). Keep in sync with MAP_POINT
 * in scripts/make-static-map.mjs, which renders src/assets/map/kontakt.avif around this point.
 */
export const MAP_POINT = { lat: 49.4907376, lon: 8.5231086 } as const;

export interface Point {
  lat: number;
  lon: number;
}

const fixed = (n: number): string => n.toFixed(5);

/** OSM route planner with the pin as destination. */
export const routeUrl = ({ lat, lon }: Point = MAP_POINT): string =>
  `https://www.openstreetmap.org/directions?to=${encodeURIComponent(`${fixed(lat)},${fixed(lon)}`)}`;

/** OSM map centred on the pin, with a marker. */
export const mapUrl = ({ lat, lon }: Point = MAP_POINT, zoom = 17): string =>
  `https://www.openstreetmap.org/?mlat=${fixed(lat)}&mlon=${fixed(lon)}#map=${zoom}/${fixed(lat)}/${fixed(lon)}`;
