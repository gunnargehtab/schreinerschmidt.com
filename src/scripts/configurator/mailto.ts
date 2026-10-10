// mailto builder of the demo success view and the failure panel (docs/configurator.md §5 "mailto
// budget"). Pure: sections in, href out. Sections are added in priority order until the encoded
// URL would exceed the budget; the config link and the photo hint are always included.
export const MAILTO_LIMIT = 1800;

/** mailto texts (§5): the always-included footer and the truncation marker. German copy, same style as messages.de.ts. */
export const MAIL = {
  truncated: '[gekürzt – vollständige Angaben über den Konfigurationslink]',
  link: 'Konfigurationslink: ',
  photos: 'Fotos bitte als Anhang hinzufügen.',
} as const;

const CRLF = '\r\n';
const enc = encodeURIComponent;

export interface MailtoInput {
  /** Recipient; omitted while the owner has not confirmed the address. */
  to?: string | undefined;
  subject: string;
  /** Body sections in priority order (most important first); each may span several lines. */
  sections: readonly string[];
  /** The shareable configuration URL (absolute). */
  configUrl: string;
}

export interface Mailto {
  href: string;
  /** True when at least one section was left out. */
  truncated: boolean;
  /** Number of sections included. */
  included: number;
}

/** Line breaks normalised to CRLF, so they encode as %0D%0A. */
const crlf = (s: string): string => s.replace(/\r\n|\r|\n/g, CRLF);

export function buildMailto(input: MailtoInput, limit = MAILTO_LIMIT): Mailto {
  const subject = input.subject.replace(/\s+/g, ' ').trim();
  const head = `mailto:${input.to ?? ''}?subject=${enc(subject)}&body=`;
  const footer = enc(`${MAIL.link}${input.configUrl}${CRLF}${MAIL.photos}`);
  const marker = enc(MAIL.truncated);
  const gap = enc(CRLF + CRLF);
  const length = (parts: string[]): number => head.length + parts.join(gap).length;
  const total = input.sections.length;
  const parts: string[] = [];
  let included = 0;
  for (const section of input.sections) {
    const part = enc(crlf(section.trim()));
    const tail = included + 1 < total ? [marker, footer] : [footer];
    if (length([...parts, part, ...tail]) > limit) break;
    parts.push(part);
    included++;
  }
  const truncated = included < total;
  if (truncated) parts.push(marker);
  parts.push(footer);
  return { href: head + parts.join(gap), truncated, included };
}
