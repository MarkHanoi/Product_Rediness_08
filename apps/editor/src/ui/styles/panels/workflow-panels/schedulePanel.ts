/**
 * @file src/engine/subsystems/styles/panels/workflow-panels/schedulePanel.ts
 *
 * Schedule editor panel — sched-* prefix.
 * CONTRACT §05 §2 — CSS layer only, zero logic.
 */
export const SCHEDULE_PANEL_STYLES = `
    .sched-panel {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 80%;
        height: 70%;
        background: var(--app-bg);
        border-radius: var(--app-radius-lg);
        pointer-events: auto;
        box-shadow: var(--app-shadow-panel);
        z-index: 10000;
        display: none;
        flex-direction: column;
        font-family: var(--app-font);
        color: var(--app-text);
        overflow: hidden;
    }

    .sched-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 16px;
        background: var(--app-gradient);
        flex-shrink: 0;
        box-shadow: var(--app-shadow-header);
    }

    .sched-title {
        margin: 0;
        font-size: 13px;
        font-weight: 700;
        color: #ffffff;
        letter-spacing: 0.04em;
        text-transform: uppercase;
    }

    .sched-close {
        background: none;
        border: none;
        color: rgba(255,255,255,0.8);
        cursor: pointer;
        font-size: 18px;
        line-height: 1;
        padding: 0;
        transition: color 0.12s;
        font-family: var(--app-font);
    }
    .sched-close:hover { color: #ffffff; }

    .sched-table-wrap {
        flex: 1;
        overflow: auto;
        border-radius: var(--app-radius-md);
        border: 1px solid var(--app-border);
        background: var(--app-panel-bg);
        scrollbar-width: thin;
        scrollbar-color: #c4cde0 transparent;
    }

    .sched-table {
        width: max-content;
        min-width: 100%;
        border-collapse: collapse;
        font-size: 12px;
        color: var(--app-text);
        table-layout: fixed;
    }

    .sched-th-resizable {
        position: sticky;
        top: 0;
        background: var(--app-bg);
        padding: 0;
        text-align: left;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--app-text-muted);
        border-bottom: 2px solid var(--app-border);
        border-right: 1px solid var(--app-border-light);
        white-space: nowrap;
        overflow: hidden;
        user-select: none;
    }

    .sched-th-label {
        display: block;
        padding: 8px 28px 8px 12px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .sched-col-resize-handle {
        position: absolute;
        top: 0;
        right: 0;
        width: 6px;
        height: 100%;
        cursor: col-resize;
        background: transparent;
        transition: background 0.1s;
        z-index: 1;
    }
    .sched-col-resize-handle:hover,
    .sched-col-resize-handle:active {
        background: var(--app-violet, #7c3aed);
        opacity: 0.4;
    }

    .sched-table td {
        padding: 7px 12px;
        border-bottom: 1px solid var(--app-border-light);
        border-right: 1px solid var(--app-border-light);
        vertical-align: middle;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 0;
    }
    .sched-table td:last-child { border-right: none; }

    .sched-table tr:last-child td { border-bottom: none; }
    .sched-table tr:hover td { background: var(--app-violet-soft); }
    .sched-table tr.sched-row--selected td {
        background: var(--app-accent, #6366f1);
        color: #fff;
    }

    /* Mark badges inside schedule cells */
    .sched-mark-badge {
        display: inline-block;
        font-size: 10px;
        font-weight: 700;
        border-radius: 3px;
        padding: 1px 5px;
        margin: 1px 2px 1px 0;
        letter-spacing: 0.02em;
    }
    .sched-mark-door {
        background: #4b5563;
        color: #fff;
    }
    .sched-mark-window {
        background: #2563eb;
        color: #fff;
    }

    .sched-empty {
        padding: 2rem;
        text-align: center;
        color: var(--app-text-muted);
        font-size: 13px;
    }

    /* ── Layout: wraps sidebar + body ──────────────────────────────────────── */
    .sched-layout {
        flex: 1;
        display: flex;
        min-height: 0;
        overflow: hidden;
    }

    .sched-body {
        flex: 1;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        padding: 1rem;
        gap: 0.5rem;
        min-height: 0;
    }

    /* ── Header extras ─────────────────────────────────────────────────────── */
    .sched-count-badge {
        font-size: 11px;
        font-weight: 600;
        color: rgba(255,255,255,0.65);
        background: rgba(255,255,255,0.12);
        border-radius: 10px;
        padding: 2px 8px;
        margin-left: auto;
        white-space: nowrap;
    }

    /* ── Fields (column picker) button ─────────────────────────────────────── */
    .sched-fields-btn {
        display: flex;
        align-items: center;
        gap: 5px;
        background: rgba(255,255,255,0.10);
        border: 1px solid rgba(255,255,255,0.20);
        border-radius: 5px;
        color: rgba(255,255,255,0.85);
        cursor: pointer;
        font-size: 11px;
        font-weight: 600;
        padding: 4px 10px;
        transition: background 0.12s, border-color 0.12s;
        font-family: var(--app-font);
        margin-left: 8px;
    }
    .sched-fields-btn:hover {
        background: rgba(255,255,255,0.18);
        border-color: rgba(255,255,255,0.35);
        color: #ffffff;
    }
    .sched-fields-btn--active {
        background: rgba(255,255,255,0.22);
        border-color: rgba(255,255,255,0.50);
        color: #ffffff;
    }
    .sched-fields-badge {
        background: rgba(255,255,255,0.20);
        border-radius: 8px;
        padding: 1px 5px;
        font-size: 10px;
        font-weight: 700;
    }

    /* ── Fields sidebar ─────────────────────────────────────────────────────── */
    .sched-fields-sidebar {
        width: 186px;
        min-width: 186px;
        background: var(--app-panel-bg, #f8f9fb);
        border-right: 1px solid var(--app-border);
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }

    .sched-fields-sidebar-title {
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.07em;
        color: var(--app-text-muted);
        padding: 10px 12px 4px;
        border-bottom: 1px solid var(--app-border-light);
        flex-shrink: 0;
    }

    .sched-fields-quick {
        display: flex;
        gap: 6px;
        padding: 8px 12px;
        border-bottom: 1px solid var(--app-border-light);
        flex-shrink: 0;
    }

    .sched-fields-quick-btn {
        flex: 1;
        background: none;
        border: 1px solid var(--app-border);
        border-radius: 4px;
        color: var(--app-text-muted);
        font-size: 10px;
        font-weight: 600;
        cursor: pointer;
        padding: 3px 6px;
        font-family: var(--app-font);
        transition: border-color 0.1s, color 0.1s;
    }
    .sched-fields-quick-btn:hover {
        border-color: var(--app-violet, #7c3aed);
        color: var(--app-violet, #7c3aed);
    }

    .sched-fields-list {
        list-style: none;
        margin: 0;
        padding: 6px 0;
        overflow-y: auto;
        flex: 1;
        scrollbar-width: thin;
        scrollbar-color: #c4cde0 transparent;
    }

    .sched-fields-item {
        padding: 0;
    }

    .sched-fields-label {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 5px 12px;
        font-size: 12px;
        color: var(--app-text);
        cursor: pointer;
        transition: background 0.08s;
    }
    .sched-fields-label:hover {
        background: var(--app-violet-soft, rgba(124,58,237,0.06));
    }

    .sched-fields-check {
        width: 13px;
        height: 13px;
        cursor: pointer;
        accent-color: var(--app-violet, #7c3aed);
        flex-shrink: 0;
    }
`;
