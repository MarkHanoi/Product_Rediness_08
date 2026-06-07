// Environmental & Architectural Design Drivers — E.1 + E.2 (pure scoring helpers).
//
// Implements the FIRST two phases of SPEC-ENVIRONMENTAL-DESIGN-DRIVERS.md
// (tracker A.21.D29 #4) for the deterministic layout engine:
//
//   §ENV-E1-PRIORITY (E.1) — encode the §1 12-driver PRIORITY HIERARCHY as a small,
//     documented weight model over the objective axes. The spec's resolution order
//     (Site-fixed > Environmental-performance > Technical-systems > Form/regulation)
//     becomes a per-axis weight MULTIPLIER band: axes that serve a higher-priority
//     driver are amplified so a conflict resolves in the higher driver's favour.
//     Regulation (10) + structure (7) are HARD gates upstream (the enumerate.ts
//     legality / shape / topology / envelope gates) — this file documents that
//     mapping so the hierarchy is traceable end-to-end. The multipliers are applied
//     ON TOP of the existing per-axis weights (additive philosophy): they only shift
//     the relative emphasis, they do not introduce a new axis or change any raw
//     objective value.
//
//   §ENV-E2-SOLAR (E.2) — solar room-placement bias (spec §2). A SOFT objective on
//     the realised layout: daytime rooms (living / dining / kitchen) prefer the
//     equator-facing (sun) side of the plan; buffer rooms (garage / utility / bath /
//     storage / wc) prefer the cold (anti-equator) side. Reuses the A.21.D6 sun
//     data source (`equatorFacingDir` in windowEmission/solarOrientation.ts) so the
//     orientation convention is identical to the window-emission pass.
//
// GRACEFUL DEGRADATION (both): when no site orientation is available (no latitude,
// or a near-equatorial latitude where `equatorFacingDir` returns null), the solar
// axis returns the NEUTRAL value 1.0 — identical for every candidate, so it can
// never change the Pareto front or the ranking. Nothing throws. The priority-weight
// band is always defined (it doesn't depend on the site), but it too is structured
// so that with the current axis set the relative ordering only tunes, never breaks.
//
// Pure + deterministic. No I/O, no THREE, no DOM, no RNG. ai-host is L2.

import type { LayoutGraph, GraphNode, Pt } from './semanticGraph.js';
import type { ObjectiveVector } from './objectives.js';
import { equatorFacingDir } from '../windowEmission/solarOrientation.js';

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);
const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);

// ─────────────────────────────────────────────────────────────────────────────
// §ENV-E1-PRIORITY — the priority-hierarchy weight model.
//
// SPEC §1 maps each of the 12 drivers to a CATEGORY, resolved top-down:
//   Site-fixed              (orientation, topography, views, privacy)
//   Environmental perf.     (acoustic zoning, natural ventilation)
//   Technical systems       (structure, services, circulation)
//   Form & regulation       (fire escape, drainage, form compactness)
//
// "higher layer = higher weight". We translate the categories into multiplier
// BANDS and tag each EXISTING objective axis with the category its driver belongs
// to. A higher band multiplies that axis's contribution so a conflict between two
// candidates resolves in favour of the higher-priority driver — exactly the §1
// rule ("a ventilation path that compromises privacy is rerouted, not the privacy
// screen": privacy is Site-fixed, ventilation is Env-perf → privacy wins).
//
// Regulation (10) + structure (7) are HARD constraints, NOT weights — they live as
// gates in enumerate.ts (envelope / shape / topology / circulation admissibility),
// which DROP a candidate before ranking. They are recorded here as `HARD_GATES` for
// traceability only; this module never relaxes them.
// ─────────────────────────────────────────────────────────────────────────────

/** The four priority categories (spec §1), strongest first. */
export type PriorityCategory =
    | 'site-fixed'
    | 'env-performance'
    | 'technical-systems'
    | 'form-regulation';

/**
 * Multiplier band per category. Centred so the GEOMETRIC mean across the bands is
 * ≈ 1.0 — the model re-weights emphasis between drivers without inflating the
 * overall score scale. The spread is intentionally GENTLE (1.30 → 0.85): the
 * hierarchy must TUNE conflicts, not let a single site-fixed axis dominate every
 * other consideration (an architect balances; they don't ignore ventilation).
 */
export const PRIORITY_BAND: Readonly<Record<PriorityCategory, number>> = {
    'site-fixed': 1.30,
    'env-performance': 1.10,
    'technical-systems': 1.00,
    'form-regulation': 0.85,
} as const;

