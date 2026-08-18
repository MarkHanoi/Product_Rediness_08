# ADR-0332 — Handrail: the deep audit, and what may be built on it

- **Status:** PHASE-A AUDIT ACCEPTED · **PHASE-B TIER 0 + SLOPE IMPLEMENTED** · curve / leaning-rake / types / modes / chat outstanding
- **Date:** 2026-08-18
- **Lane:** Z9 · §HANDRAIL-WALL-PARITY
- **Contracts consulted:** C03, C11, C15, C16, C65 §3.9, C67, C68, C73, C83 §10.
- **Related:** LANE Z8 (rival-store census, repo-wide) · ADR-0105 (one command per geometry
  store) · ADR-0076 Axis 3 (element instancing) · L-946 / L-947 (dispatch succeeds, renderer
  never hears).

---

## 0 — Why this ADR is an audit and not a design

The founder asked for handrail/wall parity: ORTHO/LINEAR/CURVED/BY-SLAB creation modes, raked
and curved on demand, full parametric control, user-authored types. A first pass produced a
source-declaration census and a plan. The founder then directed:

> *"This needs to be AUDITED — properly, DEEPLY. No quick assumptions… so we don't create new
> issues or bugs."*

That was correct, and the audit overturned **two conclusions this document previously stated as
fact**. Both are recorded below rather than quietly edited, because the way they were wrong is
the useful part.

> ⚠ **RETRACTED #1.** This ADR previously said the plugin pipeline had *"NO production call site
> found"*. **False.** `RailingPlanToolHandler.ts:92` dispatches bus `handrail.create` — it is the
> live 2-D plan railing tool. The pipeline is registered **twice**
> (`PluginRegistry.ts:317-322`, `engineLauncher.ts:578`) and is on the critical path for every
> railing drawn in plan. A grep for *callers of the store* found nothing; the store is written
> through a **bus verb**, so the grep asked the wrong question.
>
> ⚠ **RETRACTED #2.** This ADR previously implied "rake" for a handrail meant the wall's
> `rakeAngleDeg` (leaning off-vertical). **That is probably not what the founder means** — see
> §5, which is now an open question rather than a design.

---

## 1 — PHASE A · Which store does each consumer read?

The question that outranks every feature. Z8 found that for **walls** the answer differs per
consumer (kernel producers live for bake/export, legacy live for the viewport). **For handrails
it does not.**

| Consumer | Store read | Evidence |
|---|---|---|
| (a) 3-D viewport | **LEGACY** | `initBuilders.ts:105,872,876,897-899` → `HandrailFragmentBuilder.ts:9,136` |
| (b) Plan view (2-D) | **LEGACY** | projects THREE groups by `userData.elementType` (`EdgeProjectorService.ts:1954,2452`), stamped at `HandrailFragmentBuilder.ts:172-186`. Direct read: `MovePlanToolHandler.ts:352-353` — *"the GEOMETRY stores … NOT the detached plugin DTO stores"* |
| (c) Persistence | **LEGACY** | `ProjectSerializer.ts:45,713`; `ProjectLoader.ts:81,743-754` → `CreateHandrailCommand.ts:104` |
| (d) IFC export | **LEGACY** | `HandrailReader.ts:1,7,24-25`; `FragmentReader.ts:117`; `ExportIFC.ts:50` |
| (d) GLB export | neither → **LEGACY transitively** | `GLBExporter.ts` has zero handrail refs; exports by `userData.elementType` stamped by the legacy builder |
| (e) Bake worker | **NEITHER — handrail is absent** | `apps/bake-worker` has zero matches for `andrail`; `HeadlessBakeSession.ts:23` imports `produceWall` only |
| (f) Schedules | **LEGACY** | `ScheduleExtractor.ts:475,477` |

**✅ No two consumers disagree.** Unlike walls, the handrail has no per-consumer divergence. That
is the single most reassuring fact in this audit and it is why a carefully-scoped feature is
safe here.

### 1.1 — The plugin store has ZERO production readers

