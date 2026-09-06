// §SWAP-NOT-VACATE (L-12999 clause 4, founder ruling · STR §26.1.1 · C57 §1.5) — WHAT AN
// EMPTY PANE SAYS FOR ITSELF.
//
// ═══════════════════════════════════════════════════════════════════════════════════════
// THE FOUNDER'S RULING, clause 4, verbatim
// ═══════════════════════════════════════════════════════════════════════════════════════
//   > *"The other pane must not be left blank. L-12992 is the standing lesson here: a pane
//   >  whose only surface was disposed is the black rectangle the founder photographed.
//   >  Whatever happens to pane A when pane B claims Cesium, pane A must end holding
//   >  SOMETHING IT CAN STATE — a 2D view, or an honest placeholder that says why it is not
//   >  showing 3D and what to press to get it back."*
//
// `assignViewToPane`'s swap delivers the FIRST half of that sentence ("a 2D view") and it is
// the better half: a pane holding a real view needs no placeholder. This file is the SECOND
// half, for the empties the swap deliberately leaves standing.
//
// ═══════════════════════════════════════════════════════════════════════════════════════
// ⭐ WHICH EMPTIES ARE LEFT, AND WHY EACH IS CORRECT
// ═══════════════════════════════════════════════════════════════════════════════════════
// The swap removed the INVOLUNTARY empty — the pane nobody asked to empty. Three voluntary
// ones remain:
//
//   1. `assign(pane, null)` — the picker's `× Empty this pane`. The user asked.
//   2. `view.pane.solo` — full screen. The user asked, and the split is REMEMBERED.
//   3. the shell's opening state (`EMPTY_LR_LAYOUT`), before a preset lands.
//
// `SiteAuthoringPaneShell.applyFraction` collapses 1 and 2 into a legible full screen, so
// they are never a blank rectangle. **3 IS NOT COLLAPSED** — its condition is *exactly one*
// pane occupied, and with BOTH empty nothing is solo, so both panes stay on screen holding
// nothing. That is the *"BLANK light-lavender rectangle with only the tool rail"* of the
// founder's second L-13000 screenshot, and it is the case this file paints.
//
// ⛔ C57 §1.5 — A FAILURE DRESSED AS AN EMPTY. A pane empty because the user emptied it and
// a pane empty because a layout never arrived are the SAME PIXELS. The founder has read that
// ambiguity as corruption three times this week (L-12988, L-12992, L-13000). So the pane
// says which it is, in words, on its own face.
//
// ⛔ NOT A CSS FIX. The explicitly forbidden implementation is hiding a blank pane and
// calling it solved. The pane keeps its box, its chrome and its place in the split; what it
// gains is CONTENT. Nothing here sets `display:none` on a pane, and nothing here moves a
// view — the only write is a `view.pane.*` intent into the store (P6, C59 §2 invariant 3).
//
// INVARIANTS (C59 §2), same set the sibling chrome honours:
//   • 3 (command-driven layout) — a click dispatches an INTENT; it never touches a renderer,
//     a DOM style outside this element, or `MultiPaneController`.
//   • 6 (renderer-agnostic) — no renderer import. The suggested view is derived from
//     `VIEW_TYPE_REGISTRY` through `describeEmptyPane`; adding a view type needs no edit here.
//   • P3 — no `requestAnimationFrame`; this is static DOM that repaints on store notify.
//   • P4 — no `window as any`, no globals.
//   • C06 §7 (z-layering) — pane chrome, a child of ITS OWN pane element, never an overlay
//     that could cover the sibling pane.
//   • Brand: white + PRYZM purple `#6600FF`, never black ([[preview-color-unified-purple]]).
//
// PURE-DECISION SPLIT: every WORD and the suggested action come from `describeEmptyPane` in
// `paneViewOptions.ts`, which is unit-testable headless — the same shape as every other pane
// chrome module here. This file is only the paint and the click.

import type { PaneId } from './paneViewModel';
import { describeEmptyPane } from './paneViewOptions';
import type { PaneLayoutStore } from './paneLayoutStore';

export interface PaneEmptyStateHandle {
    readonly element: HTMLElement;
    /** Repaint from store state (also called automatically on every store change). */
    refresh(): void;
    dispose(): void;
}

export interface PaneEmptyStateOptions {
    /** The pane this placeholder belongs to (its chrome lives inside that pane element). */
    readonly paneId: PaneId;
    /** The pane element to mount into (chrome is scoped to its own pane — C06 §7). */
    readonly paneEl: HTMLElement;
    /** The ONE view-state store for this shell. All writes go through it (P6). */
    readonly store: PaneLayoutStore;
}

const BRAND = '#6600FF';
const BRAND_TINT = '#f4f0ff';
const BORDER = '#ece7fb';
const INK = '#2a2340';
const MUTED = '#6b6480';

