/**
 * §MEASURED-JUNCTION-CLASH (L-919, founder — reported REPEATEDLY, still open) — the MEASUREMENT.
 *
 * THE FOUNDER, verbatim:
 *
 *   "walls should be sound — walls junctions should be sound. If the user starts at point 1 EVEN
 *    IF THE INSERTION POINT IS MID A WALL — it should ALWAYS connect with the face of the wall —
 *    NEVER create a clash — NEVER should the created wall go THROUGH the other wall. You
 *    understand — this has been requested multiple times — still not fixed."
 *
 * ─── WHY EVERY PREVIOUS FIX MEASURED GREEN WHILE THE FOUNDER KEPT SEEING THE CLASH ────────────
 *
 * The junction machinery is NOT missing and NOT unwired. `WallJoinResolver._applyT` trims a
 * body-T to the host's lateral face, `WallRebuildCoordinator._flush` calls `resolveLevel` after
 * every store mutation (so CREATE is on the same resolver as MOVE), and
 * `WallJoinResolver.clashFreeFootprints.test.ts` proves the 3-wall T at 0 mm².
 *
 * That test — like every other T-join test in this package — calls `resolveLevel(walls)` with NO
 * options, so it runs at `DEFAULT_SNAP_RADIUS = 0.5 m`.
 *
 * THE APP DOES NOT. `WallRebuildCoordinator.ts:1570` passes
 *
 *     snapRadius = getWorldToleranceForActiveCamera(DEFAULT_SNAP_PIXEL_RADIUS = 8 px, cam, canvas)
 *
 * — a ZOOM-DEPENDENT world radius clamped to [MIN_WORLD_TOLERANCE_M = 0.05, 1.0] metres
 * (`CameraToleranceService`). And `_applyT`'s §T-JOIN-PERP-GATE safety bound is
 *
 *     perpGap = |(secJoinEp − faceO) · faceN|     // distance from the endpoint to the host FACE
 *     if (perpGap > MAX_CORNER_OFFSET) → "trim distance exceeds safety bound, skipping"
 *
 * with `MAX_CORNER_OFFSET === snapRadius`. A Midpoint (or any body) snap puts the new wall's
 * endpoint on the host's CENTRELINE — that is what snapping to a wall feature MEANS
 * geometrically — so
 *
 *     perpGap === hostThickness / 2, EXACTLY, ALWAYS.
 *
 * At the 0.05 m lower clamp — i.e. zoomed in, which is exactly when a user draws a wall — every
 * host thicker than 100 mm exceeds the bound and the trim is REFUSED. The endpoint stays where
 * the snap put it, on the centreline, and half the host's thickness is occupied by the new wall's
 * body at the moment of creation.
 *
 * §T-JOIN-PERP-GATE is not wrong to exist; it is wrong to be SIGN-BLIND. It was written
 * (2026-06-30) to close near-miss GAPS without stretching a stray wall across a room. `Math.abs`
 * makes it read "endpoint 0.10 m OUTSIDE the face, in open space" — a genuine REACH, rightly
 * bounded by how close the user aimed — and "endpoint 0.10 m INSIDE the host's solid" — a CLASH
 * whose depth is bounded BY CONSTRUCTION at the host's half-thickness, and which is never
 * evidence of a stray wall — as the same number.
 *
 * ─── WHAT THE SWEEP ACTUALLY FOUND (this is narrower than the paragraph above alone implies) ──
 *
 * A second pass, `_clampEndToShellInnerFace` (§PARTITION-SHELL-INNER-FACE), runs AFTER the joins
 * and clamps a centreline endpoint out to the host's inner face. It RESCUES the defect — but only
 * within §PARTITION-SHELL-COLLINEAR-GUARD, which rejects any host more than 30° from
 * perpendicular to the new wall (`|hostDir · partDir| > 0.5`).
 *
 * So the surviving, shipped defect is precisely:
 *
 *     LEGACY pipeline  ×  new wall more than 30° off perpendicular to its host
 *                      ×  snapRadius < host half-thickness (i.e. zoomed in)
 *
 * A user drawing in ORTHO mode onto ANY host wall that is not itself axis-aligned lands in it on
 * every gesture. That is ordinary in a real plan, and it is zoom-dependent — which is why it
 * reproduces for the founder and not in review.
 *
 * Two further facts the sweep pinned, both recorded below so the fix does not have to re-derive
 * them:
 *   • The V2 pipeline (`JunctionResolverV2` → `WallFootprint2D`) is CLEAN at every angle and both
 *     radii. Only LEGACY clashes — and LEGACY is the path LAYERED and OPENING-BEARING walls take,
 *     which is the path the founder's session was on.
 *   • Perpendicular body-T is clean at every radius (the backstop). Protected below so a fix to
 *     the oblique case cannot regress it.
 *
 * Area, not topology, for the same reason `clashFreeFootprints` chose it: a shared face registers
 * sampler-floor noise, a doubled solid registers tens of thousands. They differ by orders of
 * magnitude.
 *
 * MEASURED-OPEN tests assert the DEFECT. Invert them when the fix lands.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { WallJoinResolver } from '../src/WallJoinResolver';
import { resolveJunctions, type WallInput } from '../src/JunctionResolverV2';
import { buildAllFootprints } from '../src/WallFootprint2D';
import type { WallData } from '../src/WallTypes';

type Pt = { x: number; z: number };

let _seq = 0;
function mk(s: [number, number], e: [number, number], thickness: number, layered = false): WallData {
    return {
        id: `jc${_seq++}`, type: 'wall', levelId: 'L', properties: {}, childrenIds: [],
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
 * Sampler floor in mm². Two walls that BUTT cleanly still register a band, for two reasons that
 * are both deliberate, not noise to be tuned away:
 *   • §PARTITION-SHELL-INNER-FACE seats the endpoint `INNER_OVERLAP_M = 1 mm` INSIDE the host's
 *     face on purpose (no Z-fighting, no hairline gap) — 1 mm × 200 mm = 200 mm² by design.
 *   • the 2 mm grid sampler counts boundary cells along the shared face.
 * 800 mm² sits above both and 25× below the smallest real clash this file measures (20 000 mm²).
 */
