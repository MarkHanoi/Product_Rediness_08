import { S as SpanStatusCode, t as trace } from './trace-api-BIfvUk_c.js';

const PRYZM_IFC_INSPECTOR_TRACER = "pryzm.ifc.inspector";
function getTracer() {
  return trace.getTracer(PRYZM_IFC_INSPECTOR_TRACER);
}
function emitPsetUpdateSpan(args) {
  const span = getTracer().startSpan("pryzm.ifc.pset-update");
  span.setAttribute("pryzm.ifc.element_id", args.elementId);
  span.setAttribute("pryzm.ifc.pset_name", args.psetName);
  span.setAttribute("pryzm.ifc.property_name", args.propertyName);
  span.setAttribute("pryzm.ifc.value_type", args.valueType);
  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
}

const VALID_VALUE_KINDS = /* @__PURE__ */ new Set(["string", "number", "boolean"]);
function parsePsetUpdateCommand(input) {
  if (input == null || typeof input !== "object") {
    throw new Error("PsetUpdateCommand: expected object");
  }
  const obj = input;
  if (obj.kind !== "element.updatePset") {
    throw new Error(`PsetUpdateCommand: kind must be element.updatePset, got ${String(obj.kind)}`);
  }
  if (typeof obj.elementId !== "string" || obj.elementId.length === 0) {
    throw new Error("PsetUpdateCommand: elementId must be non-empty string");
  }
  if (typeof obj.psetName !== "string" || obj.psetName.length === 0) {
    throw new Error("PsetUpdateCommand: psetName must be non-empty string");
  }
  if (typeof obj.propertyName !== "string" || obj.propertyName.length === 0) {
    throw new Error("PsetUpdateCommand: propertyName must be non-empty string");
  }
  if (obj.value !== null && !VALID_VALUE_KINDS.has(typeof obj.value)) {
    throw new Error(`PsetUpdateCommand: value must be scalar (string|number|boolean|null), got ${typeof obj.value}`);
  }
  return {
    kind: "element.updatePset",
    elementId: obj.elementId,
    psetName: obj.psetName,
    propertyName: obj.propertyName,
    value: obj.value
  };
}
function applyPsetUpdate(meta, cmd) {
  if (cmd.elementId !== meta.pryzmElementId) {
    throw new Error(`applyPsetUpdate: elementId ${cmd.elementId} !== meta.pryzmElementId ${meta.pryzmElementId}`);
  }
  const psets = { ...meta.psets };
  const pset = { ...psets[cmd.psetName] ?? {} };
  pset[cmd.propertyName] = cmd.value;
  psets[cmd.psetName] = pset;
  return { ...meta, psets };
}
function valueKind(v) {
  if (v === null) return "null";
  return typeof v;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function escapeAttr(s) {
  return escapeHtml(s);
}
function inputForValue(elementId, psetName, propName, propValue) {
  const eId = escapeAttr(elementId);
  const ps = escapeAttr(psetName);
  const pn = escapeAttr(propName);
  if (typeof propValue === "boolean") {
    return `<input type="checkbox" ${propValue ? "checked" : ""} data-element="${eId}" data-pset="${ps}" data-prop="${pn}">`;
  }
  if (typeof propValue === "number") {
    return `<input type="number" value="${escapeAttr(propValue)}" data-element="${eId}" data-pset="${ps}" data-prop="${pn}">`;
  }
  return `<input type="text" value="${escapeAttr(propValue ?? "")}" data-element="${eId}" data-pset="${ps}" data-prop="${pn}">`;
}
class PsetEditorPanel {
  constructor(container, commandBus, emitSpan = emitPsetUpdateSpan) {
    this.commandBus = commandBus;
    this.emitSpan = emitSpan;
    this.panel = container.ownerDocument.createElement("div");
    this.panel.className = "pset-editor";
    container.appendChild(this.panel);
    this.listener = this.onChange.bind(this);
    this.panel.addEventListener("change", this.listener);
  }
  commandBus;
  emitSpan;
  panel;
  listener;
  current = null;
  /** Render the inspector for `meta`. Replaces any previous content. */
  mount(meta) {
    this.current = meta;
    const psets = Object.entries(meta.psets);
    this.panel.innerHTML = `
      <div class="pset-header">
        <div class="pset-meta">
          <label>IFC Type: <span class="read-only">${escapeHtml(meta.typeName)}</span></label>
          <label>GlobalId: <span class="read-only monospace">${escapeHtml(meta.globalId)}</span></label>
          ${meta.name ? `<label>Name: <input type="text" value="${escapeAttr(meta.name)}"
                data-field="name" data-element="${escapeAttr(meta.pryzmElementId)}"></label>` : ""}
        </div>
      </div>
      <div class="pset-groups">
        ${psets.map(([psetName, props]) => `
          <details class="pset-group" data-pset="${escapeAttr(psetName)}" open>
            <summary><strong>${escapeHtml(psetName)}</strong></summary>
            <table class="pset-table">
              <thead><tr><th>Property</th><th>Value</th></tr></thead>
              <tbody>
                ${Object.entries(props).map(([propName, propValue]) => `
                  <tr data-prop="${escapeAttr(propName)}">
                    <td class="prop-name">${escapeHtml(propName)}</td>
                    <td>${inputForValue(meta.pryzmElementId, psetName, propName, propValue)}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </details>
        `).join("")}
        ${psets.length === 0 ? '<p class="pset-empty">No property sets.</p>' : ""}
      </div>
    `;
  }
  /** Strip the panel + remove the change listener. */
  dispose() {
    this.panel.removeEventListener("change", this.listener);
    this.panel.remove();
    this.current = null;
  }
  /** Visible for testing — current rendered meta. */
  getCurrentMeta() {
    return this.current;
  }
  onChange(e) {
    const input = e.target;
    if (!input || !input.dataset) return;
    const elementId = input.dataset.element;
    const psetName = input.dataset.pset;
    const propName = input.dataset.prop;
    if (!elementId || !psetName || !propName) return;
    const value = input.type === "checkbox" ? input.checked : input.type === "number" ? input.value === "" ? 0 : Number(input.value) : input.value;
    const cmd = {
      kind: "element.updatePset",
      elementId,
      psetName,
      propertyName: propName,
      value
    };
    try {
      const result = this.commandBus.execute(cmd);
      if (result && typeof result.then === "function") {
        result.catch((err) => {
          console.warn("[ifc-inspector] commandBus.execute rejected:", err);
        });
      }
    } finally {
      this.emitSpan({
        elementId,
        psetName,
        propertyName: propName,
        valueType: valueKind(value)
      });
    }
  }
}

const PRIORITY_IFC = 90;
function createIfcPanelContribution(deps) {
  const states = /* @__PURE__ */ new WeakMap();
  return {
    id: "ifc-metadata",
    category: "IFC",
    priority: PRIORITY_IFC,
    shouldShow(context) {
      return deps.metaResolver(context.elementId) !== null;
    },
    render(container, context) {
      const meta = deps.metaResolver(context.elementId);
      if (!meta) return;
      const panel = new PsetEditorPanel(container, deps.commandBus);
      panel.mount(meta);
      states.set(container, { panel });
    },
    unmount(container) {
      const state = states.get(container);
      if (state) {
        state.panel.dispose();
        states.delete(container);
      }
    }
  };
}

const IFC_CLASS_AUTHORITY = Object.freeze({
  // ---- structural / architectural products, ratified by C25 §2 ----
  wall: { status: "mapped", ifcClass: "IfcWall", authority: "C25§2" },
  slab: { status: "mapped", ifcClass: "IfcSlab", authority: "C25§2" },
  column: { status: "mapped", ifcClass: "IfcColumn", authority: "C25§2" },
  beam: { status: "mapped", ifcClass: "IfcBeam", authority: "C25§2" },
  door: { status: "mapped", ifcClass: "IfcDoor", authority: "C25§2" },
  window: { status: "mapped", ifcClass: "IfcWindow", authority: "C25§2" },
  roof: { status: "mapped", ifcClass: "IfcRoof", authority: "C25§2" },
  stair: { status: "mapped", ifcClass: "IfcStair", authority: "C25§2" },
  handrail: { status: "mapped", ifcClass: "IfcRailing", authority: "C25§2" },
  ceiling: {
    status: "mapped",
    ifcClass: "IfcCovering",
    predefinedType: "CEILING",
    authority: "C25§2",
    note: "C25 §2 row: 'Ceiling | IfcCovering (ceiling type)'."
  },
  /**
   * §IFC-TREE-FLOOR-IS-A-COVERING (L-8302) — the ONE row where the CODE was
   * right and the CONTRACT was imprecise, so C25 §2 was amended rather than the
   * code changed.
   *
   * C25 §2 carried one row, "Slab / Floor -> IfcSlab", conflating two families
   * PRYZM keeps separate. `packages/core-app-model/src/stores/FloorSystemTypeStore.ts`
   * stamps `ifcTypeName: 'FLOORING'` on every floor system type — that is
   * literally `IfcCoveringTypeEnum.FLOORING`. PRYZM's `floor` is a FINISH, and
   * its `slab` is the STRUCTURE. Mapping the finish to IfcSlab would emit two
   * structural slabs where the model has one slab and one floor finish.
   */
  floor: {
    status: "mapped",
    ifcClass: "IfcCovering",
    predefinedType: "FLOORING",
    authority: "C25§2-amended",
    note: "C25 §2 originally read 'Slab / Floor -> IfcSlab', conflating PRYZM's structural `slab` with its finish `floor`. FloorSystemTypeStore stamps ifcTypeName 'FLOORING' (= IfcCoveringTypeEnum.FLOORING). Row split by L-8302."
  },
  /**
   * §IFC-TREE-FURNITURE (L-8303) — code said `IfcFurnishingElement`,
   * C25 §2 says `IfcFurniture`. THE CONTRACT WINS.
   *
   * NOT VERIFIED OFFLINE: the usual rationale is that IFC4/IFC4X3 demoted
   * IfcFurnishingElement to an abstract supertype over IfcFurniture and
   * IfcSystemFurnitureElement. This lane did not verify schema abstractness
   * against a buildingSMART EXPRESS schema and does not assert it. The binding
   * reason here is simply the CLAUDE.md conflict-resolution order: when code
   * disagrees with a contract, the code is wrong.
   */
  furniture: {
    status: "mapped",
    ifcClass: "IfcFurniture",
    authority: "C25§2",
    note: "Code said 'IfcFurnishingElement' (CoreElement.ts:77). C25 §2 says IfcFurniture. Contract wins. web-ifc exposes IFCFURNITURE = 1509553395, so this is emittable."
  },
  /**
   * §IFC-TREE-PLUMBING (L-8304) — code said `IfcFlowTerminal`,
   * C25 §2 says `IfcSanitaryTerminal`. THE CONTRACT WINS. Same caveat as
   * `furniture`: this lane did not verify IFC4X3 abstractness offline.
   */
  plumbing: {
    status: "mapped",
    ifcClass: "IfcSanitaryTerminal",
    authority: "C25§2",
    note: "Code said 'IfcFlowTerminal' (CoreElement.ts:77). C25 §2 says IfcSanitaryTerminal with PredefinedType BATH/SINK/SHOWER/TOILET/WASHHANDBASIN. web-ifc exposes IFCSANITARYTERMINAL = 3053780830."
  },
  // ---- curtain walling. BOTH spellings, because both unions ship one each. ----
  "curtain-wall": { status: "mapped", ifcClass: "IfcCurtainWall", authority: "C25§2" },
  curtainwall: {
    status: "mapped",
    ifcClass: "IfcCurtainWall",
    authority: "C25§2",
    note: "L0 (schemas/Id.ts) spells this `curtainwall`; core-app-model spells it `curtain-wall`. Both resolve here so neither vocabulary is silently partial. The SPELLING SPLIT ITSELF is logged as L-8301 and is not fixed by this lane."
  },
  "curtain-panel": {
    status: "mapped",
    ifcClass: "IfcPlate",
    predefinedType: "CURTAIN_PANEL",
    authority: "C25§2-amended",
    note: "C25 §2 has no `curtain-panel` row. IfcPlate/CURTAIN_PANEL is the buildingSMART infill member for a curtain wall and IfcModelBuilder already carries IfcPlate. Row ADDED to C25 §2 by L-8302 rather than invented here."
  },
  // ---- spatial / non-product ----
  room: {
    status: "mapped",
    ifcClass: "IfcSpace",
    authority: "C25§2",
    note: "C25 §2: Space / Room -> IfcSpace, Pset_SpaceCommon."
  },
  grid: {
    status: "mapped",
    ifcClass: "IfcGrid",
    authority: "C25§2",
    note: "C25 §2 ranks Grid -> IfcGrid. ⚠ IFC_CLASS_MAP (IfcModelBuilder.ts:24) has NO IfcGrid row, so a grid reaching that builder falls through line 156 to IFCBUILDINGELEMENTPROXY. Logged as L-8305."
  },
  level: {
    status: "mapped",
    ifcClass: "IfcBuildingStorey",
    authority: "C25§2",
    note: "Spatial structure, NOT a product. Written by hierarchy.ts, never by IfcModelBuilder. Its absence from IFC_CLASS_MAP is CORRECT, not a gap — a storey emitted as a product would be a schema error."
  },
  opening: {
    status: "mapped",
    ifcClass: "IfcOpeningElement",
    authority: "C25§2",
    note: "Voiding element; related via IfcRelVoidsElement, not contained as a product."
  },
  // ---- ratified by C25 but recorded there as GAP-not-yet-emitted ----
  lighting: {
    status: "mapped",
    ifcClass: "IfcLightFixture",
    authority: "C25§2",
    note: "C25 §2 row 'Light | IfcLightFixture | Pset_LightFixtureTypeCommon | GAP — IFC-β'. The CLASS is ratified; the EXPORTER is not written. Mapped here so the tree can group it honestly; that is not a claim that it exports."
  },
  annotation: {
    status: "mapped",
    ifcClass: "IfcAnnotation",
    authority: "C25§2",
    note: "C25 §4 — annotation export is ratified as IfcAnnotation and recorded NOT implemented."
  },
  dimension: {
    status: "mapped",
    ifcClass: "IfcAnnotation",
    authority: "C25§2",
    note: "C25 §4 groups dimension strings with annotation under IfcAnnotation."
  },
  // ---------------------------------------------------------------------
  // UNMAPPED — 'no-contract-row'. Real, placed building elements that C25 §2
  // does not rank. ⛔ NOTHING HERE IS INVENTED. Each carries a NON-NORMATIVE
  // candidate so the founder has a concrete yes/no, and the tree shows them as
  // unmapped and NAMES them. Logged as L-8306.
  // ---------------------------------------------------------------------
  lift: {
    status: "unmapped",
    reason: "no-contract-row",
    candidate: "IfcTransportElement",
    note: "IfcTransportElement/ELEVATOR is the obvious buildingSMART fit, but C25 §2 has no row and this lane will not mint one. Founder decision — L-8306."
  },
  liftPart: {
    status: "unmapped",
    reason: "no-contract-row",
    note: "A sub-part of a lift. Whether it is an IFC product at all, or an aggregate member of the lift via IfcRelAggregates, is undecided. No candidate offered."
  },
  verticalCirculation: {
    status: "unmapped",
    reason: "no-contract-row",
    note: "A PRYZM abstraction spanning stair + lift. It may have no single IFC class and may be correct to decompose rather than map. No candidate offered."
  },
  balcony: {
    status: "unmapped",
    reason: "no-contract-row",
    candidate: "IfcSlab",
    note: "Commonly IfcSlab with a BALCONY-ish PredefinedType, but IFC4 has no BALCONY enum and practice varies. C25 §2 has no row. Founder decision — L-8306."
  },
  pool: {
    status: "unmapped",
    reason: "no-contract-row",
    note: "IFC has no swimming-pool product. Candidates are all compromises (IfcBuildingElementProxy, or a decomposition into slab + walls + water). Deliberately NO candidate — offering one would be inventing."
  },
  water: {
    status: "unmapped",
    reason: "no-contract-row",
    note: "A material/volume, not a placed product. No IFC product class is honest here."
  },
  boundaryLine: {
    status: "unmapped",
    reason: "no-contract-row",
    candidate: "IfcAnnotation",
    note: "C105 setting-out line. IfcAnnotation carries it as drafting; IfcSite boundary semantics would be richer. C25 §2 has no row. Founder decision — L-8306."
  },
  structural: {
    status: "unmapped",
    reason: "no-contract-row",
    note: "A category, not a family — IFC would express it as IfcStructuralAnalysisModel or as LoadBearing=true on the member. No single class. No candidate offered."
  },
  section: {
    status: "unmapped",
    reason: "not-a-product",
    note: "A drawing view definition. C102 (View & Sheet Integrity) governs it. IFC4 can carry it as IfcAnnotation on a sheet, but the section itself is not a building product."
  },
  projectOrigin: {
    status: "unmapped",
    reason: "not-a-product",
    note: "The survey/project datum. Expressed in IFC as IfcMapConversion + IfcGeometricRepresentationContext (C25 §7), never as a product."
  },
  // ---- 'not-a-product' — absent from IFC by DESIGN, not by gap ----
  view: { status: "unmapped", reason: "not-a-product", note: "A drawing view. C102 governs." },
  sheet: { status: "unmapped", reason: "not-a-product", note: "A drawing sheet. C102 governs." },
  schedule: {
    status: "unmapped",
    reason: "not-a-product",
    note: "A tabular report over elements, not an element."
  },
  project: {
    status: "unmapped",
    reason: "not-a-product",
    note: "IfcProject is the spatial ROOT, emitted by hierarchy.ts. Not a product row."
  }
});
function resolveIfcClass(elementType) {
  const hit = IFC_CLASS_AUTHORITY[elementType];
  if (hit) return hit;
  return {
    status: "unmapped",
    reason: "no-contract-row",
    note: `'${elementType}' is in neither the L0 id vocabulary nor core-app-model's ElementType. Unrecognised, not proxied.`
  };
}
function authorityKeys() {
  return Object.keys(IFC_CLASS_AUTHORITY);
}
function mappedIfcClasses() {
  const out = /* @__PURE__ */ new Set();
  for (const r of Object.values(IFC_CLASS_AUTHORITY)) {
    if (r.status === "mapped") out.add(r.ifcClass);
  }
  return [...out].sort();
}

const NOT_EXTRACTED = (why) => ({ kind: "not-extracted", why });
const NOT_AUTHORED = Object.freeze({ kind: "not-authored" });
const authored = (value) => ({ kind: "authored", value });
const derived = (value, via) => ({ kind: "derived", value, via });
const unresolved = (why) => ({ kind: "unresolved", why });
const perPart = (parts) => parts.length === 0 ? NOT_AUTHORED : { kind: "per-part", parts };
const IMPORTED_CAPABILITY = Object.freeze({
  // IfcElementRecord has no material field — we never looked, so 'none' is unsayable.
  answersMaterial: false,
  // IfcElementRecord has no system/group field — likewise unsayable.
  answersSystem: false,
  // IfcElementRecord carries expressID, not the IFC GlobalId string.
  answersGlobalId: false,
  // storeyName + storeyExpressID only; no Site, no Building, no Space.
  deepestSpatialRung: "storey",
  limitNote: "Imported IFC is parsed for class, name, storey and property sets. Material, system membership and GlobalId are present in the file but not yet extracted by PRYZM (data-only parse)."
});
const NATIVE_CAPABILITY = Object.freeze({
  /**
   * TRUE, but THIN — and the thinness is stated rather than averaged away.
   *
   * Measured: PRYZM authors material on only a few families, and only ever as a
   * STRING inside a property set, never as an IFC material entity:
   *   `readers/BeamReader.ts:28`   beam.material            -> pset 'Material'
   *   `readers/StairReader.ts:30`  stair.properties.material-> pset 'Material'
   *   `readers/RoomReader.ts:133`  room.finishes.*.materialName
   *                                -> Floor/Wall/CeilingCovering
   * Every other family authors none. So an empty result here means ABSENT (we
   * looked), not NOT-EXTRACTED — which is why this flag is true.
   *
   * ⛔ RENDER COLOUR IS NOT MATERIAL. `FragmentReader.ts:363` and
   * `IfcGeometryWriter.ts:78` extract RGB for IfcStyledItem. That is
   * PRESENTATION. Deriving a material grouping from it would manufacture data.
   */
  answersMaterial: true,
  answersSystem: true,
  answersGlobalId: true,
  deepestSpatialRung: "storey",
  limitNote: "PRYZM elements are projected into IFC classes via the C25 §2 authority. Material is authored on a few families only (beams, stairs, room finishes) and only as a property-set string. IfcSystem (MEP/functional networks) is not a concept PRYZM authors — its system TYPES are IFC type objects, a different relation."
});
const MATERIAL_EXPORT_CAVEAT = "Shown from the PRYZM model. ⚠ Material is NOT emitted as an IFC material entity by either export pipeline (0 IfcMaterial / IfcRelAssociatesMaterial), so it survives export only as a property-set string.";
const EXPORT_PATH_CAVEAT = "Export facts describe the pipeline the app actually runs (packages/file-format IfcExporter). The richer IFC4X3 exporter exists but has no production caller.";

function facetValue(f) {
  if (f.kind === "authored") return f.value;
  if (f.kind === "derived") return f.value;
  return null;
}
function partsKey(f) {
  if (f.kind !== "per-part") return null;
  const parts = [...f.parts].sort((a, b) => a.part.localeCompare(b.part));
  return {
    key: `parts:${parts.map((x) => `${x.part}=${x.value}`).join("|")}`,
    label: parts.map((x) => `${x.part}: ${x.value}`).join(" · ")
  };
}
function deriveStats(elements, pick) {
  let d = 0;
  let u = 0;
  for (const e of elements) {
    const f = pick(e);
    if (f.kind === "derived") d++;
    else if (f.kind === "unresolved") u++;
  }
  return { derived: d, unresolved: u };
}
function bucket(elements, keyOf) {
  const acc = /* @__PURE__ */ new Map();
  for (const e of elements) {
    const { key, label, deficit } = keyOf(e);
    let slot = acc.get(key);
    if (!slot) {
      slot = { label, ids: [], deficit };
      acc.set(key, slot);
    }
    slot.ids.push(e.id);
  }
  return [...acc.entries()].map(([key, v]) => ({
    key,
    label: v.label,
    count: v.ids.length,
    memberIds: v.ids,
    children: [],
    ...v.deficit ? { deficit: v.deficit } : {}
  }));
}
function countDeficit(groups) {
  return groups.reduce((n, g) => n + (g.deficit ? g.count : 0), 0);
}
function emptyCause(sources, extracts) {
  if (sources.length === 0) return "no-model";
  const canLook = sources.filter(extracts);
  if (canLook.length === 0) return "not-extracted";
  if (canLook.length === sources.length) return "absent";
  return "absent-or-not-extracted";
}
function allElements(sources) {
  return sources.flatMap((s) => [...s.elements]);
}
const RUNG_ORDER = [
  "project",
  "site",
  "building",
  "storey",
  "space"
];
function groupBySpatial(sources) {
  const elements = allElements(sources);
  const total = elements.length;
  if (total === 0) {
    return {
      id: "spatial",
      label: "IFC spatial",
      groups: [],
      coverage: {
        kind: "empty",
        cause: "no-model",
        message: "No model loaded. Import an IFC file, or create PRYZM elements, to populate the spatial tree."
      },
      totalElements: 0
    };
  }
  const deepest = sources.reduce((best, s) => {
    const d = s.capability.deepestSpatialRung;
    if (d === "none") return best;
    if (best === "none") return d;
    return RUNG_ORDER.indexOf(d) > RUNG_ORDER.indexOf(best) ? d : best;
  }, "none");
  const root = [];
  const mutable = /* @__PURE__ */ new Map();
  const childrenOf = /* @__PURE__ */ new Map();
  const rootKeys = [];
  const unplaced = [];
  for (const e of elements) {
    if (e.spatial.length === 0) {
      unplaced.push(e.id);
      continue;
    }
    let parentKey = null;
    for (const rung of e.spatial) {
      const key = `${rung.level}:${rung.id}`;
      let slot = mutable.get(key);
      if (!slot) {
        slot = { key, label: rung.name, ids: [] };
        mutable.set(key, slot);
        if (parentKey === null) {
          if (!rootKeys.includes(key)) rootKeys.push(key);
        } else {
          const sib = childrenOf.get(parentKey) ?? [];
          if (!sib.includes(key)) sib.push(key);
          childrenOf.set(parentKey, sib);
        }
      }
      parentKey = key;
    }
    const leafKey = `${e.spatial[e.spatial.length - 1].level}:${e.spatial[e.spatial.length - 1].id}`;
    mutable.get(leafKey).ids.push(e.id);
  }
  const build = (key) => {
    const slot = mutable.get(key);
    const children = (childrenOf.get(key) ?? []).map(build);
    const nestedCount = children.reduce((n, c) => n + c.count, 0);
    return {
      key,
      label: slot.label,
      count: slot.ids.length + nestedCount,
      memberIds: slot.ids,
      children
    };
  };
  for (const k of rootKeys) root.push(build(k));
  if (unplaced.length > 0) {
    root.push({
      key: "spatial:unplaced",
      label: "Not in any spatial container",
      count: unplaced.length,
      memberIds: unplaced,
      children: [],
      deficit: "unassigned"
    });
  }
  const limitNote = deepest === "storey" ? "Spatial depth reaches STOREY. Site, Building and Space rungs are not extracted from this source, so this tree is shallower than the file — it is not a claim that the file lacks them." : deepest === "none" ? "No spatial containment extracted." : void 0;
  return {
    id: "spatial",
    label: "IFC spatial",
    groups: root,
    coverage: {
      kind: "populated",
      grouped: total - unplaced.length,
      deficit: unplaced.length,
      ...limitNote ? { limitNote } : {}
    },
    totalElements: total
  };
}
function groupByClass(sources) {
  const elements = allElements(sources);
  const total = elements.length;
  if (total === 0) {
    return {
      id: "class",
      label: "By IFC class",
      groups: [],
      coverage: {
        kind: "empty",
        cause: "no-model",
        message: "No model loaded. Import an IFC file, or create PRYZM elements, to group by IFC class."
      },
      totalElements: 0
    };
  }
  const groups = bucket(elements, (e) => {
    if (e.ifcClass.status === "mapped") {
      return { key: e.ifcClass.ifcClass, label: e.ifcClass.ifcClass };
    }
    const reason = e.ifcClass.reason === "not-a-product" ? "Not an IFC product" : "Unmapped — no C25 §2 row";
    return { key: `unmapped:${e.ifcClass.reason}`, label: reason, deficit: "unmapped" };
  });
  groups.sort((a, b) => {
    if (!!a.deficit !== !!b.deficit) return a.deficit ? 1 : -1;
    return b.count - a.count;
  });
  return {
    id: "class",
    label: "By IFC class",
    groups,
    coverage: { kind: "populated", grouped: total - countDeficit(groups), deficit: countDeficit(groups) },
    totalElements: total
  };
}
function groupBySystem(sources) {
  const elements = allElements(sources);
  const total = elements.length;
  const withSystem = elements.filter((e) => facetValue(e.system) !== null);
  if (withSystem.length === 0) {
    const cause = emptyCause(sources, (s) => s.capability.answersSystem);
    const message = cause === "no-model" ? "No model loaded." : cause === "not-extracted" ? "No systems authored in this model (or system extraction is not yet enabled). PRYZM does not currently read IfcSystem membership from imported files, so this is a limit of the parse, not a statement about the file." : cause === "absent" ? "No systems authored in this model. PRYZM elements do not carry IfcSystem (MEP or functional network) membership — note that PRYZM system TYPES are IFC type objects, which is a different relation." : "No systems authored in this model (or system extraction is not yet enabled). Both causes are in play: PRYZM authors no IfcSystem membership on its own elements, and does not extract it from imported files. These are different facts and neither can be ruled out here.";
    return {
      id: "system",
      label: "By IFC system",
      groups: [],
      coverage: { kind: "empty", cause, message },
      totalElements: total
    };
  }
  const groups = bucket(elements, (e) => {
    const v = facetValue(e.system);
    if (v) return { key: `sys:${v}`, label: v };
    return {
      key: e.system.kind === "not-extracted" ? "sys:not-extracted" : "sys:not-authored",
      label: e.system.kind === "not-extracted" ? "System not extracted" : "No system assigned",
      deficit: e.system.kind === "not-extracted" ? "unassigned" : "not-authored"
    };
  });
  return {
    id: "system",
    label: "By IFC system",
    groups,
    coverage: { kind: "populated", grouped: withSystem.length, deficit: total - withSystem.length },
    totalElements: total
  };
}
function groupByMaterial(sources) {
  const elements = allElements(sources);
  const total = elements.length;
  const withMaterial = elements.filter(
    (e) => facetValue(e.material) !== null || e.material.kind === "per-part"
  );
  if (withMaterial.length === 0) {
    const cause = emptyCause(sources, (s) => s.capability.answersMaterial);
    const message = cause === "no-model" ? "No model loaded." : cause === "not-extracted" ? "Materials are present in the model; per-element assignment is not yet extracted (data-only parse). PRYZM does not read IfcRelAssociatesMaterial from imported files." : cause === "absent" ? "No materials authored on any element in this model." : "No materials to group. Both causes are in play: some elements author none, and imported elements have their material present in the file but not yet extracted (data-only parse).";
    return {
      id: "material",
      label: "By material",
      groups: [],
      coverage: { kind: "empty", cause, message },
      totalElements: total
    };
  }
  const groups = bucket(elements, (e) => {
    const v = facetValue(e.material);
    if (v) return { key: `mat:${v}`, label: v };
    const pk = partsKey(e.material);
    if (pk) return { key: `mat:${pk.key}`, label: pk.label };
    if (e.material.kind === "not-extracted") {
      return {
        key: "mat:not-extracted",
        label: "Material not extracted",
        deficit: "unassigned"
      };
    }
    return {
      key: "mat:not-authored",
      label: "Material not authored on this element",
      deficit: "not-authored"
    };
  });
  groups.sort((a, b) => {
    if (!!a.deficit !== !!b.deficit) return a.deficit ? 1 : -1;
    return b.count - a.count;
  });
  const notExtracted = elements.filter((e) => e.material.kind === "not-extracted").length;
  const limitNote = notExtracted > 0 ? `${notExtracted.toLocaleString()} of ${total.toLocaleString()} elements have their material present in the source but not extracted by PRYZM. Those are grouped under "Material not extracted" and are NOT counted as unmaterialed.` : void 0;
  return {
    id: "material",
    label: "By material",
    groups,
    coverage: {
      kind: "populated",
      grouped: withMaterial.length,
      deficit: total - withMaterial.length,
      ...limitNote ? { limitNote } : {}
    },
    totalElements: total
  };
}
function groupByStorey(sources) {
  const elements = allElements(sources);
  const total = elements.length;
  if (total === 0) {
    return {
      id: "storey",
      label: "By storey",
      groups: [],
      coverage: {
        kind: "empty",
        cause: "no-model",
        message: "No model loaded. Import an IFC file, or create PRYZM elements, to group by storey."
      },
      totalElements: 0
    };
  }
  const groups = bucket(elements, (e) => {
    const v = facetValue(e.storey);
    if (v) return { key: `st:${v}`, label: v };
    if (e.storey.kind === "not-extracted") {
      return { key: "st:not-extracted", label: "Storey not extracted", deficit: "unassigned" };
    }
    if (e.storey.kind === "unresolved") {
      const noHost = /carries no wallId|not in the wall store/.test(e.storey.why);
      return noHost ? {
        key: "st:unresolved-host",
        label: "Hosted, but the host wall could not be found",
        deficit: "unassigned"
      } : {
        key: "st:unresolved-level",
        label: "Hosted, but the host wall carries no level",
        deficit: "unassigned"
      };
    }
    return { key: "st:unassigned", label: "Not assigned to a storey", deficit: "unassigned" };
  });
  const stats = deriveStats(elements, (e) => e.storey);
  const limitNote = stats.derived > 0 ? `${stats.derived.toLocaleString()} of ${total.toLocaleString()} elements are hosted openings (doors and windows) whose storey was DERIVED from their host wall. PRYZM does not store a level on a door or a window — C15 makes it an offset along a wall — so this is a resolved reference, not a value the element carries.` : void 0;
  return {
    id: "storey",
    label: "By storey",
    groups,
    coverage: {
      kind: "populated",
      grouped: total - countDeficit(groups),
      deficit: countDeficit(groups),
      ...limitNote ? { limitNote } : {}
    },
    totalElements: total
  };
}
const GROUPINGS = Object.freeze([
  { id: "spatial", label: "IFC spatial", build: groupBySpatial },
  { id: "class", label: "By IFC class", build: groupByClass },
  { id: "system", label: "By IFC system", build: groupBySystem },
  { id: "material", label: "By material", build: groupByMaterial },
  { id: "storey", label: "By storey", build: groupByStorey }
]);
function buildGrouping(id, sources) {
  const entry = GROUPINGS.find((g) => g.id === id);
  if (!entry) throw new Error(`Unknown grouping '${id}'`);
  return entry.build(sources);
}

const MAX_MATERIALISED_ROWS = 1500;
const MAX_ROWS_PER_GROUP = 300;
function materialiseRows(groups, expanded, labelForElement, totalElements) {
  const rows = [];
  let rendered = 0;
  let truncated = false;
  const walk = (group, depth) => {
    rows.push({
      kind: "group",
      id: group.key,
      label: group.label,
      depth,
      count: group.count,
      ...group.deficit ? { deficit: group.deficit } : {}
    });
    if (!expanded.has(group.key)) return;
    for (const child of group.children) walk(child, depth + 1);
    const budget = Math.min(group.memberIds.length, MAX_ROWS_PER_GROUP);
    for (let i = 0; i < budget; i++) {
      if (rendered >= MAX_MATERIALISED_ROWS) {
        truncated = true;
        return;
      }
      const id = group.memberIds[i];
      rows.push({ kind: "element", id, label: labelForElement(id), depth: depth + 1 });
      rendered++;
    }
    if (group.memberIds.length > budget) {
      truncated = true;
      const hidden = group.memberIds.length - budget;
      rows.push({
        kind: "group",
        id: `${group.key}::more`,
        label: `+${hidden.toLocaleString()} more in this group — use Find to reach a specific object`,
        depth: depth + 1
      });
    }
  };
  for (const g of groups) {
    if (rendered >= MAX_MATERIALISED_ROWS) {
      truncated = true;
      break;
    }
    walk(g, 0);
  }
  return {
    rows,
    renderedElements: rendered,
    totalElements,
    truncated,
    notice: truncated ? truncationNotice(rendered, totalElements) : null
  };
}
function truncationNotice(rendered, total) {
  return `Large model: showing a responsive preview of ${rendered.toLocaleString()} element rows. Counts and group actions still cover all ${total.toLocaleString()} elements; use Find for a specific object.`;
}

const ANSWERABLE_SLOTS = [
  "what-it-is",
  "why-it-exists",
  "where",
  "part-of-and-made-of",
  "feeds-and-fed-by",
  "who-is-responsible",
  "state-and-history",
  "if-it-fails"
];
const SLOT_LABELS = Object.freeze({
  "what-it-is": "What it is",
  "why-it-exists": "Why it exists",
  where: "Where",
  "part-of-and-made-of": "Part of and made of",
  "feeds-and-fed-by": "Feeds and fed by",
  "who-is-responsible": "Who is responsible",
  "state-and-history": "State and history",
  "if-it-fails": "If it fails"
});
const PROVENANCE_CHIP = Object.freeze({
  model: "from the model",
  mapping: "from the PRYZM→IFC mapping",
  user: "authored in PRYZM",
  ai: "AI-inferred — not from the model"
});
function answeredSlot(id, text, provenance) {
  return { id, label: SLOT_LABELS[id], state: "answered", text, provenance };
}
function unknownSlot(id, reason, note) {
  return { id, label: SLOT_LABELS[id], state: "unknown", reason, note };
}
function buildElementStory(el) {
  const slots = [];
  if (el.ifcClass.status === "mapped") {
    const isNative = el.origin === "native";
    slots.push(
      answeredSlot(
        "what-it-is",
        `${el.name} — ${el.ifcClass.ifcClass}${el.ifcClass.predefinedType ? ` (${el.ifcClass.predefinedType})` : ""}`,
        [
          isNative ? {
            kind: "mapping",
            chip: PROVENANCE_CHIP.mapping,
            detail: `C25 §2 via ${el.ifcClass.authority}`
          } : { kind: "model", chip: PROVENANCE_CHIP.model, detail: "IFC class in the imported file" }
        ]
      )
    );
  } else {
    slots.push(
      unknownSlot(
        "what-it-is",
        "not-in-model",
        el.ifcClass.reason === "not-a-product" ? `'${el.name}' is not an IFC product (it is a view, sheet or similar). It has no IFC class by design.` : `'${el.name}' has no ratified IFC class — C25 §2 has no row for its family. This is a gap awaiting a decision, not a missing value.`
      )
    );
  }
  slots.push(
    unknownSlot(
      "why-it-exists",
      "needs-judgement",
      "Design intent is not carried by IFC. No field in the model answers this; it has to be authored or asked."
    )
  );
  if (el.storey.kind === "unresolved") {
    slots.push(
      unknownSlot(
        "where",
        "not-in-model",
        `This is a hosted opening, so its storey belongs to its host wall rather than to itself — but the host did not resolve: ${el.storey.why}.`
      )
    );
  } else if (el.storey.kind === "derived") {
    const chain = el.spatial.map((r) => r.name).join(" → ");
    slots.push(
      answeredSlot("where", chain || el.storey.value, [
        {
          kind: "model",
          chip: `${PROVENANCE_CHIP.model} (derived)`,
          detail: `via ${el.storey.via} — PRYZM stores no level on a door or window (C15: an offset along a wall)`
        }
      ])
    );
  } else if (el.spatial.length > 0) {
    slots.push(
      answeredSlot("where", el.spatial.map((r) => r.name).join(" → "), [
        { kind: "model", chip: PROVENANCE_CHIP.model, detail: "IFC spatial containment" }
      ])
    );
  } else if (el.storey.kind === "authored") {
    slots.push(
      answeredSlot("where", el.storey.value, [
        { kind: "model", chip: PROVENANCE_CHIP.model, detail: "storey assignment" }
      ])
    );
  } else {
    slots.push(
      unknownSlot(
        "where",
        el.storey.kind === "not-extracted" ? "not-extracted" : "not-in-model",
        el.storey.kind === "not-extracted" ? "Spatial containment is present in the source but not extracted by PRYZM." : "This element is not assigned to any spatial container in the model."
      )
    );
  }
  if (el.material.kind === "per-part") {
    slots.push(
      answeredSlot(
        "part-of-and-made-of",
        el.material.parts.map((x) => `${x.part}: ${x.value}`).join(" · "),
        [
          {
            kind: "model",
            chip: `${el.material.parts.length} from the model`,
            detail: "authored per part — this family carries one finish per surface, not one material (C100 §9.1)"
          }
        ]
      )
    );
  } else if (el.material.kind === "authored") {
    slots.push(
      answeredSlot("part-of-and-made-of", `Material: ${el.material.value}`, [
        { kind: "model", chip: PROVENANCE_CHIP.model, detail: "material assignment" }
      ])
    );
  } else {
    slots.push(
      unknownSlot(
        "part-of-and-made-of",
        el.material.kind === "not-extracted" ? "not-extracted" : "not-in-model",
        el.material.kind === "not-extracted" ? "Material is present in the source but per-element assignment is not yet extracted (data-only parse)." : "Material — not authored on this element."
      )
    );
  }
  if (el.system.kind === "authored") {
    slots.push(
      answeredSlot("feeds-and-fed-by", el.system.value, [
        { kind: "model", chip: PROVENANCE_CHIP.model, detail: "IfcSystem membership" }
      ])
    );
  } else {
    slots.push(
      unknownSlot(
        "feeds-and-fed-by",
        el.system.kind === "not-extracted" ? "not-extracted" : "not-in-model",
        el.system.kind === "not-extracted" ? "System membership is not extracted from imported IFC." : "No system authored on this element (or system extraction is not yet enabled)."
      )
    );
  }
  slots.push(
    unknownSlot(
      "who-is-responsible",
      "not-in-model",
      "No responsible party on this element. IfcOwnerHistory is null on every entity except IfcProject in the export path the app runs."
    )
  );
  const status = findPsetValue(el, "Status");
  if (status !== null) {
    slots.push(
      answeredSlot("state-and-history", `Status: ${String(status)}`, [
        { kind: "model", chip: PROVENANCE_CHIP.model, detail: "Pset Status property" }
      ])
    );
  } else {
    slots.push(
      unknownSlot(
        "state-and-history",
        "not-in-model",
        "No Status property on this element, and PRYZM keeps no per-element change history that reaches IFC."
      )
    );
  }
  const ratings = ["FireRating", "AcousticRating", "LoadBearing", "Combustible"].map((k) => [k, findPsetValue(el, k)]).filter(([, v]) => v !== null);
  if (ratings.length > 0) {
    slots.push(
      answeredSlot(
        "if-it-fails",
        ratings.map(([k, v]) => `${k}: ${String(v)}`).join(" · "),
        [
          {
            kind: "model",
            chip: `${ratings.length} from the model`,
            detail: ratings.map(([k]) => k).join(", ")
          }
        ]
      )
    );
  } else {
    slots.push(
      unknownSlot(
        "if-it-fails",
        "not-in-model",
        "No fire, acoustic or load-bearing rating is authored on this element."
      )
    );
  }
  return finalise(el, slots);
}
function findPsetValue(el, prop) {
  for (const props of Object.values(el.psets)) {
    if (prop in props) {
      const v = props[prop];
      if (v !== null && v !== void 0 && v !== "") return v;
    }
  }
  return null;
}
function finalise(el, slots) {
  const byProvenance = { model: 0, mapping: 0, user: 0, ai: 0 };
  let answered = 0;
  let grounded = 0;
  let aiOnly = 0;
  for (const s of slots) {
    if (s.state !== "answered") continue;
    answered++;
    const kinds = new Set(s.provenance.map((p) => p.kind));
    for (const k of kinds) byProvenance[k]++;
    if (kinds.has("model") || kinds.has("mapping") || kinds.has("user")) grounded++;
    else if (kinds.has("ai")) aiOnly++;
  }
  const total = ANSWERABLE_SLOTS.length;
  const container = el.spatial.length > 0 ? el.spatial[el.spatial.length - 1].name : el.storey.kind === "authored" ? el.storey.value : "no container";
  const cls = el.ifcClass.status === "mapped" ? el.ifcClass.ifcClass : "Unmapped";
  return {
    elementId: el.id,
    name: el.name,
    classAndContainer: `${cls} · ${container}`,
    oneLine: el.ifcClass.status === "mapped" ? `A ${cls} in ${container}.` : `${el.name} — no ratified IFC class. See "What it is".`,
    slots,
    completeness: {
      answered,
      total,
      grounded,
      aiOnly,
      headline: `${answered} of ${total} answered`
    },
    howWeKnow: {
      byProvenance,
      summary: summarise(byProvenance, answered, total, aiOnly)
    }
  };
}
function summarise(by, answered, total, aiOnly) {
  if (answered === 0) {
    return `Nothing is known about this element from any source. All ${total} questions are open.`;
  }
  const parts = [];
  if (by.model > 0) parts.push(`${by.model} from the model`);
  if (by.mapping > 0) parts.push(`${by.mapping} from the PRYZM→IFC mapping`);
  if (by.user > 0) parts.push(`${by.user} authored in PRYZM`);
  if (by.ai > 0) parts.push(`${by.ai} AI-inferred`);
  const tail = aiOnly > 0 ? ` ⚠ ${aiOnly} ${aiOnly === 1 ? "answer rests" : "answers rest"} on AI inference alone and ${aiOnly === 1 ? "is" : "are"} not a fact about the building.` : "";
  return `${parts.join(", ")}.${tail}`;
}
function withAiAnswers(story, answers) {
  if (answers.size === 0) return story;
  const merged = story.slots.map((s) => {
    const a = answers.get(s.id);
    if (!a || s.state === "answered") return s;
    return answeredSlot(s.id, a, [{ kind: "ai", chip: PROVENANCE_CHIP.ai }]);
  });
  return finaliseFromStory(story, merged);
}
function finaliseFromStory(prev, slots) {
  const byProvenance = { model: 0, mapping: 0, user: 0, ai: 0 };
  let answered = 0;
  let grounded = 0;
  let aiOnly = 0;
  for (const s of slots) {
    if (s.state !== "answered") continue;
    answered++;
    const kinds = new Set(s.provenance.map((p) => p.kind));
    for (const k of kinds) byProvenance[k]++;
    if (kinds.has("model") || kinds.has("mapping") || kinds.has("user")) grounded++;
    else if (kinds.has("ai")) aiOnly++;
  }
  const total = ANSWERABLE_SLOTS.length;
  return {
    ...prev,
    slots,
    completeness: { answered, total, grounded, aiOnly, headline: `${answered} of ${total} answered` },
    howWeKnow: { byProvenance, summary: summarise(byProvenance, answered, total, aiOnly) }
  };
}
function openQuestions(story) {
  return story.slots.filter((s) => s.state === "unknown").filter((s) => s.reason !== "not-extracted").map((s) => s.id);
}

const MAX_BATCH_ELEMENTS = 50;
const MAX_QUESTIONS_PER_ELEMENT = 8;
function gateBatch(reqs, estimate, port) {
  if (port === null) {
    return {
      allowed: false,
      reason: "AI is not wired in this build. The story card can still show everything the model knows; asking is unavailable until the bring-your-own-key route is connected."
    };
  }
  if (reqs.length === 0) {
    return { allowed: false, reason: "Nothing to ask — every slot in the selection is already answered." };
  }
  if (reqs.length > MAX_BATCH_ELEMENTS) {
    return {
      allowed: false,
      reason: `Refused: ${reqs.length.toLocaleString()} elements exceeds the ${MAX_BATCH_ELEMENTS}-element cap for one run. Narrow the selection — there is deliberately no "research every element" action, because on a 100k-element model that is a six-figure request count.`
    };
  }
  const questions = reqs.reduce(
    (n, r) => n + Math.min(r.slots.length, MAX_QUESTIONS_PER_ELEMENT),
    0
  );
  const costLine = estimate ? `Estimated cost ${estimate.formattedCost} (${estimate.source}).` : "⚠ Cost is not estimated in this build — this run may incur charges that are not shown here.";
  return {
    allowed: true,
    elements: reqs.length,
    questions,
    estimate,
    confirmation: `Ask AI about ${reqs.length.toLocaleString()} ${reqs.length === 1 ? "element" : "elements"}, ${questions.toLocaleString()} open ${questions === 1 ? "question" : "questions"}. ${costLine} Answers are AI-inferred and are labelled as such — they are not facts about the building.`
  };
}

function normaliseRawIfcType(raw, fallbackName) {
  const t = (raw || "").trim();
  if (!t) return fallbackName || "IfcBuildingElementProxy";
  if (/^Ifc[A-Z]/.test(t)) return t;
  const up = t.toUpperCase();
  if (!up.startsWith("IFC")) return t;
  return "Ifc" + up.slice(3).charAt(0) + up.slice(4).toLowerCase();
}
function adaptImportedModel(model) {
  const elements = model.elements.map((r) => {
    const cls = normaliseRawIfcType(r.rawIfcType, r.ifcTypeName);
    const spatial = [
      { level: "building", id: model.modelId, name: model.modelName },
      { level: "storey", id: `${model.modelId}:${r.storeyExpressID}`, name: r.storeyName || "Unassigned" }
    ];
    return {
      id: r.id,
      name: r.name,
      origin: "imported",
      // The file's own class is authoritative for imported content. It is NOT
      // routed through the PRYZM authority — that maps PRYZM types, not IFC.
      ifcClass: { status: "mapped", ifcClass: cls, authority: "C25§2" },
      spatial,
      storey: r.storeyName ? authored(r.storeyName) : NOT_AUTHORED,
      material: NOT_EXTRACTED(
        "IfcElementRecord has no material field; IfcRelAssociatesMaterial is not parsed."
      ),
      system: NOT_EXTRACTED(
        "IfcElementRecord has no system field; IfcSystem membership is not parsed."
      ),
      globalId: NOT_EXTRACTED(
        `IfcElementRecord carries expressID (${r.expressID}), not the IFC GlobalId string.`
      ),
      psets: r.psets ?? {}
    };
  });
  return {
    origin: "imported",
    label: model.modelName || "Imported IFC",
    capability: IMPORTED_CAPABILITY,
    elements
  };
}
const NO_HOST_INDEX = Object.freeze({
  resolveWallLevel: () => ({ kind: "no-host" })
});
const HOST_DERIVED_STOREY_TYPES = /* @__PURE__ */ new Set(["door", "window"]);
function adaptNativeElements(elements, projectName = "PRYZM model", hosts = NO_HOST_INDEX) {
  const adapted = elements.map((e) => {
    const spatial = [{ level: "project", id: "project", name: projectName }];
    let storey;
    let storeyRung = null;
    if (e.levelId) {
      const name = e.levelName || e.levelId;
      storey = authored(name);
      storeyRung = { level: "storey", id: e.levelId, name };
    } else if (HOST_DERIVED_STOREY_TYPES.has(e.type)) {
      const r = hosts.resolveWallLevel(e.wallId);
      if (r.kind === "resolved") {
        storey = derived(r.levelName, `host wall ${e.wallId}`);
        storeyRung = { level: "storey", id: r.levelId, name: r.levelName };
      } else if (r.kind === "host-has-no-level") {
        storey = unresolved(
          `host wall ${r.hostId} carries no levelId — the wall is the defect, not this ${e.type}`
        );
      } else {
        storey = unresolved(
          e.wallId ? `host wall ${e.wallId} is not in the wall store` : `this ${e.type} carries no wallId, so its host is unknown`
        );
      }
    } else {
      storey = NOT_AUTHORED;
    }
    if (storeyRung) spatial.push(storeyRung);
    const parts = [];
    if (e.frameMaterial) parts.push({ part: "frame", value: e.frameMaterial });
    if (e.leafMaterial) parts.push({ part: "leaf", value: e.leafMaterial });
    const material = e.material ? authored(e.material) : parts.length > 0 ? perPart(parts) : NOT_AUTHORED;
    return {
      id: e.id,
      name: e.name || `${e.type} ${e.id}`,
      origin: "native",
      ifcClass: resolveIfcClass(e.type),
      spatial,
      storey,
      material,
      system: NOT_AUTHORED,
      globalId: e.ifcData?.guid ? authored(e.ifcData.guid) : NOT_AUTHORED,
      psets: e.psets ?? {}
    };
  });
  return {
    origin: "native",
    label: projectName,
    capability: NATIVE_CAPABILITY,
    elements: adapted
  };
}

const CSS_ID = "pryzm-ifc-tree-styles";
const CSS = `
.ifct-toggle{display:inline-flex;gap:2px;padding:2px;background:var(--app-on-accent-veil,rgba(255,255,255,.18));border-radius:20px}
.ifct-toggle-btn{padding:3px 10px;border:none;border-radius:18px;background:transparent;color:var(--app-on-accent-dim,rgba(255,255,255,.9));font-size:10px;font-weight:600;letter-spacing:.04em;cursor:pointer;white-space:nowrap;font-family:inherit}
.ifct-toggle-btn:hover{background:var(--app-on-accent-veil-hover,rgba(255,255,255,.3));color:var(--app-on-accent,#fff)}
.ifct-toggle-btn--active{background:var(--app-panel-bg,#fff);color:var(--app-accent,#6600FF)}
.ifct-root{display:flex;flex-direction:column;gap:8px;font-size:11px;color:var(--app-text-2,#5a6a85)}
.ifct-groupbar{display:flex;flex-wrap:wrap;gap:3px;padding:6px 2px}
.ifct-groupbar-btn{padding:3px 9px;border:1px solid var(--app-border,#e3e8f0);border-radius:14px;background:var(--app-panel-bg,#fff);color:var(--app-text-2,#5a6a85);font-size:10px;font-weight:500;cursor:pointer;font-family:inherit}
.ifct-groupbar-btn:hover{border-color:var(--app-accent,#6600FF);color:var(--app-accent,#6600FF);background:var(--app-violet-soft,rgba(102,0,255,.08))}
.ifct-groupbar-btn--active{background:var(--app-gradient,linear-gradient(135deg,#8B5CF6 0%,#6600FF 100%));color:#fff;border-color:transparent}
.ifct-empty{padding:14px 12px;border:1px dashed var(--app-border,#e3e8f0);border-radius:8px;background:var(--app-violet-soft,rgba(102,0,255,.05));line-height:1.5}
.ifct-empty-cause{display:inline-block;margin-bottom:5px;padding:1px 7px;border-radius:10px;background:var(--app-accent,#6600FF);color:#fff;font-size:9px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
.ifct-note{padding:7px 10px;border-left:2px solid var(--app-accent,#6600FF);background:var(--app-violet-soft,rgba(102,0,255,.05));border-radius:0 6px 6px 0;line-height:1.5;font-size:10px}
.ifct-rows{max-height:320px;overflow-y:auto;overflow-x:hidden}
.ifct-row{display:flex;align-items:center;gap:5px;padding:3px 6px;border-radius:5px;cursor:pointer;white-space:nowrap}
.ifct-row:hover{background:var(--app-violet-soft,rgba(102,0,255,.08))}
.ifct-row--group{font-weight:600;color:var(--app-text-1,#2d3a4f)}
.ifct-row--deficit{color:var(--app-accent,#6600FF)}
.ifct-count{margin-left:auto;padding:0 6px;border-radius:9px;background:var(--app-violet-soft,rgba(102,0,255,.1));color:var(--app-accent,#6600FF);font-size:9px;font-weight:700}
.ifct-label{overflow:hidden;text-overflow:ellipsis}
.ifct-story{margin-top:6px;padding:11px;border:1px solid var(--app-border,#e3e8f0);border-radius:9px;background:var(--app-panel-bg,#fff)}
.ifct-story-name{font-size:12px;font-weight:700;color:var(--app-text-1,#2d3a4f);margin-bottom:2px}
.ifct-story-sub{font-size:10px;color:var(--app-accent,#6600FF);font-weight:600;margin-bottom:8px}
.ifct-frac{display:inline-block;padding:2px 9px;border-radius:11px;background:var(--app-gradient,linear-gradient(135deg,#8B5CF6 0%,#6600FF 100%));color:#fff;font-size:10px;font-weight:700}
.ifct-slot{padding:7px 0;border-top:1px solid var(--app-border,#eef1f6)}
.ifct-slot-label{font-size:10px;font-weight:700;color:var(--app-text-1,#2d3a4f);letter-spacing:.02em}
.ifct-slot-text{margin-top:2px;line-height:1.5}
.ifct-slot-unknown{margin-top:2px;line-height:1.5;font-style:italic}
.ifct-chip{display:inline-block;margin-top:4px;margin-right:4px;padding:1px 7px;border-radius:9px;font-size:9px;font-weight:600}
.ifct-chip--model{background:var(--app-violet-soft,rgba(102,0,255,.1));color:var(--app-accent,#6600FF)}
.ifct-chip--mapping{background:rgba(139,92,246,.12);color:#7B3FF2}
.ifct-chip--user{background:rgba(102,0,255,.08);color:var(--app-accent,#6600FF)}
.ifct-chip--ai{background:#FFF4E5;color:#B45309;border:1px solid #FDBA74}
.ifct-chip--unknown{background:var(--app-surface-2,#f4f6fa);color:var(--app-text-3,#8794aa)}
.ifct-ask{margin-top:9px;padding:8px;border-radius:7px;background:var(--app-surface-2,#f7f8fb);font-size:10px;line-height:1.5}
.ifct-ask-disabled{color:var(--app-text-3,#8794aa)}
`;
function ensureStyles(doc) {
  if (doc.getElementById(CSS_ID)) return;
  const s = doc.createElement("style");
  s.id = CSS_ID;
  s.textContent = CSS;
  doc.head.appendChild(s);
}
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== void 0) n.textContent = text;
  return n;
}
function createTreeToggle(initial, onChange) {
  const root = el("div", "ifct-toggle");
  root.setAttribute("role", "tablist");
  root.setAttribute("aria-label", "Tree source");
  const mk = (mode, label) => {
    const b2 = document.createElement("button");
    b2.type = "button";
    b2.className = "ifct-toggle-btn";
    b2.textContent = label;
    b2.dataset.mode = mode;
    b2.setAttribute("role", "tab");
    b2.title = mode === "pryzm" ? "PRYZM project browser" : "IFC primitive tree";
    b2.addEventListener("click", () => {
      setMode(mode);
      onChange(mode);
    });
    return b2;
  };
  const a = mk("pryzm", "PRYZM tree");
  const b = mk("ifc", "IFC tree");
  root.append(a, b);
  function setMode(m) {
    for (const btn of [a, b]) {
      const on = btn.dataset.mode === m;
      btn.classList.toggle("ifct-toggle-btn--active", on);
      btn.setAttribute("aria-selected", String(on));
    }
  }
  setMode(initial);
  return { element: root, setMode };
}
function createIfcTreeView(deps) {
  ensureStyles(document);
  const root = el("div", "ifct-root");
  const groupBar = el("div", "ifct-groupbar");
  const body = el("div");
  const storyHost = el("div");
  root.append(groupBar, body, storyHost);
  let sources = [];
  let activeGrouping = "spatial";
  let expanded = /* @__PURE__ */ new Set();
  let selectedId = null;
  let byId = /* @__PURE__ */ new Map();
  for (const g of GROUPINGS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "ifct-groupbar-btn";
    b.textContent = g.label;
    b.dataset.grouping = g.id;
    b.addEventListener("click", () => {
      activeGrouping = g.id;
      expanded = /* @__PURE__ */ new Set();
      render();
    });
    groupBar.appendChild(b);
  }
  function renderRow(r) {
    const row = el("div", "ifct-row");
    row.style.paddingLeft = `${6 + r.depth * 13}px`;
    if (r.kind === "group") row.classList.add("ifct-row--group");
    if (r.deficit) row.classList.add("ifct-row--deficit");
    if (r.kind === "group" && !r.id.endsWith("::more")) {
      row.appendChild(el("span", void 0, expanded.has(r.id) ? "▾" : "▸"));
    }
    row.appendChild(el("span", "ifct-label", r.label));
    if (r.count !== void 0) {
      row.appendChild(el("span", "ifct-count", r.count.toLocaleString()));
    }
    row.addEventListener("click", () => {
      if (r.kind === "element") {
        selectedId = r.id;
        deps.onSelect(r.id);
        renderStory();
      } else if (!r.id.endsWith("::more")) {
        if (expanded.has(r.id)) expanded.delete(r.id);
        else expanded.add(r.id);
        render();
      }
    });
    return row;
  }
  function renderGrouping(g) {
    body.replaceChildren();
    for (const btn of Array.from(groupBar.children)) {
      btn.classList.toggle("ifct-groupbar-btn--active", btn.dataset.grouping === activeGrouping);
    }
    if (g.coverage.kind === "empty") {
      const box = el("div", "ifct-empty");
      box.appendChild(el("span", "ifct-empty-cause", causeLabel(g.coverage.cause)));
      box.appendChild(el("div", void 0, g.coverage.message));
      body.appendChild(box);
      return;
    }
    const w = materialiseRows(g.groups, expanded, (id) => byId.get(id)?.name ?? id, g.totalElements);
    const rows = el("div", "ifct-rows");
    for (const r of w.rows) rows.appendChild(renderRow(r));
    body.appendChild(rows);
    if (g.coverage.limitNote) body.appendChild(el("div", "ifct-note", g.coverage.limitNote));
    if (w.notice) body.appendChild(el("div", "ifct-note", w.notice));
  }
  function causeLabel(c) {
    switch (c) {
      case "absent":
        return "none authored";
      case "not-extracted":
        return "not extracted by PRYZM";
      case "absent-or-not-extracted":
        return "two possible causes";
      default:
        return "no model";
    }
  }
  function renderSlot(s) {
    const box = el("div", "ifct-slot");
    box.appendChild(el("div", "ifct-slot-label", s.label));
    if (s.state === "answered") {
      box.appendChild(el("div", "ifct-slot-text", s.text));
      for (const p of s.provenance) {
        box.appendChild(el("span", `ifct-chip ifct-chip--${p.kind}`, p.detail ? `${p.chip} · ${p.detail}` : p.chip));
      }
    } else {
      box.appendChild(el("div", "ifct-slot-unknown", "Unknown"));
      box.appendChild(el("div", "ifct-slot-text", s.note));
      box.appendChild(el("span", "ifct-chip ifct-chip--unknown", s.reason.replace(/-/g, " ")));
    }
    return box;
  }
  function renderStory() {
    storyHost.replaceChildren();
    if (!selectedId) return;
    const element = byId.get(selectedId);
    if (!element) return;
    const story = buildElementStory(element);
    const card = el("div", "ifct-story");
    card.appendChild(el("div", "ifct-story-name", story.name));
    card.appendChild(el("div", "ifct-story-sub", story.classAndContainer));
    card.appendChild(el("span", "ifct-frac", story.completeness.headline));
    card.appendChild(el("div", "ifct-slot-text", story.oneLine));
    for (const s of story.slots) card.appendChild(renderSlot(s));
    const hk = el("div", "ifct-slot");
    hk.appendChild(el("div", "ifct-slot-label", "How we know"));
    hk.appendChild(el("div", "ifct-slot-text", story.howWeKnow.summary));
    card.appendChild(hk);
    if (element.material.kind === "authored") {
      card.appendChild(el("div", "ifct-note", MATERIAL_EXPORT_CAVEAT));
    }
    const open = openQuestions(story);
    const decision = gateBatch(
      open.map((slot) => ({ elementId: element.id, slots: [slot], grounding: {} })),
      null,
      deps.aiPort ?? null
    );
    const ask = el("div", "ifct-ask");
    if (decision.allowed) {
      ask.textContent = `Research the ${open.length} unknown${open.length === 1 ? "" : "s"} with AI — ${decision.confirmation}`;
    } else {
      ask.classList.add("ifct-ask-disabled");
      ask.textContent = decision.reason;
    }
    card.appendChild(ask);
    storyHost.appendChild(card);
  }
  function render() {
    renderGrouping(buildGrouping(activeGrouping, sources));
    renderStory();
  }
  return {
    element: root,
    setSources(next) {
      sources = next;
      byId = /* @__PURE__ */ new Map();
      for (const s of next) for (const e of s.elements) byId.set(e.id, e);
      render();
    },
    setSelection(id) {
      selectedId = id;
      renderStory();
    },
    dispose() {
      root.remove();
    }
  };
}

