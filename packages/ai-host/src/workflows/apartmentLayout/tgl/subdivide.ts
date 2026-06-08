// TGL P3b — subdivision: rooms → footprints.
//
// Packs the bubble-graph rooms into the shell's decomposition rects (P1) and
// squarifies (P3a) each rect's share, so every room gets exactly one axis-aligned
// footprint that lies inside the real shell — never a thin full-depth strip and
// never floating through an L-shape notch.
//
// Allocation is deterministic and public-first: rects are taken largest-first and
// rooms are streamed in bubble-graph order (hall/living/kitchen → corridor →
// private), so public space lands in the biggest rect near the entrance and the
// private zone flows into the smaller rects. squarify scales each rect's room set
// to fill that rect EXACTLY, so the footprints tile the shell (total area ≈ shell
// area) with no gaps or overlaps. Pure: imports only sibling TGL types.
//
// §SINGLE-RECT-CARVE (2026-05-28, architect feedback) — when the shell is a
// single rectangle AND the program has a corridor + ≥1 private room, the
// shell is PRE-CARVED into [public-zone | corridor strip 1.2 m | private-zone]
// before squarify runs. The corridor is forced to its real-architectural shape
// (a 1.0–1.4 m wide strip running the long axis of the shell) and every
// private room ends up sharing a wall with it. PLUS, when the program also
// has a master + ensuite, the ensuite is CARVED FROM INSIDE the master's
// squarified rect after subdivision, so the master/ensuite door (the only
// permitted access to the ensuite) ALWAYS lands on a real shared wall.
//
// Coordinates: metres, plan frame { x, z }. Rounded to 1e-6 at the boundary (§6).

import type { BubbleGraph, ProgramRoom } from './bubbleGraph.js';
import type { RoomType } from '../types.js';
import { rectArea, type Rect } from './rectDecomposition.js';
import { squarify } from './squarify.js';
import { roomRule } from '../rules/programRules.js';

/** A room's realised footprint inside the shell. */
export interface RoomPlacement {
    readonly roomId: string;
    readonly rect: Rect;
}

/**
 * §FEASIBILITY-ALLOC (A.21.D5, 2026-06-06) — a room the subdivider could NOT
 * place at or above its per-type minimum short side, even after the area-
 * rebalance retry stole slack from over-allocated neighbours. Surfaced
 * structurally so the engine NEVER silently drops a requested room — the
 * trigger/modal can report "you asked for N bedrooms, M fit on this plot".
 */
export interface DroppedRoom {
    readonly roomId: string;
    readonly type: RoomType;
    /** The short side (m) the room WOULD have had at its squarified rect. */
    readonly shortSideM: number;
    /** The per-type architectural floor (m) it failed to clear. */
    readonly minShortSideM: number;
}

/** §FEASIBILITY-ALLOC — subdivide result with the structured drop report. */
export interface SubdivideResult {
    readonly placements: readonly RoomPlacement[];
    /** Rooms that could not be placed at their min short side (empty in the
     *  common case). Deterministic — in drop order (lowest priority first). */
    readonly droppedRooms: readonly DroppedRoom[];
}

/**
 * §L4-δ-1b — CONSTRUCTIVE AlignmentField pre-subdivide axis-line snap.
 *
 * Opt-in (default ON) post-pass that runs after the squarified subdivision
 * converges. Collects every room-rect edge on each axis, clusters edges that
 * are within ALIGNMENT_SNAP_EPS_M of one another, and snaps every member of a
 * cluster to the cluster's MEAN coord. The result: layouts ARRIVE pre-aligned
 * (room edges share axis lines by construction) instead of being scored by the
 * existing SCORING-form `alignmentField` axis after the fact.
 *
 * The 50 mm tolerance mirrors `objectives.ts`'s alignmentField bucket width
 * so a layout that passes the snap is guaranteed to maximise the scoring axis.
 *
 * Pure — no I/O, no THREE, no DOM. Metres throughout.
 */
export interface SubdivideOptions {
    /** Default true. Set false to preserve raw squarified output (scoring-form
     *  alignmentField will then evaluate the un-snapped layout, as before). */
    readonly alignmentSnap?: boolean;
    /** A.25.3 — corridor strip clear-width (metres) for the §SINGLE-RECT-CARVE
     *  flow. Absent ⇒ the built-in `CORRIDOR_STRIP_WIDTH_M` (1.2 m). The
     *  accessibility slider raises it (wider, step-free corridors). Clamped to a
     *  sane band. Neutral 1.2 m is byte-identical to the legacy carve. */
    readonly corridorWidthM?: number;
    /**
     * §STAIR-OBSTACLE-CARVE (2026-06-08) — set true by `enumerate.ts` when the rect
     * set is the result of carving a stair-core keep-out out of the plate (a multi-
     * storey HOUSE). A keep-out turns the single plate into a FRAME / L of 2–4 sub-
     * rects, which the generic multi-rect path packs INDEPENDENTLY per rect — so no
     * corridor spine links the rooms across the hole and the plan ships as a merged
     * blob with a §CIRCULATION-REROUTE compromise (the founder's central-stair
     * defect). When this flag is set AND one sub-rect dominates the plate, the
     * subdivider runs the §SINGLE-RECT corridor carve on that DOMINANT rect with the
     * whole programme, so a real corridor encloses + links every room and the tiny
     * stair-clearance slivers are left empty (correct — they ARE the landing zone).
     * Absent / false ⇒ the generic multi-rect path (apartment + L/U/T shells
     * unchanged). */
    readonly stairCarved?: boolean;
}

/** Axis-line snap tolerance (m). Matches the EPS_M used by the SCORING
 *  alignmentField axis in `objectives.ts` so the constructive form lands every
 *  edge inside a scoring bucket. */
const ALIGNMENT_SNAP_EPS_M = 0.05;

const EPS = 1e-6;
const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;
const roundRect = (r: Rect): Rect => ({ x0: round6(r.x0), z0: round6(r.z0), x1: round6(r.x1), z1: round6(r.z1) });

/** Largest-first, with a stable tie-break by position (no Map/Set order — §6). */
function byAreaDesc(a: Rect, b: Rect): number {
    return rectArea(b) - rectArea(a) || a.x0 - b.x0 || a.z0 - b.z0;
}

/** §HARD-MIN-SIDE-PER-ROOM (2026-05-28, updated): no D-TGL room may be created
 *  with a SHORT-SIDE smaller than its own architectural minimum
 *  (`minShortSideM` in programRules.ts — e.g. kitchen-galley 1.8 m, corridor
 *  1.0 m, bedroom 2.6 m). The previous uniform 2 m floor was too aggressive
 *  for narrow service rooms — it dropped the kitchen entirely when the
 *  squarified rect came in just under 2 m, and made a real-corridor strip
 *  (1.0–1.4 m × longer) impossible. Rooms below their own floor are dropped
 *  (their bubble-graph node remains but has no rect — downstream walls/doors
 *  skip cleanly via `sharedWallByPair.get(...)` returning undefined). */

const ABSOLUTE_MIN_SHORT_SIDE_M = 0.9;  // sanity floor: a room narrower than this is unusable.

/** §SINGLE-RECT-CARVE: the corridor strip's width when carved as a dedicated
 *  zone. 1.2 m sits in the centre of the architect-mandated 1.0–1.4 m range
 *  (corridor.minShortSideM = 1.0 m; UK HQI recommends 1.2 m). */
const CORRIDOR_STRIP_WIDTH_M = 1.2;

/** §MASTER-SURPLUS (2026-06-08, layout-quality fix-pass F3) — the master bedroom
 *  must read as visibly larger than every other bedroom. The squarifier biases the
 *  master via its 1.3 areaWeight, but the §AREA-FRACTIONS clamps (master ≤ 20 %,
 *  bedroom ≤ 16 %) let a master come out the SAME size as a secondary bedroom on a
 *  small plate (the founder's "master is no bigger than the spare room" defect). This
 *  is the minimum AREA (m²) the master must exceed the largest non-master bedroom by.
 *  Enforced by transferring area target from the largest bedroom to the master before
 *  squarify (donor = lowest-priority bedroom, beneficiary = master — never a drop). */
const MIN_MASTER_SURPLUS_M2 = 2.0;

function shortSideM(r: Rect): number {
    return Math.min(r.x1 - r.x0, r.z1 - r.z0);
}

/** Per-type architectural short-side floor (m), clamped to the absolute floor. */
function floorFor(type: RoomType): number {
    return Math.max(ABSOLUTE_MIN_SHORT_SIDE_M, roomRule(type).minShortSideM || ABSOLUTE_MIN_SHORT_SIDE_M);
}

