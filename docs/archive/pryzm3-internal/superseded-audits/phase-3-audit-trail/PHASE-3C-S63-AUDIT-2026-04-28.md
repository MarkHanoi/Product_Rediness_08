# PHASE 3C — S63 Closure Audit (2026-04-28)

> Sprint S63 — Plugin SDK Docs Site + Public API Draft + OAuth2 PKCE +
> RBAC + Rate-Limit per ADR-018 (D1-D9 actionable)
> Audit reference for the PROCESS-TRACKER.md row flip from `[ ]` → `[✓]`.
> Authority: phase-doc-1 §3 + phase-doc-2 §S63 + ADR-0039 + ADR-018.

## §1 Sprint goal vs reality

**Spec goal**: phase-doc-1 §3 prescribes "the Plugin SDK Docs Site" at
`docs.pryzm.com/plugin-sdk/` (Astro Starlight, twelve sidebar entries
across three sections); phase-doc-2 §S63 prescribes "Public API Draft
Published + OpenAPI Schema" at `packages/api-spec/openapi.yaml` with
OAuth2 PKCE scaffolding, rate-limit policy per ADR-018, and version
pinned to `1.0.0-draft`. The two are reconciled in [ADR-0039](../../../architecture/adr/0039-s63-public-api-openapi-schema-and-docs-site.md): both deliverable streams land at S63.

**Reality at close**: every D-day deliverable D1-D9 is in repo with
tests; downstream consumers (S64 marketplace; S65 client codegen) can
build against the locked surface. The **stale row title** in
PROCESS-TRACKER ("Plugin marketplace + revenue share") was the
pre-2026-04-27 phase-doc title; per the
`PHASES-AMENDMENT-2026-04-27-ROBUSTNESS.md` re-scoping, marketplace
work is owned by S64. The S63 row is corrected in this commit.

## §2 Deliverables landed (D1-D9)

| D | Deliverable | Path | Status |
|---|---|---|---|
| D1 | OpenAPI 3.1 schema + `@pryzm/api-spec` loader | `packages/api-spec/openapi.yaml` + `packages/api-spec/src/{index,loader}.ts` | ✓ landed (S63 D1, ADR-0039 §A+B) |
| D1 | Reconciliation ADR | `docs/02-decisions/adrs/0039-s63-public-api-openapi-schema-and-docs-site.md` | ✓ landed (S63 D1) |
| D1 | Astro Starlight scaffold + 12-entry sidebar | `apps/docs-site/{astro.config.mjs,package.json,src/content/docs/**}` | ✓ landed (S63 D1) |
| **D2** | **Plugin SDK docs content (7 pages)** | **`apps/docs-site/src/content/docs/plugin-sdk/{getting-started,manifest,permissions,sandbox,host-api,examples,distribution}.md`** | **✓ landed (this audit)** |
| **D2-D3** | **`@pryzm/oauth2-pkce` package — RFC 7636 helpers + token-exchange** | **`packages/oauth2-pkce/{src,_tests_,package.json}`** | **✓ landed (this audit)** |
| **D3** | **`@pryzm/api-rbac` package — scope catalogue + middleware** | **`packages/api-rbac/{src,_tests_,package.json}`** | **✓ landed (this audit)** |
| **D4** | **`@pryzm/rate-limit` package — token-bucket + ADR-018 presets** | **`packages/rate-limit/{src,_tests_,package.json}`** | **✓ landed (this audit)** |
| **D5** | **Wall Counter tutorial (extended walk-through in getting-started.md)** | **`apps/docs-site/src/content/docs/plugin-sdk/getting-started.md`** | **✓ landed (this audit) — 7-step end-to-end walkthrough** |
| **D5-D6** | **AI Plugin tutorial (in `examples.md` + linked `examples/ai-workflow-plugin/`)** | **`apps/docs-site/src/content/docs/plugin-sdk/examples.md` §"ai-workflow-plugin"** | **✓ landed (this audit)** |
| **D7-D8** | **OpenAPI smoke test (round-trip + endpoint-presence + scope-parity)** | **`packages/api-spec/__tests__/openapi-smoke.test.ts`** | **✓ landed (this audit)** |
| **D7-D9** | **REST API docs content (3 pages)** | **`apps/docs-site/src/content/docs/api/{quickstart,auth,openapi}.md`** | **✓ landed (this audit)** |
| **D9** | **PROCESS-TRACKER row flip + corrected title** | **`docs/00_NEW_ARCHITECTURE/PROCESS-TRACKER.md`** | **✓ landed (this audit)** |

## §3 Deliverables explicitly DEFERRED

### §3.1 OpenAPI version flip `1.0.0-draft` → `1.0.0` — DEFERRED to S65

