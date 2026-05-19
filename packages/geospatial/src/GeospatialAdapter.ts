/**
 * GeospatialAdapter — public façade for project-level geodetic transforms.
 *
 * CONTRACT (C12 §2):
 *   - Accepts a Proj4 string on initialization.
 *   - Exposes `projectToScene(lat, lon, elev)` → SceneVec3.
 *   - Exposes `unprojectFromScene(pos)` → GeoCoord.
 *   - Uses proj4js for all transform calculations.
 *   - Applies LTP-ENU rebasing — call `checkAndRecenter(cameraLat, cameraLon)`
 *     on every camera frame; the adapter triggers `recenter()` automatically
 *     when the threshold is exceeded and invokes `onRecenter` so the engine
 *     can shift the scene graph.
 *
 * Wave A17-T13 (2026-05-03) — replaces spherical approximation.
 */
import proj4 from 'proj4';
import { LTPENURebase, type SceneVec3, type GeoCoord } from './LTPENURebase.js';

export interface GeospatialAdapterOptions {
  /** Proj4 projection string for this project's CRS. */
  proj4String: string;
  /** Initial WGS84 origin (e.g. from IfcProjectedCRS). */
  origin?: GeoCoord;
  /**
   * Callback invoked when the LTP origin shifts. The `translation` is the
   * vector by which all scene objects must be moved in scene space.
   */
  onRecenter?: (translation: SceneVec3) => void;
}

export class GeospatialAdapter {
  private readonly _rebase: LTPENURebase;
  private readonly _onRecenter: ((t: SceneVec3) => void) | undefined;

  constructor(opts: GeospatialAdapterOptions) {
    this._rebase = new LTPENURebase(proj4 as unknown as import('./LTPENURebase.js').Proj4Fn, opts.proj4String);
    this._onRecenter = opts.onRecenter;
    if (opts.origin) {
      this._rebase.setOrigin(opts.origin.lat, opts.origin.lon, opts.origin.elev);
    }
  }

  /** Project WGS84 → scene (ENU relative to current LTP origin). */
  projectToScene(lat: number, lon: number, elev: number): SceneVec3 {
    return this._rebase.projectToScene(lat, lon, elev);
  }

  /** Unproject scene → WGS84. */
  unprojectFromScene(pos: SceneVec3): GeoCoord {
    return this._rebase.unprojectFromScene(pos);
  }

  /**
   * Called each camera frame. Triggers `recenter()` + `onRecenter` callback
   * when the camera has moved > 1 km from the LTP origin.
   */
  checkAndRecenter(cameraLat: number, cameraLon: number): void {
    const dist = this._rebase.distanceFromOriginMetres(cameraLat, cameraLon);
    if (dist > LTPENURebase.RECENTER_THRESHOLD_M) {
      const translation = this._rebase.recenter(cameraLat, cameraLon, this._rebase.origin.elev);
      this._onRecenter?.(translation);
    }
  }

  /** Manually update the LTP origin (e.g. on first model load from IfcProjectedCRS). */
  setOrigin(lat: number, lon: number, elev: number): void {
    this._rebase.setOrigin(lat, lon, elev);
  }

  get origin(): GeoCoord {
    return this._rebase.origin;
  }
}
