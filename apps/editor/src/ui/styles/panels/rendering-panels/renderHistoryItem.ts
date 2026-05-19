/**
 * @file src/engine/subsystems/styles/panels/rendering-panels/renderHistoryItem.ts
 *
 * Render History Item badge — rhi- prefix.
 * CONTRACT §05 §2 — CSS layer only, zero logic.
 */
export const RHI_STYLES = `
    .rhi-badge {
        position: fixed;
        bottom: 1.25rem;
        right: 1.25rem;
        z-index: 8000;
        padding: 0.3125rem 0.75rem;
        border-radius: 999px;
        font-family: var(--app-font);
        font-size: 0.75rem;
        font-weight: 500;
        pointer-events: none;
        transition: opacity 0.3s;
    }

    .rhi-badge[data-state="degraded"] {
        background: rgba(245, 158, 11, 0.15);
        color: #f5c560;
        border: 1px solid rgba(245, 158, 11, 0.35);
    }

    .rhi-badge[data-state="error"] {
        background: rgba(220, 38, 38, 0.15);
        color: #f87171;
        border: 1px solid rgba(220, 38, 38, 0.35);
    }
`;
