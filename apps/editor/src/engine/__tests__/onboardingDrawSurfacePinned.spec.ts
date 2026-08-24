/**
 * §ONBOARDING-STEP-PINS-ITS-SURFACE (L-10720) — the 2D draw map may not be EVICTED while
 * the guided setup flow depends on it.
 *
 * THE FOUNDER'S REPORT (2026-08-24), at "STEP 2 OF 4 · DRAW YOUR PLOT":
 *
 *   > "I clicked Split view → 3D Site — I normally don't click there — but the 2D GIS view
 *   >  went BLACK, then I tried to make it work to continue and things got worse."
 *
 * and his console named it outright:
 *
 *   [SiteBoundaryMap2D] [gis] map2d: disposed
 *   [onboarding-step] draw idle tick — waiting (tab-hidden)
 *
 * ⭐ THE MECHANISM, end to end. `◉ 3D Site` → `segmentClickIntents` → `view.pane.solo(right)`
 * → the reducer vacates LEFT → `MultiPaneController` unmounts it → `mapMounter.unmount()` →
 * `SiteBoundaryMap2D.dispose()`, which `delete`s `window.pryzmBoundaryDrawSurfaceReadyAt`.
 * `OnboardingStepController`'s draw watchdog reads exactly that stamp, so `decideDrawIdleAction`
 * answered `wait / surface-not-ready` FOREVER, re-arming every 60 s. The step needed the map,
 * the map was gone, and the wizard had no way to ask for it back: a DEAD END one click deep in
 * the primary onboarding path.
 *
 * ⛔ WHY THE ASSERTIONS ARE AT THE MODEL, NOT AT THE BUTTON. THREE surfaces can move a view —
 * the quick-toggle bar, the two per-pane `PaneViewPicker`s, and any programmatic caller — and
 * `PaneLayoutStore.dispatch` is the ONE seam all three cross. A test that only proved the
 * button was disabled would prove the founder's instance fixed and the CLASS still open.
 *
 * ⚠ THE RULE UNDER TEST IS "MAY NOT BE VACATED", NOT "MAY NOT BE MOVED" AND NOT "THE CONTROLS
 * ARE OFF". Arms 3 and 4 exist to stop a future simplification collapsing it into either.
 */

import { describe, it, expect } from 'vitest';

import {
    LEFT_PANE,
    RIGHT_PANE,
    type PaneLayout,
} from '../views/paneViewModel';
import { PaneLayoutStore } from '../views/paneLayoutStore';
import { describeSiteViewQuickToggle, segmentClickIntents } from '../views/siteViewQuickToggleModel';
import { describePaneViewOptions } from '../views/paneViewOptions';

const MAP: 'site-map-2d' = 'site-map-2d';
const SITE3D: 'site-3d' = 'site-3d';

const REASON =
    'The 2D site map is where you draw your plot — it stays on screen until you have drawn '
    + 'one or skipped drawing.';

/** The onboarding default: 2D map LEFT, live 3D Site RIGHT (`siteAuthoringDefaultLayout()`). */
function splitLayout(): PaneLayout {
    return { [LEFT_PANE]: MAP, [RIGHT_PANE]: SITE3D };
}

/** A store already in the onboarding split, with the map pinned. No applier: these arms are
 *  about the DECISION, and a renderer would only add a reason for them to be flaky. */
function pinnedStore(): PaneLayoutStore {
    const store = new PaneLayoutStore(splitLayout());
    store.pinView(MAP, REASON);
    return store;
}

