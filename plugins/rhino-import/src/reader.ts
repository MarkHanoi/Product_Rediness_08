/**
 * Rhino .3dm reader (Phase 3-B Sprint S57).
 *
 * Per PHASE-3B-Q2-M28-M30-PLUGINS-IFC-DXF-RHINO.md §S57. Uses the official
 * McNeel `rhino3dm` WASM library; loaded via dynamic import so the WASM
 * initialisation cost is paid only when the plugin is actually used (the
 * editor's first-paint bundle stays clean per format-plugin K3-B gate).
 *
 * The reader is intentionally thin — it converts `rhino3dm` JS objects into
 * the discriminated `RhinoObject` union exposed in `./types.js`. Brep /
 * SubD / Extrusion shapes are emitted as meshes when the file carries a
 * render mesh, otherwise counted as `droppedNoMesh` and skipped.
 */

import type {
  RhinoLayer,
  RhinoObject,
  RhinoSceneDocument,
  Vec3,
} from './types.js';
import { withSpan } from './otel.js';

/** Subset of the rhino3dm `Module` we touch. Defined structurally for tests. */
export interface RhinoModuleLike {
  File3dm: { fromByteArray(bytes: Uint8Array): unknown | null };
}

let cachedModule: RhinoModuleLike | null = null;

/**
 * Lazy-load the rhino3dm WASM module.  Cached for the lifetime of the
 * process. Tests can short-circuit by passing their own module to
 * `readRhino3dm({ rhinoModule })`.
 */
export async function loadRhinoModule(): Promise<RhinoModuleLike> {
  if (cachedModule) return cachedModule;
  const mod = await import('rhino3dm');
  const factory = (mod.default ?? mod) as unknown as () => Promise<RhinoModuleLike>;
  cachedModule = await factory();
  return cachedModule;
}

const UNIT_NAMES = ['unknown', 'unknown', 'millimeters', 'centimeters', 'meters', 'unknown', 'inches', 'feet'] as const;
function unitName(code: number): RhinoSceneDocument['unit'] {
  return (UNIT_NAMES[code] as RhinoSceneDocument['unit']) ?? 'unknown';
}

interface DocLike {
  applicationName?: () => string;
  applicationDetails?: () => string;
  unitSystem?: () => number;
  layers?: { count: number; get(i: number): unknown };
  settings?: () => { modelUnitSystem?: number };
  objects?: () => { count: number; get(i: number): unknown };
}

interface LayerLike {
  id: string;
  name: string;
  fullPath: string;
  parentLayerId: string;
  visible: boolean;
  color: { r: number; g: number; b: number; a?: number };
}

interface ObjectLike {
  attributes: () => { id: string; layerIndex: number };
  geometry: () => unknown;
}

interface PointLike {
  objectType: number;
  location: Vec3;
}

interface CurveLike {
  objectType: number;
  isClosed?: boolean;
  toPolyline?: (tol?: number, ang?: number) => { count: number; get(i: number): Vec3 } | null;
  pointCount?: number;
  point?: (i: number) => Vec3;
}

interface MeshLike {
  objectType: number;
  vertices: () => { count: number; get(i: number): Vec3 };
  faces: () => { count: number; get(i: number): { a: number; b: number; c: number; d: number; isQuad: boolean } };
}

const NULL_LAYER_ID = '00000000-0000-0000-0000-000000000000';

function readLayers(doc: DocLike): { layers: RhinoLayer[]; idByIndex: Map<number, string> } {
  const layers: RhinoLayer[] = [];
  const idByIndex = new Map<number, string>();
  if (!doc.layers) return { layers, idByIndex };
  for (let i = 0; i < doc.layers.count; i++) {
    const l = doc.layers.get(i) as LayerLike | null;
    if (!l) continue;
    layers.push({
      id: l.id,
      name: l.name,
      fullPath: l.fullPath ?? l.name,
      parentLayerId: l.parentLayerId === NULL_LAYER_ID ? null : l.parentLayerId,
      visible: l.visible !== false,
      color: { r: l.color?.r ?? 0, g: l.color?.g ?? 0, b: l.color?.b ?? 0 },
    });
    idByIndex.set(i, l.id);
  }
  return { layers, idByIndex };
}

const OBJ_KIND_POINT = 1;
const OBJ_KIND_CURVE = 4;
const OBJ_KIND_MESH = 32;

function pointFromGeo(geo: PointLike, id: string, layerId: string): RhinoObject | null {
  if (!geo.location) return null;
  return { kind: 'point', id, layerId, position: geo.location };
}