/** §FEASIBILITY-ALLOC — the area below which a room's own architectural minimum
 *  area floor must not fall. Used by the rebalance pass as the lower bound when
 *  stealing slack from an over-allocated neighbour. */
function minAreaFor(type: RoomType): number {
    const rule = roomRule(type);
    // The room must at minimum afford a square at its short-side floor; also
    // respect its declared minAreaM2. Never below the absolute square.
    const floor = floorFor(type);
    return Math.max(rule.minAreaM2 || 0, floor * floor);
}

/**
 * §FEASIBILITY-FIRST (A.21.D36, 2026-06-07) — drop-priority RANK for a room type.
 * When the SUM of every room's minimum area genuinely exceeds the rect (real
 * over-program), the LOWEST-priority room is dropped first. Lower rank = dropped
 * SOONER; higher rank = protected. We never drop a bathroom/bedroom before a
 * lower-value service/secondary room.
 *
 * The order encodes architectural importance (founder rule: "drop the lowest-
 * priority room, NOT a bathroom"):
 *   living / kitchen / master / bathroom  — core programme, protected (high rank)
 *   bedroom                               — habitable, protected
 *   corridor / hall                       — circulation (cut only with the
 *                                           private rooms it serves)
 *   dining / study                        — desirable but optional
 *   ensuite / wc / utility                — the first to go on a tight plate
 *
 * Pure data lookup — deterministic. */
const DROP_PRIORITY_RANK: Readonly<Record<RoomType, number>> = {
    living: 100,
    kitchen: 95,
    master: 90,
    bathroom: 85,
    bedroom: 80,
    corridor: 70,
    hall: 65,
    dining: 50,
    study: 45,
    ensuite: 30,
    wc: 25,
    utility: 20,
};
function dropRankFor(type: RoomType): number {
    return DROP_PRIORITY_RANK[type] ?? 40;
}

/**
 * §FEASIBILITY-ALLOC (A.21.D5, 2026-06-06) — squarify a room set into one rect →
 * footprints (rounded). The previous behaviour DROPPED the lowest-priority room
 * the instant any placement came in below its per-type short-side floor — which
 * silently lost a USER-REQUESTED bedroom on a tight plot. The new behaviour is
 * feasibility-aware:
 *
 *   1. Squarify the current pool at proportional area targets.
 *   2. If every placement clears its floor → done.
 *   3. Otherwise REBALANCE: grow each too-narrow room's area target (so the
 *      squarifier gives it a wider cell) by stealing slack from rooms that sit
 *      ABOVE their own minimum area, then re-squarify. This honours the
 *      requested room COUNT by shrinking over-allocated rooms instead of
 *      dropping anyone. Bounded iterations (no RNG — deterministic).
 *   4. Only when rebalancing genuinely cannot make a room fit (the rect can't
 *      hold every room at its minimum) do we drop the LOWEST-PRIORITY room (the
 *      last entry — allocationOrder is public-first/private-last) and record it
 *      in `droppedRooms` so the caller can REPORT it. Never a silent drop.
 *
 * Empty `rooms[]` → empty result.
 */
function placeInRectReported(rect: Rect, rooms: readonly ProgramRoom[]): SubdivideResult {
    const rectArea_ = Math.max(EPS, rectArea(rect));
    const droppedRooms: DroppedRoom[] = [];

    const squarifyPool = (
        cur: ReadonlyArray<{ room: ProgramRoom; area: number }>,
    ): { placements: RoomPlacement[]; byId: Map<string, RoomPlacement> } => {
        const placements = squarify(rect, cur.map(e => ({ id: e.room.id, area: e.area })))
            .map(p => ({ roomId: p.id, rect: roundRect(p.rect) }));
        return { placements, byId: new Map(placements.map(p => [p.roomId, p])) };
    };

    /**
     * §FEASIBILITY-FIRST (A.21.D36) — try to place EVERY room in `current` at or
     * above its per-type minimum short side by re-allocating area (no drop). The
     * area allocation is seeded so each room gets AT LEAST its minimum area and
     * the leftover (`rectArea − Σ minArea`) is distributed proportionally to the
     * rooms' original targets. Then a bounded rebalance loop grows any room whose
     * squarified CELL still comes in under its floor — financed by shrinking
     * rooms that sit above their own minimum. Returns the placement set when ALL
     * rooms clear their floor, or `null` when the rebalance cannot make them fit
     * (the caller then drops the lowest-priority room and retries).
     */
    const runRebalance = (
        seed: ReadonlyArray<{ room: ProgramRoom; area: number }>,
        current: readonly ProgramRoom[],
    ): { placements: RoomPlacement[]; byId: Map<string, RoomPlacement> } | null => {
        const pool = seed.map(e => ({ room: e.room, area: e.area }));
        const MAX_REBALANCE = current.length * 3 + 4;       // deterministic upper bound
        let placements: RoomPlacement[] = [];
        let byId = new Map<string, RoomPlacement>();
        for (let iter = 0; iter <= MAX_REBALANCE; iter++) {
            ({ placements, byId } = squarifyPool(pool));
            const needers = pool.filter(e => {
                const p = byId.get(e.room.id);
                return p && shortSideM(p.rect) < floorFor(e.room.type) - EPS;
            });
            if (needers.length === 0) return { placements, byId };   // all clear → done
            if (iter === MAX_REBALANCE) return null;                  // can't fit → drop

            // Required extra area for a needer so its scaled cell clears its
            // floor short side. A square (floor²) UNDER-estimates the area when
            // the rect is shallow: squarify may lay the room as a full-depth
            // strip whose depth = the rect's SHORT dimension, so a floor² square
            // still comes out too thin. Target instead the area of a cell that is
            // `floor` wide × the rect's short dimension deep — the worst-case
            // strip orientation — so the room clears its floor however squarify
            // slices it. The squarifier scales area→rect by the rect/pool ratio,
            // so convert that scaled target back to pool units.
            const poolAreaSum = pool.reduce((s, e) => s + e.area, 0) || EPS;
            const scale = rectArea_ / poolAreaSum;
            const rectShortDim = Math.min(rect.x1 - rect.x0, rect.z1 - rect.z0);
            let deficitTotal = 0;
            const wantById = new Map<string, number>();
            for (const e of needers) {
                const f = floorFor(e.room.type);
                // floor × min(rectShortDim, larger-of-floor-and-current-depth): a
                // strip `f` wide spanning the rect's short axis clears `f`. Clamp
                // the depth to ≥ f so we never ask for LESS than the square.
                const depth = Math.max(f, rectShortDim);
                const wantScaled = f * depth;                        // m² in the rect
                const wantUnscaled = wantScaled / scale;             // pool units
                const extra = Math.max(0, wantUnscaled - e.area);
                if (extra > EPS) { wantById.set(e.room.id, extra); deficitTotal += extra; }
            }
            if (deficitTotal <= EPS) return null;                    // nothing actionable

            // Donors: rooms above their own min area (in pool units).
            const donors = pool
                .filter(e => !wantById.has(e.room.id))
                .map(e => {
                    const minA = minAreaFor(e.room.type) / scale;
                    return { e, surplus: Math.max(0, e.area - minA) };
                })
                .filter(d => d.surplus > EPS);
            const surplusTotal = donors.reduce((s, d) => s + d.surplus, 0);
            if (surplusTotal <= EPS) return null;                    // no slack → drop

            const take = Math.min(deficitTotal, surplusTotal);
            for (const d of donors) d.e.area -= take * (d.surplus / surplusTotal);
            for (const e of needers) {
                const extra = wantById.get(e.room.id) ?? 0;
                if (extra > EPS) e.area += take * (extra / deficitTotal);
            }
        }
        return null;
    };

    /**
     * §FEASIBILITY-FIRST (A.21.D36) — try to place EVERY room at or above its
     * per-type minimum short side by re-allocating area (no drop). Returns the
     * placement set when all rooms clear their floor, or null when no seeding +
     * rebalance can make them fit (caller drops the lowest-priority room).
     *
     * Two deterministic seedings are tried in order, taking the first that fully
     * fits:
     *   1. PROPORTIONAL — each room's bubble-graph target area. This is the
     *      original allocation; on a comfortable plot it both fits AND gives the
     *      best squarify geometry, so the no-drop common case is preserved
     *      bit-for-bit.
     *   2. MIN-FIRST — each room seeded at its minimum area plus a proportional
     *      share of the rect's leftover. This min-respecting start lets a small-
     *      SHARE room keep its floor on a tight plate the proportional split would
     *      have starved — the founder's "stop dropping rooms" case.
     * The rebalance loop runs on each seeding; only when BOTH fail to fit every
     * room does the caller treat it as genuine over-program and drop.
     */
    const tryFitAll = (
        current: readonly ProgramRoom[],
    ): { placements: RoomPlacement[]; byId: Map<string, RoomPlacement> } | null => {
        const proportional = current.map(r => ({ room: r, area: Math.max(EPS, r.targetAreaM2) }));
        const fitProp = runRebalance(proportional, current);
        if (fitProp) return fitProp;

        const minTotal = current.reduce((s, r) => s + minAreaFor(r.type), 0);
        const targetTotal = current.reduce((s, r) => s + Math.max(EPS, r.targetAreaM2), 0) || EPS;
        const leftover = Math.max(0, rectArea_ - minTotal);
        const minFirst = current.map(r => ({
            room: r,
            area: minAreaFor(r.type) + leftover * (Math.max(EPS, r.targetAreaM2) / targetTotal),
        }));
        return runRebalance(minFirst, current);
    };

    // ── Feasibility-first allocation loop. Drop ONLY as a last resort. ────────
    // Working set in allocation order (public-first / private-last). On each
    // pass we try to fit EVERY remaining room; if we can't, we drop the single
    // lowest-priority room (by drop-rank, then allocation order as a tie-break)
    // and retry — so a normal plot keeps its full programme and only a genuine
    // over-program loses the least-important room (never a bathroom/bedroom
    // before a wc/utility/ensuite).
    let working = rooms.slice();
    while (working.length > 0) {
        const fit = tryFitAll(working);
        if (fit) return { placements: fit.placements, droppedRooms };

        // Could not fit every room at its minimum — REAL over-program for this
        // rect. Drop the lowest-priority room: lowest drop-rank wins, ties broken
        // by LATER allocation order (private-last) so the choice is deterministic.
        let dropIdx = 0;
        for (let i = 1; i < working.length; i++) {
            const a = working[i]!, b = working[dropIdx]!;
            const ra = dropRankFor(a.type), rb = dropRankFor(b.type);
            if (ra < rb || (ra === rb && i > dropIdx)) dropIdx = i;
        }
        const dropped = working[dropIdx]!;
        droppedRooms.push({
            roomId: dropped.id,
            type: dropped.type,
            shortSideM: 0,
            minShortSideM: floorFor(dropped.type),
        });
        const minTotal = working.reduce((s, r) => s + minAreaFor(r.type), 0);
        console.warn(
            `[D-TGL subdivide] §FEASIBILITY-ALLOC: rect area ${rectArea_.toFixed(2)} m² ` +
            `< Σ per-type minimum areas ${minTotal.toFixed(2)} m² for ${working.length} room(s) — ` +
            `genuine over-program. Dropping the LOWEST-PRIORITY room "${dropped.id}" ` +
            `(${dropped.type}, drop-rank ${dropRankFor(dropped.type)}) and re-fitting the rest ` +
            `(reported via droppedRooms — NOT silent; never a bathroom/bedroom before a ` +
            `lower-priority service room).`,
        );
        working = working.filter((_, i) => i !== dropIdx);
    }
    return { placements: [], droppedRooms };
}

