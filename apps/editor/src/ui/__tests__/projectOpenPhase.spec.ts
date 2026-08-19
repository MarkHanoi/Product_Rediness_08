/**
 * §L-1186 — **chrome mounts on the DIRECT-OPEN path**, not only after onboarding.
 *
 * ── Why this file exists rather than another case in `phaseChrome.spec.ts` ───
 * Every existing phase spec begins in `'onboarding-globe'` and then calls
 * `setAppPhase('canvas')` BY HAND. That is the onboarding path written out, and
 * it is why the bug shipped: the specs proved that IF something declares the
 * canvas the chrome comes back, and never asked who declares it when the user
 * opens an existing project. Nothing did. `currentPhase` initialises to
 * `'onboarding-globe'`, and at the broken revision the only two production
 * callers that moved it were `enterCanvasWithSitePlanUnderlay()` (guided landing)
 * and `GISAreaLayout.activateView()` (a click on a view-mode button) — neither on
 * the hub-click / deep-link / reopen-after-reload path. So the founder's floating
 * stack (Buildable Envelope · Site Analysis · Living Graph · Graph · Plan + Site ·
 * PRYZM Earth), the Split View toggle and the View-Properties launcher were
 * skip-mounted for the whole session, and reappeared only if the user happened to
 * click a view-mode button afterwards — which is exactly the reported "OFTEN".
 *
 * ⛔ These cases therefore call the REAL declaration
 * (`declarePhaseForProjectOpen`), never `setAppPhase`. A spec that reached for
 * `setAppPhase` here would be stubbing the thing under test and would have passed
 * at the broken revision.
 *
 * The last case is SOURCE evidence, and says so: it pins that the production open
 * seam still calls the declaration, because a behavioural test of a pure function
 * cannot tell you whether anything invokes it (C82 §5.4 — "committed ≠ reachable").
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    declarePhaseForProjectOpen,
    appPhase,
    panelAbsent,
    panelState,
    __resetPanelSessionStateForTests,
} from '../layout/panelDefaults';
import {
    applyPhaseChrome,
    PHASE_CHROME_SELECTORS,
    __resetPhaseChromeForTests,
} from '../layout/phaseChrome';

const REPO = resolve(__dirname, '../../../../..');

/** One element per governed selector, so a pass has something real to act on. */
function mountFixtures(): void {
    document.body.innerHTML = '';
    for (const row of PHASE_CHROME_SELECTORS) {
        for (const sel of row.selectors) {
            const el = document.createElement('div');
            if (sel.startsWith('#')) el.id = sel.slice(1);
            else if (sel.startsWith('.')) el.className = sel.slice(1);
            else continue;
            document.body.appendChild(el);
        }
    }
}

beforeEach(() => {
    __resetPanelSessionStateForTests();
    __resetPhaseChromeForTests();
    mountFixtures();
});
afterEach(() => { __resetPhaseChromeForTests(); document.body.innerHTML = ''; });

describe('§L-1186 — opening an existing project declares the canvas phase', () => {
    it('starts on the globe (the honest module default) and NOTHING else has spoken yet', () => {
        // Pins the precondition the bug depended on: a fresh session is on the
        // globe. If this ever changes the two cases below stop meaning anything.
        expect(appPhase()).toBe('onboarding-globe');
        expect(panelAbsent('launcher-rail')).toBe(true);
    });

    it('a hub click / deep link / reopen-after-reload lands on "canvas"', () => {
        expect(declarePhaseForProjectOpen({})).toBe('canvas');
        expect(appPhase()).toBe('canvas');
    });

    it('mounts the launcher rail — the pills, the Split View toggle, the reset control', () => {
        // The layer the founder experiences: after a direct open, `panelAbsent` must
        // be FALSE, because `GISAreaLayout.mountSiteViewLauncher()` returns early on
        // TRUE and creates none of these nodes at all (SKIP-MOUNT, not hide).
        declarePhaseForProjectOpen({});
        expect(panelAbsent('launcher-rail'), 'the rail would be skip-mounted').toBe(false);
        expect(panelState('launcher-rail')).toBe('open');
        // The View-Properties reopen route is the same shape and was equally missing.
        expect(panelAbsent('view-properties-launcher')).toBe(false);
    });

    it('leaves the launcher rail VISIBLE after a phase-chrome pass on the direct-open path', () => {
        declarePhaseForProjectOpen({});
        const report = applyPhaseChrome();
        expect(report.phase).toBe('canvas');
        const rail = PHASE_CHROME_SELECTORS.find((r) => r.panel === 'launcher-rail');
        expect(rail, 'the launcher-rail row vanished from the table').toBeTruthy();
        for (const sel of rail!.selectors) {
            const el = document.querySelector(sel) as HTMLElement | null;
            expect(el, sel).not.toBeNull();
            expect(el!.style.display, `${sel} is hidden after a DIRECT project open`).not.toBe('none');
        }
    });

    it('is idempotent — a second open does not thrash the phase', () => {
        expect(declarePhaseForProjectOpen({})).toBe('canvas');
        expect(declarePhaseForProjectOpen({})).toBe('canvas');
        expect(appPhase()).toBe('canvas');
    });
});

