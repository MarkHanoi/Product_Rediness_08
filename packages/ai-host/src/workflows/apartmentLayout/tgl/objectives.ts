// TGL P7 — the 5-axis objective vector (SPEC §4).
//
// Scores a finished LayoutGraph on five orthogonal architectural axes, each in
// [0,1], higher = better. P8 ranks candidates by a weighted sum of these; keeping
// the axes RAW (un-weighted) here lets P8 apply user weights + exact Pareto
// dominance without re-deriving anything.
//
//   efficiency   1 − corridorArea/totalArea            (less circulation = better)
//   adjacency    satisfied bubble edges / required     (graph vs BubbleGraph)
//   daylight     habitable area fronting the façade / habitable area
//   circulation  Space-Syntax gradient: public shallow, private deep  (← P6)
//   regularity   mean room aspect (→1) blended with axis alignment (always 1 here)
//
// Pure + deterministic. No geometry mutation, no RNG.

import type { BubbleGraph } from './bubbleGraph.js';
import type { LayoutGraph, GraphNode } from './semanticGraph.js';
import type { SyntaxMetrics } from './spaceSyntax.js';
import type { Pt } from './rectDecomposition.js';
import { preferenceBetween } from '../rules/programRules.js';
import { countVisibleSpacesByRaycast, scoreVisibleSpaceCount } from './entrySightlineRaycast.js';
import { solarOrientationScore, acousticZoningScore, naturalVentilationScore } from './envDrivers.js';

