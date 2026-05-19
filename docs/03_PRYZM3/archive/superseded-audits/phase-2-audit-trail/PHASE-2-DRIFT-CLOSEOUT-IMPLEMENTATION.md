# Phase 2 Drift Closeout — Specific Implementation Required

**Audit reference:** Phase 2 audit (this session) — drift items identified vs `docs/00_NEW_ARCHITECTURE/phases/PHASE-2A…2D` and the existing audit notes under `docs/00_NEW_ARCHITECTURE/audits/PHASE-2*-AUDIT-2026-04-28.md`.
**Status:** Phase 2 (Migration / Multi-User / Beta) is otherwise complete; this document specifies the exact work required to close the remaining gaps and lock the M24 beta gate in writing.
**Scope:** Code, ADRs, tests, CI gates, workflows. No doc-to-doc rewrites.

---

## Item summary

| # | Phase | Item | Effort | Severity |
|---|---|---|---|---|
| 1 | 2B | `ViewSyncBus` is a skeleton — wire into canvas hosts | ~6–8 h | Medium |
| 2 | 2B | Visual diff still on stream-equivalence — promote to PNG diff | ~4–6 h | Medium |
| 3 | 2B | ADR-0036 covers Visibility-Intent waves 1–5; w06–w11 also shipped, but unratified | ~30 min | Low (doc) |
| 4 | 2C | Schedule formula DSL ships 12 of 24 planned functions | ~3–4 h **or** scope-cut ADR | Medium |
| 5 | 2C | `apps/cli` has no `schedule-export` subcommand | ~2 h **or** scope-cut ADR | Low |
| 6 | 2C | Spec references export-worker ADR-026; code & runbook reference ADR-039 | ~15 min (doc cross-ref) | Low |
| 7 | 2D | `audit-log-middleware` workflow fails at startup (vitest not resolved) | ~30 min | Low |
| 8 | 2D | Add explicit M24 beta gate closure block to release runbook (parity with Item 1D-3) | ~1 h | Low |

Total engineering effort: **~17–22 h** (or ~6 h if scope cuts are taken on Items 4 & 5 via ADR).

---

## Item 1 — ViewSyncBus is a skeleton (Phase 2B / ADR-0030)

### Observation
- `packages/view-state/src/view-sync.ts` exists (81 lines) and the file header explicitly says:

  > `SCOPE (skeleton; full feature S46)` … "the actual transport into the renderer (camera move, selection paint) is plumbing that lives in each canvas host and is wired in S46 D2."

- The PRYZM 2 canvas hosts (`apps/editor/src/host3d/*`, `plugins/plan-view/src/CanvasHost.ts`, `plugins/section-view/src/SectionViewCanvasHost.ts`, `plugins/sheets/src/sheet-editor-host.ts`) do **not** subscribe to the bus or publish to it.
- Three sync topics are typed but unused: `selection`, `viewport`, `cut-plane`.

### Decision
**Land S46 D2: wire the three topics through the four canvas hosts. Keep the bus pure.**

### Required changes

#### 1.1 — Wire each canvas host

| Host | Publish | Subscribe | New behaviour |
|---|---|---|---|
| `apps/editor/src/host3d/Host3DController.ts` (3D) | `selection`, `viewport` (camera target + distance only), `cut-plane` (when section box edited) | `selection`, `viewport` (lockstep when source view marked `linked`) | Standard 3D orbit broadcasts to plan/section. |
| `plugins/plan-view/src/CanvasHost.ts` | `selection`, `viewport`, `cut-plane` (level switch) | `selection`, `cut-plane` (re-render when the active section box moves) | Plan camera does NOT auto-follow the 3D camera (per ADR-0030 §3) — viewport sync is opt-in via the linked-view chip. |
| `plugins/section-view/src/SectionViewCanvasHost.ts` | `selection`, `cut-plane` (cut-plane drag) | `selection`, `cut-plane` | Section view re-renders when the cut plane moves from any source. |
| `plugins/sheets/src/sheet-editor-host.ts` | `selection` (widget click) | `selection` (highlight in linked viewport widget) | Sheet selection cross-highlights the underlying viewport's source view. |

For each host: add a constructor injection of `ViewSyncBus`, register `subscribe()` in the mount path, call `publish()` from the existing event emitters. Unsubscribe on dispose. The bus is pure — no rendering work moves into it.

#### 1.2 — Add a `linked-views` flag store
**File:** `packages/stores/src/LinkedViewsStore.ts` (new, ~60 lines)

