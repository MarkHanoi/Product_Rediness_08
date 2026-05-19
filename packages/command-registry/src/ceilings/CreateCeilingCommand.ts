/**
 * CreateCeilingCommand
 *
 * Contract: docs/01_ELEMENTS/12_Ceilings/04-CEILING-TOOL-STATE-MACHINE-CONTRACT.md §4.1
 *
 * Spatial registration order (MANDATORY §R-3):
 * ① ceilingStore.add()
 * ② bimManager.registerElement()
 * ③ elementRegistry.registerSemantic()
 *
 * Undo reversal order (MANDATORY §R-3):
 * ① elementRegistry.unregister()
 * ② bimManager.unregisterElement()
 * ③ ceilingStore.remove()
 */

import {
  Command,
  CommandType,
  CommandValidationResult,
  CommandResult,
  SerializedCommand,
  CommandContext,
} from '../types';
import { CeilingData, CeilingBoundary, CeilingFinishSpec, CeilingLayer, CeilingHoleElement, CeilingIfcData, CeilingVertex } from '@pryzm/core-app-model';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { ensureCeilingCCW as ensureCCW, validateCeilingPolygon as validatePolygon } from '@pryzm/core-app-model';

export interface CreateCeilingPayload {
  /** Pre-generated UUID — MUST come from the calling tool. Never generate here. */
  ceilingId: string;
  /** Pre-generated IFC GUID — stable across undo/redo cycles. */
  ifcGuid: string;
  polygon: CeilingVertex[];
  height: number;
  thickness?: number;
  baseOffset?: number;
  levelId: string;
  label?: string;
  systemTypeId?: string;
  layers?: CeilingLayer[];
  finishSpec?: Partial<CeilingFinishSpec>;
  holeElements?: CeilingHoleElement[];
  /** Room this ceiling is linked to — finish data is absorbed from the room at creation time. */
  hostRoomId?: string;
  createdBy?: string;
}

const HOLE_SEMANTIC_MAP: Record<string, string> = {
  'light-fixture':   'ceiling-light-fixture',
  'hvac-diffuser':   'ceiling-hvac-diffuser',
  'skylight':        'ceiling-skylight',
  'access-hatch':    'ceiling-access-hatch',
  'structural-beam': 'ceiling-structural-beam',
  'generic':         'ceiling-hole',
};

export class CreateCeilingCommand implements Command {
    readonly affectedStores = ["ceiling"] as const;
  readonly id: string;
  readonly type = CommandType.CREATE_CEILING;
  readonly timestamp: number;
  readonly targetIds: string[];