const CLEAN_MM2 = 800;
/** Every clash this file measures is ≥ 25 000 mm². Well clear of the floor in both directions. */
const CLASH_MM2 = 20000;
const mm2 = (a: number) => a * 1e6;

/**
 * Worst pairwise footprint overlap (mm²) after a LEGACY resolve at the GIVEN snap radius — i.e.
 * the value the app produces at that zoom, not the value the 0.5 m default produces.
 */
function legacyWorstAt(walls: WallData[], snapRadius: number): number {
    const res = WallJoinResolver.resolveLevel(walls, { snapRadius }) as unknown as Map<string, {
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
    let worst = 0;
    for (let i = 0; i < fps.length; i++) {
        for (let j = i + 1; j < fps.length; j++) {
            worst = Math.max(worst, mm2(overlapArea(fps[i]!.fp, fps[j]!.fp)));
        }
    }
    return worst;
}

function v2Worst(inputs: WallInput[]): number {
    const fps = buildAllFootprints(inputs, resolveJunctions(inputs));
    let worst = 0;
    for (let i = 0; i < fps.length; i++) {
        for (let j = i + 1; j < fps.length; j++) {
            worst = Math.max(worst, mm2(overlapArea(fps[i]!.polygon, fps[j]!.polygon)));
        }
    }
    return worst;
}

// ── The founder's figures ────────────────────────────────────────────────────────────────────

/** A typical interior wall: 200 mm. Half-thickness 0.10 m — the exact perpGap a body snap makes. */
const TH = 0.20;

/**
 * A host wall at 45°, 6 m long, centred on the origin. Its MIDPOINT is (0, 0).
 * 45° is chosen because it is the WORST case for the ortho gesture and sits squarely outside
 * §PARTITION-SHELL-COLLINEAR-GUARD's 30°-of-perpendicular window, whichever ortho direction the
 * user draws — so the backstop cannot rescue it either way.
 */
const H = 3 / Math.SQRT2;
const OBLIQUE_HOST = (): WallData => mk([-H, -H], [H, H], TH, true);
/** A point on the oblique host's body that is NOT its midpoint ("even if the insertion point is mid a wall"). */
const ARBITRARY_ON_HOST: [number, number] = [H * 0.9, H * 0.9];

/** The same host, axis-aligned — the case the inner-face backstop DOES rescue. */
const PERP_HOST = (): WallData => mk([-3, 0], [3, 0], TH, true);

/**
 * App-realistic snap radii, from `CameraToleranceService`:
 *   0.05 — MIN_WORLD_TOLERANCE_M, the lower clamp: zoomed in, which is when walls get drawn
 *   0.50 — LEGACY_FALLBACK_TOLERANCE_M, and the DEFAULT every existing test silently uses
 */
const ZOOMED_IN = 0.05;
const DEFAULT_RADIUS = 0.50;

describe('§MEASURED-JUNCTION-CLASH — the founder\'s gesture at APP-REALISTIC snap radii', () => {

    it('MEASURED-OPEN — midpoint-START on an oblique host runs THROUGH it when zoomed in', () => {
        // The screenshotted gesture: begin a new wall on the host's Midpoint snap — therefore on
        // the host's CENTRELINE — and draw it in ortho mode. _applyT computes perpGap = TH/2 =
        // 0.10 > snapRadius 0.05 → "trim distance exceeds safety bound, skipping"; the inner-face
        // backstop then rejects the host as >30° from perpendicular. Nothing trims. The new wall
        // keeps its centreline start and occupies the host's near half-thickness across its width.
        const clash = legacyWorstAt([OBLIQUE_HOST(), mk([0, 0], [0, 4], TH, true)], ZOOMED_IN);
        expect(clash, 'the created wall passes THROUGH the host — DEFECT, not yet fixed')
            .toBeGreaterThan(CLASH_MM2);
        expect(clash, 'magnitude pinned so it cannot silently get worse').toBeLessThan(40000);
    });

    it('MEASURED-OPEN — midpoint-END: finishing ON the host clashes identically', () => {
        // The founder says "starts at point 1", but the invariant is symmetric: an ENDPOINT that
        // lands on another wall's body must resolve to a junction, whichever end it is.
        const clash = legacyWorstAt([OBLIQUE_HOST(), mk([0, 4], [0, 0], TH, true)], ZOOMED_IN);
        expect(clash, 'end-on-host clashes too — DEFECT').toBeGreaterThan(CLASH_MM2);
        expect(clash).toBeLessThan(40000);
    });

    it('MEASURED-OPEN — an ARBITRARY point on the body, not the midpoint', () => {
        // Nothing about the failure is special to the MIDPOINT. Every snap onto a wall's body
        // resolves to the centreline, so perpGap is halfT for all of them — which is exactly what
        // the founder means by "even if the insertion point is mid a wall".
        const clash = legacyWorstAt(
            [OBLIQUE_HOST(), mk(ARBITRARY_ON_HOST, [ARBITRARY_ON_HOST[0], ARBITRARY_ON_HOST[1] + 4], TH, true)],
            ZOOMED_IN,
        );
        expect(clash, 'an arbitrary body point clashes exactly as the midpoint does — DEFECT')
            .toBeGreaterThan(CLASH_MM2);
        expect(clash).toBeLessThan(40000);
    });

    it('ZOOM IS THE HIDDEN VARIABLE — the SAME three gestures are CLEAN at the 0.5 m default', () => {
        // This is why the defect outlived every previous fix. The resolver is correct; every test
        // that exercises it uses the default radius, at which §T-JOIN-PERP-GATE never fires. The
        // whole difference between a green suite and the founder's screenshot is one argument.
        for (const created of [
            mk([0, 0], [0, 4], TH, true),
            mk([0, 4], [0, 0], TH, true),
            mk(ARBITRARY_ON_HOST, [ARBITRARY_ON_HOST[0], ARBITRARY_ON_HOST[1] + 4], TH, true),
        ]) {
            expect(
                legacyWorstAt([OBLIQUE_HOST(), created], DEFAULT_RADIUS),
                'clean at 0.5 m — so the defect is invisible to every default-radius test',
            ).toBeLessThan(CLEAN_MM2);
        }
    });

    it('the clash threshold tracks HALF-THICKNESS exactly (perpGap is compared to snapRadius)', () => {
        // A direct read of the mechanism, with angle held constant: at a fixed 0.10 m snap radius
        // a 180 mm host (halfT 0.09 < 0.10) trims cleanly, while a 220 mm host (halfT 0.11 > 0.10)
        // does not. Nothing else differs between the two runs.
        const thin = legacyWorstAt(
            [mk([-H, -H], [H, H], 0.18, true), mk([0, 0], [0, 4], 0.18, true)], 0.10);
        const thick = legacyWorstAt(
            [mk([-H, -H], [H, H], 0.22, true), mk([0, 0], [0, 4], 0.22, true)], 0.10);
        expect(thin, 'halfT 0.09 < snapRadius 0.10 → trimmed to the face').toBeLessThan(CLEAN_MM2);
        expect(thick, 'halfT 0.11 > snapRadius 0.10 → refused → clash').toBeGreaterThan(CLASH_MM2);
    });
});

describe('§MEASURED-JUNCTION-CLASH — what is ALREADY sound (protect these against the fix)', () => {

    it('PERPENDICULAR body-T is clean at EVERY radius — the inner-face backstop rescues it', () => {
        // §PARTITION-SHELL-INNER-FACE clamps the centreline endpoint out to the host's face, and
        // its §PARTITION-SHELL-COLLINEAR-GUARD admits hosts within 30° of perpendicular. This is
        // why the founder's defect is intermittent rather than universal — and why a fix to the
        // oblique case must not disturb this path.
        for (const snap of [ZOOMED_IN, DEFAULT_RADIUS]) {
            expect(legacyWorstAt([PERP_HOST(), mk([0, 0], [0, 4], TH, true)], snap))
                .toBeLessThan(CLEAN_MM2);
            expect(legacyWorstAt([PERP_HOST(), mk([1.37, 0], [1.37, 4], TH, true)], snap))
                .toBeLessThan(CLEAN_MM2);
        }
    });

    it('the V2 pipeline is clean at every angle — only LEGACY clashes', () => {
        // Recorded so the fix is aimed at the right pipeline. V2 serves plain walls; LEGACY serves
        // LAYERED and OPENING-BEARING walls, which is the path the founder's session was on.
        // Each host is paired with an ortho new wall that is NOT collinear with it. A wall drawn
        // ALONG its host overlaps for the whole shared run in BOTH pipelines; that is an authoring
        // collision, not a junction, and is already pinned as L-C3 in clashFreeFootprints.
        const cases: Array<{ host: [number, number]; dir: [number, number] }> = [
            { host: [3, 0], dir: [0, 4] },      // axis-aligned host, perpendicular stem
            { host: [H, H], dir: [0, 4] },      // 45° host — the case LEGACY fails
            { host: [0, 3], dir: [4, 0] },      // axis-aligned host the other way
        ];
        for (const { host: [ax, az], dir: [dx, dz] } of cases) {
            expect(v2Worst([
                { id: 'H', start: { x: -ax, z: -az }, end: { x: ax, z: az }, thickness: TH },
                { id: 'N', start: { x: 0, z: 0 }, end: { x: dx, z: dz }, thickness: TH },
            ]), `V2 host (${ax},${az})`).toBeLessThan(CLEAN_MM2);
        }
    });
});
