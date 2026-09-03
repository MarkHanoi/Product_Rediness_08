import { dx as unknownProvenance, by as systemProvenance, dy as FamilyRequestSchema, ae as pointInPolygonXZ$1, dz as ProjectOrigin, dA as GrantConsentPayloadSchema, dB as RevokeConsentPayloadSchema, dC as PurgeUserConsentPayloadSchema, dD as RegisterIfcMetaPayloadSchema, dE as DeregisterIfcMetaPayloadSchema, dF as RecordArtefactPayloadSchema, dG as LinkElementPayloadSchema, dH as UpdateApprovalStatusPayloadSchema, dI as QueryByProjectPayloadSchema, dJ as BuildingCreatePayloadSchema, dK as BuildingSchema, dL as BuildingUpdatePayloadSchema, dM as BuildingDeletePayloadSchema, dN as LevelCreatePayloadSchema, dO as LevelSchema, dP as LevelUpdatePayloadSchema, dQ as LevelSetActivePayloadSchema, dR as LevelDeletePayloadSchema, dS as ApartmentCreatePayloadSchema, dT as ApartmentSchema, dU as ApartmentUpdatePayloadSchema, dV as ApartmentDeletePayloadSchema, dW as RoomCreatePayloadSchema, dX as RoomSchema, dY as RoomUpdatePayloadSchema, dZ as RoomDeletePayloadSchema, d_ as RoomAssignToApartmentPayloadSchema, d$ as WIND_ROSE_SECTOR_COUNT, e0 as ClimateDatasetSchema, e1 as NOAANormalSchema, e2 as ClimateIngestEpwPayloadSchema, e3 as ClimateRefreshNoaaPayloadSchema, e4 as ClimateEnsureForLocationPayloadSchema, R as quantiseToCacheKey, e5 as ClimateResolveSitePayloadSchema, e6 as ClimateInvalidateCachePayloadSchema, e7 as ClimateSolarSamplePayloadSchema, e8 as ClimateWindRosePayloadSchema, e9 as SiteCreatePayloadSchema, ea as SiteModelSchema, eb as SiteUpdateLocationPayloadSchema, ec as SiteSetParcelBoundaryPayloadSchema, ed as SiteUpdateZoningPayloadSchema, ee as SiteSetFootprintPayloadSchema, ef as SiteClearFootprintPayloadSchema, eg as SiteAddContextBuildingPayloadSchema, eh as SiteRemoveContextBuildingPayloadSchema, ei as SiteReplaceContextBuildingPayloadSchema, ej as SiteLinkClimatePayloadSchema, ek as SiteLinkBuildingPayloadSchema, el as SiteReplacePayloadSchema, em as SiteDeletePayloadSchema, en as InspectSelectionSchema, eo as DataFilterSchema, ep as DataSortSchema, eq as DataGroupBySchema, er as DrawingSetSchema, es as RevisionSchema, et as DrawingSetStatusSchema, T as Store } from './ElementStore-CQe7ZDFd.js';
export { eu as ApartmentParametersStore, ev as DimensionStore, ew as ElementStore, ex as IndexedDBStore, ey as LRUElementMap, ez as RoomParametersStore, ax as apartmentParametersStore, ay as roomParametersStore } from './ElementStore-CQe7ZDFd.js';
export { cj as AggregateRoomStore, ck as AiApprovalQueueStore, cl as ApartmentParameterPropagator, cm as ApartmentStore, cn as BuildingStore, co as ClimateStore, cp as DEFAULT_PENDING_TTL_MS, cq as FamilyRegistryStore, cr as IfcMetaStore, cs as LayoutOptionsStore, ct as LevelStore, cu as PROVENANCE_SLICE_VERSION, cv as ProvenanceStore, cj as RoomStore, cw as SiteModelStore, cx as approvalQueueBadgeCount, cy as buildCoreFamilySeeds } from './index-CtIMEkHY.js';
import './SteelProfileLibrary-NgbfwhrM.js';
import './LODManager-DHqndFcX.js';
export { A as AnnotationStore, C as CubeStore, S as SelectionStore, a as attachStores } from './attachStores-BMAC7-uX.js';
import './trace-api-BIfvUk_c.js';
import './three.core-Bv4ks8y-.js';
import './three.module-zvZFyv9V.js';
import './preload-helper-CJHylW7d.js';

function spatialRelationship(selection, location) {
  if (location.elementId === selection.id) return "SELECTED";
  const isChild = location.parentChain.some((a) => a.id === selection.id);
  if (isChild) return "CHILD";
  const isParent = selection.breadcrumb.some((a) => a.id === location.elementId);
  if (isParent) return "PARENT";
  const selParent = selection.breadcrumb[selection.breadcrumb.length - 1];
  const elemParent = location.parentChain[location.parentChain.length - 1];
  if (selParent && elemParent && selParent.id === elemParent.id) {
    return "SIBLING";
  }
  return "UNRELATED";
}
function tierFor(rel, opts) {
  switch (rel) {
    case "SELECTED":
      return { tier: "FULL" };
    case "CHILD":
      return { tier: "FULL" };
    case "PARENT":
      return { tier: "DIMMED", opacity: opts.opacityForParent ?? 0.7 };
    case "SIBLING":
      return { tier: "DIMMED", opacity: opts.opacityForSibling ?? 0.2 };
    case "UNRELATED":
      if (opts.hideUnrelated) return { tier: "HIDDEN" };
      return { tier: "DIMMED", opacity: opts.opacityForUnrelated ?? 0.1 };
  }
}
function buildIsolationIntent(selection, elements, opts = {}) {
  const out = /* @__PURE__ */ new Map();
  for (const loc of elements) {
    const rel = spatialRelationship(selection, loc);
    const { tier, opacity } = tierFor(rel, opts);
    out.set(
      loc.elementId,
      opacity !== void 0 ? { elementId: loc.elementId, tier, opacity } : { elementId: loc.elementId, tier }
    );
  }
  return out;
}

const KNOWN_OCCUPANCIES = /* @__PURE__ */ new Set([
  "master",
  "bedroom",
  "living",
  "living_room",
  "kitchen",
  "dining",
  "bathroom",
  "wc",
  "corridor",
  "storage",
  "balcony",
  "study",
  "ensuite"
]);
function normaliseOccupancyCandidate(name) {
  return name.trim().toLowerCase().replace(/[\s-]+/g, "_");
}
function deriveOccupancy(definition) {
  for (const raw of definition.ai.semanticNames) {
    const candidate = normaliseOccupancyCandidate(raw);
    if (KNOWN_OCCUPANCIES.has(candidate)) {
      return candidate;
    }
  }
  return "general";
}
function deriveTags(definition, occupancy) {
  const collected = /* @__PURE__ */ new Set();
  for (const name of definition.ai.semanticNames) {
    const trimmed = name.trim().toLowerCase();
    if (trimmed.length > 0) {
      collected.add(trimmed);
    }
  }
  collected.add(definition.behaviour.mountClass);
  if (occupancy !== "general") {
    collected.add(occupancy);
  }
  return [...collected].sort();
}
function assembleRegisteredFamily(definition, parametric, geometry, schemas, opts = {}) {
  if (definition.identity.id !== parametric.identity.id) {
    throw new Error(
      `assembleRegisteredFamily: identity mismatch — definition.identity.id (${definition.identity.id}) !== parametric.identity.id (${parametric.identity.id})`
    );
  }
  if (definition.identity.id !== geometry.identity.id) {
    throw new Error(
      `assembleRegisteredFamily: identity mismatch — definition.identity.id (${definition.identity.id}) !== geometry.identity.id (${geometry.identity.id})`
    );
  }
  if (definition.identity.id !== schemas.identity.id) {
    throw new Error(
      `assembleRegisteredFamily: identity mismatch — definition.identity.id (${definition.identity.id}) !== schemas.identity.id (${schemas.identity.id})`
    );
  }
  const category = opts.category ?? "general";
  const mountClass = definition.behaviour.mountClass;
  const origin = opts.origin ?? "user";
  const originProvenance = opts.origin === void 0 ? unknownProvenance("producer-not-instrumented") : systemProvenance("observed", "stated by the caller via AssembleRegisteredFamilyOptions.origin");
  const occupancy = deriveOccupancy(definition);
  const archetypeHints = [
    {
      occupancy,
      anchor: definition.placement.defaultAnchor
      // group intentionally omitted — multi-occupancy / grouping is a
      // future slice; ArchetypeHintSchema.group is optional so the
      // emitted hint round-trips cleanly.
    }
  ];
  const ifcMapping = definition.bim;
  const identity = definition.identity;
  const schemaHash = `registered:${identity.id}|${identity.version}|${parametric.parametricHash}|${geometry.geometryHash}|${schemas.schemasHash}`;
  const tags = opts.tags ? [...new Set(opts.tags.map((t) => t.trim().toLowerCase()).filter((t) => t.length > 0))].sort() : deriveTags(definition, occupancy);
  return {
    identity,
    category,
    mountClass,
    origin,
    originProvenance,
    archetypeHints,
    ifcMapping,
    schemaHash,
    tags
  };
}

function fromRequest(request, opts = {}) {
  const ingestedAt = opts.ingestedAt ?? (/* @__PURE__ */ new Date()).toISOString();
  const canonicalSemanticNames = canonicaliseSemanticNames(request.ai.semanticNames);
  const { widthM, depthM, heightM } = request.geometry.dimensions;
  const footprintAreaM2 = widthM * depthM;
  const volumeM3 = footprintAreaM2 * heightM;
  const canonicalHash = computeCanonicalHash(request, canonicalSemanticNames);
  const derived = {
    canonicalSemanticNames,
    volumeM3,
    footprintAreaM2,
    canonicalHash,
    ingestedAt
  };
  return {
    identity: request.identity,
    documentation: request.documentation,
    geometry: request.geometry,
    behaviour: request.behaviour,
    constraints: request.constraints,
    placement: request.placement,
    bim: request.bim,
    ai: request.ai,
    derived
  };
}
function canonicaliseSemanticNames(names) {
  const normalised = names.map((n) => n.toLowerCase().trim()).filter((n) => n.length > 0);
  return [...new Set(normalised)].sort();
}
function computeCanonicalHash(request, canonicalNames) {
  const parts = [
    request.identity.id,
    request.identity.version,
    request.geometry.dimensions.widthM.toFixed(6),
    request.geometry.dimensions.depthM.toFixed(6),
    request.geometry.dimensions.heightM.toFixed(6),
    request.behaviour.mountClass,
    canonicalNames.join(",")
  ];
  return `def:${parts.join("|")}`;
}

function ingestFromJson(raw, opts = {}) {
  const safe = opts.safe !== false;
  if (safe) {
    const parsed = FamilyRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        issues: parsed.error.issues,
        message: `FamilyRequest validation failed: ${parsed.error.issues.length} issue(s)`
      };
    }
    return {
      ok: true,
      definition: fromRequest(parsed.data, opts.fromRequestOpts)
    };
  }
  const request = FamilyRequestSchema.parse(raw);
  return {
    ok: true,
    definition: fromRequest(request, opts.fromRequestOpts)
  };
}

const WIDTH_NAMES = ["width", "widthm", "w"];
const DEPTH_NAMES = ["depth", "depthm", "d"];
const HEIGHT_NAMES = ["height", "heightm", "h"];
function decomposeFamily(definition, opts = {}) {
  const decomposedAt = opts.decomposedAt ?? (/* @__PURE__ */ new Date()).toISOString();
  const primaryId = opts.primaryPrimitiveId ?? "p0";
  const materialSlot = opts.materialSlot ?? "default";
  const ranges = definition.geometry.parametricRanges;
  const parameters = {};
  for (const range of ranges) {
    parameters[range.name] = { range };
  }
  const { widthM, depthM, heightM } = definition.geometry.dimensions;
  const boxWidth = resolveAxis(ranges, WIDTH_NAMES, widthM);
  const boxDepth = resolveAxis(ranges, DEPTH_NAMES, depthM);
  const boxHeight = resolveAxis(ranges, HEIGHT_NAMES, heightM);
  const transform = {
    translate: { x: 0, y: 0, z: 0 },
    rotateDeg: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 }
  };
  const box = {
    id: primaryId,
    kind: "box",
    dimensions: { boxWidth, boxDepth, boxHeight },
    transform,
    materialSlot
  };
  const parametricHash = computeParametricHash(definition, primaryId, ranges, {
    boxWidth,
    boxDepth,
    boxHeight
  });
  return {
    identity: definition.identity,
    parameters,
    primitives: [box],
    parametricHash,
    decomposedAt
  };
}
function resolveAxis(ranges, candidates, fallback) {
  const candidateSet = new Set(candidates.map((c) => c.toLowerCase()));
  for (const range of ranges) {
    if (candidateSet.has(range.name.toLowerCase())) {
      return { paramName: range.name };
    }
  }
  return fallback;
}
function computeParametricHash(definition, primaryId, ranges, boxDims) {
  const sortedParamNames = ranges.map((r) => r.name).slice().sort();
  const parts = [
    definition.identity.id,
    definition.identity.version,
    primaryId,
    sortedParamNames.join(","),
    fingerprintValue(boxDims.boxWidth),
    fingerprintValue(boxDims.boxDepth),
    fingerprintValue(boxDims.boxHeight)
  ];
  return `parametric:${parts.join("|")}`;
}
function fingerprintValue(v) {
  return typeof v === "number" ? v.toFixed(6) : `@${v.paramName}`;
}

const DEFAULT_BUILDER_MODULE_PATH = "@pryzm/family-instance/parametric-builder";
const DEFAULT_PLAN_SYMBOL_MODULE_PATH = "@pryzm/family-instance/plan-symbol-builder";
function synthesiseGeometry(parametric, opts = {}) {
  if (parametric.primitives.length < 1) {
    throw new Error(
      "synthesiseGeometry: parametric.primitives must be non-empty (Stage-2 v1 always emits at least one primitive)."
    );
  }
  const identity = parametric.identity;
  const primary = parametric.primitives[0];
  const builderModulePath = opts.defaultBuilderModulePath ?? DEFAULT_BUILDER_MODULE_PATH;
  const planSymbolModulePath = opts.defaultPlanSymbolModulePath ?? DEFAULT_PLAN_SYMBOL_MODULE_PATH;
  const builder = buildBuilderRef(identity.id, identity.version, primary, builderModulePath);
  const planSymbol = buildPlanSymbolRef(primary, parametric, planSymbolModulePath);
  const footprint = buildFootprint(primary, parametric);
  const geometryHash = `geometry:${identity.id}|${identity.version}|${builder.builderHash}|${planSymbol.exportName}|${footprint.lengthM.toFixed(6)}x${footprint.depthM.toFixed(6)}`;
  const synthesisedAt = opts.synthesisedAt ?? (/* @__PURE__ */ new Date()).toISOString();
  return {
    identity,
    builder,
    planSymbol,
    footprint,
    geometryHash,
    synthesisedAt
  };
}
function capitalise(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function deriveBuilderKind(primitiveKind) {
  if (primitiveKind === "composite") {
    return "composite";
  }
  return "parametric";
}
function deriveBuilderExportName(primitiveKind) {
  if (primitiveKind === "composite") {
    return "buildComposite";
  }
  return `build${capitalise(primitiveKind)}`;
}
function derivePlanSymbolExportName(primitiveKind) {
  if (primitiveKind === "composite") {
    return "planSymbolComposite";
  }
  return `planSymbol${capitalise(primitiveKind)}`;
}
function buildBuilderRef(identityId, identityVersion, primary, modulePath) {
  const kind = deriveBuilderKind(primary.kind);
  const exportName = deriveBuilderExportName(primary.kind);
  const builderHash = `builder:${identityId}|${identityVersion}|${primary.kind}|${primary.id}`;
  return {
    kind,
    modulePath,
    exportName,
    builderHash
  };
}
function resolveDimension(primary, dimKey, parametric, defaultIfMissing) {
  const v = primary.dimensions[dimKey];
  if (v === void 0) {
    return defaultIfMissing;
  }
  if (typeof v === "number") {
    return v;
  }
  const param = parametric.parameters[v.paramName];
  if (param === void 0) {
    return defaultIfMissing;
  }
  return param.range.defaultValue;
}
function buildPlanSymbolRef(primary, parametric, modulePath) {
  const kind = primary.kind === "composite" ? "composite" : "parametric";
  const exportName = derivePlanSymbolExportName(primary.kind);
  let halfW;
  let halfD;
  if (primary.kind === "box") {
    const w = resolveDimension(primary, "boxWidth", parametric, 1);
    const d = resolveDimension(primary, "boxDepth", parametric, 1);
    halfW = w / 2;
    halfD = d / 2;
  } else {
    halfW = 0.5;
    halfD = 0.5;
  }
  return {
    kind,
    modulePath,
    exportName,
    bboxMinX: -halfW,
    bboxMinY: -halfD,
    bboxMaxX: halfW,
    bboxMaxY: halfD
  };
}
function buildFootprint(primary, parametric) {
  let lengthM;
  let depthM;
  if (primary.kind === "box") {
    const w = resolveDimension(primary, "boxWidth", parametric, 1);
    const d = resolveDimension(primary, "boxDepth", parametric, 1);
    lengthM = Math.max(w, d);
    depthM = Math.min(w, d);
  } else {
    lengthM = 1;
    depthM = 1;
  }
  return {
    lengthM,
    depthM,
    clearFrontM: 0,
    clearSideM: 0,
    clearBackM: 0,
    clearAboveM: 0,
    excludeDoorSwing: false
  };
}

function buildIdParameter() {
  return {
    name: "id",
    kind: "string",
    label: "ID",
    userEditable: false
  };
}
function capitaliseFirstLetter(name) {
  return name.charAt(0).toUpperCase() + name.slice(1);
}
function paramToInstanceSpec(name, parameter) {
  return {
    name,
    kind: "number",
    label: capitaliseFirstLetter(name),
    defaultValue: parameter.range.defaultValue,
    minNumber: parameter.range.min,
    maxNumber: parameter.range.max,
    userEditable: true
  };
}
function buildSpecHash(identityId, params) {
  const names = params.map((p) => p.name);
  const ranges = params.map(
    (p) => `${String(p.minNumber)}/${String(p.defaultValue)}/${String(p.maxNumber)}`
  );
  return `instance:${identityId}|${names.join(",")}|${ranges.join(",")}`;
}
function buildPayloadHash(command, identityId, instanceSpecHash) {
  if (command === "remove") {
    return `remove:${identityId}`;
  }
  return `${command}:${instanceSpecHash}`;
}
function synthesiseSchemas(parametric, geometry, opts = {}) {
  if (parametric.identity.id !== geometry.identity.id) {
    throw new Error(
      `synthesiseSchemas: identity mismatch — parametric.identity.id (${parametric.identity.id}) !== geometry.identity.id (${geometry.identity.id})`
    );
  }
  const identity = parametric.identity;
  const sortedEntries = Object.entries(parametric.parameters).slice().sort(([a], [b]) => a.localeCompare(b));
  const instanceParameters = sortedEntries.map(
    ([name, parameter]) => paramToInstanceSpec(name, parameter)
  );
  const specHash = buildSpecHash(identity.id, instanceParameters);
  const instanceSchema = {
    parameters: instanceParameters,
    specHash
  };
  const idParam = buildIdParameter();
  const createPayload = {
    command: "create",
    parameters: [idParam, ...instanceParameters],
    payloadHash: buildPayloadHash("create", identity.id, specHash)
  };
  const updatePayload = {
    command: "update",
    parameters: [idParam, ...instanceParameters],
    payloadHash: buildPayloadHash("update", identity.id, specHash)
  };
  const removePayload = {
    command: "remove",
    parameters: [idParam],
    payloadHash: buildPayloadHash("remove", identity.id, specHash)
  };
  const commandPayloads = {
    create: createPayload,
    update: updatePayload,
    remove: removePayload
  };
  const schemasHash = `schemas:${identity.id}|${identity.version}|${specHash}|${createPayload.payloadHash}|${updatePayload.payloadHash}|${removePayload.payloadHash}`;
  const synthesisedAt = opts.synthesisedAt ?? (/* @__PURE__ */ new Date()).toISOString();
  return {
    identity,
    instanceSchema,
    commandPayloads,
    schemasHash,
    synthesisedAt
  };
}

function runFamilyPipeline(raw, opts = {}) {
  const ingestion = ingestFromJson(raw, opts.ingest);
  if (!ingestion.ok) {
    return ingestion;
  }
  const definition = ingestion.definition;
  const parametric = decomposeFamily(definition, opts.decompose);
  const geometry = synthesiseGeometry(parametric, opts.synthesiseGeometry);
  const schemas = synthesiseSchemas(parametric, geometry, opts.synthesiseSchemas);
  const registered = assembleRegisteredFamily(
    definition,
    parametric,
    geometry,
    schemas,
    opts.assemble
  );
  const stages = Object.freeze({
    definition,
    parametric,
    geometry,
    schemas
  });
  return Object.freeze({
    ok: true,
    registered,
    stages
  });
}
function isPipelineSuccess(o) {
  return o.ok === true;
}

class SiteQueryService {
  _provider = () => null;
  setSiteProvider(provider) {
    this._provider = provider;
  }
  _site() {
    try {
      return this._provider() ?? null;
    } catch {
      return null;
    }
  }
  /** Latitude/longitude/true-north, or null when no site is captured. */
  getLocation() {
    const loc = this._site()?.location;
    if (!loc || typeof loc.latitude !== "number" || typeof loc.longitude !== "number") return null;
    return { latitude: loc.latitude, longitude: loc.longitude, trueNorth: loc.trueNorth ?? 0 };
  }
  /** Project→true-north θ in radians; 0 when no site (the frame default). */
  getTrueNorth() {
    return this._site()?.location?.trueNorth ?? 0;
  }
  /** The legal parcel outline (scene-XZ), or null. */
  getParcelBoundary() {
    const poly = this._site()?.parcel?.boundary?.polygon;
    return Array.isArray(poly) && poly.length >= 3 ? poly : null;
  }
  /** The PERSISTED buildable-envelope ring, or null when none was computed.
   *  Deliberately a separate accessor from the footprint: "no ring" and
   *  "ring = parcel" are different facts. */
  getBuildableRing() {
    const ring = this._site()?.parcel?.buildableRing;
    return Array.isArray(ring) && ring.length >= 3 ? ring : null;
  }
  /** What may be built: the ring when persisted, else the raw parcel —
   *  labelled with its source. Null when neither exists. */
  getBuildableFootprint() {
    const ring = this.getBuildableRing();
    if (ring) return { polygon: ring, source: "envelope" };
    const parcel = this.getParcelBoundary();
    if (parcel) return { polygon: parcel, source: "parcel" };
    return null;
  }
  /** Setbacks with the ADR-0270 null-semantics intact (null ≠ 0). */
  getSetbacks() {
    const s = this._site()?.parcel?.setbacks;
    if (!s) return null;
    return { front: s.front ?? null, side: s.side ?? null, rear: s.rear ?? null };
  }
  /** The recorded height cap in metres, or null when none is recorded
   *  ("no cap recorded" is NOT "no limit exists"). */
  getMaxHeightM() {
    const h = this._site()?.parcel?.maxHeight;
    return typeof h === "number" && Number.isFinite(h) ? h : null;
  }
  /**
   * Is the XZ point inside the buildable footprint (ring-first)?
   * Returns null when there is no footprint at all — "unknown" must never
   * collapse into "outside" (§CONTEXT-DATA-HONESTY).
   */
  containsPointXZ(point) {
    const fp = this.getBuildableFootprint();
    if (!fp) return null;
    return pointInPolygonXZ(point, fp.polygon);
  }
}
function pointInPolygonXZ(p, polygon) {
  return pointInPolygonXZ$1(p.x, p.z, polygon);
}
const siteQueryService = new SiteQueryService();

const PROJECT_ORIGIN_ID = "projectOrigin_00000000000000000000000000";
function _seedOrigin() {
  return ProjectOrigin.parse({ id: PROJECT_ORIGIN_ID });
}
class ProjectOriginStore {
  _origin = _seedOrigin();
  _listeners = /* @__PURE__ */ new Set();
  _disposed = false;
  // ── Read API ───────────────────────────────────────────────────────────
  /** The singleton ProjectOrigin (always present — the datum never disappears). */
  getOrigin() {
    return this._origin;
  }
  /**
   * Panel-shaped read: the singleton as a one-element array, each decorated
   * with `name` (= label). Consumed by the View-Intent panel's
   * `getCategoryElements('Project Origin')`, mirroring `window.<x>Store.getAll()`.
   */
  getAll() {
    return [{ ...this._origin, name: this._origin.label }];
  }
  /** Whether the origin marker is currently shown (View-Intent, default true). */
  isVisible() {
    return this._origin.visible;
  }
  // ── Write API (driven by projectOrigin.* commands, P6) ───────────────────
  /**
   * Reposition the shared-coordinate datum. Fires listeners (→ marker moves).
   * No-op after dispose.
   */
  setPosition(position) {
    if (this._disposed) {
      console.warn("[ProjectOriginStore] setPosition() after dispose — ignored");
      return;
    }
    this._origin = ProjectOrigin.parse({ ...this._origin, position });
    this._notify();
  }
  /**
   * Toggle the origin's View-Intent visibility. Fires listeners (→ marker
   * shows/hides). No-op after dispose.
   */
  setVisible(visible) {
    if (this._disposed) {
      console.warn("[ProjectOriginStore] setVisible() after dispose — ignored");
      return;
    }
    if (this._origin.visible === visible) return;
    this._origin = ProjectOrigin.parse({ ...this._origin, visible });
    this._notify();
  }
  // ── Persistence ──────────────────────────────────────────────────────────
  /** Serialise the singleton for the project snapshot. */
  serialize() {
    return { ...this._origin };
  }
  /**
   * Restore from a project snapshot. Invalid input re-seeds the default at
   * world origin (the datum always exists). Fires listeners.
   */
  deserialize(data) {
    if (this._disposed) return;
    if (!data || typeof data !== "object") {
      this._origin = _seedOrigin();
      this._notify();
      return;
    }
    const parsed = ProjectOrigin.safeParse({ ...data, id: PROJECT_ORIGIN_ID });
    this._origin = parsed.success ? parsed.data : _seedOrigin();
    this._notify();
  }
  /**
   * Project-switch reset hook — re-seeds the singleton at world origin so a
   * Project A datum never leaks into Project B. The origin is NEVER absent.
   */
  reset() {
    if (this._disposed) return;
    this._origin = _seedOrigin();
    this._notify();
  }
  // ── Subscription / lifecycle ───────────────────────────────────────────
  /** Subscribe to coarse mutation notifications. Returns an idempotent disposer. */
  subscribe(listener) {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }
  /** Idempotent. Clears listeners and freezes future mutations into no-ops. */
  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this._listeners.clear();
  }
  _notify() {
    for (const l of this._listeners) {
      try {
        l();
      } catch (e) {
        console.warn("[ProjectOriginStore] listener threw:", e);
      }
    }
  }
}
const projectOriginStore = new ProjectOriginStore();

