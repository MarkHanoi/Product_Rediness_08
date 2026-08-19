/**
 * CreateFloorsByRoomTypeCommand — SPEC-SEMANTIC §10 prompt #34.
 *
 * "Floor finish by room type": for every room on a level, read its semantic
 * `occupancyType`, map it to a floor-finish category (timber for living/bedroom,
 * tile for kitchen/bathroom), and create a floor in the room's boundary with the
 * matching finish system type.
 *
 * This is the FIRST *consuming* semantic command — it reads the canonical room
 * semantic state (`room.occupancyType`, set by Auto-Organise / `SET_ROOM_OCCUPANCY`)
 * and composes the existing `CreateFloorCommand`. Per C16/C17:
 *   - level-oriented: scoped to one level; each floor inherits that level (CA-4).
 *   - semantic-first: it consumes the semantic record, never the THREE scene (C16 §7).
 *   - batch: wrapped in `batchCoordinator.runBatch` — one undo unit (C16 §8 / CA-12).
 *
 * Coordinate convention: `RoomVertex` and `FloorVertex` are BOTH `{x, z}` (world
 * X-Z) — no axis remap (avoids the C11 §11.4 SLAB-BOUNDARY-CONVENTION footgun).
 */

import {
    Command,
    CommandType,
    CommandValidationResult,
    CommandResult,
    SerializedCommand,
    CommandContext,
} from '../types';
import { CreateFloorCommand } from './CreateFloorCommand';
import { pointInPolygonXZ } from '@pryzm/geometry-kernel';
import { batchCoordinator, type FloorServiceHole } from '@pryzm/core-app-model';
import { buildPerRoomBoundaryElements, roomsOnLevel, roomsWithBoundary, type PerRoomCtx } from '../rooms/perRoomBoundary';
import { floorFinishFor, defaultFloorFinish } from './floorFinish';
import { resolveRoomFinishBoundary } from '@pryzm/room-topology';

/** occupancyType → finish category. #34: timber in living/bedroom, tile in kitchen/bathroom.
 *  §FLOOR-FINISH-COVERAGE (founder 2026-06-15, "floor finishes") — the sets key on the
 *  room's OCCUPANCY string. Three common occupancies were missing → those rooms got NO
 *  floor (the filter at `typed` drops null-category rooms), shipping a bare slab:
 *    • `entrance-lobby` (the entrance HALL) and `corridor` — every generated house has
 *      circulation that was left unfinished; mapped to TIMBER so the floor reads continuous
 *      with the living/bedroom spaces it connects.
 *    • `private-office` — the STUDY's actual occupancy (the rule is `occupancy:'private-office'`);
 *      the set had the TYPE name `'study'`, which a detected room never carries, so studies
 *      (and any study-typed residual fill) shipped floorless. Fixed by keying on the occupancy.
 *  `stair` stays unmapped on purpose (its slab is the stairwell void, never a finish). */
const TIMBER_TYPES = new Set([
    'living-room', 'bedroom', 'dining-room', 'hotel-bedroom', 'study',
    'private-office', 'entrance-lobby', 'corridor',
]);
const TILE_TYPES = new Set([
    'kitchen', 'kitchen-shared', 'bathroom', 'wc', 'accessible-wc', 'shower-room', 'utility-room',
    'storage',
]);
/** §RESI-CORRIDOR-FINISH-NO-DOUBLE (founder 2026-06-25, "the public corridor should be a single
 *  floor finish") — the multi-family residential pipeline lays its PUBLIC circulation (corridor
 *  runs + spine + core lobby) as ONE merged-union finish (§RESI-CORRIDOR-FINISH-CONTINUOUS-FIX2),
 *  so the per-room pass must NOT also floor the detected corridor sub-rooms — that double-coats the
 *  cross with seamed timber patches over the single vinyl surface. The `skipCirculation` option
 *  (passed only by the resi pipeline) drops these circulation occupancies from this pass. The house
 *  + apartment pipelines pass nothing and keep flooring corridors as timber (no merged pass there). */
const CIRCULATION_TYPES = new Set(['corridor', 'entrance-lobby']);

