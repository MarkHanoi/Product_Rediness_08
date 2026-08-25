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
import { CeilingData, CeilingBoundary, CeilingFinishSpec, CeilingLayer, CeilingHoleElement, CeilingIfcData, CeilingVertex, CeilingSketch } from '@pryzm/core-app-model';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { ensureCeilingCCW as ensureCCW, validateCeilingPolygon as validatePolygon } from '@pryzm/core-app-model';
// §FIX-CEILING-INNER-FACE-PARITY (2026-08-06) — the inner-face inset is a DOMAIN RULE of
// room-hosted finish elements (floor AND ceiling), so it is resolved HERE (the single
// ceiling-create chokepoint), exactly as `CreateFloorCommand` does (L-240). Both symbols
// are called at execute() time only, never at module evaluation, so the command-registry ↔
// room-topology cycle is not exercised at load (MEMORY §SCC: no barrel access at module load).
import { resolveRoomFinishBoundary, ringsCoincide, curtainWallAsRoomFinishWall, type RoomFinishWall } from '@pryzm/room-topology';
// §REGION-HOST-ATTRIBUTION (C79 §6.3 row 7) — the SAME shared builder the floor uses.
// Not a copy: C79 §3.4 requires one edge shape per relationship, and §7.4 forbids a
// field being populated correctly on one path and not another. See the §10.3 design
// decision (DERIVE FROM THE ROOM) recorded in `roomBoundarySketch.ts`.
import {
  buildRoomFinishBoundarySketch,
  formatFinishBoundaryAttributionReport,
  type IdentifiedFinishWall,
} from '../rooms/roomBoundarySketch';

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
  /**
   * §FIX-CEILING-INNER-FACE-PARITY (2026-08-06) — what `polygon` MEANS, mirroring
   * `CreateFloorPayload.boundarySource` (L-240) verbatim:
   *
   *   • `'room-centreline'` — `polygon` is the host room's boundary ring (wall
   *     CENTRELINES). The command insets it to the bounding walls' INNER FACES via the
   *     ONE canonical `resolveRoomFinishBoundary` — the SAME derivation the floor uses,
   *     so a room's floor and ceiling boundaries are identical by construction.
   *   • `'explicit-polygon'` — the user's / the file's stated geometry, stored VERBATIM.
   *
   * OMITTED → inferred: a polygon that IS the host room's centreline ring
   * (`ringsCoincide`) is a room-derived boundary whose author forgot to say so, and is
   * inset. Anything else is stored verbatim. Makes the rule impossible to bypass by
   * omission (the L-240 lesson).
   */
  boundarySource?: 'room-centreline' | 'explicit-polygon';
  /**
   * §DUP-CARRIES-THE-RELATIONSHIP (C79 §5 / §2.1) — the VERBATIM mirror of
   * `CreateFloorPayload.hostReferences`, and a mirror by requirement rather than by
   * taste: C79 §3.4 gives one relationship one edge shape, and §7.4 forbids a field
   * being honoured on one family's path and not the other's. The rationale is
   * written out once, on the floor payload; read it there.
   */
  hostReferences?: {
    sketch: CeilingSketch;
    boundingWallIds: string[];
  };
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

    // §FIX-CEILING-INNER-FACE-PARITY — THE chokepoint. A room-hosted ceiling finish is
    // bounded by the INNER FACES of its bounding walls, exactly like the floor finish
    // (CreateFloorCommand, L-240). Derivation happens BEFORE ensureCCW so the output is
    // byte-identical to the floor path for the same room.
    const polygon = ensureCCW(this._resolveBoundary(context));
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

    // §REGION-HOST-ATTRIBUTION (C79 §1.1, §2, §3, §4.3) — same chokepoint, same
    // shared builder as the floor. `boundingWallIds` was `[]` UNCONDITIONALLY here
    // (C79 §7.1's named anti-pattern) and `CeilingData.sketch` — reference-capable,
    // carrying all five §1.1 facts — was never written by any path.
    const sketch = this._buildBoundarySketch(context, polygon);

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
      sketch: sketch.outerLoop.edges.length > 0 ? { outerLoop: sketch.outerLoop } : undefined,
      coveredRoomIds: this._payload.hostRoomId ? [this._payload.hostRoomId] : [],
      // §7.2(a) POPULATE — exactly the walls that produced an edge of THIS ceiling's
      // boundary. A measured zero with a named reason, not an unconditional literal.
      boundingWallIds: sketch.boundingWallIds,
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

  /**
   * §FIX-CEILING-INNER-FACE-PARITY — resolve the ceiling's stored boundary from the
   * payload's DECLARED intent. VERBATIM mirror of `CreateFloorCommand._resolveBoundary`
   * (L-240): room-derived centreline ring → inset to the bounding walls' inner faces via
   * the single canonical `resolveRoomFinishBoundary`; explicit/user-drawn → returned
   * unchanged. Fail-safe on every branch (a ceiling is always created); never applies a
   * second offset — it only insets a ring PROVEN to be a centreline.
   */
  private _resolveBoundary(context: CommandContext): CeilingVertex[] {
    const src = this._payload.polygon;
    const hostRoomId = this._payload.hostRoomId;
    // No host room → nothing to derive from (drawn ceilings, import, paste).
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
      // UNDECLARED payload — infer (see CreateFloorCommand). A correctly-inset finish
      // lies strictly inside the centreline ring, so it can never be inset twice.
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
          // §CW90 item 4 — see CreateFloorCommand: curtain walls are
          // room-bounding, so the finish lookup falls through to the
          // curtain-wall store (mullion face) on a wall-store miss.
          getWallById:    (id) => wallStore.getById?.(id)
              ?? curtainWallAsRoomFinishWall(
                  (context.stores as any).curtainWallStore?.getById?.(id)
                  ?? (context.stores as any).curtainWallStore?.get?.(id)),
          getWallsByLevel: (lid) => wallStore.getByLevel?.(lid) ?? [],
        },
      },
    );
    return derived.length >= 3 ? (derived as CeilingVertex[]) : src;
  }

  /**
   * §REGION-HOST-ATTRIBUTION (C79 §6.3 row 7) — VERBATIM mirror of
   * `CreateFloorCommand._buildBoundarySketch`, routing through the SAME shared
   * builder, so a room's floor and ceiling carry byte-identical references for the
   * same walls (§3.4) and neither path can drift from the other (§7.4).
   */
  private _buildBoundarySketch(context: CommandContext, polygon: CeilingVertex[]) {
    // §DUP-CARRIES-THE-RELATIONSHIP — mirrors `CreateFloorCommand._buildBoundarySketch`.
    // First, so the room path cannot run and cannot mint a rival attribution (§7.4).
    const carried = this._payload.hostReferences;
    if (carried) {
      return {
        outerLoop: carried.sketch.outerLoop,
        boundingWallIds: carried.boundingWallIds,
      };
    }

    const roomStore = (context.stores as any).roomStore as
      | { getById?: (id: string) => { boundingWallIds?: string[] } | undefined }
      | undefined;
    const wallStore = (context.stores as any).wallStore as
      | { getById?: (id: string) => IdentifiedFinishWall | undefined }
      | undefined;

    const sketch = buildRoomFinishBoundarySketch(
      polygon.map(v => ({ x: v.x, z: v.z })),
      this._payload.hostRoomId,
      {
        getRoomById: (id) => roomStore?.getById?.(id),
        getWallById: (id) => {
          const w = wallStore?.getById?.(id);
          return w ? ({ ...w, id: w.id ?? id } as IdentifiedFinishWall) : undefined;
        },
      },
    );

    // §2.6 — counts REPORTED, never absorbed (diag-gated like the floor path).
    const g = globalThis as unknown as { __pryzmLayoutDiag?: boolean; __pryzmCeilingDiag?: boolean };
    if ((g.__pryzmLayoutDiag === true || g.__pryzmCeilingDiag === true) && typeof console !== 'undefined') {
      console.log(formatFinishBoundaryAttributionReport('ceiling', sketch.attribution));
    }
    return sketch;
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
