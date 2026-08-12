# BIM 3.0 · PHASE 0D — CROSS-CUTTING INVENTORY

**Constraints · Provenance · Undo/Gesture · Concurrency · Persistence-of-relationships**

> This is an OBSERVATION record, not a design. It measures the five axes that must hold for
> **every** relationship rather than per element kind. Where a number is uncertain it says
> UNCERTAIN and why. No design is proposed anywhere in this file; §CROSS-CUTTING GAPS names
> defects, it does not prescribe fixes.

---

## §0 — PROVENANCE OF THIS DOCUMENT

| | |
|---|---|
| **Measured** | 2026-08-12 |
| **HEAD** | `d0a8674e61911917909cfdcd7ba30848afcaff35` — *"docs(bim30): PHASE 0 inventories — the architecture is generic, the COMPOSITION is wall-bound"* (2026-08-12 18:58:30 +0100) |
| **Re-measured after** | `34664b30` — *"test(constraints): four rule families get REAL evidence — and two defects fall out"* (18:58:07). §1 was re-run against this; §3/§5 measurements were taken at the earlier `2b636854` and are unaffected by it (no `command-registry`, `command-bus` or `persistence-client` change between the two). |
| **Branch** | `main` |
| **Mode** | READ-ONLY. Nothing in the tree was modified. Six agents were editing concurrently; where that made something unmeasurable it is stated, not estimated. |

### Exact commands, so every number here is re-runnable

```bash
# §1 CONSTRAINTS — the authority for the per-family evidence table
npx tsx tools/ga-gate/check-constraint-honesty.ts

# §2 PROVENANCE — the authority for the vocabulary census and the V-arm findings
npx tsx tools/ga-gate/check-provenance-not-invented.ts

# §2 provenance ADOPTION (this document's own measurement, not a gate's)
grep -rn "provenance/ValueOrigin\|ValueOriginSchema\|SystemWritableOrigin\|DEFAULTED_VALUE_ORIGIN\|ValueProvenanceSchema\|unknownProvenance" \
  --include=*.ts packages apps plugins tools \
  | grep -v node_modules \
  | grep -v "packages/schemas/src/provenance/" \
  | grep -v "packages/schemas/__tests__/valueOrigin.test.ts" \
  | cut -d: -f1 | sort | uniq -c | sort -rn
grep -rn "origin\s*:" packages/schemas/src/elements/
grep -rn "generationId\|generatedBy\|isGenerated\|sourceGenerator" packages/ apps/ plugins/

# §4 CONCURRENCY — in-process CRDT→store→undo (the wire is SIMULATED)
cd tools/rac-conformance/certification && npx tsx gates/check-two-client-convergence.ts

# §4 CONCURRENCY — real y-websocket transport (the DOCUMENT question)
npx tsx tools/ga-gate/check-collab-graph-integrity.ts

# §1 the two rival stair rule sets
diff packages/constraint-solver/src/StairValidationAuthority.ts \
     packages/geometry-stair/src/StairValidationAuthority.ts
```

**Gate readings taken on this HEAD:**

- `check-constraint-honesty` → **exit 1, DECLARED-LEVEL (16 findings, declared 16)**. 20 families
  enumerated, **5 evidenced**, 15 UNPROVEN. Both executed controls fired. (Re-run after `34664b30`;
  the earlier reading of 20 findings / 3 evidenced is **STALE** and is not used anywhere below.)
- `check-provenance-not-invented` → exit 1, DECLARED-LEVEL (5 findings, declared 5). 22
  vocabularies, 13 provenance-typed fields. All five V-arms proven to fire.
- `check-two-client-convergence` → exit 0, DECLARED-LEVEL (1 finding, declared 1). All floors met,
  both controls fired.

---

## §1 — CONSTRAINTS

### 1.1 The registry, as it actually is

`packages/constraint-solver/src/ConstraintEngine.ts` — a **non-blocking rule registry**. This is
the first and most important structural fact about the whole axis:

- `ConstraintEngine.ts:139-148` — `validateAll` collects results and **swallows every rule
  throw** (`catch (e) { console.warn(...) }`). A rule that crashes is indistinguishable from a rule
  that passed.
- `ConstraintEngine.ts:150-155` — `run()` builds a context, validates, `_broadcast()`s.
- `ConstraintEngine.ts:245-256` — `_scheduleRun()` is **debounced 600 ms** and **fully suppressed
  while `batchCoordinator.isBatching`**.
- The engine is a **module singleton constructed at import** (`ConstraintEngine.ts:774`), and its
  rules are registered on `requestIdleCallback` with a 2000 ms timeout
  (`ConstraintEngine.ts:113-123`). The header comment states the 17-rule build is *"~230 ms of
  synchronous work"*.

**Nothing here can refuse a command.** The header says it plainly: *"Non-blocking rule registry …
Never throws"*. The one family in the whole inventory that is genuinely an ENFORCEMENT gate —
`WallOccupancyStore.canPlace` — is **not in this engine at all**; it lives in `geometry-wall`.

### 1.2 The context is `window`, and it is `any`

`ConstraintEngine.ts:51-58` types every context slot as `any`:

```ts
export interface ConstraintContext {
    roomStore: any; doorStore: any; windowStore: any;
    wallStore: any; stairStore: any; bimManager: any;
}
```

`_getContext()` (`ConstraintEngine.ts:229-238`) reads all six off `window` — every line carrying a
`// TODO(TASK-07)` marker. The five PHASE-H physics families do not even take the context
parameter: they read `window.physicsEngine` and `window.roomStore` directly inside `check()`
(`ConstraintEngine.ts:637-638, 665-666, 692-693, 721-722, 753-754`).

Consequence for relationships: **the constraint engine has no dependency information whatsoever.**
It cannot be asked "what changed?" — it only ever re-runs everything, 600 ms after a
coarse-grained DOM event (`pryzm-sync-state-changed`, `pryzm-room-sync-state-changed`,
`pryzm-project-loaded`; `ConstraintEngine.ts:109-111`).

### 1.3 Executable evidence — cited from the gate, not re-derived

`npx tsx tools/ga-gate/check-constraint-honesty.ts`, re-run after `34664b30`. **20 families
enumerated, 5 evidenced, 16 findings at declared level 16.** The brief anticipated 1-of-17; four
families gained REAL evidence **against the real engine** in `34664b30`, so the older 3-of-20 and
1-of-17 figures are both stale.

| Family | Tier | Declared severity | Executable evidence at that strength |
|---|---|---|---|
| `ROOM_MIN_AREA` | 1 | ADVISORY / error | ✓ REAL — `ConstraintEngine.rules.test.ts:170` |
| `ROOM_NEEDS_DOOR` | 1 | ADVISORY / error | ✓ REAL — `ConstraintEngine.rules.test.ts:238` |
| `HABITABLE_NEEDS_WINDOW` | 1 | ADVISORY / error | ✓ REAL — `ConstraintEngine.rules.test.ts:300` |
| `STAIR_HEADROOM` | 1 | ADVISORY / error | ✓ REAL — `ConstraintEngine.rules.test.ts:357` |
| `DOOR_WIDTH_vs_CIRCULATION` | 1 | ADVISORY / warning | ✗ NONE |
| `ACCESSIBLE_ROUTE` | 1 | ADVISORY / warning | ✗ NONE |
| `ROOM_MAX_TRAVEL_DISTANCE` | 1 | ADVISORY / warning | ✗ NONE |
| `FIRE_COMPARTMENT_AREA` | 2 | ADVISORY / error | ✗ NONE |
| `MEANS_OF_ESCAPE_COUNT` | 2 | ADVISORY / error | ✗ NONE |
| `CORRIDOR_WIDTH` | 2 | ADVISORY / warning | ✗ NONE |
| `LIFT_ADJACENT_LOBBY` | 2 | ADVISORY / info | ✗ NONE |
| `PLUMBING_ZONE` | 2 | ADVISORY / info | ✗ NONE |
| `ACOUSTIC_RT60_HOSPITAL` | 2 | ADVISORY / warning | ✗ NONE |
| `ACOUSTIC_RT60_SCHOOL` | 2 | ADVISORY / warning | ✗ NONE |
| `ACOUSTIC_RT60_COURT` | 2 | ADVISORY / warning | ✗ NONE |
| `DAYLIGHT_HABITABLE` | 2 | ADVISORY / warning | ✗ NONE |
| `THERMAL_GLAZING_OVERHEATING` | 2 | ADVISORY / warning | ✗ NONE |
| `WallOccupancyStore.canPlace` | — | **ENFORCEMENT** | ✓ REAL — `packages/geometry-wall/__tests__/CurvedWallOpeningCarve.test.ts:344` |
| `StairValidationAuthority` | — | VALIDATION | ✗ NONE |
| `annotationConstraints` | — | VALIDATION | ✗ NONE |

**FINDING H5, carried verbatim from the gate.** `StairValidationAuthority` exists in **two copies**:
`packages/geometry-stair/src/StairValidationAuthority.ts` and
`packages/constraint-solver/src/StairValidationAuthority.ts`. Production imports the **geometry-stair**
copy (`packages/command-registry/src/stair/ValidateStairCommand.ts:10,65`). The constraint-solver
copy is nonetheless re-exported from that package's public barrel
(`packages/constraint-solver/src/index.ts:51-55`).

I diffed the two on this HEAD. **The rule bodies are identical**; the 12-line diff is imports only
(`@pryzm/core-app-model` vs `./StairTypes`, `./StairTypeStore`) plus one non-null assertion
(`STAIR_CONSTRAINTS_REGIONS[ctx.region]!` vs unasserted, line 223). So the rival copy is not
*currently* divergent — but neither copy has an executable witness, so nothing detects the day it
becomes so.

### 1.3b ⭐ Three defects the new evidence exposed — REAL, and deliberately NOT fixed

`34664b30` added evidence against the real engine, and two rule defects fell straight out. Both were
left in place so the tests pin actual behaviour rather than intended behaviour. I verified all three
directly at this HEAD.

**D1 — `ROOM_MIN_AREA`: the message refutes its own finding.** `ConstraintEngine.ts:278` compares
the **unrounded** area (`room.computed.area < min`); `:282` renders it **rounded**
(`.toFixed(1)`). A room of 7.49 m² fails the comparison and is reported as:

> `bedroom — area 7.5m² is below minimum 7.5m²`

Both numbers are equal, so the sentence asserts that 7.5 is below 7.5. Every borderline violation
within 0.05 m² of a threshold produces a self-contradicting message. ⚠ **The verdict is CORRECT;
only the rendering is wrong** — but a user or an AI reading the message cannot tell a real violation
from a rounding artefact, which makes the finding unactionable exactly where it matters most.

**D2 — `STAIR_HEADROOM`: a standard residential storey fires ERROR on the rule's own defaults.**
`ConstraintEngine.ts:369`:

```ts
const approxHeadroom = floorToFloor - (stair.riserHeight ?? 0.175) * Math.ceil((stair.riserCount ?? 12) / 2);
```

With a 3.0 m floor-to-floor and both defaults taken: `3.0 − 0.175 × ceil(12/2)` = `3.0 − 0.175 × 6`
= **1.95 m < 2.0** → **ERROR**. A conventional UK residential storey is flagged non-compliant with
no unusual input. The comment at `:367` concedes the model (*"Approx headroom under landing"*), but
the family is declared **severity `error`**, not `warning` or `info`.

**D3 — a NULL STORE READS AS COMPLIANT.** Every rule opens with an early return of the empty
array — `if (!roomStore) return []`, `if (!pe?.cache || !rs?.getAll) return []`, etc. **17 such
early returns across the file**, one per family (verified by count). An absent, unloaded or
mis-wired store therefore produces **zero violations**, which is byte-identical to a fully compliant
building.

⚠ **D3 compounds structurally with two other properties of this engine.** `validateAll` swallows
every rule throw (`:139-148`), and `_getContext` reads all six stores off `window` as `any`
(`:229-238`). So there are three independent paths to "no violations" — genuinely compliant, store
absent, rule crashed — and the output is identical in all three. This is the
[context-data-honesty] family at the rule boundary: **failure and emptiness are the same value**,
and here the shared value is the *reassuring* one.

