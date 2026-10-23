// Customer-level descriptions of a project from its validated values (docs/angebot.md §6.4, §8.1):
// - projektZusammenfassung(): the compact „Ihr Projekt“ of the PDF and the Angebot mail
//   („Regal, 120 × 200 × 35 cm (B × H × T), Eiche, natur geölt, 19 mm, auf Sockel, mit Rückwand“);
// - projektLeistungen(): the Leistungen of the neutral template („Regal aus Eiche, natur geölt, nach
//   Ihren Maßen gefertigt“, „Lieferung und Montage vor Ort“);
// - budgetText(): the customer's budget option as amounts („2 000 € bis 5 000 €“).
// Built only from the form values and our own phrases (texte/struktur.ts), never from the
// Kalkulation's internal positions (hours, part counts, board areas, Werkstatt, Anfahrt) and never
// from free text. Every line still passes the guards; a line that would not is left out. The owner's
// review page keeps the full „Label: Wert“ table (fall-daten.ts projektZeilen()).
import type { Values } from '../../src/lib/configurator/fields';
import { LABELS, PROJECT_TYPE_LABELS } from '../../src/lib/configurator/labels';
import { pruefeText } from './claude/guards';
import { formatEuro, formatEuroRange, formatZahl, NNBSP } from './format';
import { BUDGET, FRONTEN, KLEIN, LEISTUNG, PROJEKT } from './texte/struktur';

const str = (v: Values, k: string): string | null => {
  const x = v[k];
  return typeof x === 'string' && x.trim() ? x.trim() : null;
};
const liste = (v: Values, k: string): string[] => {
  const x = v[k];
  return (Array.isArray(x) ? x : typeof x === 'string' && x ? [x] : []).filter((s) => s.trim());
};

/** The option's label from labels.ts (sentence-start form), or null for a missing/unknown value. */
const label = (v: Values, k: string): string | null => {
  const x = str(v, k);
  return x ? (LABELS[k]?.options?.[x] ?? null) : null;
};
/** The mid-sentence phrase of an option (texte/struktur.ts KLEIN), or null. */
const klein = <K extends keyof typeof KLEIN>(v: Values, k: K): string | null => {
  const x = str(v, k);
  const map = KLEIN[k] as Readonly<Record<string, string>>;
  return x && Object.hasOwn(map, x) ? map[x]! : null;
};
/** A wood label that names a material („Beratung gewünscht“, „Noch offen“ do not). */
const holz = (v: Values, k: string): string | null => {
  const x = str(v, k);
  return x && x !== 'beratung' && x !== 'offen' ? label(v, k) : null;
};

/** A positive number of the form („24,5“, „120“) formatted de-DE, or null. */
const zahl = (v: Values, k: string): string | null => {
  const x = str(v, k);
  if (!x || !/^\d{1,6}(?:[.,]\d{1,2})?$/.test(x)) return null;
  const n = Number(x.replace(',', '.'));
  return n > 0 && Number.isFinite(n) ? formatZahl(n) : null;
};
const mitEinheit = (n: string | null, einheit: string): string | null => (n ? `${n}${NNBSP}${einheit}` : null);
/** „120 × 200 × 35 cm“ when all dimensions are there. */
const masse = (v: Values, keys: readonly string[]): string | null => {
  const z = keys.map((k) => zahl(v, k));
  return z.every(Boolean) ? `${z.join(' × ')}${NNBSP}cm` : null;
};
const join = (teile: readonly (string | null | undefined | false)[]): string => teile.filter(Boolean).join(', ');
const sauber = (zeilen: readonly (string | null)[]): string[] => {
  const out: string[] = [];
  for (const z of zeilen) if (z && z.length <= 200 && !pruefeText(z).length && !out.includes(z)) out.push(z);
  return out;
};

const typ = (v: Values): string | null => str(v, 'typ');
const korpus = (art: string | null) => art === 'regal' || art === 'sideboard' || art === 'einbauschrank';

