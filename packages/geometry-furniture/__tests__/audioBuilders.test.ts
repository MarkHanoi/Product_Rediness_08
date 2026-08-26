/**
 * §MEDIA111 (founder, 2026-08-26) — soundbar + floor-speaker pair.
 *
 * Pinned here (the §DESK108 discipline):
 *   • both build without throwing;
 *   • lowest point ON the floor (y = 0, never below); tops out at data.height;
 *   • deterministic — two builds are geometry-identical;
 *   • every material comes from the MaterialService cache (C100 §2.1);
 *   • mesh budget pinned: soundbar 2, speaker pair 3 — one mesh per material
 *     group; triangle budget pinned so the report numbers are measured;
 *   • THE PARAMETRIC RULE on built geometry: the stereo SPAN scales with
 *     data.width while the TOWER stays 220 mm + 20 mm plinth overhang; the
 *     soundbar stretches while its 25 mm end caps stay 25 mm.
 */
import * as THREE from '@pryzm/renderer-three/three';
import { describe, it, expect, beforeEach } from 'vitest';
import { MaterialService } from '../src/MaterialService';
import type { FurnitureData, FurnitureType } from '../src/FurnitureTypes';
import { SoundbarBuilder, FloorSpeakerPairBuilder } from '../src/builders/AudioBuilders';
import type { IFurnitureBuilder } from '../src/builders/IFurnitureBuilder';

const audioData = (over: Partial<FurnitureData> = {}): FurnitureData => ({
    id: 'audio-1', type: 'furniture', furnitureType: 'soundbar' as FurnitureType,
    position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, order: 'XYZ' },
    levelId: 'L0', levelName: 'L0', levelElevation: 0, baseOffset: 0,
    width: 0.9, length: 0.1, height: 0.12,
    material: 'fabric', properties: {},
    ...over,
} as FurnitureData);

interface AudioCase {
    name: string;
    make: (ms: MaterialService) => IFurnitureBuilder;
    data: FurnitureData;
    meshBudget: number;
    triBudget: number;
    variant: string;
}

const CASES: AudioCase[] = [
    {
        name: 'soundbar',
        make: (ms) => new SoundbarBuilder(ms),
        data: audioData(),
        meshBudget: 2, triBudget: 48, variant: 'soundbar',
    },
    {
        name: 'speaker_floor_pair',
        make: (ms) => new FloorSpeakerPairBuilder(ms),
        data: audioData({
            furnitureType: 'speaker_floor_pair' as FurnitureType,
            width: 2.4, length: 0.32, height: 1.05,
        }),
        meshBudget: 3, triBudget: 96, variant: 'speaker_pair',
    },
];

const meshes = (g: THREE.Group): THREE.Mesh[] => {
    const out: THREE.Mesh[] = [];
    g.traverse((o) => { if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh); });
    return out;
};

const meshByRole = (g: THREE.Group, role: string): THREE.Mesh => {
    const m = meshes(g).find((x) => x.userData['role'] === role);
    if (!m) throw new Error(`no mesh with role '${role}'`);
    return m;
};

const triangles = (g: THREE.Group): number =>
    meshes(g).reduce((n, m) => {
        const idx = m.geometry.getIndex();
        const verts = idx ? idx.count : m.geometry.getAttribute('position').count;
        return n + verts / 3;
    }, 0);

/** Concatenated position data of every mesh — the determinism fingerprint. */
const fingerprint = (g: THREE.Group): number[] =>
    meshes(g).flatMap((m) => Array.from(m.geometry.getAttribute('position').array as Float32Array));

