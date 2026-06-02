// A.31.c — L3 ProvenanceStore tests.
//
// Pins the C23 §1.9 append-only invariants + §1.3 DAG cycle rejection +
// §2.3 snapshot-dedup-by-contextHash + §1.7 approval-status carve-out +
// §4.4 linkElement append.

import { describe, expect, it, beforeEach } from 'vitest';
import { ProvenanceStore } from '../src/ProvenanceStore.js';
import type {
    AIArtefact,
    ProvenanceEdge,
    ContextSnapshot,
    RedactionRecord,
} from '@pryzm/schemas/provenance';

// ── Fixtures ────────────────────────────────────────────────────────────

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

function snapshot(
    idSuffix: string,
    contextHash: string,
): ContextSnapshot {
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

// ── Tests ──────────────────────────────────────────────────────────────

describe('ProvenanceStore — read API', () => {
    let store: ProvenanceStore;

    beforeEach(() => {
        store = new ProvenanceStore();
    });

    it('starts empty', () => {
        expect(store.artefactCount()).toBe(0);
        expect(store.edgeCount()).toBe(0);
        expect(store.listArtefacts()).toEqual([]);
        expect(store.listEdges()).toEqual([]);
    });

    it('getArtefact returns undefined for unknown ids', () => {
        expect(store.getArtefact('aia_does-not-exist')).toBeUndefined();
    });

    it('lists artefacts ordered by timestamp ascending', () => {
        store.addArtefact(artefact('a', { timestamp: '2026-06-02T12:00:00.000Z' }));
        store.addArtefact(artefact('c', { timestamp: '2026-06-02T14:00:00.000Z' }));
        store.addArtefact(artefact('b', { timestamp: '2026-06-02T13:00:00.000Z' }));
        const ids = store.listArtefacts().map((a) => a.id);
        expect(ids).toEqual([
            store.listArtefacts()[0]!.id, // a
            store.listArtefacts()[1]!.id, // b
            store.listArtefacts()[2]!.id, // c
        ]);
    });

    it('listArtefactsForProject filters correctly', () => {
        store.addArtefact(artefact('a', { projectId: 'prj_x' }));
        store.addArtefact(artefact('b', { projectId: 'prj_y' }));
        expect(store.listArtefactsForProject('prj_x').length).toBe(1);
        expect(store.listArtefactsForProject('prj_y').length).toBe(1);
        expect(store.listArtefactsForProject('prj_z').length).toBe(0);
    });

    it('listArtefactsForSession filters correctly', () => {
        const sess = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
        store.addArtefact(artefact('a', { sessionId: sess }));
        store.addArtefact(artefact('b'));
        expect(store.listArtefactsForSession(sess).length).toBe(1);
    });
});

describe('ProvenanceStore — append-only artefacts', () => {
    let store: ProvenanceStore;
    beforeEach(() => {
        store = new ProvenanceStore();
    });

    it('adds an artefact + retrieves it by id', () => {
        const a = artefact('a');
        store.addArtefact(a);
        expect(store.getArtefact(a.id)).toEqual(a);
        expect(store.artefactCount()).toBe(1);
    });

    it('rejects re-adding the same id (append-only)', () => {
        const a = artefact('a');
        store.addArtefact(a);
        expect(() => store.addArtefact(a)).toThrow(/append-only/);
    });

    it('fires listeners on add', () => {
        let count = 0;
        store.subscribe(() => count++);
        store.addArtefact(artefact('a'));
        expect(count).toBe(1);
    });
});

describe('ProvenanceStore — edges + DAG invariant', () => {
    let store: ProvenanceStore;
    let aA: AIArtefact;
    let aB: AIArtefact;
    let aC: AIArtefact;

    beforeEach(() => {
        store = new ProvenanceStore();
        aA = artefact('a');
        aB = artefact('b');
        aC = artefact('c');
        store.addArtefact(aA);
        store.addArtefact(aB);
        store.addArtefact(aC);
    });

    it('adds an artefact-to-element edge', () => {
        const e = edge('e1', aA.id, { element: 'el_wall_42' });
        store.addEdge(e);
        expect(store.getEdge(e.id)).toEqual(e);
        expect(store.edgeCount()).toBe(1);
    });

    it('adds an artefact-to-artefact edge', () => {
        const e = edge('e1', aA.id, { artefact: aB.id });
        store.addEdge(e);
        expect(store.getEdge(e.id)).toEqual(e);
    });

    it('rejects edges from unknown artefacts', () => {
        const e = edge('e1', 'aia_unknown', { element: 'el_42' });
        expect(() => store.addEdge(e)).toThrow(/unknown artefact/);
    });

    it('rejects edges to unknown artefacts', () => {
        const e = edge('e1', aA.id, { artefact: 'aia_unknown' });
        expect(() => store.addEdge(e)).toThrow(/unknown artefact/);
    });

    it('rejects re-adding the same edge id', () => {
        const e = edge('e1', aA.id, { element: 'el_42' });
        store.addEdge(e);
        expect(() => store.addEdge(e)).toThrow(/append-only/);
    });

    it('rejects self-loops as cycles', () => {
        const e = edge('e1', aA.id, { artefact: aA.id });
        expect(() => store.addEdge(e)).toThrow(/cycle/);
    });

    it('rejects an edge that would close a 2-node cycle', () => {
        // A → B
        store.addEdge(edge('e1', aA.id, { artefact: aB.id }));
        // adding B → A would close the cycle
        const cycleEdge = edge('e2', aB.id, { artefact: aA.id });
        expect(() => store.addEdge(cycleEdge)).toThrow(/cycle/);
    });

    it('rejects an edge that would close a 3-node cycle', () => {
        // A → B → C
        store.addEdge(edge('e1', aA.id, { artefact: aB.id }));
        store.addEdge(edge('e2', aB.id, { artefact: aC.id }));
        // adding C → A would close the cycle
        const cycleEdge = edge('e3', aC.id, { artefact: aA.id });
        expect(() => store.addEdge(cycleEdge)).toThrow(/cycle/);
    });

    it('accepts a diamond shape (no cycle)', () => {
        // A → B
        // A → C
        // B → C  (the diamond closes — still a DAG)
        store.addEdge(edge('e1', aA.id, { artefact: aB.id }));
        store.addEdge(edge('e2', aA.id, { artefact: aC.id }));
        store.addEdge(edge('e3', aB.id, { artefact: aC.id }));
        expect(store.edgeCount()).toBe(3);
    });

    it('outEdges() returns out-edges by source artefact', () => {
        store.addEdge(edge('e1', aA.id, { artefact: aB.id }));
        store.addEdge(edge('e2', aA.id, { element: 'el_42' }));
        store.addEdge(edge('e3', aB.id, { artefact: aC.id }));
        expect(store.outEdges(aA.id).length).toBe(2);
        expect(store.outEdges(aB.id).length).toBe(1);
        expect(store.outEdges(aC.id).length).toBe(0);
    });
});

describe('ProvenanceStore — snapshot dedup by contextHash', () => {
    let store: ProvenanceStore;
    beforeEach(() => {
        store = new ProvenanceStore();
    });

    it('returns the existing snapshot when contextHash matches', () => {
        const hashA = '1'.repeat(64);
        const s1 = snapshot('a', hashA);
        const s2 = snapshot('b', hashA); // different id, SAME hash
        const r1 = store.addOrReuseSnapshot(s1);
        const r2 = store.addOrReuseSnapshot(s2);
        expect(r1).toBe(r2);
        expect(r2.id).toBe(s1.id); // returned the FIRST, not the second
    });

    it('creates a new snapshot when contextHash is novel', () => {
        const hashA = '1'.repeat(64);
        const hashB = '2'.repeat(64);
        store.addOrReuseSnapshot(snapshot('a', hashA));
        store.addOrReuseSnapshot(snapshot('b', hashB));
        expect(store.findSnapshotByHash(hashA)).toBeDefined();
        expect(store.findSnapshotByHash(hashB)).toBeDefined();
    });

    it('findSnapshotByHash returns undefined for unknown hashes', () => {
        expect(store.findSnapshotByHash('zzz')).toBeUndefined();
    });
});

describe('ProvenanceStore — redactions append-only', () => {
    let store: ProvenanceStore;
    beforeEach(() => {
        store = new ProvenanceStore();
    });

    it('adds a redaction + retrieves it by id', () => {
        const r = redaction('a', 'aia_xx');
        store.addRedaction(r);
        expect(store.getRedaction(r.id)).toEqual(r);
    });

    it('rejects re-adding the same redaction id', () => {
        const r = redaction('a', 'aia_xx');
        store.addRedaction(r);
        expect(() => store.addRedaction(r)).toThrow(/append-only/);
    });
});

describe('ProvenanceStore — §1.7 approvalStatus carve-out', () => {
    let store: ProvenanceStore;
    beforeEach(() => {
        store = new ProvenanceStore();
    });

    it('mutates approvalStatus on an existing artefact', () => {
        const a = artefact('a', { approvalStatus: 'pending' });
        store.addArtefact(a);
        store.updateApprovalStatus(a.id, 'user-approved');
        expect(store.getArtefact(a.id)?.approvalStatus).toBe('user-approved');
    });

    it('is a no-op when status is unchanged', () => {
        const a = artefact('a', { approvalStatus: 'pending' });
        store.addArtefact(a);
        let count = 0;
        store.subscribe(() => count++);
        store.updateApprovalStatus(a.id, 'pending');
        expect(count).toBe(0);
    });

    it('throws on unknown artefact id', () => {
        expect(() =>
            store.updateApprovalStatus('aia_unknown', 'user-approved'),
        ).toThrow(/unknown artefact/);
    });

    it('does NOT mutate any other field', () => {
        const a = artefact('a', { approvalStatus: 'pending', costUsd: 0.5 });
        store.addArtefact(a);
        store.updateApprovalStatus(a.id, 'user-approved');
        const updated = store.getArtefact(a.id)!;
        expect(updated.costUsd).toBe(0.5);
        expect(updated.id).toBe(a.id);
    });
});

describe('ProvenanceStore — §4.4 linkElement', () => {
    let store: ProvenanceStore;
    let a: AIArtefact;
    beforeEach(() => {
        store = new ProvenanceStore();
        a = artefact('a');
        store.addArtefact(a);
    });

    it('appends an element id to producedElementIds', () => {
        store.linkElement(a.id, 'el_wall_1');
        expect(store.getArtefact(a.id)?.producedElementIds).toEqual(['el_wall_1']);
    });

    it('idempotent — dup link is a no-op', () => {
        store.linkElement(a.id, 'el_wall_1');
        let count = 0;
        store.subscribe(() => count++);
        store.linkElement(a.id, 'el_wall_1');
        expect(count).toBe(0);
        expect(store.getArtefact(a.id)?.producedElementIds).toEqual(['el_wall_1']);
    });

    it('throws on unknown artefact', () => {
        expect(() => store.linkElement('aia_unknown', 'el_wall_1')).toThrow(
            /unknown artefact/,
        );
    });
});

describe('ProvenanceStore — reset + dispose', () => {
    it('reset clears every collection', () => {
        const store = new ProvenanceStore();
        const a = artefact('a');
        store.addArtefact(a);
        store.addEdge(edge('e1', a.id, { element: 'el_42' }));
        store.addOrReuseSnapshot(snapshot('s', '1'.repeat(64)));
        store.addRedaction(redaction('r', a.id));
        store.reset();
        expect(store.artefactCount()).toBe(0);
        expect(store.edgeCount()).toBe(0);
        expect(store.findSnapshotByHash('1'.repeat(64))).toBeUndefined();
    });

    it('reset is no-op when already empty (no listener fire)', () => {
        const store = new ProvenanceStore();
        let count = 0;
        store.subscribe(() => count++);
        store.reset();
        expect(count).toBe(0);
    });

    it('dispose is idempotent', () => {
        const store = new ProvenanceStore();
        store.dispose();
        expect(() => store.dispose()).not.toThrow();
    });

    it('writes after dispose are warned + ignored', () => {
        const store = new ProvenanceStore();
        store.dispose();
        const a = artefact('a');
        expect(() => store.addArtefact(a)).not.toThrow();
        expect(store.getArtefact(a.id)).toBeUndefined();
    });

    it('catches listener throws + carries on notifying the rest', () => {
        const store = new ProvenanceStore();
        let saw = false;
        store.subscribe(() => {
            throw new Error('test listener');
        });
        store.subscribe(() => {
            saw = true;
        });
        store.addArtefact(artefact('a'));
        expect(saw).toBe(true);
    });
});
