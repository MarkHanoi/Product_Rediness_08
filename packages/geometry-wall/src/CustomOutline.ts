/**
 * CustomOutline — §OUTLINE80 (SPEC-WINDOW-CUSTOM-OUTLINE D1–D3) — the free-form
 * ring an opening's `'custom'` profile kind carries, its ONE validator, and the
 * PRESET rings a type author or a chat command may apply by name.
 *
 * ── WHAT THIS IS, AND WHERE IT LIVES ────────────────────────────────────────
 * `openingProfile` (C86 §10.1 PR-7) gains one more kind, `'custom'`, and this
 * module is that kind's companion carrier — the sibling `OpeningProfile.ts`
 * imports it rather than declaring the ring shape twice (C84 §8.d).
 *
 * The ring is NORMALISED to the opening's own unit bounding box: `u` runs
 * `[0, 1]` along the wall, `v` runs `[0, 1]` up from the sill line. `width` and
 * `height` stay the ONLY size vocabulary — resizing an opening stretches its
 * ring rather than needing a second set of authored dimensions (D2). This is
 * the identical convention `WallProfileVertex {u, v}` already uses for the
 * wall's OWN authored elevation outline (`WallProfile.ts`), which is why the
 * validator below reuses that module's constants rather than inventing new
 * ones (C73 — no bare tolerance literals).
 *
 * ── THE ONE PREDICATE (D3) ──────────────────────────────────────────────────
 * `validateCustomOutline` is the ONLY place a ring is judged valid or not, so
 * the schema refine, the authoring-surface commit gate (OUTLINE81) and
 * `openingProfileShapeRefusal` (OpeningProfile.ts) cannot disagree about what
 * a legal custom outline is (C84 EI-9). It returns a TYPED refusal — a rule
 * NAME plus the NUMBERS that failed it — never a bare boolean, so a caller can
 * put the reason in front of a user without re-deriving it (C16 CA-18 / C74).
 *
 * ── PRESETS (D7, §6) ─────────────────────────────────────────────────────────
 * Four named rings — triangle, trapezoid, gable (pentagon), gothic — DATA only,
 * no code branch. Each is pre-validated by this module's own test so a preset
 * can never itself be the thing `validateCustomOutline` refuses. Three are
 * straight-edged; the gothic preset's two arcs are tessellated through
 * `@pryzm/geometry-slab`'s `arcSegmentThroughMidpoint` — the SAME chord-count
 * constant (`BOUNDARY_ARC_SEGMENTS = 16`) the wall's own curved-boundary tool
 * uses, imported rather than duplicated. `geometry-wall` (L2) already depends
 * on `geometry-slab` (L2, same family) for the wall PROFILE machinery
 * (`SlabWallCoupling.ts`, `WallTool.ts`, …), so this is not a new edge in the
 * layer graph — `tools/ga-gate/check-layer-boundaries.ts` classifies both as
 * `[family]` L2 and same-layer imports are not upward.
 */

import { findSelfIntersection, type Pt2 } from '@pryzm/geometry-kernel';
// §OUTLINE80-CYCLE-FIX — the BARE `@pryzm/geometry-slab` specifier resolves its package barrel
// (`src/index.ts`), which re-exports `SlabDependencyTracker`/`SlabTool`/`SlabWallConnectivityService`
// — every one of which imports `@pryzm/geometry-wall`'s own barrel. Loading `CustomOutline.ts` (a
// module INSIDE geometry-wall) through the bare specifier therefore re-enters geometry-wall's own
// barrel while `OpeningProfile.ts` is still mid-evaluation, and `OPENING_PROFILE_KINDS` — assigned
// after that import block — reads as a TDZ `ReferenceError` (esbuild's CJS interop silently turns
// this into `undefined`, which is how it first surfaced: `OPENING_PROFILE_KINDS.join` on `undefined`
// in every vitest run touching `WallDataSchema`/`DoorTypes`). The package already ships a
// zero-dependency subpath for exactly this leaf (`"./boundary-arc": "./src/boundaryArc.ts"`,
// `boundaryArc.ts` itself has NO imports) — importing THAT instead of the barrel reuses the same
// function with no duplication and never touches `SlabDependencyTracker` et al., so the cycle
// cannot form. The repo's own precedent for this is the P2-legal `@pryzm/renderer-three/three`
// subpath (same reasoning: a narrow leaf without the barrel that pulls it in).
import { arcSegmentThroughMidpoint, BOUNDARY_ARC_SEGMENTS, type ArcVertex2D } from '@pryzm/geometry-slab/boundary-arc';
import { PROFILE_MIN_AREA_M2, PROFILE_U_TOL_M } from './WallProfile';

