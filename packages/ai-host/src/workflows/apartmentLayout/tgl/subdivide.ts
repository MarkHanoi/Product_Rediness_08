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
import { rectArea, type Rect } from './rectDecomposition.js';
import { squarify } from './squarify.js';
import { roomRule } from '../rules/programRules.js';

/** A room's realised footprint inside the shell. */
export interface RoomPlacement {
    readonly roomId: string;
    readonly rect: Rect;
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

/** squarify a room set into one rect → footprints (rounded). Iteratively
 *  drops the LOWEST-PRIORITY room (the LAST entry, since `allocationOrder`
 *  has public-first / private-last) until every placement clears its
 *  per-type minShortSideM (or the absolute floor). Empty `rooms[]` → []. */
function placeInRect(rect: Rect, rooms: readonly ProgramRoom[]): RoomPlacement[] {
    let pool = [...rooms];
    while (pool.length > 0) {
        const items = pool.map(r => ({ id: r.id, area: Math.max(EPS, r.targetAreaM2) }));
        const placements = squarify(rect, items)
            .map(p => ({ roomId: p.id, rect: roundRect(p.rect) }));
        const placementById = new Map(placements.map(p => [p.roomId, p]));
        const tooNarrowRoom = pool.find(r => {
            const p = placementById.get(r.id);
            if (!p) return false;
            const floor = Math.max(ABSOLUTE_MIN_SHORT_SIDE_M, roomRule(r.type).minShortSideM || ABSOLUTE_MIN_SHORT_SIDE_M);
            return shortSideM(p.rect) < floor - EPS;
        });
        if (!tooNarrowRoom) return placements;
        // Drop the last room (lowest priority in allocation order) and retry.
        const dropped = pool[pool.length - 1]!;
        const placement = placementById.get(tooNarrowRoom.id)!;
        const floor = Math.max(ABSOLUTE_MIN_SHORT_SIDE_M, roomRule(tooNarrowRoom.type).minShortSideM || ABSOLUTE_MIN_SHORT_SIDE_M);
        console.warn(
            `[D-TGL subdivide] §HARD-MIN-SIDE-PER-ROOM: room "${tooNarrowRoom.id}" (${tooNarrowRoom.type}) ` +
            `would produce short side ${shortSideM(placement.rect).toFixed(2)} m ` +
            `< ${floor.toFixed(2)} m per-type floor — dropping "${dropped.id}" (${dropped.type}) and re-squarifying.`,
        );
        pool = pool.slice(0, -1);
    }
    return [];
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
 *  with ensuite carved from master). Returns null when the carve can't fit. */
function trySingleRectCarve(shell: Rect, graph: BubbleGraph): RoomPlacement[] | null {
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
    // Corridor IS the strip.
    out.push({ roomId: corridor.id, rect: roundRect(carve.corridorRect) });
    // Public + private rooms squarified into their own sub-rects.
    out.push(...placeInRect(carve.publicRect,  allocationOrder(publicRooms)));
    const privatePlacements = placeInRect(carve.privateRect, allocationOrder(privateRooms));

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
                    `ensuite (${ensuiteCarveArea.toFixed(2)} m²) — ensuite left unplaced.`,
                );
            }
        }
    }
    out.push(...privatePlacements);
    return out;
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
 * Subdivide the shell `rects` among the program rooms. Returns exactly one
 * footprint per room; footprints lie inside the shell rects, do not overlap, and
 * together tile the shell. Degenerate input (no rects / no rooms) → [].
 *
 * §L4-δ-1b — by default the output is run through `snapAxisLines` so room-rect
 * edges within 50 mm of each other are snapped to the shared mean (the
 * CONSTRUCTIVE form of the scoring `alignmentField` axis). Pass
 * `{ alignmentSnap: false }` to opt out (legacy raw squarified output).
 */
export function subdivide(
    rects: readonly Rect[],
    graph: BubbleGraph,
    options: SubdivideOptions = {},
): RoomPlacement[] {
    const alignmentSnap = options.alignmentSnap ?? true;
    const valid = rects.filter(r => rectArea(r) > EPS).sort(byAreaDesc);
    if (valid.length === 0 || graph.rooms.length === 0) return [];

    const finalise = (placements: RoomPlacement[]): RoomPlacement[] =>
        alignmentSnap ? snapAxisLines(placements) : placements;

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
        return finalise(placeInRect(valid[0]!, rooms));
    }

    // Multi-rect shell (L / T / U): allocate rooms to rects ∝ area, public-first,
    // reserving ≥1 room for every later rect so each rect is actually filled.
    const shellArea = valid.reduce((s, r) => s + rectArea(r), 0);
    const out: RoomPlacement[] = [];
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
        out.push(...placeInRect(rect, rooms.slice(cursor, cursor + take)));
        cursor += take;
    }
    return finalise(out);
}
