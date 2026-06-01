// A.10.b (Phase A · Sprint 2) — Builder tests.

import { describe, expect, it } from 'vitest';
import type { EPWRecord } from '@pryzm/schemas';
import { buildMonthlyNormals } from '../src/monthlyNormalsBuilder.js';
import { buildWindRose } from '../src/windRoseBuilder.js';
import { buildDesignTemperatures } from '../src/designTempsBuilder.js';
import { buildDegreeDays } from '../src/degreeDaysBuilder.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — synthesize records
// ─────────────────────────────────────────────────────────────────────────────

function makeRecord(over: Partial<EPWRecord> = {}): EPWRecord {
    return {
        utcIso: '2024-06-15T12:00:00.000Z',
        localHourOfYear: 1,
        dryBulbC: 20,
        dewPointC: 10,
        relHumidityPct: 60,
        stationPressurePa: 101325,
        directNormalWm2: 500,
        diffuseHorizontalWm2: 100,
        globalHorizontalWm2: 600,
        windSpeedMps: 4,
        windDirDeg: 180,
        totalCloudTenths: 3,
        opaqueCloudTenths: 2,
        visibilityKm: 30,
        precipMm: 0,
        ...over,
    };
}

/** Build a year of records with constant values per month. */
function buildYearByMonth(
    perMonth: Record<number, Partial<EPWRecord>>,
): EPWRecord[] {
    const out: EPWRecord[] = [];
    for (let m = 1; m <= 12; m++) {
        const over = perMonth[m] ?? {};
        for (let d = 1; d <= 28; d++) {           // 28 days × 24 h = 672 hr/month
            for (let h = 0; h < 24; h++) {
                const iso =
                    `2024-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:00:00.000Z`;
                out.push(makeRecord({ utcIso: iso, ...over }));
            }
        }
    }
    return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// buildMonthlyNormals
// ─────────────────────────────────────────────────────────────────────────────

describe('buildMonthlyNormals', () => {
    it('returns 12 entries Jan..Dec', () => {
        const normals = buildMonthlyNormals(buildYearByMonth({}));
        expect(normals).toHaveLength(12);
        expect(normals[0]?.month).toBe(1);
        expect(normals[11]?.month).toBe(12);
    });

    it('handles empty input — all 12 months are zero-valued', () => {
        const normals = buildMonthlyNormals([]);
        expect(normals).toHaveLength(12);
        expect(normals.every((n) => n.avgDryBulbC === 0)).toBe(true);
    });

    it('avgDryBulbC equals the constant dry-bulb temperature', () => {
        const recs = buildYearByMonth({
            1: { dryBulbC: 5 },
            7: { dryBulbC: 25 },
        });
        const normals = buildMonthlyNormals(recs);
        expect(normals[0]?.avgDryBulbC).toBeCloseTo(5);
        expect(normals[6]?.avgDryBulbC).toBeCloseTo(25);
    });

    it('avgMinDryBulbC + avgMaxDryBulbC reflect month extremes', () => {
        const recs: EPWRecord[] = [
            makeRecord({ utcIso: '2024-02-01T00:00:00.000Z', dryBulbC: 0 }),
            makeRecord({ utcIso: '2024-02-01T12:00:00.000Z', dryBulbC: 10 }),
            makeRecord({ utcIso: '2024-02-15T18:00:00.000Z', dryBulbC: -5 }),
        ];
        const normals = buildMonthlyNormals(recs);
        expect(normals[1]?.avgMinDryBulbC).toBe(-5);
        expect(normals[1]?.avgMaxDryBulbC).toBe(10);
    });

    it('avgPrecipMm is the MONTHLY TOTAL (per C21 §2.3 notes)', () => {
        const recs: EPWRecord[] = [
            makeRecord({ utcIso: '2024-03-01T00:00:00.000Z', precipMm: 1 }),
            makeRecord({ utcIso: '2024-03-01T01:00:00.000Z', precipMm: 2 }),
            makeRecord({ utcIso: '2024-03-15T12:00:00.000Z', precipMm: 7 }),
        ];
        const normals = buildMonthlyNormals(recs);
        expect(normals[2]?.avgPrecipMm).toBe(10);
    });

    it('prevailingWindDirDeg is the most-frequent 22.5° sector', () => {
        const recs: EPWRecord[] = [
            ...Array.from({ length: 100 }, () =>
                makeRecord({
                    utcIso: '2024-04-01T00:00:00.000Z',
                    windDirDeg: 90,        // E sector
                }),
            ),
            ...Array.from({ length: 5 }, () =>
                makeRecord({
                    utcIso: '2024-04-01T00:00:00.000Z',
                    windDirDeg: 270,       // W sector — minority
                }),
            ),
        ];
        const normals = buildMonthlyNormals(recs);
        expect(normals[3]?.prevailingWindDirDeg).toBe(90);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildWindRose
// ─────────────────────────────────────────────────────────────────────────────

describe('buildWindRose', () => {
    it('returns 16 sectors and Beaufort-ish bins', () => {
        const rose = buildWindRose([]);
        expect(rose.sectors).toHaveLength(16);
        for (const s of rose.sectors) {
            expect(s.speedBinHours).toHaveLength(6);
        }
    });

    it('bins by direction sector + speed', () => {
        const recs: EPWRecord[] = [
            // All due N (sector 0), 1 m/s → bin 0 (calm)
            ...Array.from({ length: 10 }, () =>
                makeRecord({ windDirDeg: 0, windSpeedMps: 1 }),
            ),
            // All due N, 4 m/s → bin 2 (3.3-5.4)
            ...Array.from({ length: 5 }, () =>
                makeRecord({ windDirDeg: 0, windSpeedMps: 4 }),
            ),
            // Due E (sector 4), 12 m/s → bin 5 (>10.7)
            ...Array.from({ length: 3 }, () =>
                makeRecord({ windDirDeg: 90, windSpeedMps: 12 }),
            ),
        ];
        const rose = buildWindRose(recs);
        // Sector 0 = N
        expect(rose.sectors[0]?.speedBinHours[0]).toBe(10);
        expect(rose.sectors[0]?.speedBinHours[2]).toBe(5);
        // Sector 4 = 90° = E
        expect(rose.sectors[4]?.speedBinHours[5]).toBe(3);
    });

    it('meanSpeedMps is the arithmetic mean', () => {
        const recs: EPWRecord[] = [
            makeRecord({ windSpeedMps: 2 }),
            makeRecord({ windSpeedMps: 4 }),
            makeRecord({ windSpeedMps: 6 }),
        ];
        const rose = buildWindRose(recs);
        expect(rose.meanSpeedMps).toBeCloseTo(4);
    });

    it('p99SpeedMps is the 99th-percentile gust', () => {
        const recs: EPWRecord[] = [];
        for (let i = 0; i < 100; i++) {
            recs.push(makeRecord({ windSpeedMps: i / 10 }));    // 0.0 .. 9.9
        }
        const rose = buildWindRose(recs);
        // 99th percentile of 0..9.9 = 9.9
        expect(rose.p99SpeedMps).toBeCloseTo(9.9);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildDesignTemperatures
// ─────────────────────────────────────────────────────────────────────────────

describe('buildDesignTemperatures', () => {
    it('returns zeros for empty input', () => {
        const dt = buildDesignTemperatures([]);
        expect(dt.heating99_6C).toBe(0);
        expect(dt.cooling0_4C).toBe(0);
        expect(dt.cooling0_4MwbC).toBe(0);
    });

    it('heating99_6C is the cold-percentile temperature', () => {
        const recs: EPWRecord[] = [];
        for (let i = 0; i < 1000; i++) {
            recs.push(makeRecord({ dryBulbC: i / 10 - 5 }));   // -5..95
        }
        const dt = buildDesignTemperatures(recs);
        // 0.4 % of the bottom of [-5..95] ≈ -5 + 0.4 = -4.6
        expect(dt.heating99_6C).toBeLessThan(0);
        // 0.4 % from the top
        expect(dt.cooling0_4C).toBeGreaterThan(90);
    });

    it('cooling0_4MwbC ≤ cooling0_4C (wet-bulb cannot exceed dry-bulb)', () => {
        const recs: EPWRecord[] = [];
        for (let i = 0; i < 100; i++) {
            recs.push(makeRecord({
                dryBulbC: 25 + i / 10,
                relHumidityPct: 60,
            }));
        }
        const dt = buildDesignTemperatures(recs);
        expect(dt.cooling0_4MwbC).toBeLessThan(dt.cooling0_4C);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildDegreeDays
// ─────────────────────────────────────────────────────────────────────────────

describe('buildDegreeDays', () => {
    it('returns zeros for empty input', () => {
        const dd = buildDegreeDays([]);
        expect(dd.hddBase18).toBe(0);
        expect(dd.cddBase18).toBe(0);
        expect(dd.hddBase65F).toBe(0);
        expect(dd.cddBase65F).toBe(0);
    });

    it('24 hours at 8°C contributes 10 HDD at base 18 (HDD = (18-8) × 1day)', () => {
        const recs: EPWRecord[] = Array.from({ length: 24 }, () =>
            makeRecord({ dryBulbC: 8 }),
        );
        const dd = buildDegreeDays(recs);
        expect(dd.hddBase18).toBeCloseTo(10);
        expect(dd.cddBase18).toBe(0);
    });

    it('24 hours at 25°C contributes 7 CDD at base 18', () => {
        const recs: EPWRecord[] = Array.from({ length: 24 }, () =>
            makeRecord({ dryBulbC: 25 }),
        );
        const dd = buildDegreeDays(recs);
        expect(dd.cddBase18).toBeCloseTo(7);
        expect(dd.hddBase18).toBe(0);
    });

    it('base-65°F (~18.33°C) gives slightly higher HDD than base-18°C', () => {
        const recs: EPWRecord[] = Array.from({ length: 24 }, () =>
            makeRecord({ dryBulbC: 5 }),
        );
        const dd = buildDegreeDays(recs);
        expect(dd.hddBase65F).toBeGreaterThan(dd.hddBase18);
    });
});
