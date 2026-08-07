// PRYZM-EARTH-ONBOARDING PRD §22 (docs/03-execution/plans/PRYZM-EARTH-ONBOARDING-PRD-2026-08-06.md)
// — the zoom-then-split reveal SEQUENCE. DOM-free (mirrors `globeHeroSearch.test.ts`).
//
// These are the REGRESSION tests for the §21 revert: the split must NEVER mount before BOTH
//   (a) the 2D pane's geocode frame has been seeded (`pryzmSetGeocodeFrame`), and
//   (b) the site location has been anchored (`dispatchSiteLocation`)
// have actually run — mounting out of order is what produced a world-zoom 2D map and a black
// 3D pane in the founder's live test.

import { describe, it, expect } from 'vitest';
import { runSiteRevealSequence, type SiteRevealDeps, type SiteRevealTarget } from '../src/ui/onboarding/siteRevealSequence.js';

const TARGET: SiteRevealTarget = {
    lat: 37.883,
    lon: -4.78,
    address: 'Córdoba, Spain',
    bbox: [-4.8, 37.87, -4.76, 37.9],
};

function harness(over?: Partial<SiteRevealDeps>) {
    const calls: string[] = [];
    const frames: unknown[] = [];
    const deps: SiteRevealDeps = {
        seedGeocodeFrame: (f) => { calls.push('seed'); frames.push(f); return true; },
        anchorSiteLocation: () => { calls.push('anchor'); return true; },
        armBoundaryListener: () => { calls.push('arm'); },
        mountSplit: () => { calls.push('mount'); },
        fadeInSplit: () => { calls.push('fade'); },
        ...over,
    };
    return { deps, calls, frames };
}

describe('§22 reveal sequence — the ORDER is the contract', () => {
    it('runs frame-seed → anchor → arm-listener → mount → fade, in that exact order', async () => {
        const { deps, calls } = harness();
        const result = await runSiteRevealSequence(deps, TARGET);
        expect(result.mounted).toBe(true);
        expect(calls).toEqual(['seed', 'anchor', 'arm', 'mount', 'fade']);
        expect(result.steps).toEqual([
            'seed-geocode-frame',
            'anchor-site-location',
            'arm-boundary-listener',
            'mount-split',
            'fade-in-split',
        ]);
    });

    it('forwards lat/lon AND the geocoder bbox to the frame seed (else the 2D map cannot fitBounds)', async () => {
        const { deps, frames } = harness();
        await runSiteRevealSequence(deps, TARGET);
        expect(frames).toEqual([{ lat: 37.883, lon: -4.78, bbox: [-4.8, 37.87, -4.76, 37.9] }]);
    });

    it('omits bbox cleanly when the geocoder supplied none', async () => {
        const { deps, frames } = harness();
        await runSiteRevealSequence(deps, { lat: 1, lon: 2, address: 'x' });
        expect(frames).toEqual([{ lat: 1, lon: 2 }]);
    });
});

