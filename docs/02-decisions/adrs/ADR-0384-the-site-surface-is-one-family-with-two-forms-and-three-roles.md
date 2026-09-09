# ADR-0384 — The site surface is ONE family with TWO authored forms and THREE roles

**Status:** ACCEPTED · **Date:** 2026-09-09 · **Lane:** SITE-SURFACE
**Supersedes:** nothing · **Amends:** nothing
**Authority:** the founder transmission of 2026-09-09 (§1 below, verbatim).
**Spawns:** [`C116`](../contracts/C116-ELEMENT-SITE-SURFACE.md) — the C84 §6 per-element contract,
without which C84 forbids the family outright: *"A new family may not be added while its
per-element contract is absent."*
**Related:** [`ADR-0380`](ADR-0380-the-space-envelope-is-one-family-with-two-authored-roles.md)
(the ONE-KIND-WITH-A-ROLE precedent this ADR follows) ·
[`ADR-0383`](ADR-0383-massing-groups-master-planning.md) (massing groups — **the other half of
"master planning", and the co-owner of the rail category D7 mints**) ·
[`C83 §2`](../contracts/C83-SPATIAL-VALIDITY-AND-DESIGN-LOGIC.md) (rules key on roles, not kinds) ·
[`C84`](../contracts/C84-ELEMENT-INTEGRITY.md) EI-1 / EI-8 / EI-9 ·
[`C92`](../contracts/C92-ELEMENT-SLAB.md) (the areal precedent whose vocabulary is reused verbatim) ·
[`C85`](../contracts/C85-ELEMENT-WALL.md) (the linear precedent) · `C11` · `C16` · `C62` / `C75` · `P5` · `P6`.

> Each ruling states the decision, why it is the *architecturally sound* one rather than the
> convenient one, **what it rejected**, and what would falsify it. Where a ruling declines to build
> something the transmission implies, it says so in its own words rather than quietly scoping it out.

---

## 1 · THE ASK (verbatim, 2026-09-09)

> *"i need you to add new categories on PRYZM - **roads** - it should be done as linear design -
> like a wall - but of course flat - like a slab - with a **thickness that the user can add** -
> starting for a typical national road two-sense wide - it needs to follow all the contractual
> documentation - be absolutely architecturally sound - **accessible via UI on the right hand side
> panel rail for a new masterplanning category** - then we need **parking spaces** - another
> category. and **pedestrian areas** - working similar to Roads / slabs."*

---

## 2 · ⭐⭐ THE FINDING THAT SHAPES EVERY RULING BELOW

**A road, a parking area and a pedestrian area are the same object.** Each is a flat paved surface,
laid on the site, with a thickness. They differ in **what they mean** — who may travel on them,
what the width is measured against, what a code check would ask of them — and in nothing a geometry
pipeline can see.

The founder used the word *"category"* three times, and the naive reading is three element kinds.
`C83 §2.1` prices that reading in the repo's own numbers: *"A new element kind must not require 30
new decisions"*, against a measured 13 apps and 48 plugins. `ADR-0380 D2` already took the opposite
road for the space envelope and its schema states the general rule at the top of the file:

> *"⭐ ONE KIND WITH A ROLE, NOT THREE KINDS … A level envelope and a room envelope differ in
> nothing a geometry pipeline can see; they differ in what they MEAN."*
> — `packages/schemas/src/elements/SpaceEnvelope.ts`

⛔ **Three kinds would be three copies of one rule** — the defect this repository logs more than any
other ([[same-rule-two-implementations]], seven prior recurrences). The founder's "category" is
satisfied by three **UI entries**, which D7 delivers, not by three **element kinds**, which D1
refuses.

---

## 3 · DECISIONS

### D1 — ONE element kind, `siteSurface`, carrying `role: 'road' | 'parking' | 'pedestrian'`

The kind is spelled **`siteSurface`**, never bare `surface`, never `road`, so a grep for one never
returns the others (`C84 EI-8`, and the identical spelling discipline `C114 §1` imposes on
`spaceEnvelope`).

`SITE_SURFACE_ROLES` is a **closed union with a value roster**, so a new member is a compile error
at every exhaustive switch, and each member carries **one sentence of explanation in a typed
`Record<>`** — a role cannot exist in this codebase without an explanation, which is the property
`SPACE_ENVELOPE_ROLES` established and this family inherits.

**All three roles are authorable.** ⭐ Unlike `SpaceEnvelope`, this family has **no
declared-but-refused member**, and the absence is deliberate rather than an oversight:
`maximumBuildable` was declared-and-refused there because a hand-drawn volume calling itself the
legal ceiling is indistinguishable from one the law produced. Nothing in this family makes a legal
claim, so there is nothing to refuse. **An `AUTHORABLE_*` subset with the same membership as the
full roster would be a second vocabulary answering a question that has only one answer** — `C84
EI-8` — so it is not minted. If a future non-authorable role appears (a road SURVEYED from context
data, say), it arrives with its subset in the same commit.

