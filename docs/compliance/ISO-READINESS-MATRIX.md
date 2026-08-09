# ISO READINESS MATRIX — PRYZM

**Status**: DRAFT · **Created**: 2026-08-09 · **Method**: read-only forensic audit off `agent/c14-iso-readiness` (branched from `main` @ `57c4cfb9`).
**Owner**: founder (accountable). Per-control owners are proposed, not assigned — assignment is a founder act.

---

## ⛔ READ THIS BEFORE USING ANY ROW

1. **PRYZM is not "ISO compliant" and this document never says it is.** ISO 9001 / 27001 / 42001 certify an
   **organisation and its processes**. Software provides *objective evidence* for an audit; it cannot itself
   be certified. Every row below reports what the repository evidences, using
   *evidence indicates · implemented · partial · unknown*.
2. **"Not found" ≠ "does not exist".** Where a control could not be verified from the repository, the row
   says **UNKNOWN** and names the evidence that would settle it. Several controls (Supabase region, whether
   `supabase-rls.sql` was ever applied, whether the Cesium token was revoked) can only be settled from a
   provider dashboard, and are marked so.
3. **The six states are never collapsed**: EXISTS → IMPLEMENTED → EVIDENCED → TESTED → OPERATIONAL →
   AUDITED. A control can be TESTED and not OPERATIONAL; in this estate that is the *normal* case, not the
   exception.
4. **C64 §2.13 binds this document.** No coverage, determination or completion percentage is transcribed.
   Where a figure matters, the artefact that computes it is cited:
   `tools/city-completion/measurements/*.measurements.json` · `tools/city-completion/computeScorecard.mjs` ·
   [PEC-EXECUTION-DASHBOARD](../03-execution/plans/PEC-EXECUTION-DASHBOARD.md) ·
   [NATIONAL-CAPABILITY-REGISTER](../04-reference/standards/NATIONAL-CAPABILITY-REGISTER.md) ·
   `tools/ga-gate/gate-debt.json`.
5. **This is not a duplicate of [V1-LAUNCH-READINESS-AUDIT](../04-reference/V1-LAUNCH-READINESS-AUDIT.md).**
   That document is the authority for launch readiness and its Issue Log (L-NN) is the de-facto
   nonconformity register. This document **cites** it and adds only the ISO framing, the 19650/191xx
   analysis, and findings it did not cover. Where it is cited, its row number is given.

**Status vocabulary**: `IMPLEMENTED` · `PARTIAL` · `DOCUMENTED_ONLY` · `CODE_ONLY` · `PROCESS_ONLY` ·
`MISSING` · `UNKNOWN` · `NOT_APPLICABLE`.
**`CODE_ONLY` is the estate's signature state**: the code exists, is tested, and nothing reaches it.

---

# ⚠ FALSE IMPLEMENTATION / FALSE ASSURANCE — the highest-value section of this audit

A grep hit is not a control. Every row below **EXISTS**, most are **TESTED**, and none is **OPERATIONAL**
as a control. They are separated from the matrices because for a certification audit they are worse than
absence: an absent control is a finding, whereas a believed-present control is an *undetected* finding,
and in several cases a **published claim**.

**Method**: SOURCE → CALLER → RUNTIME PATH → TEST → PRODUCTION USE. Rows are new unless marked
*(known)*, in which case they cite the V1 audit row and only the current state is restated.

## §FA.1 — Controls that are authored and unreachable

| # | Control | Believed | Actual | Evidence | Standard it would have served |
|---|---|---|---|---|---|
| **FA-01** | ISO 19650 structured-name validation | A 19650-2 Annex A naming control exists — and `public/architecture.html:1104` **displays it as a live backend component** | `validateNameMiddleware` (`server/namingValidator.js:189`) is exported and **mounted nowhere**; `server.js:4708,4732` writes the client-supplied `structuredName` unvalidated | repo-wide grep: the file itself, one comment, one HTML chip | 19650-2; 9001 §7.5 |
| **FA-02** | The entire ISO 19650 CDE client surface | A CDE exists with version states, transmittals and structured naming | `CDEVersionPanel`, `StructuredNameBuilder`, `CDETransmittalPanel` are **never instantiated** outside `__tests__/`. The client's only `/versions/` call is a **read** (`PlatformProjectBrowser.ts:700`) | `new <Panel>(` occurs only in specs | 19650-2/-3 |
| **FA-03** | `hasPermission()` role matrix | 24 actions are permission-gated | **3 call sites** (`server.js:4621,4650,4677`), all membership admin. 21 declared actions incl. `edit_model`, `move_to_shared`, `read_wip` have **no call site** | `server/permissions.js:83` | 27001 A.5.15-18; 19650-2 |
| **FA-04** | `roleCheck(action)` Express middleware | A generic RBAC middleware exists | Zero call sites — only its own doc-comment example at `:98` | `server/permissions.js:100` | 27001 A.5.15 |
| **FA-05** | `assertScopes` throwing RBAC + `ScopeCheckError` | Scope enforcement | Zero call sites. Only the non-throwing `requireScopes` is used, and **only in `apps/api-gateway/`** — a surface separate from the deployed `server.js`. ⚠ **UNKNOWN whether `apps/api-gateway` is deployed at all; if not, all RBAC scope enforcement is unreachable in production** | `packages/api-rbac/src/index.ts:121,154,202` | 27001 A.5.15 |
| **FA-06** | Inbound webhook signature verification | Webhooks are authenticated | `verifyWebhook` (`packages/webhooks/src/signature.ts:64`) has **no production caller** — only the barrel and its own tests. Signing exists; verifying is never invoked by a route | as cited | 27001 A.8.26 |
| **FA-07** | PKCE for OAuth | — *(known, **L-764**)* | `verifyChallenge` (`packages/oauth2-pkce/src/index.ts:179`) has **zero consumers**. Confirms the code exists and is simply not wired | as cited | 27001 A.5.17 |
| **FA-08** | Kill-switches / feature flags | *"central registry for kill-switches & feature gates"* | `packages/feature-flags` (168 LOC) has **0 importers** across `apps/`, `packages/`, `server/`, `plugins/`, `src/`. ⇒ **There is no runtime way to disable a bad feature without a redeploy** — the sharp form of **L-770** | `packages/feature-flags/src/index.ts:1` | 27001 A.8.32; 9001 §8.5.6 |
| **FA-09** | The gateway audit log | An audit-log middleware exists | `createAuditLogMiddleware` (`server/auditLogMiddleware.js:130`) has **no production mount**, and **its `audit_log` table has no DDL anywhere** in `dbMigrate.js` or `schema.sql` | as cited | 27001 A.8.15; 9001 §7.5.3 |
| **FA-10** | C23 AI provenance | Every AI artefact is recorded; `TrustPage.ts:146` markets *"right-click any AI-generated element"* | `ai.recordArtefact` is **never dispatched**; the store is in-memory `Map`s; **no provenance tables exist**. The ProvenanceTab renders an always-empty list | `packages/stores/src/ProvenanceStore.ts:36-47`; `provenance-commands/recordArtefact.ts:74` | 42001; 9001 §7.5.3 |
| **FA-11** | AI usage recording | AI calls are metered and attributable | `recordAiUsage()` is **imported at `server.js:23` and never called** — all 11 in-app AI endpoints record nothing. And `aiUsageStore.js:78` defaults `model` to a literal, so recorded rows can misattribute | as cited | 42001; 9001 §9.1 |
| **FA-12** | C22 PII tier enforcement | — *(known, **L-765**)* | Still nothing in `server/` or `apps/` imports it; no `tier`/`region`/`consent` column | `packages/stores/src/ConsentStore.ts` | 27001 A.5.34 |
| **FA-13** | Supabase RLS | — *(known, **L-766**)* | Still applied by nothing; `server/schema.sql:384-390` has all seven `ENABLE ROW LEVEL SECURITY` lines **commented out**; and the service-role key bypasses RLS anyway | `server/supabase-rls.sql` | 27001 A.8.3 |
| **FA-14** | `requirePlan` / `requirePaidPlan` | — *(known, **L-758**)* | Still zero call sites; only their own JSDoc examples | `server/stripeMiddleware.js:45,69` | 9001 §8.6 |
| **FA-15** | Undo-correctness and OpenAPI invariant asserters | Dev-time invariants are checked | `assertCommandCapturesAbsolutes` (`packages/command-registry/src/PatchSnapshot.ts:206`) and `validateOpenApi3_1Invariants` (`packages/api-spec/src/loader.ts:125`) have no call sites | as cited | 9001 §8.3 |
| **FA-16** | Restore verification | The trust page sells a 4-hour RTO and a stamped drill cadence | `apps/bench/src/benches/restore-verify.bench.ts:47-76` returns `{status:'deferred'}` and **throws** *"the restore API implementation is not yet present"* if enabled. Its two real assertions are `it.todo`. The 14-night streak gate reads a file only this bench can write | as cited; claim at `scripts/build/prerender-apex.mjs:632-689` | 27001 A.8.13 |
| **FA-17** | AI plan-critique / generate-3-options workflows | Documented product capabilities | Registered on `AiPlane` by nothing — tests only. **One** workflow is actually registered: apartment-layout | `packages/ai-host/src/workflows/…/register.ts`; `ensureApartmentLayoutRegistered.ts:47` | 42001 inventory |

