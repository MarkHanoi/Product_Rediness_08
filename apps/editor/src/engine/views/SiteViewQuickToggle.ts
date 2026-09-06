// §SITE-VIEW-QUICK-TOGGLE (L-5110..L-5117 · C59 §2 · C06 §15) — the DOM half of the view
// panel. The decision half is `siteViewQuickToggleModel.ts`; this file only paints it and
// forwards what that model returns.
//
// Founder 2026-08-21: *"we don't really need this 3D Site button on the top-right corner
// (almost hidden) … a button 3D globe / 3D site in the middle top would be beneficial."*
//
// ⛔ §ONE-PANEL-PER-PANE-AND-MAKE-IT-A-DROPDOWN (L-13015, founder 2026-09-06) — THE PANE
// SHAPE BELOW IS NO LONGER MOUNTED IN PRODUCTION, AND THAT IS THE FOUNDER'S INSTRUCTION,
// NOT DRIFT. He photographed THREE switchers stacked over one pane — this control's
// `.svq-bar--pane`, the body-level `.vsw-onview` bar, and `PaneViewPicker`'s dropdown —
// and ruled: *"the left hand side have double panels with the view — keep the one, the
// formal and more robust only, and keep it DROP DOWN only. But when in split view, on the
// left hand side only, please keep TWO dropdown panels."* So the rule is now
// SWITCHER COUNT == VISIBLE PANE COUNT, and the survivor is the dropdown.
//
// ⭐ THIS CONTROL WAS NOT RETIRED — IT WAS RE-HOSTED. `SiteAuthoringPaneShell` now mounts
// it in the `'menu'` shape INSIDE each pane's `PaneViewPicker` popup. Same rows (still
// `viewPanelOptions()`, the ONE option definition), same three ports, same intents, same
// test ids. What changed is the painting and the placement — and a dropdown that hid its
// refusals would have broken STR §26.1.1, so the menu prints them.
//
// ⭐ §VIEW-PANEL-PER-PANE (founder 2026-09-06) — the two HOSTS it can address:
//   · SHELL chrome (no `paneId`) — the top-centre bar over the canvas region, budgeted on
//     `--shell-canvas-cx`. A click SOLOs: it makes that view the whole screen.
//   · PANE chrome (`paneId`) — one panel at the top of EACH pane, addressing only its own
//     pane. That is the founder's *"WHEN BEING IN SPLIT VIEW — WE SHALL HAVE TWO PANELS
//     LIKE THAT — AND THE USER CAN DECIDE WHAT TO ADD IN EACH OF THE SPLIT VIEWS."*
//     And because the shell COLLAPSES the vacated pane in a solo layout
//     (`SiteAuthoringPaneShell.applyFraction`), the surviving pane carries its panel across
//     with it — so "one panel at the top" in a single view and "two panels" in a split are
//     the same mechanism, not two.
//
// ── ENROLLED IN THE FLOAT BUDGET, NOT FLOATED (C06 §15) ─────────────────────────
// `.svq-bar` is a `styles/panels/` rule that takes `left: var(--shell-canvas-cx)` — the ONE
// published horizontal accounting — and clears the shell's top band via
// `var(--shell-topbar-h)`. It is listed in `shellFloatBudget.spec.ts`'s ENROLLED table.
//
// ⚠ THE PANE VARIANT IS NOT IN THAT BUDGET, AND MUST NOT BE. `.svq-bar--pane` is
// `position: absolute` inside its own pane element: it is pane chrome (C06 §7), it can never
// overlay its sibling, and `--shell-canvas-cx` — which measures `#container`, not a pane —
// is the wrong accounting for it. Centring it on the canvas would put BOTH panels on top of
// each other in the middle of the screen.
//
// ⛔ NO INLINE STYLES for position, in either shape: both live in the sheet where the
// budget's static arms can see them.
//
// ── THREE PORTS, ONE STORE (C59 §2 invariant 3) ─────────────────────────────────
// A click never touches a renderer, a DOM style or `MultiPaneController`. The model returns
// intents as DATA and this file routes each to its owner:
//   · `view.pane.*`        → the SAME `PaneLayoutStore` the per-pane pickers write to.
//   · `view.site.frame-*`  → the injected CAMERA port (the one Cesium camera's altitude).
//   · `view.site.basemap`  → the injected BASEMAP port (the one MapLibre style).
// There is no second layout owner and no second way to move a view, a camera or a basemap.
//
// ── THE PANE MENU STAYS ─────────────────────────────────────────────────────────
// This does not remove the per-pane picker. Its list is every registry view with its
// refusal — including the elevations and sections the founder's six leave out, which is
// exactly his *"if the user wants to open more they can do it in the browser."*