// ── The ring ────────────────────────────────────────────────────────────────

/** One vertex of a custom outline, NORMALISED to the opening's unit bbox. */
export interface CustomOutlineVertex {
    readonly u: number;
    readonly v: number;
}

/**
 * The companion carrier (D1). Present on the host `Opening` / `WindowOpening` /
 * `DoorOpening` iff `openingProfile === 'custom'` — enforced by a Zod
 * `superRefine` on all three schemas, not by convention.
 *
 * CLOSED, COUNTER-CLOCKWISE polyline, the SAME convention `OpeningOutline.points`
 * documents: the closing edge is implicit (`vertices[n-1]` joins `vertices[0]`)
 * and the first vertex is NOT repeated at the end.
 */
export interface CustomOutline {
    readonly vertices: readonly CustomOutlineVertex[];
}

// ── The tolerance policy (C73 — reused, never invented) ───────────────────────

/**
 * §OUTLINE80-BBOX-TOL — the "on the unit bbox edge" tolerance for a custom
 * ring's `u`/`v`, reused VERBATIM from `WallProfile.PROFILE_U_TOL_M` (1e-6,
 * already the wall-profile ring's own u-coincidence tolerance in the identical
 * `{u, v}` normalised frame). D3 states this exact number ("within 1e-6");
 * importing it rather than re-declaring it is what keeps this module off the
 * C73 §2 "hundreds of rival epsilons" ledger `check-epsilon-policy.ts` tracks —
 * a SECOND `1e-6` here with its own name would be one more entry on that
 * shrink-only ratchet for a value that already has a home.
 */
export const CUSTOM_OUTLINE_BBOX_TOL = PROFILE_U_TOL_M;

/**
 * §OUTLINE80-MIN-AREA — the ring's area floor, as a FRACTION of the unit
 * bounding box.
 *
 * D3: "area ≥ PROFILE_MIN_AREA as a fraction of the unit box, justified from
 * `WallProfile.PROFILE_MIN_AREA_M2` at the type's default size." The custom
 * ring is validated before `width`/`height` are known (the type editor draws
 * at whatever default the type currently declares), so the floor cannot be an
 * absolute area — it is `PROFILE_MIN_AREA_M2` evaluated at a REFERENCE opening
 * size, the 1.2 × 1.4 m fixture already canonical in this package's own tests
 * (`WallProfileNonRegressionBaseline.test.ts`'s `op-1`, `OpeningProfileSlice1.
 * test.ts`'s round-arch case). At that size the floor is a shade under one
 * millionth of the opening — in practice a "not literally zero" degeneracy
 * guard, which is exactly what `PROFILE_MIN_AREA_M2` already is for the wall's
 * own profile ring (§WallProfile.ts:246, `1e-6` m²).
 */
export const CUSTOM_OUTLINE_REFERENCE_WIDTH_M = 1.2;
export const CUSTOM_OUTLINE_REFERENCE_HEIGHT_M = 1.4;
export const CUSTOM_OUTLINE_MIN_AREA_FRACTION =
    PROFILE_MIN_AREA_M2 / (CUSTOM_OUTLINE_REFERENCE_WIDTH_M * CUSTOM_OUTLINE_REFERENCE_HEIGHT_M);

