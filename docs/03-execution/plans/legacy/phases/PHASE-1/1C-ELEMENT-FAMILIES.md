# Phase 1C — Element Families Completion + Supporting Systems (Q3 · Months 7–9 · Sprints S13–S18)

> **Authority note (added 2026-04-27).** This document is *implementation guidance* and is subordinate to:
>
> 1. The 12 specs in `docs/03-execution/specs/` (SPEC-01..SPEC-12).
> 2. The 22 strategic ADRs in `docs/02-decisions/adrs/` (the `[strategic ADR-001]`..`[strategic ADR-024]` collective range — individual files live as `adrs/ADR-NNN-<slug>.md`).
> 3. `docs/archive/pryzm3-internal/superseded-2026-04-30/03_STATUS/CRITICAL-REVIEW-2026-04-27.md`.
> 4. `docs/03-execution/plans/legacy/plan-detail/01-MASTER-36M.md`.
>
> Where this phase document conflicts with any of the above, the higher-precedence document wins. **ADR citations**: bare `ADR-NNN` is forbidden. Use `[strategic ADR-NNN]` for entries in `02-decisions/adrs/`, or fully-qualified `code-level ADR docs/02-decisions/adrs/NNNN-<slug>.md` for sprint-scoped decisions.
>
> **`code-level ADR docs/02-decisions/adrs/0014-traa-ssgi-idle-budget.md`..017 in this document.** Phase 1C introduces **four sprint-scoped ADRs** whose canonical text lives in §6 below. They map to the following code-level slugs:
>
> | §6 heading | Code-level slug |
> |---|---|
> | ADR-014 — TRAA / SSGI idle-continuation budget | `docs/02-decisions/adrs/0014-traa-ssgi-idle-budget.md` |
> | ADR-015 — Picking strategy: gpu-pick + BVH fallback | `docs/02-decisions/adrs/0015-picking-strategy.md` |
> | ADR-016 — View state command-driven model | `docs/02-decisions/adrs/0016-view-state-command-driven.md` |
> | ADR-017 — `@pryzm/headless` package surface | `docs/02-decisions/adrs/0017-headless-package-surface.md` |
>
> **Numbering collision note.** Phase 1B drafted `code-level ADR 0014-persistence-snapshot-threshold.md` (only if S09 needed it). Phase 1C's `code-level ADR docs/02-decisions/adrs/0014-traa-ssgi-idle-budget.md` (TRAA / SSGI) is a different decision; when both files materialize in `docs/02-decisions/adrs/`, one will need a disambiguating slug (e.g. `0014a-...` or shift one up the sequence).

> **Sub-phase goal**: by end of M9 the **12 element families** are end-to-end (the 9 from 1B + Stairs, Handrails, Ceilings); the renderer is hardened for production with post-FX, TRAA, SSGI all under scheduler control; selection / picking works across every element; view-state foundations exist; **`@pryzm/headless` runs in Node and produces a valid wall+slab project**. The kernel-purity claim is mechanically verified for the first time outside lint.
>
> **The bet for 1C**: the architectural rails (1A) and the multiplier proof (1B) are in place — 1C is where we add the **production-grade renderer hardness** and the **headless kernel proof** that turn PRYZM 2 from "works" into "production-shaped". Without 1C, the alpha gate in 1D cannot fire.

This document expands `phases/PHASE-1-FOUNDATION-M1-M12.md §4` into a **two-agent parallel execution plan**.

---

## §0 Reading conventions

Same as 1A/1B: 2 agents (A, B) + Founder (F). 1 sprint = 10 working days. D1 kickoff (30 min), D5 mid-sprint sync (1 h), D9 demo + retro (1 h), D10 buffer.

**Branch model**: `agentA/sNN-<topic>` / `agentB/sNN-<topic>` → F merges to `pryzm2/main`.

---

## §1 Track allocation for 1C

In 1A and 1B the cleavage was data-vs-render. In 1C the work is more diverse: element completion, renderer hardening, view-state, selection, headless. We pivot to a **systems-vs-elements** split.

### §1.x Type catalog hardening (`[strategic ADR-017]`)

Phase 1C is the sprint block where SPEC-05 lands in earnest. By S18 close:

- All system families (Wall, Floor, Roof, Ceiling, Stair, Railing, Curtain Wall, Curtain Grid) have full schemas in `packages/types-schema/`.
- Built-in catalog populated to the M36 ship-with-product list per SPEC-05 §7 minus loadable families (which are Phase 3A): 12 walls, 8 floors/roofs, 4 stairs, 2 railings, 1 curtain wall sample, 40 materials.
- The type-completeness lint (`tools/lint-type-completeness.ts`) is PR-blocking from S11 (so it has been hard-blocking since the first day of 1C).
- "Reset to type" semantics implemented in the property panel (per SPEC-05 §2.4).

### §1.y SPECs binding Phase 1C

| SPEC | Section | Sprints |
|---|---|---|
| SPEC-01 (Determinism & robustness budget) | §3 robustness; §6 determinism | All |
| SPEC-05 (Family taxonomy + type vs instance) | §1–§4 type catalog and material library; §7 starter types | All |
| SPEC-10 (Plugin manifest + capability surface) | All | All |

### §1.z Capacity envelope

> **Capacity envelope (`[strategic ADR-018]`).** Phase 1C accepts the 6-sprint scope. If sprint capacity is exhausted, the cut-list defined in `02-decisions/adrs/ADR-018-capacity-cut-list.md` is the ratified order. Defer items per the `[strategic ADR-018]` ranking — never improvise scope reductions.

### Track A — Systems & Headless (Agent A owns)

L1 selection store, L7 view state, L4 kernel proofs, L0 headless package.

| Item | First sprint | Owner |
|---|---|---|
| `plugins/curtain-wall/handlers/*` (port remaining handlers from PRYZM 1) | S13 | A |
| `plugins/curtain-wall/intent.ts` (panel/mullion intent) | S13 | A |
| `packages/stores/SelectionStore.ts` (real impl, replacing skeleton from S04) | S16 | A |
| `packages/picking/` (gpu-pick + BVH-pick) | S16 | A |
| `packages/view-state/{ViewController,ViewDefinition,ViewRegistry}.ts` | S17 | A |
| `packages/stores/ActiveViewStore.ts` | S17 | A |
| `apps/headless/` package (full impl) | S18 | A |
| `apps/headless/cli/` subcommands | S18 | A |
| `apps/bench/load-medium.ts` (full implementation, fixture from 1B) | S15 | A |
| Documentation `docs/04-reference/architecture-detail/headless.md` | S18 | A |

### Track B — Renderer Hardening + Stair Family (Agent B owns)

L5 post-FX, idle-budget tuning, the 3 remaining elements (Stair, Handrail, Ceiling), benches.

| Item | First sprint | Owner |
|---|---|---|
| `plugins/curtain-wall/committer.ts` perf tune | S13 | B |
| `plugins/stair/{store,handlers,producer,committer,tool}.ts` | S14 | B (with A on store/handlers) |
| `plugins/handrail/{store,handlers,producer,committer,tool}.ts` | S14 | B |
| `plugins/ceiling/{store,handlers,producer,committer,tool}.ts` | S14 | B |
| `packages/renderer/passes/{Bloom,TRAA,SSGI}.ts` | S15 | B |
| `packages/renderer/IdleAccumulator.ts` | S15 | B |
| `apps/bench/idle-cpu.ts` re-run with full post-FX | S15 | B |
| `apps/bench/orbit-fps.ts` re-run with post-FX | S15 | B |
| `plugins/wall/selection-highlight.ts` extracted to shared `packages/render-runtime/highlight.ts` | S16 | B |
| `apps/bench/picking-latency.ts` | S16 | B |
| `apps/bench/render-pass-cost.ts` (per-pass) | S15 | B |

### Joint deliverables

| Item | Sprint | Sync mechanism |
|---|---|---|
| `code-level ADR docs/02-decisions/adrs/0014-traa-ssgi-idle-budget.md` (TRAA / SSGI under idle-continuation budget) | S15 D1 | F-driven; B drafts |
| `code-level ADR docs/02-decisions/adrs/0015-picking-strategy.md` (Picking strategy: gpu-pick default, BVH fallback) | S16 D1 | F-driven; A drafts |
| `code-level ADR docs/02-decisions/adrs/0016-view-state-command-driven.md` (View state model: command-driven view switch) | S17 D1 | F-driven; A drafts |
| `code-level ADR docs/02-decisions/adrs/0017-headless-package-surface.md` (Headless package surface — what does `@pryzm/headless` export?) | S18 D1 | F-driven; A drafts |
| Sub-phase 1C demo recording | S18 D9 | Joint |

---

## §2 Sprint-by-sprint two-agent breakdown

---

### S13 — Curtain Wall completion + producer perf tune (Weeks 25–26, M7)

**Joint goal**: all curtain-wall handlers operational (12 PRYZM 1 commands → 9 final per `code-level ADR docs/02-decisions/adrs/0011-curtain-wall-triage-and-producer-split.md`); producer p95 < 50 ms for typical façade; orbit-fps with 50-panel façade > 55 fps.

#### D1 — Kickoff (30 min)

- A reviews remaining CW handlers from S12 backlog (S12 finished 9 handlers; this sprint finishes the rest + intent edge-cases).
- B sets curtain-wall perf budget: producer < 50 ms, committer commit < 16 ms (one frame).

#### D2–D8 parallel work

| Day | Agent A (Track A — CW handlers + intent) | Agent B (Track B — CW committer perf + Stair prep) |
|---|---|---|
| D2 | Implement remaining CW handlers per `code-level ADR docs/02-decisions/adrs/0011-curtain-wall-triage-and-producer-split.md` — focus on `AddPanel`, `RemovePanel`, `SwapPanel`, `SetMullionType`, `RotatePanel`. | CW committer profile: identify hot path (typically per-panel material instantiation). Move panel materials to `MaterialPool` cache. |
| D3 | Implement `plugins/curtain-wall/intent.ts` — resolves which panel a click/edit targets in a multi-panel façade. | Re-run `produce-cw.ts` bench — target < 50 ms p95. Tune producer (likely: vector-math hot path). |
| D4 | Extract 25-case parity fixture `tests/parity/curtain-wall/` from real PRYZM 1 façades. | Bench `apps/bench/orbit-fps.ts` re-run with 50-panel façade — target > 55 fps p95. |
| D5 | **Mid-sprint sync (1 h)** — paired session: validate CW handlers + intent + parity. | Same paired session — start Stair store/handler design (lands in S14). |
| D6 | Run all 25 CW parity cases — fix any failing. | Stair store + 6 handlers (`CreateStair`, `DeleteStair`, `SetStairType`, `SetTreadCount`, `SetRiserHeight`, `SetWidth`) — A pairs in for store work. |
| D7 | All CW handlers green; CW marked done for Phase 1. | Stair pure producer skeleton in `packages/geometry-kernel/producers/stair.ts`. |
| D8 | Documentation `plugins/curtain-wall/README.md` + intent resolver write-up. | Stair producer first impl (straight-run only — L-turn + U-turn in S14). |

#### D9 — Sprint demo + retro

- A demos: 25 CW parity cases all green; large façade scenario.
- B demos: 50-panel façade orbit > 55 fps; producer profile shows < 50 ms.
- Retro.

#### S13 exit criteria — extra (per `phases/PHASES-UPDATE-PLAN-2026-04-27.md §3.4`)

- [ ] `Curtain Wall` family schema complete in `packages/types-schema/curtain-wall.ts` (per SPEC-05 §1.2).
- [ ] Built-in curtain-wall types declared in `packages/types-builtin/curtain-wall/` (count per SPEC-05 §7).
- [ ] Property-test for the curtain-wall family in `packages/geometry-kernel/__tests__/robustness/curtain-wall.spec.ts` green (per `[strategic ADR-020]`).
- [ ] OTel coverage lint passes per P8 (`[strategic ADR-007]`).

#### S13 exit criteria

- [ ] CW producer p95 < 50 ms (CI gate).
- [ ] All 25 CW parity cases pass.
- [ ] 50-panel façade orbit-fps > 55 fps p95.
- [ ] CW marked complete for Phase 1.

#### S13 typed contracts introduced

```ts
// plugins/curtain-wall/intent.ts — S13-T2 (~280 LOC; mirrors WallIntentResolver shape from `code-level ADR docs/02-decisions/adrs/0013-intent-resolver.md`)
export interface CurtainWallIntentResolver {
  // Which panel (cell) does this 2D screen-projected point hit? Pure DTO/grid math; no THREE.Raycaster.
  resolvePanelCell(cwId: CurtainWallId, projectedPoint: Point2D): { row: number; col: number } | null;
  // Mullion vs panel disambiguation — clicks within `mullionEdgeTolerancePx` (8) of a grid line resolve to mullion.
  resolveSegmentIntent(cwId: CurtainWallId, projectedPoint: Point2D):
    | { kind: 'panel'; row: number; col: number }
    | { kind: 'mullion'; orientation: 'vertical' | 'horizontal'; index: number }
    | { kind: 'transom'; index: number }
    | null;
  // Used by AddPanel/RemovePanel handler entry point — ensures grid coords are valid.
  validateGridCoordinate(cwId: CurtainWallId, row: number, col: number): { ok: true } | { ok: false; reason: 'out-of-range' | 'overlaps-existing' };
}

// plugins/curtain-wall/handlers/AddPanel.ts — S13-T1 example (rest of CW handler set follows same shape)
export interface AddPanelCommand extends Command {
  readonly type: 'curtain-wall.addPanel';
  readonly payload: {
    readonly cwId: CurtainWallId;
    readonly row: number;
    readonly col: number;
    readonly panelTypeId: PanelTypeId;
  };
}

export const addPanelHandler: Handler<AddPanelCommand> = {
  type: 'curtain-wall.addPanel',
  affectedStores: ['curtain-wall'] as const,
  async execute(cmd, ctx) {
    const cw = ctx.cwStore.get(cmd.payload.cwId);
    if (!cw) throw new CurtainWallNotFoundError(cmd.payload.cwId);
    const validation = cwIntent.validateGridCoordinate(cmd.payload.cwId, cmd.payload.row, cmd.payload.col);
    if (!validation.ok) throw new InvalidGridCoordinateError(validation.reason);
    return {
      patches: { 'curtain-wall': [{ op: 'add', path: [cmd.payload.cwId, 'panels', '-'],
        value: { row: cmd.payload.row, col: cmd.payload.col, panelTypeId: cmd.payload.panelTypeId } }] },
      events: [{ type: 'curtain-wall.panelAdded', cwId: cmd.payload.cwId, row: cmd.payload.row, col: cmd.payload.col }],
    };
  },
};

// plugins/curtain-wall/committer.ts — S13-T3 (perf-tuned vs S12 skeleton)
//   Hot-path optimization: per-panel materials moved to MaterialPool by content-key
//   `{kind:'glass',color,opacity,ior}` so 50 identical panels share 1 THREE material.
//   Pre-S13: 50 panels = 50 materials = 50 draw calls; post-S13: 50 panels = 1 material = 1 draw call.
interface CWSceneEntry {
  mesh: THREE.Mesh;                              // single mesh, multi-group per `code-level ADR docs/02-decisions/adrs/0011-curtain-wall-triage-and-producer-split.md`
  panelMaterialHandles: Map<PanelTypeId, MaterialHandle>;  // pooled; refcount-managed
  mullionMaterialHandle: MaterialHandle;
  transomMaterialHandle: MaterialHandle;
  descriptorHash: string;
}
```

#### S13 key pseudocode — CW panel-material dedup hot path (the perf fix)

