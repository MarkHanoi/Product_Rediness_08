/**
 * @file src/engine/subsystems/styles/panels/rendering-panels/renderQueuePanel.ts
 *
 * Render Queue Panel — rqp- prefix.
 * CONTRACT §05 §2 — CSS layer only, zero logic.
 */
export const RQP_PANEL_STYLES = `
    .rqp-wrapper {
        position: absolute;
        top: 60px;
        right: 320px;
        z-index: 3100;
        font-family: var(--app-font);
    }
    .rqp-pill {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 14px;
        background: linear-gradient(135deg, #8B5CF6 0%, #6600FF 100%);
        color: #fff;
        border: none;
        border-radius: 20px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.02em;
        box-shadow: 0 2px 12px rgba(102,0,255,0.35);
        transition: box-shadow 0.2s;
        white-space: nowrap;
    }
    .rqp-pill:hover {
        box-shadow: 0 4px 18px rgba(102,0,255,0.5);
    }
    .rqp-pill-icon { font-size: 13px; }
    .rqp-body {
        display: none;
        flex-direction: column;
        gap: 0;
        margin-top: 8px;
        width: 260px;
        background: var(--app-bg);
        border-radius: var(--app-radius-lg);
        box-shadow: var(--app-shadow-panel);
        overflow: hidden;
        border: 1px solid var(--app-border);
    }
    .rqp-header {
        padding: 12px 14px 10px;
        background: linear-gradient(135deg, #8B5CF6 0%, #6600FF 100%);
    }
    .rqp-header-title {
        display: block;
        font-size: 13px;
        font-weight: 700;
        color: #fff;
    }
    .rqp-header-sub {
        display: block;
        font-size: 10px;
        color: rgba(255,255,255,0.7);
        margin-top: 2px;
    }
    .rqp-section {
        padding: 10px 14px 8px;
        border-bottom: 1px solid var(--app-border-light);
    }
    .rqp-section-label {
        font-size: 10px;
        font-weight: 600;
        color: var(--app-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        margin-bottom: 8px;
    }
    .rqp-level-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 4px;
    }
    .rqp-level-btn {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 3px;
        padding: 8px 4px;
        background: var(--app-panel-bg);
        border: 1px solid var(--app-border);
        border-radius: 8px;
        color: var(--app-text-2);
        font-size: 10px;
        cursor: pointer;
        transition: all 0.15s;
    }
    .rqp-level-btn:hover {
        background: var(--app-violet-soft);
        border-color: var(--app-violet-1);
        color: var(--app-accent);
    }
    .rqp-level-btn--active {
        background: var(--app-gradient);
        border-color: var(--app-accent);
        color: #fff;
    }
    .rqp-level-icon { font-size: 14px; }
    .rqp-level-name { font-size: 9px; font-weight: 600; }
    .rqp-select {
        width: 100%;
        padding: 6px 8px;
        background: var(--app-panel-bg);
        border: 1px solid var(--app-border);
        border-radius: 6px;
        color: var(--app-text);
        font-size: 11px;
        cursor: pointer;
        outline: none;
        font-family: var(--app-font);
    }
    .rqp-select:focus {
        border-color: var(--app-accent);
    }
    .rqp-status-bar {
        padding: 8px 14px;
        font-size: 10px;
        font-weight: 600;
        color: var(--app-text-muted);
        border-top: 1px solid var(--app-border);
    }
    .rqp-loader {
        display: none;
        align-items: center;
        gap: 6px;
        padding: 6px 14px 8px;
        font-size: 10px;
        color: #a855f7;
    }
    .rqp-loader-dot {
        width: 6px; height: 6px;
        border-radius: 50%;
        background: #a855f7;
        animation: rqp-pulse 1s infinite;
    }
    @keyframes rqp-pulse {
        0%, 100% { opacity: 1; }
        50%       { opacity: 0.3; }
    }
`;
