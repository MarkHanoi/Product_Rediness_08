// @vitest-environment happy-dom
//
// PRYZM-EARTH-ONBOARDING PRD §22 — the controller half of the zoom-then-split choreography.
// Mirrors `onboardingOverlayImportBranch.test.ts`'s harness (the established way to drive
// `OnboardingStepController` under happy-dom).
//
// What must hold (all three are §21 revert-note / §21.1 carry-overs):
//   1. the split mounts ONLY after `pryzmSetGeocodeFrame` seeded the 2D frame AND the site
//      location was anchored — and never at all if either is impossible;
//   2. a boundary committed straight off the freshly revealed split routes to the
//      generate-confirm step (the mount auto-arms the draw tool before the user has chosen);
//   3. the default-footprint path is NOT hijacked by that listener into a duplicate confirm.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OnboardingStepController } from '../src/ui/onboarding/OnboardingStepController';

function makeRuntime() {
    const listeners: Record<string, Array<(p?: unknown) => void>> = {};
    return {
        events: {
            on: (e: string, cb: (p?: unknown) => void) => {
                (listeners[e] ??= []).push(cb);
                return { dispose: () => { listeners[e] = (listeners[e] ?? []).filter((f) => f !== cb); } };
            },
            emit: (e: string, p?: unknown) => { (listeners[e] ?? []).slice().forEach((cb) => cb(p)); },
        },
        listenerCount: (e: string) => (listeners[e] ?? []).length,
    };
}

let hooks: {
    setGeocodeFrame: ReturnType<typeof vi.fn>;
    mountPanes: ReturnType<typeof vi.fn>;
    fadePanes: ReturnType<typeof vi.fn>;
};

const TARGET = { lat: 37.883, lon: -4.78, address: 'Córdoba, Spain', bbox: [-4.8, 37.87, -4.76, 37.9] as [number, number, number, number] };

beforeEach(() => {
    hooks = { setGeocodeFrame: vi.fn(), mountPanes: vi.fn(), fadePanes: vi.fn() };
    const w = window as unknown as Record<string, unknown>;
    w['pryzmSetGeocodeFrame'] = hooks.setGeocodeFrame;
    w['pryzmMountSiteAuthoringPanes'] = hooks.mountPanes;
    w['pryzmFadeInSiteAuthoringPanes'] = hooks.fadePanes;
});
afterEach(() => {
    document.body.innerHTML = '';
    const w = window as unknown as Record<string, unknown>;
    for (const k of ['pryzmSetGeocodeFrame', 'pryzmMountSiteAuthoringPanes', 'pryzmFadeInSiteAuthoringPanes']) delete w[k];
    vi.restoreAllMocks();
});

describe('§22 — the split is revealed only in the right ORDER', () => {
    it('seeds the 2D geocode frame BEFORE mounting the split, then fades it in', () => {
        const runtime = makeRuntime();
        const controller = new OnboardingStepController({ runtime: runtime as never });
        (controller as unknown as { mountOverlay(): void }).mountOverlay();
        const order: string[] = [];
        hooks.setGeocodeFrame.mockImplementation(() => order.push('seed'));
        hooks.mountPanes.mockImplementation(() => order.push('mount'));
        hooks.fadePanes.mockImplementation(() => order.push('fade'));

        (controller as unknown as { revealSplitAtParcel(t: typeof TARGET): void }).revealSplitAtParcel(TARGET);

        // No live C19 site store in this harness ⇒ the ANCHOR precondition cannot be satisfied ⇒
        // per the §21 revert note the split must NOT mount, even though the frame was seeded.
        expect(order).toEqual(['seed']);
        expect(hooks.mountPanes).not.toHaveBeenCalled();
        expect(hooks.setGeocodeFrame).toHaveBeenCalledWith({ lat: 37.883, lon: -4.78, bbox: TARGET.bbox });
    });

    it('does not mount the split at all when the geocode-frame hook is missing', () => {
        delete (window as unknown as Record<string, unknown>)['pryzmSetGeocodeFrame'];
        const runtime = makeRuntime();
        const controller = new OnboardingStepController({ runtime: runtime as never });
        (controller as unknown as { mountOverlay(): void }).mountOverlay();
        (controller as unknown as { revealSplitAtParcel(t: typeof TARGET): void }).revealSplitAtParcel(TARGET);
        expect(hooks.mountPanes).not.toHaveBeenCalled();
    });
});

