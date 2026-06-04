// A.10.c (Phase A · Sprint 2) — Bundled climate normals (offline default).
//
// Pure, ZERO-I/O monthly-normals generator. Given a site (lat, lon) it
// produces the 12 `NOAANormal` entries a ClimateDataset needs — WITHOUT a
// network call — by picking the nearest of a handful of bundled
// climate-zone templates and phasing the seasonal curve to the site's
// hemisphere.
//
// This is the OFFLINE DEFAULT per [C21 §1.2]: when no EPW is uploaded and
// the optional live NOAA fetch (`noaaNormalsReader.ts`) is unavailable
// (no key, offline, rate-limited, headless tests), the climate substrate
// still resolves to a REAL, plausible dataset rather than "no data".
//
// The templates are coarse mid-decade annual means for a small set of
// Köppen-ish latitude/zone archetypes — accurate enough for the FORMA.5
// climate card, sun-path, and concept-design site intelligence; NOT a
// substitute for measured EPW for energy simulation (workflows that need
// that refuse to run against the `fallback-defaults` tier per [C21 §1.2]).
//
// References:
//   - docs/02-decisions/contracts/C21-CLIMATE-INGESTION.md §1.2 + §2.3
//   - docs/03-execution/plans/master-execution-tracker.md A.10.c

import type { NOAANormal } from '@pryzm/schemas';

/** A coarse annual-cycle archetype for one climate zone. */
interface ClimateZoneTemplate {
    readonly id: string;
    /** Human label for provenance / UI. */
    readonly label: string;
    /** Centre latitude this template was authored for (deg, signed). */
    readonly refLatAbs: number;
    /** Coldest-month mean dry-bulb (°C). */
    readonly coldMeanC: number;
    /** Warmest-month mean dry-bulb (°C). */
    readonly warmMeanC: number;
    /** Mean daily swing min↔max around the monthly mean (°C, ± half). */
    readonly diurnalC: number;
    /** Mean relative humidity (%). */
    readonly rhPct: number;
    /** Mean annual wind speed (m/s). */
    readonly windMps: number;
    /** Prevailing wind direction (deg, 0 = N clockwise). */
    readonly windDirDeg: number;
    /** Peak-month mean global horizontal irradiance (W/m²). */
    readonly peakGhiWm2: number;
    /** Mean monthly precipitation (mm). */
    readonly precipMm: number;
}

/**
 * Bundled archetypes ordered by |latitude|. `nearestZoneTemplate` picks
 * the closest by absolute latitude (a deliberately simple, deterministic
 * rule — climate zonation is dominated by latitude band at this fidelity).
 */
const ZONE_TEMPLATES: readonly ClimateZoneTemplate[] = [
    {
        id: 'tropical',
        label: 'Tropical (equatorial)',
        refLatAbs: 5,
        coldMeanC: 26,
        warmMeanC: 28,
        diurnalC: 8,
        rhPct: 80,
        windMps: 3.0,
        windDirDeg: 90,
        peakGhiWm2: 320,
        precipMm: 180,
    },
    {
        id: 'subtropical',
        label: 'Subtropical / warm temperate',
        refLatAbs: 28,
        coldMeanC: 12,
        warmMeanC: 29,
        diurnalC: 10,
        rhPct: 62,
        windMps: 3.4,
        windDirDeg: 135,
        peakGhiWm2: 300,
        precipMm: 70,
    },
    {
        id: 'temperate',
        label: 'Temperate maritime',
        refLatAbs: 45,
        coldMeanC: 4,
        warmMeanC: 19,
        diurnalC: 8,
        rhPct: 75,
        windMps: 4.2,
        windDirDeg: 225,
        peakGhiWm2: 250,
        precipMm: 60,
    },
    {
        id: 'continental',
        label: 'Cool continental',
        refLatAbs: 55,
        coldMeanC: -6,
        warmMeanC: 18,
        diurnalC: 11,
        rhPct: 70,
        windMps: 4.0,
        windDirDeg: 270,
        peakGhiWm2: 230,
        precipMm: 50,
    },
    {
        id: 'boreal',
        label: 'Boreal / subarctic',
        refLatAbs: 65,
        coldMeanC: -16,
        warmMeanC: 14,
        diurnalC: 10,
        rhPct: 72,
        windMps: 3.6,
        windDirDeg: 315,
        peakGhiWm2: 190,
        precipMm: 40,
    },
    {
        id: 'polar',
        label: 'Polar',
        refLatAbs: 78,
        coldMeanC: -28,
        warmMeanC: 3,
        diurnalC: 6,
        rhPct: 80,
        windMps: 4.5,
        windDirDeg: 0,
        peakGhiWm2: 120,
        precipMm: 20,
    },
] as const;

