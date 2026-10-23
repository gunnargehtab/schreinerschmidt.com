// The site's no-JS form posts, byte for byte as a browser sends them (phase 7e, docs/angebot.md §9):
// FormShell.astro always sets enctype="multipart/form-data" when the forms post to the assistant,
// also without a file input. The bodies below follow the field order of the built kontakt and
// karriere forms (fields, then the honeypot `homepage`, then _next, _lang, _subject), with empty
// optional fields and, for the application, the empty part of an untouched file input. Without
// `Accept: application/json` the backend answers 303 to `_next`.
import { afterEach, describe, expect, it } from 'vitest';
import { SITE, cleanupDirs, harness, type Harness } from './helpers';

let h: Harness;
afterEach(async () => {
  await h?.close();
  cleanupDirs();
});

const BOUNDARY = '----WebKitFormBoundaryq3XcR2vT8kLm0aZb';
/** A browser navigation's Accept header (no JSON): the backend redirects. */
const NAV_ACCEPT = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';

type Part = [name: string, value: string] | [name: string, file: { filename: string; type: string; body: string }];

/** A multipart/form-data body as Chromium serialises a native form submission (CRLF, quoted names). */
function multipart(parts: Part[]): string {
  const out: string[] = [];
  for (const [name, value] of parts) {
    out.push(`--${BOUNDARY}`);
    if (typeof value === 'string') {
      out.push(`Content-Disposition: form-data; name="${name}"`, '', value);
    } else {
      out.push(
        `Content-Disposition: form-data; name="${name}"; filename="${value.filename}"`,
        `Content-Type: ${value.type}`,
        '',
        value.body,
      );
    }
  }
  out.push(`--${BOUNDARY}--`, '');
  return out.join('\r\n');
}

const post = (body: string, contentType = `multipart/form-data; boundary=${BOUNDARY}`) =>
  h.post(body, { json: false, headers: { 'Content-Type': contentType, Accept: NAV_ACCEPT } });

/** kontakt/: name, email, telefon, plz, ort, thema, nachricht (src/pages/kontakt/index.astro). */
const kontakt = (): Part[] => [
  ['name', 'Erika Mustermann'],
  ['email', 'erika@example.com'],
  ['telefon', ''],
  ['plz', ''],
  ['ort', ''],
  ['thema', ''],
  ['nachricht', 'Ich hätte gern einen Termin für eine Einbauküche.'],
  ['homepage', ''],
  ['_next', `${SITE}/kontakt/danke/`],
  ['_lang', 'de'],
  ['_subject', 'Anfrage über die Website'],
];

/** karriere/: name, email, telefon, stelle, nachricht, lebenslauf (src/pages/karriere/index.astro). */
const karriere = (cv: { filename: string; type: string; body: string }): Part[] => [
  ['name', 'Max Mustermann'],
  ['email', 'max@example.com'],
  ['telefon', ''],
  ['stelle', 'schreiner'],
  ['nachricht', ''],
  ['lebenslauf', cv],
  ['homepage', ''],
  ['_next', `${SITE}/karriere/danke/`],
  ['_lang', 'de'],
  ['_subject', 'Bewerbung über die Website'],
];

describe('the site’s no-JS form posts', () => {
  it('kontakt: a multipart post without a file input is mailed and redirected to _next', async () => {
    h = harness();
    const res = await post(multipart(kontakt()));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(`${SITE}/kontakt/danke/`);
    expect(h.ctl.sent).toHaveLength(1);
    expect(h.ctl.sent[0]?.subject).toBe('Anfrage über die Website');
    expect(h.ctl.sent[0]?.text).toContain('Einbauküche');
    expect(h.count('faelle')).toBe(0);
  });

  it('kontakt: the same fields urlencoded (the old FormShell without enctype) answer 415', async () => {
    h = harness();
    const body = new URLSearchParams(kontakt() as [string, string][]).toString();
    const res = await post(body, 'application/x-www-form-urlencoded');
    expect(res.status).toBe(415);
    expect(h.ctl.sent).toHaveLength(0);
  });

  it('karriere: the empty part of an untouched file input is ignored', async () => {
    h = harness();
    const res = await post(multipart(karriere({ filename: '', type: 'application/octet-stream', body: '' })));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(`${SITE}/karriere/danke/`);
    expect(h.ctl.sent).toHaveLength(1);
    expect(h.ctl.sent[0]?.attachments ?? []).toHaveLength(0);
  });

  it('karriere: a PDF CV travels as the attachment', async () => {
    h = harness();
    const res = await post(
      multipart(karriere({ filename: 'Lebenslauf.pdf', type: 'application/pdf', body: '%PDF-1.7\n%test\n' })),
    );
    expect(res.status).toBe(303);
    expect(h.ctl.sent[0]?.attachments?.map((a) => [a.filename, a.contentType])).toEqual([
      ['Lebenslauf.pdf', 'application/pdf'],
    ]);
  });
});
