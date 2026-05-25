# SPEC — Semantic Design Assistant (full semantic engine)

| Field | Value |
|---|---|
| Status | **Draft — normative target** · Phase 1 (catalogue) landed; semantics audited |
| Version | 0.2 (2026-05-25 — AS-IS audit corrected SL-1/SL-2 to EXISTING) |
| Date | 2026-05-25 |
| Owner | Architecture lead |
| Governed by | **C16** (Command Authoring Protocol — every capability ships as a §5-compliant, level-oriented, semantic-first command) · **C17** (batch catalogue + panel binding) |
| Cross-refs | C09 (AI & Visibility Intent), C11 (Element Creation Pipeline), SPEC-07 (AI Layer L7.5), SPEC-28 (AI cost), SPEC-46 (Plan Critique), SPEC-47 (Generate-3-Options), SPEC-06 (Rooms & Levels) |
| Required ADRs | ADR-014 (AI L7.5). **No new `packages/semantic-model` package** — the v0.1 assumption was wrong: SL-1/SL-2 already live in `packages/spatial-index` (§3.1). SL-3/SL-4/SL-5 extend `spatial-index`. |

> **v0.2 revision (2026-05-25):** an AS-IS audit (§3.1) found the room-semantic substrate is **already substantially built** in `packages/spatial-index` — `RoomTypeInferenceEngine` (SL-1), `RoomGraphService` (SL-2), `RoomQueryService`, `RoomValidationService`. v0.1 incorrectly proposed a greenfield `packages/semantic-model`. This revision corrects §3/§5 to **reuse** those services; the genuine gaps are SL-3 (façade), SL-4 (fire compartments), SL-5 (furniture placement), the **apply-inferred-type-as-tag** flow, and the per-room/façade/compartment **consuming batch commands**.

> The "full semantic engine" the architect chose. Today the AI design assistant maps a prompt to a **fixed** `AIIntentType` enum (`CREATE_WALLS_ON_SLAB`, `CREATE_CURTAIN_WALLS_*`, …). Prompts like *"add windows to every south façade"*, *"put a WC in every bathroom"*, *"columns at every grid intersection"* cannot resolve because PRYZM has no queryable **semantic model** — no room-type taxonomy, no adjacency graph, no façade orientation, no fire-compartment boundaries, no furniture rules. This spec builds that model on top of the C16 substrate so the 50-prompt batch catalogue becomes answerable. It is large, multi-session, and **phased**.

---

## §1 — Goals

1. Give PRYZM a **queryable semantic model** derived from the semantic registry (C16 §7), never from the THREE scene.
2. Make every AI-generated mutation a **C16-compliant command** — level-oriented, semantic-first, batch-coalesced, undoable, span-instrumented.
3. Land the **50-prompt batch catalogue** in the AI panel, executing the feasible-today subset immediately (Phase 1) and unlocking the rest as the semantic layers land (Phases 2–5).
4. **Reuse, not reinvent.** The room-semantic substrate already exists in `packages/spatial-index` (SL-1 `RoomTypeInferenceEngine`, SL-2 `RoomGraphService`, `RoomQueryService`, `RoomValidationService` — §3.1) plus `SET_ROOM_OCCUPANCY`, `TAG_ELEMENT`/`semantic-index`, `SET_ROOM_REQUIREMENT`/`requirementStore`, `room-topology`. This SPEC extends that, it does not replace it.

## §2 — Non-goals

- Autonomous building generation (Vision §7 non-goal — AI assists, it does not author buildings unattended).
- Replacing the approval queue: every generator/modifier capability still routes through SPEC-07 §4.
- New geometry kernels: capabilities compose **existing** element commands; they add *where/which*, not *how to build*.

---

## §3 — The semantic substrate (five capability layers)

The substrate is **pure derivations** over the stores (read-only) — **no THREE, no DOM** (C01 §2); every exported derivation emits ≥ 1 OTel span (P8/C10). **SL-1 and SL-2 already exist** in `packages/spatial-index` (§3.1); SL-3/SL-4/SL-5 extend that package.

