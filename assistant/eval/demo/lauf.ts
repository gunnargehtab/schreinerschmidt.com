// The owner demo (docs/angebot.md §11 "Demo for the owner", phase 7f): all 24 eval fixtures run
// through the real backend in-process, in SEND_MODE=dry-run, on a fake clock:
// 1. POST /anfrage with the multipart body the site sends (Origin, rate limit, validation, store,
//    the enquiry mail inline), one enquiry every 7 minutes, so the real rate limit (10 per hour)
//    holds without an override;
// 2. the job runner's pipeline `preis` → `bewertung` → `tldr` (recorded Claude answers by default,
//    the real client with `--live`), timers included;
// 3. the review page and the PDF preview via GET with the token from the TL;DR mail;
// 4. the next morning, owner actions through the real review routes and their forms: Freigeben
//    with the confirm step for the clear cases, Rückfragen for a borderline one, an Absage for an
//    unviable one, and „Selbst kalkulieren“ plus an own range for one Claude-quantified case.
// Nothing is short-cut: every action is a form POST with the page's own hidden fields (token,
// version), the Origin of PUBLIC_BASE_URL and the urlencoded body a browser sends.
//
// The store and the outbox live in a temporary directory that is removed afterwards; the artifacts
// (mails as .eml and .html, pages, PDFs) are copied into `ausgabe` (DATA_DIR/demo/), which is
// wiped first. Review pages get an offline copy of their stylesheet and a note that their buttons
// do nothing in the saved copy. No mail leaves the process: the mailer is the dry-run mailer.
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Values } from '../../../src/lib/configurator/fields';
import { FIELDS } from '../../../src/lib/configurator/fields';
import { describe, generate } from '../../../src/lib/configurator/furniture';
import { PROJECT_TYPE_LABELS } from '../../../src/lib/configurator/labels';
import type { Kalkulation } from '../../../src/lib/configurator/pricing/types';
import { serviceArea } from '../../../src/lib/configurator/service-area';
import { paramsFromValues } from '../../../src/scripts/configurator/preview/params';
import { createApp } from '../../src/app';
import type { ClaudeClient } from '../../src/claude/client';
import { AufnahmeClaude } from '../../src/claude/fake';
import type { Verstoss } from '../../src/claude/guards';
import { kalkulationOf } from '../../src/claude/input';
import type { Bewertung } from '../../src/claude/schemas';
import { loadConfig, type Config } from '../../src/config';
import { istEmpfehlung, type EmpfehlungErgebnis } from '../../src/empfehlung';
import { createLogger } from '../../src/log';
import { OUTBOX, createMailer, type Mailer, type OutgoingMail } from '../../src/mail/index';
import { REVIEW_CSS } from '../../src/review/css';
import { istEntscheidung, type Entscheidung } from '../../src/review/entscheidung';
import { CSS_PATH } from '../../src/review/seiten';
import { createServices } from '../../src/services';
import type { AngebotRecord, BewertungRecord } from '../../src/steps/bewertung';
import type { Fall, Status } from '../../src/store';
import { serverSummary } from '../../src/summary';
import type { Clock } from '../../src/types';
import { shortId } from '../../src/validate';
import { AUFNAHMEN } from '../fixtures/aufnahmen';
import { FAELLE, type EvalFall } from '../fixtures/faelle';
import { BAR_TREFFER } from '../lauf';

/** Invented, non-resolvable addresses of the demo (RFC 2606 `.invalid`). */
export const DEMO = {
  site: 'https://www.schreinerei-schmidt.invalid',
  basis: 'https://anfrage.schreinerei-schmidt.invalid',
  inhaber: 'inhaber@schreinerei-schmidt.invalid',
  absender: 'Schreinerei Schmidt <anfrage@schreinerei-schmidt.invalid>',
} as const;

