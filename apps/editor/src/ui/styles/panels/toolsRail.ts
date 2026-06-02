/**
 * @file src/styles/panels/toolsRail.ts
 *
 * CSS for the Tools Rail, Levels+Grids Rail, and general Rail Panel (tr-, rp- prefixes).
 * CONTRACT §05 §2 — CSS layer only, zero logic.
 */
export const TOOLS_RAIL_PANEL_STYLES = `
    /* ── Tools Rail Panel container ──────────────────────────── */
    .tpr-panel {
        position: fixed;
        width: 180px;
        min-width: 62px;
        max-width: 360px;
        background: #ffffff;
        border-radius: var(--app-radius-lg) 0 0 var(--app-radius-lg);
        box-shadow: var(--app-shadow-panel);
        display: flex;
        flex-direction: column;
        z-index: 15;
        overflow: hidden;
        pointer-events: auto;
        font-family: var(--app-font);
        color: var(--app-text);
    }

    /* ── Left-edge drag-to-resize handle ──────────────────────── */
    .tpr-resize-handle {
        position: absolute;
        top: 0;
        left: 0;
        width: 5px;
        height: 100%;
        cursor: col-resize;
        z-index: 20;
        background: transparent;
        transition: background 0.15s;
        border-radius: var(--app-radius-lg) 0 0 var(--app-radius-lg);
    }
    .tpr-resize-handle:hover,
    .tpr-resize-handle:active {
        background: rgba(102, 0, 255, 0.15);
    }

    .tpr-panel--animating {
        animation: tpr-slide-in 0.18s ease;
    }

    @keyframes tpr-slide-in {
        from { opacity: 0; transform: translateX(10px); }
        to   { opacity: 1; transform: translateX(0); }
    }

    /* ── Tools Rail Panel header ──────────────────────────────── */
    .tpr-header {
        background: var(--app-gradient);
        padding: 0 6px;
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-shrink: 0;
        height: 36px;
        box-sizing: border-box;
        user-select: none;
        box-shadow: var(--app-shadow-header);
        border-radius: var(--app-radius-lg) 0 0 0;
    }

    .tpr-header-title {
        font-size: 9.9px;
        font-weight: 700;
        letter-spacing: 0.07em;
        text-transform: uppercase;
        min-width: 0;
        overflow: hidden;
        text-overflow: clip;
        white-space: nowrap;
    }

    .tpr-header-actions {
        display: flex;
        align-items: center;
        gap: 2px;
    }

    .tpr-close-btn {
        background: rgba(255,255,255,0.18);
        border: 1px solid rgba(255,255,255,0.28);
        border-radius: 4px;
        color: #fff;
        width: 18px;
        height: 22px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 16px;
        line-height: 1;
        font-family: var(--app-font);
        padding: 0;
        transition: background 0.12s;
        flex-shrink: 0;
    }

    .tpr-close-btn:hover {
        background: rgba(255,255,255,0.35);
    }

    .tpr-pin-btn {
        background: rgba(255,255,255,0.12);
        border: 1px solid rgba(255,255,255,0.22);
        border-radius: 4px;
        color: rgba(255,255,255,0.7);
        width: 18px;
        height: 22px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        padding: 0;
        transition: background 0.12s, color 0.12s;
        flex-shrink: 0;
    }

    .tpr-pin-btn:hover {
        background: rgba(255,255,255,0.28);
        color: #fff;
    }

    .tpr-pin-btn--active {
        background: rgba(255,255,255,0.28);
        color: #fff;
        border-color: rgba(255,255,255,0.5);
    }

    /* ── Tools Rail Panel body ────────────────────────────────── */
    .tpr-body {
        flex: 1;
        overflow-y: auto;
        overflow-x: hidden;
        scrollbar-width: thin;
        scrollbar-color: #c4cde0 transparent;
        padding: 6px 0 7px 0;
        display: flex;
        flex-direction: column;
    }

    .tpr-body::-webkit-scrollbar       { width: 4px; }
    .tpr-body::-webkit-scrollbar-track { background: transparent; }
    .tpr-body::-webkit-scrollbar-thumb { background: #c4cde0; border-radius: 2px; }

    /* ── Section button active state (right rail) ─────────────── */
    .tp-section-btn--active {
        background: var(--app-violet-soft);
        color: var(--app-accent);
    }

    .tp-section-btn--active .tp-section-icon {
        background: rgba(102,0,255,0.10);
    }

    /* ── Annotation panel ─────────────────────────────────────── */
    .tpr-ann-root {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 5px 7px 7px;
    }

    .tpr-ann-empty {
        font-size: 9.9px;
        color: var(--app-text-muted, #888);
        text-align: center;
        padding: 16px 8px;
    }

    .tpr-ann-btn {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        padding: 6px 9px;
        background: var(--app-panel-bg, #fff);
        border: 1px solid var(--app-border, #dde3ef);
        border-radius: 7px;
        cursor: pointer;
        font-size: 10.8px;
        font-weight: 500;
        color: var(--app-text);
        font-family: var(--app-font);
        text-align: left;
        transition: background 0.12s, border-color 0.12s;
    }

    .tpr-ann-btn:hover {
        background: #f0f4ff;
        border-color: var(--app-accent, #6600ff);
        color: var(--app-accent, #6600ff);
    }

    .tpr-ann-btn-icon {
        font-size: 18px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
    }

    .tpr-ann-btn-label {
        flex: 1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    /* ── Grids & Levels rail (right tools rail) ───────────────── */
    .tpr-gl-root {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 6px 6px 8px;
    }
    .tpr-gl-group-label {
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--app-text-muted, #6b7280);
        padding: 8px 4px 4px;
    }
    .tpr-gl-root .tpr-ann-btn--disabled {
        opacity: 0.45;
        cursor: not-allowed;
        pointer-events: auto;            /* keep tooltip on disabled state */
    }
    .tpr-gl-root .tpr-ann-btn--disabled:hover {
        background: var(--app-panel-bg, #fff);
        border-color: var(--app-border, #dde3ef);
    }
    .tpr-gl-hint {
        margin-top: 8px;
        padding: 6px 8px;
        border-radius: 6px;
        font-size: 10.5px;
        line-height: 1.4;
        color: var(--app-text-muted, #6b7280);
        background: rgba(124, 58, 237, 0.06);
        border: 1px solid rgba(124, 58, 237, 0.18);
    }
    .tpr-gl-hint[data-state="ok"] {
        background: rgba(16, 185, 129, 0.08);
        border-color: rgba(16, 185, 129, 0.25);
        color: #065f46;
    }

    /* ── Create panel root wrapper ────────────────────────────── */
    /* A.U.19 — scroll long catalogues. The accordion can exceed the
     * panel height (5 disciplines x N tools each, especially with the
     * apartment / house / office typology contributions per A.U.3 +
     * A.6). The min-height:0 below lets the flex child shrink, and
     * overflow-y:auto puts the overflow on a scrollbar instead of
     * clipping items below the fold. scrollbar-gutter:stable keeps
     * the layout width steady whether or not the bar appears. */
    .tpr-create-root {
        display: flex;
        flex-direction: column;
        flex: 1 1 auto;
        min-height: 0;
        padding: 0 0 6px;
        overflow-y: auto;
        overflow-x: hidden;
        scrollbar-gutter: stable;
    }

    /* ── Visual panel ────────────────────────────────────────── */
    .tpr-vis-root {
        display: flex;
        flex-direction: column;
        padding: 7px 7px 11px;
        gap: 4px;
    }

    .tpr-vis-action-btn {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        padding: 6px 9px;
        background: var(--app-panel-bg, #fff);
        border: 1px solid var(--app-border, #dde3ef);
        border-radius: 7px;
        cursor: pointer;
        font-size: 10.8px;
        font-weight: 500;
        color: var(--app-text);
        font-family: var(--app-font);
        text-align: left;
        transition: background 0.12s, border-color 0.12s, color 0.12s;
    }

    .tpr-vis-action-btn:hover {
        background: #f0f4ff;
        border-color: var(--app-accent, #6600ff);
        color: var(--app-accent, #6600ff);
    }

    .tpr-vis-action-icon {
        font-size: 18px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
    }

    .tpr-vis-divider {
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--app-text-muted, #888);
        padding: 8px 2px 4px;
    }

    /* Segmented button group — Draft / Realistic / Textures */
    .tpr-vis-segment {
        display: flex;
        border-radius: 7px;
        overflow: hidden;
        border: 1px solid var(--app-border, #dde3ef);
    }

    .tpr-vis-seg-btn {
        flex: 1;
        padding: 5px 4px;
        background: var(--app-panel-bg, #fff);
        border: none;
        border-right: 1px solid var(--app-border, #dde3ef);
        cursor: pointer;
        font-size: 9.9px;
        font-weight: 500;
        color: var(--app-text);
        font-family: var(--app-font);
        transition: background 0.12s, color 0.12s;
    }

    .tpr-vis-seg-btn:last-child {
        border-right: none;
    }

    .tpr-vis-seg-btn:hover {
        background: #f0f4ff;
        color: var(--app-accent, #6600ff);
    }

    .tpr-vis-seg-btn--active {
        background: var(--app-accent, #6600ff);
        color: #fff;
        font-weight: 700;
    }

    .tpr-vis-seg-btn--active:hover {
        background: #5500dd;
        color: #fff;
    }

    /* Checkbox rows */
    .tpr-vis-check-row {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 5px 4px;
        cursor: pointer;
        border-radius: 5px;
        transition: background 0.1s;
    }

    .tpr-vis-check-row:hover {
        background: #f0f4ff;
    }

    .tpr-vis-check-input {
        width: 14px;
        height: 14px;
        accent-color: var(--app-accent, #6600ff);
        cursor: pointer;
        flex-shrink: 0;
    }

    .tpr-vis-check-label {
        font-size: 12px;
        font-weight: 500;
        color: var(--app-text);
        user-select: none;
    }

    /* Render mode select */
    .tpr-vis-select-wrap {
        position: relative;
    }

    .tpr-vis-select {
        width: 100%;
        padding: 6px 28px 6px 10px;
        background: var(--app-panel-bg, #fff);
        border: 1px solid var(--app-border, #dde3ef);
        border-radius: 7px;
        font-size: 12px;
        font-weight: 500;
        color: var(--app-text);
        font-family: var(--app-font);
        cursor: pointer;
        appearance: auto;
        transition: border-color 0.12s;
    }

    .tpr-vis-select:hover,
    .tpr-vis-select:focus {
        border-color: var(--app-accent, #6600ff);
        outline: none;
    }

    /* ── Navigate panel ──────────────────────────────────────── */
    .tpr-nav-root {
        display: flex;
        flex-direction: column;
        padding: 8px 8px 12px;
        gap: 6px;
    }

    .tpr-nav-intro {
        font-size: 11px;
        color: var(--app-text-muted, #888);
        line-height: 1.4;
        margin: 0 0 4px;
        padding: 0 2px;
    }

    /* Walk Mode toggle */
    .tpr-nav-walk-btn {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        padding: 9px 12px;
        background: var(--app-panel-bg, #fff);
        border: 1px solid var(--app-border, #dde3ef);
        border-radius: 8px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 600;
        color: var(--app-text);
        font-family: var(--app-font);
        text-align: left;
        transition: background 0.15s, border-color 0.15s, color 0.15s;
        position: relative;
    }

    .tpr-nav-walk-btn:hover {
        background: #f0f4ff;
        border-color: var(--app-accent, #6600ff);
        color: var(--app-accent, #6600ff);
    }

    .tpr-nav-walk-btn--active {
        background: var(--app-accent, #6600ff);
        border-color: var(--app-accent, #6600ff);
        color: #fff;
    }

    .tpr-nav-walk-btn--active:hover {
        background: #5500dd;
        border-color: #5500dd;
        color: #fff;
    }

    .tpr-nav-walk-icon {
        font-size: 16px;
        flex-shrink: 0;
    }

    .tpr-nav-walk-label {
        flex: 1;
    }

    .tpr-nav-walk-badge {
        font-size: 9px;
        font-weight: 800;
        letter-spacing: 0.06em;
        background: rgba(255,255,255,0.25);
        color: #fff;
        padding: 2px 6px;
        border-radius: 4px;
        border: 1px solid rgba(255,255,255,0.35);
    }

    /* WASD hint card */
    .tpr-nav-hint-card {
        background: #f7f8fd;
        border: 1px solid var(--app-border, #dde3ef);
        border-radius: 8px;
        padding: 8px 10px 10px;
        margin-top: 2px;
    }

    .tpr-nav-hint-title {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--app-text-muted, #888);
        margin-bottom: 6px;
    }

    .tpr-nav-hint-row {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 3px 0;
    }

    .tpr-nav-hint-key {
        display: inline-block;
        min-width: 48px;
        text-align: center;
        padding: 2px 5px;
        background: #fff;
        border: 1px solid #c5cde8;
        border-bottom-width: 2px;
        border-radius: 4px;
        font-family: var(--app-mono, monospace);
        font-size: 10px;
        font-weight: 700;
        color: #444;
        white-space: nowrap;
        box-shadow: 0 1px 0 #c5cde8;
    }

    .tpr-nav-hint-label {
        font-size: 11px;
        color: var(--app-text-muted, #666);
    }

    /* ── Render panel ────────────────────────────────────────── */
    .tpr-rnd-root {
        display: flex;
        flex-direction: column;
        padding: 4px 0 8px;
    }

    /* Collapsible sub-section */
    .tpr-rnd-sub {
        border-bottom: 1px solid var(--app-border, #dde3ef);
    }

    .tpr-rnd-sub:last-child {
        border-bottom: none;
    }

    .tpr-rnd-sub-hdr {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 7px 12px;
        cursor: pointer;
        user-select: none;
        transition: background 0.1s;
    }

    .tpr-rnd-sub-hdr:hover {
        background: #f4f5fb;
    }

    .tpr-rnd-sub-title {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--app-text-muted, #888);
    }

    .tpr-rnd-sub-chev {
        font-size: 11px;
        color: #888;
        transition: color 0.12s;
    }

    .tpr-rnd-sub-body {
        display: none;
        flex-direction: column;
        gap: 4px;
        padding: 4px 10px 10px;
    }

    /* Sub-label (Edges Detection / Outline Style / etc.) */
    .tpr-rnd-sub-label {
        font-size: 10px;
        font-weight: 600;
        color: #888;
        padding: 6px 0 2px;
    }

    /* Checkbox rows */
    .tpr-rnd-check-row {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 4px 2px;
        cursor: pointer;
        border-radius: 5px;
        transition: background 0.1s;
    }

    .tpr-rnd-check-row:hover {
        background: #f0f4ff;
    }

    .tpr-rnd-check-input {
        width: 14px;
        height: 14px;
        accent-color: var(--app-accent, #6600ff);
        cursor: pointer;
        flex-shrink: 0;
    }

    .tpr-rnd-check-label {
        font-size: 12px;
        font-weight: 500;
        color: var(--app-text);
        user-select: none;
    }

    /* Select dropdown */
    .tpr-rnd-select-wrap {
        width: 100%;
    }

    .tpr-rnd-select {
        width: 100%;
        padding: 5px 8px;
        background: var(--app-panel-bg, #fff);
        border: 1px solid var(--app-border, #dde3ef);
        border-radius: 6px;
        font-size: 11px;
        font-weight: 500;
        color: var(--app-text);
        font-family: var(--app-font);
        cursor: pointer;
        appearance: auto;
    }

    .tpr-rnd-select:hover,
    .tpr-rnd-select:focus {
        border-color: var(--app-accent, #6600ff);
        outline: none;
    }

    /* Slider rows */
    .tpr-rnd-slider-row {
        display: flex;
        flex-direction: column;
        gap: 3px;
        padding: 2px 0 4px;
    }

    .tpr-rnd-slider-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
    }

    .tpr-rnd-slider-label {
        font-size: 11px;
        font-weight: 500;
        color: var(--app-text);
    }

    .tpr-rnd-slider-val {
        font-size: 10px;
        font-weight: 700;
        color: var(--app-accent, #6600ff);
        font-family: var(--app-mono, monospace);
        min-width: 28px;
        text-align: right;
    }

    .tpr-rnd-slider-input {
        width: 100%;
        accent-color: var(--app-accent, #6600ff);
        cursor: pointer;
        height: 4px;
    }

    /* SSGI / TRAA toggle rows (iOS-style toggle switch feel) */
    .tpr-rnd-toggle-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 5px 2px;
        border-radius: 5px;
        cursor: pointer;
        transition: background 0.1s;
    }

    .tpr-rnd-toggle-row:hover {
        background: #f0f4ff;
    }

    .tpr-rnd-toggle-label {
        font-size: 12px;
        font-weight: 600;
        color: var(--app-text);
        user-select: none;
    }

    .tpr-rnd-toggle {
        width: 16px;
        height: 16px;
        accent-color: var(--app-accent, #6600ff);
        cursor: pointer;
    }

    /* Pipeline status badge strip */
    .tpr-rnd-badge-strip {
        display: flex;
        gap: 5px;
        flex-wrap: wrap;
        padding: 4px 0 6px;
    }

    .tpr-rnd-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 7px;
        font-size: 10px;
        font-weight: 700;
        border-radius: 20px;
        background: #f0f0f0;
        color: #888;
        border: 1px solid #ddd;
        white-space: nowrap;
    }

    .tpr-rnd-badge-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #ccc;
        display: inline-block;
        flex-shrink: 0;
    }

    /* Shortcut buttons (Path Trace, Still Image, Scene Setup, Export Studio, Render Queue) */
    .tpr-rnd-shortcut-btn {
        display: block;
        width: 100%;
        padding: 7px 10px;
        background: var(--app-panel-bg, #fff);
        border: 1px solid var(--app-border, #dde3ef);
        border-radius: 7px;
        cursor: pointer;
        font-size: 11px;
        font-weight: 600;
        color: var(--app-text);
        font-family: var(--app-font);
        text-align: left;
        transition: background 0.12s, border-color 0.12s, color 0.12s;
    }

    .tpr-rnd-shortcut-btn:hover {
        background: #f0f4ff;
        border-color: var(--app-accent, #6600ff);
        color: var(--app-accent, #6600ff);
    }

    /* ── GIS panel ───────────────────────────────────────────── */
    .tpr-gis-root {
        display: flex;
        flex-direction: column;
        padding: 8px 8px 12px;
        gap: 5px;
    }

    /* Activate Geospatial row — prominent checkbox card */
    .tpr-gis-activate-row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 10px;
        background: #f4f5fb;
        border: 1px solid var(--app-border, #dde3ef);
        border-radius: 8px;
        cursor: pointer;
        transition: background 0.12s, border-color 0.12s;
    }

    .tpr-gis-activate-row:hover {
        background: #eaeeff;
        border-color: var(--app-accent, #6600ff);
    }

    .tpr-gis-activate-check {
        width: 15px;
        height: 15px;
        accent-color: var(--app-accent, #6600ff);
        cursor: pointer;
        flex-shrink: 0;
    }

    .tpr-gis-activate-text {
        display: flex;
        flex-direction: column;
        gap: 1px;
    }

    .tpr-gis-activate-label {
        font-size: 12px;
        font-weight: 600;
        color: var(--app-text);
        user-select: none;
    }

    .tpr-gis-activate-desc {
        font-size: 10px;
        color: var(--app-text-muted, #888);
        user-select: none;
    }

    /* Thin divider */
    .tpr-gis-divider {
        height: 1px;
        background: var(--app-border, #dde3ef);
        margin: 2px 0;
    }

    /* Action buttons (Fly To, Place BIM on Earth) */
    .tpr-gis-action-btn {
        display: flex;
        align-items: center;
        gap: 9px;
        width: 100%;
        padding: 8px 10px;
        background: var(--app-panel-bg, #fff);
        border: 1px solid var(--app-border, #dde3ef);
        border-radius: 7px;
        cursor: pointer;
        font-family: var(--app-font);
        text-align: left;
        transition: background 0.12s, border-color 0.12s, color 0.12s;
    }

    .tpr-gis-action-btn:hover {
        background: #f0f4ff;
        border-color: var(--app-accent, #6600ff);
        color: var(--app-accent, #6600ff);
    }

    .tpr-gis-action-icon {
        font-size: 15px;
        flex-shrink: 0;
        width: 20px;
        text-align: center;
    }

    .tpr-gis-action-label {
        font-size: 12px;
        font-weight: 500;
        color: inherit;
    }

    /* Gizmo Controls sub-section */
    .tpr-gis-gizmo-section {
        border: 1px solid var(--app-border, #dde3ef);
        border-radius: 8px;
        overflow: hidden;
        margin-top: 2px;
    }

    .tpr-gis-gizmo-header {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--app-text-muted, #888);
        padding: 6px 10px 5px;
        background: #f7f8fd;
        border-bottom: 1px solid var(--app-border, #dde3ef);
    }

    .tpr-gis-gizmo-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0;
    }

    .tpr-gis-gizmo-btn {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 3px;
        padding: 8px 4px;
        background: var(--app-panel-bg, #fff);
        border: none;
        border-right: 1px solid var(--app-border, #dde3ef);
        cursor: pointer;
        font-family: var(--app-font);
        transition: background 0.12s, color 0.12s;
    }

    .tpr-gis-gizmo-btn:last-child {
        border-right: none;
    }

    .tpr-gis-gizmo-btn:hover {
        background: #f0f4ff;
        color: var(--app-accent, #6600ff);
    }

    .tpr-gis-gizmo-btn--active {
        background: var(--app-accent, #6600ff);
        color: #fff;
    }

    .tpr-gis-gizmo-btn--active:hover {
        background: #5500dd;
        color: #fff;
    }

    .tpr-gis-gizmo-icon {
        font-size: 18px;
        line-height: 1;
    }

    .tpr-gis-gizmo-label {
        font-size: 10px;
        font-weight: 600;
    }

    /* Reset Georeference — muted danger-adjacent style */
    .tpr-gis-reset-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        padding: 7px 10px;
        background: #fff5f5;
        border: 1px solid #ffc8c8;
        border-radius: 7px;
        cursor: pointer;
        font-size: 11px;
        font-weight: 600;
        color: #c0392b;
        font-family: var(--app-font);
        transition: background 0.12s, border-color 0.12s;
        margin-top: 2px;
    }

    .tpr-gis-reset-btn:hover {
        background: #ffe0e0;
        border-color: #e74c3c;
    }

    /* ── Edit panel ───────────────────────────────────────────── */
    .tpr-edit-root {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 8px 8px 10px;
    }

    .tpr-edit-group {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .tpr-edit-group-label {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--app-text-muted, #888);
        padding: 0 2px 4px;
    }

    .tpr-edit-btn {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        padding: 7px 10px;
        border: 1px solid var(--app-border, #dde3ef);
        border-radius: 7px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 500;
        font-family: var(--app-font);
        text-align: left;
        transition: background 0.12s, border-color 0.12s, color 0.12s;
    }

    .tpr-edit-btn--default {
        background: var(--app-panel-bg, #fff);
        color: var(--app-text);
    }

    .tpr-edit-btn--default:hover {
        background: #f0f4ff;
        border-color: var(--app-accent, #6600ff);
        color: var(--app-accent, #6600ff);
    }

    .tpr-edit-btn--danger {
        background: #fff5f5;
        border-color: #f8d7da;
        color: #c0392b;
    }

    .tpr-edit-btn--danger:hover {
        background: #dc3545;
        border-color: #dc3545;
        color: #fff;
    }

    .tpr-edit-btn--primary {
        background: var(--app-gradient, linear-gradient(135deg, #8B5CF6 0%, #6600FF 100%));
        border-color: transparent;
        color: #ffffff;
    }

    .tpr-edit-btn--primary:hover {
        opacity: 0.88;
        box-shadow: var(--app-shadow-glow, 0 4px 16px rgba(102,0,255,0.40));
    }

    .tpr-edit-btn--success {
        background: #f0fff4;
        border-color: #c3e6cb;
        color: #1e7e34;
    }

    .tpr-edit-btn--success:hover {
        background: #28a745;
        border-color: #28a745;
        color: #fff;
    }

    .tpr-edit-btn-icon {
        font-size: 18px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
    }

    .tpr-edit-btn-label {
        flex: 1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
`;

