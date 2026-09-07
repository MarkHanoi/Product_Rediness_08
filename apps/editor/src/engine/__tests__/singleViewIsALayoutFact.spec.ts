// §SINGLE-VIEW-IS-A-LAYOUT-FACT (L-13053) — split → single must not blank the region.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE DEFECT, VERBATIM
// ─────────────────────────────────────────────────────────────────────────────
// Founder 2026-09-07: *"WHEN HAVING ANALYSIS — PARCEL LAW ACTIVE — THEN IT IS ON SPLIT ON —
// WORKS WELL. BUT IF WE GO TO SINGLE VIEW, SOMEHOW IT GETS A WHITE SCREEN — WITH MASSIVE
// PANEL — THIS SHOULD STILL BE A DROP DOWN OCCUPYING WAY SMALLER SPACE — AND BY DEFAULT
// RENDER 2D PLAN VIEW ON THIS ENVIRONMENT."*
//
// ⛔ THE ROOT WAS NOT A RACE, AND NOT THE PLACEMENT PASS. "Single view" dispatched
// `pryzmUnmountSiteAuthoringPanes()`, which DISPOSES the pane shell: the MapLibre map is
// disposed and the ONE Cesium viewer re-homes to `#container` and hides itself. In the
// Analysis workspace `#container` IS the left half (`canvas: 'half'`), so what remained was
// an empty BIM canvas — the white screen. The same gesture also brought the retired
// whole-screen six-segment bar back, because `viewSwitcherOnView` re-inserts it exactly when
// the shell root is gone. ⭐ ONE ACTION, BOTH SYMPTOMS.
//
// C59 §1.4 already states the rule that was broken: *"`view.pane.solo` vacates the other
// pane(s); the shell then collapses the empty pane and the divider so the SURVIVOR fills the
// shell — carrying its picker with it."*
//
// ⚠ WHAT THESE ARMS ARE FOR. A blank region is invisible to "did the intent dispatch?" — the
// store was perfectly consistent throughout the defect, because the shell it described had
// been destroyed. So the arms below assert the SURVIVOR: the shell root is still in the
// document, exactly one pane is occupied AND displayed, its surface is still parented in it,
// and its dropdown is still there. That is the founder's screen, stated as a postcondition.

import { describe, it, expect, beforeEach } from 'vitest';
import { mountSiteAuthoringPaneShell } from '../views/SiteAuthoringPaneShell';
import { type PaneRendererMounter } from '../views/PaneHost';
import {
    LEFT_PANE,
    RIGHT_PANE,
    describeSingleViewTarget,
    describeSitePaneMode,
    isSoloLayout,
    parcelLawDefaultLayout,
    siteAuthoringDefaultLayout,
    singleViewForPreset,
    type PaneLayout,
    type RendererKind,
} from '../views/paneViewModel';
import { describeSplitToggle } from '../views/siteAuthoringPaneDecisions';

/** A mounter that parents a real element into its pane, so "is the pane blank?" is answerable. */
class SurfaceMounter implements PaneRendererMounter {
    readonly surface = document.createElement('div');
    mountCount = 0;
    unmountCount = 0;
    constructor(readonly rendererKind: RendererKind) {
        this.surface.setAttribute('data-surface', rendererKind);
    }
    mount(paneEl: HTMLElement): void {
        this.mountCount++;
        paneEl.appendChild(this.surface);
    }
    unmount(): void {
        this.unmountCount++;
        this.surface.remove();
    }
    relocate(paneEl: HTMLElement): void {
        paneEl.appendChild(this.surface);
    }
    isPlacedIn(paneEl: HTMLElement): boolean {
        return this.surface.parentElement === paneEl;
    }
    resize(): void { /* noop */ }
}

function buildShell(layout: PaneLayout = parcelLawDefaultLayout()): {
    shell: ReturnType<typeof mountSiteAuthoringPaneShell>;
    parent: HTMLElement;
    plan: SurfaceMounter;
    cesium: SurfaceMounter;
    map: SurfaceMounter;
} {
    const parent = document.createElement('div');
    parent.id = 'container';
    document.body.appendChild(parent);
    const shell = mountSiteAuthoringPaneShell({ parent });
    const plan = new SurfaceMounter('canvas2d');
    const cesium = new SurfaceMounter('cesium');
    const map = new SurfaceMounter('maplibre');
    shell.controller.registerMounter(plan);
    shell.controller.registerMounter(cesium);
    shell.controller.registerMounter(map);
    shell.store.dispatch({ type: 'view.pane.set-layout', layout });
    return { shell, parent, plan, cesium, map };
}

const flushSettle = (): Promise<void> =>
    new Promise((resolve) => { setTimeout(resolve, 5); });

beforeEach(() => {
    document.body.innerHTML = '';
});

// ════════════════════════════════════════════════════════════════════════════════
// THE PURE HALF — the model that says which pane survives and what it shows
// ════════════════════════════════════════════════════════════════════════════════

