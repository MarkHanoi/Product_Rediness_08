# SPEC-CASA-UNIFAMILIAR-TYPOLOGY — Single-Family House (the second typology)

**Status:** DRAFT (2026-06-05) — **multi-storey pure CORE shipped 2026-06-06; editor wiring (A.21.d–g) pending.** See §13 (as-built).
**Owner:** TBD
**Governs:** the `casa-unifamiliar` typology pack + its multi-storey generator, stair
auto-placement, and editor wiring.
**Tracker:** `A.21` (decomposed into `A.21.a … A.21.x` — see §10).

**Conflict-resolution order (strongest first):**
[product-vision §5](../../01-strategy/product-vision.md) →
[architecture](../../01-strategy/architecture.md) →
[C50-TYPOLOGY-PIPELINE](../../02-decisions/contracts/C50-TYPOLOGY-PIPELINE.md) →
[ADR-0056 typology-declared brief](../../02-decisions/adrs/0056-typology-declared-brief.md) →
[typology-expansion-roadmap §5](../plans/typology-expansion-roadmap.md) → this SPEC.

Sibling references: [SPEC-APARTMENT-LAYOUT-GENERATOR](./SPEC-APARTMENT-LAYOUT-GENERATOR.md),
[SPEC-TGL-DETERMINISTIC-LAYOUT-ENGINE](./SPEC-TGL-DETERMINISTIC-LAYOUT-ENGINE.md),
[SPEC-ARCHITECTURAL-PROGRAM-RULES](./SPEC-ARCHITECTURAL-PROGRAM-RULES.md),
[SPEC-TYPOLOGY-BRIEF-SCHEMA](./SPEC-TYPOLOGY-BRIEF-SCHEMA.md).

---

## §1 — Why this typology, and what it proves

PRYZM's platform spine is **typology-agnostic**: *choose ANY typology → always
site-first → geometry by ANY input → author → ANY output.* The **apartment** is the
proof-of-concept — but it is, by construction, a **single-level, single-plate**
generator (one `levelId` threaded everywhere; no vertical circulation).

**Casa Unifamiliar (single-family house)** is the deliberate second typology because
it is the smallest step that forces the platform to grow the capabilities the
apartment never needed:

1. **Multiple storeys (1–3 levels)** — a real per-storey room programme, not one plate.
2. **Vertical circulation** — a **staircase** that connects levels, with a stairwell
   void in the upper slab and the rooms distributed sensibly across floors.
3. **Vertical structural alignment** — exterior walls / columns / slabs that stack
   floor-to-floor.
4. **House-specific rooms** — garage, porch, garden/terrace, utility, double-height
   entrance, landings.

Shipping it validates that "adding a typology" is a **pack + orchestration** exercise
on a stable spine, not a fork — and it unlocks every later multi-storey typology
(townhouse, small office, duplex).

---

## §2 — Requirements (what a user can ask for)

A user (via the RAC chatbot or the brief sliders) can request a house with:

| Parameter | Range / values | Notes |
|---|---|---|
| **Floors / storeys** | 1, 2 or 3 | Drives level creation + stair count (N−1 stair runs). |
| **Bedrooms** | 1–6 | Distributed: ground-floor guest/master optional; rest upstairs. |
| **Bathrooms** | 1–4 (+ ground-floor WC) | ≥1 WC on the entrance level; ensuite for the master. |
| **Garage** | none / 1-car / 2-car | Ground level, street frontage; internal door to hall optional. |
| **Outdoor** | garden / terrace / none | A reserved outdoor zone adjacent to living (not a "room"). |
| **Kitchen-dining** | open-plan / separate | As apartment. |
| **Master location** | ground / upper | Single-storey-living (accessible) vs classic upstairs master. |
| **Style** | (select) | Cosmetic/material preset, as apartment. |
| **Target area (m²)** | optional | Total across all storeys. |

**Hard rules (non-negotiable):**
- A multi-storey house MUST have a stair connecting **every adjacent pair of levels**.
- The stair core occupies the **same XZ footprint on every storey it passes through**
  (vertical alignment) and punches a stairwell void in each upper slab.
- Every habitable room is reachable from the entrance via legal circulation
  (hall/landing/corridor) — **including across floors** (entrance → stair → landing →
  bedroom).
- Wet rooms (bath/WC/kitchen/utility) should **stack** floor-to-floor where possible
  (shared plumbing wall) — a *preference*, not a hard rule.
