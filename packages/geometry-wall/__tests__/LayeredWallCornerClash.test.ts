/**
 * §FIX-LAYERED-WALL-V2-PARITY (founder 2026-08-06) — a LAYERED partition started on an
 * existing L junction must not clash with the walls forming that corner.
 *
 * The founder: "Created a LAYERED INTERIOR PARTITION to join, with first point, the L
 * JUNCTION of the walls — and there is a CLASH." Standing rule: THERE SHOULD NEVER BE A
 * CLASH OF WALLS.
 *
 * ─── WHAT THIS FILE ESTABLISHES ─────────────────────────────────────────────────────────
 *
 * 1. THE DEFECT IS REPRODUCED, AND IT IS A PIPELINE PARITY GAP — not a bad epsilon.
 *    The same junction, same inputs, measured through both pipelines:
 *      • LEGACY (`WallJoinResolver` → `buildMiterPrism`) — the ONLY path a straight layered
 *        wall takes (`WallFragmentBuilder` returns from the layered branch before
 *        `createWallBodyFragment`, which is where the V2 chain lives) → CLASHES.
 *      • V2 (`JunctionResolverV2` → `WallFootprint2D`) — the path a PLAIN wall takes → CLEAN.
 *    So the layered wall is the one that clashes because it is the one that never asks the
 *    resolver that already solves this.
 *
 * 2. THE FIX IS SUFFICIENT. `WallLayerFootprint2D.buildWallLayerBands` slices the V2
 *    footprint into per-layer bands. Because every band is a SUBSET of the footprint, the
 *    footprint's clash-freedom is INHERITED — asserted here by the same area predicate.
 *
 * ⚠ STATUS: the fix module is authored and proven at the geometry level, but the ~15-line
 * call site that would replace the per-layer `buildMiterPrism` loop lives in
 * `WallFragmentBuilder.ts` (:1265–:1367), which is held by another agent. The wiring is NOT
 * landed. Test #1 below therefore still asserts the DEFECT for the shipped code path, in the
 * MEASURED-OPEN style of `WallJoinResolver.clashFreeFootprints.test.ts`. When the call site
 * is wired, invert `legacy layered wall CLASHES` to the clean assertion.
 *
 * The area predicate (grid sampler, 2 mm step, `CLEAN_MM2` floor) is deliberately identical
 * to `WallJoinResolver.clashFreeFootprints.test.ts` so the two files' numbers are comparable.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { WallJoinResolver } from '../src/WallJoinResolver';
import { resolveJunctions, type WallInput, type Pt2 } from '../src/JunctionResolverV2';
import { buildAllFootprints, buildWallFootprint } from '../src/WallFootprint2D';
import { buildWallLayerBands } from '../src/WallLayerFootprint2D';
import type { WallData } from '../src/WallTypes';

type Pt = { x: number; z: number };

// ─── The founder's scene ──────────────────────────────────────────────────────────────────
// Two 0.30 m walls mitred into an L at the origin; a LAYERED interior partition drawn
// diagonally out of that corner, its FIRST POINT on the junction.
const T = 0.30;
const GUEST_LAYERS = [0.0125, 0.075, 0.0125];        // board / studs / board = 0.10 m partition
const GUEST_T = GUEST_LAYERS.reduce((s, t) => s + t, 0);
const CORNER: [number, number] = [0, 0];
const GUEST_END: [number, number] = [3, 3];

let _seq = 0;
function mk(s: [number, number], e: [number, number], thickness: number, layers?: number[]): WallData {
    return {
        id: `lc${_seq++}`, type: 'wall', levelId: 'L', properties: {}, childrenIds: [],
        baseLine: [{ x: s[0], y: 0, z: s[1] }, { x: e[0], y: 0, z: e[1] }],
        height: 3, thickness, baseOffset: 0, openings: [],
        layers: layers?.map((t, i) => ({ name: `l${i}`, thickness: t })),
        metadata: { createdAt: _seq },
    } as unknown as WallData;
}

/** The rendered plan footprint of a LEGACY-resolved wall: baseline ± halfT, caps projected
 *  onto the miter plane exactly as `MiterPrismBuilder.buildMiterPrism` projects them. */
function legacyFootprint(
    jd: {
        baseLine: [THREE.Vector3, THREE.Vector3];
        startMN: { nx: number; nz: number } | null;
        endMN: { nx: number; nz: number } | null;
    },
    thickness: number,
): Pt[] {
    const [s, e] = jd.baseLine;
    const d = new THREE.Vector3(e.x - s.x, 0, e.z - s.z).normalize();
    const n = new THREE.Vector3(-d.z, 0, d.x).multiplyScalar(thickness / 2);
    const raw = [
        { px: s.x + n.x, pz: s.z + n.z, o: s, mn: jd.startMN },
        { px: e.x + n.x, pz: e.z + n.z, o: e, mn: jd.endMN },
        { px: e.x - n.x, pz: e.z - n.z, o: e, mn: jd.endMN },
        { px: s.x - n.x, pz: s.z - n.z, o: s, mn: jd.startMN },
    ];
    return raw.map(({ px, pz, o, mn }) => {
        if (!mn) return { x: px, z: pz };
        const dotD = mn.nx * d.x + mn.nz * d.z;
        if (Math.abs(dotD) < 1e-9) return { x: px, z: pz };
        const t = (mn.nx * (o.x - px) + mn.nz * (o.z - pz)) / dotD;
        return { x: px + t * d.x, z: pz + t * d.z };
    });
}

