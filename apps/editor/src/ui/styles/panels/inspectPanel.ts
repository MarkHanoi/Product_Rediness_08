/**
 * @file src/ui/styles/panels/inspectPanel.ts
 *
 * Inspect panel (A.24 / A.31.e) — `insp-` prefix.
 * CONTRACT §05 §2 — CSS layer only, zero logic. The panel mounts inside the
 * RailPanelController body (white surface) and reuses the canonical Model Tree
 * (`pmt-`) + Provenance (`pv-`) component styles for their inner content; these
 * rules only style the Inspect SHELL (sections, labels, hosts, the clear-
 * isolation button). #6600FF accent, white+purple per the preview-colour
 * single-source-of-truth memory (NOT dark / NOT black).
 */
export const INSPECT_PANEL_STYLES = `
    /* ── Root (fills the rail body) ─────────────────────────────────────────── */
    .insp-root {
        display: flex;
        flex-direction: column;
        min-height: 0;
        flex: 1;
        height: 100%;
        background: var(--app-bg, #ffffff);
        color: var(--app-text, #0f172a);
        font-family: var(--app-font, 'Inter', sans-serif);
        font-size: 0.78rem;
    }

    .insp-subtitle {
        padding: 8px 12px;
        color: var(--app-text-muted, #64748b);
        font-size: 0.72rem;
        line-height: 1.45;
        border-bottom: 1px solid var(--app-border, #e2e8f0);
        flex-shrink: 0;
    }

    /* ── Sections ───────────────────────────────────────────────────────────── */
    .insp-section {
        display: flex;
        flex-direction: column;
        min-height: 0;
    }
    .insp-section--tree {
        flex: 1 1 60%;
        overflow: hidden;
        border-bottom: 1px solid var(--app-border, #e2e8f0);
    }
    .insp-section--prov {
        flex: 1 1 40%;
        overflow: hidden;
    }

    .insp-section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 7px 12px 6px;
        flex-shrink: 0;
    }
    .insp-section-label {
        font-size: 0.66rem;
        font-weight: 700;
        letter-spacing: 0.07em;
        text-transform: uppercase;
        color: #6600FF;
        padding: 7px 12px 5px;
    }
    .insp-section-header .insp-section-label {
        padding: 0;
    }

    /* ── Hosts (scroll) ─────────────────────────────────────────────────────── */
    .insp-tree-host {
        flex: 1;
        overflow: auto;
        min-height: 0;
        padding: 0 4px 6px;
    }
    .insp-prov-host {
        flex: 1;
        overflow: auto;
        min-height: 0;
        padding: 0 12px 12px;
    }

    /* ── Clear-isolation button ─────────────────────────────────────────────── */
    .insp-clear-btn {
        background: var(--app-panel-bg, #fff);
        border: 1px solid var(--app-border, #e2e8f0);
        border-radius: 6px;
        color: var(--app-text, #0f172a);
        font-family: var(--app-font, 'Inter', sans-serif);
        font-size: 0.68rem;
        font-weight: 600;
        padding: 3px 9px;
        cursor: pointer;
        transition: border-color 0.15s, background 0.15s, color 0.15s;
    }
    .insp-clear-btn:hover {
        border-color: #6600FF;
        background: var(--app-violet-soft, #f3effe);
        color: #6600FF;
    }

    /* ── Empty / error states ───────────────────────────────────────────────── */
    .insp-prov-empty,
    .insp-error {
        padding: 14px 12px;
        color: var(--app-text-muted, #64748b);
        font-size: 0.72rem;
        line-height: 1.5;
    }
    .insp-error {
        color: #b91c1c;
    }
`;
