// The enquiry mail to the owner (docs/angebot.md §0 step 1, docs/assistant.md §4.1 step 2): what
// form.taxi delivered so far. From MAIL_FROM to OWNER_EMAIL, Reply-To the customer's validated
// address, the subject from `_subject` (sanitized), a plain-text body and the attachments.
// Owner-facing German lines only; nothing here reaches the customer.
import type { Attachment } from '../attachments';
import type { Config } from '../config';
import { bodyText, headerText } from '../sanitize';
import type { Payload } from '../types';
import type { OutgoingMail } from './index';

export const SUBJECT_MAX = 200;

/** Subject for the owner: the sanitized `_subject`, or a neutral fallback. */
export const enquirySubject = (raw: string | undefined, fallback: string): string =>
  headerText(raw ?? '', SUBJECT_MAX) || fallback;

export interface Delivery {
  attachments: readonly Attachment[];
  /** Files dropped because their type is not allowed. */
  dropped: number;
  /** True when the mail is sent by the retry job, without the attachments (they are never stored). */
  withoutAttachments?: boolean;
}

function notes(d: Delivery, names: readonly string[]): string[] {
  const out: string[] = [];
  if (d.dropped > 0) out.push(`Hinweis: ${d.dropped} Datei(en) mit nicht erlaubtem Dateityp wurden nicht übernommen.`);
  if (d.withoutAttachments && names.length) {
    out.push(
      `Hinweis: Die Anhänge (${names.join(', ')}) konnten nicht mit zugestellt werden. Bitte beim Kunden anfordern.`,
    );
  }
  return out;
}

/** Configurator enquiry: zusammenfassung + Vorgangsnummer + config link. */
export function configuratorMail(config: Config, p: Payload, kurz: string, d: Delivery): OutgoingMail {
  const lines = [p.zusammenfassung.trimEnd(), '', `Vorgangsnummer: #${kurz}`];
  if (p.configUrl) lines.push(`Konfiguration: ${p.configUrl}`);
  const n = notes(d, p.anhaenge);
  if (n.length) lines.push('', ...n);
  return {
    kind: 'owner',
    to: config.ownerEmail,
    subject: p.subject,
    text: bodyText(lines.join('\n'), 40000),
    replyTo: p.replyTo,
    attachments: d.withoutAttachments ? [] : d.attachments,
  };
}

const CONTACT_LABELS: Readonly<Record<string, string>> = {
  name: 'Name',
  email: 'E-Mail',
  telefon: 'Telefon',
  plz: 'PLZ',
  ort: 'Ort',
  thema: 'Thema',
  stelle: 'Stelle',
};

/** Contact form or application: the fields as lines, then the message. */
export function contactMail(
  config: Config,
  values: Readonly<Record<string, string>>,
  subject: string,
  replyTo: string | null,
  d: Delivery,
): OutgoingMail {
  const lines = Object.entries(CONTACT_LABELS)
    .filter(([k]) => values[k])
    .map(([k, label]) => `${label}: ${values[k]}`);
  if (values['nachricht']) lines.push('', 'Nachricht:', values['nachricht']);
  const n = notes(d, []);
  if (n.length) lines.push('', ...n);
  return {
    kind: 'owner',
    to: config.ownerEmail,
    subject,
    text: bodyText(lines.join('\n'), 40000),
    replyTo,
    attachments: d.attachments,
  };
}
