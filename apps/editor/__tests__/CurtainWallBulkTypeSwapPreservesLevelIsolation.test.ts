// @vitest-environment happy-dom
//
// §CWLEVEL149 (L-12460 range) — THE FOUNDER, verbatim, on his 462-element / 7-level
// demo project: "before i was isolating a level - and honestly mostly was really
// good - now i have updated all curtain walls via RAC to another type - (maybe is
// because of this) - and i have isolated a level but all curtain walls from other
// levels poped up - why? I have selected a CW from level 3 and the data is correct
// - level 3 - so the levels seems correct - not sure where the corruption might be?"
//
// This is the "committed is not reachable" family of investigation, run in reverse:
// before proposing a fix, PROVE the reported divergence actually reproduces through
// REAL production code — the bulk RAC curtain-wall type swap (the fan-out
// `element.changeType` dispatch `CatalogueFamilies.ts`'s `set-curtain-wall-type`
// row performs, `fanOutPerId: true`, one command per resolved id — see
// packages/ai-host/src/intents/CatalogueFamilies.ts:632-662), the REAL geometry
// `CurtainWallStore`, a REAL `CurtainWallBuilder` (so the rebuilt MESH is inspected,
// not merely the record — `CurtainWallTypeApplyReachesPlanView.test.ts`'s own
// rationale), and the REAL `elementRegistry` + `LevelIsolationResolver` — the
// single-source-of-truth pass `BottomActionMenu._applyRegistryLevelIsolation` uses
// to decide which roots survive a level isolation
// (apps/editor/src/engine/inspect/LevelIsolationResolver.ts).
//
// Three readers are exercised side by side so a divergence between them is not
// asserted from a guess:
//   1. the GEOMETRY RECORD's own `levelId` (what the Properties panel reads —
//      PropertyPanelStoreEnricher.ts:47 `window.curtainWallStore.get(id)`).
//   2. the REBUILT MESH's `userData.levelId` (CurtainWallBuilder.ts:1339/1866,
//      stamped fresh on every build from `cw.levelId`).
//   3. `resolveLevelIsolation()` / `decideLevelIsolation()`'s verdict for a level
//      isolation gesture — the exact mechanism "curtain walls from other levels
//      popped up" would come from if it disagreed with (1)/(2).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { initBusHandlers } from '../src/engine/initBusHandlers';
import { CurtainWallStore as GeometryCurtainWallStore, CurtainWallBuilder } from '@pryzm/geometry-curtain-wall';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { resolveLevelIsolation } from '../src/engine/inspect/LevelIsolationResolver';

const WALL_HEIGHT = 3.2;

// Three walls, three different storeys — mirrors the founder's 7-level project
// where curtain walls are spread L3/L4/L5/L6/Ground, not all on one floor.
const CW_GROUND = 'cw-bulk-ground-1';
const CW_L2     = 'cw-bulk-l2-1';
const CW_L3     = 'cw-bulk-l3-1';

interface RegisteredHandler {
    type: string;
    canExecute(ctx: unknown, cmd: unknown): { valid: boolean; reason?: string };
    execute(ctx: unknown, cmd: unknown): unknown;
}

let handlers: Map<string, RegisteredHandler>;
let geometry: GeometryCurtainWallStore;
let builder: CurtainWallBuilder;

function roots(): Map<string, THREE.Group> {
    return (builder as unknown as { roots: Map<string, THREE.Group> }).roots;
}

function seedWall(id: string, levelId: string, x0: number): void {
    geometry.set(id, {
        id,
        type: 'curtain-wall',
        levelId,
        baseLine: [{ x: x0, y: 0, z: 0 }, { x: x0 + 6, y: 0, z: 0 }],
        height: WALL_HEIGHT,
        baseOffset: 0,
        gridXSpacing: 1.5,
        gridYSpacing: 1.5,
        mullionSize: 0.05,
        panelThickness: 0.024,
        mullionColor: '#888888',
        properties: {},
    } as never);
}

