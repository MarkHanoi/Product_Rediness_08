// §MANUALENV159 (L-12640) — the L5 REACHABILITY test for `applyUserSuppliedStudyHeight`: the
// founder's own click path ("type a height for a study massing") against a REAL `SiteModelStore`,
// never a pure-function unit test in isolation (memory: [[committed-is-not-reachable]]).
//
// Mirrors `contextDerivedStudyEnvelopeWiring.test.ts`'s own template, but needs no network stub at
// all — `applyUserSuppliedStudyHeight` is pure geometry once a parcel boundary is committed, so the
// boundary here is committed directly via `site.setParcelBoundary` rather than the full
// `dispatchParcelBoundary` → `applyZoning` async chain.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SiteModelStore, siteCreate, siteSetParcelBoundary } from '@pryzm/stores';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import {
    resolveSiteContext,
    applyUserSuppliedStudyHeight,
    restoreSiteState,
    resetSiteDispatchProjectState,
    type SiteContext,
} from '../src/ui/site/siteDispatch.js';
import {
    getContextDerivedStudyEnvelope,
    resetContextDerivedStudyEnvelopeState,
} from '../src/ui/site/contextDerivedStudyEnvelopeState.js';
import {
    getUserSuppliedStudyHeight,
    restoreUserSuppliedStudyHeights,
    resetUserSuppliedStudyHeightState,
    serializeUserSuppliedStudyHeights,
} from '../src/ui/site/userSuppliedStudyHeightState.js';

const RING_20x10 = [
    { x: 0, z: 0 }, { x: 20, z: 0 }, { x: 20, z: 10 }, { x: 0, z: 10 },
];
const EDGES = ['front', 'side', 'rear', 'side'] as const;

function freshCtx(projectId: string): { ctx: SiteContext; store: SiteModelStore; rt: PryzmRuntime } {
    const store = new SiteModelStore();
    const rt = { siteModelStore: store, events: { emit: (): void => {} } } as unknown as PryzmRuntime;
    siteCreate({ projectId, location: { latitude: 52.37, longitude: 4.90 } }, store);
    const ctx: SiteContext = { rt, store, projectId, toast: () => {} };
    return { ctx, store, rt };
}

function commitBoundary(store: SiteModelStore): void {
    const site = store.getSite()!;
    const res = siteSetParcelBoundary(
        { siteId: site.id, boundary: { polygon: RING_20x10, edgeClassifications: [...EDGES] } },
        store,
    );
    expect(res.ok).toBe(true);
}

beforeEach(() => {
    resetContextDerivedStudyEnvelopeState();
    resetUserSuppliedStudyHeightState();
});
afterEach(() => {
    resetContextDerivedStudyEnvelopeState();
    resetUserSuppliedStudyHeightState();
});

describe('§MANUALENV159 — applyUserSuppliedStudyHeight reachability', () => {
    it('RED: no committed parcel boundary yet — returns null, writes NOTHING', () => {
        const { ctx, store } = freshCtx('proj-no-boundary');
        const result = applyUserSuppliedStudyHeight(ctx, 24.5);
        expect(result).toBeNull();
        expect(getContextDerivedStudyEnvelope(store.getSite()!.id)).toBeNull();
    });

    it('GREEN: the founder\'s own value (24.5 m) builds a study and writes BOTH state slots', () => {
        const { ctx, store } = freshCtx('proj-manualenv-1');
        commitBoundary(store);
        const siteId = store.getSite()!.id;

        const result = applyUserSuppliedStudyHeight(ctx, 24.5);
        expect(result).not.toBeNull();
        expect(result!.ok).toBe(true);
        if (!result!.ok) return;
        expect(result!.study.maxHeight_m).toBe(24.5);
        expect(result!.study.heightBasis.method).toBe('user-supplied');
        expect(result!.study.status).toBe('context-derived-study');

        // The SAME slot the context-derived study writes — one card renderer serves both.
        const displayed = getContextDerivedStudyEnvelope(siteId);
        expect(displayed).not.toBeNull();
        expect(displayed!.ok).toBe(true);
        if (!displayed!.ok) return;
        expect(displayed!.study.maxHeight_m).toBe(24.5);

        // The RAW decision, project-persisted (not the computed object).
        const saved = getUserSuppliedStudyHeight(siteId);
        expect(saved).not.toBeNull();
        expect(saved!.heightM).toBe(24.5);
        expect(saved!.setbackM).toBe(0);
    });

    it('a bounds refusal leaves BOTH state slots UNTOUCHED — the user\'s prior save survives a typo', () => {
        const { ctx, store } = freshCtx('proj-manualenv-2');
        commitBoundary(store);
        const siteId = store.getSite()!.id;

        const first = applyUserSuppliedStudyHeight(ctx, 24.5);
        expect(first!.ok).toBe(true);

        const second = applyUserSuppliedStudyHeight(ctx, 2450); // a plausible typo
        expect(second!.ok).toBe(false);
        if (second!.ok) return;
        expect(second!.reason).toBe('height-out-of-bounds');

        // The display slot and the persisted decision still hold the FIRST (valid) save.
        const displayed = getContextDerivedStudyEnvelope(siteId);
        expect(displayed!.ok).toBe(true);
        if (!displayed!.ok) return;
        expect(displayed!.study.maxHeight_m).toBe(24.5);
        expect(getUserSuppliedStudyHeight(siteId)!.heightM).toBe(24.5);
    });

    it('PROVENANCE DIFFERS FROM A DERIVED SAVE at the exact write site — never `median-neighbour-height`', () => {
        const { ctx, store } = freshCtx('proj-manualenv-3');
        commitBoundary(store);
        const result = applyUserSuppliedStudyHeight(ctx, 24.5);
        expect(result!.ok).toBe(true);
        if (!result!.ok) return;
        expect(result!.study.heightBasis.method).not.toBe('median-neighbour-height');
    });
});

