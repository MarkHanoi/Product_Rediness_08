/**
 * boundaryLoops — §FEAT-PLATE-SHAPE-MODES (founder, 2026-08-19)
 *
 * THE FOUNDER, VERBATIM:
 *   "Can you add mode 'eclipse', 'circular' and 'rectangular' mode options in WALL,
 *    CURTAIN WALLS, SLABS, CEILINGS and FLOORS?"
 *
 * ⚠ "eclipse" IS READ AS **ELLIPSE**, AND THE READING IS DELIBERATELY VISIBLE.
 * The mode is labelled `Elliptical` everywhere a user can see it, and this header
 * says so, so that a wrong reading costs ONE WORD to correct instead of shipping
 * five families with a silently-guessed vocabulary. There is no "eclipse" in this
 * module by design.
 *
 * ─── WHAT THIS MODULE IS ──────────────────────────────────────────────────────
 *
 * The closed-loop BOUNDARY GENERATORS for the PLATE family — slab, ceiling and
 * floor finish. Each one turns a TWO-CLICK GESTURE into the vertex ring those three
 * tools already commit. Pure maths: no THREE, no DOM, no store, no command bus, so
 * every mode is provable by a unit test running the same function the tool runs
 * (C84 §8.e).
 *
 * It sits beside `boundaryPath.ts` (linear/ortho/curved) and `boundaryArc.ts` (the
 * one arc model) as the THIRD member of the shared plate-boundary authoring layer,
 * and it is imported by all three tools for the same reason those two are: so
 * "the same options in slab, ceiling and floor" is true BY CONSTRUCTION rather than
 * by three matching literals.
 *
 * ─── ⭐ THIS IS A GESTURE AXIS, NOT A CONSTRAINT AXIS (C92 SL-Voc-3) ──────────
 *
 * `BoundaryDrawMode` (`boundaryPath.ts`) answers *"how does a click land?"* —
 * linear, ortho, curved. This module answers *"which whole boundary does one
 * gesture produce?"* Those are ORTHOGONAL, and L-956 is what happens when two
 * orthogonal concepts share the word "mode": the HUD reported the axis that had not
 * changed while the click did something else entirely.
 *
 * ⛔ THESE MODES MUST NEVER BE ADDED TO `BoundaryDrawMode`. Doing so would make
 * `curved × circular` unexpressible — you could no longer say "an arc-drawn
 * boundary" and "a circular boundary" are different answers to different questions.
 * They belong on the FAMILY/GESTURE axis that `activeSlabFamilyMode.ts` already
 * established, next to `2point` / `region` / `hollow`.
 *
 * ─── ⚠ VOCABULARY — THE DIVERGENCE IS DECLARED, NOT HIDDEN (C84 EI-8) ────────
 *
 * EI-8 says a SHAPE has one canonical vocabulary. At the time of writing the repo
 * held FIVE spellings of these three shapes:
 *
 *   `square | circular | ellipse`        `handrailRunGenerators.ts:69` (shipped)
 *   `rectangle`                          floor + ceiling matrix rows
 *   `2point`                             slab matrix row
 *   `rect | round`                       column matrix row
 *   `rectangular | circular`             `OpeningProfile.ts:44` (C86, ratified)
 *
 * THIS MODULE ADOPTS THE **C86 ADJECTIVE SET** — `rectangular` / `circular` /
 * `elliptical` — for two reasons, both stated so the choice can be argued with:
 *   1. C86's `openingProfile` is the shape vocabulary this repo most recently
 *      RATIFIED, and `rectangular` + `circular` are already two of its members.
 *   2. It is the founder's own wording ("rectangular", "circular"), and adjectives
 *      stay consistent when a fourth member arrives.
 *
 * ⛔ IT DOES NOT RENAME HANDRAIL. `handrailRunGenerators` ships, is spec'd, and its
 * ids reach `HandrailRunMode`; renaming it from this lane would be an unmeasured
 * edit to a working family. The divergence (`square` vs `rectangular`, `ellipse`
 * vs `elliptical`) is REAL, is a genuine EI-8 finding, and is logged as
 * **L-1322** for reconciliation rather than quietly perpetuated.
 *
 * ─── ⚠ THE MATHS IS DELIBERATELY NOT SHARED WITH HANDRAIL, AND WHY ───────────
 *
 * `handrailRunGenerators.ellipseLoopVerticesFromRadii` looks like the same
 * function and IS NOT, because the SEGMENT-COUNT POLICY differs for a stated
 * reason. A handrail chord is a REAL ELEMENT carrying its own posts, so that module
 * aims at a 0.6 m chord and caps at 48 — over-tessellating a 2 m circle there would
 * produce "a schedule full of 100 mm rails" (its words). A plate boundary is a
 * RENDERED OUTLINE fed to earcut; its density should be governed by how far the
 * chord deviates from the true curve, not by element count. Sharing one function
 * would force one of the two families to accept the other's constraint.
 *
 * What IS shared is the parameterisation `(cx + rx cos t, cz + rz sin t)`, which is
 * the unit circle and not a vocabulary. EI-8 governs transcribed TABLES and NAMES;
 * it does not ask two packages to import trigonometry from each other.
 *
 * ─── ⭐ TESSELLATION IS THE REPRESENTATION, AND THAT IS A DECLARED LIMIT ──────
 *
 * A circular slab is stored as a POLYGON RING, not as a centre and a radius. That
 * is the established plate-family pattern, stated by `boundaryArc.ts`: *"boundaries
 * remain POLYGONS by schema and an arc enters by TESSELLATION"*. It buys a great
 * deal — zero schema change, zero persistence change, zero builder change, and
 * every existing consumer (earcut, IFC, plan projection, area take-off) works on
 * day one with no knowledge of circles.
 *
 * ⚠ WHAT IT COSTS, SAID OUT LOUD RATHER THAN DISCOVERED LATER: the ring does not
 * REMEMBER that it is a circle. Re-editing a circular slab gives you N vertices,
 * not a radius handle, and a "make this 0.5 m bigger" edit is not expressible.
 * Parametric shape-preserving boundaries are a SEPARATE and larger decision
 * (it is a C81 design-intent question and it would touch the schema, persistence
 * and every consumer) — logged as **L-1323**, deliberately NOT decided here.
 */