/**
 * Reorder rooms for rect allocation so the **two largest rooms** (Living + Master)
 * land at the front and get the best aspect from squarify, then other public rooms
 * before the private ones. Without hoisting Master the squarifier leaves it a thin
 * leftover strip when there are many small rooms — the user's "Master Bedroom is a
 * corridor-shape strip" defect. Within each privacy class the input order is
 * preserved (stable), so the P8 enumerate `rev` strategy still produces secondary
 * variety. Privacy is read from the rules database (SPEC-ARCHITECTURAL-PROGRAM-RULES).
 */
function allocationOrder(rooms: readonly ProgramRoom[]): ProgramRoom[] {
    const living = rooms.find(r => r.type === 'living');
    const master = rooms.find(r => r.type === 'master');
    const hoisted = [living, master].filter((r): r is ProgramRoom => r !== undefined);
    const hoistedSet = new Set(hoisted);
    const rest = rooms.filter(r => !hoistedSet.has(r));
    const rank = (r: ProgramRoom): number => {
        const p = roomRule(r.type).privacy;
        return p === 'public' ? 0 : p === 'circulation' ? 1 : p === 'private' ? 2 : 3;
    };
    // Stable sort by privacy rank.
    const tagged = rest.map((r, i) => ({ r, i }));
    tagged.sort((a, b) => rank(a.r) - rank(b.r) || a.i - b.i);
    const sorted = tagged.map(t => t.r);
    return [...hoisted, ...sorted];
}

// ── §SINGLE-RECT-CARVE: corridor strip + ensuite-from-master ─────────────────

interface CorridorCarve {
    readonly publicRect: Rect;
    readonly corridorRect: Rect;
    readonly privateRect: Rect;
}

/** Slice the shell into [public | 1.2 m corridor | private] along its LONGER
 *  axis. The corridor runs the full length of that axis so every private room
 *  can share a wall with it. Returns null when the short axis is too narrow
 *  for the strip + two usable zones either side (≥ 2 m each). */
function tryCarveCorridor(
    shell: Rect,
    publicAreaTarget: number,
    privateAreaTarget: number,
    // A.25.3 — corridor strip width (m). Defaults to the architect-mandated 1.2 m
    // so an absent/neutral accessibility slider is byte-identical to the legacy carve.
    corridorWidthM: number = CORRIDOR_STRIP_WIDTH_M,
): CorridorCarve | null {
    const W = shell.x1 - shell.x0;
    const H = shell.z1 - shell.z0;
    const orientation: 'horizontal' | 'vertical' = W >= H ? 'horizontal' : 'vertical';
    const shortDim = orientation === 'horizontal' ? H : W;
    const MIN_ZONE_DEPTH = 2.0;
    if (shortDim < corridorWidthM + 2 * MIN_ZONE_DEPTH - EPS) return null;

    const usable = shortDim - corridorWidthM;
    const denom = Math.max(EPS, publicAreaTarget + privateAreaTarget);
    let publicDepth = usable * (publicAreaTarget / denom);
    // Clamp so both zones keep a usable depth.
    publicDepth = Math.min(Math.max(publicDepth, MIN_ZONE_DEPTH), usable - MIN_ZONE_DEPTH);

    if (orientation === 'horizontal') {
        const zPubBottom = shell.z0 + publicDepth;
        const zCorBottom = zPubBottom + corridorWidthM;
        return {
            publicRect:   { x0: shell.x0, z0: shell.z0,    x1: shell.x1, z1: zPubBottom },
            corridorRect: { x0: shell.x0, z0: zPubBottom,  x1: shell.x1, z1: zCorBottom },
            privateRect:  { x0: shell.x0, z0: zCorBottom,  x1: shell.x1, z1: shell.z1 },
        };
    } else {
        const xPubRight = shell.x0 + publicDepth;
        const xCorRight = xPubRight + corridorWidthM;
        return {
            publicRect:   { x0: shell.x0,   z0: shell.z0, x1: xPubRight, z1: shell.z1 },
            corridorRect: { x0: xPubRight,  z0: shell.z0, x1: xCorRight, z1: shell.z1 },
            privateRect:  { x0: xCorRight,  z0: shell.z0, x1: shell.x1,  z1: shell.z1 },
        };
    }
}

/** Carve the ensuite out of the master's squarified rect along its LONGER
 *  axis so the master + ensuite share an interior wall (the only access to
 *  the ensuite, per programRules.ensuite.accessFrom = ['master']). Returns
 *  null when the master can't afford the carve and stay above its own
 *  minShortSideM — the caller then leaves the ensuite unplaced rather than
 *  emit a door-less room. */
