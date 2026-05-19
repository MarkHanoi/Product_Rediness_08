/**
 * @file src/styles/panels/levelsGrids.ts
 *
 * CSS for Level HUD, Level Manager, Grid Manager, Dimension Options.
 * CONTRACT §05 §2 — CSS layer only, zero logic.
 */
export const ACTIVE_LEVEL_HUD_STYLES = `
    .alh-hud {
        position: absolute;
        top: 50px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 20;
        pointer-events: none;
        display: flex;
        justify-content: center;
        font-family: var(--app-font);
    }

    .alh-badge {
        display: flex;
        align-items: center;
        gap: 6px;
        background: rgba(18, 18, 32, 0.82);
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 20px;
        padding: 5px 12px;
        color: #ffffff;
        pointer-events: auto;
        box-shadow: 0 2px 12px rgba(0,0,0,0.35);
        backdrop-filter: blur(6px);
        user-select: none;
    }

    .alh-info {
        display: flex;
        flex-direction: column;
        align-items: center;
        min-width: 90px;
    }

    .alh-name {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.03em;
        color: #ffffff;
        line-height: 1.2;
    }

    .alh-elev {
        font-size: 10px;
        color: rgba(255,255,255,0.65);
        font-variant-numeric: tabular-nums;
        letter-spacing: 0.02em;
    }

    .alh-arrow {
        background: none;
        border: none;
        color: rgba(255,255,255,0.70);
        font-size: 10px;
        cursor: pointer;
        padding: 2px 4px;
        border-radius: 4px;
        transition: color 0.12s, background 0.12s;
        line-height: 1;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .alh-arrow:hover:not(:disabled) {
        color: #ffffff;
        background: rgba(255,255,255,0.12);
    }
    .alh-arrow:disabled {
        opacity: 0.28;
        cursor: default;
    }

    /* ─── §ALH-TB: Toolbar-slot overrides ────────────────────────────────────
       When the HUD is injected into #alh-toolbar-slot (inside .plat-toolbar),
       override the absolute-position defaults and apply the app violet palette.
       The original .alh-* rules remain unchanged as a canvas-overlay fallback.
    ──────────────────────────────────────────────────────────────────────── */
    #alh-toolbar-slot {
        display: flex;
        align-items: center;
    }
    #alh-toolbar-slot .alh-hud {
        position: static;
        transform: none;
        z-index: auto;
        pointer-events: auto;
        display: flex;
        align-items: center;
    }
    #alh-toolbar-slot .alh-badge {
        background: linear-gradient(135deg, rgba(139,92,246,0.12) 0%, rgba(102,0,255,0.12) 100%);
        border: 1.5px solid rgba(102,0,255,0.22);
        border-radius: 20px;
        padding: 3px 10px;
        gap: 5px;
        color: #5B21B6;
        box-shadow: 0 1px 6px rgba(102,0,255,0.10);
        backdrop-filter: none;
    }
    #alh-toolbar-slot .alh-info {
        min-width: 80px;
    }
    #alh-toolbar-slot .alh-name {
        color: #5B21B6;
        font-size: 11.5px;
    }
    #alh-toolbar-slot .alh-elev {
        color: rgba(102,0,255,0.60);
        font-size: 9.5px;
    }
    #alh-toolbar-slot .alh-arrow {
        color: rgba(102,0,255,0.55);
        font-size: 9px;
    }
    #alh-toolbar-slot .alh-arrow:hover:not(:disabled) {
        color: #6600FF;
        background: rgba(102,0,255,0.09);
    }
    #alh-toolbar-slot .alh-arrow:disabled {
        opacity: 0.22;
    }
`;

