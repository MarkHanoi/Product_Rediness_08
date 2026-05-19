/* CONTRACT §05 §2 — CSS layer only, zero logic. All colours via var(--app-*) tokens. */
export const OPENING_MODE_PICKER_STYLES = `
    /* ── Outer panel ─────────────────────────────────────────────── */
    .omp-panel {
        position: fixed;
        top: 64px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 9000;
        display: flex;
        flex-direction: column;
        gap: 0;
        padding: 0;
        min-width: 240px;
        background: var(--app-bg);
        border-radius: var(--app-radius-lg);
        box-shadow: var(--app-shadow-panel);
        pointer-events: all;
        overflow: hidden;
        animation: omp-appear 0.15s ease-out both;
    }
    @keyframes omp-appear {
        from { opacity: 0; transform: translateX(-50%) translateY(-8px); }
        to   { opacity: 1; transform: translateX(-50%) translateY(0); }
    }

    /* ── Gradient header ─────────────────────────────────────────── */
    .omp-header {
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 7px 11px 6px;
        background: var(--app-gradient);
    }
    .omp-header-title {
        font-family: var(--app-font);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.09em;
        text-transform: uppercase;
        color: #fff;
        user-select: none;
    }
    .omp-header-sep {
        width: 1px;
        height: 12px;
        background: rgba(255,255,255,0.35);
        flex-shrink: 0;
    }
    .omp-header-sub {
        font-family: var(--app-font);
        font-size: 10px;
        font-weight: 400;
        color: rgba(255,255,255,0.82);
        user-select: none;
    }

    /* ── Mode row ────────────────────────────────────────────────── */
    .omp-mode-row {
        display: flex;
        flex-direction: row;
        gap: 0;
        background: var(--app-bg);
        padding: 8px 8px 4px;
    }

    /* ── Mode button ─────────────────────────────────────────────── */
    .omp-btn {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        padding: 8px 6px 6px;
        background: var(--app-panel-bg);
        border: none;
        border-radius: var(--app-radius-md);
        cursor: pointer;
        transition: background 0.12s, box-shadow 0.12s;
        flex: 1;
        min-width: 0;
    }
    .omp-btn + .omp-btn {
        margin-left: 6px;
    }
    .omp-btn:hover {
        background: var(--app-violet-soft);
        box-shadow: var(--app-shadow-card);
    }
    .omp-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 48px;
        height: 36px;
        color: var(--app-accent);
        flex-shrink: 0;
    }
    .omp-icon svg {
        width: 100%;
        height: 100%;
    }
    .omp-btn-text {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1px;
    }
    .omp-key {
        font-family: var(--app-font);
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--app-accent);
        user-select: none;
    }
    .omp-label {
        font-family: var(--app-font);
        font-size: 10.5px;
        font-weight: 600;
        color: var(--app-text);
        user-select: none;
        white-space: nowrap;
    }
    .omp-sub {
        font-family: var(--app-font);
        font-size: 9px;
        font-weight: 400;
        color: var(--app-text-muted);
        user-select: none;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        text-align: center;
        max-width: 90px;
    }

    /* ── ESC hint footer ─────────────────────────────────────────── */
    .omp-hint {
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
