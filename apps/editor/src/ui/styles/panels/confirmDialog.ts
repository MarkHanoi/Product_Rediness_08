/**
 * @file src/styles/panels/confirmDialog.ts
 *
 * CSS for the PRYZM confirm-dialog modal (cdlg- prefix).
 * CONTRACT §05 §2 — CSS layer only, zero logic.
 * Follows the violet palette defined in §05 §2.2 Design Token Registry.
 */
export const CONFIRM_DIALOG_STYLES = `
    /* ── Backdrop ────────────────────────────────────────────────────────── */
    .cdlg-overlay {
        position: fixed;
        inset: 0;
        background: rgba(10, 14, 40, 0.72);
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 999999;
        font-family: var(--app-font);
        animation: cdlg-fade 0.16s ease;
    }
    @keyframes cdlg-fade {
        from { opacity: 0; }
        to   { opacity: 1; }
    }

    /* ── Card ─────────────────────────────────────────────────────────────── */
    .cdlg-card {
        background: #fff;
        border-radius: var(--app-radius-lg);
        box-shadow: 0 24px 64px rgba(30, 50, 120, 0.28), 0 4px 16px rgba(102, 0, 255, 0.12);
        width: 400px;
        max-width: 92vw;
        overflow: hidden;
        animation: cdlg-slide 0.2s cubic-bezier(0.22, 1, 0.36, 1);
    }
    @keyframes cdlg-slide {
        from { opacity: 0; transform: translateY(18px) scale(0.97); }
        to   { opacity: 1; transform: translateY(0)    scale(1);    }
    }

    /* ── Header gradient strip ────────────────────────────────────────────── */
    .cdlg-header {
        background: var(--app-gradient);
        box-shadow: var(--app-shadow-header);
        padding: 20px 24px 18px;
        display: flex;
        align-items: center;
        gap: 12px;
    }
    .cdlg-header-icon {
        flex-shrink: 0;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.18);
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .cdlg-header-icon svg {
        width: 20px;
        height: 20px;
        display: block;
    }
    .cdlg-header-title {
        color: #fff;
        font-size: 15px;
        font-weight: 700;
        letter-spacing: 0.01em;
        line-height: 1.25;
        margin: 0;
    }
    .cdlg-header-subtitle {
        color: rgba(255, 255, 255, 0.75);
        font-size: 11px;
        font-weight: 500;
        margin: 2px 0 0;
        letter-spacing: 0.04em;
        text-transform: uppercase;
    }

    /* ── Body ─────────────────────────────────────────────────────────────── */
    .cdlg-body {
        padding: 22px 24px 10px;
    }
    .cdlg-element-name {
        background: var(--app-violet-soft);
        border: 1px solid rgba(102, 0, 255, 0.15);
        border-radius: var(--app-radius-sm);
        padding: 8px 12px;
        font-size: 12px;
        font-weight: 600;
        color: var(--app-accent);
        word-break: break-all;
        margin-bottom: 14px;
        font-family: "SF Mono", "Fira Code", Consolas, monospace;
        letter-spacing: 0.02em;
    }
    .cdlg-message {
        font-size: 13px;
        color: var(--app-text-2);
        line-height: 1.55;
        margin: 0;
    }
    .cdlg-warning-row {
        display: flex;
        align-items: center;
        gap: 7px;
        margin-top: 12px;
        padding: 8px 10px;
        background: rgba(220, 38, 38, 0.06);
        border: 1px solid rgba(220, 38, 38, 0.18);
        border-radius: var(--app-radius-sm);
    }
    .cdlg-warning-row svg {
        flex-shrink: 0;
        width: 14px;
        height: 14px;
        color: var(--app-status-error);
    }
    .cdlg-warning-text {
        font-size: 11.5px;
        color: var(--app-status-error);
        font-weight: 500;
    }

    /* ── Footer / actions ─────────────────────────────────────────────────── */
    .cdlg-footer {
        padding: 16px 24px 22px;
        display: flex;
        justify-content: flex-end;
        gap: 10px;
    }
    .cdlg-btn {
        border: none;
        border-radius: var(--app-radius-sm);
        font-family: var(--app-font);
        font-size: 13px;
        font-weight: 600;
        padding: 9px 22px;
        cursor: pointer;
        transition: opacity 0.14s, transform 0.12s, box-shadow 0.14s;
        letter-spacing: 0.01em;
    }
    .cdlg-btn:active { transform: scale(0.97); }

    .cdlg-btn-cancel {
        background: transparent;
        border: 1.5px solid var(--app-border);
        color: var(--app-text-2);
    }
    .cdlg-btn-cancel:hover {
        border-color: var(--app-violet-1);
        color: var(--app-accent);
        background: var(--app-violet-soft);
    }

    .cdlg-btn-delete {
        background: #dc2626;
        color: #fff;
        box-shadow: 0 3px 12px rgba(220, 38, 38, 0.32);
    }
    .cdlg-btn-delete:hover {
        opacity: 0.88;
        box-shadow: 0 5px 18px rgba(220, 38, 38, 0.42);
    }
`;
