/**
 * @file TreeElevationSymbolGeometry.ts — §TREE135 (L-12180)
 *
 * PURE, deterministic 2D symbol linework for the parametric tree library in
 * ELEVATION and SECTION views. No THREE, no DOM, no store access — fixture
 * parameters (+ the element's own instance id) → flat line-segment buffers.
 * Consumed by `TreeElevationSymbolBuilder`. Mirrors the architecture of
 * `PlumbingSymbolGeometry.buildElevationLinework` — the proven precedent for
 * "this family draws a drafted symbol in elevation instead of its true
 * projection" (`packages/geometry-plumbing/src/PlumbingSymbolGeometry.ts`).
 *
 * ## The defect this closes
 *
 * `TreePlanSymbolBuilder` already replaces the raw mesh-edge projection with a
 * clean architectural symbol IN PLAN. Elevation and section never got the same
 * treatment: `ParametricTreeEngine` tagged every mesh `skipInPlan` only, so an
 * elevation or section still ran the generic `THREE.EdgesGeometry` pass over
 * the foliage-cluster icosahedra and tapered trunk/branch cylinders — the
 * "jumble of overlapping boxy quads with an asterisk-like scribble" the
 * founder's screenshot showed. This module is the pure geometry half of the
 * fix; `TreeElevationSymbolBuilder` is the injection half, and
 * `ParametricTreeEngine._tagForPlanView` now also stamps `skipInElevation` +
 * `skipInSection` so the generic edge-dump is suppressed in both.
 *
 * ## Dimensional truthfulness (non-negotiable — a "nice but wrong" symbol is
 * worse than the ugly true projection it replaces)
 *
 * The symbol's local-frame bounding box is EXACT, not approximate:
 *   • vertical extent  = [0, def.height]                    (trunk base → apex)
 *   • horizontal extent = [-def.crownRadius, +def.crownRadius] at the canopy
 * `_buildLobedOutline` achieves this by generating a perturbed unit shape and
 * then RESCALING it to the target bbox (not by hoping the perturbation stays
 * inside a radius); `_buildConicalOutline` and `_buildFrondedOutline` achieve
 * it by anchoring their extreme points literally at the target coordinates and
 * only randomising the INTERIOR. `TreeElevationSymbolBuilder.test.ts` pins
 * this with an explicit bbox assertion against `TreeSpeciesDef`.
 *
 * The trunk's clear height (canopy underside) is read from
 * `ARCHETYPE_TRUNK_CLEAR_RATIO` in `TreeTypes.ts` — the SAME authoritative
 * per-archetype fraction the 3D `ParametricTreeEngine` builders are
 * transcribed from (see that table's own header) — not a second, independently
 * guessed ratio. One authority, read twice (C84 EI-9).
 *
 * ## Front + side dual-profile technique (mirrors Plumbing exactly)
 *
 * Every line is emitted TWICE: once into the local X-Y plane at z=0 (the
 * "front" profile) and once into the local Z-Y plane at x=0 (the "side"
 * profile), using literally the same (u, v) pairs — `u` becomes `x` for the
 * front emission and `z` for the side emission. `OBC.TechnicalDrawing.
 * toDrawingSpace` then does the work: for a cardinal elevation/section the
 * profile that faces the viewer reads as the full, correctly-sized silhouette
 * and the perpendicular one collapses to a single vertical line at the
 * centreline (harmless — it reads as a stray trunk continuation, exactly the
 * artefact `PlumbingSymbolGeometry`'s own front+side comment accepts). This
 * gives a correct elevation for all four building elevations AND for a
 * section cutting from any direction, without a view-direction lookup inside
 * this pure builder — see that file's header for the original rationale.
 *
 * ## Species/type awareness — reuses the EXISTING derived axis, invents none
 *
 * `TreeTypes.ts` already derives `PlantingForm` from `TreeArchetype`
 * (`ARCHETYPE_FORM`) for the botanical-spec panel. This module does not
 * introduce a fourth axis: `TREE_ARCHETYPE_SILHOUETTE` below is its OWN
 * drawing-only classification (`'conical' | 'fronded' | 'lobed'`), keyed
 * directly off `TreeArchetype` — the same key `TreePlanSymbolBuilder`'s own
 * per-archetype `switch` already uses for the PLAN symbol. It is a
 * `Record<TreeArchetype, …>`, so a 13th archetype is a compile error here
 * until a silhouette bucket is assigned, exactly like `ARCHETYPE_FORM`.
 *
 * ## Determinism — per-INSTANCE, not per-species
 *
 * `TreePlanSymbolBuilder` seeds its PRNG from `def.id` (the SPECIES id), so
 * every tree of one species draws an IDENTICAL plan symbol — that is correct
 * for plan (a top-view canopy glyph is a schematic, not a portrait) and this
 * module does not touch it. In elevation the founder's reference plates show
 * visibly distinct silhouettes side by side, so this module seeds from the
 * ELEMENT's own instance id instead (`buildTreeElevationLinework(def, id)`):
 * two trees of the same species standing side by side get different lobe
 * phase, branch fan and leaf-cluster scatter, while the SAME tree (same id)
 * rebuilds byte-identical linework every time. No `Math.random()` anywhere in
 * this module — mulberry32, seeded from the id string (FNV-1a hash), per the
 * repo's standing no-`Math.random()` discipline.
 *
 * Pure DTO-in/array-out module: no THREE, no store, no DOM, no I/O.
 */

