// §FIX-BOUNDARY-COMMIT-REFUSE (ADR-0299 §Decision 1 + 2) — THE WEDGE.
//
// THE DEFECT THIS PINS
// --------------------
// The 2D draw surface (`SiteBoundaryMap2D`) tracks "has a boundary been committed?" in a
// LOCAL `committed` flag that only its OWN `commit()` sets. Any boundary authored through
// another path while that map is live — the onboarding draw watchdog's default 10×8 m plot,
// "Skip drawing", `createSiteFromRect` — leaves the map ARMED and LYING: the chip still says
// "Click two opposite corners", the select/draw toggle is still up, and "↺ Redraw boundary"
// (the only way out) is still hidden. That is the founder's screenshot: a surface in two
// states at once.
//
// The user then draws again, and `commit()` ran, in this order:
//   1. `dispatchSiteLocation(...)`   — REBASES the LTP-ENU origin onto the new ring. SUCCEEDS.
//   2. `dispatchParcelBoundary(...)` — REJECTED `parcel-already-set` (C19 §1.4 one-shot).
//   3. `freezeDraw()` + `onCommit()` — ran UNCONDITIONALLY, reporting a commit that did not
//                                      happen (ADR-0299 §2: "callers MUST NOT log a recovery
//                                      they did not perform").
// Net: the second parcel is silently discarded, the site origin has MOVED out from under the
// boundary that is still committed, and the map freezes on the lie. "Nothing can be done,
// another parcel cannot be selected."
//
// THE FIX these tests pin: `canCommitParcelBoundary()` — an explicit, store-derived REFUSAL
// asked BEFORE any mutation, so the impossible case is refused loudly instead of being half-
// performed. ADR-0299's test — "if the thing I am repairing were impossible by construction,
// would I notice?" — is answered YES by construction here.
//
// NOTE: imports the real `@pryzm/stores` (same dependency shape as parcelBoundaryRedraw.test.ts).

import { describe, it, expect } from 'vitest';
import { SiteModelStore, siteCreate, siteSetParcelBoundary } from '@pryzm/stores';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import {
    canCommitParcelBoundary,
    dispatchClearParcelBoundary,
    dispatchParcelBoundary,
    dispatchSiteLocation,
} from '../src/ui/site/siteDispatch.js';

/** The default 10×8 m plot the onboarding watchdog used to author behind the user's back. */
const DEFAULT_PLOT = {
    polygon: [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 8 }, { x: 0, z: 8 }],
    edgeClassifications: ['front', 'side', 'rear', 'side'] as const,
};

/** A real parcel the user then traces on the map — bigger, and somewhere else. */
const DRAWN_PARCEL = {
    polygon: [{ x: 100, z: 100 }, { x: 140, z: 100 }, { x: 140, z: 130 }, { x: 100, z: 130 }],
    edgeClassifications: ['front', 'side', 'rear', 'side'] as const,
};

function ctxFor(store: SiteModelStore) {
    const toasts: Array<{ message: string; severity: string }> = [];
    const rt = { events: { emit: () => { /* no subscribers in this harness */ } } } as unknown as PryzmRuntime;
    return {
        ctx: {
            rt,
            store,
            projectId: 'proj-wedge',
            toast: (message: string, severity: string) => { toasts.push({ message, severity }); },
        },
        toasts,
    };
}

function seedSiteWithDefaultPlot(): { store: SiteModelStore; siteId: string } {
    const store = new SiteModelStore();
    const cr = siteCreate({ projectId: 'proj-wedge', location: { latitude: 41.3825802, longitude: 2.177073 } }, store);
    expect(cr.ok).toBe(true);
    const siteId = cr.ok ? cr.event.siteId : '';
    // The watchdog's `createSiteFromRect` — a boundary authored with the map none the wiser.
    expect(siteSetParcelBoundary({ siteId, boundary: DEFAULT_PLOT }, store).ok).toBe(true);
    return { store, siteId };
}

