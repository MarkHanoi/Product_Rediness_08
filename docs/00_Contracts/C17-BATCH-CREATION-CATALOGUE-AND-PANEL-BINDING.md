# C17 — Batch Creation Catalogue & Panel Binding

> **Stamp**: 2026-05-25 · **Status**: CANONICAL
> **Authority**: this contract is the **single registry** of PRYZM's batch-creation prompts. It defines (a) the canonical catalogue of batch commands, (b) the natural-language prompt string for each (the one source of truth shared by the CREATE panel and the AI panel), and (c) the binding rules for surfacing them in the `CREATE` panel in the existing `CREATE › Discipline › System › Item` form.
> **Governed by**: **C16** (every catalogue entry is a C16 §5-compliant, level-oriented, semantic-first command; batch entries satisfy C16 §8 / CA-12).
> **Cross-refs**: C11 (creation pipeline), `SPEC-SEMANTIC-DESIGN-ASSISTANT` (the AI/semantic phases that unlock the not-yet-feasible entries), C09 (AI), §41 (preview).

> **Anchors (the live UI this mirrors):**
> - CREATE panel config: `apps/editor/src/ui/layout/CreatePanelLayout.ts` → `CREATE_CONFIG` (`Discipline › System › Item`, each leaf an `action` or nested `children`).
> - Existing batch command types: `packages/command-registry/src/types.ts` (`CommandType`).
> - Existing AI intents: `packages/ai-host/src/intents.ts` (`AIIntentType`).

---

## §1 — Why this contract exists

PRYZM already has batch commands (`CREATE_WALLS_ON_ALL_SLABS`, `CREATE_SLABS_ON_ALL_FLOORS`, `CREATE_MULTIPLE_LEVELS`, …) and a separate AI-intent enum, but:

1. There is **no canonical list** of which batch prompts exist, what each is called, which command/intent it maps to, and which are live vs phased.
2. The **CREATE panel** exposes only **single-element** tools; the batch variants are reachable only through the AI panel or ad-hoc command dispatch — so the same capability has two unrelated entry points and two unrelated prompt strings.
3. The architect's 50-prompt batch catalogue (the Semantic Design Assistant) needs a **panel-shaped home** in the existing `CREATE › …` navigation, with one prompt string driving both the panel item label and the AI intent.

C17 fixes this: **one catalogue, one prompt string per entry, surfaced identically in the CREATE panel and consumed by the AI panel.** New batch capability is not "done" until it has a C17 entry (§7).

---

## §2 — The panel form (mirror of `CREATE_CONFIG`)

Batch items MUST appear in the **same hierarchical navigation** the CREATE panel uses today:

```
CREATE  (title: "Discipline")
 └─ Discipline            e.g. Architecture · Structure · Plumbing · Interior · Project · Site
     └─ System            e.g. Wall · Slab · Column · Levels · Grid
         └─ Item          a single-element tool  (action)   — TODAY
         └─ Item › Batch  a batch-creation prompt (action → C16 batch command)  — THIS CONTRACT
```

**Batch leaf shape (normative).** A batch item is a CREATE-panel leaf whose `action` dispatches a **C16 batch command** (never an interactive tool). It extends the existing leaf shape (`{ label, icon, action }`) with three required catalogue-bound fields:

```ts
interface BatchCreateItem {
  label: string;          // = catalogue prompt's short label (§6)
  icon: string;
  batch: true;            // marks it a batch dispatch, not a tool activation
  catalogId: string;      // stable key into the C17 catalogue (§4), e.g. 'walls.on-all-slabs'
  action: () => void;     // dispatches the mapped C16 command via runtime.bus / runBatch
  phase?: 1|2|3|4|5;      // SPEC-SEMANTIC phase; if > current, item renders disabled + tooltip
}
```

**Placement rule.** Batch variants of an element are nested under that element's `children` as a dedicated `⚡ Batch` sub-layer (mirroring how `Slab › { 2-Point, Hollow, Polyline, By Region, Pick Walls }` already nests modes). Project-scope batch items (levels, grid, duplicate floor plan) live under a top-level **Project** discipline. This keeps the existing single-element items untouched and additive.

