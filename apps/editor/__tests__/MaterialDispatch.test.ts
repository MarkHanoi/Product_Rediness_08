// @vitest-environment happy-dom
//
// §FEAT-UNIFORM-MATERIAL-COMMAND (audit L-08 / L-57) — unit test for the uniform
// material-set dispatch facade. Verifies that the panel's single dispatch surface
// routes each element family to its `<family>.setMaterial` command with the correct
// id field, honours `materialColor` only for colour-capable families, normalises
// type aliases, clears the binding on `materialId: null`, and refuses out-of-scope
// / no-op calls (so legacy per-type paths can still run).

import { describe, it, expect } from 'vitest';
import {
    dispatchSetMaterial,
    dispatchSetMaterialMany,
    routeFor,
    hasMaterialCommand,
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

describe('MaterialDispatch — uniform material-set facade', () => {
    it('routes a slab to slab.setMaterial with slabId + materialColor + materialId', () => {
        const { runtime, calls } = makeRuntime();
        const ok = dispatchSetMaterial(runtime, 'slab', 's1', { materialId: 'oak', materialColor: '#112233' });
        expect(ok).toBe(true);
        expect(calls).toHaveLength(1);
        expect(calls[0]!.type).toBe('slab.setMaterial');
        expect(calls[0]!.payload).toEqual({ slabId: 's1', materialId: 'oak', materialColor: '#112233' });
    });

    it('drops materialColor for a materialId-only family (column) but still dispatches the id', () => {
        const { runtime, calls } = makeRuntime();
        const ok = dispatchSetMaterial(runtime, 'column', 'c1', { materialId: 'steel', materialColor: '#ff0000' });
        expect(ok).toBe(true);
        expect(calls[0]!.type).toBe('column.setMaterial');
        expect(calls[0]!.payload).toEqual({ columnId: 'c1', materialId: 'steel' });
        expect(calls[0]!.payload.materialColor).toBeUndefined();
    });

    it('returns false (no dispatch) for a colour-only change on a materialId-only family', () => {
        const { runtime, calls } = makeRuntime();
        const ok = dispatchSetMaterial(runtime, 'column', 'c1', { materialColor: '#ff0000' });
        expect(ok).toBe(false);
        expect(calls).toHaveLength(0);
    });

    it('normalises aliases: "stairs" → stair.setMaterial(stairId), furniture sub-types → furniture', () => {
        const { runtime, calls } = makeRuntime();
        dispatchSetMaterial(runtime, 'stairs', 't1', { materialId: 'm' });
        dispatchSetMaterial(runtime, 'wardrobe', 'f1', { materialId: 'm' });
        expect(calls[0]!.type).toBe('stair.setMaterial');
        expect(calls[0]!.payload.stairId).toBe('t1');
        expect(calls[1]!.type).toBe('furniture.setMaterial');
        expect(calls[1]!.payload.furnitureId).toBe('f1');
    });

    it('clears the catalogue binding when materialId is null', () => {
        const { runtime, calls } = makeRuntime();
        const ok = dispatchSetMaterial(runtime, 'roof', 'r1', { materialId: null });
        expect(ok).toBe(true);
        expect(calls[0]!.payload).toEqual({ roofId: 'r1', materialId: null });
    });

    it('does NOT route walls/doors/windows (they keep their own path)', () => {
        const { runtime, calls } = makeRuntime();
        expect(dispatchSetMaterial(runtime, 'wall', 'w1', { materialColor: '#123456' })).toBe(false);
        expect(dispatchSetMaterial(runtime, 'door', 'd1', { materialColor: '#123456' })).toBe(false);
        expect(dispatchSetMaterial(runtime, 'window', 'n1', { materialColor: '#123456' })).toBe(false);
        expect(calls).toHaveLength(0);
        expect(hasMaterialCommand('wall')).toBe(false);
        expect(hasMaterialCommand('slab')).toBe(true);
    });

    it('is a no-op when the runtime/bus is unavailable', () => {
        expect(dispatchSetMaterial(null, 'slab', 's1', { materialId: 'm' })).toBe(false);
        expect(dispatchSetMaterial({}, 'slab', 's1', { materialId: 'm' })).toBe(false);
    });

    it('multi-select: dispatches per element and counts routed families', () => {
        const { runtime, calls } = makeRuntime();
        const n = dispatchSetMaterialMany(
            runtime,
            [
                { id: 's1', type: 'slab' },
                { id: 'c1', type: 'column' },
                { id: 'w1', type: 'wall' }, // out of scope → not counted
            ],
            { materialId: 'm', materialColor: '#0a0b0c' },
        );
        expect(n).toBe(2);
        expect(calls.map(c => c.type)).toEqual(['slab.setMaterial', 'column.setMaterial']);
    });

    it('routeFor exposes colour capability per family', () => {
        expect(routeFor('ceiling')?.supportsColor).toBe(true);
        expect(routeFor('floor')?.supportsColor).toBe(true);
        expect(routeFor('beam')?.supportsColor).toBe(false);
        expect(routeFor('curtain-wall')?.command).toBe('curtainwall.setMaterial');
        expect(routeFor('curtain-wall')?.idField).toBe('curtainWallId');
    });
});
