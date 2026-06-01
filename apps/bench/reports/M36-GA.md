# M36 GA Gate Report — Phase 3D M36 milestone bench rollup

- **Status**: D-day-actionable partial close (S72 D5 deliverable)
- **Date**: 2026-04-29
- **Sprint**: S72 (D5)
- **Phase**: PRYZM 2 Phase 3D · M36 GA Launch Gate
- **Spec**:
  - `phases/PHASE-3D-Q4-M34-M36-HARDENING-GA.md` §3 GA Gate criteria + §6 gap-closure + §8 handoff
  - `phases/PHASE-3-COMPLETION-GA-M25-M36.md` §K3-A through §K3-G kill-switches
  - `08-VISION.md §6` NFT contract (9 rows)
  - `[strategic ADR-018]` Tier-1 + Tier-2 cut-list final state
  - ADR-0054 (S72 sprint posture)

This report is the **M36 GA milestone roll-up** for PRYZM 2.0.0.
M30 (3B) closed the IFC/DXF/Rhino + BCF surface; M33 (3C) closed
public REST + WS + webhooks; M36 (3D) closes self-host + security +
WCAG + perf + GA. The cumulative scoreboard is the contract for the
release tag.

The M36 closure pattern matches M30/M33 — D-day-actionable items
land in-repo with green vitest evidence; live-runtime gates (LAUNCH,
press, ≥100 paying users, browser matrix live runs, pen test) are
operator-side and named by sprint+day in §5.

---

## §1 NFT scoreboard (08-VISION §6, single source of truth `@pryzm/perf-budgets`)

The NFT contract is locked in `packages/perf-budgets/src/nft-targets.ts`
(S71 ADR-0053 §C). Per the K3-F gate, **>10% regression on any NFT
target halts forward 3D work**. The S71 K3-F static gate
(`apps/bench/__tests__/k3f-regression-gate.test.ts`) is green
(7/7 tests), and the S71 re-bench of the largest fixture confirms
the 10K × 50 fixture remains within budget by 30×–46× headroom.

| # | NFT row                                  | PRYZM 1 baseline                 | PRYZM 2 target                              | Status at M36 | Evidence                                                                                                                            |
|---|------------------------------------------|----------------------------------|---------------------------------------------|---------------|-------------------------------------------------------------------------------------------------------------------------------------|
| 1 | Cold load — small (50 walls / 1 level)   | 2.4 s wall-clock to interactive  | < 800 ms                                    | partial       | `apps/bench/src/benches/load-small.bench.ts` exists since S19 D3; no `baseline.json` entry promoted yet. Promotion is mechanical. |
| 2 | Cold load — medium (500 walls / 5 lvl)   | 8.7 s                            | < 1.5 s first-interactive, full at 4 s      | partial       | `apps/bench/src/benches/load-medium.bench.ts` exists since S19 D4. Same mechanical promotion.                                       |
| 3 | Cold load — large (5K walls / 20 lvl)    | OOM / browser hang               | < 3 s first-interactive, full at 12 s       | partial       | `apps/bench/src/benches/load-large.bench.ts` + tier-streamed loader (S23 D9). First-interactive needs an isolated CI runner.       |
| 4 | Save (single wall edit)                  | 380 ms (full snapshot POST)      | < 10 ms (one event append)                  | **landed**    | `persistence.save-edit.append.{idb,memory}` in `baseline.json` — landed S04 D5. Hard-fail flag: yes (warn-only had been deferred). |
| 5 | Idle CPU (camera still)                  | ≈ 16 % (one core)                | < 3 % (no committers, scheduler idle)       | **landed**    | `frame-scheduler.idle-cpu` in `baseline.json` — landed S03 D5.                                                                      |
| 6 | Interactive frame rate (orbit)           | ≈ 28 fps median (varies)         | > 55 fps p95 on M1 / Ryzen-class            | partial       | Geometry-side cost benched (`orbit-fps-walls.bench.ts` + `orbit-fps-cw.bench.ts`); real-fps gate is browser-side, S70 matrix CI. |
| 7 | **Largest model — 10K walls × 50 levels**| **OOM**                          | **opens & orbits**                          | **landed**    | `largest-model.{parse,produce}` flipped to `hardFail:true` at S71 (ADR-0053 §A); 30× / 46× headroom under budget; **K3-F NOT TRIPPED** at re-bench. |
| 8 | Server bake — incremental                | 18 s full re-cook                | < 3 s for single-element edit               | **landed**    | `bake.incremental.single-wall-edit` in `baseline.json` — landed S08 D6.                                                             |
| 9 | Undo single wall edit                    | 95 ms                            | < 16 ms (one frame)                         | gap (proxy)   | No dedicated `undo-single.bench.ts`; `cmd-execute-latency.bench.ts` exercises the closest path. Tracked in S71 §6.                  |

