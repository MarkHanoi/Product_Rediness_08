/**
 * OpeningProfileGasket — §OPENING-PROFILE-GASKET (L-1200) — **HOW ARMS B AND C CARRY A CURVE.**
 *
 * ── THE PROBLEM THIS SOLVES ─────────────────────────────────────────────────────────────────
 * Of the five wall-body arms (C86 §10.1), exactly one can express a curve natively: the plain
 * `THREE.Shape`-with-holes extrude, which is gated on the wall having **no mitre join and no rake
 * cap-drift** and therefore does NOT run on the mitred façade walls the founder was pointing at.
 * The other two straight-wall arms decompose the wall into **rectangles**:
 *
 *   B  `WallFragmentBuilder` — abutting `BoxGeometry` (before / sill / header / after)
 *   C  `LayeredWallOpeningBuilder` — an x/y break grid with a boolean `solid[i][j]` rasteriser
 *
 * Neither alphabet contains an arc. **Teaching them to approximate one with finer rectangles is
 * exactly what this codebase forbids** — a staircase silhouette is the *"silently-wrong wall"* of
 * `WallRake.ts:102`.
 *
 * ── THE MECHANISM ───────────────────────────────────────────────────────────────────────────
 * So they do not approximate it. **They keep cutting the profile's BOUNDING BOX — which is what
 * they already do for a rectangle — and one GASKET plate fills the difference.** The gasket is
 * the region `bbox − outline`, extruded through the wall (B) or the layer (C) thickness, with its
 * reveal faces swept along the TRUE outline.
 *
 * ⭐ **THIS IS NOT "A RECTANGLE CALLED ROUND", AND C86 §10.1 STATES THE SEPARATING TEST SO THE
 * DISTINCTION IS A FACT RATHER THAN A CLAIM:** *every reveal face MUST lie on the outline, and no
 * face may bound the void from the bbox boundary.* The bbox cut is an INTERNAL decomposition no
 * user can see — the same status as the greedy quad merge arm C already performs at
 * `LayeredWallOpeningBuilder.ts:300-320`, which also decomposes into rectangles and is not a
 * defect. What the user sees is the outline, and only the outline.
 *
 * ⭐ Concretely, the test that separates the two: at the bbox CORNERS of a circular opening there
 * must be SOLID MATERIAL (the gasket), and just inside the circle there must be NONE. A rectangle
 * pretending to be a circle fails the first half; a staircase fails the second.
 *
 * ── WHY IT COMPOSES SAFELY WITH MITRE AND RAKE ──────────────────────────────────────────────
 * The gasket is **strictly interior**, and all three of the wall's per-vertex corrections are
 * gated on the wall ENDS:
 *   · the mitre projection fires only at `x < 1e-5` / `|x − wallLength| < 1e-5`
 *     (`LayeredWallOpeningBuilder.ts:236-239`), and `normaliseWallHoles` forbids an opening from
 *     touching either end — so the gasket can never meet it;
 *   · the §L955-ONE-CORNER-RULE top-cap drift is gated on the same two tests (`:262-264`) — same
 *     conclusion;
 *   · the rake is applied AFTERWARDS as one group matrix (`_applyRakeShearToChildren`), so the
 *     gasket inherits the shear **by construction**. A circle set out on a leaning face becomes an
 *     ellipse in plan, which is the correct drawing of it, not an error.
 *
 * ── FRAME ───────────────────────────────────────────────────────────────────────────────────
 * Emitted AXIS-ALIGNED: `+x` along the wall from `baseLine[0]`, `+y` up (absolute local height,
 * i.e. the caller has already folded `baseOffset`), `+z` lateral. That is exactly the frame a
 * `BoxGeometry` placed by `WallFragmentBuilder.positionLocal` lives in, so arm B adds the gasket
 * with no transform at all. Arm C builds in a `direction`/`outward` basis instead and applies
 * {@link wallLocalToDirectionBasis} — ONE declared linear map, not a second derivation.
 */