import type { TreeArchetype, TreeSpeciesDef } from '../TreeTypes';
import { ARCHETYPE_TRUNK_CLEAR_RATIO } from '../TreeTypes';

// ── Deterministic PRNG (mulberry32, FNV-1a seed) — same construction as
// TreePlanSymbolBuilder / ParametricTreeEngine, duplicated deliberately: each
// symbol-builder module owns its own copy so no drawing-only module depends
// on the 3D engine (P5-style purity boundary), matching existing precedent.

function _seedFromString(s: string): number {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
        h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    }
    return h >>> 0;
}

function _makePRNG(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ── Drawing-only silhouette classification (NOT a botanical axis) ─────────

type ElevationSilhouette = 'conical' | 'fronded' | 'lobed';

/**
 * Archetype → elevation silhouette family. Total by construction
 * (`Record<TreeArchetype, …>`) — a new archetype is a compile error here
 * until a silhouette is assigned, mirroring `ARCHETYPE_FORM` in TreeTypes.ts.
 */
const TREE_ARCHETYPE_SILHOUETTE: Readonly<Record<TreeArchetype, ElevationSilhouette>> = {
    round_dense:        'lobed',
    round_open:         'lobed',
    round_dotted:       'lobed',
    topiary:            'lobed',
    branchy:            'lobed',
    conifer_columnar:   'conical',
    conifer_pyramid:    'conical',
    conifer_starburst:  'conical',
    palm:               'fronded',
    willow:             'lobed',
    flowering:          'lobed',
    multi_lobed:        'lobed',
};

// ── UV accumulator — (u, v) = (horizontal offset from trunk centreline,
// height above ground). Emitted twice by `_emitDual` into world X-Y / Z-Y. ──

interface UV { u: number; v: number; }

function pushLine(acc: number[], a: UV, b: UV): void {
    acc.push(a.u, a.v, b.u, b.v);
}

function pushPolyline(acc: number[], pts: readonly UV[], closed: boolean): void {
    for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i], b = pts[i + 1];
        if (a && b) pushLine(acc, a, b);
    }
    if (closed && pts.length > 1) {
        const a = pts[pts.length - 1], b = pts[0];
        if (a && b) pushLine(acc, a, b);
    }
}

