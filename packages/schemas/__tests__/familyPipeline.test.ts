// P0.5 Stage-pipeline (Family Platform) — single-call orchestrator tests.
//
// Verifies `runFamilyPipeline` chains every Family-Generation Stage
// (1 → 2 → 3 → 4 → 5) end-to-end, surfaces ingestion failures verbatim,
// preserves every intermediate stage output, and propagates per-stage
// options correctly.
//
// 100% coverage of `src/family-pipeline/run-pipeline.ts` is enforced by
// `vitest.config.ts` (branches/functions/lines/statements all at 100).

import { describe, expect, it } from 'vitest';
import {
    // pipeline orchestrator
    runFamilyPipeline,
    isPipelineSuccess,
    type RunFamilyPipelineOptions,
    type RunFamilyPipelineOutcome,
    type RunFamilyPipelineSuccess,
    // re-exported schema we round-trip through
    RegisteredFamilySchema,
    FamilyDefinitionSchema,
    ParametricFamilySchema,
    GeneratedGeometrySchema,
    GeneratedSchemasSchema,
    // request side for fixture building
    type FamilyRequest,
} from '../src/index.js';

// ── Fixture builders ───────────────────────────────────────────────────────
//
// Mirror the familyDefinition.test.ts builders so the Stage-1 input is
// guaranteed to validate.

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

const INGEST_TS    = '2026-01-01T00:00:00.000Z';
const DECOMPOSE_TS = '2026-01-02T00:00:00.000Z';
const GEOMETRY_TS  = '2026-01-03T00:00:00.000Z';
const SCHEMAS_TS   = '2026-01-04T00:00:00.000Z';

const pinnedOpts = (): RunFamilyPipelineOptions => ({
    ingest:             { fromRequestOpts: { ingestedAt: INGEST_TS } },
    decompose:          { decomposedAt:    DECOMPOSE_TS },
    synthesiseGeometry: { synthesisedAt:   GEOMETRY_TS },
    synthesiseSchemas:  { synthesisedAt:   SCHEMAS_TS },
});

// Narrow + assert success; fails the test (instead of silently undefining
// later expectations) if the input was rejected.
function expectSuccess(o: RunFamilyPipelineOutcome): RunFamilyPipelineSuccess {
    if (!o.ok) {
        throw new Error(
            `expected pipeline success but got failure: ${o.message} ` +
            `(${o.issues.length} issue(s))`,
        );
    }
    return o;
}

// ── Happy path ─────────────────────────────────────────────────────────────