State shape: `Set<string>` of view IDs that opt into `viewport` sync. Two handlers in `plugins/view/src/handlers/`:
- `LinkView` / `UnlinkView` (store keys: `linkedViews`).

Update the new `bootstrap.data.ts` wiring in `apps/editor/src/` to register the store.

#### 1.3 — Latency contract test
**File:** `packages/view-state/__tests__/view-sync.latency.test.ts` (new)

Assert that `publish → subscribe` round-trip of all three topics is **< 1 ms** in Node, and add a JSDOM benchmark in `apps/bench/src/benches/view-sync.bench.ts` that asserts **p95 < 16 ms** under a synthetic workload of 60 publishes/sec across 4 subscribers (the 16 ms budget mirrors the doc target).

#### 1.4 — Update ADR-0030
Mark §"Multi-View Sync" as **Closed (S46 D2 landed)** with date, and link to the new wiring paths above.

#### 1.5 — Acceptance
- `pnpm --filter @pryzm/view-state test` includes and passes the new latency test.
- `pnpm --filter @pryzm/bench test view-sync` exits 0 with p95 < 16 ms.
- Manual smoke in the editor: selecting a wall in 3D highlights the same wall in plan; dragging the section box in plan re-renders the section view; sheet widget selection cross-highlights its viewport.
- ADR-0030 §"Multi-View Sync" carries the closure note.

**Owner:** Phase 2B steward. **Effort:** ~6–8 h.

---

## Item 2 — Visual diff PNG promotion (Phase 2B / ADR-0030 §"Visual Diff Tooling")

### Observation
- `tests/visual-diff/3d/` has 22 spec files (front + iso for 11 elements: wall, door, window, floor, roof, column, beam, ceiling, stair, railing, ramp, curtain-wall) using a **stream-equivalence** harness (`harness.ts`), not pixel diff.
- `tests/visual-diff/plan-view/` has the equivalent stream-equivalence harness for plan view.
- ADR-0030 §"Visual Diff Tooling" deferred PNG promotion to **S37 D5**. S37 has shipped per `apps/bench/reports/M21-2C.md`, so the deferral is now overdue.

### Decision
**Promote both 3D and plan-view harnesses to PNG diff with a 2-pixel tolerance per ADR-0030.**

### Required changes

#### 2.1 — Add a deterministic-renderer harness
**File:** `tests/visual-diff/_lib/png-harness.ts` (new, ~120 lines)

- Uses Playwright's `chromium.launch({ args: ['--use-gl=swiftshader'] })` for deterministic software rasterisation.
- Loads the editor with `?pryzm2=1&visualdiff=1&fixture=<id>` and waits for the IdleAccumulator's `converged` event before snapshot.
- Returns a `Buffer` of the PNG.

The `?visualdiff=1` flag is added to the existing kill-switch registry in `packages/feature-flags/src/index.ts` as a non-K2B flag (default OFF) that disables animations and pins TRAA/SSGI sample counts.

#### 2.2 — Promote each spec
For every spec under `tests/visual-diff/{3d,plan-view}/`:

```ts
import { renderToPng, comparePng } from '../_lib/png-harness';

const actual   = await renderToPng({ fixture: 'wall-front', view: '3d' });
const expected = await fs.readFile(`${__dirname}/__golden__/wall-front.png`);
const diff     = await comparePng(actual, expected, { thresholdPixels: 2 });
expect(diff.diffPixels).toBeLessThanOrEqual(2);
```

Keep the existing stream-equivalence asserts as a **second** layer (it catches structural diffs that pixel diffs miss). Both must pass.

#### 2.3 — Generate baselines
Run `pnpm test --update-golden` (a new flag wired in `tests/visual-diff/_lib/png-harness.ts`) once per host (CI ubuntu-latest) and commit the PNGs under `tests/visual-diff/{3d,plan-view}/__golden__/`. Use `pngquant` to keep PNGs small (≤ 50 KB each).

#### 2.4 — CI gate
**File:** `.github/workflows/ci.yml`

Add a `visual-diff` job that runs the two suites with the swiftshader sandbox. Cache the Playwright browser binaries.

#### 2.5 — Acceptance
- `pnpm --filter @pryzm/test-visual-diff test` exits 0.
- `tests/visual-diff/{3d,plan-view}/__golden__/` contains a PNG per spec.
- Diff threshold is set at **2 pixels** per ADR-0030.
- ADR-0030 §"Visual Diff Tooling" marked **Closed (S37 D5 landed)** with date.

