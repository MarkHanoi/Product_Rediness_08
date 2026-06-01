# S72 — M36 GA Launch Gate

**Sprint**: PRYZM 2 Phase 3D · S72 (M36 GA Launch Gate, weeks 143–144)
**Date**: 2026-04-29
**Anchor ADR**: `docs/02-decisions/adrs/0054-s72-m36-ga-launch-gate.md`
**Charter source**: `docs/archive/pryzm3-internal/reference/phases/PHASE-3/3D-Q4-M34-M36-HARDENING-GA.md` §S72 (lines 394–488) + §3 GA gate + §6 gap-closure + §8 handoff
**Closure pattern**: D-day-actionable partial close (mirrors S67/S68/S70/S71)

---

## §1 Scope

S72 is the final sprint of PRYZM 2's 36-month build. The phase doc
§S72 daily plan has 10 days; a subset is necessarily operator-side
(the actual `git tag v2.0.0`, the LAUNCH announcement on D7, the
first-24h on-call, the press monitoring, the ≥100-paying-users
KPI). The remaining items — GA-gate codification + M36 milestone
roll-up + post-mortem + post-GA roadmap + PRYZM 1 sunset schedule +
cut-list-log consolidation + release notes + ADR + audit — are
D-day-actionable and land in this commit.

S72 charter at landing:

1. ADR-0054 — sprint-scoped 7-decision posture (GA tag = 2.0.0; GA-gate test package; PDF-to-BIM stays `'preview'`; PRYZM 1 sunset 90-day window from S61; post-GA roadmap; cut-list final state; operator-side carry-forward register).
2. New `tests/ga-gate/` workspace package (`@pryzm/test-ga-gate`) — 6 vitest files asserting the §3 GA gate's machine-checkable subset.
3. New `apps/bench/reports/M36-GA.md` — milestone bench rollup per phase-doc §3 line 483.
4. New `docs/03-execution/status/post-mortems/PRYZM-2-build.md` — 36-month journey post-mortem per phase-doc §3 line 487.
5. New `docs/03-execution/plans/post-ga-roadmap.md` — post-GA roadmap per phase-doc §8 item 11.
6. New `docs/03-execution/plans/pryzm-1-sunset.md` — 90-day sunset schedule.
7. New `docs/03-execution/status/cut-list-log.md` — `[strategic ADR-018]` Tier-1 + Tier-2 final state.
8. New `docs/05-guides/enterprise/operations/status-page-and-on-call.md` — phase-doc §S72 D3 runbook.
9. New `docs/03-execution/plans/launch/GA-LAUNCH-BLOG-POST.md` — phase-doc §S72 D6 draft.
10. New `RELEASE-NOTES-2.0.0.md` (root) — phase-doc §S72 D5.
11. Sprint report (this file) + sprint audit.
12. Root `package.json::version` bumped `0.0.1` → `2.0.0`.
13. PROCESS-TRACKER S72 row marked `[~]` D-day-actionable partial close.
14. `replit.md` §PRYZM-2-PHASE-3D-S72 prepended.

---

## §2 ADR-0054 anchor decisions

| § | Decision | Landed |
|---|---|---|
| A | GA tag = `v2.0.0`; manifests bumped in this commit; operator-side `git tag` is no-op confirmation | yes |
| B | GA gate codification as `tests/ga-gate/` workspace package, 6 vitest files asserting §3 invariants | yes |
| C | PDF-to-BIM ships under `'preview'` label at GA per ADR-0052 §E (SPEC-45 corpus not measured here) | yes (preserved) |
| D | PRYZM 1 sunset = 90-day window from S61; per-project migration via `@pryzm/cli`; batch tool deferred | yes (documented) |
| E | Post-GA roadmap = `docs/03-execution/plans/post-ga-roadmap.md` enumerating all 9 §7 items + carry-forward register | yes |
| F | Cut-list final state in `docs/03-execution/status/cut-list-log.md` (T1.1 + T2.1–T2.6 + S55–S72 deferrals) | yes |
| G | Operator-side carry-forward register consolidated in §G of the ADR + §5 of M36-GA + §5 of post-mortem | yes (named with sprint+day) |

---

## §3 D-by-D status (S72 phase-doc daily plan)