export interface ObjectiveVector {
    readonly efficiency: number;
    readonly adjacency: number;
    readonly daylight: number;
    readonly circulation: number;
    readonly regularity: number;
    /**
     * §PRIVACY-DEPTH (L2-β-1, 2026-05-29) — discrete-tier privacy-depth gradient,
     * COMPLEMENTING the existing `circulation` axis (which is area-weighted +
     * smooth). `hierarchy` rewards layouts where:
     *   • PRIVATE rooms (bedroom / master / bathroom / ensuite / wc) sit at
     *     graph depth ≥ 3 from the entry (deep, intimate).
     *   • PUBLIC rooms (living / dining / kitchen / hall) sit at depth ≤ 2
     *     (shallow, social).
     *   • Circulation rooms (corridor) are exempt — they bridge tiers.
     * Computed as `(area in correct tier) / (total scored area)`. Returns 1 when
     * every room is in its correct tier, 0 when every room is inverted. Pareto-
     * rank now distinguishes "private rooms genuinely deep" from "private rooms
     * one door from the entry" — the first emotionally-convincing-architecture
     * slice of the cognition stack Layer 2 (`APARTMENT-LAYOUT-STATUS §5.5`).
     */
    readonly hierarchy: number;
    /**
     * §SHAPE-QUALITY (D3.4, 2026-05-29) — fed by `validateRoomShape` soft
     * findings. Hard findings drop the candidate from the pool BEFORE Pareto;
     * soft findings (room area / width / aspect outside the comfortable bands)
     * accumulate as a fractional penalty here. Computed as
     *   1 − sum(softFindings.delta) / numRooms
     * clamped to [0, 1]. A layout with every room exactly in the comfortable
     * band scores 1; a layout with multiple borderline rooms scores lower.
     * Pareto-ranks "all-rooms-comfortable" above "rooms-fit-but-pinch".
     */
    readonly shapeQuality: number;
    /**
     * §TOPOLOGY-QUALITY (T3.3 analogue, 2026-05-29) — fed by the Part B
     * topology validators (`validateMandatoryAdjacencies`,
     * `validateForbiddenAdjacencies`). Hard findings drop the candidate
     * (gate); soft findings accumulate here. Today's Part B validators
     * produce only HARD findings, so this axis is binary (1 = topology-clean,
     * 0 = topology-violated). Acoustic + wet-cluster + sequence validators
     * (T2.3 / T2.4 / T2.6, later commits) will start emitting soft findings
     * that gradient this axis.
     */
    readonly topologyQuality: number;
    /**
     * §L3-γ-4 (2026-05-30) — edge-realisation axis. SOFT-scores how well
     * each bubble-graph edge's `via` geometric realisation matches its
     * semantic `kind` (the L3-γ-1/2 EdgeType classification). Examples:
     *   • INTIMATE_ACCESS edge wired with `via: 'open'` scores 0.0 (privacy
     *     defeated); with `via: 'door'` scores 1.0.
     *   • VISUAL_CONNECTION edge wired with `via: 'door'` scores 0.5 (the
     *     visual is blocked); with `via: 'open'` scores 1.0.
     * Axis value = mean realisation score across all edges that carry a
     * `kind`. Edges without `kind` (AI-path graphs, back-compat) score 1.0
     * neutrally so they don't penalise the axis. Backward compat: when no
     * edges declare a kind (legacy graphs), the axis is 1.0 (no opinion).
     * Makes the L3-γ-1/2 EdgeType data load-bearing in Pareto ranking.
     */
    readonly edgeRealisation: number;
    /**
     * §L4-δ-3 (2026-05-30) — opening cadence axis (Cognition Layer 4,
     * Compositional Geometry). For each wall hosting one or more openings
     * (doors / windows), score how rhythmically those openings are arranged
     * along the wall — including the gaps to the wall ends as virtual
     * "openings." Score per wall = 1 − coefficient_of_variation(gaps);
     * 1.0 = perfectly regular spacing, 0.0 = bunched at one end. Walls
     * with no openings score 1.0 neutrally. Axis = mean across walls that
     * carry openings.
     *
     * Architectural intent: rhythmic door placement reads as designed
     * (one door per bedroom on a corridor, evenly spaced); bunched doors
     * read as accidental. The axis distinguishes layouts that solve
     * adjacency BUT happen to bunch every door at one end of the
     * corridor from layouts that spread them.
     */
    readonly openingCadence: number;
    /**
     * §L4-δ-4 (2026-05-30) — proportional elegance axis (Cognition Layer 4,
     * Compositional Geometry; closes G4 with a SOFT gradient on top of
     * D2.1's HARD aspect-ratio bounds). Per-room: aspect = max/min side;
     * score follows a comfort plateau:
     *   • aspect ∈ [1.0, φ ≈ 1.618]: 1.0 (square→golden, all good)
     *   • aspect ∈ (φ, 2.5]: linear decay 1.0 → 0.7
     *   • aspect ∈ (2.5, 4.0]: linear decay 0.7 → 0.2
     *   • aspect > 4.0: 0.1 (corridor-like, poor for habitable rooms)
     * Aggregate axis = area-weighted mean across spaces. Distinguishes
     * layouts that PASS D2.1's hard aspect check but produce
     * uncomfortable long/thin rooms from layouts that produce well-
     * proportioned rooms in the architectural comfort band.
     */
    readonly proportionalElegance: number;
    /**
     * §L1-α-4 (2026-05-31) — façade alignment axis (Cognition Layer 1,
     * Environmental Intelligence). SOFT-scores how well the HABITABLE rooms
     * (needsWindow = true: bedroom / master / living / dining / kitchen /
     * study) anchor onto HIGH-VALUE shell-edges — south-facing > north-facing,
     * corner edges > straight runs (per L1-α-1 `FacadeValueField`). Pareto-
     * ranks "good rooms on best façades" above "good rooms on poor façades."
     *
     * Algorithm: for each habitable Space, walk its BOUNDS edges to external
     * Walls. For each external wall, match the wall's baseLine midpoint to
     * the nearest shell-edge in `bubble.facadeField.edges`, weight the
     * wall's length by that edge's `overallValue`, and sum. Normalise
     * against the upper bound (every habitable façade-touching edge at
     * value = 1) so the axis lives in [0, 1].
     *
     * Back-compat: when `bubble.facadeField` is absent (legacy callers /
     * shell polygon not supplied), falls back to the fraction of habitable
     * rooms that touch any external wall (binary per room, area-neutral) —
     * a degraded but monotonic proxy. When NO habitable room touches the
     * façade at all → 0; when EVERY habitable room is anchored on the best
     * edges → → 1.
     */
    readonly facadeAlignment: number;
    /**
     * §L4-δ-1 (2026-05-30) — alignment field axis (Cognition Layer 4,
     * Compositional Geometry; SCORING form). SOFT-scores how well the
     * room rect edges share AXIS LINES across the plan — a "designed"
     * plan has many walls aligning to a small number of structural
     * lines; a sloppy plan has every wall at a unique offset.
     *
     * Algorithm: collect every room rect's X-edges (x0, x1) and
     * Z-edges (z0, z1). Bucket by EPS-tolerant axis-line; count the
     * shared-edges (buckets with ≥2 hits) divided by total edges.
     * 1.0 = every edge aligns with at least one other; 0.0 = no
     * edge aligns with any other (architecturally accidental).
     *
     * Pairs with L4-δ-2 wetStackAlignment: that axis scores wet-room
     * centroids on a single axis; this axis scores ALL room edges
     * across the plan. Together they describe the spatial discipline
     * of the layout's axis system. Returns 1.0 for <2 rooms.
     *
     * The CONSTRUCTIVE pre-subdivide variant (L4-δ-1b: actively
     * snapping rect edges to shared axis lines BEFORE Pareto) remains
     * queued; this SCORING variant rewards layouts that arrived at
     * alignment by accident or by future subdivider work.
     */
    readonly alignmentField: number;
    /**
     * §L4-δ-2 (2026-05-30) — wet-stack alignment axis (Cognition Layer 4,
     * Compositional Geometry). SOFT-scores how aligned the WET rooms are
     * on a single plumbing axis. Aligned wet rooms can share a single
     * vertical stack (cheaper / cleaner architecture); scattered wet
     * rooms require multiple stacks (waste + acoustic + fire).
     *
     * Algorithm: compute centroid X-variance and Z-variance across all
     * wet rooms (kitchen / bathroom / ensuite / wc / utility). The
     * SMALLER of the two is the "stack-axis" deviation; lower = better
     * aligned. Score = 1 − clamp(σ_min / 2.0 m). Wet rooms perfectly
     * collinear on either axis → 1.0; spread by 2 m+ in BOTH axes → 0.
     *
     * Returns 1.0 when fewer than 2 wet rooms (no stack to optimise).
     * Complements the existing T2.4 wet-cluster validator (which
     * scores wall-sharing) by adding a CENTROID-AXIS check that
     * catches "rooms share a wall but their fixtures sit at opposite
     * corners."
     */
    readonly wetStackAlignment: number;
    /**
     * §L2-β-3 (2026-05-30) — arrival sequence axis (Cognition Layer 2,
     * Spatial Hierarchy). Detects the canonical "compression-release"
     * pattern: a small entry releasing into a larger revealed space.
     * Score = clamp(maxVisibleArea / entryArea / 4, 0, 1):
     *   ratio ≥ 4×: 1.0 (strong release — small lobby → large living)
     *   ratio 2×:   0.5 (mild release)
     *   ratio 1×:   0.25 (no release — same size)
     *   ratio < 1:  0 (anti-pattern — entry bigger than what it reveals)
     *
     * Returns 1.0 when entry is undefined or has no visible neighbours
     * (those failure modes are caught by entrySightline already).
     */
    readonly arrivalSequence: number;
    /**
     * §L2-β-2 (2026-05-30) — entry sightline axis (Cognition Layer 2,
     * Spatial Hierarchy). Graph-distance proxy for the ray-cast version:
     * counts the spaces directly reachable from the entry via a
     * CONNECTS_THROUGH (door) or ADJACENT_TO permeable edge — i.e.
     * spaces "visible" through one threshold. Score follows a bell
     * around the architectural ideal (1-2 spaces revealed by the entry):
     *   • visibleCount = 1 or 2: 1.0 (lobby reveals living without
     *     committing to private zones — classic compression-release setup)
     *   • visibleCount = 0:      0.3 (blind entry, disorienting)
     *   • visibleCount = 3:      0.7 (a little exposed but workable)
     *   • visibleCount ≥ 4:      0.3 (too open, privacy compromised)
     *
     * Returns 1.0 when no entry is identified (degenerate input).
     * The ray-cast version (true visual sightline through OPEN edges +
     * sub-window apertures) is queued as L2-β-2b; this graph-distance
     * version is the cheap first slice.
     */
    readonly entrySightline: number;
    /**
     * §L2-β-4 (2026-05-30) — spatial climax axis (Cognition Layer 2,
     * Spatial Hierarchy). Identifies the layout's DOMINANT space (largest
     * non-circulation room — typically the living room in apartment
     * programs, the main hall in commercial, the operating theatre in
     * healthcare) and scores its arrival depth:
     *   • depth ∈ [2, 4]: 1.0 (climax reached through proper sequence —
     *     entry → corridor → climax, the compression-release ideal)
     *   • depth 1: 0.6 (one-step access — too direct, no anticipation)
     *   • depth 0: 0.2 (climax IS the entry — no sequence at all)
     *   • depth > 4: 1.0 → 0.4 decay (too deep, navigation friction)
     *
     * Architectural intent: a well-composed plan creates a journey from
     * the entry to the major space, NOT a sudden reveal nor a maze.
     * Pareto-ranks layouts that produce a meaningful arrival sequence
     * above layouts that dump you straight into the living room.
     * Returns 1.0 when no entry or no dominant space (degenerate input).
     */
    readonly spatialClimax: number;
    /**
     * §ENV-E2-SOLAR (E.2, 2026-06-07) — solar room-placement bias axis
     * (Environmental-Design-Drivers spec §2; Cognition Layer 1, extends A.21.D6).
     * SOFT-scores whether DAYTIME rooms (living / dining / kitchen) sit toward the
     * equator-facing (sun) side of the plan and BUFFER rooms (garage / utility /
     * bathroom / ensuite / wc / storage) sit toward the cold (anti-equator) side.
     *
     * Reuses the A.21.D6 sun source (`equatorFacingDir`) so the orientation
     * convention matches the window-emission pass exactly. Computed in
     * `envDrivers.ts` (`solarOrientationScore`); area-weighted compliance over the
     * scored room set, normalised across the plan's equator-axis span.
     *
     * GRACEFUL DEGRADATION: 1.0 (neutral) when no site latitude is supplied, near
     * the equator (no equator-facing preference), or the plan is degenerate. A
     * constant 1.0 across all candidates is rank-invisible, so absent site data
     * leaves existing layout behaviour byte-identical (no test regression).
     */
    readonly solarOrientation: number;
    /**
     * §ENV-E3-ACOUSTIC (E.3, 2026-06-07) — acoustic-zoning axis
     * (Environmental-Design-Drivers spec §4, driver 5; Env-performance band).
     * SOFT-scores whether QUIET rooms (bedroom / master / study) are BUFFERED from
     * NOISY rooms (kitchen / utility / laundry / wc / bathroom). A bedroom directly
     * adjacent to a kitchen/wc is penalised; a hall/corridor/wc/storage BETWEEN
     * them is rewarded. Computed in `envDrivers.ts` (`acousticZoningScore`) from the
     * `ADJACENT_TO` shared-wall edges the engine already builds.
     *
     * GRACEFUL DEGRADATION: 1.0 (neutral) when the layout has NO quiet↔noisy
     * relation at all (nothing to zone, or no adjacency data). A constant 1.0
     * across all candidates is rank-invisible, so layouts with no acoustic tension
     * are byte-identical (no test regression). The multi-storey vertical-stack
     * preference (bedroom-over-kitchen penalty) lives as a SOFT preference in
     * `houseLayout/storeyAllocation.ts` (`verticalStackAcousticScore`), not here.
     */
    readonly acousticZoning: number;
    /**
     * §ENV-E4-VENT (E.4, 2026-06-07) — natural-ventilation axis
     * (Environmental-Design-Drivers spec §5, driver 6; Env-performance band).
     * SOFT-scores cross-ventilation potential: habitable rooms with window openings
     * on ≥2 DIFFERENTLY-ORIENTED external façades score high; single-sided rooms
     * score mid; rooms deeper than the cross-vent reach (~12.5 m, ≈5× floor-to-
     * ceiling) are penalised. A stair/stairwell stack path nudges the axis up.
     * Computed in `envDrivers.ts` (`naturalVentilationScore`) from the existing
     * Window/Opening + external-Wall graph data.
     *
     * GRACEFUL DEGRADATION: 1.0 (neutral) when there are NO external walls (no
     * opening/façade data) or no scorable habitable room. A constant 1.0 across all
     * candidates is rank-invisible, so layouts without window/wall data are byte-
     * identical (no test regression).
     */
    readonly naturalVentilation: number;
}