The S12 CW committer naively created one `THREE.MeshStandardMaterial` per panel cell. With 50 panels of the same glass type, this produced 50 draw calls and ~12 ms of redundant material-bind cost per frame — enough to drop orbit-fps below 55. The S13 fix routes panel material acquisition through `MaterialPool` (1A S05) with a content-addressed key. The fix is a 12-line patch but unlocks the 55-fps gate.

```ts
// plugins/curtain-wall/committer.ts — S13 D2-D3 hot-path fix
function rebindPanelMaterials(entry: CWSceneEntry, cw: CurtainWallData, ctx: CommitterContext): void {
  const newHandles = new Map<PanelTypeId, MaterialHandle>();
  for (const panel of cw.panels) {
    const panelType = ctx.panelTypeLib.get(panel.panelTypeId);              // pure lookup
    const key: MaterialKey = { kind: 'glass', color: panelType.color,
      opacity: panelType.opacity, ior: panelType.ior };                     // content-addressed
    let handle = newHandles.get(panel.panelTypeId);
    if (!handle) {
      handle = ctx.materialPool.acquire(key);                                // POOLED — 50 identical = 1 acquire
      newHandles.set(panel.panelTypeId, handle);
    }
    // (mesh group materialIndex remains stable; only the THREE.Material slot points to pooled instance)
  }
  // release stale handles
  for (const [oldTypeId, oldHandle] of entry.panelMaterialHandles) {
    if (!newHandles.has(oldTypeId)) ctx.materialPool.release(oldHandle);
  }
  entry.panelMaterialHandles = newHandles;
}
```

#### S13 test catalog (Vitest + Playwright, 22 tests planned)

| Test file | Tests | Owner |
|---|---|---|
| `plugins/curtain-wall/__tests__/intent.test.ts` | `resolvePanelCell hits middle panel`, `resolvePanelCell returns null for out-of-grid`, `resolveSegmentIntent disambiguates mullion within 8px`, `resolveSegmentIntent prefers panel beyond 8px`, `validateGridCoordinate rejects out-of-range`, `validateGridCoordinate rejects overlap` | A |
| `plugins/curtain-wall/__tests__/handlers/{AddPanel,RemovePanel,SwapPanel,SetMullionType,RotatePanel}.test.ts` | one happy + one error per handler (10 tests) | A |
| `tests/parity/curtain-wall/cw-real-projects.test.ts` | 25 fixtures captured from real PRYZM 1 façades × byte-equality | A |
| `apps/bench/produce-cw.bench.ts` | `simple 4x4 façade < 50 ms p95`, `large 10x10 façade < 80 ms p95` | B |
| `apps/bench/orbit-fps-cw.bench.ts` | `50-panel façade orbit > 55 fps p95`, `MaterialPool dedup: 50 same-type panels = 1 material instance (assert via materialPool.getStats())` | B |
| `plugins/curtain-wall/__tests__/playwright/integration.spec.ts` | `add 10 panels in 30s`, `swap panel type changes color without rebuilding geometry`, `large-façade scenario stays interactive` | B |

#### S13 OTel spans introduced

| Span name | Parent | Key attributes | Sampling |
|---|---|---|---|
| `pryzm.intent.cw.resolvePanelCell` | `pryzm.tool.dispatch` | `cw.id`, `cell.row?`, `cell.col?`, `intent.duration_ms` | 1/100 prod; always DEV |
| `pryzm.intent.cw.resolveSegmentIntent` | `pryzm.tool.dispatch` | `cw.id`, `segment.kind`, `intent.duration_ms` | 1/100 prod; always DEV |
| `pryzm.committer.cw.rebindPanelMaterials` | `pryzm.committer.commit` | `cw.id`, `panels.count`, `pool.hits`, `pool.misses`, `rebind.duration_ms` | always (gates depend on this) |

#### S13 daily artifact log

| Day | Files added | Files modified | Tests passing |
|---|---|---|---|
| D2 | `plugins/curtain-wall/handlers/{AddPanel,RemovePanel,SwapPanel,SetMullionType,RotatePanel}.ts` | `plugins/curtain-wall/committer.ts` (panel-material pool routing) | `+5 handler tests` |
| D3 | `plugins/curtain-wall/intent.ts`; `apps/bench/produce-cw.bench.ts` re-run | (none) | `+intent (6/6); bench p95=46ms ✓` |
| D4 | `tests/parity/curtain-wall/configs/real-project-{1..25}.json` | (none) | parity 25/25 ✓ |
| D5 | (joint paired session — Stair store/handler design notes in `docs/03-execution/status/sprints/S14-stair-design.md`) | (none) | (no merge) |
| D6 | (parity-fix iterations) | (miter math fix in `producers/_internal/cw-mullions.ts`) | parity 25/25 stable |
| D7 | `plugins/stair/{store.ts, handlers/{CreateStair,DeleteStair,SetStairType,SetTreadCount,SetRiserHeight,SetWidth}.ts}` (paired with B) | (none) | `+stair store, +6 stair handlers (pair-built)` |
| D8 | `plugins/curtain-wall/README.md`; `packages/geometry-kernel/producers/stair.ts` (straight-run only) | (none) | CW done; stair-straight produces |

---

### S14 — Stairs + Handrails + Ceilings (Weeks 27–28, M7)

**Joint goal**: 3 element families end-to-end. Stairs + Handrails are coupled (handrail follows stair); Ceilings are simple. By end of S14, all **12 element families** for Phase 1 are present.

#### D1 — Kickoff (30 min)

- B walks through stair-handrail coupling design (handrail subscribes to stair-changed events).
- A confirms producer signature can express "follow this curve" (handrail follows stair edge).

#### D2–D8 parallel work — element-paired ownership

| Day | Stair (paired D2–D5) | Handrail (paired D5–D7) | Ceiling (split D7–D8) |
|---|---|---|---|
| D2 | A: complete Stair handler set (8 total — adds `SetLanding`, `MirrorStair`). B: Stair pure producer (straight + L + U). | — | — |
| D3 | A: 18-case Stair parity fixture from PRYZM 1 references. B: Stair committer + tool + Playwright. | — | — |
| D4 | A: Stair parity tests pass. B: Stair perf bench. **Stair done.** | — | — |
| D5 | — | A: Handrail store + 5 handlers + parity-fixture skeleton. **Mid-sprint sync (1 h)** — design coupling: handrail `subscribeDirty` to Stair. B: Handrail pure producer (follows Stair edge). | — |
| D6 | — | A: Handrail-Stair coupling test (move Stair → Handrail follows). B: Handrail committer + tool. | — |
| D7 | — | A: 12-case Handrail parity. B: Handrail Playwright. **Handrail done.** | A+B paired: Ceiling store + 4 handlers + producer + committer + tool — Ceiling is mechanically simple (planar with optional offset). |
| D8 | — | — | A: 8-case Ceiling parity. B: Ceiling Playwright + integration test (mixed scene with Stair + Handrail + Ceiling). **Ceiling done. 12 elements complete.** |

#### D9 — Sprint demo + retro

- Joint demo: place Stair, Handrail attaches; move Stair, Handrail follows; place Ceiling on level above.
- Retro: how did the coupling pattern work? Reusable for Door-on-Wall (where it actually first appeared)?

#### S14 exit criteria — extra (per `phases/PHASES-UPDATE-PLAN-2026-04-27.md §3.4`)

- [ ] `Stair`, `Handrail`, and `Ceiling` family schemas complete in `packages/types-schema/{stair,handrail,ceiling}.ts` (per SPEC-05 §1.2).
- [ ] Built-in types declared in `packages/types-builtin/{stair,handrail,ceiling}/` (counts per SPEC-05 §7 — 4 stairs, 2 railings, 2 ceilings minimum).
- [ ] Property-tests for each family in `packages/geometry-kernel/__tests__/robustness/{stair,handrail,ceiling}.spec.ts` green (per `[strategic ADR-020]`).
- [ ] OTel coverage lint passes per P8 (`[strategic ADR-007]`).

#### S14 exit criteria

- [ ] 3 element families parity-tested green.
- [ ] Stair-Handrail coupling correct on common configs (straight, L-turn, U-turn).
- [ ] **All 12 Phase 1 element families complete.**
- [ ] Cross-element integration test (mixed scene of all 12) green.
- [ ] Documentation `docs/04-reference/architecture-detail/element-coupling.md` — pattern doc.

#### S14 typed contracts introduced

```ts
// plugins/stair/handlers/CreateStair.ts — S14-T1
export interface CreateStairCommand extends Command {
  readonly type: 'stair.create';
  readonly payload: {
    readonly levelId: LevelId;
    readonly footprint: { readonly start: Point3D; readonly direction: Vec3 };
    readonly run: 'straight' | 'L' | 'U';
    readonly treadCount: number;
    readonly riserHeight: number;            // metres; tread depth derived per code
    readonly width: number;
    readonly stairTypeId: StairTypeId;
  };
}

// plugins/handrail/handlers/CreateHandrail.ts — S14-T5; cross-store with stair
export interface CreateHandrailCommand extends Command {
  readonly type: 'handrail.create';
  readonly payload: {
    readonly hostStairId: StairId | null;     // null = freestanding (e.g. balcony rail in 2A)
    readonly side: 'left' | 'right' | 'both'; // when hostStairId !== null
    readonly handrailTypeId: HandrailTypeId;
  };
}
// affectedStores: ['handrail'] when freestanding; ['handrail', 'stair'] when hosted
//   (stair patches: `dependentHandrails[]` array — read by CascadeRunner stair.path rule)

// packages/geometry-kernel/producers/stair.ts — pure producer (`code-level ADR docs/02-decisions/adrs/0009-wall-producer-signature.md` shape)
export interface StairData { /* DTO mirror of Zod schema */ }
export const produceStair: (dto: StairData, levelGeometry: LevelGeometryHints) => BufferGeometryDescriptor;
//   Internally: switch(dto.run) { case 'straight': straightRun(); case 'L': lTurnWithLanding(); case 'U': uTurnWithLanding(); }
//   Each branch is a small (~60 LOC) helper sharing tread-prism extrusion via packages/geometry-kernel/producers/_internal/tread-prism.ts

// packages/geometry-kernel/producers/handrail.ts — depends on stair edge curve
export interface HandrailData { /* DTO */ }
export interface HandrailContext { readonly hostStairEdge: readonly Point3D[] | null }
export const produceHandrail: (dto: HandrailData, ctx: HandrailContext) => BufferGeometryDescriptor;
//   When ctx.hostStairEdge !== null: extrude rail profile along sampled stair-edge polyline.
//   When null: extrude along dto.freestandingPath.

// packages/geometry-kernel/producers/ceiling.ts — simplest producer of all 12
export interface CeilingData { /* DTO */ }
export const produceCeiling: (dto: CeilingData) => BufferGeometryDescriptor;
//   Planar polygon triangulation (earcut.js, BSD) + optional bulkhead offset extrusion.

// plugins/cross/stair-handrail.ts — S14-T6 (cascade rule per `code-level ADR docs/02-decisions/adrs/0012-cross-element-cascade-rule-registration.md`)
export const stairHandrailCascadeRule: CascadeRule<'stair.path'> = {
  key: 'stair.path',
  resolveAffected(stairId, ctx) {
    return ctx.handrailStore.dependentsOfStair(stairId);    // returns HandrailIds with hostStairId === stairId
  },
};
```

#### S14 key pseudocode — Stair-Handrail coupling via CascadeRunner (no inline subscribers)

The naïve approach to "handrail follows stair" is to give the handrail committer a `stairStore.subscribeDirty` callback that re-builds the handrail whenever the stair changes. This works but spreads coupling logic across plugins. The architecturally correct approach uses 1B's `CascadeRunner` (`code-level ADR docs/02-decisions/adrs/0012-cross-element-cascade-rule-registration.md`): the cross-package `plugins/cross/stair-handrail.ts` registers a cascade rule, and the runner synthesises a `RecomputeHandrail` command whenever any `Move/SetTreadCount/SetRiserHeight/SetWidth` stair handler dispatches.

```ts
// packages/command-bus/cascade.ts — runner (existing 1B infra) processes stair.path key
// When user dispatches stair.move:
//   1. transformStairHandler runs; emits patches + events
//   2. CascadeRunner.dispatch(stairMoveCmd, ctx) walks rules
//   3. rules.get('stair.path').resolveAffected(stairId) returns [handrailA, handrailB]
//   4. Runner synthesises RecomputeHandrail{handrailId: handrailA} and {handrailB}
//   5. Each Recompute handler reads new stair edge from stairStore and emits handrail patches
//   6. Handrail committer rebuilds geometry on next frame (descriptor.hash change)
//
// Net: zero direct subscriptions between plugins; coupling is declarative + observable via OTel cascade span.
```

#### S14 test catalog (Vitest + Playwright, 38 tests planned)

| Test file | Tests | Owner |
|---|---|---|
| `plugins/stair/__tests__/handlers/*.test.ts` | 8 handlers × 1 happy + 1 error = 16 tests | A |
| `plugins/handrail/__tests__/handlers/*.test.ts` | 5 handlers × happy = 5 tests | A |
| `plugins/ceiling/__tests__/handlers/*.test.ts` | 4 handlers × happy = 4 tests | A |
| `tests/parity/stair/stair-snapshot.test.ts` | 18 fixtures (6 straight + 6 L-turn + 6 U-turn) byte-equality | A |
| `tests/parity/handrail/handrail-snapshot.test.ts` | 12 fixtures × byte-equality | A |
| `tests/parity/ceiling/ceiling-snapshot.test.ts` | 8 fixtures × byte-equality | A |
| `plugins/cross/__tests__/stair-handrail-coupling.test.ts` | `move stair → handrail follows`, `change tread count → handrail re-samples`, `delete stair → freestanding handrails untouched`, `delete stair → hosted handrails deleted (cascade)` | A |
| `plugins/{stair,handrail,ceiling}/__tests__/playwright/integration.spec.ts` | each: place + edit + reload-persists (3 tests × 3 plugins = 9 tests) | B |
| `apps/bench/produce-{stair,handrail,ceiling}.bench.ts` | each p95 < 50 ms | B |
| `tests/integration/all-12-elements.spec.ts` | 12-element mixed scene loads + orbits > 55 fps p95 | A+B |

#### S14 OTel spans introduced

| Span name | Parent | Key attributes |
|---|---|---|
| `pryzm.kernel.produce.{stair,handrail,ceiling}` | `pryzm.committer.commit` or bench | `<elem>.id`, `producer.duration_ms`, `descriptor.bytes`, `stair.run?` (`'straight'`/`'L'`/`'U'`) |
| `pryzm.cascade.dispatch` (extended) | `pryzm.command.execute` | new attribute `cascade.rule.key='stair.path'` |
| `pryzm.committer.commit` (extended) | `pryzm.frame.scheduler.tick` | new attribute `committer.id` ∈ {`stair`, `handrail`, `ceiling`} |

#### S14 daily artifact log (compressed — element-paired ownership)

