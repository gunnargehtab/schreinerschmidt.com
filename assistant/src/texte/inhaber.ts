// German copy for the owner (docs/angebot.md §7): recommendation reasons, TL;DR and reminder mails,
// the review page with its forms, confirm and outcome pages, the PIN page and the error pages.
// All owner-facing wording lives here (and customer-facing wording in texte/kunde.ts), so the
// copywriter can polish it without touching logic. Rules: sentence case, „…“ quotes, formal „Sie“,
// U+202F between number and unit (format.ts does it for amounts).
import { formatBreite, formatEuro, formatZahl, NNBSP } from '../format';

/** Reason lines of the recommendation flags (empfehlung.ts). */
export const FLAG_TEXT = {
  spam: 'Spam-Verdacht laut KI-Bewertung',
  nicht_machbar: 'Laut KI-Bewertung nicht machbar',
  passt_nicht: 'Passt laut KI-Bewertung nicht zum Betrieb',
  unter_mindestauftrag: (netto: number, min: number) =>
    `Unter dem Mindestauftrag von ${formatEuro(min)}: ${formatEuro(Math.round(netto))} netto`,
  aussen_klein: (grenze: number) => `Außerhalb des Einzugsgebiets und unter ${formatEuro(grenze)} netto`,
  fehlgeschlagen: 'Bewertung fehlgeschlagen – bitte selbst kalkulieren',
  ohne_ki: (grund: 'ki_deaktiviert' | 'ki_budget' | null) =>
    grund === 'ki_budget'
      ? 'Ohne KI-Bewertung (Monatsbudget ausgeschöpft) – bitte selbst prüfen'
      : 'Ohne KI-Bewertung – bitte selbst prüfen',
  machbarkeit_unklar: 'Machbarkeit laut KI-Bewertung unklar',
  machbarkeit_eingeschraenkt: 'Laut KI-Bewertung nur eingeschränkt machbar',
  ki_mengen: `Preisrahmen aus KI-geschätzten Mengen (${formatBreite(0.3)})`,
  kein_preis: (grund: 'fehlen' | 'ungueltig' | null) =>
    grund === 'ungueltig'
      ? 'Kein Preis: KI-Mengen ungültig – bitte selbst kalkulieren'
      : grund === 'fehlen'
        ? 'Kein Preis: KI-Mengen fehlen – bitte selbst kalkulieren'
        : 'Kein Preis – bitte selbst kalkulieren',
  breite: (breite: number) => `Weiter Preisrahmen (${formatBreite(breite)}), weil Angaben fehlen`,
  budget: (obergrenze: number, min: number) =>
    `Budget passt nicht: Kundenbudget bis ${formatEuro(obergrenze)}, Preisrahmen ab ${formatEuro(min)}`,
  eilig: (stunden: number, grenze: number) =>
    `„So bald wie möglich“ bei ${formatZahl(Math.round(stunden))}${NNBSP}h Werkstatt (mehr als ${grenze}${NNBSP}h)`,
  denkmal: 'Denkmalschutz angegeben',
  build_mismatch: 'Möbel-Berechnung weicht von der Kundenansicht ab (Türen, Schubkästen oder Scharniere)',
  anfrage_mail_failed: 'Die Anfrage-Mail ist nicht angekommen – Anhänge fehlen, bitte beim Kunden anfordern',
} as const;

export const EMPFEHLUNG_LABEL = {
  freigeben: 'Freigeben empfohlen',
  pruefen: 'Prüfen',
  absagen: 'Absage empfohlen',
} as const;

/** TL;DR subject prefix per recommendation (§7.2). */
export const BETREFF_PREFIX = {
  freigeben: '[Angebot prüfen]',
  pruefen: '[Bitte prüfen]',
  absagen: '[Absage empfohlen]',
} as const;

export const MACHBARKEIT_LABEL = {
  machbar: 'machbar',
  eingeschraenkt: 'eingeschränkt machbar',
  nicht_machbar: 'nicht machbar',
  unklar: 'unklar',
} as const;

export const TIER_LABEL = {
  kern: 'Kerngebiet',
  region: 'Region (Anfahrt nach Absprache)',
  aussen: 'außerhalb des Einzugsgebiets',
  unbekannt: 'unbekannt (PLZ nicht zugeordnet)',
} as const;

export const QUELLE_LABEL = { regeln: 'Regeln', 'ki-mengen': 'KI-Mengen' } as const;

