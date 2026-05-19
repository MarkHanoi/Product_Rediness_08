/**
 * @file src/engine/subsystems/styles/panels/rendering-panels/exportStudioPanel.ts
 *
 * Export Studio panel — es- prefix.
 * CONTRACT §05 §2 — CSS layer only, zero logic.
 */
export const EXPORT_STUDIO_STYLES = `

    /* ── Toast animation ────────────────────────────────────────────────── */
    @keyframes es-toast-in {
        from { opacity: 0; transform: translateY(8px); }
        to   { opacity: 1; transform: translateY(0);   }
    }

    /* ── Panel container ────────────────────────────────────────────────── */
    .es-panel {
        display: none;
        flex-direction: column;
        position: fixed;
        top: 60px;
        right: 12px;
        width: 320px;
        max-height: calc(100vh - 80px);
        background: var(--app-bg);
        border-radius: var(--app-radius-lg);
        box-shadow: var(--app-shadow-panel);
        z-index: 3200;
        overflow: hidden;
        font-family: var(--app-font);
        border: 1px solid var(--app-border);
    }

    /* ── Header ─────────────────────────────────────────────────────────── */
    .es-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 14px;
        background: var(--app-gradient);
        flex-shrink: 0;
        box-shadow: var(--app-shadow-header);
    }
    .es-header-title {
        display: flex;
        align-items: center;
        gap: 7px;
        font-size: 13px;
        font-weight: 700;
        color: #fff;
        letter-spacing: 0.02em;
    }
    .es-header-icon {
        font-size: 15px;
    }
    .es-close-btn {
        background: rgba(255,255,255,0.15);
        border: none;
        color: #fff;
        font-size: 16px;
        line-height: 1;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.15s;
    }
    .es-close-btn:hover {
        background: rgba(255,255,255,0.28);
    }

    /* ── Tab bar ────────────────────────────────────────────────────────── */
    .es-tabs {
        display: flex;
        gap: 2px;
        padding: 8px 8px 0;
        background: var(--app-bg);
        flex-shrink: 0;
    }
    .es-tab {
        flex: 1;
        padding: 6px 4px;
        border: none;
        border-radius: var(--app-radius-sm) var(--app-radius-sm) 0 0;
        background: var(--app-border-light);
        color: var(--app-text-muted);
        font-size: 10px;
        font-weight: 600;
        cursor: pointer;
        font-family: var(--app-font);
        letter-spacing: 0.02em;
        transition: background 0.15s, color 0.15s;
    }
    .es-tab:hover:not(.es-tab--active) {
        background: var(--app-border);
        color: var(--app-text-2);
    }
    .es-tab--active {
        background: var(--app-panel-bg);
        color: var(--app-accent);
        font-weight: 700;
    }

    /* ── Scrollable body (per tab pane) ─────────────────────────────────── */
    .es-body {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 10px;
        overflow-y: auto;
        background: var(--app-bg);
    }

    /* ── Section card ───────────────────────────────────────────────────── */
    .es-section {
        background: var(--app-panel-bg);
        border-radius: var(--app-radius-md);
        padding: 10px 12px;
        box-shadow: var(--app-shadow-card);
        border: 1px solid var(--app-border-light);
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    .es-section-label {
        font-size: 9.5px;
        font-weight: 700;
        color: var(--app-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.06em;
    }

    /* ── Quality preset cards ───────────────────────────────────────────── */
    .es-presets {
        display: flex;
        gap: 5px;
    }
    .es-preset-btn {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 3px;
        padding: 8px 4px;
        border: 1.5px solid var(--app-border);
        border-radius: var(--app-radius-sm);
        background: var(--app-bg);
        cursor: pointer;
        font-family: var(--app-font);
        transition: border-color 0.15s, background 0.15s;
    }
    .es-preset-btn:hover {
        border-color: var(--app-violet-1);
        background: var(--app-violet-soft);
    }
    .es-preset-btn.es-preset-btn--active,
    .es-preset-btn.es-preset-btn--active:hover {
        border-color: var(--app-accent);
        background: var(--app-violet-soft);
    }
    .es-preset-icon {
        font-size: 16px;
    }
    .es-preset-label {
        font-size: 10px;
        font-weight: 700;
        color: var(--app-text);
    }
    .es-preset-res {
        font-size: 9px;
        color: var(--app-text-muted);
        font-weight: 600;
    }
    .es-preset-time {
        font-size: 8.5px;
        color: var(--app-text-muted);
    }

    /* ── Select dropdowns ───────────────────────────────────────────────── */
    .es-select {
        width: 100%;
        padding: 6px 8px;
        border: 1px solid var(--app-border);
        border-radius: var(--app-radius-sm);
        background: var(--app-bg);
        color: var(--app-text);
        font-size: 11px;
        font-family: var(--app-font);
        cursor: pointer;
        appearance: none;
        -webkit-appearance: none;
    }
    .es-select:focus {
        outline: none;
        border-color: var(--app-accent);
    }

    /* ── Background mode row ────────────────────────────────────────────── */
    .es-bg-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
    }
    .es-bg-label {
        font-size: 10px;
        color: var(--app-text-2);
        font-weight: 600;
        white-space: nowrap;
    }
    .es-bg-btns {
        display: flex;
        gap: 3px;
    }
    .es-bg-btn {
        padding: 4px 8px;
        border: 1px solid var(--app-border);
        border-radius: 4px;
        background: var(--app-bg);
        color: var(--app-text-2);
        font-size: 10px;
        font-weight: 600;
        cursor: pointer;
        font-family: var(--app-font);
        transition: background 0.15s, color 0.15s, border-color 0.15s;
    }
    .es-bg-btn:hover {
        border-color: var(--app-violet-1);
        color: var(--app-accent);
    }
    .es-bg-btn.es-bg-btn--active,
    .es-bg-btn.es-bg-btn--active:hover {
        background: var(--app-accent);
        border-color: var(--app-accent);
        color: #fff;
    }

    /* ── Option button groups ───────────────────────────────────────────── */
    .es-option-group {
        display: flex;
        gap: 4px;
        flex-wrap: wrap;
    }
    .es-opt-btn {
        flex: 1;
        min-width: 70px;
        padding: 6px 8px;
        border: 1px solid var(--app-border);
        border-radius: var(--app-radius-sm);
        background: var(--app-bg);
        color: var(--app-text-2);
        font-size: 10px;
        font-weight: 600;
        cursor: pointer;
        font-family: var(--app-font);
        text-align: center;
        transition: background 0.15s, color 0.15s, border-color 0.15s;
    }
    .es-opt-btn:hover {
        border-color: var(--app-violet-1);
        color: var(--app-accent);
    }
    .es-opt-btn.es-opt-btn--active,
    .es-opt-btn.es-opt-btn--active:hover {
        background: var(--app-accent);
        border-color: var(--app-accent);
        color: #fff;
    }

    /* ── Capture / action button ────────────────────────────────────────── */
    .es-capture-btn {
        width: 100%;
        padding: 10px;
        border: none;
        border-radius: var(--app-radius-md);
        background: var(--app-gradient);
        color: #fff;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        font-family: var(--app-font);
        letter-spacing: 0.02em;
        box-shadow: var(--app-shadow-glow);
        transition: opacity 0.15s;
        flex-shrink: 0;
    }
    .es-capture-btn:hover {
        opacity: 0.9;
    }
    .es-capture-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
    .es-cancel-btn {
        width: 100%;
        padding: 7px;
        border: 1px solid var(--app-border);
        border-radius: var(--app-radius-md);
        background: var(--app-bg);
        color: var(--app-text-2);
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        font-family: var(--app-font);
        flex-shrink: 0;
    }

    /* ── Progress ───────────────────────────────────────────────────────── */
    .es-progress-wrap {
        background: var(--app-panel-bg);
        border-radius: var(--app-radius-md);
        padding: 10px 12px;
        border: 1px solid var(--app-border-light);
        display: flex;
        flex-direction: column;
        gap: 5px;
    }
    .es-progress-status {
        font-size: 10px;
        color: var(--app-text-2);
        font-weight: 600;
    }
    .es-progress-track {
        height: 6px;
        background: var(--app-border);
        border-radius: 3px;
        overflow: hidden;
    }
    .es-progress-fill {
        height: 100%;
        background: var(--app-gradient);
        border-radius: 3px;
        transition: width 0.3s ease;
    }
    .es-progress-pct {
        font-size: 10px;
        color: var(--app-accent);
        font-weight: 700;
        text-align: right;
    }
    .es-frame-counter {
        font-size: 9.5px;
        color: var(--app-text-muted);
        text-align: center;
    }

    /* ── Info box ───────────────────────────────────────────────────────── */
    .es-info-box {
        background: var(--app-violet-soft);
        border: 1px solid rgba(102,0,255,0.15);
        border-radius: var(--app-radius-sm);
        padding: 8px 10px;
        font-size: 10px;
        color: var(--app-text-2);
        line-height: 1.55;
    }

    /* ── Gallery ────────────────────────────────────────────────────────── */
    .es-gallery-wrap {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }
    .es-gallery {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }
    .es-gallery-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 8px;
        background: var(--app-panel-bg);
        border-radius: var(--app-radius-sm);
        border: 1px solid var(--app-border-light);
        box-shadow: var(--app-shadow-card);
    }
    .es-gallery-thumb {
        width: 52px;
        height: 30px;
        object-fit: cover;
        border-radius: 4px;
        flex-shrink: 0;
        background: var(--app-border);
    }
    .es-video-thumb {
        width: 52px;
        height: 30px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
        border-radius: 4px;
        background: var(--app-border);
        flex-shrink: 0;
    }
    .es-gallery-meta {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
    }
    .es-gallery-name {
        font-size: 11px;
        font-weight: 600;
        color: var(--app-text);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .es-gallery-info {
        font-size: 9.5px;
        color: var(--app-text-muted);
    }
    .es-dl-btn {
        padding: 5px 8px;
        border-radius: 4px;
        background: var(--app-violet-soft);
        border: 1px solid rgba(102,0,255,0.20);
        color: var(--app-accent);
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        text-decoration: none;
        flex-shrink: 0;
        transition: background 0.15s;
    }
    .es-dl-btn:hover {
        background: rgba(102,0,255,0.15);
    }

    /* ── Keyframe list ──────────────────────────────────────────────────── */
    .es-kf-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
    }
    .es-add-kf-btn {
        padding: 3px 8px;
        border: none;
        border-radius: 4px;
        background: var(--app-accent);
        color: #fff;
        font-size: 10px;
        font-weight: 700;
        cursor: pointer;
        font-family: var(--app-font);
        transition: opacity 0.15s;
    }
    .es-add-kf-btn:hover { opacity: 0.85; }
    .es-kf-empty {
        padding: 10px;
        background: var(--app-bg);
        border-radius: 5px;
        font-size: 10px;
        color: var(--app-text-muted);
        text-align: center;
        border: 1px dashed var(--app-border);
        line-height: 1.5;
    }
    .es-kf-list {
        display: flex;
        flex-direction: column;
        gap: 3px;
    }
    .es-kf-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 5px 8px;
        background: var(--app-bg);
        border-radius: 4px;
        border: 1px solid var(--app-border-light);
    }
    .es-kf-label {
        font-size: 10px;
        font-weight: 600;
        color: var(--app-text-2);
    }
    .es-kf-del {
        background: none;
        border: none;
        color: var(--app-text-muted);
        font-size: 14px;
        cursor: pointer;
        padding: 0 2px;
        font-family: var(--app-font);
        line-height: 1;
        transition: color 0.15s;
    }
    .es-kf-del:hover { color: #ef4444; }

    /* ── 2-column grid ──────────────────────────────────────────────────── */
    .es-grid-2 {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
    }
    .es-field {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }
    .es-field-label {
        font-size: 9.5px;
        font-weight: 700;
        color: var(--app-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }
`;
