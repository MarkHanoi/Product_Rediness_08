// §ROOMS-ON-THE-VIEWS (lane DRAW-ON-VIEWS, 2026-09-07 · L-13046 · STR §26.6.4) — THE ONE READ of a
// room's detected outline, for the three surfaces that draw a `room:<id>` highlight.
//
// Founder, on the rooms-per-level list he asked for the day before:
//   > "THAT SHOULD BE THERE — AND SHALL RENDER ON THE VIEWS."
//
// ── WHY THIS FILE EXISTS, AND WHY IT IS NOT THREE COPIES ────────────────────────────────────
// Three renderers answer the `room-outline` cue — `ParcelBoundarySceneRenderer` (BIM 3D),
// `CesiumViewport` (3D Site) and `SiteBoundaryMap2D` (2D Site Map). Each of them would otherwise
// have had to know four separate things: which store holds rooms, that a room's footprint is
// `boundary.polygon` and not `polygon`, that the frame is world XZ metres with an OPEN ring, and
// that a room's height is `level.elevation + boundary.baseOffset` and lives on a DIFFERENT object.
// Three copies of that is three chances for one of them to light a different shape than the other
// two — the C84 EI-9 defect this repo keeps paying for. `boundingBoxRingXZ` set the precedent one
// commit earlier: the cue's geometry has ONE producer and the renderers only project it.
//
// ── WHERE THE GEOMETRY ACTUALLY COMES FROM, WITH ITS LINES ──────────────────────────────────
// `RoomData.boundary.polygon` — `packages/room-topology/src/RoomTypes.ts:158-181`, declared as a
// *"Closed CCW polygon in world XZ coordinates. Last vertex implicitly connects to first. Min 3
// vertices."* `RoomVertex` is `{ x, z }` (`RoomTypes.ts:93-97`), metres, Y-up. The winding is
// normalised on every write (`RoomStore.ts:229`), the ring is NOT repeated at the end, and the
// schema enforces ≥ 3 vertices (`RoomDataSchema.ts:65`). `RoomStore.getAll()` returns DEEP CLONES
// (`RoomStore.ts:432` → `cloneRoomData`, `:84-113`), so a reader cannot mutate the store by
// holding one, and the read is a synchronous in-memory `Map` walk — no promise, no lazy compute.
//
// ⚠ IT IS THE SAME FRAME THE PARCEL RING AND THE ENVELOPE ARE IN. Room polygons are built from
// WallGraph node positions (`RoomDetectionEngine.ts:457-462`) in the scene's world XZ, which is
// the frame `BuildableEnvelope.insetPolygon` and the committed C19 ring already live in — which is
// why the two site views can project a room through the SAME `sceneXZ → WGS84` read they already
// use for the parcel. No second projection is minted here.
//
// ── ⛔ FAILURE AND EMPTINESS ARE DIFFERENT VALUES, AND THIS FILE KEEPS THEM APART ────────────
// `roomOutlineVertexCount` returns `null` when the record carries NO polygon array at all — a room
// declared in the programme before any wall encloses it — and a NUMBER (including 0, 1, 2) when it
// carries one that is not a polygon. `describeRoomHighlightAvailability` prints a different
// sentence for each, and pre-defaulting the first to `0` would turn *"nothing has detected this
// room yet"* into *"PRYZM looked and found a degenerate shape"* — a far more alarming claim about
// the user's model, made by a `??`. (§CONTEXT-DATA-HONESTY.)
//
// The elevation half is the same rule one field further out: `worldY` is `null` when the storey's
// elevation could not be READ, never 0. A room outline drawn at ground level because the level
// lookup failed looks exactly like a ground-floor room — the §L-446 ambiguity, in geometry.
//
// P4 — no `(window as any)`; the two legacy globals are reached through ONE structural cast each,
// the same narrowing `roomsPerLevelSection.ts` and `roomProgrammePanel.ts` already perform.
// P6 — reads only. This module writes no store and dispatches nothing.

import { trace } from '@opentelemetry/api';

const _tracer = trace.getTracer('pryzm.site.roomOutlineSource');

/** A point on the scene ground plane, metres. Matches C19 `Pt` and `RoomVertex` alike. */
export interface RoomOutlinePoint {
    readonly x: number;
    readonly z: number;
}

