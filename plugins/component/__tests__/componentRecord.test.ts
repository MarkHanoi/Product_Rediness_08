// componentRecord — the L0 PROPERTIES of a placed occurrence. §COMPONENT-PLACE.
//
// ⛔ THIS FILE IS NOT THE LANE'S ACCEPTANCE, AND SAYING SO IS THE POINT.
// The acceptance is `apps/editor/__tests__/componentJoinThroughComposedRuntime.
// test.ts`, which boots the REAL composition root, dispatches through the REAL bus
// and reads back out of the REAL store. THIS file constructs nothing but Zod parses,
// so by construction it cannot observe a missing PluginRegistry descriptor, a
// missing `StoresSlot` key, an unreachable serializer channel or an unadapted undo —
// the four ways this family could be built and still be dead.
//
// That distinction is exactly what `plugins/balcony/__tests__/balconyCompound.test.ts`
// and its composed-runtime complement record, and it is the pool's lesson: a
// thorough suite that SUPPLIES what is broken passes for weeks
// ([[fake-more-capable-than-real]]).
//
// What it IS for: the schema-level facts that are cheap here and expensive there —
// the parse defaults every family owes, and the three refusals that keep an
// unresolvable occurrence unrepresentable.

import { describe, expect, it } from 'vitest';
import { Component } from '@pryzm/plugin-sdk';

const ULID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const DEF = `fam_${ULID}`;
const TYPE = `typ_${ULID}`;
const PARAM = `par_${ULID}`;

describe('§COMPONENT-PLACE — the L0 record', () => {
  it('parses from {} with every default stamped — the contract defineElement() owes every family', () => {
    const c = Component.parse({});
    expect(c.type).toBe('component');
    expect(c.id).toMatch(/^component_[0-9A-HJKMNP-TV-Z]{26}$/);
    // ⭐ EMPTY, NOT ABSENT, AND NOT A FABRICATED REFERENCE. A default `fam_…` would
    // invent a definition; refusing to parse would break the round-trip contract.
    // The empty string is the third answer, and `component.place` is where it is
    // refused — see `PlaceComponentHandler.canExecute`.
    expect(c.definitionId).toBe('');
    expect(c.typeId).toBe('');
    expect(c.instanceParameters).toEqual({});
    expect(c.origin).toEqual({ x: 0, y: 0, z: 0 });
    expect(c.rotation).toBe(0);
    // Absent stays absent (C79 §2.3) — an optional field is not defaulted into being.
    expect(c.hostId).toBeUndefined();
    expect(c.definitionVersion).toBeUndefined();
    expect(c.materialId).toBeUndefined();
  });

  it('re-parsing its own output is a fixed point — the byte-identical round-trip BaseNodeShape requires', () => {
    const once = Component.parse({});
    expect(Component.parse(once)).toEqual(once);
  });

  it('REFUSES a typeId with no definitionId — "wearing type X of nothing" is unrepresentable', () => {
    const r = Component.safeParse({ id: `component_${ULID}`, type: 'component', typeId: TYPE });
    expect(r.success).toBe(false);
    expect(r.error!.issues[0]!.message).toMatch(/typeId names a type of definitionId/);
  });

  it('REFUSES an instance override with no definitionId — an override that will never be read', () => {
    const r = Component.safeParse({
      id: `component_${ULID}`, type: 'component', instanceParameters: { [PARAM]: 1.2 },
    });
    expect(r.success).toBe(false);
    expect(r.error!.issues[0]!.message).toMatch(/instanceParameters override parameters/);
  });

  it('REFUSES an override keyed by a display name — ids only, so a rename cannot orphan one', () => {
    const r = Component.safeParse({
      id: `component_${ULID}`, type: 'component', definitionId: DEF, typeId: TYPE,
      instanceParameters: { Width: 1.2 },
    });
    expect(r.success).toBe(false);
  });

  it('REFUSES a null override value — "cleared" and "set to nothing" must not be the same value', () => {
    // ⭐ THE VERB CARRIES `clear: true` FOR THIS EXACT REASON. If `null` parsed here,
    // a cleared override and an override set to nothing would be the same bytes
    // ([[context-data-honesty-family]]), and the ladder below the instance rung could
    // never be reached again.
    const r = Component.safeParse({
      id: `component_${ULID}`, type: 'component', definitionId: DEF, typeId: TYPE,
      instanceParameters: { [PARAM]: null },
    });
    expect(r.success).toBe(false);
  });

  it('ACCEPTS a well-formed placement, and keeps the definition OUT of the record', () => {
    const c = Component.parse({
      id: `component_${ULID}`, type: 'component', levelId: 'L0',
      definitionId: DEF, typeId: TYPE, definitionVersion: '1.0.0',
      origin: { x: 2, y: 0, z: 3 }, instanceParameters: { [PARAM]: 1.8 },
    });
    expect(c.definitionId).toBe(DEF);
    expect(c.instanceParameters[PARAM]).toBe(1.8);
    // ⭐ NO PARAMETERS, NO PROFILES, NO SOLIDS, NO RESOLVED VALUES. The occurrence
    // REFERENCES a definition; it never copies one. That absence is what makes spec
    // §66's F-2 true by construction — there is no stored copy to go stale.
    for (const forbidden of ['parameters', 'profiles', 'solids', 'types', 'resolved']) {
      expect(Object.prototype.hasOwnProperty.call(c, forbidden), `record must not carry ${forbidden}`).toBe(false);
    }
  });
});
