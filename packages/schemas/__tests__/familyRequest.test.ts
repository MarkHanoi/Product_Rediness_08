// P0.4 slice A (Family Platform) — L0 FamilyRequest substrate tests.
//
// Mirrors the structure + style of familyRegistry.test.ts.  Drives 100%
// coverage (enforced by `vitest.config.ts`) for every sub-schema and the
// top-level aggregate.
//
// Covers:
//   - documentation:  AssetRefSchema, FamilyDocumentationSchema
//   - geometry:       ParametricRangeSchema, FamilyDimensionsSchema,
//                     HostedRelationshipSchema, FamilyGeometrySchema
//   - behaviour:      FamilyBehaviourSchema, FamilyConstraintsSchema,
//                     FamilyPlacementHintSchema, FamilyAiHintSchema
//   - request:        FamilyRequestSchema (minimal + maximal + round-trip)
//   - cross-import:   FamilyBehaviour.mountClass matches FamilyMountClassSchema

import { describe, expect, it } from 'vitest';
import {
    // documentation
    AssetRefSchema,
    FamilyDocumentationSchema,
    // geometry
    ParametricRangeSchema,
    FamilyDimensionsSchema,
    HostedRelationshipSchema,
    FamilyGeometrySchema,
    // behaviour
    FamilyBehaviourSchema,
    FamilyConstraintsSchema,
    FamilyPlacementHintSchema,
    FamilyAiHintSchema,
    // request
    FamilyRequestSchema,
    type FamilyRequest,
    // cross-import target (from family-registry)
    FamilyMountClassSchema,
} from '../src/index.js';

// ── Fixture builders ───────────────────────────────────────────────────────

const baseIdentity = () => ({
    id:      'family/com.pryzm.core/desk',
    name:    'Desk',
    version: '1.0.0',
    author:  'PRYZM',
    license: 'MIT',
});

const baseAssetRef = () => ({
    uri:         'file:///tmp/spec.pdf',
    contentType: 'application/pdf',
});

const baseRange = () => ({
    name:         'leafHeight',
    unit:         'm' as const,
    min:          0.6,
    max:          2.4,
    defaultValue: 2.1,
});

const baseDimensions = () => ({
    widthM:  0.9,
    depthM:  0.6,
    heightM: 0.75,
});

const minimalRequest = (): FamilyRequest => ({
    identity:      baseIdentity(),
    documentation: { pdfs: [], specSheets: [], referenceImages: [] },
    geometry:      {
        dimensions:         baseDimensions(),
        parametricRanges:   [],
        hostedRelationship: { hostKind: 'none' },
    },
    behaviour:     { movable: true, hosted: false, mountClass: 'floor' },
    constraints:   { excludeWallTypes: [] },
    placement:     {
        defaultAnchor:  'wall-window',
        allowedAnchors: [],
        excludedWalls:  [],
    },
    bim:           { entityType: 'IfcFurniture', psets: [] },
    ai:            { semanticNames: ['desk'], synonyms: [], cuesForPrompts: [] },
});

// ── AssetRefSchema ──────────────────────────────────────────────────────────

describe('AssetRefSchema', () => {
    it('accepts a minimal asset ref', () => {
        expect(AssetRefSchema.safeParse(baseAssetRef()).success).toBe(true);
    });

    it('accepts every optional field', () => {
        const parsed = AssetRefSchema.safeParse({
            ...baseAssetRef(),
            byteCount: 12345,
            hash:      'sha256:cafebabe',
        });
        expect(parsed.success).toBe(true);
    });

    it('rejects empty uri', () => {
        expect(AssetRefSchema.safeParse({ ...baseAssetRef(), uri: '' }).success).toBe(false);
    });

    it('rejects empty contentType', () => {
        expect(AssetRefSchema.safeParse({ ...baseAssetRef(), contentType: '' }).success).toBe(false);
    });

    it('rejects negative byteCount', () => {
        expect(AssetRefSchema.safeParse({ ...baseAssetRef(), byteCount: -1 }).success).toBe(false);
    });

    it('rejects non-integer byteCount', () => {
        expect(AssetRefSchema.safeParse({ ...baseAssetRef(), byteCount: 1.5 }).success).toBe(false);
    });

    it('accepts zero byteCount', () => {
        expect(AssetRefSchema.safeParse({ ...baseAssetRef(), byteCount: 0 }).success).toBe(true);
    });
});

