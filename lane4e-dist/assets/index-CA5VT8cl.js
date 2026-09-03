import { eA as IFCLABEL, eB as IFCIDENTIFIER, eC as IFCREAL, eD as IFCBOOLEAN, eE as IFCINTEGER, eF as IFCTEXT, eG as IFCCARTESIANPOINT, eH as IFCDIRECTION, eI as IFCAXIS2PLACEMENT3D, eJ as IFCLOCALPLACEMENT, eK as IFCAXIS2PLACEMENT2D, eL as IFCRECTANGLEPROFILEDEF, eM as IFCEXTRUDEDAREASOLID, eN as IFCSHAPEREPRESENTATION, eO as IFCPRODUCTDEFINITIONSHAPE, eP as IFCPROJECT, eQ as IFCSITE, eR as IFCBUILDING, eS as IFCBUILDINGSTOREY, eT as IFCRELAGGREGATES, eU as IFCSIUNIT, eV as IFCUNITASSIGNMENT, eW as IFCGEOMETRICREPRESENTATIONCONTEXT, eX as IFCBEAM, eY as IFCCOLUMN, eZ as IFCDOOR, e_ as IFCSLAB, e$ as IFCWALLSTANDARDCASE, f0 as IFCWINDOW, f1 as IFCPERSON, f2 as IFCORGANIZATION, f3 as IFCAPPLICATION, f4 as IFCPERSONANDORGANIZATION, f5 as IFCOWNERHISTORY, f6 as provenancePredatingTheField, f7 as IFCPROPERTYSINGLEVALUE, f8 as IFCPROPERTYSET, f9 as IFCRELDEFINESBYPROPERTIES, fa as IfcAPI2, fb as Schemas, fc as IFCRELCONTAINEDINSPATIALSTRUCTURE, fd as IFCSPACE, fe as IFCPOLYLINE, ff as IFCARBITRARYCLOSEDPROFILEDEF, fg as IFCZONE, fh as IFCRELASSIGNSTOGROUP, fi as IFCGROUP, fj as IFCTHERMALTRANSMITTANCEMEASURE, fk as IFCELEMENTQUANTITY, fl as IFCQUANTITYLENGTH, fm as IFCQUANTITYAREA, fn as IFCQUANTITYVOLUME, fo as IFCQUANTITYWEIGHT, fp as IFCLENGTHMEASURE, fq as IFCAREAMEASURE, fr as IFCVOLUMEMEASURE, fs as IFCMASSMEASURE, ft as IFCVOLUMETRICFLOWRATEMEASURE, fu as IFCPOSITIVERATIOMEASURE, fv as IFCWALL } from './ElementStore-CQe7ZDFd.js';
import { S as SpanStatusCode, t as trace } from './trace-api-BIfvUk_c.js';
import './LODManager-DHqndFcX.js';
import './SteelProfileLibrary-NgbfwhrM.js';
import './three.core-Bv4ks8y-.js';
import './three.module-zvZFyv9V.js';

const IFC_GLOBAL_ID_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";
function encodeChunk(value, chars) {
  let out = "";
  let v = value;
  for (let i = 0; i < chars; i += 1) {
    out = IFC_GLOBAL_ID_ALPHABET[v & 63] + out;
    v >>>= 6;
  }
  return out;
}
function globalIdFromUuid(uuid) {
  const hex = uuid.replace(/-/g, "");
  if (hex.length !== 32 || !/^[0-9a-fA-F]{32}$/.test(hex)) {
    throw new Error(`[ifc/GlobalId] not a UUID: ${JSON.stringify(uuid)}`);
  }
  let remaining = BigInt("0x" + hex);
  const chunks = new Array(8);
  for (let i = 7; i >= 0; i -= 1) {
    const chars = i === 0 ? 1 : 3;
    const mask = (1n << BigInt(chars * 6)) - 1n;
    chunks[i] = Number(remaining & mask);
    remaining >>= BigInt(chars * 6);
  }
  let out = "";
  for (let i = 0; i < 8; i += 1) {
    out += encodeChunk(chunks[i] ?? 0, i === 0 ? 1 : 3);
  }
  return out;
}

function label(api, modelId, value) {
  return api.CreateIfcType(modelId, IFCLABEL, value);
}
function text(api, modelId, value) {
  return api.CreateIfcType(modelId, IFCTEXT, value);
}
function identifier(api, modelId, value) {
  return api.CreateIfcType(modelId, IFCIDENTIFIER, value);
}
function real(api, modelId, value) {
  return api.CreateIfcType(modelId, IFCREAL, value);
}
function boolean(api, modelId, value) {
  return api.CreateIfcType(modelId, IFCBOOLEAN, value);
}
function integer(api, modelId, value) {
  return api.CreateIfcType(modelId, IFCINTEGER, value);
}
function writeEntity(api, modelId, type, ...attrs) {
  const entity = api.CreateIfcEntity(modelId, type, ...attrs);
  api.WriteLine(modelId, entity);
  return entity;
}
function valueFromScalar(api, modelId, value) {
  if (typeof value === "string") return label(api, modelId, value);
  if (typeof value === "boolean") return boolean(api, modelId, value);
  if (Number.isInteger(value)) return integer(api, modelId, value);
  return real(api, modelId, value);
}

function buildLocalPlacement(api, modelId, parent, input) {
  const cx = input.position.x;
  const cy = input.position.y;
  const cz = input.position.z;
  const yaw = input.rotationZ ?? 0;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const origin = writeEntity(api, modelId, IFCCARTESIANPOINT, [
    real(api, modelId, cx),
    real(api, modelId, cy),
    real(api, modelId, cz)
  ]);
  const zAxis = writeEntity(api, modelId, IFCDIRECTION, [
    real(api, modelId, 0),
    real(api, modelId, 0),
    real(api, modelId, 1)
  ]);
  const xAxis = writeEntity(api, modelId, IFCDIRECTION, [
    real(api, modelId, cos),
    real(api, modelId, sin),
    real(api, modelId, 0)
  ]);
  const axis = writeEntity(api, modelId, IFCAXIS2PLACEMENT3D, origin, zAxis, xAxis);
  return writeEntity(api, modelId, IFCLOCALPLACEMENT, parent, axis);
}
function buildBoxRepresentation(api, modelId, representationContext, geometry) {
  const profileOrigin = writeEntity(api, modelId, IFCCARTESIANPOINT, [
    real(api, modelId, 0),
    real(api, modelId, 0)
  ]);
  const profileXDir = writeEntity(api, modelId, IFCDIRECTION, [
    real(api, modelId, 1),
    real(api, modelId, 0)
  ]);
  const profilePlacement = writeEntity(
    api,
    modelId,
    IFCAXIS2PLACEMENT2D,
    profileOrigin,
    profileXDir
  );
  const profile = writeEntity(
    api,
    modelId,
    IFCRECTANGLEPROFILEDEF,
    "AREA",
    // ProfileType
    null,
    // ProfileName
    profilePlacement,
    real(api, modelId, geometry.width),
    real(api, modelId, geometry.depth)
  );
  const extrudeOrigin = writeEntity(api, modelId, IFCCARTESIANPOINT, [
    real(api, modelId, 0),
    real(api, modelId, 0),
    real(api, modelId, 0)
  ]);
  const extrudeZ = writeEntity(api, modelId, IFCDIRECTION, [
    real(api, modelId, 0),
    real(api, modelId, 0),
    real(api, modelId, 1)
  ]);
  const extrudeX = writeEntity(api, modelId, IFCDIRECTION, [
    real(api, modelId, 1),
    real(api, modelId, 0),
    real(api, modelId, 0)
  ]);
  const extrudePlacement = writeEntity(
    api,
    modelId,
    IFCAXIS2PLACEMENT3D,
    extrudeOrigin,
    extrudeZ,
    extrudeX
  );
  const extrudeDirection = writeEntity(api, modelId, IFCDIRECTION, [
    real(api, modelId, 0),
    real(api, modelId, 0),
    real(api, modelId, 1)
  ]);
  const solid = writeEntity(
    api,
    modelId,
    IFCEXTRUDEDAREASOLID,
    profile,
    extrudePlacement,
    extrudeDirection,
    real(api, modelId, geometry.height)
  );
  const shapeRep = writeEntity(
    api,
    modelId,
    IFCSHAPEREPRESENTATION,
    representationContext,
    label(api, modelId, "Body"),
    label(api, modelId, "SweptSolid"),
    [solid]
  );
  return writeEntity(
    api,
    modelId,
    IFCPRODUCTDEFINITIONSHAPE,
    null,
    null,
    [shapeRep]
  );
}

function mintGlobalId(api, modelId, provider) {
  if (provider) return provider();
  return api.CreateIFCGloballyUniqueId(modelId);
}

const PRYZM_IFC_TRACER = "pryzm.ifc.export";
const tracer = trace.getTracer(PRYZM_IFC_TRACER);
function startSpan(name, attributes = {}) {
  const span = tracer.startSpan(name);
  for (const [k, v] of Object.entries(attributes)) {
    span.setAttribute(k, v);
  }
  return span;
}
function endSpanOk(span, attributes = {}) {
  for (const [k, v] of Object.entries(attributes)) {
    span.setAttribute(k, v);
  }
  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
}
function endSpanError(span, err) {
  const message = err instanceof Error ? err.message : String(err);
  span.recordException(err instanceof Error ? err : new Error(message));
  span.setStatus({ code: SpanStatusCode.ERROR, message });
  span.end();
}
function withSpan(name, fn, attributes = {}) {
  const span = startSpan(name, attributes);
  try {
    const result = fn(span);
    endSpanOk(span);
    return result;
  } catch (err) {
    endSpanError(span, err);
    throw err;
  }
}

