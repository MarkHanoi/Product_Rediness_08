/**
 * @file src/engine/subsystems/styles/panels/platform-shell/propertiesPalette.ts
 *
 * Properties Palette (Phase 5.1) — pp- prefix.
 * CONTRACT §05 §2 — CSS layer only, zero logic.
 */
export const PROPERTIES_PALETTE_STYLES = `
    /* ── PropertiesPalette (pp-) — Phase 5.1 — native HTML replacement ── */
    .pp-root { display: flex; flex-direction: column; height: 100%; overflow-y: auto; }
    .pp-type-row {
        padding: 8px; background: var(--app-bg);
        border-bottom: 1px solid var(--app-border);
    }
    .pp-section {
        border-bottom: 1px solid var(--app-border-light);
    }
    .pp-section-label {
        display: flex; align-items: center; justify-content: space-between;
        padding: 6px 8px; font-size: 0.75rem; font-weight: 600;
        color: var(--app-text); cursor: pointer; list-style: none;
        background: var(--app-bg); user-select: none;
    }
    .pp-section-label::-webkit-details-marker { display: none; }
    .pp-section-body {
        display: flex; flex-direction: column; gap: 4px;
        padding: 6px 8px; background: var(--app-panel-bg);
    }
    .pp-row {
        display: flex; justify-content: space-between; align-items: center; gap: 8px;
    }
    .pp-row-label {
        font-size: 0.7rem; color: var(--app-text-2); flex-shrink: 0;
    }
    .pp-row-value {
        font-size: 0.7rem; font-weight: 600; color: var(--app-text);
        text-align: right; overflow: hidden; text-overflow: ellipsis;
    }
    .pp-row-value--accent {
        color: var(--app-accent); font-size: 0.65rem;
    }
    .pp-field-label {
        font-size: 0.68rem; color: var(--app-text-2); margin-bottom: 2px; display: block;
    }
    .pp-input {
        width: 100%; box-sizing: border-box; padding: 4px 6px;
        border: 1px solid var(--app-border); border-radius: var(--app-radius-sm);
        font-size: 0.75rem; font-family: var(--app-font); color: var(--app-text);
        background: var(--app-panel-bg);
    }
    .pp-input:focus { outline: none; border-color: var(--app-accent); }
    .pp-input--sm { width: 80px; text-align: right; }
    .pp-select {
        width: 100%; box-sizing: border-box; padding: 4px 6px;
        border: 1px solid var(--app-border); border-radius: var(--app-radius-sm);
        font-size: 0.75rem; font-family: var(--app-font); color: var(--app-text);
        background: var(--app-panel-bg);
    }
    .pp-color-picker {
        width: 36px; height: 22px; border: 1px solid var(--app-border);
        border-radius: 3px; padding: 0; background: none; cursor: pointer;
    }
    .pp-empty-msg {
        font-size: 0.7rem; color: var(--app-text-muted); padding: 4px 0; font-style: italic;
    }
    .pp-footer {
        padding: 10px 8px; border-top: 1px solid var(--app-border); margin-top: auto;
    }
    .pp-btn {
        display: flex; align-items: center; justify-content: center;
        width: 100%; padding: 6px 10px; border: none; border-radius: var(--app-radius-sm);
        font-size: 0.75rem; font-weight: 600; font-family: var(--app-font); cursor: pointer;
        transition: opacity 0.15s;
    }
    .pp-btn--primary {
        background: var(--app-gradient); color: #fff;
        box-shadow: var(--app-shadow-glow);
    }
    .pp-btn--primary:hover { opacity: 0.85; }
`;

// ─── Contextual Edit Bar (ceb-) — Phase 7 ────────────────────────────────────
// CONTRACT §05 §3 — prefix ceb- claimed in 05-BIM-UI-ARCHITECTURE-CONTRACT §3
// Phase 7: Floating circular icon buttons — no rectangular container.
// Each button is its own independent circle with white bg + shadow.