import type { ArcVertex2D } from './boundaryArc';

export type { ArcVertex2D };

/**
 * The closed-loop boundary shapes a plate tool offers. ONE gesture, one whole ring.
 *
 * ⚠ `rectangular` is NOT redundant with the tools' existing `rectangle` / `2point`
 * gesture — it is the SAME gesture, and this union is the shared NAME for it. The
 * three tools spelled it three ways before this module existed.
 */
export type BoundaryLoopMode = 'rectangular' | 'circular' | 'elliptical';

export const BOUNDARY_LOOP_MODES: readonly BoundaryLoopMode[] = [
    'rectangular', 'circular', 'elliptical',
] as const;

export function isBoundaryLoopMode(v: unknown): v is BoundaryLoopMode {
    return v === 'rectangular' || v === 'circular' || v === 'elliptical';
}

/**
 * The user-facing label for each mode. ⭐ `elliptical` reads "Elliptical" — this is
 * the visible half of the "eclipse" reading recorded in the header.
 */
export const BOUNDARY_LOOP_LABELS: Readonly<Record<BoundaryLoopMode, string>> = Object.freeze({
    rectangular: 'Rectangular',
    circular:    'Circular',
    elliptical:  'Elliptical',
});

/**
 * What the two clicks MEAN, per mode. Exported because the HUD must prompt for the
 * right second click and must not re-derive this from a switch of its own.
 *
 * `rectangular` takes two OPPOSITE CORNERS — the gesture floor/ceiling/slab already
 * had. `circular` and `elliptical` take CENTRE first, matching the handrail
 * precedent so a user who learned the railing bar is not taught a second grammar.
 */
export const BOUNDARY_LOOP_GESTURE: Readonly<Record<BoundaryLoopMode, {
    readonly first: string;
    readonly second: string;
}>> = Object.freeze({
    rectangular: { first: 'Click the first corner',  second: 'Click the opposite corner' },
    circular:    { first: 'Click the centre',        second: 'Click a point on the rim' },
    elliptical:  { first: 'Click the centre',        second: 'Click a bounding-box corner' },
});

/**
 * Below this a click-drag is a mis-click, not a shape.
 *
 * ⚠ MEASURED MIRROR, NOT A SECOND RULE: `FloorTool`/`CeilingTool`'s existing
 * rectangle arm refuses below 0.01 m per axis. This is deliberately LARGER, because
 * 10 mm is a mis-click for a room-scale boundary and the existing number was a
 * degeneracy guard rather than a usability one. The rectangle arm keeps its own
 * 0.01 m check as well; both must pass, so this can only ever be stricter.
 */
export const MIN_LOOP_EXTENT_M = 0.05;

/**
 * Maximum distance between a chord and the true curve it approximates, in metres.
 *
 * ⭐ THIS, NOT A FIXED SEGMENT COUNT, IS WHY A BIG CIRCLE GETS MORE VERTICES THAN A
 * SMALL ONE. A fixed count makes a 20 m dome visibly faceted and a 0.3 m core
 * needlessly heavy. 20 mm is below the plan-view line weight at every scale this
 * editor draws, so the facets are not resolvable.
 */
