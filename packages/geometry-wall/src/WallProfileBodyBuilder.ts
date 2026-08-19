/**
 * WallProfileBodyBuilder.ts — §FEAT-WALL-PROFILE-BODY (L-1067).
 *
 * THE THING THAT WAS MISSING. `wallProfile` has had a model, one authorability gate at
 * every write boundary, Zod validation, persistence, cache invalidation, a geometry-hash
 * term and an instanced-arm exclusion since slices 0 and 1 — and **no body builder read
 * the ring**. A profiled wall rebuilt, left the instanced path, and rendered the identical
 * full rectangle. `WallFragmentBuilder`'s own comment said so: *"INERT TODAY,
 * DELIBERATELY. Nothing in the repo authors `wallProfile` yet."* The founder has asked for
 * the mode three times; this is the geometry.
 *
 * ── WHY THIS IS SMALL, AND WHY THAT IS THE POINT ────────────────────────────────────
 *
 * A profile does not need a new construction. `WallHoleBodyBuilder` already builds a wall
 * as a `THREE.Shape` in the wall's own ELEVATION plane — `x` along the wall, `y` world-Y —
 * extruded along the thickness. That is exactly the frame a profile is authored in. The
 * only difference is the OUTER OUTLINE: the hole builder walks the implicit rectangle
 * (dipping around doors); this walks the authored ring. Same extruder, same frame, same
 * `translate(0, 0, −t/2)` so the solid is centred on the baseline, same caller-side
 * `rotation.y = −angle`.
 *
 * ⚠ THE RING IS AUTHORED IN THE UN-SHEARED FRAME, and that is what makes a profile and a
 *   rake COMPOSE rather than fight. `WallTypes.ts` states it: *"both measured in the
 *   UN-SHEARED frame, so a profile and a rake compose."* This builder therefore knows
 *   nothing about the rake at all — the caller applies `_applyRakeShearToChildren` to the
 *   built group afterwards, exactly as it does for the opening-bearing body, and the two
 *   compose by construction instead of by a term written here.
 *
 * ── WHAT THIS DOES NOT DO, STATED SO IT IS NOT DISCOVERED ───────────────────────────
 *
 * ✅ **THE MITRE IS NOW BUILT — §FEAT-WALL-PROFILE-MITRE (WJ1, L-1071).** The header used
 *    to say *"an `ExtrudeGeometry` outline has no per-end plane to project onto"*. That
 *    was the wrong FRAME, not a real constraint. A wall's mitre plane is VERTICAL
 *    (`buildMiterPrism.project()` solves in XZ and never writes `y`; `projectCapVertex`
 *    likewise), so in this builder's own local frame — local-x along the wall, local-z
 *    across it — a mitre plane is the plane `x = x0 − (n_lat / n_axial)·z`, INDEPENDENT
 *    OF y. The mitre is therefore a per-vertex displacement in local x that depends only
 *    on local z, and it applies to an extruded outline of ANY shape. The end faces of the
 *    ring are exactly the vertices at min-u and max-u; each is projected along +x onto its
 *    own end's plane by the identical formula `t = MN·(O − V) / (MN·dir)` that
 *    `MiterPrismBuilder` uses. Absent normals ⇒ byte-identical geometry to before.
 *
 *    ⚠ WHAT IS PROJECTED IS THE END EDGE. A profile whose end edge is a single vertical
 *    segment (every ring the editor can author today) mitres exactly. A STEPPED end — two
 *    or more vertices sharing the extreme `u` at different `v` — also mitres exactly,
 *    because the displacement is y-independent and every one of them receives it. A ring
 *    ending in a single point mitres to a point, which is correct.
 * ⛔ **NO OPENINGS, NO LAYERS, NO CURVE** — `profileAuthorability` refuses all three, so
 *    this builder is never handed one. Two of those three refusals are argued as UNBUILT
 *    rather than impossible (see L-1067); this builder does not change that argument.
 */

import * as THREE from '@pryzm/renderer-three/three';
// `wallProfileSignedArea2` is imported rather than re-derived: the winding of a profile
// ring is already a question this package answers in exactly one place, and a second
// shoelace here would be the C84 EI-9 defect in miniature.
import { wallProfileSignedArea2, type WallProfileVertex } from './WallProfile';

/** A mitre-plane normal in WORLD XZ — the same shape `JoinData.startMN` / `endMN` carry. */
export interface WallProfileMiterNormal { readonly nx: number; readonly nz: number }