export const OBJECTIVE_AXES: readonly (keyof ObjectiveVector)[] =
    ['efficiency', 'adjacency', 'daylight', 'circulation', 'regularity', 'hierarchy', 'shapeQuality', 'topologyQuality', 'edgeRealisation', 'openingCadence', 'proportionalElegance', 'spatialClimax', 'entrySightline', 'arrivalSequence', 'wetStackAlignment', 'alignmentField', 'facadeAlignment', 'solarOrientation', 'acousticZoning', 'naturalVentilation'] as const;

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);
const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const polyWH = (n: GraphNode): { w: number; h: number } => {
    const p = n.geometry?.polygon ?? [];
    if (p.length < 3) return { w: 0, h: 0 };
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const pt of p) { if (pt.x < x0) x0 = pt.x; if (pt.x > x1) x1 = pt.x; if (pt.z < z0) z0 = pt.z; if (pt.z > z1) z1 = pt.z; }
    return { w: x1 - x0, h: z1 - z0 };
};
/** §L1-α-2 (2026-05-29) — bounding rect (world XZ) of a graph node's polygon. */
const polyRect = (n: GraphNode): { minX: number; minZ: number; maxX: number; maxZ: number } | null => {
    const p = n.geometry?.polygon ?? [];
    if (p.length < 3) return null;
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (const pt of p) { if (pt.x < minX) minX = pt.x; if (pt.x > maxX) maxX = pt.x; if (pt.z < minZ) minZ = pt.z; if (pt.z > maxZ) maxZ = pt.z; }
    return { minX, minZ, maxX, maxZ };
};

