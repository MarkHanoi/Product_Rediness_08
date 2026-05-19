/**
 * @file src/styles/panels/constructionPanels.ts
 *
 * CSS for Curtain Wall tool panel and Floor Plan Import panel.
 * CONTRACT §05 §2 — CSS layer only, zero logic.
 */
export const CURTAIN_WALL_STYLES = `
    /* ─── Shared section elements ─────────────────────────────────────── */
    .cw-grid-editor,
    .cw-panel-editor {
        margin-top: 12px;
        border-top: 1px solid var(--app-border);
        padding-top: 10px;
        font-family: var(--app-font);
    }

    .cw-section-title-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 6px;
    }

    .cw-section-label {
        font-size: 10px;
        font-weight: 700;
        color: var(--app-text-2);
        text-transform: uppercase;
        letter-spacing: 0.06em;
    }

    /* ─── Grid summary ─────────────────────────────────────────────────── */
    .cw-grid-summary {
        font-size: 11px;
        color: var(--app-text-muted);
        margin-bottom: 8px;
        padding: 4px 6px;
        background: var(--app-border-light);
        border-radius: var(--app-radius-sm);
    }

    /* ─── Axis section ─────────────────────────────────────────────────── */
    .cw-axis-section {
        margin-bottom: 8px;
    }

    .cw-axis-label {
        font-size: 10px;
        font-weight: 600;
        color: var(--app-text-2);
        margin-bottom: 4px;
        padding: 2px 0;
        border-bottom: 1px solid var(--app-border-light);
    }

    .cw-empty-note {
        font-size: 10px;
        color: var(--app-text-muted);
        font-style: italic;
        padding: 2px 4px;
    }

    /* ─── Grid line row ────────────────────────────────────────────────── */
    .cw-line-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 3px 4px;
        border-radius: var(--app-radius-sm);
        background: var(--app-panel-bg);
        margin-bottom: 2px;
        border: 1px solid var(--app-border-light);
    }

    .cw-t-label {
        font-size: 11px;
        font-family: var(--app-font);
        color: var(--app-text);
    }

    .cw-remove-btn {
        background: none;
        border: none;
        color: var(--app-status-error);
        cursor: pointer;
        font-size: 14px;
        line-height: 1;
        padding: 0 2px;
        border-radius: 3px;
        transition: background 0.1s, color 0.1s;
    }
    .cw-remove-btn:hover {
        background: #fff5f5;
        color: #c62828;
    }

    /* ─── Add-line form ────────────────────────────────────────────────── */
    .cw-add-row {
        display: flex;
        gap: 4px;
        align-items: center;
        margin-top: 6px;
        padding-top: 6px;
        border-top: 1px solid var(--app-border-light);
    }

    .cw-axis-select {
        font-size: 10px;
        border: 1px solid var(--app-border);
        border-radius: var(--app-radius-sm);
        padding: 3px 4px;
        color: var(--app-text);
        background: var(--app-panel-bg);
        flex-shrink: 0;
        cursor: pointer;
    }

    .cw-t-input {
        font-size: 11px;
        border: 1px solid var(--app-border);
        border-radius: var(--app-radius-sm);
        padding: 3px 5px;
        width: 52px;
        color: var(--app-text);
        background: var(--app-panel-bg);
        flex-shrink: 0;
    }

    .cw-add-btn {
        font-size: 10px;
        font-weight: 600;
        padding: 3px 8px;
        border: 1px solid var(--app-accent);
        border-radius: var(--app-radius-sm);
        color: var(--app-accent);
        background: var(--app-panel-bg);
        cursor: pointer;
        transition: background 0.12s, color 0.12s;
        white-space: nowrap;
        flex-shrink: 0;
    }
    .cw-add-btn:hover {
        background: var(--app-accent);
        color: #fff;
    }

    /* ─── Panel editor: legend ─────────────────────────────────────────── */
    .cw-legend {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-bottom: 8px;
    }

    .cw-legend-item {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 10px;
        color: var(--app-text-2);
    }

    .cw-legend-dot {
        width: 10px;
        height: 10px;
        border-radius: 2px;
        border: 1px solid rgba(0,0,0,0.12);
        display: inline-block;
        flex-shrink: 0;
    }

    /* ─── Panel grid ───────────────────────────────────────────────────── */
    .cw-panel-grid-container {
        border: 1px solid var(--app-border);
        border-radius: var(--app-radius-sm);
        overflow: hidden;
        margin-bottom: 4px;
    }

    .cw-panel-grid {
        display: grid;
        gap: 1px;
        background: var(--app-border);
    }

    .cw-panel-cell {
        aspect-ratio: 1 / 1;
        min-height: 18px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: filter 0.1s;
        position: relative;
    }
    .cw-panel-cell:hover {
        filter: brightness(0.88);
    }

    .cw-cell-badge {
        font-size: 9px;
        font-weight: 700;
        color: rgba(0,0,0,0.5);
        user-select: none;
        pointer-events: none;
    }

    .cw-panel-hint {
        font-size: 9px;
        color: var(--app-text-muted);
        text-align: center;
        padding: 3px 0 2px;
    }

    /* ─── Panel type popover ───────────────────────────────────────────── */
    .cw-type-popover {
        position: absolute;
        z-index: 9999;
        background: var(--app-panel-bg);
        border: 1px solid var(--app-border);
        border-radius: var(--app-radius-md);
        box-shadow: var(--app-shadow-card);
        padding: 4px;
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 110px;
    }

    .cw-type-option {
        font-size: 11px;
        padding: 5px 8px;
        border: none;
        border-radius: var(--app-radius-sm);
        background: transparent;
        cursor: pointer;
        text-align: left;
        color: var(--app-text);
        display: flex;
        align-items: center;
        transition: background 0.1s;
        font-family: var(--app-font);
    }
    .cw-type-option:hover {
        background: var(--app-border-light);
    }
    .cw-type-option--selected {
        background: var(--app-border-light);
        font-weight: 600;
        color: var(--app-accent);
    }

    /* ─── Pre-draw panel field row ─────────────────────────────────────── */
    .cw-predraw-field {
        display: flex;
        flex-direction: column;
        gap: 3px;
        margin-bottom: 8px;
    }

    .cw-predraw-label {
        font-size: 9px;
        font-weight: 600;
        color: rgba(255,255,255,0.65);
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .cw-predraw-input {
        font-size: 12px;
        padding: 5px 8px;
        border: 1px solid rgba(255,255,255,0.25);
        border-radius: var(--app-radius-sm);
        background: rgba(255,255,255,0.15);
        color: #fff;
        width: 100%;
        box-sizing: border-box;
        font-family: var(--app-font);
    }
    .cw-predraw-input::placeholder {
        color: rgba(255,255,255,0.35);
    }
    .cw-predraw-input:focus {
        outline: none;
        border-color: rgba(255,255,255,0.5);
        background: rgba(255,255,255,0.22);
    }
`;

