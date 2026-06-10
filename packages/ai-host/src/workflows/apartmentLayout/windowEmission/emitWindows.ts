// T1.W — Window emission engine (P1 — pure placement).
//
// Pure + deterministic. Given a single room (its type) and the set of
// EXTERNAL wall segments bounding that room, emits 0..N WindowPlacements.
//
// D5.c (2026-06-05 — "not enough windows") — coverage upgrade: the engine no
// longer emits a single centred window. It now:
//   • emits MULTIPLE evenly-spaced windows on a GENUINELY long wall (a 5 m wall
//     keeps one centred window for every room type; longer runs earn 2–3, capped
//     by MAX_WINDOWS_PER_WALL), keeping WINDOW_CLEARANCE_MM clear of each end +
//     each door + each OTHER window; and
//   • covers a SECOND (and further) qualifying external wall — e.g. a corner
//     room fronts two façades — up to MAX_WINDOWS_PER_ROOM.
// The A.21.D6 climate sizing/orientation behaviour is applied PER window (each
// wall is sized for its own sun-orientation) and is fully preserved.
//
// Today the apartment-layout pipeline ships ZERO emitted windows — the
// modal renders shell windows from the existing perimeter but never
// creates new ones. This engine ships the per-room placement logic; the
// wiring layer (T1.W-B follow-on) is responsible for:
//   • resolving each room's bounding-external-wall segments from the
//     bubble graph's BOUNDS edges + the shell perimeter;
//   • dispatching window.createOpening commands hosted on the resolved
//     wall ids (mirrors the existing door cascade);
//   • applying the per-room window system-type id from T1.D's
//     `defaultWindowSystemTypeId(roomType)` resolver.
//
// Algorithm (intentionally simple):
//   1. Filter externalWalls to those at least `spec.minWallLengthMm` long.
//      If none qualify, retry against `minWidthMm` (the smaller fallback).
//      Still none → return [] (room ships without an emitted window).
//   2. Pick the LONGEST qualifying wall (single deterministic choice;
//      ties broken by lowest wallIndex for determinism).
//   3. Place ONE centred window:
//        offset = (wallLen − chosenWidth) / 2
//        width  = chosenWidth (preferred or fallback)
//      Centred placement gives a balanced façade reading; future variants
//      may shift along sub-walls or emit multiple windows on long runs.
//
// Pure: no I/O, no THREE, no DOM, no random; ai-host unit-tests in plain
// Node.

import type { RoomType } from '../types.js';
import {
    isWindowable,
    WINDOW_SPECS,
    type ExternalWallSegment,
    type OccupiedSpan,
    type PartitionJunction,
    type WindowPlacement,
    type WindowableRoomType,
} from './types.js';
import { solarLengthMultiplier, climateGlazingFactor, orientationFit, outwardNormal, type SolarBias } from './solarOrientation.js';

const segLenMm = (s: ExternalWallSegment): number => {
    const dx = s.end.x - s.start.x;
    const dy = s.end.y - s.start.y;
    return Math.sqrt(dx * dx + dy * dy);
};

/** Clearance (mm) kept between a window edge and any door footprint / wall end
 *  when sliding a window clear of an obstruction. 100 mm matches the door
 *  pipeline's `minClearanceM` (wallsAndDoors.ts) so windows + doors read as a
 *  deliberate, spaced façade rhythm rather than touching. */
const WINDOW_CLEARANCE_MM = 100;