// ---------------------------------------------------------------------------------------------
// „Ihr Projekt“

function moebelZusammenfassung(v: Values): string[] {
  const art = str(v, 'moebel_art');
  const artLabel = label(v, 'moebel_art');
  const material = [
    holz(v, 'moebel_holz') ?? (str(v, 'moebel_holz') ? PROJEKT.holzNachBeratung : null),
    klein(v, 'moebel_oberflaeche'),
  ];
  if (korpus(art)) {
    const m = masse(v, ['moebel_breite', 'moebel_hoehe', 'moebel_tiefe']);
    const faecher = zahl(v, 'moebel_faecher');
    return [
      join([
        artLabel,
        m ? `${m} ${PROJEKT.masseBHT}` : null,
        ...material,
        label(v, 'moebel_staerke'),
        klein(v, 'moebel_unterbau'),
        art === 'regal' ? klein(v, 'moebel_rueckwand') : null,
        art !== 'regal' ? klein(v, 'moebel_front') : null,
        art !== 'regal' && str(v, 'moebel_front') !== 'offen' ? klein(v, 'moebel_griffe') : null,
        faecher && faecher !== '0' ? PROJEKT.faecher(faecher) : null,
        art === 'einbauschrank' && str(v, 'moebel_dachschraege') ? PROJEKT.dachschraege : null,
      ]),
    ];
  }
  if (art === 'esstisch') {
    const m = masse(v, ['tisch_laenge', 'tisch_breite', 'tisch_hoehe']);
    const platte = label(v, 'tisch_platte');
    return [
      join([
        artLabel,
        m ? `${m} ${PROJEKT.masseLBH}` : null,
        ...material,
        platte ? PROJEKT.platte(platte) : null,
        klein(v, 'tisch_kante'),
        klein(v, 'tisch_gestell'),
      ]),
    ];
  }
  if (art === 'bett') {
    const f = label(v, 'bett_liegeflaeche');
    return [join([artLabel, f ? PROJEKT.liegeflaeche(f) : null, ...material, klein(v, 'bett_hoehe')])];
  }
  return [join([PROJEKT.andere, ...material])];
}

function bodenZusammenfassung(v: Values): string[] {
  const leistung = label(v, 'boden_leistung');
  const art = str(v, 'boden_art') === 'offen' ? null : label(v, 'boden_art');
  const flaeche = mitEinheit(zahl(v, 'boden_flaeche'), 'm²');
  const fbh = label(v, 'boden_fbh');
  const untergrund = str(v, 'boden_untergrund') === 'unbekannt' ? null : label(v, 'boden_untergrund');
  const h = holz(v, 'boden_holz');
  return [
    art ? `${leistung ?? ''}: ${join([art, h])}`.replace(/^: /, '') : join([leistung, h ? PROJEKT.holzart(h) : null]),
    flaeche ? PROJEKT.bodenFlaeche(flaeche, zahl(v, 'boden_raeume')) : null,
    join([
      untergrund ? PROJEKT.untergrund(untergrund) : null,
      fbh && str(v, 'boden_fbh') !== 'unbekannt' ? PROJEKT.fbh(fbh.toLowerCase()) : null,
      label(v, 'boden_zustand') ? PROJEKT.zustand(label(v, 'boden_zustand')!) : null,
    ]),
    str(v, 'boden_sockelleisten') ? PROJEKT.sockelleisten : null,
  ].filter((x): x is string => !!x);
}

function treppeZusammenfassung(v: Values): string[] {
  const form = str(v, 'treppe_form') === 'unbekannt' ? null : klein(v, 'treppe_form');
  const bauart = klein(v, 'treppe_bauart');
  const stufen = zahl(v, 'treppe_stufen');
  const geschoss = mitEinheit(zahl(v, 'treppe_geschosshoehe'), 'cm');
  const h = holz(v, 'treppe_holz');
  const gel = label(v, 'treppe_gelaender');
  const bestand = str(v, 'treppe_bestand') === 'unbekannt' ? null : label(v, 'treppe_bestand');
  return [
    join([label(v, 'treppe_leistung'), bauart, form]),
    join([stufen ? PROJEKT.stufen(stufen) : null, geschoss ? PROJEKT.geschoss(geschoss) : null]),
    join([
      h ? PROJEKT.holzart(h) : null,
      bestand ? PROJEKT.bestand(bestand) : null,
      gel ? PROJEKT.gelaender(gel) : null,
    ]),
  ].filter(Boolean);
}

