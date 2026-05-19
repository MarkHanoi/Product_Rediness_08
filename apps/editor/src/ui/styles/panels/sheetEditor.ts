/**
 * @file src/styles/panels/sheetEditor.ts
 *
 * CSS for the Sheet Editor panel (sh- prefix).
 * CONTRACT §05 §2 — CSS layer only, zero logic.
 */
export const SHEET_EDITOR_STYLES = `
    /* ── Overlay shell ───────────────────────────────────────────────────── */
    .sh-overlay {
        position: fixed;
        inset: 0;
        z-index: 500;
        display: flex;
        flex-direction: column;
        background: rgba(10,12,18,0.88);
        backdrop-filter: blur(4px);
    }
    /* ── Header bar ─────────────────────────────────────────────────────── */
    .sh-header {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 14px;
        background: var(--app-bg, #161920);
        border-bottom: 1px solid var(--app-border, #2a2e3b);
        flex-shrink: 0;
        min-height: 44px;
    }
    .sh-header-title {
        flex: 1;
        font-size: 13px;
        font-weight: 600;
        color: var(--app-text, #e8eaf0);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .sh-header-sub {
        font-size: 11px;
        color: var(--app-text-muted, #6b7280);
        margin-left: 6px;
    }
    .sh-header-btn {
        padding: 4px 10px;
        font-size: 11px;
        border-radius: 4px;
        border: 1px solid var(--app-border, #2a2e3b);
        background: var(--app-surface, #1e2130);
        color: var(--app-text, #e8eaf0);
        cursor: pointer;
        white-space: nowrap;
    }
    .sh-header-btn:hover {
        background: var(--app-surface-hover, #252a3a);
        border-color: var(--app-accent, #4f8ef7);
    }
    .sh-header-btn--primary {
        background: var(--app-accent, #4f8ef7);
        border-color: var(--app-accent, #4f8ef7);
        color: #fff;
        font-weight: 600;
    }
    .sh-header-btn--primary:hover {
        background: #3d78e0;
    }
    .sh-header-btn--danger {
        color: #f87171;
        border-color: #f87171;
    }
    .sh-header-btn--danger:hover {
        background: rgba(248,113,113,0.12);
    }
    .sh-header-sep {
        width: 1px;
        height: 20px;
        background: var(--app-border, #2a2e3b);
        flex-shrink: 0;
    }
    /* ── Body layout ─────────────────────────────────────────────────────── */
    .sh-body {
        flex: 1;
        display: flex;
        overflow: hidden;
    }
    /* ── Canvas scroll area ─────────────────────────────────────────────── */
    .sh-canvas-area {
        flex: 1;
        overflow: auto;
        display: flex;
        align-items: flex-start;
        justify-content: center;
        padding: 32px;
        background: #ffffff;
    }
    /* ── Sheet canvas (white paper) ─────────────────────────────────────── */
    .sh-canvas {
        position: relative;
        background: #fff;
        box-shadow: 0 8px 40px rgba(0,0,0,0.7);
        flex-shrink: 0;
    }
    /* ── Title block strip ───────────────────────────────────────────────── */
    .sh-titleblock {
        position: absolute;
        right: 0;
        top: 0;
        bottom: 0;
        background: #f8f8f8;
        border-left: 1.5px solid #111;
        display: flex;
        flex-direction: column;
    }
    .sh-titleblock-field {
        position: absolute;
        display: flex;
        flex-direction: column;
        border: 0.5px solid #aaa;
        padding: 1px 2px;
        box-sizing: border-box;
        overflow: hidden;
    }
    .sh-titleblock-field-label {
        font-size: 6px;
        color: #888;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        line-height: 1;
        margin-bottom: 1px;
    }
    .sh-titleblock-field-value {
        font-size: 8px;
        color: #111;
        font-weight: 400;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
    }
    .sh-titleblock-field-value--bold {
        font-weight: 700;
    }
    .sh-titleblock-field-value--large {
        font-size: 10px;
    }
    /* ── Sheet border lines ─────────────────────────────────────────────── */
    .sh-border {
        position: absolute;
        inset: 10px;
        border: 1px solid #555;
        pointer-events: none;
    }
    /* ── Viewport rectangle ─────────────────────────────────────────────── */
    .sh-viewport {
        position: absolute;
        border: 1.5px solid #2563eb;
        background: rgba(37,99,235,0.04);
        cursor: grab;
        box-sizing: border-box;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-direction: column;
        overflow: hidden;
        user-select: none;
        transition: border-color 0.15s;
    }
    .sh-viewport:hover {
        border-color: #1d4ed8;
        background: rgba(37,99,235,0.09);
    }
    .sh-viewport--selected {
        border-color: #f59e0b;
        background: rgba(245,158,11,0.08);
        border-width: 2px;
    }
    .sh-viewport-label {
        font-size: 9px;
        color: #1e3a8a;
        font-weight: 600;
        text-align: center;
        padding: 2px 4px;
        pointer-events: none;
    }
    .sh-viewport-sublabel {
        font-size: 7px;
        color: #6b7280;
        text-align: center;
        pointer-events: none;
    }
    .sh-viewport-remove {
        position: absolute;
        top: 2px;
        right: 3px;
        font-size: 9px;
        color: #ef4444;
        background: none;
        border: none;
        cursor: pointer;
        padding: 1px 3px;
        line-height: 1;
        opacity: 0;
        transition: opacity 0.15s;
    }
    .sh-viewport:hover .sh-viewport-remove,
    .sh-viewport--selected .sh-viewport-remove {
        opacity: 1;
    }
    /* ── Empty canvas hint ───────────────────────────────────────────────── */
    .sh-canvas-hint {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%,-50%);
        text-align: center;
        color: #aaa;
        font-size: 12px;
        pointer-events: none;
    }
    /* ── Right sidebar: properties + view picker ─────────────────────────── */
    .sh-sidebar {
        width: 240px;
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        background: var(--app-bg, #161920);
        border-left: 1px solid var(--app-border, #2a2e3b);
        overflow: hidden;
    }
    .sh-sidebar-section {
        border-bottom: 1px solid var(--app-border, #2a2e3b);
        padding: 10px 12px;
    }
    .sh-sidebar-section-title {
        font-size: 10px;
        font-weight: 700;
        color: var(--app-text-muted, #6b7280);
        text-transform: uppercase;
        letter-spacing: 0.6px;
        margin-bottom: 8px;
    }
    .sh-prop-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        margin-bottom: 6px;
    }
    .sh-prop-label {
        font-size: 11px;
        color: var(--app-text-muted, #6b7280);
        flex: 0 0 80px;
    }
    .sh-prop-value {
        font-size: 11px;
        color: var(--app-text, #e8eaf0);
        flex: 1;
        text-align: right;
    }
    .sh-prop-input {
        font-size: 11px;
        padding: 2px 6px;
        border-radius: 3px;
        border: 1px solid var(--app-border, #2a2e3b);
        background: var(--app-surface, #1e2130);
        color: var(--app-text, #e8eaf0);
        width: 100%;
        box-sizing: border-box;
    }
    .sh-prop-input:focus {
        outline: none;
        border-color: var(--app-accent, #4f8ef7);
    }
    .sh-prop-select {
        font-size: 11px;
        padding: 2px 4px;
        border-radius: 3px;
        border: 1px solid var(--app-border, #2a2e3b);
        background: var(--app-surface, #1e2130);
        color: var(--app-text, #e8eaf0);
        width: 100%;
        box-sizing: border-box;
    }
    /* ── View picker list ────────────────────────────────────────────────── */
    .sh-view-picker {
        flex: 1;
        overflow-y: auto;
        padding: 6px 0;
    }
    .sh-view-picker-empty {
        padding: 12px;
        font-size: 11px;
        color: var(--app-text-muted, #6b7280);
        text-align: center;
    }
    .sh-view-entry {
        padding: 5px 12px;
        font-size: 11px;
        color: var(--app-text, #e8eaf0);
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 6px;
    }
    .sh-view-entry:hover {
        background: var(--app-surface-hover, #252a3a);
    }
    .sh-view-entry--placed {
        color: var(--app-text-muted, #6b7280);
        cursor: default;
    }
    .sh-view-entry-icon {
        font-size: 10px;
        width: 14px;
        text-align: center;
    }
    .sh-view-entry-badge {
        font-size: 9px;
        color: #f59e0b;
        margin-left: auto;
    }
    /* ── Revision table ─────────────────────────────────────────────────── */
    .sh-revision-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 10px;
        margin-bottom: 6px;
    }
    .sh-revision-table th {
        text-align: left;
        padding: 3px 6px;
        color: var(--app-text-muted, #6b7280);
        border-bottom: 1px solid var(--app-border, #2a2e3b);
        font-weight: 600;
        font-size: 9px;
    }
    .sh-revision-table td {
        padding: 3px 6px;
        color: var(--app-text, #e8eaf0);
        border-bottom: 1px solid rgba(255,255,255,0.04);
    }
    .sh-revision-add-btn {
        width: 100%;
        padding: 4px 8px;
        font-size: 10px;
        background: var(--app-surface, #1e2130);
        border: 1px solid var(--app-border, #2a2e3b);
        border-radius: 3px;
        color: var(--app-text, #e8eaf0);
        cursor: pointer;
        text-align: left;
    }
    .sh-revision-add-btn:hover {
        background: var(--app-surface-hover, #252a3a);
    }
    .sh-revision-form {
        display: flex;
        flex-direction: column;
        gap: 4px;
        margin-top: 6px;
    }
    .sh-revision-form input {
        font-size: 10px;
        padding: 3px 6px;
        border-radius: 3px;
        border: 1px solid var(--app-border, #2a2e3b);
        background: var(--app-surface, #1e2130);
        color: var(--app-text, #e8eaf0);
    }
    .sh-revision-form input:focus {
        outline: none;
        border-color: var(--app-accent, #4f8ef7);
    }
    .sh-revision-form-actions {
        display: flex;
        gap: 4px;
        margin-top: 2px;
    }
    .sh-revision-form-btn {
        flex: 1;
        padding: 3px 6px;
        font-size: 10px;
        border-radius: 3px;
        border: 1px solid var(--app-border, #2a2e3b);
        background: var(--app-surface, #1e2130);
        color: var(--app-text, #e8eaf0);
        cursor: pointer;
    }
    .sh-revision-form-btn--primary {
        background: var(--app-accent, #4f8ef7);
        border-color: var(--app-accent, #4f8ef7);
        color: #fff;
    }
    /* ── Status badge ────────────────────────────────────────────────────── */
    .sh-status-badge {
        display: inline-block;
        padding: 1px 6px;
        border-radius: 8px;
        font-size: 9px;
        font-weight: 600;
        text-transform: uppercase;
    }
    .sh-status-badge--draft            { background: #374151; color: #9ca3af; }
    .sh-status-badge--for-review       { background: #1e3a5f; color: #93c5fd; }
    .sh-status-badge--for-construction { background: #14532d; color: #86efac; }
    .sh-status-badge--issued           { background: #713f12; color: #fde68a; }
    .sh-status-badge--superseded       { background: #3b0764; color: #c4b5fd; }
    /* ── Sheet index panel (Project Browser) ─────────────────────────────── */
    .pb-sheet-on-badge {
        font-size: 9px;
        color: #f59e0b;
        margin-left: auto;
        flex-shrink: 0;
    }

    /* ── Phase S5 — View entry context menu (right-click "Add to Sheet…") ── */
    .pb-ctx-menu {
        position: fixed;
        z-index: 9000;
        min-width: 180px;
        background: #1e2233;
        border: 1px solid #3a4060;
        border-radius: 6px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.55);
        padding: 4px 0;
        font-size: 12px;
        color: #e2e8f0;
        user-select: none;
    }

    .pb-ctx-menu-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 14px;
        cursor: pointer;
        border-radius: 0;
        transition: background 0.1s;
        white-space: nowrap;
    }

    .pb-ctx-menu-item:hover {
        background: rgba(96,165,250,0.12);
        color: #93c5fd;
    }

    .pb-ctx-menu-item--disabled {
        opacity: 0.4;
        cursor: default;
        pointer-events: none;
    }

    .pb-ctx-separator {
        height: 1px;
        background: #3a4060;
        margin: 4px 0;
    }

    .pb-ctx-sheet-list {
        max-height: 180px;
        overflow-y: auto;
        border-top: 1px solid #3a4060;
        margin-top: 2px;
        padding-top: 2px;
    }

    .pb-ctx-sheet-entry {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 5px 18px;
        cursor: pointer;
        transition: background 0.1s;
        font-size: 11px;
        color: #cbd5e1;
        white-space: nowrap;
    }

    .pb-ctx-sheet-entry:hover {
        background: rgba(96,165,250,0.12);
        color: #93c5fd;
    }

    .pb-ctx-sheet-entry--blocked {
        opacity: 0.4;
        cursor: not-allowed;
        pointer-events: none;
    }

    /* ══════════════════════════════════════════════════════════════════════
       Phase SC-1 — Live Viewport Preview Canvas
       Restructures the viewport card so a live 2D preview occupies the
       upper portion and the label/scale sit in a footer strip below.
       CSS prefix: sh-   (already registered in §05 §3 table)
       ══════════════════════════════════════════════════════════════════════ */

    /* Viewport card — flex column so preview fills top, footer is fixed */
    .sh-viewport {
        flex-direction: column;
        align-items:    stretch;
        justify-content: flex-start;
    }

    /* Preview area — occupies all available space above the footer */
    .sh-vp-content {
        flex:            1;
        position:        relative;
        overflow:        hidden;
        min-height:      0;
        background:      #f8f9fb;
    }

    /* The <canvas> element that the ViewportPreviewRenderer draws into */
    .sh-viewport-preview {
        display:  block;
        width:    100%;
        height:   100%;
        position: absolute;
        inset:    0;
    }

    /* Footer strip at the bottom of each viewport card */
    .sh-vp-footer {
        flex-shrink:    0;
        padding:        3px 6px;
        border-top:     1px solid rgba(37,99,235,0.2);
        background:     rgba(255,255,255,0.9);
        display:        flex;
        align-items:    center;
        gap:            4px;
        overflow:       hidden;
    }

    /* Footer label & sublabel — override legacy centred styles */
    .sh-vp-footer .sh-viewport-label {
        font-size:   8px;
        color:       #1e3a8a;
        font-weight: 600;
        white-space: nowrap;
        overflow:    hidden;
        text-overflow: ellipsis;
        flex:        1;
        text-align:  left;
        padding:     0;
        pointer-events: none;
    }

    .sh-vp-footer .sh-viewport-sublabel {
        font-size:   7px;
        color:       #6b7280;
        white-space: nowrap;
        flex-shrink: 0;
        pointer-events: none;
    }

    /* ══════════════════════════════════════════════════════════════════════
       Phase SC-2 — Properties Inspector Light Theme
       Replaces the dark-on-dark sidebar with a professional, high-contrast
       light inspector per §11.1 and §11.2 of doc 20.
       Tokens:
         --sh-inspector-bg:      #F8F9FA
         --sh-inspector-label:   #495057
         --sh-inspector-value:   #1A1A2E
         --sh-inspector-border:  #DEE2E6
         --sh-panel-header-bg:   #F1F3F5
         --sh-panel-header-text: #212529
       ══════════════════════════════════════════════════════════════════════ */

    /* SC-2 CSS custom properties (scoped to sheet editor) */
    .sh-overlay {
        --sh-inspector-bg:      #F8F9FA;
        --sh-inspector-label:   #495057;
        --sh-inspector-value:   #1A1A2E;
        --sh-inspector-border:  #DEE2E6;
        --sh-panel-header-bg:   #F1F3F5;
        --sh-panel-header-text: #212529;
        --sh-input-bg:          #FFFFFF;
        --sh-input-border:      #CED4DA;
        --sh-focus-ring:        #6741D9;
        --sh-empty-color:       #ADB5BD;
        --sh-btn-primary-bg:    #6741D9;
        --sh-ai-accent:         #7950F2;
        font-family: var(--app-font, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif);
    }

    /* Ensure all sh- elements use the app font */
    .sh-overlay * {
        font-family: var(--app-font);
    }

    /* Sidebar shell — light background */
    .sh-sidebar {
        background:  var(--sh-inspector-bg, #F8F9FA);
        border-left: 1px solid var(--sh-inspector-border, #DEE2E6);
        overflow-y:  auto;
        overflow-x:  hidden;
    }

    /* Section divider */
    .sh-sidebar-section {
        border-bottom: 1px solid var(--sh-inspector-border, #DEE2E6);
        padding:       10px 12px;
    }

    /* Section header — subtle, not all-caps high-contrast violet */
    .sh-sidebar-section-title {
        font-size:      11px;
        font-weight:    600;
        color:          var(--sh-panel-header-text, #212529);
        letter-spacing: 0.05em;
        text-transform: none;
        margin-bottom:  8px;
        padding:        5px 0 5px 0;
        border-bottom:  1px solid var(--sh-inspector-border, #DEE2E6);
        background:     transparent;
    }

    /* Property rows */
    .sh-prop-row {
        display:        flex;
        align-items:    center;
        justify-content: space-between;
        gap:            6px;
        margin-bottom:  5px;
    }

    /* Labels — readable grey, not muted dark */
    .sh-prop-label {
        font-size:   11px;
        font-weight: 500;
        color:       var(--sh-inspector-label, #495057);
        flex:        0 0 78px;
        flex-shrink: 0;
    }

    /* Read-only values */
    .sh-prop-value {
        font-size:  11px;
        color:      var(--sh-inspector-value, #1A1A2E);
        flex:       1;
        text-align: right;
    }

    /* Italic empty/unset value display — "—" not a black box */
    .sh-prop-value--empty {
        color:      var(--sh-empty-color, #ADB5BD);
        font-style: italic;
    }

    /* Input fields — white background, dark text, visible border */
    .sh-prop-input {
        font-size:    11px;
        padding:      3px 7px;
        border-radius: 4px;
        border:       1px solid var(--sh-input-border, #CED4DA);
        background:   var(--sh-input-bg, #FFFFFF);
        color:        var(--sh-inspector-value, #1A1A2E);
        width:        100%;
        box-sizing:   border-box;
        transition:   border-color 0.15s, outline 0.1s;
    }

    .sh-prop-input:focus {
        outline:        2px solid var(--sh-focus-ring, #6741D9);
        outline-offset: 1px;
        border-color:   var(--sh-focus-ring, #6741D9);
    }

    .sh-prop-input::placeholder {
        color: var(--sh-empty-color, #ADB5BD);
    }

    /* Select fields — same white/dark treatment */
    .sh-prop-select {
        font-size:    11px;
        padding:      3px 4px;
        border-radius: 4px;
        border:       1px solid var(--sh-input-border, #CED4DA);
        background:   var(--sh-input-bg, #FFFFFF);
        color:        var(--sh-inspector-value, #1A1A2E);
        width:        100%;
        box-sizing:   border-box;
    }

    .sh-prop-select:focus {
        outline:      2px solid var(--sh-focus-ring, #6741D9);
        outline-offset: 1px;
        border-color: var(--sh-focus-ring, #6741D9);
    }

    /* View picker — light style */
    .sh-view-picker {
        background: var(--sh-inspector-bg, #F8F9FA);
    }

    .sh-view-entry {
        color:  var(--sh-inspector-value, #1A1A2E);
        border-radius: 4px;
        margin: 1px 4px;
    }

    .sh-view-entry:hover {
        background: #EEF2FF;
        color:      #3730a3;
    }

    .sh-view-entry--placed {
        color: var(--sh-inspector-label, #495057);
    }

    .sh-view-entry-badge {
        color:      #6741D9;
        font-size:  9px;
        font-weight: 600;
    }

    /* Revision table — light theme */
    .sh-revision-table th {
        color:        var(--sh-inspector-label, #495057);
        border-bottom: 1px solid var(--sh-inspector-border, #DEE2E6);
        font-size:    9px;
    }

    .sh-revision-table td {
        color:        var(--sh-inspector-value, #1A1A2E);
        border-bottom: 1px solid var(--sh-inspector-border, #DEE2E6);
        font-size:    10px;
    }

    /* Revision Add button — light theme */
    .sh-revision-add-btn {
        background:  var(--sh-input-bg, #FFFFFF);
        border:      1px solid var(--sh-input-border, #CED4DA);
        color:       var(--sh-inspector-value, #1A1A2E);
        border-radius: 4px;
        font-size:   10px;
        padding:     3px 8px;
        cursor:      pointer;
        transition:  background 0.15s;
    }

    .sh-revision-add-btn:hover {
        background: #EEF2FF;
        border-color: #6741D9;
        color:       #6741D9;
    }

    /* Revision form inputs — light theme */
    .sh-revision-form input {
        background:   var(--sh-input-bg, #FFFFFF);
        border:       1px solid var(--sh-input-border, #CED4DA);
        color:        var(--sh-inspector-value, #1A1A2E);
        border-radius: 4px;
        font-size:    10px;
        padding:      3px 7px;
    }

    .sh-revision-form input:focus {
        outline:      2px solid var(--sh-focus-ring, #6741D9);
        outline-offset: 1px;
        border-color: var(--sh-focus-ring, #6741D9);
    }

    .sh-revision-form input::placeholder {
        color: var(--sh-empty-color, #ADB5BD);
    }

    /* Revision form buttons — light theme */
    .sh-revision-form-btn {
        background:   var(--sh-input-bg, #FFFFFF);
        border:       1px solid var(--sh-input-border, #CED4DA);
        color:        var(--sh-inspector-value, #1A1A2E);
        border-radius: 4px;
        font-size:    10px;
        cursor:       pointer;
        padding:      4px 8px;
    }

    .sh-revision-form-btn--primary {
        background:   var(--sh-btn-primary-bg, #6741D9);
        border-color: var(--sh-btn-primary-bg, #6741D9);
        color:        #FFFFFF;
        font-weight:  600;
    }

    .sh-revision-form-btn:not(.sh-revision-form-btn--primary):hover {
        background:   #EEF2FF;
        border-color: #6741D9;
        color:        #6741D9;
    }

    /* Danger button — viewport remove — keep visible on light inspector bg */
    .sh-sidebar .sh-header-btn--danger {
        background:   transparent;
        border-color: #DC2626;
        color:        #DC2626;
    }

    .sh-sidebar .sh-header-btn--danger:hover {
        background: rgba(220,38,38,0.08);
    }

    /* ── SC-3: Canvas Interaction ───────────────────────────────────────────── */

    .sh-canvas {
        position:   relative;
        overflow:   hidden;
        background: #ffffff;
        cursor:     default;
    }
    .sh-canvas--snapping { cursor: crosshair; }
    .sh-canvas--panning  { cursor: grab; }
    .sh-canvas--panning:active { cursor: grabbing; }

    /* Grid overlay */
    .sh-grid-overlay {
        position:       absolute;
        inset:          0;
        pointer-events: none;
        z-index:        1;
    }

    /* Alignment guide lines */
    .sh-align-guide {
        position:        absolute;
        pointer-events:  none;
        z-index:         10;
        background:      #6741D9;
        opacity:         0.7;
    }
    .sh-align-guide--h { width:  100%; height: 1px; }
    .sh-align-guide--v { width:  1px; height: 100%; }

    /* Margin guides */
    .sh-margin-guide {
        position:        absolute;
        pointer-events:  none;
        z-index:         9;
        border:          1px dashed rgba(103,65,217,0.35);
    }

    /* Snap indicator dot */
    .sh-snap-indicator {
        position:        absolute;
        width:           8px;
        height:          8px;
        border-radius:   50%;
        background:      #6741D9;
        pointer-events:  none;
        z-index:         15;
        transform:       translate(-50%, -50%);
        transition:      opacity 0.1s;
    }

    /* Viewport selection ring */
    .sh-viewport--selected > .sh-viewport-body {
        outline: 2px solid #6741D9;
        outline-offset: 0;
    }

    /* Resize handles */
    .sh-resize-handle {
        position:   absolute;
        width:      8px;
        height:     8px;
        background: #6741D9;
        border:     1px solid #fff;
        z-index:    20;
        cursor:     se-resize;
    }
    .sh-resize-handle--nw { top: -4px;  left: -4px;  cursor: nw-resize; }
    .sh-resize-handle--ne { top: -4px;  right: -4px; cursor: ne-resize; }
    .sh-resize-handle--sw { bottom: -4px; left: -4px;  cursor: sw-resize; }
    .sh-resize-handle--se { bottom: -4px; right: -4px; cursor: se-resize; }
    .sh-resize-handle--n  { top: -4px;  left: 50%; transform: translateX(-50%); cursor: n-resize; }
    .sh-resize-handle--s  { bottom: -4px; left: 50%; transform: translateX(-50%); cursor: s-resize; }
    .sh-resize-handle--e  { right: -4px; top: 50%; transform: translateY(-50%); cursor: e-resize; }
    .sh-resize-handle--w  { left: -4px;  top: 50%; transform: translateY(-50%); cursor: w-resize; }

    /* Multi-select rubber band */
    .sh-select-band {
        position:        absolute;
        border:          1px dashed #6741D9;
        background:      rgba(103,65,217,0.07);
        pointer-events:  none;
        z-index:         50;
    }

    /* Back/Close button — explicit white text on dark header so it's always visible */
    .sh-header-btn.sh-header-btn--close {
        background:   #374151;
        border-color: #6b7280;
        color:        #f3f4f6;
        font-weight:  500;
    }
    .sh-header-btn.sh-header-btn--close:hover {
        background:   #4b5563;
        border-color: #9ca3af;
        color:        #ffffff;
    }

    /* Zoom controls */
    .sh-zoom-btn {
        min-width:    26px;
        padding:      4px 6px;
        font-size:    13px;
        font-weight:  700;
        line-height:  1;
        background:   #fff;
        border:       1px solid #CED4DA;
        color:        #374151;
        border-radius: 4px;
        cursor:       pointer;
        transition:   background 0.15s;
    }
    .sh-zoom-btn:hover {
        background: #EEF2FF;
        border-color: #6741D9;
        color:      #6741D9;
    }
    .sh-zoom-label {
        font-size:   11px;
        color:       #e8eaf0;
        min-width:   36px;
        text-align:  center;
        font-weight: 500;
        letter-spacing: 0.02em;
    }
    .sh-zoom-reset-btn {
        min-width:    26px;
        padding:      4px 6px;
        font-size:    11px;
        background:   #fff;
        border:       1px solid #CED4DA;
        color:        #374151;
        border-radius: 4px;
        cursor:       pointer;
        transition:   background 0.15s;
    }
    .sh-zoom-reset-btn:hover {
        background:   #EEF2FF;
        border-color: #6741D9;
        color:        #6741D9;
    }

    /* Grid toggle button */
    .sh-grid-toggle {
        background:   #fff;
        border:       1px solid #CED4DA;
        border-radius: 4px;
        padding:      3px 7px;
        font-size:    11px;
        color:        #495057;
        cursor:       pointer;
        transition:   background 0.15s;
    }
    .sh-grid-toggle--active {
        background:   #6741D9;
        border-color: #6741D9;
        color:        #fff;
    }
    .sh-grid-toggle:hover:not(.sh-grid-toggle--active) { background: #f0f2f8; }

    /* Available Views section — ensure it's always reachable via sidebar scroll */
    .sh-view-picker-section {
        border-bottom: none;
    }
    .sh-view-picker {
        max-height:   220px;
        overflow-y:   auto;
        padding:      6px 0;
        background:   var(--sh-inspector-bg, #F8F9FA);
    }

    /* ── SC-4: Layout Engine ────────────────────────────────────────────────── */

    .sh-layout-section {
        padding:     12px 14px 6px;
        border-top:  1px solid var(--sh-inspector-border, #DEE2E6);
    }
    .sh-layout-label {
        font-size:     10px;
        font-weight:   600;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color:         var(--sh-inspector-label, #495057);
        margin-bottom: 8px;
    }
    .sh-preset-grid {
        display:               grid;
        grid-template-columns: 1fr 1fr;
        gap:                   5px;
    }
    .sh-preset-btn {
        padding:       5px 7px;
        font-size:     10px;
        background:    var(--sh-input-bg, #FFFFFF);
        border:        1px solid var(--sh-input-border, #CED4DA);
        border-radius: 4px;
        color:         var(--sh-inspector-value, #1A1A2E);
        cursor:        pointer;
        text-align:    left;
        line-height:   1.3;
        transition:    background 0.12s;
        white-space:   normal;
    }
    .sh-preset-btn:hover    { background: #f0f2f8; }
    .sh-preset-btn--active  { background: #6741D9; color: #fff; border-color: #6741D9; }
    .sh-paper-size-row {
        display: flex; gap: 5px; align-items: center; margin-top: 7px;
    }
    .sh-paper-size-label { font-size: 10px; color: var(--sh-inspector-label, #495057); }
    .sh-paper-size-select {
        flex:          1;
        font-size:     11px;
        padding:       3px 5px;
        border:        1px solid var(--sh-input-border, #CED4DA);
        border-radius: 4px;
        background:    var(--sh-input-bg, #FFFFFF);
        color:         var(--sh-inspector-value, #1A1A2E);
    }
    .sh-paper-size-select:focus { outline: 2px solid var(--sh-focus-ring, #6741D9); border-color: transparent; }

    /* ── SC-5: Data Panels ──────────────────────────────────────────────────── */

    .sh-data-panel {
        box-sizing:    border-box;
        border:        1.5px solid #3b5bdb;
        border-radius: 2px;
        background:    #fff;
        overflow:      hidden;
        min-width:     60px;
        min-height:    40px;
    }
    .sh-data-panel:hover       { border-color: #6741D9; }
    .sh-data-panel--selected   { outline: 2px solid #6741D9; }
    .sh-data-panel-inner       { width: 100%; height: 100%; overflow: auto; }
    .sh-dp-table               { border-collapse: collapse; width: 100%; }

    .sh-dp-panel-section {
        padding: 12px 14px 6px;
        border-top: 1px solid var(--sh-inspector-border, #DEE2E6);
    }
    .sh-dp-add-btn {
        display:       flex;
        align-items:   center;
        gap:           4px;
        width:         100%;
        padding:       6px 10px;
        font-size:     11px;
        background:    var(--sh-input-bg, #FFFFFF);
        border:        1px solid var(--sh-input-border, #CED4DA);
        border-radius: 4px;
        color:         var(--sh-inspector-value, #1A1A2E);
        cursor:        pointer;
        margin-bottom: 5px;
        transition:    background 0.12s;
    }
    .sh-dp-add-btn:hover { background: #f0f2f8; }
    .sh-dp-panel-list    { display: flex; flex-direction: column; gap: 4px; }
    .sh-dp-panel-item {
        display:        flex;
        align-items:    center;
        justify-content: space-between;
        padding:        4px 8px;
        font-size:      10px;
        background:     #f4f6fb;
        border-radius:  3px;
        border:         1px solid #dee2e6;
        color:          var(--sh-inspector-value, #1A1A2E);
    }
    .sh-dp-panel-remove {
        background:    transparent;
        border:        none;
        cursor:        pointer;
        color:         #DC2626;
        font-size:     14px;
        line-height:   1;
        padding:       0 2px;
    }
    .sh-dp-panel-remove:hover { color: #991b1b; }

    /* ── SC-6: Export Dialog ────────────────────────────────────────────────── */

    .sh-export-dialog-backdrop {
        position:        fixed;
        inset:           0;
        background:      rgba(0,0,0,0.45);
        z-index:         2200;
        display:         flex;
        align-items:     center;
        justify-content: center;
    }
    .sh-export-dialog {
        background:    #fff;
        border-radius: 8px;
        padding:       24px;
        min-width:     320px;
        max-width:     420px;
        box-shadow:    0 8px 32px rgba(0,0,0,0.18);
        display:       flex;
        flex-direction: column;
        gap:           14px;
    }
    .sh-export-dialog-title {
        font-size:   15px;
        font-weight: 700;
        color:       #1a1a2e;
        margin:      0;
    }
    .sh-export-dialog-label {
        font-size:   11px;
        color:       #495057;
        font-weight: 600;
        display:     block;
        margin-bottom: 4px;
    }
    .sh-export-format-grid {
        display:               grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap:                   8px;
    }
    .sh-export-format-btn {
        padding:       8px 4px;
        font-size:     11px;
        font-weight:   600;
        border:        1.5px solid #CED4DA;
        border-radius: 5px;
        background:    #f8f9fa;
        color:         #343a40;
        cursor:        pointer;
        text-align:    center;
        transition:    all 0.12s;
    }
    .sh-export-format-btn:hover        { background: #e9ecef; }
    .sh-export-format-btn--selected    { border-color: #6741D9; background: #ede9fb; color: #6741D9; }
    .sh-export-dpi-row {
        display: flex; align-items: center; gap: 8px;
    }
    .sh-export-dpi-input {
        width:         70px;
        padding:       4px 7px;
        border:        1px solid #CED4DA;
        border-radius: 4px;
        font-size:     12px;
        color:         #1a1a2e;
    }
    .sh-export-dialog-actions {
        display:         flex;
        justify-content: flex-end;
        gap:             8px;
        margin-top:      4px;
    }
    .sh-export-cancel-btn {
        padding:       7px 16px;
        font-size:     12px;
        border:        1px solid #CED4DA;
        border-radius: 5px;
        background:    #f8f9fa;
        color:         #495057;
        cursor:        pointer;
    }
    .sh-export-cancel-btn:hover { background: #e9ecef; }
    .sh-export-confirm-btn {
        padding:       7px 16px;
        font-size:     12px;
        font-weight:   600;
        border:        none;
        border-radius: 5px;
        background:    #6741D9;
        color:         #fff;
        cursor:        pointer;
        transition:    background 0.12s;
    }
    .sh-export-confirm-btn:hover { background: #5732b5; }

    /* ── SC-7: AI Composition Intent ────────────────────────────────────────── */

    .sh-intent-section {
        padding:    12px 14px 10px;
        border-top: 1px solid var(--sh-inspector-border, #DEE2E6);
    }
    .sh-intent-label {
        font-size:     10px;
        font-weight:   600;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color:         var(--sh-inspector-label, #495057);
        margin-bottom: 6px;
    }
    .sh-intent-textarea {
        width:         100%;
        box-sizing:    border-box;
        min-height:    60px;
        resize:        vertical;
        padding:       6px 8px;
        font-size:     11px;
        font-family:   inherit;
        border:        1px solid var(--sh-input-border, #CED4DA);
        border-radius: 4px;
        background:    var(--sh-input-bg, #FFFFFF);
        color:         var(--sh-inspector-value, #1A1A2E);
        transition:    border-color 0.15s;
    }
    .sh-intent-textarea:focus { outline: 2px solid var(--sh-focus-ring, #6741D9); border-color: transparent; }
    .sh-intent-textarea::placeholder { color: var(--sh-empty-color, #ADB5BD); }
    .sh-audience-row {
        display: flex; gap: 5px; align-items: center; margin-top: 6px;
    }
    .sh-audience-label { font-size: 10px; color: var(--sh-inspector-label, #495057); min-width: 52px; }
    .sh-audience-select {
        flex:          1;
        font-size:     11px;
        padding:       3px 5px;
        border:        1px solid var(--sh-input-border, #CED4DA);
        border-radius: 4px;
        background:    var(--sh-input-bg, #FFFFFF);
        color:         var(--sh-inspector-value, #1A1A2E);
    }
    .sh-audience-select:focus { outline: 2px solid var(--sh-focus-ring, #6741D9); border-color: transparent; }
    .sh-intent-ai-btn {
        margin-top:    6px;
        width:         100%;
        padding:       6px;
        font-size:     11px;
        font-weight:   600;
        background:    linear-gradient(135deg, #6741D9, #3b5bdb);
        color:         #fff;
        border:        none;
        border-radius: 5px;
        cursor:        pointer;
        transition:    opacity 0.15s;
    }
    .sh-intent-ai-btn:hover     { opacity: 0.88; }
    .sh-intent-ai-btn:disabled  { opacity: 0.45; cursor: default; }

    /* ── SC-8: Collaboration Presence ───────────────────────────────────────── */

    .sh-presence-strip {
        display:     flex;
        align-items: center;
        gap:         -4px;
        margin-left: 8px;
    }
    .sh-presence-avatar {
        width:         24px;
        height:        24px;
        border-radius: 50%;
        border:        2px solid #fff;
        display:       flex;
        align-items:   center;
        justify-content: center;
        font-size:     9px;
        font-weight:   700;
        color:         #fff;
        margin-left:   -4px;
        flex-shrink:   0;
        title:         attr(data-name);
    }
    .sh-presence-cursor {
        position:       absolute;
        pointer-events: none;
        z-index:        100;
        transition:     left 0.1s linear, top 0.1s linear;
    }
    .sh-presence-cursor-dot {
        width:         10px;
        height:        10px;
        border-radius: 50%;
        border:        2px solid #fff;
    }
    .sh-presence-cursor-name {
        font-size:     9px;
        font-weight:   600;
        color:         #fff;
        padding:       1px 4px;
        border-radius: 3px;
        white-space:   nowrap;
        margin-top:    2px;
        transform:     translateX(-4px);
    }

    /* Comment pins on sheet canvas */
    .sh-comment-pin {
        position:       absolute;
        width:          20px;
        height:         20px;
        border-radius:  50% 50% 50% 0;
        transform:      rotate(-45deg) translate(-50%, 0);
        transform-origin: 0 100%;
        cursor:         pointer;
        border:         2px solid #fff;
        z-index:        80;
        transition:     transform 0.1s;
    }
    .sh-comment-pin:hover  { transform: rotate(-45deg) translate(-50%, 0) scale(1.2); }
    .sh-comment-pin--resolved { opacity: 0.45; }
    .sh-comment-count-badge {
        position:      absolute;
        top:           -4px;
        right:         -6px;
        min-width:     14px;
        height:        14px;
        background:    #DC2626;
        color:         #fff;
        border-radius: 7px;
        font-size:     8px;
        font-weight:   700;
        display:       flex;
        align-items:   center;
        justify-content: center;
        padding:       0 3px;
    }
    .sh-comment-popover {
        position:      absolute;
        background:    #fff;
        border:        1px solid #dee2e6;
        border-radius: 6px;
        padding:       10px 12px;
        max-width:     240px;
        min-width:     180px;
        z-index:       200;
        box-shadow:    0 4px 16px rgba(0,0,0,0.12);
        font-size:     11px;
        color:         #343a40;
    }
    .sh-comment-popover-author {
        font-weight: 600;
        font-size:   10px;
        color:       #495057;
        margin-bottom: 4px;
    }
    .sh-comment-popover-body { margin-bottom: 8px; line-height: 1.45; }
    .sh-comment-resolve-btn {
        font-size:     10px;
        background:    transparent;
        border:        1px solid #dee2e6;
        border-radius: 3px;
        padding:       2px 7px;
        cursor:        pointer;
        color:         #6741D9;
    }
    .sh-comment-resolve-btn:hover { background: #f0eaff; }
    .sh-add-comment-btn {
        position:      absolute;
        bottom:        10px;
        right:         10px;
        padding:       7px 14px;
        font-size:     11px;
        font-weight:   600;
        background:    #6741D9;
        color:         #fff;
        border:        none;
        border-radius: 5px;
        cursor:        pointer;
        z-index:       90;
        transition:    background 0.12s;
    }
    .sh-add-comment-btn:hover { background: #5732b5; }
    .sh-add-comment-btn--placing { background: #343a40; }

    /* ══════════════════════════════════════════════════════════════════════
       Phase SC-11 — Edit-in-Sheet (Viewport Focus Mode)
       ══════════════════════════════════════════════════════════════════════ */

    /* Dim overlay: semi-transparent layer behind the focused viewport */
    .sh-focus-dim-overlay {
        position:       absolute;
        inset:          0;
        background:     rgba(0, 0, 0, 0.48);
        z-index:        8;
        pointer-events: all;
        cursor:         default;
    }

    /* Focused viewport: elevated above the dim overlay, glowing blue border */
    .sh-viewport--focus-editing {
        z-index:    9 !important;
        box-shadow: 0 0 0 2.5px #4b7cf3, 0 0 28px rgba(75,124,243,0.45) !important;
        border-color: #4b7cf3 !important;
        overflow:   visible !important;
        cursor:     default !important;
    }

    /* Toolbar floats above the focused viewport */
    .sh-focus-toolbar {
        position:        absolute;
        bottom:          calc(100% + 2px);
        left:            0;
        right:           0;
        display:         flex;
        align-items:     center;
        gap:             5px;
        padding:         5px 8px;
        background:      rgba(17, 20, 30, 0.97);
        border:          1.5px solid #4b7cf3;
        border-radius:   6px 6px 0 0;
        font-size:       10px;
        color:           #e2e8f0;
        white-space:     nowrap;
        z-index:         10;
        box-shadow:      0 -4px 18px rgba(0,0,0,0.45);
        user-select:     none;
        flex-wrap:       wrap;
        min-height:      30px;
    }

    .sh-focus-toolbar-label {
        font-weight:  700;
        color:        #7cb9fa;
        flex:         1;
        font-size:    10px;
        overflow:     hidden;
        text-overflow: ellipsis;
        white-space:  nowrap;
    }

    .sh-focus-toolbar-btn {
        padding:       3px 8px;
        font-size:     10px;
        border-radius: 3px;
        border:        1px solid rgba(255,255,255,0.18);
        background:    rgba(255,255,255,0.09);
        color:         #d1d5db;
        cursor:        pointer;
        white-space:   nowrap;
        line-height:   1.4;
        transition:    background 0.12s, border-color 0.12s;
    }
    .sh-focus-toolbar-btn:hover {
        background:   rgba(255,255,255,0.18);
        border-color: rgba(255,255,255,0.35);
        color:        #fff;
    }
    .sh-focus-toolbar-btn--active {
        background:   #3b5cf0;
        border-color: #4b7cf3;
        color:        #fff;
    }
    .sh-focus-toolbar-btn--done {
        background:   #16a34a;
        border-color: #22c55e;
        color:        #fff;
        font-weight:  700;
    }
    .sh-focus-toolbar-btn--done:hover { background: #15803d; }

    .sh-focus-toolbar-scale {
        padding:       2px 5px;
        font-size:     10px;
        border-radius: 3px;
        border:        1px solid rgba(255,255,255,0.22);
        background:    rgba(30,33,48,0.95);
        color:         #e2e8f0;
        cursor:        pointer;
    }
    .sh-focus-toolbar-scale:focus { outline: 2px solid #4b7cf3; }

    /* Camera-transform wrapper inside .sh-vp-content */
    .sh-vp-cam-container {
        position:        absolute;
        top:             0;
        left:            0;
        width:           100%;
        height:          100%;
        transform-origin: 50% 50%;
        will-change:     transform;
    }

    /* SVG dimension overlay — shares the cam-container transform */
    .sh-vp-dim-svg {
        position:       absolute;
        top:            0;
        left:           0;
        width:          100%;
        height:         100%;
        overflow:       visible;
        pointer-events: none;
    }
    .sh-vp-dim-svg--dim-tool {
        pointer-events: all;
        cursor:         crosshair;
    }
`;