/**
 * Map each objective axis to the priority category of the §1 driver it primarily
 * serves. Axes not tied to a specific driver (pure compositional / quality axes)
 * are left UNLISTED → they receive the neutral 1.0 multiplier, so the band only
 * RE-WEIGHTS the driver-bearing axes and leaves the rest exactly as they were.
 *
 * Rationale per entry:
 *   daylight / facadeAlignment / solarOrientation → driver 1 (orientation & solar) → site-fixed
 *   circulation / hierarchy / spatialClimax /
 *     entrySightline / arrivalSequence            → driver 4 (privacy) — the
 *     privacy/arrival depth axes are the engine's privacy expression → site-fixed
 *   wetStackAlignment                             → driver 8 (services zoning) → technical-systems
 *   efficiency                                    → driver 9 (circulation/access) → technical-systems
 *   adjacency                                     → drivers 5/6 (acoustic + ventilation
 *     are resolved by which rooms connect to which) → env-performance
 *
 * (regularity / shapeQuality / topologyQuality / edgeRealisation / openingCadence /
 *  proportionalElegance / alignmentField are quality axes with no single §1 driver →
 *  neutral.)
 */
export const AXIS_PRIORITY: Readonly<Partial<Record<keyof ObjectiveVector, PriorityCategory>>> = {
    daylight: 'site-fixed',
    facadeAlignment: 'site-fixed',
    solarOrientation: 'site-fixed',
    circulation: 'site-fixed',
    hierarchy: 'site-fixed',
    spatialClimax: 'site-fixed',
    entrySightline: 'site-fixed',
    arrivalSequence: 'site-fixed',
    adjacency: 'env-performance',
    wetStackAlignment: 'technical-systems',
    efficiency: 'technical-systems',
} as const;

/**
 * Drivers enforced as HARD gates elsewhere (NOT weights). Documented here so the
 * priority hierarchy is traceable §1 → code. The enumerate.ts pool selection
 * DROPS candidates that fail these before any weighted ranking runs.
 */
export const HARD_GATES: ReadonlyArray<{ driver: number; name: string; gate: string }> = [
    { driver: 7, name: 'structure & spans', gate: 'shape / fit admissibility (validateRoomShape + validateRoomFit) + envelope band' },
    { driver: 10, name: 'fire escape', gate: 'connected + circulationRouted (every room reachable from entry via a protected route)' },
    { driver: 12, name: 'form compactness', gate: 'envelope gate (validateApartmentEnvelope / validateHouseStorey gross-area band)' },
] as const;

/**
 * §ENV-E1-PRIORITY — the priority-band multiplier for an objective axis.
 * Returns 1.0 for any axis not tied to a §1 driver (the common case for the
 * quality axes), so the model only re-weights the driver-bearing axes.
 */
export function priorityMultiplier(axis: keyof ObjectiveVector): number {
    const cat = AXIS_PRIORITY[axis];
    return cat ? PRIORITY_BAND[cat] : 1.0;
}

// ─────────────────────────────────────────────────────────────────────────────
// §ENV-E2-SOLAR — solar room-placement bias.
// ─────────────────────────────────────────────────────────────────────────────

/** Daytime rooms — should sit on the equator-facing (sun) side (spec §2). */
const DAYTIME_TYPES = new Set(['living', 'dining', 'kitchen']);
/** Buffer / cold-side rooms — should sit on the anti-equator (cold) side (spec §2). */
const BUFFER_TYPES = new Set(['garage', 'utility', 'bathroom', 'ensuite', 'wc', 'storage']);

/** Bounding rect of a node's polygon in world {x,z}, or null when absent. */
function polyRect(n: GraphNode): { minX: number; minZ: number; maxX: number; maxZ: number } | null {
    const p = n.geometry?.polygon ?? [];
    if (p.length < 3) return null;
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (const pt of p) {
        if (pt.x < minX) minX = pt.x; if (pt.x > maxX) maxX = pt.x;
        if (pt.z < minZ) minZ = pt.z; if (pt.z > maxZ) maxZ = pt.z;
    }
    return { minX, minZ, maxX, maxZ };
}

const rectCentroid = (r: { minX: number; minZ: number; maxX: number; maxZ: number }): Pt =>
    ({ x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2 });

