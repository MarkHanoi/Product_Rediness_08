import { t as trace } from './trace-api-BIfvUk_c.js';
import { ch as DEFAULT_OPENING_PROFILE, bV as resolveDoorDimensions, aS as doorSystemTypeStore } from './ElementStore-CQe7ZDFd.js';
import './SteelProfileLibrary-NgbfwhrM.js';
import './LODManager-DHqndFcX.js';

const DEFAULT_DOOR_TOOL_CONFIG = Object.freeze({
  doorType: "single",
  systemTypeId: "dt-solid-timber",
  // Rectangular — what every door drawn before L-1251 is. Default and "absent" coincide, which
  // is what makes the axis additive rather than a migration.
  openingProfile: DEFAULT_OPENING_PROFILE
});
let _current = DEFAULT_DOOR_TOOL_CONFIG;
function getDoorToolConfig() {
  return _current;
}
function setDoorToolConfig(patch) {
  const next = {
    doorType: patch.doorType ?? _current.doorType,
    systemTypeId: patch.systemTypeId && patch.systemTypeId.length > 0 ? patch.systemTypeId : _current.systemTypeId,
    // The two axes patch INDEPENDENTLY — switching leaf count must not reset the shape.
    // `double × round-arch` is an ordinary door and has to stay expressible (C86 §9 WO-Voc-4).
    openingProfile: patch.openingProfile ?? _current.openingProfile
  };
  _current = next;
  return _current;
}
function resetDoorToolConfig() {
  _current = DEFAULT_DOOR_TOOL_CONFIG;
}

