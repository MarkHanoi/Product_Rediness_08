// Apartment-layout VALIDATOR ADAPTER — D-TGL DTO → ApartmentLayoutForValidation.
//
// The D-TGL deterministic engine (and the AI relay path) produce a room/edge
// DTO that doesn't match the orchestrator's `ApartmentLayoutForValidation`
// shape one-for-one: the engine emits `{ rect: { w, h } }` per room and
// `{ aId, bId }` edges (or the bubbleGraph's `{ a, b, via }` shape) while the
// orchestrator wants the SUPERSET `ApartmentLayoutRoom` (9 fields) plus the
// topology-namespace `AdjacencyEdge` (`{ aId, bId }`).
//
// This adapter is the SINGLE conversion site. It is PURE (no I/O, no closures
// over mutable state, no THREE/DOM/async), takes a POJO DTO, returns a frozen
// POJO that the orchestrator + every per-validator can consume directly.
//
// DEFAULTS — one field still defaults, three no longer do.
//
//   • `longestUsableWallM` defaults to `max(widthM, lengthM)` — the wall is
//     assumed FULLY usable until an opening-aware upstream slice computes the
//     real value. CONSERVATIVE for G-5 (no spurious failures); UNSOUND when
//     the room has windows / doors on its longest wall (slight over-report).
//
// ⚠ **Corrected 2026-08-14 (§L-909(b)) — THE 0/false DEFAULTS ARE GONE.**
// This header used to say `externalFrontageM` defaults to `0`, `glazedAreaM2`
// defaults to `0`, and `hasExteriorEdge` is derived from `frontage > 0`, and
// called that "CONSERVATIVE … the correct surface for missing geometry data".
// **It was not.** The founder's generated apartment carried 9 emitted windows
// and `windowCount = 1` on every habitable room, yet the report printed
// *"external frontage 0.00 m"*, *"glazed-to-floor ratio 0.000"* and
// *"no exterior edge"* ×5 — 15 of its 19 errors were minted HERE, out of
// values nobody ever measured. `not measured` and `measured: zero` were the
// same value; that is the context-data-honesty defect, forbidden by C78 §1.4,
// C70 L-INV-1 and C75 §1.4.
//
//   • `externalFrontageM`, `glazedAreaM2`, `hasExteriorEdge` now pass through
//     as `undefined` when the DTO omits them AND no explicit `AdapterOptions`
//     default is supplied. `undefined` means NOT MEASURED; G-7 / G-10 / A-7
//     then SKIP and record a `NotMeasuredNote` (C83 §5.2.1/§5.3) which the
//     report renders as *"frontage not measured by this report"*.
//   • `hasExteriorEdge` is still DERIVED from `externalFrontageM > 0` **when
//     the frontage was measured** — so no caller can produce "0 m frontage
//     but exterior=true". When frontage is NOT measured, the flag is NOT
//     measured either; it is never silently `false`.
//   • The `AdapterOptions` defaults remain, but they are now OPT-IN: passing
//     `defaultExternalFrontageM: 0` is an explicit caller assertion that zero
//     was MEASURED, and G-7 will fire on it. Do not pass them to mean "unknown".
//
// SCOPE — this slice ships the ADAPTER ONLY. The wire-in from the live AI
// generation path (`generate.ts` / `runDeterministicLayout.ts`) is a future
// slice; this adapter is a standalone utility callable by any consumer.

import type { AdjacencyEdge } from './topology/types.js';
import type {
    ApartmentLayoutForValidation,
    ApartmentLayoutRoom,
} from './orchestrator-types.js';

// ── Source DTO shape ─────────────────────────────────────────────────────────
//
// The "lowest common denominator" of what every engine path produces today:
//   • `runDeterministicLayout` returns `RoomPlacement[]` (`{ roomId, rect }`)
//     + the BubbleGraph (with `rooms: ProgramRoom[]` and `edges: { a, b, via }`).
//   • The AI relay returns a hand-built array of `{ id, type, rect }` rooms
//     plus an edges array.
// Both can be projected into the shape below at their respective call sites;
// keeping the adapter's source shape FLAT (one record per room with everything
// it knows on it) decouples the adapter from the engine's internal types.

