# C116 — ELEMENT: SITE SURFACE (roads · parking · pedestrian areas)

**Status:** CANONICAL · **Minted:** 2026-09-09 · **Lane:** SITE-SURFACE
**Ratified by:** [`ADR-0384`](../adrs/ADR-0384-the-site-surface-is-one-family-with-two-forms-and-three-roles.md)
(nine rulings) · **Authority above it:** the founder transmission of **2026-09-09** (§0, verbatim).
**Binds:** every PR touching the `siteSurface` family, per [`C84 §6`](C84-ELEMENT-INTEGRITY.md).
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

A **site surface** is an AUTHORED flat paved surface laid on the site: a footprint on a level's XZ
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
grep -rl "siteSurface\|SiteSurface" --include=*.ts --include=*.tsx \
     packages plugins apps src server tools
→ 0 files.
```

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
Everything else here is normative intent. ⛔ **In particular: the family is called `siteSurface` and
not `road` precisely so that nobody reads road ENGINEERING into it.** It is a paved plane. §12 is
the list of everything a road engineer would expect and will not find.

### §0.3 — THE FOUR THINGS IT IS NOT

| Not this | Why the confusion is dangerous |
|---|---|
| **`Slab`** (`packages/schemas/src/elements/Slab.ts`) | A slab is **building fabric on a storey**: it is scheduled, it carries a system type and layers, it couples to columns (`SlabColumnCoupling`) and traces regions from walls (`SlabRegionTracer`). A car park is not a floor plate and must not appear in a floor-area schedule. ⭐ **Its FIELD SPELLINGS are reused verbatim (§9) and its DATUM RULE is inherited (§10) — its IDENTITY is not** |
| **The zoning `street_width` family** (`packages/site-parcel-data/src/geometry/streetWidth.ts`, `BCN_OFFICIAL_STREET_WIDTHS`, `MURCIA_STREET_WIDTH_AUTHORITY`, …) | ⛔ **The single most dangerous confusion in this contract.** That subsystem MEASURES the width of an EXISTING street in order to resolve a LEGAL height limit; it is a determination with a confidence, a provenance and a refusal vocabulary. A `siteSurface` is a DESIGN the user drew. **A drawn road must never be read as a measured street width**, or an architect would raise their own permitted height by widening a road they invented |
| **`SpaceEnvelope`** (`./C114-ELEMENT-SPACE-ENVELOPE.md`) | A prism with a `height`, extruded UP; this is a plate with a `thickness`, extruded DOWN. They share the ONE-KIND-WITH-A-ROLE architecture (ADR-0380 D2 → ADR-0384 D1) and share nothing else |
| **A context road from the geospatial bake** (`R2` roads layer, `context-3d-tiles-not-live-overpass`) | Context roads are **surveyed fabric around the site**, baked as tiles and never editable. A `siteSurface` is authored inside the project. Two answers to *"where is the road"* would be C84 EI-9 — so the family carries no `sourceFeatureId` and does not adopt context geometry. `NOT MEASURED:` whether tracing a context road into an authored one is wanted |

---

## §1 — IDENTITY

| Axis | AS-IS (measured 2026-09-09) | TO-BE (normative) |
|---|---|---|
| Canonical `elementType` tag | **ABSENT** | `'siteSurface'` — `Id.ts` (`ElementType` union) + `registry.ts` (`SCHEMA_REGISTRY`) |
| Every spelling in use (§4E) | **none** | ⛔ **hold the count at ONE**: `siteSurface`. `road`, `surface`, `pavement`, `paving`, `siteslab` and `groundSurface` are FORBIDDEN spellings for this family (C84 EI-8). The kind is never bare `surface`, so a grep for one never returns an unrelated hit |
| L0 schema | **ABSENT** | `packages/schemas/src/elements/SiteSurface.ts` — `defineElement('siteSurface', …)` + `.refine()` invariants |
| Branded id | **ABSENT** | `SiteSurfaceId = Id<'siteSurface'>`, in `AnyElementId` and `IdFor`. Runtime prefix is derived by `createId('siteSurface')` — there is no separate prefix table |
| Bus verb namespace | **ABSENT** | `siteSurface.*` per C69 §3.6 (the namespace is the kind, never an abbreviation). Roster in §6 |
| Geometry package | **ABSENT** | `packages/geometry-site-surface` — **L2**, THREE-free, declared in `eslint.config.js`'s `layerElements` |
| Plugin | **ABSENT** | `plugins/site-surface` (`@pryzm/plugin-site-surface`), `storeKey: 'siteSurface'` |
| IFC identity | ⛔ **NOT MEASURED.** `IfcCourse` / `IfcPavement` (IFC 4.3 infrastructure) are plausible; neither was verified | resolve before any IFC export claim. ⛔ Until resolved the family is **EXCLUDED** from IFC export rather than guessed into it — C114 §1's precedent for this exact position |

---

## §2 — STORES, AND WHICH ONE IS THE AUTHORITY

| Representation | Where | Authority? |
|---|---|---|
| **L0 record** `SiteSurface` | `packages/schemas/src/elements/SiteSurface.ts` | **the shape** |
| **Plugin store** `SiteSurfaceStore extends Store<SiteSurface>` | `plugins/site-surface/src/store.ts`, `storeKey: 'siteSurface'` | ⭐ **THE AUTHORITY (C84 EI-1).** Reached as `runtime.stores.siteSurface` |
| plugin DTO twin | **none, deliberately** | — |
| legacy geometry store | **none, deliberately** | — |
| scene `userData` | mesh carries `{ type: 'siteSurface', id, levelId }` | **a projection, never a source** |

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
| Plan view | **ABSENT** | ⛔ `NOT MEASURED` whether a site surface belongs in a storey plan at all. Deferred rather than guessed — §11 item 4 |
| Persistence | **ABSENT** | `snapshotFamilyCoverage.ts` ledger row + `ProjectSerializer` + `restoreCompoundFamilies` common tail |
| IFC export | **EXCLUDED** (§1) | resolve identity first |
| GLB export / bake worker | ⛔ **NOT MEASURED** | — |
| Schedules / quantities | **ABSENT** | ⛔ **A site surface MUST NOT contribute to any floor-area or GFA figure.** C114 §3a's rule generalises: *built* / *intended* / *permitted* are three questions with three authorities, and paved ground is none of them. §12 |
| Zoning / envelope solver | **NOT A CONSUMER, BY REFUSAL** | §0.3 row 2 — a drawn road may never feed `street_width` |

---

## §4 — PLUGIN ↔ DTO ↔ COMMAND ↔ BUILDER, AND WHAT "REACHABLE" COSTS

AS-IS: **nothing exists.** TO-BE, per C11 §11.2 and the measured `spaceEnvelope` landing:

| Leg | File | Note |
|---|---|---|
| store | `plugins/site-surface/src/store.ts` | `super('siteSurface')` — the ctor arg MUST equal `registration.storeKey` |
| handlers | `plugins/site-surface/src/handlers/` | each: `readonly type`, `readonly affectedStores`, `canExecute`, `execute` wrapped in `withHandlerSpan` |
| roster | `plugins/site-surface/src/handlers/index.ts` | `SITE_SURFACE_HANDLER_TYPES` + `buildSiteSurfaceHandlerSet()` |
| descriptor | `plugins/site-surface/src/registration.ts` | `satisfies PluginRegistration`, **never a type annotation** |
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
| `materialColor` | `materialColor` | **CARRIED**, optional; the renderer supplies the default |
| *(none)* | `provenance` | **MINTED at the handler** — `RetrofittedProvenanceSchema` default. C75 §2.4 |
| *(none)* | `confidence` | **MINTED at the handler** — `RetrofittedConfidenceSchema` default. C75 §1.3 |
| *(none)* | *swept ring of a linear surface* | ⛔ **DELIBERATELY NOT A FIELD.** Derived by `sweepCentrelineToRing`, the family's one authority (ADR-0384 D2). A stored ring is a cache and goes stale on the next `setWidth` |
| *(none)* | *area in m²* | ⛔ **DELIBERATELY NOT A FIELD.** ⚠ **This DIVERGES from `SpaceEnvelope.footprintAreaM2`, and the divergence is named rather than silent:** an envelope's cached area feeds panels that SUM many records, so the read is hot; a site surface's area is a pure function of two fields that the user edits directly, so a cache would need a writer at every mutation site and the one that forgets is the one that ships. One exported `siteSurfaceAreaM2()`, one answer (C84 EI-9) |
| *(none)* | *terrain relationship* | ⛔ **DELIBERATELY ABSENT.** ADR-0384 D5, §12 |

---

## §6 — VERBS

| Verb | Lineage | Stores WRITTEN | Stores RESTORED on undo | Equal? |
|---|---|---|---|---|
| `siteSurface.batch.create` | bus / `produceCommand` | `siteSurface` | `siteSurface` | ✅ |
| `siteSurface.setWidth` | bus / `produceCommand` | `siteSurface` | `siteSurface` | ✅ |
| `siteSurface.setThickness` | bus / `produceCommand` | `siteSurface` | `siteSurface` | ✅ |
| `siteSurface.setRole` | bus / `produceCommand` | `siteSurface` | `siteSurface` | ✅ |
| `siteSurface.delete` | bus / `produceCommand` | `siteSurface` | `siteSurface` | ✅ |
| batch create · delete · move · **rotate** · material · level change | — | ⛔ **`move`, `rotate`, `material` and `levelChange` are NOT IMPLEMENTED.** Named here because C84 §6 requires the row to exist rather than the verb: an omitted row reads as "fine" | | |

### §6a — There is no singular `siteSurface.create`

⭐ **The batch verb IS the create path, even for one surface** — the shape C114 §6a already ruled.
One drawn road is a batch of one; a masterplan is a batch of forty; both are **one undo entry**
(C16 §8.6). Two verbs would let a surface spend forty Ctrl+Zs on one gesture.

### §6b — `setWidth` and `setThickness` are two verbs, on purpose

They are perpendicular, both in metres. ⛔ A single `setDimension` taking an axis name would make
every bug report about this family ambiguous. `setWidth` **refuses by name** on an areal surface —
an areal surface has no width, and silently doing nothing would be C16 CA-18's bare success.

---

## §7 — UNDO / REDO

`affectedStores: ['siteSurface'] as const` — one store, and it is the store the handler writes, so
C16 CA-19's *"declared == measured"* holds by construction.

Undo routes through the single unified `performUndoRedo` (C03 §4.5) via the **generic**
`composedStoreUndoAdapter('siteSurface', …)`. ⚠ **The generic adapter is only correct because the
render seam subscribes the store's dirty channel** — `Store.applyPatch` notifies `subscribeDirty` on
EXECUTE, UNDO and REDO alike. ⛔ **A renderer driven by bus EVENTS instead would need a bespoke
adapter** (`boundaryLine`'s shape), because `performUndoRedo` emits no bus events. This is recorded
so a future contributor who changes the render seam knows the adapter changes with it.

`NOT MEASURED:` whether redo restores or recomputes (C84 EI-7e) — there is no code yet.

---

## §8 — CASCADES

**None, and that is the design.** A site surface triggers no room redetection, no wall rebuild, no
slab region trace, no column coupling.

⛔ **C16 CA-16 forbids a handler writing another family's store**, and there is no cross-family
effect to route through an event subscriber either. ⭐ **If a cascade ever appears — a road that
trims a parcel, a parking area that counts toward a zoning requirement — it lands as an event
subscriber and gets a row here IN THE SAME COMMIT.** An unnamed cascade outside patch capture is
what C84 §4C exists to catch.

---

## §9 — VOCABULARIES

### §9a — The role vocabulary (this family's own)

`SITE_SURFACE_ROLES = ['road', 'parking', 'pedestrian']` — a **closed union with a value roster**, so
a new member is a compile error at every exhaustive switch, and a typed
`Record<SiteSurfaceRole, string>` gives each member **one sentence of explanation**. A role cannot
exist without an explanation. (The `SPACE_ENVELOPE_ROLES` property, inherited.)

⛔ **No `AUTHORABLE_SITE_SURFACE_ROLES` subset is minted.** All three are authorable, so a subset
with identical membership would be a second vocabulary answering a question with one answer
(C84 EI-8). If a non-authorable role ever appears, its subset arrives in the same commit.

### §9b — ⚠ TWO CONCEPTS ARE BOTH SPELLED "ROLE", AND THIS CONTRACT NAMES THE COLLISION

| "role" | Owner | Members |
|---|---|---|
| **the family's purpose discriminator** | `SiteSurface.role`, this §9a | `road` · `parking` · `pedestrian` |
| **the SPATIAL-VALIDITY role** | [`C83 §2.2`](C83-SPATIAL-VALIDITY-AND-DESIGN-LOGIC.md) | `PASSAGE` · `APERTURE` · `STRUCTURE` · `OCCUPIABLE` · `CIRCULATION_SURFACE` |

A `siteSurface` is a **`CIRCULATION_SURFACE`** in the second vocabulary, in all three of its own
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

`SITE_SURFACE_DEFAULT_WIDTH_M` is a `Record<SiteSurfaceRole, CitedDefault>` where a `CitedDefault`
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

⛔ `NOT MEASURED` — which of C84 EI-8's V1–V5 material vocabularies applies. The family carries an
optional `materialColor` string (the `Slab`/`SpaceEnvelope` spelling) and **no `materialId` and no
`systemTypeId`**, because adopting `Slab`'s system-type machinery would make a car park schedulable
as building fabric (§0.3). A real paving build-up is §11 item 6.

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

`sweepCentrelineToRing(centreline, widthM)` in `@pryzm/geometry-site-surface` — the single named
authority (C84 EI-1) that turns a linear surface into a ring. **Every consumer that needs the
footprint of a linear surface calls it.** A second sweep anywhere is [[same-rule-two-implementations]].

⛔ `NOT MEASURED:` mitre behaviour at interior polyline corners, and self-intersection on a
tight reversal. The sweep's own header states its limits; §11 item 2.

### §10c — Layering

`packages/geometry-site-surface` is **L2**: it imports `@pryzm/schemas` (L0) and nothing above.
⛔ **THREE-free** (P2) — it must appear in `eslint.config.js`'s `layerElements` or
`check-layer-boundaries.ts` cannot classify it.

`packages/schemas/src/elements/SiteSurface.ts` is **L0-pure** (P5): Zod + plain TS, zero I/O, zero
THREE, zero DOM, **no OTel span** (a span is I/O).

---

## §11 — THE DELTA (ordered; each item names its invariant and its proof)

| # | Item | Invariant | Proof |
|---|---|---|---|
| 1 | **Terrain draping** — a surface that follows the ground | §CONTEXT-DATA-HONESTY; L-584 | a terrain sampler returning a PROFILE, not one centroid point. Refused by name today (§12) |
| 2 | **Sweep mitres and self-intersection** at polyline corners | C84 EI-1 (one authority) | a fixture from the real sampler, not a hand-built one — [[grep-for-the-existing-solver-first]] |
| 3 | **Reachability through the REAL composed runtime** | [[committed-is-not-reachable]] | dispatch → read back out of `rt.stores.siteSurface` → serialise → clear → restore → read again |
| 4 | **Plan-view representation** | C11 §8.4 | ⛔ `NOT MEASURED` whether a site surface belongs in a storey plan at all — decide before drawing it |
| 5 | **RAC / chat authoring** | C67 / C68 | a `ChatCapabilityRegistry` entry per verb. At mint every verb is `CHAT_UNAVAILABLE` with a refusal naming the route back to success |
| 6 | **Paving build-up (layers)** | C84 EI-8 | must NOT be `Slab`'s `systemTypeId` — §0.3 |
| 7 | **Junction resolution between crossing roads** | C84 EI-10 | §12 — refused, not deferred silently |
| 8 | **IFC identity** | C25 | resolve `IfcCourse` vs `IfcPavement` before any export claim |

---

## §12 — REFUSALS — what this family deliberately does NOT support, and why

**A refusal is a correct answer. An undocumented one is not.**

| Refusal | Why |
|---|---|
| ⛔ **No terrain draping.** A surface is level-relative | The ordinance measures at the façade; PRYZM samples ONE terrain point at the centroid (L-584). A road draped over a one-point sample is *geometry the user believes*, which is worse than a wrong number in a panel. ADR-0384 D5 |
| ⛔ **No junction resolution.** Two crossing roads are two overlapping surfaces | Walls have `JunctionResolverV2` (ADR-0055) and it does **not** transfer: it keys on wall thickness and vertical faces. Forking it would be a second solver for a problem it does not solve. ADR-0384 §5 |
| ⛔ **No kerbs, markings, gradients, camber, superelevation or drainage** | A `siteSurface` is a flat plane. §0.2 — a family named for a behaviour it does not have |
| ⛔ **`setWidth` refuses on an areal surface, by name** | An areal surface has no width. Silently doing nothing is C16 CA-18's bare success |
| ⛔ **No contribution to any floor-area, GFA or schedule figure** | C114 §3a generalised: *built* / *intended* / *permitted* are three questions with three authorities and paved ground is none of them. A car park in a GFA total is a wrong number with a citation attached |
| ⛔ **Never feeds the zoning `street_width` determination** | §0.3 row 2 — an architect could otherwise raise their own permitted height by widening a road they invented |
| ⛔ **Excluded from IFC export** until §1's identity is resolved | Guessing an IFC class exports intent as fact — C114 §1's precedent |
| ⛔ **No `sourceFeatureId`; context roads are not adopted** | Two answers to *"where is the road"* is C84 EI-9 |
| ⛔ **Overlap between two site surfaces is NOT refused** | A drive crossing a plaza is a normal design. [[spatial-validity-rules-founder-direction]] puts this in FINE/INADVISABLE, and the founder's standing direction is **always ASK, never silently correct**. ⛔ `NOT MEASURED:` whether an advisory is wanted |

---

## §13 — GATES

| Gate | What it asserts here |
|---|---|
| `tools/ga-gate/check-domain-purity.ts` | the L0 schema is Zod + plain TS; **hard-0** |
| `tools/ga-gate/check-three-imports.ts` | the geometry package imports no THREE; **hard-0** (P2) |
| `tools/ga-gate/check-otel-spans.ts` | every `siteSurface.*` handler carries ≥1 span; **ZONE A, zero tolerance** (P8 / C16 CA-14) |
| `tools/ga-gate/check-layer-boundaries.ts` | the new packages are classified in `eslint.config.js` |
| `tools/ga-gate/check-no-direct-store-writes.ts` | **zero NEW tolerated direct writes** (P6) |
| `tools/ga-gate/check-contract-index-equivalence.ts` | this file has a `README.md` row **in the same commit** |
| provenance/confidence coverage | `provenance` + `confidence` spelled INLINE in the file declaring `defineElement('siteSurface')` — an indirection hides them from the retrofit-safety arm (C62 / C75) |
| `tools/ga-gate/check-contract-cited-paths.ts` | every repo path cited above resolves, or is marked PLANNED |

---

## §14 — STATUS (living record — appended, never rewritten)

### 2026-09-09 · lane SITE-SURFACE — the contract is minted BEFORE the family

Nothing is built. §0.1's measurement is the whole status: **0 files.** This section grows as legs
land, each entry naming its proof.

---

## §15 — NOT MEASURED (explicit, per C84 EI-1b)

- Whether a site surface belongs in a **storey plan view** at all (§11 item 4).
- **IFC identity** — `IfcCourse` vs `IfcPavement` (§1).
- **GLB export / bake worker** behaviour (§3).
- Whether an **overlap advisory** between two site surfaces is wanted (§12).
- Whether **tracing a context road** into an authored one is wanted (§0.3).
- Whether **Orden TMA/851/2021** restates the 1,80 m pedestrian figure (§9d).
- Whether any **national instrument** fixes a Spanish parking-bay dimension (§9d).
- Which of C84 EI-8's **V1–V5 material vocabularies** applies (§9e).
- Whether the family participates in the **living graph** (C71).
