# PHASE-3C — S65 Audit (Public REST + WS APIs)

* **Sprint**: S65 (Phase 3C / Q3 / M31-M33)
* **Date**: 2026-04-28
* **Status**: D1 IN-FLIGHT CLOSED — REST + WS gateway, AI public API surface, AI Spend rollup, admin overrides, formula library extraction, bench harness, OpenAPI extension, ADRs all landed in this commit; D2-D10 work explicitly deferred per the table at the bottom.
* **Authors**: Replit Agent (Build mode)
* **Authoritative spec**: `docs/00_NEW_ARCHITECTURE/phases/PHASE-3C-Q3-M31-M33-SDK-MARKETPLACE-PUBLIC-API.md` §S65
* **Companion ADRs**: 0041 (REST + WS), 0042 (AI), 0043 (AI Spend), 0044 (Formula library), 0045 (Admin overrides + lifecycle deferral)

## Item-by-item delivery vs §S65 work-items

| # | §S65 work-item | Status | Where it landed | Test count |
|---|---|---|---|---|
| 1 | Public REST `import` / `export.pryzm` | ✅ Delivered | `apps/api-gateway/src/routes/projects.ts` + `__tests__/projects.test.ts` | 11 |
| 2 | Public WS API: project channel + awareness read-only | ✅ Delivered | `apps/api-gateway/src/ws.ts` + `__tests__/ws.test.ts` | 14 |
| 3 | AI public API (read-only L7.5 surface) | ✅ Delivered | `apps/api-gateway/src/routes/ai.ts` + `__tests__/ai.test.ts` + ADR-0042 | 9 |
| 4 | PDF backend large-sheet bench < 8 s | ⏸ Deferred | Existing `apps/bench/reports/pdf-large-sheet-baseline.md` from prior sprint stands; no regression at S65 — see Deferrals §D1 below | n/a |
| 5 | WebGPU compute investigation report | ⏸ Deferred | Research-only; report scoped at S66 D8 — see §D2 | n/a |
| 6 | PDF-to-BIM pricing finalised; cost ceilings enforced | ⏸ Partial | Cost-meter primitive + budget pre-flight at `AiInvokePort`; PDF-to-BIM specific pricing table is S66 — see §D3 | n/a |
| 7 | Workspace Admin AI Spend view (SPEC-28 §9) | ✅ Delivered | `packages/ai-spend/` + `apps/api-gateway/src/routes/admin.ts` + ADR-0043 | 28 (ai-spend) + 14 (admin route) |
| 8 | Enterprise admin UI for plan/role overrides (ADR-028 Part E) | ✅ Delivered (API surface) | `packages/admin-overrides/` + `apps/api-gateway/src/routes/admin.ts` + ADR-0045 §A-D | 19 (overrides) + admin route |
| 9 | Formula library extraction (ADR-027) | ✅ Delivered | `packages/formula-library/` + `apps/api-gateway/src/routes/formulas.ts` + ADR-0044 | 35 (formula) + 5 (route) |
| 10 | View+project lifecycle events deleted (ADR-030 Part D) | ⏸ Deferred (HARD OWNER assigned) | K3-A risk; deletion deferred to S66 D1 with a kill-switch metric per ADR-0045 §E | n/a |

## Aggregate verification

| Package | Tests | Status |
|---|---:|---|
| `@pryzm/ai-spend` | 28 | ✅ green |
| `@pryzm/admin-overrides` | 19 | ✅ green |
| `@pryzm/formula-library` | 35 | ✅ green |
| `@pryzm/api-gateway` | 62 | ✅ green (8 test files: health, projects, ai, admin, formulas, auth-shim, ws, bench) |
| `@pryzm/api-spec` | 31 | ✅ green (re-pinned SHA-256 = `cef1439b...02f3`) |
| **S65 total** | **175** | **175/175** |

| Regression check (sprints touched in window) | Status |
|---|---|
| S64 marketplace-api (20 tests) | ✅ untouched |
| S63 oauth2-pkce (30) + api-rbac (32) + rate-limit (26) | ✅ untouched |
| S62 plugin-sdk (129) | ✅ untouched |
| `Start application` workflow port 5000 | ✅ running |

Pre-existing failing workflows (`audit-log-middleware`, `ifc-export-tier1`, `pryzm-persistence`, `pryzm-vi-parity`) were red **before** S65 D1 began and are unrelated to the S65 surfaces. They remain owned by their original sprints — not introduced or worsened here.

## Architecture summary

The api-gateway adopts the marketplace-api (S64 D1) pattern verbatim: Express 5, pluggable auth-shim (default test shim trusts `X-Test-Subject` / `X-Test-Scopes` / `X-Test-Roles` / `X-Test-Tier` headers), per-app `RateLimitRegistry` for read+write isolated buckets per ADR-018, and pluggable ports for everything that touches I/O (`ProjectExportPort`, `ProjectImportPort`, `AiInvokePort`, `WsEventBus`). In-memory implementations live in `src/ports.ts`; production wiring at S65 D9 swaps in `@pryzm/file-format` adapters and the sync-server WS bus.