/** Thu 22.10.2026, 08:00 in Mannheim (CEST): the first enquiry arrives. */
export const START = Date.UTC(2026, 9, 22, 6, 0, 0);
/** Fri 23.10.2026, 08:30: the owner works through the TL;DRs. */
export const ENTSCHEIDUNG = Date.UTC(2026, 9, 23, 6, 30, 0);
/** Between two enquiries; 9 per hour stay below the real rate limit of 10. */
export const ABSTAND_MS = 7 * 60_000;
const MINUTE = 60_000;

/** What the owner does with a case in the demo. */
export type DemoAktion = 'freigeben' | 'rueckfragen' | 'absage' | 'selbst' | 'tldr';

/**
 * The representative subset (task 7f): Freigeben for the clear case of every branch except one,
 * whose Claude-quantified price the owner replaces with an own range („Selbst kalkulieren“); Rückfragen
 * for a borderline case; an Absage for an unviable but genuine one. All others: TL;DR only.
 */
export const AKTIONEN: Readonly<Record<string, DemoAktion>> = {
  'moebel-klar': 'freigeben',
  'boden-klar': 'freigeben',
  'treppe-klar': 'freigeben',
  'fenster-klar': 'freigeben',
  'tuer-klar': 'freigeben',
  'terrasse-klar': 'freigeben',
  'sonstiges-klar': 'freigeben',
  'altbau-klar': 'selbst',
  'tuer-grenzfall': 'rueckfragen',
  'sonstiges-unpassend': 'absage',
};

/** The owner's own line in the demo Absage (passes the guards like any edit on the page). */
export const ABSAGE_PERSOENLICH =
  'Elektroarbeiten gehören nicht zu unserem Handwerk; dafür wenden Sie sich am besten an einen Elektrofachbetrieb in Ihrer Nähe.';

export interface DemoDatei {
  titel: string;
  datei: string;
}

export interface DemoFall {
  nr: number;
  fixture: EvalFall;
  /** Folder below `ausgabe`, e.g. `fall-01-moebel-klar`. */
  ordner: string;
  fallId: string;
  kurz: string;
  status: Status;
  empfehlung: EmpfehlungErgebnis | null;
  bewertung: Bewertung | null;
  rueckfragenPfad: BewertungRecord['rueckfragen'];
  angebot: AngebotRecord | null;
  /** The computed price (rules or Claude's quantities), as in the TL;DR; null: no price. */
  kalkulation: Kalkulation | null;
  aktion: DemoAktion;
  entscheidung: Entscheidung | null;
  dateien: DemoDatei[];
  /** The customer mails of this case as sent (with their PDF), for the checks. */
  kundenmails: OutgoingMail[];
  /** The PDF preview of the review page (stored text and computed range). */
  vorschau: Uint8Array | null;
}

export interface DemoErgebnis {
  ausgabe: string;
  faelle: DemoFall[];
  /** Recommendation matches the fixture's expectation. */
  treffer: number;
  unpassendFreigegeben: number;
  bar: boolean;
  /** Every mail of the run (owner and customer), in order. */
  mails: OutgoingMail[];
  live: boolean;
  start: number;
  entscheidung: number;
  config: Config;
}

export interface DemoOptionen {
  /** Output folder; wiped and recreated. */
  ausgabe: string;
  /** Claude client; default: the recorded answers (eval/fixtures/aufnahmen.ts). */
  claude?: ClaudeClient;
  /** The client is the real API (for the overview's note). */
  live?: boolean;
  faelle?: readonly EvalFall[];
  /** Progress lines (stdout of the CLI); default silent. */
  fortschritt?: (zeile: string) => void;
}

class DemoUhr implements Clock {
  constructor(public t: number) {}
  now(): number {
    return this.t;
  }
}

