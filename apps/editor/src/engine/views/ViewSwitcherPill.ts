/**
 * ViewSwitcherPill.ts — §ONE-VIEW-SWITCHER (founder 2026-09-07 · L-13160 · C59 §1.4)
 *
 * Layer Affected:  engine — view chrome (DOM only; imports no renderer, no store, no action)
 * File:            apps/editor/src/engine/views/ViewSwitcherPill.ts
 * Contracts:       C59 §1.4 (ONE picker component, mounted on every view region) ·
 *                  C59 §2.10.3 clause 4 (chrome is positioned relative to ITS OWN region,
 *                  never to the window or the canvas — L-13027) · C59 §4 Phase 3 (the
 *                  WebGPU renderer owns `#container`, so a PRYZM view is not a pane) ·
 *                  STR §26.1.1 (a refusal SPEAKS) · C06 §6.1 (one chrome language)
 * Issue log:       L-13160
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ASK, VERBATIM
 * ─────────────────────────────────────────────────────────────────────────────
 * *"At the moment we have a sound format at the beginning — this shall continue during the
 * whole project life cycle — at the beginning we have a dropdown panel to select the desired
 * view — but after we move into PRYZM 3D / PRYZM 2D view the layout changes — so I want to
 * keep the same all through."*
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ WHY THIS IS NOT A FOURTH SWITCHER
 * ─────────────────────────────────────────────────────────────────────────────
 * Retiring the two legacy rows from the PRYZM views (§ONE-VIEW-SWITCHER, the same lane) left
 * those views with NO on-view way to switch — which `bim3dChromeQuiet.spec.ts` ARM C already
 * recorded as *"a REAL DEGRADATION … a rail-panel route is not the one-gesture on-view switch
 * the founder asked for."* This is that one gesture, and it is deliberately the SAME shape as
 * the pane dropdown he already has: a pill naming the current view, a popup of options, a
 * refusal printed under any row that cannot act.
 *
 * ⛔ **IT OWNS NO OPTIONS AND NO HANDLERS.** The popup body is INJECTED
 * ({@link ViewSwitcherPillOptions.mountMenu}). In production `GISAreaLayout` passes
 * `mountViewSegmentSwitcher(window)` — the shipped whole-screen host of `viewPanelOptions()`,
 * the ONE panel definition, which is itself a HOST of `GIS_ACTIONS` and contributes no
 * handler of its own. So the founder's six rows exist in exactly one place and this file
 * re-HOSTS them, exactly as `PaneViewPicker` re-hosts `mountSiteViewQuickToggle` in its
 * `'menu'` shape. Three hosts, one definition (C19 §5.6 / C06 §13: *"a panel is a HOST; the
 * action is the AUTHORITY"*).
 *
 * ⛔ **AND IT IS NOT A SECOND LAYOUT OWNER.** It holds no `PaneLayoutStore`, mints none, and
 * dispatches nothing itself. C59 §2 invariant 3 is untouched because there is nothing here to
 * write with.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⛔ THE LIMIT IS PRINTED, NOT HIDDEN
 * ─────────────────────────────────────────────────────────────────────────────
 * A PRYZM view cannot be a pane (C59 Phase 3 — the renderer owns the whole viewport), so
 * picking a view here REPLACES this one rather than splitting beside it. That is a real
 * difference from the site split and the user is told, in the popup, in one sentence
 * ({@link ViewSwitcherPillOptions.limitNote}). The founder has never complained about this
 * kind of copy; a silently different behaviour is what he complains about.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠ WHY `position: absolute` INSIDE THE REGION, AND NEVER `fixed`
 * ─────────────────────────────────────────────────────────────────────────────
 * L-13027 / C59 §2.10.3 clause 4: the retired bars were `fixed`/canvas-centred and drifted off
 * the view the moment the view stopped being the canvas (the plan pane takes 40 %). This pill
 * is a child of the region element it names, so `left: 50%` is arithmetic on THAT box and
 * survives a split, a divider drag and a workspace-mode resize with no shell variable read.
 * ⚠ Its parent must be a containing block — `GISAreaLayout.ensureViewportPositioned` is the
 * ONE named owner of that assertion for `#container` and the retirement calls it.
 *
 * P3 — no `requestAnimationFrame`. P4 — no globals: every capability is a parameter.
 * P6 — no store writes. P8 — one span per exported function.
 */

import { trace } from '@opentelemetry/api';

const _tracer = trace.getTracer('pryzm.views.viewSwitcherPill');

const BRAND = '#6600FF';
const BRAND_TINT = '#f4f0ff';
const BORDER = '#ece7fb';

