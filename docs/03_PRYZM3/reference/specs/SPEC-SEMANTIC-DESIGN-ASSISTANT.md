# SPEC — Semantic Design Assistant (full semantic engine)

| Field | Value |
|---|---|
| Status | **Draft — normative target** (Phase 1 not yet landed) |
| Version | 0.1 |
| Date | 2026-05-25 |
| Owner | Architecture lead |
| Governed by | **C16** (Command Authoring Protocol — every capability ships as a §5-compliant, level-oriented, semantic-first command) |
| Cross-refs | C09 (AI & Visibility Intent), C11 (Element Creation Pipeline), SPEC-07 (AI Layer L7.5), SPEC-28 (AI cost), SPEC-46 (Plan Critique), SPEC-47 (Generate-3-Options), SPEC-06 (Rooms & Levels) |
| Required ADRs | ADR-014 (AI L7.5); a new ADR for `packages/semantic-model` package boundary (to raise at Phase 2) |

> The "full semantic engine" the architect chose. Today the AI design assistant maps a prompt to a **fixed** `AIIntentType` enum (`CREATE_WALLS_ON_SLAB`, `CREATE_CURTAIN_WALLS_*`, …). Prompts like *"add windows to every south façade"*, *"put a WC in every bathroom"*, *"columns at every grid intersection"* cannot resolve because PRYZM has no queryable **semantic model** — no room-type taxonomy, no adjacency graph, no façade orientation, no fire-compartment boundaries, no furniture rules. This spec builds that model on top of the C16 substrate so the 50-prompt batch catalogue becomes answerable. It is large, multi-session, and **phased**.

---

## §1 — Goals

1. Give PRYZM a **queryable semantic model** derived from the semantic registry (C16 §7), never from the THREE scene.
2. Make every AI-generated mutation a **C16-compliant command** — level-oriented, semantic-first, batch-coalesced, undoable, span-instrumented.
3. Land the **50-prompt batch catalogue** in the AI panel, executing the feasible-today subset immediately (Phase 1) and unlocking the rest as the semantic layers land (Phases 2–5).
4. Reuse, not reinvent, the partial semantic infrastructure that already exists: `TAG_ELEMENT` + `semantic-index` StoreKey (Phase-A Semantic Tag System), `SET_ROOM_REQUIREMENT` / `requirementStore` (Autonomous Auditor), `elementRegistry` (semantic registry), `room-topology` (room detection).

## §2 — Non-goals

- Autonomous building generation (Vision §7 non-goal — AI assists, it does not author buildings unattended).
- Replacing the approval queue: every generator/modifier capability still routes through SPEC-07 §4.
- New geometry kernels: capabilities compose **existing** element commands; they add *where/which*, not *how to build*.

---

## §3 — The semantic substrate (five capability layers)

All five are **pure derivations** over the semantic registry + element stores. They live in a proposed new **`packages/semantic-model/` (L2 domain logic)** — reads schemas (L0) and stores (read-only), **no THREE, no DOM** (boundary matrix C01 §2); every exported derivation emits ≥ 1 OTel span (P8/C10).

| Layer | Name | Derives | Consumes (existing) | Unlocks |
|---|---|---|---|---|
| **SL-1** | **Room semantic tagging** | room → `roomType` (bedroom, bathroom, kitchen, living, corridor, stair, WC, office, …) via heuristics (area, adjacency, fixtures) + manual override | `room-topology` rooms, `TAG_ELEMENT`/`semantic-index`, `SET_ROOM_REQUIREMENT` | "tag/name rooms", "rooms below code area", room-targeted prompts |
| **SL-2** | **Adjacency graph** | room↔room (shared wall/opening), wall↔room (bounding), element↔level | `room-topology` boundaries, wall `openings`, level registrations (C16 §6) | "door between adjacent rooms", "corridor connectivity", egress reasoning |
| **SL-3** | **Façade orientation** | per **exterior** wall: compass orientation (N/E/S/W/NE…) from baseLine normal + project north; interior vs exterior classification | wall `baseLine`, project north (geospatial C12), SL-2 (a wall bounding ≤1 room is exterior) | "windows on south façade", "shading on west", "exterior wall" prompts |
| **SL-4** | **Fire-compartment boundaries** | compartment = maximal room set bounded by fire-rated walls/doors | wall/door `fireRating` (door/window parameter commands exist), SL-2 adjacency | "fire-rated doors on compartment boundaries", compartment audit |
| **SL-5** | **Furniture placement rules** | per room-type: fixture set + clearances + anchor wall/orientation | SL-1 room type, SL-2 adjacency, SL-3 orientation, furniture catalogue | FURNITURE prompts (beds in bedrooms, WCs in bathrooms, desks in offices) |

