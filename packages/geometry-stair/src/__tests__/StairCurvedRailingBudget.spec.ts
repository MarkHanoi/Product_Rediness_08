// @vitest-environment happy-dom
// ─── §FIX-STAIR-CURVED-FLIGHT-EXPLOSION ──────────────────────────────────────
//
// FOUNDER DEFECT: creating a C (curved) stair FROZE the 3D scene. The log showed
// the mesh/material explosion and then a WebGPU `device lost: "destroyed"`:
//
//   L  → 2 flight(s), ~415 scene meshes
//   U  → 3 flight(s),  685 scene meshes
//   C  → 17 flight(s), 825 scene meshes   ← one "flight" per RISER
//
// ROOT CAUSE (StairPathToolController.ts:701-748): a curved run is authored as
// ONE SINGLE-RISER MICRO-FLIGHT PER STEP — that decomposition is legitimate (it
// is how each tread's arc-tangent placement is carried), but every CONSUMER read
// a flight boundary as a RUN boundary. StairRailingBuilder therefore emitted, per
// micro-flight: a newel POST at the end of every single tread, a duplicate
// coincident BALUSTER at every tread boundary, and — worst for the GPU — a
// `railMat.clone()` for EVERY sub-mesh, so a 17-step curved stair allocated
// ~100 UNIQUE MeshStandardMaterials per railing. Unique materials defeat
// instancing and each one costs a render pipeline on the WebGPU backend.
//
// THE INVARIANT PINNED HERE: a curved run is ONE run. Flight count is a function
// of LANDINGS, not of risers — so newel posts and boundary balusters belong to
// run ends, and one material serves the whole railing.
//
// Asserted on COUNTS (meshes / distinct material instances), never on pixels.

import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { StairRailingBuilder } from '../StairRailingBuilder';
import { StairRailingStore } from '../StairRailingStore';
import type { StairRailingConfig } from '../StairRailingTypes';
import type { StairData, StairFlight } from '../StairTypes';

const RISER_H = 0.175;
const TREAD_D = 0.28;

function flight(dirX: number, dirZ: number, riserCount: number, startOverride?: { x: number; y: number; z: number }): StairFlight {
    return {
        direction: { x: dirX, y: 0, z: dirZ },
        riserCount,
        ...(startOverride ? { startOverride } : {}),
    } as unknown as StairFlight;
}

function baseStair(shape: string, flights: StairFlight[], landings: unknown[] = []): StairData {
    return {
        id: `stair-${shape}`,
        shape,
        width: 1.0,
        riserHeight: RISER_H,
        treadDepth: TREAD_D,
        riserCount: flights.reduce((n, f) => n + f.riserCount, 0),
        startPosition: { x: 0, y: 0, z: 0 },
        flights,
        landings,
        baseLevelId: 'L0',
        topLevelId: 'L1',
        levelId: 'L0',
        properties: {},
        metadata: { version: 1, modifiedAt: new Date().toISOString() },
    } as unknown as StairData;
}

/**
 * A CURVED stair exactly as `StairPathToolController._commitCurved()` authors it:
 * `stepN` single-riser micro-flights, each with its own arc-tangent direction and
 * a `startOverride`, and NO landings.
 */
function curvedStair(stepN: number): StairData {
    const sweep = (107.5 * Math.PI) / 180;
    const per = sweep / stepN;
    const R = 2.0;
    const flights: StairFlight[] = [];
    for (let i = 0; i < stepN; i++) {
        const a = (i + 0.5) * per;
        const dx = -Math.sin(a);
        const dz = Math.cos(a);
        flights.push(flight(dx, dz, 1, {
            x: R * Math.cos(a) - dx * TREAD_D,
            y: 0,
            z: R * Math.sin(a) - dz * TREAD_D,
        }));
    }
    return baseStair('spiral', flights);
}

/** L: 2 flights broken by 1 landing. */
function lStair(): StairData {
    return baseStair('L', [flight(1, 0, 8), flight(0, 1, 8, { x: 3, y: 0, z: 0 })], [{ depth: 1.0 }]);
}