function fensterZusammenfassung(v: Values): string[] {
  const leistungen = liste(v, 'fenster_leistung');
  const ll = leistungen.map((x) => LABELS['fenster_leistung']?.options?.[x]).filter((x): x is string => !!x);
  const anzahl = zahl(v, 'fenster_anzahl');
  const m = masse(v, ['fenster_breite', 'fenster_hoehe']);
  const out = [
    ll.join(', '),
    join([anzahl ? PROJEKT.anzahlFenster(anzahl) : null, m ? PROJEKT.rund(m) : null, klein(v, 'fenster_verglasung')]),
    leistungen.includes('rolllaeden')
      ? PROJEKT.rolllaeden(zahl(v, 'rolllaeden_anzahl'), klein(v, 'rolllaeden_antrieb'))
      : null,
    leistungen.includes('fensterbaenke') && klein(v, 'fensterbaenke_ort')
      ? PROJEKT.fensterbaenke(klein(v, 'fensterbaenke_ort')!)
      : null,
    str(v, 'fenster_denkmal') === 'ja' ? PROJEKT.denkmal : null,
  ];
  return out.filter((x): x is string => !!x);
}

function tuerZusammenfassung(v: Values): string[] {
  const anzahl = zahl(v, 'tuer_anzahl');
  const m = masse(v, ['tuer_breite', 'tuer_hoehe']);
  const anschlag = str(v, 'tuer_anschlag') === 'unbekannt' ? null : label(v, 'tuer_anschlag');
  const stil = klein(v, 'tuer_stil');
  const art =
    str(v, 'tuer_art') === 'restaurierung'
      ? LEISTUNG.tuerRestaurierung(anzahl)
      : join([label(v, 'tuer_art'), anzahl ? PROJEKT.stueck(anzahl) : null]);
  return [
    join([art, m, anschlag]),
    join([
      stil ? PROJEKT.stil(stil) : null,
      klein(v, 'tuer_glas'),
      str(v, 'tuer_art') === 'haustuer' && str(v, 'tuer_sicherheit') ? PROJEKT.rc2 : null,
    ]),
  ].filter(Boolean);
}

function terrasseZusammenfassung(v: Values): string[] {
  const was = str(v, 'terrasse_was');
  const out: string[] = [];
  if (was === 'terrasse' || was === 'beides') {
    const f = mitEinheit(zahl(v, 'terrasse_flaeche'), 'm²');
    const u = str(v, 'terrasse_untergrund') === 'unbekannt' ? null : label(v, 'terrasse_untergrund');
    out.push(
      `${PROJEKT.terrasse}: ${join([f ? PROJEKT.rund(f) : null, holz(v, 'terrasse_holz'), klein(v, 'terrasse_hoehe'), u ? PROJEKT.untergrundTerrasse(u) : null]) || '–'}`,
    );
  }
  if (was === 'zaun' || was === 'beides') {
    const l = mitEinheit(zahl(v, 'zaun_laenge'), 'lfm');
    const h = mitEinheit(zahl(v, 'zaun_hoehe'), 'cm');
    const tore = zahl(v, 'zaun_tore');
    out.push(
      `${PROJEKT.zaun}: ${join([l ? PROJEKT.rund(l) : null, h ? PROJEKT.hoehe(h) : null, tore && tore !== '0' ? PROJEKT.tore(tore) : null, str(v, 'zaun_hang') === 'ja' ? PROJEKT.hang : null]) || '–'}`,
    );
  }
  return out;
}