describe('§L-1186 — the guided create hop still owns its own phase', () => {
    it('does NOT pre-empt the globe when the open is the guided-onboarding create', () => {
        // Otherwise the rail would mount for a frame and then be taken away again,
        // which is the UX1 report this table was written to answer.
        expect(declarePhaseForProjectOpen({ guidedOnboarding: true })).toBe('onboarding-globe');
        expect(panelAbsent('launcher-rail')).toBe(true);
    });

    it('keys on the GESTURE, not on `isNewProject` — the blank-canvas create is not guided', () => {
        // The hub's "Skip — blank canvas" create passes `{ isNewProject: true }` and
        // runs no guided flow. It must reach the canvas like any other open; keying
        // the decision on `isNewProject` would have stranded exactly those users.
        expect(declarePhaseForProjectOpen({})).toBe('canvas');
    });
});

describe('§L-1186 — the declaration is REACHED from production (source evidence)', () => {
    /** Reads a repo file, failing loudly if the path has rotted. */
    function read(rel: string): string {
        const abs = resolve(REPO, rel);
        expect(existsSync(abs), `${rel} not found — fix the path, do not delete the check`).toBe(true);
        return readFileSync(abs, 'utf8');
    }

    it('PlatformRouter.launchWorkspace declares the phase for the open gesture', () => {
        const src = read('apps/editor/src/ui/platform/PlatformRouter.ts');
        expect(
            src.includes('declarePhaseForProjectOpen'),
            'the project-open seam no longer declares the app phase — L-1186 has regressed',
        ).toBe(true);
        // It must be inside launchWorkspace: an import with no call is the exact
        // "authored but unwired" shape this spec exists to catch.
        const at = src.indexOf('private launchWorkspace(');
        expect(at, 'launchWorkspace was renamed — repoint this check').toBeGreaterThan(-1);
        const body = src.slice(at, at + 3000);
        expect(
            body.includes('declarePhaseForProjectOpen'),
            'declarePhaseForProjectOpen is imported but not called from launchWorkspace',
        ).toBe(true);
    });

    it('the guided create hop passes the guidedOnboarding flag', () => {
        const src = read('apps/editor/src/ui/platform/PlatformRouter.ts');
        expect(
            src.includes('guidedOnboarding: true'),
            'the guided create hop no longer marks itself — onboarding would flash the rail',
        ).toBe(true);
    });

    it('OnboardingStepController brackets its session at BOTH edges', () => {
        const src = read('apps/editor/src/ui/onboarding/OnboardingStepController.ts');
        expect(src.includes('resetAppPhaseForNewProject()'), 'start() no longer opens the bracket').toBe(true);
        const at = src.indexOf('dispose(): void {');
        expect(at, 'dispose() was renamed — repoint this check').toBeGreaterThan(-1);
        expect(
            src.slice(at, at + 2000).includes("setAppPhase('canvas')"),
            'dispose() no longer closes the bracket — skip-the-draw onboarding exits lose their chrome',
        ).toBe(true);
    });
});
