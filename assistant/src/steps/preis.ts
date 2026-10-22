// Step `preis` (docs/angebot.md §4): the rule-based price from the validated values and the service
// tier of the PLZ, stored on the case as the KalkulierenResult (a Kalkulation, or the `mengen-noetig`
// marker for the branches Claude quantifies in 7c). The status stays `eingegangen`; it becomes
// `bewertet` once the TL;DR is out (7d). For Möbel the Build is regenerated from the values (§2
// "The backend re-derives everything"); when the client's door/drawer/hinge counts differ, a
// content-free `build_mismatch` event flags it for the recommendation (§7.1), never an error.
import { generate } from '../../../src/lib/configurator/furniture';
import { kalkulieren } from '../../../src/lib/configurator/pricing/kalkulieren';
import { serviceArea } from '../../../src/lib/configurator/service-area';
import { paramsFromValues } from '../../../src/scripts/configurator/preview/params';
import type { StepDef } from '../jobs';
import type { Fall } from '../store';

/** True when the client's derived counts disagree with the regenerated Build (null: nothing to compare). */
export function buildMismatch(fall: Fall): boolean | null {
  const v = fall.payload.values;
  const client = fall.payload.anfrage?.moebel?.derived;
  if (v['typ'] !== 'moebel' || !client) return null;
  const params = paramsFromValues(v);
  if (!params) return null;
  const d = generate(params).derived;
  return client.doors !== d.doors || client.drawers !== d.drawers || client.hinges !== d.hinges;
}

export const preis: StepDef = {
  async run({ fall, store, clock }) {
    const v = fall.payload.values;
    const plz = typeof v['plz'] === 'string' ? v['plz'] : '';
    const result = kalkulieren(v, { tier: serviceArea(plz)?.tier ?? null });
    await store.update(fall.id, { kalkulation: result });
    await store.event(fall.id, result.kind === 'regeln' ? 'preis_regeln' : 'preis_mengen_noetig', null, clock.now());
    if (buildMismatch(fall)) await store.event(fall.id, 'build_mismatch', null, clock.now());
  },
};