/**
 * §FLOOR-DEFAULT-UNTYPED (founder-reported, 2026-08-18) — room type chooses
 * WHICH finish; it does not gate WHETHER a floor may exist.
 *
 * THE REPORT. A project with exactly ONE room — detected, with a boundary, but
 * never tagged (`RoomTagAutoPopulator` produced 0 tags for 1 live room) — asked
 * the chat for a floor finish and got `canExecute` → "No rooms with a
 * floor-mappable type — run Auto-Organise (tag rooms) first." Requiring a room
 * to be classified as a *kitchen* before it may have ANY floor answers a
 * different question from the one the user asked. An untyped room has an
 * obvious honest answer: give it the default finish and SAY which one.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO. It does not default rooms whose type is
 * KNOWN and deliberately unmapped. Those exclusions are decisions, not gaps:
 *   • `stair` — its slab IS the stairwell void; a finish there would cover the
 *     hole the stair punched (see `_finishCategory`).
 *   • `corridor` / `entrance-lobby` under `skipCirculation` — the resi pipeline
 *     lays those as ONE merged surface (§RESI-CORRIDOR-FINISH-NO-DOUBLE), and
 *     defaulting them would re-introduce exactly the double-coating that option
 *     exists to prevent.
 * Only the absence of a type is treated as "choose for me".
 */
const DEFAULT_UNTYPED_CATEGORY = 'timber' as const;

/**
 * §FLOOR-REFUSAL-IS-FALSE (L-1014) — the room store's OWN word for "no type stated".
 *
 * §FLOOR-DEFAULT-UNTYPED above got the rule right and the test for it wrong: it
 * detected "untyped" as `!occ`, i.e. `undefined` or `''`. The room store emits
 * NEITHER. `RoomDetectionEngine` stamps every detected room
 * `occupancyType: 'unclassified'` and `roomFromGraphSpec` coerces anything
 * unrecognised to the same token — it is the last member of `RoomOccupancyType`,
 * sitting under that union's own `── Default ──` heading. So the founder's single
 * detected, untagged room took the TYPED branch, matched no finish set, and was
 * refused with a sentence telling him it was a stairwell.
 *
 * An untyped room is a GAP. A stairwell is a DECISION. They had the same value.
 */
const UNTYPED_TOKENS: ReadonlySet<string> = new Set(['unclassified', 'unknown', 'undefined', 'none']);

/**
 * §FLOOR-REFUSAL-IS-FALSE (L-1014) — the DELIBERATE exclusions, named.
 *
 * Previously nothing was named: a type was excluded iff it happened to be absent
 * from both `TIMBER_TYPES` and `TILE_TYPES`. That made the exclusion set the
 * complement of two incomplete lookup tables, so `classroom`, `patient-room`,
 * `warehouse`, `restaurant`, `open-office` and roughly thirty other canonical
 * occupancies were "excluded" by omission and told they were stairwells.
 *
 * "Type chooses WHICH finish, not WHETHER one may exist" means an unmapped-but-
 * KNOWN type takes the default, exactly like an untyped one. Only these refuse,
 * and each is a decision with a reason:
 *   • stairwell/stair — its slab IS the stair void; a finish covers the hole.
 *   • corridor / entrance-lobby, UNDER `skipCirculation` only — the resi pipeline
 *     lays those as one merged surface (§RESI-CORRIDOR-FINISH-NO-DOUBLE).
 * Adding to this set is a design decision and must be argued in the diff.
 */
const EXCLUDED_TYPES: ReadonlySet<string> = new Set(['stairwell', 'stair']);

/** The finish a room gets, and whether the room's OWN type chose it. */
type FinishPlan = {
    readonly category: 'timber' | 'tile-stone';
    /** True when the room's own type did NOT choose the finish. */
    readonly defaulted: boolean;
    /**
     * §FLOOR-REFUSAL-IS-FALSE (L-1014) — WHY the default was taken. `null` when
     * the room's own type chose the finish.
     *
     * Two distinct facts used to share the single `defaulted: true` value, and
     * the user-facing note asserted the first of them for both:
     *   • 'untyped'  — the room states no type. "Tag the room" is real advice.
     *   • 'unmapped' — the room IS tagged (classroom, warehouse, …) and this
     *                  command's finish table simply has no opinion about it.
     *                  Telling that user their room "had no room type set" is
     *                  FALSE, and telling them to run Auto-Organise is advice
     *                  that cannot help, because the room is already classified.
     */
    readonly defaultReason: 'untyped' | 'unmapped' | null;
};

