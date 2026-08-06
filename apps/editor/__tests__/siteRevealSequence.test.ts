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
    it('runs frame-seed → anchor → arm-listener → mount → fade, in that exact order', () => {
        const { deps, calls } = harness();
        const result = runSiteRevealSequence(deps, TARGET);
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

    it('forwards lat/lon AND the geocoder bbox to the frame seed (else the 2D map cannot fitBounds)', () => {
        const { deps, frames } = harness();
        runSiteRevealSequence(deps, TARGET);
        expect(frames).toEqual([{ lat: 37.883, lon: -4.78, bbox: [-4.8, 37.87, -4.76, 37.9] }]);
    });

    it('omits bbox cleanly when the geocoder supplied none', () => {
        const { deps, frames } = harness();
        runSiteRevealSequence(deps, { lat: 1, lon: 2, address: 'x' });
        expect(frames).toEqual([{ lat: 1, lon: 2 }]);
    });
});

describe('§22 reveal sequence — §21 revert-note regression guards', () => {
    it('does NOT mount the split when the geocode frame could not be seeded (2D would open at world zoom)', () => {
        const { deps, calls } = harness({ seedGeocodeFrame: () => false });
        const result = runSiteRevealSequence(deps, TARGET);
        expect(result.mounted).toBe(false);
        expect(result.stoppedBecause).toBe('geocode-frame-not-seeded');
        expect(calls).not.toContain('mount');
        // and nothing downstream ran either — no half-applied sequence.
        expect(calls).toEqual([]);
    });

    it('does NOT mount the split when the site location could not be anchored (3D would render black)', () => {
        const { deps, calls } = harness({ anchorSiteLocation: () => false });
        const result = runSiteRevealSequence(deps, TARGET);
        expect(result.mounted).toBe(false);
        expect(result.stoppedBecause).toBe('site-location-not-anchored');
        expect(calls).toEqual(['seed']);
        expect(calls).not.toContain('mount');
    });

    it('treats a THROWING precondition as a failed precondition — still never mounts', () => {
        const a = harness({ seedGeocodeFrame: () => { throw new Error('no hook'); } });
        expect(runSiteRevealSequence(a.deps, TARGET).mounted).toBe(false);
        expect(a.calls).not.toContain('mount');

        const b = harness({ anchorSiteLocation: () => { throw new Error('no runtime'); } });
        expect(runSiteRevealSequence(b.deps, TARGET).mounted).toBe(false);
        expect(b.calls).not.toContain('mount');
    });

    it('arms the boundary listener BEFORE the mount (the mount auto-arms the draw tool — a commit must not fire into an empty bus)', () => {
        const { deps, calls } = harness();
        runSiteRevealSequence(deps, TARGET);
        expect(calls.indexOf('arm')).toBeLessThan(calls.indexOf('mount'));
    });

    it('reports not-mounted when the mount hook itself throws, and never claims the split is up', () => {
        const { deps, calls } = harness({ mountSplit: () => { throw new Error('not wired'); } });
        const result = runSiteRevealSequence(deps, TARGET);
        expect(result.mounted).toBe(false);
        expect(calls).toEqual(['seed', 'anchor', 'arm']);
    });

    it('a throwing fade does not un-mount or fail the reveal (presentation never gates)', () => {
        const { deps } = harness({ fadeInSplit: () => { throw new Error('css boom'); } });
        const result = runSiteRevealSequence(deps, TARGET);
        expect(result.mounted).toBe(true);
        expect(result.steps).not.toContain('fade-in-split');
    });

    it('works with the optional dependencies omitted entirely', () => {
        const calls: string[] = [];
        const result = runSiteRevealSequence(
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