export const LEVELS_GRIDS_RAIL_STYLES = `
    .lg-rail-root {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin: 8px;
        padding: 8px;
        background: var(--app-panel-bg);
        border: 1px solid var(--app-border-light);
        border-radius: var(--app-radius-lg);
        box-shadow: var(--app-shadow-card);
        overflow: hidden;
    }

    .lg-rail-group-label {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.07em;
        text-transform: uppercase;
        color: var(--app-text);
        padding: 8px 10px;
        background: #f7f9ff;
        border: 1px solid rgba(102,0,255,0.07);
        border-radius: 12px;
        margin: 0 0 2px 0;
        user-select: none;
    }

    .lg-rail-root .lm-panel,
    .lg-rail-root .gm-panel {
        background: #ffffff;
        border-radius: 12px;
        overflow: hidden;
    }

    .lg-rail-vis-section {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 0 2px 2px;
    }

    .lg-rail-vis-row {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 8px;
        border-radius: 10px;
        background: #ffffff;
        border: 1px solid var(--app-border-light);
        font-size: 11px;
        color: var(--app-text);
        cursor: pointer;
        user-select: none;
    }

    .lg-rail-vis-row:hover {
        background: rgba(102,0,255,0.04);
        border-color: rgba(102,0,255,0.18);
    }

    .lg-rail-vis-row input {
        accent-color: var(--app-accent,#6600ff);
    }
`;

