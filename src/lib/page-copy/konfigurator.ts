// Schema for src/content/pages/konfigurator.yaml (/konfigurator/ and /konfigurator/[typ]/).
// Wizard shell microcopy only: field labels, option labels, validation and service-area messages live in
// src/lib/configurator/* and src/scripts/configurator/messages.de.ts.
import { z } from 'astro/zod';
import { pageSeo, reviewable } from './index';

/** One line per project type (docs/configurator.md §1, step 1 values). */
const perBranch = z.object({
  moebel: z.string(),
  boden: z.string(),
  treppe: z.string(),
  fenster: z.string(),
  tuer: z.string(),
  terrasse: z.string(),
  altbau: z.string(),
  sonstiges: z.string(),
});

const sharedStep = z.object({ title: z.string(), intro: z.string() });

/** Steps 2 and 3 have a Möbel-specific title and a per-branch intro line. */
const branchStep = sharedStep.extend({ titleMoebel: z.string(), intros: perBranch });

const timelineItem = reviewable({
  when: z.string().optional(),
  title: z.string(),
  text: z.string().optional(),
});

export const konfiguratorSchema = z.object({
  seo: pageSeo.extend({ title: z.string().max(38) }),
  hero: reviewable({ h1: z.string(), lead: z.string(), masslinie: z.array(z.string()).length(3) }),
  progress: z.object({
    label: z.string(),
    heading: z.string(),
    stepOf: z.string(),
    compact: z.string(),
    done: z.string(),
  }),
  steps: z.object({
    projekt: sharedStep,
    details: branchStep,
    ausfuehrung: branchStep,
    rahmen: sharedStep,
    kontakt: sharedStep,
    pruefen: sharedStep,
  }),
  nojs: z.object({ stepHeading: z.string(), intro: z.string(), sketchCaption: z.string() }),
  nav: z.object({ next: z.string(), back: z.string(), submit: z.string(), submitDemo: z.string() }),
  demo: z.object({ ribbon: z.string(), note: z.string() }),
  photos: z.object({
    /** `{email}` is replaced with settings.email at render time. */
    demoText: z.string(),
    personsHint: z.string(),
    uploadHint: z.string(),
    remove: z.string(),
    dachschraegeHint: z.string(),
  }),
  /** Türen branch (docs/configurator.md §1 "Tür"): DIN explainer popover and the before/after link. */
  tuer: z.object({
    din: z.object({ trigger: z.string(), heading: z.string(), text: z.string(), close: z.string() }),
    vorherNachher: reviewable({ label: z.string() }),
  }),
  privacy: reviewable({ text: z.string(), linkLabel: z.string() }),
  summary: z.object({
    h2: z.string(),
    mobile: z.string(),
    empty: z.string(),
    edit: z.string(),
    share: z.object({
      button: z.string(),
      title: z.string(),
      text: z.string(),
      copy: z.string(),
      copied: z.string(),
      close: z.string(),
    }),
    draft: z.object({
      checkbox: z.string(),
      hint: z.string(),
      banner: z.string(),
      resume: z.string(),
      discard: z.string(),
      delete: z.string(),
    }),
  }),
  errors: z.object({
    summaryTitle: z.string(),
    submit: z.object({
      title: z.string(),
      text: z.string(),
      retry: z.string(),
      mail: z.string(),
      copy: z.string(),
      reasons: z.record(z.string(), z.string()),
    }),
    offline: z.string(),
    alreadySent: z.object({ text: z.string(), confirm: z.string(), cancel: z.string() }),
  }),
  success: z.object({
    h2: z.string(),
    text: z.string(),
    h2Demo: z.string(),
    textDemo: z.string(),
    idLine: z.string(),
    actions: z.object({
      mail: z.string(),
      copy: z.string(),
      save: z.string(),
      print: z.string(),
      link: z.string(),
    }),
    /** The 3D snapshot in the demo success view (§4.12): `{text}` in alt is the describe() sentence. */
    snapshot: z.object({ alt: z.string(), download: z.string() }),
    timeline: z.object({ h2: z.string(), items: z.array(timelineItem).min(1) }),
  }),
  /** 3D preview (docs/configurator.md §4.6, §4.9–4.11): poster button, view buttons, canvas label. */
  viewer: z.object({
    load: z.string(),
    reload: z.string(),
    /** Prefix of the canvas aria-label; the viewer appends „: “ + describe(build). */
    label: z.string(),
    note: z.string(),
    group: z.string(),
    views: z.object({ vorne: z.string(), seite: z.string(), dreiviertel: z.string(), oben: z.string() }),
    rotate: z.string(),
    rotateLeft: z.string(),
    rotateRight: z.string(),
    zoomIn: z.string(),
    zoomOut: z.string(),
    reset: z.string(),
  }),
  announce: z.object({
    typePreselected: z.string(),
    typeSwitched: z.string(),
    draftSaved: z.string(),
    draftDeleted: z.string(),
    linkCopied: z.string(),
    summaryCopied: z.string(),
    viewer: z.object({ loading: z.string(), ready: z.string(), unavailable: z.string() }),
  }),
});

export type KonfiguratorCopy = z.infer<typeof konfiguratorSchema>;
