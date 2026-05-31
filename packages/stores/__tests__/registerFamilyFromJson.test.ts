// @vitest-environment happy-dom
//
// P0.5 Stage-5 wiring (Family Platform) — registerFamilyFromJson tests.
//
// Verifies the L0-pure-pipeline → L3-reactive-store bridge:
//   • valid raw JSON → success branch + store contains the new family
//   • invalid raw JSON → 'ingestion-failed' branch, store untouched
//   • duplicate id + overwriteExisting=false → 'duplicate' branch, prior entry
//     preserved
//   • duplicate id + overwriteExisting=true (default) → success + replaced
//   • listener fan-out fires exactly once on success, never on failure
//   • opts forwarding (origin / category / pinned timestamps) propagates
//     through the pipeline into the assembled RegisteredFamily
//   • pipeline-throw path → 'pipeline-threw' failure (Vitest module mock)
//
// `happy-dom` mirrors `composeRuntime.familyRegistry.test.ts` so any
// transitive HTMLElement-reading dependency (none today, but a safety belt
// matching the project convention) can resolve.

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { FamilyRegistryStore } from '../src/familyRegistryStore.js';
import {
    registerFamilyFromJson,
    type RegisterFamilyFromJsonOptions,
} from '../src/registerFamilyFromJson.js';
import type { FamilyId, FamilyRequest } from '@pryzm/schemas';

// ── Fixture builders ───────────────────────────────────────────────────────
//
// Mirrors the FamilyRequest builders used in
// `packages/schemas/__tests__/familyPipeline.test.ts` so every fixture is
// guaranteed to validate against `FamilyRequestSchema`.

function makeSampleFamilyRequest(id?: string): FamilyRequest {
    return {
        identity: {
            id:      id ?? 'family/test/desk',
            name:    'Desk',
            version: '1.0.0',
            author:  'PRYZM Test',
            license: 'MIT',
        },
        documentation: { pdfs: [], specSheets: [], referenceImages: [] },
        geometry: {
            dimensions:         { widthM: 1.5, depthM: 0.75, heightM: 0.72 },
            parametricRanges:   [],
            hostedRelationship: { hostKind: 'none' },
        },
        behaviour:   { movable: true, hosted: false, mountClass: 'floor' },
        constraints: { excludeWallTypes: [] },
        placement: {
            defaultAnchor:  'wall-window',
            allowedAnchors: [],
            excludedWalls:  [],
        },
        bim: { entityType: 'IfcFurniture', psets: [] },
        ai:  { semanticNames: ['desk'], synonyms: [], cuesForPrompts: [] },
    };
}

const INGEST_TS    = '2026-01-01T00:00:00.000Z';
const DECOMPOSE_TS = '2026-01-02T00:00:00.000Z';
const GEOMETRY_TS  = '2026-01-03T00:00:00.000Z';
const SCHEMAS_TS   = '2026-01-04T00:00:00.000Z';

