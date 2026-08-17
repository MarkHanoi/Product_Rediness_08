/**
 * @vitest-environment happy-dom
 *
 * PER-FILE environment override, deliberately NOT a config change. `vitest.config.ts`
 * pins `environment: 'node'` globally and its comment at :29 forbids flipping that,
 * because sibling suites assert `globalThis.window === undefined`. The docblock scopes
 * happy-dom to THIS file only, so those suites are untouched.
 *
 * It is needed because the production serializer's import graph touches real DOM APIs at
 * module scope (`DOMMatrix`, then `window.addEventListener`) and `serialize()` itself
 * reads `window.runtime` at ProjectSerializer.ts:959. Hand-stubbing them one
 * ReferenceError at a time was the first attempt and it just kept finding more; a real
 * DOM is both cheaper and more faithful to the browser this code actually runs in.
 *
 * PV-05 (C70 I-INV-2) — does the C23 AI-lineage slice reach the file on the path
 * PRODUCTION actually runs?
 *
 * ## Why this probe exists, when two others already claim PV-05 green
 *
 * `packages/stores/__tests__/ProvenanceStore.persistence.test.ts` (9/9) and
 * `packages/persistence-client/__tests__/provenanceSlicePersistence.test.ts` (11/11)
 * both pass today. Neither is wrong. Both are about a file the save path does not call.
 *
 * There are TWO copies of the serializer in this repo — a duplication C71 §250 already
 * names ("exists in TWO byte-identical copies"):
 *
 *   - `packages/persistence-client/src/loader/ProjectSerializer.ts`  ← PV-05 was fixed HERE
 *   - `apps/editor/src/engine/persistence/ProjectSerializer.ts`      ← production imports THIS
 *
 * `apps/editor/src/engine/initPersistence.ts:41` imports the app copy, and its
 * `saveDelegate.serialize` calls that one. So the `provenance` key added at 8cab70c1
 * is written by a serializer nothing in the app invokes.
 *
 * The load side is worse — there are THREE loaders, and the app loader's own comment
 * (ProjectLoader.ts:151) names the live one:
 *   - `packages/persistence-client/src/loader/ProjectLoader.ts`      ← PV-05 hydrate HERE
 *   - `apps/editor/src/engine/persistence/ProjectLoader.ts`          ← "the LEGACY loader"
 *   - `packages/command-registry/src/project/projectLoaderUtils.ts`  ← "the default-on path"
 * Neither of the latter two mentions the provenance slice at all.
 *
 * ## What this probe asserts
 *
 * The STORED value, after a real serialize -> JSON.stringify -> JSON.parse cycle driven
 * through the PRODUCTION serializer — never a pure function's return, and never a
 * hand-built snapshot. Roadmap §3.4 names that exact trap: "a unit test that fabricates
 * its fixture IN THE IMPLEMENTATION'S SHAPE matches the bug rather than the real
 * serializer output". So the fixture here is a REAL `ProvenanceStore` handed to the
 * REAL serializer, and the assertion reads the parsed JSON.
 */

import { describe, it, expect } from 'vitest';

// happy-dom supplies `window`/`document` but not the WebGL-adjacent geometry globals
// some of the graph evaluates at module scope. Inert by design — nothing under test
// reads them; they exist only so the module graph finishes evaluating.
const g = globalThis as any;
if (typeof g.DOMMatrix === 'undefined') {
    g.DOMMatrix = class { constructor(_?: unknown) { /* inert */ } };
}
if (typeof g.DOMPoint === 'undefined') {
    g.DOMPoint = class { constructor(_?: unknown) { /* inert */ } };
}

import { ProvenanceStore } from '@pryzm/stores';
import type {
    AIArtefact,
    ProvenanceEdge,
} from '@pryzm/schemas/provenance';

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

function edge(idSuffix: string, from: string, toElement: string): ProvenanceEdge {
    return {
        id: `pe_${idSuffix.padEnd(36, '0').slice(0, 36)}`,
        fromArtefactId: from,
        toArtefactId: null,
        toElementId: toElement,
        edgeKind: 'artefact-to-element',
        createdAt: '2026-06-02T12:01:00.000Z',
        projectId: 'prj_atelier',
    } as ProvenanceEdge;
}

