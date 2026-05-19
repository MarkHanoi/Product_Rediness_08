/* CONTRACT §05 §2 — CSS layer only, zero logic. All colours via var(--app-*) tokens. */
export const BEAM_MODE_PICKER_STYLES = `

    /* ── Outer panel ─────────────────────────────────────────────── */
    .bmp-panel {
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
        min-width: 310px;
        max-width: 380px;
        pointer-events: all;
        overflow: hidden;
        animation: bmp-appear 0.14s ease-out both;
    }
    @keyframes bmp-appear {
        from { opacity: 0; transform: translateX(-50%) translateY(-6px); }
        to   { opacity: 1; transform: translateX(-50%) translateY(0); }
    }

    /* ── Gradient header ─────────────────────────────────────────── */
    .bmp-header {
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 7px 11px 6px;
        background: var(--app-gradient);
    }
    .bmp-header-title {
        font-family: var(--app-font);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.09em;
        text-transform: uppercase;
        color: #fff;
        user-select: none;
    }
    .bmp-header-sep {
        width: 1px;
        height: 10px;
        background: rgba(255,255,255,0.35);
        flex-shrink: 0;
    }
    .bmp-header-sub {
        font-family: var(--app-font);
        font-size: 9.5px;
        font-weight: 400;
        color: rgba(255,255,255,0.72);
        user-select: none;
    }

    /* ── Auto-offset info note ───────────────────────────────────── */
    .bmp-note {
        font-family: var(--app-font);
        font-size: 9.5px;
        color: var(--app-text-muted);
        background: var(--app-panel-bg);
        padding: 5px 11px;
        border-bottom: 1px solid rgba(0,0,0,0.06);
        display: flex;
        align-items: center;
        gap: 5px;
        user-select: none;
    }
    .bmp-note-icon {
        font-size: 10px;
        opacity: 0.6;
    }

    /* ── Mode button column ──────────────────────────────────────── */
    .bmp-mode-row {
        display: flex;
        flex-direction: column;
        gap: 0;
    }

    /* ── Group label ─────────────────────────────────────────────── */
    .bmp-group-label {
        font-family: var(--app-font);
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.10em;
        text-transform: uppercase;
        color: var(--app-text-muted);
        padding: 5px 11px 3px;
        background: var(--app-panel-bg);
        border-bottom: 1px solid rgba(0,0,0,0.04);
        user-select: none;
    }

    /* ── Type row button ─────────────────────────────────────────── */
    .bmp-btn {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 7px 11px;
        background: var(--app-bg);
        border: none;
        border-bottom: 1px solid rgba(0,0,0,0.06);
        cursor: pointer;
        width: 100%;
        text-align: left;
        color: var(--app-text);
        transition: background 0.12s ease;
    }
    .bmp-btn:hover {
        background: rgba(102,0,255,0.06);
        color: var(--app-accent);
    }
    .bmp-btn:last-child {
        border-bottom: none;
    }

    /* ── Cross-section icon ──────────────────────────────────────── */
    .bmp-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 44px;
        height: 34px;
        flex-shrink: 0;
        color: var(--app-accent);
        opacity: 0.8;
    }
    .bmp-icon svg {
        width: 100%;
        height: 100%;
    }
    .bmp-btn:hover .bmp-icon {
        opacity: 1;
    }

    /* ── Key badge ───────────────────────────────────────────────── */
    .bmp-key {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-family: monospace;
        font-size: 9px;
        font-weight: 700;
        line-height: 1;
        color: var(--app-text-muted);
        background: var(--app-panel-bg);
        border: 1px solid rgba(0,0,0,0.14);
        border-radius: 3px;
        padding: 1px 4px;
        min-width: 14px;
        flex-shrink: 0;
    }

    /* ── Text group ──────────────────────────────────────────────── */
    .bmp-btn-text {
        display: flex;
        align-items: center;
        gap: 7px;
        flex: 1;
        min-width: 0;
    }

    /* ── Type name label ─────────────────────────────────────────── */
    .bmp-label {
        font-family: var(--app-font);
        font-size: 12px;
        font-weight: 600;
        color: inherit;
        user-select: none;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        flex: 1;
    }

    /* ── Spec info ───────────────────────────────────────────────── */
    .bmp-sub {
        font-family: var(--app-font);
        font-size: 9.5px;
        font-weight: 400;
        color: var(--app-text-muted);
        user-select: none;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        flex-shrink: 0;
    }
    .bmp-btn:hover .bmp-sub {
        color: rgba(102,0,255,0.60);
    }

    /* ── ESC hint footer ─────────────────────────────────────────── */
    .bmp-hint {
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
