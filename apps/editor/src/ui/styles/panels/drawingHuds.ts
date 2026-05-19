/**
 * @file src/styles/panels/drawingHuds.ts
 *
 * CSS for drawing mode HUDs: Wall Drawing HUD, Stair Setup, Stair HUD (wdh-, ssp-, sh- prefixes).
 * CONTRACT §05 §2 — CSS layer only, zero logic.
 */
export const WALL_DRAWING_HUD_STYLES = `
    /* ── HUD bar — centered at the top of the scene ─────────────── */
    .wdh-bar {
        position: fixed;
        top: 68px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 9500;
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 6px 10px 6px 14px;
        background: var(--app-panel-bg);
        border: 1px solid var(--app-border);
        border-radius: 100px;
        box-shadow: var(--app-shadow-panel);
        pointer-events: all;
        animation: wdh-pop 0.15s ease-out both;
        user-select: none;
    }
    @keyframes wdh-pop {
        from { opacity: 0; transform: translateX(-50%) translateY(-8px); }
        to   { opacity: 1; transform: translateX(-50%) translateY(0); }
    }

    /* ── "Mode:" label ───────────────────────────────────────────── */
    .wdh-mode-lbl {
        font-family: var(--app-font);
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--app-text-muted);
        margin-right: 4px;
        white-space: nowrap;
    }

    /* ── Mode shortcut button ────────────────────────────────────── */
    .wdh-btn {
        display: flex;
        align-items: center;
        gap: 5px;
        padding: 4px 10px;
        background: transparent;
        border: 1.5px solid var(--app-border);
        border-radius: 100px;
        cursor: pointer;
        color: var(--app-text);
        font-family: var(--app-font);
        transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
    }
    .wdh-btn:hover {
        background: var(--app-violet-soft);
        border-color: var(--app-accent);
        color: var(--app-accent);
    }
    .wdh-btn.wdh-btn--active {
        background: var(--app-accent);
        border-color: var(--app-accent);
        color: #ffffff;
    }
    .wdh-btn--active:hover {
        background: #7c3aed;
        border-color: #7c3aed;
        color: #ffffff;
    }

    /* ── Keyboard letter badge ───────────────────────────────────── */
    .wdh-key {
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.02em;
        line-height: 1;
        background: rgba(0,0,0,0.07);
        border-radius: 3px;
        padding: 1px 4px;
        font-family: var(--app-font-mono, monospace);
    }
    .wdh-btn--active .wdh-key {
        background: rgba(255,255,255,0.22);
    }

    /* ── Mode name text ──────────────────────────────────────────── */
    .wdh-lbl {
        font-size: 11px;
        font-weight: 500;
        white-space: nowrap;
    }

    /* ── Separator between mode buttons and action buttons ──────── */
    .wdh-sep {
        width: 1px;
        height: 18px;
        background: var(--app-border);
        margin: 0 4px;
        flex-shrink: 0;
    }

    /* ── By-Slab action button — same pill shape, no active state ── */
    .wdh-btn--slab {
        color: var(--app-text-2);
    }
    .wdh-btn--slab:hover {
        background: var(--app-violet-soft);
        border-color: var(--app-accent);
        color: var(--app-accent);
    }

    /* ── ESC hint ────────────────────────────────────────────────── */
    .wdh-esc {
        font-family: var(--app-font);
        font-size: 10px;
        color: var(--app-text-muted);
        margin-left: 8px;
        padding-left: 10px;
        border-left: 1px solid var(--app-border);
        white-space: nowrap;
    }

    /* ═══════════════════════════════════════════════════════════════
       BY-SLAB PICKER OVERLAY  (bsp-)
       Appears when "By Slab" is activated without a pre-selection.
       Instructs the user to click a slab in the scene.
       §05 §2.1 — CSS-only block; prefix claimed in §3 registry.
       ═══════════════════════════════════════════════════════════════ */
    .bsp-overlay {
        position: fixed;
        top: 68px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 9600;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 18px 8px 14px;
        background: var(--app-panel-bg);
        border: 1.5px solid var(--app-accent);
        border-radius: 100px;
        box-shadow: 0 0 0 3px rgba(124,58,237,0.12), var(--app-shadow-panel);
        pointer-events: none;
        font-family: var(--app-font);
        animation: bsp-pop 0.18s ease-out both;
        user-select: none;
    }
    @keyframes bsp-pop {
        from { opacity: 0; transform: translateX(-50%) translateY(-10px); }
        to   { opacity: 1; transform: translateX(-50%) translateY(0); }
    }
    .bsp-icon {
        font-size: 15px;
        color: var(--app-accent);
        line-height: 1;
        flex-shrink: 0;
    }
    .bsp-msg {
        font-size: 12px;
        font-weight: 500;
        color: var(--app-text);
        white-space: nowrap;
    }
    .bsp-esc {
        font-size: 10px;
        color: var(--app-text-muted);
        margin-left: 4px;
        padding-left: 10px;
        border-left: 1px solid var(--app-border);
        white-space: nowrap;
    }

    /* ═══════════════════════════════════════════════════════════════
       BOTTOM ACTION MENU  (bam-)
       PRYZM Design Language — white/violet palette per contract §2.3
       Panel body: var(--app-bg)  |  Active: var(--app-gradient)
       ═══════════════════════════════════════════════════════════════ */

    /* Outer container — fixed bottom-center, PRYZM light palette */
    .bam-container {
        position: fixed;
        bottom: 6px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 9000;
        pointer-events: auto;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0;
        border-radius: var(--app-radius-lg);
        background: var(--app-panel-bg);
        box-shadow: var(--app-shadow-panel);
        overflow: hidden;
        transition: box-shadow 0.25s ease, max-width 0.22s ease;
        font-family: var(--app-font);
        max-width: 540px;
    }
    /* Collapsed: shrink to just the toggle button — ~3× the 16 px arrow */
    .bam-container--collapsed {
        max-width: 47px;
    }

    /* ── Expand/collapse toggle row ──────────────────────────────── */
    .bam-toggle-row {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        background: var(--app-panel-bg);
    }
    .bam-toggle-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 43px;
        height: 18px;
        border: none;
        background: transparent;
        cursor: pointer;
        color: var(--app-text-muted, #7a8aaa);
        border-radius: var(--app-radius-sm);
        transition: background 0.14s ease, color 0.14s ease;
        flex-shrink: 0;
    }
    .bam-toggle-btn:hover {
        background: var(--app-violet-soft);
        color: var(--app-accent);
    }
    .bam-toggle-btn svg {
        transition: transform 0.22s cubic-bezier(0.34,1.56,0.64,1);
    }

    /* Collapsed state: hide structure and control rows, show only toggle */
    .bam-container--collapsed .bam-structure-row,
    .bam-container--collapsed .bam-control-row {
        max-height: 0;
        overflow: hidden;
        padding: 0;
        opacity: 0;
        border: none;
        transition:
            max-height 0.22s ease,
            opacity 0.18s ease,
            padding 0.18s ease;
    }
    /* Flip the chevron when expanded (default collapsed = chevron up) */
    .bam-container:not(.bam-container--collapsed) .bam-toggle-btn svg {
        transform: rotate(180deg);
    }

    /* ── Structure tools row — violet gradient header band ──────── */
    .bam-structure-row {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 0 8px;
        background: var(--app-bg);
        border-bottom: 1px solid var(--app-border);
        max-height: 0;
        overflow: hidden;
        opacity: 0;
        border-bottom-width: 0;
        transition:
            max-height 0.32s cubic-bezier(0.34,1.56,0.64,1),
            opacity 0.22s ease,
            padding 0.22s ease,
            border-bottom-width 0.22s ease;
    }
    .bam-structure-row--visible {
        max-height: 72px;
        opacity: 1;
        padding: 5px 7px;
        border-bottom-width: 1px;
    }

    /* ── Persistent control row ─────────────────────────────────── */
    .bam-control-row {
        display: flex;
        align-items: center;
        gap: 2px;
        padding: 4px 5px;
        background: var(--app-panel-bg);
    }

    /* ── Section (group of buttons) ─────────────────────────────── */
    .bam-section {
        display: flex;
        align-items: center;
        gap: 2px;
    }

    /* ── Vertical separator — uses PRYZM border token ───────────── */
    .bam-sep {
        width: 1px;
        height: 18px;
        background: var(--app-border);
        margin: 0 4px;
        flex-shrink: 0;
    }

    /* ── Base button — transparent, dark text, violet hover ─────── */
    .bam-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        width: 40px;
        height: 40px;
        padding: 0;
        border: none;
        border-radius: var(--app-radius-sm);
        background: transparent;
        cursor: pointer;
        color: var(--app-text-2);
        transition: background 0.14s ease, color 0.14s ease, transform 0.14s ease;
        flex-shrink: 0;
    }
    .bam-btn:hover {
        background: var(--app-violet-soft);
        color: var(--app-accent);
    }

    /* TOOL first button — circle shape matching the EDIT row circle style */
    .bam-btn.bam-btn--circle-tool {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: var(--app-panel-bg, #ffffff);
        border: 1.5px solid var(--app-border, #dde3f0);
        color: var(--app-text, #1a1a2e);
        box-shadow: 0 1px 4px rgba(0,0,0,0.06);
    }
    .bam-btn.bam-btn--circle-tool:hover {
        background: var(--app-violet-soft, #ede9fe);
        border-color: var(--app-accent, #6600ff);
        color: var(--app-accent, #6600ff);
    }
    .bam-btn.bam-btn--circle-tool.bam-mode-active-green {
        background: var(--app-panel-bg, #ffffff);
        border-color: var(--bam-green, #16a34a);
        color: var(--bam-green, #16a34a);
    }

    /* Wrapper button variant for icon+shortcut combos */
    .bam-btn--img-wrap {
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        width: 40px;
        height: 40px;
        padding: 0;
        border: none;
        border-radius: var(--app-radius-sm);
        background: transparent;
        cursor: pointer;
        transition: background 0.14s ease;
        flex-shrink: 0;
    }
    .bam-btn--img-wrap:hover {
        background: var(--app-violet-soft);
    }

    /* Camera / orbit buttons — lighter idle state */
    .bam-btn--cam {
        opacity: 0.65;
    }
    .bam-btn--cam:hover {
        opacity: 1;
        background: var(--app-violet-soft);
    }

    /* ── Lucide icon (SVG) buttons ──────────────────────────────── */
    .bam-icon-lucide {
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        width: 40px;
        height: 40px;
        padding: 0;
        border: none;
        border-radius: var(--app-radius-sm);
        background: transparent;
        cursor: pointer;
        color: var(--app-text-2);
        transition: background 0.14s ease, color 0.14s ease;
        flex-shrink: 0;
    }
    .bam-icon-lucide:hover {
        background: var(--app-violet-soft);
        color: var(--app-accent);
    }

    /* ── Image icon ─────────────────────────────────────────────── */
    .bam-icon-img {
        width: 28px;
        height: 28px;
        object-fit: contain;
        display: block;
        transition: opacity 0.18s ease, filter 0.18s ease;
    }
    .bam-img--inactive {
        opacity: 0.45;
        filter: grayscale(1);
    }

    /* Active image button — violet glow background */
    .bam-icon-lucide.bam-btn--active-img {
        background: var(--app-violet-soft);
        box-shadow: inset 0 0 0 1.5px var(--app-violet-1);
    }
    .bam-btn--active-img .bam-icon-img {
        opacity: 1;
        filter: none;
    }
    /* Inactive image button */
    .bam-btn--inactive-img .bam-icon-img {
        opacity: 0.40;
        filter: grayscale(1);
    }
    .bam-btn--inactive-img:hover .bam-icon-img {
        opacity: 1;
        filter: none;
    }
    .bam-btn--inactive-img:hover {
        background: var(--app-violet-soft);
    }

    /* ── Mode colour variants — PRYZM violet palette ────────────── */
    /* Compound selectors (.bam-btn.bam-mode-*) beat .bam-btn:hover  */
    /* without !important — §05 §2.3 specificity-over-important rule */

    /* Select mode: violet (primary action colour) */
    .bam-btn.bam-mode-active-blue {
        background: var(--app-gradient);
        color: #ffffff;
        box-shadow: var(--app-shadow-glow);
    }
    .bam-btn.bam-mode-active-blue .bam-icon-img { opacity: 1; filter: brightness(10); }

    /* Build mode: solid violet accent */
    .bam-btn.bam-mode-active-green {
        background: var(--app-gradient);
        box-shadow: var(--app-shadow-glow);
    }
    .bam-btn.bam-mode-active-green .bam-icon-img { opacity: 1; filter: brightness(10); }

    /* Delete mode: keep red to communicate danger */
    .bam-btn.bam-mode-active-red {
        background: rgba(220,38,38,0.12);
        color: #dc2626;
        box-shadow: inset 0 0 0 1.5px rgba(220,38,38,0.30);
    }

    /* View toggle active: soft violet tint */
    .bam-btn.bam-mode-active-amber {
        background: var(--app-violet-soft);
        color: var(--app-accent);
        box-shadow: inset 0 0 0 1.5px var(--app-violet-1);
    }

    /* ── Structure tool buttons ─────────────────────────────────── */
    .bam-btn.bam-tool--active {
        transform: scale(1.08);
        background: var(--app-violet-soft);
        box-shadow: inset 0 0 0 1.5px var(--app-violet-1), var(--app-shadow-card);
        border-radius: var(--app-radius-sm);
    }
    .bam-btn.bam-tool--active .bam-icon-img {
        opacity: 1;
        filter: none;
    }
    .bam-tool--inactive {
        transform: scale(0.94);
        opacity: 0.50;
        filter: grayscale(0.8);
    }
    .bam-btn.bam-tool--inactive:hover {
        opacity: 1;
        filter: none;
        transform: scale(1);
        background: var(--app-violet-soft);
    }

    /* ── Keyboard shortcut badge ────────────────────────────────── */
    .bam-shortcut {
        position: absolute;
        bottom: 3px;
        right: 4px;
        font-size: 7px;
        font-weight: 700;
        line-height: 1;
        color: var(--app-text-muted);
        letter-spacing: 0.03em;
        pointer-events: none;
    }

    /* ── "2D" badge — matches PRYZM green status token ─────────── */
    .bam-new-badge {
        position: absolute;
        top: 5px;
        right: 3px;
        font-size: 6px;
        font-weight: 800;
        line-height: 1;
        letter-spacing: 0.04em;
        color: #fff;
        background: var(--app-accent);
        border-radius: 3px;
        padding: 1px 3px;
        pointer-events: none;
    }
`;

