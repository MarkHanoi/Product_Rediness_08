# Residential Building (Multi-Family) — Audit, Design & Implementation Plan

> **Status**: PLAN (no production code) · **Date**: 2026-06-22 · **Author**: engine/typology audit
> **Scope**: a NEW generative typology — **"Residential building — multi-family"** — added as a peer
> typology pack alongside the apartment (`apartment`) and house (`casa-unifamiliar`) packs.
> **Reads grounded in** (cite-anchors used throughout):
> `docs/04-reference/LAYOUT-GENERATION-ALGORITHM.md` (HE.0–HE.5, §13–§20),
> `packages/ai-host/src/workflows/houseLayout/`, `packages/ai-host/src/workflows/apartmentLayout/`,
> `apps/editor/src/ui/house-layout/`, the stair/curtain-wall element stacks, and the contract suite
> (C11 / C15 / C19 / C50 / C53) + ADRs (0063 / 0067 / 0068 / 0069 / 0075).
> **Governing rule (CLAUDE.md)**: when code disagrees with a contract, the code is wrong; this plan
> never invents a slash command or a contract — it cites the canonical anchors.
>
> **This document is the single entry point** for building the feature. A new engineer should be able
> to start from §2 (the reuse map), build the §7 slices in order, and check each against §8 (risks).

---

## 1. Executive summary

A **multi-family residential building** is a larger-footprint stack of storeys where:

- the **ground floor** holds ONLY the shared **core** (central staircase + lift + a small circulation
  area) **plus commercial units** that open directly to the outside (glazed shopfronts);
- every **upper floor (1..20)** repeats the **same core in the same plan position**, then a **per-level
  public corridor** whose sole job is to reach **each apartment's single main door**;
- each apartment is a **T1/T2/T3/T4** unit (≈ 1/2/3/4-bed) laid out by the existing **D-TGL apartment
  engine** as its own sub-plate; the building may **mix** typologies on a level.

**The founder's thesis — "this is a mix of the multi-storey HOUSE orchestration and the single-plate
APARTMENT engine" — is VALIDATED by the code, with three concrete corrections:**

1. **House orchestration is reusable, but the core-placement rule INVERTS.** The house puts the stair
   at the **worst-aspect back corner** (`stairPosition.ts:557` `chooseStairCorePosition`,
   `§STAIR-DEFAULT-BIAS` / `PERIMETER_PREFERENCE`); the founder wants the multi-family core at the
   **CENTRE of the footprint**. This is a *new placement rule*, documented in §3.1 as a deliberate
   divergence (NOT a bug fix to the house).
2. **The apartment engine treats ONE plate.** In the house, "one storey = one plate = one program"
   (`houseOrchestrator.ts:enumeratePerStorey`). In the multi-family building, **one storey = N
   apartment plates + 1 corridor + 1 core**. That is the genuinely-new structural piece: a **per-level
   plate partition** (core + public corridor + N apartment cells) that runs the *unchanged* D-TGL
   engine **once per apartment cell**, not once per storey. This is the single biggest net-new design.
3. **The public corridor is exactly the §18/§20 circulation-spine problem, lifted one level up.** Where
   the house solves "every ROOM touches a corridor on a single plate", the multi-family building must
   solve "every APARTMENT DOOR touches the public corridor on a level plate" — same Steiner-tree /
   single-load doctrine (`§SINGLE-LOAD-PERIPHERAL` / `§UPPER-RING-CORRIDOR` / `§SPINE-TREE`,
   reference §20.1), at the building scale.

Net: **most of the pipeline is SHARE or ADAPT** (the D-TGL engine, the executor batch/finish shape, the
preview-modal architecture, the post-gen chain). The genuinely-NEW work is (a) a **building
orchestrator** that partitions each level into core + corridor + apartment cells; (b) a **new
vertical-circulation (lift) element category**; (c) a **ground-floor commercial-shell** mode using
curtain walls; (d) a **new typology pack + preview modal + executor seam**. The engine's internal
room-quality code stays **FROZEN** (HE.0).

---

## 2. Reuse map (SHARE / NEW / ADAPT) — the core deliverable

> Legend: **SHARE** = reuse unchanged · **ADAPT** = small, described change · **NEW** = genuinely new.
> "Plate" = the area handed to one D-TGL call. The multi-family building introduces a level that holds
> **N plates** (one per apartment) instead of the house's one-plate-per-storey.

