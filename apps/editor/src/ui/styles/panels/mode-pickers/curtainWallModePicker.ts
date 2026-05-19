/* CONTRACT §05 §2 — CSS layer only, zero logic. All colours via var(--app-*) tokens. */
export const CURTAIN_WALL_MODE_PICKER_STYLES = `

    /* ── Outer panel ─────────────────────────────────────────────── */
    .cwmp-panel {
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
        min-width: 320px;
        max-width: 420px;
        animation: cwmp-appear 0.14s ease-out both;
        overflow: hidden;
    }
    @keyframes cwmp-appear {
        from { opacity:0; transform: translateX(-50%) translateY(-6px); }
        to   { opacity:1; transform: translateX(-50%) translateY(0);    }
    }

    /* ── Gradient header ─────────────────────────────────────────── */
    .cwmp-header {
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 7px 11px 6px;
        background: var(--app-gradient);
    }
    .cwmp-header-title {
        font-family: var(--app-font);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.09em;
        text-transform: uppercase;
        color: #fff;
        user-select: none;
    }
    .cwmp-header-sep {
        width: 1px;
        height: 10px;
        background: rgba(255,255,255,0.35);
        flex-shrink: 0;
    }
    .cwmp-header-sub {
        font-family: var(--app-font);
        font-size: 9.5px;
        font-weight: 400;
        color: rgba(255,255,255,0.72);
        user-select: none;
    }

    /* ── Mode button row ─────────────────────────────────────────── */
    .cwmp-mode-row {
        display: flex;
        flex-direction: column;
        gap: 3px;
        padding: 4px;
    }

    /* ── Individual mode button ──────────────────────────────────── */
    .cwmp-btn {
        display: flex;
        align-items: center;
        gap: 10px;
        background: transparent;
        border: 1px solid transparent;
        border-radius: 7px;
        padding: 5px 8px;
        cursor: pointer;
        text-align: left;
        transition: background 0.1s, border-color 0.1s;
    }
    .cwmp-btn:hover {
        background: var(--app-panel-bg);
        border-color: var(--app-accent);
    }
    .cwmp-btn:active { background: var(--app-violet-soft); }

    /* ── Icon cell ───────────────────────────────────────────────── */
    .cwmp-icon {
        flex-shrink: 0;
        width: 32px;
        height: 22px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--app-accent);
        opacity: 0.7;
        transition: opacity 0.1s;
    }
    .cwmp-btn:hover .cwmp-icon { opacity: 1; }
    .cwmp-icon svg { width: 100%; height: 100%; }

    /* ── Text cell ───────────────────────────────────────────────── */
    .cwmp-btn-text {
        display: flex;
        align-items: center;
        gap: 8px;
        flex: 1;
        min-width: 0;
    }
    .cwmp-key {
        flex-shrink: 0;
        width: 16px;
        height: 16px;
        background: rgba(0,0,0,0.07);
        border: 1px solid rgba(0,0,0,0.1);
        border-radius: 4px;
        font-family: var(--app-font);
        font-size: 9.5px;
        font-weight: 700;
        color: var(--app-text-2);
        display: flex;
        align-items: center;
        justify-content: center;
        user-select: none;
    }
    .cwmp-btn:hover .cwmp-key { background: var(--app-accent); color: #fff; border-color: transparent; }
    .cwmp-label {
        font-family: var(--app-font);
        font-size: 11px;
        font-weight: 600;
        color: var(--app-text);
        user-select: none;
        white-space: nowrap;
    }
    .cwmp-sub {
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
    .cwmp-btn:hover .cwmp-sub { color: rgba(102,0,255,0.55); }

    /* ── ESC hint ────────────────────────────────────────────────── */
    .cwmp-hint {
        font-family: var(--app-font);
        font-size: 9.5px;
        color: var(--app-text-muted);
        text-align: center;
        padding: 3px 0 4px;
        border-top: 1px solid rgba(0,0,0,0.06);
        user-select: none;
        background: var(--app-bg);
    }

    /* ── Mode label badge shown in the cw tool HUD ──────────────── */
    .cw-hud-mode {
        font-family: var(--app-font);
        font-size: 9px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--app-accent);
        background: var(--app-violet-soft);
        border-radius: 4px;
        padding: 1px 6px;
        user-select: none;
    }
`;
