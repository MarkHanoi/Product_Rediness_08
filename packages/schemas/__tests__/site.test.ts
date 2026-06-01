// A.7.a (Phase A · Sprint 1) — L0 Site substrate tests.
//
// Validates the schemas authored per [C19 Site Model & Parcel §2].
//
// Strategic context: docs/02-decisions/contracts/C19-SITE-MODEL-AND-PARCEL.md.

import { describe, expect, it } from 'vitest';
import { Vec3 as Vec3Schema } from '../src/base/primitives.js';
import {
    SiteIdSchema,
    SITE_ID_PATTERN,
    PtSchema,
    SiteLocationSchema,
    ParcelSchema,
    ParcelBoundarySchema,
    ParcelSetbacksSchema,
    ParcelEdgeClassificationSchema,
    BuildingFootprintSchema,
    ContextBuildingSchema,
    RoofShapeSchema,
    ProvenanceRecordSchema,
    ProvenanceSourceSchema,
    SiteModelSchema,
} from '../src/site/index.js';

// ─────────────────────────────────────────────────────────────────────────────
// Branded ids + primitives
// ─────────────────────────────────────────────────────────────────────────────

describe('SiteId', () => {
    it('accepts uuid7-style ids', () => {
        expect(() => SiteIdSchema.parse('018f9c8a-1234-7890-abcd-ef0123456789')).not.toThrow();
    });

    it('accepts `site_<projectId>` style deterministic ids', () => {
        expect(() => SiteIdSchema.parse('site_my-project-001')).not.toThrow();
    });

    it.each(['ab', 'has space', 'has/slash'])(
        'rejects invalid id %s',
        (invalid) => {
            expect(() => SiteIdSchema.parse(invalid)).toThrow();
        },
    );

    it('SITE_ID_PATTERN matches the documented shape', () => {
        expect(SITE_ID_PATTERN.test('apartment')).toBe(true);
        expect(SITE_ID_PATTERN.test('ab')).toBe(false);
        expect(SITE_ID_PATTERN.test('a'.repeat(64))).toBe(true);
        expect(SITE_ID_PATTERN.test('a'.repeat(65))).toBe(false);
    });
});

