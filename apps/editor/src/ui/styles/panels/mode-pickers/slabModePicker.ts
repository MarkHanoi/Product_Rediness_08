/* CONTRACT §05 §2 — CSS layer only, zero logic. All colours via var(--app-*) tokens. */
export const SLAB_MODE_PICKER_STYLES = `
    /* ── Outer panel ─────────────────────────────────────────────── */
    .smp-panel {
        position: fixed;
        top: 64px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 9999;
        display: flex;
        flex-direction: column;
        padding: 0;
        min-width: 260px;
        max-width: 300px;
        background: var(--app-bg);
        border-radius: var(--app-radius-lg);
        box-shadow: var(--app-shadow-panel);
        pointer-events: all;
        overflow: hidden;
        animation: smp-appear 0.14s ease-out both;
    }
    @keyframes smp-appear {
        from { opacity: 0; transform: translateX(-50%) translateY(-6px); }
        to   { opacity: 1; transform: translateX(-50%) translateY(0); }
    }

    /* ── Panel header ─────────────────────────────────────────────── */
    .smp-header {
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 7px 11px 6px;
        background: var(--app-gradient);
    }
    .smp-header-title {
        font-family: var(--app-font);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.09em;
        text-transform: uppercase;
        color: #fff;
    }
    .smp-header-sep {
        width: 1px;
        height: 10px;
        background: rgba(255,255,255,0.35);
        flex-shrink: 0;
    }
    .smp-header-sub {
        font-family: var(--app-font);
        font-size: 9.5px;
        font-weight: 400;
        color: rgba(255,255,255,0.72);
    }

    /* ── Mode buttons column ─────────────────────────────────────── */
    .smp-mode-row {
        display: flex;
        flex-direction: column;
        gap: 0;
        padding: 4px;
        background: var(--app-bg);
    }

    /* ── Individual mode button ─────────────────────────────────── */
    .smp-btn {
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
    .smp-btn:hover {
        background: var(--app-panel-bg);
        border-color: var(--app-accent);
        color: var(--app-accent);
    }
    .smp-btn:active { background: var(--app-violet-soft); }

    /* ── SVG icon ────────────────────────────────────────────────── */
    .smp-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 20px;
        flex-shrink: 0;
        opacity: 0.65;
        background: var(--app-panel-bg);
        border-radius: 4px;
        border: 1px solid var(--app-border);
    }
    .smp-btn:hover .smp-icon {
        opacity: 1;
        border-color: var(--app-accent);
    }
    .smp-icon svg { width: 100%; height: 100%; }

    /* ── Text group ──────────────────────────────────────────────── */
    .smp-btn-text {
        display: flex;
        align-items: center;
        gap: 5px;
        flex: 1;
        min-width: 0;
    }

    /* ── Keyboard shortcut badge ─────────────────────────────────── */
    .smp-key {
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
    .smp-btn:hover .smp-key { background: var(--app-accent); color: #fff; }

    /* ── Mode name label ─────────────────────────────────────────── */
    .smp-label {
        font-family: var(--app-font);
        font-size: 11px;
        font-weight: 600;
        color: inherit;
        user-select: none;
        white-space: nowrap;
    }

    /* ── Mode sub-description ────────────────────────────────────── */
    .smp-sub {
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
    .smp-btn:hover .smp-sub { color: rgba(102,0,255,0.6); }

    /* ── ESC hint footer ─────────────────────────────────────────── */
    .smp-hint {
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