`produceHandrail` (`geometry-kernel/src/producers/handrail.ts:82`) is called only by
`plugins/handrail/src/committer/handrail-committer.ts:54,72,86`, a bench, and tests.
**`HandrailCommitter` is never instantiated** — `grep "new HandrailCommitter"` across
`apps packages plugins src` → **zero hits**; `bootstrap.render.everything.ts:135-158` registers
only Wall/Slab/Door/Window committers.

So the plugin store is a **write-only sink**. It is load-bearing for exactly one thing: being
the object `handrail.create` passes through before the bridge converts it.

---

## 2 — PHASE A · The bridge, and four silent defects (RUNTIME-MEASURED)

`initTools.ts:1909-1955` mirrors bus→legacy, create-only, one-way. It is 30 lines and it loses
data four ways. **Each is proved by a passing probe**, committed at
`packages/geometry-stair/src/__tests__/HandrailBridgeDivergenceProbe.spec.ts` — 5/5 GREEN.
Every `expect` there asserts CURRENT behaviour, including behaviour that is wrong.

| # | Defect | Mechanism | Probe |
|---|---|---|---|
| 1 | **N-point paths silently truncated** | `:1927-1928` takes `path[0]` and `path[length-1]`. The schema allows `path: Vec3[].min(2)`, so a 3-point railing is VALID. The middle vertex is discarded with no warning, no refusal, no log | PROBE 1 — a corner drawn at z=3 leaves nothing built beyond z>1e-6 |
| 2 | **An impossible comparison** | `:1941` `railProfile: ev.shape === 'rectangular' ? 'rectangular' : 'round'`. `Handrail.ts:7` declares the enum `['round','square','flat']`. `'rectangular'` is not a member, so the ternary is a **constant** | PROBE 2 — square and flat both arrive as `'round'` |
| 3 | **The authored diameter is unreachable** | `:1940` writes `thickness: ev.diameter`. The builder's ROUND branch (`:217`) reads `railDiameter ?? 0.04` and never `thickness`; only the RECTANGULAR branch reads `thickness` — and per #2 that branch is never selected | PROBE 3 — authored 0.05 renders at radius 0.02 |
| 4 | **No infill at all** | the bridge never sets `fillType`; the builder's infill block is `if glass … else if baluster …` with **no else** | PROBE 4 — a plan-drawn railing is exactly 3 meshes: one tube, two end posts |

**Consequence (PROBE 5): the same line drawn in PLAN and in 3-D builds different geometry.**
The 3-D tool (`HandrailTool.ts:143-156`) passes the selected type's fields to the legacy command
directly; the plan tool goes through the bridge and loses all of them.

> This is why the audit had to precede the feature. Adding `curve` and `rakeAngleDeg` to the
> model without knowing this would have shipped two more fields into a translation that already
> drops four.

---

## 3 — PHASE A · The enumerated divergent states

| Write path | Legacy store | Plugin store | User-visible result |
|---|---|---|---|
| 3-D tool (`CreateHandrailCommand`) | record ✅ | **junk record** — `HandrailTool.ts:158` fires `handrail.create` with an **empty payload**; `CreateHandrail.ts:47-56` seeds `id=createId()`, `path=[{0,0,0},{1,0,0}]`. The bridge's `path.length < 2` guard discards the *mirror*, but the plugin record is already written | a ghost 1 m rail at the origin accumulates in the plugin store per 3-D handrail drawn |
| Plan tool (bus `handrail.create`) | record ✅ (lossy, §2) | record ✅ (faithful) | the two records **disagree from birth** |
| Bus edit (`setPath`/`setShape`/`setHost`/`recompute`) | **unchanged** | updated | **nothing re-renders, persists or exports.** And `syncDisposition.ts:509-511,842` declares these `element-property` — i.e. **SYNCED** — so a collaborator applies them too, invisibly on both sides. This is the L-946 shape |
| Legacy edit (`UpdateHandrailCommand`) | updated ✅ | **frozen at creation values** | correct on screen; plugin store drifts permanently |
| Delete (`element.delete`) | purged ✅ `DeleteElementCommand.ts:529` | **stale record leaks** | plugin store grows monotonically; `canExecute` of every plugin handler then validates against ghosts |
| Project load | N records ✅ | **0 records** | `ProjectLoader.ts:743` uses the legacy command directly, so `handrail.created` never fires |

