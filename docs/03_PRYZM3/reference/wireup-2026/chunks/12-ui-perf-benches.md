# §13  UI-interaction perf bench suite — 60 new benches

> Part of [PRYZM2-WIREUP-PLAN-S72](./00-INDEX.md). Source slice of [PRYZM2-ENTERPRISE-WIREUP-PLAN-S72.md](../00-PLAN.md) lines 1390–1550.

---

## §13 UI-interaction perf bench suite — the gap in `apps/bench/`

`apps/bench/src/benches/` ships 50+ benches as of S72 D0, but **every one is headless** (cmd-execute-latency, save-edit, sync-roundtrip, produce-wall, orbit-fps, etc.). The cold-load benches measure data-half boot only. **There is no bench in the suite today that measures a click-to-paint latency, a panel mount time, a scroll fps, an inspector update, or a first-contentful-paint.** This was the gap §11.16 hand-waved with "perf gate" language without naming the bench.

This section names the bench. Phase H D1 lands the suite.

### §13.1 New folder: `apps/bench/src/benches/ui/`

A new sub-tree groups every UI-interaction bench. All benches use the **Playwright + Vitest browser-mode** pattern: spin a real Chromium (and Firefox + WebKit in CI), boot the white app, drive a typed gesture script, measure with `performance.now()` + `PerformanceObserver` for paint/LCP marks, assert against `apps/bench/baseline.json` budgets.

The harness (`apps/bench/src/ui/UiBenchHarness.ts`) provides:
```ts
class UiBenchHarness {
  page: Page;
  async boot(opts: { fixture?: 'empty' | 'small' | 'medium' | 'large' }): Promise<void>;
  async clickToPaint(selector: string): Promise<{firstFrameMs: number; firstPaintMs: number}>;
  async scrollFps(selector: string, deltaY: number, durationMs: number): Promise<{p50: number; p95: number}>;
  async dragFps(selector: string, path: Vec2[], durationMs: number): Promise<{p50: number; p95: number}>;
  async typeLatency(selector: string, text: string): Promise<{perKeyP95Ms: number}>;
  measure(): PerformanceMetrics;
}
```

### §13.2 The bench catalogue (60 UI benches, gating GA)

Numbers below are **GA budgets** (Vision §6 derived). Pre-GA all gates run informational (warn) — flipped to hard-fail at the start of Phase H D-final.

#### Category A — Platform pages (5 benches)

| Bench | Gesture | Budget |
|---|---|---|
| `bench/ui/landing-paint.bench.ts` | cold load → LCP | LCP < 600 ms (Vision §6 row "First contentful paint") |
| `bench/ui/auth-modal-open.bench.ts` | click "Log in" → modal interactive | < 50 ms |
| `bench/ui/hub-paint.bench.ts` | login → hub TTI with 100 projects | < 500 ms TTI; bundle delta from landing → hub < 200 KB gzip |
| `bench/ui/hub-create.bench.ts` | "+ New project" submit → editor first interactive frame | < 800 ms |
| `bench/ui/hub-search-filter.bench.ts` | type in search box → filtered list paint | < 16 ms per keypress (60 fps typing) |

#### Category B — Workspace boot + top bar (4 benches)

| Bench | Gesture | Budget |
|---|---|---|
| `bench/ui/workspace-mount.bench.ts` | open project (M-medium fixture) → first interactive frame | < 800 ms (Vision §6 "Cold load — small project < 800 ms"); also measures composeRuntime() < 50 ms |
| `bench/ui/view-tab-switch.bench.ts` | click view tab → new view first interactive frame | < 200 ms cached, < 500 ms cold |
| `bench/ui/contextual-edit-bar.bench.ts` | select element → edit bar visible | < 16 ms (one frame) |
| `bench/ui/save-undo-hud.bench.ts` | command dispatched → save pill state transition | < 50 ms (event log append local-first) |

#### Category C — Left rail (8 benches, one per spine icon + width drag)