**Owner:** Phase 2B steward. **Effort:** ~4–6 h (most of the time is golden-image generation + CI cache tuning).

---

## Item 3 — Visibility-Intent waves 6–11 ratification (Phase 2B / ADR-0036)

### Observation
- ADR `docs/architecture/adr/0036-visibility-intent-waves-1-5.md` formalises **only** waves 1–5.
- Code under `packages/visibility/src/waves/` ships **all 11 waves** already:
  ```
  w01-level-scope, w02-category-visibility, w03-view-template-inheritance,
  w04-wall-end-joins, w05-opening-culling, w06-filter-overrides,
  w07-phase-filter, w08-temporary-isolation, w09-element-hide,
  w10-design-option, w11-ghost-layer
  ```
- This is a documentation gap, not a code gap.

### Decision
**Ratify the additional 6 waves with a follow-on ADR (no code change).**

### Required changes

#### 3.1 — Author ADR-0041
**File:** `docs/architecture/adr/0041-visibility-intent-waves-6-11.md` (new)

Sections:
- **Status:** Accepted, 2026-04-28.
- **Context:** waves 6–11 shipped during S37–S46 ahead of formal ratification; this ADR closes the gap.
- **Decision:** the 6 wave reducers (w06-filter-overrides, w07-phase-filter, w08-temporary-isolation, w09-element-hide, w10-design-option, w11-ghost-layer) are part of the canonical pipeline, in this order, after waves 1–5.
- **Consequences:** any new wave must follow the contract in `packages/visibility/src/waves/types.ts` and be appended to `packages/visibility/src/waves/index.ts` in deterministic order.
- **Cross-ref:** ADR-0015 (visibility intent placement), ADR-0036 (waves 1–5).

#### 3.2 — Cross-link
**File:** `docs/architecture/adr/0036-visibility-intent-waves-1-5.md`

Add a footer line:
> Waves 6–11 ratified by `0041-visibility-intent-waves-6-11.md` (2026-04-28).

#### 3.3 — Acceptance
- ADR-0041 exists.
- `node scripts/check-adr-code-drift.mjs` (extended in Item 1.2 of the Phase 1 closeout) asserts that every file in `packages/visibility/src/waves/` has a corresponding entry in either ADR-0036 or ADR-0041.

**Owner:** Phase 2B steward. **Effort:** ~30 min (writing) + ~20 min (script extension).

---

## Item 4 — Schedule formula DSL completeness (Phase 2C / ADR-0032)

### Observation
- `plugins/schedules/src/formula-evaluator.ts` implements **12** functions: `COUNT, SUM, AVG, MIN, MAX, IF, ROUND, CONCAT, LEN, UPPER, LOWER, COALESCE`.
- Phase 2C (S41 + S43) and ADR-0032 collectively scoped **24** functions for the DSL v1.
- The 12 missing fall into three buckets:

| Bucket | Functions | Rationale |
|---|---|---|
| Math | `ABS, FLOOR, CEIL, MOD, POWER, SQRT` | Trivial arithmetic; high user demand for area/volume rounding. |
| Stats | `MEDIAN, STDEV` | Common in cost / occupancy schedules. |
| Logic / String / Date | `AND, OR, NOT, FORMAT_DATE` | Required for filter expressions and revision schedules. |

### Decision
**Implement the 12 missing functions. They are all pure and ≤ 30 lines each — net cheaper than writing a deferral ADR.**

### Required changes

#### 4.1 — Extend the evaluator
**File:** `plugins/schedules/src/formula-evaluator.ts`

In `evalCall(name, args, ctx)`, add 12 new `case` blocks following the existing pattern:

| Function | Signature | Notes |
|---|---|---|
| `ABS(x)` | `number → number` | Returns `null` on non-numeric. |
| `FLOOR(x [, decimals])` | `number [, number] → number` | Decimals default 0. |
| `CEIL(x [, decimals])` | same as FLOOR | |
| `MOD(x, y)` | `number, number → number` | Returns `null` if `y === 0`. |
| `POWER(x, y)` | `number, number → number` | Bound `y` to ≤ 100 to prevent runaway. |
| `SQRT(x)` | `number → number` | Returns `null` on negative `x`. |
| `MEDIAN(...args)` | `…(number\|range) → number` | Mirrors `AVG` aggregation contract. |
| `STDEV(...args)` | same | Population stdev (divide by N, not N-1) for spreadsheet parity. |
| `AND(...args)` | `…boolean → boolean` | Short-circuit on first `false`. |
| `OR(...args)` | `…boolean → boolean` | Short-circuit on first `true`. |
| `NOT(x)` | `boolean → boolean` | |
| `FORMAT_DATE(epochMs, pattern)` | `number, string → string` | Supports `YYYY-MM-DD`, `YYYY-MM-DD HH:mm`, `dd/MM/YYYY` only — keeps the DSL deterministic. |