describe('runFamilyPipeline — success', () => {
    it('valid raw JSON → { ok: true, registered, stages }', () => {
        const outcome = runFamilyPipeline(minimalRequest(), pinnedOpts());
        expect(outcome.ok).toBe(true);
        if (outcome.ok) {
            expect(outcome.registered).toBeDefined();
            expect(outcome.stages).toBeDefined();
            expect(outcome.stages.definition).toBeDefined();
            expect(outcome.stages.parametric).toBeDefined();
            expect(outcome.stages.geometry).toBeDefined();
            expect(outcome.stages.schemas).toBeDefined();
        }
    });

    it('registered round-trips through RegisteredFamilySchema.parse', () => {
        const outcome = runFamilyPipeline(minimalRequest(), pinnedOpts());
        const success = expectSuccess(outcome);
        expect(() => RegisteredFamilySchema.parse(success.registered)).not.toThrow();
    });

    it('stages.definition round-trips through FamilyDefinitionSchema.parse', () => {
        const success = expectSuccess(runFamilyPipeline(minimalRequest(), pinnedOpts()));
        expect(() => FamilyDefinitionSchema.parse(success.stages.definition)).not.toThrow();
    });

    it('stages.parametric round-trips through ParametricFamilySchema.parse', () => {
        const success = expectSuccess(runFamilyPipeline(minimalRequest(), pinnedOpts()));
        expect(() => ParametricFamilySchema.parse(success.stages.parametric)).not.toThrow();
    });

    it('stages.geometry round-trips through GeneratedGeometrySchema.parse', () => {
        const success = expectSuccess(runFamilyPipeline(minimalRequest(), pinnedOpts()));
        expect(() => GeneratedGeometrySchema.parse(success.stages.geometry)).not.toThrow();
    });

    it('stages.schemas round-trips through GeneratedSchemasSchema.parse', () => {
        const success = expectSuccess(runFamilyPipeline(minimalRequest(), pinnedOpts()));
        expect(() => GeneratedSchemasSchema.parse(success.stages.schemas)).not.toThrow();
    });

    it('all stage identities share the same id (parametric ← definition)', () => {
        const success = expectSuccess(runFamilyPipeline(minimalRequest(), pinnedOpts()));
        expect(success.stages.parametric.identity.id)
            .toBe(success.stages.definition.identity.id);
    });

    it('all stage identities share the same id (geometry ← parametric)', () => {
        const success = expectSuccess(runFamilyPipeline(minimalRequest(), pinnedOpts()));
        expect(success.stages.geometry.identity.id)
            .toBe(success.stages.parametric.identity.id);
    });

    it('all stage identities share the same id (schemas ← geometry)', () => {
        const success = expectSuccess(runFamilyPipeline(minimalRequest(), pinnedOpts()));
        expect(success.stages.schemas.identity.id)
            .toBe(success.stages.geometry.identity.id);
    });

    it('registered.identity.id matches the input identity', () => {
        const success = expectSuccess(runFamilyPipeline(minimalRequest(), pinnedOpts()));
        expect(success.registered.identity.id)
            .toBe(minimalRequest().identity.id);
    });

    it('all hashes are non-empty strings', () => {
        const success = expectSuccess(runFamilyPipeline(minimalRequest(), pinnedOpts()));
        expect(typeof success.stages.definition.derived.canonicalHash).toBe('string');
        expect(success.stages.definition.derived.canonicalHash.length).toBeGreaterThan(0);
        expect(typeof success.stages.parametric.parametricHash).toBe('string');
        expect(success.stages.parametric.parametricHash.length).toBeGreaterThan(0);
        expect(typeof success.stages.geometry.geometryHash).toBe('string');
        expect(success.stages.geometry.geometryHash.length).toBeGreaterThan(0);
        expect(typeof success.stages.schemas.schemasHash).toBe('string');
        expect(success.stages.schemas.schemasHash.length).toBeGreaterThan(0);
        expect(typeof success.registered.schemaHash).toBe('string');
        expect(success.registered.schemaHash.length).toBeGreaterThan(0);
    });

    it('no opts at all → still produces a valid RegisteredFamily', () => {
        const outcome = runFamilyPipeline(minimalRequest());
        const success = expectSuccess(outcome);
        expect(() => RegisteredFamilySchema.parse(success.registered)).not.toThrow();
    });
});

// ── Failure path ───────────────────────────────────────────────────────────

describe('runFamilyPipeline — failure (Stage-1 ingestion rejects)', () => {
    it('invalid raw JSON (missing required field) → { ok: false, issues, message }', () => {
        const bad = minimalRequest() as unknown as Record<string, unknown>;
        delete bad.identity;
        const outcome = runFamilyPipeline(bad);
        expect(outcome.ok).toBe(false);
        if (!outcome.ok) {
            expect(Array.isArray(outcome.issues)).toBe(true);
            expect(outcome.issues.length).toBeGreaterThan(0);
            expect(typeof outcome.message).toBe('string');
            expect(outcome.message.length).toBeGreaterThan(0);
        }
    });

    it('failure surface is identical to ingestFromJson failure (same message contract)', () => {
        const outcome = runFamilyPipeline({});
        expect(outcome.ok).toBe(false);
        if (!outcome.ok) {
            expect(outcome.message).toContain('FamilyRequest validation failed');
            expect(outcome.message).toContain(`${outcome.issues.length} issue(s)`);
        }
    });

    it('null input is rejected', () => {
        const outcome = runFamilyPipeline(null);
        expect(outcome.ok).toBe(false);
    });

    it('undefined input is rejected', () => {
        const outcome = runFamilyPipeline(undefined);
        expect(outcome.ok).toBe(false);
    });

    it('primitive (string) input is rejected', () => {
        const outcome = runFamilyPipeline('not-a-family');
        expect(outcome.ok).toBe(false);
    });

    it('failure does NOT carry a `registered` or `stages` property', () => {
        const outcome = runFamilyPipeline({});
        if (!outcome.ok) {
            expect((outcome as unknown as { registered?: unknown }).registered).toBeUndefined();
            expect((outcome as unknown as { stages?: unknown }).stages).toBeUndefined();
        }
    });
});

