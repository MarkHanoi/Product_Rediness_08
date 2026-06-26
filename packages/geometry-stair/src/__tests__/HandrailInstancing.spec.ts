/**
 * HandrailFragmentBuilder GPU-instancing tests — ADR-0076 Axis 3
 * (§PERF-WEBGPU-FRAGMENT / §PERF-RAIL-INSTANCING).
 *
 * Mirrors the beam/column instanced-path contract. Proves:
 *   (a) flag OFF → balusters + posts stay on the FRAGMENT path (bridge untouched,
 *       real baluster/post meshes present in the root group);
 *   (b) flag ON  → every repeated baluster + post registers via the bridge with
 *       centre/size matching the fragment geometry EXACTLY (8-corner assertion),
 *       and the single top-rail member stays a fragment;
 *   (c) remove() / a rebuild releases EVERY instance slot the handrail allocated.
 *
 * Pure node vitest (THREE works headless — see core-app-model + beam tests).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { ElementInstanceBridge } from '@pryzm/core-app-model/rendering';
import type { HandrailData } from '@pryzm/core-app-model/stores';
import { HandrailFragmentBuilder } from '../HandrailFragmentBuilder';

const g = globalThis as { __pryzmElementInstancingV1?: boolean };

/** Spy bridge: records register/unregister + an O(1) live-id set, no real renderer. */
class SpyBridge {
    registers: Array<{ id: string; levelId: string; type: string; transform: any; kind: string }> = [];
    unregisters: string[] = [];
    private _live = new Set<string>();
    register(id: string, levelId: string, type: string, transform: any, _mat: unknown, kind: string): void {
        this.registers.push({ id, levelId, type, transform, kind });
        this._live.add(id);
    }
    unregister(id: string): void { this.unregisters.push(id); this._live.delete(id); }
    updateTransform(): void {}
    isInstanced(id: string): boolean { return this._live.has(id); }
}

/** Minimal BimManager stub — only getLevelById is used by the builder. */
const stubBim = { getLevelById: (_id: string) => ({ elevation: 0 }) } as any;

// Unique handrail id per test → the shared elementRegistry singleton (which throws
// on duplicate registerSemantic) never collides across the suite.
let _railSeq = 0;
let _currentRailId = 'rail-0';

function makeHandrail(over: Partial<HandrailData> = {}): HandrailData {
    return {
        id: _currentRailId,
        type: 'handrail' as any,
        levelId: 'level-1',
        baseLine: [{ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }], // 2m along +X
        height: 1.0,
        thickness: 0.05,
        baseOffset: 0,
        materialColor: '#888888',
        fillType: 'baluster',
        balusterSpacing: 0.5,    // length 2 / 0.5 → count = floor(4) - 1 = 3 balusters
        balusterShape: 'rectangular',
        balusterWidth: 0.02,
        postSpacing: 1.0,        // intermediate posts: floor(2/1)-1 = 1
        ...over,
    } as HandrailData;
}

/** Count real baluster/post meshes (role 'geometry', excludes the top rail). */
function countRepeatedMeshes(scene: THREE.Scene): number {
    let n = 0;
    scene.traverse(o => {
        if ((o as THREE.Mesh).isMesh && (o.userData as any)?.role === 'geometry') n++;
    });
    // subtract 1 for the single top-rail member (also role 'geometry').
    return Math.max(0, n - 1);
}

