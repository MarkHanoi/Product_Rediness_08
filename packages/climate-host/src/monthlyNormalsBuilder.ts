// A.10.b (Phase A · Sprint 2) — Monthly-normals builder.
//
// Aggregates an 8760-hour EPWRecord[] into the 12 NOAANormal entries
// PRYZM ships on every ClimateDataset (per C21 §2.3). Pure: no I/O.

import type { EPWRecord, NOAANormal } from '@pryzm/schemas';

/**
 * Aggregate hourly EPW records into 12 monthly normals. The returned
 * array MUST have exactly 12 entries (Jan..Dec), even if some months
 * are sparse — empty months get zero-valued normals + the prevailing
 * wind direction defaults to 0 (N) so the schema validator passes.
 *
 * Algorithm:
 *   - Bucket records by month (1..12) from the UTC ISO timestamp.
 *   - For each bucket, compute mean dryBulb / dewPoint / RH / wind /
 *     irradiance + min/max dryBulb + total precip + degree-days base 18.
 *   - Prevailing wind direction: the 22.5° sector with the highest
 *     hour count.
 */
export function buildMonthlyNormals(
    records: readonly EPWRecord[],
): readonly NOAANormal[] {
    type Bucket = {
        sumDryBulbC: number;
        minDryBulbC: number;
        maxDryBulbC: number;
        sumRelHumidityPct: number;
        sumPrecipMm: number;
        sumWindSpeedMps: number;
        sumGlobalHorizontalWm2: number;
        hddSum: number;
        cddSum: number;
        sectorHours: number[]; // 16 sectors, hours-per-sector for prevailing dir
        count: number;
    };

    const buckets: Bucket[] = Array.from({ length: 12 }, () => ({
        sumDryBulbC: 0,
        minDryBulbC: Number.POSITIVE_INFINITY,
        maxDryBulbC: Number.NEGATIVE_INFINITY,
        sumRelHumidityPct: 0,
        sumPrecipMm: 0,
        sumWindSpeedMps: 0,
        sumGlobalHorizontalWm2: 0,
        hddSum: 0,
        cddSum: 0,
        sectorHours: Array(16).fill(0),
        count: 0,
    }));

    for (const r of records) {
        const month = monthFromIso(r.utcIso);
        if (month < 1 || month > 12) continue;
        const b = buckets[month - 1]!;
        b.sumDryBulbC += r.dryBulbC;
        if (r.dryBulbC < b.minDryBulbC) b.minDryBulbC = r.dryBulbC;
        if (r.dryBulbC > b.maxDryBulbC) b.maxDryBulbC = r.dryBulbC;
        b.sumRelHumidityPct += r.relHumidityPct;
        b.sumPrecipMm += r.precipMm;
        b.sumWindSpeedMps += r.windSpeedMps;
        b.sumGlobalHorizontalWm2 += r.globalHorizontalWm2;
        // Degree-days base 18°C — accumulate per HOUR then divide by 24.
        const delta18 = 18 - r.dryBulbC;
        if (delta18 > 0) b.hddSum += delta18 / 24;
        else b.cddSum += -delta18 / 24;
        // Prevailing wind direction — bin into 16 sectors.
        const sectorIdx = windDirToSectorIndex(r.windDirDeg);
        b.sectorHours[sectorIdx]! += 1;
        b.count += 1;
    }

    return buckets.map((b, idx) => {
        const month = (idx + 1) as NOAANormal['month'];
        if (b.count === 0) {
            return {
                month,
                avgDryBulbC: 0,
                avgMinDryBulbC: 0,
                avgMaxDryBulbC: 0,
                avgRelHumidityPct: 0,
                avgPrecipMm: 0,
                avgWindSpeedMps: 0,
                prevailingWindDirDeg: 0,
                avgGlobalHorizontalWm2: 0,
                heatingDegreeDaysBase18: 0,
                coolingDegreeDaysBase18: 0,
            };
        }
        const prevailingIdx = argmax(b.sectorHours);
        return {
            month,
            avgDryBulbC: b.sumDryBulbC / b.count,
            avgMinDryBulbC: b.minDryBulbC,
            avgMaxDryBulbC: b.maxDryBulbC,
            avgRelHumidityPct: b.sumRelHumidityPct / b.count,
            avgPrecipMm: b.sumPrecipMm,                              // monthly total
            avgWindSpeedMps: b.sumWindSpeedMps / b.count,
            prevailingWindDirDeg: prevailingIdx * 22.5,
            avgGlobalHorizontalWm2: b.sumGlobalHorizontalWm2 / b.count,
            heatingDegreeDaysBase18: b.hddSum,
            coolingDegreeDaysBase18: b.cddSum,
        };
    });
}

function monthFromIso(utcIso: string): number {
    // YYYY-MM-DDThh:mm:ss.sssZ — month at substring [5,7].
    return Number(utcIso.slice(5, 7));
}

function windDirToSectorIndex(deg: number): number {
    // 16 sectors of 22.5°, sector 0 centred at N. Each sector spans
    // [centre - 11.25, centre + 11.25). Wrap [348.75, 360] to sector 0.
    const shifted = (deg + 11.25) % 360;
    return Math.floor(shifted / 22.5) % 16;
}

function argmax(arr: readonly number[]): number {
    let best = 0;
    let bestVal = arr[0] ?? Number.NEGATIVE_INFINITY;
    for (let i = 1; i < arr.length; i++) {
        const v = arr[i]!;
        if (v > bestVal) {
            best = i;
            bestVal = v;
        }
    }
    return best;
}
