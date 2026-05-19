/**
 * @file src/styles/panels/furnitureCarousel.ts
 *
 * CSS for Furniture Carousel, Radial Menu, and Floating Carousel (fc-, rm- prefixes).
 * CONTRACT §05 §2 — CSS layer only, zero logic.
 */
export const FURNITURE_CAROUSEL_CSS = `

    /* ═══════════════════════════════════════════════════════════════════
       SPATIAL FLOATING CAROUSEL — no panel, no background, no chrome.
       Cards hover in 3D space above the scene floor.
       ═══════════════════════════════════════════════════════════════════ */

    /* ─── Positioning shell (invisible) ─────────────────────────────── */
    .fc-container {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        height: var(--fc-carousel-height);
        z-index: 200;
        display: flex;
        flex-direction: column;
        overflow: visible;
        transform: translateY(110%);
        transition: transform 0.44s cubic-bezier(0.32, 0.72, 0, 1);
        font-family: var(--app-font);
        pointer-events: none;
        background: transparent;
        border: none;
    }

    .fc-container.fc-visible {
        transform: translateY(0);
    }

    /* ─── Category pills — floating, no bar ──────────────────────────── */
    .fc-tab-bar {
        height: 34px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0 58px;
        gap: 6px;
        overflow-x: auto;
        scrollbar-width: none;
        flex-shrink: 0;
        background: transparent;
        border: none;
        pointer-events: none;
    }

    .fc-tab-bar::-webkit-scrollbar { display: none; }

    .fc-tab {
        flex-shrink: 0;
        height: 23px;
        padding: 0 12px;
        border-radius: 13px;
        font-size: 9.5px;
        font-weight: 500;
        letter-spacing: 0.04em;
        cursor: pointer;
        border: 1px solid rgba(139,92,246,0.2);
        background: rgba(8, 9, 28, 0.76);
        backdrop-filter: blur(18px) saturate(140%);
        -webkit-backdrop-filter: blur(18px) saturate(140%);
        color: rgba(170,180,220,0.62);
        white-space: nowrap;
        font-family: var(--app-font);
        box-shadow:
            0 4px 18px rgba(0,0,0,0.5),
            0 0 0 0.5px rgba(255,255,255,0.04) inset;
        transition:
            background 0.22s ease,
            color 0.22s ease,
            border-color 0.22s ease,
            box-shadow 0.22s ease,
            transform 0.15s ease;
        pointer-events: auto;
    }

    .fc-tab.fc-tab-active {
        background: rgba(102,0,255,0.72);
        backdrop-filter: blur(18px);
        border-color: rgba(180,140,255,0.4);
        color: #fff;
        box-shadow:
            0 0 18px rgba(102,0,255,0.55),
            0 6px 22px rgba(0,0,0,0.55);
    }

    .fc-tab:hover:not(.fc-tab-active) {
        background: rgba(50,20,100,0.72);
        color: rgba(220,215,255,0.92);
        border-color: rgba(139,92,246,0.4);
        box-shadow:
            0 0 10px rgba(102,0,255,0.2),
            0 4px 18px rgba(0,0,0,0.5);
        transform: translateY(-1px);
    }

    /* ─── Track wrapper — 3D arena, fully transparent ────────────────── */
    .fc-track-wrapper {
        flex: 1;
        position: relative;
        overflow: visible;
        cursor: grab;
        user-select: none;
        pointer-events: auto;
    }

    .fc-track-wrapper.fc-dragging {
        cursor: grabbing;
    }

    /* ─── Track — zero-size anchor, cards hang from its centre ──────── */
    .fc-track {
        position: absolute;
        left: 50%;
        top: 50%;
        width: 0;
        height: 0;
    }

    /* Suppress card transitions during active drag / momentum */
    .fc-track-wrapper.fc-dragging .fc-card {
        transition: none;
    }

    /* ─── Floating glass cards ───────────────────────────────────────── */
    .fc-card {
        position: absolute;
        left: 0;
        top: 0;
        width: var(--fc-card-width);
        height: var(--fc-card-height);
        background: rgba(10, 12, 36, 0.84);
        backdrop-filter: blur(22px) saturate(150%);
        -webkit-backdrop-filter: blur(22px) saturate(150%);
        border-radius: 18px;
        border: 1px solid rgba(255,255,255,0.08);
        /* Directional shadows simulate real elevation — light from above */
        box-shadow:
            0 2px  4px rgba(0,0,0,0.25),
            0 8px 20px rgba(0,0,0,0.50),
            0 22px 55px rgba(0,0,0,0.65),
            0 1px 0 rgba(255,255,255,0.05) inset;
        cursor: grab;
        user-select: none;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: space-between;
        padding: 9px 7px 7px;
        backface-visibility: hidden;
        -webkit-backface-visibility: hidden;
        transition:
            transform  0.44s cubic-bezier(0.25, 0.46, 0.45, 0.94),
            opacity    0.44s ease,
            box-shadow 0.30s ease,
            border-color 0.30s ease;
        will-change: transform, opacity;
        pointer-events: auto;
    }

    .fc-card:active { cursor: grabbing; }

    /* Focused (centre) card — glowing, elevated */
    .fc-card.fc-card-focused {
        background: rgba(18, 10, 52, 0.94);
        border-color: rgba(139,92,246,0.55);
        box-shadow:
            0 0 0 1.5px rgba(139,92,246,0.50),
            0 0  40px rgba(102,0,255,0.35),
            0 0  80px rgba(102,0,255,0.15),
            0 12px 40px rgba(0,0,0,0.75),
            0 30px 80px rgba(0,0,0,0.80);
    }

    /* ─── Card thumbnail ─────────────────────────────────────────────── */
    .fc-card-thumb {
        width: 130px;
        height: 115px;
        object-fit: contain;
        border-radius: 10px;
        background: rgba(255,255,255,0.03);
        image-rendering: crisp-edges;
        flex-shrink: 0;
    }

    .fc-card-thumb.fc-thumb-loading {
        background: linear-gradient(
            90deg,
            rgba(20,22,55,0.7) 25%,
            rgba(139,92,246,0.16) 50%,
            rgba(20,22,55,0.7) 75%
        );
        background-size: 200% 100%;
        animation: fc-skeleton-pulse 1.8s ease infinite;
    }

    @keyframes fc-skeleton-pulse {
        0%   { background-position: 200% center; }
        100% { background-position: -200% center; }
    }

    /* ─── Card label ─────────────────────────────────────────────────── */
    .fc-card-label {
        font-size: 9px;
        font-weight: 500;
        color: rgba(160,175,215,0.70);
        text-align: center;
        width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        padding: 0 4px;
        font-family: var(--app-font);
        letter-spacing: 0.02em;
    }

    .fc-card-focused .fc-card-label {
        font-weight: 600;
        font-size: 9.9px;
        color: rgba(190,155,255,1);
        letter-spacing: 0.03em;
    }

    /* ─── Navigation arrows — floating spheres ───────────────────────── */
    .fc-arrow {
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: rgba(14, 10, 44, 0.82);
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
        border: 1px solid rgba(139,92,246,0.32);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 30;
        box-shadow:
            0 6px 22px rgba(0,0,0,0.6),
            0 0 12px rgba(102,0,255,0.18);
        transition:
            transform 0.18s cubic-bezier(0.25, 0.46, 0.45, 0.94),
            box-shadow 0.18s ease,
            background 0.18s ease;
        color: rgba(175,155,255,0.85);
        font-size: 11px;
        font-family: var(--app-font);
        pointer-events: auto;
    }

    .fc-arrow:hover {
        transform: translateY(-50%) scale(1.14);
        background: rgba(55,18,120,0.9);
        box-shadow:
            0 8px 30px rgba(0,0,0,0.7),
            0 0 24px rgba(102,0,255,0.45);
        color: #fff;
    }

    .fc-arrow-left  { left: 14px; }
    .fc-arrow-right { right: 50px; }

    /* ─── Close button — floating ────────────────────────────────────── */
    .fc-close {
        position: absolute;
        top: 50%;
        right: 12px;
        transform: translateY(-50%);
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: rgba(10, 8, 30, 0.78);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid rgba(255,255,255,0.09);
        cursor: pointer;
        color: rgba(160,170,210,0.50);
        font-size: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition:
            background 0.18s ease,
            color 0.18s ease,
            box-shadow 0.18s ease;
        font-family: var(--app-font);
        z-index: 30;
        line-height: 1;
        pointer-events: auto;
        box-shadow: 0 4px 16px rgba(0,0,0,0.5);
    }

    .fc-close:hover {
        background: rgba(55,18,120,0.85);
        color: rgba(220,210,255,0.95);
        box-shadow: 0 4px 20px rgba(102,0,255,0.35);
    }

    /* ─── Empty category state ───────────────────────────────────────── */
    .fc-empty {
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        font-size: 11px;
        color: rgba(140,150,190,0.45);
        font-style: italic;
        font-family: var(--app-font);
        text-align: center;
        white-space: nowrap;
        pointer-events: none;
    }

    /* ─── Card fade-in on category switch ────────────────────────────── */
    @keyframes fc-fade-in {
        from { opacity: 0; }
    }

    .fc-card.fc-card-entering {
        animation: fc-fade-in 0.32s ease forwards;
    }

    .fsp-root {
        display: flex;
        flex-direction: column;
        min-height: 320px;
        max-height: calc(100vh - 150px);
        overflow: hidden;
        font-family: var(--app-font, system-ui);
        color: var(--app-text, #1a1a1a);
        background: var(--app-surface, #ffffff);
    }

    .fsp-header {
        flex-shrink: 0;
        padding: 10px 10px 8px;
        border-bottom: 1px solid var(--app-border, rgba(0,0,0,0.08));
        background: linear-gradient(180deg, rgba(139,92,246,0.08), rgba(255,255,255,0));
    }

    .fsp-title-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 8px;
    }

    .fsp-title {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.02em;
        color: var(--app-text, #1a1a1a);
    }

    .fsp-count {
        font-size: 10px;
        font-weight: 600;
        color: var(--app-accent, #6600ff);
        white-space: nowrap;
    }

    .fsp-search {
        width: 100%;
        height: 28px;
        border-radius: 8px;
        border: 1px solid var(--app-border, #ddd);
        background: var(--app-card, #fff);
        color: var(--app-text, #222);
        font: 500 11px/1 var(--app-font, system-ui);
        padding: 0 9px;
        outline: none;
    }

    .fsp-search:focus {
        border-color: var(--app-accent, #6600ff);
        box-shadow: 0 0 0 2px rgba(102,0,255,0.12);
    }

    .fsp-category-strip {
        display: flex;
        flex-direction: row;
        overflow-x: auto;
        gap: 5px;
        padding: 8px 10px 5px;
        flex-shrink: 0;
        scrollbar-width: thin;
    }

    .fsp-pill {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        height: 24px;
        padding: 0 8px 0 5px;
        border-radius: 999px;
        border: 1px solid var(--app-border, #ddd);
        background: var(--app-card, #fff);
        color: var(--app-text, #333);
        font: 600 10px/1 var(--app-font, system-ui);
        cursor: pointer;
        white-space: nowrap;
        flex-shrink: 0;
        transition: background 0.12s ease, color 0.12s ease, border-color 0.12s ease, box-shadow 0.12s ease;
    }

    .fsp-pill:hover {
        border-color: rgba(102,0,255,0.35);
        background: rgba(102,0,255,0.06);
    }

    .fsp-pill-active {
        border-color: var(--app-accent, #6600ff);
        background: var(--app-accent, #6600ff);
        color: #fff;
        box-shadow: 0 3px 12px rgba(102,0,255,0.20);
    }

    .fsp-pill-badge {
        min-width: 24px;
        height: 16px;
        border-radius: 8px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 8px;
        letter-spacing: 0.03em;
        background: rgba(102,0,255,0.10);
        color: var(--app-accent, #6600ff);
    }

    .fsp-pill-active .fsp-pill-badge {
        background: rgba(255,255,255,0.20);
        color: #fff;
    }

    .fsp-pill-count {
        opacity: 0.68;
    }

    .fsp-grid-wrapper {
        overflow-y: auto;
        flex: 1 1 0;
        min-height: 180px;
        padding: 5px 10px 10px;
        scrollbar-width: thin;
    }

    .fsp-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 7px;
    }

    .fsp-section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 2px 6px;
        margin-top: 4px;
        border-bottom: 1px solid var(--app-border, #e0e0e0);
        margin-bottom: 8px;
    }

    .fsp-section-header:first-child {
        margin-top: 0;
        padding-top: 4px;
    }

    .fsp-section-label {
        font-size: 9px;
        font-weight: 600;
        text-transform: none;
        letter-spacing: 0.01em;
        color: var(--app-accent, #6600ff);
    }

    .fsp-section-count {
        font-size: 9px;
        font-weight: 500;
        color: var(--app-text-muted, #8a8a8a);
    }

    .fsp-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        min-height: 102px;
        padding: 7px 5px 6px;
        border-radius: 10px;
        border: 1px solid var(--app-border, #e0e0e0);
        background: var(--app-card, var(--app-surface, #f8f8f8));
        color: var(--app-text, #333);
        cursor: pointer;
        text-align: center;
        transition: border-color 0.12s ease, background 0.12s ease, transform 0.12s ease, box-shadow 0.12s ease;
        overflow: hidden;
    }

    .fsp-card:hover {
        border-color: var(--app-accent, #6600ff);
        background: var(--app-violet-soft, rgba(102,0,255,0.08));
        transform: translateY(-1px);
        box-shadow: 0 4px 14px rgba(0,0,0,0.08);
    }

    .fsp-thumb {
        width: 68px;
        height: 58px;
        border-radius: 8px;
        overflow: visible;
        background: transparent;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        color: var(--app-accent, #6600ff);
    }

    .fsp-thumb-img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        background: transparent;
    }

    .fsp-fallback-icon {
        opacity: 0.78;
    }

    .fsp-card-label {
        font-size: 10px;
        font-weight: 650;
        line-height: 1.15;
        color: var(--app-text, #333);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        width: 100%;
    }

    .fsp-card-mode {
        font-size: 8px;
        font-weight: 650;
        line-height: 1;
        color: var(--app-text-muted, #8a8a8a);
        text-transform: uppercase;
        letter-spacing: 0.06em;
    }

    .fsp-empty {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 120px;
        font: 600 11px/1.4 var(--app-font, system-ui);
        color: var(--app-text-muted, #999);
        text-align: center;
    }
`;