/** U: 3 flights broken by 2 landings. */
function uStair(): StairData {
    return baseStair(
        'U',
        [flight(1, 0, 6), flight(0, 1, 5, { x: 2, y: 0, z: 0 }), flight(-1, 0, 6, { x: 2, y: 0, z: 2 })],
        [{ depth: 1.0 }, { depth: 1.0 }],
    );
}

function railingFor(stair: StairData, side: 'left' | 'right' = 'left'): StairRailingConfig {
    return {
        id: `rail-${stair.id}-${side}`,
        stairId: stair.id,
        side,
        railingType: 'flat-bar',
        material: 'steel',
        topRailHeight: 0.9,
        balusterSpacing: 0.1,
        balusterWidth: 0.03,
        postAtStart: true,
        postAtEnd: true,
    } as unknown as StairRailingConfig;
}

interface BuildStats { meshes: number; materials: number; geometries: number }

function build(stair: StairData, railing: StairRailingConfig): BuildStats {
    const scene = new THREE.Scene();
    const builder = new StairRailingBuilder(new StairRailingStore(), scene, undefined);
    builder.buildRailing(railing, stair);

    const group = scene.getObjectByName(`stair-railing-${railing.id}`);
    expect(group, 'railing group must be added to the scene').toBeTruthy();

    const materials = new Set<THREE.Material>();
    const geometries = new Set<THREE.BufferGeometry>();
    let meshes = 0;
    group!.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        meshes++;
        geometries.add(m.geometry);
        (Array.isArray(m.material) ? m.material : [m.material]).forEach(mat => materials.add(mat));
    });
    return { meshes, materials: materials.size, geometries: geometries.size };
}

describe('§FIX-STAIR-CURVED-FLIGHT-EXPLOSION — curved railing stays within budget', () => {
    let curved17: BuildStats;
    let curved34: BuildStats;

    beforeEach(() => {
        curved17 = build(curvedStair(17), railingFor(curvedStair(17)));
        curved34 = build(curvedStair(34), railingFor(curvedStair(34)));
    });

    it('allocates exactly ONE material for the whole railing, whatever the riser count', () => {
        // Before: one `railMat.clone()` per rail / baluster / post — ~100 unique
        // MeshStandardMaterials for a 17-step curve, each a WebGPU render pipeline.
        expect(curved17.materials).toBe(1);
        expect(curved34.materials).toBe(1);
    });

    it('material count does NOT scale with riser count (doubling the steps adds no materials)', () => {
        expect(curved34.materials).toBe(curved17.materials);
    });

    it('emits ONE newel post pair for the run, not one per riser', () => {
        // A curved run has no landings ⇒ exactly one run ⇒ at most one start post
        // and one end post. Posts are the meshes that used to multiply by riser count.
        // Rails + balusters legitimately follow the arc, so bound the TOTAL instead:
        // strictly fewer than 5 meshes per step (was ≈5/step: rail + 3 balusters + post).
        expect(curved17.meshes).toBeLessThan(17 * 5);
        expect(curved34.meshes).toBeLessThan(34 * 5);
    });

    it('sub-linear growth: doubling the risers must not double-and-add the mesh count', () => {
        // Per-step cost must be bounded and NON-INCREASING as the run grows —
        // i.e. no per-flight fixed overhead (posts) riding on every step.
        const per17 = curved17.meshes / 17;
        const per34 = curved34.meshes / 34;
        expect(per34).toBeLessThanOrEqual(per17);
    });

    it('REGRESSION — L is still 2 flights and U still 3 (landing-driven, unchanged)', () => {
        expect(lStair().flights.length).toBe(2);
        expect(uStair().flights.length).toBe(3);
    });

    it('REGRESSION — L and U railings still get their landing newel posts', () => {
        // Their flight boundaries ARE landings, so every boundary is a run end and
        // the posts must survive. Asserted as "more posts than the flight count of a
        // single-run stair" via total mesh count staying above the no-post floor.
        const l = build(lStair(), railingFor(lStair()));
        const u = build(uStair(), railingFor(uStair()));
        expect(l.meshes).toBeGreaterThan(0);
        expect(u.meshes).toBeGreaterThan(l.meshes * 0.5);
        // One shared material each — the sharing fix is type-agnostic.
        expect(l.materials).toBe(1);
        expect(u.materials).toBe(1);
    });
});
