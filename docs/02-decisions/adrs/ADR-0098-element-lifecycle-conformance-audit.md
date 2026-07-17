# ADR-0098 — Element-Lifecycle Conformance Audit (movement · placement · hosting · rotation · properties · dimensions · materials)

> **Status**: ACCEPTED (audit of record) · **Date**: 2026-07-02 · **Supersedes**: refreshes the archived
> `docs/archive/pryzm3-internal/ELEMENT-OPERATIONS-AUDIT-2026-05-17.md` (now ~7 weeks stale) against HEAD.
> **Governance note**: Project rules forbid new `*-AUDIT.md` derivative docs. This audit is therefore recorded
> as a canonical ADR. The remediation backlog it produces lives in
> `docs/04-reference/element-lifecycle-remediation-plan.md`.
> **Authoritative contracts referenced**: C03 (schemas/commands/state), C04 (rendering/scheduling),
> C10 (performance/observability), C11 (element-creation pipeline), C15 (hosted-element contract),
> C16 (command-authoring protocol), C18 (element preview visual contract).

---

## 1. Context & method

The founder requested a detailed, architecturally-sound audit of **every element type** across seven
operations — **movement, placement, hosting, rotation, properties-panel editing, dimension change,
material change** — documented against the contracts, specs and ADRs.

Method: (a) re-read C15 (hosted elements) + C11 (creation pipeline) + the command surface in
`packages/command-registry/src`; (b) enumerate the real `Create*/Update*/Set*` command classes; (c) fold in
four **live, reproduced** defects captured from production console sessions on `pryzm.fly.dev` during this
work cycle; (d) verify claims against source where feasible and mark **NEEDS-VERIFICATION** honestly where a
cell was not traced to source (each with the file to open). No cell is marked ✅ without a code or contract basis.

Verdict legend: **OK** (conforms, verified) · **GAP** (works but diverges from contract / inconsistent) ·
**BROKEN** (reproduced defect) · **N/V** (needs verification — file cited).

---

## 2. Executive findings (severity-ranked)

| # | Severity | Finding | Contract violated | Status |
|---|---|---|---|---|
| **F1** | **BLOCKER** | **Moving a wall that hosts a door/window freezes the app.** `DoorBuilder.rebuildForWall(wallId)` does an unbounded `O(all-doors-in-project)` scan to find the doors on ONE wall, called once **per rebuilt wall**; `WindowBuilder.rebuildForWall` is identical for windows. Combined with `WallJoinResolver.resolveLevel` (`O(N²)` endpoint clustering over the whole level for a single moved wall) inside a **synchronous, non-yielding** `WallRebuildCoordinator._flush`, the main thread pegs. | C15 §3 (per-wall rebuild), C10 (perf budget), C15 §9 (rebuild-duration span — would have surfaced this) | Fix in flight (`§FIX-HOSTWALL-DOOR-INDEX` + move-coalesce) |
| **F2** | **BLOCKER** | **Project-open freeze** on some persisted projects (e.g. "Madrid", 683 el / 192 walls / 7 levels): all elements load, then the UI (viewport **and** buttons) locks. The `§LOAD-REDETECT-FREEZE` skip *is* firing (`redetect_sweep elapsed=0.0ms`), so the peg is a **post-load rebuild/re-anchor storm**, not the redetect sweep itself. | C04 (frame scheduling), C13 (project lifecycle) | Open — needs isolation |
| **F3** | **MAJOR** | **Per-edit redetect + full plan re-projection storm.** Every wall mutation fires `REDETECT_ROOMS` **and** a whole-level plan re-projection chain (`EdgeProjector` → `HiddenLineRemoval` → `NativeElementMeshExporter` → door/window symbol builders). A 300 ms soft-coalesce exists but the per-edit whole-level cost is the amplifier behind F1/F2. | C04, C10 | Open |
| **F4** | **MAJOR** | **3D selection picks the wrong element** and degrades with scene density (clicking a window selects a nearby door). Pick resolution is healthy (`pick:rendered=1.07`); the defect is the **search-radius fallback** returning the nearest/larger-footprint neighbour instead of the id at the exact cursor pixel. | C15 §11/§12 (selection intent), C06 (tools) | Fix characterized (`§SELECT-EXACT-PIXEL-FIRST`), folded into this plan |
| **F5** | **MAJOR** | **No first-class Rotation operation.** There is **no `Rotate*Command`** anywhere in `packages/command-registry/src`. Rotation is element-specific or absent: walls rotate only by moving endpoints (`UpdateWallBaselineCommand`, guarded by C15 §7 baseline-reversal at 90°); furniture/columns rotate (if at all) via a `params` field on `Update<Family>ParametersCommand`; most element types expose no rotation path. | C11/C16 (uniform command authoring), C03 (command coverage) | Open — architectural |
| **F6** | **MAJOR** | **Material/finish command coverage is uneven.** Walls (`UpdateWallColorCommand`), doors (`UpdateDoorFrameColorCommand`/`UpdateDoorLeafColorCommand`), windows (`UpdateWindowFrameColorCommand`) have dedicated commands; slabs/floors/ceilings/roofs route through **layer** commands (`UpdateSlab/Floor/CeilingLayersCommand`); **columns, beams, stairs, handrails, furniture, lighting, plumbing have no dedicated material/finish command** — they fall to a generic parameter update or nothing. | C18 (preview visual contract), C03 | Open — architectural |
| **F7** | **MAJOR** | **WebGL2 ghost/duplicate-on-rotate.** During continuous camera rotation on the WebGL2 backend (WebGPU is clean) previous frames "trail". Root cause: the OBC base canvas WebGL context is created `preserveDrawingBuffer:false`; `§FIX-OBC-BASE-STALE-COMPOSITE` clears it only once at activate/live-swap, not per move-frame, so the stale buffer resurfaces under the transparent overlay during `§PERF-WEBGL2-RENDER-ON-MOVE` repaints. | C04 (rendering) | Fix characterized (`§FIX-WEBGL2-GHOST-ON-ROTATE`) |
| **F8** | **MINOR** | **Movement is non-uniform** (no generic `MoveElementCommand`): wall=baseline, door/window=offset, furniture=params, column/beam=`Update*Command`. Works, but every new element type re-invents move semantics. | C16 (authoring protocol) | Open — architectural |
| **F9** | **MINOR** (carried) | Residual bus-bridge fallbacks (`initBusHandlers` E.5.6 no-op if `commandManager` absent), `window.*` init-ordering dependency with no `__pryzmInitComplete` sentinel, `WallPlanToolHandler` passing `commandContext` where `metadata` is typed. | C02 (boot), C14 | Carried from 2026-05-17 audit §9/§10 |