function rowKey(c) {
  return `${c.userId}::${c.purpose}::${c.version}`;
}
class ConsentStore {
  _byKey = /* @__PURE__ */ new Map();
  _listeners = /* @__PURE__ */ new Set();
  _disposed = false;
  // ── Read API ───────────────────────────────────────────────────────────
  /** Lookup a specific consent row by user + purpose + version. */
  get(userId, purpose, version) {
    return this._byKey.get(`${userId}::${purpose}::${version}`);
  }
  /**
   * Returns the CURRENTLY-ACTIVE consent for `(userId, purpose)` — the
   * row whose `revokedAt === null`. If multiple active rows exist
   * (latest grant wins), the one with the latest `grantedAt` is
   * returned. Returns undefined when the user has never consented to
   * this purpose, or has revoked every version.
   */
  activeFor(userId, purpose) {
    let best;
    for (const c of this._byKey.values()) {
      if (c.userId !== userId) continue;
      if (c.purpose !== purpose) continue;
      if (c.revokedAt !== null) continue;
      if (!best || c.grantedAt > best.grantedAt) best = c;
    }
    return best;
  }
  /** True iff there is an active consent row for `(userId, purpose)`. */
  isConsented(userId, purpose) {
    return this.activeFor(userId, purpose) !== void 0;
  }
  /** Every consent row (active + historical) for a user. */
  listForUser(userId) {
    const out = [];
    for (const c of this._byKey.values()) {
      if (c.userId === userId) out.push(c);
    }
    return out.sort(
      (a, b) => a.grantedAt < b.grantedAt ? -1 : a.grantedAt > b.grantedAt ? 1 : 0
    );
  }
  /** Every active (non-revoked) consent for a user. */
  activeForUser(userId) {
    return this.listForUser(userId).filter((c) => c.revokedAt === null);
  }
  /** Snapshot count of all stored rows. */
  size() {
    return this._byKey.size;
  }
  // ── Write API ──────────────────────────────────────────────────────────
  /**
   * Grant or update a consent row. The key is `(userId, purpose, version)`;
   * granting an identical-version row is a no-op (idempotent), granting
   * a NEW version supersedes prior active versions of the same purpose
   * — those prior rows are auto-flipped to `revokedAt: grantedAt` so
   * the audit history is preserved.
   *
   * Returns the rows that were superseded (so the L3 retention
   * scheduler can fire the 'consent-revoke' purge for them).
   */
  grant(consent) {
    if (this._disposed) {
      console.warn("[ConsentStore] grant() after dispose — ignored");
      return [];
    }
    const key = rowKey(consent);
    const existing = this._byKey.get(key);
    if (existing && existing.grantedAt === consent.grantedAt && existing.revokedAt === consent.revokedAt) {
      return [];
    }
    const superseded = [];
    for (const [k, c] of this._byKey) {
      if (c.userId !== consent.userId) continue;
      if (c.purpose !== consent.purpose) continue;
      if (c.version === consent.version) continue;
      if (c.revokedAt !== null) continue;
      const revokedRow = { ...c, revokedAt: consent.grantedAt };
      this._byKey.set(k, revokedRow);
      superseded.push(revokedRow);
    }
    this._byKey.set(key, consent);
    this._notify();
    return superseded;
  }
  /**
   * Revoke the active consent for `(userId, purpose)`. If no active
   * consent exists this is a no-op. Returns the revoked row (or
   * undefined when no-op).
   */
  revoke(userId, purpose, revokedAt) {
    if (this._disposed) {
      console.warn("[ConsentStore] revoke() after dispose — ignored");
      return void 0;
    }
    const active = this.activeFor(userId, purpose);
    if (!active) return void 0;
    const revoked = { ...active, revokedAt };
    this._byKey.set(rowKey(revoked), revoked);
    this._notify();
    return revoked;
  }
  /**
   * Hard-delete every consent row for a user — the GDPR Art. 17
   * "right to erasure" purge. ONLY callable from the DSAR worker.
   * Returns the count purged.
   */
  purgeUser(userId) {
    if (this._disposed) {
      console.warn("[ConsentStore] purgeUser() after dispose — ignored");
      return 0;
    }
    let purged = 0;
    for (const [k, c] of this._byKey) {
      if (c.userId === userId) {
        this._byKey.delete(k);
        purged++;
      }
    }
    if (purged > 0) this._notify();
    return purged;
  }
  /** Clear all rows — used by fixture tear-down. */
  reset() {
    if (this._disposed) return;
    if (this._byKey.size === 0) return;
    this._byKey.clear();
    this._notify();
  }
  // ── Subscription / lifecycle ───────────────────────────────────────────
  subscribe(listener) {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }
  /** Idempotent. Clears listeners + freezes writes. */
  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this._listeners.clear();
    this._byKey.clear();
  }
  _notify() {
    for (const l of this._listeners) {
      try {
        l();
      } catch (err) {
        console.warn("[ConsentStore] listener threw:", err);
      }
    }
  }
}

const DAY_MS = 864e5;
const MINUTE_MS = 6e4;
class RetentionScheduler {
  _policies = /* @__PURE__ */ new Map();
  _listeners = /* @__PURE__ */ new Set();
  _disposed = false;
  // ── Policy registry ──────────────────────────────────────────────────────
  /** Register (or replace) the policy governing a tier. */
  setPolicy(policy) {
    if (this._disposed) {
      console.warn("[RetentionScheduler] setPolicy() after dispose — ignored");
      return;
    }
    this._policies.set(policy.tier, policy);
    this._notify();
  }
  getPolicy(tier) {
    return this._policies.get(tier);
  }
  hasPolicy(tier) {
    return this._policies.has(tier);
  }
  /** All registered policies (insertion order). */
  policies() {
    return [...this._policies.values()];
  }
  // ── Pure decision helpers ─────────────────────────────────────────────────
  /** Epoch-ms at which a record of `tier` created at `createdAtMs` ages out. */
  expiryMs(tier, createdAtMs) {
    const policy = this._requirePolicy(tier);
    return createdAtMs + policy.maxDays * DAY_MS;
  }
  /** True iff the record has aged past its tier's `maxDays` ceiling at `nowMs`. */
  isExpired(record, nowMs) {
    return nowMs >= this.expiryMs(record.tier, record.createdAtMs);
  }
  /**
   * The early-purge trigger that forces this record's purge, or null. A trigger
   * counts only when it is BOTH pending on the record AND listed in the tier
   * policy's `earlyPurgeTriggers`. Deterministic order: the first policy-listed
   * trigger that is pending (policy order wins, so the reason is stable).
   */
  firingTrigger(record) {
    if (!record.pendingTriggers || record.pendingTriggers.length === 0) return null;
    const policy = this._requirePolicy(record.tier);
    const pending = new Set(record.pendingTriggers);
    for (const t of policy.earlyPurgeTriggers) {
      if (pending.has(t)) return t;
    }
    return null;
  }
  /**
   * Whole `sweepIntervalMinutes` windows elapsed since the record aged out, at
   * `nowMs`. 0 when not yet expired or expired within the current window;
   * ≥ 3 is the [C22 §1.10] Sev-2 "missed three sweeps" condition. Surfaced so
   * the worker (A.30.d) can raise the alert without re-deriving the math.
   */
  overdueSweeps(record, nowMs) {
    const policy = this._requirePolicy(record.tier);
    const expiry = this.expiryMs(record.tier, record.createdAtMs);
    if (nowMs < expiry) return 0;
    const windowMs = policy.sweepIntervalMinutes * MINUTE_MS;
    if (windowMs <= 0) return 0;
    return Math.floor((nowMs - expiry) / windowMs);
  }
  /**
   * Plan one tier's sweep at `nowMs`. A record is due when it has aged past the
   * ceiling OR carries a policy-listed early-purge trigger; a trigger-driven
   * purge takes precedence as the stated reason (it is the more specific cause).
   * Records of other tiers are ignored. Pure + deterministic — same inputs
   * always yield the same plan, in input order.
   */
  planSweep(tier, records, nowMs) {
    this._requirePolicy(tier);
    const due = [];
    for (const r of records) {
      if (r.tier !== tier) continue;
      const trigger = this.firingTrigger(r);
      const expired = this.isExpired(r, nowMs);
      if (!trigger && !expired) continue;
      due.push({
        id: r.id,
        reason: trigger ?? "max-retention",
        overdueSweeps: trigger ? 0 : this.overdueSweeps(r, nowMs)
      });
    }
    return { tier, nowMs, due };
  }
  /** Epoch-ms the next sweep for `tier` is due, given the last sweep time. */
  nextSweepDueMs(tier, lastSweepMs) {
    const policy = this._requirePolicy(tier);
    return lastSweepMs + policy.sweepIntervalMinutes * MINUTE_MS;
  }
  // ── Lifecycle ──────────────────────────────────────────────────────────────
  subscribe(listener) {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }
  /** Clear the policy table — fixture tear-down. */
  reset() {
    if (this._disposed) return;
    if (this._policies.size === 0) return;
    this._policies.clear();
    this._notify();
  }
  /** Idempotent. Clears listeners + the policy table + freezes writes. */
  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this._listeners.clear();
    this._policies.clear();
  }
  _requirePolicy(tier) {
    const policy = this._policies.get(tier);
    if (!policy) {
      throw new Error(
        `[RetentionScheduler] no RetentionPolicy registered for tier='${tier}' — call setPolicy() before planning a sweep (every tier MUST have a policy per C22 §1.10).`
      );
    }
    return policy;
  }
  _notify() {
    for (const l of this._listeners) {
      try {
        l();
      } catch (err) {
        console.warn("[RetentionScheduler] listener threw:", err);
      }
    }
  }
}

function grantConsent(payload, store) {
  const parsed = GrantConsentPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(
      `consent.grant: invalid payload — ${parsed.error.message}`
    );
  }
  const consent = parsed.data;
  const superseded = store.grant(consent);
  return {
    ok: true,
    event: {
      type: "consent.granted",
      consent,
      supersededRows: superseded
    }
  };
}

function revokeConsent(payload, store) {
  const parsed = RevokeConsentPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(
      `consent.revoke: invalid payload — ${parsed.error.message}`
    );
  }
  const { userId, purpose, revokedAt } = parsed.data;
  const revoked = store.revoke(userId, purpose, revokedAt);
  if (!revoked) {
    return {
      ok: false,
      reason: "no-active-consent",
      message: `consent.revoke: no active '${purpose}' consent for user '${userId}'`
    };
  }
  return {
    ok: true,
    event: {
      type: "consent.revoked",
      consent: revoked
    }
  };
}

function purgeUserConsent(payload, store) {
  const parsed = PurgeUserConsentPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(
      `consent.purgeUser: invalid payload — ${parsed.error.message}`
    );
  }
  const { userId } = parsed.data;
  const rowCount = store.purgeUser(userId);
  return {
    ok: true,
    event: {
      type: "consent.user-purged",
      userId,
      rowCount
    }
  };
}

function registerIfcMeta(payload, store) {
  const parsed = RegisterIfcMetaPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(`ifc.meta.register: invalid payload — ${parsed.error.message}`);
  }
  const { elements } = parsed.data;
  store.addMany(elements);
  return {
    ok: true,
    event: {
      type: "ifc.meta-registered",
      count: elements.length,
      globalIds: elements.map((e) => e.globalId)
    }
  };
}

function deregisterIfcMeta(payload, store) {
  const parsed = DeregisterIfcMetaPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(`ifc.meta.deregister: invalid payload — ${parsed.error.message}`);
  }
  let removed = 0;
  for (const id of parsed.data.pryzmElementIds) {
    if (store.delete(id)) removed++;
  }
  return {
    ok: true,
    event: { type: "ifc.meta-deregistered", removed }
  };
}

function recordArtefact(payload, store) {
  const parsed = RecordArtefactPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(
      `ai.recordArtefact: invalid payload — ${parsed.error.message}`
    );
  }
  const artefact = parsed.data;
  const existingById = store.getArtefact(artefact.id);
  if (existingById) {
    if (existingById.idempotencyKey === artefact.idempotencyKey) {
      return {
        ok: true,
        event: {
          type: "ai.artefact-recorded",
          artefact: existingById,
          deduplicated: true
        }
      };
    }
    return {
      ok: false,
      reason: "duplicate-artefact-id",
      message: `ai.recordArtefact: artefact '${artefact.id}' already exists with a different idempotencyKey`
    };
  }
  for (const a of store.listArtefactsForProject(artefact.projectId)) {
    if (a.idempotencyKey === artefact.idempotencyKey) {
      return {
        ok: true,
        event: {
          type: "ai.artefact-recorded",
          artefact: a,
          deduplicated: true
        }
      };
    }
  }
  store.addArtefact(artefact);
  return {
    ok: true,
    event: {
      type: "ai.artefact-recorded",
      artefact,
      deduplicated: false
    }
  };
}

function linkElement(payload, store) {
  const parsed = LinkElementPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(
      `provenance.linkElement: invalid payload — ${parsed.error.message}`
    );
  }
  const { artefactId, elementIds } = parsed.data;
  const artefact = store.getArtefact(artefactId);
  if (!artefact) {
    return {
      ok: false,
      reason: "unknown-artefact",
      message: `provenance.linkElement: artefact '${artefactId}' not found`
    };
  }
  const existing = new Set(artefact.producedElementIds);
  const added = [];
  for (const elementId of elementIds) {
    if (existing.has(elementId)) continue;
    store.linkElement(artefactId, elementId);
    existing.add(elementId);
    added.push(elementId);
  }
  return {
    ok: true,
    event: {
      type: "provenance.element-linked",
      artefactId,
      addedElementIds: added
    }
  };
}

const LEGAL_TRANSITIONS = {
  pending: /* @__PURE__ */ new Set([
    "pending",
    "user-approved",
    "user-rejected",
    "never-applied"
  ]),
  "auto-applied": /* @__PURE__ */ new Set(["auto-applied"]),
  "user-approved": /* @__PURE__ */ new Set(["user-approved"]),
  "user-rejected": /* @__PURE__ */ new Set(["user-rejected"]),
  "never-applied": /* @__PURE__ */ new Set(["never-applied"])
};
function updateApprovalStatus(payload, store) {
  const parsed = UpdateApprovalStatusPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(
      `provenance.updateApprovalStatus: invalid payload — ${parsed.error.message}`
    );
  }
  const { artefactId, status } = parsed.data;
  const artefact = store.getArtefact(artefactId);
  if (!artefact) {
    return {
      ok: false,
      reason: "unknown-artefact",
      message: `provenance.updateApprovalStatus: artefact '${artefactId}' not found`
    };
  }
  const priorStatus = artefact.approvalStatus;
  const allowed = LEGAL_TRANSITIONS[priorStatus];
  if (!allowed.has(status)) {
    return {
      ok: false,
      reason: "invalid-payload",
      message: `provenance.updateApprovalStatus: illegal transition '${priorStatus}' → '${status}' (C23 §1.7)`
    };
  }
  if (priorStatus === status) {
    return {
      ok: true,
      event: {
        type: "provenance.approval-status-updated",
        artefactId,
        priorStatus,
        newStatus: status
      }
    };
  }
  store.updateApprovalStatus(artefactId, status);
  return {
    ok: true,
    event: {
      type: "provenance.approval-status-updated",
      artefactId,
      priorStatus,
      newStatus: status
    }
  };
}

function queryByProject(payload, store) {
  const parsed = QueryByProjectPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(
      `provenance.queryByProject: invalid payload — ${parsed.error.message}`
    );
  }
  const { projectId, from, to, workflowKinds } = parsed.data;
  const projectArtefacts = store.listArtefactsForProject(projectId);
  const workflowFilter = workflowKinds && workflowKinds.length > 0 ? new Set(workflowKinds) : null;
  const filtered = [];
  for (const a of projectArtefacts) {
    if (from && a.timestamp < from) continue;
    if (to && a.timestamp > to) continue;
    if (workflowFilter && !workflowFilter.has(a.workflowKind)) continue;
    filtered.push(a);
  }
  return {
    ok: true,
    event: {
      type: "provenance.query-result",
      projectId,
      rowCount: filtered.length,
      artefacts: filtered
    }
  };
}

