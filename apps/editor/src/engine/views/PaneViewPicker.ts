// §FEAT-MULTI-PANE-VIEW-SYSTEM (L-412 / L-405, C59 Phase 2) — the per-pane VIEW PICKER:
// the founder's "in each view (split or full screen) the user should be able to easily,
// with a dropdown, change to another view — include 3D Site, plan, and all the views —
// and STANDARDISE this."
//
// STANDARDISED means: there is ONE picker component, it is mounted on EVERY pane, and
// its content comes from `VIEW_TYPE_REGISTRY` via the pure `describePaneViewOptions` —
// never from a per-call-site list of buttons (which is exactly what the legacy
// `mountResultToggleBar` segmented switch is, and what this supersedes for pane views).
//
// INVARIANTS this file honours (C59 §2):
//   • 3 (command-driven layout) — a click NEVER touches a renderer, a DOM style, or the
//     `MultiPaneController`. It dispatches a `view.pane.*` intent into the
//     `PaneLayoutStore` and then repaints from the store's notification. The picker is
//     a pure function of store state.
//   • 1 (one instance per singleton) — the picker cannot offer a choice the mount-time
//     `validatePaneLayout` assert would reject: enablement comes from the same pure
//     model, and a singleton move is LABELLED ("the two panes SWAP: it moves here and
//     2D Site Map moves to the right pane" — or, when this pane is empty and so has
//     nothing to hand back, "the right pane empties"). §SWAP-NOT-VACATE, L-12999.
//   • 6 (renderer-agnostic) — this file imports no renderer. Adding a view type is a
//     registry entry; the picker picks it up with no edit here.
//   • 2 (single rAF) — no `requestAnimationFrame`; the popup is plain DOM, no animation
//     loop.
//   • 4 (no `window as any`) — no globals touched.
//   • C06 §7 (z-layering) — the picker is PANE CHROME: it is a child of ITS OWN pane
//     element and sits above that pane's renderer surface only, never over its sibling.
//
// DISABLE-OR-EXPLAIN: an unavailable option is rendered greyed AND its reason is printed
// underneath it (not only in a `title=`), because a greyed option with no reason is an
// explicitly bad answer per the Phase-2 brief. The same applies to a singleton move: the
// consequence is stated BEFORE the click, not discovered after the other pane blanks.
//
// ⭐ §ONE-PANEL-PER-PANE-AND-MAKE-IT-A-DROPDOWN (L-13015, founder 2026-09-06) — THIS IS NOW
// THE PANE'S ONE VIEW CONTROL, and it is the only one on screen per pane.
//
// He photographed THREE switchers stacked over one pane — this dropdown, the per-pane
// `.svq-bar--pane` segment bar, and the body-level `.vsw-onview` bar — and ruled: *"the left
// hand side have double panels with the view — keep the one, the formal and more robust
// only, and keep it DROP DOWN only. But when in split view, on the left hand side only,
// please keep TWO dropdown panels."* The rule that came out of it is
// **SWITCHER COUNT == VISIBLE PANE COUNT**, and the survivor is this dropdown.
//
// So the founder's six (`viewPanelOptions()`) moved INTO this popup, rendered by
// `mountSiteViewQuickToggle` in its `'menu'` shape — a change of HOST, not a new control,
// and not a second copy of the option definition. Three things had to survive the move and
// all three did:
//   · THE SIX THEMSELVES, with their VARIANTS (satellite is a basemap on the one map; the
//     globe is an altitude on the one Cesium camera). The trigger names the active row
//     variant-and-all, read from the panel's own model.
//   · THE REFUSALS, SPOKEN. STR §26.1.1 / L-12999 is a founder ruling that an unavailable
//     option stays OFFERED and that its refusal says one sentence naming the reason — *"a
//     silently greyed-out segment is the WRONG implementation"*. The menu shape prints it
//     under the row, which is the rule this file already followed for the registry list.
//   · THE PANE MENU, beneath, carrying every view the six do not offer (elevations,
//     sections) — the founder's *"if the user wants to open more they can do it in the
//     browser"*. Nothing is listed twice: the overlap is derived, not enumerated.

