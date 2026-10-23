// German building blocks for the customer-level project summary and Leistungen (projekt.ts) and
// the budget display: phrases per branch, assembled from the validated form values. Kept apart from
// texte/kunde.ts and texte/inhaber.ts so the copywriter can review them separately.
//
// needs-review (docs/owner-checklist.md "Angebot pilot"): pilot wording. The lines describe what the
// customer chose, never internal calculation (no hours, part counts, board areas, Werkstatt,
// Plattenmaterial or Anfahrt), and must stay free of amounts, dates and green claims (guards.ts).
// Units come with U+202F from format.ts.

/** Mid-sentence forms of option values (labels.ts has the sentence-start forms). */
export const KLEIN = {
  moebel_oberflaeche: { 'natur-geoelt': 'natur geölt', 'weiss-geoelt': 'weiß geölt', 'lack-matt': 'matt lackiert' },
  moebel_unterbau: { sockel: 'auf Sockel', fuesse: 'auf Füßen', haengend: 'hängend', ohne: 'ohne Unterbau' },
  moebel_rueckwand: { mit: 'mit Rückwand', ohne: 'ohne Rückwand' },
  moebel_front: {
    offen: 'offen',
    tueren: 'mit Türen',
    schubkaesten: 'mit Schubkästen',
    gemischt: 'mit Türen und Schubkästen',
  },
  moebel_griffe: { grifflos: 'grifflos', holz: 'Griffe aus Holz', metall: 'Griffe aus Metall' },
  tisch_kante: { gerade: 'gerade Kante', baumkante: 'Baumkante' },
  tisch_gestell: { vierfuss: 'Vierfußgestell', 'kufen-holz': 'Kufen aus Holz', 'kufen-stahl': 'Kufen aus Stahl' },
  bett_hoehe: { normal: 'normale Einstiegshöhe', komfort: 'Komfort-Einstiegshöhe' },
  treppe_form: {
    gerade: 'gerade',
    viertel: 'viertelgewendelt',
    halb: 'halbgewendelt',
    podest: 'mit Podest',
    wendel: 'als Wendeltreppe',
  },
  treppe_bauart: { wange: 'Wangenbauweise', holm: 'Holmbauweise', faltwerk: 'Faltwerk' },
  fenster_verglasung: { '2fach': '2-fach verglast', '3fach': '3-fach verglast' },
  rolllaeden_antrieb: { gurt: 'mit Gurt', elektrisch: 'elektrisch' },
  fensterbaenke_ort: { innen: 'innen', aussen: 'außen', beides: 'innen und außen' },
  tuer_glas: { ohne: 'ohne Glas', lichtausschnitt: 'mit Lichtausschnitt', seitenteil: 'mit Seitenteil' },
  tuer_stil: { modern: 'modern', klassisch: 'klassisch', 'nach-vorlage': 'nach Vorlage' },
  terrasse_hoehe: { bodennah: 'bodennah', erhoeht: 'erhöht' },
} as const;

/** The fronts as nouns (Leistungen). */
export const FRONTEN = { tueren: 'Türen', schubkaesten: 'Schubkästen', gemischt: 'Türen und Schubkästen' } as const;

/** Phrases of the project summary („Ihr Projekt“). */
export const PROJEKT = {
  masseBHT: '(B × H × T)',
  masseLBH: '(L × B × H)',
  platte: (mm: string) => `Platte ${mm}`,
  liegeflaeche: (f: string) => `Liegefläche ${f}`,
  faecher: (n: string) => `${n} Fachböden je Feld`,
  dachschraege: 'mit Dachschräge',
  holzNachBeratung: 'Holzart nach Beratung',
  andere: 'Möbel nach Ihrer Beschreibung',
  bodenFlaeche: (flaeche: string, raeume: string | null) =>
    raeume ? `Fläche rund ${flaeche} in ${raeume} ${raeume === '1' ? 'Raum' : 'Räumen'}` : `Fläche rund ${flaeche}`,
  untergrund: (u: string) => `Untergrund: ${u}`,
  fbh: (x: string) => `Fußbodenheizung: ${x}`,
  zustand: (z: string) => `Zustand: ${z}`,
  sockelleisten: 'Sockelleisten erneuern',
  stufen: (n: string) => `${n} Stufen`,
  geschoss: (h: string) => `Geschosshöhe ${h}`,
  holzart: (h: string) => `Holzart: ${h}`,
  gelaender: (g: string) => `Geländer: ${g}`,
  bestand: (b: string) => `Bestehende Treppe: ${b}`,
  anzahlFenster: (n: string) => `${n} Fenster`,
  rund: (masse: string) => `rund ${masse}`,
  rolllaeden: (n: string | null, antrieb: string | null) =>
    ['Rollläden', n ? `${n} Stück` : null, antrieb].filter(Boolean).join(', '),
  fensterbaenke: (ort: string) => `Fensterbänke ${ort}`,
  denkmal: 'Denkmalschutz',
  stueck: (n: string) => `${n} Stück`,
  rc2: 'einbruchhemmend (RC2)',
  stil: (s: string) => `Stil ${s}`,
  terrasse: 'Terrasse',
  zaun: 'Zaun',
  hoehe: (h: string) => `Höhe ${h}`,
  tore: (n: string) => `${n} ${n === '1' ? 'Tor' : 'Tore'}`,
  hang: 'in Hanglage',
  untergrundTerrasse: (u: string) => `Untergrund ${u}`,
  bereiche: (b: string) => `Bereiche: ${b}`,
  baujahr: (j: string) => `Baujahr ${j}`,
  sonstiges: 'Vorhaben nach Ihrer Beschreibung',
} as const;