function tryCarveEnsuiteFromMaster(
    masterRect: Rect,
    ensuiteAreaM2: number,
): { master: Rect; ensuite: Rect } | null {
    const W = masterRect.x1 - masterRect.x0;
    const H = masterRect.z1 - masterRect.z0;
    const ensuiteMin = roomRule('ensuite').minShortSideM;
    const masterMin  = roomRule('master').minShortSideM;

    /** Try a perpendicular cut. `longDim` is the master's axis we cut across;
     *  `shortDim` is the master's other axis (becomes both rooms' span on
     *  that axis after the cut). */
    const tryCut = (longDim: number, shortDim: number): number | null => {
        // Ensuite span on shortDim must clear ensuiteMin.
        if (shortDim < ensuiteMin - EPS) return null;
        // Ensuite span on longDim = max(its minShortSide, target_area / shortDim).
        const cut = Math.max(ensuiteMin, ensuiteAreaM2 / shortDim);
        // Master must keep ≥ masterMin on the cut axis after the slice.
        if (longDim - cut < masterMin - EPS) return null;
        return cut;
    };

    // Try cutting across the LONGER axis first (gives a wider master cross-section).
    if (W >= H) {
        const cutW = tryCut(W, H);
        if (cutW !== null) {
            const split = masterRect.x1 - cutW;
            return {
                master:  { x0: masterRect.x0, z0: masterRect.z0, x1: split,         z1: masterRect.z1 },
                ensuite: { x0: split,         z0: masterRect.z0, x1: masterRect.x1, z1: masterRect.z1 },
            };
        }
        const cutH = tryCut(H, W);
        if (cutH !== null) {
            const split = masterRect.z1 - cutH;
            return {
                master:  { x0: masterRect.x0, z0: masterRect.z0, x1: masterRect.x1, z1: split          },
                ensuite: { x0: masterRect.x0, z0: split,         x1: masterRect.x1, z1: masterRect.z1 },
            };
        }
    } else {
        const cutH = tryCut(H, W);
        if (cutH !== null) {
            const split = masterRect.z1 - cutH;
            return {
                master:  { x0: masterRect.x0, z0: masterRect.z0, x1: masterRect.x1, z1: split          },
                ensuite: { x0: masterRect.x0, z0: split,         x1: masterRect.x1, z1: masterRect.z1 },
            };
        }
        const cutW = tryCut(W, H);
        if (cutW !== null) {
            const split = masterRect.x1 - cutW;
            return {
                master:  { x0: masterRect.x0, z0: masterRect.z0, x1: split,         z1: masterRect.z1 },
                ensuite: { x0: split,         z0: masterRect.z0, x1: masterRect.x1, z1: masterRect.z1 },
            };
        }
    }
    return null;
}

/**
 * §MASTER-SURPLUS (2026-06-08, F3) — ensure the master's effective (post-ensuite-carve)
 * area exceeds every non-master bedroom by ≥ `MIN_MASTER_SURPLUS_M2`. Deterministic and
 * NO-DROP: it transfers area TARGET from the LARGEST non-master bedroom (the binding
 * constraint; all bedrooms share a drop-rank so this is the lowest-priority donor by
 * allocation order) to the master, then re-squarifies the private rect. Bounded to 3
 * iterations. The donor is clamped to its own §FEASIBILITY minimum area, so a bedroom
 * never shrinks below its floor — the §FEASIBILITY-ALLOC no-drop guarantee holds. Squarify
 * scales targets to fill the rect; because a transfer preserves the target SUM the
 * scale factor is constant, so a Δ-target shift maps near-linearly to a Δ-area shift and
 * the bounded loop converges. `ensuiteReserveM2` is the area later carved from the master
 * for its en-suite (0 when none) — subtracted so the comparison uses the master's TRUE
 * final area. Pure + deterministic. When the master already leads, or the donor cannot
 * give without dropping below its floor, the input result is returned unchanged.
 */
function applyMasterSurplus(
    rect: Rect,
    ordered: readonly ProgramRoom[],
    result: SubdivideResult,
    masterId: string,
    ensuiteReserveM2: number,
): SubdivideResult {
    if (!ordered.some(r => r.type === 'bedroom') || !ordered.some(r => r.id === masterId)) return result;
    const rectA = Math.max(EPS, rectArea(rect));
    const sumTargets = ordered.reduce((s, r) => s + Math.max(EPS, r.targetAreaM2), 0) || EPS;
    const scale = rectA / sumTargets;     // target→final-area factor (sum is preserved across a transfer)

    let rooms = ordered.map(r => ({ ...r }));
    let cur = result;
    for (let iter = 0; iter < 3; iter++) {
        const byId = new Map(cur.placements.map(p => [p.roomId, p]));
        const mp = byId.get(masterId);
        if (!mp) return cur;
        const masterEff = rectArea(mp.rect) - Math.max(0, ensuiteReserveM2);
        let maxBedArea = -Infinity, maxBedId: string | null = null;
        for (const r of rooms) {
            if (r.type !== 'bedroom') continue;
            const p = byId.get(r.id);
            if (!p) continue;
            const a = rectArea(p.rect);
            if (a > maxBedArea) { maxBedArea = a; maxBedId = r.id; }
        }
        if (maxBedId === null) return cur;
        const deficit = (maxBedArea + MIN_MASTER_SURPLUS_M2) - masterEff;
        if (deficit <= EPS) return cur;                       // master already visibly larger → done
        const donor = rooms.find(r => r.id === maxBedId)!;
        const donorMinTarget = minAreaFor(donor.type) / scale;
        const give = Math.min(deficit / scale, Math.max(0, donor.targetAreaM2 - donorMinTarget));
        if (give <= EPS) return cur;                          // donor at its floor — never drop it below
        rooms = rooms.map(r =>
            r.id === donor.id ? { ...r, targetAreaM2: r.targetAreaM2 - give }
            : r.id === masterId ? { ...r, targetAreaM2: r.targetAreaM2 + give }
            : r);
        cur = placeInRectReported(rect, rooms);
    }
    return cur;
}

/** Single-rect carve flow: returns the placements (corridor + public + private,
 *  with ensuite carved from master) + the structured drop report. Returns null
 *  when the carve can't fit (caller falls back to the whole-shell squarify). */
function trySingleRectCarve(shell: Rect, graph: BubbleGraph, corridorWidthM?: number): SubdivideResult | null {
    const corridor = graph.rooms.find(r => r.type === 'corridor');
    const master   = graph.rooms.find(r => r.type === 'master');
    const ensuite  = graph.rooms.find(r => r.type === 'ensuite');

    // Bucket rooms by privacy class (excluding the corridor + ensuite, which
    // are handled specially below).
    const publicRooms: ProgramRoom[] = [];
    const privateRooms: ProgramRoom[] = [];
    for (const r of graph.rooms) {
        if (corridor && r.id === corridor.id) continue;
        if (ensuite && r.id === ensuite.id) continue;
        const p = roomRule(r.type).privacy;
        if (p === 'public' || p === 'circulation') publicRooms.push(r);
        else privateRooms.push(r);
    }
    // No corridor, or no private rooms ⇒ the carve is pointless; fall back to
    // the existing whole-shell squarify.
    if (!corridor || privateRooms.length === 0 || publicRooms.length === 0) return null;

    // Hoist ensuite's target area onto master so squarify gives master the
    // combined footprint — we'll slice the ensuite out of it after.
    let ensuiteCarveArea = 0;
    if (master && ensuite) {
        ensuiteCarveArea = ensuite.targetAreaM2;
        const masterIdx = privateRooms.findIndex(r => r.id === master.id);
        if (masterIdx >= 0) {
            privateRooms[masterIdx] = { ...master, targetAreaM2: master.targetAreaM2 + ensuite.targetAreaM2 };
        }
    }

    const publicAreaTarget  = publicRooms.reduce((s, r) => s + r.targetAreaM2, 0);
    const privateAreaTarget = privateRooms.reduce((s, r) => s + r.targetAreaM2, 0);
    const carve = tryCarveCorridor(shell, publicAreaTarget, privateAreaTarget, corridorWidthM);
    if (!carve) return null;

    const out: RoomPlacement[] = [];
    const droppedRooms: DroppedRoom[] = [];
    // Corridor IS the strip.
    out.push({ roomId: corridor.id, rect: roundRect(carve.corridorRect) });
    // Public + private rooms squarified into their own sub-rects.
    const pub = placeInRectReported(carve.publicRect, allocationOrder(publicRooms));
    out.push(...pub.placements);
    droppedRooms.push(...pub.droppedRooms);
    const orderedPrivate = allocationOrder(privateRooms);
    let priv = placeInRectReported(carve.privateRect, orderedPrivate);
    // §MASTER-SURPLUS (F3) — grow the master past every other bedroom by donating area
    // from the largest bedroom (deterministic, no-drop). `ensuiteCarveArea` is the area
    // later sliced from the master for its en-suite, so the surplus holds AFTER the carve.
    if (master) priv = applyMasterSurplus(carve.privateRect, orderedPrivate, priv, master.id, ensuiteCarveArea);
    const privatePlacements = [...priv.placements];
    droppedRooms.push(...priv.droppedRooms);

    // Carve ensuite from master's squarified rect.
    if (master && ensuite && ensuiteCarveArea > 0) {
        const masterIdx = privatePlacements.findIndex(p => p.roomId === master.id);
        if (masterIdx >= 0) {
            const masterP = privatePlacements[masterIdx]!;
            const ec = tryCarveEnsuiteFromMaster(masterP.rect, ensuiteCarveArea);
            if (ec) {
                privatePlacements[masterIdx] = { roomId: master.id, rect: roundRect(ec.master) };
                privatePlacements.push({ roomId: ensuite.id, rect: roundRect(ec.ensuite) });
            } else {
                console.warn(
                    `[D-TGL subdivide] §ENSUITE-FROM-MASTER: master rect too tight to carve ` +
                    `ensuite (${ensuiteCarveArea.toFixed(2)} m²) — ensuite left unplaced ` +
                    `(reported via droppedRooms — NOT silent).`,
                );
                droppedRooms.push({
                    roomId: ensuite.id,
                    type: ensuite.type,
                    shortSideM: 0,
                    minShortSideM: floorFor(ensuite.type),
                });
            }
        }
    }
    out.push(...privatePlacements);
    return { placements: out, droppedRooms };
}

