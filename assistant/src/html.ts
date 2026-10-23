// HTML templating with escaping by default (review page, mail HTML). `html\`…\`` escapes every
// interpolated value; only a `Roh` (the result of another html`` call, or raw() for fixed markup in
// code) is inserted as is. Arrays are joined; null, undefined and false render nothing.

export class Roh {
  constructor(readonly html: string) {}
  toString(): string {
    return this.html;
  }
}

/** Escapes text for element content and double- or single-quoted attribute values. */
export const esc = (s: string): string => s.replace(/[&<>"'`]/g, (ch) => `&#${ch.charCodeAt(0)};`);

type Wert = Roh | string | number | boolean | null | undefined | readonly Wert[];

const render = (v: Wert): string => {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof Roh) return v.html;
  if (Array.isArray(v)) return v.map(render).join('');
  return esc(String(v));
};

export function html(strings: TemplateStringsArray, ...values: Wert[]): Roh {
  let out = strings[0] ?? '';
  for (let i = 0; i < values.length; i++) out += render(values[i]) + (strings[i + 1] ?? '');
  return new Roh(out);
}

/** Fixed markup from code (never user input). */
export const raw = (s: string): Roh => new Roh(s);

/** Text with line breaks as <br> (escaped). */
export const mitUmbruechen = (s: string): Roh => new Roh(esc(s).replace(/\r?\n/g, '<br>\n'));
