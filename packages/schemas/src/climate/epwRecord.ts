// A.10.a (Phase A · Sprint 2) — EPWRecord schema (C21 §2.2).
//
// One per hour-of-year, 8760 records per EPW dataset (or 8784 for leap
// years — the EPW TMY3 standard fixes 8760). Field names follow the
// C21 §1.8 unit convention (every numeric field carries its SI unit
// in the suffix: …C, …Pa, …Wm2, …Mps, …Deg, …Mm, …Km, …Pct, …Tenths).
//
// L0-pure: Zod-only. The EPW PARSER lives in `packages/climate-host/`
// (L2 — A.10.b); this schema is just the validated shape.

import { z } from 'zod';

/**
 * Per [C21 §2.2] fields. All numeric values are SI per §1.8; EPW source
 * files MAY use other units (rare — EPW is SI by default) but the
 * reader MUST convert at ingestion and persist only SI.
 *
 * Field-by-field unit convention:
 *   - dryBulbC / dewPointC                °C
 *   - relHumidityPct                       % (0–100)
 *   - stationPressurePa                    Pa
 *   - directNormalWm2 / diffuseHorizontalWm2 / globalHorizontalWm2  W/m²
 *   - windSpeedMps                          m/s
 *   - windDirDeg                            degrees, 0=N, 90=E, clockwise
 *   - totalCloudTenths / opaqueCloudTenths  tenths (0–10)
 *   - visibilityKm                          km
 *   - precipMm                              mm (hour total)
 */
export const EPWRecordSchema = z.object({
    /** ISO 8601 UTC timestamp at the START of the hour. */
    utcIso: z.string().datetime(),
    /** Original EPW file hour-of-year index (1..8760). Useful for trace + debug. */
    localHourOfYear: z.number().int().min(1).max(8784),
    /** Dry-bulb air temperature (°C). Reasonable design range. */
    dryBulbC: z.number().min(-90).max(70),
    /** Dew-point temperature (°C). Always ≤ dryBulbC physically; the schema
     *  does not cross-check (a Zod refine would couple fields). */
    dewPointC: z.number().min(-100).max(70),
    /** Relative humidity (%). EPW caps at 100; some sensors over-report
     *  101–110 — we accept up to 110 as a soft tolerance, refuse >110. */
    relHumidityPct: z.number().min(0).max(110),
    /** Station pressure (Pa). Surface pressure typically 70 000 – 110 000 Pa. */
    stationPressurePa: z.number().min(40000).max(120000),
    /** Beam (direct) normal solar radiation (W/m²). 0 at night. */
    directNormalWm2: z.number().min(0).max(1500),
    /** Diffuse horizontal radiation (W/m²). */
    diffuseHorizontalWm2: z.number().min(0).max(1200),
    /** Global horizontal radiation (W/m²). */
    globalHorizontalWm2: z.number().min(0).max(1500),
    /** Wind speed (m/s). Hurricane-force gusts ≤ 90 m/s. */
    windSpeedMps: z.number().min(0).max(90),
    /** Wind direction (degrees from N, clockwise). Calm = 0 by EPW convention. */
    windDirDeg: z.number().min(0).max(360),
    /** Total cloud cover (tenths, 0–10). */
    totalCloudTenths: z.number().min(0).max(10),
    /** Opaque cloud cover (tenths, 0–10). Always ≤ totalCloudTenths physically. */
    opaqueCloudTenths: z.number().min(0).max(10),
    /** Visibility (km). EPW caps at 9 999. */
    visibilityKm: z.number().min(0).max(9999),
    /** Precipitation (mm) — total for the hour. */
    precipMm: z.number().min(0).max(2000),
});
export type EPWRecord = z.infer<typeof EPWRecordSchema>;