import type { PaneLayoutStore } from './paneLayoutStore';
import type { PaneId, RendererKind } from './paneViewModel';
import {
    describeSiteViewQuickToggle,
    isBasemapIntent,
    isCameraIntent,
    segmentClickIntents,
    type SiteViewBasemap,
    type SiteViewGlobeFraming,
    type SiteViewQuickToggleModel,
    type SiteViewSegment,
} from './siteViewQuickToggleModel';

export interface SiteViewQuickToggleHandle {
    readonly element: HTMLElement;
    refresh(): void;
    /**
     * §ONE-PANEL-PER-PANE-AND-MAKE-IT-A-DROPDOWN (L-13015) — the model AS LAST PAINTED.
     *
     * ⭐ A READING OF THE ONE COMPUTATION, never a second one. `PaneViewPicker` hosts this
     * control inside its dropdown and needs to label its trigger with the row that is
     * ACTIVE — and "active" is variant-aware (`2D Satellite` vs `2D Site Map` are one view
     * type). Re-deriving it in the host would be two copies of one fact, drifting, which is
     * the defect this whole panel definition exists to remove. `null` only before the first
     * paint, which cannot be observed: `render()` runs during mount.
     */
    currentModel(): SiteViewQuickToggleModel | null;
    dispose(): void;
}

/**
 * §GLOBE-QUICK-TOGGLE (L-6800..L-6807) — the two CAMERA ports the panel dispatches into.
 *
 * ⚠ INJECTED, never resolved here. This file is DOM chrome; it must not know that the world
 * framing comes from C60 or that the site reframe is `window.pryzmZoomToSite` (P4 — and P1:
 * the composition layer, `SiteAuthoringPaneShell`, is where globals are read).
 */
export interface SiteViewCameraPorts {
    /** Fly the ONE Cesium camera to the declared WORLD framing (C60 §6.5). */
    readonly frameGlobe: () => void;
    /** Reframe it on the site — the declared `site.zoom-to-site` action. */
    readonly frameSite: () => void;
    /**
     * Whether `frameSite` has a live entry point right now. Re-asked on every repaint, like
     * `mountableKinds` — a snapshot, not a subscription. `undefined` ⇒ assume it does.
     */
    readonly canFrameSite?: () => boolean;
}

/**
 * §VIEW-PANEL-PER-PANE — the BASEMAP port, modelled exactly like the camera ports and for
 * the same reasons: injected (so this file reads no globals), snapshot-read on every repaint,
 * and refusing rather than pretending when it is absent.
 *
 * ⭐ `setBasemap` forwards to `SiteBoundaryMap2D.swapBasemap` — the A.8.c.f.4 function the
 * map's own corner `Map | Satellite` chip has driven since 2026-06-03. Nothing about the
 * basemap is re-implemented here; the founder's *"MASKED FOR ANOTHER PANEL"* was a
 * reachability complaint, and this is the second route to the one implementation.
 */
