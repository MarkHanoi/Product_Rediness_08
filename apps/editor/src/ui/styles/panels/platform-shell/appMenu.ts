/**
 * @file src/engine/subsystems/styles/panels/platform-shell/appMenu.ts
 *
 * App / Project menu dropdown — apm- prefix.
 * CONTRACT §05 §2 — CSS layer only, zero logic.
 */
export const APP_MENU_STYLES = `
    .apm-dropdown {
        position: absolute;
        top: 40px;
        left: 10px;
        background: var(--app-panel-bg);
        border: 1px solid var(--app-border);
        box-shadow: var(--app-shadow-panel);
        z-index: 2000;
        width: 250px;
        pointer-events: auto;
        border-radius: var(--app-radius-sm);
    }
    .apm-header {
        padding: 15px;
        border-bottom: 1px solid var(--app-border-light);
        font-weight: bold;
        color: var(--app-text);
        font-family: var(--app-font);
        font-size: 0.85rem;
    }
    .apm-body  { display: flex; flex-direction: column; }
    .apm-divider { height: 1px; background: var(--app-border-light); margin: 5px 0; }
    /* Phase 5.1 — native button replacement for bim-button in ApplicationMenu */
    .apm-btn {
        display: flex; align-items: center; gap: 8px;
        padding: 8px 15px; border: none; border-radius: 0;
        background: transparent; color: var(--app-text); text-align: left;
        font-size: 0.8rem; font-family: var(--app-font); cursor: pointer;
        width: 100%; transition: background 0.12s;
    }
    .apm-btn:hover { background: var(--app-violet-soft); color: var(--app-accent); }
`;