/** `data-testid` on the pill root. */
export const VIEW_SWITCHER_PILL_TESTID = 'view-switcher-pill';
/** `data-testid` on the trigger button. */
export const VIEW_SWITCHER_PILL_TRIGGER_TESTID = 'view-switcher-pill-trigger';
/** `data-testid` on the popup. */
export const VIEW_SWITCHER_PILL_POPUP_TESTID = 'view-switcher-pill-popup';
/** `data-testid` on the printed limit note. */
export const VIEW_SWITCHER_PILL_NOTE_TESTID = 'view-switcher-pill-note';

/** What an injected menu body gives back, so the pill can repaint and tear it down. */
export interface ViewSwitcherPillMenuHandle {
    repaint(): void;
    dispose(): void;
}

export interface ViewSwitcherPillOptions {
    /**
     * The VIEW REGION this pill names and sits inside. `#container` for a PRYZM view.
     * ⚠ Must be a containing block (`position: relative | absolute`) — see the header.
     */
    readonly parent: HTMLElement;
    /**
     * The trigger's text — the view the user is looking at, in the founder's own spelling.
     * ⭐ A FUNCTION, re-asked on every repaint, never a remembered string: a pill that
     * remembered its own last click would assert a view it never checked (the L-13002 lesson).
     * Return `null` when the current view is not reportable and the pill falls back to a
     * neutral label rather than naming a view it cannot establish (C84 EI-1b).
     */
    readonly label: () => string | null;
    /**
     * Build the popup body. Called ONCE, at mount; the returned handle is repainted whenever
     * the popup opens and disposed with the pill.
     *
     * ⛔ THE PILL DEFINES NO ROWS. See the header — production injects
     * `mountViewSegmentSwitcher(window)`.
     */
    readonly mountMenu: (body: HTMLElement) => ViewSwitcherPillMenuHandle;
    /** One sentence printed under the menu whenever a real limit applies. `null` ⇒ none. */
    readonly limitNote?: string | null;
    /** Where in the region the pill sits. Default `'top-center'` (founder: *"THEY NEED TO BE CENTERED."*). */
    readonly corner?: 'top-left' | 'top-right' | 'top-center';
    /**
     * Distance from the region's top edge. Default 10 px — the same band `PaneViewPicker`
     * uses, so the two read as one control at one height (C06 §6.1).
     */
    readonly topPx?: number;
    /** Suffix for the test ids, when a host mounts more than one. */
    readonly idSuffix?: string;
}

export interface ViewSwitcherPillHandle {
    readonly element: HTMLElement;
    /** Re-read the label and repaint the hosted menu. Cheap; call on every view change. */
    refresh(): void;
    /** Is the popup open? A READING of the DOM state, for a host that needs it. */
    readonly isOpen: () => boolean;
    dispose(): void;
}

/** The label shown when the host cannot report which view is current. */
export const VIEW_SWITCHER_PILL_UNKNOWN_LABEL = 'View';

/**
 * Mount the pill into `parent`. Idempotent per region: an existing pill with the same test id
 * is removed first, so a re-mount after a view change never leaves two.
 */