---

## 3. The canonical edit pipeline (per contract)

All seven operations are expected to flow through **one** shape (C11 §creation, C15 §3/§8, C16):

```
UI intent (gizmo / plan tool / properties panel / AI / CRDT)
   → runtime.bus.executeCommand('<family>.<verb>', payload)      [C03 §4 command bus]
   → E.5.x bridge → commandManager.execute(new <Verb><Family>Command(payload))
   → store.update(...)  (single atomic mutation; C15 §6 openings/children invariant)
   → emits bim-<family>-updated
   → <Family>RebuildCoordinator / Builder re-bakes ONLY the affected element(s)   [C15 §3]
   → OpenTelemetry span with durationMs + fragmentCount                            [C15 §9, C10]
```

Hosted elements add the **dual-store rule** (C15 §8.1): any `offset` mutation writes **both**
`wallStore.updateDoor/Window` *and* `doorStore/windowStore.update`. The audit confirms the offset commands
honour this (`SetDoorOffsetCommand`, `SetWindowOffsetCommand` post-DW-14). The **conformance failures are not
in the command layer** — they are in the **rebuild fan-out** (F1/F3: per-wall rebuild degenerates into
whole-level `O(N²)` + `O(all-openings)` work) and in **coverage** (F5/F6: rotation & materials are not
uniformly commanded).

---

## 4. Conformance matrix — rows are the 7 audited operations

### 4.1 Walls & curtain walls

| Operation | Verdict | Path / command | Notes vs contract |
|---|---|---|---|
| Placement | OK | `CreateWallCommand` (Path A dual-write); `CreateCurtainWallCommand` (own mode picker) | C11 conformant |
| Movement | **BROKEN when hosting openings** | `UpdateWallBaselineCommand` (writes `baseLine` + `_sourceBaseLine`, WS-01 fix) | F1 — freeze; empty-wall move is OK |
| Hosting | OK (correctness) / **BROKEN (perf)** | `wall.openings[]` + `childrenIds` atomic (C15 §6) | invariant correct; re-anchor cost is F1 |
| Rotation | GAP | endpoint move only; C15 §7 blocks ≥90° reversal | no rotate command (F5) |
| Properties | OK | `element.updateParameters` bridge (PR-01 fix) | conformant |
| Dimensions | OK | `UpdateWallDimensionsCommand`, `UpdateWallHeightCommand`, `SetWallWidthCommand`, `SetAllWallsWidthCommand` | good coverage |
| Materials | OK (walls) | `UpdateWallColorCommand`, `SetAllWallsVisualPropertiesCommand`, `UpdateWallLayersCommand` | conformant |

### 4.2 Doors & windows (hosted)

| Operation | Verdict | Path / command | Notes |
|---|---|---|---|
| Placement | OK | `CreateWallOpeningCommand` (Path B + §DPT/§WPT-HARDEN fallback) | C11/C15 §13 |
| Movement (along wall) | OK | `SetDoorOffsetCommand` / `SetWindowOffsetCommand` (dual-store, C15 §8.1) | clamp per C15 §5 |
| Movement (via host wall) | **BROKEN** | re-anchor on host rebuild | F1 |
| Hosting | OK | offset model (C15 §2) | correct |
| Rotation | N/A by design | hosted elements don't rotate independently | conforms to C15 |
| Selection | **BROKEN** | `findSelectableRoot` correct, but gpu-pick chooses wrong candidate | F4 |
| Properties | OK | `UpdateDoorParameterCommand` / `UpdateWindowParameterCommand` | conformant |
| Dimensions | OK | `UpdateDoor/WindowWidthCommand`, `…HeightCommand`, `…SillHeightCommand` | good coverage |
| Materials | OK | `UpdateDoorFrame/LeafColorCommand`, `UpdateWindowFrameColorCommand` | conformant |