/** TL;DR mail (§7.2). */
export const TLDR = {
  kopf: (kurz: string) => `Neue Anfrage #${kurz}`,
  empfehlung: 'Empfehlung',
  keineAuffaelligkeiten: 'Keine Auffälligkeiten.',
  preisrahmen: 'Preisrahmen brutto',
  preis: (range: string, quelle: string, breite: number) => `${range} (${quelle}, ${formatBreite(breite)})`,
  keinPreis: 'kein Preis – selbst kalkulieren',
  machbarkeit: 'Machbarkeit',
  machbarkeitOhneKi: 'nicht bewertet',
  budget: 'Kundenbudget',
  keinBudget: 'keine Angabe',
  gebiet: 'Einzugsgebiet',
  fehlend: 'Fehlende Angaben',
  keineFehlend: 'keine',
  link: 'Ansehen und entscheiden',
  gueltig: (datum: string) => `Der Link gilt bis ${datum}.`,
  fussKi: 'KI-gestützte Bewertung – nichts wurde an den Kunden gesendet.',
  fussOhneKi: 'Ohne KI-Bewertung – nichts wurde an den Kunden gesendet.',
  fussFehlgeschlagen: 'Bewertung fehlgeschlagen – nichts wurde an den Kunden gesendet.',
  /** Subject when there is no range. */
  ohnePreis: 'kein Preis',
} as const;

/** Reminder mail (§3): once, after 2 working days without a decision. */
export const ERINNERUNG = {
  betreff: (kurz: string, kurzbeschreibung: string) => `[Erinnerung] Anfrage #${kurz} wartet – ${kurzbeschreibung}`,
  text: (kurz: string, seit: string, gueltigBis: string) =>
    [
      `Die Anfrage #${kurz} wartet seit ${seit} auf Ihre Entscheidung.`,
      `Im Konfigurator ist dem Kunden eine Antwort innerhalb von 2${NNBSP}Werktagen zugesagt.`,
      '',
      `Den Link „Ansehen und entscheiden“ finden Sie in der vorigen Mail dieses Verlaufs. Er gilt bis ${gueltigBis}.`,
      '',
      'Nichts wurde an den Kunden gesendet.',
    ].join('\n'),
} as const;