// ── §L4-δ-1b: constructive AlignmentField pre-Pareto snap ────────────────────

/**
 * Cluster a list of 1-D coordinates so that any two coords within
 * `ALIGNMENT_SNAP_EPS_M` of each other land in the same cluster. Sort + sweep:
 * O(n log n). Returns an array of arrays of ORIGINAL coords (NOT indices) per
 * cluster, preserving the sort order — callers compute the mean to drive the
 * snap.
 */
function clusterCoords(coords: readonly number[]): number[][] {
    if (coords.length === 0) return [];
    const sorted = coords.slice().sort((a, b) => a - b);
    const clusters: number[][] = [];
    let current: number[] = [sorted[0]!];
    for (let i = 1; i < sorted.length; i++) {
        const v = sorted[i]!;
        // Compare against the LAST member of the current cluster — pairwise
        // proximity is sufficient because the input is sorted (transitivity
        // within the cluster's diameter is acceptable: the mean still lies
        // within ε of every member for the cluster sizes the subdivider
        // produces, and the SCORING axis uses the same neighbour-only test).
        if (v - current[current.length - 1]! <= ALIGNMENT_SNAP_EPS_M) {
            current.push(v);
        } else {
            clusters.push(current);
            current = [v];
        }
    }
    clusters.push(current);
    return clusters;
}

/**
 * Build a `coord → snapped coord` lookup for every coord in `coords`. Clusters
 * of ≤ 1 element are passed through unchanged (defensive: nothing to snap to).
 * Clusters of ≥ 2 elements are snapped to the cluster mean.
 */
function buildSnapMap(coords: readonly number[]): Map<number, number> {
    const map = new Map<number, number>();
    for (const cluster of clusterCoords(coords)) {
        if (cluster.length <= 1) {
            // Singleton: leave it alone.
            for (const c of cluster) map.set(c, c);
            continue;
        }
        const mean = cluster.reduce((s, c) => s + c, 0) / cluster.length;
        for (const c of cluster) map.set(c, round6(mean));
    }
    return map;
}

/**
 * Post-pass axis-line snap. Collects every placement rect's X-edges + Z-edges,
 * clusters each axis independently inside `ALIGNMENT_SNAP_EPS_M`, and snaps
 * each rect's edges to the cluster means.
 *
 * Defensive: any snap that would invert a rect (`left ≥ right` OR
 * `bottom ≥ top` post-snap) is dropped for THAT rect — the rect keeps its
 * original edges on the offending axis. This preserves the subdivider's
 * non-overlap + ≥-floor guarantees even when an edge cluster's mean lies
 * outside one of its members' opposite edge.
 */
export function snapAxisLines(placements: readonly RoomPlacement[]): RoomPlacement[] {
    if (placements.length < 2) return placements.slice();
    const xEdges: number[] = [];
    const zEdges: number[] = [];
    for (const p of placements) {
        xEdges.push(p.rect.x0, p.rect.x1);
        zEdges.push(p.rect.z0, p.rect.z1);
    }
    const xSnap = buildSnapMap(xEdges);
    const zSnap = buildSnapMap(zEdges);
    const out: RoomPlacement[] = [];
    for (const p of placements) {
        const x0n = xSnap.get(p.rect.x0) ?? p.rect.x0;
        const x1n = xSnap.get(p.rect.x1) ?? p.rect.x1;
        const z0n = zSnap.get(p.rect.z0) ?? p.rect.z0;
        const z1n = zSnap.get(p.rect.z1) ?? p.rect.z1;
        // Defensive: an inverted/degenerate snap on an axis means we keep that
        // axis's original edges. Apply per-axis so a bad X snap doesn't undo
        // a good Z snap (and vice versa).
        const xOk = x1n - x0n > EPS;
        const zOk = z1n - z0n > EPS;
        out.push({
            roomId: p.roomId,
            rect: roundRect({
                x0: xOk ? x0n : p.rect.x0,
                x1: xOk ? x1n : p.rect.x1,
                z0: zOk ? z0n : p.rect.z0,
                z1: zOk ? z1n : p.rect.z1,
            }),
        });
    }
    return out;
}

// ── §CORRIDOR-PHYSIOGNOMY (A.21.D46, 2026-06-08, re-done with the sealing fix) ──

/** Two rects SHARE A WALL (a common axis-aligned edge of non-zero extent) when
 *  they abut on one axis and OVERLAP on the other. This is the geometric
 *  precondition for `wallsAndDoors` to host a door between two rooms — so it is
 *  exactly the relation the sealing-safety check below must preserve. Pure. */
function rectsShareWall(a: Rect, b: Rect): boolean {
    // Vertical shared face: a.x1 ≈ b.x0 (or vice-versa) with z-overlap.
    const vAbut =
        (Math.abs(a.x1 - b.x0) < ALIGNMENT_SNAP_EPS_M || Math.abs(b.x1 - a.x0) < ALIGNMENT_SNAP_EPS_M);
    const zOverlap = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
    if (vAbut && zOverlap > ALIGNMENT_SNAP_EPS_M) return true;
    // Horizontal shared face: a.z1 ≈ b.z0 (or vice-versa) with x-overlap.
    const hAbut =
        (Math.abs(a.z1 - b.z0) < ALIGNMENT_SNAP_EPS_M || Math.abs(b.z1 - a.z0) < ALIGNMENT_SNAP_EPS_M);
    const xOverlap = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
    if (hAbut && xOverlap > ALIGNMENT_SNAP_EPS_M) return true;
    return false;
}

/** The set of room ids that share at least one wall with some OTHER placed room.
 *  A room NOT in this set is an island — `wallsAndDoors` can hand it no door, so
 *  it would be reported §SEALED. Used to validate that a corridor reshape never
 *  turns a previously-connected room into an island. Pure + deterministic. */
function roomsWithAnySharedWall(placements: readonly RoomPlacement[]): Set<string> {
    const connected = new Set<string>();
    for (let i = 0; i < placements.length; i++) {
        for (let j = i + 1; j < placements.length; j++) {
            if (rectsShareWall(placements[i]!.rect, placements[j]!.rect)) {
                connected.add(placements[i]!.roomId);
                connected.add(placements[j]!.roomId);
            }
        }
    }
    return connected;
}

/**
 * §CORRIDOR-PHYSIOGNOMY (A.21.D46, 2026-06-08) — reshape the corridor placement
 * into a NARROW STRIP whenever it came out wider than its rule's `maxShortSideM`.
 * The multi-rect / squarify paths can hand the corridor a NEAR-SQUARE cell (a fat
 * blob, e.g. 3 m × 3.5 m); the §SINGLE-RECT carve already builds a 1.2 m strip, so
 * this is a NO-OP there. The corridor's cell is narrowed along its SHORT axis to
 * `maxShortSideM`; the freed band is DONATED to the neighbour placement(s) that
 * fully TILE the freed region's long edge (so no gap appears and the slack goes to
 * a habitable room). When no neighbour set tiles it cleanly, the corridor keeps its
 * original cell (defensive — never a gap / overlap). Deterministic + pure.
 *
 * CRITICAL (the sealing fix that distinguishes this from the reverted 5b472cfb):
 * this ONLY ever narrows the SHORT axis and ONLY donates to neighbours that ALREADY
 * abut the freed band — it never SHORTENS the corridor's long axis (the reverted
 * attempt's `leftoverRect` length-trim stranded a served room). The caller
 * additionally VALIDATES the result against `roomsWithAnySharedWall` and discards
 * the reshape if it would seal any room, so §EVERY-ROOM-ACCESS is a HARD guarantee.
 *
 * `corridorId` is the corridor room's id (null ⇒ no corridor ⇒ identity).
 */
