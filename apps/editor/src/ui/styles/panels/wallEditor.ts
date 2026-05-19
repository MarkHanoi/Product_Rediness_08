/**
 * @file src/styles/panels/wallEditor.ts
 *
 * CSS for Wall Layer Editor, Wall Type Selector, and layout extras.
 * CONTRACT §05 §2 — CSS layer only, zero logic.
 */
export const WALL_LAYER_EDITOR_STYLES = `
    .wle-wrap {
        margin-top: 10px;
        border-top: 1px solid var(--app-border);
        padding-top: 8px;
    }
    .wle-title-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 6px;
    }
    .wle-title {
        font-size: 10px;
        font-weight: 700;
        color: var(--app-text-2);
        text-transform: uppercase;
        letter-spacing: 0.06em;
    }
    .wle-add-btn {
        font-size: 10px;
        padding: 2px 8px;
        border: 1px solid var(--app-accent);
        border-radius: 4px;
        color: var(--app-accent);
        background: transparent;
        cursor: pointer;
    }
    .wle-add-btn:hover { background: var(--app-violet-soft); }
    .wle-col-header {
        display: grid;
        grid-template-columns: 16px 1fr 90px 48px 20px;
        gap: 3px;
        padding: 0 2px 3px;
        border-bottom: 1px solid var(--app-border);
        margin-bottom: 3px;
    }
    .wle-col-label {
        font-size: 9px;
        font-weight: 700;
        color: var(--app-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }
    .wle-row {
        display: grid;
        grid-template-columns: 16px 1fr 90px 48px 20px;
        gap: 3px;
        align-items: center;
        margin-bottom: 3px;
    }
    .wle-color-pick {
        width: 14px;
        height: 14px;
        border: none;
        padding: 0;
        cursor: pointer;
        border-radius: 2px;
    }
    .wle-input {
        font-size: 11px;
        border: 1px solid var(--app-border);
        border-radius: 3px;
        padding: 2px 4px;
        width: 100%;
        box-sizing: border-box;
    }
    .wle-input--num { text-align: right; }
    .wle-remove-btn {
        font-size: 13px;
        border: none;
        background: none;
        color: var(--app-status-error);
        cursor: pointer;
        padding: 0;
        line-height: 1;
    }
    .wle-total-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 5px 2px 2px;
        border-top: 1px solid var(--app-border);
        margin-top: 4px;
        font-size: 11px;
        font-weight: 600;
        color: var(--app-text-2);
    }
    .wle-total-val  { color: var(--app-accent); font-weight: 700; }
    .wle-save-btn {
        margin-top: 8px;
        width: 100%;
        padding: 6px;
        font-size: 11px;
        font-weight: 600;
        border: none;
        border-radius: 5px;
        background: var(--app-gradient);
        color: #fff;
        cursor: pointer;
        transition: filter 0.15s;
    }
    .wle-save-btn:hover { filter: brightness(1.1); }
`;

export const WALL_TYPE_SELECTOR_STYLES = `
    .wts-outer { margin-bottom: 6px; }
    .wts-label {
        font-size: 10px;
        color: rgba(255,255,255,0.7);
        font-weight: 600;
        margin-bottom: 4px;
        letter-spacing: 0.05em;
        text-transform: uppercase;
    }
    .wts-row { display: flex; align-items: center; gap: 6px; }
    .wts-select {
        flex: 1;
        font-size: 11px;
        padding: 4px 8px;
        border-radius: 6px;
        border: none;
        background: rgba(255,255,255,0.15);
        color: #fff;
        cursor: pointer;
        outline: none;
        min-width: 0;
    }
    .wts-strip {
        display: flex;
        height: 8px;
        width: 44px;
        border-radius: 3px;
        overflow: hidden;
        gap: 1px;
        flex-shrink: 0;
    }
    .wts-apply-btn {
        font-size: 10px;
        padding: 4px 10px;
        background: rgba(255,255,255,0.2);
        border: 1px solid rgba(255,255,255,0.35);
        border-radius: 5px;
        color: #fff;
        cursor: pointer;
        white-space: nowrap;
        flex-shrink: 0;
        transition: background 0.1s;
    }
    .wts-apply-btn:hover { background: rgba(255,255,255,0.35); }
    .wts-opt-dark    { background: var(--app-dark-blue); color: #fff; }
    .wts-opt-action  { background: var(--app-dark-blue); color: var(--app-violet-1); }
    .wts-opt-sep     { background: var(--app-dark-blue); color: rgba(255,255,255,0.4); }
`;