describe('HandrailFragmentBuilder §PERF-RAIL-INSTANCING (ADR-0076 Axis 3)', () => {
    let scene: THREE.Scene;
    let builder: HandrailFragmentBuilder;
    let spy: SpyBridge;

    beforeEach(() => {
        _currentRailId = `rail-${_railSeq++}`;
        scene = new THREE.Scene();
        builder = new HandrailFragmentBuilder(scene, stubBim);
        spy = new SpyBridge();
        builder.setInstanceBridge(spy as unknown as ElementInstanceBridge);
    });

    afterEach(() => { delete g.__pryzmElementInstancingV1; });

    // ── (a) flag OFF → fragment path, bridge untouched ────────────────────────
    describe('(a) flag OFF keeps balusters + posts on the FRAGMENT path', () => {
        it('does not register anything on the bridge and builds real meshes', () => {
            builder.updateHandrail(makeHandrail());
            expect(spy.registers).toHaveLength(0);
            // 3 balusters + 2 end posts + 1 intermediate post = 6 repeated meshes.
            expect(countRepeatedMeshes(scene)).toBe(6);
        });

        it('stays on fragment path when flag explicitly false', () => {
            g.__pryzmElementInstancingV1 = false;
            builder.updateHandrail(makeHandrail());
            expect(spy.registers).toHaveLength(0);
        });
    });

    // ── (b) flag ON → instanced with matching geometry ────────────────────────
    describe('(b) flag ON: balusters + posts register via the bridge', () => {
        beforeEach(() => { g.__pryzmElementInstancingV1 = true; });

        it('registers 3 balusters + 3 posts, elementType "Handrail", correct level', () => {
            builder.updateHandrail(makeHandrail());
            const bals = spy.registers.filter(r => r.id.includes('#bal-'));
            const posts = spy.registers.filter(r => r.id.includes('#post-'));
            expect(bals).toHaveLength(3);
            expect(posts).toHaveLength(3); // start + end + 1 intermediate
            for (const r of spy.registers) {
                expect(r.type).toBe('Handrail');
                expect(r.levelId).toBe('level-1');
            }
            // No real baluster/post meshes left in the scene (only the top rail).
            expect(countRepeatedMeshes(scene)).toBe(0);
        });

        it('baluster instance centre/size matches the fragment BoxGeometry world transform', () => {
            // Rotated baseline so a wrong rotationY/centre would shift the corners.
            const rail = makeHandrail({
                baseLine: [{ x: 1, y: 0, z: 1 }, { x: 4, y: 0, z: 3 }], // bearing atan2(2,3)
            });
            builder.updateHandrail(rail);
            const bal = spy.registers.find(r => r.id === `${_currentRailId}#bal-1`)!;
            expect(bal.kind).toBe('box');
            const { centre, rotationY, size } = bal.transform;

            // Rebuild the fragment world matrix independently: a BoxGeometry placed at
            // local (lx, bHeight/2, 0) in a group at (start.x, worldY, start.z) rotated
            // -angle about Y. angle = atan2(dz, dx).
            const start = new THREE.Vector3(1, 0, 1);
            const end = new THREE.Vector3(4, 0, 3);
            const dx = end.x - start.x, dz = end.z - start.z;
            const length = Math.hypot(dx, dz);
            const angle = Math.atan2(dz, dx);
            const balusterSpacing = 0.5;
            const bHeight = 1.0 - 0.05;
            const bWidth = 0.02;
            const lx = 1 * balusterSpacing;

            const grp = new THREE.Group();
            grp.position.set(start.x, 0, start.z);
            grp.rotation.y = -angle;
            const fragGeo = new THREE.BoxGeometry(bWidth, bHeight, bWidth);
            const fragMesh = new THREE.Mesh(fragGeo);
            fragMesh.position.set(lx, bHeight / 2, 0);
            grp.add(fragMesh);
            grp.updateMatrixWorld(true);
            const fragM = fragMesh.matrixWorld.clone();

            // Instance world matrix = translate(centre)·rotateY·scale(size) on a unit box.
            const instM = new THREE.Matrix4()
                .makeTranslation(centre.x, centre.y, centre.z)
                .multiply(new THREE.Matrix4().makeRotationY(rotationY))
                .multiply(new THREE.Matrix4().makeScale(size.x, size.y, size.z));

            // Compare all 8 box corners (unit box ±0.5 → fragment uses geo half-extents).
            for (const sx of [-0.5, 0.5]) for (const sy of [-0.5, 0.5]) for (const sz of [-0.5, 0.5]) {
                const a = new THREE.Vector3(sx, sy, sz).applyMatrix4(instM);
                const b = new THREE.Vector3(sx * bWidth, sy * bHeight, sz * bWidth).applyMatrix4(fragM);
                expect(a.distanceTo(b)).toBeLessThan(1e-9);
            }
            void length;
        });

        it('post instance centre/size matches the fragment CylinderGeometry world transform', () => {
            builder.updateHandrail(makeHandrail()); // baseline +X, start post at lx=0
            const post = spy.registers.find(r => r.id === `${_currentRailId}#post-start`)!;
            expect(post.kind).toBe('cylinder');
            const { centre, size } = post.transform;
            // Start post is at baseline start (0,0,0), centre at half-height.
            expect(centre.x).toBeCloseTo(0, 9);
            expect(centre.y).toBeCloseTo(0.5, 9);   // worldY 0 + postHeight/2
            expect(centre.z).toBeCloseTo(0, 9);
            expect(size.x).toBeCloseTo(0.04, 9);     // radius 0.02 → diameter
            expect(size.y).toBeCloseTo(1.0, 9);      // postHeight = handrail.height
            expect(size.z).toBeCloseTo(0.04, 9);
        });

        it('the single top rail stays a fragment mesh (not instanced)', () => {
            builder.updateHandrail(makeHandrail());
            // Exactly one role:'geometry' mesh remains — the top rail.
            let geomMeshes = 0;
            scene.traverse(o => {
                if ((o as THREE.Mesh).isMesh && (o.userData as any)?.role === 'geometry') geomMeshes++;
            });
            expect(geomMeshes).toBe(1);
        });
    });

    // ── (c) slot release on delete + rebuild ──────────────────────────────────
    describe('(c) instance slots released on delete / rebuild', () => {
        beforeEach(() => { g.__pryzmElementInstancingV1 = true; });

        it('removeHandrail unregisters every instance the handrail allocated', () => {
            builder.updateHandrail(makeHandrail());
            const allIds = spy.registers.map(r => r.id);
            expect(allIds.length).toBe(6);
            for (const id of allIds) expect(spy.isInstanced(id)).toBe(true);

            builder.removeHandrail(_currentRailId);
            for (const id of allIds) expect(spy.isInstanced(id)).toBe(false);
            expect(spy.unregisters.sort()).toEqual([...allIds].sort());
        });

        it('a rebuild releases the prior instance set before re-registering', () => {
            builder.updateHandrail(makeHandrail());
            const firstIds = spy.registers.map(r => r.id);
            spy.registers.length = 0;

            // Rebuild with FEWER balusters (wider spacing) — stale slots must drop.
            builder.updateHandrail(makeHandrail({ balusterSpacing: 1.0 })); // count floor(2)-1 = 1
            // Every previously-registered id was unregistered.
            for (const id of firstIds) expect(spy.unregisters).toContain(id);
        });
    });
});
