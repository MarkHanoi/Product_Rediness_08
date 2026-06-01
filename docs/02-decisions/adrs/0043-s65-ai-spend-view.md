# ADR-0043 — S65 Workspace Admin AI Spend View

* **Status**: Accepted (sprint-scoped, S65, 2026-04-28)
* **Related**: ADR-0042 (AI public API), ADR-0041 (api-gateway), SPEC-28 §9

## Context

Phase 3C §S65 work-item 7 + SPEC-28 §9 require a Workspace Admin view of cumulative AI spend. The view must support filtering by workspace, project, actor, and time range, and must aggregate by seven distinct axes (workspace, project, actor, surface, day, model, workflow). At S65 D1 there is no real spend data — telemetry wiring is owned by ADR-0037 / S66 — so the package ships as a pure aggregator over an injectable `AiSpendStore`.

## Decisions

### A. Standalone `packages/ai-spend` workspace package
Aggregator + store + types live in their own package so the marketplace-api, api-gateway, and the AI host can all depend on the same `AiSpendEntry` schema without a circular dep graph. Pure functions (no side effects, no I/O) — only the `InMemoryAiSpendStore` holds state.

### B. `AiSpendEntry` is the single source of truth
Zod schema with: `id`, `workspaceId`, `projectId`, `actorId`, `surface` (`editor | plugin | cli | api | mcp`), `model`, `workflow?`, `ts: int64ms`, `costUsd: number ≥ 0`, `tokensIn?`, `tokensOut?`. The schema is the contract between the AI host (writer) and the admin view (reader); anything dropped from the schema breaks the contract.

### C. Seven aggregation axes, one helper each
`aggregateByWorkspace`, `byProject`, `byActor`, `bySurface`, `byDay`, `byModel`, `byWorkflow`. Every aggregator returns `AiSpendAggregateRow[]` sorted `totalCostUsd desc, key asc` — stable, deterministic, paginatable. Day buckets use `Math.floor(ts / 86_400_000)` to avoid timezone drift; the API returns `firstSeenTs` + `lastSeenTs` per row so clients can render local dates.

### D. `getSpendTotals` returns headline numbers
Single-row roll-up of `count`, `totalCostUsd`, `distinctProjects`, `distinctActors`. Powers the SPEC-28 §9 dashboard header card.

### E. Filtering is pre-aggregation
`AiSpendQuery` filters (`workspaceId`, `projectId`, `actorId`, `fromTs`, `toTs`) are applied at the store layer before aggregation, not after, so queries scale linearly in the *filtered* set, not the full table.

## Consequences

* Aggregator is < 250 LoC + 28 tests; full coverage at D1
* No persistence at D1 — the in-memory store is the only adapter; Postgres adapter lands at S66
* The 7-axis fan-out is the contract; adding an 8th axis at S66 requires a minor version bump on `@pryzm/ai-spend`

## Deferrals

| Item | Owner | Reason |
|---|---|---|
| Postgres `AiSpendStore` adapter | S66 | persistence is orthogonal to the API contract |
| Real-time spend stream (WS) | S67 | aggregation cadence is daily; pull-based is enough |
| Cost-projection model | S70 | needs ≥ 30 days of history |
