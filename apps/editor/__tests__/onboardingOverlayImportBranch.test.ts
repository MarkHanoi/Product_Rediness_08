// @vitest-environment happy-dom
//
// §FIX-SITE-OVERLAY-IMPORT-TERMINAL (L-70) + §FIX-SITE-OVERLAY-DOUBLE-PANEL (L-77) +
// §FIX-SITE-OVERLAY-ENTER-CANVAS (L-78) — the onboarding "Overlay a plan / PDF" branch.
//
// Selecting it must:
//   • arm the OVERLAY-ONLY map import (`pryzmStartSitePlanOverlayImport`), NOT the boundary
//     draw tool (`pryzmStartBoundaryDraw`), and NEVER show the generate-confirm step;
//   • DISMISS the plot-choice card while the overlay panel is up (single active panel — L-77),
//     and RESTORE it on Back/cancel;
//   • on "✓ Finish" (the `site.overlay-placement-committed` event) LAND IN THE CANVAS FRAMED:
//     close the map, EXIT GIS + switch to plan (Top) view, zoom-to-fit, dispose the wizard (L-78).

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
    };
}

let hooks: {
    startOverlay: ReturnType<typeof vi.fn>;
    startBoundary: ReturnType<typeof vi.fn>;
    toggleGIS: ReturnType<typeof vi.fn>;
    activateBimView: ReturnType<typeof vi.fn>;
    zoomToFit: ReturnType<typeof vi.fn>;
    closeMap: ReturnType<typeof vi.fn>;
    openPicker: ReturnType<typeof vi.fn>;
    splitActivate: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
    hooks = {
        startOverlay: vi.fn(),
        startBoundary: vi.fn(),
        toggleGIS: vi.fn(),
        activateBimView: vi.fn(async () => {}),
        zoomToFit: vi.fn(async () => {}),
        closeMap: vi.fn(),
        openPicker: vi.fn(),
        splitActivate: vi.fn(),
    };
    const w = window as unknown as Record<string, unknown>;
    w['pryzmStartSitePlanOverlayImport'] = hooks.startOverlay;
    w['pryzmStartBoundaryDraw'] = hooks.startBoundary;
    w['pryzmToggleGIS'] = hooks.toggleGIS;
    w['pryzmActivateBimView'] = hooks.activateBimView;
    w['pryzmCloseBoundaryMap2D'] = hooks.closeMap;
    w['pryzmOpenSitePlanOverlay'] = hooks.openPicker;
    w['viewController'] = { zoomToFit: hooks.zoomToFit };
    // §FIX-ONBOARDING-OVERLAY-SINGLE-PANEL-NO-BOUNDARY-SPLIT3D (L-194) — the split-view
    // manager the onboarding lands into after Finish (starts inactive so activate() runs).
    w['splitViewManager'] = { isActive: false, activate: hooks.splitActivate };
});
afterEach(() => {
    document.body.innerHTML = '';
    const w = window as unknown as Record<string, unknown>;
    for (const k of ['pryzmStartSitePlanOverlayImport', 'pryzmStartBoundaryDraw', 'pryzmToggleGIS', 'pryzmActivateBimView', 'pryzmCloseBoundaryMap2D', 'pryzmOpenSitePlanOverlay', 'viewController', 'splitViewManager']) delete w[k];
});