export const RADIAL_MENU_CSS = `
    /* Full-viewport invisible hit layer */
    .rm-overlay {
        position: fixed;
        inset: 0;
        z-index: 9000;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.18s ease;
    }

    .rm-overlay.rm-visible {
        pointer-events: auto;
        opacity: 1;
    }

    /* Menu container — positioned at cursor */
    .rm-container {
        position: absolute;
        transform: translate(-50%, -50%);
        width: 0;
        height: 0;
    }

    /* Centre pulse dot */
    .rm-dot {
        position: absolute;
        left: 50%;
        top: 50%;
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: var(--app-gradient);
        transform: translate(-50%, -50%);
        box-shadow: 0 0 12px rgba(102,0,255,0.7);
        animation: rm-dot-pulse 1.6s ease infinite;
    }

    @keyframes rm-dot-pulse {
        0%, 100% { box-shadow: 0 0 10px rgba(102,0,255,0.6); transform: translate(-50%,-50%) scale(1); }
        50%       { box-shadow: 0 0 22px rgba(139,92,246,0.9); transform: translate(-50%,-50%) scale(1.25); }
    }

    /* Radial item button */
    .rm-item {
        position: absolute;
        left: 0;
        top: 0;
        width: 52px;
        height: 52px;
        border-radius: 50%;
        background: rgba(14, 16, 38, 0.94);
        border: 1px solid rgba(139,92,246,0.28);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        cursor: pointer;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 2px;
        padding: 6px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.55);
        transition:
            background 0.18s ease,
            border-color 0.18s ease,
            box-shadow 0.18s ease,
            transform 0.18s cubic-bezier(0.25, 0.46, 0.45, 0.94),
            opacity 0.18s ease;
        margin-left: -26px;
        margin-top: -26px;
        font-family: var(--app-font);
        transform: translate(var(--rm-tx, 0), var(--rm-ty, 0)) scale(1);
    }

    .rm-overlay .rm-item {
        opacity: 0;
        transform: translate(var(--rm-tx, 0), var(--rm-ty, 0)) scale(0.3);
    }

    .rm-overlay.rm-visible .rm-item {
        opacity: 1;
        transform: translate(var(--rm-tx, 0), var(--rm-ty, 0)) scale(1);
    }

    .rm-overlay.rm-visible .rm-item:hover {
        background: rgba(60, 30, 110, 0.96);
        border-color: rgba(139,92,246,0.75);
        box-shadow: 0 0 0 2px rgba(102,0,255,0.45), 0 8px 28px rgba(102,0,255,0.4);
        transform: translate(var(--rm-tx, 0), var(--rm-ty, 0)) scale(1.18);
    }

    .rm-overlay.rm-visible .rm-item:active {
        transform: translate(var(--rm-tx, 0), var(--rm-ty, 0)) scale(1.05);
    }

    /* Icon inside the button */
    .rm-icon {
        width: 22px;
        height: 22px;
        color: rgba(180,160,255,0.9);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
    }

    .rm-icon svg {
        width: 100%;
        height: 100%;
    }

    .rm-item:hover .rm-icon {
        color: #ffffff;
    }

    /* Label below icon */
    .rm-label {
        font-size: 8px;
        font-weight: 600;
        color: rgba(160,150,210,0.7);
        letter-spacing: 0.04em;
        text-transform: uppercase;
        white-space: nowrap;
        line-height: 1;
    }

    .rm-item:hover .rm-label {
        color: rgba(220,210,255,1);
    }
`;

