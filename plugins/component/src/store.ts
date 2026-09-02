// ComponentStore — the ONE authoritative store for PLACED component occurrences.
// §COMPONENT-PLACE (audit §12 Phase 4C) · ADR-0376 D9 · C84 EI-1 · C84 §6.2e.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐ THIS STORE IS THE ANSWER TO "WHAT IS IN THIS PROJECT?" FOR THIS FAMILY.
// ═══════════════════════════════════════════════════════════════════════════════
//
// C84 EI-1 requires ONE named authority per family. For every other family in this
// repository that sentence had to be argued: a wall lives in a plugin DTO store AND
// a legacy geometry twin AND the scene's `userData`, and `CommandEventBridge` keeps
// them in step. This family starts with **one**, and C84 §6.2e names that as an
// obligation rather than a convenience:
//
//   > "Section 2 (Stores) inherits EI-1's one-authority rule against a family that
//    starts with two representations — a document model and an element record."
//
// It does not have two. The DEFINITION is a `.pryzm-family` document owned by
// `@pryzm/file-format`; the OCCURRENCE is a record in here. They are different
// objects with different lifetimes, not two copies of one object — a definition
// outlives every occurrence of it, and an occurrence can be deleted without
// touching the definition. ⛔ A second store for placed components — a legacy
// twin, a render mirror, a "componentInstances" map somewhere else — must earn it
// under EI-10 and is not to be added by convenience.
//
// ─── ⚠ WHAT IS DELIBERATELY *NOT* IN A RECORD ─────────────────────────────────
// No resolved parameter values, no geometry, no mesh, no baked profile. A resolved
// value stored is a derived value stored (C84 §8.i), and the ENTIRE POINT of spec
// §66's F-2 falsifier — place twenty, override one, change the type, nineteen
// follow — is that there is no stored copy to go stale. `resolveParameter()` in
// `@pryzm/family-runtime` is the one resolver and it is called at read time.
//
// ─── ⛔ AND NO RENDER SEAM IS CLAIMED ─────────────────────────────────────────
// `Store.applyPatch()` notifies `subscribeDirty` on execute, undo and redo alike,
// so anything that subscribes sees every change through one road. At this commit
// NOTHING subscribes: the 3-D leg is Phase 4E's under ADR-0376 D10, whose descope
// is pre-authorised. That is stated here because a store with a dirty channel and
// no subscriber looks identical to a wired one from the inside, and
// [[committed-is-not-reachable]] is the standing receipt for reading the second as
// the first.

import { Store } from '@pryzm/plugin-sdk';
import type { Component as ComponentSchemaInfer } from '@pryzm/plugin-sdk';

/** Placed-occurrence DTO inferred from the canonical L0 Zod schema. */
export type ComponentData = ComponentSchemaInfer;

export type ComponentId = ComponentData['id'];

/** Per-store record view handed to handlers via `ctx.stores.component`. */
export type ComponentsState = Record<string, ComponentData>;

export class ComponentStore extends Store<ComponentData> {
  constructor() {
    // ⚠ `'component'`, SINGULAR — the `super('<key>')` argument IS the key
    // `PluginRegistry` binds, the key `affectedStores` names, the key
    // `snapshotFamilyCoverage.ts` rows against and the key
    // `runtime.stores.<key>` exposes. One character of drift here made a live
    // channel read `0 subscribers` once already ([[grep-silence-has-three-causes]])
    // and `plugins/dimensions` binding `dimension` is the standing example.
    super('component');
  }

  ids(): readonly string[] {
    return [...this.state.keys()];
  }

  get(id: string): Readonly<ComponentData> | undefined {
    return this.state.get(id);
  }

  /** Every placed occurrence on a given level. O(N). */
  byLevel(levelId: string): readonly ComponentData[] {
    const out: ComponentData[] = [];
    for (const c of this.state.values()) if (c.levelId === levelId) out.push(c);
    return out;
  }

  /**
   * ⭐ EVERY OCCURRENCE OF ONE DEFINITION — the query spec §66's twenty-instance
   * falsifier is written against, and the one `graph.query(typeId,'instantiates')`
   * will resolve through in Phase 4G.
   *
   * ⚠ It is O(N) in placed components and that is the right cost today: an index
   * would be a second answer to the same question, and C84 EI-9 is the reason not
   * to mint one before a measurement demands it.
   */
  byDefinition(definitionId: string): readonly ComponentData[] {
    const out: ComponentData[] = [];
    for (const c of this.state.values()) if (c.definitionId === definitionId) out.push(c);
    return out;
  }

  /**
   * Every occurrence wearing a given named type.
   *
   * ⚠ NOT a reverse index maintained on write — computed on demand, for the same
   * reason `byDefinition` is. A maintained index would have to be corrected by
   * `component.swapType`, which is one more place for the two to disagree.
   */
  byType(typeId: string): readonly ComponentData[] {
    const out: ComponentData[] = [];
    for (const c of this.state.values()) if (c.typeId === typeId) out.push(c);
    return out;
  }
}
