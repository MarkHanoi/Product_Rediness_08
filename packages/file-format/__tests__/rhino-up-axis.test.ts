// §RHINO-ZUP-YUP (L-816) — Rhino .3dm import up-axis conversion.
//
// Rhino authors geometry Z-up; three's Rhino3dmLoader performs NO axis
// conversion, so the importer must rotate the root group −90° about X at the
// import boundary: (x, y, z)_rhino → (x, z, −y)_three. This matches the DXF
// importer's per-vertex convention (DxfGeometryBuilder: DXF Y → -THREE.Z).
//
// Also covers §RHINO-LAYER-CONTROL (L-816): extractRhinoLayers reads the
// loader's raw layer table off root userData and counts objects per
// userData.attributes.layerIndex.

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';

import { applyRhinoUpAxisConversion, extractRhinoLayers } from '../src/import/rhino/RhinoImporter';

describe('§RHINO-ZUP-YUP (L-816) — Rhino Z-up → THREE Y-up', () => {
    it('maps a Rhino Z-up point to THREE Y-up world space: (x, y, z) → (x, z, -y)', () => {
        const group = new THREE.Group();
        // A "flagpole tip" 10 units up in Rhino (Z-up) at plan position (3, 4).
        const tip = new THREE.Object3D();
        tip.position.set(3, 4, 10);
        group.add(tip);

        applyRhinoUpAxisConversion(group);

        const world = tip.getWorldPosition(new THREE.Vector3());
        // Up (Rhino +Z) must become THREE +Y; Rhino plan +Y must become THREE −Z.
        expect(world.x).toBeCloseTo(3, 10);
        expect(world.y).toBeCloseTo(10, 10);
        expect(world.z).toBeCloseTo(-4, 10);
    });

    it('keeps the model upright: a Rhino vertical extrusion spans THREE Y, not Z', () => {
        const group = new THREE.Group();
        const base = new THREE.Object3D();
        base.position.set(0, 0, 0);
        const top = new THREE.Object3D();
        top.position.set(0, 0, 30); // 30 units tall in Rhino Z
        group.add(base, top);

        applyRhinoUpAxisConversion(group);

        const b = base.getWorldPosition(new THREE.Vector3());
        const t = top.getWorldPosition(new THREE.Vector3());
        expect(t.y - b.y).toBeCloseTo(30, 10); // height is along THREE Y (up)
        expect(t.z - b.z).toBeCloseTo(0, 10);  // no lying-on-its-side residue
    });

    it('applies the conversion to the ROOT only and tags it (re-export can strip it)', () => {
        const group = new THREE.Group();
        const child = new THREE.Object3D();
        group.add(child);

        applyRhinoUpAxisConversion(group);

        expect(group.rotation.x).toBeCloseTo(-Math.PI / 2, 12);
        expect(child.rotation.x).toBe(0); // children keep raw Rhino transforms
        expect(group.userData.upAxisConverted).toBe('rhino-z-up-to-three-y-up');
    });
});

describe('§RHINO-LAYER-CONTROL (L-816) — layer table extraction', () => {
    function makeGroupWithLayers(): THREE.Group {
        const group = new THREE.Group();
        // Shape mirrors three's Rhino3dmLoader output: raw layer table on root
        // userData, per-object attributes.layerIndex on each child.
        group.userData.layers = [
            { name: 'Walls',  fullPath: 'Building::Walls', visible: true },
            { name: 'Hidden', fullPath: 'Hidden',          visible: false },
            { name: '',       visible: true }, // nameless layer → fallback name
        ];
        const mk = (layerIndex: number) => {
            const o = new THREE.Object3D();
            o.userData.attributes = { layerIndex };
            return o;
        };
        group.add(mk(0), mk(0), mk(1));
        return group;
    }

    it('reads name, fullPath, file visibility flag, and per-layer object counts', () => {
        const layers = extractRhinoLayers(makeGroupWithLayers());
        expect(layers).toHaveLength(3);

        expect(layers[0]).toMatchObject({ index: 0, name: 'Walls', fullPath: 'Building::Walls', visible: true, objectCount: 2 });
        expect(layers[1]).toMatchObject({ index: 1, name: 'Hidden', visible: false, objectCount: 1 });
        expect(layers[2].name).toBe('Layer 2');
        expect(layers[2].objectCount).toBe(0);
    });

    it('returns [] when the loader supplied no layer table', () => {
        expect(extractRhinoLayers(new THREE.Group())).toEqual([]);
    });
});
