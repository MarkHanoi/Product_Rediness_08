/**
 * PropertyPanelTheme
 *
 * Centralised design tokens and CSS for the Generic Property Panel.
 *
 * Visual language (matches reference image):
 *  - Panel body   : light blue-grey (#e8edf6) — sections float as white cards
 *  - Header       : Violet gradient (#8B5CF6 → #6600FF) — platform violet palette
 *  - Section cards: #ffffff, soft shadow, 12px radius, no hard border
 *  - Step circles : gradient, 22px, with a thin vertical connector thread running
 *                   between cards (drawn via ::before on .gpp-body)
 *  - Inputs       : underline only (bottom border), clean sans-serif
 *  - Apply button : AI gradient pill, white text
 *
 * Zero impact on logic or any other tool — CSS class names only.
 */

/** Gradient matching the platform violet palette. */
export const AI_GRADIENT = 'linear-gradient(135deg, #8B5CF6 0%, #6600FF 100%)';

/** Step numbers keyed to section identifiers. */
export const SECTION_STEPS: Record<string, number> = {
    identity:      1,
    spatial:       2,
    definition:    3,
    instance:      4,
    relationships: 5,
    metadata:      6,
};

/** All section backgrounds are white — panel body provides the light-blue contrast. */
export const SECTION_BG: Record<string, string> = {
    identity:      '#ffffff',
    spatial:       '#ffffff',
    definition:    '#ffffff',
    instance:      '#ffffff',
    relationships: '#ffffff',
    metadata:      '#ffffff',
};

