// §FIX-FURNITURE-BASE-OFFSET (L-86) — the mount base-offset must be a first-class
// field on the furniture DTO AND be HONOURED by the builder, defaulting to 0
// (floor-standing) — NOT the old 0.2 that floated every offset-less item 200 mm.
//
// This is a builder/geometry test (THREE, no command layer): it drives
// FurnitureFragmentBuilder.updateFurniture directly and asserts the group root's
// world Y = position.y (the FFL datum handed in by CreateFurnitureCommand) +
// baseOffset, i.e. the offset is applied EXACTLY once and defaults to 0.

import * as THREE from '@pryzm/renderer-three/three';
import { describe, expect, it } from 'vitest';
import { FurnitureFragmentBuilder } from '../src/FurnitureFragmentBuilder';
import { furnitureWorldY } from '../src/furnitureElevation';
import type { FurnitureData } from '../src/FurnitureTypes';

const base = (over: Partial<FurnitureData> = {}): FurnitureData => ({
    id: 'fu-off', type: 'furniture', furnitureType: 'chair',
    position: { x: 1, y: 3, z: 2 }, rotation: { x: 0, y: 0, z: 0, order: 'XYZ' },
    levelId: 'L0', levelName: 'L0', levelElevation: 3, baseOffset: 0,
    width: 0.5, length: 0.5, height: 0.9,
    material: 'wood', properties: {},
    ...over,
});

describe('§FIX-FURNITURE-BASE-OFFSET — base-offset field + builder application', () => {
    it('the DTO carries a numeric baseOffset field', () => {
        const d = base({ baseOffset: 0.42 });
        expect(typeof d.baseOffset).toBe('number');
        expect(d.baseOffset).toBe(0.42);
    });

    it('furnitureWorldY applies the mount offset exactly once (worldY = floorY + offset)', () => {
        expect(furnitureWorldY(3, 0)).toBe(3);        // floor-standing
        expect(furnitureWorldY(3, 1.2)).toBeCloseTo(4.2, 9); // wall-mounted
    });

    it('builder honours baseOffset — root Y = position.y + baseOffset', () => {
        const scene = new THREE.Scene();
        const fb = new FurnitureFragmentBuilder(scene);
        fb.updateFurniture(base({ id: 'fu-a', baseOffset: 0.75 }));
        const root = scene.children.find(o => (o.userData as any)?.id === 'fu-a');
        expect(root).toBeTruthy();
        // position.y (3) is the FFL datum from the command; +0.75 mount offset.
        expect(root!.position.y).toBeCloseTo(3.75, 6);
    });

    it('builder defaults an ABSENT baseOffset to 0 (floor-standing) — never 0.2', () => {
        const scene = new THREE.Scene();
        const fb = new FurnitureFragmentBuilder(scene);
        // Force the undefined path (loose/legacy data) — the ?? default must be 0.
        const d = base({ id: 'fu-b' });
        delete (d as { baseOffset?: number }).baseOffset;
        fb.updateFurniture(d);
        const root = scene.children.find(o => (o.userData as any)?.id === 'fu-b');
        expect(root).toBeTruthy();
        expect(root!.position.y).toBeCloseTo(3, 6); // == floor datum, NOT 3.2
        expect((root!.userData as any).baseOffset).toBe(0);
    });
});
