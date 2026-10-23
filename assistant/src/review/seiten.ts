// HTML of the review page (docs/angebot.md §7.3), server-rendered from template functions; every
// interpolated value is escaped (html.ts). No JS: every action is a form POST, the confirm step is a
// second page, the PDF preview a GET link. One h1 per page, labelled fields, fieldsets with legends
// for radio groups, an error summary with links to the fields, visible focus, targets ≥ 44 px
// (review/css.ts). Copy in texte/inhaber.ts.
import type { Kalkulation } from '../../../src/lib/configurator/pricing/types';
import type { SendMode } from '../config';
import { istEmpfehlung, type EmpfehlungErgebnis } from '../empfehlung';
import {
  fallDaten,
  freitextZeilen,
  kurzbeschreibung,
  projektZeilen,
  stepZeilen,
  tierVon,
  vorbelegteAnnahmen,
  type Zeile,
} from '../fall-daten';
import { formatBreite, formatDatum, formatEuro, formatEuroRange, formatMenge, formatZeitpunkt } from '../format';
import { html, raw, type Roh } from '../html';
import type { Fall } from '../store';
import {
  EMPFEHLUNG_LABEL,
  FEHLERSEITE,
  MACHBARKEIT_LABEL,
  PIN,
  QUELLE_LABEL,
  SEITE,
  TIER_LABEL,
} from '../texte/inhaber';
import { istEntscheidung, istSperre, type Entscheidung } from './entscheidung';
import { ABSAGE_GRUENDE, eingabeVon, type Eingabe, type Fehler, type Feld } from './formular';

export const CSS_PATH = '/angebot/assets/review.css';

const pfad = (id: string, aktion?: string): string =>
  aktion ? `/angebot/${encodeURIComponent(id)}/${aktion}` : `/angebot/${encodeURIComponent(id)}`;
export const seitenLink = (id: string, token: string): string => `${pfad(id)}?t=${encodeURIComponent(token)}`;
export const vorschauLink = (id: string, token: string): string =>
  `${pfad(id, 'vorschau.pdf')}?t=${encodeURIComponent(token)}`;

/** The page frame. */
export function dokument(titel: string, inhalt: Roh, o: { fehler?: boolean; kopf?: Roh } = {}): string {
  return html`<!doctype html>
    <html lang="de">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
        <title>${o.fehler ? `Fehler: ${titel}` : titel} – ${SEITE.kopf}</title>
        <link rel="stylesheet" href="${CSS_PATH}" />
        ${o.kopf}
      </head>
      <body>
        <a class="skip" href="#inhalt">Zum Inhalt</a>
        <header class="kopf"><p>${SEITE.kopf}</p></header>
        <main id="inhalt" tabindex="-1">${inhalt}</main>
      </body>
    </html> `.html;
}

/** A plain error page without case data (404, 410, 403, …). */
export function fehlerSeite(status: keyof typeof FEHLERSEITE): string {
  const t = FEHLERSEITE[status];
  return dokument(
    t.titel,
    html`<h1>${t.titel}</h1>
      <p>${t.text}</p>`,
  );
}

/** With a PIN: one same-site hop so the SameSite=Strict cookie is sent (a mail link is cross-site). */
export function weiterSeite(ziel: string): string {
  return dokument(
    PIN.titel,
    html`<h1>${PIN.titel}</h1>
      <p><a href="${ziel}">${PIN.weiter}</a></p>`,
    { kopf: html`<meta http-equiv="refresh" content="0;url=${ziel}" />` },
  );
}

