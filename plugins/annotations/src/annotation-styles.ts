/**
 * annotation-styles.ts — Sprint C / S5.1-P2
 *
 * Self-contained CSS for annotation UI components.
 * Extracted from `src/engine/subsystems/styles/panels/annotationPanels.ts`.
 * Components in this plugin call injectAnnotationStyles() instead of
 * injectAppTheme() so they have no dependency on src/styles/.
 *
 * CSS classes covered:
 *   ann-cv-*        — ConstraintViolationPanel
 *   ann-constr-*    — constraint toast (§ANN-C4)
 *   ann-dim-prop-*  — DimensionPropertiesPanel
 */

const ANNOTATION_COMPONENT_STYLES = `
    /* ─── §ANN-C4 Constraint Violation Toast ─────────────────────────────── */
    .ann-constr-toast {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 99998;
        display: flex;
        align-items: flex-start;
        gap: 10px;
        background: var(--app-panel-bg, #ffffff);
        color: var(--app-text, #1a2035);
        border: 1px solid var(--app-border, #dde3f0);
        border-left: 3px solid var(--app-status-error, #dc2626);
        font-family: var(--app-font, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
        font-size: 13px;
        font-weight: 500;
        line-height: 1.45;
        padding: 12px 16px;
        border-radius: 8px;
        box-shadow: 0 6px 32px rgba(0,0,0,0.32);
        max-width: 340px;
        pointer-events: none;
        animation: ann-constr-toast-in 0.18s ease;
    }
    .ann-constr-toast--hard { border-left: 4px solid #dc2626; }
    .ann-constr-toast--soft { border-left: 4px solid #f59e0b; }
    .ann-constr-toast-icon  { font-size: 16px; flex-shrink: 0; line-height: 1; }
    .ann-constr-toast-body  { flex: 1; }
    .ann-constr-toast-title {
        font-weight: 700; font-size: 12px; letter-spacing: 0.04em;
        text-transform: uppercase; margin-bottom: 2px;
    }
    .ann-constr-toast-msg { font-size: 12px; opacity: 0.88; }
    @keyframes ann-constr-toast-in {
        from { opacity: 0; transform: translateY(-8px); }
        to   { opacity: 1; transform: translateY(0); }
    }

    /* ─── §ANN-C3 Constraint Violation Panel ─────────────────────────────── */
    .ann-cv-panel {
        position: absolute; bottom: 12px; left: 12px; z-index: 210;
        background: #ffffff; border: 1px solid var(--app-border, #dde3f0);
        border-radius: var(--app-radius-md, 10px);
        box-shadow: var(--app-shadow-card, 0 4px 16px rgba(30,50,120,0.10));
        padding: 10px 12px; display: flex; flex-direction: column; gap: 5px;
        min-width: 200px; max-width: 280px;
        font-family: var(--app-font, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
        pointer-events: auto;
    }
    .ann-cv-panel-header {
        display: flex; align-items: center; justify-content: space-between;
        gap: 6px; padding-bottom: 5px;
        border-bottom: 1px solid var(--app-border-light, #eef1f8); margin-bottom: 2px;
    }
    .ann-cv-panel-title {
        font-size: 11px; font-weight: 700; color: var(--app-text, #1a2035);
        letter-spacing: 0.05em; text-transform: uppercase;
    }
    .ann-cv-badge {
        display: inline-flex; align-items: center; justify-content: center;
        min-width: 18px; height: 18px; border-radius: 9px;
        font-size: 10px; font-weight: 700; padding: 0 5px;
        background: #dc2626; color: #fff;
    }
    .ann-cv-badge--ok    { background: #16a34a; }
    .ann-cv-badge--empty { background: var(--app-text-muted, #9ca3af); }
    .ann-cv-row {
        display: flex; align-items: center; gap: 6px;
        font-size: 11px; color: var(--app-text, #1a2035);
    }
    .ann-cv-dot {
        width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
        background: var(--app-text-muted, #9ca3af);
    }
    .ann-cv-dot--violated  { background: #dc2626; }
    .ann-cv-dot--satisfied { background: #16a34a; }
    .ann-cv-desc { flex: 1; }
    .ann-cv-delta { font-size: 10px; color: #dc2626; font-weight: 600; }

    /* ─── DimensionPropertiesPanel (ann-dim-prop-*) ───────────────────────── */
    .ann-dim-prop-panel {
        position: fixed; right: 16px; top: 50%; transform: translateY(-50%);
        z-index: 8500; background: var(--app-bg, #e8edf6);
        border: 1px solid var(--app-border, #dde3f0);
        border-radius: var(--app-radius-lg, 16px);
        box-shadow: var(--app-shadow-panel, 0 8px 32px rgba(30,50,120,0.13), 0 2px 8px rgba(30,50,120,0.07));
        width: 280px; padding: 0; display: flex; flex-direction: column; gap: 0;
        font-family: var(--app-font, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
        font-size: 12px; color: var(--app-text, #1a2035); user-select: none; overflow: hidden;
    }
    .ann-dim-prop-header {
        background: var(--app-gradient, linear-gradient(135deg, #8B5CF6 0%, #6600FF 100%));
        padding: 10px 44px 10px 16px;
        border-radius: var(--app-radius-lg, 16px) var(--app-radius-lg, 16px) 0 0;
        color: #ffffff; position: relative;
        box-shadow: var(--app-shadow-header, 0 2px 12px rgba(102,0,255,0.35));
    }
    .ann-dim-prop-type-badge {
        font-size: 9px; font-weight: 700; text-transform: uppercase;
        letter-spacing: 0.14em; color: rgba(255,255,255,0.65); margin-bottom: 3px;
    }
    .ann-dim-prop-title   { font-size: 14px; font-weight: 700; color: #ffffff; margin-bottom: 4px; }
    .ann-dim-prop-measured { font-size: 11px; font-weight: 500; color: rgba(255,255,255,0.78); }
    .ann-dim-prop-close {
        position: absolute; top: 10px; right: 14px; width: 22px; height: 22px;
        background: rgba(255,255,255,0.18); border: 1px solid rgba(255,255,255,0.28);
        border-radius: 50%; color: #fff; font-size: 11px; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        line-height: 1; padding: 0; transition: background 0.12s;
    }
    .ann-dim-prop-close:hover { background: rgba(255,255,255,0.32); }
    .ann-dim-prop-body { background: var(--app-panel-bg, #ffffff); display: flex; flex-direction: column; gap: 0; }
    .ann-dim-prop-row {
        display: flex; align-items: center; gap: 8px; padding: 6px 14px;
        border-bottom: 1px solid var(--app-border-light, #eef1f8); flex-wrap: wrap;
    }
    .ann-dim-prop-label {
        flex: 0 0 110px; color: var(--app-text-2, #5a6a85); font-size: 11px;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .ann-dim-prop-label-inline { flex: 0 0 auto; margin-left: 6px; color: var(--app-text-2, #5a6a85); font-size: 11px; }
    .ann-dim-prop-value-ro { flex: 1; font-weight: 600; color: var(--app-text, #1a2035); font-size: 12px; }
    .ann-dim-prop-input,
    .ann-dim-prop-select {
        flex: 1; min-width: 0; background: #f6f8fc;
        border: 1px solid var(--app-border, #dde3f0);
        border-radius: var(--app-radius-sm, 6px); color: var(--app-text, #1a2035);
        font-size: 11px; padding: 4px 6px; font-family: inherit;
        outline: none; transition: border-color 0.15s;
    }
    .ann-dim-prop-input:focus,
    .ann-dim-prop-select:focus  { border-color: var(--app-accent, #6600FF); }
    .ann-dim-prop-input-short   { flex: 0 0 56px; }
    .ann-dim-prop-color {
        width: 32px; height: 24px; padding: 1px 2px;
        border: 1px solid var(--app-border, #dde3f0);
        border-radius: var(--app-radius-sm, 6px); background: #f6f8fc; cursor: pointer;
    }
    .ann-dim-prop-check { width: 14px; height: 14px; cursor: pointer; accent-color: var(--app-accent, #6600FF); }
    .ann-dim-prop-divider { border-top: 1px solid var(--app-border, #dde3f0); margin: 4px 0; }
    .ann-dim-prop-footer { display: flex; gap: 8px; padding: 10px 14px 12px; background: var(--app-panel-bg, #ffffff); }
    .ann-dim-prop-btn {
        flex: 1; padding: 7px 10px; border-radius: var(--app-radius-sm, 6px);
        border: none; font-size: 12px; font-weight: 600; cursor: pointer;
        font-family: inherit; transition: opacity 0.15s, box-shadow 0.15s;
    }
    .ann-dim-prop-btn:hover { opacity: 0.88; }
    .ann-dim-prop-btn-primary {
        background: var(--app-gradient, linear-gradient(135deg, #8B5CF6 0%, #6600FF 100%));
        color: #ffffff; box-shadow: 0 2px 8px rgba(102,0,255,0.28);
    }
    .ann-dim-prop-btn-primary:hover { box-shadow: var(--app-shadow-glow, 0 4px 16px rgba(102,0,255,0.40)); }
    .ann-dim-prop-btn-danger {
        background: #fee2e2; color: #dc2626; border: 1px solid #fca5a5;
    }
    .ann-dim-prop-btn-danger:hover { background: #fecaca; }
`;

let _injected = false;

/**
 * injectAnnotationStyles — idempotent CSS injection for annotation components.
 * Replaces `injectAppTheme()` for components that have been extracted to this plugin.
 */
export function injectAnnotationStyles(): void {
    if (_injected || typeof document === 'undefined') return;
    _injected = true;
    const style = document.createElement('style');
    style.id = 'pryzm-annotation-styles';
    style.textContent = ANNOTATION_COMPONENT_STYLES;
    document.head.appendChild(style);
}
