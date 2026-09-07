/**
 * @file src/styles/panels/projectBrowser.ts
 *
 * CSS for the Project Browser panel (pb- prefix).
 * CONTRACT §05 §2 — CSS layer only, zero logic.
 */
export const PROJECT_BROWSER_STYLES = `
    /* ─── Root container ────────────────────────────────────────────────── */
    .pb-container {
        display: flex;
        flex-direction: column;
        gap: 0;
        width: 100%;
        font-family: var(--app-font);
        color: var(--app-text);
    }

    /* ─── Section wrapper ───────────────────────────────────────────────── */
    .pb-section {
        border-bottom: 1px solid var(--app-border-light);
    }
    .pb-section:last-child { border-bottom: none; }

    /* ─── Section header (collapsible toggle button) — icon-only rail style ─ */
    .pb-section-header {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0;
        width: 100%;
        padding: 0;
        height: 44px;
        background: var(--app-panel-bg);
        border: none;
        cursor: pointer;
        font-family: var(--app-font);
        transition: background 0.1s;
        position: relative;
    }
    .pb-section-header:hover { background: #f7f9ff; }
    .pb-section-header[aria-expanded="true"] {
        background: var(--app-violet-soft);
    }
    .pb-section-header[aria-expanded="true"]:hover {
        background: rgba(102,0,255,0.12);
    }

    /* Chevron and label are hidden — icon replaces them */
    .pb-section-chevron { display: none; }
    .pb-section-label   { display: none; }

    /* ─── Section icon (one SVG per section) ────────────────────────────── */
    .pb-section-icon {
        width: 34px;
        height: 34px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 8px;
        transition: background 0.12s, transform 0.12s;
        user-select: none;
        pointer-events: none;
        flex-shrink: 0;
    }
    .pb-section-icon svg {
        width: 22px;
        height: 22px;
        display: block;
        color: var(--app-text);
        transition: color 0.12s;
    }
    .pb-section-header:hover .pb-section-icon {
        background: rgba(102,0,255,0.06);
    }
    .pb-section-header:hover .pb-section-icon svg {
        color: var(--app-accent);
    }
    .pb-section-header[aria-expanded="true"] .pb-section-icon {
        background: rgba(102,0,255,0.12);
        transform: scale(1.08);
    }
    .pb-section-header[aria-expanded="true"] .pb-section-icon svg {
        color: var(--app-accent);
    }

    /* ─── Section body (collapsed by default, shown via --open) ─────────── */
    .pb-section-body {
        display: none;
        flex-direction: column;
        background: #f4f7fc;
    }
    .pb-section-body--open {
        display: flex;
        min-width: 186px;
    }

    /* ═══ VIEWS — Project Browser-aligned hierarchy ════════════════════════ */

    /* Container */
    .pb-views-container {
        display: flex;
        flex-direction: column;
        gap: 0;
        padding: 2px 0;
    }

    .pb-view-group {
        display: flex;
        flex-direction: column;
        border-bottom: 1px solid var(--app-border-light);
    }
    .pb-view-group:last-child { border-bottom: none; }

    /* ─── Group header ─────────────────────────────────────────────────── */
    .pb-view-group-header {
        display: flex;
        align-items: center;
        gap: 5px;
        padding: 3px 6px 3px 8px;
        background: #edf1fa;
        border-bottom: 1px solid rgba(102,0,255,0.07);
        user-select: none;
    }

    .pb-view-group-icon {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        opacity: 0.85;
    }

    .pb-view-group-label {
        flex: 1;
        font-size: 10px;
        font-weight: 600;
        color: var(--app-text);
        letter-spacing: 0.02em;
    }

    .pb-view-group-count {
        font-size: 9px;
        font-weight: 700;
        color: rgba(102,0,255,0.7);
        background: rgba(102,0,255,0.10);
        border-radius: 9px;
        padding: 0 5px;
        min-width: 16px;
        text-align: center;
        flex-shrink: 0;
        font-variant-numeric: tabular-nums;
        line-height: 15px;
    }

    /* ─── Add (+) button ─────────────────────────────────────────────── */
    .pb-view-add-btn {
        background: transparent;
        border: 1px solid var(--app-border);
        border-radius: 4px;
        color: var(--app-text-2);
        width: 16px;
        height: 16px;
        font-size: 13px;
        line-height: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        flex-shrink: 0;
        transition: background 0.1s, color 0.12s, border-color 0.12s;
        font-family: var(--app-font);
        padding: 0;
    }
    .pb-view-add-btn:hover {
        background: var(--app-violet-soft);
        color: var(--app-accent);
        border-color: var(--app-accent);
    }

    /* ─── View entry row — matches Project Browser row style ───────────── */
    .pb-view-entry {
        display: flex;
        align-items: center;
        gap: 5px;
        padding: 4px 6px 4px 0;
        cursor: pointer;
        font-size: 10.5px;
        font-family: var(--app-font);
        color: var(--app-text);
        background: #ffffff;
        transition: background 0.1s, box-shadow 0.1s;
        user-select: none;
        border-bottom: 1px solid rgba(102,0,255,0.05);
        position: relative;
        overflow: hidden;
    }
    .pb-view-entry:last-child { border-bottom: none; }
    .pb-view-entry:hover {
        background: rgba(102,0,255,0.04);
    }
    .pb-view-entry:hover .pb-view-accent-bar {
        background: rgba(102,0,255,0.25);
    }
    .pb-view-entry:hover .pb-view-actions {
        opacity: 1;
        pointer-events: auto;
    }

    /* Active state — violet accent bar + tinted background */
    .pb-view-entry--active {
        background: rgba(102,0,255,0.05);
    }
    .pb-view-entry--active .pb-view-accent-bar {
        background: #6600FF !important;
    }
    .pb-view-entry--active .pb-view-name {
        font-weight: 600;
        color: #6600FF;
    }
    .pb-view-entry--active:hover { background: rgba(102,0,255,0.08); }

    /* Left accent bar (3 px) */
    .pb-view-accent-bar {
        width: 3px;
        align-self: stretch;
        background: transparent;
        flex-shrink: 0;
        border-radius: 0 2px 2px 0;
        transition: background 0.15s;
    }

    /* Thumbnail box */
    .pb-view-thumb {
        width: 24px;
        height: 18px;
        border-radius: 4px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
    }

    .pb-view-thumb-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0.85;
    }

    /* View name */
    .pb-view-name {
        flex: 1;
        font-size: 10.5px;
        font-weight: 400;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--app-text);
        font-family: var(--app-font);
    }

    /* Level badge — Floor Plan view (§02 SpatialProjection) */
    .pb-view-level-badge {
        flex-shrink: 0;
        padding: 1px 5px;
        border-radius: 10px;
        background: rgba(37,99,235,0.10);
        border: 1px solid rgba(37,99,235,0.25);
        font-size: 8.5px;
        font-weight: 600;
        color: #2563eb;
        white-space: nowrap;
        max-width: 58px;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    /* Sheet badge — shows sheet number when view is placed on a sheet */
    .pb-view-sheet-badge {
        flex-shrink: 0;
        padding: 1px 4px;
        border-radius: 8px;
        background: rgba(102,0,255,0.08);
        border: 1px solid rgba(102,0,255,0.20);
        font-size: 8.5px;
        font-weight: 600;
        color: rgba(102,0,255,0.8);
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
    }

    /* Element count badge */
    .pb-view-count {
        font-size: 9px;
        color: var(--app-text-muted);
        font-variant-numeric: tabular-nums;
        flex-shrink: 0;
        min-width: 12px;
        text-align: right;
    }

    /* ACTIVE pill — violet, matches Project Browser ACTIVE badge */
    .pb-view-active-pill {
        flex-shrink: 0;
        padding: 1px 5px;
        border-radius: 10px;
        background: #6600FF;
        color: #fff;
        font-size: 8px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        white-space: nowrap;
        line-height: 1.3;
    }

    /* Hover-reveal actions (duplicate + delete) */
    .pb-view-actions {
        display: flex;
        align-items: center;
        gap: 2px;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.12s;
        flex-shrink: 0;
        margin-right: 2px;
    }

    .pb-view-action-btn {
        background: none;
        border: none;
        cursor: pointer;
        width: 19px;
        height: 19px;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--app-text-muted);
        transition: background 0.1s, color 0.1s;
        flex-shrink: 0;
    }

    .pb-view-action-btn--dup:hover {
        background: rgba(102,0,255,0.10);
        color: #6600FF;
    }

    .pb-view-action-btn--del:hover {
        background: rgba(220,38,38,0.10);
        color: #dc2626;
    }

    /* VG inheritance dot (kept for compatibility) */
    .pb-view-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        flex-shrink: 0;
    }
    .pb-view-dot--default  { background: #b0b8cc; }
    .pb-view-dot--template { background: var(--app-violet-1); }
    .pb-view-dot--model    { background: #f0a500; }
    .pb-view-dot--view     { background: #3b88e8; }

    .pb-view-override-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #f97316;
        box-shadow: 0 0 0 2px rgba(249,115,22,0.16);
        flex-shrink: 0;
    }

    .pb-view-intent-badge {
        flex-shrink: 0;
        padding: 1px 5px;
        border-radius: 8px;
        font-size: 8px;
        font-weight: 800;
        letter-spacing: 0.04em;
        white-space: nowrap;
        line-height: 1.35;
    }
    .pb-view-intent-badge--pure {
        color: #15803d;
        background: rgba(34,197,94,0.12);
        border: 1px solid rgba(34,197,94,0.24);
    }
    .pb-view-intent-badge--custom {
        color: #c2410c;
        background: rgba(249,115,22,0.12);
        border: 1px solid rgba(249,115,22,0.24);
    }
    .pb-view-intent-badge--none {
        color: #b91c1c;
        background: rgba(239,68,68,0.12);
        border: 1px solid rgba(239,68,68,0.24);
    }

    /* Empty state */
    .pb-view-empty {
        padding: 6px 14px 8px 18px;
        font-size: 10px;
        color: var(--app-text-muted);
        font-style: italic;
        background: #ffffff;
    }

    /* ─── Inline create form ────────────────────────────────────────────── */
    .pb-create-form {
        display: flex;
        flex-direction: column;
        gap: 5px;
        padding: 8px 10px;
        background: #fff;
        border-bottom: 1px solid var(--app-border-light);
    }

    .pb-create-form-input {
        width: 100%;
        box-sizing: border-box;
        padding: 5px 8px;
        border: 1px solid var(--app-border);
        border-radius: var(--app-radius-sm);
        font-size: 11px;
        font-family: var(--app-font);
        color: var(--app-text);
        background: var(--app-panel-bg);
        outline: none;
        transition: border-color 0.15s;
    }
    .pb-create-form-input:focus { border-color: var(--app-accent); }

    .pb-create-form-actions {
        display: flex;
        gap: 5px;
    }

    .pb-create-form-btn {
        flex: 1;
        padding: 4px 8px;
        border: 1px solid var(--app-border);
        border-radius: var(--app-radius-sm);
        font-size: 10px;
        font-family: var(--app-font);
        cursor: pointer;
        background: var(--app-panel-bg);
        color: var(--app-text-2);
        transition: background 0.1s;
    }
    .pb-create-form-btn:hover { background: #f7f9ff; }
    .pb-create-form-btn--primary {
        background: var(--app-gradient);
        color: #fff;
        border-color: transparent;
        font-weight: 600;
    }
    .pb-create-form-btn--primary:hover { opacity: 0.88; }

    /* Level row — Floor Plan create form (§02 SpatialProjection) */
    .pb-create-form-level-row {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 4px;
    }
    .pb-create-form-level-label {
        flex-shrink: 0;
        font-size: 10px;
        font-weight: 600;
        color: var(--app-text-muted);
        white-space: nowrap;
    }
    .pb-create-form-select {
        flex: 1;
        padding: 4px 6px;
        border: 1px solid var(--app-border);
        border-radius: var(--app-radius-sm);
        font-size: 11px;
        font-family: var(--app-font);
        color: var(--app-text);
        background: var(--app-panel-bg);
        cursor: pointer;
        appearance: auto;
    }
    .pb-create-form-select:focus {
        outline: none;
        border-color: var(--app-accent);
    }
    .pb-create-form-validation {
        font-size: 10px;
        color: #e04040;
        padding: 2px 0;
    }

    /* ─── Generic list (Sheets, Schedule) ───────────────────────────────── */
    .pb-generic-list {
        display: flex;
        flex-direction: column;
    }

    .pb-list-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 4px 8px 3px 10px;
        background: #edf1fa;
        border-bottom: 1px solid var(--app-border-light);
    }

    .pb-list-label {
        font-size: 10px;
        font-weight: 600;
        color: var(--app-text-2);
        letter-spacing: 0.04em;
        user-select: none;
    }

    /* ─── Schedule discipline group header ──────────────────────────────── */
    .pb-sched-group-header {
        padding: 5px 10px 4px 10px;
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.07em;
        text-transform: uppercase;
        color: var(--app-text-muted, #6b7280);
        background: var(--app-bg-alt, #f1f3f8);
        border-top: 1px solid var(--app-border-light);
        border-bottom: 1px solid var(--app-border-light);
        user-select: none;
    }
    .pb-sched-group-header:first-child {
        border-top: none;
    }

    /* ─── Schedule entry ────────────────────────────────────────────────── */
    .pb-schedule-entry {
        padding: 6px 10px 6px 20px;
        font-size: 11px;
        color: var(--app-text);
        cursor: pointer;
        border-bottom: 1px solid var(--app-border-light);
        transition: background 0.1s;
        user-select: none;
    }
    .pb-schedule-entry:last-child { border-bottom: none; }
    .pb-schedule-entry:hover { background: rgba(102,0,255,0.05); }

    /* ─── Sheet number badge (Phase III) ────────────────────────────────── */
    .pb-sheet-number {
        display: inline-block;
        font-size: 9px;
        font-weight: 700;
        font-family: monospace;
        color: var(--app-text-2);
        background: rgba(102,0,255,0.08);
        border-radius: 2px;
        padding: 1px 4px;
        margin-right: 6px;
        letter-spacing: 0.03em;
        flex-shrink: 0;
    }

    /* ─── Phase S8: Drawing Register (Sheet Index) ───────────────────────── */

    .pb-register-toggle-btn {
        font-size: 9px;
        font-weight: 600;
        color: var(--app-text-2);
        background: rgba(102,0,255,0.07);
        border: 1px solid rgba(102,0,255,0.15);
        border-radius: 3px;
        padding: 1px 6px;
        cursor: pointer;
        transition: background 0.15s, color 0.15s;
        user-select: none;
        flex-shrink: 0;
        margin-left: 4px;
        letter-spacing: 0.02em;
    }
    .pb-register-toggle-btn:hover {
        background: rgba(102,0,255,0.14);
        color: var(--app-text);
    }
    .pb-register-toggle-btn--active {
        background: rgba(102,0,255,0.18);
        color: var(--app-violet-1);
        border-color: rgba(102,0,255,0.35);
    }

    .pb-register-panel {
        border-top: 1px solid var(--app-border-light);
        background: #f8f9fc;
    }

    .pb-register-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 5px 10px 4px;
        border-bottom: 1px solid var(--app-border-light);
        gap: 6px;
    }

    .pb-register-toolbar-label {
        font-size: 9px;
        font-weight: 700;
        color: var(--app-text-2);
        letter-spacing: 0.06em;
        text-transform: uppercase;
        flex: 1;
    }

    .pb-register-print-btn {
        font-size: 9px;
        font-weight: 600;
        color: var(--app-text-2);
        background: transparent;
        border: 1px solid var(--app-border-light);
        border-radius: 3px;
        padding: 2px 7px;
        cursor: pointer;
        transition: background 0.1s, color 0.1s;
        user-select: none;
        white-space: nowrap;
    }
    .pb-register-print-btn:hover {
        background: rgba(102,0,255,0.07);
        color: var(--app-text);
        border-color: rgba(102,0,255,0.2);
    }

    .pb-register-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 10px;
    }

    .pb-register-thead th {
        position: sticky;
        top: 0;
        background: #edf1fa;
        color: var(--app-text-2);
        font-weight: 600;
        font-size: 9px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        padding: 4px 6px;
        border-bottom: 1px solid var(--app-border-light);
        border-right: 1px solid var(--app-border-light);
        white-space: nowrap;
        user-select: none;
    }
    .pb-register-thead th:last-child {
        border-right: none;
    }

    .pb-register-row {
        cursor: pointer;
        transition: background 0.1s;
        border-bottom: 1px solid var(--app-border-light);
    }
    .pb-register-row:last-child {
        border-bottom: none;
    }
    .pb-register-row:hover {
        background: rgba(102,0,255,0.04);
    }
    .pb-register-row:hover .pb-register-num {
        color: var(--app-violet-1);
    }

    .pb-register-row td {
        padding: 4px 6px;
        color: var(--app-text);
        font-size: 10px;
        vertical-align: middle;
        border-right: 1px solid var(--app-border-light);
        max-width: 120px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .pb-register-row td:last-child {
        border-right: none;
    }

    .pb-register-num {
        font-family: monospace;
        font-size: 9px;
        font-weight: 700;
        color: var(--app-text-2);
    }

    .pb-register-status {
        display: inline-block;
        font-size: 8px;
        font-weight: 600;
        padding: 1px 4px;
        border-radius: 2px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        background: rgba(160,174,192,0.18);
        color: var(--app-text-2);
        white-space: nowrap;
    }
    .pb-register-status--draft            { background: #374151; color: #9ca3af; }
    .pb-register-status--for-review       { background: #1e3a5f; color: #93c5fd; }
    .pb-register-status--for-construction { background: #14532d; color: #86efac; }
    .pb-register-status--issued           { background: #713f12; color: #fde68a; }
    .pb-register-status--superseded       { background: #3b0764; color: #c4b5fd; }

    .pb-register-vp-count {
        font-size: 9px;
        color: var(--app-text-muted);
        text-align: center;
    }

    .pb-register-empty {
        padding: 12px 10px;
        font-size: 10px;
        color: var(--app-text-muted);
        font-style: italic;
        text-align: center;
    }

    /* Status badge on sheet entries in the list (Phase S8 enhancement) */
    .pb-sheet-status-badge {
        display: inline-block;
        font-size: 8px;
        font-weight: 600;
        padding: 1px 4px;
        border-radius: 2px;
        letter-spacing: 0.03em;
        text-transform: uppercase;
        white-space: nowrap;
        flex-shrink: 0;
        margin-left: 4px;
    }
    .pb-sheet-status-badge--draft            { background: #374151; color: #9ca3af; }
    .pb-sheet-status-badge--for-review       { background: #1e3a5f; color: #93c5fd; }
    .pb-sheet-status-badge--for-construction { background: #14532d; color: #86efac; }
    .pb-sheet-status-badge--issued           { background: #713f12; color: #fde68a; }
    .pb-sheet-status-badge--superseded       { background: #3b0764; color: #c4b5fd; }

    /* ─── Tree section ──────────────────────────────────────────────────── */
    .pb-tree-container {
        display: flex;
        flex-direction: column;
        gap: 5px;
        padding: 8px 10px;
    }

    .pb-tree-note {
        font-size: 10px;
        color: var(--app-text-muted);
        line-height: 1.4;
        padding: 4px 2px 0;
    }

    .pb-tree-open-btn {
        font-weight: 700;
    }

    /* ─── AI section ────────────────────────────────────────────────────── */
    .pb-ai-container {
        display: flex;
        flex-direction: column;
        gap: 5px;
        padding: 8px 10px;
    }

    .pb-ai-btn {
        width: 100%;
        padding: 6px 10px;
        background: var(--app-panel-bg);
        border: 1px solid var(--app-border);
        border-radius: var(--app-radius-sm);
        font-size: 11px;
        font-family: var(--app-font);
        font-weight: 600;
        color: var(--app-text);
        cursor: pointer;
        text-align: left;
        transition: background 0.1s, border-color 0.1s;
    }
    .pb-ai-btn:hover { background: var(--app-violet-soft); border-color: var(--app-accent); color: var(--app-accent); }

    /* Phase IV — Pending-proposals badge row */
    .pb-ai-proposal-row {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 4px 0 6px 0;
        border-bottom: 1px solid var(--app-border);
        margin-bottom: 4px;
    }
    .pb-ai-proposal-label {
        flex: 1;
        font-size: 10px;
        font-weight: 600;
        color: var(--app-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        white-space: nowrap;
    }
    .pb-ai-proposal-badge {
        display: none;
        align-items: center;
        justify-content: center;
        min-width: 18px;
        height: 18px;
        padding: 0 5px;
        background: var(--app-accent);
        border-radius: 9px;
        font-size: 10px;
        font-weight: 700;
        color: #fff;
        line-height: 1;
    }
    .pb-ai-review-btn {
        padding: 3px 8px;
        background: transparent;
        border: 1px solid var(--app-accent);
        border-radius: var(--app-radius-sm);
        font-size: 10px;
        font-weight: 600;
        color: var(--app-accent);
        cursor: pointer;
        white-space: nowrap;
        transition: background 0.1s;
    }
    .pb-ai-review-btn:hover { background: var(--app-violet-soft); }

    /* Active state for AI / PDF buttons when inline panel is open */
    .pb-ai-btn--active {
        background: var(--app-violet-soft);
        border-color: var(--app-accent);
        color: var(--app-accent);
    }

    /* Inline content area — holds AI Create or PDF Import content below buttons */
    .pb-ai-inline-area {
        display: none;
        flex-direction: column;
        border-top: 1px solid var(--app-border-light);
        margin-top: 4px;
        overflow: hidden;
    }

    .pb-ai-inline-area--visible {
        display: flex;
    }

    /* Panel wrapper inside the inline area */
    .pb-ai-inline-panel-wrapper {
        display: flex;
        flex-direction: column;
        overflow: hidden;
        flex: 1;
    }

    /* ─── Camera section ────────────────────────────────────────────────── */
    .pb-camera-container {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 8px 10px;
    }

    .pb-camera-btn {
        width: 100%;
        padding: 5px 10px;
        background: var(--app-panel-bg);
        border: 1px solid var(--app-border);
        border-radius: var(--app-radius-sm);
        font-size: 11px;
        font-family: var(--app-font);
        color: var(--app-text-2);
        cursor: pointer;
        text-align: left;
        transition: background 0.1s, color 0.1s;
    }
    .pb-camera-btn:hover { background: #f7f9ff; color: var(--app-text); }

    /* Grid toggle — active (on) state */
    .pb-camera-grid-btn {
        display: flex;
        align-items: center;
        gap: 6px;
    }
    .pb-camera-grid-btn--on {
        background: rgba(110, 142, 251, 0.12);
        color: var(--app-accent);
        border-color: var(--app-accent);
    }
    .pb-camera-grid-btn--off {
        background: var(--app-panel-bg);
        color: var(--app-text-muted);
    }
    .pb-camera-grid-btn--on:hover  { background: rgba(110, 142, 251, 0.22); }
    .pb-camera-grid-btn--off:hover { background: #f7f9ff; color: var(--app-text); }
    .pb-camera-grid-icon { font-size: 0.85rem; }

    /* Phase V — Saved Viewpoints sub-section inside Camera section */
    .pb-camera-vp-header {
        margin-top: 6px;
        padding: 4px 0 3px 0;
        border-top: 1px solid var(--app-border);
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--app-text-muted);
    }
    .pb-camera-vp-save {
        border-style: dashed;
        color: var(--app-accent);
        border-color: var(--app-accent);
    }
    .pb-camera-vp-save:hover { background: var(--app-violet-soft); border-style: solid; }
    .pb-camera-vp-list {
        border: 1px solid var(--app-border);
        border-radius: var(--app-radius-sm);
        background: var(--app-bg);
        max-height: 120px;
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: #c4cde0 transparent;
    }
    .pb-camera-vp-list::-webkit-scrollbar { width: 4px; }
    .pb-camera-vp-list::-webkit-scrollbar-track { background: transparent; }
    .pb-camera-vp-list::-webkit-scrollbar-thumb { background: #c4cde0; border-radius: 2px; }

    /* ─── First-line AI Design Assistant launcher (founder 2026-08-10) ────
       Sits directly under the pb-logo button, above every section icon.
       Reuses the pb-section-header base; the extra class carries the brand
       purple (#6600FF = --app-accent) accent + active (panel-open) state. */
    .pb-ai-launcher-wrapper {
        border-bottom: 1px solid var(--app-border-light);
    }
    .pb-ai-launcher .pb-section-icon svg {
        color: var(--app-accent);
    }
    .pb-ai-launcher:hover .pb-section-icon {
        background: rgba(102,0,255,0.10);
    }
    .pb-ai-launcher--active {
        background: var(--app-violet-soft);
        box-shadow: inset 2px 0 0 0 var(--app-accent);
    }
    .pb-ai-launcher--active .pb-section-icon {
        background: rgba(102,0,255,0.14);
        transform: scale(1.08);
    }
    .pb-ai-launcher--active .pb-section-icon svg {
        color: var(--app-accent);
    }

    /* ─── Logo button — top of the icon rail, above BROWSER ─────────────── */
    .pb-logo-wrapper {
        border-bottom: 1px solid var(--app-border-light);
    }

    .pb-logo-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 48px;
        padding: 0;
        background: var(--app-gradient);
        border: none;
        cursor: pointer;
        transition: opacity 0.15s;
        position: relative;
    }
    .pb-logo-btn:hover { opacity: 0.88; }
    .pb-logo-btn--active {
        box-shadow: inset 0 -2px 0 0 rgba(255,255,255,0.45);
    }

    .pb-logo-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        flex-shrink: 0;
    }

    /* ─── LogoRailPanel content (lrp- prefix) ────────────────────────────── */
    .lrp-root {
        display: flex;
        flex-direction: column;
        font-family: var(--app-font);
        color: var(--app-text);
        background: var(--app-panel-bg);
        height: 100%;
    }

    /* Project name + saved row */
    .lrp-name-row {
        padding: 14px 16px 10px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        border-bottom: 1px solid var(--app-border-light);
    }

    .lrp-name {
        font-size: 16px;
        font-weight: 700;
        color: var(--app-text);
        letter-spacing: -0.01em;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .lrp-saved {
        display: flex;
        align-items: center;
        gap: 5px;
        font-size: 11px;
        color: #22c55e;
        font-weight: 500;
    }
    .lrp-saved--dirty { color: #f59e0b; }

    .lrp-saved-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: currentColor;
        flex-shrink: 0;
    }

    /* Tab bar */
    .lrp-tabbar {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 8px 12px 0;
    }

    .lrp-tab {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 5px 10px;
        border: 1.5px solid var(--app-border);
        border-radius: 20px;
        background: transparent;
        font-size: 11px;
        font-weight: 600;
        font-family: var(--app-font);
        color: var(--app-text-2);
        cursor: pointer;
        transition: background 0.12s, color 0.12s, border-color 0.12s;
        white-space: nowrap;
    }
    .lrp-tab:hover {
        background: var(--app-violet-soft);
        color: var(--app-accent);
        border-color: var(--app-accent);
    }
    .lrp-tab--active {
        background: var(--app-gradient);
        color: #ffffff;
        border-color: transparent;
    }
    .lrp-tab--active:hover {
        opacity: 0.9;
    }
    .lrp-tab svg { flex-shrink: 0; }

    /* Divider */
    .lrp-divider {
        height: 1px;
        background: var(--app-border-light);
        margin: 8px 0 0;
    }

    /* Content area */
    .lrp-content-area {
        flex: 1;
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: #c4cde0 transparent;
    }
    .lrp-content-area::-webkit-scrollbar { width: 4px; }
    .lrp-content-area::-webkit-scrollbar-track { background: transparent; }
    .lrp-content-area::-webkit-scrollbar-thumb { background: #c4cde0; border-radius: 2px; }

    .lrp-tab-body {
        display: flex;
        flex-direction: column;
        padding: 10px 0 0;
    }

    /* Level toggle row */
    .lrp-level-toggle {
        display: flex;
        align-items: center;
        gap: 6px;
        width: 100%;
        padding: 6px 14px;
        background: transparent;
        border: none;
        cursor: pointer;
        font-family: var(--app-font);
        font-size: 10px;
        font-weight: 700;
        color: var(--app-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.06em;
        text-align: left;
        transition: background 0.1s;
    }
    .lrp-level-toggle:hover { background: rgba(102,0,255,0.04); }

    .lrp-level-chevron {
        display: flex;
        align-items: center;
        color: var(--app-text-muted);
        transition: transform 0.15s;
    }

    .lrp-level-label-text { flex: 1; }

    /* Level list */
    .lrp-level-list {
        display: flex;
        flex-direction: column;
    }

    .lrp-level-row {
        display: flex;
        align-items: center;
        gap: 0;
        padding: 0 8px;
        height: 36px;
        cursor: pointer;
        border-bottom: 1px solid var(--app-border-light);
        transition: background 0.1s;
        font-family: var(--app-font);
    }
    .lrp-level-row:last-child { border-bottom: none; }
    .lrp-level-row:hover { background: rgba(102,0,255,0.04); }
    .lrp-level-row--active {
        background: var(--app-violet-soft);
    }
    .lrp-level-row--active:hover { background: rgba(102,0,255,0.12); }

    .lrp-level-arrow {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        border: none;
        background: transparent;
        color: var(--app-text-muted);
        cursor: pointer;
        border-radius: 4px;
        padding: 0;
        transition: background 0.1s, color 0.1s;
        flex-shrink: 0;
    }
    .lrp-level-arrow:hover {
        background: rgba(102,0,255,0.08);
        color: var(--app-accent);
    }

    .lrp-level-name {
        flex: 1;
        font-size: 12px;
        font-weight: 600;
        color: var(--app-text);
        padding: 0 6px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .lrp-level-row--active .lrp-level-name { color: var(--app-accent); }

    .lrp-level-elev {
        font-size: 10px;
        font-family: monospace;
        color: var(--app-text-muted);
        white-space: nowrap;
        padding-right: 4px;
    }
    .lrp-level-row--active .lrp-level-elev { color: var(--app-accent); opacity: 0.75; }

    /* Inspect tab hint */
    .lrp-inspect-body { padding: 16px; }
    .lrp-hint {
        font-size: 11px;
        color: var(--app-text-muted);
        line-height: 1.5;
        font-style: italic;
    }

    /* Data section header */
    .lrp-data-section-hdr {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 14px 6px;
        font-size: 11px;
        font-weight: 700;
        color: var(--app-accent);
        letter-spacing: 0.03em;
    }

    /* Physics row */
    .lrp-physics-row {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        padding: 8px 14px;
        background: var(--app-panel-bg);
        border: none;
        border-top: 1px solid var(--app-border-light);
        border-bottom: 1px solid var(--app-border-light);
        cursor: pointer;
        font-family: var(--app-font);
        font-size: 11px;
        font-weight: 600;
        color: var(--app-text);
        text-align: left;
        transition: background 0.1s;
    }
    .lrp-physics-row:hover { background: #f7f9ff; }

    .lrp-physics-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
    }

    .lrp-physics-label { flex: 1; }

    .lrp-physics-chevron {
        color: var(--app-text-muted);
        flex-shrink: 0;
    }

    /* Voice button */
    .lrp-voice-btn {
        display: flex;
        align-items: center;
        gap: 7px;
        margin: 10px 14px;
        padding: 7px 14px;
        background: #ef4444;
        color: #ffffff;
        border: none;
        border-radius: var(--app-radius-sm);
        font-size: 12px;
        font-weight: 700;
        font-family: var(--app-font);
        cursor: pointer;
        width: calc(100% - 28px);
        transition: background 0.12s;
    }
    .lrp-voice-btn:hover { background: #dc2626; }

/* ═══════════════════════════════════════════════════════════════════════════
   §GIS-ACTION-REGISTRY (L-1361, C06 §13) — the GIS panel's action rows
   ═══════════════════════════════════════════════════════════════════════════

   Founder 2026-08-20: "Can you make the UI/UX of the elements within the GIS
   panel properly, according to the graphics of PRYZM?" — the panel worked but
   the rows were unstyled white against a heavy saturated purple header, the
   disabled row differed from a live one only in text colour, and there was no
   active treatment at all.

   ⛔ EVERY COLOUR HERE IS A TOKEN. Not one hex literal. C84 EI-8 names colour
   as a one-vocabulary concept and records two measured hex drifts in this
   codebase already ("black" = #333333 in one table vs #000000 in five; "green"
   = #008000 vs #00ff00). The brand purple is "--app-accent", the violet ramp is
   "--app-violet-*", the panel inks are "--pryzm-panel-ink*". A literal #6600FF
   in this block would be that defect a third time.

   The three states must read at a glance and NOT by colour alone (C43 / WCAG
   2.2 AA): active adds a left bar + fill + "aria-pressed", unavailable adds a
   dashed edge + a "soon" tag + "aria-disabled", hover adds a tinted wash. */

.pb-gis-actions {
    display: flex;
    flex-direction: column;
    gap: 3px;
}

/* The group caption. Quiet by design — it separates, it does not compete with
   the rows it labels. */
.pb-gis-group {
    font-size: var(--app-font-size-label);
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--app-text-muted);
    padding: 10px 2px 4px;
}
.pb-gis-actions > .pb-gis-group:first-child { padding-top: 2px; }

/* ─── The row ──────────────────────────────────────────────────────────────
   "--app-violet-soft" is the brand's own 8%-alpha purple wash, so a resting row
   is faintly PRYZM rather than plain white — which was the founder's "the rows
   carry no PRYZM identity at all". */
.pb-gis-action {
    position: relative;
    display: flex;
    align-items: center;
    gap: 9px;
    width: 100%;
    padding: 7px 10px;
    background: var(--app-panel-bg);
    border: 1px solid var(--app-border-light);
    border-radius: var(--app-radius-sm);
    font-family: var(--app-font);
    font-size: var(--pryzm-panel-font-size-body);
    color: var(--pryzm-panel-ink);
    text-align: left;
    cursor: pointer;
    transition: background 0.12s, border-color 0.12s, color 0.12s;
}
.pb-gis-action:hover:not(:disabled) {
    background: var(--app-violet-soft);
    border-color: var(--app-accent);
    color: var(--app-accent);
}
/* Keyboard parity — the rail is reachable by Tab and the focus ring must be as
   legible as the hover, not a browser default over a tinted surface. */
.pb-gis-action:focus-visible {
    outline: 2px solid var(--app-accent);
    outline-offset: 1px;
}

.pb-gis-action-icon {
    flex: none;
    width: 18px;
    text-align: center;
    font-size: var(--pryzm-panel-font-size-body);
    color: var(--app-accent);
}
.pb-gis-action-label { font-weight: 500; }

/* ─── ACTIVE: "this is what you are looking at" ────────────────────────────
   A filled row plus a solid left bar. The bar is what makes the state survive
   a greyscale screenshot and a colour-blind reader; "aria-pressed" on the
   element makes it survive a screen reader. */
.pb-gis-action--active {
    background: var(--app-violet-soft);
    border-color: var(--app-accent);
    color: var(--app-accent);
    font-weight: 600;
}
.pb-gis-action--active::before {
    content: "";
    position: absolute;
    left: 0;
    top: 4px;
    bottom: 4px;
    width: 3px;
    border-radius: 0 2px 2px 0;
    background: var(--app-accent);
}
.pb-gis-action--active .pb-gis-action-icon { color: var(--app-accent); }

/* ─── UNAVAILABLE: declared, audited, not yet re-hosted ────────────────────
   The founder could not tell the disabled "Floors shown" row from a live one.
   It is not merely a paler live row now: dashed edge, muted ink, no pointer,
   and an explicit "soon" tag, so the difference is carried by shape and by a
   WORD, not by colour alone. */
.pb-gis-action--unavailable {
    background: var(--app-bg);
    border-style: dashed;
    border-color: var(--app-border);
    color: var(--app-text-muted);
    cursor: not-allowed;
}
.pb-gis-action--unavailable .pb-gis-action-icon { color: var(--app-text-muted); }

.pb-gis-action-tag {
    margin-left: auto;
    flex: none;
    padding: 1px 6px;
    border-radius: 999px;
    background: var(--app-border-light);
    color: var(--app-text-muted);
    font-size: var(--app-font-size-label);
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
}

/* ─── The buildability read-out, re-hosted into this panel (L-1362) ────────
   The card keeps its own internal markup — it is re-parented, not rebuilt — so
   this only neutralises the floating-card geometry it no longer needs. */
/* The honest empty state. It is TEXT, deliberately: C58 refuses to draw an envelope it
   cannot derive, and the panel must carry that refusal through in words rather than as a
   blank gap (which reads as a crash) or as zeros (which read as "nothing is buildable"). */
.pb-gis-envelope-empty {
    padding: 8px 10px;
    border: 1px dashed var(--app-border);
    border-radius: var(--app-radius-sm);
    background: var(--app-bg);
    color: var(--app-text-muted);
    font-size: var(--pryzm-panel-font-size-meta);
    line-height: 1.45;
}

.pb-gis-envelope-slot {
    margin-top: 8px;
    border-top: 1px solid var(--app-border-light);
    padding-top: 8px;
}

/* §L-1587 — the recompute escape hatch under the envelope empty state. Tokens only
   (C06 §7.3): the same --app-* family the parcel card's action uses, so the two GIS
   sections read as one surface rather than two people's buttons. */
.pb-gis-envelope-retry {
    display: block;
    width: 100%;
    margin-top: 6px;
    padding: 6px 10px;
    border: 1px solid var(--app-border);
    border-radius: var(--app-radius-sm);
    background: var(--app-bg-elevated, var(--app-bg));
    color: var(--app-text);
    font-size: var(--pryzm-panel-font-size-meta);
    font-family: inherit;
    cursor: pointer;
    text-align: left;
}
.pb-gis-envelope-retry:hover:not(:disabled) {
    border-color: var(--app-accent, var(--app-border));
    color: var(--app-accent, var(--app-text));
}
.pb-gis-envelope-retry:disabled {
    opacity: 0.6;
    cursor: default;
}

/* ─── §L-1581 — the ONE parcel data card (parcelCard.ts) ───────────────────
   Painted by CLASS, from tokens only, so the SAME element reads correctly in
   both of its hosts: the map overlay (SiteBoundaryMap2D) and the GIS rail slot.
   AppTheme injects this sheet globally, which is what lets one producer serve
   two surfaces without either host re-styling it — the L-1361 rule (no literal
   colour in a builder) applied to a card instead of a button. */
.pryzm-parcel-card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 12px;
    border: 1px solid var(--app-border-light);
    border-radius: var(--app-radius-sm);
    background: var(--app-panel-bg);
    color: var(--pryzm-panel-ink);
    font-family: var(--app-font);
    font-size: var(--pryzm-panel-font-size-body);
    line-height: 1.45;
}
.pryzm-parcel-card-title {
    font-size: var(--app-font-size-label);
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--app-accent);
}
.pryzm-parcel-card-row { display: flex; gap: 8px; align-items: baseline; }
.pryzm-parcel-card-key {
    flex: 0 0 auto;
    min-width: 92px;
    color: var(--app-text-muted);
}
.pryzm-parcel-card-val { font-weight: 600; word-break: break-word; }

/* An UNKNOWN is carried by a sentence, never by a blank row or a zero
   (C84 EI-1b). Dashed edge + muted ink so it cannot be mistaken for data —
   the same treatment .pb-gis-envelope-empty uses, deliberately. */
.pryzm-parcel-card-absent {
    padding: 8px 10px;
    border: 1px dashed var(--app-border);
    border-radius: var(--app-radius-sm);
    background: var(--app-bg);
    color: var(--app-text-muted);
    font-size: var(--pryzm-panel-font-size-meta);
}

/* The footprint / degenerate-ring warning. It must survive greyscale and a
   colour-blind reader, so the meaning is carried by the WORDS and by the
   border, not by hue alone (C43 / WCAG 2.2 AA). */
.pryzm-parcel-card-warn {
    padding: 5px 8px;
    border: 1px solid var(--app-status-warning);
    border-radius: var(--app-radius-sm);
    background: var(--vg-badge-warn-bg);
    color: var(--vg-badge-warn-color);
    font-size: var(--pryzm-panel-font-size-meta);
    font-weight: 600;
}
.pryzm-parcel-card-note {
    color: var(--app-text-muted);
    font-size: var(--pryzm-panel-font-size-meta);
}
/* §26.6.1 (L-13046) — a note that sits ON THE SAME LINE as the figure it qualifies: the third
   cell of a card row, taking the remaining width and wrapping inside it, never a caption beneath. */
.pryzm-parcel-card-note--inline {
    flex: 1 1 auto;
    min-width: 0;
    font-weight: 400;
}
.pryzm-parcel-card-source {
    color: var(--app-text-muted);
    font-size: var(--pryzm-panel-font-size-meta);
    border-top: 1px solid var(--app-border-light);
    padding-top: 5px;
}
.pryzm-parcel-card-source + .pryzm-parcel-card-source {
    border-top: none;
    padding-top: 0;
}
.pryzm-parcel-card-actions { display: flex; flex-direction: column; gap: 6px; margin-top: 2px; }
.pryzm-parcel-card-btn {
    padding: 8px 10px;
    border-radius: var(--app-radius-sm);
    font-family: var(--app-font);
    font-size: var(--pryzm-panel-font-size-body);
    font-weight: 600;
    cursor: pointer;
    transition: background 0.12s, border-color 0.12s, color 0.12s;
}
.pryzm-parcel-card-btn--primary {
    border: 1px solid var(--app-accent);
    background: var(--app-accent);
    color: #ffffff;
}
.pryzm-parcel-card-btn--secondary {
    border: 1px solid var(--app-accent);
    background: transparent;
    color: var(--app-accent);
}
.pryzm-parcel-card-btn:disabled {
    cursor: not-allowed;
    opacity: 0.55;
}
.pryzm-parcel-card-btn:focus-visible {
    outline: 2px solid var(--app-accent);
    outline-offset: 1px;
}

/* The rail slot that hosts the card (mirrors .pb-gis-envelope-slot). */
.pb-gis-parcel-slot {
    margin-top: 8px;
    border-top: 1px solid var(--app-border-light);
    padding-top: 8px;
}

/* §PARCEL-OWN-PANEL (L-5130) — the DEDICATED parcel rail panel.
   Layout only. The card inside is produced by parcelCard.ts and styled by
   .pryzm-parcel-card above; restyling it from here would fork the one card
   producer's appearance per host, which is the drift this panel exists to not
   introduce. */
.pb-parcel-panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
}

.pb-parcel-intro {
    color: var(--pryzm-panel-ink-muted, var(--pryzm-panel-ink));
    font-family: var(--app-font);
    font-size: var(--pryzm-panel-font-size-small, 11px);
    line-height: 1.5;
    /* ⛔ NO text-overflow/ellipsis and NO nowrap. A truncated disclosure destroyed
       a user-facing sentence elsewhere today; this text MUST be able to wrap. */
    white-space: normal;
    overflow-wrap: anywhere;
}

/* The slot is a plain flow container: the section it hosts brings its own card,
   its own three states and its own action button. */
.pb-parcel-slot {
    display: block;
}

/* The map overlay hosts the SAME element as a floating card — position and
   width are the HOST's business, so they are scoped to the host, never baked
   into the producer. */
.pryzm-gis-parcel-host {
    position: absolute;
    top: 92px;
    right: 12px;
    z-index: 22;
    width: 262px;
    box-shadow: 0 4px 18px rgba(60,52,40,0.22);
    border-radius: var(--app-radius-sm);
}
.pryzm-gis-parcel-host > .pryzm-parcel-card {
    background: var(--app-panel-bg);
    border-color: var(--app-accent);
}

/* §PARCEL-ALL-INFO (L-6905) — the Parcel panel hosts the SAME singleton card, so it needs the
   SAME de-floating rule. The selector is a shared list rather than a copied block: the card's
   floating geometry is one fact, and two rules that can drift is how one host ends up with a
   300px absolutely-positioned card inside a rail column. */
.pb-gis-envelope-slot > [data-testid="buildable-envelope-card"],
.pb-parcel-envelope-slot > [data-testid="buildable-envelope-card"] {
    position: static !important;
    width: 100% !important;
    max-width: 100% !important;
    max-height: none !important;
    top: auto !important;
    right: auto !important;
    left: auto !important;
    box-shadow: none !important;
    border: 1px solid var(--app-border-light) !important;
    resize: none !important;
}

/* §PARCEL-ALL-INFO (L-6905..L-6909) — the Parcel panel's envelope half. */
.pb-parcel-envelope-slot {
    margin-top: 8px;
    border-top: 1px solid var(--app-border-light);
    padding-top: 8px;
    min-width: 0;
}

/* The five-state sentence. TEXT, deliberately: C58 refuses to publish a figure it cannot cite,
   and the panel carries that refusal through in words rather than as a blank gap (which reads
   as a crash) or as zeros (which read as "nothing is buildable"). */
.pb-parcel-envelope-state {
    padding: 8px 10px;
    border: 1px dashed var(--app-border);
    border-radius: var(--app-radius-sm);
    background: var(--app-bg);
    color: var(--app-text-muted);
    font-size: var(--pryzm-panel-font-size-meta);
    line-height: 1.45;
    /* ⛔ NO ellipsis, NO nowrap — every one of these sentences is a disclosure and a
       truncated disclosure is worse than none (the .pb-parcel-intro rule, same reason). */
    white-space: normal;
    overflow-wrap: anywhere;
}

/* RESOLVING is the one state that is not an absence, so it is the one state that is not
   dashed-and-grey: it reads as work in progress, in the brand purple, never as a warning. */
.pb-parcel-envelope-state[data-state="resolving"] {
    border-style: solid;
    border-color: var(--app-accent, #6600FF);
    background: var(--app-violet-soft, rgba(102, 0, 255, 0.06));
    color: var(--app-accent, #6600FF);
}

/* The notice above a PRESENT card whose figures are the provisional fallback. Same purple
   family as the resolving state — it is the same fact, told beside data instead of instead
   of it. */
.pb-parcel-envelope-resolving {
    margin-bottom: 6px;
    padding: 6px 9px;
    border-radius: var(--app-radius-sm);
    background: var(--app-violet-soft, rgba(102, 0, 255, 0.06));
    color: var(--app-accent, #6600FF);
    font-size: var(--pryzm-panel-font-size-meta);
    line-height: 1.45;
    white-space: normal;
    overflow-wrap: anywhere;
}

/* The escape hatch. Tokens only (C06 §7.3) — the same --app-* family the parcel card's own
   action button uses, so the two halves of this panel read as one surface. */
.pb-parcel-envelope-recompute {
    display: block;
    width: 100%;
    margin-top: 6px;
    padding: 6px 10px;
    border: 1px solid var(--app-border);
    border-radius: var(--app-radius-sm);
    background: var(--app-bg-elevated, var(--app-bg));
    color: var(--app-text);
    font-size: var(--pryzm-panel-font-size-meta);
    font-family: inherit;
    cursor: pointer;
    text-align: left;
}
.pb-parcel-envelope-recompute:hover:not(:disabled) {
    border-color: var(--app-accent, var(--app-border));
    color: var(--app-accent, var(--app-text));
}
.pb-parcel-envelope-recompute:disabled {
    opacity: 0.6;
    cursor: default;
}

`;

