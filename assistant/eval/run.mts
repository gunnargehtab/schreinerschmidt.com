// `npm run eval` (docs/angebot.md §11): the quality eval against the real Claude API,
// `npm run eval -- --dry` against the in-process fake (no key, no network, no cost), or
// `npm run eval -- --aufnahmen` against the recorded answers of eval/fixtures/aufnahmen.ts (no key,
// no cost; a regression test of the bar with realistic answers).
//
// The live run refuses to start without ANTHROPIC_API_KEY, prints the estimated cost first and
// only proceeds with `--yes`. It sends the 24 invented fixture enquiries (no real customer data).
// Exit code 0 when the §11 bar holds (no amount in any Claude text, the recommendation matches in
// ≥ 20 of 24, no unviable case recommended „Freigeben“, no failed case), else 1; 2 for a usage
// error. The dry run exits 0 when the pipeline works.
import { createSdkClient } from '../src/claude/client';
import { createLogger } from '../src/log';
import { FAELLE } from './fixtures/faelle';
import { BAR_TREFFER, aufnahmeClient, dryClient, evaluiere, schaetzung, type EvalBericht } from './lauf';

const args = new Set(process.argv.slice(2));
const dry = args.has('--dry');
const aufnahmen = args.has('--aufnahmen');
const out = (s = ''): void => void process.stdout.write(`${s}\n`);

function bericht(r: EvalBericht): boolean {
  const pad = (s: string, n: number) => s.padEnd(n);
  out(
    `${pad('Fall', 22)}${pad('Spam', 7)}${pad('Machbarkeit', 16)}${pad('Passt', 7)}${pad('Text', 10)}${pad('Empfehlung', 13)}${pad('Erwartet', 11)}Ergebnis`,
  );
  for (const f of r.faelle) {
    const mark = (ok: boolean) => (ok ? '' : ' ✗');
    out(
      pad(f.id, 22) +
        pad(`${f.spam ?? '–'}${mark(f.spamOk)}`, 7) +
        pad(`${f.machbarkeit ?? '–'}${mark(f.machbarkeitOk)}`, 16) +
        pad(`${f.passt ?? '–'}${mark(f.passtOk)}`, 7) +
        pad(f.pfad ?? '–', 10) +
        pad(`${f.empfehlung}${mark(!f.unpassendFreigegeben && f.empfehlungOk)}`, 13) +
        pad(FAELLE.find((x) => x.id === f.id)?.erwartet.empfehlung ?? '–', 11) +
        (f.ok ? 'ok' : `FEHLER${f.fehler ? ` (${f.fehler})` : ''}${f.betragImText ? ' Betrag im KI-Text' : ''}`),
    );
  }
  const n = r.faelle.length;
  const failed = r.faelle.filter((f) => f.fehler).length;
  out();
  out(`Empfehlung wie erwartet:    ${r.empfehlungTreffer} / ${n} (Ziel ≥ ${BAR_TREFFER})`);
  out(`Bewertung wie erwartet:     ${r.erwartungTreffer} / ${n} (Spam, Machbarkeit, passt zum Betrieb)`);
  out(`Kein Betrag in KI-Texten:   ${r.ohneBetrag} / ${n} (Ziel ${n})`);
  out(`Unpassend, aber Freigeben:  ${r.unpassendFreigegeben} (Ziel 0)`);
  out(`Guards beim ersten Versuch: ${r.ersteAntwortSauber} / ${r.angebote} Angebotstexte`);
  out(`Gespeicherte Texte sauber:  ${r.faelle.filter((f) => f.gespeichertSauber).length} / ${n}`);
  out(`Fehlgeschlagene Fälle:      ${failed}`);
  out(
    `Geschätzte Kosten:          $${r.usd.toFixed(2)}${dry ? ' (Trockenlauf, Testclient)' : aufnahmen ? ' (Aufnahmen, keine Kosten)' : ''}`,
  );
  const bar = r.ohneBetrag === n && r.empfehlungTreffer >= BAR_TREFFER && r.unpassendFreigegeben === 0 && failed === 0;
  if (dry) out('§11-Bar: im Trockenlauf nicht aussagekräftig (Testantworten, keine KI).');
  else out(bar ? 'Bestanden.' : 'Nicht bestanden.');
  return bar;
}

/**
 * The dry run checks the harness, not the model: its scripted bad answers contain amounts on
 * purpose, so the §11 bar cannot hold. It passes when every case ran, every stored text is clean
 * and the scripted fixtures took the expected path (one bad answer → `ki_retry`, two → `vorlage`).
 */
function trockenOk(r: EvalBericht): boolean {
  const erwartet = { einmal: 'ki_retry', zweimal: 'vorlage' } as const;
  const pfade = FAELLE.every((f, i) => !f.dry || r.faelle[i]?.pfad === erwartet[f.dry]);
  const ok = r.faelle.every((f) => !f.fehler && f.gespeichertSauber) && pfade;
  out(
    `Trockenlauf (Testantworten mit absichtlichen Verstößen): ${ok ? 'Pipeline in Ordnung.' : 'Pipeline FEHLERHAFT.'}`,
  );
  return ok;
}

if (aufnahmen) {
  out(`Aufnahmen: ${FAELLE.length} Fälle mit aufgezeichneten KI-Antworten (kein Netz, keine Kosten).`);
  out();
  process.exitCode = bericht(await evaluiere(aufnahmeClient, FAELLE)) ? 0 : 1;
} else if (dry) {
  out(`Trockenlauf: ${FAELLE.length} Fälle gegen den Testclient (kein Netz, keine Kosten).`);
  out();
  const r = await evaluiere(dryClient, FAELLE);
  bericht(r);
  process.exitCode = trockenOk(r) ? 0 : 1;
} else {
  const key = process.env['ANTHROPIC_API_KEY'];
  if (!key) {
    out('ANTHROPIC_API_KEY fehlt. Ohne Schlüssel läuft nur `npm run eval -- --dry`.');
    process.exit(2);
  }
  out(`Live-Eval: ${FAELLE.length} Fälle × 2 Aufrufe an claude-opus-5-5.`);
  out(`Geschätzte Kosten: höchstens etwa $${schaetzung(FAELLE.length).toFixed(2)}.`);
  if (!args.has('--yes')) {
    out('Zum Starten erneut mit `npm run eval -- --yes` aufrufen.');
    process.exit(2);
  }
  // Usage lines (codes, tokens) go to stderr; they carry no content.
  const log = createLogger((l) => void process.stderr.write(`${l}\n`));
  const claude = createSdkClient({ apiKey: key, log });
  process.exitCode = bericht(await evaluiere(claude, FAELLE, { log })) ? 0 : 1;
}