// ── FamilyDocumentationSchema ───────────────────────────────────────────────

describe('FamilyDocumentationSchema', () => {
    it('accepts an empty object and applies defaults', () => {
        const parsed = FamilyDocumentationSchema.parse({});
        expect(parsed).toEqual({ pdfs: [], specSheets: [], referenceImages: [] });
    });

    it('accepts a fully populated documentation block', () => {
        const parsed = FamilyDocumentationSchema.safeParse({
            pdfs:            [baseAssetRef()],
            specSheets:      [{ uri: 'file:///tmp/spec.csv', contentType: 'text/csv' }],
            referenceImages: [{ uri: 'data:image/png;base64,iVBOR...', contentType: 'image/png' }],
        });
        expect(parsed.success).toBe(true);
    });

    it('rejects when an element of pdfs is invalid', () => {
        const parsed = FamilyDocumentationSchema.safeParse({
            pdfs: [{ uri: '', contentType: 'application/pdf' }],
        });
        expect(parsed.success).toBe(false);
    });
});

// ── ParametricRangeSchema ───────────────────────────────────────────────────

describe('ParametricRangeSchema', () => {
    it('accepts a valid range', () => {
        expect(ParametricRangeSchema.safeParse(baseRange()).success).toBe(true);
    });

    it('accepts every documented unit', () => {
        for (const unit of ['m', 'mm', 'cm', 'in', 'ft', 'deg', 'rad', 'unitless'] as const) {
            expect(ParametricRangeSchema.safeParse({ ...baseRange(), unit }).success).toBe(true);
        }
    });

    it('rejects an unknown unit', () => {
        expect(ParametricRangeSchema.safeParse({ ...baseRange(), unit: 'km' }).success).toBe(false);
    });

    it('rejects empty name', () => {
        expect(ParametricRangeSchema.safeParse({ ...baseRange(), name: '' }).success).toBe(false);
    });

    it('rejects non-finite min/max/defaultValue (NaN, Infinity)', () => {
        expect(ParametricRangeSchema.safeParse({ ...baseRange(), min: NaN }).success).toBe(false);
        expect(ParametricRangeSchema.safeParse({ ...baseRange(), max: Infinity }).success).toBe(false);
        expect(ParametricRangeSchema.safeParse({ ...baseRange(), defaultValue: -Infinity }).success).toBe(false);
    });

    it('does NOT enforce min ≤ max at the schema layer (Stage-1 validates)', () => {
        // Schema is intentionally cheap; the substrate just type-checks.
        const parsed = ParametricRangeSchema.safeParse({
            ...baseRange(), min: 10, max: 1, defaultValue: 5,
        });
        expect(parsed.success).toBe(true);
    });
});

// ── FamilyDimensionsSchema ──────────────────────────────────────────────────

describe('FamilyDimensionsSchema', () => {
    it('accepts strictly positive dimensions', () => {
        expect(FamilyDimensionsSchema.safeParse(baseDimensions()).success).toBe(true);
    });

    it('rejects zero or negative widthM/depthM/heightM', () => {
        expect(FamilyDimensionsSchema.safeParse({ ...baseDimensions(), widthM:  0 }).success).toBe(false);
        expect(FamilyDimensionsSchema.safeParse({ ...baseDimensions(), depthM: -1 }).success).toBe(false);
        expect(FamilyDimensionsSchema.safeParse({ ...baseDimensions(), heightM: 0 }).success).toBe(false);
    });
});

// ── HostedRelationshipSchema ────────────────────────────────────────────────

describe('HostedRelationshipSchema', () => {
    it('accepts every documented hostKind', () => {
        for (const hostKind of ['wall', 'floor', 'ceiling', 'roof', 'curtain-wall', 'none'] as const) {
            expect(HostedRelationshipSchema.safeParse({ hostKind }).success).toBe(true);
        }
    });

    it('rejects unknown hostKind', () => {
        expect(HostedRelationshipSchema.safeParse({ hostKind: 'door' }).success).toBe(false);
    });

    it('accepts embedDepthM + swingDirection on a wall-hosted family', () => {
        const parsed = HostedRelationshipSchema.safeParse({
            hostKind: 'wall', embedDepthM: 0.05, swingDirection: 'inward',
        });
        expect(parsed.success).toBe(true);
    });

    it('rejects negative embedDepthM', () => {
        expect(HostedRelationshipSchema.safeParse({
            hostKind: 'wall', embedDepthM: -0.1,
        }).success).toBe(false);
    });

    it('rejects unknown swingDirection', () => {
        expect(HostedRelationshipSchema.safeParse({
            hostKind: 'wall', swingDirection: 'spinning',
        }).success).toBe(false);
    });

    it('allows extra metadata on a none-hosted family (schema-permissive; Stage-1 validates logic)', () => {
        const parsed = HostedRelationshipSchema.safeParse({
            hostKind: 'none', embedDepthM: 0.05, swingDirection: 'inward',
        });
        expect(parsed.success).toBe(true);
    });
});

