import { describe, it, expect, beforeEach } from 'vitest';
import { FloorStore, type FloorData } from '@pryzm/core-app-model/stores';
import { buildRoomFinishBoundarySketch } from '../../command-registry/src/rooms/roomBoundarySketch';
import { WallFaceResolver } from '../../geometry-slab/src/WallFaceResolver';
import { SketchLoopIntersector } from '../../geometry-slab/src/SketchLoopIntersector';
import { FloorHostDependencyTracker } from '../src/FloorHostDependencyTracker';
import { reprojectFinishBoundary } from '../src/reprojectFinishBoundary';
import { resolveFinishHostEdgeXZ, type XZ } from '../src/FinishSegmentAdapter';

type ProbeWall = { id: string; baseLine: { x: number; y: number; z: number }[]; thickness: number };
class ProbeWallStore {
    walls = new Map<string, ProbeWall>();
    listeners: Array<(e: string, w: ProbeWall, p?: ProbeWall) => void> = [];
    seed(w: ProbeWall) { this.walls.set(w.id, w); }
    getById(id: string) { return this.walls.get(id); }
    subscribe(cb: (e: string, w: ProbeWall, p?: ProbeWall) => void) { this.listeners.push(cb); return () => undefined; }
    move(id: string, dx: number, dz: number) {
        const w = this.walls.get(id)!;
        const prev: ProbeWall = { ...w, baseLine: w.baseLine.map(p => ({ ...p })) };
        w.baseLine = w.baseLine.map(p => ({ x: p.x + dx, y: p.y, z: p.z + dz }));
        for (const l of this.listeners) l('update', w, prev);
    }
}

const RING: XZ[] = [{ x: 0.1, z: 0.1 }, { x: 5.9, z: 0.1 }, { x: 5.9, z: 3.9 }, { x: 0.1, z: 3.9 }];
let walls: ProbeWallStore;

function producedSketch() {
    return buildRoomFinishBoundarySketch(RING, 'room-1', {
        getRoomById: () => ({ boundingWallIds: ['w-south', 'w-east', 'w-north', 'w-west'] }),
        getWallById: (id: string) => {
            const w = walls.getById(id);
            return w ? { id: w.id, baseLine: w.baseLine.map(p => ({ x: p.x, z: p.z })), thickness: w.thickness } : undefined;
        },
    } as never);
}

beforeEach(() => {
    walls = new ProbeWallStore();
    const w = (id: string, x0: number, z0: number, x1: number, z1: number): ProbeWall => ({
        id, baseLine: [{ x: x0, y: 0, z: z0 }, { x: x1, y: 0, z: z1 }], thickness: 0.2,
    });
    walls.seed(w('w-south', 0, 0, 6, 0));
    walls.seed(w('w-east', 6, 0, 6, 4));
    walls.seed(w('w-north', 6, 4, 0, 4));
    walls.seed(w('w-west', 0, 4, 0, 0));
    Object.assign(window, { wallStore: walls });
});

