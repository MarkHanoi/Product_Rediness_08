/**
 * @file src/ui/styles/panels/siteInspectorPanel.ts
 *
 * Site Inspector panel (A.8.f) — `sip-` prefix.
 * CONTRACT §05 §2 — CSS layer only, zero logic. Mirrors the ClimatePanel
 * (`clm-`) floating-card idiom; #6600FF accent header per the preview-colour
 * single-source-of-truth memory (white+purple, NOT dark).
 */
export const SITE_INSPECTOR_PANEL_STYLES = `
    /* ── Floating panel ─────────────────────────────────────────────────── */
    .sip-panel {
        position: fixed;
        top: 60px;
        right: 320px;
        width: 300px;
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
    .sip-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px 7px;
        background: linear-gradient(135deg, #8B5CF6 0%, #6600FF 100%);
        color: #fff;
        flex-shrink: 0;
    }
    .sip-title {
        font-weight: 600;
        font-size: 0.82rem;
        letter-spacing: 0.03em;
        display: flex;
        align-items: center;
        gap: 6px;
    }
    .sip-close {
        background: none;
        border: none;
        color: rgba(255,255,255,0.75);
        cursor: pointer;
        font-size: 0.9rem;
        padding: 0 2px;
        line-height: 1;
        transition: color 0.15s;
    }
    .sip-close:hover { color: #fff; }

    /* ── Body (scrolls) ─────────────────────────────────────────────────── */
    .sip-body {
        padding: 10px 12px 14px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        overflow-y: auto;
    }

    /* ── Fact rows ──────────────────────────────────────────────────────── */
    .sip-section {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 8px 10px;
        background: var(--app-violet-soft);
        border-radius: 8px;
    }
    .sip-row {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 10px;
        font-size: 0.74rem;
        line-height: 1.4;
    }
    .sip-label {
        color: var(--app-text-muted);
        flex-shrink: 0;
    }
    .sip-value {
        color: var(--app-text);
        font-weight: 600;
        text-align: right;
        word-break: break-word;
    }
    .sip-value--mono {
        font-variant-numeric: tabular-nums;
    }

    /* ── Boundary thumbnail ─────────────────────────────────────────────── */
    .sip-thumb-wrap {
        display: flex;
        justify-content: center;
        align-items: center;
        background: var(--app-panel-bg);
        border: 1px solid var(--app-border);
        border-radius: 8px;
        padding: 8px;
    }
    .sip-thumb { display: block; }
    .sip-thumb-poly {
        fill: rgba(102, 0, 255, 0.14);
        stroke: #6600FF;
        stroke-width: 0.02;
        stroke-linejoin: round;
    }

    /* ── Actions ────────────────────────────────────────────────────────── */
    .sip-actions {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }
    .sip-action-btn {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        padding: 7px 10px;
        background: var(--app-panel-bg);
        border: 1px solid var(--app-border);
        border-radius: 7px;
        color: var(--app-text);
        font-size: 0.74rem;
        font-weight: 600;
        cursor: pointer;
        transition: border-color 0.15s, background 0.15s;
    }
    .sip-action-btn:hover {
        border-color: #6600FF;
        background: var(--app-violet-soft);
    }
    .sip-action-icon { font-size: 0.9rem; }

    /* ── Empty-state ────────────────────────────────────────────────────── */
    .sip-empty {
        padding: 18px 14px;
        text-align: center;
        color: var(--app-text-muted);
        font-size: 0.74rem;
        line-height: 1.55;
    }
    .sip-empty-icon { font-size: 1.6rem; display: block; margin-bottom: 8px; }
    .sip-empty-title { font-weight: 600; margin-bottom: 4px; color: var(--app-text); }
`;
