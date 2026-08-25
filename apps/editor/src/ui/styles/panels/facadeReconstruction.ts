/**
 * @file apps/editor/src/ui/styles/panels/facadeReconstruction.ts
 * CSS for the Facade Reconstruction panel (photo -> facade IR).
 *
 * CSS prefix: frp-
 * C108 — FACADE-RECONSTRUCTION-FROM-IMAGE · SPEC-FACADE-RECONSTRUCTION-PIPELINE §4
 * §05 §3 — prefix claimed: frp- / FacadeReconstructionPanel /
 *          apps/editor/src/ui/facade/FacadeReconstructionPanel.ts
 * §05 §2.1 — injected through AppTheme, never as an independent <style>.
 */

export const FACADE_RECONSTRUCTION_STYLES = `
    .frp-panel {
        position: fixed;
        right: 72px;
        top: 72px;
        width: 460px;
        max-height: calc(100vh - 110px);
        display: flex;
        flex-direction: column;
        background: rgba(13, 18, 30, 0.97);
        color: #fff;
        border: 1px solid rgba(102, 0, 255, 0.38);
        border-radius: 12px;
        box-shadow: 0 18px 54px rgba(0,0,0,0.4), 0 0 0 1px rgba(102,0,255,0.12);
        overflow: hidden;
        backdrop-filter: blur(16px);
        z-index: 8500;
        font-family: var(--app-font);
    }
    .frp-panel.frp-hidden { display: none; }
    .frp-hidden { display: none !important; }

    .frp-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 9px 12px;
        background: linear-gradient(135deg, #8B5CF6 0%, #6600FF 100%);
        flex-shrink: 0;
        user-select: none;
    }
    .frp-title {
        font-size: 11.5px;
        font-weight: 800;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        flex: 1;
    }
    .frp-chip {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.02em;
        padding: 3px 8px;
        border-radius: 999px;
        white-space: nowrap;
        border: 1px solid rgba(255,255,255,0.35);
    }
    .frp-close {
        background: transparent;
        border: none;
        color: #fff;
        font-size: 18px;
        line-height: 1;
        cursor: pointer;
        padding: 0 2px;
    }

    .frp-body {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 10px 12px 14px;
        overflow-y: auto;
    }

    .frp-toolbar { display: flex; flex-wrap: wrap; gap: 6px; }
    .frp-btn {
        font-family: inherit;
        font-size: 10.5px;
        font-weight: 700;
        letter-spacing: 0.02em;
        padding: 6px 10px;
        border-radius: 7px;
        border: 1px solid rgba(255,255,255,0.18);
        background: rgba(255,255,255,0.06);
        color: #fff;
        cursor: pointer;
        white-space: nowrap;
    }
    .frp-btn:hover:not(:disabled) { background: rgba(102,0,255,0.28); border-color: rgba(102,0,255,0.6); }
    .frp-btn:disabled { opacity: 0.38; cursor: not-allowed; }
    .frp-btn--primary { background: linear-gradient(135deg, #8B5CF6 0%, #6600FF 100%); border-color: transparent; }
    .frp-btn--armed { background: #6600FF; border-color: #fff; box-shadow: 0 0 0 2px rgba(255,255,255,0.35); }
    .frp-file { display: none; }

    .frp-hint {
        font-size: 10.5px;
        line-height: 1.5;
        padding: 7px 9px;
        border-radius: 7px;
        background: rgba(102,0,255,0.18);
        border: 1px solid rgba(102,0,255,0.45);
    }
    .frp-status { font-size: 10.5px; line-height: 1.45; opacity: 0.85; }
    .frp-status--busy  { color: #FFA500; }
    .frp-status--error { color: #FF7A85; }
    .frp-status--ok    { color: #9CE7B0; }

    .frp-refform {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;
        font-size: 10.5px;
        padding: 8px 9px;
        border-radius: 7px;
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.14);
    }
    .frp-input {
        font-family: inherit;
        font-size: 11px;
        width: 88px;
        padding: 4px 7px;
        border-radius: 6px;
        border: 1px solid rgba(255,255,255,0.24);
        background: rgba(0,0,0,0.35);
        color: #fff;
    }

    .frp-layers { display: flex; flex-wrap: wrap; gap: 4px; }
    .frp-layerbtn {
        font-family: inherit;
        font-size: 9.5px;
        font-weight: 700;
        letter-spacing: 0.02em;
        padding: 4px 7px;
        border-radius: 999px;
        border: 1px solid rgba(255,255,255,0.16);
        background: rgba(255,255,255,0.04);
        color: rgba(255,255,255,0.72);
        cursor: pointer;
    }
    .frp-layerbtn:hover { color: #fff; border-color: rgba(102,0,255,0.6); }
    .frp-layerbtn--active {
        background: #6600FF;
        border-color: #6600FF;
        color: #fff;
    }

    .frp-stage {
        display: flex;
        flex-direction: column;
        gap: 5px;
        background: rgba(0,0,0,0.35);
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 8px;
        padding: 8px;
    }
    .frp-canvas {
        width: 100%;
        height: auto;
        display: block;
        border-radius: 5px;
        image-rendering: auto;
        background: #0d121e;
    }
    .frp-canvas--picking { cursor: crosshair; box-shadow: 0 0 0 2px #6600FF; }
    .frp-canvasnote { font-size: 9.5px; line-height: 1.45; opacity: 0.62; }
    .frp-canvasnote--refused {
        opacity: 1;
        color: #FFC46B;
    }

    .frp-readout { display: flex; flex-direction: column; gap: 4px; }
    .frp-row {
        display: grid;
        grid-template-columns: 88px 1fr auto;
        align-items: center;
        gap: 8px;
        font-size: 10.5px;
        padding: 6px 8px;
        border-radius: 7px;
        background: rgba(255,255,255,0.04);
    }
    .frp-row-label { font-weight: 800; letter-spacing: 0.02em; opacity: 0.72; text-transform: uppercase; font-size: 9px; }
    .frp-row-value { line-height: 1.4; }
    .frp-row-chip {
        font-size: 9.5px;
        font-weight: 800;
        padding: 2px 7px;
        border-radius: 999px;
        white-space: nowrap;
        border: 1px solid rgba(255,255,255,0.28);
    }
    .frp-row-caveat {
        grid-column: 1 / -1;
        font-size: 9.5px;
        line-height: 1.45;
        color: #FFC46B;
        border-left: 2px solid #FFA500;
        padding-left: 7px;
        margin-top: 3px;
    }
    .frp-standing {
        font-size: 9.5px;
        line-height: 1.5;
        opacity: 0.72;
        padding: 8px 9px;
        border-radius: 7px;
        border: 1px dashed rgba(255,255,255,0.22);
    }

    .frp-sectiontitle {
        font-size: 9px;
        font-weight: 800;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        opacity: 0.6;
        margin-top: 2px;
    }
    .frp-notes {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 3px;
        font-size: 9.5px;
        line-height: 1.45;
        opacity: 0.78;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    .frp-notes li { padding-left: 9px; border-left: 1px solid rgba(255,255,255,0.16); }
`;
