/**
 * @file src/styles/panels/dockingSystem.ts
 *
 * CSS for Phase 1.1 (Docking Panel System, prefix dck-)
 * and Phase 1.2 (ViewCube Navigation HUD, prefix vc-).
 *
 * CONTRACT §05 §3 — Prefix registry:
 *   dck-  Docking System   (Phase 1.1)
 *   vc-   View Cube HUD    (Phase 1.2)
 *
 * All colours via var(--app-*) tokens. No hardcoded hex where a token exists.
 * Zero independent <style> injection — this constant is concatenated by
 * injectAppTheme() in AppTheme.ts.
 */

export const DOCKING_SYSTEM_STYLES = `

/* ── §05 §3 Prefix: dck- (Docking System) ─────────────────────────────── */

/* Pin button — appears in panel corners on hover.
   Both .tp-panel and .vb-panel have position:relative so the button
   sits at their top-right corner via absolute positioning. */
.dck-pin-btn {
    position: absolute;
    top: 6px;
    right: 4px;
    width: 20px;
    height: 20px;
    border: none;
    background: transparent;
    cursor: pointer;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--app-radius-sm);
    color: var(--app-text-muted);
    transition: color 0.15s, background 0.15s, opacity 0.15s;
    opacity: 0;
    pointer-events: auto;
    z-index: 20;
}

.dck-pin-btn:hover {
    color: var(--app-accent);
    background: var(--app-violet-soft);
}

/* Inside gradient tp-header use white tones */
.tp-header .dck-pin-btn {
    color: rgba(255,255,255,0.65);
}
.tp-header .dck-pin-btn:hover {
    color: #ffffff;
    background: rgba(255,255,255,0.15);
}
.tp-header .dck-pin-btn--active {
    color: #ffffff !important;
}

/* Always visible when pinned */
.dck-pin-btn--active {
    color: var(--app-accent);
    opacity: 1 !important;
}

/* Reveal pin button on hover of parent panel */
.tp-panel:hover .dck-pin-btn,
.vb-panel:hover .dck-pin-btn {
    opacity: 1;
}

.dck-pin-btn svg {
    width: 12px;
    height: 12px;
    display: block;
    transition: transform 0.2s ease;
}

.dck-pin-btn--active svg {
    transform: rotate(45deg);
}

/* Placeholder wrappers inside the overlay — transparent to flex layout */
#dck-left-placeholder,
#dck-right-placeholder {
    display: contents;
}

/* Ensure tp-panel and vb-panel are positioned so the absolute pin btn works */
.tp-panel { position: relative; }
.vb-panel { position: relative; }
`;

export const VIEW_CUBE_STYLES = `

/* ── §05 §3 Prefix: vc- (View Cube HUD) ──────────────────────────────── */

.vc-root {
    position: fixed;
    top: 20px;
    right: 80px;
    width: 68px;
    height: 68px;
    perspective: 210px;
    z-index: 50;
    pointer-events: auto;
    user-select: none;
    transition: right 0.18s ease;
}

.vc-cube {
    width: 42px;
    height: 42px;
    margin: 13px auto;
    transform-style: preserve-3d;
    position: relative;
}

.vc-face {
    position: absolute;
    width: 42px;
    height: 42px;
    border: 1px solid rgba(102,0,255,0.22);
    background: rgba(102,0,255,0.10);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 7px;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--app-text);
    cursor: pointer;
    transition: background 0.12s, color 0.12s, border-color 0.12s;
    box-sizing: border-box;
    font-family: var(--app-font);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    border-radius: 2px;
}

.vc-face:hover {
    background: rgba(102,0,255,0.28);
    color: var(--app-accent);
}

/* Active face — lit up to indicate the current view */
.vc-face--active {
    background: rgba(102,0,255,0.45);
    border-color: rgba(102,0,255,0.80);
    color: #fff;
}

/* The bottom/3D-return face gets a subtly different tint */
.vc-face--bottom {
    background: rgba(102,0,255,0.06);
    font-size: 6px;
}

/* Face positions — half cube size = 21px */
.vc-face--top    { transform: rotateX( 90deg) translateZ(21px); }
.vc-face--bottom { transform: rotateX(-90deg) translateZ(21px); }
.vc-face--front  { transform: translateZ(21px); }
.vc-face--back   { transform: rotateY(180deg) translateZ(21px); }
.vc-face--left   { transform: rotateY(-90deg) translateZ(21px); }
.vc-face--right  { transform: rotateY( 90deg) translateZ(21px); }
`;