export interface SiteViewBasemapPorts {
    readonly setBasemap: (next: SiteViewBasemap) => void;
    /**
     * The LIVE basemap, or `null` when it cannot be read. ⚠ `null` must NOT be softened to
     * `'map'`: the two 2D rows then say the reading is missing instead of one of them
     * claiming to be the current view (C84 EI-1b).
     */
    readonly getBasemap?: () => SiteViewBasemap | null;
    /** `undefined` ⇒ assume the swap is wired. */
    readonly canSetBasemap?: () => boolean;
}

export interface SiteViewQuickToggleOptions {
    readonly store: PaneLayoutStore;
    /** Where to mount. Defaults to `document.body` — shell chrome unless `paneId` is set. */
    readonly parent?: HTMLElement;
    /**
     * §VIEW-PANEL-PER-PANE — the pane this panel addresses. Omit for the whole-screen panel
     * (a click solos). Set it and the panel is PANE chrome: it drives only its own pane and
     * `parent` must be that pane's element.
     */
    readonly paneId?: PaneId;
    /** Renderer kinds with a mounter registered here (the runtime half of availability). */
    readonly mountableKinds?: () => ReadonlySet<RendererKind> | null;
    /**
     * §GLOBE-QUICK-TOGGLE — omit and the `3D Globe` row is REFUSED WITH A REASON, never
     * silently dropped. A workspace that cannot fly the camera should say so.
     */
    readonly camera?: SiteViewCameraPorts;
    /**
     * §VIEW-PANEL-PER-PANE — omit and the two 2D rows are REFUSED WITH A REASON, on the
     * same doctrine.
     */
    readonly basemap?: SiteViewBasemapPorts;
    /**
     * §VIEW-PANEL-PER-PANE — the SHARED globe-framing memory.
     *
     * ⚠ SHARED BECAUSE THE CAMERA IS. Two split panels drive ONE Cesium camera, so a memory
     * private to each panel would let the left one say "you are on the globe" while the right
     * one says you are not — the two-copies-of-one-fact defect the whole GIS action registry
     * exists to remove. The shell owns the value; each panel reads it and reports back.
     * Omit both and the panel keeps its own (correct for a single, whole-screen panel).
     */
    readonly getFraming?: () => SiteViewGlobeFraming;
    readonly onFramingChanged?: (next: SiteViewGlobeFraming) => void;
    /**
     * §ONE-PANEL-PER-PANE-AND-MAKE-IT-A-DROPDOWN (L-13015, founder 2026-09-06:
     * *"keep the one, the formal and more robust only, and keep it DROP DOWN only"*).
     *
     * ⭐ A SHAPE, NOT A SECOND CONTROL. The rows, the refusals, the intents and the three
     * ports are IDENTICAL in both shapes — only the painting differs, which is why this is
     * an option here rather than a rival component (`viewPanelOptions.ts` stays the ONE
     * option definition, §VIEW-PANEL-PER-PANE).
     *
     *   · `'bar'`  (default) — the horizontal segmented row. What shipped.
     *   · `'menu'` — full-width stacked rows for a dropdown popup, and ⭐ THE REFUSAL IS
     *     PRINTED UNDER THE ROW rather than only in a `title=`. That is not cosmetic: STR
     *     §26.1.1 / L-12999 is a founder ruling that an unavailable option stays OFFERED and
     *     that its refusal SPEAKS — *"a silently greyed-out segment is the WRONG
     *     implementation"*. A dropdown whose disabled row says nothing would be exactly that
     *     failure wearing a new shape.
     */
    readonly shape?: SiteViewQuickToggleShape;
    /**
     * Render the `◧ Split` control (default true). Set FALSE only when the HOST already
     * offers the layout actions — `PaneViewPicker` renders `describePaneLayoutActions`,
     * which includes restore-split, so two controls in one popup would say the same thing
     * twice.
     */
    readonly showSplit?: boolean;
    /**
     * Called after every paint with the model that was painted. The dropdown host uses it
     * to keep its trigger label in step with a repaint this control made on its own (a
     * basemap swap, a store change, the other pane's panel moving the camera).
     */
    readonly onRendered?: (model: SiteViewQuickToggleModel) => void;
}

