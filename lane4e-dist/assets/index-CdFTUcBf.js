import { aS as doorSystemTypeStore, g as doorStore, bS as onWallBaseYChanged, $ as openingProfilesFor, X as OPENING_PROFILE_LABELS, aa as SEGMENTAL_RISE_RATIO, bT as isArcHost, b8 as wallCentrelineLength, bU as arcLengthAtPointXZ, bV as resolveDoorDimensions, w as wallOccupancyStore, f as canPlaceRefusalText, bW as PREVIEW_COLOR, bX as arcFrameAt, l as CreateWallOpeningCommand, a as storeRegistry, bY as vgGovernanceStore, bZ as resolveEffectiveDetailLevel, b_ as registerSegmentUUID, b$ as withAuthoritativeGeometry, c0 as openingGeometryFromWall, c1 as hostedElementFrame, C as CommandType, c8 as DoorOpeningSchema, ab as openingProfileRefusal } from './ElementStore-CQe7ZDFd.js';
export { c2 as CustomOutlineSchema, c3 as DEFAULT_DOOR_DIMENSIONS, c4 as DOOR_COLOR_SENTINEL, c5 as DOOR_UNRESOLVED_MATERIAL_COLOR, c6 as DoorBuilder, c7 as DoorFinishLayerSchema, c9 as DoorSegmentSchema, ca as DoorStore, cb as DoorSystemTypeStore, cc as arcSeat, cd as curvedLeafRefusal, ce as leafArc, cf as resolveDoorFinishColour, cg as sweptBoxGeometry } from './ElementStore-CQe7ZDFd.js';
import { D as DEFAULT_DOOR_TOOL_CONFIG, b as buildDoorStoreRecord, g as getDoorToolConfig, s as setDoorToolConfig, a as buildDoorOpening } from './DoorTypeChange-C0A5VweF.js';
export { P as DOOR_PRESERVED_ON_TYPE_CHANGE, p as planDoorTypeChange, r as resetDoorToolConfig } from './DoorTypeChange-C0A5VweF.js';
import { t as trace } from './trace-api-BIfvUk_c.js';
import './SteelProfileLibrary-NgbfwhrM.js';
import './LODManager-DHqndFcX.js';
import { a as appendDwGroup, b as buildFinishMaterialSelect, p as projectToDrawingSpace } from './BimWorld-D6sDpfEG.js';
export { c as appendDwNote, f as finishMaterialHex, d as finishMaterialLabel, e as finishMaterialState, s as suggestMaterialForLegacyName } from './BimWorld-D6sDpfEG.js';
import { a as Vector2, p as Raycaster, d7 as BoxGeometry, b0 as MeshBasicMaterial, M as Mesh, V as Vector3, L as LineSegments, cD as LineBasicMaterial, B as BufferGeometry, F as Float32BufferAttribute } from './three.core-Bv4ks8y-.js';
import './three.module-zvZFyv9V.js';

const SWING_TO_LEGACY = Object.freeze({
  "left-in": { hingesSide: "left", swingDirection: "inward" },
  "left-out": { hingesSide: "left", swingDirection: "outward" },
  "right-in": { hingesSide: "right", swingDirection: "inward" },
  "right-out": { hingesSide: "right", swingDirection: "outward" }
});
const ALL_DOOR_SWINGS = Object.freeze([
  "left-in",
  "left-out",
  "right-in",
  "right-out",
  "sliding"
]);
const UNREPRESENTABLE_SWINGS = Object.freeze(["sliding"]);
function mapSwingToLegacy(swing) {
  if (typeof swing !== "string" || !ALL_DOOR_SWINGS.includes(swing)) {
    return {
      ok: false,
      reason: `door swing "${String(swing)}" is not a member of Door.swing (${ALL_DOOR_SWINGS.join(" | ")}) — nothing was written.`
    };
  }
  if (UNREPRESENTABLE_SWINGS.includes(swing)) {
    return {
      ok: false,
      reason: `door swing "${swing}" has no representation in the legacy door record, whose vocabulary is hingesSide('left'|'right') × swingDirection('inward'|'outward'). Refusing rather than storing a hinged door for a sliding one (C86 WO-Voc-1, C84 EI-3).`
    };
  }
  return { ok: true, legacy: SWING_TO_LEGACY[swing] };
}

let _cachedTracer = null;
function _tracer() {
  _cachedTracer ??= trace.getTracer("@pryzm/geometry-door", "0.1.0");
  return _cachedTracer;
}
const INSTANCE_FIELDS = /* @__PURE__ */ new Set([
  "id",
  "openingId",
  "wallId",
  "offset",
  "width",
  "height",
  "sillHeight",
  "frameThickness",
  "frameDepth",
  "leafThickness",
  "doorType",
  "hingesSide",
  "swingDirection",
  "mark"
]);
function isDoorUntyped(door) {
  return typeof door.systemTypeId !== "string" || door.systemTypeId.length === 0;
}
function resolveDefaultDoorSystemTypeId() {
  return _tracer().startActiveSpan("pryzm.door.resolveDefaultSystemTypeId", (span) => {
    try {
      const id = DEFAULT_DOOR_TOOL_CONFIG.systemTypeId;
      const type = doorSystemTypeStore.getById(id);
      span.setAttribute("pryzm.door.defaultSystemTypeId", id);
      span.setAttribute("pryzm.door.defaultResolved", type !== void 0);
      span.end();
      return type ? id : null;
    } catch (err) {
      span.recordException(err);
      span.end();
      throw err;
    }
  });
}
function planDoorTypeBackfill(doors) {
  return _tracer().startActiveSpan("pryzm.door.planTypeBackfill", (span) => {
    try {
      const defaultTypeId = resolveDefaultDoorSystemTypeId();
      if (!defaultTypeId) {
        const reason = `[DoorTypeBackfill] The door catalogue has no resolvable default type ("${DEFAULT_DOOR_TOOL_CONFIG.systemTypeId}" is not in doorSystemTypeStore). Refusing to invent one — no doors migrated.`;
        span.setAttribute("pryzm.door.backfill.blocked", true);
        span.end();
        return {
          defaultTypeId: DEFAULT_DOOR_TOOL_CONFIG.systemTypeId,
          defaultTypeName: "",
          scanned: doors.length,
          entries: [],
          blockedReason: reason
        };
      }
      const defaultType = doorSystemTypeStore.getById(defaultTypeId);
      const entries = [];
      for (const door of doors) {
        if (!isDoorUntyped(door)) continue;
        const canonical = buildDoorStoreRecord({
          opening: {
            ...door,
            id: door.openingId,
            // the chokepoint's `opening.id` IS the openingId
            elementId: door.id,
            // … and `opening.elementId` IS the door id
            systemTypeId: defaultTypeId
          },
          wallId: door.wallId,
          mark: door.mark
        });
        const patch = {};
        for (const [k, v] of Object.entries(canonical)) {
          if (INSTANCE_FIELDS.has(k)) continue;
          if (v === void 0) continue;
          patch[k] = v;
        }
        entries.push({
          id: door.id,
          wallId: door.wallId,
          from: void 0,
          to: defaultTypeId,
          patch
        });
      }
      span.setAttribute("pryzm.door.backfill.scanned", doors.length);
      span.setAttribute("pryzm.door.backfill.untyped", entries.length);
      span.setAttribute("pryzm.door.backfill.defaultTypeId", defaultTypeId);
      span.end();
      return {
        defaultTypeId,
        defaultTypeName: defaultType.name,
        scanned: doors.length,
        entries,
        blockedReason: null
      };
    } catch (err) {
      span.recordException(err);
      span.end();
      throw err;
    }
  });
}