/** A stable UUID per fixture, so its Vorgangsnummer is the same in every run. */
export function demoId(f: EvalFall): string {
  const h = createHash('sha256').update(`schreinerei-schmidt-demo:${f.id}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export const ordnerName = (nr: number, f: EvalFall): string => `fall-${String(nr).padStart(2, '0')}-${f.id}`;

const typLabel = (typ: unknown): string =>
  typeof typ === 'string' && Object.hasOwn(PROJECT_TYPE_LABELS, typ)
    ? PROJECT_TYPE_LABELS[typ as keyof typeof PROJECT_TYPE_LABELS].label
    : 'Anfrage';

/** The site's `ss-anfrage@1` document (src/scripts/configurator/payload.ts anfrageJson()). */
function anfrageJson(f: EvalFall, id: string, kurz: string, now: number): Record<string, unknown> {
  const v = f.values;
  const typ = typeof v['typ'] === 'string' ? v['typ'] : '';
  const params = typ === 'moebel' ? paramsFromValues(v) : null;
  const build = params ? generate(params) : null;
  const schritt = (steps: readonly string[]): Values =>
    Object.fromEntries(Object.entries(v).filter(([n]) => steps.includes(FIELDS[n]?.step ?? '')));
  const plz = typeof v['plz'] === 'string' ? v['plz'] : '';
  return {
    schema: 'ss-anfrage@1',
    id,
    kurz,
    createdAt: new Date(now).toISOString(),
    source: { mode: 'live', page: `${DEMO.site}/konfigurator/`, configUrl: `${DEMO.site}/konfigurator/?typ=${typ}` },
    projekt: { typ, felder: schritt(['details', 'ausfuehrung']), lesbar: {} },
    moebel: build
      ? {
          params: build.params,
          derived: build.derived,
          hints: build.hints,
          stueckliste: [],
          beschreibung: describe(build),
        }
      : null,
    rahmen: { ...schritt(['rahmen']), einzugsgebiet: serviceArea(plz)?.tier ?? null },
    kontakt: schritt(['kontakt']),
    anhaenge: [],
  };
}

/** The multipart body of a configurator submit with JS (payload.ts appendPayload()). */
export function anfrageFormular(f: EvalFall, id: string, now: number): FormData {
  const v = f.values;
  const kurz = shortId(id);
  const fd = new FormData();
  for (const [k, x] of Object.entries(v)) {
    if (Array.isArray(x)) for (const s of x) fd.append(k, s);
    else if (x !== undefined) fd.append(k, x);
  }
  fd.set('_lang', 'de');
  fd.set('_next', `${DEMO.site}/konfigurator/danke/`);
  fd.set('MAX_FILE_SIZE', String(10 * 1024 * 1024));
  fd.set('anfrage_id', id);
  fd.set('anfrage_json', JSON.stringify(anfrageJson(f, id, kurz, now)));
  fd.set('zusammenfassung', serverSummary(v));
  const ort = [v['plz'], v['ort']].filter((x) => typeof x === 'string' && x).join(' ');
  fd.set('_subject', `Anfrage ${typLabel(v['typ'])} – ${ort} – #${kurz}`);
  fd.set('_replyto', String(v['email'] ?? ''));
  return fd;
}

/** Attributes of one tag (`name="value"` pairs). */
const attribute = (tag: string): Record<string, string> =>
  Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1]!, m[2]!]));
const unescape = (s: string): string => s.replace(/&#(\d+);/g, (_m, n: string) => String.fromCharCode(Number(n)));

/**
 * What a browser submits from the first POST form whose action ends in `/name`: hidden and text
 * inputs, textareas and checked radios, as the page rendered them.
 */
export function formularFelder(html: string, name: string): Record<string, string> {
  const form = [...html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/g)].find((m) => {
    const a = attribute(m[1]!);
    return a['method'] === 'post' && new RegExp(`^/angebot/[^/]+/${name}$`).test(a['action'] ?? '');
  });
  if (!form) throw new Error(`no form ${name}`);
  const out: Record<string, string> = {};
  for (const m of form[2]!.matchAll(/<input\b([^>]*)>/g)) {
    const a = attribute(m[1]!);
    const checked = /\schecked(?:\s|\/|>|$)/.test(m[1]!);
    if (!a['name']) continue;
    if (a['type'] === 'hidden' || a['type'] === 'text' || (a['type'] === 'radio' && checked)) {
      out[a['name']] = unescape(a['value'] ?? '');
    }
  }
  for (const m of form[2]!.matchAll(/<textarea\b([^>]*)>([\s\S]*?)<\/textarea>/g)) {
    const a = attribute(m[1]!);
    if (a['name']) out[a['name']] = unescape(m[2]!);
  }
  return out;
}