const DEFAULT_LEVEL = {
  id: "level_default",
  name: "Ground Floor",
  elevation: 0
};
function buildUnits(api, modelId) {
  const lengthUnit = writeEntity(api, modelId, IFCSIUNIT, "LENGTHUNIT", null, "METRE");
  const areaUnit = writeEntity(api, modelId, IFCSIUNIT, "AREAUNIT", null, "SQUARE_METRE");
  const volumeUnit = writeEntity(api, modelId, IFCSIUNIT, "VOLUMEUNIT", null, "CUBIC_METRE");
  const angleUnit = writeEntity(api, modelId, IFCSIUNIT, "PLANEANGLEUNIT", null, "RADIAN");
  return writeEntity(api, modelId, IFCUNITASSIGNMENT, [
    lengthUnit,
    areaUnit,
    volumeUnit,
    angleUnit
  ]);
}
function buildOrigin(api, modelId) {
  const origin = writeEntity(
    api,
    modelId,
    IFCCARTESIANPOINT,
    [real(api, modelId, 0), real(api, modelId, 0), real(api, modelId, 0)]
  );
  const zDir = writeEntity(api, modelId, IFCDIRECTION, [
    real(api, modelId, 0),
    real(api, modelId, 0),
    real(api, modelId, 1)
  ]);
  const xDir = writeEntity(api, modelId, IFCDIRECTION, [
    real(api, modelId, 1),
    real(api, modelId, 0),
    real(api, modelId, 0)
  ]);
  const axis = writeEntity(api, modelId, IFCAXIS2PLACEMENT3D, origin, zDir, xDir);
  const placement = writeEntity(api, modelId, IFCLOCALPLACEMENT, null, axis);
  return { origin, placement };
}
function buildRepresentationContext(api, modelId, worldOrigin) {
  const zDir = writeEntity(api, modelId, IFCDIRECTION, [
    real(api, modelId, 0),
    real(api, modelId, 0),
    real(api, modelId, 1)
  ]);
  const xDir = writeEntity(api, modelId, IFCDIRECTION, [
    real(api, modelId, 1),
    real(api, modelId, 0),
    real(api, modelId, 0)
  ]);
  const ctxPlacement = writeEntity(api, modelId, IFCAXIS2PLACEMENT3D, worldOrigin, zDir, xDir);
  const trueNorth = writeEntity(api, modelId, IFCDIRECTION, [
    real(api, modelId, 0),
    real(api, modelId, 1)
  ]);
  return writeEntity(
    api,
    modelId,
    IFCGEOMETRICREPRESENTATIONCONTEXT,
    null,
    // ContextIdentifier
    label(api, modelId, "Model"),
    // ContextType
    3,
    // CoordinateSpaceDimension
    real(api, modelId, 1e-5),
    // Precision
    ctxPlacement,
    trueNorth
  );
}
function buildHierarchy(api, modelId, projectMeta, levels, ownerRefs, guid, siteModel) {
  const units = buildUnits(api, modelId);
  const { origin, placement } = buildOrigin(api, modelId);
  const repContext = buildRepresentationContext(api, modelId, origin);
  const project = writeEntity(
    api,
    modelId,
    IFCPROJECT,
    mintGlobalId(api, modelId, guid),
    ownerRefs.ownerHistory,
    label(api, modelId, projectMeta.name),
    projectMeta.description ? label(api, modelId, projectMeta.description) : null,
    null,
    // ObjectType
    null,
    // LongName
    null,
    // Phase
    [repContext],
    units
  );
  let refLatitude = null;
  let refLongitude = null;
  let refElevation = null;
  let landTitleNumber = null;
  let siteAddress = null;
  {
    console.debug(
      "[ifc-export/hierarchy] no SiteModel — IfcSite using project-origin defaults; lat/lon/elevation undefined"
    );
  }
  const site = writeEntity(
    api,
    modelId,
    IFCSITE,
    mintGlobalId(api, modelId, guid),
    ownerRefs.ownerHistory,
    label(api, modelId, "Site"),
    null,
    null,
    placement,
    null,
    null,
    "ELEMENT",
    refLatitude,
    refLongitude,
    refElevation,
    landTitleNumber,
    siteAddress
  );
  const building = writeEntity(
    api,
    modelId,
    IFCBUILDING,
    mintGlobalId(api, modelId, guid),
    ownerRefs.ownerHistory,
    label(api, modelId, "Building"),
    null,
    null,
    placement,
    null,
    null,
    "ELEMENT",
    null,
    null,
    null
  );
  const storeyLevels = levels.length > 0 ? levels : [DEFAULT_LEVEL];
  const storeys = /* @__PURE__ */ new Map();
  for (const level of storeyLevels) {
    const storey = writeEntity(
      api,
      modelId,
      IFCBUILDINGSTOREY,
      mintGlobalId(api, modelId, guid),
      ownerRefs.ownerHistory,
      label(api, modelId, level.name),
      null,
      null,
      placement,
      null,
      null,
      "ELEMENT",
      real(api, modelId, level.elevation)
    );
    storeys.set(level.id, storey);
  }
  writeEntity(
    api,
    modelId,
    IFCRELAGGREGATES,
    mintGlobalId(api, modelId, guid),
    ownerRefs.ownerHistory,
    null,
    null,
    project,
    [site]
  );
  writeEntity(
    api,
    modelId,
    IFCRELAGGREGATES,
    mintGlobalId(api, modelId, guid),
    ownerRefs.ownerHistory,
    null,
    null,
    site,
    [building]
  );
  writeEntity(
    api,
    modelId,
    IFCRELAGGREGATES,
    mintGlobalId(api, modelId, guid),
    ownerRefs.ownerHistory,
    null,
    null,
    building,
    Array.from(storeys.values())
  );
  return {
    project,
    site,
    building,
    storeys,
    representationContext: repContext,
    worldOrigin: origin,
    defaultPlacement: placement
  };
}
function resolveStorey(hierarchy, pryzmLevelId) {
  if (pryzmLevelId && hierarchy.storeys.has(pryzmLevelId)) {
    return hierarchy.storeys.get(pryzmLevelId);
  }
  const first = hierarchy.storeys.values().next().value;
  if (!first) throw new Error("No building storey available");
  return first;
}

function exportBeam(args) {
  const { api, modelId, hierarchy, ownerRefs, metaStore, beam, guid } = args;
  return withSpan(
    "pryzm.ifc.export-beam",
    () => {
      const meta = metaStore.get(beam.id);
      const storey = resolveStorey(hierarchy, beam.levelId || null);
      const [a, b] = beam.baseLine;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const length = Math.max(Math.hypot(dx, dz), 1e-3);
      const yaw = Math.atan2(dz, dx);
      const cx = (a.x + b.x) / 2;
      const cz = (a.z + b.z) / 2;
      const elevation = (a.y + b.y) / 2;
      const placement = buildLocalPlacement(api, modelId, hierarchy.defaultPlacement, {
        position: { x: cx, y: cz, z: elevation },
        rotationZ: yaw
      });
      const representation = buildBoxRepresentation(
        api,
        modelId,
        hierarchy.representationContext,
        { width: length, depth: beam.width, height: beam.depth }
      );
      const globalId = meta?.globalId ?? mintGlobalId(api, modelId, guid);
      const name = meta?.name ?? `Beam ${beam.id.slice(0, 8)}`;
      const entity = writeEntity(
        api,
        modelId,
        IFCBEAM,
        globalId,
        ownerRefs.ownerHistory,
        label(api, modelId, name),
        meta?.description ? label(api, modelId, meta.description) : null,
        meta?.objectType ? label(api, modelId, meta.objectType) : null,
        placement,
        representation,
        label(api, modelId, beam.id),
        "BEAM"
      );
      return { entity, storey, pryzmId: beam.id };
    },
    {
      "pryzm.ifc.element_id": beam.id,
      "pryzm.ifc.element_type": "beam"
    }
  );
}

function exportColumn(args) {
  const { api, modelId, hierarchy, ownerRefs, metaStore, column, guid } = args;
  return withSpan(
    "pryzm.ifc.export-column",
    () => {
      const meta = metaStore.get(column.id);
      const storey = resolveStorey(hierarchy, column.levelId || null);
      const placement = buildLocalPlacement(api, modelId, hierarchy.defaultPlacement, {
        position: { x: column.origin.x, y: column.origin.z, z: column.origin.y + column.baseOffset },
        rotationZ: column.rotation
      });
      const representation = buildBoxRepresentation(
        api,
        modelId,
        hierarchy.representationContext,
        { width: column.width, depth: column.depth, height: column.height }
      );
      const globalId = meta?.globalId ?? mintGlobalId(api, modelId, guid);
      const name = meta?.name ?? `Column ${column.id.slice(0, 8)}`;
      const entity = writeEntity(
        api,
        modelId,
        IFCCOLUMN,
        globalId,
        ownerRefs.ownerHistory,
        label(api, modelId, name),
        meta?.description ? label(api, modelId, meta.description) : null,
        meta?.objectType ? label(api, modelId, meta.objectType) : null,
        placement,
        representation,
        label(api, modelId, column.id),
        "COLUMN"
      );
      return { entity, storey, pryzmId: column.id };
    },
    {
      "pryzm.ifc.element_id": column.id,
      "pryzm.ifc.element_type": "column"
    }
  );
}

const RECTANGULAR = "rectangular";
function readProfile(record) {
  if (!record || typeof record !== "object") return null;
  const v = record.openingProfile;
  return typeof v === "string" && v.length > 0 ? v : null;
}
function readVertexCount(record) {
  if (!record || typeof record !== "object") return null;
  const ring = record.customOutline;
  if (!ring || typeof ring !== "object") return null;
  const verts = ring.vertices;
  return Array.isArray(verts) ? verts.length : null;
}
function hostOpeningOf(walls, wallId, elementId) {
  if (!walls || !wallId) return void 0;
  const wall = walls.find((w) => w.id === wallId);
  return wall?.openings?.find((o) => o.elementId === elementId);
}
function declareOpeningProfile(element, hostOpening, bbox) {
  const kind = readProfile(hostOpening) ?? readProfile(element);
  if (kind === null || kind === RECTANGULAR) return null;
  const vertexCount = kind === "custom" ? readVertexCount(hostOpening) ?? readVertexCount(element) : null;
  const shape = vertexCount !== null ? `${kind} (${vertexCount} vertices)` : kind;
  const text = `PRYZM opening profile: ${shape}. Shape NOT represented in this file: the bounding-box rectangle ${bbox.width} x ${bbox.height} m is exported in its place (C25 s1.9 declared absence; C86 s10.1).`;
  return { kind, vertexCount, text };
}
function composeDescription(metaDescription, declaration) {
  if (!declaration) return metaDescription || void 0;
  return metaDescription ? `${metaDescription} | ${declaration.text}` : declaration.text;
}

const DOOR_THICKNESS = 0.05;
function exportDoor(args) {
  const { api, modelId, hierarchy, ownerRefs, metaStore, door, guid, walls } = args;
  return withSpan(
    "pryzm.ifc.export-door",
    () => {
      const meta = metaStore.get(door.id);
      const storey = resolveStorey(hierarchy, null);
      const placement = buildLocalPlacement(api, modelId, hierarchy.defaultPlacement, {
        position: { x: door.offset, y: 0, z: door.sillHeight }
      });
      const representation = buildBoxRepresentation(
        api,
        modelId,
        hierarchy.representationContext,
        { width: door.width, depth: DOOR_THICKNESS, height: door.height }
      );
      const globalId = meta?.globalId ?? mintGlobalId(api, modelId, guid);
      const name = meta?.name ?? `Door ${door.id.slice(0, 8)}`;
      const hostOpening = hostOpeningOf(walls, door.wallId, door.id);
      const declaration = declareOpeningProfile(door, hostOpening, {
        width: door.width,
        height: door.height
      });
      const description = composeDescription(meta?.description, declaration);
      const entity = writeEntity(
        api,
        modelId,
        IFCDOOR,
        globalId,
        ownerRefs.ownerHistory,
        label(api, modelId, name),
        description ? label(api, modelId, description) : null,
        meta?.objectType ? label(api, modelId, meta.objectType) : null,
        placement,
        representation,
        label(api, modelId, door.id),
        real(api, modelId, door.height),
        real(api, modelId, door.width),
        "DOOR",
        door.doorType === "double" ? "DOUBLE_SWING_LEFT" : "SINGLE_SWING_LEFT",
        null
      );
      return { entity, storey, pryzmId: door.id };
    },
    {
      "pryzm.ifc.element_id": door.id,
      "pryzm.ifc.element_type": "door"
    }
  );
}

function exportSlab(args) {
  const { api, modelId, hierarchy, ownerRefs, metaStore, slab, guid } = args;
  return withSpan(
    "pryzm.ifc.export-slab",
    () => {
      const meta = metaStore.get(slab.id);
      const storey = resolveStorey(hierarchy, slab.levelId || null);
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      let yElev = 0;
      for (const v of slab.boundary) {
        if (v.x < minX) minX = v.x;
        if (v.x > maxX) maxX = v.x;
        if (v.z < minZ) minZ = v.z;
        if (v.z > maxZ) maxZ = v.z;
        yElev = v.y;
      }
      const width = Math.max(maxX - minX, 1e-3);
      const depth = Math.max(maxZ - minZ, 1e-3);
      const cx = (minX + maxX) / 2;
      const cz = (minZ + maxZ) / 2;
      const elevation = yElev + slab.baseOffset;
      const placement = buildLocalPlacement(api, modelId, hierarchy.defaultPlacement, {
        position: { x: cx, y: cz, z: elevation }
      });
      const representation = buildBoxRepresentation(
        api,
        modelId,
        hierarchy.representationContext,
        { width, depth, height: slab.thickness }
      );
      const globalId = meta?.globalId ?? mintGlobalId(api, modelId, guid);
      const name = meta?.name ?? `Slab ${slab.id.slice(0, 8)}`;
      const entity = writeEntity(
        api,
        modelId,
        IFCSLAB,
        globalId,
        ownerRefs.ownerHistory,
        label(api, modelId, name),
        meta?.description ? label(api, modelId, meta.description) : null,
        meta?.objectType ? label(api, modelId, meta.objectType) : null,
        placement,
        representation,
        label(api, modelId, slab.id),
        "FLOOR"
      );
      return { entity, storey, pryzmId: slab.id };
    },
    {
      "pryzm.ifc.element_id": slab.id,
      "pryzm.ifc.element_type": "slab"
    }
  );
}