### 1.4 ⭐ THE RELATIONSHIP-SENSITIVITY MAP — the constraint half of the dependency matrix

This is the question the universal contract needs: **which families must be re-evaluated when a
RELATED element changes, not merely when the subject element changes?** Derived by reading each
`check()` body and recording which stores it traverses and which cross-element hop it performs.

**Legend for "re-evaluation trigger":** the element whose mutation invalidates a verdict about a
*different* element.

| Family | Subject | Reads | Cross-element hop | RELATIONSHIP-SENSITIVE? | Re-evaluation trigger |
|---|---|---|---|---|---|
| `ROOM_MIN_AREA` | room | `roomStore` | `room.computed.area` — a DERIVED value produced by wall topology | ⚠ **YES, INDIRECTLY** | any **wall** move/create/delete that changes room area (the dependency is hidden inside `computed`) |
| `ROOM_NEEDS_DOOR` | room | `roomStore`, `doorStore` | `door.wallId` → `roomStore.getRoomsAdjacentToWall(wallId)` (`:301`) | ✅ **YES — two hops** | **door** create/delete/re-host, **wall** delete, room re-detection |
| `HABITABLE_NEEDS_WINDOW` | room | `roomStore`, `windowStore` | `win.wallId` → `getRoomsAdjacentToWall` (`:332`) | ✅ **YES — two hops** | **window** create/delete/re-host, **wall** delete, room re-detection |
| `STAIR_HEADROOM` | stair | `stairStore`, `bimManager` | `stair.baseLevelId` / `topLevelId` → `bimManager.getLevels()` (`:363-365`) | ✅ **YES** | **level elevation** change — a stair verdict flips with no stair edit at all |
| `DOOR_WIDTH_vs_CIRCULATION` | door | `doorStore`, `roomStore` | `door.wallId` → adjacent rooms → `room.computed.boundingBox` (`:392-397`) | ✅ **YES — three hops** | **corridor room reshape** (i.e. a **wall** move) invalidates a **door**'s verdict |
| `ACCESSIBLE_ROUTE` | room | `roomStore`, `doorStore` | door widths aggregated per room via wall adjacency (`:424-431`) | ✅ **YES — two hops** | **door** width change/delete, **wall** delete |
| `ROOM_MAX_TRAVEL_DISTANCE` | room | `roomStore` | ALL rooms on `levelId`; centroid distance to nearest stairwell-typed room (`:463-476`) | ✅ **YES — level-global** | **any room** on the level created/deleted/retyped/moved; changing ONE room's `occupancyType` to `stairwell` flips verdicts for EVERY room on the level |
| `FIRE_COMPARTMENT_AREA` | **level** | `roomStore`, `bimManager` | `roomStore.getTotalAreaForLevel(level.id)` (`:501`) | ✅ **YES — level-global aggregate** | **any room** area change on the level |
| `MEANS_OF_ESCAPE_COUNT` | **level** | `roomStore`, `bimManager` | `roomStore.getByLevel()`, sums areas, counts `stairwell` rooms (`:525-528`) | ✅ **YES — level-global aggregate** | **any room** create/delete/retype on the level |
| `CORRIDOR_WIDTH` | room | `roomStore` | `room.computed.boundingBox` only — no other element | ⚠ **INDIRECTLY** | **wall** move (via `computed`) |
| `LIFT_ADJACENT_LOBBY` | room | `roomStore` | all rooms on same `levelId`, occupancy scan (`:579-580`) | ✅ **YES — level-global** | **any room** retype/delete on the level |
| `PLUMBING_ZONE` | room | `roomStore` | same-level rooms + **bounding-box overlap at 0.3 m tolerance** (`:602-615`) | ✅ **YES — pairwise geometric** | **any wet room** move/reshape/retype on the level |
| `ACOUSTIC_RT60_HOSPITAL` | room | `window.physicsEngine.cache`, `window.roomStore` | physics cache keyed by `room.id` | ✅ **YES — but on a CACHE** | a **physics recompute**, which itself depends on wall/window/finish state. The cache has no invalidation link to the model. |
| `ACOUSTIC_RT60_SCHOOL` | room | same | same | ✅ YES — cache | same |
| `ACOUSTIC_RT60_COURT` | room | same | same | ✅ YES — cache | same |
| `DAYLIGHT_HABITABLE` | room | same | daylight factor — physically a function of **window** area | ✅ **YES — cache masks a window dependency** | **window** create/delete/resize → physics recompute → cache |
| `THERMAL_GLAZING_OVERHEATING` | room | same | thermal load — a function of **glazing** | ✅ **YES — cache masks a window dependency** | **window/glazing** change → physics recompute → cache |
| `WallOccupancyStore.canPlace` | opening on wall | wall occupancy | opening ↔ opening ↔ wall segment | ✅ **YES — and it is the ONLY one enforced at commit** | wall resize/delete, sibling opening move |
| `StairValidationAuthority` | stair | stair + type store + region | stair geometry vs region rule pack | ⚠ mostly element-local | region/type-store change |
| `annotationConstraints` | annotation | persisted slice | annotation ↔ host element | ✅ YES | host element delete/move |

### 1.4b Does the new evidence cover the RELATIONSHIP-triggered case, or only the direct case?

The coordinator asks this precisely, and it is the sharper question. For each of the five evidenced
families:

| Family | Evidence covers the relationship hop? | What is actually exercised |
|---|---|---|
| `ROOM_MIN_AREA` | ❌ **DIRECT ONLY** | `room.computed.area` is supplied as a literal on the fixture. The *actual* dependency — that area is derived from **wall** position — is never exercised; no wall moves in any case. |
| `ROOM_NEEDS_DOOR` | ⚠ **HOP EXERCISED, but STUBBED** | `getRoomsAdjacentToWall` is a **test double** (`:149`) returning a hand-authored map. Cases at `:261` (door bounds a *different* room) and `:270` (door with no `wallId`) genuinely traverse `door → wallId → rooms`, so the rule's *use* of the relation is proven. **The relation's own correctness is assumed, not measured.** |
| `HABITABLE_NEEDS_WINDOW` | ⚠ **HOP EXERCISED, but STUBBED** | Same shape; `:341` covers the window-bounds-a-different-room case. |
| `STAIR_HEADROOM` | ✅ **YES — genuinely relationship-triggered** | `:393` turns the verdict over **between 3.05 m and 3.0 m floor-to-floor**, i.e. by changing the **LEVEL**, with no stair edit at all. `:406` covers a missing referenced level. This is the one family whose evidence proves a related-element change flips the result. |
| `WallOccupancyStore.canPlace` | ✅ YES | opening-vs-opening and opening-vs-segment interaction is the substance of the rule |

**⚠ The critical gap this exposes.** §1.4 identifies `roomStore.getRoomsAdjacentToWall(wallId)` as
the single edge five families depend on. Two of those five now have evidence — **but both stub that
very function** (`ConstraintEngine.rules.test.ts:149`). The test header at `:43` is candid that it
asserts *"`getRoomsAdjacentToWall` resolves wall → rooms"* as a **fixture property**. So the new
evidence proves the rules consume the relation correctly; **nothing yet proves the relation is
itself correct**, and §5.3 shows that on the load path it is not.

Three of the five evidenced families also assert the D3 shape deliberately — `:287` and `:348` are
named *"is DISABLED, not satisfied, when \<x\>Store is absent"*, pinning the null-store behaviour as
a known state rather than a passing one.

**Count: 16 of 20 families are relationship-sensitive in the strong sense** (a verdict about
element X changes when a *different* element Y is edited, with no edit to X at all). A further 2
(`ROOM_MIN_AREA`, `CORRIDOR_WIDTH`) are sensitive indirectly through `room.computed`. Only
`StairValidationAuthority` is substantially element-local.

**Three distinct sensitivity SHAPES fall out, and they are not interchangeable:**

1. **Two/three-hop host chains** — `door → wallId → getRoomsAdjacentToWall → room`. Five families.
   These are exactly the relationships a dependency index would carry.
2. **Level-global aggregates** — `FIRE_COMPARTMENT_AREA`, `MEANS_OF_ESCAPE_COUNT`,
   `ROOM_MAX_TRAVEL_DISTANCE`, `LIFT_ADJACENT_LOBBY`, `PLUMBING_ZONE`. Five families whose subject
   is the LEVEL or whose scan is level-wide. **No per-element dependency edge can express these** —
   the dependency is "every room on this level".
3. **Cache-mediated physics** — five families whose input is `window.physicsEngine.cache`, which
   has no recorded link back to the elements that produced it.

**The single load-bearing edge in the whole map is `roomStore.getRoomsAdjacentToWall(wallId)`**
(used at `:301`, `:332`, `:392`, `:426`). Five families depend on it. Its correctness rests on
`room.boundingWallIds` — which §5 shows is **the exact field the load path fails to read**.

---

## §2 — PROVENANCE

### 2.1 The vocabulary, as landed

`packages/schemas/src/provenance/ValueOrigin.ts` (landed 2026-08-12, commit `57f2b539` per the R8
header). L0-pure: Zod + plain TS, no I/O, no OTel span (the file states at `:41-43` that a span
would be I/O and break P5).

- **The five** (`ValueOrigin.ts:91-97`): `authored` · `observed` · `computed` · `inferred` ·
  `regenerated`. `:76-82` — MUST NOT be collapsed, aliased or extended per package; **`computed`
  and `inferred` are never merged**.
- **`VALUE_ORIGINS`** (`:112-114`) — frozen, for exhaustive iteration. `:104-110` warns it is a
  DECLARATION order, **not a strength order**; no code may treat the index as a rank.
- **`SystemWritableOrigin = Exclude<ValueOrigin, 'authored'>`** (`:130`). The `KnownLandBasis`
  idiom (C63 §3.2): `authored` is excluded **by type**, so a generation/repair/import/migration
  path taking this type *cannot* stamp human authorship on machine output — unrepresentable at the
  call site rather than caught by a gate afterwards.
- **`DEFAULTED_VALUE_ORIGIN: SystemWritableOrigin = 'inferred'`** (`:138`). C75 §2.2: a supplied
  value is `inferred`, never `authored` and never `computed`.
- **UNKNOWN-with-reason** — `:83-89`: *"There is no `unknown` member, and its absence is the
  design."* A sixth member "would immediately become the thing a `??` defaults to". Unknown origin
  is `ValueProvenanceSchema` with `origin: null` plus a `ProvenanceUnknownReason`, whose members
  the gate enumerates as: `not-recorded` · `predates-provenance` · `producer-not-instrumented` ·
  `source-did-not-state` · `lost-in-transform` · `conflicting-records`.

### 2.2 ⭐ ADOPTION — measured, and it is ZERO on element schemas

**Element schemas carrying a provenance field: 0 of 29.**

- `ls packages/schemas/src/elements/*.ts | wc -l` → **29**.
- `rg -l "ValueOrigin|ValueProvenance|originProvenance" packages/schemas/src/elements/` → **no
  matches**.
- Every `origin:` in `packages/schemas/src/elements/*` is a **geometric `Vec3`** — confirmed, all 9
  occurrences: `Column.ts:15`, `View.ts:31`, `Plumbing.ts:18`, `Lighting.ts:57`, `Furniture.ts:52`,
  `VerticalCirculation.ts:46`, `Structural.ts:25`, `Stair.ts:16` (all `Vec3`), `Sheet.ts:13`
  (`Vec2`). **The brief's expectation is CONFIRMED.**
- `generationId` / `generatedBy` / `isGenerated` / `sourceGenerator` — **zero first-party
  element-carrying hits.** The only matches are (a) `CityCompletionScorecard.ts:72,83` and its test,
  where `generatedBy` is a *scorecard stamp string*, not element provenance; (b) `apps/bench`
  baseline JSON metadata; (c) prose inside `ElementProvenanceIndex.ts` describing this very
  absence. **CONFIRMED.**

**Total first-party consumers of the C75 vocabulary: 4 files** (excluding the definition directory,
its own unit test, and the gate that polices it):