// ── §WINDOW-CORNER-SETBACK (A.21.D45, 2026-06-08) — real corner pier ──────────
//
// The corner clearance kept clear of each WALL END is DISTINCT from (and much
// larger than) WINDOW_CLEARANCE_MM (the bare no-touch gap used between a window
// and a door or another window). WINDOW_CLEARANCE_MM (0.1 m) was ALSO doing
// double duty as the wall-end margin — so the first evenly-distributed window
// started at 0.1 m from the corner (the founder's "window on the EDGE"). A real
// masonry pier/return must remain at each corner. This setback is wall-length-
// scaled with a hard floor + cap (mirrors `cornerSetbackForWall` in
// shellWallMatch.ts, the final shell-frame authority), so NO window — first,
// last, or middle — lands within the setback of a corner. The de-overlap /
// distribution all key off `endSetbackMm`, never the bare clearance.
const MIN_CORNER_SETBACK_MM = 500;
const MAX_CORNER_SETBACK_MM = 1200;
const CORNER_SETBACK_WALL_FRACTION = 0.10;
/** Below this an opening isn't a usable window (mirrors shellWallMatch MIN_WINDOW_M). */
const MIN_WINDOW_MM = 400;

/**
 * The corner setback (mm) for a wall of `wallLenMm`: a real masonry pier at EACH
 * end that no window may encroach. Wall-length-scaled between the floor + cap,
 * then reduced on a short wall (never below 0) so the wall can still host a
 * minimal opening. Pure + deterministic; mirrors `cornerSetbackForWall`.
 */
function endSetbackMm(wallLenMm: number): number {
    if (!Number.isFinite(wallLenMm) || wallLenMm <= 0) return MIN_CORNER_SETBACK_MM;
    const scaled = Math.min(
        MAX_CORNER_SETBACK_MM,
        Math.max(MIN_CORNER_SETBACK_MM, CORNER_SETBACK_WALL_FRACTION * wallLenMm),
    );
    const maxAffordable = Math.max(0, (wallLenMm - MIN_WINDOW_MM) / 2);
    return Math.min(scaled, maxAffordable);
}

/** A.21.D33(d) — fallback half-band (mm) kept clear EITHER SIDE of an interior-
 *  partition junction when the junction carries no (or a non-positive) thickness.
 *  Half of a 100 mm partition (50) + the WINDOW_CLEARANCE_MM (100) = 150 mm, so a
 *  window edge never lands within the partition footprint nor right against it.
 *  When the junction DOES carry a thickness, the engine uses thickness/2 + the
 *  clearance instead (see `blockedSpansForJunctions`). */
const PARTITION_HALF_BAND_MM = 150;

/**
 * Door footprints on one host wall (mm, along the wall from its `start`), each
 * already padded by the window clearance, sorted by `lo`. Returned by
 * `blockedSpansFor`.
 */
interface BlockedSpan { readonly lo: number; readonly hi: number }

/** Build the sorted, clearance-padded blocked-span list for `wallIndex` from
 *  the raw door spans. Spans are clamped to ≥ 0 on the low side. */
function blockedSpansFor(
    wallIndex: number,
    occupied: readonly OccupiedSpan[],
): BlockedSpan[] {
    return occupied
        .filter(s => s.wallIndex === wallIndex)
        .map(s => ({
            lo: Math.min(s.startMm, s.endMm) - WINDOW_CLEARANCE_MM,
            hi: Math.max(s.startMm, s.endMm) + WINDOW_CLEARANCE_MM,
        }))
        .sort((a, b) => a.lo - b.lo);
}

/** A.21.D33(d) — blocked spans for the interior-partition junctions on
 *  `wallIndex`. Each junction `atMm` is expanded to a clear band
 *  `[atMm − half, atMm + half]` where `half = thicknessMm/2 + WINDOW_CLEARANCE_MM`
 *  (falling back to `PARTITION_HALF_BAND_MM` when the junction carries no usable
 *  thickness). A window's span must not overlap these bands → an exterior window
 *  never sits on an interior-wall/shell junction. */
function blockedSpansForJunctions(
    wallIndex: number,
    junctions: readonly PartitionJunction[],
): BlockedSpan[] {
    return junctions
        .filter(j => j.wallIndex === wallIndex && Number.isFinite(j.atMm))
        .map(j => {
            const t = typeof j.thicknessMm === 'number' && j.thicknessMm > 0 ? j.thicknessMm : 0;
            const half = t > 0 ? t / 2 + WINDOW_CLEARANCE_MM : PARTITION_HALF_BAND_MM;
            return { lo: j.atMm - half, hi: j.atMm + half };
        })
        .sort((a, b) => a.lo - b.lo);
}

