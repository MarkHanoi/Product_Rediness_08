// @pryzm/plugin-dxf — empty workspace-package shell (F-prereq.0).
//
// PRYZM 2 — empty DXF plugin shell (F-prereq.0). DXF import/export wiring lands in F.x; this scaffold reserves the workspace package + descriptor slot.
//
// This file intentionally contains no handlers, stores, or contributions.
// Real wiring lands per-family in the F.x sub-phases of
// `PRYZM2-WIREUP-PLAN-S72`; until then, importers get a stable PLUGIN_ID
// + PLUGIN_NAME pair so descriptor registration code can compile.

export const PLUGIN_ID = 'dxf' as const;
export const PLUGIN_NAME = '@pryzm/plugin-dxf' as const;

// PV-04 / C75 §7.7 — the ValueProvenance mapping for DXF is absent and the
// absence is recorded by name, binding on the F.x wiring that lands here.
export { DXF_PROVENANCE_MAPPING } from './provenance-absence.js';
