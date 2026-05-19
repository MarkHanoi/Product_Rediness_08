/**
 * @file src/engine/subsystems/styles/panels/rendering-panels/sceneConfigForm.ts
 *
 * Scene Config Form full-screen overlay — scf- prefix.
 * CONTRACT §05 §2 — CSS layer only, zero logic.
 */
export const SCF_STYLES = `
    .scf-root {
        position: fixed;
        inset: 0;
        z-index: 9000;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(10, 12, 20, 0.92);
        backdrop-filter: blur(8px);
        font-family: var(--app-font);
    }

    .scf-card {
        width: 100%;
        max-width: 440px;
        background: var(--app-bg);
        border: 1px solid var(--app-border);
        border-radius: var(--app-radius-lg);
        padding: 2rem;
        box-shadow: var(--app-shadow-panel);
    }

    .scf-heading {
        margin: 0;
        font-size: 1.125rem;
        font-weight: 600;
        color: var(--app-text);
        line-height: 1.3;
    }

    .scf-body {
        margin: 0.625rem 0 0;
        font-size: 0.875rem;
        color: var(--app-text-2);
        line-height: 1.55;
    }

    .scf-error-details {
        margin: 0.875rem 0 0;
        padding: 0.625rem;
        background: #fffbeb;
        border: 1px solid #fde68a;
        border-radius: var(--app-radius-sm);
        color: #92400e;
        font-size: 0.6875rem;
        line-height: 1.5;
        overflow: auto;
        max-height: 130px;
        white-space: pre-wrap;
        word-break: break-all;
    }

    .scf-actions {
        display: flex;
        align-items: center;
        gap: 0.625rem;
        margin-top: 1.25rem;
    }

    .scf-btn-primary {
        background: var(--app-gradient);
        color: #ffffff;
        border: none;
        border-radius: var(--app-radius-sm);
        padding: 0.5rem 1.125rem;
        font-size: 0.875rem;
        font-weight: 500;
        font-family: var(--app-font);
        cursor: pointer;
        box-shadow: var(--app-shadow-glow);
        transition: opacity 0.15s;
    }

    .scf-btn-primary:hover { opacity: 0.88; }

    .scf-btn-secondary {
        background: transparent;
        color: #8888aa;
        border: 1px solid #2a2d4a;
        border-radius: var(--app-radius-sm);
        padding: 0.5rem 1.125rem;
        font-size: 0.875rem;
        font-weight: 500;
        text-decoration: none;
        font-family: var(--app-font);
        cursor: pointer;
        transition: color 0.15s, border-color 0.15s;
    }

    .scf-btn-secondary:hover {
        color: #ccccee;
        border-color: #4a4d7a;
    }
`;