**Rollup**: 4 of 9 fully landed; 4 of 9 partial (bench files exist,
baseline-key promotion is the mechanical next step); 1 of 9 is a
documented coverage gap. The K3-F gate is NOT TRIPPED. The S72 gate
ships GA with the partial rows recorded as honest carry-forwards
(per ADR-0054 §B reversal triggers).

---

## §2 SPEC §11 Phase rollout green-light table (§3 Bench)

Per phase-doc §3 Bench: *"`pnpm bench all` green at SPEC §11 Phase
rollout requirements for every SPEC."* The rollup below cites the
last-passing run for each SPEC's measured surface; rows whose §11
gate is operator-side are marked with the responsible gate.

| SPEC | §11 contract                                                | M36 status   | Evidence                                                                                       |
|------|-------------------------------------------------------------|--------------|------------------------------------------------------------------------------------------------|
| SPEC-15 §8 | Self-host install < 10 min on 4-vCPU Linux             | unverified   | Static review only; first-run on operator host (S67 D6 carry-forward).                         |
| SPEC-23 | CRDT linearisation correctness                              | landed       | `apps/sync-server/__tests__/*` green at last run.                                              |
| SPEC-24 | Bake pipeline incremental p95 < 3 s                         | **landed**   | `bake.incremental.single-wall-edit` in `baseline.json`.                                        |
| SPEC-25 | `.pryzm` v1 round-trip                                      | landed       | `packages/file-format/__tests__/round-trip.test.ts` green.                                     |
| SPEC-26 | Format v1 freeze                                            | partial      | Charter lives in S71b (renumbered marketing+format-freeze sprint); ADR pointer in §5.          |
| SPEC-27 §7 | install / upgrade / rollback CLI                         | **landed**   | `apps/cli/__tests__/migration-commands.test.ts` 12/12 green at S70 D8.                         |
| SPEC-27 §9 | DR rollback runbook tested in last drill                 | partial      | Drill #0 = runbook itself; drill #1 carries forward operator-side per ADR-0051 §C + ADR-0053 §F. |
| SPEC-28 §11 | BYO-key safety cap default $25                          | **landed**   | `packages/ai-cost/__tests__/selfHostCap.test.ts` 7/7 green at S70 D8.                          |
| SPEC-30 §2 | All four plugin tiers green                              | **landed**   | T1 wall + T2 window + T3 structural + T4 toy-cube committers all bench-clean.                  |
| SPEC-32 | Public REST + WS rate-limit                                 | landed       | `apps/api-gateway/__tests__/*` 175 tests green; webhook signing < 0.06 ms/op (M33 §webhooks).  |
| SPEC-45 | PDF-to-BIM accuracy thresholds (page / scale / wall / opening) | **carry-forward** | ADR-0052 §E ships under "preview" label until ≥50 real PDF sets measured (S72 D5 re-eval). See §3. |
| ADR-022 | Single-frame-owner audit                                    | landed       | `pnpm bench single-frame-owner-audit` green per ADR-023 Part F.                                |
| ADR-026 Part C | Editor production bundle has 0 `react` symbols         | landed       | `apps/editor/package.json` has no react/react-dom; bundle scan operator-side at publish.        |
| ADR-027 | Formula library frozen at v1                                | landed       | `@pryzm/formulas` 12 built-ins; freeze enforced (M33 §M33 rollup).                             |
| ADR-028 Part G | SOC2 evidence audit-trail                              | partial      | `querySoc2Evidence` adapter exists since S57 D7; quarterly auto-report cadence operator-side.  |
| ADR-029 Part E | PDF-to-BIM "preview" or "full" label gate              | **landed**   | `apps/ai-worker/src/pdf-to-bim/preview-gate.ts` `evaluatePreviewGate()` 12/12 green at S70 D7. |
| ADR-030 Part D | `plugins/lifecycle/` GA-shipped                        | partial      | `src/lifecycle/` deleted at S70 D8; `plugins/lifecycle/` re-introduction post-GA per ADR-030 §D. |

**Honest interpretation**: every SPEC §11 row is either landed or
has a documented deferral pointer with a responsible sprint+day. No
silent gaps.

---

## §3 PDF-to-BIM preview→full gate re-evaluation (S72 D5 per ADR-0052 §E + ADR-029 Part E)

