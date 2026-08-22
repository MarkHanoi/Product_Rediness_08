// §SITE-VIEW-QUICK-TOGGLE (L-5110..L-5117 · C59 §2 · C06 §15) — the DOM half of the
// top-centre 3D globe / 3D site control. The decision half is
// `siteViewQuickToggleModel.ts`; this file only paints it and dispatches.
//
// Founder 2026-08-21: *"we don't really need this 3D Site button on the top-right corner
// (almost hidden) … a button 3D globe / 3D site in the middle top would be beneficial."*
//
// ── ENROLLED IN THE FLOAT BUDGET, NOT FLOATED (C06 §15) ─────────────────────────
// The brief was explicit: enrol in the budget rather than absolutely-positioning a new
// element. `.svq-bar` is therefore a `styles/panels/` rule that takes
// `left: var(--shell-canvas-cx)` — the ONE published horizontal accounting, written by
// `publishShellCanvasRegion()` and by nothing else — and clears the shell's top band via
// `var(--shell-topbar-h)`. It is listed in `shellFloatBudget.spec.ts`'s ENROLLED table,
// which fails if it ever reverts to `left: 50%`.
//
// ⛔ NO INLINE STYLES for position. `PaneViewPicker` uses `Object.assign(el.style, …)`
// because it is PANE chrome — a child of its own pane, positioned relative to that pane.
// This bar is SHELL chrome over the canvas region, so it must be in the sheet where the
// budget's static arm can see it. An inline `left` would be invisible to that arm and
// would silently leave the budget.
//
// ── ONE WRITE PATH (C59 §2 invariant 3) ─────────────────────────────────────────
// A click never touches a renderer, a DOM style or `MultiPaneController`. It dispatches
// `view.pane.*` intents — supplied as DATA by `segmentClickIntents` — into the SAME
// `PaneLayoutStore` the per-pane pickers write to, then repaints from that store's
// notification. There is no second layout owner and no second way to move a view.
//
// ── THE PANE MENU STAYS ─────────────────────────────────────────────────────────
// This does not remove the per-pane picker. See the model's header: four of that menu's
// six entries are disabled WITH REASONS, and those refusals are real.
//
// ── §GLOBE-QUICK-TOGGLE (L-6800..L-6807) — TWO PORTS, NOT ONE STORE ─────────────
// Founder 2026-08-22: *"add in the top panel buttons 3d globe also"*.
//
// The globe is not a fourth segment — it CANNOT be, see the model's header (C60 §6.10).
// It is an action that does two different kinds of thing, so it dispatches into two
// different places, and keeping them apart is the point:
//
//   · WHICH VIEW IS ON SCREEN → `view.pane.*` into the SAME `PaneLayoutStore` every
//     other control here writes to. Still exactly one layout owner.
//   · WHERE THE ONE CAMERA LOOKS → `view.site.*` into an INJECTED camera port. The
//     pane store has no altitude state and must not grow one.
//
// ⛔ IT DOES NOT ENTER THE C60 ENTRY FLOW, and that is a safety property rather than a
// simplification. `SiteEntryStore`'s terminal intent emits `site-handoff`, and the parcel
// boundary is a ONE-SHOT IMMUTABLE polygon (C19 §1.3/§1.4) — so a mid-project button that
// re-opened that machine would be walking the user toward re-committing the site of a
// project that already has one. This forwards a camera target and nothing else.

import type { PaneLayoutStore } from './paneLayoutStore';
import type { RendererKind } from './paneViewModel';
import {
    describeSiteViewQuickToggle,
    globeClickIntents,
    segmentClickIntents,
    type SiteViewGlobeFraming,
    type SiteViewSegment,
} from './siteViewQuickToggleModel';

export interface SiteViewQuickToggleHandle {
    readonly element: HTMLElement;
    refresh(): void;
    dispose(): void;
}