---

## §3 — Batch scope vocabulary (normative)

Every batch entry declares exactly one **scope** — the rule that resolves *which* targets and *which levels* it touches (C16 §6 level-orientation). The scope is the contract between the prompt and the command.

| Scope id | Meaning | Level set touched | Resolution source |
|---|---|---|---|
| `from-selected` | apply to the currently selected element(s) | the selection's level(s) | `selectionManager` |
| `on-active-level` | apply across the active level | active level | `bimManager.getActiveLevel()` |
| `on-all-levels` | apply on every level | all levels | `bimManager.getLevels()` |
| `from-level-to-all-floors` | replicate from a source level to every other floor | all levels | source level + `getLevels()` |
| `from-level-to-top` | replicate from a source level up to the top level | source→top | source + top level |
| `on-all-<host>` | one per host element of a type (e.g. on-all-slabs) | hosts' levels | `slabStore.getAll()` etc. |
| `by-region` | apply within a user-drawn region | region's level | region polygon |
| `on-grid` | at grid intersections | grid's level(s) | `gridStore` / grid system |
| `per-room` | one per room (optionally filtered by room type) | rooms' levels | `room-topology` + SL-1 (semantic) |
| `per-facade` | per exterior wall, optionally by orientation | facades' levels | SL-3 (semantic) |
| `per-compartment` | per fire compartment boundary | compartments' levels | SL-4 (semantic) |
| `project` | project-scope structural op (levels, duplicate plan) | as specified | bimManager / project |

`per-room`, `per-facade`, `per-compartment` require the semantic model (`SPEC-SEMANTIC-DESIGN-ASSISTANT` SL-1/3/4) and are therefore phased.

---

## §4 — The batch-creation catalogue (normative registry)

Columns: **Path** = `Discipline › System › ⚡Batch › label`. **Prompt** = the canonical NL string (§6). **Command** = `CommandType` (or `—` = new, to author). **Intent** = `AIIntentType` (or `—`). **Scope** = §3. **Phase** = SPEC-SEMANTIC phase. **Status**: ✅ live · 🟡 partial · ⏳ phased.

### §4.1 — Architecture

| Path | Prompt | Command | Intent | Scope | Phase | Status |
|---|---|---|---|---|---|---|
| Architecture › Wall › ⚡ | "Create walls on all slabs" | `CREATE_WALLS_ON_ALL_SLABS` | `CREATE_WALLS_ON_ALL_SLABS` | on-all-slabs | 1 | ✅ |
| Architecture › Wall › ⚡ | "Create walls from selected slab" | `CREATE_WALLS_FROM_SLAB` | `CREATE_WALLS_ON_SLAB` | from-selected | 1 | ✅ |
| Architecture › Wall › ⚡ | "Add interior partitions between adjacent rooms" | — | — | per-room | 3 | ⏳ |
| Architecture › Curtain Wall › ⚡ | "Create curtain walls on all slabs" | `CREATE_CURTAIN_WALLS_ON_ALL_SLABS` | `CREATE_CURTAIN_WALLS_ON_ALL_SLABS` | on-all-slabs | 1 | ✅ |
| Architecture › Curtain Wall › ⚡ | "Create curtain walls from selected slab" | `CREATE_CURTAIN_WALLS_FROM_SLAB` | `CREATE_CURTAIN_WALLS_ON_SLAB` | from-selected | 1 | ✅ |
| Architecture › Door › ⚡ | "Add a door between every pair of adjacent rooms" | — | — | per-room | 3 | ⏳ |
| Architecture › Door › ⚡ | "Add fire-rated doors on every compartment boundary" | — | — | per-compartment | 5 | ⏳ |
| Architecture › Window › ⚡ | "Add windows to every south façade" (N/E/S/W) | — | — | per-facade | 2 | ⏳ |
| Architecture › Window › ⚡ | "Add punched windows to all exterior walls" | — | — | per-facade | 3 | ⏳ |
| Architecture › Room › ⚡ | "Detect all rooms" | `DETECT_ALL_ROOMS` / `BATCH_CREATE_ROOMS` | — | on-all-levels | 1 | ✅ |
| Architecture › Room › ⚡ | "Detect rooms on the active level" | `DETECT_ROOM_FROM_WALLS` | — | on-active-level | 1 | ✅ |
| Architecture › Room › ⚡ | "Name/tag every room by type" | `TAG_ELEMENT` (+SL-1) | — | per-room | 2 | ⏳ |
| Architecture › Ceiling › ⚡ | "Ceiling in every room" (by type) | `CREATE_CEILINGS_BY_ROOM` | — | per-room | 2 | ✅ (catalogId `ceilings.per-room`; suspended grid in offices, plasterboard else) |
| Architecture › Floor › ⚡ | "Floor finish by room type" | `CREATE_FLOORS_BY_ROOM_TYPE` | — | per-room | 2 | ✅ (catalogId `floors.finish-by-room-type`; consumes `room.occupancyType`) |

