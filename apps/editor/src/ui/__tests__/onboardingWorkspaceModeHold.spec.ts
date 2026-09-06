/**
 * §ONBOARDING-IS-FULL-BLEED (L-13000) — a persisted workspace mode may not be applied
 * over the onboarding globe, and it may not be LOST either.
 *
 * ── The defect, in the founder's words and his console ────────────────────────
 * Screenshot 1, "STEP 1 OF 4 · LOCATION" on a brand-new empty project, globe squeezed
 * into the left half with an Analysis dashboard on the right:
 *   *"pLEASE MAKE SURE AT THIS STAGE THE VIEW IS ALWAYS IN 'AUTHOR' FULL VIEW WITH
 *    THE EARTH"*
 * `[WorkspaceController] Restored mode → analysis` fired on a project with no parcel,
 * no boundary and no elements, and `_applyLayout()` wrote `#container.style.width =
 * '50%'`. The globe is a FULL-BLEED surface parented into `#container`, so a
 * half-canvas mode cuts it in two.
 *
 * ── Why these four, and not "does the getter return the field" ────────────────
 * Each one pins a property whose loss reproduces a defect this repo has paid for:
 *
 *  1. THE HOLD — the founder's screenshot. A half-canvas mode over the onboarding
 *     globe. Asserted on the OBSERVABLE (`#container.style.width`), not only on
 *     `getMode()`, because the width is what he photographed.
 *  2. THE RELEASE — persistence is a FEATURE, not the bug. ⛔ The forbidden fix was
 *     deleting mode persistence outright; restoring the last mode on a project that
 *     HAS content is correct and wanted. If this test fails, the fix has become the
 *     forbidden one.
 *  3. THE PREFERENCE SURVIVES — the hold must never write `localStorage`. Forcing the
 *     onboarding layout through `setMode()` would silently overwrite the very
 *     preference this lane exists to preserve.
 *  4. THE RE-ARM — a SECOND project created in the same session
 *     (`resetAppPhaseForNewProject()`) must get the same full-bleed globe. Without
 *     this arm the defect returns from the other side, which is exactly how
 *     §UX1-PANEL-DEFAULTS D6's own phase latch had to be re-armed.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WorkspaceController } from '../WorkspaceController';
import {
    appPhase,
    setAppPhase,
    resetAppPhaseForNewProject,
} from '../layout/panelDefaults';

const LS_KEY = 'pryzm-workspace-mode';

/** The node `_applyLayout()` writes the canvas width onto. */
function makeContainer(): HTMLElement {
    const el = document.createElement('div');
    el.id = 'container';
    document.body.appendChild(el);
    return el;
}

let container: HTMLElement;
let controller: WorkspaceController | null = null;

beforeEach(() => {
    document.body.innerHTML = '';
    container = makeContainer();
    localStorage.clear();
    // Every test starts in the guided flow, which is where the defect lives. The
    // module-load default is already 'onboarding-globe'; this makes it explicit and
    // re-arms it for whichever test ran before.
    resetAppPhaseForNewProject();
});

afterEach(() => {
    controller?.dispose();
    controller = null;
    // Leave the shared phase latch where the next file expects to find it.
    resetAppPhaseForNewProject();
});

describe('§ONBOARDING-IS-FULL-BLEED — the hold', () => {
    it('does NOT apply a persisted half-canvas mode while the phase is the onboarding globe', () => {
        localStorage.setItem(LS_KEY, 'analysis');
        expect(appPhase()).toBe('onboarding-globe');

        controller = new WorkspaceController();
        controller.restoreFromStorage();

        // The founder's screenshot, asserted on the pixels he photographed: a
        // half-canvas mode writes '50%' here, which is what squeezed the globe.
        expect(container.style.width).toBe('');
        expect(controller.getMode()).toBe('author');
    });

    it('forces the full-bleed author layout when a NEW guided flow re-arms the phase mid-session', () => {
        // Session already reached the canvas and the user is in Analysis.
        setAppPhase('canvas');
        controller = new WorkspaceController();
        controller.setMode('analysis');
        expect(container.style.width).toBe('50%');

        // A second project's `OnboardingStepController.start()`.
        resetAppPhaseForNewProject();

        expect(controller.getMode()).toBe('author');
        expect(container.style.width).toBe('');
    });
});

describe('§ONBOARDING-IS-FULL-BLEED — the release (persistence is NOT removed)', () => {
    it('applies the held mode the moment the canvas phase is declared', () => {
        localStorage.setItem(LS_KEY, 'analysis');
        controller = new WorkspaceController();
        controller.restoreFromStorage();
        expect(controller.getMode()).toBe('author');

        // `OnboardingStepController.dispose()` — the ONE place the flow says it is over.
        setAppPhase('canvas');

        expect(controller.getMode()).toBe('analysis');
        expect(container.style.width).toBe('50%');
    });

    it('restores immediately, unheld, when the phase is already the canvas (an existing project)', () => {
        // `declarePhaseForProjectOpen()` at the hub/deep-link open seam, §L-1186.
        setAppPhase('canvas');
        localStorage.setItem(LS_KEY, 'inspect');

        controller = new WorkspaceController();
        controller.restoreFromStorage();

        expect(controller.getMode()).toBe('inspect');
    });

    it('leaves the SAVED preference untouched while it is held — the hold never writes storage', () => {
        localStorage.setItem(LS_KEY, 'analysis');
        controller = new WorkspaceController();
        controller.restoreFromStorage();

        // ⛔ If the hold had gone through `setMode()`, this would now read 'author' and
        // the user's choice would be gone for good.
        expect(localStorage.getItem(LS_KEY)).toBe('analysis');
    });
});