function mountAtSiteStep() {
    const runtime = makeRuntime();
    const controller = new OnboardingStepController({ runtime: runtime as never });
    (controller as unknown as { mountOverlay(): void }).mountOverlay();
    (controller as unknown as { renderSiteStep(): void }).renderSiteStep();
    const card = document.querySelector('[data-testid="onboarding-site-overlay"]') as HTMLButtonElement;
    return { controller, runtime, card };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('§FIX-SITE-OVERLAY-IMPORT-TERMINAL — overlay branch is decoupled', () => {
    it('the choice card is re-labelled without "trace the boundary"', () => {
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
        expect(hooks.startOverlay).toHaveBeenCalledTimes(1);
        expect(hooks.startBoundary).not.toHaveBeenCalled();
    });
});

describe('§FIX-SITE-OVERLAY-DOUBLE-PANEL (L-77) — single active panel', () => {
    it('DISMISSES the plot-choice card when the import step opens (no double panel)', () => {
        const { card } = mountAtSiteStep();
        // Before: the three choice cards are present.
        expect(document.querySelector('[data-testid="onboarding-site-overlay"]')).toBeTruthy();
        expect(document.querySelector('[data-testid="onboarding-site-draw"]')).toBeTruthy();
        card.click();
        // After: the choice cards are gone, replaced by the slim "place your plan" banner.
        expect(document.querySelector('[data-testid="onboarding-site-overlay"]')).toBeNull();
        expect(document.querySelector('[data-testid="onboarding-site-draw"]')).toBeNull();
        expect(document.querySelector('[data-testid="onboarding-overlay-cancel"]')).toBeTruthy();
    });

    it('RESTORES the plot-choice card on Back/cancel', () => {
        const { card } = mountAtSiteStep();
        card.click();
        const back = document.querySelector('[data-testid="onboarding-overlay-cancel"]') as HTMLButtonElement;
        expect(back).toBeTruthy();
        back.click();
        // The three choice cards are back; GIS exited + map closed.
        expect(document.querySelector('[data-testid="onboarding-site-overlay"]')).toBeTruthy();
        expect(document.querySelector('[data-testid="onboarding-site-draw"]')).toBeTruthy();
        expect(hooks.closeMap).toHaveBeenCalled();
        expect(hooks.toggleGIS).toHaveBeenLastCalledWith(false);
    });
});

describe('§FIX-SITE-OVERLAY-ENTER-CANVAS (L-78) — Finish lands in a framed canvas', () => {
    it('closes the map, EXITS GIS + switches to the 3D view, zooms to fit, disposes the wizard — NO generate prompt', async () => {
        const { runtime, card } = mountAtSiteStep();
        card.click();
        // The overlay controller fires this AFTER it has created + placed the underlay.
        runtime.events.emit('site.overlay-placement-committed', {});
        await flush(); await flush(); // let the async landing (activateBimView → zoomToFit) settle.
        // Landed in the canvas, FRAMED on the plan:
        expect(hooks.closeMap).toHaveBeenCalledTimes(1);
        // §FIX-SITE-PLAN-OVERLAY-ORDER-AND-ENTER-CANVAS (L-258 B) — the founder's landing state is
        // the 3D PRYZM view WITH the plan pane beside it, so the main view is '3D' (the split's
        // secondary pane renders the plan). Landing on 'Top' gave plan + plan.
        expect(hooks.activateBimView).toHaveBeenCalledWith('3D');
        expect(hooks.zoomToFit).toHaveBeenCalledTimes(1);          // frame the plan
        // Wizard disposed; NO generate-confirm ever shown.
        expect(document.querySelector('[data-testid="onboarding-step-overlay"]')).toBeNull();
        expect(document.querySelector('[data-testid="onboarding-confirm-title"]')).toBeNull();
        expect(document.querySelector('[data-testid="onboarding-typology-chooser"]')).toBeNull();
    });

    it('falls back to a plain GIS-exit when the BIM-view hook is absent', async () => {
        delete (window as unknown as Record<string, unknown>)['pryzmActivateBimView'];
        const { runtime, card } = mountAtSiteStep();
        card.click();
        runtime.events.emit('site.overlay-placement-committed', {});
        await flush(); await flush();
        expect(hooks.closeMap).toHaveBeenCalledTimes(1);
        expect(hooks.toggleGIS).toHaveBeenLastCalledWith(false); // degrade path
        expect(document.querySelector('[data-testid="onboarding-step-overlay"]')).toBeNull();
    });
});

describe('§FIX-ONBOARDING-OVERLAY-SINGLE-PANEL-NO-BOUNDARY-SPLIT3D (L-194) — Finish opens the 3D split view', () => {
    it('activates the plan + 3D SPLIT view (window.splitViewManager) after exiting GIS', async () => {
        const { runtime, card } = mountAtSiteStep();
        card.click();
        runtime.events.emit('site.overlay-placement-committed', {});
        await flush(); await flush();
        // Exited to the BIM 3D view AND opened the split so the user gets 3D + plan.
        expect(hooks.activateBimView).toHaveBeenCalledWith('3D');
        expect(hooks.splitActivate).toHaveBeenCalledTimes(1);
    });

    // §FIX-SITE-PLAN-OVERLAY-ORDER-AND-ENTER-CANVAS (L-258 A) — the ORDER regression guard.
    it('does NOT auto-open the file picker on mode entry (the user locates FIRST)', async () => {
        const { card } = mountAtSiteStep();
        card.click();
        await flush(); await flush();
        expect(hooks.startOverlay).toHaveBeenCalledTimes(1); // the overlay-only map opens …
        expect(hooks.openPicker).not.toHaveBeenCalled();     // … but NO upload is forced on entry.
    });

    it('does NOT re-activate the split view when it is already open (auto-opened)', async () => {
        (window as unknown as Record<string, unknown>)['splitViewManager'] = { isActive: true, activate: hooks.splitActivate };
        const { runtime, card } = mountAtSiteStep();
        card.click();
        runtime.events.emit('site.overlay-placement-committed', {});
        await flush(); await flush();
        expect(hooks.splitActivate).not.toHaveBeenCalled();
        // Still framed + disposed — the rest of the landing is unaffected.
        expect(hooks.zoomToFit).toHaveBeenCalledTimes(1);
        expect(document.querySelector('[data-testid="onboarding-step-overlay"]')).toBeNull();
    });

    it('overlay branch NEVER arms the boundary-draw tool (no generate coupling)', () => {
        const { card } = mountAtSiteStep();
        card.click();
        // Only the overlay-only map import is armed; the boundary draw tool is never started.
        expect(hooks.startOverlay).toHaveBeenCalledTimes(1);
        expect(hooks.startBoundary).not.toHaveBeenCalled();
    });
});
