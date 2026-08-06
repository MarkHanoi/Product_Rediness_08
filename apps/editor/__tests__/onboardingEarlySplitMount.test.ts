// @vitest-environment happy-dom
//
// §17.4 EARLY-SPLIT (PRYZM-EARTH PRD §17.4 / §21) — the site-authoring split mounts the
// MOMENT the `site` step is entered, for ALL THREE plot choices (default / draw / overlay),
// not only after the user clicks "Draw it on the map".
//
// Correctness invariant under test: the split's own MapLibre pane mounter arms the
// boundary-DRAW tool as a side effect of mounting (GISAreaLayout.ts — startBoundaryDraw in
// the left-pane mounter). Since the split now mounts BEFORE any choice is made, a user who
// draws/selects a parcel straight off the early split must NOT lose the commit: the step
// controller arms a safety-net `site.parcel-boundary-set` listener at the same early point.

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
            listenerCount: (e: string) => (listeners[e] ?? []).length,
        },
    };
}

let mountSplit: ReturnType<typeof vi.fn>;
let unmountSplit: ReturnType<typeof vi.fn>;

beforeEach(() => {
    mountSplit = vi.fn();
    unmountSplit = vi.fn();
    const w = window as unknown as Record<string, unknown>;
    w['pryzmMountSiteAuthoringPanes'] = mountSplit;
    w['pryzmUnmountSiteAuthoringPanes'] = unmountSplit;
});
afterEach(() => {
    document.body.innerHTML = '';
    const w = window as unknown as Record<string, unknown>;
    for (const k of ['pryzmMountSiteAuthoringPanes', 'pryzmUnmountSiteAuthoringPanes', 'pryzmToggleGIS', 'pryzmStartBoundaryDraw', 'pryzmCloseBoundaryMap2D', 'pryzmCancelBoundaryDraw']) delete w[k];
});

function mountAtSiteStep() {
    const runtime = makeRuntime();
    const controller = new OnboardingStepController({ runtime: runtime as never });
    (controller as unknown as { mountOverlay(): void }).mountOverlay();
    (controller as unknown as { renderSiteStep(): void }).renderSiteStep();
    return { controller, runtime };
}

describe('§17.4 EARLY-SPLIT — the split mounts on site-step ENTRY, before any choice', () => {
    it('entering the site step mounts the site-authoring split immediately (choice card still shown)', () => {
        mountAtSiteStep();
        expect(mountSplit).toHaveBeenCalledTimes(1);
        // The three-choice card is untouched — this task changes WHEN the split mounts, not the choices.
        expect(document.querySelector('[data-testid="onboarding-site-default"]')).toBeTruthy();
        expect(document.querySelector('[data-testid="onboarding-site-draw"]')).toBeTruthy();
        expect(document.querySelector('[data-testid="onboarding-site-overlay"]')).toBeTruthy();
    });

    it('a missing split hook degrades silently (choice card still renders)', () => {
        delete (window as unknown as Record<string, unknown>)['pryzmMountSiteAuthoringPanes'];
        mountAtSiteStep();
        expect(document.querySelector('[data-testid="onboarding-site-draw"]')).toBeTruthy();
    });
});

describe('§17.4 EARLY-SPLIT — boundary drawn BEFORE clicking "Draw" is not lost', () => {
    it('a site.parcel-boundary-set commit on the choice card routes to the generate-confirm step', () => {
        const { runtime } = mountAtSiteStep();
        // The early split's left pane has a live draw tool; the user traces a plot without
        // ever pressing "Draw it on the map". The commit must land in the confirm step.
        runtime.events.emit('site.parcel-boundary-set', {});
        expect(document.querySelector('[data-testid="onboarding-confirm-title"]')).toBeTruthy();
        expect(document.querySelector('[data-testid="onboarding-confirm-generate"]')).toBeTruthy();
    });

    it('the early listener is one-shot (a second commit does not re-render / double-fire)', () => {
        const { runtime } = mountAtSiteStep();
        runtime.events.emit('site.parcel-boundary-set', {});
        const firstTitle = document.querySelector('[data-testid="onboarding-confirm-title"]');
        runtime.events.emit('site.parcel-boundary-set', {});
        // Same node — the confirm step was not re-rendered by the second emit.
        expect(document.querySelector('[data-testid="onboarding-confirm-title"]')).toBe(firstTitle);
    });

    it('clicking "Draw it on the map" SUPERSEDES the early listener (no duplicate boundary listeners)', () => {
        const { runtime } = mountAtSiteStep();
        const before = runtime.events.listenerCount('site.parcel-boundary-set');
        expect(before).toBe(1); // the early safety net
        const drawBtn = document.querySelector('[data-testid="onboarding-site-draw"]') as HTMLButtonElement;
        drawBtn.click();
        // armBoundaryCommitWait cancels the early listener before arming its own full wait:
        // still exactly ONE live listener, so a commit cannot double-fire the confirm step.
        expect(runtime.events.listenerCount('site.parcel-boundary-set')).toBe(1);
        runtime.events.emit('site.parcel-boundary-set', {});
        expect(document.querySelector('[data-testid="onboarding-confirm-title"]')).toBeTruthy();
    });
});

describe('§17.4 EARLY-SPLIT — BACK to location tears the early split down', () => {
    it('unmounts the split and disarms the early listener', () => {
        const { runtime } = mountAtSiteStep();
        const back = document.querySelector('[data-testid="onboarding-site-back"]') as HTMLButtonElement;
        back.click();
        expect(unmountSplit).toHaveBeenCalledTimes(1);
        // The early listener is gone — a stray commit no longer hijacks the location step.
        expect(runtime.events.listenerCount('site.parcel-boundary-set')).toBe(0);
        runtime.events.emit('site.parcel-boundary-set', {});
        expect(document.querySelector('[data-testid="onboarding-confirm-title"]')).toBeNull();
    });
});