function boot(): void {
    handlers = new Map();
    elementRegistry.clear();
    geometry = new GeometryCurtainWallStore();
    builder = new CurtainWallBuilder(new THREE.Scene());

    seedWall(CW_GROUND, 'L0', 0);
    seedWall(CW_L2, 'L2', 10);
    seedWall(CW_L3, 'L3', 20);

    // The production wiring (initUI.ts "§3.8 / §Critical #3 FIX"), copied
    // verbatim the way CurtainWallTypeApplyReachesPlanView.test.ts does — the
    // walls above were seeded before subscribe(), so build each explicitly,
    // exactly what the interactive fast path would already have done.
    geometry.subscribe((event, cw) => {
        if (event === 'remove') builder.remove(cw.id);
        else builder.updateCurtainWall(cw);
    });
    for (const id of [CW_GROUND, CW_L2, CW_L3]) {
        builder.build(geometry.get(id)!);
        // `CurtainWallBuilder.build()` also needs `bimManager.getLevelById` to
        // resolve worldY; a missing one only degrades Y placement (logged), it
        // does not affect `userData.levelId`, which is stamped from `cw.levelId`
        // unconditionally. No bimManager is stubbed here for the same reason
        // the sibling test omits one.
    }

    const w = window as unknown as Record<string, unknown>;
    w.curtainWallStore = geometry;

    // `_cmExec`'s production behaviour: run the legacy command against the
    // geometry store — identical to CurtainWallTypeSwapReachesGeometryStore.test.ts.
    w.commandManager = {
        execute: (cmd: unknown) => {
            const c = cmd as {
                canExecute(ctx: unknown): { ok: boolean; reason?: string };
                execute(ctx: unknown): unknown;
            };
            const ctx = {
                stores: { curtainWallStore: geometry },
                bimManager: { unregisterElement: () => {}, registerElement: () => {} },
            };
            const v = c.canExecute(ctx);
            if (!v.ok) throw new Error(`legacy command refused: ${v.reason ?? ''}`);
            c.execute(ctx);
        },
    };

    w.runtime = {
        bus: {
            registry: { has: () => false },
            register: (h: RegisteredHandler) => { handlers.set(h.type, h); },
            ringBuffer: { push: () => {} },
        },
    };

    initBusHandlers(w.runtime as never);
}

/** One `element.changeType` dispatch, exactly the payload shape
 *  `CatalogueFamilies.ts`'s `set-curtain-wall-type` row's `typePayload` builds
 *  (`{ elementType: 'curtain-wall', newTypeId: id }`) plus the fan-out's own
 *  `elementId` (CapabilityExecutionSpec.ts:1112, `idsField: 'elementId'`). */
function changeType(elementId: string, newTypeId: string): { valid: boolean; reason?: string } {
    const h = handlers.get('element.changeType');
    if (!h) throw new Error('element.changeType was never registered');
    const ctx = {} as unknown;
    const payload = { elementId, elementType: 'curtain-wall', newTypeId };
    const v = h.canExecute(ctx, payload);
    if (v.valid) h.execute(ctx, payload);
    return v;
}

/** The bulk RAC gesture itself: "change all curtain walls to <type>" fans out to
 *  one `element.changeType` command PER resolved id (CatalogueFamilies.ts
 *  `fanOutPerId: true`), in whatever order `resolveScope({kind:'all', elementKind:
 *  'curtain-wall'})` returns them. */
function bulkChangeAllCurtainWallsTo(newTypeId: string): void {
    for (const id of [CW_GROUND, CW_L2, CW_L3]) {
        const v = changeType(id, newTypeId);
        expect(v.valid).toBe(true);
    }
}