export function mountViewSwitcherPill(opts: ViewSwitcherPillOptions): ViewSwitcherPillHandle {
    const span = _tracer.startSpan('pryzm.views.mountViewSwitcherPill');
    try {
        const suffix = opts.idSuffix ? `-${opts.idSuffix}` : '';
        const rootId = `${VIEW_SWITCHER_PILL_TESTID}${suffix}`;
        const corner = opts.corner ?? 'top-center';
        const centred = corner === 'top-center';
        const top = opts.topPx ?? 10;

        opts.parent.querySelector(`[data-testid="${rootId}"]`)?.remove();

        const root = document.createElement('div');
        root.setAttribute('data-testid', rootId);
        root.setAttribute('role', 'group');
        root.setAttribute('aria-label', 'View');
        Object.assign(root.style, {
            position: 'absolute',
            top: `${top}px`,
            left: centred ? '50%' : (corner === 'top-left' ? '10px' : 'auto'),
            right: centred ? 'auto' : (corner === 'top-right' ? '10px' : 'auto'),
            transform: centred ? 'translateX(-50%)' : '',
            // The same band `PaneViewPicker` claims (60) — see its note: 60 clears Cesium's
            // CESIUM_Z=15, the MapLibre overlay's 40 and the retired `.svq-bar--pane`'s 38.
            // One chrome language means one stacking answer too (C06 §6.1).
            zIndex: '60',
            font: '600 12px/1 system-ui, sans-serif',
        } satisfies Partial<CSSStyleDeclaration>);

        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.setAttribute('data-testid', `${VIEW_SWITCHER_PILL_TRIGGER_TESTID}${suffix}`);
        trigger.setAttribute('aria-haspopup', 'listbox');
        trigger.setAttribute('aria-expanded', 'false');
        trigger.title = 'Change the view';
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
        popup.setAttribute('data-testid', `${VIEW_SWITCHER_PILL_POPUP_TESTID}${suffix}`);
        Object.assign(popup.style, {
            display: 'none',
            position: 'absolute',
            top: '40px',
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

        const body = document.createElement('div');
        body.setAttribute('data-testid', `view-switcher-pill-body${suffix}`);
        popup.appendChild(body);

        // ⛔ THE LIMIT IS PART OF THE CONTROL, NOT A CONSOLE LINE. STR §26.1.1: an option that
        // behaves differently from its sibling elsewhere says so in one sentence, on screen.
        if (opts.limitNote) {
            const note = document.createElement('div');
            note.setAttribute('data-testid', `${VIEW_SWITCHER_PILL_NOTE_TESTID}${suffix}`);
            note.textContent = opts.limitNote;
            Object.assign(note.style, {
                margin: '6px 4px 2px',
                padding: '8px 10px',
                borderRadius: '8px',
                background: BRAND_TINT,
                color: '#5b5470',
                border: `1px solid ${BORDER}`,
                font: '400 11px/1.35 system-ui, sans-serif',
                whiteSpace: 'normal',
            } satisfies Partial<CSSStyleDeclaration>);
            popup.appendChild(note);
        }

        root.appendChild(trigger);
        root.appendChild(popup);
        opts.parent.appendChild(root);

        // ⚠ A MENU THAT FAILS TO BUILD MUST NOT TAKE THE PILL WITH IT — the pill still names
        // the current view, and an empty popup that says nothing is worse than one that does.
        let menu: ViewSwitcherPillMenuHandle | null = null;
        try {
            menu = opts.mountMenu(body);
        } catch (e) {
            console.warn('[view-switcher-pill] menu failed to mount (non-fatal):', e);
            const failed = document.createElement('div');
            failed.setAttribute('data-testid', `view-switcher-pill-menu-error${suffix}`);
            failed.textContent =
                'The view list could not be built in this session. The views are still '
                + 'reachable from the GIS panel in the Project Browser.';
            Object.assign(failed.style, {
                padding: '8px 10px', font: '400 11px/1.35 system-ui, sans-serif',
                color: '#8a2020', whiteSpace: 'normal',
            } satisfies Partial<CSSStyleDeclaration>);
            body.appendChild(failed);
        }

        const paintTrigger = (): void => {
            let text: string | null = null;
            try { text = opts.label(); } catch { text = null; }
            // ⚠ UNREPORTED ≠ WRONG. A neutral word, never a guessed view name.
            trigger.textContent = `${text ?? VIEW_SWITCHER_PILL_UNKNOWN_LABEL} ▾`;
        };

        /**
         * The popup measures ITS OWN REGION at open — the same discipline `PaneViewPicker`
         * adopted after L-13052: the constants are a default, not a fit, and the box that
         * matters is the parent element, never the window.
         */
        const sizePopupToRegion = (): void => {
            const w = opts.parent.clientWidth;
            const h = opts.parent.clientHeight;
            if (w > 0) {
                const avail = Math.max(160, w - 20);
                popup.style.maxWidth = `${Math.min(340, avail)}px`;
                popup.style.minWidth = `${Math.min(272, avail)}px`;
            }
            if (h > 0) popup.style.maxHeight = `${Math.max(180, h - 60)}px`;
        };

        let open = false;
        const setOpen = (next: boolean): void => {
            open = next;
            popup.style.display = open ? 'block' : 'none';
            trigger.setAttribute('aria-expanded', String(open));
            if (open) {
                sizePopupToRegion();
                try { menu?.repaint(); } catch { /* a menu that cannot repaint is not fatal */ }
                paintTrigger();
            }
        };

        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            setOpen(!open);
        });
        // A click on a menu row dispatches and the view changes under us; close so the pill
        // re-reads its label on the next paint instead of standing open over a new view.
        body.addEventListener('click', () => {
            if (!open) return;
            setOpen(false);
            paintTrigger();
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

        paintTrigger();
        span.setAttribute('pryzm.viewSwitcherPill.corner', corner);

        return {
            element: root,
            isOpen: () => open,
            refresh: (): void => {
                try { menu?.repaint(); } catch { /* not fatal */ }
                paintTrigger();
            },
            dispose: (): void => {
                document.removeEventListener('click', onDocClick);
                document.removeEventListener('keydown', onKey);
                try { menu?.dispose(); } catch { /* chrome already gone */ }
                menu = null;
                root.remove();
            },
        };
    } finally {
        span.end();
    }
}