export function pinSeite(id: string, token: string, fehler: string | null): string {
  return dokument(
    PIN.titel,
    html`<h1>${PIN.titel}</h1>
      ${
        fehler
          ? html`<div class="fehlerliste" role="alert" tabindex="-1">
              <h2>${SEITE.fehlerTitel}</h2>
              <ul>
                <li><a href="#pin">${fehler}</a></li>
              </ul>
            </div>`
          : null
      }
      <p>${PIN.text}</p>
      <form method="post" action="${pfad(id, 'pin')}">
        <input type="hidden" name="t" value="${token}" />
        <div class="feld">
          <label for="pin">${PIN.feld}</label>
          ${fehler ? html`<span class="fehlertext" id="pin-fehler">${fehler}</span>` : null}
          <input
            class="kurz"
            type="password"
            id="pin"
            name="pin"
            inputmode="numeric"
            autocomplete="current-password"
            required${raw(fehler ? ' aria-invalid="true" aria-describedby="pin-fehler"' : '')}
          />
        </div>
        <div class="knoepfe"><button type="submit">${PIN.senden}</button></div>
      </form>`,
    { fehler: fehler !== null },
  );
}

export interface Kontext {
  fall: Fall;
  token: string;
  modus: SendMode;
  now: number;
}

const hidden = (name: string, value: string | number): Roh =>
  html`<input type="hidden" name="${name}" value="${String(value)}" />`;

const basisFelder = (k: Kontext): Roh => html`${hidden('t', k.token)}${hidden('v', k.fall.version)}`;

function hinweis(text: string, art: 'info' | 'ok' | 'warn' = 'info'): Roh {
  const cls = art === 'ok' ? 'hinweis hinweis-ok' : art === 'warn' ? 'hinweis hinweis-warn' : 'hinweis';
  return html`<p class="${cls}" ${raw(art === 'warn' ? ' role="alert"' : ' role="status"')}>${text}</p>`;
}

function fehlerListe(fehler: readonly Fehler[], prefix: string): Roh | null {
  if (!fehler.length) return null;
  return html`<div class="fehlerliste" role="alert" aria-labelledby="fehler-titel" tabindex="-1">
    <h2 id="fehler-titel">${SEITE.fehlerTitel}</h2>
    <ul>
      ${fehler.map((f) => html`<li><a href="#${prefix}-${f.feld}">${f.text}</a></li>`)}
    </ul>
  </div>`;
}

const fehlerVon = (fehler: readonly Fehler[], feld: Feld): string[] =>
  fehler.filter((f) => f.feld === feld).map((f) => f.text);

/** A labelled text field with hint and errors. */
function textfeld(
  prefix: string,
  feld: Feld,
  label: string,
  wert: string,
  fehler: readonly Fehler[],
  o: { mehrzeilig?: boolean; hilfe?: string; kurz?: boolean; zeilen?: number; pflicht?: boolean } = {},
): Roh {
  const id = `${prefix}-${feld}`;
  const errs = fehlerVon(fehler, feld);
  const desc = [o.hilfe ? `${id}-hilfe` : null, errs.length ? `${id}-fehler` : null].filter(Boolean).join(' ');
  const attrs = raw(
    `${o.pflicht ? ' required' : ''}${errs.length ? ' aria-invalid="true"' : ''}${desc ? ` aria-describedby="${desc}"` : ''}`,
  );
  const control = o.mehrzeilig
    ? html`<textarea id="${id}" name="${feld}" rows="${o.zeilen ?? 4}" ${attrs}>${wert}</textarea>`
    : html`<input
        type="text"
        class="${o.kurz ? 'kurz' : ''}"
        id="${id}"
        name="${feld}"
        value="${wert}"
        inputmode="${o.kurz ? 'numeric' : 'text'}"
        autocomplete="off"
        ${attrs}
      />`;
  return html`<div class="feld">
    <label for="${id}">${label}</label>
    ${o.hilfe ? html`<span class="hilfe" id="${id}-hilfe">${o.hilfe}</span>` : null}
    ${errs.length ? html`<span class="fehlertext" id="${id}-fehler">${errs.join(' ')}</span>` : null} ${control}
  </div>`;
}

