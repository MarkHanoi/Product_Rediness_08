/**
 * global-window.d.ts — ai-host package window-global declarations
 *
 * Mirrors the subset of src/global-window.d.ts that packages/ai-host/src
 * accesses via the window object.  Required because per-package `pnpm tsc
 * --noEmit` does not load the root src/global-window.d.ts; without these
 * declarations every `window.wallStore` etc. produces TS2339. // TODO(TASK-08)
 *
 * Typed `any` per the same progressive-tightening plan as the root shim
 * (TODO(D.x): replace with specific imported types as each store is
 * migrated to constructor injection per C02 §1.3 P4).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

declare global {
  interface Window {
    // ─── Commands & context ───────────────────────────────────────────────
    commandContext?: any;
    bimKernel?: any;
    bimManager?: any;
    projectContext?: any;
    CreateWallOpeningCommand?: any;

    // ─── Runtime bus ──────────────────────────────────────────────────────
    runtime?: any;

    // ─── Command infrastructure ───────────────────────────────────────────
    commandManager?: any;
    selectionManager?: any;
    selectionBus?: any;
    worldModelAdapter?: any;
    annotationManager?: any;
    viewController?: any;

    // ─── Speech recognition ───────────────────────────────────────────────
    SpeechRecognition?: any;
    webkitSpeechRecognition?: any;

    // ─── Domain stores ────────────────────────────────────────────────────
    roomStore?: any;
    templateStore?: any;
    doorStore?: any;

    // ─── Element data stores ──────────────────────────────────────────────
    wallStore?: any;
    slabStore?: any;
    columnStore?: any;
    beamStore?: any;
    stairStore?: any;
    curtainWallStore?: any;
    curtainPanelStore?: any;
    componentInstanceStore?: any;
    furnitureStore?: any;
    handrailStore?: any;
    gridStore?: any;
    vgGovernanceStore?: any;
    visibilityRuleEngine?: any;
    semanticIndex?: any;
    sheetStore?: any;
    scheduleStore?: any;
    viewDefinitionStore?: any;
  }
}

export {};
