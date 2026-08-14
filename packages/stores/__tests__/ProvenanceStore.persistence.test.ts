// PV-05 — ProvenanceStore persistence round trip (C70 I-INV-2, C75 §1.4).
//
// The measured defect this file pays: ProvenanceStore had NO serialise
// surface at all — the C23 AI-lineage audit log was destroyed on every
// reload. These tests are the executed evidence that it now survives,
// and the executed evidence that ABSENCE is still absence.
//
// Negative controls (the C74 §3.4 shape today's IFC lane pinned):
//   - a snapshot with NO provenance slice must load as EMPTY with a
//     NAMED reason — it must never ACQUIRE a lineage;
//   - a malformed row must be dropped AND counted — never silently;
//   - an unknown slice version must REFUSE, not partially load.

import { describe, expect, it, beforeEach } from 'vitest';
import {
    ProvenanceStore,
    PROVENANCE_SLICE_VERSION,
    type SerializedProvenance,
} from '../src/ProvenanceStore.js';
import type {
    AIArtefact,
    ProvenanceEdge,
    ContextSnapshot,
    RedactionRecord,
} from '@pryzm/schemas/provenance';

// ── Fixtures (same shapes as ProvenanceStore.test.ts) ───────────────────

const SHA64 = '0'.repeat(64);

function artefact(idSuffix: string, overrides: Partial<AIArtefact> = {}): AIArtefact {
    return {
        id: `aia_${idSuffix.padEnd(36, '0').slice(0, 36)}`,
        idempotencyKey: SHA64,
        timestamp: '2026-06-02T12:00:00.000Z',
        sessionId: '550e8400-e29b-41d4-a716-446655440000',
        userId: 'usr_alice',
        projectId: 'prj_atelier',
        model: 'claude-haiku-4-5-20251014',
        workflowKind: 'apartment-layout-generate',
        workflowVersion: 'apartment-layout-v3.2',
        promptSha: SHA64,
        promptPreviewRedacted: 'Generate …',
        contextHash: SHA64,
        contextSnapshotId: 'cs_12345678-1234-1234-1234-123456789012',
        redactionRecordId: null,
        inputTokens: 1000,
        outputTokens: 800,
        costUsd: 0.01,
        durationMs: 4000,
        cacheStatus: 'miss',
        reproducibility: 'non-deterministic',
        seed: null,
        approvalStatus: 'pending',
        parentArtefactIds: [],
        producedElementIds: [],
        outputSemanticFingerprint: null,
        outputClusterId: null,
        ...overrides,
    } as AIArtefact;
}

function edge(
    idSuffix: string,
    from: string,
    to: { artefact?: string; element?: string },
    overrides: Partial<ProvenanceEdge> = {},
): ProvenanceEdge {
    return {
        id: `pe_${idSuffix.padEnd(36, '0').slice(0, 36)}`,
        fromArtefactId: from,
        toArtefactId: to.artefact ?? null,
        toElementId: to.element ?? null,
        edgeKind: to.artefact ? 'artefact-to-artefact' : 'artefact-to-element',
        createdAt: '2026-06-02T12:01:00.000Z',
        projectId: 'prj_atelier',
        ...overrides,
    } as ProvenanceEdge;
}

function ctxSnapshot(idSuffix: string, contextHash: string): ContextSnapshot {
    return {
        id: `cs_${idSuffix.padEnd(36, '0').slice(0, 36)}`,
        contextHash,
        projectId: 'prj_atelier',
        takenAt: '2026-06-02T12:00:00.000Z',
        systemPromptVersion: 'sys-v1.0',
        selectedElementIds: [],
        activeLevelId: null,
        activeViewKind: null,
        projectStateSha: SHA64,
        toolsAvailable: [],
        planTier: 'studio',
    } as ContextSnapshot;
}

function redaction(idSuffix: string, artefactId: string): RedactionRecord {
    return {
        id: `rr_${idSuffix.padEnd(36, '0').slice(0, 36)}`,
        artefactId,
        redactorVersion: '0.3.1',
        redactedAt: '2026-06-02T12:00:00.000Z',
        redactionsByCategory: { email: 2 },
        totalTokensRedacted: 2,
        confidence: 'high',
        redactionFailed: false,
    } as RedactionRecord;
}

/** A store with a non-trivial lineage: 3 artefacts, a 2-hop DAG, an
 *  element edge, 2 context snapshots, a redaction, a linked element and
 *  an approval transition (both post-write mutations must survive). */
