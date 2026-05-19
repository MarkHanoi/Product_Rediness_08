/**
 * @file src/styles/panels/toolHud.ts
 *
 * CSS for the Tool HUD overlay (th- prefix).
 * CONTRACT §05 §2 — CSS layer only, zero logic.
 */
export const TOOL_HUD_STYLES = `
    /* ── Overlay container — compact single-line pill bar ───────────────── */
    .th-overlay {
        position: fixed;
        bottom: var(--th-overlay-bottom, 34px);
        left: 50%;
        transform: translateX(-50%);
        transition: bottom 0.22s cubic-bezier(0.34,1.56,0.64,1);
        z-index: 99999;
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 6px;
        padding: 6px 14px 6px 16px;
        background: var(--app-panel-bg);
        border: 1px solid var(--app-border);
        border-radius: 100px;
        box-shadow: var(--app-shadow-panel);
        pointer-events: auto;
        font-family: var(--app-font);
        animation: th-pop 0.15s ease-out both;
        user-select: none;
        white-space: nowrap;
    }
    @keyframes th-pop {
        from { opacity: 0; transform: translateX(-50%) translateY(6px); }
        to   { opacity: 1; transform: translateX(-50%) translateY(0); }
    }

    /* ── Content row inside overlay (legacy — kept for other tools) ─────── */
    .th-row {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        justify-content: space-between;
    }

    /* ── Status instruction text ────────────────────────────────────────── */
    .th-text {
        font-size: 11px;
        font-weight: 500;
        color: var(--app-text);
        white-space: nowrap;
    }
    .th-text strong, .th-text b { color: var(--app-accent); font-weight: 700; }

    /* ── Separator between sections ─────────────────────────────────────── */
    .th-sep {
        width: 1px;
        height: 14px;
        background: var(--app-border);
        flex-shrink: 0;
        margin: 0 2px;
    }

    /* ── Close-polyline inline action button ────────────────────────────── */
    .th-close-btn {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 3px 10px;
        background: transparent;
        border: 1.5px solid var(--app-border);
        border-radius: 100px;
        cursor: pointer;
        font-family: var(--app-font);
        font-size: 11px;
        font-weight: 500;
        color: var(--app-text);
        transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
        white-space: nowrap;
    }
    .th-close-btn:hover {
        background: var(--app-violet-soft);
        border-color: var(--app-accent);
        color: var(--app-accent);
    }
    .th-close-btn .th-key {
        font-size: 10px;
        font-weight: 800;
        background: rgba(0,0,0,0.07);
        border-radius: 3px;
        padding: 1px 4px;
        font-family: var(--app-font-mono, monospace);
        letter-spacing: 0.02em;
    }
    .th-close-btn:hover .th-key {
        background: var(--app-accent);
        color: #fff;
    }

    /* ── ESC / keyboard hint (muted) ────────────────────────────────────── */
    .th-esc {
        font-family: var(--app-font);
        font-size: 10px;
        color: var(--app-text-muted);
        margin-left: 2px;
        white-space: nowrap;
    }

    /* ── Legacy button styles (used by other tools) ──────────────────────── */
    .th-title {
        font-size: 0.9rem;
        font-weight: 700;
        color: var(--app-text);
        text-align: center;
    }
    .th-hint {
        font-size: 0.72rem;
        color: var(--app-text-muted);
        width: 100%;
        text-align: left;
    }
    .th-btn-row {
        display: flex;
        gap: 8px;
        align-items: center;
        justify-content: center;
        flex-wrap: wrap;
        width: 100%;
    }
    .th-btn {
        padding: 7px 18px;
        border: none;
        border-radius: var(--app-radius-sm);
        cursor: pointer;
        font-size: 0.78rem;
        font-weight: 700;
        font-family: var(--app-font);
        transition: filter 0.15s, transform 0.1s;
        pointer-events: auto;
        white-space: nowrap;
        line-height: 1;
    }
    .th-btn:hover  { filter: brightness(1.1); transform: translateY(-1px); }
    .th-btn:active { filter: brightness(0.95); transform: translateY(0); }
    .th-btn--primary  { background: var(--app-gradient); color: #fff; }
    .th-btn--success  { background: var(--app-gradient); color: #fff; }
    .th-btn--danger   { background: var(--app-status-error); color: #fff; }
    .th-btn--neutral  { background: var(--app-border); color: var(--app-text); }
    .th-btn--icon     { padding: 6px 10px; min-width: 32px; font-size: 0.72rem; }
    .th-btn--close    { background: var(--app-violet-soft); color: var(--app-accent); border: 1px solid var(--app-violet-1); }

    .th-structural-picker {
        max-width: min(760px, calc(100vw - 32px));
        padding: 6px 10px;
        gap: 8px;
        border-radius: 18px;
        flex-wrap: wrap;
        justify-content: center;
        align-items: center;
        white-space: normal;
    }
    .th-structural-picker .th-title {
        font-size: 11px;
        line-height: 1;
        white-space: nowrap;
    }
    .th-structural-picker .th-section {
        display: flex;
        align-items: center;
        gap: 6px;
    }
    .th-structural-picker .th-label {
        font-size: 10px;
        font-weight: 700;
        color: var(--app-text-muted);
        white-space: nowrap;
    }
    .th-structural-picker .th-btn-row {
        width: auto;
        gap: 4px;
        flex-wrap: nowrap;
    }
    .th-structural-picker .th-btn {
        padding: 5px 9px;
        font-size: 10px;
        border-radius: 999px;
        border: 1px solid var(--app-border);
        background: var(--app-bg);
        color: var(--app-text);
    }
    .th-structural-picker .th-btn--active,
    .th-structural-picker .th-btn--primary {
        border-color: var(--app-accent);
        background: var(--app-gradient);
        color: #fff;
    }
    .th-structural-picker .th-input {
        height: 28px;
        min-width: 118px;
        max-width: 172px;
        padding: 4px 8px;
        border-radius: 999px;
        border: 1px solid var(--app-border);
        background: var(--app-bg);
        color: var(--app-text);
        font: 600 11px var(--app-font);
    }
    .th-structural-picker .th-info-row {
        max-width: 260px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    /* ── Mode selector row ──────────────────────────────────────────────── */
    .th-mode-row {
        display: flex;
        gap: 4px;
        background: var(--app-violet-soft);
        padding: 3px;
        border-radius: var(--app-radius-sm);
    }
    .th-mode-btn {
        padding: 3px 12px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 11px;
        font-weight: 700;
        font-family: var(--app-font);
        background: transparent;
        color: var(--app-text-2);
        transition: all 0.15s;
    }
    .th-mode-btn--active { background: #fff; color: var(--app-accent); }

    /* ── Finish / status pill (door, window — simple floating button) ───── */
    .th-pill {
        position: fixed;
        bottom: var(--th-overlay-bottom, 34px);
        left: 50%;
        transition: bottom 0.22s cubic-bezier(0.34,1.56,0.64,1);
        transform: translateX(-50%);
        background: var(--app-gradient);
        color: #fff;
        padding: 11px 26px;
        border-radius: 24px;
        font-size: 0.82rem;
        font-weight: 700;
        font-family: var(--app-font);
        box-shadow: var(--app-shadow-glow);
        z-index: 99999;
        cursor: pointer;
        border: none;
        pointer-events: auto;
        transition: filter 0.15s;
    }
    .th-pill:hover  { filter: brightness(1.1); }
    .th-pill:active { filter: brightness(0.92); }

    /* ── Simple status info pill (door/window placement hint, dark) ─────── */
    .th-status-pill {
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(26, 32, 53, 0.88);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        color: #fff;
        padding: 9px 22px;
        border-radius: 22px;
        font-size: 0.8rem;
        font-weight: 500;
        font-family: var(--app-font);
        z-index: 99999;
        pointer-events: none;
        border: 1px solid rgba(139,92,246,0.2);
    }

    /* ── Dimension input overlay (dark, monospace — intentional exception) ─ */
    .th-dim-overlay {
        position: fixed;
        bottom: 165px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(15, 20, 40, 0.93);
        color: #fff;
        padding: 10px 20px;
        border-radius: var(--app-radius-sm);
        font-family: monospace;
        font-size: 16px;
        font-weight: bold;
        display: none;
        z-index: 5000;
        pointer-events: none;
        border: 2px solid var(--app-accent);
        box-shadow: 0 2px 16px rgba(102, 0, 255, 0.45);
        min-width: 160px;
        text-align: center;
        line-height: 1.5;
    }
    .th-dim-label { color: rgba(139,92,246,0.85); font-size:11px; font-weight:normal; display:block; margin-bottom:2px; }
    .th-dim-cursor { color: var(--app-violet-1); font-size:13px; }
    .th-dim-unit   { color: rgba(255,255,255,0.45); font-size:13px; font-weight:normal; }
    .th-dim-mm     { color: rgba(139,92,246,0.7); font-size:12px; font-weight:normal; }

    /* ── Mixed-mode selector modal (WallTool.showMixedModeSelector) ──── */
    .th-mode-modal {
        position: absolute;
        left: 50%;
        top: 20%;
        transform: translate(-50%, -50%);
        background: var(--app-panel-bg);
        padding: 15px;
        border-radius: var(--app-radius-md);
        display: flex;
        gap: 20px;
        box-shadow: var(--app-shadow-panel);
        z-index: 1000;
        pointer-events: auto;
        border: 2px solid var(--app-accent);
    }
    .th-mode-opt {
        display: flex;
        flex-direction: column;
        align-items: center;
        cursor: pointer;
        padding: 10px;
        border-radius: var(--app-radius-sm);
        transition: background 0.2s;
        color: var(--app-accent);
    }
    .th-mode-opt:hover { background: var(--app-violet-soft); }
    .th-mode-opt span {
        margin-top: 5px;
        font-family: var(--app-font);
        font-size: 12px;
        color: var(--app-text);
    }
`;

