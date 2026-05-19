/* CONTRACT §05 §2 — CSS layer only, zero logic. All colours via var(--app-*) tokens. */
export const ROOF_MODE_PICKER_STYLES = `
    /* ── Roof HUD / Mode Picker — rfmp-* token set ───────────────── */
    .rfmp-container {
        position: fixed;
        top: 64px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 9000;
        display: flex;
        flex-direction: column;
        gap: 0;
        padding: 0;
        min-width: 260px;
        background: var(--app-bg);
        border-radius: var(--app-radius-lg);
        box-shadow: var(--app-shadow-panel);
        pointer-events: all;
        overflow: hidden;
        animation: rfmp-appear 0.15s ease-out both;
    }
    @keyframes rfmp-appear {
        from { opacity: 0; transform: translateX(-50%) translateY(-8px); }
        to   { opacity: 1; transform: translateX(-50%) translateY(0); }
    }
    .rfmp-title {
        font-family: var(--app-font);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.09em;
        text-transform: uppercase;
        color: #fff;
        padding: 7px 11px 6px;
        background: var(--app-gradient);
        user-select: none;
    }
    .rfmp-mode-list {
        display: flex;
        flex-direction: column;
        padding: 4px 0;
    }
    .rfmp-mode-btn {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        padding: 9px 14px;
        background: transparent;
        border: none;
        cursor: pointer;
        font-family: var(--app-font);
        font-size: 12px;
        color: var(--app-text);
        text-align: left;
        transition: background 0.1s;
        outline: none;
        border-radius: 0;
    }
    .rfmp-mode-btn:hover {
        background: var(--app-violet-soft);
    }
    .rfmp-mode-btn--active {
        background: var(--app-violet-soft);
        color: var(--app-accent);
        font-weight: 600;
    }
    .rfmp-confirm-panel {
        display: flex;
        gap: 6px;
        padding: 8px 10px;
        border-top: 1px solid rgba(0,0,0,0.06);
        background: var(--app-bg);
    }
    .rfmp-input {
        font-family: var(--app-font);
        font-size: 12px;
        border: 1px solid var(--app-border);
        border-radius: 4px;
        padding: 4px 8px;
        outline: none;
        color: var(--app-text);
        background: var(--app-panel-bg);
        width: 100%;
        box-sizing: border-box;
    }
    .rfmp-input:focus {
        border-color: var(--app-accent);
        box-shadow: 0 0 0 2px rgba(102,0,255,0.12);
    }
    .rfmp-input-label {
        font-family: var(--app-font);
        font-size: 11px;
        color: var(--app-text-muted);
        padding: 6px 14px;
        user-select: none;
    }
    .rfmp-confirm-actions {
        display: flex;
        flex-direction: row;
        gap: 6px;
        padding: 8px 10px;
        border-top: 1px solid rgba(0,0,0,0.06);
        background: var(--app-bg);
    }
    .rfmp-confirm-actions > button {
        flex: 1;
        font-family: var(--app-font);
        font-size: 12px;
        font-weight: 500;
        border: 1px solid var(--app-border);
        border-radius: 5px;
        padding: 5px 10px;
        cursor: pointer;
        background: var(--app-panel-bg);
        color: var(--app-text);
        transition: background 0.12s, border-color 0.12s;
    }
    .rfmp-confirm-actions > button:hover {
        background: var(--app-violet-soft);
        border-color: var(--app-accent);
    }
    .rfmp-confirm-actions > button:first-child {
        background: var(--app-gradient);
        border-color: transparent;
        color: #fff;
        font-weight: 600;
    }
    .rfmp-confirm-actions > button:first-child:hover {
        opacity: 0.9;
    }

    /* ── Confirming-panel helpers ─────────────────────────────────── */
    .rfmp-field-label {
        padding: 6px 0 2px 0;
    }
    .rfmp-checkbox-row {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 0 2px 0;
    }
    .rfmp-checkbox {
        width: 14px;
        height: 14px;
        cursor: pointer;
        flex-shrink: 0;
    }
    .rfmp-checkbox-label {
        padding: 0;
        cursor: pointer;
    }
    .rfmp-confirm-actions--spaced {
        margin-top: 8px;
    }
    .rfmp-confirm-btn {
        flex: 1;
    }
`;