**Undo.** `CommandEventBridge` emits **no `.deleted` event of any kind** (grep `\.deleted'` → zero
hits) and its only handrail case is `handrail.create` (`:707,722`). The bridge's
`handrailStore.add()` runs in an event subscriber **outside the command transaction**. Therefore
undoing a plan-drawn railing reverses the plugin patch and **leaves the legacy record and its
mesh in place**. *(Measured structurally — no emitter exists to notify the bridge — **not**
executed end-to-end in a browser. Stated as NOT RUNTIME-CONFIRMED.)*

**Bus verbs cannot see 3-D-drawn handrails.** `SetHandrailPath.ts:29-31,36` refuses with
`handrail not found`. That refusal is **honest and loud** — good — but it means the entire bus
surface is usable only for plan-drawn railings.

`handrail.delete` has **no production caller anywhere** — the real delete path is
`element.delete` → `DeleteElement.ts:57` → `DeleteElementCommand.ts:512-531` (legacy).

---

## 4 — PHASE A · There are THREE railing concepts, not two

| | **HandrailData** (legacy) | **StairRailingConfig** | **protocol `Handrail`** |
|---|---|---|---|
| path | `baseLine` 2 pts, **`y` ignored** | none — derived from stair flights | `path: Vec3[]` (≥2, full 3-D) |
| store | `HandrailStore` | `StairRailingStore` | none |
| catalogue | `handrailTypeStore` (5) | same 5, **projected** | `BUILTIN_HANDRAIL_TYPES` (3, disjoint) |
| **slope** | **NO** | **YES** — quaternion, per flight | **YES** — 3-D frame sweep |
| **curve** | **NO** | no (chorded upstream) | **YES** — polyline sweep |
| selectable | true | **false** | n/a |
| IFC class | `IfcRailing` | `IfcRailing` | n/a |
| wired | yes | yes | **no** |

**They are SIBLINGS that are RIVAL representations of one real-world thing.** Decisive evidence:
`IfcRailingToNativeConverter.ts:1,15,28` — an imported `IfcRailing` **always** becomes a
`HandrailData`; there is no branch producing a `StairRailingConfig`. So a stair railing exported
to IFC re-imports as a standalone handrail. The round-trip is lossy and the two collapse at the
interchange boundary.

### 4.1 — ⭐ The capability the founder asked for already exists TWICE, and is unreachable both times

- **Slope** is implemented and correct in `StairRailingBuilder.ts:1127-1131,1145-1150` — no rake
  variable, no trigonometry: two 3-D endpoints whose `y` differ, and
  `quaternion.setFromUnitVectors` does the work. Glass follows the slope as an explicit
  four-corner parallelogram (`:602-637`). Balusters stay plumb and equal-length while their bases
  ride the stringer (`:450-462`).
- **Slope AND curve** are both implemented in `produceHandrail`
  (`geometry-kernel/src/producers/handrail.ts:82-165`) — a full 3-D frame sweep along an
  arbitrary polyline, with averaged tangents at corners and a Y-parallel fallback. **It is dead
  code.**
- `HandrailFragmentBuilder` is **strictly horizontal**: `:137-140` computes length and angle from
  x/z only; `:146,188` set one `worldY` for the whole root. `baseLine[i].y` exists and is never
  read.

**So "raked on demand, curved on demand" is not a new capability. It is a capability that exists
in two places, neither reachable from the handrail the user draws.**

### 4.2 — Measured dead ends inside the stair-railing family

- `resolveStairRailingTypeFields` derives `balusterShape` (`StairRailingTypeMapping.ts:96,102`)
  — and `grep balusterShape` over `StairRailingBuilder.ts` returns **zero hits**. The builder
  picks round-vs-box from the construction form alone (`:1064`, `:531` vs `:460`). A derived
  field nothing reads.
