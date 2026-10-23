// `npm run demo` (docs/angebot.md §11 "Demo for the owner", phase 7f): the 24 eval fixtures through
// the real backend in SEND_MODE=dry-run, with the owner's actions for a representative subset, and
// a German overview for the owner in DATA_DIR/demo/index.html (default assistant/data/demo/).
//
// Claude: by default the recorded answers (eval/fixtures/aufnahmen.ts; no key, no network, no
// cost). Only with ANTHROPIC_API_KEY set AND `--live` does it call the API; it prints the cost
// estimate first and proceeds only with `--yes`. `--ohne-bilder` skips the screenshots.
// Exit code 0 when the §11 bar holds (recommendation as expected in ≥ 20 of 24, no unviable case
// recommended „Freigeben“), 1 otherwise, 2 for a usage error.
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createSdkClient, type ClaudeClient } from '../src/claude/client';
import { createLogger } from '../src/log';
import { EMPFEHLUNG_LABEL } from '../src/texte/inhaber';
import { bilder, type BildErgebnis } from './demo/bilder';
import { demoLauf } from './demo/lauf';
import { uebersicht } from './demo/uebersicht';
import { FAELLE } from './fixtures/faelle';
import { BAR_TREFFER, schaetzung } from './lauf';

const args = new Set(process.argv.slice(2));
const out = (s = ''): void => void process.stdout.write(`${s}\n`);
const live = args.has('--live');
const key = process.env['ANTHROPIC_API_KEY'];

let claude: ClaudeClient | undefined;
if (live) {
  if (!key) {
    out('ANTHROPIC_API_KEY fehlt. Ohne Schlüssel läuft die Demo mit Aufnahmen: `npm run demo`.');
    process.exit(2);
  }
  out(`Live-Demo: ${FAELLE.length} Fälle, bis zu zwei Aufrufe je Fall an claude-opus-5-5.`);
  out(`Geschätzte Kosten: höchstens etwa $${schaetzung(FAELLE.length).toFixed(2)}.`);
  if (!args.has('--yes')) {
    out('Zum Starten erneut mit `npm run demo -- --live --yes` aufrufen.');
    process.exit(2);
  }
  // Usage lines (codes, tokens) go to stderr; they carry no content.
  claude = createSdkClient({ apiKey: key, log: createLogger((l) => void process.stderr.write(`${l}\n`)) });
} else {
  out(`Demo: ${FAELLE.length} Fälle mit aufgezeichneten KI-Antworten (kein Netz, keine Kosten).`);
  if (key) out('ANTHROPIC_API_KEY ist gesetzt, wird ohne `--live` aber nicht benutzt.');
}
out('SEND_MODE=dry-run: keine Mail verlässt den Rechner.');
out();

const ausgabe = resolve(process.env['DATA_DIR'] || './data', 'demo');
const r = await demoLauf({
  ausgabe,
  ...(claude ? { claude } : {}),
  live,
  fortschritt: out,
});
const b: BildErgebnis = args.has('--ohne-bilder')
  ? { seiten: 0, pdfs: 0, hinweis: 'Bilder wurden in diesem Lauf nicht erzeugt (--ohne-bilder).' }
  : await bilder(ausgabe, r.faelle);
writeFileSync(join(ausgabe, 'index.html'), uebersicht(r, b));

const n = r.faelle.length;
const zaehle = (e: 'freigeben' | 'pruefen' | 'absagen') =>
  r.faelle.filter((f) => f.empfehlung?.empfehlung === e).length;
out();
out(
  `Empfehlungen: ${EMPFEHLUNG_LABEL.freigeben} ${zaehle('freigeben')}, ${EMPFEHLUNG_LABEL.pruefen} ${zaehle('pruefen')}, ${EMPFEHLUNG_LABEL.absagen} ${zaehle('absagen')}.`,
);
for (const f of r.faelle.filter((x) => x.empfehlung?.empfehlung !== x.fixture.erwartet.empfehlung)) {
  out(`  abweichend: ${f.fixture.id} ${f.empfehlung?.empfehlung ?? '–'} (erwartet ${f.fixture.erwartet.empfehlung})`);
}
out(
  `Empfehlung wie erwartet: ${r.treffer} / ${n} (Ziel ≥ ${BAR_TREFFER}); unpassend, aber Freigeben: ${r.unpassendFreigegeben}.`,
);
out(r.bar ? '§11-Bar: bestanden.' : '§11-Bar: NICHT bestanden.');
out(
  `Mails (nur als Datei): ${r.mails.length}, davon an Kunden ${r.mails.filter((m) => m.kind === 'customer').length}.`,
);
out(`Bilder: ${b.seiten} Prüfseiten, ${b.pdfs} PDF-Seiten.${b.hinweis ? ` ${b.hinweis}` : ''}`);
if (!b.seiten && !args.has('--ohne-bilder')) {
  out('  (Playwright aus dem node_modules der Website; DEMO_CHROMIUM=/pfad/zu/chrome wählt den Browser.)');
}
out(`Übersicht: ${join(ausgabe, 'index.html')}`);
process.exitCode = r.bar ? 0 : 1;