The phase-doc S70 D8 charter shipped the gate primitive
(`evaluatePreviewGate(metrics)`); the S72 D5 charter is the **flip
decision**. Re-evaluated at S72 D5 (this date):

| Threshold (ADR-029 Part E)   | Required | Measured at S72 D5 | Decision |
|------------------------------|----------|--------------------|----------|
| Page-class accuracy          | ≥ 0.90   | n/a                | n/a      |
| Scale accuracy               | ≥ 0.95   | n/a                | n/a      |
| Wall precision               | ≥ 0.85   | n/a                | n/a      |
| Wall recall                  | ≥ 0.75   | n/a                | n/a      |
| Opening precision            | ≥ 0.80   | n/a                | n/a      |

**Decision at S72 D5**: ships under `'preview'` label. The SPEC-45
fixture corpus of ≥ 50 real PDF sets has not been measured here; the
preview-gate function defaults to `'preview'` per its safety contract
(`evaluatePreviewGate({})` returns `'preview'`), and the in-source
`PDF_TO_BIM_RELEASE_LABEL = 'preview'` constant is unchanged.

**Reversal trigger**: when an operator runs the SPEC-45 corpus
through `evaluatePreviewGate(realMetrics)` and the function returns
`'full'`, flip `PDF_TO_BIM_RELEASE_LABEL` to `'full'` and append a
new row to this table referencing the run output. This is a one-line
constant flip plus a release-notes delta — no API surface change.

This honest "preview at GA" landing is the same posture S70 closed
under ADR-0052 §E and is consistent with phase-doc §K3D-D (PDF-to-BIM
kill-switch).

---

## §4 Two-week green-streak ledger (§3 GA exit item 5)

§3 GA exit item 5 reads: *"`pnpm bench all` green for two consecutive
weeks."* The bench harness has been operating since S03; the 2-week
ledger is satisfied by:

| Week ending | Bench surfaces green                                                                 | Notes                                                             |
|-------------|---------------------------------------------------------------------------------------|-------------------------------------------------------------------|
| 2026-04-21  | `idle-cpu` + `save-edit` + `bake-incremental` + `cmd-execute-latency` + `largest-model.{parse,produce}` | S69 D3 last full run; pre-S70 lifecycle-delete sweep.            |
| 2026-04-28  | Same set + `largest-model.{parse,produce}` re-benched at S71 (re-bench within noise floor; K3-F NOT TRIPPED) | S71 D9 last full run.                                            |

**Honest gap**: the `cold-load-{small,medium,large}` rows are not in
this ledger because their baseline keys have not been promoted (S71
§6 carry-forward). The 2-week green streak applies to the 5
landed-with-baseline rows; the 4 partial rows are gated on the
mechanical baseline-promotion step described in S71 §6 + the
isolated-CI-runner reversal trigger from ADR-0053 §A.

---

## §5 Carry-forward register (operator-side, named by sprint+day)

| # | Item                                                          | Owning sprint+day | Path/runbook                                                      |
|---|---------------------------------------------------------------|-------------------|-------------------------------------------------------------------|
| 1 | LAUNCH (Tuesday)                                              | S72 D7            | Calendar gate; founder + agent on-call.                           |
| 2 | First 24-hour monitoring                                      | S72 D8            | Status page + alerting (operator-side provisioning).              |
| 3 | 48-hour issue triage                                          | S72 D9            | On-call rota.                                                     |
| 4 | Pen test (clean report)                                       | S68 R3D-02        | External vendor; phase doc §K3D-A kill-switch in force.           |
| 5 | SAST re-run (first attempt errored at transport)              | S68 D8 / S69 D1   | `runSastScan`; baseline at `docs/04-reference/security/scans-2026-Q4-baseline.md`. |
| 6 | Browser matrix — live multi-browser cuts                      | S70 D2/D9         | `.github/workflows/browser-matrix.yml`.                            |
| 7 | DR drill #1 against staging Postgres                          | S70 D8 / S71 D8   | `docs/archive/pryzm3-internal/runbooks/DR-DRILL-RUNBOOK.md` §10.       |
| 8 | Fresh-VM `docker-compose up` < 10 min on Ubuntu/Debian/RHEL × ARM64+x86_64 | S67 D5/D6         | `pryzm-selfhost/install.sh`; ARM64 needs ghcr.io publish.          |
| 9 | ghcr.io image push (no creds in dev env)                      | S70 D8            | `pryzm-selfhost/scripts/publish-prep.sh --push`.                   |
| 10| 4-h Playwright session-driven memory-leak sim                 | S69 D5 → operator | `apps/bench/scripts/heap-leak-hunt.mjs` is Node-side complement.   |
| 11| Stripe checkout / pricing config end-to-end test on staging   | S71b D3 / S72 D4  | Per phase-doc S71 D3.                                              |
| 12| Marketing site live (pryzm.com) + 5 case studies              | S71b D1–D6        | Per phase-doc S71 D1+D6.                                            |
| 13| 5-min demo video posted                                       | S71b D5           | Per phase-doc S71 D5.                                               |
| 14| ≥ 100 paying users                                            | post-LAUNCH       | Business KPI; tracked outside repo.                                |
| 15| All 72 sprint retros archived in `docs/03-execution/status/retros/`               | post-S72 D10      | Mechanical archive of per-sprint retro notes.                      |
| 16| Quarterly secret-rotation drill #1                            | S68 D10           | `docs/04-reference/security/secret-rotation-playbook.md` §5.                    |
| 17| Cold-load NFT baseline promotion (3 rows)                     | post-GA           | `pnpm bench && pnpm bench:baseline` per S71 §6 mechanical step.    |
| 18| `orbit-fps` real-browser p95 baseline                         | post-GA           | Playwright-side; depends on isolated CI runner per ADR-0053 §A.    |
| 19| Precision-budget tightening from trailing-7-run baseline      | post-GA           | ADR-0051 §A formula; reversal trigger on isolated CI runner.       |
| 20| `undo-single.bench.ts` dedicated bench                        | post-GA           | Closes the §1 row 9 coverage gap.                                  |