export const LEVEL_MANAGER_STYLES = `
    .lm-panel {
        display: flex;
        flex-direction: column;
        gap: 0;
        font-family: var(--app-font);
    }

    .lm-list {
        display: flex;
        flex-direction: column;
        gap: 3px;
        max-height: 200px;
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: rgba(102,0,255,0.2) transparent;
        padding: 2px 0;
    }
    .lm-list::-webkit-scrollbar { width: 3px; }
    .lm-list::-webkit-scrollbar-thumb { background: rgba(102,0,255,0.25); border-radius: 2px; }

    .lm-empty {
        font-size: 10px;
        color: var(--app-text-muted);
        font-style: italic;
        padding: 6px 2px;
        text-align: center;
    }

    .lm-row {
        display: flex;
        align-items: center;
        gap: 5px;
        padding: 5px 6px 5px 0;
        border-radius: var(--app-radius-sm);
        background: var(--app-panel-bg);
        border: 1px solid var(--app-border-light);
        cursor: pointer;
        transition: background 0.12s, border-color 0.12s, box-shadow 0.12s;
        overflow: hidden;
        position: relative;
    }
    .lm-row:hover {
        background: #f0f4ff;
        border-color: rgba(102,0,255,0.25);
        box-shadow: 0 1px 4px rgba(102,0,255,0.08);
    }
    .lm-row--active {
        background: linear-gradient(90deg, rgba(102,0,255,0.06) 0%, rgba(139,91,246,0.04) 100%);
        border-color: rgba(102,0,255,0.35);
        box-shadow: 0 1px 5px rgba(102,0,255,0.12);
    }
    .lm-row--active:hover {
        background: linear-gradient(90deg, rgba(102,0,255,0.10) 0%, rgba(139,91,246,0.07) 100%);
    }

    /* Left colour accent bar */
    .lm-accent-bar {
        width: 3px;
        align-self: stretch;
        border-radius: 0 2px 2px 0;
        flex-shrink: 0;
        margin-right: 2px;
    }

    .lm-swatch {
        width: 9px;
        height: 9px;
        border-radius: 50%;
        flex-shrink: 0;
        border: 1.5px solid rgba(255,255,255,0.6);
        box-shadow: 0 0 0 1px rgba(0,0,0,0.12);
    }

    .lm-name-input {
        flex: 1;
        min-width: 0;
        font-size: 10.5px;
        font-weight: 500;
        font-family: var(--app-font);
        border: none;
        background: transparent;
        color: var(--app-text);
        padding: 0;
        outline: none;
        cursor: pointer;
    }
    .lm-name-input:focus {
        cursor: text;
        background: #f0f4ff;
        border-radius: 3px;
        padding: 0 3px;
    }

    /* Floor-to-floor height tag */
    .lm-height-tag {
        font-size: 9px;
        font-weight: 600;
        font-family: var(--app-font);
        font-variant-numeric: tabular-nums;
        color: rgba(102,0,255,0.65);
        background: rgba(102,0,255,0.08);
        border-radius: 4px;
        padding: 1px 4px;
        flex-shrink: 0;
        letter-spacing: 0.02em;
        white-space: nowrap;
    }

    .lm-elev-input {
        width: 48px;
        font-size: 10px;
        font-family: var(--app-font);
        border: 1px solid transparent;
        background: transparent;
        color: var(--app-text-2);
        padding: 0 2px;
        border-radius: 3px;
        outline: none;
        text-align: right;
        font-variant-numeric: tabular-nums;
        cursor: pointer;
        flex-shrink: 0;
    }
    .lm-elev-input:focus {
        cursor: text;
        border-color: rgba(102,0,255,0.3);
        background: #f0f4ff;
    }

    .lm-vis-btn {
        background: none;
        border: none;
        cursor: pointer;
        font-size: 11px;
        padding: 0 1px;
        border-radius: 2px;
        line-height: 1;
        opacity: 0.7;
        flex-shrink: 0;
        transition: opacity 0.1s;
    }
    .lm-vis-btn:hover { opacity: 1; }
    .lm-vis-btn--hidden { opacity: 0.3; }

    .lm-delete-btn {
        background: none;
        border: none;
        color: #e53e3e;
        cursor: pointer;
        font-size: 10px;
        padding: 0 2px;
        border-radius: 2px;
        line-height: 1;
        flex-shrink: 0;
        opacity: 0;
        transition: opacity 0.12s, background 0.12s;
    }
    .lm-row:hover .lm-delete-btn { opacity: 0.8; }
    .lm-delete-btn:hover { opacity: 1 !important; background: #fff0f0; }
    .lm-delete-btn:disabled { opacity: 0.15 !important; cursor: default; }

    .lm-add-btn {
        margin-top: 6px;
        width: 100%;
        padding: 5px 8px;
        font-size: 10px;
        font-weight: 600;
        font-family: var(--app-font);
        border: 1px dashed rgba(102,0,255,0.3);
        border-radius: var(--app-radius-sm);
        background: transparent;
        color: rgba(102,0,255,0.7);
        cursor: pointer;
        transition: background 0.12s, border-color 0.12s, color 0.12s;
        letter-spacing: 0.03em;
    }
    .lm-add-btn:hover {
        background: rgba(102,0,255,0.07);
        border-color: var(--app-accent);
        color: var(--app-accent);
    }
`;