/** Review page (§7.3). */
export const SEITE = {
  sprache: 'de',
  kopf: 'Schreinerei Schmidt · Angebots-Assistent',
  titel: (kurz: string, beschreibung: string) => `Anfrage #${kurz}: ${beschreibung}`,
  pilot: (modus: string) =>
    modus === 'live'
      ? ''
      : modus === 'allowlist'
        ? 'Pilotbetrieb: Kundenmails gehen nur an freigegebene Adressen, alle anderen an Ihre Adresse.'
        : 'Pilotbetrieb (Trockenlauf): Es wird keine Mail verschickt; alles landet im Postausgang des Servers.',
  status: 'Status',
  statusLabel: {
    eingegangen: 'Eingegangen, Bewertung läuft',
    bewertet: 'Wartet auf Ihre Entscheidung',
    bewertung_fehlgeschlagen: 'Bewertung fehlgeschlagen – wartet auf Ihre Entscheidung',
    gesendet: 'Angebot gesendet',
    manuell: 'Sie kalkulieren selbst',
    kontakt: 'Kunde wird kontaktiert',
    abgesagt: 'Abgesagt',
    abgelaufen: 'Abgelaufen',
  },
  empfehlung: 'Empfehlung',
  kunde: 'Kunde und Anfrage',
  projekt: 'Projekt',
  freitext: 'Angaben des Kunden in eigenen Worten',
  anhaenge: (n: number) => (n === 1 ? '1 Anhang in der Anfrage-Mail' : `${n} Anhänge in der Anfrage-Mail`),
  kalkulation: 'Kalkulation (intern, netto)',
  spalten: { position: 'Position', menge: 'Menge', netto: 'Netto' },
  summeNetto: 'Summe netto',
  mitteBrutto: 'Mitte brutto',
  rahmen: 'Preisrahmen brutto',
  quelle: 'Quelle',
  annahmen: 'Annahmen (stehen auch im Angebot an den Kunden)',
  keineKalkulation: 'Es gibt keinen berechneten Preis. Bitte tragen Sie unten einen eigenen Preisrahmen ein.',
  bewertung: 'KI-Bewertung',
  ohneKi: 'Für diesen Fall gibt es keine KI-Bewertung.',
  gruende: 'Gründe',
  risiken: 'Risiken',
  fehlend: 'Fehlende Angaben',
  machbarkeit: 'Machbarkeit',
  passt: 'Passt zum Betrieb',
  ja: 'ja',
  nein: 'nein',

  freigeben: 'Freigeben',
  freigebenHinweis:
    'Prüfen Sie Preisrahmen und Text und ändern Sie, was nötig ist. Im nächsten Schritt sehen Sie die fertige Mail an den Kunden und bestätigen den Versand.',
  manuellTitel: 'Eigener Preisrahmen',
  manuellHinweis:
    'Tragen Sie Ihren Preisrahmen ein und prüfen Sie den Text. Im nächsten Schritt sehen Sie die fertige Mail an den Kunden und bestätigen den Versand.',
  preisLegend: `Preisrahmen brutto in Euro (inkl. 19${NNBSP}% MwSt.)`,
  von: 'Von (Euro)',
  bis: 'Bis (Euro)',
  preisHinweis: 'Ganze Euro, zum Beispiel 2450.',
  textLegend: 'Text des Angebots',
  einleitung: 'Einleitung',
  leistung: 'Leistungen',
  nichtEnthalten: 'Nicht enthalten',
  naechsterSchritt: 'Nächster Schritt',
  eineProZeile: 'Eine Angabe pro Zeile.',
  textHinweis:
    'Der Preisrahmen steht nur in den beiden Feldern oben. Im Text sind keine Beträge, Prozentangaben, Termine, Fristen, Links oder pauschalen Umweltaussagen möglich; die bestätigten Kontaktdaten des Betriebs dürfen vorkommen.',
  vorschau: 'PDF-Vorschau öffnen (mit dem gespeicherten Text)',
  weiterSenden: 'Weiter zur Bestätigung',

  ablehnen: 'Nicht freigeben',
  folgeLegend: 'Wie geht es weiter?',
  folge: {
    manuell: 'Selbst kalkulieren (nichts wird gesendet)',
    kontakt: 'Kunden kontaktieren',
    absage: 'Absagen',
  },
  kontaktLegend: 'Bei „Kunden kontaktieren“',
  kontaktArtLegend: 'Auf welchem Weg?',
  kontaktArt: {
    mail: 'Rückfragen per E-Mail senden',
    anruf: 'Ich rufe selbst an (nichts wird gesendet)',
  },
  rueckfragen: 'Rückfragen an den Kunden',
  absageLegend: 'Bei „Absagen“',
  persoenlich: 'Persönliche Zeile (optional)',
  persoenlichHinweis: 'Steht in der Absage direkt nach dem ersten Absatz.',
  grundLegend: 'Interner Grund (wird nicht gesendet)',
  grund: {
    nicht_wirtschaftlich: 'Nicht wirtschaftlich',
    nicht_machbar: 'Nicht machbar',
    keine_kapazitaet: 'Keine Kapazität',
    sonstiges: 'Sonstiges',
  },
  weiter: 'Weiter',

  // Confirm step
  bestaetigenTitel: (an: string) => `Jetzt an ${an} senden?`,
  bestaetigenArt: { angebot: 'Angebot', rueckfragen: 'Rückfragen', absage: 'Absage' },
  betreff: 'Betreff',
  empfaenger: 'An',
  mailtext: 'Text der Mail',
  anhang: (name: string) => `Anhang: ${name}`,
  pdfMitAenderungen: 'PDF-Vorschau mit diesen Angaben öffnen',
  jetztSenden: (an: string) => `Jetzt an ${an} senden`,
  zurueck: 'Zurück zum Bearbeiten',
  umgeleitet: 'Pilotbetrieb: Die Mail geht nicht an den Kunden, sondern an Ihre Adresse.',

  // Outcomes
  ergebnis: {
    gesendet: 'Das Angebot wurde gesendet.',
    kontakt_mail: 'Die Rückfragen wurden gesendet.',
    kontakt_anruf: 'Vermerkt: Sie rufen den Kunden selbst an. Es wurde nichts gesendet.',
    manuell: 'Vermerkt: Sie kalkulieren selbst. Es wurde nichts gesendet.',
    abgesagt: 'Die Absage wurde gesendet.',
  },
  gesendetAm: (wann: string, an: string) => `Gesendet am ${wann} an ${an}.`,
  umgeleitetAm: (wann: string) => `Im Pilotbetrieb am ${wann} an Ihre Adresse umgeleitet.`,
  gesendeterText: 'Gesendeter Text',
  angebotsnummer: 'Angebotsnummer',
  interneNotiz: 'Interner Grund',
  manuellWeiter:
    'Sobald Ihr Preisrahmen feststeht, tragen Sie ihn unten unter „Eigener Preisrahmen“ ein und senden das Angebot von dort.',
  zurSeite: 'Zur Übersicht des Vorgangs',
  veraltet: 'Dieser Vorgang wurde inzwischen bearbeitet. Es wurde nichts erneut gesendet. Hier ist der aktuelle Stand.',
  nichtErlaubt: 'Diese Aktion ist im aktuellen Status nicht möglich. Es wurde nichts gesendet.',
  sperre: (wann: string) =>
    `Ein Versand vom ${wann} wurde möglicherweise nicht abgeschlossen. Bitte prüfen Sie in Ihrem Postfach (Sie erhalten jede Kundenmail als Blindkopie), ob die Mail angekommen ist, bevor Sie erneut senden.`,
  sendenFehlgeschlagen:
    'Die Mail konnte nicht gesendet werden. Es wurde nichts geändert. Bitte versuchen Sie es in einigen Minuten erneut.',
  bereinigt: 'Die Inhalte dieses Vorgangs wurden nach Ablauf der Aufbewahrungsfrist gelöscht.',
  laeuft: 'Die Bewertung läuft noch. Sie erhalten eine Mail, sobald sie fertig ist.',
  linkGueltig: (datum: string) => `Dieser Link gilt bis ${datum}.`,

  // Validation (error summary)
  fehlerTitel: 'Bitte prüfen Sie Ihre Eingaben',
  fehler: {
    min: 'Bitte geben Sie bei „Von“ einen ganzen Eurobetrag größer als 0 ein.',
    max: 'Bitte geben Sie bei „Bis“ einen ganzen Eurobetrag größer als 0 ein.',
    reihenfolge: '„Von“ darf nicht größer sein als „Bis“.',
    zuGross: 'Der Betrag ist zu groß. Bitte prüfen Sie die Eingabe.',
    folge: 'Bitte wählen Sie, wie es weitergehen soll.',
    kontaktArt: 'Bitte wählen Sie, ob Sie Rückfragen senden oder selbst anrufen.',
    grund: 'Bitte wählen Sie einen internen Grund.',
    rueckfragenLeer: 'Bitte geben Sie mindestens eine Rückfrage ein.',
    leer: (feld: string) => `„${feld}“ darf nicht leer sein.`,
    laenge: (feld: string) => `„${feld}“ ist zu lang oder hat zu viele Zeilen.`,
    regel: (feld: string, regeln: string) => `„${feld}“ enthält ${regeln}. Bitte nehmen Sie das aus dem Text.`,
  },
  /** Guard codes (claude/guards.ts) as owner-readable words. */
  regel: {
    betrag: 'einen Betrag',
    prozent: 'eine Prozentangabe',
    url: 'einen Link oder eine Webadresse',
    email: 'eine E-Mail-Adresse',
    telefon: 'eine Telefonnummer',
    datum: 'ein Datum oder einen Termin',
    frist: 'eine Frist oder Lieferzeit',
    gruen: 'eine pauschale Umweltaussage',
    laenge: 'zu viel Text',
    leer: 'eine leere Angabe',
  },
} as const;

