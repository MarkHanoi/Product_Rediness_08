# C10 — Performance & Observability

> **Stamp**: 2026-05-02 · **Status**: CANONICAL  
> **Scope**: The 17 Non-Functional Targets (NFTs), OpenTelemetry span requirements, CI performance gates, bundle splitting, and the DR runbook reference.  
> **Key principles**: P8 (every new exported function adds ≥ 1 OpenTelemetry span).

---

## §1 — The 19 Non-Functional Targets (NFTs)

Each has a benchmark in `apps/bench/src/benches/*.bench.ts` (68 `.bench.ts` files —
`ls apps/bench/src/benches/*.bench.ts | wc -l`). The bench suite **MUST** run in CI on every merge
to main, and a regression on any NFT **MUST** be a merge blocker on the PR that caused it.

> ⚠ **NOT-YET-TRUE (recorded 2026-08-11). The two `MUST`s above are the requirement, not the
> state.** This section used to open *"These are **measured contracts**, not aspirational goals"*
> — as an unqualified statement of fact. It is currently the reverse: **the bench suite runs in no
> CI job at all.**
>
> - Measured: `grep -rn "bench" .github/workflows/` → **zero matches** across every workflow file.
>   Nothing in CI invokes `apps/bench`. There is no baseline file, so there is nothing a
>   "regression from baseline" could be computed against.
>
> **Exit condition:** a `bench` job exists in `.github/workflows/ci.yml`, runs
> `apps/bench` against a committed baseline, and is listed among the required status checks in
> that file's header. Wave 5 owns this. Until then, every NFT row below is a **TARGET**, and no
> row may be cited as a measured property of the shipped product.

NFTs 1–17 exist as of Wave 13 (2026-05-01) ✅. NFT 18 added Wave A16 (2026-05-03) ✅. NFT 19 target Wave A18.

| # | NFT | Target | Bench file |
|---|---|---|---|
| 1 | Cold-boot to first paint | < 2.5 s on M1 / Chrome | `cold-boot.bench.ts` |
| 2 | Project-load (10k elements) | < 6 s p95 | `project-load.bench.ts` |
| 3 | Tool latency (click → visible) | < 50 ms p95 | `tool-latency.bench.ts` |
| 4 | Frame budget (interactive viewport) | 16.6 ms p95 (60 FPS) | `frame-budget.bench.ts` |
| 5 | Plan-view re-render after edit | < 100 ms p95 | `plan-view-redraw.bench.ts` |
| 6 | Sheet-view re-render | < 200 ms p95 | `sheet-view-redraw.bench.ts` |
| 7 | CRDT merge (2 concurrent users) | < 80 ms p95 | `crdt-merge.bench.ts` |
| 8 | Sync conflict surface | < 1 s from second-user save | `sync-conflict.bench.ts` |
| 9 | IFC import (Tier-1, 50 MB) | < 30 s | `ifc-import-tier1.bench.ts` |
| 10 | IFC export (Tier-1, 10k elements) | < 20 s | `ifc-export-tier1.bench.ts` |
| 11 | BCF round-trip (issue cycle) | < 4 s | `bcf-roundtrip.bench.ts` |
| 12 | Family load (medium, 200 params) | < 200 ms | `family-load.bench.ts` |
| 13 | Schedule rebuild (10k rows) | < 500 ms p95 | `schedule-rebuild.bench.ts` |
| 14 | AI plan-critique latency | < 8 s e2e | `ai-critique.bench.ts` |
| 15 | Bundle size (editor app) | < 4 MB gzipped | `bundle-size.bench.ts` |
| 16 | Memory ceiling (10k elements, 1 h session) | < 1.5 GB | `memory-ceiling.bench.ts` |
| 17 | Plugin sandbox overhead | < 5 % CPU vs native call | `plugin-sandbox-overhead.bench.ts` |
| 18 | Undo stack memory (4 h session, 1000 commands) | < 50 MB rss delta | `undo-stack-memory.bench.ts` |
| 19 | E2E suite (Playwright, 10 critical flows) | all green on every CI run | `e2e-playwright-suite.spec.ts` (Wave A18 ✅) |

### §1.1 — Measurement methodology

**INTENDED methodology** (all four bullets are the target; the ⚠ notes record what is true today):

- Benchmarks run in a headless Chromium instance via `@vitest/browser`.
  ⚠ **NOT-YET-TRUE.** `apps/bench/vitest.config.ts` sets `environment: 'node'` and no
  `@vitest/browser` is configured. Every bench therefore runs in **Node**, with no renderer, no
  GPU and no real layout — so the rendering, frame-budget and cold-boot NFTs cannot be measuring
  what their names claim. *Exit condition:* the browser provider is configured, or the affected
  NFT rows are re-scoped to what a Node harness can honestly measure.
