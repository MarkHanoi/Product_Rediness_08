# C116 — ELEMENT: SITEWORKS (roads · parking · pedestrian areas)

> ⚠ **THE FILENAME RETAINS THE HISTORICAL SLUG `C116-ELEMENT-SITE-SURFACE.md`, DELIBERATELY.**
> The element kind was renamed `siteSurface` → `siteworks` on 2026-09-09 (the ruling below), but the
> path is already cited by `ADR-0384` and by this document's own header, and the contract **id** —
> which is what `check-contract-index-equivalence` matches and what every other document cites — is
> `C116` either way. Renaming the file would move three citations to buy nothing: a grep for
> `siteworks` finds this document by its *content* on the first line. ⛔ Do not "tidy" the filename
> into a fourth thing to reconcile.

**Status:** CANONICAL · **Minted:** 2026-09-09 · **Lane:** SITE-SURFACE
**Ratified by:** [`ADR-0384`](../adrs/ADR-0384-the-site-surface-is-one-family-with-two-forms-and-three-roles.md)
(nine rulings) · **Authority above it:** the founder transmission of **2026-09-09** (§0, verbatim).
**Binds:** every PR touching the `siteworks` family, per [`C84 §6`](C84-ELEMENT-INTEGRITY.md).
**Siblings:** [`C92`](C92-ELEMENT-SLAB.md) (slab — **the areal precedent**, whose field spellings this
family reuses verbatim) · [`C85`](C85-ELEMENT-WALL.md) (wall — **the linear precedent**: a baseline
plus a thickness, geometry derived) · [`C114`](C114-ELEMENT-SPACE-ENVELOPE.md) (**the structural
template**, for the reason C84 §6.2b gives) · [`ADR-0383`](../adrs/ADR-0383-massing-groups-master-planning.md)
(**the co-owner of the Master planning rail category**).

> ⛔ **WHY THIS DOCUMENT EXISTS AT ALL.** C84 §6 forbids the family without it: *"A new family may
> not be added while its per-element contract is absent."* ⭐ **It was written BEFORE the code, and
> landed in the commit that precedes the schema** — the opposite order to C114, whose own header
> records that being cited before being minted was the wrong way round. The precedent that this is
> useful rather than aspirational is C107 (C84 §6.2b).

---

> ## ⛔⛔ ORCHESTRATOR RULING 2026-09-09 — **THE ELEMENT KIND IS `siteworks`, NOT `siteSurface`**
>
> The lane's stage-0 blocker was real and it measured it correctly: **`siteSurface` is already a
> live UI symbol.** `apps/editor/src/ui/site/SiteSurface.ts` is 25,633 bytes, and the spelling
> appears across **nine files** — `styles/panels/siteSurface.ts`, `WorkspaceController.ts`,
> `AppTheme.ts`, `engineLauncher.ts`, `siteSurfaceMount.spec.ts` and the analysis siblings. It is
> owned by another lane (L-13180 / L-13285).
>
> **The ELEMENT KIND yields, not the UI.** Two reasons, in order of weight:
> 1. **C84 EI-8 — one spelling per subject.** Two unrelated things called `siteSurface` means a
>    grep for either returns both, permanently, for every future reader. That cost is paid forever;
>    a rename now is paid once.
> 2. **Renaming the UI would edit nine files across a live lane's surface** to accommodate a family
>    that has not shipped a line of code. The thing that exists wins.
>
> ### Why `siteworks`
> It is the industry term for exactly this scope — carriageways, parking, footpaths, hard
> landscaping — it collides with nothing (`grep -rn "siteworks" --include=*.ts` → 0), and it has
> room for the family to grow (drainage, kerbs) without a second rename.
>
> ⚠ **`pavement` was considered and rejected**, despite being the IFC4x3 entity name
> (`IfcPavement`). It reads as *footway* in British English and *carriageway* in American, so the
> one word would mean two different things to the two audiences this product already has. The IFC
> mapping is still `IfcPavement` / `IfcCourse` on export — **the export mapping and the internal
> kind do not have to share a spelling, and here they must not.**
>
> **Apply:** rename the kind, its `defineElement('siteworks')` literal, the `SITEWORKS_*` constant
> roster, the brand `SiteworksId`, the verb prefix `siteworks.*`, and the prose of this document.
> ⛔ **The contract NUMBER does not change** — this stays C116. Edit it **in place** (CLAUDE.md:
> *"Edit the canonical `C0N-*.md` in place… never write a new `*-AUDIT.md` derivative doc"*), and
> move the `contracts/README.md` row **in the same commit** — `check-contract-index-equivalence`
> compares the file set against the row set in both directions and that rule has failed six times.
>
> ⭐ **And the other three stage-0 blockers are answered here too:** edit C116 §9e and §0.1 **in
> place** rather than superseding them by ADR; you do **not** need to touch
> `apps/editor/src/ui/site/SiteSurface.ts` or its eight siblings at all once the kind is renamed;
> and the ISSUE-LOG rows are the orchestrator's — hand over the text in your close.
>
> ⚠ **One correction to the lane's own audit: Actions is NOT billing-blocked today.** Measured
> 2026-09-09: three `Deploy to Fly.io` runs completed successfully in 618–648 s. What IS true is
> that the six red CI jobs block `deploy-fly.yml` via §L-540-CI-GATE for any commit that triggers
> CI. Do not treat CI as evidence either way — that part of your audit stands.

---

## §0 — WHAT THIS IS, AND THE ONE SENTENCE IT DEFENDS

The founder's transmission, verbatim (2026-09-09):

> *"i need you to add new categories on PRYZM - **roads** - it should be done as linear design -
> like a wall - but of course flat - like a slab - with a **thickness that the user can add** -
> starting for a typical national road two-sense wide … **accessible via UI on the right hand side
> panel rail for a new masterplanning category** - then we need **parking spaces** - another
> category. and **pedestrian areas** - working similar to Roads / slabs."*

A **siteworks** surface is an AUTHORED flat paved surface laid on the site: a footprint on a level's XZ
plane, with a `thickness` that hangs **below** the finished surface. It is authored either
**linearly** (a centreline and a width — a road) or **areally** (a ring — a parking area, a plaza).

**The one sentence this contract defends:**

> **A road, a parking area and a pedestrian area are ONE element kind wearing three roles. The
> difference between them is what they MEAN, and no code path may turn that difference into a
> second implementation.**

Everything in §9 (vocabularies) and §12 (refusals) exists to hold that sentence.

### §0.1 — ⛔ THE HONEST STATUS OF THIS FAMILY, MEASURED 2026-09-09

Per C84 §6.2a — *"on the day it is written, almost every AS-IS cell will read `NOT MEASURED` or an
honest absence, and that is the correct content"* — and following C107 §0.1 / C114 §0.1:

```
grep -rl "siteworks\|Siteworks" --include=*.ts --include=*.tsx \
     packages plugins apps src server tools
→ 0 files.        (re-measured 2026-09-09, AFTER the rename — see the correction box)
```