/**
 * A saved review page for reading offline: the stylesheet next to it, the PDF link to the saved
 * preview, the forms inert (they point at the note), and a note on top.
 */
export function offlineSeite(html: string, o: { css: string; pdf: string | null; hinweis: string }): string {
  return html
    .replace(`href="${CSS_PATH}"`, `href="${o.css}"`)
    .replace(/href="\/angebot\/[^"]*\/vorschau\.pdf\?[^"]*"/g, `href="${o.pdf ?? '#demo-hinweis'}"`)
    .replace(/<form method="(?:post|get)" action="\/angebot\/[^"]*"/g, '<form method="get" action="#demo-hinweis"')
    .replace(
      '<main id="inhalt" tabindex="-1">',
      `<main id="inhalt" tabindex="-1"><p class="hinweis hinweis-warn" id="demo-hinweis" role="note">${o.hinweis}</p>`,
    );
}

const OFFLINE_HINWEIS =
  'Gespeicherte Ansicht aus dem Trockenlauf: Knöpfe und Formulare tun in dieser Kopie nichts. Im Pilot öffnen Sie die Seite über den Link in der Kurzfassung und entscheiden dort. <a href="../index.html">Zur Übersicht</a>';

/** Rounds to the next 100 €. */
const hundert = (n: number): number => Math.round(n / 100) * 100;

/** The owner's own range in the demo: ± 15 % around the midpoint of the computed one. */
export function eigenerRahmen(min: number, max: number): { min: number; max: number } {
  const mitte = (min + max) / 2;
  return { min: hundert(mitte * 0.85), max: hundert(mitte * 1.15) };
}

interface Gesendet {
  fixture: string | null;
  mail: OutgoingMail;
  /** The .eml the dry-run mailer wrote. */
  eml: string | null;
}

/** The dry-run mailer, wrapped: every mail and its .eml file are recorded for the current case. */
function aufzeichnend(inner: Mailer, outbox: string, aktuell: () => string | null, log: Gesendet[]): Mailer {
  const liste = (): Set<string> => {
    try {
      return new Set(readdirSync(outbox));
    } catch {
      return new Set();
    }
  };
  return {
    mode: inner.mode,
    async send(m) {
      const vorher = liste();
      const r = await inner.send(m);
      const neu = [...liste()].filter((f) => !vorher.has(f) && f.endsWith('.eml'));
      log.push({ fixture: aktuell(), mail: m, eml: neu[0] ? join(outbox, neu[0]) : null });
      return r;
    },
    close: () => inner.close(),
  };
}

