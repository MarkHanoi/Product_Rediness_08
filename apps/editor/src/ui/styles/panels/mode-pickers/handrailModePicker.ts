/* CONTRACT §05 §2 — CSS layer only, zero logic. All colours via var(--app-*) tokens. */
export const HANDRAIL_MODE_PICKER_STYLES = `

    /* ── Outer panel ─────────────────────────────────────────────── */
    .hrmp-panel {
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
        animation: hrmp-appear 0.14s ease-out both;
    }
    @keyframes hrmp-appear {
        from { opacity: 0; transform: translateX(-50%) translateY(-8px); }
        to   { opacity: 1; transform: translateX(-50%) translateY(0); }
    }

    /* ── Gradient header ─────────────────────────────────────────── */
    .hrmp-header {
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 7px 11px 6px;
        background: var(--app-gradient);
    }
    .hrmp-header-title {
        font-family: var(--app-font);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.09em;
        text-transform: uppercase;
        color: #fff;
        user-select: none;
    }
    .hrmp-header-sep {
        width: 1px;
        height: 10px;
        background: rgba(255,255,255,0.35);
        flex-shrink: 0;
    }
    .hrmp-header-sub {
        font-family: var(--app-font);
        font-size: 9.5px;
        font-weight: 400;
        color: rgba(255,255,255,0.72);
        user-select: none;
    }

    /* ── Handrail Type dropdown row ───────────────────────────────── */
    .hrmp-type-row {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        background: var(--app-bg);
        border-bottom: 1px solid rgba(0,0,0,0.06);
    }
    .hrmp-type-label {
        font-family: var(--app-font);
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.07em;
        text-transform: uppercase;
        color: var(--app-text-2);
        white-space: nowrap;
        flex-shrink: 0;
    }
    .hrmp-type-select {
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
    .hrmp-type-select:focus {
        border-color: var(--app-accent);
    }

    /* ── Mode (type) buttons column ──────────────────────────────── */
    .hrmp-mode-row {
        display: flex;
        flex-direction: column;
        gap: 1px;
        padding: 6px;
        background: var(--app-bg);
    }

    /* ── Individual type button ──────────────────────────────────── */
    .hrmp-btn {
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
        width: 100%;
    }
    .hrmp-btn:hover {
        background: var(--app-violet-soft);
        border-color: var(--app-accent);
        color: var(--app-accent);
    }
    .hrmp-btn:active {
        background: rgba(102,0,255,0.12);
    }
    .hrmp-btn--active {
        border-color: var(--app-accent);
        background: var(--app-violet-soft);
        color: var(--app-accent);
    }

    /* ── Colour swatch ───────────────────────────────────────────── */
    .hrmp-swatch {
        display: block;
        width: 12px;
        height: 28px;
        border-radius: 4px;
        flex-shrink: 0;
        opacity: 0.85;
        border: 1px solid rgba(0,0,0,0.10);
    }
    .hrmp-btn:hover .hrmp-swatch,
    .hrmp-btn--active .hrmp-swatch {
        opacity: 1;
    }

    /* ── Text group ──────────────────────────────────────────────── */
    .hrmp-btn-text {
        display: flex;
        flex-direction: column;
        gap: 2px;
        flex: 1;
        min-width: 0;
    }

    /* ── Type name label ─────────────────────────────────────────── */
    .hrmp-label {
        font-family: var(--app-font);
        font-size: 12px;
        font-weight: 600;
        color: inherit;
        user-select: none;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    /* ── Spec info (height + fill type) ─────────────────────────── */
    .hrmp-sub {
        font-family: var(--app-font);
        font-size: 9.5px;
        font-weight: 400;
        color: var(--app-text-muted);
        user-select: none;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .hrmp-btn:hover .hrmp-sub,
    .hrmp-btn--active .hrmp-sub {
        color: rgba(102,0,255,0.60);
    }

    /* ── ESC hint footer ─────────────────────────────────────────── */
    .hrmp-hint {
        font-family: var(--app-font);
        font-size: 9.5px;
        color: var(--app-text-muted);
        text-align: center;
        padding: 5px 0 7px;
        border-top: 1px solid rgba(0,0,0,0.06);
        user-select: none;
        background: var(--app-bg);
    }
`;
