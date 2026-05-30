// Apartment Layout Generator — execute-plan builder (SPEC §12, step A6-core).
//
// PURE: converts a chosen `LayoutOption` (plan coords in MM) into the real
// command payloads needed to BUILD it — a ready-to-dispatch `wall.batch.create`
// ref + a door plan the A6 wiring completes once wall ids exist. NO mutation, NO
// stores, NO DOM, NO THREE, and crucially NO import from `plugins/*` (that would
// invert the layer rule — ai-host is below L7). The payload object literals match
// the audited handler shapes (CreateWallBatchPayload / CreateDoorPayload) by
// STRUCTURE; `CommandPayloadRef.payload` is `unknown`, so no plugin types leak in.
//
// Units: the AI option is in MILLIMETRES (plan x/y); every PRYZM command is in
// METRES (world x/y/z, y = elevation). This builder does the mm→m conversion and
// the plan(x,y)→world(x,z) mapping (caller-overridable for the shell's frame).
//
// Door hosting (audit): door.batch.create needs a `wallId` + an `openingId` that
// `wall.createOpening` reserved first, and the host wall id only exists AFTER
// wall.batch.create runs. So the door host (wallRef → created wall id) is resolved
// by the A6 wiring; this core emits a `doorPlan` keyed by wall INDEX plus the
// per-door geometry (metres) the wiring feeds into createOpening + door.batch.create.

import type { CommandPayloadRef } from '../../types.js';
import type { LayoutOption, Vec2mm } from './types.js';
import { defaultDoorSystemTypeId } from './resolvers/defaultElementTypes.js';

const MM_PER_M = 1000;

/** Matches CreateWallBatch's endpoint-distance guard (≥ 0.05 m in XZ). */
export const MIN_WALL_LENGTH_M = 0.05;
export const DEFAULT_WALL_HEIGHT_M = 2.7;
export const DEFAULT_WALL_THICKNESS_M = 0.1;
export const DEFAULT_DOOR_HEIGHT_M = 2.1;
export const DEFAULT_DOOR_WIDTH_M = 0.9;
/** §APARTMENT-DOOR-DEFAULT (2026-05-28): the apartment generator's interior
 *  doors default to the editor's standard residential timber leaf
 *  (DoorSystemTypeStore.ts → 'solid-timber' = "Solid Timber (Default)"). The
 *  same id the user picks in the door property panel — keeps generated and
 *  hand-drawn doors visually consistent. Override via
 *  `LayoutExecuteOptions.doorSystemTypeId`. */
export const DEFAULT_DOOR_SYSTEM_TYPE_ID = 'solid-timber';

export interface Vec3m { x: number; y: number; z: number }

export interface LayoutExecuteOptions {
    /** Level the walls + doors belong to. */
    readonly levelId: string;
    /** Wall type id → CreateWallPayload.systemTypeId. OPTIONAL: omit (or pass '')
     *  to let the wall handler use its default type — passing an id the wall
     *  system-type store doesn't know throws "unknown systemTypeId" at dispatch. */
    readonly wallTypeId?: string;
    /** World Y (m) of the level base; both baseLine endpoints share this y. Default 0. */
    readonly baseElevationM?: number;
    /** Wall height (m); from constraints.floorToCeiling (mm). Default 2.7. */
    readonly wallHeightM?: number;
    /** Wall thickness (m); from constraints.wallThickness (mm). Default 0.1. */
    readonly wallThicknessM?: number;
    /** Door leaf height (m). Default 2.1. */
    readonly doorHeightM?: number;
    /** Door system-type id (DoorSystemTypeStore key). Defaults to
     *  `DEFAULT_DOOR_SYSTEM_TYPE_ID` = `'solid-timber'` so apartment-generated
     *  doors carry the same "Solid Timber (Default)" finish the user picks in
     *  the door property panel. Pass `''` to omit (handler default kicks in). */
    readonly doorSystemTypeId?: string;
    /** plan(mm) → world(m) XZ mapping. Default { x: p.x/1000, z: p.y/1000 }.
     *  Override to apply the shell's origin/rotation frame at the wiring layer. */
    readonly planToWorldXZ?: (p: Vec2mm) => { x: number; z: number };
    /** Skip walls flagged `isExternal` — the perimeter/shell already exists in the
     *  model, so building it again would duplicate (coincident) shell walls and
     *  corrupt room detection. The preview still shows them; only the BUILD omits
     *  them. Doors host on interior walls only, so the wallRef remap keeps doors. */
    readonly skipExteriorWalls?: boolean;
}

