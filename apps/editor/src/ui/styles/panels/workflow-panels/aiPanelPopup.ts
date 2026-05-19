/**
 * @file src/engine/subsystems/styles/panels/workflow-panels/aiPanelPopup.ts
 *
 * AI chat popup panel — ai-popup / ai-* prefix.
 * CONTRACT §05 §2 — CSS layer only, zero logic.
 */
export const AI_PANEL_POPUP_STYLES = `
    .ai-popup {
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: var(--app-panel-bg);
        border: 1px solid var(--app-border);
        border-radius: var(--app-radius-md);
        padding: 12px;
        width: 280px;
        box-shadow: var(--app-shadow-panel);
        font-family: var(--app-font);
        z-index: 10000;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .ai-popup-title {
        font-size: 12px;
        font-weight: 600;
        color: var(--app-text);
    }

    .ai-popup-subtitle {
        font-size: 11px;
        color: var(--app-text-2);
        margin-bottom: 4px;
    }

    .ai-popup-info {
        font-size: 10px;
        color: var(--app-accent);
        background: var(--app-violet-soft);
        padding: 4px 6px;
        border-radius: var(--app-radius-sm);
        margin-bottom: 4px;
        border: 1px solid rgba(102,0,255,0.18);
    }

    .ai-popup-actions {
        display: flex;
        gap: 6px;
        margin-top: 6px;
    }

    .ai-popup-btn {
        flex: 1;
        padding: 6px;
        border-radius: var(--app-radius-sm);
        cursor: pointer;
        font-size: 11px;
        font-family: var(--app-font);
    }

    .ai-popup-btn--cancel {
        border: 1px solid var(--app-border);
        background: var(--app-bg);
        color: var(--app-text);
    }

    .ai-popup-btn--approve {
        border: none;
        background: var(--app-gradient);
        color: #fff;
        font-weight: 600;
    }

    /* ── AI Proposal Cards (renderActionProposals / createProposalCard) ─── */

    .ai-proposals-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .ai-empty-state {
        font-size: 11px;
        color: var(--app-text-muted);
        text-align: center;
        padding: 20px;
    }

    .ai-card {
        background: var(--app-panel-bg);
        border: 1px solid var(--app-border);
        border-left: 4px solid var(--app-border);
        padding: 10px;
        border-radius: var(--app-radius-sm);
        box-shadow: var(--app-shadow-card);
        font-family: var(--app-font);
    }

    .ai-card--valid   { border-left-color: var(--app-status-success); }
    .ai-card--invalid { border-left-color: var(--app-status-error); }

    .ai-card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 6px;
    }

    .ai-card-title {
        font-weight: 700;
        font-size: 11px;
        color: var(--app-text);
    }

    .ai-card-status {
        font-size: 10px;
        font-weight: 600;
    }
    .ai-card-status--valid   { color: var(--app-status-success); }
    .ai-card-status--invalid { color: var(--app-status-error); }

    .ai-card-rationale {
        font-size: 11px;
        color: var(--app-text-2);
        margin-bottom: 4px;
        font-family: var(--app-font);
    }

    .ai-card-confidence {
        font-size: 10px;
        color: var(--app-text-muted);
        margin-bottom: 8px;
        font-family: var(--app-font);
    }

    .ai-card-error {
        font-size: 10px;
        color: var(--app-status-error);
        background: rgba(220,38,38,0.06);
        padding: 4px;
        border-radius: var(--app-radius-sm);
        margin-bottom: 8px;
        font-family: var(--app-font);
    }

    .ai-card-actions {
        display: flex;
        gap: 8px;
    }

    .ai-card-btn {
        flex: 1;
        padding: 6px;
        border-radius: var(--app-radius-sm);
        cursor: pointer;
        font-size: 10px;
        font-weight: 600;
        font-family: var(--app-font);
    }

    .ai-card-btn--approve {
        background: var(--app-gradient);
        color: #fff;
        border: none;
    }
    .ai-card-btn--approve:disabled {
        background: var(--app-border);
        color: var(--app-text-muted);
        cursor: not-allowed;
    }

    .ai-card-btn--reject {
        background: var(--app-bg);
        border: 1px solid var(--app-border);
        color: var(--app-text-2);
    }

    /* ── AI Action Messages (showActionMessage) ──────────────────────────── */

    .ai-msg {
        padding: 8px;
        border-radius: var(--app-radius-sm);
        font-size: 10px;
        font-family: var(--app-font);
        margin-bottom: 8px;
    }
    .ai-msg--success {
        background: rgba(34,197,94,0.08);
        border: 1px solid rgba(34,197,94,0.3);
        color: #1e4620;
    }
    .ai-msg--error {
        background: rgba(220,38,38,0.06);
        border: 1px solid rgba(220,38,38,0.25);
        color: #820014;
    }

    /* ── AI Query Result (formatQueryResult) ────────────────────────────── */

    .ai-result {
        font-size: 12px;
        line-height: 1.5;
        color: var(--app-text);
        white-space: pre-wrap;
        font-family: var(--app-font);
    }

    /* ══════════════════════════════════════════════════════════════════════
       AI CHAT PANEL (Phase 9 — Guided Suggestion Rebuild)
       Prefix: ai-chat-*, ai-suggestion-*, ai-inline-card-*, ai-val-*
       Used by: src/ui/ai/AIPanel.ts, src/ui/ai/ValidatePanel.ts
    ══════════════════════════════════════════════════════════════════════ */

    /* ── Left-edge width resize handle (matches tpr-resize-handle pattern) ── */
    .ai-resize-handle {
        position: absolute;
        top: 0;
        left: 0;
        width: 6px;
        height: 100%;
        cursor: col-resize;
        z-index: 20;
        background: transparent;
        transition: background 0.15s;
        border-radius: var(--app-radius-md) 0 0 var(--app-radius-md);
    }
    .ai-resize-handle:hover,
    .ai-resize-handle:active {
        background: rgba(102, 0, 255, 0.18);
    }

    /* ── Chat Panel Shell ─────────────────────────────────────────────── */
    .ai-chat-panel {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--app-bg);
        border-radius: var(--app-radius-md);
        overflow: hidden;
        font-family: var(--app-font);
    }

    .ai-chat-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 14px;
        background: var(--app-gradient);
        box-shadow: var(--app-shadow-header);
        flex-shrink: 0;
        cursor: grab;
        user-select: none;
    }
    .ai-chat-header:active {
        cursor: grabbing;
    }
    .ai-chat-header-drag-hint {
        display: grid;
        grid-template-columns: repeat(2, 3px);
        grid-template-rows: repeat(3, 3px);
        gap: 2px;
        opacity: 0.40;
        flex-shrink: 0;
        margin-left: 4px;
        pointer-events: none;
    }
    .ai-chat-header-drag-hint span {
        display: block;
        width: 3px;
        height: 3px;
        border-radius: 50%;
        background: #fff;
    }

    .ai-chat-header-title {
        font-size: 11px;
        font-weight: 700;
        color: #fff;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        flex: 1;
    }

    .ai-chat-header-icon {
        width: 16px;
        height: 16px;
        color: rgba(255,255,255,0.85);
        flex-shrink: 0;
    }

    /* ── Chat Transcript ──────────────────────────────────────────────── */
    .ai-chat-transcript {
        flex: 1;
        overflow-y: auto;
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        scrollbar-width: thin;
        scrollbar-color: #c4cde0 transparent;
        min-height: 0;
    }

    .ai-chat-empty {
        color: var(--app-text-muted);
        font-size: 12px;
        text-align: center;
        padding: 20px 12px;
        line-height: 1.5;
    }

    .ai-chat-msg {
        display: flex;
        flex-direction: column;
        gap: 2px;
        max-width: 90%;
    }

    .ai-chat-msg--user {
        align-self: flex-end;
        align-items: flex-end;
    }

    .ai-chat-msg--assistant {
        align-self: flex-start;
        align-items: flex-start;
    }

    .ai-chat-bubble {
        padding: 8px 12px;
        border-radius: 12px;
        font-size: 12px;
        line-height: 1.45;
        font-family: var(--app-font);
        max-width: 100%;
        word-break: break-word;
    }

    .ai-chat-msg--user .ai-chat-bubble {
        background: var(--app-gradient);
        color: #fff;
        border-radius: 12px 12px 4px 12px;
    }

    .ai-chat-msg--assistant .ai-chat-bubble {
        background: var(--app-panel-bg);
        color: var(--app-text);
        border: 1px solid var(--app-border-light);
        border-radius: 4px 12px 12px 12px;
    }

    .ai-chat-msg-label {
        font-size: 9px;
        font-weight: 600;
        color: var(--app-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.06em;
        padding: 0 4px;
        font-family: var(--app-font);
    }

    /* ── Inline Action Card (replaces separate modal) ─────────────────── */
    .ai-inline-card {
        background: var(--app-panel-bg);
        border: 1px solid var(--app-border);
        border-left: 4px solid var(--app-accent);
        border-radius: var(--app-radius-sm);
        padding: 10px 12px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        font-family: var(--app-font);
        box-shadow: var(--app-shadow-card);
        max-width: 100%;
    }

    .ai-inline-card-header {
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .ai-inline-card-icon {
        font-size: 14px;
    }

    .ai-inline-card-title {
        font-size: 12px;
        font-weight: 700;
        color: var(--app-text);
        flex: 1;
    }

    .ai-inline-card-detail {
        font-size: 11px;
        color: var(--app-text-2);
        line-height: 1.4;
    }

    .ai-inline-card-actions {
        display: flex;
        gap: 6px;
        margin-top: 2px;
    }

    .ai-inline-card-accept {
        flex: 1;
        padding: 6px 10px;
        background: var(--app-gradient);
        color: #fff;
        border: none;
        border-radius: var(--app-radius-sm);
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        font-family: var(--app-font);
        box-shadow: var(--app-shadow-glow);
        transition: opacity 0.15s;
    }

    .ai-inline-card-accept:hover { opacity: 0.9; }
    .ai-inline-card-accept:disabled {
        background: var(--app-border);
        color: var(--app-text-muted);
        cursor: not-allowed;
        box-shadow: none;
    }

    .ai-inline-card-cancel {
        padding: 6px 10px;
        background: transparent;
        border: 1px solid var(--app-border);
        border-radius: var(--app-radius-sm);
        font-size: 11px;
        color: var(--app-text-2);
        cursor: pointer;
        font-family: var(--app-font);
        transition: background 0.15s;
    }

    .ai-inline-card-cancel:hover { background: var(--app-bg); }

    /* ── Suggestion Pills ─────────────────────────────────────────────── */
    .ai-suggestions {
        padding: 8px 12px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        border-top: 1px solid var(--app-border-light);
        background: var(--app-bg);
        flex-shrink: 0;
    }

    .ai-suggestion-pills {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
    }

    .ai-suggestion-pill {
        padding: 4px 12px;
        background: var(--app-panel-bg);
        border: 1px solid var(--app-border);
        border-radius: 20px;
        font-size: 12px;
        font-weight: 500;
        color: var(--app-text);
        cursor: pointer;
        font-family: var(--app-font);
        transition: background 0.12s, border-color 0.12s, color 0.12s;
        user-select: none;
    }

    .ai-suggestion-pill:hover {
        background: var(--app-violet-soft);
        border-color: var(--app-accent);
        color: var(--app-accent);
    }

    .ai-suggestion-pill--active {
        background: var(--app-violet-soft);
        border-color: var(--app-accent);
        color: var(--app-accent);
        font-weight: 600;
    }

    .ai-suggestion-pill--has-children::after {
        content: ' ›';
        opacity: 0.5;
        font-size: 11px;
    }

    .ai-suggestion-pill--leaf {
        border-color: var(--app-accent);
        color: var(--app-accent);
        background: var(--app-violet-soft);
    }

    .ai-suggestion-pill--back {
        color: var(--app-text-muted);
        font-size: 10px;
        padding: 3px 10px;
        background: transparent;
        border-color: var(--app-border);
        width: fit-content;
    }

    .ai-suggestion-pill--back:hover {
        background: var(--app-panel-bg);
        border-color: var(--app-text-muted);
        color: var(--app-text);
    }

    /* ── All Commands Hub List ─────────────────────────────────────────── */

    .ai-suggestion-pills--hub-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
        max-height: 240px;
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: var(--app-border) transparent;
    }

    .ai-suggestion-pills--hub-list::-webkit-scrollbar {
        width: 4px;
    }

    .ai-suggestion-pills--hub-list::-webkit-scrollbar-track {
        background: transparent;
    }

    .ai-suggestion-pills--hub-list::-webkit-scrollbar-thumb {
        background: var(--app-border);
        border-radius: 4px;
    }

    .ai-suggestion-pill--hub-item {
        display: flex;
        align-items: center;
        width: 100%;
        padding: 7px 12px 7px 12px;
        border-radius: 20px;
        border: 1px solid var(--app-accent);
        background: var(--app-violet-soft);
        text-align: left;
        cursor: pointer;
        font-family: var(--app-font);
        user-select: none;
        transition: background 0.12s, border-color 0.12s;
        box-sizing: border-box;
        gap: 0;
    }

    .ai-suggestion-pill--hub-item:hover {
        background: rgba(138, 43, 226, 0.15);
        border-color: var(--app-accent);
    }

    .ai-hub-label {
        font-weight: 600;
        font-size: 12px;
        color: var(--app-text);
        flex-shrink: 0;
    }

    .ai-hub-hint {
        font-size: 10px;
        color: var(--app-text-muted);
        margin-left: 7px;
        font-weight: 400;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        flex: 1;
    }

    .ai-hub-arrow {
        margin-left: auto;
        padding-left: 6px;
        color: var(--app-text-muted);
        font-size: 13px;
        flex-shrink: 0;
    }

    /* ── Scope badges (batch / pick levels / manual) ──────────────────── */

    .ai-scope-badge {
        display: inline-block;
        margin-left: auto;
        padding-left: 8px;
        font-size: 9px;
        padding: 1px 6px;
        border-radius: 10px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        flex-shrink: 0;
    }

    .ai-scope-badge--batch {
        background: rgba(138, 43, 226, 0.15);
        color: var(--app-accent);
    }

    .ai-scope-badge--pick-levels {
        background: rgba(100, 200, 150, 0.12);
        color: #3bb383;
    }

    .ai-scope-badge--manual {
        background: rgba(150, 150, 255, 0.12);
        color: #8888ee;
    }

    /* ── Parametric flow prompt card ──────────────────────────────────── */

    .ai-cmd-prompt {
        font-size: 12px;
        font-weight: 600;
        color: var(--app-text);
        background: var(--app-panel-bg);
        border: 1px solid var(--app-border);
        border-radius: var(--app-radius-sm);
        padding: 8px 10px;
        margin-bottom: 2px;
        font-family: var(--app-font);
        line-height: 1.4;
    }

    /* ── Breadcrumb label improvements ────────────────────────────────── */

    .ai-suggestion-level-label {
        font-size: 9px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--app-text-muted);
        font-family: var(--app-font);
        min-height: 12px;
        line-height: 1.5;
        cursor: default;
    }

    /* ── Input Row ────────────────────────────────────────────────────── */
    .ai-chat-input-row {
        display: flex;
        gap: 6px;
        padding: 10px 12px;
        border-top: 1px solid var(--app-border-light);
        background: var(--app-panel-bg);
        flex-shrink: 0;
        align-items: center;
    }

    .ai-chat-input {
        flex: 1;
        padding: 7px 10px;
        border: 1px solid var(--app-border);
        border-radius: var(--app-radius-sm);
        font-size: 12px;
        font-family: var(--app-font);
        color: var(--app-text);
        background: var(--app-bg);
        outline: none;
        transition: border-color 0.12s;
    }

    .ai-chat-input:focus {
        border-color: var(--app-accent);
        background: var(--app-panel-bg);
    }

    .ai-chat-input::placeholder {
        color: var(--app-text-muted);
    }

    .ai-chat-send-btn {
        padding: 7px 14px;
        background: var(--app-gradient);
        color: #fff;
        border: none;
        border-radius: var(--app-radius-sm);
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        font-family: var(--app-font);
        box-shadow: var(--app-shadow-glow);
        flex-shrink: 0;
        transition: opacity 0.15s;
    }

    .ai-chat-send-btn:hover { opacity: 0.9; }

    .ai-chat-typing {
        font-size: 11px;
        color: var(--app-text-muted);
        font-style: italic;
        padding: 0 4px;
        font-family: var(--app-font);
    }

    /* ── Validate Panel (in LeftNavRail VALIDATE section) ─────────────── */
    .ai-val-panel {
        display: flex;
        flex-direction: column;
        flex: 1;
        gap: 0;
        font-family: var(--app-font);
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: #c4cde0 transparent;
    }

    .ai-val-header {
        padding: 10px 14px;
        background: var(--app-gradient);
        font-size: 11px;
        font-weight: 700;
        color: #fff;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        box-shadow: var(--app-shadow-header);
        flex-shrink: 0;
    }

    .ai-val-section {
        padding: 10px 12px;
        border-bottom: 1px solid var(--app-border-light);
    }

    .ai-val-section-label {
        font-size: 9px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--app-text-muted);
        margin-bottom: 6px;
        font-family: var(--app-font);
    }

    .ai-val-btn-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 5px;
    }

    .ai-val-btn {
        padding: 7px 8px;
        background: var(--app-panel-bg);
        border: 1px solid var(--app-border);
        border-radius: var(--app-radius-sm);
        font-size: 10px;
        font-weight: 500;
        color: var(--app-text-2);
        cursor: pointer;
        font-family: var(--app-font);
        text-align: center;
        transition: background 0.12s, color 0.12s;
    }

    .ai-val-btn:hover {
        background: var(--app-violet-soft);
        color: var(--app-accent);
        border-color: var(--app-accent);
    }

    .ai-val-btn--primary {
        background: var(--app-gradient);
        color: #fff;
        border: none;
        font-weight: 600;
        font-size: 11px;
        grid-column: 1 / -1;
        box-shadow: var(--app-shadow-glow);
    }

    .ai-val-btn--primary:hover { opacity: 0.9; }

    .ai-val-result {
        flex: 1;
        padding: 10px 12px;
        font-size: 11px;
        color: var(--app-text);
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: #c4cde0 transparent;
        min-height: 80px;
    }
`;