class DoorDependencyTracker {
  /** wallId → doorIds hosted on that wall */
  graph = /* @__PURE__ */ new Map();
  /**
   * §FIX-HOSTWALL-TRACKER-INDEX-QUADRATIC — doorId → the wallId bucket the door is
   * CURRENTLY filed under. The forward `graph` alone cannot answer "which bucket holds
   * this door?" without scanning every bucket, which made `register()`/`unregister()`
   * O(walls-with-openings) and therefore made `bootstrap()` and project-teardown
   * `clear()` O(doors × walls) — quadratic. This pointer makes both O(1).
   *
   * INVARIANT (must hold after EVERY mutation, mirroring the DoorStore `_byWall`
   * invariant): `home.get(d) === w`  ⟺  `graph.get(w)!.has(d)`. Empty buckets are
   * pruned, so `graph` never retains a wall key with a zero-size Set.
   */
  home = /* @__PURE__ */ new Map();
  unsubscribeWall;
  unsubscribeBaseY;
  unsubscribeDoor;
  constructor(_commandManagerRef, wallStore) {
    this.unsubscribeDoor = doorStore.subscribe((event, door) => {
      if (event === "add" || event === "update") this.register(door.id, door.wallId);
      if (event === "remove") this.unregister(door.id);
    });
    this.unsubscribeWall = wallStore.subscribe((event, wall, prev) => {
      if (event === "remove") {
        const gone = this.graph.get(wall.id);
        if (gone) {
          for (const doorId of gone) this.home.delete(doorId);
        }
        this.graph.delete(wall.id);
        return;
      }
      if (event === "update" && prev && this._wallGeometryChanged(prev, wall)) {
        const ids = this.graph.get(wall.id);
        if (ids && ids.size > 0) {
          for (const doorId of [...ids]) {
            try {
              doorStore.touch(doorId);
            } catch (err) {
              console.warn(`[DoorDependencyTracker] touch(${doorId}) failed:`, err);
            }
          }
        }
      }
    });
    this.unsubscribeBaseY = onWallBaseYChanged((wallId) => {
      const ids = this.graph.get(wallId);
      if (!ids || ids.size === 0) return;
      for (const doorId of [...ids]) {
        try {
          doorStore.touch(doorId);
        } catch (err) {
          console.warn(`[DoorDependencyTracker] base-Y touch(${doorId}) failed:`, err);
        }
      }
    });
  }
  /** §WALL-DEEP-2026 O2 — wall geometry change detector (mirrors WindowDependencyTracker). */
  _wallGeometryChanged(prev, next) {
    if (prev.height !== next.height) return true;
    if (prev.thickness !== next.thickness) return true;
    if ((prev.baseOffset ?? 0) !== (next.baseOffset ?? 0)) return true;
    const a = prev.baseLine, b = next.baseLine;
    return a[0].x !== b[0].x || a[0].y !== b[0].y || a[0].z !== b[0].z || a[1].x !== b[1].x || a[1].y !== b[1].y || a[1].z !== b[1].z;
  }
  register(doorId, wallId) {
    const current = this.home.get(doorId);
    if (current === wallId) return;
    if (current !== void 0) this._detach(doorId, current);
    let bucket = this.graph.get(wallId);
    if (!bucket) {
      bucket = /* @__PURE__ */ new Set();
      this.graph.set(wallId, bucket);
    }
    bucket.add(doorId);
    this.home.set(doorId, wallId);
  }
  unregister(doorId) {
    const current = this.home.get(doorId);
    if (current === void 0) return;
    this._detach(doorId, current);
  }
  /** §FIX-HOSTWALL-TRACKER-INDEX-QUADRATIC — O(1) bucket detach, pruning empties. */
  _detach(doorId, wallId) {
    const bucket = this.graph.get(wallId);
    if (bucket) {
      bucket.delete(doorId);
      if (bucket.size === 0) this.graph.delete(wallId);
    }
    this.home.delete(doorId);
  }
  /**
   * §GR-10/GR-14 — has {@link bootstrap} ever run on this instance?
   *
   * Not a diagnostic nicety: an un-bootstrapped tracker's index is EMPTY, and
   * every read off it returns `[]` — indistinguishable from "this wall hosts no
   * doors". `check-move-propagation`'s PC1 control exists for the identical
   * shape one element type over: *"with `tracker.bootstrap()` called, the
   * identical wall move must produce exactly 1 rebuild"* — the slab tracker's
   * wire was cut in two places and the symptom was silence.
   */
  _bootstrapped = false;
  /** Build an initial dependency graph snapshot from all existing doors. */
  bootstrap() {
    for (const door of doorStore.getAll()) {
      this.register(door.id, door.wallId);
    }
    this._bootstrapped = true;
  }
  /**
   * §GR-10/GR-14 — "which doors hang on this wall?", with the determination
   * status in the TYPE rather than inferred from a length.
   *
   * THE DEFECT THIS ENDS. `getDoorIdsForWall` used to be
   * `Array.from(this.graph.get(wallId) ?? [])`, and returned `[]` for two
   * cases that are not the same fact:
   *   (1) the index was read and this wall genuinely hosts no doors;
   *   (2) THE INDEX WAS NEVER POPULATED — `bootstrap()` was not called and no
   *       door event has fired since construction — so nothing was ever
   *       recorded and `[]` is not an answer about the building at all.
   * Case (2) is not hypothetical: it is exactly the failure
   * `check-move-propagation` pins for the SLAB tracker, whose wire was found
   * cut in two places. Its only symptom is a correct-looking empty array.
   *
   * The disagreement is DETECTABLE, and this method detects it rather than
   * asserting it: the authoritative source is `doorStore`, so an index that is
   * empty while the store holds doors is provably out of date with
   * authoritative state — `STALE_DERIVED_STATE`, the C78 §8.1 member whose
   * definition is exactly *"the derived state this branch reads is known to be
   * out of date with authoritative state, so an answer would be a guess."*
   * (Restated as a literal, not imported: `@pryzm/command-bus` is not a
   * declared dependency of `@pryzm/geometry-door`, the same call the four
   * sibling determination modules made. The test pins it against the
   * command-bus source and asserts the union is still closed at eleven.)
   *
   * An empty store and an empty index AGREE, so that is `determined` and empty
   * — refusing there would be the mirror-image defect.
   */
  doorIdsForWallDetermination(wallId) {
    if (!this._bootstrapped && this.graph.size === 0 && doorStore.getAll().length > 0) {
      return {
        kind: "undetermined",
        reason: "STALE_DERIVED_STATE",
        detail: `the door dependency index is empty while doorStore holds ${doorStore.getAll().length} door(s) and bootstrap() has never run — nothing was ever indexed, so "no doors on this wall" would be a guess`
      };
    }
    const bucket = this.graph.get(wallId);
    return { kind: "determined", doorIds: bucket ? Array.from(bucket) : [] };
  }
  /**
   * Read-only access used by tests and cleanup handlers.
   *
   * RETAINED at its original signature so every existing caller compiles and
   * behaves identically. It is now a NARROWING of
   * {@link doorIdsForWallDetermination} rather than a second, rival read — the
   * distinction is preserved there for any caller that needs the truth, which
   * is what it never was before.
   */
  getDoorIdsForWall(wallId) {
    const d = this.doorIdsForWallDetermination(wallId);
    return d.kind === "determined" ? [...d.doorIds] : [];
  }
  dispose() {
    this.unsubscribeWall?.();
    this.unsubscribeDoor?.();
    this.unsubscribeBaseY?.();
    this.graph.clear();
    this.home.clear();
  }
}

class DoorLevelCleanupHandler {
  commandManagerRef;
  wallStore;
  constructor(wallStore, commandManagerRef) {
    this.wallStore = wallStore;
    this.commandManagerRef = commandManagerRef;
    window.addEventListener("bim-level-removed", this.onLevelRemoved);
  }
  onLevelRemoved = (e) => {
    const levelId = e.detail?.levelId;
    if (!levelId) return;
    const orphans = [];
    for (const door of doorStore.getAll()) {
      const wall = this.wallStore.getById(door.wallId);
      if (!wall || wall.levelId === levelId) {
        orphans.push(door.id);
      }
    }
    if (orphans.length === 0) return;
    const cm = this.commandManagerRef.current;
    if (!cm) {
      console.warn(
        "[DoorLevelCleanupHandler] commandManager unavailable — falling back to direct doorStore.remove() for orphan cleanup. Removal will NOT be undoable."
      );
      orphans.forEach((id) => doorStore.remove(id));
      return;
    }
    for (const id of orphans) {
      try {
        this.wallStore.removeDoor(id);
      } catch {
        doorStore.remove(id);
      }
    }
  };
  dispose() {
    window.removeEventListener("bim-level-removed", this.onLevelRemoved);
  }
}

