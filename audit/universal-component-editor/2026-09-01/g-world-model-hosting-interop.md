# LANE G — WORLD MODEL · HOSTING · RELATIONSHIPS · CONNECTORS · VISIBILITY · IFC

**Phase 0 repository archaeology** for `docs/01-strategy/STR-UNIVERSAL-COMPONENT-EDITOR-MASTER-SPEC.md`
§4.2 (Spatial / World Model) · §26–28 (Hosting · Connectors · Visibility) · §34–35 (World Model ·
Queryability) · §70 (IFC / semantic test).
**Stamp:** 2026-09-01 · **Rule obeyed:** spec §1 — NO CODE, NO PRODUCTION FILE MODIFIED. This lane
produced knowledge only.

---

## §G.0 — THE HEADLINE ANSWER

> **Can the World Model answer the spec §35 queries today WITHOUT inspecting meshes?**

**Of the eight named §35 queries: 3 YES · 2 answerable only by store SCAN · 3 NO — and CRUCIALLY,
ZERO of the eight require inspecting a mesh today.** The World Model is already mesh-independent for
everything it can answer; what fails is *vocabulary*, not *architecture*. (Per-query table with
mechanisms: §G.2.)

PRYZM already has the thing the spec §34 asks for and calls it by almost the same name: a
first-class, typed, indexed, persisted, delete-cascading relationship graph
(`SemanticGraphManager`, `packages/core-app-model/src/SemanticGraph.ts`, 1830 lines, **26**
`RelationshipType` members) governed by **three** contracts written specifically about it —
**C71 (Graph & Topology)**, **C78 (Universal Relationship Contract)** and **C79 (Region
Semantics)** — plus CI gates (`check-graph-write-coverage`, run by this lane at **RC=0**, plus
`check-graph-delete-integrity` / `check-graph-persistence` / `check-graph-query-verbs` /
`check-graph-runtime-readback` under `tools/rac-conformance/certification/gates/`).

**The three that CANNOT be answered fall into exactly two causes:**
- **The graph is instance↔instance only.** *"which facade panels depend on this definition"* has no
  answer, and *"which windows use W-1200"* / *"all windows with aluminium frames"* degrade to a store
  scan, because there is **no `instantiates` / `specializes` / `derivedFrom` edge and no
  definition/type NODE** in `RelationshipType`. The type tier itself DOES exist (C65, done for
  wall/door/window) — it is simply not in the World Model.
- **Two subsystems are absent outright:** *"components connected to this MEP connector"* —
  **connectors do not exist at all** (§G.3.1) — and *"components missing fire rating"*, because
  nothing **declares** a property REQUIRED (spec §32 / IDS, §G.3.3).

**The smallest missing piece is therefore NOT a graph.** It is **one node kind and three edge
families on the graph that already exists**: a `definition`/`type` node kind, and the edges
`instantiates` (instance → type), `specializes` (type → definition) and `dependsOnDefinition` —
added under the C71 §2.6 four-obligation addition rule. Everything else in §34/§35 — hosting,
containment, adjacency, boundedness, level-of, persistence, delete cascade, refusal semantics — is
already built, already contracted, already gated and already reachable from production commands.
**Connectors are the one genuinely greenfield subsystem in this lane.**

---

## §G.1 — WHAT EXISTS

### G.1.1 — THE RELATIONSHIP GRAPH (spec §34) — **EXISTS · CONTRACTED · GATED · REACHABLE**

| | |
|---|---|
| **Authority file** | `packages/core-app-model/src/SemanticGraph.ts` (1830 lines) — `SemanticGraphManager`, exported as the module singleton `semanticGraphManager` (`:1824`) |
| **Governing contracts** | **C71 — Graph & Topology** (owns the vocabulary + the six per-edge semantics) · **C78 — Universal Relationship & Consequence Contract** (owns the seventeen A–Q axes + the typed refusal vocabulary §8) · **C79 — Region Semantics** (owns `undetermined`) · ADR-0320 (vocabulary scoped by consumers) · ADR-0321 (`joinedTo`) · ADR-0322 (one consequence contract) · ADR-0325 / **ADR-0328** (`partOf` is a projection) |
| **Shape** | `RelationshipType` = a **26-member closed string union** (`SemanticGraph.ts:46–106`). `Relationship = { id, type, sourceId, targetId, metadata?, authoredBy?, createdAt, createdBy }` (`:108–160`). Two inverted indices (`_bySource`, `_byTarget`), plus per-family **coverage marks** (`_hostsCovered`, `_containsCovered`, `_adjacencyCovered`, `_joinedToCovered`) whose only job is to separate *"nothing"* from *"never written"*. |
| **Maturity** | **High.** Persisted in `ProjectSnapshot.semanticGraph` (schema v3) via `serialize()`/`deserialize()` (`:1658`/`:1682`), rebuilt on load by `packages/persistence-client/src/loader/rebuildSemanticGraph.ts`, purged on delete by `removeAllRelationshipsForElement()` (`:796`) from **53 cascade sites**. |
| **Reachable?** | **YES — 278 non-test call sites** across `packages/command-registry` (~35 Create*/Delete* commands), `packages/persistence-client`, `packages/file-format/src/export/ifc`, `packages/ai-host`, `packages/geometry-wall`, `packages/physics-host`, `apps/editor`. |

**LIVE GATE READING (run by this lane, 2026-09-01, `npx tsx tools/ga-gate/check-graph-write-coverage.ts`) → `RC=0`:**

```
floor  declared RelationshipType members parsed from source: measured 26, min 20 OK
floor  REQUIRED families (C71 §2.1) located in the parsed union: measured 9, min 9 OK
floor  production source files scanned: measured 5219, min 1500 OK
floor  refusal-bearing *Query readers located on SemanticGraphManager: measured 8, min 8 OK
C-INV-1 — PER-TYPE x PER-OBLIGATION MATRIX (REQUIRED nine, C71 §2.1)
  family           writer reader rebuild delete  disposition
  hosts            * 2    * 3    * 1      o53    rebuilt
  hostedBy         * 4    * 1    * 1      o53    rebuilt
  boundedBy        * 2    * 3    * 1      o53    rebuilt
  adjacentTo       * 5    * 3    * 2      o53    rebuilt
  connectedTo      * 6    * 2    * 2      o53    rebuilt
  sitsOn           *19    * 1    * 2      o53    rebuilt
  supports         * 8    * 2    * 2      o53    rebuilt
  contains         * 1    * 3    * 1      o53    rebuilt
  partOf           * 1    * 3    * 1      o53    rebuilt
  joinedTo         * 1    * 7     *       * 1    REGENERATED
C-INV-4 — RATCHET: 0 finding(s) against a NAMED ledger of 0.
-> [0] CLEAN — check-graph-write-coverage: 0 findings, hard-0, no baseline.
```

The gate also prints its own blind spots, which the component editor must not read as coverage:
*"computed-type writes: 9 site(s) write `type: <variable>` and are INVISIBLE to literal scanning"* ·
*"runtime reachability — a writer that exists but is never reached counts as PRESENT"* ·
*"correctness — a writer emitting the WRONG edge passes every arm"*.

**⭐ The single most reusable idea in this subsystem is not the graph — it is the REFUSAL IDIOM.**
Eight readers on `SemanticGraphManager` return a **discriminated `*Query` result**, never a bare
array, because *failure ≠ emptiness* (C71 §4.4):

- `getHostWall(openingId): HostWallQuery` (`:1391`) — `{ok:true,wallId}` |
  `'opening-unknown-to-hostedBy-writer'` | `'multiple-hosts'`
- `getHostedOpenings(wallId): HostedOpeningsQuery` (`:1444`) — `{ok:true,openingIds}` |
  `'wall-unknown-to-hosts-writer'` | `'hosts-hostedBy-pair-broken'`
- `getBoundingWalls` (`:1291`) · `getAdjacentRooms` (`:959`) · `getConnectedRooms` (`:1012`) ·
  `getContainedElements` (`:1061`) · `getJoinedWalls` (`:1085`) · `getElementsSittingOn` (`:1348`)

`getHostWall` refuses rather than guesses, and says why in the message itself:

> *"This is NO ANSWER, not 'it has no host' — a hosted element has exactly one host by contract
> (C15 §1), so 'no host' is never a valid state."*

Spec §75 (*do not fake capabilities*) and §43 (*failures return structured diagnostics*) are already
this repository's house style at the World-Model layer. **Do not re-invent it — extend it.**

### G.1.2 — THE QUERY SURFACE (spec §35) — **EXISTS · ON THE COMMAND BUS**

`packages/ai-host/src/graph/GraphQueryService.ts` (888 lines) is a read-only projection registered
as **three bus verbs** in `apps/editor/src/engine/graphQueryBusHandlers.ts` (`:100`, `:114`, `:128`):

```
graph.query(elementId, relationshipType)      -> the typed edge set
graph.neighbors(elementId, relationshipType?) -> the adjacent elements
graph.path(fromRoomId, toRoomId)              -> the room-to-room route (BFS)
```