describe('probe', () => {
    it('A: buildRoomFinishBoundarySketch alone', () => {
        console.error('[probe A] start');
        const s = producedSketch();
        console.error('[probe A] edges', JSON.stringify(s.outerLoop.edges.map((e: never) => (e as { type: string }).type)));
        expect(s).toBeTruthy();
    });

    it('B: reprojectFinishBoundary directly, no store', () => {
        const s = producedSketch();
        console.error('[probe B] sketch built');
        const prev = { id: 'w-north', baseLine: walls.getById('w-north')!.baseLine.map(p => ({ ...p })), thickness: 0.2 };
        walls.walls.get('w-north')!.baseLine = walls.walls.get('w-north')!.baseLine.map(p => ({ x: p.x, y: p.y, z: p.z + 2 }));
        console.error('[probe B] wall mutated; calling reproject');
        const r = reprojectFinishBoundary({
            edges: s.outerLoop.edges,
            movedWallId: 'w-north',
            prevWall: prev as never,
            resolveHostSegmentXZ: (edge) => resolveFinishHostEdgeXZ(WallFaceResolver as never, edge),
            intersector: SketchLoopIntersector as never,
        } as never);
        console.error('[probe B] reproject returned', r.state);
        expect(r).toBeTruthy();
    });

    it('C1: construct store + tracker only', () => {
        const floorStore = new FloorStore();
        const tracker = new FloorHostDependencyTracker(
            floorStore, walls as never,
            { resolver: WallFaceResolver, intersector: SketchLoopIntersector } as never,
            { current: undefined },
        );
        tracker.dispose();
        expect(true).toBe(true);
    });

    it('C2a: add floor with NO tracker at all', () => {
        const floorStore = new FloorStore();
        const s = producedSketch();
        floorStore.add({
            id: 'fl-c2a', type: 'floor', levelId: 'L0', label: 'F', floorNumber: 'F.1',
            boundary: { polygon: RING.map(p => ({ ...p })), baseOffset: 0.015, thickness: 0.015, detectionMethod: 'from-room' },
            sketch: { outerLoop: s.outerLoop }, finishSpec: { exposedScreed: false }, serviceHoles: [],
            coveredRoomIds: [], boundingWallIds: s.boundingWallIds, hostRoomId: 'room-1', visible: true, properties: {},
            metadata: { createdAt: Date.now(), modifiedAt: Date.now(), createdBy: 't', version: 1 },
        } as unknown as FloorData);
        expect(floorStore.getById('fl-c2a')).toBeTruthy();
    });

    it('C2b: instrumented — count tracker getById calls during add', () => {
        const floorStore = new FloorStore();
        let calls = 0;
        const realGetById = floorStore.getById.bind(floorStore);
        (floorStore as unknown as { getById: (id: string) => unknown }).getById = (id: string) => {
            calls++;
            if (calls > 20) { console.error('[probe C2b] RUNAWAY getById, calls=', calls); throw new Error('RUNAWAY'); }
            console.error('[probe C2b] getById#' + calls, id);
            return realGetById(id);
        };
        const tracker = new FloorHostDependencyTracker(
            floorStore, walls as never,
            { resolver: WallFaceResolver, intersector: SketchLoopIntersector } as never,
            { current: undefined },
        );
        const s = producedSketch();
        console.error('[probe C2b] about to add');
        floorStore.add({
            id: 'fl-c2b', type: 'floor', levelId: 'L0', label: 'F', floorNumber: 'F.1',
            boundary: { polygon: RING.map(p => ({ ...p })), baseOffset: 0.015, thickness: 0.015, detectionMethod: 'from-room' },
            sketch: { outerLoop: s.outerLoop }, finishSpec: { exposedScreed: false }, serviceHoles: [],
            coveredRoomIds: [], boundingWallIds: s.boundingWallIds, hostRoomId: 'room-1', visible: true, properties: {},
            metadata: { createdAt: Date.now(), modifiedAt: Date.now(), createdBy: 't', version: 1 },
        } as unknown as FloorData);
        console.error('[probe C2b] add SURVIVED, calls=', calls);
        tracker.dispose();
        expect(true).toBe(true);
    });

    it('C2: construct + add floor (no move)', () => {
        const floorStore = new FloorStore();
        const tracker = new FloorHostDependencyTracker(
            floorStore, walls as never,
            { resolver: WallFaceResolver, intersector: SketchLoopIntersector } as never,
            { current: undefined },
        );
        const s = producedSketch();
        floorStore.add({
            id: 'fl-c2', type: 'floor', levelId: 'L0', label: 'F', floorNumber: 'F.1',
            boundary: { polygon: RING.map(p => ({ ...p })), baseOffset: 0.015, thickness: 0.015, detectionMethod: 'from-room' },
            sketch: { outerLoop: s.outerLoop }, finishSpec: { exposedScreed: false }, serviceHoles: [],
            coveredRoomIds: [], boundingWallIds: s.boundingWallIds, hostRoomId: 'room-1', visible: true, properties: {},
            metadata: { createdAt: Date.now(), modifiedAt: Date.now(), createdBy: 't', version: 1 },
        } as unknown as FloorData);
        tracker.dispose();
        expect(floorStore.getById('fl-c2')).toBeTruthy();
    });

    it('C3: plain store.update of sketch+boundary, tracker wired, NO wall move', () => {
        const floorStore = new FloorStore();
        const tracker = new FloorHostDependencyTracker(
            floorStore, walls as never,
            { resolver: WallFaceResolver, intersector: SketchLoopIntersector } as never,
            { current: undefined },
        );
        const s = producedSketch();
        floorStore.add({
            id: 'fl-c3', type: 'floor', levelId: 'L0', label: 'F', floorNumber: 'F.1',
            boundary: { polygon: RING.map(p => ({ ...p })), baseOffset: 0.015, thickness: 0.015, detectionMethod: 'from-room' },
            sketch: { outerLoop: s.outerLoop }, finishSpec: { exposedScreed: false }, serviceHoles: [],
            coveredRoomIds: [], boundingWallIds: s.boundingWallIds, hostRoomId: 'room-1', visible: true, properties: {},
            metadata: { createdAt: Date.now(), modifiedAt: Date.now(), createdBy: 't', version: 1 },
        } as unknown as FloorData);
        floorStore.update('fl-c3', { boundary: { polygon: RING.map(p => ({ ...p, z: p.z + 1 })), baseOffset: 0.015, thickness: 0.015, detectionMethod: 'from-room' } } as never);
        tracker.dispose();
        expect(true).toBe(true);
    });

    it('C4: full tracker + real FloorStore + move', () => {
        const floorStore = new FloorStore();
        const tracker = new FloorHostDependencyTracker(
            floorStore, walls as never,
            { resolver: WallFaceResolver, intersector: SketchLoopIntersector } as never,
            { current: undefined },
        );
        const s = producedSketch();
        floorStore.add({
            id: 'fl-live', type: 'floor', levelId: 'L0', label: 'F', floorNumber: 'F.1',
            boundary: { polygon: RING.map(p => ({ ...p })), baseOffset: 0.015, thickness: 0.015, detectionMethod: 'from-room' },
            sketch: { outerLoop: s.outerLoop }, finishSpec: { exposedScreed: false }, serviceHoles: [],
            coveredRoomIds: [], boundingWallIds: s.boundingWallIds, hostRoomId: 'room-1', visible: true, properties: {},
            metadata: { createdAt: Date.now(), modifiedAt: Date.now(), createdBy: 't', version: 1 },
        } as unknown as FloorData);
        console.error('[probe C] floor added');
        walls.move('w-north', 0, 2);
        console.error('[probe C] wall moved — SURVIVED');
        tracker.dispose();
        expect(true).toBe(true);
    });
});