function altbauZusammenfassung(v: Values): string[] {
  const b = liste(v, 'altbau_bereiche')
    .map((x) => LABELS['altbau_bereiche']?.options?.[x])
    .filter((x): x is string => !!x);
  const jahr = str(v, 'altbau_baujahr');
  return [
    b.length ? PROJEKT.bereiche(b.join(', ')) : null,
    join([
      jahr && /^\d{4}$/.test(jahr) ? PROJEKT.baujahr(jahr) : null,
      str(v, 'altbau_denkmal') === 'ja' ? PROJEKT.denkmal : null,
    ]),
  ].filter((x): x is string => !!x);
}

/** The compact „Ihr Projekt“ (1–4 lines) for the PDF and the Angebot mail. */
export function projektZusammenfassung(v: Values): string[] {
  const t = typ(v);
  const zeilen =
    t === 'moebel'
      ? moebelZusammenfassung(v)
      : t === 'boden'
        ? bodenZusammenfassung(v)
        : t === 'treppe'
          ? treppeZusammenfassung(v)
          : t === 'fenster'
            ? fensterZusammenfassung(v)
            : t === 'tuer'
              ? tuerZusammenfassung(v)
              : t === 'terrasse'
                ? terrasseZusammenfassung(v)
                : t === 'altbau'
                  ? altbauZusammenfassung(v)
                  : [];
  const out = sauber(zeilen);
  if (out.length) return out.slice(0, 4);
  const typLabel =
    t && Object.hasOwn(PROJECT_TYPE_LABELS, t)
      ? PROJECT_TYPE_LABELS[t as keyof typeof PROJECT_TYPE_LABELS].label
      : null;
  return sauber([t === 'sonstiges' || !typLabel ? PROJEKT.sonstiges : typLabel]);
}

// ---------------------------------------------------------------------------------------------
// Leistungen

function moebelLeistungen(v: Values): (string | null)[] {
  const art = str(v, 'moebel_art');
  const artLabel = label(v, 'moebel_art');
  const h = holz(v, 'moebel_holz');
  const beratung = !h && str(v, 'moebel_holz') ? LEISTUNG.holzNachBeratung : null;
  const ob = klein(v, 'moebel_oberflaeche');
  const out: (string | null)[] = [];
  if (korpus(art) && artLabel) {
    out.push(LEISTUNG.moebelKorpus(artLabel, h, ob));
    const front = str(v, 'moebel_front');
    if (art !== 'regal' && front && Object.hasOwn(FRONTEN, front)) {
      out.push(LEISTUNG.moebelFronten(FRONTEN[front as keyof typeof FRONTEN], klein(v, 'moebel_griffe')));
    }
  } else if (art === 'esstisch') {
    const platte = label(v, 'tisch_platte');
    out.push(LEISTUNG.esstisch(h, masse(v, ['tisch_laenge', 'tisch_breite'])));
    out.push(
      LEISTUNG.tischDetails(
        [platte ? PROJEKT.platte(platte) : null, klein(v, 'tisch_kante'), klein(v, 'tisch_gestell')].filter(
          (x): x is string => !!x,
        ),
      ),
    );
    if (ob) out.push(LEISTUNG.oberflaeche(ob));
  } else if (art === 'bett') {
    out.push(LEISTUNG.bett(h, label(v, 'bett_liegeflaeche')));
    if (ob) out.push(LEISTUNG.oberflaeche(ob));
  } else {
    out.push(LEISTUNG.andere);
    if (ob) out.push(LEISTUNG.oberflaeche(ob));
  }
  out.push(beratung, LEISTUNG.lieferungMontage);
  return out;
}

