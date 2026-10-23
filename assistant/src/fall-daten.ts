// Read helpers over a stored case for the owner side (7d): the customer's contact values as given,
// project titles for subjects and the PDF, „Label: Wert“ lines via labels.ts, the case's
// Kalkulation, Bewertung and Angebot text, and the inputs of the recommendation. Pure.
import { FIELDS, type Values } from '../../src/lib/configurator/fields';
import { LABELS, PROJECT_TYPE_LABELS } from '../../src/lib/configurator/labels';
import type { Kalkulation } from '../../src/lib/configurator/pricing/types';
import { serviceArea, type ServiceTier } from '../../src/lib/configurator/service-area';
import { kalkulationOf, typLabel } from './claude/input';
import type { Angebotstext } from './claude/schemas';
import { vorlageAngebotstext } from './claude/templates';
import { empfehlung, type EmpfehlungErgebnis } from './empfehlung';
import { budgetText } from './projekt';
import { headerText, lineText } from './sanitize';
import type { AngebotRecord, BewertungRecord } from './steps/bewertung';
import type { Ereignis, Fall } from './store';
import { TITEL } from './texte/kunde';

const str = (v: Values, k: string): string | null => {
  const x = v[k];
  return typeof x === 'string' && x.trim() ? x : null;
};

/** The customer's name as given (one line, at most 100 characters), or null. */
export const kundeName = (v: Values): string | null => {
  const n = str(v, 'name');
  return n ? lineText(n).slice(0, 100) || null : null;
};

/** The customer's validated e-mail address, or null. */
export const kundeEmail = (v: Values): string | null => str(v, 'email')?.trim() ?? null;

/** „68161 Mannheim“ (PLZ and Ort as given), or what of it exists. */
export const plzOrt = (v: Values): string =>
  [str(v, 'plz'), str(v, 'ort')]
    .filter((x): x is string => x !== null)
    .map((x) => lineText(x).slice(0, 100))
    .join(' ');

export const tierVon = (v: Values): ServiceTier | null => serviceArea(str(v, 'plz') ?? '')?.tier ?? null;

export const optionLabel = (name: string, value: string): string => LABELS[name]?.options?.[value] ?? value;
export const feldLabel = (name: string): string => LABELS[name]?.label ?? name;

/** Wood species that name a material („Beratung“/„Noch offen“ do not). */
const holzLabel = (v: Values): string | null => {
  const h = str(v, 'moebel_holz');
  if (!h || h === 'beratung' || h === 'offen') return null;
  const label = LABELS['moebel_holz']?.options?.[h];
  return label ?? null;
};

/** Customer-facing project title: „Regal aus Eiche“, „Boden“, „Ihr Vorhaben“. */
export function projektTitel(v: Values): string {
  const typ = str(v, 'typ');
  if (typ === 'moebel') {
    const art = str(v, 'moebel_art');
    if (!art || art === 'andere') return typLabel(typ);
    return TITEL.moebel(optionLabel('moebel_art', art), holzLabel(v));
  }
  if (typ === 'sonstiges') return TITEL.sonstiges;
  return typLabel(typ);
}

/** Owner's short description (TL;DR subject, page title): „Regal 120×200×35“, „Esstisch 200×90“. */
export function kurzbeschreibung(v: Values): string {
  const typ = str(v, 'typ');
  const zahl = (k: string): string | null => {
    const x = str(v, k);
    return x && /^\d{1,4}(?:[.,]\d{1,2})?$/.test(x.trim()) ? x.trim() : null;
  };
  if (typ === 'moebel') {
    const art = str(v, 'moebel_art');
    const label = art ? optionLabel('moebel_art', art) : typLabel(typ);
    if (art === 'esstisch') {
      const dims = [zahl('tisch_laenge'), zahl('tisch_breite')];
      return dims.every(Boolean) ? `${label} ${dims.join('×')}` : label;
    }
    if (art === 'bett') {
      const f = str(v, 'bett_liegeflaeche');
      return f ? `${label} ${optionLabel('bett_liegeflaeche', f)}` : label;
    }
    const dims = [zahl('moebel_breite'), zahl('moebel_hoehe'), zahl('moebel_tiefe')];
    return art !== 'andere' && dims.every(Boolean) ? `${label} ${dims.join('×')}` : label;
  }
  return typLabel(typ);
}