/**
 * Compute the raw 7-axis objective vector for a layout.
 *
 * `shapeQuality` is OPTIONAL and INJECTED by the caller — enumerate.ts knows the
 * per-room shapes + can run `validateRoomShape` against them. Default = 1
 * (no penalty) preserves every existing caller's behaviour. The default also
 * matches the "all rooms comfortable" outcome, so layouts without a shape
 * check ship at the optimistic upper bound rather than the pessimistic lower.
 */
export function computeObjectives(
    graph: LayoutGraph, metrics: SyntaxMetrics, bubble: BubbleGraph,
    shapeQuality: number = 1,
    topologyQuality: number = 1,
    // §ENV-E2-SOLAR (E.2) — OPTIONAL site latitude (decimal degrees) for the solar
    // room-placement bias axis. Absent / non-finite / near-equatorial ⇒ the
    // `solarOrientation` axis returns the NEUTRAL 1.0 (rank-invisible), so every
    // existing caller (none pass this) is byte-identical.
    latDeg: number | undefined = undefined,
): ObjectiveVector {
    const spaces = graph.nodes.filter(n => n.kind === 'Space');
    const totalArea = spaces.reduce((s, n) => s + num(n.attrs.netAreaM2), 0);
    if (spaces.length === 0 || totalArea <= 0) {
        return { efficiency: 0, adjacency: 0, daylight: 0, circulation: 0, regularity: 0, hierarchy: 0, shapeQuality: clamp01(shapeQuality), topologyQuality: clamp01(topologyQuality), edgeRealisation: 1, openingCadence: 1, proportionalElegance: 1, spatialClimax: 1, entrySightline: 1, arrivalSequence: 1, wetStackAlignment: 1, alignmentField: 1, facadeAlignment: 0, solarOrientation: 1, acousticZoning: 1, naturalVentilation: 1 };
    }

    // ── efficiency: how little of the floor is circulation. ──────────────────────
    const corridorArea = spaces.filter(n => n.attrs.spaceType === 'corridor' || n.attrs.spaceType === 'hall')
        .reduce((s, n) => s + num(n.attrs.netAreaM2), 0);
    const efficiency = clamp01(1 - corridorArea / totalArea);

    // ── adjacency: how many required bubble edges the placement actually realised,
    //    weighted by §ADJACENCY-PREFERENCE (queue #6). A missed kitchen↔dining edge
    //    (preference 1.0) costs more than a missed kitchen↔corridor edge (0.3).
    //    Missing preference → 1.0 weight, so rules without the field keep the old
    //    binary satisfied/required ratio.
    const guidOf = new Map(spaces.map(n => [n.sourceId, n.guid]));
    const typeBySource = new Map(bubble.rooms.map(r => [r.id, r.type]));
    const connectsThrough = new Set(graph.edges.filter(e => e.kind === 'CONNECTS_THROUGH').map(e => pairKey(e.from, e.to)));
    const permeableOpen = new Set(graph.edges.filter(e => e.kind === 'ADJACENT_TO' && e.props?.permeable === true).map(e => pairKey(e.from, e.to)));
    let requiredW = 0, satisfiedW = 0;
    for (const e of bubble.edges) {
        const ga = guidOf.get(e.a), gb = guidOf.get(e.b);
        if (!ga || !gb) continue;
        const tA = typeBySource.get(e.a), tB = typeBySource.get(e.b);
        const w = (tA && tB) ? preferenceBetween(tA, tB) : 1.0;
        requiredW += w;
        const key = pairKey(ga, gb);
        if (e.via === 'door' ? connectsThrough.has(key) : permeableOpen.has(key)) satisfiedW += w;
    }
    const adjacency = requiredW > 0 ? satisfiedW / requiredW : 1;

    // ── daylight: habitable rooms that can actually front the façade. ────────────
    // §L1-α-2 ENHANCEMENT (2026-05-29): when bubble.daylightField is present,
    // weight each fronting room's contribution by the depth-field average over
    // its rect — a shallow lit room out-scores a deep-but-lit room. Back-compat:
    // when no field, behaviour identical to the prior binary fronts-facade ratio.
    const externalWalls = new Set(graph.nodes.filter(n => n.kind === 'Wall' && n.attrs.isExternal === true).map(n => n.guid));
    const frontsFacade = new Set<string>();
    for (const e of graph.edges) if (e.kind === 'BOUNDS' && externalWalls.has(e.from)) frontsFacade.add(e.to);
    let habArea = 0, litArea = 0;
    for (const n of spaces) {
        if (n.attrs.needsWindow !== true) continue;
        const a = num(n.attrs.netAreaM2);
        habArea += a;
        if (!frontsFacade.has(n.guid)) continue;
        if (bubble.daylightField) {
            const rect = polyRect(n);
            const depthScore = rect ? bubble.daylightField.averageOverRect(rect) : 1;
            litArea += a * depthScore;
        } else {
            litArea += a;
        }
    }
    const daylight = habArea > 0 ? clamp01(litArea / habArea) : 1;

    // ── circulation: Space-Syntax gradient (public shallow, private deep). ────────
    let maxDepth = 0;
    for (const n of spaces) { const d = metrics.perSpaceDepth[n.guid]; if (Number.isFinite(d) && d! > maxDepth) maxDepth = d!; }
    let circWeighted = 0, circArea = 0;
    for (const n of spaces) {
        const a = num(n.attrs.netAreaM2);
        const d = metrics.perSpaceDepth[n.guid];
        const reward = !Number.isFinite(d) ? 0
            : maxDepth <= 0 ? (n.attrs.isPrivate === true ? 0 : 1)
                : n.attrs.isPrivate === true ? d! / maxDepth : 1 - d! / maxDepth;
        circWeighted += reward * a;
        circArea += a;
    }
    const circulation = circArea > 0 ? clamp01(circWeighted / circArea) : 0;

    // ── regularity: room aspect (→1) blended with axis alignment (1 here). ───────
    let aspectSum = 0, aspectN = 0;
    for (const n of spaces) {
        const { w, h } = polyWH(n);
        if (w > 0 && h > 0) { aspectSum += Math.min(w, h) / Math.max(w, h); aspectN++; }
    }
    const aspectMean = aspectN > 0 ? aspectSum / aspectN : 0;
    const regularity = clamp01(0.5 * aspectMean + 0.5 * 1);          // walls are axis-aligned ⇒ alignment = 1

    // ── §PRIVACY-DEPTH (L2-β-1): discrete-tier hierarchy gradient. ───────────────
    //   Public rooms should sit shallow (depth ≤ PUBLIC_MAX_DEPTH from entry);
    //   private rooms should sit deep (depth ≥ PRIVATE_MIN_DEPTH).
    //   Corridor / hall exempt — they BRIDGE tiers, not occupy them.
    //   Score = area in correct tier / total scored area.
    const PUBLIC_MAX_DEPTH = 2;
    const PRIVATE_MIN_DEPTH = 3;
    let hierWeighted = 0, hierArea = 0;
    for (const n of spaces) {
        const t = n.attrs.spaceType;
        // Skip exempt circulation tiers.
        if (t === 'corridor' || t === 'hall') continue;
        const a = num(n.attrs.netAreaM2);
        if (a <= 0) continue;
        const d = metrics.perSpaceDepth[n.guid];
        if (!Number.isFinite(d)) continue;
        hierArea += a;
        const isPriv = n.attrs.isPrivate === true;
        const inCorrectTier = isPriv
            ? d! >= PRIVATE_MIN_DEPTH
            : d! <= PUBLIC_MAX_DEPTH;
        if (inCorrectTier) hierWeighted += a;
    }
    const hierarchy = hierArea > 0 ? clamp01(hierWeighted / hierArea) : 1;

    // ── §L2-β-2 entrySightline: graph-distance proxy for "how many
    //    spaces does the entry visually reveal at one threshold?"
    //    Entry = the `hall`-type space; falls back to the depth-0 space.
    //    Visible = spaces connected via CONNECTS_THROUGH (door) or
    //    permeable ADJACENT_TO (open-plan threshold).
    let entryGuid: string | null = null;
    for (const n of spaces) {
        if (n.attrs.spaceType === 'hall') { entryGuid = n.guid; break; }
    }
    if (entryGuid === null) {
        for (const n of spaces) {
            const d = metrics.perSpaceDepth[n.guid];
            if (d === 0) { entryGuid = n.guid; break; }
        }
    }
    let entrySightline = 1;                                 // default neutral
    if (entryGuid !== null) {
        // §L2-β-2b (2026-05-30) — RAY-CAST variant. When every space carries
        // a polygon (the production D-TGL path), use the literal sight-line
        // raycaster: trace a segment from the entry centroid to each other
        // room's centroid, counting only those whose sight is NOT blocked by
        // a solid wall section. Falls back to the graph-distance form below
        // when polygons are missing (test fixtures without geometry, AI
        // back-compat). Both forms share `scoreVisibleSpaceCount` so the
        // architectural band semantics are identical.
        const allHavePolygons = spaces.every(n => (n.geometry?.polygon?.length ?? 0) >= 3);
        if (allHavePolygons) {
            const n = countVisibleSpacesByRaycast(graph, entryGuid);
            entrySightline = scoreVisibleSpaceCount(n);
        } else {
            const visible = new Set<string>();
            for (const e of graph.edges) {
                if (e.kind === 'CONNECTS_THROUGH') {
                    if (e.from === entryGuid) visible.add(e.to);
                    else if (e.to === entryGuid) visible.add(e.from);
                } else if (e.kind === 'ADJACENT_TO' && e.props?.permeable === true) {
                    if (e.from === entryGuid) visible.add(e.to);
                    else if (e.to === entryGuid) visible.add(e.from);
                }
            }
            entrySightline = scoreVisibleSpaceCount(visible.size);
        }
    }

    // ── §L2-β-3 arrivalSequence: compression-release pattern. Reuses the
    //    entry's visible-neighbours set; scores the area RATIO of the
    //    largest visible space to the entry itself. Strong release
    //    (4x+) = ideal; reverse (entry > visible) = anti-pattern.
    let arrivalSequence = 1;                                // default neutral
    if (entryGuid !== null) {
        const entryNode = spaces.find(s => s.guid === entryGuid);
        const entryArea = entryNode ? num(entryNode.attrs.netAreaM2) : 0;
        const visible = new Set<string>();
        for (const e of graph.edges) {
            if (e.kind === 'CONNECTS_THROUGH') {
                if (e.from === entryGuid) visible.add(e.to);
                else if (e.to === entryGuid) visible.add(e.from);
            } else if (e.kind === 'ADJACENT_TO' && e.props?.permeable === true) {
                if (e.from === entryGuid) visible.add(e.to);
                else if (e.to === entryGuid) visible.add(e.from);
            }
        }
        if (entryArea > 0 && visible.size > 0) {
            let maxVis = 0;
            for (const g of visible) {
                const sp = spaces.find(s => s.guid === g);
                if (!sp) continue;
                const a = num(sp.attrs.netAreaM2);
                if (a > maxVis) maxVis = a;
            }
            const ratio = maxVis / entryArea;
            arrivalSequence = clamp01(ratio / 4);
        }
    }

    // ── §L2-β-4 spatialClimax: identify the layout's DOMINANT non-
    //    circulation space and score its arrival depth. Compression-release
    //    architecture wants the climax at depth ∈ [2, 4]: too shallow = no
    //    sequence, too deep = navigation friction.
    let climaxArea = -1;
    let climaxGuid: string | null = null;
    for (const n of spaces) {
        const t = n.attrs.spaceType;
        if (t === 'corridor' || t === 'hall') continue;     // circulation exempt
        const a = num(n.attrs.netAreaM2);
        if (a > climaxArea) {
            climaxArea = a;
            climaxGuid = n.guid;
        }
    }
    let spatialClimax = 1;                                  // default neutral
    if (climaxGuid !== null) {
        const depth = metrics.perSpaceDepth[climaxGuid];
        if (Number.isFinite(depth)) {
            const d = depth!;
            if (d >= 2 && d <= 4)       spatialClimax = 1.0;
            else if (d === 1)            spatialClimax = 0.6;
            else if (d <= 0)             spatialClimax = 0.2;
            else /* d > 4 */             spatialClimax = clamp01(1.0 - 0.6 * (d - 4) / 4);
        }
    }

    // ── §L4-δ-1 alignmentField: shared axis-line detection. Collect every
    //    room rect's X-edges + Z-edges; bucket by EPS-tolerant coordinate;
    //    count edges that share a bucket with at least one other edge.
    //    Score = shared / total. Pure: depends only on Space.geometry.polygon
    //    rect extents.
    let alignmentField = 1;
    if (spaces.length >= 2) {
        const xEdges: number[] = [];
        const zEdges: number[] = [];
        for (const n of spaces) {
            const r = polyRect(n);
            if (!r) continue;
            xEdges.push(r.minX, r.maxX);
            zEdges.push(r.minZ, r.maxZ);
        }
        const EPS_M = 0.05;     // 50 mm tolerance — generous for axis coincidence
        const bucketCount = (edges: number[]): number => {
            if (edges.length < 2) return 0;
            // Sort + sweep: any edge within EPS of its neighbour is "shared."
            const sorted = edges.slice().sort((a, b) => a - b);
            let shared = 0;
            for (let i = 0; i < sorted.length; i++) {
                // Edge i is shared if it sits within EPS of i-1 OR i+1.
                const prev = i > 0 ? sorted[i - 1]! : Number.NEGATIVE_INFINITY;
                const next = i < sorted.length - 1 ? sorted[i + 1]! : Number.POSITIVE_INFINITY;
                if (sorted[i]! - prev <= EPS_M || next - sorted[i]! <= EPS_M) shared++;
            }
            return shared;
        };
        const totalEdges = xEdges.length + zEdges.length;
        if (totalEdges > 0) {
            const sharedTotal = bucketCount(xEdges) + bucketCount(zEdges);
            alignmentField = clamp01(sharedTotal / totalEdges);
        }
    }

    // ── §L4-δ-2 wetStackAlignment: how well-aligned the wet rooms are on
    //    a single plumbing axis. Computes variance of wet-room centroids
    //    on X + Z; the SMALLER variance is the "stack axis" deviation
    //    (perfect alignment → 0 variance on the stack axis). Score
    //    derived from σ_min / 2.0 m typical-room half-width.
    const WET_TYPES = new Set(['kitchen', 'bathroom', 'ensuite', 'wc', 'utility']);
    const wetCentroids: { x: number; z: number }[] = [];
    for (const n of spaces) {
        const t = typeof n.attrs.spaceType === 'string' ? n.attrs.spaceType : '';
        if (!WET_TYPES.has(t)) continue;
        const r = polyRect(n);
        if (!r) continue;
        wetCentroids.push({ x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2 });
    }
    let wetStackAlignment = 1;                              // default neutral (≤1 wet room)
    if (wetCentroids.length >= 2) {
        const meanX = wetCentroids.reduce((s, p) => s + p.x, 0) / wetCentroids.length;
        const meanZ = wetCentroids.reduce((s, p) => s + p.z, 0) / wetCentroids.length;
        const varX = wetCentroids.reduce((s, p) => s + (p.x - meanX) ** 2, 0) / wetCentroids.length;
        const varZ = wetCentroids.reduce((s, p) => s + (p.z - meanZ) ** 2, 0) / wetCentroids.length;
        const sigmaMin = Math.sqrt(Math.min(varX, varZ));
        const TYPICAL_ROOM_HALF_M = 2.0;
        wetStackAlignment = clamp01(1 - sigmaMin / TYPICAL_ROOM_HALF_M);
    }

    // ── §L4-δ-4 proportionalElegance: per-room aspect-ratio comfort plateau.
    //    Area-weighted mean across spaces. Soft gradient on top of D2.1's
    //    HARD aspect bounds.
    let elegSum = 0, elegArea = 0;
    for (const n of spaces) {
        const { w, h } = polyWH(n);
        if (w <= 0 || h <= 0) continue;
        const aspect = Math.max(w, h) / Math.min(w, h);
        const a = num(n.attrs.netAreaM2);
        if (a <= 0) continue;
        let s: number;
        const PHI = 1.618;
        if (aspect <= PHI) s = 1.0;
        else if (aspect <= 2.5) s = 1.0 - 0.3 * (aspect - PHI) / (2.5 - PHI);
        else if (aspect <= 4.0) s = 0.7 - 0.5 * (aspect - 2.5) / (4.0 - 2.5);
        else s = 0.1;
        elegSum += s * a;
        elegArea += a;
    }
    const proportionalElegance = elegArea > 0 ? clamp01(elegSum / elegArea) : 1;

    // ── §L4-δ-3 openingCadence: how rhythmically openings are arranged on
    //    each wall. For each Wall node, find Openings HOSTED_BY it; compute
    //    coefficient of variation of the gaps between consecutive openings
    //    (including the gaps to the wall ends as virtual openings). Score
    //    per wall = 1 − CV; walls with no openings score 1.0 neutrally.
    //    Axis = mean across walls that carry one or more openings.
    //    Pure: relies only on Wall.geometry.baseLine + Opening.attrs.offsetM.
    const wallNodes = graph.nodes.filter(n => n.kind === 'Wall');
    // Map wall GUID → its baseLine length (m).
    const wallLenM = new Map<string, number>();
    for (const w of wallNodes) {
        const bl = w.geometry?.baseLine;
        if (!bl || bl.length < 2) continue;
        const [a, b] = bl as readonly [{ x: number; z: number }, { x: number; z: number }];
        wallLenM.set(w.guid, Math.hypot(b.x - a.x, b.z - a.z));
    }
    // Map wall GUID → sorted opening offsets (m).
    const wallOpenings = new Map<string, number[]>();
    const openingNodes = new Map(graph.nodes.filter(n => n.kind === 'Opening').map(n => [n.guid, n]));
    for (const e of graph.edges) {
        if (e.kind !== 'HOSTED_BY') continue;
        const opening = openingNodes.get(e.from);
        if (!opening) continue;
        const offsetM = num(opening.attrs.offsetM, NaN);
        if (!Number.isFinite(offsetM)) continue;
        const list = wallOpenings.get(e.to) ?? [];
        list.push(offsetM);
        wallOpenings.set(e.to, list);
    }
    let cadenceSum = 0, cadenceN = 0;
    for (const [wallGuid, len] of wallLenM) {
        if (len <= 0) continue;
        const offsets = (wallOpenings.get(wallGuid) ?? []).slice().sort((a, b) => a - b);
        if (offsets.length === 0) continue;   // no openings — neutral, don't count
        // Build the gaps sequence: [first offset, …inter-opening gaps…, last to wall end].
        const positions = [0, ...offsets, len];
        const gaps: number[] = [];
        for (let i = 0; i < positions.length - 1; i++) gaps.push(positions[i + 1]! - positions[i]!);
        const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
        if (mean <= 1e-9) continue;
        const variance = gaps.reduce((s, g) => s + (g - mean) * (g - mean), 0) / gaps.length;
        const cv = Math.sqrt(variance) / mean;
        cadenceSum += Math.max(0, 1 - cv);
        cadenceN += 1;
    }
    const openingCadence = cadenceN > 0 ? clamp01(cadenceSum / cadenceN) : 1;

    // ── §L3-γ-4 edgeRealisation: how well each bubble edge's `via` matches
    //    what its semantic `kind` recommends. Per-kind scoring:
    //      CEREMONIAL_THRESHOLD: door = 1.0, open = 0.5
    //      INTIMATE_ACCESS:      door = 1.0, open = 0.0  (privacy lost)
    //      BUFFER:               door = 1.0, open = 0.3
    //      SERVICE_ACCESS:       door = 1.0, open = 0.2
    //      SOCIAL_FLOW:          door = 1.0, open = 1.0  (both fine)
    //      VISUAL_CONNECTION:    door = 0.5, open = 1.0  (door blocks the visual)
    //    Edges without `kind` (AI-path back-compat) score 1.0 neutrally so
    //    legacy graphs don't penalise the axis.
    let realisationSum = 0, realisationN = 0;
    for (const e of bubble.edges) {
        const kind = e.kind;
        if (kind === undefined) {
            realisationSum += 1; realisationN += 1; continue;
        }
        let s: number;
        if (kind === 'CEREMONIAL_THRESHOLD') s = e.via === 'door' ? 1.0 : 0.5;
        else if (kind === 'INTIMATE_ACCESS') s = e.via === 'door' ? 1.0 : 0.0;
        else if (kind === 'BUFFER')          s = e.via === 'door' ? 1.0 : 0.3;
        else if (kind === 'SERVICE_ACCESS')  s = e.via === 'door' ? 1.0 : 0.2;
        else if (kind === 'SOCIAL_FLOW')     s = 1.0;
        else if (kind === 'VISUAL_CONNECTION') s = e.via === 'open' ? 1.0 : 0.5;
        else s = 1.0;                       // ACOUSTIC_SEPARATION (reserved) — neutral
        realisationSum += s; realisationN += 1;
    }
    const edgeRealisation = realisationN > 0 ? clamp01(realisationSum / realisationN) : 1;

    // ── §L1-α-4 facadeAlignment: how well habitable rooms anchor on
    //    HIGH-VALUE shell-edges. Uses `bubble.facadeField` (per-edge
    //    sunlight + corner-exposure aggregate from L1-α-1) when present;
    //    falls back to a degraded "fraction of habitable rooms that touch
    //    any external wall" when absent (legacy bubble graphs without the
    //    shell polygon). Higher = better.
    const facadeAlignment = scoreFacadeAlignment(graph, bubble);

    // ── §ENV-E2-SOLAR (E.2): daytime rooms toward the equator face, buffer rooms
    //    toward the cold face. Reuses the A.21.D6 sun source via envDrivers.
    //    Returns the neutral 1.0 when `latDeg` is absent / near-equatorial /
    //    degenerate, so layouts without site data are byte-identical.
    const solarOrientation = solarOrientationScore(graph, latDeg);

    // ── §ENV-E3-ACOUSTIC (E.3): quiet rooms buffered from noisy rooms (spec §4).
    //    Reads the ADJACENT_TO shared-wall edges. Neutral 1.0 when no quiet↔noisy
    //    relation exists, so layouts with no acoustic tension are byte-identical.
    const acousticZoning = acousticZoningScore(graph);

    // ── §ENV-E4-VENT (E.4): cross-ventilation potential + plan-depth cap (spec §5).
    //    Reads Window/Opening + external-Wall data. Neutral 1.0 when no external
    //    walls / no scorable habitable room, so layouts without window/wall data
    //    are byte-identical.
    const naturalVentilation = naturalVentilationScore(graph);

    return { efficiency, adjacency, daylight, circulation, regularity, hierarchy, shapeQuality: clamp01(shapeQuality), topologyQuality: clamp01(topologyQuality), edgeRealisation, openingCadence, proportionalElegance, spatialClimax, entrySightline, arrivalSequence, wetStackAlignment, alignmentField, facadeAlignment, solarOrientation, acousticZoning, naturalVentilation };
}