import * as THREE from '@pryzm/renderer-three/three';
import type { OpeningOutline, OutlinePoint } from './OpeningProfile';

/**
 * Build the gasket for ONE profiled opening, spanning `zBack → zFront` laterally.
 *
 * @param outline  from `openingOutline()` — **the only producer** (C86 §10.1 PR-1).
 * @param zBack    lateral coordinate of the back face (typically `-thickness/2`, or a layer's).
 * @param zFront   lateral coordinate of the front face.
 * @param yShift   added to every `y` — the wall's `baseOffset`. The outline's `y` is measured from
 *                 the wall BASE, and the arms draw in absolute local height.
 *
 * @returns `null` when there is nothing to emit — **including for a RECTANGULAR outline, which is
 *          the PR-2 byte-identity guarantee expressed as code**. A caller that gets `null` must
 *          take its pre-existing path unchanged.
 */
export function buildOpeningProfileGasket(
    outline: OpeningOutline | null | undefined,
    zBack: number,
    zFront: number,
    yShift = 0,
): THREE.BufferGeometry | null {
    // ⛔ PR-2 — a rectangle's gasket is EMPTY and must never be emitted. This single line is what
    // keeps every wall in every existing project byte-identical after this module lands.
    if (!outline || outline.isRectangular) return null;
    if (outline.points.length < 3) return null;
    if (!(Math.abs(zFront - zBack) > 1e-9)) return null;

    const { bbox } = outline;
    if (!(bbox.x1 - bbox.x0 > 1e-9) || !(bbox.y1 - bbox.y0 > 1e-9)) return null;

    // ── The two caps: (bbox − outline), triangulated once. ───────────────────────────────────
    // The contour is the bounding box the arm already cut; the hole is the TRUE outline. The hole
    // is wound opposite to the contour, which is what `ShapeGeometry` expects for a hole.
    const shape = new THREE.Shape();
    shape.moveTo(bbox.x0, bbox.y0 + yShift);
    shape.lineTo(bbox.x1, bbox.y0 + yShift);
    shape.lineTo(bbox.x1, bbox.y1 + yShift);
    shape.lineTo(bbox.x0, bbox.y1 + yShift);
    shape.closePath();

    const hole = new THREE.Path();
    const pts = outline.points;
    hole.moveTo(pts[pts.length - 1]!.x, pts[pts.length - 1]!.y + yShift);
    for (let i = pts.length - 2; i >= 0; i--) hole.lineTo(pts[i]!.x, pts[i]!.y + yShift);
    hole.closePath();
    shape.holes.push(hole);

    let capGeo: THREE.BufferGeometry;
    try {
        capGeo = new THREE.ShapeGeometry(shape);
    } catch {
        // A self-intersecting or degenerate outline cannot be triangulated. Emitting nothing is
        // the honest outcome: the arm keeps its bbox cut, which is visibly a rectangle rather
        // than a subtly-wrong curve — a loud failure, not a quiet one.
        return null;
    }
    if (!capGeo.getAttribute('position') || capGeo.getAttribute('position').count === 0) {
        capGeo.dispose();
        return null;
    }

    const front = capGeo.clone();
    front.translate(0, 0, zFront);

    const back = capGeo.clone();
    reverseWinding(back);
    back.translate(0, 0, zBack);
    capGeo.dispose();

    // ── The reveal band: swept along the OUTLINE, which is the whole point. ──────────────────
    const reveal = buildRevealBand(pts, zBack, zFront, yShift);

    const merged = mergeThree([back, front, reveal]);
    back.dispose();
    front.dispose();
    reveal.dispose();
    if (!merged) return null;
    merged.computeVertexNormals();
    return merged;
}

/**
 * The reveal (jamb / soffit) faces — a quad strip along the outline, facing INTO the void.
 *
 * ⭐ **THIS IS THE SURFACE THE USER ACTUALLY SEES WHEN THEY LOOK THROUGH THE OPENING**, and the
 * reason the gasket is honest: it is swept along `outline.points`, so it lies on the arc and
 * nowhere else. There is deliberately NO face on the bbox boundary — that boundary is buried
 * inside solid material where the arm's own geometry meets the gasket, exactly like every other
 * abutting-solid interface arm B already has.
 */
