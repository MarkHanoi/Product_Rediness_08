/**
 * @file src/styles/panels/importManager.ts
 * CSS for the Import Manager Panel.
 *
 * CSS prefix: im-
 * Contract 32 — IMPORT-MANAGER-CONTRACT
 * §05 §3 — prefix claimed: im- / ImportManagerPanel / src/ui/import-manager/ImportManagerPanel.ts
 */

export const IMPORT_MANAGER_STYLES = `
    .im-panel {
        position: fixed;
        right: 72px;
        top: 80px;
        width: 320px;
        max-height: min(420px, calc(100vh - 100px));
        display: flex;
        flex-direction: column;
        background: rgba(13, 18, 30, 0.97);
        color: #fff;
        border: 1px solid rgba(102, 0, 255, 0.38);
        border-radius: 12px;
        box-shadow: 0 18px 54px rgba(0,0,0,0.4), 0 0 0 1px rgba(102,0,255,0.12);
        overflow: hidden;
        backdrop-filter: blur(16px);
        z-index: 8500;
        font-family: var(--app-font);
    }
    .im-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 9px 12px;
        background: linear-gradient(135deg, #8B5CF6 0%, #6600FF 100%);
        flex-shrink: 0;
        cursor: grab;
        user-select: none;
    }
    .im-header.im-header--dragging {
        cursor: grabbing;
    }
    .im-header-left {
        display: flex;
        align-items: center;
        gap: 7px;
    }
    .im-title {
        font-size: 11.5px;
        font-weight: 800;
        letter-spacing: 0.04em;
        text-transform: uppercase;
    }
    .im-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 16px;
        height: 16px;
        padding: 0 5px;
        border-radius: 8px;
        background: rgba(255,255,255,0.25);
        font-size: 10px;
        font-weight: 800;
    }
    .im-close {
        display: grid;
        place-items: center;
        width: 22px;
        height: 22px;
        border-radius: 6px;
        border: 1px solid rgba(255,255,255,0.22);
        background: rgba(255,255,255,0.1);
        color: #fff;
        font-size: 14px;
        cursor: pointer;
        line-height: 1;
        padding: 0;
    }
    .im-close:hover {
        background: rgba(255,255,255,0.22);
    }
    .im-body {
        overflow-y: auto;
        padding: 8px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        flex: 1;
        scrollbar-width: thin;
        scrollbar-color: #3a2a6a transparent;
    }
    .im-empty {
        text-align: center;
        padding: 20px 12px 24px;
    }
    .im-empty-icon {
        font-size: 24px;
        margin-bottom: 8px;
        opacity: 0.7;
    }
    .im-empty-title {
        font-size: 12px;
        font-weight: 800;
        margin-bottom: 4px;
    }
    .im-empty-text {
        font-size: 10px;
        color: rgba(255,255,255,0.55);
        line-height: 1.5;
        max-width: 260px;
        margin: 0 auto;
    }
    .im-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 7px 9px;
        border-radius: 8px;
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.07);
        transition: border-color 0.15s;
    }
    .im-row:hover {
        border-color: rgba(102,0,255,0.35);
    }
    .im-row-info {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
        flex: 1;
    }
    .im-type-badge {
        flex-shrink: 0;
        font-size: 10px;
        font-weight: 700;
        padding: 3px 7px;
        border-radius: 6px;
        white-space: nowrap;
    }
    .im-type--ifc       { background: rgba(59,130,246,0.22); color: #93c5fd; border: 1px solid rgba(59,130,246,0.3); }
    .im-type--dxf       { background: rgba(245,158,11,0.22); color: #fcd34d; border: 1px solid rgba(245,158,11,0.3); }
    .im-type--floor-plan { background: rgba(16,185,129,0.22); color: #6ee7b7; border: 1px solid rgba(16,185,129,0.3); }
    .im-type--rhino     { background: rgba(239,68,68,0.22);  color: #fca5a5; border: 1px solid rgba(239,68,68,0.3); }
    .im-row-name {
        font-size: 12px;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        color: rgba(255,255,255,0.92);
    }
    .im-row-actions {
        display: flex;
        align-items: center;
        gap: 4px;
        flex-shrink: 0;
    }
    .im-btn {
        display: grid;
        place-items: center;
        width: 24px;
        height: 24px;
        border-radius: 6px;
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(255,255,255,0.05);
        color: rgba(255,255,255,0.65);
        cursor: pointer;
        transition: background 0.12s, border-color 0.12s, color 0.12s;
        padding: 0;
    }
    .im-btn:hover {
        background: rgba(255,255,255,0.13);
        color: #fff;
    }
    .im-btn--active {
        background: rgba(16,185,129,0.18);
        border-color: rgba(16,185,129,0.45);
        color: #6ee7b7;
    }
    .im-btn--active:hover {
        background: rgba(16,185,129,0.28);
    }
    .im-btn--pinned {
        background: rgba(245,158,11,0.18);
        border-color: rgba(245,158,11,0.45);
        color: #fcd34d;
    }
    .im-btn--pinned:hover {
        background: rgba(245,158,11,0.28);
    }
    .im-btn--noselect {
        background: rgba(139,92,246,0.2);
        border-color: rgba(139,92,246,0.5);
        color: #c4b5fd;
    }
    .im-btn--noselect:hover {
        background: rgba(139,92,246,0.3);
    }
    .im-btn--delete {
        background: rgba(239,68,68,0.08);
        border-color: rgba(239,68,68,0.2);
        color: rgba(239,68,68,0.7);
    }
    .im-btn--delete:hover {
        background: rgba(239,68,68,0.2);
        border-color: rgba(239,68,68,0.55);
        color: #fca5a5;
    }
    .im-section-label {
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: rgba(255,255,255,0.35);
        padding: 4px 4px 2px;
    }
`;
