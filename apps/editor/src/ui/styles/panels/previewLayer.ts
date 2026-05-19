/**
 * previewLayer.ts — Ghost Preview Layer CSS (pvw- prefix)
 *
 * Phase 3 — §3.1 AI Ghost Preview Layer
 * Contract §05 §2.1: All CSS injected via injectAppTheme(). No separate <style> blocks.
 * CSS prefix: pvw-  (PreviewManager UI controls)
 * CSS prefix: ai-highlight-btn  (extends existing ai- prefix, §3.3 Actionable Logs)
 */

export const PREVIEW_LAYER_STYLES = `

/* ── PreviewManager banner — shown in AI chat when ghost meshes are active ── */
.pvw-banner {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 12px;
    background: rgba(168, 85, 247, 0.10);
    border: 1px solid rgba(168, 85, 247, 0.35);
    border-radius: 8px;
    margin: 6px 0 2px;
    font-size: 12px;
    color: var(--app-text, #e2e8f0);
    font-family: var(--app-font, 'Inter', sans-serif);
}

.pvw-banner-top {
    display: flex;
    align-items: center;
    gap: 8px;
}

.pvw-banner-icon {
    font-size: 15px;
    flex-shrink: 0;
}

.pvw-banner-label {
    flex: 1;
    line-height: 1.45;
    font-size: 12px;
    color: var(--app-text, #e2e8f0);
}

.pvw-banner-count {
    font-weight: 600;
    color: #c084fc;
}

.pvw-actions {
    display: flex;
    gap: 6px;
    margin-top: 2px;
}

.pvw-accept-btn {
    padding: 4px 14px;
    border: none;
    border-radius: 5px;
    background: #A855F7;
    color: #fff;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    font-family: var(--app-font, 'Inter', sans-serif);
    transition: opacity 0.15s;
    letter-spacing: 0.02em;
}

.pvw-accept-btn:hover:not(:disabled) { opacity: 0.85; }
.pvw-accept-btn:disabled { opacity: 0.45; cursor: not-allowed; }

.pvw-decline-btn {
    padding: 4px 14px;
    border: 1px solid rgba(168, 85, 247, 0.45);
    border-radius: 5px;
    background: transparent;
    color: #c084fc;
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    font-family: var(--app-font, 'Inter', sans-serif);
    transition: background 0.15s, border-color 0.15s;
}

.pvw-decline-btn:hover { background: rgba(168, 85, 247, 0.10); border-color: rgba(168, 85, 247, 0.65); }

/* ── Highlight Selection button (Phase 3.3 Actionable Logs — ai- prefix) ── */
.ai-highlight-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    margin-top: 6px;
    padding: 3px 10px;
    border: 1px solid rgba(96, 165, 250, 0.45);
    border-radius: 4px;
    background: rgba(96, 165, 250, 0.08);
    color: #60a5fa;
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    font-family: var(--app-font, 'Inter', sans-serif);
    transition: background 0.15s, border-color 0.15s;
    line-height: 1.4;
}

.ai-highlight-btn:hover {
    background: rgba(96, 165, 250, 0.18);
    border-color: rgba(96, 165, 250, 0.7);
}

.ai-highlight-btn-icon {
    font-size: 12px;
    line-height: 1;
}
`;