let _cachedTracer$1 = null;
function _tracer$1() {
  _cachedTracer$1 ??= trace.getTracer("@pryzm/geometry-door", "0.1.0");
  return _cachedTracer$1;
}
const FALLBACK_WALL_THICKNESS = 0.2;
function buildDoorOpening(input) {
  return _tracer$1().startActiveSpan("pryzm.door.buildOpening", (span) => {
    try {
      const stored = getDoorToolConfig();
      const doorType = input.config?.doorType ?? stored.doorType;
      const systemTypeId = input.config?.systemTypeId && input.config.systemTypeId.length > 0 ? input.config.systemTypeId : stored.systemTypeId;
      const dims = resolveDoorDimensions(systemTypeId, doorType);
      const wallThickness = Number.isFinite(input.wallThickness) && input.wallThickness > 0 ? input.wallThickness : FALLBACK_WALL_THICKNESS;
      const opening = {
        id: input.id ?? crypto.randomUUID(),
        elementId: input.elementId ?? crypto.randomUUID(),
        type: "door",
        doorType,
        systemTypeId,
        offset: input.offset,
        width: dims.width,
        height: dims.height,
        sillHeight: 0,
        // ⛔ NO SQUARING ARM HERE, and its absence is deliberate. The window chokepoint
        // squares the box for a CIRCULAR profile; a door cannot be circular at all
        // (`openingProfilesFor('door')`), because `sillHeight` is 0 and a floor-reaching
        // opening has no jambs for a circle to spring from. Adding a squaring arm "for
        // symmetry" would make an unreachable state look supported.
        openingProfile: input.config?.openingProfile ?? stored.openingProfile,
        frameThickness: dims.frameThickness,
        frameDepth: wallThickness,
        leafThickness: dims.leafThickness,
        hingesSide: input.hingesSide ?? "left",
        swingDirection: input.swingDirection ?? "inward"
      };
      span.setAttribute("pryzm.door.systemTypeId", systemTypeId);
      span.setAttribute("pryzm.door.doorType", doorType);
      span.setAttribute("pryzm.door.width", opening.width);
      span.end();
      return opening;
    } catch (err) {
      span.recordException(err);
      span.end();
      throw err;
    }
  });
}
function buildDoorStoreRecord(input) {
  return _tracer$1().startActiveSpan("pryzm.door.buildStoreRecord", (span) => {
    try {
      const o = input.opening;
      const elementId = String(o.elementId ?? "");
      const openingId = String(o.id ?? "");
      const doorType = o.doorType === "double" ? "double" : "single";
      const systemTypeId = typeof o.systemTypeId === "string" && o.systemTypeId.length > 0 ? o.systemTypeId : getDoorToolConfig().systemTypeId;
      const sysType = doorSystemTypeStore.getById(systemTypeId);
      if (!sysType) {
        console.warn(
          `[DoorOpeningFactory] door systemTypeId "${systemTypeId}" did not resolve to a built-in door type — door created WITHOUT frame/leaf finish (blank schedule).`
        );
      }
      const dims = resolveDoorDimensions(systemTypeId, doorType);
      const num = (v, fallback) => typeof v === "number" && Number.isFinite(v) ? v : fallback;
      const record = {
        id: elementId,
        openingId,
        wallId: input.wallId,
        offset: num(o.offset, 0),
        width: num(o.width, dims.width),
        height: num(o.height, dims.height),
        sillHeight: num(o.sillHeight, 0),
        frameThickness: num(o.frameThickness, dims.frameThickness),
        frameDepth: num(o.frameDepth, dims.frameDepth),
        leafThickness: num(o.leafThickness, dims.leafThickness),
        doorType,
        // §OPENING-PROFILE — THE STORE RECORD CARRIES THE SHAPE. `DoorPlanSymbolBuilder`
        // draws from the store record, so a profile that stopped at the wall opening
        // would give an arched void in 3-D and a square-headed symbol in plan.
        // The record's OWN value wins, mirroring `systemTypeId` above: a replayed or
        // legacy opening that predates the field is rectangular, which is what it was.
        openingProfile: typeof o.openingProfile === "string" && o.openingProfile.length > 0 ? o.openingProfile : getDoorToolConfig().openingProfile,
        hingesSide: o.hingesSide === "right" ? "right" : "left",
        swingDirection: o.swingDirection === "outward" ? "outward" : "inward",
        systemTypeId
      };
      const mark = input.mark && String(input.mark).trim() ? String(input.mark) : input.resolveMark?.();
      if (mark) record.mark = mark;
      if (sysType) {
        record.frameFinish = { ...sysType.frameFinish };
        record.leafFinish = { ...sysType.leafFinish };
        record.frameColor = sysType.frameFinish.materialColor;
        record.leafColor = sysType.leafFinish.materialColor;
        record.finishMaterial = sysType.leafFinish.name;
      }
      span.setAttribute("pryzm.door.systemTypeId", systemTypeId);
      span.setAttribute("pryzm.door.doorType", doorType);
      span.setAttribute("pryzm.door.resolvedType", sysType !== void 0);
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
  _cachedTracer ??= trace.getTracer("@pryzm/geometry-door", "0.1.0");
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
  "doorType",
  "hingesSide",
  "swingDirection",
  "mark"
]);
function planDoorTypeChange(door, targetTypeId) {
  return _tracer().startActiveSpan("pryzm.door.planTypeChange", (span) => {
    try {
      span.setAttribute("pryzm.door.id", door.id);
      span.setAttribute("pryzm.door.targetTypeId", targetTypeId);
      const target = targetTypeId ? doorSystemTypeStore.getById(targetTypeId) : void 0;
      if (!target) {
        const reason = `[DoorTypeChange] door type "${targetTypeId}" is not in doorSystemTypeStore — refusing to retype door ${door.id}. Nothing changed.`;
        span.setAttribute("pryzm.door.typeChange.blocked", true);
        span.end();
        return {
          id: door.id,
          wallId: door.wallId,
          from: door.systemTypeId,
          to: targetTypeId,
          patch: {},
          blockedReason: reason
        };
      }
      const canonical = buildDoorStoreRecord({
        opening: {
          id: door.openingId,
          // the chokepoint's `opening.id` IS the openingId
          elementId: door.id,
          // … and `opening.elementId` IS the door id
          systemTypeId: targetTypeId,
          offset: door.offset,
          width: door.width,
          height: door.height,
          sillHeight: door.sillHeight,
          doorType: door.doorType,
          hingesSide: door.hingesSide,
          swingDirection: door.swingDirection
        },
        wallId: door.wallId,
        mark: door.mark
      });
      const patch = {};
      for (const [k, v] of Object.entries(canonical)) {
        if (PRESERVED_ON_TYPE_CHANGE.has(k)) continue;
        if (v === void 0) continue;
        patch[k] = v;
      }
      span.setAttribute("pryzm.door.typeChange.patchKeys", Object.keys(patch).length);
      span.end();
      return {
        id: door.id,
        wallId: door.wallId,
        from: door.systemTypeId,
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

export { DEFAULT_DOOR_TOOL_CONFIG as D, PRESERVED_ON_TYPE_CHANGE as P, buildDoorOpening as a, buildDoorStoreRecord as b, getDoorToolConfig as g, planDoorTypeChange as p, resetDoorToolConfig as r, setDoorToolConfig as s };
