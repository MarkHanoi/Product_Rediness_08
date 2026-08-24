/**
 * §RULING-ORTHO-IS-THE-PERPENDICULAR-FOOT — THE ortho constraint for the whole repo,
 * in ONE function, for the first time.
 *
 * ── THE FOUNDER RULING (2026-08-24) ──────────────────────────────────────────
 *
 * Shown a measured table in which ONE ortho gesture committed TWO different wall
 * lengths — identical 0.000° angles, up to 1464 mm apart on a 5 m drag — he ruled:
 *
 *   **PROJECTION — the perpendicular foot.** The endpoint tracks the cursor's
 *   perpendicular foot on the axis. Moving the cursor SIDEWAYS does not change the
 *   length; moving ALONG the axis grows it. (The AutoCAD/Revit convention.)
 *
 * His reasoning is his own earlier ruling turned back on itself — **ORTHO IS A MODE,
 * NOT AN AID.** Under the rule this replaces, a wall could GROW out of a cursor motion
 * with ZERO component along its own axis. MEASURED: with the cursor's AXIAL component
 * frozen at 4.000 m and only the perpendicular offset sweeping out to 3.9 m, rotation
 * grew the wall 4000 → 5587 mm (+1587 mm); projection cannot move it at all. That is
 * the mode REINTERPRETING a magnitude the user never made along that axis.
 * **Projection constrains the gesture; rotation reinterpreted it.**
 *
 * ⚠ AN EARLIER DRAFT OF THIS PARAGRAPH ILLUSTRATED THE POINT WITH "a 5 m drag at 80°
 * still gives a 5 m wall". THAT EXAMPLE IS WRONG and is corrected here rather than
 * quietly dropped: at 80° the NEARER cardinal is the OTHER axis, so that drag is
 * almost entirely AXIAL and the two rules differ by only 76 mm. The real worst case is
 * 45° — 1464 mm on a 5 m drag, 29.3% — where the two axes are equidistant. A correct
 * ruling defended by a wrong illustration is fragile.
 *
 * ⚠ HE WAS TOLD IT WAS THE EXPENSIVE ANSWER AND CHOSE IT ANYWAY. The census put the
 * 3-D wall tool alone on projection — 1 of 8 — so the ruling moves SEVEN paths, not
 * one, and it reverses part of a 2026-08-06 directive of his own (see below). ⛔ Do
 * not "simplify" this back toward the cheaper migration.
 *
 * ── WHAT THIS REPLACES, AND THE DIRECTIVE IT PARTLY REVERSES ────────────────
 *
 * `geometry-slab/boundaryPath.orthoConstrain` implemented ROTATE — snap the DIRECTION
 * to the nearest cardinal and PRESERVE the radial distance |cursor − start|. It was
 * written on 2026-08-06 on the founder's instruction *"During SLAB creation, FLOOR
 * FINISH creation and CEILING creation I want the SAME OPTIONS as during WALL
 * creation"*, and the floor and ceiling handlers — WHICH UNTIL THEN PROJECTED — were
 * deliberately changed to rotate to match the wall PLAN tool.
 *
 * ⭐ THE 2026-08-06 DIRECTIVE IS NOT REVERSED. It said the tools must AGREE. They
 * still do — all of them, including the 3-D wall tool, which that pass missed. What
 * is reversed is only WHICH rule they agree on, and that is the question 2026-08-06
 * never actually asked.
 *
 * ── WHY IT LIVES IN THE KERNEL ──────────────────────────────────────────────
 *
 * ⛔ NOT for tidiness — for a CYCLE. `geometry-slab` depends on `geometry-wall` AND
 * `geometry-wall` depends on `geometry-slab` (both declared). Making either one's
 * ortho delegate to the other's adds a module-init edge across that cycle, and this
 * repo has a standing failure mode for exactly that (a circular barrel resolving to
 * `undefined` at module load → white screen; `WallTool.ts:73-82` already documents
 * dodging it via a pure subpath). `geometry-kernel` depends on NEITHER and both
 * depend on it, so this is the one home that is a tree rather than a cycle. It is
 * also where the declared tolerance policy lives (C73 §2.2), which is the same kind
 * of fact: a rule the whole repo must answer identically.
 *
 * Pure math. No THREE, no DOM, no store, no I/O.
 */

/** A point on the world XZ plane (the plan plane). */
export interface OrthoPointXZ {
    readonly x: number;
    readonly z: number;
}

/**
 * THE ortho constraint: project `point` onto whichever cardinal axis through `start`
 * it is nearer to, keeping only the component ALONG that axis.
 *
 * The returned point is exactly axis-aligned with `start` (0.000° off the nearest
 * cardinal) and its distance from `start` is the cursor's component along that axis —
 * so perpendicular cursor motion moves the endpoint not at all.
 *
 * ⛔ THE COMPARISON IS `>`, NOT `>=`, AND THE TIE MATTERS. At an exact 45° the two
 * axes are equidistant and the choice is arbitrary; `>` resolves the tie to the Z
 * axis. This is the pre-existing behaviour of `WallTool._applyOrthoLock`, preserved
 * deliberately so the tool that ALREADY projected commits byte-identical geometry
 * after this change. Do not "clean it up" to `>=` — that silently moves every
 * exactly-45° wall onto the other axis.
 */
export function orthoConstrainXZ<T extends OrthoPointXZ>(
    start: OrthoPointXZ,
    point: T,
): { x: number; z: number } {
    const dx = Math.abs(point.x - start.x);
    const dz = Math.abs(point.z - start.z);
    return dx > dz
        ? { x: point.x, z: start.z }   // nearer the X axis — keep x, flatten z
        : { x: start.x, z: point.z };  // nearer the Z axis — keep z, flatten x
}

/**
 * Departure of the segment `start → end` from the NEAREST cardinal axis, in degrees,
 * in [0, 45]. THE measure for "did ortho hold": a boolean cannot tell a wall 0.22°
 * off axis from one 45° off axis, and both of those are failures of a different size.
 * A degenerate (zero-length) segment has no direction and reports 0.
 */
export function offAxisDegXZ(start: OrthoPointXZ, end: OrthoPointXZ): number {
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    if (dx === 0 && dz === 0) return 0;
    const deg = Math.atan2(dz, dx) * (180 / Math.PI);
    return Math.abs(deg - Math.round(deg / 90) * 90);
}
