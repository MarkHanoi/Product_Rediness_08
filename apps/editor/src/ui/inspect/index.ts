// C27 INS-α-4 — Inspect surface barrel.
//
// Re-exports the model-tree component + node renderer so consumers (e.g.
// the future Inspect tab + the Sheets view picker per C27 §1.2) reach the
// single tree implementation through one import path.  The legacy
// `AuditStack.ts` continues to live in the same folder until the C27
// migration retires it (see C27 §9).

export {
    ModelTreeComponent,
    type ModelTreeRuntime,
    type ModelTreeOptions,
    type ModelTreeContextMenuPayload,
} from './ModelTree';
export {
    renderModelTreeNode,
    type ModelTreeNodeInputs,
} from './ModelTreeNode';
export {
    ProvenanceTab,
    selectArtefactsForElement,
    formatApprovalStatus,
    approvalStatusClass,
    formatCostUsd,
    formatTimestamp,
    renderArtefactCard,
    type ProvenanceTabOptions,
} from './ProvenanceTab';
export {
    ProvenanceMenuOrchestrator,
    type ProvenanceMenuOrchestratorOptions,
} from './ProvenanceMenuOrchestrator';
// A.24 / A.31.e — first-class Inspect panel (Model Tree + Provenance) promoted
// out of the dev-only modelTreeTestModal. NOTE: imported lazily by consumers
// (ProjectBrowserPanel) to avoid pulling the isolation pipeline into the
// barrel's eager-load path, but re-exported here for discoverability + tests.
export {
    buildInspectPanel,
    type InspectPanelHandle,
} from './InspectPanel';
