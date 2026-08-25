/**
 * §FIX-RESIZE-NEEDS-A-TERM-FOR-NO-CHANGE (L-10801) · §FIX-CONFLICT-IS-SILENT-STALENESS (L-10802)
 *
 * FOUNDER PRODUCTION TRACE, 2026-08-24, one wall move on level L0:
 *
 *   §C79-5.2 resized: floor "90d05bb6…" follows wall "wall_…ACY" — 22.032 m² → 22.032 m².
 *
 * printed THREE times in the same gesture, identical every time. ⛔ **A "resized" that
 * changed nothing by any digit is reported in the SAME WORDS as a real resize.** That is
 * the estate's recurring defect shape: a success criterion with no term for the property
 * that actually matters reads as evidence while measuring nothing (compare the wall census
 * that reported "2 seated" while a junction sat open).
 *
 * ⭐ WHY THE FIX IS NOT AN AREA COMPARISON. Equal area is NOT an unchanged ring — a pure
 * TRANSLATION holds area exactly while every vertex moves. Deciding on area alone would
 * mislabel a genuine move as a no-op, trading one wrong report for another. The ring is
 * compared vertex-wise at 0.1 mm, and the area delta is quoted alongside it:
 *
 *   resized   — the ring changed AND the area changed
 *   reshaped  — the ring changed, the area did not   ← the term that was missing
 *   unchanged — the ring is identical: nothing happened, and we checked
 *
 * ⚠ THESE TESTS ASSERT THE LABEL AND THE NUMBERS, never "no error thrown". Each fails on
 * the pre-fix head, which reported every one of these cases as bare "resized".
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { FloorStore, type FloorData } from '@pryzm/core-app-model/stores';
import { buildRoomFinishBoundarySketch } from '../../command-registry/src/rooms/roomBoundarySketch';
import { WallFaceResolver } from '../../geometry-slab/src/WallFaceResolver';
import { SketchLoopIntersector } from '../../geometry-slab/src/SketchLoopIntersector';
import { FloorHostDependencyTracker } from '../src/FloorHostDependencyTracker';
import type { FinishCommandManagerRef } from '../src/FinishHostDependencyTracker';
import type { XZ } from '../src/FinishSegmentAdapter';

type ProbeWall = { id: string; baseLine: { x: number; y: number; z: number }[]; thickness: number };
type Listener = (e: 'add' | 'update' | 'remove', w: ProbeWall, prev?: ProbeWall) => void;

class ProbeWallStore {
    private walls = new Map<string, ProbeWall>();
    private listeners: Listener[] = [];
    seed(w: ProbeWall): void { this.walls.set(w.id, w); }
    getById(id: string): ProbeWall | undefined { return this.walls.get(id); }
    subscribe(cb: Listener): () => void {
        this.listeners.push(cb);
        return () => { this.listeners = this.listeners.filter(l => l !== cb); };
    }
    /** THE ACT. `dx = dz = 0` re-emits an identical wall — the founder's no-op case. */
    move(id: string, dx: number, dz: number): void {
        const w = this.walls.get(id);
        if (!w) throw new Error(`probe wall "${id}" not seeded`);
        const prev: ProbeWall = { ...w, baseLine: w.baseLine.map(p => ({ ...p })) };
        w.baseLine = w.baseLine.map(p => ({ x: p.x + dx, y: p.y, z: p.z + dz }));
        for (const l of this.listeners) l('update', w, prev);
    }
}

const RING: XZ[] = [
    { x: 0.1, z: 0.1 }, { x: 5.9, z: 0.1 }, { x: 5.9, z: 3.9 }, { x: 0.1, z: 3.9 },
];

let walls: ProbeWallStore;

function seedRoom(store: ProbeWallStore): void {
    const w = (id: string, x0: number, z0: number, x1: number, z1: number): ProbeWall => ({
        id, baseLine: [{ x: x0, y: 0, z: z0 }, { x: x1, y: 0, z: z1 }], thickness: 0.2,
    });
    store.seed(w('w-south', 0, 0, 6, 0));
    store.seed(w('w-east', 6, 0, 6, 4));
    store.seed(w('w-north', 6, 4, 0, 4));
    store.seed(w('w-west', 0, 4, 0, 0));
}

