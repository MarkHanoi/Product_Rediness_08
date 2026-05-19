/**
 * Public types for `@pryzm/plugin-rhino-import`.
 *
 * Phase 3-B Sprint S57 (PHASE-3B-Q2-M28-M30-PLUGINS-IFC-DXF-RHINO.md §S57).
 * Reads Rhino .3dm binary files via the official `rhino3dm` WASM library
 * (McNeel) and produces a normalised `RhinoSceneDocument` for downstream
 * consumption by `drawing-primitives` / `geometry-kernel`.
 */

/** A single 3D point. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Layer metadata pulled from the Rhino layer table.
 * `parentLayerId` is null for top-level layers.
 */
export interface RhinoLayer {
  id: string;
  name: string;
  fullPath: string;
  parentLayerId: string | null;
  visible: boolean;
  color: { r: number; g: number; b: number };
}

/** A point geometry object (`ON_Point`). */
export interface RhinoPoint {
  kind: 'point';
  id: string;
  layerId: string;
  position: Vec3;
}

/**
 * A curve geometry object (`ON_Curve` family). The reader emits a polyline
 * approximation when the curve is non-linear; pure straight lines preserve
 * 2-vertex polylines.
 */
export interface RhinoCurve {
  kind: 'curve';
  id: string;
  layerId: string;
  closed: boolean;
  vertices: Vec3[];
}

/**
 * A mesh geometry object (`ON_Mesh`). Vertices flat array of `[x,y,z,...]`,
 * face indices flat array of triangles `[a,b,c,...]`.
 */
export interface RhinoMesh {
  kind: 'mesh';
  id: string;
  layerId: string;
  vertices: Float32Array;
  faces: Uint32Array;
}

/**
 * Discriminated union — every Rhino object falls into one of three buckets
 * for v0.1. Brep / Extrusion / Subd are emitted as meshes when the file
 * carries a render mesh, otherwise dropped.
 */
export type RhinoObject = RhinoPoint | RhinoCurve | RhinoMesh;

/** The full normalised result of `readRhino3dm`. */
export interface RhinoSceneDocument {
  /** File schema version reported by rhino3dm. */
  schemaVersion: number;
  /** File application name + version (Rhino 7, Rhino 8, etc.). */
  application: string;
  unit: 'millimeters' | 'centimeters' | 'meters' | 'inches' | 'feet' | 'unknown';
  layers: RhinoLayer[];
  objects: RhinoObject[];
  /** Counts for OTel attribution + exit-criteria assertions. */
  counts: {
    layers: number;
    points: number;
    curves: number;
    meshes: number;
    droppedNoMesh: number;
  };
}
