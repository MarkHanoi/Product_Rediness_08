/**
 * OutlineAuthoring — §OUTLINE81 (SPEC-WINDOW-CUSTOM-OUTLINE §6, C86 §10.6) — the L2 model of
 * the GENERALISED elevation-outline editor: the pure helpers behind click-to-place polylines,
 * 3-click arcs and ⛔ ABSOLUTE ortho, plus the metres ↔ unit-ring maps the window outline
 * section commits through.
 *
 * ── WHY THIS FILE, AND WHY HERE ────────────────────────────────────────────────────────────
 * C86 §10.6 ratifies the wall PROFILE editor as THE authoring technology for a window's
 * `'custom'` outline, and names the three modes it lacks (click-to-place, ortho, arcs) as
 * things to be FED FROM THE EXISTING PURE PRIMITIVES the boundary-line tool already uses —
 * never re-derived (`CurtainWallTool.ts`'s rival `ARC_SEGMENTS = 10` is the recorded
 * cautionary case). Those primitives are `{x, z}`-typed (the plan frame); the profile editor
 * draws `{u, v}` (the elevation frame). This module is the ADAPTER: same functions, a label
 * change, zero copied maths.
 *
 * It stays in `packages/geometry-wall` (L2) with the rest of the profile-editor model
 * (§10.6 rule 1) and is published on its own pure subpath (`./outline-authoring`) for the
 * same reason `./profile-editor` exists: the L7 surface must reach the model without the
 * package barrel (which drags `SlabTool` → `@thatopen/ui` at module scope).
 *
 * ⛔ NO THREE, NO DOM, NO STORE, NO COMMAND BUS.
 */

import { orthoConstrainXZ } from '@pryzm/geometry-kernel';
import {
    arcSegmentThroughMidpoint,
    BOUNDARY_ARC_SEGMENTS,
} from '@pryzm/geometry-slab/boundary-arc';
import type { WallProfileVertex } from './WallProfile';
import { wallProfileEditorSnap } from './WallProfileEditor';
import {
    normaliseCustomOutlineWinding,
    validateCustomOutline,
    type CustomOutline,
    type CustomOutlineRefusal,
} from './CustomOutline';

// ── The authoring frame ─────────────────────────────────────────────────────────────────────

/**
 * The extents the outline is authored INSIDE, metres. For a window outline this is the type's
 * default `width × height` (D2: "the type editor authors at the type's default size, so the
 * user draws true proportions"); for a wall profile it is the wall's `length × height`.
 */
export interface OutlineAuthoringExtents {
    readonly length: number;
    readonly height: number;
}

function clamp(x: number, lo: number, hi: number): number {
    return x < lo ? lo : x > hi ? hi : x;
}

// ── Click-to-place (polyline mode) ──────────────────────────────────────────────────────────

export interface OutlinePlaceOptions {
    /**
     * ⛔ ORTHO IS ABSOLUTE when on (the founder's 2026-08-24 ruling — ortho never yields to a
     * snap). The constrained axis is EXACTLY the previous vertex's coordinate; the snap grid
     * is applied ONLY to the free axis, so no grid rounding can pull the point off-axis.
     */
    readonly ortho: boolean;
    /** Apply the {@link wallProfileEditorSnap} 50 mm grid to the free coordinate(s). */
    readonly snap: boolean;
}

/**
 * §OUTLINE81-PLACE — the vertex a click at `raw` actually commits, given the previous placed
 * vertex. The one place the ortho/snap/clamp ORDER is decided, so the surface and its tests
 * cannot disagree about it:
 *
 *   1. ORTHO first (when on, and there is a previous vertex): `orthoConstrainXZ` — THE one
 *      ortho (C86 §10.6 rule 2), through the {u,v}↔{x,z} label adapter.
 *   2. SNAP second, on the FREE axis only — the constrained axis is never touched, which is
 *      what "absolute" means here: a previous vertex off the 50 mm grid stays exactly shared.
 *   3. CLAMP last, into the authoring extents. Clamping moves a coordinate toward a bound it
 *      already exceeded; on the constrained axis the value is the previous vertex's own
 *      (already in bounds), so the clamp cannot break axis alignment either.
 */
export function outlinePlacePoint(
    last: WallProfileVertex | null,
    raw: WallProfileVertex,
    extents: OutlineAuthoringExtents,
    opts: OutlinePlaceOptions,
): WallProfileVertex {
    let u = raw.u;
    let v = raw.v;
    if (opts.ortho && last) {
        // {u, v} ↔ {x, z}: `x` carries `u`, `z` carries `v` — a label change, not a meaning
        // change (the same adapter convention `CustomOutline.buildGothicPreset` documents).
        const c = orthoConstrainXZ({ x: last.u, z: last.v }, { x: u, z: v });
        const uConstrained = c.x === last.u;   // the U axis was flattened to the previous vertex
        u = uConstrained ? last.u : (opts.snap ? wallProfileEditorSnap(c.x, true) : c.x);
        v = uConstrained ? (opts.snap ? wallProfileEditorSnap(c.z, true) : c.z) : last.v;
    } else if (opts.snap) {
        u = wallProfileEditorSnap(u, true);
        v = wallProfileEditorSnap(v, true);
    }
    return {
        u: clamp(u, 0, extents.length),
        v: clamp(v, 0, extents.height),
    };
}