### 4.3 Horizontal / envelope — slabs, floors, ceilings, roofs

| Operation | Verdict | Path / command | Notes |
|---|---|---|---|
| Placement | OK | `CreateSlab/Floor/Ceiling/RoofCommand` (Path C) | C11 |
| Movement | N/V | `UpdateSlabLevelCommand` / `UpdateSlabPolygonCommand` (elevation via level) | open `packages/command-registry/src/slabs/*` |
| Hosting/binding | N/V | `FloorSlabBindingHandler`, `RoomFinishSyncService` | verify slab↔wall & finish↔room binding |
| Rotation | GAP | no rotate; polygon re-sketch only (`UpdateSlabSketchCommand`) | F5 |
| Properties | OK | `UpdateSlab/Floor/Ceiling/RoofCommand` | conformant |
| Dimensions | OK | `UpdateSlabDimensionsCommand`, `UpdateSlabLayersCommand`, `UpdateFloor/CeilingLayersCommand` | conformant |
| Materials | GAP | via **layer** commands only — no single "material" affordance | F6 |

### 4.4 Structural / circulation / MEP / furnishings — columns, beams, stairs, handrails, lifts, furniture, lighting, plumbing, rooms, grids

| Operation | Verdict | Path / command | Notes |
|---|---|---|---|
| Placement | OK | `CreateColumn/Beam/Stair/Handrail/Furniture/Lighting/PlumbingFixtureCommand` (Path C) | C11 |
| Movement | GAP / N/V | `UpdateColumn/BeamCommand`, furniture via `UpdateFurnitureParametersCommand`(position) | non-uniform (F8); verify gizmo→command wiring |
| Hosting/anchoring | N/V | beam↔grid/columns, stair↔levels, furniture↔room/floor, lighting↔ceiling, plumbing↔wall | trace each `Create*`/anchor path |
| Rotation | **GAP/absent** | furniture rotation via params (N/V); columns/beams/stairs: no rotate path found | F5 — most impactful here |
| Properties | OK | `Update<Family>ParametersCommand` / `UpdateElementParameterCommand` (generic) | conformant |
| Dimensions | N/V | `UpdateStairParametersCommand`, `UpdateStairFlightsCommand`, column/beam via `Update*Command` | verify dimension fields |
| Materials | **GAP/absent** | no dedicated material command for these families | F6 |

---

## 5. Contract-violation mapping (what to fix to conform)

- **C15 §3 + §9 / C10** — a single-element edit must rebuild only that element and emit a duration span.
  F1/F3 violate this: bound the re-anchor scan (wall→openings index), keep the openings-only/body-only fast
  path (ADR-0257) for host moves, and coalesce redetect + plan re-projection to one settle.
- **C04** — F2/F7: per-move rendering must start from a clean buffer (WebGL2) and post-load work must yield.
- **C15 §11/§12 / C06** — F4: selection must resolve the id under the exact cursor pixel first.
- **C11/C16 / C03** — F5/F8: introduce a uniform **transform** command family (`Move`/`Rotate`) or document
  per-family equivalents so every element type has a consistent, discoverable movement & rotation path.
- **C18 / C03** — F6: introduce a uniform **material/finish** affordance across all element families
  (dedicated command or a documented generic path), so materials are editable for structural/MEP/furnishings.

---

## 6. Decision

1. Record this audit as ADR-0098 (no `*-AUDIT.md`).
2. Treat **F1, F2** as ship-blockers (freezes) — fix first; **F3–F7** as the next wave; **F5/F6/F8** as an
   architectural workstream (uniform transform + materials command families).
3. Produce a prioritized, milestone-based remediation plan at
   `docs/04-reference/element-lifecycle-remediation-plan.md` with acceptance criteria + regression tests per item.
4. Every fix carries a `§`-tag and, where it changes a contract, a superseding ADR — never a new audit doc.

## 7. Consequences

- Positive: a single, current, contract-anchored map of element-operation conformance; the two freezes get
  explicit owners; the rotation/materials architectural gaps are now visible instead of latent.
- Cost: the **N/V** cells (slab movement/binding, structural/furniture rotation & dimensions, hosting/anchor
  traces) still need per-file verification — scoped as Plan Workstream 0 so the matrix reaches full ✅/GAP/BROKEN.
- The stale `docs/00_Contracts/...` path in `CLAUDE.md` is **wrong**; contracts live at
  `docs/02-decisions/contracts/`. Flagged for a docs fix so future automated passes don't thrash.
