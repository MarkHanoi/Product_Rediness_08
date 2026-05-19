/**
 * LTPENURebase — Local Tangent Plane (East-North-Up) coordinate rebasing.
 *
 * CONTRACT (C12 §1.1 — was §C11 in plan):
 *   Scene origin is recentred to the LTP frame nearest the camera whenever
 *   the camera moves > 1 km from the current scene origin. This keeps
 *   Three.js float32 position buffers within ±1 km of origin, eliminating
 *   floating-point jitter at real-world coordinates.
 *
 * Design:
 *   proj4 is injected via constructor (Proj4Fn interface) so the class is
 *   fully testable without module-level mocking. Position results are plain
 *   `SceneVec3` objects (no THREE.Vector3 import) — the caller may lift them
 *   into THREE as needed, keeping this package free of renderer deps.
 *
 * Wave A17-T12 (2026-05-03).
 */
import { trace } from '@opentelemetry/api';

const _tracer = trace.getTracer('pryzm.geospatial');

/** Minimal structural interface for a proj4 callable. */
export interface Proj4Fn {
  (fromCRS: string, toCRS: string, coord: [number, number]): [number, number];
  defs(name: string, def: string): void;
}

/** Plain 3-component scene-space position (East / Up / -North → X / Y / Z). */
export interface SceneVec3 {
  x: number;
  y: number;
  z: number;
}

/** WGS84 geographic coordinate triple. */
export interface GeoCoord {
  lat: number;
  lon: number;
  elev: number;
}

export class LTPENURebase {
  private readonly _proj4: Proj4Fn;
  private _origin: GeoCoord = { lat: 0, lon: 0, elev: 0 };

  /** Threshold in metres — recenter when camera exceeds this distance from origin. */
  static readonly RECENTER_THRESHOLD_M = 1_000;

  /**
   * @param proj4        A proj4 callable (import proj4 from 'proj4').
   * @param proj4String  The Proj4 projection string for this project's CRS.
   *                     Example: '+proj=utm +zone=30 +datum=WGS84 +units=m'
   */
  constructor(proj4: Proj4Fn, proj4String: string) {
    this._proj4 = proj4;
    try {
      proj4.defs('PROJECT_CRS', proj4String);
    } catch {
      /* proj4.defs throws if the string is invalid — propagate gracefully */
    }
  }

  /**
   * Project WGS84 geodetic coordinates to scene-space (ENU relative to
   * the current LTP origin).
   *
   * Axis convention:
   *   scene.x =  East  offset (metres)
   *   scene.y =  Up    offset (metres, = elev difference)
   *   scene.z = -North offset (metres, Three.js -Z faces viewer)
   */
  projectToScene(lat: number, lon: number, elev: number): SceneVec3 {
    const span = _tracer.startSpan('pryzm.geospatial.projectToScene');
    try {
      const [x, y] = this._proj4('WGS84', 'PROJECT_CRS', [lon, lat]);
      const [ox, oy] = this._proj4('WGS84', 'PROJECT_CRS', [
        this._origin.lon,
        this._origin.lat,
      ]);
      return {
        x: x - ox,
        y: elev - this._origin.elev,
        z: -(y - oy),
      };
    } finally {
      span.end();
    }
  }

  /**
   * Unproject scene-space back to WGS84 geodetic coordinates.
   */
  unprojectFromScene(pos: SceneVec3): GeoCoord {
    const span = _tracer.startSpan('pryzm.geospatial.unprojectFromScene');
    try {
      const [ox, oy] = this._proj4('WGS84', 'PROJECT_CRS', [
        this._origin.lon,
        this._origin.lat,
      ]);
      const [lon, lat] = this._proj4('PROJECT_CRS', 'WGS84', [
        pos.x + ox,
        -pos.z + oy,
      ]);
      return { lat, lon, elev: pos.y + this._origin.elev };
    } finally {
      span.end();
    }
  }

  /**
   * Recenter the LTP origin to a new WGS84 position.
   *
   * Returns the translation vector (in scene space) that ALL existing scene
   * objects must be shifted by so they remain at the correct relative position
   * after the origin moves.
   *
   * Caller is responsible for applying this shift to the scene graph.
   */
  recenter(newLat: number, newLon: number, newElev: number): SceneVec3 {
    const span = _tracer.startSpan('pryzm.geospatial.recenter');
    try {
      const oldOrigin = { ...this._origin };
      this._origin = { lat: newLat, lon: newLon, elev: newElev };
      // The old origin, expressed in the new coordinate frame, gives the
      // shift vector that all existing scene objects must be moved by so
      // they remain at the same world position after the origin moves.
      return this.projectToScene(oldOrigin.lat, oldOrigin.lon, oldOrigin.elev);
    } finally {
      span.end();
    }
  }

  /**
   * Directly set the LTP origin without computing a shift vector.
   * Use on first load, before any scene objects have been placed.
   */
  setOrigin(lat: number, lon: number, elev: number): void {
    this._origin = { lat, lon, elev };
  }

  /**
   * Returns the planar distance (metres) from the current LTP origin to the
   * given geodetic coordinate, ignoring elevation. Use this to decide whether
   * to call `recenter()`.
   */
  distanceFromOriginMetres(lat: number, lon: number): number {
    const pos = this.projectToScene(lat, lon, this._origin.elev);
    return Math.sqrt(pos.x * pos.x + pos.z * pos.z);
  }

  /** Returns a copy of the current LTP origin. */
  get origin(): GeoCoord {
    return { ...this._origin };
  }
}
