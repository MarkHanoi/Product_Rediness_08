// A.10.a (Phase A · Sprint 2) — L0 Climate substrate tests.

import { describe, expect, it } from 'vitest';
import {
    ClimateDatasetIdSchema,
    CLIMATE_DATASET_ID_PATTERN,
    ClimateSourceSchema,
    MonthIndexSchema,
    ClimateProvenanceSchema,
    EPWRecordSchema,
    NOAANormalSchema,
    WindSampleSchema,
    WindRoseSectorSchema,
    WindRoseAggregateSchema,
    WIND_ROSE_SECTOR_COUNT,
    DesignTemperaturesSchema,
    DegreeDayAggregatesSchema,
    SolarSampleSchema,
    ClimateCacheKeySchema,
    serialiseClimateCacheKey,
    quantiseToCacheKey,
    ClimateDatasetSchema,
    ClimateIngestionErrorSchema,
} from '../src/climate/index.js';

// ─────────────────────────────────────────────────────────────────────────────
// Branded ids + primitives
// ─────────────────────────────────────────────────────────────────────────────

describe('ClimateDatasetId', () => {
    it('accepts `climate:<ulid>` format', () => {
        expect(() =>
            ClimateDatasetIdSchema.parse('climate:01H8QV8XQK4T0R3WJ9NN5XYZ6T'),
        ).not.toThrow();
    });

    it.each([
        'climate:short',
        '01HSOMETHING',
        'climate-no-colon',
        '',
    ])('rejects invalid id %s', (invalid) => {
        expect(() => ClimateDatasetIdSchema.parse(invalid)).toThrow();
    });

    it('CLIMATE_DATASET_ID_PATTERN matches the documented shape', () => {
        expect(
            CLIMATE_DATASET_ID_PATTERN.test('climate:01H8QV8XQK4T0R3W'),
        ).toBe(true);
    });
});

describe('ClimateSource enum (per §1.2)', () => {
    it('accepts the 3 source tiers', () => {
        for (const v of ['epw', 'noaa-normals', 'fallback-defaults']) {
            expect(() => ClimateSourceSchema.parse(v)).not.toThrow();
        }
    });

    it('rejects unknown source', () => {
        expect(() => ClimateSourceSchema.parse('iwec')).toThrow();
    });
});