#### 4.2 — Update ADR-0032
**File:** `docs/architecture/adr/0032-schedule-formula-dsl.md`

Add a "Function Catalogue" section listing all 24 functions with their signatures. Mark each as **v1**. Keep `MATCH`, `LOOKUP`, `UNIT_CONVERT`, `NOW` explicitly **out of v1** (vendor-coupled or non-deterministic; revisit in Phase 4).

#### 4.3 — Tests
**File:** `plugins/schedules/__tests__/formula-evaluator.test.ts` (extend if exists, else create)

One `describe` block per new function with at least:
- Happy path.
- Type-coercion failure path (returns `null`, not throws).
- Boundary case (e.g., `SQRT(-1) === null`, `MOD(x, 0) === null`).

#### 4.4 — CI gate
**File:** `scripts/check-adr-code-drift.mjs`

Add an assertion that every function name in ADR-0032's catalogue has a matching `case` in `formula-evaluator.ts`'s `evalCall`. Drift exits 1.

#### 4.5 — Acceptance
- `pnpm --filter @pryzm/plugin-schedules test` exits 0 with all 24 functions covered.
- `node scripts/check-adr-code-drift.mjs` exits 0.
- ADR-0032 catalogue lists all 24.

**Owner:** Phase 2C steward. **Effort:** ~3–4 h.

---

## Item 5 — `apps/cli` schedule export (Phase 2C / ADR-0040)

### Observation
- `apps/cli/src/index.ts` only ships `pack`, `unpack`, `inspect` for the `.pryzm` v1 file format.
- ADR-0040 (export-format catalogue) lists CSV / XLSX / PDF as the schedule export targets, and Phase 2C §S42 calls for headless invocation through the CLI for CI-driven schedule audits.
- The export code itself exists in `plugins/schedules/src/export/{csv,xlsx,pdf}.ts`, so this is purely a CLI surface gap.

### Decision
**Add `schedule-export` to the CLI. Re-use the plugin's exporters; do not duplicate logic.**

### Required changes

#### 5.1 — Extend the CLI
**File:** `apps/cli/src/index.ts`

Add a new subcommand:

```
pryzm-cli schedule-export <input.pryzm> <scheduleId> <output.{csv|xlsx|pdf}>
```

Implementation outline:
1. `unpack(input)` to a temp dir.
2. Replay events to rebuild the `SchedulesStore` (re-use the headless pattern from `apps/headless/src/index.ts`).
3. Look up the schedule by `scheduleId`; exit 1 with a friendly message if not found.
4. Switch on the output extension and call the matching exporter from `@pryzm/plugin-schedules/export`.
5. Exit 0 on success.

Add the exporters to `plugins/schedules/package.json` `exports` map under `./export/{csv,xlsx,pdf}`.

#### 5.2 — End-to-end test
**File:** `apps/cli/__tests__/schedule-export.test.ts` (new)

Uses the existing `tests/fixtures/` `.pryzm` files (or generates one inline via `apps/headless`) and asserts:
- CSV output has expected column count.
- XLSX output is a valid ZIP and the first sheet is named after the schedule.
- PDF output starts with `%PDF-1.`.

#### 5.3 — Update Phase 2C bench evidence
**File:** `apps/bench/reports/M21-2C.md`

Add a "CLI export" row to the gates table once the test runs in CI.

#### 5.4 — Acceptance
- `npx pryzm-cli schedule-export sample.pryzm sched-1 out.csv` writes a valid CSV.
- `pnpm --filter @pryzm/cli test` passes the new e2e.
- `apps/bench/reports/M21-2C.md` records the CLI export gate.

**Owner:** Phase 2C steward. **Effort:** ~2 h.

---

## Item 6 — Export-worker ADR cross-reference (Phase 2C / docs only)

### Observation
- Phase 2C spec references **ADR-026** for the export-worker architecture.
- The actual ADR in code is **ADR-039** (`docs/architecture/adr/0039-export-worker-architecture.md`), which decided to defer the standalone server-side worker and instead consolidate into in-browser orchestration plus the bake worker for heavy jobs.
- ADR-026 in the strategic series (`docs/00_NEW_ARCHITECTURE/adrs/`) is a different ADR (ui-binding-vanilla-ts).

