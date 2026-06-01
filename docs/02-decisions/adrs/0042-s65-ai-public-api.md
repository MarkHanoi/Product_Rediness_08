# ADR-0042 — S65 AI Public API (Read-Only L7.5 Surface)

* **Status**: Accepted (sprint-scoped, S65, 2026-04-28)
* **Related**: ADR-0041 (api-gateway), ADR-037 (AI host lazy bootstrap), SPEC-28 §9, K3-D gate

## Context

Phase 3C §S65 work-item 3 calls for a "public read-only L7.5 AI surface". Two pieces of prior art constrain the design: (i) ADR-0037 lazy-bootstraps the AI host inside the editor, and (ii) marketplace-api at S64 D1 publishes plugin descriptors but does not invoke them. The public API needs to publish the *workflow catalog* (predictable cost, stable IDs) and *accept run submissions*, but must not expose the underlying provider tokens, prompt templates, or model routing decisions.

## Decisions

### A. Three endpoints — two read, one write
`GET /v1/ai/workflows` (list), `GET /v1/ai/workflows/:id` (single), `POST /v1/ai/workflows/:id/invoke` (submit a run). No streaming completion endpoint at S65 — completions arrive on the WS `/projects/:projectId/stream` channel as commit events. This keeps the HTTP request short (no provider timeouts bleeding through) and the streaming surface a single channel per project per ADR-0041 §F.

### B. Discovery requires `project:read` (revised at S65 D1)
Initial draft proposed unauthenticated discovery. **Revision**: every operation in the YAML must declare a security requirement to satisfy the ADR-0039 OpenAPI invariant checker (every operation has at least one OAuth2 security requirement, no anonymous holes). Catalog browsing therefore requires `project:read` — any authenticated workspace user can list workflows. Marketing-style anonymous browsing is delivered via pre-rendered docs-site pages (`apps/docs-site/.../api/ai.md`), not the live API. Submission still requires the `ai:invoke` scope.

### C. Submission is asynchronous + budget-checked
`POST .../invoke` returns 202 + `{ runId, workflowId, status: 'queued', estimatedCostUsd }` on accept; 422 + `{ error: 'budget_exceeded' | 'workflow_not_registered' | 'pre_flight_rejected', error_description }` on rejection. The pre-flight check (`AiInvokePort.submit`) consults `CostMeter.checkBudget(workspaceId, estimatedCostUsd)` before queueing. The HTTP request never blocks on provider latency — the run lives on the WS channel afterward.

### D. Cost predictability via `WorkflowDescriptor.estimatedCostUsd`
Every descriptor declares an `estimatedCostUsd: number`. Stub workflows at D1 use deterministic constants (`plan.critique` $0.08, `auto.layout` $0.12). Real workflows register with their measured 95th-percentile cost from the AI host telemetry table.

### E. `AiInvokePort` is a single interface
`AiInvokePort.submit({ workflowId, projectId, input, actorId })` returns `Promise<{ runId, status, reason? }>`. Concrete `InMemoryAiInvokePort` for tests; production adapter forwards to the AI host queue at S65 D9. Keeps the public API decoupled from the AI host's internal lifecycle (ADR-0037).

## Consequences

* AI public API is testable end-to-end without provider credentials
* `estimatedCostUsd` is the contract — workflows that drift more than 20% trip a separate alert in S66 (out of scope here)
* Async submission means clients must subscribe to the project WS channel; documented in `apps/docs-site/.../api/ai.md` at S66

## Deferrals

| Item | Owner | Reason |
|---|---|---|
| Provider streaming over WS | S66 | needs commit-event schema extension |
| Per-workflow rate-limit overrides | S67 | ADR-018 default buckets satisfy initial demand |
| Workflow-level RBAC (beyond `ai:invoke`) | S68 | enterprise tier requirement |
