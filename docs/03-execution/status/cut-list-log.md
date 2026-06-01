# Cut-List Log — `[strategic ADR-018]` Tier-1 + Tier-2 Final State at GA

**Date opened**: 2026-04-29 (S72 D5)
**Owner**: Architecture lead
**Source**: `[strategic ADR-018]` Tier-1 + Tier-2 cut-list discipline; per-sprint cut decisions S31 → S72

This document is the canonical consolidated cut-list-log referenced
by ADR-0054 §F. Each row records the cut ID, the description, the
default open/closed state at the time of `[strategic ADR-018]`
authoring, the final decision at GA, the sprint+day the decision
was taken, and the reversal cost.

The cut-list discipline absorbed 6 cuts over the 36-month build
without one schedule slip. Each cut had a pre-declared reversal
cost; the pre-declaration removed the meeting overhead at cut-time.
This is one of the load-bearing process commitments documented in
`docs/03-execution/status/post-mortems/PRYZM-2-build.md` §3.

---

## §1 Tier-1 cuts

| Cut ID | Description | Default | Final state at GA | Decision sprint+day | Reversal cost | Notes |
|---|---|---|---|---|---|---|
| T1.1 | Defer PWA shell | open | **CUT** (deferred to v2) | S31 | 2 sprints | Beta cohort uses desktop-first deployments; PWA shell not on M36 critical path. |

---

## §2 Tier-2 cuts (per `[strategic ADR-018]` §2 + S59 D7 review)

| Cut ID | Description | Default | Final state at GA | Decision sprint+day | Reversal cost | Notes |
|---|---|---|---|---|---|---|
| T2.1 | Defer DXF/SVG **export** | open | **CUT** (deferred to v2 backlog) | S59 D1 | 1 sprint | Zero beta-cohort demand; PDF export already covers 2D handoff; DXF *import* shipped S55 (`plugins/dxf-import/`) covers the consumption side. Reversal trigger: customer requesting DXF export with willingness-to-pay flag. See `apps/bench/reports/M30-3B.md` §1.2. |
| T2.2 | Defer further component editor marketplace richness | already cut at S54 | **STAYS CUT** (re-confirmed at S59 D7) | S54 (initial) / S59 D7 (re-confirm) | 1-2 sprints | Component editor v1 (`apps/component-editor/`) shipped S55 + S56 + S57 with parameter table + expression DSL + IFC Pset binding + .pryzm-family v1 — the cut was the *deferral of further marketplace richness*. Real-time co-presence stays cut at GA per phase-doc §7 (single-author at GA). |
| T2.3 | Defer multi-language UI | open | **CUT** (deferred to Phase 4) | S59 D7 | 2 sprints | Beta cohort is en-only; i18n requires full string-extraction + RTL audit; not justified at current cohort size of 25 invitees. |
| T2.4 | Defer collaboration cursor history (replayable timeline) | open | **STAYS OPEN — wait for first request** | S60 D2 (initial review) | 1 sprint | Yjs awareness throttle (S44, 60 Hz) handles live cursors; cursor *history* is a beta-feedback-driven feature. |
| T2.5 | Defer offline-first | open | **CUT** (post-GA) | S60 | 2-3 sprints | Multiplayer is the M36 differentiator; offline-first conflict-resolution adds complexity; defer until post-GA. |
| T2.6 | Defer multi-region (EU-West + US-East regional Supabase primaries) | open | **CUT** (per ADR-0049, S67 D9) | S67 D9 | 2 sprints | Per ADR-0049 (5 documented reasons): no measured demand at GA (beta cohort 90%+ NA); +2 sprint cost would slip GA to ~M38; self-host satisfies most data-residency asks via Hetzner/OVH/Scaleway Frankfurt; SOC2 sequencing — multi-region adds per-region attestation surface; operational maturity — DR drill at S69 D6 establishes single-region rollback runbook before expanding. P1 in `docs/03-execution/plans/post-ga-roadmap.md` §2. |

---

## §3 In-flight cut decisions S55–S72 (sprint-audit-deferred items not in `[strategic ADR-018]`)

These are items that S55–S72 audits explicitly deferred but were not
part of the original `[strategic ADR-018]` Tier-1/Tier-2 cut list.
They are documented here for completeness so the GA cut-list final
state is one canonical place.

