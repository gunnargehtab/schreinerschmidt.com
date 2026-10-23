// The TL;DR mail to the owner (docs/angebot.md §7.2) and the reminder (§3). Threaded as replies to
// the enquiry mail (In-Reply-To/References), plain text + HTML, ≤ 15 lines above the link. Owner
// copy in texte/inhaber.ts. Every value from the customer is escaped in the HTML and stripped of
// controls in the subject (headerText via the mailer and betreffText here).
import type { Values } from '../../../src/lib/configurator/fields';
import type { Kalkulation } from '../../../src/lib/configurator/pricing/types';
import type { Config } from '../config';
import type { EmpfehlungErgebnis } from '../empfehlung';
import { betreffText, kurzbeschreibung, plzOrt, tierVon } from '../fall-daten';
import { budgetText } from '../projekt';
import { formatDatum, formatEuroRange, formatEuroSpanne, formatZeitpunkt } from '../format';
import { esc, html, raw } from '../html';
import { bodyText } from '../sanitize';
import type { BewertungRecord } from '../steps/bewertung';
import type { Fall } from '../store';
import {
  BETREFF_PREFIX,
  EMPFEHLUNG_LABEL,
  ERINNERUNG,
  MACHBARKEIT_LABEL,
  QUELLE_LABEL,
  TIER_LABEL,
  TLDR,
} from '../texte/inhaber';
import type { OutgoingMail } from './index';

/** At most this many reasons in the mail; the page lists all. */
export const TOP_GRUENDE = 3;

export interface TldrInput {
  fall: Fall;
  empfehlung: EmpfehlungErgebnis;
  kalkulation: Kalkulation | null;
  bewertung: BewertungRecord | null;
  /** The review link with the token. */
  link: string;
  gueltigBis: number;
}

/** Threading headers to the enquiry mail (and, for the reminder, the TL;DR). */
export function thread(...ids: (string | null | undefined)[]): Pick<OutgoingMail, 'inReplyTo' | 'references'> {
  const refs = ids.filter((x): x is string => typeof x === 'string' && /^<[^<>\s]+>$/.test(x.trim()));
  const last = refs.at(-1);
  return last ? { inReplyTo: last, references: refs } : {};
}

/** §7.2 subject: „[Angebot prüfen] Regal 120×200×35 – 68161 Mannheim – 2 450–3 300 € – #7F3K“. */
export function tldrBetreff(fall: Fall, e: EmpfehlungErgebnis, k: Kalkulation | null): string {
  const v = fall.payload.values;
  const teile = [
    `${BETREFF_PREFIX[e.empfehlung]} ${betreffText(kurzbeschreibung(v), 60)}`,
    betreffText(plzOrt(v), 60),
    k ? formatEuroSpanne(k.min, k.max) : TLDR.ohnePreis,
    `#${fall.kurz}`,
  ].filter(Boolean);
  return betreffText(teile.join(' – '), 200);
}

const kundenbudget = (v: Values): string => {
  const b = v['budget'];
  return typeof b === 'string' && b && b !== 'keine-angabe' ? budgetText(b) : TLDR.keinBudget;
};

const gebietText = (v: Values): string => TIER_LABEL[tierVon(v) ?? 'unbekannt'];

/** The reason lines: the top flags, or Claude's first reasons when nothing is flagged. */
function gruende(e: EmpfehlungErgebnis, b: BewertungRecord | null): string[] {
  if (e.flags.length) return e.flags.slice(0, TOP_GRUENDE).map((f) => f.text);
  const ki = b?.bewertung?.gruende ?? [];
  return ki.length ? ki.slice(0, 2) : [TLDR.keineAuffaelligkeiten];
}

function fuss(fall: Fall, b: BewertungRecord | null): string {
  if (fall.status === 'bewertung_fehlgeschlagen') return TLDR.fussFehlgeschlagen;
  return b?.quelle === 'ki' && b.bewertung ? TLDR.fussKi : TLDR.fussOhneKi;
}

