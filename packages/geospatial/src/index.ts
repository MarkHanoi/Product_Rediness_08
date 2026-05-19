/**
 * @pryzm/geospatial — Wave A17 public surface.
 *
 * CONTRACT (C12 — Geospatial Coordinate Precision):
 *   §1 — LTP-ENU rebasing (LTPENURebase)
 *   §2 — GeospatialAdapter (proj4js geodetic transforms + auto-recenter)
 *   §1.4 — IfcProjectedCRS round-trip types
 */
export {
  LTPENURebase,
  type Proj4Fn,
  type SceneVec3,
  type GeoCoord,
} from './LTPENURebase.js';

export {
  GeospatialAdapter,
  type GeospatialAdapterOptions,
} from './GeospatialAdapter.js';

export type { IfcProjectedCRSRecord } from './IfcProjectedCRSRecord.js';
