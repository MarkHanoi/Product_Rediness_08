// Environmental & Architectural Design Drivers — E.1 + E.2 + E.3 + E.4 (pure scoring helpers).
//
// Implements the FIRST four phases of SPEC-ENVIRONMENTAL-DESIGN-DRIVERS.md
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
//   §ENV-E3-ACOUSTIC (E.3) — acoustic-zoning bias (spec §4, driver 5,
//     Env-performance band). A SOFT objective on the realised layout: penalise a
//     QUIET room (bedroom / master / study) directly adjacent to a NOISY room
//     (kitchen / utility / laundry / wc / bathroom), and reward a layout where a
//     BUFFER (hall / corridor / wc / storage) sits between them. Uses the
//     `ADJACENT_TO` edges the engine already builds (shared-wall adjacency), so it
//     needs no new geometry. For MULTI-STOREY houses, `verticalStackAcousticScore`
//     adds the §4 vertical-stack preference (bedroom-above-bedroom OK;
//     bedroom-directly-above-kitchen/noisy = structure-borne penalty) consumed as a
//     SOFT storey-allocation preference (NOT a hard gate).
//
//   §ENV-E4-VENT (E.4) — natural-ventilation bias (spec §5, driver 6,
//     Env-performance band). A SOFT objective on the realised layout: reward
//     cross-ventilation potential — habitable rooms with openings (windows) on ≥2
//     DIFFERENTLY-ORIENTED / opposite external façades — and penalise plan depth
//     beyond the cross-vent reach (≈5× floor-to-ceiling, ~12-13 m) for habitable
//     rooms. A stair core spanning storeys reads as a stack path (rewarded where
//     present). Uses the existing Window/Opening + Wall (`isExternal`, `baseLine`)
//     graph data; no new geometry.
//
// GRACEFUL DEGRADATION (all): when no site orientation is available (no latitude,
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
 *   acousticZoning                                → driver 5 (acoustic zoning) → env-performance
 *   naturalVentilation                            → driver 6 (natural ventilation) → env-performance
 *
 * (regularity / shapeQuality / topologyQuality / edgeRealisation / openingCadence /
 *  proportionalElegance / alignmentField are quality axes with no single §1 driver →
 *  neutral.)
 */
