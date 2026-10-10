// mailto budget (docs/configurator.md §5, §7 "mailto").
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildMailto, MAILTO_LIMIT } from '../../../src/scripts/configurator/mailto';
import { MAIL } from '../../../src/scripts/configurator/messages.de';

const link = 'https://gunnargehtab.github.io/schreinerschmidt.com/konfigurator/?v=1&typ=moebel&moebel_art=regal';
const footer = encodeURIComponent(`${MAIL.link}${link}\r\n${MAIL.photos}`);
const marker = encodeURIComponent(MAIL.truncated);
const gap = '%0D%0A%0D%0A';

describe('buildMailto', () => {
  it('builds a mailto with subject, sections, link and the photo hint', () => {
    const m = buildMailto({
      to: 'info@example.org',
      subject: 'Anfrage Möbel: Regal',
      sections: ['Projekt: Möbel\nRegal 120 × 200 × 35 cm', 'Kontakt: Max'],
      configUrl: link,
    });
    expect(m.href).toBe(
      'mailto:info@example.org?subject=Anfrage%20M%C3%B6bel%3A%20Regal&body=' +
        'Projekt%3A%20M%C3%B6bel%0D%0ARegal%20120%20%C3%97%20200%20%C3%97%2035%20cm' +
        gap +
        'Kontakt%3A%20Max' +
        gap +
        footer,
    );
    expect(m).toMatchObject({ truncated: false, included: 2 });
  });

  it('works without a recipient and with no sections', () => {
    const m = buildMailto({ subject: 'Anfrage', sections: [], configUrl: link });
    expect(m.href).toBe(`mailto:?subject=Anfrage&body=${footer}`);
    expect(m).toMatchObject({ truncated: false, included: 0 });
  });

  it('encodes umlauts and CRLF, never raw line breaks', () => {
    const m = buildMailto({ subject: 'Ä Ö Ü ß', sections: ['Größe:\r\n120\rcm\nÄnderung'], configUrl: link });
    expect(m.href).toContain('%C3%84%20%C3%96%20%C3%9C%20%C3%9F');
    expect(m.href).toContain('Gr%C3%B6%C3%9Fe%3A%0D%0A120%0D%0Acm%0D%0A%C3%84nderung');
    expect(m.href).not.toMatch(/[\r\n]/);
    expect(m.href).not.toMatch(/(?<!%0D)%0A/);
  });

  it('collapses whitespace in the subject', () => {
    expect(buildMailto({ subject: '  Anfrage \n Möbel  ', sections: [], configUrl: link }).href).toContain(
      'subject=Anfrage%20M%C3%B6bel&',
    );
  });

  it('drops sections by priority and appends the truncation marker', () => {
    const long = 'x'.repeat(1400);
    const m = buildMailto({ subject: 'S', sections: ['erste', long, 'dritte'.repeat(40), long], configUrl: link });
    expect(m.href.length).toBeLessThanOrEqual(MAILTO_LIMIT);
    expect(m).toMatchObject({ truncated: true, included: 2 });
    expect(m.href).toContain(`erste${gap}${long}${gap}${marker}${gap}${footer}`);
    expect(m.href).not.toContain('dritte');
  });

  it('keeps the marker, the link and the hint even when nothing fits', () => {
    const m = buildMailto({ subject: 'S', sections: ['x'.repeat(5000)], configUrl: link });
    expect(m.href).toBe(`mailto:?subject=S&body=${marker}${gap}${footer}`);
    expect(m).toMatchObject({ truncated: true, included: 0 });
  });

  it('includes the last section even when the marker would not have fit', () => {
    // Fill the budget so that the last section fits only without the reserved marker.
    const base = buildMailto({ subject: 'S', sections: [], configUrl: link }).href.length;
    const room = MAILTO_LIMIT - base - gap.length;
    const m = buildMailto({ subject: 'S', sections: ['y'.repeat(room)], configUrl: link });
    expect(m.href.length).toBe(MAILTO_LIMIT);
    expect(m.truncated).toBe(false);
  });

  it('never exceeds 1800 characters and always ends with the footer', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ unit: 'grapheme', maxLength: 400 }), { maxLength: 8 }),
        fc.string({ unit: 'grapheme', maxLength: 80 }),
        fc.option(fc.emailAddress(), { nil: undefined }),
        (sections, subject, to) => {
          const m = buildMailto({ to, subject, sections, configUrl: link });
          expect(m.href.length).toBeLessThanOrEqual(MAILTO_LIMIT);
          expect(m.href.startsWith(`mailto:${to ?? ''}?subject=`)).toBe(true);
          expect(m.href.endsWith(footer)).toBe(true);
          expect(m.href).not.toMatch(/[^\x21-\x7e]/);
          expect(m.included).toBeLessThanOrEqual(sections.length);
          expect(m.truncated).toBe(m.included < sections.length);
          expect(m.href.includes(marker)).toBe(m.truncated);
          const decoded = decodeURIComponent(m.href.slice(m.href.indexOf('&body=') + 6));
          expect(decoded.endsWith(`${MAIL.link}${link}\r\n${MAIL.photos}`)).toBe(true);
          expect(decoded).not.toMatch(/(?<!\r)\n/);
        },
      ),
    );
  });

  it('accepts a custom limit', () => {
    const m = buildMailto({ subject: 'S', sections: ['abc', 'def'], configUrl: link }, 10000);
    expect(m.included).toBe(2);
  });
});