function exportWall(args) {
  const { api, modelId, hierarchy, ownerRefs, metaStore, wall, guid } = args;
  return withSpan(
    "pryzm.ifc.export-wall",
    () => {
      const meta = metaStore.get(wall.id);
      const storey = resolveStorey(hierarchy, wall.levelId || null);
      const [a, b] = wall.baseLine;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const length = Math.hypot(dx, dz);
      const yaw = Math.atan2(dz, dx);
      const cx = (a.x + b.x) / 2;
      const cz = (a.z + b.z) / 2;
      const elevation = a.y + wall.baseOffset;
      const placement = buildLocalPlacement(api, modelId, hierarchy.defaultPlacement, {
        position: { x: cx, y: cz, z: elevation },
        rotationZ: yaw
      });
      const representation = buildBoxRepresentation(
        api,
        modelId,
        hierarchy.representationContext,
        { width: length, depth: wall.thickness, height: wall.height }
      );
      const globalId = meta?.globalId ?? mintGlobalId(api, modelId, guid);
      const name = meta?.name ?? `Wall ${wall.id.slice(0, 8)}`;
      const entity = writeEntity(
        api,
        modelId,
        IFCWALLSTANDARDCASE,
        globalId,
        ownerRefs.ownerHistory,
        label(api, modelId, name),
        meta?.description ? label(api, modelId, meta.description) : null,
        meta?.objectType ? label(api, modelId, meta.objectType) : null,
        placement,
        representation,
        label(api, modelId, wall.id),
        "STANDARD"
      );
      return { entity, storey, pryzmId: wall.id };
    },
    {
      "pryzm.ifc.element_id": wall.id,
      "pryzm.ifc.element_type": "wall"
    }
  );
}

const WINDOW_THICKNESS = 0.05;
function exportWindow(args) {
  const { api, modelId, hierarchy, ownerRefs, metaStore, window: win, guid, walls } = args;
  return withSpan(
    "pryzm.ifc.export-window",
    () => {
      const meta = metaStore.get(win.id);
      const storey = resolveStorey(hierarchy, null);
      const placement = buildLocalPlacement(api, modelId, hierarchy.defaultPlacement, {
        position: { x: win.offset, y: 0, z: win.sillHeight }
      });
      const representation = buildBoxRepresentation(
        api,
        modelId,
        hierarchy.representationContext,
        { width: win.width, depth: WINDOW_THICKNESS, height: win.height }
      );
      const globalId = meta?.globalId ?? mintGlobalId(api, modelId, guid);
      const name = meta?.name ?? `Window ${win.id.slice(0, 8)}`;
      const hostOpening = hostOpeningOf(walls, win.wallId, win.id);
      const declaration = declareOpeningProfile(win, hostOpening, {
        width: win.width,
        height: win.height
      });
      const description = composeDescription(meta?.description, declaration);
      const entity = writeEntity(
        api,
        modelId,
        IFCWINDOW,
        globalId,
        ownerRefs.ownerHistory,
        label(api, modelId, name),
        description ? label(api, modelId, description) : null,
        meta?.objectType ? label(api, modelId, meta.objectType) : null,
        placement,
        representation,
        label(api, modelId, win.id),
        real(api, modelId, win.height),
        real(api, modelId, win.width),
        "WINDOW",
        win.windowType === "double" ? "DOUBLE_PANEL_HORIZONTAL" : "SINGLE_PANEL",
        null
      );
      return { entity, storey, pryzmId: win.id };
    },
    {
      "pryzm.ifc.element_id": win.id,
      "pryzm.ifc.element_type": "window"
    }
  );
}

function buildOwnerHistory(api, modelId, meta, timestamp) {
  const personName = meta.personName ?? "PRYZM User";
  const orgName = meta.organizationName ?? "PRYZM";
  const appName = meta.applicationName ?? "PRYZM";
  const appId = meta.applicationIdentifier ?? "PRYZM-2";
  const appVer = meta.applicationVersion ?? "2.0.0";
  const person = writeEntity(
    api,
    modelId,
    IFCPERSON,
    null,
    // Identification
    label(api, modelId, personName),
    // FamilyName
    null,
    // GivenName
    null,
    // MiddleNames
    null,
    // PrefixTitles
    null,
    // SuffixTitles
    null,
    // Roles
    null
    // Addresses
  );
  const organization = writeEntity(
    api,
    modelId,
    IFCORGANIZATION,
    null,
    // Identification
    label(api, modelId, orgName),
    // Name
    null,
    // Description
    null,
    // Roles
    null
    // Addresses
  );
  const personAndOrganization = writeEntity(
    api,
    modelId,
    IFCPERSONANDORGANIZATION,
    person,
    organization,
    null
    // Roles
  );
  const application = writeEntity(
    api,
    modelId,
    IFCAPPLICATION,
    organization,
    label(api, modelId, appVer),
    // Version
    label(api, modelId, appName),
    // ApplicationFullName
    identifier(api, modelId, appId)
    // ApplicationIdentifier
  );
  const ownerHistory = writeEntity(
    api,
    modelId,
    IFCOWNERHISTORY,
    personAndOrganization,
    application,
    null,
    // State (IfcStateEnum)
    // `IfcChangeActionEnum` is not re-exported through `web-ifc-api`'s public root
    // (declared only in ifc-schema.d.ts). Use the string literal directly — web-ifc
    // accepts `'NOCHANGE'` for backward compatibility.
    "NOCHANGE",
    // ChangeAction (IfcStateEnum)
    timestamp,
    // LastModifiedDate
    personAndOrganization,
    // LastModifyingUser
    application,
    // LastModifyingApplication
    timestamp
    // CreationDate
  );
  return { ownerHistory, application, personAndOrganization };
}

const PROVENANCE_PSET_NAME = "PRYZM_ValueProvenance";
function buildProvenancePset(provenance) {
  const rec = provenance ?? provenancePredatingTheField();
  const pset = {
    OriginKnown: rec.origin !== null
  };
  if (rec.origin !== null) {
    pset.Origin = rec.origin;
  } else {
    pset.UnknownReason = rec.unknownReason ?? "not-recorded";
  }
  if (rec.detail !== void 0) pset.Detail = rec.detail;
  if (rec.replaced !== void 0) {
    pset.ReplacedOriginKnown = rec.replaced.origin !== null;
    if (rec.replaced.origin !== null) pset.ReplacedOrigin = rec.replaced.origin;
    if (rec.replaced.detail !== void 0) pset.ReplacedDetail = rec.replaced.detail;
  }
  if (rec.recordedAt !== void 0) pset.RecordedAt = rec.recordedAt;
  return pset;
}

function writeAllPsets(args) {
  const { meta, ...rest } = args;
  let psetCount = 0;
  let propertyCount = 0;
  for (const [psetName, pset] of Object.entries(meta.psets)) {
    const written = writePset({ ...rest, pryzmElementId: meta.pryzmElementId }, psetName, pset);
    if (written > 0) {
      psetCount += 1;
      propertyCount += written;
    }
  }
  return { psetCount, propertyCount };
}
function writePset(args, psetName, pset) {
  const { api, modelId, ownerRefs, element, guid, pryzmElementId } = args;
  return withSpan(
    "pryzm.ifc.export-pset",
    () => {
      const properties = [];
      for (const [propName, propValue] of Object.entries(pset)) {
        if (propValue === null || propValue === void 0) continue;
        const valueRef = valueFromScalar(api, modelId, propValue);
        const property = writeEntity(
          api,
          modelId,
          IFCPROPERTYSINGLEVALUE,
          identifier(api, modelId, propName),
          // Name (IfcIdentifier)
          null,
          // Description
          valueRef,
          // NominalValue (IfcValue)
          null
          // Unit (IfcUnit)
        );
        properties.push(property);
      }
      if (properties.length === 0) return 0;
      const propertySet = writeEntity(
        api,
        modelId,
        IFCPROPERTYSET,
        mintGlobalId(api, modelId, guid),
        ownerRefs.ownerHistory,
        label(api, modelId, psetName),
        null,
        // Description
        properties
      );
      writeEntity(
        api,
        modelId,
        IFCRELDEFINESBYPROPERTIES,
        mintGlobalId(api, modelId, guid),
        ownerRefs.ownerHistory,
        null,
        null,
        [element],
        propertySet
      );
      return properties.length;
    },
    {
      "pryzm.ifc.element_id": pryzmElementId,
      "pryzm.ifc.pset_name": psetName,
      "pryzm.ifc.property_count": Object.keys(pset).length
    }
  );
}