export const LOOP_CHORD_TOLERANCE_M = 0.02;

/** Density floor and ceiling. The floor keeps a tiny circle from becoming a
 *  triangle; the cap keeps a very large one from flooding earcut. */
export const MIN_LOOP_SEGMENTS = 12;
export const MAX_LOOP_SEGMENTS = 96;

/**
 * ⭐ THE SEGMENT-COUNT POLICY IS PER-FAMILY, AND THAT IS THE WHOLE REASON THIS IS A
 * PARAMETER RATHER THAN A CONSTANT.
 *
 * A PLATE boundary is a rendered OUTLINE handed to earcut: one polygon, one mesh, and
 * the only thing a finer ring costs is vertices. Its density should therefore be
 * governed by how far a chord strays from the true curve.
 *
 * A WALL RUN is not that. Every chord is a REAL ELEMENT — it gets an id, a system
 * type, layers, a schedule row, two junctions and a pass through the join resolver.
 * Tessellating a 4 m circle at the plate's 20 mm tolerance would emit ~64 walls of
 * ~390 mm each: a nonsense model, a nonsense schedule, and 64 junction clusters for
 * the solver. This is the same argument `handrailRunGenerators` makes in its own
 * words — *"a schedule full of 100 mm rails"* — and it is why that module was left
 * with its own policy rather than forced onto this one.
 *
 * So the MATHS is shared and the POLICY is named. A caller picks a policy; nobody
 * re-derives the parameterisation.
 */
export interface LoopDensity {
    /** Max distance from a chord to the true curve, metres. */
    readonly chordToleranceM?: number;
    readonly minSegments?: number;
    readonly maxSegments?: number;
}

/** The default — PLATES (slab / ceiling / floor). A smooth rendered outline. */
export const PLATE_LOOP_DENSITY: LoopDensity = Object.freeze({
    chordToleranceM: LOOP_CHORD_TOLERANCE_M,
    minSegments: MIN_LOOP_SEGMENTS,
    maxSegments: MAX_LOOP_SEGMENTS,
});

/**
 * WALL RUNS — deliberately COARSE, because each chord becomes a wall.
 *
 * ⚠ The numbers are chosen so a room-scale circular run reads as a drum without
 * becoming a parts list: at r = 4 m this gives 16 walls of ~1.55 m. `minSegments` is
 * 8 because fewer than eight sides does not read as a circle at all, and
 * `maxSegments` is 24 because beyond that the junction count, not the silhouette, is
 * what the user notices.
 */
export const WALL_LOOP_DENSITY: LoopDensity = Object.freeze({
    chordToleranceM: 0.35,
    minSegments: 8,
    maxSegments: 24,
});

/**
 * How many chords to cut a loop of the given MAXIMUM radius into, so that no chord
 * deviates from the true curve by more than `LOOP_CHORD_TOLERANCE_M`.
 *
 * For a chord subtending half-angle t on radius r the sagitta is r(1 - cos t), so
 * the largest admissible half-angle is `acos(1 - tol/r)` and the count is
 * `ceil(PI / t)`. Using the LARGER semi-axis of an ellipse is conservative: the
 * flatter axis is sampled more finely than it needs, never less.
 */
export function loopSegmentCount(maxRadius: number, density: LoopDensity = PLATE_LOOP_DENSITY): number {
    const tol = density.chordToleranceM ?? LOOP_CHORD_TOLERANCE_M;
    const lo  = density.minSegments     ?? MIN_LOOP_SEGMENTS;
    const hi  = density.maxSegments     ?? MAX_LOOP_SEGMENTS;
    if (!Number.isFinite(maxRadius) || maxRadius <= 0) return 0;
    const ratio = 1 - tol / maxRadius;
    // A radius at or below the tolerance cannot be resolved further than the floor.
    if (!(ratio > -1)) return lo;
    const halfAngle = Math.acos(Math.min(1, Math.max(-1, ratio)));
    if (!(halfAngle > 0)) return hi;
    const n = Math.ceil(Math.PI / halfAngle);
    return Math.min(hi, Math.max(lo, n));
}

/**
 * A closed axis-aligned RECTANGLE through two opposite corners — `rectangular`.
 * CCW in XZ from the min corner, matching the ring handedness the three tools
 * already emit for this gesture.
 *
 * Returns `[]` for a degenerate drag — an empty ring, never a zero-area one.
 */
