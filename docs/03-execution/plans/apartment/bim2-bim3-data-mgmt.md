# APARTMENT — BIM 2.0 / BIM 3.0 — Data Management & Live Parametric System

Status: **Strategy document, 2026-05-29.** This doc reframes the existing apartment work as stages of *data-model maturity*. It is **additive** to the five apartment docs and the C-contracts — it does not replace any of them. Where this doc proposes new structure, it is explicit about which existing contract / doc anchors it.

Sibling docs (read these first if you haven't):

- [APARTMENT-LAYOUT-STATUS-2026-05-29.md](APARTMENT-LAYOUT-STATUS-2026-05-29.md) — what's shipped
- [APARTMENT-DRIVING-PRINCIPLES-AND-ROOM-ELEMENT-MATRIX-2026-05-29.md](APARTMENT-DRIVING-PRINCIPLES-AND-ROOM-ELEMENT-MATRIX-2026-05-29.md) — per-room intent + room × element matrix
- [APARTMENT-COGNITION-STACK-AND-IMPLEMENTATION-PLAN-2026-05-29.md](APARTMENT-COGNITION-STACK-AND-IMPLEMENTATION-PLAN-2026-05-29.md) — 7-layer cognition stack (L0 Environmental → L7 Typology)
- [APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK-2026-05-29.md](APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK-2026-05-29.md) — G1-G10 dimensional + T1-T8 topology
- [APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN-2026-05-29.md](APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN-2026-05-29.md) — master ordered tier table

Governing C-contracts (binding):

- [C03 Schemas, Commands & State](../00_Contracts/C03-SCHEMAS-COMMANDS-AND-STATE.md) — **P6: commands are the only mutation path**
- [C09 AI & Visibility Intent](../00_Contracts/C09-AI-AND-VISIBILITY-INTENT.md) — §3.4 apartment workflow shape
- [C11 Element Creation Pipeline](../00_Contracts/C11-ELEMENT-CREATION-PIPELINE.md) — generation chain
- [C15 Hosted Element / Host-Wall Contract](../00_Contracts/C15-HOSTED-ELEMENT-CONTRACT.md) — **offset-parametric model already exists**
- [C16 Command Authoring](../00_Contracts/C16-COMMAND-AUTHORING.md) — how to author the new commands this doc requires

---

## §0 — The Problem This Doc Is Answering

The apartment generator today is one-shot: brief → modal → execute → BIM. After execute, the user re-enters traditional BIM editing — move walls, resize rooms, drag doors, drop in furniture. The intent that drove generation (privacy gradient, daylight, wet-cluster, archetypes) is **lost** the moment we hand control back to direct geometry editing.

This is the BIM 1.0 floor. We are not there. We are mid-transition to BIM 2.0 (semantic), and the cognition stack + dimensional framework set up the bones of BIM 3.0 (live constraint-solving). The missing product layer is the **Data Management Panel** — the primary surface where the user edits the *intent* and the engine adapts the *geometry*.

This doc names that transition explicitly, so we can sequence it.

---

## §1 — Three Stages of Data-Model Maturity

These are **stages of how the building is REPRESENTED**, not stages of when the solver runs. They are orthogonal to the existing Phase 1 → Phase 2 → Phase 3 framing in the cognition-stack doc (which describes *solver capability*: constraint-satisfaction → spatial-intelligence → architectural-authorship). Both vocabularies are true and complementary — see §2 for the mapping.

### BIM 1.0 — Geometry-Driven

> Geometry is the source of truth. Semantic data is a label hanging off geometry.

```
Move wall   → wall changes; room area derived from new wall positions
Resize room → drag the wall; room.area is read out of geometry
Move door   → drag the door entity; nothing else updates
```

Today the BIM editor outside the apartment workflow is BIM 1.0. The user moves geometry; semantic data follows passively. **Status: where PRYZM lives outside the apartment generator.**

### BIM 2.0 — Semantic / Data-Driven

> Objects own data. Editing the data updates the geometry.

```
bedroom.area = 16 m²   → engine resizes the bedroom rectangle
bathroom.area = 6 m²   → engine resizes the bathroom rectangle
```

Generation is the **initial state**, not the final state. Every room, wall, opening, furniture item, and apartment-level parameter is a NAMED, EDITABLE FIELD on a semantic object. Edits dispatch through the command bus (P6); handlers re-derive geometry from the new data.

PRYZM already does this partially inside the apartment generator: the §11 modal-dynamic UI lets the user override per-room areas before execute, and re-runs the engine on every edit. The next step is making this true *after* execute too.

**Status: partial — modal-dynamic exists pre-execute; post-execute editing is still BIM 1.0.**

### BIM 3.0 — Constraint-Driven / Live Parametric

> Every parameter participates in a continuous constraint-solving system. Editing one propagates through the graph.

```
bedroom.area = 22 m² (was 18)
  ↓ impact graph
  • bedroom expands
  • adjacent corridor narrows (within minWidth)
  • adjacent bathroom contracts (within minArea)
  • exterior shell stays put (boundary constraint)
  • daylight depth re-evaluates
  • furniture re-fits inside the new bedroom rect
  • IFC quantities update
  • Schedule rows update
```

This is **not** a re-run of the whole D-TGL pipeline. The solver identifies which parameters are *downstream* of the change, re-solves a local region under all relevant constraints, and propagates.

The G1–G10 dimensional taxonomy ([APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK §9](APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK-2026-05-29.md)) + the T1–T8 topology validators are exactly the constraint vocabulary BIM 3.0 needs. The cognition stack's seven layers are the *fields* the solver operates over. **This doc unifies them as the substrate for live editing.**

**Status: planned. Foundations shipped (D-TGL engine, dimensional validators, topology validators, cognition Layer 1/2 fields). Solver kernel + propagation engine + data-management panel = scope of this doc.**

---

## §2 — Mapping to the Existing Phase Model

The cognition-stack doc uses Phase 1 / 2 / 3 to describe **solver capability**. This doc uses BIM 1 / 2 / 3 to describe **data-model maturity**. They are different axes; both true.

| | **Phase 1** (constraint-sat) | **Phase 2** (spatial-intel) | **Phase 3** (authorship) |
|---|---|---|---|
| **BIM 1.0** (geometry-truth) | Today's wall/door/slab editor | — | — |
| **BIM 2.0** (data-truth) | **Modal-dynamic + per-room overrides (shipped)** | Cognition fields edit pre-execute | Style/typology priors edit |
| **BIM 3.0** (constraint-live) | Post-execute parameter editing | Live cognition-field editing | Live archetype editing |

The diagonal — Phase 1 + BIM 1.0 — is the floor. The cell we live in today is *Phase 1 + BIM 2.0 (pre-execute)*. The cell we want to reach next is *Phase 1 + BIM 2.0 (post-execute)*. The cognition stack's Phase 2 + Phase 3 work and this doc's BIM 3.0 work can run in parallel once BIM 2.0 post-execute exists.

---

## §3 — The L0 Building Graph (Data Substrate)

The cognition-stack 7-layer stack ([§3 of that doc](APARTMENT-COGNITION-STACK-AND-IMPLEMENTATION-PLAN-2026-05-29.md)) describes Layer 0 (Environmental Intelligence) → Layer 7 (Typology Priors). **This doc proposes a renumbering** that makes the data substrate explicit:

```
L0  Data Graph           ← NEW (this doc): the building graph + parameter store
L1  Functional Topology  (was L0)
L2  Spatial Hierarchy
L3  Circulation Intelligence
L4  Environmental Intelligence
L5  Furniture Intelligence
L6  Architectural Composition
L7  Typology Priors
```

**Action for the cognition-stack doc**: add the L0 Data Graph layer at the foot of §3. Every higher layer reads from L0 and emits constraints to L0. Geometry is *projected from* L0, not stored in L0 separately.

### L0 Node Vocabulary

Each node owns parameters + constraints. Constraints reference G1–G10 / T1–T8.

```
Apartment
  area: 85 m² (target), [60, 120] (envelope per §3.1)
  bedrooms: 2
  bathrooms: 1
  typology: "open-plan-mid-rise"

Room :: Bedroom
  area: 16 m², [12, 30]
  width: 3.5 m, [2.75, ∞]
  depth: 4.6 m
  daylightRequired: true
  privacyTier: 2

Wall  (already a first-class BIM element)
  ↔ adjacent Room nodes (via BOUNDS edges in the semantic graph)

Opening :: Door     (hosted-parametric per C15)
  hostWallRef
  offset: 1.2 m
  width: 0.9 m
  → live link: moving the wall moves the door

Furniture :: Bed
  parentRoom
  facing: 'opposite_door' (per programRules.ts FurnitureSpec)

Constraint :: PrivacyGradient
  appliesTo: [Master, Bedroom]
  minDepth: 3 (hops from entry)
```

### Where L0 lives in the layer model

L0 is a **L0 (PRYZM 3 architecture) schemas package** concern + a **L3 (PRYZM 3 architecture) stores** concern. The data graph is the **union** of:

- `packages/schemas/` — Zod schemas for every parameter (pure, P5)
- `packages/stores/` — runtime state (apartmentStore, roomStore, etc.)
- `packages/ai-host/src/workflows/apartmentLayout/` — derivation logic (already shipped)

The Cognition-Stack L0 is a *conceptual* layer pointing at this same substrate. The two L0s are aligned by definition.

---

## §4 — Edit Flow Through Commands (P6 — Binding)

**Critical**: every parameter edit in BIM 2.0 / BIM 3.0 dispatches through the command bus per [C03 §2.1-§2.2](../00_Contracts/C03-SCHEMAS-COMMANDS-AND-STATE.md). The UI never mutates the store directly. This is not an implementation detail — it is binding contract.

### Required new commands (C16-compliant)

| Command | Payload | Handler |
|---|---|---|
| `apartment.updateParameter` | `{ field, value }` | Validates against `ApartmentParameterSchema`; mutates `apartmentStore`; triggers re-solve |
| `room.updateParameter` | `{ roomId, field, value }` | Validates per-room (per `roomDimensions.ts` tables); mutates `roomStore`; triggers local re-solve |
| `room.updateAdjacency` | `{ roomId, neighborId, kind: 'mandatory' \| 'forbidden' \| 'preferred' }` | Mutates the adjacency rule for THIS apartment instance; triggers re-validate |
| `room.updateFurnitureProgram` | `{ roomId, kind, required: boolean }` | Mutates furniture program; triggers re-furnish for that room only |
| `constraint.updateBound` | `{ class: 'G1'\|...\|'T8', metric, value }` | Mutates per-apartment constraint override (apartment-level, not global); triggers re-validate |
| `apartment.applyArchetypeSwap` | `{ roomId, archetype }` | Swaps the activity program for a single room; triggers re-furnish |

All routed through `commandBus.dispatch` ([C11 §2](../00_Contracts/C11-ELEMENT-CREATION-PIPELINE.md)). Handler must be authored per [C16](../00_Contracts/C16-COMMAND-AUTHORING.md). Each emits the standard `pryzm-*-updated` event so any view (3D, 2D plan, the panel itself, Schedule) re-renders.

### The propagation engine

This is the BIM 3.0 piece. When a `*.updateParameter` command lands, the handler:

1. Validates the new value against its schema (P5).
2. Mutates the owning store.
3. Calls `apartmentSolver.recomputeImpact(field, value)` — a NEW pure function in `packages/ai-host/src/workflows/apartmentLayout/solver/` that:
   - Reads the dependency graph (which rooms / walls / fixtures are downstream of this parameter)
   - Re-solves the local region under all G/T constraints
   - Returns a *plan of changes* (room rect updates, wall moves, door offset updates, furniture re-placements)
4. Dispatches a single batched `apartment.applyLayout` command per [C09 §3.4 Phase B pattern](../00_Contracts/C09-AI-AND-VISIBILITY-INTENT.md) — same shape as today's generation, but scoped to the impacted region.

Result: **one undo step per user edit**, even when 12 elements move.

---

## §5 — The Data Management Panel (Primary UI Surface)

This is **not** a property inspector. It is the primary editing surface of BIM 2.0 / BIM 3.0. It lives at L5 (apps/editor or a sibling app). It reads from L3 stores only; it dispatches commands for every mutation (P6). It subscribes to `pryzm-*-updated` events so it stays in sync with edits from any source — manual, AI, remote collaborator, undo.

### Panel A — Apartment Data

Global parameters editable post-execute:

```
Target Area: 85 m²    [60 ─────●─── 120]      G1 envelope
Bedrooms:    2        [1 ──●── 5]             — auto-scales program
Bathrooms:  1
Typology:    open-plan-mid-rise   ▼

Priorities                        weights
  Privacy        [████████░░] 0.8
  Daylight       [██████████] 1.0
  WFH            [████░░░░░░] 0.4
  Family         [██████░░░░] 0.6
  Storage        [█████░░░░░] 0.5
```

### Panel B — Room Data

Every room editable inline:

```
Bedroom 1
  Name:           Bedroom 1
  Type:           bedroom ▼
  Area:           16 m²        [12 ─●─ 30]       G1
  Width:          3.5 m        [2.75 ─●─]        G2
  Depth:          4.6 m        [— ─●─ 8]         G3
  Daylight:       required ✓
  Window:         required ✓ (kept under G8)
```

Live-validates against `roomDimensions.ts` tables + the apartment envelope. Out-of-range = visible red badge on the field, no silent clamp.

### Panel C — Adjacency Data

Live graph editor (built on the L3-γ semantic edges already shipped):

```
Master Bedroom
  ✓ MUST touch  En-suite          (mandatory, A1)
  ✓ MUST NOT touch  Living        (forbidden, A3)
  ○ PREFER adjacent  Corridor     (preferred, A2)

Kitchen
  ✓ MUST touch  Dining            (mandatory, A1)
  ○ PREFER adjacent  Living       (preferred, A2)
```

Edits dispatch `room.updateAdjacency` → re-validate → if a HARD adjacency now fails, show the proposal as "needs re-solve" before applying.

### Panel D — Constraint Data

All G/T rules visible and per-apartment-overridable:

```
G1 Area minimums
  Bathroom         min 3.5 m²  target 5  max 10     [▲ override]
  Corridor          min 1.0 m   target 1.2 max 1.4   [▲ override]

T2 Mandatory adjacencies
  master ↔ ensuite (when masterEnSuite)            [editable]
  hall ↔ corridor                                  [editable]

T4 Privacy gradient
  Master at depth ≥ 3                              [editable]
```

Overrides are per-apartment, not global. They live in `apartmentStore.constraintOverrides`. Global defaults stay in `programRules.ts` (the single source of truth).

### Panel E — Furniture Program

Per-room required/optional checklist driven by the `FurnitureSpec[]` per room type in `programRules.ts`:

```
Living Room

REQUIRED                            OPTIONAL
  ✓ Sofa                              ✓ TV Wall
  ✓ Coffee Table                      ✓ Bookshelf
                                      ☐ Rug
                                      ☐ Lounge chair
```

Edit dispatches `room.updateFurnitureProgram` → re-furnish that room only.

### Panel F — Activity Systems

The activity systems from [APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN §4-6](APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN-2026-05-29.md) become toggles:

```
S1 Media Wall          Enabled in Living ✓
S2 WFH Workstation     Enabled in Study ✓  Disabled in Bedroom 2
S3 Laundry Workflow    Disabled
S4 Vanity System       Enabled in Master Ensuite
S5 Dressing Area       Disabled
S6 Storage Wall        Enabled in Hall
S7 Reading Nook        Disabled
```

Toggle dispatches `apartment.applyArchetypeSwap` → engine re-furnishes the affected room.

---

## §6 — Sequencing (Wedged Into the Existing Master Plan)

This work is a NEW workstream — call it Workstream **D** ("Data + Live Edit") — that runs alongside the existing F-Sprint (Furniture) and L-Sprint (Cognition) sprints in the [APARTMENT-FURNITURE-AND-ACTIVITY master plan](APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN-2026-05-29.md).

Proposed slice ladder (each slice contract-complete per §0.1 of the master plan):

| ID | Deliverable | Est | Anchors |
|---|---|---|---|
| **D-α-0** | `ApartmentParameterSchema` + `RoomParameterSchema` Zod definitions in `packages/schemas/` (P5) | 0.5 wk | C03 §2.1 — **✅ shipped 2026-05-30** in `packages/schemas/src/apartment/ApartmentParameters.ts` (subpath export `@pryzm/schemas/apartment`). Carries `ApartmentTypology` enum (5 values: open-plan-mid-rise / closed-plan-mid-rise / compact-studio / duplex / penthouse); `RoomType` enum mirrored from ai-host; `ParameterEnvelope { value, min, max }` with refine() checking value ∈ [min, max] (max can be Infinity); `ApartmentParameters` (id + shellAreaM2 envelope + bedrooms/bathrooms + masterEnSuite + openPlanKitchenDining + livingRoom + entranceHall + typology); `RoomParameters` (id + apartmentId + type + name + area/width/depth envelopes + daylightRequired + privacyTier 1-4 + optional acousticIsolation). +27 pin tests across enum coverage, envelope bounds (under/over/Infinity/negative/NaN), required-field rejection, type-guard parity, JSON round-trip. Schemas total now **164/164** (was 137). |
| **D-α-1** | `apartmentStore` + `roomStore` extensions to hold editable parameters post-execute | 0.5 wk | C03 §2.2 — **✅ shipped 2026-05-30** in `packages/stores/src/{ApartmentParametersStore,RoomParametersStore}.ts`. New SEPARATE stores (not extensions to the existing geometry-projected RoomStore) so the L0 user-intent substrate stays distinct from the L3 derived geometry. Each extends `Store<T>` (storeKey `apartmentParameters` / `roomParameters`); schema-validates every write via `@pryzm/schemas/apartment`; subscriber API mirrors LayoutOptionsStore (`subscribe(() => void)` + Object.freeze on stored records). ApartmentParametersStore: `setApartment`, `getApartment`, `list`, `remove`, `clear`. RoomParametersStore: `setRoom`, `setMany` (bulk bootstrap from D-TGL build), `getRoom`, `forApartment` (foreign-key filter), `list`, `remove`, `removeForApartment` (cascade-delete), `clear`. Singletons exported. +22 pin tests (187/187 stores total). |
| **D-α-2** | `apartment.updateParameter` + `room.updateParameter` commands + handlers | 1 wk | C16 — **🟨 partial 2026-05-30**: command-bus types + store patch-merge methods shipped. Plugin-sdk handler classes (with `canExecute`/`execute`/`undo` for the command bus runtime) still queued. Today: `apartment.updateParameter { apartmentId, patch }` + `room.updateParameter { roomId, patch }` declared in `@pryzm/command-bus` (new `ApartmentParameterMutationCommands` union, folded into the registry); `ApartmentParametersStore.updateApartment(id, patch)` + `RoomParametersStore.updateRoom(id, patch)` patch-merge methods strip the id field defensively, re-validate via Zod, return `{ ok: true, prior }` for undo or `{ ok: false, reason }` (`not-found` / `invalid`+detail). +17 pin tests across both stores (notify-on-accept, not-notify-on-reject, undo via prior, id-strip, multi-field patch). |
| **D-α-3** | `apartmentSolver.recomputeImpact` — local-region resolver | 2 wk | new file in workflows/apartmentLayout/solver/ |
| **D-α-4** | Panel A (Apartment Data) — primary UI surface, read-only first | 1 wk | L5 surface |
| **D-α-5** | Panel A — live-edit + dispatch + impact preview | 1 wk | depends on D-α-2/3 |
| **D-β-1** | Panel B (Room Data) — same pattern, per-room scope | 1 wk | |
| **D-β-2** | Panel C (Adjacency Data) — depends on L3-γ-3 (wallsAndDoors reads EdgeType) | 1.5 wk | |
| **D-β-3** | Panel D (Constraint Data) — per-apartment overrides on G/T thresholds | 1.5 wk | |
| **D-β-4** | Panel E (Furniture Program) — re-furnish single room | 1 wk | depends on F-Sprint base furniture |
| **D-β-5** | Panel F (Activity Systems) — archetype swap | 1 wk | depends on §F3 archetypes shipped |
| **D-γ-1** | Propagation engine — full dependency graph + impact graph | 2 wk | the BIM 3.0 inflection |
| **D-γ-2** | Multi-edit batching + single-undo per logical user action | 0.5 wk | depends on D-γ-1 |
| **D-γ-3** | External-source edits (collaborator / AI / remote) flow through same path + reconcile | 1 wk | C03 §4 (undo), C07 (sync) |

**Workstream D total: ~17 dev-weeks (≈ 4 months single-contributor).**

**Sequencing note**: D-α-0 → D-α-4 unlocks BIM 2.0 post-execute. D-γ-1 → D-γ-3 unlocks BIM 3.0. The B and E panels (D-β-1, D-β-4) are highest user-visible value early on; they can ship before the propagation engine if the impact graph for those specific edits is hand-coded (room area edit = re-derive room rect within fixed neighbours).

---

## §7 — What This Doc Is **Not** Saying

- **Not replacing P6.** Every edit goes through the command bus. The Data Management Panel is a UI surface, not a back door into the stores.
- **Not redefining C15.** Doors/windows are already offset-parametric within walls (C15 §2–§3). BIM 3.0 extends the *room dimension* to be a parameter of the wall baseline — the parametric subStrate that C15 establishes carries naturally up to room scale.
- **Not redefining the cognition stack.** The 7 cognition layers stand. This doc adds L0 Data Graph beneath them and clarifies that every layer's output is constraints **on L0**, not on geometry directly.
- **Not throwing away D-TGL.** D-TGL is the *generation* engine. The propagation engine (D-α-3) is a sibling that handles *post-generation* edits without re-running the whole pipeline. They share the rules database (`programRules.ts`), validators, and field functions.
- **Not a one-shot regenerate.** The whole point of BIM 3.0 is local re-solve, not global re-run. A bathroom area edit should not destroy the user's hand-placed sofa in the living room.

---

## §8 — Open Questions for the Next Round

1. **Where does the propagation engine live in the layer model?** New `packages/apartment-solver/` (L2)? Or inside `@pryzm/ai-host` workflows? Solver is *deterministic* + pure, so it belongs alongside D-TGL — likely the same package.
2. **How does live edit interact with multi-user CRDT (P8)?** When User A edits `bedroom.area` while User B is moving the wall, who wins? The reconcile rule needs to be authored before D-γ-3.
3. **Persistence**: parameter overrides per-apartment must survive save/reload. They join the existing apartment-layout snapshot stored in the project (per C03 §3 state shape).
4. **Schedule + quantities + cost views as "free" consequences**: once L0 is the source of truth, IFC Pset exports, Schedules, and cost roll-ups all become live views of the same building graph. Worth a sibling doc.

---

*End — APARTMENT-BIM2-BIM3-DATA-MANAGEMENT-AND-LIVE-PARAMETRIC-SYSTEM, 2026-05-29.*
