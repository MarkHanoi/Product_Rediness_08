// A.31.a — L0 C23 Provenance schema tests.
//
// Pins the §2 invariants: id-shape regexes, the deterministic↔seed
// coupling (§1.4), and the exactly-one-target invariant on ProvenanceEdge.

import { describe, expect, it } from 'vitest';
import {
    AIArtefactSchema,
    ApprovalStatusSchema,
    ReproducibilitySchema,
    CacheStatusSchema,
} from '../src/provenance/AIArtefact.js';
import {
    ProvenanceEdgeSchema,
    EdgeKindSchema,
} from '../src/provenance/ProvenanceEdge.js';
import {
    ContextSnapshotSchema,
    ActiveViewKindSchema,
} from '../src/provenance/ContextSnapshot.js';
import {
    RedactionRecordSchema,
    PiiCategorySchema,
    RedactorConfidenceSchema,
} from '../src/provenance/RedactionRecord.js';

// ── Fixtures ────────────────────────────────────────────────────────────

const SHA64 = '0'.repeat(64);
const AIA_ID = 'aia_12345678-1234-1234-1234-123456789012';
const AIA_PARENT_ID = 'aia_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CS_ID = 'cs_12345678-1234-1234-1234-123456789012';
const PE_ID = 'pe_12345678-1234-1234-1234-123456789012';
const RR_ID = 'rr_12345678-1234-1234-1234-123456789012';
const OC_ID = 'oc_12345678-1234-1234-1234-123456789012';
const SESSION_ID = '550e8400-e29b-41d4-a716-446655440000';

function baseArtefact(): unknown {
    return {
        id: AIA_ID,
        idempotencyKey: SHA64,
        timestamp: '2026-06-02T12:00:00.000Z',
        sessionId: SESSION_ID,
        userId: 'usr_alice',
        projectId: 'prj_atelier',
        model: 'claude-haiku-4-5-20251014',
        workflowKind: 'apartment-layout-generate',
        workflowVersion: 'apartment-layout-v3.2',
        promptSha: SHA64,
        promptPreviewRedacted: 'Generate an apartment layout for a 65 m² shell …',
        contextHash: SHA64,
        contextSnapshotId: CS_ID,
        redactionRecordId: null,
        inputTokens: 1200,
        outputTokens: 800,
        costUsd: 0.012,
        durationMs: 4200,
        cacheStatus: 'miss',
        reproducibility: 'non-deterministic',
        seed: null,
        approvalStatus: 'pending',
        parentArtefactIds: [],
        producedElementIds: [],
        outputSemanticFingerprint: null,
        outputClusterId: null,
    };
}

// ── Enums ──────────────────────────────────────────────────────────────

describe('Enums', () => {
    it('ApprovalStatusSchema covers the 5 statuses', () => {
        expect(ApprovalStatusSchema.options).toEqual([
            'auto-applied',
            'user-approved',
            'user-rejected',
            'pending',
            'never-applied',
        ]);
    });

    it('ReproducibilitySchema is binary', () => {
        expect(ReproducibilitySchema.options).toEqual([
            'deterministic',
            'non-deterministic',
        ]);
    });

    it('CacheStatusSchema covers the 3 cache outcomes', () => {
        expect(CacheStatusSchema.options).toEqual(['miss', 'hit', 'bypass']);
    });

    it('EdgeKindSchema covers the 4 edge kinds', () => {
        expect(EdgeKindSchema.options).toEqual([
            'artefact-to-element',
            'artefact-to-artefact',
            'cache-derived-from',
            'fallback-from',
        ]);
    });

    it('ActiveViewKindSchema covers the 5 view kinds', () => {
        expect(ActiveViewKindSchema.options).toEqual([
            'plan',
            '3d',
            'elevation',
            'section',
            'sheet',
        ]);
    });

    it('PiiCategorySchema covers the 7 categories', () => {
        expect(PiiCategorySchema.options.length).toBe(7);
        expect(PiiCategorySchema.options).toContain('email');
        expect(PiiCategorySchema.options).toContain('government-id');
    });

    it('RedactorConfidenceSchema is 3-valued', () => {
        expect(RedactorConfidenceSchema.options).toEqual(['high', 'medium', 'low']);
    });
});

// ── AIArtefact ─────────────────────────────────────────────────────────