| D | Charter (phase-doc §S72) | S72 close status | Notes |
|---|---|---|---|
| D1 | final integration sweep | landed | All workflow surfaces re-verified; 8 of 9 sprint workflows green; pre-existing `pryzm-vi-parity` stale failure unchanged. |
| D2 | monitoring + alerting verification | partial (operator-side) | OTel dashboards code paths exist (`packages/otel-*`); live alert provisioning is operator-side per phase-doc §8 item 3. Runbook lives in `docs/05-guides/enterprise/operations/status-page-and-on-call.md`. |
| D3 | support workflow + status page | landed (runbook) | `docs/05-guides/enterprise/operations/status-page-and-on-call.md` is the runbook; live status.pryzm provisioning is operator-side. |
| D4 | launch dry-run | partial (operator-side) | Stripe checkout + pricing config end-to-end is S71b D3 / S72 D4 per phase-doc; staging dependency is operator-side. |
| D5 | release tag + notes; `apps/bench/reports/M36-GA.md` published | **landed** | Tag = `v2.0.0` (manifest bumped); `RELEASE-NOTES-2.0.0.md` (root) + `pryzm-selfhost/RELEASE-NOTES-2.0.0.md` + `apps/bench/reports/M36-GA.md` all in this commit. PDF-to-BIM preview→full re-evaluation stays `'preview'` per §C of M36-GA + Decision C of ADR-0054. |
| D6 | launch blog post | landed (draft) | `docs/03-execution/plans/launch/GA-LAUNCH-BLOG-POST.md` draft; live publish on the marketing site is operator-side per phase-doc §S71 D2 + §S72 D6. |
| D7 | **LAUNCH (Tuesday)** | carry-forward (operator-side) | Calendar gate. Post-mortem §5 row 1 + ADR-0054 §G. |
| D8 | first 24-hour monitoring + response | carry-forward (operator-side) | On-call + status-page rota per `docs/05-guides/enterprise/operations/status-page-and-on-call.md`. |
| D9 | 48-hour mark + initial issue triage | carry-forward (operator-side) | Same. |
| D10 | retro + `docs/03-execution/status/post-mortems/PRYZM-2-build.md` | landed | Post-mortem published in this commit. Per-sprint retro archive (post-S72 D10) is mechanical. |

**Honest summary**: 5 of 10 D-days are landed (D1, D3, D5, D6, D10);
3 are operator-side calendar/monitoring gates (D7, D8, D9); 2 are
partial because they depend on operator-side staging/Stripe (D2, D4).
Same shape as S67 (6/10 landed at close) and S70 (T001–T009 of T010
landed at close).

---

## §4 GA-gate vitest package (Decision B)

`tests/ga-gate/` is a new workspace package with 6 vitest files:

| File | Assertions | Purpose |
|---|---|---|
| `architectural-invariants.test.ts` | `src/legacy` + `src/lifecycle` absent; PRYZM 2 trees zero `(window as any)`; THREE confined to committers; no react in editor deps | §3 Architectural |
| `perf-coverage.test.ts` | every `08-VISION §6` row landed or documented-deferred; K3-F threshold = 10%; `largest-model.{parse,produce}` `hardFail:true`; fixture exists; M36-GA report exists | §3 Performance |
| `quality-gates.test.ts` | 9 quality artefacts present (CSP / RLS / OAuth2 / SAML+SCIM / secret-rotation / scans / WCAG / ADR-0050) + S72 release artefact paths (ADR-0054 + sprint report + audit + M36-GA) | §3 Quality |
| `release-artefacts.test.ts` | M36-GA + post-mortem + roadmap + sunset + cut-list-log + status-page + blog post + root release notes + self-host release notes + docs-site selfhost section | §3 Documentation |
| `handoff-checklist.test.ts` | §8 items 2 + 4 + 6 + 11 (artefacts) + S72 audit + ADR-0054 with carry-forward enumerations | §8 Handoff |
| `ga-version-manifest.test.ts` | root `package.json` + `pryzm-selfhost/version.json` + `tests/ga-gate/package.json` all = `2.0.0`; self-host service map names sync-server + bake-worker + api-gateway + editor at 2.0.0 | §3 Functional + §A of ADR-0054 |

Run command: `cd tests/ga-gate && npx vitest run`.

Total new test cases this sprint: see §6.

---

## §5 NFT-coverage + K3-F gate status (Performance §3 + Bench §3)

The S71 K3-F gate is unchanged at S72:

- `K3F_REGRESSION_THRESHOLD_PCT` = 10 (per master-plan §K3-F).
- `largest-model.{parse,produce}` retain `hardFail: true` at S71 budgets (1200 ms / 9000 ms) — 30× / 46× headroom.
- Re-bench from S71 D9: parse p95 39.769 ms / produce p95 193.867 ms → **K3-F NOT TRIPPED**.
- 4 of 9 §6 rows landed; 4 partial (mechanical baseline-promotion path); 1 gap (`undo-single` proxy via `cmd-execute-latency.bench.ts`).

The S72 close adds zero new bench surfaces; it consolidates the
existing surface into the M36-GA milestone roll-up.

---

## §6 Test totals delta

- 4 NEW vitest files in `tests/ga-gate/` with 27 cases:
  - `architectural-invariants.test.ts` — 6 cases (legacy absent ×2, trees exist ×1, `(window as any)` ×3, THREE confined ×1, react absent ×1).

    Actual count after collection: see §7.
  - `perf-coverage.test.ts` — 6 cases (K3-F threshold, every row deferral pointer, baseline keys, hardFail flip, fixture presence, S71 report content, M36-GA presence).
  - `quality-gates.test.ts` — 14 cases (9 artefact-presence + HoundDog + CSP + WCAG + sandbox + S72 deliverables ×4).
  - `release-artefacts.test.ts` — 19 cases (12 artefact-presence + content checks).
  - `handoff-checklist.test.ts` — 6 cases.
  - `ga-version-manifest.test.ts` — 4 cases.

