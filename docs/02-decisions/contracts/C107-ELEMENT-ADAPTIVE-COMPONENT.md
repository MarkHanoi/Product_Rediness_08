# C107 — ELEMENT: ADAPTIVE COMPONENT

> **Stamp**: 2026-08-24 · **Lane**: ADAPTIVE34 · **Status**: CANONICAL
> **Ratified by**: [ADR-0370](../adrs/ADR-0370-an-adaptive-component-is-its-own-kind-and-stage-1-does-not-re-solve.md)
> **Binds**: C84 (Element Integrity) §6's twelve mandatory sections · C11 (element creation) ·
> C16 (command authoring) · C67 + C68 (chat onboarding) · C71 (relationships) · C106 (the host
> precedent this contract copies)
> **Family**: the point-driven element — an architect names reference points on existing
> geometry and a customisable, layerable element is built through them.

---

## §0 — WHAT THIS IS, AND THE ONE SENTENCE IT DEFENDS

The founder, verbatim:

> *"I want a new category under a new tab: like ARCHITECTURE — STRUCTURE — ADAPTIVE COMPONENTS.
> This is a flexible adaptive element. **I define the points from walls, slabs and core systems
> and it creates a 'wall'** which I can then customise and create layers. This can be done in
> plan view / 3D view etc. The goal is to create elements as I did, quickly."*

And, correcting it the same day:

> *"the adaptive component **doesn't need to become a wall afterwards — not for now**"*

⭐ **The sentence this contract defends:** *an architect names points on geometry that already
exists, and gets back an element that is hers to customise and layer — which stays an adaptive
component.*

### §0.1 — THE AS-IS IS **ABSENT**, NOT UNREACHABLE, AND THAT DISTINCTION WAS MEASURED

C01 §6 rule 6 requires absence be distinguished from unreachability, because this repository's
dominant failure mode is the second one — **fifteen built-but-unreachable surfaces were found in
the session preceding this contract**. So absence was measured rather than assumed, across all
four C84 §3.5.1 axes plus the second worktree and `git grep HEAD`:

| Pattern | Hits |
|---|---|
| `AdaptiveComponent` · `adaptiveComponent` · `adaptive-component` · `ADAPTIVE_COMPONENT` | **0** |
| `adaptivePoint` · `adaptivePlacement` · `placementPoint` | **0** |
| `PointBasedFamily` · `pointBased` · `point_based` | **0** |
| `FlexibleComponent` · `ParametricComponent` | **0** |
| `placeByPoints` · `multiPointPlacement` · `controlPointDriven` · `shapeHandlePoint` | **0** |

`plugins/` contains the string `adaptive` **zero times**. All ~290 repo-wide occurrences are one
of eight unrelated senses — per-frame drain budgeting (`WallFragmentBuilder.ts:531`), the camera
near plane (`packages/core-app-model/src/navigation/adaptiveNearPlane.ts`), LRU cache sizing,
image thresholding, arc tessellation density, chunk sizing, CFD resolution, or Stripe Adaptive
Pricing. The only trace of the *concept* is the phrase "adaptive panels" in three lines of
non-shipping agent scratch text under `.agents/attached_assets/`, where it is scoped as proposed
Phase-3 façade work.

> ⭐ **There is nothing to reach. This family is honestly unbuilt** — no code, no dead code, no
> feature flag, no schema field, no menu entry, no test, no spec, no prior ADR. **§10 and §11
> below are therefore a BUILD, not a repair**, and every AS-IS cell in this contract that reads
> `ABSENT` is a measured verdict rather than an unfilled blank.

### §0.2 — THE DECISION THIS CONTRACT ENCODES, AND THE ONE IT REFUSES

[ADR-0370](../adrs/ADR-0370-an-adaptive-component-is-its-own-kind-and-stage-1-does-not-re-solve.md)
rules two things. They are separable and must not be collapsed:

1. **The element is its OWN KIND.** It does not convert to a wall. An earlier lane brief chose
   "a generator that emits ordinary walls"; the founder overruled it.
2. ⛔ **Stage 1 captures its points ONCE. It does NOT re-solve when a reference moves.**

**§0.2-a — NAMING DISCLOSURE, BINDING.** The name says *adaptive*; **stage 1 does not adapt**,
and §12 R-1 records that plainly. A family named for a behaviour it does not have is the
naming-vs-behaviour defect this repository logs repeatedly. **The UI copy, the palette tooltip
and the property panel MUST NOT claim the element follows its references until §11 D-6 lands.**