### Decision
**Add an explicit cross-reference note to both files; do not renumber.**

### Required changes

#### 6.1 — Patch the spec
**File:** `docs/00_NEW_ARCHITECTURE/phases/PHASE-2C-Q3-M19-M21-SHEETS-SCHEDULES.md`

Find the two references to "ADR-026" in the export-worker context and replace with:
> ADR-039 (`docs/architecture/adr/0039-export-worker-architecture.md`). The original strategic spike was ADR-026; the code-level decision was renumbered when the worker scope was reduced.

#### 6.2 — Patch ADR-039
**File:** `docs/architecture/adr/0039-export-worker-architecture.md`

Add a top-of-file note:
> Supersedes the original "ADR-026 export-worker" spike; renumbered when the standalone worker scope was deferred.

#### 6.3 — Acceptance
- No more grep-hits for "ADR-026" in the export-worker context.
- ADR-039 carries the supersession note.

**Owner:** Phase 2C steward. **Effort:** ~15 min.

---

## Item 7 — `audit-log-middleware` workflow startup failure (Phase 2D)

### Observation
- The workflow `audit-log-middleware` runs `cd tests/audit-log-s57 && npx vitest run --reporter=default`.
- It fails on first run because `npx` triggers an interactive download prompt (`Need to install the following packages: vitest@4.1.5 — Ok to proceed? (y)`) — pnpm has installed `vitest@2.1.9` to the workspace, but `npx` resolves the registry-latest binary instead of the local one.
- `tests/audit-log-s57/package.json` is a workspace member with `vitest@2.1.9` as a devDependency.
- Test code is present (`auditLogMiddleware.test.js`, `vitest.config.ts`).

### Decision
**Switch the workflow to use the workspace-pinned binary via `pnpm --filter`.**

### Required changes

#### 7.1 — Update the workflow command

The workflow named `audit-log-middleware` should run:

```
pnpm --filter @pryzm/test-audit-log-s57 test
```

