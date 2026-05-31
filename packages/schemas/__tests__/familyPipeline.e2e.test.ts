// P0.5 (Family Platform) — end-to-end pipeline integration test.
//
// Exercises ALL 6 transformer functions (Stages 1→5) as a chain, on realistic
// FamilyRequest JSON fixtures.  Documents the pipeline contract end-to-end
// AND catches regressions if any single stage's contract drifts.
//
// Pipeline chain (per APARTMENT-FAMILY-PLATFORM-AND-USER-DEFINED-ELEMENTS-2026-05-30.md §4):
//
//   unknown JSON
//     ─[Stage 1 ingestFromJson]→         FamilyDefinition
//     ─[Stage 2 decomposeFamily]→        ParametricFamily
//     ─[Stage 3 synthesiseGeometry]→     GeneratedGeometry
//     ─[Stage 4 synthesiseSchemas]→      GeneratedSchemas
//     ─[Stage 5 assembleRegisteredFamily]→ RegisteredFamily
//
// Parallel-safe: does NOT depend on the `runFamilyPipeline` orchestrator
// (shipped in a sister slice) — calls each transformer DIRECTLY in sequence
// to verify the public-surface contract is coherent.
//
// L0 / P5 pure: only Vitest + the 5 transformer imports + the 5 schema
// imports.  No `@pryzm/*` imports outside `@pryzm/schemas`.

/// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { ingestFromJson, isIngestionSuccess } from '../src/family-definition/index.js';
import { decomposeFamily } from '../src/family-parametric/index.js';
import { synthesiseGeometry } from '../src/family-geometry/index.js';
import { synthesiseSchemas } from '../src/family-schemas/index.js';
import { assembleRegisteredFamily } from '../src/family-registry/index.js';

import { FamilyDefinitionSchema } from '../src/family-definition/index.js';
import { ParametricFamilySchema } from '../src/family-parametric/index.js';
import { GeneratedGeometrySchema } from '../src/family-geometry/index.js';
import { GeneratedSchemasSchema } from '../src/family-schemas/index.js';
import { RegisteredFamilySchema } from '../src/family-registry/index.js';

// ── Fixtures ───────────────────────────────────────────────────────────────

/** Pinned ISO timestamp so every stage emits identical, deterministic output. */
const PINNED_TIMESTAMP = '2026-05-31T12:00:00Z';

/** A realistic FamilyRequest JSON for a desk family (parametric width). */
const DESK_REQUEST: unknown = {
    identity: {
        id:      'family/com.pryzm.test/desk-e2e',
        name:    'Desk (E2E)',
        version: '1.0.0',
        author:  'PRYZM-Test',
        license: 'MIT',
    },
    documentation: { pdfs: [], specSheets: [], referenceImages: [] },
    geometry: {
        dimensions: { widthM: 1.5, depthM: 0.75, heightM: 0.72 },
        parametricRanges: [
            { name: 'width', unit: 'm', min: 1.0, max: 2.2, defaultValue: 1.5 },
        ],
        hostedRelationship: { hostKind: 'none' },
    },
    behaviour:   { movable: true, hosted: false, mountClass: 'floor' },
    constraints: { excludeWallTypes: [] },
    placement: {
        defaultAnchor:  'wall-longest',
        allowedAnchors: ['wall-longest'],
        excludedWalls:  [],
    },
    bim: {
        entityType:     'IfcFurniture',
        predefinedType: 'DESK',
        psets:          ['Pset_FurnitureTypeCommon'],
    },
    ai: {
        semanticNames:  ['desk', 'workstation', 'office desk'],
        synonyms:       [],
        cuesForPrompts: [],
    },
};

/** A realistic FamilyRequest JSON for a sofa family (no parametric ranges). */
const SOFA_REQUEST: unknown = {
    identity: {
        id:      'family/com.pryzm.test/sofa-e2e',
        name:    'Sofa (E2E)',
        version: '1.0.0',
        author:  'PRYZM-Test',
        license: 'MIT',
    },
    documentation: { pdfs: [], specSheets: [], referenceImages: [] },
    geometry: {
        dimensions:       { widthM: 2.2, depthM: 0.9, heightM: 0.85 },
        parametricRanges: [],
        hostedRelationship: { hostKind: 'none' },
    },
    behaviour:   { movable: true, hosted: false, mountClass: 'floor' },
    constraints: { excludeWallTypes: [] },
    placement: {
        defaultAnchor:  'wall-longest',
        allowedAnchors: ['wall-longest'],
        excludedWalls:  [],
    },
    bim: {
        entityType:     'IfcFurniture',
        predefinedType: 'SOFA',
        psets:          ['Pset_FurnitureTypeCommon'],
    },
    ai: {
        semanticNames:  ['sofa', 'couch', 'living room sofa'],
        synonyms:       [],
        cuesForPrompts: [],
    },
};

