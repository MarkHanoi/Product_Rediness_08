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
 * ─── THE FIX, AND WHAT IT DID NOT CLOSE ───────────────────────────────────────────────────────
 *
 * §FIX-T-JOIN-PENETRATION-IS-NOT-A-REACH gives §T-JOIN-PERP-GATE its sign back. An endpoint
 * OUTSIDE the host's face is a REACH across open space and stays bounded by the snap radius — how
 * far we may reach really is a question about how close the user aimed. An endpoint INSIDE the
 * host's solid is a CLASH: its depth is bounded by construction at the host's own thickness, two
 * solids cannot share a volume at any zoom, and the camera gets no vote. Only the second branch is
 * new, so the change is narrow — it fires only for endpoints strictly inside a host's band.
 *
 * The snap point is NOT moved. Snapping to a Midpoint is correct and useful; the user is aiming at
 * a real feature of the host and the UI's dimension readouts are driven by it. It is the CREATION
 * that now reads "on the body" as "join here" rather than "start my centreline here".
 *
 * MEASURED, midpoint-start / midpoint-end / arbitrary-point, 200 mm walls, 45° host, 0.05 m
 * radius:  28 400 mm² → 0 mm².  The 180/220 mm thickness cliff (0 vs 28 400 across a 40 mm step)
 * is gone: both read 0.
 *
 * STILL OPEN, pinned below rather than left to be rediscovered:
 *   • GRAZING approaches (< ~30° off the host axis) are still refused, deliberately — clearing a
 *     penetration costs `penetration / sin(approach)` along the wall's own axis, which grows
 *     without limit as the approach flattens, and a wall running nearly ALONG its host is an
 *     authoring collision rather than a junction (the same case §FIX-WALL-FACE-TRIM-NO-CLASH
 *     declares out of scope because trimming would delete the wall).
 *   • A wall CROSSING clean through a host and terminating beyond it is not a T-join and is not
 *     addressed here.
 *   • The L-C1 inner-mitre-corner clash (`clashFreeFootprints.test.ts`) is untouched: that
 *     endpoint sits exactly ON a face with penetration 0, so this branch never fires for it.
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

    it('FIXED — midpoint-START on an oblique host terminates at the FACE, zoomed in', () => {
        // The screenshotted gesture: begin a new wall on the host's Midpoint snap — therefore on
        // the host's CENTRELINE — and draw it in ortho mode.
        //   BEFORE §FIX-T-JOIN-PENETRATION-IS-NOT-A-REACH: 28 400 mm² of doubled solid. _applyT
        //   computed perpGap = TH/2 = 0.10 > snapRadius 0.05 → "trim distance exceeds safety
        //   bound, skipping", and the inner-face backstop then rejected the host as >30° from
        //   perpendicular. Nothing trimmed; the wall kept its centreline start and ran THROUGH.
        //   AFTER: 0 mm². The endpoint is inside the host's solid, so the gate no longer measures
        //   it against the camera-derived snap radius at all — it is a clash, bounded by the
        //   host's own thickness, and it is trimmed back along the wall's own axis to the face.
        const clash = legacyWorstAt([OBLIQUE_HOST(), mk([0, 0], [0, 4], TH, true)], ZOOMED_IN);
        expect(clash, 'the created wall terminates at the host FACE — no doubled solid')
            .toBeLessThan(CLEAN_MM2);
    });

    it('FIXED — midpoint-END: finishing ON the host terminates at the face too', () => {
        // The founder says "starts at point 1", but the invariant is symmetric: an ENDPOINT that
        // lands on another wall's body must resolve to a junction, whichever end it is.
        // BEFORE 28 400 mm² → AFTER 0 mm².
        expect(legacyWorstAt([OBLIQUE_HOST(), mk([0, 4], [0, 0], TH, true)], ZOOMED_IN))
            .toBeLessThan(CLEAN_MM2);
    });

    it('FIXED — an ARBITRARY point on the body, not the midpoint', () => {
        // Nothing about the failure was special to the MIDPOINT. Every snap onto a wall's body
        // resolves to the centreline, so the penetration is halfT for all of them — which is
        // exactly what the founder means by "even if the insertion point is mid a wall".
        // BEFORE 28 400 mm² → AFTER 0 mm².
        expect(legacyWorstAt(
            [OBLIQUE_HOST(), mk(ARBITRARY_ON_HOST, [ARBITRARY_ON_HOST[0], ARBITRARY_ON_HOST[1] + 4], TH, true)],
            ZOOMED_IN,
        )).toBeLessThan(CLEAN_MM2);
    });

    it('ZOOM IS NO LONGER A VARIABLE — the same three gestures are clean at the 0.5 m default too', () => {
        // Zoom-dependence is what let the defect outlive every previous fix: every test that
        // exercises the resolver uses the default radius, at which §T-JOIN-PERP-GATE never fired,
        // so the whole difference between a green suite and the founder's screenshot was one
        // argument. These were already clean here BEFORE the fix; they must STAY clean, and they
        // now agree with the 0.05 m readings above — the same drawing resolves identically at
        // every zoom, which is the property that actually closes this defect.
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

    it('FIXED — thickness no longer decides: host half-thickness vs snap radius is not asked', () => {
        // The sharpest read of the old mechanism, with angle held constant: at a fixed 0.10 m snap
        // radius a 180 mm host (halfT 0.09 < 0.10) trimmed cleanly while a 220 mm host
        // (halfT 0.11 > 0.10) did NOT — 0 mm² vs 28 400 mm², with nothing differing between the
        // two runs but 40 mm of host thickness straddling the camera's radius. Both are 0 now:
        // a penetrating endpoint is never measured against the snap radius, so the comparison
        // that produced this cliff is not made at all.
        for (const t of [0.18, 0.22]) {
            expect(
                legacyWorstAt([mk([-H, -H], [H, H], t, true), mk([0, 0], [0, 4], t, true)], 0.10),
                `host thickness ${t} m`,
            ).toBeLessThan(CLEAN_MM2);
        }
    });
});

