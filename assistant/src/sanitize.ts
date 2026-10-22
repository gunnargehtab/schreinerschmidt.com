// Text hygiene for anything that ends up in a mail header, a mail body or a file name. Pure.

/** C0/C1 controls, DEL, and the Unicode line/paragraph separators. */
const CONTROLS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g;
const BODY_CONTROLS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u2028\u2029]/g;

/** One header line: controls (incl. CR/LF) become spaces, whitespace collapses, capped with „…“. */
export function headerText(s: string, max = 200): string {
  const t = s.replace(CONTROLS, ' ').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** Body text: line breaks and tabs stay (normalised to \n), other controls go, capped. */
export function bodyText(s: string, max = 20000): string {
  const t = s.replace(/\r\n?/g, '\n').replace(BODY_CONTROLS, '');
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/**
 * A customer e-mail address that is safe for a Reply-To header: one addr-spec, no display name,
 * no spaces, no CR/LF, no list separators, a dot in the domain, ≤ 254 characters.
 */
const EMAIL =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
export const isEmail = (s: string): boolean => s.length <= 254 && EMAIL.test(s);

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
