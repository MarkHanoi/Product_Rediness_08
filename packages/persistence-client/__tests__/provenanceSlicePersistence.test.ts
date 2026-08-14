/**
 * PV-05 — DOES THE C23 AI-LINEAGE SURVIVE THE SNAPSHOT BOUNDARY?
 *
 * The register records `ProvenanceStore` as "not persisted at all —
 * destroyed on every reload". Measured at HEAD before 2026-08-14 that was
 * exactly right and not the other defect it is often confused with: the
 * store had NO serialise surface whatsoever, and `packages/persistence-
 * client` contained zero references to it. So this is not
 * persisted-and-not-rebuilt; it is unpersisted.
 *
 * ── WHAT IS REAL HERE, AND WHAT IS NOT (C74 §3.4) ──────────────────────
 *
 * REAL (production modules, never re-implemented in this file):
 *   • `ProvenanceStore` from `@pryzm/stores` — the serialise/hydrate pair
 *     under test. The round trip below runs the REAL methods.
 *   • The `provenance` snapshot key's write site and the loader's restore
 *     site are PINNED BY SOURCE ASSERTION against the production files,
 *     so deleting either turns this suite red.
 *
 * NOT REAL, and why (stated so the proof is not overclaimed):
 *   • `ProjectSerializer.serialize()` and `ProjectLoader.load()` are NOT
 *     executed. Both require ~40 singleton stores, a live CommandManager
 *     and a DOM event bus — unavailable in this Node-env suite. Exactly
 *     the limitation `regionSketchPersistenceRoundTrip.test.ts` records
 *     for the slab sketch, handled the same way: execute the store half,
 *     source-pin the wiring half.
 *   • Nothing here proves a real browser session saves and reloads a real
 *     project's lineage. That is an E2E claim and is NOT made.
 *
 * ── ADVERSARIAL SELF-CHECK ─────────────────────────────────────────────
 * §4 feeds a dropped-`provenance` snapshot and an invented-lineage load
 * through the same assertions and proves they go RED.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ProvenanceStore, type SerializedProvenance } from '@pryzm/stores';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../..');

const SHA64 = '0'.repeat(64);

function artefact(idSuffix: string, overrides: Record<string, unknown> = {}) {
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
    } as never;
}

/** A store holding an AI decision that produced a real element. */
function seededStore(): ProvenanceStore {
    const s = new ProvenanceStore();
    const a = artefact('a1') as unknown as { id: string };
    s.addArtefact(a as never);
    s.addEdge({
        id: `pe_${'e1'.padEnd(36, '0').slice(0, 36)}`,
        fromArtefactId: a.id,
        toArtefactId: null,
        toElementId: 'wall_42',
        edgeKind: 'artefact-to-element',
        createdAt: '2026-06-02T12:01:00.000Z',
        projectId: 'prj_atelier',
    } as never);
    return s;
}

let serializerSrc = '';
let loaderSrc = '';

beforeAll(() => {
    serializerSrc = readFileSync(
        resolve(REPO, 'packages/persistence-client/src/loader/ProjectSerializer.ts'),
        'utf8',
    );
    loaderSrc = readFileSync(
        resolve(REPO, 'packages/persistence-client/src/loader/ProjectLoader.ts'),
        'utf8',
    );
});

// ── §1 — the executed round trip through the snapshot key ──────────────

describe('§1 — the lineage survives serialise → JSON → hydrate', () => {
    it('round-trips BYTE-EQUAL through a JSON snapshot key', () => {
        const live = seededStore();
        // Exactly what ProjectSerializer writes into `snapshot.provenance`.
        const snapshot = { provenance: live.serialize() };
        const onDisk = JSON.parse(JSON.stringify(snapshot)) as {
            provenance: SerializedProvenance;
        };

        const reloaded = new ProvenanceStore();
        const r = reloaded.hydrate(onDisk.provenance);

        expect(r.absent).toBeNull();
        expect(r.dropped).toEqual([]);
        expect(reloaded.artefactCount()).toBe(1);
        expect(reloaded.edgeCount()).toBe(1);
        expect(JSON.stringify(reloaded.serialize())).toBe(
            JSON.stringify(live.serialize()),
        );
    });

    it('the element→artefact link survives, which is the whole point', () => {
        const reloaded = new ProvenanceStore();
        reloaded.hydrate(
            JSON.parse(JSON.stringify(seededStore().serialize())) as SerializedProvenance,
        );
        const a = reloaded.listArtefacts()[0]!;
        const outs = reloaded.outEdges(a.id);
        expect(outs).toHaveLength(1);
        expect(outs[0]!.toElementId).toBe('wall_42');
    });
});

