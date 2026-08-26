// @vitest-environment happy-dom
//
// §CURTAIN126 (L-12000) — the founder's report, verbatim: "USER SELECT CURTAIN
// WALL — SELECT THE ONE TYPE IT WANTS — CLICK APPLY — BUT IT GOES DEFAULT IN
// PLAN VIEW."
//
// `CurtainWallTypeSwapReachesGeometryStore.test.ts` (L-958) proves the geometry
// RECORD updates after a type Apply. It never constructs a `CurtainWallBuilder`,
// so it cannot see whether the actual PLAN VIEW data source — the rebuilt
// `THREE.Group` `EdgeProjectorService` projects from, cached and invalidated by
// `group.userData.version` (`EdgeProjectorService.ts` §C.2, `_cwCacheIsValid`:
// `entry.version === currentVersion`) — ever gets rebuilt at all. A command that
// mutates the store but never reaches the builder is exactly the class of bug
// `curtain-wall.setGrid` / `.setPanelType` were caught committing (dead DTO
// writes the renderer never reads) — "committed is not reachable".
//
// This file closes that gap by wiring a REAL `CurtainWallBuilder` to the SAME
// `CurtainWallStore`, byte-for-byte the subscribe pattern `initUI.ts` installs
// in production ("§3.8 / §Critical #3 FIX: Wire CurtainWallStore → CurtainWallBuilder",
// initUI.ts:2313-2331), then dispatches the type Apply through the real
// `element.changeType` bus handler (the same route the property panel's
// GenericTypeSelectorWidget "Apply" button uses) and reads the MESH back — the
// layer the plan view actually projects from, not the record.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { initBusHandlers } from '../src/engine/initBusHandlers';
import { CurtainWallStore as GeometryCurtainWallStore, CurtainWallBuilder } from '@pryzm/geometry-curtain-wall';

const CW_ID = 'cw-planview-apply-1';
const WALL_HEIGHT = 3.2;

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

function seedGeometryStore(): GeometryCurtainWallStore {
    const store = new GeometryCurtainWallStore();
    store.set(CW_ID, {
        id: CW_ID,
        type: 'curtain-wall',
        levelId: 'L0',
        baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
        height: WALL_HEIGHT,
        baseOffset: 0,
        gridXSpacing: 1.5,
        gridYSpacing: 1.5,
        mullionSize: 0.05,
        panelThickness: 0.024,
        mullionColor: '#888888',
        properties: {},
    } as never);
    return store;
}

