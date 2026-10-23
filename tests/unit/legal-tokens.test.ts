// Legal templates (src/lib/legal-tokens.ts, docs/architecture.md §9): mode blocks, comments, tokens,
// review marks and dropped "not applicable" facts, plus the real templates rendered end to end.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  renderLegal,
  resolveLegalMarkdown,
  resolveTokens,
  selectModeBlocks,
  stripComments,
  type LegalSite,
} from '../../src/lib/legal-tokens';

const site: LegalSite = {
  legalName: { value: 'Schreinerei Schmidt', status: 'confirmed' },
  owner: { name: 'Ulf Schmidt' },
  address: { street: 'Andreas-Hofer-Str. 33', postalCode: '68259', city: 'Mannheim' },
  phone: { display: '+49 179 9467822', e164: '+491799467822' },
  email: 'info@schreinerschmidt.com',
  legal: {
    legalForm: { value: 'e. K.', status: 'confirmed' },
    vatId: { value: 'DE123456789', status: 'confirmed' },
    economicId: { value: null, status: 'confirmed' },
    liabilityInsurance: { value: null, status: 'confirmed' },
    craftsRegisterNo: { value: 'Platzhalter', status: 'placeholder', note: 'Nummer vom Inhaber.' },
    professionalTitle: 'Schreinermeister',
    chamber: { name: 'Handwerkskammer X', address: 'B 1, 68159 Mannheim', url: 'https://www.hwk.example/' },
  },
};

const template = [
  'Vor dem Block.',
  '<!-- demo -->',
  'Nur Demo.',
  '<!-- /demo -->',
  '<!-- production -->',
  'Nur Produktion.',
  '<!-- /production -->',
  'Nach dem Block.',
].join('\n');

describe('selectModeBlocks', () => {
  it('keeps the demo blocks in demo builds and drops the production ones', () => {
    const out = selectModeBlocks(template, true);
    expect(out).toContain('Nur Demo.');
    expect(out).not.toContain('Nur Produktion.');
    expect(out).toContain('Vor dem Block.');
    expect(out).not.toContain('<!--');
  });

  it('keeps the production blocks in production builds', () => {
    const out = selectModeBlocks(template, false);
    expect(out).toContain('Nur Produktion.');
    expect(out).not.toContain('Nur Demo.');
  });

  it('ignores marker text inside a line of prose', () => {
    const text = 'Prosa mit <!-- demo --> mitten im Satz.';
    expect(selectModeBlocks(text, false)).toBe(text);
  });

  it('keeps the blocks of the form service in production only (D3)', () => {
    const forms = [
      '<!-- production -->',
      'Produktion.',
      '<!-- /production -->',
      '<!-- formtaxi -->',
      'Formulardienst form.taxi.',
      '<!-- /formtaxi -->',
      '<!-- assistant -->',
      'Anfrage-Server.',
      '<!-- /assistant -->',
    ].join('\n');
    const assistant = selectModeBlocks(forms, false, 'assistant');
    expect(assistant).toContain('Produktion.');
    expect(assistant).toContain('Anfrage-Server.');
    expect(assistant).not.toContain('form.taxi');
    for (const out of [selectModeBlocks(forms, false), selectModeBlocks(forms, false, 'formtaxi')]) {
      expect(out).toContain('Formulardienst form.taxi.');
      expect(out).not.toContain('Anfrage-Server.');
    }
    // Demo builds keep neither, whatever the service.
    const demo = selectModeBlocks(forms, true, 'assistant');
    expect(demo).not.toContain('Anfrage-Server.');
    expect(demo).not.toContain('form.taxi');
    expect(demo).not.toContain('Produktion.');
    expect(() => selectModeBlocks('<!-- production -->\n<!-- assistant -->', false)).toThrow(/inside an open/);
  });

  it('rejects unbalanced blocks', () => {
    expect(() => selectModeBlocks('<!-- demo -->\ntext', true)).toThrow(/never closed/);
    expect(() => selectModeBlocks('text\n<!-- /demo -->', true)).toThrow(/without a matching opener/);
    expect(() => selectModeBlocks('<!-- demo -->\n<!-- production -->', true)).toThrow(/inside an open/);
  });
});

describe('stripComments', () => {
  it('removes inline and multi-line comments without leaving double spaces', () => {
    const out = stripComments('Satz eins. <!-- needs-review: x --> Satz zwei.\n\n<!--\n  Notiz\n-->\n\nEnde.');
    expect(out).not.toContain('<!--');
    expect(out).toContain('Satz eins. Satz zwei.');
    expect(out).toContain('Ende.');
  });
});

