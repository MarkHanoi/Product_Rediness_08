/**
 * @file src/styles/panels/leftNavRail.ts
 *
 * CSS for the Left Navigation Rail — Phase 2 of PRYZM UI Architecture V2
 *
 * Prefix: lnr-  (claimed in §3 of 05-BIM-UI-ARCHITECTURE-CONTRACT.md, 2026-04-04)
 * Contract: §05 §2.1 — CSS lives here, registered via injectAppTheme()
 *           §05 §3   — Prefix lnr- is unique, no collision with any other panel
 *           §05 §7.6 — No independent <style> injection
 */

export const LEFT_NAV_RAIL_STYLES = `

/* ── Left Navigation Rail (lnr-) ──────────────────────────────────────────── */

.lnr-rail {
    display: flex;
    flex-direction: row;
    height: 100%;
    pointer-events: auto;
    flex-shrink: 0;
    position: relative;
}

/* ── Icon spine (always 48px) ─────────────────────────────────────────────── */

.lnr-spine {
    width: 48px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    background: #16182a;
    border-right: 1px solid rgba(255,255,255,0.07);
    padding-top: 5px;
    padding-bottom: 5px;
    gap: 2px;
    overflow: hidden;
}

.lnr-icon-btn {
    width: 38px;
    height: 38px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    color: rgba(255,255,255,0.45);
    cursor: pointer;
    border-radius: 8px;
    transition: background 0.15s, color 0.15s;
    flex-shrink: 0;
    position: relative;
}

.lnr-icon-btn:hover {
    background: rgba(255,255,255,0.09);
    color: rgba(255,255,255,0.85);
}

.lnr-icon-btn--active {
    background: rgba(139,92,246,0.22);
    color: #a78bfa;
}

.lnr-icon-btn svg {
    display: block;
    width: 19px;
    height: 19px;
    flex-shrink: 0;
}

.lnr-icon-btn img {
    display: block;
    width: 19px;
    height: 19px;
    object-fit: contain;
    flex-shrink: 0;
}

.lnr-separator {
    width: 26px;
    height: 1px;
    background: rgba(255,255,255,0.1);
    margin: 4px 11px;
    flex-shrink: 0;
}

.lnr-spine-spacer {
    flex: 1;
}

/* Tooltip on hover */
.lnr-icon-btn[title]:hover::after {
    content: attr(title);
    position: absolute;
    left: calc(100% + 8px);
    top: 50%;
    transform: translateY(-50%);
    background: #1a1d2e;
    color: rgba(255,255,255,0.9);
    font-size: 11px;
    font-weight: 500;
    padding: 4px 8px;
    border-radius: 5px;
    white-space: nowrap;
    z-index: 9999;
    pointer-events: none;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}

/* ── Content panel ─────────────────────────────────────────────────────────── */

.lnr-content {
    display: flex;
    flex-direction: row;
    flex-shrink: 0;
    overflow: hidden;
    position: relative;
    background: var(--app-bg, #e8edf6);
    transition: width 0.18s cubic-bezier(0.4,0,0.2,1);
    border-right: 1px solid rgba(0,0,0,0.07);
}

.lnr-content-inner {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    scrollbar-width: thin;
    scrollbar-color: #c4cde0 transparent;
}
.lnr-content-inner::-webkit-scrollbar { width: 4px; }
.lnr-content-inner::-webkit-scrollbar-track { background: transparent; }
.lnr-content-inner::-webkit-scrollbar-thumb { background: #c4cde0; border-radius: 2px; }

/* Panel title bar at top of content area */
.lnr-panel-header {
    padding: 8px 11px 6px;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    color: var(--app-text-2, #5a6a85);
    border-bottom: 1px solid rgba(0,0,0,0.08);
    flex-shrink: 0;
    user-select: none;
    background: var(--app-bg, #e8edf6);
    display: flex;
    align-items: center;
    gap: 6px;
}

/* ── Section cards inside content ─────────────────────────────────────────── */

.lnr-section {
    margin: 7px 7px 0;
    background: var(--app-panel-bg, #fff);
    border-radius: 8px;
    overflow: hidden;
    flex-shrink: 0;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
}

.lnr-section:last-of-type {
    margin-bottom: 7px;
}

.lnr-section-header {
    display: flex;
    align-items: center;
    padding: 7px 9px;
    font-size: 9.9px;
    font-weight: 600;
    color: var(--app-text, #1a2035);
    cursor: pointer;
    user-select: none;
    gap: 6px;
    background: none;
    border: none;
    width: 100%;
    text-align: left;
    border-bottom: 1px solid rgba(0,0,0,0.06);
}

.lnr-section-header:hover {
    background: rgba(0,0,0,0.02);
}

.lnr-section-toggle {
    margin-left: auto;
    font-size: 10px;
    opacity: 0.5;
    transition: transform 0.15s;
}

.lnr-section-toggle--open {
    transform: rotate(180deg);
}

.lnr-section-body {
    padding: 4px 5px 5px;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.lnr-section-body--hidden {
    display: none;
}

/* ── Row items ─────────────────────────────────────────────────────────────── */

.lnr-row {
    display: flex;
    align-items: center;
    padding: 5px 6px;
    border-radius: 5px;
    gap: 6px;
    font-size: 10.8px;
    color: var(--app-text, #1a2035);
    cursor: pointer;
    user-select: none;
    transition: background 0.1s;
}

.lnr-row:hover {
    background: rgba(0,0,0,0.04);
}

.lnr-row--active {
    background: rgba(139,92,246,0.09);
    color: #7c3aed;
    font-weight: 600;
}

.lnr-row-icon {
    width: 15px;
    height: 15px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    opacity: 0.65;
}

.lnr-row-label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.lnr-row-badge {
    font-size: 9px;
    font-weight: 600;
    padding: 1px 5px;
    background: rgba(139,92,246,0.15);
    color: #7c3aed;
    border-radius: 8px;
}

/* ── Empty state ──────────────────────────────────────────────────────────── */

.lnr-empty {
    padding: 18px 12px;
    font-size: 11px;
    color: var(--app-text-muted, #7a8aaa);
    text-align: center;
    line-height: 1.5;
}

/* ── Action button ─────────────────────────────────────────────────────────── */

.lnr-btn {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 7px 10px;
    border: 1.5px solid rgba(139,92,246,0.5);
    background: transparent;
    color: #7c3aed;
    font-size: 11px;
    font-weight: 600;
    border-radius: 7px;
    cursor: pointer;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
    width: 100%;
    text-align: left;
    margin: 4px 0;
}

.lnr-btn:hover {
    background: #7c3aed;
    color: #fff;
    border-color: #7c3aed;
}

.lnr-btn svg {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
}

/* ── Resize handle on right edge ──────────────────────────────────────────── */

.lnr-resize-handle {
    width: 4px;
    flex-shrink: 0;
    cursor: col-resize;
    background: transparent;
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    z-index: 2;
    transition: background 0.15s;
}

.lnr-resize-handle:hover {
    background: rgba(139,92,246,0.35);
}

/* ── Stub panels (History/Settings) ──────────────────────────────────────── */

.lnr-stub {
    padding: 16px 12px;
    font-size: 11px;
    color: var(--app-text-muted, #7a8aaa);
    line-height: 1.5;
}

/* ── Level rows (MODEL panel) ─────────────────────────────────────────────── */

.lnr-level-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--app-violet-1, #8B5CF6);
    opacity: 0.7;
    flex-shrink: 0;
}

.lnr-level-active-badge {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.05em;
    padding: 1px 5px;
    background: rgba(29,158,117,0.15);
    color: #1D9E75;
    border-radius: 6px;
}

/* ── Existing Projects list (ep-) — Phase 2 palette pending ─────────────── */
.ep-wrap { display: flex; flex-direction: column; gap: 4px; padding: 4px 2px; }
.ep-item {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 5px 6px;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.15s;
    pointer-events: auto;
}
.ep-item:hover { background: rgba(255,255,255,0.07); }
.ep-item--active { background: rgba(102,0,255,0.15); }
.ep-item--active .ep-name { color: var(--app-violet-1); }
.ep-avatar {
    flex-shrink: 0;
    width: 26px; height: 26px;
    border-radius: 6px;
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 700; color: #fff;
    text-transform: uppercase;
}
.ep-info { flex: 1; min-width: 0; }
.ep-name {
    font-size: 0.7rem;
    font-weight: 600;
    color: #ddd;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.3;
}
.ep-meta {
    font-size: 0.58rem;
    color: #888;
    margin-top: 1px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.ep-open-btn {
    flex-shrink: 0;
    padding: 2px 6px;
    font-size: 0.58rem;
    font-weight: 600;
    border: 1px solid rgba(255,255,255,0.15);
    background: transparent;
    color: #888;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s;
    pointer-events: auto;
}
.ep-open-btn:hover { border-color: var(--app-accent); color: var(--app-violet-1); background: rgba(102,0,255,0.12); }
.ep-empty {
    font-size: 0.65rem;
    color: #666;
    text-align: center;
    padding: 12px 4px;
    line-height: 1.5;
}
.ep-hub-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    width: 100%;
    margin-top: 4px;
    padding: 5px 6px;
    font-size: 0.62rem;
    font-weight: 600;
    color: #888;
    background: transparent;
    border: 1px dashed rgba(255,255,255,0.12);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s;
    pointer-events: auto;
}
.ep-hub-btn:hover { border-color: var(--app-accent); color: var(--app-violet-1); }
`;