/** @see SiteViewQuickToggleOptions.shape */
export type SiteViewQuickToggleShape = 'bar' | 'menu';

export const SITE_VIEW_QUICK_TOGGLE_TESTID = 'site-view-quick-toggle';

/** The `data-testid` of the panel addressing `paneId` (or the whole-screen one). */
export function siteViewQuickToggleTestId(paneId?: PaneId | null): string {
    return paneId ? `${SITE_VIEW_QUICK_TOGGLE_TESTID}-${paneId}` : SITE_VIEW_QUICK_TOGGLE_TESTID;
}

/**
 * Mount the panel. Idempotent per host: an existing panel with the same test id is removed
 * first, so a re-mount after a shell rebuild never leaves two.
 */
export function mountSiteViewQuickToggle(
    opts: SiteViewQuickToggleOptions,
): SiteViewQuickToggleHandle {
    const parent = opts.parent ?? document.body;
    const paneId = opts.paneId ?? null;
    const shape: SiteViewQuickToggleShape = opts.shape ?? 'bar';
    const testid = siteViewQuickToggleTestId(paneId);
    parent.querySelector(`[data-testid="${testid}"]`)?.remove();

    const root = document.createElement('div');
    // ⚠ `--pane` IS THE FLOATING PANE-CHROME PLACEMENT (`position: absolute; top: 52px;
    // left: 50%`), so the MENU shape must not carry it: inside a dropdown popup that rule
    // would tear the rows out of the popup's flow. The menu is placed by its host.
    root.className =
        'svq-bar'
        + (shape === 'menu' ? ' svq-bar--menu' : paneId ? ' svq-bar--pane' : '');
    root.setAttribute('data-testid', testid);
    if (paneId) root.setAttribute('data-pane', paneId);
    root.setAttribute('role', 'group');
    root.setAttribute('aria-label', paneId ? `View — ${paneId} pane` : 'View');

    /**
     * The framing this control last commanded, when the host supplies no shared memory.
     * Written in EXACTLY ONE place — after the camera intent has been forwarded to the port
     * — so it can never claim a move that did not happen.
     */
    let ownFraming: SiteViewGlobeFraming = 'site';
    const readFraming = (): SiteViewGlobeFraming => opts.getFraming?.() ?? ownFraming;
    const writeFraming = (next: SiteViewGlobeFraming): void => {
        ownFraming = next;
        opts.onFramingChanged?.(next);
    };

    /** The model as last painted — handed to the dropdown host, never recomputed there. */
    let painted: SiteViewQuickToggleModel | null = null;

    const render = (): void => {
        const model = describeSiteViewQuickToggle({
            layout: opts.store.getLayout(),
            paneId,
            canRestoreSplit: opts.store.canRestoreSplit(),
            mountableKinds: opts.mountableKinds?.() ?? null,
            // §ONBOARDING-STEP-PINS-ITS-SURFACE (L-10720) — DISABLE-AND-EXPLAIN the rows
            // whose click would evict a view the current step depends on. The store refuses
            // them anyway; showing them live and letting them decline on click is what
            // taught the founder the app was broken.
            pinnedViews: opts.store.pinnedViews(),
            globeFraming: readFraming(),
            // A READING, never a memory — the map's own corner chip can swap the basemap
            // without this panel hearing about it.
            basemap: opts.basemap?.getBasemap?.() ?? null,
            // No ports wired ⇒ there is no way back / no way to swap, so the model refuses
            // the row rather than painting a live-looking button.
            canReturnToSite: opts.camera != null && (opts.camera.canFrameSite?.() ?? true),
            canSetBasemap: opts.basemap != null && (opts.basemap.canSetBasemap?.() ?? true),
        });

        painted = model;
        root.replaceChildren();
        for (const seg of model.segments) root.appendChild(buildSegment(seg));

        // The HOST already offers the layout actions in the menu shape — see `showSplit`.
        if (opts.showSplit === false) {
            try { opts.onRendered?.(model); } catch { /* a host that throws is its own bug */ }
            return;
        }

        // `◧ Split` — the route BACK. A control that takes the user full-screen without one
        // is the L-942 shape: a branch whose escape hatch was never built.
        const split = document.createElement('button');
        split.type = 'button';
        split.className = 'svq-btn svq-btn--split';
        split.setAttribute('data-testid', `site-view-quick-toggle-split${paneId ? `-${paneId}` : ''}`);
        split.textContent = model.split.label;
        split.disabled = !model.split.enabled;
        // DISABLE-OR-EXPLAIN: the reason reaches the user, never only the console.
        if (model.split.reason) split.title = model.split.reason;
        split.addEventListener('click', () => {
            if (!model.split.enabled) return;
            opts.store.dispatch({ type: 'view.pane.restore-split' });
        });
        root.appendChild(split);
        try { opts.onRendered?.(model); } catch { /* a host that throws is its own bug */ }
    };

    /**
     * §ONE-PANEL-PER-PANE-AND-MAKE-IT-A-DROPDOWN (L-13015) — the sentence a MENU row prints
     * under itself. STR §26.1.1 / L-12999, verbatim: *"PRYZM declines in ONE SENTENCE naming
     * the reason and offers the action that resolves it; a silently greyed-out segment is
     * the WRONG implementation."* A `title=` satisfies neither half on a touch surface, so
     * in the menu the reason is DOM text.
     *
     * ⚠ It renders the SAME string the bar shape puts in its `title` — one wording, two
     * shapes. `null` ⇒ the row has nothing to declare and gets no second line.
     */
    const menuReason = (seg: SiteViewSegment): string | null => {
        if (seg.reason) return seg.reason;
        // §SWAP-NOT-VACATE (L-12999 clause 3) — the consequence is stated BEFORE the click.
        if (seg.consequence) return seg.consequence;
        if (seg.variantUnreported) {
            return 'This works. Whether it is what you are looking at right now cannot be read '
                + 'in this session, so it is never highlighted — that is a missing reading, '
                + 'not "off".';
        }
        if (seg.soloed && seg.active) return `${seg.label} is already filling the screen.`;
        return null;
    };

    const buildSegment = (seg: SiteViewSegment): HTMLElement => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className =
            'svq-btn'
            + (seg.active ? ' svq-btn--active' : '')
            + (seg.soloed ? ' svq-btn--solo' : '')
            // The globe keeps its own filled-pill treatment: alone among the six it moves
            // the CAMERA out to world altitude, and the founder has been reading that pill
            // since 2026-08-22. It is now also a row that can be ACTIVE — see the sheet.
            + (seg.optionId === 'site-globe' ? ' svq-btn--globe' : '');
        btn.setAttribute('data-testid', `site-view-quick-toggle-${seg.optionId}${paneId ? `-${paneId}` : ''}`);
        btn.setAttribute('data-view-type', seg.viewType);
        btn.setAttribute('data-option-id', seg.optionId);
        // ⭐ THE SAME `PaneViewOptionState` VOCABULARY the registry rows use, because
        // §ONE-PANEL-PER-PANE-AND-MAKE-IT-A-DROPDOWN puts both kinds of row in ONE popup
        // and a popup that speaks two languages about "what happens if I click this" is
        // two controls wearing one border.
        btn.setAttribute(
            'data-option-state',
            !seg.enabled ? 'unavailable'
                : seg.active ? 'current'
                    : seg.consequence ? 'moves-singleton'
                        : 'available',
        );
        btn.disabled = !seg.enabled;

        // C43 — the state is carried by more than colour, and "I cannot tell you" is a THIRD
        // state. `aria-pressed="mixed"` is the ARIA spelling of it; `"false"` would ASSERT
        // that the user is not looking at this row, which is a claim the panel cannot make
        // when the basemap reading is missing (C84 EI-1b).
        btn.setAttribute('aria-pressed', seg.variantUnreported ? 'mixed' : String(seg.active));
        if (seg.variantUnreported) btn.setAttribute('data-variant-unreported', 'true');

        if (seg.glyph) {
            const g = document.createElement('span');
            g.className = 'svq-glyph';
            g.textContent = seg.glyph;
            // Decorative — the label beside it is the accessible name.
            g.setAttribute('aria-hidden', 'true');
            btn.appendChild(g);
        }
        const lbl = document.createElement('span');
        lbl.className = 'svq-lbl';
        // textContent only — no HTML sink in this file (C08 §3.1 §XSS-SINK-SCAN).
        lbl.textContent = seg.label;
        btn.appendChild(lbl);

        // ⭐ THE REFUSAL SPEAKS (STR §26.1.1 / L-12999). In the menu shape it is DOM text
        // under the row, not only a hover string — the ruling names a silent grey-out as
        // the wrong implementation, and a `title=` is silent on a touch device.
        if (shape === 'menu') {
            const why = menuReason(seg);
            if (why) {
                const r = document.createElement('span');
                r.className = 'svq-reason';
                r.textContent = why; // textContent only — no HTML sink (C08 §3.1)
                btn.appendChild(r);
            }
        }

        btn.title = seg.reason
            ?? (seg.variantUnreported
                ? `${seg.title}\n\nThis works. Whether it is what you are looking at right now `
                  + 'cannot be read in this session, so it is never highlighted — that is a '
                  + 'missing reading, not "off".'
                : seg.soloed && seg.active
                  ? `${seg.label} is already filling the screen.`
                  : seg.title);

        btn.addEventListener('click', () => {
            // The model decides; this only forwards. A no-op row returns [].
            for (const intent of segmentClickIntents(seg, opts.store.getLayout())) {
                if (isCameraIntent(intent)) {
                    // The variant is the LAST intent by construction — a pane that is not
                    // mounted yet drops the target. Only now may the memory move.
                    const next: SiteViewGlobeFraming =
                        intent.type === 'view.site.frame-globe' ? 'world' : 'site';
                    try {
                        if (intent.type === 'view.site.frame-globe') opts.camera?.frameGlobe();
                        else opts.camera?.frameSite();
                    } catch (e) {
                        // A camera that refuses must not strand the control mid-state: leave
                        // the framing where it was so the labels still describe real moves.
                        console.warn('[site-view-panel] camera port threw — framing unchanged:', e);
                        return;
                    }
                    writeFraming(next);
                    render();
                    continue;
                }
                if (isBasemapIntent(intent)) {
                    try { opts.basemap?.setBasemap(intent.value); }
                    catch (e) {
                        console.warn('[site-view-panel] basemap port threw — basemap unchanged:', e);
                        return;
                    }
                    render();
                    continue;
                }
                const res = opts.store.dispatch(intent);
                // A rejection is the store's honest answer, not a failure to swallow.
                if (!res.ok) {
                    console.info(
                        `[site-view-panel] ${intent.type} refused: ${res.rejected ?? 'no reason given'}`,
                    );
                    return;
                }
            }
        });
        return btn;
    };

    render();
    parent.appendChild(root);

    // Repaint from the store, never from the click — the panel is a pure function of store
    // state, so a layout change made from the pane menu (or from the OTHER panel) updates it.
    const unsubscribe = opts.store.subscribe(() => {
        if (!root.isConnected) return;
        render();
    });

    let disposed = false;
    return {
        element: root,
        refresh: render,
        currentModel: () => painted,
        dispose(): void {
            if (disposed) return;
            disposed = true;
            try { unsubscribe(); } catch { /* already gone */ }
            if (root.parentElement) root.parentElement.removeChild(root);
        },
    };
}