async function exportProjectToIFC(snapshot, metaStore, projectMeta, options = {}) {
  return withSpan("pryzm.ifc.export", async (span) => {
    const api = new IfcAPI2();
    await api.Init();
    const modelId = api.CreateModel({ schema: Schemas.IFC4 });
    const guid = options.guidProvider;
    const timestamp = options.timestamp ?? Math.floor(Date.now() / 1e3);
    try {
      const ownerRefs = buildOwnerHistory(api, modelId, projectMeta, timestamp);
      const hierarchy = buildHierarchy(
        api,
        modelId,
        projectMeta,
        snapshot.levels ?? [],
        ownerRefs,
        guid
      );
      const exported = [];
      let psetCount = 0;
      let propertyCount = 0;
      const runPsets = (el) => {
        const meta = metaStore.get(el.pryzmId);
        if (!meta || Object.keys(meta.psets).length === 0) return;
        const r = writeAllPsets({
          api,
          modelId,
          ownerRefs,
          element: el.entity,
          meta,
          guid
        });
        psetCount += r.psetCount;
        propertyCount += r.propertyCount;
      };
      const stampProvenance = (el, provenance) => {
        const written = writePset(
          { api, modelId, ownerRefs, element: el.entity, guid, pryzmElementId: el.pryzmId },
          PROVENANCE_PSET_NAME,
          buildProvenancePset(provenance)
        );
        if (written > 0) {
          psetCount += 1;
          propertyCount += written;
        }
      };
      for (const wall of snapshot.walls ?? []) {
        const el = exportWall({ api, modelId, hierarchy, ownerRefs, metaStore, wall, guid });
        exported.push(el);
        runPsets(el);
        stampProvenance(el, wall.provenance);
      }
      for (const slab of snapshot.slabs ?? []) {
        const el = exportSlab({ api, modelId, hierarchy, ownerRefs, metaStore, slab, guid });
        exported.push(el);
        runPsets(el);
        stampProvenance(el, slab.provenance);
      }
      for (const door of snapshot.doors ?? []) {
        const el = exportDoor({
          api,
          modelId,
          hierarchy,
          ownerRefs,
          metaStore,
          door,
          guid,
          walls: snapshot.walls
        });
        exported.push(el);
        runPsets(el);
        stampProvenance(el, door.provenance);
      }
      for (const window of snapshot.windows ?? []) {
        const el = exportWindow({
          api,
          modelId,
          hierarchy,
          ownerRefs,
          metaStore,
          window,
          guid,
          walls: snapshot.walls
        });
        exported.push(el);
        runPsets(el);
        stampProvenance(el, window.provenance);
      }
      for (const column of snapshot.columns ?? []) {
        const el = exportColumn({ api, modelId, hierarchy, ownerRefs, metaStore, column, guid });
        exported.push(el);
        runPsets(el);
        stampProvenance(el, column.provenance);
      }
      for (const beam of snapshot.beams ?? []) {
        const el = exportBeam({ api, modelId, hierarchy, ownerRefs, metaStore, beam, guid });
        exported.push(el);
        runPsets(el);
        stampProvenance(el, beam.provenance);
      }
      const byStorey = /* @__PURE__ */ new Map();
      for (const el of exported) {
        const key = el.storey.expressID;
        const bucket = byStorey.get(key);
        if (bucket) bucket.elements.push(el.entity);
        else byStorey.set(key, { storey: el.storey, elements: [el.entity] });
      }
      for (const { storey, elements } of byStorey.values()) {
        writeEntity(
          api,
          modelId,
          IFCRELCONTAINEDINSPATIALSTRUCTURE,
          mintGlobalId(api, modelId, guid),
          ownerRefs.ownerHistory,
          null,
          null,
          elements,
          storey
        );
      }
      const counts = {
        walls: snapshot.walls?.length ?? 0,
        slabs: snapshot.slabs?.length ?? 0,
        doors: snapshot.doors?.length ?? 0,
        windows: snapshot.windows?.length ?? 0,
        columns: snapshot.columns?.length ?? 0,
        beams: snapshot.beams?.length ?? 0,
        psets: psetCount,
        properties: propertyCount
      };
      span.setAttribute("pryzm.ifc.export.element_count", exported.length);
      span.setAttribute("pryzm.ifc.export.pset_count", psetCount);
      span.setAttribute("pryzm.ifc.export.property_count", propertyCount);
      const bytes = api.SaveModel(modelId);
      return { bytes, counts };
    } finally {
      try {
        api.CloseModel(modelId);
      } catch {
      }
    }
  });
}

function spaceTypeFor(roomType, isExternal) {
  if (isExternal) return "EXTERNAL";
  const lower = roomType.toLowerCase();
  if (lower === "balcony" || lower === "terrace") return "EXTERNAL";
  return "INTERNAL";
}
function buildSpaceShape(api, modelId, representationContext, perimeter, heightM) {
  const points = [];
  for (const p of perimeter) {
    points.push(
      writeEntity(api, modelId, IFCCARTESIANPOINT, [
        real(api, modelId, p.x),
        real(api, modelId, p.z)
      ])
    );
  }
  const first = perimeter[0];
  const last = perimeter[perimeter.length - 1];
  if (first && last && (first.x !== last.x || first.z !== last.z)) {
    points.push(
      writeEntity(api, modelId, IFCCARTESIANPOINT, [
        real(api, modelId, first.x),
        real(api, modelId, first.z)
      ])
    );
  }
  const polyline = writeEntity(api, modelId, IFCPOLYLINE, points);
  const profile = writeEntity(
    api,
    modelId,
    IFCARBITRARYCLOSEDPROFILEDEF,
    "AREA",
    null,
    polyline
  );
  const extrudeOrigin = writeEntity(api, modelId, IFCCARTESIANPOINT, [
    real(api, modelId, 0),
    real(api, modelId, 0),
    real(api, modelId, 0)
  ]);
  const extrudeZ = writeEntity(api, modelId, IFCDIRECTION, [
    real(api, modelId, 0),
    real(api, modelId, 0),
    real(api, modelId, 1)
  ]);
  const extrudeX = writeEntity(api, modelId, IFCDIRECTION, [
    real(api, modelId, 1),
    real(api, modelId, 0),
    real(api, modelId, 0)
  ]);
  const extrudePlacement = writeEntity(
    api,
    modelId,
    IFCAXIS2PLACEMENT3D,
    extrudeOrigin,
    extrudeZ,
    extrudeX
  );
  const extrudeDirection = writeEntity(api, modelId, IFCDIRECTION, [
    real(api, modelId, 0),
    real(api, modelId, 0),
    real(api, modelId, 1)
  ]);
  const solid = writeEntity(
    api,
    modelId,
    IFCEXTRUDEDAREASOLID,
    profile,
    extrudePlacement,
    extrudeDirection,
    real(api, modelId, Math.max(heightM, 1e-3))
  );
  const shapeRep = writeEntity(
    api,
    modelId,
    IFCSHAPEREPRESENTATION,
    representationContext,
    label(api, modelId, "Body"),
    label(api, modelId, "SweptSolid"),
    [solid]
  );
  return writeEntity(
    api,
    modelId,
    IFCPRODUCTDEFINITIONSHAPE,
    null,
    null,
    [shapeRep]
  );
}
function grossVolumeFor(room) {
  const gross = room.grossAreaM2 ?? room.netAreaM2;
  return gross * room.heightM;
}
function writeSpaceCommonPset(api, modelId, ownerRefs, guid, space, room) {
  const writeProp = (name, value) => writeEntity(
    api,
    modelId,
    IFCPROPERTYSINGLEVALUE,
    identifier(api, modelId, name),
    null,
    value,
    null
  );
  const grossArea = room.grossAreaM2 ?? room.netAreaM2;
  const properties = [
    writeProp("Reference", label(api, modelId, room.type)),
    writeProp("NetFloorArea", real(api, modelId, room.netAreaM2)),
    writeProp("GrossFloorArea", real(api, modelId, grossArea)),
    writeProp("GrossVolume", real(api, modelId, grossVolumeFor(room))),
    writeProp("FinishCeilingHeight", real(api, modelId, room.heightM)),
    writeProp("OccupancyType", text(api, modelId, room.type)),
    writeProp("IsExternal", api.CreateIfcType(modelId, IFCBOOLEAN, room.isExternal))
  ];
  const pset = writeEntity(
    api,
    modelId,
    IFCPROPERTYSET,
    mintGlobalId(api, modelId, guid),
    ownerRefs.ownerHistory,
    label(api, modelId, "Pset_SpaceCommon"),
    null,
    properties
  );
  writeEntity(
    api,
    modelId,
    IFCRELDEFINESBYPROPERTIES,
    mintGlobalId(api, modelId, guid),
    ownerRefs.ownerHistory,
    null,
    null,
    [space],
    pset
  );
  return pset;
}
function writeStoreyAggregatesSpaces(api, modelId, ownerRefs, guid, storey, spaces) {
  if (spaces.length === 0) return null;
  return writeEntity(
    api,
    modelId,
    IFCRELAGGREGATES,
    mintGlobalId(api, modelId, guid),
    ownerRefs.ownerHistory,
    null,
    null,
    storey,
    spaces.slice()
  );
}
function exportRoomToSpace(args) {
  const { api, modelId, hierarchy, ownerRefs, room, guid } = args;
  if (!Number.isFinite(room.netAreaM2) || room.netAreaM2 < 0) {
    throw new Error(
      `[ifc-export/space] room ${room.id}: netAreaM2 must be a finite, non-negative number (got ${room.netAreaM2})`
    );
  }
  if (room.perimeter.length < 3) {
    throw new Error(
      `[ifc-export/space] room ${room.id}: perimeter must have at least 3 points (got ${room.perimeter.length})`
    );
  }
  if (!Number.isFinite(room.heightM) || room.heightM <= 0) {
    throw new Error(
      `[ifc-export/space] room ${room.id}: heightM must be a finite, positive number (got ${room.heightM})`
    );
  }
  return withSpan(
    "pryzm.ifc.export-space",
    () => {
      const storey = resolveStorey(hierarchy, room.levelId ?? null);
      const globalId = mintGlobalId(api, modelId, guid);
      const originPt = writeEntity(api, modelId, IFCCARTESIANPOINT, [
        real(api, modelId, 0),
        real(api, modelId, 0),
        real(api, modelId, 0)
      ]);
      const zDir = writeEntity(api, modelId, IFCDIRECTION, [
        real(api, modelId, 0),
        real(api, modelId, 0),
        real(api, modelId, 1)
      ]);
      const xDir = writeEntity(api, modelId, IFCDIRECTION, [
        real(api, modelId, 1),
        real(api, modelId, 0),
        real(api, modelId, 0)
      ]);
      const axis = writeEntity(
        api,
        modelId,
        IFCAXIS2PLACEMENT3D,
        originPt,
        zDir,
        xDir
      );
      const placement = writeEntity(
        api,
        modelId,
        IFCLOCALPLACEMENT,
        hierarchy.defaultPlacement,
        axis
      );
      const shape = buildSpaceShape(
        api,
        modelId,
        hierarchy.representationContext,
        room.perimeter,
        room.heightM
      );
      const entity = writeEntity(
        api,
        modelId,
        IFCSPACE,
        globalId,
        ownerRefs.ownerHistory,
        label(api, modelId, room.name),
        null,
        label(api, modelId, room.type),
        placement,
        shape,
        label(api, modelId, room.name),
        "ELEMENT",
        spaceTypeFor(room.type, room.isExternal),
        null
      );
      const pset = writeSpaceCommonPset(
        api,
        modelId,
        ownerRefs,
        guid,
        entity,
        room
      );
      return { entity, storey, pryzmId: room.id, pset };
    },
    {
      "pryzm.ifc.element_id": room.id,
      "pryzm.ifc.element_type": "space"
    }
  );
}

function apartmentZoneObjectType(_apt) {
  return "Apartment";
}
function exportApartmentToZone(apt, spaceRefMap, ctx) {
  return withSpan(
    "pryzm.ifc.export-zone",
    (span) => {
      const { api, modelId, ownerRefs, guid } = ctx;
      const globalId = mintGlobalId(api, modelId, guid);
      const zoneRef = writeEntity(
        api,
        modelId,
        IFCZONE,
        globalId,
        ownerRefs.ownerHistory,
        label(api, modelId, apt.name),
        apt.description ? text(api, modelId, apt.description) : null,
        label(api, modelId, apartmentZoneObjectType(apt)),
        apt.longName ? label(api, modelId, apt.longName) : null
      );
      const resolvedMembers = [];
      for (const roomId of apt.memberRoomIds) {
        const spaceRef = spaceRefMap.get(roomId);
        if (spaceRef) resolvedMembers.push(spaceRef);
      }
      span.setAttribute("zoneId", apt.id);
      span.setAttribute("memberCount", apt.memberRoomIds.length);
      span.setAttribute("resolvedMemberCount", resolvedMembers.length);
      let relRef = void 0;
      if (resolvedMembers.length > 0) {
        relRef = writeEntity(
          api,
          modelId,
          IFCRELASSIGNSTOGROUP,
          mintGlobalId(api, modelId, guid),
          ownerRefs.ownerHistory,
          null,
          null,
          resolvedMembers.slice(),
          null,
          zoneRef
        );
      }
      return {
        zoneRef,
        relRef,
        pryzmId: apt.id,
        memberCount: apt.memberRoomIds.length,
        resolvedMemberCount: resolvedMembers.length
      };
    }
  );
}
function writeAllApartmentZones(apartments, spaceRefMap, ctx) {
  if (apartments.length === 0) {
    return { zoneCount: 0, relCount: 0, refs: [] };
  }
  const refs = [];
  let zoneCount = 0;
  let relCount = 0;
  for (const apt of apartments) {
    const { zoneRef, relRef } = exportApartmentToZone(apt, spaceRefMap, ctx);
    zoneCount += 1;
    if (relRef) relCount += 1;
    refs.push({ aptId: apt.id, zoneRef, relRef });
  }
  return { zoneCount, relCount, refs };
}