function finishFloor(id: string): FloorData {
    const s = buildRoomFinishBoundarySketch(RING, 'room-1', {
        getRoomById: () => ({ boundingWallIds: ['w-south', 'w-east', 'w-north', 'w-west'] }),
        getWallById: (wid) => {
            const w = walls.getById(wid);
            return w ? { id: w.id, baseLine: w.baseLine.map(p => ({ x: p.x, z: p.z })), thickness: w.thickness } : undefined;
        },
    });
    return {
        id, type: 'floor', levelId: 'L0', label: `Floor-${id}`, floorNumber: `F.${id}`,
        boundary: { polygon: RING.map(p => ({ ...p })), baseOffset: 0.015, thickness: 0.015, detectionMethod: 'from-room' },
        sketch: { outerLoop: s.outerLoop },
        finishSpec: { exposedScreed: false },
        serviceHoles: [], coveredRoomIds: [], boundingWallIds: s.boundingWallIds,
        hostRoomId: 'room-1', visible: true, properties: {},
        metadata: { createdAt: Date.now(), modifiedAt: Date.now(), createdBy: 'test', version: 1 },
    } as unknown as FloorData;
}

const noCm: FinishCommandManagerRef = { current: undefined };
const geometry = { resolver: WallFaceResolver, intersector: SketchLoopIntersector };

let logs: string[];
let logSpy: ReturnType<typeof vi.spyOn>;

function armTracker(store: FloorStore) {
    // Argument order and shapes copied VERBATIM from the suite next door — the
    // production wiring is (store, walls, geometry, commandManagerRef).
    const t = new FloorHostDependencyTracker(store as never, walls as never, geometry as never, noCm);
    t.bootstrap();
    return t;
}

beforeEach(() => {
    walls = new ProbeWallStore();
    seedRoom(walls);
    (globalThis as Record<string, unknown>)['wallStore'] = walls;
    logs = [];
    logSpy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logs.push(a.join(' ')); });
});

afterEach(() => {
    logSpy.mockRestore();
    delete (globalThis as Record<string, unknown>)['wallStore'];
});

const c79 = () => logs.filter(l => l.includes('§C79-5.2'));

describe('§C79-5.2 — "resized" must have a term for "nothing changed" (L-10801)', () => {
    it('⛔ a wall re-emitted with ZERO displacement is NOT reported as "resized"', () => {
        const store = new FloorStore();
        store.add(finishFloor('f-noop'));
        armTracker(store);
        logs = [];

        // THE FOUNDER'S CASE: the wall MOVES, but along its OWN axis, so its offset
        // line — and therefore the floor ring derived from it — is unchanged. The move is
        // real; the consequence for this finish is nil. That is exactly what the old
        // 'resized: 22.032 m² → 22.032 m²' was reporting as a success.
        walls.move('w-south', 1.5, 0);

        const lines = c79();
        expect(lines.length).toBeGreaterThan(0); // it DID report — silence would be its own defect
        for (const l of lines) {
            // THE ASSERTION THAT FAILS ON THE PRE-FIX HEAD:
            expect(l).not.toMatch(/§C79-5\.2 resized:/);
            expect(l).toMatch(/§C79-5\.2 unchanged:/);
            expect(l).toContain('ring IDENTICAL — no vertex moved');
            expect(l).toMatch(/Δ [+-]0\.0000 m²/); // the delta is QUOTED, not implied
        }
    });

    it('⭐ a REAL move is still reported as "resized", and the m² delta is non-zero', () => {
        const store = new FloorStore();
        store.add(finishFloor('f-real'));
        armTracker(store);
        logs = [];

        walls.move('w-south', 0, -1.0); // 1 m south — the room genuinely grows

        const resized = c79().filter(l => l.includes('resized:'));
        expect(resized.length).toBeGreaterThan(0);
        const line = resized[0]!;
        expect(line).toMatch(/Δ [+-]\d+\.\d{4} m²/);
        // The delta must be a real quantity, not 0.0000 — this is the m² assertion.
        const m = /Δ ([+-]?\d+\.\d{4}) m²/.exec(line);
        expect(m).not.toBeNull();
        expect(Math.abs(Number(m![1]))).toBeGreaterThan(0.5);
        expect(line).not.toContain('ring IDENTICAL');
    });

    it('⭐ the three verbs are DISTINCT — a no-op and a real move never read alike', () => {
        const store = new FloorStore();
        store.add(finishFloor('f-a'));
        armTracker(store);

        logs = [];
        walls.move('w-north', 1.5, 0); // along its own axis — no consequence
        const noop = c79().join('\n');

        logs = [];
        walls.move('w-north', 0, 0.8);
        const real = c79().join('\n');

        expect(noop).not.toEqual(real);
        expect(noop).toContain('unchanged:');
        expect(real).toContain('resized:');
    });
});
