// editor.bootstrap.everything — registry-driven bootstrap smoke (W-1C-1).
//
// Spec: docs/00_NEW_ARCHITECTURE/audits/PHASE-1-COMPLETION-PLAN.md §W-1C-1.
//
// Acceptance:
//   • bootstrapWithEverything() builds without throw.
//   • All 12 element-family stores land under runtime.stores.<key>.
//   • runtime.viewRegistry is a ViewRegistry (the 13th plugin).
//   • runtime.wallSystemTypes is the wall-plugin auxiliary, exposed.
//   • Every plugin contributes at least one handler type, recorded
//     under runtime.registeredHandlerTypes.
//   • The total registered handler count is the sum of contributions.
//   • tearDown() is idempotent.

import { describe, expect, it } from 'vitest';
import { WallStore } from '@pryzm/plugin-wall';
import { SlabStore } from '@pryzm/plugin-slab';
import { DoorStore } from '@pryzm/plugin-door';
import { WindowStore } from '@pryzm/plugin-window';
import { RoofStore } from '@pryzm/plugin-roof';
import { CurtainWallStore } from '@pryzm/plugin-curtain-wall';
import { GridStore } from '@pryzm/plugin-grid';
import { ColumnStore } from '@pryzm/plugin-column';
import { BeamStore } from '@pryzm/plugin-beam';
import { StairStore } from '@pryzm/plugin-stair';
import { HandrailStore } from '@pryzm/plugin-handrail';
import { CeilingStore } from '@pryzm/plugin-ceiling';
import { ViewRegistry } from '@pryzm/view-state';

import {
  bootstrapWithEverything,
  ALL_PLUGINS,
  ELEMENT_PLUGIN_IDS,
  STORE_ONLY_PLUGIN_IDS,
} from '../src/bootstrap.everything.js';

const AUDIT = { actorId: 'u', projectId: 'p', clientId: 'c', timestamp: '' } as const;