/**
 * §FLOOR-DIAG-FLOOD-GATE (2026-06-30) — the per-room `[floor §DIAG] …` line and the
 * big "Created N floor(s) by room type …" info string used to be ALWAYS-ON. On a
 * 5-storey resi building this command runs per level × ~15 rooms/level, each push
 * building an interpolated `_roomTag(room)` string, then the whole `_diag` array is
 * BOTH logged line-by-line AND spread into the command `info` — hundreds of strings
 * built + concatenated on the main thread during open. Gate the EXPENSIVE string
 * construction (not just the console.* call) behind `__pryzmLayoutDiag` / the legacy
 * `__pryzmFloorDiag` (default OFF in prod; either flag restores every §DIAG line).
 * Mirrors the `__pryzmLayoutDiag` pattern used across the apartment-layout workflows
 * and §LOAD-FLOOD-GATE / ADR-060. A cheap boolean read; callers MUST consult it
 * before building any §DIAG string so the message is never even constructed when off.
 */
function floorDiagOn(): boolean {
    const g = globalThis as unknown as {
        __pryzmLayoutDiag?: boolean;
        __pryzmFloorDiag?: boolean;
    };
    return g.__pryzmLayoutDiag === true || g.__pryzmFloorDiag === true;
}

/** §FLOOR-INNER-FACE — minimal read-only view of a wall the inset resolver needs:
 *  its centreline endpoints, thickness, and door/window openings. Mirrors the
 *  WallData shape without importing the full type (avoids a heavier coupling). */
interface WallLike {
    baseLine?: ReadonlyArray<{ x: number; z: number }>;
    thickness: number;
    openings?: ReadonlyArray<{ type: 'door' | 'window'; offset: number; width: number }>;
}

/** §A.21.D29 #1 — a stairwell void to cut from the floor finish of the room that
 *  hosts it (world-XZ polygon, same frame as the room/floor boundary). */
export interface FloorVoid {
    /** Footprint polygon in world X-Z (matches the slab opening / stair footprint). */
    readonly polygon: ReadonlyArray<{ x: number; z: number }>;
}

export class CreateFloorsByRoomTypeCommand implements Command {
    readonly affectedStores = ['floor'] as const;
    readonly id: string;
    readonly type = CommandType.CREATE_FLOORS_BY_ROOM_TYPE;
    readonly timestamp: number;
    targetIds: string[] = [];
    private createdCommands: CreateFloorCommand[] = [];

    /** @param style — brief style chip (modern/classic/minimal/warm) so each floor
     *  gets a realistic, style-appropriate finish (§A.21.D-FLOOR). Optional; absent
     *  → 'modern'.
     *  @param voids — §A.21.D29 #1 stairwell voids on THIS level (world-XZ polygons).
     *  A floor whose room boundary contains a void's centroid gets that void cut as a
     *  `polygon` service-hole, so the upper-storey finish stays open over the stair —
     *  matching the slab void the stair already punched. Empty / omitted on the
     *  apartment + single-storey paths (no stairs), so behaviour is unchanged. */
    constructor(
        private levelId: string,
        private style?: string,
        private voids?: ReadonlyArray<FloorVoid>,
        /** §RESI-CORRIDOR-FINISH-NO-DOUBLE — when set, corridor / entrance-lobby rooms are NOT
         *  floored by this per-room pass (the resi pipeline floors them as one merged surface). */
        private options?: { readonly skipCirculation?: boolean },
    ) {
        this.id = `cmd-floors-by-room-${Date.now()}`;
        this.timestamp = Date.now();
    }