- All p95 targets are measured over ≥ 100 samples.
  ⚠ **NOT-YET-TRUE for most rows.** Measured with
  `grep -rhoE "SAMPLES *= *[0-9]+" apps/bench/src/benches/*.bench.ts | sort | uniq -c`: of the 25
  benches that declare a sample count, **only 8 are ≥ 100** (5×200, 3×500). The remaining 17 run
  at **5, 8, 10, 15, 20, 30 or 50** samples — nine of them at **5**. A p95 over 5 samples is not a
  p95. *Exit condition:* every bench that states a p95 target declares `SAMPLES >= 100`, enforced
  by the Wave-5 bench job.
- The bench suite runs after `pnpm build` to measure production bundle performance, not dev server
  performance. ⚠ **NOT-YET-TRUE** — see §1's note: the suite runs in no CI job, so it runs after
  nothing.
- NFT regressions are tracked in `03-CURRENT-STATE.md §1` alongside the code metrics.

---

## §2 — OpenTelemetry Span Contract (P8)

**Every new exported function MUST add ≥ 1 OpenTelemetry span.** This is a merge blocker.

### §2.1 — Span naming convention

```ts
const span = tracer.startSpan('pryzm.<package>.<operation>');
// Examples:
//   pryzm.geometry-kernel.section-cut
//   pryzm.persistence-client.save-project
//   pryzm.ai-host.plan-critique
```

### §2.2 — Required span attributes

| Attribute | Type | Required for |
|---|---|---|
| `pryzm.project_id` | string | All project-scoped operations |
| `pryzm.user_id` | string | All user-triggered operations |
| `pryzm.element_count` | number | Geometry and scene operations |
| `pryzm.command_type` | string | Command handler spans |
| `error` | boolean | All spans (set true on exception) |

### §2.3 — CI gate

`scripts/ci-check-spans.ts` runs on every PR. It diffs the changed files for new `export` declarations and checks that at least one `tracer.startSpan` call exists in the same function scope.

### §2.4 — User-facing observability events (toasts + polls)

OTel spans are the operator-facing channel. The **user-facing** observability channel is the in-app toast/event pipeline:

- **§VALIDATE-CACHE.** Workflows that produce per-room warnings (the §F-Sprint-5 furnish circulation gate, see C09 §3.4.1) MUST emit them on a `*.layout-executed` event payload AND cache them in-memory so the user can review via a `pryzm…Warnings()` console command after the toast scrolls off.
- **§VALIDATE-TOAST.** When a `*.layout-executed` event carries `validationWarnings.length > 0`, the trigger MUST emit a single `pryzm:toast` of severity `info` (not `error` — the gate flags risk, not failure) pointing the user at the review command. Severity is `info` because the layout still landed.
- **§BUILD-TOAST.** Generative completion toasts MUST surface dropped-element counts when the §PREVIEW-VS-BUILD gate rejected items during the build runBatch — e.g. `Built layout — N walls, M doors (K dropped — see console)`. Severity stays `success`; the drops are advisory. The drops MUST also be logged through a `console.group(§BUILD-WARN — N item(s) dropped during build)`.

### §2.5 — Polling / wait telemetry (§POLL-TELEMETRY)

Silent post-runBatch polls (wait-until-store-mutation, wait-until-room-named, etc.) MUST emit a structured `<stage>.<poll>-completed` event on `runtime.events` (P4) with:

- `levelId`
- `durationMs` (Date.now()-start)
- `attempts` (poll iteration count)
- `pollDescription` (what was being waited on)

This converts the otherwise-invisible silent latency into an observable metric so an operator can answer "why did the apartment build take 8 s instead of 2 s?" without console-archaeology. The two reference sites today are `apartment.wall-poll-completed` + `apartment.room-name-completed` (`e0a4b44`).

---

## §3 — Bundle Splitting Strategy

The editor app MUST apply manual chunk splitting to prevent the heavy vendor bundles from blocking the initial load. Current split boundaries (enforced in `vite.config.ts`):

| Chunk | Packages | Trigger |
|---|---|---|
| `vendor-cesium` | `cesium` | Geospatial viewport open |
| `vendor-web-ifc` | `web-ifc` | IFC import dialog |
| `vendor-thatopen` | `@thatopen/*` | IFC viewer open |
| `vendor-pathtracer` | `three-gpu-pathtracer` | Photorealistic render mode |
| `vendor-three-bvh` | `three-mesh-bvh` | Loaded with three core |
| `vendor-three` | `three` | Always loaded (deferred) |
| `vendor-pdfjs` | `pdfjs-dist` | PDF viewer |
| `vendor-dxf` | `dxf` | DXF import |
| `vendor-rhino3dm` | `rhino3dm` | Rhino import |
| `vendor-chart` | `chart.js` | Data Workbench / schedules |

**Rationale**: jspdf, svg2pdf, and html2canvas MUST NOT be manually chunked — doing so causes Vite's `__vitePreload` runtime to be co-located with the jspdf vendor chunk, pulling 477 KB of export code into the eager startup graph (documented incident, Contract 18 audit).

