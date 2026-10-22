// Attachments of POST /anfrage (docs/configurator.md §1 "Photo policy", §5; docs/architecture.md §8).
// They travel only in the enquiry mail and are never stored (docs/angebot.md §5). Each file is
// checked by its magic bytes, not by the declared type, and renamed safely. A file of a type that
// is not allowed is dropped (the mail notes how many), so a stray file never costs the enquiry;
// a file over its size limit or too many files reject the post.

import { safeFilename } from './sanitize';

export const MB = 1024 * 1024;

type Kind = 'jpeg' | 'png' | 'webp' | 'gif' | 'svg' | 'pdf' | 'doc' | 'docx';

const TYPES: Readonly<Record<Kind, { mime: string; ext: string }>> = {
  jpeg: { mime: 'image/jpeg', ext: 'jpg' },
  png: { mime: 'image/png', ext: 'png' },
  webp: { mime: 'image/webp', ext: 'webp' },
  gif: { mime: 'image/gif', ext: 'gif' },
  svg: { mime: 'image/svg+xml', ext: 'svg' },
  pdf: { mime: 'application/pdf', ext: 'pdf' },
  doc: { mime: 'application/msword', ext: 'doc' },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: 'docx' },
};

interface Rule {
  max: number;
  bytes: number;
  kinds: readonly Kind[];
  fallback: string;
}

/** Per field: count, size and allowed types. */
export const FILE_RULES: Readonly<Record<string, Rule>> = {
  // Photo policy: at most 6 files of ≤ 10 MB, JPEG/PNG/WebP.
  'fotos[]': { max: 6, bytes: 10 * MB, kinds: ['jpeg', 'png', 'webp'], fallback: 'foto' },
  // The SVG elevation (payload.ts, zeichnung.svg): a few hundred KB at most.
  zeichnung: { max: 1, bytes: 2 * MB, kinds: ['svg'], fallback: 'zeichnung' },
  // The 3D snapshot (ansicht_3d.webp, PNG fallback).
  ansicht_3d: { max: 1, bytes: 5 * MB, kinds: ['webp', 'png'], fallback: 'ansicht_3d' },
  // Application CV: PDF, Word or an image, ≤ 10 MB (FileField.astro).
  lebenslauf: {
    max: 1,
    bytes: 10 * MB,
    kinds: ['pdf', 'doc', 'docx', 'jpeg', 'png', 'webp', 'gif'],
    fallback: 'lebenslauf',
  },
};

/**
 * Body limit of POST /anfrage: the sum of the configurator's file limits (6 × 10 + 2 + 5 MB) plus
 * 3 MB for the text fields (anfrage_json ≤ 256 KB) and the multipart overhead.
 */
export const BODY_LIMIT = 70 * MB;

export interface Attachment {
  field: string;
  filename: string;
  contentType: string;
  content: Buffer;
}

export type AttachmentResult =
  | { ok: true; attachments: Attachment[]; dropped: number }
  | { ok: false; code: 'file_too_large' | 'too_many_files' | 'unknown_field' };

const starts = (b: Buffer, sig: readonly number[], at = 0): boolean => sig.every((x, i) => b[at + i] === x);
const ascii = (s: string): number[] => [...s].map((c) => c.charCodeAt(0));

/** The type by magic bytes, or null. */
export function sniff(b: Buffer): Kind | null {
  if (starts(b, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (starts(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (starts(b, ascii('RIFF')) && starts(b, ascii('WEBP'), 8)) return 'webp';
  if (starts(b, ascii('GIF87a')) || starts(b, ascii('GIF89a'))) return 'gif';
  if (starts(b, ascii('%PDF-'))) return 'pdf';
  if (starts(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return 'doc';
  if (starts(b, [0x50, 0x4b, 0x03, 0x04])) return 'docx';
  const head = b.subarray(0, 1024).toString('utf8').replace(/^﻿/, '').trimStart();
  if ((head.startsWith('<svg') || head.startsWith('<?xml')) && head.includes('<svg')) return 'svg';
  return null;
}

/** Checks and renames the files of a post; `allowed` lists the file fields of this form. */
export async function readAttachments(
  files: ReadonlyMap<string, readonly File[]>,
  allowed: readonly string[],
): Promise<AttachmentResult> {
  const out: Attachment[] = [];
  let dropped = 0;
  for (const [field, list] of files) {
    const rule = FILE_RULES[field];
    if (!rule || !allowed.includes(field)) return { ok: false, code: 'unknown_field' };
    // An untouched file input sends an empty part without a name.
    const real = list.filter((f) => f.size > 0);
    if (real.length > rule.max) return { ok: false, code: 'too_many_files' };
    if (real.some((f) => f.size > rule.bytes)) return { ok: false, code: 'file_too_large' };
    let n = 0;
    for (const f of real) {
      const content = Buffer.from(await f.arrayBuffer());
      const kind = sniff(content);
      if (!kind || !rule.kinds.includes(kind)) {
        dropped++;
        continue;
      }
      n++;
      const t = TYPES[kind];
      const fallback = rule.max > 1 ? `${rule.fallback}-${n}` : rule.fallback;
      let filename = safeFilename(f.name, t.ext, fallback);
      // Two photos called „image.jpg“ stay two attachments.
      if (out.some((a) => a.filename === filename)) filename = filename.replace(/(\.\w+)$/, `-${n}$1`);
      out.push({ field, filename, contentType: t.mime, content });
    }
  }
  return { ok: true, attachments: out, dropped };
}