function seed(): ProvenanceStore {
    const s = new ProvenanceStore();
    const a1 = artefact('a1');
    const a2 = artefact('a2', { timestamp: '2026-06-02T12:05:00.000Z' });
    const a3 = artefact('a3', { timestamp: '2026-06-02T12:10:00.000Z' });
    s.addArtefact(a1);
    s.addArtefact(a2);
    s.addArtefact(a3);
    s.addEdge(edge('e1', a1.id, { artefact: a2.id }));
    s.addEdge(edge('e2', a2.id, { artefact: a3.id }, { createdAt: '2026-06-02T12:06:00.000Z' }));
    s.addEdge(edge('e3', a3.id, { element: 'wall_42' }, { createdAt: '2026-06-02T12:11:00.000Z' }));
    s.addOrReuseSnapshot(ctxSnapshot('s1', SHA64));
    s.addOrReuseSnapshot(ctxSnapshot('s2', '1'.repeat(64)));
    s.addRedaction(redaction('r1', a1.id));
    s.linkElement(a3.id, 'wall_42');
    s.updateApprovalStatus(a2.id, 'user-approved');
    return s;
}

// ── The round trip ─────────────────────────────────────────────────────

describe('ProvenanceStore — persistence round trip (PV-05)', () => {
    it('serialise → hydrate → serialise is BYTE-EQUAL', () => {
        const original = seed();
        const written = JSON.stringify(original.serialize());

        // The reload: a brand-new store, as a page refresh produces.
        const reloaded = new ProvenanceStore();
        const result = reloaded.hydrate(JSON.parse(written) as SerializedProvenance);

        expect(result.absent).toBeNull();
        expect(result.dropped).toEqual([]);
        expect(result.artefacts).toBe(3);
        expect(result.edges).toBe(3);
        expect(result.contextSnapshots).toBe(2);
        expect(result.redactions).toBe(1);

        expect(JSON.stringify(reloaded.serialize())).toBe(written);
    });

    it('carries the two post-write mutations across the reload', () => {
        const reloaded = new ProvenanceStore();
        reloaded.hydrate(JSON.parse(JSON.stringify(seed().serialize())) as SerializedProvenance);

        const approved = reloaded
            .listArtefacts()
            .find((a) => a.approvalStatus === 'user-approved');
        expect(approved).toBeDefined();
        const linked = reloaded
            .listArtefacts()
            .find((a) => a.producedElementIds.includes('wall_42'));
        expect(linked).toBeDefined();
    });

    it('reconstructs the out-edge index, so the DAG guard still works after reload', () => {
        const original = seed();
        const reloaded = new ProvenanceStore();
        reloaded.hydrate(JSON.parse(JSON.stringify(original.serialize())) as SerializedProvenance);

        const a1 = reloaded.listArtefacts()[0]!;
        const a3 = reloaded.listArtefacts()[2]!;
        expect(reloaded.outEdges(a1.id)).toHaveLength(1);
        // a1 → a3 already exists transitively; the reverse would close a cycle.
        expect(() =>
            reloaded.addEdge(edge('e9', a3.id, { artefact: a1.id })),
        ).toThrow(/cycle/);
    });

    it('serialise does not alias live store state', () => {
        const s = seed();
        const slice = s.serialize();
        (slice.artefacts[0] as { userId: string }).userId = 'usr_tamper';
        expect(s.listArtefacts()[0]!.userId).toBe('usr_alice');
    });

    it('an empty store round-trips to an empty store (not to an absent one)', () => {
        const empty = new ProvenanceStore();
        const slice = empty.serialize();
        expect(slice).toEqual({
            version: PROVENANCE_SLICE_VERSION,
            artefacts: [],
            edges: [],
            contextSnapshots: [],
            redactions: [],
        });
        const reloaded = new ProvenanceStore();
        const r = reloaded.hydrate(slice);
        // Present-and-empty is NOT the same value as absent (C75 §1.4).
        expect(r.absent).toBeNull();
    });
});

// ── Negative controls (C74 §3.4 shape) ─────────────────────────────────