describe('PtSchema + Vec3Schema', () => {
    it('parses a 2D point', () => {
        expect(PtSchema.parse({ x: 1.5, z: -2.5 })).toEqual({ x: 1.5, z: -2.5 });
    });

    it('rejects NaN / Infinity', () => {
        expect(() => PtSchema.parse({ x: NaN, z: 0 })).toThrow();
        expect(() => PtSchema.parse({ x: 0, z: Infinity })).toThrow();
    });

    it('parses a 3D vector', () => {
        expect(Vec3Schema.parse({ x: 1, y: 2, z: 3 })).toEqual({ x: 1, y: 2, z: 3 });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// SiteLocation
// ─────────────────────────────────────────────────────────────────────────────

describe('SiteLocationSchema', () => {
    it('parses with all defaults', () => {
        const parsed = SiteLocationSchema.parse({});
        expect(parsed.latitude).toBe(0);
        expect(parsed.longitude).toBe(0);
        expect(parsed.elevationAsl).toBe(0);
        expect(parsed.trueNorth).toBe(0);
        expect(parsed.crs).toBeNull();
        expect(parsed.basePoint).toEqual({ x: 0, y: 0, z: 0 });
        expect(parsed.siteAddress).toBeNull();
        expect(parsed.landTitleNumber).toBeNull();
    });

    it('accepts a real-world London lat/lon', () => {
        const parsed = SiteLocationSchema.parse({
            latitude: 51.5074,
            longitude: -0.1278,
            elevationAsl: 11,
            trueNorth: 0.05,
        });
        expect(parsed.latitude).toBeCloseTo(51.5074);
    });

    it('rejects out-of-range latitude / longitude', () => {
        expect(() => SiteLocationSchema.parse({ latitude: 91 })).toThrow();
        expect(() => SiteLocationSchema.parse({ longitude: 181 })).toThrow();
    });

    it('rejects out-of-range trueNorth (must be radians)', () => {
        expect(() => SiteLocationSchema.parse({ trueNorth: 4 })).toThrow();
    });

    it('accepts CRS as EPSG code or null', () => {
        expect(SiteLocationSchema.parse({ crs: 'EPSG:27700' }).crs).toBe('EPSG:27700');
        expect(SiteLocationSchema.parse({ crs: null }).crs).toBeNull();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Parcel
// ─────────────────────────────────────────────────────────────────────────────

describe('ParcelSchema', () => {
    it('parses with all defaults — empty parcel per C19 §1.4', () => {
        const parsed = ParcelSchema.parse({});
        expect(parsed.boundary.polygon).toEqual([]);
        expect(parsed.setbacks).toEqual({ front: 0, side: 0, rear: 0 });
        expect(parsed.maxFAR).toBeNull();
        expect(parsed.maxHeight).toBeNull();
        expect(parsed.zoning.category).toBeNull();
        expect(parsed.area).toBe(0);
    });

    it('accepts a parcel with a 10×8 rectangular boundary', () => {
        const parsed = ParcelSchema.parse({
            boundary: {
                polygon: [
                    { x: 0, z: 0 },
                    { x: 10, z: 0 },
                    { x: 10, z: 8 },
                    { x: 0, z: 8 },
                ],
                edgeClassifications: ['front', 'side', 'rear', 'side'],
            },
            setbacks: { front: 3, side: 2, rear: 4 },
            maxFAR: 1.5,
            maxHeight: 12,
            area: 80,
        });
        expect(parsed.boundary.polygon).toHaveLength(4);
        expect(parsed.setbacks.front).toBe(3);
        expect(parsed.maxFAR).toBe(1.5);
        expect(parsed.area).toBe(80);
    });

    it('rejects negative setbacks', () => {
        expect(() =>
            ParcelSchema.parse({ setbacks: { front: -1, side: 0, rear: 0 } }),
        ).toThrow();
    });

    it('rejects negative maxFAR / maxHeight', () => {
        expect(() => ParcelSchema.parse({ maxFAR: -0.1 })).toThrow();
        expect(() => ParcelSchema.parse({ maxHeight: -1 })).toThrow();
    });

    it('ParcelEdgeClassificationSchema accepts the 4 canonical values', () => {
        for (const v of ['front', 'side', 'rear', 'unclassified']) {
            expect(() => ParcelEdgeClassificationSchema.parse(v)).not.toThrow();
        }
        expect(() => ParcelEdgeClassificationSchema.parse('top')).toThrow();
    });

    it('ParcelSetbacksSchema accepts 0 setbacks (default empty parcel)', () => {
        const parsed = ParcelSetbacksSchema.parse({});
        expect(parsed).toEqual({ front: 0, side: 0, rear: 0 });
    });

    it('ParcelBoundarySchema accepts a polygon with matching edge classifications', () => {
        const parsed = ParcelBoundarySchema.parse({
            polygon: [
                { x: 0, z: 0 },
                { x: 10, z: 0 },
                { x: 5, z: 8 },
            ],
            edgeClassifications: ['front', 'side', 'rear'],
        });
        expect(parsed.polygon).toHaveLength(3);
        expect(parsed.edgeClassifications).toHaveLength(3);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// BuildingFootprint
// ─────────────────────────────────────────────────────────────────────────────

describe('BuildingFootprintSchema', () => {
    it('parses with all defaults', () => {
        const parsed = BuildingFootprintSchema.parse({});
        expect(parsed.polygon).toEqual([]);
        expect(parsed.maxHeightHint).toBeNull();
        expect(parsed.groundElevation).toBe(0);
        expect(parsed.entryAnchor).toBeNull();
    });

    it('accepts a footprint with entry anchor', () => {
        const parsed = BuildingFootprintSchema.parse({
            polygon: [
                { x: 1, z: 1 },
                { x: 9, z: 1 },
                { x: 9, z: 7 },
                { x: 1, z: 7 },
            ],
            maxHeightHint: 9,
            entryAnchor: { x: 1, z: 4 },
        });
        expect(parsed.polygon).toHaveLength(4);
        expect(parsed.entryAnchor).toEqual({ x: 1, z: 4 });
    });

    it('rejects negative maxHeightHint', () => {
        expect(() =>
            BuildingFootprintSchema.parse({ maxHeightHint: -1 }),
        ).toThrow();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// ContextBuilding
// ─────────────────────────────────────────────────────────────────────────────

describe('ContextBuildingSchema', () => {
    it('parses a minimum-required ContextBuilding (per C19 §1.5: editable:false)', () => {
        const parsed = ContextBuildingSchema.parse({
            id: 'ctx_018f9c8a',
            provenance: { source: 'osm' },
        });
        expect(parsed.id).toBe('ctx_018f9c8a');
        expect(parsed.editable).toBe(false);
        expect(parsed.height).toBe(10);
        expect(parsed.roofShape).toBe('opaque');
    });

    it('rejects editable:true (C19 §1.5)', () => {
        // The literal type forces false; cast to bypass for the negative test.
        expect(() =>
            ContextBuildingSchema.parse({
                id: 'ctx_018f9c8a',
                editable: true as unknown as false,
                provenance: { source: 'osm' },
            }),
        ).toThrow();
    });

    it('RoofShapeSchema accepts the 4 canonical shapes', () => {
        for (const v of ['flat', 'gable', 'hip', 'opaque']) {
            expect(() => RoofShapeSchema.parse(v)).not.toThrow();
        }
        expect(() => RoofShapeSchema.parse('mansard')).toThrow();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// ProvenanceRecord
// ─────────────────────────────────────────────────────────────────────────────

describe('ProvenanceRecordSchema', () => {
    it('parses with all defaults — source auto-promoted, actor system', () => {
        const parsed = ProvenanceRecordSchema.parse({});
        expect(parsed.source).toBe('auto-promoted');
        expect(parsed.actor).toBe('system');
        expect(parsed.license).toBeNull();
        // ingestTimestamp is auto-filled with current UTC time
        expect(parsed.ingestTimestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('accepts the 8 canonical sources', () => {
        for (const v of [
            'auto-promoted',
            'user-authored',
            'cesium-ion',
            'osm',
            'msft-footprints',
            'ifc-import',
            'survey',
            'ai',
        ]) {
            expect(() => ProvenanceSourceSchema.parse(v)).not.toThrow();
        }
    });

    it('rejects unknown source', () => {
        expect(() => ProvenanceSourceSchema.parse('manual')).toThrow();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// SiteModel — the root schema
// ─────────────────────────────────────────────────────────────────────────────

describe('SiteModelSchema', () => {
    it('parses a minimum-required SiteModel', () => {
        const parsed = SiteModelSchema.parse({
            id: 'site_proj-001',
            projectId: 'proj-001',
            location: {},
            parcel: {},
            provenance: { source: 'auto-promoted' },
        });
        expect(parsed.id).toBe('site_proj-001');
        expect(parsed.name).toBe('Site');
        expect(parsed.footprint).toBeNull();
        expect(parsed.contextBuildings).toEqual([]);
        expect(parsed.climateRef).toBeNull();
        expect(parsed.buildingRef).toBeNull();
        expect(parsed.schemaVersion).toBe(1);
    });

    it('accepts a fully-populated SiteModel', () => {
        const parsed = SiteModelSchema.parse({
            id: 'site_proj-002',
            projectId: 'proj-002',
            name: 'Holborn Apartment Block',
            location: {
                latitude: 51.5170,
                longitude: -0.1170,
                elevationAsl: 14,
                trueNorth: 0,
                crs: 'EPSG:27700',
                siteAddress: '12 Holborn, London',
                landTitleNumber: 'TT-12345',
            },
            parcel: {
                boundary: {
                    polygon: [
                        { x: 0, z: 0 },
                        { x: 20, z: 0 },
                        { x: 20, z: 30 },
                        { x: 0, z: 30 },
                    ],
                    edgeClassifications: ['front', 'side', 'rear', 'side'],
                },
                setbacks: { front: 5, side: 3, rear: 5 },
                maxFAR: 2.5,
                maxHeight: 21,
                zoning: {
                    category: 'R-3',
                    overlays: ['conservation-area'],
                    jurisdictionRef: 'lb-camden',
                },
                area: 600,
            },
            footprint: {
                polygon: [
                    { x: 5, z: 5 },
                    { x: 15, z: 5 },
                    { x: 15, z: 25 },
                    { x: 5, z: 25 },
                ],
                maxHeightHint: 18,
                groundElevation: 0,
                entryAnchor: { x: 5, z: 15 },
            },
            contextBuildings: [
                {
                    id: 'ctx_neighbour-north',
                    footprint: [
                        { x: 0, z: -10 },
                        { x: 20, z: -10 },
                        { x: 20, z: 0 },
                        { x: 0, z: 0 },
                    ],
                    height: 15,
                    provenance: { source: 'osm' },
                },
            ],
            climateRef: 'climate_london-2024',
            buildingRef: 'bldg_proj-002',
            provenance: {
                source: 'user-authored',
                actor: 'user_abc123',
            },
        });
        expect(parsed.location.crs).toBe('EPSG:27700');
        expect(parsed.parcel.boundary.polygon).toHaveLength(4);
        expect(parsed.footprint?.polygon).toHaveLength(4);
        expect(parsed.contextBuildings).toHaveLength(1);
        expect(parsed.contextBuildings[0]?.editable).toBe(false);
    });

    it('rejects an empty id', () => {
        expect(() =>
            SiteModelSchema.parse({
                id: 'ab', // < 3 chars
                projectId: 'proj-001',
                location: {},
                parcel: {},
                provenance: {},
            }),
        ).toThrow();
    });

    it('rejects an empty name', () => {
        expect(() =>
            SiteModelSchema.parse({
                id: 'site_proj-001',
                projectId: 'proj-001',
                name: '',
                location: {},
                parcel: {},
                provenance: {},
            }),
        ).toThrow();
    });

    it('rejects a non-positive schemaVersion', () => {
        expect(() =>
            SiteModelSchema.parse({
                id: 'site_proj-001',
                projectId: 'proj-001',
                location: {},
                parcel: {},
                provenance: {},
                schemaVersion: 0,
            }),
        ).toThrow();
    });
});