| File | Refs | What it actually does |
|---|---|---|
| `apps/editor/src/engine/provenance/ElementProvenanceIndex.ts` | 5 | The R8 READ side — an **additive side index**, explicitly *not* a field on element schemas |
| `packages/schemas/src/family-registry/registered-family.ts` | 5 | family-registry origin (`core\|plugin\|user\|ai-generated` — its own vocabulary) |
| `packages/schemas/src/family-registry/from-pipeline.ts` | 3 | ditto; carries **FINDING V1** at `:268` |
| `packages/command-registry/src/rooms/ApplyPredictedRoomGeometryCommand.ts` | 2 | Cites `SystemWritableOrigin` **in comments only** (`:45-48`, `:357-360`) to justify *not* stamping — no field is written |

`ElementProvenanceIndex.ts:26-33` states the position without hedging:

> ⛔ **NO ELEMENT IN THIS REPOSITORY CARRIES PROVENANCE TODAY.** … There is no field to read. This
> index therefore reports `producer-not-instrumented` for essentially every element it is asked
> about, and that is the CORRECT answer, not a degraded one.

**A further structural fact about reachability:** `packages/schemas/src/provenance/index.ts` is
**subpath-only — it is NOT re-exported from the root barrel** (`grep -n "provenance"
packages/schemas/src/index.ts` → no matches). Consumers must import
`@pryzm/schemas/provenance` explicitly. So the vocabulary is not merely unadopted; it is not
even *visible* to anyone doing `import { … } from '@pryzm/schemas'`.

### 2.3 Is `RoomBoundary.detectionMethod` the only element-grain provenance signal? — REFUTED

The brief asks me to confirm or refute. **REFUTED — it is not unique; it is one of a family of
four sibling detection-method vocabularies, all outside L0.** From
`check-provenance-not-invented`'s census (22 vocabularies, 13 provenance-typed fields), the
**element-grain** ones are:

| Vocabulary | Location | Layer | Members |
|---|---|---|---|
| `RoomDetectionMethod` | `packages/room-topology/src/RoomTypes.ts` (+ `RoomDataSchema.ts`) | L2-ish, **not L0** | `auto-topology \| manual-boundary \| point-pick \| ai-generated \| ifc-import` |
| `CeilingDetectionMethod` | `packages/core-app-model/src/stores/CeilingTypes.ts` (+ `CeilingDataSchema.ts`) | L2 | `manual-polygon \| from-room \| from-slab \| ai-generated \| ifc-import` |
| `FloorDetectionMethod` | `packages/core-app-model/src/stores/FloorTypes.ts` | L2 | same five as ceiling |
| `FamilyOrigin` | `packages/schemas/src/family-registry/registered-family.ts` | L0 | `core \| plugin \| user \| ai-generated` |

So the honest statement is: **`detectionMethod` is the only element-grain provenance signal *for
rooms*, and there are three more of the same shape for ceilings, floors and families — but not one
of them is the C75 vocabulary, and only `FamilyOrigin` is in L0 at all.** Four rival unions, none
of which compose with `ValueOrigin`.

The remaining 18 vocabularies are **not** element-grain — they are site/zoning/context data
(`HeightProvenance`, `RasantProvenance`, `StreetWidthProvenance`, `MurciaWidthProvenance`,
`FieldProvenance`, `ProvenanceSource`, `ContextHeightProvenance`, `ValueProvenance`(Madrid),
`EnvironmentChangeOrigin`, `Origin`(ProjectBrowser)) — plus 4 the gate correctly EXCLUDES as
not-origins (`ProvenanceExportFormat`, `DerivationConstraint`, `ProvenanceCommandRejection`,
`OverlaySourceKind`).

### 2.4 The five open V-findings (declared level 5)

| Arm | Site | Defect |
|---|---|---|
| **V3** | `packages/room-topology/src/RoomDetectionEngine.ts:499` | `detectionMethod: 'auto-topology'` stamped on a path that **REPAIRED its input** (lines 439-498) and recorded the repair **only to the console**. C75 §0 Finding 4 — `computed` and `inferred` merged in live code. |
| **V1** | `packages/room-topology/src/roomSnapshotUtils.ts:156` | `(rawBoundary['detectionMethod'] as any) \|\| 'auto-topology'` — **on the LOAD path**. An absent origin is coerced to a specific observed one. |
| **V5** | `packages/room-topology/src/roomSnapshotUtils.ts:156` | The same line: `as any` defeats the union **at exactly the boundary the union existed to police**. |
| **V1** | `packages/schemas/src/family-registry/from-pipeline.ts:268` | `const origin: FamilyOrigin = opts.origin ?? 'user';` — a default that mints *human* authorship. |
| **V1** | `packages/site-parcel-data/src/ZoningRulesEngine.ts:163` | `provenance: packProvenance ?? 'estimated'`. |

⚠ **The two `roomSnapshotUtils.ts:156` findings sit on the room LOAD path** — the same function §5
shows mis-shapes `boundingWallIds`. Provenance and relationship reconstruction fail in the same
40-line region.

### 2.5 ⭐ The refusal EXISTS and WORKS — the live path simply does not call it

> ⚠ **This corrects an earlier framing.** `check-authored-state-protection` **does exist** — at
> `tools/rac-conformance/certification/gates/check-authored-state-protection.ts`, **not** under
> `tools/ga-gate/` (which is why an earlier `ls` of that directory missed it). Its arm (c) is green.
> The defect is narrower and more specific than "no protection exists".

The gate's arm (c) (`:80`, `:351`, `:375`) runs `planRegenerationClear` over a mixed set of one
authored and one generated element and prints:

```
(c) planRegenerationClear over the SAME set → refuse=true · clearable=1 · PROTECTED=1 · unknown-authority=…
```

So the reported, refusable form **works**: it refuses, it NAMES the authored element, and it still
identifies what is safely clearable. `certify.ts:354` carries the same arm into certification.

**The defect is that the live path never asks.** `planRegenerationClear` is defined at
`apps/editor/src/engine/provenance/ElementProvenanceIndex.ts:376` and has **ZERO production
callers** — `grep -rn "planRegenerationClear"` over `apps/editor/src`, `plugins` and `packages`
returns only its own definition and doc-comment. Every other hit is in `tools/`.

Meanwhile §GRAPH-CLEAR-FIRST (`apps/editor/src/ui/house-layout/HouseLayoutExecutor.ts:1756-1767`)
deletes unconditionally:

```ts
const stale = roomStore?.getByLevel?.(levelId) ?? [];
for (const r of stale) {
  try { void runtime.bus.executeCommand('room.delete', { roomId: r.id }); }
  catch { /* non-fatal — best-effort clear */ }
}
```

No provenance filter, no `mayRegenerate`, no `planRegenerationClear` — `HouseLayoutExecutor.ts`
imports **no** provenance guard at all (its only `classify*` import is `classifyPerimeter` at `:55`,
an unrelated geometry helper). Every room on the level is deleted regardless of who authored it, the
per-room failure is swallowed (`catch {}`), and the whole block is `catch (e) … non-fatal`.

**The precise statement, for C80's benefit:** the protection is **authored, tested and green — and
unreachable**. This is the [authored-but-unwired] pattern exactly: the gap is REACHABILITY, not
existence. It would not be closed by writing a refusal; the refusal is written.

The gate additionally records what remains **UNPROVEN and is not closed by any arm** (C75 §6.3):
semantic truth (a path writing `observed` while actually computing passes every arm); runtime
provenance decided by a branch; **the EXPORT boundary (§5)**; and cross-session regeneration —
*"NOTHING here proves an authored value survives an actual regeneration run."*

---

## §3 — UNDO / GESTURE

> This section carries the one place where **a source file's own header comment is FALSE about the
> code beneath it** (§3.2). That is recorded as a finding, not smoothed over.

### 3.1 Gesture identity — `packages/command-bus/src/gestureScope.ts`

The file replaces a **time-based** heuristic with a **causal** one, and says why
(`gestureScope.ts:1-27`):

> Until now that question was answered by subtracting two `Date.now()` stamps and comparing against
> 250 ms. A gesture is a fact about INTENT, not about elapsed time … `undoGestureOrdering.test.ts`
> pins the cost — an 80 ms replay of a sequence undoes the WRONG mutation, and a 2 ms change in the
> gap flips it.

API surface:

| Export | Line | Semantics |
|---|---|---|
| `newGestureId(label?)` | `:63-67` | Process-unique, opaque. **Nothing may parse it, and nothing may ORDER gestures by it** — it answers identity only. |
| `currentGestureId()` | `:70-72` | The gesture open on this synchronous call stack, or `null`. |
| `withGesture(body, label?)` | `:85-94` | **JOINS** an already-open gesture rather than nesting. Restores in `finally`. |
| `withGestureId(id, body)` | `:101-109` | Re-establishes a captured id explicitly, even when another is open. Used by `CommandBus.executeCommand` around the handler call. |
| `isRemoteOriginDispatch()` | `:189-191` | Reads the ambient global `__pryzmRemoteOriginDispatch`. |
| `withRemoteOrigin(body)` | `:200-209` | Marks a dispatch REMOTE-originated. Restores in `finally` — the comment at `:196-199` notes a stuck-ON flag would make *every* subsequent local edit un-undoable, "a defect strictly worse than the one being fixed". |
| `__resetGestureScopeForTests()` | `:212-215` | Test-only. |

**Two critical semantics, both stated in-file and both load-bearing for relationships:**

1. **ABSENCE IS NOT MEMBERSHIP** (`:25-27`): *"an entry with no id is NEVER a twin of anything (that
   is the whole bug — an unlabelled command silently joining the previous gesture), so unlabelled
   entries fall to the chronological U-10 rule."* So a multi-element relationship edit whose
   commands are **not** gesture-scoped does not fail loudly — it degrades to chronological undo,
   silently.