| # | Pipeline stage | Verdict | Grounding (file:line) | Notes / what changes |
|---|---|---|---|---|
| 1 | **Footprint → frame** (parcel boundary → ShellAnalysis, principal-axis rotation) | **SHARE** | `houseFromBoundary.ts:77`; `HouseLayoutExecutor.ts:142` `analyseActiveShell`; `runDeterministicLayout.ts:150-225` (`§PRINCIPAL-AXIS`); HE.1/HE.3 | The building shell comes from the same C19 parcel boundary. The frame boundary (world↔layout) is identical; on an axis-aligned plate the angle is 0 (byte-identical). |
| 2 | **Storey/level allocation** (mint N levels + roof level) | **ADAPT** | `HouseLayoutExecutor.ts:378` (mint storeys), `:407` (roof level via `§ROOF-LEVEL`); `storeyAllocation.ts:70` `allocateProgramToStoreys` | Reuse the *level-minting* loop (`AddLevelCommand` per level + roof). REPLACE the *program allocation*: instead of "split a house brief into ground-public / upper-private storeys", allocate **role = `commercial-ground` vs `residential-upper`** and, per upper level, an **apartment mix** (§6). `allocateProgramToStoreys` itself is NOT reused — it is house-program-specific. |
| 3 | **Core reservation** (stair core rect, shared XZ on every storey) | **ADAPT** | `stairCore.ts:275` `reserveStairCoreShaped`; `stairPosition.ts:557` `chooseStairCorePosition`; `houseOrchestrator.ts:355` `containStairCoreUpstream`; types `StairCore` `types.ts:124` | Reuse the *mechanism* (one XZ rect repeated on every level + `containStairCoreUpstream` so the carved keep-out == shipped footprint, ADR-0063 H3). **CHANGE the placement rule** to CENTRE (§3.1) — a new `'central'` candidate that wins (today central is a fallback, `stairPosition.ts:686`). The core is now **stair + lift** → a wider keep-out (two keep-outs, §3.4). |
| 4 | **Per-storey loop** (orchestrator iterates levels, stamps levelId+elevation, calls engine) | **ADAPT** | `houseOrchestrator.ts:467` `enumeratePerStorey`; `:762` `assembleHouse`; HE.2 (a) | Reuse the storey-loop *skeleton* + level/elevation stamping + slab-void-per-non-ground-slab + roof cap (`assembleHouse` (e)/(f), `:833`/`:847`). **INSERT** a per-level **plate partition** step (NEW, §3) between "reserve core" and "call engine", because each level now hosts N apartment plates, not one. |
| 5 | **Per-level plate partition** (level → [core] + [public corridor] + [N apartment cells]) | **NEW** | — (new; reuses §18/§20 spine doctrine + `deriveCorridorSpine.ts`, `clipToConvexShell`) | The decisive new piece. Carve the central core keep-out, derive the **public corridor** as a Steiner spine that reaches every apartment door, partition the remaining net area into N apartment polygons sized by min/max m² + typology mix (§6). Each apartment polygon becomes one D-TGL plate. |
| 6 | **Subdivision** (plate → rooms) | **SHARE** | `generateDeterministicLayouts` `runDeterministicLayout.ts:88`; `enumerate.ts`; `subdivide.ts`; HE.0 ("FROZEN, called once per storey, unchanged") | The engine is called **once per apartment cell**, unchanged. T1–T4 become an `ApartmentProgram` (§6). The internal pipeline (P1–P9) is untouched. (Open ceilings §13 polygon-native and §14 fill apply identically — see risks §8.) |
| 7 | **Walls / doors** (footprints → walls + openings) | **SHARE** | `wallsAndDoors.ts` (P4); `executePlan.ts` `buildLayoutCommands:460`; `wall.batch.create` + `wall.createOpening` | Reuse `buildLayoutCommands` per apartment cell + per corridor + per core surround. The apartment's single **main door** onto the corridor is just a door whose host wall is the apartment's corridor-facing wall (the §20 "every room touches the corridor" guarantee promoted to "every apartment touches the corridor"). |
| 8 | **Windows** (per-room window emission) | **SHARE** | `windowEmission/emitWindows.ts`; `windowEmission/shellWallMatch.ts` (`§DIAG-PARTY-WALL` blind-façade suppression) | Each apartment cell emits windows on its façade edges exactly as today. **Party walls** between adjacent apartments are blind (no window) — `shellWallMatch.ts` already suppresses windows on non-exterior walls (`§DIAG-PARTY-WALL`), so this works by construction once an apartment cell's "exterior" edges are correctly the building-façade edges. |
| 9 | **Ground-floor commercial shell** (glazed shopfronts + entrance) | **NEW** (composes existing curtain-wall) | `plugins/curtain-wall/src/handlers/CreateCurtainWallBatch.ts:55` (`curtain-wall.batch.create`); schema `packages/schemas/src/elements/CurtainWall.ts:23` | NEW orchestration that emits the ground perimeter as **curtain walls** (commercial glazed shells) + normal walls for the core surround + the entrance-area walls. The curtain-wall element + its batch command are SHARE (reused as-is). |
| 10 | **Vertical-circulation (lift) element** | **NEW** | (mirrors the stair stack — §4; the stair touchpoints below are the template) | New L0 schema, geometry package, plugin, command(s), registration touchpoints, IFC mapping, CREATE-panel category. See §4 for the full 17-touchpoint checklist. |
| 11 | **Preview modal** ("Choose a layout") | **ADAPT** | `HouseLayoutModal.ts:458`; `houseModalHtml.ts` (`buildHouseModalHtml:524`, per-storey tabs `buildPerStoreyTabsHtml:275`); `HouseLayoutController.ts:168` | Mirror the §MODAL-DYNAMIC house modal. **CHANGE the card model** to show per-level cards where each level renders the **core + corridor + N apartment plates** (a level thumbnail, not a single plate). The form changes to the §5 input model (min/max m², T1–T4 multi-select, levels, commercial toggle). The thumbnail builder is reused (`buildLayoutThumbnailSvg`, ADR-0075 §17.2 faithful render) per apartment plate. |
| 12 | **Executor** (mint levels → batch → finish openings) | **ADAPT** | `HouseLayoutExecutor.ts:334` `execute`; `:1280` ONE `runBatch`; `:3059` `_finishOpenings` | Reuse the **mint → ONE batch → deferred openings** shape (one undo). Per level the batch now creates: core walls + lift + stair + **corridor walls** + **N apartment partition sets** + (ground) curtain-wall shopfronts. `_finishOpenings` adds the apartment main doors + corridor↔core door + the main building entrance door. |
| 13 | **Post-gen chain** (name → floor/ceiling → furnish → light) | **SHARE** | `runHousePostGenChain.ts:163` `runChainForLevel`; `:269` orchestrator; `houseFanoutGuard.ts` | Reuse per-level fan-out unchanged. It already loops levels with `setActiveLevel` + settle yields; it does not care that a level holds N apartments — it names/finishes every detected room on the level. Graph-authoritative rooms (ADR-0069) apply per apartment cell. |
| 14 | **Stair core element + slab void + roof** | **SHARE** | `HouseLayoutExecutor.ts:2373` `_createStair`, `:2341` `_createStorageSlab`, `:2907` `_createRoof`; `assembleHouse` (e)/(f) | Reuse stair creation, the slab void punch (`SlabVoid` `types.ts:182`), and the roof cap. The **void is now over the whole core** (stair + lift), so the void rect = the core keep-out, not just the stair rect. |
| 15 | **Living Graph / UBG projection** | **SHARE** | HE.1 DERIVED block; ADR-0061 (projection, not input) | Rooms/walls/doors/stairs/lifts become read-only graph nodes post-commit. The lift node is new (a `verticalCirculation` element type) but the projection mechanism is unchanged. |
| 16 | **Typology pack registration** (C50) | **NEW** | `C50-TYPOLOGY-PIPELINE.md` §1.1–§1.8; `packages/typology-pipeline/` | A new `residential-building` pack: a `TypologyStageBundle` overriding Stage 4 (generative = the building orchestrator) + Stage 3 (constraints = T1–T4 program rules) + Stage 7 (bim-emit = the executor command set). Registered in `composeRuntime()` per §1.1. |
| 17 | **Preview↔execution parity** (`§DIAG-PARITY`) | **SHARE (extend)** | ADR-0075 PC1–PC4; reference §17 | Reuse the parity diagnostic. The building executor must emit `§DIAG-PARITY` per level (per apartment cell) so the multi-plate build is provably faithful to the multi-plate preview. New transforms (corridor carve, commercial shell) are gated per PC2. |

**Tally:** of 17 stages — **SHARE: 8** (1, 6, 7, 8, 13, 14, 15, 17-mechanism), **ADAPT: 5** (2, 3, 4, 11,
12), **NEW: 4** (5 plate-partition, 9 commercial shell, 10 lift element, 16 typology pack). The
room-quality engine and the build/finish machinery are reused; the net-new surface is the
**building-level orchestration** + the **lift element** + the **commercial-ground** mode + the **pack**.

---

## 3. The orchestration — how it differs from `houseOrchestrator`