describe('AIArtefactSchema', () => {
    it('accepts a fully-populated non-deterministic artefact', () => {
        expect(() => AIArtefactSchema.parse(baseArtefact())).not.toThrow();
    });

    it('rejects an id missing the aia_ prefix', () => {
        const bad = { ...(baseArtefact() as object), id: 'foo_bar' };
        expect(() => AIArtefactSchema.parse(bad)).toThrow();
    });

    it('rejects timestamps with a timezone offset (per §1.2 UTC-only)', () => {
        const bad = {
            ...(baseArtefact() as object),
            timestamp: '2026-06-02T12:00:00.000+02:00' as unknown as string,
        };
        expect(() => AIArtefactSchema.parse(bad)).toThrow();
    });

    it('§1.4 — deterministic reproducibility requires non-null seed', () => {
        const bad = {
            ...(baseArtefact() as object),
            reproducibility: 'deterministic',
            seed: null,
        };
        expect(() => AIArtefactSchema.parse(bad)).toThrow(/seed/i);
    });

    it('§1.4 — non-deterministic reproducibility requires null seed', () => {
        const bad = {
            ...(baseArtefact() as object),
            reproducibility: 'non-deterministic',
            seed: 12345,
        };
        expect(() => AIArtefactSchema.parse(bad)).toThrow(/seed/i);
    });

    it('accepts deterministic offline-engine artefact with a seed', () => {
        const good = {
            ...(baseArtefact() as object),
            reproducibility: 'deterministic',
            seed: 0xc0ffee,
            workflowKind: 'apartment-layout-d-tgl',
            workflowVersion: 'd-tgl-v1.0',
        };
        expect(() => AIArtefactSchema.parse(good)).not.toThrow();
    });

    it('rejects a workflowVersion missing the -vN.M format', () => {
        const bad = {
            ...(baseArtefact() as object),
            workflowVersion: 'apartment-layout-3.2',
        };
        expect(() => AIArtefactSchema.parse(bad)).toThrow();
    });

    it('rejects promptSha that is not 64 chars', () => {
        const bad = { ...(baseArtefact() as object), promptSha: '0'.repeat(63) };
        expect(() => AIArtefactSchema.parse(bad)).toThrow();
    });

    it('accepts non-null outputSemanticFingerprint + outputClusterId', () => {
        const good = {
            ...(baseArtefact() as object),
            outputSemanticFingerprint: SHA64,
            outputClusterId: OC_ID,
        };
        expect(() => AIArtefactSchema.parse(good)).not.toThrow();
    });

    it('accepts parent artefact ids', () => {
        const good = {
            ...(baseArtefact() as object),
            parentArtefactIds: [AIA_PARENT_ID],
        };
        expect(() => AIArtefactSchema.parse(good)).not.toThrow();
    });

    it('rejects parent ids without the aia_ prefix', () => {
        const bad = {
            ...(baseArtefact() as object),
            parentArtefactIds: ['parent_123'],
        };
        expect(() => AIArtefactSchema.parse(bad)).toThrow();
    });

    it('accepts an optional surface field', () => {
        const good = {
            ...(baseArtefact() as object),
            surface: '/v1/ai/query',
        };
        const parsed = AIArtefactSchema.parse(good);
        expect((parsed as { surface?: string }).surface).toBe('/v1/ai/query');
    });
});

// ── ProvenanceEdge ─────────────────────────────────────────────────────

describe('ProvenanceEdgeSchema', () => {
    it('accepts artefact-to-element with toElementId set', () => {
        const good = {
            id: PE_ID,
            fromArtefactId: AIA_ID,
            toArtefactId: null,
            toElementId: 'el_wall_42',
            edgeKind: 'artefact-to-element',
            createdAt: '2026-06-02T12:00:00.000Z',
            projectId: 'prj_atelier',
        };
        expect(() => ProvenanceEdgeSchema.parse(good)).not.toThrow();
    });

    it('accepts artefact-to-artefact with toArtefactId set', () => {
        const good = {
            id: PE_ID,
            fromArtefactId: AIA_ID,
            toArtefactId: AIA_PARENT_ID,
            toElementId: null,
            edgeKind: 'artefact-to-artefact',
            createdAt: '2026-06-02T12:00:00.000Z',
            projectId: 'prj_atelier',
        };
        expect(() => ProvenanceEdgeSchema.parse(good)).not.toThrow();
    });

    it('rejects edges with BOTH target fields set', () => {
        const bad = {
            id: PE_ID,
            fromArtefactId: AIA_ID,
            toArtefactId: AIA_PARENT_ID,
            toElementId: 'el_wall_42',
            edgeKind: 'artefact-to-element',
            createdAt: '2026-06-02T12:00:00.000Z',
            projectId: 'prj_atelier',
        };
        expect(() => ProvenanceEdgeSchema.parse(bad)).toThrow(/exactly one/);
    });

    it('rejects edges with NEITHER target field set', () => {
        const bad = {
            id: PE_ID,
            fromArtefactId: AIA_ID,
            toArtefactId: null,
            toElementId: null,
            edgeKind: 'artefact-to-element',
            createdAt: '2026-06-02T12:00:00.000Z',
            projectId: 'prj_atelier',
        };
        expect(() => ProvenanceEdgeSchema.parse(bad)).toThrow();
    });

    it('rejects artefact-to-element without toElementId', () => {
        const bad = {
            id: PE_ID,
            fromArtefactId: AIA_ID,
            toArtefactId: AIA_PARENT_ID,
            toElementId: null,
            edgeKind: 'artefact-to-element',
            createdAt: '2026-06-02T12:00:00.000Z',
            projectId: 'prj_atelier',
        };
        expect(() => ProvenanceEdgeSchema.parse(bad)).toThrow();
    });

    it('rejects cache-derived-from without toArtefactId', () => {
        const bad = {
            id: PE_ID,
            fromArtefactId: AIA_ID,
            toArtefactId: null,
            toElementId: 'el_wall_42',
            edgeKind: 'cache-derived-from',
            createdAt: '2026-06-02T12:00:00.000Z',
            projectId: 'prj_atelier',
        };
        expect(() => ProvenanceEdgeSchema.parse(bad)).toThrow();
    });

    it('rejects id missing the pe_ prefix', () => {
        const bad = {
            id: 'edge_123',
            fromArtefactId: AIA_ID,
            toArtefactId: null,
            toElementId: 'el_wall_42',
            edgeKind: 'artefact-to-element',
            createdAt: '2026-06-02T12:00:00.000Z',
            projectId: 'prj_atelier',
        };
        expect(() => ProvenanceEdgeSchema.parse(bad)).toThrow();
    });
});