// ── The refusal ─────────────────────────────────────────────────────────────

export type CustomOutlineRefusalCode =
    | 'too-few-vertices'
    | 'non-finite-vertex'
    | 'closing-vertex-repeated'
    | 'self-intersecting'
    | 'loose-bbox'
    | 'degenerate-area';

/** A TYPED refusal — the rule name plus the numbers that failed it (D3, C16 CA-18). Never a boolean. */
export interface CustomOutlineRefusal {
    readonly code: CustomOutlineRefusalCode;
    readonly reason: string;
}

/**
 * §OUTLINE80-VALIDATE-CUSTOM-OUTLINE — THE ONE PREDICATE (D3).
 *
 * ≥ 3 vertices · every coordinate finite · first vertex not repeated at the
 * close · SIMPLE polygon (no self-intersection — delegates to the kernel's own
 * `findSelfIntersection`, never a second fold-detector) · winding is NEVER
 * refused (CCW is normalised on commit by {@link normaliseCustomOutlineWinding},
 * not gated here) · TIGHT bounding box (some vertex on each of `u=0`, `u=1`,
 * `v=0`, `v=1`, within {@link CUSTOM_OUTLINE_BBOX_TOL}) · area at least
 * {@link CUSTOM_OUTLINE_MIN_AREA_FRACTION} of the unit box.
 *
 * @returns `null` when the ring is valid, else a typed refusal naming the
 *          rule and the numbers. Every asker — the schema refine, the
 *          authoring-surface commit gate, `openingProfileShapeRefusal` — calls
 *          THIS function, so no surface can accept a ring another one refuses.
 */
export function validateCustomOutline(
    ring: CustomOutline | null | undefined,
): CustomOutlineRefusal | null {
    if (!ring || !Array.isArray(ring.vertices)) {
        return {
            code: 'too-few-vertices',
            reason: 'a custom outline needs at least 3 vertices; none were supplied.',
        };
    }
    const verts = ring.vertices;
    if (verts.length < 3) {
        return {
            code: 'too-few-vertices',
            reason: `a custom outline needs at least 3 vertices; this one has ${verts.length}.`,
        };
    }
    for (let i = 0; i < verts.length; i++) {
        const p = verts[i]!;
        if (!Number.isFinite(p.u) || !Number.isFinite(p.v)) {
            return {
                code: 'non-finite-vertex',
                reason: `vertex ${i} is not a finite (u, v) point: (${p.u}, ${p.v}).`,
            };
        }
    }

    const first = verts[0]!;
    const last = verts[verts.length - 1]!;
    if (
        Math.abs(first.u - last.u) <= CUSTOM_OUTLINE_BBOX_TOL &&
        Math.abs(first.v - last.v) <= CUSTOM_OUTLINE_BBOX_TOL
    ) {
        return {
            code: 'closing-vertex-repeated',
            reason:
                `the closing vertex (${last.u.toFixed(6)}, ${last.v.toFixed(6)}) repeats the first ` +
                `vertex — the ring closes IMPLICITLY (the same convention as OpeningOutline.points); ` +
                `drop the last point.`,
        };
    }

    // C73-SEGSEG-CANONICAL — the kernel's ONE fold detector, never a second one.
    const pts2: Pt2[] = verts.map((p) => [p.u, p.v] as Pt2);
    const hit = findSelfIntersection(pts2);
    if (hit) {
        return {
            code: 'self-intersecting',
            reason:
                `edges ${hit.i} and ${hit.j} cross — a custom outline must be a SIMPLE polygon ` +
                `(no self-intersection). Un-cross the ring at those two edges.`,
        };
    }

    let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
    for (const p of verts) {
        if (p.u < uMin) uMin = p.u;
        if (p.u > uMax) uMax = p.u;
        if (p.v < vMin) vMin = p.v;
        if (p.v > vMax) vMax = p.v;
    }
    const touches = (target: number, axis: 'u' | 'v'): boolean =>
        verts.some((p) => Math.abs(p[axis] - target) <= CUSTOM_OUTLINE_BBOX_TOL);
    if (!touches(0, 'u') || !touches(1, 'u') || !touches(0, 'v') || !touches(1, 'v')) {
        return {
            code: 'loose-bbox',
            reason:
                `the outline's bounding box is [${uMin.toFixed(6)}, ${uMax.toFixed(6)}] × ` +
                `[${vMin.toFixed(6)}, ${vMax.toFixed(6)}], not the unit square — at least one vertex ` +
                `must sit on each of u=0, u=1, v=0 and v=1 (within ${CUSTOM_OUTLINE_BBOX_TOL}), or ` +
                `this opening's width/height would misreport the shape it actually holds.`,
        };
    }

    let area2 = 0;
    for (let i = 0; i < verts.length; i++) {
        const a = verts[i]!;
        const b = verts[(i + 1) % verts.length]!;
        area2 += a.u * b.v - b.u * a.v;
    }
    const areaFraction = Math.abs(area2) / 2;
    if (!(areaFraction >= CUSTOM_OUTLINE_MIN_AREA_FRACTION)) {
        return {
            code: 'degenerate-area',
            reason:
                `the outline's area is ${(areaFraction * 100).toFixed(6)}% of its unit bounding box, ` +
                `below the ${(CUSTOM_OUTLINE_MIN_AREA_FRACTION * 100).toFixed(6)}% floor (WallProfile.` +
                `PROFILE_MIN_AREA_M2 evaluated at a ${CUSTOM_OUTLINE_REFERENCE_WIDTH_M} × ` +
                `${CUSTOM_OUTLINE_REFERENCE_HEIGHT_M} m reference opening) — too thin to hold a frame.`,
        };
    }

    return null;
}

