/**
 * L-1121 / L-1122 / L-1123 — "REGION SLAB WORKS IN PLAN BUT NOT IN 3D."
 *
 * ⚠ WHAT THIS FILE ESTABLISHES AND WHAT IT DOES NOT. The founder's gesture was NOT
 * reproduced headlessly. Measured 2026-08-19, five region shapes — a clean room, a side
 * split into two collinear walls, an L, a T-junction, and the 3D-tool payload shape —
 * ALL traced, resolved and triangulated correctly. The first case below pins that as a
 * property so the next reader inherits the measurement instead of the guess.
 *
 * So what follows are the SILENT PATHS THAT REACH THE SAME SYMPTOM, each measured on the
 * real code and each closed here. A slab that is in the store, drawn in plan and absent
 * from 3D previously had no channel that said why; every case below is one such channel.
 *
 * ⭐ Every assertion is about what a CONSUMER receives — the geometry a viewport would
 * draw, or the verdict a debugger would read — never a pure function's return value. A
 * ring that is correct while nothing renders is the exact defect being closed.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { traceRegionSketchAtPoint } from '../src/SlabRegionTracer';
import { SlabFragmentBuilder } from '../src/SlabFragmentBuilder';

function wall(id: string, x1: number, z1: number, x2: number, z2: number) {
    return { id, baseLine: [new THREE.Vector3(x1, 0, z1), new THREE.Vector3(x2, 0, z2)], thickness: 0.2 };
}
const ROOM = [wall('w1', 0, 0, 5, 0), wall('w2', 5, 0, 5, 4), wall('w3', 5, 4, 0, 4), wall('w4', 0, 4, 0, 0)];

function installWalls(walls: ReturnType<typeof wall>[]) {
    (globalThis as unknown as { window: Record<string, unknown> }).window.wallStore = {
        getById: (id: string) => walls.find(w => w.id === id),
        getAll: () => walls,
    };
}

function slabData(over: Record<string, unknown> = {}): never {
    return {
        id: 'slab-1', type: 'slab', levelId: 'L0', parentId: 'L0',
        position: { x: 0, y: 0, z: 0 },
        width: 5, depth: 4, thickness: 0.25, baseOffset: 0, properties: {},
        ifcData: { guid: 'g', ifcClass: 'IfcSlab' },
        ...over,
    } as never;
}

const SQUARE = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 4 }, { x: 0, y: 4 }];

const xzExtent = (mesh: THREE.Mesh) => {
    mesh.geometry.computeBoundingBox();
    const bb = mesh.geometry.boundingBox!;
    return { x: bb.max.x - bb.min.x, z: bb.max.z - bb.min.z };
};

describe('L-1121 — the region→3D chain', () => {
    beforeEach(() => installWalls(ROOM));

    it('traces cleanly and reaches a real extruded mesh (the property the probe measured)', () => {
        const traced = traceRegionSketchAtPoint(ROOM as never, 2.5, 2)!;
        expect(traced).toBeTruthy();
        const data = slabData({
            polygon: traced.ring.map(p => ({ x: p.x, y: p.y })),
            sketch: traced.sketch,
        });
        const { mesh } = SlabFragmentBuilder.createSlabMeshWithEdges(data);
        expect(mesh.geometry instanceof THREE.BoxGeometry).toBe(false);
        const e = xzExtent(mesh);
        expect(e.x).toBeGreaterThan(4.9);
        expect(e.z).toBeGreaterThan(3.9);
    });

    it('⭐ a slab whose SKETCH will not resolve is drawn on its STORED polygon — not on a box', () => {
        // A sketch that cannot resolve AND carries no fallback: every host is gone and
        // WallFaceResolver has nothing left, so `resolveLoop` returns null. Before
        // L-1121 this fell straight to BoxGeometry(width, t, depth) and threw the
        // authored polygon away — while plan view carried on drawing that same polygon.
        // Two views, two rings, and no channel that said they disagreed.
        installWalls([]);
        const deadSketch = {
            outerLoop: {
                edges: SQUARE.map((_p, i) => ({
                    type: 'hostReference', hostId: `gone-${i}`, hostType: 'wall',
                    reference: 'centerLine', offset: 0,
                })),
            },
        };
        const data = slabData({ polygon: SQUARE, sketch: deadSketch });
        const { mesh } = SlabFragmentBuilder.createSlabMeshWithEdges(data);

        expect(mesh.geometry instanceof THREE.BoxGeometry).toBe(false);
        const e = xzExtent(mesh);
        expect(e.x).toBeGreaterThan(4.9);
        expect(e.z).toBeGreaterThan(3.9);

        // And the degradation is REPORTED, never absorbed: the ladder names its rung.
        const choice = SlabFragmentBuilder.resolveBuildRing(data);
        expect(choice.source).toBe('polygon');
        expect(choice.note).toBeTruthy();
    });

    it('the pivot and the mesh answer "where is this slab?" from the SAME ring (C84 EI-9)', () => {
        // Before L-1121 the pivot read `data.polygon ?? sketch` and the mesh read
        // `sketch ?? data.polygon` — the exact inverse — so on a sketch-bearing slab the
        // gizmo and the geometry were derived from two different rings in one function.
        const traced = traceRegionSketchAtPoint(ROOM as never, 2.5, 2)!;
        const data = slabData({
            polygon: [{ x: 100, y: 100 }, { x: 101, y: 100 }, { x: 101, y: 101 }],
            sketch: traced.sketch,
        });
        const choice = SlabFragmentBuilder.resolveBuildRing(data);
        expect(choice.source).toBe('sketch');
        expect(SlabFragmentBuilder.resolveBuildRing(data).ring).toEqual(choice.ring);
    });

    it('a slab with NO usable ring and zero dimensions is reported INVISIBLE, not silently boxed', () => {
        const builder = new SlabFragmentBuilder(new THREE.Scene(), {
            getLevelById: () => ({ id: 'L0', elevation: 0 }),
        } as never);
        builder.updateSlab(slabData({ width: 0, depth: 0 }));
        const v = builder.getBuildVerdict('slab-1');
        expect(v?.state).toBe('invisible-zero-box');
        expect(v?.detail).toContain('works in plan but not in 3D');
    });

    it('a slab naming a level BimManager does not know is REPORTED, not merely thrown at a DOM listener', () => {
        const builder = new SlabFragmentBuilder(new THREE.Scene(), {
            getLevelById: () => undefined,
        } as never);
        expect(() => builder.updateSlab(slabData({ polygon: SQUARE })))
            .toThrow(/SpatialAuthorityError/);
        expect(builder.getBuildVerdict('slab-1')?.state).toBe('refused-level-unknown');
    });

    it('L-1123 — the builder PUBLISHES the model Y it wrote, so no view layer need cache it', () => {
        const builder = new SlabFragmentBuilder(new THREE.Scene(), {
            getLevelById: () => ({ id: 'L0', elevation: 3 }),
        } as never);
        builder.updateSlab(slabData({ polygon: SQUARE }));
        const root = builder.getRootById('slab-1')!;
        expect(root.userData.modelY).toBeCloseTo(3 - 0.25, 6);
        expect(root.position.y).toBeCloseTo(root.userData.modelY as number, 6);

        // A rebuild at a NEW thickness republishes. This is the number a cached baseline
        // used to contradict, stranding the element at its pre-edit height with nothing
        // left that knew where it belonged.
        builder.updateSlab(slabData({ polygon: SQUARE, thickness: 0.5 }));
        expect(builder.getRootById('slab-1')!.userData.modelY).toBeCloseTo(2.5, 6);
    });
});

describe('L-1122 — a re-entrant pause must not discard buffered builds', () => {
    it('keeps the buffer, so those slabs are still owed a mesh', () => {
        installWalls(ROOM);
        const builder = new SlabFragmentBuilder(new THREE.Scene(), {
            getLevelById: () => ({ id: 'L0', elevation: 0 }),
        } as never);
        builder.pause();
        builder.updateSlab(slabData({ id: 'slab-A', polygon: SQUARE }));
        expect(builder.getBuildVerdict('slab-A')?.state).toBe('buffered-paused');

        builder.pause();                       // ⛔ used to wipe _pausedBuilds outright
        builder.resumeAndFlush();

        // The record survived the second pause rather than being silently dropped into
        // the "in the store, drawn in plan, absent from 3D" state.
        expect(builder.getBuildVerdict('slab-A')).toBeDefined();
        expect(builder.isPaused()).toBe(false);
    });
});