// ── Helper: drive all 5 transformers in sequence ───────────────────────────

/**
 * Successful pipeline outcome — each stage's typed output is surfaced for
 * targeted assertions.
 */
type PipelineSuccess = {
    readonly ok: true;
    readonly definition: ReturnType<typeof decomposeFamily> extends infer _ ? import('../src/family-definition/index.js').FamilyDefinition : never;
    readonly parametric: ReturnType<typeof decomposeFamily>;
    readonly geometry:   ReturnType<typeof synthesiseGeometry>;
    readonly schemas:    ReturnType<typeof synthesiseSchemas>;
    readonly registered: ReturnType<typeof assembleRegisteredFamily>;
};

/** Failure branch: the Stage-1 ingestion outcome propagates verbatim. */
type PipelineFailure = ReturnType<typeof ingestFromJson> & { ok: false };

type PipelineOutcome = PipelineSuccess | PipelineFailure;

/** Run all 5 transformers in sequence with pinned timestamps. */
function runPipelineDirect(raw: unknown): PipelineOutcome {
    const ingestion = ingestFromJson(raw, {
        fromRequestOpts: { ingestedAt: PINNED_TIMESTAMP },
    });
    if (!isIngestionSuccess(ingestion)) {
        return ingestion as PipelineFailure;
    }

    const definition = ingestion.definition;
    const parametric = decomposeFamily(definition, { decomposedAt: PINNED_TIMESTAMP });
    const geometry   = synthesiseGeometry(parametric, { synthesisedAt: PINNED_TIMESTAMP });
    const schemas    = synthesiseSchemas(parametric, geometry, { synthesisedAt: PINNED_TIMESTAMP });
    const registered = assembleRegisteredFamily(definition, parametric, geometry, schemas);

    return { ok: true, definition, parametric, geometry, schemas, registered };
}

/** Narrow helper: asserts the outcome is a success and returns it. */
function expectSuccess(outcome: PipelineOutcome): PipelineSuccess {
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
        throw new Error('pipeline outcome was not a success');
    }
    return outcome;
}

// ── 1. End-to-end pipeline integration (desk fixture) ──────────────────────