export const GRID_MANAGER_STYLES = `
    .gm-panel {
        display: flex;
        flex-direction: column;
        gap: 0;
        font-family: var(--app-font);
    }

    .gm-list {
        display: flex;
        flex-direction: column;
        gap: 3px;
        max-height: 120px;
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: rgba(102,0,255,0.2) transparent;
        padding: 2px 0;
    }
    .gm-list::-webkit-scrollbar { width: 3px; }
    .gm-list::-webkit-scrollbar-thumb { background: rgba(102,0,255,0.25); border-radius: 2px; }

    .gm-empty {
        font-size: 10px;
        color: var(--app-text-muted);
        font-style: italic;
        padding: 4px 2px;
        text-align: center;
    }

    .gm-row {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 4px 5px;
        border-radius: var(--app-radius-sm);
        background: var(--app-panel-bg);
        border: 1px solid var(--app-border-light);
        transition: background 0.1s, border-color 0.1s;
    }
    .gm-row:hover {
        background: #f0f4ff;
        border-color: rgba(102,0,255,0.2);
    }

    .gm-axis-badge {
        font-size: 9px;
        font-weight: 700;
        padding: 1px 5px;
        border-radius: 4px;
        flex-shrink: 0;
        letter-spacing: 0.05em;
    }
    .gm-axis-badge--x {
        background: rgba(102,0,255,0.12);
        color: #6600FF;
    }
    .gm-axis-badge--y {
        background: rgba(146,0,178,0.12);
        color: #9200B2;
    }

    .gm-pos-input {
        width: 40px;
        font-size: 10px;
        font-family: var(--app-font);
        border: 1px solid transparent;
        background: transparent;
        color: var(--app-text-2);
        padding: 0 2px;
        border-radius: 3px;
        outline: none;
        text-align: right;
        font-variant-numeric: tabular-nums;
    }
    .gm-pos-input:focus {
        border-color: rgba(102,0,255,0.3);
        background: #f0f4ff;
    }

    .gm-name-input {
        flex: 1;
        min-width: 0;
        font-size: 10px;
        font-weight: 500;
        font-family: var(--app-font);
        border: none;
        background: transparent;
        color: var(--app-text);
        padding: 0;
        outline: none;
    }
    .gm-name-input:focus {
        background: #f0f4ff;
        border-radius: 3px;
        padding: 0 3px;
    }

    .gm-vis-btn {
        background: none;
        border: none;
        cursor: pointer;
        font-size: 11px;
        padding: 0 1px;
        border-radius: 2px;
        line-height: 1;
        opacity: 0.7;
        flex-shrink: 0;
        transition: opacity 0.1s;
    }
    .gm-vis-btn:hover { opacity: 1; }
    .gm-vis-btn--hidden { opacity: 0.3; }

    /* §40 §3.4 — pin toggle button */
    .gm-pin-btn {
        background: none;
        border: none;
        cursor: pointer;
        font-size: 11px;
        padding: 0 1px;
        border-radius: 2px;
        line-height: 1;
        opacity: 0.55;
        flex-shrink: 0;
        transition: opacity 0.1s, color 0.1s;
    }
    .gm-pin-btn:hover { opacity: 1; }
    .gm-pin-btn--on   { opacity: 1; color: #d97706; }

    .gm-delete-btn {
        background: none;
        border: none;
        color: #e53e3e;
        cursor: pointer;
        font-size: 10px;
        padding: 0 2px;
        border-radius: 2px;
        line-height: 1;
        flex-shrink: 0;
        opacity: 0;
        transition: opacity 0.12s, background 0.12s;
    }
    .gm-row:hover .gm-delete-btn { opacity: 0.8; }
    .gm-delete-btn:hover { opacity: 1 !important; background: #fff0f0; }

    /* ── SVG grid preview ─────────────────────────────────────────────── */
    .gm-preview-wrap {
        margin-top: 8px;
        display: flex;
        justify-content: center;
        border-radius: 6px;
        overflow: hidden;
        border: 1px solid rgba(102,0,255,0.12);
        background: rgba(240,243,255,0.6);
    }
    .gm-preview-svg {
        display: block;
        width: 100%;
        height: auto;
    }

    /* ── Add form ─────────────────────────────────────────────────────── */
    .gm-add-form {
        display: flex;
        gap: 3px;
        align-items: center;
        margin-top: 8px;
        padding-top: 6px;
        border-top: 1px dashed rgba(102,0,255,0.2);
        flex-wrap: wrap;
    }

    .gm-axis-select {
        font-size: 10px;
        font-family: var(--app-font);
        border: 1px solid var(--app-border);
        border-radius: var(--app-radius-sm);
        padding: 2px 3px;
        background: var(--app-panel-bg);
        color: var(--app-text);
        cursor: pointer;
        flex-shrink: 0;
        width: 34px;
    }

    .gm-add-pos {
        width: 48px;
        font-size: 10px;
        font-family: var(--app-font);
        border: 1px solid var(--app-border);
        border-radius: var(--app-radius-sm);
        padding: 2px 4px;
        background: var(--app-panel-bg);
        color: var(--app-text);
        outline: none;
        text-align: right;
        font-variant-numeric: tabular-nums;
    }
    .gm-add-pos:focus { border-color: var(--app-accent); }

    .gm-add-name {
        flex: 1;
        min-width: 38px;
        font-size: 10px;
        font-family: var(--app-font);
        border: 1px solid var(--app-border);
        border-radius: var(--app-radius-sm);
        padding: 2px 4px;
        background: var(--app-panel-bg);
        color: var(--app-text);
        outline: none;
    }
    .gm-add-name:focus { border-color: var(--app-accent); }

    .gm-add-btn {
        font-size: 10px;
        font-weight: 600;
        font-family: var(--app-font);
        padding: 2px 8px;
        border: 1px solid var(--app-accent);
        border-radius: var(--app-radius-sm);
        color: var(--app-accent);
        background: transparent;
        cursor: pointer;
        transition: background 0.12s, color 0.12s;
        flex-shrink: 0;
        white-space: nowrap;
        letter-spacing: 0.02em;
    }
    .gm-add-btn:hover {
        background: var(--app-accent);
        color: #fff;
    }
`;