- Bedrooms are on a **private** level (upstairs) by default; living/kitchen/dining/WC/
  garage on the **entrance** level.

---

## §3 — The room programme (per-storey allocation)

The house program is the apartment program **plus a storey dimension and house rooms**.

**New room types** (extend `RoomType`): `stair`, `landing`, `garage`, `porch`,
`terrace`/`garden` (outdoor zone), and reuse existing `master | bedroom | living |
kitchen | dining | bathroom | ensuite | wc | hall | corridor | study | utility`.

**Default allocation policy** (2-storey example):

- **Ground (entrance) level:** porch/entrance hall, living, kitchen, dining, WC,
  utility, garage, **stair (down-anchor)**, optional ground-floor guest bedroom +
  bathroom (or accessible master if `masterLocation=ground`).
- **Upper level(s):** **landing (stair top-anchor)**, master + ensuite, remaining
  bedrooms, family bathroom, optional study.

The allocation is a **policy function** `allocateProgramToStoreys(program, storeys)`
→ `StoreyProgram[]`, each a single-plate `ApartmentProgram`-shaped sub-program the
existing D-TGL engine can consume **per storey**.

---

## §4 — What EXISTS vs what is MISSING (honest assessment)

The low-level building blocks are **production-grade and reusable**; the
**orchestration is what's missing**.

| Capability | Status | Where |
|---|---|---|
| Single-plate room layout (D-TGL) | ✅ EXISTS, reuse as the per-storey primitive | `packages/ai-host/src/workflows/apartmentLayout/tgl/*` |
| Program rules / adjacency / privacy | ✅ EXISTS (horizontal only) | `apartmentLayout/rules/programRules.ts`, `topology/adjacencyRules.ts` |
| Create N levels (elevation/height) | ✅ EXISTS (primitive) | `BimManager.addLevel`, `AddLevelCommand` |
| Stair connecting two levels (data + graph) | ✅ EXISTS, strong | `geometry-stair/*`, `command-registry/src/stair/CreateStairCommand.ts` (`baseLevelId`/`topLevelId`, `connectedByStair` edges) |
| Stairwell void in upper slab | ✅ EXISTS, **automatic** | `CreateStairCommand.createAutoOpening()` |
| Stair geometry / mesh / IFC / railings / 3D-path | ✅ EXISTS, mature | `geometry-stair/*`, `geometry-stair/src/stairPath/*` |
| Per-level visibility / explode / clip | ✅ EXISTS | `LevelExplodeController`, `LevelClipPlaneCache`, plan-view level-scoped renderers |
| Replicate slabs across floors | ✅ EXISTS (primitive) | `command-registry/src/slabs/CreateAllSlabsFromLevelToAllFloorsCommand.ts` |
| **Auto-generate a multi-storey house** | ❌ MISSING | no workflow does it |
| **Distribute a program across storeys** | ❌ MISSING | apartment is single-`levelId` |
| **Auto-place a stair in a generator** | ❌ MISSING | only interactive `StairTool` emits stairs today |
| **Vertical alignment of walls/columns/slabs** | ❌ MISSING (slabs have a replication primitive only) | — |
| **`casa-unifamiliar` typology pack + brief** | ❌ MISSING | `typology-pipeline` has only the apartment pack |

**Risk to flag:** two level models coexist — the legacy runtime `BimManager` levels
(what the stair tool + generator consume via `window.bimManager`) and the new C20
aggregate `Level` store. The generator MUST target `BimManager` levels.

---

## §5 — Architecture: the typology pack + extension points

Casa Unifamiliar registers as a **typology pack** through the agnostic spine
(`packages/typology-pipeline/`, C50). The extension checklist (mirrors the apartment
pack):

1. **`packages/typology-pack-casa-unifamiliar/`** — new package mirroring
   `typology-pack-apartment/`.
2. **`src/manifest.ts`** — `TypologyManifestSchema.parse({ id: 'casa-unifamiliar',
   category: 'residential', … roomTypes: [...with stair/landing/garage], briefSchema,
   phaseGate: 'alpha' })`.
3. **`briefSchema`** (§8) — floors stepper, bedrooms/bathrooms ranges, garage select,
   garden toggle, master-location select, style select, notes.
4. **Generative + bimEmit stages** — either a bridge (delegating to a new ai-host
   `houseLayout` workflow, like apartment does today) or owned in the pack.
