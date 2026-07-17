# Element-Creation Pipeline Soundness Audit

> **Stamp**: 2026-07-17 · **Status**: AUDIT (non-normative reference — no contract flipped, no code changed)
> **Author mandate**: "Everything should work sound and have a SIMILAR pipeline implementation — like the most sound elements (walls / curtain-walls)."
> **Scope**: Every element type × its creation path, end-to-end, benchmarked against the wall/curtain-wall gold standard. Produces a phased unification plan (L-381x).
> **Governing contracts**: **C11** (element-creation pipeline), **C16** (command authoring §3 kinds / §8 batch), C03 (commands/state), P6 (command-only mutation).
> **Trigger**: the L-376d generation-undo-coalesce fix exposed the two-tier reality — `stair.batch.create` is a **no-op structural stub** (`apps/editor/src/engine/initBusHandlers.ts:159`) and stairs/lifts run entirely through the legacy `CommandManager` (Path C), while walls/curtain-walls run the modern bus `*.batch.create` → `CommandEventBridge` `*.created` fan-out → `initTools` render bridge.

---

## 0 — TL;DR

- Generation **works today** (post-L-376d). Stairs and lifts render via their legacy `Create*Command` (which writes the legacy store → fires the fragment builder directly). Undo is one entry per generation (`§GEN-UNDO-COALESCE`). **This audit is about CONSISTENCY / soundness, not a broken feature → mostly P2 tech-debt.**
- The pipeline is **not** two tiers but **four**:
  1. **GOLD (bus + batch + render bridge)** — Wall, Slab, Curtain-Wall, Column, Beam, Ceiling, Furniture.
  2. **NEAR-GOLD (bus single-create + render bridge, NO batch fan-out)** — Roof, Floor, Handrail, Lighting.
  3. **HOSTED (rendered via the wall-opening bridge `§P2.3`)** — Door, Window, Opening.
  4. **LEGACY PATH-C (no registered bus handler / no-op stub; legacy `Create*Command` only)** — **Stair, Stair-railing, Stair-landing, Lift / verticalCirculation**. Room-bounding-line also here (batch legacy command). Room = derived.
- **Sharpest finding**: `plugins/stair` ships a COMPLETE, correct handler set — including a real `CreateStairBatchHandler` for `stair.batch.create` — but `registerStairHandlers()` is **never imported or called** by `engineLauncher.ts`. The real stair handlers are **dead registered code**; the live `stair.batch.create` is the no-op stub. Any caller that dispatches `stair.batch.create` expecting a batch gets a silent no-op. (`plugins/stair/src/handlers/index.ts:57`; absent from `engineLauncher.ts:48-74`.)
- **Highest-value migration**: Stairs + lifts — the office generation hot path (78 stairs + 80 lifts per the office typology). See L-381a.
- **Contract alignment**: The gold pattern **IS mandated** (C16 §3.2 reference row + CA-1…CA-16 + CA-12; C11 §2/§5/§11). Stair-on-Path-C is an **explicitly named, tracked transitional exception**, not a silent gap: C16 §3.2 "still authoritative for **stair**…" + C11 §11.1 `STAIR-BUS-MIGRATION` (Wave A21). So this is a **Known-Debt** note, not a fresh Known-Violation — but the DEAD `registerStairHandlers` and the `stair.batch.create` no-op stub diverge from both and should be logged.

---

## 1 — STEP 1: element × creation-path MATRIX (file:line cited)

Legend — **Bus handler**: `real` (a registered plugin `Create*Handler`), `stub` (no-op structural registration), `none`. **Render bridge**: a `CommandEventBridge` `*.created` case (`packages/runtime-composer/src/CommandEventBridge.ts`) + an `initTools` `runtime.events.on('*.created', …) → LegacyStore.add()` mirror (`apps/editor/src/engine/initTools.ts`). **Batch**: a real `*.batch.create` handler + CEB batch fan-out. **Tier**: GOLD / NEAR-GOLD / HOSTED / LEGACY / DERIVED.

