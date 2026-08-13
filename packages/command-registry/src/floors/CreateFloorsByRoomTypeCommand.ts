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
import { floorFinishFor } from './floorFinish';
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
        const typed = rooms.filter(r => this._finishCategory(r.occupancyType) !== null);
        if (typed.length === 0) {
            return { ok: false, reason: 'No rooms with a floor-mappable type — run Auto-Organise (tag rooms) first.' };
        }
        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        if (!context.stores.roomStore) return { success: false, affectedElementIds: [] };
        this._diag = []; // reset so redo doesn't accumulate stale §DIAG lines.
        const floorStore = context.stores.floorStore as unknown as { getAll?: () => Array<{ hostRoomId?: string }> } | undefined;
        const finishStore = (context.stores as any).floorSystemTypeStore;
        const affectedIds: string[] = [];

        // occupancyType → floor finish; skip rooms with no mapping or an existing host floor.
        const factory = (room: PerRoomCtx): CreateFloorCommand | null => {
            const category = this._finishCategory(room.occupancyType);
            if (!category) return null;
            if (floorStore?.getAll && floorStore.getAll().some(f => f.hostRoomId === room.id)) return null;
            // §A.21.D-FLOOR — realistic, style-aware finish (wood plank / porcelain
            // tile colour + pattern + material name) instead of the flat `#D4C4A8`
            // fallback. Rooms in the auto-pipeline carry no explicit floor finish, so
            // this is what the user sees. CreateFloorCommand spreads finishSpec over
            // its default, so a believable finish always lands.
            const finish = floorFinishFor(room.occupancyType, this.style);
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
            info: floorDiagOn()
                ? [
                    `Created ${affectedIds.length} floor(s) by room type on level ${this.levelId}.`,
                    ...this._diag,
                ]
                : [],
        };
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

    private _finishCategory(occ: string | undefined): 'timber' | 'tile-stone' | null {
        if (!occ) return null;
        // §RESI-CORRIDOR-FINISH-NO-DOUBLE — resi pipeline owns the (merged) corridor finish.
        if (this.options?.skipCirculation && CIRCULATION_TYPES.has(occ)) return null;
        if (TIMBER_TYPES.has(occ)) return 'timber';
        if (TILE_TYPES.has(occ)) return 'tile-stone';
        return null;
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