/** The whole point of C23: which AI call produced wall_42. */
function seededStore(): ProvenanceStore {
    const s = new ProvenanceStore();
    const a = artefact('a1');
    s.addArtefact(a);
    s.addEdge(edge('e1', a.id, 'wall_42'));
    s.linkElement(a.id, 'wall_42');
    return s;
}

/**
 * An inert store scaffold — every method answers the empty-but-valid value for its
 * shape — EXCEPT `provenanceStore`, which is the real seeded store. Same recipe as
 * `tools/rac-conformance/runtime-harness/__tests__/v3v4v5.probe.ts:130`.
 */
const emptyStore: any = new Proxy({}, {
    get: (_t, prop: string) => {
        if (prop === 'then') return undefined;
        if (/^(size|count|length)$/i.test(prop)) return () => 0;
        if (/^serialize|toJSON$/i.test(prop)) return () => ({});
        if (/^(getAll|getLevels|getBy|getIds|list|all|entries|values|keys)/i.test(prop)) return () => [];
        if (/^(isBuiltIn|has|is)/i.test(prop)) return () => false;
        if (/^(getById|get|find)/i.test(prop)) return () => undefined;
        return () => [];
    },
});

function bundleWith(provenanceStore: ProvenanceStore): any {
    return new Proxy({}, {
        get: (_t, prop: string) => (prop === 'provenanceStore' ? provenanceStore : emptyStore),
    });
}

type Loaded = { serialize: ((s: any, b: any, o: any) => any) | null; note: string };

/** Importing the production serializer drags the whole app graph (~12 s cold), so it
 *  is loaded ONCE and shared. Every `it` below awaits this same promise. */
const productionSerializer: Promise<Loaded> = (async () => {
    try {
        const m: any = await import('../src/engine/persistence/ProjectSerializer');
        if (typeof m?.ProjectSerializer?.serialize !== 'function') {
            return { serialize: null, note: 'imported but has no static serialize()' };
        }
        return { serialize: m.ProjectSerializer.serialize.bind(m.ProjectSerializer), note: 'ok' };
    } catch (e) {
        // C70 L-INV-1: "I could not look" is NOT "I found nothing".
        return { serialize: null, note: 'IMPORT FAILED: ' + String(e).slice(0, 300) };
    }
})();

const loadProductionSerializer = () => productionSerializer;

/** The app graph costs ~120 s to TRANSFORM cold under vitest. That is import cost, not
 *  test cost — the assertions themselves run in single-digit milliseconds. */
const T = 300_000;

