import { b7 as windowSystemTypeStore, k as windowStore, bS as onWallBaseYChanged, Z as OPENING_PROFILE_KINDS, X as OPENING_PROFILE_LABELS, aa as SEGMENTAL_RISE_RATIO, ci as wallStore, cj as resolveRevealDirection, ck as REVEAL_DIRECTIONS, cl as REVEAL_DIRECTION_LABEL, cm as MAX_REVEAL_SPLAY_DEG, cn as REVEAL_SIDES, co as REVEAL_SPLAY_FIELD, cp as REVEAL_SIDE_LABEL, cq as resolveWindowReveal, cr as windowRevealRefusal, cs as resolveCustomOutlineInput, ct as resolveWindowDimensions, bT as isArcHost, b8 as wallCentrelineLength, bU as arcLengthAtPointXZ, w as wallOccupancyStore, f as canPlaceRefusalText, bW as PREVIEW_COLOR, bX as arcFrameAt, l as CreateWallOpeningCommand, a as storeRegistry, bY as vgGovernanceStore, bZ as resolveEffectiveDetailLevel, b_ as registerSegmentUUID, b$ as withAuthoritativeGeometry, c0 as openingGeometryFromWall, c1 as hostedElementFrame, cu as DEFAULT_WINDOW_DIMENSIONS, cv as isRectangularProfile, cw as openingOutline, cx as resolveOpeningProfile, C as CommandType, cE as WindowOpeningSchema, cI as isRevealAuthored, cK as windowRevealAdvisory, ab as openingProfileRefusal } from './ElementStore-CQe7ZDFd.js';
export { cy as CustomOutlineSchema, cz as EXTERIOR_LOCAL_Z, cA as WINDOW_COLOR_SENTINEL, cB as WINDOW_UNRESOLVED_MATERIAL_COLOR, cC as WindowBuilder, cD as WindowFinishLayerSchema, cF as WindowStore, cG as WindowSystemTypeStore, cc as arcSeat, cH as curvedLeafRefusal, ce as leafArc, cJ as resolveWindowFrameColour, cg as sweptBoxGeometry } from './ElementStore-CQe7ZDFd.js';
import { D as DEFAULT_WINDOW_TOOL_CONFIG, b as buildWindowStoreRecord, g as getWindowToolConfig, s as setWindowToolConfig, a as buildWindowOpening } from './WindowTypeChange-BhhzXbXs.js';
export { P as WINDOW_PRESERVED_ON_TYPE_CHANGE, p as planWindowTypeChange, r as resetWindowToolConfig } from './WindowTypeChange-BhhzXbXs.js';
import { t as trace } from './trace-api-BIfvUk_c.js';
import './SteelProfileLibrary-NgbfwhrM.js';
import './LODManager-DHqndFcX.js';
import { a as appendDwGroup, b as buildFinishMaterialSelect, p as projectToDrawingSpace } from './BimWorld-D6sDpfEG.js';
import { a as Vector2, p as Raycaster, d7 as BoxGeometry, b0 as MeshBasicMaterial, M as Mesh, V as Vector3, L as LineSegments, cD as LineBasicMaterial, B as BufferGeometry, F as Float32BufferAttribute, P as Plane } from './three.core-Bv4ks8y-.js';
import './three.module-zvZFyv9V.js';