---

## §1 — IDENTITY

| | AS-IS | TO-BE |
|---|---|---|
| canonical `elementType` | **ABSENT** | `adaptive-component` — ONE spelling, minted with the family, so §4E's multi-spelling tax is never incurred |
| L0 schema | **ABSENT** | `packages/schemas/src/elements/AdaptiveComponent.ts` — `AdaptiveComponentSchema`, branded `AdaptiveComponentId` |
| bus verb namespace | **ABSENT** | `adaptiveComponent.create` · `.update` · `.delete` · `.move` |
| geometry package | **ABSENT** | `packages/geometry-adaptive-component/` (L2) |
| plugin | **ABSENT** | `plugins/adaptive-component/` (L6) |

⭐ **§1.1 — ONE SPELLING, DECIDED NOW.** C84 §4E records element-type tagging drift as the thing
delete-routing depends on, and C101 §1 records **four vocabularies over one family** as the
annotation family's headline defect. Both were acquired by accretion. This family starts with one
tag and **§9 forbids a second**.

---

## §2 — STORES, AND WHICH ONE IS THE AUTHORITY

**AS-IS: no store exists.**

**TO-BE — ONE store, `AdaptiveComponentStore`, and it is the authority (C84 EI-1).** C106 §1
established the precedent and made it CHECKABLE with a scanner that fails on a second
`class …Store` or any `window.*Store` assignment. **This family adopts that scanner verbatim**
(§11 D-4).

### ⭐⭐ §2.3 — THE REFERENCE-CAPTURE SEAM, AND THE ASYMMETRY THAT DECIDES §0.2

**This is the measurement that governs the whole contract.** *"I define the points from walls,
slabs and core systems"* requires the authoring gesture to learn **which element a point came
from**. The two drawing surfaces answer that question differently, and they are separate systems:

| | 3-D — `SnapManager` (`packages/snapping`) | PLAN — `PlanSnapEngine` (`packages/core-app-model/src/views/`) |
|---|---|---|
| candidate type | `SnapCandidate` | internal `SnapCandidate` |
| **element identity** | ⭐ **`sourceId`, `sourceType`, `levelId`, `levelScope`, `metadata`** — populated by every provider | ⛔ **`sourceId` only, and ONLY for grids** |
| wall references | `WallSnapProvider` → `sourceType: 'wall'`, `levelId` | `endpoint`/`midpoint`/`perpendicular` — **no id** |
| slab references | `SlabSnapProvider` → `sourceType`, `levelId` | **no id** |
| grid references | `GridSnapProvider` | `sourceId: gl.id` (`PlanSnapEngine.ts:461`, `:475`) |

**MEASURED at `f159ed7a`.** `PlanSnapEngine` constructs **eleven** snap candidates. Exactly
**two** carry a `sourceId` — `:461` `grid-line` and `:475` `grid-intersection`. The nine that come
from real building geometry carry none: `endpoint` (`:263`, `:267`, `:367`), `midpoint` (`:280`),
`perpendicular` (`:386`, `:422`), `nearest` (`:432`), `intersection` (`:444`). **The engine walks
the wall to compute the endpoint and discards which wall it was before returning.**

