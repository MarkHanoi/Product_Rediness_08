/**
 * IfcProjectedCRSRecord — in-memory representation of an IFC IfcProjectedCRS
 * entity, parsed on IFC import and serialised on IFC4X3 export.
 *
 * CONTRACT (C12 §1.4):
 *   - Read on IFC import: `IfcProjectedCRS` MUST be stored in runtime.geospatial.
 *   - Written on IFC4X3 export with MapProjection, MapZone, Name, GeodeticDatum.
 *
 * Wave A17-T5 (2026-05-03).
 */

export interface IfcProjectedCRSRecord {
  /** E.g. 'EPSG:27700' */
  name: string;
  /** E.g. 'British National Grid' */
  description?: string;
  /** E.g. 'OSGB 1936' */
  geodeticDatum?: string;
  /** E.g. 'Transverse Mercator' */
  mapProjection?: string;
  /** E.g. '30N' */
  mapZone?: string;
  /** Proj4 string for use with GeospatialAdapter. */
  proj4String?: string;
  /** Easting offset from IFC IfcMapConversion.Eastings. */
  eastings?: number;
  /** Northing offset from IFC IfcMapConversion.Northings. */
  northings?: number;
  /** Orthogonal height from IFC IfcMapConversion.OrthogonalHeight. */
  orthogonalHeight?: number;
  /** WGS84 latitude of the map conversion origin. */
  xAxisAbscissa?: number;
  /** WGS84 longitude of the map conversion origin. */
  xAxisOrdinate?: number;
  /** Scale factor from IFC IfcMapConversion.Scale. */
  scale?: number;
}