export function reshapeCorridorStrip(
    placements: readonly RoomPlacement[],
    corridorId: string | null,
): RoomPlacement[] {
    if (!corridorId) return placements.slice();
    const idx = placements.findIndex(p => p.roomId === corridorId);
    if (idx < 0) return placements.slice();
    const cor = placements[idx]!;
    const r = cor.rect;
    const w = r.x1 - r.x0;
    const h = r.z1 - r.z0;
    const maxShort = roomRule('corridor').maxShortSideM;
    if (maxShort === undefined) return placements.slice();
    const short = Math.min(w, h);
    if (short <= maxShort + EPS) return placements.slice();   // already a strip — no-op

    // Narrow the corridor along its SHORT axis to `maxShort`, freeing a band of
    // the rest of the cell. We try freeing toward EITHER side (strip flush to the
    // low edge → free the high band; OR flush to the high edge → free the low band)
    // and take the side whose neighbours can FULLY absorb the freed band with no
    // gap. The freed band is donated by extending each abutting neighbour's edge to
    // swallow its overlap span; the donation is accepted only when the union of
    // those overlaps covers the freed band's full long extent (no hole left).
    const along: 'x' | 'z' = w >= h ? 'x' : 'z';   // long axis of the corridor cell

    const tryNarrow = (flush: 'low' | 'high'): RoomPlacement[] | null => {
        let strip: Rect, freed: Rect;
        if (along === 'x') {
            // short axis is z.
            if (flush === 'low') {
                strip = { x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z0 + maxShort };
                freed = { x0: r.x0, z0: r.z0 + maxShort, x1: r.x1, z1: r.z1 };
            } else {
                strip = { x0: r.x0, z0: r.z1 - maxShort, x1: r.x1, z1: r.z1 };
                freed = { x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1 - maxShort };
            }
        } else {
            // short axis is x.
            if (flush === 'low') {
                strip = { x0: r.x0, z0: r.z0, x1: r.x0 + maxShort, z1: r.z1 };
                freed = { x0: r.x0 + maxShort, z0: r.z0, x1: r.x1, z1: r.z1 };
            } else {
                strip = { x0: r.x1 - maxShort, z0: r.z0, x1: r.x1, z1: r.z1 };
                freed = { x0: r.x0, z0: r.z0, x1: r.x1 - maxShort, z1: r.z1 };
            }
        }
        if (rectArea(freed) <= EPS) return null;

        // Each abutting neighbour extends its edge back across its overlap span.
        // We require the overlaps to TILE the freed band's long extent exactly
        // (sorted, contiguous, covering end-to-end).
        const overlaps: { i: number; lo: number; hi: number; grown: Rect }[] = [];
        const longLo = along === 'x' ? freed.x0 : freed.z0;
        const longHi = along === 'x' ? freed.x1 : freed.z1;
        for (let i = 0; i < placements.length; i++) {
            if (i === idx) continue;
            const n = placements[i]!.rect;
            let abuts = false;
            let grown: Rect = n;
            if (along === 'x') {
                const oLo = Math.max(n.x0, freed.x0), oHi = Math.min(n.x1, freed.x1);
                if (oHi - oLo <= EPS) continue;          // no long-extent overlap
                if (flush === 'low' && Math.abs(n.z0 - freed.z1) < ALIGNMENT_SNAP_EPS_M) {
                    abuts = true; grown = { ...n, z0: freed.z0 };
                } else if (flush === 'high' && Math.abs(n.z1 - freed.z0) < ALIGNMENT_SNAP_EPS_M) {
                    abuts = true; grown = { ...n, z1: freed.z1 };
                }
                if (abuts) overlaps.push({ i, lo: oLo, hi: oHi, grown });
            } else {
                const oLo = Math.max(n.z0, freed.z0), oHi = Math.min(n.z1, freed.z1);
                if (oHi - oLo <= EPS) continue;
                if (flush === 'low' && Math.abs(n.x0 - freed.x1) < ALIGNMENT_SNAP_EPS_M) {
                    abuts = true; grown = { ...n, x0: freed.x0 };
                } else if (flush === 'high' && Math.abs(n.x1 - freed.x0) < ALIGNMENT_SNAP_EPS_M) {
                    abuts = true; grown = { ...n, x1: freed.x1 };
                }
                if (abuts) overlaps.push({ i, lo: oLo, hi: oHi, grown });
            }
        }
        if (overlaps.length === 0) return null;
        overlaps.sort((a, b) => a.lo - b.lo);
        let cursor = longLo;
        for (const o of overlaps) {
            if (o.lo > cursor + ALIGNMENT_SNAP_EPS_M) return null;   // gap before this span
            cursor = Math.max(cursor, o.hi);
        }
        if (cursor < longHi - ALIGNMENT_SNAP_EPS_M) return null;     // uncovered tail

        const grownById = new Map(overlaps.map(o => [o.i, o.grown]));
        return placements.map((p, i) =>
            i === idx ? { roomId: cor.roomId, rect: roundRect(strip) }
            : grownById.has(i) ? { roomId: p.roomId, rect: roundRect(grownById.get(i)!) }
            : p,
        );
    };

    // Prefer freeing the band whose neighbours fully absorb it; try low then high
    // (deterministic). If NEITHER side tiles cleanly, keep the original cell.
    return tryNarrow('low') ?? tryNarrow('high') ?? placements.slice();
}

// ── §CORRIDOR-END-TRIM (A.21.D57, 2026-06-08) ────────────────────────────────

/**
 * §CORRIDOR-END-TRIM (A.21.D57) — a corridor only needs to SPAN from the entrance
 * to the LAST room-door it serves. The §SINGLE-RECT carve builds the corridor strip
 * running the FULL length of the shell's long axis (perimeter to perimeter), so when
 * the served rooms do not reach the far end the corridor OVERSHOOTS into a dead stub
 * against the perimeter wall — wasting the best wall (the exterior frontage) on
 * circulation instead of a habitable room. This pass TRIMS the corridor's LONG axis
 * back to the served-room extent (+ a small end clearance) and DONATES the freed
 * perimeter end-band to the adjacent habitable room that fully tiles it — extending
 * that room TO the perimeter so it gains exterior frontage (→ windows → daylight,
 * the founder's stated goal).
 *
 * CRITICAL (the sealing-safety doctrine, distinguishing this from the reverted
 * 5b472cfb): the required extent is the union of the shared-wall spans of the rooms
 * that DEPEND on the corridor for access — every private / service room (bedroom,
 * bathroom, ensuite, wc, study, master), PLUS the entrance/hall connection so the
 * spine still reaches the front door. A public room (living / kitchen / dining) that
 * abuts the corridor only PAST that extent has its own façade frontage and other
 * access, so its corridor stub may be reclaimed: the freed band is donated to it,
 * extending it to the corridor's far short-face (the EXTERIOR perimeter → windows).
 * The caller ADDITIONALLY runs the result through the `roomsWithAnySharedWall`
 * sealing-safety gate and DISCARDS the trim if it would strand ANY room (leave it
 * with no shared wall at all) — so §EVERY-ROOM-ACCESS is a HARD guarantee and a
 * corridor that genuinely must span the full shell is left UNCHANGED.
 *
 * `dependsOnCorridor` maps a room id → true when that room NEEDS the corridor (the
 * caller passes the private/service + entry set from the program rules). Absent ⇒
 * every neighbour is treated as corridor-dependent (the conservative identity-leaning
 * default — the union then equals the full abutter span and nothing is freed).
 *
 * Pure + deterministic. `corridorId` null ⇒ identity.
 */