function deterministicBuildingId(projectId) {
  return `bldg_${projectId}`;
}
function buildingCreate(rawPayload, store, now = () => (/* @__PURE__ */ new Date()).toISOString()) {
  let payload;
  try {
    payload = BuildingCreatePayloadSchema.parse(rawPayload);
  } catch (err) {
    return {
      ok: false,
      reason: "invalid-payload",
      message: `building.create payload invalid: ${err.message}`
    };
  }
  if (store.size() > 0) {
    return {
      ok: false,
      reason: "building-already-exists",
      message: `building.create: a Building already exists per [C20 §1.1] (single-Building rule; multi-Building deferred to C20.1)`
    };
  }
  const ts = now();
  const building = BuildingSchema.parse({
    id: deterministicBuildingId(payload.projectId),
    projectId: payload.projectId,
    name: payload.name,
    description: payload.description ?? "",
    ...payload.siteId ? { siteId: payload.siteId } : {},
    createdAt: ts,
    updatedAt: ts,
    ordinal: 0
  });
  store.add(building);
  return {
    ok: true,
    event: { type: "building.created", building }
  };
}

function buildingUpdate(rawPayload, store, now = () => (/* @__PURE__ */ new Date()).toISOString()) {
  let payload;
  try {
    payload = BuildingUpdatePayloadSchema.parse(rawPayload);
  } catch (err) {
    return {
      ok: false,
      reason: "invalid-payload",
      message: `building.update payload invalid: ${err.message}`
    };
  }
  const prior = store.get(payload.id);
  if (!prior) {
    return {
      ok: false,
      reason: "no-building",
      message: `building.update: no Building with id '${payload.id}'`
    };
  }
  if ("projectId" in payload.patch) {
    return {
      ok: false,
      reason: "cannot-change-projectId",
      message: `building.update: cannot change projectId per [C20 §1.1] (per-project isolation)`
    };
  }
  const patch = payload.patch;
  const nextRaw = { ...prior };
  if (patch.name !== void 0) nextRaw.name = patch.name;
  if (patch.description !== void 0) nextRaw.description = patch.description;
  if (patch.ordinal !== void 0) nextRaw.ordinal = patch.ordinal;
  if (patch.siteId !== void 0) {
    if (patch.siteId === null) delete nextRaw.siteId;
    else nextRaw.siteId = patch.siteId;
  }
  nextRaw.updatedAt = now();
  let next;
  try {
    next = BuildingSchema.parse(nextRaw);
  } catch (err) {
    return {
      ok: false,
      reason: "invalid-payload",
      message: `building.update: post-patch validation failed: ${err.message}`
    };
  }
  store.update(next);
  return {
    ok: true,
    event: { type: "building.updated", building: next, prior }
  };
}

function buildingDelete(rawPayload, _store) {
  try {
    BuildingDeletePayloadSchema.parse(rawPayload);
  } catch (err) {
    return {
      ok: false,
      reason: "invalid-payload",
      message: `building.delete payload invalid: ${err.message}`
    };
  }
  return {
    ok: false,
    reason: "forbidden-delete",
    message: `building.delete: FORBIDDEN per [C20 §1.1] — single-Building today (multi-Building deferred to C20.1 amendment)`
  };
}

let levelCounter = 0;
function mintLevelId(buildingId, levelNumber) {
  levelCounter += 1;
  const tag = levelNumber === 0 ? "g" : levelNumber > 0 ? `l${levelNumber}` : `b${Math.abs(levelNumber)}`;
  return `lvl_${buildingId}_${tag}_${levelCounter}`;
}
function checkMonotonic(existingLevels, newLevelNumber, newElevation) {
  const projected = [
    ...existingLevels.map((l) => ({
      levelNumber: l.levelNumber,
      elevation: l.elevation
    })),
    { levelNumber: newLevelNumber, elevation: newElevation }
  ];
  projected.sort((a, b) => a.levelNumber - b.levelNumber);
  for (let i = 1; i < projected.length; i++) {
    if (projected[i].elevation <= projected[i - 1].elevation) {
      return `monotonic violation: Level ${projected[i].levelNumber} (elev ${projected[i].elevation}) MUST be above Level ${projected[i - 1].levelNumber} (elev ${projected[i - 1].elevation})`;
    }
  }
  return null;
}
function levelCreate(rawPayload, buildingStore, levelStore, now = () => (/* @__PURE__ */ new Date()).toISOString()) {
  let payload;
  try {
    payload = LevelCreatePayloadSchema.parse(rawPayload);
  } catch (err) {
    return {
      ok: false,
      reason: "invalid-payload",
      message: `level.create payload invalid: ${err.message}`
    };
  }
  if (!buildingStore.has(payload.buildingId)) {
    return {
      ok: false,
      reason: "level-buildingId-mismatch",
      message: `level.create: no Building with id '${payload.buildingId}' (per [C20 §1.2] Level.buildingId MUST reference an existing Building)`
    };
  }
  const existing = levelStore.listForBuilding(
    payload.buildingId
  );
  if (existing.some((l) => l.levelNumber === payload.levelNumber)) {
    return {
      ok: false,
      reason: "level-number-conflict",
      message: `level.create: levelNumber ${payload.levelNumber} already exists in Building '${payload.buildingId}' per [C20 §1.2]`
    };
  }
  if (existing.some((l) => l.elevation === payload.elevation)) {
    return {
      ok: false,
      reason: "elevation-conflict",
      message: `level.create: elevation ${payload.elevation}m already exists in Building '${payload.buildingId}' per [C20 §1.2]`
    };
  }
  const monotonic = checkMonotonic(
    existing,
    payload.levelNumber,
    payload.elevation
  );
  if (monotonic) {
    return {
      ok: false,
      reason: "elevation-conflict",
      message: `level.create: ${monotonic}`
    };
  }
  const ts = now();
  const level = LevelSchema.parse({
    id: mintLevelId(payload.buildingId, payload.levelNumber),
    buildingId: payload.buildingId,
    name: payload.name,
    levelNumber: payload.levelNumber,
    elevation: payload.elevation,
    height: payload.height,
    isActive: payload.isActive ?? false,
    isReference: payload.isReference ?? false,
    createdAt: ts,
    updatedAt: ts
  });
  levelStore.add(level);
  return {
    ok: true,
    event: { type: "level.created", level }
  };
}

function checkMonotonicAfterPatch(others, levelNumber, elevation) {
  const projected = [
    ...others.map((l) => ({
      levelNumber: l.levelNumber,
      elevation: l.elevation
    })),
    { levelNumber, elevation }
  ];
  projected.sort((a, b) => a.levelNumber - b.levelNumber);
  for (let i = 1; i < projected.length; i++) {
    if (projected[i].elevation <= projected[i - 1].elevation) {
      return `monotonic violation: Level ${projected[i].levelNumber} (elev ${projected[i].elevation}) MUST be above Level ${projected[i - 1].levelNumber} (elev ${projected[i - 1].elevation})`;
    }
  }
  return null;
}
function levelUpdate(rawPayload, levelStore, now = () => (/* @__PURE__ */ new Date()).toISOString()) {
  let payload;
  try {
    payload = LevelUpdatePayloadSchema.parse(rawPayload);
  } catch (err) {
    return {
      ok: false,
      reason: "invalid-payload",
      message: `level.update payload invalid: ${err.message}`
    };
  }
  const prior = levelStore.get(payload.id);
  if (!prior) {
    return {
      ok: false,
      reason: "no-level",
      message: `level.update: no Level with id '${payload.id}'`
    };
  }
  if ("buildingId" in payload.patch) {
    return {
      ok: false,
      reason: "cannot-change-buildingId",
      message: `level.update: cannot change buildingId (delete + re-create the Level instead)`
    };
  }
  const patch = payload.patch;
  const nextRaw = { ...prior };
  if (patch.name !== void 0) nextRaw.name = patch.name;
  if (patch.levelNumber !== void 0) nextRaw.levelNumber = patch.levelNumber;
  if (patch.elevation !== void 0) nextRaw.elevation = patch.elevation;
  if (patch.height !== void 0) nextRaw.height = patch.height;
  if (patch.isActive !== void 0) nextRaw.isActive = patch.isActive;
  if (patch.isReference !== void 0) nextRaw.isReference = patch.isReference;
  nextRaw.updatedAt = now();
  let next;
  try {
    next = LevelSchema.parse(nextRaw);
  } catch (err) {
    return {
      ok: false,
      reason: "invalid-payload",
      message: `level.update: post-patch validation failed: ${err.message}`
    };
  }
  if (next.levelNumber !== prior.levelNumber || next.elevation !== prior.elevation) {
    const others = levelStore.listForBuilding(prior.buildingId).filter((l) => l.id !== prior.id);
    if (next.levelNumber !== prior.levelNumber && others.some((l) => l.levelNumber === next.levelNumber)) {
      return {
        ok: false,
        reason: "level-number-conflict",
        message: `level.update: levelNumber ${next.levelNumber} already exists in Building '${prior.buildingId}'`
      };
    }
    if (next.elevation !== prior.elevation && others.some((l) => l.elevation === next.elevation)) {
      return {
        ok: false,
        reason: "elevation-conflict",
        message: `level.update: elevation ${next.elevation}m already exists in Building '${prior.buildingId}'`
      };
    }
    const monotonic = checkMonotonicAfterPatch(
      others,
      next.levelNumber,
      next.elevation
    );
    if (monotonic) {
      return {
        ok: false,
        reason: "elevation-conflict",
        message: `level.update: ${monotonic}`
      };
    }
  }
  levelStore.update(next);
  return {
    ok: true,
    event: { type: "level.updated", level: next, prior }
  };
}

function levelSetActive(rawPayload, levelStore, now = () => (/* @__PURE__ */ new Date()).toISOString()) {
  let payload;
  try {
    payload = LevelSetActivePayloadSchema.parse(rawPayload);
  } catch (err) {
    return {
      ok: false,
      reason: "invalid-payload",
      message: `level.setActive payload invalid: ${err.message}`
    };
  }
  const target = levelStore.get(payload.id);
  if (!target) {
    return {
      ok: false,
      reason: "no-level",
      message: `level.setActive: no Level with id '${payload.id}'`
    };
  }
  const buildingLevels = levelStore.listForBuilding(
    target.buildingId
  );
  const priorActive = buildingLevels.find((l) => l.isActive);
  const ts = now();
  if (priorActive && priorActive.id !== target.id) {
    const cleared = {
      ...priorActive,
      isActive: false,
      updatedAt: ts
    };
    levelStore.update(cleared);
  }
  if (!target.isActive) {
    const activated = {
      ...target,
      isActive: true,
      updatedAt: ts
    };
    levelStore.update(activated);
  }
  return {
    ok: true,
    event: {
      type: "level.active-set",
      levelId: target.id,
      priorActiveId: priorActive && priorActive.id !== target.id ? priorActive.id : null
    }
  };
}

function levelDelete(rawPayload, levelStore, apartmentStore) {
  let payload;
  try {
    payload = LevelDeletePayloadSchema.parse(rawPayload);
  } catch (err) {
    return {
      ok: false,
      reason: "invalid-payload",
      message: `level.delete payload invalid: ${err.message}`
    };
  }
  const target = levelStore.get(payload.id);
  if (!target) {
    return {
      ok: false,
      reason: "no-level",
      message: `level.delete: no Level with id '${payload.id}'`
    };
  }
  const apartments = apartmentStore.listForLevel(target.id);
  if (apartments.length > 0) {
    return {
      ok: false,
      reason: "level-has-apartments",
      message: `level.delete: ${apartments.length} Apartment(s) still on Level '${target.id}' — cascade apartment.delete first per [C20 §1.9] (deepest-first deletion order)`
    };
  }
  void target.buildingId;
  levelStore.remove(target.id);
  return {
    ok: true,
    event: { type: "level.deleted", level: target }
  };
}

let apartmentCounter = 0;
function mintApartmentId(unitNumber) {
  apartmentCounter += 1;
  const slug = unitNumber.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  return `apt_${slug}_${apartmentCounter}`;
}
function apartmentCreate(rawPayload, levelStore, apartmentStore, now = () => (/* @__PURE__ */ new Date()).toISOString()) {
  let payload;
  try {
    payload = ApartmentCreatePayloadSchema.parse(rawPayload);
  } catch (err) {
    return {
      ok: false,
      reason: "invalid-payload",
      message: `apartment.create payload invalid: ${err.message}`
    };
  }
  const level = levelStore.get(payload.levelId);
  if (!level) {
    return {
      ok: false,
      reason: "no-level",
      message: `apartment.create: no Level with id '${payload.levelId}'`
    };
  }
  if (level.buildingId !== payload.buildingId) {
    return {
      ok: false,
      reason: "apartment-level-mismatch",
      message: `apartment.create: Level '${payload.levelId}' belongs to Building '${level.buildingId}', but payload.buildingId is '${payload.buildingId}'`
    };
  }
  if (apartmentStore.findByUnitNumber(
    payload.buildingId,
    payload.unitNumber
  )) {
    return {
      ok: false,
      reason: "unit-number-conflict",
      message: `apartment.create: unitNumber '${payload.unitNumber}' already exists in Building '${payload.buildingId}' per [C20 §1.3]`
    };
  }
  const apartmentId = mintApartmentId(payload.unitNumber);
  const paramsRaw = payload.parameters;
  const parameters = { ...paramsRaw ?? {}, id: apartmentId };
  const ts = now();
  let apartment;
  try {
    apartment = ApartmentSchema.parse({
      id: apartmentId,
      buildingId: payload.buildingId,
      levelId: payload.levelId,
      name: payload.name,
      unitNumber: payload.unitNumber,
      parameters,
      createdAt: ts,
      updatedAt: ts
    });
  } catch (err) {
    return {
      ok: false,
      reason: "invalid-payload",
      message: `apartment.create: SchemaParseFailed (likely parameters): ${err.message}`
    };
  }
  apartmentStore.add(apartment);
  return {
    ok: true,
    event: { type: "apartment.created", apartment }
  };
}

function apartmentUpdate(rawPayload, levelStore, apartmentStore, now = () => (/* @__PURE__ */ new Date()).toISOString()) {
  let payload;
  try {
    payload = ApartmentUpdatePayloadSchema.parse(rawPayload);
  } catch (err) {
    return {
      ok: false,
      reason: "invalid-payload",
      message: `apartment.update payload invalid: ${err.message}`
    };
  }
  const prior = apartmentStore.get(payload.id);
  if (!prior) {
    return {
      ok: false,
      reason: "no-apartment",
      message: `apartment.update: no Apartment with id '${payload.id}'`
    };
  }
  if (payload.patch.unitNumber !== void 0 && payload.patch.unitNumber !== prior.unitNumber) {
    const collision = apartmentStore.findByUnitNumber(
      prior.buildingId,
      payload.patch.unitNumber
    );
    if (collision && collision.id !== prior.id) {
      return {
        ok: false,
        reason: "unit-number-conflict",
        message: `apartment.update: unitNumber '${payload.patch.unitNumber}' already exists in Building '${prior.buildingId}'`
      };
    }
  }
  if (payload.patch.levelId !== void 0 && payload.patch.levelId !== prior.levelId) {
    const newLevel = levelStore.get(payload.patch.levelId);
    if (!newLevel) {
      return {
        ok: false,
        reason: "no-level",
        message: `apartment.update: new Level '${payload.patch.levelId}' does not exist`
      };
    }
    if (newLevel.buildingId !== prior.buildingId) {
      return {
        ok: false,
        reason: "apartment-level-mismatch",
        message: `apartment.update: new Level '${payload.patch.levelId}' belongs to Building '${newLevel.buildingId}', not '${prior.buildingId}'`
      };
    }
  }
  const nextRaw = { ...prior };
  if (payload.patch.name !== void 0) nextRaw.name = payload.patch.name;
  if (payload.patch.unitNumber !== void 0) {
    nextRaw.unitNumber = payload.patch.unitNumber;
  }
  if (payload.patch.levelId !== void 0) {
    nextRaw.levelId = payload.patch.levelId;
  }
  nextRaw.updatedAt = now();
  if (payload.parameterPatch !== void 0) {
    const paramsPatch = payload.parameterPatch;
    nextRaw.parameters = {
      ...prior.parameters,
      ...paramsPatch ?? {},
      id: prior.id
    };
  }
  let next;
  try {
    next = ApartmentSchema.parse(nextRaw);
  } catch (err) {
    return {
      ok: false,
      reason: "invalid-payload",
      message: `apartment.update: post-patch validation failed: ${err.message}`
    };
  }
  apartmentStore.update(next);
  return {
    ok: true,
    event: {
      type: "apartment.updated",
      apartment: next,
      prior
    }
  };
}

function apartmentDelete(rawPayload, apartmentStore, roomStore) {
  let payload;
  try {
    payload = ApartmentDeletePayloadSchema.parse(rawPayload);
  } catch (err) {
    return {
      ok: false,
      reason: "invalid-payload",
      message: `apartment.delete payload invalid: ${err.message}`
    };
  }
  const target = apartmentStore.get(payload.id);
  if (!target) {
    return {
      ok: false,
      reason: "no-apartment",
      message: `apartment.delete: no Apartment with id '${payload.id}'`
    };
  }
  const cascadedRoomCount = roomStore.removeForApartment(
    target.id
  );
  apartmentStore.remove(target.id);
  return {
    ok: true,
    event: {
      type: "apartment.deleted",
      apartment: target,
      cascadedRoomCount
    }
  };
}

let roomCounter = 0;
function mintRoomId(name) {
  roomCounter += 1;
  const slug = name.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  return `rm_${slug}_${roomCounter}`;
}
function roomCreate(rawPayload, levelStore, apartmentStore, roomStore, now = () => (/* @__PURE__ */ new Date()).toISOString()) {
  let payload;
  try {
    payload = RoomCreatePayloadSchema.parse(rawPayload);
  } catch (err) {
    return {
      ok: false,
      reason: "invalid-payload",
      message: `room.create payload invalid: ${err.message}`
    };
  }
  if (!levelStore.has(payload.levelId)) {
    return {
      ok: false,
      reason: "no-level",
      message: `room.create: no Level with id '${payload.levelId}'`
    };
  }
  const apt = apartmentStore.get(payload.apartmentId);
  if (!apt) {
    return {
      ok: false,
      reason: "no-apartment",
      message: `room.create: no Apartment with id '${payload.apartmentId}'`
    };
  }
  if (apt.levelId !== payload.levelId) {
    return {
      ok: false,
      reason: "apartment-level-mismatch",
      message: `room.create: Apartment '${payload.apartmentId}' is on Level '${apt.levelId}', not '${payload.levelId}' (per [C20 §1.4])`
    };
  }
  const roomId = mintRoomId(payload.name);
  const paramsRaw = payload.parameters;
  const parameters = {
    ...paramsRaw ?? {},
    id: roomId,
    apartmentId: payload.apartmentId,
    name: payload.name
  };
  const ts = now();
  let room;
  try {
    room = RoomSchema.parse({
      id: roomId,
      levelId: payload.levelId,
      apartmentId: payload.apartmentId,
      name: payload.name,
      parameters,
      createdAt: ts,
      updatedAt: ts
    });
  } catch (err) {
    return {
      ok: false,
      reason: "invalid-payload",
      message: `room.create: SchemaParseFailed (likely parameters): ${err.message}`
    };
  }
  roomStore.add(room);
  return {
    ok: true,
    event: { type: "room.created", room }
  };
}

function roomUpdate(rawPayload, levelStore, apartmentStore, roomStore, now = () => (/* @__PURE__ */ new Date()).toISOString()) {
  let payload;
  try {
    payload = RoomUpdatePayloadSchema.parse(rawPayload);
  } catch (err) {
    return {
      ok: false,
      reason: "invalid-payload",
      message: `room.update payload invalid: ${err.message}`
    };
  }
  const prior = roomStore.get(payload.id);
  if (!prior) {
    return {
      ok: false,
      reason: "no-room",
      message: `room.update: no Room with id '${payload.id}'`
    };
  }
  const finalLevelId = payload.patch.levelId ?? prior.levelId;
  const finalApartmentId = payload.patch.apartmentId ?? prior.apartmentId;
  const levelChanged = payload.patch.levelId !== void 0;
  const apartmentChanged = payload.patch.apartmentId !== void 0;
  if (levelChanged || apartmentChanged) {
    if (!levelStore.has(finalLevelId)) {
      return {
        ok: false,
        reason: "no-level",
        message: `room.update: target Level '${finalLevelId}' does not exist`
      };
    }
    const apt = apartmentStore.get(finalApartmentId);
    if (!apt) {
      return {
        ok: false,
        reason: "no-apartment",
        message: `room.update: target Apartment '${finalApartmentId}' does not exist`
      };
    }
    if (apt.levelId !== finalLevelId) {
      return {
        ok: false,
        reason: "apartment-level-mismatch",
        message: `room.update: Apartment '${finalApartmentId}' is on Level '${apt.levelId}', not '${finalLevelId}' (per [C20 §1.4])`
      };
    }
  }
  const nextRaw = { ...prior };
  if (payload.patch.name !== void 0) nextRaw.name = payload.patch.name;
  if (payload.patch.levelId !== void 0) nextRaw.levelId = payload.patch.levelId;
  if (payload.patch.apartmentId !== void 0) {
    nextRaw.apartmentId = payload.patch.apartmentId;
  }
  nextRaw.updatedAt = now();
  if (payload.parameterPatch !== void 0) {
    const paramsPatch = payload.parameterPatch;
    nextRaw.parameters = {
      ...prior.parameters,
      ...paramsPatch ?? {},
      id: prior.id,
      apartmentId: finalApartmentId
    };
  } else if (apartmentChanged) {
    nextRaw.parameters = {
      ...prior.parameters,
      apartmentId: finalApartmentId
    };
  }
  let next;
  try {
    next = RoomSchema.parse(nextRaw);
  } catch (err) {
    return {
      ok: false,
      reason: "invalid-payload",
      message: `room.update: post-patch validation failed: ${err.message}`
    };
  }
  roomStore.update(next);
  return {
    ok: true,
    event: { type: "room.updated", room: next, prior }
  };
}