(The `package.json` already has `"test": "vitest run"`, and `pnpm --filter` resolves the workspace's pinned vitest@2.1.9.)

If the workflow file is configured by the platform UI rather than checked in, this is a single edit there. If it is committed (search via `rg "audit-log-middleware" .` to locate), update the YAML / `.replit` block accordingly.

#### 7.2 — Verify the same fix is not needed elsewhere
Run `rg "cd .*&& npx vitest"` across the repo. Any other workflow using the same anti-pattern (currently every test workflow in the project — `bcf-round-trip`, `constraint-solver-snapshot`, `family-editor-quality-gates`, `ifc-export-tier1`, `ifc-import-tier2`, `ifc-inspector-pset-editor`, `pdf-classification-accuracy`, `pdf-stage3-pure`, `pryzm-persistence`, `pryzm-vi-parity`, `rhino-import-3dm`) should be migrated to `pnpm --filter <pkg> test` for the same reason. They are currently hanging on the same interactive `npx` prompt.

#### 7.3 — Acceptance
- All test workflows reach a terminal state (PASS or FAIL with real test output) within their normal runtime budget.
- No "Need to install the following packages" prompt in the workflow logs.

**Owner:** Phase 2D steward (also covers the other 10 hanging test workflows). **Effort:** ~30 min for all 11 workflows.

---

## Item 8 — M24 Beta gate closure block (Phase 2D)

### Observation
- `apps/bench/reports/M24-beta.md` records the cut-list and bench-gate evidence.
- The release runbook `editor/tooling/release/release.sh` does **not** have an explicit beta-gate stanza equivalent to the alpha-gate stanza specified in the Phase 1 closeout doc (Item 1D-3).
- Phase 2D requires multi-region sync verification, awareness throttle verification, and audit-log evidence to be checkpointed before tagging beta — none of these are gated by machine today.

### Decision
**Add a `beta` track to the release runbook with explicit checks, mirroring the alpha-gate pattern from Phase 1D Item 3.**

### Required changes

#### 8.1 — Extend the release runbook
**File:** `editor/tooling/release/release.sh`

Append (after the alpha block proposed in the Phase 1 closeout):

```sh
if [ "${RELEASE_TRACK:-}" = "beta" ]; then
  cat <<'EOF'
=========================================================================
  M24 BETA GATE — non-code prerequisites (operator confirms with --confirm-beta):
    [ ] Multi-region sync smoke test passed in last 24h
        (scripts/check-sync-multiregion.mjs)
    [ ] Awareness bandwidth p95 < 5 KB/s/peer
        (apps/bench/reports/M24-beta.md row "awareness-bandwidth")
    [ ] Audit-log middleware test green
        (pnpm --filter @pryzm/test-audit-log-s57 test)
    [ ] Bench report apps/bench/reports/M24-beta.md is GREEN
=========================================================================
EOF
  if [ "${1:-}" != "--confirm-beta" ]; then
    echo "[release] Re-run with --confirm-beta after the checklist is complete."
    exit 2
  fi
fi
```

#### 8.2 — Add the multi-region smoke
**File:** `scripts/check-sync-multiregion.mjs` (new, ~80 lines)

- Spins up the sync server fixture against two pretend regions (env vars `SYNC_REGION_A_URL`, `SYNC_REGION_B_URL`).
- Sends 50 random commands through region A, observes them on region B's awareness stream within 2 s, and asserts convergence.
- Exits 0 / 1.

Wire into `editor/tooling/release/release.sh` behind `--confirm-beta`.

#### 8.3 — Update the bench report
**File:** `apps/bench/reports/M24-beta.md`

Add a "Gate Closure Evidence" section with three populated rows for any tag created on the beta track (mirrors the M12-alpha pattern from Phase 1 closeout Item 3).

#### 8.4 — Acceptance
- `editor/tooling/release/release.sh beta` (without `--confirm-beta`) prints the checklist and exits 2.
- `scripts/check-sync-multiregion.mjs` exits 0 against the two-region fixture.
- `apps/bench/reports/M24-beta.md` has a populated "Gate Closure Evidence" section for any beta tag.

**Owner:** Release operator. **Effort:** ~1 h.

---

## Roll-up — Definition of Done for Phase 2 closeout

Phase 2 is closed when **all** of the following are true on `main`:

1. **Item 1:** ViewSyncBus is wired through all 4 canvas hosts; the new `LinkedViewsStore` exists and is registered; latency tests pass; ADR-0030 §"Multi-View Sync" carries the closure note.
2. **Item 2:** Both visual-diff suites use PNG diff with 2-pixel tolerance; golden images committed; CI `visual-diff` job green; ADR-0030 §"Visual Diff Tooling" carries the closure note.
3. **Item 3:** ADR-0041 exists ratifying waves 6–11; ADR-0036 footer cross-links it; `check-adr-code-drift.mjs` enforces wave-doc parity.
4. **Item 4:** All 24 schedule formula functions implemented and tested; ADR-0032 catalogue lists all 24; CI drift script enforces parity.
5. **Item 5:** `pryzm-cli schedule-export` works for CSV / XLSX / PDF; e2e test green; M21-2C bench report has the new gate row.
6. **Item 6:** Phase 2C spec and ADR-039 cross-reference each other; no stale ADR-026 mentions in export-worker context.
7. **Item 7:** All 11 test workflows reach a terminal state without hanging on `npx` prompts (migrated to `pnpm --filter`).
8. **Item 8:** `release.sh beta --confirm-beta` succeeds against staging; `M24-beta.md` has a populated "Gate Closure Evidence" section.

Total estimated effort: **~17–22 h of engineering** if all items are implemented; **~6 h** if Items 4 (formulas) and 5 (CLI export) are scope-cut to ADR deferrals instead.

---

## Out of scope for this closeout

The following were **considered and explicitly excluded** from this document because the Phase 2 audit confirmed they are already implemented in code:

- Phase 2A — Rooms, Structural, Lighting, Plumbing, Furniture, Dimensions, drawing-primitives, plan-view foundation, M15-2A bench baseline. **All present.**
- Phase 2B — PlanViewCanvasHost, PlanViewRenderer, PlanCamera, hit-test, annotation pipeline, auto-dimensions, view templates, override store, section-view producer + host, kill-switches K2B-1..K2B-4. **All present.**
- Phase 2C — Sheets foundation, title blocks, viewports, all 10 sheet widget types, schedules engine, formula evaluator core (parser + 12 functions), CSV/XLSX/PDF exporters, M21-2C bench baseline. **All present.**
- Phase 2D — sync-client, event bridge (ADR-0033), chaos harness, awareness with 5 KB/s throttle (ADR-0034), multiplayer cursors / peer list / view chips, soft locks (ADR-019/0035), lock UI badges, M24 beta bench report, audit-log middleware code (the workflow that runs it is the only issue, addressed in Item 7). **All present.**

No code changes are required for any of the items in this "out of scope" list.
