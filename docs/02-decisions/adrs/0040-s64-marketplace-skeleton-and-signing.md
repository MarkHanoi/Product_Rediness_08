# ADR-0040 — S64 Marketplace Skeleton + Ed25519 Signing Integration (D1)

- **Status**: Accepted (sprint-scoped to S64, 2026-04-28)
- **Sprint**: S64
- **Author**: Architecture
- **Supersedes**: none
- **Amends**: none
- **Cross-references**: ADR-0038 (plugin SDK descriptor schema lock),
  ADR-0039 (S63 OpenAPI + docs site), ADR-018 (rate-limit policy),
  [strategic ADR-009] (sandboxing + plugin governance),
  phases/PHASE-3C-Q3-M31-M33-SDK-MARKETPLACE-PUBLIC-API.md §S64,
  phases/PHASE-3C-Q3-M31-M33-PLUGIN-SDK-MARKETPLACE-APIS.md §3,
  packages/plugin-sdk/docs/internal-plugin-inventory.md

## Context

S64 D1 opens the **marketplace skeleton + first-party plugin seeding
pipeline**. The phase-doc-2 §S64 daily plan reads:

> - **D1**: marketplace schema + first-party plugin seeding pipeline.
> - **D2**: marketplace UI (browse, search, install).
> - **D3**: install / uninstall flows + per-workspace scoping.
> - **D4**: 30 first-party plugins seeded.
> - **D5**: signing + revocation infra + first signed plugin install.
> - **D6**: 5 third-party invitations sent; sandbox-audit fast-track for first 3.
> - **D7**: `packages/ui/` migration of 80% of panels.
> - **D8**: lint + perf.
> - **D9**: demo.

The plan has **two unresolved tensions** that this ADR settles upfront
so D2-D9 can build straight without re-litigating:

### Tension A — Storage layer at D1

The phase doc gives a Postgres SQL DDL block (verbatim in `migrations/0001_marketplace_plugins.sql`). But D1 is one day of work. Spending it on a Postgres adapter blocks D2 marketplace-UI work that needs an HTTP surface to call against.

### Tension B — Signing infra at D1 vs D5

D1 says "schema + seeding". D5 says "signing + revocation infra". But the marketplace HTTP surface CANNOT publish a version without verifying its signature — otherwise the very first publish endpoint at D2-D3 ships an unsafe code path that downstream sprints inherit.

### Tension C — First-party plugin count

The phase doc estimates "30 first-party plugins". The S62 D1 audit at `packages/plugin-sdk/docs/internal-plugin-inventory.md` confirmed the actual repo count is **38** (the 2A+2B element-family expansion added 8 plugins between the phase-doc 2026-04-27 freeze and S62 D1).

## Decision

### A — In-memory store at D1; Postgres adapter at D2-D5

The marketplace store at S64 D1 is in-memory (`createInMemoryStore()` in `apps/marketplace-api/src/store/in-memory.ts`). The Postgres SQL migration (`migrations/0001_marketplace_plugins.sql`) is committed at D1 but not yet wired — D2-D5 will replace the in-memory implementation with a `pg`-backed adapter behind the same `MarketplaceStore` interface.

Rationale: the `MarketplaceStore` interface is the contract. As long as it does not leak SQL semantics, swapping the implementation at D2-D5 is a single-file change.

Negative consequence: a server restart loses state at D1. Mitigation: re-running `seedFirstParty()` at boot is part of the bootstrap and is deterministic.

### B — Sign-verify wired at D1, key infra ratified at D5

The marketplace HTTP `POST /versions` endpoint at D1 ALREADY enforces the full `verifyPluginSignature(...)` pipeline from `@pryzm/plugin-sdk/signing`: manifest equality, file-hash equality, Ed25519 signature crypto, revocation list lookup. The "D5 signing + revocation infra" deliverable is now scoped to: HSM-equivalent publisher key storage, first signed-plugin install end-to-end demo, and the operational runbook. The CRYPTO is live at D1; the OPS is at D5.

Rationale: the plugin SDK (S62 D8) already shipped the verification primitive. Using it from day one closes the "first publish is unsafe" failure mode.

Negative consequence: the first-party publisher row seeded at D1 carries a placeholder public key (43 zero-bytes base64url). Any publish attempt against that placeholder will fail with `publisher_key_mismatch` — by design. D5 swaps the placeholder for the real Ed25519 key from the publisher keychain.

### C — Seed all 38 plugins, treat phase-doc "30" as a stale estimate

The seeder ships 38 first-party rows (one per inventory entry). Per `internal-plugin-inventory.md` §"Reality check", the phase-doc estimate of 30 was made at the 2026-04-27 freeze, before 2A+2B expansion. The K3-C parity gate is interpreted as "all 38 must keep working".