- `handrailHeight` (`StairRailingTypes.ts:10`) — never read by the builder.
- `balusterSpacing` is **not mapped at all** by the projection (absent from the `Pick<>` at
  `:63-66`), although the stair-railing builder does use it.
- `StairRailingTypes.ts` exists **twice** — `packages/geometry-stair/src/` (live) and
  `packages/core-app-model/src/stores/` (byte-identical minus `typeId`, apparently orphaned).
  *NOT MEASURED: whether the fork was intentional.*

---

## 5 — ⚠ OPEN QUESTION FOR THE FOUNDER — "raked" is ambiguous, and I will not guess

For a **wall**, `rakeAngleDeg` means **leaning off-vertical** (`WallRake.ts` sign convention).
For a **railing**, standard architectural usage of *"raked balustrade"* means **following the
stair/ramp slope** — the rail climbs.

These are different geometries and the audit shows the product already treats them differently:
`StairRailingBuilder` implements the **sloping** sense; nothing implements the **leaning** sense
for a railing.

Given the founder's sentence was *"it should work exactly like the WALL element … RAKED on
demand"*, either reading is defensible. **Building the wrong one is a week of work aimed at the
wrong geometry**, so this is escalated rather than assumed. My recommendation, stated as a
recommendation:

> **SLOPED is almost certainly what is wanted** (a rail that climbs a ramp or stair), because
> `baseLine` already carries an unread `y` on both endpoints — the model is *already shaped* for
> it, and it needs no new field. **LEANING** would need a new `rakeAngleDeg` field and is a rarer
> real-world railing.
>
> Cheapest honest answer: **do both, in that order** — SLOPE first (no new field, honours data
> the model already holds), LEANING second (new field, gated).

---

## 6 — PHASE B · The proposed plan (NOT YET BUILT)

Per the standing constraints: **do not unify the two systems** (Z8's roadmap), **do not create a
third path**, **do not edit `WallRake.ts`** (two lanes are in it), **do not edit
`HandrailTypeStore.ts`'s `materialName` enum** (LANE ZA owns the material database).

Every item states **which store it writes** and therefore **which consumer sees it**.

### Tier 0 — Fix the bridge. Nothing else is safe until this is done.
| # | Change | Store written | Seen by |
|---|---|---|---|
| 0.1 | Refuse an N>2-point path at the bridge with a named error instead of truncating, **or** carry the polyline (see 0.5) | — | removes silent data loss |
| 0.2 | Delete the impossible `'rectangular'` comparison; map `square`/`flat`→`rectangular`, `round`→`round` | legacy | 3-D, plan, IFC, GLB, schedules |
| 0.3 | Write `railDiameter` (not only `thickness`) so the authored diameter is reachable | legacy | 3-D |
| 0.4 | Carry `fillType` (and a default) so a plan-drawn railing has infill | legacy | 3-D |
| 0.5 | Make the plan tool honour the selected handrail type, as the 3-D tool does (`RailingPlanToolHandler.ts:15-16` hard-codes 1.1 / 0.05) | legacy via bridge | all |
| 0.6 | Remove the empty-payload telemetry call at `HandrailTool.ts:158` that mints a junk plugin record per 3-D handrail | plugin | stops the leak at its source |

⛔ **0.7 — NOT PROPOSED HERE.** The plugin-store delete leak and the missing undo bridge are
**Z8's territory** (its census: 12 `.created` subscriptions, 1 mutation bridge, 0 delete
bridges). Fixing them handrail-only would mint a pattern Z8 has to undo. **Reported to the
coordinator for Z8 instead.**

