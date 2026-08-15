// Apartment layout — PER-ROOM FAÇADE METRICS (§L-909(b), 2026-08-14).
//
// WHY THIS FILE EXISTS
// --------------------
// The founder's generated apartment reported 19 errors. FIFTEEN of them —
// G-7 "external frontage 0.00 m" ×5, G-10 "glazed-to-floor ratio 0.000" ×5,
// A-7 "no exterior edge" ×5 — were FALSE. D-TGL had emitted 9 shell windows
// and stamped `windowCount = 1` on every habitable room. The windows were on
// the very option object the report was projecting.
//
// The defect was in the REPORT path: `optionToDto` (layoutCardModel.ts) left
// frontage / glazing / exterior-edge UNSET, and the validator adapter then
// filled them with "conservative" `0 / 0 / false`. G-7, G-10 and A-7 printed
// those UNMEASURED defaults as MEASURED zeros — `not measured` and
// `measured: zero` collapsed to the same value, which is the context-data-
// honesty defect (C78 §1.4, C70 L-INV-1, C75 §1.4).
//
// This module is the FIRST half of the fix: it MEASURES the three values from
// data that is already on the option, so the rules judge what was actually
// generated. The second half lives in the adapter + validators: whatever this
// module cannot measure comes back `undefined`, and the rule then SKIPS and
// records "not measured" instead of inventing a violation.
//
// WHAT IS MEASURABLE, AND FROM WHAT
// ---------------------------------
//   • `option.walls[i].isExternal === true` — the apartment shell.
//   • `room.polygon` (plan mm, emit-frame; same frame as the wall baselines,
//     both produced by `emitGeometry`'s `mm(x) / mm(z)` projection).
//   • `option.windows[]` — `{ wallRef, offset, width, height }`, all mm.
//   • `room.windowCount` — the engine's own "this room will get a window".
//
// frontage  = Σ length of the room's polygon edges lying ON an external wall.
// exterior  = frontage > 0.
// glazing   = Σ (width × height) of the windows whose along-wall midpoint
//             falls inside THIS room's stretch of that external wall.
//
// Window→room attribution is GEOMETRIC, not by name: the window's `name` is
// built from `str(n.attrs.name, …)` while the room's `name` is the DEDUPED
// `uniqueNameByGuid` value, so the two legitimately differ ("Bedroom" vs
// "Bedroom 1") and a string match would silently mis-attribute. The per-room
// façade intervals we already computed for frontage give the answer exactly.
//
// WHEN WE REFUSE TO MEASURE (returns `undefined` — NEVER 0 / false)
// -----------------------------------------------------------------
//   • the option carries no wall list, or no wall is flagged external → we do
//     not know where the shell is, so NO room's frontage is measurable;
//   • the room carries no polygon (AI-relay options, hand-built rooms) → that
//     room's frontage is not measurable;
//   • frontage unmeasured ⇒ exterior-edge and glazing unmeasured too (they are
//     derived from the same intervals);
//   • the room's `windowCount` says a window exists but no emitted window can
//     be attributed to it → glazing NOT measured (we know there IS glass; we
//     do not know how much). Reporting 0 there would be the original lie.
//
// A room whose polygon simply does not touch the shell measures frontage `0`
// — that is a REAL measurement of a genuinely interior room, and G-7 / A-7
// SHOULD fire on it. The distinction between that and "we never looked" is
// the entire point of this file.
//
// PURE: no I/O, no DOM, no THREE, no async. Same option ⇒ same output.

import type { LayoutOption, LayoutRoom } from '@pryzm/ai-host';

/** Plan point, mm (emit frame: x = world x, y = world z). */
interface P { readonly x: number; readonly y: number }

/**
 * How far off a shell wall's centreline a room polygon edge may sit and still
 * count as lying ON it.
 *
 * Space polygons and wall baselines are both emitted from the same graph, but
 * a space boundary can sit on the wall's INNER FACE rather than its centreline
 * — half a thick shell (~150 mm) plus mitre/weld residual. 350 mm covers both
 * conventions while staying far below any room's depth, so an interior room
 * one corridor away from the façade can never be mistaken for a fronting one.
 *
 * A DOMAIN BAND under this module's own ownership (C73 §2.1), not a numeric
 * epsilon — the same kind as `defaultJunctionBandM` (0.20 m, geometry-wall),
 * which the epsilon gate names as the precedent. It was called
 * `ON_WALL_PERP_TOL_MM`; at 350 mm — a third of a metre, derived from WALL
 * THICKNESS, not from float noise — "TOL" claimed a generality it never had.
 * It does NOT migrate onto a kernel role: the kernel's metre-valued role is
 * `COINCIDENT_M` at 1 mm, and this band is 350× that because it is measuring a
 * construction offset, not an identity. The value is unchanged.
 *
 * ⚠ NOT ONLY A PERPENDICULAR BAND, despite the name. `glazedAreaByRoom` below
 * reuses it as an ALONG-wall slack when matching a window midpoint into a
 * room's frontage span. That is a different axis and arguably wants its own
 * constant; it is left alone here because this pass is value-identical by
 * mandate and re-deriving that slack would change which room a window counts
 * toward. Recorded rather than silently carried.
 */
