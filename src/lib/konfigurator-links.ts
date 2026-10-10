// Deep links from the services to the configurator (docs/configurator.md §1 "Deep links"):
// `konfigurator/<typ>/` is a static variant of the wizard with the project type preselected.
// Service keys (src/content/services, plural) differ from the configurator's `typ` (singular).
import type { ServiceKey } from './content-schema';

/** Every project type the configurator knows: the 7 services plus `sonstiges`. */
export const KONFIGURATOR_TYPEN = [
  'moebel',
  'boden',
  'treppe',
  'fenster',
  'tuer',
  'terrasse',
  'altbau',
  'sonstiges',
] as const;

export type KonfiguratorTyp = (typeof KONFIGURATOR_TYPEN)[number];

export const SERVICE_TO_TYP: Record<ServiceKey, KonfiguratorTyp> = {
  moebel: 'moebel',
  boeden: 'boden',
  treppen: 'treppe',
  fenster: 'fenster',
  tueren: 'tuer',
  terrassen: 'terrasse',
  altbau: 'altbau',
};

/** Site-relative path (for `url()`) of the configurator variant for a service. */
export const konfiguratorPath = (service: ServiceKey): string => `konfigurator/${SERVICE_TO_TYP[service]}/`;

/** German names of the types, for titles of the static variants. */
export const TYP_LABELS: Record<KonfiguratorTyp, string> = {
  moebel: 'Möbel',
  boden: 'Boden',
  treppe: 'Treppe',
  fenster: 'Fenster',
  tuer: 'Tür',
  terrasse: 'Terrasse',
  altbau: 'Altbau',
  sonstiges: 'Sonstiges',
};
