// Entry point of the quote wizard (docs/configurator.md §3 "Files"): core ≤ 11.25 KB gz. Astro
// bundles this module and runs it after the markup is parsed (the <script> sits in Wizard.astro).
import { init } from './controller';

const root = document.querySelector<HTMLElement>('[data-configurator]');
if (root) init(root);

export {};