function assertRevitVariant(opts) {
  if (opts.variant !== "IFC4X3-RV") {
    throw new Error(
      `[ifc-export/revit-variant] expected variant 'IFC4X3-RV', got ${JSON.stringify(opts.variant)}`
    );
  }
}
function writeProp$3(api, modelId, name, value) {
  return writeEntity(
    api,
    modelId,
    IFCPROPERTYSINGLEVALUE,
    label(api, modelId, name),
    null,
    value,
    null
  );
}
function writePsetRevitInstance(elementRef, opts, ctx) {
  return withSpan(
    "pryzm.ifc.export-pset-revit-instance",
    (span) => {
      const { api, modelId, ownerRefs, guid } = ctx;
      const marker = opts.instanceMarker ?? "PRYZM-EXPORT";
      const properties = [
        writeProp$3(
          api,
          modelId,
          "RevitInstanceMarker",
          label(api, modelId, marker)
        )
      ];
      const psetRef = writeEntity(
        api,
        modelId,
        IFCPROPERTYSET,
        mintGlobalId(api, modelId, guid),
        ownerRefs.ownerHistory,
        label(api, modelId, "Pset_RevitInstance"),
        null,
        properties
      );
      const relRef = writeEntity(
        api,
        modelId,
        IFCRELDEFINESBYPROPERTIES,
        mintGlobalId(api, modelId, guid),
        ownerRefs.ownerHistory,
        null,
        null,
        [elementRef],
        psetRef
      );
      span.setAttribute("elementRef", elementRef);
      span.setAttribute("instanceMarker", marker);
      span.setAttribute("propertyCount", properties.length);
      return { psetRef, relRef };
    }
  );
}
const REVIT_WORKSET_OBJECT_TYPE = "Revit Workset";
function writeRevitWorksetGroups(worksets, memberElementsByWorksetId, ctx) {
  if (worksets.length === 0) {
    return { groupCount: 0, relCount: 0 };
  }
  let groupCount = 0;
  let relCount = 0;
  for (const ws of worksets) {
    withSpan(
      "pryzm.ifc.export-revit-workset",
      (span) => {
        const { api, modelId, ownerRefs, guid } = ctx;
        const description = ws.isOpen ? "Open" : "Closed";
        const groupRef = writeEntity(
          api,
          modelId,
          IFCGROUP,
          mintGlobalId(api, modelId, guid),
          ownerRefs.ownerHistory,
          label(api, modelId, ws.name),
          text(api, modelId, description),
          label(api, modelId, REVIT_WORKSET_OBJECT_TYPE)
        );
        groupCount += 1;
        const members = memberElementsByWorksetId.get(ws.id) ?? [];
        let memberCount = 0;
        if (members.length > 0) {
          writeEntity(
            api,
            modelId,
            IFCRELASSIGNSTOGROUP,
            mintGlobalId(api, modelId, guid),
            ownerRefs.ownerHistory,
            null,
            null,
            members.slice(),
            null,
            groupRef
          );
          relCount += 1;
          memberCount = members.length;
        }
        span.setAttribute("worksetId", ws.id);
        span.setAttribute("worksetName", ws.name);
        span.setAttribute("isOpen", ws.isOpen);
        span.setAttribute("memberCount", memberCount);
      }
    );
  }
  return { groupCount, relCount };
}
function applyCoordinateMode(siteRef, mode, ctx) {
  withSpan(
    "pryzm.ifc.export-revit-coord-mode",
    (span) => {
      const { api, modelId, ownerRefs, guid } = ctx;
      const properties = [
        writeProp$3(
          api,
          modelId,
          "RevitCoordinateMode",
          label(api, modelId, mode)
        )
      ];
      const psetRef = writeEntity(
        api,
        modelId,
        IFCPROPERTYSET,
        mintGlobalId(api, modelId, guid),
        ownerRefs.ownerHistory,
        label(api, modelId, "Pset_SiteRevitVariant"),
        null,
        properties
      );
      writeEntity(
        api,
        modelId,
        IFCRELDEFINESBYPROPERTIES,
        mintGlobalId(api, modelId, guid),
        ownerRefs.ownerHistory,
        null,
        null,
        [siteRef],
        psetRef
      );
      span.setAttribute("siteRef", siteRef);
      span.setAttribute("coordinateMode", mode);
    }
  );
}

const WALL_STATUS_VALUES = ["NEW", "EXISTING", "DEMOLISH", "TEMPORARY"];
function pickWallCommonProps(w) {
  let status = "NEW";
  if (w.status !== void 0) {
    if (!WALL_STATUS_VALUES.includes(w.status)) {
      throw new Error(
        `[ifc-export/pset-wall-common] wall ${w.id}: status must be one of ${WALL_STATUS_VALUES.join(" | ")} (got ${JSON.stringify(w.status)})`
      );
    }
    status = w.status;
  }
  const out = { status };
  if (w.reference !== void 0) out.reference = w.reference;
  if (w.acousticRating !== void 0) out.acousticRating = w.acousticRating;
  if (w.fireRating !== void 0) out.fireRating = w.fireRating;
  if (w.combustible !== void 0) out.combustible = w.combustible;
  if (w.surfaceSpreadOfFlame !== void 0)
    out.surfaceSpreadOfFlame = w.surfaceSpreadOfFlame;
  if (w.thermalTransmittance !== void 0 && Number.isFinite(w.thermalTransmittance)) {
    out.thermalTransmittance = w.thermalTransmittance;
  }
  if (w.isExternal !== void 0) out.isExternal = w.isExternal;
  if (w.extendToStructure !== void 0)
    out.extendToStructure = w.extendToStructure;
  if (w.loadBearing !== void 0) out.loadBearing = w.loadBearing;
  if (w.compartmentation !== void 0)
    out.compartmentation = w.compartmentation;
  return out;
}
function writeProp$2(api, modelId, name, value) {
  return writeEntity(
    api,
    modelId,
    IFCPROPERTYSINGLEVALUE,
    identifier(api, modelId, name),
    null,
    value,
    null
  );
}
function thermalTransmittance$2(api, modelId, value) {
  return api.CreateIfcType(
    modelId,
    IFCTHERMALTRANSMITTANCEMEASURE,
    value
  );
}
function writePsetWallCommon(wallRef, wall, ctx) {
  return withSpan(
    "pryzm.ifc.export-pset-wall-common",
    (span) => {
      const { api, modelId, ownerRefs, guid } = ctx;
      const picked = pickWallCommonProps(wall);
      const properties = [];
      if (picked.reference !== void 0) {
        properties.push(
          writeProp$2(
            api,
            modelId,
            "Reference",
            identifier(api, modelId, picked.reference)
          )
        );
      }
      properties.push(
        writeProp$2(api, modelId, "Status", label(api, modelId, picked.status))
      );
      if (picked.acousticRating !== void 0) {
        properties.push(
          writeProp$2(
            api,
            modelId,
            "AcousticRating",
            label(api, modelId, picked.acousticRating)
          )
        );
      }
      if (picked.fireRating !== void 0) {
        properties.push(
          writeProp$2(
            api,
            modelId,
            "FireRating",
            label(api, modelId, picked.fireRating)
          )
        );
      }
      if (picked.combustible !== void 0) {
        properties.push(
          writeProp$2(
            api,
            modelId,
            "Combustible",
            boolean(api, modelId, picked.combustible)
          )
        );
      }
      if (picked.surfaceSpreadOfFlame !== void 0) {
        properties.push(
          writeProp$2(
            api,
            modelId,
            "SurfaceSpreadOfFlame",
            label(api, modelId, picked.surfaceSpreadOfFlame)
          )
        );
      }
      if (picked.thermalTransmittance !== void 0) {
        properties.push(
          writeProp$2(
            api,
            modelId,
            "ThermalTransmittance",
            thermalTransmittance$2(
              api,
              modelId,
              picked.thermalTransmittance
            )
          )
        );
      }
      if (picked.isExternal !== void 0) {
        properties.push(
          writeProp$2(
            api,
            modelId,
            "IsExternal",
            boolean(api, modelId, picked.isExternal)
          )
        );
      }
      if (picked.extendToStructure !== void 0) {
        properties.push(
          writeProp$2(
            api,
            modelId,
            "ExtendToStructure",
            boolean(api, modelId, picked.extendToStructure)
          )
        );
      }
      if (picked.loadBearing !== void 0) {
        properties.push(
          writeProp$2(
            api,
            modelId,
            "LoadBearing",
            boolean(api, modelId, picked.loadBearing)
          )
        );
      }
      if (picked.compartmentation !== void 0) {
        properties.push(
          writeProp$2(
            api,
            modelId,
            "Compartmentation",
            boolean(api, modelId, picked.compartmentation)
          )
        );
      }
      const psetRef = writeEntity(
        api,
        modelId,
        IFCPROPERTYSET,
        mintGlobalId(api, modelId, guid),
        ownerRefs.ownerHistory,
        label(api, modelId, "Pset_WallCommon"),
        null,
        properties
      );
      const relRef = writeEntity(
        api,
        modelId,
        IFCRELDEFINESBYPROPERTIES,
        mintGlobalId(api, modelId, guid),
        ownerRefs.ownerHistory,
        null,
        null,
        [wallRef],
        psetRef
      );
      span.setAttribute("wallId", wall.id);
      span.setAttribute("propertyCount", properties.length);
      return { psetRef, relRef, propertyCount: properties.length };
    }
  );
}