    canExecute(context: CommandContext): CommandValidationResult {
        if (!context.stores.roomStore) return { ok: false, reason: 'Room store not available.' };
        const rooms = roomsWithBoundary(context, this.levelId);
        if (rooms.length === 0) {
            return { ok: false, reason: `No rooms with a boundary on this level — detect rooms first.` };
        }
        // §FLOOR-DEFAULT-UNTYPED — was `_finishCategory(...) !== null`, which
        // refused a level whose rooms were merely UNTAGGED. An untyped room is
        // now floorable (with the named default), so the only rooms left out are
        // the ones whose type is a deliberate exclusion.
        const floorable = rooms.filter(r => this._finishPlan(r.occupancyType) !== null);
        if (floorable.length === 0) {
            // §FLOOR-REFUSAL-IS-FALSE (L-1014) — SAY WHAT IS ACTUALLY THERE.
            // This sentence used to assert "a stairwell, or circulation…" as a
            // guess, and it was wrong about the founder's model: his one room was
            // untagged, not a stairwell. Now that the only rooms that can reach
            // here are the NAMED exclusions, the refusal can name them — and if it
            // ever cannot, that is a bug in this command, and it says so rather
            // than inventing a cause.
            const counts = new Map<string, number>();
            for (const r of rooms) {
                const t = CreateFloorsByRoomTypeCommand._norm(r.occupancyType) || '(untyped)';
                counts.set(t, (counts.get(t) ?? 0) + 1);
            }
            const found = [...counts.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([t, n]) => `${n} × ${t}`)
                .join(', ');
            return {
                ok: false,
                reason:
                    `Every room on this level has a type that is deliberately excluded from ` +
                    `floor finishes — found ${found}. A stairwell's slab is the stair void ` +
                    `(a finish would cover the hole); circulation is laid as one merged ` +
                    `surface when this pipeline owns it. Re-tag a room, or floor it directly.`,
            };
        }
        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        if (!context.stores.roomStore) return { success: false, affectedElementIds: [] };
        this._diag = []; // reset so redo doesn't accumulate stale §DIAG lines.
        this._defaultedRooms = 0; // §FLOOR-DEFAULT-UNTYPED — same reset discipline.
        this._untypedRooms = 0;
        this._unmappedRooms = 0;
        const floorStore = context.stores.floorStore as unknown as { getAll?: () => Array<{ hostRoomId?: string }> } | undefined;
        const finishStore = (context.stores as any).floorSystemTypeStore;
        const affectedIds: string[] = [];

        // occupancyType → floor finish; skip rooms with no mapping or an existing host floor.
        const factory = (room: PerRoomCtx): CreateFloorCommand | null => {
            const plan = this._finishPlan(room.occupancyType);
            if (!plan) return null;
            const category = plan.category;
            if (floorStore?.getAll && floorStore.getAll().some(f => f.hostRoomId === room.id)) return null;
            if (plan.defaultReason === 'untyped') this._untypedRooms++;
            else if (plan.defaultReason === 'unmapped') this._unmappedRooms++;
            if (plan.defaulted) this._defaultedRooms++;
            // §A.21.D-FLOOR — realistic, style-aware finish (wood plank / porcelain
            // tile colour + pattern + material name) instead of the flat `#D4C4A8`
            // fallback. Rooms in the auto-pipeline carry no explicit floor finish, so
            // this is what the user sees. CreateFloorCommand spreads finishSpec over
            // its default, so a believable finish always lands.
            // §FLOOR-DEFAULT-UNTYPED — an untyped room takes the style's own
            // timber rather than `floorFinishFor`'s null (which would fall
            // through to CreateFloorCommand's flat `#D4C4A8`). A defaulted floor
            // must still LOOK like a floor; what makes it honest is that the
            // result SAYS it was a default, not that it looks unfinished.
            const finish = plan.defaulted
                ? defaultFloorFinish(this.style)
                : floorFinishFor(room.occupancyType, this.style);
            // §FLOOR-INNER-FACE (2026-06-10) — the room boundary runs along the wall
            // CENTRELINES (the planar face-tracer walks wall-graph nodes on
            // `wall.baseLine`). Building the floor on that polygon spans to the wall
            // centre and OVERLAPS the neighbour's floor UNDER the partition. Inset each
            // edge inward to its bounding wall's INNER FACE (thickness/2), keeping the
            // centreline only across door openings so adjacent floors meet at the
            // threshold (§FLOOR-DOOR-GAP). Fail-safe: falls back to the centreline poly.
            //
            // §FIX-FLOOR-FINISH-INNER-FACE-ALL-PATHS (L-240) — the inset is no longer applied
            // HERE. This command now hands `CreateFloorCommand` the CENTRELINE ring plus the
            // declaration `boundarySource: 'room-centreline'`, and the create chokepoint does
            // the derivation for EVERY path (3D tool, plan tool, batch, AI, import) with the
            // same canonical resolver + the same stores → byte-identical output to before.
            // We still derive locally, because the stairwell-void containment test below must
            // run against the FINAL (inset) ring exactly as it did before this change; the
            // resolver is pure, so the command's re-derivation returns the same polygon.
            const centrelinePoly = room.boundary!.polygon!.map(p => ({ x: p.x, z: p.z }));
            const roomPoly = this._innerFacePolygon(context, room, centrelinePoly);
            // §A.21.D29 #1 — cut any stairwell void hosted in THIS room as a `polygon`
            // service-hole (FloorPanelBuilder extrudes the boundary Shape with these as
            // `shape.holes`, so the finish is genuinely open over the stair). The void
            // polygon is in the SAME world-XZ frame as the floor boundary (no remap).
            const serviceHoles = this._serviceHolesForRoom(roomPoly);
            return new CreateFloorCommand({
                floorId: crypto.randomUUID(),
                ifcGuid: crypto.randomUUID(),
                polygon: centrelinePoly,
                boundarySource: 'room-centreline',
                levelId: this.levelId,
                systemTypeId: this._resolveFinishTypeId(finishStore, category),
                hostRoomId: room.id,
                label: `${room.name ?? 'Room'} Floor`,
                ...(serviceHoles.length > 0 ? { serviceHoles } : {}),
                ...(finish ? { finishSpec: {
                    finishColor: finish.finishColor,
                    finishPattern: finish.finishPattern,
                    materialName: finish.materialName,
                } } : {}),
            });
        };

        const run = (): void => {
            const r = buildPerRoomBoundaryElements(context, this.levelId, factory);
            this.createdCommands = r.createdCommands as CreateFloorCommand[];
            affectedIds.push(...r.affectedElementIds);
        };

        // First execute coalesces store events + suppresses the per-floor reprojection /
        // redetect storm (floors don't bound rooms). Redo runs directly (re-creates).
        //
        // §FLOOR-BATCH-JOIN (2026-06-30) — when this command is dispatched from INSIDE a
        // parent batch (the resi `CREATE_FLOORS_BY_ROOM_TYPE` path runs under the executor's
        // own runBatch), a nested `runBatch(run, …)` logged "runBatch called while already
        // batching — nesting not supported. Running fn() without batch guards" and ran `run()`
        // UNGUARDED — every per-floor store event escaped the outer batch's coalescing →
        // extra reprojection/redetect events + jank. Detect the in-flight batch via the
        // `isBatching` getter and JOIN it (run `run()` directly, so the OUTER batch's guards
        // — including its own coalescing/redetect-suppression — apply). Only open a fresh
        // batch when we are the top-level dispatch.
        if (this.createdCommands.length === 0) {
            if (batchCoordinator.isBatching) {
                // Already inside a batch — join it (no nested runBatch).
                run();
            } else {
                batchCoordinator.runBatch(run, {
                    levelIds: [this.levelId],
                    totalElementCount: roomsOnLevel(context, this.levelId).length,
                    skipRedetectRooms: true,
                    // §POSTGEN-PERF (2026-06-16) — floors are room-bounded slabs with PBR-ready
                    // materials; the per-batch full-scene PBR/PSO render (~1s) is wasted here.
                    skipPbrUpgrade: true,
                });
            }
        } else {
            run();
        }

        this.targetIds.push(...affectedIds);
        // §FLOOR-DIAG-FLOOD-GATE — the per-room §DIAG lines + the big "Created N floor(s)"
        // info string are gated (default OFF in prod). `_diag` is empty unless the flag is
        // on (every push routes through `_pushDiag`), so this loop + the `info` spread are
        // already no-ops in prod; the `Created …` summary stays only when diag is on so the
        // command `info` is not a giant concatenated string on the hot open path.
        if (this._diag.length > 0 && typeof console !== 'undefined') {
            for (const line of this._diag) console.log(line);
        }
        return {
            success: true,
            affectedElementIds: affectedIds,
            // §FLOOR-DEFAULT-UNTYPED — the defaulted note is UNGATED, unlike the
            // §DIAG lines. It is exactly one sentence regardless of room count
            // (no §FLOOR-DIAG-FLOOD-GATE cost), and it is the half of this
            // feature that keeps it honest: a default the user is not told about
            // is indistinguishable from a considered choice.
            info: [
                ...this._defaultedNote(),
                ...(floorDiagOn()
                    ? [
                        `Created ${affectedIds.length} floor(s) by room type on level ${this.levelId}.`,
                        ...this._diag,
                    ]
                    : []),
            ],
        };
    }