/**
 * §L1-α-4 (2026-05-31) — façade alignment score in [0, 1].
 *
 * For each HABITABLE space (`needsWindow === true`), walks its BOUNDS edges
 * to external walls, matches each wall's baseLine midpoint to the nearest
 * shell-edge in `bubble.facadeField.edges`, and weights the wall length by
 * that edge's `overallValue`. Normalises against the upper bound (every
 * habitable façade-touching length at value = 1) so the axis lives in
 * [0, 1]. When the field is absent, falls back to a degraded "fraction
 * of habitable rooms touching any external wall" proxy.
 *
 * Pure: no I/O, no THREE, no DOM, no RNG. Exported for unit tests + future
 * cognition-stack rebalancing.
 */
export function scoreFacadeAlignment(graph: LayoutGraph, bubble: BubbleGraph): number {
    const spaces = graph.nodes.filter(n => n.kind === 'Space');
    if (spaces.length === 0) return 0;
    // Identify habitable spaces (the rooms that BENEFIT from a high-value
    // façade frontage). Matches the `daylight` axis filter — keeps the two
    // L1-α axes consistent.
    const habitable = spaces.filter(n => n.attrs.needsWindow === true);
    if (habitable.length === 0) return 0;

    // Map: external-wall GUID → its baseLine (start, end).
    const extWallBaseLine = new Map<string, readonly [Pt, Pt]>();
    for (const n of graph.nodes) {
        if (n.kind !== 'Wall') continue;
        if (n.attrs.isExternal !== true) continue;
        const bl = n.geometry?.baseLine;
        if (!bl || bl.length < 2) continue;
        extWallBaseLine.set(n.guid, bl as readonly [Pt, Pt]);
    }
    // No external walls in the graph → no façade-touching geometry possible.
    if (extWallBaseLine.size === 0) return 0;

    // Map: space GUID → list of external-wall baseLines that BOUND it.
    const spaceExtWalls = new Map<string, Array<readonly [Pt, Pt]>>();
    for (const e of graph.edges) {
        if (e.kind !== 'BOUNDS') continue;
        const bl = extWallBaseLine.get(e.from);
        if (!bl) continue;
        const list = spaceExtWalls.get(e.to) ?? [];
        list.push(bl);
        spaceExtWalls.set(e.to, list);
    }

    const field = bubble.facadeField;

    // ── DEGRADED PATH (no per-edge field): binary fraction of habitable
    //    rooms touching the façade. Monotonic + bounded but ignores
    //    orientation / corner value. Matches the spec's "degraded scoring
    //    formula" edge case.
    if (!field || field.edges.length === 0) {
        let touchN = 0;
        for (const h of habitable) {
            if ((spaceExtWalls.get(h.guid) ?? []).length > 0) touchN++;
        }
        return clamp01(touchN / habitable.length);
    }

    // ── FULL PATH: weight each habitable wall length by the matched
    //    facade-edge `overallValue`. Match = the facade edge that contains
    //    the wall's midpoint (axis-aligned partitions sit ON a perimeter
    //    edge in the D-TGL pipeline, so the matching is straightforward).
    let weightedLen = 0;
    let totalLen = 0;
    for (const h of habitable) {
        const walls = spaceExtWalls.get(h.guid) ?? [];
        for (const [a, b] of walls) {
            const len = Math.hypot(b.x - a.x, b.z - a.z);
            if (len <= 0) continue;
            const value = matchFacadeValue(a, b, field.edges);
            weightedLen += len * value;
            totalLen += len;
        }
    }
    if (totalLen <= 0) return 0;
    return clamp01(weightedLen / totalLen);
}

