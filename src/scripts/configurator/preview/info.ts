// Generator output for the live payload (payload.ts, `anfrage_json.moebel`): the Build of the values
// plus the cut list and the German description. Loaded on request on a Möbel submit in live mode. It
// imports the preview chunk statically, so the generators and describe() are bundled once and the cut
// list stays out of both the preview budget and the full-flow budget (scripts/check-budgets.mjs).
import type { Values } from '../../../lib/configurator/fields';
import { cutList } from '../../../lib/configurator/furniture/cutlist';
import type { Build, CutItem, FurnitureParams } from '../../../lib/configurator/furniture/types';
import { buildFor, describe } from './index';

export interface MoebelInfo {
  params: FurnitureParams;
  derived: Build['derived'];
  hints: Build['hints'];
  stueckliste: CutItem[];
  beschreibung: string;
}

/** Null when there is nothing to generate (Bett, andere, other project types). */
export async function moebelInfo(values: Values): Promise<MoebelInfo | null> {
  const b = await buildFor(values);
  return (
    b && { params: b.params, derived: b.derived, hints: b.hints, stueckliste: cutList(b), beschreibung: describe(b) }
  );
}
