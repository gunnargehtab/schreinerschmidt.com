// German labels of the quote wizard (docs/configurator.md §1), keyed by field name. Build time only:
// the components render these into the DOM (`<label>`, `data-label`, `data-unit`) and the client
// reads them back from there, so this module must never be imported by src/scripts/**.
// Option labels are verbatim from the spec tables where the spec gives them.
import type { ProjectType } from './fields';

export interface FieldLabel {
  label: string;
  hint?: string;
  options?: Readonly<Record<string, string>>;
}

export const PROJECT_TYPE_LABELS: Readonly<Record<ProjectType, { label: string; hint: string }>> = {
  moebel: { label: 'Möbel nach Maß', hint: 'Schrank, Regal, Sideboard, Tisch, Bett' },
  boden: { label: 'Boden', hint: 'Parkett, Dielen, Kork & Linoleum, Abschleifen' },
  treppe: { label: 'Treppe', hint: 'Neu bauen oder renovieren' },
  fenster: { label: 'Fenster', hint: 'Holzfenster, Rollläden, Fensterbänke' },
  tuer: { label: 'Türen', hint: 'Haustür, Innentüren, Restaurierung' },
  terrasse: { label: 'Terrasse & Zaun', hint: 'Lärche, Douglasie, Robinie' },
  altbau: { label: 'Altbausanierung', hint: 'Treppen, Vertäfelung, Dielen' },
  sonstiges: { label: 'Etwas anderes', hint: 'Beschreiben Sie Ihr Vorhaben' },
};

const JA_NEIN_UNBEKANNT = { ja: 'Ja', nein: 'Nein', unbekannt: 'Weiß ich nicht' };
const HOLZ = {
  eiche: 'Eiche',
  nussbaum: 'Nussbaum',
  esche: 'Esche',
  kernbuche: 'Kernbuche',
  kirsche: 'Kirsche',
  kiefer: 'Kiefer',
  douglasie: 'Douglasie',
  laerche: 'Lärche',
  robinie: 'Robinie',
  beratung: 'Beratung gewünscht',
  offen: 'Noch offen',
};
/** The species options of one field, in its order (fields.ts holds the value lists). */
const holz = (...keys: (keyof typeof HOLZ)[]): Record<string, string> =>
  Object.fromEntries(keys.map((k) => [k, HOLZ[k]]));