describe('§SINGLE-VIEW-IS-A-LAYOUT-FACT — the pure decisions', () => {
    it('a SOLO layout is exactly one occupied pane in a multi-pane shell', () => {
        expect(isSoloLayout({ [LEFT_PANE]: 'bim-plan-2d', [RIGHT_PANE]: null })).toBe(true);
        expect(isSoloLayout({ [LEFT_PANE]: null, [RIGHT_PANE]: 'site-3d' })).toBe(true);
        expect(isSoloLayout(parcelLawDefaultLayout())).toBe(false);
        // ⛔ BOTH EMPTY IS NOT SOLO, and the distinction is the whole point: the shell's own
        // `applyFraction` collapses on `leftEmpty !== rightEmpty`, so a both-empty layout still
        // shows TWO panes. Reporting it as "single" would make a control describe a screen the
        // user is not looking at.
        expect(isSoloLayout({ [LEFT_PANE]: null, [RIGHT_PANE]: null })).toBe(false);
        // A one-pane shell has no other pane to vacate, so it is never "soloed".
        expect(isSoloLayout({ [LEFT_PANE]: 'site-3d' })).toBe(false);
    });

    it('the mode a live shell reports follows that same rule — one reading, not two', () => {
        expect(describeSitePaneMode(parcelLawDefaultLayout())).toBe('split');
        expect(describeSitePaneMode({ [LEFT_PANE]: 'bim-plan-2d', [RIGHT_PANE]: null })).toBe('single');
    });

    it('prefers the pane that ALREADY holds the environment’s single view', () => {
        // "By default" means the default when the user has not said otherwise — not an
        // override of the arrangement he chose. Plan is already left, so the move is one solo.
        const t = describeSingleViewTarget(parcelLawDefaultLayout(), 'bim-plan-2d');
        expect(t).toEqual({ paneId: LEFT_PANE, assign: null });
    });

    it('assigns the declared single view when NO pane holds it — the founder’s 2D plan', () => {
        // His console had the 2D map on the left; going single must still land on the plan.
        const t = describeSingleViewTarget(siteAuthoringDefaultLayout(), 'bim-plan-2d');
        expect(t).toEqual({ paneId: LEFT_PANE, assign: 'bim-plan-2d' });
    });

    it('the declared single view is PER PRESET — the Author opening is untouched', () => {
        // ⛔ "This environment" is the Parcel Law tab. Onboarding opens on a plot that does not
        // exist yet, where the plan of an unbuilt building is a blank sheet and the 2D map is
        // the surface the guided flow makes you draw on.
        expect(singleViewForPreset('parcel-law')).toBe('bim-plan-2d');
        expect(singleViewForPreset('site-authoring')).toBe('site-map-2d');
        expect(singleViewForPreset(undefined)).toBe('site-map-2d');
    });

    it('a shell with no panes is refused rather than given an invented pane id', () => {
        expect(describeSingleViewTarget({}, 'bim-plan-2d')).toBeNull();
    });
});

// ════════════════════════════════════════════════════════════════════════════════
// THE TOGGLE — three states, because a live shell can now show ONE pane
// ════════════════════════════════════════════════════════════════════════════════

describe('§SINGLE-VIEW-IS-A-LAYOUT-FACT — the split toggle reads three states', () => {
    const wired = { canOpen: true, canClose: true, canSetMode: true };

    it('SPLIT: pressed, and pressing it goes SINGLE (it no longer offers to close the shell)', () => {
        const d = describeSplitToggle({ open: true, mode: 'split', ...wired });
        expect(d.pressed).toBe(true);
        expect(d.enabled).toBe(true);
        expect(d.title).toMatch(/single view/i);
        expect(d.title).toMatch(/keeps its own view dropdown/i);
        // ⛔ It must NOT promise a teardown any more — that promise was the defect.
        expect(d.title).not.toMatch(/close the split/i);
    });

    it('SINGLE: NOT pressed — the shell is up and there is no split to be "on"', () => {
        const d = describeSplitToggle({ open: true, mode: 'single', ...wired });
        expect(d.pressed).toBe(false);
        expect(d.enabled).toBe(true);
        expect(d.title).toMatch(/side by side/i);
    });

    it('ABSENT: unchanged — it opens the split, exactly as before', () => {
        const d = describeSplitToggle({ open: false, mode: 'absent', ...wired });
        expect(d.pressed).toBe(false);
        expect(d.enabled).toBe(true);
        expect(d.label).toBe('◧ Split');
    });

    it('a host with NO mode capability reads two states and closes the shell, as it always did', () => {
        // ⛔ NOTHING IS LOST FOR AN OLDER HOST (C19 §5.6 clause 4). `mode` absent ⇒ derived
        // from `open`, and the enabled-ness falls back to `canClose`.
        const d = describeSplitToggle({ open: true, canOpen: true, canClose: true });
        expect(d.pressed).toBe(true);
        expect(d.title).toMatch(/close the split/i);
        expect(describeSplitToggle({ open: true, canOpen: true, canClose: false }).enabled).toBe(false);
    });

    it('SINGLE with no mode capability is unreachable, not half-wired', () => {
        // The state only exists for a host that can act on it; without the capability the
        // button says WHY rather than looking live and doing nothing (§26.1.1).
        const d = describeSplitToggle({ open: true, mode: 'single', canOpen: true, canClose: true });
        expect(d.enabled).toBe(false);
        expect(d.title).toMatch(/not available from here/i);
    });
});