let _cachedTracer = null;
function _tracer() {
  _cachedTracer ??= trace.getTracer("@pryzm/geometry-window", "0.1.0");
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
  "glazingThickness",
  "rebateDepth",
  "sashThickness",
  "sashDepth",
  // §FEAT-WINDOW-CUT-ZONE-AND-LOD (L-278) — the pane grid is INSTANCE truth: an architect
  // who set a 3-pane window must not have it migrated back to the type's default grid.
  // (This slot said `mullionThickness` — a field that no longer exists on any window
  // record, so the backfill was protecting nothing.)
  "columnRatios",
  "rowRatios",
  "columnDividerThickness",
  "rowDividerThickness",
  "windowType",
  "mark"
]);
function isWindowUntyped(win) {
  return typeof win.systemTypeId !== "string" || win.systemTypeId.length === 0;
}
function resolveDefaultWindowSystemTypeId() {
  return _tracer().startActiveSpan("pryzm.window.resolveDefaultSystemTypeId", (span) => {
    try {
      const id = DEFAULT_WINDOW_TOOL_CONFIG.systemTypeId;
      const type = windowSystemTypeStore.getById(id);
      span.setAttribute("pryzm.window.defaultSystemTypeId", id);
      span.setAttribute("pryzm.window.defaultResolved", type !== void 0);
      span.end();
      return type ? id : null;
    } catch (err) {
      span.recordException(err);
      span.end();
      throw err;
    }
  });
}
function planWindowTypeBackfill(windows) {
  return _tracer().startActiveSpan("pryzm.window.planTypeBackfill", (span) => {
    try {
      const defaultTypeId = resolveDefaultWindowSystemTypeId();
      if (!defaultTypeId) {
        const reason = `[WindowTypeBackfill] The window catalogue has no resolvable default type ("${DEFAULT_WINDOW_TOOL_CONFIG.systemTypeId}" is not in windowSystemTypeStore). Refusing to invent one — no windows migrated.`;
        span.setAttribute("pryzm.window.backfill.blocked", true);
        span.end();
        return {
          defaultTypeId: DEFAULT_WINDOW_TOOL_CONFIG.systemTypeId,
          defaultTypeName: "",
          scanned: windows.length,
          entries: [],
          blockedReason: reason
        };
      }
      const defaultType = windowSystemTypeStore.getById(defaultTypeId);
      const entries = [];
      for (const win of windows) {
        if (!isWindowUntyped(win)) continue;
        const canonical = buildWindowStoreRecord({
          opening: {
            ...win,
            id: win.openingId,
            // chokepoint: `opening.id` IS the openingId
            elementId: win.id,
            // … and `opening.elementId` IS the window id
            systemTypeId: defaultTypeId
          },
          wallId: win.wallId,
          mark: win.mark
        });
        const patch = {};
        for (const [k, v] of Object.entries(canonical)) {
          if (INSTANCE_FIELDS.has(k)) continue;
          if (v === void 0) continue;
          patch[k] = v;
        }
        entries.push({
          id: win.id,
          wallId: win.wallId,
          from: void 0,
          to: defaultTypeId,
          patch
        });
      }
      span.setAttribute("pryzm.window.backfill.scanned", windows.length);
      span.setAttribute("pryzm.window.backfill.untyped", entries.length);
      span.setAttribute("pryzm.window.backfill.defaultTypeId", defaultTypeId);
      span.end();
      return {
        defaultTypeId,
        defaultTypeName: defaultType.name,
        scanned: windows.length,
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

class WindowDependencyTracker {
  graph = /* @__PURE__ */ new Map();
  /**
   * §FIX-HOSTWALL-TRACKER-INDEX-QUADRATIC — windowId → the wallId bucket it is
   * currently filed under. Twin of the DoorDependencyTracker pointer; see the long
   * note there. Turns `register()` / `unregister()` from an O(walls-with-openings)
   * bucket scan into O(1), which is what makes `bootstrap()` and project-teardown
   * `clear()` linear instead of quadratic.
   *
   * INVARIANT: `home.get(w) === wall`  ⟺  `graph.get(wall)!.has(w)`; empty buckets pruned.
   */
  home = /* @__PURE__ */ new Map();
  unsubscribeWall;
  unsubscribeBaseY;
  unsubscribeWindow;
  constructor(_commandManagerRef, wallStore) {
    this.unsubscribeWindow = windowStore.subscribe((event, win) => {
      if (event === "add" || event === "update") this.register(win.id, win.wallId);
      if (event === "remove") this.unregister(win.id);
    });
    this.unsubscribeWall = wallStore.subscribe((event, wall, prev) => {
      if (event === "remove") {
        const gone = this.graph.get(wall.id);
        if (gone) {
          for (const winId of gone) this.home.delete(winId);
        }
        this.graph.delete(wall.id);
        return;
      }
      if (event === "update" && prev && this._wallGeometryChanged(prev, wall)) {
        const ids = this.graph.get(wall.id);
        if (ids && ids.size > 0) {
          for (const winId of [...ids]) {
            try {
              windowStore.touch(winId);
            } catch (err) {
              console.warn(`[WindowDependencyTracker] touch(${winId}) failed:`, err);
            }
          }
        }
      }
    });
    this.unsubscribeBaseY = onWallBaseYChanged((wallId) => {
      const ids = this.graph.get(wallId);
      if (!ids || ids.size === 0) return;
      for (const winId of [...ids]) {
        try {
          windowStore.touch(winId);
        } catch (err) {
          console.warn(`[WindowDependencyTracker] base-Y touch(${winId}) failed:`, err);
        }
      }
    });
  }
  /**
   * §WALL-DEEP-2026 O2 — geometry-change detector.
   *
   * Returns true if any wall field that affects hosted-opening world
   * placement has changed: the two baseLine endpoints (planar XZ + y),
   * height, or thickness. Layer / metadata / side-classification edits
   * intentionally do NOT trigger a rebuild because they cannot move an
   * opening's world position.
   */
  _wallGeometryChanged(prev, next) {
    if (prev.height !== next.height) return true;
    if (prev.thickness !== next.thickness) return true;
    if ((prev.baseOffset ?? 0) !== (next.baseOffset ?? 0)) return true;
    const a = prev.baseLine, b = next.baseLine;
    return a[0].x !== b[0].x || a[0].y !== b[0].y || a[0].z !== b[0].z || a[1].x !== b[1].x || a[1].y !== b[1].y || a[1].z !== b[1].z;
  }
  register(windowId, wallId) {
    const current = this.home.get(windowId);
    if (current === wallId) return;
    if (current !== void 0) this._detach(windowId, current);
    let bucket = this.graph.get(wallId);
    if (!bucket) {
      bucket = /* @__PURE__ */ new Set();
      this.graph.set(wallId, bucket);
    }
    bucket.add(windowId);
    this.home.set(windowId, wallId);
  }
  unregister(windowId) {
    const current = this.home.get(windowId);
    if (current === void 0) return;
    this._detach(windowId, current);
  }
  /** §FIX-HOSTWALL-TRACKER-INDEX-QUADRATIC — O(1) bucket detach, pruning empties. */
  _detach(windowId, wallId) {
    const bucket = this.graph.get(wallId);
    if (bucket) {
      bucket.delete(windowId);
      if (bucket.size === 0) this.graph.delete(wallId);
    }
    this.home.delete(windowId);
  }
  bootstrap() {
    for (const win of windowStore.getAll()) {
      this.register(win.id, win.wallId);
    }
  }
  getWindowIdsForWall(wallId) {
    return Array.from(this.graph.get(wallId) ?? []);
  }
  dispose() {
    this.unsubscribeWall?.();
    this.unsubscribeWindow?.();
    this.unsubscribeBaseY?.();
    this.graph.clear();
    this.home.clear();
  }
}

class WindowLevelCleanupHandler {
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
    for (const win of windowStore.getAll()) {
      const wall = this.wallStore.getById(win.wallId);
      if (!wall || wall.levelId === levelId) {
        orphans.push(win.id);
      }
    }
    if (orphans.length === 0) return;
    const cm = this.commandManagerRef.current;
    if (!cm) {
      console.warn(
        "[WindowLevelCleanupHandler] commandManager unavailable — falling back to direct windowStore.remove() for orphan cleanup. Removal will NOT be undoable."
      );
      orphans.forEach((id) => windowStore.remove(id));
      return;
    }
    for (const id of orphans) {
      try {
        this.wallStore.removeWindow(id);
      } catch {
        windowStore.remove(id);
      }
    }
  };
  dispose() {
    window.removeEventListener("bim-level-removed", this.onLevelRemoved);
  }
}

let _commandManager = null;
function setWindowSectionCommandManager(cm) {
  _commandManager = cm;
}
let _outlineEditorOpener = null;
function setWindowOutlineEditorOpener(fn) {
  _outlineEditorOpener = fn;
}
function dispatch(windowId, patch) {
  const cmdMgr = _commandManager ?? window.commandManager;
  if (!cmdMgr) {
    console.error("[WindowSection] commandManager not configured — call setWindowSectionCommandManager() at bootstrap");
    return "The command manager is not available in this session, so nothing was changed.";
  }
  const current = windowStore.getById(windowId);
  if (!current) {
    console.warn("[WindowSection] Window not found in store:", windowId);
    return `This window is no longer in the model (${windowId}), so nothing was changed.`;
  }
  const prevFields = {};
  for (const key of Object.keys(patch)) {
    prevFields[key] = current[key];
  }
  const cmd = new UpdateWindowParameterCommand(windowId, patch, prevFields);
  const result = cmdMgr.execute(cmd);
  if (!result?.success) {
    console.warn("[WindowSection] UpdateWindowParameterCommand failed:", result?.info);
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
  if (options.some((o) => o.value === current)) sel.value = current;
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
function makeTextInput(current, onChange) {
  const inp = document.createElement("input");
  inp.type = "text";
  inp.className = "dw-text";
  inp.value = current;
  inp.addEventListener("change", () => onChange(inp.value.trim()));
  return inp;
}
function makeSlider(current, min, max, step, format, onChange) {
  const wrap = document.createElement("div");
  wrap.className = "dw-slider";
  const inp = document.createElement("input");
  inp.type = "range";
  inp.min = String(min);
  inp.max = String(max);
  inp.step = String(step);
  inp.value = String(current);
  const label = document.createElement("span");
  label.className = "dw-slider-value";
  label.textContent = format(current);
  inp.addEventListener("input", () => {
    const v = parseFloat(inp.value);
    label.textContent = format(v);
    onChange(v);
  });
  wrap.appendChild(inp);
  wrap.appendChild(label);
  return wrap;
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
function makeIntSlider(current, min, max, onChange) {
  return makeSlider(current, min, max, 1, (v) => String(Math.round(v)), onChange);
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
function appendRevealFields(body, windowId, win) {
  const wall = wallStore.getById?.(win.wallId);
  const thickness = typeof wall?.thickness === "number" && wall.thickness > 0 ? wall.thickness : null;
  const readout = document.createElement("div");
  readout.className = "dw-label";
  readout.style.cssText = "grid-column:1/-1;opacity:0.75;font-size:11px;line-height:1.45;";
  const refreshReadout = () => {
    const now = windowStore.getById(windowId);
    if (!now) {
      readout.textContent = "";
      return;
    }
    if (thickness === null) {
      readout.textContent = "Glass size is not shown: this window’s host wall could not be read, and the reveal depth is half the wall thickness. No thickness, no derivable answer.";
      return;
    }
    const r = resolveWindowReveal(now, thickness);
    const refusal = windowRevealRefusal(now, thickness);
    readout.textContent = refusal ? `⛔ ${refusal}` : `Reveal depth ${r.run.toFixed(3)} m · glass ${r.glazingWidth.toFixed(3)} × ${r.glazingHeight.toFixed(3)} m` + (r.hasProjection ? ` · outer face ${Math.abs(r.projection).toFixed(3)} m ${r.projection > 0 ? "proud of" : "behind"} the ${r.direction} wall face` : "");
  };
  const push = (patch) => {
    dispatch(windowId, patch);
    refreshReadout();
  };
  const dirRow = makeField(
    "Reveal Direction",
    makeSelect(
      REVEAL_DIRECTIONS.map((d) => ({ value: d, label: REVEAL_DIRECTION_LABEL[d] })),
      resolveRevealDirection(win.revealDirection),
      (v) => push({ revealDirection: v })
    )
  );
  const dirHelp = document.createElement("div");
  dirHelp.className = "dw-note";
  dirHelp.textContent = "Applies to the projection AND the splay — they are one reveal. PRYZM does not yet detect which wall face is outdoors, so this is your choice, not a detected value.";
  body.appendChild(dirRow);
  body.appendChild(dirHelp);
  body.appendChild(makeField(
    "Projection (m)",
    makeNumberInput(win.revealProjection ?? 0, -1, 2, 0.01, (v) => push({ revealProjection: v }))
  ));
  body.appendChild(makeField(
    "Splay all sides (°)",
    makeNumberInput(0, 0, MAX_REVEAL_SPLAY_DEG, 1, (v) => push({
      revealSplayHead: v,
      revealSplaySill: v,
      revealSplayJambLeft: v,
      revealSplayJambRight: v
    }))
  ));
  const perEdgeRows = [];
  let anyPerEdgeSet = false;
  for (const side of REVEAL_SIDES) {
    const field = REVEAL_SPLAY_FIELD[side];
    const current = win[field] ?? 0;
    if (current > 0) anyPerEdgeSet = true;
    perEdgeRows.push(makeField(
      `Splay ${REVEAL_SIDE_LABEL[side]} (°)`,
      makeNumberInput(
        current,
        0,
        MAX_REVEAL_SPLAY_DEG,
        1,
        (v) => push({ [field]: v })
      )
    ));
  }
  const disclose = document.createElement("button");
  disclose.type = "button";
  disclose.className = "dw-disclose";
  let open = anyPerEdgeSet;
  const paint = () => {
    disclose.textContent = open ? "▾ Set each edge separately" : "▸ Set each edge separately (4 controls)";
    disclose.setAttribute("aria-expanded", String(open));
    for (const r of perEdgeRows) r.style.display = open ? "contents" : "none";
  };
  disclose.addEventListener("click", () => {
    open = !open;
    paint();
  });
  body.appendChild(disclose);
  for (const r of perEdgeRows) body.appendChild(r);
  paint();
  refreshReadout();
  body.appendChild(readout);
  return readout;
}
function buildWindowSection(windowId) {
  const win = windowStore.getById(windowId);
  if (!win) return null;
  const section = document.createElement("div");
  section.className = "dw-section";
  const header = document.createElement("div");
  header.className = "dw-section-header";
  const title = document.createElement("div");
  title.className = "dw-section-title";
  title.textContent = "Window Parameters";
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
    makeNumberInput(win.width, 0.3, 6, 0.05, (v) => dispatch(windowId, { width: v }))
  ));
  body.appendChild(makeField(
    "Height (m)",
    makeNumberInput(win.height, 0.3, 4, 0.05, (v) => dispatch(windowId, { height: v }))
  ));
  body.appendChild(makeField(
    "Sill Height (m)",
    makeNumberInput(win.sillHeight, 0, 2, 0.05, (v) => dispatch(windowId, { sillHeight: v }))
  ));
  appendDwGroup(body, "Type & Shape");
  body.appendChild(makeField(
    "Window Type",
    makeSelect(
      [{ value: "single", label: "Single" }, { value: "double", label: "Double" }],
      win.windowType,
      (v) => dispatch(windowId, { windowType: v })
    )
  ));
  const shapeNote = document.createElement("div");
  shapeNote.className = "dw-label";
  shapeNote.style.cssText = "grid-column:1/-1;opacity:0.85;font-size:11px;line-height:1.45;display:none;";
  const shapeSelect = makeSelect(
    OPENING_PROFILE_KINDS.filter((k) => k !== "custom" || win.customOutline !== void 0).map((k) => ({
      value: k,
      label: k === "segmental-arch" ? `${OPENING_PROFILE_LABELS[k]} (rise 1/${Math.round(1 / SEGMENTAL_RISE_RATIO)} of width)` : OPENING_PROFILE_LABELS[k]
    })),
    win.openingProfile ?? "rectangular",
    (v) => {
      const refusal = dispatch(windowId, { openingProfile: v });
      if (refusal === null) {
        shapeNote.textContent = "";
        shapeNote.style.display = "none";
        return;
      }
      shapeNote.textContent = `⛔ ${refusal}`;
      shapeNote.style.display = "";
      shapeSelect.value = windowStore.getById(windowId)?.openingProfile ?? "rectangular";
    }
  );
  body.appendChild(makeField("Shape", shapeSelect));
  body.appendChild(shapeNote);
  const syncShapeControl = () => {
    const rec = windowStore.getById(windowId);
    const hasCustomOption = Array.from(shapeSelect.options).some((o) => o.value === "custom");
    if (rec?.customOutline !== void 0 && !hasCustomOption) {
      const o = document.createElement("option");
      o.value = "custom";
      o.textContent = OPENING_PROFILE_LABELS["custom"];
      shapeSelect.appendChild(o);
    }
    shapeSelect.value = rec?.openingProfile ?? "rectangular";
  };
  const outlineButton = (label, onClick) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "dw-btn";
    b.setAttribute("data-window-outline-action", label);
    b.textContent = label;
    b.addEventListener("click", (e) => {
      e.preventDefault();
      onClick();
    });
    return b;
  };
  const outlineRow = document.createElement("div");
  outlineRow.className = "dw-field";
  outlineRow.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;";
  outlineRow.appendChild(outlineButton("Apply shape from type", () => {
    const rec = windowStore.getById(windowId);
    const typeId = rec?.systemTypeId;
    const template = resolveCustomOutlineInput(
      typeId ? windowSystemTypeStore.getById(typeId)?.customOutline : void 0
    );
    if (!template) {
      shapeNote.textContent = `⛔ ${typeId ? `The window type "${windowSystemTypeStore.getById(typeId)?.name ?? typeId}"` : "This window has no type, and its (absent) type"} carries no outline template — author one in the type editor (Elevation outline), then apply it here.`;
      shapeNote.style.display = "";
      return;
    }
    const refusal = dispatch(windowId, {
      openingProfile: "custom",
      customOutline: structuredClone(template)
    });
    if (refusal) {
      shapeNote.textContent = `⛔ ${refusal}`;
      shapeNote.style.display = "";
      return;
    }
    shapeNote.textContent = "";
    shapeNote.style.display = "none";
    syncShapeControl();
  }));
  outlineRow.appendChild(outlineButton("Edit outline…", () => {
    if (!_outlineEditorOpener) {
      shapeNote.textContent = "⛔ The outline editor is not wired in this session (setWindowOutlineEditorOpener was never called) — nothing was changed.";
      shapeNote.style.display = "";
      return;
    }
    const rec = windowStore.getById(windowId);
    if (!rec) return;
    _outlineEditorOpener({
      windowId,
      width: rec.width,
      height: rec.height,
      ring: resolveCustomOutlineInput(rec.customOutline),
      onCommit: (ring) => {
        const refusal = dispatch(windowId, {
          openingProfile: "custom",
          customOutline: ring
        });
        if (refusal) {
          shapeNote.textContent = `⛔ ${refusal}`;
          shapeNote.style.display = "";
          return;
        }
        shapeNote.textContent = "";
        shapeNote.style.display = "none";
        syncShapeControl();
      }
    });
  }));
  body.appendChild(outlineRow);
  appendDwGroup(body, "Reveal & Splay");
  appendRevealFields(body, windowId, win);
  appendDwGroup(body, "Appearance");
  body.appendChild(makeField(
    "Frame Color",
    makeColorPicker(win.frameColor, (v) => dispatch(windowId, { frameColor: v }))
  ));
  body.appendChild(makeField(
    "Glass Opacity",
    makeSlider(
      win.glassOpacity,
      0,
      1,
      0.05,
      (v) => v.toFixed(2),
      (v) => dispatch(windowId, { glassOpacity: v })
    )
  ));
  body.appendChild(makeField(
    "Sill",
    makeToggle(
      [{ value: "true", label: "On" }, { value: "false", label: "Off" }],
      String(win.sill),
      (v) => dispatch(windowId, { sill: v === "true" })
    )
  ));
  appendDwGroup(body, "Subdivision");
  const currentCols = win.columnRatios.length;
  body.appendChild(makeField(
    "Columns (1–4)",
    makeIntSlider(currentCols, 1, 4, (v) => {
      const n = Math.round(v);
      dispatch(windowId, { columnRatios: Array(n).fill(1 / n) });
    })
  ));
  const currentRows = win.rowRatios.length;
  body.appendChild(makeField(
    "Rows (1–3)",
    makeIntSlider(currentRows, 1, 3, (v) => {
      const n = Math.round(v);
      dispatch(windowId, { rowRatios: Array(n).fill(1 / n) });
    })
  ));
  appendDwGroup(body, "Finishes");
  body.appendChild(makeField(
    "Frame Finish",
    buildFinishMaterialSelect({
      currentId: win.frameFinish?.materialId,
      legacyName: win.frameFinish?.name,
      onChange: (id, color, label) => dispatch(windowId, {
        frameFinish: { name: label, materialId: id || void 0, materialColor: color },
        // A window's schedule finish is its FRAME (CreateWallOpeningCommand :277).
        // A door's is its LEAF. Different by construction, not by drift — and
        // it is now DERIVED from the reference instead of typed by hand.
        finishMaterial: label || void 0
      })
    })
  ));
  body.appendChild(makeField(
    "Sill Finish",
    buildFinishMaterialSelect({
      currentId: win.sillFinish?.materialId,
      legacyName: win.sillFinish?.name,
      onChange: (id, color, label) => dispatch(windowId, {
        sillFinish: { name: label, materialId: id || void 0, materialColor: color }
      })
    })
  ));
  appendDwGroup(body, "Performance");
  const fireInput = makeTextInput(win.fireRating ?? "", (v) => dispatch(windowId, { fireRating: v || void 0 }));
  fireInput.placeholder = "Not set — counts as unrated";
  fireInput.title = "Fire resistance designation, e.g. EI30, EW60, FD30. Left blank the opening is measured as UNRATED in the quantity take-off.";
  fireInput.setAttribute("list", "dw-fire-ratings-window");
  const fireList = document.createElement("datalist");
  fireList.id = "dw-fire-ratings-window";
  for (const r of ["EI30", "EI60", "EI90", "EW30", "EW60", "E30", "E60"]) {
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

class WindowTool {
  world;
  wallStore;
  _isActive = false;
  previewWindow = null;
  statusOverlay = null;
  _disposed = false;
  _escListener = null;
  /** §M6 — current HUD state. */
  _hudState = "idle";
  // §FIX-DOOR-WINDOW-SYMBOL-PARITY-AND-LOD300 (L-266) — the DEFAULT_SINGLE_WIDTH /
  // DEFAULT_DOUBLE_WIDTH / DEFAULT_HEIGHT / DEFAULT_SILL_HEIGHT private fields are
  // GONE. They were one of TWO independent truths for the window's structural
  // opening (the other being the bare literals 1.2 / 2.4 / 1.2 / 1.0 inside
  // WindowPlanToolHandler), which is exactly how a window drawn in plan became a
  // different object from the "same" window drawn in 3D. Every dimension now comes
  // from `resolveWindowDimensions()` — record → system type → canonical default.
  DEFAULT_THICKNESS_OFFSET = 0.02;
  /** The window's real dimensions for the CURRENT tool choice (pre-creation case). */
  _dims() {
    const cfg = getWindowToolConfig();
    return resolveWindowDimensions({
      systemTypeId: cfg.systemTypeId,
      windowType: cfg.windowType
    });
  }
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
      console.error("[WindowTool] commandManager not injected via constructor — window placement will not function until provided.");
    }
  }
  /** PLAN-03: Called by EngineBootstrap after selectionManager is available. */
  setSelectionManager(sm) {
    this.selectionManager = sm;
  }
  get active() {
    return this._isActive;
  }
  // §FIX-DOOR-WINDOW-SYMBOL-PARITY-AND-LOD300 (L-266) — `windowType` and
  // `systemTypeId` are NOT tool state any more. They are ACCESSORS onto the single
  // `WindowToolConfigStore`, so the 3D tool, the plan tool, the batch generators and
  // the AI planes cannot hold different answers to "which window did the architect
  // choose?". This mirrors DoorTool (L-260 A) exactly.
  //
  // LOAD-BEARING SIDE-EFFECT: `WindowPlanToolHandler` reads
  // `window.windowTool?.systemTypeId` (a P4 global). Because that global is THIS
  // object, the getter below now routes that read into the ONE config store — so the
  // plan path inherits the architect's real choice instead of falling through to the
  // `initTools` bridge's invented `'wt-single-pane'` fallback. The P4 violation still
  // wants deleting, but it can no longer cause a PARITY divergence.
  get windowType() {
    return getWindowToolConfig().windowType;
  }
  set windowType(v) {
    setWindowToolConfig({ windowType: v });
  }
  /**
   * §OPENING-PROFILE (L-1250) — the void SHAPE the architect has chosen, on the SAME config
   * store as the leaf count so the two axes cannot get separate answers. Orthogonal to
   * `windowType`: `double × round-arch` is an ordinary opening and must stay expressible.
   */
  get openingProfile() {
    return getWindowToolConfig().openingProfile;
  }
  set openingProfile(v) {
    setWindowToolConfig({ openingProfile: v });
  }
  /** Pre-selected to Timber Casement — the standard residential default. */
  get systemTypeId() {
    return getWindowToolConfig().systemTypeId;
  }
  set systemTypeId(v) {
    setWindowToolConfig({ systemTypeId: v });
  }
  async activate() {
    if (this._isActive) return;
    this._isActive = true;
    this._escListener = (e) => {
      if (e.key === "Escape") this.deactivate();
    };
    document.addEventListener("keydown", this._escListener);
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
        const occupancy = this._evaluateOccupancyAt(hit, wallData);
        if (occupancy.ok) this.setHudState("wall-snapping");
        else this.setHudState(occupancy.state, occupancy.message);
      } else {
        this.setHudState("wall-snapping");
      }
      this.updatePreview(hit);
    } else {
      this.setHudState("no-wall-target");
      this.clearPreview();
    }
  };
  /** §M6 — mirror of DoorTool live occupancy preview check. */
  _evaluateOccupancyAt(hit, wallData) {
    try {
      const wallLength = wallCentrelineLength(wallData);
      if (wallLength < 1e-3) return { ok: false, state: "out-of-range" };
      const rawOffset = arcLengthAtPointXZ(wallData, hit.point.x, hit.point.z).s;
      const width = this._dims().width;
      const halfW = width / 2;
      if (rawOffset < halfW || rawOffset > wallLength - halfW) {
        return { ok: false, state: "out-of-range" };
      }
      const occ = wallOccupancyStore.canPlace(wallData, rawOffset, width, void 0, {
        openingProfile: this.openingProfile,
        heightM: this._dims().height,
        // §FEAT-WALL-PROFILE-OPENINGS (OPEN38, L-7400) — the SILL, so the host-outline arm can
        // place the rectangle vertically. A window's sill is authored, never assumed.
        sillHeightM: this._dims().sillHeight
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
      this.placeWindow(hit);
    }
  };
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
    const _d = this._dims();
    const width = _d.width;
    const height = _d.height;
    const thickness = wallData.thickness;
    if (!isFinite(width) || !isFinite(height) || !isFinite(thickness)) {
      console.error("[WindowTool] Invalid preview window dimensions:", { width, height, thickness });
      return;
    }
    const geo = new BoxGeometry(width, height, thickness + this.DEFAULT_THICKNESS_OFFSET);
    const mat = new MeshBasicMaterial({ color: PREVIEW_COLOR.HOSTED, transparent: true, opacity: 0.5 });
    this.previewWindow = new Mesh(geo, mat);
    const wallLength = wallCentrelineLength(wallData);
    let centreS = arcLengthAtPointXZ(wallData, hit.point.x, hit.point.z).s;
    centreS = Math.max(width / 2, Math.min(centreS, wallLength - width / 2));
    const _pf = arcFrameAt(wallData, centreS);
    const previewCenter = new Vector3(_pf.x, 0, _pf.z);
    if (!wallData.levelId) {
      console.warn(`[WindowTool] Wall ${wallId} has no levelId — preview suppressed.`);
      return;
    }
    const level = this.wallStore.getLevelById(wallData.levelId);
    const elevation = level?.elevation;
    if (elevation == null || !isFinite(elevation)) {
      console.warn(`[WindowTool] Level "${wallData.levelId}" missing elevation — preview suppressed.`);
      return;
    }
    this.previewWindow.position.set(
      previewCenter.x,
      elevation + _d.sillHeight + height / 2,
      previewCenter.z
    );
    this.previewWindow.rotation.y = -_pf.angleY;
    this.previewWindow.userData.isPreview = true;
    this.previewWindow.userData.levelId = wallData.levelId;
    this.world.scene.three.add(this.previewWindow);
  }
  findWallRoot(obj) {
    let curr = obj;
    while (curr) {
      if (curr.userData && (curr.userData.elementType === "Wall" || curr.userData.elementType === "wall")) {
        return curr;
      }
      curr = curr.parent;
    }
    return null;
  }
  // PLAN-01: Dispose geometry and material before removing from scene to prevent GPU leak.
  clearPreview() {
    if (this.previewWindow) {
      this.world.scene.three.remove(this.previewWindow);
      this.previewWindow.geometry.dispose();
      this.previewWindow.material.dispose();
      this.previewWindow = null;
    }
  }
  placeWindow(hit) {
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
      console.warn("[WindowTool] Invalid wall baseline length");
      return;
    }
    const centreAlong = arcLengthAtPointXZ(wallData, hit.point.x, hit.point.z).s;
    const { width, height, sillHeight } = this._dims();
    if (!isFinite(width) || !isFinite(height) || !isFinite(sillHeight)) {
      console.error("[WindowTool] Invalid window dimensions", { width, height, sillHeight });
      return;
    }
    let offset = centreAlong - width / 2;
    offset = Math.max(0, Math.min(offset, wallLength - width));
    if (!isFinite(offset)) {
      console.error("[WindowTool] Computed window offset is invalid:", offset);
      return;
    }
    const occupancy = wallOccupancyStore.canPlace(wallData, offset, width, void 0, {
      openingProfile: this.openingProfile,
      heightM: height,
      // §FEAT-WALL-PROFILE-OPENINGS (OPEN38, L-7400) — already destructured from `_dims()` above.
      sillHeightM: sillHeight
    });
    if (!occupancy.valid) {
      this.setHudState("occupancy-blocked", canPlaceRefusalText(occupancy));
      this.clearPreview();
      return;
    }
    const cm = this.commandManager;
    if (cm) {
      const openingData = buildWindowOpening({
        wallThickness: wallData.thickness,
        offset
      });
      cm.execute(new CreateWallOpeningCommand({ wallId, openingData }));
    }
    this.clearPreview();
  }
  /**
   * §M6 — single transition function for the HUD state machine. Mirrors the
   * door tool implementation. Renders the matching message + colour and
   * stores the new state for inspection.
   */
  setHudState(state, customMsg) {
    this._hudState = state;
    const _leaf = this.windowType === "double" ? "Double Window" : "Single Window";
    const label = this.openingProfile === "rectangular" ? _leaf : `${_leaf} (${OPENING_PROFILE_LABELS[this.openingProfile]})`;
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
        msg = customMsg ?? "Windows cannot be placed on curved walls";
        isError = true;
        break;
      case "out-of-range":
        msg = customMsg ?? `${label}: Move closer to the wall centre — opening too close to the wall end`;
        isError = true;
        break;
      case "occupancy-blocked":
        msg = customMsg ?? "Cannot place window here — opening overlaps existing one";
        isError = true;
        break;
      case "transient-error":
        msg = customMsg ?? "Window placement failed";
        isError = true;
        break;
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
      text.id = "window-tool-status-text";
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
    const textEl = this.statusOverlay.querySelector("#window-tool-status-text");
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

const WINDOW_LAYER = "A-GLAZ";
const WINDOW_LAYER_CUT = "A-GLAZ-CUT";
const WINDOW_LAYER_PROJ = "A-GLAZ-PROJ";
const LW_CUT = 2;
const LW_PROJ = 1;
function resolvePlanCutHeight(viewDef) {
  const cut = viewDef?.viewRange?.cut?.offset;
  return typeof cut === "number" && Number.isFinite(cut) ? cut : LevelClipPlaneCache.DEFAULT_CUT_HEIGHT;
}
function planCutSpanOf(outline, yCut) {
  const pts = outline.points;
  const n = pts.length;
  const xs = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    if (a.y > yCut !== b.y > yCut) {
      xs.push(a.x + (yCut - a.y) * (b.x - a.x) / (b.y - a.y));
    }
  }
  if (xs.length < 2) return null;
  let x0 = Infinity, x1 = -Infinity;
  for (const x of xs) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
  }
  return { x0, x1, crossings: xs.length };
}
function outlineBaseRun(outline) {
  const y0 = outline.bbox.y0;
  const EPS = 1e-9;
  const pts = outline.points;
  const n = pts.length;
  let x0 = Infinity, x1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    if (Math.abs(a.y - y0) < EPS && Math.abs(b.y - y0) < EPS && Math.abs(b.x - a.x) > EPS) {
      x0 = Math.min(x0, a.x, b.x);
      x1 = Math.max(x1, a.x, b.x);
    }
  }
  return x1 > x0 ? { x0, x1 } : null;
}
class WindowPlanSymbolBuilder {
  /**
   * Injects window plan symbols for all windows on the active level.
   *
   * Per window:
   *   1. Ask the SHARED resolver which Detail Level this view wants (C09).
   *   2. Resolve the window's REAL dimensions from its record / system type (L-127).
   *   3. Build the symbol in world XZ at that LOD.
   *   4. Register the resulting LineSegments UUIDs for hitTest selection.
   */
  inject(drawing, viewDef) {
    const levelId = viewDef.spatial?.levelId;
    if (!levelId) return;
    const wallStore = storeRegistry.getStoreForType("wall");
    if (!wallStore) {
      console.warn("[WindowPlanSymbolBuilder] wallStore not registered in storeRegistry — skipping window injection");
      return;
    }
    for (const layer of [WINDOW_LAYER, WINDOW_LAYER_CUT, WINDOW_LAYER_PROJ]) {
      if (!drawing.layers.has(layer)) drawing.layers.create(layer);
    }
    let injectedCount = 0;
    const cutHeight = resolvePlanCutHeight(viewDef);
    const wins = typeof wallStore.getAllWindows === "function" ? wallStore.getAllWindows() : windowStore.getAll();
    for (const win of wins) {
      const wallData = wallStore.getById(win.wallId);
      if (!wallData) continue;
      if (wallData.levelId !== levelId) continue;
      if (vgGovernanceStore.getEffectiveStyle("Window", win.id).hidden) continue;
      const lod = resolveEffectiveDetailLevel(win.id, viewDef.id, {
        elementType: "window",
        category: "window"
      });
      const geos = this._computeSymbolGeometry(win, wallData, lod, cutHeight);
      if (!geos) continue;
      if (geos.cut) {
        const cutSeg = new LineSegments(
          geos.cut,
          new LineBasicMaterial({ color: 0, linewidth: LW_CUT })
        );
        cutSeg.userData = { lineWeight: LW_CUT, role: "cut", elementType: "Window" };
        cutSeg.updateWorldMatrix(true, false);
        const projectedCut = projectToDrawingSpace(cutSeg, drawing);
        drawing.addProjectionLines(projectedCut, WINDOW_LAYER_CUT);
        registerSegmentUUID(drawing, projectedCut, win.id);
      }
      if (geos.proj) {
        const projSeg = new LineSegments(
          geos.proj,
          new LineBasicMaterial({ color: 0, linewidth: LW_PROJ })
        );
        projSeg.userData = { lineWeight: LW_PROJ, role: "projection", elementType: "Window" };
        projSeg.updateWorldMatrix(true, false);
        const projectedProj = projectToDrawingSpace(projSeg, drawing);
        drawing.addProjectionLines(projectedProj, WINDOW_LAYER_PROJ);
        registerSegmentUUID(drawing, projectedProj, win.id);
      }
      injectedCount++;
    }
    if (injectedCount > 0) {
      console.log(
        `[WindowPlanSymbolBuilder] Injected ${injectedCount} window symbol(s) into view ${viewDef.id} (level ${levelId})`
      );
    }
  }
  // ── Private ──────────────────────────────────────────────────────────────
  /**
   * Computes the complete window plan symbol in world XZ (y = 0) at the requested
   * Detail Level. `lod` changes ONLY how many lines are emitted — never a
   * dimension (L-127).
   *
   * Local symbol frame: `s` runs ALONG the wall from the opening centre (positive
   * toward `dir`), `n` runs ACROSS the wall along the left-normal. Every point is
   * `centre + s·dir + n·leftNormal`, so the maths below reads as a section.
   *
   *   n = ±halfThk            the two wall faces (where the wall lines terminate)
   *   s = ∓halfWidth          the opening VOID EDGES  (C15 §2: offset, offset+width)
   *   s = ∓clearHalf          the frame's inner face  (= halfWidth − frameThickness)
   *   s = ∓(clearHalf+rebate) the rebate pocket the glazing is captured in
   *   n = ±glazingThickness/2 the two glazing faces
   *
   * Returns null when the wall baseline or thickness is missing/degenerate — a
   * symbol drawn at a guessed wall thickness would be a dimensional lie (L-127),
   * so we draw nothing and say so.
   */
  // §MT-06-ONE-AUTHORITY — the PLAN symbol resolves the same authority the 3D
  // frame does. `wallData` is already in hand here, so the four numbers come
  // off the very wall this symbol is being drawn on (see
  // `openingGeometryFromWall`). Without this the 2D plan would keep the defect
  // §L-916 fixed in 3D: after a host move the void in plan is re-cut from
  // RECORD A while the symbol was still drawn from the frame record's stale
  // offset — the same hole-without-a-frame, one view over.
  _computeSymbolGeometry(winRaw, wallData, lod = "medium", cutHeight = LevelClipPlaneCache.DEFAULT_CUT_HEIGHT) {
    const win = withAuthoritativeGeometry(winRaw, openingGeometryFromWall(wallData, winRaw?.id));
    const bl0 = wallData.baseLine?.[0];
    const bl1 = wallData.baseLine?.[1];
    if (!bl0 || !bl1) return null;
    const wallThickness = Number(wallData.thickness);
    if (!Number.isFinite(wallThickness) || wallThickness <= 0) {
      console.warn(
        `[WindowPlanSymbolBuilder] Wall ${wallData.id ?? "<unknown>"} has no usable thickness — refusing to draw window ${win.id} at a guessed dimension (L-127).`
      );
      return null;
    }
    const halfThk = wallThickness / 2;
    const width = Number(win.width);
    if (!Number.isFinite(width) || width <= 0) return null;
    const section = this._resolveCutSection(win, wallData, width, cutHeight);
    if (section === "refused") return null;
    const halfW = section ? section.width / 2 : width / 2;
    const host = section ? hostedElementFrame(wallData, section.offset, section.width) : hostedElementFrame(wallData, Number(win.offset), width);
    if (!(host.length > 0)) return null;
    const dims = resolveWindowDimensions(win);
    const frameThick = Math.max(0, dims.frameThickness);
    const glazThick = Math.max(0, dims.glazingThickness);
    const halfGlaz = glazThick / 2;
    const clearHalf = halfW - frameThick;
    const framed = clearHalf > 0;
    const rebate = framed ? Math.max(0, Math.min(dims.rebateDepth, frameThick)) : 0;
    const glazHalf0 = framed ? clearHalf + rebate : halfW;
    const _rev = resolveWindowReveal(win, wallThickness);
    const _revOn = _rev.active && !wallData.curve && section === null;
    const nGlaz = _revOn ? _rev.zGlazing : 0;
    const sGlaz = _revOn ? _rev.glazingCentreX : 0;
    const glazHalf = _revOn && _rev.hasSplay ? Math.max(1e-3, glazHalf0 - (_rev.inset.jambLeft + _rev.inset.jambRight) / 2) : glazHalf0;
    const cutPositions = [];
    const projPositions = [];
    const at = (s, n) => {
      const p = host.at(s, n);
      return new Vector3(p.x, 0, p.z);
    };
    const cutSeg = (a, b) => {
      cutPositions.push(a.x, 0, a.z, b.x, 0, b.z);
    };
    const projSeg = (a, b) => {
      projPositions.push(a.x, 0, a.z, b.x, 0, b.z);
    };
    const runSeg = (out, s0, s1, n) => {
      const pts = host.run(s0, s1, n);
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i], b = pts[i + 1];
        out.push(a.x, 0, a.z, b.x, 0, b.z);
      }
    };
    for (const sign of [-1, 1]) {
      cutSeg(at(sign * halfW, -halfThk), at(sign * halfW, +halfThk));
    }
    if (framed) {
      for (const sign of [-1, 1]) {
        for (const n of [-halfThk, +halfThk]) {
          runSeg(cutPositions, sign * halfW, sign * clearHalf, n);
        }
      }
    } else {
      for (const n of [-halfThk, +halfThk]) {
        runSeg(cutPositions, -halfW, +halfW, n);
      }
    }
    if (framed && lod === "medium") {
      for (const sign of [-1, 1]) {
        cutSeg(at(sign * clearHalf, -halfThk), at(sign * clearHalf, +halfThk));
      }
    }
    if (framed && lod === "fine") {
      for (const sign of [-1, 1]) {
        const sFace = sign * clearHalf;
        const sPocket = sign * (clearHalf + rebate);
        cutSeg(at(sFace, -halfThk), at(sFace, -halfGlaz));
        runSeg(cutPositions, sFace, sPocket, -halfGlaz);
        cutSeg(at(sPocket, -halfGlaz), at(sPocket, +halfGlaz));
        runSeg(cutPositions, sPocket, sFace, +halfGlaz);
        cutSeg(at(sFace, +halfGlaz), at(sFace, +halfThk));
      }
    }
    const ratios = dims.columnRatios.length > 0 ? dims.columnRatios : [1];
    const ratioSum = ratios.reduce((s, r) => s + r, 0) || 1;
    const cdt = Math.max(0, dims.columnDividerThickness);
    const mullionHalfDepth = wallThickness * DEFAULT_WINDOW_DIMENSIONS.dividerDepthRatio / 2;
    const innerSpan = 2 * clearHalf;
    const boundaries = [];
    if (framed && innerSpan > 0) {
      let s = -clearHalf;
      for (let c = 0; c < ratios.length - 1; c++) {
        s += (ratios[c] ?? 0) / ratioSum * innerSpan;
        boundaries.push(s);
      }
    }
    const drawMullions = (lod === "medium" || lod === "fine") && cdt > 0;
    if (drawMullions) {
      for (const s of boundaries) {
        const sL = s - cdt / 2;
        const sR = s + cdt / 2;
        runSeg(cutPositions, sL, sR, -mullionHalfDepth);
        runSeg(cutPositions, sL, sR, +mullionHalfDepth);
        cutSeg(at(sL, -mullionHalfDepth), at(sL, +mullionHalfDepth));
        cutSeg(at(sR, -mullionHalfDepth), at(sR, +mullionHalfDepth));
      }
    }
    const glazRuns = [];
    if (drawMullions && boundaries.length > 0) {
      let from = -glazHalf;
      for (const s of boundaries) {
        glazRuns.push([from, s - cdt / 2]);
        from = s + cdt / 2;
      }
      glazRuns.push([from, +glazHalf]);
    } else {
      glazRuns.push([-glazHalf, +glazHalf]);
    }
    for (const [a, b] of glazRuns) {
      if (b - a <= 0) continue;
      if (lod === "coarse" || glazThick <= 0) {
        runSeg(projPositions, a + sGlaz, b + sGlaz, nGlaz);
      } else {
        for (const n of [-halfGlaz, +halfGlaz]) {
          runSeg(projPositions, a + sGlaz, b + sGlaz, n + nGlaz);
        }
      }
    }
    if (_revOn) {
      const nLip = _rev.zOuterFace;
      if (Math.abs(_rev.projection) > 1e-6) {
        runSeg(cutPositions, -halfW, +halfW, nLip);
        for (const sign of [-1, 1]) {
          cutSeg(at(sign * halfW, -halfThk), at(sign * halfW, nLip));
        }
      }
      if (_rev.inset.jambLeft > 1e-6) {
        cutSeg(at(-halfW, nLip), at(-halfW + _rev.inset.jambLeft, nGlaz));
      }
      if (_rev.inset.jambRight > 1e-6) {
        cutSeg(at(+halfW, nLip), at(+halfW - _rev.inset.jambRight, nGlaz));
      }
    }
    if (lod === "fine" && dims.sill && dims.sillDepth > 0 && (section === null || section.sillRun !== null)) {
      const nFace = halfThk;
      const nEdge = halfThk + dims.sillDepth;
      const sEdge = halfW + dims.sillOverhang;
      const s0 = section ? section.sillRun.s0 - dims.sillOverhang : -sEdge;
      const s1 = section ? section.sillRun.s1 + dims.sillOverhang : +sEdge;
      runSeg(projPositions, s0, s1, nEdge);
      projSeg(at(s0, nFace), at(s0, nEdge));
      projSeg(at(s1, nFace), at(s1, nEdge));
    }
    const cutGeo = cutPositions.length > 0 ? new BufferGeometry() : null;
    if (cutGeo) cutGeo.setAttribute("position", new Float32BufferAttribute(cutPositions, 3));
    const projGeo = projPositions.length > 0 ? new BufferGeometry() : null;
    if (projGeo) projGeo.setAttribute("position", new Float32BufferAttribute(projPositions, 3));
    return { cut: cutGeo, proj: projGeo };
  }
  /**
   * §OUTLINE82 — resolve what the plan cut plane crosses for THIS opening.
   *
   * Returns `null` for a rectangular profile (the caller takes its pre-existing path, C86
   * §10.1 PR-2), `'refused'` after saying why through this builder's diagnostics channel (the
   * same `console.warn` the L-127 thickness refusal uses — condition, reason, live alternative,
   * C16 CA-18), or the chord and sill run for a profiled ring.
   *
   * The shape is read from the HOST wall's `openings[]` record first — the void's shape belongs
   * to the void, hence to the host `Opening` (C15 §3.1) — and from the window record only when
   * the host carries none (the dual write of C15 §8.1 means they agree whenever both exist).
   */
  _resolveCutSection(win, wallData, width, cutHeight) {
    const hostOpening = wallData?.openings?.find((o) => o.elementId === win.id);
    const profileRaw = hostOpening?.openingProfile ?? win.openingProfile;
    if (isRectangularProfile(profileRaw)) return null;
    const profile = resolveOpeningProfile(profileRaw);
    const offset = Number(win.offset);
    const height = Number(win.height);
    const sillHeight = Number(win.sillHeight);
    const outline = openingOutline({
      profile,
      offset,
      width,
      height,
      sillHeight,
      customOutline: hostOpening?.customOutline ?? win.customOutline
    });
    if (!outline) {
      console.warn(
        `[WindowPlanSymbolBuilder] window ${win.id}: a ${profile} profile cannot be held by ${width} × ${height} m at sill ${sillHeight} m, so NO symbol is drawn — not a rectangle in its place (C86 §10.1 WO-G-5). Resize the opening, or choose a profile its box can hold.`
      );
      return "refused";
    }
    const baseOffset = Number(wallData?.baseOffset);
    const yCut = cutHeight - (Number.isFinite(baseOffset) ? baseOffset : 0);
    const span = planCutSpanOf(outline, yCut);
    if (!span) {
      console.warn(
        `[WindowPlanSymbolBuilder] window ${win.id}: the plan cut plane (${cutHeight} m above the level, ${yCut} m above the wall base) does not pass through the ${profile} opening, whose ring spans ${outline.bbox.y0}–${outline.bbox.y1} m above the wall base and has no material at that height. The symbol is OMITTED rather than drawn at the bounding box (C16 CA-18). Move the view's cut plane (View Range → cut offset) to pass through the opening.`
      );
      return "refused";
    }
    if (span.crossings > 2) {
      console.warn(
        `[WindowPlanSymbolBuilder] window ${win.id}: the cut plane crosses the ${profile} ring ${span.crossings} times; the symbol is set out on the outer span ${span.x0}–${span.x1} m and the ${span.crossings / 2 - 1} solid run(s) inside it are NOT drawn (declared, not drawn).`
      );
    }
    const centre = span.x0 + (span.x1 - span.x0) / 2;
    const base = outlineBaseRun(outline);
    return {
      offset: span.x0,
      width: span.x1 - span.x0,
      sillRun: base ? { s0: base.x0 - centre, s1: base.x1 - centre } : null
    };
  }
}
const windowPlanSymbolBuilder = new WindowPlanSymbolBuilder();

