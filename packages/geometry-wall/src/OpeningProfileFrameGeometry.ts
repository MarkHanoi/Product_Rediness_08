/**
 * OpeningProfileFrameGeometry — §OPENING-PROFILE-FRAME (L-1520) — **THE FRAME SOLID, EXTRUDED
 * FROM THE OUTLINE THE HOLE WAS CUT WITH.**
 *
 * ── THE DEFECT ──────────────────────────────────────────────────────────────
 * The founder, on the shipped circular window: *"the opening [is] circular but not the frame —
 * the frame is a square frame. Same for arch — same for the door."* He is right, and the cause is
 * exact: `grep -c openingProfile WindowBuilder.ts` → **0**, and the same for `DoorBuilder.ts`.
 * Both built head / cill / jambs as four unconditional `BoxGeometry` members. The WALL consumed
 * `openingOutline()`; the FRAME consumed nothing.
 *
 * ── WHY THIS FILE IS IN `@pryzm/geometry-wall`, BESIDE THE PRODUCER ─────────
 * ⭐ It sits next to `OpeningProfile.ts`, the ONE producer of the outline it derives from, and
 * beside `OpeningProfileGasket.ts`, which is the SAME shape of module: a THREE-side helper that
 * turns one profile outline into a solid. Three reasons, in order of weight:
 *
 *   1. **BOTH element families consume it.** A window frame and a door frame are the same band of
 *      constant section. Housed under either family it would read as that family's private
 *      helper, and the next person needing it copies rather than imports — the C84 EI-9 defect
 *      this whole slice exists to remove.
 *   2. **The pairing stays visible.** `openingOutline` → `insetOutlinePoints` → this band is one
 *      chain; splitting it across two packages hides the middle link.
 *   3. **The layer edge is already there.** `@pryzm/geometry-wall` (L2) already depends on
 *      `@pryzm/renderer-three` (L1) — `OpeningProfileGasket.ts` and eleven other files in this
 *      package import `@pryzm/renderer-three/three` — so P2 is satisfied and no new edge is minted.
 *      **The alternative placement in `@pryzm/geometry-door` was considered and rejected**: it
 *      would have worked (window already depends on door — the `CurvedLeafGeometry` precedent) but
 *      it namespaces a shared opening concept under one of its two consumers for no reason other
 *      than where it was written.
 *
 * ── THE ONE RULE ────────────────────────────────────────────────────────────
 * ⛔ **NOTHING HERE KNOWS WHAT A CIRCLE IS.** Every function below takes points and returns a
 * solid. The points come from `openingOutline()` (via `openingOutlineLocal`) and from
 * `insetOutlinePoints()`, which is itself a pure function of them. C86 §10.1 PR-1 — *"no arm may
 * re-derive an arc"* — is therefore satisfied by CONSTRUCTION rather than by discipline: there is
 * no arc in this file to get wrong.
 *
 * ── FRAME (coordinates) ─────────────────────────────────────────────────────
 * Points are in the builders' GROUP-LOCAL frame — `x` across the opening, `y` up, both centred on
 * the void — which is the frame `openingOutlineLocal()` emits. The extrusion is centred on `z`,
 * so a member spans `[−depth/2, +depth/2]` exactly like the `BoxGeometry` it replaces.
 */

import * as THREE from '@pryzm/renderer-three/three';
import type { OutlinePoint } from './OpeningProfile';

/** Extrude one closed contour, centred on z. `null` on anything untriangulable. */
function extrudeCentred(shape: THREE.Shape, depth: number): THREE.BufferGeometry | null {
    if (!(depth > 1e-9) || !Number.isFinite(depth)) return null;
    let geo: THREE.ExtrudeGeometry;
    try {
        // `curveSegments: 1` because the contour is ALREADY a polyline — the arc was sampled once,
        // by the producer, to `ARC_SAG_TOLERANCE_M`. Letting THREE re-sample would be a second
        // tessellation of one curve and the frame would meet the reveal on a different set of
        // vertices, which is the whole failure mode PR-1 exists to prevent.
        geo = new THREE.ExtrudeGeometry(shape, {
            depth,
            bevelEnabled: false,
            steps: 1,
            curveSegments: 1,
        });
    } catch {
        // A self-intersecting contour cannot be triangulated. Emitting NOTHING is the honest
        // outcome — a missing member is visible and reportable; a subtly-wrong one is not.
        return null;
    }
    const pos = geo.getAttribute('position');
    if (!pos || pos.count === 0) {
        geo.dispose();
        return null;
    }
    geo.translate(0, 0, -depth / 2);
    return geo;
}

function toVec2(points: readonly OutlinePoint[]): THREE.Vector2[] {
    return points.map(p => new THREE.Vector2(p.x, p.y));
}

