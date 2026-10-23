// The owner's overview of the demo run (`index.html`, docs/angebot.md §11): German, self-contained
// (inline CSS, no script, no external request), readable on a laptop and a phone (the table turns
// into cards below 48 rem), printable (A4 landscape) and accessible (one h1, a captioned table with
// header cells, visible focus, link texts that name their case). It is a local file for the
// presentation, not part of the site, so the site's CSP rules do not apply; every interpolated value
// is still escaped (src/html.ts).
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { PROJECT_TYPE_LABELS } from '../../../src/lib/configurator/labels';
import type { Empfehlung } from '../../src/empfehlung';
import { formatBreite, formatDatum, formatEuroRange, formatZeitpunkt, NNBSP } from '../../src/format';
import { html, raw, type Roh } from '../../src/html';
import { EMPFEHLUNG_LABEL, MACHBARKEIT_LABEL, QUELLE_LABEL } from '../../src/texte/inhaber';
import type { Art } from '../fixtures/faelle';
import { BAR_TREFFER } from '../lauf';
import { VERSTOSS_LABEL, type DemoAktion, type DemoErgebnis, type DemoFall } from './lauf';

/** Screenshots that exist next to a case (bilder.ts writes them; optional). */
export interface BildHinweis {
  /** Why there are none or only some (German), or null. */
  hinweis: string | null;
}

const ART_LABEL: Record<Art, string> = { klar: 'klar', grenzfall: 'Grenzfall', unpassend: 'unpassend' };

export const AKTION_LABEL: Record<DemoAktion, string> = {
  freigeben: 'Freigegeben',
  rueckfragen: 'Rückfragen gesendet',
  absage: 'Abgesagt',
  selbst: 'Selbst kalkuliert, eigenen Preisrahmen gesendet',
  tldr: 'nur Kurzfassung erhalten',
};

const typLabel = (typ: unknown): string =>
  typeof typ === 'string' && Object.hasOwn(PROJECT_TYPE_LABELS, typ)
    ? PROJECT_TYPE_LABELS[typ as keyof typeof PROJECT_TYPE_LABELS].label
    : 'Anfrage';

/** The recommendation's top reason: the first flag, else Claude's first reason. */
export function hauptgrund(e: DemoFall): string {
  return e.empfehlung?.flags[0]?.text ?? e.bewertung?.gruende[0] ?? '–';
}

function preisZelle(e: DemoFall): Roh {
  const k = e.kalkulation;
  const gesendet = e.entscheidung?.preis;
  const eigen =
    gesendet && (!k || gesendet.min !== k.min || gesendet.max !== k.max)
      ? html`<br /><span class="leise">gesendet: ${formatEuroRange(gesendet.min, gesendet.max)}</span>`
      : null;
  if (!k) return html`kein Preis${eigen}`;
  return html`${formatEuroRange(k.min, k.max)}<br /><span class="leise"
      >${QUELLE_LABEL[k.quelle]}, ${formatBreite(k.breite)}</span
    >${eigen}`;
}

function textZelle(e: DemoFall): Roh {
  const a = e.angebot;
  const regeln = (codes: readonly string[]) =>
    codes.map((c) => VERSTOSS_LABEL[c as keyof typeof VERSTOSS_LABEL] ?? c).join(', ');
  const angebot = !a
    ? 'keiner (Spam)'
    : a.pfad === 'ki'
      ? 'KI-Text'
      : a.pfad === 'ki_retry'
        ? `KI-Text nach Korrektur (erste Antwort abgefangen: ${regeln(a.verstoesse)})`
        : a.grund === 'verstoss'
          ? `Vorlage (beide KI-Antworten abgefangen: ${regeln(a.verstoesse)})`
          : 'Vorlage';
  const fragen =
    e.rueckfragenPfad === 'ki_retry'
      ? 'Rückfragen nach Korrektur (erste Antwort abgefangen)'
      : e.rueckfragenPfad === 'gefiltert'
        ? 'Rückfragen gefiltert (nur die sauberen Fragen)'
        : null;
  return html`${angebot}${fragen ? html`<br /><span class="leise">${fragen}</span>` : null}`;
}

function dateienZelle(e: DemoFall, ausgabe: string): Roh {
  const nr = String(e.nr).padStart(2, '0');
  const bilder = [
    { titel: 'Bild Prüfseite', datei: 'pruefseite.png' },
    ...e.dateien
      .filter((d) => d.datei.endsWith('.pdf') && d.datei !== 'vorschau.pdf')
      .map((d) => ({ titel: 'Bild Angebot', datei: d.datei.replace(/\.pdf$/, '-seite1.png') })),
  ].filter((b) => existsSync(join(ausgabe, e.ordner, b.datei)));
  return html`<ul class="dateien">
    ${[...e.dateien, ...bilder].map(
      (d) =>
        html`<li>
          <a href="${e.ordner}/${d.datei}"><span class="vh">Fall ${nr}: </span>${d.titel}</a>
        </li>`,
    )}
  </ul>`;
}

