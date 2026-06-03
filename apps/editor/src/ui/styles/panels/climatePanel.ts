/**
 * @file src/ui/styles/panels/climatePanel.ts
 *
 * Climate panel (A.11) — `clm-` prefix.
 * CONTRACT §05 §2 — CSS layer only, zero logic. Mirrors the REAL_SUN
 * floating-card idiom; #6600FF accent header per the preview-colour
 * single-source-of-truth memory.
 */
export const CLIMATE_PANEL_STYLES = `
    /* ── Floating panel ─────────────────────────────────────────────────── */
    .clm-panel {
        position: fixed;
        top: 60px;
        right: 320px;
        width: 320px;
        max-height: calc(100vh - 100px);
        display: flex;
        flex-direction: column;
        background: var(--app-bg);
        border: 1px solid var(--app-border);
        border-radius: var(--app-radius-lg);
        box-shadow: var(--app-shadow-panel);
        z-index: 2600;
        font-family: var(--app-font, 'Inter', sans-serif);
        font-size: 0.78rem;
        color: var(--app-text);
        overflow: hidden;
        pointer-events: all;
    }

    /* ── Header ─────────────────────────────────────────────────────────── */
    .clm-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px 7px;
        background: linear-gradient(135deg, #8B5CF6 0%, #6600FF 100%);
        color: #fff;
        flex-shrink: 0;
    }
    .clm-title {
        font-weight: 600;
        font-size: 0.82rem;
        letter-spacing: 0.03em;
        display: flex;
        align-items: center;
        gap: 6px;
    }
    .clm-close {
        background: none;
        border: none;
        color: rgba(255,255,255,0.75);
        cursor: pointer;
        font-size: 0.9rem;
        padding: 0 2px;
        line-height: 1;
        transition: color 0.15s;
    }
    .clm-close:hover { color: #fff; }

    /* ── Body (scrolls) ─────────────────────────────────────────────────── */
    .clm-body {
        padding: 10px 12px 14px;
        display: flex;
        flex-direction: column;
        gap: 14px;
        overflow-y: auto;
    }

    /* ── Site summary row ───────────────────────────────────────────────── */
    .clm-site {
        font-size: 0.72rem;
        color: var(--app-text-muted);
        line-height: 1.45;
        padding: 6px 8px;
        background: var(--app-violet-soft);
        border-radius: 6px;
    }
    .clm-site strong { color: var(--app-text); }
    .clm-source-tag {
        display: inline-block;
        margin-left: 6px;
        padding: 1px 6px;
        border-radius: 8px;
        background: #6600FF;
        color: #fff;
        font-size: 0.62rem;
        letter-spacing: 0.04em;
        text-transform: uppercase;
    }
    .clm-source-tag--fallback { background: var(--app-text-muted); }

    /* ── Sub-view block ─────────────────────────────────────────────────── */
    .clm-block { display: flex; flex-direction: column; gap: 6px; }
    .clm-block-title {
        font-weight: 600;
        font-size: 0.74rem;
        color: var(--app-accent, #6600FF);
        letter-spacing: 0.02em;
    }
    .clm-svg-wrap {
        display: flex;
        justify-content: center;
        align-items: center;
        background: var(--app-panel-bg);
        border: 1px solid var(--app-border);
        border-radius: 8px;
        padding: 6px;
    }
    .clm-svg { display: block; max-width: 100%; }
    .clm-note {
        font-size: 0.68rem;
        color: var(--app-text-muted);
        line-height: 1.4;
    }
    .clm-note--warn { color: #b45309; }

    /* ── Legend ─────────────────────────────────────────────────────────── */
    .clm-legend {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        font-size: 0.66rem;
        color: var(--app-text-2);
    }
    .clm-legend-item { display: flex; align-items: center; gap: 4px; }
    .clm-legend-swatch {
        width: 12px;
        height: 3px;
        border-radius: 2px;
        flex-shrink: 0;
    }

    /* ── Empty-state ────────────────────────────────────────────────────── */
    .clm-empty {
        padding: 18px 14px;
        text-align: center;
        color: var(--app-text-muted);
        font-size: 0.74rem;
        line-height: 1.55;
    }
    .clm-empty-icon { font-size: 1.6rem; display: block; margin-bottom: 8px; }
`;
