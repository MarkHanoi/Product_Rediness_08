/**
 * @file src/styles/panels/viewerPanels.ts
 *
 * CSS for the Tools Panel (tp-) and View Browser (vb-) shells.
 * CONTRACT §05 §2 — CSS layer only, zero logic.
 */
export const TOOLS_PANEL_STYLES = `
    /* ─── Panel container ──────────────────────────────────────────────── */
    .tp-panel {
        width: 47px;
        min-width: 47px;
        margin: 11px 11px 11px 0;
        background: var(--app-bg);
        border: none;
        border-radius: var(--app-radius-lg);
        display: flex;
        flex-direction: column;
        pointer-events: auto;
        box-shadow: var(--app-shadow-panel);
        z-index: 10;
        overflow: hidden;
        height: fit-content;
        max-height: calc(100vh - 22px);
        font-family: var(--app-font);
        color: var(--app-text);
        transition: width 0.2s ease;
    }
    /* Expanded state — toggled by JS when any section is open */
    .tp-panel--has-open-section {
        width: 47px;
    }

    /* ─── Header — gradient, centered icon + hidden label ───────────── */
    .tp-header {
        background: var(--app-gradient);
        padding: 9px 11px;
        border-radius: var(--app-radius-lg) var(--app-radius-lg) 0 0;
        color: #ffffff;
        font-weight: 700;
        text-transform: uppercase;
        box-shadow: var(--app-shadow-header);
        flex-shrink: 0;
        user-select: none;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        height: 36px;
        box-sizing: border-box;
    }
    .tp-header-icon {
        font-size: 16px;
        flex-shrink: 0;
    }
    .tp-header-label {
        display: none;
        font-size: 9.9px;
        font-weight: 700;
        letter-spacing: 0.07em;
        white-space: nowrap;
    }
    .tp-panel--has-open-section .tp-header-label {
        display: none;
    }

    /* ─── Section wrapper ───────────────────────────────────────────── */
    .tp-section {
        border-bottom: 1px solid var(--app-border);
        overflow-y: auto;
    }
    .tp-section:last-child {
        border-bottom: none;
    }

    /* ─── Section toggle button — icon-only rail style ───────────────── */
    .tp-section-btn {
        width: 100%;
        height: 47px;
        padding: 0;
        background: var(--app-panel-bg);
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0;
        font-size: 9.9px;
        font-weight: 600;
        color: var(--app-text);
        transition: background 0.12s;
        font-family: var(--app-font);
    }
    .tp-section-btn:hover {
        background: #f7f9ff;
    }

    /* ─── Section icon wrapper ──────────────────────────────────────── */
    .tp-section-icon {
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        border-radius: 10px;
        transition: background 0.12s, transform 0.12s;
    }
    .tp-section-icon svg {
        width: 28px;
        height: 28px;
        display: block;
        color: var(--app-text);
        transition: color 0.12s;
    }
    .tp-section-btn:hover .tp-section-icon svg {
        color: var(--app-accent);
    }
    .tp-section-btn:hover .tp-section-icon {
        background: rgba(102,0,255,0.06);
    }

    /* Label spans — hidden in narrow mode */
    .tp-section-label {
        display: none;
        white-space: nowrap;
    }
    /* When panel is expanded: left-align icon + label */
    .tp-panel--has-open-section .tp-section-btn {
        justify-content: center;
        padding: 0;
        gap: 0;
    }
    .tp-panel--has-open-section .tp-section-label {
        display: none;
    }

    /* ─── VG section — direct-action accent button ───────────────── */
    .tp-section-btn--vg {
        background: var(--app-violet-soft);
        color: var(--app-accent);
        font-weight: 700;
        letter-spacing: 0.04em;
    }
    .tp-section-btn--vg:hover {
        background: rgba(102,0,255,0.14);
    }

    /* ─── Section body layout ───────────────────────────────────────── */
    /* display is toggled by JS (inline style) — only layout props here */
    .tp-section-body {
        flex-direction: column;
        gap: 4px;
        padding: 7px 9px 9px;
        background: #f4f7fc;
        min-width: 167px;
    }
`;

