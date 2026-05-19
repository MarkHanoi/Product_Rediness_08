# ADR-0031 — S61 Staged Legacy Deletion + 90-day Sunset Window

> Status: Accepted — sprint-scoped (S61, 2026-04-28)
> Context: Phase 3C entry. Per `specs/SPEC-27-MIGRATION-ROLLBACK.md` §4.3, S61
> deletes `src/engine/EngineBootstrap.ts` and promotes `apps/editor/src/main.ts`
> as the new composition root. Per SPEC-27 §4.4 strangler-fig discipline, the
> physical deletion gate requires four conditions, three of which (parity
> verification, two zero-`git-blame` sprints, ADR-018 cut-list status) cannot
> be cleared inside one sprint. This ADR records the staged path that lets S61
> close its exit criteria without violating the discipline.
> Spec authority: SPEC > ADR > MASTER PLAN > CRITICAL-REVIEW > 05-IMPL > phase
> docs (per `phases/PHASES-AMENDMENT-2026-04-27-ROBUSTNESS.md` §0).

## Context

`src/engine/EngineBootstrap.ts` is a 2,035-line PRYZM 1 engine initialiser
(THREE, OBC, OBCF, BUI, fragments, Cesium, web-ifc, RGBELoader,
TransformControls, …). It is dynamically imported exactly once from
`src/main.ts:215` (`loadEngine()`) when the user opens a project under the
default boot path. There are zero static `import … from '…/EngineBootstrap'`
sites elsewhere in the tree — the rg-counted ~80 mentions are comments,
type-of identifiers (`type EngineModule = typeof import('./engine/EngineBootstrap')`
on `src/main.ts:209`), and dev-tool diagnostics (`ViewportCrashGuard`,
`RenderHealthIndicator`, `PlatformShell`, etc.) referencing the boot symbol
for error attribution.

`apps/editor/src/` already ships the new modular bootstrap surface:
`bootstrap.ts` (data), `bootstrap.render.ts` (render), `bootstrap.data.ts`,
`bootstrap.render.data.ts`, and `bootstrap.everything.ts` (every L4 plugin
wired by descriptor — see ADR-0021). The `?pryzm2=1` URL flag in
`src/main.ts:34-200` exclusively boots PRYZM 2 today; PRYZM 1 is the default.

SPEC-27 §4.2 declares four deletion gates:

1. Replacement code green-tested (CI + parity fixtures).
2. No `import` from any active code references the zone.
3. Two consecutive sprints with zero `git blame` activity on the zone.
4. ADR-018 hasn't fired Tier-3 T3.5 (date slip).

S61 in a single sprint can clear gate 2 (the static-importer count is
already zero per `scripts/scan-engine-bootstrap-importers.mjs`) but cannot
clear gates 1, 3, or 4 because:

- Gate 1: PRYZM 2 visual + e2e parity is not yet measured against the full
  PRYZM 1 surface (sheet editor, view properties panel, schedule panel,
  IFC export auditing, fragment-based exports, Cesium geospatial overlay,
  etc.). Parity is the joint subject of S55–S60 + S61 D6.
- Gate 3: deletion this sprint would itself be `git blame` activity; the
  two-sprint quiet period requires no edits across S61 + S62.
- Gate 4: ADR-018 cut-list state at the time of the physical deletion is
  by definition not knowable until S61 D9 retrospectively.

## Decision

S61 splits "deletion" from "decommissioning":

- **D1 (this commit)** — composition root file `apps/editor/src/main.ts`
  lands; sunset migration tool scaffold lands; D1 importer scanner runs
  green (zero static + zero require importers); 90-day sunset countdown
  begins per SPEC-27 §3.2 customer-comms cadence.
- **D2–D4 (later this sprint)** — every remaining `EngineBootstrap`
  reference is rewritten to refer to a stable interface (the dynamic
  `loadEngine()` callsite stays, but the module pointer becomes a
  feature-flag-routed selector that returns either the legacy
  `EngineBootstrap` exports or the new `apps/editor/src/main.ts` exports).
- **D5 (later this sprint)** — default boot flips: `?pryzm1=1` becomes
  the *deprecated* opt-in route; un-flagged URLs go to
  `apps/editor/src/main.ts`. Sunset banner becomes visible to PRYZM 1
  sessions. PRYZM 1 remains code-resident but unreferenced from the
  default path.
