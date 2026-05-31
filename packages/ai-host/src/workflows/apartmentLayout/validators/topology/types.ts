// A-1 — Topology mandatory-adjacency validator types
// (APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK-2026-05-29
// Part B §13–§17, A-class table).
//
// Pure data + types only — ZERO imports. Sister to the existing
// `topology/types.ts` (TopologyFinding / TopologyValidation), but kept in a
// SEPARATE namespace under `validators/topology/` because this validator takes
// a different, lighter-weight input shape: POJO rooms + a pre-built adjacency
// edge list (no BubbleGraph dependency, no `programRules` reach-in). The two
// modules are deliberately non-coupled so this slice ships as a stand-alone
// architect-grade rule check, runnable from any caller that can supply rooms +
// edges (the deterministic engine, the AI relay, or a future plan-import path).

/**
 * One topology violation. The 8 adjacency categories are encoded in `classId`
 * (A-1 mandatory, A-2 preferred, A-3 forbidden, …) so the modal surfacer can
 * group violations by class. Severity is binary: `'error'` ⇒ admissibility
 * gate (the caller drops the candidate); `'warning'` ⇒ Pareto-soft penalty.
 *
 * `roomAId` identifies the failing room; `roomATypeName` and `roomBTypeName`
 * carry the human-readable room types so the message string can include both
 * for traceability (and the modal can render type badges without re-lookup).
 */
export interface TopologyViolation {
    readonly classId: 'A-1' | 'A-2' | string;
    readonly severity: 'error' | 'warning';
    readonly roomAId: string;
    readonly roomATypeName: string;
    readonly roomBTypeName: string;  // expected partner type (or a comma-joined
                                     //  list when the rule accepts one-of-many)
    readonly message: string;
}

/**
 * One realised adjacency between two rooms. Unordered — the validator treats
 * `{a, b}` and `{b, a}` as identical. Produced by any upstream that knows
 * which rooms touch (shared wall) or are connected through a door.
 */
export type AdjacencyEdge = { readonly aId: string; readonly bId: string };