export interface WallProfileBodyParams {
    /** Authored ring, `u` along the baseline from `baseLine[0]`, `v` above the wall base. */
    readonly ring: ReadonlyArray<WallProfileVertex>;
    /** Wall PLAN thickness, metres. */
    readonly thickness: number;
    /** The wall's BASE plane in the group's local frame (`WallVerticalDatum` BASE). */
    readonly baseOffset: number;
    /**
     * §FEAT-WALL-PROFILE-MITRE — the join's mitre-plane normals in WORLD XZ, exactly as
     * `JoinData.startMN` / `endMN` hold them. `direction` is the wall's unit plan direction
     * (world XZ) and is REQUIRED for either normal to be honoured: the normals are
     * world-frame and this builder works in the wall-local frame, so without the direction
     * there is no way to rotate them and the mitre is SKIPPED rather than applied in the
     * wrong frame. Absent ⇒ perpendicular ends, byte-identical to the pre-mitre builder.
     */
    readonly startMN?: WallProfileMiterNormal | null;
    readonly endMN?: WallProfileMiterNormal | null;
    readonly direction?: { readonly x: number; readonly z: number } | null;
}

/**
 * The profiled wall solid, in the SAME wall-local frame `buildWallHoleBodyGeometry`
 * returns: local-x along the wall from its start, world-Y up, centred on the baseline
 * across. The caller rotates by `−angle` about the group origin.
 *
 * Returns null — never a throw — on a ring that cannot make a solid (fewer than three
 * vertices, a non-finite coordinate, or zero enclosed area). `profileAuthorability`
 * already refuses all three at the write boundary, so reaching them here means the model
 * was mutated behind the gate; a null lets the caller keep the rectangular body rather
 * than render nothing, which is SPEC §4 ("never an empty wall").
 */
export function buildWallProfileBodyGeometry(
    p: WallProfileBodyParams,
): THREE.BufferGeometry | null {
    const { ring, thickness, baseOffset } = p;
    if (!Array.isArray(ring) || ring.length < 3) return null;
    if (!Number.isFinite(thickness) || !(thickness > 0)) return null;
    if (!Number.isFinite(baseOffset)) return null;
    for (const v of ring) {
        if (!v || !Number.isFinite(v.u) || !Number.isFinite(v.v)) return null;
    }
    const a2 = wallProfileSignedArea2(ring);
    if (!Number.isFinite(a2) || Math.abs(a2) < 1e-9) return null;

    // `THREE.Shape` wants a consistent winding; CCW is what `ExtrudeGeometry` treats as
    // the outer boundary. The ring is authored either way round — a draughtsman does not
    // think about winding — so it is normalised here rather than refused, which is the
    // same courtesy `normaliseWallHoles` extends to opening rects.
    const pts = a2 > 0 ? ring : [...ring].reverse();

    const shape = new THREE.Shape();
    // `v` is measured above the wall's BASE plane, so world-Y is `baseOffset + v` — the
    // identical expression `buildWallHoleBodyGeometry` uses for its own rectangle, and
    // the reason a profiled wall sits on the same datum as an unprofiled one.
    shape.moveTo(pts[0]!.u, baseOffset + pts[0]!.v);
    for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i]!.u, baseOffset + pts[i]!.v);
    shape.lineTo(pts[0]!.u, baseOffset + pts[0]!.v);

    const geo = new THREE.ExtrudeGeometry(shape, {
        depth: thickness,
        bevelEnabled: false,
        steps: 1,
    });
    // Centre the solid on the baseline: the extruder runs 0 → depth across the wall.
    geo.translate(0, 0, -thickness / 2);

    applyProfileMiter(geo, pts, p);
    return geo;
}