### §4.2 — Structure

| Path | Prompt | Command | Intent | Scope | Phase | Status |
|---|---|---|---|---|---|---|
| Structure › Slab › ⚡ | "Create slabs on all floors" | `CREATE_SLABS_ON_ALL_FLOORS` | `CREATE_SLABS_ON_ALL_FLOORS` | on-all-levels | 1 | ✅ |
| Structure › Slab › ⚡ | "Replicate slabs from this level to all floors" | `CREATE_ALL_SLABS_FROM_LEVEL_TO_ALL_FLOORS` | same | from-level-to-all-floors | 1 | ✅ |
| Structure › Slab › ⚡ | "Replicate slabs from this level to the top level" | `CREATE_ALL_SLABS_FROM_LEVEL_TO_TOP_LEVEL` | same | from-level-to-top | 1 | ✅ |
| Structure › Slab › ⚡ | "Create a slab on this level like the selected one" | `CREATE_SLAB_ON_LEVEL_SIMILAR_TO_SELECTED` | same | from-selected | 1 | ✅ |
| Structure › Column › ⚡ | "Place columns at every grid intersection" | `CREATE_GRID_SYSTEM` (+column placement) | `CREATE_GRID_SYSTEM` | on-grid | 1🟡 | 🟡 (needs grid; placement to author) |
| Structure › Column › ⚡ | "Place columns at every room corner" | — | — | per-room | 3 | ⏳ |
| Structure › Beam › ⚡ | "Span beams between all aligned columns" | — | — | on-grid | 5 | ⏳ |
| Structure › Roof › ⚡ | "Create a roof by region" | `CREATE_ROOF` | `CREATE_ROOF_BY_REGION` | by-region | 1 | ✅ |

### §4.3 — Plumbing / Interior (semantic, furniture engine)

| Path | Prompt | Command | Intent | Scope | Phase | Status |
|---|---|---|---|---|---|---|
| Plumbing › Fixtures › ⚡ | "Put a WC set in every bathroom" | `CREATE_PLUMBING_FIXTURE` (+SL-1/SL-5) | — | per-room | 4 | ⏳ |
| Interior › Furniture › ⚡ | "Place a bed in every bedroom" | `CREATE_FURNITURE` (+SL-5) | — | per-room | 4 | ⏳ |
| Interior › Furniture › ⚡ | "Place a desk in every office" | `CREATE_FURNITURE` (+SL-5) | — | per-room | 4 | ⏳ |
| Interior › Lighting › ⚡ | "Downlight in every room" | `CREATE_LIGHTING_BY_ROOM` | — | per-room | 2 | ✅ (catalogId `lighting.per-room`; one centred downlight, excl. circulation) |

### §4.4 — Project (project-scope structural ops) — *the "CREATE › FLOOR LEVELS" home*