/** PIN page (§7.4). */
export const PIN = {
  titel: 'PIN eingeben',
  text: `Bitte geben Sie die PIN ein, um den Vorgang zu öffnen. Sie bleiben 12${NNBSP}Stunden angemeldet.`,
  feld: 'PIN',
  senden: 'Öffnen',
  falsch: 'Die PIN ist nicht richtig.',
  gesperrt: `Zu viele Versuche. Bitte warten Sie 15${NNBSP}Minuten.`,
  weiter: 'Weiter zum Vorgang',
} as const;

/** Plain error pages: no case data. */
export const FEHLERSEITE = {
  404: { titel: 'Nicht gefunden', text: 'Dieser Link ist ungültig.' },
  410: {
    titel: 'Link abgelaufen',
    text: 'Dieser Link ist abgelaufen. Bitte antworten Sie dem Kunden direkt aus Ihrem Postfach.',
  },
  403: {
    titel: 'Nicht erlaubt',
    text: 'Diese Anfrage wurde abgewiesen. Bitte öffnen Sie den Link aus der Mail noch einmal.',
  },
  415: { titel: 'Nicht erlaubt', text: 'Diese Anfrage wurde abgewiesen.' },
  413: { titel: 'Zu groß', text: 'Die Eingaben sind zu lang.' },
  429: { titel: 'Zu viele Versuche', text: PIN.gesperrt },
  500: { titel: 'Fehler', text: 'Es ist ein Fehler aufgetreten. Bitte versuchen Sie es später noch einmal.' },
} as const;