> **What would falsify D1:** a rule that must fire for a road and must NOT fire for a pedestrian
> area, where the difference is *geometric* rather than *semantic*. None was found. Every difference
> located — default width, who may travel, which instrument sets the number — keys on `role`.

### D2 — ⭐ THE REPRESENTATION: a discriminated union on `form`, and the linear ring is DERIVED, never stored

The founder asks for **linear** authoring (*"like a wall"*) and **areal** authoring (*"like a
slab"*) in one breath. Both are already solved in this repo, and the ruling is to reuse **both**
rather than force one into the other:

```
form: 'linear'  →  centreline: Vec3[] (≥2, an OPEN polyline)  +  widthM: number
form: 'areal'   →  boundary:   Vec3[] (≥3, an OPEN ring)      +  holes: Vec3[][]
```

⭐ **The swept ring of a linear surface is DERIVED by exactly one exported function and is never
persisted.** That function — `sweepCentrelineToRing` in `@pryzm/geometry-site-surface` — is the
family's named single authority under `C84 EI-1`.

**This is the wall's own rule, not a new one.** `Wall` stores `start`, `end` and `thickness`; it
does not store the rectangle those three imply. A road is the same object with the extrusion turned
through 90°.

#### The two rejected alternatives, and why

| Rejected | Why it was rejected |
|---|---|
| **⛔ RING ONLY** — sweep the centreline at authoring time and keep only the resulting ring | It **destroys the authored intent**, and destroys it irreversibly. *"Make this road 9 m wide"* becomes an edit of forty ring vertices instead of one number, and *"nudge this junction"* becomes impossible. The founder's words are *"linear design — like a wall"*; a wall that forgot it had a baseline would not be one. This is the `C81` intent-preservation concern in its purest form, and it is why `Wall` never took this shape either |
| **⛔ BOTH STORED** — persist the centreline AND the swept ring, ring authoritative | Two answers to *"where is this road"* — `C84 EI-9` — and the second answer goes stale the instant `widthM` changes. It would need a writer at every mutation site, and the mutation site that forgets is the one that ships. **A cache is not a representation** |
| **⛔ ONE SHAPE FOR BOTH** — force the areal case into a degenerate centreline, or the linear case into a hand-built ring | An arbitrary parking lot is not the sweep of any polyline, so the first half is not merely awkward but **impossible**. And the second half is the ring-only rejection above wearing a different hat |

⭐ **The union is on `form`, and `form` is ORTHOGONAL to `role`.** A road is normally linear and a
parking area normally areal, but a lay-by is a linear parking surface and a plaza is an areal
pedestrian one, and the schema does not pretend otherwise. **Six combinations, all legal.** Pinning
`form` to `role` would be exactly the N×N table `C83 §2.1` refuses, at 3×2.

> **What would falsify D2:** a consumer that needs the ring of a linear surface on a hot path where
> re-deriving it is measurably too slow. The answer would then be a memo keyed on
> `(centreline, widthM)` **inside the one authority**, not a second field on the record.

### D3 — The ground-plane vocabulary is REUSED verbatim, and the y ≡ 0 invariant is ENFORCED, not documented

`boundary`, `holes`, `thickness`, `baseOffset` are **`Slab`'s spellings, taken unchanged**
(`packages/schemas/src/elements/Slab.ts`). `Vec3` with `y === 0` is the ground-plane point
vocabulary `Room.boundary`, `BoundaryLine.vertices` and `SpaceEnvelope.footprint` already share.

⛔ **No fourth ground-plane point vocabulary is minted** — `C84 EI-8`, and `SpaceEnvelope.footprint`'s
own header is the standing instruction on this exact question.

⭐ **`y === 0` is checked by a `.refine()`, not asserted in a comment.** An ignored vector component
is a silent-narrowing landmine (`C84 EI-2.d`) and *"a comment as the synchronisation mechanism"* is
`C84 §8.d`, measured to have failed twice. `SpaceEnvelope` enforces the identical invariant the
identical way; this family copies the enforcement, not the prose.

**And the open-ring rule is `Slab`'s too**: the closing vertex is implied and duplicating it is a
refusal, because two conventions for "is the ring closed?" is how a polygon area comes out wrong by
one triangle in exactly one consumer.

### D4 — THE DATUM: the finished surface sits AT the datum and the construction hangs BELOW it — and this is the repo's existing slab rule, discovered rather than chosen

The user positions the surface they will **stand on**. The build-up is underneath it. Measured, at
`packages/geometry-slab/src/SlabFragmentBuilder.ts:1090`:

> `worldY = level.elevation + baseOffset − thickness`

and at `:1258`, `return topY - data.thickness`.

⭐ **So `thickness` extruding DOWNWARD from `level.elevation + baseOffset` is not a decision this ADR
makes — it is the convention `Slab` already holds, and adopting it is the difference between one
rule and two.** Had this ADR reasoned from first principles to "roads extrude down because you drive
on the top" without measuring, it would have been *right by luck*; the next family would have
reasoned to the opposite and nobody would have noticed until two surfaces at the same `baseOffset`
failed to meet.

### D5 — Level-relative. **NOT terrain-draped**, and that is a DECLARED REFUSAL, not a gap

A `siteSurface` records **no terrain relationship at all**. It is seated on a level and measured from
that level's datum, exactly as `SpaceEnvelope` is, and for the same reason its schema states:

> *"⚠ L-584 IS NOT RE-IMPORTED HERE, AND THE OMISSION IS DELIBERATE. The ordinance measures the
> rasante AT THE FAÇADE; PRYZM samples ONE terrain point at the centroid."*

⛔ **A road that silently draped itself over a terrain sampled at one point would be a confidently
wrong surface** — and unlike a building envelope, where the error shows up as a number in a panel, a
draped road's error shows up as geometry the user believes. Draping is a real requirement and it is
recorded as **C116 §11 delta item 1**, gated on a terrain sampler that returns a profile rather than
a point. **It is refused by name today, not omitted.**

### D6 — ⭐ THE DEFAULT WIDTHS ARE CITED, AND THE ONE THAT CANNOT BE CITED SAYS SO

⛔ A fabricated standard is worse than an admitted convention — [[fake-more-capable-than-real]]: *"a
fake built from the header cannot falsify the header."* So the per-role default is **not a bare
number**. It is a record carrying the value, the instrument, and — where there is no instrument —
the word `convention` and the reason.

| Role | Default | Standing | Instrument |
|---|---|---|---|
| **`road`** | **7.00 m** | **CITED — standard** | **Norma 3.1-IC "Trazado"** (Orden FOM/273/2016, `BOE-A-2016-2217`), §7 Tabla 7.1 *"Dimensiones de la sección transversal"*: *carril* = **3,50 m** for a *carretera convencional* of class C-100 / C-90 / C-80. Two-way = two lanes = **2 × 3,50 = 7,00 m de calzada**. This is the founder's *"typical national road two-sense wide"* |
| **`pedestrian`** | **1.80 m** | **CITED — standard** | **Orden VIV/561/2010**, art. 5.2 — an *itinerario peatonal accesible* has an *anchura libre de paso* of **not less than 1,80 m** |
| **`parking`** | **5.00 m** | ⚠ **CONVENTION — NOT a standard, and the record says so** | One bay depth. **There is no Spanish national trazado instrument that fixes a parking-bay dimension** — bay geometry is set by municipal ordinance / PGOU, which is a per-jurisdiction fact this family does not resolve. `NOT MEASURED:` whether any national instrument fixes it |

**Three riders, all of which are the point rather than fine print:**

1. ⭐ **The road number is the CALZADA — the carriageway — and the *arcenes* (shoulders) are
   deliberately excluded.** Tabla 7.1's C-80 section also carries 1,00 m *arcenes*. A shoulder is a
   different surface with a different role and a different build-up; folding it into the default
   would inflate every paved-area figure this family ever reports by nearly 30 %, silently.
2. ⚠ **These defaults are JURISDICTION-ROOTED, and the schema says so rather than implying
   universality.** They are Spanish instruments because Spain is where this product's jurisdiction
   work is deepest. Cross-checked for order of magnitude against **UK DMRB CD 127**, whose two-lane
   single carriageway is **7.3 m** — the same number to within 4 %, which is evidence that 7.00 m is
   not parochial, and is **not** a second citation for it.
3. ⛔ **A default is not a constraint.** Nothing refuses a 3 m road or a 40 m one. The width is the
   user's; the citation explains where the *starting* number came from, which is precisely what the
   founder asked for and no more.

> **What would falsify D6:** a jurisdiction pack that resolves a local carriageway width. The
> defaults then become the *fallback* a pack overrides — which is why they are a keyed record with a
> named source rather than three literals scattered across a tool file.

### D7 — "Master planning" is ONE rail category with ONE registry, and it is **CO-OWNED with ADR-0383** from its first commit

The founder asks for *"a new masterplanning category"* on the right-hand rail.
⚠ **`ADR-0383` (same day, sibling lane) calls its massing-group feature "master planning" too.**
These are not two features with a name collision — they are the two halves of one activity: laying
out a site is placing **buildings** (ADR-0383) and placing **the ground between them** (this ADR).

⛔ **So this ADR does not mint a "Roads" rail.** It mints **one `Master planning` category, backed by
a data-driven entry registry**, and this family registers three entries into it. ADR-0383's lane adds
its entries to the **same registry** — a row, never a second rail.

⭐ **The alternative — each lane adding the surface it needs — is `C82`'s measured disaster in
miniature:** the ribbon census found **267 of 280 toolbar pairs silently dead**. Two rails both
called "Master planning" is that failure at its first instant, and it is cheaper to refuse now than
to reconcile later ([[view-region-one-owner]]: one owner per region, adopted *before* the second
writer exists rather than after).

### D8 — Every mutation is a command; creation is a BATCH verb; ids are minted by the CALLER

`P6` — the UI dispatches through `commandBus` and never writes the store.
`C16 CA-2` — ids are pre-generated at the tool entry and are **identical across redo**, because
`execute()` runs again on redo and an id minted inside it orphans every reference the second time.

⭐ **`siteSurface.batch.create` is the create verb, and there is no singular `siteSurface.create`** —
the shape `C114 §6a` already ruled for envelopes. One drawn road is a batch of one. A masterplan
laid out in one gesture is a batch of forty, **one Immer patch pair, one Ctrl+Z** (`C16 §8.6`).
Two verbs would let a surface spend forty undos on one gesture.

### D9 — The family declares its `C83 §2.2` spatial role, and that vocabulary is NOT the same word as `role`

`C83 §2.2` has a role vocabulary of its own — `PASSAGE` / `APERTURE` / `STRUCTURE` / `OCCUPIABLE` /
`CIRCULATION_SURFACE` — for **spatial-validity** rules. A `siteSurface` is a
**`CIRCULATION_SURFACE`** in that vocabulary, in all three of its own roles.

⚠ **Two different concepts are both spelled "role", and this ADR refuses to pretend otherwise.**
`SpaceEnvelope.role` already established `role` as the name of a family's *purpose discriminator*,
and consistency with the nearest neighbour beats inventing `purpose` or `use` for the same job.
`C84 EI-8` asks for one vocabulary per **concept**, and these are two concepts — so the resolution is
to **name the collision at the point of use** in both the schema and `C116 §9`, not to rename either.

⛔ **And the `C83` declaration is recorded as NORMATIVE INTENT, not as a capability.** Measured
2026-09-09: `grep -rn "CIRCULATION_SURFACE\|SpatialRole\|OCCUPIABLE" packages plugins apps src
--include=*.ts` → **no output.** `C83 §2.2`'s vocabulary **does not exist in code**. Claiming the
family "declares its spatial role" as a shipped property would be the naming-vs-behaviour defect
`C107 §0.2-a` names and `C114 §0.2` inherits.

---

## 4 · THE VERBS

| Verb | Payload | Undo |
|---|---|---|
| `siteSurface.batch.create` | `{ surfaces: SiteSurfaceCreateSpec[] }` — each spec carries its own caller-minted `id`, `role`, `form` and geometry | **1** |
| `siteSurface.setWidth` | `{ id, widthM }` — **linear form only**; refuses on an areal surface by name | 1 |
| `siteSurface.setThickness` | `{ id, thickness }` | 1 |
| `siteSurface.setRole` | `{ id, role }` — geometry untouched; the meaning changes, the surface does not | 1 |
| `siteSurface.delete` | `{ ids }` | 1 |

⛔ **`setWidth` is not `setThickness`.** They are perpendicular, both are metres, and a single
`setDimension` verb taking an axis name would be the exact ambiguity that makes a bug report
unreadable. Two verbs, two nouns the user already distinguishes.

---

## 5 · WHAT THIS ADR DELIBERATELY DOES **NOT** DECIDE

- **Terrain draping** (D5) — refused by name, `C116 §11` item 1.
- **Junction resolution between two roads.** Walls have `JunctionResolverV2` (ADR-0055); roads have
  nothing, and two crossing roads today are two overlapping surfaces. ⛔ **Not guessed at**: the
  wall solver keys on wall thickness and vertical faces and does not transfer. `C116 §12`.
- **IFC identity.** `IfcCourse` / `IfcPavement` (IFC 4.3 infrastructure) are the plausible
  candidates and neither was verified. The family is **excluded** from IFC export rather than
  guessed into it — `C114 §1`'s precedent for exactly this position.
- **Kerbs, markings, gradients, drainage, camber, superelevation.** A `siteSurface` is a flat plane.
  Anything a road engineer would call road design is out of scope, and `C116 §12` says so, because
  *"a family named for a behaviour it does not have"* is `C107 §0.2-a`'s defect.
- **Whether a `siteSurface` participates in the living graph** (`C71`) — `NOT MEASURED`.