/**
 * §JOINT-AUTHORITY-IS-THE-INCUMBENT (founder, 2026-08-15) — the OTHER half of the invariant.
 *
 *   "The perimeter wall joints — NEVER should be changed after creation because an interior wall
 *    is created. NO MATTER the mitre joint. NO MATTER the type of wall. The 3rd wall created in
 *    this case needs to ADAPT and connect with the FACE of the wall originally there."
 *
 * An existing junction is AUTHORITATIVE. A wall created later ADAPTS to it; it never modifies it.
 * The resolution is ONE-SIDED: trim the NEWCOMER to the incumbent's face, and leave every wall
 * that was already joined byte-identical.
 *
 * This is the half that has been silently failing, so it is asserted directly: resolve the
 * incumbents ALONE, keep their resolved geometry, resolve again WITH the newcomer present, and
 * require the incumbents' baselines AND miter normals to be unchanged to 1e-9. Miter normals are
 * compared as well as endpoints because losing a mitre normal is exactly how a previously-correct
 * L-corner degrades into the founder's triangular prism in 3D — the endpoints can be identical
 * while the cap plane silently reverts to square.
 */
function resolvedOf(walls: WallData[], snapRadius: number) {
    const res = WallJoinResolver.resolveLevel(walls, { snapRadius }) as unknown as Map<string, {
        baseLine: [THREE.Vector3, THREE.Vector3];
        startMN: { nx: number; nz: number } | null;
        endMN: { nx: number; nz: number } | null;
    }>;
    return res;
}

function expectIncumbentUnchanged(
    before: ReturnType<typeof resolvedOf>,
    after: ReturnType<typeof resolvedOf>,
    ids: string[],
    label: string,
) {
    for (const id of ids) {
        const a = before.get(id), b = after.get(id);
        expect(Boolean(a), `${label}: ${id} had no resolved entry before`).toBe(Boolean(b));
        if (!a || !b) continue;
        expect(a.baseLine[0].distanceTo(b.baseLine[0]), `${label}: ${id} START moved`).toBeLessThan(1e-9);
        expect(a.baseLine[1].distanceTo(b.baseLine[1]), `${label}: ${id} END moved`).toBeLessThan(1e-9);
        // A mitre that silently reverts to a square cap is the founder's 3D triangular prism.
        expect(JSON.stringify(a.startMN), `${label}: ${id} startMN changed`).toBe(JSON.stringify(b.startMN));
        expect(JSON.stringify(a.endMN), `${label}: ${id} endMN changed`).toBe(JSON.stringify(b.endMN));
    }
}

