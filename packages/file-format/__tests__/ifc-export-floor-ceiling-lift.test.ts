// @vitest-environment happy-dom
/**
 * ifc-export-floor-ceiling-lift.test.ts
 *
 * §W4B-EXPORT (Wave 4b, 2026-08-31) — ACCEPTANCE for three families the
 * 2026-08-29 element-creation audit measured as "exports = NO":
 * `floor`, `ceiling`, `lift`.
 *
 * ⭐ WHY THIS DRIVES `FragmentReader` AND NOT THE READERS DIRECTLY.
 * The audit's whole point is that AUTHORED is not REACHABLE: `floor` had a
 * store, a handler, a mesh builder and a CEB case, and still did not export,
 * because nothing CALLED a reader for it. A test that constructed
 * `new FloorReader(...)` by hand would pass just as happily with the
 * FragmentReader wiring deleted — it would prove the class works and say
 * nothing about whether the exporter runs it. So every assertion below goes
 * through `new FragmentReader(stores, scene).read()`, which is the exact object
 * `ExportIFC.ts` builds on the live `export-ifc` path
 * (initUI.ts:997 → exportIFC → IfcExporter → FragmentReader).
 *
 * The stores are the REAL `FloorStore` / `CeilingStore` from
 * `@pryzm/core-app-model/stores`, not fakes: a fake built from the same header
 * as the reader cannot falsify the reader.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { FloorStore, CeilingStore } from '@pryzm/core-app-model/stores';
import type { FloorData, CeilingData } from '@pryzm/core-app-model/stores';
import { FragmentReader } from '../src/export/ifc/FragmentReader';

/** A mesh the way the panel builders leave it: id on the ROOT, geometry on a child. */
function meshFor(id: string, y: number): THREE.Object3D {
    const root = new THREE.Group();
    root.userData = { id, selectable: true };
    root.position.set(0, y, 0);
    const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(2, 0.05, 3),
        new THREE.MeshStandardMaterial({ color: 0x884422 }),
    );
    root.add(mesh);
    return root;
}

const SQUARE = [
    { x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }, { x: 0, z: 3 },
];

function floorFixture(id: string): FloorData {
    return {
        id,
        type: 'floor',
        levelId: 'L0',
        label: 'Floor ' + id,
        floorNumber: 'F.01',
        boundary: {
            polygon: SQUARE.map(p => ({ ...p })),
            baseOffset: 0,
            thickness: 0.05,
            detectionMethod: 'manual-polygon',
        },
        finishSpec: { finishColor: '#D4C4A8', finishPattern: 'none', exposedScreed: false },
        serviceHoles: [],
        coveredRoomIds: [],
        boundingWallIds: [],
        properties: { mark: 'FL-01' },
        visible: true,
    } as unknown as FloorData;
}

function ceilingFixture(id: string): CeilingData {
    return {
        id,
        type: 'ceiling',
        levelId: 'L0',
        label: 'Ceiling ' + id,
        ceilingNumber: 'C.01',
        boundary: {
            polygon: SQUARE.map(p => ({ ...p })),
            height: 2.7,
            thickness: 0.02,
            baseOffset: 0,
            detectionMethod: 'manual-polygon',
        },
        // CeilingStore.add validates through Zod and THROWS (FloorStore only warns),
        // so this fixture must satisfy CeilingFinishSpec exactly: CeilingTypes.ts:81-88.
        finishSpec: { soffitColor: '#FFFFFF', soffitPattern: 'none', exposedStructure: false },
        holeElements: [],
        coveredRoomIds: [],
        boundingWallIds: [],
        properties: { mark: 'CL-01' },
        visible: true,
        metadata: { createdAt: Date.now(), modifiedAt: Date.now(), createdBy: 'test', version: 1 },
    } as unknown as CeilingData;
}

/** Minimal real-shaped lift store — mirrors `LiftStore.getAll()`. */
function liftStoreWith(id: string) {
    const record = {
        id,
        levelId: 'L0',
        kind: 'passenger',
        properties: { mark: 'LF001' },
        ifcData: { guid: 'lift-guid-1', ifcClass: 'IfcTransportElement' },
    };
    return { getAll: () => [record] };
}

