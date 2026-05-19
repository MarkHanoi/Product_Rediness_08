/**
 * @file src/engine/subsystems/styles/panels/rendering-panels/photorealisticSidebar.ts
 *
 * Photorealistic sidebar — ps- prefix.
 * CONTRACT §05 §2 — CSS layer only, zero logic.
 */
export const PHOTOREALISTIC_SIDEBAR_STYLES = `
    /* Badge strip — pipeline status (WebGPU / SSGI / TRAA) */
    .ph-badge-strip {
        display: flex;
        gap: 4px;
        padding: 4px 2px 2px;
        flex-wrap: wrap;
    }
    .ph-badge {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        padding: 2px 6px;
        border-radius: 10px;
        font-size: 9px;
        font-weight: 600;
        letter-spacing: 0.04em;
        background: var(--app-panel-bg);
        color: var(--app-text-2);
        border: 1px solid var(--app-border);
        transition: background 0.2s, color 0.2s, border-color 0.2s;
        cursor: default;
        user-select: none;
    }
    .ph-badge--active {
        background: rgba(34,197,94,0.15);
        color: #22c55e;
        border-color: rgba(34,197,94,0.30);
    }
    .ph-badge--webgpu.ph-badge--active {
        background: rgba(96,165,250,0.15);
        color: #60a5fa;
        border-color: rgba(96,165,250,0.30);
    }
    .ph-badge-dot {
        width: 5px;
        height: 5px;
        border-radius: 50%;
        background: currentColor;
        display: inline-block;
        flex-shrink: 0;
    }

    /* SSGI / TRAA toggle rows */
    .ph-toggle-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 3px 2px;
    }
    .ph-toggle-label {
        font-size: 10px;
        color: #aaa;
        font-weight: 500;
    }
    .ph-toggle {
        appearance: none;
        -webkit-appearance: none;
        width: 28px;
        height: 15px;
        border-radius: 8px;
        background: var(--app-border);
        cursor: pointer;
        position: relative;
        border: 1px solid var(--app-border);
        transition: background 0.2s;
        outline: none;
        flex-shrink: 0;
    }
    .ph-toggle:checked {
        background: #22c55e;
        border-color: #22c55e;
    }
    .ph-toggle::after {
        content: '';
        position: absolute;
        width: 11px;
        height: 11px;
        border-radius: 50%;
        background: #fff;
        top: 1px;
        left: 1px;
        transition: left 0.2s;
    }
    .ph-toggle:checked::after {
        left: 14px;
    }

    /* Shortcut action buttons in the photorealistic sub-section */
    .ph-shortcut-btn {
        width: 100%;
        padding: 5px 8px;
        background: rgba(102,0,255,0.08);
        border: 1px solid rgba(102,0,255,0.20);
        border-radius: 5px;
        color: #a78bfa;
        font-size: 10px;
        font-weight: 600;
        cursor: pointer;
        text-align: left;
        transition: background 0.2s, border-color 0.2s;
        font-family: var(--app-font);
        margin-bottom: 1px;
    }
    .ph-shortcut-btn:hover {
        background: rgba(102,0,255,0.15);
        border-color: rgba(102,0,255,0.35);
    }

    /* Phase-5 pipeline-active notice inside VisualizationEnginePanel */
    .ph-phase5-notice {
        display: none;
        align-items: flex-start;
        gap: 8px;
        padding: 8px 10px;
        background: rgba(96,165,250,0.10);
        border: 1px solid rgba(96,165,250,0.25);
        border-radius: 6px;
        font-size: 10px;
        color: #93c5fd;
        line-height: 1.5;
    }
    .ph-phase5-notice.ph-phase5-notice--visible {
        display: flex;
    }
    .ph-phase5-notice-icon {
        font-size: 14px;
        flex-shrink: 0;
    }
`;