| Element | Create command path | Bus handler | CEB `*.created` case | initTools render bridge | Batch (bus `*.batch.create`) | Tier |
|---|---|---|---|---|---|---|
| **Wall** | bus `wall.create` / `wall.batch.create` → `registerWallHandlers` (`engineLauncher.ts:477`) | real | ✅ `wall.create` + `wall.batch.create` (`CommandEventBridge.ts:127,160`) | ✅ `§P2.1` (`initTools.ts:897`) | ✅ `CreateWallBatch.ts` (coalesced) | **GOLD (reference)** |
| **Curtain-Wall** | bus `curtainwall.create` / `curtain-wall.batch.create` → `registerCurtainWallHandlers` (`engineLauncher.ts:491`) | real | ✅ (`CommandEventBridge.ts:310,343`) | ✅ `§P3.1-CW` (`initTools.ts:1207`) | ✅ `CreateCurtainWallBatch.ts` | **GOLD (reference)** |
| **Slab** | bus `slab.create` / `slab.batch.create` → `registerSlabHandlers` (`engineLauncher.ts:483`) | real | ✅ (`CommandEventBridge.ts:234,270`) | ✅ `§FT1` (`initTools.ts:1519`) | ✅ `CreateSlabBatch.ts` (BatchCoordinator TODO — §7.4) | **GOLD** |
| **Column** | bus → `registerColumnHandlers` (`engineLauncher.ts:511`) | real | ✅ (`CommandEventBridge.ts:381,414`) | ✅ `§P3.3-CO` (`initTools.ts:1447`) | ✅ `CreateColumnBatch.ts` | **GOLD** |
| **Beam** | bus → `registerBeamHandlers` (`engineLauncher.ts:521`) | real | ✅ (`CommandEventBridge.ts:455,486`) | ✅ `§FT2` (`initTools.ts:1584`) | ✅ `CreateBeamBatch.ts` | **GOLD** |
| **Ceiling** | bus → `registerCeilingHandlers` (`engineLauncher.ts:496`) | real | ✅ (`CommandEventBridge.ts:531,554`) | ✅ `§P3.2-CL` (`initTools.ts:1305`) | ✅ `CreateCeilingBatch.ts` | **GOLD** |
| **Furniture** | bus `furniture.create` / `furniture.batch.create` → `registerFurnitureHandlers` (`engineLauncher.ts:530`) | real | ✅ (`CommandEventBridge.ts:635,677`) | ✅ `§FT-FURNITURE` (`initTools.ts:1812`) | ✅ `CreateFurnitureBatch.ts` (`§FIX-FURNISH-BATCH-PERF` L-100) | **GOLD** (matrix §11 row STALE — says LEGACY-ONLY) |
| **Roof** | bus `roof.create` → `registerRoofHandlers` (`engineLauncher.ts:501`); also legacy `CreateRoofCommand` in executors | real (single) | ✅ `roof.create` only (`CommandEventBridge.ts:790`) | ✅ `§P3.2-RF` (`initTools.ts:1385`) | ❌ no `roof.batch.create` | **NEAR-GOLD** |
| **Floor** | bus `floor.create` → `registerFloorHandlers` (`engineLauncher.ts:506`); **AND** legacy `CreateFloorCommand` (executors/loader/IFC) — dual-command debt (C11 §5.4.3) | real (single) | ✅ `floor.create` only (`CommandEventBridge.ts:874`) | ✅ `§P3.2-FL` (`initTools.ts:1635`) | ❌ no `floor.batch.create` | **NEAR-GOLD** (dual-command) |
| **Handrail** | bus `handrail.create` → `registerHandrailHandlers` (`engineLauncher.ts:517`) | real (single) | ✅ `handrail.create` (enriched, `CommandEventBridge.ts:605`) | ✅ `§FT-HANDRAIL` (`initTools.ts:1730`) | ❌ no batch | **NEAR-GOLD** (matrix §11 row STALE — says LEGACY-ONLY) |
| **Lighting** | bus `lighting.create` → `registerLightingHandlers` (`engineLauncher.ts:538`) | real (single) | ✅ `lighting.create` (`CommandEventBridge.ts:729`) | ✅ `§FT-LIGHTING` (`initTools.ts:1778`) | ❌ no batch; not in `GEOMETRY_ELEMENT_TYPES` (no plan projection, by design) | **NEAR-GOLD** |
| **Door** | bus `door.create` / `door.batch.create` → `registerDoorHandlers` (`engineLauncher.ts:549`); renders as wall opening | real | ❌ CEB door case **removed** — uses Committer/opening path (`CommandEventBridge.ts:524-529`) | ✅ via `wall.opening.created` `§P2.3-DOOR` (`initTools.ts:1080`) | ✅ `CreateDoorBatch.ts` | **HOSTED** |
| **Window** | bus `window.create` / `window.batch.create` → `registerWindowHandlers` (`engineLauncher.ts:553`) | real | ❌ (same as door) | ✅ via `wall.opening.created` `§P2.3-WIN` (`initTools.ts:1138`) | ✅ `CreateWindowBatch.ts` | **HOSTED** |
| **Opening** | bus `opening.create` bridge → legacy `CreateOpeningCommand` (`initBusHandlers.ts:962`); `wall.opening.create` → `WallOpeningLegacyAdapterHandler` | real (adapter) | ✅ `wall.opening.create` / `wall.createOpening` (`CommandEventBridge.ts:208,218`) | ✅ `§P2.3` (`initTools.ts:1043`) | n/a (per-opening) | **HOSTED** |
| **Grid** | bus → `registerGridHandlers` (`engineLauncher.ts:524`); legacy `grid.add`/`grid.update` bridges (`initBusHandlers.ts:848`) | real | ✅ `grid.create` (`CommandEventBridge.ts:595`) | n/a (non-geometry) | n/a | GOLD-ish (non-geometry) |
| **Plumbing** | bus `plumbing.create` (pipe) / `plumbing.createFixture` → `registerPlumbingHandlers` (`engineLauncher.ts:534`); fixture handler bridges to legacy `CreatePlumbingFixtureCommand` | real (Path-A-style) | ✅ `plumbing.create` geometry-free (`CommandEventBridge.ts:750`) | writes legacy fixture store directly (no `§FT` bridge needed — `§FIX-PLUMBING-FIXTURE-CMD`) | ❌ no batch | HYBRID |
| **Room** | derived — `rooms.redetect` from walls/slabs (`plugins/rooms`) | real (redetect) | ✅ `room.create` (`CommandEventBridge.ts:585`) | n/a (derived) | n/a | **DERIVED** |
| **Room-bounding-line** | legacy `CreateRoomBoundingLinesBatchCommand` via `cm.execute` (`OfficeBuildingExecutor.ts:465,1051,1186`) | none | ❌ | ❌ (legacy command writes store directly) | legacy batch command | **LEGACY** |
| **Stair** | `stair.create` → **bridge to legacy `CreateStairCommand`** (`initBusHandlers.ts:987,990`); `stair.batch.create` = **NO-OP STUB** (`initBusHandlers.ts:159`); executors call `cm.execute(new CreateStairCommand)` directly (`OfficeBuildingExecutor.ts:1105`) | **stub (batch) + legacy bridge (single)** | ❌ removed — "uses Path C" (`CommandEventBridge.ts:524-529`) | ❌ none — `CreateStairCommand` writes `StairStore` + `bimManager.registerElement` itself (`CreateStairCommand.ts:201,275`) | ❌ real `CreateStairBatchHandler` exists but **NEVER REGISTERED** (`plugins/stair/src/handlers/index.ts:41,57`) | **LEGACY (Path C)** |
| **Stair-railing** | legacy — `stair.createRailing` / built by `CreateStairCommand` sub-elements → `StairRailingStore` | none (handler dead w/ stair) | ❌ | ❌ (legacy builder `StairRailingBuilder`, `§FIX-STAIR-RAILING-EVENT`) | ❌ | **LEGACY (Path C)** |
| **Stair-landing** | legacy — `StairLandingStore` → `StairLandingBuilder` (`§FIX-STAIR-EVENT-PAYLOAD`) | none | ❌ | ❌ | ❌ | **LEGACY (Path C)** |
| **Lift / verticalCirculation** | **legacy `CreateVerticalCirculationCommand` via `cm.execute` ONLY** (`OfficeBuildingExecutor.ts:1014`); **NO bus type at all** | **none** | ❌ | ❌ (legacy command writes store + builds mesh) | ❌ | **LEGACY (Path C) — no bus surface** |