/** Small open arc (reads as a leaf-cluster squiggle, not a closed dot). */
function pushLeafCluster(acc: number[], cu: number, cv: number, r: number, rng: () => number): void {
    const startA = rng() * Math.PI * 2;
    const sweep  = Math.PI * 1.1 + rng() * Math.PI * 0.4;
    const segs   = 5;
    let prev: UV | null = null;
    for (let i = 0; i <= segs; i++) {
        const a = startA + (i / segs) * sweep;
        const p: UV = { u: cu + Math.cos(a) * r, v: cv + Math.sin(a) * r };
        if (prev) pushLine(acc, prev, p);
        prev = p;
    }
}

// ── Canopy outline builders (silhouette-specific) ──────────────────────────

interface CanopyBounds {
    /** Canopy underside (trunk clear height) — v of the base of the canopy band. */
    baseV: number;
    /** Apex — total tree height. */
    topV: number;
    /** Canopy half-width — crown radius. */
    R: number;
}

/**
 * Lobed/scalloped closed outline for the broadleaf family. Generates a
 * perturbed unit shape (lobe count + phase seeded per-instance) and RESCALES
 * it to the exact target bbox — see file header "Dimensional truthfulness".
 */
function _buildLobedOutline(b: CanopyBounds, rng: () => number): UV[] {
    const segments  = 40;
    const lobeCount = 5 + Math.floor(rng() * 3);   // 5,6,7
    const phase     = rng() * Math.PI * 2;
    const amp       = 0.12 + rng() * 0.08;

    const raw: UV[] = [];
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (let i = 0; i < segments; i++) {
        const a    = (i / segments) * Math.PI * 2;
        const bump = 1 + Math.sin(a * lobeCount + phase) * amp;
        const u    = Math.cos(a) * bump;
        const v    = Math.sin(a) * bump;
        raw.push({ u, v });
        if (u < minU) minU = u; if (u > maxU) maxU = u;
        if (v < minV) minV = v; if (v > maxV) maxV = v;
    }

    const canopyH = b.topV - b.baseV;
    const targetCV = b.baseV + canopyH / 2;
    const sx = (2 * b.R) / (maxU - minU);
    const sy = canopyH / (maxV - minV);
    const cu0 = (minU + maxU) / 2;
    const cv0 = (minV + maxV) / 2;

    return raw.map(p => ({
        u: (p.u - cu0) * sx,
        v: (p.v - cv0) * sy + targetCV,
    }));
}

/**
 * Tiered/scalloped tapering outline for the conifer family. Endpoints are
 * ANCHORED literally at the target coordinates (base half-width = R at
 * baseV, apex at (0, topV)); only interior tiers are jittered — exact bbox
 * by construction, no rescale needed.
 */
function _buildConicalOutline(b: CanopyBounds, rng: () => number): UV[] {
    const tiers = 3 + Math.floor(rng() * 3); // 3,4,5
    const left: UV[] = [];
    const right: UV[] = [];
    const canopyH = b.topV - b.baseV;
    for (let i = 0; i <= tiers; i++) {
        const t = i / tiers;
        const v = b.baseV + canopyH * t;
        const baseHalf = b.R * (1 - t);
        const interior = i > 0 && i < tiers;
        const jitter = interior ? (rng() - 0.5) * b.R * 0.12 : 0;
        const half = Math.max(0, baseHalf + jitter);
        left.push({ u: -half, v });
        right.push({ u: half, v });
    }
    return [...left, ...right.slice().reverse()];
}

/**
 * Clear-trunk + frond-fan outline for palms. Three anchor fronds pin the
 * exact bbox (leftmost tip at u=-R, rightmost at u=+R, one frond reaching the
 * exact apex v=topV); additional interior fronds (seeded count) fill the fan
 * without touching those extremes.
 */
