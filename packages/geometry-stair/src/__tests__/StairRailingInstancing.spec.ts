/**
 * StairRailingBuilder GPU-instancing tests — ADR-0076 Axis 3
 * (§PERF-WEBGPU-FRAGMENT / §PERF-RAIL-INSTANCING).
 *
 * Proves the repeated posts + balusters route through the bridge when the flag is
 * on (the spike's ~200-300 post / ~500-1000 baluster draw-call multiplier), while
 * the sloped top/bottom rails stay fragments:
 *   (a) flag OFF → posts + balusters are real meshes, bridge untouched;
 *   (b) flag ON  → posts + balusters register via the bridge as box/cylinder
 *       instances with centre/size matching the fragment placement, sloped rails
 *       stay fragments;
 *   (c) removeRailing / a rebuild releases every instance slot.
 *
 * Node vitest. StairRailingBuilder's constructor wires window/runtime listeners, so
 * a minimal window stub is installed before construction.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { ElementInstanceBridge } from '@pryzm/core-app-model/rendering';

// ── window stub (StairRailingBuilder ctor adds DOM + runtime listeners) ───────
const _origWindow = (globalThis as any).window;
beforeEach(() => {
    (globalThis as any).window = {
        addEventListener: vi.fn(),
        runtime: { events: { on: vi.fn() } },
    };
});
afterEach(() => {
    (globalThis as any).window = _origWindow;
    delete (globalThis as { __pryzmElementInstancingV1?: boolean }).__pryzmElementInstancingV1;
    delete (globalThis as { __pryzmElementInstancing?: unknown }).__pryzmElementInstancing;
});

// Imported AFTER the window stub setup at top-level is harmless (ctor runs per-test).
import { StairRailingBuilder } from '../StairRailingBuilder';
import type { StairRailingConfig } from '../StairRailingTypes';
import type { StairData } from '../StairTypes';

const g = globalThis as {
    __pryzmElementInstancingV1?: boolean;
    __pryzmElementInstancing?: Record<string, boolean>;
};

class SpyBridge {
    registers: Array<{ id: string; levelId: string; type: string; transform: any; kind: string }> = [];
    unregisters: string[] = [];
    private _live = new Set<string>();
    register(id: string, levelId: string, type: string, transform: any, _m: unknown, kind: string): void {
        this.registers.push({ id, levelId, type, transform, kind });
        this._live.add(id);
    }
    unregister(id: string): void { this.unregisters.push(id); this._live.delete(id); }
    updateTransform(): void {}
    isInstanced(id: string): boolean { return this._live.has(id); }
}

/** Straight single-flight stair: 5 risers up +X, no landings. */
function makeStair(over: Partial<StairData> = {}): StairData {
    return {
        id: 'stair-1',
        type: 'stair',
        levelId: 'level-1',
        baseLevelId: 'level-1',
        topLevelId: 'level-2',
        baseOffset: 0,
        topOffset: 0,
        shape: 'I',
        startPosition: { x: 0, y: 0, z: 0 },
        width: 1.0,
        riserHeight: 0.18,
        treadDepth: 0.28,
        riserCount: 5,
        flights: [{ direction: { x: 1, y: 0, z: 0 }, riserCount: 5 }],
        landings: [],
        properties: {
            riserVisible: true, nosingType: 'standard', nosingDepth: 0.025,
            stringerType: 'none', handrailLeft: true, handrailRight: true, handrailHeight: 1.05,
        },
        ...over,
    } as StairData;
}

function makeRailing(over: Partial<StairRailingConfig> = {}): StairRailingConfig {
    return {
        id: 'railing-1',
        stairId: 'stair-1',
        side: 'left',
        topRailHeight: 1.0,
        balusterSpacing: 0.3,
        balusterShape: 'rectangular',
        balusterWidth: 0.04,
        postAtStart: true,
        postAtEnd: true,
        material: 'steel',
        railingType: 'flat-bar',
        ...over,
    };
}