### Matrix summary
- **GOLD (7)**: Wall, Curtain-Wall, Slab, Column, Beam, Ceiling, Furniture.
- **NEAR-GOLD (4)**: Roof, Floor, Handrail, Lighting (single-create bus + render bridge; no batch fan-out).
- **HOSTED (3)**: Door, Window, Opening (rendered through the wall-opening `§P2.3` bridge).
- **LEGACY / Path-C (5)**: **Stair, Stair-railing, Stair-landing, Lift/verticalCirculation**, Room-bounding-line.
- **DERIVED (1)**: Room.
- **NOTE — C11 §11 matrix is STALE**: it lists Handrail & Furniture as "LEGACY-ONLY", but `§7.0` fixes (FIX-HANDRAIL-BRIDGE, FIX-FURNITURE-BRIDGE) added their bridges after the 2026-05-19 matrix snapshot. Furniture is now GOLD; Handrail is NEAR-GOLD.

---

## 2 — STEP 2: the GOLD STANDARD (walls + curtain-walls), precisely

The sound pattern, as implemented by Wall (reference) and Curtain-Wall, has **five stages**. Every element migrates to this shape.

1. **Tool / executor dispatches a bus command with a pre-generated branded id.**
   - Single: `runtime.bus.executeCommand('wall.create', { id: createId('wall'), baseLine, height, thickness, levelId, systemTypeId, … })` (C11 §3.2 — the tool MUST pre-generate the id; root cause of FIX-WALL-ID).
   - Batch/generation: **ONE** `runtime.bus.executeCommand('wall.batch.create', { walls:[…], levelId })` per level (`OfficeBuildingExecutor.ts:628,1452`). One command ⇒ one undo entry (C16 §8.6 B-6).

