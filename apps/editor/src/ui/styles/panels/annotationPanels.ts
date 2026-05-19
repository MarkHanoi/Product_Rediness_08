/**
 * @file src/styles/panels/annotationPanels.ts
 *
 * CSS for Annotation tools and Viewport panel (ann-, vpt- prefixes).
 * CONTRACT §05 §2 — CSS layer only, zero logic.
 */
export const ANNOTATION_STYLES = `
    /* ─── Canvas overlay ─────────────────────────────────────────────────── */
    .ann-render-layer {
        position: absolute;
        inset: 0;
        pointer-events: none;
        z-index: 20;
    }

    /* ─── Text note placement prompt ─────────────────────────────────────── */
    .ann-text-prompt {
        position: fixed;
        z-index: 9000;
        background: #ffffff;
        border: 1px solid var(--app-border);
        border-radius: var(--app-radius-md);
        box-shadow: var(--app-shadow-panel);
        padding: 10px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-width: 220px;
        font-family: var(--app-font);
    }

    .ann-text-prompt-input {
        font-family: var(--app-font);
        font-size: 13px;
        color: var(--app-text);
        background: #f6f8fc;
        border: 1px solid var(--app-border);
        border-radius: var(--app-radius-sm);
        padding: 6px 8px;
        resize: vertical;
        outline: none;
        transition: border-color 0.15s;
    }
    .ann-text-prompt-input:focus {
        border-color: var(--app-accent);
    }

    .ann-text-prompt-btns {
        display: flex;
        gap: 6px;
        justify-content: flex-end;
    }

    /* ─── Shared annotation button variants ──────────────────────────────── */
    .ann-btn {
        font-family: var(--app-font);
        font-size: 12px;
        font-weight: 600;
        padding: 4px 12px;
        border-radius: var(--app-radius-sm);
        cursor: pointer;
        border: 1px solid transparent;
        transition: background 0.12s, color 0.12s, border-color 0.12s;
    }
    .ann-btn-primary {
        background: var(--app-accent);
        color: #fff;
        border-color: var(--app-accent);
    }
    .ann-btn-primary:hover {
        background: var(--app-violet-2);
        border-color: var(--app-violet-2);
    }
    .ann-btn-ghost {
        background: transparent;
        color: var(--app-text-2);
        border-color: var(--app-border);
    }
    .ann-btn-ghost:hover {
        background: var(--app-bg);
        color: var(--app-text);
    }

    /* ─── Annotation toolbar pill (shown inside ToolsPanel when ann tool active) */
    .ann-status-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-family: var(--app-font);
        font-size: 10px;
        font-weight: 700;
        padding: 2px 7px;
        border-radius: 10px;
        background: var(--app-violet-soft);
        color: var(--app-accent);
        border: 1px solid rgba(102,0,255,0.18);
        white-space: nowrap;
        pointer-events: none;
    }

    /* ─── §ANN-B6 Keynote placement prompt ───────────────────────────────── */
    .ann-keynote-prompt {
        position: fixed;
        z-index: 9000;
        background: #ffffff;
        border: 1px solid var(--app-border);
        border-radius: var(--app-radius-md);
        box-shadow: var(--app-shadow-panel);
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-width: 240px;
        font-family: var(--app-font);
    }
    .ann-keynote-prompt-title {
        font-family: var(--app-font);
        font-size: 12px;
        font-weight: 700;
        color: var(--app-text);
        letter-spacing: 0.04em;
        text-transform: uppercase;
        margin-bottom: 2px;
    }
    .ann-prompt-label {
        font-family: var(--app-font);
        font-size: 11px;
        font-weight: 600;
        color: var(--app-text-2);
        display: block;
        margin-bottom: 2px;
    }
    .ann-keynote-key-input,
    .ann-keynote-text-input {
        font-family: var(--app-font);
        font-size: 13px;
        color: var(--app-text);
        background: #f6f8fc;
        border: 1px solid var(--app-border);
        border-radius: var(--app-radius-sm);
        padding: 5px 8px;
        outline: none;
        width: 100%;
        box-sizing: border-box;
        transition: border-color 0.15s;
    }
    .ann-keynote-key-input {
        font-family: 'Courier New', Courier, monospace;
        font-weight: 700;
        letter-spacing: 0.06em;
        font-size: 14px;
    }
    .ann-keynote-key-input:focus,
    .ann-keynote-text-input:focus {
        border-color: var(--app-accent);
    }

    /* ─── §ANN-B7 Annotation Visibility panel ────────────────────────────── */
    .ann-vg-panel {
        position: absolute;
        top: 12px;
        right: 12px;
        z-index: 200;
        background: #ffffff;
        border: 1px solid var(--app-border);
        border-radius: var(--app-radius-md);
        box-shadow: var(--app-shadow-card);
        padding: 10px 12px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        min-width: 180px;
        font-family: var(--app-font);
        pointer-events: auto;
    }
    .ann-vg-panel-title {
        font-size: 11px;
        font-weight: 700;
        color: var(--app-text);
        letter-spacing: 0.05em;
        text-transform: uppercase;
        padding-bottom: 4px;
        border-bottom: 1px solid var(--app-border-light);
        margin-bottom: 2px;
    }
    .ann-vg-row {
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        padding: 2px 0;
        border-radius: 4px;
        transition: background 0.1s;
    }
    .ann-vg-row:hover {
        background: var(--app-bg);
    }
    .ann-vg-checkbox {
        width: 14px;
        height: 14px;
        accent-color: var(--app-accent);
        cursor: pointer;
        flex-shrink: 0;
    }
    .ann-vg-label {
        font-size: 12px;
        color: var(--app-text);
        user-select: none;
        flex: 1;
    }
    .ann-vg-label--hidden {
        color: var(--app-text-muted);
        text-decoration: line-through;
    }

    /* ─── §ANN-C1 AI Annotate toast notification ─────────────────────────── */
    .ann-ai-toast {
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 99999;
        background: var(--app-panel-bg);
        color: var(--app-text);
        border: 1px solid var(--app-border);
        border-left: 3px solid var(--app-accent);
        font-family: var(--app-font);
        font-size: 13px;
        font-weight: 500;
        padding: 10px 22px;
        border-radius: 12px;
        box-shadow: var(--app-shadow-panel);
        pointer-events: none;
        max-width: 420px;
        text-align: center;
        transition: border-color 0.2s;
    }
    .ann-ai-toast--warn {
        border-left-color: var(--app-status-warning);
        color: var(--app-text);
    }
    .ann-ai-toast--error {
        border-left-color: var(--app-status-error);
        color: var(--app-text);
    }
    .ann-ai-toast--success {
        border-left-color: var(--app-status-success);
        color: var(--app-text);
    }

    /* ─── §ANN-C4 Constraint Violation Toast ─────────────────────────────── */
    .ann-constr-toast {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 99998;
        display: flex;
        align-items: flex-start;
        gap: 10px;
        background: var(--app-panel-bg);
        color: var(--app-text);
        border: 1px solid var(--app-border);
        border-left: 3px solid var(--app-status-error);
        font-family: var(--app-font);
        font-size: 13px;
        font-weight: 500;
        line-height: 1.45;
        padding: 12px 16px;
        border-radius: 8px;
        box-shadow: 0 6px 32px rgba(0,0,0,0.32);
        max-width: 340px;
        pointer-events: none;
        animation: ann-constr-toast-in 0.18s ease;
    }
    .ann-constr-toast--hard {
        border-left: 4px solid #dc2626;
    }
    .ann-constr-toast--soft {
        border-left: 4px solid #f59e0b;
    }
    .ann-constr-toast-icon {
        font-size: 16px;
        flex-shrink: 0;
        line-height: 1;
    }
    .ann-constr-toast-body {
        flex: 1;
    }
    .ann-constr-toast-title {
        font-weight: 700;
        font-size: 12px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        margin-bottom: 2px;
    }
    .ann-constr-toast-msg {
        font-size: 12px;
        opacity: 0.88;
    }
    @keyframes ann-constr-toast-in {
        from { opacity: 0; transform: translateY(-8px); }
        to   { opacity: 1; transform: translateY(0); }
    }

    /* ─── §ANN-C3 Constraint Violation Panel ─────────────────────────────── */
    .ann-cv-panel {
        position: absolute;
        bottom: 12px;
        left: 12px;
        z-index: 210;
        background: #ffffff;
        border: 1px solid var(--app-border);
        border-radius: var(--app-radius-md);
        box-shadow: var(--app-shadow-card);
        padding: 10px 12px;
        display: flex;
        flex-direction: column;
        gap: 5px;
        min-width: 200px;
        max-width: 280px;
        font-family: var(--app-font);
        pointer-events: auto;
    }
    .ann-cv-panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        padding-bottom: 5px;
        border-bottom: 1px solid var(--app-border-light);
        margin-bottom: 2px;
    }
    .ann-cv-panel-title {
        font-size: 11px;
        font-weight: 700;
        color: var(--app-text);
        letter-spacing: 0.05em;
        text-transform: uppercase;
    }
    .ann-cv-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 18px;
        height: 18px;
        border-radius: 9px;
        font-size: 10px;
        font-weight: 700;
        padding: 0 5px;
        background: #dc2626;
        color: #fff;
    }
    .ann-cv-badge--ok {
        background: #16a34a;
    }
    .ann-cv-badge--empty {
        background: var(--app-text-muted, #9ca3af);
    }
    .ann-cv-row {
        display: flex;
        align-items: flex-start;
        gap: 7px;
        padding: 3px 0;
        font-size: 11px;
        line-height: 1.4;
    }
    .ann-cv-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
        margin-top: 2px;
    }
    .ann-cv-dot--violated  { background: #dc2626; }
    .ann-cv-dot--satisfied { background: #16a34a; }
    .ann-cv-dot--unknown   { background: #9ca3af; }
    .ann-cv-desc {
        color: var(--app-text);
        flex: 1;
        word-break: break-word;
    }
    .ann-cv-delta {
        font-size: 10px;
        font-weight: 600;
        color: #dc2626;
        white-space: nowrap;
    }
    .ann-cv-empty {
        font-size: 11px;
        color: var(--app-text-muted, #9ca3af);
        text-align: center;
        padding: 4px 0;
    }
`;

