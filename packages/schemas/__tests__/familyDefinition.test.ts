// P0.4 slice B (Family Platform) — L0 FamilyDefinition substrate tests.
//
// Mirrors the structure + style of familyRequest.test.ts.  Drives 100%
// coverage (enforced by `vitest.config.ts`) for every sub-schema and the
// pure `fromRequest` transformer + its exported helpers.
//
// Covers:
//   - definition:    FamilyDefinitionDerivedSchema, FamilyDefinitionSchema
//   - from-request:  fromRequest(request, opts), canonicaliseSemanticNames,
//                    computeCanonicalHash

import { describe, expect, it } from 'vitest';
import {
    // definition
    FamilyDefinitionDerivedSchema,
    FamilyDefinitionSchema,
    type FamilyDefinition,
    type FamilyDefinitionDerived,
    // from-request transformer
    fromRequest,
    canonicaliseSemanticNames,
    computeCanonicalHash,
    type FromRequestOptions,
    // input side (slice A) for fixtures
    type FamilyRequest,
} from '../src/index.js';

// ── Fixture builders ───────────────────────────────────────────────────────

const baseIdentity = () => ({
    id:      'family/com.pryzm.core/desk',
    name:    'Desk',
    version: '1.0.0',
    author:  'PRYZM',
    license: 'MIT',
});