describe('StairRailingBuilder §PERF-RAIL-INSTANCING (ADR-0076 Axis 3)', () => {
    let scene: THREE.Scene;
    let builder: StairRailingBuilder;
    let spy: SpyBridge;

    beforeEach(() => {
        scene = new THREE.Scene();
        // StairRailingStore is unused on the build path we exercise — pass a stub.
        const stubStore = { get: () => undefined, getByStairId: () => [] } as any;
        builder = new StairRailingBuilder(stubStore, scene);
        spy = new SpyBridge();
        builder.setInstanceBridge(spy as unknown as ElementInstanceBridge);
    });

    // ── (a) flag OFF → fragment path ──────────────────────────────────────────
    describe('(a) flag OFF keeps posts + balusters on the FRAGMENT path', () => {
        it('registers nothing on the bridge and builds real meshes', () => {
            // ⚠ §NAV-SMOOTHNESS (L-1781) — this used to set NO flag and rely on the
            // shipped default being OFF. `stairRailing` is now default ON (measured:
            // 4920 → 250 draw calls over 240 railing elements; the recorded "it leaks"
            // blocker measured at ONE retained material whether 5 railings or 50), so
            // "off" has to be NAMED. The fragment path itself is unchanged and must
            // stay correct — it is what the kill switch returns the user to.
            g.__pryzmElementInstancing = { stairRailing: false };
            builder.buildRailing(makeRailing(), makeStair());
            expect(spy.registers).toHaveLength(0);
            // A flat-bar railing produces baluster + post meshes — assert several exist.
            let meshes = 0;
            scene.traverse(o => { if ((o as THREE.Mesh).isMesh) meshes++; });
            expect(meshes).toBeGreaterThan(3);
        });
    });

    // ── (b) flag ON → instanced ───────────────────────────────────────────────
    describe('(b) flag ON: posts + balusters register via the bridge', () => {
        beforeEach(() => { g.__pryzmElementInstancingV1 = true; });

        it('registers box balusters + box posts with elementType "stair-railing"', () => {
            builder.buildRailing(makeRailing(), makeStair());
            expect(spy.registers.length).toBeGreaterThan(0);
            for (const r of spy.registers) {
                expect(r.type).toBe('stair-railing');
                expect(r.levelId).toBe('level-1');
                expect(r.kind).toBe('box'); // flat-bar → square balusters + square posts
            }
        });

        it('round railing produces cylinder baluster instances', () => {
            builder.buildRailing(makeRailing({ railingType: 'circular' }), makeStair());
            const cylinders = spy.registers.filter(r => r.kind === 'cylinder');
            expect(cylinders.length).toBeGreaterThan(0);
        });

        it('a baluster instance centre = (worldX, baseElev + h/2, worldZ), size = (bw, h, bw)', () => {
            // Flat-bar: first baluster (i=0) sits at the flight start + side offset.
            // side 'left' → sideSign +1; offset = sideAxis * (width/2). For flatDir +X,
            // sideAxis = (-flatDir.z, 0, flatDir.x) = (0,0,1). offset = (0,0,0.5).
            // First baluster base = flightStart + offset = (0,0,0.5), elev 0.
            builder.buildRailing(makeRailing(), makeStair());
            // Find a baluster registration: height == topRailHeight (1.0), size square.
            const railH = 1.0;
            const bw = 0.04;
            const bal = spy.registers.find(r =>
                Math.abs(r.transform.size.y - railH) < 1e-9 &&
                Math.abs(r.transform.size.x - bw) < 1e-9 &&
                Math.abs(r.transform.centre.z - 0.5) < 1e-9 &&
                Math.abs(r.transform.centre.x - 0) < 1e-9,
            );
            expect(bal).toBeDefined();
            expect(bal!.transform.rotationY).toBe(0);
            expect(bal!.transform.centre.y).toBeCloseTo(railH / 2, 9); // baseElev 0 + h/2
            expect(bal!.transform.size).toEqual({ x: bw, y: railH, z: bw });

            // The instanced box centre/size must reproduce the fragment placement:
            // fragment baluster = BoxGeometry(bw, railH, bw) at (cx, baseElev+railH/2, cz).
            const instM = new THREE.Matrix4()
                .makeTranslation(bal!.transform.centre.x, bal!.transform.centre.y, bal!.transform.centre.z)
                .multiply(new THREE.Matrix4().makeRotationY(0))
                .multiply(new THREE.Matrix4().makeScale(bw, railH, bw));
            const fragMesh = new THREE.Mesh(new THREE.BoxGeometry(bw, railH, bw));
            fragMesh.position.set(0, 0 + railH / 2, 0.5);
            fragMesh.updateMatrixWorld(true);
            for (const sx of [-0.5, 0.5]) for (const sy of [-0.5, 0.5]) for (const sz of [-0.5, 0.5]) {
                const a = new THREE.Vector3(sx, sy, sz).applyMatrix4(instM);
                const b = new THREE.Vector3(sx * bw, sy * railH, sz * bw).applyMatrix4(fragMesh.matrixWorld);
                expect(a.distanceTo(b)).toBeLessThan(1e-9);
            }
        });

        it('sloped top rail stays a fragment mesh (real Mesh in the group)', () => {
            builder.buildRailing(makeRailing(), makeStair());
            let railMeshes = 0;
            scene.traverse(o => {
                // Sloped box rails are real meshes with elementType stair-railing and
                // geometry whose bounding box is NOT square (length >> 0.05).
                if ((o as THREE.Mesh).isMesh) railMeshes++;
            });
            // At least the top rail remains as a fragment mesh.
            expect(railMeshes).toBeGreaterThan(0);
        });
    });

    // ── (c) slot release ──────────────────────────────────────────────────────
    describe('(c) instance slots released on remove / rebuild', () => {
        beforeEach(() => { g.__pryzmElementInstancingV1 = true; });

        it('removeRailing unregisters every instance the railing allocated', () => {
            builder.buildRailing(makeRailing(), makeStair());
            const ids = spy.registers.map(r => r.id);
            expect(ids.length).toBeGreaterThan(0);
            for (const id of ids) expect(spy.isInstanced(id)).toBe(true);

            builder.removeRailing('railing-1');
            for (const id of ids) expect(spy.isInstanced(id)).toBe(false);
        });

        it('a rebuild releases the prior instance set', () => {
            builder.buildRailing(makeRailing(), makeStair());
            const firstIds = spy.registers.map(r => r.id);
            spy.registers.length = 0;
            // buildRailing internally calls removeRailing(id) first → releases prior slots.
            builder.buildRailing(makeRailing(), makeStair());
            for (const id of firstIds) expect(spy.unregisters).toContain(id);
        });

        it('unique instance ids per member (no collisions across balusters/posts)', () => {
            builder.buildRailing(makeRailing(), makeStair());
            const ids = spy.registers.map(r => r.id);
            expect(new Set(ids).size).toBe(ids.length);
        });
    });
});
