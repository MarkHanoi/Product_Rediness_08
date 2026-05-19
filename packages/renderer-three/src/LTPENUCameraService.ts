/**
 * LTPENUCameraService — lightweight hook that wires the `GeospatialAdapter`
 * recentre trigger to the engine's camera position update loop.
 *
 * CONTRACT (C12 §1.1 + Wave A17-T14):
 *   Scene origin MUST be recentred whenever the camera moves > 1 km from the
 *   current LTP origin. This service is the wiring point between the
 *   Three.js camera and `GeospatialAdapter.checkAndRecenter()`.
 *
 * Design (no-op when geospatial is inactive):
 *   The service is inactive by default. Call `attach(adapter, camera)` to
 *   activate it. If no geospatial project CRS is configured, nothing happens.
 *   This keeps the rendering hot-path free of geospatial overhead for
 *   non-geolocated projects.
 *
 * Usage (in the engine render loop or camera change handler):
 * ```ts
 * ltpEnuService.onCameraMove(camera.position);
 * ```
 *
 * Wave A17-T14 (2026-05-03).
 */
import * as THREE from './three-re-export';

/** Minimal duck-typed interface for GeospatialAdapter (no package import needed). */
export interface GeospatialAdapterLike {
  checkAndRecenter(cameraLat: number, cameraLon: number): void;
  unprojectFromScene(pos: { x: number; y: number; z: number }): { lat: number; lon: number; elev: number };
}

/** Minimum camera movement (metres) to trigger a CRS recentre check. */
const CHECK_INTERVAL_M = 100;

export class LTPENUCameraService {
  private _adapter: GeospatialAdapterLike | null = null;
  private _lastCheckPos: THREE.Vector3 = new THREE.Vector3(Infinity, 0, Infinity);

  /**
   * Attach a `GeospatialAdapter`. Once attached, `onCameraMove()` will
   * invoke `checkAndRecenter()` at `CHECK_INTERVAL_M` granularity.
   *
   * Call with `null` to detach (restores no-op behaviour).
   */
  attach(adapter: GeospatialAdapterLike | null): void {
    this._adapter = adapter;
    this._lastCheckPos.set(Infinity, 0, Infinity);
  }

  /**
   * Call this every frame (or on every camera position change) from the
   * engine render loop.
   *
   * This is a no-op when no adapter is attached (zero overhead).
   * When attached, triggers a geospatial recentre check only when the camera
   * has moved at least `CHECK_INTERVAL_M` metres since the last check.
   */
  onCameraMove(cameraWorldPos: THREE.Vector3): void {
    if (!this._adapter) return;
    const distMoved = cameraWorldPos.distanceTo(this._lastCheckPos);
    if (distMoved < CHECK_INTERVAL_M) return;
    this._lastCheckPos.copy(cameraWorldPos);
    try {
      const geo = this._adapter.unprojectFromScene({
        x: cameraWorldPos.x,
        y: cameraWorldPos.y,
        z: cameraWorldPos.z,
      });
      this._adapter.checkAndRecenter(geo.lat, geo.lon);
    } catch {
      // If the adapter has no valid projection (first load), silently skip
    }
  }

  /** Returns `true` when a `GeospatialAdapter` is currently attached. */
  get active(): boolean {
    return this._adapter !== null;
  }
}

/** Module-level singleton — import and use from the engine render loop. */
export const ltpEnuCameraService = new LTPENUCameraService();