/** Customer-level Leistungen (template lines, §6.4) per branch. */
export const LEISTUNG = {
  moebelKorpus: (art: string, holz: string | null, oberflaeche: string | null) =>
    [holz ? `${art} aus ${holz}` : art, oberflaeche, 'nach Ihren Maßen gefertigt'].filter(Boolean).join(', '),
  /** `fronten`: FRONTEN; `griffe`: KLEIN.moebel_griffe. */
  moebelFronten: (fronten: string, griffe: string | null) =>
    [`${fronten} mit Beschlägen`, griffe].filter(Boolean).join(', '),
  esstisch: (holz: string | null, masse: string | null) =>
    [holz ? `Esstisch aus ${holz}` : 'Esstisch', masse, 'nach Ihren Maßen gefertigt'].filter(Boolean).join(', '),
  tischDetails: (teile: readonly string[]) => teile.join(', '),
  bett: (holz: string | null, flaeche: string | null) =>
    [holz ? `Bett aus ${holz}` : 'Bett', flaeche ? `Liegefläche ${flaeche}` : null].filter(Boolean).join(', '),
  oberflaeche: (o: string) => `Oberfläche ${o}`,
  andere: 'Möbel nach Ihrer Beschreibung, nach Ihren Maßen gefertigt',
  holzNachBeratung: 'Holzart nach gemeinsamer Beratung',
  lieferungMontage: 'Lieferung und Montage vor Ort',
  bodenNeu: (art: string, flaeche: string | null) =>
    [art, flaeche ? `rund ${flaeche}` : null, 'verlegt'].filter(Boolean).join(', '),
  bodenBelag: 'Neuer Bodenbelag',
  bodenUntergrund: 'Vorbereitung des Untergrunds',
  bodenAufarbeiten: (flaeche: string | null) =>
    ['Boden abschleifen und neu behandeln', flaeche ? `rund ${flaeche}` : null].filter(Boolean).join(', '),
  bodenReparatur: 'Reparatur des Bodens nach Ihren Angaben',
  sockelleisten: 'Neue Sockelleisten',
  treppeNeu: (holz: string | null, teile: readonly string[]) =>
    [holz ? `Neue Treppe aus ${holz}` : 'Neue Treppe', ...teile].join(', '),
  treppeRenovieren: (stufen: string | null) => ['Renovierung der Treppe', stufen].filter(Boolean).join(', '),
  treppeBelegen: (holz: string | null, stufen: string | null) =>
    [holz ? `Bestandstreppe mit ${holz} belegen` : 'Bestandstreppe mit Holz belegen', stufen]
      .filter(Boolean)
      .join(', '),
  gelaender: 'Neues Treppengeländer',
  montage: 'Montage vor Ort',
  fensterNeu: (anzahl: string | null, verglasung: string | null) =>
    ['Neue Holzfenster nach Maß', anzahl ? `${anzahl} Stück` : null, verglasung].filter(Boolean).join(', '),
  fensterRestaurieren: (anzahl: string | null) =>
    ['Restaurierung der Fenster', anzahl ? `${anzahl} Stück` : null].filter(Boolean).join(', '),
  rolllaeden: (anzahl: string | null, antrieb: string | null) =>
    ['Rollläden', anzahl ? `${anzahl} Stück` : null, antrieb].filter(Boolean).join(', '),
  fensterbaenke: (ort: string | null) => (ort ? `Fensterbänke ${ort}` : 'Fensterbänke'),
  haustuer: (teile: readonly string[]) => ['Haustür nach Maß', ...teile].join(', '),
  innentueren: (anzahl: string | null, teile: readonly string[]) =>
    [anzahl && anzahl !== '1' ? `${anzahl} Innentüren nach Maß` : 'Innentür nach Maß', ...teile].join(', '),
  tuerRestaurierung: (anzahl: string | null) =>
    anzahl && anzahl !== '1' ? `Restaurierung von ${anzahl} Türen` : 'Restaurierung der Tür',
  rc2: 'Einbruchhemmende Ausführung (RC2)',
  terrasse: (holz: string | null, flaeche: string | null, hoehe: string | null) =>
    [holz ? `Terrasse aus ${holz}` : 'Terrasse', flaeche ? `rund ${flaeche}` : null, hoehe].filter(Boolean).join(', '),
  unterkonstruktion: 'Unterkonstruktion und Montage vor Ort',
  zaun: (laenge: string | null, hoehe: string | null) =>
    ['Zaun', laenge ? `rund ${laenge}` : null, hoehe ? `Höhe ${hoehe}` : null].filter(Boolean).join(', '),
  tore: (n: string) => (n === '1' ? 'Ein Tor' : `${n} Tore`),
  altbau: (bereiche: string | null) => (bereiche ? `Arbeiten im Altbau: ${bereiche}` : 'Arbeiten im Altbau'),
  nachBeschreibung: 'Ausführung nach Ihrer Beschreibung und dem Aufmaß vor Ort',
} as const;

/** Budget options shown as amounts (format.ts formatEuro), not as the form's labels. */
export const BUDGET = {
  bis: (betrag: string) => `Bis ${betrag}`,
  ueber: (betrag: string) => `Über ${betrag}`,
  keineAngabe: 'Keine Angabe',
} as const;
