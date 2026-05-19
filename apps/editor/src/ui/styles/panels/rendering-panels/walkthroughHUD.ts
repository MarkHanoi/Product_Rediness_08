/**
 * @file src/engine/subsystems/styles/panels/rendering-panels/walkthroughHUD.ts
 *
 * Walkthrough HUD — fw- prefix.
 * CONTRACT §05 §2 — CSS layer only, zero logic.
 */
export const FW_PANEL_STYLES = `
    /* ── Walkthrough HUD (fw-) ─────────────────────────────────────────────── */

    .fw-hud {
        display: none;
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 9000;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        pointer-events: none;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    .fw-hud-badge {
        background: rgba(102, 0, 255, 0.88);
        color: #ffffff;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.04em;
        padding: 4px 14px;
        border-radius: 20px;
        box-shadow: 0 2px 12px rgba(102, 0, 255, 0.5);
        backdrop-filter: blur(6px);
        white-space: nowrap;
    }

    .fw-hud-hint {
        background: rgba(0, 0, 0, 0.65);
        color: #e8edf6;
        font-size: 11px;
        padding: 4px 14px;
        border-radius: 12px;
        backdrop-filter: blur(6px);
        white-space: nowrap;
    }

    .fw-kbd {
        background: rgba(255, 255, 255, 0.15);
        border: 1px solid rgba(255, 255, 255, 0.3);
        border-radius: 4px;
        padding: 1px 5px;
        font-family: var(--app-font);
        font-size: 10px;
        font-weight: 700;
        color: #ffffff;
    }
`;
