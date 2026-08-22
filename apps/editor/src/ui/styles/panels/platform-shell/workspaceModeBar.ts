/**
 * @file src/engine/subsystems/styles/panels/platform-shell/workspaceModeBar.ts
 *
 * Workspace Mode Bar pill — wmb- prefix.
 * CONTRACT §05 §2 — CSS layer only, zero logic.
 */
export const WMB_STYLES = `
    /* ── Top-bar wrapper — owns the fixed centering for HUD + mode bar ── */
    /* §SHELL-FLOAT-BUDGET (L-4010) - centred on the CANVAS region, not the
       viewport. Replaces two hand-written per-mode overrides that said the same
       thing twice: one in inspectModeShell.ts keyed on 'pryzm-mode-inspect' and
       its L-3601 copy in analysisSurface.ts keyed on 'pryzm-mode-analysis',
       both re-anchoring this wrapper to 25%. A third half-canvas mode would
       have needed a third.
       ⚠ DO NOT write a selector-plus-brace in this comment: the arms in
       analysisHeaderReserve.spec.ts locate a rule by indexOf(selector), so the
       first draft of this note WAS the match and the test read the comment
       instead of the rule. It failed, correctly, and this is why. */
    .wmb-toplevel-wrapper {
        position: fixed;
        top: 6px;
        left: var(--shell-canvas-cx, 50%);
        max-width: calc(var(--shell-canvas-w, 100vw) - 32px);
        transform: translateX(-50%);
        z-index: 200;
        display: flex;
        align-items: stretch;
        gap: 7px;
        pointer-events: none;
    }
    .wmb-toplevel-wrapper > * { pointer-events: auto; }

    /* ── Floating bar (no longer owns fixed pos — wrapper does) ────────── */
    .wmb-bar {
        position: relative;
        z-index: 200;
        display: flex;
        align-items: center;
        gap: 2px;
        padding: 3px;
        background: var(--app-panel-bg, #ffffff);
        border-radius: 24px;
        box-shadow: var(--app-shadow-card);
        pointer-events: auto;
        user-select: none;
    }

    /* ── Mode button ──────────────────────────────────────────────────── */
    .wmb-btn {
        display: flex;
        align-items: center;
        gap: 5px;
        padding: 5px 13px;
        border: none;
        border-radius: 20px;
        background: transparent;
        color: var(--app-text-2, #5a6a85);
        font-family: var(--app-font);
        font-size: 10.8px;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.15s, color 0.15s;
        white-space: nowrap;
    }
    .wmb-btn:hover {
        background: var(--app-violet-soft, rgba(102,0,255,0.08));
        color: var(--app-accent, #6600FF);
    }
    .wmb-btn--active {
        background: var(--app-gradient, linear-gradient(135deg,#8B5CF6 0%,#6600FF 100%));
        color: #ffffff;
    }
    .wmb-btn--active:hover {
        background: var(--app-gradient, linear-gradient(135deg,#8B5CF6 0%,#6600FF 100%));
        color: #ffffff;
    }
    .wmb-btn-label {
        font-size: 10.8px;
        font-weight: 600;
        letter-spacing: 0.01em;
    }
    .wmb-btn svg { flex-shrink: 0; }

    /* MOB-001-SC: Workspace mode bar mobile */
    @media (max-width: 768px) {
        .wmb-bar { border-radius: 20px; }
        .wmb-btn {
            min-height: 36px;
            padding: 4px 10px;
            font-size: 9.9px;
        }
        .wmb-btn-label { font-size: 9.9px; }
        .wmb-toplevel-wrapper { top: 6px; gap: 5px; }
    }
    @media (max-width: 480px) {
        .wmb-btn { padding: 4px 8px; }
        .wmb-btn-label { font-size: 9px; letter-spacing: 0; }
    }
`;