export const FLOOR_PLAN_IMPORT_STYLES = `
    /* ─── Panel container ───────────────────────────────────────────────── */
    .fp-panel {
        width: 300px;
        background: var(--app-bg);
        border: none;
        border-radius: var(--app-radius-lg);
        display: flex;
        flex-direction: column;
        pointer-events: auto;
        box-shadow: var(--app-shadow-panel);
        z-index: 10;
        overflow: hidden;
        height: fit-content;
        max-height: 80vh;
        font-family: var(--app-font);
        color: var(--app-text);
        transition: width 0.25s ease;
    }

    /* ─── Detection Preview expanded state ──────────────────────────────── */
    /* Applied only while fp-step-debug is visible. Other steps are unaffected. */
    .fp-panel--debug-preview {
        width: 680px;
        max-height: 90vh;
    }

    /* ─── Header ────────────────────────────────────────────────────────── */
    .fp-header {
        background: var(--app-gradient);
        padding: 10px 12px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        box-shadow: var(--app-shadow-header);
        flex-shrink: 0;
    }
    .fp-header-title {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #fff;
    }
    .fp-close-btn {
        background: rgba(255,255,255,0.2);
        border: none;
        color: #fff;
        border-radius: 50%;
        width: 22px;
        height: 22px;
        cursor: pointer;
        font-size: 11px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: var(--app-font);
    }
    .fp-close-btn:hover { background: rgba(255,255,255,0.35); }

    /* ─── Step indicator bar ────────────────────────────────────────────── */
    .fp-step-bar {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 8px 12px;
        background: var(--app-panel-bg);
        border-bottom: 1px solid var(--app-border);
        flex-shrink: 0;
        gap: 2px;
    }
    .fp-ind-wrap { display: flex; align-items: center; }
    .fp-ind {
        width: 22px;
        height: 22px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        font-weight: 700;
        font-family: var(--app-font);
        transition: background 0.2s;
    }
    .fp-ind-sep {
        width: 14px;
        height: 1px;
        background: var(--app-border);
        flex-shrink: 0;
    }

    /* ─── Status bar ────────────────────────────────────────────────────── */
    .fp-status {
        font-size: 10px;
        padding: 4px 12px;
        min-height: 18px;
        color: var(--app-text-2);
        background: var(--app-bg);
        border-bottom: 1px solid var(--app-border-light);
        font-family: var(--app-font);
        flex-shrink: 0;
    }

    /* ─── Step content areas ─────────────────────────────────────────────── */
    .fp-step {
        padding: 12px;
        gap: 8px;
        overflow-y: auto;
        flex: 1;
        scrollbar-width: thin;
        scrollbar-color: #c4cde0 transparent;
    }
    .fp-step-title {
        font-size: 11px;
        font-weight: 700;
        color: var(--app-text);
        margin-bottom: 4px;
        font-family: var(--app-font);
    }

    /* ─── Form elements ──────────────────────────────────────────────────── */
    .fp-field {
        display: flex;
        flex-direction: column;
        gap: 3px;
    }
    .fp-label {
        font-size: 10px;
        font-weight: 600;
        color: var(--app-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        font-family: var(--app-font);
    }
    .fp-input, .fp-select {
        font-size: 12px;
        padding: 5px 8px;
        border: 1px solid var(--app-border);
        border-radius: var(--app-radius-sm);
        background: var(--app-panel-bg);
        color: var(--app-text);
        width: 100%;
        box-sizing: border-box;
        font-family: var(--app-font);
    }
    .fp-input:focus, .fp-select:focus {
        outline: none;
        border-color: var(--app-accent);
    }
    .fp-file-input {
        font-size: 11px;
        padding: 4px;
        border: 1px dashed var(--app-border);
        border-radius: var(--app-radius-sm);
        background: #f8faff;
        color: var(--app-text);
        width: 100%;
        box-sizing: border-box;
        cursor: pointer;
        font-family: var(--app-font);
    }
    .fp-slider {
        width: 100%;
        accent-color: var(--app-accent);
    }
    .fp-filename {
        font-size: 11px;
        color: var(--app-text-2);
        font-family: var(--app-font);
    }
    .fp-thumbnail {
        width: 100%;
        border-radius: var(--app-radius-sm);
        border: 1px solid var(--app-border);
        max-height: 120px;
        object-fit: contain;
        background: #f0f0f0;
        margin-top: 4px;
    }

    /* ─── Buttons ────────────────────────────────────────────────────────── */
    .fp-btn {
        font-size: 11px;
        font-weight: 600;
        padding: 7px 12px;
        border: none;
        border-radius: var(--app-radius-sm);
        cursor: pointer;
        background: var(--app-gradient);
        color: #fff;
        text-align: center;
        font-family: var(--app-font);
        transition: opacity 0.15s;
        flex: 1;
    }
    .fp-btn:hover { opacity: 0.88; }
    .fp-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .fp-btn--secondary {
        background: var(--app-panel-bg);
        color: var(--app-text-2);
        border: 1px solid var(--app-border);
        flex: 0 0 auto;
    }
    .fp-btn--secondary:hover { background: #f7f9ff; }
    .fp-btn--danger {
        background: var(--app-status-error);
        color: #fff;
        border-color: transparent;
    }
    .fp-row-btns {
        display: flex;
        gap: 6px;
        align-items: center;
    }

    /* ─── Checkboxes ─────────────────────────────────────────────────────── */
    .fp-check-group {
        display: flex;
        flex-direction: column;
        gap: 5px;
    }
    .fp-check-label {
        font-size: 11px;
        color: var(--app-text);
        display: flex;
        align-items: center;
        gap: 6px;
        cursor: pointer;
        font-family: var(--app-font);
    }
    .fp-check-label input[type="checkbox"] {
        accent-color: var(--app-accent);
    }

    /* ─── Hints ──────────────────────────────────────────────────────────── */
    .fp-hint {
        font-size: 10px;
        color: var(--app-text-2);
        background: #f4f7fc;
        border-radius: var(--app-radius-sm);
        padding: 6px 8px;
        font-family: var(--app-font);
        line-height: 1.4;
    }

    /* ─── Ruler (Phase B — two-point scale calibration) ─────────────────── */
    .fp-ruler-wrap {
        position: relative;
        display: block;
        width: 100%;
        border-radius: var(--app-radius-sm);
        overflow: hidden;
        border: 1px solid var(--app-border);
        background: #f0f0f0;
        cursor: crosshair;
    }
    .fp-ruler-img {
        display: block;
        width: 100%;
        height: auto;
        user-select: none;
        pointer-events: none;
    }
    .fp-ruler-canvas {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        cursor: crosshair;
    }
    /* Success tint for scale-detection notification */
    .fp-hint--success {
        background: #e8f5e9;
        color: #1b5e20;
    }
    /* Collapsible details for manual override */
    .fp-details {
        border: 1px solid var(--app-border);
        border-radius: var(--app-radius-sm);
        padding: 4px 8px;
        font-family: var(--app-font);
    }
    .fp-details[open] {
        padding-bottom: 8px;
    }
    .fp-details summary {
        font-size: 10px;
        color: var(--app-text-2);
        outline: none;
        list-style: none;
    }
    .fp-details summary::-webkit-details-marker { display: none; }

    /* ─── Summary list ───────────────────────────────────────────────────── */
    .fp-summary-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
        max-height: 200px;
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: #c4cde0 transparent;
    }
    .fp-summary-group {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 4px 6px;
        background: var(--app-panel-bg);
        border-radius: var(--app-radius-sm);
        border: 1px solid var(--app-border);
    }
    .fp-summary-label {
        font-size: 10px;
        font-weight: 700;
        color: var(--app-text);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        font-family: var(--app-font);
    }
    .fp-summary-count {
        font-size: 10px;
        font-weight: 700;
        background: var(--app-accent);
        color: #fff;
        border-radius: 10px;
        padding: 0 6px;
        font-family: var(--app-font);
    }
    .fp-summary-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 3px 6px;
        font-size: 10px;
        color: var(--app-text-2);
        font-family: var(--app-font);
        border-bottom: 1px solid var(--app-border-light);
    }
    .fp-summary-rationale { flex: 1; }
    .fp-summary-conf { font-weight: 700; font-size: 9px; flex-shrink: 0; margin-left: 6px; }
`;

