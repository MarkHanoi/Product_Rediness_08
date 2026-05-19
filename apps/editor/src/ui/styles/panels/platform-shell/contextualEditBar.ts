/**
 * @file src/engine/subsystems/styles/panels/platform-shell/contextualEditBar.ts
 *
 * Contextual Edit Bar (Phase 7) — ceb- prefix.
 * CONTRACT §05 §2 — CSS layer only, zero logic.
 */
export const CEB_STYLES = `
    /* ─── Contextual Edit Bar shell ──────────────────────────────────── */
    .ceb-bar {
        position: fixed;
        top: 56px;
        left: 50%;
        transform: translateX(-50%) translateY(-8px);
        opacity: 0;
        pointer-events: none;
        transition:
            opacity 0.18s ease,
            transform 0.18s ease;
        z-index: 8990;
    }
    .ceb-bar--visible {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
        pointer-events: auto;
    }
    /* ── No background rectangle — ceb-inner is just a flex row ──────── */
    .ceb-inner {
        display: flex;
        align-items: center;
        gap: 6px;
        font-family: var(--app-font, -apple-system, sans-serif);
        font-size: 11px;
        white-space: nowrap;
    }
    /* Hide the element-type label and dividers (circular mode has no container) */
    .ceb-label {
        display: none;
    }
    .ceb-divider {
        display: none;
    }
    .ceb-divider--wall-only {
        display: none;
    }
    /* ── Independent circular action button (Phase 7) ─────────────────── */
    .ceb-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 30px;
        height: 30px;
        padding: 0;
        border: 1px solid var(--app-border, #dde3f0);
        border-radius: 50%;
        background: var(--app-panel-bg, #ffffff);
        box-shadow: var(--app-shadow-card, 0 2px 10px rgba(30,50,120,0.07), 0 1px 3px rgba(30,50,120,0.04));
        color: var(--app-text, #1a2035);
        cursor: pointer;
        transition: background 0.15s, box-shadow 0.15s, color 0.15s;
        flex-shrink: 0;
        outline: none;
    }
    .ceb-btn svg,
    .ceb-btn-icon {
        width: 14px;
        height: 14px;
        color: var(--app-text, #1a2035);
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: none;
        transition: color 0.15s;
    }
    .ceb-btn:hover {
        background: var(--app-violet-soft, rgba(102,0,255,0.08));
        box-shadow: var(--app-shadow-glow, 0 4px 16px rgba(102,0,255,0.40));
        border-color: rgba(102,0,255,0.20);
        color: var(--app-accent, #6600FF);
    }
    .ceb-btn:hover svg,
    .ceb-btn:hover .ceb-btn-icon {
        color: var(--app-accent, #6600FF);
    }
    .ceb-btn:active {
        transform: scale(0.93);
    }
    .ceb-btn:focus-visible {
        box-shadow: 0 0 0 2px var(--app-accent, #6600FF);
    }
    /* ── Danger (delete) button ────────────────────────────────────────── */
    .ceb-btn--danger svg,
    .ceb-btn--danger .ceb-btn-icon {
        color: #c62828;
    }
    .ceb-btn--danger:hover {
        background: #fff5f5;
        box-shadow: 0 4px 12px rgba(198,40,40,0.20);
        border-color: rgba(198,40,40,0.25);
    }
    .ceb-btn--danger:hover svg,
    .ceb-btn--danger:hover .ceb-btn-icon {
        color: #c62828;
    }
    /* ── Wall-only buttons ────────────────────────────────────────────── */
    .ceb-btn--wall-only {
        display: none;
    }
    .ceb-bar[data-element-type="wall"] .ceb-btn--wall-only {
        display: flex;
    }
    .ceb-btn-icon {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: none;
    }

    /* ── Custom tooltip (replaces native browser title) ───────────────── */
    /* Shows action label + styled <kbd> shortcut badge on hover.          */
    .ceb-btn[data-tooltip] {
        position: relative;
    }
    .ceb-btn[data-tooltip]::before,
    .ceb-btn[data-tooltip]::after {
        position: absolute;
        top: calc(100% + 8px);
        left: 50%;
        transform: translateX(-50%);
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.12s ease, transform 0.12s ease;
        z-index: 9100;
    }
    /* Label bubble */
    .ceb-btn[data-tooltip]::before {
        content: attr(data-tooltip);
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 4px 8px;
        background: #1a2035;
        color: #f0f4ff;
        font-family: var(--app-font, -apple-system, sans-serif);
        font-size: 11px;
        font-weight: 500;
        line-height: 1.4;
        border-radius: 6px;
        white-space: nowrap;
        box-shadow: 0 2px 8px rgba(0,0,0,0.28);
        transform: translateX(-50%) translateY(-2px);
    }
    /* Shortcut kbd badge — appended after the label via ::after           */
    .ceb-btn[data-shortcut]::after {
        content: attr(data-shortcut);
        top: calc(100% + 8px);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 2px 5px;
        background: rgba(255,255,255,0.12);
        color: #c8d0f0;
        font-family: var(--app-font-mono, ui-monospace, 'SF Mono', monospace);
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.02em;
        border: 1px solid rgba(255,255,255,0.18);
        border-radius: 4px;
        white-space: nowrap;
        box-shadow: 0 2px 8px rgba(0,0,0,0.28);
        /* offset right of label — overridden with left calc in JS via data */
        margin-left: 2px;
        transform: translateX(-50%) translateY(-2px);
    }
    .ceb-btn[data-tooltip]:hover::before,
    .ceb-btn[data-shortcut]:hover::after {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
    }
    /* When both label and shortcut exist, nudge them apart */
    .ceb-btn[data-tooltip][data-shortcut]::before {
        transform: translateX(calc(-50% - 18px)) translateY(-2px);
    }
    .ceb-btn[data-tooltip][data-shortcut]::after {
        transform: translateX(calc(-50% + 18px)) translateY(-2px);
    }
    .ceb-btn[data-tooltip][data-shortcut]:hover::before {
        transform: translateX(calc(-50% - 18px)) translateY(0);
    }
    .ceb-btn[data-tooltip][data-shortcut]:hover::after {
        transform: translateX(calc(-50% + 18px)) translateY(0);
    }

    /* ── Active operation button highlight ────────────────────────────── */
    .ceb-btn--active {
        background: var(--app-violet-soft, rgba(102,0,255,0.10));
        border-color: var(--app-accent, #6600FF);
        box-shadow: 0 0 0 2px rgba(102,0,255,0.25), var(--app-shadow-glow, 0 4px 16px rgba(102,0,255,0.40));
        color: var(--app-accent, #6600FF);
    }
    .ceb-btn--active svg,
    .ceb-btn--active .ceb-btn-icon {
        color: var(--app-accent, #6600FF);
    }

    /* ─── Toolbar inside left panel — override fixed positioning ─────── */
    /* When .plat-toolbar is a child of .plat-left-panel it must flow     */
    /* naturally (relative) instead of floating fixed at top of viewport. */
    .plat-left-panel .plat-toolbar {
        position: relative;
        top: unset;
        left: unset;
        transform: none;
        width: 100%;
        max-width: 100%;
        border-radius: 0;
        box-shadow: none;
        z-index: auto;
        background: var(--app-bg, #fff);
        backdrop-filter: none;
        border-bottom: 1px solid var(--app-border, #dde3f0);
        align-items: stretch;
    }
    .plat-left-panel .plat-toolbar-inner {
        flex-direction: column;
        height: auto;
        max-height: none;
        padding: 12px 14px 10px;
        gap: 10px;
        align-items: flex-start;
        white-space: normal;
    }
    /* Dividers become horizontal rules inside the vertical panel */
    .plat-left-panel .plat-toolbar-inner .plat-divider {
        width: 100%;
        height: 1px;
        align-self: stretch;
    }
    /* Mode switcher fills the panel width */
    .plat-left-panel .plat-mode-switcher {
        width: 100%;
    }
    .plat-left-panel .plat-mode-btn {
        flex: 1;
        justify-content: center;
    }
    /* Project name fills available width */
    .plat-left-panel .plat-project-name {
        max-width: 100%;
        width: 100%;
        box-sizing: border-box;
    }
    /* Hub button: show in a row with the logo prominent */
    .plat-left-panel .plat-hub-btn {
        align-self: flex-start;
    }
    /* Toggle strip acts as a thin separator at the bottom of the section */
    .plat-left-panel .plat-toolbar-toggle-strip {
        border-top: 1px solid var(--app-border, #dde3f0);
    }
`;




// ─── Owner Settings Panel (osp-) — Phase 10 ──────────────────────────────────
// CONTRACT §05 §3 — prefix osp- claimed (Owner Settings Panel)
// CONTRACT §05 §7.6 — no independent <style> injection; injected via injectAppTheme()