function roomDelete(rawPayload, roomStore) {
  let payload;
  try {
    payload = RoomDeletePayloadSchema.parse(rawPayload);
  } catch (err) {
    return {
      ok: false,
      reason: "invalid-payload",
      message: `room.delete payload invalid: ${err.message}`
    };
  }
  const target = roomStore.get(payload.id);
  if (!target) {
    return {
      ok: false,
      reason: "no-room",
      message: `room.delete: no Room with id '${payload.id}'`
    };
  }
  roomStore.remove(target.id);
  return {
    ok: true,
    event: { type: "room.deleted", room: target }
  };
}

function roomAssignToApartment(rawPayload, apartmentStore, roomStore, now = () => (/* @__PURE__ */ new Date()).toISOString()) {
  let payload;
  try {
    payload = RoomAssignToApartmentPayloadSchema.parse(rawPayload);
  } catch (err) {
    return {
      ok: false,
      reason: "invalid-payload",
      message: `room.assignToApartment payload invalid: ${err.message}`
    };
  }
  const room = roomStore.get(payload.roomId);
  if (!room) {
    return {
      ok: false,
      reason: "no-room",
      message: `room.assignToApartment: no Room with id '${payload.roomId}'`
    };
  }
  const apt = apartmentStore.get(payload.apartmentId);
  if (!apt) {
    return {
      ok: false,
      reason: "no-apartment",
      message: `room.assignToApartment: no Apartment with id '${payload.apartmentId}'`
    };
  }
  if (apt.levelId !== room.levelId) {
    return {
      ok: false,
      reason: "apartment-level-mismatch",
      message: `room.assignToApartment: Apartment '${apt.id}' is on Level '${apt.levelId}', but Room '${room.id}' is on Level '${room.levelId}' (per [C20 §1.4])`
    };
  }
  const priorApartmentId = room.apartmentId;
  if (priorApartmentId === payload.apartmentId) {
    return {
      ok: true,
      event: {
        type: "room.assigned-to-apartment",
        roomId: room.id,
        apartmentId: payload.apartmentId,
        priorApartmentId
      }
    };
  }
  let next;
  try {
    next = RoomSchema.parse({
      ...room,
      apartmentId: payload.apartmentId,
      parameters: {
        ...room.parameters,
        apartmentId: payload.apartmentId
      },
      updatedAt: now()
    });
  } catch (err) {
    return {
      ok: false,
      reason: "invalid-payload",
      message: `room.assignToApartment: post-assign validation failed: ${err.message}`
    };
  }
  roomStore.update(next);
  return {
    ok: true,
    event: {
      type: "room.assigned-to-apartment",
      roomId: room.id,
      apartmentId: payload.apartmentId,
      priorApartmentId
    }
  };
}

function parseEpwHeader(rawText) {
  const lines = rawText.split(/\r?\n/);
  if (lines.length < 8) {
    return {
      ok: false,
      error: {
        kind: "epw-parse-failed",
        line: lines.length || 1,
        message: `EPW header MUST be 8 lines; only ${lines.length} provided`
      }
    };
  }
  const locParts = lines[0].split(",");
  if (locParts[0]?.toUpperCase() !== "LOCATION") {
    return {
      ok: false,
      error: {
        kind: "epw-parse-failed",
        line: 1,
        message: `EPW line 1 MUST start with 'LOCATION,' (got '${locParts[0] ?? ""}')`
      }
    };
  }
  if (locParts.length < 9) {
    return {
      ok: false,
      error: {
        kind: "epw-parse-failed",
        line: 1,
        message: `LOCATION line MUST have ≥ 9 comma-separated fields; got ${locParts.length}`
      }
    };
  }
  const city = locParts[1]?.trim() ?? "";
  const state = locParts[2]?.trim() ?? "";
  const country = locParts[3]?.trim() ?? "";
  const isTenFieldShape = locParts.length >= 10;
  const wmoStation = isTenFieldShape ? (locParts[5]?.trim() ?? "") || "000000" : (locParts[4]?.trim() ?? "") || "000000";
  const latIdx = isTenFieldShape ? 6 : 5;
  const lonIdx = isTenFieldShape ? 7 : 6;
  const tzIdx = isTenFieldShape ? 8 : 7;
  const elevIdx = isTenFieldShape ? 9 : 8;
  const latRes = parseLocationNumber(locParts[latIdx], 1, "lat");
  if (typeof latRes !== "number") return { ok: false, error: latRes };
  const lonRes = parseLocationNumber(locParts[lonIdx], 1, "lon");
  if (typeof lonRes !== "number") return { ok: false, error: lonRes };
  const tzRes = parseLocationNumber(locParts[tzIdx], 1, "timezone");
  if (typeof tzRes !== "number") return { ok: false, error: tzRes };
  const elevRes = parseLocationNumber(locParts[elevIdx] ?? "0", 1, "elevation");
  if (typeof elevRes !== "number") return { ok: false, error: elevRes };
  if (latRes < -90 || latRes > 90) {
    return locationRangeError(1, "lat", latRes, "[-90, 90]");
  }
  if (lonRes < -180 || lonRes > 180) {
    return locationRangeError(1, "lon", lonRes, "[-180, 180]");
  }
  if (tzRes < -14 || tzRes > 14) {
    return locationRangeError(1, "timezone", tzRes, "[-14, +14] hours");
  }
  if (elevRes < -500 || elevRes > 9e3) {
    return locationRangeError(1, "elevation", elevRes, "[-500, 9000] metres");
  }
  const lat = latRes;
  const lon = lonRes;
  const tzGmtOffsetHours = tzRes;
  const elevationM = elevRes;
  const dpParts = lines[7].split(",");
  if (dpParts[0]?.toUpperCase() !== "DATA PERIODS") {
    return {
      ok: false,
      error: {
        kind: "epw-parse-failed",
        line: 8,
        message: `EPW line 8 MUST start with 'DATA PERIODS,' (got '${dpParts[0] ?? ""}')`
      }
    };
  }
  const dpcRes = parsePositiveInt(dpParts[1], 8, "dataPeriodCount");
  if (typeof dpcRes !== "number") return { ok: false, error: dpcRes };
  const rphRes = parsePositiveInt(dpParts[2], 8, "recordsPerHour");
  if (typeof rphRes !== "number") return { ok: false, error: rphRes };
  const dataPeriodCount = dpcRes;
  const recordsPerHour = rphRes;
  return {
    ok: true,
    header: {
      location: {
        city,
        state,
        country,
        wmoStation,
        lat,
        lon,
        tzGmtOffsetHours,
        elevationM
      },
      dataPeriodCount,
      recordsPerHour
    },
    nextLineIndex: 8
  };
}
function parseLocationNumber(raw, line, field) {
  const trimmed = (raw ?? "").trim();
  if (trimmed.length === 0) {
    return {
      kind: "epw-parse-failed",
      line,
      message: `LOCATION field '${field}' is empty`
    };
  }
  const n = Number(trimmed);
  if (!Number.isFinite(n)) {
    return {
      kind: "unit-conversion-failed",
      field,
      rawValue: trimmed
    };
  }
  return n;
}
function parsePositiveInt(raw, line, field) {
  const trimmed = (raw ?? "").trim();
  const n = Number(trimmed);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    return {
      kind: "epw-parse-failed",
      line,
      message: `Expected positive integer for '${field}', got '${trimmed}'`
    };
  }
  return n;
}
function locationRangeError(line, field, value, range) {
  return {
    ok: false,
    error: {
      kind: "epw-parse-failed",
      line,
      message: `LOCATION ${field} = ${value} outside ${range}`
    }
  };
}

function parseEpwHourlyRecords(rawText, header, nextLineIndex) {
  const lines = rawText.split(/\r?\n/);
  const records = [];
  const tzOffsetHours = header.location.tzGmtOffsetHours;
  for (let i = nextLineIndex; i < lines.length; i++) {
    const raw = lines[i];
    if (raw === void 0) continue;
    if (raw.trim().length === 0) continue;
    const lineNumber = i + 1;
    const parts = raw.split(",");
    if (parts.length < 35) {
      return {
        ok: false,
        error: {
          kind: "epw-parse-failed",
          line: lineNumber,
          message: `Expected ≥ 35 comma-separated fields; got ${parts.length}`
        }
      };
    }
    const result = parseOneRecord(
      parts,
      lineNumber,
      records.length,
      tzOffsetHours
    );
    if (!result.ok) return result;
    records.push(result.record);
    if (records.length > 8784) {
      return {
        ok: false,
        error: {
          kind: "epw-parse-failed",
          line: lineNumber,
          message: `Too many hourly records (> 8784); not a valid TMY file`
        }
      };
    }
  }
  return { ok: true, records };
}
function parseOneRecord(parts, line, indexZeroBased, tzGmtOffsetHours) {
  const year = parseNum(parts[0], line, "year");
  if (typeof year !== "number") return { ok: false, error: year };
  const month = parseNum(parts[1], line, "month");
  if (typeof month !== "number") return { ok: false, error: month };
  const day = parseNum(parts[2], line, "day");
  if (typeof day !== "number") return { ok: false, error: day };
  const hour = parseNum(parts[3], line, "hour");
  if (typeof hour !== "number") return { ok: false, error: hour };
  if (month < 1 || month > 12) {
    return errLine(line, `month out of range: ${month}`);
  }
  if (day < 1 || day > 31) {
    return errLine(line, `day out of range: ${day}`);
  }
  if (hour < 1 || hour > 24) {
    return errLine(line, `hour out of range: ${hour} (EPW uses 1..24)`);
  }
  const utcMs = computeUtcStartOfHour(
    year,
    month,
    day,
    hour - 1,
    tzGmtOffsetHours
  );
  if (utcMs === null) {
    return errLine(line, `invalid date: ${year}-${month}-${day} ${hour}:00 local`);
  }
  const dryBulbC = parseNumOrSentinel(parts[6], line, "dryBulbC", 99.9);
  if (typeof dryBulbC !== "number") return { ok: false, error: dryBulbC };
  const dewPointC = parseNumOrSentinel(parts[7], line, "dewPointC", 99.9);
  if (typeof dewPointC !== "number") return { ok: false, error: dewPointC };
  const relHumidityPct = parseNumOrSentinel(parts[8], line, "relHumidityPct", 999);
  if (typeof relHumidityPct !== "number") return { ok: false, error: relHumidityPct };
  const stationPressurePa = parseNumOrSentinel(parts[9], line, "stationPressurePa", 999999);
  if (typeof stationPressurePa !== "number") return { ok: false, error: stationPressurePa };
  const globalHorizontalWm2 = parseNumOrSentinel(parts[13], line, "globalHorizontalWm2", 9999);
  if (typeof globalHorizontalWm2 !== "number") return { ok: false, error: globalHorizontalWm2 };
  const directNormalWm2 = parseNumOrSentinel(parts[14], line, "directNormalWm2", 9999);
  if (typeof directNormalWm2 !== "number") return { ok: false, error: directNormalWm2 };
  const diffuseHorizontalWm2 = parseNumOrSentinel(parts[15], line, "diffuseHorizontalWm2", 9999);
  if (typeof diffuseHorizontalWm2 !== "number") return { ok: false, error: diffuseHorizontalWm2 };
  const windDirDeg = parseNumOrSentinel(parts[20], line, "windDirDeg", 999);
  if (typeof windDirDeg !== "number") return { ok: false, error: windDirDeg };
  const windSpeedMps = parseNumOrSentinel(parts[21], line, "windSpeedMps", 999);
  if (typeof windSpeedMps !== "number") return { ok: false, error: windSpeedMps };
  const totalCloudTenths = parseNumOrSentinel(parts[22], line, "totalCloudTenths", 99);
  if (typeof totalCloudTenths !== "number") return { ok: false, error: totalCloudTenths };
  const opaqueCloudTenths = parseNumOrSentinel(parts[23], line, "opaqueCloudTenths", 99);
  if (typeof opaqueCloudTenths !== "number") return { ok: false, error: opaqueCloudTenths };
  const visibilityKm = parseNumOrSentinel(parts[24], line, "visibilityKm", 9999);
  if (typeof visibilityKm !== "number") return { ok: false, error: visibilityKm };
  const precipMm = parseNumOrSentinel(parts[33], line, "precipMm", 999);
  if (typeof precipMm !== "number") return { ok: false, error: precipMm };
  const record = {
    utcIso: new Date(utcMs).toISOString(),
    localHourOfYear: indexZeroBased + 1,
    dryBulbC: clamp(dryBulbC, -90, 70),
    dewPointC: clamp(dewPointC, -100, 70),
    relHumidityPct: clamp(relHumidityPct, 0, 110),
    stationPressurePa: clamp(stationPressurePa, 4e4, 12e4),
    directNormalWm2: clamp(directNormalWm2, 0, 1500),
    diffuseHorizontalWm2: clamp(diffuseHorizontalWm2, 0, 1200),
    globalHorizontalWm2: clamp(globalHorizontalWm2, 0, 1500),
    windSpeedMps: clamp(windSpeedMps, 0, 90),
    windDirDeg: clamp(windDirDeg, 0, 360),
    totalCloudTenths: clamp(totalCloudTenths, 0, 10),
    opaqueCloudTenths: clamp(opaqueCloudTenths, 0, 10),
    visibilityKm: clamp(visibilityKm, 0, 9999),
    precipMm: clamp(precipMm, 0, 2e3)
  };
  return { ok: true, record };
}
function parseNum(raw, line, field) {
  const trimmed = (raw ?? "").trim();
  if (trimmed.length === 0) {
    return {
      kind: "epw-parse-failed",
      line,
      message: `Field '${field}' is empty`
    };
  }
  const n = Number(trimmed);
  if (!Number.isFinite(n)) {
    return { kind: "unit-conversion-failed", field, rawValue: trimmed };
  }
  return n;
}
function parseNumOrSentinel(raw, line, field, sentinel) {
  const r = parseNum(raw, line, field);
  if (typeof r !== "number") return r;
  return r === sentinel ? 0 : r;
}
function errLine(line, message) {
  return { ok: false, error: { kind: "epw-parse-failed", line, message } };
}
function clamp(n, min, max) {
  if (!Number.isFinite(n)) return min;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}
function computeUtcStartOfHour(year, month, day, hourLocal, tzGmtOffsetHours) {
  const localAsUtc = Date.UTC(year, month - 1, day, hourLocal, 0, 0, 0);
  if (!Number.isFinite(localAsUtc)) return null;
  const d = new Date(localAsUtc);
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day || d.getUTCHours() !== hourLocal) {
    return null;
  }
  return localAsUtc - tzGmtOffsetHours * 60 * 60 * 1e3;
}

function buildMonthlyNormals(records) {
  const buckets = Array.from({ length: 12 }, () => ({
    sumDryBulbC: 0,
    minDryBulbC: Number.POSITIVE_INFINITY,
    maxDryBulbC: Number.NEGATIVE_INFINITY,
    sumRelHumidityPct: 0,
    sumPrecipMm: 0,
    sumWindSpeedMps: 0,
    sumGlobalHorizontalWm2: 0,
    hddSum: 0,
    cddSum: 0,
    sectorHours: Array(16).fill(0),
    count: 0
  }));
  for (const r of records) {
    const month = monthFromIso(r.utcIso);
    if (month < 1 || month > 12) continue;
    const b = buckets[month - 1];
    b.sumDryBulbC += r.dryBulbC;
    if (r.dryBulbC < b.minDryBulbC) b.minDryBulbC = r.dryBulbC;
    if (r.dryBulbC > b.maxDryBulbC) b.maxDryBulbC = r.dryBulbC;
    b.sumRelHumidityPct += r.relHumidityPct;
    b.sumPrecipMm += r.precipMm;
    b.sumWindSpeedMps += r.windSpeedMps;
    b.sumGlobalHorizontalWm2 += r.globalHorizontalWm2;
    const delta18 = 18 - r.dryBulbC;
    if (delta18 > 0) b.hddSum += delta18 / 24;
    else b.cddSum += -delta18 / 24;
    const sectorIdx = windDirToSectorIndex$1(r.windDirDeg);
    b.sectorHours[sectorIdx] += 1;
    b.count += 1;
  }
  return buckets.map((b, idx) => {
    const month = idx + 1;
    if (b.count === 0) {
      return {
        month,
        avgDryBulbC: 0,
        avgMinDryBulbC: 0,
        avgMaxDryBulbC: 0,
        avgRelHumidityPct: 0,
        avgPrecipMm: 0,
        avgWindSpeedMps: 0,
        prevailingWindDirDeg: 0,
        avgGlobalHorizontalWm2: 0,
        heatingDegreeDaysBase18: 0,
        coolingDegreeDaysBase18: 0
      };
    }
    const prevailingIdx = argmax(b.sectorHours);
    return {
      month,
      avgDryBulbC: b.sumDryBulbC / b.count,
      avgMinDryBulbC: b.minDryBulbC,
      avgMaxDryBulbC: b.maxDryBulbC,
      avgRelHumidityPct: b.sumRelHumidityPct / b.count,
      avgPrecipMm: b.sumPrecipMm,
      // monthly total
      avgWindSpeedMps: b.sumWindSpeedMps / b.count,
      prevailingWindDirDeg: prevailingIdx * 22.5,
      avgGlobalHorizontalWm2: b.sumGlobalHorizontalWm2 / b.count,
      heatingDegreeDaysBase18: b.hddSum,
      coolingDegreeDaysBase18: b.cddSum
    };
  });
}
function monthFromIso(utcIso) {
  return Number(utcIso.slice(5, 7));
}
function windDirToSectorIndex$1(deg) {
  const shifted = (deg + 11.25) % 360;
  return Math.floor(shifted / 22.5) % 16;
}
function argmax(arr) {
  let best = 0;
  let bestVal = arr[0] ?? Number.NEGATIVE_INFINITY;
  for (let i = 1; i < arr.length; i++) {
    const v = arr[i];
    if (v > bestVal) {
      best = i;
      bestVal = v;
    }
  }
  return best;
}

const SPEED_BIN_UPPER_MPS$1 = [1.5, 3.3, 5.4, 7.9, 10.7, Number.POSITIVE_INFINITY];
function buildWindRose(records) {
  const sectors = Array.from(
    { length: WIND_ROSE_SECTOR_COUNT },
    () => [0, 0, 0, 0, 0, 0]
  );
  const speeds = [];
  let sumSpeed = 0;
  for (const r of records) {
    const sectorIdx = windDirToSectorIndex(r.windDirDeg);
    const binIdx = speedToBinIndex(r.windSpeedMps);
    sectors[sectorIdx][binIdx] += 1;
    sumSpeed += r.windSpeedMps;
    speeds.push(r.windSpeedMps);
  }
  const n = records.length;
  const meanSpeedMps = n === 0 ? 0 : sumSpeed / n;
  const p99SpeedMps = percentile(speeds, 99);
  const sectorRecords = sectors.map((bins, i) => ({
    sectorDeg: i * 22.5,
    speedBinHours: [
      bins[0],
      bins[1],
      bins[2],
      bins[3],
      bins[4],
      bins[5]
    ]
  }));
  return {
    sectors: sectorRecords,
    meanSpeedMps,
    p99SpeedMps
  };
}
function windDirToSectorIndex(deg) {
  const shifted = (deg + 11.25) % 360;
  return Math.floor(shifted / 22.5) % 16;
}
function speedToBinIndex(speedMps) {
  for (let i = 0; i < SPEED_BIN_UPPER_MPS$1.length; i++) {
    if (speedMps < SPEED_BIN_UPPER_MPS$1[i]) return i;
  }
  return SPEED_BIN_UPPER_MPS$1.length - 1;
}
function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor(p / 100 * sorted.length))
  );
  return sorted[idx];
}

function buildDesignTemperatures(records) {
  if (records.length === 0) {
    return {
      heating99_6C: 0,
      cooling0_4C: 0,
      cooling0_4MwbC: 0
    };
  }
  const temps = records.map((r) => r.dryBulbC);
  const sorted = [...temps].sort((a, b) => a - b);
  const n = sorted.length;
  const heating99_6C = sorted[Math.floor(4e-3 * n)];
  const cooling0_4C = sorted[Math.min(n - 1, Math.floor(0.996 * n))];
  const cutoff = cooling0_4C;
  let wbSum = 0;
  let wbCount = 0;
  for (const r of records) {
    if (r.dryBulbC >= cutoff) {
      wbSum += approximateWetBulbC(r.dryBulbC, r.relHumidityPct);
      wbCount += 1;
    }
  }
  const cooling0_4MwbC = wbCount > 0 ? wbSum / wbCount : cooling0_4C;
  return {
    heating99_6C,
    cooling0_4C,
    cooling0_4MwbC
  };
}
function approximateWetBulbC(dryBulbC, relHumidityPct) {
  const T = dryBulbC;
  const RH = Math.max(5, Math.min(99, relHumidityPct));
  return T * Math.atan(0.151977 * Math.sqrt(RH + 8.313659)) + Math.atan(T + RH) - Math.atan(RH - 1.676331) + 391838e-8 * Math.pow(RH, 1.5) * Math.atan(0.023101 * RH) - 4.686035;
}

