// §MITER-T-CLAMP-LAYER-LAT (founder 2026-08-05/06).
//
// REPRO: create two LAYERED walls (e.g. `wt-exterior-brick`, 375 mm, 5 layers) meeting at an
// L-corner, NO openings. The thin finish layers far from the centreline (15 mm internal
// render at ~180 mm lateral offset) STOPPED SHORT of the corner — a visible gap/misjoint in
// plan AND 3D. Adding a DOOR or WINDOW to one wall "healed" the corner.
//
// ROOT CAUSE: the plain layered path (`WallFragmentBuilder` §03-1.3 no-openings branch) builds
// one `buildMiterPrism` PER LAYER; the §MITER-T-CLAMP runaway bound was `4·halfT + 0.05` with
// halfT = the LAYER's half-thickness. A thin layer far from the centreline has a legitimate
// 90°-corner miter projection t ≈ its lateral offset (≈ 0.19 m for the render skin), far above
// its own 4·0.0075 + 0.05 = 0.08 m bound → the projection was clamped → the layer stopped
// short. The with-openings path (`LayeredWallOpeningBuilder.buildContinuousLayerGeometry`,
// SAME shared projection formula per ADR-0055/0055A) clamps at a flat 1.0 m, so it reached the
// miter plane — the two paths disagreed ONLY in the clamp bound, exactly matching the
// door/window diagnostic clue.
//
// FIX (`MiterPrismBuilder` §MITER-T-CLAMP-LAYER-LAT): bound the projection by the vertex's
// LATERAL OFFSET FROM THE CENTRELINE (`4·latOff + 0.05`). For plain walls latOff = halfT →
// byte-identical to the old bound; for layered walls every layer reaches the shared junction
// miter plane. Render-geometry only — no baseline/store writes (§CLAMP-COSHARE-WELD class
// untouched).

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { buildMiterPrism } from '../src/MiterPrismBuilder';
import { buildLayeredWallSegmentsAroundOpenings } from '../src/LayeredWallOpeningBuilder';
import type { WallData } from '../src/WallTypes';

// ── Fixture: the `wt-exterior-brick` assembly (WallSystemTypeStore built-in) ──────────────
const BRICK_LAYERS = [
    { name: 'Face Brick',      thickness: 0.110, function: 'finish-exterior', materialColor: '#c0674a' },
    { name: 'Air Cavity',      thickness: 0.050, function: 'air-barrier',     materialColor: '#e8e8e8' },
    { name: 'Insulation',      thickness: 0.060, function: 'insulation',      materialColor: '#f5e07a' },
    { name: 'Concrete Block',  thickness: 0.140, function: 'structure',       materialColor: '#a0a0a0' },
    { name: 'Internal Render', thickness: 0.015, function: 'finish-interior', materialColor: '#f0ece4' },
];
const TOTAL = BRICK_LAYERS.reduce((s, l) => s + l.thickness, 0);   // 0.375

const LEN = 5;                 // wall along +X, corner at x = LEN
const H = 3, BO = 0;
// 45° L-corner miter plane normal at the END (the corner) — the plane through (LEN, 0) in XZ.
const endMN45 = { nx: Math.SQRT1_2, nz: Math.SQRT1_2 };
const EPS = 1e-4;

/**
 * Build ONE layer of the plain (no-openings) layered wall EXACTLY as
 * `WallFragmentBuilder` §03-1.3 does: per-layer miter prism, layer centreline offset
 * laterally along outward = (−dir.z, 0, dir.x), miter planes anchored on the WALL centreline.
 */