## §FA.2 — Gates that cannot fail, or fail open

| # | Finding | Evidence | Why it matters |
|---|---|---|---|
| **FA-18** | ⛔ **The 25 contract gates cannot block a production deploy.** `deploy-fly.yml:172` `REQUIRED_JOBS` omits `ga-gate`, and `:178` justifies it with a comment that `ci.yml:280` has already falsified | as cited | The L-775 hardening landed on the PR path; `ci.yml:22-31` records that **push-straight-to-main is the working method** |
| **FA-19** | ⛔ **16 of 25 gates are baselined as allowed-to-fail**, including `check-xss-guards.ts`, `check-project-isolation.ts` (C13) and `check-zoning-fidelity-label.ts` (C58 §1.4 — the *estimated-envelope-never-authoritative* control) | `tools/ga-gate/gate-debt.json:27-44` | The ledger states the position honestly (`:22-25`); **the job name — "GA-gate (25 contract gates)" — and the check board do not.** A reviewer sees green |
| **FA-20** | ⛔ **A `skipped` required job satisfies the deploy gate.** `deploy-fly.yml:231` treats `skipped` as passing | as cited | Add an `if:` to any required job and the gate silently stops gating. The `(absent)` path is handled correctly; `skipped` is not |
| **FA-21** | **Self-service deploy-gate bypass.** `bypass_ci_gate:'true'` on `workflow_dispatch` skips `ci-gate` entirely | `deploy-fly.yml:123,144-152,288-291` | Logged as a `::warning::` so it is auditable — but with no approval environment gating it |
| **FA-22** | ⛔ **Plugin revocation list fails OPEN and caches it for an hour.** `server/pluginSigningService.js:148-150` returns an **empty CRL** on any DB error; `server.js:6034` does the same; the response is cached `public, max-age=3600` (`server.js:6036`) | as cited | A transient Postgres blip publishes an empty CRL as an authoritative hour-cached document — **every revoked publisher key and plugin version becomes valid for an hour.** Companion `lookupPublisherKey` (`:121-123`) fails *closed*, correctly — so the fail-open is an inconsistency, not a policy |
| **FA-23** | **`/api/health` asserts telemetry it cannot emit.** `otel.active = !!process.env.OTEL_EXPORTER_OTLP_ENDPOINT` (`server.js:2673`) is computed from an env var, never from SDK start success; the OTLP packages are in no `package.json` and not in `pnpm-lock.yaml` | `server.js:2673`; `server/telemetry.js:49-108`; `fly.toml:78-80` | The monitored endpoint reports healthy monitoring while exporting zero spans |
| **FA-24** | **A green gate measuring the wrong end of the pipe.** `check-otel-spans.ts` is among the **9 passing** gates — it verifies spans are *authored* | `gate-debt.json` (absent from `failing`) | Same shape as PROBE-DISCIPLINE artefact #1 (a probe that compared a value to itself) |
| **FA-25** | **Scripts with no CI job.** `check:write-route-auth`, `check:cesium-gizmo`, `check:a11y-contrast` appear in no workflow (the first runs only inside `run-all.ts`, i.e. inside FA-18/FA-19). `package.json` also carries a commented-out `"//test:root"` fossil beside the live one | `package.json:23-26` | — |
| **FA-26** | **Scripts CI/docs reference that do not exist.** No `test:e2e` (**L-755**); no `bench` script and `grep -c bench ci.yml` → 0 (**L-773**, `apps/bench/baseline.json:5` claims the job) | as cited | — |
| **FA-27** | **C31's documentation gates are all "(planned)" and none exists** | `C31 §5`; `tools/`, `scripts/check/` | ⚠ C31 is **honest** about this. The defect is that CLAUDE.md is not — see §T1.1.4 |

## §FA.3 — Documents that assert a control which does not operate

| Document | Assertion | Reality |
|---|---|---|
| `CLAUDE.md` | *"The 8 principles — these are CI-enforced and merge-blocking"* | The P2/P3/P4/P6 gates are all in `gate-debt.json`'s tolerated-failing set |
| `public/architecture.html:1104` | Renders `namingValidator` as a live backend component | Dead code (FA-01) |
| `apps/bench/baseline.json:5` | A `bench` CI job runs the perf suite | No such job (**L-773**) |
| `/trust` (`prerender-apex.mjs:632-689`) | Per-tier backups, cross-region failover, 4-hour RTO, 90-day cold tier, stamped drill cadence, 30-day deletion | No backup executor; no deletion endpoint (**L-767**, **L-765**) |
| `TrustPage.ts:146` | *"right-click any AI-generated element →"* | The ProvenanceTab is always empty (FA-10) |
| `C08 §3.1` | Yjs CRDT merge *"implemented and wired"*; silent LWW *"FORBIDDEN"* | `apps/sync-server` is undeployed; production collab is socket.io rebroadcast = silent LWW (**L-391**) |
| `SPEC-32-CDE-MODULE.md:26-36` | An 8-code S0→S7 machine with `cde_revision` and `cde_comments` tables | Zero non-doc hits; the implementation is the 4-state model |

> **The pattern, stated once**: in every case the *capability* landed and the *connection* did not, and then
> a document, a test, a dashboard or a marketing page asserted it was done. For ISO purposes this is a
> single systemic nonconformity — **there is no control that verifies a control is reachable** — and it
> should be raised as one finding (**GAP-001**), not seventeen.

---

# TIER 1 — CERTIFICATION TARGETS (management systems)

> ⛔ None of the three standards below can be satisfied by software. Each requires a defined
> **organisation**: a scope, a policy, an owner, a risk assessment, records, an internal audit and a
> management review. PRYZM today is a founder plus agents. **The correct reading of Tier 1 is: what
> objective evidence does the product already generate, and what would an auditor find missing.**

## §T1.1 — ISO 9001 (QMS)

### §T1.1.0 — What an auditor would find surprisingly strong

Two assets are better than most certified estates and must not be replaced by anything this programme
invents:

- **The contract status ladder** — `docs/02-decisions/contracts/README.md:33-52` defines
  DRAFT → CANONICAL → **ACTIVE**, where *"ACTIVE is the only status that certifies code-conformance"* and
  *"flipping to ACTIVE requires a passing test as evidence, never inspection."* That is control of
  documented information done properly. ⚠ **No Tier-1 contract is ACTIVE today** — the ladder is honest
  about it, which is the point.
- **The L-NN Issue Log** (`docs/04-reference/V1-LAUNCH-READINESS-AUDIT.md §2`, to **L-781**) — append-only,
  founder-reported plus audit-found, with reproduction and root cause per row, plus §7.3's 20-row
  "believed done but actually unreachable" table with `file:line` evidence. **This is the de-facto
  nonconformity register and it should be formally designated as one**, not superseded.

### §T1.1.1 — What an auditor would find missing outright

`CODEOWNERS` · `PULL_REQUEST_TEMPLATE` · `CHANGELOG.md` · release tags (3 tags exist; all are
snapshot/backup labels, none a release) · `LICENSE` and a `license` field in `package.json` ·
`CONTRIBUTING.md` · `SECURITY.md` · dependency and licence policy · competence records · an internal-audit
**programme** · management review · incident records (`docs/04-reference/runbooks/incidents/` contains
**only `README.md` — zero incidents filed**).

### §T1.1.2 — ⛔ The highest-severity QMS finding: the deploy gate does not require the gates

`.github/workflows/deploy-fly.yml:172`

```
REQUIRED_JOBS="lint isolation command-manager test-server test-unit test-root apex-gates"
```

`ga-gate` is **not in that list**, and line 178 justifies the omission:
`#   ga-gate — continue-on-error by design (§H33/H34/H35 backlog).`
**That comment is false as of `ci.yml:276-280`**, where L-775 removed `continue-on-error`. Net effect:

> The 25 contract gates block a **PR merge** and cannot block a **push-to-main production deploy** — and
> `ci.yml:22-31` records that push-straight-to-main *is* the working method. **The hardening landed on the
> path that is not used.**

Two compounding defects on the same gate:
- **Fail-open on `skipped`** — `deploy-fly.yml:231` treats a required job whose conclusion is `skipped` as
  passing. Add an `if:` to any required job, or cancel a matrix leg, and the gate silently stops gating.
  (The `(absent)` path correctly fails; `skipped` does not.)
- **Self-service bypass** — `bypass_ci_gate: 'true'` on `workflow_dispatch`
  (`deploy-fly.yml:123,144-152,288-291`) skips `ci-gate` entirely. It emits a `::warning::`, so it is
  auditable — but there is no approval environment gating it.

### §T1.1.3 — Control matrix

