// A.10.b (Phase A · Sprint 2) — Wind-rose builder.
//
// Aggregates an 8760-hour EPWRecord[] (or any sample stream) into a
// 16-sector × 6-bin WindRoseAggregate per C21 §2.5. Pure: no I/O.

import type {
    EPWRecord,
    WindRoseAggregate,
    WindRoseSector,
} from '@pryzm/schemas';
import { WIND_ROSE_SECTOR_COUNT } from '@pryzm/schemas';

/** Beaufort-ish speed bin thresholds (m/s upper bounds, last = +Infinity). */
const SPEED_BIN_UPPER_MPS = [1.5, 3.3, 5.4, 7.9, 10.7, Number.POSITIVE_INFINITY];

/**
 * Build a 16-sector × 6-bin wind rose from hourly records. Each
 * sector receives 1 hour-credit per record that falls into it; the
 * speed bin is one of 6 Beaufort-ish bins.
 *
 * `meanSpeedMps` is the arithmetic mean across all records;
 * `p99SpeedMps` is the 99th-percentile gust (rank-based, no
 * interpolation).
 */
export function buildWindRose(
    records: readonly EPWRecord[],
): WindRoseAggregate {
    const sectors: number[][] = Array.from(
        { length: WIND_ROSE_SECTOR_COUNT },
        () => [0, 0, 0, 0, 0, 0],
    );
    const speeds: number[] = [];
    let sumSpeed = 0;

    for (const r of records) {
        const sectorIdx = windDirToSectorIndex(r.windDirDeg);
        const binIdx = speedToBinIndex(r.windSpeedMps);
        sectors[sectorIdx]![binIdx]! += 1;
        sumSpeed += r.windSpeedMps;
        speeds.push(r.windSpeedMps);
    }

    const n = records.length;
    const meanSpeedMps = n === 0 ? 0 : sumSpeed / n;
    const p99SpeedMps = percentile(speeds, 99);

    const sectorRecords: WindRoseSector[] = sectors.map((bins, i) => ({
        sectorDeg: i * 22.5,
        speedBinHours: [
            bins[0]!,
            bins[1]!,
            bins[2]!,
            bins[3]!,
            bins[4]!,
            bins[5]!,
        ] as const as [number, number, number, number, number, number],
    }));

    return {
        sectors: sectorRecords,
        meanSpeedMps,
        p99SpeedMps,
    };
}

function windDirToSectorIndex(deg: number): number {
    const shifted = (deg + 11.25) % 360;
    return Math.floor(shifted / 22.5) % 16;
}

function speedToBinIndex(speedMps: number): number {
    for (let i = 0; i < SPEED_BIN_UPPER_MPS.length; i++) {
        if (speedMps < SPEED_BIN_UPPER_MPS[i]!) return i;
    }
    return SPEED_BIN_UPPER_MPS.length - 1;
}

function percentile(values: readonly number[], p: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = Math.min(
        sorted.length - 1,
        Math.max(0, Math.floor((p / 100) * sorted.length)),
    );
    return sorted[idx]!;
}
