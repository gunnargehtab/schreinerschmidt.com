// Browser storage of the wizard (docs/configurator.md §3 "Serialisation and history"): the
// sessionStorage snapshot (always, session state) and the opt-in localStorage draft (only while the
// checkbox is ticked; 30-day expiry, parsed by serialize.ts). Every storage access is wrapped in
// try/catch: access can throw (sandboxes, private mode, quota), and the wizard must keep working.
import { DRAFT_KEY, SESSION_KEY, fromDraft, fromSnapshot, toDraft, type Draft, type Snapshot } from './serialize';

type Store = () => Storage;
const session: Store = () => sessionStorage;
const local: Store = () => localStorage;

function read(store: Store, key: string): unknown {
  try {
    const raw = store().getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(store: Store, key: string, value: unknown): boolean {
  try {
    store().setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function drop(store: Store, key: string): void {
  try {
    store().removeItem(key);
  } catch {
    // Nothing to do.
  }
}

export const loadSession = (): Snapshot | null => fromSnapshot(read(session, SESSION_KEY));
export const saveSession = (s: Snapshot): boolean => write(session, SESSION_KEY, s);
export const clearSession = (): void => drop(session, SESSION_KEY);

/** The draft, or null; an expired or broken draft is deleted on the way. */
export function loadDraft(now = Date.now()): Draft | null {
  const raw = read(local, DRAFT_KEY);
  const d = fromDraft(raw, now);
  if (raw && !d) drop(local, DRAFT_KEY);
  return d;
}
export const saveDraft = (s: Snapshot, now = Date.now()): boolean => write(local, DRAFT_KEY, toDraft(s, now));
export const clearDraft = (): void => drop(local, DRAFT_KEY);

/** „09.10.2026“ for the draft banner. */
export const draftDate = (d: Draft): string => new Date(d.savedAt).toLocaleDateString('de-DE', { dateStyle: 'medium' });