describe('§MANUALENV159 — C13 §4 project-switch isolation', () => {
    it('resetSiteDispatchProjectState clears BOTH the display slot and the persisted decision', () => {
        const { ctx, store } = freshCtx('proj-manualenv-teardown');
        commitBoundary(store);
        const siteId = store.getSite()!.id;
        applyUserSuppliedStudyHeight(ctx, 24.5);
        expect(getContextDerivedStudyEnvelope(siteId)).not.toBeNull();
        expect(getUserSuppliedStudyHeight(siteId)).not.toBeNull();

        resetSiteDispatchProjectState();

        expect(getContextDerivedStudyEnvelope(siteId)).toBeNull();
        expect(getUserSuppliedStudyHeight(siteId)).toBeNull();
    });
});

describe('§MANUALENV159 — persistence round-trip: save, "reload" into a FRESH store, rehydrate', () => {
    it('a project-persisted decision is REBUILT against the restored parcel ring on load (not merely replayed)', () => {
        // ── Session 1: type a height, commit it. ──────────────────────────────────────────
        const { ctx: ctx1, store: store1 } = freshCtx('proj-manualenv-reload');
        commitBoundary(store1);
        const saveResult = applyUserSuppliedStudyHeight(ctx1, 24.5, 1);
        expect(saveResult!.ok).toBe(true);
        const siteId = store1.getSite()!.id;
        const snapshot = serializeUserSuppliedStudyHeights();
        expect(snapshot).toBeDefined();
        const persistedSite = store1.getSite()!;

        // ── Simulate a full reload: fresh module state, exactly what a page refresh does. ──
        resetContextDerivedStudyEnvelopeState();
        resetUserSuppliedStudyHeightState();
        expect(getContextDerivedStudyEnvelope(siteId)).toBeNull();

        // ── Session 2: ProjectLoader's own call order — raw state FIRST, then restoreSiteState. ──
        restoreUserSuppliedStudyHeights(snapshot);
        const store2 = new SiteModelStore();
        const rt2 = { siteModelStore: store2, events: { emit: (): void => {} } } as unknown as PryzmRuntime;
        const restored = restoreSiteState(rt2, persistedSite);
        expect(restored).toBe(true);

        // The study is back — REBUILT from the persisted height + the just-restored ring, not a
        // stale footprint replayed verbatim.
        const rehydrated = getContextDerivedStudyEnvelope(siteId);
        expect(rehydrated).not.toBeNull();
        expect(rehydrated!.ok).toBe(true);
        if (!rehydrated!.ok) return;
        expect(rehydrated!.study.maxHeight_m).toBe(24.5);
        expect(rehydrated!.study.setback_m).toBe(1);
        expect(rehydrated!.study.heightBasis.method).toBe('user-supplied');
    });

    it('a snapshot with NO manualStudyHeight key rehydrates nothing and never throws (backward compat)', () => {
        const { store: store1 } = freshCtx('proj-manualenv-nokey');
        commitBoundary(store1);
        const persistedSite = store1.getSite()!;

        restoreUserSuppliedStudyHeights(undefined); // exactly what a pre-lane snapshot yields
        const store2 = new SiteModelStore();
        const rt2 = { siteModelStore: store2, events: { emit: (): void => {} } } as unknown as PryzmRuntime;
        expect(() => restoreSiteState(rt2, persistedSite)).not.toThrow();
        expect(getContextDerivedStudyEnvelope(persistedSite.id)).toBeNull();
    });
});

// Keep `resolveSiteContext` imported so a future reader can see it is the SAME resolver the real
// click handler (`GISAreaLayout.ts`'s `wireStudyHeightEntry`) uses — this suite builds `ctx`
// directly instead only because `resolveSiteContext` reads `window.runtime`, which this Node
// environment does not have.
void resolveSiteContext;