const BASE_18C = 18;
const BASE_65F_AS_C = (65 - 32) * (5 / 9);
function buildDegreeDays(records) {
  let hdd18 = 0;
  let cdd18 = 0;
  let hdd65 = 0;
  let cdd65 = 0;
  for (const r of records) {
    const T = r.dryBulbC;
    const d18 = BASE_18C - T;
    if (d18 > 0) hdd18 += d18 / 24;
    else cdd18 += -d18 / 24;
    const d65 = BASE_65F_AS_C - T;
    if (d65 > 0) hdd65 += d65 / 24;
    else cdd65 += -d65 / 24;
  }
  return {
    hddBase18: hdd18,
    cddBase18: cdd18,
    hddBase65F: hdd65,
    cddBase65F: cdd65
  };
}

const DEG_PER_RAD = 180 / Math.PI;
const RAD_PER_DEG = Math.PI / 180;
const SOLAR_CONSTANT_WM2 = 1361;
function solarSample(lat, lon, utcIso) {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new RangeError(`solarSample: lat must be in [-90, 90]; got ${lat}`);
  }
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
    throw new RangeError(`solarSample: lon must be in [-180, 180]; got ${lon}`);
  }
  const date = new Date(utcIso);
  if (!Number.isFinite(date.getTime())) {
    throw new RangeError(`solarSample: utcIso is not a valid date: ${utcIso}`);
  }
  const { altitudeRad, azimuthRad } = computeAltitudeAzimuth(lat, lon, date);
  const isAboveHorizon = altitudeRad > 0;
  const approxDirectWm2 = approximateDirectIrradiance(altitudeRad);
  return {
    utcIso: date.toISOString(),
    altitudeRad,
    azimuthRad,
    isAboveHorizon,
    approxDirectWm2
  };
}
function computeAltitudeAzimuth(latDeg, lonDeg, utcDate) {
  const julianDay = toJulianDay(utcDate);
  const T = (julianDay - 2451545) / 36525;
  const L0 = mod360(280.46646 + T * (36000.76983 + T * 3032e-7));
  const M = 357.52911 + T * (35999.05029 - 1537e-7 * T);
  const e = 0.016708634 - T * (42037e-9 + 1267e-10 * T);
  const Mrad = M * RAD_PER_DEG;
  const C = Math.sin(Mrad) * (1.914602 - T * (4817e-6 + 14e-6 * T)) + Math.sin(2 * Mrad) * (0.019993 - 101e-6 * T) + Math.sin(3 * Mrad) * 289e-6;
  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * T;
  const lambda = trueLong - 569e-5 - 478e-5 * Math.sin(omega * RAD_PER_DEG);
  const seconds = 21.448 - T * (46.815 + T * (59e-5 - T * 1813e-6));
  const epsilon0 = 23 + (26 + seconds / 60) / 60;
  const epsilon = epsilon0 + 256e-5 * Math.cos(omega * RAD_PER_DEG);
  const sinDecl = Math.sin(epsilon * RAD_PER_DEG) * Math.sin(lambda * RAD_PER_DEG);
  const declDeg = Math.asin(sinDecl) * DEG_PER_RAD;
  const epsHalfTan = Math.tan(epsilon * 0.5 * RAD_PER_DEG);
  const y = epsHalfTan * epsHalfTan;
  const L0rad = L0 * RAD_PER_DEG;
  const eqTimeMin = 4 * DEG_PER_RAD * (y * Math.sin(2 * L0rad) - 2 * e * Math.sin(Mrad) + 4 * e * y * Math.sin(Mrad) * Math.cos(2 * L0rad) - 0.5 * y * y * Math.sin(4 * L0rad) - 1.25 * e * e * Math.sin(2 * Mrad));
  const utcMinutes = utcDate.getUTCHours() * 60 + utcDate.getUTCMinutes() + utcDate.getUTCSeconds() / 60;
  const trueSolarTime = mod1440(utcMinutes + eqTimeMin + 4 * lonDeg);
  let hourAngleDeg = trueSolarTime / 4 - 180;
  if (hourAngleDeg < -180) hourAngleDeg += 360;
  const latRad = latDeg * RAD_PER_DEG;
  const declRad = declDeg * RAD_PER_DEG;
  const haRad = hourAngleDeg * RAD_PER_DEG;
  const cosZenith = Math.sin(latRad) * Math.sin(declRad) + Math.cos(latRad) * Math.cos(declRad) * Math.cos(haRad);
  const cosZenithClamped = Math.max(-1, Math.min(1, cosZenith));
  const zenithRad = Math.acos(cosZenithClamped);
  const altitudeRad = Math.PI / 2 - zenithRad;
  const cosAlt = Math.cos(altitudeRad);
  let azimuthRad;
  if (Math.abs(cosAlt) < 1e-9 || Math.abs(Math.cos(latRad)) < 1e-9) {
    azimuthRad = 0;
  } else {
    const cosAz = (Math.sin(declRad) - Math.sin(altitudeRad) * Math.sin(latRad)) / (cosAlt * Math.cos(latRad));
    const cosAzClamped = Math.max(-1, Math.min(1, cosAz));
    const azNorthRef = Math.acos(cosAzClamped);
    azimuthRad = hourAngleDeg > 0 ? 2 * Math.PI - azNorthRef : azNorthRef;
  }
  return { altitudeRad, azimuthRad };
}
function toJulianDay(utcDate) {
  let y = utcDate.getUTCFullYear();
  let m = utcDate.getUTCMonth() + 1;
  const d = utcDate.getUTCDate() + (utcDate.getUTCHours() + utcDate.getUTCMinutes() / 60 + utcDate.getUTCSeconds() / 3600) / 24;
  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
}
function approximateDirectIrradiance(altitudeRad) {
  if (altitudeRad <= 0) return 0;
  const altDeg = altitudeRad * DEG_PER_RAD;
  const airMass = 1 / (Math.sin(altitudeRad) + 0.50572 * Math.pow(altDeg + 6.07995, -1.6364));
  const transmittance = Math.pow(0.7, Math.pow(airMass, 0.678));
  return SOLAR_CONSTANT_WM2 * transmittance;
}
function mod360(x) {
  const r = x % 360;
  return r < 0 ? r + 360 : r;
}
function mod1440(x) {
  const r = x % 1440;
  return r < 0 ? r + 1440 : r;
}

const ZONE_TEMPLATES = [
  {
    id: "tropical",
    label: "Tropical (equatorial)",
    refLatAbs: 5,
    coldMeanC: 26,
    warmMeanC: 28,
    diurnalC: 8,
    rhPct: 80,
    windMps: 3,
    windDirDeg: 90,
    peakGhiWm2: 320,
    precipMm: 180
  },
  {
    id: "subtropical",
    label: "Subtropical / warm temperate",
    refLatAbs: 28,
    coldMeanC: 12,
    warmMeanC: 29,
    diurnalC: 10,
    rhPct: 62,
    windMps: 3.4,
    windDirDeg: 135,
    peakGhiWm2: 300,
    precipMm: 70
  },
  {
    id: "temperate",
    label: "Temperate maritime",
    refLatAbs: 45,
    coldMeanC: 4,
    warmMeanC: 19,
    diurnalC: 8,
    rhPct: 75,
    windMps: 4.2,
    windDirDeg: 225,
    peakGhiWm2: 250,
    precipMm: 60
  },
  {
    id: "continental",
    label: "Cool continental",
    refLatAbs: 55,
    coldMeanC: -6,
    warmMeanC: 18,
    diurnalC: 11,
    rhPct: 70,
    windMps: 4,
    windDirDeg: 270,
    peakGhiWm2: 230,
    precipMm: 50
  },
  {
    id: "boreal",
    label: "Boreal / subarctic",
    refLatAbs: 65,
    coldMeanC: -16,
    warmMeanC: 14,
    diurnalC: 10,
    rhPct: 72,
    windMps: 3.6,
    windDirDeg: 315,
    peakGhiWm2: 190,
    precipMm: 40
  },
  {
    id: "polar",
    label: "Polar",
    refLatAbs: 78,
    coldMeanC: -28,
    warmMeanC: 3,
    diurnalC: 6,
    rhPct: 80,
    windMps: 4.5,
    windDirDeg: 0,
    peakGhiWm2: 120,
    precipMm: 20
  }
];
const BUNDLED_NORMALS_VERSION = "pryzm-bundled-normals-1.0";
function nearestZoneTemplate(latDeg) {
  const absLat = Math.abs(latDeg);
  let best = ZONE_TEMPLATES[0];
  let bestDelta = Math.abs(best.refLatAbs - absLat);
  for (const z of ZONE_TEMPLATES) {
    const delta = Math.abs(z.refLatAbs - absLat);
    if (delta < bestDelta) {
      best = z;
      bestDelta = delta;
    }
  }
  return best;
}
function bundledMonthlyNormals(latDeg, _lonDeg) {
  const zone = nearestZoneTemplate(latDeg);
  const southern = latDeg < 0;
  const mean = (zone.coldMeanC + zone.warmMeanC) / 2;
  const amp = (zone.warmMeanC - zone.coldMeanC) / 2;
  const monthlyNormals = [];
  for (let m = 1; m <= 12; m += 1) {
    const monthAngle = (m - 7) / 12 * 2 * Math.PI;
    const seasonal = Math.cos(monthAngle) * (southern ? -1 : 1);
    const avgC = round1(mean + amp * seasonal);
    const avgMinC = round1(avgC - zone.diurnalC / 2);
    const avgMaxC = round1(avgC + zone.diurnalC / 2);
    const warmFactor = (seasonal + 1) / 2;
    const ghi = round1(
      zone.peakGhiWm2 * (0.35 + 0.65 * warmFactor)
    );
    const precip = round1(
      zone.precipMm * (0.7 + 0.6 * warmFactor)
    );
    const wind = round1(zone.windMps * (1.15 - 0.3 * warmFactor));
    const daysInMonth = 30.4;
    const delta18 = 18 - avgC;
    const hdd = delta18 > 0 ? round1(delta18 * daysInMonth) : 0;
    const cdd = delta18 < 0 ? round1(-delta18 * daysInMonth) : 0;
    monthlyNormals.push({
      month: m,
      avgDryBulbC: avgC,
      avgMinDryBulbC: avgMinC,
      avgMaxDryBulbC: avgMaxC,
      avgRelHumidityPct: zone.rhPct,
      avgPrecipMm: precip,
      avgWindSpeedMps: wind,
      prevailingWindDirDeg: zone.windDirDeg,
      avgGlobalHorizontalWm2: ghi,
      heatingDegreeDaysBase18: hdd,
      coolingDegreeDaysBase18: cdd
    });
  }
  return {
    monthlyNormals,
    zoneId: zone.id,
    zoneLabel: zone.label,
    datasetVersion: BUNDLED_NORMALS_VERSION
  };
}
function round1(x) {
  return Math.round(x * 10) / 10;
}

const SPEED_BIN_UPPER_MPS = [1.5, 3.3, 5.4, 7.9, 10.7];
function speedBinIndex$2(mps) {
  for (let i = 0; i < SPEED_BIN_UPPER_MPS.length; i += 1) {
    if (mps < SPEED_BIN_UPPER_MPS[i]) return i;
  }
  return 5;
}
function synthWindRoseFromNormals(monthlyNormals) {
  const sectors = Array.from({ length: 16 }, (_, i) => ({
    sectorDeg: i * 22.5,
    speedBinHours: [0, 0, 0, 0, 0, 0]
  }));
  let sumSpeed = 0;
  let count = 0;
  for (const m of monthlyNormals) {
    const sectorIdx = Math.floor((m.prevailingWindDirDeg + 11.25) % 360 / 22.5) % 16;
    const sec = sectors[sectorIdx];
    const bin = speedBinIndex$2(m.avgWindSpeedMps);
    sec.speedBinHours[bin] = (sec.speedBinHours[bin] ?? 0) + 720;
    sumSpeed += m.avgWindSpeedMps;
    count += 1;
  }
  const mean = count > 0 ? sumSpeed / count : 0;
  return {
    sectors,
    meanSpeedMps: mean,
    // Coarse gust estimate (no hourly data offline). 2.5× the mean is a
    // reasonable temperate-climate ratio; capped to the schema's 90 m/s.
    p99SpeedMps: Math.min(90, mean * 2.5)
  };
}
function buildFallbackClimateDataset(params) {
  const { id, siteRef, lat, lon } = params;
  const elevationM = params.elevationM ?? 0;
  const timezone = params.timezone ?? "UTC";
  const nowIso = params.nowIso ?? (/* @__PURE__ */ new Date()).toISOString();
  const { monthlyNormals } = bundledMonthlyNormals(lat);
  let coldest = Number.POSITIVE_INFINITY;
  let hottest = Number.NEGATIVE_INFINITY;
  let hdd18Total = 0;
  let cdd18Total = 0;
  for (const m of monthlyNormals) {
    if (m.avgMinDryBulbC < coldest) coldest = m.avgMinDryBulbC;
    if (m.avgMaxDryBulbC > hottest) hottest = m.avgMaxDryBulbC;
    hdd18Total += m.heatingDegreeDaysBase18;
    cdd18Total += m.coolingDegreeDaysBase18;
  }
  const dataset = {
    id,
    siteRef,
    lat,
    lon,
    elevationM,
    timezone,
    source: "fallback-defaults",
    monthlyNormals,
    windRose: synthWindRoseFromNormals(monthlyNormals),
    designTemps: {
      heating99_6C: coldest,
      cooling0_4C: hottest,
      cooling0_4MwbC: hottest * 0.75
    },
    degreeDays: {
      hddBase18: hdd18Total,
      cddBase18: cdd18Total,
      hddBase65F: hdd18Total * 1.05,
      cddBase65F: cdd18Total * 0.95
    },
    provenance: {
      source: "fallback-defaults",
      vendor: "PRYZM-builtin",
      datasetVersion: BUNDLED_NORMALS_VERSION,
      fetchedAtUtcIso: nowIso,
      license: "CC0-1.0",
      notes: "Estimated offline climatology from a bundled latitude-band template (no network / EPW). Import an EPW or refresh live normals for measured climate."
    },
    ingestedAtUtcIso: nowIso
  };
  return ClimateDatasetSchema.parse(dataset);
}

const _cache = /* @__PURE__ */ new Map();
function cacheKey(lat, lon) {
  const qLat = Math.round(lat * 100);
  const qLon = Math.round(lon * 100);
  return `${qLat}:${qLon}`;
}
async function resolveNormals(lat, lon, opts = {}) {
  const key = cacheKey(lat, lon);
  if (!opts.bypassCache) {
    const hit = _cache.get(key);
    const hitIsFinal = hit && (hit.tier === "noaa-normals" || !opts.fetchImpl);
    if (hit && hitIsFinal) return { ...hit, cacheHit: true };
  }
  if (opts.fetchImpl) {
    try {
      const raw = await opts.fetchImpl(lat, lon);
      const isRich = !Array.isArray(raw) && typeof raw === "object" && raw !== null && "monthlyNormals" in raw;
      const rich = isRich ? raw : void 0;
      const rawNormals = rich ? rich.monthlyNormals : raw;
      const parsed = NOAANormalSchema.array().length(12).parse(rawNormals);
      const resolved2 = {
        monthlyNormals: parsed,
        tier: "noaa-normals",
        vendor: rich?.vendor ?? "NOAA NCEI",
        datasetVersion: rich?.datasetVersion ?? "noaa-normals-1991-2020",
        license: rich?.license ?? "public-domain",
        cacheHit: false
      };
      _cache.set(key, resolved2);
      return resolved2;
    } catch (err) {
      console.warn(
        "[climate-host] NOAA normals fetch failed; using bundled fallback:",
        err?.message ?? err
      );
    }
  }
  const bundled = bundledMonthlyNormals(lat);
  const resolved = {
    monthlyNormals: bundled.monthlyNormals,
    tier: "bundled",
    vendor: "PRYZM-builtin",
    datasetVersion: BUNDLED_NORMALS_VERSION,
    license: "CC0-1.0",
    cacheHit: false
  };
  _cache.set(key, resolved);
  return resolved;
}

let ingestCounter = 0;
function mintDatasetId() {
  ingestCounter += 1;
  const ms = Date.now().toString(36).toUpperCase().padStart(10, "0");
  const seq = ingestCounter.toString(36).toUpperCase().padStart(6, "0");
  return `climate:${ms}${seq}`;
}
function climateIngestEpw(rawPayload, store) {
  let payload;
  try {
    payload = ClimateIngestEpwPayloadSchema.parse(rawPayload);
  } catch (err) {
    return {
      ok: false,
      reason: "invalid-payload",
      message: `climate.ingestEPW payload invalid: ${err.message}`
    };
  }
  const headerResult = parseEpwHeader(payload.rawEpwText);
  if (!headerResult.ok) {
    return {
      ok: false,
      reason: "epw-parse-failed",
      message: `EPW header parse failed`,
      ingestionError: headerResult.error
    };
  }
  const hourlyResult = parseEpwHourlyRecords(
    payload.rawEpwText,
    headerResult.header,
    headerResult.nextLineIndex
  );
  if (!hourlyResult.ok) {
    return {
      ok: false,
      reason: "epw-parse-failed",
      message: `EPW hourly-record parse failed`,
      ingestionError: hourlyResult.error
    };
  }
  const records = hourlyResult.records;
  const monthlyNormals = buildMonthlyNormals(records);
  const windRose = buildWindRose(records);
  const designTemps = buildDesignTemperatures(records);
  const degreeDays = buildDegreeDays(records);
  const dataset = ClimateDatasetSchema.parse({
    id: mintDatasetId(),
    siteRef: payload.siteId,
    lat: payload.lat,
    lon: payload.lon,
    elevationM: payload.elevationM,
    timezone: payload.timezone,
    source: "epw",
    hourly: records,
    monthlyNormals,
    windRose,
    designTemps,
    degreeDays,
    provenance: {
      source: "epw",
      vendor: payload.vendor,
      datasetVersion: payload.datasetVersion,
      fetchedAtUtcIso: (/* @__PURE__ */ new Date()).toISOString(),
      license: payload.license,
      ...payload.filename ? { filename: payload.filename } : {},
      ...payload.fileSha256 ? { fileSha256: payload.fileSha256 } : {}
    },
    ingestedAtUtcIso: (/* @__PURE__ */ new Date()).toISOString()
  });
  const cacheKey = store.ingest(dataset);
  return {
    ok: true,
    event: {
      type: "climate.ingested",
      siteId: payload.siteId,
      datasetId: dataset.id,
      source: "epw",
      cacheKey
    }
  };
}

let counter$1 = 0;
function mintId$1() {
  counter$1 += 1;
  const ms = Date.now().toString(36).toUpperCase().padStart(10, "0");
  const seq = counter$1.toString(36).toUpperCase().padStart(6, "0");
  return `climate:${ms}${seq}`;
}
function synthWindRoseFromMonthlies(monthlyNormals) {
  const sectors = Array.from({ length: 16 }, (_, i) => ({
    sectorDeg: i * 22.5,
    speedBinHours: [0, 0, 0, 0, 0, 0]
  }));
  let sumSpeed = 0;
  let count = 0;
  for (const m of monthlyNormals) {
    const sectorIdx = Math.floor((m.prevailingWindDirDeg + 11.25) % 360 / 22.5) % 16;
    const sec = sectors[sectorIdx];
    const bin = speedBinIndex$1(m.avgWindSpeedMps);
    sec.speedBinHours[bin] = (sec.speedBinHours[bin] ?? 0) + 720;
    sumSpeed += m.avgWindSpeedMps;
    count += 1;
  }
  return {
    sectors,
    meanSpeedMps: count > 0 ? sumSpeed / count : 0,
    p99SpeedMps: count > 0 ? sumSpeed / count * 2.5 : 0
    // rough gust factor
  };
}
function speedBinIndex$1(mps) {
  const upper = [1.5, 3.3, 5.4, 7.9, 10.7];
  for (let i = 0; i < upper.length; i++) {
    if (mps < upper[i]) return i;
  }
  return 5;
}
function climateRefreshNoaa(rawPayload, store) {
  let payload;
  try {
    payload = ClimateRefreshNoaaPayloadSchema.parse(rawPayload);
  } catch (err) {
    return {
      ok: false,
      reason: "invalid-payload",
      message: `climate.refreshNOAA payload invalid: ${err.message}`
    };
  }
  let coldest = Number.POSITIVE_INFINITY;
  let hottest = Number.NEGATIVE_INFINITY;
  let hdd18Total = 0;
  let cdd18Total = 0;
  for (const m of payload.monthlyNormals) {
    if (m.avgMinDryBulbC < coldest) coldest = m.avgMinDryBulbC;
    if (m.avgMaxDryBulbC > hottest) hottest = m.avgMaxDryBulbC;
    hdd18Total += m.heatingDegreeDaysBase18;
    cdd18Total += m.coolingDegreeDaysBase18;
  }
  const dataset = ClimateDatasetSchema.parse({
    id: mintId$1(),
    siteRef: payload.siteId,
    lat: payload.lat,
    lon: payload.lon,
    elevationM: payload.elevationM,
    timezone: payload.timezone,
    source: "noaa-normals",
    monthlyNormals: payload.monthlyNormals,
    windRose: synthWindRoseFromMonthlies(payload.monthlyNormals),
    designTemps: {
      heating99_6C: coldest,
      cooling0_4C: hottest,
      cooling0_4MwbC: hottest * 0.75
      // crude — ~75% of dry-bulb
    },
    degreeDays: {
      hddBase18: hdd18Total,
      cddBase18: cdd18Total,
      hddBase65F: hdd18Total * 1.05,
      cddBase65F: cdd18Total * 0.95
    },
    provenance: {
      source: "noaa-normals",
      vendor: payload.vendor,
      datasetVersion: payload.datasetVersion,
      fetchedAtUtcIso: (/* @__PURE__ */ new Date()).toISOString(),
      license: payload.license
    },
    ingestedAtUtcIso: (/* @__PURE__ */ new Date()).toISOString()
  });
  const cacheKey = store.ingest(dataset);
  return {
    ok: true,
    event: {
      type: "climate.ingested",
      siteId: payload.siteId,
      datasetId: dataset.id,
      source: "noaa-normals",
      cacheKey
    }
  };
}