function injectDwStyles() {
}
let _commandManager = null;
function setDoorSectionCommandManager(cm) {
  _commandManager = cm;
}
function dispatch(doorId, patch) {
  const cmdMgr = _commandManager ?? window.commandManager;
  if (!cmdMgr) {
    console.error("[DoorSection] commandManager not configured — call setDoorSectionCommandManager() at bootstrap");
    return "The command manager is not available in this session, so nothing was changed.";
  }
  const current = doorStore.getById(doorId);
  if (!current) {
    console.warn("[DoorSection] Door not found in store:", doorId);
    return `This door is no longer in the model (${doorId}), so nothing was changed.`;
  }
  const prevFields = {};
  for (const key of Object.keys(patch)) {
    prevFields[key] = current[key];
  }
  const cmd = new UpdateDoorParameterCommand(doorId, patch, prevFields);
  const result = cmdMgr.execute(cmd);
  if (!result?.success) {
    console.warn("[DoorSection] UpdateDoorParameterCommand failed:", result?.info);
    const stated = Array.isArray(result?.info) ? result.info.filter(Boolean).join(" ") : "";
    return stated.length > 0 ? stated : "That change was refused and no reason was given — nothing was changed, and nothing about the model is confirmed.";
  }
  return null;
}
function makeField(label, control) {
  const row = document.createElement("div");
  row.className = "dw-field";
  const lbl = document.createElement("div");
  lbl.className = "dw-label";
  lbl.textContent = label;
  lbl.title = label;
  const wrap = document.createElement("div");
  wrap.className = "dw-control";
  wrap.appendChild(control);
  row.appendChild(lbl);
  row.appendChild(wrap);
  return row;
}
function makeSelect(options, current, onChange) {
  const sel = document.createElement("select");
  sel.className = "dw-select";
  for (const opt of options) {
    const o = document.createElement("option");
    o.value = opt.value;
    o.textContent = opt.label;
    if (opt.value === current) o.selected = true;
    sel.appendChild(o);
  }
  sel.addEventListener("change", () => onChange(sel.value));
  return sel;
}
function makeColorPicker(current, onChange) {
  const inp = document.createElement("input");
  inp.type = "color";
  inp.className = "dw-color";
  inp.value = current;
  inp.addEventListener("input", () => onChange(inp.value));
  inp.addEventListener("change", () => onChange(inp.value));
  return inp;
}
function makeNumberInput(current, min, max, step, onChange) {
  const inp = document.createElement("input");
  inp.type = "number";
  inp.className = "dw-number";
  inp.min = String(min);
  inp.max = String(max);
  inp.step = String(step);
  inp.value = String(current);
  inp.addEventListener("change", () => {
    const v = parseFloat(inp.value);
    if (!isNaN(v) && v >= min && v <= max) onChange(v);
  });
  return inp;
}
function makeTextInput(current, onChange) {
  const inp = document.createElement("input");
  inp.type = "text";
  inp.className = "dw-text";
  inp.value = current;
  inp.addEventListener("change", () => onChange(inp.value.trim()));
  return inp;
}
function makeToggle(options, current, onChange) {
  const row = document.createElement("div");
  row.className = "dw-toggle-row";
  const buttons = [];
  for (const opt of options) {
    const btn = document.createElement("button");
    btn.className = "dw-toggle-btn" + (opt.value === current ? " active" : "");
    btn.textContent = opt.label;
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      onChange(opt.value);
    });
    buttons.push(btn);
    row.appendChild(btn);
  }
  return row;
}
function buildDoorSection(doorId) {
  const door = doorStore.getById(doorId);
  if (!door) return null;
  const section = document.createElement("div");
  section.className = "dw-section";
  const header = document.createElement("div");
  header.className = "dw-section-header";
  const title = document.createElement("div");
  title.className = "dw-section-title";
  title.textContent = "Door Parameters";
  const toggle = document.createElement("div");
  toggle.className = "dw-section-toggle";
  toggle.textContent = "▲";
  header.appendChild(title);
  header.appendChild(toggle);
  section.appendChild(header);
  const body = document.createElement("div");
  body.className = "dw-section-body";
  header.addEventListener("click", () => {
    const collapsed = body.style.display === "none";
    body.style.display = collapsed ? "grid" : "none";
    toggle.textContent = collapsed ? "▲" : "▼";
  });
  appendDwGroup(body, "Dimensions");
  body.appendChild(makeField(
    "Width (m)",
    makeNumberInput(door.width, 0.4, 4, 0.05, (v) => dispatch(doorId, { width: v }))
  ));
  body.appendChild(makeField(
    "Height (m)",
    makeNumberInput(door.height, 1.6, 4, 0.05, (v) => dispatch(doorId, { height: v }))
  ));
  body.appendChild(makeField(
    "Sill Height (m)",
    makeNumberInput(door.sillHeight, 0, 0.5, 0.01, (v) => dispatch(doorId, { sillHeight: v }))
  ));
  appendDwGroup(body, "Type & Shape");
  body.appendChild(makeField(
    "Door Type",
    makeSelect(
      [{ value: "single", label: "Single" }, { value: "double", label: "Double" }],
      door.doorType,
      (v) => dispatch(doorId, { doorType: v })
    )
  ));
  const shapeNote = document.createElement("div");
  shapeNote.className = "dw-label";
  shapeNote.style.cssText = "grid-column:1/-1;opacity:0.85;font-size:11px;line-height:1.45;display:none;";
  const shapeSelect = makeSelect(
    openingProfilesFor("door").map((k) => ({
      value: k,
      label: k === "segmental-arch" ? `${OPENING_PROFILE_LABELS[k]} (rise 1/${Math.round(1 / SEGMENTAL_RISE_RATIO)} of width)` : OPENING_PROFILE_LABELS[k]
    })),
    door.openingProfile ?? "rectangular",
    (v) => {
      const refusal = dispatch(doorId, { openingProfile: v });
      if (refusal === null) {
        shapeNote.textContent = "";
        shapeNote.style.display = "none";
        return;
      }
      shapeNote.textContent = `⛔ ${refusal}`;
      shapeNote.style.display = "";
      shapeSelect.value = doorStore.getById(doorId)?.openingProfile ?? "rectangular";
    }
  );
  body.appendChild(makeField("Head Shape", shapeSelect));
  body.appendChild(shapeNote);
  appendDwGroup(body, "Operation");
  body.appendChild(makeField(
    "Hinges Side",
    makeToggle(
      [{ value: "left", label: "Left" }, { value: "right", label: "Right" }],
      door.hingesSide,
      (v) => dispatch(doorId, { hingesSide: v })
    )
  ));
  body.appendChild(makeField(
    "Swing",
    makeToggle(
      [{ value: "inward", label: "Inward" }, { value: "outward", label: "Outward" }],
      door.swingDirection,
      (v) => dispatch(doorId, { swingDirection: v })
    )
  ));
  body.appendChild(makeField(
    "Leaf Visible in Plan",
    makeToggle(
      [{ value: "false", label: "Hidden (symbol only)" }, { value: "true", label: "Visible" }],
      String(door.leafVisibleInPlan ?? false),
      (v) => dispatch(doorId, { leafVisibleInPlan: v === "true" })
    )
  ));
  appendDwGroup(body, "Members");
  body.appendChild(makeField(
    "Leaf Thickness (m)",
    makeNumberInput(door.leafThickness ?? 0.04, 0.02, 0.12, 5e-3, (v) => dispatch(doorId, { leafThickness: v }))
  ));
  body.appendChild(makeField(
    "Frame Thickness (m)",
    makeNumberInput(door.frameThickness ?? 0.05, 0.01, 0.15, 5e-3, (v) => dispatch(doorId, { frameThickness: v }))
  ));
  body.appendChild(makeField(
    "Frame Depth (m)",
    makeNumberInput(door.frameDepth ?? 0.07, 0.03, 0.3, 5e-3, (v) => dispatch(doorId, { frameDepth: v }))
  ));
  appendDwGroup(body, "Appearance");
  body.appendChild(makeField(
    "Frame Color",
    makeColorPicker(door.frameColor, (v) => dispatch(doorId, { frameColor: v }))
  ));
  body.appendChild(makeField(
    "Leaf Color",
    makeColorPicker(door.leafColor, (v) => dispatch(doorId, { leafColor: v }))
  ));
  body.appendChild(makeField(
    "Handle Height (m)",
    makeNumberInput(door.handleHeight, 0.8, 1.2, 0.01, (v) => dispatch(doorId, { handleHeight: v }))
  ));
  appendDwGroup(body, "Finishes");
  body.appendChild(makeField(
    "Frame Finish",
    buildFinishMaterialSelect({
      currentId: door.frameFinish?.materialId,
      legacyName: door.frameFinish?.name,
      onChange: (id, color, label) => dispatch(doorId, {
        frameFinish: { name: label, materialId: id || void 0, materialColor: color }
      })
    })
  ));
  body.appendChild(makeField(
    "Leaf Finish",
    buildFinishMaterialSelect({
      currentId: door.leafFinish?.materialId,
      legacyName: door.leafFinish?.name,
      onChange: (id, color, label) => dispatch(doorId, {
        leafFinish: { name: label, materialId: id || void 0, materialColor: color },
        // A door's schedule finish is its LEAF (CreateWallOpeningCommand :226).
        // The window's is its FRAME. Different by construction, not by drift.
        finishMaterial: label || void 0
      })
    })
  ));
  appendDwGroup(body, "Performance");
  const fireInput = makeTextInput(door.fireRating ?? "", (v) => dispatch(doorId, { fireRating: v || void 0 }));
  fireInput.placeholder = "Not set — counts as unrated";
  fireInput.title = "Fire resistance designation, e.g. FD30, FD60, EI30. Left blank the opening is measured as UNRATED in the quantity take-off.";
  fireInput.setAttribute("list", "dw-fire-ratings-door");
  const fireList = document.createElement("datalist");
  fireList.id = "dw-fire-ratings-door";
  for (const r of ["FD30", "FD60", "FD90", "EI30", "EI60", "E30"]) {
    const o = document.createElement("option");
    o.value = r;
    fireList.appendChild(o);
  }
  const fireRow = makeField("Fire Rating", fireInput);
  fireRow.appendChild(fireList);
  body.appendChild(fireRow);
  section.appendChild(body);
  return section;
}