export const RAIL_PANEL_STYLES = `
    /* ── Rail Panel container ─────────────────────────────────── */
    .rp-panel {
        position: fixed;
        width: 280px;
        background: var(--app-bg);
        border-radius: 0 var(--app-radius-lg) var(--app-radius-lg) 0;
        box-shadow: var(--app-shadow-panel);
        display: flex;
        flex-direction: column;
        z-index: 15;
        overflow: hidden;
        pointer-events: auto;
        font-family: var(--app-font);
        color: var(--app-text);
    }

    .rp-panel--animating {
        animation: rp-slide-in 0.18s ease;
    }

    @keyframes rp-slide-in {
        from { opacity: 0; transform: translateX(-10px); }
        to   { opacity: 1; transform: translateX(0); }
    }

    /* ── Rail Panel header ────────────────────────────────────── */
    .rp-header {
        background: var(--app-gradient);
        padding: 0 12px;
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-shrink: 0;
        height: 40px;
        box-sizing: border-box;
        user-select: none;
        box-shadow: var(--app-shadow-header);
        border-radius: 0 var(--app-radius-lg) 0 0;
    }

    .rp-header-title {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.07em;
        text-transform: uppercase;
    }

    .rp-header-actions {
        display: flex;
        align-items: center;
        gap: 4px;
    }

    .rp-close-btn {
        background: rgba(255,255,255,0.18);
        border: 1px solid rgba(255,255,255,0.28);
        border-radius: 4px;
        color: #fff;
        width: 22px;
        height: 22px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 16px;
        line-height: 1;
        font-family: var(--app-font);
        padding: 0;
        transition: background 0.12s;
        flex-shrink: 0;
    }

    .rp-close-btn:hover {
        background: rgba(255,255,255,0.35);
    }

    .rp-pin-btn {
        background: rgba(255,255,255,0.12);
        border: 1px solid rgba(255,255,255,0.22);
        border-radius: 4px;
        color: rgba(255,255,255,0.7);
        width: 22px;
        height: 22px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        padding: 0;
        transition: background 0.12s, color 0.12s;
        flex-shrink: 0;
    }

    .rp-pin-btn:hover {
        background: rgba(255,255,255,0.28);
        color: #fff;
    }

    .rp-pin-btn--active {
        background: rgba(255,255,255,0.28);
        color: #fff;
        border-color: rgba(255,255,255,0.5);
    }

    /* ── Rail Panel body ──────────────────────────────────────── */
    .rp-body {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        overflow-x: hidden;
        scrollbar-width: thin;
        scrollbar-color: #c4cde0 transparent;
        padding: 8px 0 4px 0;
    }

    .rp-body::-webkit-scrollbar       { width: 4px; }
    .rp-body::-webkit-scrollbar-track { background: transparent; }
    .rp-body::-webkit-scrollbar-thumb { background: #c4cde0; border-radius: 2px; }

    /* ── Active section button in vb-panel ────────────────────── */
    .pb-section-header--active {
        background: var(--app-violet-soft);
        border-left: 2px solid var(--app-violet-3);
    }

    .pb-section-header--active .pb-section-icon img,
    .pb-section-header--active .pb-section-icon svg {
        opacity: 1;
        filter: none;
    }

    /* ── Resize handle — right edge of rp-panel ───────────────── */
    .rp-resize-handle {
        position: absolute;
        top: 0;
        right: 0;
        width: 5px;
        height: 100%;
        cursor: col-resize;
        z-index: 20;
        background: transparent;
        transition: background 0.15s;
        border-radius: 0 var(--app-radius-lg) var(--app-radius-lg) 0;
    }
    .rp-resize-handle:hover,
    .rp-resize-handle:active {
        background: rgba(102, 0, 255, 0.15);
    }

    /* ── Resize bar — bottom edge of rp-panel (slide up/down) ─── */
    .rp-resize-handle-bottom {
        /* Normal flex child — gives 8px to itself, body shrinks accordingly */
        flex-shrink: 0;
        width: 100%;
        height: 8px;
        cursor: row-resize;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--app-panel-bg, #f8faff);
        border-top: 1px solid var(--app-border, #dde3f0);
        border-radius: 0 0 var(--app-radius-lg) 0;
        transition: background 0.15s;
    }
    .rp-resize-handle-bottom::before {
        content: '';
        display: block;
        width: 32px;
        height: 3px;
        border-radius: 2px;
        background: var(--app-border, #c4cde0);
        transition: background 0.15s;
    }
    .rp-resize-handle-bottom:hover,
    .rp-resize-handle-bottom:active {
        background: rgba(102, 0, 255, 0.06);
    }
    .rp-resize-handle-bottom:hover::before,
    .rp-resize-handle-bottom:active::before {
        background: var(--app-accent, #6600FF);
    }
`;