export const AXIS_PRIORITY: Readonly<Partial<Record<keyof ObjectiveVector, PriorityCategory>>> = {
    daylight: 'site-fixed',
    // §A.21.D55 — daylightReach rides the same site-fixed (orientation/daylight)
    // priority band as `daylight` / `facadeAlignment` / `solarOrientation`: all
    // express the maximise-daylight intent (driver 1). Same constant multiplier
    // for every candidate ⇒ rank-invisible when the axis is neutral (baseline-safe).
    daylightReach: 'site-fixed',
    facadeAlignment: 'site-fixed',
    solarOrientation: 'site-fixed',
    circulation: 'site-fixed',
    hierarchy: 'site-fixed',
    spatialClimax: 'site-fixed',
    entrySightline: 'site-fixed',
    arrivalSequence: 'site-fixed',
    adjacency: 'env-performance',
    acousticZoning: 'env-performance',
    naturalVentilation: 'env-performance',
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

/** Width (X) × height (Z) of a node's polygon bounding rect, or {0,0} if absent. */
function polyWH(n: GraphNode): { w: number; h: number } {
    const r = polyRect(n);
    return r ? { w: r.maxX - r.minX, h: r.maxZ - r.minZ } : { w: 0, h: 0 };
}

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

// ─────────────────────────────────────────────────────────────────────────────
// §ENV-E3-ACOUSTIC — acoustic-zoning bias (spec §4, driver 5).
// ─────────────────────────────────────────────────────────────────────────────

/** Noisy rooms — should be BUFFERED from quiet rooms (spec §4). */
const NOISY_TYPES = new Set(['kitchen', 'utility', 'laundry', 'wc', 'bathroom']);
/** Quiet rooms — should NOT sit directly against a noisy room (spec §4). */
const QUIET_TYPES = new Set(['bedroom', 'master', 'study']);
/**
 * Buffer rooms — a hall / corridor / wc / storage BETWEEN a noisy and a quiet room
 * neutralises the airborne path (spec §4: "buffer noisy against quiet with a
 * hall/WC between"). `wc` is BOTH a noisy room AND an acceptable buffer (a small
 * sealed wet room between bedroom and kitchen IS the classic architect's buffer);
 * its noisy-vs-quiet penalty is handled by the direct-adjacency term, and its
 * buffering role by the buffer-bonus term — the two are independent contributions.
 */
const BUFFER_ROOM_TYPES = new Set(['hall', 'corridor', 'wc', 'storage']);

const spaceTypeOf = (n: GraphNode): string =>
    typeof n.attrs.spaceType === 'string' ? n.attrs.spaceType : '';

/**
 * §ENV-E3-ACOUSTIC — acoustic-zoning score in [0, 1] (spec §4, driver 5).
 *
 * Higher = quiet rooms (bedroom / master / study) are better BUFFERED from noisy
 * rooms (kitchen / utility / laundry / wc / bathroom). SOFT — a single number the
 * Pareto rank weighs against the other axes; never a hard rule.
 *
 * Method (pure + deterministic; uses ONLY the `ADJACENT_TO` shared-wall edges the
 * engine already builds):
 *   1. Enumerate every quiet↔noisy DIRECT adjacency (a shared wall between a
 *      bedroom and a kitchen/wc/etc.). Each such pair is a violation.
 *   2. Enumerate every quiet↔buffer↔noisy CHAIN (a bedroom adjacent to a
 *      hall/corridor that is in turn adjacent to a kitchen). Each such chain is a
 *      reward (the buffer is doing its job).
 *   3. Score = (rewarded buffered relations) / (rewarded + violations). With no
 *      violations the score is 1.0; with only violations it is 0.0.
 *
 * GRACEFUL DEGRADATION: returns 1.0 (neutral) when there are NO quiet↔noisy
 * relations at all (neither direct violations NOR buffered chains) — i.e. nothing
 * to zone. A constant 1.0 across every candidate is rank-invisible, so layouts
 * with no acoustic tension (or no adjacency data) stay byte-identical. Never
 * throws.
 */
export function acousticZoningScore(graph: LayoutGraph): number {
    const spaceType = new Map<string, string>();
    for (const n of graph.nodes) if (n.kind === 'Space') spaceType.set(n.guid, spaceTypeOf(n));
    if (spaceType.size === 0) return 1;

    // Undirected space-adjacency list from ADJACENT_TO edges (shared wall OR open
    // threshold — both conduct sound).
    const adj = new Map<string, Set<string>>();
    const link = (a: string, b: string): void => {
        if (!spaceType.has(a) || !spaceType.has(b)) return;
        (adj.get(a) ?? adj.set(a, new Set()).get(a)!).add(b);
        (adj.get(b) ?? adj.set(b, new Set()).get(b)!).add(a);
    };
    for (const e of graph.edges) {
        if (e.kind !== 'ADJACENT_TO') continue;
        link(e.from, e.to);
    }

    const isNoisy = (g: string): boolean => NOISY_TYPES.has(spaceType.get(g) ?? '');
    const isBuffer = (g: string): boolean => BUFFER_ROOM_TYPES.has(spaceType.get(g) ?? '');

    let violations = 0;   // quiet directly touching noisy
    let buffered = 0;     // quiet — buffer — noisy chain

    // Iterate quiet rooms; for each, look at neighbours.
    for (const [g, t] of spaceType) {
        if (!QUIET_TYPES.has(t)) continue;
        const neighbours = adj.get(g);
        if (!neighbours) continue;
        for (const nb of neighbours) {
            if (isNoisy(nb)) {
                // Direct quiet↔noisy adjacency — the airborne path is open.
                violations++;
            } else if (isBuffer(nb)) {
                // quiet↔buffer; reward only when the buffer ALSO touches a noisy
                // room (it is genuinely separating noisy from quiet). De-dup is
                // unnecessary for the ratio (each chain is one buffered relation).
                const bufNeighbours = adj.get(nb);
                if (!bufNeighbours) continue;
                for (const bn of bufNeighbours) {
                    if (bn !== g && isNoisy(bn)) { buffered++; break; }
                }
            }
        }
    }

    const total = violations + buffered;
    if (total === 0) return 1;                 // no acoustic tension → neutral
    return clamp01(buffered / total);
}

// ─────────────────────────────────────────────────────────────────────────────
// §ENV-E4-VENT — natural-ventilation bias (spec §5, driver 6).
// ─────────────────────────────────────────────────────────────────────────────

/** Cross-vent reach ≈ 5× floor-to-ceiling (~2.5 m) ⇒ ~12.5 m (spec §5). */
const CROSS_VENT_REACH_M = 12.5;
/** Façade-orientation bucket size — walls within this angle count as the SAME
 *  façade; openings on walls ≥ this apart count as DIFFERENT façades. */
const FACADE_ANGLE_BUCKET_DEG = 45;

/** Habitable room types that benefit from cross-ventilation + daylight depth. */
const HABITABLE_VENT_TYPES = new Set([
    'bedroom', 'master', 'living', 'dining', 'kitchen', 'study',
]);

/** Orientation bucket (0..3) of a wall baseLine, by its absolute heading mod 180°
 *  quantised to FACADE_ANGLE_BUCKET_DEG. Two walls in the same bucket face the
 *  same/parallel façade; different buckets ⇒ different façades. */
function facadeBucket(bl: readonly [Pt, Pt]): number {
    const [a, b] = bl;
    const ang = Math.atan2(b.z - a.z, b.x - a.x);      // radians, −π..π
    let deg = (ang * 180) / Math.PI;
    deg = ((deg % 180) + 180) % 180;                   // 0..180 (wall has no direction)
    return Math.floor(deg / FACADE_ANGLE_BUCKET_DEG) % (180 / FACADE_ANGLE_BUCKET_DEG);
}

/**
 * §ENV-E4-VENT — natural-ventilation score in [0, 1] (spec §5, driver 6).
 *
 * Higher = more habitable rooms achieve cross-ventilation (windows on ≥2
 * differently-oriented external façades) AND fewer habitable rooms exceed the
 * cross-vent plan-depth reach (~12.5 m). SOFT — a single number the Pareto rank
 * weighs against the other axes; never a hard rule.
 *
 * Per habitable room, two sub-scores blended 50/50:
 *   • crossVent: 1.0 when the room hosts window openings on ≥2 distinct façade
 *     orientation buckets (cross-flow possible); 0.5 with windows on exactly one
 *     façade (single-sided — limited); 0.0 with no window.
 *   • depth: 1.0 when the room's SHORTER plan dimension ≤ CROSS_VENT_REACH_M; for
 *     a deeper room, linear decay to 0.0 at 2× the reach (a deep room cannot be
 *     cross-ventilated from its façade openings alone — spec §5).
 * Room score = 0.5·crossVent + 0.5·depth; axis = area-weighted mean.
 *
 * STACK-PATH BONUS: a stair core spanning the storey (a Space whose type is
 * `stair`/`stairwell`, or, in the apartment graph, none) acts as a passive stack
 * chimney (spec §5). When present it lifts the axis toward 1.0 by a small factor,
 * reflecting the whole-plan buoyancy path. Absent ⇒ no change.
 *
 * GRACEFUL DEGRADATION: returns 1.0 (neutral) when there are NO habitable rooms
 * with geometry, or NO external walls in the graph at all (window/opening data
 * absent — e.g. an AI-path graph or a fixture with no walls). A constant 1.0
 * across every candidate is rank-invisible, so layouts without opening/wall data
 * stay byte-identical. Never throws.
 */
export function naturalVentilationScore(graph: LayoutGraph): number {
    const spaces = graph.nodes.filter(n => n.kind === 'Space');
    if (spaces.length === 0) return 1;

    // External-wall baseLines (for façade-orientation buckets).
    const extWallBaseLine = new Map<string, readonly [Pt, Pt]>();
    for (const n of graph.nodes) {
        if (n.kind !== 'Wall' || n.attrs.isExternal !== true) continue;
        const bl = n.geometry?.baseLine;
        if (!bl || bl.length < 2) continue;
        extWallBaseLine.set(n.guid, bl as readonly [Pt, Pt]);
    }
    if (extWallBaseLine.size === 0) return 1;            // no opening/façade data → neutral

    // Which walls is each WINDOW opening hosted by? (Opening --HOSTED_BY--> Wall;
    // an opening is a WINDOW when a `Window` node FILLS it.)
    const nodeByGuid = new Map<string, GraphNode>(graph.nodes.map(n => [n.guid, n]));
    const windowOpenings = new Set<string>();           // Opening guid carrying a Window
    for (const e of graph.edges) {
        if (e.kind !== 'FILLS') continue;
        const filler = nodeByGuid.get(e.from);
        if (filler && filler.kind === 'Window') windowOpenings.add(e.to);
    }
    const openingHostWall = new Map<string, string>();  // window-opening guid → wall guid
    for (const e of graph.edges) {
        if (e.kind !== 'HOSTED_BY') continue;
        if (windowOpenings.has(e.from)) openingHostWall.set(e.from, e.to);
    }

    // Which external walls BOUND each space.
    const spaceExtWalls = new Map<string, Set<string>>();
    for (const e of graph.edges) {
        if (e.kind !== 'BOUNDS') continue;
        if (!extWallBaseLine.has(e.from)) continue;
        (spaceExtWalls.get(e.to) ?? spaceExtWalls.set(e.to, new Set()).get(e.to)!).add(e.from);
    }

    // For each space, the set of façade BUCKETS that carry a WINDOW. A window is
    // counted for a space when its host wall is an external wall bounding that
    // space.
    const spaceWindowBuckets = new Map<string, Set<number>>();
    for (const [, wallGuid] of openingHostWall) {
        const bl = extWallBaseLine.get(wallGuid);
        if (!bl) continue;
        const bucket = facadeBucket(bl);
        // Attribute the window to every space this external wall bounds.
        for (const [sg, walls] of spaceExtWalls) {
            if (!walls.has(wallGuid)) continue;
            (spaceWindowBuckets.get(sg) ?? spaceWindowBuckets.set(sg, new Set()).get(sg)!).add(bucket);
        }
    }

    let weighted = 0, totalArea = 0;
    for (const s of spaces) {
        const t = spaceTypeOf(s);
        if (!HABITABLE_VENT_TYPES.has(t)) continue;
        const area = num(s.attrs.netAreaM2);
        if (area <= 0) continue;
        const wh = polyWH(s);
        if (!(wh.w > 0) || !(wh.h > 0)) continue;       // need geometry for depth

        const buckets = spaceWindowBuckets.get(s.guid);
        const facadeCount = buckets ? buckets.size : 0;
        const crossVent = facadeCount >= 2 ? 1 : facadeCount === 1 ? 0.5 : 0;

        // Plan depth = the SHORTER side (a room is cross-ventilated across its
        // narrow dimension). ≤ reach → 1.0; decays to 0 at 2× reach.
        const shortSide = Math.min(wh.w, wh.h);
        let depth: number;
        if (shortSide <= CROSS_VENT_REACH_M) depth = 1;
        else depth = clamp01(1 - (shortSide - CROSS_VENT_REACH_M) / CROSS_VENT_REACH_M);

        const roomScore = 0.5 * crossVent + 0.5 * depth;
        weighted += roomScore * area;
        totalArea += area;
    }
    if (totalArea <= 0) return 1;                        // no scorable habitable room → neutral
    let score = clamp01(weighted / totalArea);

    // STACK-PATH bonus: a stair/stairwell space is a buoyancy chimney for the plan
    // (spec §5). Nudge the score a fraction toward 1.0 when present.
    const hasStack = spaces.some(s => {
        const t = spaceTypeOf(s);
        return t === 'stair' || t === 'stairwell';
    });
    if (hasStack) score = clamp01(score + 0.1 * (1 - score));
    return score;
}

// ─────────────────────────────────────────────────────────────────────────────
// §ENV-E3-ACOUSTIC (vertical) — multi-storey stack preference (spec §4).
//
// SOFT storey-allocation preference (NOT a hard gate). A pure scorer over an
// ordered stack of per-storey noisy/quiet room presence: bedroom-above-bedroom is
// fine; a bedroom directly above a kitchen/cinema/noisy room is the structure-borne
// problem the spec calls out. Used by `houseLayout/storeyAllocation.ts` to express
// a soft preference between otherwise-equal allocations.
// ─────────────────────────────────────────────────────────────────────────────

/** One storey's acoustic profile (presence flags, ground = index 0, upward). */
export interface StoreyAcousticProfile {
    readonly hasBedroom: boolean;
    readonly hasNoisy: boolean;     // kitchen / utility / laundry / cinema etc.
}

/**
 * §ENV-E3-ACOUSTIC (vertical) — score an ordered storey stack in [0, 1].
 *
 * For each ADJACENT storey pair (lower i, upper i+1): a bedroom on the UPPER
 * storey sitting directly ABOVE a NOISY lower storey is a structure-borne
 * transmission penalty (spec §4); a bedroom over a bedroom (or over a non-noisy
 * storey) is fine. Score = 1 − penalisedPairs / consideredPairs.
 *
 * GRACEFUL DEGRADATION: returns 1.0 (neutral) for a single storey (no stack), or
 * when NO upper bedroom sits over a lower storey at all (nothing to consider). A
 * constant across allocations leaves the existing deterministic allocation
 * untouched. Never throws.
 */
export function verticalStackAcousticScore(stack: readonly StoreyAcousticProfile[]): number {
    if (stack.length < 2) return 1;
    let considered = 0, penalised = 0;
    for (let i = 0; i + 1 < stack.length; i++) {
        const lower = stack[i]!;
        const upper = stack[i + 1]!;
        if (!upper.hasBedroom) continue;       // only an upper bedroom can be disturbed
        considered++;
        if (lower.hasNoisy) penalised++;       // bedroom directly above a noisy storey
    }
    if (considered === 0) return 1;            // no upper-bedroom pair → neutral
    return clamp01(1 - penalised / considered);
}