class DoorTool {
  world;
  wallStore;
  _isActive = false;
  previewDoor = null;
  statusOverlay = null;
  _disposed = false;
  _escListener = null;
  /** §M6 — current HUD state. Read by tests + telemetry. */
  _hudState = "idle";
  // §FEAT-DOOR-FLIP-ON-SPACE (L-92) — cyclic swing(in/out) × hinge(left/right)
  // flip. SPACE advances it (via attach() below); placeDoor() reads
  // swingDirection()/hingesSide() into the command payload so the committed door
  // carries the chosen configuration. onChange re-renders the HUD label.
  _flip = new DoorPlacementFlip({ onChange: () => this.setHudState(this._hudState) });
  // A3: wall object cache — built once at activate(), kept in sync via wallStore subscription.
  // Eliminates the O(n) scene.traverse() that previously ran on every pointermove event.
  cachedWallObjects = [];
  wallStoreUnsubscribe = null;
  // A4: commandManager injected via constructor; falls back to window global during migration.
  commandManager;
  // PLAN-03: injected selectionManager — set via setSelectionManager() after ToolManager is ready.
  selectionManager = null;
  constructor(world, wallStore, _fragmentBuilder, _callbacks, commandManager) {
    this.world = world;
    this.wallStore = wallStore;
    this.commandManager = commandManager ?? null;
    if (!this.commandManager) {
      console.error("[DoorTool] commandManager not injected via constructor — door placement will not function until provided.");
    }
  }
  /** PLAN-03: Called by EngineBootstrap after selectionManager is available. */
  setSelectionManager(sm) {
    this.selectionManager = sm;
  }
  get active() {
    return this._isActive;
  }
  // §FIX-DOOR-CREATION-PARITY (L-260 A) — `doorType` / `systemTypeId` are NOT tool
  // state any more. They are ACCESSORS onto the single DoorToolConfigStore, so the
  // ribbon (which writes `doorTool.doorType = …` / `ToolManager.activateDoor()`) and
  // the PLAN tool (which reads the DI'd `ctx.doorConfig`) can never disagree about
  // which door the architect chose. Writing `undefined` is a no-op by construction —
  // `ToolManager.activateDoor('single')` used to WIPE the chosen system type on the
  // 3D path only, which is precisely how the two paths diverged.
  get doorType() {
    return getDoorToolConfig().doorType;
  }
  set doorType(v) {
    setDoorToolConfig({ doorType: v });
  }
  /**
   * §OPENING-PROFILE (L-1251) — the void SHAPE, on the SAME config store as the leaf count.
   * Orthogonal to `doorType`: `double × round-arch` is an ordinary pair of arched doors.
   */
  get openingProfile() {
    return getDoorToolConfig().openingProfile;
  }
  set openingProfile(v) {
    setDoorToolConfig({ openingProfile: v });
  }
  /** The chosen `DoorSystemType.id` — defaults to Solid Timber (see the config store). */
  get systemTypeId() {
    return getDoorToolConfig().systemTypeId;
  }
  set systemTypeId(v) {
    setDoorToolConfig({ systemTypeId: v });
  }
  async activate() {
    if (this._isActive) return;
    this._isActive = true;
    this._escListener = (e) => {
      if (e.key === "Escape") this.deactivate();
    };
    document.addEventListener("keydown", this._escListener);
    this._flip.reset();
    this._flip.attach();
    this.attachListeners();
    this.setHudState("idle");
    this.rebuildWallCache();
    this.wallStoreUnsubscribe = this.wallStore.subscribe((event) => {
      if (event === "add" || event === "remove") {
        this.rebuildWallCache();
      }
    });
  }
  deactivate() {
    if (!this._isActive) return;
    this._isActive = false;
    if (this._escListener) {
      document.removeEventListener("keydown", this._escListener);
      this._escListener = null;
    }
    this._flip.detach();
    this.detachListeners();
    this.hideStatus();
    this.clearPreview();
    this.wallStoreUnsubscribe?.();
    this.wallStoreUnsubscribe = null;
    this.cachedWallObjects = [];
    if (this.selectionManager?.setEnabled) {
      this.selectionManager.setEnabled(true);
    }
  }
  cleanup() {
    this.deactivate();
    this.clearPreview();
  }
  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this.clearPreview();
    this.cleanup();
    if (this.statusOverlay && this.statusOverlay.parentNode) {
      this.statusOverlay.parentNode.removeChild(this.statusOverlay);
      this.statusOverlay = null;
    }
  }
  attachListeners() {
    const canvas = this.world.renderer.three.domElement;
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerdown", this.onPointerDown);
  }
  detachListeners() {
    const canvas = this.world.renderer.three.domElement;
    canvas.removeEventListener("pointermove", this.onPointerMove);
    canvas.removeEventListener("pointerdown", this.onPointerDown);
  }
  onPointerMove = (e) => {
    const hit = this.getWallHit(e);
    if (hit) {
      const wallRoot = this.findWallRoot(hit.object);
      const wallId = wallRoot?.userData?.id || wallRoot?.uuid;
      const wallData = wallId ? this.wallStore.getById(wallId) : void 0;
      if (wallData?.curve && !isArcHost(wallData)) {
        this.setHudState("curved-wall-blocked");
      } else if (wallData) {
        const refined = this._get2DRefinedHit(hit, e);
        const occupancy = this._evaluateOccupancyAt(refined, wallData);
        if (occupancy.ok) this.setHudState("wall-snapping");
        else this.setHudState(occupancy.state, occupancy.message);
      } else {
        this.setHudState("wall-snapping");
      }
      this.updatePreview(this._get2DRefinedHit(hit, e));
    } else {
      this.setHudState("no-wall-target");
      this.clearPreview();
    }
  };
  /**
   * §M6 — evaluate the same occupancy constraint placeDoor() will run, so the
   * HUD can transition into `out-of-range` / `occupancy-blocked` *during*
   * hover. Pure read; no state mutation.
   */
  _evaluateOccupancyAt(hit, wallData) {
    try {
      const wallLength = wallCentrelineLength(wallData);
      if (wallLength < 1e-3) return { ok: false, state: "out-of-range" };
      const rawOffset = arcLengthAtPointXZ(wallData, hit.point.x, hit.point.z).s;
      const _dims = resolveDoorDimensions(this.systemTypeId, this.doorType);
      const width = _dims.width;
      const halfW = width / 2;
      if (rawOffset < halfW || rawOffset > wallLength - halfW) {
        return { ok: false, state: "out-of-range" };
      }
      const occ = wallOccupancyStore.canPlace(wallData, rawOffset, width, void 0, {
        openingProfile: this.openingProfile,
        heightM: _dims.height,
        // §FEAT-WALL-PROFILE-OPENINGS (OPEN38, L-7400) — a DOOR's sill is 0 BY DEFINITION
        // (that is what makes it floor-reaching, and what routes it to the outer-boundary
        // notch walk rather than to a closed hole). `ResolvedDoorDimensions` carries no
        // sill field precisely because there is nothing to resolve, so the literal here is
        // the convention stated, not a default guessed.
        sillHeightM: 0
      });
      if (!occ.valid) return { ok: false, state: "occupancy-blocked", message: canPlaceRefusalText(occ) };
      return { ok: true };
    } catch {
      return { ok: false, state: "out-of-range" };
    }
  }
  onPointerDown = (e) => {
    if (e.button !== 0) return;
    const hit = this.getWallHit(e);
    if (hit) {
      this.placeDoor(this._get2DRefinedHit(hit, e));
    }
  };
  /**
   * DOC-5.2 — Refine the 3D raycast hit.point using the 2D snap system in plan view.
   *
   * In plan view (OrthographicCamera + mounted TechnicalDrawing), the projected wall
   * edges give sub-pixel accurate snap positions. If a 2D snap candidate is found
   * within the snap radius, the returned hit's point is replaced with the 2D snap
   * world position. The hit.object remains unchanged — wall identification always uses
   * the 3D raycast result.
   *
   * Falls back to the original hit unchanged when:
   *   - Camera is not OrthographicCamera (3D view)
   *   - No TechnicalDrawing is mounted (activePlanDrawingRef.drawing is null)
   *   - No 2D snap candidate within radius
   *
   * §02 §6.1 — Tool layer only; no store writes; drawing is read-only.
   */
  _get2DRefinedHit(hit, e) {
    this.world.camera.three;
    return hit;
  }
  // A3: Populate cache by traversing the scene once. Called at activate() and
  // whenever a wall is added or removed from WallStore.
  rebuildWallCache() {
    this.cachedWallObjects = [];
    this.world.scene.three.traverse((obj) => {
      if (obj.userData?.elementType === "Wall" || obj.userData?.elementType === "wall") {
        this.cachedWallObjects.push(obj);
      }
    });
  }
  getWallHit(e) {
    const rect = this.world.renderer.three.domElement.getBoundingClientRect();
    const mouse = new Vector2(
      (e.clientX - rect.left) / rect.width * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new Raycaster();
    raycaster.setFromCamera(mouse, this.world.camera.three);
    const intersects = raycaster.intersectObjects(this.cachedWallObjects, true);
    return intersects.length > 0 ? intersects[0] : null;
  }
  updatePreview(hit) {
    this.clearPreview();
    const wall = this.findWallRoot(hit.object);
    if (!wall) return;
    const wallId = wall.userData.id || wall.uuid;
    const wallData = this.wallStore.getById(wallId);
    if (!wallData) return;
    if (wallData.curve && !isArcHost(wallData)) {
      return;
    }
    const previewDims = resolveDoorDimensions(this.systemTypeId, this.doorType);
    const width = previewDims.width;
    const doorHeight = previewDims.height;
    const thickness = wallData.thickness;
    const geo = new BoxGeometry(width, doorHeight, thickness + 0.02);
    const mat = new MeshBasicMaterial({ color: PREVIEW_COLOR.HOSTED, transparent: true, opacity: 0.5 });
    this.previewDoor = new Mesh(geo, mat);
    const wallLength = wallCentrelineLength(wallData);
    let centreS = arcLengthAtPointXZ(wallData, hit.point.x, hit.point.z).s;
    centreS = Math.max(width / 2, Math.min(centreS, wallLength - width / 2));
    const _pf = arcFrameAt(wallData, centreS);
    const previewCenter = new Vector3(_pf.x, 0, _pf.z);
    if (!wallData.levelId) {
      console.warn(`[DoorTool] Wall ${wallId} has no levelId — preview suppressed.`);
      return;
    }
    const level = this.wallStore.getLevelById(wallData.levelId);
    const elevation = level?.elevation;
    if (elevation == null || !isFinite(elevation)) {
      console.warn(`[DoorTool] Level "${wallData.levelId}" missing elevation — preview suppressed.`);
      return;
    }
    this.previewDoor.position.set(previewCenter.x, elevation + doorHeight / 2, previewCenter.z);
    this.previewDoor.rotation.y = -_pf.angleY;
    this.previewDoor.userData.isPreview = true;
    this.previewDoor.userData.levelId = wallData.levelId;
    this.world.scene.three.add(this.previewDoor);
  }
  findWallRoot(obj) {
    let curr = obj;
    while (curr) {
      const type = curr.userData?.elementType;
      if (type === "Wall" || type === "wall") return curr;
      curr = curr.parent;
    }
    return null;
  }
  // PLAN-01: Dispose geometry and material before removing from scene to prevent GPU leak.
  clearPreview() {
    if (this.previewDoor) {
      this.world.scene.three.remove(this.previewDoor);
      this.previewDoor.geometry.dispose();
      this.previewDoor.material.dispose();
      this.previewDoor = null;
    }
  }
  placeDoor(hit) {
    const wallRoot = this.findWallRoot(hit.object);
    if (!wallRoot) return;
    const wallId = wallRoot.userData.id || wallRoot.uuid;
    const wallData = this.wallStore.getById(wallId);
    if (!wallData) return;
    if (wallData.curve && !isArcHost(wallData)) {
      this.setHudState("curved-wall-blocked");
      return;
    }
    const levelId = wallData.levelId;
    if (!levelId) {
      throw new Error("Spatial Authority Violation: Host wall has no level context.");
    }
    const wallLength = wallCentrelineLength(wallData);
    if (wallLength < 1e-3) {
      console.warn("[DoorTool] Invalid wall baseline length");
      return;
    }
    const centreAlong = arcLengthAtPointXZ(wallData, hit.point.x, hit.point.z).s;
    const placeDims = resolveDoorDimensions(this.systemTypeId, this.doorType);
    const width = placeDims.width;
    let offset = centreAlong - width / 2;
    offset = Math.max(0, Math.min(offset, wallLength - width));
    if (!isFinite(offset)) {
      console.error("[DoorTool] Computed door offset is invalid:", offset);
      return;
    }
    const occupancy = wallOccupancyStore.canPlace(wallData, offset, width, void 0, {
      openingProfile: this.openingProfile,
      heightM: placeDims.height,
      // §FEAT-WALL-PROFILE-OPENINGS (OPEN38, L-7400) — 0 by definition; see the hover check.
      sillHeightM: 0
    });
    if (!occupancy.valid) {
      this.setHudState("occupancy-blocked", canPlaceRefusalText(occupancy));
      this.clearPreview();
      return;
    }
    const cm = this.commandManager;
    if (cm) {
      const openingData = buildDoorOpening({
        wallThickness: wallData.thickness,
        offset,
        // §FEAT-DOOR-FLIP-ON-SPACE (L-92) — the SPACE-chosen configuration
        // (P6: flows through the command).
        hingesSide: this._flip.hingesSide(),
        swingDirection: this._flip.swingDirection()
      });
      cm.execute(new CreateWallOpeningCommand({ wallId, openingData }));
    }
    this.clearPreview();
  }
  /**
   * §M6 — single transition function for the HUD state machine. Updates
   * `_hudState` and renders the matching message + colour. Pass `customMsg`
   * to override the default text (used for occupancy reasons).
   */
  setHudState(state, customMsg) {
    this._hudState = state;
    const label = this.doorType === "double" ? "Double Door" : "Single Door";
    let msg;
    let isError = false;
    switch (state) {
      case "idle":
        msg = `${label}: Hover over a wall to place`;
        break;
      case "no-wall-target":
        msg = `${label}: Hover over a wall to place`;
        break;
      case "wall-snapping":
        msg = `${label}: Click to place — snapping to wall`;
        break;
      case "curved-wall-blocked":
        msg = customMsg ?? "Doors cannot be placed on curved walls";
        isError = true;
        break;
      case "out-of-range":
        msg = customMsg ?? `${label}: Move closer to the wall centre — opening too close to the wall end`;
        isError = true;
        break;
      case "occupancy-blocked":
        msg = customMsg ?? "Cannot place door here — opening overlaps existing one";
        isError = true;
        break;
      case "transient-error":
        msg = customMsg ?? "Door placement failed";
        isError = true;
        break;
    }
    if (!isError) {
      msg += ` · Space to flip (${this._flip.label()})`;
    }
    this.showStatus(msg, isError);
  }
  /** §M6 — exposed for tests / telemetry. */
  getHudState() {
    return this._hudState;
  }
  // Contract §UI_UX_LAYOUT_REFERENCE §6: uses .th-overlay pill bar (not .th-status-pill).
  // isError=true colours the text to indicate a transient error — no red backgrounds.
  showStatus(msg, isError = false) {
    if (!this.statusOverlay) {
      this.statusOverlay = document.createElement("div");
      this.statusOverlay.className = "th-overlay";
      const text = document.createElement("span");
      text.id = "door-tool-status-text";
      text.className = "th-text";
      this.statusOverlay.appendChild(text);
      const sep = document.createElement("span");
      sep.className = "th-sep";
      this.statusOverlay.appendChild(sep);
      const escHint = document.createElement("span");
      escHint.className = "th-esc";
      escHint.textContent = "ESC to finish";
      this.statusOverlay.appendChild(escHint);
      document.body.appendChild(this.statusOverlay);
    }
    const textEl = this.statusOverlay.querySelector("#door-tool-status-text");
    if (textEl) {
      textEl.textContent = msg;
      textEl.style.color = isError ? "#c62828" : "";
    }
    this.statusOverlay.style.display = "flex";
  }
  hideStatus() {
    if (this.statusOverlay) {
      this.statusOverlay.style.display = "none";
    }
  }
}