/** A single wall spec, METRES — structurally a CreateWallPayload. */
export interface WallCreateSpec {
    readonly baseLine: readonly [Vec3m, Vec3m];
    readonly height: number;        // m
    readonly thickness: number;     // m
    /** Omitted when no wall type id is supplied → wall handler uses its default. */
    readonly systemTypeId?: string;
}

/** A door to create, METRES. `wallRef` indexes into the produced walls[];
 *  the A6 wiring resolves it to the created wall id, calls wall.createOpening
 *  (reserving `openingId`/`elementId`), then door.batch.create. */
export interface DoorPlanItem {
    readonly wallRef: number;
    readonly offset: number;        // m, from host wall start
    readonly width: number;         // m
    readonly height: number;        // m
    readonly sillHeight: number;    // m (0 for doors)
    readonly doorType: 'single' | 'double';
    readonly name?: string;         // semantic name (e.g. "Bedroom – Corridor Door")
    // T1.D (2026-05-30) — when present, the per-pair resolver picks a
    // privacy/glazed/solid finish instead of the global default. Optional for
    // back-compat: AI / legacy paths that don't populate the room types still
    // get the global `stampDoorSysType`.
    readonly roomTypeA?: import('./types.js').RoomType;
    readonly roomTypeB?: import('./types.js').RoomType;
}

export interface LayoutPlan {
    /** Ready-to-dispatch `wall.batch.create` ref (handler assigns wall ids). */
    readonly wallCommand: CommandPayloadRef;
    /** Same wall data as `wallCommand.payload.walls`, typed — the wiring indexes
     *  this to resolve each door's host wall after the batch assigns ids. */
    readonly walls: readonly WallCreateSpec[];
    /** Door creation plan (wallRef → created id resolved at A6 wiring). */
    readonly doorPlan: readonly DoorPlanItem[];
    /** walls + doors — feeds BatchCoordinator.runBatch totalElementCount. */
    readonly totalElementCount: number;
    /** Dropped/degenerate inputs (loud-fail-soft; never throws). */
    readonly warnings: readonly string[];
}

function defaultPlanToWorld(p: Vec2mm): { x: number; z: number } {
    return { x: p.x / MM_PER_M, z: p.y / MM_PER_M };
}

function lengthXZ(a: Vec3m, b: Vec3m): number {
    return Math.hypot(a.x - b.x, a.z - b.z);
}

const COLLINEAR_EPS_M = 0.001;          // 1 mm — tighter than the 0.05 m min-wall guard
const round6m = (n: number): number => Math.round(n * 1e6) / 1e6;

interface AxisAlignedWall {
    readonly originalIdx: number;       // index into the input walls array
    readonly axis: 'h' | 'v';            // h = constant z, v = constant x
    readonly constCoord: number;         // rounded to 1e-6
    readonly lo: number;                 // min variable coord
    readonly hi: number;                 // max variable coord
    /** Whether the original wall's baseLine direction is hi → lo (rare, but the
     *  engine doesn't guarantee a sort). Used to adjust door offset on remap. */
    readonly reversed: boolean;
    readonly origBaseLine: readonly [Vec3m, Vec3m];
}

function classifyAxisWall(idx: number, w: WallCreateSpec): AxisAlignedWall | null {
    const [a, b] = w.baseLine;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    if (Math.abs(dx) < COLLINEAR_EPS_M && Math.abs(dz) > COLLINEAR_EPS_M) {
        const lo = Math.min(a.z, b.z), hi = Math.max(a.z, b.z);
        return {
            originalIdx: idx, axis: 'v', constCoord: round6m(a.x), lo, hi,
            reversed: a.z > b.z, origBaseLine: [a, b],
        };
    }
    if (Math.abs(dz) < COLLINEAR_EPS_M && Math.abs(dx) > COLLINEAR_EPS_M) {
        const lo = Math.min(a.x, b.x), hi = Math.max(a.x, b.x);
        return {
            originalIdx: idx, axis: 'h', constCoord: round6m(a.z), lo, hi,
            reversed: a.x > b.x, origBaseLine: [a, b],
        };
    }
    return null;
}