function pinnedOpts(extra: RegisterFamilyFromJsonOptions = {}): RegisterFamilyFromJsonOptions {
    return {
        ingest:             { fromRequestOpts: { ingestedAt: INGEST_TS } },
        decompose:          { decomposedAt:    DECOMPOSE_TS },
        synthesiseGeometry: { synthesisedAt:   GEOMETRY_TS },
        synthesiseSchemas:  { synthesisedAt:   SCHEMAS_TS },
        ...extra,
    };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('registerFamilyFromJson (P0.5 Stage-5 wiring)', () => {
    let store: FamilyRegistryStore;
    beforeEach(() => { store = new FamilyRegistryStore(); });

    // ── 1. Happy path ──────────────────────────────────────────────────────
    it('valid raw JSON → { ok: true, registered, replacedExisting: false }', () => {
        const result = registerFamilyFromJson(makeSampleFamilyRequest(), store, pinnedOpts());
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.replacedExisting).toBe(false);
            expect(result.registered.identity.id).toBe('family/test/desk');
        }
    });

    // ── 2. Happy path — store contains the new family ──────────────────────
    it('after success, store.findById returns the registered family', () => {
        const result = registerFamilyFromJson(makeSampleFamilyRequest(), store, pinnedOpts());
        if (!result.ok) throw new Error('expected success');
        const found = store.findById(result.registered.identity.id as FamilyId);
        expect(found).toBe(result.registered);
    });

    // ── 3. Invalid raw JSON — missing identity ─────────────────────────────
    it('invalid raw JSON (missing identity) → { ok: false, kind: "ingestion-failed", issues }', () => {
        const bad = makeSampleFamilyRequest() as unknown as Record<string, unknown>;
        delete bad.identity;
        const result = registerFamilyFromJson(bad, store);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.kind).toBe('ingestion-failed');
            expect(Array.isArray(result.issues)).toBe(true);
            expect(result.issues!.length).toBeGreaterThan(0);
            expect(typeof result.message).toBe('string');
            expect(result.message.length).toBeGreaterThan(0);
        }
        // Store unchanged.
        expect(Object.keys(store.get().byId)).toHaveLength(0);
    });

    // ── 4. Empty object — ingestion-failed ─────────────────────────────────
    it('empty object {} → ingestion-failed (multiple Zod issues)', () => {
        const result = registerFamilyFromJson({}, store);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.kind).toBe('ingestion-failed');
            expect(result.issues!.length).toBeGreaterThan(0);
        }
        expect(Object.keys(store.get().byId)).toHaveLength(0);
    });

    // ── 5. null + non-object inputs — ingestion-failed ─────────────────────
    it('null raw JSON → ingestion-failed', () => {
        const result = registerFamilyFromJson(null, store);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.kind).toBe('ingestion-failed');
        expect(Object.keys(store.get().byId)).toHaveLength(0);
    });

    // ── 6. Duplicate id, overwriteExisting=false → duplicate ───────────────
    it('duplicate id with overwriteExisting:false → { ok: false, kind: "duplicate" }', () => {
        const req = makeSampleFamilyRequest();
        const first = registerFamilyFromJson(req, store, pinnedOpts());
        expect(first.ok).toBe(true);

        const second = registerFamilyFromJson(req, store, pinnedOpts({ overwriteExisting: false }));
        expect(second.ok).toBe(false);
        if (!second.ok) {
            expect(second.kind).toBe('duplicate');
            expect(second.message).toContain('family/test/desk');
            expect(second.message).toContain('overwriteExisting');
        }
    });

    // ── 7. Duplicate id, overwriteExisting=false → original preserved ──────
    it('duplicate id with overwriteExisting:false leaves the original entry in place', () => {
        const req = makeSampleFamilyRequest();
        const first = registerFamilyFromJson(req, store, pinnedOpts());
        if (!first.ok) throw new Error('expected first success');
        const originalRef = first.registered;

        registerFamilyFromJson(req, store, pinnedOpts({ overwriteExisting: false }));

        const found = store.findById(req.identity.id as FamilyId);
        expect(found).toBe(originalRef);
    });

    // ── 8. Duplicate id, overwriteExisting=true (default) → replaced ───────
    it('duplicate id with default opts → { ok: true, replacedExisting: true }', () => {
        const req = makeSampleFamilyRequest();
        const first = registerFamilyFromJson(req, store, pinnedOpts());
        expect(first.ok).toBe(true);

        const second = registerFamilyFromJson(req, store, pinnedOpts());
        expect(second.ok).toBe(true);
        if (second.ok) expect(second.replacedExisting).toBe(true);
    });

    // ── 9. Default overwriteExisting is true (verified by omitting opts) ───
    it('default overwriteExisting is true (no opts passed)', () => {
        const req = makeSampleFamilyRequest();
        const first = registerFamilyFromJson(req, store);
        expect(first.ok).toBe(true);
        const second = registerFamilyFromJson(req, store);
        expect(second.ok).toBe(true);
        if (second.ok) expect(second.replacedExisting).toBe(true);
    });

    // ── 10. Overwrite replaces the registered payload ──────────────────────
    it('on overwrite, the new RegisteredFamily replaces the prior one', () => {
        const req = makeSampleFamilyRequest();
        const first = registerFamilyFromJson(req, store, pinnedOpts());
        if (!first.ok) throw new Error('expected first success');

        const second = registerFamilyFromJson(req, store, pinnedOpts({ assemble: { category: 'desks' } }));
        if (!second.ok) throw new Error('expected second success');

        // Store now references the second registration, not the first.
        const found = store.findById(req.identity.id as FamilyId);
        expect(found).toBe(second.registered);
        expect(found).not.toBe(first.registered);
        // And the new category is queryable on the store's secondary index.
        expect(store.findByCategory('desks').map(f => f.identity.id)).toContain(req.identity.id);
    });

    // ── 11. Listener fires on success ──────────────────────────────────────
    it('store listener fires on success (subscribe spy sees one call)', () => {
        const listener = vi.fn();
        store.subscribe(listener);
        const result = registerFamilyFromJson(makeSampleFamilyRequest(), store, pinnedOpts());
        expect(result.ok).toBe(true);
        expect(listener).toHaveBeenCalledTimes(1);
    });

    // ── 12. Listener fires once on overwrite — net coalesced count ─────────
    // unregister fires once, then register fires once → exactly 2 listener
    // calls on overwrite.  Verified explicitly because the unregister IS a
    // state-changing mutation and the store's contract says it notifies on
    // any real transition.
    it('listener fires twice on overwrite (unregister + register)', () => {
        const req = makeSampleFamilyRequest();
        registerFamilyFromJson(req, store, pinnedOpts());
        const listener = vi.fn();
        store.subscribe(listener);
        registerFamilyFromJson(req, store, pinnedOpts());
        expect(listener).toHaveBeenCalledTimes(2);
    });

    // ── 13. Listener does NOT fire on duplicate failure ────────────────────
    it('listener does NOT fire on { kind: "duplicate" } failure', () => {
        const req = makeSampleFamilyRequest();
        registerFamilyFromJson(req, store, pinnedOpts());
        const listener = vi.fn();
        store.subscribe(listener);
        const result = registerFamilyFromJson(req, store, pinnedOpts({ overwriteExisting: false }));
        expect(result.ok).toBe(false);
        expect(listener).not.toHaveBeenCalled();
    });

    // ── 14. Listener does NOT fire on ingestion-failed ─────────────────────
    it('listener does NOT fire on { kind: "ingestion-failed" } failure', () => {
        const listener = vi.fn();
        store.subscribe(listener);
        const result = registerFamilyFromJson({}, store);
        expect(result.ok).toBe(false);
        expect(listener).not.toHaveBeenCalled();
    });

    // ── 15. findByCategory returns the new family ──────────────────────────
    it('after register, store.findByCategory(category) returns the new family', () => {
        const result = registerFamilyFromJson(
            makeSampleFamilyRequest(),
            store,
            pinnedOpts({ assemble: { category: 'desks' } }),
        );
        if (!result.ok) throw new Error('expected success');
        const hits = store.findByCategory('desks');
        expect(hits.map(f => f.identity.id)).toContain(result.registered.identity.id);
    });

    // ── 16. findByOccupancy resolves the archetype-hint occupancy ──────────
    // The pipeline's Stage-5 assembler derives occupancy from
    // `ai.semanticNames` — using `'bedroom'` here so the registered family
    // surfaces under the 'bedroom' occupancy.
    it('store.findByOccupancy returns the family when semanticNames carry a known occupancy', () => {
        const req = makeSampleFamilyRequest('family/test/bed');
        req.ai = { semanticNames: ['bedroom'], synonyms: [], cuesForPrompts: [] };
        const result = registerFamilyFromJson(req, store, pinnedOpts());
        if (!result.ok) throw new Error('expected success');
        const hits = store.findByOccupancy('bedroom');
        expect(hits.map(f => f.identity.id)).toContain('family/test/bed');
    });

    // ── 17. findByMountClass resolves the assembled mountClass ─────────────
    it('store.findByMountClass returns the family under its mountClass', () => {
        const req = makeSampleFamilyRequest();
        req.behaviour = { movable: true, hosted: true, mountClass: 'wall' };
        const result = registerFamilyFromJson(req, store, pinnedOpts());
        if (!result.ok) throw new Error('expected success');
        const hits = store.findByMountClass('wall');
        expect(hits.map(f => f.identity.id)).toContain(req.identity.id);
    });

    // ── 18. opts.assemble.origin propagates ────────────────────────────────
    it('opts.assemble.origin = "plugin" → registered.origin === "plugin"', () => {
        const result = registerFamilyFromJson(
            makeSampleFamilyRequest(),
            store,
            pinnedOpts({ assemble: { origin: 'plugin' } }),
        );
        if (!result.ok) throw new Error('expected success');
        expect(result.registered.origin).toBe('plugin');
    });

    // ── 19. opts.assemble.category propagates ──────────────────────────────
    it('opts.assemble.category = "desks" → registered.category === "desks"', () => {
        const result = registerFamilyFromJson(
            makeSampleFamilyRequest(),
            store,
            pinnedOpts({ assemble: { category: 'desks' } }),
        );
        if (!result.ok) throw new Error('expected success');
        expect(result.registered.category).toBe('desks');
    });

    // ── 20. Pinned-timestamp determinism ───────────────────────────────────
    // Pinning every per-stage timestamp option yields a deterministic
    // `schemaHash` across re-runs — proves the per-stage opts are forwarded.
    it('pinned per-stage timestamps yield a deterministic registered.schemaHash', () => {
        const a = registerFamilyFromJson(makeSampleFamilyRequest('family/test/a'), new FamilyRegistryStore(), pinnedOpts());
        const b = registerFamilyFromJson(makeSampleFamilyRequest('family/test/a'), new FamilyRegistryStore(), pinnedOpts());
        if (!a.ok || !b.ok) throw new Error('expected both successful');
        expect(a.registered.schemaHash).toBe(b.registered.schemaHash);
        // And the hash is non-empty (sanity).
        expect(a.registered.schemaHash.length).toBeGreaterThan(0);
    });

    // ── 21. Two distinct families register independently ───────────────────
    it('two distinct families register independently — both surface in byId', () => {
        const a = registerFamilyFromJson(makeSampleFamilyRequest('family/test/a'), store, pinnedOpts());
        const b = registerFamilyFromJson(makeSampleFamilyRequest('family/test/b'), store, pinnedOpts());
        expect(a.ok).toBe(true);
        expect(b.ok).toBe(true);
        expect(Object.keys(store.get().byId).sort()).toEqual(['family/test/a', 'family/test/b']);
    });

    // ── 22. After register, store.get() byId carries the new family ────────
    it('after register, store.get().byId carries the new family entry', () => {
        const result = registerFamilyFromJson(makeSampleFamilyRequest(), store, pinnedOpts());
        if (!result.ok) throw new Error('expected success');
        const byId = store.get().byId;
        expect(byId[result.registered.identity.id]).toBe(result.registered);
    });

    // ── 23. Pipeline-throw: non-Error thrown value ─────────────────────────
    // The pipeline's per-stage transformers DO throw on internal contract
    // violations (e.g. identity mismatch between stages), but those paths
    // can't be reached via raw-JSON input alone — every stage in the chain
    // builds from the prior stage's identity.  Cover the `pipeline-threw`
    // branch via a Vitest module mock that forces `runFamilyPipeline` to
    // throw.  Pinpoint: the function under test catches BOTH `Error` and
    // non-Error throws.
    it('pipeline-throw (non-Error) → { ok: false, kind: "pipeline-threw" }', async () => {
        vi.resetModules();
        vi.doMock('@pryzm/schemas', async () => {
            const actual = await vi.importActual<typeof import('@pryzm/schemas')>('@pryzm/schemas');
            return {
                ...actual,
                runFamilyPipeline: () => { throw 'kaboom'; },
            };
        });
        const { registerFamilyFromJson: rffj } = await import('../src/registerFamilyFromJson.js');
        const result = rffj(makeSampleFamilyRequest(), store);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.kind).toBe('pipeline-threw');
            expect(result.message).toContain('non-Error');
            expect(result.message).toContain('kaboom');
        }
        vi.doUnmock('@pryzm/schemas');
        vi.resetModules();
    });

    // ── 24. Pipeline-throw: Error instance ─────────────────────────────────
    it('pipeline-throw (Error) → { ok: false, kind: "pipeline-threw", message=err.message }', async () => {
        vi.resetModules();
        vi.doMock('@pryzm/schemas', async () => {
            const actual = await vi.importActual<typeof import('@pryzm/schemas')>('@pryzm/schemas');
            return {
                ...actual,
                runFamilyPipeline: () => { throw new Error('transformer-internal contract violation'); },
            };
        });
        const { registerFamilyFromJson: rffj } = await import('../src/registerFamilyFromJson.js');
        const result = rffj(makeSampleFamilyRequest(), store);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.kind).toBe('pipeline-threw');
            expect(result.message).toBe('transformer-internal contract violation');
            // Pipeline-threw failures do NOT carry a Zod issues array.
            expect(result.issues).toBeUndefined();
        }
        vi.doUnmock('@pryzm/schemas');
        vi.resetModules();
    });

    // ── 25. ai.semanticNames empty array → ingestion-failed ────────────────
    // `FamilyAiHintSchema.semanticNames` enforces `.min(1)`; empty array
    // surfaces as a Zod issue rather than a silent success.
    it('empty ai.semanticNames → ingestion-failed (Zod min(1) on semanticNames)', () => {
        const req = makeSampleFamilyRequest();
        req.ai = { semanticNames: [], synonyms: [], cuesForPrompts: [] };
        const result = registerFamilyFromJson(req, store);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.kind).toBe('ingestion-failed');
            expect(result.issues!.length).toBeGreaterThan(0);
        }
    });

    // ── 26. Invalid input does NOT modify byId from an existing entry ─────
    it('ingestion-failed on a second call leaves the first registration intact', () => {
        const first = registerFamilyFromJson(makeSampleFamilyRequest(), store, pinnedOpts());
        if (!first.ok) throw new Error('expected first success');

        const second = registerFamilyFromJson({}, store);
        expect(second.ok).toBe(false);

        // First entry still findable.
        const found = store.findById(first.registered.identity.id as FamilyId);
        expect(found).toBe(first.registered);
        expect(Object.keys(store.get().byId)).toHaveLength(1);
    });
});
