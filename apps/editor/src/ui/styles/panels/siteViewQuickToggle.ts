/**
 * @file apps/editor/src/ui/styles/panels/siteViewQuickToggle.ts
 *
 * §SITE-VIEW-QUICK-TOGGLE (L-5110..L-5117 · C06 §15 · C06 §6.1) — the top-centre
 * 3D globe / 3D site bar.
 *
 * ⛔ ENROLLED IN §SHELL-FLOAT-BUDGET, and this is not optional. 'left' is
 * 'var(--shell-canvas-cx)' — the ONE published horizontal accounting — never
 * 'left: 50%'. 'shellFloatBudget.spec.ts' ARM B asserts exactly that and fails if
 * it reverts. 'top' clears the shell's always-on band via '--shell-topbar-h'
 * rather than a hand-picked number (C06 §15.6: a bar at the top of the canvas
 * MUST clear the band, and the band can grow).
 *
 * ⚠ NO BACKTICKS ANYWHERE IN THIS FILE, comments included — the whole sheet is one
 * template literal and a stray backtick terminates it mid-file.
 *
 * ⚠ NO inline 'var(--x)cc' concatenation. An invalid inline var() made a whole
 * header render transparent elsewhere today; every colour here is either a token
 * or a literal, never a token with characters glued on.
 *
 * Shares the mode strip's language on purpose (C06 §6.1): the same pill radius,
 * the same panel background token, the same border token. It is a sibling of
 * '.wdh-bar', not a third panel style.
 */

export const SITE_VIEW_QUICK_TOGGLE_STYLES = `
    /* ── The bar ────────────────────────────────────────────────────── */
    .svq-bar {
        position: fixed;
        /* Clear the always-on top row (6px offset + the published band height),
           plus one gutter. DERIVED, so a taller band moves this with it. */
        top: calc(6px + var(--shell-topbar-h, 36px) + 8px);
        left: var(--shell-canvas-cx, 50%);
        transform: translateX(-50%);
        max-width: calc(var(--shell-canvas-w, 100vw) - 32px);
        z-index: 8980;
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 5px 6px;
        background: var(--app-panel-bg);
        border: 1px solid var(--app-border);
        border-radius: 100px;
        box-shadow: var(--app-shadow-panel);
        pointer-events: all;
        user-select: none;
        font-family: var(--app-font);
    }

    /* ── Segments ───────────────────────────────────────────────────── */
    .svq-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        /* C43 / WCAG 2.2 AA SC 2.5.8 — 24px minimum target. 8px + 12px line +
           8px = 28px, so this clears the floor with the label at any length. */
        min-height: 28px;
        padding: 6px 12px;
        border: 1.5px solid transparent;
        border-radius: 100px;
        background: transparent;
        color: var(--app-text);
        font-family: var(--app-font);
        font-size: 12px;
        font-weight: 600;
        line-height: 1;
        cursor: pointer;
        white-space: nowrap;
        transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
    }

    .svq-btn:hover:not(:disabled) {
        background: var(--app-hover-bg, rgba(102, 0, 255, 0.06));
        border-color: var(--app-border);
    }

    .svq-btn:focus-visible {
        outline: 2px solid var(--app-accent, #6600FF);
        outline-offset: 1px;
    }

    /* Hosted in some pane. */
    .svq-btn--active {
        border-color: var(--app-accent, #6600FF);
        color: var(--app-accent, #6600FF);
    }

    /* Hosted AND alone on screen — the current view, not merely a visible one.
       The two states are visibly different because they are different facts. */
    .svq-btn--solo {
        background: var(--app-accent, #6600FF);
        border-color: var(--app-accent, #6600FF);
        color: #ffffff;
    }

    /* A refused segment stays READABLE. It keeps its label and carries its reason
       in the title attribute; it does not shrink, hide, or become a bare glyph.
       C06 §15.6 — an occluded or dimmed control that keeps only its affordance is
       the defect, not the fix. */
    .svq-btn:disabled {
        opacity: 0.42;
        cursor: not-allowed;
    }

    .svq-glyph {
        font-size: 13px;
        line-height: 1;
    }

    /* The label must never be truncated to an ellipsis — a clipped view name is a
       control the user cannot identify. */
    .svq-lbl {
        overflow: visible;
        text-overflow: clip;
    }

    .svq-btn--split {
        color: var(--app-text-muted, #6b6880);
        font-weight: 500;
    }
`;