/** One room's outline, as much as could be READ of it. */
export interface RoomOutline {
    readonly id: string;
    /** The user's word for the room, or `null` when the record carries none. */
    readonly name: string | null;
    /** World-XZ metres, OPEN ring (the closing segment is implicit), ≥ 3 vertices. */
    readonly ring: readonly RoomOutlinePoint[];
    readonly levelId: string | null;
    /** `boundary.baseOffset` — the raised-floor offset from the storey's elevation. 0 when absent. */
    readonly baseOffsetM: number;
    /** `boundary.height` — clear height, metres. `null` when the record carries none. */
    readonly heightM: number | null;
    /**
     * ⛔ `level.elevation + baseOffset`, or `null` WHEN THE STOREY'S ELEVATION COULD NOT BE READ.
     * Never 0 for "unknown": a renderer that draws at 0 because the lookup failed puts a first-floor
     * room on the ground, and the picture gives the reader no way to tell. A surface that receives
     * `null` must say so rather than pick a height.
     */
    readonly worldY: number | null;
}

/** A room record, structurally — every field optional, because the store is reached by key. */
interface RoomRecordLike {
    readonly id?: unknown;
    readonly name?: unknown;
    readonly levelId?: unknown;
    readonly boundary?: {
        readonly polygon?: unknown;
        readonly height?: unknown;
        readonly baseOffset?: unknown;
    } | undefined;
}