export const DIM_OPTIONS_STYLES = `
    /* ─── Bar container ──────────────────────────────────────────────────── */
    .ann-dim-opt-bar {
        position: fixed;
        bottom: 72px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 200;
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        background: rgba(255, 255, 255, 0.97);
        border: 1px solid var(--app-border);
        border-radius: 999px;
        box-shadow: 0 4px 20px rgba(30, 50, 120, 0.14), 0 1px 4px rgba(30, 50, 120, 0.08);
        font-family: var(--app-font);
        pointer-events: auto;
        user-select: none;
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
    }

    /* ─── Tool name label ─────────────────────────────────────────────────── */
    .ann-dim-opt-label {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--app-accent);
        padding: 0 4px;
        white-space: nowrap;
    }

    /* ─── Group label ─────────────────────────────────────────────────────── */
    .ann-dim-opt-group-label {
        font-size: 10px;
        font-weight: 600;
        color: var(--app-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        padding: 0 2px;
    }

    /* ─── Segment group wrapper ───────────────────────────────────────────── */
    .ann-dim-opt-group {
        display: flex;
        align-items: center;
        background: var(--app-bg);
        border-radius: 6px;
        overflow: hidden;
        border: 1px solid var(--app-border);
        gap: 0;
    }

    /* ─── Segment button ──────────────────────────────────────────────────── */
    .ann-dim-opt-seg {
        padding: 3px 10px;
        font-size: 11px;
        font-weight: 500;
        color: var(--app-text-2);
        background: transparent;
        border: none;
        cursor: pointer;
        line-height: 1.6;
        white-space: nowrap;
        transition: background 0.12s ease, color 0.12s ease;
        font-family: var(--app-font);
    }
    .ann-dim-opt-seg:hover {
        background: var(--app-violet-soft);
        color: var(--app-accent);
    }
    .ann-dim-opt-seg + .ann-dim-opt-seg {
        border-left: 1px solid var(--app-border);
    }

    /* ─── Active segment ──────────────────────────────────────────────────── */
    .ann-dim-opt-seg.ann-dim-opt-seg--active {
        background: var(--app-gradient);
        color: #ffffff;
        font-weight: 700;
    }
    .ann-dim-opt-seg.ann-dim-opt-seg--active:hover {
        background: var(--app-gradient);
        color: #ffffff;
    }

    /* ─── Divider between groups ──────────────────────────────────────────── */
    .ann-dim-opt-divider {
        width: 1px;
        height: 18px;
        background: var(--app-border);
        flex-shrink: 0;
        margin: 0 2px;
    }

    /* ─── §C3 Lock button ─────────────────────────────────────────────────── */
    .ann-dim-opt-lock {
        padding: 2px 8px;
        font-size: 14px;
        background: transparent;
        border: 1px solid var(--app-border);
        border-radius: 6px;
        cursor: pointer;
        line-height: 1.4;
        transition: background 0.12s ease, border-color 0.12s ease;
        font-family: var(--app-font);
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .ann-dim-opt-lock:hover {
        background: var(--app-violet-soft);
        border-color: var(--app-accent);
    }
    .ann-dim-opt-lock.ann-dim-opt-lock--active {
        background: var(--app-gradient);
        border-color: var(--app-accent);
        box-shadow: 0 0 0 2px rgba(102,0,255,0.25);
    }

    /* ─── §DIM-VI-2 String-mode toggle (ann-dim-str-* prefix) ───────────── */
    .ann-dim-str-toggle {
        padding: 2px 10px;
        font-size: 11px;
        font-weight: 600;
        background: transparent;
        border: 1px solid var(--app-border);
        border-radius: 6px;
        cursor: pointer;
        color: var(--app-text-2);
        line-height: 1.6;
        transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
        font-family: var(--app-font);
        white-space: nowrap;
        letter-spacing: 0.02em;
    }
    .ann-dim-str-toggle:hover {
        background: var(--app-violet-soft);
        border-color: var(--app-accent);
        color: var(--app-accent);
    }
    .ann-dim-str-toggle.ann-dim-str-toggle--active {
        background: var(--app-gradient);
        border-color: var(--app-accent);
        color: #ffffff;
        box-shadow: 0 0 0 2px rgba(102,0,255,0.22);
    }
    .ann-dim-str-toggle.ann-dim-str-toggle--active:hover {
        background: var(--app-gradient);
        color: #ffffff;
    }

    /* ─── §DIM-VI-4 EQ toggle (ann-dim-str-* namespace, eq sub-key) ─────── */
    .ann-dim-str-eq-toggle {
        padding: 2px 10px;
        font-size: 11px;
        font-weight: 700;
        font-style: italic;
        background: transparent;
        border: 1px solid var(--app-border);
        border-radius: 6px;
        cursor: pointer;
        color: var(--app-text-2);
        line-height: 1.6;
        transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
        font-family: var(--app-font);
        white-space: nowrap;
    }
    .ann-dim-str-eq-toggle:hover {
        background: var(--app-violet-soft);
        border-color: var(--app-accent);
        color: var(--app-accent);
    }
    .ann-dim-str-eq-toggle.ann-dim-str-eq-toggle--active {
        background: var(--app-gradient);
        border-color: var(--app-accent);
        color: #ffffff;
        box-shadow: 0 0 0 2px rgba(102,0,255,0.22);
    }

    /* ─── §C4 Constraint violation toast ─────────────────────────────────── */
    .ann-constr-toast {
        position: fixed;
        bottom: 140px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 300;
        padding: 8px 18px;
        border-radius: 8px;
        font-family: var(--app-font);
        font-size: 13px;
        font-weight: 600;
        pointer-events: none;
        white-space: nowrap;
        animation: ann-constr-toast-in 0.2s ease;
    }
    .ann-constr-toast--satisfied {
        background: #059669;
        color: #fff;
    }
    .ann-constr-toast--violated {
        background: #dc2626;
        color: #fff;
    }
    @keyframes ann-constr-toast-in {
        from { opacity: 0; transform: translateX(-50%) translateY(6px); }
        to   { opacity: 1; transform: translateX(-50%) translateY(0); }
    }
`;