/** A radio group in a fieldset. */
function radios(
  prefix: string,
  feld: Feld,
  legend: string,
  optionen: readonly (readonly [string, string])[],
  wert: string | undefined,
  fehler: readonly Fehler[],
): Roh {
  const errs = fehlerVon(fehler, feld);
  const errId = `${prefix}-${feld}-fehler`;
  return html`<fieldset${raw(errs.length ? ` aria-describedby="${errId}"` : '')}>
<legend id="${prefix}-${feld}">${legend}</legend>
${errs.length ? html`<span class="fehlertext" id="${errId}">${errs.join(' ')}</span>` : null}
${optionen.map(
  ([v, label], i) =>
    html`<div class="wahl">
      <input
        type="radio"
        id="${prefix}-${feld}-${i}"
        name="${feld}"
        value="${v}"
        ${raw(wert === v ? ' checked' : '')}
      /><label for="${prefix}-${feld}-${i}">${label}</label>
    </div>`,
)}
</fieldset>`;
}

function datenListe(zeilen: readonly Zeile[]): Roh | null {
  if (!zeilen.length) return null;
  return html`<dl class="daten">
    ${zeilen.map(
      (z) =>
        html`<dt>${z.label}</dt>
          <dd>${z.wert}</dd>`,
    )}
  </dl>`;
}

function empfehlungBlock(e: EmpfehlungErgebnis | null): Roh | null {
  if (!e) return null;
  return html`<section class="empfehlung stufe-${e.empfehlung}" aria-labelledby="empfehlung">
    <h2 id="empfehlung">${SEITE.empfehlung}: ${EMPFEHLUNG_LABEL[e.empfehlung]}</h2>
    ${
      e.flags.length
        ? html`<ul>
            ${e.flags.map((f) => html`<li>${f.text}</li>`)}
          </ul>`
        : null
    }
  </section>`;
}

function kundeBlock(fall: Fall): Roh {
  const v = fall.payload.values;
  const tier = tierVon(v);
  const kontakt = stepZeilen(v, 'kontakt');
  const rahmen = stepZeilen(v, 'rahmen');
  const gebiet: Zeile = { name: 'gebiet', label: 'Einzugsgebiet', wert: TIER_LABEL[tier ?? 'unbekannt'] };
  const frei = freitextZeilen(v);
  return html`<section aria-labelledby="kunde">
    <h2 id="kunde">${SEITE.kunde}</h2>
    ${datenListe([...kontakt, ...rahmen, gebiet])}
    <h3>${SEITE.projekt}</h3>
    ${datenListe(projektZeilen(v))}
    ${
      frei.length
        ? html`<h3>${SEITE.freitext}</h3>
            ${frei.map(
              (z) =>
                html`<p><strong>${z.label}</strong></p>
                  <p class="freitext">${z.wert}</p>`,
            )}`
        : null
    }
    ${fall.payload.anhaenge.length ? html`<p class="leise">${SEITE.anhaenge(fall.payload.anhaenge.length)}</p>` : null}
  </section>`;
}

function kalkulationBlock(k: Kalkulation | null): Roh {
  if (!k) {
    return html`<section aria-labelledby="kalkulation">
      <h2 id="kalkulation">${SEITE.kalkulation}</h2>
      <p>${SEITE.keineKalkulation}</p>
    </section>`;
  }
  return html`<section aria-labelledby="kalkulation">
    <h2 id="kalkulation">${SEITE.kalkulation}</h2>
    <div class="tabelle">
      <table>
        <thead>
          <tr>
            <th scope="col">${SEITE.spalten.position}</th>
            <th scope="col" class="zahl">${SEITE.spalten.menge}</th>
            <th scope="col" class="zahl">${SEITE.spalten.netto}</th>
          </tr>
        </thead>
        <tbody>
          ${k.positionen.map(
            (p) =>
              html`<tr>
                <td>${p.text}</td>
                <td class="zahl">${formatMenge(p.menge, p.einheit)}</td>
                <td class="zahl">${formatEuro(p.netto, { cents: true })}</td>
              </tr>`,
          )}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colspan="2">${SEITE.summeNetto}</th>
            <td class="zahl">${formatEuro(k.netto, { cents: true })}</td>
          </tr>
        </tfoot>
      </table>
    </div>
    <dl class="daten">
      <dt>${SEITE.mitteBrutto}</dt>
      <dd>${formatEuro(Math.round(k.brutto))}</dd>
      <dt>${SEITE.rahmen}</dt>
      <dd>${formatEuroRange(k.min, k.max)} (${formatBreite(k.breite)})</dd>
      <dt>${SEITE.quelle}</dt>
      <dd>${QUELLE_LABEL[k.quelle]}</dd>
    </dl>
    ${
      k.annahmen.length
        ? html`<h3>${SEITE.annahmenIntern}</h3>
            <ul>
              ${k.annahmen.map((a) => html`<li>${a}</li>`)}
            </ul>`
        : null
    }
  </section>`;
}