// ── FamilyGeometrySchema ────────────────────────────────────────────────────

describe('FamilyGeometrySchema', () => {
    it('applies defaults for parametricRanges + hostedRelationship', () => {
        const parsed = FamilyGeometrySchema.parse({ dimensions: baseDimensions() });
        expect(parsed.parametricRanges).toEqual([]);
        expect(parsed.hostedRelationship).toEqual({ hostKind: 'none' });
    });

    it('accepts a fully populated geometry block', () => {
        const parsed = FamilyGeometrySchema.safeParse({
            dimensions:         baseDimensions(),
            parametricRanges:   [baseRange()],
            hostedRelationship: { hostKind: 'wall', embedDepthM: 0.05, swingDirection: 'inward' },
        });
        expect(parsed.success).toBe(true);
    });

    it('rejects when dimensions are missing', () => {
        expect(FamilyGeometrySchema.safeParse({}).success).toBe(false);
    });
});

// ── FamilyBehaviourSchema ───────────────────────────────────────────────────

describe('FamilyBehaviourSchema', () => {
    it('accepts a valid behaviour triad', () => {
        expect(FamilyBehaviourSchema.safeParse({
            movable: true, hosted: false, mountClass: 'floor',
        }).success).toBe(true);
    });

    it('rejects non-boolean movable / hosted', () => {
        expect(FamilyBehaviourSchema.safeParse({
            movable: 'yes', hosted: false, mountClass: 'floor',
        }).success).toBe(false);
    });

    it('rejects an invalid mountClass', () => {
        expect(FamilyBehaviourSchema.safeParse({
            movable: true, hosted: false, mountClass: 'roof',
        }).success).toBe(false);
    });

    it('cross-imports the registry mountClass enum — every value accepted by FamilyMountClassSchema is accepted here', () => {
        for (const mc of ['floor', 'wall', 'ceiling', 'embedded'] as const) {
            // Sanity-check the registry enum still accepts it…
            expect(FamilyMountClassSchema.safeParse(mc).success).toBe(true);
            // …and the cross-imported behaviour schema accepts the same value.
            expect(FamilyBehaviourSchema.safeParse({
                movable: false, hosted: true, mountClass: mc,
            }).success).toBe(true);
        }
    });
});

// ── FamilyConstraintsSchema ─────────────────────────────────────────────────

describe('FamilyConstraintsSchema', () => {
    it('accepts an empty constraints object and defaults excludeWallTypes', () => {
        const parsed = FamilyConstraintsSchema.parse({});
        expect(parsed.excludeWallTypes).toEqual([]);
    });

    it('accepts every optional min/max field', () => {
        const parsed = FamilyConstraintsSchema.safeParse({
            minWidthM: 0.3, maxWidthM: 2.0,
            minDepthM: 0.3, maxDepthM: 1.0,
            minHeightM: 0.5, maxHeightM: 2.4,
            excludeWallTypes: ['glass-panel'],
        });
        expect(parsed.success).toBe(true);
    });

    it('rejects zero or negative bound values', () => {
        expect(FamilyConstraintsSchema.safeParse({ minWidthM: 0 }).success).toBe(false);
        expect(FamilyConstraintsSchema.safeParse({ maxHeightM: -1 }).success).toBe(false);
    });
});

// ── FamilyPlacementHintSchema ───────────────────────────────────────────────

describe('FamilyPlacementHintSchema', () => {
    it('applies defaults for allowedAnchors + excludedWalls', () => {
        const parsed = FamilyPlacementHintSchema.parse({ defaultAnchor: 'center' });
        expect(parsed.allowedAnchors).toEqual([]);
        expect(parsed.excludedWalls).toEqual([]);
    });

    it('accepts every documented anchor', () => {
        for (const anchor of ['wall-longest', 'wall-window', 'beside', 'center', 'corner'] as const) {
            expect(FamilyPlacementHintSchema.safeParse({
                defaultAnchor: anchor, allowedAnchors: [anchor],
            }).success).toBe(true);
        }
    });

    it('rejects unknown defaultAnchor', () => {
        expect(FamilyPlacementHintSchema.safeParse({
            defaultAnchor: 'floating',
        }).success).toBe(false);
    });

    it('rejects an invalid entry in allowedAnchors', () => {
        expect(FamilyPlacementHintSchema.safeParse({
            defaultAnchor: 'center', allowedAnchors: ['floating'],
        }).success).toBe(false);
    });
});

