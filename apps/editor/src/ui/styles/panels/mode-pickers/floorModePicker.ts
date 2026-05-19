/* CONTRACT §05 §2 — CSS layer only, zero logic. All colours via var(--app-*) tokens. */
export const FLOOR_MODE_PICKER_STYLES = `

    /* ── Floor Mode Picker — fmp-* ───────────────────────────────── */
    .fmp-panel {
        position: fixed;
        top: 64px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 9000;
        display: flex;
        flex-direction: column;
        gap: 0;
        padding: 0;
        min-width: 300px;
        background: var(--app-bg);
        border-radius: var(--app-radius-lg);
        box-shadow: var(--app-shadow-panel);
        pointer-events: all;
        overflow: hidden;
        animation: fmp-appear 0.15s ease-out both;
    }
    @keyframes fmp-appear {
        from { opacity: 0; transform: translateX(-50%) translateY(-8px); }
        to   { opacity: 1; transform: translateX(-50%) translateY(0); }
    }

    /* ── Gradient header ─────────────────────────────────────────── */
    .fmp-header {
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 7px 11px 6px;
        background: var(--app-gradient);
    }
    .fmp-header-title {
        font-family: var(--app-font);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.09em;
        text-transform: uppercase;
        color: #fff;
        user-select: none;
    }
    .fmp-header-sep {
        width: 1px;
        height: 10px;
        background: rgba(255,255,255,0.35);
        flex-shrink: 0;
    }
    .fmp-header-sub {
        font-family: var(--app-font);
        font-size: 9.5px;
        font-weight: 400;
        color: rgba(255,255,255,0.72);
        user-select: none;
    }

    /* ── Floor System Type row ────────────────────────────────────── */
    .fmp-type-row {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        background: var(--app-bg);
        border-bottom: 1px solid rgba(0,0,0,0.06);
    }
    .fmp-type-label {
        font-family: var(--app-font);
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.07em;
        text-transform: uppercase;
        color: var(--app-text-2);
        white-space: nowrap;
        flex-shrink: 0;
    }
    .fmp-type-select {
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
    .fmp-type-select:focus { border-color: var(--app-accent); }

    /* ── Divider ─────────────────────────────────────────────────── */
    .fmp-divider { height: 0; }

    /* ── Mode buttons row ────────────────────────────────────────── */
    .fmp-mode-row {
        display: flex;
        flex-direction: column;
        gap: 1px;
        padding: 6px;
        background: var(--app-bg);
    }

    /* ── Individual mode button — horizontal layout ──────────────── */
    .fmp-btn {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 10px;
        padding: 6px 10px;
        background: var(--app-panel-bg);
        border: 1.5px solid transparent;
        border-radius: 7px;
        cursor: pointer;
        color: var(--app-text);
        transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
        text-align: left;
    }
    .fmp-btn:hover {
        background: var(--app-violet-soft);
        border-color: var(--app-accent);
        color: var(--app-accent);
    }
    .fmp-btn:active { background: rgba(102,0,255,0.12); }

    /* ── SVG icon ────────────────────────────────────────────────── */
    .fmp-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 28px;
        flex-shrink: 0;
        opacity: 0.75;
    }
    .fmp-btn:hover .fmp-icon { opacity: 1; }
    .fmp-icon svg { width: 100%; height: 100%; }

    /* ── Text group ──────────────────────────────────────────────── */
    .fmp-btn-text {
        display: flex;
        align-items: center;
        gap: 6px;
        flex: 1;
    }

    /* ── Keyboard shortcut badge ─────────────────────────────────── */
    .fmp-key {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 16px;
        height: 16px;
        font-family: var(--app-font);
        font-size: 10px;
        font-weight: 700;
        line-height: 1;
        color: var(--app-text-2);
        background: rgba(0,0,0,0.07);
        border-radius: 4px;
        flex-shrink: 0;
        user-select: none;
    }
    .fmp-btn:hover .fmp-key { background: var(--app-accent); color: #fff; }

    /* ── Mode name label ─────────────────────────────────────────── */
    .fmp-label {
        font-family: var(--app-font);
        font-size: 12px;
        font-weight: 600;
        color: inherit;
        user-select: none;
    }

    /* ── Mode sub-description ────────────────────────────────────── */
    .fmp-sub {
        font-family: var(--app-font);
        font-size: 10px;
        font-weight: 400;
        color: var(--app-text-muted);
        user-select: none;
        margin-left: auto;
        white-space: nowrap;
    }
    .fmp-btn:hover .fmp-sub { color: rgba(102,0,255,0.6); }

    /* ── ESC hint footer ─────────────────────────────────────────── */
    .fmp-hint {
        font-family: var(--app-font);
        font-size: 10px;
        color: var(--app-text-muted);
        text-align: center;
        padding: 5px 0 7px;
        border-top: 1px solid rgba(0,0,0,0.06);
        user-select: none;
    }
`;