| CLAUSE | REQUIREMENT | PRYZM IMPLEMENTATION | FILE / LOCATION | EVIDENCE | AUTOMATED TEST | OPERATIONAL EVIDENCE | OWNER | STATUS | GAP | RISK | RECOMMENDED ACTION |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 4–5 · Context, policy, roles | A quality policy and assigned process ownership | — | — | — | — | — | Founder | **MISSING** | No quality policy; no process owners | Certification blocker | Roadmap phase 2. Writing, not engineering |
| 7.1.6 · Organisational knowledge | Knowledge captured and maintained | ⭐ Exceptional — 65 contracts, 196+ ADRs, 82+ SPECs, 18 standards docs, per-jurisdiction dossiers | `docs/` | The corpus | — | Used daily | Founder | **IMPLEMENTED** | — | — | Nothing. This is a genuine strength |
| 7.2 · Competence · 7.3 Awareness | Competence determined, recorded | — | — | — | — | — | Founder | **MISSING** | No competence matrix, no role definitions, no training record | Certification blocker | Trivial for a 1-person org; write it once |
| 7.5 · Documented information | Identified, reviewed, approved, version-controlled, protected | C31 defines the whole protocol: header schema (`C31:56-60`), immutability/supersession (`C31:81-85`) | `docs/02-decisions/contracts/C31-DOCUMENTATION-AUTHORING-PROTOCOL.md` | The protocol | ❌ **every CI gate in C31 §5 is marked "(planned)"** — `check-doc-naming.ts`, `check-{adr,contract,snapshot,archive}-immutability.ts`, `check-docs-links.ts` — and **none exists** in `tools/` or `scripts/check/` | Enforced by founder review | Founder | **PARTIAL** | **C31 is itself DRAFT**, `Owner:` is explicitly *optional* (`C31:60`), and **only 5 of 65 contracts carry any Owner/Approver line**. No approval signature, no per-doc change log, no review-due date. ⚠ **C61 is missing from the contracts folder (C60 → C62) with no supersession stub** | Med | Make `Owner` mandatory; add an approver line; ratchet C31's naming + immutability gates first (they are cheap). ⚠ **C31 is honest about being planned — CLAUDE.md is not** (see §T1.1.4) |
| 8.3 · Design & development control | Inputs, controls, outputs, changes | ⭐ Strong — conflict-resolution hierarchy (`contracts/README.md:12-24`); ADR lifecycle PROPOSED→ACCEPTED→SUPERSEDED/REJECTED with one-decision-never-edited (`adrs/README.md §1-3`); a real corrective-action record for duplicate ADR numbers with redirect stubs (`adrs/README.md:5-15`) | as cited | The corpus | — | Operating | Founder | **IMPLEMENTED (documented) / PARTIAL (verified)** | Design *verification* is where it thins: a contract can be CANONICAL while prod contradicts it, by the ladder's own definition | Low | Prioritise flipping Tier-1 contracts to ACTIVE over writing new contracts |
| 8.4 · External provider control | Supplier evaluation, dependency policy | Lockfile discipline **is** real — every CI job uses `pnpm install --frozen-lockfile`; `pnpm-lock.yaml` + `pnpm-workspace.yaml` committed | `.github/workflows/ci.yml` (×8 jobs) | CI | ✅ | Operating | Backend | **PARTIAL** | No dependabot/renovate, no audit/SCA/licence step. Last SCA evidence is **stale and externally run**: `docs/04-reference/security/scans-2026-q4-baseline.md:5` — scan date 2026-04-28, *"SAST: **ERROR**"*, SCA 2 critical / 8 high | **High** | Dependabot + `pnpm audit` + licence check. Hours |
| 8.5.6 · Control of changes | Reviewed and authorised changes | Branch + CI + deploy gate | `.github/workflows/` | CI | ✅ | Operating | Backend | **PARTIAL** | ❌ no CODEOWNERS, no PR template, and `ci.yml:9-31` states plainly that required-status-checks are **not** the effective gate because the workflow is push-to-main. See §T1.1.2 | **High** | Add `ga-gate` to `REQUIRED_JOBS`; fix the `skipped` fail-open; add CODEOWNERS |
| 8.1 / 8.6 · Release control | Release authorised against criteria; records kept | `deploy-fly.yml` `ci-gate` → `deploy` → `flyctl deploy`; region FRA (`fly.toml:21`) citing C22 §1.3 / C49 §1.2; **expand-only idempotent migrations under an advisory lock, making image rollback schema-safe by construction**; 6 substantive runbooks | as cited | CI + runbooks | ✅ | Operating | Backend | **PARTIAL** | **No release record**: no changelog, no release tags, `package.json` version frozen at `2.0.0`, no `license` field. Cannot answer *"what shipped on date X"* except from git log | Med | Tag releases and generate a changelog. One afternoon; it is the cheapest QMS record in the estate |
| 9.1 · Monitoring & measurement | Product and process measured | Three health endpoints (`server.js:2597,2620,2631`) — genuinely good, gate deploys and LB routing | as cited | Code | Docker boot smoke (`ci.yml:459-460`) | Operating | Backend | **PARTIAL** | **No metrics endpoint, no `prom-client`, no APM.** OTel present but off. Sentry not a dependency. Net production observability = liveness/readiness only | High | One uptime monitor + one alert channel. Hours |
| 9.2 · Internal audit | A programme: schedule, independence, plan, findings, follow-up | ❌ as a programme. ✅ as *reports* — and they are numerous and high quality: `V1-LAUNCH-READINESS-AUDIT.md`, `security/{csp,oauth2,plugin-sandbox,rls}-audit-2026-q4.md`, `MISSING-CONTRACTS-AUDIT-2026-06-01.md`, `docs/archive/audits/` | as cited | The reports | — | Unscheduled, point-in-time | Founder | **PROCESS_ONLY (ad-hoc)** | No schedule, no auditor independence, no follow-up loop | Certification blocker | Convert the existing cadence into a scheduled programme. The hard part (capability) is already there |
| 9.3 · Management review | Documented review with defined inputs/outputs | — | — | — | — | — | Founder | **MISSING** | No minutes, no cadence | Certification blocker | Quarterly, one page. §0.1 of the assurance spec applies: **this must never become an envelope precondition** |
| 10.2 · Nonconformity & corrective action | Register, root cause, correction, effectiveness | ⭐ The L-NN log + secondary declared-debt ledgers: `tools/ga-gate/gate-debt.json`, `eslint-baseline-window-as-any.json`, `xss-sink-baseline.json`, `write-route-auth-exemptions.json`, `.github/ISSUE_TEMPLATE/quarantine.md` | as cited | The registers | — | Used every day | Founder | **PARTIAL — a real strength** | Missing NCR fields: **owner, due date, closure verification, explicit root-cause field**. No external tracker | Low | Add four columns. Do not migrate to a new tool |

### §T1.1.4 — The documented-information defect that matters most

`CLAUDE.md` states the 8 principles are *"CI-enforced and merge-blocking."* The tolerated-debt ledger
`tools/ga-gate/gate-debt.json` records that the gates for **P2** (`check-three-imports.ts`), **P3**
(`check-raf-count.ts`), **P4** (`check-window-store-in-packages.ts`) and **P6**
(`check-no-commandmanager.ts`, `check-commandmanager-any.ts`) are all in the failing set.