| Bench | Gesture | Budget |
|---|---|---|
| `bench/ui/lnr-toggle.bench.ts` | click spine icon → content swap | < 100 ms p95 |
| `bench/ui/lnr-resize.bench.ts` | drag right-edge resize handle | 60 fps sustained |
| `bench/ui/spatial-tree-paint.bench.ts` | open MODEL panel with 10K-element project | < 500 ms; incremental insert < 16 ms |
| `bench/ui/spatial-tree-scroll.bench.ts` | scroll the tree | 60 fps p95 |
| `bench/ui/data-tree-paint.bench.ts` | open DATA panel with 10K rows | < 500 ms |
| `bench/ui/view-list-paint.bench.ts` | open VIEWS panel with 50 views/sheets | < 200 ms |
| `bench/ui/schedule-list-paint.bench.ts` | open SCHEDULES panel with 50 schedules | < 200 ms |
| `bench/ui/ai-panel-mount.bench.ts` | open AI panel | < 100 ms |

#### Category D — Right tools panel (3 benches)

| Bench | Gesture | Budget |
|---|---|---|
| `bench/ui/toolbar-discipline-switch.bench.ts` | click discipline button → tool grid swap | < 100 ms |
| `bench/ui/tool-activate.bench.ts` | click any tool button → tool active + cursor change + HUD mounted | < 16 ms tool-active state + < 50 ms HUD paint |
| `bench/ui/plugin-contribution-add.bench.ts` | install plugin via marketplace → toolbar repaint | < 200 ms after install completes (no reload) |

#### Category E — Inspector (5 benches)

| Bench | Gesture | Budget |
|---|---|---|
| `bench/ui/inspector-mount.bench.ts` | select element → form rendered | < 50 ms p95, < 100 ms p99 |
| `bench/ui/inspector-render-large.bench.ts` | select element with 50-field property panel | < 100 ms |
| `bench/ui/inspector-multi-select.bench.ts` | select 100 elements → common-fields form | < 200 ms |
| `bench/ui/system-type-swap.bench.ts` | dropdown change → store update + bake queued | < 50 ms |
| `bench/ui/dimension-edit-live.bench.ts` | numeric drag → live preview frames | 60 fps p95 |

#### Category F — Bottom strip (5 benches)

| Bench | Gesture | Budget |
|---|---|---|
| `bench/ui/bottom-shortcut.bench.ts` | hotkey "WA" → wall tool active | < 16 ms |
| `bench/ui/carousel-scroll.bench.ts` | scroll furniture carousel | 60 fps p95 |
| `bench/ui/carousel-drag.bench.ts` | drag furniture into scene → first paint | < 100 ms |
| `bench/ui/schedule-mount.bench.ts` | open 5K-row schedule | < 1 s |
| `bench/ui/schedule-edit.bench.ts` | edit cell → store update + UI reflect | < 16 ms |
| `bench/ui/sheet-editor-mount.bench.ts` | switch to sheet view | < 500 ms |

#### Category G — Canvas overlays (4 benches)

| Bench | Gesture | Budget |
|---|---|---|
| `bench/ui/selection-overlay.bench.ts` | multi-select 1K elements | < 100 ms paint |
| `bench/ui/snap-indicator.bench.ts` | mousemove during draw with snap | < 16 ms per frame including snap test |
| `bench/ui/presence-cursor.bench.ts` | 5 peers, 30 Hz update | < 1 ms per frame overhead |
| `bench/ui/dimension-preview.bench.ts` | live dimension preview during drag | < 16 ms |

#### Category H — Drawing HUDs + per-family draw (12 benches; one per family)

| Bench | Gesture | Budget |
|---|---|---|
| `bench/ui/<family>-draw.bench.ts` (×12) | family tool active, mousemove + click sequence (8 points) | per-frame < 16 ms; commit dispatch → first paint < 50 ms |

#### Category I — AI surfaces (3 benches)

