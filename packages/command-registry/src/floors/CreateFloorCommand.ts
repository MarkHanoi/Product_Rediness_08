/**
 * CreateFloorCommand
 *
 * Contract: docs/01_ELEMENTS/08_Floors_Contract/03-FLOOR-COMMAND-PIPELINE-CONTRACT.md §4.1
 *
 * Spatial registration order (MANDATORY):
 * ① floorStore.add()
 * ② bimManager.registerElement()
 * ③ elementRegistry.registerSemantic()
 *
 * Undo reversal order (MANDATORY):
 * ① elementRegistry.unregister()
 * ② bimManager.unregisterElement()
 * ③ floorStore.remove()
 */

import {
  Command,
  CommandType,
  CommandValidationResult,
  CommandResult,
  SerializedCommand,
  CommandContext,
} from '../types';
import {
  FloorData,
  FloorBoundary,
  FloorFinishSpec,
  FloorLayer,
  FloorServiceHole,
  FloorIfcData,
  FloorVertex,
} from '@pryzm/core-app-model';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { ensureFloorCCW as ensureCCW, validateFloorPolygon as validatePolygon } from '@pryzm/core-app-model';
import { resolveFinishSeating, DEFAULT_FINISH_THICKNESS_M } from '@pryzm/core-app-model';
// §FIX-FLOOR-FINISH-INNER-FACE-ALL-PATHS (L-240) — the inner-face inset is a DOMAIN RULE of
// the floor-finish element type, so it is resolved HERE (the single create chokepoint), not
// in each tool. `@pryzm/room-topology` is an existing declared dependency of this package
// (CreateFloorsByRoomTypeCommand already imports it); both symbols are called at execute()
// time only, never at module evaluation, so the command-registry ↔ room-topology cycle is
// not exercised at load (see MEMORY §SCC: no barrel access at module load).
import { resolveRoomFinishBoundary, ringsCoincide, type RoomFinishWall } from '@pryzm/room-topology';

export interface CreateFloorPayload {
  /** Pre-generated UUID — MUST come from the calling tool. Never generate here. */
  floorId: string;
  /** Pre-generated IFC GUID — stable across undo/redo cycles. */
  ifcGuid: string;
  polygon: FloorVertex[];
  /** Y offset above level datum (m). FFL = level.elevation + baseOffset.
   *  §A.21.D48: when OMITTED, the finish is auto-seated on the slab top so its
   *  bottom rests at the slab top and it stacks UP by `finishThicknessM` (no
   *  overlap with the slab). Pass an explicit value to pin the finish manually. */
  baseOffset?: number;
  /** Assembly thickness (m). §A.21.D48: when OMITTED the floor is treated as a
   *  thin applied FINISH (see `finishThicknessM`), NOT a 75 mm structural floor.
   *  Pass an explicit value for a structural / authored-thickness floor. */
  thickness?: number;
  /** §A.21.D48 — applied finish thickness (m) for the bare finish path. Default
   *  0.015 (15 mm). Ignored when an explicit `thickness` or `layers` is supplied. */
  finishThicknessM?: number;
  /** §A.21.D48 — slab TOP face offset relative to the level datum (m). The finish
   *  is seated on top of this. Default 0 (default slab top = level datum). */
  slabTopOffsetM?: number;
  levelId: string;
  label?: string;
  systemTypeId?: string;
  layers?: FloorLayer[];
  finishSpec?: Partial<FloorFinishSpec>;
  serviceHoles?: FloorServiceHole[];
  /** The structural slab directly below this floor finish (SLAB BINDING CONSTRAINT). */
  hostSlabId?: string;
  /** Room this floor is linked to — finish data is absorbed from the room at creation time. */
  hostRoomId?: string;
  /**
   * §FIX-FLOOR-FINISH-INNER-FACE-ALL-PATHS (L-240) — what `polygon` MEANS. This is the
   * caller's declaration of INTENT, not a geometry switch:
   *
   *   • `'room-centreline'` — `polygon` is the host room's boundary ring, which runs along
   *     the wall CENTRELINES. The command derives the real finish boundary from it by
   *     insetting each edge to its bounding wall's INNER FACE. Every room-derived path
   *     (3D FloorTool AUTO_FROM_ROOM, CreateFloorsByRoomTypeCommand, any future tool that
   *     floors a room) declares this.
   *   • `'explicit-polygon'` — `polygon` is the user's / the file's stated geometry and is
   *     stored VERBATIM. Hand-drawn floors (3D FloorTool DRAW), room-independent finishes
   *     (roof decks, lobby discs), project load, IFC import and paste declare this.
   *
   * OMITTED → the command infers: a polygon that IS the host room's centreline ring
   * (`ringsCoincide`) is a room-derived boundary whose author forgot to say so — exactly the
   * L-240 defect — and is inset. Anything else is stored verbatim. This is what makes the
   * rule impossible for a future tool to bypass by omission.
   */
  boundarySource?: 'room-centreline' | 'explicit-polygon';
  createdBy?: string;
}

