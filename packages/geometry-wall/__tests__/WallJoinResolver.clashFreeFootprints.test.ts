/**
 * §FIX-WALL-FACE-TRIM-NO-CLASH (founder 2026-08-06) — MEASURED wall-solid overlap.
 *
 * THE INVARIANT (the deliverable; the trim pass is only one attempt at implementing it):
 *
 *   A wall that TERMINATES against another wall is trimmed to that wall's FACE.
 *   No resolved wall footprint on a level penetrates another wall's solid by more than the
 *   sampler floor — i.e. pairwise footprint intersection AREA is ~0.
 *
 * The founder: "I create a wall in the L-shape mitred join between two walls — using the MID
 * POINT (basically the INNER JOINT MITRE POINT). Why not? Still PRYZM needs to be clear and
 * not allow CLASHES. The joint should be similar but just CLEAN TO THE FACE of the wall. And
 * this T 3-walls joint is good — but we should avoid clashes too."
 *
 * The snap stays ALLOWED; only the OUTPUT must be clean. So this file measures AREA rather
 * than asserting a topology, for both pipelines' inputs:
 *   • LEGACY (`WallJoinResolver` → `buildMiterPrism`) — the path LAYERED and OPENING-BEARING
 *     walls take, which is the path the founder's session was on.
 *   • V2 (`JunctionResolverV2` → `WallFootprint2D`) — the path plain walls take.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * HONEST STATUS. Read this before trusting a green run.
 *
 *   PASSING = genuinely clash-free today, and pinned so it cannot regress:
 *     2-wall mitred L (legacy + V2), asymmetric-thickness L (V2), 3-wall T (legacy + V2).
 *     The founder's "arrow 2" T-junction is confirmed clean by MEASUREMENT (0 mm²), not by
 *     eyeballing.
 *
 *   MEASURED-OPEN = the defect is real, reproduced, and its magnitude is PINNED here so it
 *   cannot silently get worse — but it is NOT FIXED. These tests assert the DEFECT, and are
 *   named `MEASURED-OPEN`. They must be inverted to the clean assertion when the fix lands.
 *     • L-C1  inner-mitre-point join leaves ~2 520 mm² of doubled solid (legacy).
 *     • L-C2  enabling the prototype trim removes the guest's 2 520 mm² but CASCADES: it also
 *             retreats the L's own two arms by 69 mm and deletes their miter normals, so the
 *             committed mitre is destroyed (arm∩arm goes from ~124 mm² sampler noise to
 *             ~6 724 mm² of doubled solid). Trading a small notch for a broken mitre is worse,
 *             which is why `__pryzmWallFaceTrimNoClash` is DEFAULT-OFF.
 *     • L-C3  a wall drawn ALONG another wall (parallel, overlapping bands) clashes over its
 *             whole shared run (~192 500 mm²). Deliberately out of scope for a JOIN resolver:
 *             no axial trim expresses a fix for it (trimming would delete the wall). This is
 *             an authoring/snap-time concern.
 *
 * See the block comment on `WallJoinResolver._faceTrimNoClashEnabled` for the two blockers on
 * flipping the flag: the cascade above, and the fact that clearing the CAP supersedes the
 * §FIX-NEWWALL-LCORNER-FLUSH (L-94) centreline-on-face seat tolerance.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { WallJoinResolver } from '../src/WallJoinResolver';
import { resolveJunctions, type WallInput } from '../src/JunctionResolverV2';
import { buildAllFootprints } from '../src/WallFootprint2D';
import type { WallData } from '../src/WallTypes';

type Pt = { x: number; z: number };

let _seq = 0;
function mk(s: [number, number], e: [number, number], thickness: number, layered = false): WallData {
    return {
        id: `cf${_seq++}`, type: 'wall', levelId: 'L', properties: {}, childrenIds: [],
        baseLine: [{ x: s[0], y: 0, z: s[1] }, { x: e[0], y: 0, z: e[1] }],
        height: 3, thickness, baseOffset: 0, openings: [],
        layers: layered ? [{ name: 'core', thickness }] : undefined,
        metadata: { createdAt: _seq },
    } as unknown as WallData;
}

/** The rendered plan footprint of a legacy-resolved wall (baseLine + miter-plane caps). */
function legacyFootprint(jd: {
    baseLine: [THREE.Vector3, THREE.Vector3];
    startMN: { nx: number; nz: number } | null;
    endMN: { nx: number; nz: number } | null;
}, thickness: number): Pt[] {
    const [s, e] = jd.baseLine;
    const d = new THREE.Vector3(e.x - s.x, 0, e.z - s.z).normalize();
    const n = new THREE.Vector3(-d.z, 0, d.x).multiplyScalar(thickness / 2);
    const raw: Array<{ px: number; pz: number; o: THREE.Vector3; mn: { nx: number; nz: number } | null }> = [
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

/**
 * Grid-sampled intersection area (m²) of two plan polygons. Sampling (rather than exact
 * clipping) is deliberate: a mitred footprint can be non-convex at the pivot, and we only need
 * to separate "shares an edge" from "doubled solid" — those differ by 1–3 orders of magnitude.
 */
const STEP = 0.002;
function overlapArea(p: readonly Pt[], q: readonly Pt[]): number {
    if (p.length < 3 || q.length < 3) return 0;
    const xs = [...p, ...q].map(v => v.x), zs = [...p, ...q].map(v => v.z);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    let hits = 0;
    for (let x = x0 + STEP / 2; x < x1; x += STEP) {
        for (let z = z0 + STEP / 2; z < z1; z += STEP) {
            if (inPoly(x, z, p) && inPoly(x, z, q)) hits++;
        }
    }
    return hits * STEP * STEP;
}

/**
 * The sampler floor, in mm². Two walls that SHARE a mitre edge legitimately register a band of
 * boundary cells: with STEP = 2 mm and a ~0.42 m shared diagonal that is ~124 mm². A real
 * doubled solid measures thousands. 300 mm² sits an order of magnitude below the smallest
 * defect this file measures (2 520 mm²) and comfortably above the noise.
 */
const CLEAN_MM2 = 300;
const mm2 = (a: number) => a * 1e6;

/** Every pairwise overlap (mm²) among legacy-resolved walls, keyed `idA∩idB`. */
function legacyPairOverlaps(walls: WallData[]): Map<string, number> {
    const res = WallJoinResolver.resolveLevel(walls) as unknown as Map<string, {
        baseLine: [THREE.Vector3, THREE.Vector3];
        startMN: { nx: number; nz: number } | null;
        endMN: { nx: number; nz: number } | null;
    }>;
    const fps = walls.map(w => ({
        id: w.id,
        fp: legacyFootprint(
            res.get(w.id) ?? {
                baseLine: [
                    new THREE.Vector3(w.baseLine[0].x, 0, w.baseLine[0].z),
                    new THREE.Vector3(w.baseLine[1].x, 0, w.baseLine[1].z),
                ] as [THREE.Vector3, THREE.Vector3],
                startMN: null, endMN: null,
            },
            w.thickness,
        ),
    }));
    const out = new Map<string, number>();
    for (let i = 0; i < fps.length; i++) {
        for (let j = i + 1; j < fps.length; j++) {
            out.set(`${fps[i]!.id}∩${fps[j]!.id}`, mm2(overlapArea(fps[i]!.fp, fps[j]!.fp)));
        }
    }
    return out;
}

const worstOf = (m: Map<string, number>): { mm2: number; pair: string } => {
    let mm = 0, pair = '';
    for (const [k, v] of m) if (v > mm) { mm = v; pair = k; }
    return { mm2: mm, pair };
};

function maxPairOverlapV2(inputs: WallInput[]): number {
    const fps = buildAllFootprints(inputs, resolveJunctions(inputs));
    let worst = 0;
    for (let i = 0; i < fps.length; i++) {
        for (let j = i + 1; j < fps.length; j++) {
            worst = Math.max(worst, mm2(overlapArea(fps[i]!.polygon, fps[j]!.polygon)));
        }
    }
    return worst;
}

const T = 0.30;
/** The two 0.30 m arms mitre at the origin; their INNER mitre vertex is (0.15, 0.15). */
const ARM_A = (): WallData => mk([0, 0], [5, 0], T, true);
const ARM_B = (): WallData => mk([0, 0], [0, 5], T, true);
const INNER_MITRE: [number, number] = [0.15, 0.15];

const FLAG = globalThis as { __pryzmWallFaceTrimNoClash?: boolean };
afterEach(() => { delete FLAG.__pryzmWallFaceTrimNoClash; });

// ─── PASSING — genuinely clash-free today, pinned against regression ──────────────────────

describe('§FIX-WALL-FACE-TRIM-NO-CLASH — footprints that ARE clash-free', () => {

    it('LEGACY — plain 2-wall mitred L is clash-free', () => {
        const { mm2: a, pair } = worstOf(legacyPairOverlaps([ARM_A(), ARM_B()]));
        expect(a, `worst pair ${pair}`).toBeLessThan(CLEAN_MM2);
    });

    it('LEGACY — 3-wall T (the founder\'s "arrow 2") is clash-free BY MEASUREMENT', () => {
        const { mm2: a, pair } = worstOf(legacyPairOverlaps([
            mk([-4, 0], [4, 0], T, true),      // through-wall
            mk([0, 0], [0, 4], T, true),       // stem
        ]));
        expect(a, `worst pair ${pair}`).toBe(0);
    });

    it('LEGACY — asymmetric-thickness L (§FIX-WALL-TYPECHANGE-MITRE) is clash-free', () => {
        // The mitre this session introduced for a thickness step must not itself clash.
        const { mm2: a, pair } = worstOf(legacyPairOverlaps([
            mk([0, 0], [5, 0], 0.30, true),
            mk([0, 0], [0, 5], 0.10, true),
        ]));
        expect(a, `worst pair ${pair}`).toBeLessThan(CLEAN_MM2);
    });

    it('V2 — plain mitred L footprints are clash-free (the other pipeline)', () => {
        expect(maxPairOverlapV2([
            { id: 'A', start: { x: 0, z: 0 }, end: { x: 5, z: 0 }, thickness: T },
            { id: 'B', start: { x: 0, z: 0 }, end: { x: 0, z: 5 }, thickness: T },
        ])).toBeLessThan(CLEAN_MM2);
    });

    it('V2 — asymmetric-thickness L footprints are clash-free', () => {
        expect(maxPairOverlapV2([
            { id: 'A', start: { x: 0, z: 0 }, end: { x: 5, z: 0 }, thickness: 0.30 },
            { id: 'B', start: { x: 0, z: 0 }, end: { x: 0, z: 5 }, thickness: 0.10 },
        ])).toBeLessThan(CLEAN_MM2);
    });

    it('V2 — 3-wall T footprints are clash-free', () => {
        expect(maxPairOverlapV2([
            { id: 'H', start: { x: -4, z: 0 }, end: { x: 4, z: 0 }, thickness: T },
            { id: 'S', start: { x: 0, z: 0 }, end: { x: 0, z: 4 }, thickness: T },
        ])).toBeLessThan(CLEAN_MM2);
    });
});

// ─── MEASURED-OPEN — real defects, reproduced, magnitude pinned, NOT FIXED ────────────────

describe('§FIX-WALL-FACE-TRIM-NO-CLASH — MEASURED-OPEN defects (assert the DEFECT, not a fix)', () => {

    it('MEASURED-OPEN L-C1 — a wall snapped to the INNER MITRE POINT leaves doubled solid', () => {
        // The founder's "arrow 1". No existing pass claims this endpoint: T-projection needs a
        // MID-SPAN contact, and `_clampEndToShellInnerFace` rejects both hosts twice over — the
        // `endMargin` test (WallJoinResolver.ts ~:434) requires the perpendicular foot to be one
        // host half-thickness clear of the host's ENDS, which at a CORNER it never is, and
        // §PARTITION-SHELL-COLLINEAR-GUARD (~:437) rejects anything >30° off perpendicular,
        // which an oblique wall out of a corner always is. So the endpoint stays where the
        // author put it — inside the host's solid.
        // WHEN FIXED: invert this to `toBeLessThan(CLEAN_MM2)` and move it into the block above.
        const guest = mk([3, 3], INNER_MITRE, 0.10, true);
        const overlaps = legacyPairOverlaps([ARM_A(), ARM_B(), guest]);
        const guestClash = Math.max(...[...overlaps].filter(([k]) => k.includes(guest.id)).map(([, v]) => v));
        expect(guestClash, 'the inner-mitre join still doubles solid — DEFECT, not yet fixed')
            .toBeGreaterThan(1000);
        // Pin the magnitude so it cannot silently get WORSE while it waits for a fix.
        expect(guestClash).toBeLessThan(4000);
    });

    it('MEASURED-OPEN L-C2 — the prototype trim fixes the guest but CASCADES onto the L\'s arms', () => {
        // Enabling `__pryzmWallFaceTrimNoClash` retreats the guest correctly (69 mm, clean to
        // the face) — but the two ARMS' own mitre corners legitimately sit at (0.15, 0.15),
        // INSIDE the guest's band, so the symmetric rule reads them as clashes too and retreats
        // both arms by 69 mm, deleting their miter normals. The committed mitre is destroyed.
        // The missing ingredient is a PRIORITY rule (newcomer yields; committed corner is
        // immutable — the principle §FIX-WALL-3RD-AT-LCORNER-IMMUTABLE already encodes for
        // detection). Until that exists the flag must stay OFF.
        FLAG.__pryzmWallFaceTrimNoClash = true;
        const guest = mk([3, 3], INNER_MITRE, 0.10, true);
        const armA = ARM_A(), armB = ARM_B();
        const overlaps = legacyPairOverlaps([armA, armB, guest]);
        // The guest IS cleaned up by the trim…
        const guestClash = Math.max(...[...overlaps].filter(([k]) => k.includes(guest.id)).map(([, v]) => v));
        expect(guestClash, 'the trim does clean the guest').toBeLessThan(CLEAN_MM2);
        // …but at the cost of the arms' own mitre. THIS is why the flag is default-OFF.
        const armClash = overlaps.get(`${armA.id}∩${armB.id}`)!;
        expect(armClash, 'CASCADE: the committed L mitre is destroyed by the trim')
            .toBeGreaterThan(CLEAN_MM2);
    });

    it('MEASURED-OPEN L-C3 — a wall drawn ALONG another wall clashes for its whole run', () => {
        // Out of scope for a JOIN resolver by design: two walls sharing a run overlap along
        // their whole length, and no axial trim expresses a fix (trimming would delete the
        // wall). Recorded here so the magnitude is known and the case is not forgotten — the
        // fix belongs at authoring/snap time, not in `resolveLevel`.
        const guest = mk([4, 0.15], INNER_MITRE, 0.10, true);   // parallel to arm A, on its face
        const overlaps = legacyPairOverlaps([ARM_A(), ARM_B(), guest]);
        const guestClash = Math.max(...[...overlaps].filter(([k]) => k.includes(guest.id)).map(([, v]) => v));
        expect(guestClash, 'wall-along-wall clash is real and unaddressed').toBeGreaterThan(100000);
    });
});

// ─── Properties the prototype trim DOES satisfy (so a future fix keeps them) ──────────────

describe('§FIX-WALL-FACE-TRIM-NO-CLASH — invariants the trim must preserve', () => {

    it('the inner-mitre snap stays PERMITTED — the wall is trimmed, never refused', () => {
        FLAG.__pryzmWallFaceTrimNoClash = true;
        const guest = mk([3, 3], INNER_MITRE, 0.10, true);
        const res = WallJoinResolver.resolveLevel([ARM_A(), ARM_B(), guest]) as unknown as
            Map<string, { baseLine: [THREE.Vector3, THREE.Vector3]; invalid?: boolean }>;
        const jg = res.get(guest.id);
        expect(jg?.invalid, 'the guest wall is not thrown away').toBeFalsy();
        const bl = jg?.baseLine;
        const len = bl ? bl[0].distanceTo(bl[1]) : 0;
        expect(len, 'the guest keeps essentially its full length').toBeGreaterThan(3.9);
    });

    it('the trim never moves an endpoint OFF its own axis (no §DIAG-ROOM-LOOP regression)', () => {
        // The lesson from §FIX-WALL-TYPECHANGE-MITRE: a LATERAL displacement is what breaks
        // room-loop closure. This pass retreats ALONG the wall's own axis only, so it cannot
        // re-open that defect. The guest's source axis is the line x = z.
        FLAG.__pryzmWallFaceTrimNoClash = true;
        const guest = mk([3, 3], INNER_MITRE, 0.10, true);
        const res = WallJoinResolver.resolveLevel([ARM_A(), ARM_B(), guest]) as unknown as
            Map<string, { baseLine: [THREE.Vector3, THREE.Vector3] }>;
        const bl = res.get(guest.id)!.baseLine;
        expect(Math.abs(bl[0].x - bl[0].z)).toBeLessThan(1e-6);
        expect(Math.abs(bl[1].x - bl[1].z)).toBeLessThan(1e-6);
    });

    it('the trim is IDEMPOTENT (reopening a project does not drift the geometry)', () => {
        FLAG.__pryzmWallFaceTrimNoClash = true;
        const walls = [ARM_A(), ARM_B(), mk([3, 3], INNER_MITRE, 0.10, true)];
        const r1 = WallJoinResolver.resolveLevel(walls) as unknown as
            Map<string, { baseLine: [THREE.Vector3, THREE.Vector3] }>;
        const persisted = walls.map(w => {
            const j = r1.get(w.id);
            if (!j) return w;
            return {
                ...w,
                baseLine: [
                    { x: j.baseLine[0].x, y: 0, z: j.baseLine[0].z },
                    { x: j.baseLine[1].x, y: 0, z: j.baseLine[1].z },
                ],
            } as WallData;
        });
        const r2 = WallJoinResolver.resolveLevel(persisted) as unknown as
            Map<string, { baseLine: [THREE.Vector3, THREE.Vector3] }>;
        for (const w of walls) {
            const a = r1.get(w.id), b = r2.get(w.id);
            if (!a || !b) continue;
            expect(a.baseLine[0].distanceTo(b.baseLine[0]), `${w.id} start drift`).toBeLessThan(1e-3);
            expect(a.baseLine[1].distanceTo(b.baseLine[1]), `${w.id} end drift`).toBeLessThan(1e-3);
        }
    });

    it('with the flag OFF (the shipped default) nothing is trimmed — the pass is inert', () => {
        const guest = mk([3, 3], INNER_MITRE, 0.10, true);
        const res = WallJoinResolver.resolveLevel([ARM_A(), ARM_B(), guest]) as unknown as
            Map<string, { baseLine: [THREE.Vector3, THREE.Vector3] }>;
        const bl = res.get(guest.id)!.baseLine;
        expect(bl[1].x, 'guest endpoint left exactly where the author put it').toBeCloseTo(0.15, 6);
        expect(bl[1].z).toBeCloseTo(0.15, 6);
    });
});