5. **Register in `composeRuntime()`** — `typologyRegistry.register(buildCasaUnifamiliarTypologyPack())`
   in a try/catch alongside apartment (~line 957). This alone makes it appear in the
   TypologyPicker and be RAC-recognizable (both are registry-driven).
6. **Generation engine** — `packages/ai-host/src/workflows/houseLayout/` (§6).
7. **Program rules / room types** — house adjacency incl. vertical (stair `accessFrom`
   on both connected levels).
8. **Validators + cognition** — house-specific spatial validators (stair clearance,
   per-storey circulation, wet-stack preference) + cognition evaluators.
9. **BIM emission** — per-storey command sets + level creation + stair + slab voids.
10. **Editor onboarding wiring** — `apps/editor/src/ui/onboarding/briefBootstrap.ts`
    (the typology gate currently bails on anything but `'apartment'`); add a
    `casa-unifamiliar` branch.

---

## §6 — The multi-storey generation pipeline (the new orchestration layer)

**Doctrine: keep the single-plate D-TGL engine intact and add a storey orchestrator
ON TOP.** New workflow `packages/ai-host/src/workflows/houseLayout/`:

```
generateHouseLayout(boundary, brief)                       [the new outer loop]
  1. allocateProgramToStoreys(program, storeys) → StoreyProgram[]   (§3 policy)
  2. reserveStairCore(footprint, storeys) → StairCore               (shared XZ rect
        on every storey, sized to the chosen stair shape; reserved BEFORE subdivision)
  3. for each storey s:
        runDeterministicLayout(StoreyProgram[s], footprint − stairCore)   (reuse D-TGL)
        → LayoutOption[s]  (the per-plate rooms, with the stair core carved out as a
          fixed obstacle so rooms never overlap it)
  4. alignVertical(LayoutOption[0..n])                               (snap exterior
        shell + structural grid so walls/columns/slabs stack)
  5. emitHousePlan(LayoutOption[], stairCore, storeys) → HouseCommandSet
        { levels: [{levelId, elevation, height}],
          perStorey: [{ levelId, walls, doors, windows, boundaries }],
          stairs:    [{ baseLevelId, topLevelId, footprint, shape }],
          slabVoids: [{ levelId, rect }]   (or rely on CreateStairCommand auto-void) }
```

**Key invariants the orchestrator adds (none exist today):**
- The **stair core rectangle is identical across storeys** (vertical-alignment
  objective) and is a hard obstacle in every per-storey subdivision.
- Per-storey geometry is stamped with the **correct `levelId` + `baseElevationM`**
  (apartment stamps a single level; this must become a per-storey map).
- The **post-generation chain fans out across storeys** — floor/ceiling/furnish/
  lighting currently act on the active level only; they must iterate every created
  storey (or the executor emits one `*.layout-executed` per storey).

**Threading change:** `levelId: string` becomes `storeyPlates: { levelId, elevationM,
footprint }[]` through the payload, `EnumerateInput`, `semanticGraph` meta (one `Level`
node per storey), and `LayoutExecuteOptions`.

---

## §7 — Stairs, levels, and vertical alignment

**Levels** — the executor must **create the levels first** (it currently resolves ONE
active level). For an N-storey house: `BimManager.addLevel` (via `AddLevelCommand`)
for L1…L(N−1) at elevations `n × floorToFloor` (default 3.0 m); L0 Ground already
exists and is undeletable.

**Stair auto-placement** — for each adjacent level pair, emit a `CreateStairCommand`
(via `StairPathAdapter`-style programmatic `CreateStairInput`) with:
- `baseLevelId` = lower, `topLevelId` = upper, `startPosition` = the reserved stair
  core corner, `shape` chosen by core aspect (I if long, L/U if square),
- riser count **derived from the level-height gap** (the command enforces
  height == gap; do not free-set total height),
- `autoCreateOpening` left default → the **stairwell void is punched automatically**
  in the upper slab.
This writes `connectedByStair` graph edges (vertical circulation becomes queryable).

**Vertical alignment** — at minimum, the **exterior shell** must be identical on every
storey (same footprint) so walls stack; the slab-replication primitive
(`CreateAllSlabsFromLevelToAllFloorsCommand`) handles floors. Column/beam stacking is a
later refinement (P-tier); v1 may ship without an explicit structural grid.

---