describe('§CWLEVEL149 — a bulk RAC curtain-wall type swap must not corrupt level isolation', () => {
    beforeEach(() => { boot(); });
    afterEach(() => {
        const w = window as unknown as Record<string, unknown>;
        delete w.commandManager;
        delete w.curtainWallStore;
        delete w.runtime;
        elementRegistry.clear();
    });

    it('sanity — three walls seeded on three different levels, all present in elementRegistry', () => {
        const ids = elementRegistry.getAllRoots().map(r => r.id).sort();
        expect(ids).toEqual([CW_GROUND, CW_L2, CW_L3].sort());
    });

    it('the GEOMETRY RECORD keeps its own levelId through a bulk type swap', () => {
        bulkChangeAllCurtainWallsTo('cw.glazed.pitch-750');

        expect(geometry.get(CW_GROUND)?.levelId).toBe('L0');
        expect(geometry.get(CW_L2)?.levelId).toBe('L2');
        expect(geometry.get(CW_L3)?.levelId).toBe('L3');
    });

    it('the REBUILT MESH keeps its own userData.levelId through a bulk type swap', () => {
        bulkChangeAllCurtainWallsTo('cw.glazed.pitch-750');

        expect(roots().get(CW_GROUND)!.userData.levelId).toBe('L0');
        expect(roots().get(CW_L2)!.userData.levelId).toBe('L2');
        expect(roots().get(CW_L3)!.userData.levelId).toBe('L3');
    });

    // ⭐ THE FOUNDER'S EXACT SYMPTOM: isolate one level, and every curtain wall on
    // every OTHER level must be the one thing that does NOT "pop up".
    it('⭐ isolating Level 2 after a bulk type swap keeps Ground/L3 curtain walls OUT', () => {
        bulkChangeAllCurtainWallsTo('cw.glazed.pitch-750');

        const decisions = resolveLevelIsolation('L2');
        const byId = new Map(decisions.map(d => [d.id, d]));

        expect(byId.get(CW_GROUND)?.visibleInIsolation).toBe(false);
        expect(byId.get(CW_L2)?.visibleInIsolation).toBe(true);
        expect(byId.get(CW_L3)?.visibleInIsolation).toBe(false);
    });

    it('an unresolved catalogue id anywhere in the fan-out leaves every wall exactly where it was', () => {
        // A partially-bad bulk swap (one id in the fan-out fails to resolve) must
        // not leave the OTHER walls' level assignment in a worse state than before —
        // C84 EI-6: a partial failure must be reported, never silently escalated.
        changeType(CW_GROUND, 'cw.glazed.pitch-750');
        changeType(CW_L2, 'no-such-type');
        changeType(CW_L3, 'cw.glazed.pitch-750');

        expect(geometry.get(CW_GROUND)?.levelId).toBe('L0');
        expect(geometry.get(CW_L2)?.levelId).toBe('L2');
        expect(geometry.get(CW_L3)?.levelId).toBe('L3');

        const decisions = resolveLevelIsolation('L2');
        const byId = new Map(decisions.map(d => [d.id, d]));
        expect(byId.get(CW_GROUND)?.visibleInIsolation).toBe(false);
        expect(byId.get(CW_L2)?.visibleInIsolation).toBe(true);
        expect(byId.get(CW_L3)?.visibleInIsolation).toBe(false);
    });

    // ── §CWLEVEL149 — the REACHABILITY gap this lane actually found ─────────
    //
    // Every test above proves the record, the mesh's `userData.levelId` and the
    // level-isolation DECISION all agree, before and after a bulk swap. So the
    // founder's "the tree says Ground but the Properties panel says Level 3" is
    // not a corrupted `levelId` — it is that `UpdateCurtainWallCommand` (the
    // ONLY writer of a curtain wall's geometry record on an update) never
    // ANNOUNCED any write it made. `CreateCurtainWallCommand` (same directory)
    // has always paired `bim-curtainwall-added`/`-removed` with a window event;
    // the sibling `bim-curtainwall-updated` was not even DECLARED in
    // `packages/event-bus/src/catalog.ts`, so no command could type-check
    // emitting it, and `UnifiedBrowserPanel.ts:154` (the Project Browser
    // "Curtain Walls" category list — the exact "ELEMENTS > Curtain Walls 90"
    // list the founder screenshotted) has been listening for an event that
    // could never fire. The record was never wrong; the panel was never told
    // to re-read it — §committed-is-not-reachable, not a second data authority.
    it('⭐ a single type swap now dispatches bim-curtainwall-updated — before the fix this NEVER fired', () => {
        const seen: string[] = [];
        const onUpdated = (e: Event): void => { seen.push(String((e as CustomEvent).detail?.id)); };
        window.addEventListener('bim-curtainwall-updated', onUpdated);
        try {
            changeType(CW_L3, 'cw.glazed.pitch-750');
            expect(seen).toEqual([CW_L3]);
        } finally {
            window.removeEventListener('bim-curtainwall-updated', onUpdated);
        }
    });

    it('a REFUSED swap (unknown type id) announces nothing — a no-op must not fake a refresh', () => {
        const seen: string[] = [];
        const onUpdated = (e: Event): void => { seen.push(String((e as CustomEvent).detail?.id)); };
        window.addEventListener('bim-curtainwall-updated', onUpdated);
        try {
            changeType(CW_L3, 'no-such-type');
            expect(seen).toHaveLength(0);
        } finally {
            window.removeEventListener('bim-curtainwall-updated', onUpdated);
        }
    });
});