    /** The one sentence naming the default finish and how many rooms took it.
     *  Empty when every floored room chose its own finish from its own type. */
    private _defaultedNote(): string[] {
        if (this._defaultedRooms <= 0) return [];
        const material = defaultFloorFinish(this.style).materialName;
        const notes: string[] = [];
        // §FLOOR-REFUSAL-IS-FALSE (L-1014) — two causes, two sentences. This used
        // to say "had no room type set" for BOTH, so a floored classroom was told
        // it was untagged and sent to Auto-Organise, which could not help it.
        const u = this._untypedRooms;
        if (u > 0) {
            notes.push(
                `${u} room${u === 1 ? '' : 's'} had no room type set, so ${u === 1 ? 'it' : 'they'} ` +
                `got the default ${material} finish — tag ${u === 1 ? 'the room' : 'the rooms'} ` +
                `(Auto-Organise) to get tile in kitchens and bathrooms instead.`,
            );
        }
        const m = this._unmappedRooms;
        if (m > 0) {
            notes.push(
                `${m} room${m === 1 ? '' : 's'} ${m === 1 ? 'is' : 'are'} tagged with a type this ` +
                `finish table has no rule for, so ${m === 1 ? 'it' : 'they'} got the default ` +
                `${material} finish. Re-tagging will not change that — set the floor finish ` +
                `directly, or add a rule for that room type.`,
            );
        }
        return notes;
    }