/**
 * §L1-α-4 internal — match a wall baseLine to its shell-edge facade value.
 *
 * The D-TGL pipeline emits external walls as segments LYING ON one of the
 * shell-polygon edges (the perimeter is already decomposed). We pick the
 * facade edge that best CONTAINS the wall midpoint: project the midpoint
 * onto each edge's infinite line, score by perpendicular distance, then
 * pick the smallest. Returns the matched edge's `overallValue` (∈ [0, 1])
 * or 0 if no edge is meaningfully close (defensive — should not happen
 * when the wall really lies on the perimeter).
 */
function matchFacadeValue(
    a: Pt, b: Pt,
    edges: readonly { a: Pt; b: Pt; overallValue: number }[],
): number {
    const mx = (a.x + b.x) / 2;
    const mz = (a.z + b.z) / 2;
    const MAX_PERP_M = 0.5;     // generous tolerance — wall lies on the edge in practice
    let best = -1;
    let bestDist = Infinity;
    for (let i = 0; i < edges.length; i++) {
        const e = edges[i]!;
        const ex = e.b.x - e.a.x;
        const ez = e.b.z - e.a.z;
        const len2 = ex * ex + ez * ez;
        if (len2 <= 1e-9) continue;
        // Project midpoint onto the edge's infinite line.
        const t = ((mx - e.a.x) * ex + (mz - e.a.z) * ez) / len2;
        // Perpendicular distance from midpoint to that line.
        const projX = e.a.x + t * ex;
        const projZ = e.a.z + t * ez;
        const perp = Math.hypot(mx - projX, mz - projZ);
        // Penalise projections off the edge segment (t outside [0, 1])
        // by adding their overshoot to the distance score.
        const overshoot = t < 0 ? -t * Math.sqrt(len2)
                        : t > 1 ?  (t - 1) * Math.sqrt(len2)
                        : 0;
        const score = perp + overshoot;
        if (score < bestDist) {
            bestDist = score;
            best = i;
        }
    }
    if (best < 0 || bestDist > MAX_PERP_M) return 0;
    return clamp01(edges[best]!.overallValue);
}

const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);