describe('editor.bootstrap.everything — bootstrapWithEverything (W-1C-1)', () => {
  it('builds without throw with the registry pre-wired', async () => {
    const rt = await bootstrapWithEverything({ audit: AUDIT });
    expect(typeof rt.tearDown).toBe('function');
    rt.tearDown();
  });

  it('lands all 12 element-family stores under their plugin storeKey', async () => {
    const rt = await bootstrapWithEverything({ audit: AUDIT });
    expect(rt.stores.wall).toBeInstanceOf(WallStore);
    expect(rt.stores.slab).toBeInstanceOf(SlabStore);
    expect(rt.stores.door).toBeInstanceOf(DoorStore);
    expect(rt.stores.window).toBeInstanceOf(WindowStore);
    expect(rt.stores.roof).toBeInstanceOf(RoofStore);
    expect(rt.stores.curtainwall).toBeInstanceOf(CurtainWallStore);
    expect(rt.stores.grid).toBeInstanceOf(GridStore);
    expect(rt.stores.column).toBeInstanceOf(ColumnStore);
    expect(rt.stores.beam).toBeInstanceOf(BeamStore);
    expect(rt.stores.stair).toBeInstanceOf(StairStore);
    expect(rt.stores.handrail).toBeInstanceOf(HandrailStore);
    expect(rt.stores.ceiling).toBeInstanceOf(CeilingStore);
    rt.tearDown();
  });

  it('exposes the UNIFIED wall system-type catalogue auxiliary (§FIX-WALL-TYPE-UNIFY-CATALOGUE, L-50)', async () => {
    const rt = await bootstrapWithEverything({ audit: AUDIT });
    // §FIX-WALL-TYPE-UNIFY-CATALOGUE (L-50, ADR-0116) — the wall handlers'
    // catalogue is now the SHARED geometry-wall singleton (the type picker's
    // store, window.wallSystemTypeStore), adapted to the handler interface —
    // NOT a fresh, divergent plugin-side WallSystemTypeStore. So it is a plain
    // catalogue object exposing has()/get(), backed by the geometry-wall built-ins.
    expect(typeof rt.wallSystemTypes.has).toBe('function');
    expect(typeof rt.wallSystemTypes.get).toBe('function');
    // Resolution against the shared singleton (requires a live window) is proven
    // end-to-end in wallTypeCatalogueUnified.test.ts. Here (node env, no window)
    // we lock the adapter SHAPE + the permissive has() contract.
    // A user/picker-only id is never rejected by the permissive has() (protects
    // the wall.batch.create apartment-generator path).
    expect(rt.wallSystemTypes.has('wt-monolithic')).toBe(true);
    expect(rt.wallSystemTypes.has('wt-picker-only-xyz')).toBe(true);
    rt.tearDown();
  });

  it('exposes viewRegistry auxiliary (13th plugin)', async () => {
    const rt = await bootstrapWithEverything({ audit: AUDIT });
    expect(rt.viewRegistry).toBeInstanceOf(ViewRegistry);
    rt.tearDown();
  });

  it('records every plugin\'s handler types under registeredHandlerTypes', async () => {
    const rt = await bootstrapWithEverything({ audit: AUDIT });
    // Every plugin contributes at least one handler — UNLESS it is a declared
    // store-only contribution.
    //
    // §FIX-POOL-UNREACHABLE (L-5201). This assertion used to be unconditional, and
    // it was TRUE of all 22 descriptors that existed when it was written. `water`
    // (added with `pool`) is the first legitimate exception: ADR-0124 §4 gives water
    // no verb of its own, so a `water.*` handler would be a sham invented to satisfy
    // a count. The invariant is REFINED rather than dropped — a zero-handler plugin
    // still fails here until it is named in `STORE_ONLY_PLUGIN_IDS` with a reason,
    // and the reason lives in the registry (the artefact) rather than in this test.
    for (const plugin of ALL_PLUGINS) {
      const types = rt.registeredHandlerTypes[plugin.id];
      expect(types, `plugin ${plugin.id} should contribute handlers`).toBeDefined();
      if (STORE_ONLY_PLUGIN_IDS[plugin.id]) {
        // Declared store-only: it must contribute EXACTLY zero handlers. If it grows
        // one, the declaration has gone stale and must be removed — an exemption
        // whose condition no longer holds is a false statement in the registry.
        expect(
          types!.length,
          `plugin ${plugin.id} is declared STORE-ONLY but now contributes handlers — remove it from STORE_ONLY_PLUGIN_IDS`,
        ).toBe(0);
        // The store key is what a store-only plugin exists to contribute, so it may
        // never be blank — that would make the descriptor contribute nothing at all.
        expect(rt.registeredStoreKeys[plugin.id]?.length, `${plugin.id} storeKey`).toBeGreaterThan(0);
        continue;
      }
      expect(types!.length, `plugin ${plugin.id} contributed zero handlers`).toBeGreaterThan(0);
    }
    // E-finish.0.E (PRYZM2-WIREUP-PLAN-S72 §16 E.0): 12 canonical
    // element families + 5 orphan registrations (furniture, plumbing,
    // rooms, structural, dimensions) + view = 18.  The handler count
    // is anchored to ALL_PLUGINS.length so the assertion grows with the
    // registry instead of having to be hand-bumped each time another
    // orphan lands.
    expect(Object.keys(rt.registeredHandlerTypes)).toHaveLength(ALL_PLUGINS.length);
    rt.tearDown();
  });

  it("records storeKeys for every plugin (view contributes 'view' — ViewRegistry IS a Store)", async () => {
    // W-1C-1 contract: the view plugin registers ViewRegistry under
    // storeKey 'view' (see PluginRegistry.ts §View entry comment block).
    // A custom storesProvider exposes the Map directly to view.* handlers;
    // that wiring is owned by W-2A.
    const rt = await bootstrapWithEverything({ audit: AUDIT });
    for (const id of ELEMENT_PLUGIN_IDS) {
      expect(rt.registeredStoreKeys[id]?.length, `${id} storeKey`).toBeGreaterThan(0);
    }
    expect(rt.registeredStoreKeys.view).toBe('view');
    rt.tearDown();
  });

  it('every contributed handler type appears on the bus registry exactly once', async () => {
    const rt = await bootstrapWithEverything({ audit: AUDIT });
    const seen = new Set<string>();
    for (const types of Object.values(rt.registeredHandlerTypes)) {
      for (const t of types) {
        expect(seen.has(t), `duplicate handler type: ${t}`).toBe(false);
        seen.add(t);
      }
    }
    expect(seen.size).toBeGreaterThanOrEqual(50);
    rt.tearDown();
  });

  it('tearDown is idempotent', async () => {
    const rt = await bootstrapWithEverything({ audit: AUDIT });
    rt.tearDown();
    expect(() => rt.tearDown()).not.toThrow();
  });
});
