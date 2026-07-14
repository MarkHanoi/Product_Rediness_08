// @vitest-environment happy-dom
//
// §FIX-MATERIAL-DEAD-DISPATCH (Gate G7, supersedes the L-08 / L-57 assertions)
//
// The old version of this suite asserted that `dispatchSetMaterial` dispatched
// `<family>.setMaterial` with the right id field — and it passed, every time, against a
// mock bus. It was green while material was a NO-OP for every element family in the app.
//
// That is the lesson: VERIFY AT THE OUTCOME, NOT AT THE SEAM. A handler that DISPATCHES
// proves nothing; what matters is whether THE RECORD MUTATES. The `<family>.setMaterial`
// plugin handlers `produceCommand` against the plugin DTO store (`ctx.stores.slab`, …),
// which in production is a FRESH `new SlabStore()` built by PluginRegistry — not the
// geometry `window.slabStore` the fragment builders, the plan projector, the IFC exporter
// and persistence read. Nothing bridges plugin-store updates back (initTools mirrors
// `<family>.created` only; composeRuntime registers no committers). So the command landed
// in a store nobody reads, while `PropertyInspector.onMaterialChange` repainted the THREE
// mesh live — the change LOOKED applied and evaporated on the next rebuild.
//
// These assertions now pin the thing that actually matters:
//
//   1. Every route names a command that reaches the GEOMETRY store (a `<family>.update`
//      legacy bridge, or one of the two dedicated handlers that bridge to commandManager).
//   2. NO route may name a `*.setMaterial` plugin command except `room.setMaterial` —
//      the one that bridges to commandManager. If someone re-points a family back at a
//      detached plugin handler, this suite goes red.
//   3. Families with no live path are DECLARED (with a reason) rather than dispatched
//      into the void.

import { describe, it, expect } from 'vitest';
import {
    dispatchSetMaterial,
    dispatchSetMaterialMany,
    routeFor,
    hasMaterialCommand,
    materialUnsupportedReason,
    MATERIAL_UNSUPPORTED_REASON,
} from '../src/ui/property-inspector/MaterialDispatch';

interface Call { type: string; payload: any }

function makeRuntime() {
    const calls: Call[] = [];
    const runtime = {
        bus: {
            executeCommand(type: string, payload: unknown) {
                calls.push({ type, payload });
                return Promise.resolve();
            },
        },
    };
    return { runtime, calls };
}

/**
 * The commands that are KNOWN to reach the geometry store (verified by reading the
 * handler at each end):
 *   • `<family>.update` → initBusHandlers bridge / plugin bridge → legacy UpdateXCommand
 *     → `store.update(id, updates)` → `bim-<family>-updated` → mesh rebuild + plan
 *     re-projection + persistence.
 *   • `room.setMaterial` → SetRoomMaterialHandler → commandManager → geometry roomStore.
 *   • `furniture.updateParameters` → UpdateFurnitureParametersHandler → commandManager
 *     → geometry furnitureStore.
 */
const LIVE_COMMANDS = new Set([
    'column.update',
    'ceiling.update',
    'floor.update',
    'roof.update',
    'wall.updateCurtainWall',
    'room.setMaterial',
    'furniture.updateParameters',
]);