let counter = 0;
function mintId() {
  counter += 1;
  const ms = Date.now().toString(36).toUpperCase().padStart(10, "0");
  const seq = counter.toString(36).toUpperCase().padStart(6, "0");
  return `climate:${ms}${seq}`;
}
function synthWindRose(monthlyNormals) {
  const sectors = Array.from({ length: 16 }, (_, i) => ({
    sectorDeg: i * 22.5,
    speedBinHours: [0, 0, 0, 0, 0, 0]
  }));
  let sumSpeed = 0;
  let count = 0;
  for (const m of monthlyNormals) {
    const sectorIdx = Math.floor((m.prevailingWindDirDeg + 11.25) % 360 / 22.5) % 16;
    const sec = sectors[sectorIdx];
    const bin = speedBinIndex(m.avgWindSpeedMps);
    sec.speedBinHours[bin] = (sec.speedBinHours[bin] ?? 0) + 720;
    sumSpeed += m.avgWindSpeedMps;
    count += 1;
  }
  return {
    sectors,
    meanSpeedMps: count > 0 ? sumSpeed / count : 0,
    p99SpeedMps: count > 0 ? sumSpeed / count * 2.5 : 0
  };
}
function speedBinIndex(mps) {
  const upper = [1.5, 3.3, 5.4, 7.9, 10.7];
  for (let i = 0; i < upper.length; i++) {
    if (mps < upper[i]) return i;
  }
  return 5;
}
async function climateEnsureForLocation(rawPayload, deps) {
  let payload;
  try {
    payload = ClimateEnsureForLocationPayloadSchema.parse(rawPayload);
  } catch (err) {
    return {
      ok: false,
      reason: "invalid-payload",
      message: `climate.ensureForLocation payload invalid: ${err.message}`
    };
  }
  const { store } = deps;
  const skipIfPresent = payload.skipIfPresent ?? true;
  if (skipIfPresent) {
    const existing = store.resolveSite(payload.siteId);
    if (existing) {
      return {
        ok: true,
        event: {
          type: "climate.ingested",
          siteId: payload.siteId,
          datasetId: existing.id,
          source: existing.source,
          cacheKey: quantiseToCacheKey(
            existing.lat,
            existing.lon,
            existing.provenance.datasetVersion
          ),
          skipped: true
        }
      };
    }
  }
  const normals = await resolveNormals(
    payload.lat,
    payload.lon,
    { fetchImpl: deps.fetchImpl, bypassCache: deps.bypassCache }
  );
  let dataset;
  if (normals.tier !== "noaa-normals") {
    dataset = buildFallbackClimateDataset({
      id: mintId(),
      siteRef: payload.siteId,
      lat: payload.lat,
      lon: payload.lon,
      elevationM: payload.elevationM,
      timezone: payload.timezone
    });
  } else {
    let coldest = Number.POSITIVE_INFINITY;
    let hottest = Number.NEGATIVE_INFINITY;
    let hdd18Total = 0;
    let cdd18Total = 0;
    for (const m of normals.monthlyNormals) {
      if (m.avgMinDryBulbC < coldest) coldest = m.avgMinDryBulbC;
      if (m.avgMaxDryBulbC > hottest) hottest = m.avgMaxDryBulbC;
      hdd18Total += m.heatingDegreeDaysBase18;
      cdd18Total += m.coolingDegreeDaysBase18;
    }
    dataset = ClimateDatasetSchema.parse({
      id: mintId(),
      siteRef: payload.siteId,
      lat: payload.lat,
      lon: payload.lon,
      elevationM: payload.elevationM,
      timezone: payload.timezone,
      source: "noaa-normals",
      monthlyNormals: normals.monthlyNormals,
      windRose: synthWindRose([...normals.monthlyNormals]),
      designTemps: {
        heating99_6C: coldest,
        cooling0_4C: hottest,
        cooling0_4MwbC: hottest * 0.75
      },
      degreeDays: {
        hddBase18: hdd18Total,
        cddBase18: cdd18Total,
        hddBase65F: hdd18Total * 1.05,
        cddBase65F: cdd18Total * 0.95
      },
      provenance: {
        source: "noaa-normals",
        vendor: normals.vendor,
        datasetVersion: normals.datasetVersion,
        fetchedAtUtcIso: (/* @__PURE__ */ new Date()).toISOString(),
        license: normals.license
      },
      ingestedAtUtcIso: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
  const source = dataset.source;
  const cacheKey = store.ingest(dataset);
  return {
    ok: true,
    event: {
      type: "climate.ingested",
      siteId: payload.siteId,
      datasetId: dataset.id,
      source,
      cacheKey
    }
  };
}

function climateResolveSite(rawPayload, store) {
  let payload;
  try {
    payload = ClimateResolveSitePayloadSchema.parse(rawPayload);
  } catch (err) {
    return {
      ok: false,
      reason: "invalid-payload",
      message: `climate.resolveSite payload invalid: ${err.message}`
    };
  }
  const dataset = store.resolveSite(payload.siteId);
  return {
    ok: true,
    event: {
      type: "climate.resolved",
      siteId: payload.siteId,
      dataset
    }
  };
}

function climateInvalidateCache(rawPayload, store) {
  let payload;
  try {
    payload = ClimateInvalidateCachePayloadSchema.parse(rawPayload);
  } catch (err) {
    return {
      ok: false,
      reason: "invalid-payload",
      message: `climate.invalidateCache payload invalid: ${err.message}`
    };
  }
  const before = store.resolveSite(payload.siteId);
  if (!before) {
    return {
      ok: false,
      reason: "no-climate-data",
      message: `climate.invalidateCache: no climate data for site '${payload.siteId}'`
    };
  }
  store.invalidateCache(payload.siteId);
  return {
    ok: true,
    event: {
      type: "climate.cache-invalidated",
      siteId: payload.siteId
    }
  };
}

function climateSolarSample(rawPayload, _store) {
  let payload;
  try {
    payload = ClimateSolarSamplePayloadSchema.parse(rawPayload);
  } catch (err) {
    return {
      ok: false,
      reason: "invalid-payload",
      message: `climate.solarSample payload invalid: ${err.message}`
    };
  }
  try {
    const sample = solarSample(
      payload.lat,
      payload.lon,
      payload.utcIso
    );
    return {
      ok: true,
      event: { type: "climate.solar-sampled", sample }
    };
  } catch (err) {
    return {
      ok: false,
      reason: "invalid-payload",
      message: `climate.solarSample compute failed: ${err.message}`
    };
  }
}

function climateWindRose(rawPayload, store) {
  let payload;
  try {
    payload = ClimateWindRosePayloadSchema.parse(rawPayload);
  } catch (err) {
    return {
      ok: false,
      reason: "invalid-payload",
      message: `climate.windRose payload invalid: ${err.message}`
    };
  }
  const dataset = store.resolveSite(payload.siteId);
  return {
    ok: true,
    event: {
      type: "climate.wind-rose",
      siteId: payload.siteId,
      windRose: dataset?.windRose ?? null
    }
  };
}

function polygonArea(polygon) {
  return Math.abs(polygonSignedArea(polygon));
}
function polygonSignedArea(polygon) {
  const n = polygon.length;
  if (n < 3) return 0;
  let signed = 0;
  for (let i = 0; i < n; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % n];
    signed += a.x * b.z - b.x * a.z;
  }
  return signed / 2;
}
function pointInPolygon(p, polygon) {
  const n = polygon.length;
  if (n < 3) return false;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const pi = polygon[i];
    const pj = polygon[j];
    const intersect = pi.z > p.z !== pj.z > p.z && p.x < (pj.x - pi.x) * (p.z - pi.z) / (pj.z - pi.z) + pi.x;
    if (intersect) inside = !inside;
  }
  return inside;
}
function pointSegmentDistance(p, a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  if (len2 === 0) {
    const ax = p.x - a.x;
    const az = p.z - a.z;
    return Math.sqrt(ax * ax + az * az);
  }
  const t = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2)
  );
  const cx = a.x + t * dx;
  const cz = a.z + t * dz;
  const ex = p.x - cx;
  const ez = p.z - cz;
  return Math.sqrt(ex * ex + ez * ez);
}

function checkFootprintContainment(footprint, parcel, edgeClassifications, setbacks) {
  if (footprint.length === 0) {
    return { ok: true, violations: [] };
  }
  if (parcel.length < 3) {
    const violations2 = footprint.map((_, i) => ({
      vertexIndex: i,
      kind: "outside-parcel",
      message: "parcel polygon is degenerate (< 3 vertices)"
    }));
    return { ok: false, violations: violations2 };
  }
  const violations = [];
  for (let vi = 0; vi < footprint.length; vi++) {
    const v = footprint[vi];
    if (!pointInPolygon(v, parcel)) {
      violations.push({
        vertexIndex: vi,
        kind: "outside-parcel",
        message: `footprint vertex ${vi} (${v.x.toFixed(2)}, ${v.z.toFixed(2)}) lies outside the parcel polygon`
      });
      continue;
    }
    for (let ei = 0; ei < parcel.length; ei++) {
      const a = parcel[ei];
      const b = parcel[(ei + 1) % parcel.length];
      const cls = edgeClassifications[ei] ?? "unclassified";
      if (cls === "unclassified") continue;
      const required = setbacks[cls];
      if (required === null) continue;
      if (required <= 0) continue;
      const dist = pointSegmentDistance(v, a, b);
      if (dist < required) {
        violations.push({
          vertexIndex: vi,
          kind: cls === "front" ? "setback-front" : cls === "side" ? "setback-side" : "setback-rear",
          message: `footprint vertex ${vi} is ${dist.toFixed(2)}m from a ${cls} edge — setback requires ≥ ${required}m`
        });
      }
    }
  }
  return { ok: violations.length === 0, violations };
}

function checkEdgeClassifications(polygon, classifications) {
  const polygonLen = polygon.length;
  const classificationsLen = classifications.length;
  if (polygonLen === classificationsLen) {
    return {
      ok: true,
      polygonLen,
      classificationsLen,
      message: ""
    };
  }
  return {
    ok: false,
    polygonLen,
    classificationsLen,
    message: `edgeClassifications.length (${classificationsLen}) MUST equal polygon.length (${polygonLen}) per C19 §2.7 invariant 3`
  };
}

function deterministicSiteId(projectId) {
  return `site_${projectId}`;
}
function siteCreate(rawPayload, store) {
  let payload;
  try {
    payload = SiteCreatePayloadSchema.parse(rawPayload);
  } catch (err) {
    return {
      ok: false,
      reason: "invalid-payload",
      message: `site.create payload invalid: ${err.message}`
    };
  }
  const siteId = deterministicSiteId(payload.projectId);
  const boundary = payload.parcel?.boundary ?? {
    polygon: [],
    edgeClassifications: []
  };
  if (boundary.polygon.length > 0) {
    const edgeCheck = checkEdgeClassifications(
      boundary.polygon,
      boundary.edgeClassifications
    );
    if (!edgeCheck.ok) {
      return {
        ok: false,
        reason: "edge-classifications-mismatch",
        message: edgeCheck.message
      };
    }
  }
  const site = SiteModelSchema.parse({
    id: siteId,
    projectId: payload.projectId,
    name: payload.name ?? "Site",
    location: payload.location,
    parcel: {
      boundary,
      setbacks: payload.parcel?.setbacks ?? {
        front: 0,
        side: 0,
        rear: 0
      },
      maxFAR: payload.parcel?.maxFAR ?? null,
      maxHeight: payload.parcel?.maxHeight ?? null,
      zoning: { category: null, overlays: [], jurisdictionRef: null },
      area: polygonArea(boundary.polygon)
    },
    footprint: payload.footprint ?? null,
    contextBuildings: payload.contextBuildings ?? [],
    climateRef: null,
    buildingRef: null,
    provenance: { source: "user-authored", actor: "system" }
  });
  store.set(site);
  const event = {
    type: "site.created",
    siteId,
    projectId: payload.projectId
  };
  return { ok: true, event, site };
}

function siteUpdateLocation(rawPayload, store) {
  let payload;
  try {
    payload = SiteUpdateLocationPayloadSchema.parse(rawPayload);
  } catch (err) {
    return {
      ok: false,
      reason: "invalid-payload",
      message: `site.updateLocation payload invalid: ${err.message}`
    };
  }
  const current = store.getSite();
  if (!current || current.id !== payload.siteId) {
    return {
      ok: false,
      reason: "no-site",
      message: `site.updateLocation: no Site with id '${payload.siteId}' is set`
    };
  }
  const next = { ...current, location: payload.location };
  store.set(next);
  const event = {
    type: "site.location-changed",
    siteId: current.id,
    location: payload.location
  };
  return { ok: true, event, site: next };
}

function siteSetParcelBoundary(rawPayload, store) {
  let payload;
  try {
    payload = SiteSetParcelBoundaryPayloadSchema.parse(rawPayload);
  } catch (err) {
    return {
      ok: false,
      reason: "invalid-payload",
      message: `site.setParcelBoundary payload invalid: ${err.message}`
    };
  }
  const current = store.getSite();
  if (!current || current.id !== payload.siteId) {
    return {
      ok: false,
      reason: "no-site",
      message: `site.setParcelBoundary: no Site with id '${payload.siteId}' is set`
    };
  }
  if (current.parcel.boundary.polygon.length > 0) {
    return {
      ok: false,
      reason: "parcel-already-set",
      message: `site.setParcelBoundary: parcel polygon is immutable post-create per C19 §1.4 — use site.replace to change it`
    };
  }
  const edgeCheck = checkEdgeClassifications(
    payload.boundary.polygon,
    payload.boundary.edgeClassifications
  );
  if (!edgeCheck.ok) {
    return {
      ok: false,
      reason: "edge-classifications-mismatch",
      message: edgeCheck.message
    };
  }
  const area = polygonArea(payload.boundary.polygon);
  const provenance = payload.provenance ?? null;
  const next = {
    ...current,
    parcel: {
      ...current.parcel,
      boundary: payload.boundary,
      provenance,
      area
    }
  };
  store.set(next);
  const event = {
    type: "site.parcel-boundary-set",
    siteId: current.id,
    boundary: payload.boundary,
    area,
    provenance
  };
  return { ok: true, event, site: next };
}

function siteUpdateZoning(rawPayload, store) {
  let payload;
  try {
    payload = SiteUpdateZoningPayloadSchema.parse(rawPayload);
  } catch (err) {
    return {
      ok: false,
      reason: "invalid-payload",
      message: `site.updateZoning payload invalid: ${err.message}`
    };
  }
  const current = store.getSite();
  if (!current || current.id !== payload.siteId) {
    return {
      ok: false,
      reason: "no-site",
      message: `site.updateZoning: no Site with id '${payload.siteId}' is set`
    };
  }
  const nextParcel = {
    ...current.parcel,
    setbacks: payload.setbacks ? { ...current.parcel.setbacks, ...payload.setbacks } : current.parcel.setbacks,
    maxFAR: payload.maxFAR === void 0 ? current.parcel.maxFAR : payload.maxFAR,
    maxHeight: payload.maxHeight === void 0 ? current.parcel.maxHeight : payload.maxHeight,
    zoning: payload.zoning ? { ...current.parcel.zoning, ...payload.zoning } : current.parcel.zoning,
    // ADR-0270 option A / C58 §1.7a — persist the inset ring as the buildable TRUTH.
    // `undefined` = untouched (delta semantics, as every field above); an explicit `null`
    // CLEARS a stale envelope rather than leaving a ring that no longer describes this
    // parcel — which would be worse than none, because it still looks authoritative.
    buildableRing: payload.buildableRing === void 0 ? current.parcel.buildableRing ?? null : payload.buildableRing,
    // §GIS-ENVELOPE-DETERMINATION-PERSIST (L-1654) — the FULL dated determination record,
    // same delta semantics as `buildableRing` (omitted = untouched · null = explicit clear).
    // `?? null` keeps legacy parcels (saved before the field existed) well-formed.
    buildableDetermination: payload.buildableDetermination === void 0 ? current.parcel.buildableDetermination ?? null : payload.buildableDetermination
  };
  const next = { ...current, parcel: nextParcel };
  store.set(next);
  const event = {
    type: "site.zoning-updated",
    siteId: current.id,
    parcel: nextParcel
  };
  return { ok: true, event, site: next };
}

function siteSetFootprint(rawPayload, store) {
  let payload;
  try {
    payload = SiteSetFootprintPayloadSchema.parse(rawPayload);
  } catch (err) {
    return {
      ok: false,
      reason: "invalid-payload",
      message: `site.setFootprint payload invalid: ${err.message}`
    };
  }
  const current = store.getSite();
  if (!current || current.id !== payload.siteId) {
    return {
      ok: false,
      reason: "no-site",
      message: `site.setFootprint: no Site with id '${payload.siteId}' is set`
    };
  }
  const containment = checkFootprintContainment(
    payload.footprint.polygon,
    current.parcel.boundary.polygon,
    current.parcel.boundary.edgeClassifications,
    current.parcel.setbacks
  );
  const next = { ...current, footprint: payload.footprint };
  store.set(next);
  const event = {
    type: "site.footprint-set",
    siteId: current.id,
    footprint: payload.footprint
  };
  return {
    ok: true,
    event,
    site: next,
    ...containment.ok ? {} : { warnings: { containment } }
  };
}

function siteClearFootprint(rawPayload, store) {
  let payload;
  try {
    payload = SiteClearFootprintPayloadSchema.parse(rawPayload);
  } catch (err) {
    return {
      ok: false,
      reason: "invalid-payload",
      message: `site.clearFootprint payload invalid: ${err.message}`
    };
  }
  const current = store.getSite();
  if (!current || current.id !== payload.siteId) {
    return {
      ok: false,
      reason: "no-site",
      message: `site.clearFootprint: no Site with id '${payload.siteId}' is set`
    };
  }
  const next = { ...current, footprint: null };
  store.set(next);
  const event = {
    type: "site.footprint-cleared",
    siteId: current.id
  };
  return { ok: true, event, site: next };
}

function siteAddContextBuilding(rawPayload, store) {
  let payload;
  try {
    payload = SiteAddContextBuildingPayloadSchema.parse(rawPayload);
  } catch (err) {
    return {
      ok: false,
      reason: "invalid-payload",
      message: `site.addContextBuilding payload invalid: ${err.message}`
    };
  }
  const current = store.getSite();
  if (!current || current.id !== payload.siteId) {
    return {
      ok: false,
      reason: "no-site",
      message: `site.addContextBuilding: no Site with id '${payload.siteId}' is set`
    };
  }
  const newId = payload.contextBuilding.id;
  const exists = current.contextBuildings.some((cb) => cb.id === newId);
  if (exists) {
    return {
      ok: false,
      reason: "context-building-duplicate-id",
      message: `site.addContextBuilding: id '${newId}' already exists — use site.replaceContextBuilding to swap`
    };
  }
  const next = {
    ...current,
    contextBuildings: [...current.contextBuildings, payload.contextBuilding]
  };
  store.set(next);
  const event = {
    type: "site.context-building-added",
    siteId: current.id,
    contextBuildingId: newId
  };
  return { ok: true, event, site: next };
}

function siteRemoveContextBuilding(rawPayload, store) {
  let payload;
  try {
    payload = SiteRemoveContextBuildingPayloadSchema.parse(rawPayload);
  } catch (err) {
    return {
      ok: false,
      reason: "invalid-payload",
      message: `site.removeContextBuilding payload invalid: ${err.message}`
    };
  }
  const current = store.getSite();
  if (!current || current.id !== payload.siteId) {
    return {
      ok: false,
      reason: "no-site",
      message: `site.removeContextBuilding: no Site with id '${payload.siteId}' is set`
    };
  }
  const idx = current.contextBuildings.findIndex(
    (cb) => cb.id === payload.contextBuildingId
  );
  if (idx === -1) {
    return {
      ok: false,
      reason: "context-building-not-found",
      message: `site.removeContextBuilding: no ContextBuilding with id '${payload.contextBuildingId}' on site '${payload.siteId}'`
    };
  }
  const nextArr = current.contextBuildings.filter((_, i) => i !== idx);
  const next = { ...current, contextBuildings: nextArr };
  store.set(next);
  const event = {
    type: "site.context-building-removed",
    siteId: current.id,
    contextBuildingId: payload.contextBuildingId
  };
  return { ok: true, event, site: next };
}

function siteReplaceContextBuilding(rawPayload, store) {
  let payload;
  try {
    payload = SiteReplaceContextBuildingPayloadSchema.parse(rawPayload);
  } catch (err) {
    return {
      ok: false,
      reason: "invalid-payload",
      message: `site.replaceContextBuilding payload invalid: ${err.message}`
    };
  }
  const current = store.getSite();
  if (!current || current.id !== payload.siteId) {
    return {
      ok: false,
      reason: "no-site",
      message: `site.replaceContextBuilding: no Site with id '${payload.siteId}' is set`
    };
  }
  const idx = current.contextBuildings.findIndex(
    (cb) => cb.id === payload.contextBuildingId
  );
  if (idx === -1) {
    return {
      ok: false,
      reason: "context-building-not-found",
      message: `site.replaceContextBuilding: no ContextBuilding with id '${payload.contextBuildingId}' on site '${payload.siteId}'`
    };
  }
  const replacementId = payload.replacement.id;
  if (replacementId !== payload.contextBuildingId) {
    const collision = current.contextBuildings.some(
      (cb, i) => i !== idx && cb.id === replacementId
    );
    if (collision) {
      return {
        ok: false,
        reason: "context-building-duplicate-id",
        message: `site.replaceContextBuilding: replacement id '${replacementId}' collides with an unrelated existing entry`
      };
    }
  }
  const nextArr = current.contextBuildings.map(
    (cb, i) => i === idx ? payload.replacement : cb
  );
  const next = { ...current, contextBuildings: nextArr };
  store.set(next);
  const event = {
    type: "site.context-building-replaced",
    siteId: current.id,
    contextBuildingId: payload.contextBuildingId,
    replacementId
  };
  return { ok: true, event, site: next };
}