export const LABELS: Readonly<Record<string, FieldLabel>> = {
  typ: { label: 'Projektart' },

  // Möbel, step 2
  moebel_art: {
    label: 'Welches Möbel?',
    options: {
      regal: 'Regal',
      sideboard: 'Sideboard',
      einbauschrank: 'Einbauschrank',
      esstisch: 'Esstisch',
      bett: 'Bett',
      andere: 'Etwas anderes',
    },
  },
  moebel_breite: { label: 'Breite in cm', hint: 'Einbauschrank: Nischenbreite' },
  moebel_hoehe: { label: 'Höhe in cm' },
  moebel_tiefe: { label: 'Tiefe in cm' },
  moebel_staerke: { label: 'Materialstärke', options: { '19': '19 mm', '25': '25 mm', '40': '40 mm' } },
  moebel_front: {
    label: 'Fronten',
    options: { offen: 'Offen', tueren: 'Türen', schubkaesten: 'Schubkästen', gemischt: 'Gemischt' },
  },
  moebel_unterbau: {
    label: 'Unterbau',
    options: { sockel: 'Sockel', fuesse: 'Füße', haengend: 'Hängend', ohne: 'Ohne' },
  },
  moebel_rueckwand: { label: 'Rückwand', options: { mit: 'Mit Rückwand', ohne: 'Ohne Rückwand' } },
  moebel_faecher: { label: 'Fachböden je Feld', hint: 'Leer lassen für die automatische Einteilung' },
  moebel_griffe: { label: 'Griffe', options: { grifflos: 'Grifflos', holz: 'Holz', metall: 'Metall' } },
  moebel_dachschraege: { label: 'Nische hat eine Dachschräge', hint: 'Bitte Foto/Skizze beifügen' },
  tisch_laenge: { label: 'Länge in cm' },
  tisch_breite: { label: 'Breite in cm' },
  tisch_hoehe: { label: 'Höhe in cm' },
  tisch_platte: { label: 'Plattenstärke', options: { '25': '25 mm', '40': '40 mm', '60': '60 mm' } },
  tisch_kante: { label: 'Kante', options: { gerade: 'Gerade', baumkante: 'Baumkante' } },
  tisch_gestell: {
    label: 'Gestell',
    options: { vierfuss: 'Vierfuß', 'kufen-holz': 'Kufen aus Holz', 'kufen-stahl': 'Kufen aus Stahl' },
  },
  tisch_brett: { label: 'Brett' },
  bett_liegeflaeche: {
    label: 'Liegefläche',
    options: {
      '90x200': '90 × 200 cm',
      '140x200': '140 × 200 cm',
      '160x200': '160 × 200 cm',
      '180x200': '180 × 200 cm',
      '200x200': '200 × 200 cm',
      '180x220': '180 × 220 cm',
      '200x220': '200 × 220 cm',
      sondermass: 'Sondermaß',
    },
  },
  bett_hoehe: {
    label: 'Einstiegshöhe',
    options: { normal: 'Normal (ca. 45 cm)', komfort: 'Komfort (ca. 55 cm)' },
  },
  moebel_beschreibung: { label: 'Was dürfen wir bauen?' },

  // Möbel, step 3
  moebel_holz: { label: 'Holzart', options: holz('eiche', 'nussbaum', 'esche', 'kernbuche', 'kirsche', 'beratung') },
  moebel_oberflaeche: {
    label: 'Oberfläche',
    options: { 'natur-geoelt': 'Natur geölt', 'weiss-geoelt': 'Weiß geölt', 'lack-matt': 'Lackiert matt' },
  },
  moebel_wuensche: { label: 'Besondere Wünsche' },
  'fotos[]': { label: 'Fotos', hint: 'Bitte achten Sie darauf, dass keine Personen zu erkennen sind.' },

  // Boden
  boden_leistung: {
    label: 'Was ist geplant?',
    options: { neu: 'Neuer Boden', aufarbeiten: 'Abschleifen & Aufarbeiten', reparatur: 'Reparatur' },
  },
  boden_art: {
    label: 'Bodenart',
    options: {
      stabparkett: 'Stabparkett',
      hochkant: 'Hochkantlamelle',
      mosaik: 'Mosaikparkett',
      fertigparkett: 'Fertigparkett',
      dielen: 'Dielen',
      kork: 'Kork',
      linoleum: 'Linoleum',
      offen: 'Noch offen',
    },
  },
  boden_holz: { label: 'Holzart', options: holz('eiche', 'kernbuche', 'esche', 'kiefer', 'douglasie', 'offen') },
  boden_flaeche: { label: 'Fläche ca. in m²' },
  boden_raeume: { label: 'Anzahl Räume' },
  boden_untergrund: {
    label: 'Untergrund',
    options: {
      estrich: 'Estrich',
      holz: 'Holz',
      fliesen: 'Fliesen',
      teppich: 'Teppich',
      'pvc-laminat': 'PVC oder Laminat',
      unbekannt: 'Weiß ich nicht',
    },
  },
  boden_fbh: { label: 'Fußbodenheizung', options: JA_NEIN_UNBEKANNT },
  boden_zugang: { label: 'Können Dielen bis 5 m Länge ins Haus getragen werden?', options: JA_NEIN_UNBEKANNT },
  boden_zustand: {
    label: 'Zustand des Bodens',
    options: { leicht: 'Leichte Gebrauchsspuren', stark: 'Stark abgenutzt', schaeden: 'Schäden oder lose Stellen' },
  },
  boden_oberflaeche_alt: {
    label: 'Bisherige Oberfläche',
    options: { geoelt: 'Geölt', lackiert: 'Lackiert', unbekannt: 'Weiß ich nicht' },
  },
  boden_sockelleisten: { label: 'Sockelleisten erneuern' },

  // Treppe
  treppe_leistung: {
    label: 'Was ist geplant?',
    options: {
      neu: 'Neue Treppe',
      renovieren: 'Treppe renovieren',
      belegen: 'Bestandstreppe mit Holz belegen',
      gelaender: 'Geländer',
    },
  },
  treppe_form: {
    label: 'Treppenform',
    options: {
      gerade: 'Gerade',
      viertel: 'Viertelgewendelt',
      halb: 'Halbgewendelt',
      podest: 'Mit Podest',
      wendel: 'Wendeltreppe',
      unbekannt: 'Weiß ich nicht',
    },
  },
  treppe_geschosshoehe: {
    label: 'Geschosshöhe in cm',
    hint: 'Oberkante Fertigfußboden bis Oberkante Fertigfußboden',
  },
  treppe_stufen: { label: 'Anzahl Stufen' },
  treppe_holz: { label: 'Holzart', options: holz('eiche', 'kernbuche', 'esche', 'nussbaum', 'beratung') },
  treppe_bauart: {
    label: 'Bauart',
    options: { wange: 'Wangentreppe', holm: 'Holmtreppe', faltwerk: 'Faltwerktreppe', beratung: 'Beratung gewünscht' },
  },
  treppe_bestand: {
    label: 'Bestehende Treppe',
    options: { holz: 'Holz', beton: 'Beton', stahl: 'Stahl', unbekannt: 'Weiß ich nicht' },
  },
  treppe_gelaender: {
    label: 'Geländer',
    options: { neu: 'Neues Geländer', vorhanden: 'Bleibt erhalten', keins: 'Kein Geländer' },
  },
  treppe_zustand: { label: 'Zustand der Treppe' },

  // Fenster
  fenster_leistung: {
    label: 'Was ist geplant?',
    options: {
      neu: 'Neue Holzfenster',
      restaurieren: 'Fenster restaurieren',
      rolllaeden: 'Rollläden',
      fensterbaenke: 'Fensterbänke',
    },
  },
  fenster_anzahl: { label: 'Anzahl Fenster' },
  fenster_breite: { label: 'Breite in cm', hint: 'Für ein typisches Fenster' },
  fenster_hoehe: { label: 'Höhe in cm', hint: 'Für ein typisches Fenster' },
  fenster_verglasung: {
    label: 'Verglasung',
    options: { '2fach': '2-fach', '3fach': '3-fach', unbekannt: 'Weiß ich nicht' },
  },
  fenster_denkmal: { label: 'Denkmalschutz', options: JA_NEIN_UNBEKANNT },
  rolllaeden_anzahl: { label: 'Anzahl Rollläden' },
  rolllaeden_antrieb: {
    label: 'Antrieb',
    options: { gurt: 'Gurt', elektrisch: 'Elektrisch', beratung: 'Beratung gewünscht' },
  },
  fensterbaenke_ort: { label: 'Fensterbänke', options: { innen: 'Innen', aussen: 'Außen', beides: 'Innen und außen' } },
  fenster_zustand: { label: 'Zustand der Fenster' },

  // Tür
  tuer_art: {
    label: 'Welche Tür?',
    options: { haustuer: 'Haustür', innentuer: 'Innentür', restaurierung: 'Restaurierung' },
  },
  tuer_anzahl: { label: 'Anzahl Türen' },
  tuer_breite: { label: 'Breite in cm' },
  tuer_hoehe: { label: 'Höhe in cm' },
  tuer_anschlag: {
    label: 'Anschlag',
    options: { 'din-links': 'DIN links', 'din-rechts': 'DIN rechts', unbekannt: 'Weiß ich nicht' },
  },
  tuer_sicherheit: { label: 'Einbruchhemmung RC2' },
  tuer_glas: {
    label: 'Glas',
    options: { ohne: 'Ohne Glas', lichtausschnitt: 'Lichtausschnitt', seitenteil: 'Seitenteil' },
  },
  tuer_stil: { label: 'Stil', options: { modern: 'Modern', klassisch: 'Klassisch', 'nach-vorlage': 'Nach Vorlage' } },
  tuer_zustand: { label: 'Zustand der Tür' },

  // Terrasse & Zaun
  terrasse_was: {
    label: 'Was ist geplant?',
    options: { terrasse: 'Terrasse', zaun: 'Zaun', beides: 'Terrasse und Zaun' },
  },
  terrasse_flaeche: { label: 'Terrassenfläche ca. in m²' },
  terrasse_holz: { label: 'Holzart', options: holz('laerche', 'douglasie', 'robinie', 'beratung') },
  zaun_laenge: { label: 'Zaunlänge in lfm' },
  zaun_hoehe: { label: 'Zaunhöhe in cm' },
  zaun_tore: { label: 'Anzahl Tore' },
  terrasse_untergrund: {
    label: 'Untergrund',
    options: {
      'beton-pflaster': 'Beton oder Pflaster',
      erdreich: 'Erdreich',
      balkon: 'Balkon',
      unbekannt: 'Weiß ich nicht',
    },
  },
  terrasse_hoehe: { label: 'Höhe', options: { bodennah: 'Bodennah', erhoeht: 'Erhöht' } },
  zaun_hang: { label: 'Hanglage', options: { ja: 'Ja', nein: 'Nein' } },

  // Altbau
  altbau_bereiche: {
    label: 'Welche Bereiche?',
    options: {
      treppe: 'Treppe',
      vertaefelung: 'Vertäfelung',
      dielen: 'Dielen',
      tueren: 'Türen',
      fenster: 'Fenster',
      einbauschraenke: 'Einbauschränke',
    },
  },
  altbau_baujahr: { label: 'Baujahr' },
  altbau_denkmal: { label: 'Denkmalschutz', options: JA_NEIN_UNBEKANNT },
  altbau_beschreibung: { label: 'Was ist geplant?' },

  // Sonstiges
  sonstiges_beschreibung: { label: 'Beschreiben Sie Ihr Vorhaben' },
  sonstiges_masse: { label: 'Maße, falls bekannt' },

  // Step 4: Rahmen
  zeitraum: {
    label: 'Wann soll es losgehen?',
    options: { asap: 'So bald wie möglich', '1-3': 'In 1–3 Monaten', '3-6': 'In 3–6 Monaten', offen: 'Noch offen' },
  },
  termin: { label: 'Fester Termin', hint: 'z. B. Einzug' },
  budget: {
    label: 'Budgetrahmen (optional)',
    options: {
      'bis-2000': 'Bis 2.000 €',
      '2000-5000': '2.000 bis 5.000 €',
      '5000-10000': '5.000 bis 10.000 €',
      '10000-25000': '10.000 bis 25.000 €',
      'ueber-25000': 'Über 25.000 €',
      'keine-angabe': 'Keine Angabe',
    },
  },
  plz: { label: 'Postleitzahl des Objekts' },
  ort: { label: 'Ort' },

  // Step 5: Kontakt
  name: { label: 'Name' },
  email: { label: 'E-Mail' },
  telefon: { label: 'Telefon' },
  kontaktweg: { label: 'Kontaktweg', options: { email: 'E-Mail', telefon: 'Telefon', egal: 'Egal' } },
  erreichbarkeit: { label: 'Erreichbarkeit' },
  nachricht: { label: 'Nachricht' },
};