---

## §6 Cross-cutting scoreboard (M30/M33/M36 cumulative)

- **M21 (2C)**: PDF export, sheet/schedule snapshots — ✅
- **M24 (beta)**: AI host lazy-bootstrap, beta gate items — ✅
- **M27 (3A)**: PDF-to-BIM v1 (preview label) — ✅ (landed S55–S56)
- **M30 (3B)**: IFC import + IFC export + DXF import + Rhino import + BCF round-trip + component editor (deferred to v2 per `[strategic ADR-018]` T2.2) — ✅
- **M33 (3C)**: Plugin SDK 1.0 + marketplace + public REST + WS + headless + AI public API + webhooks + workspace AI spend rollup + enterprise admin overrides + formula library — ✅
- **M34 (3D)**: Self-host docker-compose + multi-region cut decision (ADR-0049) — ✅ (landed S67)
- **M35 (3D)**: Security hardening + SOC2 automation + SAML/SCIM mappings + WCAG 2.2 AA + browser matrix + perf hunt + 10K-wall hard-fail flip — ✅ (landed S68 + S70 + S71)
- **M36 (3D GA)**: GA launch gate — ⚠ partial close (D-day-actionable in-repo; D7 LAUNCH operator-side per §5)

---

## §7 What this report does NOT claim

1. **Does NOT** claim live LAUNCH success on D7 — that is an operator-side calendar gate.
2. **Does NOT** claim the ≥100 paying-users metric.
3. **Does NOT** claim browser matrix has been executed live across all 5 projects (Chromium / Firefox / WebKit / Edge channel / iPad Safari).
4. **Does NOT** claim the SPEC-45 PDF-fixture-corpus has been measured (the preview-gate is staying at `'preview'` precisely because the corpus is not in dev env).
5. **Does NOT** claim the pen test is clean; the kill-switch K3D-A is still in force on operator-side delivery.
6. **Does NOT** claim DR drill #1 has been executed against a live staging Postgres.
7. **Does NOT** claim the precision tuning of `largest-model.{parse,produce}` budgets from a trailing-7-run baseline; only that the catastrophic-regression detector hardFail flag is on at the existing wide budgets.
8. **Does NOT** claim the cold-load NFT baseline keys have been promoted into `baseline.json`.
9. **Does NOT** claim the editor production bundle has been scanned for `react` symbols at the bytecode level — only that `apps/editor/package.json` declares no react/react-dom dep.
10. **Does NOT** claim ARM64 multi-arch images have been built and published.

**What it DOES claim**: every D-day-actionable artefact required by
the §3 gate exists in-repo at S72 close; every operator-side gate is
named in §5 with a reversal trigger; the static GA-gate test under
`tests/ga-gate/` is green; the K3-F regression gate is NOT TRIPPED
at the most recent re-bench.

---

*Owner: Architecture lead. M36 GA gate sprint = S72. Phase doc §3
authority preserved; this report is the consolidation roll-up named
by §3 Documentation line 483 ("`apps/bench/reports/M36-GA.md`
published"). For the per-sprint S72 close detail, see
`apps/bench/reports/S72-m36-ga-launch-gate-2026-04-29.md`.*
