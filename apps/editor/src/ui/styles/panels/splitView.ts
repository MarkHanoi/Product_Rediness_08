/**
 * @file src/styles/panels/splitView.ts
 *
 * CSS for the PRYZM Split View system (svp- prefix).
 *
 * CONTRACT §05 §2.1 — registered via AppTheme.ts; never injected inline.
 * CONTRACT §05 §6   — zero bim-* elements; plain HTML + canvas only.
 * CONTRACT §05 §2.2 — prefix: svp- (Split View Pane)
 */

export const SPLIT_VIEW_STYLES = `

/* ── Split View: Container ─────────────────────────────────────────────────── */

/*
 * When split-view is active, the primary OBC container shrinks to the left
 * portion. The secondary pane is positioned fixed to the remaining right area.
 *
 * IMPORTANT: #container uses flex:1 1 0 so setting only width is overridden
 * by flex-grow. We must use max-width to cap the container's rendered size and
 * flex-grow:0 to prevent it expanding back to fill the row.
 */
#container.svp-active {
    flex-grow: 0 !important;
    flex-shrink: 0 !important;
    flex-basis: auto !important;
    width: 60%;
    max-width: 60%;
    transition: width 0.2s ease-in-out, max-width 0.2s ease-in-out;
}
#container {
    transition: width 0.2s ease-in-out, max-width 0.2s ease-in-out;
}

/* ── Split View: Secondary Pane ────────────────────────────────────────────── */

.svp-pane {
    position: fixed;
    top: 0;
    right: 0;
    width: 40%;
    height: 100%;
    z-index: 1;
    background: #ffffff;
    display: flex;
    flex-direction: column;
    border-left: 2px solid rgba(0,0,0,0.12);
    overflow: hidden;
    pointer-events: auto;
}

/* ── Split View: Header Bar ─────────────────────────────────────────────────── */

.svp-header {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 12px;
    height: 36px;
    background: #fff;
    border-bottom: 1px solid rgba(0,0,0,0.1);
    font-family: var(--app-font, system-ui, sans-serif);
    font-size: 11px;
    font-weight: 600;
    color: #4a5568;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    user-select: none;
}

.svp-header-title {
    display: flex;
    align-items: center;
    gap: 6px;
}

.svp-header-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #6366f1;
    flex-shrink: 0;
}

.svp-header-level {
    display: flex;
    align-items: center;
    gap: 6px;
}

.svp-level-label {
    font-size: 10px;
    font-weight: 400;
    color: #718096;
    text-transform: none;
    letter-spacing: 0;
}

.svp-level-select {
    font-family: var(--app-font, system-ui, sans-serif);
    font-size: 11px;
    font-weight: 500;
    color: #2d3748;
    background: #f7fafc;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    padding: 2px 6px;
    cursor: pointer;
    outline: none;
    max-width: 120px;
    appearance: none;
    -webkit-appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'%3E%3Cpath d='M2 3l3 4 3-4' stroke='%23718096' fill='none' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 6px center;
    padding-right: 20px;
}

.svp-level-select:focus {
    border-color: #6366f1;
    box-shadow: 0 0 0 2px rgba(99,102,241,0.15);
}

/* ── View-type selector (Plan / Sections / Elevations / RCP) ──────────────── */

.svp-view-select {
    font-family: var(--app-font, system-ui, sans-serif);
    font-size: 11px;
    font-weight: 600;
    color: #2d3748;
    background: #f7fafc;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    padding: 2px 22px 2px 7px;
    cursor: pointer;
    outline: none;
    max-width: 160px;
    min-width: 100px;
    appearance: none;
    -webkit-appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'%3E%3Cpath d='M2 3l3 4 3-4' stroke='%236366f1' fill='none' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 6px center;
    text-overflow: ellipsis;
    white-space: nowrap;
    overflow: hidden;
    letter-spacing: 0;
    text-transform: none;
    transition: border-color 0.12s, box-shadow 0.12s;
}

.svp-view-select:focus {
    border-color: #6366f1;
    box-shadow: 0 0 0 2px rgba(99,102,241,0.15);
}

.svp-view-select:hover {
    border-color: #a5b4fc;
    background-color: #f0f1ff;
}

.svp-close-btn {
    width: 24px;
    height: 24px;
    border-radius: 4px;
    border: none;
    background: transparent;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #718096;
    font-size: 14px;
    line-height: 1;
    padding: 0;
    transition: background 0.1s, color 0.1s;
    pointer-events: auto;
}

.svp-close-btn:hover {
    background: rgba(0,0,0,0.06);
    color: #2d3748;
}

/* ── Phase 2a: VG eye button ────────────────────────────────────────────────── */

.svp-vg-btn {
    width: 28px;
    height: 28px;
    border-radius: 5px;
    border: 1px solid #e2e8f0;
    background: #f7fafc;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #4a5568;
    padding: 0;
    transition: background 0.12s, border-color 0.12s, color 0.12s;
    pointer-events: auto;
    flex-shrink: 0;
}

.svp-vg-btn:hover {
    background: #edf2ff;
    border-color: #6366f1;
    color: #6366f1;
}

.svp-vg-btn.active {
    background: #edf2ff;
    border-color: #6366f1;
    color: #6366f1;
}

/* ── Phase 2b: VG template selector ─────────────────────────────────────────── */

.svp-template-group {
    display: flex;
    align-items: center;
    gap: 5px;
    flex-shrink: 0;
}

.svp-template-label {
    font-size: 10px;
    font-weight: 500;
    color: #718096;
    text-transform: none;
    letter-spacing: 0;
    white-space: nowrap;
}

.svp-template-select {
    font-family: var(--app-font, system-ui, sans-serif);
    font-size: 11px;
    font-weight: 500;
    color: #2d3748;
    background: #f7fafc;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    padding: 2px 20px 2px 6px;
    cursor: pointer;
    outline: none;
    max-width: 110px;
    appearance: none;
    -webkit-appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'%3E%3Cpath d='M2 3l3 4 3-4' stroke='%23718096' fill='none' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 6px center;
    transition: border-color 0.12s, box-shadow 0.12s;
}

.svp-template-select:focus {
    border-color: #6366f1;
    box-shadow: 0 0 0 2px rgba(99,102,241,0.15);
}

/* ── Split View: Canvas Area ────────────────────────────────────────────────── */

.svp-canvas-wrap {
    flex: 1;
    position: relative;
    overflow: hidden;
    background: #ffffff;
}

.svp-canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
    cursor: grab;
}

.svp-canvas:active {
    cursor: grabbing;
}

/* Contract 17 Phase 2 — tool-active cursor: crosshair when a creation tool is selected */
.svp-canvas.svp-tool-active {
    cursor: crosshair !important;
}

.svp-plan-view-root {
    position: fixed;
    inset: 0;
    z-index: 4;
    background: #ffffff;
    pointer-events: auto;
}

.svp-plan-view-root--split {
    transition: right 0.2s ease-in-out;
}

.svp-plan-view-header {
    position: absolute;
    top: 10px;
    left: 12px;
    right: 12px;
    z-index: 6;
    pointer-events: auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    transition: left 0.2s ease-in-out;
}

/* View name pill — shown for all view types (plan, elevation, section, etc.) */
.svp-pv-view-name {
    display: inline-flex;
    align-items: center;
    height: 24px;
    padding: 0 9px;
    border-radius: 5px;
    border: 1px solid rgba(17,24,39,0.13);
    background: rgba(255,255,255,0.92);
    color: #0f172a;
    font-size: 10.5px;
    font-weight: 600;
    font-family: 'Inter', system-ui, sans-serif;
    letter-spacing: 0.02em;
    pointer-events: none;
    backdrop-filter: blur(4px);
}

.svp-plan-view-title {
    display: none;
}

.svp-plan-view-badge {
    display: none;
}

.svp-isolate-banner {
    position: absolute;
    top: 46px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 7;
    display: none;
    align-items: center;
    gap: 10px;
    padding: 6px 10px;
    border-radius: 999px;
    border: 1px solid rgba(249,115,22,0.42);
    background: rgba(255,247,237,0.96);
    color: #9a3412;
    font-family: var(--app-font, system-ui, sans-serif);
    font-size: 11px;
    font-weight: 700;
    box-shadow: 0 4px 12px rgba(15,23,42,0.12);
    pointer-events: auto;
}

.svp-isolate-banner--visible {
    display: inline-flex;
}

.svp-isolate-banner button {
    border: 1px solid rgba(249,115,22,0.36);
    background: #fff;
    color: #c2410c;
    border-radius: 999px;
    height: 20px;
    padding: 0 8px;
    font-size: 10px;
    font-weight: 700;
    cursor: pointer;
}

.svp-override-context-menu {
    position: fixed;
    z-index: 2500;
    display: flex;
    flex-direction: column;
    min-width: 160px;
    padding: 5px;
    border: 1px solid rgba(15,23,42,0.12);
    border-radius: 8px;
    background: #fff;
    box-shadow: 0 10px 30px rgba(15,23,42,0.16);
    font-family: var(--app-font, system-ui, sans-serif);
}

.svp-override-context-menu button {
    border: none;
    background: transparent;
    text-align: left;
    padding: 8px 10px;
    border-radius: 5px;
    font-size: 12px;
    color: #111827;
    cursor: pointer;
}

.svp-override-context-menu button:hover {
    background: rgba(102,0,255,0.07);
    color: #6600FF;
}

.svp-plan-view-canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
    cursor: grab;
    background: #ffffff;
}

.svp-plan-view-canvas:active {
    cursor: grabbing;
}

.svp-plan-view-canvas.svp-tool-active {
    cursor: crosshair !important;
}

/* ── Plan View: Header Toolbar ───────────────────────────────────────────────── */

.svp-plan-view-toolbar {
    display: flex;
    align-items: center;
    gap: 4px;
}

.svp-pv-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 0 8px;
    height: 24px;
    border-radius: 5px;
    border: 1px solid rgba(17,24,39,0.13);
    background: rgba(248,250,252,0.95);
    color: #374151;
    font-size: 10.5px;
    font-weight: 500;
    font-family: var(--app-font, system-ui, sans-serif);
    cursor: pointer;
    user-select: none;
    white-space: nowrap;
    transition: background 0.12s, border-color 0.12s, color 0.12s, box-shadow 0.12s;
    box-shadow: 0 1px 2px rgba(15,23,42,0.06);
}

.svp-pv-btn svg {
    flex-shrink: 0;
    opacity: 0.75;
}

.svp-pv-btn:hover {
    background: #fff;
    border-color: rgba(99,102,241,0.35);
    color: #4f46e5;
    box-shadow: 0 1px 4px rgba(99,102,241,0.12);
}

.svp-pv-btn:hover svg {
    opacity: 1;
}

.svp-pv-btn--active {
    background: rgba(238,242,255,0.98);
    border-color: rgba(99,102,241,0.45);
    color: #4338ca;
    box-shadow: 0 1px 3px rgba(99,102,241,0.18);
}

.svp-pv-btn--active svg {
    opacity: 1;
}

.svp-pv-btn--close {
    border-color: rgba(220,38,38,0.18);
    color: #dc2626;
    background: rgba(255,248,248,0.95);
}

.svp-pv-btn--close:hover {
    background: #fff1f1;
    border-color: rgba(220,38,38,0.40);
    color: #b91c1c;
    box-shadow: 0 1px 4px rgba(220,38,38,0.12);
}

/* ── Split View: Status Badge ────────────────────────────────────────────────── */

.svp-badge {
    position: absolute;
    bottom: 8px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0,0,0,0.55);
    color: #fff;
    font-size: 10px;
    font-family: var(--app-font, system-ui, sans-serif);
    padding: 3px 10px;
    border-radius: 20px;
    pointer-events: none;
    white-space: nowrap;
    letter-spacing: 0.3px;
}

/* Phase 1b — icon-only grid toggle, bottom-left corner */
.svp-grid-toggle-btn {
    position: absolute;
    left: 8px;
    bottom: 8px;
    width: 28px;
    height: 28px;
    padding: 0;
    border-radius: 6px;
    border: 1px solid rgba(17,24,39,0.14);
    background: rgba(255,255,255,0.90);
    color: #374151;
    box-shadow: 0 1px 4px rgba(15,23,42,0.10);
    cursor: pointer;
    pointer-events: auto;
    user-select: none;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.75;
    transition: opacity 0.15s, border-color 0.15s, color 0.15s, background 0.15s;
}

.svp-grid-toggle-btn:hover {
    opacity: 1;
    border-color: rgba(99,102,241,0.40);
    color: #4f46e5;
    background: rgba(255,255,255,0.98);
}

.svp-grid-toggle-btn--off {
    opacity: 0.38;
    color: #9ca3af;
    background: rgba(255,255,255,0.75);
}

.svp-grid-toggle-btn--off:hover {
    opacity: 0.70;
    color: #6366f1;
}

/* ── Split View: Toggle Button (in tools panel) ─────────────────────────────── */

.svp-toggle-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 6px;
    border: none;
    background: transparent;
    cursor: pointer;
    color: #94a3b8;
    padding: 0;
    transition: background 0.15s, color 0.15s;
    position: relative;
}

.svp-toggle-btn:hover {
    background: rgba(99,102,241,0.12);
    color: #6366f1;
}

.svp-toggle-btn.svp-toggle-btn--active {
    background: rgba(99,102,241,0.18);
    color: #6366f1;
}

.svp-toggle-btn svg {
    width: 16px;
    height: 16px;
    pointer-events: none;
}

/* ── Split View: Divider Resize Handle ──────────────────────────────────────── */

.svp-divider {
    position: fixed;
    top: 0;
    width: 6px;
    height: 100%;
    z-index: 2;
    cursor: col-resize;
    background: transparent;
    transition: background 0.15s;
}

.svp-divider:hover,
.svp-divider--dragging {
    background: rgba(99,102,241,0.25);
}

/* ── Split View: Embed Container (Schedule / Sheet) ─────────────────────── */

.svp-embed-container {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    background: #f8fafc;
    overflow: auto;
    padding: 12px 14px;
    box-sizing: border-box;
    color: #1e293b;
    font-family: system-ui, sans-serif;
    font-size: 12px;
}

.svp-embed-title {
    font-size: 13px;
    font-weight: 600;
    color: #0f172a;
    margin-bottom: 8px;
    padding-bottom: 6px;
    border-bottom: 1px solid rgba(0,0,0,0.1);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.svp-embed-section {
    font-size: 11px;
    font-weight: 600;
    color: #475569;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin: 10px 0 4px;
}

.svp-embed-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 6px;
    color: #475569;
    font-size: 11px;
}

.svp-embed-meta span {
    background: #e2e8f0;
    border-radius: 3px;
    padding: 2px 6px;
}

.svp-embed-table-wrap {
    overflow: auto;
    flex: 1;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
}

.svp-embed-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
}

.svp-embed-table th {
    background: #e2e8f0;
    color: #334155;
    font-weight: 600;
    padding: 5px 8px;
    text-align: left;
    border-bottom: 1px solid #cbd5e1;
    white-space: nowrap;
    position: sticky;
    top: 0;
}

.svp-embed-table td {
    padding: 4px 8px;
    border-bottom: 1px solid #f1f5f9;
    color: #1e293b;
}

.svp-embed-table tr:last-child td {
    border-bottom: none;
}

.svp-embed-table tr:nth-child(even) td {
    background: #f8fafc;
}

.svp-embed-empty-row td {
    color: #94a3b8;
    text-align: center;
    font-style: italic;
    padding: 12px 8px;
}

.svp-embed-empty {
    color: #94a3b8;
    font-style: italic;
    text-align: center;
    padding: 24px;
}

.svp-embed-vp-list {
    margin: 0 0 8px;
    padding: 0 0 0 16px;
    color: #334155;
    font-size: 11px;
    line-height: 1.6;
}

`;