/** True when the window `[off, off+width]` overlaps any blocked span. */
function overlapsAny(off: number, widthMm: number, blocked: readonly BlockedSpan[]): boolean {
    const hi = off + widthMm;
    return blocked.some(b => off < b.hi && hi > b.lo);
}

/** Max windows the engine will emit per ROOM (across all its external walls),
 *  so a corner living room with two long façades doesn't sprout a curtain wall
 *  of openings. A small architectural cap that still meaningfully improves the
 *  "not enough windows" reading. */
const MAX_WINDOWS_PER_ROOM = 4;
/** Max windows on a SINGLE wall — long runs read best as a rhythm of 2–3, not a
 *  ribbon. The wall-length budget caps this further. */
const MAX_WINDOWS_PER_WALL = 3;

/**
 * Find the offset (mm from wall start) for a `widthMm`-wide window on a wall of
 * `wallLenMm`, as close to the centred position as possible while:
 *   • keeping WINDOW_CLEARANCE_MM clear of each wall end; and
 *   • not overlapping any door footprint in `blocked`.
 * Returns null when no door-clear position fits on this wall.
 */
function clearOffsetMm(
    wallLenMm: number,
    widthMm: number,
    blocked: readonly BlockedSpan[],
): number | null {
    // §WINDOW-CORNER-SETBACK (A.21.D45) — the wall-END margin is the REAL corner
    // pier, not the bare WINDOW_CLEARANCE_MM (which only governs window↔door /
    // window↔window gaps). So the first/last/only window can never start within the
    // setback of a corner.
    const setback = endSetbackMm(wallLenMm);
    const minOff = setback;
    const maxOff = wallLenMm - widthMm - setback;
    if (maxOff < minOff) {
        // Wall too short to keep both end-setbacks — fall back to a simple centred
        // offset (no door overlap possible if there are no doors).
        // §WINDOW-SPAN-FIT (founder defect, 2026-06-10) — when the window is WIDER than
        // its host wall the old `Math.max(0, (wallLen − width)/2)` clamped the offset to
        // 0, leaving [offset, offset+width] = [0, width] running PAST the wall end (the
        // founder's "window beyond the shell"). A window that cannot fit ON the wall must
        // be DROPPED here rather than emitted overrunning it; the shell-match resolver's
        // §WINDOW-SHELL-CLAMP catches the matched path, but this is the producer-side
        // guarantee that NO emitted span ever exceeds its host wall. Deterministic.
        if (widthMm > wallLenMm - 1e-6) {
            console.log(
                `[D-TGL] §WINDOW-SPAN-FIT drop: window width=${Math.round(widthMm)}mm ` +
                `> wallLen=${Math.round(wallLenMm)}mm — cannot fit on host wall, dropped ` +
                `(never emitted past the shell).`,
            );
            return null;
        }
        const centred = (wallLenMm - widthMm) / 2;     // ≥ 0 here (width ≤ wallLen)
        return blocked.length > 0 && overlapsAny(centred, widthMm, blocked) ? null : centred;
    }
    const centred = (wallLenMm - widthMm) / 2;
    const clampToRange = (o: number): number => Math.min(Math.max(o, minOff), maxOff);

    if (!overlapsAny(centred, widthMm, blocked)) return centred;

    // Candidate offsets: just clear of each blocked span on either side, plus
    // the two end-clamped extremes. Pick the feasible one closest to centre.
    const candidates: number[] = [minOff, maxOff];
    for (const b of blocked) {
        candidates.push(b.hi);                 // window starts just after the door
        candidates.push(b.lo - widthMm);       // window ends just before the door
    }
    let best: number | null = null;
    let bestDist = Infinity;
    for (const c of candidates) {
        if (c < minOff - 1e-6 || c > maxOff + 1e-6) continue;
        const off = clampToRange(c);
        if (overlapsAny(off, widthMm, blocked)) continue;
        const d = Math.abs(off - centred);
        if (d < bestDist) { best = off; bestDist = d; }
    }
    return best;
}