const ON_WALL_PERP_BAND_MM = 350;

/** Overlaps shorter than this are numerical dust, not frontage. */
const MIN_FRONTAGE_MM = 50;

/** One room's measured façade metrics. Every field is INDEPENDENTLY optional:
 *  `undefined` means NOT MEASURED and is never interchangeable with 0/false. */
export interface RoomFacadeMetrics {
    /** Metres of shell wall this room owns. `undefined` ⇒ not measured. */
    readonly externalFrontageM?: number;
    /** Whether the room touches the shell. `undefined` ⇒ not measured. */
    readonly hasExteriorEdge?: boolean;
    /** m² of glazing inside this room's façade. `undefined` ⇒ not measured. */
    readonly glazedAreaM2?: number;
}

/** A closed interval along one wall, in mm from the wall's start point. */
interface Span { start: number; end: number }

/** Merge overlapping/abutting spans and return the merged list (sorted). */
function mergeSpans(spans: readonly Span[]): Span[] {
    if (spans.length === 0) return [];
    const sorted = [...spans].sort((a, b) => a.start - b.start);
    const out: Span[] = [{ ...sorted[0]! }];
    for (let i = 1; i < sorted.length; i++) {
        const s = sorted[i]!;
        const last = out[out.length - 1]!;
        if (s.start <= last.end) last.end = Math.max(last.end, s.end);
        else out.push({ ...s });
    }
    return out;
}

/** True iff `v` is a finite number. */
function fin(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v);
}

/** A usable plan point? */
function pt(v: unknown): v is P {
    return !!v && fin((v as P).x) && fin((v as P).y);
}

/**
 * Project the polygon edge `(a,b)` onto the wall segment `(wa,wb)` and return
 * the overlapping along-wall interval — or `null` when the edge is not ON the
 * wall (either endpoint further than the perpendicular tolerance, or the
 * projections do not overlap).
 */
function edgeOnWall(a: P, b: P, wa: P, wb: P): Span | null {
    const dx = wb.x - wa.x;
    const dy = wb.y - wa.y;
    const len = Math.hypot(dx, dy);
    if (!(len > 1e-6)) return null;
    const ux = dx / len;
    const uy = dy / len;

    // Perpendicular distance of BOTH edge endpoints from the wall LINE.
    const perpA = Math.abs((a.x - wa.x) * uy - (a.y - wa.y) * ux);
    const perpB = Math.abs((b.x - wa.x) * uy - (b.y - wa.y) * ux);
    if (perpA > ON_WALL_PERP_BAND_MM || perpB > ON_WALL_PERP_BAND_MM) return null;

    // Along-wall projections, clamped to the wall's own extent.
    const tA = (a.x - wa.x) * ux + (a.y - wa.y) * uy;
    const tB = (b.x - wa.x) * ux + (b.y - wa.y) * uy;
    const lo = Math.max(0, Math.min(tA, tB));
    const hi = Math.min(len, Math.max(tA, tB));
    if (!(hi - lo > MIN_FRONTAGE_MM)) return null;
    return { start: lo, end: hi };
}

/**
 * Measure per-room façade metrics for one layout option.
 *
 * Returns a Map keyed by `LayoutRoom.name` (the id `optionToDto` projects).
 * A room absent from the map, or present with `undefined` fields, was NOT
 * measured — the caller must propagate the absence, never substitute 0/false.
 */