describe('§MEDIA111 — audio pieces build, sit on the floor, top out at height', () => {
    let ms: MaterialService;
    beforeEach(() => { ms = new MaterialService(); });

    it.each(CASES)('$name: builds without throwing', ({ make, data }) => {
        expect(() => make(ms).build(data)).not.toThrow();
    });

    it.each(CASES)('$name: lowest point ON the floor, tops out at data.height', ({ make, data }) => {
        const g = make(ms).build(data);
        const box = new THREE.Box3().setFromObject(g);
        expect(box.min.y).toBeGreaterThanOrEqual(-1e-6);
        expect(box.min.y).toBeLessThan(0.01);
        // Soundbar caps stand 3 mm proud of the bar top by design.
        const expectedTop = data.furnitureType === 'soundbar' ? data.height + 0.003 : data.height;
        expect(box.max.y).toBeCloseTo(expectedTop, 3);
    });

    it.each(CASES)('$name: deterministic — two builds are geometry-identical', ({ make, data }) => {
        const a = fingerprint(make(ms).build(data));
        const b = fingerprint(make(ms).build(data));
        expect(a).toEqual(b);
    });

    it.each(CASES)('$name: every material comes from the MaterialService cache', ({ make, data }) => {
        const g = make(ms).build(data);
        for (const m of meshes(g)) {
            expect(ms.isCachedMaterial(m.material as THREE.Material)).toBe(true);
        }
    });

    it.each(CASES)('$name: mesh + triangle budgets pinned', ({ make, data, meshBudget, triBudget, variant }) => {
        const g = make(ms).build(data);
        expect(meshes(g)).toHaveLength(meshBudget);
        expect(triangles(g)).toBe(triBudget);
        expect(g.userData['role']).toBe('audio');
        expect(g.userData['variant']).toBe(variant);
    });
});

describe('§MEDIA111 — resize scales the LAYOUT, never the MEMBERS', () => {
    const ms = new MaterialService();

    it('speaker pair: data.width is the stereo span — plinth edges land on ±width/2', () => {
        for (const w of [2.4, 3.6]) {
            const g = new FloorSpeakerPairBuilder(ms).build(
                audioData({ furnitureType: 'speaker_floor_pair' as FurnitureType, width: w, length: 0.32, height: 1.05 }));
            const box = new THREE.Box3().setFromObject(g);
            expect(box.max.x - box.min.x).toBeCloseTo(w, 6);
        }
    });

    it('speaker pair: the tower keeps its 240 mm plinth footprint while the span stretches 1.5×', () => {
        const leftTowerWidth = (w: number): number => {
            const g = new FloorSpeakerPairBuilder(ms).build(
                audioData({ furnitureType: 'speaker_floor_pair' as FurnitureType, width: w, length: 0.32, height: 1.05 }));
            const pos = meshByRole(g, 'cabinets').geometry.getAttribute('position');
            let min = Infinity, max = -Infinity;
            for (let i = 0; i < pos.count; i++) {
                const x = pos.getX(i);
                if (x < 0) { min = Math.min(min, x); max = Math.max(max, x); }
            }
            return max - min;
        };
        // Tower + plinth overhang = 0.220 + 2×0.010 — the member does not scale.
        expect(leftTowerWidth(2.4)).toBeCloseTo(0.240, 6);
        expect(leftTowerWidth(3.6)).toBeCloseTo(0.240, 6);
    });

    it('soundbar: the bar stretches while the 25 mm end caps stay 25 mm', () => {
        const capWidth = (w: number): number => {
            const g = new SoundbarBuilder(ms).build(audioData({ width: w }));
            // The caps are the only body vertices proud of the bar in Z; measure
            // the left cap's X extent among vertices at z > barHalf.
            const pos = meshByRole(g, 'body').geometry.getAttribute('position');
            const zProud = 0.1 / 2 + 0.001;
            let min = Infinity, max = -Infinity;
            for (let i = 0; i < pos.count; i++) {
                if (pos.getZ(i) > zProud && pos.getX(i) < 0) {
                    min = Math.min(min, pos.getX(i));
                    max = Math.max(max, pos.getX(i));
                }
            }
            return max - min;
        };
        expect(capWidth(0.9)).toBeCloseTo(0.025, 6);
        expect(capWidth(1.35)).toBeCloseTo(0.025, 6);
        const span = (w: number): number => {
            const g = new SoundbarBuilder(ms).build(audioData({ width: w }));
            const box = new THREE.Box3().setFromObject(g);
            return box.max.x - box.min.x;
        };
        expect(span(1.35) / span(0.9)).toBeCloseTo(1.5, 6);
    });

    it('speaker pair: grilles sit PROUD of the cabinet front face', () => {
        const g = new FloorSpeakerPairBuilder(ms).build(
            audioData({ furnitureType: 'speaker_floor_pair' as FurnitureType, width: 2.4, length: 0.32, height: 1.05 }));
        const grille  = new THREE.Box3().setFromObject(meshByRole(g, 'grilles'));
        expect(grille.max.z).toBeGreaterThan(0.32 / 2);
    });
});