describe('§JOINT-AUTHORITY-IS-THE-INCUMBENT — creating a wall must not re-solve existing joints', () => {

    it('a lone host is byte-identical after a newcomer lands on its body', () => {
        const host = OBLIQUE_HOST();
        const before = resolvedOf([host], ZOOMED_IN);
        const after = resolvedOf([host, mk([0, 0], [0, 4], TH, true)], ZOOMED_IN);
        expectIncumbentUnchanged(before, after, [host.id], 'lone host');
    });

    it('an incumbent L-CORNER is byte-identical after a 3rd wall lands on one arm\'s body', () => {
        // The founder's case verbatim: two perimeter walls already mitred at a corner, then an
        // interior wall created onto one of them. The corner must not move, and its mitre must
        // not change — "NO MATTER the mitre joint".
        const armA = mk([0, 0], [6, 0], TH, true);
        const armB = mk([0, 0], [0, 6], TH, true);
        const before = resolvedOf([armA, armB], ZOOMED_IN);
        // Newcomer meets arm A mid-span, well clear of the corner, at 45° — the angle the fix
        // newly trims, so this exercises the NEW branch rather than a path that was already inert.
        const newcomer = mk([3, 0], [5, 2], TH, true);
        const after = resolvedOf([armA, armB, newcomer], ZOOMED_IN);
        expectIncumbentUnchanged(before, after, [armA.id, armB.id], 'incumbent L');
    });

    it('the newcomer in that same scene IS trimmed — adaptation is one-sided, not mutual', () => {
        // The incumbent assertions above would also pass if NOTHING resolved. This pins the other
        // side: the newcomer really does adapt to arm A's face, so "unchanged incumbent" is not
        // being bought by doing nothing at all.
        const armA = mk([0, 0], [6, 0], TH, true);
        const armB = mk([0, 0], [0, 6], TH, true);
        const newcomer = mk([3, 0], [5, 2], TH, true);
        const res = resolvedOf([armA, armB, newcomer], ZOOMED_IN);
        const nb = res.get(newcomer.id)!.baseLine;
        // Arm A runs along z = 0 with halfT 0.10; the newcomer approaches from +z, so its start
        // must sit ON arm A's +z face, not on arm A's centreline where the snap put it.
        expect(nb[0].z, 'newcomer start pulled back to the host FACE').toBeGreaterThan(TH / 2 - 0.0015);
        expect(nb[0].distanceTo(nb[1]), 'newcomer keeps a sane length').toBeGreaterThan(2.5);
    });

    it('incumbent immutability holds for PLAIN walls too — "no matter the type of wall"', () => {
        const armA = mk([0, 0], [6, 0], TH, false);
        const armB = mk([0, 0], [0, 6], TH, false);
        const before = resolvedOf([armA, armB], ZOOMED_IN);
        const after = resolvedOf([armA, armB, mk([3, 0], [5, 2], TH, false)], ZOOMED_IN);
        expectIncumbentUnchanged(before, after, [armA.id, armB.id], 'plain incumbent L');
    });

    it('LEGACY holds even when the newcomer lands EXACTLY ON the incumbent corner', () => {
        // The hardest case for a cluster-based solver: three endpoints coincide, so a solver that
        // re-clusters would re-solve the committed mitre. Legacy does not — §FIX-EXISTING-CORNER-
        // IMMUTABLE and §FIX-WALL-3RD-AT-LCORNER-IMMUTABLE already encode the founder's priority
        // rule here. Measured at 0.00 mm on both arms, both radii, layered and plain.
        for (const layered of [true, false]) {
            const armA = mk([0, 0], [6, 0], TH, layered);
            const armB = mk([0, 0], [0, 6], TH, layered);
            const before = resolvedOf([armA, armB], ZOOMED_IN);
            const after = resolvedOf([armA, armB, mk([0, 0], [3, 3], TH, layered)], ZOOMED_IN);
            expectIncumbentUnchanged(before, after, [armA.id, armB.id], `on-corner layered=${layered}`);
        }
    });
});