describe('§22 reveal sequence — §21 revert-note regression guards', () => {
    it('does NOT mount the split when the geocode frame could not be seeded (2D would open at world zoom)', async () => {
        const { deps, calls } = harness({ seedGeocodeFrame: () => false });
        const result = await runSiteRevealSequence(deps, TARGET);
        expect(result.mounted).toBe(false);
        expect(result.stoppedBecause).toBe('geocode-frame-not-seeded');
        expect(calls).not.toContain('mount');
        // and nothing downstream ran either — no half-applied sequence.
        expect(calls).toEqual([]);
    });

    it('does NOT mount the split when the site location could not be anchored (3D would render black)', async () => {
        const { deps, calls } = harness({ anchorSiteLocation: () => false });
        const result = await runSiteRevealSequence(deps, TARGET);
        expect(result.mounted).toBe(false);
        expect(result.stoppedBecause).toBe('site-location-not-anchored');
        expect(calls).toEqual(['seed']);
        expect(calls).not.toContain('mount');
    });

    it('treats a THROWING precondition as a failed precondition — still never mounts', async () => {
        const a = harness({ seedGeocodeFrame: () => { throw new Error('no hook'); } });
        expect((await runSiteRevealSequence(a.deps, TARGET)).mounted).toBe(false);
        expect(a.calls).not.toContain('mount');

        const b = harness({ anchorSiteLocation: () => { throw new Error('no runtime'); } });
        expect((await runSiteRevealSequence(b.deps, TARGET)).mounted).toBe(false);
        expect(b.calls).not.toContain('mount');
    });

    it('arms the boundary listener BEFORE the mount (the mount auto-arms the draw tool — a commit must not fire into an empty bus)', async () => {
        const { deps, calls } = harness();
        await runSiteRevealSequence(deps, TARGET);
        expect(calls.indexOf('arm')).toBeLessThan(calls.indexOf('mount'));
    });

    it('reports not-mounted when the mount hook itself throws, and never claims the split is up', async () => {
        const { deps, calls } = harness({ mountSplit: () => { throw new Error('not wired'); } });
        const result = await runSiteRevealSequence(deps, TARGET);
        expect(result.mounted).toBe(false);
        expect(calls).toEqual(['seed', 'anchor', 'arm']);
    });

    it('a throwing fade does not un-mount or fail the reveal (presentation never gates)', async () => {
        const { deps } = harness({ fadeInSplit: () => { throw new Error('css boom'); } });
        const result = await runSiteRevealSequence(deps, TARGET);
        expect(result.mounted).toBe(true);
        expect(result.steps).not.toContain('fade-in-split');
    });

    it('works with the optional dependencies omitted entirely', async () => {
        const calls: string[] = [];
        const result = await runSiteRevealSequence(
            {
                seedGeocodeFrame: () => { calls.push('seed'); return true; },
                anchorSiteLocation: () => { calls.push('anchor'); return true; },
                mountSplit: () => { calls.push('mount'); },
            },
            TARGET,
        );
        expect(result.mounted).toBe(true);
        expect(calls).toEqual(['seed', 'anchor', 'mount']);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// §REVEAL-CONTENT-READY (founder 2026-08-06) — "KEEP THAT LOADING IN THE BACKGROUND … START
// ZOOMING … THEN transition to the split view (which will have been loading in the background
// and will be ready by now)."
//
// The binding requirement is that the transition is gated on a REAL READINESS SIGNAL and not on a
// clock: a fixed delay stalls a warm cache and cuts to a half-built view on a slow one. So these
// tests assert ORDERING AGAINST A CONTROLLED PROMISE — nothing here measures or waits on time, and
// a `setTimeout`-based implementation could not pass them.
describe('§REVEAL-CONTENT-READY — the split waits for CONTENT, never for a clock', () => {
    it('does not mount until the content promise settles', async () => {
        let release!: () => void;
        const gate = new Promise<void>((r) => { release = r; });
        const { deps, calls } = harness({ awaitContentReady: () => gate });

        const running = runSiteRevealSequence(deps, TARGET);
        // Let every synchronous step and one microtask turn drain. The preconditions must be done
        // (so a wiring defect still fails fast) but the split must NOT be up yet.
        await Promise.resolve();
        await Promise.resolve();
        expect(calls).toContain('anchor');
        expect(calls).not.toContain('mount');

        release();
        const result = await running;
        expect(result.mounted).toBe(true);
        expect(calls).toEqual(['seed', 'anchor', 'arm', 'mount', 'fade']);
    });

    it('gates AFTER the preconditions and BEFORE the mount — a wiring defect still fails fast', async () => {
        let awaited = false;
        const { deps } = harness({ awaitContentReady: async () => { awaited = true; } });
        const result = await runSiteRevealSequence(deps, TARGET);
        expect(result.steps).toEqual([
            'seed-geocode-frame', 'anchor-site-location', 'arm-boundary-listener',
            'await-content-ready', 'mount-split', 'fade-in-split',
        ]);
        expect(awaited).toBe(true);
    });

    it('never waits when a precondition already stopped the sequence', async () => {
        let awaited = false;
        const { deps } = harness({
            seedGeocodeFrame: () => false,
            awaitContentReady: async () => { awaited = true; },
        });
        const result = await runSiteRevealSequence(deps, TARGET);
        expect(result.mounted).toBe(false);
        // Waiting on a load for a split that will never mount is pure stall.
        expect(awaited).toBe(false);
    });

    it('does not stall when the content is ALREADY ready — an early finish is not made to wait', async () => {
        const { deps, calls } = harness({ awaitContentReady: () => Promise.resolve('warm') });
        const result = await runSiteRevealSequence(deps, TARGET);
        expect(result.mounted).toBe(true);
        expect(calls).toEqual(['seed', 'anchor', 'arm', 'mount', 'fade']);
    });

    it('reveals anyway when the content load FAILS — a failed context read must not strand the user', async () => {
        const { deps, calls } = harness({ awaitContentReady: () => Promise.reject(new Error('tiles down')) });
        const result = await runSiteRevealSequence(deps, TARGET);
        expect(result.mounted).toBe(true);
        expect(calls).toContain('mount');
    });

    it('mounts immediately when no readiness signal is supplied at all', async () => {
        // The pre-gate behaviour, preserved: an older bundle or a search that skipped the city
        // stage supplies no promise, and must not be punished with a wait.
        const { deps } = harness();
        const result = await runSiteRevealSequence(deps, TARGET);
        expect(result.mounted).toBe(true);
        expect(result.steps).not.toContain('await-content-ready');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// §REVEAL-FLIGHT-COMPLETE — the OTHER half of the gate. Content-readiness alone would cut to the
// split mid-descent; the founder asked for the zoom to happen and THEN the transition. So the
// reveal fires when the LATER of {content, flight} lands.
describe('§REVEAL-FLIGHT-COMPLETE — the reveal waits for BOTH gates', () => {
    function gate() {
        let release!: () => void;
        const promise = new Promise<void>((r) => { release = r; });
        return { promise, release };
    }

    it('waits for the FLIGHT even when the content is already warm', async () => {
        const flight = gate();
        const { deps, calls } = harness({
            awaitContentReady: () => Promise.resolve('warm'),
            awaitFlightComplete: () => flight.promise,
        });
        const running = runSiteRevealSequence(deps, TARGET);
        for (let i = 0; i < 6; i++) await Promise.resolve();
        // Content is ready, but the camera is still descending — cutting now would interrupt
        // the very zoom the founder asked for.
        expect(calls).not.toContain('mount');
        flight.release();
        expect((await running).mounted).toBe(true);
        expect(calls).toContain('mount');
    });

    it('waits for the CONTENT even when the flight has already landed', async () => {
        const content = gate();
        const { deps, calls } = harness({
            awaitContentReady: () => content.promise,
            awaitFlightComplete: () => Promise.resolve(),
        });
        const running = runSiteRevealSequence(deps, TARGET);
        for (let i = 0; i < 6; i++) await Promise.resolve();
        expect(calls).not.toContain('mount');
        content.release();
        expect((await running).mounted).toBe(true);
    });

    it('starts BOTH gates concurrently — the flight is observed even if the content resolves first', async () => {
        const order: string[] = [];
        const { deps } = harness({
            awaitContentReady: () => { order.push('content-started'); return Promise.resolve(); },
            awaitFlightComplete: () => { order.push('flight-started'); return Promise.resolve(); },
        });
        await runSiteRevealSequence(deps, TARGET);
        // Sequential awaiting would only start the flight gate after the content settled; both
        // must be in flight before either is awaited.
        expect(order).toEqual(['content-started', 'flight-started']);
    });

    it('records both gate steps, between the arm and the mount', async () => {
        const { deps } = harness({
            awaitContentReady: () => Promise.resolve(),
            awaitFlightComplete: () => Promise.resolve(),
        });
        const result = await runSiteRevealSequence(deps, TARGET);
        expect(result.steps).toEqual([
            'seed-geocode-frame', 'anchor-site-location', 'arm-boundary-listener',
            'await-content-ready', 'await-flight-complete', 'mount-split', 'fade-in-split',
        ]);
    });

    it('reveals when the user CANCELS the flight — an overridden animation must not hold the split hostage', async () => {
        // The port resolves on cancel as well as completion, so a user who grabs the globe
        // mid-descent gets their split at once. This is why the gate is not a minimum duration.
        const { deps, calls } = harness({
            awaitContentReady: () => Promise.resolve(),
            awaitFlightComplete: () => Promise.resolve(), // settled early == cancelled
        });
        expect((await runSiteRevealSequence(deps, TARGET)).mounted).toBe(true);
        expect(calls).toContain('mount');
    });

    it('reveals anyway when the flight gate REJECTS (a refused camera must not strand the user)', async () => {
        const { deps } = harness({
            awaitContentReady: () => Promise.resolve(),
            awaitFlightComplete: () => Promise.reject(new Error('no globe')),
        });
        expect((await runSiteRevealSequence(deps, TARGET)).mounted).toBe(true);
    });
});