| Path | Prompt | Command | Intent | Scope | Phase | Status |
|---|---|---|---|---|---|---|
| Project › Levels › ⚡ | "Create N floor levels" | `CREATE_LEVEL` ×N / multi-level | `CREATE_MULTIPLE_LEVELS` | project | 1 | ✅ |
| Project › Levels › ⚡ | "Duplicate this floor plan to other levels" | `DUPLICATE_FLOOR_PLAN` | — | project | 1 | ✅ |
| Project › Grid › ⚡ | "Create a structural grid system" | `CREATE_GRID_SYSTEM` | `CREATE_GRID_SYSTEM` | project | 1 | ✅ |
| Project › Grid › ⚡ | "Delete all grids" | `DELETE_ALL_GRIDS` | `DELETE_ALL_GRIDS` | project | 1 | ✅ |

> The 50-prompt verbatim catalogue (`SPEC-SEMANTIC-DESIGN-ASSISTANT` §4) is the superset; the **feasible-today (Phase 1, ✅)** rows above are exactly what wires into the panel first. Each ⏳ row renders disabled with a "Coming in Phase N" tooltip until its semantic layer lands.

---

## §5 — Panel binding contract (`CB-1` … `CB-8`)

- **CB-1** Batch items are **additive** to `CREATE_CONFIG`: single-element tools are unchanged. Batch variants nest under their element as a `⚡ Batch` `children` layer (title e.g. "Wall — Batch").
- **CB-2** A batch leaf's `action` MUST dispatch a **C16 batch command** through `runtime.bus.executeCommand(...)` (or the legacy command via `commandManager` only where the family is still Path A), which internally uses `batchCoordinator.runBatch` (C16 §8). It MUST NOT activate an interactive tool.
- **CB-3** Each batch leaf MUST carry a `catalogId` (§2) that resolves to exactly one §4 row — the single binding between panel, catalogue, and AI intent.
- **CB-4** **Feasibility gating.** If a row's `phase` exceeds the shipped phase, the leaf renders **disabled** with a tooltip "Coming in Phase N — needs <semantic layer>". It MUST NOT be hidden (discoverability) and MUST NOT dispatch.
- **CB-5** **Level gating.** Batch leaves obey the existing `hasLevels` gate (CreatePanelLayout disables creation when no levels exist) and any scope-specific precondition (e.g. on-all-slabs disabled with reason when no slabs exist), surfaced as a tooltip — never a silent no-op.
- **CB-6** **Scope-resolution lives in the command, not the panel.** The panel passes only the scope id + minimal payload; the command resolves targets/levels per §3 (single source of truth; AI and panel share it).
- **CB-7** **Preview/affordance.** Where a batch produces a previewable result, it uses unified PRYZM purple (§41). Long batches show the BatchLoadingIndicator (C11 §6.6).
- **CB-8** **One prompt string.** The leaf `label` and the AI prompt for the same `catalogId` are the **same string** (§6). No divergent wording between panel and AI.

---

## §6 — Prompt-string contract

Each catalogue row owns **one canonical prompt string**, parameterised where a scope needs an argument:

```
"{verb} {element} {scope-phrase}[ {filter}]"
  e.g. "Create walls on all slabs"
       "Add windows to every {orientation} façade"   → orientation ∈ {north,east,south,west}
       "Create {n} floor levels"                      → n: integer
       "Put a {fixture} in every {roomType}"          → fixture, roomType from SL taxonomies
```

Rules:
- **PS-1** The string is the **shared** source for the panel label (short form) and the AI panel prompt (full form). Store both in the catalogue row (`label`, `prompt`).
- **PS-2** Parameters are typed and enumerated; the AI maps free text → these parameters; the panel renders a small inline control (number field, orientation chips, room-type select) for the same parameters.
- **PS-3** A prompt maps **1:1** to `(catalogId → command, intent, scope)`. No prompt resolves to two commands; a compound request is decomposed by the AI into multiple catalogue dispatches (each a separate undo unit unless explicitly grouped).

