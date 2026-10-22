// The case input for Claude (docs/angebot.md §6.1, docs/assistant.md §4.3 and §7). Data
// minimisation is an allowlist: only the project fields of the validated values go out, rendered
// as „Label: Wert“ with the German labels of labels.ts, plus the PLZ and its service tier.
//
// Never sent: name, email, telefon, erreichbarkeit, kontaktweg, ort (the PLZ and the tier are
// enough), the client's zusammenfassung (it repeats the contact block; the values are re-rendered
// here instead), the subject, Reply-To, the config link, attachment names and the photos
// themselves. The free-text fields are needed for the assessment and are sent, after redaction:
// e-mail addresses, phone-like numbers and the customer's own name, address and phone are replaced
// by a marker, and angle brackets are neutralised so the text cannot close the <anfrage> block.
//
// For Möbel the Build is regenerated from the values (the client's derived/stueckliste are not
// trusted, §2): outer dimensions, derived counts, the generator's hints and the cut list.
// For `angebotstext` the Kalkulation's positions (text, quantity, unit) and assumptions go along,
// never an amount.
import { FIELDS, type Values } from '../../../src/lib/configurator/fields';
import { cutList, describe, generate } from '../../../src/lib/configurator/furniture';
import { LABELS, PROJECT_TYPE_LABELS } from '../../../src/lib/configurator/labels';
import type { KalkulierenResult } from '../../../src/lib/configurator/pricing/kalkulieren';
import type { Kalkulation } from '../../../src/lib/configurator/pricing/types';
import { serviceArea, type ServiceTier } from '../../../src/lib/configurator/service-area';
import { paramsFromValues } from '../../../src/scripts/configurator/preview/params';
import { bodyText } from '../sanitize';
import type { Fall } from '../store';
import type { Bewertung } from './schemas';

/** The case's stored price: the `preis` result, or a Kalkulation from Claude's quantities (§4.4). */
export type FallKalkulation = KalkulierenResult | { kind: 'ki-mengen'; kalkulation: Kalkulation };

/** The Kalkulation of a stored result, or null (`mengen-noetig` without usable quantities). */
export const kalkulationOf = (k: unknown): Kalkulation | null => {
  const x = k as FallKalkulation | null;
  return x && (x.kind === 'regeln' || x.kind === 'ki-mengen') ? x.kalkulation : null;
};

/** Fields that never leave the backend (contact data; the PLZ goes out separately with its tier). */
export const NIE_SENDEN: readonly string[] = ['name', 'email', 'telefon', 'erreichbarkeit', 'kontaktweg', 'ort', 'plz'];

const TIER_LABEL: Record<ServiceTier, string> = {
  kern: 'Kerngebiet',
  region: 'Region (Anfahrt nach Absprache)',
  aussen: 'außerhalb des üblichen Gebiets',
};

export const typLabel = (typ: unknown): string =>
  typeof typ === 'string' && Object.hasOwn(PROJECT_TYPE_LABELS, typ)
    ? PROJECT_TYPE_LABELS[typ as keyof typeof PROJECT_TYPE_LABELS].label
    : 'Anfrage';

const label = (name: string): string => LABELS[name]?.label ?? name;
const option = (name: string, v: string): string => LABELS[name]?.options?.[v] ?? v;

const EMAIL = /[^\s@<>()[\]]+@[^\s@<>()[\]]+/gu;
const PHONE = /\+?\p{Nd}[\p{Nd} ()/.-]{4,}\p{Nd}/gu;
const escapeRx = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The customer's own contact strings: the full values and every name part of 3+ letters. */
function piiStrings(v: Values): string[] {
  const out = new Set<string>();
  for (const k of ['name', 'email', 'telefon', 'ort']) {
    const x = v[k];
    if (typeof x !== 'string' || !x.trim()) continue;
    out.add(x.trim());
    if (k === 'name') for (const part of x.split(/[\s,.-]+/)) if (part.length >= 3) out.add(part);
  }
  return [...out].sort((a, b) => b.length - a.length);
}

/** Free text for Claude: controls removed, contact data redacted, no way to close the block. */
export function freitext(s: string, pii: readonly string[]): string {
  let t = bodyText(s, 2000).normalize('NFC');
  for (const p of pii) t = t.replace(new RegExp(escapeRx(p), 'giu'), '[entfernt]');
  t = t.replace(EMAIL, '[E-Mail entfernt]');
  t = t.replace(PHONE, (m) => ((m.match(/\p{Nd}/gu)?.length ?? 0) >= 6 ? '[Nummer entfernt]' : m));
  return t.replace(/</g, '‹').replace(/>/g, '›').trim();
}

/** „Label: Wert“ lines of the project fields, in registry order. */
export function felder(v: Values): string[] {
  const pii = piiStrings(v);
  const lines: string[] = [];
  for (const [name, f] of Object.entries(FIELDS)) {
    if (NIE_SENDEN.includes(name) || f.kind === 'file') continue;
    const x = v[name];
    if (x === undefined || x === '' || (Array.isArray(x) && !x.length)) continue;
    let text: string;
    if (name === 'typ') text = typLabel(x);
    else if (f.kind === 'bool') text = 'Ja';
    else if (f.kind === 'text') {
      text = freitext(Array.isArray(x) ? x.join('\n') : x, pii);
      if (text.includes('\n')) text = `\n${text}`;
    } else text = (Array.isArray(x) ? x : [x]).map((s) => option(name, s)).join(', ');
    lines.push(`${label(name)}: ${text}`);
  }
  return lines;
}