/**
 * A solid PLATE filling `points` — the glass pane, the fanlight, and the degenerate case of a
 * frame so thick the opening is entirely frame.
 */
export function profiledPlateGeometry(
    points: readonly OutlinePoint[] | null | undefined,
    depth: number,
): THREE.BufferGeometry | null {
    if (!points || points.length < 3) return null;
    return extrudeCentred(new THREE.Shape(toVec2(points)), depth);
}

/**
 * THE frame member: the band between `outer` and `inner`.
 *
 * ⭐ **A FRAME IS A BAND, NOT FOUR BOXES, AND THAT IS AN ARCHITECTURAL STATEMENT.** A circular
 * window's frame is a RING — it has no cill and no jambs, because a circle has no bottom edge and
 * no vertical sides to name. An arched window's frame is a curved head continuous with two
 * straight jambs, which a fabricator makes as a scarf-jointed member of CONSTANT SECTION. One
 * band of constant width is what both of those are; four axis-aligned boxes are what neither is.
 *
 * @param outer  the outline — from `openingOutlineLocal()`, the ONE producer.
 * @param inner  the same outline inset by the member width — from `insetOutlinePoints()`.
 *               MUST have the same point count as `outer` (that helper guarantees it).
 * @param omitBaseEdge
 *   ⭐ **THE DOOR'S RULE, AND IT IS NOT A SPECIAL CASE — IT IS WHAT A DOOR FRAME IS.** A door
 *   frame has TWO posts and a head; it has **no cill across the threshold**, because people walk
 *   through it. A closed ring would lay a 50 mm bar across the doorway at floor level. With this
 *   set, the band is opened along the outline's own base edge (the one horizontal run at `y0`),
 *   producing the ∩-shaped member a joiner actually assembles. Windows pass `false` and get the
 *   closed ring, because a window frame DOES have a cill.
 *
 *   Returns the closed ring anyway when the outline has no base edge to open (a circle) — but a
 *   circular DOOR is refused far upstream by `openingProfilesFor('door')`, so that path is a
 *   defence, not a behaviour.
 */
export function profiledBandGeometry(
    outer: readonly OutlinePoint[] | null | undefined,
    inner: readonly OutlinePoint[] | null | undefined,
    depth: number,
    omitBaseEdge = false,
): THREE.BufferGeometry | null {
    if (!outer || !inner) return null;
    const n = outer.length;
    if (n < 3 || inner.length !== n) return null;

    if (!omitBaseEdge) {
        const shape = new THREE.Shape(toVec2(outer));
        // A hole is wound OPPOSITE the contour, which is what the triangulator expects.
        shape.holes.push(new THREE.Path(toVec2(inner).reverse()));
        return extrudeCentred(shape, depth);
    }

    const base = baseEdgeIndex(outer);
    if (base === null) {
        const shape = new THREE.Shape(toVec2(outer));
        shape.holes.push(new THREE.Path(toVec2(inner).reverse()));
        return extrudeCentred(shape, depth);
    }

    // ONE simple ∩-shaped contour: the outer walk CCW from the base edge's right foot all the way
    // round to its left foot (i.e. every edge EXCEPT the base), then the inner walk BACKWARDS from
    // left foot to right foot, closing with the two short stubs at the feet.
    const iL = base;
    const iR = (base + 1) % n;
    const contour: OutlinePoint[] = [];
    for (let k = 0; k < n; k++) contour.push(outer[(iR + k) % n]!);
    for (let k = 0; k < n; k++) contour.push(inner[(((iL - k) % n) + n) % n]!);
    return extrudeCentred(new THREE.Shape(toVec2(contour)), depth);
}

/**
 * The index of the outline's BASE EDGE — the single horizontal run along `y0`, i.e. the edge
 * `points[i] → points[i+1]` with both feet on the lowest line.
 *
 * Found by GEOMETRY rather than by index, deliberately. `openingOutline` happens to emit the two
 * feet first for every non-circular profile, but relying on that would couple this file to the
 * producer's emission ORDER as well as its values — and the order is not part of its contract.
 * Measuring it costs one pass and cannot rot.
 *
 * `null` for a circle, which has no such edge.
 */
function baseEdgeIndex(points: readonly OutlinePoint[]): number | null {
    let y0 = Infinity;
    for (const p of points) if (p.y < y0) y0 = p.y;
    const n = points.length;
    for (let i = 0; i < n; i++) {
        const a = points[i]!;
        const b = points[(i + 1) % n]!;
        if (Math.abs(a.y - y0) < 1e-7 && Math.abs(b.y - y0) < 1e-7 && Math.abs(b.x - a.x) > 1e-7) {
            return i;
        }
    }
    return null;
}
