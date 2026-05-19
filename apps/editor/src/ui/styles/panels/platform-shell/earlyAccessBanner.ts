/**
 * @file src/engine/subsystems/styles/panels/platform-shell/earlyAccessBanner.ts
 *
 * Early Access Banner (Phase 10) — eab- prefix.
 * CONTRACT §05 §2 — CSS layer only, zero logic.
 */
export const EAB_STYLES = `
    .eab-banner {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        z-index: 99999;
        background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
        color: #1a1a00;
        font-family: var(--app-font, -apple-system, sans-serif);
        font-size: 12px;
        font-weight: 600;
        padding: 7px 48px 7px 16px;
        text-align: center;
        letter-spacing: 0.2px;
        box-shadow: 0 2px 8px rgba(245,158,11,0.35);
    }
    .eab-banner a {
        color: inherit;
        text-decoration: underline;
        text-underline-offset: 2px;
    }
    .eab-dismiss {
        position: absolute;
        right: 10px;
        top: 50%;
        transform: translateY(-50%);
        background: transparent;
        border: none;
        color: rgba(26,26,0,0.7);
        cursor: pointer;
        font-size: 16px;
        line-height: 1;
        padding: 2px 6px;
        border-radius: 4px;
        transition: background 0.12s;
    }
    .eab-dismiss:hover { background: rgba(0,0,0,0.12); }
`;
