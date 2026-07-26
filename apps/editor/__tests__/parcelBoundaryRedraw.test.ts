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
import { dispatchClearParcelBoundary, dispatchSiteTrueNorth } from '../src/ui/site/siteDispatch.js';

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

    // §SEAM-2 INCREMENT 1 (g3) — a Redraw must NOT leak the previous parcel's project-north θ. The
    // boundary is what DERIVES θ, so clearing the boundary while leaving trueNorth at a stale ±45°
    // means the next (θ=0) parcel is read/de-rotated against an angle it never produced — the live
    // Barcelona→θ=0 displacement. dispatchClearParcelBoundary resets trueNorth to the identity.
    it('§SEAM-2 (g3) — resets trueNorth to 0 on clear (no stale θ leaks into the next Redraw)', () => {
        const store = new SiteModelStore();
        const cr = siteCreate({ projectId: 'proj-g3', location: { latitude: 41.39, longitude: 2.16 } }, store);
        const siteId = cr.ok ? cr.event.siteId : '';
        siteSetParcelBoundary({ siteId, boundary: BOUNDARY }, store);
        const { ctx } = ctxFor(store);
        // A Barcelona parcel committed θ ≈ 45°.
        expect(dispatchSiteTrueNorth(ctx, Math.PI / 4)).toBe(true);
        expect(store.getLocation()?.trueNorth ?? -1).toBeCloseTo(Math.PI / 4, 12);
        // Redraw → CLEAR. θ falls back to the identity, not the previous parcel's angle.
        expect(dispatchClearParcelBoundary(ctx)).toBe(true);
        expect(store.getLocation()?.trueNorth).toBe(0);
        expect(store.getParcelBoundary()?.polygon.length ?? 0).toBe(0);
    });
});

// §SEAM-2 INCREMENT 1 (g1/g2) — the θ WRITE contract that makes θ_write == θ_read unviolable.
// dispatchParcelBoundary now publishes θ via dispatchSiteTrueNorth UNCONDITIONALLY (including 0) and
// de-rotates the committed ring ONLY when that write succeeded. These pin the two properties that
// combination depends on: (g1) publishing 0 OVERWRITES a stale angle; (g2) a soft-reject is signalled
// by the boolean the caller must honour before de-rotating.
describe('§SEAM-2 dispatchSiteTrueNorth — unconditional + transactional θ write', () => {
    it('§SEAM-2 (g1) — publishes θ UNCONDITIONALLY, including 0, overwriting a prior parcel’s ±45°', () => {
        const store = new SiteModelStore();
        siteCreate({ projectId: 'proj-g1', location: { latitude: 41.39, longitude: 2.16 } }, store);
        const { ctx } = ctxFor(store);
        // A prior parcel set θ ≈ 45°.
        expect(dispatchSiteTrueNorth(ctx, Math.PI / 4)).toBe(true);
        expect(store.getLocation()?.trueNorth ?? -1).toBeCloseTo(Math.PI / 4, 12);
        // The next parcel folds to θ = 0. Publishing 0 must OVERWRITE the stale angle — the old
        // `if (projectNorthRad !== 0)` guard skipped this write and left ±45° behind (write≠read).
        expect(dispatchSiteTrueNorth(ctx, 0)).toBe(true);
        expect(store.getLocation()?.trueNorth).toBe(0);
    });

    it('§SEAM-2 (g2) — soft-rejects (returns false) when no Site exists, so the caller must NOT de-rotate', () => {
        const store = new SiteModelStore(); // no site created → dispatchSiteTrueNorth cannot write θ
        const { ctx } = ctxFor(store);
        expect(dispatchSiteTrueNorth(ctx, Math.PI / 4)).toBe(false);
    });
});