/**
 * §FEAT-WALL-PROFILE-MITRE (WJ1, L-1071) — project the ring's END EDGES onto the join's
 * mitre planes, in place.
 *
 * ── WHY THIS IS A LOCAL-FRAME SHEAR AND NOT A NEW SOLVER ───────────────────────
 *
 * A wall mitre plane is VERTICAL — `MiterPrismBuilder.project()` solves in XZ and returns
 * `base[1]` untouched, and `CurvedWallCapMiter.projectCapVertex` does the same. So in the
 * wall-local frame this builder already works in (local-x along the wall from
 * `baseLine[0]`, local-z across it, centred on the baseline) the plane through local
 * `x = x0` with world normal `n` is:
 *
 *     x = x0 − (n·perp / n·dir) · z          where perp = leftPerp(dir) = (−dz, dx)
 *
 * which is `t = MN·(O − V)/(MN·dir)` written out for `dir = local +x`. There is no `y` in
 * it. That is the whole reason an extruded outline CAN be mitred: the displacement is a
 * function of local-z alone, so it is right for every vertex of the end edge whatever
 * height the profile put it at.
 *
 * ⭐ EXACT NON-MOVEMENT IS EVIDENCE OF A DISCARDED WRITE, not of a small effect (RK1's
 *   method lesson, earned by a displacement that `projectCapVertex` overwrote and a metric
 *   that came back bit-identical). `ExtrudeGeometry` is NON-INDEXED, so one ring corner
 *   appears in several faces; each copy is displaced by VALUE, which is why the selection
 *   is on the coordinate rather than on a vertex index. If the predicate matched nothing
 *   the geometry would come back bit-identical — so the test asserts the DISPLACED X
 *   against the closed-form plane, never merely "it differs".
 *
 * §PROFILE-MITER-CLAMP mirrors `MiterPrismBuilder`'s §MITER-SEGMENT-CLAMP: a cap vertex may
 * legitimately OVERHANG past its own end (that is the outer half of the mitre reaching the
 * neighbour's outer face) but must never RETREAT past the OPPOSITE end — that is the
 * self-intersecting spike. Retreat is clamped; overhang is not.
 */
function applyProfileMiter(
    geo: THREE.BufferGeometry,
    pts: ReadonlyArray<WallProfileVertex>,
    p: WallProfileBodyParams,
): void {
    const { startMN, endMN, direction } = p;
    if (!startMN && !endMN) return;
    if (!direction) return;
    const dx = direction.x, dz = direction.z;
    if (!Number.isFinite(dx) || !Number.isFinite(dz)) return;
    const dLen = Math.hypot(dx, dz);
    if (!(dLen > 1e-9)) return;
    const ux = dx / dLen, uz = dz / dLen;

    let uMin = Infinity, uMax = -Infinity;
    for (const v of pts) { if (v.u < uMin) uMin = v.u; if (v.u > uMax) uMax = v.u; }
    if (!(uMax - uMin > 1e-6)) return;

    // "On the end edge" — tight relative to the wall but far above float noise: the
    // extruder copies the shape's own coordinates verbatim into the position buffer.
    const TOL = 1e-6;

    /** Local-frame slope `−n_lat/n_axial`, or null when the plane cannot be projected onto. */
    const slopeOf = (mn: WallProfileMiterNormal | null | undefined): number | null => {
        if (!mn || !Number.isFinite(mn.nx) || !Number.isFinite(mn.nz)) return null;
        const nAxial = mn.nx * ux + mn.nz * uz;          // n · dir
        const nLat   = mn.nx * -uz + mn.nz * ux;         // n · leftPerp(dir)
        // A mitre plane containing the wall axis has no along-axis component: the
        // projection divides by zero and sends the cap to infinity. Refused — a
        // perpendicular end is wrong-but-finite; an infinite one erases the wall.
        if (Math.abs(nAxial) < 1e-6) return null;
        return -nLat / nAxial;
    };

    const sSlope = slopeOf(startMN);
    const eSlope = slopeOf(endMN);
    if (sSlope === null && eSlope === null) return;

    const pos = geo.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const z = pos.getZ(i);
        let nx: number | null = null;
        if (sSlope !== null && Math.abs(x - uMin) <= TOL) {
            nx = uMin + sSlope * z;
            if (nx > uMax) nx = uMax;                    // §PROFILE-MITER-CLAMP
        } else if (eSlope !== null && Math.abs(x - uMax) <= TOL) {
            nx = uMax + eSlope * z;
            if (nx < uMin) nx = uMin;                    // §PROFILE-MITER-CLAMP
        }
        if (nx !== null && Number.isFinite(nx)) pos.setX(i, nx);
    }
    pos.needsUpdate = true;
    // The end caps are no longer perpendicular, so the extruder's cached flat normals are
    // stale on every face touching them. Recomputed rather than patched per face: the
    // outline is arbitrary, so which faces touch an end edge is not knowable cheaply.
    geo.computeVertexNormals();
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
}
