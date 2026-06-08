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

    const polygon = ensureCCW(this._payload.polygon);
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