export function measureRoomFacades(
    option: Pick<LayoutOption, 'rooms' | 'walls' | 'windows'>,
): ReadonlyMap<string, RoomFacadeMetrics> {
    const out = new Map<string, RoomFacadeMetrics>();
    const rooms: readonly LayoutRoom[] = Array.isArray(option?.rooms) ? option.rooms : [];

    // ── Can we locate the shell at all? ────────────────────────────────────
    const walls = Array.isArray(option?.walls) ? option.walls : [];
    const externalWallIdx: number[] = [];
    for (let i = 0; i < walls.length; i++) {
        const w = walls[i];
        if (!w || w.isExternal !== true) continue;
        if (!pt(w.start) || !pt(w.end)) continue;
        externalWallIdx.push(i);
    }
    if (externalWallIdx.length === 0) {
        // NO shell known ⇒ nothing about frontage/glazing is measurable for
        // ANY room. Emit an empty-metrics record per room so the caller can
        // tell "measured nothing" from "room not seen".
        for (const r of rooms) if (r && typeof r.name === 'string') out.set(r.name, {});
        return out;
    }

    // ── Per-room façade spans, per external wall ───────────────────────────
    // roomName → wallIndex → merged spans (mm along that wall).
    const spansByRoom = new Map<string, Map<number, Span[]>>();
    const measurable = new Set<string>();

    for (const r of rooms) {
        if (!r || typeof r.name !== 'string' || r.name.length === 0) continue;
        const poly = Array.isArray(r.polygon) ? r.polygon.filter(pt) : [];
        if (poly.length < 3) continue;               // no polygon ⇒ not measurable
        measurable.add(r.name);
        const perWall = new Map<number, Span[]>();
        for (let e = 0; e < poly.length; e++) {
            const a = poly[e]!;
            const b = poly[(e + 1) % poly.length]!;
            for (const wi of externalWallIdx) {
                const w = walls[wi]!;
                const span = edgeOnWall(a, b, w.start as P, w.end as P);
                if (!span) continue;
                const bucket = perWall.get(wi) ?? [];
                bucket.push(span);
                perWall.set(wi, bucket);
            }
        }
        // Merge so a polygon that lands two collinear edges on one wall (or an
        // edge counted against two collinear shell segments) is not doubled.
        const merged = new Map<number, Span[]>();
        for (const [wi, spans] of perWall) merged.set(wi, mergeSpans(spans));
        spansByRoom.set(r.name, merged);
    }

    // ── Attribute emitted windows to the room owning that stretch of wall ──
    // `undefined` windows array ⇒ NO window geometry to attribute (distinct
    // from an empty array, which would mean "measured: none emitted"). D-TGL
    // omits the key entirely when it emitted zero windows, so we fall back to
    // the engine's own per-room `windowCount` below rather than guess.
    const hasWindowGeometry = Array.isArray(option?.windows);
    const glazedByRoom = new Map<string, number>();
    if (hasWindowGeometry) {
        for (const win of option.windows!) {
            if (!win || !fin(win.wallRef) || !fin(win.offset)) continue;
            if (!fin(win.width) || !fin(win.height)) continue;
            const w = walls[win.wallRef];
            if (!w || w.isExternal !== true || !pt(w.start) || !pt(w.end)) continue;
            const midMm = win.offset + win.width / 2;
            // Which room owns this stretch? Tolerate the same perpendicular
            // slop along the wall so a window flush to a room's end still
            // lands inside its span.
            for (const [roomName, perWall] of spansByRoom) {
                const spans = perWall.get(win.wallRef);
                if (!spans) continue;
                const hit = spans.some(s =>
                    midMm >= s.start - ON_WALL_PERP_BAND_MM
                    && midMm <= s.end + ON_WALL_PERP_BAND_MM);
                if (!hit) continue;
                const areaM2 = (win.width / 1000) * (win.height / 1000);
                glazedByRoom.set(roomName, (glazedByRoom.get(roomName) ?? 0) + areaM2);
                break;      // one window belongs to exactly one room
            }
        }
    }

    // ── Assemble ───────────────────────────────────────────────────────────
    for (const r of rooms) {
        if (!r || typeof r.name !== 'string' || r.name.length === 0) continue;
        if (!measurable.has(r.name)) { out.set(r.name, {}); continue; }

        const perWall = spansByRoom.get(r.name) ?? new Map<number, Span[]>();
        let frontageMm = 0;
        for (const spans of perWall.values()) {
            for (const s of spans) frontageMm += s.end - s.start;
        }
        const externalFrontageM = frontageMm / 1000;
        const hasExteriorEdge = frontageMm > MIN_FRONTAGE_MM;

        // Glazing. Three outcomes, and the third is the honest refusal:
        //   • attributed windows found            → measured sum
        //   • no window attributed AND the engine says this room gets none
        //     (`windowCount === 0`)               → measured ZERO
        //   • no window attributed but the engine says one exists
        //     (`windowCount > 0`, or unknown)     → NOT MEASURED
        const attributed = glazedByRoom.get(r.name);
        const engineSaysNone = fin(r.windowCount) && r.windowCount === 0;
        const glazedAreaM2 = attributed !== undefined
            ? attributed
            : engineSaysNone
                ? 0
                : undefined;

        out.set(r.name, {
            externalFrontageM,
            hasExteriorEdge,
            ...(glazedAreaM2 !== undefined ? { glazedAreaM2 } : {}),
        });
    }

    return out;
}