The multi-family orchestrator (call it `buildingOrchestrator`, a new file in
`packages/ai-host/src/workflows/residentialBuilding/`) reuses the **storey-loop skeleton** of
`houseOrchestrator.ts:467` (`enumeratePerStorey`) and the **assemble** stitch (`:762`), but replaces the
program allocation and inserts a per-level plate partition. The differences, point by point:

### 3.1 Centred core (NOT worst-aspect corner) — the deliberate divergence

The house rule is explicit and inverts the founder's intent for this typology:

- `chooseStairCorePosition` (`stairPosition.ts:557`) scores candidates with
  `PERIMETER_PREFERENCE = 1.0` (central pays this; perimeter pays 0) + an `ASPECT_WEIGHT` term that
  prefers the **worst-aspect (poor-light) wall** (`§STAIR-WORST-ASPECT`, `:581-607`), so the house
  stair lands at a **back corner**. Central wins **only** as a fallback when no perimeter candidate fits
  or on a concave plate with no corner (`:686-687`).
- The multi-family core must be **CENTRAL by rule**. The clean implementation is a **new placement
  policy** parameterised on the typology — `reserveStairCoreShaped` / `chooseStairCorePosition` gain a
  `corePlacement: 'worst-aspect-corner' | 'centre'` input; the building pack passes `'centre'`, which
  forces the `central` candidate (X-centre, Y-centre of the footprint) and skips the perimeter/aspect
  scoring entirely. This is **additive** — the house path keeps `'worst-aspect-corner'` and stays
  byte-identical (no regression to `casa-unifamiliar`). Document it as a typology divergence, not a fix:
  a central core is correct for a building with circulation on all sides; a corner stair is correct for
  a single dwelling that should not waste good frontage on circulation.
- `containStairCoreUpstream` (`houseOrchestrator.ts:355`, ADR-0063 H3) still solves containment in the
  world frame so the carved keep-out == the shipped footprint. A centred core is *trivially* contained
  (it is far from the shell edges), so the `§DIAG-STAIR-RULE` R1/R4 (corner/in-shell) verdicts are
  relaxed for this typology — the new rule is **R-CENTRE: the core AABB centroid ≈ the footprint
  centroid within a tolerance**.

### 3.2 The public entrance corridor → core (ground)

The **main entrance door** (a new modern glazed entrance door type, built separately — **referenced,
not designed here**; note that no such schema exists yet — `grep` of `packages/schemas/src/elements`
for "entrance"/"glazed" returns nothing, confirming it is genuinely net-new/external) opens into a
**public entrance corridor** that arrives at the **core public area** (stair + lift + circulation). On
the ground floor this corridor is the only residential circulation — there are **no apartments on the
ground** (§3.3). The corridor is derived exactly as the upper-level corridor (§3.5) but degenerate: a
short single run from the façade entrance to the core. Reuse `entranceDoor/entranceDoor.ts`
`resolveEntranceDoor` (`§A.21.D29`) *concept* (pick the hall's exterior shell wall, centre + clamp a
door clear of windows) but target the **building** entrance wall, not a house hall.

### 3.3 Ground-floor commercial ring (curtain-wall shell) + NO apartments

The ground level holds: the **central core** (stair + lift + circulation) **+ commercial units** that
ring the core and open directly to the outside. Implementation:

- Mint the ground **perimeter as curtain walls** (glazed shopfronts) via `curtain-wall.batch.create`
  (`CreateCurtainWallBatch.ts:55`), one curtain-wall segment per commercial-unit frontage. The
  curtain-wall element is SHARE — see the §2 reuse map row 9 and the payload shape below.
- The commercial units are **shells**, not D-TGL-subdivided apartments: each is a rectangle bounded by
  the building façade (curtain wall) on the outside, the core surround on the inside, and party walls
  between units. They are NOT fed to the apartment engine — they are simple bounded volumes with a
  shopfront. (Open question §9: do commercial units get any internal partitioning, or are they bare
  shells for a tenant fit-out?)
- The core surround + entrance-area walls are **normal walls** (`wall.batch.create`), not curtain walls.

Curtain-wall payload for one shopfront frontage (from `CreateCurtainWallPayload`,
`CreateCurtainWall.ts:16`):

```ts
await bus.executeCommand('curtain-wall.batch.create', {
  curtainWalls: [
    { id: 'cw_shop_1', levelId: groundLevelId,
      baseLine: [{x: x0, y: 0, z: z0}, {x: x1, y: 0, z: z1}],
      height: 3.5, bayWidth: 1.2, bayHeight: 1.5, mullionThickness: 0.08,
      panels: [ /* glazed cells; ::door:: cell at the shop entrance */ ] },
    /* ...one per frontage segment... */
  ],
});
```

### 3.4 Identical core on every upper level + the lift as a SECOND keep-out

Every upper level repeats the **same core in the same plan position** — the house already does this for
the stair (one XZ rect on every storey, `reserveStairCoreShaped`). The multi-family core is **stair +
lift**, so the per-level keep-out is the **union of the stair rect and the lift shaft rect** plus the
small circulation landing. Concretely:

- The lift shaft is a `verticalCirculation` element (§4) with its own footprint rect, placed adjacent
  to the stair inside the central core zone.
- The orchestrator carves **TWO keep-outs** (stair AABB + lift AABB), or one merged core AABB, out of
  the buildable plate before subdivision. The engine already accepts multiple keep-out rects
  (`keepOutRectsWorld` / `keepOutRectsLayout`, `runDeterministicLayout.ts:88` signature) — so the
  lift is "just another keep-out" to the apartment engine. The slab void over the core (`SlabVoid`)
  covers the stair; the lift shaft is a **continuous vertical void** through every slab (the lift car
  travels the full height), so the lift needs its **own per-slab void punch** on every level including
  the ground.

### 3.5 Per-level public corridor that reaches EVERY apartment's main door

This is the §18/§20 circulation-spine problem at building scale. On an upper level the plate is:

```
  level net area (after central core keep-out)
        = [public corridor spine]  +  [apartment cell 1] + ... + [apartment cell N]
```

- The **public corridor** is a Steiner spine (reuse `deriveCorridorSpine.ts`, generalised to a tree —
  §18.3) that connects the **core** (stair+lift landing) to **every apartment's main-door wall**. On a
  square plate this is the `§UPPER-RING-CORRIDOR` pattern (central corridor, apartments ring the
  perimeter — reference §20.2); on an elongated plate it is `§SINGLE-LOAD-PERIPHERAL` (a corridor along
  the core edge, apartments in one band against the façade — §20.1); on a core-fragmented plate it is
  `§SPINE-TREE` (§20.1 row 3). **The playbook (§20.1) decides the pattern by plate shape** — the same
  doctrine the house uses for room circulation, lifted to apartment circulation.