function computeWallQuantities(input) {
  const length = positiveOrUndefined(input.lengthM);
  const width = positiveOrUndefined(input.widthM);
  const height = positiveOrUndefined(input.heightM);
  const openingsArea = nonNegativeOrUndefined(input.openingsAreaM2);
  const openingsVolume = nonNegativeOrUndefined(input.openingsVolumeM3);
  const density = nonNegativeOrUndefined(input.densityKgPerM3);
  const out = {};
  if (length !== void 0) out.length = length;
  if (width !== void 0) out.width = width;
  if (height !== void 0) out.height = height;
  if (length !== void 0 && width !== void 0) {
    const footprint = length * width;
    out.grossFootprintArea = footprint;
    out.netFootprintArea = footprint;
  }
  if (length !== void 0 && height !== void 0) {
    const side = length * height;
    out.grossSideArea = side;
    if (openingsArea !== void 0) {
      out.netSideArea = Math.max(0, side - openingsArea);
    }
  }
  if (length !== void 0 && width !== void 0 && height !== void 0) {
    const vol = length * width * height;
    out.grossVolume = vol;
    const net = openingsVolume !== void 0 ? Math.max(0, vol - openingsVolume) : void 0;
    if (net !== void 0) out.netVolume = net;
    if (density !== void 0) {
      out.grossWeight = vol * density;
      if (net !== void 0) out.netWeight = net * density;
    }
  }
  return out;
}
function positiveOrUndefined(v) {
  if (v === void 0) return void 0;
  if (!Number.isFinite(v)) return void 0;
  if (v <= 0) return void 0;
  return v;
}
function nonNegativeOrUndefined(v) {
  if (v === void 0) return void 0;
  if (!Number.isFinite(v)) return void 0;
  if (v < 0) return void 0;
  return v;
}
function lengthMeasure(api, modelId, value) {
  return api.CreateIfcType(modelId, IFCLENGTHMEASURE, value);
}
function areaMeasure(api, modelId, value) {
  return api.CreateIfcType(modelId, IFCAREAMEASURE, value);
}
function volumeMeasure(api, modelId, value) {
  return api.CreateIfcType(modelId, IFCVOLUMEMEASURE, value);
}
function massMeasure(api, modelId, value) {
  return api.CreateIfcType(modelId, IFCMASSMEASURE, value);
}
function writeQuantityLength(api, modelId, name, value) {
  return writeEntity(
    api,
    modelId,
    IFCQUANTITYLENGTH,
    label(api, modelId, name),
    null,
    null,
    lengthMeasure(api, modelId, value),
    null
  );
}
function writeQuantityArea(api, modelId, name, value) {
  return writeEntity(
    api,
    modelId,
    IFCQUANTITYAREA,
    label(api, modelId, name),
    null,
    null,
    areaMeasure(api, modelId, value),
    null
  );
}
function writeQuantityVolume(api, modelId, name, value) {
  return writeEntity(
    api,
    modelId,
    IFCQUANTITYVOLUME,
    label(api, modelId, name),
    null,
    null,
    volumeMeasure(api, modelId, value),
    null
  );
}
function writeQuantityWeight(api, modelId, name, value) {
  return writeEntity(
    api,
    modelId,
    IFCQUANTITYWEIGHT,
    label(api, modelId, name),
    null,
    null,
    massMeasure(api, modelId, value),
    null
  );
}
function writeQtoWallBase(wallRef, input, ctx) {
  return withSpan("pryzm.ifc.export-qto-wall-base", (span) => {
    const { api, modelId, ownerRefs, guid } = ctx;
    const q = computeWallQuantities(input);
    const quantities = [];
    if (q.length !== void 0) {
      quantities.push(
        writeQuantityLength(api, modelId, "Length", q.length)
      );
    }
    if (q.width !== void 0) {
      quantities.push(
        writeQuantityLength(api, modelId, "Width", q.width)
      );
    }
    if (q.height !== void 0) {
      quantities.push(
        writeQuantityLength(api, modelId, "Height", q.height)
      );
    }
    if (q.grossFootprintArea !== void 0) {
      quantities.push(
        writeQuantityArea(
          api,
          modelId,
          "GrossFootprintArea",
          q.grossFootprintArea
        )
      );
    }
    if (q.netFootprintArea !== void 0) {
      quantities.push(
        writeQuantityArea(
          api,
          modelId,
          "NetFootprintArea",
          q.netFootprintArea
        )
      );
    }
    if (q.grossSideArea !== void 0) {
      quantities.push(
        writeQuantityArea(
          api,
          modelId,
          "GrossSideArea",
          q.grossSideArea
        )
      );
    }
    if (q.netSideArea !== void 0) {
      quantities.push(
        writeQuantityArea(api, modelId, "NetSideArea", q.netSideArea)
      );
    }
    if (q.grossVolume !== void 0) {
      quantities.push(
        writeQuantityVolume(
          api,
          modelId,
          "GrossVolume",
          q.grossVolume
        )
      );
    }
    if (q.netVolume !== void 0) {
      quantities.push(
        writeQuantityVolume(api, modelId, "NetVolume", q.netVolume)
      );
    }
    if (q.grossWeight !== void 0) {
      quantities.push(
        writeQuantityWeight(
          api,
          modelId,
          "GrossWeight",
          q.grossWeight
        )
      );
    }
    if (q.netWeight !== void 0) {
      quantities.push(
        writeQuantityWeight(api, modelId, "NetWeight", q.netWeight)
      );
    }
    const qtoRef = writeEntity(
      api,
      modelId,
      IFCELEMENTQUANTITY,
      mintGlobalId(api, modelId, guid),
      ownerRefs.ownerHistory,
      label(api, modelId, "Qto_WallBaseQuantities"),
      null,
      null,
      quantities
    );
    const relRef = writeEntity(
      api,
      modelId,
      IFCRELDEFINESBYPROPERTIES,
      mintGlobalId(api, modelId, guid),
      ownerRefs.ownerHistory,
      null,
      null,
      [wallRef],
      qtoRef
    );
    span.setAttribute("wallId", input.id);
    span.setAttribute("quantityCount", quantities.length);
    return { qtoRef, relRef, quantityCount: quantities.length };
  });
}

const DOOR_STATUS_VALUES = [
  "NEW",
  "EXISTING",
  "DEMOLISH",
  "TEMPORARY"
];
function pickDoorCommonProps(d) {
  let status = "NEW";
  if (d.status !== void 0) {
    if (!DOOR_STATUS_VALUES.includes(d.status)) {
      throw new Error(
        `[ifc-export/pset-door-common] door ${d.id}: status must be one of ${DOOR_STATUS_VALUES.join(" | ")} (got ${JSON.stringify(d.status)})`
      );
    }
    status = d.status;
  }
  const out = { status };
  if (d.reference !== void 0) out.reference = d.reference;
  if (d.acousticRating !== void 0) out.acousticRating = d.acousticRating;
  if (d.fireRating !== void 0) out.fireRating = d.fireRating;
  if (d.securityRating !== void 0) out.securityRating = d.securityRating;
  if (d.isExternal !== void 0) out.isExternal = d.isExternal;
  if (d.infiltration !== void 0 && Number.isFinite(d.infiltration)) {
    out.infiltration = d.infiltration;
  }
  if (d.thermalTransmittance !== void 0 && Number.isFinite(d.thermalTransmittance)) {
    out.thermalTransmittance = d.thermalTransmittance;
  }
  if (d.glazingAreaFraction !== void 0 && Number.isFinite(d.glazingAreaFraction)) {
    let g = d.glazingAreaFraction;
    if (g < 0) g = 0;
    if (g > 1) g = 1;
    out.glazingAreaFraction = g;
  }
  if (d.handicapAccessible !== void 0)
    out.handicapAccessible = d.handicapAccessible;
  if (d.fireExit !== void 0) out.fireExit = d.fireExit;
  if (d.hasDrive !== void 0) out.hasDrive = d.hasDrive;
  if (d.selfClosing !== void 0) out.selfClosing = d.selfClosing;
  if (d.smokeStop !== void 0) out.smokeStop = d.smokeStop;
  return out;
}
function writeProp$1(api, modelId, name, value) {
  return writeEntity(
    api,
    modelId,
    IFCPROPERTYSINGLEVALUE,
    identifier(api, modelId, name),
    null,
    value,
    null
  );
}
function thermalTransmittance$1(api, modelId, value) {
  return api.CreateIfcType(
    modelId,
    IFCTHERMALTRANSMITTANCEMEASURE,
    value
  );
}
function volumetricFlowRate$1(api, modelId, value) {
  return api.CreateIfcType(
    modelId,
    IFCVOLUMETRICFLOWRATEMEASURE,
    value
  );
}
function positiveRatio$1(api, modelId, value) {
  return api.CreateIfcType(
    modelId,
    IFCPOSITIVERATIOMEASURE,
    value
  );
}
function writePsetDoorCommon(doorRef, door, ctx) {
  return withSpan(
    "pryzm.ifc.export-pset-door-common",
    (span) => {
      const { api, modelId, ownerRefs, guid } = ctx;
      const picked = pickDoorCommonProps(door);
      const properties = [];
      if (picked.reference !== void 0) {
        properties.push(
          writeProp$1(
            api,
            modelId,
            "Reference",
            identifier(api, modelId, picked.reference)
          )
        );
      }
      properties.push(
        writeProp$1(api, modelId, "Status", label(api, modelId, picked.status))
      );
      if (picked.acousticRating !== void 0) {
        properties.push(
          writeProp$1(
            api,
            modelId,
            "AcousticRating",
            label(api, modelId, picked.acousticRating)
          )
        );
      }
      if (picked.fireRating !== void 0) {
        properties.push(
          writeProp$1(
            api,
            modelId,
            "FireRating",
            label(api, modelId, picked.fireRating)
          )
        );
      }
      if (picked.securityRating !== void 0) {
        properties.push(
          writeProp$1(
            api,
            modelId,
            "SecurityRating",
            label(api, modelId, picked.securityRating)
          )
        );
      }
      if (picked.isExternal !== void 0) {
        properties.push(
          writeProp$1(
            api,
            modelId,
            "IsExternal",
            boolean(api, modelId, picked.isExternal)
          )
        );
      }
      if (picked.infiltration !== void 0) {
        properties.push(
          writeProp$1(
            api,
            modelId,
            "Infiltration",
            volumetricFlowRate$1(api, modelId, picked.infiltration)
          )
        );
      }
      if (picked.thermalTransmittance !== void 0) {
        properties.push(
          writeProp$1(
            api,
            modelId,
            "ThermalTransmittance",
            thermalTransmittance$1(
              api,
              modelId,
              picked.thermalTransmittance
            )
          )
        );
      }
      if (picked.glazingAreaFraction !== void 0) {
        properties.push(
          writeProp$1(
            api,
            modelId,
            "GlazingAreaFraction",
            positiveRatio$1(api, modelId, picked.glazingAreaFraction)
          )
        );
      }
      if (picked.handicapAccessible !== void 0) {
        properties.push(
          writeProp$1(
            api,
            modelId,
            "HandicapAccessible",
            boolean(api, modelId, picked.handicapAccessible)
          )
        );
      }
      if (picked.fireExit !== void 0) {
        properties.push(
          writeProp$1(
            api,
            modelId,
            "FireExit",
            boolean(api, modelId, picked.fireExit)
          )
        );
      }
      if (picked.hasDrive !== void 0) {
        properties.push(
          writeProp$1(
            api,
            modelId,
            "HasDrive",
            boolean(api, modelId, picked.hasDrive)
          )
        );
      }
      if (picked.selfClosing !== void 0) {
        properties.push(
          writeProp$1(
            api,
            modelId,
            "SelfClosing",
            boolean(api, modelId, picked.selfClosing)
          )
        );
      }
      if (picked.smokeStop !== void 0) {
        properties.push(
          writeProp$1(
            api,
            modelId,
            "SmokeStop",
            boolean(api, modelId, picked.smokeStop)
          )
        );
      }
      const psetRef = writeEntity(
        api,
        modelId,
        IFCPROPERTYSET,
        mintGlobalId(api, modelId, guid),
        ownerRefs.ownerHistory,
        label(api, modelId, "Pset_DoorCommon"),
        null,
        properties
      );
      const relRef = writeEntity(
        api,
        modelId,
        IFCRELDEFINESBYPROPERTIES,
        mintGlobalId(api, modelId, guid),
        ownerRefs.ownerHistory,
        null,
        null,
        [doorRef],
        psetRef
      );
      span.setAttribute("doorId", door.id);
      span.setAttribute("propertyCount", properties.length);
      return { psetRef, relRef, propertyCount: properties.length };
    }
  );
}

