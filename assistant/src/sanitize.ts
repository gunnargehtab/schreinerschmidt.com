// Text hygiene for anything that ends up in a mail header, a mail body or a file name. Pure.

/** C0/C1 controls, DEL, and the Unicode line/paragraph separators. */
const CONTROLS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g;
const BODY_CONTROLS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u2028\u2029]/g;

/** One header line: controls (incl. CR/LF) become spaces, whitespace collapses, capped with „…“. */
export function headerText(s: string, max = 200): string {
  const t = s.replace(CONTROLS, ' ').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** A single-line form value: controls removed, line breaks and tabs become one space, trimmed. */
export const lineText = (s: string): string => s.replace(BODY_CONTROLS, '').replace(/\s+/g, ' ').trim();

/** Body text: line breaks and tabs stay (normalised to \n), other controls go, capped. */
export function bodyText(s: string, max = 20000): string {
  const t = s.replace(/\r\n?/g, '\n').replace(BODY_CONTROLS, '');
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/**
 * A customer e-mail address as the browser's `<input type=email>` accepts it (the WHATWG
 * valid-e-mail-address grammar: `a@b` is valid, a dot in the domain is not required). The grammar
 * has no spaces, CR/LF, angle brackets, commas or semicolons, so the address is safe for a
 * Reply-To header. Callers trim first, as the browser does.
 */
const EMAIL =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/;
export const isEmail = (s: string, max = 254): boolean => s.length <= max && EMAIL.test(s);

/**
 * A file name for an attachment: the base name without any path, only letters (incl. umlauts),
 * digits, `.`, `_` and `-`, no leading dot, at most 80 characters, with the extension of the
 * sniffed type. `fallback` is used when nothing usable remains.
 */
export function safeFilename(name: string, ext: string, fallback: string): string {
  const base = (name.split(/[\\/]/).pop() ?? '')
    .normalize('NFC')
    .replace(/\.[^.]*$/, '')
    .replace(CONTROLS, '')
    .replace(/[^\p{L}\p{N}._-]+/gu, '_')
    .replace(/^[._-]+/, '')
    .replace(/_+/g, '_')
    .slice(0, 80);
  return `${base || fallback}.${ext}`;
}