export function trimCorridorToLastDoor(
    placements: readonly RoomPlacement[],
    corridorId: string | null,
    dependsOnCorridor?: ReadonlySet<string>,
): RoomPlacement[] {
    if (!corridorId) return placements.slice();
    const idx = placements.findIndex(p => p.roomId === corridorId);
    if (idx < 0) return placements.slice();
    const cor = placements[idx]!.rect;
    const w = cor.x1 - cor.x0;
    const h = cor.z1 - cor.z0;
    const along: 'x' | 'z' = w >= h ? 'x' : 'z';     // the corridor's LONG (spine) axis
    const corLo = along === 'x' ? cor.x0 : cor.z0;
    const corHi = along === 'x' ? cor.x1 : cor.z1;
    const corShort0 = along === 'x' ? cor.z0 : cor.x0;
    const corShort1 = along === 'x' ? cor.z1 : cor.x1;

    // Required span = the union of the shared-wall extents (on the corridor's long
    // axis) of the rooms that DEPEND on the corridor for access. A neighbour shares a
    // wall on one of the corridor's two LONG faces (a short-face abutment): it abuts
    // at corShort0 or corShort1 and overlaps the corridor on the long axis; its
    // overlap interval is exactly that shared wall. A corridor-dependent room must
    // stay inside the trimmed corridor; a non-dependent (public, own-façade) room may
    // be trimmed past + donated to.
    const dependent = (id: string): boolean => dependsOnCorridor ? dependsOnCorridor.has(id) : true;
    let needLo = Number.POSITIVE_INFINITY;
    let needHi = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < placements.length; i++) {
        if (i === idx) continue;
        if (!dependent(placements[i]!.roomId)) continue;
        const n = placements[i]!.rect;
        const nShort0 = along === 'x' ? n.z0 : n.x0;
        const nShort1 = along === 'x' ? n.z1 : n.x1;
        const abutsLongFace =
            Math.abs(nShort1 - corShort0) < ALIGNMENT_SNAP_EPS_M ||
            Math.abs(nShort0 - corShort1) < ALIGNMENT_SNAP_EPS_M;
        if (!abutsLongFace) continue;
        const nLong0 = along === 'x' ? n.x0 : n.z0;
        const nLong1 = along === 'x' ? n.x1 : n.z1;
        const oLo = Math.max(nLong0, corLo);
        const oHi = Math.min(nLong1, corHi);
        if (oHi - oLo <= ALIGNMENT_SNAP_EPS_M) continue;   // touches the end only — not a shared wall
        if (oLo < needLo) needLo = oLo;
        if (oHi > needHi) needHi = oHi;
    }
    if (!Number.isFinite(needLo) || !Number.isFinite(needHi)) return placements.slice();

    // Trim to EXACTLY the served extent at each end (the far edge of the first/last
    // dependent room), clamped to the original corridor span (never extend outward).
    // The trim point coincides with a real subdivision boundary so the freed band
    // aligns with the donee room's edge and the donation stays RECTANGULAR (no
    // L-shaped room). Any door reveal-clearance is a downstream door-placement
    // concern, not a room-rect concern. The trimmed corridor must still clear the
    // corridor's own minLongSideM floor (the spine must read as a real corridor).
    const trimmedLo = Math.max(corLo, needLo);
    const trimmedHi = Math.min(corHi, needHi);
    if (trimmedHi - trimmedLo <= EPS) return placements.slice();
    const minLong = roomRule('corridor').minLongSideM;
    if (minLong !== undefined && trimmedHi - trimmedLo < minLong - EPS) return placements.slice();

    // Nothing to free? (the dependent rooms already reach both ends) → identity.
    const freesLow = trimmedLo > corLo + ALIGNMENT_SNAP_EPS_M;
    const freesHigh = trimmedHi < corHi - ALIGNMENT_SNAP_EPS_M;
    if (!freesLow && !freesHigh) return placements.slice();

    const makeRect = (lo: number, hi: number): Rect =>
        along === 'x'
            ? { x0: lo, z0: corShort0, x1: hi, z1: corShort1 }
            : { x0: corShort0, z0: lo, x1: corShort1, z1: hi };

    // Donate ONE freed end-band to a single neighbour that abuts it (on either long
    // face) AND exactly matches its long extent — extending that neighbour across the
    // corridor's short width to swallow the band, so the room reaches the corridor's
    // far short-face (and, since the corridor strip runs perimeter-to-perimeter, the
    // EXTERIOR wall → frontage → windows). When BOTH a low-face and a high-face room
    // tile the band, the band has two abutters across the corridor width; we pick the
    // stable-LOWEST room id (deterministic). Returns the donee index + grown rect, or
    // null when no neighbour tiles the band cleanly (then we DON'T trim that end —
    // never leave a gap).
    const donateBand = (bandLo: number, bandHi: number): { donee: number; grown: Rect } | null => {
        type Cand = { i: number; grown: Rect; id: string };
        const cands: Cand[] = [];
        for (let i = 0; i < placements.length; i++) {
            if (i === idx) continue;
            const n = placements[i]!.rect;
            const nShort0 = along === 'x' ? n.z0 : n.x0;
            const nShort1 = along === 'x' ? n.z1 : n.x1;
            const nLong0 = along === 'x' ? n.x0 : n.z0;
            const nLong1 = along === 'x' ? n.x1 : n.z1;
            // Must EXACTLY match the band's long extent so the donation stays a clean
            // RECTANGLE — a wider room would become L-shaped if it absorbed only a
            // sub-range of the band.
            if (Math.abs(nLong0 - bandLo) > ALIGNMENT_SNAP_EPS_M ||
                Math.abs(nLong1 - bandHi) > ALIGNMENT_SNAP_EPS_M) continue;
            let grown: Rect | null = null;
            if (Math.abs(nShort1 - corShort0) < ALIGNMENT_SNAP_EPS_M) {
                // Neighbour sits on the LOW short-face → grow its high short-edge across the band.
                grown = along === 'x'
                    ? { x0: bandLo, z0: n.z0, x1: bandHi, z1: corShort1 }
                    : { x0: n.x0, z0: bandLo, x1: corShort1, z1: bandHi };
            } else if (Math.abs(nShort0 - corShort1) < ALIGNMENT_SNAP_EPS_M) {
                // Neighbour sits on the HIGH short-face → grow its low short-edge across the band.
                grown = along === 'x'
                    ? { x0: bandLo, z0: corShort0, x1: bandHi, z1: n.z1 }
                    : { x0: corShort0, z0: bandLo, x1: n.x1, z1: bandHi };
            }
            if (!grown) continue;
            cands.push({ i, grown, id: placements[i]!.roomId });
        }
        if (cands.length === 0) return null;
        cands.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));   // deterministic
        const c = cands[0]!;
        return { donee: c.i, grown: c.grown };
    };

    // Try trimming each freed end; only ACCEPT an end when its band is fully donated
    // (no gap). We mutate a working copy of the corridor span + a donations map.
    let lo = corLo, hi = corHi;
    const grownById = new Map<number, Rect>();
    if (freesLow) {
        const d = donateBand(corLo, trimmedLo);
        if (d) { grownById.set(d.donee, d.grown); lo = trimmedLo; }
    }
    if (freesHigh) {
        const d = donateBand(trimmedHi, corHi);
        // Don't let a second donation overwrite the same donee's first grown rect
        // (a single room tiling BOTH ends is degenerate — keep the low-end trim only).
        if (d && !grownById.has(d.donee)) { grownById.set(d.donee, d.grown); hi = trimmedHi; }
    }
    if (lo === corLo && hi === corHi) return placements.slice();   // nothing donated → no trim

    return placements.map((p, i) =>
        i === idx ? { roomId: p.roomId, rect: roundRect(makeRect(lo, hi)) }
        : grownById.has(i) ? { roomId: p.roomId, rect: roundRect(grownById.get(i)!) }
        : p,
    );
}

/**
 * §FEASIBILITY-ALLOC (A.21.D5, 2026-06-06) — subdivide the shell `rects` among
 * the program rooms AND report any room that could not be placed at its per-type
 * minimum short side. Returns one footprint per PLACED room (footprints lie
 * inside the shell rects, do not overlap, and tile the shell) plus a structured
 * `droppedRooms` list (empty in the common case). The drop list is how the
 * engine HONOURS the requested room count when feasible and REPORTS the shortfall
 * when it genuinely is not — never a silent loss.
 *
 * §L4-δ-1b — by default the output is run through `snapAxisLines` so room-rect
 * edges within 50 mm of each other are snapped to the shared mean.
 */