- **D6 (later this sprint)** — visual + e2e regression suite confirms
  `bundle.size.initial-app < 1.8 MB gzip` (per `apps/bench/`) and
  `visual-diff < 2 px` on the 30-case fixture (per ADR-0030
  reconciliation contract).
- **D7–D9 (later this sprint)** — 5% canary cohort routed to the new
  default; OTel kill switches K3C-A (boot impact), K3C-B (sandbox
  escape), and K3C-C (API p95) monitored; full rollout on D9.
- **S70 (90 days later)** — physical deletion of `src/engine/EngineBootstrap.ts`
  + the rest of `src/engine/` per SPEC-27 §4.3. By S70, all four §4.2
  gates have cleared (sustained zero importers, two quiet sprints,
  ADR-018 status known, parity bench history accumulated).

Three concrete design choices inside this decision:

1. **The composition root is `apps/editor/src/main.ts`, not a new file.**
   The phase doc template (PHASE-3C-Q3-M31-M33-PLUGIN-SDK-MARKETPLACE-APIS.md
   lines 105-144) names that exact path. It re-exports `bootstrapWithEverything`
   from `./bootstrap.everything.ts` plus a thin `mountEditor(opts)` DOM
   wrapper. No new bootstrap logic is added in `main.ts` — the heavy lifting
   lives in `bootstrap.everything.ts` (already shipped per ADR-0021).

2. **The sunset migration tool is a CLI, not an in-app modal.**
   PRYZM 1 → PRYZM 2 conversion is a one-time per-project event executed
   by the user (or by a self-host installer) when they're ready to migrate.
   It reads a JSON snapshot exported from PRYZM 1 (per SPEC-26 §1) and
   produces a `.pryzm` v1 archive. An in-app prompt ships at S62 once the
   CLI is exercise-tested by beta cohort.

3. **The 90-day countdown is calendar-time, not sprint-relative.**
   SPEC-27 §3.2 + ADR-0021 customer-comms requires public deprecation
   notice 90 days before deletion. The countdown timer in
   `apps/editor/migrations/sunset-pryzm1.md` (front-matter `sunsetOpensAt`)
   is the source of truth. Calendar-relative because beta cohort sessions
   that span sprints must see consistent banner copy.

## Consequences

Positive:

- S61 closes its exit criteria without breaking strangler-fig discipline.
- The 90-day window aligns with ADR-021 enterprise customer comms (no
  surprise deletion).
- Bundle-size pressure relieves at D5 (un-flagged users no longer pay
  the PRYZM 1 chunk download).
- The deletion at S70 becomes mechanical (delete the directory + its
  one-line dynamic-import in `src/main.ts:215`) once the gates clear.

Negative / accepted trade-offs:

- The repo carries ~12 KLOC of dead code (PRYZM 1) for ~90 days. Mitigated
  by Vite's tree-shaking on the un-flagged path: the PRYZM 1 chunk is
  no longer in the default user's bundle from D5 onward.
- The sunset banner UI work is duplicated effort if a customer never
  flips into PRYZM 1 again; we accept this for the support-cost reduction.
- Sprint S62 cannot touch `src/engine/` (per gate 3). PROCESS-TRACKER
  S62 row carries an explicit "do-not-touch zone: src/engine/" annotation
  set by this ADR.

## References

- SPEC-27 §3.2, §4.1, §4.2, §4.3, §4.4 — migration & rollback.
- SPEC-26 §1, §6 — `.pryzm` archive format that the sunset CLI emits.
- ADR-0017 — headless package surface (consumes the same composition root).
- ADR-0018 — capacity cut list (gate 4 source).
- ADR-0021 — `bootstrapWithEverything` (the surface re-exported from `main.ts`).
- ADR-0030 — Phase 2B post-audit reconciliation (visual diff contract).
- `phases/PHASE-3C-Q3-M31-M33-PLUGIN-SDK-MARKETPLACE-APIS.md` §S61 D1–D10.
- `phases/PHASE-3C-Q3-M31-M33-SDK-MARKETPLACE-PUBLIC-API.md` §S61 composition root.
- `apps/editor/migrations/sunset-pryzm1.md` — the per-zone inventory + gate-status table.
- `tools/pryzm1-sunset/` — the CLI scaffold landed alongside this ADR.
