/* CONTRACT §05 §2 — CSS layer only, zero logic. All colours via var(--app-*) tokens. */
export const COLUMN_MODE_PICKER_STYLES = `

    /* ── Outer panel ─────────────────────────────────────────────── */
    .cmp-panel {
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
        max-width: 360px;
        pointer-events: all;
        overflow: hidden;
        animation: cmp-appear 0.14s ease-out both;
    }
    @keyframes cmp-appear {
        from { opacity: 0; transform: translateX(-50%) translateY(-6px); }
        to   { opacity: 1; transform: translateX(-50%) translateY(0); }
    }

    /* ── Gradient header ─────────────────────────────────────────── */
    .cmp-header {
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 7px 11px 6px;
        background: var(--app-gradient);
    }
    .cmp-header-title {
        font-family: var(--app-font);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.09em;
        text-transform: uppercase;
        color: #fff;
        user-select: none;
    }
    .cmp-header-sep {
        width: 1px;
        height: 10px;
        background: rgba(255,255,255,0.35);
        flex-shrink: 0;
    }
    .cmp-header-sub {
        font-family: var(--app-font);
        font-size: 9.5px;
        font-weight: 400;
        color: rgba(255,255,255,0.72);
        user-select: none;
    }

    /* ── Mode buttons column ─────────────────────────────────────── */
    .cmp-mode-row {
        display: flex;
        flex-direction: column;
        gap: 0;
        padding: 4px;
        background: var(--app-bg);
    }

    /* ── Group label separator ───────────────────────────────────── */
    .cmp-group-label {
        font-family: var(--app-font);
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--app-text-muted);
        padding: 5px 8px 2px;
        user-select: none;
    }

    /* ── Individual type button ──────────────────────────────────── */
    .cmp-btn {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 7px;
        padding: 5px 7px;
        background: transparent;
        border: 1px solid transparent;
        border-radius: 6px;
        cursor: pointer;
        color: var(--app-text);
        transition: background 0.1s ease, border-color 0.1s ease, color 0.1s ease;
        text-align: left;
        width: 100%;
    }
    .cmp-btn:hover {
        background: var(--app-panel-bg);
        border-color: var(--app-accent);
        color: var(--app-accent);
    }
    .cmp-btn:active { background: var(--app-violet-soft); }

    /* ── SVG icon ────────────────────────────────────────────────── */
    .cmp-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 26px;
        flex-shrink: 0;
        opacity: 0.65;
        background: var(--app-panel-bg);
        border-radius: 4px;
        border: 1px solid var(--app-border);
    }
    .cmp-btn:hover .cmp-icon {
        opacity: 1;
        border-color: var(--app-accent);
    }
    .cmp-icon svg { width: 100%; height: 100%; }

    /* ── Text group ──────────────────────────────────────────────── */
    .cmp-btn-text {
        display: flex;
        align-items: center;
        gap: 5px;
        flex: 1;
        min-width: 0;
    }

    /* ── Keyboard shortcut badge ─────────────────────────────────── */
    .cmp-key {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 14px;
        height: 14px;
        font-family: var(--app-font);
        font-size: 9px;
        font-weight: 700;
        line-height: 1;
        color: var(--app-text-2);
        background: rgba(0,0,0,0.07);
        border-radius: 3px;
        flex-shrink: 0;
        user-select: none;
    }
    .cmp-btn:hover .cmp-key { background: var(--app-accent); color: #fff; }

    /* ── Type name label ─────────────────────────────────────────── */
    .cmp-label {
        font-family: var(--app-font);
        font-size: 11px;
        font-weight: 600;
        color: inherit;
        user-select: none;
        white-space: nowrap;
    }

    /* ── Spec description ────────────────────────────────────────── */
    .cmp-sub {
        font-family: var(--app-font);
        font-size: 9px;
        font-weight: 400;
        color: var(--app-text-muted);
        user-select: none;
        margin-left: auto;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .cmp-btn:hover .cmp-sub { color: rgba(102,0,255,0.6); }

    /* ── ESC hint footer ─────────────────────────────────────────── */
    .cmp-hint {
        font-family: var(--app-font);
        font-size: 9.5px;
        color: var(--app-text-muted);
        text-align: center;
        padding: 4px 0 5px;
        border-top: 1px solid rgba(0,0,0,0.06);
        user-select: none;
        background: var(--app-bg);
    }
`;