2. **A registered plugin handler mutates the Immer store atomically.** `registerWallHandlers(_bus)` (`engineLauncher.ts:477`) registers `CreateWallHandler` + `CreateWallBatchHandler` (`plugins/wall/src/handlers/CreateWallBatch.ts`). The batch handler does the WHOLE set in **one `produceCommand()`** → one forward+inverse PatchPair → one undo entry (C16 §8 / CA-8 / CA-12). Handler validates per-element, wraps `withHandlerSpan` (P8).

3. **`CommandEventBridge` fans out one typed `*.created` per element.** `wall.batch.create` case (`CommandEventBridge.ts:160-201`) reads the COMMITTED walls out of `record.forward` (the Immer `add` patches — `indexCommittedWalls`, `CommandEventBridge.ts:76`) so the event carries handler-derived fields (`layers[]`, resolved `thickness`), not the request placeholders (root cause fix `§FIX-WALL-LAYERS-PLAN-VS-3D-CREATION` L-239). Emits `wall.created` with `commandType:'wall.create'` per wall so the single-create subscriber accepts each.

4. **The `initTools` render bridge mirrors each `*.created` into the legacy store.** `§P2.1` (`initTools.ts:897-1040`): `runtime.events.on('wall.created', …)` → `WallStore.add()` → **plus the two mandatory registrations** `viewDependencyTracker.registerElement(id, levelId)` + `bimManager.registerElement(id, levelId)` (Bridge Invariant 7 — root cause of FIX-PLAN-VDT-BIMMANAGER; without them plan view is blank). `WallStore.add()` emits `storeEventBus` → `ViewTechnicalDrawingCache` → plan-view projector.

5. **The legacy store drives geometry (3D + plan).** `WallStore.add()` → `WallRebuildCoordinator._scheduleFlush()` → `_flush()` (coalesces N adds → one `WallJoinResolver` pass/frame) → `WallFragmentBuilder.buildWall()` (3D); `EdgeProjectorService` (plan). Room redetect is a debounced event subscriber, not an imperative loop (C11 §4.2/§6.3).

