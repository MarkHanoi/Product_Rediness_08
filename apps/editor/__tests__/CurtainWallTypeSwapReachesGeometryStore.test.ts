// @vitest-environment happy-dom
//
// §FEAT-CURTAIN-WALL-TYPE-CATALOGUE (L-958) — Slice A, proven at the OUTCOME.
//
// The sibling of `CurtainWallUpdateReachesGeometryStore.test.ts`, and it exists for the
// reason that file exists: "committed is not reachable". A curtain-wall type picker that
// dispatches a command, gets `valid: true`, and leaves the record the builders read
// untouched is the exact defect `curtain-wall.setMaterial` was caught committing — it
// wrote the plugin DTO store, which no renderer, no 2-D projector, no IFC exporter and
// no persistence path reads (§FIX-DEAD-VERB-REFUSE W3-3).
//
// So every assertion below reads the GEOMETRY `CurtainWallStore` back. `valid === true`
// is never asserted on its own, and nothing is asserted against a function's return value.
//
// It drives the REAL `initBusHandlers` registration against a REAL geometry store, so it
// fails if the curtain-wall branch is deleted, misrouted, or stops clearing `gridSystem`.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initBusHandlers } from '../src/engine/initBusHandlers';
import { CurtainWallStore as GeometryCurtainWallStore } from '@pryzm/geometry-curtain-wall';
import { curtainWallTypeStore } from '@pryzm/core-app-model';

const CW_ID = 'cw-typeswap-1';
const WALL_HEIGHT = 3.2;

interface RegisteredHandler {
    type: string;
    canExecute(ctx: unknown, cmd: unknown): { valid: boolean; reason?: string };
    execute(ctx: unknown, cmd: unknown): unknown;
}
interface RingEntry {
    forward: { ops: Array<{ op: string; path: string; value: unknown }> };
    inverse: { ops: Array<{ op: string; path: string; value: unknown }> };
    affectedStores: string[];
}

let handlers: Map<string, RegisteredHandler>;
let ringPushes: RingEntry[];
let geometry: GeometryCurtainWallStore;

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
        // A grid the architect had already edited. `CurtainWallBuilder` reads
        // `cw.gridSystem ?? migrateToGridSystem(...)` (:1121-1122), so this WINS over any
        // new spacing unless the swap clears it — seeded so the clearing is exercised
        // rather than assumed.
        gridSystem: {
            uLines: [{ id: 'u0', t: 0 }, { id: 'u-custom', t: 0.37 }, { id: 'u1', t: 1 }],
            vLines: [{ id: 'v0', t: 0 }, { id: 'v1', t: 1 }],
        },
        properties: {},
    } as never);
    return store;
}

function boot(): void {
    handlers = new Map();
    ringPushes = [];
    geometry = seedGeometryStore();

    const w = window as unknown as Record<string, unknown>;
    w.curtainWallStore = geometry;

    // `_cmExec`'s production behaviour: run the legacy command against the geometry store.
    // `bimManager` is supplied for real because `UpdateCurtainWallCommand` touches it on a
    // levelId change (§DW-03) inside a try/catch — a swallowed throw must not read as a pass.
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
            ringBuffer: { push: (p: RingEntry) => { ringPushes.push(p); } },
        },
    };

    initBusHandlers(w.runtime as never);
}

function changeType(payload: Record<string, unknown>): { valid: boolean; reason?: string } {
    const h = handlers.get('element.changeType');
    if (!h) throw new Error('element.changeType was never registered');
    const ctx = {} as unknown;
    const v = h.canExecute(ctx, payload);
    if (v.valid) h.execute(ctx, payload);
    return v;
}