function buildPlainPathLayer(layerIdx: number): THREE.BufferGeometry {
    const layer = BRICK_LAYERS[layerIdx]!;
    let cursor = -TOTAL / 2;
    for (let i = 0; i < layerIdx; i++) cursor += BRICK_LAYERS[i]!.thickness;
    const layerCenter = cursor + layer.thickness / 2;

    const direction = new THREE.Vector3(1, 0, 0);
    const outward = new THREE.Vector3(-direction.z, 0, direction.x);   // (0, 0, 1)
    const shift = outward.clone().multiplyScalar(layerCenter);

    const worldStart = new THREE.Vector3(0, 0, 0).add(shift);
    const worldEnd = new THREE.Vector3(LEN, 0, 0).add(shift);
    const centerlineStart = new THREE.Vector3(0, 0, 0);
    const centerlineEnd = new THREE.Vector3(LEN, 0, 0);

    return buildMiterPrism(
        worldStart, worldEnd, centerlineStart, centerlineEnd,
        layer.thickness / 2, H, BO, null, endMN45,
    );
}

/** Unique end-cap vertices (x within reach of the corner) at a given height, XZ-rounded. */
function endCapXZ(geo: THREE.BufferGeometry, y: number): Array<{ x: number; z: number }> {
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const out: Array<{ x: number; z: number }> = [];
    const seen = new Set<string>();
    for (let i = 0; i < pos.count; i++) {
        if (Math.abs(pos.getY(i) - y) > 1e-3) continue;
        const x = pos.getX(i), z = pos.getZ(i);
        if (x < LEN - 1) continue;                     // only the corner-end region
        const k = `${x.toFixed(4)},${z.toFixed(4)}`;
        if (!seen.has(k)) { seen.add(k); out.push({ x, z }); }
    }
    return out;
}

