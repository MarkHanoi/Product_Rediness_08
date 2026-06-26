/**
 * BeamFragmentBuilder GPU-instancing tests — ADR-0076 Axis 3
 * (§PERF-WEBGPU-FRAGMENT / §PERF-BEAM-INSTANCING).
 *
 * Mirrors the column instanced-path contract. Proves:
 *   (a) flag OFF → the beam stays on the FRAGMENT path (bridge never called);
 *   (b) flag ON + simple concrete rectangular beam → registers via the bridge
 *       with centre/rotationY/size matching the fragment BoxGeometry EXACTLY;
 *   (c) a steel-profile beam stays on the fragment path even with the flag ON;
 *   (d) unregister on delete and on ineligibility (steel) releases the slot.
 *
 * THREE works under node vitest (see core-app-model ElementInstanceBridge.test.ts).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { ElementInstanceBridge } from '@pryzm/core-app-model/rendering';
import { BeamFragmentBuilder } from '../src/BeamFragmentBuilder';
import type { BeamData } from '@pryzm/core-app-model/stores';

const g = globalThis as { __pryzmElementInstancingV1?: boolean };

/** A spy bridge that records register/unregister calls without a real renderer. */
class SpyBridge {
    registers: Array<{ id: string; levelId: string; type: string; transform: any; kind: string }> = [];
    unregisters: string[] = [];
    private _live = new Set<string>();

    register(id: string, levelId: string, type: string, transform: any, _mat: unknown, kind: string): void {
        this.registers.push({ id, levelId, type, transform, kind });
        this._live.add(id);
    }
    unregister(id: string): void {
        this.unregisters.push(id);
        this._live.delete(id);
    }
    updateTransform(): void {}
    isInstanced(id: string): boolean {
        return this._live.has(id);
    }
}

function makeBeam(over: Partial<BeamData> = {}): BeamData {
    return {
        id: 'beam-1',
        levelId: 'level-1',
        startPoint: { x: 0, y: 3, z: 0 },
        endPoint: { x: 4, y: 3, z: 0 },
        width: 0.3,
        depth: 0.5,
        loadBearing: true,
        sectionType: 'rectangular',
        properties: {},
        ...over,
    };
}