/**
 * Mount the empty-pane statement into `paneEl`. Idempotent per pane: an existing element is
 * removed first, so a re-mount after a re-parent never leaves two.
 *
 * ⚠ MOUNTED UNCONDITIONALLY, SHOWN CONDITIONALLY. The element exists for the pane's whole
 * life and toggles `hidden` from store state, rather than being created when a pane happens
 * to empty — a placeholder that has to be CONSTRUCTED at the moment of emptying is one more
 * thing that can fail to appear exactly when it is needed, which is the class of defect this
 * whole ruling is about.
 */
export function mountPaneEmptyState(opts: PaneEmptyStateOptions): PaneEmptyStateHandle {
    const { paneId, paneEl, store } = opts;

    paneEl.querySelector(`[data-pane-empty="${paneId}"]`)?.remove();

    const root = document.createElement('div');
    root.setAttribute('data-pane-empty', paneId);
    root.setAttribute('data-testid', `pane-empty-state-${paneId}`);
    root.setAttribute('role', 'status');
    Object.assign(root.style, {
        position: 'absolute',
        inset: '0',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '10px',
        padding: '24px',
        textAlign: 'center',
        // Below the pane's picker/panel chrome (z 40) so the controls it points at stay
        // clickable, above the empty pane's own background. It can never leave this pane.
        zIndex: '5',
        background: '#ffffff',
        font: '400 13px/1.45 system-ui, sans-serif',
        color: INK,
    } satisfies Partial<CSSStyleDeclaration>);

    const headline = document.createElement('div');
    headline.setAttribute('data-testid', `pane-empty-headline-${paneId}`);
    Object.assign(headline.style, {
        font: '600 14px/1.3 system-ui, sans-serif',
        color: INK,
    } satisfies Partial<CSSStyleDeclaration>);

    const detail = document.createElement('div');
    detail.setAttribute('data-testid', `pane-empty-detail-${paneId}`);
    Object.assign(detail.style, {
        maxWidth: '30ch',
        color: MUTED,
    } satisfies Partial<CSSStyleDeclaration>);

    const action = document.createElement('button');
    action.type = 'button';
    action.setAttribute('data-testid', `pane-empty-action-${paneId}`);
    Object.assign(action.style, {
        appearance: 'none',
        cursor: 'pointer',
        marginTop: '2px',
        padding: '8px 14px',
        borderRadius: '9px',
        border: `1px solid ${BRAND}`,
        background: '#ffffff',
        color: BRAND,
        font: '600 12px/1 system-ui, sans-serif',
        whiteSpace: 'nowrap',
    } satisfies Partial<CSSStyleDeclaration>);
    action.addEventListener('mouseenter', () => { action.style.background = BRAND_TINT; });
    action.addEventListener('mouseleave', () => { action.style.background = '#ffffff'; });

    // A rejected intent must SAY so here too. Silently doing nothing on the one button an
    // empty pane offers would rebuild the dead end at a smaller scale.
    const error = document.createElement('div');
    error.setAttribute('data-testid', `pane-empty-error-${paneId}`);
    error.hidden = true;
    Object.assign(error.style, {
        maxWidth: '34ch',
        padding: '8px 10px',
        borderRadius: '8px',
        background: '#fff4f4',
        color: '#8a2020',
        border: '1px solid #f3d6d6',
        font: '400 11px/1.35 system-ui, sans-serif',
    } satisfies Partial<CSSStyleDeclaration>);

    const rule = document.createElement('div');
    Object.assign(rule.style, {
        width: '40px', height: '1px', background: BORDER,
    } satisfies Partial<CSSStyleDeclaration>);

    root.append(headline, rule, detail, action, error);
    paneEl.appendChild(root);

    let rejected: string | null = null;

    const render = (): void => {
        const statement = describeEmptyPane({
            layout: store.getLayout(),
            paneId,
            registry: store.getRegistry(),
            mountableKinds: store.mountableKinds(),
            canRestoreSplit: store.canRestoreSplit(),
        });

        // The pane holds a view — it states itself, and this element gets out of the way.
        if (!statement) {
            root.hidden = true;
            rejected = null;
            error.hidden = true;
            return;
        }

        root.hidden = false;
        headline.textContent = statement.headline;
        detail.textContent = statement.detail;

        if (statement.action) {
            action.hidden = false;
            action.textContent = statement.action.label;
            action.onclick = () => {
                const a = statement.action!;
                const r =
                    a.kind === 'restore-split'
                        ? store.dispatch({ type: 'view.pane.restore-split' })
                        : store.dispatch({
                            type: 'view.pane.assign',
                            paneId,
                            viewType: a.viewType ?? null,
                        });
                rejected = r.ok ? null : (r.rejected ?? 'That view could not be opened here.');
                // A successful dispatch notifies and re-renders us; a rejected one does not
                // (a rejected intent mutates nothing, deliberately), so paint the reason.
                if (!r.ok) render();
            };
        } else {
            action.hidden = true;
            action.onclick = null;
        }

        error.hidden = rejected == null;
        error.textContent = rejected ?? '';
    };

    const unsubscribe = store.subscribe(() => { rejected = null; render(); });
    render();

    return {
        element: root,
        refresh: () => render(),
        dispose: () => {
            unsubscribe();
            root.remove();
        },
    };
}