function boot(): void {
    handlers = new Map();
    geometry = seedGeometryStore();
    builder = new CurtainWallBuilder(new THREE.Scene());

    // ── THE WIRING UNDER TEST — copied verbatim from initUI.ts's
    // "§3.8 / §Critical #3 FIX: Wire CurtainWallStore → CurtainWallBuilder" block,
    // not reinvented. If this diverges from production, the test diverges from
    // what the user experiences.
    geometry.subscribe((event, cw) => {
        if (event === 'remove') builder.remove(cw.id);
        else builder.updateCurtainWall(cw);
    });
    // seedGeometryStore()'s `store.set()` fired its 'add' BEFORE subscribe() was
    // installed above, so the initial mesh was never built. Build it explicitly —
    // exactly what updateCurtainWall()'s interactive fast path would have done
    // had the subscriber already been live (no batch, no queue, synchronous build).
    builder.build(geometry.get(CW_ID)!);

    const w = window as unknown as Record<string, unknown>;
    w.curtainWallStore = geometry;

    // `_cmExec`'s production behaviour: run the legacy command against the geometry
    // store — the SAME pattern CurtainWallTypeSwapReachesGeometryStore.test.ts uses.
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

/** Dispatches `element.changeType` exactly as GenericTypeSelectorWidget's Apply
 *  button does (PropertyPanelTypeSelector.ts's registry fall-through). */
function applyType(newTypeId: string): { valid: boolean; reason?: string } {
    const h = handlers.get('element.changeType');
    if (!h) throw new Error('element.changeType was never registered');
    const ctx = {} as unknown;
    const payload = { elementId: CW_ID, elementType: 'curtainwall', newTypeId };
    const v = h.canExecute(ctx, payload);
    if (v.valid) h.execute(ctx, payload);
    return v;
}

describe('§CURTAIN126 (L-12000) — a curtain-wall type Apply reaches the MESH the plan view projects from', () => {
    beforeEach(() => { boot(); });
    afterEach(() => {
        const w = window as unknown as Record<string, unknown>;
        delete w.commandManager;
        delete w.curtainWallStore;
        delete w.runtime;
    });

    it('sanity — the initial build stamps the seeded 1.5 m default grid (4 x 2 = 8 cells)', () => {
        const group = roots().get(CW_ID);
        expect(group).toBeDefined();
        // length 6 / 1.5 = 4 U-divisions; height 3.2 / 1.5 = floor(2.13) = 2 V-divisions.
        expect(group!.userData.gridCellCount).toBe(8);
    });

    it('⭐ Apply bumps the MESH version — the exact key EdgeProjectorService gates a plan-view reproject on', () => {
        const before = roots().get(CW_ID)!;
        const versionBefore = before.userData.version as number;

        const v = applyType('cw.glazed.pitch-500');
        expect(v.valid).toBe(true);

        // Same Group reference — CurtainWallBuilder.build() reuses `this.roots.get(id)`
        // and clears+repopulates it in place (§4.5), it does not mint a new Group. The
        // invalidation signal `EdgeProjectorService._cwCacheIsValid()` actually checks
        // (`entry.version === currentVersion`) is the VERSION on that same object, so a
        // stale cache is caught by the version bump, not by object identity changing.
        const after = roots().get(CW_ID)!;
        expect(after).toBe(before);
        expect(after.userData.version).toBeGreaterThan(versionBefore);
    });

    it('⭐ THE FOUNDER\'S CASE — the rebuilt mesh carries the NEW pitch, not the default it was created with', () => {
        // pitch-500 = 0.5 m mullion spacing. Length 6 m / 0.5 m = 12 U-divisions.
        // The type leaves transomCourse undefined (top/bottom rails only, C87 §13.6),
        // and `element.changeType`'s curtainwall branch resolves gridYSpacing from the
        // WALL's own height (independently proven by
        // CurtainWallTypeSwapReachesGeometryStore.test.ts's "resolves gridYSpacing from
        // the WALL" case), so V clamps to 1 division: 12 x 1 = 12 cells.
        const before = roots().get(CW_ID)!;
        expect(before.userData.gridCellCount).toBe(8);

        const v = applyType('cw.glazed.pitch-500');
        expect(v.valid).toBe(true);

        const after = roots().get(CW_ID)!;
        expect(after.userData.gridCellCount).toBe(12);
        // ⛔ The founder's exact shape is "goes DEFAULT" — the OLD 8-cell / 1.5 m
        // pattern must be GONE from the mesh, not merely "a" pattern present alongside it.
        expect(after.userData.gridCellCount).not.toBe(8);
    });

    it('an unknown type-id changes nothing on the mesh — no phantom rebuild, no version churn', () => {
        const before = roots().get(CW_ID)!;
        const versionBefore = before.userData.version;
        const cellsBefore = before.userData.gridCellCount;

        // Mirrors CurtainWallTypeSwapReachesGeometryStore.test.ts's "a REFUSED swap"
        // case: the bus-level validate() accepts any non-empty string id, so the
        // refusal happens INSIDE the curtainwall branch (curtainWallTypeStore.getById
        // returns undefined → warn + return) — v.valid itself is not the signal here,
        // the absence of a mesh change is.
        applyType('no-such-type');

        const after = roots().get(CW_ID)!;
        expect(after.userData.version).toBe(versionBefore);
        expect(after.userData.gridCellCount).toBe(cellsBefore);
    });
});
