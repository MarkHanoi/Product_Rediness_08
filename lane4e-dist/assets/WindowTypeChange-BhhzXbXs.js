import { t as trace } from './trace-api-BIfvUk_c.js';
import { ch as DEFAULT_OPENING_PROFILE, ct as resolveWindowDimensions, cs as resolveCustomOutlineInput, b7 as windowSystemTypeStore, cv as isRectangularProfile } from './ElementStore-CQe7ZDFd.js';
import './SteelProfileLibrary-NgbfwhrM.js';
import './LODManager-DHqndFcX.js';

let _cachedTracer$2 = null;
function _tracer$2() {
  _cachedTracer$2 ??= trace.getTracer("@pryzm/geometry-window", "0.1.0");
  return _cachedTracer$2;
}
const DEFAULT_WINDOW_TOOL_CONFIG = Object.freeze({
  windowType: "single",
  systemTypeId: "wt-timber-casement",
  // §OPENING-PROFILE — rectangular, because that is what every window drawn before L-1250 is.
  // The default and "absent" coincide deliberately (C86 §10.1), which is what makes the whole
  // axis additive: nothing existing changes shape when this ships.
  openingProfile: DEFAULT_OPENING_PROFILE
});
let _current = DEFAULT_WINDOW_TOOL_CONFIG;
function getWindowToolConfig() {
  return _current;
}
function setWindowToolConfig(patch) {
  return _tracer$2().startActiveSpan("pryzm.window.setToolConfig", (span) => {
    try {
      _current = Object.freeze({
        windowType: patch.windowType ?? _current.windowType,
        systemTypeId: patch.systemTypeId && patch.systemTypeId.length > 0 ? patch.systemTypeId : _current.systemTypeId,
        // The two axes patch INDEPENDENTLY — switching leaf count must not reset the
        // profile, and vice versa. That independence is the whole point of not
        // flattening them, and it has to hold in the store as well as in the bar.
        openingProfile: patch.openingProfile ?? _current.openingProfile
      });
      span.setAttribute("pryzm.window.windowType", _current.windowType);
      span.setAttribute("pryzm.window.systemTypeId", _current.systemTypeId);
      span.setAttribute("pryzm.window.openingProfile", _current.openingProfile);
      span.end();
      return _current;
    } catch (err) {
      span.recordException(err);
      span.end();
      throw err;
    }
  });
}
function resetWindowToolConfig() {
  _current = DEFAULT_WINDOW_TOOL_CONFIG;
  return _current;
}