// ── ContextSnapshot ────────────────────────────────────────────────────

describe('ContextSnapshotSchema', () => {
    function baseSnapshot(): unknown {
        return {
            id: CS_ID,
            contextHash: SHA64,
            projectId: 'prj_atelier',
            takenAt: '2026-06-02T12:00:00.000Z',
            systemPromptVersion: 'apartment-layout-system-v3.2',
            selectedElementIds: [],
            activeLevelId: 'L0',
            activeViewKind: 'plan',
            projectStateSha: SHA64,
            toolsAvailable: ['createWall', 'createDoor'],
            planTier: 'studio',
            featureFlags: { 'experimental-d-fle': true },
        };
    }

    it('accepts a fully-populated snapshot', () => {
        expect(() => ContextSnapshotSchema.parse(baseSnapshot())).not.toThrow();
    });

    it('accepts null activeLevelId + activeViewKind', () => {
        const good = {
            ...(baseSnapshot() as object),
            activeLevelId: null,
            activeViewKind: null,
        };
        expect(() => ContextSnapshotSchema.parse(good)).not.toThrow();
    });

    it('rejects an invalid activeViewKind', () => {
        const bad = { ...(baseSnapshot() as object), activeViewKind: 'isometric' };
        expect(() => ContextSnapshotSchema.parse(bad)).toThrow();
    });

    it('rejects a projectStateSha that is not 64 chars', () => {
        const bad = { ...(baseSnapshot() as object), projectStateSha: 'abc' };
        expect(() => ContextSnapshotSchema.parse(bad)).toThrow();
    });

    it('featureFlags is optional', () => {
        const good = {
            id: CS_ID,
            contextHash: SHA64,
            projectId: 'prj_atelier',
            takenAt: '2026-06-02T12:00:00.000Z',
            systemPromptVersion: 'v',
            selectedElementIds: [],
            activeLevelId: null,
            activeViewKind: null,
            projectStateSha: SHA64,
            toolsAvailable: [],
            planTier: 'solo',
        };
        expect(() => ContextSnapshotSchema.parse(good)).not.toThrow();
    });
});

// ── RedactionRecord ────────────────────────────────────────────────────

describe('RedactionRecordSchema', () => {
    function baseRedaction(): unknown {
        return {
            id: RR_ID,
            artefactId: AIA_ID,
            redactorVersion: '0.3.1',
            redactedAt: '2026-06-02T12:00:00.000Z',
            redactionsByCategory: { email: 2, phone: 1 },
            totalTokensRedacted: 3,
            confidence: 'high',
            redactionFailed: false,
        };
    }

    it('accepts a fully-populated record', () => {
        expect(() => RedactionRecordSchema.parse(baseRedaction())).not.toThrow();
    });

    it('rejects per-category sum > totalTokensRedacted', () => {
        const bad = {
            ...(baseRedaction() as object),
            redactionsByCategory: { email: 5, phone: 5 },
            totalTokensRedacted: 3,
        };
        expect(() => RedactionRecordSchema.parse(bad)).toThrow(/sum/);
    });

    it('rejects an invalid category key', () => {
        const bad = {
            ...(baseRedaction() as object),
            redactionsByCategory: { 'social-security': 1 },
        };
        expect(() => RedactionRecordSchema.parse(bad)).toThrow();
    });

    it('accepts redactionFailed: true with zero redactions (fail-closed)', () => {
        const good = {
            ...(baseRedaction() as object),
            redactionsByCategory: {},
            totalTokensRedacted: 0,
            redactionFailed: true,
            confidence: 'low',
        };
        expect(() => RedactionRecordSchema.parse(good)).not.toThrow();
    });

    it('rejects negative counts', () => {
        const bad = {
            ...(baseRedaction() as object),
            redactionsByCategory: { email: -1 },
        };
        expect(() => RedactionRecordSchema.parse(bad)).toThrow();
    });
});