/**
 * §COLLINEAR-MERGE (2026-05-27, live-fix after architect screenshot of 3-wall
 * T-junction + 4-wall + junction): the D-TGL engine sweeps per-room-edge and
 * emits ONE WallSeg per (room, room) pair. Where one PHYSICAL wall traverses
 * multiple room boundaries (a passthrough at a T- or X-junction), this produces
 * 2 or 4 collinear adjacent segments instead of the architecturally-correct
 * 1 passthrough + N abutting walls.
 *
 * This post-process merges axis-aligned collinear adjacent segments into a
 * single wall. T-junction: 2 horizontal halves → 1 horizontal wall + 1
 * abutting vertical = 2 walls total. + junction: both axes have collinear
 * halves → each axis merges to 1 wall = 2 crossing passthrough walls total
 * (V2's resolver won't detect a junction without shared endpoints, so they
 * cross without a miter cut — the 0.1 × 0.1 m overlap at the centre is
 * visually negligible for partition walls).
 *
 * Door wallRef + offset are remapped: original wall W mapped to merged wall M
 * with shift = (W's lo position − M's lo position). If W was reversed (its
 * baseLine direction is hi → lo while M is lo → hi), the door offset within
 * W's local frame inverts: new_offset = W.length − old_offset + shift.
 *
 * Diagonal/degenerate walls pass through unchanged.
 */
function mergeCollinearWalls(walls: readonly WallCreateSpec[]): {
    walls: WallCreateSpec[];
    remap: ReadonlyMap<number, number>;
    /** For each original wall idx, the (start-axis) offset shift in METRES
     *  applied when remapping a door from the original wall to the merged wall. */
    shift: ReadonlyMap<number, number>;
    /** For each original wall idx, whether the merged wall's direction is
     *  OPPOSITE the original's. Used to invert door offset before adding shift. */
    reversedVsMerged: ReadonlyMap<number, boolean>;
} {
    const remap = new Map<number, number>();
    const shift = new Map<number, number>();
    const reversedVsMerged = new Map<number, boolean>();
    const out: WallCreateSpec[] = [];

    const axisWalls: AxisAlignedWall[] = [];
    const passthroughIndices: number[] = [];      // diagonal or degenerate — copy as-is
    walls.forEach((w, i) => {
        const cls = classifyAxisWall(i, w);
        if (cls) axisWalls.push(cls);
        else passthroughIndices.push(i);
    });

    // Group by line: (axis, constCoord). Within each group, sort by lo and
    // merge adjacent runs (end of one ≈ start of next within COLLINEAR_EPS_M).
    const groups = new Map<string, AxisAlignedWall[]>();
    for (const aw of axisWalls) {
        const key = `${aw.axis}@${aw.constCoord}`;
        (groups.get(key) ?? groups.set(key, []).get(key)!).push(aw);
    }
    for (const [, g] of groups) g.sort((a, b) => a.lo - b.lo);

    // Deterministic group order: sorted by key string.
    const orderedKeys = [...groups.keys()].sort();
    for (const key of orderedKeys) {
        const group = groups.get(key)!;
        let runIdx: AxisAlignedWall[] = [];
        const flush = (): void => {
            if (runIdx.length === 0) return;
            const first = runIdx[0]!;
            const last = runIdx[runIdx.length - 1]!;
            const sample = walls[first.originalIdx]!;
            const newStart: Vec3m = first.axis === 'v'
                ? { x: first.constCoord, y: first.origBaseLine[0].y, z: first.lo }
                : { x: first.lo, y: first.origBaseLine[0].y, z: first.constCoord };
            const newEnd: Vec3m = first.axis === 'v'
                ? { x: first.constCoord, y: last.origBaseLine[0].y, z: last.hi }
                : { x: last.hi, y: last.origBaseLine[0].y, z: first.constCoord };
            const newIdx = out.length;
            out.push({
                baseLine: [newStart, newEnd],
                height: sample.height,
                thickness: sample.thickness,
                ...(sample.systemTypeId ? { systemTypeId: sample.systemTypeId } : {}),
            });
            // Every wall in the run remaps to newIdx with shift = wall.lo − run.lo,
            // i.e. its start position along the merged wall (merged runs lo→hi).
            for (const aw of runIdx) {
                remap.set(aw.originalIdx, newIdx);
                shift.set(aw.originalIdx, aw.lo - first.lo);
                reversedVsMerged.set(aw.originalIdx, aw.reversed);
            }
            runIdx = [];
        };
        for (const aw of group) {
            if (runIdx.length === 0) { runIdx.push(aw); continue; }
            const prev = runIdx[runIdx.length - 1]!;
            if (Math.abs(aw.lo - prev.hi) < COLLINEAR_EPS_M) runIdx.push(aw);
            else { flush(); runIdx.push(aw); }
        }
        flush();
    }

    // Pass through diagonals / degenerates unchanged.
    for (const i of passthroughIndices) {
        const newIdx = out.length;
        out.push(walls[i]!);
        remap.set(i, newIdx);
        shift.set(i, 0);
        reversedVsMerged.set(i, false);
    }

    return { walls: out, remap, shift, reversedVsMerged };
}