function deepFreeze(obj) {
  if (obj === null || typeof obj !== "object" || Object.isFrozen(obj)) return obj;
  for (const key of Object.keys(obj)) {
    const v = obj[key];
    if (v && typeof v === "object") deepFreeze(v);
  }
  return Object.freeze(obj);
}
class UpdateWindowParameterCommand {
  constructor(windowId, patch, prev = {}) {
    this.windowId = windowId;
    this.patch = patch;
    this.targetIds = [windowId];
    this.patch = deepFreeze({ ...patch });
    this.prev = deepFreeze({ ...prev });
  }
  windowId;
  patch;
  affectedStores = ["window", "wall"];
  id = crypto.randomUUID();
  type = CommandType.UPDATE_WINDOW_PARAMETER;
  timestamp = Date.now();
  targetIds;
  prev;
  prevCapturedAtExecute = false;
  canExecute(_context) {
    const current = windowStore.getById(this.windowId);
    if (!current) {
      return { ok: false, reason: `Window not found: ${this.windowId}` };
    }
    const merged = { ...current, ...this.patch };
    if ("openingProfile" in this.patch && this.patch.openingProfile !== "custom" && !("customOutline" in this.patch)) {
      delete merged.customOutline;
    }
    const parsed = WindowOpeningSchema.safeParse(merged);
    if (!parsed.success) {
      return { ok: false, reason: `Invalid window patch: ${parsed.error.issues.map((i) => i.message).join("; ")}` };
    }
    return { ok: true };
  }
  execute(context) {
    const current = windowStore.getById(this.windowId);
    if (!current) {
      return { success: false, affectedElementIds: [], info: [`Window not found: ${this.windowId}`] };
    }
    const _profilePatch = this._resolveProfilePatch(context, current);
    if (typeof _profilePatch === "string") {
      return { success: false, affectedElementIds: [], info: [_profilePatch] };
    }
    const _revealRefusal = this._resolveRevealRefusal(context, current, _profilePatch);
    if (_revealRefusal) {
      return { success: false, affectedElementIds: [], info: [_revealRefusal] };
    }
    const patch = this._clampPatchToWall(context, current, _profilePatch);
    if (!this.prevCapturedAtExecute) {
      const captured = {};
      for (const key of Object.keys(patch)) {
        captured[key] = current[key];
      }
      this.prev = deepFreeze(captured);
      this.prevCapturedAtExecute = true;
    }
    windowStore.update(this.windowId, patch);
    this._syncWallStore(context, patch);
    return this._revealAdvisory ? { success: true, affectedElementIds: [this.windowId], info: [this._revealAdvisory] } : { success: true, affectedElementIds: [this.windowId] };
  }
  undo(context) {
    if (!windowStore.has(this.windowId)) {
      return { success: false, affectedElementIds: [], info: [`Window not found for undo: ${this.windowId}`] };
    }
    windowStore.update(this.windowId, this.prev);
    this._syncWallStore(context, this.prev);
    return { success: true, affectedElementIds: [this.windowId] };
  }
  serialize() {
    return {
      type: this.type,
      targetIds: this.targetIds,
      timestamp: this.timestamp,
      payload: { windowId: this.windowId, patch: this.patch, prev: this.prev },
      version: 2
    };
  }
  /**
   * §FEAT-WINDOW-REVEAL — the INADVISABLE note for the edit currently executing, or null.
   * Set by {@link _resolveRevealRefusal}; read once by `execute`.
   */
  _revealAdvisory = null;
  /**
   * ⭐ §FEAT-WINDOW-REVEAL (L-1920 … L-1929) — the C83 IMPOSSIBLE gate for a reveal edit.
   *
   * Returns the refusal, or `null`. A patch touching none of the trigger fields returns
   * `null` immediately, so every pre-existing edit reaches exactly its previous code.
   *
   * ⚠ **THE GATE IS ASKED ABOUT THE MERGED RECORD, NEVER ABOUT THE PATCH.** Splay angles
   * and the opening's own size compose: "set the left jamb to 40°" is fine on a 1.8 m
   * window and degenerate on a 0.4 m one, and a patch carrying only the angle cannot be
   * judged alone. This is the same reason `canExecute` parses `{...current, ...patch}`.
   *
   * ⚠ **AND THAT IS WHY `width` / `height` ARE IN THE TRIGGER SET.** SHRINKING a window
   * can make an already-authored splay degenerate. A gate keyed only on the reveal fields
   * would pass that edit and produce the zero-glass window by the back door — the same
   * class of hole as validating a patch instead of a record.
   *
   * ⚠ **NO HOST WALL ⇒ SKIPPED, NOT FAILED.** The reveal run is half the wall thickness,
   * so with no wall there is no run and no measurable question. Refusing on a missing
   * lookup is the refusal-without-an-escape-hatch shape L-942 records.
   */
  _resolveRevealRefusal(context, current, patch) {
    const REVEAL_TRIGGERS = [
      "revealProjection",
      "revealSplayHead",
      "revealSplaySill",
      "revealSplayJambLeft",
      "revealSplayJambRight",
      "width",
      "height"
    ];
    if (!REVEAL_TRIGGERS.some((k) => k in patch)) return null;
    const merged = { ...current, ...patch };
    if (!isRevealAuthored(merged)) return null;
    const wall = context.stores?.wallStore?.getById?.(current.wallId);
    const thickness = wall?.thickness;
    if (typeof thickness !== "number" || !(thickness > 0)) return null;
    const refusal = windowRevealRefusal(merged, thickness);
    if (refusal) return refusal;
    this._revealAdvisory = windowRevealAdvisory(merged, thickness);
    return null;
  }
  /**
   * §FIX-WINDOW-OOB-OPENING-RESTORE (L-82) — return a copy of `patch` whose
   * dimensional fields are clamped so the frame span stays inside the host wall.
   * A colour-only / type-only edit (no dimensional field) is returned untouched,
   * as is any patch when the host wall cannot be resolved. When clamping DOES
   * fire, every dimensional field the clamp changed relative to the CURRENT
   * record is written back — including fields the caller did not send (e.g. a
   * too-wide width forces the offset inward), so the frame never exceeds the wall.
   */
  _clampPatchToWall(context, current, patch) {
    const dimKeys = ["offset", "width", "height", "sillHeight"];
    if (!dimKeys.some((k) => k in patch)) return patch;
    const wall = context.stores?.wallStore?.getById?.(current.wallId);
    if (!wall) return patch;
    const clamped = wallOccupancyStore.clampToWall(wall, {
      offset: patch.offset ?? current.offset,
      width: patch.width ?? current.width,
      height: patch.height ?? current.height,
      sillHeight: patch.sillHeight ?? current.sillHeight
    });
    if (!clamped.clamped) return patch;
    const out = { ...patch };
    for (const k of dimKeys) {
      if (k in patch || clamped[k] !== current[k]) {
        out[k] = clamped[k];
      }
    }
    return out;
  }
  /**
   * §OPENING-PROFILE (L-1252) — validate a profile change and carry its consequences.
   *
   * Returns the effective patch, or a REFUSAL STRING when the change cannot be made good.
   * A patch that does not touch `openingProfile` OR `customOutline` is returned untouched,
   * so every existing edit keeps its exact previous behaviour.
   *
   * ⚠ §OUTLINE81 (SPEC-WINDOW-CUSTOM-OUTLINE) — WIDENED FROM `'openingProfile' in patch` TO
   * ALSO FIRE ON A `customOutline`-ONLY PATCH, AND `customOutline` IS NOW FORWARDED TO THE
   * GATE. Two real gaps, found while wiring "Apply shape from type" / "Edit outline…"
   * through this exact path:
   *   1. `openingProfileRefusal` was called WITHOUT `customOutline`, so any patch setting
   *      `openingProfile: 'custom'` was refused UNCONDITIONALLY — `openingProfileShapeRefusal`
   *      reads a missing ring as "none were supplied" regardless of what the patch actually
   *      carried. Every custom-profile edit through this command failed before this fix.
   *   2. A `customOutline`-only patch (editing an ALREADY-custom window's ring, never
   *      touching `openingProfile`) used to skip this gate entirely — `canExecute`'s Zod
   *      parse checks the ring's STRUCTURE (an array of finite `{u,v}` pairs) but never its
   *      SEMANTIC validity (simple polygon, tight bbox, area floor), so a self-intersecting
   *      or degenerate ring could be written with no refusal at all. Both patch shapes now
   *      take the identical gate `validateCustomOutline` backs.
   */
  _resolveProfilePatch(context, current) {
    const patch = this.patch;
    if (!("openingProfile" in patch) && !("customOutline" in patch)) return patch;
    const nextProfile = patch.openingProfile ?? current.openingProfile;
    const out = { ...patch };
    if (nextProfile !== "custom" && current.customOutline !== void 0 && !("customOutline" in patch)) {
      out.customOutline = void 0;
    }
    if (nextProfile !== "custom" && out.customOutline !== void 0) {
      return `A custom outline can only be carried by the 'custom' opening profile — this edit sends a ${out.customOutline.vertices?.length ?? 0}-vertex ring while the profile is '${String(nextProfile ?? "rectangular")}'. Set openingProfile to 'custom' in the same edit, or drop the ring.`;
    }
    if (!isRectangularProfile(nextProfile) && nextProfile === "circular") {
      const w = patch.width ?? current.width;
      out.width = w;
      out.height = w;
    }
    const wall = context.stores?.wallStore?.getById?.(current.wallId);
    const reason = openingProfileRefusal({
      profile: nextProfile,
      width: out.width ?? current.width,
      height: out.height ?? current.height,
      sillHeight: out.sillHeight ?? current.sillHeight,
      host: wall ?? null,
      customOutline: out.customOutline ?? current.customOutline
    });
    return reason ?? out;
  }
  _syncWallStore(context, delta) {
    try {
      const ws = context.stores.wallStore;
      if (!ws.getWindow(this.windowId)) return;
      ws.updateWindow(this.windowId, delta);
      const d = delta;
      if (delta && ("openingProfile" in d || "customOutline" in d)) {
        const win = ws.getWindow(this.windowId);
        const wall = win ? ws.getById?.(win.wallId) : null;
        const existing = wall?.openings?.find(
          (o) => o.elementId === this.windowId || o.id === win?.openingId
        );
        if (wall && existing) {
          const next = { ...existing };
          if ("openingProfile" in d) next.openingProfile = d.openingProfile;
          if ("customOutline" in d) next.customOutline = d.customOutline;
          ws.updateOpening(wall.id, next);
        }
      }
    } catch (err) {
      console.warn(
        `[UpdateWindowParameterCommand] wall-store mirror write FAILED for ${this.windowId} — wall geometry now disagrees with the window store.`,
        err
      );
    }
  }
}