/**
 * CCW winding — NORMALISED on commit, never refused (D3: "CCW … never refuse
 * for winding"). Returns the ring unchanged when it is already CCW.
 */
export function normaliseCustomOutlineWinding(ring: CustomOutline): CustomOutline {
    const verts = ring.vertices;
    let area2 = 0;
    for (let i = 0; i < verts.length; i++) {
        const a = verts[i]!;
        const b = verts[(i + 1) % verts.length]!;
        area2 += a.u * b.v - b.u * a.v;
    }
    if (area2 > 0) return ring;
    return { vertices: [...verts].reverse() };
}

// ── Presets (D7, §6) — RINGS ONLY, no code branch ─────────────────────────────

export type OpeningOutlinePresetId = 'triangle' | 'trapezoid' | 'gable' | 'gothic';

export const OPENING_OUTLINE_PRESET_IDS: readonly OpeningOutlinePresetId[] =
    ['triangle', 'trapezoid', 'gable', 'gothic'];

/** The user-facing name for each preset — the chat vocabulary's adjectives (D10) read these. */
export const OPENING_OUTLINE_PRESET_LABELS: Readonly<Record<OpeningOutlinePresetId, string>> = Object.freeze({
    triangle: 'Triangular',
    trapezoid: 'Trapezoid',
    gable: 'Gable',
    gothic: 'Gothic',
});

function v(u: number, val: number): CustomOutlineVertex {
    return { u, v: val };
}

/** Apex-up triangle: full-width base, apex at the top centre. */
const TRIANGLE_PRESET: CustomOutline = { vertices: [v(0, 0), v(1, 0), v(0.5, 1)] };

/** Wider at the sill, narrower at the head — the ordinary trapezoid window. */
const TRAPEZOID_PRESET: CustomOutline = {
    vertices: [v(0, 0), v(1, 0), v(0.8, 1), v(0.2, 1)],
};

/** A rectangle with a triangular roof — the classic gable/pentagon profile. */
const GABLE_PRESET: CustomOutline = {
    vertices: [v(0, 0), v(1, 0), v(1, 0.6), v(0.5, 1), v(0, 0.6)],
};

