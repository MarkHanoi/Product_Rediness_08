// @vitest-environment happy-dom
//
// §FEAT-DOOR-FLIP-ON-SPACE (L-92, ADR-0107) — SPACE flips a door during placement.
//
// Proves the plan-view door tool mirrors the furniture spacebar-rotate UX for a
// wall-hosted door: while placing (before click-to-commit), pressing SPACE cycles
// through ALL FOUR configurations — swing INWARD/OUTWARD × hinge LEFT/RIGHT — and
// the COMMITTED door (the wall.opening.create bus payload, P6) carries the
// previewed configuration.
//
// The handler's runtime deps from the heavy @pryzm/core-app-model barrel
// (THREE/DOM at load) are mocked to the two exports it uses: `canvasHitToWorld3D`
// and the REAL (dependency-free) `DoorPlacementFlip`, so this suite exercises the
// genuine 4-state cycle end-to-end through the handler without the renderer.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// L-388 — importing DoorPlanToolHandler pulls the geometry-door barrel, whose
// transitive graph (system-type stores, room-topology singletons, annotations,
// constraint-solver…) legitimately reads many core-app-model barrel exports at module
// load (self-registration, event-bus subscription, region constraint tables). A
// PARTIAL mock is fatal here: vitest's mock namespace THROWS on access of any export
// the factory omits, crashing the whole graph at import. So spread the REAL barrel via
// importOriginal (every load-time consumer gets the genuine export) and override ONLY
// `canvasHitToWorld3D` with a deterministic plan-family mapping (worldX→x, worldZ→z),
// which is the sole barrel dep whose value this suite needs to pin for the renderer-free
// host-resolution assertions.
vi.mock('@pryzm/core-app-model', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@pryzm/core-app-model')>()),
    canvasHitToWorld3D: (hit: { worldX: number; worldZ: number }) => ({
        x: hit.worldX, y: 0, z: hit.worldZ,
    }),
}));

import { DoorPlanToolHandler } from '../DoorPlanToolHandler';

const WALL = { id: 'w1', baseLine: [{ x: 0, z: 0 }, { x: 5, z: 0 }] };

function makeCtx(executeMock: ReturnType<typeof vi.fn>) {
    const canvasCtx = {
        setTransform: vi.fn(), clearRect: vi.fn(),
        save: vi.fn(), restore: vi.fn(),
        translate: vi.fn(), rotate: vi.fn(),
        setLineDash: vi.fn(), beginPath: vi.fn(),
        arc: vi.fn(), stroke: vi.fn(), moveTo: vi.fn(),
        lineTo: vi.fn(), fill: vi.fn(), rect: vi.fn(),
        fillText: vi.fn(), measureText: () => ({ width: 10 }),
        strokeStyle: '', lineWidth: 0, fillStyle: '',
        font: '', textAlign: '', textBaseline: '',
    };
    return {
        wallStore: {
            getAll: () => [WALL],
            getById: (id: string) => (id === 'w1' ? WALL : undefined),
        },
        planCanvas: {
            worldToScreen: (_x: number, _z: number) => ({ sx: 250, sy: 0 }),
            hitTest: (_sx: number, _sy: number, _r: number) => 'w1',
            getPixelsPerUnit: () => 100,
        },
        overlayCanvas: { width: 800, height: 600 },
        ctx: canvasCtx,
        dpr: 1,
        viewPlane: { isVertical: false, hWorldAxis: 'x', origin: { x: 0, y: 0, z: 0 } },
        viewDef: { spatial: { levelId: 'level-1' } },
        activeOpeningTool: { doorType: 'single', windowType: 'single', systemTypeId: 'dt-solid-timber' },
        runtime: { bus: { executeCommand: executeMock } },
    } as any;
}

function spaceEvent(): KeyboardEvent {
    return new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true, cancelable: true });
}

describe('§FEAT-DOOR-FLIP-ON-SPACE (L-92) — SPACE flips the door during placement', () => {
    beforeEach(() => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    it('the default (no SPACE) door commits inward / left', () => {
        const execute = vi.fn().mockReturnValue(Promise.resolve());
        const handler = new DoorPlanToolHandler();
        handler.activate(makeCtx(execute));
        handler.onClick({ worldX: 2.5, worldZ: 0.1 } as any);

        expect(execute).toHaveBeenCalledTimes(1);
        const [type, payload] = execute.mock.calls[0];
        expect(type).toBe('wall.opening.create');
        expect(payload.openingData.swingDirection).toBe('inward');
        expect(payload.openingData.hingesSide).toBe('left');
    });

    it('SPACE cycles the 4 swing/hand states and the committed door carries the previewed config', () => {
        const execute = vi.fn().mockReturnValue(Promise.resolve());
        const handler = new DoorPlanToolHandler();
        handler.activate(makeCtx(execute));
        handler.onMouseMove({ worldX: 2.5, worldZ: 0.1 } as any); // arm a live preview

        // The cumulative flip walks all four combinations, then wraps to the first.
        const expected = [
            { swingDirection: 'inward',  hingesSide: 'left'  }, // 0 presses
            { swingDirection: 'inward',  hingesSide: 'right' }, // 1
            { swingDirection: 'outward', hingesSide: 'left'  }, // 2
            { swingDirection: 'outward', hingesSide: 'right' }, // 3
            { swingDirection: 'inward',  hingesSide: 'left'  }, // 4 → wrap
        ];

        for (const want of expected) {
            execute.mockClear();
            // Commit at the CURRENT flip config, then assert the payload matches it.
            handler.onClick({ worldX: 2.5, worldZ: 0.1 } as any);
            const payload = execute.mock.calls[0][1].openingData;
            expect(payload.swingDirection).toBe(want.swingDirection);
            expect(payload.hingesSide).toBe(want.hingesSide);

            // Advance to the next config via SPACE — the handler consumes the key.
            const consumed = handler.onKeyDown(spaceEvent());
            expect(consumed).toBe(true);
        }
    });

    it('Escape resets the flip back to inward / left for the next door', () => {
        const execute = vi.fn().mockReturnValue(Promise.resolve());
        const handler = new DoorPlanToolHandler();
        handler.activate(makeCtx(execute));
        handler.onMouseMove({ worldX: 2.5, worldZ: 0.1 } as any);

        handler.onKeyDown(spaceEvent()); // inward/right
        handler.onKeyDown(spaceEvent()); // outward/left
        handler.cancel();                // Esc — reset

        handler.onClick({ worldX: 2.5, worldZ: 0.1 } as any);
        const payload = execute.mock.calls[0][1].openingData;
        expect(payload.swingDirection).toBe('inward');
        expect(payload.hingesSide).toBe('left');
    });

    it('onKeyDown returns false for keys it does not handle', () => {
        const execute = vi.fn().mockReturnValue(Promise.resolve());
        const handler = new DoorPlanToolHandler();
        handler.activate(makeCtx(execute));
        const other = new KeyboardEvent('keydown', { code: 'KeyR', key: 'r' });
        expect(handler.onKeyDown(other)).toBe(false);
    });
});
