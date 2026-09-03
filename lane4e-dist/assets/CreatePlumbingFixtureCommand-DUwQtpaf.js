import { C as CommandType, bP as validateWardrobeCabinetHeight, bQ as stableCreatedId, i as elementRegistry, aB as resolveFloorSeatingDatum, s as semanticGraphManager, bR as viewDependencyTracker } from './ElementStore-CQe7ZDFd.js';
import './LODManager-DHqndFcX.js';
import './SteelProfileLibrary-NgbfwhrM.js';
import { ah as Euler, V as Vector3 } from './three.core-Bv4ks8y-.js';

function hostIdOf(row) {
  const wallId = typeof row.wallId === "string" ? row.wallId.trim() : "";
  if (wallId.length > 0) return wallId;
  const curtainWallId = typeof row.curtainWallId === "string" ? row.curtainWallId.trim() : "";
  return curtainWallId.length > 0 ? curtainWallId : void 0;
}
function resolveLevelScopeByHost(kind, rows, levelId, levelName, wallLevelOf) {
  const ids = [];
  let orphaned = 0;
  let unplaceable = 0;
  let noWallStore = false;
  for (const row of rows) {
    const own = typeof row.levelId === "string" ? row.levelId.trim() : "";
    if (own.length > 0) {
      if (own === levelId) ids.push(row.id);
      continue;
    }
    const host = typeof row.wallId === "string" ? row.wallId.trim() : "";
    if (host.length === 0) {
      unplaceable += 1;
      continue;
    }
    const hostLevel = wallLevelOf(host);
    if (hostLevel === null) {
      noWallStore = true;
      break;
    }
    if (hostLevel === void 0) {
      orphaned += 1;
      continue;
    }
    if (hostLevel === levelId) ids.push(row.id);
  }
  if (noWallStore) {
    return {
      kind: "refused",
      error: `I can't tell which ${kind}s are on ${levelName} — a ${kind} takes its level from the wall that hosts it, and the wall store isn't available here. Nothing was changed, and nothing about the model is confirmed.`
    };
  }
  const skipped = [];
  if (orphaned > 0) {
    skipped.push({
      kind,
      count: orphaned,
      reason: `the host wall is no longer in the model, so which level they are on is unknown — they were NOT included`
    });
  }
  if (unplaceable > 0) {
    skipped.push({
      kind,
      count: unplaceable,
      reason: `no level and no host wall is recorded for them, so they could not be placed`
    });
  }
  return { kind: "resolved", ids, skipped };
}
function isHostDerivedKind(rows) {
  let sawHost = false;
  for (const row of rows) {
    if (typeof row.levelId === "string" && row.levelId.trim().length > 0) return false;
    if (typeof row.wallId === "string" && row.wallId.trim().length > 0) sawHost = true;
  }
  return sawHost;
}
function resolveOrientationScopeByHost(kind, rows, facadeWallIds, compassWord, wallExists) {
  const facade = new Set(facadeWallIds);
  const ids = [];
  let orphaned = 0;
  let unplaceable = 0;
  let noWallStore = false;
  for (const row of rows) {
    const host = typeof row.wallId === "string" ? row.wallId.trim() : "";
    if (host.length === 0) {
      unplaceable += 1;
      continue;
    }
    if (facade.has(host)) {
      ids.push(row.id);
      continue;
    }
    const exists = wallExists(host);
    if (exists === null) {
      noWallStore = true;
      break;
    }
    if (!exists) {
      orphaned += 1;
      continue;
    }
  }
  if (noWallStore) {
    return {
      kind: "refused",
      error: `I can't tell which ${kind}s are on the ${compassWord} facade — a ${kind} faces the way the wall that hosts it faces, and the wall store isn't available here. Nothing was changed, and nothing about the model is confirmed.`
    };
  }
  const skipped = [];
  if (orphaned > 0) {
    skipped.push({
      kind,
      count: orphaned,
      reason: `the host wall is no longer in the model, so which way they face is unknown — they were NOT included`
    });
  }
  if (unplaceable > 0) {
    skipped.push({
      kind,
      count: unplaceable,
      reason: `no host wall is recorded for them, so which way they face could not be decided`
    });
  }
  return { kind: "resolved", ids, skipped };
}

