/**
 * @file src/styles/panels/structuralTypeSelector.ts
 *
 * CSS for Column Type Selector (prefix: colts-), Beam Type Selector (prefix: bts-),
 * and Stair Type Selector (prefix: stairts-).
 * CONTRACT §05 §2 — CSS layer only, zero logic.
 */

export const COLUMN_TYPE_SELECTOR_STYLES = `
    .colts-outer { margin-bottom: 6px; }
    .colts-label {
        font-size: 10px;
        color: rgba(255,255,255,0.7);
        font-weight: 600;
        margin-bottom: 4px;
        letter-spacing: 0.05em;
        text-transform: uppercase;
    }
    .colts-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .colts-select {
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
    .colts-sub-row {
        display: flex;
        align-items: center;
        gap: 6px;
        width: 100%;
        margin-top: 4px;
    }
    .colts-dim-label {
        font-size: 10px;
        color: rgba(255,255,255,0.6);
        flex-shrink: 0;
    }
    .colts-dim-input {
        width: 52px;
        font-size: 11px;
        padding: 3px 5px;
        border-radius: 4px;
        border: none;
        background: rgba(255,255,255,0.15);
        color: #fff;
        outline: none;
        text-align: right;
    }
    .colts-apply-btn {
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
    .colts-apply-btn:hover { background: rgba(255,255,255,0.35); }
    .colts-opt-dark   { background: var(--app-dark-blue); color: #fff; }
    .colts-opt-sep    { background: var(--app-dark-blue); color: rgba(255,255,255,0.4); }
`;

export const BEAM_TYPE_SELECTOR_STYLES = `
    .bts-outer { margin-bottom: 6px; }
    .bts-label {
        font-size: 10px;
        color: rgba(255,255,255,0.7);
        font-weight: 600;
        margin-bottom: 4px;
        letter-spacing: 0.05em;
        text-transform: uppercase;
    }
    .bts-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .bts-select {
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
    .bts-sub-row {
        display: flex;
        align-items: center;
        gap: 6px;
        width: 100%;
        margin-top: 4px;
    }
    .bts-dim-label {
        font-size: 10px;
        color: rgba(255,255,255,0.6);
        flex-shrink: 0;
    }
    .bts-dim-input {
        width: 52px;
        font-size: 11px;
        padding: 3px 5px;
        border-radius: 4px;
        border: none;
        background: rgba(255,255,255,0.15);
        color: #fff;
        outline: none;
        text-align: right;
    }
    .bts-apply-btn {
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
    .bts-apply-btn:hover { background: rgba(255,255,255,0.35); }
    .bts-opt-dark  { background: var(--app-dark-blue); color: #fff; }
    .bts-opt-sep   { background: var(--app-dark-blue); color: rgba(255,255,255,0.4); }
`;

export const STAIR_TYPE_SELECTOR_STYLES = `
    .stairts-outer { margin-bottom: 6px; }
    .stairts-label {
        font-size: 10px;
        color: rgba(255,255,255,0.7);
        font-weight: 600;
        margin-bottom: 4px;
        letter-spacing: 0.05em;
        text-transform: uppercase;
    }
    .stairts-row { display: flex; align-items: center; gap: 6px; }
    .stairts-select {
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
    .stairts-apply-btn {
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
    .stairts-apply-btn:hover { background: rgba(255,255,255,0.35); }
    .stairts-opt-dark { background: var(--app-dark-blue); color: #fff; }
`;