import type { PaneId, RendererKind, ViewType } from './paneViewModel';
import {
    describePaneLayoutActions,
    describePaneViewOptions,
    type PaneViewOption,
} from './paneViewOptions';
import type { PaneLayoutStore } from './paneLayoutStore';
// §ONE-PANEL-PER-PANE-AND-MAKE-IT-A-DROPDOWN (L-13015) — the founder's six live in the
// popup now, rendered by the control that already owns them. NOT re-implemented here:
// `viewPanelOptions.ts` is the ONE option definition (§VIEW-PANEL-PER-PANE) and a second
// list of six rows would be the rival bar this repo has refused three times today.
import {
    mountSiteViewQuickToggle,
    type SiteViewBasemapPorts,
    type SiteViewCameraPorts,
    type SiteViewQuickToggleHandle,
} from './SiteViewQuickToggle';
import type { SiteViewGlobeFraming } from './siteViewQuickToggleModel';
import { viewPanelOptions } from './viewPanelOptions';

export interface PaneViewPickerHandle {
    readonly element: HTMLElement;
    /** Repaint from store state (also called automatically on every store change). */
    refresh(): void;
    dispose(): void;
}

export interface PaneViewPickerOptions {
    /** The pane this picker belongs to (its chrome lives inside that pane element). */
    readonly paneId: PaneId;
    /** The pane element to mount into (chrome is scoped to its own pane — C06 §7). */
    readonly paneEl: HTMLElement;
    /** The ONE view-state store for this shell. All writes go through it (P6). */
    readonly store: PaneLayoutStore;
    /**
     * Where in the pane the dropdown sits. Defaults to top-left.
     *
     * ⭐ `'top-center'` IS THE FOUNDER'S ANSWER (2026-09-07, verbatim: *"THEY NEED TO BE
     * CENTERED."*), and it is what C59's own card text already promised — *"Switch the view,
     * or split it, from the bar centred on the view itself."*
     *
     * ⛔ CENTRED ON THE PANE, NEVER ON THE CANVAS OR THE WINDOW (C59 §2.10.3 clause 4,
     * L-13027). The retired whole-screen bar centred itself with `--shell-canvas-cx` /
     * `--shell-canvas-w`, which are CANVAS-relative — so when the split collapsed it re-centred
     * on a region that was no longer a view. This control is `position:absolute` inside
     * `paneEl`, so `left:50%` + `translateX(-50%)` is arithmetic on ITS OWN PANE and stays
     * right through a divider drag, a solo, and a workspace-mode resize without reading a
     * single shell variable.
     */
    readonly corner?: 'top-left' | 'top-right' | 'top-center';
    /**
     * §ONE-PANEL-PER-PANE-AND-MAKE-IT-A-DROPDOWN (L-13015) — the founder's six rows, hosted
     * INSIDE this dropdown. Omit and the picker renders the registry list alone (what a
     * bare-geometry test wants); pass it and this is the pane's ONE view control.
     *
     * The three ports are handed straight through to `mountSiteViewQuickToggle` — this file
     * reads no globals and resolves no camera (P1/P4): the composition layer
     * (`SiteAuthoringPaneShell`) owns that, exactly as it did when the panel was a bar.
     */
    readonly panel?: PaneViewPickerPanelPorts;
}

/** @see PaneViewPickerOptions.panel */
export interface PaneViewPickerPanelPorts {
    /** Renderer kinds with a mounter registered here (the runtime half of availability). */
    readonly mountableKinds?: () => ReadonlySet<RendererKind> | null;
    readonly camera?: SiteViewCameraPorts;
    readonly basemap?: SiteViewBasemapPorts;
    /** The SHARED globe-framing memory — two panes drive ONE Cesium camera. */
    readonly getFraming?: () => SiteViewGlobeFraming;
    readonly onFramingChanged?: (next: SiteViewGlobeFraming) => void;
}

const BRAND = '#6600FF';
const BRAND_TINT = '#f4f0ff';
const BORDER = '#ece7fb';

/**
 * The view types the hosted panel already offers, DERIVED from the ONE option definition
 * (`viewPanelOptions.ts`) rather than listed here. A hand-written list would let a new
 * promoted row appear TWICE in this popup — once in the panel, once under "More views" —
 * which is the duplication the founder photographed, one level down.
 */
const PANEL_VIEW_TYPES: ReadonlySet<ViewType> = new Set(
    viewPanelOptions().map((o) => o.viewType),
);

/**
 * Mount the picker into `paneEl`. Idempotent per pane: an existing picker element is
 * removed first, so a re-mount after a re-parent never leaves two dropdowns.
 */