    undo(context: CommandContext): CommandResult {
        const ids: string[] = [];
        for (let i = this.createdCommands.length - 1; i >= 0; i--) {
            const r = this.createdCommands[i].undo(context);
            if (r.success) ids.push(...r.affectedElementIds);
        }
        return { success: true, affectedElementIds: ids };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: { levelId: this.levelId },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1,
        };
    }

    // ── Internal ────────────────────────────────────────────────────────────────

    /** §FLOOR-INNER-FACE §DIAG accumulator — one line per floored room. */
    private _diag: string[] = [];

    /** §FLOOR-DEFAULT-UNTYPED — how many floors this run gave the DEFAULT finish
     *  because their room carried no type. Drives the one ungated `info` line. */
    private _defaultedRooms = 0;
    /** §FLOOR-REFUSAL-IS-FALSE (L-1014) — the two halves of `_defaultedRooms`, kept apart. */
    private _untypedRooms = 0;
    private _unmappedRooms = 0;

    /** §FLOOR-DIAG-FLOOD-GATE — accumulate a §DIAG line ONLY when the diag flag is on.
     *  Takes a thunk so the (interpolated) string is never even built in prod. */
    private _pushDiag(build: () => string): void {
        if (floorDiagOn()) this._diag.push(build());
    }

    /**
     * §FLOOR-INNER-FACE (2026-06-10) · §FIX-FLOOR-FINISH-BOUNDARY-UI-VS-BATCH (L-213) ·
     * §FIX-FLOOR-FINISH-INNER-FACE-ALL-PATHS (L-240) — the room's INNER-FACE floor polygon.
     *
     * The store-walking that used to live here (bounding walls → level walls → derive →
     * fail-safe) was duplicated VERBATIM in `FloorPlanToolHandler._innerFacePolygon`, and the
     * 3D `FloorTool` had no copy at all — which is precisely why the 3D AUTO path shipped a
     * centreline floor (L-240). It now delegates to the SINGLE canonical, store-injected
     * `resolveRoomFinishBoundary` in `@pryzm/room-topology`.
     *
     * This result is used ONLY for the stairwell-void containment test; the AUTHORITY for the
     * stored boundary is `CreateFloorCommand` (which re-derives it with the same pure resolver
     * from the `'room-centreline'` payload), so no tool can omit the inset.
     */
    private _innerFacePolygon(
        context: CommandContext,
        room: PerRoomCtx,
        centreline: Array<{ x: number; z: number }>,
    ): Array<{ x: number; z: number }> {
        const wallStore = (context.stores as any).wallStore as {
            getById?: (id: string) => WallLike | undefined;
            getByLevel?: (levelId: string) => WallLike[];
        } | undefined;
        const roomStore = (context.stores as any).roomStore as {
            getById?: (id: string) => { boundingWallIds?: string[] } | undefined;
        } | undefined;
        if (!wallStore) { this._pushDiag(() => `[floor §DIAG] ${this._roomTag(room)} boundary=centreline ⚠ (no wallStore)`); return centreline; }

        return resolveRoomFinishBoundary(
            centreline,
            {
                roomId: room.id,
                levelId: this.levelId,
                lookup: {
                    getRoomById:     (id) => roomStore?.getById?.(id),
                    getWallById:     (id) => wallStore.getById?.(id),
                    getWallsByLevel: (lid) => wallStore.getByLevel?.(lid) ?? [],
                },
            },
            (line) => this._pushDiag(() => `[floor §DIAG] ${this._roomTag(room)} ${line}`),
        );
    }

    private _roomTag(room: PerRoomCtx): string {
        return `room "${room.name ?? room.occupancyType ?? room.id}"`;
    }

    /**
     * §A.21.D29 #1 — build the `polygon` service-holes for the floor of a room: one
     * per recorded stairwell void whose CENTROID lies inside the room boundary. The
     * void polygon is already in world X-Z (the SAME frame as the floor boundary the
     * FloorPanelBuilder reads), so it is copied through unchanged. Empty when no
     * voids are registered (apartment / single-storey) — zero behaviour change.
     */
    private _serviceHolesForRoom(roomPoly: ReadonlyArray<{ x: number; z: number }>): FloorServiceHole[] {
        const voids = this.voids;
        if (!voids || voids.length === 0) return [];
        const holes: FloorServiceHole[] = [];
        for (const v of voids) {
            if (v.polygon.length < 3) continue;
            const c = this._polyCentroid(v.polygon);
            if (!this._pointInPoly(c, roomPoly)) continue;
            // Emit the void wound OPPOSITE to the room boundary (which CreateFloorCommand
            // stores CCW). THREE's triangulateShape pairs a hole contour to its outer by
            // containment, but opposite winding is the canonical, robust form (it's what
            // the slab builder normalises holes to). We force the void CW in world X-Z.
            const cw = this._signedArea(v.polygon) > 0 ? [...v.polygon].reverse() : [...v.polygon];
            holes.push({
                id: crypto.randomUUID(),
                elementId: crypto.randomUUID(),
                subType: 'floor-hatch',
                shape: 'polygon',
                polygon: cw.map(p => ({ x: p.x, z: p.z })),
                label: 'Stairwell void',
            });
        }
        return holes;
    }

    /** Signed area of a polygon in world X-Z (>0 → CCW, <0 → CW). */
    private _signedArea(poly: ReadonlyArray<{ x: number; z: number }>): number {
        let s = 0;
        for (let i = 0; i < poly.length; i++) {
            const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
            s += a.x * b.z - b.x * a.z;
        }
        return s * 0.5;
    }

    /** Vertex-average centroid of a polygon (world X-Z). Adequate for the convex
     *  oriented-rect void footprint we test for containment. */
    private _polyCentroid(poly: ReadonlyArray<{ x: number; z: number }>): { x: number; z: number } {
        let sx = 0, sz = 0;
        for (const p of poly) { sx += p.x; sz += p.z; }
        const n = poly.length || 1;
        return { x: sx / n, z: sz / n };
    }

    /**
     * Ray-cast point-in-polygon test in world X-Z. §C73-PIP-CANONICAL —
     * delegates to the kernel's one even-odd body.
     */
    private _pointInPoly(pt: { x: number; z: number }, poly: ReadonlyArray<{ x: number; z: number }>): boolean {
        return pointInPolygonXZ(pt.x, pt.z, poly);
    }

    /**
     * §FLOOR-REFUSAL-IS-FALSE (L-1014) — normalise once, at the boundary.
     * The sibling resolver `floorFinish.ts` lowercases its input and this did not,
     * so "may I have a floor" and "which finish" disagreed on `'Kitchen'`.
     */
    private static _norm(occ: string | undefined): string {
        return typeof occ === 'string' ? occ.trim().toLowerCase() : '';
    }

    /** True when the room states no type — including via the store's own token for it. */
    private static _isUntyped(occ: string | undefined): boolean {
        const n = CreateFloorsByRoomTypeCommand._norm(occ);
        return n.length === 0 || UNTYPED_TOKENS.has(n);
    }

    /** True when this type is a DELIBERATE exclusion (see EXCLUDED_TYPES). */
    private _isExcluded(occ: string | undefined): boolean {
        const n = CreateFloorsByRoomTypeCommand._norm(occ);
        if (EXCLUDED_TYPES.has(n)) return true;
        // §RESI-CORRIDOR-FINISH-NO-DOUBLE — resi pipeline owns the (merged) corridor finish.
        return !!this.options?.skipCirculation && CIRCULATION_TYPES.has(n);
    }

    private _finishCategory(occ: string | undefined): 'timber' | 'tile-stone' | null {
        const n = CreateFloorsByRoomTypeCommand._norm(occ);
        if (!n) return null;
        if (this._isExcluded(n)) return null;
        if (TIMBER_TYPES.has(n)) return 'timber';
        if (TILE_TYPES.has(n)) return 'tile-stone';
        return null;
    }

    /**
     * §FLOOR-DEFAULT-UNTYPED — the finish plan for a room, which is where the
     * "type chooses WHICH, not WHETHER" rule lives.
     *
     * Three outcomes, and keeping them distinct is the whole point:
     *   • a TYPED room that maps        → its own category,      `defaulted:false`
     *   • a TYPED room that is excluded → null (stair; skipped circulation)
     *   • an UNTYPED room               → the default category, `defaulted:true`
     *
     * The middle case is why this is not simply `_finishCategory(occ) ?? default`:
     * that would have defaulted stairwells and the resi corridors too, turning
     * two deliberate exclusions into gaps to be filled.
     */
    private _finishPlan(occ: string | undefined): FinishPlan | null {
        // §FLOOR-REFUSAL-IS-FALSE (L-1014) — order matters, and it is:
        //   1. a DELIBERATE exclusion refuses (and only a NAMED one does);
        //   2. a type that maps takes its own finish;
        //   3. everything else — untyped, 'unclassified', or a known type this
        //      table has no opinion about — takes the default.
        // Step 3 used to be "refuse", which turned every gap in a lookup table
        // into an assertion that the user's room was a stairwell.
        if (this._isExcluded(occ)) return null;
        const category = this._finishCategory(occ);
        if (category !== null) return { category, defaulted: false, defaultReason: null };
        // Reached only when the room's own type did NOT choose the finish, so the
        // default was taken — whether because no type was stated or because the
        // stated type has no mapping. Either way `defaulted` is true, and the
        // caller surfaces "we chose this for you" on that flag.
        return {
            category: DEFAULT_UNTYPED_CATEGORY,
            defaulted: true,
            defaultReason: CreateFloorsByRoomTypeCommand._isUntyped(occ) ? 'untyped' : 'unmapped',
        };
    }

    /**
     * Resolve a finish system-type id from the floor system-type store, preferring
     * a canonical id, falling back to the first of the category, then undefined
     * (CreateFloorCommand applies its own default assembly when absent).
     */
    private _resolveFinishTypeId(finishStore: any, category: 'timber' | 'tile-stone'): string | undefined {
        if (!finishStore?.getAll) return undefined;
        const all = finishStore.getAll();
        const preferred = category === 'timber' ? 'floor-type-engineered-timber' : 'floor-type-porcelain-tile';
        const exact = all.find((t: any) => t.id === preferred);
        if (exact) return exact.id;
        const byCat = all.find((t: any) => t.category === category);
        return byCat?.id;
    }
}