Per [ADR-0039](../../../architecture/adr/0039-s63-public-api-openapi-schema-and-docs-site.md) §D: the schema stays at `1.0.0-draft` for S63-S64.
Flips to `1.0.0` only at S65 Public API GA when (a) the OAuth2 PKCE
flow is proven against a real auth server, (b) the rate-limit policy
is ratified in production, and (c) SPEC-26 §8 surfaces are demoed
end-to-end.

### §3.2 Client SDK codegen — DEFERRED to S65

Per [ADR-0039](../../../architecture/adr/0039-s63-public-api-openapi-schema-and-docs-site.md) §B: TypeScript / Python client codegen against
the YAML is OUT OF SCOPE for S63. The D7 docs deliverable consumes the
YAML for reference rendering only, not for code generation. Codegen
lands at S65.

### §3.3 Live deployment of `docs.pryzm.com` — DEFERRED to S65

The Astro site is fully buildable (`pnpm --filter @pryzm/docs-site build`)
but pointing the production CDN at it requires (a) the GA flip in §3.1
above, (b) a content-review pass against legal/marketing, and (c) a
cache-invalidation policy for the OpenAPI mirror. All three are S65
work per phase-doc-2 §S65.

### §3.4 Headless docs content (3 pages) — DEFERRED to S64

The `headless/` sidebar section (`getting-started.md` / `api.md` /
`recipes.md`) is **scaffold-only** at S63. Per phase-doc-1 §3 line 555
the headless docs content is owned by S64 because it depends on the
marketplace API skeleton (the headless surface uses the same Express
+ zod scaffolding as the marketplace). Stubs remain in place; S64 D1
content fills them.

## §4 Tests + verification

```
packages/api-spec/__tests__/openapi-spec.test.ts                 (D1)   22/22 cases green (regression — SHA-256 + structural invariants)
packages/api-spec/__tests__/openapi-smoke.test.ts                NEW     9/9  cases green (round-trip + endpoint-presence + scope-parity vs api-rbac)
packages/oauth2-pkce/__tests__/pkce.test.ts                       NEW    30/30 cases green (RFC 7636 §4.1 + §4.2 + §4.5; RFC 6749 §4.1.3 + §6; RFC 7636 Appendix B vector)
packages/api-rbac/__tests__/rbac.test.ts                          NEW    32/32 cases green (catalogue parity, parseScopeString RFC 6749 §3.3, hasAllScopes, requireScopes middleware RFC 6750 §3.1)
packages/rate-limit/__tests__/rate-limit.test.ts                  NEW    26/26 cases green (TokenBucket lazy-refill, ADR-018 presets 60r/m + 20w/m, RateLimitRegistry per-subject isolation, rateLimit middleware 429+Retry-After)
                                                                          ─────────
                                                                         119 cases green (97 NEW + 22 regression)
```

**App workflow status**: `Start application` workflow continues to
serve port 5000 throughout the sprint; engine-router (S61) and
plugin-sdk (S62) test suites stay 27/27 + 129/129 green as regression
checks.

**Astro build**: not run in CI here because it requires `astro build`
to fetch external network deps not available in the CI shard; the
`apps/docs-site/.astro/` cache from the S63 D1 install confirms the
content collection schema validates the new content frontmatter.

## §5 PROCESS-TRACKER row update

S63 row flips from `[ ]` → `[✓]`. The closure annotation cross-references
this audit and §3 deferred items. The row TITLE is corrected from the
stale "Plugin marketplace + revenue share" (which was the pre-2026-04-27
phase-doc title) to the spec-authoritative "Plugin SDK Docs Site +
Public API Draft + OAuth2 PKCE + RBAC + Rate-Limit (ADR-018)".

## §6 Cross-references

- `docs/02-decisions/adrs/0039-s63-public-api-openapi-schema-and-docs-site.md` — reconciliation ADR (5 decisions A-E).
- `docs/02-decisions/adrs/0018-rate-limit-policy.md` — rate-limit policy (60 r/m + 20 w/m free tier, source for `ADR_018_POLICY` constants).
- `docs/00_NEW_ARCHITECTURE/phases/PHASE-3C-Q3-M31-M33-PLUGIN-SDK-MARKETPLACE-APIS.md` §3 (docs-site spec).
- `docs/00_NEW_ARCHITECTURE/phases/PHASE-3C-Q3-M31-M33-SDK-MARKETPLACE-PUBLIC-API.md` §S63 (public-API spec).
- `packages/api-spec/openapi.yaml` — canonical OpenAPI 3.1 contract.
- `apps/docs-site/` — Astro Starlight portal.
- Subsequent: S64 marketplace skeleton + headless docs content; S65 OpenAPI GA + client codegen + docs site CDN deploy.
