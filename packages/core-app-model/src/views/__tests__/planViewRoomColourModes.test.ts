/**
 * @vitest-environment happy-dom
 *
 * §ROOM-VG-CATEGORY (L-1612/L-1616) — the room colour mode reaches the PLAN
 * DRAWING, and it is resolved PER VIEW.
 *
 * WHY THIS SUITE EXISTS, separately from the room-topology one. The 3-D room
 * meshes and the plan canvas are two different painters of the same rooms, and
 * they had drifted: `RoomBoundaryBuilder.setVisualisationMode()` repainted the
 * meshes, while `PlanViewCanvas._renderRoomFills()` called the MODE-LESS
 * `RoomColourSystem.resolve(room)` and could therefore never show any mode at
 * all. Proving one says nothing about the other, so both are driven here.
 *
 * WHERE THE ASSERTION SITS. Not at a resolver's return value — at the canvas.
 * The stub 2-D context records `fillStyle` at the moment `fill()` is called, so
 * what is asserted is the colour the founder would actually see painted, in the
 * order the rooms were painted.
 *
 * WHY TWO VIEWS. "for all view types, elevation etc." only means something if a
 * view can carry its OWN answer. The last case sets two different modes on two
 * different view records and renders the same rooms twice.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { PlanViewCanvas } from '../PlanViewCanvas';
import { vgGovernanceStore } from '../../presentation/VGGovernanceStore';
import { ROOM_VG_CATEGORY } from '../../presentation/RoomColourIntent';

const OCC_BEDROOM  = '#B8D4F0';
const OCC_BATHROOM = '#B2EBF2';
const RAMP_START   = '#FFEB3B';
const RAMP_END     = '#4CAF50';
const WHITE        = '#FFFFFF';

const MODEL = 'model-default';

/** A 2-D context stub that records the fill colour at each `fill()`. */
function makeRecordingCtx(): { ctx: CanvasRenderingContext2D; fills: string[] } {
    const fills: string[] = [];
    const ctx = {
        fillStyle: '',
        globalAlpha: 1,
        save() {}, restore() {}, beginPath() {}, closePath() {},
        moveTo() {}, lineTo() {},
        fill() { fills.push(String((ctx as { fillStyle: string }).fillStyle).toUpperCase()); },
    } as unknown as CanvasRenderingContext2D;
    return { ctx, fills };
}

function room(id: string, occupancyType: string, side: number, xOffset: number) {
    return {
        id,
        levelId: 'L1',
        occupancyType,
        boundary: {
            polygon: [
                { x: xOffset,        z: 0 },
                { x: xOffset + side, z: 0 },
                { x: xOffset + side, z: side },
                { x: xOffset,        z: side },
            ],
            height: 2.7,
        },
        // Explicit per-room overrides so the DETECTION colour differs from every
        // other mode — without them 'detection' and 'occupancy' agree and the
        // assertions could pass without any mode reaching the canvas.
        colour: '#FF0000',
        computed: { area: side * side },
    };
}

const ROOMS = [
    room('r-small', 'bedroom',  10, 0),   // 100 m²
    room('r-mid',   'kitchen',  Math.sqrt(110), 40),
    room('r-large', 'bathroom', Math.sqrt(120), 80),
];

function makeCanvas(viewId: string): PlanViewCanvas {
    const fake = {
        getContext: () => ({}),
        width: 0, height: 0, clientWidth: 800, clientHeight: 600,
    } as unknown as HTMLCanvasElement;
    const pvc = new PlanViewCanvas(fake);
    pvc.setSize(800, 600);
    pvc.setViewType('plan');
    // Stamp the active view id the way render() does, so the room fill pass
    // resolves ITS view's VG record (mirrors PlanViewCanvas.cropHandleDrag.test.ts).
    (pvc as unknown as { _lastViewId: string })._lastViewId = viewId;
    return pvc;
}

function paint(pvc: PlanViewCanvas): string[] {
    const { ctx, fills } = makeRecordingCtx();
    (pvc as unknown as { _renderRoomFills(c: CanvasRenderingContext2D): void })._renderRoomFills(ctx);
    return fills;
}