The `chunkSizeWarningLimit` is set to 1500 KB to suppress false-positive warnings for the intentionally large CAD/BIM vendor chunks.

---

## §4 — CI Gate Inventory (Performance + Build)

| Gate | Condition | Failure mode — measured 2026-08-11 |
|---|---|---|
| All 19 NFT benches pass | No regression from baseline | ⚠ **NOT A GATE — no CI job runs it.** `grep -rn "bench" .github/workflows/` → **0 matches**; no committed baseline exists. Intended: merge blocker. **Exit condition:** Wave-5 bench job wired into `ci.yml` and added to that file's required-checks header. (The row also said "17"; §1 defines **19**.) |
| `pnpm build` succeeds | `npm run build` exits 0 | Merge blocker — `build` job in `ci.yml` ✅ |
| Bundle size < 4 MB gzipped | NFT 15 | ⚠ **NOT A GATE.** `bundle-size.bench.ts` exists but, like every other bench, is invoked by no workflow. Same exit condition as the row above. |
| TypeScript `--noEmit` 0 errors | `pnpm tsc --noEmit` | Merge blocker — inside the `build` job ✅ |
| All workspace tests pass | `pnpm test:ci` | Merge blocker ✅ — but note `test-pryzm1` is deliberately `continue-on-error` pending L-544 |
| OpenTelemetry span coverage | ~~`scripts/ci-check-spans.ts`~~ → **`tools/ga-gate/check-otel-spans.ts`** | ⚠ **The cited path never existed** (`ls scripts/ci-check-spans.ts` → No such file) — the same defect class as L-812. The real gate runs inside the `ga-gate` job and is **ENFORCEMENT-BLIND**: 255/256 handler files instrumented against a `HARD_FLOOR` of 213, counting *files* rather than *exported functions*. See [STR-03 §2](../../01-strategy/STR-03-engineering-vision.md) P8 for the exit condition. |

---

## §5 — Crash Reporter

`packages/crash-reporter/` captures unhandled errors and unhandled promise rejections in production. It MUST:
- Sanitise any PII (user IDs are hashed; no project content is sent).
- Not block the main thread.
- Be configurable off via `CRASH_REPORTER_DISABLED=true` for self-hosted deployments.

---

## §6 — Disaster Recovery

The DR runbook is in `docs/04-reference/runbooks/DR-DRILL-RUNBOOK.md`. The runbook MUST be exercised (dry-run drill) at least once per quarter. Key RTO/RPO targets:

| Target | Value |
|---|---|
| Recovery Time Objective (RTO) | < 4 hours |
| Recovery Point Objective (RPO) | < 1 hour (Supabase WAL-based point-in-time recovery) |
| DR drill cadence | Quarterly |

The last DR drill MUST be logged in `03-CURRENT-STATE.md §11` with its date and outcome.

---

## §7 — Generation performance (log-gating + rebuild-budget + single-redetect)

A "building generation" (residential / office / house) is a KNOWN-heavy, multi-sub-batch
operation that authors 500+ elements in one shot. Three rules keep it fast (L-369):

1. **Hot per-element debug logs MUST be gated on a bulk-path flag.** A `console.log` on the
   main thread blocks it (severely so with DevTools open). Per-element / per-opening /
   per-finish loggers on the generation hot path (`[BimManager] Registered element`,
   `[WallOccupancyStore] canPlace OK`, `[RoomFinishSyncService] Synced/Propagated`,
   `[WallFragmentBuilder] RAF_DRAIN`) MUST be suppressed while a project load
   (`globalThis.__pryzmProjectLoadActive`) OR a building generation
   (`globalThis.__pryzmBuildingGenActive`, set by `buildingGenerationLifecycle`) is in flight.
   Interactive edits (neither flag set) still log; per-sub-batch SUMMARY lines are kept. New
   hot-path loggers MUST follow this gate.

2. **Deferred rebuild budgets MAY go high during a batch drain.** Renders are suppressed for the
   whole batch drain, so a drain frame is pure geometry cost. `WallFragmentBuilder` raises its
   per-frame floor (32) and cap (64) during a batch drain, with a `frameMs` back-off bounding a
   single frame. (SlabFragmentBuilder / CurtainWallBuilder MAY adopt the same batch-floor
   pattern — tracked as an L-369 follow-up.)

3. **Room re-detection MUST NOT run per-sub-batch during a generation.** The
   `RoomTopologyObserver` suppresses its AUTO-redetects while `__pryzmBuildingGenActive` (mirrors
   the existing `isBatching` guard); room identity during generation comes from the executors'
   graph rooms (`BatchCreateRoomsCommand`, ADR-0069) + their explicit `ReDetectRoomsCommand`s
   (which bypass the observer). `buildingGenerationLifecycle.release()` fires exactly ONE
   `scheduleRedetectAllLevels` sweep at the true end (a no-op on graph-authoritative levels).
