// CurtainWallInstanceManager.matshare.test.ts
// §INSTANCE-MAT-SHARE / L-312B (SS-INSTANCE-MAT-SHARE) — guard against the
// curtain-wall PSO (pipeline-state-object) compile storm.
//
// ROOT CAUSE (fixed): the panel material cache key embedded `panelThickness`.
// Thickness sizes the geometry, not the material/shader/PSO. Any per-wall
// thickness variation (persisted float noise, mixed typologies, user edits)
// fragmented the material cache → one fresh MeshStandardMaterial per wall →
// one fresh PSO compile per wall. On a heavy office/resi facade of thousands
// of curtain-wall panels this compiled thousands of near-identical pipelines
// in one flush and the WebGPU device was lost.
//
// GUARANTEE PROVEN HERE:
//   1. N curtain walls of the SAME panel type share exactly ONE material,
//      even when panelThickness differs per wall (RED before the fix: N mats).
//   2. Two DIFFERENT panel types do NOT share a material (no over-collapse).
//   3. Geometry legitimately stays per-thickness (a PSO is NOT recompiled for a
//      different-sized box that shares the same material + vertex layout).
//
// The material output is byte-identical to before the fix: panel materials are a
// pure function of panelType via PANEL_TYPE_DEFAULTS — thickness never affected
// any material property, so collapsing across thicknesses changes nothing visual.

import { describe, expect, it } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { CurtainWallInstanceManager } from '../src/CurtainWallInstanceManager';
import { CurtainCell } from '../src/CurtainCellComputer';
import { CurtainPanelData, PanelType } from '../src/CurtainPanelTypes';

/** Minimal unit cell at grid address (i, j). */
function makeCell(i: number, j: number): CurtainCell {
    const x0 = i, x1 = i + 1, y0 = j, y1 = j + 1;
    return {
        i, j,
        corners: [
            new THREE.Vector3(x0, y0, 0),
            new THREE.Vector3(x1, y0, 0),
            new THREE.Vector3(x1, y1, 0),
            new THREE.Vector3(x0, y1, 0),
        ],
        u0: 0, u1: 1, v0: 0, v1: 1,
        width: 1, height: 1,
    };
}

function makePanel(id: string, i: number, j: number, panelType: PanelType): CurtainPanelData {
    return {
        id,
        type: 'curtain-panel',
        curtainWallId: 'w',
        cellIndex: [i, j],
        panelType,
    } as CurtainPanelData;
}

/**
 * Simulate ONE curtain wall's projection: a single-cell wall of `panelType`
 * built at the given panelThickness. Returns the InstancedMesh material.
 */
function buildOneWall(
    mgr: CurtainWallInstanceManager,
    id: string,
    panelType: PanelType,
    panelThickness: number,
): THREE.Material {
    const cells = [makeCell(0, 0)];
    const panels = [makePanel(id, 0, 0, panelType)];
    const { instancedMeshes } = mgr.buildInstancedMeshes(cells, panels, 0.05, panelThickness);
    expect(instancedMeshes.length).toBe(1);
    return instancedMeshes[0].material as THREE.Material;
}

describe('CurtainWallInstanceManager — §INSTANCE-MAT-SHARE (L-312B)', () => {
    it('shares ONE material across N walls of the same panel type even when thickness varies', () => {
        const mgr = new CurtainWallInstanceManager();
        const N = 50;
        const materials = new Set<THREE.Material>();

        for (let n = 0; n < N; n++) {
            // Vary thickness per wall (the office/resi storm scenario): float noise
            // around the nominal 0.02 m. Pre-fix this minted a distinct material per
            // wall (thickness was in the material key); post-fix it must not.
            const thickness = 0.02 + n * 1e-5;
            materials.add(buildOneWall(mgr, `glass-${n}`, 'SystemPanel_Glass', thickness));
        }

        // THE GUARD: N walls (all thicknesses distinct) → exactly ONE material.
        expect(materials.size).toBe(1);
    });

    it('shares ONE material across walls of identical thickness (regression control)', () => {
        const mgr = new CurtainWallInstanceManager();
        const materials = new Set<THREE.Material>();
        for (let n = 0; n < 10; n++) {
            materials.add(buildOneWall(mgr, `glass-${n}`, 'SystemPanel_Glass', 0.02));
        }
        expect(materials.size).toBe(1);
    });

    it('does NOT share a material between two DIFFERENT panel types (no over-collapse)', () => {
        const mgr = new CurtainWallInstanceManager();
        const glassMat = buildOneWall(mgr, 'glass', 'SystemPanel_Glass', 0.02);
        const opaqueMat = buildOneWall(mgr, 'opaque', 'SystemPanel_Opaque', 0.02);
        expect(glassMat).not.toBe(opaqueMat);

        // Distinct panel types keep distinct materials across many walls.
        const distinct = new Set<THREE.Material>();
        for (let n = 0; n < 8; n++) {
            distinct.add(buildOneWall(mgr, `g-${n}`, 'SystemPanel_Glass', 0.02 + n * 1e-5));
            distinct.add(buildOneWall(mgr, `o-${n}`, 'SystemPanel_Opaque', 0.03 + n * 1e-5));
        }
        expect(distinct.size).toBe(2);
    });

    it('preserves the canonical material properties for a shared glass material', () => {
        // Byte-identical appearance guarantee: the shared material still carries the
        // SystemPanel_Glass canonical defaults (transparent double-sided glazing).
        const mgr = new CurtainWallInstanceManager();
        const mat = buildOneWall(mgr, 'glass', 'SystemPanel_Glass', 0.02) as THREE.MeshStandardMaterial;
        expect(mat.transparent).toBe(true);
        expect(mat.opacity).toBeCloseTo(0.4, 5);
        expect(mat.side).toBe(THREE.DoubleSide);
        expect((mat as THREE.MeshStandardMaterial).userData.sharedMaterial).toBe(true);
    });

    it('geometry legitimately stays per-thickness (material shared, geometry not)', () => {
        // Different thickness → different geometry (correct: box Z depth differs),
        // but the SAME material — proving the storm fix does not touch geometry
        // correctness and that geometry variation alone does not fragment materials.
        const mgr = new CurtainWallInstanceManager();
        const cells = [makeCell(0, 0)];
        const r1 = mgr.buildInstancedMeshes(cells, [makePanel('a', 0, 0, 'SystemPanel_Glass')], 0.05, 0.02);
        const r2 = mgr.buildInstancedMeshes(cells, [makePanel('b', 0, 0, 'SystemPanel_Glass')], 0.05, 0.03);
        expect(r1.instancedMeshes[0].material).toBe(r2.instancedMeshes[0].material); // shared
        expect(r1.instancedMeshes[0].geometry).not.toBe(r2.instancedMeshes[0].geometry); // per-thickness
    });

    it('disposeCache releases the shared material (C13 isolation)', () => {
        const mgr = new CurtainWallInstanceManager();
        const mat = buildOneWall(mgr, 'glass', 'SystemPanel_Glass', 0.02) as THREE.MeshStandardMaterial;
        let disposed = false;
        mat.addEventListener('dispose', () => { disposed = true; });
        mgr.disposeCache();
        expect(disposed).toBe(true);
    });
});