/** Runs the demo and writes its artifacts (not the overview; uebersicht.ts does that). */
export async function demoLauf(o: DemoOptionen): Promise<DemoErgebnis> {
  const faelle = o.faelle ?? FAELLE;
  const say = o.fortschritt ?? (() => {});
  rmSync(o.ausgabe, { recursive: true, force: true });
  mkdirSync(o.ausgabe, { recursive: true });
  writeFileSync(join(o.ausgabe, 'review.css'), REVIEW_CSS);

  const arbeit = mkdtempSync(join(tmpdir(), 'ss-demo-'));
  const config = loadConfig({
    NODE_ENV: 'development',
    SEND_MODE: 'dry-run',
    DATA_DIR: arbeit,
    PUBLIC_BASE_URL: DEMO.basis,
    SITE_ORIGIN: DEMO.site,
    SITE_BASE: '/',
    OWNER_EMAIL: DEMO.inhaber,
    MAIL_FROM: DEMO.absender,
  });
  const uhr = new DemoUhr(START);
  const gesendet: Gesendet[] = [];
  let aktuell: string | null = null;
  const fixtureVonFall = new Map<string, EvalFall>();
  const claude = o.claude ?? new AufnahmeClaude((fall) => AUFNAHMEN[fixtureVonFall.get(fall)?.id ?? ''] ?? null);
  const mailer = aufzeichnend(
    createMailer(config, { now: () => uhr.now() }),
    join(arbeit, OUTBOX),
    () => aktuell,
    gesendet,
  );
  const deps = createServices(config, {
    clock: uhr,
    log: createLogger(
      () => {},
      () => uhr.now(),
    ),
    mailer,
    claude,
    auto: false,
  });
  const app = createApp(deps);
  const { store, runner } = deps;

  const holen = async (pfad: string): Promise<Response> => app.request(pfad);
  const senden = (id: string, aktion: string, felder: Record<string, string>) =>
    app.request(`/angebot/${id}/${aktion}`, {
      method: 'POST',
      body: new URLSearchParams(felder).toString(),
      headers: { Origin: DEMO.basis, 'Content-Type': 'application/x-www-form-urlencoded' },
    });
  /** Runs everything due; retries in the future (live API errors) move the fake clock there. */
  const abarbeiten = async (): Promise<void> => {
    for (let i = 0; i < 40; i++) {
      await runner.runDue();
      const next = await store.nextDue();
      if (next === null) return;
      uhr.t = Math.max(uhr.t, next);
    }
  };
  const erwarte = async (res: Response, status: number, was: string): Promise<string> => {
    const text = await res.text();
    if (res.status !== status) throw new Error(`${was}: HTTP ${res.status}`);
    return text;
  };

  interface Laufend {
    nr: number;
    f: EvalFall;
    fall: Fall;
    token: string;
    ordner: string;
    dateien: DemoDatei[];
    vorschau: Uint8Array | null;
  }
  const laufend: Laufend[] = [];
  const ablegen = (
    l: { ordner: string; dateien: DemoDatei[] },
    datei: string,
    titel: string,
    inhalt: string | Uint8Array,
  ) => {
    writeFileSync(join(o.ausgabe, l.ordner, datei), inhalt);
    l.dateien.push({ titel, datei });
  };
  const mailAblegen = (l: Laufend, g: Gesendet, name: string, titel: string, link?: { von: string; nach: string }) => {
    if (g.mail.html !== undefined) {
      const html = link ? g.mail.html.split(link.von).join(link.nach) : g.mail.html;
      ablegen(l, `${name}.html`, titel, html);
    }
    if (g.eml) ablegen(l, `${name}.eml`, `${titel} (.eml)`, readFileSync(g.eml));
  };

  try {
    await runner.start();
    // --- 1. The enquiries arrive -------------------------------------------------------------
    for (const [i, f] of faelle.entries()) {
      const nr = i + 1;
      const ordner = ordnerName(nr, f);
      mkdirSync(join(o.ausgabe, ordner), { recursive: true });
      aktuell = f.id;
      const id = demoId(f);
      const res = await app.request('/anfrage', {
        method: 'POST',
        body: anfrageFormular(f, id, uhr.now()),
        headers: { Origin: DEMO.site, Accept: 'application/json' },
      });
      const json = (await res.json()) as { success?: boolean };
      if (res.status !== 200 || json.success !== true) throw new Error(`${f.id}: POST /anfrage → ${res.status}`);
      const angelegt = await store.getByAnfrageId(id);
      if (!angelegt) throw new Error(`${f.id}: no case stored`);
      fixtureVonFall.set(angelegt.id, f);
      await abarbeiten();
      const fall = (await store.get(angelegt.id))!;
      const meine = gesendet.filter((g) => g.fixture === f.id);
      const tldr = meine.find((g) => g.mail.kind === 'owner' && g.mail.text.includes(`/angebot/${fall.id}?t=`));
      const anfrage = meine.find((g) => g.mail.kind === 'owner' && g !== tldr);
      if (!tldr) throw new Error(`${f.id}: no TL;DR sent (status ${fall.status})`);
      const token = /\/angebot\/[0-9a-f-]+\?t=([A-Za-z0-9_-]+)/.exec(tldr.mail.text)?.[1];
      if (!token) throw new Error(`${f.id}: no review link`);
      const l: Laufend = { nr, f, fall, token, ordner, dateien: [], vorschau: null };
      if (anfrage?.eml) ablegen(l, 'anfrage.eml', 'Anfrage (.eml)', readFileSync(anfrage.eml));
      const link = `${config.publicBaseUrl}/angebot/${fall.id}?t=${token}`;
      mailAblegen(l, tldr, 'tldr', 'TL;DR', { von: link, nach: 'pruefseite.html' });
      const pdf = await holen(`/angebot/${fall.id}/vorschau.pdf?t=${token}`);
      if (pdf.status === 200) {
        l.vorschau = new Uint8Array(await pdf.arrayBuffer());
        ablegen(l, 'vorschau.pdf', 'Vorschau-PDF', l.vorschau);
      }
      const seite = await erwarte(await holen(`/angebot/${fall.id}?t=${token}`), 200, `${f.id}: review page`);
      ablegen(
        l,
        'pruefseite.html',
        'Prüfseite',
        offlineSeite(seite, {
          css: '../review.css',
          pdf: l.vorschau ? 'vorschau.pdf' : null,
          hinweis: OFFLINE_HINWEIS,
        }),
      );
      laufend.push(l);
      say(`${String(nr).padStart(2)} ${f.id.padEnd(20)} ${fall.status}`);
      uhr.t += ABSTAND_MS;
    }

    // --- 2. The owner decides the next morning -----------------------------------------------
    uhr.t = Math.max(uhr.t, ENTSCHEIDUNG);
    const seiteAblegen = (l: Laufend, datei: string, titel: string, html: string) =>
      ablegen(l, datei, titel, offlineSeite(html, { css: '../review.css', pdf: null, hinweis: OFFLINE_HINWEIS }));
    for (const l of laufend) {
      const art = AKTIONEN[l.f.id];
      if (!art) continue;
      aktuell = l.f.id;
      const id = l.fall.id;
      const seite = await erwarte(await holen(`/angebot/${id}?t=${l.token}`), 200, `${l.f.id}: review page`);
      let aktion: 'freigeben' | 'manuell' | 'ablehnen';
      let felder: Record<string, string>;
      if (art === 'freigeben') {
        aktion = 'freigeben';
        felder = formularFelder(seite, 'freigeben');
      } else if (art === 'rueckfragen') {
        aktion = 'ablehnen';
        felder = { ...formularFelder(seite, 'ablehnen'), folge: 'kontakt', kontakt_art: 'mail' };
      } else if (art === 'absage') {
        aktion = 'ablehnen';
        felder = {
          ...formularFelder(seite, 'ablehnen'),
          folge: 'absage',
          grund: 'sonstiges',
          persoenlich: ABSAGE_PERSOENLICH,
        };
      } else {
        // Selbst kalkulieren: nothing is sent, the case waits for the owner's own range.
        const manuell = await erwarte(
          await senden(id, 'ablehnen', { ...formularFelder(seite, 'ablehnen'), folge: 'manuell' }),
          200,
          `${l.f.id}: selbst kalkulieren`,
        );
        seiteAblegen(l, 'selbst-kalkulieren.html', 'Selbst kalkulieren', manuell);
        uhr.t += 20 * MINUTE;
        const neu = await erwarte(await holen(`/angebot/${id}?t=${l.token}`), 200, `${l.f.id}: own range`);
        const k = kalkulationOf((await store.get(id))?.kalkulation);
        const eigen = eigenerRahmen(k?.min ?? 1000, k?.max ?? 2000);
        aktion = 'manuell';
        felder = { ...formularFelder(neu, 'manuell'), min: String(eigen.min), max: String(eigen.max) };
      }
      const bestaetigen = await erwarte(await senden(id, aktion, felder), 200, `${l.f.id}: confirm`);
      seiteAblegen(l, 'bestaetigen.html', 'Bestätigung', bestaetigen);
      uhr.t += MINUTE;
      const vorher = gesendet.length;
      const ergebnis = await erwarte(
        await senden(id, aktion, { ...formularFelder(bestaetigen, aktion), schritt: 'senden' }),
        200,
        `${l.f.id}: send`,
      );
      seiteAblegen(l, 'ergebnis.html', 'Ergebnis', ergebnis);
      for (const g of gesendet.slice(vorher).filter((x) => x.mail.kind === 'customer')) {
        const name = art === 'freigeben' || art === 'selbst' ? 'kunde-angebot' : `kunde-${art}`;
        mailAblegen(
          l,
          g,
          name,
          art === 'rueckfragen' ? 'Mail Rückfragen' : art === 'absage' ? 'Mail Absage' : 'Mail Angebot',
        );
        for (const a of g.mail.attachments ?? []) ablegen(l, a.filename, 'Angebot-PDF', a.content);
      }
      say(`   ${l.f.id.padEnd(20)} ${art}`);
      uhr.t += 3 * MINUTE;
    }

    // --- 3. Results ----------------------------------------------------------------------------
    const ergebnisse: DemoFall[] = [];
    for (const l of laufend) {
      const fall = (await store.get(l.fall.id))!;
      const rec = (fall.bewertung as BewertungRecord | null) ?? null;
      ergebnisse.push({
        nr: l.nr,
        fixture: l.f,
        ordner: l.ordner,
        fallId: fall.id,
        kurz: fall.kurz,
        status: fall.status,
        empfehlung: istEmpfehlung(fall.empfehlung) ? fall.empfehlung : null,
        bewertung: rec?.bewertung ?? null,
        rueckfragenPfad: rec?.rueckfragen ?? null,
        angebot: (fall.angebot as AngebotRecord | null) ?? null,
        kalkulation: kalkulationOf(fall.kalkulation),
        aktion: AKTIONEN[l.f.id] ?? 'tldr',
        entscheidung: istEntscheidung(fall.entscheidung) ? fall.entscheidung : null,
        dateien: l.dateien,
        kundenmails: gesendet.filter((g) => g.fixture === l.f.id && g.mail.kind === 'customer').map((g) => g.mail),
        vorschau: l.vorschau,
      });
    }
    const treffer = ergebnisse.filter((e) => e.empfehlung?.empfehlung === e.fixture.erwartet.empfehlung).length;
    const unpassendFreigegeben = ergebnisse.filter(
      (e) => e.fixture.art === 'unpassend' && e.empfehlung?.empfehlung === 'freigeben',
    ).length;
    return {
      ausgabe: o.ausgabe,
      faelle: ergebnisse,
      treffer,
      unpassendFreigegeben,
      bar: treffer >= Math.min(BAR_TREFFER, ergebnisse.length) && unpassendFreigegeben === 0,
      mails: gesendet.map((g) => g.mail),
      live: o.live ?? false,
      start: START,
      entscheidung: ENTSCHEIDUNG,
      config,
    };
  } finally {
    await runner.stop();
    await deps.mailer.close();
    await store.close();
    rmSync(arbeit, { recursive: true, force: true });
  }
}

/** Guard codes in German, for the overview. */
export const VERSTOSS_LABEL: Readonly<Record<Verstoss, string>> = {
  betrag: 'Betrag',
  prozent: 'Prozentangabe',
  url: 'Link',
  email: 'E-Mail-Adresse',
  telefon: 'Telefonnummer',
  datum: 'Datum',
  frist: 'Frist',
  gruen: 'Umweltaussage',
  laenge: 'zu lang',
  leer: 'leeres Feld',
};