| Day | Track A (handlers/parity) | Track B (producer/scenic/Playwright) | Done? |
|---|---|---|---|
| D2 | `plugins/stair/handlers/{SetLanding,MirrorStair}.ts` (rounds out 8 total) | `packages/geometry-kernel/producers/stair.ts` (straight + L + U) | — |
| D3 | `tests/parity/stair/configs/{1..18}.json` (capture from PRYZM-1 references) | `plugins/stair/{committer,tool}.ts` + Playwright | — |
| D4 | parity 18/18 ✓; `apps/bench/produce-stair.bench.ts` | `apps/bench/orbit-stair.bench.ts` | **Stair done** |
| D5 | `plugins/handrail/{store,handlers}.ts` (5 handlers); `tests/parity/handrail/configs/{1..12}.json` skeleton | `producers/handrail.ts` + `plugins/cross/stair-handrail.ts` cascade rule registration | — |
| D6 | `plugins/cross/__tests__/stair-handrail-coupling.test.ts` (4 tests) | `plugins/handrail/{committer,tool}.ts` | — |
| D7 | parity handrail 12/12; `apps/bench/produce-handrail.bench.ts` | handrail Playwright; `plugins/ceiling/{store,handlers,producer,committer,tool}.ts` (paired) | **Handrail done; Ceiling started** |
| D8 | parity ceiling 8/8; `tests/integration/all-12-elements.spec.ts` | ceiling Playwright; bench reports for all 3 | **Ceiling done. 12 elements complete.** |

---

### S15 — Renderer hardening: post-FX under scheduler (Weeks 29–30, M8)

**Joint goal**: bloom, TRAA, SSGI all driven by `FrameScheduler` with idle-continuation budget; idle CPU < 2% confirmed with full post-FX active; orbit fps > 55 with post-FX. Renderer is "production shape".

#### D1 — Kickoff (30 min)

- B presents `code-level ADR docs/02-decisions/adrs/0014-traa-ssgi-idle-budget.md` draft (idle-continuation N-frame budget per pass: TRAA = 16 frames, SSGI = 32 frames, bloom = 0 — bloom is one-shot).
- A presents `apps/bench/load-medium.ts` skeleton — full-fixture cold-load bench will be tuned in 1D.

#### D2–D8 parallel work

| Day | Agent A (Track A — load-medium bench + headless prep) | Agent B (Track B — post-FX implementation) |
|---|---|---|
| D2 | Build `tests/fixtures/medium-project.pryzm-stub.json` — 500 walls × 5 levels. Wire `apps/bench/load-medium.ts`; baseline before tier-streaming (target full < 4 s, first interactive < 1.5 s — full target hit in S23). | Implement `packages/renderer/passes/Bloom.ts` — single-pass, no idle accumulation. Wire to scheduler. |
| D3 | Headless package design — what surface does `@pryzm/headless` expose? `code-level ADR docs/02-decisions/adrs/0017-headless-package-surface.md` draft. | Implement `packages/renderer/passes/TRAA.ts` — temporal reprojection. Wire to scheduler with idle-continuation. |
| D4 | Mock headless test in `apps/headless/__tests__/skeleton.test.ts` — runs `command-bus` + `geometry-kernel` + `persistence-client (in-memory)` in Node. Validates kernel-purity claim. | Implement `packages/renderer/passes/SSGI.ts` — screen-space global illumination. Wire to scheduler. |
| D5 | **Mid-sprint sync (1 h)** — A confirms scheduler API supports per-pass priorities; B confirms idle-continuation budget composable across multiple passes. | Implement `packages/renderer/IdleAccumulator.ts` — bounded N-frame budget across multiple accumulation passes; respects `code-level ADR docs/02-decisions/adrs/0014-traa-ssgi-idle-budget.md` budgets. |
| D6 | Stand up `apps/headless/index.ts` skeleton — Node entry; wires packages; CLI not yet. | Wire bench `apps/bench/idle-cpu.ts` re-run with full post-FX active — must still hit < 2% on idle. |
| D7 | Headless DSL: `pryzm-cli new-project` and `pryzm-cli add-wall` design. | Wire bench `apps/bench/orbit-fps.ts` re-run with full post-FX — must still hit > 55 fps p95. |
| D8 | `apps/bench/load-medium.ts` first numbers committed in `baseline.json`. | Bench `apps/bench/render-pass-cost.ts` — per-pass cost breakdown. Visual-diff test vs PRYZM 1 reference renders. |

#### D9 — Sprint demo + retro

- B demos: scene with bloom + TRAA + SSGI; idle CPU still < 2% in DevTools; orbit > 55 fps; per-pass OTel breakdown.
- A demos: medium-fixture bench numbers (pre-streaming baseline); headless skeleton runs in Node.
- Retro: `code-level ADR docs/02-decisions/adrs/0014-traa-ssgi-idle-budget.md` budgets right? TRAA jitter visible?

#### S15 exit criteria — extra (per `phases/PHASES-UPDATE-PLAN-2026-04-27.md §3.4`)

- [ ] OTel coverage lint passes per P8 (`[strategic ADR-007]`) for all post-FX passes added (TRAA, SSGI, bloom).
- [ ] Renderer-side property tests for accumulation determinism green per `[strategic ADR-020]` (idle-continuation pass produces identical Float32Array across two runs from the same seed).
- [ ] Property/types: any new render-pass schema landed in `packages/types-schema/` is complete per SPEC-05 §1.2 (n/a for purely runtime passes).

#### S15 exit criteria

- [ ] Post-FX visually correct (visual-diff vs PRYZM 1 reference; tolerance documented).
- [ ] Idle CPU < 2% with full post-FX active (CI gate).
- [ ] Orbit fps > 55 p95 with full post-FX (CI gate).
- [ ] Per-pass OTel spans (`pryzm.render.bloom`, `pryzm.render.traa`, `pryzm.render.ssgi`) in Honeycomb.
- [ ] `code-level ADR docs/02-decisions/adrs/0014-traa-ssgi-idle-budget.md` merged.

**K1A-1-revisit**: idle-CPU gate held under post-FX. If not, this is the hardening sprint to fix it before 1D.

#### S15 typed contracts introduced

```ts
// packages/renderer/passes/types.ts — RenderPass interface (frozen S15 D1)
export interface RenderPass {
  readonly id: string;                                       // 'bloom' | 'traa' | 'ssgi' | ...
  readonly priority: TickPriority;                           // 'render' | 'post-render' (1A S03)
  readonly idleBudgetFrames: number;                         // 0 = one-shot; >0 = N-frame accumulation per `code-level ADR docs/02-decisions/adrs/0014-traa-ssgi-idle-budget.md`
  setup(ctx: RenderContext): void;
  // Returns true when pass output is fully converged (idle-continuation can stop calling).
  render(ctx: RenderContext, dt: number, frameIndex: number): boolean;
  resize(width: number, height: number): void;
  dispose(): void;
}

// packages/renderer/passes/Bloom.ts — single-shot
export class BloomPass implements RenderPass {
  readonly id = 'bloom';
  readonly priority: TickPriority = 'post-render';
  readonly idleBudgetFrames = 0;                              // one-shot; render returns true immediately
  // Implementation: HDR threshold → mip-down chain → mip-up combine → composite.
}

// packages/renderer/passes/TRAA.ts — temporal reprojection accumulation
export class TRAAPass implements RenderPass {
  readonly id = 'traa';
  readonly priority: TickPriority = 'post-render';
  readonly idleBudgetFrames = 16;                             // converges in 16 frames per `code-level ADR docs/02-decisions/adrs/0014-traa-ssgi-idle-budget.md`
  // Implementation: per-frame jittered camera; reproject prev frame; reject by motion vector + depth.
}

// packages/renderer/passes/SSGI.ts — screen-space global illumination
export class SSGIPass implements RenderPass {
  readonly id = 'ssgi';
  readonly priority: TickPriority = 'render';                 // before post-FX composite
  readonly idleBudgetFrames = 32;                             // converges in 32 frames per `code-level ADR docs/02-decisions/adrs/0014-traa-ssgi-idle-budget.md`
  // Implementation: hi-Z trace; cosine-weighted sample; temporal accumulation reusing TRAA's history buffer.
}

// packages/renderer/IdleAccumulator.ts — orchestrates multi-pass idle continuation
export class IdleAccumulator {
  // Tracks per-pass `framesSinceMotion` and stops calling `render()` once `idleBudgetFrames` reached
  // OR pass.render() returns true. Composable with FrameScheduler's idle-continuation (1A S03).
  registerPass(pass: RenderPass): void;
  onMotionStart(): void;                                       // resets all per-pass counters
  onIdleTick(frameIndex: number): { passesRendered: string[]; allConverged: boolean };
}
```

#### S15 key pseudocode — IdleAccumulator orchestration (the "post-FX without melting CPU" trick)

The hardest part of S15 is keeping idle CPU < 2% while TRAA converges over 16 frames AND SSGI converges over 32 frames AND bloom is one-shot. Naïve: render every pass every frame for 32 frames after motion stops → idle CPU spikes to ~12%. Correct: per-pass convergence tracking, with each pass voting "I'm done" and being skipped on subsequent frames.

```ts
// packages/renderer/IdleAccumulator.ts — D5 paired-session deliverable
class IdleAccumulator {
  private framesSinceMotion = 0;
  private passConvergence = new Map<string, { framesRendered: number; converged: boolean }>();

  onMotionStart(): void {
    this.framesSinceMotion = 0;
    for (const [, state] of this.passConvergence) { state.framesRendered = 0; state.converged = false; }
  }

  onIdleTick(frameIndex: number): { passesRendered: string[]; allConverged: boolean } {
    this.framesSinceMotion++;
    const rendered: string[] = [];
    let allConverged = true;

    for (const pass of this.passes) {
      const state = this.passConvergence.get(pass.id)!;
      if (state.converged) continue;                                    // skip — frame budget for this pass exhausted
      if (state.framesRendered >= pass.idleBudgetFrames && pass.idleBudgetFrames > 0) {
        state.converged = true;                                         // budget reached
        continue;
      }
      const passConverged = pass.render(this.ctx, this.dt, frameIndex);
      state.framesRendered++;
      if (passConverged) state.converged = true;
      rendered.push(pass.id);
      if (!state.converged) allConverged = false;
    }

    if (allConverged) this.scheduler.stopIdleContinuation();             // wakes the loop only on next motion
    return { passesRendered: rendered, allConverged };
  }
}
```

#### S15 test catalog (Vitest + Playwright + visual diff, 24 tests planned)

| Test file | Tests | Owner |
|---|---|---|
| `packages/renderer/passes/__tests__/Bloom.test.ts` | `setup creates render targets`, `render returns true (one-shot)`, `dispose releases textures` | B |
| `packages/renderer/passes/__tests__/TRAA.test.ts` | `convergence within 16 frames`, `motion vector rejection: moving sphere not ghosted`, `disocclusion handling: revealed pixel uses spatial fallback` | B |
| `packages/renderer/passes/__tests__/SSGI.test.ts` | `convergence within 32 frames`, `dark cavity gets occlusion`, `light wall gets indirect bounce` | B |
| `packages/renderer/__tests__/IdleAccumulator.test.ts` | `motion-start resets all passes`, `pass marked converged is skipped`, `all-converged stops idle-continuation`, `mixed budgets (16+32+0) compose correctly` | B |
| `tests/visual-diff/post-fx/{bloom,traa,ssgi}-vs-pryzm1.spec.ts` | per-pass visual diff vs PRYZM 1 reference; tolerance documented per pass (bloom < 2 ΔE; TRAA < 1 ΔE p99 after convergence; SSGI < 3 ΔE due to inherent stochastic noise) | B |
| `apps/bench/idle-cpu.bench.ts` (re-run with full post-FX) | `idle CPU < 2% with bloom+TRAA+SSGI active` (CI gate) | B |
| `apps/bench/orbit-fps.bench.ts` (re-run with post-FX) | `100-wall orbit > 55 fps p95 with full post-FX` | B |
| `apps/bench/render-pass-cost.bench.ts` | `bloom < 2 ms`, `TRAA < 3 ms`, `SSGI < 5 ms`, `total post-FX < 8 ms p95` | B |
| `apps/headless/__tests__/skeleton.test.ts` | `command-bus + geometry-kernel + persistence-client (in-mem) runs in Node`, `produces valid descriptor`, `no THREE/DOM imports leaked (assert via require.cache audit)` | A |

#### S15 OTel spans introduced

| Span name | Parent | Key attributes |
|---|---|---|
| `pryzm.render.pass` | `pryzm.frame.scheduler.tick` | `pass.id`, `pass.duration_ms`, `pass.priority`, `pass.idle_frame_index`, `pass.converged` |
| `pryzm.render.bloom` | `pryzm.render.pass` | `bloom.threshold`, `bloom.intensity`, `bloom.duration_ms` |
| `pryzm.render.traa` | `pryzm.render.pass` | `traa.frames_since_motion`, `traa.disocclusion_pixels`, `traa.duration_ms` |
| `pryzm.render.ssgi` | `pryzm.render.pass` | `ssgi.frames_since_motion`, `ssgi.samples_per_pixel`, `ssgi.duration_ms` |
| `pryzm.idle.accumulator.tick` | `pryzm.frame.scheduler.tick` | `idle.frames_since_motion`, `idle.passes_rendered.count`, `idle.all_converged` |

#### S15 daily artifact log

| Day | Files added | Files modified | Tests passing |
|---|---|---|---|
| D2 | `tests/fixtures/medium-project.pryzm-stub.json` (500 walls × 5 levels), `apps/bench/load-medium.ts`, `packages/renderer/passes/Bloom.ts` | `bootstrap.render.ts` registers BloomPass | `+Bloom (3/3)` |
| D3 | `packages/renderer/passes/TRAA.ts`, `code-level ADR docs/02-decisions/adrs/0017-headless-package-surface.md` draft (headless surface) | (none) | `+TRAA (3/3)` |
| D4 | `packages/renderer/passes/SSGI.ts`, `apps/headless/__tests__/skeleton.test.ts` | (none) | `+SSGI (3/3); +headless skeleton (3/3 — kernel-purity verified mock)` |
| D5 | `packages/renderer/IdleAccumulator.ts` (paired session) | `FrameScheduler.idleContinuation()` integration | `+IdleAccumulator (4/4)` |
| D6 | `apps/headless/index.ts` skeleton (Node entry) | `apps/bench/idle-cpu.ts` re-run wired | idle-CPU 1.7% ✓ |
| D7 | (CLI design doc `docs/04-reference/architecture-detail/cli-surface.md`) | `apps/bench/orbit-fps.ts` re-run wired | orbit 56 fps p95 ✓ |
| D8 | `apps/bench/render-pass-cost.bench.ts`, `apps/bench/reports/M8-S15-baseline.md` | (none) | post-FX per-pass cost: bloom 1.6ms, TRAA 2.4ms, SSGI 3.9ms, total 7.9ms ✓ |

---

### S16 — Selection / picking system (Weeks 31–32, M8)

**Joint goal**: click-to-select latency < 10 ms p95; selection store; selection events; visual highlight via committer; works across all 12 element families.

#### D1 — Kickoff (30 min)

- A presents `code-level ADR docs/02-decisions/adrs/0015-picking-strategy.md` draft (gpu-pick default, BVH-pick fallback) — F decides.
- B confirms `plugins/wall/selection-highlight.ts` (from S09) refactors cleanly into shared `packages/render-runtime/highlight.ts`.

#### D2–D8 parallel work