// ── 3-click arcs ────────────────────────────────────────────────────────────────────────────

/**
 * §OUTLINE81-ARC — the tessellated vertex run a 3-click arc gesture appends: from `start`
 * THROUGH `midThrough` to `end`, EXCLUDING `start` (the same contract as the boundary tool's
 * own `arcSegmentThroughMidpoint`, which this delegates to — {@link OUTLINE_ARC_SEGMENTS}
 * chords, recoverable later by `resolveBoundarySegments`). Points are clamped to the extents
 * AFTER tessellation so a bulging arc cannot escape the authoring box.
 */
export const OUTLINE_ARC_SEGMENTS = BOUNDARY_ARC_SEGMENTS;

export function outlineArcSegment(
    start: WallProfileVertex,
    midThrough: WallProfileVertex,
    end: WallProfileVertex,
    extents: OutlineAuthoringExtents,
): WallProfileVertex[] {
    const run = arcSegmentThroughMidpoint(
        { x: start.u, z: start.v },
        { x: midThrough.u, z: midThrough.v },
        { x: end.u, z: end.v },
        OUTLINE_ARC_SEGMENTS,
    );
    return run.map((p) => ({
        u: clamp(p.x, 0, extents.length),
        v: clamp(p.z, 0, extents.height),
    }));
}

// ── Metres ↔ unit ring (the COMMIT and OPEN maps) ──────────────────────────────────────────

export type OutlineNormaliseResult =
    | { readonly ok: true; readonly ring: CustomOutline }
    | { readonly ok: false; readonly refusal: CustomOutlineRefusal };

/**
 * §OUTLINE81-NORMALISE — the COMMIT map: a drawn ring (metres, in the authoring frame) →
 * the normalised `CustomOutline` the model stores (D2). Normalising by the RING'S OWN
 * bounding box is what makes the tight-bbox rule (D3) hold BY CONSTRUCTION: the user draws
 * the shape anywhere in the box at any size, and the shape — not its placement — is what
 * the template records; `width × height` remain the only size vocabulary.
 *
 * The result then takes THE one predicate (`validateCustomOutline`) and the winding
 * normaliser, so a surface committing through this function can never store a ring another
 * surface would refuse (C84 EI-9). A degenerate bbox (zero width or height) is reported
 * through the predicate's own `degenerate-area` / `loose-bbox` vocabulary rather than a
 * second refusal dialect.
 */
export function normaliseOutlineToUnit(
    drawn: readonly WallProfileVertex[],
): OutlineNormaliseResult {
    let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
    for (const p of drawn) {
        if (p.u < uMin) uMin = p.u;
        if (p.u > uMax) uMax = p.u;
        if (p.v < vMin) vMin = p.v;
        if (p.v > vMax) vMax = p.v;
    }
    const du = uMax - uMin;
    const dv = vMax - vMin;
    // A flat ring cannot be normalised (division by ~0 would mint NaN/Infinity vertices, and
    // the predicate's own messages would then talk about non-finite points instead of the
    // real problem). Route it to the predicate on the RAW shape so the refusal is the one
    // the user can act on: too few vertices, or a degenerate area.
    const safe = du > 1e-9 && dv > 1e-9;
    const ring: CustomOutline = {
        vertices: drawn.map((p) => ({
            u: safe ? (p.u - uMin) / du : 0,
            v: safe ? (p.v - vMin) / dv : 0,
        })),
    };
    if (!safe) {
        return {
            ok: false,
            refusal: {
                code: 'degenerate-area',
                reason:
                    `the outline is flat — it spans ${du.toFixed(4)} m across and ` +
                    `${dv.toFixed(4)} m up, and a shape with no extent on an axis encloses ` +
                    `nothing. Draw at least a triangle.`,
            },
        };
    }
    const refusal = validateCustomOutline(ring);
    if (refusal) return { ok: false, refusal };
    return { ok: true, ring: normaliseCustomOutlineWinding(ring) };
}

/**
 * §OUTLINE81-DENORMALISE — the OPEN map: a stored unit ring → drawn metres at the given
 * extents. The exact inverse of {@link normaliseOutlineToUnit} for a tight ring (which every
 * stored ring is, by D3), so open → commit round-trips byte-stable to within float noise.
 */
export function denormaliseOutline(
    ring: CustomOutline,
    extents: OutlineAuthoringExtents,
): WallProfileVertex[] {
    return ring.vertices.map((p) => ({
        u: p.u * extents.length,
        v: p.v * extents.height,
    }));
}

/** The implicit full-box rectangle, metres — the Rectangle mode's reset shape. */
export function outlineRectangle(extents: OutlineAuthoringExtents): WallProfileVertex[] {
    return [
        { u: 0, v: 0 },
        { u: extents.length, v: 0 },
        { u: extents.length, v: extents.height },
        { u: 0, v: extents.height },
    ];
}