// ── isPipelineSuccess narrowing ────────────────────────────────────────────

describe('isPipelineSuccess', () => {
    it('returns true for a success outcome', () => {
        const outcome = runFamilyPipeline(minimalRequest(), pinnedOpts());
        expect(isPipelineSuccess(outcome)).toBe(true);
    });

    it('returns false for a failure outcome', () => {
        const outcome = runFamilyPipeline({});
        expect(isPipelineSuccess(outcome)).toBe(false);
    });

    it('narrows the discriminated union — `.registered` is typed in the true branch', () => {
        const outcome: RunFamilyPipelineOutcome = runFamilyPipeline(minimalRequest(), pinnedOpts());
        if (isPipelineSuccess(outcome)) {
            // TypeScript narrows to RunFamilyPipelineSuccess here.
            const success: RunFamilyPipelineSuccess = outcome;
            expect(success.registered.identity.name).toBe('Desk');
        } else {
            throw new Error('expected success');
        }
    });
});

// ── Per-stage option propagation ───────────────────────────────────────────

describe('runFamilyPipeline — option propagation', () => {
    it('opts.ingest.fromRequestOpts.ingestedAt pins stages.definition.derived.ingestedAt', () => {
        const success = expectSuccess(runFamilyPipeline(minimalRequest(), pinnedOpts()));
        expect(success.stages.definition.derived.ingestedAt).toBe(INGEST_TS);
    });

    it('opts.decompose.decomposedAt pins stages.parametric.decomposedAt', () => {
        const success = expectSuccess(runFamilyPipeline(minimalRequest(), pinnedOpts()));
        expect(success.stages.parametric.decomposedAt).toBe(DECOMPOSE_TS);
    });

    it('opts.synthesiseGeometry.synthesisedAt pins stages.geometry.synthesisedAt', () => {
        const success = expectSuccess(runFamilyPipeline(minimalRequest(), pinnedOpts()));
        expect(success.stages.geometry.synthesisedAt).toBe(GEOMETRY_TS);
    });

    it('opts.synthesiseSchemas.synthesisedAt pins stages.schemas.synthesisedAt', () => {
        const success = expectSuccess(runFamilyPipeline(minimalRequest(), pinnedOpts()));
        expect(success.stages.schemas.synthesisedAt).toBe(SCHEMAS_TS);
    });

    it('opts.assemble.origin propagates to registered.origin', () => {
        const outcome = runFamilyPipeline(minimalRequest(), {
            ...pinnedOpts(),
            assemble: { origin: 'core' },
        });
        const success = expectSuccess(outcome);
        expect(success.registered.origin).toBe('core');
    });

    it("default origin (no opts.assemble) is 'user'", () => {
        const success = expectSuccess(runFamilyPipeline(minimalRequest(), pinnedOpts()));
        expect(success.registered.origin).toBe('user');
    });

    it('opts.assemble.category propagates to registered.category', () => {
        const outcome = runFamilyPipeline(minimalRequest(), {
            ...pinnedOpts(),
            assemble: { category: 'desks' },
        });
        const success = expectSuccess(outcome);
        expect(success.registered.category).toBe('desks');
    });

    it("default category (no opts.assemble) is 'general'", () => {
        const success = expectSuccess(runFamilyPipeline(minimalRequest(), pinnedOpts()));
        expect(success.registered.category).toBe('general');
    });
});