export const VIEW_BROWSER_STYLES = `
    /* ─── Panel container ──────────────────────────────────────────────── */
    .vb-panel {
        width: 47px;
        min-width: 47px;
        margin: 11px 0 11px 11px;
        background: var(--app-bg);
        border: none;
        border-radius: var(--app-radius-lg);
        display: flex;
        flex-direction: column;
        pointer-events: auto;
        box-shadow: var(--app-shadow-panel);
        z-index: 10;
        overflow: hidden;
        height: fit-content;
        max-height: calc(100vh - 22px);
        font-family: var(--app-font);
        color: var(--app-text);
        align-self: flex-start;
        transition: width 0.2s ease;
    }
    /* Expanded state — toggled by JS when any section is open */
    .vb-panel--has-open-section {
        width: 198px;
    }

    /* ─── Outer left panel — hosts toolbar section above vb-panel strip ─── */
    .plat-left-panel {
        display: flex;
        flex-direction: column;
        width: 198px;
        min-width: 198px;
        margin: 11px 0 11px 11px;
        align-self: flex-start;
        pointer-events: auto;
        z-index: 10;
        border-radius: var(--app-radius-lg);
        overflow: hidden;
        box-shadow: var(--app-shadow-panel);
        background: var(--app-bg);
        height: fit-content;
        max-height: calc(100vh - 22px);
        font-family: var(--app-font);
        color: var(--app-text);
    }
    /* When vb-panel is nested inside plat-left-panel, reset its own
       positioning/shadow/margin so the outer panel owns those */
    .plat-left-panel .vb-panel {
        width: 100%;
        min-width: 0;
        margin: 0;
        border-radius: 0;
        box-shadow: none;
        max-height: none;
        height: auto;
        overflow-x: hidden;
        overflow-y: visible;
        border-top: 1px solid var(--app-border, #dde3f0);
    }
    .plat-left-panel .vb-panel--has-open-section {
        width: 100%;
    }

    /* ─── Header — gradient with title + action buttons ─────────────── */
    .vb-header {
        background: var(--app-gradient);
        padding: 9px 11px;
        border-radius: var(--app-radius-lg) var(--app-radius-lg) 0 0;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: var(--app-shadow-header);
        flex-shrink: 0;
    }

    .vb-header-title {
        display: flex;
        align-items: center;
        gap: 5px;
        font-size: 9.9px;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: #ffffff;
        user-select: none;
    }

    .vb-header-actions {
        display: flex;
        align-items: center;
        gap: 4px;
    }

    /* AI gradient button */
    .vb-btn-ai {
        background: rgba(255,255,255,0.22);
        border: 1px solid rgba(255,255,255,0.30);
        border-radius: 5px;
        color: #ffffff;
        padding: 2px 7px;
        cursor: pointer;
        font-size: 10px;
        font-weight: 700;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.12s;
        font-family: var(--app-font);
        letter-spacing: 0.03em;
    }
    .vb-btn-ai:hover { background: rgba(255,255,255,0.32); }

    /* TREE outline button */
    .vb-btn-tree {
        background: rgba(255,255,255,0.10);
        border: 1px solid rgba(255,255,255,0.28);
        border-radius: 5px;
        color: #ffffff;
        padding: 2px 7px;
        cursor: pointer;
        font-size: 10px;
        font-weight: 700;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.12s;
        font-family: var(--app-font);
        letter-spacing: 0.03em;
    }
    .vb-btn-tree:hover { background: rgba(255,255,255,0.22); }

    /* ✦ Create panel button */
    .vb-btn-create {
        background: rgba(102,0,255,0.50);
        border: 1px solid rgba(255,255,255,0.20);
        border-radius: 5px;
        color: #ffffff;
        padding: 2px 6px;
        cursor: pointer;
        font-size: 10px;
        font-weight: 700;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.12s;
        font-family: var(--app-font);
    }
    .vb-btn-create:hover { background: rgba(120,40,140,0.65); }

    /* ─── View browser content area — height auto so panel fits content ─ */
    .vb-views-content {
        height: auto;
    }

    /* ─── Sub-section header (Camera, Viewpoints) ───────────────────── */
    .vb-sub-header {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 14px 7px;
        background: var(--app-panel-bg);
        font-size: 10px;
        font-weight: 700;
        color: var(--app-text);
        text-transform: uppercase;
        letter-spacing: 0.06em;
        border-top: 1px solid var(--app-border);
        flex-shrink: 0;
    }

    /* ─── Sub-section body ──────────────────────────────────────────── */
    .vb-sub-body {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 8px 10px 10px;
        background: #f4f7fc;
    }
    /* Modifier: adds bottom separator (used under Camera, before Viewpoints header) */
    .vb-sub-body--sep {
        border-bottom: 1px solid var(--app-border);
    }
`;