> ⭐⭐ **THE CONSEQUENCE, AND IT IS THE REASON STAGE 1 IS (i):** a live reference — `(hostId,
> segmentIndex, t, offset)`, the parametric anchor [C106 §3.2](./C106-ELEMENT-CONSTRUCTION-BOUNDARY-LINE.md)
> already proved out — **cannot be stored from a plan-view gesture, because the host id never
> arrives.** In 3-D it can. The founder requires **both** surfaces (*"plan view / 3D view etc."*).
>
> ⛔ **Shipping live references in 3-D only would create a family whose two creation paths produce
> STRUCTURALLY DIFFERENT records** — one that follows its host and one that cannot. That is C11's
> signature failure and this repo has hit it **eight** times (L-239 wall layers · L-240 floor-finish
> inner face · L-243 stair config · L-246 the plan cut · L-251 the mitre · L-255 the finish modal ·
> L-260 the door · and the mode gate in `elementCreationMatrix.ts`'s own header). The cure is always
> the same and C107 adopts it in advance: **resolve the reference ONCE, BELOW the tools, so plan,
> 3-D, batch and AI inherit one truth** — which means **the plan engine must be taught to carry
> identity BEFORE any live-reference behaviour ships** (§11 **D-5**, the gate on D-6).

### §2.4 — ⭐ ONE PREREQUISITE IS ALREADY CLOSED, AND IT WAS A LIVE PRODUCTION DEFECT

**L-10660 · FIXED AND PROVEN in the commit that mints this contract.**

`SvpPlanToolOverlay` builds the `WorldPoint` handed to an armed handler at two sites — `:627`
(hover) and `:778` (`_toWorld`, the CLICK path reached from `_onMouseDown:597`). **Both discarded
`snapType` AND `sourceId`**, while `PlanViewToolOverlay._toWorld` (`:542-549`) carried both.

`isStrongSnap(pt)` (`PlanToolHandler.ts:193`) is `!!pt.snapType && pt.snapType !== 'nearest'`, so
in the split pane it was **permanently false for every point ever delivered**. Its only consumer,
`WallPlanToolHandler`, guards **three** branches with it (`:733`, `:750`, `:758`) — all three are
**L-935's fix**, the founder-reported production defect whose committed end point landed **636 mm**
from where he clicked. ⛔ **L-935 was fixed in the main plan view and left live in the split pane,
which is the founder's own working layout.**

⚠ **The snap was DRAWN and not DELIVERED**: `_lastSnapInfo` still fed the indicator and tooltip, so
the pane rendered a midpoint glyph under the cursor while the committed geometry obeyed ortho. No
amount of looking at the screen could have found it.

⭐ **The shape is [L-73](./C11-ELEMENT-CREATION-PIPELINE.md) one layer down.**
`planToolHandlerRegistry` unified the handler **SET** across both plan surfaces *"BY CONSTRUCTION,
so it can never drift again"* — and it did exactly that. **What it did not unify is the CONTEXT
those handlers are handed.** Proof: `apps/editor/src/engine/views/plantools/__tests__/svpSnapMetadataReachesHandler.spec.ts`
— five arms at the **pointer layer** (C104 R-10), real overlay, real DOM `MouseEvent`s; **5/5 fail
at the pre-fix tree** with `expected undefined to be 'midpoint'` and `isStrongSnap` `expected false
to be true`.

---

## §3 — CONSUMERS

**Every cell is ABSENT today.** Recorded so the build cannot silently ship a half-set — C84 §1.2's
lighting precedent (the loader existed, the serializer did not; one grep found it and stopped).

| Consumer | AS-IS | TO-BE |
|---|---|---|
| 3-D renderer | ABSENT | `AdaptiveComponentFragmentBuilder` |
| plan view | ABSENT | plan symbol builder; the element draws in plan **and section/elevation** |
| persistence | ABSENT | ⭐ a **declared `ProjectSnapshot` slice with a Zod schema** — C101 §5 records the annotation family persisting as `any[]`, unvalidated on write *and* on read. **Not repeated here** |
| IFC export | ABSENT | **NOT MEASURED** — mapping deferred to §11 D-8; `IfcBuildingElementProxy` is the presumed default and is **not yet ratified** |
| GLB export | ABSENT | inherits the fragment path |
| bake worker | ABSENT | ⚠ C84 §3.5.2 — `apps/bake-worker` and `pryzm-selfhost` **must** be in the census before anything here is called dead |

---

## §4 — PLUGIN ↔ DTO ↔ COMMAND ↔ BUILDER, AND WHAT "REACHABLE" COSTS

**AS-IS: nothing wired.** TO-BE, and **this is the checklist a reachability claim must satisfy** —
reported on C84 §3.5.1's four axes **separately**, per C104 §10 and **R-10**:

| axis | site | cost |
|---|---|---|
| 1 · store constructed | `PluginRegistry` descriptor | S |
| 2 · `storeKey` declared + verb dispatchable | descriptor + `initBusHandlers` | S |
| 3 · **something DISPATCHES from a pointer** | `planToolHandlerRegistry.ts` (**both** plan surfaces by construction, L-73) **+ a palette row on BOTH create surfaces** | M |
| 4 · AI classifies it | `ChatCommandClassification.ts`, or `CHAT_UNAVAILABLE` **with a reason** (C68 §5-g) | S |

**Three further sites are enforced by tests and will fail CI if skipped:**

- `apps/editor/src/engine/views/plantools/elementCreationMatrix.ts` — *"A creation tool present in
  a registry but absent from this table also fails [the spec], so a NEW element type cannot
  silently ship plan-only or 3-D-only."*
- `apps/editor/src/ui/tools-panel/panels/creationToolShortcuts.ts` — `CREATION_TOOL_SHORTCUTS`,
  keyed by the exact `tool.label`; a completeness test asserts every rendered label has an entry.
- **A pointer-layer spec.** C104 **R-10** makes a reachability claim **INADMISSIBLE** without one.

### ⛔ §4.1 — THE TWO CREATE SURFACES, AND THE DEFECT OF TOUCHING ONE

**L-1380.** `apps/editor` has **exactly two** live create surfaces and a capability added to one is
invisible on the other:

1. `apps/editor/src/ui/tools-panel/panels/CreateRailPanel.ts` — the right-hand rail's discipline
   accordion (`DisciplineSection[]`, hardcoded in `_buildSections()`)
2. `apps/editor/src/ui/layout/CreatePanelLayout.ts` — the drill-down `CREATE_CONFIG` nav stack

⚠ **They do not even agree on their own category names today** — the rail has
Architecture/Structure/**Services**/Interiors/Landscape; `CREATE_CONFIG` has
Architecture/Structure/**Plumbing**/**Interior**/**Outdoor**. **Both rows land in ONE commit.**

### §4.2 — ⚠ THE VG CATEGORY LIST IS A DIFFERENT LIST, AND CONFUSING THE TWO FAKES COMPLETENESS

[C106 §5.5](./C106-ELEMENT-CONSTRUCTION-BOUNDARY-LINE.md) requires a new **category** to land in
**six** sites in one commit — `ElementCategorySchema`, `VisibilityIntentDefaults.ELEMENT_TYPES`,
`OverridePanel.CATEGORIES`, `VGSceneApplicator`'s union **and** name map, `PenWeightTable`,
`DATUM_CATEGORIES`.

⛔ **Those six are VISIBILITY-GRAPHICS categories — view overrides, pen weights, visibility
toggles. NONE of them is a create surface.** Landing all six gives a visibility toggle and a pen
and **zero** ability to create anything. **Both lists are mandatory and they are not
substitutes**; quoting §5.5 as "the six places for a new create category" would be exactly the
false-completeness C84 §8 warns about.

---

## §5 — THE BRIDGE FIELD MAP

**AS-IS: no payload exists.** TO-BE — **every field carried, transformed, or DECLARED DROPPED;
omission is forbidden (C84 EI-2)**, and this section is what the future
`check-bridge-field-coverage` gate consumes.

| payload field | → record | disposition |
|---|---|---|
| `referencePoints[]` | `referencePoints[]` | **carried** — the defining input |
| `referencePoints[].hostId` | `.hostId` | ⚠ **carried when present; `undefined` from PLAN today (§2.3). `undefined` MUST be stored as `undefined`, never as a fabricated id** |
| `referencePoints[].hostKind` | `.hostKind` | carried when present |
| `referencePoints[].snapType` | `.snapType` | carried — provenance of the capture |
| `levelId` | `levelId` | carried |
| `profileId` / layers | `layers[]` | carried — the *"customise and create layers"* half |
| `materialId` | `materialId` | carried; **C106 §5.4's rule applies — a solid with no resolvable material is REFUSED at the command**, not defaulted |
| `hasVolume` | `hasVolume` | carried; **linework by default** (C106 §5 precedent) |
| *(none)* | `isResolved` | ⛔ **DELIBERATELY ABSENT at stage 1** — a field implying live re-solve must not exist before D-6 |

---

## §6 — VERBS

One row per verb. **`stores written` and `stores restored on undo` MUST be equal sets** (C84 EI-7).

| verb | AS-IS | lineage | stores written | restored on undo | equal? |
|---|---|---|---|---|---|
| create | ABSENT | L1 command | `AdaptiveComponentStore` | same | TO-BE ✅ |
| batch create | ABSENT | L1, **ONE** `produceCommand` | same | same | TO-BE ✅ |
| delete | ABSENT | L1, `elementType`-aware (EI-4) | same | same | TO-BE ✅ |
| move / transform | ABSENT | L1 | same | same | TO-BE ✅ |
| rotate | ABSENT | L1 | same | same | TO-BE ✅ |
| parameter / dimension | ABSENT | L1 | same | same | TO-BE ✅ |
| material / colour | ABSENT | L1 | same | same | TO-BE ✅ |
| level change | ABSENT | L1 | same | same | TO-BE ✅ |
| **re-solve on host move** | ⛔ **REFUSED at stage 1** | — | — | — | **§12 R-1** |

---

## §7 — UNDO / REDO

**AS-IS: ABSENT.** TO-BE: `affectedStores` must equal the measured write set; `createSnapshot`
must cover every declared key (EI-7d); redo **restores**, never **recomputes** (EI-7e).

⚠ **The cascade rule, pre-committed:** if §11 D-6 ever lands, a host move triggering re-solve is
**ONE undo** via `STRUCTURAL_CASCADE` and **explicitly NOT `CompositeCommand`** — L-2401, which
returned `success: true` unconditionally in both directions and counted children *attempted*.
C106 §4's discipline is adopted verbatim: **re-read every write back, `success = landed === attempted`.**

---

## §8 — CASCADES

**Stage 1 has NO cascades, and that is the decision, not an omission.** Nothing this family does
triggers another family's mutation, and nothing another family does mutates it.

⚠ **The consequence, stated so it is not discovered:** **move a wall an adaptive component was
built from, and the component does not move.** It is left exactly where it was authored. §12 R-1
records this as a REFUSAL with its reason; **§11 D-6 is the item that changes it.**

---

## §9 — VOCABULARIES

| vocabulary | rule |
|---|---|
| `elementType` | **exactly one spelling** — `adaptive-component` (§1.1) |
| material | **V1 only** — the master material database, [C100](./C100-MASTER-MATERIAL-DATABASE.md). ⛔ No family-local colour enum |
| layers | reuses the existing layer/assembly vocabulary — the founder asked to *"customise and create layers"*, which means **the machinery walls already have**, not a rival |
| `snapType` on a captured point | the `WorldPointSnapType` union, unchanged and **not re-spelled** |

⛔ **C84 EI-3 — what the UI offers, the pipeline must accept.** No palette control may offer a
value the command refuses.

---

## §10 — GEOMETRY

**AS-IS: ABSENT — no Stack A builder, no Stack B producer, no datum convention.**

TO-BE: Stack A `AdaptiveComponentFragmentBuilder`; Stack B producer **deferred** and named as
deferred (C84 §3.5.2 — the bake worker is a real host and `produceHandrail` is the counter-example
of a producer that was genuinely dead). **The two stacks must be PROVEN to agree before both
exist**; one stack that works beats two that disagree.

⚠ **NOT MEASURED:** the datum convention (centreline vs face) is **not yet decided**. C106 §3.2's
parametric anchor is the presumed model and is **not yet ratified for this family**.

### §10.1 — ⭐ WHAT `FamilyRegistry` CAN AND CANNOT DO HERE — MEASURED

`FamilyRegistryStore` is real, is constructed in the composition root
(`packages/runtime-composer/src/composeRuntime.ts:1050-1062`), is exposed on the runtime
(`:1904`), is seeded with **59** core families, and has **34** passing tests across two suites.
**Use it — do not mint a rival.**

⛔ **But it is a DISCOVERY index, not a geometry source.** `RegisteredFamilySchema` carries
`identity`, `category`, `mountClass`, `origin`, `archetypeHints`, `ifcMapping`, `schemaHash`,
`tags` — and `registered-family.ts:109-111` states in its own words that **`builderRef`,
`planSymbolRef`, `footprint`, `uiDescriptor`, `aiVocabulary` and `permissions` are deferred to a
later slice.** There is **no geometry, no builder reference and no instantiation entry point** on a
registered family, and `GeneratedGeometry` never reaches `RegisteredFamily` — only its hash does.

⚠ **And nothing reads it in production**: `findByCategory|findByOccupancy|findByMountClass|findByTag`
across `apps/`, `packages/`, `plugins/` returns only definitions, delegates, doc comments and
tests. **So registering the adaptive component makes it DISCOVERABLE and nothing more** — that is
a real and useful axis-2 property, and it is **not** reachability.

⚠ **`packages/family-runtime` is the OTHER family system and it is not this one.** Its placement
contract is `FamilyParameterKind = 'type' | 'instance'` with expression-driven parameters;
grepping `adaptive|point-based|pointBased|placementPoint|host point|by point` across
`packages/family-runtime/src`, `apps/component-editor/src` and `SPEC-FAMILY-EDITOR.md` returns
**zero hits**. ⭐ **The adaptive component is the POINT-driven complement to a PARAMETER-driven
system. They are siblings; neither subsumes the other, and merging them is out of scope.**

---

## §11 — THE DELTA

Ordered. Each item names its invariant and its proof. **Sizes are engineering estimates, not
measurements, and are labelled as such.**

| # | item | invariant | proof | est. |
|---|---|---|---|---|
| **D-0** | ⭐ **DONE** — SVP overlay delivers `snapType` + `snapSourceId` | C84 EI-2 | `svpSnapMetadataReachesHandler.spec.ts`, 5 arms, pointer layer; red at pre-fix tree | **SHIPPED** |
| **D-1** | L0 schema + branded id | C84 §1 | Zod round-trip | S |
| **D-2** | `AdaptiveComponentStore` — ONE authority | EI-1 | store scanner (C106 §1 pattern) | S |
| **D-3** | `create` / `delete` / `move` commands, symmetric stores | EI-5, EI-7 | undo restores the write set | M |
| **D-4** | fragment builder + plan symbol | C84 §10 | renders in 3-D **and** plan | M |
| **D-5** | ⭐ **`PlanSnapEngine` carries `sourceId` + `sourceType` on all 9 non-grid candidates** | §2.3 | a plan snap on a wall reports that wall's id | **M** |
| **D-6** | ⛔ **live re-solve** — parametric anchors + host-move cascade | §8, C106 §3.2/§4 | **gated on D-5**; ONE undo; `landed === attempted` | **L** |
| **D-7** | persistence slice with a real schema | EI-6, C101 §5 | survives save→reload | M |
| **D-8** | IFC mapping ratified | C84 §3 | **NOT MEASURED today** | S |
| **D-9** | palette rows on **BOTH** create surfaces + matrix + shortcut rows | §4, L-1380 | pointer-layer spec (R-10) | M |
| **D-10** | chat reach **or** a declared refusal with a reason | C68 §5 | gate 31 | S |

⛔ **D-6 MUST NOT be attempted before D-5.** Live references built on a plan surface that cannot
name a host would either fabricate host ids or work only in 3-D — the first writes false
provenance, the second is the eight-times-repeated dual-path defect §2.3 measures.

---

## §12 — REFUSALS

**A refusal is a correct answer. An undocumented one is not.**

**R-1 — ⛔ STAGE 1 DOES NOT RE-SOLVE, AND THE NAME OVERSTATES IT.** Move a reference wall and the
component stays put (§8). **Reason:** §2.3 — the plan surface cannot supply a host identity, so a
live reference is not expressible on the surface the founder named first, and shipping it in 3-D
only manufactures a family with two incompatible record shapes. **This is disclosed in the UI copy,
not just here (§0.2-a).** Closed by D-5 → D-6.

**R-2 — ⛔ IT DOES NOT CONVERT TO A WALL.** The founder's own correction: *"doesn't need to become
a wall afterwards — not for now"*. ⚠ **"not for now" is a DEFERRAL, not a rejection** — the record
is designed so a later `adaptiveComponent → wall` verb is additive. **Nothing may be built on the
assumption that it never converts.**

**R-3 — ⛔ IT IS NOT A REVIT ADAPTIVE FAMILY.** No UV-driven panel placement, no divided surfaces,
no nested adaptive families, no flexed rig. Those are the `.agents/` "Phase 3 façade" scope item
(§0.1), estimated there at 8–10 engineer-weeks, and are **out of scope for C107**.

**R-4 — ⛔ IT DOES NOT REPLACE `packages/family-runtime`.** §10.1 — point-driven and
parameter-driven are siblings.

**R-5 — ⚠ "CORE SYSTEMS" IS NOT YET DEFINED.** The founder said *"walls, slabs and core
systems"*. **Walls and slabs are measured and have snap providers; "core systems" is NOT MEASURED
— it is not a term this codebase defines.** ⛔ It must be resolved with the founder before D-5
scopes which providers gain identity. Recorded as a question, not guessed at.

---

## §13 — GATES

| # | rule | gate | today |
|---|---|---|---|
| AC-1 | one `elementType` spelling | tag scanner | TO-BE |
| AC-2 | ONE store class, no `window.*Store` | C106 §1 scanner | TO-BE |
| AC-3 | every payload field carried or declared dropped | `check-bridge-field-coverage` | **does not exist yet** |
| AC-4 | in `elementCreationMatrix` | `elementCreationMatrix.spec.ts` | **LIVE** |
| AC-5 | a shortcut row per rendered label | completeness test | **LIVE** |
| AC-6 | a pointer-layer reachability spec | C104 R-10 | **LIVE (pattern)** |
| AC-7 | ⭐ snap metadata survives the overlay handoff on **both** plan surfaces | `svpSnapMetadataReachesHandler.spec.ts` | ⭐ **LIVE — GREEN** |

---

## §14 — THE UI QUESTION, MEASURED

The founder: *"the real buttons/panels within the right-hand side panel rail are: 1. Architecture
2. Structure 3. Interiors 4. Landscape 5. MEP 6. Grids and Levels 7. Annotation"*.

⭐ **VERIFIED against `apps/editor/src/ui/tools-panel/ToolsPanelController.ts:58-105` — his seven
are REAL and in the right order**, with one naming discrepancy:

| # | founder | code (`SectionDef.label`) | `ToolsSectionId` |
|---|---|---|---|
| 1 | Architecture | Architecture | `CREATE_ARCH` |
| 2 | Structure | Structure | `CREATE_STRUCT` |
| 3 | Interiors | Interiors | `CREATE_INTERIORS` |
| 4 | Landscape | Landscape | `CREATE_LANDSCAPE` |
| 5 | **MEP** | ⚠ **Services** | `CREATE_SERVICES` |
| 6 | Grids and Levels | Grids & Levels | `GRIDS_LEVELS` |
| 7 | Annotation | Annotation | `ANNOTATION` |

⚠ **Row 5 is a real vocabulary split** — the founder says MEP, the code says Services. **Not
silently reconciled here.** It is his call which name is canonical; if MEP wins it is a rename
across `SectionDef`, `ToolsSectionId`, the icon and the `setActiveDiscipline('services')` key.

⛔ **THERE IS NO TAB SYSTEM.** No `role="tab"`, no tablist, in any create surface. What exists is
(a) rail **section buttons** opening a floating panel, (b) an **accordion** of `DisciplineSection`
in `CreateRailPanel`, (c) a **drill-down nav stack** in `CreatePanelLayout`, (d) separator-delimited
**groups** in `DrawingToolbar` (`'structure' | 'opening' | … `) — a command-bus toolbar that is
**not** a create surface. ⭐ **The repo already reads the founder's word "tab" as "discipline
section": `CreateRailPanel.ts:782` quotes him asking for the boundary line "under the ARCHITECTURE
tab", and it shipped as an accordion row.**

**So "a new tab" = an EIGHTH `SectionDef`.** Cost, and it is **separable from the element work**:

| # | edit | file |
|---|---|---|
| 1 | add `'ADAPTIVE'` to the union | `apps/editor/src/ui/tools-panel/ToolsPanelTypes.ts:70` |
| 2 | add the 8th `SectionDef` | `apps/editor/src/ui/tools-panel/ToolsPanelController.ts:58-105` |
| 3 | an icon | `apps/editor/src/ui/icons/PryzmIconsSystem.ts` |
| 4 | the panel it builds | new, or a 6th `DisciplineSection` in `CreateRailPanel.ts` |
| 5 | the matching `CREATE_CONFIG` category | `apps/editor/src/ui/layout/CreatePanelLayout.ts` (**L-1380 — same commit**) |
| 6 | rail CSS | `apps/editor/src/ui/styles/panels/toolsRail.ts:215` |

⭐ **Estimated S–M, and it is pure UI** — no schema, no command, no store. ⛔ **But an eighth rail
button that arms nothing is the sixteenth unreachable surface. It lands WITH D-9, never before.**

---

## §15 — STATUS

**CANONICAL** — the intent is settled and binding. ⛔ **NOT `ACTIVE`**: ACTIVE additionally
certifies that shipping code matches, and **the only part of this contract that ships today is
§2.4 / D-0**. Everything else is a declared BUILD. Flipping to ACTIVE requires D-1…D-4, D-7 and
D-9 with passing tests as evidence — never inspection.