2. **SYNCHRONOUS BY CONTRACT** (`:44-50`): the scope covers the synchronous call stack only. It is
   deliberately **not** propagated across `await` (no `AsyncLocalStorage` in a browser; a
   module-level slot surviving an await "would leak into whatever dispatch runs next — a bug
   strictly worse than the one being fixed"). Anything crossing an async boundary must pass the id
   **explicitly** via `executeCommand`'s `opts.gestureId` or `CommandMetadata.gestureId`.

   ⚠ **This is the structural limit of the whole mechanism.** Any relationship maintenance that is
   asynchronous — a debounced room re-detection, a deferred wall rebuild, a CRDT read-back — cannot
   inherit its originating gesture ambiently. It must be threaded by hand or it is not in the
   gesture.

### 3.1b `performUndoRedo.ts` — ring-buffer-first, and the time heuristic is GONE

`apps/editor/src/engine/undo/performUndoRedo.ts`. The dispatch order is: the ring buffer's top
`PatchPair` is preferred, **unless** the legacy CommandManager entry is strictly newer (U-10) **and**
the two are not the same gesture (U-8).

- **U-10, `_cmEntryIsNewer` (`:174-184`)** — returns `true` only if a `PatchPair` timestamp exists,
  `cm.canUndo()`, `cmTime > pairTime`, **and** `_isSameGestureTwin(...)` is false (`:182`). The
  gesture test is a **veto on the chronological rule**, not a replacement for it.
- **U-8, `_isSameGestureTwin` (`:257-270`)** — the twin predicate, now a pure equality:
  ```ts
  if (cmTargets.length === 0) return false;
  const pairGestureId = pair?.gestureId ?? null;
  if (pairGestureId === null || cmGestureId === null) return false;   // absence ≠ membership
  if (pairGestureId !== cmGestureId) return false;
  const rbIds = new Set(_idsOf(pair));
  return cmTargets.every(id => rbIds.has(id));                        // containment, not intersection
  ```

**The 250 ms `_SAME_GESTURE_WINDOW_MS` heuristic is fully REMOVED.** `grep` finds no live constant —
only historical prose at `:66` and `:229` (*"It used to read `|cmTime − pairTime| ≤ 250 ms`"*). ⚠ One
time comparison **legitimately remains**: `cmTime <= pairTime` at `:181`. That is U-10's
*chronological ordering*, which is what timestamps are for; it is not gesture identity. Both
mechanisms coexist by design.

Two soundness properties the file argues for explicitly, both load-bearing here:

1. **Containment replaced intersection** (`:187-199`). The old guard asked "do the legacy entry's
   `targetIds` INTERSECT the ring patch's ids? ⇒ twin", which is unsound — *"EVERY later
   commandManager-only edit of an element that was CREATED on the ring buffer intersects it too, and
   there are ~70 such bridges in `initBusHandlers` (`stores: []` → no PatchPair)"*.
2. **Both conditions only ever NARROW the twin class** (`:249-251`), handing more cases to U-10.
   Neither can newly classify an unrelated pair as a twin. The failure direction is therefore *"at
   most one phantom no-op keypress"* (`:246-247`) rather than a destroyed element.

### 3.2 ⭐ Where gestures are minted — Shape A is REAL, Shape B **DOES NOT EXIST**

`gestureScope.ts:29-42` claims two mint shapes "measured 2026-08-12". Both were re-measured at this
HEAD. **One is true; the other describes code that is not there.**

**Shape A — HANDLER-INTERNAL. ✅ VERIFIED TRUE.** The chain holds end to end:

| Step | Site | What happens |
|---|---|---|
| 1 | `packages/command-bus/src/CommandBus.ts:363` | `opts?.gestureId ?? currentGestureId() ?? newGestureId(type)` — resolved **synchronously**, before any await |
| 2 | `CommandBus.ts:454-457` | `withGestureId(gestureId, () => remoteOrigin ? withRemoteOrigin(_runHandler) : _runHandler())` — the scope is open around `handler.execute` |
| 3 | `apps/editor/src/engine/initBusHandlers.ts:381` (`_cmExec`), `:438` (`_cmExecOrRefuse`) | reads `currentGestureId()` and merges it into `CommandMetadata` (`:383-386`, `:440-443`), only when not already set |
| 4 | `CommandManagerImpl.ts:270` | the id is stored in `history`; read back by `peekUndoGestureId()` (`:694-698`) |

So any legacy command a bridge creates inside a bus dispatch **does** inherit that dispatch's id,
with no per-handler change — exactly as claimed, and causally rather than temporally.

⚠ The "**81 bridge handlers**" figure is **stale**. `_cmExec` has ~100 references in
`initBusHandlers.ts`, and the file's own comment at `:407` says "90 call sites". **UNCERTAIN — the
exact distinct-handler count was not resolved**, because `_cmExec` also appears in comments and
inside `_cmExecOrRefuse` prose. Treat all three numbers (81 / 90 / 100) as unreconciled.

**Shape B — TOOL-LEVEL. ❌ FALSE. It has NO production implementation.**

`gestureScope.ts:42` states: *"`WallTool.createWall` is the one live site that produces a real
twin."* I verified this directly and it does not hold:

- **`withGesture` has ZERO production call sites repo-wide.** `grep -rn "withGesture("` over
  `packages apps plugins` returns exactly two hits, both in one **test**:
  `apps/editor/__tests__/undoGestureIdPlumbing.test.ts:24` (a comment) and `:129` (the only call).
- **`packages/geometry-wall/src/WallTool.ts` contains ZERO gesture references** —
  `grep -c "withGesture\|gestureId\|command-bus"` → **0**.
- The dual dispatch in `WallTool.createWall` (`WallTool.ts:1705-1809`) is unscoped on both halves:
  - `:1778` — `runtime.bus.executeCommand('wall.create', {...payload, id: wallId})` — **not
    awaited, no `opts.gestureId`**
  - `:1783` — `// No return — fall through to legacy commandManager for geometry build.`
  - `:1788-1793` — `new CreateWallCommand(wallId, payload)` then `commandManager.execute(command)`
    — **no metadata argument at all**, so `CommandMetadata` defaults to `{source:'HUMAN_DIRECT'}`
    with `gestureId: undefined`.

**What actually happens.** The bus call at `:1778` enters `CommandBus.executeCommand` with no
ambient scope open, so `currentGestureId()` returns `null` and a **fresh** id is minted at
`CommandBus.ts:363`; that id lands on the `PatchPair`. The CM call at `:1793` runs after the bus
call returned, on a stack with **no open scope**, and stamps nothing. The two halves of the
canonical 3D wall-create therefore carry **different-or-absent** gesture ids.

**Consequence — and it is the CONSERVATIVE direction, not data loss.** By
`performUndoRedo.ts:265`, `cmGestureId === null` ⇒ `return false` ⇒ not a twin ⇒ the U-10 veto at
`:182` does not fire ⇒ the pair is routed chronologically. `performUndoRedo.ts:243-247` argues this
costs "at most one phantom no-op keypress". So the *behaviour* is safe-by-default; what is broken is
the **documentation**: `gestureScope.ts:42` and `CommandManagerImpl.ts:32` both describe a live site
that does not exist.

**The concrete gesture-sharing paths that actually exist today:**

| # | Path | Mechanism | Evidence |
|---|---|---|---|
| 1 | Any `initBusHandlers` bridge whose `fn` calls `_cmExec` / `_cmExecOrRefuse` | implicit inherit | `CommandBus.ts:454` → `initBusHandlers.ts:381` / `:438` |
| 2 | `ConsequenceExecutionService` — wall move + room reshape | **explicit** id threaded across an `await` | `:258` `newGestureId('wall-move-consequence')` → `:263` passed to `executeCommand` → `:374` `withGestureId(...)` re-opens for the reshape |
| 3 | Nested `bus.executeCommand` inside an already-open scope | `?? currentGestureId()` | `CommandBus.ts:363` |
| 4 | ~~`WallTool.createWall`~~ | **DOES NOT PARTICIPATE** | `WallTool.ts:1778, 1793` |

**Only path 2 threads a gesture across an async boundary — and it is the ONLY one in the product
that does.** It is, not coincidentally, the one path that maintains a *relationship* (a wall move
and its consequent room reshape).

**Remote-origin flow.** `withRemoteOrigin` has exactly **one** production call site —
`CommandBus.ts:455`, gated by `remoteOrigin` computed at `:401-403`
(`opts.suppressUndo === true || payload._remoteSync === true`). `isRemoteOriginDispatch()` has
**zero production callers**: `CommandManagerImpl.ts:259-262` inlines the raw global read instead
(deliberate, per the L2↛L1 note at `gestureScope.ts:167-175`). Consequence: the wire contract is the
**string literal `'__pryzmRemoteOriginDispatch'` duplicated across two packages**
(`gestureScope.ts:178` and `CommandManagerImpl.ts:261`) with no shared constant. Neither
`withRemoteOrigin` nor `isRemoteOriginDispatch` is re-exported from
`packages/command-bus/src/index.ts:97-100`.

### 3.3 The REMOTE half — a measured, quantified defect (now closed; it was HALF the story)

> ⚠ Per §4.3, this defect is now recorded CLOSED in the working-tree ledger — and it turned out to
> be **defect (a) of two stacked defects**, the second (whole-record undo, G-5) having been hidden
> behind it. The analysis below remains accurate as the description of (a).

`gestureScope.ts:111-175` documents C03 §4.6 **U-1** (`source: 'remote' | 'ai'` MUST NOT push) and
records that the rule *was right and was simply never REACHED on the CRDT read leg*:

- The socket.io path stamps it — `RemoteCommandDispatcher.ts:378` passes `{ source: 'REMOTE' }`.
- The **CRDT path does not.** `initRemoteElementSync`'s sink dispatches `element.updateParameters`
  with `_remoteSync: true`, which is honoured by the CRDT applier's echo-break **and by nothing
  else**. The bus bridge then calls `_cmExec(cmd)` with no metadata, so `CommandMetadata` defaults
  to `{ source: 'HUMAN_DIRECT' }` and **a peer's edit is pushed onto this user's undo history as if
  this user authored it.**

Measured consequence on the two-client harness (`gestureScope.ts:132-143`): client A makes ONE edit;
A's history holds **THREE** entries, all `HUMAN_DIRECT` — A's own gesture at [0], and two REMOTE
entries at [1] and [2]. A's Ctrl+Z pops [2] (a no-op), a second pops [1] — **which reverts B's
colour on A** — and only the THIRD reverts A's own edit.

The L2→L1 constraint is stated at `:167-175`: `CommandManagerImpl` is `@pryzm/command-registry`
(L2), `gestureScope` is `@pryzm/command-bus` (L1); L2 does not depend on L1, so the flag travels
through an ambient global, mirroring the existing `__pryzmBuildingGenActive` precedent
(`CommandManagerImpl.ts:157`, §GEN-LOG-GATING).

### 3.4 The history-push gate — FOUR independent exclusions

`packages/command-registry/src/CommandManagerImpl.ts:264` is the single condition that decides
whether a command becomes undoable:

```ts
if (!command.nonUndoable && !isRemoteOrigin && !isLoad) {
```

Plus a fourth, earlier gate. **Four ways a mutation can leave no undo entry:**

| # | Exclusion | Site | Scope |
|---|---|---|---|
| 1 | `command.nonUndoable === true` | `types.ts:590` (optional field), tested `:264` | **per command** — exactly 2 exist, below |
| 2 | `isRemoteOrigin` | `:259-262` — raw read of `__pryzmRemoteOriginDispatch` | per dispatch (§3.3) |
| 3 | `isLoad` | `:264` | project-load dispatches |
| 4 | `__pryzmBuildingGenActive` | `:157`, §GEN-LOG-GATING | **whole generation run** — not per-command |

**⭐ The complete `nonUndoable` census — exactly TWO commands in the repository:**

| Command | Site | Declared reason | Stores mutated |
|---|---|---|---|
| `ReDetectRoomsCommand` | `packages/command-registry/src/rooms/ReDetectRoomsCommand.ts:65` | `:59-64` — *"automatic background operation … changes, not a direct user action"* | **room** (+ the derived room graph) |
| `ImportProjectCommand` | `packages/command-registry/src/project/ImportProjectCommand.ts:215` | `:21`, `:213`, `:1109` — a whole-project replacement; *"`nonUndoable=true` makes that contract explicit at the type level"* | **all** |

Verified exhaustive by `grep -rn "nonUndoable\|isUndoable\|skipHistory\|noUndo"` over
`packages/command-registry/src` and `apps/editor/src/engine`. The only other hit is
`apps/editor/src/engine/views/MoveMarkOriginCommand.ts:83`, which declares `nonUndoable = false`
(i.e. explicitly undoable). No name-list or opt-out mechanism exists besides this one boolean.

**⚠ `ReDetectRoomsCommand` is the silent-divergence site, and it is the WORST possible one.** It is
the command that **re-derives `boundingWallIds`** — the field §1.4 shows five constraint families
hang off, and §5.3 shows three graph families hang off. It mutates room state and leaves **no undo
entry**. Undoing the wall move that *caused* the re-detection therefore restores the wall but not
the re-derived room boundaries: the model and its relationship graph diverge with no error raised.
`ApplyPredictedRoomGeometryCommand.ts:61` already flags this in prose: *"⚠ `ReDetectRoomsCommand` is
`nonUndoable` ('automatic background operation')."*

### 3.5 `affectedStores` — declared by 266 of 269 commands; it scopes the SNAPSHOT, not the undo

`affectedStores` is an optional `readonly` tuple on each command (`types.ts:590`), e.g.
`readonly affectedStores = ["beam", "level"] as const` (`CreateBeamCommand.ts:64`).

**Coverage: 266 files declare it, of 269 `*Command.ts` files in `packages/command-registry/src`**
(`grep -rln` / `find … -name "*Command.ts" | wc -l`). ⚠ **UNCERTAIN by ±3** — the two counts come
from different denominators (files containing the string vs files named `*Command.ts`), and a file
may hold more than one command class. Read it as "essentially universal, with a small unresolved
remainder", not as exactly 3 missing.

**What it does** — `CommandManagerImpl.ts:406-423`:

> When the command declares `affectedStores`, only those stores are cloned. For commands that have
> not yet declared `affectedStores` (legacy), the method falls back to all stores.

So it is a **snapshot-scoping optimisation** for the undo capture, with a safe fallback
(`:198` labels the legacy case `'ALL(legacy)'`). Distinct store names observed include `annotation`,
`beam`, `level`, `catalog`, `ceiling`, `column`, `room`, `wall`, `slab` (not exhaustively
enumerated).

**⚠ The relationship hazard is under-declaration, and nothing detects it.** `affectedStores` is
declared **per command, by hand**, and it names the stores whose state gets cloned for the undo
snapshot. A command that mutates a relationship spanning stores it does not declare — e.g. a wall
command that changes room boundaries — will have those stores excluded from the snapshot, and undo
will not restore them. There is **no gate cross-checking a declaration against what the command
actually writes**; the correctness of all 266 declarations rests entirely on author discipline. This
is the same defect shape as G-12's hand-synced serializer whitelists.

---

## §4 — CONCURRENCY

### 4.1 Two gates, two different questions, neither subsuming the other

| | `check-collab-graph-integrity` | `check-two-client-convergence` |
|---|---|---|
| **Path** | `tools/ga-gate/check-collab-graph-integrity.ts` (harness in `apps/sync-server/src/collab-gate/collabGraphIntegrity.ts`) | `tools/rac-conformance/certification/gates/check-two-client-convergence.ts` (+ `twoClientWorld.ts`) |
| **Transport** | ✅ **REAL** — two `y-websocket` clients against a local in-process sync server | ❌ **SIMULATED** — `Y.applyUpdate(Y.encodeStateAsUpdate(...))` |
| **Measures** | the **DOCUMENT** — does the hosting edge survive the merge and still RESOLVE on both docs | the **STORE and the UNDO STACKS** — does a peer's command reach this client's authoritative store |
| **Reading, this HEAD** | exit 0 | exit 0, **1 finding at declared level 1** |
| **Tolerance** | **ZERO**, and NOT on `gate-debt.json` | shrink-only ledger, `maxFindings: 1` |

The C8 gate is explicit about what it refuses to conflate (`check-collab-graph-integrity.ts:22-36`):
NO TRANSPORT → exit 2 `transport-absent`; BLIND COMPARATOR → exit 2; BROKEN RELATIONSHIP → exit 3.
And on the substance (`:14-21`):

> "Collaboration preserves relationships — two clients edit a wall and its hosted door; both
> converge with the hosting edge intact." Note what it does NOT ask. It does not ask whether the two
> documents converge; Yjs converges … It asks whether the MODEL survives. **Two peers can converge
> byte-for-byte onto a self-consistent, confidently WRONG building.**

### 4.2 What is genuinely composed vs simulated — `twoClientWorld.ts` PROVENANCE

The harness exports a `PROVENANCE` structure the gate **prints verbatim on every run** (`:63-95`),
on the principle that *"an unnamed simulation is a lie."*

**GENUINELY COMPOSED** (`:73-79`): two independent `buildWorld()` topologies — real geometry stores,
real `CommandBus`, real `CommandManager` with its own undo history; two real `YjsDocAdapter`
instances (the production class), one `Y.Doc` each; the real production WRITE leg
(`CommandBus.setCrdtApplier` → `shouldReplicate` echo-break, exactly as `engineLauncher.ts:160-168`
wires it); the real production READ leg (`ElementSyncReader` over `ELEMENTS_NAMESPACE` → sink →
peer bus, byte-identical dispatch shape to `initRemoteElementSync.ts:132-160`); the production
`SYNC_DISPOSITIONS` table.

**SIMULATED — named** (`:80-82`): **THE WIRE.** Consequence, stated: *"zero latency, zero
reordering, zero packet loss, no server linearisation. Those are NOT MEASURED here."* Also: the
read-leg sink routes id→type from a per-client map because the real sink consults the
`elementRegistry` **module singleton** both clients share in one realm.

**NOT MEASURED — the seven, verbatim** (`:80-95`):

1. **THE SHARED-ID CEILING (measured, not predicted).** `ElementRegistry.getInstance()`
   (`packages/core-app-model/src/ElementRegistry.ts:307`) is a module singleton and
   `CreateWallCommand` refuses `ID "x" already exists`. *"So two clients in ONE Node realm CANNOT
   both hold the same element id — which is the definition of two peers editing the same wall."*
   The harness therefore seeds B by replicating A's creation through the CRDT (the real late-joiner
   path). **The id-collision arm is NOT MEASURABLE in-process at all. It needs two processes.**