function bodenLeistungen(v: Values): (string | null)[] {
  const flaeche = mitEinheit(zahl(v, 'boden_flaeche'), 'm²');
  const l = str(v, 'boden_leistung');
  const out: (string | null)[] = [];
  if (l === 'neu') {
    const artKey = str(v, 'boden_art');
    const art = artKey && artKey !== 'offen' ? label(v, 'boden_art') : null;
    const h = artKey === 'kork' || artKey === 'linoleum' ? null : holz(v, 'boden_holz');
    out.push(LEISTUNG.bodenNeu(art ? join([art + (h ? ` ${h}` : '')]) : LEISTUNG.bodenBelag, flaeche));
    const u = str(v, 'boden_untergrund');
    if (u === 'teppich' || u === 'pvc-laminat' || u === 'unbekannt') out.push(LEISTUNG.bodenUntergrund);
  } else if (l === 'aufarbeiten') out.push(LEISTUNG.bodenAufarbeiten(flaeche));
  else out.push(LEISTUNG.bodenReparatur);
  if (str(v, 'boden_sockelleisten')) out.push(LEISTUNG.sockelleisten);
  return out;
}

function treppeLeistungen(v: Values): (string | null)[] {
  const l = str(v, 'treppe_leistung');
  const stufenZahl = zahl(v, 'treppe_stufen');
  const stufen = stufenZahl ? PROJEKT.stufen(stufenZahl) : null;
  const h = holz(v, 'treppe_holz');
  const out: (string | null)[] = [];
  if (l === 'neu') {
    const form =
      str(v, 'treppe_form') === 'gerade' || str(v, 'treppe_form') === 'unbekannt' ? null : klein(v, 'treppe_form');
    out.push(
      LEISTUNG.treppeNeu(
        h,
        [klein(v, 'treppe_bauart'), form, stufen].filter((x): x is string => !!x),
      ),
    );
  } else if (l === 'renovieren') out.push(LEISTUNG.treppeRenovieren(stufen));
  else if (l === 'belegen') out.push(LEISTUNG.treppeBelegen(h, stufen));
  if (l === 'gelaender' || str(v, 'treppe_gelaender') === 'neu') out.push(LEISTUNG.gelaender);
  out.push(LEISTUNG.montage);
  return out;
}

function fensterLeistungen(v: Values): (string | null)[] {
  const ls = liste(v, 'fenster_leistung');
  const anzahl = zahl(v, 'fenster_anzahl');
  const out: (string | null)[] = [];
  if (ls.includes('neu')) out.push(LEISTUNG.fensterNeu(anzahl, klein(v, 'fenster_verglasung')));
  if (ls.includes('restaurieren')) out.push(LEISTUNG.fensterRestaurieren(anzahl));
  if (ls.includes('rolllaeden'))
    out.push(LEISTUNG.rolllaeden(zahl(v, 'rolllaeden_anzahl'), klein(v, 'rolllaeden_antrieb')));
  if (ls.includes('fensterbaenke')) out.push(LEISTUNG.fensterbaenke(klein(v, 'fensterbaenke_ort')));
  out.push(LEISTUNG.montage);
  return out;
}

function tuerLeistungen(v: Values): (string | null)[] {
  const art = str(v, 'tuer_art');
  const anzahl = zahl(v, 'tuer_anzahl');
  const teile = [klein(v, 'tuer_stil'), str(v, 'tuer_glas') === 'ohne' ? null : klein(v, 'tuer_glas')].filter(
    (x): x is string => !!x,
  );
  const out: (string | null)[] = [];
  if (art === 'haustuer') {
    out.push(LEISTUNG.haustuer(teile));
    if (str(v, 'tuer_sicherheit')) out.push(LEISTUNG.rc2);
  } else if (art === 'innentuer') out.push(LEISTUNG.innentueren(anzahl, teile));
  else out.push(LEISTUNG.tuerRestaurierung(anzahl));
  out.push(LEISTUNG.montage);
  return out;
}

