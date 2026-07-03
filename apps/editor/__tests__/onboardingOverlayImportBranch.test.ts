// @vitest-environment happy-dom
//
// §FIX-SITE-OVERLAY-IMPORT-TERMINAL (L-70) — the onboarding "Overlay a plan / PDF" branch is
// DECOUPLED from the draw→generate flow. Selecting it must:
//   • arm the OVERLAY-ONLY map import (`pryzmStartSitePlanOverlayImport`), NOT the boundary
//     draw tool (`pryzmStartBoundaryDraw`);
//   • on "✓ Finish" (the `site.overlay-placement-committed` event) land in the canvas —
//     dispose the wizard, close the map, exit GIS — and NEVER show the generate-confirm step.
// The other branches (default footprint, draw-plot) are untouched.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OnboardingStepController } from '../src/ui/onboarding/OnboardingStepController';

// Minimal event emitter matching runtime.events (on/emit + Disposable).
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
        // No siteModelStore → resolveSiteContext returns null → the branch skips site
        // anchoring and proceeds straight to the window-hook import path (fine for this test).
    };
}

let hooks: {
    startOverlay: ReturnType<typeof vi.fn>;
    startBoundary: ReturnType<typeof vi.fn>;
    toggleGIS: ReturnType<typeof vi.fn>;
    closeMap: ReturnType<typeof vi.fn>;
    openPicker: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
    hooks = {
        startOverlay: vi.fn(),
        startBoundary: vi.fn(),
        toggleGIS: vi.fn(),
        closeMap: vi.fn(),
        openPicker: vi.fn(),
    };
    const w = window as unknown as Record<string, unknown>;
    w['pryzmStartSitePlanOverlayImport'] = hooks.startOverlay;
    w['pryzmStartBoundaryDraw'] = hooks.startBoundary;
    w['pryzmToggleGIS'] = hooks.toggleGIS;
    w['pryzmCloseBoundaryMap2D'] = hooks.closeMap;
    w['pryzmOpenSitePlanOverlay'] = hooks.openPicker;
});
afterEach(() => {
    document.body.innerHTML = '';
    const w = window as unknown as Record<string, unknown>;
    for (const k of ['pryzmStartSitePlanOverlayImport', 'pryzmStartBoundaryDraw', 'pryzmToggleGIS', 'pryzmCloseBoundaryMap2D', 'pryzmOpenSitePlanOverlay']) delete w[k];
});

/** Mount the wizard and jump to the site step, then return the overlay choice card. */
function mountAtSiteStep() {
    const runtime = makeRuntime();
    const controller = new OnboardingStepController({ runtime: runtime as never });
    // Reach the site step directly (bypasses the location form; the site cards don't need it).
    (controller as unknown as { mountOverlay(): void }).mountOverlay();
    (controller as unknown as { renderSiteStep(): void }).renderSiteStep();
    const card = document.querySelector('[data-testid="onboarding-site-overlay"]') as HTMLButtonElement;
    return { controller, runtime, card };
}

describe('§FIX-SITE-OVERLAY-IMPORT-TERMINAL — onboarding overlay branch', () => {
    it('the choice card is re-labelled without "then draw / trace the boundary"', () => {
        const { card } = mountAtSiteStep();
        expect(card).toBeTruthy();
        const text = (card.textContent ?? '').toLowerCase();
        expect(text).toContain('overlay a plan');
        expect(text).not.toContain('trace the boundary');
    });

    it('selecting it arms the OVERLAY-ONLY import — NOT the boundary draw tool', () => {
        const { card } = mountAtSiteStep();
        card.click();
        expect(hooks.toggleGIS).toHaveBeenCalledWith(true);
        expect(hooks.startOverlay).toHaveBeenCalledTimes(1); // overlay-only (draw disarmed)
        expect(hooks.startBoundary).not.toHaveBeenCalled();  // boundary draw NEVER armed
    });

    it('"Finish" (placement-committed) lands in the canvas — disposes, closes map, exits GIS, NO generate prompt', () => {
        const { runtime, card } = mountAtSiteStep();
        card.click();
        // The overlay controller (elsewhere) fires this AFTER creating the canvas underlay.
        runtime.events.emit('site.overlay-placement-committed', {});
        // Landed in the canvas: map closed + GIS off, wizard disposed.
        expect(hooks.closeMap).toHaveBeenCalledTimes(1);
        expect(hooks.toggleGIS).toHaveBeenLastCalledWith(false);
        expect(document.querySelector('[data-testid="onboarding-step-overlay"]')).toBeNull();
        // NO generate-confirm step was ever shown.
        expect(document.querySelector('[data-testid="onboarding-confirm-title"]')).toBeNull();
        expect(document.querySelector('[data-testid="onboarding-confirm-generate"]')).toBeNull();
    });
});
