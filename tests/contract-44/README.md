# Contract 44 — Plan View / SVP Parity Regression Tests

Each `G{N}.test.ts` is a standing regression for one Contract 44 gap (G1–G10).
The gaps are the formal customer-facing parity defects between PRYZM 1's plan
view and PRYZM 1's Structural View Port (SVP).  PRYZM 2 closes each gap **in
the new architecture**; these tests guard that closure forever.

| Gap | Description |
|-----|-------------|
| G1  | Plan view elements MUST be scoped to the active level. |
| G2  | Cross-level structural elements MUST NOT bleed through. |
| G3  | Linked levels (stacked buildings) MUST isolate correctly. |
| G4  | Style overrides MUST be per-view (not global). |
| G5  | Visibility flags MUST persist per-view. |
| G6  | Override graphics (material) MUST apply per-view. |
| G7  | Poche pattern MUST honour override material. |
| G8  | Poche pattern MUST apply to linked-model elements. |
| G9  | Selection in plan view MUST update the SelectionStore. |
| G10 | Drag in plan view MUST create persisted `element.move` commands. |

Spec: `docs/03_PRYZM3/reference/phases/PHASE-2/2B-Q2-M16-M18-PLAN-VIEW.md` §S33.
ADR:  `docs/architecture/adr/0025-plan-view-svp-parity-contract-44.md`.