// ── Determinism + frozen output ────────────────────────────────────────────

describe('runFamilyPipeline — purity + immutability', () => {
    it('same input + same pinned timestamps → identical hashes across runs', () => {
        const a = expectSuccess(runFamilyPipeline(minimalRequest(), pinnedOpts()));
        const b = expectSuccess(runFamilyPipeline(minimalRequest(), pinnedOpts()));

        expect(a.stages.definition.derived.canonicalHash)
            .toBe(b.stages.definition.derived.canonicalHash);
        expect(a.stages.parametric.parametricHash)
            .toBe(b.stages.parametric.parametricHash);
        expect(a.stages.geometry.geometryHash)
            .toBe(b.stages.geometry.geometryHash);
        expect(a.stages.schemas.schemasHash)
            .toBe(b.stages.schemas.schemasHash);
        expect(a.registered.schemaHash)
            .toBe(b.registered.schemaHash);
    });

    it('same input + same pinned timestamps → identical registered output', () => {
        const a = expectSuccess(runFamilyPipeline(minimalRequest(), pinnedOpts()));
        const b = expectSuccess(runFamilyPipeline(minimalRequest(), pinnedOpts()));
        // Identity, mountClass, schemaHash, archetypeHints, ifcMapping, origin,
        // category, tags should all be value-equal.
        expect(JSON.stringify(a.registered)).toBe(JSON.stringify(b.registered));
    });

    it('top-level success outcome is frozen — cannot reassign properties', () => {
        const outcome = runFamilyPipeline(minimalRequest(), pinnedOpts());
        const success = expectSuccess(outcome);
        expect(Object.isFrozen(success)).toBe(true);
    });

    it('stages map is frozen — cannot reassign sub-stage', () => {
        const success = expectSuccess(runFamilyPipeline(minimalRequest(), pinnedOpts()));
        expect(Object.isFrozen(success.stages)).toBe(true);
    });

    it('attempting to mutate the frozen success outcome throws in strict mode', () => {
        const success = expectSuccess(runFamilyPipeline(minimalRequest(), pinnedOpts()));
        // ES module scripts run in strict mode by default → assigning to a
        // frozen property throws TypeError.
        expect(() => {
            (success as unknown as { ok: boolean }).ok = false;
        }).toThrow(TypeError);
    });

    it('attempting to mutate the frozen stages map throws in strict mode', () => {
        const success = expectSuccess(runFamilyPipeline(minimalRequest(), pinnedOpts()));
        expect(() => {
            (success.stages as unknown as { definition: unknown }).definition = null;
        }).toThrow(TypeError);
    });
});

// ── Option-type ergonomics ─────────────────────────────────────────────────

describe('RunFamilyPipelineOptions', () => {
    it('is a structural type usable for option assembly', () => {
        const opts: RunFamilyPipelineOptions = {
            ingest:             { fromRequestOpts: { ingestedAt: INGEST_TS }, safe: true },
            decompose:          { decomposedAt: DECOMPOSE_TS, primaryPrimitiveId: 'p0' },
            synthesiseGeometry: { synthesisedAt: GEOMETRY_TS },
            synthesiseSchemas:  { synthesisedAt: SCHEMAS_TS },
            assemble:           { origin: 'plugin', category: 'workstations' },
        };
        const outcome = runFamilyPipeline(minimalRequest(), opts);
        const success = expectSuccess(outcome);
        expect(success.registered.origin).toBe('plugin');
        expect(success.registered.category).toBe('workstations');
        expect(success.stages.definition.derived.ingestedAt).toBe(INGEST_TS);
        expect(success.stages.parametric.decomposedAt).toBe(DECOMPOSE_TS);
        expect(success.stages.geometry.synthesisedAt).toBe(GEOMETRY_TS);
        expect(success.stages.schemas.synthesisedAt).toBe(SCHEMAS_TS);
    });
});