describe('MaterialDispatch — every route must reach the geometry record (G7)', () => {
    it('routes ONLY to commands that mutate the geometry store', () => {
        const families = ['slab', 'ceiling', 'roof', 'floor', 'room', 'column', 'beam', 'stair',
                          'handrail', 'furniture', 'plumbing', 'lighting', 'curtainwall',
                          'structural', 'wall', 'door', 'window'];
        for (const f of families) {
            const route = routeFor(f);
            if (!route) continue;
            expect(
                LIVE_COMMANDS.has(route.command),
                `"${f}" routes material to "${route.command}", which is not known to reach the ` +
                `geometry store. If it is a plugin *.setMaterial handler, it writes a DETACHED ` +
                `plugin DTO store and the change is invisible + unsaved.`,
            ).toBe(true);
        }
    });

    it('never routes a family back to a detached plugin *.setMaterial handler', () => {
        const families = ['slab', 'ceiling', 'roof', 'floor', 'column', 'beam', 'stair',
                          'handrail', 'furniture', 'plumbing', 'lighting', 'curtainwall', 'structural'];
        for (const f of families) {
            const cmd = routeFor(f)?.command;
            expect(
                cmd?.endsWith('.setMaterial') ?? false,
                `"${f}" is routed to "${cmd}" — a plugin setMaterial handler on a detached store.`,
            ).toBe(false);
        }
        // room is the ONE setMaterial handler that bridges to commandManager.
        expect(routeFor('room')?.command).toBe('room.setMaterial');
    });

    // ── Payload shapes ────────────────────────────────────────────────────────────
    it('column: material lands in the `updates` bag the legacy UpdateColumnCommand spreads', () => {
        const { runtime, calls } = makeRuntime();
        const ok = dispatchSetMaterial(runtime, 'column', 'c1', { materialId: 'steel', materialColor: '#ff0000' });
        expect(ok).toBe(true);
        expect(calls[0]!.type).toBe('column.update');
        expect(calls[0]!.payload).toEqual({ id: 'c1', updates: { materialId: 'steel', materialColor: '#ff0000' } });
    });

    it('ceiling / floor / roof / curtain-wall: correct id field + updates bag', () => {
        const { runtime, calls } = makeRuntime();
        dispatchSetMaterial(runtime, 'ceiling', 'ce1', { materialId: 'plaster' });
        dispatchSetMaterial(runtime, 'floor', 'fl1', { materialColor: '#112233' });
        dispatchSetMaterial(runtime, 'roof', 'r1', { materialId: null });
        dispatchSetMaterial(runtime, 'curtain-wall', 'cw1', { materialId: 'glass' });

        expect(calls[0]).toEqual({ type: 'ceiling.update', payload: { ceilingId: 'ce1', updates: { materialId: 'plaster' } } });
        expect(calls[1]).toEqual({ type: 'floor.update',   payload: { floorId: 'fl1',   updates: { materialColor: '#112233' } } });
        expect(calls[2]).toEqual({ type: 'roof.update',    payload: { id: 'r1',         updates: { materialId: null } } });
        expect(calls[3]).toEqual({ type: 'wall.updateCurtainWall', payload: { id: 'cw1', updates: { materialId: 'glass' } } });
    });

    it('furniture: flat payload on the bridging updateParameters command; colour field is `color`', () => {
        const { runtime, calls } = makeRuntime();
        const ok = dispatchSetMaterial(runtime, 'wardrobe', 'f1', { materialColor: '#0a0b0c' });
        expect(ok).toBe(true);
        expect(calls[0]!.type).toBe('furniture.updateParameters');
        expect(calls[0]!.payload).toEqual({ id: 'f1', color: '#0a0b0c' });
    });

    it('room: keeps its dedicated, commandManager-bridging setMaterial handler', () => {
        const { runtime, calls } = makeRuntime();
        dispatchSetMaterial(runtime, 'room', 'rm1', { materialId: 'oak', materialColor: '#123456' });
        expect(calls[0]).toEqual({
            type: 'room.setMaterial',
            payload: { roomId: 'rm1', materialId: 'oak', materialColor: '#123456' },
        });
    });

    // ── The families that CANNOT commit a material — declared, not dispatched ─────
    it('returns false for every family with no live material path, and says why', () => {
        const { runtime, calls } = makeRuntime();
        for (const f of ['slab', 'wall', 'beam', 'stair', 'handrail', 'plumbing', 'lighting', 'structural', 'door', 'window']) {
            expect(dispatchSetMaterial(runtime, f, `${f}-1`, { materialId: 'm', materialColor: '#123456' })).toBe(false);
            expect(hasMaterialCommand(f)).toBe(false);
            expect(materialUnsupportedReason(f), `${f} must declare WHY it cannot apply a material`).toBeTruthy();
        }
        expect(calls, 'nothing may be dispatched into a detached store').toHaveLength(0);
    });

    it('the unsupported list is the honest, complete G7 material gap', () => {
        expect(Object.keys(MATERIAL_UNSUPPORTED_REASON).sort()).toEqual(
            ['beam', 'door', 'handrail', 'lighting', 'plumbing', 'slab', 'stair', 'structural', 'wall', 'window'],
        );
    });

    // ── Facade behaviour (unchanged contract) ────────────────────────────────────
    it('normalises aliases (stairs → stair, furniture sub-types → furniture)', () => {
        expect(routeFor('stairs')).toBeUndefined();          // stair has no live path
        expect(materialUnsupportedReason('stairs')).toBeTruthy();
        expect(routeFor('corner_wardrobe')?.command).toBe('furniture.updateParameters');
        expect(routeFor('curtain-wall')?.command).toBe('wall.updateCurtainWall');
    });

    it('is a no-op with no runtime/bus, and when there is nothing to apply', () => {
        expect(dispatchSetMaterial(null, 'column', 'c1', { materialId: 'm' })).toBe(false);
        expect(dispatchSetMaterial({}, 'column', 'c1', { materialId: 'm' })).toBe(false);
        const { runtime, calls } = makeRuntime();
        expect(dispatchSetMaterial(runtime, 'column', 'c1', {})).toBe(false);
        expect(calls).toHaveLength(0);
    });

    it('multi-select: dispatches per element and counts only the families that can commit', () => {
        const { runtime, calls } = makeRuntime();
        const n = dispatchSetMaterialMany(
            runtime,
            [
                { id: 'ce1', type: 'ceiling' },
                { id: 'c1', type: 'column' },
                { id: 's1', type: 'slab' },   // no live path → not counted, not dispatched
            ],
            { materialId: 'm', materialColor: '#0a0b0c' },
        );
        expect(n).toBe(2);
        expect(calls.map(c => c.type)).toEqual(['ceiling.update', 'column.update']);
    });
});
