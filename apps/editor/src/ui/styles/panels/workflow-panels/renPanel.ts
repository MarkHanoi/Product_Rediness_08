/**
 * @file src/engine/subsystems/styles/panels/workflow-panels/renPanel.ts
 *
 * Photorealistic render sub-panel — ren-* prefix.
 * CONTRACT §05 §2 — CSS layer only, zero logic.
 */
export const REN_PANEL_STYLES = `
    .ren-panel {
        display: none;
        flex-direction: column;
        position: fixed;
        top: 60px;
        right: 12px;
        width: 280px;
        background: var(--app-bg);
        color: var(--app-text);
        border-radius: var(--app-radius-lg);
        box-shadow: var(--app-shadow-panel);
        z-index: 3000;
        font-family: var(--app-font);
        font-size: 12px;
        overflow: hidden;
    }

    .ren-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 12px;
        background: var(--app-gradient);
        flex-shrink: 0;
        box-shadow: var(--app-shadow-header);
    }

    .ren-header-title {
        display: flex;
        align-items: center;
        gap: 6px;
        font-weight: 700;
        font-size: 12px;
        color: #ffffff;
        text-transform: uppercase;
        letter-spacing: 0.04em;
    }

    .ren-close-btn {
        background: none;
        border: none;
        color: rgba(255,255,255,0.75);
        cursor: pointer;
        font-size: 16px;
        line-height: 1;
        padding: 0;
        transition: color 0.12s;
    }
    .ren-close-btn:hover { color: #ffffff; }

    /* ── Render Panel Toast ──────────────────────────────────────────────── */

    .ren-toast {
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%);
        color: white;
        padding: 10px 20px;
        border-radius: 8px;
        font-size: 13px;
        font-family: var(--app-font);
        z-index: 9999;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        white-space: nowrap;
        max-width: 420px;
        text-overflow: ellipsis;
        overflow: hidden;
    }
    .ren-toast--success { background: #16a34a; }
    .ren-toast--warn    { background: var(--app-status-warning); }
    .ren-toast--error   { background: var(--app-status-error); }
`;