export class CreateFloorCommand implements Command {
    readonly affectedStores = ["floor"] as const;
  readonly id: string;
  readonly type = CommandType.CREATE_FLOOR;
  readonly timestamp: number;
  readonly targetIds: string[];

  constructor(private readonly _payload: CreateFloorPayload) {
    this.id = `cmd-floor-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    this.timestamp = Date.now();
    this.targetIds = [_payload.floorId];
  }

  canExecute(context: CommandContext): CommandValidationResult {
    const { floorStore } = context.stores as any;
    if (!floorStore) return { ok: false, reason: 'FloorStore not available in CommandContext.' };

    const levelId = this._payload.levelId || context.projectContext.activeLevelId;
    if (!levelId) return { ok: false, reason: 'Missing levelId.' };

    const level = context.bimManager.getLevelById(levelId);
    if (!level) return { ok: false, reason: `Level "${levelId}" not found in BimManager.` };

    const polyValidation = validatePolygon(this._payload.polygon);
    if (!polyValidation.valid) {
      return { ok: false, reason: `Invalid polygon: ${polyValidation.reasons.join('; ')}` };
    }

    // §A.21.D48 — bare finish floors default to a thin applied finish thickness,
    // not the legacy 75 mm structural default; explicit thickness still validated.
    const thickness = this._payload.thickness ?? this._payload.finishThicknessM ?? DEFAULT_FINISH_THICKNESS_M;
    if (thickness <= 0) {
      return { ok: false, reason: 'Floor thickness must be > 0.' };
    }

    return { ok: true };
  }

  execute(context: CommandContext): CommandResult {
    const { floorStore } = context.stores as any;
    if (!floorStore) throw new Error('[CreateFloorCommand] FloorStore not available.');

    const levelId = this._payload.levelId || context.projectContext.activeLevelId;
    if (!levelId) throw new Error('SpatialAuthorityError: Missing levelId.');

    const level = context.bimManager.getLevelById(levelId);
    if (!level) throw new Error(`SpatialAuthorityError: Level "${levelId}" not found.`);

    const floorId = this._payload.floorId;
    const now = Date.now();

    // §FIX-FLOOR-FINISH-INNER-FACE-ALL-PATHS (L-240) — THE chokepoint. A floor finish is
    // bounded by the INNER FACES of its bounding walls; that is a rule of the element type,
    // so it is applied here, once, for every creation path — not re-implemented per tool
    // (which is how L-213 left the 3D FloorTool AUTO path shipping the raw centreline).
    // Derivation happens BEFORE ensureCCW, exactly as the batch path did it, so the batch
    // output is byte-identical.
    const polygon = ensureCCW(this._resolveBoundary(context));
    // §A.21.D48 — seat the finish ON the slab top: a thin finish whose BOTTOM rests
    // at the slab top (no shared volume → no Z-fighting, clash-detectable). Explicit
    // thickness / baseOffset / layers are honoured verbatim (structural / IFC paths).
    const { thickness, baseOffset } = resolveFinishSeating({
      finishThicknessM: this._payload.finishThicknessM,
      thickness: this._payload.thickness,
      baseOffset: this._payload.baseOffset,
      hasLayers: !!(this._payload.layers && this._payload.layers.length > 0),
      slabTopOffsetM: this._payload.slabTopOffsetM,
    });

    const layers = this._payload.layers
      ? structuredClone(this._payload.layers)
      : undefined;

    // Absorb room finish data if this floor is linked to a room
    let roomMaterialName: string | undefined;
    let roomMaterialColor: string | undefined;
    if (this._payload.hostRoomId) {
      const roomStore = (context.stores as any).roomStore;
      const room = roomStore?.getById(this._payload.hostRoomId);
      if (room?.finishes?.floor) {
        roomMaterialName = room.finishes.floor.materialName;
        roomMaterialColor = room.finishes.floor.materialColor;
      }
    }

    const finishSpec: FloorFinishSpec = {
      finishColor: roomMaterialColor ?? '#D4C4A8',
      finishPattern: 'none',
      exposedScreed: false,
      ...this._payload.finishSpec,
      ...(roomMaterialName ? { materialName: roomMaterialName } : {}),
    };

    const ifcData: FloorIfcData = {
      guid: this._payload.ifcGuid,
      ifcClass: 'IfcCovering',
      predefinedType: 'FLOORING',
    };

    const floorCount = floorStore.getAll().length + 1;
    const label = this._payload.label ?? `Floor-${floorCount.toString().padStart(2, '0')}`;

    const boundary: FloorBoundary = {
      polygon,
      baseOffset,
      thickness,
      detectionMethod: 'manual-polygon',
    };

    const newFloor: FloorData = {
      id: floorId,
      type: 'floor',
      levelId,
      parentId: levelId,
      label,
      floorNumber: `F.${floorCount.toString().padStart(2, '0')}`,
      boundary,
      systemTypeId: this._payload.systemTypeId,
      layers,
      finishSpec,
      slope: undefined,
      serviceHoles: this._payload.serviceHoles ? structuredClone(this._payload.serviceHoles) : [],
      coveredRoomIds: this._payload.hostRoomId ? [this._payload.hostRoomId] : [],
      boundingWallIds: [],
      hostSlabId: this._payload.hostSlabId,
      hostRoomId: this._payload.hostRoomId,
      colour: undefined,
      opacity: 1,
      visible: true,
      properties: {},
      ifcData,
      metadata: {
        createdAt: now,
        modifiedAt: now,
        createdBy: this._payload.createdBy ?? 'user',
        version: 1,
      },
    };

    // §01 §5 Spatial registration order ①②③
    floorStore.add(newFloor);
    context.bimManager.registerElement(floorId, levelId);
    try {
      elementRegistry.registerSemantic(floorId, 'floor');
    } catch {
      // Already registered on redo — safe to ignore.
    }

    return { success: true, affectedElementIds: [floorId] };
  }

  /**
   * §FIX-FLOOR-FINISH-INNER-FACE-ALL-PATHS (L-240) — resolve the floor's stored boundary
   * from the payload's DECLARED intent (see `boundarySource`).
   *
   * Room-derived boundary  → inset the centreline ring to the bounding walls' inner faces
   *                          via the single canonical `resolveRoomFinishBoundary`.
   * Explicit / user-drawn  → returned VERBATIM. A hand-drawn polygon is the user's stated
   *                          geometry and is never silently re-inset (C11 §Floor-finish
   *                          boundary). Hosting a drawn floor in a room (FloorTool's
   *                          centroid autodetect) is a LINK, not a re-derivation.
   *
   * Fail-safe on every branch: returns the payload polygon unchanged, so a floor is always
   * created. Never applies a second offset — it only ever insets a ring it has PROVEN to be
   * a centreline, so "converge, don't compensate" holds by construction.
   */
  private _resolveBoundary(context: CommandContext): FloorVertex[] {
    const src = this._payload.polygon;
    const hostRoomId = this._payload.hostRoomId;
    // No host room → nothing to derive from (roof decks, lobby discs, IFC slabs, paste).
    if (!hostRoomId || !src || src.length < 3) return src;
    if (this._payload.boundarySource === 'explicit-polygon') return src;

    const roomStore = (context.stores as any).roomStore as
      | { getById?: (id: string) => { boundary?: { polygon?: Array<{ x: number; z: number }> }; boundingWallIds?: string[] } | undefined }
      | undefined;
    const wallStore = (context.stores as any).wallStore as
      | { getById?: (id: string) => RoomFinishWall | undefined; getByLevel?: (levelId: string) => RoomFinishWall[] }
      | undefined;
    if (!roomStore || !wallStore) return src;

    if (this._payload.boundarySource !== 'room-centreline') {
      // UNDECLARED payload — infer. A polygon that IS the host room's centreline ring is a
      // room-derived boundary that forgot to declare itself (the L-240 defect shape). Any
      // correctly-inset finish lies strictly inside the ring, so it can never match here →
      // an already-derived boundary can never be inset twice.
      const centreline = roomStore.getById?.(hostRoomId)?.boundary?.polygon;
      if (!ringsCoincide(src, centreline)) return src;
    }

    const levelId = this._payload.levelId || context.projectContext.activeLevelId;
    const derived = resolveRoomFinishBoundary(
      src.map(v => ({ x: v.x, z: v.z })),
      {
        roomId: hostRoomId,
        levelId,
        lookup: {
          getRoomById:    (id) => roomStore.getById?.(id),
          getWallById:    (id) => wallStore.getById?.(id),
          getWallsByLevel: (lid) => wallStore.getByLevel?.(lid) ?? [],
        },
      },
    );
    return derived.length >= 3 ? (derived as FloorVertex[]) : src;
  }

  undo(context: CommandContext): CommandResult {
    const { floorStore } = context.stores as any;
    if (!floorStore) throw new Error('[CreateFloorCommand.undo] FloorStore not available.');

    const floorId = this._payload.floorId;
    const existing = floorStore.getById(floorId);
    if (!existing) {
      console.warn(`[CreateFloorCommand.undo] Floor "${floorId}" not found — already removed?`);
      return { success: true, affectedElementIds: [] };
    }

    // Undo reversal order ①②③
    try { elementRegistry.unregister(floorId); } catch { /* already unregistered */ }
    try { context.bimManager.unregisterElement(floorId); } catch { /* already unregistered */ }
    floorStore.remove(floorId);

    return { success: true, affectedElementIds: [floorId] };
  }

  serialize(): SerializedCommand {
    return {
      type: this.type,
      payload: { ...this._payload },
      targetIds: this.targetIds,
      timestamp: this.timestamp,
      version: 1,
    };
  }
}