describe('§ROOM-VG-CATEGORY — the plan drawing honours the room colour mode', () => {
    beforeEach(() => {
        // The real room store the plan pass reads. `window.roomStore` is the
        // documented seam (typed in global-window.d.ts, P4-compliant).
        (window as unknown as { roomStore: unknown }).roomStore = {
            getAll: () => ROOMS,
            getByLevel: (levelId: string) => ROOMS.filter(r => r.levelId === levelId),
        };
        vgGovernanceStore.ensureModel(MODEL, MODEL);
        vgGovernanceStore.resetModelCategoryOverride(MODEL, ROOM_VG_CATEGORY);
        for (const v of ['view-a', 'view-b']) {
            vgGovernanceStore.ensureView(v, v, MODEL);
            vgGovernanceStore.resetViewCategoryOverride(v, ROOM_VG_CATEGORY);
        }
    });

    it('BY ROOM TYPE — each room is painted its occupancy colour', () => {
        vgGovernanceStore.setViewCategoryOverride('view-a', ROOM_VG_CATEGORY, { roomColourMode: 'occupancy' });
        const fills = paint(makeCanvas('view-a'));
        expect(fills).toHaveLength(3);
        expect(fills[0]).toBe(OCC_BEDROOM);
        expect(fills[2]).toBe(OCC_BATHROOM);
    });

    it('BY SIZE — the smallest room paints the ramp start and the largest the ramp end', () => {
        vgGovernanceStore.setViewCategoryOverride('view-a', ROOM_VG_CATEGORY, { roomColourMode: 'area' });
        const fills = paint(makeCanvas('view-a'));
        expect(fills[0]).toBe(RAMP_START);
        expect(fills[2]).toBe(RAMP_END);
    });

    it('ALL WHITE — every room paints white, overrides included', () => {
        vgGovernanceStore.setViewCategoryOverride('view-a', ROOM_VG_CATEGORY, { roomColourMode: 'uniform' });
        expect(paint(makeCanvas('view-a'))).toEqual([WHITE, WHITE, WHITE]);
    });

    it('USER-DEFINED — the colour the user set on the room', () => {
        vgGovernanceStore.setViewCategoryOverride('view-a', ROOM_VG_CATEGORY, { roomColourMode: 'custom' });
        expect(paint(makeCanvas('view-a'))).toEqual(['#FF0000', '#FF0000', '#FF0000']);
    });

    it('THE MODE IS A VIEW PROPERTY — two views of the same rooms disagree', () => {
        vgGovernanceStore.setViewCategoryOverride('view-a', ROOM_VG_CATEGORY, { roomColourMode: 'occupancy' });
        vgGovernanceStore.setViewCategoryOverride('view-b', ROOM_VG_CATEGORY, { roomColourMode: 'uniform' });
        expect(paint(makeCanvas('view-a'))[0]).toBe(OCC_BEDROOM);
        expect(paint(makeCanvas('view-b'))[0]).toBe(WHITE);
    });

    it('A VIEW WITH NO OVERRIDE INHERITS THE PROJECT DEFAULT', () => {
        vgGovernanceStore.setModelCategoryOverride(MODEL, ROOM_VG_CATEGORY, { roomColourMode: 'uniform' });
        expect(paint(makeCanvas('view-b'))).toEqual([WHITE, WHITE, WHITE]);
        // …and a view-level pick still beats it.
        vgGovernanceStore.setViewCategoryOverride('view-b', ROOM_VG_CATEGORY, { roomColourMode: 'occupancy' });
        expect(paint(makeCanvas('view-b'))[0]).toBe(OCC_BEDROOM);
    });

    it('THE CATEGORY CAN HIDE THE ROOM WASH ENTIRELY', () => {
        vgGovernanceStore.setViewCategoryOverride('view-a', ROOM_VG_CATEGORY, { visible: false });
        expect(paint(makeCanvas('view-a'))).toEqual([]);
    });
});