function siteLinkClimate(rawPayload, store) {
  let payload;
  try {
    payload = SiteLinkClimatePayloadSchema.parse(rawPayload);
  } catch (err) {
    return {
      ok: false,
      reason: "invalid-payload",
      message: `site.linkClimate payload invalid: ${err.message}`
    };
  }
  const current = store.getSite();
  if (!current || current.id !== payload.siteId) {
    return {
      ok: false,
      reason: "no-site",
      message: `site.linkClimate: no Site with id '${payload.siteId}' is set`
    };
  }
  const next = { ...current, climateRef: payload.climateRef };
  store.set(next);
  return {
    ok: true,
    event: {
      type: "site.climate-linked",
      siteId: current.id,
      climateRef: payload.climateRef
    },
    site: next
  };
}

function siteLinkBuilding(rawPayload, store) {
  let payload;
  try {
    payload = SiteLinkBuildingPayloadSchema.parse(rawPayload);
  } catch (err) {
    return {
      ok: false,
      reason: "invalid-payload",
      message: `site.linkBuilding payload invalid: ${err.message}`
    };
  }
  const current = store.getSite();
  if (!current || current.id !== payload.siteId) {
    return {
      ok: false,
      reason: "no-site",
      message: `site.linkBuilding: no Site with id '${payload.siteId}' is set`
    };
  }
  const next = { ...current, buildingRef: payload.buildingRef };
  store.set(next);
  return {
    ok: true,
    event: {
      type: "site.building-linked",
      siteId: current.id,
      buildingRef: payload.buildingRef
    },
    site: next
  };
}

function siteReplace(rawPayload, store) {
  let payload;
  try {
    payload = SiteReplacePayloadSchema.parse(rawPayload);
  } catch (err) {
    return {
      ok: false,
      reason: "invalid-payload",
      message: `site.replace payload invalid: ${err.message}`
    };
  }
  const current = store.getSite();
  if (!current || current.id !== payload.siteId) {
    return {
      ok: false,
      reason: "no-site",
      message: `site.replace: no Site with id '${payload.siteId}' is set`
    };
  }
  if (payload.replacement.id !== current.id) {
    return {
      ok: false,
      reason: "id-mismatch",
      message: `site.replace: replacement.id ('${payload.replacement.id}') MUST equal current.id ('${current.id}') per C19 §1.4 / §2.1`
    };
  }
  if (payload.replacement.projectId !== current.projectId) {
    return {
      ok: false,
      reason: "project-mismatch",
      message: `site.replace: replacement.projectId ('${payload.replacement.projectId}') MUST equal current.projectId ('${current.projectId}') per C19 §1.1`
    };
  }
  let parsed;
  try {
    parsed = SiteModelSchema.parse(payload.replacement);
  } catch (err) {
    return {
      ok: false,
      reason: "invalid-payload",
      message: `site.replace: replacement does not pass SiteModelSchema: ${err.message}`
    };
  }
  const priorSnapshot = current;
  store.set(parsed);
  return {
    ok: true,
    event: {
      type: "site.replaced",
      siteId: current.id,
      priorSnapshot
    },
    site: parsed
  };
}

function siteDelete(rawPayload, store) {
  let payload;
  try {
    payload = SiteDeletePayloadSchema.parse(rawPayload);
  } catch (err) {
    const errMsg = err.message ?? "";
    if (/cascadeFromProjectDelete/.test(errMsg)) {
      return {
        ok: false,
        reason: "delete-not-cascaded",
        message: `site.delete: FORBIDDEN in normal flow per C19 §1.1 — only the project-delete cascade may call this command. Pass cascadeFromProjectDelete: true to confirm.`
      };
    }
    return {
      ok: false,
      reason: "invalid-payload",
      message: `site.delete payload invalid: ${errMsg}`
    };
  }
  const current = store.getSite();
  if (!current || current.id !== payload.siteId) {
    return {
      ok: false,
      reason: "no-site",
      message: `site.delete: no Site with id '${payload.siteId}' is set`
    };
  }
  const priorSnapshot = current;
  store.set(null);
  return {
    ok: true,
    event: {
      type: "site.deleted",
      siteId: current.id,
      priorSnapshot
    },
    // The site is now null; for consistency with the union we
    // return the prior model as `site` — the L5 caller knows the
    // store is empty post-delete.
    site: priorSnapshot
  };
}

function registerFamilyFromJson(rawJson, store, opts = {}) {
  let outcome;
  try {
    outcome = runFamilyPipeline(rawJson, opts);
  } catch (err) {
    const message = err instanceof Error ? err.message : `runFamilyPipeline threw a non-Error value: ${String(err)}`;
    return {
      ok: false,
      kind: "pipeline-threw",
      message
    };
  }
  if (!isPipelineSuccess(outcome)) {
    return {
      ok: false,
      kind: "ingestion-failed",
      message: outcome.message,
      issues: outcome.issues
    };
  }
  const registered = outcome.registered;
  const id = registered.identity.id;
  const existing = store.findById(id);
  const overwrite = opts.overwriteExisting !== false;
  if (existing && !overwrite) {
    return {
      ok: false,
      kind: "duplicate",
      message: `Family ${registered.identity.id} already registered (set overwriteExisting:true to replace)`
    };
  }
  if (existing) {
    store.unregister(id);
  }
  store.register(registered);
  return {
    ok: true,
    registered,
    replacedExisting: !!existing
  };
}

class InspectSelectionStore {
  _selection = null;
  _listeners = /* @__PURE__ */ new Set();
  _disposed = false;
  /**
   * Current selection.  `null` means nothing is selected — the UI should
   * collapse the inspect tab to the project-root view in that case.
   */
  get() {
    return this._selection;
  }
  /**
   * Replace the selection.  Schema-validates the input (Zod throws on
   * invalid input — this is intentional; the caller is expected to mint
   * valid selections from the master-tree projection).  Fires all
   * subscribers on success.  No-op + warn if the store has been disposed.
   */
  set(selection) {
    if (this._disposed) {
      console.warn("[InspectSelectionStore] set() called after dispose() — ignoring");
      return;
    }
    const parsed = InspectSelectionSchema.parse(selection);
    this._selection = parsed;
    this._notify();
  }
  /**
   * Clear the selection.  Fires subscribers ONLY when there was a
   * selection to clear — clearing an already-null store is a true no-op
   * (matches the "no spurious notify" convention used by the sibling
   * apartment / family stores).
   */
  clear() {
    if (this._disposed) return;
    const wasNull = this._selection === null;
    this._selection = null;
    if (!wasNull) this._notify();
  }
  /**
   * Subscribe to selection changes.  Returns a disposer — call it to
   * unsubscribe.  After `dispose()` the returned disposer is a no-op and
   * no new listeners are accepted.
   */
  subscribe(listener) {
    if (this._disposed) return () => {
    };
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }
  /**
   * Tear down: clear all listeners + null the selection.  After dispose,
   * `set()` warns and ignores, `clear()` is a no-op, `subscribe()`
   * returns a no-op disposer.  Idempotent.
   */
  dispose() {
    this._disposed = true;
    this._listeners.clear();
    this._selection = null;
  }
  _notify() {
    for (const l of this._listeners) {
      try {
        l();
      } catch (err) {
        console.error("[InspectSelectionStore] listener threw:", err);
      }
    }
  }
}

function initialState$2() {
  return Object.freeze({
    filter: Object.freeze({}),
    sort: Object.freeze([]),
    groupBy: void 0,
    selectedRowIds: Object.freeze([])
  });
}
class DataStore {
  _state = initialState$2();
  _listeners = /* @__PURE__ */ new Set();
  _disposed = false;
  /**
   * Current snapshot. The returned object is a defensively-frozen
   * clone — mutation outside the store cannot leak into the internal
   * state, and `Object.freeze` flags accidental writes at runtime
   * (strict mode throws on assignment to frozen properties).
   */
  get() {
    return this._state;
  }
  /**
   * Replace the active filter. Schema-validated via `DataFilterSchema`;
   * Zod throws on invalid shape (this is intentional — the caller is
   * expected to mint valid filters from the filter-chip UI). Fires
   * subscribers on success. No-op + warn after `dispose()`.
   */
  setFilter(filter) {
    if (this._disposed) {
      console.warn("[DataStore] setFilter() after dispose — ignored");
      return;
    }
    const parsed = DataFilterSchema.parse(filter);
    this._state = freezeState({
      filter: parsed,
      sort: this._state.sort,
      groupBy: this._state.groupBy,
      selectedRowIds: this._state.selectedRowIds
    });
    this._notify();
  }
  /**
   * Replace the multi-column sort spec. Empty array means "no sort"
   * (the grid renders in insertion order). Schema-validated via
   * `DataSortSchema`.
   */
  setSort(sort) {
    if (this._disposed) {
      console.warn("[DataStore] setSort() after dispose — ignored");
      return;
    }
    const parsed = DataSortSchema.parse(sort);
    this._state = freezeState({
      filter: this._state.filter,
      sort: parsed,
      groupBy: this._state.groupBy,
      selectedRowIds: this._state.selectedRowIds
    });
    this._notify();
  }
  /**
   * Replace the group-by selector. Pass `undefined` to clear (renders
   * as a flat list). Schema-validated via `DataGroupBySchema` when
   * defined.
   */
  setGroupBy(groupBy) {
    if (this._disposed) {
      console.warn("[DataStore] setGroupBy() after dispose — ignored");
      return;
    }
    const parsed = groupBy === void 0 ? void 0 : DataGroupBySchema.parse(groupBy);
    this._state = freezeState({
      filter: this._state.filter,
      sort: this._state.sort,
      groupBy: parsed,
      selectedRowIds: this._state.selectedRowIds
    });
    this._notify();
  }
  /**
   * Replace the selected-row id set. Element ids are arbitrary
   * strings at this layer (branded-id integrity is enforced by the
   * caller — see ApartmentParametersStore for the precedent).
   */
  setSelectedRows(ids) {
    if (this._disposed) {
      console.warn("[DataStore] setSelectedRows() after dispose — ignored");
      return;
    }
    const cloned = Object.freeze([...ids]);
    this._state = freezeState({
      filter: this._state.filter,
      sort: this._state.sort,
      groupBy: this._state.groupBy,
      selectedRowIds: cloned
    });
    this._notify();
  }
  /**
   * Empty the selection. Fires subscribers ONLY when there was a
   * selection to clear (matches the "no spurious notify" convention
   * used by `InspectSelectionStore.clear()`).
   */
  clearSelection() {
    if (this._disposed) return;
    if (this._state.selectedRowIds.length === 0) return;
    this._state = freezeState({
      filter: this._state.filter,
      sort: this._state.sort,
      groupBy: this._state.groupBy,
      selectedRowIds: Object.freeze([])
    });
    this._notify();
  }
  /**
   * Restore the initial state (empty filter / no sort / no group-by /
   * empty selection). Always fires subscribers — `reset()` is an
   * explicit user action and downstream consumers should re-render.
   */
  reset() {
    if (this._disposed) {
      console.warn("[DataStore] reset() after dispose — ignored");
      return;
    }
    this._state = initialState$2();
    this._notify();
  }
  /**
   * Subscribe to state-change notifications. Listener receives the
   * fresh snapshot on every accepted setter. Returns an unsubscribe
   * disposer (idempotent). No-op disposer after `dispose()`.
   */
  subscribe(listener) {
    if (this._disposed) return () => {
    };
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }
  /**
   * Tear down: clear listeners + reset state. After dispose, setters
   * warn + ignore, `clearSelection()` is a no-op, `subscribe()`
   * returns a no-op disposer. Idempotent.
   */
  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this._listeners.clear();
    this._state = initialState$2();
  }
  _notify() {
    const snapshot = this._state;
    for (const l of this._listeners) {
      try {
        l(snapshot);
      } catch (err) {
        console.error("[DataStore] listener threw:", err);
      }
    }
  }
}
function createDataStore() {
  return new DataStore();
}
function freezeState(next) {
  return Object.freeze({
    filter: Object.freeze({ ...next.filter }),
    sort: Object.freeze([...next.sort]),
    groupBy: next.groupBy,
    selectedRowIds: Object.freeze([...next.selectedRowIds])
  });
}

function initialState$1() {
  return Object.freeze({
    overrides: freezeMap(/* @__PURE__ */ new Map()),
    isActive: false,
    sourceSelection: null
  });
}
class IsolationStateStore {
  _state = initialState$1();
  _listeners = /* @__PURE__ */ new Set();
  _disposed = false;
  /**
   * Current snapshot. The returned object is frozen and the contained
   * `overrides` Map is a frozen wrapper — outside mutation attempts
   * throw rather than silently corrupting state.
   */
  get() {
    return this._state;
  }
  /**
   * Apply an isolation derived from `selection` + `elements`. Delegates
   * to the L1-pure `buildIsolationIntent`; the store contributes the
   * state container + subscriber fan-out + dispose lifecycle.
   *
   * `isActive` flips to `true` even when `elements` is empty — the
   * user explicitly asked for isolation; an empty element set is a
   * valid "isolate this empty subtree" answer (the UI may still want
   * to show the active badge / dim toggle).
   *
   * No-op + warn after `dispose()`.
   */
  applyIsolation(selection, elements, opts) {
    if (this._disposed) {
      console.warn("[IsolationStateStore] applyIsolation() after dispose — ignored");
      return;
    }
    const overrides = buildIsolationIntent(selection, elements, opts);
    const cloned = new Map(overrides);
    this._state = Object.freeze({
      overrides: freezeMap(cloned),
      isActive: true,
      sourceSelection: selection
    });
    this._notify();
  }
  /**
   * Clear the isolation: empty overrides, inactive, no source. Fires
   * subscribers ONLY when the store was previously active — matches
   * the "no spurious notify" convention used by `DataStore.clearSelection()`
   * and `InspectSelectionStore.clear()`.
   */
  clearIsolation() {
    if (this._disposed) return;
    if (!this._state.isActive) return;
    this._state = initialState$1();
    this._notify();
  }
  /**
   * Alias for `clearIsolation()`. Provided so the public surface
   * matches the lifecycle vocabulary used by sibling stores (`reset()`
   * on DataStore / RoomParametersStore / etc.). Honours the same
   * "no spurious notify when already inactive" contract.
   */
  reset() {
    this.clearIsolation();
  }
  /**
   * Subscribe to state-change notifications. Listener receives the
   * fresh snapshot on every accepted mutation. Returns an unsubscribe
   * disposer (idempotent). No-op disposer after `dispose()`.
   */
  subscribe(listener) {
    if (this._disposed) return () => {
    };
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }
  /**
   * Tear down: clear listeners + reset state. After dispose, mutators
   * warn + ignore (`applyIsolation`) or no-op (`clearIsolation` /
   * `reset`), and `subscribe()` returns a no-op disposer. Idempotent.
   */
  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this._listeners.clear();
    this._state = initialState$1();
  }
  _notify() {
    const snapshot = this._state;
    for (const l of this._listeners) {
      try {
        l(snapshot);
      } catch (err) {
        console.error("[IsolationStateStore] listener threw:", err);
      }
    }
  }
}
function createIsolationStateStore() {
  return new IsolationStateStore();
}
function freezeMap(source) {
  const frozen = source;
  const throwFrozen = (method) => {
    throw new TypeError(
      `[IsolationStateStore] cannot ${method}() on a frozen snapshot — call applyIsolation() / clearIsolation() instead`
    );
  };
  Object.defineProperty(frozen, "set", {
    value: () => throwFrozen("set"),
    writable: false,
    configurable: false
  });
  Object.defineProperty(frozen, "delete", {
    value: () => throwFrozen("delete"),
    writable: false,
    configurable: false
  });
  Object.defineProperty(frozen, "clear", {
    value: () => throwFrozen("clear"),
    writable: false,
    configurable: false
  });
  return frozen;
}

function initialState() {
  return Object.freeze({
    drawingSets: Object.freeze([]),
    activeDrawingSetId: null
  });
}
class DrawingSetStore {
  _state = initialState();
  _listeners = /* @__PURE__ */ new Set();
  _now;
  _disposed = false;
  constructor(opts = {}) {
    this._now = opts.now ?? (() => /* @__PURE__ */ new Date());
  }
  /**
   * Current snapshot.  The returned object is frozen and the contained
   * `drawingSets` array is a fresh frozen array per snapshot —
   * outside mutation attempts throw rather than silently corrupting
   * state.
   */
  get() {
    return this._state;
  }
  /**
   * Subscribe to state-change notifications.  Listener receives the
   * fresh snapshot on every accepted mutation.  Returns an unsubscribe
   * disposer (idempotent).  No-op disposer after `dispose()`.
   */
  subscribe(listener) {
    if (this._disposed) return () => {
    };
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }
  /**
   * Add a new DrawingSet.  Schema-validated via `DrawingSetSchema`;
   * Zod throws on invalid shape (this is intentional — the caller is
   * expected to mint valid sets).  Throws on duplicate id.
   */
  createDrawingSet(ds) {
    if (this._disposed) {
      console.warn("[DrawingSetStore] createDrawingSet() after dispose — ignored");
      return;
    }
    const parsed = DrawingSetSchema.parse(ds);
    if (this._state.drawingSets.some((d) => d.id === parsed.id)) {
      throw new Error(
        `[DrawingSetStore] duplicate DrawingSet id "${parsed.id}"`
      );
    }
    const cloned = cloneDrawingSet(parsed);
    const next = [...this._state.drawingSets, cloned];
    this._commit(next, this._state.activeDrawingSetId);
  }
  /**
   * Patch an existing DrawingSet.  The patch is shallow-merged onto
   * the existing row and the result is re-validated against
   * `DrawingSetSchema`.  Throws on unknown id, invalid result, or an
   * attempt to change the id.
   */
  updateDrawingSet(id, patch) {
    if (this._disposed) {
      console.warn("[DrawingSetStore] updateDrawingSet() after dispose — ignored");
      return;
    }
    const idx = this._state.drawingSets.findIndex((d) => d.id === id);
    if (idx === -1) {
      throw new Error(`[DrawingSetStore] unknown DrawingSet id "${id}"`);
    }
    const existing = this._state.drawingSets[idx];
    const merged = { ...existing, ...patch, id: existing.id };
    const parsed = DrawingSetSchema.parse(merged);
    const cloned = cloneDrawingSet(parsed);
    const next = [...this._state.drawingSets];
    next[idx] = cloned;
    this._commit(next, this._state.activeDrawingSetId);
  }
  /**
   * Drop a DrawingSet by id.  If the deleted id was active, the active
   * pointer is cleared to `null`.  No-op (and no notify) when the id
   * is not present — matches the "no spurious notify" convention of
   * sibling stores.
   */
  deleteDrawingSet(id) {
    if (this._disposed) {
      console.warn("[DrawingSetStore] deleteDrawingSet() after dispose — ignored");
      return;
    }
    const idx = this._state.drawingSets.findIndex((d) => d.id === id);
    if (idx === -1) return;
    const next = this._state.drawingSets.filter((_, i) => i !== idx);
    const nextActive = this._state.activeDrawingSetId === id ? null : this._state.activeDrawingSetId;
    this._commit(next, nextActive);
  }
  /**
   * Focus a DrawingSet (or clear focus with `null`).  Throws if `id`
   * is not null AND not present in `drawingSets`.
   */
  setActiveDrawingSet(id) {
    if (this._disposed) {
      console.warn("[DrawingSetStore] setActiveDrawingSet() after dispose — ignored");
      return;
    }
    if (id !== null && !this._state.drawingSets.some((d) => d.id === id)) {
      throw new Error(`[DrawingSetStore] unknown DrawingSet id "${id}"`);
    }
    this._commit(this._state.drawingSets, id);
  }
  /**
   * Append a Revision row to a DrawingSet.  Schema-validated via
   * `RevisionSchema`.  The new revision's `letter` MUST be unique
   * within the parent set's existing `revisions[]`.  On success, the
   * parent set's `currentRevision` is bumped to the new letter
   * automatically (callers may overwrite via a separate
   * `updateDrawingSet` call if they want to keep the old current).
   */
  addRevision(drawingSetId, revision) {
    if (this._disposed) {
      console.warn("[DrawingSetStore] addRevision() after dispose — ignored");
      return;
    }
    const parsed = RevisionSchema.parse(revision);
    const idx = this._state.drawingSets.findIndex((d) => d.id === drawingSetId);
    if (idx === -1) {
      throw new Error(
        `[DrawingSetStore] unknown DrawingSet id "${drawingSetId}"`
      );
    }
    const existing = this._state.drawingSets[idx];
    if (existing.revisions.some((r) => r.letter === parsed.letter)) {
      throw new Error(
        `[DrawingSetStore] duplicate revision letter "${parsed.letter}" in DrawingSet "${drawingSetId}"`
      );
    }
    const updated = {
      ...existing,
      revisions: [...existing.revisions, parsed],
      currentRevision: parsed.letter
    };
    const reparsed = DrawingSetSchema.parse(updated);
    const cloned = cloneDrawingSet(reparsed);
    const next = [...this._state.drawingSets];
    next[idx] = cloned;
    this._commit(next, this._state.activeDrawingSetId);
  }
  /**
   * Transition a DrawingSet to a new status.  Validates the status
   * via `DrawingSetStatusSchema`; throws on unknown id or unknown
   * status.  When moving to `'issued'`, stamps `issueDate` to the
   * store's `now()` (the caller may overwrite via a separate
   * `updateDrawingSet` call).
   */
  markStatus(drawingSetId, status) {
    if (this._disposed) {
      console.warn("[DrawingSetStore] markStatus() after dispose — ignored");
      return;
    }
    const parsedStatus = DrawingSetStatusSchema.parse(status);
    const idx = this._state.drawingSets.findIndex((d) => d.id === drawingSetId);
    if (idx === -1) {
      throw new Error(
        `[DrawingSetStore] unknown DrawingSet id "${drawingSetId}"`
      );
    }
    const existing = this._state.drawingSets[idx];
    const patched = { ...existing, status: parsedStatus };
    if (parsedStatus === "issued") {
      patched.issueDate = this._now().toISOString();
    }
    const reparsed = DrawingSetSchema.parse(patched);
    const cloned = cloneDrawingSet(reparsed);
    const next = [...this._state.drawingSets];
    next[idx] = cloned;
    this._commit(next, this._state.activeDrawingSetId);
  }
  /**
   * Append a SheetReference to a DrawingSet.  The whole DrawingSet is
   * re-parsed so the schema-level per-discipline order-uniqueness
   * refine still holds (throws on duplicate `order` in the same
   * discipline).  Throws on unknown DrawingSet id.
   */
  addSheetToSet(drawingSetId, sheet) {
    if (this._disposed) {
      console.warn("[DrawingSetStore] addSheetToSet() after dispose — ignored");
      return;
    }
    const idx = this._state.drawingSets.findIndex((d) => d.id === drawingSetId);
    if (idx === -1) {
      throw new Error(
        `[DrawingSetStore] unknown DrawingSet id "${drawingSetId}"`
      );
    }
    const existing = this._state.drawingSets[idx];
    const updated = {
      ...existing,
      sheets: [...existing.sheets, sheet]
    };
    const reparsed = DrawingSetSchema.parse(updated);
    const cloned = cloneDrawingSet(reparsed);
    const next = [...this._state.drawingSets];
    next[idx] = cloned;
    this._commit(next, this._state.activeDrawingSetId);
  }
  /**
   * Remove a SheetReference by sheetId from a DrawingSet.  Idempotent
   * when the sheetId is not present — no notify in that case.  Throws
   * on unknown DrawingSet id.
   */
  removeSheetFromSet(drawingSetId, sheetId) {
    if (this._disposed) {
      console.warn("[DrawingSetStore] removeSheetFromSet() after dispose — ignored");
      return;
    }
    const idx = this._state.drawingSets.findIndex((d) => d.id === drawingSetId);
    if (idx === -1) {
      throw new Error(
        `[DrawingSetStore] unknown DrawingSet id "${drawingSetId}"`
      );
    }
    const existing = this._state.drawingSets[idx];
    const filtered = existing.sheets.filter((s) => s.sheetId !== sheetId);
    if (filtered.length === existing.sheets.length) return;
    const updated = { ...existing, sheets: filtered };
    const reparsed = DrawingSetSchema.parse(updated);
    const cloned = cloneDrawingSet(reparsed);
    const next = [...this._state.drawingSets];
    next[idx] = cloned;
    this._commit(next, this._state.activeDrawingSetId);
  }
  /**
   * Look up a DrawingSet by id.  Returns `undefined` when the id is
   * not present.  The returned object is the same defensively-cloned
   * reference held inside the snapshot — safe to read, mutation
   * attempts on its top level fail in strict mode.
   */
  getDrawingSet(id) {
    return this._state.drawingSets.find((d) => d.id === id);
  }
  /**
   * Convenience accessor — `undefined` when nothing is active.
   */
  getActiveDrawingSet() {
    const id = this._state.activeDrawingSetId;
    if (id === null) return void 0;
    return this.getDrawingSet(id);
  }
  /**
   * Restore the initial state (empty list, null active).  Always
   * fires subscribers — `reset()` is an explicit user action and
   * downstream consumers should re-render.
   */
  reset() {
    if (this._disposed) {
      console.warn("[DrawingSetStore] reset() after dispose — ignored");
      return;
    }
    this._state = initialState();
    this._notify();
  }
  /**
   * Tear down: clear listeners + reset state.  After dispose, mutators
   * warn + ignore, `subscribe()` returns a no-op disposer.  Idempotent.
   */
  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this._listeners.clear();
    this._state = initialState();
  }
  _commit(drawingSets, activeDrawingSetId) {
    this._state = Object.freeze({
      drawingSets: Object.freeze([...drawingSets]),
      activeDrawingSetId
    });
    this._notify();
  }
  _notify() {
    const snapshot = this._state;
    for (const l of this._listeners) {
      try {
        l(snapshot);
      } catch (err) {
        console.error("[DrawingSetStore] listener threw:", err);
      }
    }
  }
}
function createDrawingSetStore(opts = {}) {
  return new DrawingSetStore(opts);
}
function cloneDrawingSet(ds) {
  const copy = JSON.parse(JSON.stringify(ds));
  return Object.freeze(copy);
}