describe('Family Platform pipeline — end-to-end integration', () => {
    // 1. Identity coherence -------------------------------------------------

    it('desk pipeline: all 5 stage outputs share the same identity.id', () => {
        const s = expectSuccess(runPipelineDirect(DESK_REQUEST));
        const id = 'family/com.pryzm.test/desk-e2e';
        expect(s.definition.identity.id).toBe(id);
        expect(s.parametric.identity.id).toBe(id);
        expect(s.geometry.identity.id).toBe(id);
        expect(s.schemas.identity.id).toBe(id);
        expect(s.registered.identity.id).toBe(id);
    });

    it('sofa pipeline: all 5 stage outputs share the same identity.id', () => {
        const s = expectSuccess(runPipelineDirect(SOFA_REQUEST));
        const id = 'family/com.pryzm.test/sofa-e2e';
        expect(s.definition.identity.id).toBe(id);
        expect(s.parametric.identity.id).toBe(id);
        expect(s.geometry.identity.id).toBe(id);
        expect(s.schemas.identity.id).toBe(id);
        expect(s.registered.identity.id).toBe(id);
    });

    // 2. Each stage output round-trips through its schema -------------------

    it('desk: FamilyDefinitionSchema.parse(stages.definition) succeeds', () => {
        const s = expectSuccess(runPipelineDirect(DESK_REQUEST));
        expect(() => FamilyDefinitionSchema.parse(s.definition)).not.toThrow();
    });

    it('desk: ParametricFamilySchema.parse(stages.parametric) succeeds', () => {
        const s = expectSuccess(runPipelineDirect(DESK_REQUEST));
        expect(() => ParametricFamilySchema.parse(s.parametric)).not.toThrow();
    });

    it('desk: GeneratedGeometrySchema.parse(stages.geometry) succeeds', () => {
        const s = expectSuccess(runPipelineDirect(DESK_REQUEST));
        expect(() => GeneratedGeometrySchema.parse(s.geometry)).not.toThrow();
    });

    it('desk: GeneratedSchemasSchema.parse(stages.schemas) succeeds', () => {
        const s = expectSuccess(runPipelineDirect(DESK_REQUEST));
        expect(() => GeneratedSchemasSchema.parse(s.schemas)).not.toThrow();
    });

    it('desk: RegisteredFamilySchema.parse(stages.registered) succeeds', () => {
        const s = expectSuccess(runPipelineDirect(DESK_REQUEST));
        expect(() => RegisteredFamilySchema.parse(s.registered)).not.toThrow();
    });

    // 3. Hash chain coherence ----------------------------------------------
    //    (Stage-4 hashes embed Stage-2's identity, Stage-5 embeds all three.)

    it('schemasHash contains the family identity id (shared cache-key root)', () => {
        const s = expectSuccess(runPipelineDirect(DESK_REQUEST));
        expect(s.schemas.schemasHash).toContain(s.definition.identity.id);
    });

    it('registered.schemaHash contains all three pipeline hashes', () => {
        const s = expectSuccess(runPipelineDirect(DESK_REQUEST));
        expect(s.registered.schemaHash).toContain(s.parametric.parametricHash);
        expect(s.registered.schemaHash).toContain(s.geometry.geometryHash);
        expect(s.registered.schemaHash).toContain(s.schemas.schemasHash);
    });

    // 4. Pipeline data flow -------------------------------------------------

    it('desk: parametric.parameters has a width entry (matches the input range)', () => {
        const s = expectSuccess(runPipelineDirect(DESK_REQUEST));
        expect(s.parametric.parameters).toHaveProperty('width');
        expect(s.parametric.parameters.width.range.defaultValue).toBe(1.5);
        expect(s.parametric.parameters.width.range.min).toBe(1.0);
        expect(s.parametric.parameters.width.range.max).toBe(2.2);
    });

    it('desk: geometry.builder.exportName === "buildBox"', () => {
        const s = expectSuccess(runPipelineDirect(DESK_REQUEST));
        expect(s.geometry.builder.exportName).toBe('buildBox');
        expect(s.geometry.builder.kind).toBe('parametric');
    });

    it('desk: geometry.footprint.lengthM === 1.5 (max of width 1.5, depth 0.75)', () => {
        const s = expectSuccess(runPipelineDirect(DESK_REQUEST));
        expect(s.geometry.footprint.lengthM).toBe(1.5);
        expect(s.geometry.footprint.depthM).toBe(0.75);
    });

    it('desk: schemas.instanceSchema.parameters has a "width" entry', () => {
        const s = expectSuccess(runPipelineDirect(DESK_REQUEST));
        const widthParam = s.schemas.instanceSchema.parameters.find((p) => p.name === 'width');
        expect(widthParam).toBeDefined();
        expect(widthParam?.kind).toBe('number');
        expect(widthParam?.userEditable).toBe(true);
    });

    it('desk: registered.mountClass === "floor"', () => {
        const s = expectSuccess(runPipelineDirect(DESK_REQUEST));
        expect(s.registered.mountClass).toBe('floor');
    });

    it('desk: registered.ifcMapping.predefinedType === "DESK"', () => {
        const s = expectSuccess(runPipelineDirect(DESK_REQUEST));
        expect(s.registered.ifcMapping.predefinedType).toBe('DESK');
        expect(s.registered.ifcMapping.entityType).toBe('IfcFurniture');
    });

    // 5. Determinism -------------------------------------------------------

    it('desk: same input twice → same registered.schemaHash', () => {
        const a = expectSuccess(runPipelineDirect(DESK_REQUEST));
        const b = expectSuccess(runPipelineDirect(DESK_REQUEST));
        expect(a.registered.schemaHash).toBe(b.registered.schemaHash);
        // Defence in depth: every intermediate hash is stable too.
        expect(a.parametric.parametricHash).toBe(b.parametric.parametricHash);
        expect(a.geometry.geometryHash).toBe(b.geometry.geometryHash);
        expect(a.schemas.schemasHash).toBe(b.schemas.schemasHash);
    });

    it('desk and sofa produce DIFFERENT schemaHashes (different ids)', () => {
        const desk = expectSuccess(runPipelineDirect(DESK_REQUEST));
        const sofa = expectSuccess(runPipelineDirect(SOFA_REQUEST));
        expect(desk.registered.schemaHash).not.toBe(sofa.registered.schemaHash);
    });

    // 6. Failure mode ------------------------------------------------------

    it('invalid raw JSON → ingestion failure surfaced, no further stages run', () => {
        const outcome = runPipelineDirect({ not: 'a-family-request' });
        expect(outcome.ok).toBe(false);
        if (!outcome.ok) {
            expect(outcome.issues.length).toBeGreaterThan(0);
            expect(outcome.message).toContain('FamilyRequest validation failed');
        }
    });

    it('partial input (missing identity) → ingestion failure with relevant issues', () => {
        // Strip identity from the otherwise-valid desk request.
        const { identity: _identity, ...partial } = DESK_REQUEST as Record<string, unknown>;
        const outcome = runPipelineDirect(partial);
        expect(outcome.ok).toBe(false);
        if (!outcome.ok) {
            const hasIdentityIssue = outcome.issues.some((issue) =>
                issue.path.some((segment) => segment === 'identity'),
            );
            expect(hasIdentityIssue).toBe(true);
        }
    });

    // 7. Pinned timestamps propagate end-to-end ----------------------------

    it('pinned timestamps propagate to each stage output', () => {
        const s = expectSuccess(runPipelineDirect(DESK_REQUEST));
        expect(s.definition.derived.ingestedAt).toBe(PINNED_TIMESTAMP);
        expect(s.parametric.decomposedAt).toBe(PINNED_TIMESTAMP);
        expect(s.geometry.synthesisedAt).toBe(PINNED_TIMESTAMP);
        expect(s.schemas.synthesisedAt).toBe(PINNED_TIMESTAMP);
        // Stage-5 (registered) does NOT carry its own timestamp by design —
        // it surfaces the upstream `schemaHash` instead.  Asserting the
        // absence here documents that intent + catches a regression if a
        // future slice adds a `registeredAt` without contract review.
        expect((s.registered as unknown as Record<string, unknown>).registeredAt).toBeUndefined();
    });
});