const ARC_SEGMENTS = 32;
function pushRun(out, pts) {
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1];
    out.push(a.x, 0, a.z, b.x, 0, b.z);
  }
}
function computeDoorFrameJambTicks(params) {
  const { at, halfWidth, halfThickness } = params;
  const out = [];
  for (const sign of [-1, 1]) {
    const a = at(sign * halfWidth, -halfThickness);
    const b = at(sign * halfWidth, +halfThickness);
    out.push(a.x, 0, a.z, b.x, 0, b.z);
  }
  return out;
}
const DOOR_LAYER = "A-DOOR";
const DOOR_LAYER_CUT = "A-DOOR-CUT";
const DOOR_LAYER_PROJ = "A-DOOR-PROJ";
const DOOR_LAYER_GHOST = "A-DOOR-BEYOND";
const LW_CUT = 2;
const LW_PROJ = 1;
const LW_GHOST = 1;
class DoorPlanSymbolBuilder {
  /**
   * Injects door swing arcs for all doors on the active level into a TechnicalDrawing.
   *
   * Algorithm per door:
   *   Single door:
   *     1. Resolve hinge point in world XZ from wall baseline + door offset + hingesSide.
   *     2. Compute panel direction (along wall toward open edge) and swing direction
   *        (perpendicular to wall — inward vs outward controlled by swingDirection field).
   *     3. Tesselate a 32-segment quarter-circle arc from closed (0°) to open (90°).
   *     4. Add the panel-open line (hinge → 90°-open panel end).
   *     5. Inject the combined BufferGeometry into the drawing on layer A-DOOR.
   *
   *   Double door:
   *     Same as single but generates TWO symmetric leaves:
   *       – Left leaf:  hinge at left jamb inner corner, panelDir = +dir (toward centre)
   *       – Right leaf: hinge at right jamb inner corner, panelDir = −dir (toward centre)
   *     Both leaves swing in the same swingDirection. Each leaf is half the clear opening width.
   *
   * Called AFTER EdgeProjectorService.project() — bridges the non-mesh gap.
   * §01 §5 — this method produces no store mutations.
   *
   * @param drawing  The TechnicalDrawing being built for this view.
   * @param viewDef  The active ViewDefinition (must be plan/detail/structural-plan).
   */
  inject(drawing, viewDef) {
    const levelId = viewDef.spatial?.levelId;
    if (!levelId) return;
    const wallStore = storeRegistry.getStoreForType("wall");
    if (!wallStore) {
      console.warn("[DoorPlanSymbolBuilder] wallStore not registered in storeRegistry — skipping door swing arc injection");
      return;
    }
    for (const layer of [DOOR_LAYER, DOOR_LAYER_CUT, DOOR_LAYER_PROJ, DOOR_LAYER_GHOST]) {
      if (!drawing.layers.has(layer)) drawing.layers.create(layer);
    }
    let injectedCount = 0;
    for (const door of doorStore.getAll()) {
      const wallData = wallStore.getById(door.wallId);
      if (!wallData) continue;
      if (wallData.levelId !== levelId) continue;
      if (vgGovernanceStore.getEffectiveStyle("Door", door.id).hidden) continue;
      const lod = resolveEffectiveDetailLevel(door.id, viewDef.id, {
        elementType: "door",
        category: "door"
      });
      const geos = this._computeSwingGeometry(door, wallData, lod);
      if (!geos) continue;
      if (geos.cut) {
        const cutSeg = new LineSegments(
          geos.cut,
          new LineBasicMaterial({ color: 0, linewidth: LW_CUT })
        );
        cutSeg.userData = { lineWeight: LW_CUT, role: "cut", elementType: "Door" };
        cutSeg.updateWorldMatrix(true, false);
        const projectedCut = projectToDrawingSpace(cutSeg, drawing);
        drawing.addProjectionLines(projectedCut, DOOR_LAYER_CUT);
        registerSegmentUUID(drawing, projectedCut, door.id);
      }
      if (geos.proj) {
        const projSeg = new LineSegments(
          geos.proj,
          new LineBasicMaterial({ color: 0, linewidth: LW_PROJ })
        );
        projSeg.userData = { lineWeight: LW_PROJ, role: "projection", elementType: "Door" };
        projSeg.updateWorldMatrix(true, false);
        const projectedProj = projectToDrawingSpace(projSeg, drawing);
        drawing.addProjectionLines(projectedProj, DOOR_LAYER_PROJ);
        registerSegmentUUID(drawing, projectedProj, door.id);
      }
      if (geos.ghost) {
        const ghostSeg = new LineSegments(
          geos.ghost,
          new LineBasicMaterial({ color: 0, linewidth: LW_GHOST })
        );
        ghostSeg.userData = { lineWeight: LW_GHOST, role: "beyond", elementType: "Door" };
        ghostSeg.updateWorldMatrix(true, false);
        const projectedGhost = projectToDrawingSpace(ghostSeg, drawing);
        drawing.addProjectionLines(projectedGhost, DOOR_LAYER_GHOST);
        registerSegmentUUID(drawing, projectedGhost, door.id);
      }
      injectedCount++;
    }
    if (injectedCount > 0) {
      console.log(
        `[DoorPlanSymbolBuilder] Injected ${injectedCount} door swing arc(s) into view ${viewDef.id} (level ${levelId})`
      );
    }
  }
  // ── Private ──────────────────────────────────────────────────────────────
  /**
   * Computes the complete door plan symbol geometry in world XZ (y = 0) at the
   * requested Detail Level (§FEAT-DOOR-PLAN-SYMBOL-DETAIL-LEVEL, L-241 P4).
   *
   * Single door: one leaf (drawn OPEN at 90°) + one swing arc.
   * Double door: two symmetric leaves + two arcs, mirrored about the centre.
   *
   * `lod` changes ONLY how many lines are emitted — never a dimension (L-127).
   *
   * Returns null if the wall baseline data is missing or malformed.
   */
  // §MT-06-ONE-AUTHORITY — the plan swing resolves RECORD A, exactly as
  // `WindowPlanSymbolBuilder._computeSymbolGeometry` does and for the same
  // reason: the leaf and its swing arc must start at the edge of the void the
  // wall actually cut, not at the frame record's remembered offset.
  _computeSwingGeometry(doorRaw, wallData, lod = "medium") {
    const door = withAuthoritativeGeometry(doorRaw, openingGeometryFromWall(wallData, doorRaw?.id));
    const bl0 = wallData.baseLine?.[0];
    const bl1 = wallData.baseLine?.[1];
    if (!bl0 || !bl1) return null;
    const width = Number(door.width);
    if (!Number.isFinite(width) || width <= 0) return null;
    const halfWidth = width / 2;
    const host = hostedElementFrame(wallData, Number(door.offset), width);
    const at = (s, n) => {
      const p = host.at(s, n);
      return new Vector3(p.x, 0, p.z);
    };
    const dims = resolveDoorDimensions(door.systemTypeId, door.doorType);
    const frameThick = Math.max(0, dims.frameThickness);
    const leafThick = Math.max(0.01, dims.leafThickness);
    const halfLeaf = leafThick / 2;
    const swingSign = door.swingDirection === "outward" ? -1 : 1;
    const hasHandle = door.handle !== false;
    const cutPositions = [];
    const projPositions = [];
    const ghostPositions = [];
    const wallThickness = Math.max(0.05, Number(wallData.thickness ?? 0.2));
    const halfThk = wallThickness / 2;
    cutPositions.push(
      ...computeDoorFrameJambTicks({
        at: host.at,
        halfWidth,
        halfThickness: halfThk
      })
    );
    const clearHalf = halfWidth - frameThick;
    if (lod !== "coarse" && clearHalf > 0) {
      for (const sign of [-1, 1]) {
        const ti = at(sign * clearHalf, -halfThk);
        const to = at(sign * clearHalf, +halfThk);
        cutPositions.push(ti.x, 0, ti.z, to.x, 0, to.z);
        for (const n of [-halfThk, +halfThk]) {
          pushRun(cutPositions, host.run(sign * halfWidth, sign * clearHalf, n));
        }
      }
    }
    if (lod === "fine" && clearHalf > 0) {
      const stopOffset = Math.min(halfLeaf, halfThk);
      for (const sign of [-1, 1]) {
        for (const n of [-stopOffset, +stopOffset]) {
          pushRun(cutPositions, host.run(sign * halfWidth, sign * clearHalf, n));
        }
      }
    }
    const isDouble = door.doorType === "double";
    if (isDouble) {
      const leafLength = Math.max(0.05, (width - 2 * frameThick) / 2);
      for (const [alongOffset, panelSign] of [[-clearHalf, 1], [+clearHalf, -1]]) {
        const b = this._leafBasisAtJamb(host, alongOffset, panelSign, swingSign, halfThk);
        this._addLeaf(
          b.hinge,
          b.panelDir,
          b.swingDir,
          leafLength,
          leafThick,
          hasHandle,
          lod,
          cutPositions,
          projPositions,
          ghostPositions
        );
      }
    } else {
      const leafLength = Math.max(0.05, width - 2 * frameThick);
      const hingesRight = door.hingesSide === "right";
      const b = this._leafBasisAtJamb(
        host,
        hingesRight ? +clearHalf : -clearHalf,
        hingesRight ? -1 : 1,
        swingSign,
        halfThk
      );
      this._addLeaf(
        b.hinge,
        b.panelDir,
        b.swingDir,
        leafLength,
        leafThick,
        hasHandle,
        lod,
        cutPositions,
        projPositions,
        ghostPositions
      );
    }
    const cutGeo = cutPositions.length > 0 ? new BufferGeometry() : null;
    if (cutGeo) cutGeo.setAttribute("position", new Float32BufferAttribute(cutPositions, 3));
    const projGeo = projPositions.length > 0 ? new BufferGeometry() : null;
    if (projGeo) projGeo.setAttribute("position", new Float32BufferAttribute(projPositions, 3));
    const ghostGeo = ghostPositions.length > 0 ? new BufferGeometry() : null;
    if (ghostGeo) ghostGeo.setAttribute("position", new Float32BufferAttribute(ghostPositions, 3));
    return { cut: cutGeo, proj: projGeo, ghost: ghostGeo };
  }
  /**
   * §FIX-DOOR-SYMBOL-HANDLE-AND-LEAF-ALIGNMENT (L-284) — THE ONE HINGE POINT.
   * §FIX-HOSTED-PLAN-SYMBOL-ON-CURVED-HOST (2026-08-09) — …AND THE ONE LEAF FRAME.
   *
   * THE ARC'S CENTRE **IS** THE HINGE, so there may be exactly ONE definition of it.
   * This is that definition; `_addLeaf` derives the leaf, the arc AND the closed-leaf
   * ghost from the single point it returns, so they cannot drift apart (compute them
   * independently and the drawing lies about the clearance an architect reads off it).
   *
   * IT RETURNS A FRAME, NOT JUST A POINT, and that is the curved-host fix. A door
   * LEAF IS RIGID: it does not bend around the wall it is hung on. So the leaf, its
   * swing arc, its hardware and its ghost must all be built from the tangent and
   * normal at ONE station — the HINGE's — rather than from a chord direction that is
   * only correct on a straight wall. `hostedElementFrame(...).frameAt(alongOffset)`
   * is that station; on a straight host its tangent is the chord direction, so the
   * previous behaviour is reproduced exactly.
   *
   * WHERE THE HINGE IS, AND WHY IT MOVED:
   *
   * It was `centre ± dir·clearHalf` — a point ON THE WALL CENTRELINE. The founder:
   * *"make the door LEAF aligned with the SLAB LINE"* — the open leaf's hinge edge
   * floated half a wall thickness BEHIND the wall face, buried inside the wall. That
   * is not a cosmetic offset: A DOOR PIVOTS ON ITS LINING, AT THE FACE IT IS HUNG ON.
   * A hinge on the centreline puts the swing arc's centre half a wall inside the wall,
   * so EVERY clearance read off that arc is wrong by up to half the wall thickness.
   * L-127: the swing arc is a DIMENSION, not a decoration.
   *
   * The point is derived, never typed:
   *   • ALONG the wall  — the jamb, i.e. the opening's void edge pulled in by the
   *     lining (`clearHalf` = halfWidth − frameThickness). The void edges come from
   *     the opening record (C15 §2), so the hinge sits on the real jamb.
   *   • ACROSS the wall — the wall FACE on the SWING side (`swingDir · halfThickness`),
   *     from the host wall's own thickness. The leaf is hung on the face it opens
   *     towards, so the open leaf projects OUT of the wall from that face line, and
   *     the closed-leaf ghost lies flush behind it.
   *
   * @param host          The host's station mapper from `hostedElementFrame()` — the
   *                      SAME resolver `DoorBuilder.positionGroup` places the 3-D
   *                      door with.
   * @param alongOffset   Signed arc distance from the opening centre to the hinge
   *                      jamb (±clearHalf).
   * @param panelSign     +1 when the closed leaf runs toward increasing arc length,
   *                      −1 when it runs the other way (hinges on the right).
   * @param swingSign     +1 when the door opens toward the LOCAL left-normal
   *                      ('inward'), −1 when it opens the other way ('outward').
   * @param halfThickness Half the HOST WALL's thickness — the reveal to its face.
   */
  _leafBasisAtJamb(host, alongOffset, panelSign, swingSign, halfThickness) {
    const f = host.frameAt(alongOffset);
    const p = host.at(alongOffset, swingSign * halfThickness);
    return {
      hinge: new Vector3(p.x, 0, p.z),
      panelDir: new Vector3(f.tx * panelSign, 0, f.tz * panelSign),
      swingDir: new Vector3(f.nx * swingSign, 0, f.nz * swingSign)
    };
  }
  /**
   * Appends ONE door leaf, drawn in the 90° OPEN position, plus its swing arc.
   *
   * §FEAT-DOOR-PLAN-SYMBOL-DETAIL-LEVEL (L-241) P4 — draughting, per LOD:
   *
   *   coarse : 1 single leaf line (hinge → open tip) + arc          → 1 + 32 segs
   *   medium : leaf as a true double-line rectangle at `leafThick` + arc
   *   fine   : medium + LEVER + ESCUTCHEON hardware on the open leaf,
   *            + the CLOSED-LEAF GHOST (grey/dashed, via the BEYOND pen)
   *
   * WHY THE LEAF IS OPEN (was: closed): the previous symbol drew the leaf lying
   * CLOSED inside the opening AND a radial "open-position" line AND the arc —
   * three readings of one leaf, which is the confusing extra chord the founder
   * reported. Both of his reference images (LOD 100 and LOD 200-300) draw the
   * leaf ONCE, open, with the arc closing back onto the frame.
   *
   * L-127 INVARIANT (must hold at EVERY LOD): the hinge point, `leafLength`
   * (the clear leaf width) and `leafThick` are inputs resolved from the door
   * TYPE — this function never invents a dimension. The arc radius is exactly
   * `leafLength`, so the arc still terminates on the opposite frame corner.
   *
   * @param hinge      World XZ pivot (inner frame corner on the wall centreline).
   * @param panelDir   Unit vector along the wall, hinge → latch (the CLOSED direction).
   * @param swingDir   Unit vector perpendicular to the wall (the OPEN direction).
   * @param leafLength Clear leaf width = hinge → latch = the arc radius.
   * @param leafThick  Full leaf thickness (from the door type).
   * @param hasHandle  The RECORD's `handle` flag — gates the LOD-300 ironmongery.
   * @param lod        Effective detail level for this door in this view.
   */
  _addLeaf(hinge, panelDir, swingDir, leafLength, leafThick, hasHandle, lod, cutPositions, projPositions, ghostPositions) {
    const cutSeg = (a, b) => {
      cutPositions.push(a.x, 0, a.z, b.x, 0, b.z);
    };
    const projSeg = (ax, az, bx, bz) => {
      projPositions.push(ax, 0, az, bx, 0, bz);
    };
    const P0 = hinge.clone();
    const P1 = hinge.clone().addScaledVector(swingDir, leafLength);
    const P3 = hinge.clone().addScaledVector(panelDir, leafThick);
    const P2 = P1.clone().addScaledVector(panelDir, leafThick);
    if (lod === "coarse") {
      cutSeg(P0, P1);
    } else {
      cutSeg(P0, P1);
      cutSeg(P1, P2);
      cutSeg(P2, P3);
      cutSeg(P3, P0);
    }
    for (let i = 0; i < ARC_SEGMENTS; i++) {
      const t0 = i / ARC_SEGMENTS * (Math.PI / 2);
      const t1 = (i + 1) / ARC_SEGMENTS * (Math.PI / 2);
      const c0 = Math.cos(t0), s0 = Math.sin(t0);
      const c1 = Math.cos(t1), s1 = Math.sin(t1);
      projSeg(
        hinge.x + (c0 * panelDir.x + s0 * swingDir.x) * leafLength,
        hinge.z + (c0 * panelDir.z + s0 * swingDir.z) * leafLength,
        hinge.x + (c1 * panelDir.x + s1 * swingDir.x) * leafLength,
        hinge.z + (c1 * panelDir.z + s1 * swingDir.z) * leafLength
      );
    }
    if (lod === "fine" && hasHandle) {
      const setBack = 3 * leafThick;
      const leverLen = 2 * leafThick;
      const roseHalf = leafThick;
      const roseProj = leafThick / 2;
      if (leafLength > setBack + roseHalf) {
        const c = hinge.clone().addScaledVector(swingDir, leafLength - setBack);
        const along = (t) => c.clone().addScaledVector(swingDir, t);
        const out = (p, d) => p.clone().addScaledVector(panelDir, -d);
        const cheekA0 = along(-roseHalf);
        const cheekB0 = along(+roseHalf);
        const cheekA1 = out(cheekA0, roseProj);
        const cheekB1 = out(cheekB0, roseProj);
        projSeg(cheekA0.x, cheekA0.z, cheekA1.x, cheekA1.z);
        projSeg(cheekB0.x, cheekB0.z, cheekB1.x, cheekB1.z);
        projSeg(cheekA1.x, cheekA1.z, cheekB1.x, cheekB1.z);
        const lever0 = cheekB1.clone();
        const lever1 = out(cheekB0, roseProj + leverLen);
        projSeg(lever0.x, lever0.z, lever1.x, lever1.z);
      }
    }
    if (lod === "fine") {
      const g = (t, u) => hinge.clone().addScaledVector(panelDir, t).addScaledVector(swingDir, -u);
      const q0 = g(0, 0), q1 = g(leafLength, 0);
      const q2 = g(leafLength, leafThick), q3 = g(0, leafThick);
      const ghostSeg = (a, b) => {
        ghostPositions.push(a.x, 0, a.z, b.x, 0, b.z);
      };
      ghostSeg(q0, q1);
      ghostSeg(q1, q2);
      ghostSeg(q2, q3);
      ghostSeg(q3, q0);
    }
  }
}
const doorPlanSymbolBuilder = new DoorPlanSymbolBuilder();