/**
 * The two-centred (equilateral) GOTHIC arch: jambs to a springing line, then
 * two circular arcs — each centred on the OPPOSITE springing point, radius
 * equal to the full span — meeting at a point directly above centre. This is
 * the standard masonry construction (compass-and-straightedge: strike each arc
 * from the far springing with the span as radius), not a stylised
 * approximation, so the springing height falls out of the geometry rather
 * than being chosen: `s = 1 − √3⁄2 ≈ 0.13397`, the height at which both unit-
 * radius arcs meet exactly on `v = 1` at `u = 0.5`.
 *
 * Each arc is TESSELLATED via `arcSegmentThroughMidpoint` through the arc's
 * OWN true midpoint (the point at the bisecting angle, on the circle) rather
 * than the chord's midpoint — so the quadratic-Bézier tessellation the
 * boundary tool uses passes through a real point on the true arc, not merely
 * near it.
 */
function buildGothicPreset(): CustomOutline {
    const s = 1 - Math.sqrt(3) / 2;
    // `ArcVertex2D` is {x, z} (geometry-slab's plan-frame naming); this preset is a (u, v)
    // elevation ring, so `z` carries `v` throughout this function — a label mismatch, not a
    // different meaning, exactly as `OutlinePoint {x, y}` already reuses an (x, y) helper for a
    // wall-local (along, up) frame elsewhere in C86 §10.1.
    const apexXZ: ArcVertex2D = { x: 0.5, z: 1 };
    const rightFootXZ: ArcVertex2D = { x: 1, z: s };
    const leftFootXZ: ArcVertex2D = { x: 0, z: s };
    // The RIGHT-side arc (from the right springing up to the apex) is centred
    // on the LEFT springing; the LEFT-side arc mirrors it. That is the
    // "opposite springing" construction stated above.
    const rightCenter: ArcVertex2D = { x: 0, z: s };
    const leftCenter: ArcVertex2D = { x: 1, z: s };

    const trueMid = (center: ArcVertex2D, a: ArcVertex2D, b: ArcVertex2D): ArcVertex2D => {
        const a0 = Math.atan2(a.z - center.z, a.x - center.x);
        const a1 = Math.atan2(b.z - center.z, b.x - center.x);
        const am = (a0 + a1) / 2;
        const r = Math.hypot(a.x - center.x, a.z - center.z);
        return { x: center.x + r * Math.cos(am), z: center.z + r * Math.sin(am) };
    };

    const rightMid = trueMid(rightCenter, rightFootXZ, apexXZ);
    const leftMid = trueMid(leftCenter, apexXZ, leftFootXZ);

    const rightArc = arcSegmentThroughMidpoint(rightFootXZ, rightMid, apexXZ, BOUNDARY_ARC_SEGMENTS);
    const leftArc = arcSegmentThroughMidpoint(apexXZ, leftMid, leftFootXZ, BOUNDARY_ARC_SEGMENTS);

    const fromXZ = (p: ArcVertex2D): CustomOutlineVertex => ({ u: p.x, v: p.z });

    return {
        vertices: [
            v(0, 0),
            v(1, 0),
            v(1, s),
            ...rightArc.map(fromXZ),   // excludes the (1,s) start, ends AT the apex
            ...leftArc.map(fromXZ),    // excludes the apex start (already emitted), ends at (0, s)
        ],
    };
}

const GOTHIC_PRESET: CustomOutline = buildGothicPreset();

const PRESET_RINGS: Readonly<Record<OpeningOutlinePresetId, CustomOutline>> = Object.freeze({
    triangle: TRIANGLE_PRESET,
    trapezoid: TRAPEZOID_PRESET,
    gable: GABLE_PRESET,
    gothic: GOTHIC_PRESET,
});

/** The ring for a named preset. Every preset is a valid custom outline by construction — pinned by test. */
export function openingOutlinePreset(id: OpeningOutlinePresetId): CustomOutline {
    return PRESET_RINGS[id];
}