| Bench | Gesture | Budget |
|---|---|---|
| `bench/ui/ai-first-token.bench.ts` | prompt submit → first streamed token | < 800 ms p50 |
| `bench/ui/ai-generate.bench.ts` | generate batch → approval queue populated | depends on AI worker; UI overhead < 200 ms |
| `bench/ui/ai-validate.bench.ts` | validate project → results paint | < 500 ms (UI portion) |

#### Category J — Data workbench (4 benches)

| Bench | Gesture | Budget |
|---|---|---|
| `bench/ui/dw-mount.bench.ts` | open DW → orchestrator mounted | < 100 ms |
| `bench/ui/dw-hierarchy.bench.ts` | 5K-row hierarchy paint + scroll | < 500 ms paint, 60 fps scroll |
| `bench/ui/dw-nl-query.bench.ts` | NL query → results | < 200 ms (cached corpus) |
| `bench/ui/dw-chart-render.bench.ts` | chart with 1K data points | < 200 ms |

#### Category K — Rendering (4 benches)

| Bench | Gesture | Budget |
|---|---|---|
| `bench/ui/render-quality-toggle.bench.ts` | quality preset change → first frame at new quality | < 100 ms |
| `bench/ui/sun-drag.bench.ts` | sun drag | 60 fps p95 |
| `bench/ui/render-export-start.bench.ts` | start render → first frame | < 500 ms |
| `bench/ui/render-gallery-paint.bench.ts` | 50-thumbnail grid | < 200 ms |

#### Category L — Modals + cross-cutting (3 benches)

| Bench | Gesture | Budget |
|---|---|---|
| `bench/ui/modal-open.bench.ts` | open any modal (creation, confirm, settings) | < 100 ms |
| `bench/ui/radial-menu-open.bench.ts` | right-click → radial menu visible | < 50 ms |
| `bench/ui/toast-show.bench.ts` | trigger toast → toast visible | < 16 ms |

#### Cross-cutting — full-flow + memory + bundle (4 benches)

| Bench | Gesture | Budget |
|---|---|---|
| `bench/ui/full-flow-create-edit.bench.ts` | landing → login → hub → new project → activate wall → draw 5 walls → edit thickness → undo → save | total wall-clock < 4 s; no allocations > 1 MB during steady state (V8 sampler) |
| `bench/ui/idle-cpu-workspace.bench.ts` | workspace open, no input, 5 s | rAF count == 0 (Vision §6 idle 0 fps); CPU < 2% |
| `bench/ui/scrub-fps-large.bench.ts` | orbit + pan + zoom on L-large fixture | > 55 fps p95 (Vision §6 row "Interactive frame rate") |
| `bench/ui/bundle-size-ui.bench.ts` | measure shipped JS for `src/ui/` chunk only | < 1.2 MB raw / < 350 KB gzip (carved from Vision §6 < 6 MB / 1.8 MB total) |

### §13.3 CI integration

- Each bench writes its result to `apps/bench/reports/<sprint>/<bench-name>.json` with `{p50, p95, p99, samples, env}`.
- `apps/bench/scripts/check-baseline.mjs` compares to `apps/bench/baseline.json`. Existing infra reused; new entries appended.
- Pre-GA: warn-only. Phase H D-final flips all UI benches to `hardFail: true` simultaneously.
- Per-PR job runs the **fast** subset (categories C, D, E, G, H, L = ~35 benches in ~3 min on CI runner).
- Nightly job runs the **full** suite (60 benches in ~12 min).
- The bench dashboard (`apps/bench/dashboard/`) gets a new "UI" tab grouping these by category with sparklines per sprint.

### §13.4 Visual-diff CI alongside

The perf benches assert *latency*. Visual-diff CI (Phase H separate deliverable, `apps/bench/visual-diff/`) asserts *appearance*. Both are required. The visual-diff baseline is captured from a frozen pre-S72 build BEFORE Phase A starts and re-asserted on every PR; SSIM diff > 2 px or pixel-diff > 0.05 % fails. Together perf + visual-diff give the operator the contract: *the UI looks identical, and it is at least as fast as it was, on every PR.*

---