let _cachedTracer$1 = null;
function _tracer$1() {
  _cachedTracer$1 ??= trace.getTracer("@pryzm/geometry-window", "0.1.0");
  return _cachedTracer$1;
}
const FALLBACK_WALL_THICKNESS = 0.2;
function buildWindowOpening(input) {
  return _tracer$1().startActiveSpan("pryzm.window.buildOpening", (span) => {
    try {
      const stored = getWindowToolConfig();
      const windowType = input.config?.windowType ?? stored.windowType;
      const systemTypeId = input.config?.systemTypeId && input.config.systemTypeId.length > 0 ? input.config.systemTypeId : stored.systemTypeId;
      const dims = resolveWindowDimensions({ systemTypeId, windowType });
      let openingProfile = input.config?.openingProfile ?? stored.openingProfile;
      const typeRing = resolveCustomOutlineInput(
        windowSystemTypeStore.getById(systemTypeId)?.customOutline
      );
      let customOutline;
      if (typeRing) {
        openingProfile = "custom";
        customOutline = structuredClone(typeRing);
      }
      const isCircle = openingProfile === "circular";
      const resolvedWidth = dims.width;
      const resolvedHeight = isCircle ? dims.width : dims.height;
      const wallThickness = Number.isFinite(input.wallThickness) && input.wallThickness > 0 ? input.wallThickness : FALLBACK_WALL_THICKNESS;
      const opening = {
        id: input.id ?? crypto.randomUUID(),
        elementId: input.elementId ?? crypto.randomUUID(),
        type: "window",
        windowType,
        systemTypeId,
        offset: input.offset,
        width: resolvedWidth,
        height: resolvedHeight,
        sillHeight: dims.sillHeight,
        openingProfile,
        // §OUTLINE81 (D6) — the ring rides WITH its kind; absent for every other kind.
        ...customOutline ? { customOutline } : {},
        frameThickness: dims.frameThickness,
        frameDepth: wallThickness,
        glazingThickness: dims.glazingThickness,
        rebateDepth: dims.rebateDepth,
        sashThickness: dims.sashThickness,
        sashDepth: dims.sashDepth,
        // §FEAT-WINDOW-CUT-ZONE-AND-LOD (L-278) — PERSIST THE PANE GRID AND ITS
        // DIVIDERS. `columnRatios` is what says whether a mullion exists at all;
        // `columnDividerThickness` how wide it is (already widened to the 60 mm
        // meeting-stile minimum for a `double` by the resolver, so the 3D window and
        // the plan symbol cannot land on different mullions).
        columnDividerThickness: dims.columnDividerThickness,
        rowDividerThickness: dims.rowDividerThickness,
        columnRatios: [...dims.columnRatios]
      };
      span.setAttribute("pryzm.window.systemTypeId", systemTypeId);
      span.setAttribute("pryzm.window.windowType", windowType);
      span.setAttribute("pryzm.window.width", opening.width);
      span.setAttribute("pryzm.window.openingProfile", openingProfile);
      span.setAttribute("pryzm.window.profileSquared", isCircle && !isRectangularProfile(openingProfile));
      span.end();
      return opening;
    } catch (err) {
      span.recordException(err);
      span.end();
      throw err;
    }
  });
}
function buildWindowStoreRecord(input) {
  return _tracer$1().startActiveSpan("pryzm.window.buildStoreRecord", (span) => {
    try {
      const o = input.opening;
      const elementId = String(o.elementId ?? "");
      const openingId = String(o.id ?? "");
      const windowType = o.windowType === "double" ? "double" : "single";
      const systemTypeId = typeof o.systemTypeId === "string" && o.systemTypeId.length > 0 ? o.systemTypeId : getWindowToolConfig().systemTypeId;
      const sysType = windowSystemTypeStore.getById(systemTypeId);
      if (!sysType) {
        console.warn(
          `[WindowOpeningFactory] window systemTypeId "${systemTypeId}" did not resolve to a built-in window type — window created WITHOUT frame finish (blank schedule).`
        );
      }
      const dims = resolveWindowDimensions({
        systemTypeId,
        windowType,
        width: typeof o.width === "number" ? o.width : void 0,
        height: typeof o.height === "number" ? o.height : void 0,
        sillHeight: typeof o.sillHeight === "number" ? o.sillHeight : void 0,
        frameThickness: typeof o.frameThickness === "number" ? o.frameThickness : void 0,
        frameDepth: typeof o.frameDepth === "number" ? o.frameDepth : void 0,
        glazingThickness: typeof o.glazingThickness === "number" ? o.glazingThickness : void 0,
        rebateDepth: typeof o.rebateDepth === "number" ? o.rebateDepth : void 0,
        sashThickness: typeof o.sashThickness === "number" ? o.sashThickness : void 0,
        sashDepth: typeof o.sashDepth === "number" ? o.sashDepth : void 0,
        // §FEAT-WINDOW-CUT-ZONE-AND-LOD (L-278) — the mullion's real fields. `o` is a
        // persisted/replayed opening, so its own grid WINS (a user may have set a
        // 3-pane window); otherwise the resolver falls to the type, then the default.
        columnDividerThickness: typeof o.columnDividerThickness === "number" ? o.columnDividerThickness : void 0,
        rowDividerThickness: typeof o.rowDividerThickness === "number" ? o.rowDividerThickness : void 0,
        columnRatios: Array.isArray(o.columnRatios) ? o.columnRatios : void 0
      });
      const record = {
        id: elementId,
        openingId,
        wallId: input.wallId,
        offset: typeof o.offset === "number" && Number.isFinite(o.offset) ? o.offset : 0,
        width: dims.width,
        height: dims.height,
        sillHeight: dims.sillHeight,
        windowType,
        systemTypeId,
        // §OPENING-PROFILE (L-1250) — THE STORE RECORD MUST CARRY THE SHAPE, and this is
        // the chokepoint's load-bearing half: `WindowPlanSymbolBuilder` draws from the
        // STORE RECORD, not from the opening (see this file's header). A profile that
        // reached `wall.openings[]` and stopped there would give a circular hole in 3-D
        // and a rectangular symbol in plan — the same one-object-two-answers defect
        // §L-266 was raised for.
        //
        // The opening's OWN value wins, falling back to the tool config, mirroring how
        // `systemTypeId` is resolved above: a replayed or legacy opening that predates
        // the field is rectangular, which is what it always was.
        ...(() => {
          const profile = typeof o.openingProfile === "string" && o.openingProfile.length > 0 ? o.openingProfile : getWindowToolConfig().openingProfile;
          if (profile !== "custom") return { openingProfile: profile };
          const ring = resolveCustomOutlineInput(o.customOutline) ?? resolveCustomOutlineInput(
            sysType?.customOutline
          );
          if (!ring) {
            console.warn(
              `[WindowOpeningFactory] window ${elementId} claims openingProfile 'custom' but carries no recoverable ring (and its type "${systemTypeId}" has no template) — degrading to 'rectangular' so the record loads. The shape is LOST; re-apply it from the type.`
            );
            return { openingProfile: "rectangular" };
          }
          return { openingProfile: "custom", customOutline: structuredClone(ring) };
        })(),
        // §L-266 — PERSIST THE PROFILE. Before this, `buildWindowOpening` resolved
        // the frame/sash/mullion sections and BOTH store writers threw them away,
        // so the symbol had to re-derive them and could not honour a per-instance
        // override. The record now carries the members the LOD-300 symbol draws.
        frameThickness: dims.frameThickness,
        frameDepth: dims.frameDepth,
        glazingThickness: dims.glazingThickness,
        rebateDepth: dims.rebateDepth,
        sashThickness: dims.sashThickness,
        sashDepth: dims.sashDepth,
        // §FEAT-WINDOW-CUT-ZONE-AND-LOD (L-278) — THE MULLION REACHES THE SYMBOL.
        //
        // `WindowPlanSymbolBuilder` draws from the STORE RECORD. Resolving the pane
        // grid perfectly and then not writing it here would be the L-05 disease
        // (geometry computed and thrown away) — the symbol would fall back to the
        // schema default `[1]` and a DOUBLE window would draw with NO meeting stile
        // while the 3D window grew one. Write it where the symbol reads it.
        columnDividerThickness: dims.columnDividerThickness,
        rowDividerThickness: dims.rowDividerThickness,
        columnRatios: [...dims.columnRatios]
      };
      const mark = input.mark && String(input.mark).trim() ? String(input.mark) : input.resolveMark?.();
      if (mark) record.mark = mark;
      if (sysType) {
        record.frameFinish = { ...sysType.frameFinish };
        record.sillFinish = { ...sysType.sillFinish };
        record.frameColor = sysType.frameFinish.materialColor;
        record.glassOpacity = sysType.glazingOpacity;
        record.finishMaterial = sysType.frameFinish.name;
        if (sysType.defaultRowRatios?.length) {
          record.rowRatios = [...sysType.defaultRowRatios];
        }
      }
      span.setAttribute("pryzm.window.systemTypeId", systemTypeId);
      span.setAttribute("pryzm.window.windowType", windowType);
      span.setAttribute("pryzm.window.resolvedType", sysType !== void 0);
      span.end();
      return record;
    } catch (err) {
      span.recordException(err);
      span.end();
      throw err;
    }
  });
}

