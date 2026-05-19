/**
 * @file src/engine/subsystems/styles/panels/workflow-panels/panPanel.ts
 *
 * Panoramic / 360° capture panel — pn-* prefix.
 * CONTRACT §05 §2 — CSS layer only, zero logic.
 */
export const PAN_PANEL_STYLES = `
    .pn-panel {
        display: none;
        flex-direction: column;
        position: fixed;
        top: 60px;
        right: 12px;
        width: 290px;
        max-height: 620px;
        background: var(--app-bg);
        color: var(--app-text);
        border-radius: var(--app-radius-lg);
        box-shadow: var(--app-shadow-panel);
        z-index: 3100;
        font-family: var(--app-font);
        font-size: 12px;
        overflow: hidden;
    }

    .pn-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 12px;
        background: var(--app-gradient);
        border-bottom: none;
        flex-shrink: 0;
        box-shadow: var(--app-shadow-header);
    }

    .pn-header-title {
        display: flex;
        align-items: center;
        gap: 6px;
        font-weight: 700;
        font-size: 12px;
        color: #ffffff;
        text-transform: uppercase;
        letter-spacing: 0.04em;
    }

    .pn-close-btn {
        background: none;
        border: none;
        color: rgba(255,255,255,0.75);
        cursor: pointer;
        font-size: 16px;
        line-height: 1;
        padding: 0;
        transition: color 0.12s;
    }
    .pn-close-btn:hover { color: #ffffff; }

    .pn-body {
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        overflow-y: auto;
        flex: 1;
        min-height: 0;
        scrollbar-width: thin;
        scrollbar-color: #c4cde0 transparent;
    }

    .pn-label {
        display: block;
        color: var(--app-text-muted);
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: .06em;
        margin-bottom: 4px;
    }

    .pn-select {
        width: 100%;
        padding: 6px 8px;
        background: var(--app-panel-bg);
        border: 1px solid var(--app-border);
        color: var(--app-text);
        border-radius: var(--app-radius-sm);
        font-size: 11px;
        cursor: pointer;
        font-family: var(--app-font);
    }

    /* ── 360° Viewer Overlay (pn-viewer-*) ──────────────────────────────── */

    .pn-viewer-overlay {
        position: fixed;
        inset: 0;
        z-index: 9000;
        background: #000;
        display: flex;
        flex-direction: column;
    }

    .pn-viewer-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 16px;
        background: rgba(0,0,0,0.8);
        z-index: 1;
        flex-shrink: 0;
    }

    .pn-viewer-title {
        color: #fff;
        font-family: var(--app-font);
        font-size: 14px;
        font-weight: 600;
    }

    .pn-viewer-meta {
        display: flex;
        gap: 8px;
        align-items: center;
    }

    .pn-viewer-hint {
        color: #888;
        font-size: 11px;
        font-family: var(--app-font);
    }

    .pn-viewer-close {
        background: #333;
        border: 1px solid #555;
        color: #fff;
        padding: 5px 12px;
        border-radius: var(--app-radius-sm);
        cursor: pointer;
        font-family: var(--app-font);
        font-size: 12px;
    }

    .pn-viewer-canvas {
        flex: 1;
        position: relative;
        overflow: hidden;
    }

    /* ── Panorama Toast ──────────────────────────────────────────────────── */

    .pn-toast {
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
    .pn-toast--success { background: #0891b2; }
    .pn-toast--warn    { background: var(--app-status-warning); }
    .pn-toast--error   { background: var(--app-status-error); }

    .pn-capture-btn {
        width: 100%;
        padding: 10px;
        background: var(--app-gradient);
        border: none;
        color: #fff;
        border-radius: var(--app-radius-sm);
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: filter .15s;
        margin-top: 4px;
        font-family: var(--app-font);
        box-shadow: var(--app-shadow-glow);
    }
    .pn-capture-btn:hover:not(:disabled) { filter: brightness(1.1); }
    .pn-capture-btn:disabled { opacity: 0.55; cursor: not-allowed; }
`;
