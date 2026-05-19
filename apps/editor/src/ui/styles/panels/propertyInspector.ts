/**
 * @file src/styles/panels/propertyInspector.ts
 *
 * CSS for the Property Inspector panel.
 * Prefix: pi-  (registered per Contract §05 §3)
 * CONTRACT §05 §2.1 — CSS layer only, zero logic.
 * CONTRACT §05 §7.6 — No inline <style> tags; all CSS injected via injectAppTheme().
 */

export const PROPERTY_INSPECTOR_STYLES = `
    .pi-section {
        border: 1px solid #eee;
        border-radius: 6px;
        margin-bottom: 8px;
        overflow: hidden;
    }
    .pi-header {
        background: #f8f9fa;
        padding: 8px 12px;
        font-weight: 600;
        font-size: 0.85rem;
        cursor: pointer;
        display: flex;
        justify-content: space-between;
        align-items: center;
        user-select: none;
    }
    .pi-header:hover {
        background: #f1f3f5;
    }
    .pi-content {
        padding: 12px;
        display: grid;
        grid-template-columns: 120px 1fr;
        gap: 8px;
        align-items: center;
    }
    .pi-label {
        font-size: 0.8rem;
        color: #666;
    }
    .pi-input {
        width: 100%;
        padding: 4px 8px;
        border: 1px solid #ced4da;
        border-radius: 4px;
        font-size: 0.8rem;
        box-sizing: border-box;
    }
    .pi-input:disabled {
        background: #f8f9fa;
        color: #adb5bd;
        border-color: #e9ecef;
    }
    .pi-full-width {
        grid-column: 1 / span 2;
    }
`;

/* ── Door / Element Section widget (dw-section-) ──────────────────────────── */
export const DOOR_SECTION_STYLES = `
    .dw-section {
        background: var(--app-panel-bg);
        border-radius: var(--app-radius-md);
        box-shadow: var(--app-shadow-card);
        margin: 0 12px 10px;
        overflow: hidden;
    }
    .dw-section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 9px 12px 8px;
        cursor: pointer;
        user-select: none;
    }
    .dw-section-title {
        font-size: 11px;
        font-weight: 700;
        color: var(--app-text);
        text-transform: uppercase;
        letter-spacing: 0.04em;
    }
    .dw-section-toggle {
        font-size: 10px;
        color: var(--app-text-muted);
    }
    .dw-section-body {
        padding: 8px 12px 12px;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    .dw-field {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
    }
    .dw-label {
        font-size: 11px;
        color: var(--app-text-2);
        flex: 1 1 auto;
        min-width: 0;
    }
    .dw-control {
        flex: 0 0 auto;
    }
    .dw-select {
        font-size: 11px;
        padding: 3px 6px;
        border: 1px solid var(--app-border);
        border-radius: var(--app-radius-sm);
        background: var(--app-bg);
        color: var(--app-text);
        cursor: pointer;
        min-width: 90px;
    }
    .dw-color {
        width: 32px;
        height: 22px;
        border: 1px solid var(--app-border);
        border-radius: 4px;
        padding: 0;
        cursor: pointer;
        background: none;
    }
    .dw-number {
        font-size: 11px;
        padding: 3px 6px;
        border: none;
        border-bottom: 1.5px solid var(--app-border);
        background: transparent;
        color: var(--app-text);
        width: 64px;
        text-align: right;
    }
    .dw-number:focus { outline: none; border-bottom-color: var(--app-accent); }
    .dw-text {
        font-size: 11px;
        padding: 3px 6px;
        border: none;
        border-bottom: 1.5px solid var(--app-border);
        background: transparent;
        color: var(--app-text);
        width: 90px;
    }
    .dw-text:focus { outline: none; border-bottom-color: var(--app-accent); }
    .dw-toggle-row {
        display: flex;
        gap: 4px;
    }
    .dw-toggle-btn {
        font-size: 10px;
        padding: 3px 9px;
        border: 1px solid var(--app-border);
        border-radius: 4px;
        background: transparent;
        color: var(--app-text-2);
        cursor: pointer;
        transition: all 0.12s;
    }
    .dw-toggle-btn--active {
        background: var(--app-gradient);
        border-color: var(--app-accent);
        color: #fff;
    }
`;
