# C10 — Performance & Observability

> **Stamp**: 2026-05-02 · **Status**: CANONICAL  
> **Scope**: The 17 Non-Functional Targets (NFTs), OpenTelemetry span requirements, CI performance gates, bundle splitting, and the DR runbook reference.  
> **Key principles**: P8 (every new exported function adds ≥ 1 OpenTelemetry span).

---

## §1 — The 19 Non-Functional Targets (NFTs)

These are **measured contracts**, not aspirational goals. Each runs as a benchmark in `apps/bench/src/benches/*.bench.ts`. The bench suite MUST run in CI on every merge to main. A regression on any NFT is a **merge blocker** on the PR that caused it.

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

- Benchmarks run in a headless Chromium instance via `@vitest/browser`.
- All p95 targets are measured over ≥ 100 samples.
- The bench suite runs after `pnpm build` to measure production bundle performance, not dev server performance.
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

| Gate | Condition | Failure mode |
|---|---|---|
| All 17 NFT benches pass | No regression from baseline | Merge blocker |
| `pnpm build` succeeds | `npm run build` exits 0 | Merge blocker |
| Bundle size < 4 MB gzipped | NFT 15 | Merge blocker |
| TypeScript `--noEmit` 0 errors | `pnpm tsc --noEmit` | Merge blocker |
| All workspace tests pass | `pnpm test:ci` | Merge blocker |
| OpenTelemetry span coverage | `scripts/ci-check-spans.ts` | Merge blocker (P8) |

---

## §5 — Crash Reporter

`packages/crash-reporter/` captures unhandled errors and unhandled promise rejections in production. It MUST:
- Sanitise any PII (user IDs are hashed; no project content is sent).
- Not block the main thread.
- Be configurable off via `CRASH_REPORTER_DISABLED=true` for self-hosted deployments.

---

## §6 — Disaster Recovery

The DR runbook is in `docs/03_PRYZM3/reference/runbooks/DR-DRILL-RUNBOOK.md`. The runbook MUST be exercised (dry-run drill) at least once per quarter. Key RTO/RPO targets:

| Target | Value |
|---|---|
| Recovery Time Objective (RTO) | < 4 hours |
| Recovery Point Objective (RPO) | < 1 hour (Supabase WAL-based point-in-time recovery) |
| DR drill cadence | Quarterly |

The last DR drill MUST be logged in `03-CURRENT-STATE.md §11` with its date and outcome.