/** Inter-window gap (mm) used when deciding how many windows a long wall earns.
 *  Much larger than WINDOW_CLEARANCE_MM (the bare no-touch minimum) so a wall is
 *  only split into 2+ openings when it is GENUINELY long. The threshold is set so
 *  a 5 m wall keeps a SINGLE centred window for EVERY room type (including the
 *  600 mm wet-room windows); a wall earns its second window only past ~5.3 m for
 *  the narrowest glazing and ~6.3 m for a 2 m living window. Keeps the façade
 *  reading as a deliberate rhythm rather than a ribbon of glass. */
const WINDOW_STRIDE_GAP_MM = 1400;

/**
 * How many `widthMm`-wide windows a wall of `wallLenMm` EARNS, capped at
 * `MAX_WINDOWS_PER_WALL`. A wall only earns its Nth window when it can host N
 * windows each separated (and end-set-back) by `WINDOW_STRIDE_GAP_MM` — i.e.
 *   N·width + (N+1)·gap ≤ wallLen.
 * This deliberately under-fills vs the bare-clearance maximum so short/medium
 * walls keep ONE window and only long runs get a balanced 2–3.
 * Returns ≥ 1 (the caller has already verified a single window hosts).
 */
function windowCountForWall(wallLenMm: number, widthMm: number): number {
    // N·width + (N+1)·gap ≤ wallLen  ⇒  N ≤ (wallLen − gap) / (width + gap)
    // §WINDOW-CORNER-SETBACK (A.21.D45) — the COUNT budget is unchanged (so a 5 m wall
    // still keeps ONE centred window for every room type, per D5.c); the corner pier
    // only governs WHERE the windows sit (the end margins in `evenOffsetsMm`), not how
    // many a wall earns.
    const n = Math.floor((wallLenMm - WINDOW_STRIDE_GAP_MM) / (widthMm + WINDOW_STRIDE_GAP_MM));
    return Math.max(1, Math.min(MAX_WINDOWS_PER_WALL, n));
}

/**
 * Place `count` `widthMm`-wide windows evenly along a wall of `wallLenMm`,
 * keeping WINDOW_CLEARANCE_MM clear of each wall end + between windows, and never
 * overlapping a door footprint (`blocked`). Returns the door-clear offsets (mm
 * from wall start), in ascending order. Each window is snapped clear of any door
 * it would overlap (toward the nearest door-free gap); a window that cannot be
 * placed door-clear without colliding with an already-placed window is dropped.
 * May return fewer than `count` (down to 0) when doors crowd the wall.
 */
function evenOffsetsMm(
    wallLenMm: number,
    widthMm: number,
    count: number,
    blocked: readonly BlockedSpan[],
): number[] {
    if (count <= 1) {
        const off = clearOffsetMm(wallLenMm, widthMm, blocked);
        return off === null ? [] : [off];
    }
    // §WINDOW-CORNER-SETBACK (A.21.D45) — the usable span keeps a real corner pier
    // (not the bare clearance) at each end, so the first/last evenly-spaced window
    // can't hug a corner. Window i sits at evenly spaced positions across that run.
    const minOff = endSetbackMm(wallLenMm);
    const maxOff = wallLenMm - widthMm - endSetbackMm(wallLenMm);
    if (maxOff < minOff) {
        const off = clearOffsetMm(wallLenMm, widthMm, blocked);
        return off === null ? [] : [off];
    }
    const placed: number[] = [];
    // Treat already-placed windows (padded by clearance) as additional blocked
    // spans so the per-window door-clear search also avoids window↔window overlap.
    const dynamicBlocked = (): BlockedSpan[] => [
        ...blocked,
        ...placed.map(o => ({ lo: o - WINDOW_CLEARANCE_MM, hi: o + widthMm + WINDOW_CLEARANCE_MM })),
    ];
    for (let i = 0; i < count; i++) {
        const ideal = count === 1
            ? (minOff + maxOff) / 2
            : minOff + (maxOff - minOff) * (i / (count - 1));
        const off = nearestClearOffsetMm(wallLenMm, widthMm, ideal, dynamicBlocked());
        if (off !== null) placed.push(off);
    }
    placed.sort((a, b) => a - b);
    return placed;
}