| Layer | Name | Status | Derives | Unlocks |
|---|---|---|---|---|
| **SL-1** | **Room semantic tagging** | ✅ **EXISTS** — `RoomTypeInferenceEngine` (`spatial-index`) | room → `RoomOccupancyType` (bathroom, bedroom, kitchen, dining-room, living-room, meeting-room, private-office…) via rule engine over furniture names, plumbing fixtures, area, perimeter/area ratio; `inferType(roomId)` + `inferLevel(levelId)` → `{suggested, confidence, reason}` | "tag/name rooms", room-targeted prompts |
| **SL-2** | **Adjacency graph** | ✅ **EXISTS** — `RoomGraphService` (`spatial-index`) | room↔room via doors (`getAdjacentRooms`, `getConnectedRooms`, `findPath`, `getConnectedComponent`, `getEdgesForRoom`); per-level `getGraph`; door-invalidation | "door between adjacent rooms", corridor connectivity, egress |
| **SL-3** | **Façade orientation** | ❌ **GAP** | per **exterior** wall: compass orientation (N/E/S/W/NE…) from baseLine normal + project north; interior vs exterior classification (a wall bounding ≤1 room is exterior — uses SL-2 / RoomQueryService) | "windows on south façade", "shading on west", exterior-wall prompts |
| **SL-4** | **Fire-compartment boundaries** | ❌ **GAP** | compartment = maximal room set bounded by fire-rated walls/doors (wall/door `fireRating` + SL-2 adjacency) | "fire-rated doors on compartment boundaries", compartment audit |
| **SL-5** | **Furniture placement rules** | ❌ **GAP** (detection feeds SL-1; *placement* is new) | per room-type: fixture set + clearances + anchor wall/orientation | FURNITURE prompts (beds in bedrooms, WCs in bathrooms, desks in offices) |

### §3.1 — AS-IS audit (2026-05-25) — what already exists

`packages/spatial-index` (promoted "Sprint AC" from `src/engine/subsystems/spatial/`) is the canonical room-semantic layer, consumed by initTools, AI world-model adapters, and property panels. Exports (`spatial-index/src/index.ts`):