export function mountPaneViewPicker(opts: PaneViewPickerOptions): PaneViewPickerHandle {
    const { paneId, paneEl, store } = opts;
    const corner = opts.corner ?? 'top-left';

    paneEl.querySelector(`[data-pane-picker="${paneId}"]`)?.remove();

    const root = document.createElement('div');
    root.setAttribute('data-pane-picker', paneId);
    root.setAttribute('data-testid', `pane-view-picker-${paneId}`);
    const centred = corner === 'top-center';
    Object.assign(root.style, {
        position: 'absolute',
        top: '10px',
        left: centred ? '50%' : (corner === 'top-left' ? '10px' : 'auto'),
        right: centred ? 'auto' : (corner === 'top-right' ? '10px' : 'auto'),
        // §PANE-DROPDOWN-CENTRED (founder 2026-09-07) — the centring is PANE arithmetic: this
        // element is absolutely positioned inside `paneEl`, so 50% is 50% OF THE PANE. No
        // `--shell-canvas-cx`, no `position: fixed`, nothing measured off the window — that is
        // the L-13027 defect, and it is the reason the old bar drifted off its view the moment
        // the split collapsed.
        // The pane clips its chrome (`overflow:hidden`), so a centred control can never bleed
        // into its sibling however narrow the pane gets — no width assumption is needed here.
        transform: centred ? 'translateX(-50%)' : '',
        // Pane chrome sits above ITS OWN pane's renderer surface only (C06 §7).
        //
        // ⛔ CORRECTED 2026-09-07 (§PANE-DROPDOWN-VISIBLE, L-13052). This was `40` and the
        // comment claimed it *"clears … the MapLibre `inset:0` overlay"*. IT DID NOT — it
        // TIED with it. `SiteBoundaryMap2D`'s overlay `.pryzm-gis-map2d` is
        // `position:absolute; inset:0; zIndex:'40'` (§DRAW-MAP-ABOVE-CESIUM, 2026-06-03),
        // the SAME value; the pane element is `position:relative` with `z-index:auto`, so
        // it is NOT a stacking context and both children are painted in the shell root's
        // one context, where an equal z-index is broken by DOM ORDER. The picker is
        // appended at shell-mount time and the map overlay when the mounter runs — i.e.
        // ALWAYS LATER — so the LEFT pane's dropdown was painted, sized and clickable and
        // covered edge-to-edge by the pastel map. That is the founder's "empty region at
        // the top of the pane": the control was there and nothing of it was visible.
        //
        // 60 clears every surface a pane can host (Cesium's CESIUM_Z=15, the MapLibre
        // overlay's 40, the retired `.svq-bar--pane`'s 38) with room above the largest.
        // The pane's `overflow:hidden` still clips it, so a raised z can never let this
        // pane's chrome paint over the sibling pane — C06 §7 holds unchanged.
        zIndex: '60',
        font: '600 12px/1 system-ui, sans-serif',
    } satisfies Partial<CSSStyleDeclaration>);

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.setAttribute('data-testid', `pane-view-picker-trigger-${paneId}`);
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.title = 'Change the view shown in this pane';
    Object.assign(trigger.style, {
        appearance: 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '7px 12px',
        borderRadius: '9px',
        border: `1px solid ${BRAND}`,
        background: '#ffffff',
        color: BRAND,
        font: 'inherit',
        boxShadow: '0 3px 12px rgba(20,10,60,0.16)',
        whiteSpace: 'nowrap',
    } satisfies Partial<CSSStyleDeclaration>);
    trigger.addEventListener('mouseenter', () => { trigger.style.background = BRAND_TINT; });
    trigger.addEventListener('mouseleave', () => { trigger.style.background = '#ffffff'; });

    const popup = document.createElement('div');
    popup.setAttribute('role', 'listbox');
    popup.setAttribute('data-testid', `pane-view-picker-popup-${paneId}`);
    Object.assign(popup.style, {
        display: 'none',
        position: 'absolute',
        top: '40px',
        // The popup hangs from the trigger, so it is centred on the SAME axis — and because
        // its parent (`root`) is already centred on the pane, this 50% is measured inside a box
        // that is itself pane-relative. `sizePopupToPane()` clamps its width to the pane at
        // OPEN time, so a centred popup can never be wider than the pane it is centred in.
        left: centred ? '50%' : (corner === 'top-left' ? '0' : 'auto'),
        right: centred ? 'auto' : (corner === 'top-right' ? '0' : 'auto'),
        transform: centred ? 'translateX(-50%)' : '',
        minWidth: '272px',
        maxWidth: '340px',
        padding: '6px',
        borderRadius: '12px',
        border: `1px solid ${BORDER}`,
        background: '#ffffff',
        boxShadow: '0 10px 30px rgba(20,10,60,0.20)',
        maxHeight: '70vh',
        overflowY: 'auto',
    } satisfies Partial<CSSStyleDeclaration>);

    root.appendChild(trigger);
    root.appendChild(popup);
    paneEl.appendChild(root);

    // ── §ONE-PANEL-PER-PANE-AND-MAKE-IT-A-DROPDOWN (L-13015) — THE SIX, IN THE POPUP ──
    //
    // Founder 2026-09-06, on three switchers stacked over one pane: *"keep the one, the
    // formal and more robust only, and keep it DROP DOWN only. But when in split view, on
    // the left hand side only, please keep TWO dropdown panels."*
    //
    // ⛔ NOT A FOURTH CONTROL AND NOT A COPY OF THE SIX. `mountSiteViewQuickToggle` is the
    // shipped renderer of `viewPanelOptions()`; it is mounted here in its `'menu'` shape,
    // with its own SPLIT suppressed because this popup already renders
    // `describePaneLayoutActions` (which includes restore-split) below.
    let panel: SiteViewQuickToggleHandle | null = null;
    let panelHost: HTMLDivElement | null = null;
    if (opts.panel) {
        panelHost = document.createElement('div');
        panelHost.setAttribute('data-testid', `pane-view-picker-panel-${paneId}`);
        try {
            panel = mountSiteViewQuickToggle({
                store,
                parent: panelHost,
                paneId,
                shape: 'menu',
                showSplit: false,
                mountableKinds: opts.panel.mountableKinds,
                camera: opts.panel.camera,
                basemap: opts.panel.basemap,
                getFraming: opts.panel.getFraming,
                onFramingChanged: opts.panel.onFramingChanged,
                // The panel repaints itself (a basemap swap, a camera move made from the
                // OTHER pane). The trigger must follow, or the pill names a view the popup
                // no longer says is current.
                onRendered: () => { trigger.textContent = triggerLabel(); },
            });
        } catch (e) {
            // A panel that failed to build must not take the pane's view menu with it —
            // the registry list below is the route that still works.
            console.warn('[pane-view-picker] view panel failed to mount (non-fatal):', e);
            panelHost = null;
            panel = null;
        }
    }

    /**
     * §PANE-DROPDOWN-VISIBLE (L-13052) — ⭐ THE POPUP MEASURES ITS OWN PANE, at open.
     *
     * The constants above are a DEFAULT, not a fit: `min-width:272px` / `max-width:340px`
     * / `max-height:70vh` were written against a half-screen pane and the lane that wrote
     * them recorded the residual in its own audit — *"a pane narrower than 340px would let
     * it overflow"*, and `70vh` is a WINDOW measurement inside a box that is not the window.
     * A divider dragged to `MIN_FRACTION` (0.2) on a 1280 px screen gives a 256 px pane, so
     * the residual is reachable by dragging, not only in theory.
     *
     * ⛔ THE PANE, NOT THE WINDOW (C59 §2.10.3 clause 4). This reads `paneEl`'s own box —
     * the element this control is a child of — so the popup stays pane-anchored. The
     * L-13027 defect was anchoring pane chrome to the VIEWPORT; measuring the pane is the
     * opposite of that, and is what the earlier lane deliberately deferred rather than
     * ruled out. Read at OPEN time, so a divider drag is already accounted for and nothing
     * is cached to go stale.
     */
    const POPUP_W_MAX = 340;
    const POPUP_W_PREF = 272;
    const POPUP_GUTTER = 20;
    const sizePopupToPane = (): void => {
        const w = paneEl.clientWidth;
        const h = paneEl.clientHeight;
        if (w > 0) {
            const avail = Math.max(160, w - POPUP_GUTTER);
            popup.style.maxWidth = `${Math.min(POPUP_W_MAX, avail)}px`;
            popup.style.minWidth = `${Math.min(POPUP_W_PREF, avail)}px`;
        }
        // Leave the trigger's own band (top:10 + ~32 tall + gutter) plus a bottom gutter.
        if (h > 0) popup.style.maxHeight = `${Math.max(180, h - 60)}px`;
    };

    let open = false;
    const setOpen = (next: boolean): void => {
        open = next;
        popup.style.display = open ? 'block' : 'none';
        trigger.setAttribute('aria-expanded', String(open));
        if (open) {
            sizePopupToPane();
            render();
        }
    };
    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        setOpen(!open);
    });
    const onDocClick = (e: MouseEvent): void => {
        if (!open) return;
        if (e.target instanceof Node && root.contains(e.target)) return;
        setOpen(false);
    };
    document.addEventListener('click', onDocClick);
    const onKey = (e: KeyboardEvent): void => {
        if (e.key === 'Escape' && open) setOpen(false);
    };
    document.addEventListener('keydown', onKey);

    // ── Rendering ────────────────────────────────────────────────────────────

    const rowBase = (): HTMLDivElement => {
        const row = document.createElement('div');
        Object.assign(row.style, {
            display: 'block',
            width: '100%',
            textAlign: 'left',
            padding: '8px 10px',
            borderRadius: '8px',
            marginBottom: '2px',
        } satisfies Partial<CSSStyleDeclaration>);
        return row;
    };

    const reasonEl = (text: string, muted: boolean): HTMLDivElement => {
        const r = document.createElement('div');
        r.textContent = text;
        Object.assign(r.style, {
            marginTop: '3px',
            font: '400 11px/1.35 system-ui, sans-serif',
            color: muted ? '#8b86a0' : '#5b5470',
            whiteSpace: 'normal',
        } satisfies Partial<CSSStyleDeclaration>);
        return r;
    };

    const renderOption = (o: PaneViewOption): HTMLElement => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('role', 'option');
        btn.setAttribute('data-view-type', o.viewType);
        btn.setAttribute('data-option-state', o.state);
        btn.setAttribute('aria-selected', String(o.state === 'current'));
        btn.disabled = !o.enabled;
        if (o.reason) btn.title = o.reason;

        const row = rowBase();
        const head = document.createElement('div');
        head.textContent = `${o.glyph ? `${o.glyph} ` : ''}${o.label}${o.state === 'current' ? '  ✓' : ''}`;
        Object.assign(head.style, {
            font: '600 12.5px/1.2 system-ui, sans-serif',
        } satisfies Partial<CSSStyleDeclaration>);
        row.appendChild(head);
        // Every non-plain state EXPLAINS itself inline — never a bare greyed row.
        if (o.reason) row.appendChild(reasonEl(o.reason, !o.enabled));

        Object.assign(btn.style, {
            appearance: 'none',
            border: 'none',
            width: '100%',
            padding: '0',
            background: o.state === 'current' ? BRAND_TINT : 'transparent',
            color: o.enabled ? (o.state === 'current' ? BRAND : '#2b2440') : '#a49fb8',
            cursor: o.enabled ? 'pointer' : 'not-allowed',
            font: 'inherit',
            borderRadius: '8px',
            opacity: o.enabled ? '1' : '0.75',
        } satisfies Partial<CSSStyleDeclaration>);
        btn.appendChild(row);

        if (o.enabled) {
            btn.addEventListener('mouseenter', () => { btn.style.background = BRAND_TINT; });
            btn.addEventListener('mouseleave', () => {
                btn.style.background = o.state === 'current' ? BRAND_TINT : 'transparent';
            });
            btn.addEventListener('click', () => {
                if (o.state === 'current') { setOpen(false); return; }
                // ⭐⭐ §PRYZM-3D-FROM-THE-DROPDOWN (L-13254) — a row that cannot be a PANE is still
                // a row that can be REACHED. Founder: *"we need to enable PRYZM 3d access from the
                // drop down"*.
                //
                // ⛔ IT MUST NOT GO THROUGH `dispatchAssign`. That writes a pane intent into
                // `PaneLayoutStore`, and this view has `paneHostable: false` — the layout would be
                // unrealisable and `validatePaneLayout` exists to reject exactly that. The route is
                // the DECLARED whole-screen one, `window.pryzmActivateBimView`, which is the same
                // choke point Views & Sheets and the GIS dropdown already use (it exits GIS,
                // retires the legacy bars, then activates). One orchestrator, three callers.
                if (o.state === 'opens-fullscreen') {
                    const mode = o.fullScreenRoute;
                    const go = (window as { pryzmActivateBimView?: (m?: 'Top' | '3D') => unknown })
                        .pryzmActivateBimView;
                    if (mode === undefined || typeof go !== 'function') {
                        // ⛔ NAMED, NEVER A SILENT NO-OP. A dropdown row that does nothing on click
                        // is the defect this whole picker was built to end.
                        console.warn(
                            '[PaneViewPicker] §PRYZM-3D-FROM-THE-DROPDOWN — cannot open '
                            + `"${o.label}" full screen: `
                            + `${mode === undefined ? 'no fullScreenRoute is declared for it' : 'window.pryzmActivateBimView is not registered in this workspace'}.`,
                        );
                        return;
                    }
                    setOpen(false);
                    try {
                        void Promise.resolve(go(mode)).catch((e: unknown) => {
                            console.warn('[PaneViewPicker] §PRYZM-3D-FROM-THE-DROPDOWN the '
                                + 'full-screen route rejected:', e);
                        });
                    } catch (e) {
                        console.warn('[PaneViewPicker] §PRYZM-3D-FROM-THE-DROPDOWN threw:', e);
                    }
                    return;
                }
                dispatchAssign(o.viewType);
            });
        }
        return btn;
    };

    const renderAction = (
        label: string,
        enabled: boolean,
        reason: string | undefined,
        onPick: () => void,
        testid: string,
    ): HTMLElement => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.disabled = !enabled;
        btn.setAttribute('data-testid', testid);
        if (reason) btn.title = reason;
        const row = rowBase();
        const head = document.createElement('div');
        head.textContent = label;
        Object.assign(head.style, { font: '600 12px/1.2 system-ui, sans-serif' } satisfies Partial<CSSStyleDeclaration>);
        row.appendChild(head);
        if (!enabled && reason) row.appendChild(reasonEl(reason, true));
        Object.assign(btn.style, {
            appearance: 'none', border: 'none', width: '100%', padding: '0',
            background: 'transparent', color: enabled ? BRAND : '#a49fb8',
            cursor: enabled ? 'pointer' : 'not-allowed', font: 'inherit', borderRadius: '8px',
        } satisfies Partial<CSSStyleDeclaration>);
        btn.appendChild(row);
        if (enabled) {
            btn.addEventListener('mouseenter', () => { btn.style.background = BRAND_TINT; });
            btn.addEventListener('mouseleave', () => { btn.style.background = 'transparent'; });
            btn.addEventListener('click', onPick);
        }
        return btn;
    };

    /** ONE write path: every user choice becomes an intent (C59 §2 invariant 3). */
    const dispatchAssign = (viewType: ViewType): void => {
        const r = store.dispatch({ type: 'view.pane.assign', paneId, viewType });
        finishDispatch(r.ok, r.rejected);
    };

    const finishDispatch = (ok: boolean, rejected?: string): void => {
        if (ok) {
            setOpen(false);
            return;
        }
        // A rejection must never be silent — keep the popup open and show the reason.
        render(rejected);
    };

    const headingEl = (text: string): HTMLDivElement => {
        const h = document.createElement('div');
        h.textContent = text;
        Object.assign(h.style, {
            padding: '6px 10px 8px', color: '#6b6482',
            font: '600 11px/1 system-ui, sans-serif', letterSpacing: '0.04em',
            textTransform: 'uppercase',
        } satisfies Partial<CSSStyleDeclaration>);
        return h;
    };

    const separatorEl = (): HTMLDivElement => {
        const s = document.createElement('div');
        Object.assign(s.style, {
            height: '1px', background: BORDER, margin: '6px 4px',
        } satisfies Partial<CSSStyleDeclaration>);
        return s;
    };

    /**
     * §ONE-PANEL-PER-PANE-AND-MAKE-IT-A-DROPDOWN (L-13015) — the trigger names the row the
     * user is actually looking at, VARIANT AND ALL.
     *
     * ⭐ `2D Satellite` and `2D Site Map` are ONE view type under two basemaps, and `3D
     * Globe` and `3D Site` are ONE view type under two camera framings — so a label read
     * from the registry descriptor alone would say "2D Site Map" while the user is looking
     * at satellite. The panel has already computed which row is active; this READS that one
     * computation rather than making a second (C84 EI-1b: two copies of one fact drift).
     * With no panel hosted, the registry descriptor is the whole answer and is correct.
     */
    const triggerLabel = (): string => {
        const seg = panel?.currentModel()?.segments.find((s) => s.active);
        if (seg) return `${seg.glyph ? `${seg.glyph} ` : ''}${seg.label} ▾`;
        const current = store.getLayout()[paneId] ?? null;
        const d = current ? store.getRegistry()[current] : null;
        return d ? `${d.glyph ? `${d.glyph} ` : ''}${d.label} ▾` : '⃞ Empty pane ▾';
    };

    const render = (rejected?: string): void => {
        const layout = store.getLayout();
        const current = layout[paneId] ?? null;
        const registry = store.getRegistry();
        trigger.textContent = triggerLabel();

        popup.replaceChildren();

        popup.appendChild(headingEl('Show in this pane'));

        const options = describePaneViewOptions({
            layout,
            paneId,
            registry,
            mountableKinds: store.mountableKinds(),
            // §ONBOARDING-STEP-PINS-ITS-SURFACE (L-10720) — the store refuses a choice
            // that would evict the view the current step depends on; this makes the
            // refusal VISIBLE in the menu instead of silent on click.
            pinnedViews: store.pinnedViews(),
        });

        if (panelHost) {
            // ⭐ THE FOUNDER'S SIX, FIRST — rendered by the control that owns them. The
            // host element is re-attached rather than rebuilt: rebuilding it every paint
            // would drop the panel's own store subscription and its ports with it.
            popup.appendChild(panelHost);
            // ⛔ AND THE PANE MENU SURVIVES BENEATH IT (the 2026-08 brief: "do not delete
            // that menu — it carries real refusals with reasons"). Only the views the six
            // do not already offer appear here, so no row is listed twice — this is the
            // founder's own *"if the user wants to open more they can do it in the
            // browser"*, and it is where elevations and sections live.
            const more = options.filter((o) => !PANEL_VIEW_TYPES.has(o.viewType));
            if (more.length > 0) {
                popup.appendChild(separatorEl());
                popup.appendChild(headingEl('More views'));
                for (const o of more) popup.appendChild(renderOption(o));
            }
        } else {
            for (const o of options) popup.appendChild(renderOption(o));
        }

        popup.appendChild(separatorEl());

        for (const a of describePaneLayoutActions(layout, paneId, store.canRestoreSplit())) {
            popup.appendChild(
                renderAction(a.label, a.enabled, a.reason, () => {
                    const panes = Object.keys(layout);
                    const r =
                        a.kind === 'swap'
                            ? store.dispatch({ type: 'view.pane.swap', a: panes[0]!, b: panes[1]! })
                            : a.kind === 'solo'
                              ? store.dispatch({ type: 'view.pane.solo', paneId })
                              : store.dispatch({ type: 'view.pane.restore-split' });
                    finishDispatch(r.ok, r.rejected);
                }, `pane-layout-action-${a.kind}-${paneId}`),
            );
        }

        // Clearing the pane is a first-class intent too (it is how you go from a split
        // to "one big view" without a bespoke DOM toggle).
        popup.appendChild(
            renderAction(
                '× Empty this pane',
                current != null,
                current == null ? 'This pane is already empty.' : undefined,
                () => {
                    const r = store.dispatch({ type: 'view.pane.assign', paneId, viewType: null });
                    finishDispatch(r.ok, r.rejected);
                },
                `pane-layout-action-clear-${paneId}`,
            ),
        );

        if (rejected) {
            const err = document.createElement('div');
            err.setAttribute('data-testid', `pane-view-picker-error-${paneId}`);
            err.textContent = rejected;
            Object.assign(err.style, {
                margin: '6px 4px 2px', padding: '8px 10px', borderRadius: '8px',
                background: '#fff4f4', color: '#8a2020', border: '1px solid #f3d6d6',
                font: '400 11px/1.35 system-ui, sans-serif', whiteSpace: 'normal',
            } satisfies Partial<CSSStyleDeclaration>);
            popup.appendChild(err);
        }
    };

    const unsubscribe = store.subscribe(() => render());
    render();

    return {
        element: root,
        refresh: () => {
            // The hosted panel first: the trigger label is READ from its model, so
            // repainting this one before that one would label the pill from a stale row.
            try { panel?.refresh(); } catch { /* a panel that cannot repaint is not fatal */ }
            render();
        },
        dispose: () => {
            unsubscribe();
            document.removeEventListener('click', onDocClick);
            document.removeEventListener('keydown', onKey);
            try { panel?.dispose(); } catch { /* chrome already gone */ }
            panel = null;
            root.remove();
        },
    };
}
