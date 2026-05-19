/**
 * @file src/styles/panels/canvasOverlays.ts
 *
 * CSS for canvas overlay UI: Intent Prompt toast (ip-).
 * CONTRACT §05 §3 — prefix `ip-` reserved for this module.
 */

export const CANVAS_OVERLAYS_STYLES = `
.ip-toast {
    position: absolute;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 9500;
    background: var(--app-bg);
    border: 1px solid var(--app-border-light);
    border-radius: var(--app-radius-md);
    padding: 14px 16px;
    width: 380px;
    max-width: 92vw;
    box-shadow: var(--app-shadow-panel);
    font-family: var(--app-font);
    animation: ip-slide-up 0.22s cubic-bezier(.16,1,.3,1);
    pointer-events: all;
}
@keyframes ip-slide-up {
    from { opacity:0; transform: translateX(-50%) translateY(16px); }
    to   { opacity:1; transform: translateX(-50%) translateY(0);    }
}
.ip-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
}
.ip-icon {
    font-size: 16px;
    flex-shrink: 0;
}
.ip-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--app-text);
    flex: 1;
}
.ip-badge {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 2px 6px;
    border-radius: 4px;
    background: var(--app-violet-soft);
    color: var(--app-accent);
}
.ip-context {
    font-size: 11px;
    color: var(--app-text-2);
    margin-bottom: 10px;
    line-height: 1.45;
}
.ip-input {
    width: 100%;
    box-sizing: border-box;
    background: var(--app-panel-bg);
    border: 1px solid var(--app-border);
    border-radius: var(--app-radius-sm);
    padding: 8px 10px;
    font-size: 12px;
    color: var(--app-text);
    font-family: var(--app-font);
    resize: none;
    outline: none;
    transition: border-color 0.15s;
}
.ip-input:focus {
    border-color: var(--app-accent);
}
.ip-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 10px;
}
.ip-timer {
    flex: 1;
    font-size: 10px;
    color: var(--app-text-muted);
}
.ip-btn-dismiss {
    background: transparent;
    border: 1px solid var(--app-border);
    border-radius: var(--app-radius-sm);
    padding: 5px 12px;
    font-size: 11px;
    color: var(--app-text-2);
    cursor: pointer;
    font-family: var(--app-font);
    transition: background 0.12s;
}
.ip-btn-dismiss:hover { background: var(--app-violet-soft); }
.ip-btn-record {
    background: var(--app-gradient);
    border: none;
    border-radius: var(--app-radius-sm);
    padding: 5px 14px;
    font-size: 11px;
    font-weight: 600;
    color: #fff;
    cursor: pointer;
    font-family: var(--app-font);
    transition: opacity 0.12s;
}
.ip-btn-record:hover { opacity: 0.88; }

/* ── VoiceCommandIndicator pulse animation (§05 §2.1 — AppTheme only) ─── */
@keyframes voice-pulse {
    0%,100% { box-shadow: 0 0 0 0 rgba(220,38,38,0.5); }
    50%      { box-shadow: 0 0 0 7px rgba(220,38,38,0); }
}
`;