- Each apartment cell touches the corridor on **exactly one wall** (its main-door wall) and the building
  façade on its other walls (windows). This is the §19.3 "single-loaded, peripheral" insight at the
  building scale: each apartment gets BOTH a corridor wall (its front door) AND façade (windows) **by
  construction** — which is precisely the geometric escape from the windows-vs-circulation trap (§19.2).
- **HARD gate (new, mirrors §18.4):** every apartment cell shares a ≥ door-width wall with the public
  corridor. Surfaces as a building-level `§DIAG-CORRIDOR-QUALITY apartmentsReached=N/N`.

### 3.6 How each apartment cell runs the apartment engine

Once a level is partitioned into [core] + [corridor] + [apartment cells], each apartment cell polygon is
handed to `generateDeterministicLayouts` (`runDeterministicLayout.ts:88`) **unchanged**, with:

- `shell` = the apartment cell polygon (its corridor-facing edge marked non-exterior so no window is
  emitted there; its façade edges exterior so windows are emitted — `shellWallMatch.ts` party-wall
  logic);
- `program` = the T1–T4 `ApartmentProgram` (§6);
- `keepOutRectsWorld` = empty (the core is already subtracted at the building level — the apartment cell
  is a clean plate, like a real apartment, so the §14 stair-fracture fill problem does NOT apply inside
  an apartment cell — a structural advantage over the house);
- the result is one `LayoutOption` per cell, scored and ranked exactly as the apartment does.

The building's `assembleBuilding` (mirroring `assembleHouse:762`) then stitches per-level results:
StairCore per adjacent pair, **LiftShaft through all levels**, SlabVoid per non-ground slab (core +
lift), RoofDescriptor over the top.

---

## 4. The NEW vertical-circulation element category (the lift)

A genuinely new **peer element category** — `verticalCirculation` (the lift / elevator), conceptually
grouping with the stair as the building's vertical-circulation core. It must exist in BOTH the UI/UX and
the automation pipeline, and be fully contract-compliant. The **stair element stack is the exact
template** — the audit mapped it end-to-end. To add the lift you touch **17 files** (the same surface the
stair occupies):

### 4.1 The 17 touchpoints (mirroring the stair)