class LevelClipPlaneCache {
  /** Cut height above level elevation (metres). Matches Revit's default 1200mm cut plane. */
  static DEFAULT_CUT_HEIGHT = 1.2;
  _renderer = null;
  /** Maps levelId → pre-computed THREE.Plane for that level's cut plane. */
  _planes = /* @__PURE__ */ new Map();
  /** The currently active level's plane, or null when no clip is active. */
  _activePlane = null;
  /** Whether the "prewarm" render has fired to force the clipping shader variant compile. */
  _prewarmed = false;
  // ── Renderer injection ────────────────────────────────────────────────────
  /**
   * Inject the THREE.WebGLRenderer. Must be called before activate().
   * Typically called once from initScene after the renderer is created.
   */
  setRenderer(renderer) {
    this._renderer = renderer;
    renderer.localClippingEnabled = false;
  }
  // ── Level registration ────────────────────────────────────────────────────
  /**
   * Pre-compute and cache the clip plane for a level.
   * Call for every level at project load time, before the user opens any plan view.
   *
   * @param levelId    Unique identifier for the level (matches BimManager level.id).
   * @param elevation  Level elevation in world-space metres (from BimManager level.elevation).
   * @param cutHeight  Horizontal cut height above elevation. Defaults to 1.2m (standard cut).
   */
  registerLevel(levelId, elevation, cutHeight = LevelClipPlaneCache.DEFAULT_CUT_HEIGHT) {
    const plane = new Plane(
      new Vector3(0, -1, 0),
      elevation + cutHeight
    );
    this._planes.set(levelId, plane);
  }
  /**
   * Update the clip plane for a level if its elevation changes (e.g., user edits a level).
   * Safe to call at any time — updates the plane's constant in place.
   */
  updateLevel(levelId, elevation, cutHeight = LevelClipPlaneCache.DEFAULT_CUT_HEIGHT) {
    const existing = this._planes.get(levelId);
    if (existing) {
      existing.constant = elevation + cutHeight;
    } else {
      this.registerLevel(levelId, elevation, cutHeight);
    }
  }
  /**
   * Remove a level's clip plane (e.g., when a level is deleted).
   */
  removeLevel(levelId) {
    if (this._activePlane === this._planes.get(levelId)) {
      this.deactivate();
    }
    this._planes.delete(levelId);
  }
  // ── Activation / deactivation ─────────────────────────────────────────────
  /**
   * Activate the clip plane for a specific level.
   *
   * This replaces the entire OBC Clipper + localClippingEnabled approach.
   * Cost: one Map lookup + one array assignment = <0.1ms.
   *
   * If the level has no pre-registered plane, falls back to computing one
   * on demand (still avoids OBC Clipper overhead).
   *
   * @param levelId    The level whose cut plane to activate.
   * @param fallbackElevation  Used only if levelId is not in the cache.
   */
  activate(levelId, fallbackElevation = 0) {
    if (!this._renderer) {
      console.warn("[LevelClipPlaneCache] activate() called before setRenderer(). Clip plane not applied.");
      return;
    }
    let plane = this._planes.get(levelId);
    if (!plane) {
      console.warn(`[LevelClipPlaneCache] Level "${levelId}" not pre-registered. Computing on demand.`);
      this.registerLevel(levelId, fallbackElevation);
      plane = this._planes.get(levelId);
    }
    const _t0 = performance.now();
    this._activePlane = plane;
    this._renderer.clippingPlanes = [plane];
    const elapsed = (performance.now() - _t0).toFixed(3);
    console.log(
      `[LevelClipPlaneCache] activate("${levelId}") — renderer.clippingPlanes = [plane(y≤${plane.constant.toFixed(2)}m)] — ${elapsed}ms (pointer swap, no GPU stall; prewarmed=${this._prewarmed})`
    );
  }
  /**
   * Deactivate all clipping — restores full scene visibility.
   * Replaces `clipper.deleteAll()` + `localClippingEnabled = false`.
   * Cost: one array assignment = <0.01ms.
   */
  deactivate() {
    if (!this._renderer) return;
    const wasActive = this.activeLevelId;
    const _t0 = performance.now();
    this._renderer.clippingPlanes = [];
    this._activePlane = null;
    const elapsed = (performance.now() - _t0).toFixed(3);
    if (wasActive) {
      console.log(
        `[LevelClipPlaneCache] deactivate() — renderer.clippingPlanes = [] — ${elapsed}ms (was level="${wasActive}"; pointer swap, no GPU stall)`
      );
    }
  }
  /**
   * Whether a clip plane is currently active.
   */
  get isActive() {
    return this._activePlane !== null;
  }
  /**
   * The currently active levelId, or null if no clip is active.
   * Useful for diagnostics.
   */
  get activeLevelId() {
    if (!this._activePlane) return null;
    for (const [id, plane] of this._planes) {
      if (plane === this._activePlane) return id;
    }
    return null;
  }
  // ── Prewarm ───────────────────────────────────────────────────────────────
  /**
   * Force the clipping shader variant to compile NOW — before the user
   * opens any plan view. Call during idle time after project load.
   *
   * How it works:
   * THREE.js compiles the clipping shader variant lazily on the first frame
   * where `renderer.clippingPlanes.length > 0`. By activating a plane briefly
   * and requesting a render, we pay the compilation cost during idle time
   * instead of on the user's first plan-view switch.
   *
   * The prewarm is a no-op if already done or if no renderer is set.
   */
  prewarm(scene, camera) {
    if (this._prewarmed || !this._renderer || this._planes.size === 0) return;
    const [firstPlane] = this._planes.values();
    this._renderer.clippingPlanes = [firstPlane];
    this._renderer.render(scene, camera);
    this._renderer.clippingPlanes = [];
    this._prewarmed = true;
    console.log("[LevelClipPlaneCache] Clipping shader variant prewarmed — plan view switches are now instant.");
  }
  // ── Utilities ─────────────────────────────────────────────────────────────
  /**
   * Return the registered level count (useful for diagnostics).
   */
  get levelCount() {
    return this._planes.size;
  }
  /**
   * Clear all registered planes and deactivate.
   * Call on project close / project switch.
   */
  clear() {
    this.deactivate();
    this._planes.clear();
    this._prewarmed = false;
  }
}

export { DEFAULT_WINDOW_DIMENSIONS, DEFAULT_WINDOW_TOOL_CONFIG, MAX_REVEAL_SPLAY_DEG, REVEAL_SIDES, REVEAL_SIDE_LABEL, REVEAL_SPLAY_FIELD, WindowDependencyTracker, WindowLevelCleanupHandler, WindowOpeningSchema, WindowPlanSymbolBuilder, WindowTool, buildWindowOpening, buildWindowSection, buildWindowStoreRecord, getWindowToolConfig, isRevealAuthored, isWindowUntyped, planWindowTypeBackfill, resolveDefaultWindowSystemTypeId, resolveWindowDimensions, resolveWindowReveal, setWindowOutlineEditorOpener, setWindowSectionCommandManager, setWindowToolConfig, windowPlanSymbolBuilder, windowRevealAdvisory, windowRevealRefusal, windowStore, windowSystemTypeStore };
