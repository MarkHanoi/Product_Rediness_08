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
//     model, and a singleton move is LABELLED ("moves here, the right pane empties").
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

import type { PaneId, ViewType } from './paneViewModel';
import {
    describePaneLayoutActions,
    describePaneViewOptions,
    type PaneViewOption,
} from './paneViewOptions';
import type { PaneLayoutStore } from './paneLayoutStore';

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
    /** Corner within the pane. Defaults to top-left. */
    readonly corner?: 'top-left' | 'top-right';
}

const BRAND = '#6600FF';
const BRAND_TINT = '#f4f0ff';
const BORDER = '#ece7fb';

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
    Object.assign(root.style, {
        position: 'absolute',
        top: '10px',
        left: corner === 'top-left' ? '10px' : 'auto',
        right: corner === 'top-right' ? '10px' : 'auto',
        // Pane chrome sits above ITS OWN pane's renderer surface only (C06 §7).
        // 40 clears the re-parented renderer surfaces that carry their own z inside the
        // pane (the Cesium container's CESIUM_Z=15, the MapLibre `inset:0` overlay) while
        // staying inside this pane's box — it can never overlay the sibling pane.
        zIndex: '40',
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
        left: corner === 'top-left' ? '0' : 'auto',
        right: corner === 'top-right' ? '0' : 'auto',
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

    let open = false;
    const setOpen = (next: boolean): void => {
        open = next;
        popup.style.display = open ? 'block' : 'none';
        trigger.setAttribute('aria-expanded', String(open));
        if (open) render();
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

    const render = (rejected?: string): void => {
        const layout = store.getLayout();
        const current = layout[paneId] ?? null;
        const registry = store.getRegistry();
        const currentDesc = current ? registry[current] : null;
        trigger.textContent = currentDesc
            ? `${currentDesc.glyph ? `${currentDesc.glyph} ` : ''}${currentDesc.label} ▾`
            : '⃞ Empty pane ▾';

        popup.replaceChildren();

        const heading = document.createElement('div');
        heading.textContent = 'Show in this pane';
        Object.assign(heading.style, {
            padding: '6px 10px 8px', color: '#6b6482',
            font: '600 11px/1 system-ui, sans-serif', letterSpacing: '0.04em',
            textTransform: 'uppercase',
        } satisfies Partial<CSSStyleDeclaration>);
        popup.appendChild(heading);

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
        for (const o of options) popup.appendChild(renderOption(o));

        const sep = document.createElement('div');
        Object.assign(sep.style, {
            height: '1px', background: BORDER, margin: '6px 4px',
        } satisfies Partial<CSSStyleDeclaration>);
        popup.appendChild(sep);

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
        refresh: () => render(),
        dispose: () => {
            unsubscribe();
            document.removeEventListener('click', onDocClick);
            document.removeEventListener('keydown', onKey);
            root.remove();
        },
    };
}