function deepFreeze(obj) {
  if (obj === null || typeof obj !== "object" || Object.isFrozen(obj)) return obj;
  for (const key of Object.keys(obj)) {
    const v = obj[key];
    if (v && typeof v === "object") deepFreeze(v);
  }
  return Object.freeze(obj);
}
class UpdateDoorParameterCommand {
  constructor(doorId, patch, prev = {}) {
    this.doorId = doorId;
    this.patch = patch;
    this.targetIds = [doorId];
    this.patch = deepFreeze({ ...patch });
    this.prev = deepFreeze({ ...prev });
  }
  doorId;
  patch;
  affectedStores = ["door", "wall"];
  id = crypto.randomUUID();
  type = CommandType.UPDATE_DOOR_PARAMETER;
  timestamp = Date.now();
  targetIds;
  prev;
  prevCapturedAtExecute = false;
  canExecute(_context) {
    const current = doorStore.getById(this.doorId);
    if (!current) {
      return { ok: false, reason: `Door not found: ${this.doorId}` };
    }
    const merged = { ...current, ...this.patch };
    const parsed = DoorOpeningSchema.safeParse(merged);
    if (!parsed.success) {
      return { ok: false, reason: `Invalid door patch: ${parsed.error.issues.map((i) => i.message).join("; ")}` };
    }
    return { ok: true };
  }
  execute(context) {
    const current = doorStore.getById(this.doorId);
    if (!current) {
      return { success: false, affectedElementIds: [], info: [`Door not found: ${this.doorId}`] };
    }
    if (!this.prevCapturedAtExecute) {
      const captured = {};
      for (const key of Object.keys(this.patch)) {
        captured[key] = current[key];
      }
      this.prev = deepFreeze(captured);
      this.prevCapturedAtExecute = true;
    }
    if ("openingProfile" in this.patch) {
      const wall = context.stores?.wallStore?.getById?.(current.wallId);
      const reason = openingProfileRefusal({
        profile: this.patch.openingProfile,
        width: current.width,
        height: current.height,
        sillHeight: current.sillHeight,
        host: wall ?? null
      });
      if (reason) {
        return { success: false, affectedElementIds: [], info: [reason] };
      }
    }
    doorStore.update(this.doorId, this.patch);
    this._syncWallStore(context, this.patch);
    return { success: true, affectedElementIds: [this.doorId] };
  }
  undo(context) {
    if (!doorStore.has(this.doorId)) {
      return { success: false, affectedElementIds: [], info: [`Door not found for undo: ${this.doorId}`] };
    }
    doorStore.update(this.doorId, this.prev);
    this._syncWallStore(context, this.prev);
    return { success: true, affectedElementIds: [this.doorId] };
  }
  serialize() {
    return {
      type: this.type,
      targetIds: this.targetIds,
      timestamp: this.timestamp,
      payload: { doorId: this.doorId, patch: this.patch, prev: this.prev },
      version: 2
    };
  }
  _syncWallStore(context, delta) {
    try {
      const ws = context.stores.wallStore;
      if (!ws.getDoor(this.doorId)) return;
      ws.updateDoor(this.doorId, delta);
      if (delta && "openingProfile" in delta) {
        const dr = ws.getDoor(this.doorId);
        const wall = dr ? ws.getById?.(dr.wallId) : null;
        const existing = wall?.openings?.find(
          (o) => o.elementId === this.doorId || o.id === dr?.openingId
        );
        if (wall && existing) {
          ws.updateOpening(wall.id, {
            ...existing,
            openingProfile: delta.openingProfile
          });
        }
      }
    } catch (err) {
      console.warn(
        `[UpdateDoorParameterCommand] wall-store mirror write FAILED for ${this.doorId} — wall geometry now disagrees with the door store.`,
        err
      );
    }
  }
}