  constructor(private readonly _payload: CreateCeilingPayload) {
    this.id = `cmd-ceiling-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    this.timestamp = Date.now();
    this.targetIds = [_payload.ceilingId];
  }

  canExecute(context: CommandContext): CommandValidationResult {
    const { ceilingStore } = context.stores;
    if (!ceilingStore) return { ok: false, reason: 'CeilingStore not available in CommandContext.' };

    const levelId = this._payload.levelId || context.projectContext.activeLevelId;
    if (!levelId) return { ok: false, reason: 'Missing levelId.' };

    const level = context.bimManager.getLevelById(levelId);
    if (!level) return { ok: false, reason: `Level "${levelId}" not found in BimManager.` };

    const polyValidation = validatePolygon(this._payload.polygon);
    if (!polyValidation.valid) {
      return { ok: false, reason: `Invalid polygon: ${polyValidation.reasons.join('; ')}` };
    }

    if (this._payload.height === undefined || this._payload.height <= 0) {
      return { ok: false, reason: 'Ceiling height must be > 0.' };
    }

    return { ok: true };
  }

  execute(context: CommandContext): CommandResult {
    const { ceilingStore } = context.stores;
    if (!ceilingStore) throw new Error('[CreateCeilingCommand] CeilingStore not available.');

    const levelId = this._payload.levelId || context.projectContext.activeLevelId;
    if (!levelId) throw new Error('SpatialAuthorityError: Missing levelId.');

    const level = context.bimManager.getLevelById(levelId);
    if (!level) throw new Error(`SpatialAuthorityError: Level "${levelId}" not found.`);

    const ceilingId = this._payload.ceilingId;
    const now = Date.now();

    const polygon = ensureCCW(this._payload.polygon);
    const thickness = this._payload.thickness ?? 0.025;

    const layers = this._payload.systemTypeId && this._payload.layers
      ? structuredClone(this._payload.layers)
      : this._payload.layers
        ? structuredClone(this._payload.layers)
        : undefined;

    // Absorb room finish data if this ceiling is linked to a room
    let roomMaterialName: string | undefined;
    let roomMaterialColor: string | undefined;
    if (this._payload.hostRoomId) {
      const roomStore = (context.stores as any).roomStore;
      const room = roomStore?.getById(this._payload.hostRoomId);
      if (room?.finishes?.ceiling) {
        roomMaterialName = room.finishes.ceiling.materialName;
        roomMaterialColor = room.finishes.ceiling.materialColor;
      }
    }

    const finishSpec: CeilingFinishSpec = {
      exposedStructure: false,
      soffitColor: roomMaterialColor ?? '#F5F5F0',
      soffitPattern: 'none',
      ...this._payload.finishSpec,
      ...(roomMaterialName ? { materialName: roomMaterialName } : {}),
    };

    const ifcData: CeilingIfcData = {
      guid: this._payload.ifcGuid,
      ifcClass: 'IfcCovering',
      predefinedType: 'CEILING',
    };

    const ceilingCount = ceilingStore.getAll().length + 1;
    const label = this._payload.label ?? `Ceiling-${ceilingCount.toString().padStart(2, '0')}`;

    const boundary: CeilingBoundary = {
      polygon,
      height: this._payload.height,
      thickness,
      baseOffset: this._payload.baseOffset ?? 0,
      detectionMethod: 'manual-polygon',
    };

    const newCeiling: CeilingData = {
      id: ceilingId,
      type: 'ceiling',
      levelId,
      parentId: levelId,
      label,
      ceilingNumber: '',
      boundary,
      systemTypeId: this._payload.systemTypeId,
      layers,
      finishSpec,
      holeElements: this._payload.holeElements ? structuredClone(this._payload.holeElements) : [],
      coveredRoomIds: this._payload.hostRoomId ? [this._payload.hostRoomId] : [],
      boundingWallIds: [],
      hostRoomId: this._payload.hostRoomId,
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

    // § Spatial registration order ①②③
    ceilingStore.add(newCeiling);
    context.bimManager.registerElement(ceilingId, levelId);
    try {
      elementRegistry.registerSemantic(ceilingId, 'ceiling');
    } catch {
      // Already registered on redo — safe to ignore.
    }

    // Register hole sub-elements.
    for (const hole of newCeiling.holeElements) {
      try {
        context.bimManager.registerElement(hole.elementId, levelId);
        elementRegistry.registerSemantic(hole.elementId, (HOLE_SEMANTIC_MAP[hole.subType] ?? 'ceiling') as any);
      } catch {
        // Already registered — safe to ignore.
      }
    }

    return { success: true, affectedElementIds: [ceilingId] };
  }

  undo(context: CommandContext): CommandResult {
    const { ceilingStore } = context.stores;
    if (!ceilingStore) throw new Error('[CreateCeilingCommand.undo] CeilingStore not available.');

    const ceilingId = this._payload.ceilingId;
    const existing = ceilingStore.getById(ceilingId);
    if (!existing) {
      console.warn(`[CreateCeilingCommand.undo] Ceiling "${ceilingId}" not found — already removed?`);
      return { success: true, affectedElementIds: [] };
    }

    // Undo reversal order ①②③
    try { elementRegistry.unregister(ceilingId); } catch { /* already unregistered */ }
    for (const hole of existing.holeElements) {
      try { elementRegistry.unregister(hole.elementId); } catch { /* already unregistered */ }
      try { context.bimManager.unregisterElement(hole.elementId); } catch { /* already unregistered */ }
    }
    try { context.bimManager.unregisterElement(ceilingId); } catch { /* already unregistered */ }
    ceilingStore.remove(ceilingId);

    return { success: true, affectedElementIds: [ceilingId] };
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