export const STAIR_SETUP_PANEL_STYLES = `
    /* ── Outer panel ─────────────────────────────────────────────── */
    .stsp-panel {
        position: fixed;
        top: 64px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 9010;
        display: flex;
        flex-direction: column;
        min-width: 360px;
        max-width: 400px;
        background: rgba(255,255,255,0.97);
        border-radius: 12px;
        box-shadow: var(--app-shadow-panel);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        pointer-events: all;
        overflow: hidden;
        animation: stsp-appear 0.14s ease-out both;
    }
    @keyframes stsp-appear {
        from { opacity: 0; transform: translateX(-50%) translateY(-8px); }
        to   { opacity: 1; transform: translateX(-50%) translateY(0); }
    }

    /* ── Gradient header ──────────────────────────────────────────── */
    .stsp-header {
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 9px 14px 8px;
        background: var(--app-gradient);
    }
    .stsp-header-title {
        font-family: var(--app-font);
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.09em;
        text-transform: uppercase;
        color: #fff;
    }
    .stsp-header-sep {
        width: 1px;
        height: 10px;
        background: rgba(255,255,255,0.35);
        flex-shrink: 0;
    }
    .stsp-header-sub {
        font-family: var(--app-font);
        font-size: 10px;
        font-weight: 500;
        color: rgba(255,255,255,0.82);
    }

    /* ── Body (tinted bg) ─────────────────────────────────────────── */
    .stsp-body {
        display: flex;
        flex-direction: column;
        gap: 0;
        padding: 4px 12px 2px;
        background: #f8f9fc;
    }
    .stsp-section {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 9px 0;
        border-bottom: 1px solid #eff1f8;
    }
    .stsp-section:last-child { border-bottom: none; }

    /* ── Field labels ─────────────────────────────────────────────── */
    .stsp-label {
        font-family: var(--app-font);
        font-size: 9.5px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--app-text-2);
        user-select: none;
    }

    /* ── Level dropdowns ──────────────────────────────────────────── */
    .stsp-select {
        width: 100%;
        padding: 7px 9px;
        border-radius: 8px;
        border: 1.5px solid #dde1ef;
        background: #fff;
        font-family: var(--app-font);
        font-size: 12.5px;
        color: var(--app-text);
        outline: none;
        cursor: pointer;
        transition: border-color 0.1s;
    }
    .stsp-select:focus { border-color: var(--app-accent); }

    /* ── Width input row ─────────────────────────────────────────── */
    .stsp-input-row {
        display: flex;
        align-items: center;
        gap: 6px;
    }
    .stsp-input {
        flex: 1;
        padding: 7px 9px;
        border-radius: 8px;
        border: 1.5px solid #dde1ef;
        background: #fff;
        font-family: var(--app-font);
        font-size: 13px;
        font-weight: 500;
        color: var(--app-text);
        outline: none;
        transition: border-color 0.1s;
    }
    .stsp-input:focus { border-color: var(--app-accent); }
    .stsp-unit {
        font-family: var(--app-font);
        font-size: 12px;
        font-weight: 600;
        color: var(--app-text-2);
        min-width: 16px;
        user-select: none;
    }

    /* ── Drawing-mode pill toggle (Linear / Orthogonal) ─────────── */
    /* Mirrors the Wall mode picker — see §42-ELEMENT-CREATION-HUD. */
    .stsp-mode-row {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px;
        background: #f0f2f8;
        border-radius: 999px;
        border: 1px solid #e4e7f0;
        align-self: flex-start;
    }
    .stsp-mode-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 5px 11px;
        border-radius: 999px;
        border: none;
        background: transparent;
        color: var(--app-text-2);
        font-family: var(--app-font);
        font-size: 11.5px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.12s, color 0.12s, transform 0.06s;
        user-select: none;
    }
    .stsp-mode-btn:hover { background: #e4e7f0; }
    .stsp-mode-btn:active { transform: scale(0.97); }
    .stsp-mode-key {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 16px;
        height: 16px;
        border-radius: 4px;
        background: #dde1ef;
        color: var(--app-text-2);
        font-size: 9.5px;
        font-weight: 800;
        letter-spacing: 0;
        transition: background 0.12s, color 0.12s;
    }
    .stsp-mode-label { letter-spacing: 0.01em; }
    .stsp-mode-btn--active {
        background: var(--app-gradient);
        color: #fff;
    }
    .stsp-mode-btn--active:hover {
        background: var(--app-gradient);
        filter: brightness(1.06);
    }
    .stsp-mode-btn--active .stsp-mode-key {
        background: rgba(255, 255, 255, 0.22);
        color: #fff;
    }

    /* ── Inline warning (amber — not red) ───────────────────────── */
    .stsp-error {
        font-family: var(--app-font);
        font-size: 11px;
        color: #92400e;
        text-align: center;
        padding: 5px 12px 0;
        background: #fffbeb;
        border-top: 1px solid #fde68a;
    }

    /* ── Footer buttons ──────────────────────────────────────────── */
    .stsp-footer {
        display: flex;
        gap: 8px;
        padding: 10px 12px 9px;
        background: #fff;
        border-top: 1px solid #eff1f8;
    }
    .stsp-btn {
        flex: 1;
        padding: 9px 0;
        border-radius: 8px;
        border: none;
        font-family: var(--app-font);
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.12s, filter 0.12s, transform 0.06s;
    }
    .stsp-btn:active { transform: scale(0.97); }
    .stsp-btn--cancel {
        background: #f0f2f8;
        color: var(--app-text-2);
    }
    .stsp-btn--cancel:hover { background: #e4e7f0; }
    .stsp-btn--confirm {
        background: var(--app-gradient);
        color: #fff;
    }
    .stsp-btn--confirm:hover { filter: brightness(1.08); }

    /* ── Prerequisite / info message block ───────────────────────── */
    .stsp-msg {
        display: flex;
        gap: 11px;
        padding: 14px 14px 12px;
        background: #fff;
        align-items: flex-start;
    }
    .stsp-msg-icon {
        flex-shrink: 0;
        width: 30px;
        height: 30px;
        border-radius: 50%;
        background: #fef3c7;
        color: #92400e;
        font-family: var(--app-font);
        font-size: 16px;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
        line-height: 1;
    }
    .stsp-msg-text {
        font-family: var(--app-font);
        font-size: 12.5px;
        line-height: 1.45;
        color: var(--app-text);
        margin: 0;
        padding-top: 2px;
    }
    .stsp-msg-text strong { color: var(--app-text); font-weight: 600; }
    .stsp-msg-hint {
        display: block;
        margin-top: 4px;
        font-size: 11.5px;
        color: var(--app-text-2);
    }

    /* ── Shape descriptor line ───────────────────────────────────── */
    .stsp-shape-line {
        font-family: var(--app-font);
        font-size: 10px;
        color: var(--app-text-muted);
        text-align: center;
        padding: 3px 12px 0;
        background: #f8f9fc;
        letter-spacing: 0.02em;
    }

    /* ── Stair type card grid ─────────────────────────────────────── */
    .stsp-type-grid {
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 5px;
        padding: 2px 0 4px;
    }
    .stsp-type-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 3px;
        padding: 6px 3px 5px;
        border-radius: 8px;
        border: 1.5px solid #dde1ef;
        background: #fff;
        cursor: pointer;
        transition: border-color 0.12s, background 0.12s, box-shadow 0.12s;
        font-family: var(--app-font);
        text-align: center;
        user-select: none;
    }
    .stsp-type-card:hover {
        border-color: var(--app-violet-1);
        background: var(--app-violet-soft);
    }
    .stsp-type-card.stsp-type-card--active {
        border-color: var(--app-accent);
        background: var(--app-violet-soft);
        box-shadow: 0 0 0 2px rgba(102,0,255,0.15);
    }
    .stsp-type-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        flex-shrink: 0;
    }
    .stsp-type-name {
        font-size: 8.5px;
        font-weight: 600;
        color: var(--app-text);
        line-height: 1.2;
        word-break: break-word;
        hyphens: auto;
    }
    .stsp-type-mat {
        font-size: 7.5px;
        font-weight: 500;
        color: var(--app-text-muted);
        letter-spacing: 0.04em;
        text-transform: uppercase;
    }

    /* ── Computed parameters info grid ───────────────────────────── */
    .stsp-info-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 5px;
        padding: 2px 0 4px;
    }
    .stsp-info-item {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
        padding: 6px 4px;
        border-radius: 7px;
        background: #fff;
        border: 1px solid #eff1f8;
    }
    .stsp-info-label {
        font-family: var(--app-font);
        font-size: 8.5px;
        font-weight: 600;
        color: var(--app-text-muted);
        letter-spacing: 0.05em;
        text-transform: uppercase;
    }
    .stsp-info-val {
        font-family: var(--app-font);
        font-size: 12px;
        font-weight: 700;
        color: var(--app-text);
    }
    .stsp-info-ok  { color: #38a169; }
    .stsp-info-warn { color: #dd6b20; }

    /* ── ESC hint ────────────────────────────────────────────────── */
    .stsp-hint {
        font-family: var(--app-font);
        font-size: 9.5px;
        color: #b0bcd0;
        text-align: center;
        padding: 4px 0 5px;
        border-top: 1px solid #eff1f8;
        user-select: none;
        background: #fff;
    }
`;

