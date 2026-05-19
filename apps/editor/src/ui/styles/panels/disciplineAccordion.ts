/**
 * @file src/styles/panels/disciplineAccordion.ts
 *
 * CSS for the Discipline Accordion in the CREATE rail panel.
 * Prefix: da- (Discipline Accordion) — claimed in §05 §3 of
 * 05-BIM-UI-ARCHITECTURE-CONTRACT.md.
 *
 * CONTRACT §05 §2.1  — CSS via AppTheme.ts; no independent <style> injection.
 * CONTRACT §05 §2.3  — All colours via var(--app-*) tokens.
 * CONTRACT §05 §7.4  — Zero !important declarations.
 * CONTRACT §06 §5    — No black/dark backgrounds.
 */
export const DISCIPLINE_ACCORDION_STYLES = `

    /* ── Accordion root ─────────────────────────────────────────── */
    .da-accordion {
        display: flex;
        flex-direction: column;
        padding: 6px 0 8px;
        gap: 0;
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: #c4cde0 transparent;
    }

    /* ── Accordion section ──────────────────────────────────────── */
    .da-section {
        display: flex;
        flex-direction: column;
        border-bottom: 1px solid var(--app-border-light);
    }

    .da-section:last-child {
        border-bottom: none;
    }

    /* ── Section header (clickable toggle) ──────────────────────── */
    .da-section-hdr {
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 9px 10px 9px 12px;
        cursor: pointer;
        user-select: none;
        background: transparent;
        border: none;
        width: 100%;
        text-align: left;
        font-family: var(--app-font);
        transition: background 0.12s;
        box-sizing: border-box;
    }

    .da-section-hdr:hover {
        background: var(--app-violet-soft);
    }

    .da-section--open > .da-section-hdr {
        background: var(--app-violet-soft);
    }

    /* Discipline icon */
    .da-section-discipline-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--app-text-2);
        flex-shrink: 0;
        opacity: 0.7;
        transition: color 0.12s, opacity 0.12s;
    }

    .da-section--open > .da-section-hdr .da-section-discipline-icon {
        color: var(--app-accent);
        opacity: 1;
    }

    /* Label text */
    .da-section-label {
        flex: 1;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.07em;
        text-transform: uppercase;
        color: var(--app-text-muted);
        transition: color 0.12s;
    }

    .da-section--open > .da-section-hdr .da-section-label {
        color: var(--app-accent);
    }

    /* Chevron indicator */
    .da-section-chevron {
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--app-text-muted);
        transition: transform 0.18s ease, color 0.12s;
        flex-shrink: 0;
        font-size: 12px;
        line-height: 1;
    }

    .da-section--open > .da-section-hdr .da-section-chevron {
        transform: rotate(180deg);
        color: var(--app-accent);
    }

    /* Lock button */
    .da-lock-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        background: none;
        border: none;
        cursor: pointer;
        padding: 2px;
        border-radius: 4px;
        color: var(--app-text-muted);
        transition: color 0.12s, background 0.12s;
        flex-shrink: 0;
        font-size: 13px;
        line-height: 1;
    }

    .da-lock-btn:hover {
        background: rgba(102,0,255,0.1);
        color: var(--app-accent);
    }

    .da-lock-btn--locked {
        color: var(--app-accent);
    }

    /* ── Section body (collapsible) ─────────────────────────────── */
    .da-section-body {
        display: flex;
        flex-direction: column;
        padding: 4px 8px 8px;
        gap: 2px;
        overflow: hidden;
    }

    .da-section-body--hidden {
        display: none;
    }

    /* ── Tool button row ────────────────────────────────────────── */
    .da-tool-btn {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        height: 36px;
        padding: 0 12px;
        background: transparent;
        border: none;
        border-radius: var(--app-radius-sm);
        cursor: pointer;
        font-family: var(--app-font);
        font-size: 13px;
        font-weight: 500;
        color: var(--app-text);
        text-align: left;
        box-sizing: border-box;
        transition: background 0.12s, color 0.12s;
        flex-shrink: 0;
    }

    .da-tool-btn:hover {
        background: var(--app-violet-soft);
        color: var(--app-accent);
    }

    .da-tool-btn--active {
        background: var(--app-violet-soft);
        color: var(--app-accent);
        border-left: 2px solid var(--app-accent);
        padding-left: 10px;
    }

    .da-tool-btn--disabled {
        opacity: 0.38;
        pointer-events: none;
        cursor: default;
    }

    .da-tool-btn-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        color: inherit;
        flex-shrink: 0;
        width: 20px;
        height: 20px;
    }

    .da-tool-btn-icon svg {
        display: block;
    }

    .da-tool-btn-label {
        flex: 1;
        font-size: 13px;
        font-weight: 500;
        color: inherit;
        line-height: 1.2;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    /* ── "No levels" notice ─────────────────────────────────────── */
    .da-no-levels-notice {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 8px;
        padding: 8px 12px;
        background: #fffbeb;
        border: 1px solid #fde68a;
        border-radius: var(--app-radius-sm);
        font-size: 11px;
        color: #92400e;
        font-family: var(--app-font);
    }

    /* ── Single-discipline mode ──────────────────────────────────── */
    .da-single-mode {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: #c4cde0 transparent;
    }

    /* Thin discipline label row at the top */
    .da-single-hdr {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 7px 5px 7px 7px;
        border-bottom: 1px solid var(--app-border-light);
        flex-shrink: 0;
    }

    .da-single-hdr-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--app-accent);
        flex-shrink: 0;
    }

    .da-single-hdr-label {
        flex: 1;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.07em;
        text-transform: uppercase;
        color: var(--app-accent);
        font-family: var(--app-font);
        min-width: 0;
        overflow: hidden;
        text-overflow: clip;
        white-space: nowrap;
    }

    /* ── Icon grid ──────────────────────────────────────────────── */
    .da-icon-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(38px, 1fr));
        gap: 5px;
        padding: 7px;
    }

    /* Each tool cell: square icon-only button */
    .da-icon-cell {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0;
        width: 100%;
        aspect-ratio: 1 / 1;
        background: transparent;
        border: 1px solid transparent;
        border-radius: var(--app-radius-sm);
        cursor: pointer;
        color: var(--app-text-2);
        transition: background 0.12s, color 0.12s, border-color 0.12s;
        padding: 4px;
        box-sizing: border-box;
        overflow: visible;
    }

    .da-icon-cell:hover {
        background: var(--app-violet-soft);
        color: var(--app-accent);
        border-color: var(--app-accent);
    }

    .da-icon-cell--disabled {
        opacity: 0.35;
        pointer-events: none;
        cursor: default;
    }

    .da-icon-cell-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
    }

    /* Label hidden by default — appears as a floating tooltip on hover */
    .da-icon-cell-label {
        position: absolute;
        bottom: calc(100% + 5px);
        left: 50%;
        transform: translateX(-50%);
        white-space: nowrap;
        background: var(--app-surface, #fff);
        border: 1px solid var(--app-border-light);
        border-radius: 4px;
        padding: 3px 7px;
        font-size: 11px;
        font-weight: 500;
        font-family: var(--app-font);
        color: var(--app-text);
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.12s;
        z-index: 200;
        box-shadow: 0 2px 6px rgba(0,0,0,0.12);
    }

    .da-icon-cell:hover .da-icon-cell-label {
        opacity: 1;
    }
`;
