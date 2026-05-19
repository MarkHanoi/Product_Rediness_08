/**
 * @file src/engine/subsystems/styles/panels/platform-shell/ribbonMenu.ts
 *
 * Ribbon menu — rib- prefix.
 * CONTRACT §05 §2 — CSS layer only, zero logic.
 */
export const RIBBON_STYLES = `
    /* ── Outer bar ──────────────────────────────────────────────────────── */
    .rb-bar {
        background: var(--app-bg);
        border-bottom: 1px solid var(--app-border);
        pointer-events: auto;
    }
    /* ── Tab row ─────────────────────────────────────────────────────────── */
    .rb-tab-row { display: flex; background: var(--app-panel-bg); }
    .rb-tab {
        padding: 6px 15px;
        background: transparent;
        color: var(--app-text);
        border: none;
        border-bottom: 2px solid transparent;
        cursor: pointer;
        font-size: 0.75rem;
        font-weight: normal;
        font-family: var(--app-font);
        transition: color 0.15s, border-color 0.15s;
    }
    .rb-tab--active {
        color: var(--app-accent);
        font-weight: bold;
        border-bottom-color: var(--app-accent);
        background: var(--app-panel-bg);
    }
    /* ── Content area ────────────────────────────────────────────────────── */
    .rb-content {
        padding: 8px 20px;
        min-height: 85px;
        background: var(--app-panel-bg);
        display: flex;
        align-items: center;
        border-bottom: 1px solid var(--app-border);
        position: relative;
    }
    /* ── Mode overlays (plane / sketch) ─────────────────────────────────── */
    .rb-mode-overlay {
        position: absolute;
        top: 0; left: 0;
        width: 100%; height: 100%;
        background: var(--app-panel-bg);
        z-index: 10;
        display: flex;
        align-items: center;
        padding: 0 20px;
        gap: 30px;
        box-sizing: border-box;
    }
    .rb-mode-info  { display: flex; flex-direction: column; gap: 5px; }
    .rb-mode-title { font-weight: bold; color: var(--app-accent); }
    .rb-mode-hint  { font-size: 0.75rem; color: var(--app-text-2); }
    /* ── Tool group column ───────────────────────────────────────────────── */
    .rb-group {
        display: flex;
        flex-direction: column;
        align-items: center;
        border-right: 1px solid var(--app-border);
        padding-right: 10px;
    }
    .rb-group:last-child { border-right: none; padding-right: 0; }
    .rb-group-label { font-size: 0.65rem; margin-top: 4px; color: var(--app-text-2); }
    /* ── Tool item ───────────────────────────────────────────────────────── */
    .rb-tools-row { display: flex; gap: 8px; }
    .rb-tool-item { display: flex; flex-direction: column; align-items: center; gap: 2px; }
    .rb-tool-label { font-size: 0.6rem; color: var(--app-text-2); }
    /* ── Right-side CTA zone ─────────────────────────────────────────────── */
    .rb-actions {
        display: flex;
        gap: 10px;
        align-items: center;
        position: absolute;
        right: 20px;
    }
    /* ── Sketch-mode draw-profile divider ────────────────────────────────── */
    .rb-sketch-profile {
        display: flex;
        flex-direction: column;
        align-items: center;
        border-right: 1px solid var(--app-border);
        padding-right: 20px;
    }
    .rb-sketch-profile-row { display: flex; gap: 10px; }
    .rb-sketch-label { font-size: 0.65rem; color: var(--app-text-2); margin-top: 5px; }
    /* ── Coming-soon placeholder ─────────────────────────────────────────── */
    .rb-coming-soon { color: var(--app-text-muted); font-size: 0.8rem; font-family: var(--app-font); }
    /* Phase 5.1 — native button replacements for bim-button in Ribbon/CreateTab */
    .rb-icon-btn {
        display: flex; align-items: center; justify-content: center;
        width: 40px; height: 40px; padding: 0;
        border: 1.5px solid var(--app-border); border-radius: var(--app-radius-sm);
        background: var(--app-panel-bg); color: var(--app-text);
        font-size: 16px; cursor: pointer; transition: all 0.14s;
    }
    .rb-icon-btn:hover {
        background: var(--app-violet-soft); border-color: rgba(102,0,255,0.25);
        color: var(--app-accent);
    }
    .rb-icon-btn--active {
        background: var(--app-gradient); color: #fff;
        border-color: transparent; box-shadow: var(--app-shadow-glow);
    }
    .rb-icon-btn:disabled {
        opacity: 0.4; cursor: not-allowed;
    }
    .rb-mode-btn {
        display: flex; align-items: center; gap: 6px;
        padding: 6px 14px; border: none; border-radius: var(--app-radius-sm);
        font-size: 0.8rem; font-weight: 600; font-family: var(--app-font);
        cursor: pointer; transition: opacity 0.15s;
    }
    .rb-mode-btn--finish {
        background: var(--app-status-success, #22c55e); color: #fff;
    }
    .rb-mode-btn--cancel {
        background: var(--app-status-error, #dc2626); color: #fff;
    }
    .rb-load-btn {
        padding: 6px 14px; border: none; border-radius: var(--app-radius-sm);
        background: var(--app-status-success, #22c55e); color: #fff;
        font-size: 0.8rem; font-weight: 600; font-family: var(--app-font);
        cursor: pointer; transition: opacity 0.15s;
    }
    .rb-load-btn:hover { opacity: 0.85; }

    /* MOB-001-SC: Ribbon mobile responsiveness */
    @media (max-width: 768px) {
        /* Tab row: scrollable */
        .rb-tab-row {
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
            flex-wrap: nowrap;
        }
        .rb-tab-row::-webkit-scrollbar { display: none; }
        .rb-tab { white-space: nowrap; flex-shrink: 0; }

        /* Content area: scrollable horizontally */
        .rb-content {
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
            min-height: 70px;
            padding: 6px 14px;
        }
        .rb-content::-webkit-scrollbar { display: none; }

        /* Tool groups: tighter */
        .rb-group { padding-right: 8px; }

        /* Icon buttons: touch target */
        .rb-icon-btn {
            width: 44px;
            height: 44px;
        }

        /* Actions: no absolute positioning on mobile */
        .rb-actions {
            position: static;
            margin-left: auto;
            flex-shrink: 0;
        }
    }
`;