function zeile(e: DemoFall, ausgabe: string): Roh {
  const emp = e.empfehlung?.empfehlung;
  const passt = emp === e.fixture.erwartet.empfehlung;
  const nr = String(e.nr).padStart(2, '0');
  return html`<tr>
    <th scope="row" data-label="Fall">${nr}<br /><span class="leise">#${e.kurz}</span></th>
    <td data-label="Projekt">
      <strong>${typLabel(e.fixture.values['typ'])}</strong>: ${e.fixture.titel}<br /><span class="leise"
        >${ART_LABEL[e.fixture.art]}</span
      >
    </td>
    <td data-label="Preisrahmen brutto">${preisZelle(e)}</td>
    <td data-label="Empfehlung">
      <span class="stufe stufe-${emp ?? 'keine'}">${emp ? EMPFEHLUNG_LABEL[emp] : '–'}</span>
      ${passt ? null : html`<span class="abweichung">(erwartet: ${EMPFEHLUNG_LABEL[e.fixture.erwartet.empfehlung]})</span>`}
      <br />${hauptgrund(e)}
    </td>
    <td data-label="Machbarkeit">${e.bewertung ? MACHBARKEIT_LABEL[e.bewertung.machbarkeit] : 'ohne KI'}</td>
    <td data-label="Angebotstext">${textZelle(e)}</td>
    <td data-label="Entscheidung im Trockenlauf">${AKTION_LABEL[e.aktion]}</td>
    <td data-label="Dateien">${dateienZelle(e, ausgabe)}</td>
  </tr>`;
}

const CSS = `:root {
  color-scheme: light dark;
  --surface: #fffbf5; --surface-alt: #f5f2e7; --ink: #2c1403; --muted: #635146; --line: #cdbaab;
  --accent: #9e2124; --focus: #1659b5; --ok: #236436; --warn: #8a4b00;
}
@media (prefers-color-scheme: dark) {
  :root { --surface: #160d07; --surface-alt: #2c1403; --ink: #f0ebdf; --muted: #c1b1a0; --line: #503e34;
    --accent: #f7a597; --focus: #86c5fa; --ok: #7ccd8e; --warn: #f0c27a; }
}
*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; background: var(--surface); color: var(--ink);
  font: 1rem/1.55 system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
main { max-width: 90rem; margin: 0 auto; padding: 1.5rem 1rem 4rem; }
.text { max-width: 48rem; }
h1 { font-size: 1.75rem; line-height: 1.25; margin: 0 0 1rem; }
h2 { font-size: 1.3rem; margin: 2.25rem 0 0.75rem; }
p, ul, ol { margin: 0 0 1rem; }
a { color: var(--accent); text-underline-offset: 0.15em; }
:focus-visible { outline: 3px solid var(--focus); outline-offset: 3px; }
.hinweis { border-left: 4px solid var(--accent); background: var(--surface-alt); padding: 0.75rem 1rem; }
.hinweis strong { display: block; }
.leise { color: var(--muted); font-size: 0.9375rem; }
.zahlen { display: flex; flex-wrap: wrap; gap: 0.75rem; padding: 0; list-style: none; }
.zahlen li { background: var(--surface-alt); border: 1px solid var(--line); border-radius: 6px; padding: 0.5rem 0.875rem; }
table { border-collapse: collapse; width: 100%; font-size: 0.9375rem; }
caption { text-align: left; font-weight: 600; padding: 0 0 0.5rem; }
th, td { border-bottom: 1px solid var(--line); padding: 0.5rem 0.625rem; text-align: left; vertical-align: top; }
thead th { background: var(--surface-alt); position: sticky; top: 0; }
.stufe { font-weight: 600; }
.stufe-freigeben { color: var(--ok); }
.stufe-absagen { color: var(--accent); }
.stufe-pruefen { color: var(--warn); }
.abweichung { display: block; font-weight: 600; color: var(--accent); }
.dateien { margin: 0; padding: 0; list-style: none; display: flex; flex-wrap: wrap; gap: 0.125rem 0.75rem; min-width: 14rem; }
.dateien a { display: inline-block; min-height: 24px; line-height: 24px; }
.vh { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
@media (max-width: 48rem) {
  table, caption, tbody, tr, th, td { display: block; }
  thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  tr { border: 1px solid var(--line); border-radius: 6px; margin: 0 0 1rem; padding: 0.5rem 0.75rem; }
  th, td { border: 0; padding: 0.25rem 0; }
  td::before, tbody th::before { content: attr(data-label); display: block; font-size: 0.8125rem; color: var(--muted); }
  .dateien a { min-height: 44px; padding: 0.5rem 0; }
}
@media print {
  @page { size: A4 landscape; margin: 12mm; }
  body { background: #fff; color: #000; font-size: 9pt; }
  main { max-width: none; padding: 0; }
  a { color: inherit; text-decoration: none; }
  thead th { position: static; }
  tr { break-inside: avoid; }
  .dateien { font-size: 8pt; }
}`;

