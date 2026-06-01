# ADR-0051 — S69 Largest-Fixture Bench Policy + DR-Drill Codification

**Status**: Accepted (sprint-scoped — S69, 2026-04-28)
**Sprint**: PRYZM 2 Phase 3D · S69 (Performance Hardening + DR Drill + Largest Fixture)
**Spec source**: `docs/03-execution/plans/legacy/phases/PHASE-3/3D-Q4-M34-M36-HARDENING-GA.md` §S69 lines 272-304.
**Companion docs**: `apps/bench/reports/M35-perf.md`, `docs/archive/pryzm3-internal/runbooks/DR-DRILL-RUNBOOK.md`, `docs/archive/pryzm3-internal/superseded-audits/PHASE-3D-S69-REGRESSION-HUNT-2026-04-28.md`, `docs/archive/pryzm3-internal/superseded-audits/PHASE-3D-S69-MEMORY-PROFILE-2026-04-28.md`.

---

## Context

S69 is the performance-hardening + DR-drill sprint of Phase 3D.  Three things had to land in tandem so the M36 GA cut has the artifacts it needs:

1. A **production-scale fixture** large enough to expose perf regressions that the medium (2,500-wall) and large (5,000-wall) fixtures don't catch.  The §6 NFT contract from `08-VISION.md` calls for **10,000 walls × 50 levels** as the largest-model gate.
2. A **bench harness** that exercises the fixture through the same parse-then-produce pipeline used by the loader, so future sprints can detect regressions automatically.
3. A **DR drill runbook** that codifies the four migration failure modes from `SPEC-27` §8 and folds in S69's RLS verification step + the S69 D5 memory-leak harness so the live-Postgres window is amortised.

The decisions below are sprint-scoped — they apply to the S69 close and the immediate S70 follow-on flip; they do not bind subsequent ADRs except where called out.

---

## Decisions

### A — WARN-only initial budgets for `largest-model.parse` and `largest-model.produce`

The two new bench entries land at WARN-only thresholds — `parse` warn @ 1,200 ms p95, `produce` warn @ 9,000 ms p95.  Both are 2× the corresponding 5K-fixture thresholds because the largest fixture is 2× the row count.  No `hardFail: true` flag at S69.

**Why WARN-only at S69**:
- Single-run baseline (this sprint) is not a stable enough signal to set a hard-fail bar.  A trailing-7-run baseline is the minimum statistical floor for a hard-fail gate per the bench-gating discipline established in S03.
- The Replit container is shared and noisy.  Setting a hard-fail bar from a single noisy run risks flapping CI for unrelated reasons.
- The §6 NFT exit-criterion language for the 10K-wall fixture is "every NFT target green" — the green/red signal is meaningful even without a hard-fail latch; flapping CI would actually obscure that signal.

**Reversal trigger**: at S70 D8 self-host-publish day (which provisions an isolated runner via the publish pipeline), capture 7 consecutive runs; flip both entries to `hardFail: true` with the warn=p95(median) and budget=p95(p99).  This is recorded in §C as the Decision-A reversal commitment.

### B — Largest fixture seed differs from the 5K fixture seed

`tools/generate-largest-fixture.mjs` uses LCG seed `0x69deadbe` while `tools/generate-large-fixture.mjs` uses `0x1d191d19`.  The two fixtures are independent — useful when both run in the same vitest process (a CI matrix, the dashboard renderer) so that any cross-fixture aliasing artifacts can't accidentally hide a regression.

Reversal trigger: none — fixture seeds are intentionally arbitrary.  Recorded for posterity.

### C — DR drill runbook folds RLS verification + heap-leak hunt into the same live-Postgres window

The DR runbook §6.5 invokes `pryzm-selfhost/init-db/03-rls-policies.test.sql` and §7 invokes `apps/bench/scripts/heap-leak-hunt.mjs` — both during the same drill window where Postgres is already provisioned for §3 (schema-migration drill).  This amortises the operator setup cost.

**Why fold these in**:
- RLS verification (S68 D5 carry-forward, scheduled S69 D6) needs a live Postgres; the DR drill provides one.
- The 4-hour memory-leak sim (S69 D5 spec target) needs a long-running session-driver harness; the DR drill window is the natural staging-time slot for it.
- Both add zero coupling cost — the SQL test file is standalone, the heap-leak script is a self-contained Node program.