/* ── View Properties Section (vp-) — Phase 2.2 Inspector Default State ────── */
export const VIEW_PROPERTIES_SECTION_STYLES = `

    /* §05 §3 Prefix: vp- (View Properties inspector section) */

    .vp-root {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 8px 10px 12px;
    }

    .vp-accordion {
        border: 1px solid var(--app-border);
        border-radius: var(--app-radius-sm);
        overflow: hidden;
    }

    .vp-accordion-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 7px 12px;
        background: var(--app-panel-bg);
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--app-text);
        cursor: pointer;
        user-select: none;
        list-style: none;
        font-family: var(--app-font);
    }

    .vp-accordion-header:hover {
        background: var(--app-violet-soft);
    }

    .vp-accordion-header::marker,
    .vp-accordion-header::-webkit-details-marker {
        display: none;
    }

    details.vp-accordion[open] > .vp-accordion-header::after {
        content: '▴';
        font-size: 9px;
        color: var(--app-text-muted);
    }

    details.vp-accordion:not([open]) > .vp-accordion-header::after {
        content: '▾';
        font-size: 9px;
        color: var(--app-text-muted);
    }

    .vp-accordion-body {
        padding: 8px 12px 10px;
        background: #f4f7fc;
        display: flex;
        flex-direction: column;
        gap: 7px;
    }

    .vp-row {
        display: flex;
        flex-direction: column;
        gap: 3px;
    }

    .vp-row--toggle {
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
    }

    .vp-row-top {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .vp-label {
        font-size: 11px;
        color: var(--app-text-muted);
        font-family: var(--app-font);
        flex: 1;
    }

    .vp-value {
        font-size: 11px;
        font-weight: 600;
        color: var(--app-text);
        font-family: var(--app-font);
        min-width: 32px;
        text-align: right;
    }

    .vp-slider {
        width: 100%;
        height: 3px;
        accent-color: var(--app-accent);
        cursor: pointer;
        margin-top: 2px;
    }

    .vp-toggle {
        accent-color: var(--app-accent);
        cursor: pointer;
        width: 14px;
        height: 14px;
        flex-shrink: 0;
    }
`;

/* ── View Properties Panel (vpp-) ─────────────────────────────────────────── */
export const VIEW_PROPERTIES_PANEL_STYLES = `
    #view-properties-panel .vpp-drag-handle {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
        background: var(--app-gradient);
        border-radius: 8px 8px 0 0;
        cursor: grab;
        user-select: none;
        position: sticky;
        top: 0;
        z-index: 2;
    }
    #view-properties-panel .vpp-drag-handle:active { cursor: grabbing; }
    #view-properties-panel .vpp-drag-handle__title {
        font-size: 11px;
        font-weight: 700;
        color: #fff;
        letter-spacing: 0.08em;
        text-transform: uppercase;
    }
    #view-properties-panel .vpp-body {
        padding: 10px 12px 12px;
    }
    #view-properties-panel .vpp-section {
        border: 1px solid var(--app-border);
        border-radius: var(--app-radius-sm);
        margin-bottom: 8px;
        overflow: hidden;
    }
    #view-properties-panel .vpp-header {
        background: var(--app-bg);
        padding: 8px 12px;
        font-weight: 600;
        font-size: 11px;
        cursor: pointer;
        display: flex;
        justify-content: space-between;
        align-items: center;
        user-select: none;
        font-family: var(--app-font);
        color: var(--app-text);
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }
    #view-properties-panel .vpp-header:hover {
        background: var(--app-violet-soft);
    }
    #view-properties-panel .vpp-content {
        padding: 8px 12px;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px;
        font-size: 0.8rem;
    }
    #view-properties-panel .vpp-label {
        color: var(--app-text-muted);
        font-size: 11px;
        font-family: var(--app-font);
    }
    #view-properties-panel .vpp-value {
        color: var(--app-text);
        font-weight: 500;
        font-size: 11px;
        font-family: var(--app-font);
        text-align: right;
    }
    #view-properties-panel .vpp-input {
        width: 100%;
        padding: 4px 6px;
        border: 1px solid var(--app-border);
        border-radius: var(--app-radius-sm);
        font-size: 11px;
        box-sizing: border-box;
        background: var(--app-panel-bg);
        color: var(--app-text);
        font-family: var(--app-font);
    }
    #view-properties-panel .vpp-input:focus {
        outline: none;
        border-color: var(--app-accent);
    }
    #view-properties-panel .vpp-close-btn {
        position: absolute;
        top: 8px;
        right: 8px;
        background: rgba(255,255,255,0.2);
        border: none;
        font-size: 1rem;
        cursor: pointer;
        color: rgba(255,255,255,0.9);
        padding: 2px 6px;
        border-radius: 4px;
        line-height: 1;
        transition: background 0.12s;
    }
    #view-properties-panel .vpp-close-btn:hover {
        background: rgba(255,255,255,0.35);
        color: #fff;
    }
    #view-properties-panel .vpp-title {
        font-size: 11px;
        font-weight: 700;
        color: var(--app-text);
        margin-bottom: 12px;
        padding-right: 24px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        font-family: var(--app-font);
    }
`;