/* ─────────────────────────────────────────────────────────────────────────────
   STAIR PATH TOOL — 2D drawing HUD  (prefix: spt-)
   Rendered as a fixed pill at the bottom of the screen while the tool is active.
───────────────────────────────────────────────────────────────────────────── */
export const STAIR_PATH_TOOL_STYLES = `
    /* ── Main HUD bar ─────────────────────────────────────────────────── */
    .spt-hud {
        position: fixed;
        bottom: 40px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 99999;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 7px 18px 7px 14px;
        background: var(--app-panel-bg);
        border: 1px solid var(--app-accent);
        border-radius: 100px;
        box-shadow: var(--app-shadow-panel), 0 0 0 3px rgba(99,102,241,0.10);
        font-family: var(--app-font);
        font-size: 12px;
        white-space: nowrap;
        pointer-events: none;
        animation: spt-pop 0.14s ease-out both;
        user-select: none;
    }
    @keyframes spt-pop {
        from { opacity: 0; transform: translateX(-50%) translateY(8px) scale(0.96); }
        to   { opacity: 1; transform: translateX(-50%) translateY(0)   scale(1); }
    }

    /* ── Stair icon ───────────────────────────────────────────────────── */
    .spt-icon {
        font-size: 15px;
        line-height: 1;
        flex-shrink: 0;
    }

    /* ── Primary instruction text ─────────────────────────────────────── */
    .spt-msg {
        color: var(--app-text);
        font-weight: 500;
    }

    /* ── Separator ────────────────────────────────────────────────────── */
    .spt-sep {
        width: 1px;
        height: 14px;
        background: var(--app-border);
        flex-shrink: 0;
        margin: 0 2px;
    }

    /* ── Key-hint chips ───────────────────────────────────────────────── */
    .spt-key {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        font-size: 10px;
        color: var(--app-text-muted, #6b7280);
    }
    .spt-key kbd {
        display: inline-block;
        padding: 1px 4px;
        background: var(--app-bg);
        border: 1px solid var(--app-border);
        border-radius: 3px;
        font-family: inherit;
        font-size: 10px;
        font-weight: 600;
        color: var(--app-text);
        line-height: 1.4;
    }

    /* ── Validation badge (valid / invalid) ───────────────────────────── */
    .spt-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 8px;
        border-radius: 100px;
        font-size: 11px;
        font-weight: 600;
        transition: background 0.15s, color 0.15s;
    }
    .spt-badge--ok {
        background: rgba(34,197,94,0.12);
        color: #15803d;
    }
    .spt-badge--warn {
        background: rgba(245,158,11,0.12);
        color: #b45309;
    }
    .spt-badge--err {
        background: rgba(239,68,68,0.10);
        color: #b91c1c;
    }

    /* ── Compact parameter row (width, riser, tread) ──────────────────── */
    .spt-params {
        position: fixed;
        bottom: 88px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 99998;
        display: flex;
        gap: 6px;
        padding: 5px 12px;
        background: var(--app-panel-bg);
        border: 1px solid var(--app-border);
        border-radius: 100px;
        box-shadow: var(--app-shadow-panel);
        font-family: var(--app-font);
        font-size: 11px;
        white-space: nowrap;
        pointer-events: none;
        animation: spt-pop 0.14s ease-out both;
        user-select: none;
        color: var(--app-text-muted, #6b7280);
    }
    .spt-params strong {
        color: var(--app-text);
        font-weight: 600;
        margin-right: 1px;
    }
    .spt-params-sep {
        opacity: 0.4;
    }

    /* ── SHIFT-snap indicator ─────────────────────────────────────────── */
    .spt-snap-active .spt-icon {
        color: var(--app-accent);
    }

    /* Mobile: push HUD above safe area */
    @media (max-width: 768px) {
        .spt-hud { bottom: calc(60px + env(safe-area-inset-bottom, 0px)); }
        .spt-params { bottom: calc(108px + env(safe-area-inset-bottom, 0px)); }
    }
`;