/**
 * Like `clearOffsetMm` but biased toward `idealMm` (a target offset along the
 * wall) rather than the wall centre. Returns the door-clear offset closest to
 * `idealMm`, or null when none fits.
 */
function nearestClearOffsetMm(
    wallLenMm: number,
    widthMm: number,
    idealMm: number,
    blocked: readonly BlockedSpan[],
): number | null {
    // §WINDOW-CORNER-SETBACK (A.21.D45) — end margin is the real corner pier.
    const minOff = endSetbackMm(wallLenMm);
    const maxOff = wallLenMm - widthMm - endSetbackMm(wallLenMm);
    if (maxOff < minOff) return null;
    const clamp = (o: number): number => Math.min(Math.max(o, minOff), maxOff);
    const target = clamp(idealMm);
    if (!overlapsAny(target, widthMm, blocked)) return target;
    const candidates: number[] = [minOff, maxOff];
    for (const b of blocked) {
        candidates.push(b.hi);            // just after a span
        candidates.push(b.lo - widthMm);  // just before a span
    }
    let best: number | null = null;
    let bestDist = Infinity;
    for (const c of candidates) {
        if (c < minOff - 1e-6 || c > maxOff + 1e-6) continue;
        const off = clamp(c);
        if (overlapsAny(off, widthMm, blocked)) continue;
        const d = Math.abs(off - target);
        if (d < bestDist) { best = off; bestDist = d; }
    }
    return best;
}

/**
 * Emit zero-or-one window placement for a room of `roomType`, hosted on the
 * longest viable external wall in `externalWalls`. Returns [] when:
 *   • roomType is not in the windowable set; or
 *   • externalWalls is empty (interior room); or
 *   • every external wall is shorter than `spec.minWidthMm`; or
 *   • every qualifying wall is fully blocked by door footprints (`occupied`).
 *
 * `roomName` is optional and only used to stamp `WindowPlacement.name`.
 *
 * `occupied` (T1.W-B-2 — door avoidance): door footprints already placed on
 * these walls, in mm along each wall from its `start` endpoint. The window is
 * never placed over a door on the same wall — it is slid clear (keeping
 * WINDOW_CLEARANCE_MM either side), and when no door-clear slot fits on the
 * longest wall the engine falls through to the next-longest qualifying wall.
 * Omit / pass [] to disable door avoidance (legacy + unit-test callers).
 *
 * `partitionJunctions` (A.21.D33(d) — interior-partition avoidance): points where
 * an INTERIOR partition meets a SHELL wall bounding this room. The window is kept
 * clear of each junction's footprint band (≥ partition-half-thickness + clearance)
 * exactly like a door, so an exterior window never sits on an interior-wall/shell
 * junction and always lies within ONE room's façade. When a junction crowds a wall
 * so no clear slot fits, the window is dropped / the engine falls through, reusing
 * the A.21.D28 #5 width-clamp + drop discipline. Omit / pass [] to disable.
 */