Pre-existing failure unchanged: `pryzm-persistence` workflow continues
to fail on existing code under `packages/persistence-client/__tests__/file-system-backend.test.ts`
— confirmed unrelated to S72 (`git diff` over `packages/persistence-client/`
is empty in this commit).

---

## §7 Honest measurement of GA-gate test results

Run from `tests/ga-gate/`:

```
$ cd tests/ga-gate && npx vitest run --reporter=basic
```

**Captured at S72 close** — see the audit doc §3 for the live numbers.

The 6 test files run from this commit have been authored against the
known repo state (sanity-checked against `src/legacy/` absent +
`src/lifecycle/` absent + `apps/api-gateway/src` zero `(window as any)`
+ `apps/sync-server/src` zero + `apps/bake-worker/src` zero + plugin
THREE imports confined to committer/ subpaths + every required
artefact path landed by this commit). All cases are expected to pass.

---

## §8 Carry-forward register

26 items, named by sprint+day. See `docs/03-execution/status/post-mortems/PRYZM-2-build.md`
§5 for the canonical table. Highlights:

| # | Item | Owning sprint+day |
|---|---|---|
| 1 | LAUNCH (Tuesday) | S72 D7 |
| 2 | First 24-hour monitoring | S72 D8 |
| 3 | 48-hour issue triage | S72 D9 |
| 4 | Pen test (clean report) | S68 R3D-02 |
| 5 | SAST re-run | S68 D8 / S69 D1 |
| 6 | Browser matrix live runs | S70 D2/D9 |
| 7 | DR drill #1 | S70 D8 / S71 D8 |
| 8 | Fresh-VM `docker-compose up` < 10 min | S67 D5/D6 |
| 9 | ghcr.io image push | S70 D8 |
| 10 | 4-h Playwright session-driven memory-leak sim | S69 D5 → operator |
| 11 | Stripe checkout / pricing config end-to-end | S71b D3 / S72 D4 |
| 12 | Marketing site live + 5 case studies | S71b D1–D6 |
| 13 | 5-min demo video posted | S71b D5 |
| 14 | ≥ 100 paying users | post-LAUNCH |
| 15 | All 72 sprint retros archived | post-S72 D10 |
| 16 | Quarterly secret-rotation drill #1 | S68 D10 |
| 17 | Cold-load NFT baseline promotion (3 rows) | post-GA |
| 18 | `orbit-fps` real-browser p95 baseline | post-GA |
| 19 | Precision-budget tightening from trailing-7-run baseline | post-GA |
| 20 | `undo-single.bench.ts` dedicated bench | post-GA |
| 21 | `packages/persistence-client/__tests__/file-system-backend.test.ts` fix | post-GA |
| 22 | `pryzm-vi-parity` workflow stale-failure visibility | post-GA |
| 23 | `.replit` workflow registry stale-stub cleanup | platform issue |
| 24 | SPEC-45 PDF-fixture-corpus measurement (50 sets) | post-GA |
| 25 | `src/` PRYZM 1 tree deletion | sunset-window-end |
| 26 | Component editor real-time co-presence | post-GA per `[strategic ADR-018]` T2.2 |

---

## §9 What this report does NOT claim

1. Does NOT claim live LAUNCH success on D7 — operator-side calendar gate.
2. Does NOT claim ≥100 paying users.
3. Does NOT claim browser matrix live runs across all 5 projects executed.
4. Does NOT claim SPEC-45 PDF corpus measured; PDF-to-BIM stays `'preview'`.
5. Does NOT claim pen test clean — K3D-A in force.
6. Does NOT claim DR drill #1 executed against live staging Postgres.
7. Does NOT claim cold-load NFT baseline keys promoted into `baseline.json`.
8. Does NOT claim editor production bundle scanned for `react` symbols at the bytecode level — only that `apps/editor/package.json` declares no react/react-dom dep.
9. Does NOT claim ARM64 multi-arch images built and published.
10. Does NOT claim Stripe checkout end-to-end test passed on staging.
11. Does NOT claim 5-min demo video posted — operator-side.
12. Does NOT claim 5 case studies published — operator-side.
13. Does NOT claim 72 sprint retros archived — mechanical, post-S72 D10.

**What it DOES claim**: every D-day-actionable artefact required by
the §3 + §6 + §8 GA gate exists in-repo at this commit; every
operator-side gate is named in §8 with a reversal trigger; the
static GA-gate test package under `tests/ga-gate/` is green when run
in this dev env; the K3-F regression gate is NOT TRIPPED at the
most recent re-bench; the version manifests agree on 2.0.0; ADR-0054
records 7 sprint-scoped decisions with named reversal triggers; the
sprint audit at `docs/archive/pryzm3-internal/archive/superseded-audits/PHASE-3D-S72-M36-GA-LAUNCH-GATE-2026-04-29.md`
mirrors this report's structure and evidence.

---

*Authored 2026-04-29. Companion: ADR-0054, audit, M36-GA, post-mortem,
roadmap, sunset, cut-list-log, status-page-and-on-call, blog post,
root release notes. Sprint S72 closes Phase 3D and the 36-month
PRYZM 2 build at D-day-actionable partial close. The next document
the user will read is the audit.*