## §8 — Brief schema (typology-declared, slider-driven; ADR-0056)

`briefSchema` fields (per SPEC-TYPOLOGY-BRIEF-SCHEMA §3 House sketch):

| id | kind | range / options | default |
|---|---|---|---|
| `floors` | stepper | 1–3 | 2 |
| `bedrooms` | range | 1–6 | 3 |
| `bathrooms` | range | 1–4 | 2 |
| `garage` | select | none / 1-car / 2-car | 1-car |
| `garden` | toggle | — | true |
| `openPlanKitchenDining` | toggle | — | true |
| `masterLocation` | select | upper / ground | upper |
| `style` | select | (style presets) | — |
| `targetAreaM2` | range | optional | — |
| `notes` | text | — | "" |

**Field `id`s must match the generator's program keys** (the apartment pack documents
the same coupling). The onboarding RAC renders these as on-brand controls; captured
values become the structured `Brief` driving `generateHouseLayout`.

---

## §9 — UI (tracked under §12.3 as new `A.U.*` rows)

- **Typology picker card** — "Casa Unifamiliar / Single-Family House" appears
  automatically once registered (the picker is registry-driven); needs a thumbnail +
  one-line description. RAC recognizes it via `parseTypologyIdFromText` (data-driven).
- **Brief panel** — renders the §8 schema (floors stepper is the new control vs
  apartment). On-brand white + #6600FF, compact (per the brand rule).
- **Generation modal** — reuse the apartment options modal; show **per-storey
  thumbnails** (one plan per floor) so the user picks a multi-level option.
- **Multi-level result view** — the result must let the user **switch floors** (level
  selector) in the 2D plan and see the **stack** in 3D (reuse `LevelExplodeController`
  for an exploded axonometric "dollhouse" view — a strong demo for a house).
- **Forma / globe** — unchanged; the massing shows the full stacked house on the plot.

---

## §10 — Execution plan → tracker rows (decompose A.21)

`A.21` ("House typology end-to-end", ⚪ PLANNED) decomposes into:

| ID | Slice |
|---|---|
| **A.21.a** | Pack scaffold + manifest + briefSchema + register in `composeRuntime()` (bridge stages). Picker + RAC recognition live. |
| **A.21.b** | House program + room types (stair/landing/garage/porch/terrace) + `allocateProgramToStoreys` policy. |
| **A.21.c** | Storey orchestrator: `generateHouseLayout` outer loop reusing per-storey D-TGL; stair-core reservation as a fixed obstacle. |
| **A.21.d** | Multi-level threading: `storeyPlates[]` through payload/enumerate/semanticGraph/execute; per-storey `levelId` + elevation stamping. |
| **A.21.e** | Level creation in the executor (`AddLevelCommand` for L1…Ln) + per-storey command fan-out. |
| **A.21.f** | Stair auto-placement: programmatic `CreateStairCommand` per level pair + auto stairwell void + `connectedByStair` edges. |
| **A.21.g** | Vertical alignment v1 (identical exterior shell per storey) + slab replication across floors. |
| **A.21.h** | House validators (stair clearance, cross-floor circulation, wet-stack preference) + cognition evaluators. |
| **A.21.i** | Post-gen chain fan-out across storeys (floor/ceiling/furnish/lighting per level). |
| **A.21.j** | Editor onboarding wiring (`briefBootstrap.ts` typology gate) + console commands `pryzmGenerateHouse*`. |
| **A.21.k** | UI: per-storey generation modal + multi-level result view + dollhouse explode (see §12.3 `A.U.*`). |
| **A.21.x** | Reference projects (≥3) + tests (≥50 pipeline) + ratify; retire any apartment-coupling. |

**§12.3 UI rows** (new `A.U.*`): typology picker card + thumbnail; floors-stepper brief
control; per-storey generation modal; level-selector + dollhouse explode result view.

---

## §11 — Contract / ADR alignment (must conform)

- **C50-TYPOLOGY-PIPELINE** — the pack MUST conform: TypologyRegistry registration,
  7-stage PipelineRouter, `TypologyStageBundle` (generative mandatory), plan-tier
  gating, per-stage OTel spans (P8).
- **ADR-0056** — the brief is typology-declared + slider-driven (no UI-hardcoded
  house brief).
- **C19 Site / C20 Building+Level aggregates** — always site-first; the generator
  reads the parcel boundary; note the BimManager-vs-C20 level-model risk (§4).