describe('ProvenanceStore — no provenance must never ACQUIRE one (PV-05 negative)', () => {
    let store: ProvenanceStore;
    beforeEach(() => {
        store = new ProvenanceStore();
    });

    it('a snapshot with NO provenance slice loads EMPTY with a NAMED reason', () => {
        const r = store.hydrate(undefined);
        expect(r.absent).toBe('predates-provenance-persistence');
        expect(r.artefacts).toBe(0);
        expect(r.edges).toBe(0);
        expect(store.artefactCount()).toBe(0);
        expect(store.edgeCount()).toBe(0);
        // The load reports the absence — it is never silent, and never
        // an invented lineage.
        expect(r.dropped).toEqual([]);
    });

    it('an unknown slice version REFUSES rather than partially loading', () => {
        const bad = { ...seed().serialize(), version: 99 } as unknown as SerializedProvenance;
        expect(() => store.hydrate(bad)).toThrow(/version 99/);
        expect(store.artefactCount()).toBe(0);
    });

    it('a malformed row is dropped AND NAMED, never silently discarded', () => {
        const slice = seed().serialize();
        // Two corruptions: a headless artefact and a dangling edge.
        (slice.artefacts as unknown[]).push({ notAnArtefact: true });
        slice.edges.push(edge('e8', 'aia_does-not-exist', { element: 'wall_1' }));

        const r = store.hydrate(slice);
        expect(r.artefacts).toBe(3);
        expect(r.dropped).toHaveLength(2);
        expect(r.dropped.map((d) => d.kind).sort()).toEqual(['artefact', 'edge']);
        for (const d of r.dropped) {
            expect(d.reason.length).toBeGreaterThan(0); // never a bare count
        }
    });

    it('hydrating over a live store REFUSES — it never merges two lineages', () => {
        store.addArtefact(artefact('z1'));
        expect(() => store.hydrate(seed().serialize())).toThrow(/empty store/);
        expect(store.artefactCount()).toBe(1); // untouched
    });
});

// ── §GR-10 — an UNRECORDED edge set ≠ an EMPTY one (C78 §8.1, C75 §1.4) ──
//
// The old body was `for (const e of slice.edges ?? [])`. Under it, a slice
// that OMITTED `edges` and a slice carrying `edges: []` produced byte-identical
// results — both `{ edges: 0, dropped: [] }`. These assertions are chosen to
// FAIL against that shape rather than merely describe the new one (C74 §3.4):
// the first compares the two results directly and demands they DIFFER.

describe('ProvenanceStore.hydrate — "no edges recorded" is not "no edges" (GR-10)', () => {
    /** A slice with the edge member removed entirely — what a pre-PV-05 or
     *  partially-written snapshot actually looks like on disk. */
    function sliceWithoutEdges(): SerializedProvenance {
        const s = JSON.parse(JSON.stringify(seed().serialize())) as SerializedProvenance;
        delete (s as { edges?: unknown }).edges;
        return s;
    }

    it('DIFFERENTIATOR: omitted-edges and empty-edges do NOT hydrate to the same value', () => {
        const unrecorded = new ProvenanceStore().hydrate(sliceWithoutEdges());
        const emptyEdges = new ProvenanceStore().hydrate({
            ...(JSON.parse(JSON.stringify(seed().serialize())) as SerializedProvenance),
            edges: [],
        });

        // Both load the same artefacts and BOTH report edges: 0 — that is
        // precisely why the count alone can never be the answer.
        expect(unrecorded.edges).toBe(0);
        expect(emptyEdges.edges).toBe(0);
        expect(unrecorded.dropped).toEqual([]);
        expect(emptyEdges.dropped).toEqual([]);

        // FAILS against `slice.edges ?? []`: under it these two objects were
        // deep-equal, so the conflation was invisible to every caller.
        expect(unrecorded).not.toEqual(emptyEdges);
    });

    it('an omitted edge set is UNDETERMINED with a C78 §8.1 reason, never a zero', () => {
        const r = new ProvenanceStore().hydrate(sliceWithoutEdges());
        expect(r.edgesUndetermined).toBe('RELATIONSHIP_NOT_RECORDED');
        // The rest of the slice still loads — this is an unknown about the
        // RELATIONSHIPS, not a refusal of the whole audit log.
        expect(r.artefacts).toBe(3);
        expect(r.absent).toBeNull();
    });

    it('negative control: a recorded-but-empty edge set is DETERMINED', () => {
        const r = new ProvenanceStore().hydrate({
            ...(JSON.parse(JSON.stringify(seed().serialize())) as SerializedProvenance),
            edges: [],
        });
        expect(r.edgesUndetermined).toBeNull();
        expect(r.edges).toBe(0);
    });

    it('negative control: a populated edge set is DETERMINED and counted', () => {
        const r = new ProvenanceStore().hydrate(
            JSON.parse(JSON.stringify(seed().serialize())) as SerializedProvenance,
        );
        expect(r.edgesUndetermined).toBeNull();
        expect(r.edges).toBe(3);
    });

    it('an ENTIRELY absent slice is undetermined about edges too', () => {
        const r = new ProvenanceStore().hydrate(undefined);
        expect(r.absent).toBe('predates-provenance-persistence');
        // `edges: 0` here must not read as "this project has no lineage".
        expect(r.edgesUndetermined).toBe('RELATIONSHIP_NOT_RECORDED');
    });
});
