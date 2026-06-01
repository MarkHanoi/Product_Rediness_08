/**
 * @file src/engine/subsystems/styles/panels/platform-shell/ownerSettingsPanel.ts
 *
 * Owner Settings Panel (Phase 10) — osp- prefix.
 * CONTRACT §05 §2 — CSS layer only, zero logic.
 */
export const OSP_STYLES = `
    /* ── Modal overlay ─────────────────────────────────────────────────── */
    .osp-overlay {
        position: fixed;
        inset: 0;
        z-index: 9999;
        background: rgba(26,32,53,0.50);
        backdrop-filter: blur(5px);
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .osp-panel {
        width: 480px;
        max-width: 94vw;
        max-height: 84vh;
        background: var(--app-panel-bg, #ffffff);
        border-radius: 14px;
        box-shadow: var(--app-shadow-card, 0 4px 32px rgba(30,50,120,0.14)), 0 0 0 1px var(--app-border, #dde3f0);
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }
    /* ── Gradient header ─────────────────────────────────────────────────── */
    .osp-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 18px 20px 16px;
        background: var(--app-gradient, linear-gradient(135deg, #6600FF 0%, #8B5CF6 100%));
        flex-shrink: 0;
    }
    .osp-header-inner {
        display: flex;
        align-items: center;
        gap: 10px;
    }
    .osp-header-icon { color: rgba(255,255,255,0.85); flex-shrink: 0; }
    .osp-header-title {
        font-family: var(--app-font, -apple-system, sans-serif);
        font-size: 15px;
        font-weight: 700;
        color: #ffffff;
        letter-spacing: -0.2px;
    }
    .osp-close {
        width: 30px;
        height: 30px;
        border-radius: 50%;
        background: rgba(255,255,255,0.15);
        border: none;
        color: rgba(255,255,255,0.85);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.15s;
        flex-shrink: 0;
    }
    .osp-close:hover { background: rgba(255,255,255,0.28); }
    /* ── Body ─────────────────────────────────────────────────────────────── */
    .osp-body {
        padding: 20px;
        overflow-y: auto;
        flex: 1;
    }
    .osp-desc {
        font-size: 12px;
        color: var(--app-text-muted, #7a8aaa);
        margin-bottom: 18px;
        line-height: 1.6;
    }
    /* ── Flag groups ───────────────────────────────────────────────────────── */
    .osp-group { margin-bottom: 20px; }
    .osp-group-label {
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.8px;
        color: var(--app-text-muted, #7a8aaa);
        margin-bottom: 6px;
    }
    .osp-toggle-row {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 14px;
        padding: 10px 0;
        border-bottom: 1px solid var(--app-border, #eef0f5);
        cursor: pointer;
    }
    .osp-toggle-row:last-child { border-bottom: none; }
    .osp-toggle-info { display: flex; flex-direction: column; gap: 3px; flex: 1; }
    .osp-toggle-label {
        font-size: 13px;
        font-weight: 600;
        color: var(--app-text, #1a2035);
    }
    .osp-toggle-desc {
        font-size: 11px;
        color: var(--app-text-muted, #7a8aaa);
        line-height: 1.5;
    }
    /* ── Toggle switch ─────────────────────────────────────────────────────── */
    .osp-toggle-switch {
        width: 40px;
        height: 22px;
        border-radius: 11px;
        background: var(--app-border, #dde3f0);
        flex-shrink: 0;
        position: relative;
        transition: background 0.18s;
        cursor: pointer;
        margin-top: 2px;
    }
    .osp-toggle-switch--on { background: var(--app-accent, #6600FF); }
    .osp-toggle-thumb {
        position: absolute;
        top: 3px;
        left: 3px;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: #ffffff;
        box-shadow: 0 1px 4px rgba(0,0,0,0.18);
        transition: left 0.18s;
    }
    .osp-toggle-switch--on .osp-toggle-thumb { left: 21px; }
    .osp-toggle-switch:focus-visible { box-shadow: 0 0 0 2px var(--app-accent, #6600FF); }
    /* ── Actions row ───────────────────────────────────────────────────────── */
    .osp-actions {
        display: flex;
        justify-content: flex-end;
        padding-top: 16px;
        border-top: 1px solid var(--app-border, #eef0f5);
        margin-top: 4px;
    }
    .osp-reset-btn {
        font-size: 12px;
        font-family: var(--app-font, -apple-system, sans-serif);
        padding: 6px 14px;
        background: transparent;
        border: 1px solid var(--app-border, #dde3f0);
        border-radius: 6px;
        color: var(--app-text-muted, #7a8aaa);
        cursor: pointer;
        transition: border-color 0.15s, color 0.15s;
    }
    .osp-reset-btn:hover {
        border-color: var(--app-accent, #6600FF);
        color: var(--app-accent, #6600FF);
    }
    /* ── Architectural Intent Tools section ─────────────────────────────────── */
    .osp-group--arch {
        background: rgba(102,0,255,0.05);
        border: 1px solid rgba(102,0,255,0.18);
        border-radius: 8px;
        padding: 14px 16px 12px;
    }
    .osp-arch-desc {
        font-size: 12px;
        color: var(--app-text-2, #4a5577);
        margin: 0 0 12px;
        line-height: 1.5;
    }
    .osp-arch-tools { display: flex; flex-direction: column; gap: 10px; }
    .osp-arch-tool {
        background: var(--app-surface, #fff);
        border: 1px solid var(--app-border, #e6e8f0);
        border-radius: 6px;
        padding: 10px 12px;
    }
    .osp-arch-tool-header {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 5px;
    }
    .osp-arch-tool-name {
        font-size: 12.5px;
        font-weight: 600;
        color: var(--app-text, #1a1d2e);
        flex: 1;
    }
    .osp-arch-tool-desc {
        font-size: 11.5px;
        color: var(--app-text-2, #4a5577);
        margin: 0;
        line-height: 1.45;
    }
    .osp-kbd {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 1px 5px;
        background: var(--app-bg, #f0f2f7);
        border: 1px solid var(--app-border, #d0d5e8);
        border-radius: 3px;
        font-family: monospace;
        font-size: 10px;
        color: var(--app-text, #1a1d2e);
        line-height: 1.6;
        font-style: normal;
    }
    .osp-arch-note {
        font-size: 11px;
        color: var(--app-text-3, #7b82a0);
        margin: 10px 0 0;
        font-style: italic;
    }
    /* ── ProjectHub Settings sidebar items ─────────────────────────────────── */
    .ph-settings-btn {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        padding: 8px 10px;
        border: none;
        border-radius: 6px;
        background: transparent;
        color: var(--app-text-2, #4a5577);
        font-size: 12.5px;
        font-family: var(--app-font, -apple-system, sans-serif);
        cursor: pointer;
        text-align: left;
        transition: background 0.13s, color 0.13s;
    }
    .ph-settings-btn:hover {
        background: var(--app-violet-soft, rgba(102,0,255,0.07));
        color: var(--app-accent, #6600FF);
    }
    .ph-settings-btn svg { flex-shrink: 0; }
    .ph-settings-btn--owner {
        color: var(--app-accent, #6600FF);
        font-weight: 600;
    }
    .ph-settings-btn--owner:hover {
        background: var(--app-violet-soft, rgba(102,0,255,0.07));
    }
    .ph-settings-btn--disabled {
        opacity: 0.45;
        cursor: default;
        pointer-events: none;
    }
    .ph-settings-divider {
        height: 1px;
        background: var(--app-border, #eef0f5);
        margin: 8px 0;
    }

    /* ─────────────────────────────────────────────────────────────────── */
    /* MOB-001-SC  Main 3D Scene Mobile Responsiveness                     */
    /* Contract: docs/05-guides/mobile/MOBILE_CONTRACT.md §2.3, §6                  */
    /* ─────────────────────────────────────────────────────────────────── */

    /* ─────────────────────────── @media ≤768px ─────────────────────────── */
    @media (max-width: 768px) {
        /* Toolbar: constrain width fully */
        .plat-toolbar {
            max-width: 100vw;
            width: calc(100% - 24px);
            left: 50%;
            transform: translateX(-50%);
        }
        .plat-toolbar-inner {
            gap: 4px;
            padding: 0 8px;
            height: 44px;
            max-height: 44px;
        }

        /* Hide non-essential toolbar items on mobile */
        .plat-status { display: none; }
        .plat-divider { display: none; }

        /* Project name input: compact */
        .plat-project-name {
            max-width: 70px;
            font-size: 11px;
        }

        /* All toolbar buttons: minimum 44px touch target */
        .plat-btn {
            min-height: 36px;
            padding: 6px 8px;
            font-size: 11px;
        }
        .plat-hub-btn {
            min-height: 36px;
            height: 36px;
        }
        .plat-mode-btn {
            min-height: 36px;
            padding: 4px 6px;
            font-size: 10px;
        }

        /* Toast: center-bottom, above iOS home indicator */
        .plat-toast {
            bottom: auto;
            top: auto;
            right: auto;
            bottom: calc(80px + env(safe-area-inset-bottom, 0px));
            left: 50%;
            transform: translateX(-50%);
            max-width: calc(100vw - 32px);
            width: max-content;
            text-align: center;
        }

        /* Hub dropdown: constrain width on mobile */
        .plat-hub-dropdown {
            min-width: 220px;
            max-width: calc(100vw - 24px);
            left: 12px;
        }

        /* Preview banner: compact on mobile */
        .plat-preview-banner {
            font-size: 11px;
            padding: 0 12px;
        }
        .plat-preview-banner-label {
            font-size: 11px;
        }
        .plat-preview-banner-btn {
            padding: 3px 8px;
            font-size: 10px;
        }

        /* Modal: full-screen on mobile */
        .plat-modal {
            width: calc(100vw - 24px);
            max-width: calc(100vw - 24px);
        }
    }

    /* ─────────────────────────── @media ≤480px ─────────────────────────── */
    @media (max-width: 480px) {
        /* Toolbar: even more compact */
        .plat-toolbar {
            width: calc(100% - 16px);
        }
        .plat-toolbar-inner { padding: 0 6px; gap: 3px; }

        /* Mode switcher: icon-only on very small screens */
        .plat-mode-btn span:not([class]) { display: none; }

        /* Hub dropdown: full-width */
        .plat-hub-dropdown {
            left: 8px;
            right: 8px;
            max-width: calc(100vw - 16px);
            min-width: 0;
        }

        /* Toast: edge to edge */
        .plat-toast {
            max-width: calc(100vw - 24px);
        }

        /* Preview banner: stack label + actions */
        .plat-preview-banner {
            flex-direction: column;
            height: auto;
            padding: 8px 12px;
            gap: 6px;
        }
        .plat-preview-banner-actions { justify-content: flex-end; }
    }
`;

// ─── Early Access Banner (eab-) — Phase 10 ────────────────────────────────────
// CONTRACT §05 §3 — prefix eab- claimed (Early Access Banner)
// CONTRACT §05 §7.6 — no independent <style> injection; injected via injectAppTheme()