const FURNITURE_DEFAULTS = {
  dining_table: {
    chairWidth: 0.45,
    chairLength: 0.45,
    chairHeight: 0.9,
    chairOffset: 0.4
  },
  wardrobe: {
    defaultLo3: 200
  }
};
class CreateFurnitureCommand {
  constructor(payload) {
    this.payload = payload;
    this.id = `cmd-furniture-${crypto.randomUUID()}`;
    this.timestamp = Date.now();
    this.targetIds = payload.id ? [payload.id] : [];
  }
  payload;
  affectedStores = ["furniture", "level"];
  id;
  type = CommandType.CREATE_FURNITURE;
  timestamp;
  targetIds;
  createdId;
  createdChildrenIds = [];
  canExecute(context) {
    if (!this.payload.levelId) {
      return { ok: false, reason: "Missing levelId" };
    }
    const level = context.bimManager.getLevelById(this.payload.levelId);
    if (!level) {
      return { ok: false, reason: `Level not found: ${this.payload.levelId}` };
    }
    if (this.payload.wardrobeCabinetConfig) {
      const verdict = validateWardrobeCabinetHeight(this.payload.wardrobeCabinetConfig.height);
      if (!verdict.ok) return { ok: false, reason: verdict.code, blockingIssues: [verdict.reason] };
    }
    return { ok: true };
  }
  execute(context) {
    try {
      const id = stableCreatedId(this, "furniture", this.payload.id);
      const level = context.bimManager.getLevelById(this.payload.levelId);
      if (!level) throw new Error(`Level not found: ${this.payload.levelId}`);
      context.bimManager.registerElement(id, this.payload.levelId);
      try {
        elementRegistry.registerSemantic(id, "furniture");
      } catch {
      }
      const mark = this._generateMark(context);
      const seat = resolveFloorSeatingDatum(
        context,
        this.payload.levelId,
        { x: this.payload.position.x, z: this.payload.position.z }
      );
      const data = {
        id,
        type: "furniture",
        furnitureType: this.payload.furnitureType,
        // A.21.D15 (2026-06-06) — `position.y` is the storey FLOOR datum
        // (the level's elevation). The mount height lives in `baseOffset`
        // and is applied EXACTLY ONCE downstream by FurnitureFragmentBuilder
        // (`root.position.y = position.y + baseOffset`). Previously this
        // baked `+ baseOffset` into position.y AS WELL, so wall-mounted
        // items (mirror/tv/wall_unit/extractor/curtain) double-counted the
        // offset and floated at `floor + 2 × offset`. Floor items
        // (baseOffset 0) were unaffected — which is why only wall-mounted
        // fixtures floated. Anchoring to the floor keeps EVERY storey's
        // fixtures on that storey (level.elevation is per-level).
        position: {
          x: this.payload.position.x,
          // §FIX-FURNITURE-FFL-DEFAULT (L-87) — FFL, not slab top.
          y: seat.y,
          z: this.payload.position.z
        },
        rotation: {
          x: this.payload.rotation.x,
          y: this.payload.rotation.y,
          z: this.payload.rotation.z
        },
        levelId: this.payload.levelId,
        levelName: level.name,
        levelElevation: level.elevation,
        // §FIX-FURNITURE-BASE-OFFSET (L-86) — mount offset defaults to 0
        // (floor-standing). It STACKS on the FFL baseline resolved above, so
        // a floor item sits exactly on the finished floor, never floating.
        baseOffset: this.payload.baseOffset !== void 0 ? this.payload.baseOffset : 0,
        width: this.payload.width,
        length: this.payload.length,
        height: this.payload.height,
        widthBranchTwo: this.payload.widthBranchTwo,
        lengthBranchTwo: this.payload.lengthBranchTwo,
        widthMain: this.payload.widthMain,
        lengthSide: this.payload.lengthSide,
        seatDepthMain: this.payload.seatDepthMain,
        seatDepthSide: this.payload.seatDepthSide,
        material: this.payload.material,
        // ⭐ C100 §2.1 / L-1460 — omitted when absent, so "names no material"
        // and "names a material that resolves to nothing" stay different
        // states on the record (C100 §5).
        ...this.payload.materialId ? { materialId: this.payload.materialId } : {},
        color: this.payload.color,
        hasHeadboard: this.payload.hasHeadboard,
        lo3: this.getLo3Value(),
        startPoint: this.payload.startPoint ? { x: this.payload.startPoint.x, y: this.payload.startPoint.y, z: this.payload.startPoint.z } : void 0,
        cornerPoint: this.payload.cornerPoint ? { x: this.payload.cornerPoint.x, y: this.payload.cornerPoint.y, z: this.payload.cornerPoint.z } : void 0,
        endPoint: this.payload.endPoint ? { x: this.payload.endPoint.x, y: this.payload.endPoint.y, z: this.payload.endPoint.z } : void 0,
        mark,
        hostedSpaceId: typeof this.payload.metadata?.hostedSpaceId === "string" ? this.payload.metadata.hostedSpaceId : void 0,
        properties: { ...this.payload.metadata || {}, mark },
        kitchenConfig: this.payload.kitchenConfig,
        wardrobeCabinetConfig: this.payload.wardrobeCabinetConfig,
        furnitureCategory: this.payload.furnitureCategory,
        wardrobeConfig: this.payload.wardrobeConfig
      };
      if (!context.stores.furnitureStore) {
        throw new Error("FurnitureStore not initialized in context");
      }
      context.stores.furnitureStore.add(data);
      this.createdId = id;
      this.targetIds = [id];
      semanticGraphManager.addRelationship({
        type: "sitsOn",
        sourceId: id,
        targetId: this.payload.levelId,
        createdBy: "CreateFurnitureCommand",
        metadata: { addedBy: "CreateFurnitureCommand", furnitureType: this.payload.furnitureType }
      });
      const hostedSpaceId = data.hostedSpaceId;
      if (hostedSpaceId) {
        try {
          semanticGraphManager.addRelationship({
            type: "contains",
            sourceId: hostedSpaceId,
            targetId: id,
            createdBy: "CreateFurnitureCommand",
            metadata: { addedBy: "CreateFurnitureCommand", furnitureType: this.payload.furnitureType }
          });
        } catch (err) {
          console.warn("[CreateFurnitureCommand] `contains` edge write failed (non-fatal):", err instanceof Error ? err.message : String(err));
        }
      }
      this.createAssociatedFurniture(context);
      return {
        success: true,
        affectedElementIds: [id, ...this.createdChildrenIds]
      };
    } catch (error) {
      console.error("[CreateFurnitureCommand] execute failed:", error instanceof Error ? error.message : String(error));
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        affectedElementIds: []
      };
    }
  }
  /**
   * Generate the FU-FF-NNN element mark required by §03 §1.7.
   * NNN is a 1-based zero-padded counter derived from how many furniture
   * elements already exist in the store at execute time.
   */
  _generateMark(context) {
    const fStore = context.stores.furnitureStore;
    const all = typeof fStore?.getAll === "function" ? fStore.getAll() : [];
    const next = all.length + 1;
    return `FU-FF-${String(next).padStart(3, "0")}`;
  }
  getLo3Value() {
    if (this.payload.lo3) return this.payload.lo3;
    if (this.payload.furnitureType === "wardrobe") {
      return FURNITURE_DEFAULTS.wardrobe.defaultLo3;
    }
    return void 0;
  }
  createAssociatedFurniture(context) {
    if (this.payload.id) return;
    switch (this.payload.furnitureType) {
      case "dining_table":
        this.createDiningChairs(context);
        break;
    }
  }
  createDiningChairs(context) {
    const defaults = FURNITURE_DEFAULTS.dining_table;
    const spacing = this.payload.length / 4;
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 1; i <= 3; i++) {
        const chairX = this.payload.position.x + side * (this.payload.width / 2 + defaults.chairOffset);
        const chairZ = this.payload.position.z - this.payload.length / 2 + i * spacing;
        const chairRotY = side === -1 ? Math.PI / 2 : -Math.PI / 2;
        const chairCommand = new CreateFurnitureCommand({
          furnitureType: "dining_chair",
          position: {
            x: chairX,
            y: this.payload.position.y,
            z: chairZ
          },
          rotation: {
            x: 0,
            y: chairRotY,
            z: 0
          },
          levelId: this.payload.levelId,
          baseOffset: this.payload.baseOffset,
          width: defaults.chairWidth,
          length: defaults.chairLength,
          height: defaults.chairHeight,
          material: this.payload.material,
          ...this.payload.materialId ? { materialId: this.payload.materialId } : {},
          color: this.payload.color,
          metadata: {
            parentFurnitureId: this.createdId,
            parentType: "dining_table"
          }
        });
        const result = chairCommand.execute(context);
        if (result.success && result.affectedElementIds[0]) {
          this.createdChildrenIds.push(result.affectedElementIds[0]);
        }
      }
    }
  }
  undo(context) {
    try {
      if (!this.createdId) {
        return { success: false, affectedElementIds: [] };
      }
      for (const childId of this.createdChildrenIds) {
        context.bimManager.unregisterElement(childId);
        elementRegistry.unregister(childId);
        context.stores.furnitureStore?.remove(childId);
      }
      context.bimManager.unregisterElement(this.createdId);
      elementRegistry.unregister(this.createdId);
      try {
        semanticGraphManager.removeAllRelationshipsForElement(this.createdId);
      } catch (err) {
        console.warn("[CreateFurnitureCommand.undo] SemanticGraph cleanup failed (non-fatal):", err instanceof Error ? err.message : String(err));
      }
      context.stores.furnitureStore?.remove(this.createdId);
      return {
        success: true,
        affectedElementIds: [this.createdId, ...this.createdChildrenIds]
      };
    } catch (error) {
      console.error("[CreateFurnitureCommand.undo] failed:", error instanceof Error ? error.message : String(error));
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        affectedElementIds: []
      };
    }
  }
  serialize() {
    return {
      type: this.type,
      payload: {
        ...this.payload,
        // Ensure Vector3 objects are serialized properly
        position: { ...this.payload.position },
        rotation: { ...this.payload.rotation },
        startPoint: this.payload.startPoint ? { ...this.payload.startPoint } : void 0,
        cornerPoint: this.payload.cornerPoint ? { ...this.payload.cornerPoint } : void 0,
        endPoint: this.payload.endPoint ? { ...this.payload.endPoint } : void 0
      },
      targetIds: this.targetIds,
      timestamp: this.timestamp,
      version: 1
    };
  }
  // Optional: Method to update payload (useful for command modifications)
  updatePayload(updates) {
    this.payload = { ...this.payload, ...updates };
  }
  // Optional: Get created furniture ID (useful for command chaining)
  getCreatedId() {
    return this.createdId;
  }
  // Optional: Get child furniture IDs
  getChildIds() {
    return [...this.createdChildrenIds];
  }
}