/** The DTO this adapter accepts — the LCD of every upstream room producer. */
export interface DtglLayoutDto {
    readonly rooms: ReadonlyArray<DtglLayoutRoom>;
    /** Realised adjacencies. Optional — defaults to `[]`. */
    readonly edges?: ReadonlyArray<DtglLayoutEdge>;
    /** ID of the apartment's entrance room (entrance_hall / hall / etc.). */
    readonly entranceRoomId?: string;
}

/** One room in the source DTO. Every geometry-derived field is OPTIONAL — the
 *  adapter falls back to `rect.w * rect.h` for area and to the documented
 *  conservative defaults for the validator-only inputs. */
export interface DtglLayoutRoom {
    readonly id: string;
    readonly type: string;
    /** Plan rect in metres. `x` / `y` are optional (the adapter only reads
     *  `w` and `h`). */
    readonly rect?: {
        readonly w: number;
        readonly h: number;
        readonly x?: number;
        readonly y?: number;
    };
    /** Pre-computed area (m²) — wins over `rect.w * rect.h` when present. */
    readonly areaM2?: number;
    /** Pre-computed shorter dimension (m). Falls back to `min(rect.w, rect.h)`. */
    readonly widthM?: number;
    /** Pre-computed longer dimension (m). Falls back to `max(rect.w, rect.h)`. */
    readonly lengthM?: number;
    /** Pre-computed longest unbroken wall (m). Falls back to
     *  `defaultLongestUsableWallM` (see options) or `max(widthM, lengthM)`. */
    readonly longestUsableWallM?: number;
    /** MEASURED external-frontage length (m). Falls back to
     *  `defaultExternalFrontageM` when the caller supplies one; otherwise
     *  stays `undefined` = **NOT MEASURED** (§L-909(b)). Never emit `0` to
     *  mean "we could not measure this". */
    readonly externalFrontageM?: number;
    /** MEASURED exterior-edge flag. When omitted, DERIVED from
     *  `externalFrontageM > 0` **if frontage was measured**; otherwise stays
     *  `undefined` = NOT MEASURED. Never emit `false` to mean "unknown". */
    readonly hasExteriorEdge?: boolean;
    /** MEASURED glazed area (m²). Falls back to `defaultGlazedAreaM2` when
     *  the caller supplies one; otherwise stays `undefined` = NOT MEASURED. */
    readonly glazedAreaM2?: number;
}

/** One realised adjacency in the source DTO. Field names mirror the bubble-
 *  graph convention (`aId` / `bId`) so the adapter doesn't have to know about
 *  the bubbleGraph's `{a, b, via}` shape — that translation is the caller's
 *  responsibility (one `.map(e => ({ aId: e.a, bId: e.b }))`). */
export interface DtglLayoutEdge {
    readonly aId: string;
    readonly bId: string;
}

// ── Adapter options ──────────────────────────────────────────────────────────

/** Optional overrides for the conservative defaults documented in the file
 *  header. Tests use them to inject specific values; production callers can
 *  leave the object empty and rely on the defaults. */