/**
 * §GLOBE-QUICK-TOGGLE (L-6800..L-6807) — the two CAMERA ports the bar dispatches into.
 *
 * ⚠ INJECTED, never resolved here. This file is DOM chrome; it must not know that the world
 * framing comes from C60 or that the site reframe is `window.pryzmZoomToSite` (P4 — and P1: the
 * composition layer, `SiteAuthoringPaneShell`, is where globals are read). Injection is also
 * what makes the click sequencing testable with recorders, which is the whole reason
 * `globeClickIntents` returns data.
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

export interface SiteViewQuickToggleOptions {
    readonly store: PaneLayoutStore;
    /** Where to mount. Defaults to `document.body` — it is shell chrome, not pane chrome. */
    readonly parent?: HTMLElement;
    /** Renderer kinds with a mounter registered here (the runtime half of availability). */
    readonly mountableKinds?: () => ReadonlySet<RendererKind> | null;
    /**
     * §GLOBE-QUICK-TOGGLE — omit and the `⊕ 3D Globe` control is REFUSED WITH A REASON, never
     * silently dropped. A workspace that cannot fly the camera should say so; a bar that
     * quietly grows and shrinks is how a control becomes untestable.
     */
    readonly camera?: SiteViewCameraPorts;
}

export const SITE_VIEW_QUICK_TOGGLE_TESTID = 'site-view-quick-toggle';

/**
 * Mount the bar. Idempotent: an existing bar is removed first, so a re-mount after a
 * shell rebuild never leaves two.
 */