**Why this is "sound":** P6-compliant (single mutation path = the bus), one atomic undo entry, collab-replayable via the command log, geometry-complete events (commit-over-request), and both views driven from one store. Curtain-Wall mirrors it exactly (`§P3.1-CW`, `§MI-02` grid spacing), with the one open `TODO-CW-STORE-BUS` (store `add()` doesn't self-emit `storeEventBus`; the bridge compensates).

**Key invariant for migration order (Bridge Invariant 2):** a bus-dispatched element type MUST have a render bridge, or it stops rendering. The `*.created` payload MUST be geometry-complete (Invariant 1).

---

## 3 — STEP 3: gaps + architectural alignment

### 3.1 — Per non-gold element: what's missing to reach gold

| Element | Distance from gold | Missing pieces | Gen frequency (value) | Migration risk |
|---|---|---|---|---|
| **Stair** | FAR (Path C, batch=no-op stub, real handlers dead) | (a) call `registerStairHandlers(_bus)` in `engineLauncher.ts` OR keep legacy but delete the no-op stub to avoid silent no-op; (b) `stair.created` + `stair.batch.create` CEB cases (geometry-complete); (c) `initTools §FT-STAIR` render bridge → legacy `StairStore`/`StairRailingStore`/`StairLandingStore`; (d) point office/house/resi executors at `stair.batch.create`. Two-level span validation already handled (C16 §5). | **HIGHEST** — office = 78 stairs | **MED** — must build render bridge FIRST (else stairs vanish); stair is a two-level span element (railings + landings sub-elements) |
| **Lift / verticalCirculation** | FARTHEST (no bus type at all) | (a) a `verticalCirculation.create` / `.batch.create` bus type + registered handler; (b) CEB case; (c) `initTools` render bridge; (d) executor dispatch. | **HIGHEST** — office = 80 lifts | **MED** — same "bridge-first" rule; no existing bus surface to build on |
| **Roof** | NEAR (single bus + bridge) | `roof.batch.create` handler + CEB batch case; converge executor `CreateRoofCommand` (`OfficeBuildingExecutor.ts:743`) onto the bus | LOW (1/roof) | LOW |
| **Floor** | NEAR (dual-command debt, C11 §5.4.3) | `floor.batch.create` + CEB batch case; retire `CreateFloorCommand` once rooms/walls are in the plugin-store world (the §5.4.3 blocker) | MED (per-room) | MED — dual-command; floor-finish inner-face rule lives in `CreateFloorCommand` (C11 §5.4.1) |
| **Handrail** | NEAR | `handrail.batch.create` + CEB batch case (single path is already gold-shaped) | LOW | LOW |
| **Lighting** | NEAR | `lighting.batch.create` + CEB batch case; (plan projection intentionally absent) | MED (auto-light) | LOW |
| **Room-bounding-line** | LEGACY batch command | bus `roomBoundingLine.batch.create` + CEB + bridge, OR accept as a derived internal artifact | LOW | LOW |
| **Plumbing** | HYBRID | optional `plumbing.batch.create`; fixture already renders via legacy store | LOW | LOW |

### 3.2 — Contract alignment (C11 / C16): mandate or gap?

**The gold pattern IS mandated — this is a Known-Debt, not a contract-silent coverage gap.**

- **C16 §3.2** explicitly names the transitional exception: Path A (legacy `Command`) is "*still authoritative for **stair**, several 'on-all' commands, and annotation/view families*." So stair-on-Path-C is a **documented, sanctioned transitional state**.
- **C16 §8 / CA-12 / B-6** mandate the gold batch shape: "One gesture = one undo entry is bought by **dispatching ONE `*.batch.create` command**" (C16 §8.6). The reference row (C16 line 85) names `wall.batch.create` / `slab.batch.create` as the pattern. Multi-element AI/generation output **MUST batch** (C16 §9 / C11 §4.2).
- **C11 §11.1** already tracks `STAIR-BUS-MIGRATION` (Wave A21): "replace the `_cmExec(new CreateStairCommand)` legacy bridge with a PRYZM3 plugin handler + `stair.created` CEB event, so stair matches the wall/slab pipeline shape."
- **C11 §7.4** tracks batch gaps for "Column / Beam / **Stair** / Door / Window / Ceiling" (some since closed).

**Divergences worth logging (code ahead of / behind contract):**
1. **DEAD `registerStairHandlers` + `stair.batch.create` no-op stub** — `plugins/stair` ships a complete, tested handler set incl. `CreateStairBatchHandler`, but it is never registered (`engineLauncher.ts:48-74` has no stair import). The LIVE `stair.batch.create` is the structural no-op (`initBusHandlers.ts:159`). This is worse than "Path C": a caller dispatching `stair.batch.create` gets a **silent success that creates nothing**. → log as a Known-Violation-flavoured item under L-381a. (C11 §11.1 / C16 §3.2.)
2. **Lift/verticalCirculation has NO bus surface** — not even a bridge; C11 §4 (all creation converges on the bus) is not satisfied for lifts. → coverage gap under L-381a.
3. **C11 §11 matrix is STALE** for Handrail/Furniture (says LEGACY-ONLY; both bridged since). → doc-accuracy note under L-381c.
4. **Executor inconsistency** — `OfficeBuildingExecutor` uses the bus (`wall.batch.create`) for walls but legacy `cm.execute(new Create*Command)` for slabs (`:387`), curtain-walls (`:1196`), roofs (`:743`), floors (`:1326`), rooms, stairs (`:1105`), lifts (`:1014`) — even for elements that HAVE a gold bus batch path (slab/CW). Convergence-by-coincidence risk (C11 §5.4). → L-381b.

### 3.3 — The risk the L-376d agent found (migration ORDER)

Moving stairs/lifts to the bus **requires the render bridge to exist FIRST**. The bus `stair.batch.create` stub does nothing and has no CEB case / no `initTools` bridge; if generation is repointed at it before a `§FT-STAIR` bridge exists, **stairs stop rendering entirely** (the legacy `CreateStairCommand` render path is bypassed and nothing replaces it). This is Bridge Invariant 2 (C11 §10.2). **Order: render bridge → real batch handler → executor dispatch → verify → only then remove the legacy command.** Dual-write (bus + legacy, drop-covered per C03 §4.6 / C16 §3.3) is the safe interim.

---

## 4 — STEP 4: phased unification plan (value/risk ordered)

**Already solved generically by L-376d — do NOT re-solve:** undo/snapshot coalescing. `§GEN-UNDO-COALESCE` (`packages/command-registry/__tests__/generationUndoCoalesce.test.ts`) brackets the whole generation (`beginGenerationBatch`/`endGenerationBatch`) so hundreds of legacy `cm.execute(new Create*Command)` calls (stairs, lifts, slabs, floors, roofs, rooms) skip per-command snapshots AND collapse to **one CompositeCommand undo entry**. **The remaining work is RENDER-PATH consistency + true bus batching — NOT undo.**

This is a **refactor toward consistency**, P0/P1-launch-SAFE when done incrementally **per element behind a geometry-identical verify gate**. It does **NOT** touch persistence / collab / WebGPU / gen-perf launch work.

### Phase 1 — Stairs + Lifts (highest value: office 78 stairs + 80 lifts) → **L-381a**
- **Sub-steps (order is binding):**
  1. Add `stair.created` + `stair.batch.create` geometry-complete CEB cases (`CommandEventBridge.ts`).
  2. Add `initTools §FT-STAIR` render bridge → `StairStore` + `StairRailingStore` + `StairLandingStore` + VDT/bimManager registration (mirror `§FT-HANDRAIL`). Handle the two sub-element families (railing, landing) and the two-level span.
  3. Register the real stair handlers: call `registerStairHandlers(_bus)` in `engineLauncher.ts` (import from `@pryzm/plugin-stair`) — activates the existing `CreateStairBatchHandler`. Delete the `stair.batch.create` no-op stub (`initBusHandlers.ts:159`).
  4. Same four steps for Lift: add a `verticalCirculation.create/.batch.create` bus type + handler + CEB + `§FT-LIFT` bridge (there is no existing bus surface — build it).
  5. Repoint `OfficeBuildingExecutor` (`:1105`, `:1014`), `ResidentialBuildingExecutor`, `HouseLayoutExecutor` at the bus batch; keep the legacy `Create*Command` as drop-covered dual-write until the verify gate is green, then remove.
- **Effort:** L (stair is a span element with 2 sub-element families + a lift subsystem from scratch). **Deps:** none (L-376d undo already done). **Verify gate:** office generation produces byte-identical stair/lift geometry, rooms, railings, landings, and ONE undo entry; 3D + plan render identical; no `stair.batch.create` no-op reached.

### Phase 2 — Roof / Floor batch fan-out + executor convergence → **L-381b**
- **Sub-steps:** add `roof.batch.create` + `floor.batch.create` handlers + CEB batch cases; converge `OfficeBuildingExecutor` roof/floor/slab/curtain-wall dispatches onto their existing gold bus batch commands (slab & CW already have them — this is dispatch-site cleanup, low risk). Floor carries the C11 §5.4.3 dual-command debt (retire `CreateFloorCommand` only once rooms/walls are plugin-store-resident — do NOT force it for launch).
- **Effort:** M. **Deps:** none. **Verify gate:** geometry-identical roofs/floors/slabs; floor-finish inner-face rule (C11 §5.4.1) preserved; one undo entry.

### Phase 3 — Handrail / Lighting batch fan-out + Room-bounding-line + doc sync → **L-381c**
- **Sub-steps:** add `handrail.batch.create` + `lighting.batch.create` CEB batch cases (single paths already gold-shaped); optionally bus-ify room-bounding-line; **update C11 §11 matrix** (Handrail/Furniture rows are stale) and add the C11/C16 Known-Debt note.
- **Effort:** S. **Deps:** none. **Verify gate:** identical geometry; docs match code.

**Launch-safety statement:** every phase is per-element, behind a geometry-identical + one-undo verify gate, with dual-write interim. Nothing here modifies the persistence codec, CRDT/collab merge, WebGPU renderer, or generation-perf machinery. Sequenced after those; can be paused at any element boundary without regression.

---

## 5 — STEP 6: ready-to-paste rows (orchestrator inserts — do NOT edit trackers/contracts)

### 5.1 — Issue-Log rows (V1-LAUNCH-READINESS-AUDIT §Issue Log — 6-col format)

```
| L-381  | 2026-07-17 | **[P2 - PIPELINE] Element-creation pipeline is four-tier, not uniform — bring every element to the walls/curtain-walls gold standard** | C11 §2/§5/§11, C16 §3.2/§8; P6. Base row for the pipeline-soundness audit (docs/04-reference/ELEMENT-PIPELINE-SOUNDNESS-AUDIT.md). GOLD=wall/CW/slab/column/beam/ceiling/furniture; NEAR-GOLD=roof/floor/handrail/lighting; LEGACY Path-C=stair/lift/room-bounding-line. Generation WORKS post-L-376d (undo coalesced) → consistency/tech-debt, not launch-blocking. | OPEN — UNASSIGNED/TBD (phased L-381a…c) | route -> pipeline/tech-debt queue |
| L-381a | 2026-07-17 | **[P2 - PIPELINE] Stairs + lifts on legacy Path C — no render bridge + `stair.batch.create` is a no-op stub + `registerStairHandlers` is dead code + lifts have no bus surface** | C11 §11.1 (STAIR-BUS-MIGRATION), §7.4, §10.2 Inv.2; C16 §3.2. Highest value (office 78 stairs + 80 lifts). Real `CreateStairBatchHandler` exists but never registered (plugins/stair/src/handlers/index.ts:57 vs engineLauncher.ts:48-74). Order-critical: render bridge (`§FT-STAIR`/`§FT-LIFT`) BEFORE batch dispatch or stairs/lifts stop rendering. | OPEN — UNASSIGNED/TBD | route -> pipeline/tech-debt queue |
| L-381b | 2026-07-17 | **[P2 - PIPELINE] Roof/Floor lack `*.batch.create` fan-out + generation executors dispatch legacy `Create*Command` for slab/CW/roof/floor that already have a gold bus batch** | C11 §5.4.3 (floor dual-command), §7.4, §11; C16 §8. Dispatch-site convergence (OfficeBuildingExecutor.ts:387/743/1196/1326). Floor dual-command retirement gated on rooms/walls plugin-store residency — do NOT force for launch. | OPEN — UNASSIGNED/TBD | route -> pipeline/tech-debt queue |
| L-381c | 2026-07-17 | **[P3 - PIPELINE] Handrail/Lighting batch fan-out + room-bounding-line bus-ification + C11 §11 matrix is STALE (Handrail/Furniture rows say LEGACY-ONLY but were bridged in §7.0)** | C11 §11 matrix, §11.1; C16 §8. Doc-accuracy + low-freq batch. Includes the C11/C16 Known-Debt note text (§5.3 of the audit). | OPEN — UNASSIGNED/TBD | route -> docs + pipeline/tech-debt queue |
```

### 5.2 — Implementation-plan PHASED task blocks (V1-LAUNCH-IMPLEMENTATION-PLAN)

```
### L-381a — Stairs + Lifts → gold (Phase 1, highest value)  [P2]
Deps: none (L-376d generation-undo-coalesce already shipped — do NOT re-solve undo).
1. CEB: add geometry-complete `stair.created` + `stair.batch.create` cases (CommandEventBridge.ts).
2. initTools `§FT-STAIR` render bridge → StairStore + StairRailingStore + StairLandingStore
   + viewDependencyTracker.registerElement + bimManager.registerElement (mirror §FT-HANDRAIL).
   Handle 2-level span + railing/landing sub-elements.
3. Register real stair handlers: import + call registerStairHandlers(_bus) in engineLauncher.ts;
   DELETE the stair.batch.create no-op stub (initBusHandlers.ts:159).
4. Lift: new verticalCirculation.create/.batch.create bus type + handler + CEB + §FT-LIFT bridge
   (no existing bus surface — build from scratch).
5. Repoint OfficeBuildingExecutor (:1105 stair, :1014 lift), Residential + House executors at
   the bus batch; keep legacy Create*Command as drop-covered dual-write until verify gate green.
VERIFY GATE: office gen → byte-identical stair/lift/railing/landing geometry + rooms; ONE undo
entry; 3D + plan identical; no stair.batch.create no-op reached. Effort: L.

### L-381b — Roof/Floor batch + executor convergence (Phase 2)  [P2]
1. Add roof.batch.create + floor.batch.create handlers + CEB batch cases.
2. Converge OfficeBuildingExecutor slab/CW/roof/floor dispatch onto existing gold bus batch
   commands (slab/CW already have them — dispatch-site cleanup).
3. Floor: preserve C11 §5.4.1 inner-face rule; DEFER CreateFloorCommand retirement (C11 §5.4.3
   blocker: rooms/walls not yet plugin-store-resident).
VERIFY GATE: geometry-identical roofs/floors/slabs; one undo entry. Effort: M.

### L-381c — Handrail/Lighting batch + room-bounding-line + doc sync (Phase 3)  [P3]
1. Add handrail.batch.create + lighting.batch.create CEB batch cases.
2. Optional: bus-ify room-bounding-line.
3. Update C11 §11 matrix (Handrail=NEAR-GOLD, Furniture=GOLD); add C11/C16 Known-Debt note.
VERIFY GATE: identical geometry; docs match code. Effort: S.
```

### 5.3 — C11 / C16 Known-Debt note text (for insertion into C11 §11.1 / C16 §3.2 by a human)

```
KNOWN-DEBT (pipeline uniformity, audited 2026-07-17 — L-381): The element-creation
pipeline is four-tier: GOLD (wall/CW/slab/column/beam/ceiling/furniture — bus *.batch.create
+ CEB *.created fan-out + initTools render bridge), NEAR-GOLD (roof/floor/handrail/lighting —
bus single-create + bridge, no batch fan-out), HOSTED (door/window/opening via §P2.3), and
LEGACY Path-C (stair, stair-railing, stair-landing, lift/verticalCirculation, room-bounding-line).
The gold pattern is MANDATED (C16 §8/CA-12/B-6; C11 §2/§5). Stair-on-Path-C is the sanctioned
transitional exception (C16 §3.2) tracked as STAIR-BUS-MIGRATION (C11 §11.1). Two divergences to
close: (1) plugins/stair ships a complete handler set incl. CreateStairBatchHandler but
registerStairHandlers() is never called (engineLauncher.ts) — the LIVE stair.batch.create is the
no-op structural stub (initBusHandlers.ts:159), so a caller gets a silent create-nothing;
(2) lift/verticalCirculation has NO bus surface at all (violates C11 §4 convergence). Generation
WORKS today (legacy Create*Command renders + L-376d coalesces undo) — this is consistency/tech-debt
(P2), not a launch blocker. C11 §11 matrix Handrail/Furniture rows are STALE (both bridged in §7.0).
```

### 5.4 — Master-tracker row (docs/03-execution/plans/master-execution-tracker.md)

```
| L-381 | Element-creation pipeline soundness — unify all element types to the walls/curtain-walls gold standard (bus *.batch.create + CEB fan-out + render bridge). 4-tier audit; phased L-381a stairs/lifts, L-381b roof/floor + executor convergence, L-381c handrail/lighting + doc sync. P2 tech-debt (gen works post-L-376d). | AUDIT COMPLETE / IMPL UNASSIGNED | docs/04-reference/ELEMENT-PIPELINE-SOUNDNESS-AUDIT.md |
```

---

## 6 — Conflicts needing a human decision

1. **Stair migration strategy** — (a) register the existing `plugins/stair` handlers (activates `CreateStairBatchHandler`, adds render bridge) vs (b) keep stair on legacy but delete the no-op stub + dead `registerStairHandlers` to remove the silent-no-op trap. (a) is the gold target; (b) is the minimal safety fix. Recommend (a) but sequence the render bridge first.
2. **Floor dual-command** (C11 §5.4.3) — retiring `CreateFloorCommand` is blocked on rooms/walls becoming plugin-store-resident. Do NOT attempt for launch; L-381b keeps both.
3. **Room-bounding-line** — bus-ify vs accept as a derived internal artifact (it is not a user-facing "element"). Low value; defer.
4. **Lift as a first-class bus element** — requires designing a new `verticalCirculation` command family + schema surface; larger than a bridge. Confirm scope before L-381a.