export { ANSWERABLE_SLOTS, EXPORT_PATH_CAVEAT, GROUPINGS, HOST_DERIVED_STOREY_TYPES, IFC_CLASS_AUTHORITY, IMPORTED_CAPABILITY, MATERIAL_EXPORT_CAVEAT, MAX_BATCH_ELEMENTS, MAX_MATERIALISED_ROWS, MAX_QUESTIONS_PER_ELEMENT, MAX_ROWS_PER_GROUP, NATIVE_CAPABILITY, NOT_AUTHORED, NOT_EXTRACTED, NO_HOST_INDEX, PROVENANCE_CHIP, PRYZM_IFC_INSPECTOR_TRACER, PsetEditorPanel, SLOT_LABELS, adaptImportedModel, adaptNativeElements, applyPsetUpdate, authored, authorityKeys, buildElementStory, buildGrouping, createIfcPanelContribution, createIfcTreeView, createTreeToggle, derived, emitPsetUpdateSpan, gateBatch, groupByClass, groupByMaterial, groupBySpatial, groupByStorey, groupBySystem, mappedIfcClasses, materialiseRows, normaliseRawIfcType, openQuestions, parsePsetUpdateCommand, perPart, resolveIfcClass, truncationNotice, unresolved, valueKind, withAiAnswers };