> ⛔ **CORRECTION 2026-09-09 (lane SITE-SURFACE, at the start of implementation) — THIS SECTION'S
> ORIGINAL MEASUREMENT WAS FALSE WHEN IT WAS WRITTEN, AND FINDING THAT OUT IS WHY THE KIND IS NOW
> SPELLED `siteworks`.**
>
> As minted, the block above read:
>
> ```
> grep -rl "siteSurface\|SiteSurface" … → 0 files.
> ```
>
> Re-run verbatim at the first implementation step: **9 files.**
> `apps/editor/src/ui/site/SiteSurface.ts` (a **465-line live class** with a module-load singleton
> `export const siteSurface`), `apps/editor/src/ui/styles/panels/siteSurface.ts`,
> `.../site/__tests__/siteSurfaceMount.spec.ts`, `engineLauncher.ts`, `WorkspaceController.ts`,
> `styles/AppTheme.ts`, and the three `ui/analysis/` siblings.
>
> ⚠ **This was not staleness.** `SiteSurface.ts` was created in `b6d90edb` (**2026-09-07 22:55**,
> L-13180) and amended in `f7176132` (**2026-09-09 13:34**, L-13285). This contract was minted in
> `f7901603` (**2026-09-09 19:20**). **The UI surface predated the contract by 5 h 46 min.** The
> "0 files" was wrong at the instant of writing — the same defect class as a doc asserting an
> enforcement that does not exist, and the reason this repository's standing instruction is
> *"read the gate, never the line"*.
>
> ⭐ **Why it was load-bearing rather than cosmetic.** §1 orders *"hold the count at ONE"* and mints
> the long spelling explicitly *"so a grep for one never returns the others"*. Both were already
> false: the count was one — **for an unrelated L7 concept** — and the grep returned nine unrelated
> files. No gate could have caught it (different modules, an L7 class versus an L0 kind, so
> TypeScript is silent), which is [[same-rule-two-implementations]] in its naming form, at its first
> instant. The ORCHESTRATOR RULING above resolved it: **the element kind yields, the UI does not**,
> because the UI exists and the family had not shipped a line of code.

⭐ **At mint there is no schema, no store, no command, no handler, no plugin, no renderer, no UI
control and no persistence leg.** §14 is the living record of what is actually built, appended
never rewritten. ⛔ **Do not cite a registered schema as a working element** — that is the misreport
C114 §0.1 was written to prevent.

### §0.2 — THE NAMING-DISCLOSURE CLAUSE, INHERITED FROM C107 §0.2-a

*"A family named for a behaviour it does not have is the naming-vs-behaviour defect this repository
logs repeatedly."*

⛔ **This contract may not describe terrain draping, junction resolution, kerbs, road markings,
gradients, camber, drainage, IFC identity, living-graph membership, quantity take-off or RAC
authoring as capabilities.** Each is claimed only where §14 records it SHIPPED with a proof.
Everything else here is normative intent. ⛔ **In particular: the family is called `siteworks` and
not `road` precisely so that nobody reads road ENGINEERING into it.** It is a paved plane. §12 is
the list of everything a road engineer would expect and will not find.

### §0.3 — THE FOUR THINGS IT IS NOT

| Not this | Why the confusion is dangerous |
|---|---|
| **`Slab`** (`packages/schemas/src/elements/Slab.ts`) | A slab is **building fabric on a storey**: it is scheduled, it carries a system type and layers, it couples to columns (`SlabColumnCoupling`) and traces regions from walls (`SlabRegionTracer`). A car park is not a floor plate and must not appear in a floor-area schedule. ⭐ **Its FIELD SPELLINGS are reused verbatim (§9) and its DATUM RULE is inherited (§10) — its IDENTITY is not** |
| **The zoning `street_width` family** (`packages/site-parcel-data/src/geometry/streetWidth.ts`, `BCN_OFFICIAL_STREET_WIDTHS`, `MURCIA_STREET_WIDTH_AUTHORITY`, …) | ⛔ **The single most dangerous confusion in this contract.** That subsystem MEASURES the width of an EXISTING street in order to resolve a LEGAL height limit; it is a determination with a confidence, a provenance and a refusal vocabulary. A `siteworks` is a DESIGN the user drew. **A drawn road must never be read as a measured street width**, or an architect would raise their own permitted height by widening a road they invented |
| **`SpaceEnvelope`** (`./C114-ELEMENT-SPACE-ENVELOPE.md`) | A prism with a `height`, extruded UP; this is a plate with a `thickness`, extruded DOWN. They share the ONE-KIND-WITH-A-ROLE architecture (ADR-0380 D2 → ADR-0384 D1) and share nothing else |
| **A context road from the geospatial bake** (`R2` roads layer, `context-3d-tiles-not-live-overpass`) | Context roads are **surveyed fabric around the site**, baked as tiles and never editable. A `siteworks` is authored inside the project. Two answers to *"where is the road"* would be C84 EI-9 — so the family carries no `sourceFeatureId` and does not adopt context geometry. `NOT MEASURED:` whether tracing a context road into an authored one is wanted |

---

## §1 — IDENTITY

