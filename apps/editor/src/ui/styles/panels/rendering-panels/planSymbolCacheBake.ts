/**
 * @file src/engine/subsystems/styles/panels/rendering-panels/planSymbolCacheBake.ts
 *
 * Plan Symbol Cache pre-bake progress toast — pscb- prefix.
 * CONTRACT §05 §2 — CSS layer only, zero logic.
 */
export const PSCB_STYLES = `
    /* §PHASE-4 Task 4.3 — Plan Symbol Cache pre-bake progress toast */
    .pscb-badge {
        position: fixed;
        bottom: 1rem;
        right: 1rem;
        z-index: 8000;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 2rem;
        height: 2rem;
        padding: 0;
        border-radius: 8px;
        background: rgba(102, 0, 255, 0.12);
        border: 1px solid rgba(139, 92, 246, 0.35);
        pointer-events: none;
        opacity: 0;
        transform: translateY(6px);
        transition: opacity 0.3s ease, transform 0.3s ease;
    }

    .pscb-badge[data-visible="true"] {
        opacity: 1;
        transform: translateY(0);
    }

    .pscb-badge[data-visible="false"] {
        opacity: 0;
        transform: translateY(6px);
    }

    .pscb-text {
        display: none;
    }

    .pscb-spinner {
        display: inline-block;
        width: 0.9rem;
        height: 0.9rem;
        border: 2px solid rgba(139, 92, 246, 0.25);
        border-top-color: #8b5cf6;
        border-radius: 50%;
        animation: pscb-spin 0.75s linear infinite;
        flex-shrink: 0;
    }

    @keyframes pscb-spin {
        to { transform: rotate(360deg); }
    }
`;