- **product-vision §5** — the RAC → "what project type?" → typology pipeline journey;
  Casa plugs into the same flow the apartment uses.
- **architecture (8-layer / 8-principle)** — pack at L7-ish (imports schemas +
  typology-pipeline only); generation engine in ai-host (L2/L3); P6 commands-only
  mutation; every new exported fn adds ≥1 OTel span (P8).

---

## §12 — Open questions (resolve during A.21.a–b)

1. Bridge vs owned generation — start as a bridge to ai-host `houseLayout` (fastest),
   or own stages in the pack? (Recommend bridge first, mirror apartment.)
2. `casa-unifamiliar` vs `house` as the canonical `id`? (Recommend `casa-unifamiliar`
   to surface the Spanish-market framing; `displayName` carries both.)
3. Single-storey houses (`floors=1`) — must degrade to the apartment-like single-plate
   path with house rooms (garage/garden) but no stair. The orchestrator handles N=1 as
   a no-stair special case.
4. Garage as a "room" vs a distinct element class? (Recommend a room-type with no
   ceiling/finish + a vehicle door element.)

---

## §13 — Implementation status / as-built (2026-06-06)

The **multi-storey pure CORE shipped + merged** on 2026-06-06: the storey orchestrator,
allocation policy, stair-core reservation, slab-void + roof descriptors, all in
`packages/ai-host/src/workflows/houseLayout/` (36 tests; ai-host 1580/1580; zero regression;
purely additive — no existing file changed). The **EDITOR WIRING follow-up (A.21.d–g) is NOT
landed** — it needs live in-browser verification, so it is deliberately not done blind.

This section is the honest map of §6/§7's forward design onto the shipped code, including the
**two deviations** where the as-built differs from the SPEC's idealised pipeline. Where they
differ, **the code is the source of truth for as-built**; the SPEC's forward design (§6/§7)
remains the target the editor wiring + A.21.h drive toward.

### §13.1 — A.21.a–g status map

| Slice | SPEC § | Status | Where / note |
|---|---|---|---|
| **A.21.a** pack scaffold + manifest + brief + register | §5,§8 | ⚪ NOT STARTED | no `packages/typology-pack-casa-unifamiliar/` yet; casa is demoed via the apartment generator's single-storey bridge (A.21.a stopgap) |
| **A.21.b** house program + room types + storey allocation | §3 | ✅ CORE | `houseLayout/storeyAllocation.ts` `allocateProgramToStoreys` + `types.ts` `StoreyProgram`/`StoreyRole`. The `RoomType` enum extension (stair/landing/garage/porch/terrace) + house `accessFrom` rules are folded into A.21.h (NOT yet done) |
| **A.21.c** storey orchestrator (reuse D-TGL per plate) | §6 | ✅ SHIPPED | `houseLayout/houseOrchestrator.ts` `generateHouseLayout(...)` + `stairCore.ts` `reserveStairCore(...)`; emits `HouseLayoutResult { storeys, perStoreyLayout, stairs, voids, roof }` |
| **A.21.d** multi-level threading | §6 | ⚪ NOT STARTED (editor) | the `HouseLayoutResult` shape IS the contract the wiring consumes |
| **A.21.e** level creation + per-storey command fan-out | §7 | ⚪ NOT STARTED (editor) | executor mints L1…Ln via `AddLevelCommand` |
| **A.21.f** stair auto-placement + stairwell void | §7 | ⚪ NOT STARTED (editor) | the orchestrator returns `stairs[]` + `voids[]`; the editor emits `CreateStairCommand` + auto-opening |
| **A.21.g** vertical alignment v1 + slab replication | §7 | ✅ CORE (alignment) / ⚪ editor (slabs) | the footprint is identical on every `StoreyPlate` (walls stack); slab replication is the editor step |

### §13.2 — Deviation A: stair core is an AREA-BUDGET reduction, not a polygon carve

§6 step 3 describes the stair core as "carved out as a fixed obstacle so rooms never overlap
it". **The shipped code does NOT carve the polygon** — `generateDeterministicLayouts` is
**frozen** (SPEC-TGL) and has **no obstacle parameter**. Carving would require editing the
engine.