export const STAIR_HUD_STYLES = `
    /* ── HUD bar ─────────────────────────────────────────────────── */
    .sth-bar {
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 8900;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 18px;
        background: var(--app-panel-bg);
        border: 1px solid var(--app-border);
        border-radius: 20px;
        box-shadow: var(--app-shadow-panel);
        pointer-events: none;
        animation: sth-in 0.18s ease-out both;
    }
    @keyframes sth-in {
        from { opacity: 0; transform: translateX(-50%) translateY(8px); }
        to   { opacity: 1; transform: translateX(-50%) translateY(0); }
    }
    .sth-icon {
        font-size: 15px;
        line-height: 1;
        flex-shrink: 0;
        opacity: 0.9;
    }
    .sth-msg {
        font-family: var(--app-font);
        font-size: 12px;
        font-weight: 500;
        color: var(--app-text);
        white-space: nowrap;
        user-select: none;
    }
    .sth-key {
        display: inline-block;
        font-family: var(--app-font);
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.06em;
        color: var(--app-text-muted);
        background: rgba(0,0,0,0.07);
        border-radius: 4px;
        padding: 2px 5px;
        margin-left: 6px;
        user-select: none;
    }
`;

/**
 * Element Creation Modal (ecm-) — shown when a freeform polygon is committed.
 * Used by CeilingTool and FloorTool to let the user set parameters before creation.
 * CONTRACT §05 §2 — CSS layer only, zero logic.
 */