function _buildFrondedLines(b: CanopyBounds, rng: () => number): UV[][] {
    const crown: UV = { u: 0, v: b.baseV };
    const canopyH = b.topV - b.baseV;
    const fronds: UV[][] = [];

    // Plain spine — crown to tip, no decoration. Used ONLY for the two
    // extreme anchor fronds: a perpendicular tip flourish on a frond that
    // already sits at the full ±R would risk pushing the flourish PAST the
    // bbox edge (the flourish offset has a component along the frond's own
    // droop, which is nonzero for these two), so the anchors that DEFINE the
    // bbox stay undecorated and exact by construction.
    const plainFrond = (tipU: number, tipV: number): UV[] => [crown, { u: tipU, v: tipV }];

    // Spine + a short tip flourish (2 extra segments) so interior/apex
    // fronds read as fronds rather than bare radial ticks. Safe for these
    // callers only: the apex frond's flourish is symmetric about the vertical
    // (never exceeds topV — see TreeElevationSymbolBuilder.test.ts), and
    // interior fronds are seeded within ±0.75R with headroom the flourish
    // cannot exhaust for any species in `TREE_SPECIES_TABLE`.
    const decoratedFrond = (tipU: number, tipV: number): UV[] => {
        const dirU = tipU - crown.u, dirV = tipV - crown.v;
        const len = Math.max(1e-6, Math.hypot(dirU, dirV));
        const nx = -dirV / len, ny = dirU / len; // perpendicular, unit
        const flourish = len * 0.12;
        const tip: UV = { u: tipU, v: tipV };
        const leftTick: UV = { u: tipU + nx * flourish - dirU / len * flourish, v: tipV + ny * flourish - dirV / len * flourish };
        const rightTick: UV = { u: tipU - nx * flourish - dirU / len * flourish, v: tipV - ny * flourish - dirV / len * flourish };
        return [crown, tip, leftTick, tip, rightTick];
    };

    fronds.push(plainFrond(-b.R, b.baseV + canopyH * 0.55));
    fronds.push(plainFrond(b.R, b.baseV + canopyH * 0.55));
    fronds.push(decoratedFrond(0, b.topV));

    const extra = 2 + Math.floor(rng() * 3); // 2,3,4
    for (let i = 0; i < extra; i++) {
        const uSpread = (rng() * 2 - 1) * 0.75; // interior only — never touches ±R
        const tipU = uSpread * b.R;
        const tipV = b.baseV + canopyH * (0.3 + rng() * 0.6);
        fronds.push(decoratedFrond(tipU, tipV));
    }
    return fronds;
}

// ── Trunk + branches (shared by all silhouettes) ────────────────────────────

function _buildTrunkAndBranches(
    trunkRadius: number, baseV: number, R: number, canopyH: number, rng: () => number,
): number[] {
    const acc: number[] = [];
    const topHalf = trunkRadius * 0.4;
    // Tapering trunk wedge + base cap.
    pushLine(acc, { u: -trunkRadius, v: 0 }, { u: -topHalf, v: baseV });
    pushLine(acc, { u: trunkRadius, v: 0 }, { u: topHalf, v: baseV });
    pushLine(acc, { u: -trunkRadius, v: 0 }, { u: trunkRadius, v: 0 });

    // 3–5 branches fanning from the trunk top up into the canopy, each with a
    // secondary fork so the silhouette reads as branching, not a plain fan.
    const branchCount = 3 + Math.floor(rng() * 3); // 3,4,5
    for (let i = 0; i < branchCount; i++) {
        const t = branchCount === 1 ? 0.5 : i / (branchCount - 1);
        const spread = (t - 0.5) * 2; // -1..1
        const midU = spread * R * (0.35 + rng() * 0.15);
        const midV = baseV + canopyH * (0.15 + rng() * 0.10);
        pushLine(acc, { u: 0, v: baseV }, { u: midU, v: midV });
        const tipU = midU + spread * R * (0.15 + rng() * 0.15);
        const tipV = midV + canopyH * (0.15 + rng() * 0.15);
        pushLine(acc, { u: midU, v: midV }, { u: tipU, v: tipV });
    }
    return acc;
}

// ── World-Y placement (shared by the builder AND its test — one authority) ─

