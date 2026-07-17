// §L-384 — the CLEAR-then-recreate RE-DRAW contract. The C19 §1.4 parcel polygon is an
// IMMUTABLE one-shot: `site.setParcelBoundary` rejects a second commit with
// `parcel-already-set`. Re-drawing therefore CLEARS the boundary via `site.replace`
// (dispatchClearParcelBoundary), after which a fresh boundary commits cleanly — never a
// mutation of the immutable polygon. This pins that exact contract on the real store +
// commands (the seam the map's "Redraw" + onboarding "← Back to drawing" reuse).
//
// NOTE: imports the real `@pryzm/stores` — runs in CI/main; in an isolated worktree with
// an incomplete node_modules link it is skipped by the runner (same gap as the existing
// @pryzm/climate-host editor suites), not a failure of this code.

import { describe, it, expect } from 'vitest';
import { SiteModelStore, siteCreate, siteSetParcelBoundary } from '@pryzm/stores';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import { dispatchClearParcelBoundary } from '../src/ui/site/siteDispatch.js';

const BOUNDARY = {
    polygon: [
        { x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }, { x: 0, z: 10 },
    ],
    edgeClassifications: ['front', 'side', 'rear', 'side'] as const,
};

function ctxFor(store: SiteModelStore) {
    const events: Array<{ type: string }> = [];
    const rt = { events: { emit: (t: string) => { events.push({ type: t }); } } } as unknown as PryzmRuntime;
    return {
        ctx: { rt, store, projectId: 'proj-1', toast: () => {} },
        events,
    };
}

describe('§L-384 dispatchClearParcelBoundary — C19-safe re-draw', () => {
    it('clears a committed boundary via site.replace so a fresh boundary can commit', () => {
        const store = new SiteModelStore();
        const cr = siteCreate({ projectId: 'proj-1', location: { latitude: 41.39, longitude: 2.16 } }, store);
        expect(cr.ok).toBe(true);
        const siteId = cr.ok ? cr.event.siteId : '';

        // First commit succeeds.
        expect(siteSetParcelBoundary({ siteId, boundary: BOUNDARY }, store).ok).toBe(true);
        // Second commit is REJECTED — the C19 §1.4 one-shot (this is the trap L-384 fixes).
        const rejected = siteSetParcelBoundary({ siteId, boundary: BOUNDARY }, store);
        expect(rejected.ok).toBe(false);
        expect(rejected.ok ? '' : rejected.reason).toBe('parcel-already-set');

        // CLEAR-then-recreate: dispatchClearParcelBoundary empties the boundary (site.replace).
        const { ctx } = ctxFor(store);
        expect(dispatchClearParcelBoundary(ctx)).toBe(true);
        expect(store.getParcelBoundary()?.polygon.length ?? 0).toBe(0);

        // A fresh boundary now commits cleanly — the re-draw path works.
        expect(siteSetParcelBoundary({ siteId, boundary: BOUNDARY }, store).ok).toBe(true);
    });

    it('is a safe no-op (returns true) when no boundary is committed yet', () => {
        const store = new SiteModelStore();
        siteCreate({ projectId: 'proj-2', location: { latitude: 0, longitude: 0 } }, store);
        const { ctx } = ctxFor(store);
        expect(dispatchClearParcelBoundary(ctx)).toBe(true);
    });

    it('fires the store subscribe notification on clear (scene renderer drops its outline)', () => {
        const store = new SiteModelStore();
        const cr = siteCreate({ projectId: 'proj-3', location: { latitude: 41.39, longitude: 2.16 } }, store);
        const siteId = cr.ok ? cr.event.siteId : '';
        siteSetParcelBoundary({ siteId, boundary: BOUNDARY }, store);
        let fired = 0;
        store.subscribe(() => { fired++; });
        const { ctx } = ctxFor(store);
        dispatchClearParcelBoundary(ctx);
        expect(fired).toBeGreaterThan(0);
    });
});