---

## §7 — Governance

- **G-1** A new batch capability is **not done** until it has: a §4 catalogue row, a C16 §5-compliant batch command (CA-12), an `AIIntentType` + proposal builder (if AI-reachable), and a CB-compliant panel leaf.
- **G-2** The catalogue (§4) is the **single registry**; the panel and AI panel both read it. Duplicating prompt strings or scope logic elsewhere is a violation.
- **G-3** Phasing follows `SPEC-SEMANTIC-DESIGN-ASSISTANT`; ⏳ rows ship disabled-with-tooltip, never hidden, never silently failing (CB-4).
- **G-4** Every batch dispatch is undoable as **one** unit (C16 §8 / CA-11) and span-instrumented (P8).

---

## §8 — AS-IS / phasing summary

- **Phase 1 (wire now):** all ✅ rows — walls/curtain-walls on-all-slabs + from-selected; slabs on-all-floors / from-level variants / similar-to-selected; roof by region; detect rooms; levels (×N) + duplicate floor plan; grid system + delete-all-grids. These map to **existing** commands/intents and only need the CB-compliant panel leaves + the shared catalogue module.
- **Phase 2–5:** ⏳ rows unlock as SL-1…SL-5 land (`SPEC-SEMANTIC-DESIGN-ASSISTANT` §7): windows-by-façade (2), per-room ceilings/partitions/doors (3), furniture/plumbing per room (4), structural beams + compartment-aware doors (5).
- **Implementation note:** introduce one catalogue module (e.g. `apps/editor/src/ui/create/batchCatalogue.ts`) exporting the §4 rows; `CreatePanelLayout` renders `⚡ Batch` layers from it; the AI panel reads the same module for its prompt list. This guarantees CB-8 / G-2 by construction. **The exact AS-IS dispatch path each entry must use (legacy command class, constructor args, scope/selection resolution, preconditions, gaps) is documented in §10–§11 — read those before wiring.**

---

## §10 — AS-IS dispatch reference (analysed 2026-05-25, before implementation)

> Mandatory pre-implementation audit: this section records **exactly how each batch command is dispatched today** so the catalogue wires through the real path — no fake/shortcut dispatch, no re-implemented loops, no direct store writes. Verified against source on 2026-05-25.

### §10.1 — The execution contract (how a batch command actually runs)

```
AIService.getCommandProposals()                 packages/ai-host/src/AIService.ts (~§200–317)
  → constructs a LEGACY `Command` object per intent (new CreateXCommand(args))
  → wraps it in a CommandProposal { command, intentType, validation, … }
AIPanel approve handler                          apps/editor/src/ui/ai/AIPanel.ts:704–726
  → const cmd = proposal.command
  → manager.execute(cmd, { source: 'AI_PROPOSAL', proposalId })   ← manager = window.commandManager
```

Findings (binding context):