describe('§JOINT-AUTHORITY-IS-THE-INCUMBENT — MEASURED-OPEN in V2 (owned by lane L920)', () => {

    it('MEASURED-OPEN — V2 RE-SOLVES an incumbent L corner when a 3rd wall lands on it', () => {
        // THE MEASURED FACT the founder is reporting as "creating a third wall corrupts a
        // previously-correct L-junction (a triangular prism in 3D)". The two pipelines DISAGREE,
        // and that disagreement is the defect:
        //
        //     newcomer lands exactly ON the incumbent corner, 200 mm walls
        //       LEGACY (WallJoinResolver)  — both arms move 0.000 mm      ✓ incumbent authoritative
        //       V2     (JunctionResolverV2)— both arms move 141.421 mm    ✗ incumbent re-solved
        //
        //   141.421 mm is halfT × √2 — the mitre vertex diagonal. The committed corner is being
        //   re-clustered as a fresh 3-way junction rather than left alone, which is exactly how a
        //   correct L degrades into a prism once the extruder lofts the moved cap vertices.
        //
        //   THE SEAM: V2 does carry the priority rule — §FIX-WALL-V2-EXISTING-CORNER-IMMUTABLE
        //   (L-130) — but it is keyed on the newcomer having a DIFFERENT `systemTypeId`, and
        //   JunctionResolverV2.ts:639 says so plainly: "when systemTypeId is absent on all walls
        //   (the common type-less V2 case) → no-op". The founder's rule overrides that key
        //   explicitly — "NO MATTER the mitre joint. NO MATTER the type of wall." Incumbency is
        //   established by EXISTING, not by differing in type.
        //
        //   NOT FIXED HERE. `JunctionResolverV2.ts` is lane L920's file; this lane pins the
        //   measurement so the fix has an oracle and cannot be declared done by inspection.
        //   WHEN FIXED: invert to `toBeLessThan(0.001)` and move into the block above.
        const TH_ = TH;
        const armA: WallInput = { id: 'A', start: { x: 0, z: 0 }, end: { x: 6, z: 0 }, thickness: TH_ };
        const armB: WallInput = { id: 'B', start: { x: 0, z: 0 }, end: { x: 0, z: 6 }, thickness: TH_ };
        const newcomer: WallInput = { id: 'C', start: { x: 0, z: 0 }, end: { x: 3, z: 3 }, thickness: TH_ };

        const before = new Map(buildAllFootprints([armA, armB], resolveJunctions([armA, armB])).map(f => [f.id, f.polygon]));
        const after = new Map(buildAllFootprints([armA, armB, newcomer], resolveJunctions([armA, armB, newcomer])).map(f => [f.id, f.polygon]));

        for (const id of ['A', 'B']) {
            const p = before.get(id)!, q = after.get(id)!;
            expect(p.length, `${id} vertex count`).toBe(q.length);
            let worstMm = 0;
            for (let i = 0; i < p.length; i++) {
                worstMm = Math.max(worstMm, Math.hypot(p[i]!.x - q[i]!.x, p[i]!.z - q[i]!.z) * 1000);
            }
            expect(worstMm, `${id}: V2 moves the incumbent arm — DEFECT, owned by L920`)
                .toBeGreaterThan(100);
            expect(worstMm, `${id}: magnitude pinned (halfT × √2 = 141.42 mm)`).toBeLessThan(150);
        }
    });

    it('V2 leaves the incumbent alone when the newcomer lands on a BODY, not on the corner', () => {
        // Scopes the V2 defect precisely: it is the co-terminating CLUSTER that re-solves, not any
        // contact with an incumbent. A body-T at 0.15 m, 0.30 m or mid-span moves the arms 0.000 mm.
        const armA: WallInput = { id: 'A', start: { x: 0, z: 0 }, end: { x: 6, z: 0 }, thickness: TH };
        const armB: WallInput = { id: 'B', start: { x: 0, z: 0 }, end: { x: 0, z: 6 }, thickness: TH };
        const before = new Map(buildAllFootprints([armA, armB], resolveJunctions([armA, armB])).map(f => [f.id, f.polygon]));
        for (const startX of [0.15, 0.30, 3.0]) {
            const nc: WallInput = { id: 'C', start: { x: startX, z: 0 }, end: { x: 3, z: 3 }, thickness: TH };
            const after = new Map(buildAllFootprints([armA, armB, nc], resolveJunctions([armA, armB, nc])).map(f => [f.id, f.polygon]));
            for (const id of ['A', 'B']) {
                const p = before.get(id)!, q = after.get(id)!;
                let worstMm = 0;
                for (let i = 0; i < p.length; i++) {
                    worstMm = Math.max(worstMm, Math.hypot(p[i]!.x - q[i]!.x, p[i]!.z - q[i]!.z) * 1000);
                }
                expect(worstMm, `${id} with newcomer at x=${startX}`).toBeLessThan(0.001);
            }
        }
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

    it('STILL OPEN — a GRAZING approach (<30° off the host axis) is still refused, deliberately', () => {
        // Not an oversight, and not something the fix quietly half-did. Clearing a penetration
        // costs `penetration / sin(approach)` along the wall's OWN axis, so as the approach
        // flattens the retreat grows without limit; a wall running nearly ALONG its host is an
        // authoring collision, not a junction, and no axial trim expresses a fix for it (the same
        // ground §FIX-WALL-FACE-TRIM-NO-CLASH declares out of scope as "trimming would delete the
        // wall"). Pinned so the boundary of the fix is measured rather than assumed, and so this
        // case cannot be mistaken for proven-sound. A host 15° off the new wall's axis needs a
        // 386 mm retreat to clear a 100 mm penetration — nearly 4× the host's thickness.
        const r = (15 * Math.PI) / 180;
        const gx = Math.cos(r) * 3, gz = Math.sin(r) * 3;
        const clash = legacyWorstAt(
            [mk([-gx, -gz], [gx, gz], TH, true), mk([0, 0], [4, 0], TH, true)],
            ZOOMED_IN,
        );
        expect(clash, 'grazing approach remains un-trimmed — DECLARED, not fixed')
            .toBeGreaterThan(CLASH_MM2);
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
