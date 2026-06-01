// A.10.b (Phase A · Sprint 2) — Design temperatures builder.
//
// Per ASHRAE Handbook of Fundamentals (Chapter 14):
//   - heating99_6C   = 0.4 % percentile of dry-bulb (the coldest 0.4 %
//                      of hours — equivalently, the 99.6 % design point)
//   - cooling0_4C    = 99.6 % percentile of dry-bulb (the hottest 0.4 %)
//   - cooling0_4MwbC = mean wet-bulb at the cooling-0.4% hours
//
// Wet-bulb is approximated via the standard psychrometric formula
// using dryBulb + RH (Stull 2011) — accurate enough for design-point
// reporting; the precise ASHRAE iterative method is overkill here.

import type { EPWRecord, DesignTemperatures } from '@pryzm/schemas';

/**
 * Compute ASHRAE design temperatures from hourly records.
 *
 * Returns zeros for an empty input (schema accepts; downstream code
 * should refuse to dispatch energy workflows against an empty climate
 * per [C21 §1.2 fallback-defaults] semantics).
 */
export function buildDesignTemperatures(
    records: readonly EPWRecord[],
): DesignTemperatures {
    if (records.length === 0) {
        return {
            heating99_6C: 0,
            cooling0_4C: 0,
            cooling0_4MwbC: 0,
        };
    }

    const temps = records.map((r) => r.dryBulbC);
    const sorted = [...temps].sort((a, b) => a - b);
    const n = sorted.length;
    // The cold 0.4% — index ~0.4% from the bottom.
    const heating99_6C = sorted[Math.floor(0.004 * n)]!;
    // The hot 0.4% — index ~99.6% from the bottom.
    const cooling0_4C = sorted[Math.min(n - 1, Math.floor(0.996 * n))]!;

    // Identify the records in the top 0.4% by dry-bulb; their mean wet-bulb
    // is the coincident wet-bulb at the cooling design point.
    const cutoff = cooling0_4C;
    let wbSum = 0;
    let wbCount = 0;
    for (const r of records) {
        if (r.dryBulbC >= cutoff) {
            wbSum += approximateWetBulbC(r.dryBulbC, r.relHumidityPct);
            wbCount += 1;
        }
    }
    const cooling0_4MwbC = wbCount > 0 ? wbSum / wbCount : cooling0_4C;

    return {
        heating99_6C,
        cooling0_4C,
        cooling0_4MwbC,
    };
}

/**
 * Stull (2011) wet-bulb temperature approximation, valid for
 * RH 5..99 % and Tdb −20..+50 °C. Accurate to within 0.3 °C across
 * that range — sufficient for the cooling-design-point coincident WB.
 */
function approximateWetBulbC(dryBulbC: number, relHumidityPct: number): number {
    const T = dryBulbC;
    const RH = Math.max(5, Math.min(99, relHumidityPct));
    return (
        T * Math.atan(0.151977 * Math.sqrt(RH + 8.313659)) +
        Math.atan(T + RH) -
        Math.atan(RH - 1.676331) +
        0.00391838 * Math.pow(RH, 1.5) * Math.atan(0.023101 * RH) -
        4.686035
    );
}