**Reversal trigger**: if the drill window is cut short (under 30 min) the §7 heap-leak step must be split out into its own scheduled run.  §10 of the runbook captures this contingency.

### D — Bench-harness dep addition (`@pryzm/geometry-kernel` → `@pryzm/bench`)

Adding `@pryzm/geometry-kernel` as a workspace dependency of `@pryzm/bench` is **inside** the S67 ADR-0048 §B code-stability invariant boundary because it touches `apps/bench/package.json` only — not any of the four protected paths (`apps/{api-gateway,sync-server,bake-worker,editor}/src`).  This was previously implicit (other benches like `load-large.bench.ts` use the same import path); landing it explicitly fixes the pre-existing vitest resolution failure that prevented `load-large` / `load-medium` / `largest-model` from running.

Reversal trigger: none — this is a bug fix to an undeclared dependency edge.

### E — Tracker title swap for S69 ↔ S70

The pre-S69 PROCESS-TRACKER row 834 read `S69 | Browser matrix (Chrome/Firefox/Safari/Edge) + a11y` and row 835 read `S70 | Perf regression hunt (10K-wall fixture)`.  Both are wrong against the phase doc:
- §S69 (line 272) is "Performance Hardening + DR Drill + Largest Fixture".
- §S70 (line 308) is "Browser Matrix + WCAG + Self-Host Publish + PDF-to-BIM Preview + Lifecycle Deletion".

The S69 close swaps both rows back to the spec-authoritative titles.  This is documentation hygiene only; no functional impact.

Reversal trigger: none — the phase doc is the source of truth.

---

## Consequences

- Future sprints can compare against the new largest-model baseline entries in `apps/bench/baseline.json` via the existing `scripts/check-regression.mjs` flow — no new tooling required.
- The DR drill runbook is the canonical procedure for any of the four failure modes in `SPEC-27` §8; out-of-band hot-fixes that bypass it must be reconciled within one business day per §10.
- The S69 RLS migrations (`03-rls-policies.sql` + `03-rls-policies.test.sql`) close the S68 D5 carry-forward in the migration tree; live-Postgres verification still runs at S70 D8.
- The heap-leak harness gives every future Node-side bench a leak-detection floor; the 4 h Playwright session-driver remains the operator-side D5 deliverable for the GA drill.
- The bench-package dep addition unblocks the previously-failing `load-large` / `load-medium` / `largest-model` benches under vitest — an unintentional regression-detection blind spot is closed.

---

## Honesty notes (what this ADR does NOT ratify)

- It does **not** ratify hard-fail bench thresholds — those wait for the trailing-7-run baseline (Decision A reversal).
- It does **not** ratify a real production DR drill as having been executed — drill #0 is the runbook itself, drill #1 is S70 D8 (per the runbook §9 schedule).
- It does **not** ratify live-Postgres RLS verification — the SQL test file lands in the migration tree, but the actual `psql -f` execution against a Postgres daemon is the operator-side D6 deliverable per the runbook §6.5.
- It does **not** ratify a 4-hour staging session sim as having been run — the in-dev 200-cycle Node sim ran (leak=false, 0.22% growth); the 4 h Playwright-driven sim is the operator-side D5 deliverable per the runbook §7.
- It does **not** ratify any change to the four protected `apps/{api-gateway,sync-server,bake-worker,editor}/src` paths — the code-stability invariant from ADR-0048 §B is intact at S69 close.

---

## References

- `docs/03-execution/plans/legacy/phases/PHASE-3/3D-Q4-M34-M36-HARDENING-GA.md` §S69 lines 272-304 (sprint spec).
- `docs/03-execution/specs/SPEC-27-MIGRATION-ROLLBACK.md` §8, §9 (DR failure modes + cadence).
- `docs/04-reference/security/rls-audit-2026-Q4.md` §3.2 (RLS migration carry-forward from S68 D5).
- `docs/02-decisions/adrs/0048-s67-self-host-docker-compose.md` §B (code-stability invariant).
- `docs/02-decisions/adrs/0049-s67-multi-region-cut-decision.md` §F (WAL-archive PITR deferral).
- `08-VISION.md` §6 (NFT contract: "Largest model: 10,000 walls / 50 levels").