export const FLOATING_CAROUSEL_CSS = `

/* ── Shell ─────────────────────────────────────────────────────────────── */
.foc-container {
    position: fixed;
    bottom: 56px;
    left: 0;
    right: 0;
    height: 140px;
    z-index: 200;
    pointer-events: none;
    /* translateY(calc(100% + 80px)) guarantees the chip-bar (which overflows
       ~60 px above the container via bottom:calc(100%+10px)) is also off-screen
       — 110% alone only clears by ~4 px and lets it peek through. */
    transform: translateY(calc(100% + 136px));
    transition: transform 0.44s cubic-bezier(0.32,0.72,0,1);
    overflow: visible;
}
.foc-container.foc-visible {
    transform: translateY(0);
}

/* ── Three.js canvas ────────────────────────────────────────────────────── */
.foc-canvas {
    position: absolute;
    bottom: 0;
    left: 0;
    width: 100%;
    height: 140px;
    pointer-events: auto;
    touch-action: pan-x;
    cursor: grab;
    background: transparent;
}
.foc-canvas:active { cursor: grabbing; }

/* ── Label overlay ───────────────────────────────────────────────────────── */
.foc-label-layer {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
}
.foc-item-label {
    position: absolute;
    font-size: 10px;
    font-weight: 400;
    color: rgba(10,10,20,0.60);
    text-shadow: 0 0.5px 2px rgba(255,255,255,0.55), 0 1px 4px rgba(255,255,255,0.35);
    pointer-events: none;
    white-space: nowrap;
    transform: translateX(-50%);
    font-family: var(--app-font);
    letter-spacing: 0.02em;
    transition: opacity 0.2s ease;
}

/* ── Category chip bar ───────────────────────────────────────────────────── */
.foc-chip-bar {
    position: absolute;
    bottom: calc(100% + 10px);
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 6px;
    align-items: center;
    pointer-events: auto;
    flex-wrap: nowrap;
    padding: 0 12px;
    white-space: nowrap;
}
.foc-chip {
    background: rgba(255,255,255,0.92);
    color: #1a1a1a;
    border: none;
    outline: none;
    box-shadow: 0 1px 4px rgba(0,0,0,0.10), 0 0.5px 1px rgba(0,0,0,0.06);
    border-radius: 10px;
    padding: 5px 14px;
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.14s ease, box-shadow 0.14s ease, transform 0.14s ease;
    font-family: var(--app-font);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
}
.foc-chip:hover:not(.foc-chip-active) {
    background: rgba(248,248,248,0.97);
    box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.07);
    transform: translateY(-1px);
}
.foc-chip.foc-chip-active {
    background: rgba(240,240,240,0.98);
    color: #000;
    font-weight: 600;
    box-shadow: 0 2px 10px rgba(0,0,0,0.14), 0 1px 2px rgba(0,0,0,0.08);
}

/* ── Navigation arrows ───────────────────────────────────────────────────── */
.foc-arrow {
    position: absolute;
    bottom: 50%;
    transform: translateY(50%);
    width: 34px;
    height: 34px;
    border-radius: 50%;
    border: none;
    background: rgba(255,255,255,0.82);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    box-shadow: 0 2px 10px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
    color: #1a1a1a;
    font-size: 20px;
    line-height: 1;
    cursor: pointer;
    pointer-events: auto;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.14s ease, box-shadow 0.14s ease, transform 0.14s ease;
    z-index: 2;
}
.foc-arrow:hover {
    background: rgba(255,255,255,0.96);
    box-shadow: 0 4px 14px rgba(0,0,0,0.14);
    transform: translateY(50%) scale(1.06);
}
.foc-arrow-left  { left:  clamp(40px, 8vw, 100px); }
.foc-arrow-right { right: clamp(40px, 8vw, 100px); }

/* ── Close button ────────────────────────────────────────────────────────── */
.foc-close-btn {
    position: absolute;
    top: -14px;
    right: 20px;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: none;
    background: rgba(255,255,255,0.82);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    box-shadow: 0 2px 8px rgba(0,0,0,0.12);
    color: #444;
    font-size: 13px;
    cursor: pointer;
    pointer-events: auto;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.14s ease, box-shadow 0.14s ease;
    z-index: 3;
}
.foc-close-btn:hover {
    background: rgba(255,255,255,0.98);
    box-shadow: 0 3px 12px rgba(0,0,0,0.16);
}

/* ── Drag ghost (drag-to-scene visual) ───────────────────────────────────── */
.foc-drag-ghost {
    position: fixed;
    pointer-events: none;
    transform: translate(-50%, -140%);
    background: rgba(255,255,255,0.90);
    color: #1a1a1a;
    font-size: 11px;
    font-weight: 500;
    font-family: var(--app-font);
    padding: 4px 10px;
    border-radius: 8px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.15);
    white-space: nowrap;
    z-index: 9999;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
}
`;