function bewertungBlock(fall: Fall): Roh {
  const rec = fallDaten(fall).bewertung;
  const b = rec?.quelle === 'ki' ? rec.bewertung : null;
  if (!b) {
    return html`<section aria-labelledby="bewertung">
      <h2 id="bewertung">${SEITE.bewertung}</h2>
      <p>${SEITE.ohneKi}</p>
    </section>`;
  }
  const liste = (titel: string, items: readonly string[]) =>
    items.length
      ? html`<h3>${titel}</h3>
          <ul>
            ${items.map((x) => html`<li>${x}</li>`)}
          </ul>`
      : null;
  return html`<section aria-labelledby="bewertung">
    <h2 id="bewertung">${SEITE.bewertung}</h2>
    <dl class="daten">
      <dt>${SEITE.machbarkeit}</dt>
      <dd>${MACHBARKEIT_LABEL[b.machbarkeit]}</dd>
      <dt>${SEITE.passt}</dt>
      <dd>${b.passt_zum_betrieb ? SEITE.ja : SEITE.nein}</dd>
    </dl>
    ${liste(SEITE.gruende, b.gruende)} ${liste(SEITE.risiken, b.risiken)} ${liste(SEITE.fehlend, b.fehlende_angaben)}
  </section>`;
}

/** The Angebot form (Freigeben, or the „Eigener Preisrahmen“ of /manuell). */
function angebotFormular(k: Kontext, aktion: 'freigeben' | 'manuell', e: Eingabe, fehler: readonly Fehler[]): Roh {
  const p = aktion === 'freigeben' ? 'f' : 'm';
  const titel = aktion === 'freigeben' ? SEITE.freigeben : SEITE.manuellTitel;
  return html`<section class="aktion" aria-labelledby="${p}-titel">
    <h2 id="${p}-titel">${titel}</h2>
    ${fehlerListe(fehler, p)}
    <p>${aktion === 'freigeben' ? SEITE.freigebenHinweis : SEITE.manuellHinweis}</p>
    <form method="post" action="${pfad(k.fall.id, aktion)}" novalidate>
      ${basisFelder(k)}${hidden('schritt', 'pruefen')}
      <fieldset>
        <legend>${SEITE.preisLegend}</legend>
        <p class="hilfe" id="${p}-preis-hilfe">${SEITE.preisHinweis}</p>
        <div class="reihe">
          ${textfeld(p, 'min', SEITE.von, e.min ?? '', fehler, { kurz: true, pflicht: true })}
          ${textfeld(p, 'max', SEITE.bis, e.max ?? '', fehler, { kurz: true, pflicht: true })}
        </div>
      </fieldset>
      <fieldset>
        <legend>${SEITE.textLegend}</legend>
        <p class="hilfe">${SEITE.textHinweis}</p>
        ${textfeld(p, 'einleitung', SEITE.einleitung, e.einleitung ?? '', fehler, { mehrzeilig: true, zeilen: 5, pflicht: true })}
        ${textfeld(p, 'leistung', SEITE.leistung, e.leistung ?? '', fehler, { mehrzeilig: true, zeilen: 6, hilfe: SEITE.eineProZeile, pflicht: true })}
        ${textfeld(p, 'nicht_enthalten', SEITE.nichtEnthalten, e.nicht_enthalten ?? '', fehler, { mehrzeilig: true, zeilen: 4, hilfe: SEITE.eineProZeile })}
        ${textfeld(p, 'naechster_schritt', SEITE.naechsterSchritt, e.naechster_schritt ?? '', fehler, { mehrzeilig: true, zeilen: 5, pflicht: true })}
        ${textfeld(p, 'annahmen', SEITE.annahmenFeld, e.annahmen ?? '', fehler, { mehrzeilig: true, zeilen: 4, hilfe: SEITE.annahmenHinweis })}
      </fieldset>
      <p><a href="${vorschauLink(k.fall.id, k.token)}">${SEITE.vorschau}</a></p>
      <div class="knoepfe"><button type="submit">${SEITE.weiterSenden}</button></div>
    </form>
  </section>`;
}

