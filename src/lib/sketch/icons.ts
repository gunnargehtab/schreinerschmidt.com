// UI icons (docs/design-system.md §3): 24 px viewBox at stroke 1.5, one path each, no fills.
// Hand-tuned rather than rough.js: at 24 px, wobble only reads as blur. The hand shows in round
// caps, open shapes and strokes that stop short of each other. Rendered by components/ui/Icon.astro.
// `menu`, `chevron-down` and `phone` match the inline icons in the Phase 1 layout components.

export const ICONS = {
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z',
  mail: 'M3.5 6.5h17v11h-17zM3.5 7l8.5 6.5L20.5 7',
  'map-pin':
    'M12 21.5S5.5 15.3 5.5 10a6.5 6.5 0 0 1 13 0c0 5.3-6.5 11.5-6.5 11.5zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5.5l3.5 2',
  'arrow-right': 'M4 12h15.5M13.5 6l6 6-6 6',
  'arrow-left': 'M20 12H4.5M10.5 6l-6 6 6 6',
  'chevron-down': 'M6 9.5l6 6 6-6',
  'chevron-up': 'M6 14.5l6-6 6 6',
  close: 'M6 6l12 12M18 6 6 18',
  menu: 'M4 7.5h16M4 12h16M4 16.5h16',
  external: 'M14 4h6v6M20 4l-9 9M18 13.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5.5',
  check: 'M4.5 12.5l5 5L19.5 7',
  star: 'M12 3.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.8l6.1-.7z',
  play: 'M7.5 4.5v15l12-7.5z',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4',
  moon: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z',
  monitor: 'M3.5 5h17v11h-17zM8.5 20h7M12 16v4',
  /* Theme trigger: a disc, one half hatched, the way the sketches shade. */
  contrast: 'M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 4v16M12 4l8 8M12 8l7.3 7.3M12 12l5.7 5.7M12 16l3.3 3.3',
  /* Configurator project types (docs/configurator.md §1): elevation sketches, one per radio card.
     Rendered with square caps (carpenter's pencil) by configurator/fields/RadioCards.astro. */
  'projekt-moebel': 'M3.5 4h13v16h-13zM10 4v16M8 11.5v1.5M10 9.5h6.5M10 15h6.5M16.5 4l4.5 2.5v13L16.5 20',
  'projekt-boden':
    'M3 8.5l4.5-4.5 4.5 4.5 4.5-4.5 4.5 4.5M3 14.5l4.5-4.5 4.5 4.5 4.5-4.5 4.5 4.5M3 20.5l4.5-4.5 4.5 4.5 4.5-4.5 4.5 4.5',
  'projekt-treppe': 'M3 20.5h4.5V16H12v-4.5h4.5V7H21M5 15l9.5-9.5M5 15v4',
  'projekt-fenster': 'M4.5 3.5h15v15h-15zM12 3.5v15M4.5 11h15M3 20.5h18',
  'projekt-tuer': 'M6 20.5v-16h12v16M3.5 20.5h17M6 8h12M9 17.5V11h6v6.5M16.5 13.5v1.5',
  'projekt-terrasse':
    'M5.5 17V7.5l2-2.5 2 2.5V17M13.5 17V7.5l2-2.5 2 2.5V17M3 12h2.5M9.5 12h4M17.5 12H21M3 17h18M3 20.5h18',
  'projekt-altbau': 'M5 20.5V10.5a7 7 0 0 1 14 0v10M8.5 20.5V11a3.5 3.5 0 0 1 7 0v9.5M3 20.5h18',
  'projekt-sonstiges': 'M4.5 19.5l1-4L16 5l3 3L8.5 18.5zM14 7l3 3M5.5 15.5l3 3',
} as const;

export type IconName = keyof typeof ICONS;

export const ICON_NAMES = Object.keys(ICONS) as IconName[];

export function isIconName(name: string): name is IconName {
  return Object.hasOwn(ICONS, name);
}