1. **The live path is Path A (`commandManager.execute`)**, not the bus. AI proposals are legacy `Command` instances executed by `window.commandManager.execute(cmd, meta)` — one undo-history entry per batch (undoable as one unit).
2. **The legacy command is the COMPLETE path.** Each batch command internally (a) wraps its mutation loop in `batchCoordinator.runBatch(...)` (C16 §8 coalescing) **and** (b) fire-and-forget dispatches the parallel `*.batch.create` **bus** event for event-sourcing in the plugin store (e.g. `CreateWallsOnAllSlabsCommand` §P2e-walls). So executing the legacy command yields geometry **and** the event-sourced record.
3. **Bus handlers exist but are NOT the geometry trigger today.** `wall.create-on-all-slabs`, `slab.create-on-all-floors`, `curtain-wall.create-on-all-slabs`, `level.duplicate-floor-plan` are registered (PRYZM3 migration target) but the legacy `wallStore.add()` path remains authoritative (per each command's §P2e comment). The bus handler alone writes a parallel plugin-store record.

**DI decision:** the catalogue dispatches via `commandManager.execute(new XCommand(args), { source: 'CREATE_PANEL_BATCH' })` — the **same** proven path as the AI panel (CB-2's explicit Path-A allowance). Identical undo/runBatch/event-sourcing behaviour; zero new mutation path. Bus migration tracked by the existing `commandManager.execute` ratchet (C14), not blocked on here.

### §10.2 — Per-command dispatch table (Phase-1 ✅ rows)

| catalogId | Legacy command class · file (`packages/command-registry/src/…`) | Constructor args | Bus type (target, not used today) | Scope resolution |
|---|---|---|---|---|
| `walls.on-all-slabs` | `CreateWallsOnAllSlabsCommand` · `walls/` | `{ wallHeight=3.0, wallThickness=0.2 }` | `wall.create-on-all-slabs` | none (all slabs) |
| `walls.from-selected-slab` | `CreateWallsFromSlabCommand` · `walls/` | `{ slabId, wallHeight=3.0, wallThickness=0.2 }` | — | selected slab id |
| `curtain-walls.on-all-slabs` | `CreateCurtainWallsOnAllSlabsCommand` · `curtainwall/` | `{ height=3.0 }` | `curtain-wall.create-on-all-slabs` | none |
| `curtain-walls.from-selected-slab` | `CreateCurtainWallsFromSlabCommand` · `curtainwall/` | `{ slabId, height=3.0 }` | — | selected slab id |
| `slabs.on-all-floors` | `CreateSlabsOnAllFloorsCommand` · `slabs/` | `referenceSlabId: string` **(positional)** | `slab.create-on-all-floors` | selected slab, else first slab on active level |
| `slabs.from-level-to-all-floors` | `CreateAllSlabsFromLevelToAllFloorsCommand` · `slabs/` | `sourceLevelId: string` **(positional)** | — | active level id |
| `slabs.from-level-to-top` | `CreateAllSlabsFromLevelToTopLevelCommand` · `slabs/` | `sourceLevelId: string` **(positional)** | — | active level id |
| `slabs.similar-to-selected` | `ReplicateSelectedSlabToAllLevelsCommand` · `slabs/CreateSlabOnLevelSimilarToSelectedCommand.ts` ⚠ class name ≠ file/catalogue | `{ referenceSlabId }` | — | selected slab id (needs ≥2 levels) |
| `levels.create-n` | `CreateMultipleLevelsCommand` · `levels/` | `{ count, baseElevation, heightPerLevel }` | — (intent `CREATE_MULTIPLE_LEVELS`) | `count`,`heightPerLevel` params; `baseElevation` = topLevel.elevation + (topLevel.height ‖ heightPerLevel) |
| `grid.create-system` | `CreateGridSystemCommand` · `grids/` | `{ xCount=5, yCount=5, xSpacing=8, ySpacing=8, xOrigin=0, yOrigin=0 }` | — | params with defaults |

All classes verified exported from the `@pryzm/command-registry` barrel (`src/index.ts` lines 53,54,94,115,118,184,187 + walls/slabs).

### §10.3 — Scope / selection resolution (normative)

- **Active level** → `bimManager.getActiveLevel()?.id`.
- **Levels list / top level** → `bimManager.getLevels()`; top = max `elevation`.
- **Selected element** → `selectionManager.selectedObject?.userData?.elementId` (+ `?.userData?.elementType`). `userData.elementId` is the standard accessor (set by `WallFragmentBuilder`, `WindowBuilder`, `WallStore`, …). Validate slab-reference scopes against `slabStore.getById(id)?.type === 'slab'`.
- **"first slab on active level"** fallback → `slabStore.getAll().filter(s => s.levelId === activeLevelId)[0]`.

### §10.4 — Preconditions (the CB-5 reasons)

| catalogId | Precondition (else disabled with reason) |
|---|---|
| `*.on-all-slabs` | ≥1 slab exists |
| `*.from-selected-slab` | a slab is currently selected |
| `slabs.on-all-floors` | a slab selected **or** ≥1 slab on active level; ≥2 levels |
| `slabs.from-level-*` | active level has ≥1 slab; ≥2 levels |
| `slabs.similar-to-selected` | a slab selected **and** ≥2 levels |
| `levels.create-n` | `count` ≥ 1 |
| all | ≥1 level exists (existing `hasLevels` gate) |

### §10.5 — Gaps found (document; do NOT fake-wire)

- **G-D1** `DELETE_ALL_GRIDS` is a `CommandType` + `AIIntentType` value with **no command class** (only `PlanOrdering` references it). Excluded from Phase-1 until a `DeleteAllGridsCommand` (or bus handler) is authored per C16.
- **G-D2** `DuplicateFloorPlanCommand` requires `{ sourceLevelId, targetLevelIds[] }` — `targetLevelIds` needs a **target picker** ("to which levels?"). Deferred to a parameterized-leaf sub-step; not a parameterless Phase-1 dispatch.
- **G-D3** Class/name mismatch (G-D table footnote): `ReplicateSelectedSlabToAllLevelsCommand` ↔ type `CREATE_SLAB_ON_LEVEL_SIMILAR_TO_SELECTED`. The catalogue keys by `catalogId`; the class name is recorded in §10.2.
- **G-D4** `roof.by-region` **auto** mode (AIService extracts the outermost region from the highest level's walls via `WallRegionExtractor`) is deferred — the interactive `Roof › By Region` tool already exists in the panel; no duplicate batch leaf, and the auto version needs `WallRegionExtractor` (ai-host, L2).

---

## §11 — Catalogue dispatch implementation contract (`DI-1` … `DI-6`)

- **DI-1** Dispatch via `commandManager.execute(new XCommand(args), { source: 'CREATE_PANEL_BATCH' })` (Path A; matches AIPanel §10.1). MUST NOT hand-roll store writes or re-implement the per-element loop.
- **DI-2** One catalogue module `apps/editor/src/ui/create/batchCatalogue.ts` is the single source. Each entry:
  ```ts
  interface BatchCatalogEntry {
    catalogId: string; discipline: string; system: string;
    label: string; prompt: string;            // §6 — shared by panel + AI
    scope: BatchScope;                          // §3
    phase: 1|2|3|4|5; status: 'live'|'partial'|'phased';
    build(deps: BatchDeps): Command | null;     // constructs the legacy command (§10.2), or null
    precondition(deps: BatchDeps): { ok: boolean; reason?: string };  // §10.4
  }
  ```
- **DI-3** `build(deps)` resolves scope per §10.3 and returns the constructed legacy command, or `null` when `precondition` fails. `BatchDeps = { bimManager, selectionManager, slabStore, getLevels }`, injected by the panel — no `window.*` reads inside the catalogue except the documented `commandManager` execution sink.
- **DI-4** Feasibility: entries with `phase > SHIPPED_PHASE` render **disabled** with a "Coming in Phase N" tooltip (CB-4); never dispatch.
- **DI-5** Precondition failure surfaces as a toast/inline reason (CB-5) — never a silent no-op.
- **DI-6** Each dispatch is exactly one undo unit (the legacy command is one history entry) and carries its own OTel span + `runBatch` (C16 §8/CA-14). The catalogue introduces **no** second mutation path (G-2 holds by construction).

---

## §12 — Cross-references

C16 (authoring substrate — every entry is a §5 command, batch = §8/CA-12), `SPEC-SEMANTIC-DESIGN-ASSISTANT` (phases + the 50-prompt superset), C11 (creation pipeline + §6.6 BatchLoadingIndicator), C09 (AI intents), §41 (preview). Live anchors: `CreatePanelLayout.ts` `CREATE_CONFIG`, `command-registry/src/types.ts` `CommandType`, `ai-host/src/intents.ts` `AIIntentType`, `ai-host/src/AIService.ts` (construction) + `ui/ai/AIPanel.ts:726` (execution).