const baseDimensions = () => ({
    widthM:  1.5,
    depthM:  0.75,
    heightM: 0.72,
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

const baseDerived = (): FamilyDefinitionDerived => ({
    canonicalSemanticNames: ['desk'],
    volumeM3:               1.5 * 0.75 * 0.72,
    footprintAreaM2:        1.5 * 0.75,
    canonicalHash:          'def:fixture',
    ingestedAt:             '2026-01-01T00:00:00.000Z',
});

const minimalDefinition = (): FamilyDefinition => ({
    ...minimalRequest(),
    derived: baseDerived(),
});

// ── FamilyDefinitionDerivedSchema ──────────────────────────────────────────

describe('FamilyDefinitionDerivedSchema', () => {
    it('accepts a valid derived block', () => {
        expect(FamilyDefinitionDerivedSchema.safeParse(baseDerived()).success).toBe(true);
    });

    it('rejects empty canonicalSemanticNames', () => {
        const parsed = FamilyDefinitionDerivedSchema.safeParse({
            ...baseDerived(), canonicalSemanticNames: [],
        });
        expect(parsed.success).toBe(false);
    });

    it('rejects zero or negative volumeM3', () => {
        expect(FamilyDefinitionDerivedSchema.safeParse({ ...baseDerived(), volumeM3: 0 }).success).toBe(false);
        expect(FamilyDefinitionDerivedSchema.safeParse({ ...baseDerived(), volumeM3: -0.1 }).success).toBe(false);
    });

    it('rejects zero or negative footprintAreaM2', () => {
        expect(FamilyDefinitionDerivedSchema.safeParse({ ...baseDerived(), footprintAreaM2: 0 }).success).toBe(false);
        expect(FamilyDefinitionDerivedSchema.safeParse({ ...baseDerived(), footprintAreaM2: -1 }).success).toBe(false);
    });

    it('rejects empty canonicalHash', () => {
        expect(FamilyDefinitionDerivedSchema.safeParse({ ...baseDerived(), canonicalHash: '' }).success).toBe(false);
    });

    it('rejects empty ingestedAt', () => {
        expect(FamilyDefinitionDerivedSchema.safeParse({ ...baseDerived(), ingestedAt: '' }).success).toBe(false);
    });
});

// ── FamilyDefinitionSchema ─────────────────────────────────────────────────

describe('FamilyDefinitionSchema', () => {
    it('accepts a valid definition (every sub-block populated)', () => {
        expect(FamilyDefinitionSchema.safeParse(minimalDefinition()).success).toBe(true);
    });

    it('rejects when derived is missing', () => {
        const { derived: _omitted, ...without } = minimalDefinition();
        void _omitted;
        expect(FamilyDefinitionSchema.safeParse(without).success).toBe(false);
    });

    it('rejects when derived.volumeM3 is non-positive (propagates from FamilyDefinitionDerivedSchema)', () => {
        const def = minimalDefinition();
        def.derived = { ...def.derived, volumeM3: 0 };
        expect(FamilyDefinitionSchema.safeParse(def).success).toBe(false);
    });

    it('rejects when identity.version is non-semver (propagates from FamilyIdentitySchema)', () => {
        const def = minimalDefinition();
        def.identity = { ...def.identity, version: '1.0' };
        expect(FamilyDefinitionSchema.safeParse(def).success).toBe(false);
    });

    it('rejects when ai.semanticNames is empty (propagates from FamilyAiHintSchema)', () => {
        const def = minimalDefinition();
        def.ai = { ...def.ai, semanticNames: [] };
        expect(FamilyDefinitionSchema.safeParse(def).success).toBe(false);
    });
});

// ── canonicaliseSemanticNames ──────────────────────────────────────────────

describe('canonicaliseSemanticNames', () => {
    it('lower-cases, trims, de-dups, and sorts', () => {
        expect(canonicaliseSemanticNames(['Sofa', 'sofa', '  COUCH  ', '']))
            .toEqual(['couch', 'sofa']);
    });

    it('drops empty + whitespace-only strings', () => {
        expect(canonicaliseSemanticNames(['', '   ', 'desk', '\t', '\n']))
            .toEqual(['desk']);
    });

    it('is idempotent — running twice gives the same output', () => {
        const once  = canonicaliseSemanticNames(['Office Chair', 'office chair', 'TASK CHAIR']);
        const twice = canonicaliseSemanticNames(once);
        expect(twice).toEqual(once);
    });

    it('returns a stable sort regardless of input order', () => {
        const a = canonicaliseSemanticNames(['banana', 'apple', 'cherry']);
        const b = canonicaliseSemanticNames(['cherry', 'banana', 'apple']);
        expect(a).toEqual(b);
        expect(a).toEqual(['apple', 'banana', 'cherry']);
    });

    it('handles an all-empty input by returning []', () => {
        expect(canonicaliseSemanticNames(['', '  ', '\t'])).toEqual([]);
    });
});

// ── computeCanonicalHash ───────────────────────────────────────────────────

describe('computeCanonicalHash', () => {
    it('is deterministic — same input twice → same hash', () => {
        const r = minimalRequest();
        const names = canonicaliseSemanticNames(r.ai.semanticNames);
        expect(computeCanonicalHash(r, names)).toBe(computeCanonicalHash(r, names));
    });

    it('produces a hash prefixed with `def:`', () => {
        const r = minimalRequest();
        const names = canonicaliseSemanticNames(r.ai.semanticNames);
        expect(computeCanonicalHash(r, names).startsWith('def:')).toBe(true);
    });

    it('is stable to semanticNames input order (canonicaliser pre-sorts)', () => {
        const r1 = minimalRequest();
        r1.ai = { ...r1.ai, semanticNames: ['desk', 'workstation'] };
        const r2 = minimalRequest();
        r2.ai = { ...r2.ai, semanticNames: ['workstation', 'desk'] };

        const h1 = computeCanonicalHash(r1, canonicaliseSemanticNames(r1.ai.semanticNames));
        const h2 = computeCanonicalHash(r2, canonicaliseSemanticNames(r2.ai.semanticNames));
        expect(h1).toBe(h2);
    });

    it('CHANGES when widthM changes', () => {
        const r1 = minimalRequest();
        const r2 = minimalRequest();
        r2.geometry.dimensions.widthM = r1.geometry.dimensions.widthM + 0.001;

        const h1 = computeCanonicalHash(r1, canonicaliseSemanticNames(r1.ai.semanticNames));
        const h2 = computeCanonicalHash(r2, canonicaliseSemanticNames(r2.ai.semanticNames));
        expect(h1).not.toBe(h2);
    });

    it('CHANGES when version changes', () => {
        const r1 = minimalRequest();
        const r2 = minimalRequest();
        r2.identity = { ...r2.identity, version: '2.0.0' };

        const h1 = computeCanonicalHash(r1, canonicaliseSemanticNames(r1.ai.semanticNames));
        const h2 = computeCanonicalHash(r2, canonicaliseSemanticNames(r2.ai.semanticNames));
        expect(h1).not.toBe(h2);
    });

    it('CHANGES when mountClass changes', () => {
        const r1 = minimalRequest();
        const r2 = minimalRequest();
        r2.behaviour = { ...r2.behaviour, mountClass: 'wall' };

        const h1 = computeCanonicalHash(r1, canonicaliseSemanticNames(r1.ai.semanticNames));
        const h2 = computeCanonicalHash(r2, canonicaliseSemanticNames(r2.ai.semanticNames));
        expect(h1).not.toBe(h2);
    });
});

// ── fromRequest ────────────────────────────────────────────────────────────

describe('fromRequest', () => {
    it('produces a definition that round-trips through FamilyDefinitionSchema', () => {
        const def = fromRequest(minimalRequest(), { ingestedAt: '2026-01-01T00:00:00Z' });
        expect(FamilyDefinitionSchema.safeParse(def).success).toBe(true);
    });

    it('computes derived.volumeM3 as widthM × depthM × heightM', () => {
        const r = minimalRequest();
        const def = fromRequest(r, { ingestedAt: '2026-01-01T00:00:00Z' });
        const { widthM, depthM, heightM } = r.geometry.dimensions;
        expect(def.derived.volumeM3).toBe(widthM * depthM * heightM);
    });

    it('computes derived.footprintAreaM2 as widthM × depthM', () => {
        const r = minimalRequest();
        const def = fromRequest(r, { ingestedAt: '2026-01-01T00:00:00Z' });
        const { widthM, depthM } = r.geometry.dimensions;
        expect(def.derived.footprintAreaM2).toBe(widthM * depthM);
    });

    it('honours opts.ingestedAt verbatim when supplied', () => {
        const def = fromRequest(minimalRequest(), { ingestedAt: '2026-01-01T00:00:00Z' });
        expect(def.derived.ingestedAt).toBe('2026-01-01T00:00:00Z');
    });

    it('falls back to new Date().toISOString() when opts.ingestedAt is omitted', () => {
        const before = Date.now();
        const def = fromRequest(minimalRequest());
        const after = Date.now();

        // ISO 8601 stamp parses back to a number in [before, after].
        const t = Date.parse(def.derived.ingestedAt);
        expect(Number.isFinite(t)).toBe(true);
        expect(t).toBeGreaterThanOrEqual(before);
        expect(t).toBeLessThanOrEqual(after);
    });

    it('treats opts as optional (no second arg works)', () => {
        const def = fromRequest(minimalRequest());
        expect(typeof def.derived.ingestedAt).toBe('string');
        expect(def.derived.ingestedAt.length).toBeGreaterThan(0);
    });

    it('passes identity through by REFERENCE (no copy)', () => {
        const r = minimalRequest();
        const def = fromRequest(r, { ingestedAt: '2026-01-01T00:00:00Z' });
        expect(def.identity).toBe(r.identity);
    });

    it('passes documentation through by REFERENCE (no copy)', () => {
        const r = minimalRequest();
        const def = fromRequest(r, { ingestedAt: '2026-01-01T00:00:00Z' });
        expect(def.documentation).toBe(r.documentation);
    });

    it('passes geometry / behaviour / constraints / placement / bim / ai through by REFERENCE', () => {
        const r = minimalRequest();
        const def = fromRequest(r, { ingestedAt: '2026-01-01T00:00:00Z' });
        expect(def.geometry).toBe(r.geometry);
        expect(def.behaviour).toBe(r.behaviour);
        expect(def.constraints).toBe(r.constraints);
        expect(def.placement).toBe(r.placement);
        expect(def.bim).toBe(r.bim);
        expect(def.ai).toBe(r.ai);
    });

    it('canonicalises derived.canonicalSemanticNames (lower-case + sort + de-dup)', () => {
        const r = minimalRequest();
        r.ai = { ...r.ai, semanticNames: ['Desk', 'desk', 'WORKSTATION'] };
        const def = fromRequest(r, { ingestedAt: '2026-01-01T00:00:00Z' });
        expect(def.derived.canonicalSemanticNames).toEqual(['desk', 'workstation']);
    });

    it('stamps a non-empty canonicalHash that matches the in-isolation hash helper', () => {
        const r = minimalRequest();
        const def = fromRequest(r, { ingestedAt: '2026-01-01T00:00:00Z' });
        const expected = computeCanonicalHash(r, canonicaliseSemanticNames(r.ai.semanticNames));
        expect(def.derived.canonicalHash).toBe(expected);
        expect(def.derived.canonicalHash.length).toBeGreaterThan(0);
    });

    it('round-trips a maximal request', () => {
        const r: FamilyRequest = {
            identity:      baseIdentity(),
            documentation: {
                pdfs:            [{ uri: 'file:///tmp/spec.pdf', contentType: 'application/pdf', byteCount: 100, hash: 'sha256:abc' }],
                specSheets:      [{ uri: 'file:///tmp/spec.csv', contentType: 'text/csv' }],
                referenceImages: [{ uri: 'https://cdn.pryzm.io/desk.png', contentType: 'image/png' }],
            },
            geometry: {
                dimensions:         baseDimensions(),
                parametricRanges:   [{ name: 'leafHeight', unit: 'm', min: 0.6, max: 2.4, defaultValue: 2.1 }],
                hostedRelationship: { hostKind: 'wall', embedDepthM: 0.05, swingDirection: 'inward' },
            },
            behaviour:   { movable: false, hosted: true, mountClass: 'wall' },
            constraints: {
                minWidthM: 0.3, maxWidthM: 2.0,
                minDepthM: 0.05, maxDepthM: 0.2,
                minHeightM: 0.5, maxHeightM: 2.4,
                excludeWallTypes: ['glass-panel'],
            },
            placement: {
                defaultAnchor:  'wall-window',
                allowedAnchors: ['wall-window', 'wall-longest'],
                excludedWalls:  ['wall-id-42'],
            },
            bim: { entityType: 'IfcDoor', predefinedType: 'DOOR', psets: ['Pset_DoorCommon'] },
            ai:  { semanticNames: ['Desk', 'Workstation'], synonyms: ['table'], cuesForPrompts: ['flat workspace'] },
        };

        const def = fromRequest(r, { ingestedAt: '2026-02-02T12:34:56Z' });
        expect(FamilyDefinitionSchema.safeParse(def).success).toBe(true);
        expect(def.derived.canonicalSemanticNames).toEqual(['desk', 'workstation']);
        expect(def.derived.footprintAreaM2).toBe(baseDimensions().widthM * baseDimensions().depthM);
    });

    it('FromRequestOptions is a structural type usable for option assembly', () => {
        const opts: FromRequestOptions = { ingestedAt: '2026-03-03T00:00:00Z' };
        const def = fromRequest(minimalRequest(), opts);
        expect(def.derived.ingestedAt).toBe(opts.ingestedAt);
    });
});
