// Site-wide default og:image (docs/architecture.md §7). Seo.astro uses it whenever a page passes no
// `image`, so every page that is shared carries a preview. Pages with their own hero photo
// (leistungen/[key], referenzen/[slug]) override it. Legal pages, danke pages, the 404 and /intern/
// are never indexed, but a shared link should still look right, so they use the default as well.
// asset-manifest: einbauschrankwand-02, rights "own", 2400×1800; the same photo as the Home hero.
import type { ImageMetadata } from 'astro';
import photo from '../assets/projects/einbauschrankwand/02-offen.jpg';

export const DEFAULT_OG_IMAGE: { src: ImageMetadata; alt: string } = {
  src: photo,
  alt: 'Geöffnete raumhohe Schrankwand mit Eichenregalen, Schubladen und eingebautem Fernseher',
};