### Tier 1 — Reachability: fields the builder ALREADY draws
`balusterSpacing`, `balusterShape`, `balusterWidth` are read by the builder
(`HandrailFragmentBuilder.ts:250,253,254`) and settable by **nothing** — absent from
`HandrailTypeDefinition`, from `UpdateHandrailPayload`, and from the panel descriptor
(`PropertyDescriptorGenerator.ts:284-296`). Widening those three surfaces needs **no builder
change**. Writes the **legacy** store via `UpdateHandrailCommand` → seen by all six consumers.

⭐ **The inversion worth naming:** chat can already set `balusterSpacing`/`balusterWidth`
(`ChatCapabilityRegistry.ts:1233-1312` → `element.updateParameters` → generic merge at
`UpdateElementParameterCommand.ts:515` → `bim-handrail-updated`), and the **property panel
cannot**. A founder who types *"set the baluster spacing to 100 mm"* succeeds; the same founder
looking for the control finds none.

### Tier 2 — Geometry: slope, then curve
Both land in `HandrailFragmentBuilder` (**legacy** store → all six consumers).
- **Slope** — honour `baseLine[i].y`, using the **quaternion technique from
  `StairRailingBuilder.ts:1127-1131`**, not a new derivation. No new model field.
- **Curve** — add `curve` with the **same shape as `WallData.curve`** and delegate arc-length
  work to `WallArcParam` (its `ArcHostWall` is structurally typed, so a handrail satisfies it
  as-is). **No second Bézier body** — `check-predicate-canonical` is at 138/138.
- The pure module for this is already written and committed **inert** at
  `packages/geometry-stair/src/HandrailRunGeometry.ts`; its rake trigonometry *imports* from
  `WallRake` and modifies nothing there. Its policy gate refuses out-of-range, rake×curve and
  rake×glass, in both authoring directions.

### Tier 3 — Types
Three gaps that must move **together** or the feature is a lie:
`handrailTypeStore.add/update/remove` have no production caller · `ElementTypeAuthoringRegistry.ts:211`
explicitly declares railing types not user-authorable · there is **no persistence snapshot
field** (walls have one at `ProjectSerializer.ts:767-769` / `ProjectLoader.ts:945-975`).

**DECISION — keep MATERIALISATION, do not add `typeId`.** `HandrailData` has none;
`CatalogueFamilies.ts:55-57` documents materialisation as a deliberate, *different* capability.
Adding a `typeId` would change the chat catalogue family's shape mid-flight. Materialisation is
already how `element.changeType` handles this family (`initBusHandlers.ts:1928-1957`).

### Tier 4 — Creation modes
Mirror `WallTool`'s machinery rather than inventing one; `switchDrawingMode`
(`WallTool.ts:600-660`) already preserves polyline continuity through a live mid-draw switch.
`elementCreationMatrix.ts:312-313` declares one mode (`polyline`) against the wall's four.

### Tier 5 — Chat
⛔ **NO `DimensionFamilies` row.** That file's own header requires a family to have a real
**batch carrier**, and handrail has only per-element `element.updateParameters`. A row without a
carrier violates the invariant `SINGLE_FORM_CAPABILITY`'s out-claim guard exists to catch.
✅ Instead, add **sibling entries in `ChatCapabilityRegistry`** beside the existing
`set-baluster-spacing` — the same zero-token, one-table pattern, no new resolver arm — for
whichever fields Tier 1/2 actually make buildable, and **no others**.

---

## 7 — Deliberate refusals (C65 §3.9)

- **`railStructure`** — declared (`HandrailTypes.ts:36`), **zero reads repo-wide**. Multi-layer
  rail stacks are a real feature, not a wiring gap. **No UI control will be shipped for it.**
- **`materialId` on a handrail** — the builder has no catalogue lookup and reads only
  `materialColor`. ⚠ The existing refusal text at `SetHandrailMaterial.ts:57` says a materialId
  *"cannot be shown on a handrail at all"* — that is **STALE**: `ScheduleExtractor.ts:496`
  surfaces it in the Handrail schedule's Material column, and `initTools.ts:1943` writes it at
  create time. It is **live-but-render-inert**, not dead. The wording should be corrected.
- **`fillType: 'panel'`** — selectable today, builds **nothing**. To be implemented (it is a
  strictly simpler case of the glass panel), never left silent.
