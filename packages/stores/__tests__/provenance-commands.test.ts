// A.31.d — provenance.* command handler tests.
//
// Covers all 4 handlers (recordArtefact / linkElement /
// updateApprovalStatus / queryByProject) + the cross-cutting
// idempotency + illegal-transition + RLS-by-project invariants.

import { describe, expect, it, beforeEach } from 'vitest';
import { ProvenanceStore } from '../src/ProvenanceStore.js';
import {
    recordArtefact,
    linkElement,
    updateApprovalStatus,
    queryByProject,
} from '../src/provenance-commands/index.js';
import type { AIArtefact, ApprovalStatus } from '@pryzm/schemas/provenance';

// ── Fixtures ────────────────────────────────────────────────────────────

const SHA64 = '0'.repeat(64);
const SESSION = '550e8400-e29b-41d4-a716-446655440000';

function artefact(
    overrides: Partial<AIArtefact> & { idSuffix?: string } = {},
): AIArtefact {
    const idSuffix = (overrides.idSuffix ?? 'a').padEnd(36, '0').slice(0, 36);
    delete (overrides as { idSuffix?: string }).idSuffix;
    return {
        id: `aia_${idSuffix}`,
        idempotencyKey: SHA64,
        timestamp: '2026-06-02T12:00:00.000Z',
        sessionId: SESSION,
        userId: 'usr_alice',
        projectId: 'prj_atelier',
        model: 'claude-haiku-4-5-20251014',
        workflowKind: 'apartment-layout-generate',
        workflowVersion: 'apartment-layout-v3.2',
        promptSha: SHA64,
        promptPreviewRedacted: '…',
        contextHash: SHA64,
        contextSnapshotId: 'cs_12345678-1234-1234-1234-123456789012',
        redactionRecordId: null,
        inputTokens: 100,
        outputTokens: 100,
        costUsd: 0.001,
        durationMs: 1000,
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

// ── recordArtefact ─────────────────────────────────────────────────────

describe('recordArtefact()', () => {
    let store: ProvenanceStore;
    beforeEach(() => {
        store = new ProvenanceStore();
    });

    it('appends a new artefact + returns deduplicated: false', () => {
        const a = artefact();
        const result = recordArtefact(a, store);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.event.deduplicated).toBe(false);
            expect(result.event.artefact.id).toBe(a.id);
        }
        expect(store.artefactCount()).toBe(1);
    });

    it('idempotent on idempotencyKey — second call returns existing row + deduplicated: true', () => {
        const a1 = artefact({ idSuffix: 'a', idempotencyKey: 'a'.repeat(64) });
        const a2 = artefact({ idSuffix: 'b', idempotencyKey: 'a'.repeat(64) });
        recordArtefact(a1, store);
        const result = recordArtefact(a2, store);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.event.deduplicated).toBe(true);
            // Returned the EXISTING row (a1), not a2.
            expect(result.event.artefact.id).toBe(a1.id);
        }
        expect(store.artefactCount()).toBe(1);
    });

    it('rejects id collision with a DIFFERENT idempotencyKey', () => {
        const a1 = artefact({ idempotencyKey: 'a'.repeat(64) });
        const a2 = artefact({ idempotencyKey: 'b'.repeat(64) });
        recordArtefact(a1, store);
        const result = recordArtefact(a2, store);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toBe('duplicate-artefact-id');
    });

    it('idempotent dedup is scoped by project', () => {
        const a1 = artefact({
            idSuffix: 'a',
            idempotencyKey: 'a'.repeat(64),
            projectId: 'prj_atelier',
        });
        const a2 = artefact({
            idSuffix: 'b',
            idempotencyKey: 'a'.repeat(64),
            projectId: 'prj_other',
        });
        recordArtefact(a1, store);
        const result = recordArtefact(a2, store);
        // Different projectId → NOT dedup, second artefact is added.
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.event.deduplicated).toBe(false);
        expect(store.artefactCount()).toBe(2);
    });

    it('throws on schema-invalid payload', () => {
        const bad = { ...artefact(), timestamp: 'not-a-date' };
        expect(() => recordArtefact(bad as AIArtefact, store)).toThrow();
    });
});

// ── linkElement ────────────────────────────────────────────────────────

describe('linkElement()', () => {
    let store: ProvenanceStore;
    let a: AIArtefact;
    beforeEach(() => {
        store = new ProvenanceStore();
        a = artefact();
        store.addArtefact(a);
    });

    it('appends new element ids to producedElementIds', () => {
        const result = linkElement(
            { artefactId: a.id, elementIds: ['el_wall_1', 'el_door_2'] },
            store,
        );
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.event.addedElementIds).toEqual(['el_wall_1', 'el_door_2']);
        }
        expect(store.getArtefact(a.id)?.producedElementIds).toEqual([
            'el_wall_1',
            'el_door_2',
        ]);
    });

    it('idempotent — already-linked ids skipped + omitted from event', () => {
        store.linkElement(a.id, 'el_wall_1');
        const result = linkElement(
            { artefactId: a.id, elementIds: ['el_wall_1', 'el_door_2'] },
            store,
        );
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.event.addedElementIds).toEqual(['el_door_2']);
        }
    });

    it('rejects unknown artefact id', () => {
        const result = linkElement(
            { artefactId: 'aia_ffffffff-ffff-ffff-ffff-ffffffffffff', elementIds: ['e'] },
            store,
        );
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toBe('unknown-artefact');
    });

    it('throws on empty elementIds (Zod rejects)', () => {
        expect(() =>
            linkElement({ artefactId: a.id, elementIds: [] }, store),
        ).toThrow();
    });
});

// ── updateApprovalStatus ───────────────────────────────────────────────

