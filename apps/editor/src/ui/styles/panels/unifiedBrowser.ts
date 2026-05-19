/**
 * @file src/styles/panels/unifiedBrowser.ts
 *
 * CSS for the Unified Browser panel (ub- prefix).
 * CONTRACT §05 §2 — CSS layer only, zero logic.
 */
export const UNIFIED_BROWSER_STYLES = `

    /* ── Shell: fills rp-body (which becomes a flex column in noHeader mode) */
    .pb-ubp-shell {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
        background: #e8edf6;
        overflow: hidden;
        border-radius: 12px;
    }

    /* ── Gradient header ──────────────────────────────────────── */
    .pb-ubp-header {
        background: linear-gradient(135deg, #8B5CF6 0%, #6600FF 100%);
        padding: 10px 12px 9px;
        box-shadow: 0 2px 12px rgba(102,0,255,0.30);
        flex-shrink: 0;
        border-radius: 12px 12px 0 0;
    }

    .pb-ubp-header-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 0;
        gap: 10px;
    }

    .pb-ubp-header-title {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #ffffff;
        font-family: var(--app-font);
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .pb-ubp-header-spacer {
        height: 4px;
        flex-shrink: 0;
    }

    .pb-ubp-header-btn {
        border: none;
        background: rgba(255,255,255,0.15);
        color: #fff;
        border-radius: 6px;
        width: 22px;
        height: 22px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        transition: background 0.12s;
    }

    .pb-ubp-header-btn:hover {
        background: rgba(255,255,255,0.28);
    }

    .pb-ubp-header-actions {
        display: flex;
        align-items: center;
        gap: 4px;
        flex-shrink: 0;
    }

    .pb-ubp-header-btn--active {
        background: rgba(255,255,255,0.32);
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.36);
    }

    .pb-ubp-header-btn--close {
        font-size: 17px;
        line-height: 1;
        font-weight: 400;
        padding-bottom: 2px;
    }

    .pb-ubp-breadcrumb {
        font-size: 10px;
        color: rgba(255,255,255,0.6);
        display: flex;
        align-items: center;
        gap: 4px;
        font-family: var(--app-font);
        flex-wrap: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .pb-ubp-breadcrumb b {
        color: rgba(255,255,255,0.90);
        font-weight: 500;
    }

    .pb-ubp-bc-sep {
        opacity: 0.4;
        flex-shrink: 0;
    }

    /* ── Search bar ───────────────────────────────────────────── */
    .pb-ubp-search {
        display: flex;
        align-items: center;
        gap: 6px;
        background: rgba(255,255,255,0.12);
        border-radius: 7px;
        padding: 4px 8px;
        transition: background 0.12s;
    }

    .pb-ubp-search:focus-within {
        background: rgba(255,255,255,0.22);
    }

    .pb-ubp-search-icon {
        flex-shrink: 0;
    }

    .pb-ubp-search-input {
        flex: 1;
        border: none;
        background: transparent;
        font-size: 10.5px;
        color: #ffffff;
        font-family: var(--app-font);
        outline: none;
        min-width: 0;
    }

    .pb-ubp-search-input::placeholder {
        color: rgba(255,255,255,0.45);
    }

    /* ── Reset visibility row ─────────────────────────────────── */
    .pb-ubp-reset-row {
        margin-top: 7px;
    }

    .pb-ubp-reset-btn {
        display: flex;
        align-items: center;
        gap: 5px;
        width: 100%;
        border: 1px solid rgba(255,255,255,0.10);
        background: rgba(255,255,255,0.06);
        color: rgba(255,255,255,0.28);
        border-radius: 6px;
        padding: 4px 8px;
        font-size: 10px;
        font-weight: 500;
        font-family: var(--app-font);
        letter-spacing: 0.04em;
        cursor: default;
        pointer-events: none;
        transition: background 0.14s, color 0.14s, border-color 0.14s;
        box-sizing: border-box;
        white-space: nowrap;
    }

    .pb-ubp-reset-btn--active {
        color: rgba(255,255,255,0.85);
        background: rgba(255,255,255,0.12);
        border-color: rgba(255,255,255,0.22);
        cursor: pointer;
        pointer-events: auto;
    }

    .pb-ubp-reset-btn--active:hover {
        background: rgba(255,210,60,0.22);
        border-color: rgba(255,210,60,0.40);
        color: #ffe87a;
    }

    /* ── Scrollable card area ─────────────────────────────────── */
    .pb-ubp-body {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        overflow-x: hidden;
        padding: 6px 5px 12px 6px;
        display: flex;
        flex-direction: column;
        gap: 5px;
        scrollbar-width: thin;
        scrollbar-color: #9ba8c4 #dde3f0;
        overscroll-behavior: contain;
    }

    .pb-ubp-body::-webkit-scrollbar {
        width: 6px;
    }

    .pb-ubp-body::-webkit-scrollbar-track {
        background: #dde3f0;
        border-radius: 10px;
        margin: 6px 0;
    }

    .pb-ubp-body::-webkit-scrollbar-thumb {
        background: #9ba8c4;
        border-radius: 10px;
        border: 1px solid #dde3f0;
    }

    .pb-ubp-body::-webkit-scrollbar-thumb:hover {
        background: #7a8ab0;
    }

    /* ── Card ─────────────────────────────────────────────────── */
    .pb-ubp-card {
        background: #ffffff;
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 2px 10px rgba(30,50,120,0.07), 0 1px 3px rgba(30,50,120,0.04);
        flex: 0 0 auto;
    }

    /* ── Card header ──────────────────────────────────────────── */
    .pb-ubp-card-hdr {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 9px 12px 8px;
        cursor: pointer;
        user-select: none;
        background: #ffffff;
        border: none;
        width: 100%;
        font-family: var(--app-font);
        transition: background 0.10s;
        outline: none;
    }

    .pb-ubp-card-hdr:hover {
        background: #fafbff;
    }

    .pb-ubp-card-hdr:focus-visible {
        box-shadow: inset 0 0 0 2px var(--app-accent);
        border-radius: 12px 12px 0 0;
    }

    .pb-ubp-card-title {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.09em;
        text-transform: uppercase;
        color: #5a6a85;
        display: flex;
        align-items: center;
        gap: 6px;
        font-family: var(--app-font);
    }

    .pb-ubp-card-right {
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .pb-ubp-card-count {
        font-size: 10px;
        color: #7a8aaa;
        background: #f4f7fc;
        padding: 1px 7px;
        border-radius: 10px;
        font-family: var(--app-font);
    }

    /* ── Dot indicators ───────────────────────────────────────── */
    .pb-ubp-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        flex-shrink: 0;
    }

    .pb-ubp-dot--purple { background: #8B5CF6; }
    .pb-ubp-dot--blue   { background: #378ADD; }
    .pb-ubp-dot--teal   { background: #1D9E75; }
    .pb-ubp-dot--amber  { background: #BA7517; }

    /* ── Chevron — "›" rotates 90° when open ─────────────────── */
    .pb-ubp-chevron {
        font-size: 13px;
        color: #c4cde0;
        line-height: 1;
        display: flex;
        align-items: center;
        transition: transform 0.18s ease;
        font-family: var(--app-font);
    }

    .pb-ubp-chevron--open {
        transform: rotate(90deg);
    }

    /* ── Card body ────────────────────────────────────────────── */
    .pb-ubp-card-body {
        border-top: 1px solid #eef1f8;
        overflow: hidden;
    }

    /* ── Row ──────────────────────────────────────────────────── */
    .pb-ubp-row {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 7px 12px;
        cursor: pointer;
        border-left: 3px solid transparent;
        transition: background 0.10s;
        outline: none;
        text-decoration: none;
        background: transparent;
        border-top: none;
        border-right: none;
        border-bottom: none;
        width: 100%;
        font-family: var(--app-font);
    }

    .pb-ubp-row:hover {
        background: #fafbff;
    }

    .pb-ubp-row:focus-visible {
        background: #fafbff;
        border-left-color: rgba(102,0,255,0.3);
    }

    .pb-ubp-row.pb-ubp-row--sel {
        border-left-color: #6600FF;
        background: rgba(102,0,255,0.04);
    }

    .pb-ubp-row--sel .pb-ubp-rname {
        color: #6600FF;
        font-weight: 500;
    }

    /* ── Row name / meta / tag ────────────────────────────────── */
    .pb-ubp-rname {
        font-size: 12px;
        color: #1a2035;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        font-family: var(--app-font);
    }

    .pb-ubp-rmeta {
        font-size: 10px;
        color: #7a8aaa;
        font-family: var(--app-font);
    }

    .pb-ubp-rtag {
        font-size: 9px;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: #b0bcd0;
        margin-left: auto;
        flex-shrink: 0;
        font-family: var(--app-font);
    }

    .pb-ubp-row--sel .pb-ubp-rtag {
        color: #8B5CF6;
    }

    /* ── Row indicator dot ────────────────────────────────────── */
    .pb-ubp-rind {
        width: 5px;
        height: 5px;
        border-radius: 50%;
        background: #8B5CF6;
        opacity: 0;
        transition: opacity 0.15s;
        flex-shrink: 0;
    }

    .pb-ubp-rind--on {
        opacity: 1;
    }

    /* ── Separator ────────────────────────────────────────────── */
    .pb-ubp-sep {
        height: 1px;
        background: #eef1f8;
        margin: 0 12px;
    }

    /* ── Empty state ──────────────────────────────────────────── */
    .pb-ubp-empty {
        padding: 12px 16px;
        font-size: 11px;
        color: #b0bcd0;
        text-align: center;
        font-family: var(--app-font);
    }

    /* ── Add-element row ──────────────────────────────────────── */
    .pb-ubp-add-row {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        cursor: pointer;
        font-size: 11px;
        color: #c4cde0;
        border-top: 1px solid #f4f7fc;
        font-family: var(--app-font);
        transition: color 0.12s;
    }

    .pb-ubp-add-row:hover {
        color: #8B5CF6;
    }

    /* ── Nested sub-panel content (Views / Sheets / Schedules) ── */
    .pb-ubp-card-body .vb-panel-body,
    .pb-ubp-card-body .rp-body {
        padding: 0;
    }

    /* rp-panel border-radius fix when embedded inside BROWSER panel */
    .pb-ubp-card-body .rp-panel.pb-ubp-noheader > .rp-header {
        display: none;
    }

    /* ══ Spatial Tree (pb-ubp-st-) — PROJECT card full hierarchy ══ */

    .pb-ubp-st-tree {
        display: flex;
        flex-direction: column;
        gap: 0;
    }

    /* Site row — IFC parent of Building */
    .pb-ubp-st-site {
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 7px 10px 7px 10px;
        font-size: 11.5px;
        font-weight: 700;
        color: var(--app-text);
        font-family: var(--app-font);
        letter-spacing: 0.02em;
        border-bottom: 1px solid var(--app-border-light);
        cursor: default;
    }

    .pb-ubp-st-site-icon {
        color: #3b7fcc;
        flex-shrink: 0;
    }

    /* Building row — child of Site, indented */
    .pb-ubp-st-building {
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 6px 8px 6px 20px;
        font-size: 11px;
        font-weight: 600;
        color: var(--app-text);
        font-family: var(--app-font);
        border-bottom: 1px solid var(--app-border-light);
        cursor: pointer;
        transition: background 0.12s;
        position: relative;
    }

    .pb-ubp-st-building::before {
        content: '';
        position: absolute;
        left: 12px;
        top: 0;
        bottom: 0;
        width: 1px;
        background: rgba(102,0,255,0.15);
    }

    .pb-ubp-st-building:hover {
        background: #f3efff;
    }

    .pb-ubp-st-building-icon {
        color: #6600FF;
        flex-shrink: 0;
    }

    .pb-ubp-st-building-spacer {
        flex: 1;
    }

    /* "Add level" button row */
    .pb-ubp-st-addlvl {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 5px 10px 5px 12px;
        font-size: 10.5px;
        color: var(--app-text-muted);
        font-family: var(--app-font);
        cursor: pointer;
        transition: color 0.12s, background 0.12s;
        border-radius: 0 0 8px 8px;
    }

    .pb-ubp-st-addlvl:hover {
        color: #8B5CF6;
        background: var(--app-violet-soft);
    }

    /* ── Level block ──────────────────────────────────────────── */

    .pb-ubp-st-level {
        display: flex;
        flex-direction: column;
        border-bottom: 1px solid var(--app-border-light);
    }

    .pb-ubp-st-level:last-child {
        border-bottom: none;
    }

    /* Level header row */
    .pb-ubp-st-level-hdr {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 7px 10px 7px 8px;
        cursor: pointer;
        transition: background 0.12s;
        position: relative;
        user-select: none;
    }

    .pb-ubp-st-level-hdr:hover {
        background: #f7f5ff;
    }

    /* Active level gets a vivid left accent bar */
    .pb-ubp-st-level--active > .pb-ubp-st-level-hdr {
        background: linear-gradient(90deg, rgba(102,0,255,0.07) 0%, transparent 100%);
    }

    .pb-ubp-st-level--active > .pb-ubp-st-level-hdr::before {
        content: '';
        position: absolute;
        left: 0;
        top: 4px;
        bottom: 4px;
        width: 3px;
        border-radius: 2px;
        background: #6600FF;
    }

    .pb-ubp-st-level-chevron {
        color: var(--app-text-muted);
        font-size: 10px;
        width: 12px;
        text-align: center;
        flex-shrink: 0;
        transition: transform 0.15s;
        line-height: 1;
    }

    .pb-ubp-st-level-chevron--open {
        transform: rotate(90deg);
    }

    .pb-ubp-st-level-icon {
        flex-shrink: 0;
    }

    .pb-ubp-st-level-name {
        flex: 1;
        font-size: 11.5px;
        font-weight: 600;
        color: var(--app-text);
        font-family: var(--app-font);
        min-width: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .pb-ubp-st-level--active > .pb-ubp-st-level-hdr .pb-ubp-st-level-name {
        color: #6600FF;
    }

    .pb-ubp-st-level-badge {
        font-size: 9.5px;
        font-weight: 600;
        color: #fff;
        background: #6600FF;
        border-radius: 10px;
        padding: 1px 6px;
        letter-spacing: 0.03em;
        flex-shrink: 0;
    }

    .pb-ubp-st-level-count {
        font-size: 9.5px;
        color: var(--app-text-muted);
        font-family: var(--app-font);
        flex-shrink: 0;
        transition: opacity 0.12s;
    }

    /* "Activate" pill — hidden by default, fades in on hover for inactive levels */
    .pb-ubp-st-level-activate {
        display: none;
        align-items: center;
        gap: 3px;
        font-size: 9px;
        font-weight: 600;
        letter-spacing: 0.04em;
        color: #6600FF;
        background: rgba(102,0,255,0.09);
        border: 1px solid rgba(102,0,255,0.22);
        border-radius: 10px;
        padding: 1px 7px 1px 5px;
        cursor: pointer;
        flex-shrink: 0;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.14s, background 0.12s;
        white-space: nowrap;
        line-height: 1.6;
    }

    .pb-ubp-st-level-hdr:hover .pb-ubp-st-level-activate {
        display: flex;
        opacity: 1;
        pointer-events: auto;
    }

    .pb-ubp-st-level-activate:hover {
        background: rgba(102,0,255,0.16);
    }

    .pb-ubp-st-level-hdr:hover .pb-ubp-st-level-count {
        opacity: 0;
        pointer-events: none;
    }

    /* ── Visibility toggle button (shared) ────────────────────── */

    .pb-ubp-st-vis {
        border: none;
        background: transparent;
        cursor: pointer;
        padding: 2px 3px;
        border-radius: 4px;
        color: var(--app-text-muted);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: color 0.12s, background 0.12s;
        flex-shrink: 0;
        opacity: 0;
        pointer-events: none;
    }

    .pb-ubp-st-level-hdr:hover .pb-ubp-st-vis,
    .pb-ubp-st-type-hdr:hover .pb-ubp-st-vis,
    .pb-ubp-st-elem-row:hover .pb-ubp-st-vis,
    .pb-ubp-st-child-row:hover .pb-ubp-st-vis,
    .pb-ubp-st-building:hover .pb-ubp-st-vis {
        opacity: 1;
        pointer-events: auto;
    }

    .pb-ubp-st-vis--always {
        opacity: 1;
        pointer-events: auto;
    }

    .pb-ubp-st-vis:hover {
        color: #6600FF;
        background: var(--app-violet-soft);
    }

    .pb-ubp-st-vis.pb-ubp-st-vis--off {
        opacity: 1;
        pointer-events: auto;
        color: #ccc;
    }

    .pb-ubp-st-vis.pb-ubp-st-vis--off:hover {
        color: #6600FF;
        background: var(--app-violet-soft);
    }

    /* ── Isolate toggle button ────────────────────────────────── */

    .pb-ubp-st-iso {
        border: none;
        background: transparent;
        cursor: pointer;
        padding: 2px 3px;
        border-radius: 4px;
        color: var(--app-text-muted);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: color 0.12s, background 0.12s;
        flex-shrink: 0;
        opacity: 0;
        pointer-events: none;
    }

    .pb-ubp-st-level-hdr:hover .pb-ubp-st-iso,
    .pb-ubp-st-type-hdr:hover .pb-ubp-st-iso,
    .pb-ubp-st-elem-row:hover .pb-ubp-st-iso,
    .pb-ubp-st-child-row:hover .pb-ubp-st-iso,
    .pb-ubp-st-building:hover .pb-ubp-st-iso {
        opacity: 1;
        pointer-events: auto;
    }

    .pb-ubp-st-iso:hover {
        color: #f59e0b;
        background: rgba(245,158,11,0.10);
    }

    /* When isolation is active, keep button always visible and amber-coloured */
    .pb-ubp-st-iso--active {
        opacity: 1 !important;
        pointer-events: auto !important;
        color: #f59e0b !important;
        background: rgba(245,158,11,0.14) !important;
    }

    /* ── Button group for vis + iso (keeps them tightly paired) ── */
    .pb-ubp-st-btn-group {
        display: flex;
        align-items: center;
        gap: 0;
        flex-shrink: 0;
        margin-left: auto;
    }

    /* ── Level children container ─────────────────────────────── */

    .pb-ubp-st-level-children {
        display: flex;
        flex-direction: column;
        background: #f9f8ff;
        border-top: 1px solid var(--app-border-light);
    }

    /* ── Element-type group ───────────────────────────────────── */

    .pb-ubp-st-type {
        display: flex;
        flex-direction: column;
    }

    .pb-ubp-st-type-hdr {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 5px 10px 5px 20px;
        cursor: pointer;
        transition: background 0.12s;
        border-bottom: 1px solid var(--app-border-light);
        user-select: none;
    }

    .pb-ubp-st-type:last-child > .pb-ubp-st-type-hdr {
        border-bottom: none;
    }

    .pb-ubp-st-type-hdr:hover {
        background: #f3efff;
    }

    .pb-ubp-st-type-chevron {
        color: var(--app-text-muted);
        font-size: 9px;
        width: 10px;
        text-align: center;
        flex-shrink: 0;
        transition: transform 0.15s;
        line-height: 1;
    }

    .pb-ubp-st-type-chevron--open {
        transform: rotate(90deg);
    }

    .pb-ubp-st-type-icon {
        color: var(--app-text-muted);
        flex-shrink: 0;
    }

    .pb-ubp-st-type-name {
        flex: 1;
        font-size: 10.5px;
        font-weight: 600;
        color: var(--app-text-2);
        font-family: var(--app-font);
        text-transform: uppercase;
        letter-spacing: 0.06em;
        min-width: 0;
    }

    .pb-ubp-st-type-count {
        font-size: 9.5px;
        font-weight: 600;
        color: var(--app-text-muted);
        background: #ede8ff;
        padding: 1px 6px;
        border-radius: 8px;
        flex-shrink: 0;
    }

    .pb-ubp-st-type-body {
        display: flex;
        flex-direction: column;
    }

    /* ── Individual element row ───────────────────────────────── */

    .pb-ubp-st-elem-row {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px 4px 28px;
        cursor: pointer;
        transition: background 0.12s;
        border-bottom: 1px solid var(--app-border-light);
        user-select: none;
    }

    .pb-ubp-st-elem-row:last-child {
        border-bottom: none;
    }

    .pb-ubp-st-elem-row:hover {
        background: #ede8ff;
    }

    /* Selected element: vivid violet highlight */
    .pb-ubp-st-elem-row.pb-ubp-st-elem-row--sel {
        background: rgba(102,0,255,0.10);
    }

    .pb-ubp-st-elem-row.pb-ubp-st-elem-row--sel .pb-ubp-st-elem-name {
        color: #5500cc;
        font-weight: 600;
    }

    .pb-ubp-st-elem-row.pb-ubp-st-elem-row--sel .pb-ubp-st-elem-icon {
        color: #6600FF;
    }

    .pb-ubp-st-elem-icon {
        color: var(--app-text-muted);
        flex-shrink: 0;
        transition: color 0.12s;
    }

    .pb-ubp-st-elem-name {
        flex: 1;
        font-size: 11px;
        color: var(--app-text);
        font-family: var(--app-font);
        min-width: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    /* Child element rows (doors/windows hosted by a wall) */
    .pb-ubp-st-child-row {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 3px 10px 3px 38px;
        cursor: pointer;
        transition: background 0.12s;
        border-bottom: 1px solid var(--app-border-light);
        user-select: none;
        background: #fbfaff;
    }

    .pb-ubp-st-child-row:last-child {
        border-bottom: none;
    }

    .pb-ubp-st-child-row:hover {
        background: #ede8ff;
    }

    .pb-ubp-st-child-row.pb-ubp-st-child-row--sel {
        background: rgba(102,0,255,0.10);
    }

    .pb-ubp-st-child-row.pb-ubp-st-child-row--sel .pb-ubp-st-elem-name {
        color: #5500cc;
        font-weight: 600;
    }

    /* Empty level / no elements placeholder */
    .pb-ubp-st-empty {
        padding: 8px 20px;
        font-size: 10.5px;
        color: var(--app-text-muted);
        font-family: var(--app-font);
        font-style: italic;
    }

    /* ─── Tab pill bar (Views & Sheets panel — Task 6.2) ─────────────────── */
    .pb-ubp-tab-bar {
        display: flex;
        flex-direction: row;
        gap: 3px;
        padding: 4px 6px;
        background: var(--app-panel-bg);
        border-bottom: 1px solid var(--app-border);
        flex-shrink: 0;
    }

    .pb-ubp-tab-pill {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 3px;
        height: 23px;
        padding: 0 6px;
        font-size: 10px;
        font-family: var(--app-font);
        font-weight: 500;
        color: var(--app-text);
        background: var(--app-panel-bg);
        border-radius: var(--app-radius-sm);
        border: 1px solid var(--app-border);
        cursor: pointer;
        transition: background 0.12s, color 0.12s, border-color 0.12s;
        white-space: nowrap;
        user-select: none;
    }

    .pb-ubp-tab-pill:hover {
        background: rgba(102, 0, 255, 0.06);
        border-color: rgba(102, 0, 255, 0.3);
    }

    .pb-ubp-tab-pill--active {
        background: var(--app-gradient);
        color: #fff;
        border-color: transparent;
        font-weight: 600;
    }

    .pb-ubp-tab-pill--active:hover {
        background: var(--app-gradient);
        opacity: 0.92;
    }

    .pb-ubp-tab-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 14px;
        height: 12px;
        padding: 0 3px;
        border-radius: 7px;
        font-size: 8.5px;
        font-weight: 700;
        background: rgba(102, 0, 255, 0.12);
        color: var(--app-violet-1);
        line-height: 1;
    }

    .pb-ubp-tab-pill--active .pb-ubp-tab-badge {
        background: rgba(255, 255, 255, 0.25);
        color: #fff;
    }

    /* ─── Compact rows for Views / Sheets / Schedules tab content ─────────── */
    .pb-ubp-body .pb-view-entry {
        min-height: 27px;
        height: 27px;
        padding: 0 6px 0 0;
        box-sizing: border-box;
    }

    .pb-ubp-body .pb-view-entry .pb-view-dot {
        width: 24px;
        height: 24px;
        border-radius: 4px;
        flex-shrink: 0;
    }

    /* ── Elements section — category rows ────────────────────── */

    .pb-ubp-ec-row {
        display: flex;
        flex-direction: column;
        border-radius: 5px;
        overflow: hidden;
        margin-bottom: 1px;
    }

    .pb-ubp-ec-hdr {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 7px 8px 7px 8px;
        cursor: pointer;
        transition: background 0.12s;
        border-radius: 5px;
        position: relative;
    }

    .pb-ubp-ec-hdr:hover {
        background: #f3efff;
    }

    .pb-ubp-ec-hdr:hover .pb-ubp-st-vis,
    .pb-ubp-ec-hdr:hover .pb-ubp-st-iso {
        opacity: 1;
        pointer-events: auto;
    }

    .pb-ubp-ec-icon {
        flex-shrink: 0;
        color: #888;
    }

    .pb-ubp-ec-label {
        flex: 1;
        font-size: 11.5px;
        font-weight: 600;
        color: var(--app-text);
        font-family: var(--app-font);
        user-select: none;
    }

    .pb-ubp-ec-count {
        font-size: 10px;
        color: var(--app-text-muted);
        background: rgba(102,0,255,0.07);
        border-radius: 10px;
        padding: 1px 6px;
        min-width: 18px;
        text-align: center;
        font-variant-numeric: tabular-nums;
        flex-shrink: 0;
    }

    .pb-ubp-ec-chevron {
        color: var(--app-text-muted);
        font-size: 14px;
        transition: transform 0.15s;
        flex-shrink: 0;
        user-select: none;
        line-height: 1;
    }

    .pb-ubp-ec-chevron--open {
        transform: rotate(90deg);
    }

    /* Category body (expands below header) */
    .pb-ubp-ec-body {
        display: flex;
        flex-direction: column;
        gap: 0;
        padding: 2px 0 2px 16px;
        border-left: 2px solid rgba(102,0,255,0.10);
        margin-left: 14px;
        margin-bottom: 2px;
    }

    /* Sub-type header row within a category */
    .pb-ubp-ec-type-hdr {
        display: flex;
        align-items: center;
        gap: 5px;
        padding: 5px 6px;
        cursor: pointer;
        border-radius: 4px;
        transition: background 0.12s;
        user-select: none;
    }

    .pb-ubp-ec-type-hdr:hover {
        background: rgba(102,0,255,0.06);
    }

    .pb-ubp-ec-type-hdr:hover .pb-ubp-st-vis,
    .pb-ubp-ec-type-hdr:hover .pb-ubp-st-iso {
        opacity: 1;
        pointer-events: auto;
    }

    .pb-ubp-ec-type-chevron {
        color: var(--app-text-muted);
        font-size: 12px;
        transition: transform 0.15s;
        flex-shrink: 0;
        user-select: none;
        line-height: 1;
    }

    .pb-ubp-ec-type-chevron--open {
        transform: rotate(90deg);
    }

    .pb-ubp-ec-type-icon {
        color: #999;
        flex-shrink: 0;
    }

    .pb-ubp-ec-type-name {
        flex: 1;
        font-size: 10.5px;
        font-weight: 600;
        color: var(--app-text-2);
        font-family: var(--app-font);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .pb-ubp-ec-type-count {
        font-size: 9.5px;
        color: var(--app-text-muted);
        font-variant-numeric: tabular-nums;
        flex-shrink: 0;
    }

    /* Instance list under a sub-type */
    .pb-ubp-ec-inst-body {
        display: flex;
        flex-direction: column;
        padding-left: 10px;
        border-left: 1px solid rgba(102,0,255,0.07);
        margin-left: 6px;
        margin-bottom: 2px;
    }

    /* Single instance row */
    .pb-ubp-ec-inst-row {
        display: flex;
        align-items: center;
        gap: 5px;
        padding: 3px 6px;
        cursor: pointer;
        border-radius: 3px;
        transition: background 0.12s;
        user-select: none;
    }

    .pb-ubp-ec-inst-row:hover {
        background: rgba(102,0,255,0.06);
    }

    .pb-ubp-ec-inst-row:hover .pb-ubp-st-vis,
    .pb-ubp-ec-inst-row:hover .pb-ubp-st-iso {
        opacity: 1;
        pointer-events: auto;
    }

    .pb-ubp-ec-inst-row--selected {
        background: rgba(102,0,255,0.10);
    }

    .pb-ubp-ec-inst-dot {
        width: 5px;
        height: 5px;
        border-radius: 50%;
        background: #6600FF;
        opacity: 0.35;
        flex-shrink: 0;
    }

    .pb-ubp-ec-inst-name {
        flex: 1;
        font-size: 10.5px;
        color: var(--app-text);
        font-family: var(--app-font);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .pb-ubp-ec-inst-level {
        font-size: 9px;
        color: var(--app-text-muted);
        flex-shrink: 0;
        background: rgba(0,0,0,0.04);
        border-radius: 3px;
        padding: 0 4px;
    }
`;

