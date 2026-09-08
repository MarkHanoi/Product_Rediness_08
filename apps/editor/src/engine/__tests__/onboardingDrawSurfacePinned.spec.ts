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

    it('⭐ §SWAP-NOT-VACATE — the singleton MOVE no longer evicts it, so there is nothing to refuse', () => {
        // ═══════════════════════════════════════════════════════════════════════════════
        // ⚠ THIS ARM ASSERTED A REFUSAL (`res.ok === false`, `res.rejected === REASON`)
        // UNTIL §SWAP-NOT-VACATE (L-12999 clause 4, 2026-09-06). It is CHANGED, not
        // deleted, and it now asserts the PROPERTY it always existed to protect — *the 2D
        // draw map is never taken off screen* — rather than the MECHANISM that used to be
        // the only way to protect it.
        //
        // WHAT SUPERSEDED IT: `assignViewToPane` used to write `null` into the pane the
        // singleton moved out of, so assigning `site-3d` LEFT really did evict the map and
        // the pin had to refuse. It now SWAPS: the map is handed to the RIGHT pane. The pin
        // rule itself is UNCHANGED — this file's own header states it as *"MAY NOT BE
        // VACATED, NOT 'MAY NOT BE MOVED'"*, and arm 4 below pins that distinction
        // deliberately. The map is moved, not vacated, so the rule is satisfied and the
        // refusal correctly does not fire.
        //
        // ⛔ THE PIN STILL HAS TEETH, and the two arms around this one are why: `solo` and
        // an explicit `assign(pane, null)` are genuine evictions and are still refused. So
        // is this same assign when the map's pane is the one the singleton is NOT in — see
        // the arm immediately below, which is new and covers the case this one stopped
        // covering.
        //
        // ⭐ AND THE FOUNDER'S DEAD END IS CLOSED MORE FIRMLY THAN BEFORE, not less: the
        // route that disposed `SiteBoundaryMap2D` and cleared
        // `window.pryzmBoundaryDrawSurfaceReadyAt` no longer exists for this gesture at
        // all, and `MultiPaneController` RELOCATES rather than unmounts a surface that is
        // still wanted somewhere (§MAP-IS-A-SINGLETON-TOO), so the draw survives the move.
        // ═══════════════════════════════════════════════════════════════════════════════
        const store = pinnedStore();
        const res = store.dispatch({ type: 'view.pane.assign', paneId: LEFT_PANE, viewType: SITE3D });

        expect(res.ok).toBe(true);
        expect(res.rejected).toBeUndefined();
        // THE PROPERTY: the draw surface is still on screen. That is all the pin ever asked.
        expect(Object.values(store.getLayout())).toContain(MAP);
        expect(store.getLayout()[RIGHT_PANE]).toBe(MAP);
        expect(store.getLayout()[LEFT_PANE]).toBe(SITE3D);
    });

    it('⛔ …but an assign that GENUINELY evicts it is still refused (the teeth this keeps)', () => {
        // The case the arm above stopped covering, and the reason it is not a regression:
        // when the pinned map is the only thing in its pane and the incoming view is NOT
        // live in another pane, there is no swap to make — the map is simply replaced. The
        // pin refuses, exactly as it always did.
        const store = new PaneLayoutStore({ [LEFT_PANE]: MAP, [RIGHT_PANE]: null });
        store.pinView(MAP, REASON);

        const res = store.dispatch({ type: 'view.pane.assign', paneId: LEFT_PANE, viewType: SITE3D });

        expect(res.ok).toBe(false);
        expect(res.rejected).toBe(REASON);
        expect(store.getLayout()[LEFT_PANE]).toBe(MAP); // a rejected intent mutates NOTHING.
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

    it('the `3D Globe` ROW gets the same refusal — it solos the same pane', () => {
        // §VIEW-PANEL-PER-PANE (2026-09-06) — the globe used to be `model.globe`, an action
        // beside the segments whose refusal was INHERITED from the 3D Site segment. It is now
        // a ROW of the founder's six (`site-3d` at the world framing), so it computes the
        // refusal from the same pin rule the other rows do. The property that matters is
        // unchanged and is why this arm exists: flying to world altitude from the split ALSO
        // evicts the pinned map, so a globe button that stayed live would reopen the founder's
        // dead end by a second route.
        const store = pinnedStore();
        const model = describeSiteViewQuickToggle({
            layout: store.getLayout(),
            canRestoreSplit: store.canRestoreSplit(),
            pinnedViews: store.pinnedViews(),
        });
        const globe = model.segments.find((s) => s.optionId === 'site-globe')!;
        expect(globe, 'the 3D Globe row vanished from the panel').toBeDefined();
        expect(globe.viewType).toBe(SITE3D);   // ⛔ still no globe ViewType (C60 §6.10)
        expect(globe.enabled).toBe(false);
        expect(globe.reason).toBe(REASON);
        expect(segmentClickIntents(globe, store.getLayout())).toHaveLength(0);
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
        // ⚠ THE LAYOUT UNDER TEST CHANGED WITH §SWAP-NOT-VACATE (L-12999, 2026-09-06); the
        // ASSERTIONS did not. This arm used to use the split `{left:MAP, right:SITE3D}`,
        // where choosing `site-3d` for the LEFT pane evicted the map. It now SWAPS there
        // (the map lands right, nothing is evicted, and the picker correctly offers it) —
        // so the arm was re-pointed at a layout where the choice genuinely IS an eviction,
        // which is the thing it exists to prove the picker explains rather than declining
        // on click. The picker derives its verdict from the SAME `assignViewToPane`
        // hypothetical the store guards with, so the two cannot disagree; the companion
        // arm below pins that agreement on the swap layout.
        const store = new PaneLayoutStore({ [LEFT_PANE]: MAP, [RIGHT_PANE]: null });
        store.pinView(MAP, REASON);
        const opts = describePaneViewOptions({
            layout: store.getLayout(),
            paneId: LEFT_PANE,
            pinnedViews: store.pinnedViews(),
        });
        const site3d = opts.find((o) => o.viewType === SITE3D);
        expect(site3d!.enabled).toBe(false);
        expect(site3d!.reason).toBe(REASON);
    });

    it('⭐ the picker and the STORE agree on the swap layout too — both allow it', () => {
        // The agreement arm. A picker that offered a choice the store refuses is the
        // dead-click this whole file exists to remove; a picker that DISABLED a choice the
        // store would accept is the same defect inverted — a route lost for no reason.
        const store = pinnedStore();
        const opts = describePaneViewOptions({
            layout: store.getLayout(),
            paneId: LEFT_PANE,
            pinnedViews: store.pinnedViews(),
        });
        const site3d = opts.find((o) => o.viewType === SITE3D)!;
        expect(site3d.enabled).toBe(true);
        expect(site3d.state).toBe('moves-singleton');
        expect(site3d.swapsWith).toBe(MAP);   // it says WHAT comes back, before the click.
        expect(store.dispatch({ type: 'view.pane.assign', paneId: LEFT_PANE, viewType: SITE3D }).ok)
            .toBe(true);
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
        // ⚠ NOT "every row is enabled" — corrected 2026-09-06 (§VIEW-PANEL-PER-PANE). What
        // this arm MEANS is: no row is refused BY A PIN. Asserting "all enabled" would fail
        // on unrelated, correct refusals and need relaxing every time the panel grows.
        for (const s of model.segments) {
            expect(s.reason, `${s.optionId} refused by a pin with nothing pinned`).not.toBe(REASON);
        }
        // ⭐ `pryzm-3d` JOINED THIS SET 2026-09-08 (§ONE-REGION-SWITCHER, L-13257). It used to
        // be absent because `paneHostable: false` greyed it; it is now ENABLED and carries a
        // `fullScreenRoute`, because a view that cannot be a PANE can still be REACHED —
        // founder: *"I still don't see 3D PRYZM accessible"*. The pane refusal is unchanged;
        // what changed is that the row now dispatches the whole-screen route it always named.
        expect(model.segments.filter((s) => s.enabled).map((s) => s.optionId))
            .toEqual(['site-map', 'site-satellite', 'site-3d', 'site-globe', 'pryzm-3d', 'pryzm-2d']);
        // ⛔ AND IT IS STILL NOT A PANE — the guard that keeps this from being a silent
        // widening of what a pane may host.
        expect(model.segments.find((s) => s.optionId === 'pryzm-3d')?.fullScreenRoute).toBe('3D');
        expect(store.dispatch({ type: 'view.pane.solo', paneId: RIGHT_PANE }).ok).toBe(true);
    });
});