export const ELEMENT_CREATION_MODAL_STYLES = `
    /* ── Full-screen backdrop ─────────────────────────────────────── */
    .ecm-overlay {
        position: fixed;
        inset: 0;
        z-index: 99999;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(15, 18, 35, 0.45);
        backdrop-filter: blur(3px);
        -webkit-backdrop-filter: blur(3px);
        animation: ecm-fade-in 0.12s ease-out both;
        pointer-events: all;
    }
    @keyframes ecm-fade-in {
        from { opacity: 0; }
        to   { opacity: 1; }
    }

    /* ── Card ─────────────────────────────────────────────────────── */
    .ecm-card {
        display: flex;
        flex-direction: column;
        width: 320px;
        background: rgba(255, 255, 255, 0.98);
        border-radius: 14px;
        box-shadow: 0 8px 40px rgba(0,0,0,0.22), 0 2px 8px rgba(0,0,0,0.12);
        overflow: hidden;
        animation: ecm-slide-up 0.14s ease-out both;
        font-family: var(--app-font);
    }
    @keyframes ecm-slide-up {
        from { opacity: 0; transform: translateY(10px) scale(0.97); }
        to   { opacity: 1; transform: translateY(0)    scale(1); }
    }

    /* ── Header ───────────────────────────────────────────────────── */
    .ecm-header {
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 10px 14px 9px;
        background: var(--app-gradient);
    }
    .ecm-header-icon {
        display: flex;
        align-items: center;
        color: rgba(255,255,255,0.92);
        flex-shrink: 0;
    }
    .ecm-header-title {
        font-size: 10.5px;
        font-weight: 700;
        letter-spacing: 0.09em;
        text-transform: uppercase;
        color: #fff;
    }
    .ecm-header-sep {
        width: 1px;
        height: 10px;
        background: rgba(255,255,255,0.35);
        flex-shrink: 0;
    }
    .ecm-header-sub {
        font-size: 10px;
        font-weight: 500;
        color: rgba(255,255,255,0.80);
        flex: 1;
    }

    /* ── Body ─────────────────────────────────────────────────────── */
    .ecm-body {
        display: flex;
        flex-direction: column;
        gap: 0;
        padding: 6px 14px 4px;
        background: #f8f9fc;
    }

    /* ── Area info row ────────────────────────────────────────────── */
    .ecm-info-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 7px 0;
        border-bottom: 1px solid #eff1f8;
    }
    .ecm-info-label {
        font-size: 9.5px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--app-text-2);
    }
    .ecm-info-value {
        font-size: 12.5px;
        font-weight: 700;
        color: var(--app-accent);
    }

    /* ── Parameter field ──────────────────────────────────────────── */
    .ecm-field {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 9px 0;
        border-bottom: 1px solid #eff1f8;
    }
    .ecm-field:last-child { border-bottom: none; }
    .ecm-field-label {
        font-size: 9.5px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--app-text-2);
        user-select: none;
    }
    .ecm-field-input-row {
        display: flex;
        align-items: center;
        gap: 6px;
    }
    .ecm-field-input {
        flex: 1;
        padding: 7px 9px;
        border-radius: 8px;
        border: 1.5px solid #dde1ef;
        background: #fff;
        font-family: var(--app-font);
        font-size: 13px;
        font-weight: 500;
        color: var(--app-text);
        outline: none;
        transition: border-color 0.1s;
    }
    .ecm-field-input:focus { border-color: var(--app-accent); }
    .ecm-field-unit {
        font-size: 12px;
        font-weight: 600;
        color: var(--app-text-2);
        min-width: 16px;
        user-select: none;
    }

    /* ── Footer ───────────────────────────────────────────────────── */
    .ecm-footer {
        display: flex;
        gap: 8px;
        padding: 10px 14px 11px;
        background: #fff;
        border-top: 1px solid #eff1f8;
    }
    .ecm-btn {
        flex: 1;
        padding: 9px 0;
        border-radius: 8px;
        border: none;
        font-family: var(--app-font);
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.12s, filter 0.12s, transform 0.06s;
        outline: none;
    }
    .ecm-btn:active { transform: scale(0.97); }
    .ecm-btn--cancel {
        background: #f0f2f8;
        color: var(--app-text-2);
    }
    .ecm-btn--cancel:hover { background: #e4e7f0; }
    .ecm-btn--confirm {
        background: var(--app-gradient);
        color: #fff;
    }
    .ecm-btn--confirm:hover { filter: brightness(1.08); }
`;