describe('MonthIndex', () => {
    it('accepts 1..12', () => {
        for (let m = 1; m <= 12; m++) {
            expect(MonthIndexSchema.parse(m)).toBe(m);
        }
    });

    it.each([0, 13, 1.5, -1])('rejects %s', (invalid) => {
        expect(() => MonthIndexSchema.parse(invalid)).toThrow();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// ClimateProvenance (§1.12)
// ─────────────────────────────────────────────────────────────────────────────

describe('ClimateProvenanceSchema', () => {
    it('accepts a minimum-required provenance', () => {
        const parsed = ClimateProvenanceSchema.parse({
            source: 'epw',
            vendor: 'EnergyPlus.net',
            datasetVersion: 'epw-tmy3-2024.1',
            fetchedAtUtcIso: '2026-06-01T12:00:00.000Z',
            license: 'CC-BY-4.0',
        });
        expect(parsed.source).toBe('epw');
    });

    it('accepts optional filename + fileSha256 for EPW uploads', () => {
        const parsed = ClimateProvenanceSchema.parse({
            source: 'epw',
            vendor: 'EnergyPlus.net',
            datasetVersion: 'epw-tmy3-2024.1',
            filename: 'London_LHR.epw',
            fileSha256:
                'a'.repeat(64),
            fetchedAtUtcIso: '2026-06-01T12:00:00.000Z',
            license: 'CC-BY-4.0',
        });
        expect(parsed.fileSha256).toMatch(/^a+$/);
    });

    it('rejects malformed fileSha256', () => {
        expect(() =>
            ClimateProvenanceSchema.parse({
                source: 'epw',
                vendor: 'X',
                datasetVersion: 'v1',
                fileSha256: 'tooshort',
                fetchedAtUtcIso: '2026-06-01T12:00:00.000Z',
                license: 'X',
            }),
        ).toThrow();
    });

    it('rejects when license is missing', () => {
        expect(() =>
            ClimateProvenanceSchema.parse({
                source: 'epw',
                vendor: 'X',
                datasetVersion: 'v1',
                fetchedAtUtcIso: '2026-06-01T12:00:00.000Z',
            } as unknown),
        ).toThrow();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// EPWRecord
// ─────────────────────────────────────────────────────────────────────────────

describe('EPWRecordSchema', () => {
    function makeRecord(over: Partial<unknown> = {}): unknown {
        return {
            utcIso: '2024-06-21T12:00:00.000Z',
            localHourOfYear: 4344,
            dryBulbC: 22,
            dewPointC: 12,
            relHumidityPct: 53,
            stationPressurePa: 101325,
            directNormalWm2: 850,
            diffuseHorizontalWm2: 120,
            globalHorizontalWm2: 870,
            windSpeedMps: 4.2,
            windDirDeg: 225,
            totalCloudTenths: 3,
            opaqueCloudTenths: 2,
            visibilityKm: 30,
            precipMm: 0,
            ...(over as Record<string, unknown>),
        };
    }

    it('parses a canonical record', () => {
        expect(() => EPWRecordSchema.parse(makeRecord())).not.toThrow();
    });

    it('rejects out-of-range temperatures', () => {
        expect(() =>
            EPWRecordSchema.parse(makeRecord({ dryBulbC: 100 })),
        ).toThrow();
        expect(() =>
            EPWRecordSchema.parse(makeRecord({ dryBulbC: -100 })),
        ).toThrow();
    });

    it('rejects windDirDeg outside 0..360', () => {
        expect(() =>
            EPWRecordSchema.parse(makeRecord({ windDirDeg: 400 })),
        ).toThrow();
    });

    it('rejects negative humidity / pressure / irradiance', () => {
        expect(() =>
            EPWRecordSchema.parse(makeRecord({ relHumidityPct: -1 })),
        ).toThrow();
        expect(() =>
            EPWRecordSchema.parse(makeRecord({ stationPressurePa: 0 })),
        ).toThrow();
        expect(() =>
            EPWRecordSchema.parse(makeRecord({ directNormalWm2: -1 })),
        ).toThrow();
    });

    it('rejects localHourOfYear < 1 or > 8784', () => {
        expect(() =>
            EPWRecordSchema.parse(makeRecord({ localHourOfYear: 0 })),
        ).toThrow();
        expect(() =>
            EPWRecordSchema.parse(makeRecord({ localHourOfYear: 8785 })),
        ).toThrow();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// NOAANormal
// ─────────────────────────────────────────────────────────────────────────────

describe('NOAANormalSchema', () => {
    function makeNormal(month = 6): unknown {
        return {
            month,
            avgDryBulbC: 16,
            avgMinDryBulbC: 12,
            avgMaxDryBulbC: 20,
            avgRelHumidityPct: 65,
            avgPrecipMm: 50,
            avgWindSpeedMps: 3.5,
            prevailingWindDirDeg: 270,
            avgGlobalHorizontalWm2: 250,
            heatingDegreeDaysBase18: 60,
            coolingDegreeDaysBase18: 0,
        };
    }

    it('parses a canonical normal for June', () => {
        expect(() => NOAANormalSchema.parse(makeNormal(6))).not.toThrow();
    });

    it('rejects month outside 1..12', () => {
        expect(() => NOAANormalSchema.parse(makeNormal(0))).toThrow();
        expect(() => NOAANormalSchema.parse(makeNormal(13))).toThrow();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// WindSample + WindRose
// ─────────────────────────────────────────────────────────────────────────────

describe('WindSampleSchema', () => {
    it('accepts a typical sample', () => {
        expect(() =>
            WindSampleSchema.parse({ windDirDeg: 180, windSpeedMps: 5 }),
        ).not.toThrow();
    });

    it('rejects negative speed or out-of-range direction', () => {
        expect(() =>
            WindSampleSchema.parse({ windDirDeg: 361, windSpeedMps: 0 }),
        ).toThrow();
        expect(() =>
            WindSampleSchema.parse({ windDirDeg: 0, windSpeedMps: -1 }),
        ).toThrow();
    });
});

describe('WindRoseAggregateSchema', () => {
    function makeRose() {
        // 16 sectors × 6 bins each — all zeros.
        const sectors = Array.from({ length: WIND_ROSE_SECTOR_COUNT }, (_, i) => ({
            sectorDeg: i * 22.5,
            speedBinHours: [0, 0, 0, 0, 0, 0] as [number, number, number, number, number, number],
        }));
        return { sectors, meanSpeedMps: 4.0, p99SpeedMps: 18.0 };
    }

    it('parses a canonical 16-sector rose', () => {
        const parsed = WindRoseAggregateSchema.parse(makeRose());
        expect(parsed.sectors).toHaveLength(16);
        expect(parsed.meanSpeedMps).toBeCloseTo(4.0);
    });

    it('rejects when sectors !== 16', () => {
        const broken = makeRose();
        const partial = { ...broken, sectors: broken.sectors.slice(0, 8) };
        expect(() => WindRoseAggregateSchema.parse(partial)).toThrow();
    });

    it('WindRoseSectorSchema rejects wrong-length speedBinHours', () => {
        expect(() =>
            WindRoseSectorSchema.parse({
                sectorDeg: 0,
                speedBinHours: [1, 2, 3, 4],
            }),
        ).toThrow();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// DesignTemperatures + DegreeDayAggregates
// ─────────────────────────────────────────────────────────────────────────────

describe('DesignTemperaturesSchema', () => {
    it('parses London-ish design temps', () => {
        const parsed = DesignTemperaturesSchema.parse({
            heating99_6C: -3.5,
            cooling0_4C: 29.5,
            cooling0_4MwbC: 21.0,
        });
        expect(parsed.heating99_6C).toBeCloseTo(-3.5);
    });

    it('rejects unrealistic heating design temp', () => {
        expect(() =>
            DesignTemperaturesSchema.parse({
                heating99_6C: 50,        // too warm for 99.6%
                cooling0_4C: 29,
                cooling0_4MwbC: 21,
            }),
        ).toThrow();
    });
});

describe('DegreeDayAggregatesSchema', () => {
    it('parses an aggregate', () => {
        expect(() =>
            DegreeDayAggregatesSchema.parse({
                hddBase18: 2200,
                cddBase18: 50,
                hddBase65F: 2150,
                cddBase65F: 55,
            }),
        ).not.toThrow();
    });

    it('rejects negative degree-days', () => {
        expect(() =>
            DegreeDayAggregatesSchema.parse({
                hddBase18: -1,
                cddBase18: 0,
                hddBase65F: 0,
                cddBase65F: 0,
            }),
        ).toThrow();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// SolarSample (computed-only shape)
// ─────────────────────────────────────────────────────────────────────────────

describe('SolarSampleSchema', () => {
    it('parses a noon sample', () => {
        const parsed = SolarSampleSchema.parse({
            utcIso: '2024-06-21T12:00:00.000Z',
            altitudeRad: 1.0,           // ~57°
            azimuthRad: Math.PI,        // S
            isAboveHorizon: true,
            approxDirectWm2: 850,
        });
        expect(parsed.isAboveHorizon).toBe(true);
    });

    it('rejects altitude outside [-π/2, π/2]', () => {
        expect(() =>
            SolarSampleSchema.parse({
                utcIso: '2024-06-21T12:00:00.000Z',
                altitudeRad: 2.0,
                azimuthRad: 0,
                isAboveHorizon: true,
                approxDirectWm2: 0,
            }),
        ).toThrow();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// ClimateCacheKey + helpers
// ─────────────────────────────────────────────────────────────────────────────

describe('ClimateCacheKey + helpers', () => {
    it('quantiseToCacheKey rounds lat/lon to 0.01°', () => {
        const k = quantiseToCacheKey(51.50739, -0.12783, 'epw-tmy3-2024.1');
        expect(k.latE2).toBe(5151);             // round(51.50739 * 100) = 5151
        expect(k.lonE2).toBe(-13);              // round(-0.12783 * 100) = -13
        expect(k.datasetVersion).toBe('epw-tmy3-2024.1');
    });

    it('serialiseClimateCacheKey produces the canonical string', () => {
        const k = quantiseToCacheKey(51.5, -0.13, 'epw-tmy3-2024.1');
        expect(serialiseClimateCacheKey(k)).toBe('5150|-13|epw-tmy3-2024.1');
    });

    it('two sites within ~1 km share a key (per §1.4 cache-hit boost)', () => {
        const a = quantiseToCacheKey(51.5074, -0.1278, 'epw-tmy3-2024.1');
        const b = quantiseToCacheKey(51.5081, -0.1275, 'epw-tmy3-2024.1');
        expect(serialiseClimateCacheKey(a)).toBe(serialiseClimateCacheKey(b));
    });

    it('ClimateCacheKeySchema validates int + range', () => {
        expect(() =>
            ClimateCacheKeySchema.parse({
                latE2: 5150,
                lonE2: -13,
                datasetVersion: 'v1',
            }),
        ).not.toThrow();

        expect(() =>
            ClimateCacheKeySchema.parse({
                latE2: 9001,
                lonE2: 0,
                datasetVersion: 'v1',
            }),
        ).toThrow();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// ClimateDataset (root)
// ─────────────────────────────────────────────────────────────────────────────

describe('ClimateDatasetSchema', () => {
    function makeRose() {
        const sectors = Array.from({ length: 16 }, (_, i) => ({
            sectorDeg: i * 22.5,
            speedBinHours: [0, 0, 0, 0, 0, 0] as [number, number, number, number, number, number],
        }));
        return { sectors, meanSpeedMps: 4, p99SpeedMps: 18 };
    }

    function makeNormals() {
        return Array.from({ length: 12 }, (_, i) => ({
            month: i + 1,
            avgDryBulbC: 10,
            avgMinDryBulbC: 6,
            avgMaxDryBulbC: 14,
            avgRelHumidityPct: 65,
            avgPrecipMm: 50,
            avgWindSpeedMps: 3.5,
            prevailingWindDirDeg: 270,
            avgGlobalHorizontalWm2: 250,
            heatingDegreeDaysBase18: 200,
            coolingDegreeDaysBase18: 0,
        }));
    }

    function makeDataset(over: Record<string, unknown> = {}): unknown {
        return {
            id: 'climate:01H8QV8XQK4T0R3W',
            siteRef: 'site_proj-001',
            lat: 51.5074,
            lon: -0.1278,
            elevationM: 11,
            timezone: 'Europe/London',
            source: 'noaa-normals',
            monthlyNormals: makeNormals(),
            windRose: makeRose(),
            designTemps: {
                heating99_6C: -3.5,
                cooling0_4C: 29.5,
                cooling0_4MwbC: 21,
            },
            degreeDays: {
                hddBase18: 2200,
                cddBase18: 50,
                hddBase65F: 2150,
                cddBase65F: 55,
            },
            provenance: {
                source: 'noaa-normals',
                vendor: 'NOAA NCEI',
                datasetVersion: 'noaa-normals-1991-2020',
                fetchedAtUtcIso: '2026-06-01T12:00:00.000Z',
                license: 'public-domain',
            },
            ingestedAtUtcIso: '2026-06-01T12:00:01.000Z',
            ...over,
        };
    }

    it('parses a canonical NOAA-normals dataset', () => {
        expect(() => ClimateDatasetSchema.parse(makeDataset())).not.toThrow();
    });

    it('rejects when monthlyNormals.length !== 12', () => {
        expect(() =>
            ClimateDatasetSchema.parse(
                makeDataset({ monthlyNormals: makeNormals().slice(0, 11) }),
            ),
        ).toThrow();
    });

    it('rejects out-of-range lat/lon', () => {
        expect(() =>
            ClimateDatasetSchema.parse(makeDataset({ lat: 91 })),
        ).toThrow();
        expect(() =>
            ClimateDatasetSchema.parse(makeDataset({ lon: 181 })),
        ).toThrow();
    });

    it('accepts hourly[] when source = epw', () => {
        const hourly = [
            {
                utcIso: '2024-01-01T00:00:00.000Z',
                localHourOfYear: 1,
                dryBulbC: 10,
                dewPointC: 5,
                relHumidityPct: 70,
                stationPressurePa: 101325,
                directNormalWm2: 0,
                diffuseHorizontalWm2: 0,
                globalHorizontalWm2: 0,
                windSpeedMps: 3,
                windDirDeg: 180,
                totalCloudTenths: 5,
                opaqueCloudTenths: 5,
                visibilityKm: 10,
                precipMm: 0,
            },
        ];
        expect(() =>
            ClimateDatasetSchema.parse(makeDataset({ source: 'epw', hourly })),
        ).not.toThrow();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// ClimateIngestionError (discriminated union)
// ─────────────────────────────────────────────────────────────────────────────

describe('ClimateIngestionErrorSchema', () => {
    it('parses no-site error', () => {
        expect(() =>
            ClimateIngestionErrorSchema.parse({ kind: 'no-site' }),
        ).not.toThrow();
    });

    it('parses epw-parse-failed with line + message', () => {
        expect(() =>
            ClimateIngestionErrorSchema.parse({
                kind: 'epw-parse-failed',
                line: 42,
                message: 'expected numeric, got "N/A"',
            }),
        ).not.toThrow();
    });

    it('parses noaa-fetch-failed with httpStatus + siteRef', () => {
        expect(() =>
            ClimateIngestionErrorSchema.parse({
                kind: 'noaa-fetch-failed',
                httpStatus: 503,
                siteRef: 'site_proj-001',
            }),
        ).not.toThrow();
    });

    it('rejects unknown kind', () => {
        expect(() =>
            ClimateIngestionErrorSchema.parse({ kind: 'wat' }),
        ).toThrow();
    });

    it('rejects epw-parse-failed without line', () => {
        expect(() =>
            ClimateIngestionErrorSchema.parse({
                kind: 'epw-parse-failed',
                message: 'x',
            }),
        ).toThrow();
    });
});
