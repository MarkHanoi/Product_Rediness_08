/**
 * @file src/styles/panels/visibilityGraphics.ts
 *
 * CSS for the Visibility & Graphics panel (vg- prefix).
 * CONTRACT §05 §2 — CSS layer only, zero logic.
 */
export const VISIBILITY_GRAPHICS_STYLES = `
    /* ─── Panel container ──────────────────────────────────────────────── */
    .vg-panel {
        position: fixed;
        top: 60px;
        left: 50%;
        transform: translateX(-50%);
        width: 680px;
        max-width: calc(100vw - 32px);
        max-height: calc(100vh - 80px);
        background: var(--app-bg);
        border-radius: var(--app-radius-lg);
        box-shadow: var(--app-shadow-panel);
        display: flex;
        flex-direction: column;
        z-index: 2000;
        overflow: hidden;
        font-family: var(--app-font);
        color: var(--app-text);
        pointer-events: auto;
    }
    /* Drag-active state — applied/removed by makeDraggable */
    .vg-panel--dragging { user-select: none; }
    .vg-panel--dragging .vg-header { cursor: grabbing; }

    /* ─── Header ─────────────────────────────────────────────────────── */
    .vg-header {
        background: var(--app-gradient);
        padding: 10px 14px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        box-shadow: var(--app-shadow-header);
        flex-shrink: 0;
        cursor: grab;
    }
    .vg-header-title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.07em;
        text-transform: uppercase;
        color: #fff;
    }
    .vg-header-icon { font-size: 14px; }
    .vg-close-btn {
        background: rgba(255,255,255,0.18);
        border: 1px solid rgba(255,255,255,0.28);
        border-radius: 50%;
        color: #fff;
        width: 22px;
        height: 22px;
        cursor: pointer;
        font-size: 11px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: var(--app-font);
    }
    .vg-close-btn:hover { background: rgba(255,255,255,0.32); }

    /* ─── Tabs ───────────────────────────────────────────────────────── */
    .vg-tabs {
        display: flex;
        background: var(--app-panel-bg);
        border-bottom: 1px solid var(--app-border);
        flex-shrink: 0;
    }
    .vg-tab {
        flex: 1;
        padding: 8px 0;
        background: none;
        border: none;
        font-size: 11px;
        font-weight: 600;
        color: var(--app-text-2);
        cursor: pointer;
        text-align: center;
        letter-spacing: 0.04em;
        border-bottom: 2px solid transparent;
        transition: color 0.12s, border-color 0.12s;
        font-family: var(--app-font);
    }
    .vg-tab:hover { color: var(--app-accent); }
    .vg-tab--active {
        color: var(--app-accent);
        border-bottom-color: var(--app-accent);
    }

    /* ─── Body ───────────────────────────────────────────────────────── */
    .vg-body {
        flex: 1;
        overflow-y: auto;
        padding: 12px;
        scrollbar-width: thin;
        scrollbar-color: #c4cde0 transparent;
    }
    .vg-body::-webkit-scrollbar { width: 4px; }
    .vg-body::-webkit-scrollbar-thumb { background: #c4cde0; border-radius: 2px; }

    .ov-panel {
        width: 460px;
    }

    .ov-body {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .ov-meta {
        font-size: 10px;
        color: var(--app-text-muted);
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    }

    .ov-section {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding-bottom: 10px;
        border-bottom: 1px solid var(--app-border);
    }
    .ov-section:last-of-type { border-bottom: none; padding-bottom: 0; }

    .ov-section-title {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.07em;
        text-transform: uppercase;
        color: var(--app-text-2);
    }

    .ov-intent-row {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .ov-intent-select {
        flex: 1;
        font-size: 12px;
        padding: 6px 8px;
        background: var(--app-panel-bg);
        color: var(--app-text);
        border: 1px solid var(--app-border);
        border-radius: var(--app-radius-md);
        font-family: var(--app-font);
    }

    .ov-intent-badge {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        padding: 4px 8px;
        border-radius: 999px;
        background: rgba(16,185,129,0.12);
        border: 1px solid rgba(16,185,129,0.30);
        color: #047857;
    }
    .ov-intent-badge--custom {
        background: rgba(249,115,22,0.12);
        border-color: rgba(249,115,22,0.30);
        color: #9a3412;
    }

    .ov-intent-desc {
        font-size: 11px;
        color: var(--app-text-muted);
        line-height: 1.4;
    }

    .ov-isolate-note {
        padding: 8px 10px;
        border-radius: 8px;
        background: rgba(249,115,22,0.10);
        border: 1px solid rgba(249,115,22,0.20);
        color: #9a3412;
        font-size: 11px;
        font-weight: 700;
    }

    .ov-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .ov-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 8px 10px;
        border-radius: var(--app-radius-md);
        background: var(--app-panel-bg);
        box-shadow: var(--app-shadow-card);
    }

    .ov-row div {
        display: flex;
        flex-direction: column;
        min-width: 0;
    }

    .ov-row b {
        font-size: 11px;
        color: var(--app-text);
        text-transform: uppercase;
        letter-spacing: 0.04em;
    }

    .ov-row span {
        font-size: 10px;
        color: var(--app-text-muted);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 260px;
    }

    .ov-row button,
    .ov-clear-all,
    .ov-promote {
        border: 1px solid rgba(102,0,255,0.18);
        background: #fff;
        color: var(--app-accent);
        border-radius: 7px;
        padding: 5px 9px;
        font-size: 10px;
        font-weight: 700;
        cursor: pointer;
    }

    .ov-actions {
        display: flex;
        gap: 8px;
        align-items: center;
        flex-wrap: wrap;
    }

    .ov-promote {
        background: linear-gradient(135deg,#10b981,#059669);
        color: #fff;
        border-color: rgba(16,185,129,0.35);
    }

    .ov-clear-all:disabled,
    .ov-promote:disabled {
        opacity: 0.45;
        cursor: not-allowed;
    }

    .vi-panel {
        width: 860px;
    }

    .vi-shell {
        display: grid;
        grid-template-columns: 250px 1fr;
        min-height: 440px;
        background: var(--app-bg);
    }

    .vi-sidebar {
        border-right: 1px solid var(--app-border);
        background: var(--app-panel-bg);
        padding: 10px;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .vi-intent-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
        overflow-y: auto;
    }

    .vi-intent-row {
        border: 1px solid var(--app-border);
        border-radius: 8px;
        background: #fff;
        color: var(--app-text);
        padding: 8px 9px;
        text-align: left;
        cursor: pointer;
        font-family: var(--app-font);
        font-size: 11px;
        font-weight: 700;
    }

    .vi-intent-row--active {
        border-color: var(--app-accent);
        box-shadow: 0 0 0 2px rgba(102,0,255,0.10);
        color: var(--app-accent);
    }

    .vi-main {
        display: flex;
        flex-direction: column;
        min-width: 0;
    }

    .vi-toolbar {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px;
        border-bottom: 1px solid var(--app-border);
    }

    .vi-input,
    .vi-select,
    .vi-textarea {
        border: 1px solid var(--app-border);
        border-radius: 7px;
        padding: 6px 8px;
        font-size: 11px;
        font-family: var(--app-font);
        color: var(--app-text);
        background: #fff;
    }

    .vi-textarea { min-height: 48px; resize: vertical; }

    .vi-tabbar {
        display: flex;
        gap: 0;
        border-bottom: 1px solid var(--app-border);
        background: #fff;
    }

    .vi-tab {
        border: none;
        background: transparent;
        color: var(--app-text-2);
        padding: 8px 12px;
        font-size: 11px;
        font-weight: 800;
        cursor: pointer;
        font-family: var(--app-font);
        border-bottom: 2px solid transparent;
    }

    .vi-tab--active {
        color: var(--app-accent);
        border-bottom-color: var(--app-accent);
    }

    .vi-editor {
        padding: 12px;
        overflow-y: auto;
    }

    .vi-grid {
        display: grid;
        grid-template-columns: 170px 1fr;
        gap: 12px;
        align-items: start;
    }

    .vi-element-list {
        display: flex;
        flex-direction: column;
        gap: 5px;
        max-height: 360px;
        overflow-y: auto;
    }

    /* Wave 11 / UI-fix — Element-Rules right pane.
       Wraps the mass-edit toolbar + 2D form + 3D Surface section into ONE
       grid item so the appearance fields render in column 2 instead of
       wrapping back into column 1 underneath the element list. */
    .vi-appearance-pane {
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-width: 0;
    }
    .vi-appearance-pane .vi-mass-edit { margin: 0; }
    .vi-appearance-pane .vi-form { margin: 0; }

    .vi-element-row {
        border: 1px solid var(--app-border);
        background: #fff;
        border-radius: 7px;
        padding: 6px 8px;
        text-align: left;
        cursor: pointer;
        font-size: 11px;
        font-family: var(--app-font);
    }

    .vi-element-row--active {
        border-color: var(--app-accent);
        color: var(--app-accent);
        font-weight: 800;
    }

    /* Wave 7 / Stage A3 — multi-select indicator on element rows. */
    .vi-element-row--multi {
        background: rgba(102, 0, 255, 0.06);
        border-color: rgba(102, 0, 255, 0.45);
    }
    .vi-element-row--multi.vi-element-row--active {
        background: rgba(102, 0, 255, 0.10);
    }

    /* Wave 7 / Stage A3 — multi-select status bar. */
    .vi-multi-bar {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        padding: 6px 10px;
        margin: 6px 0 8px;
        border-radius: 7px;
        font-size: 11px;
        font-family: var(--app-font);
    }
    .vi-multi-bar--hint {
        background: #f5f6f9;
        color: var(--app-text-muted);
        border: 1px dashed var(--app-border);
    }
    .vi-multi-bar--active {
        background: rgba(102, 0, 255, 0.08);
        color: var(--app-accent);
        border: 1px solid rgba(102, 0, 255, 0.35);
    }
    .vi-multi-bar__count { font-weight: 800; }
    .vi-multi-bar__summary {
        flex: 1;
        min-width: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        opacity: 0.75;
    }

    /* Wave 7 / Stage A2 — mass-edit toolbar. */
    .vi-mass-edit {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
        padding: 6px 10px;
        margin: 4px 0 8px;
        border: 1px solid var(--app-border);
        border-radius: 7px;
        background: #fafbff;
        font-size: 11px;
    }
    .vi-mass-edit__label {
        color: var(--app-text-muted);
        font-weight: 700;
        text-transform: uppercase;
        font-size: 10px;
        letter-spacing: 0.04em;
    }
    .vi-mass-edit__sep {
        color: var(--app-text-muted);
        opacity: 0.5;
        padding: 0 2px;
    }

    /* Wave 7 / Stage A1 — line-weight slider + numeric input row. */
    .vi-line-weight-row {
        display: flex;
        gap: 6px;
        align-items: center;
    }
    .vi-slider {
        flex: 1;
        min-width: 0;
        accent-color: var(--app-accent);
        cursor: pointer;
    }
    .vi-slider:disabled {
        opacity: 0.45;
        cursor: not-allowed;
    }

    .vi-form {
        display: grid;
        grid-template-columns: 120px minmax(0, 1fr);
        gap: 8px;
        align-items: center;
    }

    .vi-label {
        color: var(--app-text-muted);
        font-size: 10px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.04em;
    }

    .vi-btn {
        border: 1px solid rgba(102,0,255,0.18);
        border-radius: 7px;
        background: #fff;
        color: var(--app-accent);
        padding: 6px 9px;
        cursor: pointer;
        font-size: 11px;
        font-weight: 800;
        font-family: var(--app-font);
    }

    .vi-btn--primary {
        background: var(--app-gradient);
        color: #fff;
        border-color: transparent;
    }

    .vi-btn:disabled {
        opacity: 0.45;
        cursor: not-allowed;
    }

    .vi-modifier-row {
        display: flex;
        flex-direction: column;
        gap: 0;
        padding: 0;
        border: 1px solid var(--app-border);
        border-radius: 8px;
        background: #fff;
        margin-bottom: 10px;
        overflow: hidden;
    }

    .vi-modifier-header {
        display: flex;
        gap: 6px;
        align-items: center;
        padding: 8px 10px;
        background: #f5f6f9;
        border-bottom: 1px solid var(--app-border);
    }

    .vi-mod-header-select {
        flex: 0 0 auto;
        min-width: 120px;
    }

    .vi-mod-header-input {
        flex: 1;
        min-width: 100px;
    }

    .vi-mod-states-grid {
        display: flex;
        flex-direction: row;
        overflow-x: auto;
        padding: 10px;
        gap: 10px;
    }

    .vi-mod-state-col {
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 110px;
        flex: 1;
    }

    .vi-mod-state-label {
        font-size: 0.7rem;
        font-weight: 700;
        color: var(--app-text-2, #555);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        padding-bottom: 4px;
        border-bottom: 1px solid var(--app-border, #e5e7eb);
        margin-bottom: 2px;
    }

    .vi-mod-prop-lbl {
        font-size: 0.68rem;
        color: var(--app-text-muted, #888);
        margin-top: 3px;
    }

    .vi-mod-state-input {
        width: 100%;
        font-size: 0.75rem;
        padding: 2px 4px;
    }

    .vg-empty {
        font-size: 12px;
        color: var(--app-text-muted);
        text-align: center;
        padding: 24px;
        font-style: italic;
    }

    .vg-section-label {
        font-size: 10px;
        font-weight: 700;
        color: var(--app-text-2);
        text-transform: uppercase;
        letter-spacing: 0.06em;
        margin-bottom: 8px;
    }

    /* ─── Models tab ─────────────────────────────────────────────────── */
    .vg-model-row {
        background: var(--app-panel-bg);
        border-radius: var(--app-radius-md);
        padding: 10px 12px;
        margin-bottom: 8px;
        box-shadow: var(--app-shadow-card);
        display: flex;
        flex-direction: column;
        gap: 6px;
    }
    .vg-model-name {
        font-size: 12px;
        font-weight: 600;
        color: var(--app-text);
    }
    .vg-model-meta {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
    }

    /* ─── Badges ─────────────────────────────────────────────────────── */
    .vg-badge {
        font-size: 10px;
        font-weight: 700;
        padding: 2px 7px;
        border-radius: 10px;
        white-space: nowrap;
    }
    .vg-badge--override { background: var(--vg-badge-warn-bg); color: var(--vg-badge-warn-color); }
    .vg-badge--clean    { background: var(--vg-badge-ok-bg);   color: var(--vg-badge-ok-color);   }
    .vg-badge--builtin  { background: var(--app-violet-soft);  color: var(--app-accent);           }

    /* ─── Override indicator dots ────────────────────────────────────── */
    .vg-dot {
        display: inline-block;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        margin-right: 4px;
        flex-shrink: 0;
    }
    .vg-dot--view-override { background: var(--vg-dot-view-override); }
    .vg-dot--override      { background: var(--vg-dot-override);      }
    .vg-dot--template      { background: var(--app-accent);           }
    .vg-dot--default       { background: var(--vg-dot-default);       }

    /* ─── Templates tab ──────────────────────────────────────────────── */
    .vg-template-row {
        background: var(--app-panel-bg);
        border-radius: var(--app-radius-md);
        padding: 10px 12px;
        margin-bottom: 8px;
        box-shadow: var(--app-shadow-card);
    }
    .vg-template-header {
        display: flex;
        align-items: flex-start;
        gap: 10px;
    }
    .vg-template-swatches {
        display: flex;
        gap: 3px;
        flex-shrink: 0;
        padding-top: 2px;
    }
    .vg-swatch {
        width: 12px;
        height: 12px;
        border-radius: 2px;
        border: 1px solid rgba(0,0,0,0.12);
        display: inline-block;
        flex-shrink: 0;
    }
    .vg-template-info { flex: 1; min-width: 0; }
    .vg-template-name {
        font-size: 12px;
        font-weight: 600;
        color: var(--app-text);
        display: flex;
        align-items: center;
        gap: 6px;
    }
    .vg-template-desc {
        font-size: 10px;
        color: var(--app-text-muted);
        margin-top: 2px;
    }
    .vg-template-usage {
        font-size: 10px;
        color: var(--app-text-2);
        margin-top: 3px;
    }

    /* ─── Create form ────────────────────────────────────────────────── */
    .vg-create-form {
        display: flex;
        flex-direction: column;
        gap: 8px;
        background: var(--app-panel-bg);
        border-radius: var(--app-radius-md);
        padding: 12px;
        box-shadow: var(--app-shadow-card);
    }

    /* ─── Phase 2: Template category editor ──────────────────────────── */
    .vg-tpl-cat-editor {
        margin-top: 10px;
        border-top: 1px solid var(--app-divider, rgba(255,255,255,0.08));
        padding-top: 8px;
    }
    .vg-cat-row--tpl {
        padding: 4px 6px;
    }

    /* ─── Phase 2: View selector row ─────────────────────────────────── */
    .vg-view-selector-row {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
    }
    .vg-select-label {
        font-size: 11px;
        color: var(--app-text-muted);
        white-space: nowrap;
        flex-shrink: 0;
    }

    /* ─── Phase 2: Secondary reset icon button ────────────────────────── */
    .vg-icon-btn--secondary {
        color: var(--app-text-muted);
        opacity: 0.55;
    }
    .vg-icon-btn--secondary:hover {
        opacity: 1;
        color: var(--app-text);
    }

    /* ─── Graphics tab ───────────────────────────────────────────────── */
    .vg-gfx-toolbar {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 8px;
        flex-wrap: wrap;
    }
    .vg-summary-text {
        font-size: 10px;
        color: var(--app-text-muted);
    }
    .vg-preset-row {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
    }
    .vg-legend {
        display: flex;
        align-items: center;
        font-size: 10px;
        color: var(--app-text-2);
        margin-bottom: 8px;
    }
    .vg-cat-header {
        display: flex;
        justify-content: space-between;
        font-size: 9px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--app-text-muted);
        padding: 4px 8px;
        border-bottom: 1px solid var(--app-border);
        margin-bottom: 4px;
    }
    .vg-cat-list {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }
    .vg-line-edges-row {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 8px;
        margin-bottom: 6px;
        background: var(--app-panel-bg);
        border: 1px solid var(--app-border);
        border-radius: var(--app-radius-sm);
        font-size: 11px;
    }
    .vg-line-edges-row--inactive {
        opacity: 0.55;
    }
    .vg-line-edges-label {
        font-weight: 600;
        color: var(--app-text);
        flex: 1;
    }
    .vg-line-edges-hint {
        font-size: 10px;
        color: var(--app-text-muted);
        font-style: italic;
    }
    .vg-check-label--edges {
        background: var(--app-accent-light, #ede9fe);
        border-radius: 3px;
        padding: 2px 6px;
    }
    .vg-cat-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 4px 8px;
        border-radius: var(--app-radius-sm);
        background: var(--app-panel-bg);
        gap: 8px;
    }
    .vg-cat-row:hover { background: #f0f3fb; }
    .vg-cat-name {
        font-size: 11px;
        color: var(--app-text);
        display: flex;
        align-items: center;
        min-width: 110px;
        gap: 2px;
    }
    .vg-cat-controls {
        display: flex;
        align-items: center;
        gap: 6px;
    }

    /* ─── Shared form elements ───────────────────────────────────────── */
    .vg-input {
        font-size: 11px;
        border: 1px solid var(--app-border);
        border-radius: var(--app-radius-sm);
        padding: 5px 8px;
        color: var(--app-text);
        background: var(--app-panel-bg);
        font-family: var(--app-font);
        width: 100%;
        box-sizing: border-box;
    }
    .vg-input:focus { outline: none; border-color: var(--app-accent); }

    .vg-select {
        font-size: 11px;
        border: 1px solid var(--app-border);
        border-radius: var(--app-radius-sm);
        padding: 4px 6px;
        color: var(--app-text);
        background: var(--app-panel-bg);
        font-family: var(--app-font);
        cursor: pointer;
    }
    .vg-select--wide { flex: 1; min-width: 0; }

    .vg-color {
        width: 28px;
        height: 22px;
        border: 1px solid var(--app-border);
        border-radius: 3px;
        padding: 1px;
        cursor: pointer;
        background: none;
    }

    .vg-num {
        width: 42px;
        font-size: 11px;
        border: 1px solid var(--app-border);
        border-radius: var(--app-radius-sm);
        padding: 2px 4px;
        color: var(--app-text);
        background: var(--app-panel-bg);
        text-align: center;
        font-family: var(--app-font);
    }

    .vg-check-label {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1px;
        cursor: pointer;
        font-size: 9px;
        color: var(--app-text-2);
        font-weight: 600;
        font-family: var(--app-font);
    }

    .vg-btn {
        font-size: 11px;
        font-weight: 600;
        padding: 7px 14px;
        border-radius: var(--app-radius-sm);
        border: none;
        cursor: pointer;
        font-family: var(--app-font);
        transition: opacity 0.12s;
    }
    .vg-btn:hover { opacity: 0.88; }
    .vg-btn--primary {
        background: var(--app-gradient);
        color: #fff;
        box-shadow: var(--app-shadow-glow);
    }
    .vg-btn--secondary {
        background: var(--app-panel-bg);
        color: var(--app-accent);
        border: 1px solid var(--app-border);
    }

    .vg-icon-btn {
        background: none;
        border: 1px solid var(--app-border);
        border-radius: var(--app-radius-sm);
        color: var(--app-text-2);
        cursor: pointer;
        font-size: 12px;
        width: 22px;
        height: 22px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: var(--app-font);
        flex-shrink: 0;
    }
    .vg-icon-btn:hover { background: var(--app-border-light); }
    .vg-icon-btn--danger { color: #e53e3e; border-color: #fcc; }
    .vg-icon-btn--danger:hover { background: #fff0f0; }

    .vg-link-btn {
        background: none;
        border: none;
        color: var(--app-accent);
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        text-align: left;
        padding: 0;
        font-family: var(--app-font);
    }
    .vg-link-btn:hover { text-decoration: underline; }

    .vg-divider {
        height: 1px;
        background: var(--app-border);
        margin: 12px 0;
    }

    /* ── DOC-4.2: Cut / Projection sub-weight inputs ──────────────────── */
    .vg-num--subwt {
        width: 32px;
        opacity: 0.75;
    }
    .vg-num--subwt:focus { opacity: 1; }
    .vg-num-placeholder {
        display: inline-block;
        width: 32px;
        height: 22px;
        flex-shrink: 0;
    }

    /* ── DOC-4.1: Element Instance Override section ──────────────────── */
    .vg-instance-sep {
        height: 1px;
        background: var(--app-border);
        margin: 10px 0 6px;
    }
    .vg-instance-header {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.04em;
        color: var(--app-text-2);
        text-transform: uppercase;
        margin-bottom: 6px;
        padding: 0 4px;
    }
    .vg-instance-hint {
        font-size: 11px;
        color: var(--app-text-3, #9aa);
        padding: 2px 4px 8px;
        font-style: italic;
    }
    .vg-instance-el-row {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 2px 4px 4px;
        font-size: 11px;
    }
    .vg-instance-elid {
        font-family: monospace;
        font-size: 10px;
        color: var(--app-text-2);
        background: var(--app-border-light, #f0f0f8);
        border-radius: 3px;
        padding: 1px 4px;
    }
    .vg-instance-type-badge {
        font-size: 10px;
        background: #e8f0fe;
        color: #3060cc;
        border-radius: 3px;
        padding: 1px 5px;
        font-weight: 600;
    }
    .vg-instance-controls {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 4px;
        padding: 2px 4px 8px;
    }
    .vg-instance-label {
        font-size: 10px;
        color: var(--app-text-2);
        white-space: nowrap;
    }
    .vg-instance-existing-label {
        font-size: 11px;
        color: var(--app-text-2);
        font-weight: 600;
        padding: 4px 4px 2px;
    }
    .vg-instance-list {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 0 4px 6px;
    }
    .vg-instance-row {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 11px;
    }
    .vg-instance-swatch {
        width: 14px;
        height: 14px;
        border-radius: 3px;
        border: 1px solid var(--app-border);
        flex-shrink: 0;
    }
    /* Wider danger button for "Clear" text */
    .vg-instance-controls .vg-icon-btn--danger {
        width: auto;
        padding: 0 6px;
        font-size: 11px;
    }
    .vg-icon-btn--secondary {
        color: var(--app-text-3, #888);
        border-color: var(--app-border);
    }
    .vg-icon-btn--secondary:hover { background: var(--app-border-light); }
`;

