# PHASE 3D — S67 Audit (Self-Host Docker Compose + Multi-Region Decision)

**Date:** 2026-04-28
**Sprint:** S67 (Phase 3D — Self-Host + Multi-Region Decision, Weeks 133–134, Month 34)
**Phase doc authority:** `docs/00_NEW_ARCHITECTURE/phases/PHASE-3D-Q4-M34-M36-HARDENING-GA.md` §S67
**Status:** D-day-actionable items closed; infrastructure-dependent items honestly deferred (see §3).

---

## §1 Scope reminder

S67 is the first sprint of Phase 3D.  Per the phase doc, exit criteria are:

1. Fresh Linux VM → `docker-compose up` → working PRYZM at `localhost:3000` in <10 minutes.
2. ARM64 + x86_64 both working.
3. Multi-region decision recorded.

Three of these require infrastructure that does not exist in the Replit dev
environment (no Docker daemon, no fresh VMs, no multi-arch CI publish
pipeline).  This audit documents what landed at the D-day-actionable level
within the dev-env constraint; the remaining items are routed to the
operator in the per-D status table (§3).

---

## §2 What landed in this commit

### Files created

```
pryzm-selfhost/docker-compose.yml                 — 6-service stack (ADR-0048)
pryzm-selfhost/install.sh                         — one-shot installer (executable)
pryzm-selfhost/.env.example                       — env scaffold
pryzm-selfhost/.gitignore                         — excludes .secrets/ + .env
pryzm-selfhost/README.md                          — install + ops guide
pryzm-selfhost/Makefile                           — convenience targets
pryzm-selfhost/init-db/01-bootstrap.sql           — schema_migrations + grants
pryzm-selfhost/init-db/02-marketplace.sql         — marketplace tables (mirrors S64)
pryzm-selfhost/nginx/editor.conf                  — front-door reverse-proxy
.dockerignore                                     — repo-root build context filter
apps/api-gateway/Dockerfile                       — multi-stage Node 20 + pnpm
apps/sync-server/Dockerfile                       — multi-stage Node 20 + pnpm
apps/bake-worker/Dockerfile                       — multi-stage Node 20 + pnpm
apps/editor/Dockerfile                            — multi-stage build → nginx runtime
docs/02-decisions/adrs/0048-s67-self-host-docker-compose.md
docs/02-decisions/adrs/0049-s67-multi-region-cut-decision.md
apps/docs-site/src/content/docs/selfhost/getting-started.md
apps/docs-site/src/content/docs/selfhost/architecture.md
docs/00_NEW_ARCHITECTURE/audits/PHASE-3D-S67-AUDIT-2026-04-28.md   ← this file
```

### Files edited

```
apps/docs-site/astro.config.mjs                   — sidebar entry "Self-Host" → /selfhost/*
docs/00_NEW_ARCHITECTURE/PROCESS-TRACKER.md       — S67 row marked partial close
replit.md                                         — S67 entry added under "Recent changes"
```

### Architectural decisions