export function emitWindowsForRoom(
    roomType: RoomType,
    externalWalls: readonly ExternalWallSegment[],
    roomName?: string,
    occupied: readonly OccupiedSpan[] = [],
    // A.21.D6 — optional climate bias: when present, candidate walls are ranked by
    // length × sun-orientation, so a sun-facing (equator-facing) façade is preferred
    // over a marginally longer wrong-facing one. Absent / null → pure length (no
    // regression: the multiplier is 1, so the score order is identical).
    solar?: SolarBias | null,
    // A.21.D33(d) — interior-partition junctions on the SHELL walls bounding this
    // room. The window placer keeps each emitted window CLEAR of these points so an
    // exterior façade window never sits where an interior partition meets the shell
    // (the window stays within ONE room's façade, not straddling the partition).
    // Omit / pass [] to disable (legacy + unit-test callers — no behaviour change).
    partitionJunctions: readonly PartitionJunction[] = [],
): readonly WindowPlacement[] {
    // §DIAG-WIN — per-room window-emission decision (logging only; no behaviour
    // change). The `why` cases below pinpoint WHY a room gets ZERO windows.
    const winTag = roomName ? `${roomName} (${roomType})` : roomType;
    if (!isWindowable(roomType)) {
        console.log(`[D-TGL] §DIAG-WIN ${winTag}: 0 windows — room type not windowable`);
        return [];
    }
    if (externalWalls.length === 0) {
        console.log(`[D-TGL] §DIAG-WIN ${winTag}: 0 windows — NO external wall (fully interior room)`);
        return [];
    }

    const spec = WINDOW_SPECS[roomType as WindowableRoomType];
    if (!spec) {
        console.log(`[D-TGL] §DIAG-WIN ${winTag}: 0 windows — no WINDOW_SPEC for type`);
        return [];
    }

    // Score = physical length × solar-orientation multiplier. The minimum-length
    // FILTER still uses raw length (a window needs the wall to physically host it),
    // but RANKING uses the climate-biased score.
    const score = (w: ExternalWallSegment): number =>
        segLenMm(w) * solarLengthMultiplier(w.start, w.end, solar);

    // Walls long enough for the preferred width; fall back to the smaller
    // variant when the preferred width can't host on any wall.
    const longEnough = externalWalls
        .map(w => ({ w, lenMm: segLenMm(w) }))
        .filter(x => x.lenMm >= spec.minWallLengthMm)
        .sort((a, b) => score(b.w) - score(a.w) || a.w.wallIndex - b.w.wallIndex);

    let chosenWidthMm = spec.widthMm;
    let candidates = longEnough;
    if (candidates.length === 0) {
        // Try the smaller variant — minWidthMm + 100 mm padding either side.
        const minHostMm = spec.minWidthMm + 200;
        candidates = externalWalls
            .map(w => ({ w, lenMm: segLenMm(w) }))
            .filter(x => x.lenMm >= minHostMm)
            .sort((a, b) => score(b.w) - score(a.w) || a.w.wallIndex - b.w.wallIndex);
        if (candidates.length === 0) {
            const lens = externalWalls.map(w => Math.round(segLenMm(w))).join(',');
            console.log(
                `[D-TGL] §DIAG-WIN ${winTag}: 0 windows — all ${externalWalls.length} external ` +
                `wall(s) shorter than minWallLength=${spec.minWallLengthMm}mm AND fallback ` +
                `minHost=${minHostMm}mm (wall lengths mm=[${lens}])`,
            );
            return [];
        }
        chosenWidthMm = spec.minWidthMm;
    }

    // D5.c — cover MORE of the façade. Walk qualifying walls in score order
    // (best sun/length first), and on each emit MULTIPLE evenly-spaced windows
    // when the wall is long enough to host them with clearance + door avoidance.
    // Continue onto the next qualifying wall (e.g. a corner room's second façade)
    // until the per-room cap is reached. Door avoidance: a window must not overlap
    // a door on the SAME wall, and the multi-window placer keeps windows clear of
    // each other too.
    const out: WindowPlacement[] = [];
    for (const cand of candidates) {
        if (out.length >= MAX_WINDOWS_PER_ROOM) break;
        const wallLenMm = cand.lenMm;
        // A.21.D6.3 — climate-driven glazing SIZE: scale each window on THIS wall by
        // the passive-solar factor for the wall's sun-orientation (bigger sun-facing
        // glazing in cold climates, smaller in hot). Width is clamped so it still
        // hosts on the wall; height/sill track. No solar context → unchanged.
        let widthMm = chosenWidthMm;
        let heightMm = spec.heightMm;
        if (solar) {
            const fit = orientationFit(outwardNormal(cand.w.start, cand.w.end, solar.roomCentroidMm), solar.sunDir);
            const factor = climateGlazingFactor(solar.latDeg, fit);
            if (factor !== 1) {
                const maxWidth = Math.max(spec.minWidthMm, wallLenMm - 2 * WINDOW_CLEARANCE_MM);
                widthMm = Math.round(Math.max(spec.minWidthMm, Math.min(chosenWidthMm * factor, maxWidth)));
                heightMm = Math.round(spec.heightMm * factor);
            }
        }
        // A.21.D33(d) — doors AND interior-partition junctions are both treated as
        // blocked spans: the placer slides/drops windows clear of either. Merged so a
        // window is kept off a door footprint AND off any partition-to-shell junction.
        const blocked = [
            ...blockedSpansFor(cand.w.wallIndex, occupied),
            ...blockedSpansForJunctions(cand.w.wallIndex, partitionJunctions),
        ].sort((a, b) => a.lo - b.lo);
        // How many windows this wall can host, capped by the remaining room budget.
        const remaining = MAX_WINDOWS_PER_ROOM - out.length;
        const wantOnWall = Math.min(remaining, windowCountForWall(wallLenMm, widthMm));
        const offsets = evenOffsetsMm(wallLenMm, widthMm, wantOnWall, blocked);
        // §DIAG-WIN — per-wall placement outcome. When a qualifying wall yields ZERO
        // offsets the window was de-overlapped away by doors/partitions/other windows.
        const wantOnWall0 = Math.min(remaining, windowCountForWall(wallLenMm, widthMm));
        console.log(
            `[D-TGL] §DIAG-WIN ${winTag}: wall#${cand.w.wallIndex} len=${Math.round(wallLenMm)}mm ` +
            `wanted=${wantOnWall0} placed=${offsets.length}${offsets.length === 0
                ? ' (all removed by door/partition/de-overlap)'
                : ` offsetsMm=[${offsets.map(o => Math.round(o)).join(',')}]`}`,
        );
        for (const offsetMm of offsets) {
            if (out.length >= MAX_WINDOWS_PER_ROOM) break;
            out.push({
                wallIndex: cand.w.wallIndex,
                offsetMm,
                widthMm,
                heightMm,
                sillMm:    spec.sillMm,
                roomType:  roomType as WindowableRoomType,
                ...(roomName ? { name: `${roomName} Window` } : {}),
            });
        }
    }
    // §DIAG-WIN — room summary: total windows emitted + the wall indices they landed on.
    console.log(
        `[D-TGL] §DIAG-WIN ${winTag}: emitted ${out.length} window(s) ` +
        `on wall(s)=[${[...new Set(out.map(w => w.wallIndex))].join(',') || 'none'}]` +
        `${out.length === 0 ? ' — every qualifying wall was crowded out by openings' : ''}`,
    );
    return out;
}

/**
 * Convenience: emit windows for every entry in `rooms`, flattening the
 * results into a single placements array. Each room is independent —
 * collisions between the resulting windows are NOT checked here (a single
 * external wall hosting two rooms is impossible in the current generator,
 * so collisions can only arise via wiring bugs — caught at the wall.createOpening
 * dispatch layer).
 */
export function emitAllWindows(
    rooms: readonly { readonly roomType: RoomType; readonly externalWalls: readonly ExternalWallSegment[]; readonly name?: string }[],
    occupied: readonly OccupiedSpan[] = [],
): readonly WindowPlacement[] {
    const out: WindowPlacement[] = [];
    for (const r of rooms) {
        const ws = emitWindowsForRoom(r.roomType, r.externalWalls, r.name, occupied);
        for (const w of ws) out.push(w);
    }
    return out;
}