/**
 * Build the execute plan for a chosen layout option. Pure + loud-fail-soft:
 * degenerate walls (< 0.05 m) and doors that reference a dropped/out-of-range
 * wall or that don't fit on their host wall are dropped with a warning rather
 * than throwing — the run still produces a valid, dispatchable plan.
 */
export function buildLayoutPlan(option: LayoutOption, opts: LayoutExecuteOptions): LayoutPlan {
    const baseElevationM = opts.baseElevationM ?? 0;
    const wallHeightM = opts.wallHeightM ?? DEFAULT_WALL_HEIGHT_M;
    const wallThicknessM = opts.wallThicknessM ?? DEFAULT_WALL_THICKNESS_M;
    const doorHeightM = opts.doorHeightM ?? DEFAULT_DOOR_HEIGHT_M;
    const toWorld = opts.planToWorldXZ ?? defaultPlanToWorld;
    const warnings: string[] = [];

    // Build wall specs, keeping a remap from the option's wall index → the
    // produced index (or -1 when dropped) so door wallRefs stay correct.
    const rawWalls: WallCreateSpec[] = [];
    const dropRemap: number[] = new Array(option.walls.length).fill(-1);

    option.walls.forEach((w, i) => {
        if (opts.skipExteriorWalls && w.isExternal) return;     // shell already exists — don't duplicate it
        const s = toWorld(w.start);
        const e = toWorld(w.end);
        const a: Vec3m = { x: s.x, y: baseElevationM, z: s.z };
        const b: Vec3m = { x: e.x, y: baseElevationM, z: e.z };
        if (lengthXZ(a, b) < MIN_WALL_LENGTH_M) {
            warnings.push(`wall[${i}] dropped — length ${lengthXZ(a, b).toFixed(3)} m < ${MIN_WALL_LENGTH_M} m minimum`);
            return;
        }
        dropRemap[i] = rawWalls.length;
        rawWalls.push({
            baseLine: [a, b],
            height: wallHeightM,
            thickness: wallThicknessM,
            // Only set systemTypeId when a real type id was supplied — an unknown
            // id is rejected by wall.batch.create; omitting → the handler default.
            ...(opts.wallTypeId ? { systemTypeId: opts.wallTypeId } : {}),
        });
    });

    // §COLLINEAR-MERGE — fold collinear adjacent segments into single passthrough
    // walls (T → 2 walls, X → 2 crossing walls). The merge is applied to
    // `rawWalls`; doors then resolve via dropRemap → mergeRemap with offset shift.
    const merge = mergeCollinearWalls(rawWalls);
    const walls = merge.walls;
    if (rawWalls.length !== walls.length) {
        warnings.push(`§COLLINEAR-MERGE: ${rawWalls.length} segments → ${walls.length} walls (${rawWalls.length - walls.length} merged into passthroughs)`);
    }

    // Build the door plan, resolving each door's host wall through:
    //   option.doors[i].wallRef → dropRemap → mergeRemap, with offset shift
    //   (and reversal-vs-merged inverted if the original wall was oriented hi → lo).
    const doorPlan: DoorPlanItem[] = [];
    option.doors.forEach((d, i) => {
        if (d.wallRef < 0 || d.wallRef >= option.walls.length) {
            warnings.push(`door[${i}] dropped — wallRef ${d.wallRef} out of range [0, ${option.walls.length})`);
            return;
        }
        const rawRef = dropRemap[d.wallRef]!;
        if (rawRef === -1) {
            warnings.push(`door[${i}] dropped — host wall[${d.wallRef}] was dropped`);
            return;
        }
        const mergedRef = merge.remap.get(rawRef);
        if (mergedRef === undefined) {
            warnings.push(`door[${i}] dropped — host wall[${rawRef}] missing from merge remap`);
            return;
        }
        const shift = merge.shift.get(rawRef) ?? 0;
        const reversed = merge.reversedVsMerged.get(rawRef) ?? false;

        const offsetM_local = d.offset / MM_PER_M;
        const widthM = (d.width || DEFAULT_DOOR_WIDTH_M * MM_PER_M) / MM_PER_M;
        const raw = rawWalls[rawRef]!;
        const rawLenM = lengthXZ(raw.baseLine[0], raw.baseLine[1]);
        // If the raw wall was reversed relative to the merged direction, invert
        // the door offset within the wall's own length before adding the shift.
        const localOnRaw = reversed ? (rawLenM - offsetM_local - widthM) : offsetM_local;
        const offsetM = shift + localOnRaw;

        const host = walls[mergedRef]!;
        const wallLenM = lengthXZ(host.baseLine[0], host.baseLine[1]);
        if (offsetM < 0 || offsetM + widthM > wallLenM + 1e-3) {
            warnings.push(`door[${i}] dropped — span [${offsetM.toFixed(2)}, ${(offsetM + widthM).toFixed(2)}] m does not fit merged host wall (${wallLenM.toFixed(2)} m)`);
            return;
        }
        doorPlan.push({
            wallRef: mergedRef,
            offset: offsetM,
            width: widthM,
            height: doorHeightM,
            sillHeight: 0,
            doorType: 'single',
            ...(d.name ? { name: d.name } : {}),
            // T1.D — carry the room types so the per-pair finish resolver can
            // pick a privacy door for wet rooms / glazed door for kitchens.
            ...(d.roomTypeA ? { roomTypeA: d.roomTypeA } : {}),
            ...(d.roomTypeB ? { roomTypeB: d.roomTypeB } : {}),
        });
    });

    const wallCommand: CommandPayloadRef = {
        command: 'wall.batch.create',
        payload: { walls, levelId: opts.levelId },
    };

    return {
        wallCommand,
        walls,
        doorPlan,
        totalElementCount: walls.length + doorPlan.length,
        warnings,
    };
}

