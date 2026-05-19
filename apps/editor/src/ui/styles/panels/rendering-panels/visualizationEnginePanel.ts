/**
 * @file src/engine/subsystems/styles/panels/rendering-panels/visualizationEnginePanel.ts
 *
 * Visualization Engine panel — viz- prefix.
 * CONTRACT §05 §2 — CSS layer only, zero logic.
 */
export const VIZ_ENGINE_PANEL_STYLES = `
    /* ── Container ──────────────────────────────────────────────────────── */
    .viz-panel {
        position: fixed;
        top: 60px;
        right: 12px;
        width: 300px;
        display: flex;
        flex-direction: column;
        background: var(--app-bg);
        border: 1px solid var(--app-border);
        border-radius: var(--app-radius-lg);
        box-shadow: var(--app-shadow-panel);
        z-index: 3200;
        font-family: var(--app-font);
        overflow: hidden;
        max-height: calc(100vh - 80px);
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: #c4cde0 transparent;
    }
    .viz-panel::-webkit-scrollbar { width: 4px; }
    .viz-panel::-webkit-scrollbar-thumb { background: #c4cde0; border-radius: 4px; }

    /* ── Header ─────────────────────────────────────────────────────────── */
    .viz-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 14px 10px;
        background: linear-gradient(135deg, #8B5CF6 0%, #6600FF 100%);
        flex-shrink: 0;
    }
    .viz-header-left {
        display: flex;
        align-items: center;
        gap: 10px;
    }
    .viz-header-icon {
        font-size: 20px;
        filter: drop-shadow(0 0 6px rgba(255,255,255,0.5));
    }
    .viz-header-title {
        font-size: 13px;
        font-weight: 700;
        color: #fff;
        letter-spacing: 0.02em;
    }
    .viz-header-sub {
        font-size: 10px;
        color: rgba(255,255,255,0.65);
        margin-top: 1px;
    }
    .viz-close-btn {
        background: rgba(255,255,255,0.12);
        border: none;
        color: rgba(255,255,255,0.8);
        border-radius: 50%;
        width: 24px;
        height: 24px;
        cursor: pointer;
        font-size: 11px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.14s;
        flex-shrink: 0;
        font-family: var(--app-font);
    }
    .viz-close-btn:hover { background: rgba(255,255,255,0.25); }

    /* ── Rendering Mode bar (Section 1) ─────────────────────────────────── */
    .viz-mode-bar {
        display: flex;
        gap: 4px;
        padding: 8px 10px;
        background: var(--app-panel-bg);
        border-bottom: 1px solid var(--app-border-light);
        flex-shrink: 0;
    }
    .viz-mode-btn {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 3px;
        padding: 7px 4px;
        background: var(--app-bg);
        border: 1px solid var(--app-border);
        border-radius: 8px;
        color: var(--app-text-2);
        font-size: 9px;
        font-weight: 600;
        cursor: pointer;
        letter-spacing: 0.04em;
        transition: all 0.15s;
        text-transform: uppercase;
        font-family: var(--app-font);
    }
    .viz-mode-btn:hover {
        background: var(--app-violet-soft);
        border-color: var(--app-violet-1);
        color: var(--app-accent);
    }
    .viz-mode-btn--active {
        background: var(--app-gradient);
        border-color: var(--app-accent);
        color: #fff;
        box-shadow: var(--app-shadow-glow);
    }
    .viz-mode-icon { font-size: 14px; }
    .viz-mode-label { font-size: 8.5px; }

    /* ── Tab nav ─────────────────────────────────────────────────────────── */
    .viz-tab-nav {
        display: flex;
        background: var(--app-panel-bg);
        border-bottom: 1px solid var(--app-border-light);
        flex-shrink: 0;
    }
    .viz-tab-btn {
        flex: 1;
        padding: 8px 4px;
        background: none;
        border: none;
        border-bottom: 2px solid transparent;
        color: var(--app-text-muted);
        font-size: 10px;
        font-weight: 600;
        cursor: pointer;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        transition: all 0.15s;
        font-family: var(--app-font);
    }
    .viz-tab-btn:hover { color: var(--app-text-2); }
    .viz-tab-btn--active {
        color: var(--app-accent);
        border-bottom-color: var(--app-accent);
    }

    /* ── Tab content ─────────────────────────────────────────────────────── */
    .viz-tab-content {
        flex-direction: column;
        padding: 12px 14px;
        gap: 0;
    }

    /* ── Section label ───────────────────────────────────────────────────── */
    .viz-section-label {
        font-size: 10px;
        font-weight: 600;
        color: var(--app-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        margin-bottom: 8px;
    }

    /* ── Quality grid (4 buttons: Off / Standard / High / Ultra) ─────────── */
    .viz-quality-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 4px;
        margin-bottom: 4px;
    }
    .viz-quality-btn {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 3px;
        padding: 8px 4px;
        background: var(--app-panel-bg);
        border: 1px solid var(--app-border);
        border-radius: 8px;
        color: var(--app-text-2);
        cursor: pointer;
        transition: all 0.15s;
        font-family: var(--app-font);
    }
    .viz-quality-btn:hover {
        background: var(--app-violet-soft);
        border-color: var(--app-violet-1);
        color: var(--app-accent);
    }
    .viz-quality-btn--active {
        background: var(--app-gradient);
        border-color: var(--app-accent);
        color: #fff;
        box-shadow: var(--app-shadow-glow);
    }
    .viz-quality-icon { font-size: 14px; }
    .viz-quality-name { font-size: 9px; font-weight: 600; }

    /* ── Preset cards grid (2×2) ─────────────────────────────────────────── */
    .viz-preset-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 6px;
        margin-bottom: 4px;
    }
    .viz-preset-btn {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        padding: 10px 8px;
        background: var(--app-panel-bg);
        border: 1px solid var(--app-border);
        border-radius: 10px;
        color: var(--app-text-2);
        cursor: pointer;
        transition: all 0.15s;
        font-family: var(--app-font);
    }
    .viz-preset-btn:hover {
        background: var(--app-violet-soft);
        border-color: var(--app-violet-1);
        color: var(--app-accent);
    }
    .viz-preset-btn--active {
        background: var(--app-gradient);
        border-color: var(--app-accent);
        color: #fff;
    }
    .viz-preset-icon { font-size: 22px; }
    .viz-preset-name { font-size: 10px; font-weight: 600; letter-spacing: 0.02em; }

    /* ── Select ──────────────────────────────────────────────────────────── */
    .viz-select {
        width: 100%;
        padding: 7px 9px;
        background: var(--app-panel-bg);
        border: 1px solid var(--app-border);
        border-radius: 7px;
        color: var(--app-text);
        font-size: 11px;
        cursor: pointer;
        outline: none;
        font-family: var(--app-font);
        margin-bottom: 4px;
    }
    .viz-select:focus { border-color: var(--app-accent); }

    /* ── Slider row ──────────────────────────────────────────────────────── */
    .viz-slider-row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 4px;
    }
    .viz-slider {
        flex: 1;
        -webkit-appearance: none;
        height: 4px;
        border-radius: 2px;
        background: var(--app-border);
        outline: none;
        cursor: pointer;
    }
    .viz-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 14px; height: 14px;
        border-radius: 50%;
        background: var(--app-accent);
        box-shadow: var(--app-shadow-glow);
        cursor: pointer;
    }
    .viz-slider-val {
        font-size: 10px;
        color: var(--app-text-muted);
        white-space: nowrap;
        min-width: 36px;
        text-align: right;
    }

    /* ── Status bar ──────────────────────────────────────────────────────── */
    .viz-status-bar {
        font-size: 10px;
        font-weight: 600;
        color: var(--app-accent);
        padding: 6px 0 2px;
        border-top: 1px solid var(--app-border-light);
        margin-top: 8px;
    }

    /* ── Pipeline info row ───────────────────────────────────────────────── */
    .viz-info-row {
        display: flex;
        gap: 10px;
        margin-top: 8px;
        flex-wrap: wrap;
    }
    .viz-info-item {
        display: flex;
        align-items: center;
        gap: 5px;
        font-size: 9.5px;
        color: var(--app-text-2);
        letter-spacing: 0.02em;
    }
    .viz-info-dot {
        width: 7px; height: 7px;
        border-radius: 50%;
        background: #22c55e;
        flex-shrink: 0;
    }
    .viz-info-dot--green { background: #22c55e; }

    /* ── Loader ──────────────────────────────────────────────────────────── */
    .viz-loader {
        display: none;
        align-items: center;
        gap: 6px;
        padding: 5px 0;
        font-size: 10px;
        color: #a855f7;
    }
    .viz-loader-dot {
        width: 6px; height: 6px;
        border-radius: 50%;
        background: #a855f7;
        animation: viz-pulse 1s ease-in-out infinite;
    }
    @keyframes viz-pulse {
        0%, 100% { opacity: 1; }
        50%       { opacity: 0.25; }
    }

    /* ── Toggle row (Post FX tab) ────────────────────────────────────────── */
    .viz-toggle-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 7px 0;
        border-bottom: 1px solid var(--app-border-light);
    }
    .viz-toggle-label {
        font-size: 11px;
        color: var(--app-text);
    }
    .viz-toggle-wrap {
        position: relative;
        cursor: pointer;
    }
    .viz-toggle-checkbox {
        position: absolute;
        opacity: 0;
        width: 0;
        height: 0;
    }
    .viz-toggle-track {
        display: block;
        width: 32px;
        height: 18px;
        background: var(--app-border);
        border-radius: 9px;
        transition: background 0.2s;
        position: relative;
    }
    .viz-toggle-checkbox:checked + .viz-toggle-track {
        background: #7c3aed;
    }
    .viz-toggle-thumb {
        position: absolute;
        top: 2px;
        left: 2px;
        width: 14px;
        height: 14px;
        background: #fff;
        border-radius: 50%;
        transition: transform 0.2s;
        box-shadow: 0 1px 4px rgba(0,0,0,0.3);
    }
    .viz-toggle-checkbox:checked + .viz-toggle-track .viz-toggle-thumb {
        transform: translateX(14px);
    }

    /* ── Output shortcut buttons (Post FX tab) ───────────────────────────── */
    .viz-postfx-btns {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin-top: 4px;
    }
    .viz-action-btn {
        width: 100%;
        padding: 9px 12px;
        background: linear-gradient(135deg, #8B5CF6 0%, #6600FF 100%);
        border: none;
        border-radius: 8px;
        color: #fff;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: opacity 0.15s, box-shadow 0.15s;
        font-family: var(--app-font);
        letter-spacing: 0.02em;
        box-shadow: 0 2px 8px rgba(102,0,255,0.3);
    }
    .viz-action-btn:hover {
        opacity: 0.88;
        box-shadow: 0 4px 14px rgba(102,0,255,0.45);
    }
    .viz-action-btn--outline {
        background: transparent;
        border: 1px solid var(--app-border);
        color: var(--app-text-2);
        box-shadow: none;
    }
    .viz-action-btn--outline:hover {
        background: var(--app-violet-soft);
        border-color: var(--app-violet-1);
        color: var(--app-accent);
        box-shadow: none;
        opacity: 1;
    }

    /* ── Toolbar trigger button ─────────────────────────────────────────── */
    .viz-toolbar-btn {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 6px 14px;
        background: linear-gradient(135deg, #8B5CF6 0%, #6600FF 100%);
        color: #fff;
        border: none;
        border-radius: 20px;
        cursor: pointer;
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.02em;
        box-shadow: 0 2px 10px rgba(102,0,255,0.35);
        transition: box-shadow 0.2s;
        white-space: nowrap;
        margin-bottom: 0.35rem;
        width: 100%;
        justify-content: center;
        font-family: var(--app-font);
    }
    .viz-toolbar-btn:hover {
        box-shadow: 0 4px 16px rgba(102,0,255,0.5);
    }

    /* ── Procedural Sky preset grid ───────────────────────────────────────── */
    .viz-sky-preset-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 4px;
        margin-bottom: 4px;
    }
    .viz-sky-preset-btn {
        padding: 6px 3px;
        background: var(--app-panel-bg);
        border: 1px solid var(--app-border);
        border-radius: 7px;
        color: var(--app-text-2);
        font-size: 9px;
        font-weight: 600;
        cursor: pointer;
        text-align: center;
        transition: all 0.14s;
        font-family: var(--app-font);
        letter-spacing: 0.02em;
    }
    .viz-sky-preset-btn:hover {
        background: var(--app-violet-soft);
        border-color: var(--app-violet-1);
        color: var(--app-accent);
    }
    .viz-sky-preset-btn--active {
        background: var(--app-gradient);
        border-color: var(--app-accent);
        color: #fff;
        box-shadow: var(--app-shadow-glow);
    }
`;
