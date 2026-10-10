// Photos (docs/configurator.md §1 "Photo policy"), loaded on the first file selection: at most 6
// files of ≤ 10 MB, each downscaled to 2560 px on the long edge and re-encoded as JPEG 0.82 (which
// strips EXIF/GPS), thumbnails with a remove button. The files live only in the input (never in the
// URL, sessionStorage or the draft); the selection accumulates across pickers.
import { PHOTO } from './messages.de';

export const MAX_FILES = 6;
export const MAX_BYTES = 10 * 1024 * 1024;
export const LONG_EDGE = 2560;
export const QUALITY = 0.82;

const kept = new WeakMap<HTMLInputElement, File[]>();

/** Downscaled JPEG copy; the original when the browser cannot decode it. */
export async function shrink(file: File): Promise<File> {
  try {
    const bmp = await createImageBitmap(file);
    const s = Math.min(1, LONG_EDGE / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * s);
    c.height = Math.round(bmp.height * s);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', QUALITY));
    return blob ? new File([blob], `${file.name.replace(/\.\w+$/, '')}.jpg`, { type: 'image/jpeg' }) : file;
  } catch {
    return file;
  }
}

function apply(input: HTMLInputElement, list: HTMLElement | null, files: File[], label: string, onChange: () => void) {
  const dt = new DataTransfer();
  for (const f of files) dt.items.add(f);
  input.files = dt.files;
  if (!list) return;
  list.hidden = !files.length;
  list.replaceChildren(
    ...files.map((f, i) => {
      const li = document.createElement('li');
      li.className = 'photos__item';
      const img = li.appendChild(document.createElement('img'));
      img.src = URL.createObjectURL(f);
      img.alt = '';
      img.onload = () => URL.revokeObjectURL(img.src);
      li.appendChild(document.createElement('span')).textContent = f.name;
      const b = li.appendChild(document.createElement('button'));
      b.type = 'button';
      b.className = 'btn btn--ghost btn--small';
      b.textContent = '×';
      b.setAttribute('aria-label', `${label}: ${f.name}`);
      b.onclick = () => {
        files.splice(i, 1);
        apply(input, list, files, label, onChange);
        onChange();
      };
      return li;
    }),
  );
}

export async function handlePhotos(
  input: HTMLInputElement,
  list: HTMLElement | null,
  removeLabel: string,
  onChange: () => void,
): Promise<void> {
  const files = kept.get(input) ?? [];
  kept.set(input, files);
  let error = '';
  for (const f of input.files ?? []) {
    if (files.length >= MAX_FILES) {
      error = PHOTO.tooMany;
      break;
    }
    if (f.size > MAX_BYTES) {
      error = PHOTO.tooBig;
      continue;
    }
    files.push(await shrink(f));
  }
  apply(input, list, files, removeLabel, onChange);
  input.setCustomValidity(error);
  onChange();
}