/** Header-safe subject part. */
export const betreffText = (s: string, max = 80): string => headerText(s, max);

export interface Zeile {
  name: string;
  label: string;
  wert: string;
}

const anzeige = (name: string, x: string | string[]): string => {
  if (name === 'typ' && typeof x === 'string' && Object.hasOwn(PROJECT_TYPE_LABELS, x)) return typLabel(x);
  if (FIELDS[name]?.kind === 'bool') return 'Ja';
  if (name === 'budget' && typeof x === 'string') return budgetText(x);
  return (Array.isArray(x) ? x : [x]).map((s) => optionLabel(name, s)).join(', ');
};

/** „Label: Wert“ of the project's choices and numbers (no free text, no contact or Rahmen fields). */
export function projektZeilen(v: Values): Zeile[] {
  const out: Zeile[] = [];
  for (const [name, f] of Object.entries(FIELDS)) {
    if (f.step === 'rahmen' || f.step === 'kontakt' || f.kind === 'text' || f.kind === 'file') continue;
    const x = v[name];
    if (x === undefined || x === '' || (Array.isArray(x) && !x.length)) continue;
    out.push({ name, label: feldLabel(name), wert: anzeige(name, x) });
  }
  return out;
}

/** Fields of a step (`rahmen`, `kontakt`) that have a value, rendered. */
export function stepZeilen(v: Values, step: 'rahmen' | 'kontakt'): Zeile[] {
  const out: Zeile[] = [];
  for (const [name, f] of Object.entries(FIELDS)) {
    if (f.step !== step || f.kind === 'file' || name === 'nachricht') continue;
    const x = v[name];
    if (x === undefined || x === '' || (Array.isArray(x) && !x.length)) continue;
    out.push({ name, label: feldLabel(name), wert: anzeige(name, x) });
  }
  return out;
}

/** The customer's free texts (descriptions, wishes, message), as given. */
export function freitextZeilen(v: Values): Zeile[] {
  const out: Zeile[] = [];
  for (const [name, f] of Object.entries(FIELDS)) {
    if (f.kind !== 'text' || (f.step === 'kontakt' && name !== 'nachricht') || f.step === 'rahmen') continue;
    const x = v[name];
    const t = Array.isArray(x) ? x.join('\n') : x;
    if (!t || !t.trim()) continue;
    out.push({ name, label: feldLabel(name), wert: t });
  }
  return out;
}

/** Everything the owner side reads from a case. */
export interface FallDaten {
  kalkulation: Kalkulation | null;
  bewertung: BewertungRecord | null;
  angebot: AngebotRecord | null;
  /** The Angebot text to edit and send: the stored one, else the template. */
  text: Angebotstext;
}

export function fallDaten(fall: Fall): FallDaten {
  const kalkulation = kalkulationOf(fall.kalkulation);
  const bewertung = (fall.bewertung as BewertungRecord | null) ?? null;
  const angebot = (fall.angebot as AngebotRecord | null) ?? null;
  const text = angebot?.text ?? vorlageAngebotstext(typLabel(fall.payload.values['typ']), fall.payload.values);
  return { kalkulation, bewertung, angebot, text };
}

/** The recommendation of a case from its stored inputs (§7.1). */
export function empfehlungFuer(fall: Fall, ereignisse: readonly Ereignis[]): EmpfehlungErgebnis {
  const d = fallDaten(fall);
  return empfehlung({
    bewertung: d.bewertung,
    kalkulation: d.kalkulation,
    values: fall.payload.values,
    tier: tierVon(fall.payload.values),
    ereignisse: ereignisse.map((e) => e.kind),
    fehlgeschlagen: fall.status === 'bewertung_fehlgeschlagen',
  });
}