export const LAYOUT_EXTRAS_STYLES = `
    /* ── Create-panel navigation header (back-nav for sub-panels) ────────── */
    .ci-nav-header {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 0.5rem;
        padding: 0 0.2rem;
    }
    .ci-back-btn {
        background: none;
        border: none;
        cursor: pointer;
        padding: 0;
        display: flex;
        align-items: center;
        color: var(--app-text-2);
    }
    .ci-nav-title { font-size: 0.7rem; font-weight: 600; color: var(--app-text); }
    /* ── Create-panel item grid ─────────────────────────────────────────── */
    .ci-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.4rem; }
    .ci-carousel-placeholder {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 1.5rem 0.5rem;
        text-align: center;
        color: var(--app-text-muted);
        gap: 0.6rem;
        font-size: 0.62rem;
        line-height: 1.5;
    }
    /* ── Create-panel item cell ─────────────────────────────────────────── */
    .create-item-grid-element {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.3rem;
        padding: 0.5rem 0.2rem;
        background: var(--app-panel-bg);
        border: 1px solid var(--app-border-light);
        border-radius: 6px;
        cursor: pointer;
        transition: background 0.2s, border-color 0.2s;
    }
    .create-item-grid-element:hover {
        background: var(--app-bg);
        border-color: var(--app-border);
    }
    .create-item-grid-element--disabled {
        opacity: 0.5;
        pointer-events: none;
        cursor: default;
    }
    .ci-item-icon  { font-size: 1.2rem; color: var(--app-text-2); }
    .ci-item-icon--svg { width: 1.6rem; height: 1.6rem; display: flex; align-items: center; justify-content: center; }
    .ci-item-icon--svg svg { display: block; }
    .ci-item-label { font-size: 0.6rem; text-align: center; color: var(--app-text); font-weight: 500; line-height: 1.1; }
    /* ── Create-panel discipline sections (cr- prefix, Phase 3) ────────── */
    .cr-discipline-sections {
        display: flex;
        flex-direction: column;
        padding: 4px 8px 8px;
        gap: 0;
    }
    .cr-section {
        display: flex;
        flex-direction: column;
    }
    .cr-section-hdr {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 2px 5px;
        user-select: none;
        border-bottom: 1px solid var(--app-border-light, #e8ecf4);
        margin-bottom: 6px;
    }
    .cr-section-hdr:first-child,
    .cr-section:first-child .cr-section-hdr {
        padding-top: 4px;
    }
    .cr-section-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0.55;
        flex-shrink: 0;
    }
    .cr-section-label {
        font-size: 9px;
        font-weight: 800;
        letter-spacing: 0.09em;
        text-transform: uppercase;
        color: var(--app-text-muted, #888);
    }
    .cr-tool-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 4px;
        margin-bottom: 8px;
    }
    .cr-tool-cell {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-start;
        gap: 3px;
        padding: 6px 2px 5px;
        background: var(--app-panel-bg);
        border: 1px solid var(--app-border-light, #e8ecf4);
        border-radius: 6px;
        cursor: pointer;
        transition: background 0.15s, border-color 0.15s;
        min-width: 0;
    }
    .cr-tool-cell:hover {
        background: #f0f4ff;
        border-color: var(--app-accent, #6600ff);
    }
    .cr-tool-cell--active {
        background: var(--app-violet-soft, #f0eaff);
        border-color: var(--app-accent, #6600ff);
    }
    .cr-tool-cell--disabled {
        opacity: 0.38;
        pointer-events: none;
        cursor: default;
    }
    .cr-tool-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--app-text-2, #5a6475);
        flex-shrink: 0;
    }
    .cr-tool-label {
        font-size: 9px;
        text-align: center;
        color: var(--app-text, #1a2033);
        font-weight: 500;
        line-height: 1.15;
        white-space: normal;
        overflow: hidden;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        width: 100%;
    }
    /* ── Floating layer-container panels ───────────────────────────────── */
    .lt-float-panel {
        display: none;
        position: absolute;
        bottom: 12px;
        left: 224px;
        width: 320px;
        height: auto;
        max-height: 60vh;
        background: var(--app-panel-bg);
        border: 1px solid var(--app-border);
        border-radius: var(--app-radius-md);
        flex-direction: column;
        pointer-events: auto;
        box-shadow: var(--app-shadow-card);
        z-index: 10;
        overflow: hidden;
    }
    .lt-float-panel--sm   { width: 300px; }
    .lt-float-panel--tree {
        height: 400px;
        box-shadow: var(--app-shadow-panel);
        z-index: 100001;
    }
    /* ── Wall type picker (createWallTypePicker in Layout.ts) ───────────── */
    .lt-wtp-wrap  { padding: 8px 12px 4px; border-bottom: 1px solid var(--app-border-light); }
    .lt-wtp-label {
        font-size: 10px;
        font-weight: 600;
        color: var(--app-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: 6px;
    }
    .lt-wtp-select {
        width: 100%;
        font-size: 12px;
        padding: 5px 28px 5px 8px;
        border: 1px solid var(--app-border);
        border-radius: 6px;
        background: var(--app-panel-bg);
        color: var(--app-text);
        cursor: pointer;
        outline: none;
        appearance: none;
        -webkit-appearance: none;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24'%3E%3Cpath fill='%23666' d='M7 10l5 5 5-5z'/%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: right 8px center;
    }
    .lt-wtp-strip {
        display: flex;
        height: 6px;
        border-radius: 3px;
        overflow: hidden;
        margin-top: 5px;
        gap: 1px;
    }
    .lt-wtp-badge {
        font-size: 10px;
        color: var(--app-success);
        margin-top: 3px;
        opacity: 0;
        transition: opacity 0.3s;
    }
`;