// ════════════════════════════════════════════════════════════════════════════════
// ⭐ THE ONE THAT CATCHES THE WHITE SCREEN
// ════════════════════════════════════════════════════════════════════════════════

describe('§SINGLE-VIEW-IS-A-LAYOUT-FACT — going single leaves a VIEW on screen', () => {
    it('the survivor fills the shell, keeps its surface, and keeps its dropdown', async () => {
        const { shell, parent, plan, cesium } = buildShell();
        const leftEl = shell.getPaneElement(LEFT_PANE)!;
        const rightEl = shell.getPaneElement(RIGHT_PANE)!;
        expect(plan.surface.parentElement).toBe(leftEl);
        expect(cesium.surface.parentElement).toBe(rightEl);

        const r = shell.store.dispatch({ type: 'view.pane.solo', paneId: LEFT_PANE });
        expect(r.ok).toBe(true);
        await flushSettle();

        // 1. THE SHELL IS STILL THERE. This is the line the defect failed: the old route
        //    disposed it, and `#container` was left holding whatever the workspace had.
        expect(parent.contains(shell.root)).toBe(true);
        expect(shell.isDisposed).toBe(false);

        // 2. THE SURVIVOR IS DISPLAYED AND FILLS THE SHELL; the vacated pane and the divider
        //    are collapsed (C59 §1.4).
        expect(leftEl.style.display).not.toBe('none');
        expect(leftEl.style.flex).toBe('1 1 100%');
        expect(rightEl.style.display).toBe('none');
        expect(document.getElementById('pryzm-pane-divider')!.style.display).toBe('none');

        // 3. THE SURVIVOR STILL HAS A SURFACE IN IT — the pane is not blank.
        expect(plan.surface.parentElement).toBe(leftEl);
        expect(shell.store.getLayout()[LEFT_PANE]).toBe('bim-plan-2d');

        // 4. AND IT CARRIES ITS PICKER — the founder's *"THIS SHOULD STILL BE A DROP DOWN
        //    OCCUPYING WAY SMALLER SPACE"*, answered by the same change rather than a second.
        const picker = leftEl.querySelector(`[data-testid="pane-view-picker-${LEFT_PANE}"]`);
        expect(picker).not.toBeNull();
        expect(leftEl.contains(picker!)).toBe(true);

        shell.dispose();
    });

    it('going single is REVERSIBLE — restore-split brings the second view back', async () => {
        const { shell } = buildShell();
        shell.store.dispatch({ type: 'view.pane.solo', paneId: LEFT_PANE });
        await flushSettle();
        expect(shell.store.canRestoreSplit()).toBe(true);

        const back = shell.store.dispatch({ type: 'view.pane.restore-split' });
        expect(back.ok).toBe(true);
        await flushSettle();
        expect(shell.store.getLayout()).toEqual(parcelLawDefaultLayout());
        expect(shell.getPaneElement(RIGHT_PANE)!.style.display).not.toBe('none');
        shell.dispose();
    });

    it('ASSIGN-THEN-SOLO keeps a real split to go back to (the ordering is load-bearing)', async () => {
        // The founder's live layout was 2D-map-left. Going single must land on the PLAN and
        // still leave `◧ Back to split` somewhere to return to — which is only true if the
        // assignment happens BEFORE the solo. An assignment AFTER a solo supersedes the split
        // memory by design (`PaneLayoutStore.reduce`), and the escape hatch would be gone.
        const { shell } = buildShell(siteAuthoringDefaultLayout());
        const target = describeSingleViewTarget(shell.store.getLayout(), 'bim-plan-2d')!;
        expect(target.assign).toBe('bim-plan-2d');

        shell.store.dispatch({ type: 'view.pane.assign', paneId: target.paneId, viewType: target.assign });
        shell.store.dispatch({ type: 'view.pane.solo', paneId: target.paneId });
        await flushSettle();

        expect(shell.store.getLayout()[LEFT_PANE]).toBe('bim-plan-2d');
        expect(isSoloLayout(shell.store.getLayout())).toBe(true);
        expect(shell.store.canRestoreSplit()).toBe(true);
        shell.store.dispatch({ type: 'view.pane.restore-split' });
        expect(shell.store.getLayout()[RIGHT_PANE]).toBe('site-3d');
        shell.dispose();
    });

    it('⛔ THE CONTRAST — the OLD route (dispose) is what leaves the region with nothing', async () => {
        // Stated as an arm rather than as prose, so nobody re-wires "single view" to the
        // teardown believing the two are equivalent. They are not: this is the white screen.
        const { shell, parent, plan, cesium } = buildShell();
        shell.dispose();
        await flushSettle();
        expect(parent.contains(shell.root)).toBe(false);
        expect(document.getElementById('pryzm-pane-left')).toBeNull();
        expect(plan.surface.parentElement).toBeNull();
        expect(cesium.surface.parentElement).toBeNull();
        expect(parent.querySelector('[data-surface]')).toBeNull(); // nothing to look at.
    });
});