function terrasseLeistungen(v: Values): (string | null)[] {
  const was = str(v, 'terrasse_was');
  const out: (string | null)[] = [];
  if (was === 'terrasse' || was === 'beides') {
    out.push(
      LEISTUNG.terrasse(
        holz(v, 'terrasse_holz'),
        mitEinheit(zahl(v, 'terrasse_flaeche'), 'm²'),
        klein(v, 'terrasse_hoehe'),
      ),
      LEISTUNG.unterkonstruktion,
    );
  }
  if (was === 'zaun' || was === 'beides') {
    out.push(LEISTUNG.zaun(mitEinheit(zahl(v, 'zaun_laenge'), 'lfm'), mitEinheit(zahl(v, 'zaun_hoehe'), 'cm')));
    const tore = zahl(v, 'zaun_tore');
    if (tore && tore !== '0') out.push(LEISTUNG.tore(tore));
    if (was === 'zaun') out.push(LEISTUNG.montage);
  }
  return out;
}

function altbauLeistungen(v: Values): (string | null)[] {
  const b = liste(v, 'altbau_bereiche')
    .map((x) => LABELS['altbau_bereiche']?.options?.[x])
    .filter((x): x is string => !!x);
  return [LEISTUNG.altbau(b.length ? b.join(', ') : null), LEISTUNG.nachBeschreibung];
}

/**
 * Customer-level Leistungen of the neutral template (§6.4), per branch from the values. Empty when
 * nothing usable is there (the template then names the project type).
 */
export function projektLeistungen(v: Values, max = 10): string[] {
  const t = typ(v);
  const zeilen =
    t === 'moebel'
      ? moebelLeistungen(v)
      : t === 'boden'
        ? bodenLeistungen(v)
        : t === 'treppe'
          ? treppeLeistungen(v)
          : t === 'fenster'
            ? fensterLeistungen(v)
            : t === 'tuer'
              ? tuerLeistungen(v)
              : t === 'terrasse'
                ? terrasseLeistungen(v)
                : t === 'altbau'
                  ? altbauLeistungen(v)
                  : [];
  const out = sauber(zeilen);
  // Only „Montage“-type lines left: nothing describes the work itself.
  return out.some((z) => z !== LEISTUNG.montage && z !== LEISTUNG.lieferungMontage) ? out.slice(0, max) : [];
}

// ---------------------------------------------------------------------------------------------
// Budget

const BUDGET_GRENZEN: Readonly<Record<string, readonly [number | null, number | null]>> = {
  'bis-2000': [null, 2000],
  '2000-5000': [2000, 5000],
  '5000-10000': [5000, 10000],
  '10000-25000': [10000, 25000],
  'ueber-25000': [25000, null],
};

/** A budget option as amounts: „Bis 2 000 €“, „2 000 € bis 5 000 €“, „Über 25 000 €“, „Keine Angabe“. */
export function budgetText(wert: string): string {
  if (wert === 'keine-angabe') return BUDGET.keineAngabe;
  const g = Object.hasOwn(BUDGET_GRENZEN, wert) ? BUDGET_GRENZEN[wert] : undefined;
  if (!g) return LABELS['budget']?.options?.[wert] ?? wert;
  const [min, max] = g;
  if (min === null && max !== null) return BUDGET.bis(formatEuro(max));
  if (max === null && min !== null) return BUDGET.ueber(formatEuro(min));
  return formatEuroRange(min!, max!);
}

// ---------------------------------------------------------------------------------------------
// Annahmen

/**
 * Assumption lines that stay internal (7d review): travel and service area, Claude's estimated
 * quantities, workshop and installation hours, clamping notes of the Mengen pricing.
 */
const INTERNE_ANNAHME =
  /Anfahrt|PLZ|Einzugsgebiet|Mengen geschätzt|Werkstatt|Montage|stunden|\bh\b|Maximum|begrenzt|Plattenfläche|Pauschalpreis/i;

/** The Kalkulation's assumptions the customer may see: internal lines out, guard-clean only. */
export function kundenAnnahmen(annahmen: readonly string[] | null | undefined): string[] {
  return sauber((annahmen ?? []).filter((a) => typeof a === 'string' && !INTERNE_ANNAHME.test(a)));
}
