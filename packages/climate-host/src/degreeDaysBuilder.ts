// A.10.b (Phase A · Sprint 2) — Degree-days builder.
//
// Heating + cooling degree-days at two standard bases:
//   - 18 °C  (UK / ISO convention)
//   - 65 °F  (US convention, ≈ 18.333 °C)
//
// Computed per HOUR from the EPW hourly dry-bulb, summed over the
// year, then divided by 24 to express as DAYS.

import type { EPWRecord, DegreeDayAggregates } from '@pryzm/schemas';

const BASE_18C = 18;
const BASE_65F_AS_C = (65 - 32) * (5 / 9);  // ≈ 18.333

export function buildDegreeDays(
    records: readonly EPWRecord[],
): DegreeDayAggregates {
    let hdd18 = 0;
    let cdd18 = 0;
    let hdd65 = 0;
    let cdd65 = 0;

    for (const r of records) {
        const T = r.dryBulbC;
        const d18 = BASE_18C - T;
        if (d18 > 0) hdd18 += d18 / 24;
        else cdd18 += -d18 / 24;
        const d65 = BASE_65F_AS_C - T;
        if (d65 > 0) hdd65 += d65 / 24;
        else cdd65 += -d65 / 24;
    }

    return {
        hddBase18: hdd18,
        cddBase18: cdd18,
        hddBase65F: hdd65,
        cddBase65F: cdd65,
    };
}
