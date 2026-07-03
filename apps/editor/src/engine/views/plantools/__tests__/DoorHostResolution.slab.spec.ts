/**
 * §FIX-DOOR-SLAB-HOST (L-56) — host-resolution guard for plan-placed openings.
 *
 * Root cause: PlanViewCanvas.hitTest() resolves the id of the nearest projected
 * element of ANY type (walls, slabs, IFC edges…). DoorPlanToolHandler /
 * WindowPlanToolHandler passed that id straight through as the host `wallId`, so a
 * slab edge under the cursor could become a door's host →
 *   [DoorBuilder] Wall not found for door <id> (wallId=slab_…)
 * an orphaned opening that never anchors/renders (violates C15 — doors/windows
 * host ONLY on walls).
 *
 * These tests exercise onClick host-resolution and assert it NEVER dispatches an
 * opening against a non-wall (slab) id: it either resolves to a wall, or rejects.
 *
 * The handler's only runtime dependency is `canvasHitToWorld3D` from the heavy
 * `@pryzm/core-app-model` barrel (THREE/DOM at module load). We mock that single
 * export so the test isolates the handler's decision logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@pryzm/core-app-model', () => ({
    // Plan-family mapping: worldX → x, worldZ → z (see ViewPlane.canvasHitToWorld3D).
    canvasHitToWorld3D: (hit: { worldX: number; worldZ: number }) => ({
        x: hit.worldX,
        y: 0,
        z: hit.worldZ,
    }),
}));

import { DoorPlanToolHandler } from '../DoorPlanToolHandler';
import { WindowPlanToolHandler } from '../WindowPlanToolHandler';

const WALL = { id: 'w1', baseLine: [{ x: 0, z: 0 }, { x: 5, z: 0 }] };
const SLAB_ID = 'slab_01KWJ3BQ5AGFZ5P6ZY7DRFTZ9C';

function makeCtx(hitReturns: string | null, executeMock: ReturnType<typeof vi.fn>) {
    const canvasCtx = {
        setTransform: vi.fn(), clearRect: vi.fn(),
        save: vi.fn(), restore: vi.fn(),
        translate: vi.fn(), rotate: vi.fn(),
        setLineDash: vi.fn(), beginPath: vi.fn(),
        arc: vi.fn(), stroke: vi.fn(), moveTo: vi.fn(),
        lineTo: vi.fn(), fill: vi.fn(), rect: vi.fn(),
        strokeStyle: '', lineWidth: 0, fillStyle: '',
    };
    return {
        wallStore: {
            getAll: () => [WALL],
            // Only 'w1' is a wall — a slab id resolves to undefined.
            getById: (id: string) => (id === 'w1' ? WALL : undefined),
        },
        planCanvas: {
            worldToScreen: (_x: number, _z: number) => ({ sx: 0, sy: 0 }),
            hitTest: (_sx: number, _sy: number, _r: number) => hitReturns,
            getPixelsPerUnit: () => 100,
        },
        overlayCanvas: { width: 800, height: 600 },
        ctx: canvasCtx,
        dpr: 1,
        viewPlane: { isVertical: false, hWorldAxis: 'x', origin: { x: 0, y: 0, z: 0 } },
        viewDef: { spatial: { levelId: undefined } },
        activeOpeningTool: { doorType: 'single', windowType: 'single', systemTypeId: 'dt-solid-timber' },
        runtime: { bus: { executeCommand: executeMock } },
    } as any;
}

describe('§FIX-DOOR-SLAB-HOST (L-56) — DoorPlanToolHandler host resolution', () => {
    let warnSpy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => { warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {}); });

    it('rejects a slab hit with no wall nearby — no opening dispatched', () => {
        const execute = vi.fn().mockReturnValue(Promise.resolve());
        const handler = new DoorPlanToolHandler();
        // hitTest returns a SLAB id; cursor is 10 m from the only wall → no fallback.
        handler.activate(makeCtx(SLAB_ID, execute));
        handler.onClick({ worldX: 2.5, worldZ: 10 } as any);
        expect(execute).not.toHaveBeenCalled();
    });

    it('falls back to the WALL under the cursor when hitTest returns a slab id', () => {
        const execute = vi.fn().mockReturnValue(Promise.resolve());
        const handler = new DoorPlanToolHandler();
        // hitTest returns a SLAB id, but the cursor sits on wall w1 (z=0.1).
        handler.activate(makeCtx(SLAB_ID, execute));
        handler.onClick({ worldX: 2.5, worldZ: 0.1 } as any);
        expect(execute).toHaveBeenCalledTimes(1);
        const [type, payload] = execute.mock.calls[0];
        expect(type).toBe('wall.opening.create');
        expect(payload.wallId).toBe('w1');
        // Never a slab id.
        expect(payload.wallId).not.toContain('slab_');
    });

    it('hosts on the wall when hitTest resolves a valid wall id', () => {
        const execute = vi.fn().mockReturnValue(Promise.resolve());
        const handler = new DoorPlanToolHandler();
        handler.activate(makeCtx('w1', execute));
        handler.onClick({ worldX: 2.5, worldZ: 0.1 } as any);
        expect(execute).toHaveBeenCalledTimes(1);
        expect(execute.mock.calls[0][1].wallId).toBe('w1');
    });
});

describe('§FIX-DOOR-SLAB-HOST (L-56) — WindowPlanToolHandler host resolution', () => {
    beforeEach(() => { vi.spyOn(console, 'warn').mockImplementation(() => {}); vi.spyOn(console, 'log').mockImplementation(() => {}); });

    it('never dispatches a window against a slab id', () => {
        const execute = vi.fn().mockReturnValue(Promise.resolve());
        const handler = new WindowPlanToolHandler();
        handler.activate(makeCtx(SLAB_ID, execute));
        handler.onClick({ worldX: 2.5, worldZ: 10 } as any); // no wall nearby
        expect(execute).not.toHaveBeenCalled();
    });

    it('falls back to the wall under the cursor for a slab hit', () => {
        const execute = vi.fn().mockReturnValue(Promise.resolve());
        const handler = new WindowPlanToolHandler();
        handler.activate(makeCtx(SLAB_ID, execute));
        handler.onClick({ worldX: 2.5, worldZ: 0.1 } as any);
        expect(execute).toHaveBeenCalledTimes(1);
        expect(execute.mock.calls[0][1].wallId).toBe('w1');
    });
});
