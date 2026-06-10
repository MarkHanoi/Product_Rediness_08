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
import { batchCoordinator, type FloorServiceHole } from '@pryzm/core-app-model';
import { buildPerRoomBoundaryElements, roomsOnLevel, roomsWithBoundary, type PerRoomCtx } from '../rooms/perRoomBoundary';
import { floorFinishFor } from './floorFinish';
import { insetPolygonToInnerFaces } from '@pryzm/room-topology';

/** occupancyType → finish category. #34: timber in living/bedroom, tile in kitchen/bathroom. */
const TIMBER_TYPES = new Set([
    'living-room', 'bedroom', 'dining-room', 'hotel-bedroom', 'study',
]);
const TILE_TYPES = new Set([
    'kitchen', 'kitchen-shared', 'bathroom', 'wc', 'accessible-wc', 'shower-room', 'utility-room',
]);

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
    constructor(private levelId: string, private style?: string, private voids?: ReadonlyArray<FloorVoid>) {
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
                polygon: roomPoly,
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
        if (this.createdCommands.length === 0) {
            batchCoordinator.runBatch(run, {
                levelIds: [this.levelId],
                totalElementCount: roomsOnLevel(context, this.levelId).length,
                skipRedetectRooms: true,
            });
        } else {
            run();
        }

        this.targetIds.push(...affectedIds);
        // §FLOOR-INNER-FACE §DIAG — one always-on line per floored room: boundary
        // source (inner-face ✓ / centreline ⚠), the inset applied, and the door-gap
        // count where the floor meets a neighbour at a threshold.
        if (this._diag.length > 0 && typeof console !== 'undefined') {
            for (const line of this._diag) console.log(line);
        }
        return {
            success: true,
            affectedElementIds: affectedIds,
            info: [
                `Created ${affectedIds.length} floor(s) by room type on level ${this.levelId}.`,
                ...this._diag,
            ],
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

    /**
     * §FLOOR-INNER-FACE (2026-06-10) — derive the room's INNER-FACE floor polygon by
     * insetting the centreline boundary inward, per edge, by each bounding wall's
     * `thickness / 2`. At any edge that carries a DOOR opening the inset is kept at 0
     * across the door span so the two rooms' floors meet at the threshold
     * (§FLOOR-DOOR-GAP). Deterministic; pure read of WallStore (no mutation).
     *
     * Strategy:
     *   1. For each centreline edge, find the bounding wall whose centreline segment
     *      is collinear with — and contains the midpoint of — that edge.
     *   2. The edge's inset = that wall's thickness/2 (0 if no wall matched — keeps
     *      the centreline, the safe default).
     *   3. If the matched wall has ≥1 door opening, subdivide the edge into the door
     *      span(s) (inset 0) and the solid run(s) (inset thickness/2), introducing the
     *      span-boundary vertices so the miter inset only pulls back the solid runs.
     *   4. Call the pure `insetPolygonToInnerFaces`, which miters the offset edges.
     *
     * Falls back to the centreline polygon on any failure so a floor is always made.
     */
    private _innerFacePolygon(
        context: CommandContext,
        room: PerRoomCtx,
        centreline: Array<{ x: number; z: number }>,
    ): Array<{ x: number; z: number }> {
        try {
            const wallStore = (context.stores as any).wallStore as {
                getById?: (id: string) => WallLike | undefined;
                getByLevel?: (levelId: string) => WallLike[];
            } | undefined;
            const roomStore = (context.stores as any).roomStore as {
                getById?: (id: string) => { boundingWallIds?: string[] } | undefined;
            } | undefined;
            if (!wallStore) { this._diag.push(`[floor §DIAG] ${this._roomTag(room)} boundary=centreline ⚠ (no wallStore)`); return centreline; }

            // Candidate bounding walls: the room's recorded boundingWallIds, else all
            // walls on the level (the per-edge collinear test selects the right one).
            const fullRoom = roomStore?.getById?.(room.id);
            const ids = fullRoom?.boundingWallIds ?? [];
            const walls: WallLike[] = [];
            for (const id of ids) { const w = wallStore.getById?.(id); if (w) walls.push(w); }
            if (walls.length === 0 && wallStore.getByLevel) {
                walls.push(...wallStore.getByLevel(this.levelId));
            }
            if (walls.length === 0) { this._diag.push(`[floor §DIAG] ${this._roomTag(room)} boundary=centreline ⚠ (no bounding walls)`); return centreline; }

            // Build subdivided ring + per-edge insets.
            const HALF = (t: number) => Math.max(0, t) / 2;
            const ring: Array<{ x: number; z: number }> = [];
            const insets: number[] = [];
            let matchedEdges = 0;
            let doorGaps = 0;

            for (let i = 0; i < centreline.length; i++) {
                const a = centreline[i];
                const b = centreline[(i + 1) % centreline.length];
                const wall = this._wallForEdge(a, b, walls);
                if (!wall) {
                    // No bounding wall on this edge — keep it on the centreline.
                    ring.push({ x: a.x, z: a.z });
                    insets.push(0);
                    continue;
                }
                matchedEdges++;
                const half = HALF(wall.thickness);
                // Door spans on this wall, expressed as [t0,t1] parametric along a→b.
                const spans = this._doorSpansOnEdge(a, b, wall);
                if (spans.length === 0) {
                    ring.push({ x: a.x, z: a.z });
                    insets.push(half);
                    continue;
                }
                // Subdivide a→b at door-span boundaries: solid runs inset to the inner
                // face; door runs stay on the centreline (inset 0) so floors meet.
                doorGaps += spans.length;
                const cuts = this._mergeSpansToSegments(spans);
                let cursor = 0;
                for (const seg of cuts) {
                    // Solid run before this door span.
                    if (seg.t0 > cursor + 1e-6) {
                        ring.push(this._lerp(a, b, cursor)); insets.push(half);
                    }
                    // Door run.
                    ring.push(this._lerp(a, b, Math.max(seg.t0, cursor))); insets.push(0);
                    cursor = seg.t1;
                }
                if (cursor < 1 - 1e-6) {
                    ring.push(this._lerp(a, b, cursor)); insets.push(half);
                }
            }

            if (ring.length < 3) { this._diag.push(`[floor §DIAG] ${this._roomTag(room)} boundary=centreline ⚠ (degenerate after subdivide)`); return centreline; }

            const inner = insetPolygonToInnerFaces(ring, insets);
            const ok = inner !== ring; // util returns the SAME array ref on fail-safe
            const maxInset = insets.reduce((m, v) => Math.max(m, v), 0);
            this._diag.push(
                `[floor §DIAG] ${this._roomTag(room)} boundary=${ok ? 'inner-face ✓' : 'centreline ⚠ (inset collapsed)'} ` +
                `edges=${matchedEdges}/${centreline.length} maxInset=${(maxInset * 1000).toFixed(0)}mm door-gaps=${doorGaps}`,
            );
            return ok ? inner : centreline;
        } catch (err) {
            this._diag.push(`[floor §DIAG] ${this._roomTag(room)} boundary=centreline ⚠ (error: ${String(err)})`);
            return centreline;
        }
    }

    private _roomTag(room: PerRoomCtx): string {
        return `room "${room.name ?? room.occupancyType ?? room.id}"`;
    }

    private _lerp(a: { x: number; z: number }, b: { x: number; z: number }, t: number): { x: number; z: number } {
        return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    }

    /**
     * Find the bounding wall whose CENTRELINE segment is collinear with the room
     * edge a→b and contains the edge's midpoint (within a tolerance). The room
     * polygon edge runs along a wall centreline, so the midpoint lies ON the wall's
     * baseLine; perpendicular distance ≈ 0 and the foot of the projection is between
     * the wall endpoints. Returns the BEST (closest) match.
     */
    private _wallForEdge(
        a: { x: number; z: number },
        b: { x: number; z: number },
        walls: WallLike[],
    ): WallLike | undefined {
        const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
        const exx = b.x - a.x, ezz = b.z - a.z;
        const elen = Math.hypot(exx, ezz);
        if (elen < 1e-6) return undefined;
        const eux = exx / elen, euz = ezz / elen;
        let best: WallLike | undefined;
        let bestPerp = 0.20; // 200 mm — tolerant of join-trim/miter offsets at ends.
        for (const w of walls) {
            const w0 = w.baseLine?.[0], w1 = w.baseLine?.[1];
            if (!w0 || !w1) continue;
            // Parallel? (edge direction ≈ wall direction, either sign)
            const wdx = w1.x - w0.x, wdz = w1.z - w0.z;
            const wlen = Math.hypot(wdx, wdz);
            if (wlen < 1e-6) continue;
            const wux = wdx / wlen, wuz = wdz / wlen;
            const dot = Math.abs(eux * wux + euz * wuz);
            if (dot < 0.985) continue; // > ~10° off — not the same wall line.
            // Perpendicular distance of the edge midpoint to the wall centreline.
            const vx = mx - w0.x, vz = mz - w0.z;
            const tproj = (vx * wux + vz * wuz) / wlen; // 0..1 along the wall
            const footX = w0.x + tproj * wdx, footZ = w0.z + tproj * wdz;
            const perp = Math.hypot(mx - footX, mz - footZ);
            // Midpoint must project ONTO the wall (allow a small overhang for trims).
            if (tproj < -0.02 || tproj > 1.02) continue;
            if (perp < bestPerp) { bestPerp = perp; best = w; }
        }
        return best;
    }

    /**
     * Door opening spans on the wall, mapped to parametric `[t0,t1]` along the room
     * edge a→b (t in 0..1). A wall stores openings as `{ offset, width }` where
     * `offset` is the centre position along the wall baseLine (metres from baseLine
     * start). We project the door's start/end onto a→b. Windows are ignored (a floor
     * does not meet a neighbour at a window). Clamped to [0,1]; empty if none land on
     * this edge.
     */
    private _doorSpansOnEdge(
        a: { x: number; z: number },
        b: { x: number; z: number },
        wall: WallLike,
    ): Array<{ t0: number; t1: number }> {
        const openings = wall.openings ?? [];
        if (openings.length === 0) return [];
        const w0 = wall.baseLine?.[0], w1 = wall.baseLine?.[1];
        if (!w0 || !w1) return [];
        const wlen = Math.hypot(w1.x - w0.x, w1.z - w0.z);
        if (wlen < 1e-6) return [];
        const wux = (w1.x - w0.x) / wlen, wuz = (w1.z - w0.z) / wlen;
        const edx = b.x - a.x, edz = b.z - a.z;
        const elen2 = edx * edx + edz * edz;
        if (elen2 < 1e-12) return [];
        // Project a wall-baseLine distance `d` (from w0) onto edge param t.
        const toEdgeT = (d: number): number => {
            const px = w0.x + wux * d, pz = w0.z + wuz * d;
            return ((px - a.x) * edx + (pz - a.z) * edz) / elen2;
        };
        const spans: Array<{ t0: number; t1: number }> = [];
        for (const op of openings) {
            if (op.type !== 'door') continue;
            const half = (op.width ?? 0) / 2;
            const tA = toEdgeT(op.offset - half);
            const tB = toEdgeT(op.offset + half);
            let t0 = Math.min(tA, tB), t1 = Math.max(tA, tB);
            t0 = Math.max(0, t0); t1 = Math.min(1, t1);
            if (t1 - t0 > 1e-4) spans.push({ t0, t1 });
        }
        return spans;
    }

    /** Merge overlapping door spans and sort ascending by t0. */
    private _mergeSpansToSegments(spans: Array<{ t0: number; t1: number }>): Array<{ t0: number; t1: number }> {
        const sorted = [...spans].sort((p, q) => p.t0 - q.t0);
        const out: Array<{ t0: number; t1: number }> = [];
        for (const s of sorted) {
            const last = out[out.length - 1];
            if (last && s.t0 <= last.t1 + 1e-6) { last.t1 = Math.max(last.t1, s.t1); }
            else { out.push({ ...s }); }
        }
        return out;
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

    /** Ray-cast point-in-polygon test in world X-Z. */
    private _pointInPoly(pt: { x: number; z: number }, poly: ReadonlyArray<{ x: number; z: number }>): boolean {
        let inside = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const a = poly[i]!, b = poly[j]!;
            const intersects = (a.z > pt.z) !== (b.z > pt.z)
                && pt.x < ((b.x - a.x) * (pt.z - a.z)) / (b.z - a.z) + a.x;
            if (intersects) inside = !inside;
        }
        return inside;
    }

    private _finishCategory(occ: string | undefined): 'timber' | 'tile-stone' | null {
        if (!occ) return null;
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