export function mountSiteViewQuickToggle(
    opts: SiteViewQuickToggleOptions,
): SiteViewQuickToggleHandle {
    const parent = opts.parent ?? document.body;
    parent.querySelector(`[data-testid="${SITE_VIEW_QUICK_TOGGLE_TESTID}"]`)?.remove();

    const root = document.createElement('div');
    root.className = 'svq-bar';
    root.setAttribute('data-testid', SITE_VIEW_QUICK_TOGGLE_TESTID);
    root.setAttribute('role', 'group');
    root.setAttribute('aria-label', 'Site view');

    /**
     * §GLOBE-QUICK-TOGGLE — the ONE bit of state this control owns: the framing it LAST
     * COMMANDED. Not a camera reading (`siteEntryModel.ts` disqualifies altitude sniffing —
     * *"IT FLAPS… STAGE IS A CAUSE, NOT AN EFFECT"*), and not a rival store: it is the exact
     * analogue of `PaneLayoutStore._splitMemory`, the memory that makes `◧ Split` work.
     *
     * It is written in EXACTLY ONE place — after the camera intent for that framing has been
     * forwarded to the port — so it can never claim a move that did not happen.
     */
    let globeFraming: SiteViewGlobeFraming = 'site';

    const render = (): void => {
        const model = describeSiteViewQuickToggle({
            layout: opts.store.getLayout(),
            canRestoreSplit: opts.store.canRestoreSplit(),
            mountableKinds: opts.mountableKinds?.() ?? null,
            globeFraming,
            // No camera ports wired ⇒ there is no way back, so the model refuses the way out
            // (see `canReturnToSite` — the gate is deliberately on the outbound click).
            canReturnToSite: opts.camera != null && (opts.camera.canFrameSite?.() ?? true),
        });

        root.replaceChildren();

        for (const seg of model.segments) {
            root.appendChild(buildSegment(seg, opts.store));
        }

        // ⭐ `⊕ 3D Globe` / `⤢ Back to site` — the founder's ask, an ACTION rather than a
        // segment because the globe is the SAME cesium view at world altitude (C60 §6.5) and
        // may not become a `ViewType` (C60 §6.10). See the model header.
        const globe = document.createElement('button');
        globe.type = 'button';
        globe.className =
            'svq-btn svq-btn--globe'
            + (model.globe.moveTo === 'site' ? ' svq-btn--globe-return' : '');
        globe.setAttribute('data-testid', 'site-view-quick-toggle-globe');
        globe.setAttribute('data-framing', globeFraming);
        // textContent only — no HTML sink in this file (C08 §3.1 §XSS-SINK-SCAN).
        globe.textContent = model.globe.label;
        globe.disabled = !model.globe.enabled;
        // DISABLE-OR-EXPLAIN: the reason reaches the user, never only the console.
        globe.title = model.globe.reason ?? model.globe.title;
        globe.addEventListener('click', () => {
            if (!model.globe.enabled) return;
            const moveTo = model.globe.moveTo;
            for (const intent of globeClickIntents(model.globe, model.segments, opts.store.getLayout())) {
                if (intent.type === 'view.site.frame-globe' || intent.type === 'view.site.frame-site') {
                    // The camera is the LAST intent by construction — a pane that is not
                    // mounted yet drops the target. Only now may the memory move.
                    try {
                        if (intent.type === 'view.site.frame-globe') opts.camera?.frameGlobe();
                        else opts.camera?.frameSite();
                    } catch (e) {
                        // A camera that refuses must not strand the control mid-state: leave
                        // `globeFraming` where it was so the label still offers a real move.
                        console.warn('[site-view-toggle] camera port threw — framing unchanged:', e);
                        return;
                    }
                    globeFraming = moveTo;
                    render();
                    return;
                }
                const res = opts.store.dispatch(intent);
                // A rejection is the store's honest answer, not a failure to swallow.
                if (!res.ok) {
                    console.info(
                        `[site-view-toggle] ${intent.type} refused: ${res.rejected ?? 'no reason given'}`,
                    );
                    return;
                }
            }
        });
        root.appendChild(globe);

        // `◧ Split` — the route BACK. A control that takes the user full-screen without
        // one is the L-942 shape: a branch whose escape hatch was never built.
        const split = document.createElement('button');
        split.type = 'button';
        split.className = 'svq-btn svq-btn--split';
        split.setAttribute('data-testid', 'site-view-quick-toggle-split');
        split.textContent = model.split.label;
        split.disabled = !model.split.enabled;
        // DISABLE-OR-EXPLAIN: the reason reaches the user, never only the console.
        if (model.split.reason) split.title = model.split.reason;
        split.addEventListener('click', () => {
            if (!model.split.enabled) return;
            opts.store.dispatch({ type: 'view.pane.restore-split' });
        });
        root.appendChild(split);
    };

    const buildSegment = (seg: SiteViewSegment, store: PaneLayoutStore): HTMLElement => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className =
            'svq-btn'
            + (seg.active ? ' svq-btn--active' : '')
            + (seg.soloed ? ' svq-btn--solo' : '');
        btn.setAttribute('data-testid', `site-view-quick-toggle-${seg.viewType}`);
        btn.setAttribute('aria-pressed', String(seg.active));
        btn.disabled = !seg.enabled;

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

        btn.title = seg.reason
            ?? (seg.soloed
                ? `${seg.label} is already filling the screen.`
                : `Show ${seg.label} full screen.`);

        btn.addEventListener('click', () => {
            // The model decides; this only forwards. A no-op segment returns [].
            for (const intent of segmentClickIntents(seg, store.getLayout())) {
                const res = store.dispatch(intent);
                // A rejection is the store's honest answer, not a failure to swallow.
                if (!res.ok) {
                    console.info(
                        `[site-view-toggle] ${intent.type} refused: ${res.rejected ?? 'no reason given'}`,
                    );
                    return;
                }
            }
        });
        return btn;
    };

    render();
    parent.appendChild(root);

    // Repaint from the store, never from the click — the bar is a pure function of
    // store state, so a layout change made from the pane menu updates it too.
    const unsubscribe = opts.store.subscribe(() => {
        if (!root.isConnected) return;
        render();
    });

    let disposed = false;
    return {
        element: root,
        refresh: render,
        dispose(): void {
            if (disposed) return;
            disposed = true;
            try { unsubscribe(); } catch { /* already gone */ }
            if (root.parentElement) root.parentElement.removeChild(root);
        },
    };
}