describe('updateApprovalStatus()', () => {
    let store: ProvenanceStore;
    beforeEach(() => {
        store = new ProvenanceStore();
    });

    function withStatus(prior: ApprovalStatus): AIArtefact {
        const a = artefact({ approvalStatus: prior });
        store.addArtefact(a);
        return a;
    }

    it('pending → user-approved (legal)', () => {
        const a = withStatus('pending');
        const result = updateApprovalStatus(
            { artefactId: a.id, status: 'user-approved' },
            store,
        );
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.event.priorStatus).toBe('pending');
            expect(result.event.newStatus).toBe('user-approved');
        }
        expect(store.getArtefact(a.id)?.approvalStatus).toBe('user-approved');
    });

    it('pending → user-rejected (legal)', () => {
        const a = withStatus('pending');
        const result = updateApprovalStatus(
            { artefactId: a.id, status: 'user-rejected' },
            store,
        );
        expect(result.ok).toBe(true);
    });

    it('pending → never-applied (legal)', () => {
        const a = withStatus('pending');
        const result = updateApprovalStatus(
            { artefactId: a.id, status: 'never-applied' },
            store,
        );
        expect(result.ok).toBe(true);
    });

    it('rejects pending → auto-applied (illegal — auto is only auto, never set by user)', () => {
        const a = withStatus('pending');
        const result = updateApprovalStatus(
            { artefactId: a.id, status: 'auto-applied' },
            store,
        );
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.reason).toBe('invalid-payload');
            expect(result.message).toMatch(/illegal transition/);
        }
    });

    it('auto-applied is terminal (rejects every move)', () => {
        const a = withStatus('auto-applied');
        for (const status of ['pending', 'user-approved', 'user-rejected', 'never-applied'] as ApprovalStatus[]) {
            const result = updateApprovalStatus({ artefactId: a.id, status }, store);
            expect(result.ok).toBe(false);
        }
    });

    it('user-approved is terminal', () => {
        const a = withStatus('user-approved');
        const result = updateApprovalStatus(
            { artefactId: a.id, status: 'user-rejected' },
            store,
        );
        expect(result.ok).toBe(false);
    });

    it('user-rejected is terminal', () => {
        const a = withStatus('user-rejected');
        const result = updateApprovalStatus(
            { artefactId: a.id, status: 'user-approved' },
            store,
        );
        expect(result.ok).toBe(false);
    });

    it('same-status is a legal no-op', () => {
        const a = withStatus('pending');
        const result = updateApprovalStatus(
            { artefactId: a.id, status: 'pending' },
            store,
        );
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.event.priorStatus).toBe('pending');
            expect(result.event.newStatus).toBe('pending');
        }
    });

    it('rejects unknown artefact id', () => {
        const result = updateApprovalStatus(
            {
                artefactId: 'aia_ffffffff-ffff-ffff-ffff-ffffffffffff',
                status: 'user-approved',
            },
            store,
        );
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toBe('unknown-artefact');
    });
});

// ── queryByProject ─────────────────────────────────────────────────────

describe('queryByProject()', () => {
    let store: ProvenanceStore;
    beforeEach(() => {
        store = new ProvenanceStore();
        store.addArtefact(
            artefact({
                idSuffix: 'a',
                projectId: 'prj_atelier',
                timestamp: '2026-06-01T10:00:00.000Z',
                workflowKind: 'apartment-layout-generate',
            }),
        );
        store.addArtefact(
            artefact({
                idSuffix: 'b',
                projectId: 'prj_atelier',
                timestamp: '2026-06-02T10:00:00.000Z',
                workflowKind: 'plan-critique',
            }),
        );
        store.addArtefact(
            artefact({
                idSuffix: 'c',
                projectId: 'prj_other',
                timestamp: '2026-06-01T10:00:00.000Z',
                workflowKind: 'apartment-layout-generate',
            }),
        );
    });

    it('returns artefacts scoped to the project', () => {
        const result = queryByProject({ projectId: 'prj_atelier' }, store);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.event.rowCount).toBe(2);
            for (const a of result.event.artefacts) {
                expect(a.projectId).toBe('prj_atelier');
            }
        }
    });

    it('filters by `from` timestamp', () => {
        const result = queryByProject(
            { projectId: 'prj_atelier', from: '2026-06-02T00:00:00.000Z' },
            store,
        );
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.event.rowCount).toBe(1);
        }
    });

    it('filters by `to` timestamp', () => {
        const result = queryByProject(
            { projectId: 'prj_atelier', to: '2026-06-01T23:59:59.999Z' },
            store,
        );
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.event.rowCount).toBe(1);
        }
    });

    it('filters by workflowKinds (one)', () => {
        const result = queryByProject(
            { projectId: 'prj_atelier', workflowKinds: ['plan-critique'] },
            store,
        );
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.event.rowCount).toBe(1);
            expect(result.event.artefacts[0]!.workflowKind).toBe('plan-critique');
        }
    });

    it('filters by workflowKinds (multiple)', () => {
        const result = queryByProject(
            {
                projectId: 'prj_atelier',
                workflowKinds: ['plan-critique', 'apartment-layout-generate'],
            },
            store,
        );
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.event.rowCount).toBe(2);
        }
    });

    it('empty workflowKinds array = no filter', () => {
        const result = queryByProject(
            { projectId: 'prj_atelier', workflowKinds: [] },
            store,
        );
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.event.rowCount).toBe(2);
    });

    it('returns zero rows for unknown project', () => {
        const result = queryByProject({ projectId: 'prj_does-not-exist' }, store);
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.event.rowCount).toBe(0);
    });

    it('rowCount matches artefacts.length', () => {
        const result = queryByProject({ projectId: 'prj_atelier' }, store);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.event.rowCount).toBe(result.event.artefacts.length);
        }
    });
});