describe('BeamFragmentBuilder §PERF-BEAM-INSTANCING (ADR-0076 Axis 3)', () => {
    let scene: THREE.Scene;
    let builder: BeamFragmentBuilder;
    let spy: SpyBridge;

    beforeEach(() => {
        scene = new THREE.Scene();
        builder = new BeamFragmentBuilder(scene);
        spy = new SpyBridge();
        builder.setInstanceBridge(spy as unknown as ElementInstanceBridge);
    });

    afterEach(() => {
        delete g.__pryzmElementInstancingV1;
        vi.restoreAllMocks();
    });

    // ── (a) flag OFF → fragment path, bridge never touched ────────────────────
    describe('(a) flag OFF keeps the beam on the FRAGMENT path', () => {
        it('does not register the beam on the bridge and renders a real Mesh', () => {
            // flag undefined (default) — bridge is injected but must be inert.
            const root = builder.build(makeBeam());

            expect(spy.registers).toHaveLength(0);
            expect((root.userData as any).isInstancedProxy).toBeUndefined();
            // Fragment path returns a THREE.Mesh (the box), not an empty Group.
            expect((root as THREE.Mesh).isMesh).toBe(true);
        });

        it('stays on fragment path when flag is explicitly false', () => {
            g.__pryzmElementInstancingV1 = false;
            builder.build(makeBeam());
            expect(spy.registers).toHaveLength(0);
        });
    });

    // ── (b) flag ON + simple concrete beam → instanced, matching geometry ─────
    describe('(b) flag ON: simple concrete beam registers via the bridge', () => {
        beforeEach(() => {
            g.__pryzmElementInstancingV1 = true;
        });

        it('registers with elementType "beam", kind "box", correct level', () => {
            builder.build(makeBeam());
            expect(spy.registers).toHaveLength(1);
            const r = spy.registers[0];
            expect(r.id).toBe('beam-1');
            expect(r.levelId).toBe('level-1');
            expect(r.type).toBe('beam');
            expect(r.kind).toBe('box');
        });

        it('centre = midpoint, size = (width, depth, length)', () => {
            builder.build(makeBeam()); // (0,3,0)→(4,3,0), w0.3 d0.5
            const { centre, size } = spy.registers[0].transform;
            expect(centre.x).toBeCloseTo(2, 9);
            expect(centre.y).toBeCloseTo(3, 9);
            expect(centre.z).toBeCloseTo(0, 9);
            expect(size.x).toBeCloseTo(0.3, 9);  // width  → local X
            expect(size.y).toBeCloseTo(0.5, 9);  // depth  → local Y
            expect(size.z).toBeCloseTo(4, 9);    // length → local Z
        });

        it('rotationY = atan2(dx, dz): X-axis beam → π/2, Z-axis beam → 0', () => {
            // X-running beam: dir = +X. rotateY must map local +Z to +X → θ=π/2.
            builder.build(makeBeam({ startPoint: { x: 0, y: 3, z: 0 }, endPoint: { x: 5, y: 3, z: 0 } }));
            expect(spy.registers.at(-1)!.transform.rotationY).toBeCloseTo(Math.PI / 2, 9);

            // Z-running beam: dir = +Z. rotateY must map local +Z to +Z → θ=0.
            builder.build(makeBeam({ id: 'beam-z', startPoint: { x: 0, y: 3, z: 0 }, endPoint: { x: 0, y: 3, z: 6 } }));
            expect(spy.registers.at(-1)!.transform.rotationY).toBeCloseTo(0, 9);
        });

        it('instance matrix matches the FRAGMENT BoxGeometry world transform exactly', () => {
            // Build the FRAGMENT geometry independently and compare a sampled
            // corner. This is the verification that a wrong rotationY would fail.
            const beam = makeBeam({
                id: 'beam-diag',
                startPoint: { x: 1, y: 3, z: 1 },
                endPoint: { x: 5, y: 3, z: 4 }, // horizontal, bearing atan2(4,3)
            });
            builder.build(beam);
            const { centre, rotationY, size } = spy.registers.at(-1)!.transform;

            // Instance world matrix = translate(centre) · rotateY · scale(size),
            // applied to a UNIT box (corner local = ±0.5).
            const instanceM = new THREE.Matrix4()
                .makeTranslation(centre.x, centre.y, centre.z)
                .multiply(new THREE.Matrix4().makeRotationY(rotationY))
                .multiply(new THREE.Matrix4().makeScale(size.x, size.y, size.z));

            // Fragment world matrix: BoxGeometry(width,depth,length) centred at
            // midpoint, quaternion setFromUnitVectors((0,0,1), dir).
            const start = new THREE.Vector3(1, 3, 1);
            const end = new THREE.Vector3(5, 3, 4);
            const mid = start.clone().add(end).multiplyScalar(0.5);
            const dir = end.clone().sub(start).normalize();
            const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
            const len = end.clone().sub(start).length();
            const fragmentM = new THREE.Matrix4().compose(
                mid,
                q,
                new THREE.Vector3(beam.width, beam.depth, len),
            );

            // Compare all 8 unit-box corners through both matrices.
            const corners = [-0.5, 0.5].flatMap((x) =>
                [-0.5, 0.5].flatMap((y) => [-0.5, 0.5].map((z) => new THREE.Vector3(x, y, z))),
            );
            for (const c of corners) {
                const a = c.clone().applyMatrix4(instanceM);
                const b = c.clone().applyMatrix4(fragmentM);
                expect(a.distanceTo(b)).toBeLessThan(1e-9);
            }
        });

        it('renders a Group proxy (isInstancedProxy) carrying selectable userData', () => {
            const root = builder.build(makeBeam());
            expect((root as THREE.Group).isGroup).toBe(true);
            expect((root.userData as any).isInstancedProxy).toBe(true);
            expect((root.userData as any).elementType).toBe('beam');
            expect((root.userData as any).selectable).toBe(true);
            // Invisible hit-proxy child present for raycast selection.
            const proxy = root.children.find((ch) => (ch.userData as any)?.role === 'hit-proxy');
            expect(proxy).toBeDefined();
        });
    });

    // ── (c) steel profile stays on fragment path even with flag ON ────────────
    describe('(c) steel-profile beam stays on the FRAGMENT path with flag ON', () => {
        beforeEach(() => {
            g.__pryzmElementInstancingV1 = true;
        });

        it('UB I-section beam is never registered on the bridge', () => {
            builder.build(makeBeam({ sectionType: 'UB', steelProfileName: '254x146x37' }));
            expect(spy.registers).toHaveLength(0);
        });

        it('inclined (non-horizontal) beam stays on the fragment path', () => {
            builder.build(makeBeam({
                startPoint: { x: 0, y: 3, z: 0 },
                endPoint: { x: 4, y: 5, z: 0 }, // Δy = 2 → inclined
            }));
            expect(spy.registers).toHaveLength(0);
        });
    });

    // ── (d) unregister on delete + on ineligibility ───────────────────────────
    describe('(d) instance slot is released on delete / ineligibility', () => {
        it('remove() unregisters an instanced beam', () => {
            g.__pryzmElementInstancingV1 = true;
            builder.build(makeBeam());
            expect(spy.isInstanced('beam-1')).toBe(true);
            builder.remove('beam-1');
            expect(spy.unregisters).toContain('beam-1');
            expect(spy.isInstanced('beam-1')).toBe(false);
        });

        it('rebuild that becomes ineligible (steel) unregisters the prior instance', () => {
            g.__pryzmElementInstancingV1 = true;
            builder.build(makeBeam());                 // instanced
            expect(spy.isInstanced('beam-1')).toBe(true);

            // Same id, now a steel section → must drop off the instanced path.
            builder.build(makeBeam({ sectionType: 'UB', steelProfileName: '254x146x37' }));
            expect(spy.unregisters).toContain('beam-1');
            expect(spy.isInstanced('beam-1')).toBe(false);
        });
    });
});