**As-built (`houseOrchestrator.ts`):** the orchestrator instead **shrinks the storey's usable
area budget** — it hands the per-storey engine a `ShellAnalysis` whose
`netAreaM2 = trueArea − stairCoreArea`. The bubble-graph area distribution (which keys off
`netAreaM2`) then sizes rooms to fit the plate *without* the core, so generated rooms don't
expand into the core's space. The perimeter/footprint is left intact (the shell still exists);
only the area budget shrinks. The core itself is returned separately as a `StairCore` (mm
rect) for the editor-wiring step to place the actual stair + punch the void. Single-storey
houses subtract nothing (no stair).

**Why it's acceptable:** the result is geometrically sound (rooms are sized to leave room for
the core) without forking the frozen engine. The exact-obstacle carve remains the §6 target;
it lands when (and if) the engine grows an obstacle param, or via A.21.h.

### §13.3 — Deviation B: per-storey envelope CLAMP to work around the §D3.5 apartment gate

§6 reuses the apartment per-storey engine unchanged. But that engine runs the apartment
**§D3.5 envelope gate**, which HARD-rejects when gross area is absurd *for the bedroom count
alone* — it can't see that a house **ground floor**'s area is consumed by living/kitchen/dining
rather than bedrooms. A large house plate with a low per-storey bedroom count (e.g. a 120 m²
ground floor with one guest bedroom) trips the gate and the engine returns `[]`.

**As-built (`houseOrchestrator.ts`):** to keep every storey producing a real layout **without
editing the frozen engine**, the orchestrator **clamps the area it passes into the engine** into
the admissible band `apartmentDimensionsFor(bedrooms).{grossMin, grossMax}` for that storey's
bedroom count. The TRUE footprint (walls/elevations) is unchanged — only the room-budget the
bubble graph subdivides is clamped, so the gate passes and rooms are sized sensibly.

**Workaround status:** this is explicitly a **stopgap to be REPLACED under A.21.h** by a real
**house envelope validator** that counts non-bedroom area (living/kitchen/dining/garage)
properly, so the gate admits a house ground floor on its merits rather than via a clamp.

### §13.4 — Editor wiring is LANDED (console-only) — updated 2026-06-06

**Correction:** the A.21.d–g editor wiring DID land (it post-dated the first draft of this
section). `apps/editor/src/ui/house-layout/` now ships `HouseLayoutExecutor` +
`houseFromBoundary` + `houseLayoutTrigger`, and **`window.pryzmGenerateHouse(n)` /
`pryzmGenerateHouseFromBoundary(n)` console commands ARE registered** (via
`installHouseLayoutConsoleTrigger` beside the apartment installer in `AIAreaLayout.ts`). It
mints L1…Ln via `AddLevelCommand` (capturing real ids → `levelIdForStorey`), fans the apartment
`buildLayoutCommands` out per storey, places one `CreateStairCommand` per adjacent pair
(auto-punching the slab-void), and caps with a real pitched `CreateRoofCommand` — all in one
`batchCoordinator.runBatch`. Editor typecheck clean.

Still pending (NOT in the console path yet):

- the typology/onboarding trigger hookup (`briefBootstrap.ts` `casa-unifamiliar` branch) so the
  UI "House + floors>1" routes here automatically (A.21.a/A.21.j) — today it is console-only;
- the per-storey generation modal showing ALL storeys (A.21.k / tracker A.21.D10) — depends on
  threading `HouseLayoutResult.perStoreyLayout[]` into the modal;
- confirming single-undo-collapse of level-creation (`AddLevelCommand` runs via `cm.execute`
  OUTSIDE the geometry `runBatch`, so level creation may need an extra undo step — A.21.e
  caveat, verify in-browser);
- the per-storey envelope clamp (Deviation B, §13.3) still owes A.21.h's real house envelope.

The founder-reported "DESPITE I SELECTED 2 LEVELS ONLY ONE LEVEL WAS CREATED" (tracker
A.21.D13) is addressed by this wiring for the **console path** (`pryzmGenerateHouse(2)`); the
**UI** "House + floors" path still routes through the single-plate apartment generator until the
A.21.j trigger branch lands.

### §13.5 — Climate windows thread through the house core

The orchestrator threads the climate-window inputs (SPEC-TGL D6) straight into each
per-storey D-TGL call: `HouseLayoutOptions.solar = { latDeg, weight? }` is passed verbatim to
`generateDeterministicLayouts(..., opts.solar)`, so a generated house puts windows on the
sun-facing façade per storey with no extra wiring (no behaviour change when `solar` is absent).