function inPoly(px: number, pz: number, poly: readonly Pt[]): boolean {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i]!, b = poly[j]!;
        if ((a.z > pz) !== (b.z > pz) && px < ((b.x - a.x) * (pz - a.z)) / (b.z - a.z) + a.x) inside = !inside;
    }
    return inside;
}

const STEP = 0.002;
/** Grid-sampled intersection area of two plan polygons, in mm². */
function overlapMm2(p: readonly Pt[], q: readonly Pt[]): number {
    if (p.length < 3 || q.length < 3) return 0;
    const xs = [...p, ...q].map(v => v.x), zs = [...p, ...q].map(v => v.z);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    let hits = 0;
    for (let x = x0 + STEP / 2; x < x1; x += STEP) {
        for (let z = z0 + STEP / 2; z < z1; z += STEP) {
            if (inPoly(x, z, p) && inPoly(x, z, q)) hits++;
        }
    }
    return hits * STEP * STEP * 1e6;
}

/** Shared-mitre-edge sampler noise floor. See clashFreeFootprints.test.ts for the derivation. */
const CLEAN_MM2 = 300;

function polygonAreaMm2(poly: readonly Pt[]): number {
    let a = 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        a += (poly[j]!.x + poly[i]!.x) * (poly[j]!.z - poly[i]!.z);
    }
    return Math.abs(a / 2) * 1e6;
}

const V2_SCENE: WallInput[] = [
    { id: 'A', start: { x: 0, z: 0 }, end: { x: 5, z: 0 }, thickness: T },
    { id: 'B', start: { x: 0, z: 0 }, end: { x: 0, z: 5 }, thickness: T },
    { id: 'C', start: { x: CORNER[0], z: CORNER[1] }, end: { x: GUEST_END[0], z: GUEST_END[1] }, thickness: GUEST_T },
];

// ─── 1. THE DEFECT — the shipped layered path ─────────────────────────────────────────────

describe('§FIX-LAYERED-WALL-V2-PARITY — the clash, reproduced in both pipelines', () => {

    it('MEASURED-OPEN — the LEGACY path a layered wall takes CLASHES with the L corner', () => {
        // This is what `WallFragmentBuilder`'s layered branch renders today: one
        // `buildMiterPrism` per layer, capped on the LEGACY `WallJoinResolver` miter normals.
        // The per-layer split is irrelevant to the clash — every layer sits inside the same
        // mitred outline — so measuring the whole-wall legacy footprint measures the defect.
        const armA = mk([0, 0], [5, 0], T);
        const armB = mk([0, 0], [0, 5], T);
        const guest = mk(CORNER, GUEST_END, GUEST_T, GUEST_LAYERS);
        const res = WallJoinResolver.resolveLevel([armA, armB, guest]) as unknown as Map<string, {
            baseLine: [THREE.Vector3, THREE.Vector3];
            startMN: { nx: number; nz: number } | null;
            endMN: { nx: number; nz: number } | null;
        }>;
        const fp = (w: WallData): Pt[] => legacyFootprint(res.get(w.id)!, w.thickness);
        const worst = Math.max(overlapMm2(fp(guest), fp(armA)), overlapMm2(fp(guest), fp(armB)));

        // WHEN THE CALL SITE IS WIRED: invert to `toBeLessThan(CLEAN_MM2)`.
        expect(worst, 'the layered partition doubles solid with the L corner — the founder\'s clash')
            .toBeGreaterThan(1000);
        expect(worst, 'magnitude pinned so it cannot silently get worse').toBeLessThan(5000);
    });

    it('the V2 path a PLAIN wall takes is CLEAN on the identical junction', () => {
        // Same three walls, same coordinates. The only difference is which resolver renders
        // them. This is the evidence that the defect is a parity gap, not a missing epsilon.
        const fps = buildAllFootprints(V2_SCENE, resolveJunctions(V2_SCENE));
        const byId = new Map(fps.map(f => [f.id, f.polygon]));
        expect(overlapMm2(byId.get('C')!, byId.get('A')!)).toBeLessThan(CLEAN_MM2);
        expect(overlapMm2(byId.get('C')!, byId.get('B')!)).toBeLessThan(CLEAN_MM2);
    });
});

// ─── 2. THE FIX — per-layer bands cut from the V2 footprint ───────────────────────────────