Five distinct negative outcomes, never `[]`: `unknown-element` · `graph-unavailable` ·
`unsupported-relationship` (a PARKED family — answering it empty would be C71 §4.3) ·
`hierarchy-not-in-graph` · plus the positive empty `{ok:true, targets:[]}`.
Peers: `packages/ai-host/src/SemanticQueryEngine.ts` (642 lines — natural-language *"what's in wall
X"*, *"rooms without a door"*) and `packages/ai-host/src/WorldModelAdapter.ts` (606 lines — the
read-only building projection handed to the LLM, with `storeReadDetermination.ts` making an
*unreadable store* refuse rather than report an empty building; see its `passRate: number | null`
comment, *"a pass rate nobody computed is not 1"*).

**This is spec §39–45's "AI has contract-controlled access to World-Model context" already built.**

### G.1.3 — THE SPATIAL / WORLD-MODEL SPINE (spec §4.2) — **EXISTS, IN FOUR SEPARATE PIECES**

| Piece | File | What it owns | Reachable |
|---|---|---|---|
| **Level / storey + grid data** | `packages/core-app-model/src/BimKernel.ts` — `BimManager` (`:101`), `Level` (`:39`), `Grid` (`:50`) | *"§02 §1.1 BimManager is the single spatial authority for levels and grids"* | YES |
| **World transform resolution** | `packages/core-app-model/src/SpatialAuthority.ts` (532) | *"the ONLY authoritative way to compute an element's world transform"*; throws `SpatialAuthorityError` rather than falling back to elevation 0 | YES |
| **IFC-aligned 7-level hierarchy** | `packages/core-app-model/src/hierarchy/HierarchyTypes.ts` + `HierarchyStore.ts` + `SyncStateEngine.ts` | `Site->IfcSite · Building->IfcBuilding · Level->IfcBuildingStorey · Unit->IfcZone · Room->IfcSpace · Element->IfcElement · Hosted->IfcElement`. `HierarchyNodeType = 'site'\|'building'\|'level'\|'unit'` | YES |
| **ID -> store routing** | `packages/core-app-model/src/ElementRegistry.ts` — `registerSemantic(id, StoreType)` (`:44` union) | *"a single authoritative ID->store routing table for all PRYZM data"*; `StoreType` = 26-member union | YES — called by every `Create*` command |

⭐ **`packages/core-app-model/src/hierarchy/PartOfProjection.ts` (ADR-0328, founder ruling
2026-08-17) is the pattern the component editor should copy for every derived relationship.**
`partOf` edges are a **one-way PROJECTION** of the authoritative `hierarchyStore.parentId` +
`room.unitId`; `refresh()` *reconciles* — any `partOf` edge the substrate does not imply is REMOVED,
*"including one written directly into the graph by something else. That is the structural guarantee
that no rival hierarchy can come into existence."* The header quotes the ruling verbatim:

> *"parentId = storage/implementation substrate. partOf = graph-level semantic relationship. Do NOT
> create a second independent hierarchy source of truth. Graph projection should be DERIVED FROM the
> hierarchy store rather than maintained independently."*

That is spec §5 (*exactly one authoritative model*) already enforced, mechanically, at the graph
layer. It also carries the §CONTEXT-DATA-HONESTY refinement: `PartOfSubstrateSnapshot.rooms` is
`null` — not `[]` — when the room store is unreadable, so an unreadable substrate cannot cause the
projection to DELETE every edge and call that a derivation.

`ViewDependencyTracker` (`packages/core-app-model/src/views/ViewDependencyTracker.ts:174`) is the
**representation-invalidation** half of §21–22: it maps element -> level and marks only the views on
that level dirty. ⛔ Its `PLAN_RELEVANT` membership Set carries a §-tagged rule
(`§PLAN-MEMBERSHIP-RULE`, Wave 4a/4e, 2026-08-31) that is directly binding on a universal editor:
adding a family to that Set without a plan representation *"ships a family that CLAIMS PLAN AND DRAWS
NOTHING — strictly worse than an honest NO, because the row goes green and the screen does not
change."* The cited audit measured **15 of 29 element families reaching plan view**.

### G.1.4 — HOSTING (spec §26) — **IMPLEMENTED FOR THE WINDOW/DOOR CASE, AND DELIBERATELY NOT GENERALISED**

**Authority: `docs/02-decisions/contracts/C15-HOSTED-ELEMENT-CONTRACT.md` (453 lines).** Machinery:

- `wall.openings[] = { elementId, offset, width, height }`. The **only** element schema in the repo
  declaring an `openings[]` array is `packages/schemas/src/elements/Wall.ts:105`, and `Opening.type`
  at `:37` is `z.enum(['window','door'])` — *"exactly two kinds, on exactly one host"* (C15 §0.1.1).
- **Coordinate model (C15 §2):** the hosted element has **no independent world coordinate in the
  store**. `worldCentre = baseLine[0] + offset × wallDir + (width/2) × wallDir`. ⭐ This is spec
  §26's *"insertion = opening, orientation = host normal"* already canonical, and spec §2's *"geometry
  is GENERATED"* already true for this family.