// ── 2. Sofa fixture — no parametric ranges, distinct semantics ─────────────

describe('Family Platform pipeline — sofa fixture', () => {
    it('sofa pipeline runs end-to-end', () => {
        const s = expectSuccess(runPipelineDirect(SOFA_REQUEST));
        // All five outputs round-trip through their schemas.
        expect(() => FamilyDefinitionSchema.parse(s.definition)).not.toThrow();
        expect(() => ParametricFamilySchema.parse(s.parametric)).not.toThrow();
        expect(() => GeneratedGeometrySchema.parse(s.geometry)).not.toThrow();
        expect(() => GeneratedSchemasSchema.parse(s.schemas)).not.toThrow();
        expect(() => RegisteredFamilySchema.parse(s.registered)).not.toThrow();
    });

    it('sofa: registered.tags include "sofa" + "floor"', () => {
        const s = expectSuccess(runPipelineDirect(SOFA_REQUEST));
        expect(s.registered.tags).toContain('sofa');
        expect(s.registered.tags).toContain('floor');
    });

    it('sofa: parametric.primitives[0].kind === "box"', () => {
        const s = expectSuccess(runPipelineDirect(SOFA_REQUEST));
        expect(s.parametric.primitives.length).toBeGreaterThanOrEqual(1);
        expect(s.parametric.primitives[0]!.kind).toBe('box');
    });

    it('sofa: footprint.lengthM === 2.2 (max of width, depth)', () => {
        const s = expectSuccess(runPipelineDirect(SOFA_REQUEST));
        expect(s.geometry.footprint.lengthM).toBe(2.2);
        expect(s.geometry.footprint.depthM).toBe(0.9);
    });

    it('sofa: parametric.parameters is empty (no parametricRanges)', () => {
        const s = expectSuccess(runPipelineDirect(SOFA_REQUEST));
        expect(Object.keys(s.parametric.parameters)).toHaveLength(0);
        // The instance schema therefore carries zero user-editable parameters.
        expect(s.schemas.instanceSchema.parameters).toHaveLength(0);
    });
});
