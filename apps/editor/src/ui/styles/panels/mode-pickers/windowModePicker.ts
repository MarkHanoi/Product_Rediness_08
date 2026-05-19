/* CONTRACT §05 §2 — CSS layer only, zero logic. All colours via var(--app-*) tokens. */
export const WINDOW_MODE_PICKER_STYLES = `

    /* ── Outer panel ─────────────────────────────────────────────── */
    .wnmp-panel {
        position: fixed;
        top: 54px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 9999;
        background: var(--app-bg);
        border-radius: var(--app-radius-lg);
        box-shadow: var(--app-shadow-panel);
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0;
        min-width: 300px;
        pointer-events: all;
        overflow: hidden;
        animation: wnmp-appear 0.14s ease-out both;
    }
    @keyframes wnmp-appear {
        from { opacity: 0; transform: translateX(-50%) translateY(-8px); }
        to   { opacity: 1; transform: translateX(-50%) translateY(0); }
    }

    /* ── Gradient header ─────────────────────────────────────────── */
    .wnmp-header {
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 7px 11px 6px;
        background: var(--app-gradient);
    }
    .wnmp-header-title {
        font-family: var(--app-font);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.09em;
        text-transform: uppercase;
        color: #fff;
        user-select: none;
    }
    .wnmp-header-sep {
        width: 1px;
        height: 10px;
        background: rgba(255,255,255,0.35);
        flex-shrink: 0;
    }
    .wnmp-header-sub {
        font-family: var(--app-font);
        font-size: 9.5px;
        font-weight: 400;
        color: rgba(255,255,255,0.72);
        user-select: none;
    }

    /* ── Window System Type row ───────────────────────────────────── */
    .wnmp-type-row {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        background: var(--app-bg);
        border-bottom: 1px solid rgba(0,0,0,0.06);
    }
    .wnmp-type-label {
        font-family: var(--app-font);
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.07em;
        text-transform: uppercase;
        color: var(--app-text-2);
        white-space: nowrap;
        flex-shrink: 0;
    }
    .wnmp-type-select {
        flex: 1;
        font-family: var(--app-font);
        font-size: 12px;
        font-weight: 500;
        color: var(--app-text);
        background: var(--app-panel-bg);
        border: 1.5px solid var(--app-border);
        border-radius: 6px;
        padding: 4px 8px;
        cursor: pointer;
        outline: none;
        transition: border-color 0.14s ease;
    }
    .wnmp-type-select:focus { border-color: var(--app-accent); }

    /* ── Mode button row ─────────────────────────────────────────── */
    .wnmp-mode-row {
        display: flex;
        flex-direction: row;
        gap: 6px;
        padding: 8px 10px 6px;
    }

    /* ── Individual mode button ──────────────────────────────────── */
    .wnmp-btn {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        background: var(--app-panel-bg);
        border: 1px solid var(--app-border);
        border-radius: 10px;
        padding: 10px 8px 8px;
        cursor: pointer;
        text-align: center;
        transition: background 0.12s, border-color 0.12s;
    }
    .wnmp-btn:hover {
        background: var(--app-violet-soft);
        border-color: var(--app-accent);
    }
    .wnmp-btn:active {
        background: rgba(102,0,255,0.13);
    }

    /* ── SVG icon ────────────────────────────────────────────────── */
    .wnmp-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--app-text-2);
        opacity: 0.75;
        transition: opacity 0.12s, color 0.12s;
    }
    .wnmp-btn:hover .wnmp-icon {
        opacity: 1;
        color: var(--app-accent);
    }
    .wnmp-icon svg {
        width: 52px;
        height: 40px;
    }

    /* ── Text block ──────────────────────────────────────────────── */
    .wnmp-btn-text {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
    }
    .wnmp-label {
        font-family: var(--app-font);
        font-size: 11px;
        font-weight: 600;
        color: var(--app-text);
        user-select: none;
        white-space: nowrap;
    }
    .wnmp-sub {
        font-family: var(--app-font);
        font-size: 9.5px;
        font-weight: 400;
        color: var(--app-text-muted);
        user-select: none;
        white-space: nowrap;
    }

    /* ── ESC hint ────────────────────────────────────────────────── */
    .wnmp-hint {
        font-family: var(--app-font);
        font-size: 9.5px;
        color: var(--app-text-muted);
        text-align: center;
        padding: 5px 0 7px;
        border-top: 1px solid rgba(0,0,0,0.06);
        user-select: none;
    }
`;
