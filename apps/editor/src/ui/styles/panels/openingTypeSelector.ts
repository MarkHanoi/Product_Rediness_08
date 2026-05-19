/**
 * @file src/styles/panels/openingTypeSelector.ts
 *
 * CSS for Door Type Selector (prefix: dts-) and Window Type Selector (prefix: wts-).
 * CONTRACT §05 §2 — CSS layer only, zero logic.
 * CSS prefix table entries:
 *   dts-  — DoorTypeSelectorWidget
 *   wts-  — WindowTypeSelectorWidget
 */

export const DOOR_TYPE_SELECTOR_STYLES = `
    .dts-outer { margin-bottom: 6px; }
    .dts-label {
        font-size: 10px;
        color: rgba(255,255,255,0.7);
        font-weight: 600;
        margin-bottom: 4px;
        letter-spacing: 0.05em;
        text-transform: uppercase;
    }
    .dts-row { display: flex; align-items: center; gap: 6px; }
    .dts-select {
        flex: 1;
        font-size: 11px;
        padding: 4px 8px;
        border-radius: 6px;
        border: none;
        background: rgba(255,255,255,0.15);
        color: #fff;
        cursor: pointer;
        outline: none;
        min-width: 0;
    }
    .dts-swatch {
        display: flex;
        height: 16px;
        width: 28px;
        border-radius: 3px;
        overflow: hidden;
        gap: 2px;
        flex-shrink: 0;
    }
    .dts-apply-btn {
        font-size: 10px;
        padding: 4px 10px;
        background: rgba(255,255,255,0.2);
        border: 1px solid rgba(255,255,255,0.35);
        border-radius: 5px;
        color: #fff;
        cursor: pointer;
        white-space: nowrap;
        flex-shrink: 0;
        transition: background 0.1s;
    }
    .dts-apply-btn:hover { background: rgba(255,255,255,0.35); }
    .dts-opt-dark   { background: var(--app-dark-blue); color: #fff; }
    .dts-opt-action { background: var(--app-dark-blue); color: var(--app-violet-1); }
    .dts-opt-sep    { background: var(--app-dark-blue); color: rgba(255,255,255,0.4); }
`;

export const WINDOW_TYPE_SELECTOR_STYLES = `
    .wts-outer { margin-bottom: 6px; }
    .wts-label {
        font-size: 10px;
        color: rgba(255,255,255,0.7);
        font-weight: 600;
        margin-bottom: 4px;
        letter-spacing: 0.05em;
        text-transform: uppercase;
    }
    .wts-row { display: flex; align-items: center; gap: 6px; }
    .wts-select {
        flex: 1;
        font-size: 11px;
        padding: 4px 8px;
        border-radius: 6px;
        border: none;
        background: rgba(255,255,255,0.15);
        color: #fff;
        cursor: pointer;
        outline: none;
        min-width: 0;
    }
    .wts-swatch {
        display: flex;
        height: 16px;
        width: 28px;
        border-radius: 3px;
        overflow: hidden;
        gap: 2px;
        flex-shrink: 0;
    }
    .wts-apply-btn {
        font-size: 10px;
        padding: 4px 10px;
        background: rgba(255,255,255,0.2);
        border: 1px solid rgba(255,255,255,0.35);
        border-radius: 5px;
        color: #fff;
        cursor: pointer;
        white-space: nowrap;
        flex-shrink: 0;
        transition: background 0.1s;
    }
    .wts-apply-btn:hover { background: rgba(255,255,255,0.35); }
    .wts-opt-dark   { background: var(--app-dark-blue); color: #fff; }
    .wts-opt-action { background: var(--app-dark-blue); color: var(--app-violet-1); }
    .wts-opt-sep    { background: var(--app-dark-blue); color: rgba(255,255,255,0.4); }
`;