function curveFromGeo(geo: CurveLike, id: string, layerId: string): RhinoObject | null {
  let vertices: Vec3[] = [];
  if (typeof geo.toPolyline === 'function') {
    const pl = geo.toPolyline(0.01, 0.01);
    if (pl) {
      for (let i = 0; i < pl.count; i++) vertices.push(pl.get(i));
    }
  }
  if (vertices.length === 0 && typeof geo.point === 'function' && typeof geo.pointCount === 'number') {
    for (let i = 0; i < geo.pointCount; i++) vertices.push(geo.point(i));
  }
  if (vertices.length < 2) return null;
  return { kind: 'curve', id, layerId, closed: !!geo.isClosed, vertices };
}

function meshFromGeo(geo: MeshLike, id: string, layerId: string): RhinoObject | null {
  const vList = geo.vertices();
  const fList = geo.faces();
  const vertices = new Float32Array(vList.count * 3);
  for (let i = 0; i < vList.count; i++) {
    const p = vList.get(i);
    vertices[i * 3] = p.x;
    vertices[i * 3 + 1] = p.y;
    vertices[i * 3 + 2] = p.z;
  }
  const faceTris: number[] = [];
  for (let i = 0; i < fList.count; i++) {
    const f = fList.get(i);
    faceTris.push(f.a, f.b, f.c);
    if (f.isQuad) faceTris.push(f.a, f.c, f.d);
  }
  const faces = new Uint32Array(faceTris);
  if (vertices.length === 0 || faces.length === 0) return null;
  return { kind: 'mesh', id, layerId, vertices, faces };
}

function objectFromGeometry(geo: unknown, id: string, layerId: string): RhinoObject | null {
  if (!geo || typeof geo !== 'object') return null;
  const obj = geo as { objectType?: number };
  switch (obj.objectType) {
    case OBJ_KIND_POINT:
      return pointFromGeo(geo as PointLike, id, layerId);
    case OBJ_KIND_CURVE:
      return curveFromGeo(geo as CurveLike, id, layerId);
    case OBJ_KIND_MESH:
      return meshFromGeo(geo as MeshLike, id, layerId);
    default:
      return null;
  }
}

/**
 * Read a `.3dm` byte buffer and return a normalised scene document.
 *
 * Wraps the read in a `pryzm.rhino.import` OTel span carrying the counts
 * (matches phase doc §11 telemetry table — span namespace `pryzm.rhino`).
 */
export async function readRhino3dm(
  bytes: Uint8Array,
  opts: { rhinoModule?: RhinoModuleLike } = {},
): Promise<RhinoSceneDocument> {
  return withSpan('pryzm.rhino.import', { byte_count: bytes.byteLength }, async (span) => {
    const mod = opts.rhinoModule ?? (await loadRhinoModule());
    const doc = mod.File3dm.fromByteArray(bytes) as DocLike | null;
    if (!doc) {
      throw new Error('readRhino3dm: rhino3dm.File3dm.fromByteArray returned null');
    }

    const { layers, idByIndex } = readLayers(doc);

    const objects: RhinoObject[] = [];
    let droppedNoMesh = 0;
    const objectsTable = typeof doc.objects === 'function' ? doc.objects() : doc.objects;
    const objCount = objectsTable?.count ?? 0;
    for (let i = 0; i < objCount; i++) {
      const o = objectsTable!.get(i) as ObjectLike | null;
      if (!o) continue;
      const attrs = o.attributes();
      const layerId = idByIndex.get(attrs.layerIndex) ?? NULL_LAYER_ID;
      const geo = o.geometry();
      const converted = objectFromGeometry(geo, attrs.id, layerId);
      if (converted) objects.push(converted);
      else droppedNoMesh++;
    }

    const unit = unitName(
      typeof doc.unitSystem === 'function'
        ? doc.unitSystem()
        : (doc.settings?.()?.modelUnitSystem ?? 0),
    );

    const counts = {
      layers: layers.length,
      points: objects.filter((o) => o.kind === 'point').length,
      curves: objects.filter((o) => o.kind === 'curve').length,
      meshes: objects.filter((o) => o.kind === 'mesh').length,
      droppedNoMesh,
    };
    span.setAttribute('layers', counts.layers);
    span.setAttribute('points', counts.points);
    span.setAttribute('curves', counts.curves);
    span.setAttribute('meshes', counts.meshes);
    span.setAttribute('dropped_no_mesh', counts.droppedNoMesh);

    return {
      schemaVersion: 0,
      application: typeof doc.applicationName === 'function' ? doc.applicationName() : 'unknown',
      unit,
      layers,
      objects,
      counts,
    };
  });
}