| Layer | New/edited file | Template (stair) | What |
|---|---|---|---|
| L0 schema | `packages/schemas/src/elements/VerticalCirculation.ts` (NEW) | `Stair.ts:1-34` | Zod schema; pure (P5). Fields in §4.2. |
| L0 registry | `packages/schemas/src/registry.ts` (EDIT) | `:11,41` (`stair: Stair`) | Add `verticalCirculation: VerticalCirculation` to ElementTypeRegistry. |
| Geometry store | `packages/geometry-lift/src/LiftStore.ts` (NEW) | `geometry-stair/src/StairStore.ts:22-64` | Instance store; assigns `ifcClass: 'IfcTransportElement'` on add; publishes `bim-lift-added/-updated`. |
| Geometry builder | `packages/geometry-lift/src/LiftMeshBuilder.ts` (NEW) | `StairMeshBuilder` (`geometry-stair/src/index.ts:24`) | Shaft + car + doors mesh. **THREE only here is fine — but P2: `import * as THREE` is allowed ONLY in `renderer-three`.** The geometry-lift builder must follow the SAME pattern geometry-stair uses (it builds via the renderer-three primitives / does not own a raw THREE import — verify geometry-stair's actual import discipline and mirror it). |
| Geometry type store | `packages/geometry-lift/src/LiftTypeStore.ts` (NEW) | `StairTypeStore.ts` | Seeds default lift types (passenger 8-person, accessible, goods). |
| Geometry index | `packages/geometry-lift/src/index.ts` (NEW) | `geometry-stair/src/index.ts` | Barrel exports. |
| Plugin tool | `plugins/lift/src/tool.ts` (NEW) | `plugins/stair/src/tool.ts:10-42` | `LIFT_TOOL_ID = 'lift.placement'`; dispatches `verticalCirculation.create`. |
| Plugin index | `plugins/lift/src/index.ts` (NEW) | `plugins/stair/src/index.ts` | Public exports. |
| Command types | `packages/command-registry/src/types.ts` (EDIT) | `:18-25` (stair CommandType entries) | `CREATE_VERTICAL_CIRCULATION`, `UPDATE_…`, `DELETE_…`, `MOVE_…`. |
| Create command | `packages/command-registry/src/verticalCirculation/CreateVerticalCirculationCommand.ts` (NEW) | `stair/CreateStairCommand.ts:1-576` | The registrations in §4.4. |
| Command index | `packages/command-registry/src/verticalCirculation/index.ts` (NEW) | `stair/index.ts` | Barrel. |
| Command registry barrel | `packages/command-registry/src/index.ts` (EDIT) | `:207-216` (stair exports) | Export the new commands. |
| Element registry | `packages/core-app-model/src/ElementRegistry.ts` (EDIT) | `:18` (`StoreType` union) | Add `'verticalCirculation'` (or `'lift'`) to `StoreType`. |
| View dependency tracker | `packages/core-app-model/src/views/ViewDependencyTracker.ts` (EDIT) | `:42` (`GEOMETRY_ELEMENT_TYPES`) | Add the lift type so plan/section views re-project on change. |
| Selection store | `packages/stores/src/SelectionStore.ts` (EDIT) | `:35` (`StoreType` union) | Add the lift type for type-safe selection. |
| CREATE panel | `apps/editor/src/ui/layout/CreatePanelLayout.ts` (EDIT) | `:114-124` (Stair under Architecture) | New **"Vertical Circulation"** category (peer to walls/stairs), with a Lift entry. |
| Tool manager | `packages/input-host/src/ToolManager.ts` (EDIT) | `:220-229` (`setStairTool`) | `setLiftTool()`; wire in `apps/editor/src/engine/initTools.ts` (mirror `:74-75`). |
| IFC export | `packages/file-format/src/export/ifc/IfcModelBuilder.ts` (EDIT) | `:36-37` (`IfcStair` map) | Map `'IfcTransportElement' → WEBIFC.IFCTRANSPORTELEMENT` (and optionally `IFCELEMENTASSEMBLY` for stair+lift as a core assembly). **Note:** `grep` of `packages/file-format` confirms **no `IFCTRANSPORTELEMENT` mapping exists today** — it is net-new. |
| IFC reader | `packages/file-format/src/export/ifc/readers/LiftReader.ts` (NEW) | `readers/StairReader.ts:1-56` | Lift → ExportElement; `Pset_TransportElementCommon` (CapacityPeople, RatedSpeed, FireExit). |

### 4.2 Schema fields (L0, pure — P5)

```ts
// packages/schemas/src/elements/VerticalCirculation.ts  (pure Zod, no THREE/DOM/I-O)
export const LiftKind = z.enum(['passenger', 'accessible', 'goods']);
export const VerticalCirculation = defineElement('verticalCirculation', {
  levelId: z.string().default(''),       // base level
  topLevelId: z.string().default(''),    // top level served (shaft spans base..top)
  kind: LiftKind.default('passenger'),
  origin: Vec3,                          // shaft base origin (world)
  rotation: z.number().default(0),
  shaftWidth: z.number().positive().default(1.8),   // m (car + structure)
  shaftDepth: z.number().positive().default(1.8),
  carCapacityPersons: z.number().int().positive().default(8),
  doorWidth: z.number().positive().default(0.9),
  materialId: z.string().optional(),
});
```

### 4.3 Geometry (the lift car / shaft)

- A **shaft**: a vertical prism from `origin.y` to the top level's elevation (the full building height),
  rendered as a translucent/structural box (the void it occupies in every slab).
- A **car**: a box at the base level (for visualisation; the car position is not simulated).
- **Doors**: a door opening on the corridor-facing shaft wall at every served level.
- Like the stair, the lift **punches a void** in every slab it passes through — so the executor must
  create a `SlabVoid` (`types.ts:182`) over the lift rect on EVERY level (unlike the stair, which only
  voids the slab *above* a flight). This is the one geometry difference worth calling out.

### 4.4 Command + the in-execute registrations (C11)

`CreateVerticalCirculationCommand.execute()` mirrors `CreateStairCommand.ts` exactly (C11 element-creation
pipeline):

- `ctx.bimManager.registerElement(liftId, baseLevelId)` (spatial; cf. `CreateStairCommand.ts:237`);
- `elementRegistry.registerSemantic(liftId, 'verticalCirculation')` (cf. `:244`);
- `semanticGraphManager.addRelationship({ type: 'sitsOn', sourceId: liftId, targetId: baseLevelId })`
  and a `connectedByLift` edge between base and top levels (cf. `:336-357` `connectedByStair`) — so
  egress/circulation routing sees the lift as a vertical connector;
- `viewDependencyTracker.registerElement(liftId, levelId)` on create;
- emit the store event + `'ai-model-update'` (cf. `:380`).

### 4.5 Automation hook

The building orchestrator dispatches `verticalCirculation.create` (single, one lift per core) or a batch
verb if many — the lift is created in the same ONE `runBatch` as the stair, walls, slabs, roof
(`HouseLayoutExecutor.ts:1280` shape). For automation it needs **no new batch verb** (one lift per core
per building), but follow C16 command-authoring if a `verticalCirculation.batch.create` is later wanted.

### 4.6 8-principle / contract compliance checklist (the gate this category must pass)

| Principle / contract | Requirement | How the lift satisfies it |
|---|---|---|
| **P2 single THREE** | `import * as THREE` only in `renderer-three` | `geometry-lift` mirrors `geometry-stair`'s import discipline (no raw THREE); verify against `geometry-stair/src/StairMeshBuilder` before authoring. |
| **P5 schemas pure** | `packages/schemas` has zero I/O/THREE/DOM | `VerticalCirculation.ts` is pure Zod (§4.2). |
| **P6 command-only mutation** | UI dispatches through commandBus | The plugin tool dispatches `verticalCirculation.create`; no direct store write. |
| **P8 spans** | every new exported function adds ≥1 OTel span | `CreateVerticalCirculationCommand.execute` opens a span; the building orchestrator's lift step opens a child span (C50 §1.8 per-stage span). |
| **C11 element creation** | the canonical create pipeline (register + semantic + view-dep) | §4.4 mirrors `CreateStairCommand` registrations. |
| **C15 hosted elements** | doors/windows hosted in walls | The lift's **landing doors** are hosted openings on the shaft wall (cascade via `wall.createOpening`) — C15 applies to the lift doors, NOT the lift body (the lift is a free element like the stair, not a hosted one). |
| **Layer model** | a layer imports only lower | `geometry-lift` is L1 (peer to `geometry-stair`); `plugins/lift` is L7 (imports L6 SDK only); the command lives in command-registry. |

---

## 5. Inputs + preview UX

### 5.1 The input model

Per the founder's brief, the user inputs ONLY:

| Input | Type | Notes |
|---|---|---|
| **Min m² per apartment** | number (m²) | lower bound of the per-apartment area band |
| **Max m² per apartment** | number (m²) | upper bound; with min, sets the packing band (§6) |
| **Typologies enabled** | multi-select booleans **T1 / T2 / T3 / T4** | one OR several; the building may mix typologies on a level |
| **Number of levels** | integer 1..20 | upper residential levels; ground is always the commercial+core level |
| **Commercial-on-ground** | toggle (default ON) | if OFF, the ground is core + lobby only (no shopfronts) |

The shell (footprint) comes from the drawn parcel boundary (C19), exactly as the house — NOT a user
number. The site latitude (C19) feeds solar bias to each apartment cell's window emission.

### 5.2 The preview modal (mirror §MODAL-DYNAMIC)

Mirror the house "Choose a layout" modal (`HouseLayoutModal.ts:458`, `houseModalHtml.ts:524`):

- **Per-level cards** — like the house's per-storey panes (`buildHousePanesHtml:427`), but each level
  thumbnail renders the **core + public corridor + N apartment plates** (a level plan, not a single
  plate). Reuse `buildLayoutThumbnailSvg` (faithful render, ADR-0075 §17.2) **per apartment plate**,
  composited onto the level frame with the corridor + core drawn from the building result.
- **Mixed-typology display** — each apartment plate labelled with its typology (T1–T4) + area; the
  level card shows the apartment count + mix (e.g. "Level 03 · 2×T2 + 1×T3").
- **Editable form** — replace the house's per-storey bedroom/bathroom tabs with the §5.1 input model.
  §MODAL-DYNAMIC: edits re-run the building generator synchronously and `refresh()` the cards (cf.
  `HouseLayoutController._regenerate:441` → `HouseLayoutModal.refresh:625`).
- **Variant cards** — `generateBuildingLayoutOptions(count)` mirrors `generateHouseLayoutOptions:257`
  (variant 0 = all-best, variants stagger apartment-mix / corridor-pattern choices).
- **The Living Graph panel** (the house's Miro canvas, `buildHouseMiroCanvasHtml:460`) can show the
  building's apartment-adjacency + circulation graph (which apartments touch which corridor leg) — a
  later enhancement, not v1.

---

## 6. T1–T4 typology mapping

The apartment engine has **no T1–T4 field** — typologies are implicit in `ApartmentProgram.bedrooms`
(`apartmentLayout/tgl/types.ts:135`). The mapping (verify the area bands against
`scaleProgramToShell` `bubbleGraph.ts:148` + the dimensional envelope `validateApartmentEnvelope`):

| Typology | `ApartmentProgram` | Target net area band (typical) | Rooms |
|---|---|---|---|
| **T1** | `bedrooms: 1, bathrooms: 1` (or studio: `bedrooms: 0` + open-plan) | ~35–55 m² | living/kitchen (often open-plan), 1 bed, 1 bath, hall |
| **T2** | `bedrooms: 2, bathrooms: 1` | ~55–80 m² | living, kitchen, 2 beds, 1–2 bath, hall, corridor |
| **T3** | `bedrooms: 3, bathrooms: 2, masterEnSuite: true` | ~80–110 m² | living, kitchen, dining, 3 beds (1 master+ensuite), 2 bath |
| **T4** | `bedrooms: 4, bathrooms: 2-3, masterEnSuite: true` | ~110–150 m² | living, kitchen, dining, 4 beds, 2–3 bath |

`scaleProgramToShell` (`bubbleGraph.ts:148`) uses ~130 m²/bed density and `§ENVELOPE-FIT-GROWTH` to grow
bedroom count to fit a shell. For T1–T4 we want the **opposite** — the typology PINS the bedroom count
(use the existing `lockBedroomCount` flag, `runDeterministicLayout.ts:88` signature) so a T2 stays a 2-bed
regardless of the cell area, and the cell area is sized to the typology's band, not the other way round.

### 6.1 Packing N apartments per level (min/max m² → count)

Per upper level, after subtracting the core keep-out + the public-corridor area:

```
  netResidentialArea(level) = footprintArea − coreArea − corridorArea
  apartmentBudget          = [minM2, maxM2]   (user input)
  enabledTypologies        = subset of {T1,T2,T3,T4}, each with a target band (§6)
```

The packer (NEW, in the building orchestrator) chooses a mix of enabled typologies whose summed target
areas tile `netResidentialArea` with each apartment within `[minM2, maxM2]`:

- **N (count)** is derived: roughly `floor(netResidentialArea / avgTypologyArea)`, then adjusted so each
  apartment lands in `[minM2, maxM2]`.
- If only one typology is enabled, all N apartments are that typology (area = `netResidentialArea / N`,
  clamped to the band; N chosen so the clamp holds).
- If several are enabled, prefer a mix that minimises wasted area (a small bounded enumeration — this is
  the same deterministic-enumeration philosophy as the engine; NOT an optimiser, just a ranked finite
  set, cf. §16 cognition-stack "6 staged steps not one giant optimiser").
- The min/max band is a **HARD constraint**: an apartment whose forced area falls outside `[minM2, maxM2]`
  is rejected → that mix/count is infeasible → try the next. If no mix fits, soft-fail the pack (C50 §1.7
  pack error: `{ ok: false, reason: 'no apartment mix fits the level net area within [min,max]' }`).

This packing is deliberately separate from the D-TGL engine: the engine subdivides ONE apartment into
rooms; the packer subdivides ONE level into apartments. The packer's output (N apartment polygons +
their typologies) feeds the engine once per polygon (§3.6).

---

## 7. Phased implementation plan

Independently-shippable, test-first, gated slices — mirroring how the house was staged (ADR-0063 smallest
slices; §18.5 "implement in a fresh focused context, gated, browser-validated each slice"). Ordered by
**leverage + risk** (lowest-risk, highest-reuse first; the most-reverted spine work last and isolated).

> Each slice lists: where it plugs in, its acceptance test, and the `§DIAG-*` it should emit.

### Slice 0 — Typology pack skeleton + preview wiring (no geometry)
- **Plug-in:** new `residential-building` C50 pack (`packages/typology-pipeline` registration in
  `composeRuntime()`, C50 §1.1); new editor seam `apps/editor/src/ui/residential-building/`
  (`ResidentialBuildingController` / `…Modal` / `…ModalHtml`, mirroring `house-layout/`); a console +
  panel trigger (mirror `houseLayoutTrigger.ts:31`).
- **Behaviour:** the modal opens, shows the §5.1 form, and renders a PLACEHOLDER level card (e.g. the
  raw shell + a centred core rect). No build.
- **Acceptance:** pack registers; `registry.list()` includes `residential-building`; the modal opens and
  the form parses to the §5.1 input model. `§DIAG-PACK-DISPATCH` (C50 §1.8 outer span fires).

### Slice 1 — Building orchestrator skeleton: levels + centred core + slabs + roof (NO apartments yet)
- **Plug-in:** new `packages/ai-host/src/workflows/residentialBuilding/buildingOrchestrator.ts` reusing
  the storey-loop skeleton (`houseOrchestrator.ts:467`) + `assembleHouse` stitch (`:762`); the new
  `corePlacement: 'centre'` path in `reserveStairCoreShaped`/`chooseStairCorePosition` (§3.1); a new
  `ResidentialBuildingExecutor` mirroring `HouseLayoutExecutor` (mint N levels + roof level, ONE batch).
- **Behaviour:** builds an empty building — N levels, a **centred stair core** repeated on every level,
  per-non-ground slab void, a roof cap. No lift, no apartments, no corridor.
- **Acceptance:** N levels minted; stair on every adjacent pair; core centroid ≈ footprint centroid
  (`§DIAG-STAIR-RULE R-CENTRE`); `§DIAG-PARITY` clean (no apartments → trivially faithful). House path
  byte-identical (no regression to `casa-unifamiliar` — a no-op proof per ADR-0075 PC2).

### Slice 2 — The vertical-circulation (lift) element category
- **Plug-in:** the 17 touchpoints of §4 (schema → geometry-lift → plugin → command → registrations →
  CREATE panel → IFC). Independent of the orchestration — the lift can be placed by hand first.
- **Behaviour:** a user can place a lift from the CREATE panel; it renders a shaft + car; it exports to
  IFC as `IfcTransportElement`; selection + undo work.
- **Acceptance:** unit tests for the schema (P5 purity), the command (registration calls), the IFC reader
  (Pset). E2E: place a lift, see it in 3D, undo it. `§DIAG-*`: the command emits its P8 span.

### Slice 3 — Lift in the core + per-level lift void
- **Plug-in:** the building orchestrator adds the lift as a SECOND keep-out beside the stair in the
  central core (§3.4); the executor creates the lift in the ONE batch + punches a `SlabVoid` over the
  lift rect on EVERY level (including ground).
- **Behaviour:** every level shows stair + lift in the centre; the lift void runs the full height.
- **Acceptance:** lift present on every level at the same XZ; void punched every slab; `§DIAG-CORE`
  reports `core = stair + lift`, centroid centred.

### Slice 4 — Ground-floor commercial shell (curtain walls) + entrance corridor
- **Plug-in:** the ground-level branch of the executor mints the perimeter as `curtain-wall.batch.create`
  shopfronts (§3.3) + normal walls for the core surround + the entrance corridor to the core; the main
  entrance door (referenced new type, or a placeholder door until that type ships).
- **Behaviour:** ground floor = central core + commercial ring (glazed) + a lobby corridor to the core.
  No apartments on ground (per brief).
- **Acceptance:** ground perimeter is curtain walls when commercial toggle ON; the entrance door opens to
  a corridor that reaches the core (`§DIAG-CORRIDOR-QUALITY` core reachable from entrance). Commercial
  toggle OFF → core + lobby only.

### Slice 5 — Per-level apartment packing (count + typology mix) — NO room subdivision yet
- **Plug-in:** the NEW packer (§6.1) in the building orchestrator: level net area → N apartment polygons
  + typologies, honouring min/max m² + enabled T1–T4.
- **Behaviour:** each upper level is partitioned into N apartment-sized rectangles (no internal rooms
  yet) + the core. The preview shows the apartment blocking + the mix label.
- **Acceptance:** every apartment ∈ `[minM2, maxM2]`; the mix uses only enabled typologies; infeasible
  band → C50 soft-fail with the §6.1 reason. `§DIAG-APARTMENT-PACK level=k N=… mix=[T2,T2,T3]
  areas=[…]`.

### Slice 6 — The public corridor spine (reach every apartment door) — THE HIGH-RISK SLICE
- **Plug-in:** the per-level corridor derived as a Steiner spine (reuse `deriveCorridorSpine.ts`
  generalised to a tree, §18.3), pattern chosen by plate shape per the §20.1 playbook
  (`§SINGLE-LOAD-PERIPHERAL` / `§UPPER-RING-CORRIDOR` / `§SPINE-TREE`). Each apartment cell gets a
  main-door wall on the corridor.
- **Behaviour:** every apartment's main door opens onto the public corridor, which reaches the core.
- **Acceptance (HARD gate, §3.5):** `§DIAG-CORRIDOR-QUALITY apartmentsReached=N/N servedThrough=0`; the
  corridor touches the core landing. **GATE THIS BEHIND A FLAG, default OFF**, browser-validate per
  level, then flip on — this is the most-reverted code class in the engine (§18.5: the L-spanning carve
  was reverted 4×; do it in a fresh focused context, test-first).

### Slice 7 — Run D-TGL per apartment cell (rooms + windows + doors)
- **Plug-in:** §3.6 — each apartment cell polygon → `generateDeterministicLayouts` (unchanged) →
  `buildLayoutCommands` per cell → folded into the level's ONE batch; `_finishOpenings` adds windows +
  the apartment main door.
- **Behaviour:** every apartment is a fully-subdivided dwelling (T1–T4 program) with windows on its
  façade and a main door to the corridor.
- **Acceptance:** per apartment cell, the engine's existing apartment tests pass (the cell is a clean
  plate — no stair fracture inside it, so §14 fill does not apply); `§DIAG-PARITY` clean per level;
  party walls between apartments are blind (`§DIAG-PARTY-WALL`).