export interface AdapterOptions {
    /** Default for `externalFrontageM` when the room omits it. When itself
     *  omitted the field stays **NOT MEASURED** (§L-909(b)) — there is no
     *  implicit `0`. */
    readonly defaultExternalFrontageM?: number;
    /** Default for `glazedAreaM2` when the room omits it. When itself omitted
     *  the field stays **NOT MEASURED** — there is no implicit `0`. */
    readonly defaultGlazedAreaM2?: number;
    /** Default for `longestUsableWallM` when the room omits it. When
     *  `undefined`, the adapter uses `max(widthM, lengthM)` (the conservative
     *  "wall is fully usable" assumption). */
    readonly defaultLongestUsableWallM?: number;
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

/** Returns the value when it's a finite, non-negative number; `undefined`
 *  otherwise. Keeps `??`-chain readability in `toRoom`. */
function num(v: unknown): number | undefined {
    return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined;
}

/** Project one source room into the orchestrator's `ApartmentLayoutRoom`. */
function toRoom(src: DtglLayoutRoom, opts: AdapterOptions): ApartmentLayoutRoom {
    const rectW = num(src.rect?.w) ?? 0;
    const rectH = num(src.rect?.h) ?? 0;

    // areaM2 — honour explicit field, else rect.w * rect.h.
    const areaM2 = num(src.areaM2) ?? rectW * rectH;

    // width / length — honour explicit fields, else min/max of the rect dims.
    const widthM = num(src.widthM) ?? Math.min(rectW, rectH);
    const lengthM = num(src.lengthM) ?? Math.max(rectW, rectH);

    // longestUsableWallM — honour explicit field, else opts default, else
    // max(widthM, lengthM) (the conservative "no openings" assumption).
    const longestUsableWallM = num(src.longestUsableWallM)
        ?? num(opts.defaultLongestUsableWallM)
        ?? Math.max(widthM, lengthM);

    // §L-909(b) — externalFrontageM: explicit field, else an EXPLICIT opts
    // default, else NOT MEASURED. No `?? 0` — that was the defect.
    const externalFrontageM = num(src.externalFrontageM)
        ?? num(opts.defaultExternalFrontageM);

    // hasExteriorEdge — honour explicit field; else DERIVE from frontage > 0
    // ONLY when frontage was measured. Unmeasured frontage ⇒ unmeasured flag.
    const hasExteriorEdge = typeof src.hasExteriorEdge === 'boolean'
        ? src.hasExteriorEdge
        : externalFrontageM !== undefined
            ? externalFrontageM > 0
            : undefined;

    // §L-909(b) — glazedAreaM2: explicit field, else an EXPLICIT opts default,
    // else NOT MEASURED.
    const glazedAreaM2 = num(src.glazedAreaM2)
        ?? num(opts.defaultGlazedAreaM2);

    // Absent measurements are OMITTED rather than written as `undefined` keys,
    // so `'externalFrontageM' in room` is a truthful "was this measured?" test.
    return Object.freeze({
        id: src.id,
        type: src.type,
        areaM2,
        widthM,
        lengthM,
        longestUsableWallM,
        ...(externalFrontageM !== undefined ? { externalFrontageM } : {}),
        ...(hasExteriorEdge !== undefined ? { hasExteriorEdge } : {}),
        ...(glazedAreaM2 !== undefined ? { glazedAreaM2 } : {}),
    });
}

/** Project one source edge into the orchestrator's `AdjacencyEdge`. The
 *  adapter only carries `aId` + `bId` — the bubbleGraph's `via` discriminator
 *  is intentionally dropped (the orchestrator's topology validators treat
 *  every edge as a realised adjacency regardless of door vs open). */
function toEdge(src: DtglLayoutEdge): AdjacencyEdge {
    return Object.freeze({ aId: src.aId, bId: src.bId });
}

// ── Public entry point ───────────────────────────────────────────────────────

/**
 * Convert a D-TGL-style layout DTO into the `ApartmentLayoutForValidation`
 * shape consumed by `validateApartmentLayout`. PURE — no I/O, no async, no
 * mutation of the input. Output is fully frozen (object + arrays + per-room
 * + per-edge), so callers can pass the result around without defensive
 * cloning.
 *
 * Defaults for the geometry-derived fields the engine doesn't yet compute are
 * documented in this file's header — short version (§L-909(b)): missing
 * daylight data ⇒ the field is ABSENT and the rule reports NOT MEASURED.
 * It is neither a silent pass nor a fabricated failure.
 */
export function toValidationInput(
    dto: DtglLayoutDto,
    opts: AdapterOptions = {},
): ApartmentLayoutForValidation {
    const rooms = Object.freeze(dto.rooms.map(r => toRoom(r, opts)));
    const edges = Object.freeze((dto.edges ?? []).map(toEdge));
    const out: ApartmentLayoutForValidation = dto.entranceRoomId !== undefined
        ? { rooms, edges, entranceRoomId: dto.entranceRoomId }
        : { rooms, edges };
    return Object.freeze(out);
}