const WINDOW_STATUS_VALUES = [
  "NEW",
  "EXISTING",
  "DEMOLISH",
  "TEMPORARY"
];
function pickWindowCommonProps(w) {
  let status = "NEW";
  if (w.status !== void 0) {
    if (!WINDOW_STATUS_VALUES.includes(w.status)) {
      throw new Error(
        `[ifc-export/pset-window-common] window ${w.id}: status must be one of ${WINDOW_STATUS_VALUES.join(" | ")} (got ${JSON.stringify(w.status)})`
      );
    }
    status = w.status;
  }
  const out = { status };
  if (w.reference !== void 0) out.reference = w.reference;
  if (w.acousticRating !== void 0) out.acousticRating = w.acousticRating;
  if (w.fireRating !== void 0) out.fireRating = w.fireRating;
  if (w.securityRating !== void 0) out.securityRating = w.securityRating;
  if (w.isExternal !== void 0) out.isExternal = w.isExternal;
  if (w.infiltration !== void 0 && Number.isFinite(w.infiltration)) {
    out.infiltration = w.infiltration;
  }
  if (w.thermalTransmittance !== void 0 && Number.isFinite(w.thermalTransmittance)) {
    out.thermalTransmittance = w.thermalTransmittance;
  }
  if (w.glazingAreaFraction !== void 0 && Number.isFinite(w.glazingAreaFraction)) {
    let g = w.glazingAreaFraction;
    if (g < 0) g = 0;
    if (g > 1) g = 1;
    out.glazingAreaFraction = g;
  }
  if (w.hasSillExternal !== void 0)
    out.hasSillExternal = w.hasSillExternal;
  if (w.hasSillInternal !== void 0)
    out.hasSillInternal = w.hasSillInternal;
  if (w.hasDrive !== void 0) out.hasDrive = w.hasDrive;
  if (w.smokeStop !== void 0) out.smokeStop = w.smokeStop;
  return out;
}
function writeProp(api, modelId, name, value) {
  return writeEntity(
    api,
    modelId,
    IFCPROPERTYSINGLEVALUE,
    identifier(api, modelId, name),
    null,
    value,
    null
  );
}
function thermalTransmittance(api, modelId, value) {
  return api.CreateIfcType(
    modelId,
    IFCTHERMALTRANSMITTANCEMEASURE,
    value
  );
}
function volumetricFlowRate(api, modelId, value) {
  return api.CreateIfcType(
    modelId,
    IFCVOLUMETRICFLOWRATEMEASURE,
    value
  );
}
function positiveRatio(api, modelId, value) {
  return api.CreateIfcType(
    modelId,
    IFCPOSITIVERATIOMEASURE,
    value
  );
}
function writePsetWindowCommon(windowRef, window, ctx) {
  return withSpan(
    "pryzm.ifc.export-pset-window-common",
    (span) => {
      const { api, modelId, ownerRefs, guid } = ctx;
      const picked = pickWindowCommonProps(window);
      const properties = [];
      if (picked.reference !== void 0) {
        properties.push(
          writeProp(
            api,
            modelId,
            "Reference",
            identifier(api, modelId, picked.reference)
          )
        );
      }
      properties.push(
        writeProp(
          api,
          modelId,
          "Status",
          label(api, modelId, picked.status)
        )
      );
      if (picked.acousticRating !== void 0) {
        properties.push(
          writeProp(
            api,
            modelId,
            "AcousticRating",
            label(api, modelId, picked.acousticRating)
          )
        );
      }
      if (picked.fireRating !== void 0) {
        properties.push(
          writeProp(
            api,
            modelId,
            "FireRating",
            label(api, modelId, picked.fireRating)
          )
        );
      }
      if (picked.securityRating !== void 0) {
        properties.push(
          writeProp(
            api,
            modelId,
            "SecurityRating",
            label(api, modelId, picked.securityRating)
          )
        );
      }
      if (picked.isExternal !== void 0) {
        properties.push(
          writeProp(
            api,
            modelId,
            "IsExternal",
            boolean(api, modelId, picked.isExternal)
          )
        );
      }
      if (picked.infiltration !== void 0) {
        properties.push(
          writeProp(
            api,
            modelId,
            "Infiltration",
            volumetricFlowRate(api, modelId, picked.infiltration)
          )
        );
      }
      if (picked.thermalTransmittance !== void 0) {
        properties.push(
          writeProp(
            api,
            modelId,
            "ThermalTransmittance",
            thermalTransmittance(
              api,
              modelId,
              picked.thermalTransmittance
            )
          )
        );
      }
      if (picked.glazingAreaFraction !== void 0) {
        properties.push(
          writeProp(
            api,
            modelId,
            "GlazingAreaFraction",
            positiveRatio(api, modelId, picked.glazingAreaFraction)
          )
        );
      }
      if (picked.hasSillExternal !== void 0) {
        properties.push(
          writeProp(
            api,
            modelId,
            "HasSillExternal",
            boolean(api, modelId, picked.hasSillExternal)
          )
        );
      }
      if (picked.hasSillInternal !== void 0) {
        properties.push(
          writeProp(
            api,
            modelId,
            "HasSillInternal",
            boolean(api, modelId, picked.hasSillInternal)
          )
        );
      }
      if (picked.hasDrive !== void 0) {
        properties.push(
          writeProp(
            api,
            modelId,
            "HasDrive",
            boolean(api, modelId, picked.hasDrive)
          )
        );
      }
      if (picked.smokeStop !== void 0) {
        properties.push(
          writeProp(
            api,
            modelId,
            "SmokeStop",
            boolean(api, modelId, picked.smokeStop)
          )
        );
      }
      const psetRef = writeEntity(
        api,
        modelId,
        IFCPROPERTYSET,
        mintGlobalId(api, modelId, guid),
        ownerRefs.ownerHistory,
        label(api, modelId, "Pset_WindowCommon"),
        null,
        properties
      );
      const relRef = writeEntity(
        api,
        modelId,
        IFCRELDEFINESBYPROPERTIES,
        mintGlobalId(api, modelId, guid),
        ownerRefs.ownerHistory,
        null,
        null,
        [windowRef],
        psetRef
      );
      span.setAttribute("windowId", window.id);
      span.setAttribute("propertyCount", properties.length);
      return { psetRef, relRef, propertyCount: properties.length };
    }
  );
}

function exportWallIFC4X3(args) {
  const { api, modelId, hierarchy, ownerRefs, metaStore, wall, guid } = args;
  return withSpan(
    "pryzm.ifc.export4x3-wall",
    () => {
      const meta = metaStore.get(wall.id);
      const storey = resolveStorey(hierarchy, wall.levelId || null);
      const [a, b] = wall.baseLine;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const length = Math.hypot(dx, dz);
      const yaw = Math.atan2(dz, dx);
      const cx = (a.x + b.x) / 2;
      const cz = (a.z + b.z) / 2;
      const elevation = a.y + wall.baseOffset;
      const placement = buildLocalPlacement(api, modelId, hierarchy.defaultPlacement, {
        position: { x: cx, y: cz, z: elevation },
        rotationZ: yaw
      });
      const representation = buildBoxRepresentation(
        api,
        modelId,
        hierarchy.representationContext,
        { width: length, depth: wall.thickness, height: wall.height }
      );
      const globalId = meta?.globalId ?? mintGlobalId(api, modelId, guid);
      const name = meta?.name ?? `Wall ${wall.id.slice(0, 8)}`;
      const entity = writeEntity(
        api,
        modelId,
        IFCWALL,
        globalId,
        ownerRefs.ownerHistory,
        label(api, modelId, name),
        meta?.description ? label(api, modelId, meta.description) : null,
        meta?.objectType ? label(api, modelId, meta.objectType) : null,
        placement,
        representation,
        label(api, modelId, wall.id),
        "STANDARD"
      );
      return { entity, storey, pryzmId: wall.id };
    },
    {
      "pryzm.ifc.element_id": wall.id,
      "pryzm.ifc.element_type": "wall-ifc4x3"
    }
  );
}
async function exportProjectToIFC4X3(snapshot, metaStore, projectMeta, options = {}, revitVariant) {
  return withSpan("pryzm.ifc.export4x3", async (span) => {
    const api = new IfcAPI2();
    await api.Init();
    const modelId = api.CreateModel({ schema: Schemas.IFC4X3 });
    const guid = options.guidProvider;
    const timestamp = options.timestamp ?? Math.floor(Date.now() / 1e3);
    try {
      const ownerRefs = buildOwnerHistory(api, modelId, projectMeta, timestamp);
      const hierarchy = buildHierarchy(
        api,
        modelId,
        projectMeta,
        snapshot.levels ?? [],
        ownerRefs,
        guid
      );
      const exported = [];
      let psetCount = 0;
      let propertyCount = 0;
      let wallPsetCount = 0;
      let wallQtoCount = 0;
      let doorPsetCount = 0;
      let windowPsetCount = 0;
      const runPsets = (el) => {
        const meta = metaStore.get(el.pryzmId);
        if (!meta || Object.keys(meta.psets).length === 0) return;
        const r = writeAllPsets({
          api,
          modelId,
          ownerRefs,
          element: el.entity,
          meta,
          guid
        });
        psetCount += r.psetCount;
        propertyCount += r.propertyCount;
      };
      for (const wall of snapshot.walls ?? []) {
        const el = exportWallIFC4X3({ api, modelId, hierarchy, ownerRefs, metaStore, wall, guid });
        exported.push(el);
        runPsets(el);
        const wallInput = { id: wall.id };
        const r = writePsetWallCommon(el.entity, wallInput, {
          api,
          modelId,
          ownerRefs,
          guid
        });
        wallPsetCount += 1;
        psetCount += 1;
        propertyCount += r.propertyCount;
        const [wa, wb] = wall.baseLine;
        const wdx = wb.x - wa.x;
        const wdz = wb.z - wa.z;
        const wallLengthM = Math.hypot(wdx, wdz);
        const openings = wall.openings;
        let openingsAreaM2;
        let openingsVolumeM3;
        if (Array.isArray(openings)) {
          let area = 0;
          for (const o of openings) {
            const ow = Number(o?.width);
            const oh = Number(o?.height);
            if (Number.isFinite(ow) && Number.isFinite(oh) && ow > 0 && oh > 0) area += ow * oh;
          }
          openingsAreaM2 = area;
          if (Number.isFinite(wall.thickness)) openingsVolumeM3 = area * wall.thickness;
        }
        const wallQtyInput = {
          id: wall.id,
          lengthM: Number.isFinite(wallLengthM) ? wallLengthM : void 0,
          widthM: Number.isFinite(wall.thickness) ? wall.thickness : void 0,
          heightM: Number.isFinite(wall.height) ? wall.height : void 0,
          ...openingsAreaM2 !== void 0 ? { openingsAreaM2 } : {},
          ...openingsVolumeM3 !== void 0 ? { openingsVolumeM3 } : {}
        };
        const qr = writeQtoWallBase(el.entity, wallQtyInput, {
          api,
          modelId,
          ownerRefs,
          guid
        });
        wallQtoCount += 1;
        psetCount += 1;
        propertyCount += qr.quantityCount;
      }
      for (const slab of snapshot.slabs ?? []) {
        const el = exportSlab({ api, modelId, hierarchy, ownerRefs, metaStore, slab, guid });
        exported.push(el);
        runPsets(el);
      }
      for (const door of snapshot.doors ?? []) {
        const el = exportDoor({
          api,
          modelId,
          hierarchy,
          ownerRefs,
          metaStore,
          door,
          guid,
          walls: snapshot.walls
        });
        exported.push(el);
        runPsets(el);
        const doorInput = {
          id: door.id,
          ...door.fireRating !== void 0 ? { fireRating: door.fireRating } : {}
        };
        const dpr = writePsetDoorCommon(el.entity, doorInput, {
          api,
          modelId,
          ownerRefs,
          guid
        });
        doorPsetCount += 1;
        psetCount += 1;
        propertyCount += dpr.propertyCount;
      }
      for (const window of snapshot.windows ?? []) {
        const el = exportWindow({
          api,
          modelId,
          hierarchy,
          ownerRefs,
          metaStore,
          window,
          guid,
          walls: snapshot.walls
        });
        exported.push(el);
        runPsets(el);
        const windowInput = {
          id: window.id,
          ...window.fireRating !== void 0 ? { fireRating: window.fireRating } : {}
        };
        const wpr = writePsetWindowCommon(el.entity, windowInput, {
          api,
          modelId,
          ownerRefs,
          guid
        });
        windowPsetCount += 1;
        psetCount += 1;
        propertyCount += wpr.propertyCount;
      }
      for (const column of snapshot.columns ?? []) {
        const el = exportColumn({ api, modelId, hierarchy, ownerRefs, metaStore, column, guid });
        exported.push(el);
        runPsets(el);
      }
      for (const beam of snapshot.beams ?? []) {
        const el = exportBeam({ api, modelId, hierarchy, ownerRefs, metaStore, beam, guid });
        exported.push(el);
        runPsets(el);
      }
      const spaces = [];
      let spacePsetCount = 0;
      let spacePropertyCount = 0;
      for (const room of snapshot.rooms ?? []) {
        const sp = exportRoomToSpace({ api, modelId, hierarchy, ownerRefs, room, guid });
        spaces.push(sp);
        spacePsetCount += 1;
        spacePropertyCount += 7;
        const meta = metaStore.get(room.id);
        if (meta && Object.keys(meta.psets).length > 0) {
          const r = writeAllPsets({
            api,
            modelId,
            ownerRefs,
            element: sp.entity,
            meta,
            guid
          });
          psetCount += r.psetCount;
          propertyCount += r.propertyCount;
        }
      }
      const spacesByStorey = /* @__PURE__ */ new Map();
      for (const sp of spaces) {
        const key = sp.storey.expressID;
        const bucket = spacesByStorey.get(key);
        if (bucket) bucket.entities.push(sp.entity);
        else spacesByStorey.set(key, { storey: sp.storey, entities: [sp.entity] });
      }
      for (const { storey, entities } of spacesByStorey.values()) {
        writeStoreyAggregatesSpaces(api, modelId, ownerRefs, guid, storey, entities);
      }
      psetCount += spacePsetCount;
      propertyCount += spacePropertyCount;
      const spaceRefMap = /* @__PURE__ */ new Map();
      for (const sp of spaces) spaceRefMap.set(sp.pryzmId, sp.entity);
      const zoneResult = writeAllApartmentZones(
        snapshot.apartments ?? [],
        spaceRefMap,
        { api, modelId, ownerRefs, guid }
      );
      let revitInstancePsetCount = 0;
      let revitWorksetCount = 0;
      let revitWorksetRelCount = 0;
      let revitCoordModePsetCount = 0;
      if (revitVariant) {
        assertRevitVariant(revitVariant.options);
        const revitCtx = { api, modelId, ownerRefs, guid };
        for (const { entityRef } of revitVariant.elementIds) {
          writePsetRevitInstance(
            entityRef,
            { instanceMarker: "PRYZM-EXPORT" },
            revitCtx
          );
          revitInstancePsetCount += 1;
        }
        const coordMode = revitVariant.options.coordinateMode ?? "project-base-point";
        applyCoordinateMode(hierarchy.site.expressID, coordMode, revitCtx);
        revitCoordModePsetCount = 1;
        if (revitVariant.options.worksets) {
          const memberMap = /* @__PURE__ */ new Map();
          const wsResult = writeRevitWorksetGroups(
            revitVariant.options.worksets,
            memberMap,
            revitCtx
          );
          revitWorksetCount = wsResult.groupCount;
          revitWorksetRelCount = wsResult.relCount;
        }
        psetCount += revitInstancePsetCount + revitCoordModePsetCount;
        propertyCount += revitInstancePsetCount + revitCoordModePsetCount;
      }
      const byStorey = /* @__PURE__ */ new Map();
      for (const el of exported) {
        const key = el.storey.expressID;
        const bucket = byStorey.get(key);
        if (bucket) bucket.elements.push(el.entity);
        else byStorey.set(key, { storey: el.storey, elements: [el.entity] });
      }
      for (const { storey, elements } of byStorey.values()) {
        writeEntity(
          api,
          modelId,
          IFCRELCONTAINEDINSPATIALSTRUCTURE,
          mintGlobalId(api, modelId, guid),
          ownerRefs.ownerHistory,
          null,
          null,
          elements,
          storey
        );
      }
      const counts = {
        walls: snapshot.walls?.length ?? 0,
        slabs: snapshot.slabs?.length ?? 0,
        doors: snapshot.doors?.length ?? 0,
        windows: snapshot.windows?.length ?? 0,
        columns: snapshot.columns?.length ?? 0,
        beams: snapshot.beams?.length ?? 0,
        spaces: spaces.length,
        zones: zoneResult.zoneCount,
        wallPsets: wallPsetCount,
        wallQtos: wallQtoCount,
        doorPsets: doorPsetCount,
        windowPsets: windowPsetCount,
        psets: psetCount,
        properties: propertyCount,
        // RVT-α-2 — present only when `revitVariant` was supplied.
        // `revitTypePsets` is reserved for α-3 (per-IfcType Pset_RevitType
        // emission, gated on the family-mapping registry). Today it is
        // always 0 — the shim does not yet emit a Pset_RevitType because
        // the IFC4X3 exporter does not yet produce IfcType lines.
        revitTypePsets: 0,
        revitInstancePsets: revitInstancePsetCount,
        revitWorksets: revitWorksetCount,
        revitWorksetRels: revitWorksetRelCount,
        revitCoordModePset: revitCoordModePsetCount
      };
      span.setAttribute("pryzm.ifc.export4x3.element_count", exported.length);
      span.setAttribute("pryzm.ifc.export4x3.space_count", spaces.length);
      span.setAttribute("pryzm.ifc.export4x3.zone_count", zoneResult.zoneCount);
      span.setAttribute("pryzm.ifc.export4x3.wall_pset_count", wallPsetCount);
      span.setAttribute("pryzm.ifc.export4x3.wall_qto_count", wallQtoCount);
      span.setAttribute("pryzm.ifc.export4x3.door_pset_count", doorPsetCount);
      span.setAttribute("pryzm.ifc.export4x3.window_pset_count", windowPsetCount);
      span.setAttribute("pryzm.ifc.export4x3.pset_count", psetCount);
      span.setAttribute(
        "pryzm.ifc.export4x3.revit_variant",
        revitVariant !== void 0
      );
      const bytes = api.SaveModel(modelId);
      return { bytes, counts };
    } finally {
      try {
        api.CloseModel(modelId);
      } catch {
      }
    }
  });
}