describe('§FEAT-CURTAIN-WALL-TYPE-CATALOGUE — a published type must reach the geometry record', () => {
    beforeEach(() => { boot(); });
    afterEach(() => {
        const w = window as unknown as Record<string, unknown>;
        delete w.commandManager;
        delete w.curtainWallStore;
        delete w.runtime;
    });

    it('the catalogue actually publishes the founder pitch types 1-4', () => {
        // Guards the trivial regression where the store exists but is empty — which the
        // registry's own "(2) every published catalogue is non-empty" check would catch
        // only while the store is still wired to it.
        const ids = curtainWallTypeStore.getAll().map(t => t.id);
        expect(ids).toContain('cw.glazed.pitch-1000');
        expect(ids).toContain('cw.glazed.pitch-500');
        expect(ids).toContain('cw.glazed.pitch-750');
        expect(ids).toContain('cw.glazed.pitch-2000');
    });

    it('a type swap MUTATES the geometry record the builders read — not a DTO', () => {
        expect(geometry.get(CW_ID)?.gridXSpacing).toBe(1.5);

        changeType({ elementId: CW_ID, elementType: 'curtainwall', newTypeId: 'cw.glazed.pitch-750' });

        const rec = geometry.get(CW_ID)!;
        expect(rec.gridXSpacing).toBe(0.75);
        expect(rec.systemTypeId).toBe('cw.glazed.pitch-750');
        // The wall is unmoved and un-resized: a TYPE swap is not a geometry edit.
        expect(rec.height).toBe(WALL_HEIGHT);
        expect(rec.baseLine[0]).toEqual({ x: 0, y: 0, z: 0 });
    });

    it('resolves gridYSpacing from the WALL so no horizontal intermediate mullion appears', () => {
        changeType({ elementId: CW_ID, elementType: 'curtainwall', newTypeId: 'cw.glazed.pitch-1000' });

        const rec = geometry.get(CW_ID)!;
        // The founder's twelve all specify "top and bottom rails only". That holds iff
        // migrateToGridSystem's numV === 1, i.e. gridYSpacing >= the wall's own height.
        expect(rec.gridYSpacing).toBe(WALL_HEIGHT);
        expect(Math.max(1, Math.floor(rec.height / rec.gridYSpacing))).toBe(1);
    });

    it('CLEARS a pre-existing gridSystem, or the swap is a dead control reporting success', () => {
        expect(geometry.get(CW_ID)?.gridSystem?.uLines).toHaveLength(3);

        changeType({ elementId: CW_ID, elementType: 'curtainwall', newTypeId: 'cw.glazed.pitch-500' });

        // Without this the builder keeps honouring the OLD three-line grid, and the user
        // sees nothing change while the panel reports the type was applied.
        expect(geometry.get(CW_ID)?.gridSystem).toBeUndefined();
    });

    // ── C84 EI-7b — undo after a type swap ──────────────────────────────────────
    //
    // Curtain-wall undo used to write a NUMBER into the `panels` array: a depth-3 Immer
    // patch flattened to a top-level write. That is fixed on main, and a type swap is
    // precisely the kind of edit that re-enters the path, so it is re-proven here rather
    // than assumed. The ring entry is applied the way `elementUndoStoreAdapter` applies
    // it — `store.update(id, value)` — not through a bespoke shortcut.
    describe('undo after a type swap', () => {
        it('restores the record, and `panels` survives as an ARRAY (never a number)', () => {
            const before = structuredClone(geometry.get(CW_ID));

            changeType({ elementId: CW_ID, elementType: 'curtainwall', newTypeId: 'cw.glazed.pitch-2000' });
            expect(geometry.get(CW_ID)?.gridXSpacing).toBe(2.0);

            expect(ringPushes).toHaveLength(1);
            const entry = ringPushes[0];
            expect(entry.affectedStores).toEqual(['curtainwall']);

            // The undo, exactly as the adapter performs it.
            geometry.update(CW_ID, entry.inverse.ops[0].value as never);

            const after = geometry.get(CW_ID)!;
            expect(after.gridXSpacing).toBe(before!.gridXSpacing);
            expect(after.gridYSpacing).toBe(before!.gridYSpacing);
            expect(after.systemTypeId).toBeUndefined();
            // The edited grid comes BACK — undo of a swap that cleared it must restore it.
            expect(after.gridSystem?.uLines).toHaveLength(3);

            // C84 EI-7b. Whatever `panels` is on this record, undo must never turn it into
            // a scalar. `typeof panels === 'number'` was the observed corruption.
            const panels = (after as unknown as { panels?: unknown }).panels;
            expect(typeof panels).not.toBe('number');
            if (panels !== undefined) expect(Array.isArray(panels)).toBe(true);
        });

        it('a REFUSED swap pushes no ring entry, so Ctrl+Z cannot become a phantom', () => {
            changeType({ elementId: CW_ID, elementType: 'curtainwall', newTypeId: 'no-such-type' });
            expect(ringPushes).toHaveLength(0);
            expect(geometry.get(CW_ID)?.gridXSpacing).toBe(1.5);
        });
    });
});