- **`byslab` creation mode** — needs a slab-edge selection interaction that does not exist.
- **Unifying the three railing concepts** — explicitly out of scope; Z8 owns it.

---

## 7A — PHASE B · What was built, and what each change is worth

The founder's "raked" ambiguity (§5) resolved to an **ordering, not a fork**: SLOPED first
because the model already holds the data; CURVED second by harvesting the dead `produceHandrail`;
LEANING third behind a gate. Only the first is built here.

| Change | File | Effect |
|---|---|---|
| Refuse N>2 paths by name | `initTools.ts` bridge | silent truncation → a named `console.error` and **no record**. The user can no longer get a shape they did not draw |
| Fix the impossible ternary | same | `square`/`flat` → `rectangular`, `round` → `round`. The dead branch is gone |
| Write `railDiameter` | same | the authored diameter reaches the built rail (0.05 now renders at r=0.025, was pinned at r=0.02) |
| Carry `fillType: 'baluster'` | same | **plan-drawn railings now have infill.** Default taken from `CreateHandrailCommand.ts:76`, not invented, so the two surfaces agree by construction |
| `fillType: 'panel'` | `HandrailFragmentBuilder` | implemented as a solid infill board — the glass panel's geometry without the transparency |
| `fillType: 'open'` | same | explicit named branch. Building nothing is CORRECT for an open railing; it now reads as a decision rather than a missing `else` |
| `resolveColour()` | same | `materialId` resolves through `userMaterialStore` (existing hex-colour repository). **No new vocabulary** — one function, so LANE ZA has exactly one site to re-point |
| **SLOPE** | same | `baseLine[i].y` is read for the first time. Rail and infill pitch and lengthen to the incline; posts and balusters stay **plumb** with bases riding it — `StairRailingBuilder`'s rules, not a new derivation |
| `userData.member` tags | same | every sub-mesh is labelled `rail`/`baluster`/`post`/`infill`, which is what makes any of this assertable |

**Non-regression is structural, not hoped for.** `rise === 0` ⇒ `slopeAngle = 0`,
`slopeLength = length`, `riseAt() = 0` — every existing handrail (`CreateHandrailCommand` writes
`y: 0` on both endpoints) takes an arithmetically identical path. Asserted member-for-member
against positions computed by hand from the pre-change algorithm.

**The controls were falsified, not merely passed.** With `isSloped` forced to `false`, exactly
the 3 slope controls fail and the other 247 pass — so they can fail, and they fail for the right
reason. Before Phase B, 7 of the built-geometry controls were RED.

⚠ **Residual divergence, stated honestly.** Plan and 3-D now build the same member composition
for the same construction, but the two tools still choose different *defaults*
(`RailingPlanToolHandler.ts:15-16` hard-codes height 1.1 / thickness 0.05; the 3-D tool reads the
selected `HandrailTypeDefinition`). That is **Tier 0.5 — not a translation defect but a tool
defect** — and it is NOT fixed here. A plan railing and a 3-D railing drawn with default settings
still differ in height.

## 8 — What this lane has actually produced

**Nothing user-visible. By instruction.** Three commits, all inert or evidential:

1. `54c34a83` — the first reachability audit (superseded by this document).
2. `8cdb492b` — `HandrailRunGeometry.ts` (pure, **nothing imports it**) + `HandrailWallParity.spec.ts`
   (**RED by design**, 7/14 failing — the controls recorded before any fix).
3. `ced5aad0` — `HandrailBridgeDivergenceProbe.spec.ts`, **5/5 GREEN** — the four bridge defects
   as runtime facts.

Root `tsc --noEmit` **RC=0**. `check-sync-disposition` **RC=0**. `check-predicate-canonical`
**138/138, at its declared level**. `check-verb-register` was **already RC=1 before this lane
touched anything** (`API-VERB-REGISTER.md` stale by 2 in its handler-file count, from another
lane) — this lane adds no verb, so it does not move that number.