/** The TL;DR mail (§7.2). */
export function tldrMail(config: Config, i: TldrInput): OutgoingMail {
  const { fall, empfehlung: e, kalkulation: k, bewertung: b } = i;
  const v = fall.payload.values;
  const preis = k ? TLDR.preis(formatEuroRange(k.min, k.max), QUELLE_LABEL[k.quelle], k.breite) : TLDR.keinPreis;
  const bew = b?.quelle === 'ki' ? b.bewertung : null;
  const machbarkeit = bew ? MACHBARKEIT_LABEL[bew.machbarkeit] : TLDR.machbarkeitOhneKi;
  const fehlend = bew?.fehlende_angaben.length ? bew.fehlende_angaben : [];
  const g = gruende(e, b);
  const zeilen: [string, string][] = [
    [TLDR.preisrahmen, preis],
    [TLDR.machbarkeit, machbarkeit],
    [TLDR.budget, kundenbudget(v)],
    [TLDR.gebiet, `${gebietText(v)} (${plzOrt(v)})`],
    [TLDR.fehlend, fehlend.length ? fehlend.slice(0, 4).join('; ') : TLDR.keineFehlend],
  ];
  const text = [
    `${TLDR.empfehlung}: ${EMPFEHLUNG_LABEL[e.empfehlung]}`,
    ...g.map((x) => `- ${x}`),
    '',
    ...zeilen.map(([a, x]) => `${a}: ${x}`),
    '',
    `${TLDR.link}: ${i.link}`,
    TLDR.gueltig(formatDatum(i.gueltigBis)),
    '',
    `#${fall.kurz} · ${fuss(fall, b)}`,
  ].join('\n');

  const body = html`<!doctype html>
    <html lang="de">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${TLDR.kopf(fall.kurz)}</title>
      </head>
      <body style="font-family: system-ui, sans-serif; color: #2c1403; line-height: 1.5; max-width: 40rem;">
        <p style="font-size: 1.125rem; margin: 0 0 0.25rem;">
          <strong>${TLDR.empfehlung}: ${EMPFEHLUNG_LABEL[e.empfehlung]}</strong>
        </p>
        <ul style="margin: 0 0 1rem; padding-left: 1.25rem;">
          ${g.map((x) => html`<li>${x}</li>`)}
        </ul>
        <table role="presentation" style="border-collapse: collapse; margin: 0 0 1rem;">
          ${zeilen.map(
            ([a, x]) =>
              html`<tr>
                <th scope="row" style="text-align: left; padding: 0.125rem 1rem 0.125rem 0; vertical-align: top;">
                  ${a}
                </th>
                <td style="padding: 0.125rem 0;">${x}</td>
              </tr>`,
          )}
        </table>
        <p style="margin: 1.5rem 0;">
          <a
            href="${i.link}"
            style="display: inline-block; padding: 0.75rem 1.25rem; background: #9e2124; color: #fffbf5; text-decoration: none; border-radius: 4px; font-weight: 600;"
            >${TLDR.link}</a
          >
        </p>
        <p style="color: #635146; font-size: 0.875rem;">
          ${TLDR.gueltig(formatDatum(i.gueltigBis))}<br />#${fall.kurz} · ${fuss(fall, b)}
        </p>
      </body>
    </html> `;
  return {
    kind: 'owner',
    to: config.ownerEmail,
    subject: tldrBetreff(fall, e, k),
    text: bodyText(text),
    html: body.html,
    ...thread(fall.messageId),
  };
}

/** The reminder (§3): once, threaded to the enquiry and the TL;DR. */
export function erinnerungMail(config: Config, fall: Fall): OutgoingMail {
  const seit = formatZeitpunkt(fall.tldrAt ?? Date.parse(fall.createdAt));
  const bis = formatDatum(fall.tokenExpiresAt ?? fall.tldrAt ?? Date.parse(fall.createdAt));
  const text = ERINNERUNG.text(fall.kurz, seit, bis);
  return {
    kind: 'owner',
    to: config.ownerEmail,
    subject: betreffText(ERINNERUNG.betreff(fall.kurz, betreffText(kurzbeschreibung(fall.payload.values), 60)), 200),
    text,
    html: `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${esc(fall.kurz)}</title></head><body style="font-family: system-ui, sans-serif; line-height: 1.5;">${raw(
      text
        .split('\n\n')
        .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
        .join('\n'),
    )}</body></html>\n`,
    ...thread(fall.messageId, fall.tldrMessageId),
  };
}