class InMemoryIFCMetaStore {
  elements = /* @__PURE__ */ new Map();
  globalIdIndex = /* @__PURE__ */ new Map();
  /** Register or replace metadata for a PRYZM element. */
  add(meta) {
    this.elements.set(meta.pryzmElementId, meta);
    this.globalIdIndex.set(meta.globalId, meta.pryzmElementId);
  }
  get(pryzmElementId) {
    return this.elements.get(pryzmElementId);
  }
  getByGlobalId(globalId) {
    const id = this.globalIdIndex.get(globalId);
    return id ? this.elements.get(id) : void 0;
  }
  /** Number of registered elements (used by tests + observability). */
  size() {
    return this.elements.size;
  }
  /** Mutate (or insert) a single Pset property. */
  updatePset(pryzmElementId, psetName, propertyName, value) {
    const meta = this.elements.get(pryzmElementId);
    if (!meta) return;
    const pset = meta.psets[psetName] ?? {};
    pset[propertyName] = value;
    meta.psets[psetName] = pset;
  }
  /** Mutate (or insert) a single quantity. */
  updateQuantity(pryzmElementId, qsetName, quantityName, value) {
    const meta = this.elements.get(pryzmElementId);
    if (!meta) return;
    const quantities = meta.quantities ?? {};
    const qset = quantities[qsetName] ?? {};
    qset[quantityName] = value;
    quantities[qsetName] = qset;
    meta.quantities = quantities;
  }
  /**
   * Stable JSON serialisation suitable for inclusion in `.pryzm` v1.
   * Format mirrors `IFCMetaStore.serialize()` from S55 spec.
   */
  serialize() {
    return {
      version: 1,
      elements: Object.fromEntries(this.elements)
    };
  }
  /**
   * Remove a single element's metadata entry.
   * Returns true if the element was present and deleted, false if it was not found.
   */
  delete(pryzmElementId) {
    const meta = this.elements.get(pryzmElementId);
    if (!meta) return false;
    this.globalIdIndex.delete(meta.globalId);
    this.elements.delete(pryzmElementId);
    return true;
  }
  static deserialize(data) {
    const store = new InMemoryIFCMetaStore();
    for (const meta of Object.values(data.elements ?? {})) {
      store.add(meta);
    }
    return store;
  }
}

const HEX_CHARS = "0123456789abcdef";
function toHex(byte) {
  return (HEX_CHARS[byte >>> 4 & 15] ?? "0") + (HEX_CHARS[byte & 15] ?? "0");
}
function deterministicUuid(seed) {
  const bytes = new Uint8Array(16);
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  for (let i = 0; i < 16; i += 1) {
    bytes[i] = h >>> i % 4 * 8 & 255;
    if (i % 4 === 3) {
      h ^= h << 13;
      h ^= h >>> 17;
      h ^= h << 5;
      h >>>= 0;
    }
  }
  bytes[6] = ((bytes[6] ?? 0) & 15 | 64) & 255;
  bytes[8] = ((bytes[8] ?? 0) & 63 | 128) & 255;
  const hex = [];
  for (let i = 0; i < 16; i += 1) hex.push(toHex(bytes[i] ?? 0));
  const s = hex.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

const IFC_EXPORT_COMMANDS = {
  /** Export the full project snapshot to IFC4 bytes. */
  EXPORT: "ifc.export",
  /** Export a single element family to IFC4 (for incremental workflows). */
  EXPORT_FAMILY: "ifc.export.family",
  /** Store IFC metadata (Psets, GlobalIds) against a PRYZM element id. */
  META_STORE_UPSERT: "ifc.meta.upsert",
  /** Clear stored IFC metadata for an element. */
  META_STORE_CLEAR: "ifc.meta.clear"
};

[
  IFC_EXPORT_COMMANDS.EXPORT,
  IFC_EXPORT_COMMANDS.META_STORE_UPSERT,
  IFC_EXPORT_COMMANDS.META_STORE_CLEAR
];
function registerIFCExportHandlers(bus, deps = {}) {
  const metaStore = deps.metaStore ?? new InMemoryIFCMetaStore();
  bus.on(IFC_EXPORT_COMMANDS.EXPORT, async (raw) => {
    const payload = raw;
    const result = await exportProjectToIFC(
      payload.snapshot,
      metaStore,
      payload.projectMeta
    );
    const filename = payload.filename ?? "export.ifc";
    deps.onExported?.(result.bytes, filename);
    return result;
  });
  bus.on(IFC_EXPORT_COMMANDS.META_STORE_UPSERT, async (raw) => {
    const payload = raw;
    const existing = metaStore.get(payload.elementId);
    if (existing) {
      for (const [psetName, pset] of Object.entries(payload.psets ?? {})) {
        for (const [propName, value] of Object.entries(pset)) {
          metaStore.updatePset(payload.elementId, psetName, propName, value);
        }
      }
    } else {
      metaStore.add({
        pryzmElementId: payload.elementId,
        globalId: payload.ifcGuid,
        typeName: "IFCELEMENT",
        // safe default; enriched by importer on round-trip
        psets: payload.psets ?? {},
        tier: 1
      });
    }
  });
  bus.on(IFC_EXPORT_COMMANDS.META_STORE_CLEAR, async (raw) => {
    const payload = raw;
    metaStore.delete(payload.elementId);
  });
}

export { IFC_EXPORT_COMMANDS, InMemoryIFCMetaStore, PROVENANCE_PSET_NAME, PRYZM_IFC_TRACER, buildProvenancePset, deterministicUuid, exportProjectToIFC, exportProjectToIFC4X3, globalIdFromUuid, registerIFCExportHandlers };