- **`RoomTypeInferenceEngine` / `roomTypeInferenceEngine`** (SL-1). Rule-based (`INFERENCE_RULES`): bathroom (plumbing + small area / toilet+sink), bedroom (bed / wardrobe), kitchen (appliances / kitchen sink), dining-room (table + ≥2 chairs), living-room (sofa), meeting-room (conference table / 4+ chairs), private-office (desk). Reads room from the `room` store, contained elements via `window.roomQueryService.getElementsInRoom`, furniture/plumbing display names from their stores, `area`/`perimeter` from `room.computed`. Returns the best rule ≥ 0.55 confidence. **Inference is contents-driven** (it detects type *from* furniture/plumbing) — so the "place furniture **by** room tag" prompts (#46–50) need the room **tagged first** (`SET_ROOM_OCCUPANCY`, which exists), not inferred.
- **`RoomGraphService` / `roomGraphService`** (SL-2). `RoomNode`/`RoomEdge`/`RoomGraph`; adjacency is **door-connectivity** based; per-level graph cache invalidated on door changes.
- **`RoomQueryService`** — `getElementsInRoom`, element/boundary refs, path results.
- **`RoomValidationService`** — room validation issues (severity-tagged).

These are wired on `window` (`window.roomQueryService`, `window.roomGraphService`, `window.roomTypeInferenceEngine`, `window.roomValidationService`) — the access pattern proposal builders + commands use today.

**Already-present commands/stores that close the loop:** `SET_ROOM_OCCUPANCY` (tag a room's type), `TAG_ELEMENT` + `semantic-index` StoreKey, `SET_ROOM_REQUIREMENT`/`requirementStore` (Autonomous Auditor), `room-topology` (detection), `RoomBoundaryBuilder` (compliance overlay). So **room tagging + adjacency are query-ready today**; the gaps are façade/fire/furniture-placement and the *consuming* per-room/façade/compartment batch commands.

AI proposal builders (`ai-host`, L2) call these queries (via the window services), resolve **concrete** target ids, and dispatch C16/C17 batch commands with explicit ids — the command itself stays "dumb" (C17 §10 scope-resolution-in-the-proposal-layer).

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
  → proposal builder QUERIES packages/spatial-index room services (SL-1/SL-2,
       via window.roomTypeInferenceEngine / window.roomGraphService / roomQueryService)
       + the new SL-3/SL-4/SL-5 derivations                              ← read-only, span-instrumented
  → resolves CONCRETE target ids (rooms/walls/facades) and
    builds CommandProposal(s): one C16-compliant command per mutation
       (batch kinds → ONE X.batch.create / runBatch — C16 §8; C17 catalogue)
  → SPEC-07 §4 approval queue (generator/modifier) + SPEC-28 cost gate
  → commandManager.execute / runtime.commandBus.dispatch(..., source: 'ai')   ← no undo push (C16 §9)
  → C11 pipeline (identical to UI path from the bus onward)
```

New/changed surfaces:

1. **`packages/spatial-index` (EXISTING — extend, do not replace)** — SL-1 `RoomTypeInferenceEngine` + SL-2 `RoomGraphService` are already here (§3.1). SL-3 (façade orientation), SL-4 (fire compartments), SL-5 (furniture placement) are **added here** as sibling services (same layer, same window-wiring + barrel-export pattern). No new `packages/semantic-model`.
2. **`packages/ai-host` intent extension** — new `AIIntentType` entries (semantic intents) + proposal builders that call the spatial-index room services. Each builder is the only place "where to place" logic lives; "how to build" stays in the element commands.
3. **AI panel + CREATE panel** — both read the C17 catalogue (Phase-1 landed). New semantic capabilities add catalogue rows + intents.
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
| **1** ✅ | C17 batch catalogue + panel binding (CREATE + AI panel) + feasible-today subset wired | **LANDED** (commits 29a9415, edb1776). AS-IS semantics audited (§3.1). |
| **2** | **Apply SL-1** — "tag rooms by type": `roomTypeInferenceEngine.inferLevel(levelId)` → `SET_ROOM_OCCUPANCY` per room (≥ confidence threshold) as one batch command + C17 row + AI intent. **SL-1/SL-2 already exist** — this is the *apply/persist* + consuming-command step, not new inference. | "tag/name rooms" works end-to-end; rooms carry `occupancyType`; gate: a reference plan classifies correctly |
| **3** | **SL-3 façade orientation** (new service in `spatial-index`) + **adjacency-driven openings** (consume SL-2): windows on exterior/oriented façades; doors between adjacent rooms (per-room/per-facade batch commands) | façade query returns N/E/S/W for a known model; doors land only between truly adjacent rooms |
| **4** | **SL-5 furniture placement engine** (room-type + clearance + adjacency anchors) → FURNITURE/plumbing/lighting per room | #46–50, #41–44 place correctly per room; no overlaps; clearances hold |
| **5** | Structural (columns@grid via existing grid + new placement command, beams@columns via a structural graph) + **SL-4 fire compartments** + compartment-aware fire-rated doors/walls | BEAMS + structural prompts; compartment boundaries match fire-rated wall sets |

Each phase is "done" only when **runtime behaviour matches this spec** (Vision §8 rule 2), not on documentation.

---

## §8 — Verification (per phase)

- **CI**: `packages/spatial-index` unit tests for each room/façade/fire service (SL-1/SL-2 exist; SL-3/SL-4/SL-5 add tests); C16 CI gates (G-CA-L/G-CA-S) cover every command a capability emits; OTel span check (P8).
- **Runtime gates**: Phase 1 — each F-prompt creates the expected elements across the right levels (C11 §8.2 batch, no LONGTASK; C16 level-visibility gate). Phase 2 — façade query returns correct N/E/S/W for a known model; tagging classifies a reference plan. Phase 3 — doors land only between truly adjacent rooms. Phase 4 — no furniture overlaps; clearances hold. Phase 5 — compartment boundaries match fire-rated wall sets.

## §9 — Cross-references

C16 (authoring substrate — **read first**), C17 (batch catalogue + panel binding), C09 (AI L7.5), C11 (creation pipeline), SPEC-07 (AI surfaces + approval queue), SPEC-28 (cost), SPEC-46/47 (existing AI workflows to mirror), SPEC-06 (rooms/levels). Existing infra to build on: **`packages/spatial-index` room services (§3.1)**, `SET_ROOM_OCCUPANCY`, `TAG_ELEMENT`/`semantic-index`, `SET_ROOM_REQUIREMENT`/`requirementStore` (Autonomous Auditor), `room-topology`, `elementRegistry`.

---

## §10 — Appendix A · Verbatim 50-prompt catalogue (classified)

The architect's verbatim batch prompts (2026-05-24/25), each classified by **scope** (C17 §3), **SL** layer(s) needed (§3 — ✅ = already exists in `spatial-index`), **phase** (§7), and the **target** command/intent. Bracketed `[L]/[H]/[W]…` are parameters the AI infers from model data or the user supplies. `SET_ROOM_OCCUPANCY`-tagged rooms are the precondition for all room-scoped prompts.

**WALLS**
1. *Create all interior partition walls for level [L] from the room layout plan…* — scope per-room · SL-2 ✅ + room layout · **P3** · new `walls.partitions-from-rooms` cmd.
2. *Create all exterior walls for level [L] following the building perimeter… openings pre-cut…* — scope per-facade · SL-3 ❌ · **P3** (perimeter base = P1 `walls.on-all-slabs`; exterior+precut = P3).
3. *Create fire-compartment walls on level [L] — replace walls on fire boundary with fire-rated type…* — scope per-compartment · SL-4 ❌ · **P5**.
4. *Create acoustic partition walls between bedroom↔bathroom / bedroom↔corridor adjacencies…* — scope per-room-adjacency · SL-1 ✅ + SL-2 ✅ · **P3**.
5. *Create retaining walls along the site perimeter below ground…* — scope project/site · site model · **P3+** (needs site perimeter).

**DOORS**
6. *Entrance door at the primary entry of every apartment unit…* — per-room(unit) · SL-1 ✅ + unit grouping ❌ · **P4**.
7. *Bathroom doors on walls shared between a bathroom and a corridor/bedroom…* — per-room-adjacency · SL-1 ✅ + SL-2 ✅ · **P3**.
8. *Fire doors on all fire-compartment-boundary walls…* — per-compartment · SL-4 ❌ · **P5**.
9. *Sliding doors between living rooms and balconies…* — per-room-adjacency · SL-1 ✅ + SL-2 ✅ · **P3**.
10. *Double doors separating lobby from circulation core…* — per-room-adjacency · SL-1 ✅ + SL-2 ✅ · **P3**.

**WINDOWS**
11. *Windows evenly distributed on living-room exterior walls…* — per-facade · SL-1 ✅ + SL-3 ❌ · **P3**.
12. *Full-height windows on all south-facing exterior walls…* — per-facade · SL-3 ❌ · **P3** (façade orientation is the gate).
13. *Bathroom frosted windows on bathroom exterior walls…* — per-facade · SL-1 ✅ + SL-3 ❌ · **P3**.
14. *Roof lights, one per room with no window…* — per-room · SL-1 ✅ + room↔window (SL-2/RoomQuery ✅) · **P3**.
15. *Curtain-wall window units filling the CW grid on levels [L1–L5]…* — on-curtain-wall · CW grid (exists) · **P2/P3** (CW already supports grids).

**COLUMNS**
16. *Structural columns at every grid intersection…* — on-grid · grid exists; placement cmd ❌ · **P5** (or earlier as a focused grid-placement cmd).
17. *Corner columns at footprint corners…* — footprint geometry ❌ · **P5**.
18. *Façade columns at every CW mullion base…* — on-curtain-wall · CW mullions · **P5**.
19. *Transfer columns below misaligned columns…* — structural graph ❌ · **P5**.
20. *Decorative columns at 2000mm along the lobby wall…* — per-room(lobby) · SL-1 ✅ · **P4/P5**.

**BEAMS** (21–25) — all need a **structural graph** (column pairs, spans, transfers, roof framing) ❌ · **P5**.

**ROOFS & CEILINGS**
26. *Flat roof slab over footprint + falls to drainage…* — by-region/project · footprint + falls ❌ · **P3** (roof-by-region base exists).
27. *Pitched roof over footprint, 35°…* — by-region · roof pitch · **P2/P3**.
28. *Suspended ceiling grid in all office areas…* — per-room · SL-1 ✅ · **P3**.
29. *Plasterboard ceiling in apartment rooms (excl. bathrooms → moisture-resistant)…* — per-room · SL-1 ✅ · **P3**.
30. *Bulkhead ceiling along lobby perimeter…* — per-room(lobby) · SL-1 ✅ · **P4**.

**SLABS & FLOORS**
31. *Floor slab per room bounded by walls…* — per-room · SL-1 ✅ + room boundary · **P3** (whole-floor slabs = P1).
32. *Raised access floor in server/IT areas…* — per-room · SL-1 ✅ · **P4**.
33. *Screed over slabs except raised-floor areas…* — per-room · SL-1 ✅ · **P3**.
34. *Floor finish: timber in living/bedroom, tile in kitchen/bathroom…* — per-room · SL-1 ✅ · **P2** (pure room-type → finish; first SL-1-apply win).
35. *Balcony slab from living-room exterior walls on S/W façades…* — per-facade · SL-1 ✅ + SL-3 ❌ · **P3**.

**STAIRS & HANDRAILS**
36. *Straight staircase per staircore [L]→[L+1], auto risers/treads…* — per-room(staircore) · SL-1 ✅ (stair occupancy) + 2-level stair (exists) · **P3**.
37. *L-shaped staircase per staircore with mid-landing…* — per-room(staircore) · **P3**.
38. *Handrails both sides of every staircase flight…* — per-element(stair) · stair adjacency · **P3** (stair handrails exist).
39. *Balustrade on slab edges with drop > 500mm…* — geometry(edge) · edge detection ❌ · **P3**.
40. *Spiral staircase at [X,Y] [L]→[L+1]…* — explicit position · stair type · **P2** (concrete params, no semantics).

**LIGHTING**
41. *Recessed downlights grid across ceilings excl. circulation…* — per-room · SL-1 ✅ · **P2**.
42. *Pendant over every dining table…* — per-furniture · SL-5 ❌ (furniture detection) · **P4**.
43. *Bedside lights beside every bed…* — per-furniture · SL-5 ❌ · **P4**.
44. *Strip lighting under kitchen wall cabinets…* — per-furniture · SL-5 ❌ · **P4**.
45. *Emergency exit lighting above fire doors / stair entries…* — per-element · SL-4 ❌ + adjacency · **P5**.

**FURNITURE** (46–50) — all **per-room + SL-5 placement engine** ❌ (room tag via SL-1 ✅ is the precondition) · **P4**: 46 double bed in master bedroom (headboard on longest wall, clearances); 47 wardrobe opposite bed; 48 kitchen unit set in kitchen; 49 toilet/basin/shower in bathroom (adjacency rules); 50 dining table + 6 chairs in dining/open-plan.

**Roadmap implication.** Because SL-1 (room type) and SL-2 (adjacency) already exist, the **highest-leverage next build is Phase 2 = "apply SL-1"**: `inferLevel → SET_ROOM_OCCUPANCY` batch tagging, which is the precondition that unblocks the ~25 room-scoped prompts (28, 29, 31, 33, 34, 41, 46–50, …). Prompt **#34** (floor finish by room type) is the cleanest first end-to-end semantic win (room-type → finish, no façade/furniture needed).
