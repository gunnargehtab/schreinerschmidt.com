// Reads the drawn text back out of a pdf-lib PDF (tests only).
import { inflateSync } from 'node:zlib';

/** The text drawn in a PDF: every `<hex> Tj` of every (inflated) content stream, CP1252-decoded. */
export function pdfTexte(bytes: Uint8Array): string[] {
  const buf = Buffer.from(bytes);
  const out: string[] = [];
  const dec = new TextDecoder('windows-1252');
  let i = 0;
  for (;;) {
    const s = buf.indexOf('stream\n', i);
    if (s < 0) break;
    const e = buf.indexOf('endstream', s);
    const raw = buf.subarray(s + 7, e);
    let text: string;
    try {
      text = inflateSync(raw).toString('latin1');
    } catch {
      text = raw.toString('latin1');
    }
    for (const m of text.matchAll(/<([0-9A-Fa-f]*)> Tj/g)) out.push(dec.decode(Buffer.from(m[1]!, 'hex')));
    i = e + 9;
  }
  return out;
}
