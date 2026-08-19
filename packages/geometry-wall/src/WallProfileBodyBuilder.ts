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
 * ⛔ **NO MITRE.** The end faces are cut perpendicular to the wall, at `u = 0` and
 *    `u = length`. `buildWallHoleBodyGeometry` has the same limitation and the same
 *    reason: an `ExtrudeGeometry` outline has no per-end plane to project onto. A
 *    profiled wall at a mitred junction will therefore show the pre-mitre end. That is a
 *    REAL limitation, it is why the profile gate is narrow, and it is the first thing to
 *    fix if profiles are wanted on joined walls.
 * ⛔ **NO OPENINGS, NO LAYERS, NO CURVE** — `profileAuthorability` refuses all three, so
 *    this builder is never handed one. Two of those three refusals are argued as UNBUILT
 *    rather than impossible (see L-1067); this builder does not change that argument.
 */

import * as THREE from '@pryzm/renderer-three/three';
// `wallProfileSignedArea2` is imported rather than re-derived: the winding of a profile
// ring is already a question this package answers in exactly one place, and a second
// shoelace here would be the C84 EI-9 defect in miniature.
import { wallProfileSignedArea2, type WallProfileVertex } from './WallProfile';

export interface WallProfileBodyParams {
    /** Authored ring, `u` along the baseline from `baseLine[0]`, `v` above the wall base. */
    readonly ring: ReadonlyArray<WallProfileVertex>;
    /** Wall PLAN thickness, metres. */
    readonly thickness: number;
    /** The wall's BASE plane in the group's local frame (`WallVerticalDatum` BASE). */
    readonly baseOffset: number;
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
    return geo;
}