// ── FamilyAiHintSchema ──────────────────────────────────────────────────────

describe('FamilyAiHintSchema', () => {
    it('accepts a minimal hint with one semantic name', () => {
        const parsed = FamilyAiHintSchema.parse({ semanticNames: ['desk'] });
        expect(parsed.synonyms).toEqual([]);
        expect(parsed.cuesForPrompts).toEqual([]);
    });

    it('rejects empty semanticNames array', () => {
        expect(FamilyAiHintSchema.safeParse({ semanticNames: [] }).success).toBe(false);
    });

    it('accepts every optional field', () => {
        const parsed = FamilyAiHintSchema.safeParse({
            semanticNames:  ['office chair', 'swivel chair'],
            synonyms:       ['task chair'],
            cuesForPrompts: ['ergonomic seating', 'rolls on castors'],
        });
        expect(parsed.success).toBe(true);
    });
});

// ── FamilyRequestSchema ─────────────────────────────────────────────────────

describe('FamilyRequestSchema', () => {
    it('accepts a minimal valid request', () => {
        expect(FamilyRequestSchema.safeParse(minimalRequest()).success).toBe(true);
    });

    it('accepts a maximal request (every optional populated)', () => {
        const maximal = {
            identity:      baseIdentity(),
            documentation: {
                pdfs:            [{ ...baseAssetRef(), byteCount: 100, hash: 'sha256:abc' }],
                specSheets:      [{ uri: 'file:///tmp/spec.csv', contentType: 'text/csv' }],
                referenceImages: [{ uri: 'https://cdn.pryzm.io/desk.png', contentType: 'image/png' }],
            },
            geometry: {
                dimensions:         baseDimensions(),
                parametricRanges:   [baseRange()],
                hostedRelationship: { hostKind: 'wall' as const, embedDepthM: 0.05, swingDirection: 'inward' as const },
            },
            behaviour:   { movable: false, hosted: true, mountClass: 'wall' as const },
            constraints: {
                minWidthM: 0.3, maxWidthM: 2.0,
                minDepthM: 0.05, maxDepthM: 0.2,
                minHeightM: 0.5, maxHeightM: 2.4,
                excludeWallTypes: ['glass-panel'],
            },
            placement: {
                defaultAnchor:  'wall-window' as const,
                allowedAnchors: ['wall-window' as const, 'wall-longest' as const],
                excludedWalls:  ['wall-id-42'],
            },
            bim: {
                entityType:     'IfcDoor',
                predefinedType: 'DOOR',
                psets:          ['Pset_DoorCommon'],
            },
            ai: {
                semanticNames:  ['desk', 'workstation'],
                synonyms:       ['table'],
                cuesForPrompts: ['flat workspace'],
            },
        };
        expect(FamilyRequestSchema.safeParse(maximal).success).toBe(true);
    });

    it('rejects when identity.version is non-semver', () => {
        const r = minimalRequest();
        r.identity.version = '1.0';
        expect(FamilyRequestSchema.safeParse(r).success).toBe(false);
    });

    it('rejects when geometry.dimensions.widthM is non-positive', () => {
        const r = minimalRequest();
        r.geometry.dimensions.widthM = 0;
        expect(FamilyRequestSchema.safeParse(r).success).toBe(false);
    });

    it('rejects when ai.semanticNames is empty', () => {
        const r = minimalRequest();
        r.ai.semanticNames = [];
        expect(FamilyRequestSchema.safeParse(r).success).toBe(false);
    });

    it('rejects when bim.entityType is empty', () => {
        const r = minimalRequest();
        r.bim.entityType = '';
        expect(FamilyRequestSchema.safeParse(r).success).toBe(false);
    });

    it('round-trips through JSON', () => {
        const r = minimalRequest();
        const round = FamilyRequestSchema.parse(JSON.parse(JSON.stringify(r)));
        expect(round).toEqual(r);
    });
});