describe('PV-05 — the C23 lineage must survive save/reload on the PRODUCTION path', () => {
    // §PV-05-APP-COPY — FLIPPED 2026-08-17. These two were `it.fails`, and they PASSED
    // as such: measured against HEAD before the fix, the production snapshot carried no
    // `provenance` key at all. That measurement stands as the record that the restamp's
    // census was right and 8cab70c1 had closed PV-05 on a serializer the app never calls.
    //
    // The fix threads `runtime.provenanceStore` through initPersistence into the APP
    // copies of ProjectSerializer + ProjectLoader. These are now plain `it` — they
    // assert the STORED value, so they go red again the moment the slice stops
    // reaching the file.
    it('the provenance slice reaches the STORED snapshot through the production serializer', async () => {
        const prod = await loadProductionSerializer();
        // A probe that cannot run must say so, not pass quietly.
        expect(prod.serialize, 'production serializer unusable: ' + prod.note).toBeTruthy();

        const snapshot = prod.serialize!(bundleWith(seededStore()), {} as any, { projectName: 'pv05' });

        // The STORED value — after the real stringify/parse the save path performs.
        const stored = JSON.parse(JSON.stringify(snapshot));

        expect(stored.provenance, 'the production snapshot carries NO `provenance` key — the C23 audit log is destroyed on every reload').toBeTruthy();
        expect(stored.provenance.artefacts).toHaveLength(1);
        expect(stored.provenance.edges).toHaveLength(1);
        // The element->artefact edge is the whole point: which AI call produced wall_42.
        expect(stored.provenance.edges[0].toElementId).toBe('wall_42');
        expect(stored.provenance.artefacts[0].producedElementIds).toContain('wall_42');
    }, T);

    it('the slice round-trips back into a fresh store (serialize -> parse -> hydrate -> read)', async () => {
        const prod = await loadProductionSerializer();
        expect(prod.serialize, 'production serializer unusable: ' + prod.note).toBeTruthy();

        const snapshot = prod.serialize!(bundleWith(seededStore()), {} as any, { projectName: 'pv05' });
        const stored = JSON.parse(JSON.stringify(snapshot));

        const reloaded = new ProvenanceStore();
        const res = reloaded.hydrate(stored.provenance);

        // C75 §1.4 — absent must not be reported as an empty audit log.
        expect(res.absent, 'hydrate reported the lineage ABSENT — nothing was persisted').toBeNull();
        expect(res.artefacts).toBe(1);
        expect(res.dropped).toEqual([]);

        const back = reloaded.listArtefacts();
        expect(back).toHaveLength(1);
        expect(back[0].producedElementIds).toContain('wall_42');
    }, T);

    /**
     * Roadmap §3.4's OTHER named trap: "a conditional `len > 0 ? … : undefined`
     * serialisation makes an empty collection and an absent collection identical".
     *
     * These are three DIFFERENT VALUES and the snapshot must keep them apart:
     *   - store wired, no rows  -> `provenance` PRESENT, arrays empty
     *                              = "this project genuinely has no AI lineage"
     *   - store NOT wired       -> `provenance` ABSENT
     *                              = "this session cannot speak to the lineage"
     *   - store wired, rows     -> covered by the two tests above
     *
     * The middle case must NOT write an empty slice: doing so would overwrite a real
     * audit log with the positive claim "no AI ever touched this project" (C75 §1.4).
     * So the serializer's condition is on the STORE's presence, never on row count —
     * and this test is what stops someone "tidying" it into a length check.
     */
    it('distinguishes an EMPTY lineage from an ABSENT one in the stored snapshot', async () => {
        const prod = await loadProductionSerializer();
        expect(prod.serialize, 'production serializer unusable: ' + prod.note).toBeTruthy();

        // ── wired but empty: the key is written, arrays are empty ──────────────
        const emptyWired = JSON.parse(JSON.stringify(
            prod.serialize!(bundleWith(new ProvenanceStore()), {} as any, { projectName: 'pv05-empty' }),
        ));
        expect(emptyWired.provenance, 'a wired-but-empty store must still write the slice — omitting it would make "no AI touched this" indistinguishable from "this build cannot say"').toBeTruthy();
        expect(emptyWired.provenance.artefacts).toEqual([]);
        expect(emptyWired.provenance.edges).toEqual([]);

        // hydrate reports it as PRESENT-and-empty, not absent.
        const emptyRes = new ProvenanceStore().hydrate(emptyWired.provenance);
        expect(emptyRes.absent, 'an empty-but-present slice must not be reported ABSENT').toBeNull();
        expect(emptyRes.artefacts).toBe(0);

        // ── not wired: the key is omitted entirely ─────────────────────────────
        // `emptyStore` answers every property, so `stores.provenanceStore` is a
        // non-ProvenanceStore stand-in; use a bundle that truly lacks the member.
        const noStoreBundle: any = new Proxy({}, {
            get: (_t, prop: string) => (prop === 'provenanceStore' ? undefined : emptyStore),
        });
        const unwired = JSON.parse(JSON.stringify(
            prod.serialize!(noStoreBundle, {} as any, { projectName: 'pv05-unwired' }),
        ));
        expect(unwired.provenance, 'an UNWIRED bootstrap must omit the key, never write an empty slice over a real audit log').toBeUndefined();

        // And the absence is named as UNKNOWN-with-a-reason, not as an empty log.
        const absentRes = new ProvenanceStore().hydrate(unwired.provenance);
        expect(absentRes.absent).toBe('predates-provenance-persistence');
    }, T);
});