2. network latency, reordering, duplication, packet loss
3. server-side linearisation / the sync-server protocol (*"`apps/sync-server` is not deployed;
   ADR-0019 orders at the log layer, and no log layer runs here"*)
4. multi-PROCESS isolation — one Node realm, one `window`, one shared `elementRegistry`
5. real concurrent wall-clock timing — *"the partition here is explicit and deterministic, not a
   race"*
6. awareness/presence, soft locks (S45), and the conflict-resolution DIALOG (only the `emitConflict`
   signal is reachable)
7. **remote CREATES** — *"the sink applies property updates only … a peer never mints an element it
   has not seen"*

⚠ **Item 7 is the sharpest limit for relationships.** A relationship is often established *by a
create* (host a door in a wall; bound a room by walls). If remote creates are unmeasured, then
**relationship ESTABLISHMENT under concurrency is unmeasured** — only property convergence on
already-shared elements is measured.

### 4.3 The CRDT key-layout change of this morning, and the one still-open finding

`fb7cd4a0` (2026-08-12 17:39:44) — *"fix(sync): the CRDT stops silently eating your edits — one root
cause, three faces"*. Per `two-client-ledger.json`, the first honest reading was **4 findings**;
after §RIVAL-MINT it is **1**:

- **CLOSED 1** — `convergence/rival-record-mint-loses-properties`. The element record is no longer a
  nested `Y.Map` set as a value under a key. Properties now live **one-key-each in a flat
  composite-key map** (`ELEMENT_PROPS_NAMESPACE = 'pryzm.elements.props'`,
  `YjsDocAdapter.ts:117`; key `` `${elementId}<NUL>${property}` ``), which both peers derive
  identically without coordinating. *"There is no container to win or lose, so a first-touch is an
  ordinary per-key write and disjoint properties MERGE."*

  **The nested per-element `Y.Map` is RETAINED as a NON-AUTHORITATIVE compatibility mirror.**
  Verified at `YjsDocAdapter.ts:113-115`, `:474-477` (`_mirrorAll` after every merge), `:772-782`
  (`_mirrorElement` after each property write), `:826` (flat map accessor), `:844-849`. The
  invariant the file states: *"the mirror is rebuilt from \[the authoritative flat map]"*, and
  `:830-831` — *"Every element id the authoritative flat map carries properties for. **This — not
  the mirror's key set — is the truth** about which elements exist."*

  ⚠ **For relationship reading this distinction is load-bearing.** Any consumer that enumerates
  elements or properties from the **mirror** rather than the flat map is reading a
  non-authoritative structure that is only *eventually* reconciled (`:847` — the rebuild happens
  inside a transaction, after the merge). Which downstream readers use which was **not traced** —
  UNCERTAIN, and it is a live question for C78, because a relationship index built off the mirror
  would inherit exactly the staleness the flat map was introduced to eliminate.
- **CLOSED 2 & 3** — but see the retraction below.
- **THEN CLOSED 4 → the ledger reads `maxFindings: 0`.**

**⚠ MEASUREMENT NOTE — this axis moved WHILE THIS DOCUMENT WAS BEING WRITTEN, and I did not obtain
a clean re-run.** My own execution of `check-two-client-convergence.ts` at HEAD `d0a8674e` produced
a **0-byte output file**, and `git status` shows `two-client-ledger.json` and four
`certification/results/*.json` files **modified in the working tree by another agent**, with two new
uncommitted gate files (`check-room-reshape-fidelity.ts`, `check-room-reshape-undo.ts`). **I
therefore report the ledger's own text rather than a reading I did not obtain** — an in-flight tree
is exactly the condition under which a half-reading becomes a wrong baseline.

**What the working-tree ledger now records** (`measuredAt: 2026-08-12T17:30:00Z`,
`maxFindings: 0` — *"THE LEDGER IS NOW EMPTY AND LEAVES THE TREE ON THE NEXT SHRINK"*):

`undo/undo-did-not-revert-own` *"was TWO stacked defects, and the first was HIDING the second"* —
diagnosed from an instrumented history dump, *"not from reading"*:

- **(a) Remote commands on the local undo stack** — the §3.3 defect, fixed by the ambient
  remote-origin scope. The ledger stresses the exclusion is **not weakened**: *"A's own edit was
  never excluded — the probe found it present and correct at `history[0]` the whole time. It was
  BURIED, not dropped."*
- **(b) WHOLE-RECORD UNDO** — `UpdateWallDimensionsCommand.undo` restored the **entire** pre-execute
  wall snapshot (~12 fields via `WallStore.restoreSnapshot`), *"including a `materialColor` the
  command never authored"*. Fixing (a) alone *"turned `undo-did-not-revert-own` straight into
  `undo-reverted-peer-work`"*. Now restores only `height` + `thickness` (+ `_renderVersion`).

**⭐ An explicit RETRACTION the ledger makes about its own earlier entry** — and it is the most
important sentence in the file for anyone reasoning from gate history:

> **IMPORTANT — `undo-reverted-peer-work` was NEVER ACTUALLY FIXED by the RIVAL-MINT commit; it was
> MASKED.** The gate presses Ctrl+Z ONCE, and pre-fix that one press landed on a phantom no-op
> entry … Recorded because the earlier entry above claims it closed incidentally, **and that claim
> was true of the READING, not the CODE.**

This retracts the "CLOSED 2 and 3 INCIDENTALLY" claim I quoted from the earlier ledger revision. A
green reading masked a live defect because the probe pressed undo only once.

**⚠ Defect (b) is NOT collaboration-specific**, per the ledger: *"The same clobber fires single-user
whenever a later edit touches a field an earlier command snapshotted and the user undoes back past
it. Concurrency only made it deterministic enough to see."* **This is a relationship-integrity
defect in its own right** — a whole-record undo silently reverts fields, and therefore relationship
carriers, that the undone command never authored.

**Two things the ledger states are NOT PROVEN by that change** (verbatim, because they bound what
C78/C80 may assume):

1. **The RING BUFFER's copy of the same clobber.** *"the `wall.updateDimensions` bridge pushes a
   whole-record PatchPair (`value: structuredClone(after) / before`, `initBusHandlers.ts
   ~1090-1100`), so a RING-FIRST Ctrl+Z can still revert a field the command did not author. This
   harness certifies the LEGACY stack … the ring path is UNMEASURED here."*
2. **The OTHER whole-record undos.** *"Only `UpdateWallDimensionsCommand` was fixed, because only it
   is on the measured path. `grep -l restoreSnapshot packages/command-registry` will find siblings
   with the same shape; none is proven either way by this run."*

Regression proof cited: `packages/command-registry/__tests__/remoteOriginUndoExclusion.test.ts`
(9 cases, **two positive controls** reproducing the pre-fix paths and asserting they still fail).

### 4.4 ⭐ WHAT WE MAY CLAIM TODAY — C66 §1 / C8

The gate prints its own scope limit, and it is the authoritative answer:

> **SCOPE — C66 §1.** This run measures the CODE path from a peer's command to this client's
> authoritative store. It does **NOT** measure a deployed transport: the wire here is SIMULATED,
> **production still runs socket.io last-writer-wins**, and **NO capacity tier moves from CLAIMED to
> HELD on this evidence.** C8 remains **FAIL — BLOCKED** on the founder decision in
> `docs/03-execution/plans/L-391-COLLAB-DEPLOY-DECISION.md`.

Stated as a permission ledger:

| Claim | Permitted? | Authority |
|---|---|---|
| "Two Yjs documents converge" | ✅ but **worthless** — that is Yjs's own test suite | `check-collab-graph-integrity.ts:18-21` |
| "A hosting edge survives a real-socket concurrent merge, resolving on both documents" | ✅ **YES** — real `y-websocket`, zero tolerance, gate exit 0 | `check-collab-graph-integrity.ts` |
| "A peer's property edit reaches this client's authoritative store" | ✅ **YES, in-process only** | two-client gate, floors met |
| "Disjoint concurrent property edits merge without loss" | ✅ **YES, in-process only** | `fb7cd4a0` + `rival-record-mint.test.ts` (carries a POSITIVE CONTROL reproducing the pre-fix behaviour and asserting it STILL loses the property) |
| "Undo is per-gesture under concurrency, **on the LEGACY stack, in-process**" | ⚠ **the working-tree ledger says YES (`maxFindings: 0`)** — but I did not obtain a clean re-run (0-byte output, tree in flight). **Treat as UNVERIFIED-BY-ME**, not as green. | working-tree `two-client-ledger.json` |
| "Undo is per-gesture on the RING BUFFER path" | ❌ **NOT MEASURED** — the harness's ring buffer is *"a recording stand-in"*; the whole-record `PatchPair` clobber is untouched | ledger, NOT PROVEN §1 |
| "Other `restoreSnapshot` commands don't clobber unauthored fields" | ❌ **NOT MEASURED** — only `UpdateWallDimensionsCommand` was fixed | ledger, NOT PROVEN §2 |
| "Two peers may edit the same element id concurrently" | ❌ **NOT MEASURABLE in-process** — needs two processes | `twoClientWorld.ts:80-87` |
| "Relationships survive concurrent CREATES" | ❌ **NOT MEASURED** — remote creates are out of scope | `twoClientWorld.ts:94` |
| "Latency / reordering / loss / server linearisation are safe" | ❌ **NOT MEASURED** | `twoClientWorld.ts:88-90` |
| "A deployed transport works" | ❌ **NO** — `apps/sync-server` is not deployed; production is socket.io LWW | gate SCOPE block |
| **Any capacity tier moves CLAIMED → HELD** | ⛔ **FORBIDDEN** on this evidence | C66 §1, printed by the gate |
| **C8 is satisfied** | ⛔ **NO — FAIL, BLOCKED** on a founder decision | `L-391-COLLAB-DEPLOY-DECISION.md` |

---

## §5 — PERSISTENCE OF RELATIONSHIPS

### 5.1 `rebuildSemanticGraph.ts` — the governing rule

`packages/persistence-client/src/loader/rebuildSemanticGraph.ts` (218 lines), `:11-16`:

> It reconstructs edges FROM AUTHORITATIVE ELEMENT STATE that survives the snapshot — never by
> trusting a persisted graph slice … It never GUESSES an edge the authoritative state does not
> support.

This function is a **fallback**: the primary path is
`semanticGraphManager.deserialize(snapshot.semanticGraph)` (`ProjectLoader.ts:1153-1155`), and
`rebuildSemanticGraphFromSnapshot` runs only when that produced an empty graph
(`ProjectLoader.ts:1163`). So **no relationship family here is "rebuilt from an authoritative
persisted graph edge"** — every one is re-derived from element fields.

| # | Family | Class | Derived from | Line |
|---|---|---|---|---|
| 1 | `hosts` | REGENERATED | `wall.openings[].elementId ?? .id` | `:121` |
| 2 | `hostedBy` | REGENERATED (inverse of 1) | same array | `:122` |
| 3 | `boundedBy` | REGENERATED — **BROKEN, see §5.3** | `room.boundary?.boundingWallIds` | `:131` |
| 4 | `adjacentTo` | REGENERATED (2nd-order) | rooms sharing a wall in `wallToRooms` | `:152-153` |
| 5 | `connectedTo` | REGENERATED (2nd-order) | shared wall **carrying a door** (`doorWallIds`) | `:123`, `:155-156` |
| 6 | `partOf` | REGENERATED | `room.unitId` | `:165` |
| 7 | `sitsOn` (10 kinds) | REGENERATED | `element.levelId` over `SITS_ON_KINDS` | `:73-82`, `:174` |
| 8 | `supports` | REGENERATED | `beam.startSupportId` / `endSupportId` | `:182-185` |
| 9 | `sitsOn` (stair) | REGENERATED | `stair.baseLevelId ?? stair.levelId` | `:193-195` |
| 10 | `connectedByStair` | REGENERATED (bidirectional) | `stair.baseLevelId` + `topLevelId` | `:196-199` |
| 11 | `joinedTo` | REGENERATED **outside this file** | junction index via `WallRebuildCoordinator` | `:22-26` |
| 12 | `connectedByLift` | **NAMED-UNRECONSTRUCTABLE** | — | `:205-209` |
| 13 | `contains` | **NAMED-UNRECONSTRUCTABLE** | — | `:211-215` |

Justifying quotes:

- **`joinedTo`** (`:22-26`): *"DELIBERATELY not rebuilt here: its disposition is REGENERATED from
  the retained junction index — the wall flush (`WallRebuildCoordinator`) removes-and-re-emits the
  level's edges on every rebuild, so a snapshot-side reconstruction would only be overwritten. It is
  therefore NOT a loss and is not named below."* Writer confirmed live at
  `apps/editor/src/engine/WallRebuildCoordinator.ts:183`
  (`graph.replaceJoinedToForLevelWalls(levelWallIds, junctions)`), invoked at `:1573-1586`.
- **`connectedByLift`** (`:205-208`): *"lifts are NOT serialized into the snapshot at all …
  Reconstruction is impossible from this snapshot — named, not dropped."* Verified: no `lifts` key
  in `ProjectSnapshot` (`ProjectSerializer.ts:83-329`).
- **`contains`** (`:211-214`): *"REQUIRED (C71 §2.1) but has NO first-party writer — it is
  IFC-import-only, and wiring a native writer is a separate named Tier-2 gap (ADR-0320)."*
- **Deliberate non-emission** (`:66-70`): walls / doors / windows / curtain-walls are excluded from
  `sitsOn` because *"no creation writer emits `sitsOn` for them, so emitting it here would INVENT an
  edge the live model never has."*

### 5.2 Round-trip per relationship carrier

| Relationship | Carrier field | In Zod schema? | Written by serializer | Read by loader | Verdict |
|---|---|---|---|---|---|
| `hosts`/`hostedBy` (door/window in wall) | `wall.openings[].elementId` | — (wall openings array) | `ProjectSerializer.ts:403` | `rebuildSemanticGraph.ts:121-122` | ✅ **SURVIVES** |
| door/window → wall | **`wallId`** (not `hostWallId`) | `packages/schemas/src/elements/Door.ts:14`, `Window.ts:14` (`idRef('wall')`); store `packages/geometry-door/src/DoorTypes.ts:46` | `ProjectSerializer.ts:667-668` (full spread) | re-created from snapshot arrays | ✅ **SURVIVES** — ⚠ but the graph rebuild reads `wall.openings[]`, **not** `door.wallId`, so a door whose host wall lost its `openings` entry gets no edge |
| slab `HostReferenceEdge` | `sketch…hostId` | ❌ **no Zod schema** — plain TS interface, `packages/geometry-slab/src/SketchTypes.ts:34-46` | `ProjectSerializer.ts:432` (`deepStrip(s.sketch)`); editor twin `:552` | `ProjectLoader.ts:531` → `CreateSlabCommand.ts:153` `structuredClone` | ✅ **SURVIVES structurally** (generic deep-strip, not an explicit field) |
| room `boundedBy` | **`room.boundingWallIds`** | `packages/room-topology/src/RoomDataSchema.ts:166` — **top-level, SIBLING of `boundary`** | `roomSnapshotUtils.ts:89` (top-level) | `roomSnapshotUtils.ts:184` (top-level) | ⚠ **field survives — but the GRAPH EDGE does not.** See §5.3 |
| `adjacentTo` | derived from above | n/a | n/a | `rebuildSemanticGraph.ts:152-153` | ❌ **DEAD** — depends on an empty index |
| `connectedTo` | derived + door walls | n/a | n/a | `rebuildSemanticGraph.ts:155-156` | ❌ **DEAD** — same cause |
| `partOf` | `room.unitId` | yes | `ProjectSerializer.ts:681` (`deepStrip`) | `:165` | ✅ SURVIVES |
| `sitsOn` (10 kinds) | `element.levelId` | yes | explicit in each serializer, e.g. `:423, :442, :462` | `:171-176` | ✅ SURVIVES |
| `supports` | `beam.start/endSupportId` | yes | `ProjectSerializer.ts:467` | `:182-185` | ✅ SURVIVES |
| `connectedByStair` | `stair.base/topLevelId` | yes | `:456` (`deepStrip`) | `:196-199` | ✅ SURVIVES |
| wall `joinedTo` / junctions | **transient junction index** | ❌ not a persisted field | ❌ **NOT WRITTEN** — no junction key in `serializeWall` (`:392-416`) or `ProjectSnapshot` (`:83-329`); **no `JunctionStore` exists** | regenerated post-load, `WallRebuildCoordinator.ts:160-184` | ⚠ **NOT PERSISTED — regenerated by design.** Sound only if the flush fires on every load path (UNCERTAIN, §5.5) |
| `connectedByLift` | lift base/top level | — | ❌ lifts absent from the snapshot entirely | — | ❌ **UNRECONSTRUCTABLE (named)** |
| `contains` | — | — | ❌ no first-party writer | — | ❌ **UNRECONSTRUCTABLE (named)** |
| ceiling/floor → room | **no such field** | ❌ `sourceRoomId` **does not exist anywhere in the repo** (0 hits) | — | — | ❌ **NEVER ESTABLISHED.** `CreateCeilingCommand.ts:191` and `CreateFloorCommand.ts:231` hardcode `boundingWallIds: []` — there is nothing to persist |
| room `detectionMethod` | `boundary.detectionMethod` | `RoomDataSchema.ts:56-61` | `roomSnapshotUtils.ts:87` | `roomSnapshotUtils.ts:156` — **`(… as any) \|\| 'auto-topology'`** | ⚠ SURVIVES **lossily** — a missing/corrupt value is silently coerced (§2.4 V1+V5) |

### 5.3 ⭐ DEFECT — `boundedBy`, `adjacentTo` and `connectedTo` are silently lost on this load path

`rebuildSemanticGraph.ts:131`:

```ts
const wallIds: string[] = room.boundary?.boundingWallIds ?? [];
```

**`boundingWallIds` is not inside `boundary`.** I verified this independently, three ways, directly
at HEAD:

1. **Zod.** `RoomBoundarySchema` (`packages/room-topology/src/RoomDataSchema.ts:56-61`) has exactly
   four fields — `polygon`, `height`, `baseOffset`, `detectionMethod`. `boundingWallIds` is declared
   at `RoomDataSchema.ts:166`, a **sibling** of `boundary:` at `:165`.
2. **Serializer.** `roomSnapshotUtils.ts:83-88` emits `boundary: { polygon, height, baseOffset,
   detectionMethod }`; `:89` emits `boundingWallIds: [...room.boundingWallIds]` at **top level**.
3. **Loader.** `roomSnapshotUtils.ts:184` reads `r['boundingWallIds']` at **top level**.

**Consequence.** `room.boundary?.boundingWallIds` is *always* `undefined` → `?? []` → the loop at
`:132` never executes → `boundedBy` yields **zero edges** → `wallToRooms` stays **empty** → the
dependent `adjacentTo` (`:152`) and `connectedTo` (`:155`) families are **also zero**.

**Three relationship families die silently on every load through this path — and they are NOT
reported in `unreconstructable`**, which is precisely the honesty invariant the file's own header
(`:18-20`) exists to enforce. This is a `boundary?.` optional-chain absorbing a shape error into a
plausible empty result: exactly the [context-data-honesty] failure mode where *failure and empty are
the same value*.

**Why the test does not catch it.** `packages/persistence-client/__tests__/rebuildSemanticGraph.test.ts:29-30`
fabricates the fixture in the implementation's shape —
`{ id: 'R1', boundary: { boundingWallIds: ['W1','W2'] }, unitId: 'U1' }` — **matching the bug rather
than the real serializer output**. The genuine round-trip test
`packages/room-topology/src/__tests__/reshapedRoomPersistence.test.ts:41,97` uses `boundingWallIds`
top-level and passes — but never feeds its result into `rebuildSemanticGraphFromSnapshot`.

⚠ **Blast radius beyond persistence.** §1.4 established that
`roomStore.getRoomsAdjacentToWall(wallId)` is the load-bearing edge for **five constraint
families**, and it rests on this same `boundingWallIds` relation. This one field is the hinge for
three graph families *and* five constraint families.

### 5.4 The snapshot builder WHITELISTS — an unlisted relationship silently drops

`ProjectSerializer.serialize()` — `packages/persistence-client/src/loader/ProjectSerializer.ts:649-857`,
assembling its literal at `:741-848`. A near-identical twin lives at
`apps/editor/src/engine/persistence/ProjectSerializer.ts`.

Two levels of whitelist:

- **Field-level, per element kind** — `serializeWall` (`:392-416`), `serializeSlab` (`:421-436`),
  `serializeColumn` (`:440-451`), `serializeBeam` (`:461-475`), `serializeCurtainWall` (`:479-495`),
  `serializeRoof` (`:499-528`), `serializeFurniture` (`:532-572`), `serializeHandrail`
  (`:576-586`), `serializePlumbing` (`:590-604`) all enumerate explicit keys. **Anything not named
  is dropped.**
- **Snapshot-level** — `ProjectSnapshot` (`:83-329`) enumerates the array keys. No `lifts`, no
  `junctions`, no `joinedTo` block.

The codebase already knows this is the hazard — `ProjectSerializer.ts:408-410`:

> mirrors apps/editor ProjectSerializer.serializeWall. Kept in lock-step deliberately: these two
> allow-lists diverging is how `function` was silently dropped on reload.

Kinds serialized **wholesale** (structurally safe against field-drop): stairs (`:456`, bare
`deepStrip`), rooms (`:681`), ceilings (`:705`), floors (`:713`), openings (`:678`), doors/windows
(`:667-668`, full spread).

`annotationConstraints` is the **one persisted constraint family** — declared at
`ProjectSerializer.ts:294`, written at `:828`, read at `ProjectLoader.ts:1290`, and carried through
streaming at `SnapshotStreaming.ts:96,229,368`. It has **no executable evidence** (§1.3).

### 5.5 Existing round-trip tests — and the gap

| Test | Asserts | Gap |
|---|---|---|
| `packages/persistence-client/__tests__/rebuildSemanticGraph.test.ts` (7 cases at `:52,:70,:77,:86,:95,:103,:111`) | `sitsOn` per `levelId` carrier; no invented `sitsOn`; `connectedTo` only across door walls; `supports` + `connectedByStair`; `hosts`/`hostedBy`/`boundedBy`/`partOf`; `unreconstructable` naming; determinism | **Unit test against a hand-built literal, not serializer output.** Its room fixture uses the wrong nesting, green-lighting §5.3 |
| `packages/room-topology/src/__tests__/reshapedRoomPersistence.test.ts` (helper `:63` — *"save → load, through the real persistence boundary"*) | `boundary.polygon` (`:79`), `detectionMethod` (`:90`), `boundingWallIds` (`:97`), mutation detection (`:110-113`) | Real round-trip, but **room-local** — never feeds the result into `rebuildSemanticGraphFromSnapshot` |
| `packages/command-registry/__tests__/wallDeleteJoinedTo.test.ts`, `apps/editor/__tests__/wallJoinedToWriter.test.ts`, `packages/core-app-model/src/SemanticGraph.joinedTo.test.ts` | `joinedTo` writer / delete semantics | **No save→load leg at all** |

> ⛔ **No test anywhere asserts that a relationship survives serialize → parse → load end-to-end.**
> The `persistence-client` round-trip suites (`chunks-roundtrip`, `codecs`,
> `msgpack-aliased-codec`, `manifest`) are transport/codec-level and carry no relationship
> assertions.

**UNCERTAIN, and why:**

- Whether the `apps/editor` twin serializer's room block is byte-identical to persistence-client's.
  The slab `sketch` line was confirmed in the twin (`:552`) but the twin's full room block was not
  diffed. Both feed the same `deserializeRoom`, so §5.3 applies either way.
- **Whether every load entry point reaches `WallRebuildCoordinator`'s flush.** The writer exists
  (`:183`) and is invoked (`:1573-1586`), but the call-order guarantee was not traced. If any load
  path skips the flush, **`joinedTo` is lost with no report** — and the header's *"therefore NOT a
  loss"* claim (`:26`) is conditional on exactly that flush firing.

---

## §CROSS-CUTTING GAPS

Every place where one of the five axes would break a relationship guarantee **even if the
relationship itself were perfectly indexed**. Severity order.

---

### 🔴 G-1 — `boundedBy` / `adjacentTo` / `connectedTo` are silently zeroed on load, from a shape mismatch

**Axis:** persistence · **Evidence:** `rebuildSemanticGraph.ts:131` vs `RoomDataSchema.ts:165-166`
vs `roomSnapshotUtils.ts:89,184` (§5.3)

`room.boundary?.boundingWallIds` reads a field that lives at top level. The optional chain absorbs
the shape error into `[]`, three families produce zero edges, and **none of them is reported in
`unreconstructable`**. The only test covering it fabricates the buggy shape. Highest severity
because it is (a) live, (b) silent, (c) self-certifying green, and (d) shares its hinge field with
G-2.

### 🔴 G-2 — five constraint families and three graph families hang off ONE unverified relation

**Axis:** constraints × persistence · **Evidence:** §1.4 · `ConstraintEngine.ts:301,332,392,426`

`roomStore.getRoomsAdjacentToWall(wallId)` is the sole cross-element hop for `ROOM_NEEDS_DOOR`,
`HABITABLE_NEEDS_WINDOW`, `DOOR_WIDTH_vs_CIRCULATION` and `ACCESSIBLE_ROUTE`, and it rests on the
same `boundingWallIds` relation as G-1. **Four of those five families have NO executable evidence
whatsoever** (§1.3). A wrong or empty adjacency produces *fewer* violations — a silently
more-compliant building. Failure and empty are the same value again.

### 🔴 G-3 — no element carries provenance, so no relationship can be authority-protected

**Axis:** provenance · **Evidence:** §2.2 — 0 of 29 element schemas; 4 consumer files; 0 hits for
`generationId`/`generatedBy`/`isGenerated`/`sourceGenerator`

C75's vocabulary exists and is well-formed, but **no element has a field to hold it**, and the
subpath is not even in the root barrel. Consequence for relationships: a regeneration pass cannot
tell an AI-generated edge from a user-authored one, so `mayRegenerate` returns `unknown-authority`
for essentially everything. **A safe mode cannot protect what it cannot identify.**

### 🔴 G-3b — the regeneration refusal is authored, tested, GREEN — and has zero production callers

**Axis:** provenance · **Evidence:** §2.5 · `ElementProvenanceIndex.ts:376` ·
`check-authored-state-protection.ts:351,375` · `HouseLayoutExecutor.ts:1756-1767`

Distinct from G-3 and **more actionable**, so it is filed separately. `planRegenerationClear`
refuses correctly over an authored element (`refuse=true · clearable=1 · PROTECTED=1`) and the gate
proves it. But `grep` finds **no production caller anywhere**, and §GRAPH-CLEAR-FIRST deletes every
room on the level unfiltered, swallowing per-room failures (`catch {}`) inside an outer non-fatal
`catch`. Every relationship anchored to a deleted room goes with it. **The gap is REACHABILITY, not
existence** — this is not closed by writing a refusal, because the refusal is written.

### 🔴 G-3c — `ReDetectRoomsCommand` is non-undoable AND re-derives the hinge relation

**Axis:** undo × persistence × constraints · **Evidence:** §3.4 ·
`ReDetectRoomsCommand.ts:59-65` · `CommandManagerImpl.ts:264`

Only **two** commands in the repository declare `nonUndoable = true`, and one of them is the command
that recomputes `boundingWallIds` — the field five constraint families (G-2) and three graph
families (G-1) depend on. It mutates room state and leaves **no undo entry**, so undoing the wall
move that triggered it restores the wall but not the re-derived boundaries. Model and relationship
graph diverge, silently. This is the single highest-value intersection of three of the five axes.

### 🔴 G-5 — WHOLE-RECORD UNDO reverts fields the command never authored (single-user too)

**Axis:** undo · **Evidence:** §4.3 · working-tree `two-client-ledger.json` defect (b) ·
`initBusHandlers.ts ~1090-1100`

`UpdateWallDimensionsCommand.undo` restored the **entire** ~12-field pre-execute snapshot via
`WallStore.restoreSnapshot`, clobbering fields — and therefore relationship carriers — that the
undone command never touched. It is now scoped to `height`/`thickness`, **but the ledger states
plainly that this is NOT collaboration-specific**: *"The same clobber fires single-user whenever a
later edit touches a field an earlier command snapshotted and the user undoes back past it."*

Two identical exposures remain **explicitly unmeasured**: (1) the **ring buffer** pushes a
whole-record `PatchPair` (`structuredClone(after)/before`), so a ring-first Ctrl+Z can still revert
unauthored fields — the harness's ring buffer is only *"a recording stand-in"*; (2) **every other
`restoreSnapshot` command** — only the one on the measured path was fixed, and *"`grep -l
restoreSnapshot packages/command-registry` will find siblings with the same shape; none is proven
either way."* Raised to 🔴 because it needs no collaboration to fire and it silently rewrites fields
outside the user's intent.

### 🟠 G-5b — a green gate reading MASKED this defect, and the ledger says so

**Axis:** concurrency (methodology) · **Evidence:** working-tree `two-client-ledger.json`

The earlier ledger revision claimed `undo-reverted-peer-work` closed incidentally with the
RIVAL-MINT commit. The current revision **retracts that**: *"it was MASKED. The gate presses Ctrl+Z
ONCE, and pre-fix that one press landed on a phantom no-op entry … that claim was true of the
READING, not the CODE."* Recorded as a cross-cutting gap because it generalises: **a probe that
exercises an operation once cannot distinguish a fixed defect from a defect hidden behind a phantom
no-op.** Any relationship guarantee certified by a single-step probe inherits this weakness.

### 🟠 G-4 — undo cannot span an async boundary, and most relationship maintenance IS async

**Axis:** undo/gesture · **Evidence:** `gestureScope.ts:44-50`

SYNCHRONOUS BY CONTRACT. Ambient gesture scope covers the synchronous call stack only and is
deliberately not propagated across `await`. But relationship maintenance is characteristically
deferred — debounced room re-detection, the wall rebuild flush, the CRDT read-back. Each must thread
`gestureId` by hand or it is **not in the gesture**, and per `:25-27` **absence is not membership**:
it degrades to chronological undo silently. One user action can therefore undo in pieces, leaving
the element mutated and its derived edges not — or the reverse. Only **one** production path threads
a gesture across an await (`ConsequenceExecutionService`, §3.2) — and it is the one that maintains a
relationship.

### 🟠 G-6 — Shape B does not exist: `withGesture` has ZERO production call sites

**Axis:** undo/gesture · **Evidence:** §3.2 — `grep -rn "withGesture("` → 2 hits, both in one test ·
`WallTool.ts:1778,1793` (0 gesture refs in the file)

`gestureScope.ts:42` and `CommandManagerImpl.ts:32` both name `WallTool.createWall` as *"the one
live site that produces a real twin"*. **It is not.** `WallTool.ts` contains no gesture reference of
any kind, and both halves of its dual dispatch are unscoped, so the canonical 3D wall-create carries
different-or-absent gesture ids on its two stacks.

The runtime consequence is **conservative, not destructive** (`performUndoRedo.ts:265` → not a twin
→ chronological → *"at most one phantom no-op keypress"*). **The defect is that two source files
document a mechanism that has no production implementation** — the same class of error as L-809/L-812
in `CLAUDE.md`. Recorded here because C78 must not assume tool-level gesture scoping exists.

Only **one** production path threads a gesture across an async boundary:
`ConsequenceExecutionService` (`:258` mint → `:263` pass → `:374` `withGestureId`) — and it is,
tellingly, the only path that maintains a relationship (a wall move and its consequent room
reshape).

### 🟠 G-6b — `affectedStores` is 266 hand-written declarations with no cross-check

**Axis:** undo · **Evidence:** §3.5 · `CommandManagerImpl.ts:406-423`

`affectedStores` scopes which stores get cloned into the undo snapshot; an undeclared store is **not
captured**, and undo will not restore it. A command that mutates a relationship spanning a store it
does not declare therefore has a partially-restoring undo. **No gate cross-checks a declaration
against what the command actually writes** — 266 declarations rest on author discipline alone. Same
defect shape as G-12's hand-synced whitelists. ⚠ Coverage is 266 of 269 files, **UNCERTAIN by ±3**
(mismatched denominators, §3.5).

### 🟠 G-7 — relationship ESTABLISHMENT under concurrency is not measured at all

**Axis:** concurrency · **Evidence:** `twoClientWorld.ts:94` (remote creates), `:80-87` (shared-id
ceiling)

The in-process harness applies **property updates only**; a peer never mints an element it has not
seen. But relationships are typically established **by a create** (host a door; bound a room). And
the shared-id arm is **not measurable in one Node realm at all** — `ElementRegistry.getInstance()`
is a module singleton and `CreateWallCommand` refuses a duplicate id, which is the very definition
of two peers editing the same wall. That arm **needs two processes**.

### 🟠 G-7b — a NULL STORE READS AS COMPLIANT (D3)

**Axis:** constraints · **Evidence:** §1.3b · 17 early returns of `[]` in `ConstraintEngine.ts` ·
`:139-148` (throw swallowed) · `:229-238` (six `window` globals typed `any`)

Every rule opens `if (!roomStore) return []`. An absent, unloaded or mis-wired store yields **zero
violations** — byte-identical to a fully compliant building. Three independent paths converge on the
same reassuring output: genuinely compliant, store absent, rule crashed. Since all six stores are
read off `window` as `any`, a single wiring regression silently disarms the entire compliance
surface. **Failure and emptiness are the same value, and the shared value is the safe-looking one.**

### 🟡 G-8 — 15 of 20 constraint families are UNPROVEN, and the evidenced ones STUB the hinge relation

**Axis:** constraints · **Evidence:** `check-constraint-honesty` re-run after `34664b30` — 16
findings at declared level 16 · §1.4b

Five families now have executable evidence (`ROOM_MIN_AREA`, `ROOM_NEEDS_DOOR`,
`HABITABLE_NEEDS_WINDOW`, `STAIR_HEADROOM`, `WallOccupancyStore.canPlace`) — up from one. **Fifteen
remain UNPROVEN, and UNPROVEN is neither pass nor fail; it is *nobody looked*.** Of the 16
relationship-sensitive families (§1.4), 12 still have no witness.

⚠ **The sharper point:** the two newly-evidenced families that traverse the hinge relation both
**stub `getRoomsAdjacentToWall`** (`ConstraintEngine.rules.test.ts:149`). The evidence proves the
rules *consume* the relation correctly; **nothing proves the relation is correct** — and §5.3 shows
that on the load path it is not. Only `STAIR_HEADROOM` (`:393`, verdict flips on a LEVEL change with
no stair edit) has evidence that genuinely exercises a related-element trigger.

### 🟡 G-8b — two constraint messages are wrong or misfiring on ordinary inputs (D1, D2)

**Axis:** constraints · **Evidence:** §1.3b · `ConstraintEngine.ts:278` vs `:282` · `:369`

**D1** — `ROOM_MIN_AREA` compares unrounded and renders `.toFixed(1)`, so a 7.49 m² room reports
*"area 7.5m² is below minimum 7.5m²"*: a sentence that refutes its own finding. The verdict is
right; the message is unactionable, and an AI consuming it cannot distinguish a real violation from
a rounding artefact. **D2** — `STAIR_HEADROOM` on a standard 3.0 m residential storey with the
rule's own defaults computes `3.0 − 0.175 × 6 = 1.95 < 2.0` → **ERROR**, at declared severity
`error` rather than `warning`. Both are pinned by tests as known behaviour, not fixed.

### 🟡 G-9 — the constraint engine cannot be told what changed

**Axis:** constraints · **Evidence:** `ConstraintEngine.ts:229-238, 245-256, 109-111`

The context is six `window` globals typed `any`, reached only through a 600 ms debounce on three
coarse DOM events, and suppressed entirely while `batchCoordinator.isBatching`. There is no way to
say *"element X changed, re-evaluate its dependents"* — only re-run everything, later. **Even a
perfect dependency index has no API to drive here.** Compounding it, `validateAll` swallows every
rule throw (`:139-148`), so a crashing rule is indistinguishable from a passing one.

### 🟡 G-10 — five families depend on a physics cache with no invalidation link to the model

**Axis:** constraints · **Evidence:** `ConstraintEngine.ts:637-638, 665-666, 692-693, 721-722,
753-754`

The PHASE-H families read `window.physicsEngine.cache` keyed by `room.id`. `DAYLIGHT_HABITABLE` and
`THERMAL_GLAZING_OVERHEATING` are *physically* functions of window/glazing state, but the
window→room dependency is **invisible** — it is laundered through a cache with no recorded edge back
to the elements that produced it. A stale entry yields a confident, wrong verdict.

### 🟡 G-11 — five families are LEVEL-GLOBAL, which no per-element dependency edge can express

**Axis:** constraints · **Evidence:** §1.4 shape 2

`FIRE_COMPARTMENT_AREA`, `MEANS_OF_ESCAPE_COUNT`, `ROOM_MAX_TRAVEL_DISTANCE`, `LIFT_ADJACENT_LOBBY`
and `PLUMBING_ZONE` scan every room on a level, or take the LEVEL itself as their subject. Retyping
ONE room to `stairwell` flips verdicts for every room on the floor. A relationship *index* is the
wrong shape for these — the dependency is "all of them".

### 🟡 G-12 — the snapshot whitelists, and the whitelist exists in two hand-synced copies

**Axis:** persistence · **Evidence:** `ProjectSerializer.ts:392-604`, `:83-329`, and the warning at
`:408-410`

Nine per-kind serializers enumerate explicit keys; the snapshot enumerates explicit arrays. A new
relationship field is **dropped by default** unless someone adds it to both
`packages/persistence-client` and the `apps/editor` twin. The codebase already records the precedent
of this going wrong: *"these two allow-lists diverging is how `function` was silently dropped on
reload."*

### 🟡 G-13 — the room LOAD path both mints provenance and mis-shapes the relationship carrier

**Axis:** provenance × persistence · **Evidence:** `roomSnapshotUtils.ts:156` (V1 + V5) and
`rebuildSemanticGraph.ts:131`

`(rawBoundary['detectionMethod'] as any) || 'auto-topology'` — an `as any` defeating the union at
exactly the boundary it existed to police, plus a fallback that presents a missing origin as a real
observation. A room loaded from a snapshot missing its detection method is **indistinguishable from
a genuinely auto-detected one**, and will be exported as one.

### 🟡 G-13b — the CRDT keeps a NON-AUTHORITATIVE mirror, and who reads it is untraced

**Axis:** concurrency · **Evidence:** §4.3 · `YjsDocAdapter.ts:113-117, 474-477, 772-782, 826,
830-831, 844-849`

`fb7cd4a0` made the flat `ELEMENT_PROPS_NAMESPACE` map authoritative and retained the nested
per-element `Y.Map` as a **compatibility mirror**, rebuilt from the flat map after every merge.
`:830-831` is explicit: *"This — **not** the mirror's key set — is the truth about which elements
exist."* **Which downstream readers consult the mirror rather than the flat map was NOT traced —
UNCERTAIN.** It matters for C78 specifically: a relationship index built off the mirror would
inherit exactly the staleness the flat map was introduced to eliminate, and the mirror is only
reconciled *after* the merge transaction.

### 🟢 G-14 — `joinedTo` persistence is sound only conditionally, and the condition is untraced

**Axis:** persistence · **Evidence:** `rebuildSemanticGraph.ts:22-26`; `WallRebuildCoordinator.ts:183,
1573-1586`

Junctions are never serialized — no `JunctionStore`, no snapshot key. The claim that this is *"NOT a
loss"* rests entirely on the wall flush firing after **every** load path. That call-order guarantee
was **not traced** (§5.5). If any path skips it, `joinedTo` is lost with no report.

### 🟢 G-15 — ceiling/floor → room relationships are never established, so persistence is moot

**Axis:** persistence · **Evidence:** `CreateCeilingCommand.ts:191`, `CreateFloorCommand.ts:231`;
`sourceRoomId` → 0 hits repo-wide

Both commands hardcode `boundingWallIds: []`. The association does not exist at creation time, so
there is nothing to save, nothing to lose, and nothing to rebuild. It is a **missing relationship**,
not a broken one — recorded here so its absence is never read as a passing round-trip.

### 🟢 G-16 — two rival `StairValidationAuthority` copies, neither with a witness

**Axis:** constraints · **Evidence:** FINDING H5; `diff` at this HEAD; `ValidateStairCommand.ts:10,65`;
`constraint-solver/src/index.ts:51-55`

Production imports the `geometry-stair` copy. I diffed them: **rule bodies are identical today** —
the 12-line delta is imports plus one non-null assertion at `:223`. So this is not a live
divergence. But the `constraint-solver` copy is still exported from that package's public barrel,
and **neither copy has an executable witness**, so nothing would detect the day they part.

---

---

## §6 — WHAT IS UNCERTAIN, AND WHY

Collected so no reader has to infer confidence from prose. Nothing below is rounded or guessed.

| # | Item | Why uncertain |
|---|---|---|
| U-1 | **The two-client gate's current reading** | My run at `d0a8674e` produced a **0-byte output file**. `two-client-ledger.json` + four `certification/results/*.json` are modified in the working tree by another agent, with two uncommitted new gate files. §4.3 reports the **ledger's text**, explicitly not a reading I obtained. |
| U-2 | **`initBusHandlers` bridge-handler count** | Three unreconciled figures: `gestureScope.ts:31` says **81**, `initBusHandlers.ts:407` says **90**, `grep -c "_cmExec"` returns **~100** (inflated by comments and by `_cmExecOrRefuse`). Not resolved. |
| U-3 | **`affectedStores` coverage — 266 of 269** | Two different denominators (files containing the string vs files named `*Command.ts`); a file may hold >1 command class. Read as "essentially universal with a small remainder", **±3**. |
| U-4 | **Which readers consult the CRDT compatibility mirror** | Not traced. Material for C78 (§4.3, G-13b). |
| U-5 | **Whether every load path reaches `WallRebuildCoordinator`'s flush** | The writer and its invocation exist; the call-order guarantee was not traced. `joinedTo`'s "not a loss" claim is conditional on it (§5.5, G-14). |
| U-6 | **Whether the `apps/editor` twin serializer's room block matches persistence-client's** | Only the slab `sketch` line was confirmed in the twin. Both feed the same `deserializeRoom`, so §5.3 holds either way. |
| U-7 | **Other `restoreSnapshot` whole-record undos** | The ledger states none is proven either way; I did not enumerate them (G-5). |

**Measured on `d0a8674e` (§1, §2.5):** the constraint gate re-run, the D1/D2/D3 verifications, the
`planRegenerationClear` caller census, the CRDT mirror reads. **Measured on `2b636854` (§3, §5):**
the gesture/undo census, the `nonUndoable` census, the persistence round-trip analysis — no
`command-registry`, `command-bus` or `persistence-client` change landed between the two commits, so
these remain current.

---

*End of PHASE 0D inventory. Every number above is either measured with the commands in §0 or listed
in §6 as uncertain with its reason. No design is proposed anywhere in this document — §CROSS-CUTTING
GAPS names defects and their evidence, for C78 / C79 / C80 to consume.*