describe('resolveTokens', () => {
  it('fills confirmed facts and site data as plain Markdown', () => {
    const out = resolveTokens('{{legalName}} ({{legalForm}}), {{owner}}, {{street}}, {{postalCode}} {{city}}', site);
    expect(out).toBe('Schreinerei Schmidt (e. K.), Ulf Schmidt, Andreas-Hofer-Str. 33, 68259 Mannheim\n');
  });

  it('links phone, e-mail and chamber', () => {
    const out = resolveTokens('{{phone}} {{email}} {{chamber}}', site);
    expect(out).toContain('(tel:+491799467822)');
    expect(out).toContain('[info@schreinerschmidt.com](mailto:info@schreinerschmidt.com)');
    expect(out).toContain('Handwerkskammer X, B 1, 68159 Mannheim ([hwk.example](https://www.hwk.example/))');
  });

  it('wraps unconfirmed facts in a review mark and names the missing value once', () => {
    const out = resolveTokens('Nr. {{craftsRegisterNo}}', site);
    expect(out).toContain('data-review="placeholder"');
    expect(out).toContain('title="Nummer vom Inhaber."');
    expect(out.match(/Handwerksrollen-Nr\. wird ergänzt/g)).toHaveLength(1);
    expect(out).not.toContain('[[');
    expect(out.match(/review-mark/g)).toHaveLength(1);
  });

  it('keeps a real value of an unconfirmed fact but marks it', () => {
    const unconfirmed: LegalSite = {
      ...site,
      legal: { ...site.legal, legalForm: { value: 'e. K.', status: 'needs-review' } },
    };
    const out = resolveTokens('{{legalForm}}', unconfirmed);
    expect(out).toContain('data-review="needs-review"');
    expect(out).toContain('>e. K.<');
  });

  it('wraps [[Platzhalter: …]] markers of the template once', () => {
    const out = resolveTokens('Fotos. [[Platzhalter: Bildnachweis]]', site);
    expect(out.match(/review-mark/g)).toHaveLength(1);
    expect(out).toContain('title="Bildnachweis">wird ergänzt</span>');
    expect(out).not.toContain('[[');
  });

  it('drops the paragraph of a fact that is confirmed as not applicable, and a heading left empty', () => {
    const out = resolveTokens(
      '## USt\n\nUSt-IdNr.: {{vatId}}\n\nW-IdNr.: {{economicId}}\n\n## Haftpflicht\n\n{{liabilityInsurance}}\n\n## Ende\n\nText.',
      site,
    );
    expect(out).toContain('USt-IdNr.: DE123456789');
    expect(out).not.toContain('W-IdNr.');
    expect(out).not.toContain('Haftpflicht');
    expect(out).toContain('## Ende');
  });

  it('escapes HTML in values and rejects unknown tokens', () => {
    const odd: LegalSite = { ...site, legalName: { value: 'A & <B>', status: 'confirmed' } };
    expect(resolveTokens('{{legalName}}', odd)).toContain('A &amp; &lt;B&gt;');
    expect(() => resolveTokens('{{nope}}', site)).toThrow(/unknown token/);
  });
});

describe('the real templates', () => {
  const body = (name: string) =>
    readFileSync(`src/content/legal/${name}.md`, 'utf8').replace(/^---[\s\S]*?\n---\n/, '');

  for (const name of ['impressum', 'datenschutz']) {
    for (const [demo, forms] of [
      [true, undefined],
      [false, 'formtaxi'],
      [false, 'assistant'],
    ] as const) {
      it(`${name} (${demo ? 'demo' : `production, ${forms}`}) leaves no token or comment behind`, () => {
        const out = resolveLegalMarkdown(body(name), { site, demo, forms });
        expect(out).not.toContain('{{');
        expect(out).not.toContain('<!--');
        expect(out).not.toContain('-->');
        expect(out).toContain('## ');
      });
    }
  }

  it('datenschutz shows the assistant section only when the forms post to the assistant', () => {
    const assistant = resolveLegalMarkdown(body('datenschutz'), { site, demo: false, forms: 'assistant' });
    const formTaxi = resolveLegalMarkdown(body('datenschutz'), { site, demo: false, forms: 'formtaxi' });
    const demo = resolveLegalMarkdown(body('datenschutz'), { site, demo: true, forms: 'assistant' });
    expect(assistant).toContain('## Anfragen und Preisrahmen');
    expect(assistant).toContain('Art.\u202f22 DSGVO');
    expect(assistant).toContain('Ulf Schmidt');
    expect(assistant).not.toContain('form.taxi');
    expect(assistant).not.toContain('In dieser Vorabversion');
    // Unknown facts stay review marks, never invented values.
    expect(assistant).toMatch(/data-review="placeholder"[^>]*>wird ergänzt/);
    expect(formTaxi).toContain('Zur Übermittlung der Formulare nutzen wir den Dienst form.taxi');
    expect(formTaxi).not.toContain('Anfragen und Preisrahmen');
    expect(formTaxi).not.toContain('Anfrage-Server');
    expect(demo).not.toContain('Anfragen und Preisrahmen');
    expect(demo).not.toContain('Anfrage-Server');
  });

  it('datenschutz shows only the blocks of the current mode', () => {
    const demo = resolveLegalMarkdown(body('datenschutz'), { site, demo: true });
    const production = resolveLegalMarkdown(body('datenschutz'), { site, demo: false });
    expect(demo).toContain('In dieser Vorabversion der Website werden keine Formulardaten übertragen');
    expect(demo).not.toContain('Zur Übermittlung der Formulare nutzen wir den Dienst form.taxi');
    expect(production).toContain('Zur Übermittlung der Formulare nutzen wir den Dienst form.taxi');
    expect(production).not.toContain('In dieser Vorabversion');
  });

  it('renders HTML with heading ids for the table of contents', async () => {
    const { html, headings } = await renderLegal(body('datenschutz'), { site, demo: true });
    expect(headings.length).toBeGreaterThan(8);
    for (const h of headings) expect(html).toContain(`<h2 id="${h.slug}">`);
    expect(html).not.toContain('{{');
    expect(html).not.toContain('<!--');
    expect(html).toContain('Ulf Schmidt');
    expect(html).toContain('<br>');
  });
});