export const VPT_PANEL_STYLES = `
    /* ── Outer panel ── */
    .vpt-panel {
        display: none;
        flex-direction: column;
        gap: 8px;
        position: fixed;
        bottom: 24px;
        right: 16px;
        width: 280px;
        background: rgba(12, 12, 20, 0.92);
        color: #f0f0f0;
        border-radius: 12px;
        box-shadow: 0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(168,85,247,0.3);
        z-index: 4000;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 12px;
        padding: 0 0 8px;
        overflow: hidden;
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        pointer-events: all;
    }

    /* ── Header ── */
    .vpt-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 12px 8px;
        background: linear-gradient(135deg, #4c1d95 0%, #2e1065 100%);
        border-bottom: 1px solid rgba(168,85,247,0.3);
    }
    .vpt-header-left {
        display: flex;
        align-items: center;
        gap: 6px;
    }
    .vpt-icon {
        font-size: 15px;
        color: #c084fc;
        animation: vpt-pulse 2s ease-in-out infinite;
    }
    @keyframes vpt-pulse {
        0%, 100% { opacity: 1; }
        50%       { opacity: 0.5; }
    }
    .vpt-title {
        font-weight: 700;
        font-size: 13px;
        letter-spacing: 0.02em;
        color: #f5f0ff;
    }
    .vpt-exit-btn {
        background: rgba(255,255,255,0.08);
        border: 1px solid rgba(255,255,255,0.15);
        color: #ccc;
        border-radius: 5px;
        padding: 3px 8px;
        font-size: 11px;
        cursor: pointer;
        transition: background 0.15s;
    }
    .vpt-exit-btn:hover {
        background: rgba(220,38,38,0.35);
        border-color: #ef4444;
        color: #fff;
    }

    /* ── Status dot ── */
    .vpt-status-dot {
        padding: 0 12px;
        font-size: 11px;
        font-weight: 600;
        color: #a855f7;
        letter-spacing: 0.03em;
    }

    /* ── Progress ── */
    .vpt-progress-wrap {
        padding: 0 12px;
        display: flex;
        flex-direction: column;
        gap: 4px;
    }
    .vpt-progress-track {
        height: 5px;
        background: rgba(255,255,255,0.1);
        border-radius: 3px;
        overflow: hidden;
    }
    .vpt-progress-fill {
        height: 100%;
        background: linear-gradient(90deg, #7c3aed, #a855f7, #c084fc);
        border-radius: 3px;
        transition: width 0.2s ease;
    }
    .vpt-sample-counter {
        font-size: 10px;
        color: #888;
        text-align: right;
    }

    /* ── Generic row ── */
    .vpt-row {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 0 12px;
    }
    .vpt-label {
        font-size: 10px;
        font-weight: 600;
        color: #aaa;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        white-space: nowrap;
        min-width: 80px;
    }

    /* ── Select ── */
    .vpt-select {
        flex: 1;
        padding: 5px 7px;
        background: rgba(255,255,255,0.07);
        border: 1px solid rgba(255,255,255,0.12);
        color: #f0f0f0;
        border-radius: 5px;
        font-size: 11px;
        cursor: pointer;
        outline: none;
        appearance: none;
        -webkit-appearance: none;
    }
    .vpt-select:focus {
        border-color: #7c3aed;
    }

    /* ── DOF section ── */
    .vpt-dof-controls {
        flex-direction: column;
        gap: 6px;
        padding: 0 4px;
        border-top: 1px solid rgba(255,255,255,0.06);
        padding-top: 6px;
    }
    .vpt-dof-row {
        padding: 0 12px;
    }
    .vpt-slider {
        flex: 1;
        height: 3px;
        accent-color: #a855f7;
        cursor: pointer;
    }
    .vpt-slider-val {
        font-size: 10px;
        color: #c084fc;
        min-width: 36px;
        text-align: right;
    }

    /* ── Toggle (DOF on/off) ── */
    .vpt-toggle-wrap {
        display: flex;
        align-items: center;
        cursor: pointer;
        position: relative;
    }
    .vpt-toggle-wrap input { display: none; }
    .vpt-toggle-track {
        width: 30px;
        height: 16px;
        background: rgba(255,255,255,0.1);
        border-radius: 8px;
        position: relative;
        transition: background 0.2s;
    }
    .vpt-toggle-wrap input:checked + .vpt-toggle-track {
        background: #7c3aed;
    }
    .vpt-toggle-thumb {
        width: 12px;
        height: 12px;
        background: #fff;
        border-radius: 50%;
        position: absolute;
        top: 2px;
        left: 2px;
        transition: transform 0.2s;
    }
    .vpt-toggle-wrap input:checked + .vpt-toggle-track .vpt-toggle-thumb {
        transform: translateX(14px);
    }

    /* ── Action buttons ── */
    .vpt-actions {
        display: flex;
        gap: 6px;
        padding: 0 12px;
    }
    .vpt-btn {
        flex: 1;
        padding: 7px 6px;
        background: rgba(255,255,255,0.07);
        border: 1px solid rgba(255,255,255,0.12);
        color: #f0f0f0;
        border-radius: 6px;
        font-size: 11px;
        cursor: pointer;
        transition: background 0.15s, border-color 0.15s;
        white-space: nowrap;
    }
    .vpt-btn:hover:not(:disabled) {
        background: rgba(168,85,247,0.2);
        border-color: #a855f7;
    }
    .vpt-btn:disabled {
        opacity: 0.35;
        cursor: not-allowed;
    }
    .vpt-pause-btn { background: #1e1e2e; }

    /* ── Info tip ── */
    .vpt-tip {
        padding: 0 12px;
        font-size: 9.5px;
        color: #555;
        line-height: 1.4;
        border-top: 1px solid rgba(255,255,255,0.05);
        padding-top: 6px;
    }

    /* ── Render Mode toggle button in the Tools Panel ── */
    .vpt-mode-toggle-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        width: 100%;
        padding: 8px 10px;
        background: linear-gradient(135deg, #4c1d95 0%, #2e1065 100%);
        border: 1px solid #7c3aed;
        color: #f0f0f0;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: opacity 0.15s, box-shadow 0.2s;
        font-family: var(--app-font);
    }
    .vpt-mode-toggle-btn:hover {
        opacity: 0.9;
        box-shadow: 0 0 12px rgba(168,85,247,0.4);
    }
    .vpt-mode-toggle-btn.vpt-mode-toggle-btn--active {
        background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
        border-color: #ef4444;
        box-shadow: 0 0 12px rgba(239,68,68,0.4);
    }
`;

