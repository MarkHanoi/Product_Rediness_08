// §ENVELOPE-VIA-MASSING (L-402d) — ORDERING regression guard for the render-not-firing
// root cause. The Forma 3D-Site live-update subscribes to `site.parcel-boundary-set` and
// does the FIRST (framing) render, reading the cached buildable envelope via
// `getLastBuildableEnvelope()`. Previously the envelope was computed AFTER that event
// emitted, so the framing render saw NO envelope and drew nothing (the purple study
// volume only appeared on a later `site.zoning-updated` pass — which a stale-input
// terrain re-place could also clobber). The fix computes + caches the envelope BEFORE
// emitting `site.parcel-boundary-set`. This test pins that ordering on the REAL store +
// commands: at the instant the framing event fires, the envelope is already cached.
//
// NOTE: imports the real `@pryzm/stores` + `@pryzm/site-parcel-data` — runs in CI/main;
// in an isolated worktree with an incomplete node_modules link it is skipped by the
// runner (same gap as the existing @pryzm/climate-host editor suites), not a failure.

import { describe, it, expect } from 'vitest';
import { SiteModelStore, siteCreate } from '@pryzm/stores';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import type { BuildableEnvelope } from '@pryzm/schemas';
import {
    dispatchParcelBoundary,
    getLastBuildableEnvelope,
} from '../src/ui/site/siteDispatch.js';

// A typical small Barcelona urban plot (~12 × 8 m) — the demo-critical case that the
// modest estimated setbacks (§ESTIMATED-SETBACK-MODEST) keep NON-degenerate.
const BOUNDARY = {
    polygon: [
        { x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 8 }, { x: 0, z: 8 },
    ],
    edgeClassifications: ['front', 'side', 'rear', 'side'] as const,
};

interface EmitRecord {
    readonly type: string;
    /** The envelope cached AT THE INSTANT this event was emitted (ordering probe). */
    readonly envelopeAtEmit: BuildableEnvelope | null;
}

function ctxFor(store: SiteModelStore) {
    const events: EmitRecord[] = [];
    const rt = {
        events: {
            emit: (t: string) => {
                // Capture what a synchronous handler of this event would see — the crux:
                // when `site.parcel-boundary-set` fires (the framing render), is the
                // envelope already cached?
                events.push({ type: t, envelopeAtEmit: getLastBuildableEnvelope() });
            },
        },
    } as unknown as PryzmRuntime;
    return { ctx: { rt, store, projectId: 'proj-env', toast: () => {} }, events };
}

describe('§ENVELOPE-VIA-MASSING — envelope cached BEFORE site.parcel-boundary-set (framing render)', () => {
    it('has the buildable envelope in hand at the instant the framing event fires', () => {
        const store = new SiteModelStore();
        siteCreate({ projectId: 'proj-env', location: { latitude: 41.39, longitude: 2.16 } }, store);
        const { ctx, events } = ctxFor(store);

        expect(dispatchParcelBoundary(ctx, BOUNDARY)).toBe(true);

        const framing = events.find((e) => e.type === 'site.parcel-boundary-set');
        expect(framing).toBeDefined();
        // THE REGRESSION GUARD — the framing render's envelope is already computed + cached.
        expect(framing!.envelopeAtEmit).not.toBeNull();
        expect(framing!.envelopeAtEmit!.status).toBe('ok');
        expect(framing!.envelopeAtEmit!.insetPolygon.length).toBeGreaterThanOrEqual(3);
    });

    it('emits site.parcel-boundary-set BEFORE site.zoning-updated (framing first, zoning after)', () => {
        const store = new SiteModelStore();
        siteCreate({ projectId: 'proj-env', location: { latitude: 41.39, longitude: 2.16 } }, store);
        const { ctx, events } = ctxFor(store);

        dispatchParcelBoundary(ctx, BOUNDARY);

        const order = events.map((e) => e.type);
        const iBoundary = order.indexOf('site.parcel-boundary-set');
        const iZoning = order.indexOf('site.zoning-updated');
        expect(iBoundary).toBeGreaterThanOrEqual(0);
        expect(iZoning).toBeGreaterThan(iBoundary);
    });

    it('leaves a NON-degenerate cached envelope for the BIM three.js renderer to consume', () => {
        const store = new SiteModelStore();
        siteCreate({ projectId: 'proj-env', location: { latitude: 41.39, longitude: 2.16 } }, store);
        const { ctx } = ctxFor(store);

        dispatchParcelBoundary(ctx, BOUNDARY);

        // The SINGLE producer both renderers read (Cesium resolveFormaEnvelope + the
        // three.js ParcelBoundarySceneRenderer.buildEnvelopeVolume).
        const env = getLastBuildableEnvelope();
        expect(env).not.toBeNull();
        expect(env!.status).toBe('ok');
        expect(env!.insetAreaM2).toBeGreaterThan(15); // ~21 m² on a 12×8 plot — visibly buildable
        expect(env!.maxHeight_m).toBe(12);
    });
});
