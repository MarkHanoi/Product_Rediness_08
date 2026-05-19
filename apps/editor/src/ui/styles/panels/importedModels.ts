export const IMPORTED_MODELS_STYLES = `
    .iml-root {
        position: fixed;
        left: 50%;
        bottom: 16px;
        transform: translateX(-50%);
        z-index: 8200;
        font-family: var(--app-font);
        pointer-events: none;
    }
    .iml-toggle {
        pointer-events: auto;
        display: flex;
        align-items: center;
        gap: 8px;
        height: 36px;
        padding: 0 14px;
        border-radius: 18px;
        border: 1px solid rgba(102, 0, 255, 0.35);
        background: rgba(16, 22, 38, 0.94);
        color: #fff;
        box-shadow: 0 8px 28px rgba(0,0,0,0.25);
        cursor: pointer;
        font-size: 12px;
        font-weight: 700;
    }
    .iml-toggle strong {
        min-width: 18px;
        height: 18px;
        border-radius: 9px;
        display: grid;
        place-items: center;
        background: var(--app-accent);
        color: #fff;
        font-size: 10px;
    }
    .iml-panel {
        pointer-events: auto;
        position: absolute;
        left: 50%;
        bottom: 46px;
        transform: translateX(-50%);
        width: min(820px, calc(100vw - 220px));
        max-height: min(340px, calc(100vh - 160px));
        flex-direction: column;
        background: rgba(16, 22, 38, 0.97);
        color: #fff;
        border: 1px solid rgba(102, 0, 255, 0.38);
        border-radius: 14px;
        box-shadow: 0 18px 54px rgba(0,0,0,0.36);
        overflow: hidden;
        backdrop-filter: blur(14px);
    }
    .iml-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 14px 16px;
        border-bottom: 1px solid rgba(255,255,255,0.08);
    }
    .iml-title {
        font-size: 14px;
        font-weight: 800;
        letter-spacing: 0.01em;
    }
    .iml-subtitle {
        margin-top: 3px;
        font-size: 11px;
        color: rgba(255,255,255,0.62);
    }
    .iml-actions,
    .iml-row-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
        flex-wrap: wrap;
        justify-content: flex-end;
        max-width: 390px;
    }
    .iml-close,
    .iml-secondary,
    .iml-primary,
    .iml-danger {
        border: 1px solid rgba(255,255,255,0.16);
        border-radius: 8px;
        background: rgba(255,255,255,0.06);
        color: #fff;
        height: 28px;
        padding: 0 10px;
        font: 700 11px/1 var(--app-font);
        cursor: pointer;
    }
    .iml-primary,
    .iml-secondary:hover {
        background: var(--app-accent);
        border-color: var(--app-accent);
    }
    .iml-danger:hover {
        background: rgba(226,75,74,0.18);
        border-color: rgba(226,75,74,0.55);
        color: #ffb8b8;
    }
    .iml-close {
        width: 28px;
        padding: 0;
        font-size: 18px;
        line-height: 24px;
    }
    .iml-body {
        overflow: auto;
        padding: 10px;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    .iml-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        padding: 12px;
        border-radius: 10px;
        background: rgba(255,255,255,0.055);
        border: 1px solid rgba(255,255,255,0.08);
    }
    .iml-row-main {
        min-width: 0;
    }
    .iml-model-name {
        font-size: 13px;
        font-weight: 800;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .iml-model-file {
        margin-top: 3px;
        font-size: 11px;
        color: rgba(255,255,255,0.52);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .iml-metrics {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 8px;
    }
    .iml-metrics span {
        font-size: 10px;
        color: rgba(255,255,255,0.72);
        background: rgba(255,255,255,0.08);
        border-radius: 999px;
        padding: 3px 7px;
    }
    .iml-empty {
        text-align: center;
        padding: 28px 16px 30px;
    }
    .iml-empty-title {
        font-size: 14px;
        font-weight: 800;
    }
    .iml-empty-text {
        margin: 7px auto 14px;
        max-width: 360px;
        color: rgba(255,255,255,0.62);
        font-size: 12px;
        line-height: 1.45;
    }
`;