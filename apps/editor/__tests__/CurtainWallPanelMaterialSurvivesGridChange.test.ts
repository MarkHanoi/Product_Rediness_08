// @vitest-environment happy-dom
//
// §FEAT-CURTAIN-WALL-PANEL-MATERIAL (L-958 Slice B, authoring half).
//
// THE SEQUENCE THIS EXISTS FOR: a user applies a stone/metal facade type, then nudges the
// grid spacing, and every panel must KEEP its finish. That is the failure this half of the
// slice was written to prevent, and it is not hypothetical — `CurtainPanelSyncHandler`
// runs on every store 'update', not only on 'add', and a spacing change generates cells
// that did not exist before. Those cells are minted inside the handler, which hard-coded
// bare `SystemPanel_Glass`. A marble facade plus a 50 mm spacing nudge equalled a glass
// facade, with the wall still claiming its type.
//
// So the assertions are ordered as the user would hit them: apply, verify, EDIT, verify
// again. A test that only checked the apply would have passed against the broken code.
//
// NO FAKE STORES. Real `CurtainWallStore`, real `CurtainPanelStore`, the real
// `CurtainPanelSyncHandler` wired between them, and the real `initBusHandlers`
// registration. Slice A's silent no-op survived review because a fake store exposed both
// `get` and `getById` while the real one has only `get`; the cheapest defence against that
// class of miss is to not write fakes.
//
// The final assertion goes all the way to the RENDERED MATERIAL through the real
// `CurtainWallInstanceManager` and the real `STANDARD_MATERIAL_LIBRARY`, because a stored
// `materialId` that no renderer consults is the exact "authored capacity, no surface"
// shape this feature exists to close.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { STANDARD_MATERIAL_LIBRARY } from '@pryzm/core-app-model/material-library';
import { initBusHandlers } from '../src/engine/initBusHandlers';
import {
    CurtainWallStore,
    CurtainPanelStore,
    CurtainPanelSyncHandler,
    CurtainWallInstanceManager,
    computeCurtainCells,
    migrateToGridSystem,
} from '@pryzm/geometry-curtain-wall';

const CW_ID = 'cw-mat-1';
const WALL_LENGTH = 6;
const WALL_HEIGHT = 3;

/** The founder's type 5: metal panels in a copper frame. */
const TYPE_ID = 'cw.metal.copper-frame';
const PANEL_MAT = 'aluminium-brushed-dark';
const PANEL_MAT_HEX = '#474d52';

interface RegisteredHandler {
    type: string;
    canExecute(ctx: unknown, cmd: unknown): { valid: boolean; reason?: string };
    execute(ctx: unknown, cmd: unknown): unknown;
}

let handlers: Map<string, RegisteredHandler>;
let ringPushes: Array<{ inverse: { ops: Array<{ value: unknown }> }; affectedStores: string[] }>;
let walls: CurtainWallStore;
let panels: CurtainPanelStore;
let sync: CurtainPanelSyncHandler;