/**
 * PhysicsRailPanel (phys- prefix) — physics / simulation mode selector.
 * Opened from the lightning-bolt icon in the left-rail icon strip.
 * Used by src/ui/ViewBrowser/panels/PhysicsRailPanel.ts
 */
export const PHYS_RAIL_PANEL_STYLES = `
    /* ── Panel root ───────────────────────────────────────────────────── */
    .phys-root {
        display: flex;
        flex-direction: column;
        padding: 6px 0;
        gap: 0;
        background: var(--app-panel-bg, #ffffff);
        border-radius: var(--app-radius-md);
        overflow: hidden;
    }

    /* ── Mode row ─────────────────────────────────────────────────────── */
    .phys-row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 16px;
        width: 100%;
        border: none;
        background: transparent;
        color: var(--app-text, #1a2035);
        font-family: var(--app-font);
        font-size: 12.5px;
        font-weight: 500;
        cursor: pointer;
        text-align: left;
        transition: background 0.12s, color 0.12s;
        border-bottom: 1px solid var(--app-border-light, #eef1f8);
    }
    .phys-row:last-child { border-bottom: none; }
    .phys-row:hover {
        background: var(--app-violet-soft, rgba(102,0,255,0.06));
        color: var(--app-accent, #6600FF);
    }
    .phys-row--active {
        background: var(--app-violet-soft, rgba(102,0,255,0.08));
        color: var(--app-accent, #6600FF);
        font-weight: 600;
    }
    .phys-row--active:hover {
        background: rgba(102,0,255,0.12);
    }

    /* ── Row parts ────────────────────────────────────────────────────── */
    .phys-row-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        flex-shrink: 0;
        color: inherit;
    }
    .phys-row-label { flex: 1; }
    .phys-row-check {
        display: flex;
        align-items: center;
        color: var(--app-accent, #6600FF);
        flex-shrink: 0;
    }

    /* ═══ PROJECT HUB PANEL (phub-*) — collapsible card sections ═══════════ */

    .phub-container {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 8px;
        background: #f4f7fc;
        min-height: 100%;
        box-sizing: border-box;
        overflow-y: visible;
    }

    /* ── Section card ─────────────────────────────────────────────────── */
    .phub-section {
        background: #ffffff;
        border-radius: 10px;
        border: 1px solid #e8edf8;
        overflow: hidden;
        flex-shrink: 0;
    }

    /* ── Section header (toggle button) ───────────────────────────────── */
    .phub-section-header {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        padding: 9px 12px;
        background: #ffffff;
        border: none;
        cursor: pointer;
        font-family: var(--app-font);
        text-align: left;
        transition: background 0.12s;
    }
    .phub-section-header:hover {
        background: rgba(102,0,255,0.04);
    }
    .phub-section-bullet {
        font-size: 14px;
        color: var(--app-accent, #6600FF);
        line-height: 1;
        flex-shrink: 0;
    }
    .phub-section-label {
        flex: 1;
        font-size: 11px;
        font-weight: 700;
        color: var(--app-text, #1a2035);
        text-transform: uppercase;
        letter-spacing: 0.06em;
    }
    .phub-section-chevron {
        color: var(--app-text-muted, #8899bb);
        flex-shrink: 0;
        transition: transform 0.2s ease;
    }
    .phub-section-chevron--open {
        transform: rotate(180deg);
    }

    /* ── Section body ─────────────────────────────────────────────────── */
    .phub-section-body {
        display: none;
        flex-direction: column;
        border-top: 1px solid #f0f3fc;
    }
    .phub-section-body.phub-open {
        display: flex;
    }

    /* ── Description text inside a section ────────────────────────────── */
    .phub-section-desc {
        margin: 0;
        padding: 8px 12px 6px;
        font-size: 11px;
        color: var(--app-text-muted, #8899bb);
        line-height: 1.45;
        font-family: var(--app-font);
    }

    /* ── Item button ──────────────────────────────────────────────────── */
    .phub-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 12px;
        background: none;
        border: none;
        border-bottom: 1px solid #f4f7fc;
        width: 100%;
        text-align: left;
        font-family: var(--app-font);
        font-size: 13px;
        color: var(--app-text-2, #4a5568);
        cursor: pointer;
        transition: background 0.1s, color 0.1s;
    }
    .phub-item:last-child { border-bottom: none; }
    .phub-item:hover {
        background: rgba(102,0,255,0.05);
        color: var(--app-text, #1a2035);
    }
    .phub-item--primary {
        color: var(--app-accent, #6600FF);
        font-weight: 600;
    }
    .phub-item--primary .phub-item-icon svg {
        color: var(--app-accent, #6600FF);
    }
    .phub-item--danger { color: #dc2626; }
    .phub-item--danger:hover { background: rgba(220,38,38,0.05); color: #dc2626; }

    .phub-item-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        flex-shrink: 0;
        color: var(--app-accent, #6600FF);
        opacity: 0.75;
    }
    .phub-item--danger .phub-item-icon { color: #dc2626; opacity: 1; }
    .phub-item-label { flex: 1; }
    .phub-item-badge {
        margin-left: auto;
        font-size: 10px;
        font-weight: 700;
        padding: 2px 7px;
        border-radius: 8px;
        background: rgba(102,0,255,0.10);
        color: var(--app-accent, #6600FF);
        letter-spacing: 0.02em;
        flex-shrink: 0;
    }
`;

