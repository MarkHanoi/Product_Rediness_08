# ADR-0041 — S65 Public REST + WebSocket API Gateway

* **Status**: Accepted (sprint-scoped, S65, 2026-04-28)
* **Authors**: Replit Agent (Build mode)
* **Supersedes**: nil
* **Related**: ADR-0039 (api-spec), ADR-0040 (marketplace-api), ADR-018 (rate-limit), ADR-014 (loud-fail-soft)

## Context

Phase 3C §S65 work-items 1-2 require a single public REST + WebSocket gateway exposing the SPEC-26 §11 import/export surface, the awareness/event channels, and the AI/admin/formula read-only surfaces (§S65 work-items 3, 7, 8, 9). The marketplace-api scaffolding from S64 D1 (ADR-0040) is the established pattern: Express 5, pluggable auth-shim, per-app `RateLimitRegistry`, in-memory ports + interfaces, route co-location.

## Decisions

### A. Single workspace package `apps/api-gateway`
One package, one Express 5 app factory `createApiGatewayApp()`, default `tsx src/index.ts` listens on `API_GATEWAY_PORT` (default 5101). Mirrors `apps/marketplace-api` (port 5100). Splitting REST and WS into two packages was rejected — they share auth-shim, rate-limit registry, and the WsEventBus subscriber lives in the same process as the REST projects routes.

### B. Pluggable ports — testability without `@pryzm/file-format` engines
`createApiGatewayApp()` accepts injection of `ProjectExportPort`, `ProjectImportPort`, `AiInvokePort`, `WsEventBus`, plus `WorkflowRegistry` / `CostMeter` / `AiSpendStore` / `OverrideStore` / `FormulaCatalog`. In-memory implementations live in `src/ports.ts` for tests; production wiring at S65 D9 will swap in `@pryzm/file-format` adapters and the sync-server WS bus. This decouples the HTTP surface from the persistence layer per ADR-0014 (loud-fail-soft) and is also the only practical way to run K3-D bench inside vitest.

### C. Pluggable auth-shim (default test shim)
Default `defaultTestAuthShim` trusts `X-Test-Subject` / `X-Test-Scopes` / `X-Test-Roles` / `X-Test-Tier` headers (verbatim port from S64 marketplace-api). Real OAuth2 PKCE wiring uses `@pryzm/oauth2-pkce` (S63) at S65 D9 demo via `ApiGatewayOptions.authShim` injection. This avoids blocking S65 D1 on production OAuth resource-server config.

### D. Per-app `RateLimitRegistry` with ADR-018 verbatim
Read endpoints use the read bucket (60 r/m free, 600 r/m paid). Write endpoints use the write bucket (20 r/m free, 300 r/m paid). Buckets keyed `(subject, kind, tier)` per ADR-018; no first-party exception. Subject derives from `req.auth.subject || req.ip || 'anonymous'`. Tier is read from `req.auth.tier || 'free'`.

### E. Express 5 path-to-regexp 8 compatibility
Routes use simple param syntax `:projectId`, `:subjectKind/:subjectId`, etc. The legacy `:id(*)` regex form throws `TypeError: Unexpected ( at index N` in path-to-regexp 8.4.2 (same fix that landed in S64 marketplace-api routes).

### F. WebSocket gateway co-located with REST
`attachWsGateway(server, opts)` is invoked by `src/index.ts` after `app.listen(...)` so REST + WS share one HTTP server + one bearer token format + one auth-shim. WS paths declared as `x-websocket: true` in the OpenAPI YAML — OpenAPI 3.1 has no native WebSocket primitive (AsyncAPI is the formal answer). Client codegen tools that look for `x-websocket` can render typed clients per the AsyncAPI Bridge convention. Deferring the AsyncAPI document to S66 keeps S65 scope bounded; the `x-websocket` marker is the forward-compatibility hook.

### G. Loud-fail-soft error envelopes (ADR-014)
All 4xx + 5xx responses use `{ error: '<machine_code>', error_description: '<human>' }` (RFC 6749-style). On JSON-parse failure inside a WS message, the server echoes `{ error: 'invalid_message', detail }` rather than closing — preserves the connection for the next valid frame. Bench harness asserts the structured shape so contract drift surfaces in CI.

## Consequences

* +1 workspace package, ~1100 LoC of source + ~1500 LoC of tests, 62 tests green at D1
* No coupling to `@pryzm/file-format` until S65 D9 wiring; in-memory ports keep the test suite under 10 s
* `x-websocket` extension is non-standard but is the documented escape hatch in OpenAPI 3.1; replaced by an AsyncAPI document at S66
* `apps/bench/reports/api-gateway-baseline.{json,md}` becomes the K3-D in-process baseline; production p95 is verified at deploy time, not in CI

## Deferrals

| Item | Owner | Reason |
|---|---|---|
| Real OAuth2 resource-server adapter | S65 D9 demo | depends on auth.pryzm.com infra readiness |
| Postgres `AiSpendStore` adapter | S66 | in-memory store satisfies the API contract; persistence is orthogonal |
| AsyncAPI document for WS | S66 | OpenAPI 3.1 `x-websocket` extension carries the contract until then |
| WS scaling beyond single-process | S67 (self-host) | sync-server fan-out is the authoritative source of WsEventBus |
