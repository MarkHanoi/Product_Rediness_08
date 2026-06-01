# Phase 3C — Full review (S61 → S66 D1)

- **Date**: 2026-04-28
- **Sprint marker**: S66 D1 closure
- **Spec**: `phases/PHASE-3C-Q3-M31-M33-SDK-MARKETPLACE-PUBLIC-API.md`
  + sister doc `PHASE-3C-Q3-M31-M33-PLUGIN-SDK-MARKETPLACE-APIS.md`

This document is the cumulative full-phase audit covering Phase 3C
sprints S61 through S66 D1.  Per-sprint audits remain authoritative
for the per-work-item delivery breakdowns; this doc cross-references
them and records the **phase-level deferral list** that survives
into S67+.

## Sprint-by-sprint closure pointers

| Sprint | Goal                                                                      | Audit                                                  | Status         |
| ------ | ------------------------------------------------------------------------- | ------------------------------------------------------ | -------------- |
| S61    | M31 Plugin SDK skeleton + descriptor + signing                            | PHASE-3C-S61-AUDIT.md                                  | [✓] CLOSED     |
| S62    | Plugin sandbox + permissions + host bridges + 3 examples                  | PHASE-3C-S62-AUDIT.md                                  | [✓] CLOSED     |
| S63    | Plugin SDK docs + Public API draft + OAuth2 PKCE + RBAC + rate-limit      | PHASE-3C-S63-AUDIT-2026-04-28.md                       | [✓] CLOSED     |
| S64    | Marketplace API + plugin distribution + headless docs                     | PHASE-3C-S64-AUDIT.md                                  | [✓] CLOSED     |
| S65    | Public REST + WS APIs + AI public API + AI Spend + overrides + formulas  | PHASE-3C-S65-AUDIT.md                                  | [✓] CLOSED     |
| S66 D1 | Webhooks + headless publish prep                                          | (this doc) + ADR-0046 + ADR-0047 + apps/bench/M33-3C.md | [~] D1 CLOSED  |

## What landed in S66 D1 (this commit)

1. **`@pryzm/webhooks` package** (NEW) — subscription store + signing
   + delivery primitives + closed event-name catalogue.  33/33 unit
   tests green.  See ADR-0046 for the composition rationale.
2. **api-gateway webhooks routes** — 6 admin-gated routes under
   `/v1/admin/webhooks/*` (catalog, list, create, get, set-active,
   delete, test-fire).  Workspace-scoped, secret-once-on-create,
   admin-role + `project:write` gated, rate-limited per ADR-018.
3. **OpenAPI 3.1 spec** — 6 new path operations + 2 new schemas;
   SHA-256 byte-pin re-pinned.
4. **`apps/headless` publish prep** — metadata landed (engines, bin,
   files, license, repository, bugs, homepage, keywords,
   publishConfig).  `private: true` retained per ADR-0047 §A.
5. **ADR-0046** — webhooks composition (decisions A–G).
6. **ADR-0047** — headless npm-publish prep (decisions A–F).
7. **`apps/bench/reports/M33-3C.md`** — M33 milestone bench roll-up.

## Phase-level deferrals still owned by S66 (D2-D10) or later

These items were enumerated in the S66 entry of `phases/`-doc-1 §S66
and remain explicitly DEFERRED beyond this S66 D1 commit.  Each one
carries its rationale here so the next-sprint owner doesn't have to
re-derive it from the per-sprint audits:

| Item                                                       | Owner    | Rationale for deferral                                                                                                                                                            |
| ---------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Real-time webhook fan-out (sync-server-side broker)        | S67 D2   | Requires Postgres-backed `WebhookStore` first.  Shipping in-memory fan-out we'd rip out a sprint later is wasteful per ADR-0046 §F.                                                |
| `PostgresWebhookStore`                                      | S67 D2   | Same rationale as the spend / overrides / formula-catalog Postgres adapters in S65 — adapter pattern proven, no contract change.                                                  |
| `apps/editor` deletion (K3-A risk)                          | S66 D9+  | Subscribers in S64 marketplace-api + S62 plugin-sdk must migrate first.  Deletion any earlier cascade-breaks two S64 deliverables.  K3-A risk register entry remains open.        |
| `npm publish @pryzm/headless` (flip `private:false`)        | S66 D3   | Single-line metadata flip; held until the S66 demo PR so it cannot ship by accident.  ADR-0047 §A pins this.                                                                       |
| `docs.pryzm.com` CDN deploy                                 | S66 D9   | Awaits the S66 demo gate (carry-over from S65 deferral).  Content is production-ready locally.                                                                                     |
| 3C demo recording                                           | S66 D9   | The phase demo records the end-to-end PKCE → public REST → AI invoke → webhook delivery loop, gated on the S66 D9 admin-UI front-end migration.                                   |
| `src/styles/` legacy directory deletion                     | S66 D9+  | Lives at the top of `apps/editor/`; deletion bundled with the K3-A apps/editor removal.                                                                                            |
| AsyncAPI document for WS gateway                            | S67      | The `x-websocket: true` extension marker carries the contract until then; AsyncAPI is documentation polish, not a primitive.                                                       |
| WebGPU compute investigation report                         | S67 D8   | Research-only carry-over from S65; ADR amendment lands when the report does.                                                                                                       |
| PDF-to-BIM pricing finalisation                             | S65 D9+  | Needs first-week production-telemetry from the S66 demo before the pricing knobs can be ratified.                                                                                  |

## Test scoreboard at S66 D1

- `@pryzm/webhooks`: 33/33 ✓
- `apps/api-gateway` (extended): 12 new webhook integration tests ✓
- `apps/headless` (extended): 9 new node-compat tests ✓
- `packages/api-spec`: SHA pin re-validated ✓
- All S61–S65 regression suites untouched.

## Risk register summary

- **K3-A** (apps/editor deletion cascade) — OPEN; mitigation = held
  for S66 D9+ subscriber migration window.
- **K3-D** (api-gateway latency drift) — GREEN; M33-3C bench shows
  every read p95 < 5 ms, every write p95 < 15 ms in-process.
- **K3-Webhooks-Replay** (webhook secret leakage / replay) — GREEN;
  signing follows Stripe-style HMAC-SHA256 with 5-min replay window
  + secret returned once on create + redacted on every subsequent
  read per ADR-0046 §G.
- Pre-existing failed workflows (`audit-log-middleware`,
  `ifc-export-tier1`, `pryzm-persistence`, `pryzm-vi-parity`) remain
  red and unrelated to S66 D1; they continue to be owned by their
  original sprints.
