/**
 * @file src/styles/panels/ceilingFloorTypeSelector.ts
 *
 * CSS for Ceiling Type Selector (prefix: cts-) and Floor Type Selector (prefix: fts-).
 * CONTRACT §05 §2 — CSS layer only, zero logic.
 * CSS prefix table entries:
 *   cts-  — CeilingTypeSelectorWidget
 *   fts-  — FloorTypeSelectorWidget
 */

export const CEILING_TYPE_SELECTOR_STYLES = `
    .cts-outer { margin-bottom: 6px; }
    .cts-label {
        font-size: 10px;
        color: rgba(255,255,255,0.7);
        font-weight: 600;
        margin-bottom: 4px;
        letter-spacing: 0.05em;
        text-transform: uppercase;
    }
    .cts-row { display: flex; align-items: center; gap: 6px; }
    .cts-select {
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
    .cts-strip {
        display: flex;
        height: 8px;
        width: 44px;
        border-radius: 3px;
        overflow: hidden;
        gap: 1px;
        flex-shrink: 0;
    }
    .cts-apply-btn {
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
    .cts-apply-btn:hover { background: rgba(255,255,255,0.35); }
    .cts-opt-dark    { background: var(--app-dark-blue); color: #fff; }
    .cts-opt-action  { background: var(--app-dark-blue); color: var(--app-violet-1); }
    .cts-opt-sep     { background: var(--app-dark-blue); color: rgba(255,255,255,0.4); }
`;

export const FLOOR_TYPE_SELECTOR_STYLES = `
    .fts-outer { margin-bottom: 6px; }
    .fts-label {
        font-size: 10px;
        color: rgba(255,255,255,0.7);
        font-weight: 600;
        margin-bottom: 4px;
        letter-spacing: 0.05em;
        text-transform: uppercase;
    }
    .fts-row { display: flex; align-items: center; gap: 6px; }
    .fts-select {
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
    .fts-strip {
        display: flex;
        height: 8px;
        width: 44px;
        border-radius: 3px;
        overflow: hidden;
        gap: 1px;
        flex-shrink: 0;
    }
    .fts-apply-btn {
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
    .fts-apply-btn:hover { background: rgba(255,255,255,0.35); }
    .fts-opt-dark    { background: var(--app-dark-blue); color: #fff; }
    .fts-opt-action  { background: var(--app-dark-blue); color: var(--app-violet-1); }
    .fts-opt-sep     { background: var(--app-dark-blue); color: rgba(255,255,255,0.4); }
`;