export function uebersicht(r: DemoErgebnis, b: BildHinweis): string {
  const zaehle = (e: Empfehlung) => r.faelle.filter((f) => f.empfehlung?.empfehlung === e).length;
  const aktionen = (a: DemoAktion) => r.faelle.filter((f) => f.aktion === a).length;
  const kunden = r.mails.filter((m) => m.kind === 'customer').length;
  const n = r.faelle.length;
  const ki = r.live
    ? 'Die KI-Antworten in diesem Lauf kamen live von Claude (Anthropic). Die Kunden der Beispiele sind erfunden; Namen, E-Mail-Adressen und Telefonnummern gingen ohnehin nicht an die KI.'
    : 'Die KI-Antworten in diesem Lauf sind Aufnahmen: vorab aufgezeichnete Antworten, wie Claude sie unter unseren Regeln gibt. Es gab keine Verbindung zur KI und keine Kosten; mit einem Zugangsschlüssel lässt sich derselbe Lauf live wiederholen. Drei Aufnahmen brechen absichtlich eine Regel (einmal eine Frist, zweimal eine Umweltaussage), damit Sie sehen, wie der Assistent das abfängt: In der Tabelle steht dann „nach Korrektur“ oder „Vorlage“.';
  const body = html`<!doctype html>
    <html lang="de">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
        <title>Angebots-Assistent: Trockenlauf mit ${n} Beispielanfragen</title>
        <style>
          ${raw(CSS)}
        </style>
      </head>
      <body>
        <main>
          <div class="text">
            <h1>Angebots-Assistent: Trockenlauf mit ${n} Beispielanfragen</h1>
            <p class="hinweis" role="note">
              <strong>Trockenlauf: keine Mail hat das Haus verlassen.</strong>
              Alle ${r.mails.length} Mails dieses Laufs (Anfragen, Kurzfassungen und ${kunden} Mails an Kunden) liegen
              nur als Dateien in diesem Ordner. Alle Kunden sind erfunden.
            </p>
            <h2>Was der Pilot macht</h2>
            <ol>
              <li>Wenn jemand den Konfigurator abschickt, bekommen Sie die Anfrage wie bisher sofort per E-Mail.</li>
              <li>
                Dann rechnet der Assistent einen Preisrahmen aus, und zwar mit den Sätzen Ihres Betriebs: Stundensätze,
                Holz- und Flächenpreise, Anfahrt. Die KI nennt nie einen Betrag.
              </li>
              <li>
                Die KI (Claude) prüft, ob die Anfrage machbar ist und zum Betrieb passt, erkennt Spam und schreibt einen
                Angebotsentwurf ohne Preise, Termine, Fristen und Werbeversprechen. Bei frei beschriebenen Vorhaben
                (Altbau, Sonstiges, Reparaturen, „etwas anderes“ bei Möbeln) schätzt sie außerdem den Umfang:
                Arbeitsstunden und Material. Bepreist wird auch das mit Ihren Sätzen, und Sie prüfen die Schätzung;
                solche Fälle bekommen höchstens die Empfehlung „Prüfen“, nie „Freigeben“.
              </li>
              <li>
                Sie erhalten eine Kurzfassung per E-Mail (in den Dateien „TL;DR“ genannt): Empfehlung, Preisrahmen und
                ein Link zur Prüfseite.
              </li>
              <li>
                Erst Ihr Klick schickt etwas an den Kunden: freigeben, Rückfragen stellen, absagen oder selbst
                kalkulieren. Verstößt ein KI-Text gegen eine Regel, fängt ihn der Assistent vorher ab: einmal
                nachbessern lassen, sonst ein neutraler Vorlagentext.
              </li>
            </ol>
            <p>${ki}</p>
            <p class="leise">
              Im Trockenlauf gehen die Anfragen ab dem ${formatZeitpunkt(r.start)} ein, eine alle paar Minuten. Am
              ${formatDatum(r.entscheidung)} fällt die Entscheidung über ${n - aktionen('tldr')} davon; für die übrigen
              liegt nur die Kurzfassung vor.
            </p>

            <h2>Ergebnis</h2>
            <ul class="zahlen">
              <li>${EMPFEHLUNG_LABEL.freigeben}: <strong>${zaehle('freigeben')}</strong></li>
              <li>${EMPFEHLUNG_LABEL.pruefen}: <strong>${zaehle('pruefen')}</strong></li>
              <li>${EMPFEHLUNG_LABEL.absagen}: <strong>${zaehle('absagen')}</strong></li>
            </ul>
            <p>
              Für jede Beispielanfrage stand vorher fest, welche Empfehlung richtig ist. Getroffen:
              <strong>${r.treffer} von ${n}</strong> (Ziel: mindestens ${BAR_TREFFER}). Unpassende Anfragen, die
              trotzdem „Freigeben empfohlen“ bekamen: <strong>${r.unpassendFreigegeben}</strong> (Ziel: keine).
              ${r.bar ? 'Die Qualitätsschwelle ist damit erreicht.' : 'Die Qualitätsschwelle ist damit nicht erreicht.'}
            </p>
            <p>
              Die Entscheidungen im Trockenlauf haben wir beispielhaft für Sie getroffen: ${aktionen('freigeben')} ×
              freigegeben, ${aktionen('selbst')} × selbst kalkuliert, ${aktionen('rueckfragen')} × Rückfragen gestellt,
              ${aktionen('absage')} × abgesagt. Bei ${aktionen('tldr')} Fällen blieb es bei der Kurzfassung.
            </p>

            <h2>Offene Punkte für Sie</h2>
            <p>
              Bevor echte Kunden Post bekommen, brauchen wir Ihre Entscheidung zu diesen Punkten; sie stehen auch in der
              Checkliste für den Inhaber:
            </p>
            <ul>
              <li>
                <strong>Preise bestätigen:</strong> Stundensätze, Holz- und Flächenpreise, Anfahrt und Mindestauftrag
                sind Annahmen für den Pilot, ebenso die Spannen des Preisrahmens und die Schwellen der Empfehlung.
              </li>
              <li>
                <strong>Absage und Klausel rechtlich prüfen:</strong> den Text der Absage, die Klausel „freibleibend und
                unverbindlich“ und die Gültigkeit von 30${NNBSP}Tagen.
              </li>
              <li>
                <strong>Postfach:</strong> Von welcher Adresse gehen Angebote hinaus, und wohin kommen die Anfragen?
              </li>
              <li>
                <strong>Hosting:</strong> Wo soll der Anfrage-Server laufen (Anbieter in der EU, eigene Subdomain,
                Vertrag zur Auftragsverarbeitung)?
              </li>
              <li>
                <strong>KI-Zugang:</strong> Zugang zu Claude (direkt bei Anthropic oder über Google in der EU), Vertrag
                zur Auftragsverarbeitung und ein monatliches Ausgabenlimit.
              </li>
            </ul>

            <h2>So öffnen Sie die Dateien</h2>
            <ul>
              <li>.html (Kurzfassung, Prüfseite, Mails) öffnet der Browser.</li>
              <li>.eml ist die Mail genau so, wie sie verschickt würde; ein Mailprogramm zeigt sie an.</li>
              <li>
                „Angebot-….pdf“ ist das Angebot, wie es der Kunde als Anhang bekäme. „Vorschau-PDF“ zeigt den Stand vor
                der Entscheidung, mit Wasserzeichen „Vorschau“.
              </li>
              ${b.hinweis ? html`<li>${b.hinweis}</li>` : null}
            </ul>
          </div>

          <h2 id="faelle">Alle ${n} Anfragen</h2>
          <table>
            <caption>
              Jede Zeile ist eine Beispielanfrage: Preisrahmen, Empfehlung, Herkunft des Angebotstexts und die Dateien
              des Falls.
            </caption>
            <thead>
              <tr>
                <th scope="col">Fall</th>
                <th scope="col">Projekt</th>
                <th scope="col">Preisrahmen brutto</th>
                <th scope="col">Empfehlung und Hauptgrund</th>
                <th scope="col">Machbarkeit</th>
                <th scope="col">Angebotstext</th>
                <th scope="col">Entscheidung im Trockenlauf</th>
                <th scope="col">Dateien</th>
              </tr>
            </thead>
            <tbody>
              ${r.faelle.map((e) => zeile(e, r.ausgabe))}
            </tbody>
          </table>
        </main>
      </body>
    </html> `;
  return body.html;
}
