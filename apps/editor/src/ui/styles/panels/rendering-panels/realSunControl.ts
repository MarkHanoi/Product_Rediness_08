/**
 * @file src/engine/subsystems/styles/panels/rendering-panels/realSunControl.ts
 *
 * Real Sun Control — rs- prefix.
 * CONTRACT §05 §2 — CSS layer only, zero logic.
 */
export const REAL_SUN_STYLES = `
    /* ── Floating panel ─────────────────────────────────────────────────── */
    .rsc-panel {
        position: fixed;
        top: 60px;
        right: 320px;
        width: 220px;
        display: flex;
        flex-direction: column;
        background: var(--app-bg);
        border: 1px solid var(--app-border);
        border-radius: var(--app-radius-lg);
        box-shadow: var(--app-shadow-panel);
        z-index: 2600;
        font-family: var(--app-font, 'Inter', sans-serif);
        font-size: 0.78rem;
        color: var(--app-text);
        overflow: hidden;
        pointer-events: all;
        user-select: none;
    }

    /* ── Header ─────────────────────────────────────────────────────────── */
    .rsc-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px 7px;
        background: linear-gradient(135deg, #8B5CF6 0%, #6600FF 100%);
        color: #fff;
        border-radius: 12px 12px 0 0;
    }

    .rsc-title {
        font-weight: 600;
        font-size: 0.8rem;
        letter-spacing: 0.03em;
    }

    .rsc-close {
        background: none;
        border: none;
        color: rgba(255,255,255,0.75);
        cursor: pointer;
        font-size: 0.85rem;
        padding: 0 2px;
        line-height: 1;
        transition: color 0.15s;
    }
    .rsc-close:hover { color: #fff; }

    /* ── Body ───────────────────────────────────────────────────────────── */
    .rsc-body {
        padding: 10px 12px 12px;
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .rsc-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
    }
    .rsc-row--gap { margin-top: 8px; }

    .rsc-label {
        color: var(--app-text-muted);
        font-size: 0.72rem;
        min-width: 56px;
        flex-shrink: 0;
    }

    .rsc-time-display {
        font-weight: 700;
        font-size: 0.9rem;
        color: var(--app-accent);
        letter-spacing: 0.04em;
    }

    /* ── Slider ─────────────────────────────────────────────────────────── */
    .rsc-slider {
        -webkit-appearance: none;
        appearance: none;
        width: 100%;
        height: 4px;
        border-radius: 2px;
        background: var(--app-border);
        outline: none;
        cursor: pointer;
        margin: 4px 0 2px;
        accent-color: var(--app-accent);
    }
    .rsc-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: var(--app-accent);
        cursor: pointer;
        box-shadow: var(--app-shadow-glow);
    }
    .rsc-slider::-moz-range-thumb {
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: var(--app-accent);
        cursor: pointer;
        border: none;
    }

    /* ── Number inputs (lat / lng) ──────────────────────────────────────── */
    .rsc-num {
        flex: 1;
        background: var(--app-panel-bg);
        border: 1px solid var(--app-border);
        border-radius: 5px;
        color: var(--app-text);
        font-size: 0.73rem;
        padding: 3px 6px;
        outline: none;
        width: 0;
        min-width: 0;
    }
    .rsc-num:focus {
        border-color: var(--app-accent);
        background: #fff;
    }

    /* ── Status readout ─────────────────────────────────────────────────── */
    .rsc-status {
        margin-top: 8px;
        padding: 5px 8px;
        background: var(--app-violet-soft);
        border-radius: 6px;
        font-size: 0.71rem;
        color: var(--app-text-2);
        text-align: center;
        line-height: 1.4;
    }
`;
