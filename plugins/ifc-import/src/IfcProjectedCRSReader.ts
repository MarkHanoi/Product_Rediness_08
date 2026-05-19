/**
 * IfcProjectedCRSReader — reads `IfcProjectedCRS` + `IfcMapConversion` from a
 * parsed IFC model and returns a structured record for storage in
 * `runtime.geospatial`.
 *
 * CONTRACT (C12 §1.4):
 *   On IFC import, `IfcProjectedCRS` MUST be read and stored so that:
 *     (a) the GeospatialAdapter can initialise with the correct CRS, and
 *     (b) IFC4X3 re-export can round-trip the CRS metadata faithfully.
 *
 * Uses a broad `unknown` API type and runtime duck-typing so the reader
 * is compatible with any web-ifc version without tight type coupling.
 *
 * Wave A17-T5 (2026-05-03).
 */
import type { IfcProjectedCRSRecord } from '@pryzm/geospatial';

/** web-ifc type code for IfcProjectedCRS (IFC4 + IFC4X3). */
const IFCPROJECTEDCRS = 3843373140;
/** web-ifc type code for IfcMapConversion (IFC4 + IFC4X3). */
const IFCMAPCONVERSION = 3654150110;

/**
 * Minimal structural interface for any web-ifc IfcAPI build that exposes
 * the two methods this reader needs.  Declared here (not imported from
 * tier2-proxy) so we can extend it with `GetLineIDsWithType` which the
 * narrower `IfcApiLike` in tier2-proxy omits.
 */
interface IfcCRSApiLike {
  GetLineIDsWithType(modelId: number, type: number): { size(): number; get(i: number): number };
  GetLine(modelId: number, lineId: number, flatten?: boolean): Record<string, unknown>;
}

/**
 * Scan `modelId` for an `IfcProjectedCRS` entity and optionally a paired
 * `IfcMapConversion`. Returns `null` when neither is present (e.g. the file
 * has no geospatial metadata) or when the api does not support
 * `GetLineIDsWithType` (older web-ifc builds).
 */
export function readIfcProjectedCRS(
  api: unknown,
  modelId: number,
): IfcProjectedCRSRecord | null {
  // Duck-type the API — older web-ifc builds or mocks may not expose this method
  const crsApi = api as Partial<IfcCRSApiLike>;
  if (typeof crsApi.GetLineIDsWithType !== 'function') return null;
  if (typeof crsApi.GetLine !== 'function') return null;

  try {
    const crsIds = crsApi.GetLineIDsWithType(modelId, IFCPROJECTEDCRS);
    if (crsIds.size() === 0) return null;

    const crsLine = crsApi.GetLine(modelId, crsIds.get(0));
    if (!crsLine) return null;

    const record: IfcProjectedCRSRecord = {
      name: _str(crsLine['Name']),
    };

    if (_str(crsLine['Description'])) record.description = _str(crsLine['Description']);
    if (_str(crsLine['GeodeticDatum'])) record.geodeticDatum = _str(crsLine['GeodeticDatum']);
    if (_str(crsLine['MapProjection'])) record.mapProjection = _str(crsLine['MapProjection']);
    if (_str(crsLine['MapZone'])) record.mapZone = _str(crsLine['MapZone']);

    // Attempt to parse IfcMapConversion for origin offset
    try {
      const convIds = crsApi.GetLineIDsWithType(modelId, IFCMAPCONVERSION);
      if (convIds.size() > 0) {
        const conv = crsApi.GetLine(modelId, convIds.get(0));
        if (conv) {
          const e = _num(conv['Eastings']); if (e != null) record.eastings = e;
          const n = _num(conv['Northings']); if (n != null) record.northings = n;
          const h = _num(conv['OrthogonalHeight']); if (h != null) record.orthogonalHeight = h;
          const xa = _num(conv['XAxisAbscissa']); if (xa != null) record.xAxisAbscissa = xa;
          const xo = _num(conv['XAxisOrdinate']); if (xo != null) record.xAxisOrdinate = xo;
          const sc = _num(conv['Scale']); if (sc != null) record.scale = sc;
        }
      }
    } catch {
      // IfcMapConversion is optional — ignore read errors
    }

    return record;
  } catch {
    // If IfcProjectedCRS reading fails, return null (graceful degradation)
    return null;
  }
}

/** Safely extract a string value from a web-ifc attribute object or string. */
function _str(attr: unknown): string {
  if (typeof attr === 'string') return attr;
  if (attr && typeof attr === 'object' && 'value' in attr) {
    const v = (attr as { value: unknown }).value;
    return typeof v === 'string' ? v : String(v ?? '');
  }
  return '';
}

/** Safely extract a numeric value from a web-ifc attribute object or number. */
function _num(attr: unknown): number | null {
  if (typeof attr === 'number') return attr;
  if (attr && typeof attr === 'object' && 'value' in attr) {
    const v = (attr as { value: unknown }).value;
    if (typeof v === 'number') return v;
    const n = Number(v);
    return isNaN(n) ? null : n;
  }
  return null;
}
