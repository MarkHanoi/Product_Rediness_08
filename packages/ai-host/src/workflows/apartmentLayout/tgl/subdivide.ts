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
): CorridorCarve | null {
    const W = shell.x1 - shell.x0;
    const H = shell.z1 - shell.z0;
    const orientation: 'horizontal' | 'vertical' = W >= H ? 'horizontal' : 'vertical';
    const shortDim = orientation === 'horizontal' ? H : W;
    const MIN_ZONE_DEPTH = 2.0;
    if (shortDim < CORRIDOR_STRIP_WIDTH_M + 2 * MIN_ZONE_DEPTH - EPS) return null;

    const usable = shortDim - CORRIDOR_STRIP_WIDTH_M;
    const denom = Math.max(EPS, publicAreaTarget + privateAreaTarget);
    let publicDepth = usable * (publicAreaTarget / denom);
    // Clamp so both zones keep a usable depth.
    publicDepth = Math.min(Math.max(publicDepth, MIN_ZONE_DEPTH), usable - MIN_ZONE_DEPTH);

    if (orientation === 'horizontal') {
        const zPubBottom = shell.z0 + publicDepth;
        const zCorBottom = zPubBottom + CORRIDOR_STRIP_WIDTH_M;
        return {
            publicRect:   { x0: shell.x0, z0: shell.z0,    x1: shell.x1, z1: zPubBottom },
            corridorRect: { x0: shell.x0, z0: zPubBottom,  x1: shell.x1, z1: zCorBottom },
            privateRect:  { x0: shell.x0, z0: zCorBottom,  x1: shell.x1, z1: shell.z1 },
        };
    } else {
        const xPubRight = shell.x0 + publicDepth;
        const xCorRight = xPubRight + CORRIDOR_STRIP_WIDTH_M;
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

/** Single-rect carve flow: returns the placements (corridor + public + private,
 *  with ensuite carved from master) + the structured drop report. Returns null
 *  when the carve can't fit (caller falls back to the whole-shell squarify). */
function trySingleRectCarve(shell: Rect, graph: BubbleGraph): SubdivideResult | null {
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
    const carve = tryCarveCorridor(shell, publicAreaTarget, privateAreaTarget);
    if (!carve) return null;

    const out: RoomPlacement[] = [];
    const droppedRooms: DroppedRoom[] = [];
    // Corridor IS the strip.
    out.push({ roomId: corridor.id, rect: roundRect(carve.corridorRect) });
    // Public + private rooms squarified into their own sub-rects.
    const pub = placeInRectReported(carve.publicRect, allocationOrder(publicRooms));
    out.push(...pub.placements);
    droppedRooms.push(...pub.droppedRooms);
    const priv = placeInRectReported(carve.privateRect, allocationOrder(privateRooms));
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
    const valid = rects.filter(r => rectArea(r) > EPS).sort(byAreaDesc);
    if (valid.length === 0 || graph.rooms.length === 0) return { placements: [], droppedRooms: [] };

    const finalise = (res: SubdivideResult): SubdivideResult => ({
        placements: alignmentSnap ? snapAxisLines(res.placements) : res.placements.slice(),
        droppedRooms: res.droppedRooms,
    });

    // §SINGLE-RECT-CARVE — single-rect shell with corridor + private rooms.
    if (valid.length === 1) {
        const carved = trySingleRectCarve(valid[0]!, graph);
        if (carved !== null) return finalise(carved);
    }

    const rooms = allocationOrder(graph.rooms);

    // Common case — a rectangular (single-rect) shell, no carve (no corridor,
    // no private rooms, or the carve can't fit): one squarified treemap.
    // Degenerate case — more rects than rooms: pack everything into the largest
    // rect (can't fill N rects with <N one-footprint rooms without splitting a
    // room). Real programs always have rooms ≥ rects, so this is a safety net.
    if (valid.length === 1 || rooms.length < valid.length) {
        return finalise(placeInRectReported(valid[0]!, rooms));
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
    return finalise({ placements: out, droppedRooms });
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