describe('§W4B — floor, ceiling and lift reach the IFC exporter', () => {
    it('FLOOR: FragmentReader emits an IfcCovering/FLOORING element', () => {
        const scene = new THREE.Scene();
        scene.add(meshFor('floor-1', 0));

        const store = new FloorStore();
        store.add(floorFixture('floor-1'));

        const model = new FragmentReader({ floorStore: store }, { scene }).read();
        const floor = model.elements.find(e => e.id === 'floor-1');

        expect(floor, 'floor-1 must reach IntermediateModel.elements').toBeDefined();
        expect(floor!.ifcClass).toBe('IfcCovering');
        expect(floor!.predefinedType).toBe('FLOORING');
        expect(floor!.levelId).toBe('L0');
        expect(floor!.geometry).toBeTruthy();
        expect(floor!.geometry!.vertices.length).toBeGreaterThan(0);
    });

    it('CEILING: FragmentReader emits an IfcCovering/CEILING element', () => {
        const scene = new THREE.Scene();
        scene.add(meshFor('ceil-1', 2.7));

        const store = new CeilingStore();
        store.add(ceilingFixture('ceil-1'));

        const model = new FragmentReader({ ceilingStore: store }, { scene }).read();
        const ceiling = model.elements.find(e => e.id === 'ceil-1');

        expect(ceiling, 'ceil-1 must reach IntermediateModel.elements').toBeDefined();
        expect(ceiling!.ifcClass).toBe('IfcCovering');
        expect(ceiling!.predefinedType).toBe('CEILING');
        expect(ceiling!.geometry!.vertices.length).toBeGreaterThan(0);
    });

    it('⭐ FLOOR and CEILING are DISTINGUISHABLE in one file — same entity, different PredefinedType', () => {
        const scene = new THREE.Scene();
        scene.add(meshFor('floor-1', 0));
        scene.add(meshFor('ceil-1', 2.7));

        const floorStore = new FloorStore();
        floorStore.add(floorFixture('floor-1'));
        const ceilingStore = new CeilingStore();
        ceilingStore.add(ceilingFixture('ceil-1'));

        const model = new FragmentReader({ floorStore, ceilingStore }, { scene }).read();
        const byId = new Map(model.elements.map(e => [e.id, e]));

        // Both are IfcCovering — so if PredefinedType were dropped, a consultant
        // could not tell the floor finish from the ceiling. That is the whole
        // reason this pair is asserted together rather than in two tests.
        expect(byId.get('floor-1')!.ifcClass).toBe(byId.get('ceil-1')!.ifcClass);
        expect(byId.get('floor-1')!.predefinedType).toBe('FLOORING');
        expect(byId.get('ceil-1')!.predefinedType).toBe('CEILING');
    });

    it('LIFT: FragmentReader emits an IfcTransportElement/ELEVATOR element', () => {
        const scene = new THREE.Scene();
        scene.add(meshFor('lift-1', 0));

        const model = new FragmentReader(
            { liftStore: liftStoreWith('lift-1') }, { scene },
        ).read();
        const lift = model.elements.find(e => e.id === 'lift-1');

        expect(lift, 'lift-1 must reach IntermediateModel.elements').toBeDefined();
        expect(lift!.ifcClass).toBe('IfcTransportElement');
        expect(lift!.predefinedType).toBe('ELEVATOR');
        expect(lift!.name).toBe('LF001');
        expect(lift!.guid).toBe('lift-guid-1');
    });

    it('⭐ CONTROL — the assertions above cannot pass on an empty scene', () => {
        // Without this, every test above would also pass against a reader that
        // returned a hard-coded element. A store with a record but NO mesh must
        // yield nothing: findMesh is what makes the element real.
        const store = new FloorStore();
        store.add(floorFixture('floor-1'));

        const model = new FragmentReader({ floorStore: store }, { scene: new THREE.Scene() }).read();
        expect(model.elements.find(e => e.id === 'floor-1')).toBeUndefined();
    });

    it('⭐ CONTROL — an unsupplied store contributes nothing (the pre-fix state)', () => {
        // This is exactly what HEAD did before this lane: the reader existed
        // nowhere and the key was absent, so the element vanished in silence.
        const scene = new THREE.Scene();
        scene.add(meshFor('floor-1', 0));
        const model = new FragmentReader({}, { scene }).read();
        expect(model.elements).toHaveLength(0);
    });
});