/** Master CSS injected once into <head>. All class names prefixed with gpp-. */
export const PANEL_STYLES = `
    /* ─── Panel shell ──────────────────────────────────────────────── */
    .gpp-panel {
        position: fixed;
        top: 324px;
        right: 12px;
        left: auto;
        width: 292px;
        max-height: calc(100vh - 24px);
        background: #e8edf6;
        color: #1a2035;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        box-shadow:
            0 8px 32px rgba(30, 50, 120, 0.13),
            0 2px 8px  rgba(30, 50, 120, 0.07);
        border: none;
        border-radius: 16px;
        display: none;
        z-index: 1100;
        overflow-y: auto;
        overflow-x: hidden;
        pointer-events: auto;
        scrollbar-width: thin;
        scrollbar-color: #c4cde0 transparent;
    }
    .gpp-panel::-webkit-scrollbar { width: 4px; }
    .gpp-panel::-webkit-scrollbar-track { background: transparent; }
    .gpp-panel::-webkit-scrollbar-thumb { background: #c4cde0; border-radius: 2px; }

    /* ─── Resize handles (position:fixed overlays so panel overflow never clips them) ─ */
    /* South handle — drag bottom edge to change panel height */
    .gpp-resize-s {
        position: fixed;
        height: 10px;
        cursor: s-resize;
        z-index: 1101;
        background: transparent;
        border-radius: 0 0 14px 14px;
        transition: background 0.15s;
        display: none;
    }
    .gpp-resize-s:hover, .gpp-resize-s--active {
        background: rgba(102, 0, 255, 0.10);
    }
    /* West handle — drag left edge to change panel width */
    .gpp-resize-w {
        position: fixed;
        width: 8px;
        cursor: ew-resize;
        z-index: 1101;
        background: transparent;
        border-radius: 14px 0 0 14px;
        transition: background 0.15s;
        display: none;
    }
    .gpp-resize-w:hover, .gpp-resize-w--active {
        background: rgba(102, 0, 255, 0.10);
    }

    .gpp-panel--predraw {
        height: auto;
        min-height: 0;
        overflow: visible;
    }

    .gpp-panel--wall-predraw {
        background: transparent;
        border-radius: 16px;
    }

    .gpp-panel--wall-predraw .gpp-header {
        border-radius: 16px;
    }

    /* ─── Header — violet gradient ──────────────────────────────────── */
    .gpp-header {
        background: linear-gradient(135deg, #8B5CF6 0%, #6600FF 100%);
        padding: 10px 44px 10px 16px;
        border-radius: 16px 16px 0 0;
        color: #ffffff;
        cursor: grab;
        user-select: none;
        position: sticky;
        top: 0;
        z-index: 10;
        box-shadow: 0 2px 12px rgba(102, 0, 255, 0.35);
    }

    /* ─── Close button — top-right of header ────────────────────────── */
    .gpp-close-btn {
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
        font-family: inherit;
        line-height: 1;
        padding: 0;
        flex-shrink: 0;
        z-index: 11;
        transition: background 0.12s;
    }
    .gpp-close-btn:hover { background: rgba(255,255,255,0.32); }

    .gpp-type-badge {
        font-size: 9px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.14em;
        color: rgba(255,255,255,0.65);
        margin-bottom: 3px;
    }

    .gpp-mark-input {
        font-size: 14px;
        font-weight: 700;
        color: #ffffff;
        background: transparent;
        border: none;
        border-bottom: 1.5px solid rgba(255,255,255,0.28);
        outline: none;
        width: 100%;
        padding: 2px 0 4px;
        margin-bottom: 5px;
        letter-spacing: 0.01em;
    }
    .gpp-mark-input::placeholder { color: rgba(255,255,255,0.38); }
    .gpp-mark-input:focus { border-bottom-color: rgba(255,255,255,0.65); }

    .gpp-id-row {
        display: flex;
        align-items: center;
        gap: 7px;
        font-size: 9px;
        color: rgba(255,255,255,0.55);
        font-family: "SF Mono", "Fira Code", monospace;
        margin-bottom: 4px;
    }
    .gpp-id-copy {
        background: rgba(255,255,255,0.13);
        border: 1px solid rgba(255,255,255,0.20);
        border-radius: 3px;
        color: rgba(255,255,255,0.78);
        font-size: 8px;
        padding: 1px 6px;
        cursor: pointer;
        transition: background 0.12s;
        font-family: inherit;
    }
    .gpp-id-copy:hover { background: rgba(255,255,255,0.22); }

    .gpp-spatial-summary {
        font-size: 9px;
        color: rgba(255,255,255,0.62);
        margin-bottom: 4px;
        letter-spacing: 0.03em;
    }

    .gpp-type-selector {
        width: 100%;
        font-size: 11px;
        padding: 5px 8px;
        border-radius: 6px;
        border: 1px solid rgba(255,255,255,0.22);
        background: rgba(255,255,255,0.13);
        color: #ffffff;
        cursor: pointer;
        margin-bottom: 4px;
        outline: none;
    }
    .gpp-type-selector option { background: #3b2a7a; color: #fff; }

    /* ─── Footer action bar (Move / Rotate / Delete) ───────────────── */
    /* Sits at the bottom of .gpp-body — below Apply button.          */
    /* Buttons use dark-on-light styling to match the panel body bg.  */
    .gpp-actions {
        display: flex;
        gap: 6px;
        margin-top: 10px;
        padding-top: 10px;
        border-top: 1px solid #dde3f0;
    }
    .gpp-action-btn {
        flex: 1;
        font-size: 9.5px;
        font-weight: 600;
        padding: 6px 4px;
        background: #ffffff;
        border: 1px solid #dde3f0;
        border-radius: 6px;
        color: #1a2035;
        cursor: pointer;
        text-align: center;
        transition: background 0.12s, border-color 0.12s;
        letter-spacing: 0.02em;
        font-family: inherit;
    }
    .gpp-action-btn:hover { background: #f0f4ff; border-color: #b0bcde; }
    .gpp-action-btn.danger { color: #dc2626; border-color: rgba(220,53,69,0.30); }
    .gpp-action-btn.danger:hover { background: rgba(220,53,69,0.07); border-color: rgba(220,53,69,0.50); }

    /* ─── Body — light blue-grey, sections float as cards ─────────── */
    .gpp-body {
        padding: 14px 12px 16px;
        background: #e8edf6;
        position: relative;
    }

    /* Vertical connector thread — shows in the 8px gaps between section cards.
       left = body-padding-left(12) + section-header-padding-left(12) + half-circle(11) = 35px
       bottom accounts for: body-padding(16) + footer-bar(38) + apply-btn(43) = ~100px */
    .gpp-body::before {
        content: '';
        position: absolute;
        left: 35px;
        top: 36px;
        bottom: 104px;
        width: 2px;
        background: linear-gradient(to bottom, rgba(139,92,246,0.45) 0%, rgba(102,0,255,0.18) 100%);
        border-radius: 1px;
        pointer-events: none;
        z-index: 0;
    }

    /* ─── Section cards ────────────────────────────────────────────── */
    .gpp-section {
        background: #ffffff;
        border-radius: 12px;
        margin-bottom: 8px;
        overflow: hidden;
        box-shadow:
            0 2px 10px rgba(30, 50, 120, 0.07),
            0 1px 3px  rgba(30, 50, 120, 0.04);
        border: none;
        position: relative;
        z-index: 1;     /* sit above the connector thread */
    }

    /* Section header row */
    .gpp-section-header {
        background: #ffffff;
        padding: 10px 12px;
        display: flex;
        align-items: center;
        gap: 10px;
        cursor: pointer;
        user-select: none;
        border-bottom: 1.5px solid transparent;
        transition: background 0.12s;
        border-radius: 12px 12px 0 0;
    }
    .gpp-section-header:hover { background: #f7f9ff; }
    .gpp-section-header.open { border-bottom-color: #eef1f8; border-radius: 12px 12px 0 0; }

    /* Step circle — violet gradient, 22px */
    .gpp-step-circle {
        width: 22px;
        height: 22px;
        min-width: 22px;
        border-radius: 50%;
        background: linear-gradient(135deg, #8B5CF6 0%, #6600FF 100%);
        color: #ffffff;
        font-size: 9px;
        font-weight: 800;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        letter-spacing: 0;
        box-shadow: 0 2px 8px rgba(102, 0, 255, 0.35);
    }

    /* Section title */
    .gpp-section-title {
        font-size: 11px;
        font-weight: 700;
        color: #1a2035;
        text-transform: uppercase;
        letter-spacing: 0.07em;
        flex: 1;
    }

    /* Chevron */
    .gpp-chevron {
        font-size: 8px;
        color: #b0bacc;
        transition: transform 0.15s;
        flex-shrink: 0;
    }

    /* Section body */
    .gpp-section-body {
        padding: 10px 14px 12px;
        display: grid;
        grid-template-columns: 104px 1fr;
        gap: 6px 10px;
        align-items: start;
        background: #ffffff;
        border-radius: 0 0 12px 12px;
    }
    .gpp-section-body.hidden { display: none; }

    /* ─── Property rows ─────────────────────────────────────────────── */
    .gpp-prop-label {
        font-size: 10px;
        color: #7a8aaa;
        padding: 5px 0 3px;
        align-self: end;
        line-height: 1.3;
        letter-spacing: 0.01em;
    }

    /* Read-only value — plain text, no pill background */
    .gpp-prop-value-ro {
        font-size: 10px;
        font-weight: 600;
        color: #1a2035;
        padding: 5px 0 3px;
        border-bottom: 1px solid #e6eaf4;
        word-break: break-all;
        cursor: pointer;
        transition: color 0.1s;
        background: transparent;
    }
    .gpp-prop-value-ro:hover { color: #8B5CF6; }

    /* Editable input — underline only */
    .gpp-input {
        width: 100%;
        padding: 5px 0 3px;
        border: none;
        border-bottom: 1.5px solid #d4daea;
        border-radius: 0;
        font-size: 10.5px;
        font-weight: 600;
        box-sizing: border-box;
        background: transparent;
        color: #1a2035;
        outline: none;
        transition: border-color 0.15s;
        font-family: inherit;
    }
    .gpp-input:focus { border-bottom-color: #8B5CF6; }
    .gpp-input.error { border-bottom-color: #e53935; }

    .gpp-select {
        width: 100%;
        padding: 5px 0 3px;
        border: none;
        border-bottom: 1.5px solid #d4daea;
        border-radius: 0;
        font-size: 10.5px;
        font-weight: 600;
        box-sizing: border-box;
        background: transparent;
        color: #1a2035;
        cursor: pointer;
        outline: none;
        transition: border-color 0.15s;
        font-family: inherit;
        -webkit-appearance: none;
        appearance: none;
    }
    .gpp-select:focus { border-bottom-color: #8B5CF6; }

    .gpp-color-row {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 3px 0;
    }
    .gpp-color-input {
        width: 28px;
        height: 20px;
        border: 1.5px solid #d4daea;
        border-radius: 5px;
        padding: 1px;
        cursor: pointer;
        background: none;
    }
    .gpp-color-hex {
        font-size: 9px;
        color: #9aaac0;
        font-family: "SF Mono", "Fira Code", monospace;
    }

    .gpp-checkbox-label {
        display: flex;
        align-items: center;
        gap: 7px;
        font-size: 10.5px;
        font-weight: 600;
        cursor: pointer;
        color: #1a2035;
        padding: 4px 0;
    }

    .gpp-error-row {
        grid-column: 1 / span 2;
        font-size: 9px;
        color: #e53935;
        margin-top: -2px;
        padding-left: 0;
    }

    /* ─── Apply button — violet gradient pill ───────────────────────── */
    .gpp-apply-btn {
        width: 100%;
        padding: 10px;
        background: linear-gradient(135deg, #8B5CF6 0%, #6600FF 100%);
        color: #ffffff;
        font-size: 11px;
        font-weight: 700;
        border: none;
        border-radius: 10px;
        cursor: pointer;
        margin-top: 12px;
        letter-spacing: 0.05em;
        transition: opacity 0.15s, box-shadow 0.15s;
        box-shadow: 0 4px 14px rgba(102, 0, 255, 0.35);
    }
    .gpp-apply-btn:hover {
        opacity: 0.92;
        box-shadow: 0 6px 18px rgba(102, 0, 255, 0.48);
    }
    .gpp-apply-btn:disabled { opacity: 0.45; cursor: not-allowed; box-shadow: none; }

    /* ─── Validation banner ─────────────────────────────────────────── */
    .gpp-validation-banner {
        background: rgba(220, 38, 38, 0.06);
        border: 1px solid rgba(220, 38, 38, 0.22);
        border-radius: 7px;
        padding: 7px 10px;
        font-size: 9px;
        color: #dc2626;
        margin-top: 8px;
        display: none;
    }
`;
