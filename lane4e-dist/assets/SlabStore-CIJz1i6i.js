import { q as object, cO as any, p as string, r as number, u as array, B as discriminatedUnion, x as boolean, _ as _enum, v as literal, b9 as ZodIssueCode, D as DOMEventBus, b as storeEventBus } from './ElementStore-CQe7ZDFd.js';
import './LODManager-DHqndFcX.js';
import './SteelProfileLibrary-NgbfwhrM.js';
import './trace-api-BIfvUk_c.js';
import './three.core-Bv4ks8y-.js';
import './three.module-zvZFyv9V.js';

const xYPoint = object({ x: number(), y: number() });
const SlabDataSchema = object({
  id: string().min(1, { message: "SlabData.id must not be empty" }),
  type: literal("slab"),
  levelId: string().min(1, { message: "SlabData.levelId must not be empty" }),
  thickness: number().positive({ message: "SlabData.thickness must be > 0" }),
  position: object({
    x: number(),
    y: literal(0),
    // §01 §1.2 + §02 §1.2: position.y MUST be 0 — world Y is resolved at projection time from BimManager
    z: number()
  }),
  polygon: array(xYPoint).min(3).optional(),
  holes: array(array(xYPoint).min(3)).optional(),
  layers: array(object({
    // §01 §3 FIX-1 (C-SCHEMA): `id` removed — SlabLayer interface has no `id` field.
    // Layers are positional (ordered top-to-bottom); identity is by array index.
    // Adding `id: z.string()` here caused ZodError on every layered-slab SlabStore.add() call.
    name: string(),
    // M3 §SLAB-SYSTEM-AUDIT-2026: Tighten `function` from z.string() to the
    // closed SlabLayerFunction enum so invalid layer functions are caught at the
    // store boundary rather than silently passing into geometry / scheduling.
    function: _enum([
      "finish-surface",
      "screed",
      "insulation",
      "structure",
      "substrate",
      "waterproofing",
      // §FEAT-LANDSCAPE-SLAB-TYPES (L-963) — the four landscape roles. This
      // list and `SlabLayerFunction` are two spellings of ONE enum; they must
      // be extended together, or a valid landscape layer is rejected at the
      // store boundary with a ZodError the user sees as "nothing happened".
      "growing-medium",
      "sub-base",
      "drainage",
      "geotextile",
      "surfacing"
    ]),
    thickness: number().positive(),
    // M4 §SLAB-SYSTEM-AUDIT-2026: Validate materialColor as a CSS hex colour
    // (#RGB or #RRGGBB) so that non-colour strings do not silently reach THREE.
    materialColor: string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/).optional(),
    // §FEAT-LANDSCAPE-SLAB-TYPES (L-963) — the master-catalogue reference.
    // Deliberately unvalidated beyond "is a string": an id that resolves to
    // nothing must stay DISTINGUISHABLE from one that resolves (C84 §5 /
    // C100 §5), so the builder reports the miss instead of the schema
    // rejecting it or inventing a substitute colour.
    materialId: string().optional(),
    // §SLABTYPES117 — the articulation record, the SECOND spelling of
    // `SlabLayerArticulation` (SlabTypes.ts). The two must be extended together
    // or a valid composite layer is rejected at the store boundary. Positive
    // sizes only: a zero-width beam is not a beam and would plan nothing while
    // the record claimed a grid.
    articulation: discriminatedUnion("kind", [
      object({
        kind: literal("beam-grid"),
        beamWidth: number().positive(),
        maxSpacing: number().positive(),
        direction: _enum(["x", "z", "both"]).optional(),
        perimeter: boolean().optional()
      }),
      object({
        kind: literal("perimeter-band"),
        bandWidth: number().positive()
      })
    ]).optional()
  })).optional(),
  width: number().optional(),
  depth: number().optional(),
  baseOffset: number().optional(),
  // M4 §SLAB-SYSTEM-AUDIT-2026: Validate top-level materialColor as CSS hex colour.
  materialColor: string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/).optional(),
  materialId: string().optional(),
  systemTypeId: string().optional(),
  sketch: any().optional()
}).superRefine((data, ctx) => {
  const hasPolygon = Array.isArray(data.polygon) && data.polygon.length >= 3;
  const hasSketch = !!data.sketch;
  if (!hasPolygon && !hasSketch) {
    if (!data.width || data.width <= 0) {
      ctx.addIssue({
        code: ZodIssueCode.custom,
        message: "SlabData.width > 0 is required when no polygon or sketch is provided.",
        path: ["width"]
      });
    }
    if (!data.depth || data.depth <= 0) {
      ctx.addIssue({
        code: ZodIssueCode.custom,
        message: "SlabData.depth > 0 is required when no polygon or sketch is provided.",
        path: ["depth"]
      });
    }
  }
});
function validateSlabData(data) {
  return SlabDataSchema.parse(data);
}