const DOOR_FLIP_STATES = [
  { swingDirection: "inward", hingesSide: "left" },
  { swingDirection: "inward", hingesSide: "right" },
  { swingDirection: "outward", hingesSide: "left" },
  { swingDirection: "outward", hingesSide: "right" }
];
class DoorPlacementFlip {
  _index;
  _onChange;
  _keyHandler = null;
  constructor(opts = {}) {
    this._index = normalizeIndex(opts.initialIndex ?? 0);
    this._onChange = opts.onChange;
  }
  /** Current 0..3 state index. */
  index() {
    return this._index;
  }
  /** Current { swingDirection, hingesSide } configuration. */
  state() {
    return DOOR_FLIP_STATES[this._index];
  }
  /** Current swing direction — read into the create-command payload. */
  swingDirection() {
    return this.state().swingDirection;
  }
  /** Current hinge side — read into the create-command payload. */
  hingesSide() {
    return this.state().hingesSide;
  }
  /** Short HUD label for the current state, e.g. "In · Left". */
  label() {
    const s = this.state();
    const swing = s.swingDirection === "inward" ? "In" : "Out";
    const hinge = s.hingesSide === "left" ? "Left" : "Right";
    return `${swing} · ${hinge}`;
  }
  /** Advance to the next state (wraps 3 → 0). Returns the new state. */
  advance() {
    this._index = normalizeIndex(this._index + 1);
    const s = this.state();
    this._onChange?.(s);
    return s;
  }
  /** Reset to the first state (inward / left). Does NOT fire onChange. */
  reset(index = 0) {
    this._index = normalizeIndex(index);
  }
  /**
   * Install a keydown listener (on `document`) that advances the flip when SPACE
   * is pressed. Idempotent. The listener:
   *   - ignores SPACE while focus is in a form field (input/select/textarea/
   *     contenteditable) so typing a dimension is unaffected,
   *   - calls `preventDefault()` so the page does not scroll and no other SPACE
   *     shortcut fires.
   *
   * Used by the 3D DoorTool (which owns its own DOM listeners). The plan handler
   * does NOT call this — it advances from its overlay-routed `onKeyDown`
   * (PlanToolHandler contract §21 §2). MUST be paired with `detach()`.
   */
  attach() {
    if (this._keyHandler) return;
    this._keyHandler = (e) => {
      if (e.code !== "Space" && e.key !== " " && e.key !== "Spacebar") return;
      if (isFormFieldTarget(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      this.advance();
    };
    document.addEventListener("keydown", this._keyHandler, true);
  }
  /** Remove the keydown listener. Safe to call when not attached. */
  detach() {
    if (!this._keyHandler) return;
    document.removeEventListener("keydown", this._keyHandler, true);
    this._keyHandler = null;
  }
}
function normalizeIndex(i) {
  const n = DOOR_FLIP_STATES.length;
  return (Math.trunc(i) % n + n) % n;
}
function isFormFieldTarget(target) {
  const el = target;
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toUpperCase();
  if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return true;
  if (el.isContentEditable) return true;
  return false;
}

export { ALL_DOOR_SWINGS, DEFAULT_DOOR_TOOL_CONFIG, DoorDependencyTracker, DoorLevelCleanupHandler, DoorOpeningSchema, DoorPlanSymbolBuilder, DoorTool, SWING_TO_LEGACY, UNREPRESENTABLE_SWINGS, appendDwGroup, buildDoorOpening, buildDoorSection, buildDoorStoreRecord, buildFinishMaterialSelect, computeDoorFrameJambTicks, doorPlanSymbolBuilder, doorStore, doorSystemTypeStore, getDoorToolConfig, injectDwStyles, isDoorUntyped, mapSwingToLegacy, planDoorTypeBackfill, resolveDefaultDoorSystemTypeId, resolveDoorDimensions, setDoorSectionCommandManager, setDoorToolConfig };