describe('§FIX-BOUNDARY-COMMIT-REFUSE — the wedge (a second parcel cannot be committed)', () => {
    // ── The defect, reproduced from the store side ────────────────────────────────
    it('REPRODUCES the wedge: a second commit is rejected and the DRAWN parcel is silently discarded', () => {
        const { store } = seedSiteWithDefaultPlot();
        const { ctx } = ctxFor(store);

        // This is exactly what SiteBoundaryMap2D.commit() reaches when the user re-draws
        // after the watchdog authored a plot behind its back.
        const ok = dispatchParcelBoundary(ctx, {
            polygon: [...DRAWN_PARCEL.polygon],
            edgeClassifications: [...DRAWN_PARCEL.edgeClassifications],
        });
        expect(ok).toBe(false);

        // The user's parcel is GONE; the phantom 10×8 default is still the committed site.
        const committed = store.getParcelBoundary();
        expect(committed?.polygon.length).toBe(4);
        expect(committed?.polygon[2]).toEqual({ x: 10, z: 8 });
    });

    it('REPRODUCES the corruption: the origin rebase SUCCEEDS even though the commit cannot', () => {
        const { store } = seedSiteWithDefaultPlot();
        const { ctx } = ctxFor(store);

        // Step 1 of the old commit() — this is not gated on the boundary being committable.
        const moved = dispatchSiteLocation(ctx, { latitude: 41.4, longitude: 2.2, siteAddress: null });
        expect(moved).toBe(true);
        // Step 2 — refused. The frame has now moved out from under a boundary that never changed.
        expect(dispatchParcelBoundary(ctx, {
            polygon: [...DRAWN_PARCEL.polygon],
            edgeClassifications: [...DRAWN_PARCEL.edgeClassifications],
        })).toBe(false);
        expect(store.getLocation()?.latitude).toBeCloseTo(41.4, 6);
        expect(store.getParcelBoundary()?.polygon[2]).toEqual({ x: 10, z: 8 });
    });

    // ── The fix: refuse BEFORE mutating anything ──────────────────────────────────
    it('canCommitParcelBoundary REFUSES when a boundary is already committed, naming the reason and the way out', () => {
        const { store } = seedSiteWithDefaultPlot();
        const { ctx } = ctxFor(store);

        const verdict = canCommitParcelBoundary(ctx);
        expect(verdict.ok).toBe(false);
        expect(verdict.ok ? '' : verdict.reason).toBe('parcel-already-set');
        // ADR-0299 §2 — the refusal must be actionable, not just a "no".
        expect(verdict.ok ? '' : verdict.message).toMatch(/redraw/i);
    });

    it('canCommitParcelBoundary ALLOWS a first commit on a fresh site', () => {
        const store = new SiteModelStore();
        siteCreate({ projectId: 'proj-fresh', location: { latitude: 41.39, longitude: 2.16 } }, store);
        const { ctx } = ctxFor(store);
        expect(canCommitParcelBoundary(ctx).ok).toBe(true);
    });

    it('canCommitParcelBoundary ALLOWS a commit when there is no Site yet (dispatch creates it)', () => {
        const store = new SiteModelStore();
        const { ctx } = ctxFor(store);
        expect(canCommitParcelBoundary(ctx).ok).toBe(true);
    });

    it('the documented way out works: CLEAR (↺ Redraw) then the drawn parcel commits', () => {
        const { store } = seedSiteWithDefaultPlot();
        const { ctx } = ctxFor(store);

        expect(canCommitParcelBoundary(ctx).ok).toBe(false);
        expect(dispatchClearParcelBoundary(ctx)).toBe(true);
        expect(canCommitParcelBoundary(ctx).ok).toBe(true);

        expect(dispatchParcelBoundary(ctx, {
            polygon: [...DRAWN_PARCEL.polygon],
            edgeClassifications: [...DRAWN_PARCEL.edgeClassifications],
        })).toBe(true);
        // The user's parcel is now the committed one (rectangle squares to θ=0 ⇒ no rotation).
        const committed = store.getParcelBoundary();
        expect(committed?.polygon.length).toBe(4);
        expect(committed?.polygon).not.toEqual(DEFAULT_PLOT.polygon);
    });
});