### Slice 8 — Post-gen finish + documentation + IFC round-trip
- **Plug-in:** reuse `runHousePostGenChain.ts` per level (name → floor/ceiling → furnish → light); IFC
  export of the full building (stair + lift assembly, curtain-wall shopfronts, per-apartment rooms).
- **Acceptance:** every room named/furnished/lit; the building exports to a valid IFC with
  `IfcTransportElement` for the lift; `§DIAG-LEVELS` reconciles live vs intended per level.

### Slice 9 — SPEC + parity hardening + risk closeout
- **Plug-in:** author `docs/03-execution/specs/SPEC-RESIDENTIAL-BUILDING-TYPOLOGY.md` (mirror
  `SPEC-CASA-UNIFAMILIAR-TYPOLOGY.md`), promoting the §DIAG gates of slices 1–8 to invariants; tighten
  the corridor gate from soft to HARD (§18.6 (1) pattern); add the C50 pack to the typology-expansion
  roadmap.
- **Acceptance:** the SPEC's invariants are CI-gated; the §DIAG-PARITY merge rule (ADR-0075 PC2) holds
  for every new transform introduced (corridor carve, commercial shell).

---

## 8. Risk register

Inheriting the house's hard-won lessons (the most relevant are the ones the house is STILL fighting):

| # | Risk | Severity | Source / evidence | Mitigation |
|---|---|---|---|---|
| R1 | **The public corridor fails to reach every apartment** (the §18/§19 trap at building scale) | **HIGH** | §18.1 (straight corridors can't span a fragmented plate); §19.2 (windows-vs-circulation trap); §18.5 (L-carve reverted 4×) | Slice 6 gated OFF by default, test-first, browser-validated; pattern by §20.1 playbook; the building case is EASIER than the house room case because apartments are larger and fewer than rooms — a single-loaded peripheral corridor (§19.3) with apartments between corridor and façade satisfies both door-access AND windows by construction. |
| R2 | **Preview ≠ execution** (ADR-0075) — a level looks right in the modal, wrong in 3D | **HIGH** | §17 (the whole divergence surface); ADR-0075 | `§DIAG-PARITY` per level per apartment cell (Slice 1+7); PC2 merge rule on the new corridor/commercial transforms; reuse the faithful thumbnail render (§17.2). |
| R3 | **Lift core as a SECOND keep-out desyncs** like the stair did (carved keep-out ≠ shipped footprint) | **MED** | ADR-0063 H3 (`§DIAG-STAIR cornersInShell=1/4` desync); `containStairCoreUpstream` | Reuse `containStairCoreUpstream` for the merged core AABB; a centred core is trivially contained (far from edges), so this risk is LOWER than the house's corner stair. Verify with `§DIAG-CORE` centroid + containment. |
| R4 | **Many apartments per plate → perf** (N D-TGL calls + N×rooms walls/windows + curtain-wall mullion swarm) | **MED** | curtain-wall batch perf (294 walls ≈ 5 s drain, InstancedMesh); house ONE-batch shape | Reuse the ONE `runBatch` per level + the curtain-wall `pause/resumeAndFlush` batch path; cap apartments/level; profile a 20-level × 4-apartment building early (Slice 7). |
| R5 | **§13 polygon-native subdivision still OPEN** — non-rect apartment cells (after corridor carve) overflow the façade | **MED** | §13 (rectangle assumption; sheared coverage ≈ 1.05) | Keep apartment cells **axis-aligned rectangles** where possible (the packer §6.1 prefers rect cells); the engine is byte-identical on rects. Non-rect cells inherit the §13 ceiling — document, don't solve here. |
| R6 | **§14 apartment-grade fill** — small "Store" swarm | **LOW (for this typology)** | §14 (house upper-floor swarm from the stair fracture + under-programmed plate) | **Structurally avoided:** each apartment cell is a clean, fully-programmed plate (the typology sizes the program to the cell), so there is no stair-fracture strip and no area deficit inside a cell. The fill problem was a HOUSE artifact of one big under-programmed plate; the building has many right-sized plates. |
| R7 | **Room-merge across apartment party walls** (RoomDetectionEngine floods adjacent cells) | **MED** | §14.3 (detection merges larger habitable cells); ADR-0069 (graph-authoritative rooms is the cure) | Rely on ADR-0069 graph-authoritative rooms per apartment cell (rooms come from the engine option, not re-detection) — already the house path. Party walls are full-height real walls, so detection should not bridge them; verify with a 2-apartment test. |
| R8 | **Fire egress / two-stair requirement** | **MED (compliance)** | (regulatory; not in current engine) | A single central stair may be non-compliant above a code threshold (travel distance / occupant count). v1 ships one core; §9 raises this for the founder. The orchestrator should be able to place a SECOND core (a parametrised core count) without rework — design the core as a list, not a singleton. |
| R9 | **The entrance door type does not exist yet** | **LOW** | `grep` confirms no entrance/glazed door schema in `packages/schemas/src/elements` | Reference it (per brief, built separately); use a placeholder door in Slices 4–8; swap when the type ships. |

**Top 3 risks:** R1 (public corridor reaching every apartment — the §18/§19 spine problem), R2
(preview↔execution parity — ADR-0075), R4 (perf of many apartments + curtain-wall swarm per level).

---

## 9. Open questions for the founder

1. **Fire egress / second stair.** Above what level count / occupant load does the building need a
   SECOND escape stair (two cores)? Building codes typically require two means of egress beyond a
   threshold. v1 ships ONE central core — should the orchestrator parametrise core count now (designed
   as a list per R8) or defer?
2. **Lift count vs building size.** One lift per core for all 20 levels, or scale lift count with
   levels/apartments (traffic analysis)? Goods/accessible lift in addition to the passenger lift?
3. **Accessible route.** Must every apartment be on the accessible (lift-served) route, and must the
   public corridor meet accessible-width (≥ 1.2–1.5 m clear)? This tightens the §3.5 corridor gate.
4. **Commercial unit definition.** Are ground commercial units BARE shells (tenant fit-out later) or
   should the engine give them a minimal partition (back-of-house WC + storage)? What is the min/max
   commercial unit frontage/area, and does the user control it (the brief only specifies apartment m²)?
5. **Parking / basement.** Is there a basement parking level (a different plate type — ramp + bays), or
   is parking out of scope? If in scope it is a NEW sub-typology below the ground.
6. **Balconies.** Do upper apartments get balconies on the façade (the `balcony` room type exists,
   `programRules.ts` `§NEW-ROOM-TYPES`)? Cantilevered or recessed? This affects the façade window/wall
   emission.
7. **Core placement tolerance.** "Always in the CENTRE" — exact geometric centroid, or a centred band
   that the orchestrator can nudge to align the corridor better? (A strict centroid may produce an
   awkward corridor on an elongated plate.)
8. **Apartment count control.** The user specifies min/max m² but NOT apartment count — is the engine
   free to choose N per level, or should the user be able to pin "exactly K apartments per level"?
9. **Mixed use vertically.** Can upper levels also be commercial/office (true mixed-use), or are upper
   levels strictly residential as the brief states?
10. **Preview granularity.** Should the modal let the user edit the apartment mix PER LEVEL (like the
    house's per-storey tabs), or is the mix global (same mix on every upper level)?

---

## Appendix A — Canonical anchors (for the implementing engineer)

- **Engine (FROZEN, called per apartment cell):** `packages/ai-host/src/workflows/apartmentLayout/tgl/runDeterministicLayout.ts:88` `generateDeterministicLayouts`; `enumerate.ts`; `subdivide.ts`; `wallsAndDoors.ts`; `bubbleGraph.ts:148` `scaleProgramToShell`; `rules/programRules.ts` (`ROOM_RULES`); `tgl/types.ts:135` `ApartmentProgram`.
- **House orchestration (skeleton to reuse/adapt):** `packages/ai-host/src/workflows/houseLayout/houseOrchestrator.ts:467` `enumeratePerStorey`, `:762` `assembleHouse`, `:355` `containStairCoreUpstream`; `stairCore.ts:275` `reserveStairCoreShaped`; `stairPosition.ts:557` `chooseStairCorePosition` (the corner rule to invert); `storeyAllocation.ts:70`; `types.ts:124` `StairCore` / `:182` `SlabVoid` / `:195` `RoofDescriptor`.
- **Editor seam (modal + executor to mirror):** `apps/editor/src/ui/house-layout/HouseLayoutController.ts:168`; `HouseLayoutModal.ts:458`; `houseModalHtml.ts:524`; `houseCardModel.ts:96`; `HouseLayoutExecutor.ts:334`/`:1280`/`:3059`; `runHousePostGenChain.ts:163`/`:269`.
- **Stair element stack (lift template):** schema `packages/schemas/src/elements/Stair.ts`; geometry `packages/geometry-stair/`; plugin `plugins/stair/`; command `packages/command-registry/src/stair/CreateStairCommand.ts`; registrations `core-app-model/src/ElementRegistry.ts:18`, `views/ViewDependencyTracker.ts:42`; CREATE panel `apps/editor/src/ui/layout/CreatePanelLayout.ts:114`; IFC `file-format/src/export/ifc/IfcModelBuilder.ts:36` + `readers/StairReader.ts`.
- **Curtain wall (commercial shell):** schema `packages/schemas/src/elements/CurtainWall.ts:23`; geometry `packages/geometry-curtain-wall/src/CurtainWallBuilder.ts:1035`; command `plugins/curtain-wall/src/handlers/CreateCurtainWallBatch.ts:55` (`curtain-wall.batch.create`).
- **Contracts / ADRs:** C11 (element creation), C15 (hosted elements — lift doors), C19 (parcel boundary = footprint), C50 (typology pipeline — the new pack), C53 (generative engine architecture), ADR-0063 (house doctrine), ADR-0067/0068 (intent/circulation-first), ADR-0069 (graph-authoritative rooms), ADR-0075 (preview↔execution parity). Template SPEC: `docs/03-execution/specs/SPEC-CASA-UNIFAMILIAR-TYPOLOGY.md` → new `SPEC-RESIDENTIAL-BUILDING-TYPOLOGY.md`.
- **Circulation doctrine (the public corridor):** reference §18 (L/T/U corridor spine), §19 (windows-vs-circulation trap + the single-loaded cure), §20.1 (the typology playbook decision table), §20.2 (`§UPPER-RING-CORRIDOR`).