const ACTIVE_VIEW_ID = "active";
const DEFAULT_ACTIVE_VIEW_STATE = Object.freeze({
  activeViewId: "view-default-3d",
  activeToolId: null
});
class ActiveViewStore extends Store {
  /** Mirrors `SelectionStore.ephemeral` — see ADR-0016 §"Risks". */
  static ephemeral = true;
  constructor(initial = DEFAULT_ACTIVE_VIEW_STATE) {
    super("active-view");
    this.state.set(ACTIVE_VIEW_ID, Object.freeze({ ...initial }));
  }
  /** Read the current active state.  Always returns a frozen object. */
  getActive() {
    return this.state.get(ACTIVE_VIEW_ID) ?? DEFAULT_ACTIVE_VIEW_STATE;
  }
  /** Replace the active state and notify subscribers via the standard
   *  patch path (so listeners observe a `DirtyDiff` the same way they
   *  do for any other store change).  Synthesises an Immer-shaped
   *  `replace` patch under path `[ACTIVE_VIEW_ID]`. */
  setActive(next) {
    const frozen = Object.freeze({ ...next });
    const patch = {
      op: "replace",
      path: [ACTIVE_VIEW_ID],
      value: frozen
    };
    this.applyPatch([patch]);
  }
}

class SheetStore extends Store {
  constructor() {
    super("sheet");
  }
  ids() {
    return [...this.state.keys()];
  }
  get(id) {
    return this.state.get(id);
  }
  /** All sheets in canonical display order (ascending `seq`).  Returns
   *  a fresh frozen array on every call — listeners use `subscribeDirty`
   *  to know when to re-fetch. */
  list() {
    const arr = [...this.state.values()];
    arr.sort((a, b) => a.seq - b.seq || a.id.localeCompare(b.id));
    return Object.freeze(arr);
  }
  /** Maximum `seq` value in the store, or `-1` if the store is empty.
   *  CreateSheet uses `nextSeq() + 1` to append at the end. */
  nextSeq() {
    let max = -1;
    for (const s of this.state.values()) if (s.seq > max) max = s.seq;
    return max;
  }
  /** Find a sheet by user-facing sheet number (e.g. 'A-001').  Returns
   *  `undefined` if no sheet with that number exists.  Matches are
   *  case-sensitive (sheet numbers are conventionally uppercase but
   *  the store does not enforce a casing policy). */
  byNumber(number) {
    for (const s of this.state.values()) if (s.number === number) return s;
    return void 0;
  }
}

const ACTIVE_SHEET_ID = "active";
const DEFAULT_ACTIVE_SHEET_STATE = Object.freeze({
  activeSheetId: null
});
class ActiveSheetStore extends Store {
  static ephemeral = true;
  constructor(initial = DEFAULT_ACTIVE_SHEET_STATE) {
    super("active-sheet");
    this.state.set(ACTIVE_SHEET_ID, Object.freeze({ ...initial }));
  }
  getActive() {
    return this.state.get(ACTIVE_SHEET_ID) ?? DEFAULT_ACTIVE_SHEET_STATE;
  }
  setActive(activeSheetId) {
    const next = Object.freeze({ activeSheetId });
    const patch = {
      op: "replace",
      path: [ACTIVE_SHEET_ID],
      value: next
    };
    this.applyPatch([patch]);
  }
}

class TitleBlockStore extends Store {
  constructor(opts = {}) {
    super("title-block");
    if (opts.initialTemplates) {
      this.seed(opts.initialTemplates);
    }
  }
  /** All template ids in stable insertion order. */
  ids() {
    return [...this.state.keys()];
  }
  /** Lookup by id.  `undefined` if the template is not registered. */
  get(id) {
    return this.state.get(id);
  }
  /** True iff the template is registered. */
  has(id) {
    return this.state.has(id);
  }
  /** All templates in insertion order.  Returns a fresh frozen array on
   *  every call — listeners use `subscribeDirty` to know when to re-fetch. */
  list() {
    return Object.freeze([...this.state.values()]);
  }
  /** Seed a batch of templates.  Used by the constructor and by the
   *  `attachStores` boot sequence after the store is constructed.  Throws
   *  on duplicate ids — the boot path must not silently shadow built-ins. */
  seed(templates) {
    for (const t of templates) {
      if (this.state.has(t.id)) {
        throw new Error(`[TitleBlockStore] duplicate template id "${t.id}" in seed`);
      }
      this.state.set(t.id, Object.freeze({ ...t }));
    }
  }
}

class ScheduleStore extends Store {
  constructor() {
    super("schedule");
  }
  ids() {
    return [...this.state.keys()];
  }
  get(id) {
    return this.state.get(id);
  }
  /** All schedules in canonical display order (ascending `seq`).
   *  Returns a fresh frozen array on every call — listeners use
   *  `subscribeDirty` to know when to re-fetch. */
  list() {
    const arr = [...this.state.values()];
    arr.sort((a, b) => a.seq - b.seq || a.id.localeCompare(b.id));
    return Object.freeze(arr);
  }
  /** Maximum `seq` value in the store, or `-1` if the store is empty.
   *  CreateSchedule uses `nextSeq() + 1` to append at the end. */
  nextSeq() {
    let max = -1;
    for (const s of this.state.values()) if (s.seq > max) max = s.seq;
    return max;
  }
  /** All schedules bound to a given element family (e.g. 'door').
   *  Returns a fresh frozen array, sorted by seq.  Useful for the
   *  "Schedules of: <family>" sidebar grouping in the editor. */
  byElementType(elementType) {
    const arr = [];
    for (const s of this.state.values()) {
      if (s.elementType === elementType) arr.push(s);
    }
    arr.sort((a, b) => a.seq - b.seq || a.id.localeCompare(b.id));
    return Object.freeze(arr);
  }
  /** Find a schedule by user-facing name (first match, case-sensitive).
   *  Names are NOT enforced unique — two schedules can carry identical
   *  display names if they bind to different element types. */
  byName(name) {
    for (const s of this.state.values()) if (s.name === name) return s;
    return void 0;
  }
}

const ACTIVE_SCHEDULE_ID = "active";
const DEFAULT_ACTIVE_SCHEDULE_STATE = Object.freeze({
  activeScheduleId: null
});
class ActiveScheduleStore extends Store {
  static ephemeral = true;
  constructor(initial = DEFAULT_ACTIVE_SCHEDULE_STATE) {
    super("active-schedule");
    this.state.set(ACTIVE_SCHEDULE_ID, Object.freeze({ ...initial }));
  }
  getActive() {
    return this.state.get(ACTIVE_SCHEDULE_ID) ?? DEFAULT_ACTIVE_SCHEDULE_STATE;
  }
  setActive(activeScheduleId) {
    const next = Object.freeze({ activeScheduleId });
    const patch = {
      op: "replace",
      path: [ACTIVE_SCHEDULE_ID],
      value: next
    };
    this.applyPatch([patch]);
  }
}

class ProjectListStore extends Store {
  /** Like SelectionStore / ActiveViewStore — the project list is UI
   *  state, not a domain store; mark it ephemeral so the future
   *  PatchEmitter ephemeral-routing branch treats project-list
   *  mutations consistently with the other UI-state stores. */
  static ephemeral = true;
  constructor() {
    super("project-list");
  }
  /** Replace the entire list (used on initial REST load).  Emits one
   *  patch batch — `replace` for any existing entries that are still
   *  present, `remove` for those that disappeared, `add` for new
   *  ones — so subscribers see the right per-id `DirtyDiff` even
   *  across a full refresh. */
  replaceAll(next) {
    const patches = [];
    const seen = /* @__PURE__ */ new Set();
    for (const summary of next) {
      const frozen = Object.freeze({ ...summary });
      seen.add(summary.id);
      const exists = this.state.has(summary.id);
      patches.push({
        op: exists ? "replace" : "add",
        path: [summary.id],
        value: frozen
      });
    }
    for (const id of this.state.keys()) {
      if (!seen.has(id)) {
        patches.push({ op: "remove", path: [id] });
      }
    }
    if (patches.length > 0) this.applyPatch(patches);
  }
  /** Insert a single project (POST /projects success path). */
  addProject(summary) {
    const frozen = Object.freeze({ ...summary });
    this.applyPatch([{
      op: this.state.has(summary.id) ? "replace" : "add",
      path: [summary.id],
      value: frozen
    }]);
  }
  /** Remove a single project (DELETE /projects/:id success). */
  removeProject(id) {
    if (!this.state.has(id)) return;
    this.applyPatch([{ op: "remove", path: [id] }]);
  }
  /** Rename a single project (PATCH /projects/:id success).  Bumps
   *  `lastModifiedAt` to `now` so the card re-sorts correctly without
   *  waiting for the next REST refresh. */
  renameProject(id, name, now = (/* @__PURE__ */ new Date()).toISOString()) {
    const existing = this.state.get(id);
    if (!existing) return;
    const next = Object.freeze({
      ...existing,
      name,
      lastModifiedAt: now
    });
    this.applyPatch([{ op: "replace", path: [id], value: next }]);
  }
  /** Update a single project's thumbnail URL (S28 §line 713 —
   *  `projectList.thumbnailUpdate` event from the bake worker).  No-op
   *  when the project is no longer in the list (the user may have
   *  deleted it after the worker started). */
  updateThumbnail(id, thumbnailUrl) {
    const existing = this.state.get(id);
    if (!existing) return;
    if (existing.thumbnailUrl === thumbnailUrl) return;
    const next = Object.freeze({
      ...existing,
      thumbnailUrl
    });
    this.applyPatch([{ op: "replace", path: [id], value: next }]);
  }
  /** Snapshot helper: ordered by `lastModifiedAt` desc, mirroring the
   *  default REST `ORDER BY updated_at DESC` so first paint matches
   *  whatever the server returned. */
  list() {
    return Array.from(this.state.values()).sort(
      (a, b) => b.lastModifiedAt.localeCompare(a.lastModifiedAt)
    );
  }
  /** True when the store has never been populated (post-construct,
   *  pre-`replaceAll`).  Used by the hub to render a skeleton
   *  vs. an empty state. */
  isEmpty() {
    return this.state.size === 0;
  }
}

class CameraPositionService {
  _pos = { x: 0, y: 0, z: 0 };
  _listeners = /* @__PURE__ */ new Set();
  // ── Write path (called by engine wiring) ────────────────────────────
  /**
   * Update the stored camera position.
   * Notifies all registered listeners synchronously after update.
   *
   * Called from the engine's FrameScheduler 'update' callback whenever
   * the camera is marked dirty by `CameraController`.
   */
  update(pos) {
    this._pos = { x: pos.x, y: pos.y, z: pos.z };
    for (const listener of this._listeners) {
      listener();
    }
  }
  // ── Read path (called by LRUElementMap._evict) ──────────────────────
  /**
   * Returns the most-recently-set camera position.
   * The returned object is freshly constructed on each `update()` call;
   * callers may hold a reference for the duration of a synchronous
   * operation (the value is immutable).
   */
  getPosition() {
    return this._pos;
  }
  // ── Subscription API ────────────────────────────────────────────────
  /**
   * Register a listener that fires after every `update()` call.
   * Returns a disposer; calling the disposer removes the listener.
   */
  subscribe(listener) {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }
  /** Number of currently-registered listeners (useful for tests). */
  get listenerCount() {
    return this._listeners.size;
  }
}
const cameraPositionService = new CameraPositionService();

const selectActiveViewId = (state) => state.activeViewId;
const selectActiveToolId = (state) => state.activeToolId;
const selectHasActiveTool = (state) => state.activeToolId !== null;
const selectActiveSheetId = (state) => state.activeSheetId;
const selectHasActiveSheet = (state) => state.activeSheetId !== null;
const selectActiveScheduleId = (state) => state.activeScheduleId;
const selectSelectionKind = (dto) => dto.kind;
const selectSelectionId = (dto) => dto.id;
const selectAnnotationCount = (state) => Object.keys(state).length;
const selectAnnotationById = (id) => (state) => state[id] ?? null;
const selectAnnotationIds = (state) => Object.keys(state);
const selectDimensionAutoMode = (settings) => settings.autoDimensionMode;
const selectShowOverallDimensions = (settings) => settings.showOverallDimensions ?? false;
const selectIsDimensionOff = (settings) => settings.autoDimensionMode === "off";
const selectIsWallToolActive = (state) => state.activeToolId === "wall";
const selectIsDoorToolActive = (state) => state.activeToolId === "door";
const selectIsWindowToolActive = (state) => state.activeToolId === "window";
const selectIsDefaultView = (state) => state.activeViewId === "view-default-3d";

export { ACTIVE_SCHEDULE_ID, ACTIVE_SHEET_ID, ACTIVE_VIEW_ID, ActiveScheduleStore, ActiveSheetStore, ActiveViewStore, ApartmentCreatePayloadSchema, ApartmentDeletePayloadSchema, ApartmentUpdatePayloadSchema, BuildingCreatePayloadSchema, BuildingDeletePayloadSchema, BuildingUpdatePayloadSchema, CameraPositionService, ClimateEnsureForLocationPayloadSchema, ClimateIngestEpwPayloadSchema, ClimateInvalidateCachePayloadSchema, ClimateRefreshNoaaPayloadSchema, ClimateResolveSitePayloadSchema, ClimateSolarSamplePayloadSchema, ClimateWindRosePayloadSchema, ConsentStore, DEFAULT_ACTIVE_SCHEDULE_STATE, DEFAULT_ACTIVE_SHEET_STATE, DEFAULT_ACTIVE_VIEW_STATE, DataStore, DeregisterIfcMetaPayloadSchema, DrawingSetStore, GrantConsentPayloadSchema, InspectSelectionStore, IsolationStateStore, LevelCreatePayloadSchema, LevelDeletePayloadSchema, LevelSetActivePayloadSchema, LevelUpdatePayloadSchema, LinkElementPayloadSchema, PROJECT_ORIGIN_ID, ProjectListStore, ProjectOriginStore, PurgeUserConsentPayloadSchema, QueryByProjectPayloadSchema, RecordArtefactPayloadSchema, RegisterIfcMetaPayloadSchema, RetentionScheduler, RevokeConsentPayloadSchema, RoomAssignToApartmentPayloadSchema, RoomCreatePayloadSchema, RoomDeletePayloadSchema, RoomUpdatePayloadSchema, ScheduleStore, SheetStore, SiteAddContextBuildingPayloadSchema, SiteClearFootprintPayloadSchema, SiteCreatePayloadSchema, SiteDeletePayloadSchema, SiteLinkBuildingPayloadSchema, SiteLinkClimatePayloadSchema, SiteQueryService, SiteRemoveContextBuildingPayloadSchema, SiteReplaceContextBuildingPayloadSchema, SiteReplacePayloadSchema, SiteSetFootprintPayloadSchema, SiteSetParcelBoundaryPayloadSchema, SiteUpdateLocationPayloadSchema, SiteUpdateZoningPayloadSchema, Store, TitleBlockStore, UpdateApprovalStatusPayloadSchema, apartmentCreate, apartmentDelete, apartmentUpdate, buildingCreate, buildingDelete, buildingUpdate, cameraPositionService, climateEnsureForLocation, climateIngestEpw, climateInvalidateCache, climateRefreshNoaa, climateResolveSite, climateSolarSample, climateWindRose, createDataStore, createDrawingSetStore, createIsolationStateStore, deregisterIfcMeta, deterministicBuildingId, deterministicSiteId, grantConsent, levelCreate, levelDelete, levelSetActive, levelUpdate, linkElement, pointInPolygonXZ, projectOriginStore, purgeUserConsent, queryByProject, recordArtefact, registerFamilyFromJson, registerIfcMeta, revokeConsent, roomAssignToApartment, roomCreate, roomDelete, roomUpdate, selectActiveScheduleId, selectActiveSheetId, selectActiveToolId, selectActiveViewId, selectAnnotationById, selectAnnotationCount, selectAnnotationIds, selectDimensionAutoMode, selectHasActiveSheet, selectHasActiveTool, selectIsDefaultView, selectIsDimensionOff, selectIsDoorToolActive, selectIsWallToolActive, selectIsWindowToolActive, selectSelectionId, selectSelectionKind, selectShowOverallDimensions, siteAddContextBuilding, siteClearFootprint, siteCreate, siteDelete, siteLinkBuilding, siteLinkClimate, siteQueryService, siteRemoveContextBuilding, siteReplace, siteReplaceContextBuilding, siteSetFootprint, siteSetParcelBoundary, siteUpdateLocation, siteUpdateZoning, updateApprovalStatus };