function ablehnenFormular(k: Kontext, e: Eingabe, fehler: readonly Fehler[]): Roh {
  const p = 'a';
  return html`<section class="aktion" aria-labelledby="a-titel">
    <h2 id="a-titel">${SEITE.ablehnen}</h2>
    ${fehlerListe(fehler, p)}
    <form method="post" action="${pfad(k.fall.id, 'ablehnen')}" novalidate>
      ${basisFelder(k)}${hidden('schritt', 'pruefen')}
      ${radios(
        p,
        'folge',
        SEITE.folgeLegend,
        [
          ['manuell', SEITE.folge.manuell],
          ['kontakt', SEITE.folge.kontakt],
          ['absage', SEITE.folge.absage],
        ],
        e.folge,
        fehler,
      )}
      <fieldset>
        <legend>${SEITE.kontaktLegend}</legend>
        ${radios(
          p,
          'kontakt_art',
          SEITE.kontaktArtLegend,
          [
            ['mail', SEITE.kontaktArt.mail],
            ['anruf', SEITE.kontaktArt.anruf],
          ],
          e.kontakt_art,
          fehler,
        )}
        ${textfeld(p, 'rueckfragen', SEITE.rueckfragen, e.rueckfragen ?? '', fehler, { mehrzeilig: true, zeilen: 5, hilfe: SEITE.eineProZeile })}
      </fieldset>
      <fieldset>
        <legend>${SEITE.absageLegend}</legend>
        ${textfeld(p, 'persoenlich', SEITE.persoenlich, e.persoenlich ?? '', fehler, { mehrzeilig: true, zeilen: 3, hilfe: SEITE.persoenlichHinweis })}
        ${radios(
          p,
          'grund',
          SEITE.grundLegend,
          ABSAGE_GRUENDE.map((g) => [g, SEITE.grund[g]] as const),
          e.grund,
          fehler,
        )}
      </fieldset>
      <div class="knoepfe"><button type="submit">${SEITE.weiter}</button></div>
    </form>
  </section>`;
}

function entscheidungBlock(d: Entscheidung): Roh {
  const ergebnis =
    d.aktion === 'freigeben' || d.aktion === 'eigener_preis'
      ? SEITE.ergebnis.gesendet
      : d.aktion === 'manuell'
        ? SEITE.ergebnis.manuell
        : d.aktion === 'absage'
          ? SEITE.ergebnis.abgesagt
          : d.kontaktArt === 'anruf'
            ? SEITE.ergebnis.kontakt_anruf
            : SEITE.ergebnis.kontakt_mail;
  const m = d.mail;
  return html`<section aria-labelledby="ergebnis">
    <h2 id="ergebnis">${ergebnis}</h2>
    ${m ? html`<p>${m.umgeleitet ? SEITE.umgeleitetAm(formatZeitpunkt(m.at)) : SEITE.gesendetAm(formatZeitpunkt(m.at), m.an)}</p>` : null}
    <dl class="daten">
      ${
        d.angebotsnummer
          ? html`<dt>${SEITE.angebotsnummer}</dt>
              <dd>${d.angebotsnummer}</dd>`
          : null
      }
      ${
        d.preis
          ? html`<dt>${SEITE.rahmen}</dt>
              <dd>${formatEuroRange(d.preis.min, d.preis.max)}</dd>`
          : null
      }
      ${
        d.grund
          ? html`<dt>${SEITE.interneNotiz}</dt>
              <dd>${SEITE.grund[d.grund]}</dd>`
          : null
      }
      ${
        m
          ? html`<dt>${SEITE.betreff}</dt>
              <dd>${m.betreff}</dd>`
          : null
      }
      ${
        m?.anhang
          ? html`<dt>${SEITE.anhang(m.anhang)}</dt>
              <dd></dd>`
          : null
      }
    </dl>
    ${
      m
        ? html`<h3>${SEITE.gesendeterText}</h3>
            <pre class="mail">${m.text}</pre>`
        : null
    }
  </section>`;
}