describe('§FIX-LAYERED-WALL-V2-PARITY — buildWallLayerBands inherits the V2 non-clash', () => {

    const scene = () => {
        const miters = resolveJunctions(V2_SCENE);
        const fps = buildAllFootprints(V2_SCENE, miters);
        const guestFp = fps.find(f => f.id === 'C')!;
        return {
            armA: fps.find(f => f.id === 'A')!.polygon,
            armB: fps.find(f => f.id === 'B')!.polygon,
            guestFp,
            bands: buildWallLayerBands(guestFp, GUEST_LAYERS).bands,
        };
    };

    it('NO LAYER of the partition clashes with either arm of the L corner', () => {
        const { armA, armB, bands } = scene();
        expect(bands).toHaveLength(GUEST_LAYERS.length);
        for (const b of bands) {
            expect(b.polygon.length, `layer ${b.index} produced a polygon`).toBeGreaterThanOrEqual(3);
            expect(overlapMm2(b.polygon, armA), `layer ${b.index} ∩ arm A`).toBeLessThan(CLEAN_MM2);
            expect(overlapMm2(b.polygon, armB), `layer ${b.index} ∩ arm B`).toBeLessThan(CLEAN_MM2);
        }
    });

    it('layers do not clash with EACH OTHER (no doubled solid inside the stack)', () => {
        const { bands } = scene();
        for (let i = 0; i < bands.length; i++) {
            for (let j = i + 1; j < bands.length; j++) {
                expect(overlapMm2(bands[i]!.polygon, bands[j]!.polygon), `layer ${i} ∩ layer ${j}`)
                    .toBeLessThan(CLEAN_MM2);
            }
        }
    });

    it('the bands TILE the footprint — no seam, no lost material', () => {
        const { guestFp, bands } = scene();
        const whole = polygonAreaMm2(guestFp.polygon);
        const sum = bands.reduce((s, b) => s + polygonAreaMm2(b.polygon), 0);
        expect(sum / whole).toBeGreaterThan(0.999);
        expect(sum / whole).toBeLessThan(1.001);
    });

    it('layer ORDER and lateral POSITION match the existing cursor walk (no sideways move)', () => {
        // WallFragmentBuilder today: `cursor = -total/2`, then each layer occupies
        // [cursor, cursor + t] along `outward = leftPerp(dir)`. Bands must reproduce that
        // exactly, so wiring the fix changes only the mitred ENDS.
        const { bands } = scene();
        let cursor = -GUEST_T / 2;
        for (let i = 0; i < bands.length; i++) {
            expect(bands[i]!.lateralLo).toBeCloseTo(cursor, 9);
            cursor += GUEST_LAYERS[i]!;
            expect(bands[i]!.lateralHi).toBeCloseTo(cursor, 9);
        }
    });

    it('a free-ended layered wall (no junction) still tiles a clean rectangle', () => {
        // Parity guard for the common case: an isolated wall must be byte-equivalent in
        // outline to today's square-capped layered prisms.
        const solo: WallInput = { id: 'S', start: { x: 0, z: 0 }, end: { x: 4, z: 0 }, thickness: GUEST_T };
        const fp = buildWallFootprint(solo, null);
        const { bands, layerSumMismatch } = buildWallLayerBands(fp, GUEST_LAYERS);
        expect(layerSumMismatch).toBeCloseTo(0, 9);
        for (const b of bands) {
            expect(b.polygon).toHaveLength(4);
            expect(polygonAreaMm2(b.polygon)).toBeCloseTo(4 * GUEST_LAYERS[b.index]! * 1e6, 3);
        }
    });

    it('a degenerate/invalid footprint yields empty bands rather than geometry', () => {
        const invalid = buildWallFootprint(
            { id: 'X', start: { x: 0, z: 0 }, end: { x: 1, z: 0 }, thickness: 0.1 },
            { id: 'X', invalid: true } as unknown as Parameters<typeof buildWallFootprint>[1],
        );
        const { bands } = buildWallLayerBands(invalid, GUEST_LAYERS);
        expect(bands.every(b => b.polygon.length === 0)).toBe(true);
    });

    it('an OVER-SUM layer stack is clipped to the footprint — never allowed to clash out', () => {
        // Authoring inconsistency: layers sum to more than wall.thickness. The bands must be
        // trimmed at the footprint boundary (union ≤ footprint), and the mismatch reported.
        const { guestFp } = scene();
        const fat = GUEST_LAYERS.map(t => t * 2);
        const { bands, layerSumMismatch } = buildWallLayerBands(guestFp, fat);
        expect(layerSumMismatch).toBeCloseTo(GUEST_T, 6);
        const whole = polygonAreaMm2(guestFp.polygon);
        const sum = bands.reduce((s, b) => s + polygonAreaMm2(b.polygon), 0);
        expect(sum).toBeLessThanOrEqual(whole * 1.001);
    });
});

// Keep the unused-import checker honest about Pt2 (type-only surface assertion).
export type _Pt2Surface = Pt2;