> **A governing document asserts a conformance that a machine-readable ledger in the same repository
> contradicts.** For ISO 9001 clause 7.5 that is the textbook defect: uncontrolled documented information
> asserting an unverified conformity. The V1 audit already flags this (*"CLAUDE.md needs a one-line
> correction"*, §7.8) — it is still uncorrected.

The same shape recurs at `public/architecture.html:1104`, which displays `namingValidator` as a live
backend component when it is dead code (see §T2.0), and at `apps/bench/baseline.json:5`, which claims a
`bench` CI job that does not exist (**L-773**).



## §T1.2 — ISO/IEC 27001 (ISMS)

### §T1.2.0 — The four findings an auditor would open with

1. **`/api/health` asserts a monitoring capability that cannot exist.** `server.js:2673` computes
   `otel.active = !!process.env.OTEL_EXPORTER_OTLP_ENDPOINT` — from an env var alone, never from SDK
   start success. `server/telemetry.js:49-108` dynamically imports `@opentelemetry/sdk-node` and
   `@opentelemetry/exporter-trace-otlp-http`, **which appear in no `package.json` and not in
   `pnpm-lock.yaml`**, so the import always falls into the catch at `:100`. `fly.toml:78-80` sets
   `OTEL_SERVICE_NAME`/`OTEL_RESOURCE_ATTRIBUTES` in production, reinforcing the appearance.
   ⇒ **Set the endpoint and the health endpoint reports healthy telemetry while exporting zero spans.**
   ⚠ And `check-otel-spans.ts` is one of the **9 passing** ga-gate gates — it verifies spans are
   *authored*, not *exported*. A green gate on the wrong end of the pipe.
2. **The publicly published DR promise has no executor.** `scripts/build/prerender-apex.mjs:632-689`
   renders a trust page asserting per-tier backups, cross-region failover, a 4-hour RTO, a 90-day cold
   tier and a stamped drill cadence. There is no `pg_dump`, no backup script, no `[processes]`/cron in
   `fly.toml`, and no backup workflow. `apps/bench/src/benches/restore-verify.bench.ts:47-76` returns
   `{status:'deferred'}` and **throws** *"the restore API implementation is not yet present"* if its flag
   is flipped; its two real assertions are `it.todo`. The 14-night streak gate
   (`scripts/cutover/cutover-checklist.mjs:42,150-154`) reads a file only that unwired bench can write.
   (Extends **L-767**/L-344.)
3. **Row-level security is a manual paste-file.** `server/supabase-rls.sql` is referenced by nothing;
   `server/schema.sql:384-390` has all seven `ENABLE ROW LEVEL SECURITY` lines **commented out**; and
   the file's own caveat notes the server uses `SUPABASE_SERVICE_ROLE_KEY`, which bypasses RLS anyway.
   Real isolation is app-layer (`canUserAccessProject`) and is genuinely reachable. (**L-766**.)
4. **The audit trail is neither append-only-enforced nor tamper-evident.**
   `server/versionStateMachine.js:11` claims append-only; there is no trigger, no `REVOKE`, no RLS
   backing it on the hosted path, no hash chain, no HMAC, and no retention policy. `event_log` writes
   are best-effort and swallow failures (`server/eventLog.js:59-61` ignores `42P01`).
   ⚠ **For 27001, evidence integrity is not a nice-to-have — an alterable audit log is not evidence.**

### §T1.2.1 — Control matrix

| CLAUSE / ANNEX A | REQUIREMENT | PRYZM IMPLEMENTATION | FILE / LOCATION | EVIDENCE | AUTOMATED TEST | OPERATIONAL EVIDENCE | OWNER | STATUS | GAP | RISK | RECOMMENDED ACTION |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 4–6 · Context, leadership, planning, risk assessment, SoA | Scope, policy, risk method, Statement of Applicability | — | — | — | — | — | Founder | **MISSING** | No ISMS scope, policy, risk register or SoA exists in the repository | Certification blocker | Phase 0/3 of the roadmap. ~2 weeks of writing, not engineering |
| 7 · Competence, awareness, documented information | Records of competence and controlled documents | Contract suite + ADRs are a strong controlled-document *body* | `docs/02-decisions/` | Status ladder DRAFT/CANONICAL/**ACTIVE** in `contracts/README.md:33-52` — an unusually good control | ❌ C31's `check-doc-naming.ts`, `check-{adr,contract,snapshot}-immutability.ts` are all marked **"(planned)"** and none exist | Docs are reviewed by the founder in-band | Founder | **PARTIAL** | No approver-of-record per document; no competence records | Med | Add an owner + approver line to the contract template; ratchet C31's gates |
| 8 · Operational planning and control | Change control, supplier control, secure development | See ISO 9001 §T1.1 | — | — | — | — | — | **PARTIAL** | — | — | — |
| 9 · Monitoring, measurement, internal audit, management review | Evidence the ISMS works | Health endpoints are genuinely good and gate deploys/LB routing | `server.js:2597,2620`; probe wired at `ci.yml:459-460` | Code | Docker build+boot smoke exists | ❌ no internal audit, no management review | Founder | **MISSING** (mgmt) / **PARTIAL** (monitoring) | — | Certification blocker | Roadmap phase 7 |
| 10 · Nonconformity & corrective action | A register, root cause, effectiveness check | **The L-NN Issue Log is a genuine, high-quality de-facto NCR register** — append-only, founder-reported + audit-found, with reproduction and root cause | `docs/04-reference/V1-LAUNCH-READINESS-AUDIT.md §2` (to **L-781**) | The log itself | — | Used every day | Founder | **PARTIAL — better than most certified estates** | No severity/closure discipline, no effectiveness verification, and it lives inside a launch-readiness document rather than standing alone | Low | **Do not replace it.** Give it a closure state and an effectiveness check, and cite it as the NCR register |
| A.5.7 / A.5.19-23 · Supplier & cloud security | Supplier register, DPAs, third-party risk | ~16 named suppliers + ~14 government GIS endpoints | `fly.toml`, `server/supabaseClient.js`, `server/stripeService.js`, `server/oauthService.js`, `packages/storage-driver/src/R2StorageDriver.ts`, `server/dwgConversionService.js`, `server/*Proxy.js` | Config exists | — | ❌ **no supplier register, no DPA inventory, no third-party risk assessment in repo** | Founder | **MISSING** | Compounded by **L-762** (geodata commercial terms unexamined) | **High** — existential per L-762 | Build the supplier register as a repository artefact; it doubles as the L-762 input |
| A.5.15-18 · Access control & identity | Least privilege, formal provisioning, review | `authMiddleware` reachable at ~80 mounts; bcrypt(12); beta allowlist re-checked per request (`server.js:1049-1065`); `canUserAccessProject` on Socket.io join and HTTP (`server.js:745,1118`); socket room authz on all 8 mutating events | as cited | Code + 13 structural tests on the beta gate | `check-write-route-auth.ts` is a **real gate**, now merge-blocking via `ga-gate:all` | Operating | Backend | **PARTIAL** | ⚠ `authMiddleware` **never rejects** — on an invalid/absent token it sets `userId:'anonymous'` and calls `next()` (`server.js:1080-1086`); authorization is per-handler. **`hasPermission()` has only 3 call sites** (`server.js:4621,4650,4677`) for a **24-action** matrix — 21 declared actions incl. `edit_model`, `move_to_shared`, `read_wip` have no call site. `roleCheck` middleware (`permissions.js:100`) is dead code. No MFA anywhere. 30-day JWTs with no revocation list | **High** | Route the 21 unenforced actions through `hasPermission`, or delete them from the matrix. A permission matrix with no callers is a *documented* claim of control |
| A.5.33 / A.8.10-12 · Data protection & retention | Classification, retention, deletion | C22 machinery exists (`DataTier`, `RetentionScheduler`, `ConsentStore`) | `packages/schemas/src/privacy/DataTier.ts`; `packages/stores/src/RetentionScheduler.ts` | Unit-tested | — | ❌ nothing in `server/` or `apps/` imports it; no `tier`/`region`/`consent` column exists | Product | **CODE_ONLY** | **L-765** | High at scale | Either wire the minimum (C22-min) or descope C22 loudly |
| A.8.5 / A.8.24 · Authentication & cryptography | TLS, strong crypto, key management | `force_https` (`fly.toml:88`); HSTS 2-year + preload, prod-only (`server/securityHeaders.js:480-484`, mounted `server.js:407`); bcrypt(12); `crypto.randomBytes(48)` | as cited | Code | — | Operating | Backend | **PARTIAL** | ⛔ **`server/pgClient.js:86` — `ssl: { rejectUnauthorized: false }` on every non-localhost DB connection.** Encrypted but unauthenticated: MITM-able to the database holding all customer data. **No key rotation anywhere** (no `kid`, no key version in JWTs, no re-key path). `server/authStore.js:30-39` and `oauthService.js:33-36` mint an ephemeral per-process `SESSION_SECRET` when unset — and `oauthService.js:36` does it with a silent `??`, no warning | **High** | Pin the DB CA and set `rejectUnauthorized: true`. One-line-ish fix; highest security value per hour in this table |
| A.8.6-9 · Secure configuration | Fail-fast on misconfiguration; no committed secrets | `assertRequiredEnv()` defined `server.js:346` and **called `:382`** — prod-fatal on missing `SESSION_SECRET`/`DATABASE_URL` | as cited | Code | — | Operating | Backend | **IMPLEMENTED** | Only those two are fatal; everything else is a soft warning | Low | Promote the security-relevant vars to fatal |
| A.8.8 · Vulnerability management | Dependency and image scanning | — | — | — | — | — | Backend | **MISSING** | ⛔ **Zero hits repo-wide** for `dependabot`, `renovate`, `npm/pnpm audit`, `audit-ci`, `sbom`, `cyclonedx`, `syft`, `trivy`, `snyk`, `grype`, `codeql`, `dependency-review` across all 7 workflows. The 2026-04-28 remediation was a one-off, now 3+ months stale (V1 audit §7.7 item 7) | **High** | Dependabot + `pnpm audit` + an SBOM job. **Hours, not days** — the cheapest 27001 win available |
| A.8.15-16 · Logging & monitoring | Security event logging, alerting | `event_log` reachable and properly gated (`server.js:4551-4558`); `version_audit_log` reachable; `notifyBlockedAccessAttempt` → Resend, reachable at 5 call sites (`server.js:1059,2110,2140,2259,2311`) | as cited | Code | — | ⚠ blocked-access email is the **only** alert that fires; default recipient is hardcoded (`accessAttemptNotifier.js:47`) | Backend | **PARTIAL** | `createAuditLogMiddleware` (`server/auditLogMiddleware.js:130`) has **no production mount and its `audit_log` table has no DDL anywhere** — a third audit mechanism that is neither wired nor schema-backed. No Sentry (`@sentry/*` in no package.json; vestigial `window.Sentry` guard at `ViewportCrashGuard.ts:313`). No on-call, no escalation, no external log sink — server logs die with the Fly machine | **High** (**L-760**, **L-761**) | Pick **one** audit mechanism, wire it, enforce append-only in the DB, add one alert channel |
| A.8.13-14 · Backup & redundancy | Backups taken, restore tested | — | — | — | `restore-verify.bench.ts` is a skeleton that asserts its own deferral | ❌ | Backend | **MISSING while publicly claimed** | See §T1.2.0 item 2 | **Existential** for a data product | One real `pg_dump` schedule + **one executed restore drill, written up**. Until then, correct the trust page |
| A.5.24-28 · Incident management | Runbooks, response, evidence collection | 5 real runbooks (`docs/04-reference/runbooks/DR-DRILL-RUNBOOK.md`, `RUNBOOK-DB-PRIMARY-FAILURE.md`, `RUNBOOK-REGIONAL-OUTAGE.md`, `RUNBOOK-RANSOMWARE.md`, `RUNBOOK-ACCIDENTAL-DELETE.md`) | as cited | Documents | — | ❌ nothing binds a runbook to an alert, because there are no alerts | Founder | **DOCUMENTED_ONLY** | No detection ⇒ the runbooks cannot start | High | Add detection first. A runbook without a trigger is a document, not a control |
| A.8.25-28 · Secure development | Secure SDLC, separation of environments | Real: lint, isolation checks, `check:commandmanager`, server tests, unit tests, **25 contract gates now merge-blocking**, build, a11y, Docker build+boot smoke | `.github/workflows/ci.yml`; `tools/ga-gate/run-all.ts` | CI | ✅ | Operating | Backend | **PARTIAL** | ⛔ `tools/ga-gate/gate-debt.json` declares **16 tolerated failures**, including `check-xss-guards.ts` and `check-project-isolation.ts`. **No staging environment** (L-770) | Med-High | Partition the debt ledger into `tolerable` / `never-tolerable`; move the security and isolation gates to the latter |
| A.5.34 / A.8.11 · Privacy | GDPR mechanisms matching published promises | — | — | — | — | ❌ | Founder | **MISSING** | **L-765** — `/trust` promises 30-day deletion; there is no deletion endpoint, no export, no DSAR store, no `deleted_at` column | **High** | Either build the minimum or change the promise. Do not leave them disagreeing |
| — | Supabase region · RLS/RPC applied · Cesium token revoked · ON DELETE CASCADE FKs present | — | — | — | — | — | Founder | **UNKNOWN** | ⚠ These cannot be settled from the repository. **Evidence required**: a Supabase dashboard screenshot of the project region; `\d+` output or a migration record proving the RLS policies and `pryzm_save_version` RPC exist; a Cesium ion dashboard token list; `information_schema.table_constraints` output for the project FKs | Med-High | State them as UNKNOWN in any customer-facing security claim until a dashboard check settles each |

## §T1.3 — ISO/IEC 42001 (AIMS)

### §T1.3.0 — The inversion

> **The best-governed AI subsystem in the estate is unreachable, and the operational AI surface has
> essentially no audit trail, no PII control, no evaluation, and a bypassable human gate.**

**Quarantined and well-governed** — `packages/ordinance-extraction/`. It *is* designed around an LLM
(`gates/dualPassAgreement.ts:4` names *"Pass A (OCR-then-LLM) and Pass B (direct-vision)"*), and it
carries: a pinned confidence tier `PIPELINE_TIER = 'pipeline-extracted-unverified'` placed **below**
`estimated-ruleset` so *"a machine read nobody has checked can never out-rank a curated estimate"*
(`confidence.ts:23-25,52`); a mandatory human-graduation gate (`humanVerifiedBy != null`,
`confidence.ts:58-62`); **six adversarial gates** (`dualPassAgreement`, `algorithmDetector`, `localeGate`,
`rangeSanityGate`, `arithmeticCrossCheck`, `supersessionGate`, `regimeGate`) — `algorithmDetector.ts:6`
exists specifically because *"an LLM asked 'what is the value?' will be tempted to"* invent one; and
`extractionModel` + `promptHash` recorded per plan (`pipeline.ts:58-63`). ⚠ **The `DualPassExtractor` port
has no production implementation** — the only implementers are `FakeExtractor` in two test files, and
nothing outside the package imports it.

**Operational and ungoverned** — the 11 in-app `/api/ai/*` endpoints plus the 4 `/v1/ai/*` public-API
routes, and `packages/ai-host`'s `AiPlane`.

### §T1.3.1 — ⛔ The live regulatory exposure is not where you would expect

`/api/ai/compliance/advise` (`server.js:1432`) is **operational today**. It prompts the model as an
*"expert BIM compliance consultant"*, instructs it to *"Cite the relevant regulation (e.g. HTM 04-01,
BB98, Building Regs Part M)"* (`server.js:1456`), and returns `data.content[0].text` **raw** at
`server.js:1500` — unvalidated, unrecorded, unlabelled, with no disclaimer.

**That, not the envelope pipeline, is PRYZM's live LLM-legal-determination surface.** The envelope path is
protected by the deterministic architecture C58 §1.1 mandates and the registry's registered-to-refuse
default; this endpoint has none of that protection and produces regulation-citing advice.

### §T1.3.2 — Control matrix

| CLAUSE / CONTROL | REQUIREMENT | PRYZM IMPLEMENTATION | FILE / LOCATION | EVIDENCE | AUTOMATED TEST | OPERATIONAL EVIDENCE | OWNER | STATUS | GAP | RISK | RECOMMENDED ACTION |
|---|---|---|---|---|---|---|---|---|---|---|---|
| AI system inventory | Every AI system identified, scoped, owned | 15 endpoints + 1 in-process plane, all discoverable | `server.js:1183,1270,1358,1432,1518,1616,1722,4806,4875,4949,5029`; `server/aiPublicApiRoutes.js:184-421`; `packages/ai-host/src/AiPlane.ts:60` | Code | — | ❌ no inventory document | Product | **MISSING (as a record)** | The systems exist and are traceable; nothing enumerates them | Med | **This matrix's §T1.3.2 table is the first inventory. Promote it to a maintained artefact.** Cheap, and clause 4.1's whole prerequisite |
| Model & version tracking | Model identifier recorded per inference | `ANTHROPIC_MODEL_ID = 'claude-haiku-4-5'` (`server.js:213`) — **an alias, not a dated snapshot**; the proxy force-overwrites any client-supplied model (`server.js:1176`) | as cited | Code | — | ⚠ recorded nowhere | Backend | **PARTIAL** | 🔴 **`recordAiUsage()` (`server/aiUsageStore.js:61`) is imported at `server.js:23` and never called.** Its only callers are in `server/aiPublicApiRoutes.js` — so **all 11 in-app AI endpoints record nothing** but a `console.log`. Worse, `aiUsageStore.js:78` defaults `model` to the literal `'claude-haiku-4-5-20251014'` regardless of what was called, so even recorded rows can misattribute. Stray hard-coded models: `AIElementFactory.ts:74` (`claude-sonnet-4-20250514`) and a **decommissioned** `claude-3-haiku-20240307` at `StrategizeBucket.ts:617` | **High** | Call `recordAiUsage` on every AI path; pin a dated snapshot id; remove the default-model fallback |
| Human oversight | A human approves before an AI change takes effect | ✅ Real: `AiPlane.submit()` never touches the command bus — it enqueues `AiPendingAction{status:'pending'}` (`AiPlane.ts:268-290`); ghost preview + Approve/Decline (`AIPanel.ts:850-886,944-985`); Accept disabled when `!proposal.validation.ok` (`AIPanel.ts:945`) | as cited | Code | — | Operating for the one registered workflow | Product | **PARTIAL — bypassable ×3** | 🔴 (a) *"Auto-execute parent wall for openings"* silently executes a **second, unapproved** command (`AIPanel.ts:1012-1022`); (b) catalogue nodes call `node.action()`/`dispatchBatchEntry` straight to `commandManager.execute` with **no proposal** (`AIPanel.ts:1173,1322`); (c) `autoapproveThreshold` **defaults to 0.85** on `/v1/ai/floorplan-import` (`aiPublicApiRoutes.js:96`) — API callers auto-apply AI-derived BIM geometry with no human in the loop. ⚠ The field is validated and **no downstream consumer was found** — either an unenforced promise or dead; **both are findings** | **High** | Close (a) and (b); decide (c) explicitly and document which it is |
| Approval evidence | The approval is a durable record | `AIApprovalRecord` (`packages/ai-host/src/AIApprovalRecord.ts:8`) | `AIApprovalStore.ts:5,58` | Code | — | ❌ **`localStorage` only** — device-local, user-clearable, never leaves the browser | Product | **CODE_ONLY** | Not an audit trail by any reading of 42001 or C23 | High | Persist approvals server-side |
| Agent & tool permissions | Scoped allowlist; no unbounded autonomous action | Intent vocabulary is the de-facto allowlist (25 intents, `packages/ai-host/src/intents/types.ts:1-42`) incl. **`DELETE_ELEMENT`** and **`TAG_ELEMENTS_BY_CONDITION`** (a query-scoped batch mutate, unbounded blast radius). Positive control: `canAutoExecute: false` typed as a literal on ~22 `RuleEngine` paths (`RuleEngine.ts:70…1068`, `AITypes.ts:216`) | as cited | Code | — | ⚠ | Product | **PARTIAL** | 🔴 `canAutoExecute` is consulted **only inside `RuleEngine`** — it does not gate `approveProposal`, `dispatchBatchEntry`, or any server endpoint. **No registry-level allowlist, no per-tenant scoping, no per-intent permission check.** `AiPlane.executeBatch()` (`:318`) runs N submits serially and on partial failure **swallows the throw and returns prior pending actions** (`:341-361`) — no rollback | **High** | Make the intent allowlist a real gate consulted at dispatch; bound `TAG_ELEMENTS_BY_CONDITION`; give `executeBatch` a rollback or make it atomic |
| Output verification | AI output validated before it becomes model state | ⭐ **Strongest live area.** `JSONRepair.ts`, `AIResponseParser.ts`, `ElementSchema.ts`; `RoomAICommandValidator.ts:14`; `DoorGeometricValidator.ts`, `WallCandidateScorer.ts`; and a real dimensional suite `workflows/apartmentLayout/dimensions/validate*.ts` (10 validators) | as cited | Unit-tested | — | Operating on the AiPlane path | Product | **IMPLEMENTED (AiPlane) / MISSING (server endpoints)** | 🔴 The 11 `/api/ai/*` endpoints return `data.content[0].text` **raw**. ⚠ `createResilientRelay` (`CfWorkerRelay.ts:29-47`) falls back to `MockAnthropicRelay` **demo fixtures** on any primary failure; its comment says the UI can tell the user — **nothing enforces that**, so `DEFAULT_LAYOUT_FIXTURE` (`AnthropicRelay.ts:156`) can be presented as an AI result | **High** | Validate or explicitly label the raw-text endpoints; make the demo-fixture fallback self-labelling rather than relying on the caller |
| Provenance & AI audit (C23) | Artefact written before return; 20-field tuple; lineage edges; 7-year retention | Schemas ✅ (`packages/schemas/src/provenance/*`); store ✅ (`packages/stores/src/ProvenanceStore.ts:36-47`, constructed at `composeRuntime.ts:954`); commands ✅; UI ✅ (`ProvenanceTab.ts`, wired at `InspectPanel.ts:236-263`) | as cited | Unit-tested | ❌ none of C23 §6's six CI gates exists | ❌ | Product | **CODE_ONLY — the whole chain** | 🔴 `store.addArtefact()` has **exactly one caller** (`provenance-commands/recordArtefact.ts:74`) and the command `ai.recordArtefact` **is never dispatched from anywhere**. ⇒ **The ProvenanceTab renders an always-empty list.** 🔴 The store is **pure in-memory `Map`s** and there is **no `ai_artefact`/`provenance_edge`/`context_snapshot`/`redaction_record` table** in `dbMigrate.js` or `schema.sql` — provenance dies at page refresh, so C23 §1.5's 7-year retention is **unimplementable as built**. Narrow exception: `GenerativeDesignApplyCommand.ts:133,158` sets `aiGenerated:true` in element metadata, which *does* persist — non-conformant but real | **High** | Either dispatch `ai.recordArtefact` on every AI path and add the tables, or **descope C23 loudly**. It must not stay in this state |
| Prompt & workflow versioning | Change control over prompts and models | — | `WorkflowDescriptor` (`packages/ai-host/src/types.ts:160-175`) has `id,title,kind,estimatedCostUsd,surface,description` | — | — | ❌ | Product | **MISSING** | 🔴 **No `version` field**, contradicting C23 §1.2 (*"MUST bump when the prompt, validator, or scorer changes"*). System prompts are inline string literals (e.g. `server.js:1448-1466`) with no hash or version. ⚠ The quarantined pipeline **does** carry `promptHash` — the good pattern exists, unused by the live path | Med-High | Add `workflowVersion` + `promptHash` to the live paths; copy the pattern from `ordinance-extraction` |
| Uncertainty & confidence | Calibrated, governed uncertainty | C62 vocabulary (`UnknownReason`, `AuthorityRank`, `ValidationState`, `DomainConfidence`) | `packages/schemas/src/site/metadata/DataConfidence.ts` | Code | — | ❌ for AI | Product | **MISSING for AI** | 🔴 AI confidence is a **bare ungoverned `confidence: number`** on `BaseAIIntent` (`intents/types.ts:48`) — no calibration, no provenance, no `ValidationState`. C62 §3 lists C23 as a consumer and defers migration out of ratification. Positive counter-example: `ordinance-extraction/src/confidence.ts` uses the vocabulary correctly | Med | Migrate AI outputs onto `DomainConfidence`. ⚠ An uncalibrated 0.85 default-auto-approve threshold (above) is exactly why this matters |
| Evaluation | Eval harness, golden corpus, drift detection | — | — | — | — | — | Product | **MISSING** | 🔴 **Zero** `*golden*`, `*eval*harness*`, `*.eval.ts`. `packages/ai-host/__tests__/` (100+ files) tests *deterministic* code against `FakeExtractor`/`MockAnthropicRelay` — **the LLM is stubbed in every single test.** No drift detection | **High** | A small golden corpus per live workflow. This is the clause 8.4 evidence an auditor will ask for first |
| Third-party AI & data flow | Provider named, sub-processors disclosed, data minimised | Single provider **Anthropic** (confirmed — no OpenAI/Gemini/Mistral/Cohere/Ollama key, SDK or endpoint anywhere). Chain: browser → PRYZM server → **Cloudflare Worker** (`flat-morning-358d…`, `server.js:195-197`) → `api.anthropic.com` | as cited | Code | — | Operating | Founder | **PARTIAL** | ⚠ CF is a **silent sub-processor hop** most DPAs would need to name. Data leaving the tenant: full geometry snapshots, room names, compliance-violation payloads with element IDs (`server.js:1465`), voice transcripts, and **arbitrary user-authored prompt bodies** through the pass-through proxy. Only `/api/ai/portfolio/query` claims anonymisation — in a **comment** (`server.js:1511-1515`), not in code. No zero-retention header, no region pinning | **High** | Name the sub-processors in the DPA (which also does not exist — **L-765**) |
| PII control | Redaction before prompt egress | C23 §1.6 mandates a `PiiRedactor` + `server/piiRedactor.config.js` with a fail-closed allowlist | — | — | — | ❌ | Security | **MISSING** | 🔴 Grep for `PiiRedactor\|redactPii\|piiRedactor\|REDACTION-FAILED` returns **exactly one hit — the C23 document line itself**. No `server/piiRedactor.config.js`. `RedactionRecord.ts` is a schema with no producer. **Nothing is redacted before any prompt is sent** | **High** | Either implement the minimum redactor or amend C23 to state plainly that nothing is redacted |
| Cost & abuse controls | Quotas, ceilings, attribution | ✅ Genuinely real: `aiLimiter` 20/15 min (`server/rateLimiter.js:35-41`, **not dev-skipped**); public API 10/min; 50 MB upload cap; `enforceAIQuota(callerId)` called at `server.js:1207,1281,1369,1443,1529`; `COST_CEILINGS_USD`; `preCheckBudget` (`AiPlane.ts:162`) with a reject path; `estimatedCostUsd ≤ $0.18` enforced by the registry; content-addressed tenant-scoped cache with hits not charged | as cited | Code | — | Operating — **the one real gate**, per V1 audit §7.4 dim. 4 | Backend | **IMPLEMENTED** | 🟠 `CostMeter.recordCall` failure is **swallowed** (`AiPlane.ts:239-247`) — spend can occur with no record. Combined with the `recordAiUsage` gap, **production AI spend for the main editor surface is unattributable**. Limits are per-**IP**, not per-tenant | Med | Fail loudly on cost-record failure; move limits to per-tenant |
| Transparency to users | AI-generated content is labelled | Preview banner *"AI is proposing N element(s)"* (`AIPanel.ts:850`) | as cited | Code | — | ⚠ preview only | Product | **PARTIAL** | 🟠 **After commit there is no persistent AI badge** in the viewport, property panel, schedules or any export (IFC/PDF/DWG carry no AI provenance). ⚠ `TrustPage.ts:146` markets *"right-click any AI-generated element →"* — pointing at the ProvenanceTab, **which is empty**. A marketed transparency feature that returns nothing | **High** — this is a published claim | Fix the claim or the feature. Do not leave them disagreeing |
| Autonomous-activation risk | A high-risk AI capability cannot be switched on without a decision | — | — | — | ❌ no gate | ❌ | Founder | **MISSING** | 🟠 **Watch item.** The day someone implements `DualPassExtractor` against `CfWorkerRelay`, the LLM-legal-determination pipeline becomes live. **No CI gate prevents that adapter from landing**, and its `promptHash`/`extractionModel` are recorded **in memory only** | Med now, **High on activation** | Add a gate that fails if a non-test `DualPassExtractor` implementation lands without a founder-signed ADR. Cheap insurance on the highest-consequence AI risk in the estate |



---

# TIER 2 — ISO 19650-1/-2/-3/-5 (information management)

**Verdict vocabulary**: ALIGNED / PARTIAL / MISSING / NOT APPLICABLE / UNKNOWN.
⚠ **Structural similarity is not conformity.** PRYZM contains a genuine, well-built 19650 CDE. The finding
below is not that it is absent — it is that **no user can reach it**.

## §T2.0 — ⭐ THE HEADLINE 19650 FINDING

PRYZM has, in production code:

- a **four-state CDE machine** with a transition graph, role gating, mandatory rejection reasons,
  archived-state immutability and a snapshot lock from `shared` onward — `server/versionStateMachine.js:27-35,101-117,163-166`;
- the **ISO 19650-2 Annex A suitability vocabulary** (`S0–S4, D1–D3, CR, A, B`), type codes, role codes and
  a revision regex `^(P\d{2}|C\d{2}|[A-Z])$` — `server/namingValidator.js:27-105`;
- **19650 project roles** as a real permission matrix (`appointing_party, lead_appointed, team_manager,
  team_member, viewer`) — `server/permissions.js:27-60`;
- an **append-only transition audit log** — `version_audit_log`, `server/dbMigrate.js:95-107`;
- **live HTTP routes** — `server.js:4705` (transition), `:4747` (audit), `:4771` (state);
- and a **client UI** for all of it — `CDEVersionPanel.ts`, `StructuredNameBuilder.ts`,
  `CDETransmittalPanel.ts`, each with binding tests.

And:

| Component | Reachable? | Evidence |
|---|---|---|
| `CDEVersionPanel` | ❌ **never instantiated** | `new CDEVersionPanel(` occurs nowhere in `apps/` outside tests |
| `StructuredNameBuilder` | ❌ **never instantiated** | same |
| `CDETransmittalPanel` | ❌ **never instantiated** — only in `__tests__/binding/CDETransmittalPanel.spec.ts` | same |
| `server/namingValidator.js` | ❌ **dead code** — `validateNameMiddleware` is exported and imported by nothing; `server.js:4708,4732` takes `structuredName` from the request body and writes it unvalidated | repo-wide grep returns only the file itself, one comment in `packages/protocol/src/StructuredName.ts:105`, and **a chip in `public/architecture.html:1104` that displays it as a live backend component** |
| The transition route | ⚠ **API-only** | the client's sole `/versions/` call is a **read** — `PlatformProjectBrowser.ts:700` fetches `…/state`. No client code ever POSTs a transition. |

> **So the ISO 19650 answer for PRYZM today is: the CDE is built, tested, documented in an architecture
> diagram, and unreachable.** This is the single largest block of *already-paid-for* certification evidence
> in the estate, and the cost of realising it is wiring, not construction. It is simultaneously the estate's
> most expensive false-assurance: an architecture page asserts a naming control that does not run.

## §T2.1 — Control matrix

| STANDARD | CLAUSE / CONCEPT | REQUIREMENT | PRYZM IMPLEMENTATION | FILE / LOCATION | EVIDENCE | AUTOMATED TEST | OPERATIONAL EVIDENCE | OWNER | STATUS | GAP | RISK | RECOMMENDED ACTION |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 19650-1 | Information container | Uniquely identified, revisioned, with status/suitability and classification | `project_versions` (id, label, snapshot, `state`, `revision_code`, `suitability_code`, `structured_name`, `rejection_reason`, `transitioned_by/at`, `idempotency_key`) | `server/dbMigrate.js:62-79`; `server/schema.sql:59-79` | Schema exists in the applied migration | Not verified as covered | ⚠ container = whole-project snapshot; no per-drawing/per-file container | Backend | **PARTIAL** | Granularity; **classification absent** (zero Uniclass/OmniClass/IfcClassification hits repo-wide) | Med — blocks any real appointment workflow | Add a classification field before claiming 19650-1; decide container granularity |
| 19650-2 | Information container naming (Annex A) | Codified, validated names | Full suitability/type/role/revision vocabulary implemented server-side | `server/namingValidator.js:27-105,154,174` | Code + client twin `packages/protocol/src/StructuredName.ts` | Client-side only | ❌ **middleware never mounted; server writes body value unvalidated** | Backend | **CODE_ONLY** | Server validation is dead code while a public architecture page shows it live | **High** — a *displayed* control that does not run | Mount `validateNameMiddleware` on `server.js:4708/4732`, or delete it and correct `public/architecture.html` |
| 19650-2 | CDE states | WIP / SHARED / PUBLISHED / ARCHIVE with controlled transitions | Real 4-state machine, transition graph, role gate, mandatory rejection reason, archive immutability, snapshot lock from `shared` | `server/versionStateMachine.js:27-35,101-117,163-166` | Code | Partially | ⚠ reachable only by direct API call | Backend | **PARTIAL** | No client can transition; S0–S7 exists only as an unvalidated string enum, while `SPEC-32-CDE-MODULE.md:26-36` mandates the 8-code machine plus `cde_revision`/`cde_comments` tables (**zero non-doc hits**) | Med | Wire `CDEVersionPanel`; reconcile SPEC-32 to the 4-state reality or build the 8-state one — do not leave them disagreeing |
| 19650-2 | Authorisation before publication | Approval gate by an accountable role | `shared → published` requires `lead_appointed`; `wip → published` structurally impossible | `server/versionStateMachine.js:31-42`; `server/permissions.js:41` | Code | — | Reachable only by API | Backend | **PARTIAL** | `approve_published: ['appointing_party']` exists in the matrix and **no code path calls it**; transmittals have UI and no route/table; **no content hash or signature** on a published revision (SPEC-32 §2.2 requires one) | Med | Implement the acceptance step + revision signing, or descope both explicitly |
| 19650-2 | Information delivery planning (EIR/BEP/TIDP/MIDP) | Requirements and delivery plans as managed information | — | `SPEC-39-EIR-BEP-TIDP-MIDP.md:20-35` | Spec text only | — | — | Product | **DOCUMENTED_ONLY** | No `EIR`/`BEP`/`TIDP`/`MIDP` type exists in `packages/schemas` | Low for now | Descope explicitly until an appointment-driven customer needs it |
| 19650-2/-3 | Audit trail of container change | Who changed what, when, from/to state | `version_audit_log` (action, performed_by, performed_at, from/to state, reason, metadata) | `server/dbMigrate.js:95-107`; writes at `server/versionStateMachine.js:133-146,211-221` | Code + schema | — | Table is written on transition | Backend | **PARTIAL** | Append-only is asserted in comments, **not enforced by trigger/revoke** on the hosted path (`docs/04-reference/security/rls-audit-2026-q4.md:22` records its RLS as MISSING; the self-host path has it at `pryzm-selfhost/init-db/03-rls-policies.sql:89-95`). Element-level change history is a separate log purged ~24 h (`dbMigrate.js:219`) | **High** — an audit trail that can be altered is not evidence | Enforce append-only in the DB; align hosted RLS with self-host |
| 19650-5 | Security-minded information management | Sensitivity triage of information containers; need-to-know partitioning | C22 `DataTier` (`pii\|project\|telemetry\|derived`) | `packages/schemas/src/privacy/DataTier.ts:26-37`; sole consumer `packages/stores/src/RetentionScheduler.ts` | Code | Unit-tested | Not wired to any container | Security | **MISSING as 19650-5** | This is a **privacy axis, not a security-triage axis**. `project_versions` has no sensitivity column; no security-minded BEP; the 5 CDE roles are the only partitioning | Med | Do not present C22 as 19650-5 conformance. Decide whether 19650-5 is in scope at all |
| 19650-3 | Operational phase / asset information | AIM handover | COBie is 0 lines (V1 audit §7.4 dim. 8) | — | — | — | — | — | **NOT APPLICABLE (today)** | Out of scope pre-GA | — | Keep descoped and say so |

## §T2.2 — The proposed PRYZM information-container model, mapped to 19650

Eight container classes (defined in [PRYZM-ENVELOPE-ASSURANCE-SPEC §3](./PRYZM-ENVELOPE-ASSURANCE-SPEC.md#3--the-information-container-model-feeds-the-19650-mapping)).
⚠ This is a **proposal**. Do not read the right-hand column as a conformity claim.

| PRYZM container | 19650 analogue | Identity today | Revision today | Suitability today | What is missing to be a 19650 container |
|---|---|---|---|---|---|
| **SOURCE** — a publisher's dataset/instrument | *Reference information / shared resource* | URL + layer name | publisher's, untracked | none | An identifier we own; a recorded version and validity period |
| **EVIDENCE** — captured response + fixture | *Information container* (the closest genuine match) | path under `jurisdictions/**/findings/` | git | MACHINE-READABLE-EVIDENCE-REGISTER `Status` (`Use\|Verified\|Investigate\|Investigating\|External\|Derived\|Closed`) — **the estate's only working suitability-like code** | Machine-readable form; a container ID; retention |
| **RULE** — a versioned rule pack | *Information container, approved* | module id + jurisdiction + zone | git | **signed / registered-to-refuse** — a genuine two-state authorisation gate (`packages/site-parcel-data/src/rulepacks/registry.ts`) | Explicit revision codes; an approver of record separate from the committer |
| **GEOMETRY** — parcel / footprint / terrain | *Geospatial reference* | parcel ref | none | provider confidence | CRS as data (see T3), retrieval date, licence |
| **CONSTRAINT** — resolved variable + `DerivationEntry` | *Derived information* | variable id | none | C62 confidence tier | Dependency chain (C64 layer 2, absent) |
| **ENVELOPE** — `BuildableEnvelope \| EnvelopeDetermination` | *Deliverable* | parcel + run | none | fidelity label | A revision code and a publication record |
| **VERIFICATION** — probe / gate / measurement run | *Verification record* | `tools/city-completion/measurements/*.json` | `measuredAt` | `status:'measured'` — documented as the **only** key that unlocks an axis, and documented as un-fakeable | Coverage beyond the five measured cities |
| **PUBLICATION** — the decision to show it | *Authorisation to share/publish* | ❌ | ❌ | ❌ | **The whole thing.** See EA-1. |

**Conclusion**: PRYZM's *geodata/evidence* side has invented, independently, a container discipline with
real status codes (EVIDENCE, RULE, VERIFICATION) that is in places **stronger than its BIM side's**, which
has the 19650 vocabulary and cannot reach it. The cheapest 19650 progress available is to connect these two
halves rather than build a third.

---

# TIER 3 — ISO 191xx (geospatial technical requirements — NOT certification targets)

For each: is this a **normative PRYZM technical requirement**, a **data-model requirement**, a **validation
requirement**, or **unnecessary**?

| STANDARD | REQUIREMENT KIND | PRYZM POSITION | IMPLEMENTATION | FILE / LOCATION | STATUS | GAP | RISK | RECOMMENDED ACTION |
|---|---|---|---|---|---|---|---|---|
| **ISO 19111** — CRS | **NORMATIVE technical requirement.** An envelope is a legal statement about a location; a CRS error is a legal error. | Two independent projection stacks | Scene/BIM: `packages/geospatial/src/GeospatialAdapter.ts:16,36` (proj4, explicit `proj4String`), `LTPENURebase.ts`, `IfcProjectedCRSRecord.ts:12-37` read on import (`IfcImporter.ts:620-649`). Geodata: `packages/site-parcel-data/src/geometry/nativeCrs.ts` — **explicit allow-list** of measurable metric CRSs (EPSG 25829-25833, 32629-32631) with per-entry ellipsoid, `normaliseCrs` handling `EPSG:`/`urn:ogc:def:crs:EPSG::`/OGC URI, and **returning `null` rather than defaulting to 4326** | as cited | **PARTIAL — the strongest geospatial area** | ⚠ **`ParcelFeature` carries no CRS field** (`apps/editor/src/ui/site/parcel/ParcelProvider.ts:75-91`) — WGS84 is a doc-comment convention, not data. **Datum shifts are not logged**: ETRS89-vs-WGS84 is acknowledged in prose (`nativeCrs.ts:56`; `parcelProviders/registry.ts:384`) with no transformation record and no accuracy figure. Two different classes are both named `GeospatialAdapter` (`packages/geospatial` and `packages/core-app-model/src/navigation/`) | **High** for certification, **Low** for today's accuracy — the refuse-on-unknown behaviour is the right failure mode | Add `crs` + `transformation` to `ParcelFeature`; record datum-shift provenance and accuracy; rename one `GeospatialAdapter` |
| **ISO 19115-1/-2** — metadata | **DATA-MODEL requirement.** | The right schema exists and is deliberately unwired | `packages/schemas/src/site/metadata/DataConfidence.ts` — `SourceProvenanceSchema:110-126` (`source`, `sourceVersion`, **`retrievedAt`**, **`license`**, `authorityRank`), `AuthorityRankSchema:71-78` with deterministic `authorityOutranks`, `UnknownReasonSchema:49-57`, `ValidationStateSchema:103-109`, `metadataEnvelope:165-175` | as cited | **PARTIAL / DOCUMENTED_ONLY at runtime** | The file's own header (`:26-28`) states it is DRAFT, *"NOT yet wired into consumers and deliberately NOT re-exported from the site barrel"*; C62 §3 defers consumer migration out of ratification. What **is** wired is thinner: `ProvenanceRecord.ts:34-42`, `ZoningProvenanceSchema`, and a mandatory climate one (`climateProvenance.ts:21`). ⚠ **licence is written as literal `null`** at eight sites in `siteDispatch.ts` (2153, 2991, 3214, 3626, 3843, 3945, 4176, 4475). **No dataset manifests exist** — the four payload JSONs in `site-parcel-data/src/providers/data/` have no metadata | **High** — licence-null is the data-layer twin of the L-762 licensing exposure | **C62 consumer migration is the single highest-leverage 191xx item.** Start with `license` and `retrievedAt` |
| **ISO 19157** — data quality | **VALIDATION requirement.** | Measures computed; thresholds deliberately withheld | `apps/editor/src/ui/site/parcel/parcelConfidence.ts:34-80` (`areaSigM2`, `perimeterM`, weighted centroid, bbox, vertex count, **Polsby–Popper compactness**); quality attributes `areaSource`, **`areaDeltaPct`**, `pointToParcelM`, `candidateMarginM`, `geometryComplete` (`ParcelProvider.ts:41-61`, wired in `CatastroParcelProvider.ts:88`, `WfsParcelProvider.ts:91`, `footprintPick.ts:79`); extraction gates `ExtractionProvenance.ts:52-88` (`dualPassAgreed`, `crossChecks[]`, `supersededCheck`, `humanVerifiedBy`) | as cited | **PARTIAL** | `parcelConfidence.ts:8-13` **deliberately withholds** the numeric measures from the label until a measured distribution exists — a **correct, honest** Phase-1 limitation. Consequence: there is a *data quality result* and no *conformance quality level*. No completeness ratio | Med | Measure the distribution across N parcels, then set acceptance thresholds. This is a **coverage-increasing** control: today an accurate parcel and a marginal one are labelled identically |
| **ISO 19107** — spatial schema | **VALIDATION requirement.** | ⭐ **Best-in-class in this estate** | `packages/site-parcel-data/src/geometry/ringValidation.ts` — closed defect vocabulary (`too-few-vertices`, `non-finite-coordinate`, `unclosed`, `zero-area`, `self-intersecting`) at `:53-72`; **detect-and-name, never repair** (`:12-17`), explicitly forbidding `buffer(0)` (`:69-70`); `normaliseRing` documented as an encoding change not a repair; shoelace orientation `:98-106`; CRS-scale-invariant collinearity epsilon `:36-43`. Sibling pure geometry in `packages/site-validators/` (containment, FAR, edge classification) hard-fails IFC export | as cited | **ALIGNED** | **Ring-level only.** No topological consistency *between* features — no parcel-to-parcel gap/overlap check, no planar-partition validation of a zoning coverage | Med — a zoning coverage with overlaps can silently bind two rules to one parcel | Add a planar-partition validator for zoning coverages. Pair it with EA-6 (instrument precedence) |
| **ISO 19131** — data product specification | **DATA-MODEL requirement (light).** | Enforced as Markdown discipline, nothing machine-readable | `docs/04-reference/standards/MACHINE-READABLE-EVIDENCE-REGISTER.md` (one row per dataset; machine-readability *measured* with URL/status/content-type/bytes; `Publishable` column separating machine-readable from legally usable); per-jurisdiction dossiers under `docs/04-reference/jurisdictions/{es,dk,de,fr,gb,it,nl,no,pt,se,fi,be,ch,sa,us}/` governed by `_TEMPLATE/` | as cited | **PARTIAL — PROCESS_ONLY** | No per-dataset spec artefact in code. A consumer of `providers/data/*.json` cannot discover content, quality or delivery terms from the data | Med | Emit a minimal machine-readable dataset descriptor per provider; generate the register row from it rather than the reverse |
| **Temporal validity** (19115 lineage / 19108) | **DATA-MODEL requirement.** | Legal currency modelled; data currency not | `ExtractionProvenance.ts:17-33` `SupersessionStatusSchema = vigent\|derogated\|under-appeal\|unknown`; `governingInstrumentSignpost.ts:99-100,169-219` reconciles the Catalan RPUC `vigencia` incl. the `detall`-omits/`basica`-has case; absence of a currency source is a **typed named blocker** (`esCanariasSipu.ts:354-357`); `FetchOutcome.ts:35-39` keeps `absent` (cacheable) distinct from `transient` (never cached, never shown as "nothing here") | as cited | **PARTIAL** | ⚠ **No effective date and no retrieval date on any parcel or zoning record at runtime.** `retrievedAt` exists only in the DRAFT `SourceProvenance`; `ZoningProvenanceSchema` has `version` and no timestamp; `ParcelFeature` has neither. **Staleness is therefore not programmatically detectable** — it is tracked by dated prose and `verified-live YYYY-MM-DD` comments, and the codebase flags this itself (`esAmbMetropolitanCorpus.ts:42,144` — *"non-official, non-exhaustive and stale to 31-12-2009"*) | **High** — a silently stale rule pack publishes a confidently wrong legal number | Add `retrievedAt` + `effectiveFrom/To` to zoning and parcel records; add a staleness gate that degrades the tier rather than refusing (coverage-preserving) |
| **ISO 19119 / 19110 / 19139** | **UNNECESSARY** | Service metadata, feature cataloguing and XML encoding buy PRYZM nothing at this stage | — | — | **NOT_APPLICABLE** | — | — | Record as descoped so nobody re-raises it |

## §T3.1 — What the contracts already encode (do not re-derive)

| Contract | ISO 191xx concepts already encoded |
|---|---|
| **C12** | 19111: LTP-ENU mandate w/ 1 km threshold; proj4 as the sole projection library, DI-injected; CI gate on 1 cm round-trip; `IfcProjectedCRS` stored on import and written on export. **No transformation-accuracy or datum-shift provenance.** |
| **C55** | 19115 (partial): §1.5 per-source attribution mandatory; §1.4 graceful absence; §1.6 sensitive layers carry the C22 tier |
| **C57** | Densest coverage. 19111 §1.1/§1.6 · 19115 §1.4/§1.9/§2.2 · 19157 §2.4 `ParcelGeometryMetrics`, §1.11 cadastral geometry has a known quantum and vertices must never be moved, §1.12 the *manzana* prefix is an OBSERVED heuristic **with a measured failure rate** that must be labelled as one |
| **C58** | 19157/19107: fidelity tiers; §1.4 no false provenance; §1.9 purity/determinism; §1.11 **granularity** (parcel vs ámbito vs sector) — effectively an ISO 19157 scope declaration; §1.6 per-value extraction provenance |
| **C62** | The would-be **19115 + 19157 core** — and it is DRAFT with consumer migration explicitly outside ratification. **Highest-leverage single item for 191xx alignment.** |
| **C64** | Consumes the above; introduces no independent 191xx concept |