function finite(v: unknown): number | null {
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * ⭐ THE VERTEX COUNT OF A ROOM'S OUTLINE, or `null` when the record carries no polygon ARRAY.
 *
 * ⛔ THE `null` IS THE POINT — see the header. `null` means *"nothing has recorded an outline for
 * this room"*; a number means *"an outline was recorded and it has this many vertices"*, and `0`,
 * `1` and `2` are all real, all different from `null`, and all un-drawable for a reason the row
 * prints. Pure; total; never throws.
 */
export function roomOutlineVertexCount(record: unknown): number | null {
    if (record === null || typeof record !== 'object') return null;
    const poly = (record as RoomRecordLike).boundary?.polygon;
    return Array.isArray(poly) ? poly.length : null;
}

/**
 * Read ONE room's outline out of a set of records already in hand. PURE — no store, no window, no
 * clock. `null` when no record carries that id, or when the outline is not a drawable polygon.
 *
 * @param records      the room records, as `RoomStore.getAll()` returns them
 * @param roomId       the room's own `RoomData.id`
 * @param levelWorldY  storey id → the storey's ELEVATION in metres, or `null` when it could not be
 *                     read. Injected so this function stays pure and so the two callers cannot
 *                     resolve a storey two different ways.
 */
export function readRoomOutlineFrom(
    records: readonly unknown[],
    roomId: string,
    levelWorldY: (levelId: string) => number | null,
): RoomOutline | null {
    const span = _tracer.startSpan('pryzm.site.readRoomOutlineFrom');
    try {
        for (const raw of records) {
            if (raw === null || typeof raw !== 'object') continue;
            const rec = raw as RoomRecordLike;
            if (typeof rec.id !== 'string' || rec.id !== roomId) continue;

            const poly = rec.boundary?.polygon;
            if (!Array.isArray(poly) || poly.length < 3) {
                // The record exists and its outline is not drawable. Distinguished from "no such
                // room" by the caller only in its logging; both draw nothing, which is the honest
                // answer either way.
                span.setAttribute('pryzm.roomOutline.found', true);
                span.setAttribute('pryzm.roomOutline.drawable', false);
                return null;
            }
            const ring: RoomOutlinePoint[] = [];
            for (const p of poly) {
                if (p === null || typeof p !== 'object') continue;
                const x = finite((p as { x?: unknown }).x);
                const z = finite((p as { z?: unknown }).z);
                // ⛔ A NON-FINITE VERTEX DROPS THE WHOLE RING, never just itself: silently skipping
                // one corner returns a DIFFERENT polygon that still looks like a room, which is the
                // one failure a reader could not possibly detect.
                if (x === null || z === null) {
                    span.setAttribute('pryzm.roomOutline.drawable', false);
                    return null;
                }
                ring.push({ x, z });
            }
            if (ring.length < 3) {
                span.setAttribute('pryzm.roomOutline.drawable', false);
                return null;
            }

            const levelId = typeof rec.levelId === 'string' && rec.levelId.length > 0 ? rec.levelId : null;
            const baseOffsetM = finite(rec.boundary?.baseOffset) ?? 0;
            const elevation = levelId === null ? null : levelWorldY(levelId);
            span.setAttribute('pryzm.roomOutline.drawable', true);
            span.setAttribute('pryzm.roomOutline.vertices', ring.length);
            return Object.freeze({
                id: rec.id,
                name: typeof rec.name === 'string' && rec.name.trim().length > 0 ? rec.name.trim() : null,
                ring: Object.freeze(ring),
                levelId,
                baseOffsetM,
                heightM: finite(rec.boundary?.height),
                worldY: elevation === null ? null : elevation + baseOffsetM,
            });
        }
        span.setAttribute('pryzm.roomOutline.found', false);
        return null;
    } finally {
        span.end();
    }
}

/** Structural over `PryzmRuntime`: only `stores` is read, and only by key. */
export interface RoomOutlineRuntimeLike {
    readonly stores?: unknown;
}

type RoomStoreLike = { getAll?: () => unknown };
type BimManagerLike = { getLevelById?: (id: string) => { elevation?: unknown } | null | undefined };

/**
 * ⭐ THE ONE LIVE READ — resolve a `room:<id>` subject to a drawable outline, or `null`.
 *
 * The store route is exactly the one every other room consumer in `apps/editor` already takes
 * (`runtime.stores['room']`, else the legacy `window.roomStore` — the SAME module singleton, wired
 * at `composeRuntime.ts:1665` and `initBuilders.ts:467`), so this surface cannot disagree with the
 * rooms-per-level list about which rooms exist. Never throws; every read is guarded, and a read
 * that fails returns `null` rather than a half-populated outline.
 *
 * ⚠ THE STOREY ELEVATION IS A SEPARATE READ AND MAY LEGITIMATELY FAIL. `bimManager` is a legacy
 * global and is absent in a session where no BIM scene ever initialised; the outline still resolves,
 * with `worldY: null`, and the renderer says what it did about the height rather than guessing.
 */
export function resolveRoomOutline(
    runtime: RoomOutlineRuntimeLike | null | undefined,
    roomId: string,
): RoomOutline | null {
    const span = _tracer.startSpan('pryzm.site.resolveRoomOutline');
    try {
        const w = (typeof window !== 'undefined' ? window : {}) as unknown as {
            roomStore?: RoomStoreLike;
            bimManager?: BimManagerLike;
        };
        const stores = runtime?.stores;
        const fromRuntime = (stores && typeof stores === 'object')
            ? (stores as Record<string, unknown>)['room'] as RoomStoreLike | undefined
            : undefined;
        const store = (fromRuntime && typeof fromRuntime.getAll === 'function')
            ? fromRuntime
            : (w.roomStore && typeof w.roomStore.getAll === 'function' ? w.roomStore : null);
        if (!store || typeof store.getAll !== 'function') {
            span.setAttribute('pryzm.roomOutline.storeReadable', false);
            return null;
        }
        let all: unknown;
        try { all = store.getAll(); } catch { return null; }
        const records: readonly unknown[] = Array.isArray(all)
            ? all
            : (all instanceof Map ? [...all.values()] : []);
        span.setAttribute('pryzm.roomOutline.storeReadable', true);
        span.setAttribute('pryzm.roomOutline.records', records.length);

        // The SAME recipe `RoomBoundaryBuilder._resolveWorldY` uses (`RoomBoundaryBuilder.ts:186`),
        // read through a structural narrowing rather than a cast through `any` (P4).
        const levelWorldY = (levelId: string): number | null => {
            try {
                const lvl = w.bimManager?.getLevelById?.(levelId);
                return finite(lvl?.elevation);
            } catch {
                return null;
            }
        };
        return readRoomOutlineFrom(records, roomId, levelWorldY);
    } catch (e) {
        console.warn('[site][room-outline] §ROOMS-ON-THE-VIEWS read failed (non-fatal):', e);
        return null;
    } finally {
        span.end();
    }
}