function buildRevealBand(
    pts: readonly OutlinePoint[],
    zBack: number,
    zFront: number,
    yShift: number,
): THREE.BufferGeometry {
    const n = pts.length;
    const position: number[] = [];
    const index: number[] = [];

    for (let i = 0; i < n; i++) {
        const p0 = pts[i]!;
        const p1 = pts[(i + 1) % n]!;
        const base = position.length / 3;
        // A = p0/back, B = p1/back, C = p1/front, D = p0/front
        position.push(p0.x, p0.y + yShift, zBack);
        position.push(p1.x, p1.y + yShift, zBack);
        position.push(p1.x, p1.y + yShift, zFront);
        position.push(p0.x, p0.y + yShift, zFront);
        // Wound so the normal points to the LEFT of travel. The outline is CCW, so left is its
        // INTERIOR — i.e. into the void, which is where the viewer is.
        index.push(base, base + 2, base + 1);
        index.push(base, base + 3, base + 2);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
    geo.setIndex(index);
    return geo;
}

/** Flip triangle winding in place (the back cap must face away from the front one). */
function reverseWinding(geo: THREE.BufferGeometry): void {
    const idx = geo.getIndex();
    if (idx) {
        const a = idx.array as unknown as number[];
        for (let i = 0; i < a.length; i += 3) {
            const t = a[i]!;
            a[i] = a[i + 2]!;
            a[i + 2] = t;
        }
        idx.needsUpdate = true;
        return;
    }
    const pos = geo.getAttribute('position');
    const arr = pos.array as unknown as number[];
    for (let i = 0; i < arr.length; i += 9) {
        for (let k = 0; k < 3; k++) {
            const t = arr[i + k]!;
            arr[i + k] = arr[i + 6 + k]!;
            arr[i + 6 + k] = t;
        }
    }
    pos.needsUpdate = true;
}

/**
 * Concatenate non-indexed/indexed geometries carrying only `position`.
 *
 * Deliberately local rather than `mergeGeometries`: that helper requires every input to share an
 * identical attribute set, and `ShapeGeometry` ships `uv` while the hand-built reveal band does
 * not. Normalising to positions-only here and calling `computeVertexNormals` once at the end is
 * simpler than manufacturing UVs nobody reads for an untextured wall solid.
 */
function mergeThree(geos: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
    const position: number[] = [];
    for (const g of geos) {
        const pos = g.getAttribute('position');
        if (!pos) continue;
        const idx = g.getIndex();
        if (idx) {
            for (let i = 0; i < idx.count; i++) {
                const v = idx.getX(i);
                position.push(pos.getX(v), pos.getY(v), pos.getZ(v));
            }
        } else {
            for (let i = 0; i < pos.count; i++) {
                position.push(pos.getX(i), pos.getY(i), pos.getZ(i));
            }
        }
    }
    if (position.length === 0) return null;
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
    return out;
}

/**
 * The ONE map from the gasket's axis-aligned frame into arm C's `direction`/`outward` basis.
 *
 * Arm C (`LayeredWallOpeningBuilder`) never builds axis-aligned: it emits
 * `direction·x + outward·z` directly. Rather than have the gasket learn a second emission mode —
 * which would be two derivations of one plate, the C84 EI-9 defect this whole slice is organised
 * to avoid — it emits ONE shape and arm C applies this declared linear map.
 *
 * `y` is untouched: both frames measure height the same way.
 */
export function wallLocalToDirectionBasis(
    direction: { x: number; z: number },
    outward: { x: number; z: number },
): THREE.Matrix4 {
    return new THREE.Matrix4().set(
        direction.x, 0, outward.x, 0,
        0,           1, 0,         0,
        direction.z, 0, outward.z, 0,
        0,           0, 0,         1,
    );
}
