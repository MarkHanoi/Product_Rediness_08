/**
 * @file src/engine/subsystems/styles/panels/workflow-panels/vexPanel.ts
 *
 * Video export panel — ve-* prefix.
 * CONTRACT §05 §2 — CSS layer only, zero logic.
 */
export const VEX_PANEL_STYLES = `
    .ve-panel {
        display: none;
        flex-direction: column;
        position: fixed;
        top: 60px;
        right: 12px;
        width: 300px;
        max-height: 640px;
        background: var(--app-bg);
        color: var(--app-text);
        border-radius: var(--app-radius-lg);
        box-shadow: var(--app-shadow-panel);
        z-index: 3200;
        font-family: var(--app-font);
        font-size: 12px;
        overflow: hidden;
    }

    .ve-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 12px;
        background: var(--app-gradient);
        flex-shrink: 0;
        box-shadow: var(--app-shadow-header);
    }

    .ve-header-title {
        display: flex;
        align-items: center;
        gap: 6px;
        font-weight: 700;
        font-size: 12px;
        color: #ffffff;
        text-transform: uppercase;
        letter-spacing: 0.04em;
    }

    .ve-close-btn {
        background: none;
        border: none;
        color: rgba(255,255,255,0.75);
        cursor: pointer;
        font-size: 16px;
        line-height: 1;
        padding: 0;
        transition: color 0.12s;
    }
    .ve-close-btn:hover { color: #ffffff; }

    /* ── Video Export Toast ──────────────────────────────────────────────── */

    .vex-toast {
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%);
        color: white;
        padding: 10px 20px;
        border-radius: 8px;
        font-size: 13px;
        z-index: 9999;
        font-family: var(--app-font);
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        white-space: nowrap;
    }
    .vex-toast--success { background: #16a34a; }
    .vex-toast--warn    { background: var(--app-status-warning); }
    .vex-toast--error   { background: var(--app-status-error); }
`;