| Day | Agent A (Track A — picking + selection store) | Agent B (Track B — highlight refactor + bench) |
|---|---|---|
| D2 | Implement `packages/picking/gpu-pick.ts` — single-frame pick texture (`THREE.WebGLRenderTarget`); decode pixel → ElementId. (Lives outside committer because it's a kernel-side pure utility plus a render-side reader; both halves needed.) | Refactor `plugins/wall/selection-highlight.ts` into shared `packages/render-runtime/highlight.ts` — outline shader that any element committer can opt into. |
| D3 | Implement `packages/picking/bvh-pick.ts` — fallback when gpu-pick unavailable. Uses `three-mesh-bvh` for raycast. | Wire highlight into all 12 element committers. |
| D4 | Implement real `packages/stores/SelectionStore.ts` (replacing skeleton). `select(ids)`, `deselect(ids)`, `clear()`, `subscribe(diff => ...)`. | Implement multi-select (shift-click) + box-select skeleton (full UX in 2C). |
| D5 | **Mid-sprint sync (1 h)** — A and B verify pick → store → highlight latency end-to-end. | Same paired session. |
| D6 | Wire selection commands (`Select`, `Deselect`, `ClearSelection`) into command bus. | `apps/bench/picking-latency.ts` — measure click-to-select latency p95; target < 10 ms. |
| D7 | Selection persists in event log (so reload restores selection — minor but useful for collab in Phase 2D). | Cross-element selection test — clicking each of the 12 elements works correctly. |
| D8 | Documentation `docs/04-reference/architecture-detail/picking.md` + `docs/04-reference/architecture-detail/selection.md`. | Bench reports + visual-diff for selection highlight rendered consistently across all 12 elements. |

#### D9 — Sprint demo + retro

- A demos: click any element → selected; shift-click → multi-select; OTel trace `pryzm.picking.pick` < 10 ms.
- B demos: highlight visible on all 12 element types; box-select skeleton; bench < 10 ms p95.
- Retro.

#### S16 exit criteria — extra (per `phases/PHASES-UPDATE-PLAN-2026-04-27.md §3.4`)

- [ ] OTel coverage lint passes per P8 (`[strategic ADR-007]`) for `pick.gpu`, `pick.bvh`, and `pick.fallback` spans.
- [ ] Robustness property-tests for picking landed in `packages/geometry-kernel/__tests__/robustness/picking.spec.ts` green per `[strategic ADR-020]` (random-camera × random-mesh fixture; pick result deterministic across runs).

#### S16 exit criteria

- [ ] Click latency < 10 ms p95 (CI gate).
- [ ] Multi-select via shift-click works.
- [ ] Box-select skeleton in place (full UX deferred to 2C).
- [ ] OTel `pryzm.picking.pick` span visible.
- [ ] Selection works across all 12 element families.
- [ ] `code-level ADR docs/02-decisions/adrs/0015-picking-strategy.md` merged.

#### S16 typed contracts introduced

```ts
// packages/picking/types.ts — frozen S16 D1
export interface PickResult {
  readonly elementId: ElementId;                  // typed-ID brand from `code-level ADR docs/02-decisions/adrs/0001-typed-id-brand.md`
  readonly elementKind: ElementKind;              // 'wall' | 'door' | ... 12 elements
  readonly hitPoint: Point3D;                     // world-space
  readonly distance: number;                      // camera → hit; for ordering disambig (gpu-pick = depth, BVH = ray-t)
  readonly faceIndex?: number;                    // optional; populated by BVH; gpu-pick can derive from MRT
}

export interface PickStrategy {
  readonly id: 'gpu-pick' | 'bvh-pick';
  readonly available: boolean;                    // gpu-pick may be false on Linux WebGL2 driver per R1C-02
  pick(screenPoint: Point2D, ctx: PickContext): PickResult | null;
  pickRect(screenRect: Rect2D, ctx: PickContext): readonly PickResult[];   // box-select skeleton
}

// packages/picking/gpu-pick.ts — S16-T1
export class GpuPickStrategy implements PickStrategy {
  readonly id = 'gpu-pick';
  // Render to dedicated WebGLRenderTarget with element-id encoded as RGBA pixel.
  // Single-frame: re-render scene with PickMaterial (stable across passes); read pixel; decode.
  // Cost: ~1 ms re-render + 1 ms readback (sync); ~0.5 ms with async readPixels (PBO equivalent).
}

// packages/picking/bvh-pick.ts — S16-T2 (fallback)
export class BvhPickStrategy implements PickStrategy {
  readonly id = 'bvh-pick';
  // Uses three-mesh-bvh (MIT). Per-element BVH built lazily; cached by descriptor.hash.
  // Cost: ~3-8 ms for 1000-element scene; degrades with vertex count.
}

// packages/stores/SelectionStore.ts — real impl, replaces 1B S07 skeleton
export interface SelectionEntry {
  readonly id: ElementId;
  readonly kind: ElementKind;
  readonly selectedAt: number;                    // ULID-encoded ts; for "clear all but oldest" semantics later
}

export class SelectionStore extends Store<SelectionEntry> {
  select(ids: readonly ElementId[]): void;
  deselect(ids: readonly ElementId[]): void;
  clear(): void;
  isSelected(id: ElementId): boolean;
  // Patches & dirty-diff via base Store class — committers subscribe via subscribeDirty.
}

// plugins/selection/handlers/{Select,Deselect,ClearSelection}.ts — S16-T6
export interface SelectCommand extends Command {
  readonly type: 'selection.select';
  readonly payload: { readonly ids: readonly ElementId[]; readonly mode: 'replace' | 'add' | 'toggle' };
}
// affectedStores: ['selection']
// Marked ephemeral=true so persistence skips them from snapshot delta (R1C-07 mitigation)

// packages/render-runtime/highlight.ts — S16-T1 (extracted from plugins/wall/selection-highlight.ts S09)
export interface HighlightOptions {
  readonly color: string;
  readonly width: number;                          // pixels
  readonly style: 'solid' | 'dashed';
}
export function attachHighlight(committer: PrimitiveCommitter<any>, opts: HighlightOptions): Unsubscribe;
// Any element committer opts in by calling attachHighlight(myCommitter, {...}) at registration.
```

#### S16 key pseudocode — gpu-pick render-to-id-target + BVH fallback decision tree

```ts
// packages/picking/PickStrategyResolver.ts — S16-T1 boot-time resolution
export function resolvePickStrategy(renderer: THREE.WebGLRenderer, ctx: PickContext): PickStrategy {
  const gpu = new GpuPickStrategy(renderer, ctx);
  const probe = gpu.probeAvailability();           // tries to render 1×1 RGBA8 RT; reads pixel; checks driver quirks
  if (probe.ok) return gpu;
  ctx.otel.addEvent('pryzm.picking.gpu-pick.unavailable', { reason: probe.reason });
  return new BvhPickStrategy(ctx);                 // R1C-02 fallback path
}

// packages/picking/gpu-pick.ts — single-frame pick render
pick(screenPoint: Point2D, ctx: PickContext): PickResult | null {
  const span = ctx.otel.startSpan('pryzm.picking.pick');
  span.setAttribute('strategy', 'gpu-pick');
  this.renderer.setRenderTarget(this.pickRT);
  this.scene.overrideMaterial = this.pickMaterial;            // encodes elementId → RGBA per object
  this.renderer.render(this.scene, this.camera);
  this.scene.overrideMaterial = null;
  this.renderer.readRenderTargetPixels(this.pickRT, screenPoint.x, screenPoint.y, 1, 1, this.pixelBuffer);
  this.renderer.setRenderTarget(null);
  const elementId = decodeRGBAToElementId(this.pixelBuffer);
  span.setAttribute('result.found', elementId !== null);
  span.setAttribute('duration_ms', performance.now() - span.startTime);
  span.end();
  if (elementId === null) return null;
  return { elementId, elementKind: ctx.elementRegistry.kindOf(elementId), hitPoint: this.unprojectScreenToWorld(screenPoint, ctx), distance: this.depthAt(screenPoint) };
}
```

#### S16 test catalog (Vitest + Playwright + visual diff, 22 tests planned)

| Test file | Tests | Owner |
|---|---|---|
| `packages/picking/__tests__/gpu-pick.test.ts` | `pick at center hits sphere`, `pick at empty space returns null`, `pick respects depth ordering (front-most wins)`, `pickRect returns all elements in rect` | A |
| `packages/picking/__tests__/bvh-pick.test.ts` | same 4 tests with BVH backend; plus `BVH cache invalidation on descriptor.hash change` | A |
| `packages/picking/__tests__/PickStrategyResolver.test.ts` | `resolves gpu-pick when probe ok`, `falls back to BVH when probe fails`, `OTel event emitted on fallback` | A |
| `packages/stores/__tests__/SelectionStore.test.ts` | `select replaces selection`, `select(mode='add') adds`, `select(mode='toggle') toggles`, `clear empties selection`, `subscribeDirty fires on add/remove` | A |
| `plugins/selection/__tests__/handlers/{Select,Deselect,ClearSelection}.test.ts` | one happy + one error per handler (6 tests) | A |
| `packages/render-runtime/__tests__/highlight.test.ts` | `attachHighlight wires selection store to outline mesh`, `unsubscribe disposes outline`, `outline visible across all 12 element kinds` (visual diff) | B |
| `apps/bench/picking-latency.bench.ts` | `gpu-pick < 10 ms p95 in 1000-element scene` (CI gate); `BVH-pick < 12 ms p95` | B |
| `tests/integration/cross-element-selection.spec.ts` | clicking each of 12 element kinds selects correctly (12 tests) | A+B |

#### S16 OTel spans introduced

| Span name | Parent | Key attributes |
|---|---|---|
| `pryzm.picking.pick` | (root user-action) | `strategy` (`'gpu-pick'`/`'bvh-pick'`), `screen.x`, `screen.y`, `result.found`, `result.elementKind?`, `duration_ms` |
| `pryzm.picking.pickRect` | (root user-action) | `strategy`, `rect.{x,y,w,h}`, `result.count`, `duration_ms` |
| `pryzm.picking.bvh.build` | (ambient) | `element.id`, `vertices`, `build.duration_ms` |
| `pryzm.selection.diff` | `pryzm.command.execute` | `selection.added`, `selection.removed`, `selection.total_after` |

#### S16 Span events

| Event | Span | When |
|---|---|---|
| `pryzm.picking.gpu-pick.unavailable` | `pryzm.picking.pick` (boot) | gpu-pick probe failure → BVH fallback |
| `pryzm.picking.bvh.cache.invalidated` | `pryzm.picking.pick` | element descriptor.hash change → BVH rebuild needed |

#### S16 daily artifact log

| Day | Files added | Files modified | Tests passing |
|---|---|---|---|
| D2 | `packages/picking/{types.ts,gpu-pick.ts,PickStrategyResolver.ts}`, `packages/render-runtime/highlight.ts` | `plugins/wall/selection-highlight.ts` (extract → re-export shim) | `+gpu-pick (4/4); +highlight extract (3/3)` |
| D3 | `packages/picking/bvh-pick.ts` | all 12 plugin committers call `attachHighlight()` | `+bvh-pick (5/5)` |
| D4 | `packages/stores/SelectionStore.ts` (real impl) | `bootstrap.render.ts` registers SelectionStore | `+SelectionStore (5/5); +box-select skeleton` |
| D5 | (joint paired session — end-to-end pick→store→highlight latency trace) | (none) | E2E < 10 ms verified |
| D6 | `plugins/selection/handlers/{Select,Deselect,ClearSelection}.ts` | (none) | `+selection handlers (6/6)` |
| D7 | (selection ephemeral-flag wiring in persistence) | `packages/persistence-client/PatchEmitter.ts` (skip ephemeral on snapshot) | (no new tests; existing pass) |
| D8 | `docs/04-reference/architecture-detail/{picking,selection}.md`; `apps/bench/picking-latency.bench.ts` | (none) | bench p95 = 7.8ms ✓; cross-element 12/12 ✓ |

---

### S17 — Camera + viewport + multi-view foundation (Weeks 33–34, M9)

**Joint goal**: `packages/view-state/` defines view definitions, view registry, view switching via commands; one canonical 3D view (plan + section come in 2A/2B); views persist via S04 event log.

#### D1 — Kickoff (30 min)

- A presents `code-level ADR docs/02-decisions/adrs/0016-view-state-command-driven.md` draft (view state as command-driven; views are first-class citizens in the event log).
- B sketches camera-controller refactor — current camera lives in renderer; needs to read from `ActiveViewStore`.

#### D2–D8 parallel work

| Day | Agent A (Track A — view state + active view store) | Agent B (Track B — camera controller refactor + benches) |
|---|---|---|
| D2 | Implement `packages/view-state/ViewDefinition.ts` — Zod schema for a view (camera pose, render mode, level filter, etc.). | Refactor `packages/renderer/CameraController.ts` to read from `ActiveViewStore` — when active view changes, camera animates to new pose. |
| D3 | Implement `packages/view-state/ViewRegistry.ts` — registry keyed by view-id; CRUD via commands. | Implement camera animation (smooth interp between poses, scheduler-driven). |
| D4 | Implement `packages/stores/ActiveViewStore.ts` — current view-id, current tool. | Wire view switching tests — `SwitchView` command updates `ActiveViewStore` updates camera. |
| D5 | **Mid-sprint sync (1 h)** — paired session: end-to-end view switching test. | Same paired session — confirm camera doesn't fight the scheduler when animating. |
| D6 | Implement commands `CreateView`, `DeleteView`, `RenameView`, `SwitchView` in `plugins/view/handlers/`. | Bench `apps/bench/view-switch.ts` — target < 200 ms for view switch (camera animation + scene re-prep). |
| D7 | Default views factory (`Default3DView`, `LevelOverview`, etc.). | Render-mode switching (e.g. wireframe vs shaded) per-view. |
| D8 | Documentation `docs/04-reference/architecture-detail/view-state.md`. | Documentation `docs/04-reference/architecture-detail/camera.md`. |

#### D9 — Sprint demo + retro

- A demos: create 3 views, switch between them via command; views persist across reload.
- B demos: camera animates smoothly; OTel `pryzm.view.switch` span; bench < 200 ms.
- Retro: is the view-state shape ready for plan/section in 2A/2B?

#### S17 exit criteria — extra (per `phases/PHASES-UPDATE-PLAN-2026-04-27.md §3.4`)

- [ ] `View` schema complete in `packages/view-state/ViewDefinition.ts` (Zod) — treated as a SPEC-05-style typed entity per SPEC-05 §1.2 conventions.
- [ ] OTel coverage lint passes per P8 (`[strategic ADR-007]`) for `view.switch`, `view.create`, `view.delete`.

#### S17 exit criteria

- [ ] Switching views via command updates camera and re-renders.
- [ ] Views persist via S04 event log.
- [ ] OTel `pryzm.view.switch` span < 200 ms p95.
- [ ] `code-level ADR docs/02-decisions/adrs/0016-view-state-command-driven.md` merged.

#### S17 typed contracts introduced

```ts
// packages/view-state/ViewDefinition.ts — Zod schema; `code-level ADR docs/02-decisions/adrs/0016-view-state-command-driven.md` frozen
export const ViewDefinitionSchema = z.object({
  id: z.string().brand<'ViewId'>(),
  name: z.string(),
  kind: z.enum(['3d-perspective', '3d-orthographic']),     // 'plan' / 'section' land in 2A/2B
  camera: z.object({
    position: Point3DSchema,
    target: Point3DSchema,
    up: Point3DSchema,
    fovDeg: z.number().min(10).max(120).optional(),         // perspective only
    orthoSize: z.number().positive().optional(),            // ortho only
  }),
  renderMode: z.enum(['shaded', 'wireframe', 'shaded-with-edges']),
  levelFilter: z.array(z.string().brand<'LevelId'>()).nullable(),  // null = all levels
  elementKindFilter: z.array(z.string()).nullable(),
});
export type ViewDefinition = z.infer<typeof ViewDefinitionSchema>;

// packages/view-state/ViewRegistry.ts — registry keyed by view-id; CRUD via commands
export class ViewRegistry extends Store<ViewDefinition> {
  // Standard Store CRUD; registered as a Store so it benefits from event log + persistence.
  defaults(): readonly ViewDefinition[];                    // Default3DView + LevelOverview etc. (S17 D7)
}

// packages/stores/ActiveViewStore.ts — single-entity store
export interface ActiveViewState {
  readonly activeViewId: ViewId;
  readonly activeToolId: ToolId | null;
}
export class ActiveViewStore extends SingletonStore<ActiveViewState> { /* ... */ }

// packages/view-state/ViewController.ts — orchestrates view-switch animation under scheduler
export class ViewController {
  switchTo(viewId: ViewId): Promise<void>;                  // resolves when camera animation completes
  // Animates camera over `transitionDurationMs` (default 400ms; eased cubic in-out).
  // Driven by FrameScheduler with `priority: 'interaction'` to avoid post-FX contention (per S15 IdleAccumulator interplay).
}

// plugins/view/handlers/{CreateView,DeleteView,RenameView,SwitchView,UpdateViewCamera}.ts
export interface SwitchViewCommand extends Command {
  readonly type: 'view.switch';
  readonly payload: { readonly viewId: ViewId };
}
// affectedStores: ['active-view']
//   View switching is itself a command → persisted to event log → reload restores active view.
```

#### S17 key pseudocode — view switch with scheduler-driven camera animation

The view switch must (a) animate the camera smoothly, (b) not fight the IdleAccumulator (S15) which would re-converge TRAA/SSGI mid-animation and cause shimmer, and (c) emit a single `pryzm.view.switch` span covering the whole transition. The trick is to mark the scheduler in `motion` state for the entire transition duration, suppressing idle-continuation, then release at the end so post-FX converges on the final pose.

```ts
// packages/view-state/ViewController.ts — switchTo implementation
async switchTo(viewId: ViewId): Promise<void> {
  const span = this.otel.startSpan('pryzm.view.switch');
  span.setAttribute('view.from', this.activeViewStore.get().activeViewId);
  span.setAttribute('view.to', viewId);
  const target = this.viewRegistry.get(viewId);
  if (!target) throw new ViewNotFoundError(viewId);

  this.scheduler.beginMotion();                                 // suppresses idle-continuation
  const startCam = this.cameraController.snapshot();
  const startTime = performance.now();
  const duration = this.transitionDurationMs;

  return new Promise<void>((resolve) => {
    const tickId = this.scheduler.addTickListener('pre-render', () => {
      const t = Math.min(1, (performance.now() - startTime) / duration);
      const eased = easeCubicInOut(t);
      this.cameraController.applyPose(lerpPose(startCam, target.camera, eased));
      this.scheduler.markDirty('view-switch');                  // ensures frame renders
      if (t >= 1) {
        this.scheduler.removeTickListener(tickId);
        this.activeViewStore.set({ activeViewId: viewId, activeToolId: this.activeViewStore.get().activeToolId });
        this.scheduler.endMotion();                             // re-enables idle-continuation → TRAA/SSGI converge
        span.setAttribute('view.switch.duration_ms', performance.now() - startTime);
        span.end();
        resolve();
      }
    });
  });
}
```

#### S17 test catalog (Vitest + Playwright, 18 tests planned)

| Test file | Tests | Owner |
|---|---|---|
| `packages/view-state/__tests__/ViewDefinition.test.ts` | `Zod schema accepts valid 3D-perspective`, `rejects negative fov`, `rejects ortho without orthoSize` | A |
| `packages/view-state/__tests__/ViewRegistry.test.ts` | `defaults() returns Default3DView + LevelOverview`, `CRUD via commands works`, `subscribeDirty fires on add/remove/rename` | A |
| `packages/stores/__tests__/ActiveViewStore.test.ts` | `set updates state and notifies`, `persists across reload via event log` | A |
| `packages/view-state/__tests__/ViewController.test.ts` | `switchTo resolves when transition complete`, `motion suppression prevents IdleAccumulator firing mid-transition (mock scheduler)`, `OTel span covers full transition` | A |
| `plugins/view/__tests__/handlers/{CreateView,DeleteView,RenameView,SwitchView,UpdateViewCamera}.test.ts` | one happy + one error per handler (10 tests) | A |
| `plugins/view/__tests__/playwright/integration.spec.ts` | `create 3 views, switch sequentially`, `views persist across reload`, `wireframe vs shaded view-mode toggle changes render` | B |
| `apps/bench/view-switch.bench.ts` | `view-switch p95 < 200 ms` (CI gate); `IdleAccumulator does NOT fire during transition (assert via OTel)` | B |
| `tests/integration/view-state-2a-readiness.test.ts` | (forward-looking smoke) `ViewDefinition schema accepts a hypothetical `kind: 'plan'` extension via discriminated extension pattern` | A |

#### S17 OTel spans introduced

| Span name | Parent | Key attributes |
|---|---|---|
| `pryzm.view.switch` | (root user-action or `pryzm.command.execute`) | `view.from`, `view.to`, `view.switch.duration_ms`, `transition.eased` |
| `pryzm.view.cameraAnimation.tick` | `pryzm.view.switch` | `t` (0..1), `tick.index`, `pose.{x,y,z}` (camera position) | DEV-only sampling 1/10 |
| `pryzm.view.create` / `.delete` / `.rename` | `pryzm.command.execute` | `view.id`, `view.name`, `view.kind` |

#### S17 daily artifact log

| Day | Files added | Files modified | Tests passing |
|---|---|---|---|
| D2 | `packages/view-state/ViewDefinition.ts`, `code-level ADR docs/02-decisions/adrs/0016-view-state-command-driven.md` draft | `packages/renderer/CameraController.ts` reads ActiveViewStore | `+ViewDefinition (3/3)` |
| D3 | `packages/view-state/ViewRegistry.ts`; `packages/view-state/ViewController.ts` (animation impl) | (none) | `+ViewRegistry (3/3); +animation (mocked) (3/3)` |
| D4 | `packages/stores/ActiveViewStore.ts`; integration tests `view-state/integration/switch.test.ts` | `bootstrap.render.ts` registers ActiveViewStore + ViewRegistry | `+ActiveViewStore (2/2); +switch e2e (1/1)` |
| D5 | (joint paired session — confirm camera doesn't fight scheduler) | `IdleAccumulator.onMotionStart()` gets called by `scheduler.beginMotion()` | (no merge) |
| D6 | `plugins/view/handlers/{CreateView,DeleteView,RenameView,SwitchView,UpdateViewCamera}.ts` | `bootstrap.render.ts` registers view plugin | `+5 handler suites (10/10)` |
| D7 | `packages/view-state/defaults.ts` (Default3DView + LevelOverview); render-mode wireframe support | `MaterialPool` adds wireframe variant | `+defaults (1/1); +render-mode (1/1)` |
| D8 | `apps/bench/view-switch.bench.ts`; `docs/04-reference/architecture-detail/{view-state,camera}.md` | (none) | bench p95=156ms ✓ |

---

### S18 — `@pryzm/headless` alpha + kernel-purity verified (Weeks 35–36, M9)

**Joint goal**: `apps/headless` builds; CLI `pryzm-cli` runs in Node and produces a `wall + slab` project end-to-end; **K1-B kernel-purity pivot test confirmed via real headless run** (not just lint). Sub-phase 1C closes.

#### D1 — Kickoff (30 min)

- A presents `code-level ADR docs/02-decisions/adrs/0017-headless-package-surface.md` (headless package surface). F decides minimal CLI: `new-project`, `add-wall`, `add-slab`, `export-pryzm`.
- B confirms `apps/bench/load-medium.ts` baseline updated with all S15+ improvements.

#### D2–D8 parallel work

| Day | Agent A (Track A — headless impl) | Agent B (Track B — bench dashboard + integration prep) |
|---|---|---|
| D2 | Implement `apps/headless/index.ts` — Node entry; loads `@pryzm/protocol`, `@pryzm/command-bus`, `@pryzm/stores`, `@pryzm/geometry-kernel`, `@pryzm/persistence-client (in-memory)`. | Stand up bench dashboard at `apps/bench/dashboard/` — single-page summary of all 1A-1C bench numbers vs targets. |
| D3 | Implement CLI subcommand `pryzm-cli new-project <name>` — creates empty project, persists to in-memory store. | Wire 1B Wall + 1B Slab + 1B Door benches into dashboard. |
| D4 | Implement CLI subcommand `pryzm-cli add-wall <project> --x1 <n> --y1 <n> --x2 <n> --y2 <n> --height <n>`. | Wire 1C Stair + Handrail + Ceiling benches into dashboard. |
| D5 | **Mid-sprint sync (1 h)** — A walks B through CLI usage; B confirms dashboard reads `apps/bench/reports/` correctly. | Same paired session. |
| D6 | Implement CLI subcommand `pryzm-cli add-slab <project> --level <id> --bbox <x,y,z,x,y,z>`. | Wire selection / picking / view bench numbers into dashboard. |
| D7 | Implement CLI subcommand `pryzm-cli export-pryzm <project> -o <path>` — writes `.pryzm`-stub file (full v1 format lands S20). | Bench dashboard publishes a static HTML at `docs/bench/dashboard.html` — committed per sprint. |
| D8 | `apps/headless/__tests__/headless-node.test.ts` — runs full pipeline: new project + add wall + add slab + export. **Validates K1-B**. | Verify all 12 element families have bench coverage in dashboard. |

#### D9 — **Sub-phase 1C demo recording** (joint, 6-min screencast)

- Open terminal: `pryzm-cli new-project demo` → produces empty project.
- `pryzm-cli add-wall demo --x1 0 --y1 0 --x2 5 --y2 0 --height 3` → wall added.
- `pryzm-cli add-slab demo --level L1 --bbox 0,0,0,10,10,0` → slab added.
- `pryzm-cli export-pryzm demo -o demo.pryzm-stub` → file written.
- Open browser → `?pryzm2=1&open=demo.pryzm-stub` → wall + slab render correctly.
- Open bench dashboard → all 1A-1C numbers green.
- Switch to OTel: trace shows headless run produced same producer outputs as browser.

#### D10 — Sub-phase 1C retro

- K1-B verification: did headless test run? Were any THREE / DOM leaks revealed?
- Backlog 1C → 1D handoff items.

#### S18 exit criteria — extra (per `phases/PHASES-UPDATE-PLAN-2026-04-27.md §3.4`)

- [ ] Type catalog hardening complete per §1.x: all 8 system family schemas in `packages/types-schema/`; built-in catalog populated to M36 ship-with-product list per SPEC-05 §7; type-completeness lint PR-blocking.
- [ ] OTel coverage lint passes per P8 (`[strategic ADR-007]`) for the headless package's CLI spans.
- [ ] Headless determinism: same `.pryzm` input → byte-identical Float32Array geometry across two `@pryzm/headless` runs (per `[strategic ADR-020]`).

#### S18 exit criteria (= sub-phase 1C exit)

- [ ] `node apps/headless/dist/cli.js new-project foo && pryzm-cli add-wall foo --x1 0 --y1 0 --x2 5 --y2 0 && pryzm-cli add-slab foo --level L1 --bbox 0,0,0,10,10,0 && pryzm-cli export-pryzm foo` produces a valid `.pryzm`-stub file.
- [ ] Same `.pryzm`-stub file opens in `?pryzm2=1` browser session and renders identically.
- [ ] **K1-B confirmed**: kernel runs in Node end-to-end; lint claim verified mechanically.
- [ ] All 12 element families end-to-end with parity, picking, view-state.
- [ ] All 1A-1C bench targets green on dashboard.
- [ ] Renderer hardening complete: idle CPU < 2% + orbit > 55 fps with full post-FX.
- [ ] `code-level ADR docs/02-decisions/adrs/0017-headless-package-surface.md` merged.

#### S18 typed contracts introduced

```ts
// apps/headless/index.ts — Node entry; depends ONLY on kernel-pure packages
//   ALLOWED imports: @pryzm/protocol, @pryzm/command-bus, @pryzm/stores,
//                    @pryzm/geometry-kernel, @pryzm/persistence-client (in-memory adapter only),
//                    @pryzm/view-state, @pryzm/picking (BVH-only — no GpuPickStrategy import path),
//                    @pryzm/cascade
//   FORBIDDEN imports (CI-enforced via dependency-cruiser config in apps/headless/.dependency-cruiser.cjs):
//                    three, @pryzm/renderer, @pryzm/render-runtime, @pryzm/ui-vanilla,
//                    anything that touches `document` / `window` / `navigator`
import { CommandBus } from '@pryzm/command-bus';
import { GeometryKernel } from '@pryzm/geometry-kernel';
// ... etc.

// apps/headless/src/cli.ts — minimal CLI surface (S18-T2..T5)
export interface CliCommand<P> {
  readonly name: string;
  readonly description: string;
  readonly parse: (argv: readonly string[]) => P;       // pure parser; no fs / process
  readonly execute: (params: P, ctx: HeadlessContext) => Promise<CliResult>;
}
export interface HeadlessContext {
  readonly bus: CommandBus;
  readonly stores: StoreRegistry;
  readonly persistence: PersistenceClient;              // InMemoryPersistenceAdapter for CLI default
  readonly otel: OtelClient;
}
export interface CliResult {
  readonly ok: boolean;
  readonly artifactPath?: string;                        // for `export-pryzm`
  readonly summary: string;                              // human-readable line for stdout
}

// apps/headless/src/commands/{newProject,addWall,addSlab,exportPryzm}.ts — each ~80-120 LOC
export const newProjectCommand: CliCommand<{ name: string }>;
export const addWallCommand: CliCommand<{ project: string; x1: number; y1: number; x2: number; y2: number; height: number }>;
export const addSlabCommand: CliCommand<{ project: string; level: LevelId; bbox: readonly [number, number, number, number, number, number] }>;
export const exportPryzmCommand: CliCommand<{ project: string; output: string }>;

// apps/bench/dashboard/types.ts — S18-T6 dashboard data shape
export interface BenchEntry {
  readonly id: string;                                    // 'produce-wall.bench'
  readonly sprint: string;                                // 'S07'
  readonly metric: string;                                // 'p95_ms'
  readonly target: number;
  readonly latest: number;
  readonly status: 'green' | 'yellow' | 'red';
  readonly lastRun: string;                               // ISO8601
}
```

#### S18 key pseudocode — headless boot proves K1-B mechanically

The CI lint rule (1B S08, dependency-cruiser) is *necessary* for kernel purity but not *sufficient* — a transitive `import` from a runtime check (e.g. `if (typeof window !== 'undefined')`) wouldn't trip it but would fail in Node. S18 D8 closes the loop with a real Node run.

```ts
// apps/headless/__tests__/headless-node.test.ts — D8 K1-B verification
describe('K1-B kernel purity (mechanical verification)', () => {
  it('runs full new-project + add-wall + add-slab + export pipeline in Node without DOM/THREE', async () => {
    const span = otel.startSpan('pryzm.headless.boot');

    // 1. Construct headless context with strict adapter (throws on any THREE/DOM access via Proxy)
    const ctx = createHeadlessContext({
      persistence: new InMemoryPersistenceAdapter(),
      strictKernelMode: true,                              // enables `Reflect.has(global, 'document')` assertion: false
    });

    // 2. Run new-project → add-wall → add-slab → export-pryzm
    const r1 = await newProjectCommand.execute({ name: 'k1b-test' }, ctx);
    expect(r1.ok).toBe(true);
    const r2 = await addWallCommand.execute({ project: 'k1b-test', x1: 0, y1: 0, x2: 5, y2: 0, height: 3 }, ctx);
    expect(r2.ok).toBe(true);
    const r3 = await addSlabCommand.execute({ project: 'k1b-test', level: 'L1' as LevelId, bbox: [0, 0, 0, 10, 10, 0] }, ctx);
    expect(r3.ok).toBe(true);
    const r4 = await exportPryzmCommand.execute({ project: 'k1b-test', output: '/tmp/k1b-test.pryzm-stub' }, ctx);
    expect(r4.ok).toBe(true);

    // 3. Verify producer outputs are byte-identical to the browser run (use same descriptor.hash)
    const wallDesc = ctx.stores.wall.get('w1' as WallId);
    expect(wallDesc.descriptor.hash).toEqual(EXPECTED_HASHES.k1b_wall);   // captured from browser fixture
    const slabDesc = ctx.stores.slab.get('s1' as SlabId);
    expect(slabDesc.descriptor.hash).toEqual(EXPECTED_HASHES.k1b_slab);

    // 4. Audit require.cache: assert no THREE / DOM / GpuPickStrategy modules ever loaded
    const loaded = Array.from(Object.keys(require.cache));
    expect(loaded.find(p => /[/\\]node_modules[/\\]three[/\\]/.test(p))).toBeUndefined();
    expect(loaded.find(p => /@pryzm[/\\]renderer/.test(p))).toBeUndefined();
    expect(loaded.find(p => /@pryzm[/\\]render-runtime/.test(p))).toBeUndefined();

    span.setAttribute('headless.k1b.verified', true);
    span.end();
  });
});
```

#### S18 test catalog (Vitest + Playwright + integration, 16 tests planned)

| Test file | Tests | Owner |
|---|---|---|
| `apps/headless/__tests__/cli-parsers.test.ts` | argv parser tests for each of 4 CLI commands × 1 happy + 1 invalid (8 tests) | A |
| `apps/headless/__tests__/headless-node.test.ts` | **`K1-B verification` (above)**; `consecutive add-wall preserves event ordering`; `export-pryzm output reloads via persistence.parse()` | A |
| `apps/headless/__tests__/strict-mode.test.ts` | `strictKernelMode throws on simulated `document` access`; `OTel `pryzm.headless.boot` span emitted with k1b.verified attribute` | A |
| `apps/bench/dashboard/__tests__/{loader,renderer}.test.ts` | dashboard reads `apps/bench/reports/*.md` correctly; renders status badges; aggregates trend over last N runs | B |
| `tests/integration/headless-vs-browser-parity.spec.ts` | run same scenario via headless CLI and via Playwright in browser; assert byte-equal `.pryzm-stub` output | A+B |
| `apps/bench/dashboard/__tests__/coverage-audit.test.ts` | assert dashboard surfaces 1 entry per element family (12) + post-FX (3) + picking + view + idle + orbit (≥18 total) | B |

#### S18 OTel spans introduced

| Span name | Parent | Key attributes |
|---|---|---|
| `pryzm.headless.boot` | (root, headless run) | `headless.cli.command`, `headless.k1b.verified` (`true`/`false`), `headless.duration_ms`, `headless.strict_mode` |
| `pryzm.headless.cli.command` | `pryzm.headless.boot` | `cli.name`, `cli.argv.count`, `cli.duration_ms`, `cli.ok` |
| `pryzm.headless.export` | `pryzm.headless.cli.command` (when `cli.name='export-pryzm'`) | `export.bytes`, `export.elementCount`, `export.duration_ms` |

#### S18 daily artifact log

| Day | Files added | Files modified | Tests passing |
|---|---|---|---|
| D2 | `apps/headless/index.ts`, `apps/headless/src/cli.ts`, `apps/headless/.dependency-cruiser.cjs` | `package.json` adds `pryzm-cli` bin; `tsconfig.json` adds headless project ref | `+CLI scaffold (1/1)` |
| D3 | `apps/headless/src/commands/newProject.ts`; `apps/bench/dashboard/{index.html, src/loader.ts, src/render.ts}` | (none) | `+newProject (2/2); +dashboard loader (3/3)` |
| D4 | `apps/headless/src/commands/addWall.ts`; dashboard wires Wall + Slab + Door entries | (none) | `+addWall (2/2); dashboard 3 entries live` |
| D5 | (joint paired session — CLI walkthrough; dashboard validation) | (none) | (no merge) |
| D6 | `apps/headless/src/commands/addSlab.ts`; dashboard wires Stair + Handrail + Ceiling entries | (none) | `+addSlab (2/2); dashboard 6 entries live` |
| D7 | `apps/headless/src/commands/exportPryzm.ts`; `docs/bench/dashboard.html` first publish | (none) | `+exportPryzm (2/2); dashboard published` |
| D8 | **`apps/headless/__tests__/headless-node.test.ts` (K1-B test); `apps/headless/__tests__/strict-mode.test.ts`; `tests/integration/headless-vs-browser-parity.spec.ts`** | (none) | **K1-B verified ✓** |
| D9 | `docs/05-guides/developer/demos/M9-1C-headless.mp4` | (none) | demo recorded |
| D10 | `docs/03-execution/status/sprints/S18-retro.md`; `apps/bench/reports/M9-1C-baseline.md` | (none) | retro + baseline published |

---

## §3 Cross-cutting deliverables for 1C

### §3.1 ADRs merged by M9

| ID | Subject | Owner | Sprint |
|---|---|---|---|
| `code-level ADR docs/02-decisions/adrs/0014-traa-ssgi-idle-budget.md` | TRAA / SSGI idle-continuation budgets | B | S15 |
| `code-level ADR docs/02-decisions/adrs/0015-picking-strategy.md` | Picking strategy (gpu-pick + BVH fallback) | A | S16 |
| `code-level ADR docs/02-decisions/adrs/0016-view-state-command-driven.md` | View state command-driven model | A | S17 |
| `code-level ADR docs/02-decisions/adrs/0017-headless-package-surface.md` | Headless package surface | A | S18 |

### §3.2 CI gates added in 1C

| Gate | Hard-fail threshold | Sprint |
|---|---|---|
| Idle CPU bench (with post-FX) | > 2.5% | S15 |
| Orbit fps bench (with post-FX) | < 50 p95 | S15 |
| Picking latency bench | > 12 ms p95 | S16 |
| View switch bench | > 250 ms p95 | S17 |
| Headless CLI integration test | failure | S18 |
| Per-pass render cost bench | > 8 ms total post-FX | S15 |

### §3.3 Documentation produced

- `docs/04-reference/architecture-detail/element-coupling.md` (S14)
- `docs/04-reference/architecture-detail/picking.md` (S16)
- `docs/04-reference/architecture-detail/selection.md` (S16)
- `docs/04-reference/architecture-detail/view-state.md` (S17)
- `docs/04-reference/architecture-detail/camera.md` (S17)
- `docs/04-reference/architecture-detail/headless.md` (S18)
- `apps/bench/dashboard/README.md` (S18)
- `plugins/{stair,handrail,ceiling}/README.md` (S14)

---

## §4 Risk & contingency (1C-specific)

| ID | Risk | Likelihood | Impact | Mitigation | Trigger |
|---|---|---|---|---|---|
| R1C-01 | Idle CPU bench fails under post-FX (TRAA jitter, SSGI accumulation) | Medium | High | `code-level ADR docs/02-decisions/adrs/0014-traa-ssgi-idle-budget.md` budgets tunable; S15 D7 budget audit; fallback: reduce SSGI budget | S15 |
| R1C-02 | gpu-pick fragile on Linux WebGL2 | Medium | Medium | BVH fallback (`code-level ADR docs/02-decisions/adrs/0015-picking-strategy.md`); CI tests both | S16 |
| R1C-03 | Headless reveals kernel impurity | Low (we lint) | Critical | S15 D4 mock test; S18 D8 full integration; halt 1D entry if K1-B fires | S18 |
| R1C-04 | Stair-Handrail coupling pattern doesn't generalise | Low | Low | Pattern documented in `docs/04-reference/architecture-detail/element-coupling.md`; reusable | S14 |
| R1C-05 | View state model insufficient for plan/section in 2A/2B | Medium | Medium | `code-level ADR docs/02-decisions/adrs/0016-view-state-command-driven.md` explicitly extensible; F reviews 2A plan against ADR before 2A starts | S17 |
| R1C-06 | Bench dashboard becomes stale because nobody reads it | High | Medium | Sprint demos always show dashboard; F reads it before approving merges | S18+ |
| R1C-07 | Selection event volume dominates event log | Low | Medium | Selection events tagged `ephemeral: true` — pruned at session end | S16 |

### Kill-switch (1C-specific)

- **K1C-1** — If end of S15 idle CPU > 4% with post-FX, halt. Spend up to 2 weeks tuning post-FX before S16.
- **K1C-2** — If end of S18 the headless test fails (cannot run kernel in Node), **halt immediately**. This is K1-B in master plan terms — the architecture's central claim is broken. Refactor producer/persistence layers to remove THREE/DOM leaks. **Do not enter 1D until headless runs.**

---

## §5 1C → 1D handoff checklist (must be true on M9 morning)

- [ ] All S18 exit criteria green.
- [ ] All 4 ADRs (014–017) merged.
- [ ] All CI gates from 1A + 1B + 1C active and PR-blocking.
- [ ] All 12 element families parity-tested green.
- [ ] Renderer hardened: post-FX active, idle CPU + orbit fps benches green.
- [ ] Headless CLI runs in Node.
- [ ] Bench dashboard live and read in every retro.
- [ ] PRYZM 1 unchanged and shipping.
- [ ] Sprint S19 plan in `docs/03-execution/status/sprints/S19.md`.
- [ ] One-day buffer between S18 D10 and S19 D1.
- [ ] `apps/bench/reports/M9-1C-baseline.md` published.
- [ ] Sub-phase 1C demo recording in `docs/05-guides/developer/demos/M9-1C-headless.mp4`.

---

## §6 ADRs introduced in 1C — full text

The four ADRs below are drafted on each sprint's D1 by the listed owner and merged on D8 unless deferred. They all live in `docs/04-reference/architecture-detail/adrs/` (one file per ADR). Reproduced here in full so this phase doc is self-contained for downstream consumers (1D + 2A planning).

### §6.1 ADR-014 — TRAA / SSGI under idle-continuation budget (S15)

**Status**: Proposed (draft S15 D1) → Accepted (target S15 D8). Owner: B.

**Context.** The 1A FrameScheduler exposes an "idle-continuation" mode (1A S03): when the user stops interacting, the loop continues to tick at a reduced cadence so progressive techniques (TRAA, SSGI, denoising) can converge. The hard constraint from 08-VISION is **idle CPU < 2%** — measured by `apps/bench/idle-cpu.bench.ts` (CI gate). The naïve approach (every pass renders every frame for as long as motion is absent) consistently overshoots 5%.

**Decision.** Each `RenderPass` declares an `idleBudgetFrames: number` field. `0` means single-shot (bloom). Positive N means the pass's `render()` is called at most N times after motion-stop, then skipped on subsequent idle ticks. The `IdleAccumulator` (S15 D5) tracks per-pass convergence and stops idle-continuation entirely once all passes converge or hit budget.

**Budgets agreed for 1C** (revisable in 1D after empirical accumulation testing on real projects):

| Pass | `idleBudgetFrames` | Justification |
|---|---|---|
| Bloom | 0 | Single-shot; deterministic from current frame |
| TRAA | 16 | Internal testing in PRYZM 1 shows visual convergence at frame 12-16; we round up to 16 for headroom |
| SSGI | 32 | Converges slower due to stochastic sampling; lower-priority pass |

**Consequences.** 
- (+) Idle CPU stays under budget while still allowing high-quality progressive convergence.
- (+) Composable: future passes (e.g., denoiser, TAA-U) declare their own budget independently.
- (−) Passes must implement convergence-aware `render()` — extra complexity vs always-render.
- (−) Budgets are scene-dependent; if a future user reports shimmer on idle, we may need adaptive budgets (deferred to 1D).

**Alternatives rejected.** (a) Adaptive budget driven by per-frame variance — deferred (complexity-vs-need). (b) Always-render for N frames regardless of pass — rejected (idle CPU overshoots).

### §6.2 ADR-015 — Picking strategy: gpu-pick default, BVH fallback (S16)

**Status**: Proposed (draft S16 D1) → Accepted (target S16 D8). Owner: A.

**Context.** Selection / picking is needed for all 12 element families. Two well-understood approaches exist: (a) **gpu-pick** — render scene to a 1×1 pixel render target with elementId-encoded materials, read pixel; (b) **BVH-pick** — maintain a per-element bounding volume hierarchy and ray-cast in CPU. Each has tradeoffs documented in extensive prior art (three-mesh-bvh README; Threejs forum discussions; Inigo Quilez blog).

**Decision.** Provide both behind `PickStrategy` interface. Resolve at boot: try `GpuPickStrategy.probeAvailability()` (renders 1×1 RGBA8 RT, reads pixel, checks for known driver quirks); if it succeeds, use gpu-pick. If it fails (R1C-02: Linux WebGL2 driver corner cases observed in PRYZM 1 telemetry), fall back to `BvhPickStrategy`.

**Both strategies satisfy:**
- Single-point pick API: `pick(screenPoint, ctx) → PickResult | null`
- Box-select skeleton: `pickRect(screenRect, ctx) → readonly PickResult[]` (full UX in 2C)
- < 10 ms p95 single-point latency in 1000-element scene (CI gate via `apps/bench/picking-latency.bench.ts`)

**Consequences.**
- (+) Cross-platform robustness — no Linux-only "broken selection" tickets.
- (+) BVH path doubles as basis for future raycast features (e.g., laser-pointer measurements in 2A).
- (−) Two implementations to maintain; CI must run picking tests under both strategies (1A CI matrix already supports flag).
- (−) BVH cache invalidation tied to descriptor.hash — new dependency on geometry-kernel hashing contract.

**Alternatives rejected.** (a) gpu-pick only — fails on Linux (R1C-02). (b) BVH only — wastes CPU on the 95% of users with working WebGL2.

### §6.3 ADR-016 — View state model: command-driven view switch (S17)

**Status**: Proposed (draft S17 D1) → Accepted (target S17 D8). Owner: A.

**Context.** Multi-view (3D + plan + section + elevation) is core to BIM tooling. PRYZM 1 had ad-hoc camera animations triggered by direct controller calls — non-persistent, not undoable, and prone to fighting other animation systems (notably the new IdleAccumulator from S15).

**Decision.** Views are first-class persistent entities:
- `ViewDefinition` is a Zod schema in `@pryzm/view-state`; instances live in `ViewRegistry` (a `Store`, so it persists via 1A S04 event log).
- `activeViewId` lives in `ActiveViewStore` (singleton `Store`).
- View switching dispatches a `view.switch` command → handler updates `activeViewId` → `ViewController.switchTo(viewId)` orchestrates the camera animation under the FrameScheduler.
- Animation respects scheduler motion semantics: `scheduler.beginMotion()` on switch start (suppresses idle-continuation), `endMotion()` on completion (re-enables convergence on the new pose).

**Schema is forward-compatible**: 1C ships `'3d-perspective' | '3d-orthographic'` view kinds. 2A/2B will extend `kind` to include `'plan' | 'section' | 'elevation'` via a discriminated union — the schema is structured so existing data stays valid.

**Consequences.**
- (+) Views survive reload (event log).
- (+) View-switch is undoable via standard command-bus undo (1A S03).
- (+) Orchestration with IdleAccumulator is explicit, not accidental.
- (−) Camera animation logic is now tightly coupled to FrameScheduler API — refactoring scheduler is more expensive.
- (−) Adds `view-state` package; 7 packages → 8.

**Alternatives rejected.** (a) Ad-hoc camera controller calls (PRYZM 1 status quo) — non-persistent, non-undoable. (b) Views as plain JS objects in a singleton — bypass event log; forfeits replay/audit.

### §6.4 ADR-017 — `@pryzm/headless` package surface (S18)

**Status**: Proposed (draft S18 D1) → Accepted (target S18 D8). Owner: A.

**Context.** K1-B (08-VISION) demands the kernel runs in Node end-to-end. We have lint enforcement (1B S08) but no mechanical Node test until S18. The headless package is also the foundation for future server-side baking (1D S22) and CI fixture generation.

**Decision.** `@pryzm/headless` is a Node-target package (not a library — it has its own `apps/headless/` workspace) exposing:
1. **`HeadlessContext`** — composable factory wiring command-bus + stores + persistence (in-memory adapter) + OTel.
2. **`CliCommand<P>` interface** + 4 built-in commands: `new-project`, `add-wall`, `add-slab`, `export-pryzm`. Future commands added ADR-free in 1D+.
3. **`pryzm-cli` bin** — minimal argv parser invoking the registered CliCommands.

**`apps/headless/.dependency-cruiser.cjs` enforces:**
- ALLOWED: `@pryzm/{protocol, command-bus, stores, geometry-kernel, persistence-client, view-state, picking, cascade}` (BVH-only, no GpuPickStrategy import path).
- FORBIDDEN: `three`, `@pryzm/{renderer, render-runtime, ui-vanilla}`, anything touching `document` / `window` / `navigator`.
- CI fails if any FORBIDDEN import appears (mechanical purity gate beyond runtime test).

**`strictKernelMode: true`** flag in `HeadlessContext` installs a Proxy that throws on simulated DOM/THREE access — caught early in test rather than at first DOM API use.

**Consequences.**
- (+) K1-B verified mechanically every CI run via `apps/headless/__tests__/headless-node.test.ts`.
- (+) Foundation for 1D bake-worker (Node Worker / job runner that needs identical kernel behaviour).
- (+) `.pryzm-stub` files generated headlessly are byte-identical to browser-generated ones (parity test).
- (−) Adds an apps workspace; build-graph complexity grows.
- (−) CLI is intentionally minimal in 1C; full feature parity with the browser app comes in 1D+.

**Alternatives rejected.** (a) Lint-only purity check — already shown insufficient (need real Node run per K1-B). (b) Run the browser app in jsdom — too far from real Node deployment context for 1D bake-worker.

---

## §7 Performance budgets and bench specifications (1C)

All numbers are p95 over a 1000-frame trace from `apps/bench/run-all.ts`. Hardware baseline: M2 MacBook Pro (10-core), Chrome stable. Linux CI runs published in `apps/bench/reports/` after every sprint.

### §7.1 Budget table (CI-enforced)

| Bench | Sprint frozen | Target | Hard-fail | Soft-warn |
|---|---|---|---|---|
| `produce-curtain-wall.bench.ts` (4×4 façade) | S13 | < 50 ms | 60 ms | 55 ms |
| `produce-curtain-wall.bench.ts` (10×10 façade) | S13 | < 80 ms | 100 ms | 90 ms |
| `orbit-fps-cw.bench.ts` (50-panel façade) | S13 | > 55 fps | 50 fps | 53 fps |
| `produce-stair.bench.ts` (each of 3 runs) | S14 | < 50 ms | 60 ms | 55 ms |
| `produce-handrail.bench.ts` | S14 | < 50 ms | 60 ms | 55 ms |
| `produce-ceiling.bench.ts` | S14 | < 50 ms | 60 ms | 55 ms |
| `idle-cpu.bench.ts` (with bloom + TRAA + SSGI active) | S15 | < 2.0% | 2.5% | 2.2% |
| `orbit-fps.bench.ts` (100-wall + post-FX) | S15 | > 55 fps | 50 fps | 53 fps |
| `render-pass-cost.bench.ts` (bloom) | S15 | < 2 ms | 3 ms | 2.5 ms |
| `render-pass-cost.bench.ts` (TRAA) | S15 | < 3 ms | 4 ms | 3.5 ms |
| `render-pass-cost.bench.ts` (SSGI) | S15 | < 5 ms | 7 ms | 6 ms |
| `render-pass-cost.bench.ts` (post-FX total) | S15 | < 8 ms | 10 ms | 9 ms |
| `picking-latency.bench.ts` (gpu-pick, 1k elements) | S16 | < 10 ms | 12 ms | 11 ms |
| `picking-latency.bench.ts` (BVH, 1k elements) | S16 | < 12 ms | 15 ms | 13 ms |
| `view-switch.bench.ts` | S17 | < 200 ms | 250 ms | 220 ms |
| `headless-node.test.ts` (full pipeline runtime) | S18 | < 3 s | 5 s | 4 s |

Soft-warn fires a yellow-status row on the bench dashboard (S18) but does not block PRs. Hard-fail blocks merge.

### §7.2 Bench harness conventions

- All benches use `vitest bench` (built-in benchmark.js wrapper) for cross-run comparability.
- Each bench writes a single line to `apps/bench/reports/<sprint>-<bench>.md` with: timestamp, p50, p95, p99, sample count, hardware tag.
- `apps/bench/dashboard/` (S18) reads these files and aggregates trend lines.
- Re-runs after refactors: any PR touching `packages/{geometry-kernel, renderer, picking, view-state}` triggers full bench re-run in CI.

---

## §8 OTel telemetry catalog (1C-introduced spans only)

Cumulative OTel surface exported to Honeycomb. 1A + 1B span catalogs in their respective phase docs. Sampling defaults: always-on for committer/render/idle/view (gate-relevant); 1/100 in production for intent/picking; always-on in DEV.

### §8.1 Render & post-FX (S15)

| Span | Parent | Key attributes |
|---|---|---|
| `pryzm.render.pass` | `pryzm.frame.scheduler.tick` | `pass.id`, `pass.duration_ms`, `pass.priority`, `pass.idle_frame_index`, `pass.converged` |
| `pryzm.render.bloom` | `pryzm.render.pass` | `bloom.threshold`, `bloom.intensity`, `bloom.duration_ms` |
| `pryzm.render.traa` | `pryzm.render.pass` | `traa.frames_since_motion`, `traa.disocclusion_pixels`, `traa.duration_ms` |
| `pryzm.render.ssgi` | `pryzm.render.pass` | `ssgi.frames_since_motion`, `ssgi.samples_per_pixel`, `ssgi.duration_ms` |
| `pryzm.idle.accumulator.tick` | `pryzm.frame.scheduler.tick` | `idle.frames_since_motion`, `idle.passes_rendered.count`, `idle.all_converged` |

### §8.2 Curtain wall, stair, handrail, ceiling (S13–S14)

| Span | Parent | Key attributes |
|---|---|---|
| `pryzm.intent.cw.resolvePanelCell` | `pryzm.tool.dispatch` | `cw.id`, `cell.row?`, `cell.col?`, `intent.duration_ms` |
| `pryzm.intent.cw.resolveSegmentIntent` | `pryzm.tool.dispatch` | `cw.id`, `segment.kind`, `intent.duration_ms` |
| `pryzm.committer.cw.rebindPanelMaterials` | `pryzm.committer.commit` | `cw.id`, `panels.count`, `pool.hits`, `pool.misses`, `rebind.duration_ms` |
| `pryzm.kernel.produce.{stair,handrail,ceiling}` | `pryzm.committer.commit` or bench | `<elem>.id`, `producer.duration_ms`, `descriptor.bytes`, `stair.run?` |

### §8.3 Picking & selection (S16)

| Span | Parent | Key attributes |
|---|---|---|
| `pryzm.picking.pick` | (root user-action) | `strategy`, `screen.x`, `screen.y`, `result.found`, `result.elementKind?`, `duration_ms` |
| `pryzm.picking.pickRect` | (root user-action) | `strategy`, `rect.{x,y,w,h}`, `result.count`, `duration_ms` |
| `pryzm.picking.bvh.build` | (ambient) | `element.id`, `vertices`, `build.duration_ms` |
| `pryzm.selection.diff` | `pryzm.command.execute` | `selection.added`, `selection.removed`, `selection.total_after` |

### §8.4 View state (S17)

| Span | Parent | Key attributes |
|---|---|---|
| `pryzm.view.switch` | (root or `pryzm.command.execute`) | `view.from`, `view.to`, `view.switch.duration_ms`, `transition.eased` |
| `pryzm.view.cameraAnimation.tick` | `pryzm.view.switch` | `t`, `tick.index`, `pose.{x,y,z}` (DEV-only sampling 1/10) |
| `pryzm.view.create` / `.delete` / `.rename` | `pryzm.command.execute` | `view.id`, `view.name`, `view.kind` |

### §8.5 Headless (S18)

| Span | Parent | Key attributes |
|---|---|---|
| `pryzm.headless.boot` | (root) | `headless.cli.command`, `headless.k1b.verified`, `headless.duration_ms`, `headless.strict_mode` |
| `pryzm.headless.cli.command` | `pryzm.headless.boot` | `cli.name`, `cli.argv.count`, `cli.duration_ms`, `cli.ok` |
| `pryzm.headless.export` | `pryzm.headless.cli.command` | `export.bytes`, `export.elementCount`, `export.duration_ms` |

### §8.6 Cascade & cross-element (S14 augmentation)

| Span | Parent | Key attributes |
|---|---|---|
| `pryzm.cascade.dispatch` (extended in 1C) | `pryzm.command.execute` | new attribute `cascade.rule.key='stair.path'` (existing keys: `wall.path`, `level.elevation`) |
| `pryzm.committer.commit` (extended in 1C) | `pryzm.frame.scheduler.tick` | new attribute `committer.id` ∈ {`curtain-wall`, `stair`, `handrail`, `ceiling`} |

### §8.7 Span events (cross-cutting)

| Event | Span | When |
|---|---|---|
| `pryzm.picking.gpu-pick.unavailable` | `pryzm.picking.pick` (boot) | gpu-pick probe failure → BVH fallback |
| `pryzm.picking.bvh.cache.invalidated` | `pryzm.picking.pick` | element descriptor.hash change → BVH rebuild |

---

## §9 TypeScript contracts inventory (1C)

Cumulative typed contracts introduced in 1C, organised by the package they live in. Each entry lists the file path and a one-line summary; full signatures appear in the per-sprint sections above.

### §9.1 `packages/renderer/passes/`

- `types.ts` — `RenderPass` interface, `TickPriority` reuse from 1A
- `Bloom.ts` — `BloomPass` (one-shot, `idleBudgetFrames=0`)
- `TRAA.ts` — `TRAAPass` (16-frame budget)
- `SSGI.ts` — `SSGIPass` (32-frame budget; reuses TRAA history)

### §9.2 `packages/renderer/`

- `IdleAccumulator.ts` — multi-pass convergence orchestration, `onMotionStart()` / `onIdleTick()`

### §9.3 `packages/picking/`

- `types.ts` — `PickResult`, `PickStrategy`, `PickContext`
- `gpu-pick.ts` — `GpuPickStrategy`
- `bvh-pick.ts` — `BvhPickStrategy`
- `PickStrategyResolver.ts` — boot-time strategy resolution

### §9.4 `packages/render-runtime/`

- `highlight.ts` — `attachHighlight(committer, opts)`, `HighlightOptions` (extracted from 1B S09 wall-only impl)

### §9.5 `packages/stores/`

- `SelectionStore.ts` — `SelectionStore`, `SelectionEntry` (real impl, replaces 1B S07 skeleton)
- `ActiveViewStore.ts` — `ActiveViewState`, `ActiveViewStore` (singleton)

### §9.6 `packages/view-state/`

- `ViewDefinition.ts` — `ViewDefinitionSchema`, `ViewDefinition`
- `ViewRegistry.ts` — `ViewRegistry`
- `ViewController.ts` — `ViewController.switchTo()`
- `defaults.ts` — `Default3DView`, `LevelOverview`

### §9.7 `packages/geometry-kernel/producers/`

- `stair.ts` — `produceStair(dto, levelGeometryHints)`, `StairData`
- `handrail.ts` — `produceHandrail(dto, ctx)`, `HandrailData`, `HandrailContext`
- `ceiling.ts` — `produceCeiling(dto)`, `CeilingData`
- `_internal/tread-prism.ts` — shared tread-extrusion helper

### §9.8 `plugins/curtain-wall/`

- `intent.ts` — `CurtainWallIntentResolver`
- `handlers/{AddPanel, RemovePanel, SwapPanel, SetMullionType, RotatePanel}.ts` — 5 handlers
- `committer.ts` — extended: `CWSceneEntry` with pooled `panelMaterialHandles`

### §9.9 `plugins/{stair, handrail, ceiling}/`

- `store.ts` — Store subclass per element
- `handlers/*.ts` — 8 stair + 5 handrail + 4 ceiling handlers
- `committer.ts`, `tool.ts` — per-element

### §9.10 `plugins/cross/`

- `stair-handrail.ts` — `stairHandrailCascadeRule: CascadeRule<'stair.path'>`

### §9.11 `plugins/selection/`

- `handlers/{Select, Deselect, ClearSelection}.ts` — 3 handlers (ephemeral=true)

### §9.12 `plugins/view/`

- `handlers/{CreateView, DeleteView, RenameView, SwitchView, UpdateViewCamera}.ts` — 5 handlers

### §9.13 `apps/headless/`

- `index.ts` — Node entry
- `src/cli.ts` — `CliCommand<P>`, `HeadlessContext`, `CliResult`
- `src/commands/{newProject, addWall, addSlab, exportPryzm}.ts` — 4 CLI commands
- `.dependency-cruiser.cjs` — kernel-purity gate

### §9.14 `apps/bench/dashboard/`

- `types.ts` — `BenchEntry`
- `src/{loader, render}.ts` — read `apps/bench/reports/*.md` + render dashboard

**Total new exported symbols added in 1C: approximately 65 (interfaces + classes + handler factories + CLI commands).**

---

## §10 Delta from canonical sources (where 1C deepens or constrains)

This phase doc is consistent with `05-IMPLEMENTATION-PLAN.md`, `08-VISION.md`, `01-TARGET-ARCHITECTURE.md`, and `10-MASTER-IMPLEMENTATION-PLAN-36M.md`. Where 1C adds detail beyond what those docs specify, it is captured here; where it appears to contradict, the contradiction is resolved with the override order from `08-VISION.md` (precedence: 06+.pryzm spec > 08-VISION > 10-MASTER+PHASE > 05 > 01).

### §10.1 Deltas vs `08-VISION.md`

- **D5 (kernel purity)**: 1C operationalises D5 by *requiring* the headless test (`apps/headless/__tests__/headless-node.test.ts`) to pass on every CI run. 08-VISION states the *property*; 1C S18 adds the *mechanical proof*. **K1C-2 elevates this to a hard kill-switch** — failing the headless test halts 1D entry. No contradiction; tightening only.
- **D7 (PRYZM 1 keeps shipping)**: unchanged; 1C is doc-only against PRYZM 1. The vanilla TS dev-loop on `npm run dev` (port 5000) is unaffected.
- **P3 (bake-worker test)**: deferred to 1D S22 per 08-VISION; 1C S18 headless package is the *foundation* the bake-worker will sit on. No new commitment in 1C beyond providing the surface.

### §10.2 Deltas vs `05-IMPLEMENTATION-PLAN.md`

- **§13 hot path**: 05 enumerates the canonical 7-stage hot path (intent → command → handler → store → cascade → committer → render). 1C S13 extends with the curtain-wall-specific material-pool dedup at the committer stage; 1C S15 inserts the post-FX/IdleAccumulator stage between render and screen. Both extensions are consistent with the canonical pipeline; neither adds new stages.
- **ADR numbering**: `05-IMPLEMENTATION-PLAN.md` reserves the `[strategic ADR-001]`..`[strategic ADR-012]` range for cross-cutting architectural decisions (Pascal, CRDT, storage, etc.); the *phase docs* (1A..1D) use a separate, sequential code-level ADR series for sprint-scoped decisions (slugged `0001-...`..`00NN-...` under `docs/02-decisions/adrs/`). To avoid collision with 1B's sprint-scoped series (the §6/§7 headings `ADR-008..013`, post rev-3, mapped to slugs `0008-wall-handler-triage` through `0013-intent-resolver`), 1C now uses **the §6 headings `ADR-014..017`** (mapped to slugs `0014-traa-ssgi-idle-budget` through `0017-headless-package-surface` per the §0 mapping table). This delta is recorded in §6 above; the cross-cutting strategic ADRs are unaffected.
- **"4-week phase" granularity in 05**: 1C breaks each phase into six 2-week sprints (S13..S18). 05 lists phase milestones; 1C lists sprint milestones. Sprint structure is finer-grained than the canonical doc but does not contradict it.

### §10.3 Deltas vs `01-TARGET-ARCHITECTURE.md`

- **L4 renderer layer**: 01 lists "post-process pipeline" as L4 capability. 1C S15 names the specific passes (Bloom/TRAA/SSGI), the convergence model (per-pass `idleBudgetFrames`), and the orchestration (`IdleAccumulator`). Strict refinement.
- **L4 picking**: 01 lists "picking & selection" as L4 capability. 1C S16 makes the strategy pluggable (`PickStrategy` interface) and adds the BVH fallback. Strict refinement.
- **L4.5 view state**: 01 mentions "multi-view" as a target capability without naming a layer. 1C introduces `@pryzm/view-state` as a kernel-pure package (sits at L4.5 between stores and renderer) so headless can manipulate views without a renderer. New layer added for clarity; consistent with the layered model.
- **L0 headless**: 01 mentions "headless / Node deployable" as architectural goal. 1C S18 produces the `@pryzm/headless` apps workspace + `apps/headless/.dependency-cruiser.cjs` gate. Implementation of the goal; no contradiction.

### §10.4 Deltas vs `10-MASTER-IMPLEMENTATION-PLAN-36M.md`

- **M7-M9 element-family completion**: 10-MASTER lists "12 element families complete by M9" as the milestone. 1C S14 D8 confirms this. **In sync.**
- **Renderer hardening at M8**: 10-MASTER lists "post-FX + idle CPU + orbit budgets met" as M8 milestone. 1C S15 D8 confirms via bench reports. **In sync.**
- **Headless K1-B at M9**: 10-MASTER lists "kernel runs in Node" as M9 acceptance. 1C S18 D8 confirms via `headless-node.test.ts`. **In sync.**

**No contradictions detected as of rev-2.**

---

## §11 Pre-sprint reading list per agent

Each sprint's D1 kickoff assumes the following reading. Reading is light (≤ 30 min) and focused; no agent is expected to re-read everything every sprint.

| Sprint | Agent A reads | Agent B reads | Joint reads |
|---|---|---|---|
| S13 | 1B S07 (curtain wall skeleton); `plugins/curtain-wall/*` | 1A S05 (`MaterialPool`); 1B `apps/bench/produce-cw.bench.ts` baseline | `code-level ADR docs/02-decisions/adrs/0011-curtain-wall-triage-and-producer-split.md` (multi-group meshes); §6.1 `code-level ADR docs/02-decisions/adrs/0014-traa-ssgi-idle-budget.md` budget rationale (preview) |
| S14 | 1B S08 (`CascadeRunner`); `docs/04-reference/architecture-detail/element-coupling.md` (draft seed); `code-level ADR docs/02-decisions/adrs/0009-wall-producer-signature.md` (producer purity) | 1A S04 producer/committer pattern; `packages/geometry-kernel/producers/_internal/` shared helpers | §6 ADR catalog headers |
| S15 | (handoff D2 only) | THREE.EffectComposer source; existing PRYZM 1 post-FX in `src/core/rendering/`; `code-level ADR docs/02-decisions/adrs/0014-traa-ssgi-idle-budget.md` §6.1 | `code-level ADR docs/02-decisions/adrs/0014-traa-ssgi-idle-budget.md` §6.1; `08-VISION.md` D5 |
| S16 | three-mesh-bvh README; PRYZM 1 picking module in `src/core/picking/`; `code-level ADR docs/02-decisions/adrs/0015-picking-strategy.md` §6.2 | (S16 handoff D5+ only) | `code-level ADR docs/02-decisions/adrs/0015-picking-strategy.md` §6.2; `01-TARGET-ARCHITECTURE.md` L4 picking |
| S17 | `packages/renderer/CameraController.ts`; `code-level ADR docs/02-decisions/adrs/0016-view-state-command-driven.md` §6.3; 2A draft outline (where multi-view extends) | (S17 D5+ only) | `code-level ADR docs/02-decisions/adrs/0016-view-state-command-driven.md` §6.3; FrameScheduler motion API (1A S03) |
| S18 | `packages/persistence-client/InMemoryAdapter.ts`; `code-level ADR docs/02-decisions/adrs/0017-headless-package-surface.md` §6.4; 1B S08 lint config | `apps/bench/reports/` schema (1B-2025); dashboard wireframe in `docs/03-execution/status/sprints/S18-dashboard.md` | `code-level ADR docs/02-decisions/adrs/0017-headless-package-surface.md` §6.4; **K1-B in 08-VISION** |

---

## §13 Completion Worklist W-1 (2026-04-27)

> These are parallel-safe items identified during the S13–S16 retrospective audit.
> They do not change any sprint boundary, sprint goal, or delivery date.
> Each item is closed (all `[x]`) and cross-referenced to `PROCESS-TRACKER.md §"Completion Worklist W-1"`.

### W-1A — ESLint rule hardening

**W-1A-1** — `pryzm/store-single-channel` unit test.

The rule file (`tools/eslint-plugin-pryzm/src/rules/pryzm-store-single-channel.js`) was shipped in S01 but lacked the dedicated `RuleTester` fixture suite required by `docs/04-reference/architecture-detail/ci.md` (every custom rule must have a vitest test file).

Deliverable: `tools/eslint-plugin-pryzm/src/__tests__/pryzm-store-single-channel.test.js`

```
RuleTester cases (5):
  VALID:   handler with single affectedStore                → no report
  VALID:   handler with empty affectedStores array          → no report
  VALID:   non-CommandHandler class with multi-string array → no report
  INVALID: handler with ['wall','roof']                     → messageId: 'multiChannel'
  INVALID: handler with ['wall','roof','slab']              → messageId: 'multiChannel'
```

Status: `[x]` landed 2026-04-27.

---

### W-1B — Handler correctness errata

**W-1B-1** — `MoveWallHandler` façade over `TransformWallHandler` (ADR-008 errata).

The S07-T5 implementation of `plugins/wall/src/handlers/MoveWall.ts` duplicated all validation logic (finite-vec3 check, same-y check, planar-length guard) that was later consolidated into `TransformWallHandler` (S10-T1, ADR-008 §"Wave 3"). This creates a dual-maintenance burden and a silent divergence risk.

Resolution: `MoveWall.ts` is rewritten as a ≤ 40-line facade:

```typescript
// delegates canExecute + execute to a shared INNER instance
const INNER = new TransformWallHandler();
// MoveWallPayload { id, baseLine } maps to:
//   { kind: 'referenceEdit', id, newBaseLine: payload.baseLine }
```

The `wall.move` command type is preserved unchanged; zero migration effort for existing bus registrations and test suites.

Status: `[x]` landed 2026-04-27. Marked in PROCESS-TRACKER §W-1B.

---

### W-1C — Fixture catalog top-up + parity promotion

**W-1C-2** — Disk-based parity suites for door / window / slab / grid / column / beam.

The S11/S12 parity tests for these 6 families used inline shape-digest assertions rather than the disk-based byte-equality pattern established in S13 (`tests/parity/curtain-wall/cw-snapshot.test.ts`).  The disk-based pattern is now the canonical standard for all producer families.

Deliverables per family:

| Family | Fixture index | Count | Parity test |
|---|---|---|---|
| door | `packages/geometry-kernel/__tests__/__configs__/door-index.ts` | 15 | `tests/parity/door/cw-snapshot.test.ts` |
| window | `packages/geometry-kernel/__tests__/__configs__/window-index.ts` | 12 | `tests/parity/window/cw-snapshot.test.ts` |
| slab | `packages/geometry-kernel/__tests__/__configs__/slab-index.ts` | 18 | `tests/parity/slab/cw-snapshot.test.ts` |
| grid | `packages/geometry-kernel/__tests__/__configs__/grid-index.ts` | 8 | `tests/parity/grid/cw-snapshot.test.ts` |
| column | `packages/geometry-kernel/__tests__/__configs__/column-index.ts` | 6 | `tests/parity/column/cw-snapshot.test.ts` |
| beam | `packages/geometry-kernel/__tests__/__configs__/beam-index.ts` | 6 | `tests/parity/beam/cw-snapshot.test.ts` |

Each parity test writes `configs/<id>.json` + `snapshots/<id>.snap.json` on first run and gates byte-equality on all typed arrays (position / normal / uv / index / bounds / groups / materialKeys / hash) on subsequent runs.  Refresh env var: `<FAMILY>_SNAPSHOT_REFRESH=1`.

Door and window get `vitest.config.ts` files (the other 4 already had them).

Status: `[x]` landed 2026-04-27.

---

**W-1C-3** — Curtain-wall fixture catalog top-up: 8 → 25.

The S13 carry-forward item ("Full 25-case parity fixture set") is closed here.
`packages/geometry-kernel/__tests__/__configs__/curtainwall-index.ts` extended with cw-09 through cw-25 (17 new fixtures).

New fixtures cover: all-opaque panels, all-spandrel panels, door-row, 0.5×0.5 m micro-bays, 3×3 m large bays, 20 mm thin mullions, 150 mm thick mullions, 12×2 m low-profile storefront, elevated worldY = 8.5 m, negative-X baseline start, 45° diagonal with mixed panels, single 1.5×1.5 bay, asymmetric 2×1.5 m bays, asymmetric 1×2 m portrait panels, material-id override, 3-row mixed facade, non-divisible height.

Status: `[x]` landed 2026-04-27. Carry-forward item closed.

---

**W-1C-4** — Stair / handrail / ceiling fixture top-ups.

S14 shipped minimum fixture counts to pass the initial parity gate; target counts from the S14 spec were not reached.

| Family | Before | After | New fixtures |
|---|---|---|---|
| stair | 6 | 10 | narrow (0.75 m), wide-public (2.0 m), U-shape residential, L-shape commercial high |
| handrail | 4 | 6 | square commercial 50 mm straight, round U-shape polyline (5 pts) |
| ceiling | 4 | 6 | L-shape level-2 gypsum, pentagonal residential plaster |

Files: `packages/geometry-kernel/__tests__/__configs__/{stair,handrail,ceiling}-index.ts`.

Status: `[x]` landed 2026-04-27.

---

**W-1C-5** — Roof skylight schema extension + 3 new handlers.

The Roof plugin shipped without skylight support. This adds the schema fields and handlers required for the 1C element-family completeness gate.

Schema (`packages/schemas/src/elements/Roof.ts`):

```typescript
export const SkylightSchema = z.object({
  id: z.string().min(1),
  position: Vec3,     // centre of skylight in roof-local space
  width: z.number().positive(),
  depth: z.number().positive(),
  frameWidth: z.number().positive().default(0.05),
});
// RoofData now includes:
//   skylights: SkylightSchema.array().default([])
//   joinedToRoofIds: z.string().array().default([])
```

New handlers (registered in `buildRoofHandlerSet()` and re-exported from both `handlers/index.ts` and `src/index.ts`):

| Handler file | Command type | affectedStores |
|---|---|---|
| `plugins/roof/src/handlers/AddSkylight.ts` | `roof.addSkylight` | `['roof']` |
| `plugins/roof/src/handlers/RemoveSkylight.ts` | `roof.removeSkylight` | `['roof']` |
| `plugins/roof/src/handlers/JoinRoofs.ts` | `roof.joinRoofs` | `['roof']` |

Fixture top-up: `packages/geometry-kernel/__tests__/__configs__/roof-index.ts` — 3 new entries (`flat-with-skylight`, `gable-joined-pair`, `hip-with-multi-skylight`).

Status: `[x]` landed 2026-04-27.

---

**W-1C-8** — `tests/integration/view-state-2a-readiness.test.ts` (scope clarification vs S17 spec line 913).

The original S17 spec entry (line 913) described the integration test as a "forward-looking smoke" asserting `kind: 'plan'` extensibility. Since `@pryzm/view-state` shipped in full during S17, the test is now a live contract gate over the actual exported surface rather than a speculative smoke.

7 contract assertions (+ 1 bonus):

| # | Assertion |
|---|---|
| 1 | `ViewDefinitionSchema` accepts a valid 3d-perspective view |
| 2 | `ViewDefinitionSchema` accepts a valid 3d-orthographic view |
| 3 | `ViewDefinitionSchema` rejects an unknown kind |
| 4 | `ViewDefinitionSchema` rejects a 3d-perspective view missing `fovDeg` |
| 5 | `ViewRegistry.defaults()` returns ≥ 2 views |
| 6 | Every default view parses cleanly through `ViewDefinitionSchema` |
| 7 | `ViewNotFoundError` is an `Error` subclass with `.name === 'ViewNotFoundError'` |
| bonus | `ViewController` is exported as a constructable class |

Status: `[x]` landed 2026-04-27.

---

## §12 Document log

| Rev | Date | Author | Change | Lines |
|---|---|---|---|---|
| rev-1 | 2026-04-26 | Founder + Architecture lead | Initial 1C phase doc, structure §0-§5, S13-S18 skeletons. | ~378 |
| **rev-2** | **2026-04-26** | **Architecture lead** | **Book-quality expansion: per-sprint typed contracts + key pseudocode + test catalog + OTel spans + daily artifact log for S13-S18; appendices §6 (the §6.1–§6.4 `ADR-014..017` headings full text — mapped to slugs `0014-traa-ssgi-idle-budget` through `0017-headless-package-surface`) + §7 (perf budgets) + §8 (OTel catalog) + §9 (contracts inventory) + §10 (delta from canonical) + §11 (reading list) + §12 (this log); ADRs renumbered 012-015 → 014-017 to avoid collision with 1B rev-3's sprint-scoped `ADR-008..013` series.** | **~1700** |
| **rev-3** | **2026-04-27** | **Architecture lead** | **Appended §13 Completion Worklist W-1 (7 parallel-safe items W-1A-1, W-1B-1, W-1C-2 through W-1C-5, W-1C-8): ESLint rule unit test, MoveWall façade errata, 6-family disk-based parity suites + fixture indexes, curtain-wall 8→25 fixtures, stair/handrail/ceiling top-ups, roof skylight schema + 3 handlers, view-state-2a contract test. All items landed and marked `[x]` in `PROCESS-TRACKER.md`.** | **+~120 lines** |

*Last updated: 2026-04-27 (rev-3). Owner: Founder + Architecture lead. Conflicts resolution order: `06+.pryzm spec` > `08-VISION.md` > `10-MASTER-IMPLEMENTATION-PLAN-36M.md` + this PHASE doc > `05-IMPLEMENTATION-PLAN.md` > `01-TARGET-ARCHITECTURE.md`. Companion: `phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` (predecessor, rev-3), `phases/PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md` (successor).*