/**
 * §ENV-E2-SOLAR — solar room-placement orientation score in [0, 1].
 *
 * Higher = daytime rooms (living/dining/kitchen) sit MORE toward the equator-facing
 * side and buffer rooms (garage/utility/bath/storage/wc) sit MORE toward the cold
 * side, per spec §2. SOFT — a single number the Pareto rank weighs against the
 * other axes; never a hard rule.
 *
 * Method (pure + deterministic):
 *   1. Resolve the equator-facing direction from `latDeg` via the A.21.D6 source
 *      (`equatorFacingDir`). It returns {x,y} in the WINDOW emit frame (x=East,
 *      y=South); the TGL plan frame is {x,z} with +z = South (scene −z = North),
 *      so the equator-facing unit vector in THIS frame is { x: dir.x, z: dir.y }.
 *      (For N-hemisphere that is +z = South; for S-hemisphere −z = North.)
 *   2. Project every scored room's centroid (relative to the plan centroid) onto
 *      that equator axis → a signed "equator-ness" coordinate.
 *   3. Normalise each room's coordinate to [0,1] across the plan span on the axis.
 *   4. Daytime rooms want HIGH equator-ness; buffer rooms want LOW. Score each
 *      room's compliance, area-weight, and average.
 *
 * GRACEFUL DEGRADATION: returns 1.0 (neutral) when —
 *   • `latDeg` is undefined / non-finite, OR
 *   • the latitude is near-equatorial (`equatorFacingDir` → null), OR
 *   • there are no scored (daytime ∪ buffer) rooms with geometry, OR
 *   • the plan has zero span on the equator axis (degenerate).
 * A neutral 1.0 across all candidates is rank-invisible, so absent site data
 * leaves existing behaviour byte-identical.
 */
export function solarOrientationScore(graph: LayoutGraph, latDeg: number | undefined): number {
    if (latDeg === undefined || !Number.isFinite(latDeg)) return 1;
    const dir = equatorFacingDir(latDeg);
    if (!dir) return 1;                                  // near-equator — no preference
    // Map window-emit {x,y=South} → plan {x,z=South}.
    const ex = dir.x, ez = dir.y;

    const spaces = graph.nodes.filter(n => n.kind === 'Space');
    if (spaces.length === 0) return 1;

    // Plan centroid (area-neutral mean of room centroids) — the reference the
    // equator projection is measured from. Using room centroids (not the shell)
    // keeps this self-contained on the LayoutGraph.
    const rects = new Map<string, ReturnType<typeof polyRect>>();
    let cx = 0, cz = 0, nCent = 0;
    for (const s of spaces) {
        const r = polyRect(s);
        rects.set(s.guid, r);
        if (!r) continue;
        const c = rectCentroid(r);
        cx += c.x; cz += c.z; nCent++;
    }
    if (nCent === 0) return 1;
    cx /= nCent; cz /= nCent;

    // Project ALL rooms first (so the normalisation span covers the whole plan,
    // not just the scored subset — a daytime room at the south edge then reads as
    // a genuine "1.0" relative to the building, not relative to its peers).
    const projOf = new Map<string, number>();
    let minProj = Infinity, maxProj = -Infinity;
    for (const s of spaces) {
        const r = rects.get(s.guid);
        if (!r) continue;
        const c = rectCentroid(r);
        const proj = (c.x - cx) * ex + (c.z - cz) * ez;     // signed distance along equator axis
        projOf.set(s.guid, proj);
        if (proj < minProj) minProj = proj;
        if (proj > maxProj) maxProj = proj;
    }
    const span = maxProj - minProj;
    if (!(span > 1e-6)) return 1;                            // degenerate plan — neutral

    let weighted = 0, totalArea = 0;
    for (const s of spaces) {
        const t = typeof s.attrs.spaceType === 'string' ? s.attrs.spaceType : '';
        const daytime = DAYTIME_TYPES.has(t);
        const buffer = BUFFER_TYPES.has(t);
        if (!daytime && !buffer) continue;                  // only the two driver groups are scored
        const proj = projOf.get(s.guid);
        if (proj === undefined) continue;
        const area = num(s.attrs.netAreaM2);
        if (area <= 0) continue;
        const norm = (proj - minProj) / span;               // 0 = cold side, 1 = equator side
        // Daytime rooms want norm→1 (equator); buffer rooms want norm→0 (cold).
        const compliance = daytime ? norm : 1 - norm;
        weighted += compliance * area;
        totalArea += area;
    }
    return totalArea > 0 ? clamp01(weighted / totalArea) : 1;
}