// ── §2 — absence stays absence (C75 §1.4) ──────────────────────────────

describe('§2 — a pre-PV-05 snapshot must not ACQUIRE a lineage', () => {
    it('a snapshot with no provenance key loads empty, with a NAMED reason', () => {
        const snapshot: { provenance?: SerializedProvenance } = {};
        const store = new ProvenanceStore();
        const r = store.hydrate(snapshot.provenance);

        expect(r.absent).toBe('predates-provenance-persistence');
        expect(store.artefactCount()).toBe(0);
        expect(store.edgeCount()).toBe(0);
    });
});

// ── §3 — the wiring, pinned by source ──────────────────────────────────

describe('§3 — the snapshot slice and its two call sites exist in production source', () => {
    it('ProjectSnapshot declares an OPTIONAL provenance slice (additive, v3-compatible)', () => {
        expect(serializerSrc).toMatch(
            /provenance\?:\s*import\('@pryzm\/stores'\)\.SerializedProvenance/,
        );
    });

    it('ProjectSerializer writes the slice ONLY when a store is wired', () => {
        // An unwired bootstrap must OMIT the key, never write an empty
        // slice over a real audit log.
        expect(serializerSrc).toMatch(
            /provenance:\s*stores\.provenanceStore\s*\?[\s\S]{0,80}:\s*undefined/,
        );
    });

    it('ProjectLoader hydrates the slice', () => {
        expect(loaderSrc).toMatch(/this\.provenanceStore\.hydrate\(snapshot\.provenance\)/);
    });

    it('ProjectLoader NAMES the loss instead of loading silently (C70 I-INV-3)', () => {
        expect(loaderSrc).toMatch(/if\s*\(prov\.absent\)/);
        expect(loaderSrc).toMatch(/UNRECOVERABLE/);
        // and the refused rows are reported, not silently discarded
        expect(loaderSrc).toMatch(/prov\.dropped\.length\s*>\s*0/);
    });

    it('a snapshot with a lineage loaded by an UNWIRED loader is called out', () => {
        expect(loaderSrc).toMatch(/no ProvenanceStore was wired into this loader/);
    });
});

// ── §4 — the probe would DETECT the defect it claims to close ──────────

describe('§4 — adversarial self-check', () => {
    it('a serialiser that DROPPED the slice fails §3', () => {
        const planted = serializerSrc.replace(
            /provenance:\s*stores\.provenanceStore\s*\?[\s\S]{0,80}:\s*undefined,/,
            '',
        );
        expect(planted).not.toMatch(
            /provenance:\s*stores\.provenanceStore\s*\?[\s\S]{0,80}:\s*undefined/,
        );
    });

    it('a loader that INVENTED an empty lineage fails §2', () => {
        // The defect: treating an absent slice as "this project has no AI
        // history" rather than "this history is unrecoverable".
        const store = new ProvenanceStore();
        const r = store.hydrate(undefined);
        const inventedReading = r.absent === null; // what the defect would say
        expect(inventedReading).toBe(false);
    });

    it('a round trip that silently lost the edge fails §1', () => {
        const live = seededStore();
        const slice = live.serialize();
        const lossy: SerializedProvenance = { ...slice, edges: [] };
        const reloaded = new ProvenanceStore();
        reloaded.hydrate(lossy);
        expect(JSON.stringify(reloaded.serialize())).not.toBe(
            JSON.stringify(live.serialize()),
        );
    });
});
