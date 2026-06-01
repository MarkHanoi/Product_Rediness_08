# ADR-0053 — S71 Perf Regression Hunt + Largest-Fixture Hard-Fail Flip + K3-F Codification

**Status**: Accepted (sprint-scoped — S71, 2026-04-28)
**Sprint**: PRYZM 2 Phase 3D · S71 (Perf regression hunt — renumbered slot after S70 absorbed S69's browser-matrix charter; see `docs/03_PRYZM3/reference/status-detail/01-PROCESS-TRACKER.md` row 836 + ADR-0051 §E for the prior renumber bookkeeping)
**Spec source**: `docs/03_PRYZM3/reference/phases/PHASE-3/3D-Q4-M34-M36-HARDENING-GA.md` §S69 lines 272-304 (S69's never-executed perf-hardening daily plan; S71 inherits the spirit), `08-VISION.md` §6 (NFT contract), `docs/03_PRYZM3/reference/phases/PHASE-3/3-COMPLETION-GA-M25-M36.md` §K3-F (>10% regression on any NFT target halts forward 3D work)
**Companion docs**: `apps/bench/reports/S71-perf-regression-hunt-2026-04-28.md`, `docs/03_PRYZM3/archive/superseded-audits/PHASE-3D-S71-PERF-REGRESSION-HUNT-2026-04-28.md`

---

## Context

S71 is the renumbered perf-regression-hunt slot in Phase 3D. The phase doc itself never had an explicit S71 perf charter — phase-doc S71 is "Marketing Site + Docs Consolidation + Demo + Format Freeze". The renumber happened at S70 close because S70 absorbed S69's browser-matrix charter (per the S70 row in PROCESS-TRACKER), freeing S69's "Performance Hardening + DR Drill + Largest Fixture" charter (lines 272-304) to be reclaimed as the new S71 slot. The original phase-doc S71 (Marketing) moved to S71b. This ADR is the bookkeeping anchor for that re-allocation.

Three things had to land at S71:

1. **The warn→hardFail flip for `largest-model.{parse,produce}`** that ADR-0051 §A scheduled for "S70 D8 self-host-publish day (which provisions an isolated runner via the publish pipeline)". S70 D8 was a publish-prep dry run only (no isolated CI runner — see `pryzm-selfhost/scripts/publish-prep.sh` which prints the `docker compose build --push` command without executing because no ghcr.io credentials in dev env). The flip therefore deferred to S71. Decision A below records the flip rationale + threshold accounting given the dev-env noise floor.

2. **K3-F regression-gate codification.** K3-F is a master-plan halt-gate ("If at S69 (M35) regression > 10% on any NFT target, halt forward 3D work; root-cause + fix; re-bench" per `PHASE-3-COMPLETION-GA-M25-M36.md` line 575). Until S71 the gate existed only as prose — there was no machine-checkable enforcement. Decision B codifies it as a pure-vitest test reading `apps/bench/baseline.json` against an authoritative NFT-target list.

3. **NFT-target shape lock.** `08-VISION.md §6` declares 9 NFT contracts (cold-load small / medium / large; save edit; idle CPU; orbit fps; largest model; bake incremental; undo single) with named bench files (`apps/bench/load-small.ts` etc.). Several of these named files don't exist as exact paths (the actual benches are at `apps/bench/src/benches/load-small.bench.ts` etc.). Decision C codifies the canonical list in a new workspace package so any future drift between the NFT contract and the bench harness is caught by a vitest assertion rather than discovered at GA-cut time.

The decisions below are sprint-scoped — they apply to the S71 close and bind subsequent ADRs only via the named reversal triggers.

---

## Decisions

### A — Flip `largest-model.{parse,produce}` from WARN-only to `hardFail: true` at the existing budgets

The two S69 D3 baseline entries flip:

- `largest-model.parse`: `hardFail: true` added; `budgetMs: 1200` retained (~38× headroom over the S69 D3 measured p95 of 32.264 ms on the shared Replit container); `notes` field updated to reference S71 + this ADR.
- `largest-model.produce`: `hardFail: true` added; `budgetMs: 9000` retained (~56× headroom over the S69 D3 measured p95 of 159.488 ms); `notes` field updated.

**Why hard-fail at S71 despite no isolated CI runner**:
- The 38× / 56× headroom is so large that even a 10× regression (catastrophic, would obviously be a real bug) leaves the bench inside budget. The hardFail gate at the existing budgetMs is a *catastrophic-regression detector*, not a precision tuning gate.
- ADR-0051 §A's "stable trailing-7-run baseline before flipping" rationale was written under the assumption the budget would be tightened at flip-time. We are *not* tightening — we are flipping the existing wide budget to hard-fail. The flapping risk is therefore zero: a measured p95 of 32 ms cannot accidentally cross 1200 ms due to noise, only due to a real regression.
- Precision tuning of the budget (warn at p95(median-of-7) + budget at p95(p99-of-7) per ADR-0051 §A's reversal contract) remains an operator-side responsibility once an isolated CI runner exists — recorded as the Decision-A reversal trigger below.

**Reversal trigger**: when an isolated CI runner is provisioned (operator-side via `.github/workflows/browser-matrix.yml` extension or equivalent), capture 7 consecutive runs and tighten budgetMs from the current 38×/56×-headroom values to the ADR-0051 §A formula (warn = p95-of-medians, budget = p95-of-p99s). The hardFail flag stays on; only the budget tightens.

### B — K3-F regression-gate as a pure-vitest test reading `apps/bench/baseline.json`

A new test file at `apps/bench/__tests__/k3f-regression-gate.test.ts` reads `apps/bench/baseline.json` and the NFT-target list from `@pryzm/perf-budgets` (Decision C). For each NFT-required bench name:

- Assert the baseline entry exists.
- Assert the baseline entry's `p95` ≤ `budgetMs` (the existing per-entry hard-fail threshold).
- Assert the baseline entry has either `hardFail: true` *or* a `notes` field documenting why the entry is still warn-only (with a tracker pointer to the sprint that owns the flip).
- Skip with explicit reason for any NFT row whose bench is not yet in baseline (recorded in §E coverage gap inventory).

The test is a *static* gate — it asserts the baseline file's recorded numbers + flags, not live measured numbers. The dynamic side (current p95 vs prior p95 ≥ 10% slip = halt) is the responsibility of `apps/bench/scripts/check-regression.mjs` invoked via `pnpm bench:check` after a fresh `.run-output/` is produced.

**Why static, not dynamic, in vitest**:
- Vitest tests must be deterministic; running benches inside vitest assertions would re-introduce the noise-floor flapping K3-F itself was designed to expose.
- The bench `.run-output/` files are themselves the intermediate artifacts; the regression check is the consumer of them. Vitest covers the contract (every NFT row has a baseline + a hard-fail flag); the check-regression script covers the runtime gate.

**Reversal trigger**: if a future sprint introduces a dynamic vitest harness that runs benches in-process (not currently planned per the bench-package vitest config which uses `testTimeout: 60_000` precisely because benches are excluded from the assertion path), this static gate can be folded in. Until then the static-vs-dynamic split stays.

### C — `@pryzm/perf-budgets` workspace package as the canonical NFT-target list

A new workspace package at `packages/perf-budgets/` exports `NFT_TARGETS: readonly NftTarget[]` with one row per `08-VISION.md §6` table row. Each row carries:

- `id` — stable kebab-case identifier (e.g. `cold-load-large`, `largest-model`, `idle-cpu`).
- `displayName` — human-readable label matching the §6 table row.
- `pryzm1Baseline` — string (the §6 baseline column; some rows are "OOM / browser hang" or "n/a" and are kept as strings for fidelity).
- `pryzm2Target` — string (the §6 target column; e.g. "< 800 ms", "> 55 fps p95").
- `benchFile` — string repository-relative path (e.g. `apps/bench/src/benches/load-small.bench.ts`); the §6 table cites legacy paths like `apps/bench/load-small.ts` which this package corrects to actual paths.
- `baselineKey` — string key under `apps/bench/baseline.json::benches` (e.g. `largest-model.parse`); some rows map to multiple keys (`cold-load-large` covers both `load-large.parse` and `load-large.produce`); kept as `string | readonly string[]`.

A vitest test at `packages/perf-budgets/__tests__/nft-targets.test.ts` asserts every row has the 6 fields, every `benchFile` actually exists in the repo, and the file is non-empty.

**Why a separate package, not a constant inside `@pryzm/bench`**:
- `@pryzm/bench` is a Node-only package consuming workspace deps (`@pryzm/geometry-kernel`, `@pryzm/protocol`, etc.). The NFT-target list has zero runtime deps and should be importable from any context including future docs-site rendering, K3-F dashboards, and CI scripts. A standalone package keeps the dep graph clean.
- `@pryzm/bench` is private (per its package.json `"private": true`); `@pryzm/perf-budgets` is also private but the boundary is a forcing function for keeping the NFT-target list stable when bench harness internals churn.

**Reversal trigger**: if `08-VISION.md §6` is ever amended (currently anchored to the §6 lines 104-119 table from the 2026-04-26 freeze), update `NFT_TARGETS` in lockstep and bump the package patch version. The vitest assertion in this package is the catch-net.

### D — Heap-leak-hunt 200-cycle synthetic run as the actionable D5 deliverable

`apps/bench/scripts/heap-leak-hunt.mjs` (already shipped at S69 D5 per ADR-0051 §C) runs in-dev with `node --expose-gc apps/bench/scripts/heap-leak-hunt.mjs` (default 200 cycles, ~30 s on Replit container). The output `.run-output/heap-leak-hunt.json` is the actionable D5 deliverable for S71 — `leak: false` indicates no monotonic growth over the trailing window.

**What this DOES NOT close**: the literal 4-hour Playwright-driven session sim called for by the phase-doc S69 D5 line 291 ("memory profile + leak hunt over 4-hour session simulation"). That requires a long-running staging environment and a Playwright session driver — neither in dev. Per ADR-0051 §C the 4-h sim is folded into the DR-drill operator-side runbook §7. S71 closes the *Node-side synthetic* harness only; the *browser-side 4-h drift* check carries forward to operator-side per the runbook.

**Reversal trigger**: when an operator runs the 4-h staging sim, append the `.run-output/heap-leak-hunt-4h.json` to `apps/bench/reports/S71-perf-regression-hunt-2026-04-28.md` §4 and flip the §6 deferred row to landed.

### E — Bench coverage gap inventory (NFT-row → bench-file map)

Of the 9 NFT rows in `08-VISION.md §6`:

| NFT row | `benchFile` (actual) | `baselineKey` (in `apps/bench/baseline.json`) | Status at S71 close |
|---|---|---|---|
| Cold load — small | `apps/bench/src/benches/load-small.bench.ts` | (none promoted) | **partial** — bench file exists since S19 D3; no `baseline.json` entry yet. Mechanical promotion (`pnpm bench` → `pnpm bench:baseline`) per Decision E reversal trigger. |
| Cold load — medium | `apps/bench/src/benches/load-medium.bench.ts` | (none promoted) | **partial** — same as cold-load-small; bench file exists since S19 D4. |
| Cold load — large | `apps/bench/src/benches/load-large.bench.ts` | (none promoted) | **partial** — bench file exists since S19 D5 + tier-streamed loader since S23 D9; no baseline entry. The first-interactive + full-load measurements additionally need an isolated CI runner per Decision A reversal trigger. |
| Save (single wall edit) | `apps/bench/src/benches/save-edit.bench.ts` | `persistence.save-edit.append.idb` + `persistence.save-edit.append.memory` | **landed** (S04 D5) |
| Idle CPU (camera still) | `apps/bench/src/benches/idle-cpu.bench.ts` | `frame-scheduler.idle-cpu` | **landed** (S03 D5) |
| Interactive frame rate (orbit) | `apps/bench/src/benches/orbit-fps-walls.bench.ts` + `orbit-fps-cw.bench.ts` | (none promoted; real fps requires browser) | **partial** — Node bench file exists (geometry-side cost); no baseline entry promoted; real fps gate is `apps/editor` Playwright-side (S70 browser matrix CI; 4h sim D5 carry-forward). |
| Largest model (10K × 50) | `apps/bench/src/benches/largest-model.bench.ts` | `largest-model.parse` + `largest-model.produce` | **landed** (S69 D3) — flipped to hardFail at S71 per Decision A |
| Server bake — incremental | `apps/bench/src/benches/bake-incremental.bench.ts` | `bake.incremental.single-wall-edit` | **landed** (S08 D6) |
| Undo single wall edit | (no dedicated bench file; `cmd-execute-latency.bench.ts` exercises the closest path) | `command-bus.execute.move-cube` (proxy) | **gap** — no dedicated `undo-single.bench.ts`; carried forward as a known coverage gap; documented in §6 of the S71 sprint report. |

**4 of 9 rows have full landed coverage** (`save-edit`, `idle-cpu`, `largest-model`, `bake-incremental`). **4 of 9 are partial** — bench files exist but no `baseline.json` entry promoted (`cold-load-small`, `cold-load-medium`, `cold-load-large`, `orbit-fps`). **1 of 9 is a known gap** (`undo-single` — proxy-bench coverage only).

This honest gap inventory is what the original S69 D5 charter was meant to surface; S71 surfaces it explicitly via the `@pryzm/perf-budgets` package + the `K3-F` static-contract test instead of letting it remain implicit in the file-vs-baseline drift.

**Reversal trigger**: each `partial` row's bench can be promoted to `landed` by running the bench (`cd apps/bench && pnpm bench src/benches/load-small.bench.ts`) then `pnpm bench:baseline` to write the resulting `.run-output/*.json` into `baseline.json`. Update `NFT_TARGETS` row's `s71Status` to `landed` in lockstep — the `nft-targets.test.ts` crosscheck assertion is the catch-net. The `undo-single` gap closes when a dedicated `undo-single.bench.ts` lands.

### F — DR-drill execution carry-forward (operator-side)

ADR-0051 §C honesty notes record that drill #0 was the runbook itself and drill #1 was scheduled S70 D8. S70 D8 was the publish-prep dry run — no DR drill executed. The DR drill #1 (per `docs/03_PRYZM3/runbooks/DR-DRILL-RUNBOOK.md` §9 schedule) carries forward to operator-side. S71 does not change the schedule; it records the carry-forward to keep the bookkeeping honest.

**Reversal trigger**: when the operator runs DR drill #1 against staging Postgres, the runbook §10 contingency log gets a sign-off entry and this ADR's §F line flips to landed.

---

## Consequences

- `apps/bench/baseline.json` now has 2 entries with `hardFail: true` (was 0). Future bench runs that exceed `budgetMs` for either entry will fail CI via `apps/bench/scripts/check-regression.mjs` — providing the catastrophic-regression detector that K3-F mandates.
- `@pryzm/perf-budgets` is the single source of truth for the NFT-target → bench-file → baseline-key map. Any future drift between `08-VISION.md §6` and the bench harness layout fails `packages/perf-budgets/__tests__/nft-targets.test.ts` immediately.
- `apps/bench/__tests__/k3f-regression-gate.test.ts` provides a vitest-runnable contract over the baseline file — a CI green there is *necessary but not sufficient* for K3-F (the `pnpm bench:check` runtime gate is the second half).
- The Node-side heap-leak-hunt is the closure artifact for the synthetic D5 deliverable; the 4-h browser-side sim remains operator-side per ADR-0051 §C.
- The DR drill #1 carry-forward is preserved (operator-side); GA exit per `PHASE-3D-Q4-M34-M36-HARDENING-GA.md` §3 still requires DR drill green.

---

## Honesty notes (what this ADR does NOT ratify)

- It does **not** ratify trailing-7-run baseline-derived budget tightening — that remains the Decision-A reversal trigger pending an isolated CI runner.
- It does **not** ratify the literal 4-hour Playwright session-driven memory-leak sim — that remains the Decision-D reversal trigger (operator-side).
- It does **not** ratify a real production DR drill as having been executed — drill #1 carries forward to operator-side per Decision F.
- It does **not** ratify orbit-fps real-browser numbers — Node-side `orbit-fps-walls.bench.ts` and `orbit-fps-cw.bench.ts` cover the geometry-side cost; the GPU-side fps gate is the operator-side browser-matrix CI per S70 ADR-0052 §A.
- It does **not** ratify any change to the four protected `apps/{api-gateway, sync-server, bake-worker, editor}/src` paths — the code-stability invariant from ADR-0048 §B is intact at S71 close.
- It does **not** ratify the dedicated `undo-single.bench.ts` — the existing `cmd-execute-latency.bench.ts` is judged sufficient for catastrophic-regression detection on the hot path; a dedicated bench is a future-sprint sweetener.

---

## References

- `docs/03_PRYZM3/reference/phases/PHASE-3/3D-Q4-M34-M36-HARDENING-GA.md` §S69 lines 272-304 (the perf charter S71 inherits).
- `docs/03_PRYZM3/reference/phases/PHASE-3/3-COMPLETION-GA-M25-M36.md` §K3-F line 575 (10% NFT-regression halt-gate).
- `08-VISION.md` §6 lines 104-119 (NFT contract — single source of truth for the 9 targets).
- `docs/architecture/adr/0051-s69-largest-fixture-bench-policy.md` §A + §C (warn-only landing + reversal contract S71 fulfils).
- `docs/architecture/adr/0052-s70-browser-matrix-wcag-selfhost-publish-pdf-preview-lifecycle-deletion.md` §C (publish-prep dry-run rationale that left S70 D8 without an isolated CI runner).
- `docs/architecture/adr/0048-s67-self-host-docker-compose.md` §B (code-stability invariant preserved at S71 close).
- `docs/03_PRYZM3/runbooks/DR-DRILL-RUNBOOK.md` §7 + §9 + §10 (4-h leak sim + drill schedule + contingency log — operator-side).
