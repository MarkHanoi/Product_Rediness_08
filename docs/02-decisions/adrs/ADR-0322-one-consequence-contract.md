# ADR-0322 — One consequence contract: plan → execute → report

- **Status**: ACCEPTED — ratified by STR-06 (founder directive, 2026-08-12)
- **Evidence**: review Parts C/D/E evidence sweeps — the preview capability is
  AUTHORED-BUT-UNWIRED end to end (SpeculativeEngine works, overlay instantiated, trigger
  surface has **zero call sites**); `CascadeRunner` is registered nowhere and **eleven
  production handlers carry identical "inert" headers**; no command returns a consequence
  report (`EventRecord` carries store keys, not element ids); `planOpeningRefit` is the one
  working plan-then-decide idiom in production.
- **Constrains**: every future preview/impact/report/confirmation implementation ·
  `CommandResult` evolution · the G-REASON gate family. **Subordinate to**: STR-06.

## Decision

1. **One authoritative consequence object.** A single contract-first type family
   (`ConsequencePlan` / `ConsequenceReport`) represents the consequence answer everywhere:
   preview, execution reporting, confirmation, certification, AI. No surface gets its own
   representation. The exact field shape may evolve; **the singularity may not.**
2. **The lifecycle is plan → [confirm] → execute → read back → report**, where the plan is
   computed by a `ConsequencePlanner` that MUST NOT mutate authoritative state, the executor
   CONSUMES the plan rather than recomputing under different rules, and the report compares
   **predicted vs actual**. Plan/execution divergence ("preview said A/B/C, execution did
   A/B/D") is a **named certification-failure class** (G-REASON-03).
3. **Preview is never execute-plus-undo.** A successful preview leaves authoritative stores,
   event streams, undo state, dirty state and externally observable command state unchanged
   (G-REASON-01). A byte-identical final snapshot is NOT proof of non-mutation.
4. **Impact ≠ Preview.** Impact answers *what is implicated by a proposed change* (a read
   over dependencies/topology); Preview answers *what deterministic consequence plan results
   from this command*. Preview may consume Impact; the two are separate capabilities and
   neither is `graph.query`'s dumping ground.
5. **UNDETERMINED is first-class.** Impact cells the planner cannot compute carry
   `{kind:'undetermined', reason: NO_DEPENDENCY_INDEX | ENGINE_NOT_AVAILABLE |
   UNSUPPORTED_ELEMENT_TYPE | STALE_DERIVED_STATE}` — never `[]`. Known + unknown = empty is
   the session's signature defect and is forbidden here by construction.
6. **`untouched` is derived, never persisted.** The planner produces `changed` and
   `excluded` (considered-and-determined-unchanged); `undetermined` is declared;
   `untouched = scope − changed − excluded − undetermined` is computed at report time.
   Production computes the semantic sets; certification verifies them against independent
   read-back — one algorithm, two consumers, never two implementations.
7. **The seed is `planOpeningRefit`, generalised** — `ConsequencePlanner<TCommand, TPlan>`,
   per-operation planners composed by an aggregate, starting with `wall.move`
   (opening-refit · junction · room-boundary · topology · regeneration branches). No generic
   ImpactEngine before one golden operation closes end-to-end.
8. **Convergence, not accretion.** `SpeculativeEngine` is finished, mined for parts, or
   retired — explicitly, with a recorded disposition (ADR-0323). `CascadeRunner` is promoted
   ONLY through its named test (`wall.move → deterministic predicted command set → no
   mutation → stable result`); otherwise replaced or reclassified, and the eleven "inert"
   headers corrected either way.
9. **Migration, not flag-day.** `CommandResult.affectedElementIds` is redefined as the
   legacy minimum-direct set and deprecated; `consequence?: ConsequenceReport` arrives
   optionally; ~300 commands are never broken simultaneously.
10. **Confirmation is a policy over the plan** (`none | recommended | required` + reasons),
    computed AFTER consequence calculation, and **approval binds**: `planId` + `planHash` +
    state-hash generated together; execution verifies both; staleness invalidates approval
    and forces re-plan (G-REASON-05).

## The gates this ADR commissions

`G-REASON-01` preview purity · `02` plan determinism · `03` execution-plan agreement ·
`04` AI behavioral parity (ADR-0324 owns the normalize rule) · `05` approval binding ·
`06` report completeness per declared contract · `07` no silent partial batch. All under the
four-exit-code contract with subject floors; all negative-tested before trusted.

## Not decided here

The exact TypeScript field shape (the plan doc owns the first draft; expect revision after
`wall.move` closes) · which package hosts the planner (bus-adjacent; decided in R1) ·
whether `CascadeRunner` survives (its test decides, not this ADR).
