const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/rhino3dm-DkcY-cpn.js","assets/index-CtIMEkHY.js","assets/preload-helper-CJHylW7d.js","assets/trace-api-BIfvUk_c.js","assets/ElementStore-CQe7ZDFd.js","assets/LODManager-DHqndFcX.js","assets/SteelProfileLibrary-NgbfwhrM.js","assets/three.core-Bv4ks8y-.js","assets/three.module-zvZFyv9V.js","assets/___vite-browser-external_commonjs-proxy-CKsYqxPy.js","assets/__vite-browser-external-CVaeKfQx.js"])))=>i.map(i=>d[i]);
import { _ as __vitePreload } from './preload-helper-CJHylW7d.js';
import { S as SpanStatusCode, t as trace } from './trace-api-BIfvUk_c.js';

const PRYZM_RHINO_TRACER = "pryzm.rhino";
function getTracer() {
  return trace.getTracer(PRYZM_RHINO_TRACER);
}
async function withSpan(name, attrs, fn) {
  const span = getTracer().startSpan(name);
  for (const [k, v] of Object.entries(attrs)) {
    if (v != null) span.setAttribute(k, v);
  }
  try {
    const out = await fn(span);
    span.setStatus({ code: SpanStatusCode.OK });
    return out;
  } catch (err) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
    if (err instanceof Error) span.recordException(err);
    throw err;
  } finally {
    span.end();
  }
}

let cachedModule = null;
async function loadRhinoModule() {
  if (cachedModule) return cachedModule;
  const mod = await __vitePreload(() => import('./rhino3dm-DkcY-cpn.js').then(n => n.r),true              ?__vite__mapDeps([0,1,2,3,4,5,6,7,8,9,10]):void 0);
  const factory = mod.default ?? mod;
  cachedModule = await factory();
  return cachedModule;
}
const UNIT_NAMES = ["unknown", "unknown", "millimeters", "centimeters", "meters", "unknown", "inches", "feet"];
function unitName(code) {
  return UNIT_NAMES[code] ?? "unknown";
}
const NULL_LAYER_ID = "00000000-0000-0000-0000-000000000000";
function readLayers(doc) {
  const layers = [];
  const idByIndex = /* @__PURE__ */ new Map();
  if (!doc.layers) return { layers, idByIndex };
  for (let i = 0; i < doc.layers.count; i++) {
    const l = doc.layers.get(i);
    if (!l) continue;
    layers.push({
      id: l.id,
      name: l.name,
      fullPath: l.fullPath ?? l.name,
      parentLayerId: l.parentLayerId === NULL_LAYER_ID ? null : l.parentLayerId,
      visible: l.visible !== false,
      color: { r: l.color?.r ?? 0, g: l.color?.g ?? 0, b: l.color?.b ?? 0 }
    });
    idByIndex.set(i, l.id);
  }
  return { layers, idByIndex };
}
const OBJ_KIND_POINT = 1;
const OBJ_KIND_CURVE = 4;
const OBJ_KIND_MESH = 32;
function pointFromGeo(geo, id, layerId) {
  if (!geo.location) return null;
  return { kind: "point", id, layerId, position: geo.location };
}
function curveFromGeo(geo, id, layerId) {
  let vertices = [];
  if (typeof geo.toPolyline === "function") {
    const pl = geo.toPolyline(0.01, 0.01);
    if (pl) {
      for (let i = 0; i < pl.count; i++) vertices.push(pl.get(i));
    }
  }
  if (vertices.length === 0 && typeof geo.point === "function" && typeof geo.pointCount === "number") {
    for (let i = 0; i < geo.pointCount; i++) vertices.push(geo.point(i));
  }
  if (vertices.length < 2) return null;
  return { kind: "curve", id, layerId, closed: !!geo.isClosed, vertices };
}
function meshFromGeo(geo, id, layerId) {
  const vList = geo.vertices();
  const fList = geo.faces();
  const vertices = new Float32Array(vList.count * 3);
  for (let i = 0; i < vList.count; i++) {
    const p = vList.get(i);
    vertices[i * 3] = p.x;
    vertices[i * 3 + 1] = p.y;
    vertices[i * 3 + 2] = p.z;
  }
  const faceTris = [];
  for (let i = 0; i < fList.count; i++) {
    const f = fList.get(i);
    faceTris.push(f.a, f.b, f.c);
    if (f.isQuad) faceTris.push(f.a, f.c, f.d);
  }
  const faces = new Uint32Array(faceTris);
  if (vertices.length === 0 || faces.length === 0) return null;
  return { kind: "mesh", id, layerId, vertices, faces };
}
function objectFromGeometry(geo, id, layerId) {
  if (!geo || typeof geo !== "object") return null;
  const obj = geo;
  switch (obj.objectType) {
    case OBJ_KIND_POINT:
      return pointFromGeo(geo, id, layerId);
    case OBJ_KIND_CURVE:
      return curveFromGeo(geo, id, layerId);
    case OBJ_KIND_MESH:
      return meshFromGeo(geo, id, layerId);
    default:
      return null;
  }
}
async function readRhino3dm(bytes, opts = {}) {
  return withSpan("pryzm.rhino.import", { byte_count: bytes.byteLength }, async (span) => {
    const mod = opts.rhinoModule ?? await loadRhinoModule();
    const doc = mod.File3dm.fromByteArray(bytes);
    if (!doc) {
      throw new Error("readRhino3dm: rhino3dm.File3dm.fromByteArray returned null");
    }
    const { layers, idByIndex } = readLayers(doc);
    const objects = [];
    let droppedNoMesh = 0;
    const objectsTable = typeof doc.objects === "function" ? doc.objects() : doc.objects;
    const objCount = objectsTable?.count ?? 0;
    for (let i = 0; i < objCount; i++) {
      const o = objectsTable.get(i);
      if (!o) continue;
      const attrs = o.attributes();
      const layerId = idByIndex.get(attrs.layerIndex) ?? NULL_LAYER_ID;
      const geo = o.geometry();
      const converted = objectFromGeometry(geo, attrs.id, layerId);
      if (converted) objects.push(converted);
      else droppedNoMesh++;
    }
    const unit = unitName(
      typeof doc.unitSystem === "function" ? doc.unitSystem() : doc.settings?.()?.modelUnitSystem ?? 0
    );
    const counts = {
      layers: layers.length,
      points: objects.filter((o) => o.kind === "point").length,
      curves: objects.filter((o) => o.kind === "curve").length,
      meshes: objects.filter((o) => o.kind === "mesh").length,
      droppedNoMesh
    };
    span.setAttribute("layers", counts.layers);
    span.setAttribute("points", counts.points);
    span.setAttribute("curves", counts.curves);
    span.setAttribute("meshes", counts.meshes);
    span.setAttribute("dropped_no_mesh", counts.droppedNoMesh);
    return {
      schemaVersion: 0,
      application: typeof doc.applicationName === "function" ? doc.applicationName() : "unknown",
      unit,
      layers,
      objects,
      counts
    };
  });
}

export { PRYZM_RHINO_TRACER, loadRhinoModule, readRhino3dm };
