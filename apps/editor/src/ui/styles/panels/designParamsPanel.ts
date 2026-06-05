/**
 * @file src/ui/styles/panels/designParamsPanel.ts
 *
 * Living Design Parameters panel (A.25.1) — `dpp-` prefix.
 * CONTRACT §05 §2 — CSS layer only, zero logic. Floating-card idiom mirroring
 * the climate panel; #6600FF accent header per the preview-colour single-
 * source-of-truth memory. Brand: white + #6600FF, NO black.
 */
export const DESIGN_PARAMS_PANEL_STYLES = `
    /* ── Floating panel ─────────────────────────────────────────────────── */
    .dpp-panel {
        position: fixed;
        top: 60px;
        left: 80px;
        width: 280px;
        display: flex;
        flex-direction: column;
        background: var(--app-bg, #ffffff);
        border: 1px solid var(--app-border, #e5e0f5);
        border-radius: var(--app-radius-lg, 12px);
        box-shadow: var(--app-shadow-panel, 0 8px 28px rgba(102, 0, 255, 0.16));
        z-index: 2600;
        font-family: var(--app-font, 'Inter', sans-serif);
        font-size: 0.78rem;
        color: var(--app-text, #2a2440);
        overflow: hidden;
        pointer-events: all;
    }

    /* ── Header ─────────────────────────────────────────────────────────── */
    .dpp-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px 7px;
        background: linear-gradient(135deg, #8B5CF6 0%, #6600FF 100%);
        color: #fff;
        flex-shrink: 0;
    }
    .dpp-title {
        font-weight: 600;
        font-size: 0.82rem;
        letter-spacing: 0.03em;
        display: flex;
        align-items: center;
        gap: 6px;
    }
    .dpp-close {
        background: none;
        border: none;
        color: rgba(255,255,255,0.78);
        cursor: pointer;
        font-size: 0.9rem;
        padding: 0 2px;
        line-height: 1;
        transition: color 0.15s;
    }
    .dpp-close:hover { color: #fff; }

    /* ── Body ───────────────────────────────────────────────────────────── */
    .dpp-body {
        padding: 12px 14px 10px;
        display: flex;
        flex-direction: column;
        gap: 12px;
    }
    .dpp-hint {
        font-size: 0.7rem;
        color: var(--app-text-muted, #6b6486);
        line-height: 1.35;
        margin: -2px 0 2px;
    }

    /* ── A slider row ───────────────────────────────────────────────────── */
    .dpp-row { display: flex; flex-direction: column; gap: 4px; }
    .dpp-row-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
    }
    .dpp-label { font-weight: 600; color: var(--app-text, #2a2440); }
    .dpp-value {
        font-variant-numeric: tabular-nums;
        font-size: 0.72rem;
        color: #6600FF;
        font-weight: 600;
    }
    .dpp-slider {
        -webkit-appearance: none;
        appearance: none;
        width: 100%;
        height: 4px;
        border-radius: 3px;
        background: linear-gradient(90deg, #ece6fb, #d9ccf8);
        outline: none;
        cursor: pointer;
    }
    .dpp-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 15px;
        height: 15px;
        border-radius: 50%;
        background: #6600FF;
        border: 2px solid #fff;
        box-shadow: 0 1px 3px rgba(102, 0, 255, 0.4);
        cursor: pointer;
    }
    .dpp-slider::-moz-range-thumb {
        width: 15px;
        height: 15px;
        border-radius: 50%;
        background: #6600FF;
        border: 2px solid #fff;
        box-shadow: 0 1px 3px rgba(102, 0, 255, 0.4);
        cursor: pointer;
    }

    /* ── Footer actions ─────────────────────────────────────────────────── */
    .dpp-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding-top: 4px;
    }
    .dpp-status {
        font-size: 0.68rem;
        color: var(--app-text-muted, #6b6486);
        flex: 1 1 auto;
        min-height: 1em;
    }
    .dpp-btn {
        border: 1px solid #6600FF;
        background: #6600FF;
        color: #fff;
        border-radius: 7px;
        font-size: 0.72rem;
        font-weight: 600;
        padding: 5px 11px;
        cursor: pointer;
        transition: filter 0.15s;
        white-space: nowrap;
    }
    .dpp-btn:hover { filter: brightness(1.08); }
    .dpp-btn--ghost {
        background: #fff;
        color: #6600FF;
    }
    .dpp-btn:disabled { opacity: 0.55; cursor: default; filter: none; }
`;
