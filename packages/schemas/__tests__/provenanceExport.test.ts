// A.31.b — ProvenanceExport schema tests.
//
// Pins the C23 §2.5 invariants:
//   - count fields agree with array lengths
//   - artefactsFrom ≤ artefactsTo
//   - every artefact + edge in the bundle belongs to the export's projectId

import { describe, expect, it } from 'vitest';
import {
    ProvenanceExportSchema,
    ProvenanceExportFormatSchema,
    type ProvenanceExport,
} from '../src/provenance/ProvenanceExport.js';
import type {
    AIArtefact,
    ProvenanceEdge,
} from '../src/provenance/index.js';

const SHA64 = '0'.repeat(64);
const AIA_ID = 'aia_12345678-1234-1234-1234-123456789012';
const AIA_OTHER_ID = 'aia_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PE_ID = 'pe_12345678-1234-1234-1234-123456789012';
const CS_ID = 'cs_12345678-1234-1234-1234-123456789012';
const SESSION = '550e8400-e29b-41d4-a716-446655440000';

function artefact(projectId = 'prj_atelier', id = AIA_ID): AIArtefact {
    return {
        id,
        idempotencyKey: SHA64,
        timestamp: '2026-06-02T12:00:00.000Z',
        sessionId: SESSION,
        userId: 'usr_alice',
        projectId,
        model: 'claude-haiku-4-5-20251014',
        workflowKind: 'apartment-layout-generate',
        workflowVersion: 'apartment-layout-v3.2',
        promptSha: SHA64,
        promptPreviewRedacted: '…',
        contextHash: SHA64,
        contextSnapshotId: CS_ID,
        redactionRecordId: null,
        inputTokens: 100,
        outputTokens: 100,
        costUsd: 0.001,
        durationMs: 1000,
        cacheStatus: 'miss',
        reproducibility: 'non-deterministic',
        seed: null,
        approvalStatus: 'auto-applied',
        parentArtefactIds: [],
        producedElementIds: [],
        outputSemanticFingerprint: null,
        outputClusterId: null,
    } as AIArtefact;
}

function edge(projectId = 'prj_atelier'): ProvenanceEdge {
    return {
        id: PE_ID,
        fromArtefactId: AIA_ID,
        toArtefactId: null,
        toElementId: 'el_wall_42',
        edgeKind: 'artefact-to-element',
        createdAt: '2026-06-02T12:01:00.000Z',
        projectId,
    } as ProvenanceEdge;
}

function baseExport(overrides: Partial<ProvenanceExport> = {}): ProvenanceExport {
    return {
        exportArtefactId: AIA_OTHER_ID,
        projectId: 'prj_atelier',
        requestedByUserId: 'usr_alice',
        requestedAt: '2026-06-02T13:00:00.000Z',
        format: 'json',
        artefacts: [artefact()],
        edges: [edge()],
        contextSnapshots: [],
        redactionRecords: [],
        artefactsFrom: '2026-06-01T00:00:00.000Z',
        artefactsTo: '2026-06-02T23:59:59.999Z',
        totalArtefacts: 1,
        totalEdges: 1,
        pryzmSignatureEd25519: 'base64-signature-here',
        pryzmSigningKeyId: 'pryzm-prod-2026-01',
        ...overrides,
    } as ProvenanceExport;
}

describe('ProvenanceExportFormatSchema', () => {
    it('accepts json + pdf', () => {
        expect(ProvenanceExportFormatSchema.options).toEqual(['pdf', 'json']);
    });
});

describe('ProvenanceExportSchema — happy path', () => {
    it('accepts a well-formed json export', () => {
        expect(() => ProvenanceExportSchema.parse(baseExport())).not.toThrow();
    });

    it('accepts a pdf format export', () => {
        expect(() =>
            ProvenanceExportSchema.parse(baseExport({ format: 'pdf' })),
        ).not.toThrow();
    });

    it('accepts an empty bundle (zero artefacts, zero edges)', () => {
        const empty = baseExport({
            artefacts: [],
            edges: [],
            totalArtefacts: 0,
            totalEdges: 0,
        });
        expect(() => ProvenanceExportSchema.parse(empty)).not.toThrow();
    });
});

describe('ProvenanceExportSchema — count + window invariants', () => {
    it('rejects totalArtefacts mismatch with artefacts.length', () => {
        const bad = baseExport({ totalArtefacts: 99 });
        expect(() => ProvenanceExportSchema.parse(bad)).toThrow(/totalArtefacts/);
    });

    it('rejects totalEdges mismatch with edges.length', () => {
        const bad = baseExport({ totalEdges: 99 });
        expect(() => ProvenanceExportSchema.parse(bad)).toThrow(/totalEdges/);
    });

    it('rejects artefactsFrom > artefactsTo (inverted window)', () => {
        const bad = baseExport({
            artefactsFrom: '2026-06-02T23:59:59.999Z',
            artefactsTo: '2026-06-01T00:00:00.000Z',
        });
        expect(() => ProvenanceExportSchema.parse(bad)).toThrow(/artefactsFrom/);
    });

    it('accepts artefactsFrom == artefactsTo (single instant)', () => {
        const ok = baseExport({
            artefactsFrom: '2026-06-02T12:00:00.000Z',
            artefactsTo: '2026-06-02T12:00:00.000Z',
        });
        expect(() => ProvenanceExportSchema.parse(ok)).not.toThrow();
    });
});

describe('ProvenanceExportSchema — RLS scope', () => {
    it('rejects when an artefact belongs to a different project', () => {
        const bad = baseExport({
            artefacts: [artefact('prj_other')],
        });
        expect(() => ProvenanceExportSchema.parse(bad)).toThrow(/RLS/);
    });

    it('rejects when an edge belongs to a different project', () => {
        const bad = baseExport({
            edges: [edge('prj_other')],
        });
        expect(() => ProvenanceExportSchema.parse(bad)).toThrow(/RLS/);
    });

    it('accepts when every artefact + edge matches the export project', () => {
        const ok = baseExport({
            artefacts: [
                artefact('prj_atelier', AIA_ID),
                artefact(
                    'prj_atelier',
                    'aia_bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
                ),
            ],
            edges: [edge('prj_atelier')],
            totalArtefacts: 2,
            totalEdges: 1,
        });
        expect(() => ProvenanceExportSchema.parse(ok)).not.toThrow();
    });
});

describe('ProvenanceExportSchema — id + signature shape', () => {
    it('rejects exportArtefactId missing the aia_ prefix', () => {
        const bad = baseExport({
            exportArtefactId: 'export_123' as unknown as `aia_${string}`,
        });
        expect(() => ProvenanceExportSchema.parse(bad)).toThrow();
    });

    it('rejects pryzmSigningKeyId with invalid characters', () => {
        const bad = baseExport({ pryzmSigningKeyId: 'invalid key id!' });
        expect(() => ProvenanceExportSchema.parse(bad)).toThrow();
    });

    it('rejects empty signature', () => {
        const bad = baseExport({ pryzmSignatureEd25519: '' });
        expect(() => ProvenanceExportSchema.parse(bad)).toThrow();
    });

    it('rejects an invalid format', () => {
        const bad = { ...baseExport(), format: 'csv' as unknown as 'json' };
        expect(() => ProvenanceExportSchema.parse(bad)).toThrow();
    });
});