function boot(): void {
    handlers = new Map();
    ringPushes = [];

    walls = new CurtainWallStore();
    panels = new CurtainPanelStore();
    sync = new CurtainPanelSyncHandler(walls, panels);
    sync.activate();

    const w = window as unknown as Record<string, unknown>;
    w.curtainWallStore = walls;
    w.curtainPanelStore = panels;

    w.commandManager = {
        execute: (cmd: unknown) => {
            const c = cmd as {
                canExecute(ctx: unknown): { ok: boolean; reason?: string };
                execute(ctx: unknown): unknown;
            };
            const ctx = {
                stores: { curtainWallStore: walls, curtainPanelStore: panels },
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
            ringBuffer: { push: (p: never) => { ringPushes.push(p); } },
        },
    };

    initBusHandlers(w.runtime as never);

    // The wall itself. `add` synchronously drives the sync handler, which mints one panel
    // per cell — so the store is populated exactly as it is in production.
    walls.set(CW_ID, {
        id: CW_ID,
        type: 'curtain-wall',
        levelId: 'L0',
        baseLine: [{ x: 0, y: 0, z: 0 }, { x: WALL_LENGTH, y: 0, z: 0 }],
        height: WALL_HEIGHT,
        baseOffset: 0,
        gridXSpacing: 1.5,
        gridYSpacing: WALL_HEIGHT,
        mullionSize: 0.05,
        panelThickness: 0.024,
        properties: {},
    } as never);
}

function dispatch(type: string, payload: Record<string, unknown>): void {
    const h = handlers.get(type);
    if (!h) throw new Error(`${type} was never registered`);
    const v = h.canExecute({}, payload);
    if (!v.valid) throw new Error(`${type} refused: ${v.reason}`);
    h.execute({}, payload);
}

function panelMaterialIds(): Array<string | undefined> {
    return panels.getByCurtainWallId(CW_ID).map(p => p.materialId);
}

describe('§FEAT-CURTAIN-WALL-PANEL-MATERIAL — a facade must survive the next edit', () => {
    beforeEach(() => { boot(); });
    afterEach(() => {
        sync.deactivate();
        const w = window as unknown as Record<string, unknown>;
        delete w.commandManager; delete w.curtainWallStore;
        delete w.curtainPanelStore; delete w.runtime;
    });

    it('the wall starts with panels and NO material — the honest baseline', () => {
        const ids = panelMaterialIds();
        expect(ids.length).toBeGreaterThan(0);
        expect(ids.every(m => m === undefined)).toBe(true);
    });

    it('applying a type writes the material onto EVERY existing panel', () => {
        dispatch('element.changeType', {
            elementId: CW_ID, elementType: 'curtainwall', newTypeId: TYPE_ID,
        });

        const ids = panelMaterialIds();
        expect(ids.length).toBeGreaterThan(0);
        expect(ids.every(m => m === PANEL_MAT)).toBe(true);
        // And the wall carries the DEFAULT, which is what new cells will inherit.
        expect(walls.get(CW_ID)?.glazingMaterialId).toBe(PANEL_MAT);
    });

    it('⭐ THE SEQUENCE: apply a type, then CHANGE THE GRID — the material SURVIVES', () => {
        dispatch('element.changeType', {
            elementId: CW_ID, elementType: 'curtainwall', newTypeId: TYPE_ID,
        });
        const before = panelMaterialIds();
        expect(before.every(m => m === PANEL_MAT)).toBe(true);

        // The user nudges the spacing. 1.0 m → 0.6 m over a 6 m wall takes the wall from
        // 6 cells to 10, so FOUR panels are generated that did not exist when the type was
        // applied. Those are the ones that used to come back as bare glass.
        dispatch('wall.updateCurtainWall', {
            id: CW_ID,
            updates: { gridXSpacing: 0.6, gridSystem: undefined },
        });

        const after = panelMaterialIds();
        expect(after.length).toBeGreaterThan(before.length);
        expect(
            after.every(m => m === PANEL_MAT),
            `after a grid change ${after.filter(m => m !== PANEL_MAT).length} of ${after.length} ` +
            'panels lost their material — the facade reset to glass on the next edit',
        ).toBe(true);
    });

    it('a hand-authored per-panel material is NOT clobbered by a grid change', () => {
        // The other half of the same rule: inheritance applies to NEW cells only. A user
        // who set one panel to marble by hand must not lose it because they moved a
        // mullion somewhere else on the wall.
        dispatch('element.changeType', {
            elementId: CW_ID, elementType: 'curtainwall', newTypeId: TYPE_ID,
        });
        const target = panels.getByCurtainWallId(CW_ID)[0]!;
        panels.update(target.id, { materialId: 'stone-marble-carrara' });

        dispatch('wall.updateCurtainWall', {
            id: CW_ID, updates: { gridXSpacing: 1.2, gridSystem: undefined },
        });

        expect(panels.get(target.id)?.materialId).toBe('stone-marble-carrara');
    });

    it('the surviving material reaches the RENDERED mesh, not just the store', () => {
        dispatch('element.changeType', {
            elementId: CW_ID, elementType: 'curtainwall', newTypeId: TYPE_ID,
        });
        dispatch('wall.updateCurtainWall', {
            id: CW_ID, updates: { gridXSpacing: 0.6, gridSystem: undefined },
        });

        // Project exactly as CurtainWallBuilder does, with the production library map.
        const cw = walls.get(CW_ID)!;
        const grid = cw.gridSystem
            ?? migrateToGridSystem(WALL_LENGTH, cw.height, cw.gridXSpacing, cw.gridYSpacing);
        const cells = computeCurtainCells(grid, WALL_LENGTH, cw.height);
        const mgr = new CurtainWallInstanceManager(
            new Map(STANDARD_MATERIAL_LIBRARY.map(m => [m.id, m] as const)),
        );
        const { instancedMeshes } = mgr.buildInstancedMeshes(
            cells, panels.getByCurtainWallId(CW_ID), cw.mullionSize, cw.panelThickness,
        );

        // ONE mesh: every panel shares the type's material, so batching is intact.
        expect(instancedMeshes).toHaveLength(1);
        const mat = instancedMeshes[0].material as THREE.MeshStandardMaterial;
        expect(`#${mat.color.getHexString()}`).toBe(PANEL_MAT_HEX);
        // Not the glass default — the assertion that would fail if the material were lost.
        expect(`#${mat.color.getHexString()}`).not.toBe('#88ccff');
        expect(mat.transparent).toBeFalsy();
    });

    // ── C84 EI-7b — undo re-enters the panel-array path ─────────────────────
    it('undo after a type swap restores the wall, and `panels` never becomes a number', () => {
        dispatch('element.changeType', {
            elementId: CW_ID, elementType: 'curtainwall', newTypeId: TYPE_ID,
        });

        const entry = ringPushes.find(p => p.affectedStores.includes('curtainwall'));
        expect(entry).toBeTruthy();

        walls.update(CW_ID, entry!.inverse.ops[0].value as never);

        const rec = walls.get(CW_ID)!;
        expect(rec.systemTypeId).toBeUndefined();
        expect(rec.glazingMaterialId).toBeUndefined();
        expect(rec.gridXSpacing).toBe(1.5);

        const p = (rec as unknown as { panels?: unknown }).panels;
        expect(typeof p).not.toBe('number');
        if (p !== undefined) expect(Array.isArray(p)).toBe(true);
    });
});