export interface FallSeiteOptionen {
  hinweis?: { text: string; art: 'info' | 'ok' | 'warn' };
  /** Which form the errors and the input belong to. */
  formular?: 'freigeben' | 'manuell' | 'ablehnen';
  eingabe?: Eingabe;
  fehler?: readonly Fehler[];
  /** Outcome page: this decision on top. */
  ergebnis?: Entscheidung;
}

/** The review page of a case in any status. */
export function fallSeite(k: Kontext, o: FallSeiteOptionen = {}): string {
  const { fall } = k;
  const titel = SEITE.titel(fall.kurz, kurzbeschreibung(fall.payload.values));
  if (fall.bereinigtAt !== null) {
    return dokument(
      titel,
      html`<h1>${titel}</h1>
        ${hinweis(SEITE.bereinigt)}`,
    );
  }
  const d = fallDaten(fall);
  const fehler = o.fehler ?? [];
  const e = istEmpfehlung(fall.empfehlung) ? fall.empfehlung : null;
  const entscheidung = o.ergebnis ?? (istEntscheidung(fall.entscheidung) ? fall.entscheidung : null);
  const vorbelegt = eingabeVon(d.text, fall.preisMin, fall.preisMax, vorbelegteAnnahmen(fall));
  const rueckfragen = (d.bewertung?.bewertung?.rueckfragen ?? []).join('\n');
  const eingabe = (f: 'freigeben' | 'manuell' | 'ablehnen'): Eingabe =>
    o.formular === f && o.eingabe ? o.eingabe : f === 'ablehnen' ? { rueckfragen } : vorbelegt;
  const fehlerFuer = (f: 'freigeben' | 'manuell' | 'ablehnen') => (o.formular === f ? fehler : []);

  const pilot = SEITE.pilot(k.modus);
  const sperre = istSperre(fall.sperre) ? fall.sperre : null;
  const offen = fall.status === 'bewertet' || fall.status === 'bewertung_fehlgeschlagen';
  const formulare: (Roh | null)[] = [];
  if (fall.status === 'bewertet') {
    formulare.push(angebotFormular(k, 'freigeben', eingabe('freigeben'), fehlerFuer('freigeben')));
  }
  if (fall.status === 'bewertung_fehlgeschlagen' || fall.status === 'manuell') {
    formulare.push(angebotFormular(k, 'manuell', eingabe('manuell'), fehlerFuer('manuell')));
  }
  if (offen) formulare.push(ablehnenFormular(k, eingabe('ablehnen'), fehlerFuer('ablehnen')));

  const inhalt = html`<h1 tabindex="-1">${o.ergebnis ? ergebnisTitel(o.ergebnis) : titel}</h1>
    ${o.hinweis ? hinweis(o.hinweis.text, o.hinweis.art) : null}
    ${sperre && offen ? hinweis(SEITE.sperre(formatZeitpunkt(sperre.at)), 'warn') : null}
    ${pilot ? html`<p class="leise">${pilot}</p>` : null}
    <p><strong>${SEITE.status}:</strong> ${SEITE.statusLabel[fall.status]}${o.ergebnis ? html` · ${titel}` : null}</p>
    ${entscheidung ? entscheidungBlock(entscheidung) : null}
    ${fall.status === 'manuell' ? html`<p>${SEITE.manuellWeiter}</p>` : null}
    ${fall.status === 'eingegangen' ? hinweis(SEITE.laeuft) : null} ${empfehlungBlock(e)} ${kundeBlock(fall)}
    ${kalkulationBlock(d.kalkulation)} ${bewertungBlock(fall)} ${formulare}
    ${fall.tokenExpiresAt && (offen || fall.status === 'manuell') ? html`<p class="leise">${SEITE.linkGueltig(formatDatum(fall.tokenExpiresAt))}</p>` : null}`;
  return dokument(o.ergebnis ? ergebnisTitel(o.ergebnis) : titel, inhalt, { fehler: fehler.length > 0 });
}

