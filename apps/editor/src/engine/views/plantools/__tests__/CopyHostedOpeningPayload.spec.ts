/**
 * §FIX-COPY-HOSTED-OPENING-PAYLOAD (L-128) — Copy tool creates a real element.
 *
 * Root cause: CopyPlanToolHandler._copyHosted dispatched the PRYZM3-typed command
 * `wall.createOpening` (CreateWallOpeningHandler) whose canExecute reads
 * `cmd.opening`, but the copy passed `{ wallId, openingData }`. `cmd.opening` was
 * therefore `undefined` → "opening must be an object" rejection, so copying a door
 * or window silently produced nothing.
 *
 * Fix: dispatch `wall.opening.create` (WallOpeningLegacyAdapterHandler, payload
 * `{ wallId, openingData }`) — the exact command + payload shape the proven
 * placement path (DoorPlanToolHandler) uses, which drives the mesh-rebuild bridge
 * and persists across save/reload.
 *
 * These tests assert the handler dispatches the correct command with a payload the
 * legacy adapter's canExecute accepts (type ∈ {door,window}, offset ≥ 0, width > 0,
 * height > 0, sillHeight ≥ 0, fresh id + elementId). The plain-element (wall) copy
 * path is asserted to dispatch `wall.create` with a new id.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CopyPlanToolHandler } from '../CopyPlanToolHandler';

// A DoorData-shaped source record (WallTypes.ts) as returned by wallStore.getDoor().
const SOURCE_DOOR = {
    id:         'door-src',
    type:       'door' as const,
    doorType:   'single' as const,
    wallId:     'w1',
    openingId:  'op-src',
    elementId:  'door-src',
    offset:     1.0,
    width:      1.0,
    height:     2.1,
    sillHeight: 0,
    frameThickness: 0.05,
    frameWidth:     0.05,
    systemTypeId:   'dt-solid-timber',
    mark:       'DO001',
};

const WALL = { id: 'w1', baseLine: [{ x: 0, z: 0 }, { x: 5, z: 0 }], height: 3, thickness: 0.2, levelId: 'L0' };

function makeCtx() {
    const canvasCtx = {
        setTransform: vi.fn(), clearRect: vi.fn(), save: vi.fn(), restore: vi.fn(),
        translate: vi.fn(), rotate: vi.fn(), setLineDash: vi.fn(), beginPath: vi.fn(),
        arc: vi.fn(), stroke: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), fill: vi.fn(),
        rect: vi.fn(), fillText: vi.fn(), measureText: () => ({ width: 10 }), roundRect: vi.fn(),
        strokeStyle: '', lineWidth: 0, fillStyle: '', font: '', textAlign: '', textBaseline: '',
    };
    return {
        ctx: canvasCtx,
        overlayCanvas: { width: 800, height: 600 },
        planCanvas: { worldToScreen: (_x: number, _z: number) => ({ sx: 0, sy: 0 }) },
        dpr: 1,
    } as any;
}

describe('§FIX-COPY-HOSTED-OPENING-PAYLOAD (L-128) — hosted copy', () => {
    let execute: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        execute = vi.fn().mockReturnValue(Promise.resolve());
        (globalThis as any).window = {
            wallStore: {
                getById:  (id: string) => (id === 'w1' ? WALL : undefined),
                getDoor:  (id: string) => (id === 'door-src' ? { ...SOURCE_DOOR } : undefined),
                getWindow: () => undefined,
            },
            selectionManager: {
                selectedObject: { userData: { id: 'door-src', elementType: 'door' } },
            },
            runtime: { bus: { executeCommand: execute } },
            toolManager: { setActiveTool: vi.fn() },
        };
    });

    afterEach(() => {
        delete (globalThis as any).window;
        vi.restoreAllMocks();
    });

    it('dispatches wall.opening.create (not wall.createOpening) with a schema-valid openingData', () => {
        const handler = new CopyPlanToolHandler();
        handler.activate(makeCtx());
        // Two clicks: origin then destination 2 m along +x → delta projects onto the wall.
        handler.onClick({ worldX: 0, worldZ: 0 } as any);
        handler.onClick({ worldX: 2, worldZ: 0 } as any);

        expect(execute).toHaveBeenCalledTimes(1);
        const [type, payload] = execute.mock.calls[0];
        expect(type).toBe('wall.opening.create');
        expect(type).not.toBe('wall.createOpening');
        expect(payload.wallId).toBe('w1');

        const d = payload.openingData;
        // Legacy-adapter canExecute invariants.
        expect(d.type).toBe('door');
        expect(typeof d.offset).toBe('number');
        expect(d.offset).toBeGreaterThanOrEqual(0);
        expect(d.width).toBeGreaterThan(0);
        expect(d.height).toBeGreaterThan(0);
        expect(d.sillHeight).toBeGreaterThanOrEqual(0);
        // Fresh, distinct IDs (new semantically-unique element), not the source IDs.
        expect(typeof d.id).toBe('string');
        expect(typeof d.elementId).toBe('string');
        expect(d.id).not.toBe(SOURCE_DOOR.id);
        expect(d.elementId).not.toBe(SOURCE_DOOR.elementId);
        expect(d.id).not.toBe(d.elementId);
        // Copied 2 m along the wall from offset 1.0 → 3.0 (clamped inside wall).
        expect(d.offset).toBeCloseTo(3.0, 3);
        // Faithful copy preserves type-specific props.
        expect(d.doorType).toBe('single');
        expect(d.systemTypeId).toBe('dt-solid-timber');
        // Stale mark cleared so MarkGenerator re-assigns.
        expect(d.mark).toBeUndefined();
    });
});

describe('§FIX-COPY-HOSTED-OPENING-PAYLOAD (L-128) — plain (wall) copy still persists', () => {
    let execute: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        execute = vi.fn().mockReturnValue(Promise.resolve());
        (globalThis as any).window = {
            wallStore: { getById: (id: string) => (id === 'w1' ? WALL : undefined) },
            selectionManager: { selectedObject: { userData: { id: 'w1', elementType: 'wall' } } },
            runtime: { bus: { executeCommand: execute } },
            toolManager: { setActiveTool: vi.fn() },
        };
    });

    afterEach(() => {
        delete (globalThis as any).window;
        vi.restoreAllMocks();
    });

    it('dispatches wall.create with a fresh id and translated baseLine', () => {
        const handler = new CopyPlanToolHandler();
        handler.activate(makeCtx());
        handler.onClick({ worldX: 0, worldZ: 0 } as any);
        handler.onClick({ worldX: 0, worldZ: 2 } as any);

        expect(execute).toHaveBeenCalledTimes(1);
        const [type, payload] = execute.mock.calls[0];
        expect(type).toBe('wall.create');
        expect(payload.id).toBeTruthy();
        expect(payload.id).not.toBe('w1');
        // baseLine translated by the +2 m Z delta.
        expect(payload.baseLine[0].z).toBeCloseTo(2, 3);
        expect(payload.baseLine[1].z).toBeCloseTo(2, 3);
        expect(payload.baseLine[1].x).toBeCloseTo(5, 3);
    });
});
