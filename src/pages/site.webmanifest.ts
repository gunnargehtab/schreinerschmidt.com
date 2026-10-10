// Web app manifest, served from an endpoint so start_url, scope and icon paths follow the base path.
// The icons are placeholders (scripts/make-icons.mjs) until a vector logo exists (owner-checklist).
import type { APIRoute } from 'astro';
import { asset, url } from '../lib/url';

export const GET: APIRoute = () => {
  const manifest = {
    name: 'Schreinerei Schmidt Mannheim',
    short_name: 'Schreinerei Schmidt',
    description: 'Schreinerei in Mannheim: Möbel, Böden, Treppen und Türen nach Maß.',
    lang: 'de',
    dir: 'ltr',
    start_url: url(),
    scope: url(),
    display: 'browser',
    background_color: '#FFFBF5',
    theme_color: '#FFFBF5',
    icons: [
      { src: asset('icon-192.png'), sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: asset('icon-512.png'), sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };
  return new Response(JSON.stringify(manifest, null, 2), {
    headers: { 'Content-Type': 'application/manifest+json' },
  });
};