// ── A6-wire — the dispatchable command SET (pre-minted ids, no read-back) ──────
//
// The execute handler resolves each door's host wall by PRE-MINTING wall ids and
// referencing them directly — so the whole layout is one flat, ordered command
// sequence with NO store read-back (deterministic; no batch-timing coupling).
// `mintId` is injected (createId('wall'|'door'|'opening') from @pryzm/schemas in
// production; a deterministic stub in tests) so this stays pure + Node-testable.

export type IdPrefix = 'wall' | 'door' | 'opening';
export type IdMinter = (prefix: IdPrefix) => string;

/** A single dispatchable bus command (verb + payload). */
export interface LayoutCommand {
    readonly command: string;
    readonly payload: unknown;
}

export interface LayoutCommandSet {
    readonly levelId: string;
    /** `wall.batch.create` with pre-minted wall ids. */
    readonly wallBatch: LayoutCommand;
    /** One `wall.createOpening` per door (reserves opening id + door elementId). */
    readonly openingCommands: readonly LayoutCommand[];
    /** `door.batch.create` for all doors, or null when there are none. */
    readonly doorBatch: LayoutCommand | null;
    /** One virtual room-bounding line per open-plan threshold (the editor uses the
     *  legacy `CreateRoomBoundingLineCommand` to materialise these — they have NO
     *  bus verb yet). Carries `{id, levelId, start:{x,z}, end:{x,z}}` in METRES. */
    readonly boundaryCommands: readonly LayoutCommand[];
    /** Minted wall ids, index-aligned with the plan's kept walls. */
    readonly wallIds: readonly string[];
    /** Minted door ids, index-aligned with `doorPlan`. */
    readonly doorIds: readonly string[];
    /** walls + doors — feeds BatchCoordinator.runBatch totalElementCount. */
    readonly totalElementCount: number;
    /** Dropped/degenerate inputs (loud-fail-soft; from buildLayoutPlan). */
    readonly warnings: readonly string[];
}

/**
 * Build the full dispatchable command set for a chosen option. Composes
 * `buildLayoutPlan` (mm→m + drops) then pre-mints ids so doors reference their
 * host walls directly. Door `wall.createOpening` opening.elementId === the door
 * id (required by the C15 cascade so undo removes both). Pure + deterministic.
 */