Each layer exposes a **query API** (e.g. `semanticModel.facadesByOrientation('S')`, `semanticModel.roomsByType('bathroom')`, `semanticModel.compartmentBoundaryDoors()`). AI proposal builders call these queries, then emit C16 commands.

---

## §4 — The 50-prompt → capability map

The verbatim 50 prompts (captured in the architect's 2026-05-24 message; enumerated in full as the **Phase-1 deliverable**) fall into 10 families of 5. Each prompt is classified **F = feasible today** (maps to an existing batch command) or **S<n> = needs semantic layer n**.

| Family | Prompts | Feasible-today subset (Phase 1) | Semantic-required subset |
|---|---|---|---|
| WALLS (1–5) | walls on all slabs, perimeter walls, by region… | `CREATE_WALLS_ON_ALL_SLABS`, `CREATE_WALLS_FROM_SLAB` ✅ | "interior partitions between rooms" → **SL-2** |
| DOORS (6–10) | doors on a wall, doors per room… | single door create ✅ | "door between every adjacent room", "egress doors" → **SL-2** |
| WINDOWS (11–15) | windows on a wall… | single window create ✅ | "windows on every south façade", "punched windows on exterior" → **SL-3** |
| COLUMNS (16–20) | columns at grid, perimeter columns… | columns at grid intersections (needs grid) → **partly F** (grid exists) | "columns at room corners" → **SL-2** |
| BEAMS (21–25) | beams between columns… | — | "beams spanning columns" → structural graph (**Phase 5**) |
| ROOFS & CEILINGS (26–30) | roof by region, ceilings per room… | `CREATE_ROOF_BY_REGION` ✅ | "ceilings in every enclosed room" → **SL-1/SL-2** |
| SLABS & FLOORS (31–35) | slabs on all floors… | `CREATE_SLABS_ON_ALL_FLOORS`, `CREATE_ALL_SLABS_FROM_LEVEL_TO_ALL_FLOORS` ✅ | "floor finish by room type" → **SL-1** |
| STAIRS & HANDRAILS (36–40) | stair between levels, handrails on stairs… | stair create (two-level, C11 §11.3) ✅ | "handrails on all open edges" → **SL-2** |
| LIGHTING (41–45) | lights per room, grid lighting… | single lighting create ✅ | "lights centred per room", "lux by room type" → **SL-1** |
| FURNITURE (46–50) | beds in bedrooms, WCs in bathrooms… | single furniture create ✅ | all room-aware placement → **SL-5** |

**Phase 1 ships the F column**: the AI panel lists all 50 prompts; the feasible subset executes through existing batch commands; the S column shows a "coming in Phase N" affordance instead of failing silently.

> The **panel-shaped registry** of these prompts — mapped to the live `CREATE › Discipline › System › ⚡Batch › item` form, with one shared prompt string per entry — is **C17 (Batch Creation Catalogue & Panel Binding)**. C17 §4 is the catalogue; this SPEC §4 is the AI-side superset and phasing. Both read one catalogue module (C17 §8).

---

## §5 — Architecture

```
User prompt (AI panel)
  → ai-host: intent classification → AIIntentType (extended) 
  → proposal builder QUERIES packages/semantic-model (SL-1..SL-5)        ← read-only, span-instrumented
  → builds CommandProposal(s): one C16-compliant command per mutation
       (batch kinds → ONE X.batch.create / runBatch — C16 §8)
  → SPEC-07 §4 approval queue (generator/modifier) + SPEC-28 cost gate
  → runtime.commandBus.dispatch(..., { source: 'ai' })   ← no undo push (C16 §9)
  → C11 pipeline (identical to UI path from the bus onward)
```

New/changed surfaces:

1. **`packages/semantic-model/` (L2, new)** — the five query layers (§3). Pure; emits spans; no scene access.
2. **`packages/ai-host` intent extension** — new `AIIntentType` entries (semantic intents) + proposal builders that call `semantic-model`. Each builder is the only place "where to place" logic lives; "how to build" stays in the element commands.
3. **AI panel** — the 50-prompt catalogue UI (Phase 1), with per-prompt feasibility state.
4. **No new mutation path** — every generated command is an existing or new C16 §5 command.

---

## §6 — Governance & invariants (binding)

- **G-1** Every capability that mutates the model ships as a **C16 §5-compliant command** (CA-1…CA-16). Semantic placement logic computes *which/where*; the command owns *level + semantic + geometry*.
- **G-2** Semantic queries read the **semantic registry / stores only**, never THREE (C16 §7.1).
- **G-3** Generator/Modifier capabilities go through the **approval queue** (SPEC-07 §4); Inspector/Critic are read-only.
- **G-4** Multi-element output **batches** (C16 §8 / C11 §4.2) — one `X.batch.create` per family, never a per-element dispatch loop.
- **G-5** Every `semantic-model` export and every proposal builder emits ≥ 1 **OTel span** (P8/C10); cost-gated per SPEC-28.
- **G-6** Capabilities are **level-aware**: a prompt scoped to a level (or "all levels") resolves `levelId`(s) explicitly (C16 §6); results respect level visibility.

---

## §7 — Phased plan

| Phase | Scope | Deliverable / gate |
|---|---|---|
| **1** | Intent vocabulary + **verbatim 50-prompt catalogue** in the AI panel + wire the **feasible-today (F) subset** to existing batch commands; S-prompts show "Phase N" affordance | AI panel lists 50; F-subset executes end-to-end; no silent failures |
| **2** | **SL-1** room semantic tagging + **SL-3** façade orientation | "tag rooms", "windows on south façade", interior/exterior classification work; query API + spans |
| **3** | **SL-2** adjacency graph + **adjacency-driven openings** (doors between adjacent rooms; windows on exterior façades by rule) | rule-based door/window placement via batch commands; egress-adjacency queries |
| **4** | **SL-5** furniture placement engine (room-type + clearance + adjacency) | FURNITURE 46–50 place correctly per room; clearance respected |
| **5** | Structural (columns@grid, beams@columns via structural graph) + **SL-4** fire compartments + compartment-aware fire-rated doors/walls | BEAMS + structural prompts; fire-compartment audit + fire-rated boundary doors |

Each phase is "done" only when **runtime behaviour matches this spec** (Vision §8 rule 2), not on documentation.

---

## §8 — Verification (per phase)

- **CI**: `packages/semantic-model` unit tests for each query layer; C16 CI gates (G-CA-L/G-CA-S) cover every command a capability emits; OTel span check (P8).
- **Runtime gates**: Phase 1 — each F-prompt creates the expected elements across the right levels (C11 §8.2 batch, no LONGTASK; C16 level-visibility gate). Phase 2 — façade query returns correct N/E/S/W for a known model; tagging classifies a reference plan. Phase 3 — doors land only between truly adjacent rooms. Phase 4 — no furniture overlaps; clearances hold. Phase 5 — compartment boundaries match fire-rated wall sets.

## §9 — Cross-references

C16 (authoring substrate — **read first**), C09 (AI L7.5), C11 (creation pipeline), SPEC-07 (AI surfaces + approval queue), SPEC-28 (cost), SPEC-46/47 (existing AI workflows to mirror), SPEC-06 (rooms/levels). Existing infra to build on: `TAG_ELEMENT`/`semantic-index`, `SET_ROOM_REQUIREMENT`/`requirementStore` (Autonomous Auditor), `room-topology`, `elementRegistry`.