export function subdivideWithReport(
    rects: readonly Rect[],
    graph: BubbleGraph,
    options: SubdivideOptions = {},
): SubdivideResult {
    const alignmentSnap = options.alignmentSnap ?? true;
    // A.25.3 — corridor strip width override (accessibility slider). Clamp to a
    // sane band; absent ⇒ undefined ⇒ the carve uses its built-in 1.2 m default
    // (byte-identical to the legacy behaviour).
    const corridorWidthM = typeof options.corridorWidthM === 'number' && Number.isFinite(options.corridorWidthM)
        ? Math.max(1.0, Math.min(2.0, options.corridorWidthM))
        : undefined;
    const valid = rects.filter(r => rectArea(r) > EPS).sort(byAreaDesc);
    if (valid.length === 0 || graph.rooms.length === 0) return { placements: [], droppedRooms: [] };

    const finalise = (res: SubdivideResult): SubdivideResult => {
        // §CORRIDOR-PHYSIOGNOMY (A.21.D46, 2026-06-08, re-done with the sealing fix)
        // — narrow a fat (near-square, squarified) corridor cell into a strip BEFORE
        // the alignment snap. No-op when the carve already produced a strip (short
        // side ≤ maxShortSideM) — idempotent. The §SINGLE-RECT carve corridor is
        // already a 1.2 m strip, so this only ever fires on the multi-rect / squarify
        // paths.
        //
        // SEALING-SAFETY GATE (the fix that distinguishes this re-do from the
        // reverted 5b472cfb): the reverted attempt narrowed/shortened the corridor
        // and donated a freed band, which could strip a room of its only shared wall
        // with circulation → §EVERY-ROOM-ACCESS flagged it SEALED (the dining room in
        // doorMinimums.test.ts). Here we ACCEPT the reshape ONLY when it does not turn
        // any previously-wall-connected room into an island; otherwise we keep the
        // unreshaped placements. Physiognomy is best-effort; never seals a room.
        const reshaped = reshapeCorridorStrip(res.placements, graph.corridorId);
        const before = roomsWithAnySharedWall(res.placements);
        const after = roomsWithAnySharedWall(reshaped);
        const sealsARoom = [...before].some(id => !after.has(id));
        const physiognomised = sealsARoom ? res.placements : reshaped;

        // §CORRIDOR-END-TRIM (A.21.D57, 2026-06-08) — trim the corridor's LONG axis
        // back to the LAST served (corridor-dependent) room and donate the freed
        // perimeter end-band to the adjacent habitable room (→ exterior frontage →
        // daylight). Runs AFTER the physiognomy reshape so it operates on the final
        // strip. The dependent set = every private/service/circulation room (those
        // that NEED the corridor for access); public rooms (living/kitchen/dining,
        // which have their own façade frontage) are reclaimable past the last
        // dependent room. Gated by the SAME `roomsWithAnySharedWall` sealing-safety
        // check (the D46-redo doctrine): a trim that would strand any previously-
        // connected room is DISCARDED, so a corridor that must span the full shell is
        // left unchanged and §EVERY-ROOM-ACCESS stays a HARD guarantee.
        const dependsOnCorridor = new Set(
            graph.rooms
                .filter(r => {
                    const p = roomRule(r.type).privacy;
                    return p === 'private' || p === 'service' || p === 'circulation';
                })
                .map(r => r.id),
        );
        const trimmed = trimCorridorToLastDoor(physiognomised, graph.corridorId, dependsOnCorridor);
        const afterTrim = roomsWithAnySharedWall(trimmed);
        const trimSealsARoom = [...roomsWithAnySharedWall(physiognomised)].some(id => !afterTrim.has(id));
        const chosen = trimSealsARoom ? physiognomised : trimmed;

        return {
            placements: alignmentSnap ? snapAxisLines(chosen) : chosen.slice(),
            droppedRooms: res.droppedRooms,
        };
    };

    // §SINGLE-RECT-CARVE — single-rect shell with corridor + private rooms.
    if (valid.length === 1) {
        const carved = trySingleRectCarve(valid[0]!, graph, corridorWidthM);
        if (carved !== null) return finalise(carved);
    }

    // §STAIR-OBSTACLE-CARVE (2026-06-08) — a stair keep-out fractured the plate into
    // a frame/L of sub-rects (multi-storey house). The generic multi-rect path below
    // would pack each sub-rect independently → no corridor spine → merged blob +
    // §CIRCULATION-REROUTE (the founder's central-stair defect). Instead, when one
    // sub-rect DOMINATES the plate, carve the corridor in that dominant rect with the
    // WHOLE programme so a real corridor encloses + links every room. The tiny stair-
    // clearance slivers are left empty — they are the landing zone around the stair,
    // not habitable space. Only fires when the carve actually succeeds; otherwise we
    // fall through to the unchanged generic multi-rect path (no regression).
    if (options.stairCarved && valid.length >= 2) {
        const totalArea = valid.reduce((s, r) => s + rectArea(r), 0);
        const dominant = valid[0]!;            // valid is sorted byAreaDesc
        // "Dominant" = holds the clear majority of the buildable area. Below this the
        // plate is genuinely split (e.g. a mid-edge stair leaving two comparable
        // wings) and the generic per-rect path is the right tool.
        const DOMINANT_FRACTION = 0.55;
        if (rectArea(dominant) >= DOMINANT_FRACTION * totalArea) {
            const carved = trySingleRectCarve(dominant, graph, corridorWidthM);
            // §STAIR-CARVE-NO-DROP (2026-06-08) — the dominant-rect carve gives every
            // room a corridor spine (the founder's central-blob fix), but squeezing the
            // WHOLE programme into the dominant rect (which is smaller than the full
            // plate by the stair sliver) can force it to DROP a room — e.g. on a
            // perimeter back-corner stair the dominant rect is ~75% of the plate and the
            // master en-suite no longer fits. The generic multi-rect path uses ALL the
            // sub-rects (incl. the sliver) so it usually keeps every room — but with no
            // corridor spine (the merged-blob risk). So we run BOTH and prefer whichever
            // drops FEWER programme rooms; on a tie we keep the CARVE (its corridor spine
            // is what fixes the central-stair merged blob). This preserves the vertical
            // programme (master + en-suite stay placed) without abandoning the spine.
            if (carved !== null) {
                const generic = packMultiRect(valid, graph);
                const carvedDrops = carved.droppedRooms.length;
                const genericDrops = generic.droppedRooms.length;
                return finalise(genericDrops < carvedDrops ? generic : carved);
            }
            // No corridor/private split (e.g. studio brief): squarify the whole
            // programme into the dominant rect so it still reads as one enclosed,
            // detectable set rather than scattered per-sliver fragments.
            const packed = placeInRectReported(dominant, allocationOrder(graph.rooms));
            if (packed.placements.length > 0) return finalise(packed);
        }
    }

    return finalise(packMultiRect(valid, graph));
}

/**
 * Generic multi-rect packing (L / T / U shells, and the fall-through for a
 * stair-carved plate). Allocates rooms to rects ∝ area, public-first, reserving
 * ≥1 room for every later rect so each rect is actually filled. Extracted so the
 * §STAIR-OBSTACLE-CARVE branch can evaluate it as an ALTERNATIVE to the dominant-
 * rect corridor carve and pick whichever drops fewer programme rooms. Pure.
 */
function packMultiRect(valid: readonly Rect[], graph: BubbleGraph): SubdivideResult {
    const rooms = allocationOrder(graph.rooms);

    // Common case — a rectangular (single-rect) shell, no carve (no corridor,
    // no private rooms, or the carve can't fit): one squarified treemap.
    // Degenerate case — more rects than rooms: pack everything into the largest
    // rect (can't fill N rects with <N one-footprint rooms without splitting a
    // room). Real programs always have rooms ≥ rects, so this is a safety net.
    if (valid.length === 1 || rooms.length < valid.length) {
        return placeInRectReported(valid[0]!, rooms);
    }

    // Multi-rect shell (L / T / U): allocate rooms to rects ∝ area, public-first,
    // reserving ≥1 room for every later rect so each rect is actually filled.
    const shellArea = valid.reduce((s, r) => s + rectArea(r), 0);
    const out: RoomPlacement[] = [];
    const droppedRooms: DroppedRoom[] = [];
    let cursor = 0;
    for (let k = 0; k < valid.length; k++) {
        const rect = valid[k]!;
        const roomsLeft = rooms.length - cursor;
        const laterRects = valid.length - k - 1;
        let take: number;
        if (k === valid.length - 1) {
            take = roomsLeft;                                   // last rect absorbs the rest
        } else {
            const ideal = Math.round((rooms.length * rectArea(rect)) / shellArea);
            const maxForThis = roomsLeft - laterRects;          // keep ≥1 for each later rect
            take = Math.max(1, Math.min(Math.max(1, ideal), maxForThis));
        }
        const r = placeInRectReported(rect, rooms.slice(cursor, cursor + take));
        out.push(...r.placements);
        droppedRooms.push(...r.droppedRooms);
        cursor += take;
    }
    return { placements: out, droppedRooms };
}

/**
 * Subdivide the shell `rects` among the program rooms. Returns exactly one
 * footprint per placed room. Back-compat array-returning facade over
 * `subdivideWithReport` (which also exposes the §FEASIBILITY-ALLOC drop report).
 * Degenerate input (no rects / no rooms) → [].
 */
export function subdivide(
    rects: readonly Rect[],
    graph: BubbleGraph,
    options: SubdivideOptions = {},
): RoomPlacement[] {
    return subdivideWithReport(rects, graph, options).placements as RoomPlacement[];
}