export function rectangularLoopVertices(a: ArcVertex2D, b: ArcVertex2D): ArcVertex2D[] {
    const x0 = Math.min(a.x, b.x);
    const x1 = Math.max(a.x, b.x);
    const z0 = Math.min(a.z, b.z);
    const z1 = Math.max(a.z, b.z);
    if (x1 - x0 < MIN_LOOP_EXTENT_M || z1 - z0 < MIN_LOOP_EXTENT_M) return [];
    return [
        { x: x0, z: z0 },
        { x: x1, z: z0 },
        { x: x1, z: z1 },
        { x: x0, z: z1 },
    ];
}

/**
 * A closed CIRCLE — `circular`. `centre`, then any point ON the rim gives the
 * radius, so the second click is a real point of the shape the user is aiming at.
 *
 * ⭐ A circle IS an ellipse with equal semi-axes, and this delegates rather than
 * re-deriving the sampling. That is the same relation C86 ratified for openings
 * (*"a circular opening's width and height must be equal — the width IS the
 * diameter"*), expressed in code instead of in a validator.
 */
export function circularLoopVertices(
    centre: ArcVertex2D,
    rim: ArcVertex2D,
    density: LoopDensity = PLATE_LOOP_DENSITY,
): ArcVertex2D[] {
    const r = Math.hypot(rim.x - centre.x, rim.z - centre.z);
    if (!(r >= MIN_LOOP_EXTENT_M)) return [];
    return loopVerticesFromRadii(centre, r, r, density);
}

/**
 * A closed ELLIPSE — `elliptical`. `centre`, then a BOUNDING-BOX CORNER: the second
 * click gives both semi-axes as |dx| and |dz|.
 *
 * Dragging out a square corner therefore degenerates GRACEFULLY into a circle
 * rather than refusing — the same behaviour the handrail ellipse mode ships, and
 * the reason the two modes can coexist on one bar without trapping the user.
 */
export function ellipticalLoopVertices(
    centre: ArcVertex2D,
    corner: ArcVertex2D,
    density: LoopDensity = PLATE_LOOP_DENSITY,
): ArcVertex2D[] {
    const rx = Math.abs(corner.x - centre.x);
    const rz = Math.abs(corner.z - centre.z);
    if (rx < MIN_LOOP_EXTENT_M || rz < MIN_LOOP_EXTENT_M) return [];
    return loopVerticesFromRadii(centre, rx, rz, density);
}

/** The shared sampling. CCW in XZ, first vertex at t = 0, no duplicated closing
 *  vertex — the plate schema refuses a closed ring (C92 §12 R-5). */
function loopVerticesFromRadii(
    centre: ArcVertex2D,
    rx: number,
    rz: number,
    density: LoopDensity = PLATE_LOOP_DENSITY,
): ArcVertex2D[] {
    const n = loopSegmentCount(Math.max(rx, rz), density);
    if (n < 3) return [];
    const out: ArcVertex2D[] = [];
    for (let i = 0; i < n; i++) {
        const t = (i / n) * Math.PI * 2;
        out.push({ x: centre.x + rx * Math.cos(t), z: centre.z + rz * Math.sin(t) });
    }
    return out;
}

/**
 * THE ONE ENTRY POINT the tools call. Dispatches on mode so no tool carries its own
 * switch — three copies of a switch is how `SlabToolMode` ended up declared three
 * times (C92 SL-Voc-2).
 */
export function boundaryLoopVertices(
    mode: BoundaryLoopMode,
    first: ArcVertex2D,
    second: ArcVertex2D,
    density: LoopDensity = PLATE_LOOP_DENSITY,
): ArcVertex2D[] {
    switch (mode) {
        case 'rectangular': return rectangularLoopVertices(first, second);
        case 'circular':    return circularLoopVertices(first, second, density);
        case 'elliptical':  return ellipticalLoopVertices(first, second, density);
    }
}

/**
 * WHY a gesture produced nothing, in the user's words — C16 CA-18: a refusal names
 * its reason AND what does work.
 *
 * Returns `null` when the gesture is fine. The tools show this instead of the
 * `console.warn` the rectangle arm used to emit into a console no author reads.
 */
export function boundaryLoopRefusal(
    mode: BoundaryLoopMode,
    first: ArcVertex2D,
    second: ArcVertex2D,
    density: LoopDensity = PLATE_LOOP_DENSITY,
): string | null {
    if (boundaryLoopVertices(mode, first, second, density).length >= 3) return null;
    const min = MIN_LOOP_EXTENT_M.toFixed(2);
    switch (mode) {
        case 'rectangular':
            return `That rectangle is smaller than ${min} m on one side. ` +
                   `Drag further from the first corner.`;
        case 'circular':
            return `That circle's radius is under ${min} m. ` +
                   `Click the centre, then a point further out on the rim.`;
        case 'elliptical':
            return `That ellipse is under ${min} m on one axis. ` +
                   `Click the centre, then a corner further out on both axes. ` +
                   `Equal axes give a circle.`;
    }
}