/** The regenerated Möbel Build (dimensions, counts, hints, cut list), or [] without a generator. */
export function buildZusammenfassung(v: Values): string[] {
  if (v['typ'] !== 'moebel') return [];
  const params = paramsFromValues(v);
  if (!params) return [];
  const b = generate(params);
  const d = b.derived;
  const [x, y, z] = d.outer.map(Math.round);
  const table = params.kind === 'esstisch';
  const lines = [
    `Beschreibung: ${describe(b)}`,
    `Außenmaße (${table ? 'Länge × Höhe × Breite' : 'Breite × Höhe × Tiefe'}): ${x} × ${y} × ${z} mm`,
  ];
  if (!table) {
    lines.push(
      `Felder: ${d.bays}; Fachböden je Feld: ${d.shelves.join(', ') || '0'}; Türen: ${d.doors}; Schubkästen: ${d.drawers}; Scharniere: ${d.hinges}`,
    );
  }
  for (const h of b.hints) lines.push(`Hinweis: ${h.text}`);
  lines.push('Stückliste:');
  for (const c of cutList(b)) {
    lines.push(`- ${c.count} × ${c.label}, ${c.length} × ${c.width} × ${c.thickness} mm, ${c.material}`);
  }
  return lines;
}

export interface BewertenInput {
  /** Case id, for the usage log only (never sent). */
  fall: string;
  typ: string;
  typLabel: string;
  /** §4.4 case: `mengen` is expected. */
  mengenNoetig: boolean;
  /** The rendered enquiry (goes inside <anfrage>). */
  anfrage: string;
}

export interface AngebotstextInput extends BewertenInput {
  /** Positions (text, quantity, unit) and assumptions; no amounts. */
  kalkulation: string;
  /** Claude's own assessment, condensed (feasibility, missing information). */
  bewertung: string;
}

/** The enquiry block shared by both calls. */
export function anfrageText(fall: Fall): string {
  const v = fall.payload.values;
  const plz = typeof v['plz'] === 'string' ? v['plz'] : '';
  const tier = serviceArea(plz)?.tier;
  const out = [
    ...felder(v),
    `Postleitzahl des Objekts: ${plz || 'nicht angegeben'}`,
    `Einzugsgebiet laut PLZ: ${tier ? TIER_LABEL[tier] : 'unbekannt'}`,
  ];
  const n = fall.payload.anhaenge.length;
  if (n) out.push(`Anhänge: ${n} ${n === 1 ? 'Datei' : 'Dateien'} (nicht übermittelt)`);
  const build = buildZusammenfassung(v);
  if (build.length) out.push('', 'Möbel, aus den Angaben neu berechnet:', ...build);
  return out.join('\n');
}

export function bewertenInput(fall: Fall, kalkulation: unknown): BewertenInput {
  const typ = typeof fall.payload.values['typ'] === 'string' ? fall.payload.values['typ'] : '';
  return {
    fall: fall.id,
    typ,
    typLabel: typLabel(typ),
    mengenNoetig: (kalkulation as FallKalkulation | null)?.kind === 'mengen-noetig',
    anfrage: anfrageText(fall),
  };
}

const fmt = (n: number): string => String(Math.round(n * 100) / 100).replace('.', ',');
/** Angle brackets out of text that is not ours alone (a Pauschale's reason, Claude's own lines). */
const neutral = (s: string): string => s.replace(/</g, '‹').replace(/>/g, '›');

/** Positions and assumptions of a Kalkulation, without any amount. */
export function kalkulationText(k: Kalkulation | null): string {
  if (!k) return 'Noch kein Preisrahmen (Mengen fehlen); der Inhaber kalkuliert selbst.';
  const lines = ['Positionen (Menge, Einheit; ohne Preise):'];
  for (const p of k.positionen) lines.push(`- ${neutral(p.text)} (${fmt(p.menge)} ${p.einheit})`);
  if (k.annahmen.length) lines.push('Annahmen:', ...k.annahmen.map((a) => `- ${neutral(a)}`));
  return lines.join('\n');
}

const MACHBARKEIT: Record<Bewertung['machbarkeit'], string> = {
  machbar: 'machbar',
  eingeschraenkt: 'eingeschränkt machbar',
  nicht_machbar: 'nicht machbar',
  unklar: 'unklar',
};

export function bewertungText(b: Bewertung | null): string {
  if (!b) return 'Keine KI-Bewertung.';
  const lines = [`Machbarkeit: ${MACHBARKEIT[b.machbarkeit]}`];
  if (b.fehlende_angaben.length) lines.push('Fehlende Angaben:', ...b.fehlende_angaben.map((x) => `- ${neutral(x)}`));
  return lines.join('\n');
}

export function angebotstextInput(fall: Fall, kalkulation: unknown, bewertung: Bewertung | null): AngebotstextInput {
  return {
    ...bewertenInput(fall, kalkulation),
    kalkulation: kalkulationText(kalkulationOf(kalkulation)),
    bewertung: bewertungText(bewertung),
  };
}

/** User message of `bewerten`: the enquiry, clearly delimited as untrusted data. */
export function bewertenNachricht(i: BewertenInput): string {
  return [
    `Projektart: ${i.typLabel}`,
    `Mengen erforderlich: ${i.mengenNoetig ? 'ja' : 'nein'}`,
    '',
    '<anfrage>',
    i.anfrage,
    '</anfrage>',
  ].join('\n');
}

/** User message of `angebotstext`: the enquiry plus our own Kalkulation and the assessment. */
export function angebotstextNachricht(i: AngebotstextInput): string {
  return [
    `Projektart: ${i.typLabel}`,
    '',
    '<anfrage>',
    i.anfrage,
    '</anfrage>',
    '',
    '<kalkulation>',
    i.kalkulation,
    '</kalkulation>',
    '',
    '<bewertung>',
    i.bewertung,
    '</bewertung>',
  ].join('\n');
}
