/**
 * @file src/engine/subsystems/styles/panels/workflow-panels/rgPanel.ts
 *
 * Render graph / layer panel — rg-* prefix.
 * CONTRACT §05 §2 — CSS layer only, zero logic.
 */
export const RG_PANEL_STYLES = `
    .rg-panel {
        display: none;
        flex-direction: column;
        position: fixed;
        top: 60px;
        right: 300px;
        width: 320px;
        max-height: 600px;
        background: var(--app-bg);
        color: var(--app-text);
        border-radius: var(--app-radius-lg);
        box-shadow: var(--app-shadow-panel);
        z-index: 3000;
        font-family: var(--app-font);
        font-size: 12px;
        overflow: hidden;
    }

    .rg-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 12px;
        background: var(--app-gradient);
        flex-shrink: 0;
        box-shadow: var(--app-shadow-header);
    }

    .rg-header-title {
        font-weight: 700;
        font-size: 12px;
        color: #ffffff;
        text-transform: uppercase;
        letter-spacing: 0.04em;
    }

    .rg-close-btn {
        background: none;
        border: none;
        color: rgba(255,255,255,0.75);
        cursor: pointer;
        font-size: 16px;
        line-height: 1;
        padding: 0;
        transition: color 0.12s;
    }
    .rg-close-btn:hover { color: #ffffff; }

    .rg-body {
        padding: 10px;
        overflow-y: auto;
        flex: 1;
        min-height: 0;
        scrollbar-width: thin;
        scrollbar-color: #c4cde0 transparent;
    }

    .rg-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 40px 20px;
        color: var(--app-text-muted);
        text-align: center;
        gap: 8px;
    }

    .rg-list {
        display: none;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
    }

    .rg-entry {
        background: var(--app-panel-bg);
        border-radius: var(--app-radius-sm);
        overflow: hidden;
        cursor: pointer;
        border: 1px solid var(--app-border);
        box-shadow: var(--app-shadow-card);
        transition: border-color .15s, box-shadow .15s;
    }
    .rg-entry:hover {
        border-color: var(--app-violet-1);
        box-shadow: var(--app-shadow-panel);
    }

    .rg-download {
        flex: 1;
        padding: 4px 0;
        background: var(--app-gradient);
        border: none;
        color: #fff;
        border-radius: 4px;
        font-size: 10px;
        cursor: pointer;
        font-family: var(--app-font);
    }

    .rg-delete {
        padding: 4px 8px;
        background: transparent;
        border: 1px solid var(--app-border);
        color: var(--app-text-2);
        border-radius: 4px;
        font-size: 10px;
        cursor: pointer;
        font-family: var(--app-font);
        transition: background .12s, color .12s;
    }
    .rg-delete:hover {
        background: #fff5f5;
        border-color: #fecaca;
        color: #c62828;
    }
`;
