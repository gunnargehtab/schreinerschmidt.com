// The `:has()` visibility rules of the no-JS wizard form (docs/configurator.md §2 point 3) as a
// static stylesheet: dist/konfigurator/bedingungen.css. The CSP forbids inline styles, and Astro
// cannot hash a dynamically generated <style>, so the wizard links this file instead:
// <link rel="stylesheet" href={asset('konfigurator/bedingungen.css')}> (asset(), not url(): the
// path has no trailing slash). style-src 'self' allows it under the dotted base path.
import type { APIRoute } from 'astro';
import { conditionsCss } from '../../lib/configurator/conditions';

export const GET: APIRoute = () =>
  new Response(conditionsCss(), { headers: { 'Content-Type': 'text/css; charset=utf-8' } });