describe('§ONBOARDING-STEP-PINS-ITS-SURFACE — the pane store refuses to vacate a pinned view', () => {
    it('⭐ REFUSES the founder’s exact click: solo(right) would evict the 2D draw map', () => {
        const store = pinnedStore();

        const res = store.dispatch({ type: 'view.pane.solo', paneId: RIGHT_PANE });

        expect(res.ok).toBe(false);
        expect(res.rejected).toBe(REASON);
        // A rejected intent mutates NOTHING — the store's own stated contract. If this
        // regressed the user would keep the dead end AND lose the refusal message.
        expect(store.getLayout()[LEFT_PANE]).toBe(MAP);
        expect(store.getLayout()[RIGHT_PANE]).toBe(SITE3D);
    });

    it('REFUSES an assign that would evict it, including via the singleton MOVE', () => {
        const store = pinnedStore();
        // `site-3d` is a singleton: assigning it LEFT moves it out of RIGHT and evicts the
        // map entirely. This is the pane-picker route, not the quick-toggle route.
        const res = store.dispatch({ type: 'view.pane.assign', paneId: LEFT_PANE, viewType: SITE3D });

        expect(res.ok).toBe(false);
        expect(res.rejected).toBe(REASON);
        expect(store.getLayout()[LEFT_PANE]).toBe(MAP);
    });

    it('REFUSES emptying the pane that holds it', () => {
        const store = pinnedStore();
        const res = store.dispatch({ type: 'view.pane.assign', paneId: LEFT_PANE, viewType: null });
        expect(res.ok).toBe(false);
        expect(store.getLayout()[LEFT_PANE]).toBe(MAP);
    });

    it('⭐ ALLOWS a MOVE — the rule is "not vacated", not "not moved"', () => {
        const store = pinnedStore();
        // Put the map in the RIGHT pane. It is still on screen and still drawable, so there
        // is nothing to refuse. A pin that froze the layout would fail here.
        const res = store.dispatch({ type: 'view.pane.assign', paneId: RIGHT_PANE, viewType: MAP });
        expect(res.ok).toBe(true);
        expect(store.getLayout()[RIGHT_PANE]).toBe(MAP);
    });

    it('⭐ ALLOWS the swap, and allows every layout that KEEPS the map on screen', () => {
        const store = pinnedStore();
        expect(store.dispatch({ type: 'view.pane.swap', a: LEFT_PANE, b: RIGHT_PANE }).ok).toBe(true);
        expect(Object.values(store.getLayout())).toContain(MAP);

        const back = store.dispatch({ type: 'view.pane.set-layout', layout: splitLayout() });
        expect(back.ok).toBe(true);
    });

    it('⛔ a pin on a view that is NOT on screen refuses nothing — the unsatisfiable-gate guard (§L-716)', () => {
        // This is the mount order that actually happens: the pin is installed when the shell
        // mounts, BEFORE `set-layout` first puts the map in a pane. If the pin refused a
        // layout that merely *lacks* the pinned view, the split could never mount at all —
        // a guard whose satisfied state is unreachable.
        const store = new PaneLayoutStore({ [LEFT_PANE]: null, [RIGHT_PANE]: null });
        store.pinView(MAP, REASON);

        const mounted = store.dispatch({ type: 'view.pane.set-layout', layout: splitLayout() });
        expect(mounted.ok).toBe(true);
        expect(store.getLayout()[LEFT_PANE]).toBe(MAP);
    });

    it('RELEASING the pin restores the ordinary behaviour exactly — nothing is permanently disabled', () => {
        const store = new PaneLayoutStore(splitLayout());
        const release = store.pinView(MAP, REASON);
        expect(store.dispatch({ type: 'view.pane.solo', paneId: RIGHT_PANE }).ok).toBe(false);

        release();

        // The guided flow has ended (`AppPhase` left `'onboarding-globe'`), so soloing the 3D
        // Site is a perfectly good thing to do again.
        const after = store.dispatch({ type: 'view.pane.solo', paneId: RIGHT_PANE });
        expect(after.ok).toBe(true);
        expect(store.getLayout()[LEFT_PANE]).toBeNull();
        expect(store.pinnedViews().size).toBe(0);
    });

    it('the pin is OBSERVABLE, so the bar repaints when it is installed or released', () => {
        // The quick toggle repaints from `store.subscribe`, never from its own click. A pin
        // that changed nothing observable would leave a stale-enabled button on screen.
        const store = new PaneLayoutStore(splitLayout());
        let notifications = 0;
        store.subscribe(() => { notifications += 1; });

        const release = store.pinView(MAP, REASON);
        expect(notifications).toBe(1);
        release();
        expect(notifications).toBe(2);
    });
});

describe('§ONBOARDING-STEP-PINS-ITS-SURFACE — the controls DISABLE-AND-EXPLAIN', () => {
    it('⭐ the quick toggle greys `3D Site` and states the reason, instead of declining on click', () => {
        const store = pinnedStore();
        const model = describeSiteViewQuickToggle({
            layout: store.getLayout(),
            canRestoreSplit: store.canRestoreSplit(),
            pinnedViews: store.pinnedViews(),
        });

        const site3d = model.segments.find((s) => s.viewType === SITE3D);
        expect(site3d).toBeDefined();
        expect(site3d!.enabled).toBe(false);
        expect(site3d!.reason).toBe(REASON);
        // A disabled segment emits no intents at all — so the DOM layer cannot route round it.
        expect(segmentClickIntents(site3d!, store.getLayout())).toHaveLength(0);
    });

    it('the `3D Globe` action INHERITS the same refusal — it solos the same pane', () => {
        // `globeClickIntents` is `segmentClickIntents(carrier) + camera`, so flying to world
        // altitude from the split ALSO evicts the map. Inheriting the refusal is correct;
        // a globe button that stayed live would reopen the dead end by a second route.
        const store = pinnedStore();
        const model = describeSiteViewQuickToggle({
            layout: store.getLayout(),
            canRestoreSplit: store.canRestoreSplit(),
            pinnedViews: store.pinnedViews(),
        });
        expect(model.globe.enabled).toBe(false);
        expect(model.globe.reason).toBe(REASON);
    });

    it('the 2D map’s OWN segment is untouched — the pin never disables its subject', () => {
        const store = pinnedStore();
        const model = describeSiteViewQuickToggle({
            layout: store.getLayout(),
            canRestoreSplit: store.canRestoreSplit(),
            pinnedViews: store.pinnedViews(),
        });
        const map = model.segments.find((s) => s.viewType === MAP);
        expect(map!.enabled).toBe(true);
    });

    it('the per-pane picker marks the evicting choice unavailable WITH the reason', () => {
        const store = pinnedStore();
        const opts = describePaneViewOptions({
            layout: store.getLayout(),
            paneId: LEFT_PANE,
            pinnedViews: store.pinnedViews(),
        });
        const site3d = opts.find((o) => o.viewType === SITE3D);
        expect(site3d!.enabled).toBe(false);
        expect(site3d!.reason).toBe(REASON);
    });

    it('⛔ with NO pin the bar and the picker are byte-for-byte the pre-change behaviour', () => {
        // The regression guard. Everything above is opt-in; an editor session that never
        // pins must not notice this change exists.
        const store = new PaneLayoutStore(splitLayout());
        const model = describeSiteViewQuickToggle({
            layout: store.getLayout(),
            canRestoreSplit: store.canRestoreSplit(),
            pinnedViews: store.pinnedViews(),
        });
        expect(model.segments.every((s) => s.enabled)).toBe(true);
        expect(store.dispatch({ type: 'view.pane.solo', paneId: RIGHT_PANE }).ok).toBe(true);
    });
});
