/**
 * @file src/styles/panels/appToast.ts
 *
 * CSS for the global PRYZM toast notification service (at- prefix).
 * CONTRACT §05 §2 — CSS layer only, zero logic.
 * CONTRACT §05 §2.2 — uses var(--app-*) tokens exclusively.
 */
export const APP_TOAST_STYLES = `
    #at-container {
        position: fixed;
        bottom: 28px;
        right: 24px;
        z-index: 99999;
        display: flex;
        flex-direction: column-reverse;
        gap: 10px;
        pointer-events: none;
        font-family: var(--app-font);
    }

    .at-toast {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        min-width: 260px;
        max-width: 380px;
        padding: 13px 16px 13px 14px;
        background: #1c2340;
        border: 1px solid rgba(255,255,255,0.09);
        border-left: 4px solid var(--at-accent, #8B5CF6);
        border-radius: var(--app-radius-md);
        box-shadow: var(--app-shadow-panel);
        color: #e8edf6;
        font-size: 12.5px;
        line-height: 1.5;
        pointer-events: auto;
        animation: at-slide-in 0.22s cubic-bezier(0.22,1,0.36,1) both;
    }

    .at-toast.at-hiding {
        animation: at-slide-out 0.2s ease-in forwards;
    }

    .at-toast--info    { --at-accent: #8B5CF6; }
    .at-toast--success { --at-accent: var(--app-status-success); }
    .at-toast--warn    { --at-accent: var(--app-status-warning); }
    .at-toast--error   { --at-accent: var(--app-status-error); }

    .at-icon {
        flex-shrink: 0;
        width: 16px;
        height: 16px;
        margin-top: 1px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        font-weight: 700;
        line-height: 1;
    }

    .at-toast--info    .at-icon { background: rgba(139,92,246,0.2); color: #8B5CF6; }
    .at-toast--success .at-icon { background: rgba(34,197,94,0.2);  color: var(--app-status-success); }
    .at-toast--warn    .at-icon { background: rgba(245,158,11,0.2); color: var(--app-status-warning); }
    .at-toast--error   .at-icon { background: rgba(220,38,38,0.2);  color: var(--app-status-error); }

    .at-body {
        flex: 1;
        min-width: 0;
    }

    .at-title {
        font-weight: 600;
        font-size: 12px;
        letter-spacing: 0.01em;
        color: #fff;
        margin-bottom: 2px;
    }

    .at-msg {
        color: #b8c4d8;
        font-size: 12px;
    }

    .at-close {
        flex-shrink: 0;
        width: 18px;
        height: 18px;
        border: none;
        background: none;
        color: #7a8aaa;
        cursor: pointer;
        font-size: 14px;
        line-height: 1;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        transition: color 0.15s, background 0.15s;
    }

    .at-close:hover {
        color: #e8edf6;
        background: rgba(255,255,255,0.1);
    }

    @keyframes at-slide-in {
        from { opacity: 0; transform: translateX(24px) scale(0.97); }
        to   { opacity: 1; transform: translateX(0)    scale(1);    }
    }

    @keyframes at-slide-out {
        from { opacity: 1; transform: translateX(0)    scale(1);    }
        to   { opacity: 0; transform: translateX(24px) scale(0.96); max-height: 0; margin: 0; padding: 0; }
    }
`;