Rationale: the inventory is the single source of truth (PROCESS-TRACKER S62 row references it; this ADR also references it). Re-litigating the count in this ADR would create a second source of truth that immediately drifts.

### D — Auth model at D1: pluggable shim; production wiring at D5+

The marketplace API uses `@pryzm/api-rbac.requireScopes()` middleware (the `project:write` scope guards every write endpoint). The default auth shim (`defaultTestAuthShim`) trusts `X-Test-Subject` + `X-Test-Scopes` headers — used by tests + dev. Production deployment (S64 D9 demo) wires the real OAuth2 resource-server adapter via the `MarketplaceAppOptions.authShim` injection point.

Rationale: the OAuth2 PKCE token endpoint itself is not yet running in production (S65 GA gate). Coupling marketplace D1 to that infra would block this sprint on the next.

### E — Rate-limit policy: ADR-018 verbatim

The marketplace API uses `@pryzm/rate-limit` with the ADR-018 free-tier presets (60 r/m read + 20 r/m write). Read endpoints (browse, detail, versions list, revocations) use the read bucket; write endpoints (publish, revoke) use the write bucket. Buckets are per-(subject, kind, tier).

Rationale: the marketplace is a public surface — the same rate-limit policy that protects the public API protects the marketplace. No exception for first-party publishers; their tier is `paid` (much larger buckets) but the same algorithm.

## Consequences

### Positive

- D1 ships a runnable HTTP surface with a real (in-memory) data layer + real signing verification + real rate-limit + real scope enforcement. D2 can build the marketplace UI against `http://localhost:5100/v1/...` immediately.
- Every D2-D9 deliverable is a single-axis extension (UI, install flow, Postgres swap, etc.) without revisiting auth/sign/rate-limit decisions.
- The phase-doc-2 SQL block is honoured byte-stably as the bootstrap migration.
- The K3-C parity gate has a concrete artefact: `FIRST_PARTY_PLUGINS` is the same list the inventory enumerates, and the test pins the count at 38.

### Negative

- D1 server restart loses state. Mitigated by deterministic `seedFirstParty()`; non-issue once D2-D5 swaps to Postgres.
- First-party publisher's public key is a placeholder until D5. Mitigated by the test endpoints that rotate it to a real key per-test.
- Auth shim is non-production. Explicitly so; documented in this ADR and in the source.

### Mitigated

- "Marketplace ships an unsafe publish path" — mitigated by Decision B: the cryptographic verification is wired at D1, not deferred.
- "Drift between phase doc count (30) and reality (38)" — mitigated by Decision C: the inventory is the single source of truth.
- "Marketplace becomes a separate scope catalogue" — mitigated by Decision E: scope catalogue lives in `@pryzm/api-rbac`, marketplace consumes it; the `openapi-smoke.test.ts` parity check (S63) enforces non-divergence.

## Deliverables landed at D1

| Path | Notes |
|---|---|
| `apps/marketplace-api/package.json` + `tsconfig.json` + `vitest.config.ts` | Workspace pnpm package `@pryzm/marketplace-api` v0.1.0 (private). Dependencies: `@pryzm/api-rbac`, `@pryzm/rate-limit`, `@pryzm/plugin-sdk` via workspace protocol; `express ^5.1.0`; `zod ^4.3.6`; `ulid ^3.0.1`. |
| `apps/marketplace-api/src/types.ts` | Zod schemas for `MarketplacePlugin`, `MarketplacePluginVersion`, `Publisher`, `RevocationListResponse` — exact mirror of the SQL schema in `migrations/0001_*`. |
| `apps/marketplace-api/src/store/in-memory.ts` | `MarketplaceStore` interface + in-memory implementation; lazy revocation list assembly; FK invariants enforced. |
| `apps/marketplace-api/src/seed/first-party.ts` | `FIRST_PARTY_PLUGINS` (38 entries) + `seedFirstParty()` idempotent seeder. |
| `apps/marketplace-api/src/app.ts` | Express 5 app factory; routes + auth-shim + rate-limit + sign-verify. |
| `apps/marketplace-api/src/index.ts` | Entry point + CLI bootstrap (`MARKETPLACE_PORT` env, default 5100). |
| `apps/marketplace-api/migrations/0001_marketplace_plugins.sql` | phase-doc-2 §S64 SQL block verbatim + `publishers` table + indices + bootstrap row. |
| `apps/marketplace-api/__tests__/marketplace.test.ts` | Inventory + seeder + HTTP routes + sign-verify happy/error paths + rate-limit smoke. |

## Verification

- `pnpm --filter @pryzm/marketplace-api test` — full HTTP surface tested end-to-end via node:http + global fetch.
- `pnpm --filter @pryzm/api-spec test` — regression: scope catalogue parity holds (marketplace uses the same scope strings).
- `Start application` workflow stays green throughout.