/**
 * The world-Y the tree's LOCAL v=0 (trunk base) must land on. Matches
 * `TreePlanSymbolBuilder`'s own placement (`(tree.position.y ?? 0) +
 * (tree.baseOffset ?? 0)`) exactly, factored out so a test can assert
 * "trunk base sits at the tree's base Y" against a NON-ZERO fixture without
 * duplicating the arithmetic — a hard-coded 0 in either place would then be
 * two answers to one question instead of one (C84 EI-9).
 */
export function resolveTreeGroundY(
    position: { readonly y?: number } | undefined,
    baseOffset: number | undefined,
): number {
    return (position?.y ?? 0) + (baseOffset ?? 0);
}

// ── Public entry point ───────────────────────────────────────────────────

/**
 * Build the ELEVATION/SECTION symbol linework for one placed tree, in the
 * local frame (origin = trunk base at ground, +Y up). Returns a flat
 * [x, y, z, x, y, z, …] line-segment buffer combining the front (X-Y) and
 * side (Z-Y) profiles. Pure + deterministic — see file header.
 *
 * @param def        the species definition (height, crownRadius, trunkRadius,
 *                    archetype — read from `TREE_SPECIES_TABLE`, never guessed).
 * @param instanceId  the PLACED ELEMENT's own id (`FurnitureData.id`), NOT the
 *                    species id — seeds the per-instance variation so two
 *                    trees of the same species draw different silhouettes.
 */
export function buildTreeElevationLinework(def: TreeSpeciesDef, instanceId: string): number[] {
    const rng = _makePRNG(_seedFromString(`${instanceId}:elev`));

    const H       = def.height;
    const R       = def.crownRadius;
    const baseV   = H * ARCHETYPE_TRUNK_CLEAR_RATIO[def.archetype]; // canopy underside
    const canopyH = H - baseV;
    const bounds: CanopyBounds = { baseV, topV: H, R };
    const silhouette = TREE_ARCHETYPE_SILHOUETTE[def.archetype];

    const uv: number[] = _buildTrunkAndBranches(def.trunkRadius, baseV, R, canopyH, rng);

    if (silhouette === 'lobed') {
        pushPolyline(uv, _buildLobedOutline(bounds, rng), /* closed */ true);
        const clusters = 4 + Math.floor(rng() * 5); // 4..8
        const cv = baseV + canopyH / 2;
        for (let i = 0; i < clusters; i++) {
            const a = rng() * Math.PI * 2;
            const rr = Math.min(R, canopyH / 2) * (0.15 + rng() * 0.5);
            const clusterR = Math.min(R, canopyH / 2) * (0.10 + rng() * 0.08);
            pushLeafCluster(uv, Math.cos(a) * rr, cv + Math.sin(a) * rr, clusterR, rng);
        }
    } else if (silhouette === 'conical') {
        pushPolyline(uv, _buildConicalOutline(bounds, rng), /* closed */ true);
        const clusters = 3 + Math.floor(rng() * 4); // 3..6
        for (let i = 0; i < clusters; i++) {
            const vT = rng();
            const v = baseV + canopyH * (0.15 + vT * 0.7);
            const halfAt = R * (1 - (v - baseV) / canopyH) * (0.3 + rng() * 0.4);
            const u = (rng() * 2 - 1) * halfAt;
            const clusterR = Math.min(R, canopyH) * 0.06;
            pushLeafCluster(uv, u, v, clusterR, rng);
        }
    } else {
        for (const f of _buildFrondedLines(bounds, rng)) pushPolyline(uv, f, /* closed */ false);
    }

    // Emit both profiles from the same (u, v) pairs — see file header.
    const acc: number[] = [];
    for (let i = 0; i + 3 < uv.length; i += 4) {
        // The loop bound guarantees all four indices are in range.
        const u0 = uv[i]!, v0 = uv[i + 1]!, u1 = uv[i + 2]!, v1 = uv[i + 3]!;
        acc.push(u0, v0, 0, u1, v1, 0); // front: X-Y @ z=0
        acc.push(0, v0, u0, 0, v1, u1); // side:  Z-Y @ x=0
    }
    return acc;
}