- ⭐ **C15 §2.1 (2026-08-19, lane JOIN1, L-1271) is the deepest statement of hosting in the
  repository and should be lifted verbatim into the universal model:**

  > *"A hosted element's frame IS its host's frame. Every transform the host carries, the hosted
  > element carries — the arc tangent, the base datum, and the RAKE. There is no hosted-element frame
  > that is a plumb approximation of a leaning host."*

  Its four normative consequences are all directly reusable: `sillHeight`/`height` stay PLUMB and the
  derived along-face companion *"is shown, never stored"*; the leaf is **SHEARED, not rotated**; the
  direction is the **LOCAL STATION TANGENT, never the baseline chord** (L-1068 — *"the fifth copy of
  a rule `hostedElementFrame`'s own header already forbade"*); and *"a change to the host's rake is a
  change to the hosted element's INPUTS, so it must invalidate the hosted element … satisfying this
  by adding 'also rebuild windows' to a list is the weak form; it must follow from the host
  relationship."*
- **Placement gating:** `packages/geometry-wall/src/WallOccupancyStore.ts` (1186 lines) —
  `canPlace(wall, offsetM, widthM)` (`:743`) returns `CanPlaceResult` with a **closed
  `CanPlaceRefusalCode` union of seven members** (`:118`), roster completeness asserted at the type
  level (`:188` `_CanPlaceRosterIsComplete`), and a `Record<CanPlaceRefusalCode,string>` sentence
  table (`:263`) that makes a missing arm a compile error. It also carries `planOpeningRefit` /
  `planOpeningRebase` — a **plan-bound consequence** for when the host shrinks
  (`§FIX-WALL-SHRINK-REFIT`, cited from `packages/command-bus/src/consequence.ts:31`).
- **Graph half:** `hosts` / `hostedBy` are C71 §2.1's *"reference-shape pair"* — the only family with
  both directions, both typed readers, rebuild-from-snapshot, and cascade delete.
- **Gate:** `tools/ga-gate/check-hosted-dual-write.ts`.
- **The other host surfaces (C15 §0.1.1, measured 2026-08-19):** curtain wall = ⛔ NO, its door is a
  **panel kind** (`hostedDoor` on `CurtainPanelData`) located by `cellIndex` whose durable identity
  is the grid-line pair `(uLineId, vLineId)`; lift landing door = ✅ YES *via the shaft wall*, so it
  is the `Wall` row, not a fifth host.
- ⭐ **The rule C15 §0.1.1 encodes, which a universal editor must either adopt or consciously
  overturn:** *"a new host surface joins the `Wall` row only if it can supply all four of §0.1's
  requirements — a record with `openings[]`, a scalar offset along a baseline, a real void cut into a
  host mesh, and participation in the `bim-wall-updated` rebuild path. A surface missing any one of
  the four gets a sibling mechanism, not an amendment to this contract."*

### G.1.5 — ⛔ TRAP: THERE ARE **THREE** HOSTING MECHANISMS, AND C15 §0.1.1 SAYS THE THIRD DOES NOT EXIST

C15 §0.1.1's host-surface table reads, for slab and roof:

> **Slab / floor** — ⛔ **NO — and there is no rival mechanism either.** **No opening model exists.**
> A slab penetration / shaft is **UNBUILT**, not routed elsewhere.
> **Roof** — ⛔ **NO — same.** Rooflights / dormers have **no opening model**. UNBUILT.
> *"⛔ THE SLAB AND ROOF ROWS ARE DECLARED ABSENCES, NOT CLEARANCES (C84 EI-6)."*

**Both rows are FALSE, and both were false on the day they were written.** Measured 2026-09-01:

| Evidence | Reading |
|---|---|
| `packages/core-app-model/src/stores/OpeningTypes.ts:11` | `interface OpeningData extends Omit<CoreElement,'type'> { type:'opening'; hostId: string; profile: {x,y}[]; depth?; baseOffset? }` — **a generic host-id + host-local 2-D profile opening record** |
| `packages/command-registry/src/slabs/CreateOpeningCommand.ts` | exists; last touched **2026-08-10** (`f361cda7`) — *eight days before* the clause |
| `packages/command-registry/src/roofs/CreateRoofOpeningCommand.ts` | exists; **2026-08-18** (`a69faff1`) — *one day before* the clause. Header opens with the founder's ask verbatim: *"I would like to be able to host lucernarios in roofs also — windows hosted on roof planar surfaces of the roof."* |
| `apps/editor/src/engine/CommandRegistry.ts:343` and `:406` | `['CREATE_OPENING', …]`, `['CREATE_ROOF_OPENING', …]` — **both registered** |
| `apps/editor/src/engine/initBusHandlers.ts:2520` | `fn: (cmd) => { _cmExec(new CreateOpeningCommand(cmd)); }` — **bus-reachable** |

**Why the contract got it wrong matters more than the error itself.** C15 §0.1.1 cites its own
measurement: `grep -rn "penetration|shaftOpening|slabOpening" packages/schemas/src` -> zero hits.
**The grep was correct; the vocabulary was wrong.** The third mechanism is not in `packages/schemas`
at all, and is called neither *penetration* nor *shaftOpening* — it is `OpeningData`, in
`core-app-model/src/stores`, reached through `openingStore`. This is
[[grep-silence-has-three-causes]] recurring inside a canonical contract clause.
⛔ **A lane that reads C15 §0.1.1 and builds a slab/roof opening model will build the fourth one.**

⭐ **AND THE FIND IS BETTER THAN THE ERROR** — the `OpeningData` mechanism is the **more general** of
the two, and is far closer to what a universal component editor needs:

| | C15 wall opening | `OpeningData` slab/roof opening |
|---|---|---|
| host reference | *implicit* — membership in `wall.openings[]` | **explicit `hostId` field** |
| location | one scalar `offset` along one axis | **a 2-D `profile` in the host face's own plane** |
| host sub-part | n/a | **`properties.roofFace.index`** — the host is *one planar face of* a roof, resolved BY CONTAINMENT (`resolveHostFace`), *"never by proximity"* |
| authored intent | offset + width + height | ⭐ *"the AUTHORED face-plane rectangle is kept beside it in `properties.roofFace` so the intent survives a slope change"* — **spec §15 design-intent retention, already shipped, for one family** |

The roof command's header states its divergences from C15 explicitly under `§ROOF-HOSTED-OPENINGS`
and never claims C15 covers it. **The defect is in C15, not in the code.** (Recommended: log this as
an ISSUE-LOG row and correct C15 §0.1.1 in place per the "edit the canonical contract" rule — this
lane did not, because §1 forbids modification.)

### G.1.6 — CONNECTORS (spec §27) — **GENUINELY ABSENT. This is the largest gap in Lane G.**

Searches that FAILED, quoted:

```
$ grep -rniE "\bconnector\b" --include=*.ts packages/ plugins/ apps/ src/ | grep -v __tests__
   -> ~30 hits, ZERO of them a building-object connector.
      Every hit is one of: (a) NL grammar "connector words" in
      packages/ai-host/src/intents/{FloorFinishIntent,WallSideFinishIntent,ZeroTokenResolver}.ts,
      (b) a corridor "connector leg/spine" in the apartment + residential layout engines
      (deriveCorridorSpine.ts, objectives.ts §CORRIDOR-CONNECTOR, platePartition.ts),
      (c) one prose line in AIElementFactory.ts describing a lamp part.

$ grep -rniE "insertionPoint|attachmentPoint|\bports\b|anchorPoint" --include=*.ts packages/*/src plugins/*/src apps/*/src
   -> ZERO building-object hits. `ports` is hexagonal-architecture DI in apps/api-gateway/src/ports.ts;
      `anchorPoint` is a local variable in geometry-wall/src/WallIntentResolver.ts:86.

$ grep -rn "\bMEP\b" --include=*.ts packages/*/src plugins/*/src apps/*/src
   -> ZERO MEP components. MEP exists ONLY as: a discipline LABEL
      (packages/building-graph/src/discipline.ts:99 `mep: 'MEP'`), a preview COLOUR
      (core-app-model/src/preview/PreviewStyle.ts:89 `MEP: 0xA855F7`), a VG style
      (VGGovernanceStore.ts:183 name:'MEP'), and floor-plate zone labels in the office
      workflow. There is no MEP element, no MEP store, no MEP command.
```

`servesZone` — the one `RelationshipType` member that would carry an HVAC/system relationship — is
**PARKED** (C71 §2.2): writer 0, reader 0, and the gate's executed control proves writing to it is a
**finding**, not progress (*"PARKED: planted writer against parked 'servesZone' was FLAGGED
writer-first"*).

**What exists that is connector-ADJACENT but is not a connector:**

| Thing | File | Why it is not a connector |
|---|---|---|
| `joinedTo` + `JoinedWallJunction` | `SemanticGraph.ts:196`, `:244` | A wall-to-wall **junction record** carrying `junctionType: 'L'\|'T'\|'Y'\|'X'\|'N-WAY'` and `junctionDegree`. Closest thing in the repo to a typed connection with compatibility semantics — but it is **derived from geometry by `JunctionResolverV2`**, not authored on a definition, and it exists for exactly one element family. |
| `supports` / `sitsOn` | `AssignBeamSupportsCommand.ts:143` | Structural support edges between instances. No connector geometry, no direction, no compatibility rule. |
| curtain-wall cell identity | C87 CW-P-B | `(uLineId, vLineId)` grid-line pair — a durable **slot** identity. Spec §26's *"Curtain panel: host = curtain grid, width/height = host bay"* is the one hosting case that already has a slot abstraction, but it is curtain-wall-private. |
| `C104` lift compound | `docs/02-decisions/contracts/C104-ELEMENT-LIFT-COMPOUND-SYSTEM.md` | A **compound/aggregate** element (§2 drill-in selection, §8 "delete heals every floor plate"). This is spec §25 NESTING, not §27 connectors. |

### G.1.7 — VISIBILITY (spec §28) — ⭐ **THE CLOSEST FIT IN THE WHOLE LANE. BOTH OF THE SPEC'S OWN EXAMPLES ARE EXPRESSIBLE TODAY.**

Spec §28 asks for semantic visibility with two illustrative predicates —
*"visible when DetailLevel ≥ Fine"* and *"visible when PanelCount > 2"* — *"differing per
representation and detail level — not renderer state."* **PRYZM has a rule engine for exactly this
shape, and it is reachable end-to-end.** There are THREE separate pieces, and only one of them is
`packages/visibility`.

**(a) The rule engine — `packages/core-app-model/src/presentation/VisibilityRuleEngine.ts` +
`VisibilityRuleTypes.ts`. REACHABLE.**

```ts
export interface VisibilityRule {
    id: string; label?: string;
    condition: QueryExpression;   // serialisable, AI-readable, AI-writable
    effect:    VisibilityEffect;  // { visible?, fillColor?, edgeColor?, transparency?, lineWeight?, halftone? }
    priority:  number;            // higher wins on conflict
    scope:     'template' | 'model' | 'view';
    scopeId:   string;
    enabled:   boolean;
}
export type QueryExpression =
    | { op:'eq'; field:string; value:unknown } | { op:'neq'; … }
    | { op:'gt'; field:string; value:number }  | { op:'lt'; … }
    | { op:'hasTag'; value:string }
    | { op:'and'|'or'; conditions:QueryExpression[] } | { op:'not'; condition:QueryExpression };
```

⭐ **`{ op:'gt', field:'PanelCount', value:2 } -> { visible:true }` is spec §28's second example,
verbatim, in the existing type.** Evaluation reuses `semanticIndex.evaluateQuery()`
(`VisibilityRuleEngine.ts:174`); `packages/core-app-model/src/IFCPsetAdapter.ts` flattens IFC Psets
into the same field space so `field: 'Pset_WallCommon.FireRating'` resolves. The file's own header
notes *"§04 — AI-readable output; rules authored by LLM via CommandManager"*.

**Reachability, measured:** `VGSceneApplicator.ts:752` calls
`visibilityRuleEngine.resolveForElement(elementId, modelId, viewId)` inside the scene pass; five
undo-able commands author rules (`packages/command-registry/src/vg/{Create,Delete,Update,Toggle}VisibilityRuleCommand.ts`,
`SetInstanceVGOverrideCommand.ts`); `packages/ai-host/src/vg/ViewAuthoringIntentMapper.ts:51` gives
the AI a typed authoring path; `ClearProjectCommand.ts:215` resets it. **This is not a skeleton.**

**(b) DetailLevel — `packages/core-app-model/src/drawing/DetailLevelResolver.ts`
(`§FEAT-DOOR-PLAN-SYMBOL-DETAIL-LEVEL`, L-241 P2). REACHABLE.** The enum
`DetailLevel = 'coarse'|'medium'|'fine'` is owned by **L0 `@pryzm/schemas/view/detail-level`**;
`resolveEffectiveDetailLevel(elementId, viewId, ctx)` is *"the ONE place that answers: at what Detail
Level must element E be drawn in view V?"*, with a five-tier precedence
(per-element override -> per-elementType -> per-category -> `ViewDefinition.output.detailLevel` ->
schema default `'fine'`). Its header states the P7 position explicitly: *"Detail Level is visibility
INTENT (a domain concept), not UI state … deliberately NOT a second per-element `lod` field on the
element record (that is the two-authorities-over-one-pixel collision behind L-223)."*

**Eight production builders consume it, in BOTH 2D and 3D:**
`geometry-window/src/WindowBuilder.ts:533` · `WindowPlanSymbolBuilder.ts:250` ·
`geometry-door/src/DoorBuilder.ts:327` · `DoorPlanSymbolBuilder.ts:287` ·
`geometry-column/src/ColumnPlanSymbolBuilder.ts:156` ·
`geometry-wall/src/WallLayerPlanSymbolBuilder.ts:123` · `geometry-slab/src/SlabFragmentBuilder.ts:1136`.

⭐ **So spec §28's first example — *"visible when DetailLevel ≥ Fine"* — is not a proposal. The
DetailLevel axis exists, is per-view resolved, is P7-clean, is L0-owned, and already selects
different GEOMETRY for windows and doors.** A universal component editor that invents its own LOD
enum would be minting the fork L-241 P1 was created to kill.

**(c) `packages/visibility` (2121 lines) + P7 + gate `tools/ga-gate/check-visibility-intent-not-ui.ts`.**

What it **is**: per-VIEW, per-ELEMENT/CATEGORY/LINKED-GROUP intent.
`LegacyVisibilityIntent = { viewId, verb: 'hide'|'show'|'halftone'|'unhalftone', target: {kind:'element'|'category'|'linkedGroup'} }` (`src/index.ts`), the 11 declared waves
(`src/waves/w01…w11`: level-scope, category-visibility, view-template-inheritance, wall-end-joins,
opening-culling, filter-overrides, phase-filter, temporary-isolation, element-hide, design-option,
ghost-layer), `ViewVisibilityIntentStore.ts` (358), `IsolationIntent.ts` (184),
`visibilityIntentCommands.ts` (198).

**Reachability — split, and the split matters:**
- ✅ **REACHABLE:** `ViewVisibilityIntentStore` + `buildIsolationIntent` are composed in
  `packages/runtime-composer/src/composeRuntime.ts:164–178` and projected onto the scene by
  `visibilitySceneApplier.ts`; `vgGovernanceStore` is consumed by `geometry-door/src/DoorBuilder.ts:62`,
  `DoorPlanSymbolBuilder.ts:43`, `geometry-window/src/WindowBuilder.ts:67`,
  `WindowPlanSymbolBuilder.ts:72`; UI at `apps/editor/src/ui/visibility/VisibilityIntentPanel.ts`.
- ⛔ **AUTHORED BUT UNREACHABLE — the 11 waves.**
  `grep -rn "waves/|applyWave|runWaves|w05-opening" --include=*.ts packages/ apps/ plugins/ src/`
  **excluding `packages/visibility/` itself returns ZERO hits.** The waves are consumed by nothing
  outside their own package. The package header says so in its own words: *"Phase 2B's S34 row
  originally claimed to 'implement waves 3-4'; the Phase 2B audit (2026-04-27) found that the work
  landed under a different label … and the VI waves never shipped."* Scope is stated as *"skeleton;
  full 11-wave port = S49 / Phase 3A"*.

⭐ **THE FIT ASSESSMENT FOR SPEC §28, axis by axis:**

| Spec §28 needs | PRYZM has | Verdict |
|---|---|---|
| visibility as a **domain** concept, not renderer state | P7 + `packages/visibility` + `visibilitySceneApplier` + `DetailLevelResolver`'s explicit P7 note | ✅ **direct hit — do not rebuild** |
| a **serialisable predicate** driving visibility | `QueryExpression` + `VisibilityRule` + `semanticIndex.evaluateQuery` | ✅ **exists and is reachable** |
| *"visible when DetailLevel ≥ Fine"* | `DetailLevel` L0 enum + 5-tier `resolveEffectiveDetailLevel` + 8 builders | ✅ **the axis exists**; ⚠ it is consumed by builders via a `switch`, **not** by a `VisibilityRule` — the two systems do not yet meet |
| *"visible when PanelCount > 2"* | `{op:'gt', field:'PanelCount', value:2}` typechecks today | ⚠ **expressible, but the field space is the element's PROPERTY BAG + IFC Psets — there is no PARAMETER scope to point `field` at** (that is Lane C's territory) |
| the predicate attached to a **DEFINITION** | `VisibilityRule.scope` is `'template'\|'model'\|'view'` — **no `'definition'` and no `'type'` member** | ⛔ **missing — and it is a 1-member union widening, not an engine** |
| differing **per REPRESENTATION** | `w03-view-template-inheritance` / `w06-filter-overrides` declared, **unwired** | ⚠ skeleton only |

**So spec §28's smallest missing piece is NOT an engine.** It is two small joins onto machinery that
already runs: (1) add `'definition'` / `'type'` to `VisibilityRule['scope']` so a rule can live on a
ComponentDefinition; (2) make `resolveEffectiveDetailLevel`'s answer addressable as a `field` in
`QueryExpression`, so *"visible when DetailLevel ≥ Fine"* becomes a rule rather than a `switch` inside
seven builders.

### G.1.8 — DEFINITION / TYPE / INSTANCE (spec §6, §12) — **TWO of the three tiers exist**

**Authority: `C65 — Element Type System` (2026-08-09, founder-requested).** §2 declares four tiers:
**T1 built-in** (app code) · **T2 project** (in the snapshot, user-editable, survives close — *"this
is the founder's requirement"*) · **T3 user library** · **T4 marketplace/family pack**. T3/T4 are
*"DECLARED HERE so the architecture leaves room for them, and are explicitly out of scope until T2 is
complete."*

**AS-IS (C65 §4, verified at the code 2026-08-10) — wall, door, window are DONE on all five axes:**

| Family | Store | C13 project scope | C05 round-trip | Commands | UI authoring |
|---|---|---|---|---|---|
| wall | `@pryzm/geometry-wall` `WallSystemTypeStore` | ✓ | ✓ `wallSystemTypeCodec.ts` | ✓ `elementType.*` bus bridges | ✓ `WallTypeEditorModal` |
| door | `@pryzm/geometry-door` `DoorSystemTypeStore` | ✓ | ✓ `hostedSystemTypeCodec.ts` | ✓ | ✓ `FinishTypeEditorModal` |
| window | `@pryzm/geometry-window` `WindowSystemTypeStore` | ✓ | ✓ `hostedSystemTypeCodec.ts` | ✓ | ✓ `FinishTypeEditorModal` |

The instance→type reference is a plain field: `wall.systemTypeId` (`packages/schemas/src/elements/Wall.ts:108`),
`win.systemTypeId` resolved through `windowSystemTypeStore.getById` (`WindowBuilder.ts:803`, `:1326`).
C65 §3.6 is normative: *"Editing a type affects every instance of it."*

⭐ **So spec §6's `ComponentType → ComponentInstance` half is BUILT for three families and is
undo-able, persisted and project-scoped.** What is missing is the tier **above**: there is no
`ComponentDefinition` — no object that a `WindowSystemType` *specializes*. Today the "definition" is
the hard-coded `WindowBuilder`.

⚠ **A partial exception worth knowing about:** `packages/file-format/src/family-schema.ts` is a
complete Zod schema for a **`.pryzm-family` v1** on-disk format with typed ULID namespaces —
`fam_` / `typ_` / `par_` / `sol_` / `prof_` / `slot_` / `plane_` — i.e. Family, Type, Parameter,
Solid, Profile, MaterialSlot and **ReferencePlane** as first-class identified objects, plus
`FamilyIfcEntitySchema` (an 11-member IFC entity enum) and an `IfcMappingFile`. There is a loader
(`packages/family-loader/src/loadFamily.ts`), migrators
(`packages/file-format/src/family-migrations/`) and an instance baker
(`packages/family-instance/src/bakeFamilyInstance.ts`). ⛔ **Its only non-test consumers are
`apps/bake-worker/src/jobs/RebakeFamilyInstanceJob.ts` and `apps/bench` — `apps/editor` does not
import it.** This is the single largest *authored-but-not-reachable-from-the-editor* asset relevant
to the universal component editor, and Lane A / Lane F should be told it exists before anyone
designs a `ComponentDefinition` schema from scratch.

### G.1.9 — IFC / openBIM (spec §29–33, §70)

**Contracts: `C25 — IFC Export (Production-Grade)` (DRAFT) · `C26 — Revit Round-Trip`.**

⛔ **TRAP — C25 §1.7: THERE ARE TWO EXPORT PIPELINES AND THE CONTRACT GOVERNED THE WRONG ONE**
(added 2026-08-23, lane IFCEXP49, L-8500..L-8560, ADR-0362/0363). Verbatim:

| | **Pipeline A — the shipping path** | **Pipeline B — the contract's subject until 2026-08-23** |
|---|---|---|
| Root | `packages/file-format/src/export/ifc/**` (L3) | `plugins/ifc-export/src/**` (L6) |
| Reached from the UI | ⭐ **YES** — `ExportRailPanel` -> `BimService.exportIfc` -> `exportIFC` | **NO** |
| Why not | — | `runtime-composer/src/ImportExportSlots.ts` throws `RuntimeNotWiredError('ifc.export.run','F.12.4')`; `exportProjectToIFC4X3` has **zero** non-test callers |
| Schema written | **IFC4** (IFC2X3 selectable) | IFC4 / IFC4X3 |
| Geometry | real triangulated mesh | box extrusion only |
| Openings | present | **absent** |

C25's own §1.1 (*"Every export targets IFC4X3, NOT IFC2x3 and NOT IFC4"*) is therefore **FALSE of the
path users actually use** — logged as L-8560. The contract's conclusion is binding on this lane:
**"every claim in this contract must name its pipeline."** ⛔ A universal-editor lane that reads
`plugins/ifc-export/src/exporters/window.ts` and concludes *"window IFC export works"* is reading the
dead pipeline. (IFC **import**, by contrast, IS wired: `ImportExportSlots.ts:51` lazily imports
`@pryzm/plugin-ifc-import` and registers `ifc.import.start`.)

**What Pipeline A maps today (`packages/file-format/src/export/ifc/`, 15 files):**
`IfcSpatialStructure.ts` writes the full `IfcProject -> IfcSite -> IfcBuilding -> IfcBuildingStorey ->
IfcSpace -> IfcZone` chain (C25 §1.3); `IfcSemanticWriter.ts` writes `Pset_PRYZM_Identifiers`
(`PryzmId`, `PryzmSchemaVersion`, `AuthoredBy`), `Pset_PRYZM_Compliance`, and — ⭐ **the World-Model
half** — **`PRYZM_Relationships`**, one property per outgoing `SemanticGraph` edge encoded as
`"type=<RelationshipType>;target=<targetId>"` (capped at 50/element), plus real
**`IfcRelSpaceBoundary`** entities for `adjacentTo`. `packages/schemas/src/ifc/GlobalId.ts` is the L0
GlobalId codec both pipelines import (ADR-0362; before 2026-08-23 Pipeline A wrote a 36-char UUID
into a 22-char field).

**Spec §30 — "the internal model is NOT IfcWindow / IfcPropertySet": ⚠ MOSTLY HELD, TWO LEAKS.**

| Leak | Location | Severity |
|---|---|---|
| `CoreElement.ifcData?: IFCMetadata { guid; ifcClass: string; predefinedType?; psets }` | `packages/core-app-model/src/CoreElement.ts:29–41,:64` | ⚠ **IFC class is carried, stringly-typed, on the canonical element.** Not fatal (it is *optional metadata beside* the model, and it is what makes import round-trip possible) but it is the seam through which IFC becomes internal if a component editor starts branching on `ifcClass`. |
| `IFCPsetAdapter` flattens `Pset_WallCommon.FireRating` into the **same field namespace** that `VisibilityRule.condition` queries | `packages/core-app-model/src/IFCPsetAdapter.ts:5–20`, merged inside `SemanticIndex.evaluateQuery` | ⚠ **IFC vocabulary has entered the RULE language.** A rule authored as `{op:'eq', field:'Pset_WallCommon.FireRating'}` is an IFC-shaped predicate stored in canonical project state. Spec §31's *"properties may reference standardised property definitions rather than display strings"* actually WANTS something like this — but it wants it via a *mapped* property definition, not via a raw Pset string key. |

**Spec §32 (IDS-style machine-readable information requirements, *"✓ Complete / ⚠ Missing required
information" surfaced inside the semantic system, not export-only*): NOT FOUND.** See §G.3.

### G.1.10 — THE `@pryzm/building-graph` (UBG) — a SECOND graph, deliberately

`packages/building-graph` (2558 lines, L2, `graphPhase: GRAPH.1`), contract **C52 — Editable
Building Graph**, ADR-0058 (UBG) + ADR-0061. Its own package.json says it best: *"the canonical
relational node/edge model that PROJECTS the specialised graphs (SemanticGraph / TopologyLayer /
RoomGraphService / DependencyResolver / ConstraintEngine) into one queryable surface."*
Adapters: `semanticAdapter.ts`, `topologyAdapter.ts`, `roomGraphAdapter.ts`, `dependencyAdapter.ts`,
`constraintAdapter.ts`. Also carries `discipline.ts` (Architecture/MEP/Equipment/Spatial with an IFC
hook), `hierarchy.ts` (`projectHierarchy`), `rationale.ts` (`nodeRationale`, `humanNodeLabel`,
`RelationshipSentence` — natural-language explanation of an edge).

**Reachable — YES, but only into the ANALYSIS / overlay surfaces:**
`apps/editor/src/engine/buildBuildingGraph.ts` + `buildingGraphMaintainer.ts` build it;
`apps/editor/src/ui/graph/BuildingGraphOverlay.ts`, `ui/living-graph/LivingGraphOverlay.ts`,
`ui/analysis/*` consume it. It is **derived, not authored** — see the test name
`packages/building-graph/__tests__/ubgSnapshotIsDerivedNotAuthored.test.ts`.

⛔ **C71 §4 — "the three graphs stay separate" is normative, and §4.3 says a reader MUST NOT infer
coverage across graphs.** The gate proves it with an executed control:
*"RECEIVER QUALIFICATION: `roomGraphService.getConnectedRooms` (the RIVAL room-topology graph) earned
NO connectedTo reader credit, while `semanticGraphManager.getConnectedRooms` earned exactly one."*
**A universal component editor must not add a fourth graph.** The correct move is a new *adapter*
into the UBG and new *edge families* on the SemanticGraph, under C71 §2.6.

---

## §G.2 — CAN THE WORLD MODEL ANSWER THE SPEC §35 QUERIES WITHOUT INSPECTING MESHES?

Spec §35's eight named queries, each with the mechanism and the verdict. "Graph" = answerable by
`semanticGraphManager` / `graph.*` bus verbs. "Scan" = answerable from stores without touching a mesh
(still satisfies §35's *"without inspecting rendered geometry"*, but is O(n) and has no edge).

| # | Spec §35 query | Today | Mechanism |
|---|---|---|---|
| 1 | *all windows with aluminium frames* | ⚠ **SCAN** | `Window.frameMaterialId` (`packages/schemas/src/elements/Window.ts:162`) + material lookup. No inverted index; `SemanticIndex` indexes **tags only** (`_byTag`), not properties. |
| 2 | *all windows on Level 02* | ✅ **YES** | `CoreElement.levelId` + `BimManager` `Level.childrenIds` + `elementRegistry` routing. Also `ViewDependencyTracker`'s element→level map. |
| 3 | *which windows use W-1200* | ⚠ **SCAN** | `win.systemTypeId` -> `windowSystemTypeStore` (C65). **Correct answer, wrong layer** — there is no `instantiates` edge, so the World Model cannot traverse it and `graph.query(typeId,'instantiates')` refuses with `unsupported-relationship`. |
| 4 | *which facade panels depend on this definition* | ⛔ **NO** | No `ComponentDefinition` (§G.1.8) and no `derivedFrom` / `dependsOn` edge. `DependencyResolver.ts` exists in core-app-model but resolves *element* dependencies, not definition ones. |
| 5 | *components missing fire rating* | ⛔ **NO (as a REQUIREMENT)** | The *value* is reachable (`Pset_WallCommon.FireRating` via `IFCPsetAdapter`), and `{op:'not',condition:{op:'eq',field:…}}` is expressible — but there is **no declaration that fire rating is REQUIRED**, so "missing" cannot be distinguished from "not applicable". This is spec §32 (IDS) and it does not exist. |
| 6 | *replace all instances of this type* | ✅ **YES for wall/door/window** | C65 §3.6 + the `elementType.*` bus bridge. Not a graph traversal — a store scan on `systemTypeId`. |
| 7 | *components connected to this MEP connector* | ⛔ **NO** | Connectors do not exist (§G.1.6). `servesZone` is PARKED with 0 writers / 0 readers. |
| 8 | *what this wall hosts* | ✅ **YES — the reference implementation** | `semanticGraphManager.getHostedOpenings(wallId)` (`SemanticGraph.ts:1444`), refusal-bearing, consumed by `SemanticQueryEngine`'s *"what's in wall X"* handler and exposed as `graph.query(wallId,'hosts')`. |

**Score: 3 ✅ YES · 2 ⚠ SCAN-only · 3 ⛔ NO.** Crucially, **zero of the eight require inspecting a
mesh today** — the World Model is already mesh-independent for everything it can answer. The failures
are *missing vocabulary*, not *missing architecture*. Note also that queries 1, 3 and 6 are answered
by a **store scan on a plain field**, not by a graph edge: the answers are correct, but the World
Model cannot *traverse* to them, and `graph.query(typeId,'instantiates')` refuses with
`unsupported-relationship` because the member does not exist.

> ### ⭐ THE SMALLEST MISSING PIECE
>
> **Not a graph. Not an engine. Three edge families and one node kind on the graph that already
> exists**, added under the C71 §2.6 addition rule (one PR carrying writer + typed reader + rebuild
> disposition + delete behaviour):
>
> | Add | Direction | First consumer (C71 §2.5 requires one) |
> |---|---|---|
> | `instantiates` | instance -> type | query 3, and `graph.query` stops refusing it |
> | `specializes` | type -> definition | query 4 |
> | `dependsOnDefinition` (or unpark `derivedFrom`) | definition -> definition | query 4, version/upgrade rules (spec §37) |
>
> plus a **`definition` / `type` NODE KIND** so a `ComponentType` id is a graph node at all (today
> the graph is instance-id-only; `elementRegistry.StoreType` already carries the precedent with its
> `slabSystemType` / `ceilingSystemType` / `floorSystemType` members — *"SlabSystemType definitions
> are project configuration (not element instances) so their IDs live in a separate semantic
> namespace"*, `ElementRegistry.ts:36`).
>
> **Connectors (query 7) are a genuinely new subsystem** and are the only part of Lane G that cannot
> be reached by extending something. See §G.3.1.

---

## §G.3 — WHAT IS GENUINELY MISSING (each evidenced by a search that FAILED)

### G.3.1 — CONNECTORS (spec §27) — the one true greenfield subsystem in this lane

```
$ grep -rniE "\bconnector\b" --include=*.ts packages/ plugins/ apps/ src/ | grep -v __tests__
   -> ~30 hits, ZERO a building-object connector (NL grammar words; corridor "connector spine"
      in the layout engines; one prose line about a lamp part).
$ grep -rniE "insertionPoint|attachmentPoint|\bports\b|anchorPoint" --include=*.ts packages/*/src plugins/*/src apps/*/src
   -> ZERO building-object hits (`ports` = hexagonal DI in apps/api-gateway/src/ports.ts;
      `anchorPoint` = a local in geometry-wall/src/WallIntentResolver.ts:86).
$ grep -rn "\bMEP\b" --include=*.ts packages/*/src plugins/*/src apps/*/src
   -> ZERO MEP elements. MEP is a discipline LABEL (building-graph/src/discipline.ts:99),
      a preview COLOUR (PreviewStyle.ts:89), a VG style (VGGovernanceStore.ts:183)
      and floor-plate zone text. No MEP element, no MEP store, no MEP command.
```

`servesZone` — the only vocabulary member that could carry a system relationship — is **PARKED**
(C71 §2.2, gate reading `writer 0 · reader 0`), and C71 §2.5 makes shipping a writer for it *"a
defect, not progress"* until an ADR names its first consumer.

### G.3.2 — A `ComponentDefinition` NODE AND THE THREE DEFINITION-LAYER EDGES

```
$ grep -oE "\| '[a-zA-Z]+'" packages/core-app-model/src/SemanticGraph.ts  (RelationshipType union)
   -> hosts hostedBy connectedTo adjacentTo boundedBy contains sitsOn supports partOf unitOf
      levelOf servesZone connectedByStair connectedByLift joinedTo precededBy supersedes
      branchedFrom causedFailureOf wasMitigatedBy measuredAt exceededBenchmark replacedBy
      maintainedBy decommissionedBefore  (+ decidedBy) = 26
   -> NO instantiates. NO specializes. NO classifiedAs. NO composedOf. NO opensIn. NO fills.
      NO locatedIn. NO references. NO derivedFrom.
```
Spec §34 names sixteen relationship kinds. **Nine of them have no member in PRYZM's union.**
`branchedFrom` is the nearest to `derivedFrom` and is PARKED.

### G.3.3 — IDS-STYLE INFORMATION REQUIREMENTS (spec §32)

```
$ grep -rniE "informationRequirement|requiredProperty|requiredProperties|IdsSpecification|\bIDS spec" --include=*.ts packages/ plugins/ apps/ src/
   -> (end)      # zero hits

$ grep -rn "bSDD\|bsdd" --include=*.ts packages/ plugins/ apps/ src/
   -> packages/plugin-sdk/src/bsdd.ts  (a typed buildingSMART Data Dictionary API client,
      Wave A20-T10, cited to C07 §5 / C05 §3 "Pset lookup from bSDD on selection")
   -> packages/plugin-sdk/src/index.ts:702  (re-exported from the SDK barrel)
   -> and NOTHING ELSE.  ⛔ AUTHORED BUT UNREACHABLE — zero consumers, in or out of tests.

$ grep -rniE "uniclass|omniclass" --include=*.ts packages/ plugins/ apps/ src/
   -> 2 hits, both PROSE: AnnotationTypes.ts:129 ("e.g. IFC classification codes, Uniclass
      references" — a free-form `Record` field) and KeynoteTool.ts:10. No classification
      REFERENCE model; spec §33's "never uncontrolled text" is not held.
```
So spec §31's *"properties may reference standardised property definitions"* has a **client but no
model**, and spec §32's requirement declaration has neither. There is a *validation* engine (`packages/ai-host/src/RuleEngine.ts`) and a *compliance* engine
(`@pryzm/constraint-solver/compliance`, surfaced by `WorldModelAdapter.ComplianceContext`), and
`IfcSemanticWriter` writes `Pset_PRYZM_Compliance`. What does not exist is a **declarative,
per-semantic-class statement that property X is REQUIRED with enumeration/unit Y**, which is what
turns "the field is empty" into "⚠ Missing required information".

### G.3.4 — A GENERALISED HOST-RULE MODEL

Host rules are **hard-coded per family in three different mechanisms** (§G.1.4/§G.1.5), and C15
§0.1.1's closing rule is an explicit decision NOT to generalise: *"A surface missing any one of the
four gets a sibling mechanism, not an amendment to this contract."* There is no
`HostingCapability { host: 'Wall'|'Floor'|'CurtainGrid', insertion, orientation, … }` object anywhere.

### G.3.5 — VISIBILITY AT DEFINITION SCOPE, AND THE 11 UNWIRED WAVES

```
$ grep -rn "waves/|applyWave|runWaves|w05-opening" --include=*.ts packages/ apps/ plugins/ src/   [excluding packages/visibility/]
   -> (end)      # zero hits
```
`VisibilityRule['scope']` is `'template' | 'model' | 'view'` — no `'definition'` and no `'type'`.

---

## §G.4 — WHAT IS REUSABLE, AND HOW

Ordered by leverage. **Every row is REACHABLE in production unless marked.**

| # | Reuse this | For spec | How |
|---|---|---|---|
| 1 | **`SemanticGraphManager` + the C71 §2.6 addition rule** | §34, §35 | Add `instantiates` / `specializes` / `dependsOnDefinition` as new `RelationshipType` members. **Do not build a component graph.** One PR each, carrying writer + typed reader + rebuild disposition + delete behaviour, or `check-graph-write-coverage` refuses it. |
| 2 | **The refusal idiom** (`HostWallQuery`, `JoinedWallsQuery`, `BoundingWallsQuery`, `GraphQueryService`'s five negative outcomes) | §43, §71–73, §75 | Every new World-Model reader returns a discriminated result. Spec §73's *"`GeometryStatus = Invalid` with structured diagnostics"* is the SAME shape — reuse `CanPlaceRefusalCode`'s closed-union-plus-completeness-assert pattern (`WallOccupancyStore.ts:118,:188,:263`) rather than inventing an error enum. |
| 3 | **`VisibilityRule` + `QueryExpression` + `semanticIndex.evaluateQuery` + `VGSceneApplicator`** | §28 | Widen `scope` to include `'definition'`/`'type'`. `{op:'gt',field:'PanelCount',value:2}` already typechecks. |
| 4 | **`DetailLevelResolver` + L0 `@pryzm/schemas/view/detail-level`** | §21–22, §28 | The `coarse\|medium\|fine` axis and its 5-tier precedence already drive 8 builders. ⛔ **Do not mint a second LOD enum** — L-241 P1 exists specifically to kill a three-way spelling fork, and L-223 is the two-authorities-over-one-pixel collision. |
| 5 | **C15 §2.1's host-frame rule** | §26 | *"A hosted element's frame IS its host's frame."* Lift verbatim as the universal hosting invariant, including its four consequences (plumb dimensions + shown-not-stored derived companion; shear-not-rotate; local station tangent not baseline chord; invalidation keyed on the host relationship, not on an event list). |
| 6 | **`OpeningData` (`hostId` + host-local 2-D `profile` + `properties.roofFace`)** | §26, §15 | This is the generic hosting record the spec wants, already shipping for slabs and roofs. Generalise THIS, not `wall.openings[]`. Its `properties.roofFace` — *"the AUTHORED face-plane rectangle kept beside the projected one so the intent survives a slope change"* — is design-intent retention already implemented. |
| 7 | **`WallOccupancyStore.canPlace` + `planOpeningRefit`/`planOpeningRebase`** | §26, §71–73 | The insertion-rule + plan-bound-consequence pattern. Its seven-member refusal roster is compile-time complete. |
| 8 | **`PartOfProjection` (ADR-0328)** | §5, §34 | The *"derived, never authored beside"* projection with a reconciling refresh. Use it for every relationship whose truth lives in a field. Includes the `rooms: null` honesty pattern. |
| 9 | **C65 T1–T4 tiering + `elementType.*` bus verbs + the system-type codecs** | §6, §12, §23–24 | The ComponentType tier. `ComponentDefinition` slots ABOVE `WallSystemType`, not beside it. C65 §3.4 (*"a MISSING type MUST be visible, never a silent default"*) is directly spec §75. |
| 10 | **`packages/core-app-model/src/hierarchy/` (7-level IFC-aligned) + `SpatialAuthority` + `BimManager`** | §4.2 | Project/Site/Building/Storey/Zone/Space already exist and already map to IFC. A component instance's spatial context is `levelId` + `SpatialAuthority.resolveWorldTransform`. |
| 11 | **`IfcSemanticWriter`'s `PRYZM_Relationships` pset + `IfcRelSpaceBoundary`** | §29–33, §70 | The mapping direction is already `PRYZM -> IFC`, driven off `semanticGraphManager.getAll()`. New edge families flow through it for free. ⛔ Extend **Pipeline A** (`packages/file-format/src/export/ifc/`). |
| 12 | **`@pryzm/building-graph` adapters** | §35 | If the component editor needs a unified query surface, add an adapter — the package exists precisely to project specialised graphs into one. ⛔ C71 §4: the three graphs stay separate; do not add a fourth. |
| 13 | **`packages/file-format/src/family-schema.ts` + `family-loader` + `family-migrations` + `bakeFamilyInstance`** ⚠ **not reachable from `apps/editor`** | §6, §7, §9, §16, §47–56 | A complete `.pryzm-family` v1 model with typed ULIDs for Family/Type/Parameter/Solid/Profile/MaterialSlot/ReferencePlane, an IFC entity enum, an `IfcMappingFile` and a versioned migration framework. **Read this before designing a `ComponentDefinition` schema.** |
| 14 | **`ViewDependencyTracker`** | §21–22, §71 | Element→level→dirty-view invalidation. ⛔ Obey `§PLAN-MEMBERSHIP-RULE`: a family joins `PLAN_RELEVANT` only when something actually draws it. |
| 15 | **`tools/rac-conformance/certification/gates/`** — `check-graph-delete-integrity` · `check-graph-persistence` · `check-graph-query-verbs` · `check-graph-runtime-readback` (+ `__tests__/graphdelete.cert.ts`, `graphmove.cert.ts`, `graphruntime.cert.ts`) | §74 | The World-Model regression harness already exists, including an **executed** move-time invalidation control that caught `boundedBy` going stale after a real wall move. New edge families should join these certs. |

---

## §G.5 — TRAPS: the §-tags and in-code corrections a newcomer will trip over

Ordered by how expensive the mistake is.

### T-1 ⛔ `C15 §0.1.1` says slab and roof openings are **UNBUILT**. They are built, registered and bus-reachable.
Full evidence in §G.1.5. The contract's grep searched `packages/schemas/src` for
`penetration|shaftOpening|slabOpening`; the mechanism is `OpeningData` in
`packages/core-app-model/src/stores/OpeningTypes.ts`. **Cost of tripping: building a fourth opening
model.** *(Recommend an ISSUE-LOG row + an in-place C15 §0.1.1 correction; this lane did not make it
— spec §1.)*

### T-2 ⛔ `plugins/ifc-export/**` IS DEAD CODE. The shipping exporter is `packages/file-format/src/export/ifc/**`.
C25 §1.7. `runtime-composer/src/ImportExportSlots.ts` throws
`RuntimeNotWiredError('ifc.export.run','F.12.4')`; `exportProjectToIFC4X3` has zero non-test callers.
C25 calls this *"the third recurrence inside this one file"* of a contract stamped against one
artefact while a different artefact does the work. **Every IFC claim must name its pipeline.**
Corollary: C25 §1.1's *"every export targets IFC4X3"* is false of the user path, which writes IFC4
(L-8560, open).

### T-3 ⛔ PARKED ≠ MISSING. Writing to a parked edge family is a DEFECT, not progress.
C71 §2.2 parks twelve families; **§2.3**: *"No coverage census, status document, audit or roadmap may
count a parked family as 'missing capability'."* **§2.5**: unparking requires *an ADR that names the
first CONSUMER* — *"A writer-first unparking is forbidden… shipping a writer against a parked type is
a defect, not progress."* The gate enforces it with an executed control
(*"planted writer against parked 'servesZone' was FLAGGED writer-first"*). **§2.4**: parked members
may **not be deleted** — `deserialize` breaks on any v3 snapshot carrying one.
⭐ For a component editor this means: **`instantiates` cannot be added writer-first.** The reader and
its computation ship in the same PR (§2.6, four obligations).

### T-4 ⛔ THERE ARE THREE GRAPHS AND THEY MUST STAY SEPARATE. Two of them expose a method with the SAME NAME.
`semanticGraphManager.getConnectedRooms` (`SemanticGraph.ts:1012`) and
`roomGraphService.getConnectedRooms` (used at `packages/ai-host/src/rooms/RoomWorldModelAdapter.ts:112`)
are **different graphs answering with different data**. C71 §4 owns *"the three graphs stay
separate"*; §4.3 forbids inferring coverage across them; the gate proves it with a receiver-qualification
control. `packages/room-topology/src/TopologyLayer.ts` is the third. `@pryzm/building-graph` is the
sanctioned *projection* of all of them — **not a fourth graph.**

### T-5 ⛔ `?.` ON A METHOD THAT NEVER EXISTED SILENTLY RETURNS `undefined` — AND HID A WHOLE UI GROUP.
C71 §0's fourth measured failure: `HierarchyTreePanel` called `sg.getEdgesFromNode?.(…) ?? []` against
a method `SemanticGraphManager` **has never had**, so *"the hierarchy tree's Furniture group has never
rendered"*; `SpeculativeEngine` had the identical shape on `getEdges`. **Both are now fixed**
(`apps/editor/src/ui/dataworkbench/HierarchyTreePanel.ts:597` `§FIX-SGM-GLOBAL-TYPE` (W2-4);
`packages/command-registry/src/furniture/CreateFurnitureCommand.ts:240` records the history). ⛔ The
SHAPE is the trap, not the two sites: **an optional call against an untyped `window` global is
indistinguishable from an empty result.** Any component-editor code reaching the World Model through
`window.*` must be typed at the seam.

### T-6 ⛔ A WRITER CENSUS GRADES A DEAD EDGE HEALTHY.
C71 §0: *"`sitsOn` was the most-written edge in the graph and had no typed reader at all — nearly
every element kind emitting it on creation, nothing consuming it. **A writer census alone graded it
healthy. It was not.**"* And the inverse: *"`contains` is … read by production, written by nobody
first-party. On any native project, 'this room contains nothing' and 'nobody ever wrote this edge'
are the **same answer**."* Both are closed now (gate: `sitsOn` 19w/1r, `contains` 1w/3r) — **but the
lesson is the method.** Cite the gate, never a grep count.

### T-7 ⛔ EDGE IDENTITY IS METADATA-BLIND BY DEFAULT, AND THAT IS WRONG FOR ONE SHAPE.
`§FIX-CONNECTEDBY-EDGE-KEYING` (ADR-0322, `SemanticGraph.ts:120–170`). `addRelationship` collapses on
`(sourceId, targetId, type)`. Correct for `adjacentTo`/`boundedBy`/`joinedTo`. **Wrong for an edge
whose ENDPOINTS are not its subject** — `connectedByStair`/`connectedByLift` join two LEVELS and name
the stair only in metadata, so two stairs collapsed onto one edge and deleting either stranded the
survivor. Such a family passes `authoredBy: <stairId>`. **Membership test, quoted:** *"does the edge's
(sourceId, targetId) pair identify the edge's SUBJECT?"* ⭐ **`instantiates` (instance→type) passes;
a future `connectsVia(connector)` edge would NOT** — it must be `authoredBy`-keyed from day one, and
`authoredBy` must survive `serialize()`/`deserialize()` or edges re-collapse on reload.

### T-8 ⛔ FAILURE ≠ EMPTINESS, EVERYWHERE, AND `[]` IS THE MOST EXPENSIVE VALUE IN THIS REPO.
C71 §4.4 · C78 §8 · C79 §5.2 · C70 L-INV-1. The graph carries **coverage marks** (`_hostsCovered` …)
that exist *only* to tell "nothing" from "never written"; `getBoundingWalls` splits *undetermined*
into `boundary-undetermined-after-element-move` vs `-delete` because *"after a move the element MIGHT
still bound the room, after a delete it PROVABLY cannot, and a reason string saying 'moved' about a
deletion would be a false name for the cause."* ⚠ **Coverage marks are DERIVED and are NOT
SERIALIZED** — after a restore-from-slice, `getHostedOpenings` refuses with
`wall-unknown-to-hosts-writer` until a writer runs. That refusal is correct; a component editor must
not "fix" it by defaulting to `[]`.

### T-9 ⛔ `partOf` IS A PROJECTION AND MUST NOT BE WRITTEN DIRECTLY.
ADR-0328 supersedes ADR-0325 ¶1(part)/¶2/¶4. `PartOfProjection.refresh()` **removes** any `partOf`
edge the substrate does not imply — *"an independent write does not survive the next read."* Writing
`partOf` from a component command is a write that silently disappears. `unitOf` / `levelOf` remain
PARKED and `GraphQueryService` still refuses them with `hierarchy-not-in-graph`.

### T-10 ⛔ `packages/visibility`'s ELEVEN WAVES ARE NOT WIRED. The reachable visibility machinery is elsewhere.
`grep -rn "waves/|applyWave|runWaves" … excluding packages/visibility/` → **zero hits.** Package
header: *"the VI waves never shipped … skeleton; full 11-wave port = S49 / Phase 3A."* The parts that
DO run are `ViewVisibilityIntentStore` + `buildIsolationIntent` (composed in `composeRuntime.ts:164–178`,
projected by `visibilitySceneApplier.ts`), `vgGovernanceStore`, `VisibilityRuleEngine` +
`VGSceneApplicator.ts:752`, and `DetailLevelResolver`. **Do not evaluate "PRYZM's visibility" by
reading `packages/visibility` alone.**

### T-11 ⛔ C15 §6 NAMES AN ERROR TYPE THAT DOES NOT EXIST.
C15 §0.0 (2026-08-18): `grep -rn "OpeningsChildrenMismatchError" … | wc -l` → **0**. *"Any handler
written to `catch (e) { if (e instanceof OpeningsChildrenMismatchError) … }` against this clause is a
branch that can never be entered."* §6 is NOT-YET-TRUE. §0.0 also leaves **§13 (a certified hardening
fix reportedly removed) UNPROVEN** and **§9's four mandated span attributes UNMEASURED** — *"an
unverified row left blank reads as 'fine' and is indistinguishable from 'nobody looked'."*

### T-12 ⛔ CURTAIN WALL IS THE WORST-CONDITIONED FAMILY TO GENERALISE FROM.
C87 §2: *"There are **FOUR** representations, and they disagree on field names."* §9: **three
incompatible panel vocabularies** — L0 `PanelKind` (4 members), geometry `PanelType` (13 members),
material-bridge slots (6) — and a 2026-08-19 re-measure found the 4-member kind is itself
*"transcribed FOUR TIMES, INDEPENDENTLY."* Spec §26 names *"Curtain panel: host = curtain grid"* as a
hosting case; **model it from C15 + `OpeningData`, then reconcile C87 — not the reverse.**

### T-13 ⛔ TWO RIVAL PAIRS OF DOOR/WINDOW SYSTEM-TYPE STORES.
C65 §4: *"There is a SECOND, divergent pair of door/window system-type stores in
`packages/core-app-model/src/stores/` (older shapes, no `dimensions` field). Production persistence,
builders and pickers all use the `geometry-door` / `geometry-window` singletons; the core-app-model
pair is §3.5 drift-in-waiting."* **Import the `geometry-*` singleton.**

### T-14 ⚠ AN UNRESOLVABLE `systemTypeId` FALLS BACK TO INLINE PARAMETERS WITH A CONSOLE WARNING.
`packages/geometry-window/src/WindowBuilder.ts:803–806`. C65 §3.4 is normative in the other
direction: *"A MISSING type MUST be visible, never a silent default."* A console warning is not
user-visible. For a universal editor this is spec §75 and spec §73 territory — the instance should
carry an explicit invalid/unresolved status, not a silent geometry substitution.

### T-15 ⚠ THE bSDD CLIENT EXISTS AND NOTHING USES IT.
`packages/plugin-sdk/src/bsdd.ts`, re-exported at `plugin-sdk/src/index.ts:702`, **zero consumers**.
Spec §31 wants exactly this. Do not write a second one; wire this one, or record why it was rejected.

### T-16 ⚠ C104 §0.2 DEPENDS ON C103, WHICH IS AN UNMINTED CONTRACT SLOT.
Per CLAUDE.md, `C103` is *UNMINTED-AND-CITED* (L-7060, OPEN) — five source files plus C104 §0.2 cite
it. The lift compound (spec §25 nesting, the closest thing to a composite component in the repo) is
governed partly by a contract that does not exist.

### T-17 ⚠ THE GRAPH GATE'S OWN BLIND SPOTS, PRINTED BY THE GATE.
*"computed-type writes: 9 site(s) write `type: <variable>` and are INVISIBLE to literal scanning"* ·
*"runtime reachability — a writer that exists but is never reached counts as PRESENT"* ·
*"correctness — a writer emitting the WRONG edge passes every arm"* · *"move-time invalidation —
NO ARM HERE, and no static arm is possible"* (measured instead by
`tools/rac-conformance/certification/__tests__/graphmove.cert.ts`, whose FIRST reading found
`boundedBy` **stale after a real wall move**; the second, post-`§GR12-BOUNDARY-INVALIDATION`, found it
correctly invalidated). ⛔ **`check-graph-write-coverage` RC=0 does not mean the graph is correct.**
It means every REQUIRED family has a writer, a reader, a rebuild and a delete.

---

## §G.6 — SUMMARY FOR THE §81 AUDIT (lane G rows)

**1. What PRYZM already has (lane G):** a typed, persisted, delete-cascading, refusal-bearing
**relationship graph** with 26 families, 9 of them fully covered and CI-gated; a **bus-exposed query
surface** (`graph.query/neighbors/path`) with five distinct negative outcomes; a **7-level
IFC-aligned spatial hierarchy** plus a single spatial-transform authority; **hosting** implemented
three ways (wall `openings[]`, generic `OpeningData{hostId, profile}`, curtain-wall cell) with a
compile-time-complete placement refusal roster; a **rule-driven, AI-authorable, undo-able visibility
engine** over a serialisable `QueryExpression`, plus an L0 `DetailLevel` axis consumed by eight
builders; a **project-scoped element TYPE system** (C65) done for wall/door/window; and a **live IFC
export pipeline** that already writes the SemanticGraph out as `PRYZM_Relationships` + real
`IfcRelSpaceBoundary`.

**2. What can be reused:** see §G.4 — 15 named assets, 13 of them reachable today.

**3. What is missing:** connectors (greenfield, §G.3.1) · the `ComponentDefinition` node and three
definition-layer edges (§G.3.2) · IDS-style requirement declarations and a classification-reference
model (§G.3.3) · a generalised host-rule object (§G.3.4) · definition-scoped visibility (§G.3.5).

**6. Proposed contract changes (lane G's list, for §81 item 6):**
- **C71** — add `instantiates` / `specializes` / `dependsOnDefinition` to §2.1 REQUIRED, each with its
  named consumer, under the §2.6 four-obligation rule; extend §1.2's six semantics to a **node kind**
  axis (the graph is currently instance-id-only).
- **C15 §0.1.1** — CORRECT the slab and roof rows (T-1); they are the strongest existing model for
  generic hosting and the contract calls them UNBUILT.
- **C15 §0.0 / §6** — mint `OpeningsChildrenMismatchError` or restate §6.
- **C65** — add the **T0 / Definition** tier above T1–T4, or state explicitly that
  `ComponentDefinition` is a new contract.
- **C25** — resolve §1.7 (Pipeline A gains IFC4X3, or B is wired and A retired) before any component
  IFC mapping is designed against it.
- **A NEW CONTRACT for connectors** — there is nothing to amend.

**⚠ WHAT THIS LANE DID NOT MEASURE, stated so a blank is not read as "fine":**
- The runtime **reachability** of individual graph writers (the gate cannot see it, and this lane ran
  no browser session). *Authored ≠ wired* applies to every "REACHABLE" claim above that rests on an
  import-graph rather than an executed control.
- `check-graph-delete-integrity`, `check-graph-persistence`, `check-graph-query-verbs` and
  `check-graph-runtime-readback` were **located but NOT RUN** (only `check-graph-write-coverage` was
  executed). Their debt-json files exist
  (`tools/rac-conformance/certification/gates/graph-{delete-integrity,persistence}-debt.json`), so
  they are ratchets, not hard-0 — **do not inherit a green from this document.**
- **Materials, parameters, formulas, constraints, geometry kernel, undo/transactions and the Window /
  Wall Profile editors are OUT OF LANE G** and are covered by lanes A–F in this same directory
  (`a-semantic-and-element-model.md`, `b-geometry-model-and-kernel.md`,
  `c-parameters-formulas-constraints.md`, `d-commands-transactions-persistence.md`,
  `e-ai-rac-authoring.md`, `f-window-and-wall-editors.md`).