/**
 * §ANN-SEL — DimensionPropertiesPanel styles
 * CSS prefix: ann-dim-prop-  (claimed by DimensionPropertiesPanel.ts)
 * CONTRACT §05 §2 — CSS layer only, zero logic.
 * CONTRACT §05 §2.2 — All colours use var(--app-*) design tokens.
 * Violet palette matches the Wall property panel (gpp-header pattern).
 */
export const DIM_PROPS_PANEL_STYLES = `
    /* ─── Panel container ─────────────────────────────────────────────────── */
    .ann-dim-prop-panel {
        position: fixed;
        right: 16px;
        top: 50%;
        transform: translateY(-50%);
        z-index: 8500;
        background: var(--app-bg, #e8edf6);
        border: 1px solid var(--app-border, #dde3f0);
        border-radius: var(--app-radius-lg, 16px);
        box-shadow: var(--app-shadow-panel, 0 8px 32px rgba(30,50,120,0.13), 0 2px 8px rgba(30,50,120,0.07));
        width: 280px;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0;
        font-family: var(--app-font, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
        font-size: 12px;
        color: var(--app-text, #1a2035);
        user-select: none;
        overflow: hidden;
    }

    /* ─── Header — violet gradient, matches gpp-header ───────────────────── */
    .ann-dim-prop-header {
        background: var(--app-gradient, linear-gradient(135deg, #8B5CF6 0%, #6600FF 100%));
        padding: 10px 44px 10px 16px;
        border-radius: var(--app-radius-lg, 16px) var(--app-radius-lg, 16px) 0 0;
        color: #ffffff;
        position: relative;
        box-shadow: var(--app-shadow-header, 0 2px 12px rgba(102,0,255,0.35));
    }
    .ann-dim-prop-type-badge {
        font-size: 9px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.14em;
        color: rgba(255,255,255,0.65);
        margin-bottom: 3px;
    }
    .ann-dim-prop-title {
        font-size: 14px;
        font-weight: 700;
        color: #ffffff;
        margin-bottom: 4px;
        letter-spacing: 0.01em;
    }
    .ann-dim-prop-measured {
        font-size: 11px;
        font-weight: 500;
        color: rgba(255,255,255,0.78);
    }
    .ann-dim-prop-close {
        position: absolute;
        top: 10px;
        right: 14px;
        width: 22px;
        height: 22px;
        background: rgba(255,255,255,0.18);
        border: 1px solid rgba(255,255,255,0.28);
        border-radius: 50%;
        color: #fff;
        font-size: 11px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        line-height: 1;
        padding: 0;
        transition: background 0.12s;
    }
    .ann-dim-prop-close:hover {
        background: rgba(255,255,255,0.32);
    }

    /* ─── Body wrapper — white card ───────────────────────────────────────── */
    .ann-dim-prop-body {
        background: var(--app-panel-bg, #ffffff);
        display: flex;
        flex-direction: column;
        gap: 0;
    }

    /* ─── Rows ────────────────────────────────────────────────────────────── */
    .ann-dim-prop-row {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 14px;
        border-bottom: 1px solid var(--app-border-light, #eef1f8);
        flex-wrap: wrap;
    }
    .ann-dim-prop-label {
        flex: 0 0 110px;
        color: var(--app-text-2, #5a6a85);
        font-size: 11px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .ann-dim-prop-label-inline {
        flex: 0 0 auto;
        margin-left: 6px;
        color: var(--app-text-2, #5a6a85);
        font-size: 11px;
    }
    .ann-dim-prop-value-ro {
        flex: 1;
        font-weight: 600;
        color: var(--app-text, #1a2035);
        font-size: 12px;
    }

    /* ─── Form controls ───────────────────────────────────────────────────── */
    .ann-dim-prop-input,
    .ann-dim-prop-select {
        flex: 1;
        min-width: 0;
        background: #f6f8fc;
        border: 1px solid var(--app-border, #dde3f0);
        border-radius: var(--app-radius-sm, 6px);
        color: var(--app-text, #1a2035);
        font-size: 11px;
        padding: 4px 6px;
        font-family: inherit;
        outline: none;
        transition: border-color 0.15s;
    }
    .ann-dim-prop-input:focus,
    .ann-dim-prop-select:focus {
        border-color: var(--app-accent, #6600FF);
    }
    .ann-dim-prop-input-short {
        flex: 0 0 56px;
    }
    .ann-dim-prop-color {
        width: 32px;
        height: 24px;
        padding: 1px 2px;
        border: 1px solid var(--app-border, #dde3f0);
        border-radius: var(--app-radius-sm, 6px);
        background: #f6f8fc;
        cursor: pointer;
        flex-shrink: 0;
    }
    .ann-dim-prop-check {
        width: 14px;
        height: 14px;
        cursor: pointer;
        accent-color: var(--app-accent, #6600FF);
    }

    /* ─── Divider ─────────────────────────────────────────────────────────── */
    .ann-dim-prop-divider {
        border-top: 1px solid var(--app-border, #dde3f0);
        margin: 4px 0;
    }

    /* ─── Footer ──────────────────────────────────────────────────────────── */
    .ann-dim-prop-footer {
        display: flex;
        gap: 8px;
        padding: 10px 14px 12px;
        background: var(--app-panel-bg, #ffffff);
    }
    .ann-dim-prop-btn {
        flex: 1;
        padding: 7px 10px;
        border-radius: var(--app-radius-sm, 6px);
        border: none;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        font-family: inherit;
        transition: opacity 0.15s, box-shadow 0.15s;
    }
    .ann-dim-prop-btn:hover {
        opacity: 0.88;
    }
    .ann-dim-prop-btn-primary {
        background: var(--app-gradient, linear-gradient(135deg, #8B5CF6 0%, #6600FF 100%));
        color: #ffffff;
        box-shadow: 0 2px 8px rgba(102,0,255,0.28);
    }
    .ann-dim-prop-btn-primary:hover {
        box-shadow: var(--app-shadow-glow, 0 4px 16px rgba(102,0,255,0.40));
    }
    .ann-dim-prop-btn-danger {
        background: #fee2e2;
        color: #dc2626;
        border: 1px solid #fca5a5;
    }
    .ann-dim-prop-btn-danger:hover {
        background: #fecaca;
    }
`;