/** The dataset version stamped on bundled normals (for cache keying +
 *  provenance). Bump when the templates change. */
export const BUNDLED_NORMALS_VERSION = 'pryzm-bundled-normals-1.0';

/** Descriptor for a produced bundled-normals result. */
export interface BundledNormalsResult {
    readonly monthlyNormals: readonly NOAANormal[];
    /** The zone template chosen. */
    readonly zoneId: string;
    readonly zoneLabel: string;
    /** Always `pryzm-bundled-normals-<v>`. */
    readonly datasetVersion: string;
}

/** Pick the bundled zone template whose |refLat| is closest to |lat|. */
export function nearestZoneTemplate(latDeg: number): ClimateZoneTemplate {
    const absLat = Math.abs(latDeg);
    let best = ZONE_TEMPLATES[0]!;
    let bestDelta = Math.abs(best.refLatAbs - absLat);
    for (const z of ZONE_TEMPLATES) {
        const delta = Math.abs(z.refLatAbs - absLat);
        if (delta < bestDelta) {
            best = z;
            bestDelta = delta;
        }
    }
    return best;
}

/**
 * Produce 12 monthly `NOAANormal` entries for the given site coordinates
 * from the bundled templates. PURE + deterministic — same inputs always
 * yield the same output. Southern-hemisphere sites have the seasonal
 * curve flipped (warmest month = January, not July).
 *
 * The annual temperature cycle is a cosine between the template's cold-
 * and warm-month means; degree-days base 18 °C are derived from the
 * monthly mean (× ~30.4 days), and the wind/irradiance/precip fields are
 * scaled off the template with a mild seasonal modulation.
 */
export function bundledMonthlyNormals(
    latDeg: number,
    _lonDeg: number,
): BundledNormalsResult {
    const zone = nearestZoneTemplate(latDeg);
    const southern = latDeg < 0;
    const mean = (zone.coldMeanC + zone.warmMeanC) / 2;
    const amp = (zone.warmMeanC - zone.coldMeanC) / 2;

    const monthlyNormals: NOAANormal[] = [];
    for (let m = 1; m <= 12; m += 1) {
        // Phase so July (m=7) is the warmest in the N hemisphere; flip for S.
        const monthAngle = ((m - 7) / 12) * 2 * Math.PI;
        const seasonal = Math.cos(monthAngle) * (southern ? -1 : 1);
        const avgC = round1(mean + amp * seasonal);
        const avgMinC = round1(avgC - zone.diurnalC / 2);
        const avgMaxC = round1(avgC + zone.diurnalC / 2);

        // Irradiance + precipitation track the warm season; wind is mildly
        // higher in the cold season.
        const warmFactor = (seasonal + 1) / 2;           // 0 (cold) .. 1 (warm)
        const ghi = round1(
            zone.peakGhiWm2 * (0.35 + 0.65 * warmFactor),
        );
        const precip = round1(
            zone.precipMm * (0.7 + 0.6 * warmFactor),
        );
        const wind = round1(zone.windMps * (1.15 - 0.3 * warmFactor));

        // Degree-days base 18 °C from the monthly mean × days-in-month.
        const daysInMonth = 30.4;
        const delta18 = 18 - avgC;
        const hdd = delta18 > 0 ? round1(delta18 * daysInMonth) : 0;
        const cdd = delta18 < 0 ? round1(-delta18 * daysInMonth) : 0;

        monthlyNormals.push({
            month: m as NOAANormal['month'],
            avgDryBulbC: avgC,
            avgMinDryBulbC: avgMinC,
            avgMaxDryBulbC: avgMaxC,
            avgRelHumidityPct: zone.rhPct,
            avgPrecipMm: precip,
            avgWindSpeedMps: wind,
            prevailingWindDirDeg: zone.windDirDeg,
            avgGlobalHorizontalWm2: ghi,
            heatingDegreeDaysBase18: hdd,
            coolingDegreeDaysBase18: cdd,
        });
    }

    return {
        monthlyNormals,
        zoneId: zone.id,
        zoneLabel: zone.label,
        datasetVersion: BUNDLED_NORMALS_VERSION,
    };
}

function round1(x: number): number {
    return Math.round(x * 10) / 10;
}
