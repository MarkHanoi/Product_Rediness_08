// §FEAT-SITE-ENTRY-GLOBE (L-593, C60 §3) — the STAGED PANEL: the DOM chrome for the
// globe entry flow.
//
// It holds NO copy, NO coverage knowledge and NO state. Every string it renders comes
// from `describeSiteEntryPanel()`, and every click dispatches a `site.entry.*` intent
// into the `SiteEntryStore` — nothing else. That is what makes "what does the user see
// when the answer is *not covered*" a unit test on the pure model rather than a
// screenshot review of this file.
//
// INVARIANTS (C60 §6, mirroring C59 §2):
//   • P6 / C59 §2.3 — a click NEVER touches the camera, the viewer, or a DOM style of
//     the renderer. It dispatches an intent and repaints from the store notification.
//   • C59 §2.2 (P3) — no `requestAnimationFrame` anywhere in this file. The panel is
//     plain DOM; the only motion is Cesium's own camera tween, owned by the viewer.
//   • C06 §7 / §233 — this is PANE CHROME: a child of ITS OWN pane element, stacked
//     above that pane's surface only, never over a sibling pane, and with NO hand-picked
//     `z-index` (it relies on DOM order within its pane, exactly as `PaneViewPicker`
//     does).
//   • P4 — no globals touched.
//   • DISABLE-OR-EXPLAIN — an unavailable action renders greyed WITH its reason printed,
//     never a bare greyed row. A rejected dispatch prints its reason in the panel rather
//     than vanishing, because the rejection IS the honest coverage answer.

import type { SiteEntryStore } from './siteEntryStore';
import type { SiteEntryCoverageVerdict, SiteEntryPanelAction } from './siteEntryModel';

export interface SiteEntryPanelHandle {
    readonly element: HTMLElement;
    refresh(): void;
    dispose(): void;
}

export interface SiteEntryPanelOptions {
    /** The pane element this panel belongs to (C06 §7 — chrome scoped to its pane). */
    readonly paneEl: HTMLElement;
    readonly store: SiteEntryStore;
}

const BRAND = '#6600FF';
const BORDER = '#ece7fb';
const MUTED = '#5b5570';

/** Brand-consistent verdict marks. Copy still carries the meaning — colour never alone. */
const VERDICT_MARK: Readonly<Record<SiteEntryCoverageVerdict, string>> = {
    covered: '● Covered',
    'not-covered': '○ Not covered yet',
    unknown: '· Choose a place',
};

/**
 * Mount the staged entry panel into a pane element. Returns a handle; `dispose()` removes
 * the DOM and unsubscribes.
 */
export function mountSiteEntryPanel(opts: SiteEntryPanelOptions): SiteEntryPanelHandle {
    const { paneEl, store } = opts;

    const root = document.createElement('div');
    root.className = 'pryzm-site-entry-panel';
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', 'Site entry');
    // Pane-scoped chrome: positioned within the pane, no z-index literal (C06 §233).
    root.style.cssText = [
        'position:absolute',
        'top:12px',
        'left:12px',
        'width:min(340px, calc(100% - 24px))',
        'box-sizing:border-box',
        'padding:14px 16px',
        'background:#ffffff',
        `border:1px solid ${BORDER}`,
        'border-radius:12px',
        'box-shadow:0 6px 24px rgba(28,16,64,.12)',
        'font:13px/1.45 system-ui,-apple-system,Segoe UI,sans-serif',
        'color:#231c38',
    ].join(';');

    // A rejection is not an error state — it is the coverage answer. It is rendered in
    // the panel and cleared on the next successful dispatch.
    let rejection: string | null = null;

    function renderAction(a: SiteEntryPanelAction): HTMLElement {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'margin-top:6px';

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = a.label;
        const disabled = a.unavailableReason != null;
        btn.disabled = disabled;
        btn.style.cssText = [
            'width:100%',
            'text-align:left',
            'padding:8px 10px',
            `border:1px solid ${BORDER}`,
            'border-radius:8px',
            'background:#fff',
            `color:${disabled ? MUTED : BRAND}`,
            `cursor:${disabled ? 'default' : 'pointer'}`,
            `opacity:${disabled ? '.55' : '1'}`,
            'font:inherit',
        ].join(';');
        if (!disabled) {
            btn.addEventListener('click', () => {
                // P6: dispatch an intent. Nothing else. No camera, no viewer, no styles.
                const res = store.dispatch(a.intent);
                rejection = res.ok ? null : (res.rejected ?? null);
                refresh();
            });
        }
        wrap.appendChild(btn);

        if (a.unavailableReason) {
            // Disable-or-EXPLAIN: the reason is printed, not hidden in a `title=`.
            const why = document.createElement('div');
            why.textContent = a.unavailableReason;
            why.style.cssText = `margin:4px 2px 0;color:${MUTED};font-size:12px`;
            wrap.appendChild(why);
        }
        return wrap;
    }

    function refresh(): void {
        const panel = store.getPanel();
        root.replaceChildren();

        const verdict = document.createElement('div');
        verdict.textContent = VERDICT_MARK[panel.verdict];
        verdict.style.cssText = [
            'font-size:11px',
            'letter-spacing:.08em',
            'text-transform:uppercase',
            `color:${panel.verdict === 'covered' ? BRAND : MUTED}`,
            'margin-bottom:6px',
        ].join(';');
        root.appendChild(verdict);

        const title = document.createElement('div');
        title.textContent = panel.title;
        title.style.cssText = 'font-size:16px;font-weight:600;margin-bottom:8px';
        root.appendChild(title);

        for (const line of panel.lines) {
            const p = document.createElement('p');
            p.textContent = line;
            p.style.cssText = `margin:0 0 6px;color:${MUTED}`;
            root.appendChild(p);
        }

        if (rejection) {
            const r = document.createElement('p');
            r.textContent = rejection;
            r.setAttribute('role', 'status');
            r.style.cssText = [
                'margin:8px 0 0',
                'padding:8px 10px',
                `border:1px solid ${BORDER}`,
                'border-radius:8px',
                'background:#faf7ff',
                `color:${MUTED}`,
            ].join(';');
            root.appendChild(r);
        }

        for (const a of panel.actions) root.appendChild(renderAction(a));
    }

    const unsubscribe = store.subscribe(() => refresh());
    refresh();
    paneEl.appendChild(root);

    return {
        element: root,
        refresh,
        dispose(): void {
            unsubscribe();
            root.remove();
        },
    };
}