export function buildLayoutCommands(
    option: LayoutOption,
    opts: LayoutExecuteOptions,
    mintId: IdMinter,
): LayoutCommandSet {
    const plan = buildLayoutPlan(option, opts);

    const wallIds = plan.walls.map(() => mintId('wall'));
    const wallsWithIds = plan.walls.map((w, i) => ({ ...w, id: wallIds[i]!, levelId: opts.levelId }));
    const wallBatch: LayoutCommand = {
        command: 'wall.batch.create',
        payload: { walls: wallsWithIds, levelId: opts.levelId },
    };

    // §APARTMENT-DOOR-DEFAULT (2026-05-28): pick the door system type. Empty
    // string ⇒ omit and let the handler apply its own default. Non-empty
    // string ⇒ stamp on every door so all generated doors carry the same
    // finish (default = 'solid-timber' = "Solid Timber (Default)").
    const resolvedDoorSysType = opts.doorSystemTypeId !== undefined
        ? opts.doorSystemTypeId
        : DEFAULT_DOOR_SYSTEM_TYPE_ID;
    const stampDoorSysType: { systemTypeId: string } | Record<string, never> =
        resolvedDoorSysType ? { systemTypeId: resolvedDoorSysType } : {};

    const openingCommands: LayoutCommand[] = [];
    const doors: unknown[] = [];
    const doorIds: string[] = [];
    for (const d of plan.doorPlan) {
        const wallId = wallIds[d.wallRef]!;
        const openingId = mintId('opening');
        const doorId = mintId('door');
        doorIds.push(doorId);
        openingCommands.push({
            command: 'wall.createOpening',
            payload: {
                wallId,
                opening: {
                    id: openingId,
                    type: 'door',
                    offset: d.offset,
                    width: d.width,
                    height: d.height,
                    sillHeight: d.sillHeight,
                    elementId: doorId,        // === door id (C15 cascade)
                    doorType: d.doorType,
                },
            },
        });
        // T1.D (2026-05-30) — per-pair finish resolver. When the door knows
        // both room types (D-TGL path populates them via emitGeometry), pick
        // the privacy / glazed / solid finish from the resolver. Otherwise
        // fall through to the legacy global `stampDoorSysType` so AI and
        // procedural-fallback paths still ship a working door.
        const perPairSysType = (d.roomTypeA && d.roomTypeB)
            ? { systemTypeId: defaultDoorSystemTypeId(d.roomTypeA, d.roomTypeB) }
            : stampDoorSysType;
        doors.push({
            id: doorId,
            wallId,
            openingId,
            offset: d.offset,
            width: d.width,
            height: d.height,
            sillHeight: d.sillHeight,
            doorType: d.doorType,
            ...perPairSysType,
            ...(d.name ? { name: d.name } : {}),
        });
    }
    const doorBatch: LayoutCommand | null =
        doors.length > 0 ? { command: 'door.batch.create', payload: { doors } } : null;

    // Virtual room-bounding lines (open-plan splitters). LayoutBoundary is in mm in
    // the LayoutOption; the editor's `CreateRoomBoundingLineCommand` takes METRES,
    // so we divide by MM_PER_M here exactly like buildLayoutPlan does for doors.
    // RoomBoundingLine is not a `@pryzm/schemas` ElementType, so we mint ids INLINE
    // (just a string id, the legacy command stamps the canonical mark itself).
    const boundaryCommands: LayoutCommand[] = [];
    for (let i = 0; i < (option.boundaries ?? []).length; i++) {
        const b = option.boundaries![i]!;
        boundaryCommands.push({
            command: 'roomBoundingLine.create',           // legacy-sync path; no bus verb yet
            payload: {
                id: `rbl_${opts.levelId}_${i}_${Math.random().toString(36).slice(2, 10)}`,
                levelId: opts.levelId,
                start: { x: b.start.x / MM_PER_M, z: b.start.y / MM_PER_M },
                end:   { x: b.end.x   / MM_PER_M, z: b.end.y   / MM_PER_M },
            },
        });
    }

    return {
        levelId: opts.levelId,
        wallBatch,
        openingCommands,
        doorBatch,
        boundaryCommands,
        wallIds,
        doorIds,
        totalElementCount: plan.totalElementCount,
        warnings: plan.warnings,
    };
}