/* ── Intent Spine — UI/UX §1.1 + §1.3 (Wave 2) ────────────────────────────── */
/**
 * Tokens + styles for the Visibility-Intent spine surfaces:
 *   - vi-icon       : monochrome line glyphs (ViewerIconSet)
 *   - vi-pill       : intent source pill (Pure / Customised / No intent)
 *   - vi-spine      : the promoted Intent block at the top of the Properties panel
 *   - vi-overrides  : per-target override list with revert affordances
 *
 * All tokens use --vi-* names and inherit from the base AppTheme palette.
 * Single source of truth — no inline gradients / coloured emojis allowed
 * inside the intent spine.
 */
export const INTENT_SPINE_STYLES = `
    :root {
        --vi-bg:           var(--app-panel-bg, #14161f);
        --vi-bg-elevated:  var(--app-bg, #1a1c26);
        --vi-border:       var(--app-border, rgba(255,255,255,0.08));
        --vi-border-strong:rgba(255,255,255,0.18);
        --vi-text:         var(--app-text, #e7e7ee);
        --vi-text-muted:   var(--app-text-muted, #9ca3af);
        --vi-accent:       var(--app-accent, #8b5cf6);
        --vi-ok:           #22c55e;
        --vi-warn:         #f59e0b;
        --vi-error:        #ef4444;
        --vi-radius:       6px;
        --vi-row-pad:      6px 8px;
    }

    /* ── Icons ────────────────────────────────────────────────────────────── */
    .vi-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 16px;
        height: 16px;
        flex-shrink: 0;
        color: currentColor;
    }
    .vi-icon svg {
        width: 100%;
        height: 100%;
        display: block;
    }

    /* ── Source pill ──────────────────────────────────────────────────────── */
    .vi-pill {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 3px 8px;
        border-radius: 999px;
        font-size: 0.72rem;
        font-weight: 600;
        font-family: var(--app-font, inherit);
        background: var(--vi-bg-elevated);
        border: 1px solid var(--vi-border);
        color: var(--vi-text);
        line-height: 1.2;
        cursor: default;
    }
    button.vi-pill { cursor: pointer; }
    button.vi-pill:hover { border-color: var(--vi-border-strong); }
    .vi-pill__icon { width: 12px; height: 12px; }
    .vi-pill__label { white-space: nowrap; }
    .vi-pill--ok    { color: var(--vi-ok); }
    .vi-pill--warn  { color: var(--vi-warn); }
    .vi-pill--error { color: var(--vi-error); }

    /* ── Per-row source pill (Wave 5 / Stage P2) ─────────────────────────── */
    /* The smaller, denser variant rendered alongside each Intent-derived field
       in the View Range / Crop / Underlay / Output sections. Distinct from the
       global spine pill above (vi-pill). One swatch per IntentFieldSource. */
    .vi-field-pill {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 1px 6px;
        border-radius: 4px;
        font-size: 0.62rem;
        font-weight: 600;
        font-family: var(--app-font, inherit);
        line-height: 1.3;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        background: var(--vi-bg-elevated);
        border: 1px solid var(--vi-border);
        color: var(--vi-text-soft, var(--vi-text));
        cursor: help;
    }
    .vi-field-pill--system-default { color: var(--vi-text-soft, var(--vi-text)); }
    .vi-field-pill--intent         { color: var(--vi-ok); border-color: var(--vi-ok); }
    .vi-field-pill--profile        { color: var(--vi-accent, var(--vi-ok)); border-color: var(--vi-accent, var(--vi-ok)); }
    .vi-field-pill--override       { color: var(--vi-warn); border-color: var(--vi-warn); background: rgba(255,180,0,.08); }

    /* ── Reset-to-intent button (Wave 5 / Stage P2) ──────────────────────── */
    .vi-reset-btn {
        width: 22px;
        height: 22px;
        padding: 0;
        border-radius: 4px;
        border: 1px solid var(--vi-border);
        background: var(--vi-bg-elevated);
        color: var(--vi-text);
        font-size: 0.95rem;
        line-height: 1;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
    }
    .vi-reset-btn:hover { border-color: var(--vi-border-strong); }
    .vi-reset-btn--disabled,
    .vi-reset-btn:disabled {
        cursor: not-allowed;
        opacity: 0.35;
        pointer-events: none;
    }

    /* ── Source-chain tooltip (Wave 5 / Stage B4) ────────────────────────── */
    .vi-chain-tooltip {
        background: var(--vi-bg-elevated);
        border: 1px solid var(--vi-border-strong);
        border-radius: var(--vi-radius);
        padding: 8px 10px;
        font-size: 0.74rem;
        font-family: var(--app-font, inherit);
        color: var(--vi-text);
        box-shadow: 0 4px 14px rgba(0,0,0,0.25);
        max-width: 320px;
        pointer-events: none;
    }
    .vi-chain-tooltip__title {
        font-weight: 700;
        margin-bottom: 4px;
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--vi-text-soft, var(--vi-text));
    }
    .vi-chain-tooltip__list {
        margin: 0;
        padding-left: 16px;
    }
    .vi-chain-tooltip__item {
        margin: 2px 0;
        line-height: 1.35;
    }
    .vi-chain-tooltip__item--final { font-weight: 700; }
    .vi-chain-tooltip__origin { color: var(--vi-text); }
    .vi-chain-tooltip__value  { color: var(--vi-text-soft, var(--vi-text)); }

    /* ── Spine usage-count line (Wave 5 / Stage A8) ──────────────────────── */
    .vi-spine__usage {
        font-size: 0.74rem;
        color: var(--vi-text-soft, var(--vi-text));
        margin-top: -4px;
    }
    .vi-spine__usage--solo { color: var(--vi-warn); }

    /* ── Diverged banner (Wave 6 / Stage A9) ─────────────────────────────── */
    /* Rendered above the spine head when instance.pinnedVersion < intent.version
       and the user hasn't dismissed for the session. */
    .vi-diverged {
        background: rgba(255,180,0,.10);
        border: 1px solid var(--vi-warn);
        border-radius: var(--vi-radius);
        padding: 8px 10px;
        margin-bottom: 8px;
        display: flex;
        flex-direction: column;
        gap: 6px;
    }
    .vi-diverged__message {
        display: flex;
        align-items: flex-start;
        gap: 6px;
        font-size: 0.78rem;
        color: var(--vi-text);
        line-height: 1.35;
    }
    .vi-diverged__icon {
        color: var(--vi-warn);
        font-size: 0.95rem;
        line-height: 1;
        flex: 0 0 auto;
        margin-top: 1px;
    }
    .vi-diverged__text { flex: 1 1 auto; }
    .vi-diverged__actions {
        display: flex;
        gap: 6px;
        justify-content: flex-end;
    }
    .vi-diverged__btn {
        padding: 4px 10px;
        border-radius: 4px;
        font-size: 0.74rem;
        font-weight: 600;
        font-family: var(--app-font, inherit);
        cursor: pointer;
        line-height: 1.2;
    }
    .vi-diverged__btn--primary {
        background: var(--vi-warn);
        border: 1px solid var(--vi-warn);
        color: #1a1300;
    }
    .vi-diverged__btn--primary:hover { filter: brightness(1.08); }
    .vi-diverged__btn--ghost {
        background: transparent;
        border: 1px solid var(--vi-border);
        color: var(--vi-text);
    }
    .vi-diverged__btn--ghost:hover { border-color: var(--vi-border-strong); }

    /* ── Spine block ──────────────────────────────────────────────────────── */
    .vi-spine {
        background: var(--vi-bg-elevated);
        border: 1px solid var(--vi-border-strong);
        border-radius: var(--vi-radius);
        padding: 10px 12px;
        margin-bottom: 10px;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    .vi-spine__head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
    }
    .vi-spine__title {
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--vi-text-muted);
        display: inline-flex;
        align-items: center;
        gap: 6px;
    }
    .vi-spine__name {
        font-size: 13px;
        font-weight: 600;
        color: var(--vi-text);
        line-height: 1.2;
    }
    .vi-spine__row {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
    }
    .vi-spine__select {
        flex: 1 1 auto;
        min-width: 0;
        padding: 5px 8px;
        background: var(--vi-bg);
        border: 1px solid var(--vi-border);
        border-radius: var(--vi-radius);
        color: var(--vi-text);
        font-size: 12px;
        font-family: var(--app-font, inherit);
    }
    .vi-spine__select:focus {
        outline: none;
        border-color: var(--vi-accent);
    }
    .vi-spine__btn {
        width: 100%;
        padding: 8px 12px;
        background: var(--vi-bg);
        border: 1px solid var(--vi-border-strong);
        border-radius: var(--vi-radius);
        color: var(--vi-text);
        font-size: 12px;
        font-weight: 600;
        font-family: var(--app-font, inherit);
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        transition: background 0.12s, border-color 0.12s;
        text-transform: uppercase;
        letter-spacing: 0.04em;
    }
    .vi-spine__btn:hover {
        background: var(--vi-accent);
        border-color: var(--vi-accent);
        color: #fff;
    }

    /* ── Override list ────────────────────────────────────────────────────── */
    .vi-overrides {
        display: flex;
        flex-direction: column;
        gap: 4px;
        border-top: 1px dashed var(--vi-border);
        padding-top: 8px;
    }
    .vi-overrides__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
    }
    .vi-overrides__title {
        font-size: 11px;
        font-weight: 600;
        color: var(--vi-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.06em;
    }
    .vi-overrides__clear-all {
        background: none;
        border: 1px solid var(--vi-border);
        color: var(--vi-text-muted);
        border-radius: var(--vi-radius);
        font-size: 0.7rem;
        padding: 2px 8px;
        cursor: pointer;
        font-family: inherit;
    }
    .vi-overrides__clear-all:hover {
        border-color: var(--vi-error);
        color: var(--vi-error);
    }
    .vi-overrides__list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 3px;
        max-height: 160px;
        overflow-y: auto;
    }
    .vi-overrides__row {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: var(--vi-row-pad);
        background: var(--vi-bg);
        border: 1px solid var(--vi-border);
        border-radius: var(--vi-radius);
        font-size: 11px;
        color: var(--vi-text);
    }
    .vi-overrides__row-icon { color: var(--vi-warn); }
    .vi-overrides__row-text {
        flex: 1 1 auto;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .vi-overrides__revert {
        background: none;
        border: none;
        padding: 2px;
        cursor: pointer;
        color: var(--vi-text-muted);
        display: inline-flex;
        border-radius: 4px;
        transition: color 0.12s, background 0.12s;
    }
    .vi-overrides__revert:hover {
        color: var(--vi-error);
        background: rgba(239,68,68,0.08);
    }

    /* ── Header Intent picker (Wave 3 / S4) ──────────────────────────────── */
    .vh-intent-picker {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 0 4px;
        margin-left: 4px;
        font-size: 11px;
        color: var(--vi-text-muted);
        font-family: var(--app-font, inherit);
    }
    .vh-intent-picker__label {
        text-transform: uppercase;
        letter-spacing: 0.06em;
        font-weight: 600;
        font-size: 10px;
    }
    .vh-intent-picker__select {
        max-width: 160px;
        padding: 3px 6px;
        background: var(--vi-bg);
        border: 1px solid var(--vi-border);
        border-radius: var(--vi-radius);
        color: var(--vi-text);
        font-size: 11px;
        font-family: var(--app-font, inherit);
        cursor: pointer;
        transition: border-color 0.12s;
    }
    .vh-intent-picker__select:hover  { border-color: var(--vi-border-strong); }
    .vh-intent-picker__select:focus  { outline: none; border-color: var(--vi-accent); }
`;

