# BIM 3.0 Evolution Audit — how far without changing the architecture

> **Stamp**: 2026-08-11 · **Author**: Agent BIM30-AUDIT · **Branch**: `main` ·
> **Status**: READ-ONLY investigation + implementation-readiness plan. This file is the only repo write.
> **The directive**: founder directive #2, 2026-08-11 — *how far can PRYZM evolve toward BIM 3.0
> WITHOUT changing its fundamental architecture or topology?* Preserve-architecture is the default;
> every change recommendation carries its justification.
>
> **Base layer** (cited, not redone): [`BIM30-READINESS-REPORT.md`](BIM30-READINESS-REPORT.md)
> (69520ed3, "the excavation") · [`BIM20-CERTIFICATION-PLAN.md`](../03-execution/plans/BIM20-CERTIFICATION-PLAN.md) ·
> [`ENGINEERING-AUDIT-2026-08-11.md`](ENGINEERING-AUDIT-2026-08-11.md) §17 ·
> [`API-VERB-REGISTER.md`](API-VERB-REGISTER.md) (C69, generated) ·
> [ADR-0318](../02-decisions/adrs/ADR-0318-composeruntime-owns-authoritative-stores.md).
>
> **Evidence vocabulary on every claim**: **EXECUTED** — run in this or the excavation
> investigation and its output read · **EXECUTED-CITED** — an executed result recorded today by
> another artefact, cited not re-run · **BY-READ** — proven by reading source at HEAD (strong for
> "exists", never for "runtime-proven") · **UNPROVEN** — no executed evidence either way.
>
> **Honest scope cap**: four commissioned deep-dive explorations (topology internals, constraint
> wiring, provenance fields, change-impact tracing) had not reported at writing time. Rows that
> depended on them are graded from the excavation, the CA-21 census, ADR-0318, and this agent's
> own targeted greps (constraint-solver import sweep, `detectionMethod` value sweep, junction-file
> sweep, `wall.split`/level-elevation verb sweep — all EXECUTED as greps, BY-READ as semantics).
> Residuals are marked, not smoothed over. An honest partial grade beats a complete one later.

---

## 1. BIM 2.0 closure status

**Status: Phase A (BIM 2.0 closure) is live and moved TODAY.** Cited, not re-derived:

