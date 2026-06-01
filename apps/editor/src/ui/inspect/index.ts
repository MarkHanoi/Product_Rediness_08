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
} from './ModelTree';
export {
    renderModelTreeNode,
    type ModelTreeNodeInputs,
} from './ModelTreeNode';
