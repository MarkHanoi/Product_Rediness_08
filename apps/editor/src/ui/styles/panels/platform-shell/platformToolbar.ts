/**
 * @file src/engine/subsystems/styles/panels/platform-shell/platformToolbar.ts
 *
 * Platform toolbar — plat- prefix.
 * CONTRACT §05 §2 — CSS layer only, zero logic.
 */
export const PLATFORM_SHELL_STYLES = `
    /* ─── Platform Shell toolbar ─────────────────────────────────────── */
    .plat-toolbar {
        position: fixed;
        top: 0; left: 50%; transform: translateX(-50%);
        display: flex;
        flex-direction: column;
        align-items: center;
        max-width: 80vw;
        background: rgba(255,255,255,0.95);
        backdrop-filter: blur(12px);
        border-radius: 0 0 10px 10px;
        box-shadow: 0 2px 16px rgba(30,50,120,0.14);
        z-index: 9000;
        font-family: var(--app-font, -apple-system, sans-serif);
        font-size: 12px;
        color: var(--app-text, #1a2035);
        pointer-events: auto;
        overflow: visible;
    }
    /* ─── Inner content row (collapsible) ───────────────────────────── */
    .plat-toolbar-inner {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 0 12px;
        height: 36px;
        max-height: 36px;
        opacity: 1;
        overflow: hidden;
        transition:
            max-height 0.22s ease,
            opacity 0.18s ease,
            padding 0.18s ease;
        width: 100%;
        box-sizing: border-box;
        white-space: nowrap;
    }
    .plat-toolbar--collapsed .plat-toolbar-inner {
        max-height: 0;
        opacity: 0;
        padding-top: 0;
        padding-bottom: 0;
    }

    /* ── Workspace mode switcher (Phase 1) ───────────────────────────── */
    /* CSS prefix: wsc- reserved for WorkspaceController.ts              */
    .plat-mode-switcher {
        display: flex;
        align-items: center;
        gap: 2px;
        background: #f0f2f8;
        border-radius: 7px;
        padding: 2px;
        flex-shrink: 0;
    }
    .plat-mode-btn {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 3px 8px;
        border: none;
        border-radius: 5px;
        background: transparent;
        color: var(--app-text-muted, #7a8aaa);
        font-size: 11px;
        font-weight: 600;
        font-family: var(--app-font);
        cursor: pointer;
        transition: background 0.14s, color 0.14s;
        white-space: nowrap;
        flex-shrink: 0;
    }
    .plat-mode-btn:hover {
        background: rgba(102,0,255,0.07);
        color: var(--app-accent, #6600FF);
    }
    .plat-mode-btn[data-active="true"] {
        background: var(--app-gradient, linear-gradient(135deg,#8B5CF6,#6600FF));
        color: #fff;
        box-shadow: 0 1px 6px rgba(102,0,255,0.25);
    }
    .plat-mode-btn svg {
        width: 12px;
        height: 12px;
        flex-shrink: 0;
        opacity: 0.8;
    }
    .plat-mode-btn[data-active="true"] svg {
        opacity: 1;
    }
    /* ─── Toggle strip — Phase 5.4: hidden; strip removed from DOM ──── */
    .plat-toolbar-toggle-strip {
        display: none;
        height: 0;
    }
    .plat-toolbar-toggle-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 16px;
        border: none;
        background: transparent;
        cursor: pointer;
        color: var(--app-text-muted, #7a8aaa);
        border-radius: 4px;
        transition: background 0.14s ease, color 0.14s ease;
        flex-shrink: 0;
        padding: 0;
    }
    .plat-toolbar-toggle-btn:hover {
        background: rgba(102,0,255,0.08);
        color: var(--app-accent, #6600FF);
    }
    .plat-toolbar-toggle-btn svg {
        transition: transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    /* When expanded, flip chevron to point up */
    .plat-toolbar:not(.plat-toolbar--collapsed) .plat-toolbar-toggle-btn svg {
        transform: rotate(180deg);
    }
    .plat-toolbar-brand {
        font-weight: 700;
        font-size: 13px;
        background: var(--app-gradient, linear-gradient(135deg, #8B5CF6 0%, #6600FF 100%));
        -webkit-background-clip: text; -webkit-text-fill-color: transparent;
        letter-spacing: -0.3px;
        margin-right: 4px;
    }
    .plat-project-name {
        font-weight: 600; color: var(--app-text, #1a2035);
        cursor: pointer; padding: 4px 6px;
        border-radius: 6px; border: 1.5px solid transparent;
        background: transparent; font-size: 12px; font-family: var(--app-font);
        max-width: 90px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        transition: border-color 0.15s;
    }
    .plat-project-name:hover { border-color: var(--app-border, #dde3f0); }
    .plat-project-name:focus { outline: none; border-color: var(--app-accent, #8B5CF6); }
    .plat-divider { width: 1px; height: 20px; background: var(--app-border, #dde3f0); }
    .plat-btn {
        display: flex; align-items: center; gap: 4px;
        padding: 5px 10px; border: none; border-radius: 6px;
        font-size: 11.5px; font-weight: 600; cursor: pointer;
        font-family: var(--app-font); transition: all 0.15s; white-space: nowrap;
    }
    .plat-btn-primary {
        background: var(--app-gradient, linear-gradient(135deg,#8B5CF6,#6600FF));
        color: #fff; box-shadow: 0 2px 8px rgba(139,92,246,0.3);
    }
    .plat-btn-primary:hover { opacity: 0.9; transform: translateY(-1px); }
    .plat-btn-secondary {
        background: #f0f2f8; color: var(--app-text, #1a2035);
    }
    .plat-btn-secondary:hover { background: #e4e8f0; }
    .plat-btn:disabled,
    .plat-btn:disabled:hover { opacity: 0.5; cursor: not-allowed; transform: none; }
    .plat-status {
        font-size: 11px; color: var(--app-text-muted, #7a8aaa);
        display: flex; align-items: center; gap: 4px;
    }
    .plat-status-dot {
        width: 6px; height: 6px; border-radius: 50%;
        background: #4caf50; transition: background 0.3s;
    }
    .plat-status-dot.dirty  { background: #ff9800; }
    .plat-status-dot.error  { background: #e53935; }
    .plat-status-dot.paused { background: #ab86d8; }

    /* ─── Modal overlay ──────────────────────────────────────────────── */
    .plat-overlay {
        position: fixed; inset: 0;
        background: rgba(15,20,40,0.5);
        backdrop-filter: blur(6px);
        z-index: 9900;
        display: flex; align-items: center; justify-content: center;
        animation: plat-fade-in 0.2s ease;
    }
    @keyframes plat-fade-in { from { opacity: 0; } to { opacity: 1; } }

    /* ─── Modal card ─────────────────────────────────────────────────── */
    .plat-modal {
        background: #fff;
        border-radius: 16px;
        box-shadow: 0 20px 60px rgba(30,50,120,0.2);
        width: 520px; max-width: 95vw;
        max-height: 80vh;
        display: flex; flex-direction: column;
        animation: plat-slide-up 0.25s ease;
        overflow: hidden;
    }
    @keyframes plat-slide-up {
        from { opacity: 0; transform: translateY(24px); }
        to { opacity: 1; transform: translateY(0); }
    }
    .plat-modal-header {
        background: var(--app-gradient, linear-gradient(135deg,#8B5CF6,#6600FF));
        padding: 16px 20px;
        display: flex; align-items: center; justify-content: space-between;
    }
    .plat-modal-header--light {
        background: #fff;
        border-bottom: 1px solid #eef0f6;
        padding: 16px 20px;
        display: flex; align-items: center; justify-content: space-between;
    }
    .plat-modal-header-left { display: flex; align-items: center; gap: 9px; color: #1a2035; }
    .plat-modal-title { font-weight: 700; font-size: 15px; color: #fff; }
    .plat-modal-title--dark { font-weight: 700; font-size: 15px; color: #1a2035; }
    .plat-modal-close {
        background: rgba(255,255,255,0.2); border: none; color: #fff;
        width: 28px; height: 28px; border-radius: 50%; cursor: pointer;
        font-size: 16px; display: flex; align-items: center; justify-content: center;
        transition: background 0.15s;
    }
    .plat-modal-close:hover { background: rgba(255,255,255,0.35); }
    .plat-modal-close--dark {
        background: none; border: none; color: #7a8aaa;
        width: 28px; height: 28px; border-radius: 50%; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        transition: background 0.15s, color 0.15s;
    }
    .plat-modal-close--dark:hover { background: #f0f2f8; color: #1a2035; }
    .plat-modal-body { padding: 20px; overflow-y: auto; flex: 1; }

    /* ─── Form elements ──────────────────────────────────────────────── */
    .plat-field { margin-bottom: 14px; }
    .plat-label { font-size: 11px; font-weight: 600; color: var(--app-text-2, #5a6a85); margin-bottom: 4px; display: block; text-transform: uppercase; letter-spacing: 0.5px; }
    .plat-input {
        width: 100%; box-sizing: border-box;
        padding: 8px 12px; border: 1.5px solid var(--app-border, #dde3f0);
        border-radius: 8px; font-size: 13px; font-family: var(--app-font);
        color: var(--app-text, #1a2035); background: #fafbff;
        transition: border-color 0.15s;
    }
    .plat-input:focus { outline: none; border-color: var(--app-accent, #8B5CF6); }

    /* ─── Version list ───────────────────────────────────────────────── */
    .plat-version-list { display: flex; flex-direction: column; gap: 6px; }
    .plat-version-item {
        display: flex; align-items: center; gap: 12px;
        padding: 10px 14px; border-radius: 10px;
        border: 1px solid #eef0f6;
        transition: all 0.15s;
        background: #fff;
    }
    .plat-version-item:hover { border-color: #d0d4e8; background: #fafbff; }
    .plat-version-item--latest {
        border-color: #1a2035;
        background: #fafbff;
    }
    .plat-version-item--latest:hover { border-color: #3a4060; background: #f4f5fa; }
    .plat-version-icon { font-size: 20px; flex-shrink: 0; }
    .plat-version-icon--svg {
        width: 30px; height: 30px; border-radius: 8px;
        background: #f0f2f8; display: flex; align-items: center; justify-content: center;
        flex-shrink: 0; color: #5a6a85;
    }
    .plat-version-icon--warn { background: #fff8f0; color: #c45c00; }
    .plat-version-info { flex: 1; min-width: 0; }
    .plat-version-label {
        font-weight: 600; font-size: 13px; color: #1a2035;
        display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
    }
    .plat-version-latest-badge {
        font-size: 10px; font-weight: 700; letter-spacing: 0.04em;
        background: var(--app-gradient); color: #fff;
        padding: 1px 7px; border-radius: 99px;
        text-transform: uppercase;
    }
    .plat-version-meta { font-size: 11px; color: #7a8aaa; margin-top: 3px; }
    .plat-version-actions { display: flex; align-items: center; gap: 5px; flex-shrink: 0; }
    .plat-version-load-btn {
        padding: 5px 12px; border: none; border-radius: 7px; font-size: 11px;
        font-weight: 700; cursor: pointer; background: var(--app-gradient);
        color: #fff; font-family: var(--app-font); transition: opacity 0.15s;
        letter-spacing: 0.02em; box-shadow: var(--app-shadow-glow);
    }
    .plat-version-load-btn:hover { opacity: 0.82; }
    .plat-version-delete-btn {
        width: 26px; height: 26px; display: flex; align-items: center; justify-content: center;
        border: 1px solid #eef0f6; border-radius: 6px; font-size: 11px;
        cursor: pointer; background: #fff; color: #7a8aaa; font-family: var(--app-font);
        transition: all 0.15s; flex-shrink: 0;
    }
    .plat-version-delete-btn:hover { background: #fff0f0; border-color: #e0b0b0; color: #c00; }
    /* Phase 2 — sync status badges inside version list */
    .plat-sync-badge {
        display: inline-block; font-size: 10px; font-weight: 600;
        padding: 1px 6px; border-radius: 4px; margin-left: 6px;
        vertical-align: middle; letter-spacing: 0.01em;
    }
    .plat-sync-local   { background: #fff3cd; color: #856404; border: 1px solid #ffe082; }
    .plat-sync-pending { background: #e3f2fd; color: #1565c0; border: 1px solid #90caf9; }
    .plat-sync-done    { background: #e8f5e9; color: #2e7d32; border: 1px solid #a5d6a7; }
    .plat-empty { text-align: center; padding: 32px 16px; color: var(--app-text-muted, #7a8aaa); display: flex; flex-direction: column; align-items: center; }
    .plat-modal-footer {
        padding: 14px 20px; border-top: 1px solid var(--app-border, #dde3f0);
        display: flex; justify-content: flex-end; gap: 8px; background: #fafbff;
    }
    .plat-modal-footer--history {
        padding: 12px 20px; border-top: 1px solid #eef0f6;
        display: flex; align-items: center; justify-content: space-between; background: #fff;
    }
    .plat-modal-footer-left { display: flex; align-items: center; gap: 8px; }
    .plat-hist-action-btn {
        display: flex; align-items: center; gap: 6px;
        padding: 6px 12px; border: 1px solid #dde3f0; border-radius: 7px;
        background: #fff; color: #5a6a85; font-size: 12px; font-weight: 500;
        cursor: pointer; font-family: var(--app-font); transition: all 0.15s;
    }
    .plat-hist-action-btn:hover { background: #f4f5fa; border-color: #c0c8dc; color: #1a2035; }
    .plat-hist-close-btn {
        padding: 6px 16px; border: none; border-radius: 7px;
        background: #f0f2f8; color: #5a6a85; font-size: 12px; font-weight: 600;
        cursor: pointer; font-family: var(--app-font); transition: all 0.15s;
    }
    .plat-hist-close-btn:hover { background: #e4e7f2; color: #1a2035; }
    .plat-toast {
        position: fixed; bottom: 24px; right: 24px;
        background: var(--app-panel-bg); color: var(--app-text); border-radius: 10px;
        border: 1px solid var(--app-border); border-left: 3px solid var(--app-accent);
        padding: 10px 16px; font-size: 12.5px; z-index: 99999;
        animation: plat-fade-in 0.2s ease;
        box-shadow: var(--app-shadow-panel);
        max-width: 300px; pointer-events: none;
    }
    .plat-toast.success { border-left-color: var(--app-status-success); color: var(--app-text); }
    .plat-toast.error   { border-left-color: var(--app-status-error); color: var(--app-text); }
    .plat-loading {
        display: flex; align-items: center; justify-content: center;
        gap: 10px; padding: 24px; color: var(--app-text-muted, #7a8aaa);
        font-size: 13px;
    }
    .plat-spinner {
        width: 18px; height: 18px; border: 2px solid #e0e4f0;
        border-top-color: var(--app-accent, #8B5CF6); border-radius: 50%;
        animation: plat-spin 0.8s linear infinite;
    }
    @keyframes plat-spin { to { transform: rotate(360deg); } }

    /* ─── Phase 4 — Version Preview Banner ──────────────────────────── */
    .plat-preview-banner {
        position: fixed;
        top: 40px; left: 0; right: 0;
        height: 36px;
        background: linear-gradient(90deg, #b45309 0%, #92400e 100%);
        color: #fff;
        display: flex; align-items: center; justify-content: space-between;
        padding: 0 16px; gap: 12px;
        z-index: 8900;
        font-family: var(--app-font, -apple-system, sans-serif);
        font-size: 12px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.25);
        animation: plat-fade-in 0.2s ease;
    }
    .plat-preview-banner-label {
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        flex: 1;
        letter-spacing: 0.1px;
    }
    .plat-preview-banner-actions {
        display: flex; align-items: center; gap: 6px; flex-shrink: 0;
    }
    .plat-preview-banner-btn {
        padding: 3px 10px; border-radius: 5px; border: none;
        font-size: 11px; font-weight: 600; cursor: pointer;
        font-family: var(--app-font); transition: all 0.15s;
        white-space: nowrap;
    }
    .plat-preview-banner-btn-restore {
        background: rgba(255,255,255,0.25); color: #fff;
    }
    .plat-preview-banner-btn-restore:hover { background: rgba(255,255,255,0.38); }
    .plat-preview-banner-btn-promote {
        background: #fff; color: #92400e;
    }
    .plat-preview-banner-btn-promote:hover { background: #fef3c7; }

    /* ─── Phase 4 — Version Preview button in version list ──────────── */
    .plat-version-preview-btn {
        display: flex; align-items: center; gap: 5px;
        padding: 5px 10px; border-radius: 7px; border: 1px solid #dde3f0;
        background: #fff; color: #5a6a85;
        font-size: 11px; font-weight: 600; cursor: pointer;
        font-family: var(--app-font); transition: all 0.15s; white-space: nowrap;
    }
    .plat-version-preview-btn:hover { background: #f4f5fa; border-color: #c0c8dc; color: #1a2035; }

    /* ─── Hub-menu button (inline in toolbar, leftmost item) ─────────── */
    .plat-hub-btn {
        display: flex; align-items: center; gap: 5px;
        height: 28px; padding: 0 8px 0 4px;
        background: transparent;
        border: 1.5px solid transparent;
        border-radius: 8px;
        cursor: pointer;
        font-family: var(--app-font,-apple-system,sans-serif);
        flex-shrink: 0;
        transition: background 0.15s, border-color 0.15s;
    }
    .plat-hub-btn:hover {
        background: rgba(102,0,255,0.07);
        border-color: rgba(102,0,255,0.22);
    }
    .plat-hub-btn--open {
        background: rgba(102,0,255,0.10);
        border-color: rgba(102,0,255,0.30);
    }
    .plat-hub-btn-logo {
        width: 22px; height: 22px; object-fit: contain; flex-shrink: 0;
    }
    .plat-hub-btn-text {
        width: 54px; height: 14px; object-fit: contain; flex-shrink: 0; opacity: 0.88;
    }
    .plat-hub-btn-chevron {
        width: 12px; height: 12px; opacity: 0.5; flex-shrink: 0;
        transition: transform 0.2s;
    }
    .plat-hub-btn--open .plat-hub-btn-chevron { transform: rotate(180deg); }

    /* ─── Hub-menu dropdown ──────────────────────────────────────────── */
    .plat-hub-dropdown {
        position: fixed;
        top: 52px; left: 0; right: auto;
        min-width: 240px;
        background: #fff;
        border: 1.5px solid rgba(102,0,255,0.13);
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(30,50,120,0.16), 0 2px 8px rgba(102,0,255,0.1);
        z-index: 9101;
        padding: 6px 0 4px;
        font-family: var(--app-font,-apple-system,sans-serif);
        animation: plat-hub-drop-in 0.16s ease;
        overflow: hidden;
        max-height: calc(100vh - 80px);
        overflow-y: auto;
    }
    @keyframes plat-hub-drop-in {
        from { opacity:0; transform:translateY(-6px); }
        to   { opacity:1; transform:translateY(0); }
    }
    /* ── Foldable section header ─────────────────────────────────── */
    .plat-hub-section-hdr {
        display: flex; align-items: center; gap: 6px;
        padding: 6px 12px 4px;
        width: 100%; border: none; background: none;
        cursor: pointer; text-align: left;
        font-family: var(--app-font);
        transition: background 0.12s;
    }
    .plat-hub-section-hdr:hover { background: rgba(102,0,255,0.04); }
    .plat-hub-section-hdr-label {
        flex: 1;
        font-size: 10px; font-weight: 700; letter-spacing: 0.06em;
        color: rgba(26,32,53,0.45); text-transform: uppercase;
    }
    .plat-hub-section-chevron {
        width: 12px; height: 12px; flex-shrink: 0;
        color: rgba(26,32,53,0.3);
        transition: transform 0.18s ease;
    }
    .plat-hub-section-hdr[aria-expanded="true"] .plat-hub-section-chevron {
        transform: rotate(180deg);
    }
    /* ── Foldable section body ───────────────────────────────────── */
    .plat-hub-section-body {
        overflow: hidden;
        max-height: 0;
        transition: max-height 0.22s ease;
    }
    .plat-hub-section-body--open {
        max-height: 400px;
    }
    .plat-hub-menu-item {
        display: flex; align-items: center; gap: 10px;
        padding: 8px 16px;
        font-size: 13px; color: var(--app-text,#1a2035);
        cursor: pointer; border: none; background: none;
        width: 100%; text-align: left;
        font-family: var(--app-font); transition: background 0.12s;
    }
    .plat-hub-menu-item:hover { background: rgba(102,0,255,0.05); }
    .plat-hub-menu-item svg { flex-shrink: 0; opacity: 0.6; }
    .plat-hub-menu-item--primary { color: var(--app-accent,#6600FF); font-weight: 600; }
    .plat-hub-menu-item--primary svg { opacity: 1; }
    .plat-hub-menu-item--danger { color: #dc2626; }
    .plat-hub-menu-item--danger:hover { background: rgba(220,38,38,0.05); }
    .plat-hub-menu-divider { height: 1px; background: var(--app-border,#dde3f0); margin: 4px 0; }
    .plat-hub-menu-badge {
        margin-left: auto; font-size: 10px; font-weight: 700;
        padding: 1px 6px; border-radius: 8px;
        background: rgba(102,0,255,0.1); color: var(--app-accent,#6600FF);
    }
    /* ── Settings toggle row ─────────────────────────────────────── */
    .plat-hub-toggle-row {
        display: flex; align-items: center; gap: 10px;
        padding: 7px 16px;
        font-size: 12.5px; color: var(--app-text,#1a2035);
        font-family: var(--app-font);
        cursor: pointer;
        transition: background 0.12s;
    }
    .plat-hub-toggle-row:hover { background: rgba(102,0,255,0.05); }
    .plat-hub-toggle-row-label { flex: 1; }
    .plat-hub-toggle {
        position: relative; width: 30px; height: 16px; flex-shrink: 0;
    }
    .plat-hub-toggle input { opacity: 0; width: 0; height: 0; position: absolute; }
    .plat-hub-toggle-track {
        position: absolute; inset: 0;
        background: #dde3f0; border-radius: 16px;
        transition: background 0.18s;
        cursor: pointer;
    }
    .plat-hub-toggle-track::after {
        content: ''; position: absolute;
        left: 2px; top: 2px;
        width: 12px; height: 12px;
        border-radius: 50%; background: #fff;
        transition: transform 0.18s;
        box-shadow: 0 1px 3px rgba(0,0,0,0.18);
    }
    .plat-hub-toggle input:checked + .plat-hub-toggle-track { background: var(--app-accent,#6600FF); }
    .plat-hub-toggle input:checked + .plat-hub-toggle-track::after { transform: translateX(14px); }
`;

/**
 * WorkspaceModeBar (wmb- prefix) — top-of-scene Author/Inspect/Data pill.
 * Used by src/ui/platform/WorkspaceModeBar.ts
 */