| Item | Cut/defer state at GA | Decision sprint+day | Reversal target |
|---|---|---|---|
| ARM64 multi-arch image publish | deferred (operator-side) | S67 D5 | Post-GA when ghcr.io creds + `docker buildx` CI available; no design change |
| Fresh-VM `docker-compose up` matrix verified across distros | deferred (operator-side) | S67 D6 | Post-GA when Docker host + VM matrix available |
| `docker compose config` daemon validation lint | deferred (operator-side) | S67 D8 | Post-GA when Docker daemon available |
| sync-server + bake-worker `/health` route wiring | deferred (S67 follow-up) | S67 D2 caveat | S67 close or S68 D7 |
| Independent third-party plugin sandbox audit | deferred (external) | S68 D4 | External vendor; lands as §4.4 of `docs/04-reference/security/plugin-sandbox-audit-2026-Q4.md` when received |
| RLS per-table policy migrations + verified test queries | partial — gap accepted at S68 close; fix at S69 D6 | S68 D5 | Live Postgres dependency |
| OAuth2 production resource server wiring | deferred | S68 D6 | S70 D8 carry-forward |
| SAML / SCIM runtime adapter | deferred (mappings as contract) | S68 D6 | S70 D8 carry-forward |
| SAST re-run (first attempt errored at transport) | deferred | S68 D7 | S68 D8 / S69 D1 |
| SCA remediation re-scan | deferred | S68 D8 | Post-remediation |
| First quarterly secret-rotation drill #1 | deferred (calendar) | S68 D10 | Calendar event |
| Browser matrix live multi-browser cuts | deferred (operator-side CI) | S70 D2/D9 | `.github/workflows/browser-matrix.yml` |
| ghcr.io image push (no creds in dev) | deferred (operator-side) | S70 D8 | `pryzm-selfhost/scripts/publish-prep.sh --push` |
| SPEC-45 PDF-fixture-corpus accuracy run | deferred → S72 D5 → preserved as `'preview'` per ADR-0054 §C | S70 D8 / S72 D5 | Post-GA `evaluatePreviewGate(realMetrics)` flip |
| Workflow registration of 7 new vitest test surfaces in `.replit` | blocked by stale-cache 14/10 limit (5 orphan stubs) | S70 D8 | Operator-side `.replit` edit |
| Precision-budget tightening for `largest-model.{parse,produce}` | deferred (catastrophic-detector ON, precision tuning needs CI runner) | S71 D9 | Post-GA isolated CI runner |
| 4-hour Playwright session-driven memory-leak sim | deferred (Node-side synthetic landed) | S71 D9 (Node side) | Post-GA staging Playwright session driver |
| DR drill #1 against live staging Postgres | deferred (operator-side) | S70 D8 / S71 D8 | DR-DRILL-RUNBOOK §10 |
| Cold-load NFT baseline promotion (3 rows: small / medium / large) | deferred (mechanical step) | S71 D9 | `pnpm bench && pnpm bench:baseline` per S71 §6 |
| `orbit-fps` real-browser p95 baseline | deferred (Playwright-side) | S71 D9 | Post-GA isolated CI runner |
| `undo-single.bench.ts` dedicated bench | deferred (`cmd-execute-latency.bench.ts` proxy) | S71 D9 | Post-GA bench addition |
| LAUNCH on D7 Tuesday | calendar gate | S72 D7 | Operator-side |
| First 24-h monitoring + 48-h triage | calendar gate | S72 D8 / S72 D9 | Operator-side |
| 5-min demo video posted | deferred (S71b D5) | S71b D5 | Operator-side |
| 5 case studies published | deferred (S71b D6) | S71b D6 | Operator-side |
| Stripe checkout + pricing config end-to-end test | deferred (S71b D3 / S72 D4) | S71b D3 | Operator-side staging |
| ≥ 100 paying users | business KPI | post-LAUNCH | Operator-side |
| All 72 sprint retros archived in `docs/03-execution/status/retros/` | deferred (mechanical) | post-S72 D10 | Mechanical archive |
| `src/` PRYZM 1 tree deletion | deferred (sunset window) | post 2026-Q3 | After 90-day sunset window per `docs/03-execution/plans/pryzm-1-sunset.md` §3 |
| `packages/persistence-client/__tests__/file-system-backend.test.ts` constructor-export fix | deferred (existing-code, post-GA) | S70 D8 noted | Post-GA |
| `pryzm-vi-parity` workflow stale-failure visibility | deferred (existing-code, post-GA) | S68 close noted | Post-GA |
| `.replit` registry stale-stub cleanup (5 orphans) | deferred (platform issue) | S70 D8 noted | Operator-side |

---

## §4 Cut-list discipline post-mortem (excerpted from `docs/03-execution/status/post-mortems/PRYZM-2-build.md` §3)

> *"`[strategic ADR-018]` Tier-1 + Tier-2 absorbed 6 cuts (T1.1 + T2.1 +
> T2.2 + T2.3 + T2.4 + multi-region) without one schedule slip. Each
> cut had a pre-declared reversal cost; that pre-declaration removed
> the meeting overhead at cut-time."*

The post-GA roadmap (`docs/03-execution/plans/post-ga-roadmap.md`) re-prioritises every
cut by post-LAUNCH customer signal:

- **T2.6 (multi-region)**: P1 (next quarter)
- **T2.2 (component editor real-time co-presence)**: P2 (mid-year)
- **T2.3 (i18n / multi-language UI)**: P3 (deferred)
- **T2.5 (offline-first)**: P3 (deferred)
- **T2.1 (DXF/SVG export)**: re-evaluated when first customer requests with willingness-to-pay flag
- **T2.4 (cursor history)**: re-evaluated when first customer requests
- **T1.1 (PWA shell)**: P3 (deferred)

---

## §5 Cross-references

- `[strategic ADR-018]` Tier-1 + Tier-2 cut-list discipline (the original list)
- ADR-0049 (S67 D9 multi-region cut decision)
- ADR-0054 §F (this log's anchor)
- `apps/bench/reports/M30-3B.md` §1 (T2.1 DXF/SVG decision)
- `apps/bench/reports/M30-3B.md` §2 (S59 D7 Tier-2 review)
- `docs/03-execution/status/post-mortems/PRYZM-2-build.md` §3 (cut-list discipline post-mortem)
- `docs/03-execution/plans/post-ga-roadmap.md` §2 + §3 + §4 (post-GA cut re-prioritisation)

---

*Owner: Architecture lead. Updated 2026-04-29 at S72 D5 to consolidate
the cut-list discipline's 36-month arc in one canonical doc per
ADR-0054 §F.*