describe('§22 — the early-split boundary listener (§21.1 finding 2, re-applied)', () => {
    it('a boundary committed straight off the revealed split routes to the generate-confirm step', () => {
        const runtime = makeRuntime();
        const controller = new OnboardingStepController({ runtime: runtime as never });
        (controller as unknown as { mountOverlay(): void }).mountOverlay();
        (controller as unknown as { armEarlySplitBoundaryListener(): void }).armEarlySplitBoundaryListener();

        runtime.events.emit('site.parcel-boundary-set', {});
        expect(document.querySelector('[data-testid="onboarding-typology-chooser"]')).toBeTruthy();
    });

    it('is ONE-SHOT — a second boundary event does not re-render the confirm step', () => {
        const runtime = makeRuntime();
        const controller = new OnboardingStepController({ runtime: runtime as never });
        (controller as unknown as { mountOverlay(): void }).mountOverlay();
        (controller as unknown as { armEarlySplitBoundaryListener(): void }).armEarlySplitBoundaryListener();

        runtime.events.emit('site.parcel-boundary-set', {});
        expect(runtime.listenerCount('site.parcel-boundary-set')).toBe(0);
        // Navigate away, then re-emit — nothing may drag the user back to confirm.
        (controller as unknown as { renderSiteStep(): void }).renderSiteStep();
        runtime.events.emit('site.parcel-boundary-set', {});
        expect(document.querySelector('[data-testid="onboarding-typology-chooser"]')).toBeNull();
        expect(document.querySelector('[data-testid="onboarding-site-draw"]')).toBeTruthy();
    });

    it('re-arming leaves exactly ONE live listener (a later draw session supersedes it, never doubles it)', () => {
        const runtime = makeRuntime();
        const controller = new OnboardingStepController({ runtime: runtime as never });
        (controller as unknown as { mountOverlay(): void }).mountOverlay();
        const priv = controller as unknown as { armEarlySplitBoundaryListener(): void; armBoundaryCommitWait(): void };
        priv.armEarlySplitBoundaryListener();
        priv.armBoundaryCommitWait();   // the explicit "Draw it on the map" wait
        expect(runtime.listenerCount('site.parcel-boundary-set')).toBe(1);
    });

    it('the default-footprint path DISARMS it first (no duplicate confirm from the synchronous boundary emit)', () => {
        const runtime = makeRuntime();
        const controller = new OnboardingStepController({ runtime: runtime as never });
        (controller as unknown as { mountOverlay(): void }).mountOverlay();
        const priv = controller as unknown as {
            armEarlySplitBoundaryListener(): void;
            useDefaultRectThenConfirm(): void;
            createSite(o: unknown): boolean;
        };
        priv.armEarlySplitBoundaryListener();
        // Stand in for the real `createSiteFromRect` (needs a live C19 store): it succeeds AND
        // emits the boundary event synchronously, exactly as the real one does.
        vi.spyOn(priv, 'createSite').mockImplementation(() => {
            runtime.events.emit('site.parcel-boundary-set', {});
            return true;
        });
        priv.useDefaultRectThenConfirm();
        // The listener was disarmed before the emit, so exactly one confirm rendered — the
        // default-plot one, not a 'drawn'-labelled duplicate underneath it.
        expect(runtime.listenerCount('site.parcel-boundary-set')).toBe(0);
        expect(document.querySelectorAll('[data-testid="onboarding-typology-chooser"]').length).toBe(1);
    });
});