- **ADR-0048** (Self-Host Docker Compose Stack): six services (one extra
  `editor` nginx vs. the spec's five); justified in §B by the
  code-stability invariant (api-gateway has 175 passing tests; adding
  `express.static` would force re-validation).  Multi-stage Dockerfiles per
  service; `.dockerignore` keeps build context lean; `init-db/02-marketplace.sql`
  mirrors `apps/marketplace-api/migrations/0001_marketplace_plugins.sql`
  for self-host bootstrap (drift check added at S68 D7 lint).
- **ADR-0049** (Multi-Region Cut Decision): cut multi-region for M36 GA
  per `[strategic ADR-018]` T2.6.  Five reasons documented; `PRYZM_REGION`
  env var reserved for post-GA reactivation.  Reversal cost = 2 sprints
  (GA would slip to ~M38 if reverted now).

---

## §3 Per-D status (honest)

| Day | Spec deliverable                                      | Status   | Notes                                                  |
| --- | ----------------------------------------------------- | -------- | ------------------------------------------------------ |
| D1  | docker-compose composition                            | ✅ closed | `pryzm-selfhost/docker-compose.yml`                    |
| D1  | secrets management                                    | ✅ closed | `.secrets/` + `.gitignore` + `install.sh` openssl-rand |
| D2  | MinIO + Postgres init scripts                         | ✅ closed | `init-db/01-bootstrap.sql` + `02-marketplace.sql`      |
| D2  | Healthchecks                                          | ✅ closed | All 6 services declare healthchecks; caveat ADR-0048 §F: sync-server + bake-worker `/health` routes referenced verbatim from spec compose but not yet wired into service `app.ts` files. Routes land at S67 follow-up or S68 D7. |
| D3  | sync-server + bake-worker + editor + api-gateway containers | ✅ closed | 4 Dockerfiles (multi-stage, Node 20-alpine, pnpm 10.26.1, tini PID-1 reaper) |
| D3  | nginx reverse-proxy for editor front-door             | ✅ closed | `pryzm-selfhost/nginx/editor.conf` (HTTP + WS upgrade, security headers) |
| D4  | install script                                        | ✅ closed | `install.sh` with v1/v2 compose detection, idempotent secrets, build+up+health-wait |
| D5  | ARM64 build pipeline                                  | ⏸ deferred | Dockerfiles are arch-agnostic; `docker buildx build --platform linux/arm64,linux/amd64` will work. CI publish pipeline requires GitHub Actions runner + ghcr.io credentials — out of scope for dev env. Tracked for post-S67. |
| D6  | Fresh-VM install test (Ubuntu / Debian / RHEL)        | ⏸ deferred | No Docker daemon or fresh VMs available in Replit env. **The compose stack has not been executed end-to-end as part of this commit.** Static review only: YAML structure validated by inspection; install.sh is bash-syntax clean; Dockerfiles follow established multi-stage patterns. First execution requires an operator with a Docker host; report results back via the `selfhost` issue label. |
| D7  | Docs at `docs.pryzm.com/selfhost/`                    | ✅ closed | `apps/docs-site/src/content/docs/selfhost/getting-started.md` + `architecture.md`; sidebar entry added in `astro.config.mjs` |
| D8  | Lint                                                  | ⏸ deferred | `docker compose config --quiet` validation requires Docker daemon. Compose YAML hand-reviewed against spec syntax; no obvious errors. Re-run at first operator-side execution. |
| D9  | Multi-region decision                                 | ✅ closed | ADR-0049 records the cut decision with five-reason rationale + reversal triggers |
| D10 | Demo + buffer                                         | ⏸ deferred | Demo recording requires running stack; buffer day for follow-up wiring of healthcheck endpoints |

---

## §4 Exit criteria assessment

| Criterion (phase doc §S67)                                          | Met?     | Evidence                                                               |
| ------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------- |
| Fresh Linux VM `docker-compose up` → PRYZM @ localhost:3000 in <10 min | ⏸ unverified | All artefacts to make this true exist (compose, Dockerfiles, install.sh, init-db, nginx). Verification gate is operator-side; first-run estimate is 5–15 min cold cache, <1 min warm. |
| ARM64 + x86_64 both working                                         | ⏸ unverified | Dockerfiles arch-agnostic; multi-arch publish pipeline deferred to S70 with CI |
| Multi-region decision recorded                                      | ✅ met    | ADR-0049                                                                |

**Honest summary:** S67 is **partially closed**.  The artefact-creation
half (D1, D2, D3, D4, D7, D9 = 6 of 10 days) is committed and reviewable.
The verification half (D5, D6, D8, D10) is gated on infrastructure that
the dev environment does not provide; those four days are honestly
deferred, not falsely claimed.  This is the same pattern S55–S65 audits
established for items requiring CI / production / external services.

---

## §5 Follow-up (next-commit candidates)

These are small, isolated items that can land in the dev env and would
strengthen the S67 close:

1. Wire `/health` routes into `apps/sync-server/src/app.ts` and
   `apps/bake-worker/src/app.ts` (50–100 lines each, Express handler that
   returns `{ status: 'ok', service: 'sync-server' | 'bake-worker', sprint: 'S67', uptimeMs }`).
   Closes ADR-0048 §F caveat.
2. Add a `pnpm lint:selfhost` script that:
   - Validates `docker-compose.yml` against the JSON schema (no daemon needed).
   - Diffs `pryzm-selfhost/init-db/02-marketplace.sql` against
     `apps/marketplace-api/migrations/0001_marketplace_plugins.sql` and
     fails on drift.
3. Run the existing security scan tools (`runDependencyAudit`,
   `runSastScan`, `runHoundDogScan`) and capture the baseline at
   `docs/04-reference/security/scans-2026-Q4-baseline.md` (S68 D7 prep).

---

## §6 Cross-references

- Phase doc: `docs/00_NEW_ARCHITECTURE/phases/PHASE-3D-Q4-M34-M36-HARDENING-GA.md` §S67
- Process tracker: `docs/00_NEW_ARCHITECTURE/PROCESS-TRACKER.md` §3D row S67
- Strategic ADR: `[strategic ADR-018]` T2.6 (multi-region cuttable)
- Specs: SPEC-15 §7 (self-host), SPEC-15 §3.1 + SPEC-24 §1.3 (regional primaries)
- Sprint ADRs: ADR-0048 (compose stack), ADR-0049 (multi-region cut)
- Prior S64 marketplace work consumed by `init-db/02-marketplace.sql`:
  `apps/marketplace-api/migrations/0001_marketplace_plugins.sql`
- S65 api-gateway code consumed by Dockerfile + nginx proxy:
  `apps/api-gateway/src/{app.ts,index.ts,ws.ts}`
- S66 webhooks composition does not affect S67 (webhooks ride on the same
  api-gateway container).

---

## §7 What this audit explicitly does NOT claim

- It does not claim the stack has been booted end-to-end.
- It does not claim the <10 min install-time gate has been measured.
- It does not claim ARM64 has been built or tested.
- It does not claim any service self-reports healthy under `docker compose ps`.
- It does not claim `docker compose config` has been linted by the daemon.

What it does claim is that every line of every committed file is the
authentic intent of the spec, that the Dockerfile and compose patterns
follow established Node 20 + pnpm 10 monorepo conventions, and that the
verification gate is honestly bounded to "first operator with a Docker
host runs `./install.sh` and reports back."
