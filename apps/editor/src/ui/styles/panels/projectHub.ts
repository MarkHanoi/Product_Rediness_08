/**
 * @file src/styles/panels/projectHub.ts
 *
 * CSS for the Project Hub panel (ph- prefix).
 * CONTRACT §05 §2 — CSS layer only, zero logic.
 * CONTRACT §06 §5 — White/violet backgrounds only; no dark backgrounds.
 *
 * Layout: Replit-inspired sidebar + main content structure.
 * Colours: PRYZM violet palette (--app-gradient, --app-accent, --app-violet-soft).
 */
export const PROJECT_HUB_STYLES = `
    /* ─── Shell — PRYZM4 animated mesh gradient background ───────────────
       Uses the same lp4-* @property / lp4-mesh-flow system injected by
       LANDING_PAGE_STYLES so the gradient is live the moment the hub mounts
       (both styles share the same <head> injection via injectAppTheme()).
       Saturation is lower than the landing page: blobs use rgba opacity
       so the violet reads as a light lavender ambience rather than a full
       colour field — letting white project cards remain the visual focus.
    ────────────────────────────────────────────────────────────────────── */
    .ph-shell {
        position: fixed;
        inset: 0;
        background:
            radial-gradient(ellipse 80% 60% at var(--lp4-b1x, 5%) var(--lp4-b1y, 55%), rgba(200,182,255,0.42) 0%, transparent 60%),
            radial-gradient(ellipse 60% 50% at var(--lp4-b2x, 92%) var(--lp4-b2y, 18%), rgba(184,162,255,0.28) 0%, transparent 55%),
            radial-gradient(ellipse 55% 45% at var(--lp4-b3x, 72%) var(--lp4-b3y, 90%), rgba(218,206,255,0.22) 0%, transparent 52%),
            #f3f0ff;
        animation: lp4-mesh-flow 45s ease-in-out infinite;
        display: flex;
        flex-direction: row;
        font-family: var(--app-font);
        color: var(--app-text);
        z-index: 10;
        overflow: hidden;
    }
    @media (prefers-reduced-motion: reduce) {
        .ph-shell { animation: none; }
    }

    /* ─── Sidebar ─────────────────────────────────────────────────────── */
    .ph-sidebar {
        width: 264px;
        flex-shrink: 0;
        background: #ffffff;
        border-right: 1px solid var(--app-border);
        display: flex;
        flex-direction: column;
        overflow-y: scroll;
        overflow-x: hidden;
        scrollbar-width: thin;
        scrollbar-color: #c4cde0 #f0f3fb;
        scrollbar-gutter: stable;
    }
    .ph-sidebar::-webkit-scrollbar { width: 10px; }
    .ph-sidebar::-webkit-scrollbar-track {
        background: #f0f3fb;
    }
    .ph-sidebar::-webkit-scrollbar-thumb {
        background: #c4cde0;
        border-radius: 5px;
        border: 2px solid #f0f3fb;
        background-clip: padding-box;
        min-height: 40px;
    }
    .ph-sidebar::-webkit-scrollbar-thumb:hover {
        background: #a8b3cf;
        background-clip: padding-box;
        border: 2px solid #f0f3fb;
    }

    /* Brand logo in main header top-right */
    .ph-brand-logo {
        height: 26px;
        width: auto;
        display: block;
        object-fit: contain;
        flex-shrink: 0;
        opacity: 0.85;
    }

    /* Workspace block */
    .ph-workspace-block {
        display: flex;
        align-items: center;
        gap: 9px;
        padding: 16px 14px 12px;
        border-bottom: 1px solid var(--app-border-light);
        flex-shrink: 0;
    }
    .ph-ws-avatar {
        width: 30px;
        height: 30px;
        border-radius: 7px;
        background: var(--app-gradient);
        color: #fff;
        font-size: 11px;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        letter-spacing: 0.02em;
    }
    .ph-ws-name {
        flex: 1;
        font-size: 13px;
        font-weight: 600;
        color: var(--app-text);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .ph-ws-chevron {
        color: var(--app-text-muted);
        flex-shrink: 0;
        opacity: 0.6;
    }

    /* CTA buttons in sidebar */
    .ph-sidebar-cta-group {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 12px 10px;
        border-bottom: 1px solid var(--app-border-light);
        flex-shrink: 0;
    }
    .ph-sidebar-cta-primary {
        display: flex;
        align-items: center;
        gap: 7px;
        background: var(--app-gradient);
        color: #fff;
        border: none;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 600;
        padding: 9px 14px;
        cursor: pointer;
        font-family: var(--app-font);
        transition: opacity 0.15s, transform 0.12s;
        box-shadow: 0 2px 8px rgba(102,0,255,0.22);
        width: 100%;
        text-align: left;
    }
    .ph-sidebar-cta-primary:hover { opacity: 0.9; transform: translateY(-1px); }
    .ph-sidebar-cta-secondary {
        display: flex;
        align-items: center;
        gap: 7px;
        background: none;
        color: var(--app-text-2);
        border: 1.5px solid var(--app-border);
        border-radius: 8px;
        font-size: 13px;
        font-weight: 500;
        padding: 8px 13px;
        cursor: pointer;
        font-family: var(--app-font);
        transition: border-color 0.15s, color 0.15s, background 0.15s;
        width: 100%;
        text-align: left;
    }
    .ph-sidebar-cta-secondary:hover:not(:disabled) { border-color: var(--app-accent); color: var(--app-accent); background: var(--app-violet-soft); }
    .ph-sidebar-cta-secondary:disabled { opacity: 0.4; cursor: default; }

    /* Sidebar nav — flows naturally; the parent .ph-sidebar handles scrolling */
    .ph-sidebar-nav {
        flex: 1 0 auto;
        padding: 10px 10px;
    }
    .ph-sidebar-section { margin-bottom: 18px; }
    .ph-sidebar-label {
        font-size: 10px;
        font-weight: 700;
        color: var(--app-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.09em;
        padding: 0 6px;
        margin-bottom: 4px;
    }
    .ph-sidebar-item {
        display: flex;
        align-items: center;
        gap: 9px;
        padding: 7px 8px;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 500;
        color: var(--app-text-2);
        cursor: pointer;
        transition: background 0.12s, color 0.12s;
        user-select: none;
    }
    .ph-sidebar-item:hover { background: #f0f3fb; color: var(--app-text); }
    .ph-sidebar-item--active {
        background: var(--app-violet-soft);
        color: var(--app-accent);
        font-weight: 600;
    }
    .ph-sidebar-item-label { flex: 1; }
    .ph-sidebar-count {
        font-size: 10px;
        font-weight: 700;
        background: var(--app-border);
        color: var(--app-text-2);
        border-radius: 99px;
        padding: 1px 6px;
        min-width: 18px;
        text-align: center;
    }
    .ph-sidebar-item--active .ph-sidebar-count {
        background: rgba(102,0,255,0.14);
        color: var(--app-accent);
    }
    .ph-sidebar-divider {
        height: 1px;
        background: var(--app-border-light);
        margin: 8px 6px;
    }

    /* Settings nav items */
    .ph-settings-btn {
        display: flex;
        align-items: center;
        gap: 9px;
        width: 100%;
        box-sizing: border-box;
        padding: 7px 8px;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 500;
        color: var(--app-text-2);
        background: none;
        border: none;
        cursor: pointer;
        font-family: var(--app-font);
        transition: background 0.12s, color 0.12s;
        text-align: left;
    }
    .ph-settings-btn:hover:not(:disabled) { background: #f0f3fb; color: var(--app-text); }
    .ph-settings-btn:disabled { opacity: 0.4; cursor: default; }
    .ph-settings-btn--owner { color: var(--app-accent); }
    .ph-settings-btn--owner:hover { background: var(--app-violet-soft); color: var(--app-accent); }
    .ph-settings-divider {
        height: 1px;
        background: var(--app-border-light);
        margin: 6px 6px;
    }

    /* Plan / footer section at sidebar bottom */
    .ph-sidebar-footer {
        padding: 12px 14px;
        border-top: 1px solid var(--app-border-light);
        flex-shrink: 0;
    }
    .ph-plan-label {
        font-size: 10px;
        font-weight: 700;
        color: var(--app-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.09em;
        margin-bottom: 8px;
    }
    .ph-plan-badge {
        display: inline-flex;
        align-items: center;
        padding: 2px 8px;
        border-radius: 99px;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        background: var(--app-border);
        color: var(--app-text-2);
        margin-bottom: 8px;
    }
    .ph-plan-badge--owner {
        background: var(--app-gradient);
        color: #fff;
        box-shadow: 0 2px 6px rgba(102,0,255,0.3);
    }
    .ph-plan-badge--architect,
    .ph-plan-badge--pro {
        background: linear-gradient(135deg, #8B5CF6 0%, #6600FF 100%);
        color: #fff;
    }
    .ph-upgrade-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        width: 100%;
        background: var(--app-gradient);
        color: #fff;
        border: none;
        border-radius: 8px;
        font-size: 12px;
        font-weight: 700;
        padding: 9px 12px;
        cursor: pointer;
        font-family: var(--app-font);
        transition: opacity 0.15s, transform 0.12s;
        box-shadow: 0 2px 8px rgba(102,0,255,0.25);
        margin-top: 6px;
    }
    .ph-upgrade-btn:hover { opacity: 0.9; transform: translateY(-1px); }
    .ph-sign-out {
        display: flex;
        align-items: center;
        gap: 7px;
        width: 100%;
        background: none;
        border: none;
        font-size: 12px;
        font-weight: 500;
        color: var(--app-text-muted);
        cursor: pointer;
        font-family: var(--app-font);
        padding: 6px 0 0;
        transition: color 0.12s;
        margin-top: 4px;
    }
    .ph-sign-out:hover { color: var(--app-text); }

    /* ─── Main content ────────────────────────────────────────────────── */
    .ph-main {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        min-width: 0;
    }

    /* Main header — title row */
    .ph-main-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 28px 48px 0;
        flex-shrink: 0;
    }
    .ph-section-title-row {
        display: flex;
        align-items: center;
        gap: 10px;
    }
    .ph-section-title-icon {
        color: var(--app-accent);
        flex-shrink: 0;
    }
    .ph-section-title {
        font-size: 22px;
        font-weight: 700;
        color: var(--app-text);
        margin: 0;
        letter-spacing: -0.3px;
    }
    .ph-view-toggle {
        display: flex;
        align-items: center;
        gap: 2px;
        background: var(--app-border-light);
        border-radius: 8px;
        padding: 3px;
    }
    .ph-view-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 30px;
        height: 28px;
        border: none;
        border-radius: 6px;
        background: none;
        color: var(--app-text-muted);
        cursor: pointer;
        transition: background 0.12s, color 0.12s;
    }
    .ph-view-btn--active {
        background: #fff;
        color: var(--app-accent);
        box-shadow: 0 1px 3px rgba(30,50,120,0.08);
    }
    .ph-view-btn:hover:not(.ph-view-btn--active) { color: var(--app-text); }

    /* Filter bar */
    .ph-filter-bar {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 14px 48px 16px;
        flex-shrink: 0;
        flex-wrap: wrap;
    }
    .ph-filter-search-wrap {
        position: relative;
        display: flex;
        align-items: center;
        flex-shrink: 0;
    }
    .ph-search-icon {
        position: absolute;
        left: 10px;
        color: var(--app-text-muted);
        pointer-events: none;
    }
    .ph-search-input {
        width: 200px;
        padding: 7px 12px 7px 32px;
        border: 1.5px solid var(--app-border);
        border-radius: 8px;
        font-size: 13px;
        font-family: var(--app-font);
        color: var(--app-text);
        background: #fff;
        outline: none;
        transition: border-color 0.15s, width 0.2s;
        box-sizing: border-box;
    }
    .ph-search-input:focus { border-color: var(--app-accent); width: 260px; }
    .ph-filter-pill {
        display: flex;
        align-items: center;
        gap: 5px;
        padding: 6px 12px;
        border: 1.5px solid var(--app-border);
        border-radius: 8px;
        background: #fff;
        font-size: 12px;
        font-weight: 500;
        color: var(--app-text-2);
        cursor: pointer;
        font-family: var(--app-font);
        transition: border-color 0.12s, color 0.12s, background 0.12s;
        white-space: nowrap;
    }
    .ph-filter-pill:hover { border-color: var(--app-accent); color: var(--app-accent); background: var(--app-violet-soft); }
    .ph-filter-pill--active { border-color: var(--app-accent); color: var(--app-accent); background: var(--app-violet-soft); }
    .ph-filter-pill svg { flex-shrink: 0; }
    .ph-filter-sep {
        width: 1px;
        height: 22px;
        background: var(--app-border);
        margin: 0 2px;
        flex-shrink: 0;
    }

    /* Sort pills (re-use filter-pill visual) */
    .ph-sort-btn {
        display: flex;
        align-items: center;
        gap: 5px;
        padding: 6px 12px;
        border: 1.5px solid var(--app-border);
        border-radius: 8px;
        background: #fff;
        font-size: 12px;
        font-weight: 500;
        color: var(--app-text-2);
        cursor: pointer;
        font-family: var(--app-font);
        transition: border-color 0.12s, color 0.12s, background 0.12s;
    }
    .ph-sort-btn:hover { border-color: var(--app-accent); color: var(--app-accent); background: var(--app-violet-soft); }
    .ph-sort-btn--active { border-color: var(--app-accent); color: var(--app-accent); background: var(--app-violet-soft); }
    .ph-sort-label {
        font-size: 11px;
        font-weight: 600;
        color: var(--app-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    /* ─── Project grid ────────────────────────────────────────────────── */
    .ph-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
        gap: 16px;
        padding: 4px 48px 32px;
        overflow-y: auto;
        flex: 1;
        align-content: start;
        scrollbar-width: thin;
        scrollbar-color: #c4cde0 transparent;
        min-height: 0;
    }
    .ph-grid::-webkit-scrollbar { width: 8px; }
    .ph-grid::-webkit-scrollbar-track { background: transparent; }
    .ph-grid::-webkit-scrollbar-thumb {
        background: #c4cde0;
        border-radius: 4px;
        border: 2px solid transparent;
        background-clip: padding-box;
    }
    .ph-grid::-webkit-scrollbar-thumb:hover { background: #a8b3cf; background-clip: padding-box; border: 2px solid transparent; }

    /* ─── Project card ────────────────────────────────────────────────── */
    /* §CANVAS-CARD (2026-05-22): frosted-glass "Canvas" card. The card surface
       is a translucent glass panel over the hub's violet mesh-gradient (was a
       solid white #fff card); the preview sits cleanly inset inside it. Phase 1
       of the movable-Canvas-cards feature (drag-to-move follows in Phase 2). */
    .ph-card {
        border-radius: 14px;
        overflow: hidden;
        cursor: pointer;
        transition: transform 0.18s, box-shadow 0.18s, border-color 0.18s, background 0.18s;
        border: 1px solid rgba(255,255,255,0.5);
        background: rgba(255,255,255,0.28);
        -webkit-backdrop-filter: blur(20px) saturate(1.3);
        backdrop-filter: blur(20px) saturate(1.3);
        box-shadow: 0 6px 22px rgba(40,30,90,0.10), inset 0 1px 0 rgba(255,255,255,0.4);
        position: relative;
    }
    .ph-card--project { cursor: grab; }
    .ph-card--project:active { cursor: grabbing; }
    .ph-card--dragging {
        opacity: 0.45;
        transform: scale(0.97);
    }
    .ph-card--drop-before {
        box-shadow: -3px 0 0 0 var(--app-accent);
    }
    .ph-card--drop-after {
        box-shadow: 3px 0 0 0 var(--app-accent);
    }
    .ph-card:hover {
        transform: translateY(-3px);
        box-shadow: 0 14px 36px rgba(40,30,90,0.18), inset 0 1px 0 rgba(255,255,255,0.5);
        border-color: rgba(102,0,255,0.45);
        background: rgba(255,255,255,0.52);
    }

    /* §ADD-PEOPLE (2026-05-22): "Invite collaborators" project chooser (shown in
       the members modal when the user has more than one project). */
    .ph-invite-picker { display: flex; flex-direction: column; gap: 6px; padding: 4px 0; }
    .ph-invite-picker-row {
        display: flex; align-items: center; justify-content: space-between;
        width: 100%; padding: 10px 12px; border-radius: 8px;
        border: 1px solid var(--app-border, #e2e6f0); background: #fff;
        cursor: pointer; font-size: 13px; font-weight: 500; color: var(--app-text, #1a2035);
        transition: background 0.12s, border-color 0.12s;
    }
    .ph-invite-picker-row:hover {
        background: var(--app-violet-soft, rgba(102,0,255,0.06));
        border-color: var(--app-accent, #6600ff);
        color: var(--app-accent, #6600ff);
    }

    /* Thumbnail */
    .ph-card-thumb {
        height: 140px;
        display: flex;
        align-items: flex-end;
        padding: 12px;
        position: relative;
        overflow: hidden;
    }
    .ph-card-thumb-img {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        object-position: center top;
        z-index: 0;
    }
    .ph-card-thumb-initial {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-size: 44px;
        font-weight: 800;
        opacity: 0.13;
    }
    .ph-card-thumb-grid {
        display: flex;
        align-items: flex-end;
        width: 100%;
        height: 52px;
        position: relative;
        z-index: 1;
    }
    .ph-card-thumb-label {
        position: absolute;
        top: 10px;
        left: 12px;
        font-size: 9px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.07em;
        opacity: 0.55;
        z-index: 1;
    }

    /* New card */
    .ph-card--new {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 196px;
        border-style: dashed;
        background: #fafbff;
        color: var(--app-text-muted);
        transition: background 0.15s, color 0.15s, border-color 0.15s, transform 0.18s;
    }
    .ph-card--new:hover {
        background: var(--app-violet-soft);
        color: var(--app-accent);
        border-color: var(--app-accent);
        border-style: solid;
    }
    .ph-card-new-icon {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        border: 2px dashed currentColor;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 22px;
        line-height: 1;
        margin-bottom: 8px;
        transition: border-style 0.15s;
    }
    .ph-card--new:hover .ph-card-new-icon { border-style: solid; }
    .ph-card-new-label { font-size: 13px; font-weight: 600; }

    /* Card info footer */
    .ph-card-info {
        padding: 10px 12px 11px;
        border-top: 1px solid var(--app-border-light);
    }
    .ph-card-name {
        font-size: 13px;
        font-weight: 600;
        color: var(--app-text);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        margin-bottom: 5px;
    }
    .ph-card-meta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 11px;
        color: var(--app-text-muted);
        gap: 6px;
    }
    .ph-card-meta-left {
        display: flex;
        align-items: center;
        gap: 4px;
        overflow: hidden;
    }
    .ph-card-meta-right {
        display: flex;
        align-items: center;
        gap: 4px;
        flex-shrink: 0;
    }
    .ph-card-privacy {
        display: flex;
        align-items: center;
        gap: 3px;
        font-size: 10px;
        font-weight: 500;
        color: var(--app-text-muted);
    }
    .ph-card-description {
        font-size: 11px;
        color: var(--app-text-muted);
        margin-top: 4px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        display: none;
    }

    /* Card badges & menu */
    .ph-card--project { position: relative; }
    .ph-card-menu-btn {
        position: absolute;
        top: 8px;
        right: 8px;
        background: rgba(255,255,255,0.90);
        border: 1px solid rgba(0,0,0,0.08);
        border-radius: 6px;
        color: var(--app-text-2);
        cursor: pointer;
        padding: 4px 5px;
        display: none;
        align-items: center;
        justify-content: center;
        transition: all 0.12s;
        z-index: 2;
        line-height: 1;
        backdrop-filter: blur(4px);
    }
    .ph-card--project:hover .ph-card-menu-btn { display: flex; }
    .ph-card-menu-btn:hover {
        background: #fff;
        color: var(--app-accent);
        border-color: rgba(102,0,255,0.3);
        box-shadow: 0 2px 8px rgba(102,0,255,0.15);
    }
    .ph-card-star-badge {
        position: absolute;
        top: 8px;
        left: 10px;
        font-size: 13px;
        line-height: 1;
        color: #f59e42;
        z-index: 2;
        text-shadow: 0 1px 3px rgba(0,0,0,0.15);
    }
    .ph-card-archive-badge {
        position: absolute;
        top: 8px;
        left: 10px;
        font-size: 12px;
        line-height: 1;
        z-index: 2;
        opacity: 0.6;
    }
    .ph-card--archived { opacity: 0.7; }
    .ph-card--archived:hover { opacity: 1; }

    /* ─── Modals ──────────────────────────────────────────────────────── */
    .ph-modal-overlay {
        position: fixed;
        inset: 0;
        /* §PANEL-BACKDROP-UNIFY — shared scrim (was rgba(15,20,50,0.45)+blur6). */
        background: var(--pryzm-panel-backdrop);
        backdrop-filter: var(--pryzm-panel-backdrop-blur);
        -webkit-backdrop-filter: var(--pryzm-panel-backdrop-blur);
        align-items: center;
        justify-content: center;
        z-index: 99998;
        animation: am-fade 0.18s ease;
    }
    .ph-modal {
        background: #fff;
        border-radius: var(--app-radius-lg);
        box-shadow: 0 20px 60px rgba(30,50,120,0.2);
        width: 440px;
        max-width: 95vw;
        overflow: hidden;
        animation: am-slide 0.22s ease;
    }
    .ph-modal-header {
        background: var(--app-gradient);
        padding: 16px 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
    }
    .ph-modal-title { font-size: 14px; font-weight: 700; color: #fff; }
    .ph-modal-close {
        background: rgba(255,255,255,0.2);
        border: none;
        color: #fff;
        width: 26px;
        height: 26px;
        border-radius: 50%;
        cursor: pointer;
        font-size: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: var(--app-font);
        transition: background 0.15s;
    }
    .ph-modal-close:hover { background: rgba(255,255,255,0.35); }
    .ph-modal-body { padding: 24px; display: flex; flex-direction: column; gap: 16px; }
    .ph-modal-field { display: flex; flex-direction: column; gap: 5px; }
    .ph-modal-label {
        font-size: 11px;
        font-weight: 700;
        color: var(--app-text-2);
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }
    .ph-modal-input {
        padding: 10px 12px;
        border: 1.5px solid var(--app-border);
        border-radius: 8px;
        font-size: 14px;
        font-family: var(--app-font);
        color: var(--app-text);
        background: #fafbff;
        outline: none;
        transition: border-color 0.15s;
        width: 100%;
        box-sizing: border-box;
    }
    .ph-modal-input:focus { border-color: var(--app-accent); background: #fff; }
    .ph-modal-textarea {
        resize: vertical;
        min-height: 60px;
        font-size: 13px;
        line-height: 1.5;
    }
    .ph-modal-footer {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        padding: 16px 24px;
        border-top: 1px solid var(--app-border);
        background: #fafbff;
    }
    .ph-modal-cancel {
        background: none;
        border: 1.5px solid var(--app-border);
        border-radius: 8px;
        font-size: 13px;
        font-weight: 600;
        padding: 9px 18px;
        cursor: pointer;
        color: var(--app-text-2);
        font-family: var(--app-font);
        transition: all 0.15s;
    }
    .ph-modal-cancel:hover { border-color: var(--app-text-muted); color: var(--app-text); }
    .ph-modal-create {
        background: var(--app-gradient);
        color: #fff;
        border: none;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 700;
        padding: 9px 20px;
        cursor: pointer;
        font-family: var(--app-font);
        box-shadow: 0 2px 8px rgba(102,0,255,0.25);
        transition: opacity 0.15s, transform 0.15s;
    }
    .ph-modal-create:hover { opacity: 0.9; transform: translateY(-1px); }

    /* ─── Context menu ────────────────────────────────────────────────── */
    .ph-ctx-menu {
        position: fixed;
        z-index: 99999;
        background: #fff;
        border: 1.5px solid var(--app-border);
        border-radius: 10px;
        box-shadow: 0 8px 32px rgba(30,50,120,0.14), 0 2px 8px rgba(30,50,120,0.07);
        padding: 4px;
        min-width: 168px;
        font-family: var(--app-font);
        animation: ph-ctx-appear 0.12s ease;
    }
    @keyframes ph-ctx-appear {
        from { opacity: 0; transform: scale(0.95) translateY(-4px); }
        to   { opacity: 1; transform: scale(1) translateY(0); }
    }
    .ph-ctx-item {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        background: none;
        border: none;
        border-radius: 6px;
        font-size: 13px;
        font-weight: 500;
        color: var(--app-text);
        padding: 8px 10px;
        cursor: pointer;
        font-family: var(--app-font);
        text-align: left;
        transition: background 0.1s, color 0.1s;
    }
    .ph-ctx-item:hover { background: var(--app-bg); color: var(--app-accent); }
    .ph-ctx-item--danger:hover { background: #fff5f5; color: #e53e3e; }
    .ph-ctx-divider {
        height: 1px;
        background: var(--app-border-light);
        margin: 3px 6px;
    }

    /* ─────────────────────────────────────────────────────────────────── */
    /* MOB-001-PH  Mobile Responsiveness                                   */
    /* Contract: docs/05-guides/mobile/MOBILE_CONTRACT.md §2.3                       */
    /* ─────────────────────────────────────────────────────────────────── */

    /* ── Mobile top bar (hidden on desktop) ────────────────────────────── */
    .ph-mobile-topbar {
        display: none;
        align-items: center;
        gap: 10px;
        padding: 0 16px;
        height: 56px;
        background: #ffffff;
        border-bottom: 1px solid var(--app-border);
        flex-shrink: 0;
        position: sticky;
        top: 0;
        z-index: 50;
    }
    .ph-mobile-hamburger {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 44px;
        height: 44px;
        background: none;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        color: var(--app-text);
        transition: background 0.12s;
        flex-shrink: 0;
    }
    .ph-mobile-hamburger:hover { background: var(--app-bg); }
    .ph-mobile-topbar-title {
        flex: 1;
        font-size: 15px;
        font-weight: 700;
        color: var(--app-text);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .ph-mobile-new-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        min-height: 36px;
        padding: 0 14px;
        background: var(--app-gradient);
        color: #fff;
        border: none;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        font-family: var(--app-font);
        box-shadow: 0 2px 8px rgba(102,0,255,0.22);
        flex-shrink: 0;
        white-space: nowrap;
    }

    /* ── Mobile sidebar backdrop ────────────────────────────────────────── */
    .ph-mobile-backdrop {
        display: none;
        position: fixed;
        inset: 0;
        /* §PANEL-BACKDROP-UNIFY — shared scrim (was rgba(15,20,50,0.40)+blur2). */
        background: var(--pryzm-panel-backdrop);
        z-index: 199;
        backdrop-filter: var(--pryzm-panel-backdrop-blur);
        -webkit-backdrop-filter: var(--pryzm-panel-backdrop-blur);
    }
    .ph-mobile-backdrop--visible { display: block; }

    /* On touch devices: always show the card menu button */
    @media (hover: none) {
        .ph-card-menu-btn { display: flex; }
    }

    /* ─────────────────────────── @media ≤768px ─────────────────────────── */
    @media (max-width: 768px) {
        /* Shell: column layout on mobile */
        .ph-shell { flex-direction: column; }

        /* Sidebar: off-canvas drawer */
        .ph-sidebar {
            position: fixed;
            top: 0;
            left: 0;
            bottom: 0;
            width: 280px;
            z-index: 200;
            transform: translateX(-100%);
            transition: transform 0.28s ease;
            overflow-y: auto;
        }
        .ph-sidebar--open {
            transform: translateX(0);
            box-shadow: 4px 0 24px rgba(30,50,120,0.18);
        }

        /* Show mobile top bar */
        .ph-mobile-topbar { display: flex; }

        /* Main content: no side padding for sidebar (sidebar is gone) */
        .ph-main {
            overflow-y: auto;
            height: 100%;
        }
        .ph-main-header {
            padding: 20px 16px 0;
        }
        .ph-filter-bar {
            padding: 12px 16px 12px;
            overflow-x: auto;
            flex-wrap: nowrap;
            -webkit-overflow-scrolling: touch;
        }
        .ph-filter-bar::-webkit-scrollbar { display: none; }

        /* Grid: reduced padding */
        .ph-grid {
            padding: 4px 16px 24px;
            grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
        }

        /* Search: full-width */
        .ph-filter-search-wrap { flex: 1; min-width: 0; }
        .ph-search-input {
            width: 100%;
        }
        .ph-search-input:focus { width: 100%; }

        /* Context menu items: taller for touch */
        .ph-ctx-item {
            min-height: 44px;
            padding: 10px 12px;
        }

        /* Modal: full-width on mobile */
        .ph-modal {
            width: calc(100% - 32px);
            max-width: 100%;
            margin: 16px;
        }
        .ph-modal-body { padding: 16px; gap: 12px; }
        .ph-modal-footer { padding: 12px 16px; }
    }

    /* ─────────────────────────── @media ≤480px ─────────────────────────── */
    @media (max-width: 480px) {
        /* 2-column grid on small phones */
        .ph-grid {
            grid-template-columns: 1fr 1fr;
            gap: 12px;
            padding: 4px 12px 20px;
        }
        .ph-main-header { padding: 16px 12px 0; }
        .ph-filter-bar { padding: 10px 12px 10px; gap: 6px; }
        .ph-section-title { font-size: 18px; }

        /* Sidebar wider on very small phones to stay usable */
        .ph-sidebar { width: 260px; }

        /* Sort buttons: compact */
        .ph-sort-btn { padding: 5px 8px; font-size: 11px; }
        .ph-sort-label { display: none; }

        /* Modal: edge-to-edge */
        .ph-modal { width: 100%; margin: 0; border-radius: 16px 16px 0 0; }
        .ph-modal-overlay {
            align-items: flex-end;
        }
    }
`;