Five new ADRs pin every composition decision:

* **ADR-0041** — REST + WS gateway composition (decisions A-G)
* **ADR-0042** — AI public API discovery + invoke + cost predictability
* **ADR-0043** — AI Spend aggregator (7 axes, frozen schema)
* **ADR-0044** — Formula library extraction (12 built-ins, frozen-at-load)
* **ADR-0045** — Admin overrides + lifecycle-event deletion deferral

The OpenAPI YAML at `packages/api-spec/openapi.yaml` is extended with 13 new path operations (3 AI + 4 admin + 2 formulas + 2 WS via `x-websocket` extension + 2 admin-override sub-resources) and the byte-stable SHA-256 is re-pinned in `packages/api-spec/__tests__/openapi-spec.test.ts`. The invariant checker now sees zero violations across all 13 new operations.

## K3-D gate (in-process latency baseline)

`apps/api-gateway/__tests__/bench.test.ts` records 200 measured + 50 warm samples per endpoint (health, list workflows, list formulas) and writes JSON + markdown to `apps/bench/reports/api-gateway-baseline.{json,md}`. Read p95 budget < 200 ms is asserted in CI; the baseline writes for trend comparison at S66+. Production p95 verification awaits real deploy (out of scope at D1 — see §D5).

## Deferrals

| # | Deferred item | Owner | Reason |
|---|---|---|---|
| D1 | PDF backend large-sheet bench tuning | Carry-over from S58 baseline | Existing baseline meets the < 8 s budget; no S65 regression to fix |
| D2 | WebGPU compute investigation report | S66 D8 | Research-only per phase-doc; produces a recommendation, not code |
| D3 | PDF-to-BIM pricing table finalisation | S66 (ADR-031 amendment) | Needs telemetry from S65 D9 demo first |
| D4 | View+project lifecycle event deletion (ADR-030 Part D) | **S66 D1 (HARD OWNER)** | K3-A high-risk; subscribers in S64 marketplace-api + S62 plugin-sdk must migrate first per ADR-0045 §E |
| D5 | Real OAuth2 PKCE wiring against `auth.pryzm.com` | S65 D9 demo | Default test shim satisfies the API contract; production adapter swap is a one-line `authShim` injection |
| D6 | Postgres `AiSpendStore` adapter | S66 | In-memory store satisfies the API contract; persistence is orthogonal |
| D7 | Postgres `OverrideStore` adapter | S66 | Same rationale as D6 |
| D8 | AsyncAPI document for WS gateway | S66 | OpenAPI 3.1 `x-websocket` extension carries the contract until then |
| D9 | Admin UI front-end (React panels) | S66 + `packages/ui/` migration | Front-end work is orthogonal to the API surface delivered here |
| D10 | WS scaling beyond single-process fan-out | S67 (self-host) | Sync-server fan-out is the authoritative source of WsEventBus |

## Files changed in this commit

### New packages
* `packages/ai-spend/` — workspace package, pure aggregator + in-memory store, 28 tests
* `packages/admin-overrides/` — workspace package, override store + resolution helper, 19 tests
* `packages/formula-library/` — workspace package, 12 built-in formulas + frozen catalog, 35 tests
* `apps/api-gateway/` — workspace package, Express 5 + WS gateway, 62 tests

### Extended files
* `packages/api-spec/openapi.yaml` — +13 path operations, SHA-256 re-pinned (`cef1439b...02f3`)
* `packages/api-spec/__tests__/openapi-spec.test.ts` — SHA-256 pin updated with authorization chain comment

### New documentation
* `docs/architecture/adr/0041-s65-public-rest-ws-api.md`
* `docs/architecture/adr/0042-s65-ai-public-api.md`
* `docs/architecture/adr/0043-s65-ai-spend-view.md`
* `docs/architecture/adr/0044-s65-formula-library-extraction.md`
* `docs/architecture/adr/0045-s65-admin-overrides-and-lifecycle-deferral.md`
* `docs/00_NEW_ARCHITECTURE/phases/audits/PHASE-3C-S65-AUDIT.md` (this file)

### Bench output
* `apps/bench/reports/api-gateway-baseline.json`
* `apps/bench/reports/api-gateway-baseline.md`

## Sprint-exit criteria (per phase-doc §S65)

* [✅] Public REST surface for SPEC-26 §11 import/export shipped + tested
* [✅] WebSocket gateway exposes project events + awareness with bearer auth
* [✅] AI public API: list + describe + invoke (async) with cost pre-flight
* [✅] Workspace Admin AI Spend view aggregator + HTTP surface
* [✅] Enterprise admin overrides API + resolution helper
* [✅] Formula library extracted to standalone package + listed via public API
* [✅] OpenAPI YAML extended + invariant checker green + SHA-256 re-pinned
* [✅] In-process bench baseline recorded + read p95 < 200 ms asserted
* [✅] Five ADRs (0041-0045) documenting every composition + deferral decision
* [⏸] Real OAuth2 PKCE wiring (D5 deferral — S65 D9 demo)
* [⏸] View+project lifecycle event deletion (D4 deferral — S66 D1 hard owner)