| Axis | AS-IS (measured 2026-09-09) | TO-BE (normative) |
|---|---|---|
| Canonical `elementType` tag | **ABSENT** | `'siteworks'` — `Id.ts` (`ElementType` union) + `registry.ts` (`SCHEMA_REGISTRY`) |
| Every spelling in use (§4E) | **none** | ⛔ **hold the count at ONE**: `siteworks`. `road`, `surface`, `pavement`, `paving`, `siteslab`, `groundSurface` — and ⭐ **`siteSurface`, which is FORBIDDEN for this family because it is already TAKEN by an unrelated one** (`apps/editor/src/ui/site/SiteSurface.ts`, the SITE workspace mode's right-hand panel; see §0.1 and the ruling above) — are FORBIDDEN spellings (C84 EI-8). ⭐ **`siteworks` was verified against the whole tree before it was chosen**: `grep -rn "siteworks\|Siteworks\|SITEWORKS" --include=*.ts --include=*.tsx --include=*.json packages plugins apps src server tools docs` → **0 hits**, 2026-09-09. That check is the step §0.1 skipped |
| L0 schema | **ABSENT** | `packages/schemas/src/elements/Siteworks.ts` — `defineElement('siteworks', …)` + `.refine()` invariants |
| Branded id | **ABSENT** | `SiteworksId = Id<'siteworks'>`, in `AnyElementId` and `IdFor`. Runtime prefix is derived by `createId('siteworks')` — there is no separate prefix table |
| Bus verb namespace | **ABSENT** | `siteworks.*` per C69 §3.6 (the namespace is the kind, never an abbreviation). Roster in §6 |
| Geometry package | **ABSENT** | `packages/geometry-siteworks` — **L2**, THREE-free, declared in `eslint.config.js`'s `layerElements` |
| Plugin | **ABSENT** | `plugins/siteworks` (`@pryzm/plugin-siteworks`), `storeKey: 'siteworks'` |
| IFC identity | ⛔ **NOT MEASURED.** `IfcCourse` / `IfcPavement` (IFC 4.3 infrastructure) are plausible; neither was verified | resolve before any IFC export claim. ⛔ Until resolved the family is **EXCLUDED** from IFC export rather than guessed into it — C114 §1's precedent for this exact position |

---

## §2 — STORES, AND WHICH ONE IS THE AUTHORITY

| Representation | Where | Authority? |
|---|---|---|
| **L0 record** `Siteworks` | `packages/schemas/src/elements/Siteworks.ts` | **the shape** |
| **Plugin store** `SiteworksStore extends Store<Siteworks>` | `plugins/siteworks/src/store.ts`, `storeKey: 'siteworks'` | ⭐ **THE AUTHORITY (C84 EI-1).** Reached as `runtime.stores.siteworks` |
| plugin DTO twin | **none, deliberately** | — |
| legacy geometry store | **none, deliberately** | — |
| scene `userData` | mesh carries `{ type: 'siteworks', id, levelId }` | **a projection, never a source** |

⭐ **ONE store, and the reason is load-bearing rather than tidy.** C114 §2 records that `pool` spans
four stores and MUST therefore use `produceMultiStoreCommand` or its patches route to nothing.
A single store keeps *"lay out a masterplan"* a single `produceCommand` → **one Immer patch pair →
one Ctrl+Z**, which is the whole reason §6's create verb is a batch.

⛔ **There is no `core-app-model` store and no `packages/stores` entry for this family**, and that is
a decision (the `spaceEnvelope` precedent), not an omission. A second store would be C84 §1's
*"five rival representations per family"* created on purpose.

---

## §3 — CONSUMERS

| Consumer | AS-IS | TO-BE |
|---|---|---|
| 3D renderer | **ABSENT** | `apps/editor/src/engine` mesh builder driven by `store.subscribeDirty` — the one channel that fires on EXECUTE, UNDO and REDO alike, so no rival render path exists |
| Plan view | **ABSENT** | ⛔ `NOT MEASURED` whether a siteworks surface belongs in a storey plan at all. Deferred rather than guessed — §11 item 4 |
| Persistence | **ABSENT** | `snapshotFamilyCoverage.ts` ledger row + `ProjectSerializer` + `restoreCompoundFamilies` common tail |
| IFC export | **EXCLUDED** (§1) | resolve identity first |
| GLB export / bake worker | ⛔ **NOT MEASURED** | — |
| Schedules / quantities | **ABSENT** | ⛔ **A siteworks surface MUST NOT contribute to any floor-area or GFA figure.** C114 §3a's rule generalises: *built* / *intended* / *permitted* are three questions with three authorities, and paved ground is none of them. §12 |
| Zoning / envelope solver | **NOT A CONSUMER, BY REFUSAL** | §0.3 row 2 — a drawn road may never feed `street_width` |

---

## §4 — PLUGIN ↔ DTO ↔ COMMAND ↔ BUILDER, AND WHAT "REACHABLE" COSTS

AS-IS: **nothing exists.** TO-BE, per C11 §11.2 and the measured `spaceEnvelope` landing:

| Leg | File | Note |
|---|---|---|
| store | `plugins/siteworks/src/store.ts` | `super('siteworks')` — the ctor arg MUST equal `registration.storeKey` |
| handlers | `plugins/siteworks/src/handlers/` | each: `readonly type`, `readonly affectedStores`, `canExecute`, `execute` wrapped in `withHandlerSpan` |
| roster | `plugins/siteworks/src/handlers/index.ts` | `SITEWORKS_HANDLER_TYPES` + `buildSiteworksHandlerSet()` |
| descriptor | `plugins/siteworks/src/registration.ts` | `satisfies PluginRegistration`, **never a type annotation** |
| composition | `apps/editor/src/PluginRegistry.ts` · `runtime-composer/src/{types,composeRuntime}.ts` · `PluginHost.ts` | ⛔ omitting the `StoresSlot` read-channel is **L-11530**, four days of silent data loss |
| undo | `apps/editor/src/engine/undo/performUndoRedo.ts` | `buildUndoStoreMap()` row |

⛔ **"Registered" is not "reachable".** Omit `storeKey` from the descriptor and `CommandBus.buildContext`
throws *"required store … is missing from HandlerContext.stores"* — the trap that hid pool, lift,
lighting, section and bathroomPod. [[committed-is-not-reachable]] — the proof is §13's reachability
test, not a passing unit suite.

---

## §5 — THE BRIDGE FIELD MAP

Every field of the create payload, and its destination. **Omission is forbidden (C84 EI-2); this is
the section a future `check-bridge-field-coverage` consumes.**

| Payload field | → record | Disposition |
|---|---|---|
| `id` | `id` | **CARRIED.** Minted by the CALLER (C16 CA-2) — `execute()` re-runs on redo |
| `levelId` | `levelId` | **CARRIED.** Stamped on the record AND on `mesh.userData.levelId` (CA-4) |
| `role` | `role` | **CARRIED** |
| `form` | `form` | **CARRIED** — the union discriminant |
| `centreline` | `centreline` | **CARRIED** when `form: 'linear'`; **REFUSED** when `'areal'` |
| `widthM` | `widthM` | **CARRIED** when `form: 'linear'`; **REFUSED** when `'areal'` |
| `boundary` | `boundary` | **CARRIED** when `form: 'areal'`; **REFUSED** when `'linear'` |
| `holes` | `holes` | **CARRIED** when `form: 'areal'`; **REFUSED** when `'linear'` |
| `thickness` | `thickness` | **CARRIED** |
| `baseOffset` | `baseOffset` | **CARRIED** |
| `name` | `name` | **CARRIED** |
| `materialId` | `materialId` | **CARRIED**, optional — the C100 master-material reference. §9e (amended): `Slab`'s pair is taken whole, because `check-material-id-required` ARM A is **hard-0** on a colour field without one |
| `materialColor` | `materialColor` | **CARRIED**, optional; the renderer supplies the default |
| *(none)* | `provenance` | **MINTED at the handler** — `RetrofittedProvenanceSchema` default. C75 §2.4 |
| *(none)* | `confidence` | **MINTED at the handler** — `RetrofittedConfidenceSchema` default. C75 §1.3 |
| *(none)* | *swept ring of a linear surface* | ⛔ **DELIBERATELY NOT A FIELD.** Derived by `sweepCentrelineToRing`, the family's one authority (ADR-0384 D2). A stored ring is a cache and goes stale on the next `setWidth` |
| *(none)* | *area in m²* | ⛔ **DELIBERATELY NOT A FIELD.** ⚠ **This DIVERGES from `SpaceEnvelope.footprintAreaM2`, and the divergence is named rather than silent:** an envelope's cached area feeds panels that SUM many records, so the read is hot; a siteworks surface's area is a pure function of two fields that the user edits directly, so a cache would need a writer at every mutation site and the one that forgets is the one that ships. One exported `siteworksAreaM2()`, one answer (C84 EI-9) |
| *(none)* | *terrain relationship* | ⛔ **DELIBERATELY ABSENT.** ADR-0384 D5, §12 |

---

## §6 — VERBS

| Verb | Lineage | Stores WRITTEN | Stores RESTORED on undo | Equal? |
|---|---|---|---|---|
| `siteworks.batch.create` | bus / `produceCommand` | `siteworks` | `siteworks` | ✅ |
| `siteworks.setWidth` | bus / `produceCommand` | `siteworks` | `siteworks` | ✅ |
| `siteworks.setThickness` | bus / `produceCommand` | `siteworks` | `siteworks` | ✅ |
| `siteworks.setRole` | bus / `produceCommand` | `siteworks` | `siteworks` | ✅ |
| `siteworks.delete` | bus / `produceCommand` | `siteworks` | `siteworks` | ✅ |
| batch create · delete · move · **rotate** · material · level change | — | ⛔ **`move`, `rotate`, `material` and `levelChange` are NOT IMPLEMENTED.** Named here because C84 §6 requires the row to exist rather than the verb: an omitted row reads as "fine" | | |

### §6a — There is no singular `siteworks.create`

⭐ **The batch verb IS the create path, even for one surface** — the shape C114 §6a already ruled.
One drawn road is a batch of one; a masterplan is a batch of forty; both are **one undo entry**
(C16 §8.6). Two verbs would let a surface spend forty Ctrl+Zs on one gesture.

### §6b — `setWidth` and `setThickness` are two verbs, on purpose

They are perpendicular, both in metres. ⛔ A single `setDimension` taking an axis name would make
every bug report about this family ambiguous. `setWidth` **refuses by name** on an areal surface —
an areal surface has no width, and silently doing nothing would be C16 CA-18's bare success.

---

## §7 — UNDO / REDO

`affectedStores: ['siteworks'] as const` — one store, and it is the store the handler writes, so
C16 CA-19's *"declared == measured"* holds by construction.

Undo routes through the single unified `performUndoRedo` (C03 §4.5) via the **generic**
`composedStoreUndoAdapter('siteworks', …)`. ⚠ **The generic adapter is only correct because the
render seam subscribes the store's dirty channel** — `Store.applyPatch` notifies `subscribeDirty` on
EXECUTE, UNDO and REDO alike. ⛔ **A renderer driven by bus EVENTS instead would need a bespoke
adapter** (`boundaryLine`'s shape), because `performUndoRedo` emits no bus events. This is recorded
so a future contributor who changes the render seam knows the adapter changes with it.

`NOT MEASURED:` whether redo restores or recomputes (C84 EI-7e) — there is no code yet.

---

## §8 — CASCADES

**None, and that is the design.** A siteworks surface triggers no room redetection, no wall rebuild, no
slab region trace, no column coupling.

⛔ **C16 CA-16 forbids a handler writing another family's store**, and there is no cross-family
effect to route through an event subscriber either. ⭐ **If a cascade ever appears — a road that
trims a parcel, a parking area that counts toward a zoning requirement — it lands as an event
subscriber and gets a row here IN THE SAME COMMIT.** An unnamed cascade outside patch capture is
what C84 §4C exists to catch.

---

## §9 — VOCABULARIES

### §9a — The role vocabulary (this family's own)

`SITEWORKS_ROLES = ['road', 'parking', 'pedestrian']` — a **closed union with a value roster**, so
a new member is a compile error at every exhaustive switch, and a typed
`Record<SiteworksRole, string>` gives each member **one sentence of explanation**. A role cannot
exist without an explanation. (The `SPACE_ENVELOPE_ROLES` property, inherited.)

⛔ **No `AUTHORABLE_SITEWORKS_ROLES` subset is minted.** All three are authorable, so a subset
with identical membership would be a second vocabulary answering a question with one answer
(C84 EI-8). If a non-authorable role ever appears, its subset arrives in the same commit.

### §9b — ⚠ TWO CONCEPTS ARE BOTH SPELLED "ROLE", AND THIS CONTRACT NAMES THE COLLISION

| "role" | Owner | Members |
|---|---|---|
| **the family's purpose discriminator** | `Siteworks.role`, this §9a | `road` · `parking` · `pedestrian` |
| **the SPATIAL-VALIDITY role** | [`C83 §2.2`](C83-SPATIAL-VALIDITY-AND-DESIGN-LOGIC.md) | `PASSAGE` · `APERTURE` · `STRUCTURE` · `OCCUPIABLE` · `CIRCULATION_SURFACE` |

A `siteworks` is a **`CIRCULATION_SURFACE`** in the second vocabulary, in all three of its own
roles. C84 EI-8 asks for one vocabulary per **concept**; these are two concepts, so the resolution
is to name the collision at the point of use — here and in the schema — not to rename either.
`SpaceEnvelope.role` established `role` as the family-discriminator spelling and consistency with
the nearest neighbour beats inventing `purpose`.

⛔ **AND THE C83 DECLARATION IS NORMATIVE INTENT, NOT A CAPABILITY.** Measured 2026-09-09:
`grep -rn "CIRCULATION_SURFACE\|SpatialRole\|OCCUPIABLE" packages plugins apps src --include=*.ts`
→ **no output.** C83 §2.2's vocabulary **does not exist in code.** §0.2 forbids claiming otherwise.

### §9c — The ground-plane point vocabulary is REUSED, not minted

`Vec3` with `y === 0`, OPEN rings (closing vertex implied) — the vocabulary
`Room.boundary` / `BoundaryLine.vertices` / `SpaceEnvelope.footprint` / `Slab.boundary` already
share. ⛔ **No fourth ground-plane vocabulary** (C84 EI-8). `boundary`, `holes`, `thickness` and
`baseOffset` are `Slab`'s spellings taken unchanged.

⭐ **`y === 0` and open-ring are enforced by `.refine()`, never asserted in a comment** — an ignored
vector component is C84 EI-2.d, and *"a comment as the synchronisation mechanism"* is C84 §8.d,
measured to have failed twice.

### §9d — ⭐ THE DEFAULT WIDTHS ARE A CITED RECORD, NOT THREE LITERALS

`SITEWORKS_DEFAULT_WIDTH_M` is a `Record<SiteworksRole, CitedDefault>` where a `CitedDefault`
carries `{ valueM, standing: 'standard' | 'convention', instrument, note }`. ⛔ **A bare number
cannot say where it came from, and a number that cannot say where it came from is
[[fake-more-capable-than-real]].**

| Role | Default | Standing | Instrument |
|---|---|---|---|
| `road` | **7.00 m** | `standard` | **Norma 3.1-IC "Trazado"** (Orden FOM/273/2016, `BOE-A-2016-2217`) §7 Tabla 7.1: *carril* **3,50 m** for a *carretera convencional* C-100/C-90/C-80 → two-way = **2 × 3,50 = 7,00 m de calzada**. The founder's *"typical national road two-sense wide"* |
| `pedestrian` | **1.80 m** | `standard` | **Orden VIV/561/2010** art. 5.2 — *itinerario peatonal accesible*, *anchura libre de paso* ≥ **1,80 m**. ⚠ `NOT MEASURED:` whether its successor **Orden TMA/851/2021** restates the figure |
| `parking` | **5.00 m** | ⚠ `convention` | One bay depth. **No Spanish national trazado instrument fixes a parking-bay dimension** — bay geometry is municipal-ordinance / PGOU territory, a per-jurisdiction fact this family does not resolve. ⚠ `NOT MEASURED:` whether any national instrument fixes it |

**Three riders, each of which is the point:**

1. ⭐ **7.00 m is the CALZADA. The *arcenes* are excluded**, deliberately. Tabla 7.1's C-80 section
   also carries 1,00 m shoulders; folding them in would inflate every paved-area figure by ~29 %,
   silently. A shoulder is a different surface with a different build-up.
2. ⚠ **These are JURISDICTION-ROOTED defaults and the schema says so** rather than implying
   universality. Cross-checked for order of magnitude against **UK DMRB CD 127** (two-lane single
   carriageway **7.3 m**) — within 4 %, which is evidence the number is not parochial and is **not**
   a second citation for it.
3. ⛔ **A default is not a constraint.** Nothing refuses a 3 m road or a 40 m one.

### §9e — Material vocabulary

The family carries **`materialId` + `materialColor`** — `Slab`'s pair, taken unchanged — and
**NO `systemTypeId` and NO `layers`**.

> ⛔ **AMENDED 2026-09-09 (lane SITE-SURFACE, at the first implementation step). As minted this
> section said "no `materialId` and no `systemTypeId`", and half of that was wrong — measurably.**
>
> As written, §9e was in **direct conflict with a hard-0 gate arm**.
> `tools/ga-gate/check-material-id-required.ts` **ARM A** fires on any element schema that declares
> a colour field and no `materialId`, quoting C100 §2.1: *"a hex is not a material; it is one
> attribute of one."* Measured at the start of this lane: **RC=3, ARM A colour-without-id 1 / 0**,
> the single offender being `packages/schemas/src/elements/SpaceEnvelope.ts`. Implementing §9e
> literally would have taken that hard-0 arm to **2 / 0** — a worse exit-3 whose new site is
> unambiguously **this family's**, and which is **not absorbable** (§RATCHET-EXCEEDED-IS-NEVER-DEBT,
> R7 / L-836). The gate's own words: *"A baseline is not permission (C68). Fix the new site; never
> raise the ceiling."*
>
> ⭐ **§9e conflated two different fields, and `Slab.ts` — the very file §9c binds this family to —
> proves they are separable.** Measured:
>
> ```
> packages/schemas/src/elements/Slab.ts
>   60:  materialId:    z.string().optional(),   <- the C100 master-material REFERENCE
>   61:  materialColor: z.string().optional(),   <- a display tint
>   62:  systemTypeId:  z.string().optional(),   <- the ASSEMBLY / schedulability machinery
> ```
>
> **`materialId` is not the schedulability machinery.** It is a reference into the master material
> database (C100). `systemTypeId` is what makes a slab a *typed assembly* that a floor schedule can
> total — and **that** is what §9e's stated reason actually objects to: *"adopting `Slab`'s
> system-type machinery would make a car park schedulable as building fabric"*. That objection is
> **preserved in full** and is why `systemTypeId` and `layers` are still refused (§0.3, §12).
>
> ⭐ **The amendment is justified by this family's own existing principle rather than a new
> argument.** §9c already binds it to *"`Slab`'s spellings taken unchanged"*. Taking `Slab`'s
> `materialId` + `materialColor` **pair** while declining `systemTypeId` + `layers` therefore
> satisfies C100 §2.1, satisfies §9e's stated intent, and mints no new vocabulary.
>
> ⚠ **And §9e's own `NOT MEASURED` is now discharged for the axis it named.** It read *"`NOT
> MEASURED` — which of C84 EI-8's V1–V5 material vocabularies applies."* Measured: the family takes
> **`Slab`'s**, minus the assembly half. That line is struck from §15.

A real paving build-up (courses, a sub-base, a binder) remains **§11 item 6** and must NOT arrive as
`Slab`'s `systemTypeId`, for the reason §0.3 gives: a car park is not a floor plate and must never
appear in a floor-area schedule.

---

## §10 — GEOMETRY

### §10a — THE DATUM — inherited from `Slab`, measured not chosen

> `worldY = level.elevation + baseOffset − thickness`
> — `packages/geometry-slab/src/SlabFragmentBuilder.ts:1090` (and `:1258`, `return topY - data.thickness`)

⭐ **The finished surface sits AT `level.elevation + baseOffset`; the construction hangs BELOW it.**
This is the convention `Slab` already holds. Adopting it rather than reasoning to it independently
is the difference between one rule and two — and had this family reasoned to the *opposite*
convention, two surfaces at the same `baseOffset` would silently fail to meet.

### §10b — THE ONE AUTHORITY

`sweepCentrelineToRing(centreline, widthM)` in `@pryzm/geometry-siteworks` — the single named
authority (C84 EI-1) that turns a linear surface into a ring. **Every consumer that needs the
footprint of a linear surface calls it.** A second sweep anywhere is [[same-rule-two-implementations]].

⛔ `NOT MEASURED:` mitre behaviour at interior polyline corners, and self-intersection on a
tight reversal. The sweep's own header states its limits; §11 item 2.

### §10c — Layering

`packages/geometry-siteworks` is **L2**: it imports `@pryzm/schemas` (L0) and nothing above.
⛔ **THREE-free** (P2) — it must appear in `eslint.config.js`'s `layerElements` or
`check-layer-boundaries.ts` cannot classify it.

`packages/schemas/src/elements/Siteworks.ts` is **L0-pure** (P5): Zod + plain TS, zero I/O, zero
THREE, zero DOM, **no OTel span** (a span is I/O).

---

## §11 — THE DELTA (ordered; each item names its invariant and its proof)

| # | Item | Invariant | Proof |
|---|---|---|---|
| 1 | **Terrain draping** — a surface that follows the ground | §CONTEXT-DATA-HONESTY; L-584 | a terrain sampler returning a PROFILE, not one centroid point. Refused by name today (§12) |
| 2 | **Sweep mitres and self-intersection** at polyline corners | C84 EI-1 (one authority) | a fixture from the real sampler, not a hand-built one — [[grep-for-the-existing-solver-first]] |
| 3 | **Reachability through the REAL composed runtime** | [[committed-is-not-reachable]] | dispatch → read back out of `rt.stores.siteworks` → serialise → clear → restore → read again |
| 4 | **Plan-view representation** | C11 §8.4 | ⛔ `NOT MEASURED` whether a siteworks surface belongs in a storey plan at all — decide before drawing it |
| 5 | **RAC / chat authoring** | C67 / C68 | a `ChatCapabilityRegistry` entry per verb. At mint every verb is `CHAT_UNAVAILABLE` with a refusal naming the route back to success |
| 6 | **Paving build-up (layers)** | C84 EI-8 | must NOT be `Slab`'s `systemTypeId` — §0.3 |
| 7 | **Junction resolution between crossing roads** | C84 EI-10 | §12 — refused, not deferred silently |
| 8 | **IFC identity** | C25 | resolve `IfcCourse` vs `IfcPavement` before any export claim |
| 9 | **Interactive centreline drawing** — the founder's *"linear design, like a wall"* | [[same-rule-two-implementations]] | ⛔ NOT a new `SiteworksPlanToolHandler`. `BoundaryLinePlanToolHandler.ts` (549 lines) already strokes an ortho/curved/looping polyline with snapping; the proof is that BOTH tools call ONE extracted stroke, not that a second one passes its own tests |

---

## §12 — REFUSALS — what this family deliberately does NOT support, and why

**A refusal is a correct answer. An undocumented one is not.**

| Refusal | Why |
|---|---|
| ⛔ **No terrain draping.** A surface is level-relative | The ordinance measures at the façade; PRYZM samples ONE terrain point at the centroid (L-584). A road draped over a one-point sample is *geometry the user believes*, which is worse than a wrong number in a panel. ADR-0384 D5 |
| ⛔ **No junction resolution.** Two crossing roads are two overlapping surfaces | Walls have `JunctionResolverV2` (ADR-0055) and it does **not** transfer: it keys on wall thickness and vertical faces. Forking it would be a second solver for a problem it does not solve. ADR-0384 §5 |
| ⛔ **No kerbs, markings, gradients, camber, superelevation or drainage** | A `siteworks` is a flat plane. §0.2 — a family named for a behaviour it does not have |
| ⛔ **`setWidth` refuses on an areal surface, by name** | An areal surface has no width. Silently doing nothing is C16 CA-18's bare success |
| ⛔ **No contribution to any floor-area, GFA or schedule figure** | C114 §3a generalised: *built* / *intended* / *permitted* are three questions with three authorities and paved ground is none of them. A car park in a GFA total is a wrong number with a citation attached |
| ⛔ **Never feeds the zoning `street_width` determination** | §0.3 row 2 — an architect could otherwise raise their own permitted height by widening a road they invented |
| ⛔ **Excluded from IFC export** until §1's identity is resolved | Guessing an IFC class exports intent as fact — C114 §1's precedent |
| ⛔ **No `sourceFeatureId`; context roads are not adopted** | Two answers to *"where is the road"* is C84 EI-9 |
| ⛔ **Overlap between two siteworks surfaces is NOT refused** | A drive crossing a plaza is a normal design. [[spatial-validity-rules-founder-direction]] puts this in FINE/INADVISABLE, and the founder's standing direction is **always ASK, never silently correct**. ⛔ `NOT MEASURED:` whether an advisory is wanted |

---

## §13 — GATES

| Gate | What it asserts here |
|---|---|
| `tools/ga-gate/check-domain-purity.ts` | the L0 schema is Zod + plain TS; **hard-0** |
| `tools/ga-gate/check-three-imports.ts` | the geometry package imports no THREE; **hard-0** (P2) |
| `tools/ga-gate/check-otel-spans.ts` | every `siteworks.*` handler carries ≥1 span; **ZONE A, zero tolerance** (P8 / C16 CA-14) |
| `tools/ga-gate/check-layer-boundaries.ts` | the new packages are classified in `eslint.config.js` |
| `tools/ga-gate/check-no-direct-store-writes.ts` | **zero NEW tolerated direct writes** (P6) |
| `tools/ga-gate/check-contract-index-equivalence.ts` | this file has a `README.md` row **in the same commit** |
| provenance/confidence coverage | `provenance` + `confidence` spelled INLINE in the file declaring `defineElement('siteworks')` — an indirection hides them from the retrofit-safety arm (C62 / C75) |
| `tools/ga-gate/check-contract-cited-paths.ts` | every repo path cited above resolves, or is marked PLANNED |

---

## §14 — STATUS (living record — appended, never rewritten)

### 2026-09-09 · lane SITE-SURFACE — the contract is minted BEFORE the family

Nothing is built. §0.1's measurement is the whole status: **0 files.** This section grows as legs
land, each entry naming its proof.

### 2026-09-09 · lane SITE-SURFACE · **STAGE 1 — REGISTRATION, RENAME AND TWO CORRECTIONS.** No element code yet.

**What landed, and what each thing is a proof of:**

| Change | Proof |
|---|---|
| **`contracts/README.md` gained the C116 row**, and **the range moved with it** in the same commit | `npx tsx tools/ga-gate/check-contract-index-equivalence.ts` → **RC=0 · arm A 18 = baseline · arms B/C/D clean** (it read **RC=3, arm A 19/18** before, C116 being the sole 19th) |
| **The element kind was renamed `siteSurface` → `siteworks`** throughout this contract and ADR-0384, per the ORCHESTRATOR RULING at the head of this file | `grep -rn "siteworks\|Siteworks\|SITEWORKS" --include=*.ts --include=*.tsx --include=*.json packages plugins apps src server tools docs` → **0 code hits** before the rename was chosen. ⛔ The UI's nine `siteSurface` files were **not touched** |
| **§0.1 corrected in place** — its "0 files" was false when written | the 9-file re-run and the 5 h 46 min ordering are quoted in the correction box |
| **§9e amended in place** — `materialId` is now REQUIRED alongside `materialColor`; `systemTypeId`/`layers` stay refused | `check-material-id-required` ARM A is **hard-0 and already breached 1/0** by `SpaceEnvelope`; implementing §9e as minted would have made it **2/0 at this family's own new site**, which is not absorbable. `Slab.ts:60-62` is the evidence the two fields are separable |
| **Eleven forward-looking citations marked `⏳ PLANNED`** with the stage that removes each | `check-contract-cited-paths` → **RC=0, 462 = baseline 462** (it read **RC=3, 469/462** before — over by exactly the 7 distinct paths this family declares). ⛔ These are **not laundering**: each marker names the stage that makes the path real and is removed in that commit |

⛔ **NOTHING IS REACHABLE. There is no schema, no store, no verb, no plugin, no renderer and no UI
control.** §0.1 still governs.

### 2026-09-09 · lane SITE-SURFACE · **STAGE 2 — THE L0 SCHEMA AND ITS FOUR REGISTERS.** Still not reachable.

`packages/schemas/src/elements/Siteworks.ts` — `defineElement('siteworks', …)` with eight
`.refine()` invariants — plus the four registers ADR-0376 D9 requires **in one commit**:
`elements/index.ts`, `registry.ts` (`SCHEMA_REGISTRY`), and `types/Id.ts` (brand · `ElementType` ·
`AnyElementId` · `IdFor`).

| Gate / proof | Reading |
|---|---|
| `check-provenance-coverage` | **RC=0 · 33 kinds discovered, 33 covered · ledger EMPTY · hard-0, both directions.** `siteworks` appears in both lists. It read 32/32 before. `provenance` and `confidence` are spelled **literally** at the point of use, because the gate measures the file declaring `defineElement()` and an indirection hides them from its C3 arm |
| `check-domain-purity` (P5) | **RC=0 · 209 files · 0 impurities.** Zod + plain TS; no I/O, THREE, DOM or OTel span |
| `check-material-id-required` | ARM A **still 1 / 0 — NOT 2 / 0.** The family declares `materialId` beside `materialColor`, so it adds no new site to a hard-0 arm. Every other arm unchanged at baseline |
| `check-contract-cited-paths` | **RC=0 · 462 = baseline.** Three stage-2 `⏳ PLANNED` markers REMOVED in this commit, as promised — the schema path now resolves for real |
| root `tsc --noEmit --skipLibCheck` | **RC=0** |
| `packages/schemas` vitest | **37 / 37 pass** (`__tests__/siteworks.test.ts`) |

⭐ **THE SCRAMBLE CONTROL (L-586) FOUND A REAL DEFECT — IN THE TEST, WHICH IS THE POINT.**
Six invariants were deliberately broken in the production schema and the arms re-run:

| Scramble | Arms that went RED |
|---|---|
| centreline `y === 0` refine deleted | 1 |
| linear-carries-no-boundary refine deleted | 2 |
| open-ring refine deleted | 2 |
| cited road width changed 7,00 → 7,50 m | 1 |
| zero-length-segment refine deleted | 1 |
| **`systemTypeId` re-added to the schema** | ⛔ **0 — the arm did not bind** |

The refusal arms read `expect('systemTypeId' in parsed).toBe(false)`. **An
`z.string().optional()` that is never supplied produces no key either**, so the assertion was
true whether or not the field was declared — it measured nothing, and would have reported a
breached refusal as healthy forever. Rebound to supply the value and assert it is **STRIPPED**;
re-scrambled with `systemTypeId` + `sourceFeatureId` + `areaM2` re-added → **3 arms RED**.

⚠ **ONE DIVERGENCE FROM ADR-0384 D2, RECORDED RATHER THAN SILENT.** D2 says *"a discriminated
union on `form`"*. This is a FLAT object with `form` as the discriminant and `.refine()` enforcing
the pairing, because (a) `defineElement` returns a `z.object` — it mints the branded-id regex and
`BaseNodeShape` at the object level, and `SCHEMA_REGISTRY` maps one kind to one schema — and (b)
**no element schema in this repository uses `discriminatedUnion`** (measured:
`grep -rn "discriminatedUnion" packages/schemas/src/elements/` → no output). ⭐ **D2's semantics
are fully preserved and ENFORCED**: the wrong-form geometry field is refused by a `.refine()`, not
ignored by convention.

⛔ **STILL NOT REACHABLE.** There is no store, no verb, no handler, no plugin, no renderer and no
UI control. A registered schema is not a working element — §0.1's standing warning.

### 2026-09-09 · lane SITE-SURFACE · **STAGE 3 — THE L2 GEOMETRY.** Still not reachable.

`packages/geometry-siteworks` — `sweepCentrelineToRing` (the C84 EI-1 named authority),
`siteworksFootprintRing` (the seam that keeps `form` from leaking to consumers),
`siteworksAreaM2` and `siteworksDatum`. THREE-free, DOM-free, I/O-free.

#### ⭐ THE SWEEP DOES NOT CONTAIN THE OFFSET ARITHMETIC, AND THAT IS THE MOST IMPORTANT LINE IN THIS ENTRY

The standing instruction was to grep for the existing solver first
([[grep-for-the-existing-solver-first]]). Measured, and the answer was stronger than *"one exists"*:

- `packages/geometry-kernel/src/pure/polygonOffset.ts` says in its own header that it is *"THE
  polygon offset for this repo … If you are about to add a third, don't: extend this one and add a
  fixture."*
- ⛔ **`tools/ga-gate/check-offset-implementations.ts` COUNTS independent offset implementations.**
  It reads **0 outside that file, exit target 0**, and its `edge-shift-miter` signature matches the
  Cramer solve of two shifted supporting lines — **exactly** the arithmetic a ribbon sweep needs. A
  mitre written inside `geometry-siteworks` would have taken it **0 → 1 = exit 3**.
- The gate's header records what it is protecting against: the same offset lived in three places at
  three levels of correctness, the UNTOUCHED copy was the one the shipping committer called, and a
  user asking for a 300 mm eave got 212 mm. **Each copy passed its own package's tests.**

⭐ **So the kernel gained `offsetOpenPolyline`** — the OPEN half of the arithmetic it already owned —
and `offsetPolygon` was refactored to share `shiftedLineFor` and `miterVertexInto` with it, so there
is **one mitre body, called twice**. `dedupeRing` likewise now delegates to a new `dedupeConsecutive`
(the open-polyline form), because a road may legitimately return to its first point — a loop or a
roundabout — and `dedupeRing`'s wrap-around drop would silently shorten it by one segment.

| Gate / proof | Reading |
|---|---|
| `polygonOffset.oracle.test.ts` | **13 / 13 pass, unchanged** — the proof that extracting the shared mitre altered no closed-ring behaviour |
| `check-offset-implementations` | **RC=0 · still 0 / 0** outside the canonical file, exit target 0 |
| `check-three-imports` (P2) | **RC=0** |
| `check-layer-boundaries` | **RC=0 · unclassified still 13 / 13**, not 14 — `eslint.config.js` gained the `{ type: 'L2', pattern: 'packages/geometry-siteworks/**' }` row in this commit |
| `check-domain-purity` · `check-contract-cited-paths` | **RC=0** · the stage-3 marker is removed |
| `@pryzm/geometry-siteworks` vitest | **22 / 22** |

#### ⭐ THE SCRAMBLE CONTROL FOUND DEAD CODE MASQUERADING AS A SAFETY GUARD

| Scramble | Arms RED |
|---|---|
| sweep the FULL width each side instead of half | 6 |
| self-intersection refusal deleted | 2 |
| **CCW winding normalisation deleted** | ⛔ **0** |
| hole subtraction removed | 2 |
| datum inverted (plate extrudes UP) | 3 |
| refusal replaced by an empty ring | 2 |

An explicit `signedArea > 0 ? ring : reverse(ring)` stood at the end of the sweep. **Deleting it
changed nothing**, because walking out along the `+normal` side and back along the `−normal` side
had *already* fixed the winding. ⛔ **A guard that cannot fire reads as protection and provides
none** — it would have told a future reader that winding was a hazard being handled there, when it
is an invariant established one line above. The line was REMOVED and the arm rebound onto the
assembly order, which is live logic: reversing that order now turns **3 arms RED**.

⚠ **A TEST EXPECTATION WAS WRONG AND THE CODE WAS RIGHT** — recorded because the correction is the
useful part. The L-corner arm expected **651 m²** for two 50 m legs at 7 m, reasoning that a mitre
must remove the double-counted 7 × 7 corner. Measured: **700 m²**. A *mitred* ribbon around a
polyline of length L has area **exactly L × w** — at each corner the outer side gains a triangle and
the inner side loses an equal one, so they cancel. 651 m² is the area of the **union of two
butt-jointed rectangles**, a different construction. The arm now pins the two exact mitre points
(53.5, −3.5) and (46.5, 3.5) and a 6-vertex ring, which *discriminates* mitre from butt; a 120°
bend arm was added so the result is not a coincidence of right angles.

⭐ **C116 §10b's `NOT MEASURED` ON SELF-INTERSECTION IS NOW MEASURED.** The assembled ring is run
through the kernel's `findSelfIntersection` and a fold is **REFUSED BY NAME** with the two crossing
edge indices. A folded ribbon rendered as if sound is geometry the user believes.
⚠ Still `NOT MEASURED`: whether a bevelled hairpin is the shape a road designer wants, and a corner
whose radius is under half the width but which does not actually cross — that ring is returned and
may pinch.

⛔ **STILL NOT REACHABLE.** No store, no verb, no handler, no plugin, no renderer, no UI.

### 2026-09-09 · lane SITE-SURFACE · **STAGES 4–6 — THE FAMILY IS REACHABLE, PERSISTS, AND HAS A UI.**

#### Stage 4 — the plugin and every register that makes it reachable

`plugins/siteworks`: the store (`super('siteworks')` matching `registration.storeKey`), five
handlers each wrapped in `withHandlerSpan`, the descriptor with `satisfies`, and the barrel.
Then — in the SAME commit, because *"registered is not reachable"* cost four days of silent loss
(L-11530) — `PluginRegistry` (import · `ALL_PLUGINS` · `ELEMENT_PLUGIN_IDS`), `PluginHost`
(`PLUGIN_CATALOG`), `runtime-composer` (`StoresSlot.siteworks` + **adoption**, never construction,
+ the project-scoped clear list), `performUndoRedo` (`buildUndoStoreMap`), `ProjectSerializer`
(key + lazy read + the C84 EI-6 count), `restoreCompoundFamilies` (**the COMMON TAIL**, never a
branch — L-11528), `snapshotFamilyCoverage`, `syncDisposition` (all five verbs),
`ChatCapabilityRegistry` (five `CHAT_UNAVAILABLE` refusals), `CANONICAL_PREFIXES`, and a
regenerated `API-VERB-REGISTER.md`.

| Gate | Reading |
|---|---|
| `check-otel-spans` | **RC=0. ZONE A 281 / 281 at ZERO TOLERANCE. ZONE B 52 uninstrumented of 90 against baseline 52** — the denominator grew by one and the COUNT DID NOT. ⛔ Zone B had **zero headroom** and its baseline is a NAMED FILE LIST that explicitly includes plugin `src/handlers/index.ts` barrels, so an uninstrumented barrel would have read 53/52 = exit 3, unabsorbable (R7 / L-836). The barrel wraps registration in `withHandlerSpan` |
| `check-plugin-census-equivalence` | ⭐ **`siteworks` appears in ZERO of the eight arms** — on disk, in the registry, in the catalog, and in `ELEMENT_PLUGIN_IDS`. The gate is still RC=3 (arms B 9/8, E 1/0, F 4/3) and **every breach names `component`**, which predates this lane |
| `check-snapshot-family-coverage` | **RC=0 · 33 families / 33 rows · sets equal in BOTH directions.** It was RC=1 naming `siteworks` before this commit — the tripwire fired exactly as designed |
| `check-verb-register` | **RC=0 · 379 verbs**, matching the code both ways |
| `check-command-naming` | `siteworks` canonical. Rival spellings measured BEFORE admission (the only thing separating the sanctioned move from the L-796 defect): `'road.'` **0**, `'pavement.'` **0**, `'surface.'` **0**, `'paving.'` **0** |

#### Stage 5 — ⭐ THE REACHABILITY PROOF

`apps/editor/__tests__/siteworksReachableThroughComposedRuntime.test.ts` — **17 / 17**. It boots
the **REAL** `composeRuntime()`, dispatches every verb, reads records back **OUT of
`rt.stores.siteworks`** (C16 CA-21 — never the handler's return, never a spy), serialises through
the real `ProjectSerializer`, clears, restores through the real `restoreCompoundFamilies`, reads
again, and undoes/redoes through the production `applyRingBufferSide` + `buildUndoStoreMap()`.
`plugins/siteworks/__tests__/siteworksHandlers.test.ts` — **23 / 23** for what the handlers DO.

⚠ **TWO HARNESS DEFECTS WERE FOUND BY RUNNING IT, and both are worth recording** because each
would have produced a *vacuous* suite: the composed bus exposes `executeCommand(type, payload)`
and NOT `dispatch({type, …})` — the first draft failed every dispatching arm with *"no handler
registered for: [object Object]"*; and `RingBufferUndoStack.undo()` returns **void** (it only
moves the cursor) while `undoPatch()` is the one that hands back the side. ⭐ The verb-registration
arm was then rewritten to probe **BY DISPATCH** rather than by a descriptor read, because a
handler can be registered and undispatchable — which is the whole trap.

#### Stage 6 — the `Master planning` rail category (the founder's ask, D7)

Four data sites (`ToolsSectionId` · the `SectionDef` row · `_sectionState` · `_refreshAll`'s id
list) plus a new discipline section whose tools come from a **REGISTRY**, not from the panel:
`masterPlanningRailRegistry.ts`. ⭐ That is D7's *"ONE category, backed by a data-driven entry
registry"*, so ADR-0383's lane adds a ROW rather than a second rail — C82's 267-of-280 dead-pair
census at its first instant is what the shared registry refuses.

⛔ **C82 IS THE ACCEPTANCE BAR AND IT IS MET BY AN ACTIVATION TEST, NOT A RENDER TEST.**
`siteworksRailTools.test.ts` — **11 / 11** — PRESSES each entry and reads the surface back out of
a real store through a real `CommandBus` and the real handlers. A test asserting "the category has
three entries with the right labels" would have passed on all 267 of those dead pairs too.

⚠ **REPORTED, NOT ASSUMED: ADR-0384 D7 claims the category is "CO-OWNED with ADR-0383 from its
first commit". ADR-0383 contains no such ruling.** Measured 2026-09-09:
`grep -n -i "rail\|category\|registry"` over that ADR → **no output**, and its landed code
(`massingGroupRoster.ts`, `massingGroupSelectionState.ts`) adds no rail entry. The registry is
built so that lane can join it without touching `CreateRailPanel`; whether ADR-0383 gains the
reciprocal row, or D7's claim is corrected, is the orchestrator's call and is named in
`masterPlanningRailRegistry.ts` rather than papered over.

⚠ **WHAT THE RAIL BUTTONS DO NOT DO — stated plainly (§0.2).** They do not let you DRAW the
centreline yet. Pressing **Road** places a 40 m linear surface at the plan origin on the active
level at the CITED 7,00 m width; everything after that — width, thickness, role, delete, undo,
save/reload — is live. ⛔ Interactive polyline authoring is deliberately NOT cloned here:
`BoundaryLinePlanToolHandler.ts` is **549 lines** and already draws an ortho/curved/looping
polyline with snapping, so a `SiteworksPlanToolHandler` beside it would be a SECOND polyline
stroke — [[same-rule-two-implementations]] — and the guarding test would stay green on whichever
copy it happened to measure. The correct move is to EXTRACT the stroke from that handler so both
call it, which is a refactor of another lane's live tool. **Added as §11 item 9.**

⛔ **STILL NOT DRAWN IN 3-D.** Nothing subscribes `store.subscribeDirty` at this commit, so a
siteworks surface is a record you can create, edit, undo, save and reload — and not yet see. §3's
renderer row stays **ABSENT**.

---

## §15 — NOT MEASURED (explicit, per C84 EI-1b)

- Whether a siteworks surface belongs in a **storey plan view** at all (§11 item 4).
- **IFC identity** — `IfcCourse` vs `IfcPavement` (§1).
- **GLB export / bake worker** behaviour (§3).
- Whether an **overlap advisory** between two siteworks surfaces is wanted (§12).
- Whether **tracing a context road** into an authored one is wanted (§0.3).
- Whether **Orden TMA/851/2021** restates the 1,80 m pedestrian figure (§9d).
- Whether any **national instrument** fixes a Spanish parking-bay dimension (§9d).
- ~~Which of C84 EI-8's **V1–V5 material vocabularies** applies (§9e).~~ ⭐ **DISCHARGED 2026-09-09**
  — the family takes **`Slab`'s** (`materialId` + `materialColor`), minus the assembly half
  (`systemTypeId`, `layers`), which stays refused. §9e carries the measurement and the reason.
- Whether the family participates in the **living graph** (C71).
