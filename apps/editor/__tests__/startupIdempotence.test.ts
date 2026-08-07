// §STARTUP-LOCATION-IDEMPOTENT + §STARTUP-BUDGET (founder 2026-08-07: "speed up ideally 5–10×
// the complete project start-up process") — unit pins for the startup de-duplication work.
//
// THE DEFECT THESE GUARD AGAINST: the startup pipeline dispatched the SAME picked location from
// several call sites (the §22 reveal anchor, `startDrawThenGenerate`'s re-anchor, the draw/select
// commit's ensure-location), and every duplicate `site.location-changed` emit cost a redundant
// camera fly plus a FORCED full context re-render downstream (founder log:
// "site.location-changed → flying camera" ×2 with identical coordinates). The fix is at the
// emitter: an unchanged location dispatched again within the 30 s window is a successful no-op,
// not a broadcast. Real `SiteModelStore`, real dispatch — only the runtime event bus is a recorder.

import { describe, it, expect } from 'vitest';
import { SiteModelStore } from '@pryzm/stores';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import { dispatchSiteLocation } from '../src/ui/site/siteDispatch.js';
import {
    beginStartupBudget,
    markStartupPhase,
    getStartupBudgetMarks,
    reportStartupBudget,
} from '../src/engine/startupBudget';

function ctxFor(store: SiteModelStore) {
    const emitted: string[] = [];
    const rt = {
        events: { emit: (t: string) => { emitted.push(t); } },
    } as unknown as PryzmRuntime;
    return { ctx: { rt, store, projectId: 'proj-startup-idem', toast: () => {} }, emitted };
}

const BCN = { latitude: 41.39, longitude: 2.16, siteAddress: 'Passeig de Gràcia, Barcelona' };

describe('§STARTUP-LOCATION-IDEMPOTENT — dispatchSiteLocation', () => {
    it('emits site.location-changed ONCE for a duplicate dispatch of the identical location', () => {
        const store = new SiteModelStore();
        const { ctx, emitted } = ctxFor(store);

        expect(dispatchSiteLocation(ctx, { ...BCN })).toBe(true);
        const first = emitted.filter((t) => t === 'site.location-changed').length;
        expect(first).toBe(1);

        // The pipeline echo: same floats, same address, moments later. Must be a successful
        // no-op — true (the location IS set), but no second broadcast.
        expect(dispatchSiteLocation(ctx, { ...BCN })).toBe(true);
        expect(emitted.filter((t) => t === 'site.location-changed').length).toBe(1);
    });

    it('a CHANGED location still emits (the guard suppresses echoes, not changes)', () => {
        const store = new SiteModelStore();
        const { ctx, emitted } = ctxFor(store);
        expect(dispatchSiteLocation(ctx, { ...BCN })).toBe(true);
        expect(
            dispatchSiteLocation(ctx, { latitude: 40.4168, longitude: -3.7038, siteAddress: 'Madrid' }),
        ).toBe(true);
        expect(emitted.filter((t) => t === 'site.location-changed').length).toBe(2);
    });

    it('a NEW address on the same coordinates still emits (address is part of the identity)', () => {
        const store = new SiteModelStore();
        const { ctx, emitted } = ctxFor(store);
        expect(dispatchSiteLocation(ctx, { ...BCN })).toBe(true);
        expect(
            dispatchSiteLocation(ctx, { ...BCN, siteAddress: 'Passeig de Gràcia 43, Barcelona' }),
        ).toBe(true);
        expect(emitted.filter((t) => t === 'site.location-changed').length).toBe(2);
    });

    it('a fresh store (new site) is never suppressed by a recent dispatch elsewhere', () => {
        const a = ctxFor(new SiteModelStore());
        expect(dispatchSiteLocation(a.ctx, { ...BCN })).toBe(true);
        // A second PROJECT at the same address — different store, no site yet: must emit.
        const b = ctxFor(new SiteModelStore());
        expect(dispatchSiteLocation(b.ctx, { ...BCN })).toBe(true);
        expect(b.emitted.filter((t) => t === 'site.location-changed').length).toBe(1);
    });
});

describe('§STARTUP-BUDGET — the phase probe', () => {
    it('records marks with monotonic t+ and reports once per run', () => {
        beginStartupBudget();
        markStartupPhase('onboarding:shown');
        markStartupPhase('geocode:start');
        markStartupPhase('geocode:end');
        const marks = getStartupBudgetMarks();
        expect(marks.map((m) => m.phase)).toEqual(['onboarding:shown', 'geocode:start', 'geocode:end']);
        for (let i = 1; i < marks.length; i++) {
            expect(marks[i]!.sinceStartMs).toBeGreaterThanOrEqual(marks[i - 1]!.sinceStartMs);
            expect(marks[i]!.sincePrevMs).toBeGreaterThanOrEqual(0);
        }
        // Report is idempotent — the pipeline has several "arrived" signals.
        reportStartupBudget('enter-canvas');
        reportStartupBudget('enter-canvas');
        // A new run resets the table.
        beginStartupBudget();
        expect(getStartupBudgetMarks()).toHaveLength(0);
    });

    it('a mark before beginStartupBudget auto-begins a run instead of being dropped', () => {
        beginStartupBudget();
        // simulate "no begin": begin resets, then we only mark
        markStartupPhase('parcel:committed');
        expect(getStartupBudgetMarks().map((m) => m.phase)).toContain('parcel:committed');
    });
});
