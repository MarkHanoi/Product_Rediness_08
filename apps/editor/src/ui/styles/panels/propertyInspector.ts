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

/* ── Door / Window / Element parametric section (dw-section-) ────────────────
 * §FIX-PROPERTIES-PANEL-POLISH — this stylesheet is SHARED by every bespoke
 * parametric section (door + window today; any future element that builds
 * `.dw-field` rows). The layout mirrors the schema-driven `.gpp-section-body`
 * grid so EVERY element's inspector reads with one aligned value column.
 *
 * Alignment model
 *   - `.dw-section-body` is a 2-column CSS grid: [label | value].
 *   - `.dw-field` uses `display: contents` so its label + control drop straight
 *     onto the grid tracks — the control's LEFT edge is the shared value column
 *     and every control stretches to a single shared RIGHT edge (no raggedness).
 *   - No per-row dividers; section cards + generous rhythm provide separation.
 *
 * Governed by C06 (UI shell) + C18 (element preview visual contract).
 * Brand: white + PRYZM purple (#6600FF) via design tokens; NO black.
 * ────────────────────────────────────────────────────────────────────────── */
export const DOOR_SECTION_STYLES = `
    /* Card metrics mirror .gpp-section so parametric sections line up flush
       with the schema-driven cards inside the shared .gpp-body padding. */
    .dw-section {
        background: var(--app-panel-bg);
        border-radius: var(--app-radius-md);
        box-shadow: var(--app-shadow-card);
        margin: 0 0 8px;
        overflow: hidden;
    }
    .dw-section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 10px 14px;
        cursor: pointer;
        user-select: none;
        border-radius: var(--app-radius-md) var(--app-radius-md) 0 0;
        transition: background 0.12s;
    }
    .dw-section-header:hover { background: #f7f9ff; }
    .dw-section-title {
        font-size: 11px;
        font-weight: 700;
        color: var(--app-text);
        text-transform: uppercase;
        letter-spacing: 0.07em;
        flex: 1 1 auto;
        min-width: 0;
    }
    .dw-section-toggle {
        font-size: 9px;
        color: #b0bacc;
        flex-shrink: 0;
        transition: color 0.12s;
    }
    .dw-section-header:hover .dw-section-toggle { color: var(--app-accent); }

    /* Aligned 2-column grid — mirrors .gpp-section-body so door/window rows
       share the label/value rhythm of the schema-driven sections. */
    .dw-section-body {
        padding: 10px 14px 12px;
        display: grid;
        grid-template-columns: 108px 1fr;
        gap: 7px 12px;
        align-items: center;
    }

    /* Each field flattens onto the parent grid so label + control align. */
    .dw-field {
        display: contents;
    }
    .dw-label {
        font-size: 10px;
        color: var(--app-text-muted);
        letter-spacing: 0.01em;
        line-height: 1.3;
        align-self: center;
        min-width: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    /* Value cell — every control lives here and fills the shared column. */
    .dw-control {
        min-width: 0;
        display: flex;
        align-items: center;
        justify-content: flex-start;
    }
    .dw-control > * { max-width: 100%; }

    /* ── Controls: one consistent underline affordance, full-width fill ── */
    .dw-select {
        width: 100%;
        font-size: 10.5px;
        font-weight: 600;
        padding: 4px 0 3px;
        border: none;
        border-bottom: 1.5px solid var(--app-border);
        border-radius: 0;
        background: transparent;
        color: var(--app-text);
        cursor: pointer;
        outline: none;
        transition: border-color 0.15s;
        -webkit-appearance: none;
        appearance: none;
    }
    .dw-select:focus { border-bottom-color: var(--app-accent); }

    .dw-number,
    .dw-text {
        width: 100%;
        box-sizing: border-box;
        font-size: 10.5px;
        font-weight: 600;
        padding: 4px 0 3px;
        border: none;
        border-bottom: 1.5px solid var(--app-border);
        background: transparent;
        color: var(--app-text);
        text-align: left;
        outline: none;
        transition: border-color 0.15s;
    }
    .dw-number:focus,
    .dw-text:focus { border-bottom-color: var(--app-accent); }

    .dw-color {
        width: 30px;
        height: 20px;
        border: 1.5px solid var(--app-border);
        border-radius: 5px;
        padding: 1px;
        cursor: pointer;
        background: none;
        flex: 0 0 auto;
    }

    /* Toggle group — fills the value column, evenly split segments. */
    .dw-toggle-row {
        display: flex;
        gap: 5px;
        width: 100%;
    }
    .dw-toggle-btn {
        flex: 1 1 0;
        min-width: 0;
        font-size: 9.5px;
        font-weight: 600;
        padding: 4px 6px;
        border: 1px solid var(--app-border);
        border-radius: var(--app-radius-sm);
        background: #ffffff;
        color: var(--app-text-2);
        cursor: pointer;
        transition: background 0.12s, border-color 0.12s, color 0.12s;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .dw-toggle-btn:hover {
        background: #f7f9ff;
        border-color: #b0bcde;
    }
    /* JS applies the plain \`active\` class; \`--active\` kept for back-compat. */
    .dw-toggle-btn.active,
    .dw-toggle-btn--active {
        background: var(--app-gradient);
        border-color: var(--app-accent);
        color: #fff;
    }

    /* Range slider — fills the value column; readout pinned to the right. */
    .dw-slider {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
    }
    .dw-slider input[type="range"] {
        flex: 1 1 auto;
        min-width: 0;
        accent-color: var(--app-accent);
    }
    .dw-slider-value {
        flex: 0 0 auto;
        font-size: 10px;
        font-weight: 600;
        color: var(--app-text-2);
        min-width: 30px;
        text-align: right;
        font-variant-numeric: tabular-nums;
    }
`;