const _bus = new DOMEventBus();
function freezeSlabData(slab) {
  if (slab.position) Object.freeze(slab.position);
  if (slab.polygon) {
    slab.polygon.forEach((p) => Object.freeze(p));
    Object.freeze(slab.polygon);
  }
  if (slab.holes) {
    slab.holes.forEach((hole) => {
      hole.forEach((p) => Object.freeze(p));
      Object.freeze(hole);
    });
    Object.freeze(slab.holes);
  }
  if (slab.layers) {
    slab.layers.forEach((l) => Object.freeze(l));
    Object.freeze(slab.layers);
  }
  if (slab.properties) Object.freeze(slab.properties);
  if (slab.ifcData) Object.freeze(slab.ifcData);
  return Object.freeze(slab);
}
class SlabStoreEngineNotAttachedError extends Error {
  constructor(member) {
    super(
      `[SlabStore] ${member} needs the engine half, which is not attached in this process. Call slabStore.attachEngine(projectContext) (initBuilders.ts does this at engine boot). §ADR-0318-ELEMENTS-SLOT — the store refuses to invent a level rather than answer with a fiction.`
    );
    this.name = "SlabStoreEngineNotAttachedError";
  }
}
class SlabStore {
  _slabs = /* @__PURE__ */ new Map();
  /**
   * ADR-0318 §3 (per-kind adoption) — LATE-BOUND, so `slabStore` at the foot of
   * this file can be the single production instance shared by
   * `composeRuntime`'s `stores.elements` slot, `registerAllStores()` and
   * `ProjectSerializer`. Identity, not construction (I-1/I-2).
   */
  projectContext;
  listeners = [];
  constructor(projectContext) {
    this.projectContext = projectContext ?? null;
  }
  /**
   * ADR-0318 §3 — late-bind the engine half onto the module singleton.
   * `initBuilders.ts` calls this instead of `new SlabStore(...)`.
   */
  attachEngine(projectContext) {
    if (this.projectContext !== null && this.projectContext !== projectContext) {
      console.warn("[SlabStore] attachEngine: replacing previously attached project context (project switch / hot reload).");
    }
    this.projectContext = projectContext;
    return this;
  }
  /** ADR-0318 I-3 — is the engine half attached? Never inferred from a value. */
  isEngineAttached() {
    return this.projectContext !== null;
  }
  /**
   * Subscribe to slab mutations. Returns an unsubscribe function.
   * See the channel-ordering note at the top of this file.
   */
  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }
  /**
   * Fan-out for slab mutations.
   *
   * Order matches WallStore.emit (§WALL-AUDIT-2026-M4):
   *   1. In-process listeners (safe-emit — a throwing subscriber cannot
   *      break the chain or the storeEventBus / DOM channels that follow).
   *   2. storeEventBus.
   *   3. DOM CustomEvent (legacy bridge — preserved verbatim so existing
   *      EngineBootstrap / SelectionManager listeners keep working).
   */
  emit(event, slab, prevState) {
    for (const l of this.listeners) {
      try {
        l(event, slab, prevState);
      } catch (err) {
        console.error(`[SlabStore] subscriber threw on '${event}' for slab ${slab.id}:`, err);
        try {
          _bus.emit("bim-subscriber-error", { message: String(err), source: "SlabStore", event, slabId: slab.id, error: String(err) });
        } catch {
        }
      }
    }
    storeEventBus.emit({
      elementId: slab.id,
      elementType: "slab",
      operation: event === "add" ? "create" : event === "remove" ? "delete" : "update",
      timestamp: Date.now()
    });
    if (event === "add") _bus.emit("bim-slab-added", { id: slab.id });
    else if (event === "remove") _bus.emit("bim-slab-removed", { id: slab.id });
    else _bus.emit("bim-slab-updated", { id: slab.id });
  }
  get activeLevelId() {
    if (this.projectContext === null) throw new SlabStoreEngineNotAttachedError("activeLevelId");
    return this.projectContext.activeLevelId;
  }
  add(slab) {
    validateSlabData(slab);
    const newSlab = structuredClone(slab);
    if (!newSlab.levelId) {
      newSlab.levelId = this.activeLevelId;
      newSlab.parentId = this.activeLevelId;
    }
    if (!newSlab.properties) newSlab.properties = {};
    if (!newSlab.properties.mark) {
      const count = this._slabs.size + 1;
      newSlab.properties.mark = `SB${count.toString().padStart(3, "0")}`;
    }
    if (!newSlab.ifcData) {
      console.warn(
        "[SlabStore.add] §01 §2.6 VIOLATION: ifcData was not provided. IFC GUID should be generated in CreateSlabCommand.execute(), not in the store. Generating a fallback GUID now — this GUID will NOT be stable across undo/redo cycles."
      );
      newSlab.ifcData = {
        guid: crypto.randomUUID(),
        ifcClass: "IfcSlab"
      };
    }
    freezeSlabData(newSlab);
    this._slabs.set(newSlab.id, newSlab);
    this.emit("add", newSlab);
  }
  remove(id) {
    const slab = this._slabs.get(id);
    if (slab) {
      this._slabs.delete(id);
      this.emit("remove", slab);
    }
  }
  /**
   * C3 FIX §01 §3.4: Signature changed from Partial<SlabData> to full SlabData.
   * Commands must construct and pass a complete replacement object — no partial patches.
   * The store performs a structuredClone of the provided nextState and replaces the entry.
   */
  update(id, nextState) {
    const slab = this._slabs.get(id);
    if (slab) {
      const next = structuredClone(nextState);
      freezeSlabData(next);
      this._slabs.set(id, next);
      this.emit("update", next, slab);
    }
  }
  /**
   * §L-1032 — MOVE a slab to a different storey.
   *
   * ─── WHY THIS IS A NAMED OPERATION AND NOT `update(id, {levelId})` ───────
   * `update()` above is a WHOLE-RECORD REPLACE (`structuredClone(nextState)` →
   * `freeze` → `set`). Handed a one-key `{levelId}` partial it leaves the slab
   * as `{levelId}` — no id, no boundary, no thickness — frozen, still under its
   * own key, with zero diagnostics. That is L-977, and it is exactly what
   * `elementUndoStoreAdapter`'s generic field arm would do on Ctrl+Z if this
   * method did not exist: the adapter tests `typeof store.changeLevel ===
   * 'function'` before routing a `levelId` inverse patch, and a family that
   * fails that test falls through to the annihilating write.
   *
   * So the operation gets its own name, symmetric with `WallStore.changeLevel`
   * (`packages/geometry-wall/src/WallStore.ts:1055`) and
   * `RoofStore.changeLevel` (`packages/geometry-roof/src/RoofStore.ts:153`).
   *
   * ─── WHY ONE 'update' AND NOT 'remove' + 'add' ──────────────────────────
   * `WallStore.changeLevel` emits `remove` then `add` because a wall carries
   * JOIN state that must be torn down on the old storey and re-resolved on the
   * new one. A slab carries no join state — `SlabFragmentBuilder` re-derives
   * `worldY = level.elevation + slabBaseOffset + baseOffset` (C92 §10) on every
   * update and repositions the root — so one `update` is everything the
   * renderer needs, and a spurious `remove` would tear down the mesh and any
   * wall pinned to the slab's perimeter along with it.
   *
   * ─── WHAT THIS DOES NOT DO ──────────────────────────────────────────────
   * Spatial-authority registration (bimManager `level.childrenIds`, the
   * view-dependency element→level map) is NOT updated here — identical to the
   * contract `WallStore.changeLevel` and `RoofStore.changeLevel` both state in
   * their own doc comments. `elementLevelChangedMirror.applyElementLevelChange`
   * owns that half, and it owns it for every family so the ordering rule (move
   * the record FIRST, re-register SECOND, dirty BOTH storeys THIRD) lives in
   * one place rather than in thirteen stores.
   *
   * Returns the moved record, or `undefined` when there is nothing to move —
   * which the mirror reports as a refusal rather than logging success over a
   * no-op (§context-data-honesty: failure and emptiness are the same value).
   */
  changeLevel(id, newLevelId) {
    const existing = this._slabs.get(id);
    if (!existing) return void 0;
    if (!newLevelId) return void 0;
    if (existing.levelId === newLevelId) return existing;
    const cloned = structuredClone(existing);
    cloned.levelId = newLevelId;
    if (existing.parentId === existing.levelId) cloned.parentId = newLevelId;
    if (cloned.spatialRelationship) {
      cloned.spatialRelationship = { ...cloned.spatialRelationship, levelId: newLevelId };
    }
    freezeSlabData(cloned);
    this._slabs.set(id, cloned);
    this.emit("update", cloned, existing);
    return cloned;
  }
  getById(id) {
    return this._slabs.get(id);
  }
  getAll() {
    return Array.from(this._slabs.values());
  }
  /**
   * §02 Rebuild Trigger: Fires 'bim-slab-updated' with the current slab data
   * to request a geometry re-projection without mutating any semantic state.
   * Use this instead of slabStore.update(id, ...) for opening/hole rebuild triggers.
   *
   * Note: triggerRebuild() does NOT emit on storeEventBus because it carries no
   * semantic change — it is purely a builder-coordination signal. The bus is for
   * data mutations (create / update / delete), not for re-projection requests.
   */
  triggerRebuild(id) {
    const slab = this._slabs.get(id);
    if (slab) {
      _bus.emit("bim-slab-updated", { id: slab.id });
    }
  }
}
const slabStore = new SlabStore();

export { SlabStore, SlabStoreEngineNotAttachedError, slabStore };