describe('MiterPrismBuilder — §MITER-T-CLAMP-LAYER-LAT layered plain-wall corner (founder 2026-08-05)', () => {
    it('EVERY layer of a plain layered wall reaches the junction miter plane (no corner gap)', () => {
        for (let li = 0; li < BRICK_LAYERS.length; li++) {
            const capPts = endCapXZ(buildPlainPathLayer(li), BO);
            expect(capPts.length).toBeGreaterThanOrEqual(2);
            for (const p of capPts) {
                // Junction-resolved: the cap vertex must LIE ON the shared miter plane
                // through the corner (LEN, 0): MN · (v − corner) = 0. Pre-fix, the thin
                // 15 mm Internal Render layer (lateral ≈ 0.18 m, own bound 0.08 m) missed
                // this plane by ~0.07–0.14 m — the visible outer-layer corner gap.
                const residual = endMN45.nx * (p.x - LEN) + endMN45.nz * (p.z - 0);
                expect(Math.abs(residual)).toBeLessThan(EPS);
            }
        }
    });

    it('PARITY: plain layered path corner cap ≡ with-openings path corner cap (the door/window clue)', () => {
        // The founder's diagnostic: adding a door/window switched the wall to
        // `LayeredWallOpeningBuilder` and the corner healed. Post-fix, the SAME wall built
        // through BOTH paths (openings path given zero openings) must produce the SAME
        // corner-cap vertex set per layer — one junction treatment, two consumers.
        const wall = {
            id: 'wall-lat-parity',
            levelId: 'L0',
            baseLine: [new THREE.Vector3(0, 0, 0), new THREE.Vector3(LEN, 0, 0)],
            height: H,
            thickness: TOTAL,
            baseOffset: BO,
            layers: BRICK_LAYERS.map(l => ({ ...l })),
            openings: [],
        } as unknown as WallData;

        const group = new THREE.Group();
        const meshes = buildLayeredWallSegmentsAroundOpenings(
            wall, group, [], TOTAL, { start: null, end: endMN45 },
        );
        // 5 distinct-coloured layers → over the §PERF-PHASE2 threshold, but every colour is
        // distinct except none — each layer must still be present. Collect per-layer meshes
        // by index (merged groups record layerIndices).
        const byLayer = new Map<number, THREE.BufferGeometry[]>();
        for (const m of meshes) {
            const ud = m.userData as { layerIndex?: number; layerIndices?: number[] };
            const idxs = ud.layerIndices ?? (typeof ud.layerIndex === 'number' ? [ud.layerIndex] : []);
            for (const i of idxs) {
                const arr = byLayer.get(i) ?? [];
                arr.push(m.geometry as THREE.BufferGeometry);
                byLayer.set(i, arr);
            }
        }

        const key = (p: { x: number; z: number }) => `${p.x.toFixed(3)},${p.z.toFixed(3)}`;
        for (let li = 0; li < BRICK_LAYERS.length; li++) {
            const plainSet = new Set(endCapXZ(buildPlainPathLayer(li), BO).map(key));
            const openGeos = byLayer.get(li);
            expect(openGeos && openGeos.length).toBeTruthy();
            const openSet = new Set<string>();
            for (const g of openGeos!) for (const p of endCapXZ(g, BO)) openSet.add(key(p));
            // Every plain-path corner vertex must appear in the openings-path corner set.
            for (const k of plainSet) expect(openSet.has(k)).toBe(true);
        }
    });

    it('runaway guard still active: a degenerate near-parallel MN cannot extrude metres past the end', () => {
        // MN nearly parallel to the wall direction → unclamped t ≈ 100 × lateral ≈ 19 m.
        // The new bound is 4·latOff + 0.05 per vertex; the farthest Face-Brick vertex sits at
        // |lat| = TOTAL/2 = 0.1875 → max legal overhang 0.80 m. No vertex may exceed it.
        const nearParallel = { nx: 0.99995, nz: 0.01 };
        const norm = Math.hypot(nearParallel.nx, nearParallel.nz);
        const mn = { nx: nearParallel.nx / norm, nz: nearParallel.nz / norm };
        let cursor = -TOTAL / 2;
        const layer = BRICK_LAYERS[0]!;                 // Face Brick — farthest faces
        const layerCenter = cursor + layer.thickness / 2;
        const outward = new THREE.Vector3(0, 0, 1);
        const shift = outward.clone().multiplyScalar(layerCenter);
        const geo = buildMiterPrism(
            new THREE.Vector3(0, 0, 0).add(shift), new THREE.Vector3(LEN, 0, 0).add(shift),
            new THREE.Vector3(0, 0, 0), new THREE.Vector3(LEN, 0, 0),
            layer.thickness / 2, H, BO, null, mn,
        );
        const pos = geo.getAttribute('position') as THREE.BufferAttribute;
        let maxX = -Infinity;
        for (let i = 0; i < pos.count; i++) maxX = Math.max(maxX, pos.getX(i));
        expect(maxX).toBeLessThanOrEqual(LEN + 4 * (TOTAL / 2) + 0.05 + EPS);
    });

    it('plain single-volume wall bound unchanged (latOff = halfT → byte-identical clamp)', () => {
        // The old bound was 4·halfT + 0.05 with base vertices at ±halfT from the centreline;
        // the new latOff-based bound evaluates to the same number for a plain wall. Pin the
        // degenerate square-cap behaviour at the same envelope: near-parallel MN on a plain
        // 0.2 m wall must clamp to ≤ 4·0.1 + 0.05 = 0.45 m overhang.
        const mnRaw = { nx: 0.99995, nz: 0.01 };
        const n = Math.hypot(mnRaw.nx, mnRaw.nz);
        const mn = { nx: mnRaw.nx / n, nz: mnRaw.nz / n };
        const geo = buildMiterPrism(
            new THREE.Vector3(0, 0, 0), new THREE.Vector3(LEN, 0, 0),
            new THREE.Vector3(0, 0, 0), new THREE.Vector3(LEN, 0, 0),
            0.1, H, BO, null, mn,
        );
        const pos = geo.getAttribute('position') as THREE.BufferAttribute;
        let maxX = -Infinity;
        for (let i = 0; i < pos.count; i++) maxX = Math.max(maxX, pos.getX(i));
        expect(maxX).toBeLessThanOrEqual(LEN + 4 * 0.1 + 0.05 + EPS);
    });
});