let _cachedTracer = null;
function _tracer() {
  _cachedTracer ??= trace.getTracer("@pryzm/geometry-window", "0.1.0");
  return _cachedTracer;
}
const PRESERVED_ON_TYPE_CHANGE = /* @__PURE__ */ new Set([
  "id",
  "openingId",
  "wallId",
  "offset",
  "width",
  "height",
  "sillHeight",
  "windowType",
  "mark",
  // §OUTLINE81 (SPEC-WINDOW-CUSTOM-OUTLINE D6, L-10948) — THE SHAPE AXIS SURVIVES A TYPE
  // CHANGE, both halves of it. Before this pair was added, `buildWindowStoreRecord`'s
  // fallback (`o.openingProfile ?? getWindowToolConfig().openingProfile`) leaked the TOOL
  // CONFIG's profile into the type-change patch — retyping a circular window while the mode
  // bar sat on Rectangular silently squared it, which is exactly the "type change reshapes"
  // defect L-10948 rules out. The ring rides with its kind for the same reason: a preserved
  // `'custom'` whose carrier was overwritten would fail the schema's "carrier iff custom"
  // refine inside `WindowStore.update`, which throws. "Apply shape from type" (an explicit,
  // undoable command) is the ONE route that copies the type's template onto an instance.
  "openingProfile",
  "customOutline"
]);
function planWindowTypeChange(win, targetTypeId) {
  return _tracer().startActiveSpan("pryzm.window.planTypeChange", (span) => {
    try {
      span.setAttribute("pryzm.window.id", win.id);
      span.setAttribute("pryzm.window.targetTypeId", targetTypeId);
      const target = targetTypeId ? windowSystemTypeStore.getById(targetTypeId) : void 0;
      if (!target) {
        const reason = `[WindowTypeChange] window type "${targetTypeId}" is not in windowSystemTypeStore — refusing to retype window ${win.id}. Nothing changed.`;
        span.setAttribute("pryzm.window.typeChange.blocked", true);
        span.end();
        return {
          id: win.id,
          wallId: win.wallId,
          from: win.systemTypeId,
          to: targetTypeId,
          patch: {},
          blockedReason: reason
        };
      }
      const canonical = buildWindowStoreRecord({
        opening: {
          id: win.openingId,
          elementId: win.id,
          systemTypeId: targetTypeId,
          offset: win.offset,
          width: win.width,
          height: win.height,
          sillHeight: win.sillHeight,
          windowType: win.windowType
          // frame/sash sections and the pane grid are DELIBERATELY omitted so
          // the chokepoint re-resolves them from the target type.
        },
        wallId: win.wallId,
        mark: win.mark
      });
      const patch = {};
      for (const [k, v] of Object.entries(canonical)) {
        if (PRESERVED_ON_TYPE_CHANGE.has(k)) continue;
        if (v === void 0) continue;
        patch[k] = v;
      }
      span.setAttribute("pryzm.window.typeChange.patchKeys", Object.keys(patch).length);
      span.end();
      return {
        id: win.id,
        wallId: win.wallId,
        from: win.systemTypeId,
        to: targetTypeId,
        patch,
        blockedReason: null
      };
    } catch (err) {
      span.recordException(err);
      span.end();
      throw err;
    }
  });
}

export { DEFAULT_WINDOW_TOOL_CONFIG as D, PRESERVED_ON_TYPE_CHANGE as P, buildWindowOpening as a, buildWindowStoreRecord as b, getWindowToolConfig as g, planWindowTypeChange as p, resetWindowToolConfig as r, setWindowToolConfig as s };
