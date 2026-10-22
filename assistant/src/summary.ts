// Server-side summary for configurator posts without JS (no `zusammenfassung`, no `anfrage_json`):
// one „Label: Wert“ line per validated value, with the German labels of labels.ts. The JS path
// keeps the client's summary.ts text, as form.taxi delivered it.
import { FIELDS, type Values } from '../../src/lib/configurator/fields';
import { LABELS, PROJECT_TYPE_LABELS } from '../../src/lib/configurator/labels';

const label = (name: string): string => LABELS[name]?.label ?? name;
const option = (name: string, v: string): string => LABELS[name]?.options?.[v] ?? v;

export function serverSummary(values: Values): string {
  const lines: string[] = [];
  for (const name of Object.keys(FIELDS)) {
    const x = values[name];
    if (x === undefined || x === '' || (Array.isArray(x) && !x.length)) continue;
    let text: string;
    if (name === 'typ' && typeof x === 'string')
      text = PROJECT_TYPE_LABELS[x as keyof typeof PROJECT_TYPE_LABELS]?.label ?? x;
    else if (FIELDS[name]?.kind === 'bool') text = 'Ja';
    else text = (Array.isArray(x) ? x : [x]).map((v) => option(name, v)).join(', ');
    lines.push(`${label(name)}: ${text}`);
  }
  return lines.join('\n');
}