- **ADR-0318 is COMMITTED and pushed (`be425841`), Accepted 2026-08-11** — `composeRuntime`
  adopts the module-singleton `storeRegistry` as `runtime.stores.elements` (a *view*, identity
  not construction, invariant I-1: `get('wall')` IS the serializer's instance). Same-instance
  probe executed 6/6 (EXECUTED-CITED, coordinator confirmation + ADR probe
  `tools/rac-conformance/runtime-harness/__tests__/adr0318.stores.probe.ts`). Consequence:
  door/window are headless-authoritative **by design, no longer by module-scope accident**; the
  remaining 12 kinds are ABSENT-headless but adoption-ready per kind, and **all 21 registered
  kinds become runtime-reachable in-browser** the moment `engineLauncher` boots.
- CA-21 census (EXECUTED-CITED): REACHABLE stores 8 · ABSENT 15 (pre-ADR-0318 reading) · verdicts
  over the register: 7 PROVEN (all `plugins/annotations`) · 168 UNPROVABLE-NO-STORE · 145 UNKNOWN ·
  **3 observed liveness lies** (`door.create`, `window.create`, `template.create`).
- C69 register at HEAD (EXECUTED-CITED, generated file): **320 verbs · LIVE 101 · REFUSES 33 ·
  SHADOWED 14 · UNKNOWN 172 · authoritative store NONE/UNKNOWN 219 · sync UNDECLARED 0**.
  (The excavation's REFUSES 18 / UNKNOWN 187 is superseded — the refusal remediation moved.)
- Still open in BIM 2.0: undo gesture race pinned RED-BY-DESIGN at the 125 ms cliff (P1-7);
  collaboration leg C absent (L-391, C66: 0 tiers HELD); persistence certification does not
  exist (plan §B.5); three BIM 2.0 agents are live on runtime-composer / rac-conformance /
  ai-host at this hour — none of their surfaces was touched by this audit.

**Meaning for this audit**: the binding constraint the excavation named — "the composition root
exposes almost none of it" — is now a *closing* constraint with a decided mechanism and a
per-kind migration path, not an open architectural question. Everything below assumes ADR-0318's
end state arrives kind-by-kind and grades what BIM 3.0 that unlocks.

## 2. Graph maturity per relationship family (G0–G6)

Scale: **G0** none · **G1** identifier-only (foreign key) · **G2** explicit semantic (typed
relationship record) · **G3** navigable (indexed, queryable both directions) · **G4**
dependency-aware (change propagates across it) · **G5** computational (algorithms run over it —
pathfinding, solving, validation) · **G6** BIM 3.0-grade (persisted + certified + collaborative +
provenance-carrying).

| Relationship family | Grade today | Evidence | What blocks the next grade |
|---|---|---|---|
| Opening→host wall (`door.wallId`) | **G4** | G1 field (schema) + G2 `hosts/hostedBy` (SemanticGraph) + G3 wall openings index (`WallStore._assertOpeningsChildrenInvariant`, BY-READ) + G4 `WallOccupancyStore.canPlace()` commit gate (BY-READ, wired consumers) | G5: solver-maintained hosting under wall edits UNPROVEN; G6: `door.create` is a CA-21 lie (EXECUTED-CITED) |
| Room→bounding walls (`boundingWallIds`) | **G4** | persisted with uniqueness refinement (`Room.ts:106-115`, BY-READ) + `boundedBy` edges + `RoomBoundaryBuilder` recompute + `RoomTopologyObserver` auto-redetect (EXECUTED 92/92 at unit level) | G5 partially there (detection IS the algorithm); G6 blocked on round-trip proof + room store headless-ABSENT |
| Room↔room adjacency/connectivity | **G5** | `RoomGraphService` — rooms-as-nodes, doors-as-edges, BFS `findPath`, connected components, accessibility flags (EXECUTED 20/20) | G6: not a bus verb, `[]` conflates failure/empty (`RoomGraphService.ts:152, 253-258`), single-level only |
| Wall↔wall junctions | **G2-transient** | JunctionResolverV2/WallJoinResolver compute L/T/X junction records (ADR-0055; files BY-READ: `WallPipelineV2.ts`, `WallFragmentBuilder.ts`, `WallJunctionInfillManager.ts`) — **then discard them after meshing** (excavation §11 row 5, BY-READ) | G3 needs a retained junction index — see §3; every junction query today is a re-run of the resolver |
| Element→level→building containment | **G3** | `hierarchy.*` verbs LIVE (register) + `partOf/unitOfLevelOf` typed | G4: level-elevation change propagation — **no `level.setElevation`/move verb found at all** (EXECUTED grep, zero hits) |
| Dependency (element→dependents) | **G4-forward-only** | store events with `prevState` (§STEP7, BY-READ) → `DependencyResolver` cascade; UBG `dependsOn` adapter | G5: no queryable *reverse* dependency index at runtime; the UBG projects it pull-only |
| Constraint→element (`violates`) | **G2** | `violates` edge type + constraintAdapter, unit-tested (BY-READ) | G4/G5: validators not unified under it; population from live validation runs UNPROVEN |
| Provenance/temporal (`derivesFrom`, `precededBy`, Intent families) | **G1–G2** | types exist (SemanticGraph Phase G + UBG); `project_command_log` exists | population UNPROVEN; per-element provenance fields exist for only one element family — see §7 |
| Vertical circulation (`connectedByStair/Lift`) | **G2** | typed in SemanticGraph | population coverage UNPROVEN; RoomGraph is per-level, so cross-level pathfinding is G0 as a computation |

**Where PRYZM is today, in one line**: the room tier is G5, hosting and bounding are G4, and
nothing is G6 — not because graph machinery is missing but because certification, verb exposure,
and failure-honesty are (the same three gaps everywhere).

## 3. Topology audit — explicit vs reconstructed

| Topological entity | Explicit / Reconstructed / Absent | Where | Evidence |
|---|---|---|---|
| Vertices/edges (wall baselines, polygons) | **Explicit** | element schemas (baseline endpoints, polygon rings) | BY-READ |
| Faces/loops/shells (B-rep) | **Absent as a structure** | no half-edge/B-rep store found by the excavation; meshes are derived artefacts | BY-READ (excavation §10); UNPROVEN that no partial structure hides in geometry-kernel — deep-dive did not report |
| Room boundary | **Both, with authority split** | `Room.boundingWallIds` persisted (ids); the boundary *polygon* is reconstructed (`RoomBoundaryBuilder`/`RoomDetectionEngine`) — ⚠ except `repairToSimplePolygon` invents one unlogged (P1-5 OPEN) | BY-READ + EXECUTED 92/92 |
| Wall junctions (L/T/X) | **Reconstructed, then DISCARDED** | ADR-0055 pipeline (`packages/geometry-wall`); junction records exist during meshing only | BY-READ |
| Room↔room adjacency | Reconstructed, cached, invalidated | `RoomGraphService` per level | EXECUTED 20/20 |
| Openings/voids in walls | **Explicit** | `wallId` + offset + `WallOccupancyStore` occupancy intervals | BY-READ |
| Containment hierarchy | **Explicit** | level/building hierarchy store (`hierarchy.*` LIVE) | EXECUTED-CITED (register) |
| Semantic relationships | **Explicit, persisted** | `SemanticGraph`, snapshot v3 | BY-READ |

**The eight deterministic questions — LOOKUP vs RE-DETECTION today** (BY-READ throughout):

| # | Question | Today | Mechanism |
|---|---|---|---|
| 1 | Walls bounding room X | LOOKUP | `boundingWallIds` |
| 2 | Rooms sharing wall Y | RE-DETECTION (geometric sampling) | `RoomRelationshipService.getWallAdjacentRooms` — ±0.55 m normal sampling, per call |
| 3 | Openings in wall Y | LOOKUP | `wallId` fields + wall openings index |
| 4 | Walls connected to wall Y | **RE-DETECTION** | `WallIntersectionResolver` re-run; junction records were discarded |
| 5 | Elements depending on wall Y | RE-DETECTION (pull-only projection) | UBG `dependsOn` adapter on demand; no standing reverse index |
| 6 | Room containing point P | RE-DETECTION | `RoomRelationshipService.getRoomAtPoint` (point-in-polygon per call) — acceptable; this one SHOULD be geometric |
| 7 | Level containing element E | LOOKUP | `levelId` fields + hierarchy |
| 8 | What is adjacent to room X | LOOKUP after lazy rebuild | `RoomGraphService` `adjacentRooms` (cached, event-invalidated) |

**The junction-record finding, quantified**: keeping the L/T/X records the resolver already
computes (participant wall ids, junction type, resolved corner geometry) as a store-adjacent
index would convert Q4 from re-detection to lookup, give `SemanticGraph.connectedTo` a
deterministic writer, give `DependencyResolver` an exact adjacency set instead of a baseline
re-scan, and make junction-aware operations (split, chain-move, join repair) O(1) lookups.
Cost: a cache keyed by wall ids with the invalidation the pipeline already performs (it *knows*
when it recomputes — that is the moment it currently throws the record away). **This is an
extension of an existing computation's lifetime, not new architecture.** (BY-READ; the exact
record shape was not line-verified — deep-dive residual, UNPROVEN at field level.)

**Incremental-strengthening verdict for §6**: every RE-DETECTION row above is convertible to
LOOKUP by *retaining* something already computed (junctions, wall-adjacency samples, reverse
dependency edges) under the invalidation spine that already exists. No topology change required.

## 4. Authoritative vs derived — the 10-row inventory

Reachability truth = CA-21 census (EXECUTED-CITED) as amended by ADR-0318 (door/window headless
by design; 12 kinds in-browser-only until per-kind migration).

| Kind | Authoritative | Derived representations | Graph participation | Persisted | Derived regenerable from authoritative alone? |
|---|---|---|---|---|---|
| Wall | geometry singleton (engineLauncher-built; registry-adoptable per ADR-0318) | mesh (pipeline), junctions (transient), 2-D projection, IFC | `boundedBy`/`adjacentTo` source, junction graph | YES (serializer) | **YES** — meshing + junction + room detection all rebuild (BY-READ) |
| Door | authoritative store, headless by design (ADR-0318) | mesh, room-graph edge, `hosts` edge | edge in RoomGraph | YES | YES — but `door.create` liveness lie means "authoritative changed" needs the CA-21 read-back, not the command result (EXECUTED-CITED) |
| Window | same as door | mesh, `getWindowRelationships` | `hostedBy` | YES | YES |
| Room | room store (ABSENT-headless) | polygon, area metrics, graph node, labels | first-class node everywhere | YES | **MOSTLY** — ⚠ two non-regenerable residues: `repairToSimplePolygon`-invented boundaries (P1-5) are *recorded as if authored*; manual rooms (`detectionMethod:'manual-boundary'`) are authored state, correctly authoritative |
| Slab | geometry singleton (ABSENT-headless) | mesh, fragments | `sitsOn/supports` typed | YES | YES (BY-READ) |
| Roof | geometry singleton (ABSENT-headless) | mesh (oracle-proven overhang: 300 mm spread 0.000, EXECUTED-CITED P0-5) | partial | YES | YES — the roof oracle is the proof pattern for all rows |
| Stair | geometry singleton (ABSENT-headless) | mesh; StairConstraintEngine-validated params | `connectedByStair` typed, population UNPROVEN | YES | YES (BY-READ) |
| Level | hierarchy store (REACHABLE) | plan views, band assignment | `levelOf` | YES | YES |
| Opening (as occupancy) | `WallOccupancyStore` intervals | wall mesh voids (CSG/grid — two render paths, memory-cited) | via host fields | UNPROVEN whether occupancy is serialized or rebuilt on load | rebuild-on-load presumed (BY-READ residual) |
| Building | hierarchy root | UBG projection, IFC project | `partOf` | YES | YES |

**The critical column answered**: with two named exceptions (invented room boundaries P1-5;
persisted SemanticGraph edges whose per-kind write coverage is UNPROVEN), **every derived
representation is regenerable from authoritative state** — the excavation's §10 finding holds at
this depth. The BIM 3.0 property "topology is derived, never hand-maintained" is already the
design; what is not yet true is that regeneration is *certified equivalent* to the persisted
copy (no rebuild==restored diff probe exists — UNPROVEN, gate §16.2 of the excavation).

## 5. Change-impact matrix

Grounded in: `prevState` store events (§STEP7), `DependencyResolver`, `RoomTopologyObserver`
(300 ms coalesce, suppression-gated by generation executors — proof of liveness),
`RoomGraphService.invalidateForDoor`, UBG `dependsOn` (pull-only). Grades: MEASURED / BY-READ /
UNKNOWN. Deep-dive tracing did not report; nothing below is upgraded beyond what the excavation
plus this agent's greps support.

| Operation | Directly affected | Indirectly affected | Existing mechanism | Missing | Grade |
|---|---|---|---|---|---|
| Move wall | its openings (offset-anchored), its mesh | adjacent-wall joins; rooms; room graph; schedules | prevState event → DependencyResolver adjacent rebuild; RoomTopologyObserver redetect | proof that openings translate (openings ride the wall record BY-READ, never executed-proven); schedule refresh path UNKNOWN; `wall.move` liveness itself was in the lying-verb class (§17.3 N-1) | BY-READ |
| Change wall height | wall mesh; hosted opening clamping | rake joints on adjacent walls | height verb wired (P1-7 shows it live in the ring buffer) | opening head-height clamp on shrink: UNKNOWN — no clamp code identified | UNKNOWN |
| Split wall | — | — | **NO MECHANISM: no `wall.split` bus verb exists** (EXECUTED grep — only `splitWall` *analysis* helpers in `WallIntersectionResolver`, used by room detection, not a command) | everything: the verb, opening re-parenting to halves, junction update | MEASURED-ABSENT |
| Move door along wall | occupancy interval; door mesh | room-graph edge; swing clearance | `MoveDoorCommand` consults `WallOccupancyStore.canPlace` (BY-READ); `RoomGraphService.invalidateForDoor` (BY-READ) | swing-clearance check: none found; known perf defect — `setOffset` rebuilds the WHOLE level (ADR-057, memory-cited) | BY-READ |
| Change room boundary (move bounding wall) | room polygon, area | furniture inside; `boundingWallIds` | RoomTopologyObserver full redetect | *incremental* boundary update (today it is re-detect-everything-on-the-level); furniture re-seat UNKNOWN | BY-READ |
| Move level (elevation) | every element on the level | levels above; stairs spanning | **NO MECHANISM FOUND: no level-elevation verb at all** (EXECUTED grep, zero hits) | everything | MEASURED-ABSENT |
| Change roof footprint | roof mesh | gable/raked walls beneath; clash | overhang offset now oracle-true (P0-5) | wall-under-roof propagation: UNKNOWN; flat-roof/slab clash is a known live defect (memory-cited) | UNKNOWN |

**Pattern**: where a mechanism exists it is the *same* spine every time (event → resolver →
observer → lazy graph rebuild) — the strengthening path is uniform. The two MEASURED-ABSENT rows
(split wall, move level) are **missing verbs, not missing architecture**: both are expressible
as ordinary commands over existing stores, and split-wall's geometric analysis half already
exists in `WallIntersectionResolver`.

## 6. Constraints — classification and the six examples

Ladder: none → validation-only → stored → solver-driven → dependency-driven.

**New wiring evidence this audit adds (EXECUTED import-sweep, BY-READ semantics)** — the
excavation left production dispatch UNPROVEN; the sweep sharpens it:

- `constraintEngine` (`@pryzm/constraint-solver/compliance`) is imported by
  `apps/editor/src/engine/initDataPlatform.ts:50` (editor init path), `packages/ai-host/src/WorldModelAdapter.ts:32`,
  `packages/ai-host/src/generative/LayoutGenerator.ts:35`, `packages/speculative-engine/src/SpeculativeEngine.ts:24`,
  and `apps/editor/src/ui/dataworkbench/CompliancePanel.ts` — **the compliance half is on the
  production init path and the AI world-model path**.
- `StairConstraintEngine` is imported by `packages/command-registry/src/stair/UpdateStairFlightsCommand.ts:13`,
  `ChangeStairShapeCommand.ts:13`, `StairCommandPlan.ts:7` — **solver-adjacent validation inside
  the production dispatch path for stairs**.
- The planegcs *sketch solver* (`loadSolver`, `SolverPorter`, `MockSolver`, `SketchConstraint`)
  is wired to **`apps/component-editor`** (`familyEditorRuntime.ts:29`, `sketch/solverRunner.ts`,
  `sketch/buildConstraintSet.ts`, `stores/constraintStore.ts`) — the family/sketch editor, the
  ADR-0316-blessed second surface. **The main editor has NO solver-driven constraint path.**
- Verdict the excavation could not give: **the solver is reachable from production user action —
  but only in the component-editor's sketch environment; in the main editor, constraint-solver
  is consumed as a validation library (compliance + stair), never as a solver.** (BY-READ;
  runtime execution of these paths UNPROVEN.)

| Constraint family | Ladder position | Where | Persisted? |
|---|---|---|---|
| Geometric relations (parallel/distance/coincident) | **solver-driven in component-editor sketches only**; NONE in main editor model space | `constraintStore.ts` (component-editor) / planegcs | in family definitions (BY-READ, UNPROVEN) |
| Opening hosting/occupancy | dependency-adjacent validation (commit-time gate) | `WallOccupancyStore.canPlace` | store state; snapshot persistence UNPROVEN |
| Dimensional limits (room, stair) | validation-only | `RoomValidationService`, `StairValidationAuthority` (in dispatch for stair) | no |
| Schema invariants | stored (type-level, always-on) | Zod refinements; `LandBasis` branded type (TS2345 at compile time, EXECUTED-CITED P1-6) | by construction |
| Program/adjacency rules | validation-only, generation-time | `programRules`, apartment validators (10+8, BY-READ) | no |
| Constraint→graph bridge | stored *as vocabulary*, unpopulated | UBG `violates` + constraintAdapter | no |

**The six example constraints** (each: extension vs new):

1. **Two walls stay parallel** — needs: a stored constraint record + a maintenance trigger. The
   solver exists (EXECUTED 31/33); what is NEW is a model-space constraint store and a
   post-command solve hook. Smallest honest form: **stored + validation** first (a `violates`
   edge when broken), solver-maintenance later. EXTENSION (store pattern exists in
   component-editor's `constraintStore`) + one NEW hook point.
2. **Door stays hosted when wall moves** — openings are wall-record children (BY-READ), so
   translation is free; what is missing is *certified proof* plus clamp-on-shrink. EXTENSION
   (WallOccupancyStore re-check inside the wall-move command).
3. **Sill height fixed at 900 mm** — a parameter pin: validation-only today would already work
   via a stored parameter constraint checked in `canExecute`. EXTENSION of the C16 command
   pattern; no solver needed.
4. **Ridge centred over footprint** — already TRUE by construction (ridge is derived from
   footprint each rebuild); becomes a constraint only if ridges become editable. NO-OP today;
   flag as derived-geometry invariant.
5. **Room boundary stays closed** — already enforced at detection (closed-ring outputs; the
   inset spread gate P1-4 CLOSED); the gap is the P1-5 repair path that *fakes* closure.
   EXTENSION: make repair refuse-or-log (the sibling `SlabFragmentBuilder.ts:706` already shows
   the refusing form — copy the policy, not new machinery).
6. **Opening remains inside host segment** — `canPlace` covers placement; wall-*resize* re-check
   UNKNOWN. EXTENSION: run the existing gate on the host's prevState diff.

**Zero of the six needs new architecture; one (parallel walls) needs one new hook + one new
store, both following existing patterns.**

## 7. Semantic + provenance — the minimum missing fields

Per-element target: identity / type / host / parameters / provenance / confidence / lifecycle /
version.

**What exists (BY-READ + EXECUTED greps)**: identity, type discriminators, host refs,
typed parameters — universal. **Provenance exists for exactly one family**: the room/floor/ceiling
family carries `detectionMethod` with observed values `'manual-polygon' | 'manual-boundary' |
'manual' | 'auto-topology' | 'from-room' | 'ai-generated'` (EXECUTED grep across
`plugins/floor`, `command-registry` floors/ceilings/rooms, `room-topology`). Walls, doors,
windows, slabs, roofs, stairs carry **no provenance field** (UNPROVEN at line level for every
schema — deep-dive residual — but no counter-evidence surfaced in any sweep). Confidence:
nowhere on elements. Lifecycle/phase: not found. Version: no per-element revision; the
`project_command_log` is the implicit history, per-element linkage UNPROVEN.

**The repo's own best provenance idioms, to extend rather than invent** (EXECUTED-CITED):
C63's `LandBasis` — an invariant branded type making a wrong basis *unrepresentable*, with
`unreachableLandBasisRefusal()` naming what cannot yet be served; `BuildableEnvelope`'s 17 typed
determinations + 11-member refusal union — "how do I know this" as a type. And P1-14's
labelled-zeros doctrine: a zero that is not a measurement says so.

**Minimum missing fields (extend `packages/schemas` element schemas — never a second schema):**

1. `origin: 'user' | 'ai-generated' | 'detected' | 'imported' | 'repaired'` — the
   `detectionMethod` pattern, generalised to every element kind, optional-with-default `'user'`
   so existing snapshots parse (backward compatible by Zod default).
2. `originDetail?: string` (which engine/executor/import) — one field, not a taxonomy.
3. `repaired?: { method: string; note: string }` — the P1-5 fix becomes writing this instead of
   stamping `'ai-generated'`; an invented boundary is then *legible*.
4. `confidence?: number` — only meaningful for detected/imported (PDF→BIM already computes per-
   candidate scores it currently discards at commit, BY-READ).
5. `revision?: number` bumped per mutating command — gives the graph `precededBy` something to
   anchor without event-sourcing anything.

That is five optional fields. Lifecycle/phase (BIM phasing) is deliberately NOT proposed —
nothing downstream consumes it yet, and unconsumed schema is how second schemas start.

## 8. Geometric intelligence — algorithm inventory

Partial: the commissioned predicate-family sweep did not report. What this audit itself
established (EXECUTED greps + cited artefacts):

| Family | State | Evidence |
|---|---|---|
| Polygon offset | **ONE canonical impl, gate-pinned 0/0** at `packages/geometry-kernel/src/pure/polygonOffset.ts` across 4,478 files; oracle-true at 300 mm spread 0.000 | EXECUTED-CITED (P0-5, R3) |
| Polygon shrink/inset | canonical, refusal-honest (three named collapse modes) | EXECUTED-CITED (P0-6) |
| Wall intersection | **THREE copies**: `packages/room-topology/src/WallIntersectionResolver.ts`, `packages/core-app-model/src/ai/WallIntersectionResolver.ts`, `packages/ai-host/src/WallIntersectionResolver.ts` (plus `FloorPlanDiagnostics` duplicated ai-host/core-app-model) | EXECUTED grep — the excavation did not know this |
| Point-in-polygon / containment | at least `RoomRelationshipService.getRoomAtPoint` + spatial-index query paths; copy-count UNPROVEN | BY-READ |
| Boolean union / clipping | wall-opening CSG path + grid path ("two render paths", memory-cited); copy-count UNPROVEN | UNPROVEN |
| Triangulation | UNPROVEN (earcut presence not swept) | UNPROVEN |
| Clash/overlap | `WallOccupancyStore` (1-D intervals, sound); 3-D clash: no dedicated engine found in any sweep | BY-READ / UNPROVEN |

**The R3 lesson generalises**: offsets had 4 implementations before the gate pinned 1; wall
intersection demonstrably has 3 now. The remove-duplication move (§13) is the R3 recipe —
canonical file + counting gate — applied per family, one family per PR. Missing invariants to
encode when canonicalising: winding policy, self-intersection refusal (the ADR-0299 pattern),
and a single epsilon policy (none was found stated anywhere — UNPROVEN that one exists).

## 9. Deterministic vs AI matrix

The excavation's §14 verdict stands: **zero-LLM BIM 3.0 is achievable**. Itemised (~25):

**Deterministic, no AI anywhere in path (BY-READ/EXECUTED as noted):** room detection ·
room boundaries/insets (EXECUTED 92/92) · wall joins (ADR-0055) · room graph + BFS pathfinding
(EXECUTED 20/20) · spatial queries (EXECUTED 20/20) · dependency cascade · occupancy gating ·
constraint solving (EXECUTED 31/33) · stair validation · D-TGL apartment layout (offline by
design) · D-FLE furnish · D-CE ceilings · schedules/quantities · IFC export incl. relationship
export · 2-D projection · undo/redo · persistence · solar analysis (C21) · envelope/planning
resolution (C63 — deterministic with typed refusals) · PDF→BIM tier-1 (EXECUTED-CITED zero-token
proof, `PdfToBimZeroToken.spec.ts`).

**Deterministic + optional AI enhancement:** typology/brief generation (deterministic executors;
AI proposes briefs) · furnish quality passes · room-type inference (`RoomTypeInferenceEngine`
is rule-based; AI may refine — BY-READ) · PDF→BIM higher tiers (AI critique optional, cost-gated
— gating documented-as-dead, P1-14 residue).

**AI-required:** natural-language intent → command (RAC chat) · free-form design conversation
(C68) · AI area layout proposals. **Every one is a *consumer* of bus verbs and graph reads —
none is an authority over model state** (the P0-4 inversion made read-only the default posture;
the structural read-only capability class is still OPEN — that is the one AI-boundary debt).

## 10. Existing gold — every promising subsystem, one line each (§23, mandatory)

- `@pryzm/building-graph` (UBG) — a BIM 3.0 primitive because it already IS the unified, typed,
  pure, Zod-validated, span-instrumented graph with the 10-edge vocabulary; it lacks only a
  runtime home.
- `SemanticGraph` + snapshot v3 — persisted typed relationships shipping in every project file;
  BIM 3.0's "relationships are first-class" is already the file format.
- `RoomGraphService` — a proven G5 graph computation (BFS, components, accessibility) waiting to
  be a verb.
- `prevState` store events (§STEP7) — the propagation spine every "BIM 3.0 dependency engine"
  pitch proposes to build; it is designed into the stores.
- `DependencyResolver` — the cascade layer, already event-wired.
- `WallOccupancyStore` — a real 1-D constraint store with a commit-time gate; the template for
  every future occupancy constraint.
- planegcs solver — a real FreeCAD-grade GCS in-tree with passing tests; parametric editing is a
  wiring project, not a research project.
- `violates` edge + constraintAdapter — rules-live-in-the-graph, pre-built.
- Junction pipeline (ADR-0055) — computes the wall connectivity graph on every rebuild; one
  lifetime extension turns it into a topology index.
- C69 verb register — a machine-readable, CI-diffed graph of the API itself; the certification
  substrate.
- `LandBasis`/`BuildableEnvelope` refusal unions — the provenance/honesty idiom to copy onto
  elements.
- Roof overhang oracle + R3 counting gate — the proof-and-pin pattern for canonicalising every
  geometric predicate family.
- ADR-0318 `storeRegistry` slot — the identity-not-construction bridge that lets every one of
  the above become headlessly certifiable.
- `project_command_log` — an event history that becomes provenance the day elements carry a
  `revision`.
- IFC `IfcRelSpaceBoundary` export — proof the internal vocabulary maps to the interchange
  standard.

## 11. Maturity model — Levels 0–8

| Level | Definition | PRYZM? |
|---|---|---|
| 0 | Dumb geometry (meshes only) | passed |
| 1 | Typed elements with identity | passed |
| 2 | Foreign-key relationships (host ids, level ids) | passed |
| 3 | Explicit typed relationship records, persisted | passed (SemanticGraph v3) — with per-kind write coverage UNPROVEN |
| 4 | Derived topology auto-maintained (detection, invalidation, cascade) | **passed in-session** (EXECUTED at unit level; the excavation's spine) |
| 5 | Unified queryable graph as a runtime service, certified, failure-honest | **NOT passed** — UBG is a dev-hook; queries conflate failure/empty; zero graph verbs |
| 6 | Constraint- and dependency-driven modelling (stored constraints, solver maintenance, reverse-dependency queries) | not passed — solver confined to component-editor sketches; no model-space constraint store |
| 7 | Collaborative, versioned graph (merge semantics, provenance, per-element history) | not passed — leg C absent, C66 0 tiers HELD |
| 8 | Full BIM 3.0: explanation-capable, provenance-complete, interchange-round-tripping | not passed |

**PRYZM is Level 4, with Level 5 within one composition change of reach.** Evidence basis:
Levels 1–4 EXECUTED/EXECUTED-CITED per the excavation's runs; Level 5's blockers each named
above with evidence.

## 12. The percentage

**Bracket: 50–75%** of BIM 3.0 is reachable by strengthening only, architecture frozen.

Justification from this audit's own tables: §2 shows every relationship family at G2+ with the
G5/G6 blockers being *exposure, retention, and certification* — not structure; §3 shows every
re-detection convertible to lookup by retaining existing computations; §4 shows derived state
regenerable (the BIM 3.0 invariant) with two named residues; §5 shows one uniform propagation
spine plus two missing *verbs*; §6 shows six of six example constraints as extensions; §9 shows
the deterministic core complete. What caps it below 75: collaboration (leg C, and "the RAC's
strongest capabilities are its least syncable" — late-bound `'all'` subjects, P1-10) and
per-element provenance/versioning require *schema and infra additions* that are strengthening in
letter but real engineering in cost; Level 7–8 capabilities (merge semantics for the persisted
graph, explanation with provenance) cannot be reached by wiring alone. What keeps it above 50:
nothing in Levels 5–6 requires a topology change — the excavation's "activation, not
construction" verdict survives this audit's deeper pass intact.

## 13. Keep / Strengthen / Connect / Generalise / Remove-duplication / Add / Replace

- **KEEP** (untouched): the 8-layer model; command-only mutation (P6 path); prevState events;
  SemanticGraph vocabulary; WallOccupancyStore; the derived-is-regenerable discipline; the
  refusal-union idiom; ADR-0318's registry (identity, not construction).
- **STRENGTHEN**: RoomGraphService failure≠empty (typed refusals replacing `[]` — three
  indistinguishable cases named at `RoomGraphService.ts:152, 253-258`); the P1-5 repair path
  (refuse-or-log, copying `SlabFragmentBuilder.ts:706`); occupancy re-check on host resize;
  P8 span scope; the UBG rebuild determinism probe (excavation gate §16.2).
- **CONNECT** (the audit's centre of gravity — each converts authored code into capability):
  1. **UBG → composeRuntime slot + 3 read-only refusal-honest verbs** (`graph.query`,
     `graph.neighbors`, `graph.path`) in a read-only capability class — one slot, and 15 authored
     subsystems become one certified capability; sequenced after per-kind ADR-0318 adoption of
     wall/room (the graph must wire to the authoritative half).
  2. **Validators → `violates` edges**: RoomValidationService, StairValidationAuthority,
     apartment validators, programRules all emit into the constraintAdapter — constraint results
     become queryable graph state with zero new validator code.
  3. **Junction records → retained index → `SemanticGraph.connectedTo` writer**: stop discarding
     the ADR-0055 output; Q4 becomes a lookup and the wall-connectivity tier of the graph gets a
     deterministic populater.
  4. (next) DependencyResolver's edge set → standing reverse-dependency index queryable via the
     UBG `dependsOn` adapter push-side.
- **GENERALISE**: `detectionMethod` → the 5-field origin/provenance block on every element
  schema (§7); the R3 canonical-file-plus-counting-gate pattern → per predicate family.
- **REMOVE-DUPLICATION**: `WallIntersectionResolver` ×3 and `FloorPlanDiagnostics` ×2
  (EXECUTED grep) — pick the room-topology copy as canonical (it is the tested one, 92/92
  umbrella), gate the count à la R3. Two overlapping edge vocabularies (SemanticGraph 13+ vs UBG
  10) — declare UBG's the canonical query vocabulary and map, don't merge stores.
- **ADD** (smallest honest additions): `wall.split` verb (analysis half exists);
  level-elevation verb family (none exists — MEASURED-ABSENT); model-space constraint store
  (component-editor pattern, walls-parallel first); the 5 provenance fields; the BIM3.0
  foundation gate (excavation §16).
- **REPLACE**: **nothing.** No subsystem met the 8-point bar for replacement. The one candidate
  considered — the dual edge vocabulary — is resolved by mapping (GENERALISE), which is smaller,
  migration-free, and keeps snapshot v3 compatible; replacing SemanticGraph would break every
  persisted project for a naming preference.

## 14. Roadmap — 90 days, dependency-ordered

- **Phase A (running now, days 0–30): BIM 2.0 closure.** ADR-0318 per-kind store adoption
  (wall, room, slab first — they gate everything graph-shaped); CA-21 read-backs turning the
  three liveness lies red; persistence round-trip probes (plan §C.2.1) including the
  SemanticGraph section; undo gesture-id decision (founder). *Owned by the three live agents —
  nothing here is new scope.*
- **Phase B (days 20–55, starts when wall+room stores are registry-adopted): graph activation.**
  CONNECT-1 (UBG slot + verbs, born with the §16 gate naming unreachable kinds) → CONNECT-3
  (junction retention) → CONNECT-2 (violates population) → RoomGraphService refusal honesty.
  Exit: the five topology questions answered by executed probes through the runtime service.
- **Phase C (days 45–90): truth and constraints.** Provenance fields + P1-5 fix (same PR — the
  fix IS writing the field); reverse-dependency index (CONNECT-4); `wall.split` + level verbs;
  walls-parallel stored constraint as the solver's model-space pilot; WallIntersectionResolver
  dedup under an R3-style gate. Exit: canonical test below passes.
- **Deliberately after day 90**: persisted-graph merge semantics (needs leg C infra, founder-
  owned); confidence-carrying import pipeline; IfcRel expansion.

## 15. The canonical test + the 8 golden operations

**Canonical test** (the Phase C exit): a fixture building — two levels, stair, six rooms, doors,
windows, roof — driven entirely through bus verbs in a composed headless runtime; then:
rebuild UBG twice → identical snapshots; serialize→restore→rebuild → diff ∅; move one wall →
assert via graph queries that exactly the predicted junction, room, area, and dependency edges
changed and nothing else (prevState diff as the oracle).

| Golden operation | Executed by (today's subsystem, post-CONNECT) |
|---|---|
| Query ("which rooms border the kitchen?") | `graph.neighbors` over UBG (RoomGraph adapter) |
| Impact ("what changes if this wall moves?") | `graph.query` over `dependsOn` + junction index (CONNECT-3/4) |
| Validation ("does this violate anything?") | `violates` edges (CONNECT-2) |
| Geometry ("area of room X?") | room metrics, deterministic (existing) |
| Provenance ("who created this and how?") | origin fields (§7) + `project_command_log` via `revision` |
| Propagation ("move it and keep the model consistent") | the existing spine + occupancy re-check |
| Collaboration ("two users edit adjacent rooms") | **not executable in 90 days** — leg C; stated, not promised |
| Explanation ("why can't the door go here?") | `canPlace` refusal reasons + BuildableEnvelope-style typed refusal surfaced through chat (existing report-honesty path, P0-8 CLOSED) |

Seven of eight map to existing-or-Phase-B/C machinery; the eighth is named as blocked on
founder-owned infra rather than absorbed dishonestly.

## 16. Final verdict — in plain language

PRYZM does not need to become a graph-based BIM system. It already is one — three times over —
and it computes, every session, almost everything BIM 3.0 promises: rooms from walls, the
building as a navigable graph, change propagation with before-states, a real constraint solver,
deterministic generation, and relationship-aware IFC export. What it does not yet do is *admit
it at the surface*: the graph lives behind a dev-hook, junction knowledge is thrown away the
moment it is used, validators shout into logs instead of the graph, provenance is stamped on one
element family out of ten, and almost nothing above the room tier is certified through the
composed runtime. With ADR-0318 committed today, the one structural excuse is gone. Freezing the
architecture costs remarkably little: roughly the 50–75% bracket of BIM 3.0 is reachable by
retention, exposure, unification, and certification of what exists — Level 4 today, Level 5 one
composition slot away, Level 6 one constraint store away. The only things wiring cannot buy are
collaborative graph merge and full provenance history, and both are additions the current
topology accepts. The honest instruction to the next agent is the excavation's, now with the
evidence one layer deeper: **activate, retain, and certify — do not rebuild.**

---

*Not verified in this audit (named, per doctrine): the four commissioned deep-dives (topology
field-level detail, constraint runtime execution, per-schema provenance line proof, change-impact
end-to-end traces) had not reported — every row they would have upgraded is marked BY-READ or
UNPROVEN above; no probe was executed by this agent (greps only); the junction record's exact
field shape, epsilon policy existence, occupancy-store persistence, and triangulation/clash
implementation counts remain UNPROVEN.*