class CreatePlumbingFixtureCommand {
  constructor(payload) {
    this.payload = payload;
    this.id = `cmd-plumbing-${Date.now()}`;
    this.timestamp = Date.now();
    this.targetIds = payload.id ? [payload.id] : [];
  }
  payload;
  affectedStores = ["plumbing", "level"];
  id;
  type = CommandType.CREATE_PLUMBING_FIXTURE;
  timestamp;
  targetIds;
  createdId;
  canExecute(_context) {
    if (!this.payload.levelId) return { ok: false, reason: "Missing levelId" };
    return { ok: true };
  }
  execute(context) {
    const id = stableCreatedId(this, "plumbing", this.payload.id);
    const level = context.bimManager.getLevelById(this.payload.levelId);
    if (!level) throw new Error(`Level not found: ${this.payload.levelId}`);
    context.bimManager.registerElement(id, this.payload.levelId);
    viewDependencyTracker.registerElement(id, this.payload.levelId);
    const rotation = new Euler(this.payload.rotation.x, this.payload.rotation.y, this.payload.rotation.z);
    const seat = resolveFloorSeatingDatum(
      context,
      this.payload.levelId,
      { x: this.payload.position.x, z: this.payload.position.z }
    );
    const data = {
      id,
      type: "plumbing_fixture",
      fixtureType: this.payload.fixtureType,
      toiletVariant: this.payload.fixtureType === "toilet" ? this.payload.toiletVariant : void 0,
      showerVariant: this.payload.fixtureType === "shower" ? this.payload.showerVariant : void 0,
      accessoryVariant: this.payload.fixtureType === "accessory" ? this.payload.accessoryVariant : void 0,
      position: new Vector3(this.payload.position.x, seat.y + (this.payload.baseOffset !== void 0 ? this.payload.baseOffset : 0.2), this.payload.position.z),
      rotation,
      levelId: this.payload.levelId,
      levelName: level.name,
      levelElevation: level.elevation,
      baseOffset: this.payload.baseOffset !== void 0 ? this.payload.baseOffset : 0.2,
      width: this.payload.width,
      height: this.payload.height,
      length: this.payload.length,
      color: this.payload.color,
      startPoint: this.payload.startPoint,
      endPoint: this.payload.endPoint,
      // §GRAPH115 — stamped verbatim; absent stays absent (never invented, C79 §2.3).
      ...this.payload.wallAnchor ? { wallAnchor: { ...this.payload.wallAnchor } } : {},
      properties: {}
    };
    context.stores.plumbingStore.add(data);
    this.createdId = id;
    this.targetIds = [id];
    try {
      semanticGraphManager.addRelationship({
        type: "sitsOn",
        sourceId: id,
        targetId: this.payload.levelId,
        createdBy: "CreatePlumbingFixtureCommand",
        metadata: { addedBy: "CreatePlumbingFixtureCommand", fixtureType: this.payload.fixtureType }
      });
    } catch (err) {
      console.warn("[CreatePlumbingFixtureCommand] SemanticGraph write failed (non-fatal):", err);
    }
    return { success: true, affectedElementIds: [id] };
  }
  undo(context) {
    if (!this.createdId) return { success: false, affectedElementIds: [] };
    context.bimManager.unregisterElement(this.createdId);
    viewDependencyTracker.unregisterElement(this.createdId);
    try {
      semanticGraphManager.removeAllRelationshipsForElement(this.createdId);
    } catch (err) {
      console.warn("[CreatePlumbingFixtureCommand.undo] SemanticGraph cleanup failed (non-fatal):", err);
    }
    context.stores.plumbingStore.remove(this.createdId);
    return { success: true, affectedElementIds: [this.createdId] };
  }
  serialize() {
    return { type: this.type, payload: this.payload, targetIds: this.targetIds, timestamp: this.timestamp, version: 1 };
  }
}

export { CreatePlumbingFixtureCommand as C, CreateFurnitureCommand as a, resolveOrientationScopeByHost as b, hostIdOf as h, isHostDerivedKind as i, resolveLevelScopeByHost as r };
