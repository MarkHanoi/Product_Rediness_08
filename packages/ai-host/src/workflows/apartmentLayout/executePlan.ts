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

const MM_PER_M = 1000;

/** Matches CreateWallBatch's endpoint-distance guard (≥ 0.05 m in XZ). */
export const MIN_WALL_LENGTH_M = 0.05;
export const DEFAULT_WALL_HEIGHT_M = 2.7;
export const DEFAULT_WALL_THICKNESS_M = 0.1;
export const DEFAULT_DOOR_HEIGHT_M = 2.1;
export const DEFAULT_DOOR_WIDTH_M = 0.9;

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
    /** plan(mm) → world(m) XZ mapping. Default { x: p.x/1000, z: p.y/1000 }.
     *  Override to apply the shell's origin/rotation frame at the wiring layer. */
    readonly planToWorldXZ?: (p: Vec2mm) => { x: number; z: number };
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
    const walls: WallCreateSpec[] = [];
    const remap: number[] = new Array(option.walls.length).fill(-1);

    option.walls.forEach((w, i) => {
        const s = toWorld(w.start);
        const e = toWorld(w.end);
        const a: Vec3m = { x: s.x, y: baseElevationM, z: s.z };
        const b: Vec3m = { x: e.x, y: baseElevationM, z: e.z };
        if (lengthXZ(a, b) < MIN_WALL_LENGTH_M) {
            warnings.push(`wall[${i}] dropped — length ${lengthXZ(a, b).toFixed(3)} m < ${MIN_WALL_LENGTH_M} m minimum`);
            return;
        }
        remap[i] = walls.length;
        walls.push({
            baseLine: [a, b],
            height: wallHeightM,
            thickness: wallThicknessM,
            // Only set systemTypeId when a real type id was supplied — an unknown
            // id is rejected by wall.batch.create; omitting → the handler default.
            ...(opts.wallTypeId ? { systemTypeId: opts.wallTypeId } : {}),
        });
    });

    // Build the door plan, resolving each door's host wall through the remap.
    const doorPlan: DoorPlanItem[] = [];
    option.doors.forEach((d, i) => {
        if (d.wallRef < 0 || d.wallRef >= option.walls.length) {
            warnings.push(`door[${i}] dropped — wallRef ${d.wallRef} out of range [0, ${option.walls.length})`);
            return;
        }
        const newRef = remap[d.wallRef]!;
        if (newRef === -1) {
            warnings.push(`door[${i}] dropped — host wall[${d.wallRef}] was dropped`);
            return;
        }
        const offsetM = d.offset / MM_PER_M;
        const widthM = (d.width || DEFAULT_DOOR_WIDTH_M * MM_PER_M) / MM_PER_M;
        const host = walls[newRef]!;
        const wallLenM = lengthXZ(host.baseLine[0], host.baseLine[1]);
        if (offsetM < 0 || offsetM + widthM > wallLenM) {
            warnings.push(`door[${i}] dropped — span [${offsetM.toFixed(2)}, ${(offsetM + widthM).toFixed(2)}] m does not fit host wall (${wallLenM.toFixed(2)} m)`);
            return;
        }
        doorPlan.push({
            wallRef: newRef,
            offset: offsetM,
            width: widthM,
            height: doorHeightM,
            sillHeight: 0,
            doorType: 'single',
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
        doors.push({
            id: doorId,
            wallId,
            openingId,
            offset: d.offset,
            width: d.width,
            height: d.height,
            sillHeight: d.sillHeight,
            doorType: d.doorType,
        });
    }
    const doorBatch: LayoutCommand | null =
        doors.length > 0 ? { command: 'door.batch.create', payload: { doors } } : null;

    return {
        levelId: opts.levelId,
        wallBatch,
        openingCommands,
        doorBatch,
        wallIds,
        doorIds,
        totalElementCount: plan.totalElementCount,
        warnings: plan.warnings,
    };
}