function ergebnisTitel(d: Entscheidung): string {
  if (d.aktion === 'freigeben' || d.aktion === 'eigener_preis') return SEITE.ergebnis.gesendet;
  if (d.aktion === 'manuell') return SEITE.ergebnis.manuell;
  if (d.aktion === 'absage') return SEITE.ergebnis.abgesagt;
  return d.kontaktArt === 'anruf' ? SEITE.ergebnis.kontakt_anruf : SEITE.ergebnis.kontakt_mail;
}

export interface MailVorschau {
  art: 'angebot' | 'rueckfragen' | 'absage';
  an: string;
  betreff: string;
  text: string;
  anhang: string | null;
  umgeleitet: boolean;
}

/** The confirm step: the exact mail, „Jetzt an kunde@… senden?“, hidden copies of the input. */
export function bestaetigenSeite(
  k: Kontext,
  aktion: 'freigeben' | 'manuell' | 'ablehnen',
  mail: MailVorschau,
  felder: Readonly<Record<string, string>>,
  o: { hinweis?: { text: string; art: 'info' | 'ok' | 'warn' }; pdf?: boolean } = {},
): string {
  const titel = SEITE.bestaetigenTitel(mail.an);
  const versteckt = Object.entries(felder).map(([n, v]) => hidden(n, v));
  const inhalt = html`<h1 tabindex="-1">${titel}</h1>
    ${o.hinweis ? hinweis(o.hinweis.text, o.hinweis.art) : null} ${mail.umgeleitet ? hinweis(SEITE.umgeleitet) : null}
    <dl class="daten">
      <dt>${SEITE.empfaenger}</dt>
      <dd>${mail.an}</dd>
      <dt>${SEITE.betreff}</dt>
      <dd>${mail.betreff}</dd>
      ${
        mail.anhang
          ? html`<dt>${SEITE.anhang(mail.anhang)}</dt>
              <dd></dd>`
          : null
      }
    </dl>
    <h2>${SEITE.mailtext}</h2>
    <pre class="mail">${mail.text}</pre>
    ${
      o.pdf
        ? html`<form method="get" action="${pfad(k.fall.id, 'vorschau.pdf')}">
            ${hidden('t', k.token)}${['min', 'max', 'einleitung', 'leistung', 'nicht_enthalten', 'naechster_schritt', 'annahmen'].map((n) => (felder[n] !== undefined ? hidden(n, felder[n]!) : null))}
            <div class="knoepfe"><button type="submit" class="sekundaer">${SEITE.pdfMitAenderungen}</button></div>
          </form>`
        : null
    }
    <form method="post" action="${pfad(k.fall.id, aktion)}">
      ${basisFelder(k)} ${versteckt}
      <div class="knoepfe">
        <button type="submit" name="schritt" value="senden">${SEITE.jetztSenden(mail.an)}</button>
        <button type="submit" name="schritt" value="bearbeiten" class="sekundaer">${SEITE.zurueck}</button>
      </div>
    </form>`;
  return dokument(titel, inhalt);
}
