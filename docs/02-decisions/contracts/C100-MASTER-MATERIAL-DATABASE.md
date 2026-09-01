# C100 — The Master Material Database

> **Stamp**: 2026-08-18 · **Status**: DRAFT (governance authored; §8 records which slices are BUILT
> at stamp time and which are UNBUILT — an unbuilt slice is UNPROVEN, never an inherited green).
> **Scope**: the question *"what material is this element made of, and where does that answer live?"*
> — asked by every element family, the geometry kernel, every property panel, the schedules, the
> exporters and the chat. Owns **the one material record shape and its single home** (§1), the
> **REFERENCE-versus-MATERIALISE rule** as it applies to *materials* and its consequence (§2), what an
> **adapter** may and may not do (§3), the **six-source census** with a verdict binding each (§4), the
> **no-silent-fallback rule** (§5), and the **UI + AI reachability obligation** (§6).
> **Does NOT own**: the type/catalogue tier model, project scoping or snapshot round-trip
> (**C65** — ACTIVE; this contract is subordinate to it and restates none of it), rendering and
> scheduling (**C04**), the creation pipeline (**C11**), command authoring (**C16**), hosted elements
> (**C15**), the chat control plane and onboarding checklist (**C67**/**C68**), the verb register
> (**C69**), determinism classification (**C73**), or IFC material export (**C25**).
> **Key principle**: *A material is a NAME the project agrees on, not a colour an element remembers.*
> Every duplicate in §4 was minted by a consumer that could not **reach** the name and therefore
> copied the colour. The fix is not discipline; it is making the name reachable from every layer that
> needs it.
> **Authority**: subordinate to `STR-03-engineering-vision.md` / `STR-04-architecture.md`, to
> [C65](C65-ELEMENT-TYPE-SYSTEM.md) (ACTIVE — owns the tier model and the catalogue rules; **C100
> mints no rival tier vocabulary**) and to [C70](C70-BIM30-TARGET-AND-GOLDEN-CHAIN.md) §7.1.
> **EXTENDS and does not supersede [ADR-0217](../adrs/ADR-0217-type-catalog-scope.md) +
> [SPEC-05](../../03-execution/specs/SPEC-05-TYPE-CATALOG.md) §4**, which already decided the
> reference model (§2.0). Peers with [C03](C03-SCHEMAS-COMMANDS-AND-STATE.md) §1.1 (the schema's home),
> [C11](C11-ELEMENT-CREATION-PIPELINE.md) §5.4, [C16](C16-COMMAND-AUTHORING-PROTOCOL.md) §5.1,
> [C67](C67-RAC-CAPABILITY-CONTROL-PLANE.md) §6 / [C68](C68-ELEMENT-CHAT-ONBOARDING.md) §4–§5 (bind
> every user-visible attribute and every verb this contract's slices ship),
> [C69](C69-API-VERB-REGISTER.md) §0.1 (**no verb list is transcribed here — cite the generated
> register**), [C73](C73-GEOMETRY-DETERMINISM-AND-TOLERANCE.md) §1.
> **Corrects**: [SPEC-MATERIALS-REPOSITORY](../../03-execution/specs/SPEC-MATERIALS-REPOSITORY.md)
> (PLAN, 2026-05-22) — two measured falsehoods and a mis-numbered promotion target (§4.7).
> **Ratified by**: [ADR-0333](../adrs/ADR-0333-the-material-catalogue-is-one-record-shape-at-L0.md).
> **Supersedes nothing.**
> **Gate**: `tools/ga-gate/check-material-single-source.ts` — BUILT at stamp time (§7). Its three arms
> are named there together with the four axes it **cannot** decide.
> **Changelog**:
> · 2026-08-23 — **§10.16** (lane ROOF7, L-10020..L-10027): ⭐ **the roof carries a texture now.**
> §10.15.f's *"a roof cannot carry a texture at all"* is **FALSE as of this stamp** and is corrected
> in place. `RoofFragmentBuilder`'s `uvSpaceOfGeometry(null)` is gone and the geometry emits
> **real-world-metre UVs measured ALONG THE SLOPE** on **ten of the eleven** generator entry points;
> **barrel refuses by name** (a 20-strip cylinder needs arc length). ⚠ **The cheap plan projection was
> proven wrong by a WATCHED RED, not by argument** — it leaves `flat` green and fails nine pitched
> forms, which is the "half true, half squashed" state §10.15.f predicted. ⛔ **And the founder still
> sees a colour on `roof-shingle-asphalt-charcoal`**: measured, **10 roof-declared rows, all 10
> map-bearing, 7 of them `procedural:`** — and runtime procedural generation is OFF by deliberate
> rollback, which is §10.10.f's S33. **One gate of three removed, and the remaining one is named.**
> ⛔ **§10.15.f's slice was minted as "S33" and that number was ALREADY TAKEN** by §10.10.f; the roof
> slice is **S34** (§10.16.f).
> · 2026-08-23 — **§10.15** (lane PASCALMAT58, L-9700..L-9707): the reference product's materials.
> ⛔ **"Copy ALL of them" is answered NO for the PIXELS and YES for the TAXONOMY**, and the pixel
> refusal is now MECHANICAL rather than prose: the rule existed in three documents and was enforced
> in ONE script's allowlist that **no procedural or hand-authored row ever passes through**. A
> **licence ledger at L0** (RATE53's shape — a three-valued verdict plus *the sentence that decided
> it*), an `upstream` field on the record, a shipped **`NOTICE.md`**, and three new gate arms close
> that. ⭐ Three new pieces of evidence: the assets arrived in **one squashed vendor commit**; the
> repo **applies licence review to code and recorded none for the 288 binaries**; and **235 of the
> 314 paths its own manifest cites do not exist in its own repository** — the subset that resolves
> upstream and the subset we could decode **do not intersect**. ⭐ **§10.7 S25 is CLOSED**: `surfaces`
> ships with its filter, and *absent means **NOT DECLARED**, never "universal"* — the one place this
> contract deliberately diverges from the reference product, because their reading makes "nobody
> classified this" and "suits everything" the same value. Ten procedural rows (7 roofing, 3 decking)
> needed **no new layout code** — a shingle course IS a running bond. ⛔ **The roof default was NOT
> changed**, and not out of caution: a roof carries **no `uv` attribute anywhere in its pipeline**, so
> the change would restyle every existing roof and still show no tiling. **S33** (roof metre UVs) is
> minted and is the only thing standing between the founder's sentence and rows that already exist.
> ⚠ **Both italicised claims were corrected 2026-08-23 by §10.16 (lane ROOF7)**: the slice is
> **S34** (the number was taken), the roof `uv` gap is CLOSED on ten of eleven entry points, and it
> was **not** the only thing standing — 7 of the 10 roof rows still need §10.10.f's S33 bake.
> · 2026-08-23 — **§10.13** (lane MAT50, L-8600..L-8620): the Material Schedule's ELEMENT AXIS, and
> wall LAYERS. The axis was a hand-typed six-string array and was wrong in **both directions at
> once** — `Ceiling` was a column that could never tick (10 types, **0** materialIds) while
> `handrailTypeStore` carried **44 types and 26 distinct materialIds and had no column at all** — so
> no count could have caught it and the gate now compares **SETS**. ⭐ The deeper finding: `—` meant
> both *"not used"* and *"cannot be named"*, which is §CONTEXT-DATA-HONESTY with the two values
> collapsed. Separately, §6.1 was breached for wall layers — the type editor offered a raw
> `<input type="color">` and **no way to name a material** — while `elementTypeAuthoringAdapters.ts:79`
> passed layers through verbatim, so the pipe was complete and only the CONTROL was missing (the
> §10.12 finding, one family over). ⛔ **S10 remains OPEN** and is now blocked on lane ownership
> plus one undecided design question — see §10.13.f.
> · 2026-08-23 — **§10.12** (lane OPENUI41, L-7700..L-7705): the hosted openings. §9.10.3 called
> door/window's row STALE and said the founder's *"often show, often don't"* was **NOT a material
> defect** — that half stands and is unchanged. What it did not measure is the **authoring** half:
> **ZERO of the 8 built-in window types and ZERO of the 9 built-in door types carried a
> `materialId` on any finish slot**, and the type editor could not author one, so the correct
> C100 §2.1 ladder in `windowFinishColour.ts` / `doorFinishColour.ts` had nothing to resolve on any
> opening ever placed. 34 finish slots seeded; the master gained ONE row rather than having a wrong
> one mapped onto it. **The resolver was right and the authoring surface could not name a material.**
> · 2026-08-21 — **§10.11** (lane DIM46, L-3100..L-3105): the record gains **`carbon?`** — an
> embodied-carbon factor and a density, each **INSEPARABLE from its citation**, and each carrying a
> `verification` state that is a **separate fact from `source`**. **20 rows ship a factor and ~309
> read NOT MEASURED**, which is the intended state and is now enforced by a test rather than by
> discipline. **§1.1's "one record shape" was the binding constraint on the design**: the values are
> authored in `carbonFactorTable.ts` and **merged onto the catalogue rows at module load**, because a
> permanent `Record<materialId, factor>` beside the catalogue would have been the **seventh**
> vocabulary this contract exists to prevent.
> · 2026-08-21 — **§10.10** (lane MAT2, L-1900..L-1906): 84 rows — 20 microcements, 30 paints, 34
> colour×sheen tiles — and the two things that had to be true first. **§10.2.b's paint verdict is
> CORRECTED**: *"colour + roughness is the whole physical truth of paint"* was right about physics and
> **false about the renderer** — both wall arms drew every material at one fixed sheen, so §10.2.a's
> SHEEN axis was unrenderable until L-1905 wired it. And **§10.10.c mints a naming rule**: *a
> material's LABEL is a claim, and it may carry a property only where some surface can display it* —
> which is why not one of the 84 names a size, a bond, a grout joint or a RAL code.
> · 2026-08-18 — created, on a founder request (§0), after a census found **eight** live vocabularies
> for one concept — three more than the brief named — and established that four of them share **one
> mechanical cause** (§0.1), not four
> independent lapses of discipline.

---

## §0 — Why this contract exists

### §0.1 — The request, verbatim

> *"We should have a **MASTER MATERIAL DATABASE** and **all elements should be fed from this**. All
> architecturally sound — **no duplication** — architecturally sound, **stored sound**, and the
> **orchestration should be clean and architecturally sound**, all aligned with contracts and
> **adapted and ready via UI + AI**."*

### §0.2 — What the census actually found

The census is §4. Its headline is **not** "there are eight copies." It is this:

> ⭐ **`packages/core-app-model/src/materialLibrary.ts` line 1 is
> `import * as THREE from '@pryzm/renderer-three/three'`,** and every entry's colour is a live
> `THREE.Color` constructed at module load. **Therefore no consumer that must stay THREE-free can
> import the master at all** — not `geometry-kernel` (0 THREE imports, by design, and it is the
> package that decides the rendered colour), not the pure AI resolvers, not L0.

That is a *reachability* problem, not a style problem, and it is the mechanical cause of four of them. The repository already knew and wrote it down: `finishRef.ts`'s header says

> *"Transcribed, not imported: materialLibrary constructs `THREE.Color` instances at module load, and
> this resolver is pure."*

An honest comment explaining a copy is still a copy — and it is the strongest available evidence that
the copy was **forced**, not chosen. A rule saying *"do not duplicate the material table"* laid on top
of that arrangement is **unsatisfiable**, and §UNSATISFIABLE-GATE-DECOMPOSITION-IS-THE-FIX applies:
decompose the master so the name is reachable, and only then is the rule obeyable.

### §0.3 — Two prior counts were wrong, and how

`STANDARD_MATERIAL_LIBRARY` holds **204** entries. SPEC-MATERIALS-REPOSITORY §1 says *"~140"*; a
2026-08-18 survey of this same file reported *"129"*. Both undercounts come from grepping
`^\s+label:` or `^\s+id:`, which the file's **inconsistent indentation** defeats (76 entries sit at
one indent, the rest at another). The reproducible count is the one that keys on a token appearing
exactly once per entry regardless of indent:

```
grep -c 'params: {' packages/core-app-model/src/materialLibrary.ts   →  204
```

confirmed independently by a brace-matching parse of the array literal (204 objects, 0 duplicate
ids). ⚠ **Per C64 §2.13's rule applied to this file: cite the command, not the number.** This section
is the authority for the *method*; the gate (§7) is the authority for the *count*.

---

## §1 — The invariant: ONE record shape, ONE home, and it is THREE-free

### §1.1 — The master

**There is exactly one material vocabulary in this repository.** It has two tiers, per **C65 §2**,
and they are the same shape:

| tier | what | where | editable |
|---|---|---|---|
| **T1 built-in** | `MATERIAL_CATALOG` | `packages/schemas/src/materials/` (**L0**) | no — code |
| **T2 project** | `UserMaterialStore` | `packages/core-app-model/src/stores/` (L2), persisted | yes — user |

**MUST**: both tiers use **one record shape**, `MaterialRecord`, discriminated by `source:
'builtin' | 'user'`. The existing `UserMaterialDef` **is** that shape plus `createdAt`/`modifiedAt`;
it is not replaced, it is *typed as* the T2 member of the union (§4.6).

**MUST**: resolution reads T2 first, then T1 — a user material may shadow a built-in id, per C65
§2.2's project-local-override rule.

⛔ **MUST NOT**: this contract does **not** claim a global, cross-project material library. That is a
**T3** claim and **C65 §2.1 defers T3** — *"a T2 implementation that does not ship T3 today is
correct."* "Master" here means *one vocabulary and one shape*, not *one shared server-side table*.

**MUST NOT**: mint a second enumeration of materials, material ids, material names or material
colours anywhere — including as a `const` object, a `Record<string, string>`, a union of string
literals, or a table in a comment that code is expected to keep in step.

### §1.2 — Why L0, and not "wherever the biggest table already sits"

The master's home is decided by **the lowest layer any consumer occupies**, never by where the most
rows currently are. Measured consumers span L0→L7, and the decisive one is `geometry-kernel` (L2,
THREE-free, declares `@pryzm/schemas` today): it is the package that composes the material key and
therefore **decides the rendered colour**. Placing the master at L2 beside it — which is what the
previous arrangement did — put the table *above* the kernel that needs it, and the kernel could not
read it. **That is exactly how the beige default in §5 came to exist.** L0 is the only placement that
serves every consumer with no new dependency edge.

Per **C03 §1.1** the canonical schema for an entity belongs in `packages/schemas/` and no other
package may define a competing one; per **C03 §1.2** it must be pure. A `MaterialRecord` of plain
scalars satisfies every rule in `check-domain-purity.ts` (P5). ⚠ It therefore **MUST NOT** carry a
`THREE.Material`, a `THREE.Color`, or a texture object — only a hex string and scalars.

### §1.3 — The THREE-typed library is a DERIVED PROJECTION, not a rival

`STANDARD_MATERIAL_LIBRARY` **remains** the public THREE-typed accessor — 21 importers depend on it
and it is not withdrawn. Its *status* changes from **authority** to **projection**:

**MUST**: it is computed from `MATERIAL_CATALOG` at module load and holds no literal material data.

**MUST NOT**: any id, label, category or colour appear as a literal in `materialLibrary.ts`.

The same rule governs every future projection (a PBR view, an IFC view, a swatch grid): a projection
**maps** the master; it never **extends** it. A projection needing a row the master lacks adds that
row **to the master**. This is [ADR-0328](../adrs/ADR-0328-partof-is-a-derived-projection-of-the-hierarchy-store.md)'s
ruling — *"two records of one fact is how they come to disagree"* — applied to materials.

Designated accessors. **MUST** use these; **MUST NOT** hand-roll `.find()` over the array, and
**MUST NOT** add a rival accessor:

| accessor | layer | returns |
|---|---|---|
| `MATERIAL_CATALOG` | L0 | the T1 rows |
| `findMaterialRecord(id)` | L0 | `MaterialRecord \| undefined` |
| `materialHex(id)` | L0 | `'#rrggbb' \| undefined` |
| `findMaterialById(id)` | L2 | `StandardMaterialDef \| undefined` (THREE-typed) |
| `materialHexById(id)` | L2 | `'#rrggbb' \| undefined` |

⚠ `findMaterialById` / `materialHexById` already exist and already have callers. They are **retained
with identical signatures and identical behaviour**; this contract merely re-expresses them over the
catalogue. Concurrent-lane compatibility is a **MUST**, not a courtesy (§8.3).

---

## §2 — REFERENCE versus MATERIALISE

### §2.0 — This is EXTENDED, not decided here

⚠ The reference model was **already decided** and is still live:

- **[ADR-0217](../adrs/ADR-0217-type-catalog-scope.md)** (ACCEPTED 2026-04-27, never superseded):
  *"**Layer references material by `materialId`; no duplication.**"*
- **[SPEC-05](../../03-execution/specs/SPEC-05-TYPE-CATALOG.md) §4.3** (Active — normative):
  *"A wall layer references a material by `materialId`… **Single source of truth; no duplication in
  the wall type.**"*

**C100 does not re-decide this and MUST NOT be cited as having done so.** What ADR-0217 and SPEC-05
never stated — and what the code therefore answered six different ways — is **what happens when the
reference cannot be resolved**, and **whether a stored hex beside the id is legal**. §2.1 states only
that.

### §2.1 — The rule

> **An element REFERENCES a material by `materialId` (ADR-0217). A resolved colour is a CACHE, never
> an authority. A stored hex is legal in exactly ONE role — an explicit, user-authored OVERRIDE —
> and it MUST be distinguishable from a colour that was resolved from the master.**

**Resolution precedence — normative, in this order:**

1. an explicit user override hex stored on the element/layer → use it;
2. else `materialId` resolved against T2 then T1 (§1.1) → use that record's colour;
3. else **a NAMED UNRESOLVED state** (§5) — never a silent default colour.

**MUST**: every element family that has a material stores `materialId` as the material's identity.

**MUST NOT**: a family store *only* a hex and call it a material. A hex is not a material; it is one
attribute of one. An element carrying only a hex has irreversibly lost the name — no schedule can
count it (C28), no IFC export can classify it (C25), and no library edit can reach it.

**Per C73 §1**, each field is classified so it is never classified by accident:
`materialId` is **PERSIST-OR-LOSE**; the resolved colour and the `THREE.Material` are
**REGENERABLE**; an explicit override hex is **PERSIST-OR-LOSE**.

### §2.2 — The consequence, stated plainly

- **Editing a master row changes every element that references it, immediately and everywhere** —
  3D, plan, schedules, panels — with no migration and no per-element write. This is the property the
  founder's *"all elements should be fed from this"* actually names. Per **C65 §3.6** the UI **MUST**
  state the affected instance count before applying such an edit.
- **It does NOT change an element carrying an explicit override.** That is the *cost*, and it is the
  correct one: a user who deliberately set a colour does not want a library edit to silently undo it.
  Therefore (§6.1) **an override MUST be visible in the UI as an override** — an invisible override
  is indistinguishable from a stale copy, which is §CONTEXT-DATA-HONESTY inside the material system.

### §2.3 — The deliberate contrast with TYPES

⚠ This rule is **the opposite** of the one `CatalogueFamilies.ts` records for *types*, and the
difference is intentional. `HandrailData` has no `typeId`: a handrail **type** is materialised whole
into fields, so a type edit does not retroactively rewrite placed handrails. That is right for a type
— a type is a *starting point* an author diverges from.

A **material** is not a starting point. It is a shared name — "Oak", "C30 concrete" — and the entire
value of naming it is that the project agrees. Two elements both made of Oak rendering different
browns because they were placed in different months is the defect this contract exists to prevent.

**MUST NOT**: cite this section to argue materials should be materialised because types are.

### §2.4 — ⭐ A COMPONENT'S **MATERIAL SLOT** JOINS THIS LADDER; IT DOES NOT MINT A SIXTH VOCABULARY (added 2026-09-01, lane EXT · audit §6.2 · ADR-0376 D5)

> **The component model has a materials concept already, and it is the RIGHT concept** — a
> **slot**, not a colour. `packages/file-format/src/family-schema.ts` declares
> `MaterialSlotSchema = { id: SlotId, name: string, defaultCategory: string | null }`, and a
> definition carries `materialSlots: MaterialSlot[]`. **Naming the slot instead of baking a colour
> is precisely §2.1's discipline, arrived at independently.**

#### ⛔ AND IT CANNOT REACH THE MASTER, BECAUSE IT HAS NO `materialId`. MEASURED 2026-09-01:

```
grep -rn "defaultCategory" --include=*.ts packages apps plugins src
   -> 3 hits: family-schema.ts:235 (the declaration) and two lines of its own .d.ts.
      ZERO consumers.
grep -rn "materialSlots\|MaterialSlot" --include=*.ts packages apps plugins src
   -> the schema, its .d.ts, the merge-material-slots migration op, and barrels. NOTHING ELSE.
```

**`defaultCategory` is a free-text string with no resolver, no consumer and no relationship to
`MaterialCategory` or to any master row id.** So a component slot today can name a material only in
the sense that a comment can: **it is a hex's problem one level worse.** §2.1's MUST NOT — *"a
family may not store only a hex and call it a material; a hex is not a material, it is one attribute
of one"* — applies with more force to a bare category string, which is not even an attribute.

> **§2.4a — MUST.** A component material slot **binds by `materialId`**, resolved through **the ONE
> ladder of §2.1** — override, then `materialId` against T2 then T1, then a **NAMED UNRESOLVED
> state** (§5). ⛔ **A slot MUST NOT grow a private resolution order.** §9's convergence census
> exists because five vocabularies had to be reconciled after the fact; this is the one family that
> can join before it has a single consumer to migrate.

> **§2.4b — MUST.** The `defaultCategory` field is either **bound to the same category vocabulary
> the master uses** or **declared as authoring metadata that resolves nothing** — and said so, in
> the schema, at the field. ⚠ *"A category that looks like a material reference and resolves
> nothing"* is `[[context-data-honesty-family]]` in a component file: **"no material chosen" and
> "the reference could not be resolved" become the same value**, which is the failure §5 forbids
> everywhere else in this contract.

> **§2.4c — MUST. The DEFINITION declares the slot; the TYPE or the INSTANCE supplies the
> `materialId`.** That is C65's tier split (T0 declares, T1–T4 configure), and it is what keeps
> §2.2's *"editing a master row changes every element that references it"* true through a component:
> the reference lives on the configuration, so the master edit reaches the placed instance without
> touching the definition.

> **§2.4d — MUST NOT.** Do not solve this by giving the slot a **colour**. A definition that stores
> a hex is a definition that has *irreversibly lost the name* (§2.1) — and unlike an element, a
> definition is **shared, versioned and signed**, so the loss is copied into every instance of every
> type over it, permanently. ⛔ **This is the cheapest defect in the programme to avoid and one of
> the most expensive to reverse.**

⭐ **Why this is an EXTENSION and not a mint (C84 EI-8):** the slot needs *identity, resolution
order, an unresolved state and an override rule* — C100 already owns all four. A parallel
"component material" concept would be a **sixth** vocabulary over one question, and §9's census is
the record of what reconciling five cost.

---

## §3 — Adapters: what one may and may not do

An **adapter** translates the master's data into the form one layer needs. The 18
`plugins/*/src/committer/material-bridge.ts` files are adapters (§4.3).

**An adapter MAY**: parse a `MaterialKey` and read its slots; construct a renderer object from
resolved values; carry **family-specific render constants that are not material properties** —
`side: DoubleSide`, a family's canonical roughness/metalness where it deliberately overrides the
material's own, pooling and ref-counting behaviour.

**An adapter MUST NOT**: contain a table of material ids, names or colours; decide *which* material
an element has (**C11 §5.4** — that is a domain rule and it resolves in the command, never in a tool
or a builder); or substitute a colour of its own when resolution fails (§5).

> **The review test that separates an adapter from a duplicate:**
> *if a material is renamed or recoloured in the master, does this file need editing?*
> **No** → adapter, legitimate. **Yes** → duplicate, whatever the filename says.

---

## §4 — The census, with a verdict binding each

⚠ **The brief named five sources; this section carries EIGHT.** `UserMaterialStore` (§4.6) and
`floorFinish.ts` (§4.5) were found during the census, and the `materialName` family turned out to be
three semantics rather than one (§4.5). A census that returns the number it was given has not been
run.

Measured 2026-08-18 at `ec7135ff`. This section **is** the census, so it states its own counts; per
C69 §0.1 and C64 §2.13 they are not to be re-transcribed elsewhere.

### §4.1 `STANDARD_MATERIAL_LIBRARY` — **FOLD: data to L0; this file becomes the derived view**

`packages/core-app-model/src/materialLibrary.ts` · **204 entries** (§0.3) · 17 categories · 21
importers. It is and remains the largest and best-curated vocabulary. A previous lane's ruling that
this is THE MASTER is **upheld on its data** and **overturned only on its LOCATION** (§1.2).

⚠ **198 of 204** entries express colour as `new THREE.Color('#rrggbb')` and transcribe losslessly.
**6** (`glass-clear`, `glass-frosted`, `glass-low-e`, `glass-structural`, `glass-reflective`,
`plastic-transparent`) use the float-triplet form, which has no exact 8-bit hex. They are converted
through the repository's own THREE r183 and **the delta is measured, not asserted**: worst case
**0.951 of one 8-bit sRGB step** — below the quantisation the display pipeline already applies.
Recorded because a colour change, however small, is a change; ADR-0333 carries the measurement.

### §4.2 `RENDER_MATERIAL_LIBRARY` — **UNWIRED OVERLAY; fold DEFERRED with a named blocker**

`packages/core-app-model/src/rendering/RenderMaterialLibrary.ts` · **16 entries** across **7**
categories · **1 importer** · **0 call sites** for either functional export.

⚠ **Three different counts were reported for this one file — 18 (this lane, first pass), 17, and 16 —
and the discrepancy is worth more than the number.** Settled by brace-matching parse: **16**. The 18
was a miscount; the 17 comes from `grep -cE '^\s+id:'` and `grep -c 'label:'`, both of which also
match the `RenderMaterialDef` **interface's own field declarations** a few lines above the array. ⭐ *An id a grep cannot see is an id a gate cannot govern* — which is why §7 ARM C parses rather than
greps, and why §0.3 states the method rather than the figure.

⚠ **Unmapped ids: 8, not 5** (measured — strip the `render-` prefix, test against the 204 master ids):
`render-plaster-white`, `render-plaster-warm`, `render-steel-brushed`, `render-steel-polished`,
`render-aluminum`, `render-fabric-linen`, `render-fabric-dark`, `render-tile-marble`. **Half the
overlay has no master counterpart**, which strengthens rather than weakens the deferral.

⚠ `BIM_TO_RENDER_MATERIAL_MAP` (**7** pairs) is **NOT** a rival vocabulary and this contract's first
draft was wrong to imply it: every one of its 7 left-hand keys **is** a real master id, so it is a
master→overlay alias table. It stays, under §1.3's projection rule.

**Verdict: NOT a master; NOT folded in the minting lane — DEFERRED, blocker named.** Eight of its 16
ids have no same-named master row. Folding requires *deciding what those eight mean* — new master
rows, aliases, or a PBR-tier concept (`envMapIntensity`) the master does not model. That is a design decision, and
**guessing it would mint precisely the ninth source this contract forbids.**

**MUST**: while deferred this file gains no new entries and no new importers. **MUST**: the deferral
is discharged by a named decision (§8.2 S8), never by quiet accretion.

### §4.3 The 18 `material-bridge.ts` files — **LEGITIMATE ADAPTERS (16) / DEFECTIVE (2)**

> ⚠ **SUPERSEDED IN PART BY §9.4 (2026-08-19). Read §9.4 before acting on this section.** The "16/2"
> split and the single key format asserted below were both measured wrong: there are **eighteen
> distinct key layouts**, not one, and **four** bridges are defective, not two — `furniture` hashes
> the `materialId` into an 8-colour palette, which this section counted as an adapter. The review
> test stated below also passes a bridge that is *entirely disconnected* from the master, because a
> master recolour cannot force an edit in a file the master never reaches.

⛔ Decided by **reading** them, not by counting them.

**They are not palettes.** A bridge splits a kernel-emitted `MaterialKey`
(`<family>|<systemTypeId>|<materialId>|<color>|<slot>`) on `|`, takes the colour slot, and builds a
`MeshStandardMaterial`. Under §3's test — *does a master recolour force an edit here?* — **no**. They
are adapters and they stay.

⚠ **But the layer-boundary justification written inside them is measurably FALSE.** `door`'s bridge
says *"Inline keyword colours respect the L7→L6 boundary (no core-app-model import)"* and `window`'s
says *"plugin must not import core-app-model"*. Plugins are **L6**; `core-app-model` is **L2**; L6→L2
is **downward and legal**; and **27 real `from '@pryzm/core-app-model'` import statements already
exist under `plugins/`**. The comment describes a boundary that does not exist — and it propagated
into SPEC-MATERIALS-REPOSITORY §0 (§4.7) and thence into further files, which is why it is corrected
at the source and not only here.

Two bridges are defective, both by **discarding information already present**:

- ⛔ **`plugins/handrail/.../material-bridge.ts`** — `colorOfHandrailMaterialKey(_key)` **ignores its
  argument** and returns `'#5a4a3a'` unconditionally, while the producer
  (`packages/geometry-kernel/src/producers/handrail.ts:89`) emits `handrail|${materialId}|rail` —
  **the id is in the key and is thrown away.** Every handrail renders the same brown whatever the
  user chose. **Verdict: ⛔ NOT FIXED HERE** — a concurrent lane now owns this file (§8.1 S3).
- ⚠ **`plugins/wall/.../material-bridge.ts:34-36`** — returns `FALLBACK_COLOR = '#d4c5b0'` on a
  malformed key with **no diagnostic**. **Verdict: FIX per §5.**

The `door`/`window` keyword tables are a third case: they are **language** (regex over free-text
system-type names), not master ids. They are retained as **inference**, and §5 requires the inference
to declare itself rather than pass as resolution.

### §4.4 `packages/ai-host/src/intents/finishRef.ts` — **DERIVE**

**15 finishes**, each with `materialId` + hex **transcribed verbatim** from the master under a header
instructing future authors to *"update the hex here in the same commit"* — an unenforced,
human-executed synchronisation contract, which is drift with a due date.

**Verdict: DERIVE.** The **aliases** (`'plaster'`, `'skim coat'`, `'drywall'`, …) are legitimately
this file's own — that is *language*, and **C68 §5.d** puts language in the resolver. The **hex and
label** are the master's and MUST be read from it. `ai-host` declares `@pryzm/core-app-model`, so the
catalogue is reachable with **no new dependency edge** once §1.1 lands: the barrier that forced the
transcription is removed, and with it the justification.

### §4.5 The `materialName` family — **NOT ONE VOCABULARY; THREE SEMANTICS. REPORTED, NOT TOUCHED**

⚠ **This section was materially wrong in this contract's first draft**, which treated `materialName`
as one stray enum to be swapped for a `materialId`. Measured, it is **a field name shared by three
unrelated meanings**, and collapsing them would destroy information:

| site | shape | what it actually means |
|---|---|---|
| `HandrailTypeStore.ts:28` | closed 6-value union `steel\|chrome\|wood\|timber\|concrete\|glass` | **PHYSICAL semantics.** Its own header (`:19-26`) states it: *"materialColor is a render tint; it is not a material… the name carries roughness / metalness / transparency"* |
| `RoomTypes.ts:187` (required), `FloorTypes.ts:97`, `CeilingTypes.ts:87` (both optional) | free-text `string` | prose **absorbed from the linked room's** `finishes.*.materialName` |
| `command-registry/src/floors/floorFinish.ts` | ~20-row table of prose names + `finishColor` hexes, keyed by design style | a **style palette** — `'Pale Ash / Birch Plank'`, `'Honey Oak Plank'`. Prose, not ids: these can **never** resolve against the master |

⭐ **The real information-loss risk is not hue, and it is not the one that was flagged.**
`packages/physics-host/src/PhysicsEngine.ts:62` defines `nrcFromName()` — a **keyword match against
`materialName` lowercase that derives an acoustic NRC coefficient**, consumed at `:298-300` for
floor, ceiling and walls. So `materialName` is load-bearing for **acoustics**, and a naive
`materialName → materialId` migration would silently delete a physics input.

**Verdict, in three parts:**

1. **The physical scalars are NOT lost by referencing** — `MaterialRecord` carries `metalness`,
   `roughness`, `opacity` and `transparent`. Mapping `materialName` to a **record** *gains*
   information; mapping it to a **hex** would lose it. **MUST NOT** map any of these to a hex.
2. **Acoustic NRC is a genuine gap.** The master has no acoustic facet, so the migration is blocked
   until one exists — SPEC-05 §4.1's `MaterialSchema` already anticipates `acoustic{}`, which is the
   shape to adopt rather than invent. **MUST NOT** migrate `RoomTypes` / `FloorTypes` /
   `CeilingTypes` off `materialName` before then.
3. **`floorFinish.ts` is a genuine rival vocabulary** (a name+hex table) and is a **FOLD** target —
   but its keys are design styles, not materials, so folding means *resolving each prose name to a
   master id*, which is authoring work, not a refactor.

⛔ The minting lane edits **none** of these. `HandrailTypeStore.ts` is owned by a concurrent lane;
the rest are blocked on the acoustic facet. Recorded as **named, owned obligations** (§8.2 S9), not
as notes.

### §4.6 `UserMaterialStore` — **KEEP; it is the T2 tier, and its record shape is ADOPTED**

`packages/core-app-model/src/stores/UserMaterialStore.ts` — wired for real: `ProjectSerializer` /
`ProjectLoader` round-trip it and `MaterialsBucket.ts` displays it.

⭐ **`UserMaterialDef` is already the THREE-free record shape this contract needs** —
`{ id, label, category, color, metalness, roughness, opacity, transparent, textureUrl?, source }`,
with an explicit docstring: *"deliberately NOT a THREE.Material, so the store stays pure and
persistable."* **Verdict: this shape is ADOPTED as `MaterialRecord` rather than a new one invented**
(§1.1). Inventing a rival record here was the single largest risk in this lane, and the reason
§1.1's shape is not novel.

⚠ **Live C65 §3.3 breach, found while writing this section and NOT introduced by it**:
`UserMaterialStore.ts` calls `projectScopeRegistry.register(...)`, but
`packages/core-app-model/src/persistence/declaredProjectScopes.ts` contains **zero** occurrences of
"material". C65 §3.3 requires **both**. Gate: `tools/ga-gate/check-declared-project-scopes.ts`.
Reported, not fixed here — it is C65's territory and its own slice (§8.2 S12).

### §4.7 The prior SPEC is corrected in place, not superseded

[`SPEC-MATERIALS-REPOSITORY.md`](../../03-execution/specs/SPEC-MATERIALS-REPOSITORY.md) (PLAN,
2026-05-22) asked for this first, and its §3.1–§3.5 roadmap (user materials, textures, per-element
assignment, the schedule, IFC) **remains the roadmap**. Per the C00 amendment rule, three defects are
corrected **in that file**:

- §1 says *"~140 entries"* — it is **204** (§0.3).
- §0 blesses the inline keyword bridges as *"Kept inline (L7→L6 boundary)"* — **no such boundary
  exists** (§4.3). This file is the origin of the false justification.
- its header and §4 step 7 both name the promotion target **"C16-MATERIALS-CONTRACT"**. **C16 is
  taken** (Command Authoring Protocol, CANONICAL). The target is **C100**.

⚠ Its §4 phase 1 (*resolve a fallback timber/library colour when the type is missing*) **contradicts
C65 §3.4** and is overridden by §5 below.

---

## §5 — No silent fallback: an unresolved material is a NAMED state

This is **C65 §3.4** — *"A MISSING type MUST be visible, never a silent default… That makes 'your
type was lost' and 'this element is a default wall' the same value"* — applied to materials, and
**C73 §4**'s *refuse, never substitute*.

**MUST NOT**: substitute a colour of one's own choosing on resolution failure in a way
indistinguishable from success. Today a drifted or absent id degrades to beige (`#d4c5b0`) in
`composeMaterialKey` **and** in the wall bridge, and to `#5a4a3a` in the handrail bridge — in every
case producing an element that looks deliberately coloured. **A failure and a beige material are the
same value.**

**MUST**: failure produces a value *marked* unresolved, carrying the id that failed. Concretely:

- the `MaterialKey` colour slot carries an **`unresolved:<id>`** marker instead of a hex;
- the adapter renders the designated **UNRESOLVED colour**, chosen to be *visibly wrong* — not a
  plausible building material — and emits a **named, deduplicated** diagnostic naming the id;
- the diagnostic is emitted **once per distinct id**, never once per element: a hundred walls must
  not produce a hundred lines.

**MUST NOT**: make the unresolved path throw. A missing material is a data problem, not a crash: the
element still renders, visibly wrong, and says why.

**MUST**: an *inferred* colour (§4.3, the door/window keyword tables) is reported as inference, not
as resolution. Inference that passes for resolution is the same lie one layer up.

---

## §6 — Adapted and ready via UI + AI

### §6.1 — UI

**MUST**: every surface that displays or chooses a material is populated **from the master** — never
from a hand-written swatch list.

⚠ Measured breach at stamp time:
`apps/editor/src/ui/property-inspector/FloorPropertySection.ts:53-59` holds `floorFnColors`, **7
hard-coded hexes keyed by layer *function***, and line 108 reads
`floorFnColors[layer.function] ?? layer.materialColor` — **the function swatch takes precedence over
the layer's actual material colour**, so the panel *cannot* display a master material even when one
is correctly assigned. Under §2.1 that precedence is inverted. **Verdict: FIX (§8.1 S4).**

**MUST** (per §2.2): where an element carries an explicit override, the UI marks it as an override.

### §6.2 — AI

**MUST**: a material capability works on the **deterministic, zero-token path**. ⛔ Production has
**no AI upstream configured** (`CF_WORKER_URL` / `ANTHROPIC_API_KEY` unset, measured); a capability
reachable only through the LLM planner **tests green and does not exist for the founder**.

**MUST**: the resolver owns the **language** and the master owns the **values**, on the ONE ladder
(**C68 §5.d**, **C68 §7.c** — *"a second name→value matcher is an anti-pattern, even when it is
shorter"*). ⚠ There is **no `material` entry in `KNOWN_VALUE_SOURCES`** today; adding one is part of
§8.2 S10, and it MUST resolve through `finishRef.ts` / `resolveCatalogueRef`, never a new matcher.

⛔ **MUST NOT ship a material capability family without a real batch carrier.** This is
`DimensionFamilies.ts`'s own rule and **C68 §5.a**'s (*"a plugin `produceCommand` DTO store is
presumed DEAD until proven otherwise, because that presumption has been right 13/13 times"*), and the
measurement says the carrier is **absent**:

> Per the generated register [`API-VERB-REGISTER.md`](../../04-reference/API-VERB-REGISTER.md) — cited,
> not transcribed, per C69 §0.1 — **every `*.setMaterial` verb except `rhino.` and `room.` carries
> disposition `REFUSES` with `affectedStores: NONE`.** These are [ADR-0117](../adrs/ADR-0117-uniform-material-set-command.md)'s
> twelve per-family handlers, and they are this repository's canonical dead-verb exhibit,
> **`§FIX-MATERIAL-DEAD-DISPATCH`**, cited by C68 §5.a, C68 §7.a and ADR-0314. `room.setMaterial` is
> the mirror image, **L-842** — *"a reader with no write"*.

**Therefore a `MaterialFamilies` table is DEFERRED, and the reason is named: no carrier, not no
resolver.** Writing the resolver first would produce a capability that answers in chat and changes
nothing — §COMMITTED-IS-NOT-REACHABLE, and C11 §7.6's *"dead click behind a perfect preview."* The
carrier is §8.2 S10, and per **C16 §5.1 CA-21** it ships only with an **executed read-back** from a
RENDER/PERSIST/EXPORT store — never a `success: true`, never a read-back from the DTO store the
handler wrote.

⚠ **One material path IS live and is therefore the one this lane touches**: the wall-layer finish
route, `AddWallLayerBatchCommand` + `finishRef.ts` (ADR-0315). That is a real carrier, which is why
§4.4 is implemented now and §6.2's family is not.

---

## §7 — The gate

`tools/ga-gate/check-material-single-source.ts` — BUILT at stamp time.

- **ARM A (hard-0)** — no material-colour literal in `materialLibrary.ts`: the derived view holds no
  data of its own (§1.3).
- **ARM B (hard-0)** — no hex literal in `finishRef.ts` (§4.4).
- **ARM C (named ledger)** — the known rival vocabularies (§4.2, §4.5) are listed **by name** with
  their owning slice; the gate fails if a rival appears that is **not** on the ledger. A ledger entry
  is a declared debt with an owner; an unlisted rival is a new duplicate. *A baseline is not
  permission* (C68).

### §7.1 — What this gate does NOT decide

Stated so it is never read as coverage. It **cannot** tell that a `materialId` an element stores
actually **exists** in the catalogue (a data question, not a source question); it does **not** police
hex literals in unrelated UI chrome; it does **not** verify that a family *uses* the master, only that
it mints no rival; and it says nothing about **persistence round-trip** of material references. Per
C70 §7.1 those four axes are **UNPROVEN**, never green.

---

## §8 — Slices

### §8.1 — BUILT in the minting lane

- **S1** — the master moves to L0; `MATERIAL_CATALOG` in `packages/schemas/src/materials/`;
  `STANDARD_MATERIAL_LIBRARY` derived; every designated accessor preserved (§1.1, §1.3, §4.1).
- **S2** — `composeMaterialKey` **resolves `materialId` against the master** instead of defaulting to
  beige, and emits the §5 unresolved marker when it cannot. This is the single point that decides the
  rendered colour for **every** family, which is why it is the highest-value slice.
- **S3** — ⛔ **WITHDRAWN from this lane, and its REPLACEMENT PROOF IS RETRACTED — see §9.3.** The
  coverage proof was moved to **door** on the stated grounds that door's producer *"does route
  through `composeMaterialKey`"*. It does not: that name appears in `producers/door.ts` only in a
  comment, the producer hard-codes `const materialId = ''`, and door's schema has no `materialId` at
  all. The test standing as the proof never constructs a door. **Do not cite S3 as coverage.**
  Original text follows.
- **S3 (original)** — ⛔ **WITHDRAWN from this lane.** The handrail bridge was to be fixed here; a concurrent
  lane has since wired handrail's `materialId` to the screen through a single `resolveColour()` and
  therefore OWNS the file. Editing it would collide. What that lane left is **one re-point site**, and
  re-pointing it at the master is its own commit. The coverage proof moves to **door** — a family
  that likewise read neither library and whose producer *does* route through `composeMaterialKey`, so
  it proves the same claim without the collision.
- **S4** — `FloorPropertySection` swatches resolve from the master (§6.1).
- **S5** — `finishRef.ts` derives its hexes and labels, keeping its aliases (§4.4).
- **S6** — the §5 named diagnostic replaces the silent beige.
- **S7** — the §7 gate.

### §8.2 — NAMED and UNBUILT — each with the reason it is not a guess

- **S8** — `RENDER_MATERIAL_LIBRARY`: fold or delete, after deciding what its **8** unmapped ids mean
  (§4.2). Blocked on a **design decision**, not on effort.
- **S9** — the `materialName` family (§4.5) in **three separately-blocked parts**: (a) `HandrailTypeStore`'s
  6-value physical enum — ⛔ concurrent-lane-owned; (b) `RoomTypes` /
  `FloorTypes` / `CeilingTypes` free-text — **blocked on an ACOUSTIC FACET on `MaterialRecord`**,
  because `PhysicsEngine.nrcFromName()` derives NRC from that prose today and migrating first would
  silently delete a physics input; (c) `floorFinish.ts`'s ~20 prose names — authoring work, not a
  refactor. Each is C03 §1.3 + C47.
- **S10** — a **real material batch carrier**, then the `material` value source and the
  `MaterialFamilies` table (§6.2), under C67 §6 / C68 §5's full checklist. **This is what the
  founder's "via AI" actually depends on**, and the largest remaining piece.
  ⛔ **STILL OPEN 2026-08-23, and lane MAT50 established that it is now blocked on LANE OWNERSHIP,
  not on design** (§10.13.f, L-8612): the carrier needs a `BATCH_REPORT_EVENTS` row inside a
  concurrent lane's exclusion zone, and `batchReportEventsCompleteness.spec.ts` fails any
  broadcasting handler that lacks one — so shipping the handler alone would turn a GREEN gate RED
  and reprint the canned "Done" that L-996 exists to remove. ⚠ It also carries an undecided design
  question: whether the already-live `set-wall-side-finish` (which writes the appearance-only
  `sideFinishes`, deliberately beside the layer stack) should ALSO name the layer's material, or
  whether a second phrase should. **Two near-identical sentences writing two different fields is a
  rival vocabulary in the making** (C68 §7.c).
- **S11** — SPEC-MATERIALS-REPOSITORY §3.2–§3.5: textures, per-element assignment, the schedule, IFC.
  ⭐ **PARTIALLY CLOSED 2026-08-23 (lane MAT50, §10.13) — the SCHEDULE half only.** Its element axis
  is now DERIVED with a both-directions set gate, `handrail` gained the column its 26 real material
  references had never had, and a family that cannot name a material renders its OWN state instead
  of the dash that meant two opposite things. ⛔ **Textures, per-element assignment and IFC are
  untouched**, and the schedule's own axis still reads the TYPE CATALOGUE, not placed elements.
- **S12** — the C65 §3.3 `declaredProjectScopes.ts` breach on `UserMaterialStore` (§4.6).

### §8.3 — Concurrent-lane compatibility — a MUST

Two lanes are in this code at stamp time. **MUST**: every accessor in §1.3 keeps its name, signature
and behaviour; a lane consuming the library mid-flight must not be broken by the library being
restructured beneath it. ⛔ **MUST NOT**: this lane edits `HandrailTypeStore.ts` (§4.5).

---

## §9 — The consumption census, and the convergence plan (measured 2026-08-19)

> **Stamp**: 2026-08-19 · **Status**: §9.1–§9.5 are MEASURED FINDINGS; **§9.6 is normative TO-BE**.
> **Founder request**: *"I need to make sure that all elements are consuming materials from the
> database. PRYZM is data-first… all consumers should gather the material from the same master
> material data."*
> **Measured by**: lane MT1. Census banked as **L-1038**; this section and its gate as **L-1120**.
> ⚠ **This section CORRECTS §4.3 and §8.1 S3.** Both are wrong, and both are wrong in the same
> direction — they describe a convergence that was authored but never wired.

### §9.1 — The answer, in one line

> ⛔ **No. Of the sixteen element families that carry a `materialId`, exactly ONE — `wall` — has that
> id reach the rendered colour. Every other family carries the id through the pipeline and drops it
> before the pixel.**

And the loss compounds, so the four states must not be flattened (L-1038):

| how the material is lost | families |
|---|---|
| **renders, then DIES ON SAVE** | `stair`, `beam`, `curtain-wall`, `furniture`, `plumbing` — five per-family serializers write no `materialId` |
| **never persisted at all** | `lift`, `lighting`, `structural`, materially `dimension` |
| ⛔ **no `materialId` EXISTS to lose** | **`door`, `window`** — colour-only in the L0 schema (`Door.ts:59-60`, `Window.ts:57`). C100 §2.1's explicit MUST NOT, for two of the most-used families in the product |
| **never reaches export** | **all of them** — zero `IfcMaterial` / `IfcMaterialLayerSet` / `IfcRelAssociatesMaterial` repo-wide. What exports is a raw colour scraped off the THREE mesh; the only material *strings* reaching IFC are free-text pset values. **Prose, not catalogue ids.** |

> ⛔ **TWO ROWS OF THAT TABLE ARE CORRECTED 2026-08-20 (lane MAT2, L-1460 + L-1464), and
> the correction is not a detail — it is about WHICH PATH was measured.** See **§9.10**.
> In short: **`furniture` is in the wrong row** (it was never *"renders, then dies on save"*;
> on the path production furniture travels there was **no `materialId` at any of five
> layers** — the `door`/`window` mode, not the serializer mode), and **`wall`'s "works" is a
> statement about the CODE that says nothing about the DATA** — measured, **no wall-creation
> path assigns a top-level `materialId` at all**, so the one family that resolves has nothing
> to resolve. ⭐ **"No material assigned" and "material assigned but not rendered" are
> different defects**, and this table flattened them for the two families the founder named.

### §9.2 — The mechanical cause, and it is ONE thing

`composeMaterialKey` — the only function that resolves a `materialId` against `MATERIAL_CATALOG` on
the render path — is imported by **one** producer file. §8.1 **S2 claims it is *"the single point that
decides the rendered colour for **every** family"***. It is not, and the measurement is blunt:

```
npx tsx tools/ga-gate/check-material-id-required.ts    # ARM C
  → 17 key-minting producers, 0 route their colour slot through the master
```

`wall` does not appear in that 17 and that is not a miss: wall has **no minter of its own** — its key
is minted *by* the resolver. That is precisely why wall is the one family that works.

⛔ **`composeFamilyMaterialKey` — written expressly to extend that resolution to the other families,
with a header naming handrail's defect as its motivation — has ZERO callers.** It has never run.
§COMMITTED-IS-NOT-REACHABLE, inside the fix for the defect it was written to fix.

> ⛔ **RESOLVED 2026-08-20 (MAT2, L-1462) — and NOT by giving it callers. It is DELETED.**
> Re-measured on the day it was to be wired, it still had zero — and the reason is not neglect:
> it imposed ONE key layout on every family, which **§9.6.b explicitly forbids**
> (*"MUST NOT: this contract be cited to mandate a single key string layout"*). ⭐ Slices S16
> and S17 converged **ten of the seventeen producers without it**, each calling
> `resolveMaterialColorSlot` from inside its OWN minter — converging the VALUE and leaving the
> FORMAT alone, which is what §9.6.b asks for. **So it was not the unfinished half of that
> work; it was a rival to it**, and §9.6.a's rule is *"MUST NOT let a third appear"*. A third
> exported resolver sitting unused is the next rival vocabulary with a head start.

### §9.3 — §8.1 S3 is RETRACTED: the coverage proof does not touch its subject

S3 withdrew the handrail fix (correctly — a concurrent lane owned the file) and moved the coverage
proof to **door**, justified as *"a family that likewise read neither library and whose producer
**does** route through `composeMaterialKey`."*

**Both halves of that justification are false.**

- `producers/door.ts` **does not import** `composeMaterialKey`. The only occurrence of that name in
  the file is a **comment** (`:13-14`) saying door's key is *"symmetrical with"* it. Door mints its
  own key at `:55` — and hard-codes **`const materialId = '';`** at `:203`.
- Door has no `materialId` to route. Its schema carries `frameColor` + `leafColor` and nothing else.

The test standing as that proof, `masterMaterialResolution.test.ts` C-1, is titled *"resolves an
id-only **door** to that material colour"* and calls `composeMaterialKey` **directly**. It never
constructs a door, never calls `produceDoor`, and would pass unchanged if `producers/door.ts` were
deleted. ⭐ **Its own header forbids exactly this** — *"asserting `materialHex()` returns a hex would
prove only that a pure function works."* The header is right; the test does the thing the header
forbids, one call deeper. **A fake built from the header cannot falsify the header.**

### §9.4 — §4.3's "16 legitimate adapters / 2 defective" is corrected

§4.3 reasons from *"a bridge splits a kernel-emitted `MaterialKey`
(`<family>|<systemTypeId>|<materialId>|<color>|<slot>`)"* — **one format, asserted.** Measured, the
producers mint **eighteen distinct key layouts**, and that format is minted by **five** of them
(wall, slab, door, window, column/beam). The colour slot sits at index **3** for most, index **2**
for `ceiling` and `room`, index **4** for curtain-wall `panel`, and **does not exist at all** for
`stair`, `handrail` and `furniture`.

⭐ **MT-2's expected finding did NOT reproduce, and the negative result is the useful one.** L-1053
(curtain-wall parsing a layout nothing minted) was assumed to have siblings. It does not: every other
bridge reads the index its own minter writes. **The bridges and minters AGREE. What they agree on is
a colour that was never resolved from the master** — which is why eighteen internally-consistent
adapters still deliver the wrong material.

§4.3's review test — *"if a material is recoloured in the master, does this file need editing?"* —
returns "no" for a bridge that is **entirely disconnected** from the master, so a dead adapter passes
it. Applied with that hole closed, **four** bridges are defective, not two:

| bridge | defect |
|---|---|
| `handrail` | `colorOfHandrailMaterialKey(_key)` ignores its argument; returns `#5a4a3a` always. Already §4.3's finding. ⛔ HR1-owned. |
| ⛔ `furniture` | `hashMaterialId()` — a **DJB2 hash of the `materialId` indexed into an 8-colour `PALETTE`**. A recolour in the master changes nothing; two unrelated materials collide onto one hue. This is a **rival colour authority**, not an adapter, and §4.3 missed it. |
| `door` | `DOOR_KEYWORD_COLORS` — regex keyword→hex inference |
| `window` | `inferFrameColor` — the same |

⚠ **Door's keyword table is the one to read as architecture, not as sloppiness.** Its header states
it exists because *"inline keyword colours respect the L7→L6 boundary (no core-app-model import)."*
§4.3 already established **no such boundary exists**. But the deeper point stands regardless of that
error: **a copy was made because the author believed the master was unreachable from their layer, and
a layering constraint that makes the master unreachable will keep manufacturing rival vocabularies.**
That is §0.2's finding recurring at L6/L7 instead of L2. It is an architecture question and §9.6
answers it explicitly, rather than deleting the table and waiting for the next one.

### §9.5 — The id vocabulary has DRIFTED, and this blocks the wiring

⭐ **The single most consequential finding, and it inverts the fix order.**

The master is **204 rows, 100% kebab-case, zero dots, zero underscores**. But **every `materialId` in
the repo's own parity fixtures is ABSENT from it** — `gypsum.standard`, `acoustic.tile`,
`plaster.painted`, `glass.fritted`, `mat_concrete_dark`: three rival naming conventions, none of them
the master's.

> **Nobody noticed because nobody resolved them. An id no one looks up is an id no one validates** —
> §NO-EMPTY-MEANS-UNKNOWN, one layer beneath the code: the *data* was never checked because the
> *code* never asked.

**Therefore the wiring MUST NOT go first.** Turning resolution on across thirteen producers today
would be §5-correct and product-catastrophic: every drifted id would correctly become
`unresolved:<id>` and render magenta on real projects. §9.6 sequences reconciliation ahead of wiring
for this reason and no other.

⚠ Production is in better shape than the fixtures: `WallSystemTypeStore`, `SlabSystemTypeStore`,
`FloorSystemTypeStore`, `HandrailTypeStore` and the furniture seed all use real master ids. **The
gate's ARM B measures the remainder** — do not transcribe its count here.

### §9.6 — THE CONVERGENCE PLAN (normative TO-BE)

⛔ **This is NOT eighteen fixes.** **ONE resolution authority; ONE colour-slot contract; per-family
adapters only where a family genuinely differs.**

**§9.6.a — The resolution authority already exists. MUST NOT mint a second.**
`packages/core-app-model/src/materialResolution.ts` (`resolveMaterialColour`) implements §2.1's
ladder **once**: T2 then T1, and it returns a **discriminated union** whose `unresolved` member
carries a `reason` and **no hex**, so a caller *cannot* render a fallback by accident — the compiler
makes them handle it. **MUST**: every new consumer calls it. **MUST NOT**: any family chain
`userMaterialStore.get()` and `materialHex()` itself; a second private chain is how the next rival
gets written.

⚠ Its one limitation is a **layer** fact, not a design fault: it sits at **L2** and imports
`UserMaterialStore`, so `geometry-kernel` cannot call it. That is the same reachability wall as §0.2.
**MUST**: the kernel-side resolution is `resolveMaterialColorSlot(input, familyDefault)` in
`producers/_internal/composeMaterialKey.ts` — T1-only, THREE-free, **the same precedence** — and it
is a **declared, temporary divergence** under C84 EI-10, not a rival:
*reason* — L0/L2 layering; T2 is not reachable from the kernel.
*equivalence* — identical precedence and identical `unresolved:` marker on the T1 arm.
*retirement* — collapses into one call the moment `UserMaterialStore`'s data is reachable at L0 or
the kernel is handed a resolver by injection. **MUST NOT** let a third appear: the gate's ARM C keys
on these two names.

**§9.6.b — Converge the VALUE, not the FORMAT.**
The eighteen key layouts are **not the defect** (§9.4) and rewriting them would churn every parity
snapshot for no user-visible gain. **MUST**: every producer's colour slot is produced by
`resolveMaterialColorSlot`. **MUST NOT**: this contract be cited to mandate a single key string
layout. A family's slot *count*, *order* and *extra slots* stay its own — C100 §3 already permits
family render constants, and a roof trim defaulting to white while a slab soffit defaults to grey is
a legitimate difference (C84 EI-10), which is why `familyDefault` is a **parameter** rather than the
beige constant. Forcing one default would repaint every unmaterialled element in the product and get
the convergence rightly reverted.

**§9.6.c — The order is forced, and it is not the obvious one.**

1. **RECONCILE the ids first** (§9.5). Gate ARM B is the meter. Until it reads 0, wiring converts
   silent-wrong into loud-wrong on live projects.
2. **PERSIST second.** A material that renders correctly and dies on save is worse than one that
   never rendered — the user believes it was recorded. Five serializers (ARM D). ⚠ `ProjectSerializer`
   / `ProjectLoader` are concurrent-lane-owned; this is a **coordinated** change, not a drive-by.
3. **WIRE the producers third**, family by family, each landing with a test that drives a **real DTO
   through the real producer into the real bridge** and asserts the master's hex — never
   `composeMaterialKey` in isolation (§9.3).
4. **SCHEMA fourth** — `door` and `window` gain a `materialId`. Per **C67 §6 / C68 §4–§5** a new
   user-visible attribute binds a verb, a panel row and a chat capability; and per §6.2 the
   `*.setMaterial` verbs are the repository's canonical **dead-verb** exhibit, so this slice **MUST
   NOT** ship without a real batch carrier and an executed read-back.
5. **EXPORT last** — IFC `IfcRelAssociatesMaterial` (C25), the only step that makes the id mean
   anything to another tool.

**§9.6.d — Make the master reachable from L7, or the copies continue.**
Door's and window's keyword tables were authored under a *believed* layering constraint (§9.4).
**MUST**: the resolution authority is reachable from every layer that must name a material — L0 for
T1 today, and an injected or L0-hosted T2 for the rest. **MUST NOT**: a family be asked to "just not
copy" while the master is unreachable from where it stands. That rule is unsatisfiable, and
§UNSATISFIABLE-GATE-DECOMPOSITION-IS-THE-FIX applies: decompose first, then the rule is obeyable.

### §9.7 — The gate

**`tools/ga-gate/check-material-id-required.ts`** — §2.1's MUST NOT shipped **violated**, and a rule
with no gate is a wish. **FIVE** shrink-only arms:
**ARM A** a schema with a colour field and no `materialId` · **ARM B** a stored `materialId` that
resolves to nothing · **ARM C** a producer minting a key without the master resolver · **ARM D** a
per-family serializer that does not persist `materialId` · **ARM E** *(added 2026-08-19, S15)* a
serializer that **writes** an id which `ProjectLoader` **never reads back**.

⚠ **ARM E is the axis this section's own closing paragraph declared NOT CHECKED** — *"it does not
check `ProjectLoader`'s read side, only the write side"*. It was not a theoretical gap. On its first
run it found **`slab`**: `serializeSlab()` writes `materialId` **and** `materialColor`, and the
loader's `CreateSlabCommand` payload lists **neither** — so a slab's material is present in the
saved file and **absent from the reloaded slab**. ⭐ **That is the worst shape a persistence defect
can take**, because the evidence a reviewer reaches for — open the JSON, find the id — says it
worked. §COMMITTED-IS-NOT-REACHABLE: the user's evidence is the reload, never the file.

⛔ **AND ARM D's FIRST READING WAS WRONG ABOUT THREE OF ITS SIX FINDINGS.** It tested
`body.includes('materialId')` — **one spelling, on the direct body only** — and by that test:
- **`serializeCurtainWall` was a false positive.** It writes `mullionMaterialId` and
  `glazingMaterialId`; capital **M**, so a case-sensitive substring test misses both. The curtain
  **wall** record has no plain `materialId` to write, and its **panel** ids live on the panel store
  and persist separately. *(This is the correction the CW lane raised, and it is now measured rather
  than argued.)*
- **`serializeHandrail` was a false positive.** It is `return serializeHandrailRecord(h)`, and that
  function copies **every** own key (L-1102's one save/load pair). The id persists — one module away.
- **`serializeStair` was a false positive AS AN ARM D FINDING, and a REAL defect of another kind.**
  It is `return deepStrip(s)`, which cannot drop a field it never enumerates. It writes no id because
  the **live `StairData` has no `materialId` at all** — `SetStairMaterial.ts:57` refuses with exactly
  that sentence. ⭐ **"The serializer drops it" and "there is no field to drop" are different defects
  with different fixes**, and ARM D can only ever see the first. The second is **ARM A's shape one
  layer down**, at the runtime store type, where **no arm looks yet** — and per §9's own structural
  finding, the runtime store type is the vocabulary that persistence actually reads.

⭐ **The generalisation, which is the third recurrence of one shape in this contract alone**
(§0.3's counting hole, §9.7's `#rrggbb`-only projection arm, and now this): **a gate that checks one
spelling of a thing does not check the thing.** ARM D now matches `[A-Za-z]*[Mm]aterialId`, follows a
delegated `serialize*Record()` call one hop, and recognises whole-object copies. Its ceiling dropped
**5 → 3** — and **not one of those two was a fix**; they were measurement errors being removed.

Exit **0** within baseline · **2** MISCONFIGURED · **3** ratchet exceeded — never aliased, so
*could-not-measure* is never mistaken for *measured-a-failure*. Each arm carries a subject floor
(§RATCHET-R5): a scan that finds nothing FAILS. **Cite the gate, never these numbers.**

⚠ **These four arms are exactly the axes `check-material-single-source.ts` prints as NOT CHECKED in
its own output** — which is where every loss in §9.1 lives. That gate was **BUILT and never
registered**: §7 called it enforcement, and `run-all.ts` had never heard of it. Both are now
registered.

⚠ **And its projection arm had a hole of the same shape as §0.3's counting hole:** it matched
`#rrggbb` only, so `materialLibrary.ts`'s wall presets (`color: 0xe8e8e8`, `0xf5f5f5`) sat in the
projection in plain sight and the gate reported *"0 colour literals"*. ⭐ **A gate that checks one
spelling of a value does not check the value.** Now measured, as declared debt with an owning slice
(S13) — folding them requires deciding whether a schematic/realistic wall preset is a **material** or
a **view style** (C04), and guessing would mint the rival the gate exists to prevent.

⛔ **What §9's gate still does NOT decide** — stated so it is never read as coverage. It does not
prove a resolved colour reaches a **pixel** (ARM C proves the import, not the frame); it does not
measure IFC/GLB material export at all; it cannot tell a *deliberate* family default from a
*forgotten* one; and **ARM E proves only that the loader READS the id** — not that it hands it to a
command that STORES it, nor that the store feeds a producer. Per C70 §7.1 those axes are
**UNPROVEN**, never green.

⚠ **One axis was moved OFF this list and into ARM E**, and the move is the point: *"does not check
`ProjectLoader`'s read side"* stood here as declared debt, and declared debt that nobody converts
into an arm is indistinguishable from debt nobody found. It cost one arm and caught a live loss.

⚠ **A NEW blind spot is declared in its place, because ARM D's correction exposed it.** No arm
inspects the **runtime store types** (`packages/geometry-*/src/*Types.ts`, `core-app-model/src/stores/*Types.ts`).
ARM A reads the **L0 Zod schemas**, which §9's own structural finding records as having **no
persistence consumer at all**. So `stair`, `beam`, `furniture` and `plumbing` — whose live records
carry **no `materialId`** — are invisible to ARM A *and* mis-described by ARM D. **That is an ARM F,
and it is unbuilt.**

### §9.8 — Slices

| slice | what | state |
|---|---|---|
| **S13** | `materialLibrary.ts`'s four `0x` wall presets: master row, or C04 view style? | **DECIDED 2026-08-19 — §9.9. They are a C04 VIEW STYLE, not material rows.** |
| **S14** | Reconcile drifted ids to master ids (ARM B → 0) | ✅ **CLOSED 2026-08-19** — eight dot-case ids reconciled; one genuinely-missing master row minted (`steel-grating`); a **closed** eight-entry legacy alias map keeps pre-existing saves resolvable. ARM B's ceiling is now **hard 0**. |
| **S15** | Persist `materialId` in the serializers that drop it (ARM D → 0) | **PARTLY CLOSED / RESCOPED 2026-08-19.** Three of the five named were **measurement errors, not defects** (see §9.7); ARM D 5 → 3. The three that remain (`beam`, `furniture`, `plumbing`) have **no `materialId` on the runtime record to persist** — they are ARM F work, not serializer work. **ARM E (new) found the real loss: `slab`** — written, never read back. Owned by the persistence/slab lane. |
| **S16** | Route every producer's colour slot through the resolver (ARM C → 0) | **IN PROGRESS — 17 → 13 (2026-08-19).** `ceiling`, `stair`, `handrail`, `roof` routed, each with a test that asserts the MASTER's hex and was **verified to fail without its fix**. ⚠ `stair` and `handrail` had **no colour slot in the key at all** — stair's bridge picked by SLOT, and handrail's `colorOfHandrailMaterialKey(_key)` **ignored its own argument** — so both gained one, with a legacy-shape fallback so cached keys do not regress. `roof` resolves the **shingle slot only**; deck/trim/interior stay canonical per §9.6.b, and the test pins that they did **not** move. ⛔ `slab` is deferred: its family is concurrent-lane owned and it is also ARM E's finding. **Thirteen to go, one at a time — a shared harness would repeat the §9.3 retraction.** |
| **S17** | `door` + `window` gain `materialId` (ARM A → 0), with a real carrier per §6.2 | OPEN — largest, and C67/C68-bound |
| **S18** | IFC `IfcRelAssociatesMaterial` (C25) | OPEN — nothing reaches export today |

### §9.9 — S13 DECIDED: the four `0x` wall presets are a **C04 VIEW STYLE**, not master rows

**Decided 2026-08-19 under the founder's standing instruction to decide rather than defer.** §9.7
found `color: 0xe8e8e8` and `0xf5f5f5` (four occurrences) inside `materialLibrary.ts` — the file
C84 §1.3 declares a **projection that holds no material data of its own** — and named the fold as
blocked on a design question: *master row, or view style?* Guessing would have minted the rival
vocabulary this contract exists to prevent, so it was **measured**.

**Four measurements, each falsifiable:**

1. ⛔ **Two of them exist for ONE physical surface, selected by render mode.**
   `WallFragmentBuilder.ts:4521` and `:4531` choose `WALL_REALISTIC_MATERIAL` or
   `WALL_SCHEMATIC_MATERIAL` by `VisualStyle`. **A material cannot be two colours depending on how
   you are looking at it.** That is the definition of a view style and the definition of *not* a
   material.
2. ⛔ **They are LAST in the precedence chain** — applied after `finishColour || wall.materialColor`.
   §2.1's ladder makes an authored material or an explicit override win every time, so as a
   "material" they could never be *chosen*, only *fallen back to*.
3. ⛔ **They are unnameable and unassignable** — no id, no label, no category. §2.1 says an element
   REFERENCES a material by `materialId`; **nothing can reference these**, and nothing ever could.
4. ⛔ **Promoting them would put "unstyled" into the catalogue as something a user can PICK**, making
   *"this wall has no material"* and *"this wall is light grey"* the same value — deliberately, in
   the master. That is exactly the beige-default failure §1.2 traces.

**Consequences, and the one thing this does NOT settle:**

- ✅ **NOT folded into `MATERIAL_CATALOG`.** The catalogue stays 205 rows of things a user can name.
- ✅ **MOVED to `packages/core-app-model/src/wallViewStyleMaterials.ts`**, which carries the reasoning
  above in full. `materialLibrary.ts` **re-exports all four names unchanged**, so
  `@pryzm/core-app-model/material-library` importers — `geometry-wall` among them, concurrent-lane
  owned — are untouched (C84 §8.3).
- ✅ **The hexes stay literal, and that is not a compromise.** A view style's colour is a rendering
  constant, and C100 §3 already permits family render constants; what §1.3 forbids absolutely is a
  colour literal **in the projection**. `check-material-single-source.ts`'s `0x` arm therefore drops
  from a declared-debt baseline of **4 to hard 0** — a real invariant now, not a tidied number.
- ⚠ **NOT DECIDED HERE: whether an unmaterialled wall should render as light grey at all**, rather
  than as §5's NAMED unresolved state. That is a product question about the default appearance of
  unauthored fabric, it is far larger than a file move, and settling it by relocation would be the
  guess this slice refused to make.

---

## §9.10 — The census measured the WRONG PATH for furniture, and "wall works" is a claim about code, not about data (measured 2026-08-20)

> **Stamp**: 2026-08-20 · **Lane**: MAT2 · **Rows**: L-1460 – L-1464.
> **Founder's question, verbatim**: *"Are you able to understand why all furniture and walls +
> doors don't have materials associated? Is this since we target the materials of elements via
> contract C100 to furniture etc.? That was done yesterday? Doors and windows often show, often
> don't."*
> ⚠ **This section CORRECTS §9.1 (two rows), §9.2, §9.7 (ARM F's declared pair) and §9.8 (four
> stale slice states).** §9 was written to correct §4.3 and §8.1; this is §9 being corrected in
> turn, and the recurrence is the finding, not an embarrassment.

### §9.10.0 — The founder's causal question, answered: **NO**

⛔ **Yesterday's C100 work did not cause this, and the evidence is a path measurement, not an
opinion.**

1. ⭐ **Walls could not have been touched.** Every C100/material commit of 2026-08-19 was
   enumerated and its file list read: **not one touches `packages/geometry-wall/`.**
   `WallFragmentBuilder.ts` — which owns `createWallMaterial()`, the colour authority for every
   plain, curved, opening-bearing, CSG and creased wall arm — has **no material-lane commit in
   its history at all.** A file that was not edited cannot have regressed.
2. ⭐ **Furniture, door and window WERE edited, and each landed with an explicit
   nothing-repaints construction that was verified rather than asserted.** Furniture's new
   family default `#a78b6e` is **byte-identical to `hashMaterialId('')`**, the value the
   pre-existing djb2 bridge already returned for an unmaterialled item. Door's ladder carries
   rungs 5–7 for exactly this purpose — *"every door that has no finish id renders the
   byte-identical colour it rendered before this file existed."*
3. ⭐ **Every arm of the gate moved the RIGHT way across that day**: ARM A 2 → **0**,
   ARM B 8 → **0**, ARM C 17 → 13 → **10 routed**. Nothing regressed; the census is what made
   a long-standing gap countable.
4. ⛔ **And a DRAFT contract cannot alter what renders.** §9 is the document that *measured*
   the gap. Measurement is not mutation.

⭐ **What he is seeing is OLD, and the honest framing is that the census made it VISIBLE rather
than made it true.** For furniture the wrong colour was *stable and tasteful* — §9.4's point
about why the djb2 palette survived so long — so it read as a design decision until somebody
counted.

### §9.10.1 — ⛔ Furniture is in the WRONG ROW of §9.1, because the census measured a path production does not travel

§9.1 files `furniture` under *"renders, then DIES ON SAVE — its per-family serializer writes no
`materialId`"*. §9.8 S16 records the furniture producer as ROUTED, with its own real-DTO test,
and the gate's ARM C agrees. **All of that is true and none of it reaches the founder's screen.**

`initTools.ts` §FT-FURNITURE states the reason in its own words: the PRYZM-3
`CreateFurniturePayload` *"does NOT match the legacy `FurnitureData` model … and no bus→legacy
bridge existed"*. The live path is therefore:

```
furniture.create / furniture.batch.create
  -> CommandEventBridge       -> 'furniture.created' event
  -> initTools §FT-FURNITURE  -> geometry-furniture FurnitureStore  (legacy FurnitureData)
  -> FurnitureFragmentBuilder -> 62 builders -> MaterialService.getMaterial(color: number)
```

⛔ **`materialId` existed on NONE of those five layers.** Not on the payload, not on the event,
not on the runtime record, not in the builder, not in `serializeFurniture`. So furniture's
material was **not lost — it had never been reachable**, which is the `door`/`window` mode
(*"no `materialId` EXISTS to lose"*), not the serializer mode.

⭐ **§9.7's own sentence is the one that applies, one path over from where it was aimed:**
*"'the serializer drops it' and 'there is no field to drop' are different defects with different
fixes."* ARM D can only ever see the first. It saw the first.

⭐ **And the founder's panel was telling him the truth the whole time.**
`FurniturePropertySection.ts` renders a **read-only** row labelled **"Material"** whose value is
`FurnitureData.material` — a **FOUR-VALUE** closed union `wood | metal | fabric | glass`, against
a master of **205 rows**. Oak, walnut, ash and birch are all, and only, `wood`. *"Furniture
doesn't have materials associated"* is a correct reading of the product.

**CLOSED (L-1460)** — all five layers plus the read-back, in one change, because a field that
renders and does not persist is the worst of the three states (§9.6.c step 2):
`FurnitureData.materialId` · the `furniture.created` event contract · `CommandEventBridge` (both
the single and the batch fan-out) · the §FT-FURNITURE mirror · `CreateFurnitureCommand` ·
`serializeFurniture` (ARM D) · `ProjectLoader`'s hand-written payload (ARM E) · and the
resolution itself at `FurnitureFragmentBuilder`'s single dispatch choke point, so it is **one
call rather than sixty-two** and no builder can grow a ladder of its own.

⚠ **The four-value `material` union is KEPT, not removed** — 62 builders read it and it drives
geometry decisions (a glass shelf is built differently from a timber one). It is a **construction
hint**; `materialId` is the **reference**. Conflating them is what made the hint look like the
answer.

⚠ **DECLARED DIVERGENCE (C84 EI-10): `materialId` outranks `color` on this path.** §2.1's ladder
puts an explicit user OVERRIDE above the id. On this path `color` is **not** an override — the
D-FLE furnish engine stamps it on **every** item it auto-places as a style default (A.21.D4) — so
honouring it first would mean a chosen material could never render on auto-furnished furniture,
which is the entire defect. *Retirement*: the moment `color` can be told apart from a generator
default, which is §2.1's *"MUST be distinguishable"* clause, **unmet on this record shape**.

### §9.10.2 — ⛔ `wall` "works", and that is why measuring the CODE was not enough

§9.1 says *"exactly ONE — `wall` — has that id reach the rendered colour."* **True, and it does
not mean a wall in the founder's project has a material.** Measured 2026-08-20, end to end:

| link | measurement |
|---|---|
| `WallTool.createWall()` payload | `start, end, height, thickness, levelId, baseOffset, curve, systemTypeId` — ⛔ **no `materialId`** |
| `WallPlanToolHandler._commitWall()` | same list — ⛔ **no `materialId`** |
| `CreateWallCommand` | accepts `materialId?` and stamps it **verbatim, with no `??` fallback and no system-type read** → `undefined` |
| the default system type `wt-monolithic` | the `WallSystemType` interface has **no `materialId` field at all**; its one layer carries `materialColor: '#e8e8e8'` — ⭐ **which IS `WALL_SCHEMATIC_MATERIAL`, the "no material" grey** |
| the active type on a new project | `undefined` until the user picks one; the UI reads *"✓ Plain Wall ready…"* |

⭐ **So the wall defect is NOT-ASSIGNED, not ASSIGNED-AND-DROPPED.** The resolver is wired and
correct; nothing hands it an id. §CONTEXT-DATA-HONESTY, one level up from the code: *the data was
never checked because the code never asked* — §9.5's own sentence, and it applies to wall too.

⭐ **A THIRD measurement separates this from the same night's flat-white report.** The founder
also reported *"all materials gone on the view"*, which lane RENDER3 closed as **L-1470: an OBC
WebGL canvas sized 0×0 by an unguarded `ResizeObserver`, discarding every draw.** ⛔ **That is a
different defect and must not be merged with this one.** The discriminator is decisive: a
`materialId` that never reaches the pixel is **CONSTANT** — identical colours on every load,
forever. *"Gone"* is a **STATE CHANGE**. A constant defect cannot explain a change, and a
framebuffer cannot explain a wall that was never assigned a material.

**MEASURED AND NOT FIXED, deliberately (L-1464).** Making `wt-monolithic` name a master row is a
**product decision about the default appearance of unauthored fabric**, and §9.9 already left
precisely that question open: *"NOT DECIDED HERE: whether an unmaterialled wall should render as
light grey at all."* Guessing would repaint every wall in every project — the thing §9.6.b names
as what would rightly get this convergence reverted. **It is the founder's call, and it is stated
as a question rather than answered by a lane.**

**FIXED in passing (L-1461)** — the plumbing that would have dropped an id if one existed. The
§P2.1 bus→legacy wall mirror in `initTools.ts` copied `materialColor` and `layers` and **dropped
`materialId`**, while the column, slab and handrail mirrors beside it all carry it. The
`wall.created` event had no top-level `materialId` either. ⚠ **This changes nothing on screen
today and the commit says so** — it exists so the field is not silently lost the moment a wall
does name a material. The identical hole in this same whitelist has already cost this product the
residential façade colour (§RESI-FACADE-COLOUR-PERSIST) and the plan-view curve
(§FIX-WALL-CURVE-PLAN-VS-3D-CREATION).

⭐ **One measurement that makes a future slice SAFE, recorded because a negative result is worth
banking:** the **15** wall-system-type layers that carry both a `materialId` and a transcribed
`materialColor` were checked against the master — **15 agree, 0 disagree, 0 missing.** So routing
`layer.materialId` through the resolver (§2.2, so a master edit reaches placed walls) is a
**zero-repaint** change today. ⛔ Not done here: `WallFragmentBuilder` is a 4,800-line file with
three concurrent wall lanes in its recent history, and §8.3's concurrent-lane rule outranks the
convenience of doing it in this one.

### §9.10.3 — ⛔ Door and window: §9.1's row is now STALE, and the founder's "often show, often don't" is NOT a material defect

§9.1 files `door` and `window` under *"no `materialId` EXISTS to lose."* **Superseded by slice
S17, which shipped 2026-08-19** — the gate's **ARM A reads 0/0**, both families carry a master
id, and both have a finish-colour resolver delegating to §9.6.a's single authority. Anyone
reading §9.1 literally today will report a closed defect as open.

⚠ **His actual symptom is INTERMITTENCY, and material resolution is deterministic.** The same id
and the same catalogue produce the same hex every frame. *"Often show, often don't"* is a
**variability** claim, and it belongs with the same night's instancing finding — **L-1401: past
the 512-instance cap, window frame parts were drawn by nobody** (measured: the first casualty is
window 52). ⭐ **Do not attribute an intermittent symptom to a deterministic mechanism.**

### §9.10.4 — ⛔ ARM F's declared pair pointed at a DEAD FILE (L-1463)

The gate's ARM F named `packages/core-app-model/src/stores/FurnitureTypes.ts` as Furniture's
runtime record. **It is not.** There are **two** `FurnitureData` + `FurnitureStore`
implementations, and production uses the other one: `initBuilders.ts:98` imports `FurnitureStore`
from `@pryzm/geometry-furniture` and `:758` constructs the live `window.furnitureStore` from it;
`ProjectSerializer.ts:55` imports the same one. Nothing outside `core-app-model/src/stores/`
imports the copy the gate was reading.

⭐ **So ARM F was reporting a TRUE statement about a file nothing renders from — and would have
gone GREEN the moment somebody added a field to the dead copy.** This is §9.7's recurring shape
— *"a gate that checks one spelling of a thing does not check the thing"* — with **spelling
replaced by PATH**, which is strictly worse: a wrong spelling **under-reports**, a wrong path can
be **SATISFIED without touching the product.** Corrected in the same commit that closed the
family, because closing it was impossible until the arm was aimed at the live record.

### §9.10.5 — Slice states, re-measured. ⛔ §9.8's numbers are STALE — read the gate

| slice | §9.8 said | measured 2026-08-20 |
|---|---|---|
| **S15** | ARM D 5 → 3; `furniture` is "ARM F work, not serializer work" | ARM D **1**. `furniture` CLOSED (L-1460) — and it was BOTH, plus three layers §9.8 did not name. Only `plumbing` remains. |
| **S16** | "IN PROGRESS — 17 → 13" | **17 → 10 routed, 7 unrouted** (curtain-wall ×3, linear-structural, dimension, room, slab). |
| **S17** | "OPEN — largest, and C67/C68-bound" | **LARGELY CLOSED 2026-08-19** (MT3/MT4). ARM A **0/0**. |
| **ARM F** | baseline 4 | **3** — `furniture` closed, after the arm was re-aimed (§9.10.4). |

**⛔ Cite the gate, never this table.** It is a snapshot of a ratchet that moved three times in
two days, and §9.8's rotting is the whole reason this row exists.

### §9.10.6 — NAMED and NOT CLOSED, with the reason each is not a guess

⭐ **A stated NOT-YET beats a claimed DONE — §9 exists because someone claimed the opposite.**

| # | what | why it is not closed here |
|---|---|---|
| **S19** | ⛔ **Nothing can AUTHOR a furniture `materialId`.** The panel's "Material" row is read-only and shows the four-value hint; no verb carries an id. | The plumbing now exists end to end, but §6.1/§6.2 work (a panel control, a verb, a chat capability) is C67/C68-bound and is its own slice. ⚠ **Until it lands, L-1460 is reachable only by the loader and by a generator that supplies an id** — stated plainly rather than reported as "furniture materials work". |
| **S20** | The wall default: should `wt-monolithic` name a master row? | ⛔ A **product decision**, identical in kind to the one §9.9 refused to settle by relocation. Repaints every wall if guessed. **Founder's call.** |
| **S21** | Route `layer.materialId` through the resolver in `WallFragmentBuilder` (§2.2). | Measured **safe** (15/15 transcriptions agree, §9.10.2) but the file is concurrent-lane owned; §8.3 outranks convenience. |
| **S22** | ARM C's remaining **7**: curtain-wall ×3, linear-structural, dimension, room, slab. | Untouched by this lane. `slab` is also concurrent-lane owned and was already deferred by §9.8. |
| **S23** | ARM F's remaining **3**: `lighting`, `plumbing`, `stair`. | Each needs a runtime field **and** a writer **and** a reader — three links, not one. `stair` is **STAIR1-owned** this session. |
| **S18** | IFC `IfcRelAssociatesMaterial` (C25). | Unchanged — nothing reaches export. |
| — | ⛔ **A SECOND, DEAD `FurnitureData`/`FurnitureStore` pair** lives in `core-app-model/src/stores/`. | Found via §9.10.4, **not deleted**: proving a store is unreachable is a whole-repo claim, and deleting a barrel-exported type on a night with four live lanes is how a lane breaks three others. **Named, not removed.** |

⚠ **What L-1460 does NOT prove**, so it is never read as coverage (C70 §7.1): that a frame was
encoded; that the GPU-**instancing** arm (`setInstanceBridge`) carries the colour — it is not
exercised; or that an executed `ProjectSerializer.serialize` writes the field (the write half is
proven by **source parity** over the real function body, because hand-building its ~20-store
bundle would be the §FAKE-MORE-CAPABLE-THAN-REAL trap). The reload half **is** executed against
the real command and the real store.

---

## §10 — THE FINISH TAXONOMY: measured census, target, gap, and the sequenced plan (2026-08-21)

> **Stamp**: 2026-08-21 · **Lane**: MAT-R · **Rows**: L-1680 – L-1689.
> **Founder's request, verbatim**: *"I want to be able to apply similar finishes than pascal have in
> walls interiors — they have a lot of nice finishes… also please check the graphics — our WebGPU…
> grab all the finishes — for roof — tiling — walls — parket… get all of them in the material
> library C100 and accessible all via UI / RAC — all of theM!!"*
> **Evidence**: [`PASCAL-FINISHES-RESEARCH.md`](../../04-reference/PASCAL-FINISHES-RESEARCH.md) —
> a measured read of `github.com/pascalorg/editor` at `main` on 2026-08-21. ⛔ **That document's §0
> licence rule binds every slice below.**
> **Adds, corrects nothing.** §10 introduces no rule that contradicts §1–§9. Where it re-states a
> measurement that §9 recorded, it cites the gate rather than §9's number, per §9.10.5.
> ⚠ **This section is about the CATALOGUE'S CONTENT and its REACHABILITY. It is not a rendering
> plan** — §10.4 states plainly which half of the founder's request this contract cannot deliver.

### §10.0 — The answer in three lines

1. ⭐ **We do not have fewer finishes than Pascal. We have 205 rows to their 114** — 80% more.
2. ⛔ **But five finish families are LITERALLY EMPTY** — `shingle`, `parquet`, `carpet`, `external
   render/stucco`, `fibre-cement cladding` — and `parquet` is the founder's *"parket"*, where Pascal
   has eleven.
3. ⛔ **And the majority of the visual gap he is pointing at is NOT the catalogue at all.** It is
   ambient occlusion, which is **off in all four render tiers** by default. §10.4.

### §10.1 — THE MEASURED CENSUS

**Cite the gate, never this table** (§9.10.5). Measured 2026-08-21, commands quoted.

```
grep -a -c "source: 'builtin'" packages/schemas/src/materials/materialCatalog.ts   -> 205
grep -c "^  { source:"          packages/schemas/src/materials/materialCatalog.ts   -> 205
npx tsx -e "...MATERIAL_CATALOG.length, new Set(...id).size"                        -> 205 205
npx tsx tools/ga-gate/check-material-single-source.ts   -> RC=0, "catalogue : 205 rows, 205 unique ids"
```

⚠ **TWO MEASUREMENT TRAPS, both found the hard way, both recorded so the next lane does not repay
them.** These matter more than the number.

1. ⛔ **`materialCatalog.ts` contains exactly ONE NUL byte** (offset 39955) — a *deliberate* sentinel
   in `BY_ID.get(LEGACY_MATERIAL_ID_ALIASES[id] ?? '\0')`. **`grep -o` therefore reports
   `Binary file … matches` and pipes `1` to `wc -l`.** Every count above uses **`grep -a`**. A lane
   that omits `-a` will silently measure **1**. `iconv -f UTF-8 -t UTF-8` confirms the file is
   otherwise valid UTF-8.
2. ⛔ **§0.3's counting token does NOT apply to this file.** `grep -a -c 'params: {' materialCatalog.ts`
   → **0**. `MaterialRecord` is **flat**; `params: {` is the shape of the *THREE projection*, not the
   L0 master. ⭐ **§0.3 is the authority for the METHOD — "key on a token appearing exactly once per
   entry" — and that method's correct token here is `source: 'builtin'`.** The advice was right; the
   literal token had rotted, which is §0.3's own thesis applied to §0.3.

⚠ **The catalogue's own header comment still says 204; the array holds 205** (`steel-grating`, minted
by S14 on 2026-08-19). The header already forbids trusting itself: *"Cite `MATERIAL_CATALOG.length`,
never a number from this comment."*

**Records by category — all 17 declared categories are populated; there is no empty category:**

| category | n | | category | n |
|---|---:|---|---|---:|
| Landscape & Ground | 33 | | Insulation | 8 |
| Metal | 24 | | Gypsum & Plaster | 8 |
| Wood | 17 | | **Paint & Coating** | **7** |
| Stone | 15 | | Specialty Surfaces | 6 |
| Concrete | 15 | | **Roofing** | **6** |
| Masonry | 13 | | Membrane & Waterproofing | 6 |
| Glass | 13 | | Fabric & Soft | 6 |
| Ceramic & Tile | 10 | | | |
| Timber Engineered | 9 | | **TOTAL** | **205** |
| Plastic & Polymer | 9 | | | |

⭐ **Read the distribution, not the total.** **Landscape & Ground (33) is our largest category and
Roofing (6) is near our smallest** — an artefact of the geospatial lanes, not of a decision about
what a building editor needs. **Glass (13) exceeds Roofing (6) plus Paint (7) combined.** The
catalogue is shaped by which lane last touched it.

**The gates, both green, both quoted:**

```
npx tsx tools/ga-gate/check-material-id-required.ts      -> RC=0
[material-id-required] OK: ARM A colour-without-id 0/0 · ARM B unresolvable-ids 0/0 ·
  ARM C unrouted-producers 7/7 · ARM D serializers-dropping-id 1/1 ·
  ARM E ids-never-read-back 0/0 · ARM F runtime-records-without-id 3/3
npx tsx tools/ga-gate/check-material-single-source.ts    -> RC=0  (3 declared rivals, each with a slice)
```

### §10.1.1 — ⭐ §9.5's DRIFT BLOCKER IS DISCHARGED, and that changes the fix order §9.6.c forced

**§9.5 is the section that inverted the plan**: *"Therefore the wiring MUST NOT go first… every
drifted id would correctly become `unresolved:<id>` and render magenta on real projects."*
**Measured today, `ARM B unresolvable-ids 0/0`** — a hard zero against a **zero ceiling**, exactly
what §9.8 S14 claimed when it closed.

**Consequence, stated precisely, because it is easy to over-read:**

- ✅ **§9.6.c step 1 (RECONCILE) is DONE.** The sequencing constraint that blocked wiring is spent.
- ⛔ **That does NOT mean the wiring is done.** `ARM C unrouted-producers 7/7` — seven producers
  (curtain-wall ×3, linear-structural, dimension, room, slab) still mint a key without the master
  resolver, and `ARM F 3/3` (`lighting`, `plumbing`, `stair`) still carry no id on the runtime
  record. **"The blocker is closed" and "the work is finished" are different sentences**, and §9's
  entire history is lanes conflating them.
- ⭐ **So §10's slices are UNBLOCKED on the reconciliation axis and may add rows freely** — a new
  catalogue row cannot re-open ARM B, because ARM B measures *stored ids that resolve to nothing*,
  and adding a row only ever makes more ids resolvable.

### §10.2 — THE TARGET TAXONOMY

Derived from the Pascal read (evidence doc §A) **intersected with what a BIM product must schedule
and export**, which is a requirement Pascal does not carry at all. ⛔ **Taxonomy and parameter set
only — no values, no assets, per the evidence doc's §0 rule.**

**§10.2.a — The two axes we are missing, and they are not "more rows".**

| axis | what it is | today | why it matters |
|---|---|---|---|
| ⭐ **SHEEN × COLOUR as independent axes** | a paint is (hue, sheen), and sheen is `roughness` | ⛔ **FUSED** — 5 paint rows = 5 fixed pairs | a user cannot ask for *"satin white"* or *"matte charcoal"*; **neither exists** |
| ⭐ **PATTERN** | parquet, shingle, mosaic, brick bond are *geometry at texture scale* | ⛔ **inexpressible** — no map, no tiling field | one hex cannot be a herringbone floor. **This is the record-SHAPE ceiling** (§10.3.b) |

**§10.2.b — Categories, with the parameter set each genuinely needs.** ⭐ **The right-hand column is
the point of this table**: it says which families a *parametric* record can serve honestly and which
are lying without a map.

| category | target | today | parametric enough? |
|---|---|---:|---|
| **Paint & Coating** | hue families × sheen levels, combinatorial | 7 | ✅ **YES — colour + roughness is the whole physical truth of paint** |
| **External Render / Stucco** | monocapa, pebbledash, roughcast, smooth render, tadelakt | ⛔ **0** | ✅ mostly — colour + high roughness; texture is a refinement, not a prerequisite |
| **Roofing** | slate, natural + fibre-cement; clay/concrete tile; **shingle**; standing seam (zinc/copper/alu); membrane; thatch; green roof | 6 | ⚠ **base row yes, conviction needs a map** — courses are pattern |
| **Wood — FLOOR products** | **parquet** (herringbone, chevron, basket, versailles), plank/board widths, engineered, end-grain | ⛔ **0 floor-designated** | ⛔ **NO — parquet IS pattern**; a row without a map is a brown rectangle |
| **Ceramic & Tile** | floor vs wall designation, format, **mosaic**, **pool tile**, terracotta, zellige, quarry | 10, none designated | ⚠ mixed — plain tiles yes, mosaic/pattern no |
| **Carpet & Soft Floor** | loop, cut pile, tile, sisal | ⛔ **0** | ✅ mostly — colour + very high roughness reads as carpet |
| **Decking & Outdoor Timber** | softwood, hardwood, composite, grooved | 1 | ✅ base row yes |
| **Cladding** | timber (shiplap/weatherboard/batten/open-joint), **fibre-cement**, metal panel, terracotta rainscreen | ≈1 | ⚠ profile is pattern |
| **Stone / Masonry / Concrete / Metal / Glass** | — | 15/13/15/24/13 | ✅ **already adequate**; glass is our best-covered family |
| **Worktops** | engineered quartz, granite, laminate, solid surface | 4 | ✅ adequate for now |

**§10.2.c — The record-shape target, and what we deliberately do NOT adopt.**

`MaterialRecord` today is **six scalars** (`color, metalness, roughness, opacity, transparent` +
`id/label/category/source`) plus `textureUrl?`, **which zero of the 205 rows use**.

**ADOPT (Pascal has these and we need them):**

| field | why | blocked on |
|---|---|---|
| `sheen` **as an authored dimension** | so paint is (hue × sheen), not 5 frozen pairs — expressed *through* `roughness`, **not a new PBR lobe** | nothing ⭐ |
| `surfaces?: MaterialSurface[]` | where a finish is appropriate — floor/wall/ceiling/roof/furniture/outdoor | nothing, **but see the warning below** |
| `maps?: { albedo, normal, roughness, ao, metalness }` | pattern (§10.2.a) | ⛔ **asset hosting** (§10.6) |
| `tiling?: { repeatX, repeatY, rotation }` | a map without a real-world scale is wallpaper, not a material | ⛔ ships with `maps` |

⛔ **DO NOT ADOPT — Pascal's 20-field `mapProperties` wholesale.** `flipY`, `wrapS/T`, `side: number`,
`normalScaleX/Y`, `lightMapIntensity` are **renderer state**, not material identity. Putting them at
L0 breaches **P5 / C03 §1.2** and would make `MATERIAL_CATALOG` a THREE payload — the exact
authority/projection collapse **§1.3** exists to prevent. **Renderer constants belong in the adapter
(§3).**

⚠ ⭐ **A HARD RULE, learned from Pascal's own defect (evidence §A.9): an applicability facet ships
WITH its filter, in the SAME slice, or it is not authored.** Pascal authored `surfaces` on 65 of 114
records and **their picker discards the prop that would filter by it** — you can paint roof shingles
onto a worktop. That is §AUTHORED-BUT-UNWIRED with a year's authoring cost already sunk. **MUST NOT**:
add `surfaces` to `MaterialRecord` in a slice that does not also make a picker honour it.

⚠ **And a rule we already have that Pascal does not: §5 still governs.** Their resolution ladder
silently falls back to white at three chained levels and has **no unresolved state in the type
system** (evidence §A.8). ⛔ **MUST NOT** cite Pascal to relax §5.

### §10.3 — THE GAP

**§10.3.a — Empty and thin, measured against the live `MATERIAL_CATALOG`.**

⛔ **LITERALLY ZERO**: `shingle` · `parquet` · `carpet` · `external render / stucco` ·
`fibre-cement cladding`.

⭐ **Two of these are commercially damaging, and neither is the one the founder named.**
**External render/stucco = 0** — the most common external finish in the Spanish and Mediterranean
markets our geospatial stack targets has **no record at all**, while we carry 13 masonry and 8 gypsum
rows. **Carpet = 0** despite a whole `Fabric & Soft` category, which turns out to hold *furnishing*
textiles (felt, bouclé, velvet, canvas, awning, acoustic panel) and no flooring.

🟡 **THIN** — roof tile **2** · roof slate **2** (one of which is a `Stone` row) · standing-seam **2** ·
terrazzo **2** · mosaic **1** (⛔ **no pool tile**) · decking **1** · timber cladding ≈**1** ·
ceramic floor tile **4**, *none* floor-vs-wall designated · **hardwood/engineered floor: 0
floor-designated rows** — our 26 wood/timber rows are **species and sheet goods** (`wood-oak`,
`timber-plywood`), not floor products.

⛔ **Roofing is 6 rows for an entire building system.**

**§10.3.b — ⭐ The record SHAPE is the real ceiling, not the row count.**

**ABSENT from `MaterialRecord`, each measured at zero occurrences**: `map` · `normalMap` ·
`roughnessMap` · `aoMap` · `repeat`/`tiling`/`scale` · `anisotropy` · `clearcoat` · `emissive` ·
`transmission` · `ior` · `sheen` · `acoustic{}` · `density` · `thermal` · `ifcClass`.

⛔ **No number of new rows fixes a family that needs a map.** Parquet, shingle and mosaic are
*pattern*. **This is why §10.7's first slice is deliberately the one family that needs no map at
all**, and why the pattern families are sequenced behind a named hosting dependency rather than
promised.

⚠ **`acoustic{}` remains the specific blocker §4.5/§8.2 S9(b) named** — `PhysicsEngine.nrcFromName()`
still derives NRC from prose. **Unchanged by this section, and §10 does not unblock it.**

### §10.4 — ⛔ WHAT THE FOUNDER'S REQUEST DOES NOT DEPEND ON, STATED BEFORE THE PLAN

The founder asked two things in one sentence — *"grab all the finishes"* **and** *"check the graphics
— our WebGPU"*. **They have different owners, and the second is the bigger share of what he sees.**

Measured (evidence doc §B): **on tone mapping (`ACESFilmicToneMapping`), exposure (0.9), colour space
(sRGB), material class (`MeshStandardMaterial`), shadow type (`PCFShadowMap`) and even the
procedural 64×32 gradient IBL, we are already at parity with Pascal** — in the IBL's case having
independently built the same trick. **Anti-aliasing is parity at zero: neither product ships any.**

⛔ **The gap is ambient occlusion, and it is not a scale degradation.**
`SceneQualityTierManager.ts:169-217` — **`ssgi: false` and `traa: false` in ALL FOUR TIERS**,
cinematic included, with a stated reason (§FIX-SSGI-DEFAULT-OFF-TRAA-SELECT-FLASH, founder L-59).
Pascal runs **the same `three/addons/tsl/display/SSGINode.js`** with `enabled: true`, and answered
the same instability by making the effect **cheap** — `giIntensity: 0` (AO only, no GI bounce),
`sliceCount: 1`, `stepCount: 4`, `radius: 1`, then `DenoiseNode` at `radius 4`.

> ⛔ **THEREFORE, AND THIS CONTRACT SAYS IT PLAINLY: a richer material catalogue will not make our
> renders look like Pascal's.** The soft contact shading in both founder screenshots is an AO term we
> switch off at every scale. **That is a C04 / render-lane decision and C100 MUST NOT be cited as
> having addressed it.** Claiming otherwise would be precisely the over-claim §9 exists to correct.

⭐ **What this contract's work DOES deliver, and why it is still worth doing:** an **authorable,
nameable, schedulable, exportable** finish on every surface. **A colour cannot be scheduled (C28) or
classified on export (C25); a named material can.** That is a BIM requirement, independent of frame
quality — and it is the half the founder cannot get from a render lane.

**Referred out, not owned here** (recorded so they are not lost): the missing **scene-referred grade**
(Pascal: `contrast 1.05`, `saturation 1.1` before tone mapping; we have none), and the **achromatic
IBL** — our gradient's stops are near-white (`ZENITH [0.92,0.95,1.00]`) against Pascal's chromatic
cool-zenith/warm-horizon split, so **a horizontal and a vertical surface currently receive the same
colour of light**. ⚠ Ours is a *stated trade*, not an oversight (`NeutralStudioEnvironment.ts:73-75`:
*"a saturated blue zenith would tint every metal in the product blue"*) — **worth re-opening, C04's
call, three numbers.**

### §10.5 — THE THREE REACHABILITY PATHS, MEASURED — how a new row reaches a user

The founder's *"accessible all via UI / RAC — all of theM!!"* is §6's obligation. **Measured today,
the three paths are in very different states, and one of them is far better than anyone assumed.**

**(a) THE 3-D RENDER PATH — partial, and the residue is named.**
`ARM C 7/7` unrouted producers (curtain-wall ×3, linear-structural, dimension, room, slab);
`ARM F 3/3` runtime records without the id (`lighting`, `plumbing`, `stair`); `ARM D 1/1`
(`serializePlumbing`). ⭐ **A NEW CATALOGUE ROW NEEDS NO WORK HERE** — the resolver resolves any id in
`MATERIAL_CATALOG`. The seven/three are *families that cannot carry any id*, new or old. **S22/S23
already own them; §10 does not duplicate them.**

**(b) THE UI PICKER — browse is DONE; assignment is uneven and the unevenness is honest.**
- ✅ **Browse**: `MaterialsBucket.ts` (755 lines) shows all **205** with swatches, **search**, and
  category grouping. ⭐ **We are ahead of Pascal here — their picker has no search box.**
- ⚠ **Assign, per `MATERIAL_ROUTES` (`MaterialDispatch.ts`)**: **8 families commit an id**
  (column, ceiling, floor, roof, curtainwall, wall, slab, furniture) · **2 are colour-only with a
  declared reason** (room, handrail) · ⛔ **5 declared unsupported** (beam, stair, plumbing, lighting,
  structural) — `dispatchSetMaterial` returns `false` rather than lying · **2 route to the SYSTEM
  TYPE instead** (door, window, per C15). ⭐ **A dispatch table that refuses with a reason is §5's
  spirit in the UI, and it should be preserved, not "fixed" into silent success.**
- ⛔ **Layer swatch rows are read-only for identity.** `FloorPropertySection` / `SlabLayerSection` /
  `WallLayerSection` / `CeilingPropertySection` **resolve** `layer.materialId` and display an
  `UNRESOLVED_SWATCH` per §5 — but **offer no catalogue picker**; they write `materialColor` only, and
  new layers are seeded with a hex, not an id. ⭐ **This is where the id/colour split is still being
  re-created, one new layer at a time.**
- ⛔ **`FurniturePropertySection`'s "Material" row is STILL read-only and STILL the four-value hint**
  (`wood|metal|fabric|glass`), verified unchanged at `:151`. §9.10.6 **S19 stands.**

**(c) ⭐ THE RAC PATH — the surprise, and it reorders the plan.**

`packages/ai-host/src/intents/finishRef.ts` **derives from the master** (S5 done: `0` hex literals,
confirmed by the gate) and resolves through **three arms in order**: an exact nickname over **39
alias groups / 89 aliases**, then **`finishRefCandidates()` — a token-subset match against every one
of the 205 master labels** — then a stopword-guarded loose substring.

> ⭐ **THEREFORE A NEW CATALOGUE ROW IS CHAT-NAMEABLE THE MOMENT IT EXISTS, WITH NO EDIT TO THE
> RESOLVER.** The file says so itself. **That is the single most valuable measured fact in §10**, and
> it is what makes §10.7's first slice cheap: the language half is already built, and it is built the
> way **C68 §5.d** requires — *the resolver owns the language, the master owns the values*.

Guards worth preserving: `CONCEALED_CATEGORIES` (`Insulation`, `Membrane & Waterproofing` never
answer a bare word — after *"…to wood"* returned **Insulation · Wood Fibre Board**), `GRAMMAR_STOPWORDS`
(~50 words), and **ambiguity refuses and lists candidates rather than picking**.

⛔ **But the CARRIER is the constraint, and §6.2's ruling is unchanged.** Of **16 `*Material` verbs**
in the generated register: **13 REFUSES with `affectedStores: NONE`**, 3 LIVE — and two of those three
are `rhino.setMaterial`/`resetMaterial` (a reference-model override) while `room.setMaterial` is
**colour-only**. ⛔ **`wall.setMaterial` does not exist.** Of **53 registered chat capabilities**,
**none assigns a master catalogue material to a general element** — chat cannot say *"make this
column corten steel"*.

⭐ **What IS live is the wall finish route**, and it is live on all four links as of today:
`wall.setSideFinishBatch` **LIVE**, capability `set-wall-side-finish` with declared examples
(*"make all inner finishes walls on the ground floor to plaster"*), plus `wall.addLayerBatch` LIVE.

⚠ **CONCURRENT LANE — DO NOT DUPLICATE OR CONTRADICT.** Lane **FIN1** repaired this path **today**:
`5cdee427` *"the finish reached the store and the builder — the REBUILD never ran"* (**L-1670**) —
`WallRebuildCoordinator._flush`'s no-progress signature hashed geometry and `materialId` but **never
`sideFinishes`**, so a finish-only batch was *"no progress"* by construction; a second gate,
`_buildKey`, would have eaten it anyway. Fixed with one shared composer,
`geometry-wall/src/WallPaintSignature.ts`. ⭐ **The third sighting of one founder sentence, and the
first two fixes were real but sat behind gates that never let them run** — §THREE-INVALIDATION-GATES-IN-SERIES.
**Further read-back work is uncommitted in FIN1's tree. §10 MUST NOT touch that path.**

### §10.6 — ⛔ ASSET HOSTING IS A NAMED, UNSOLVED DEPENDENCY — not a hand-wave

Every pattern family in §10.2.b depends on this, so it is stated as a blocker with an owner rather
than assumed.

- ⛔ **There is no `public/textures/`, zero `.ktx2`, zero `.basis`, zero PBR maps in the repo.**
- ⛔ **`public/items` (~185 MB of GLB) is `.dockerignore`d out of the production image by design** —
  *"they belong on object storage (Supabase Storage / CDN)… the catalog GLBs 404 in prod until
  re-hosted. Tracker: OBJECT-STORAGE-GLB."* ⭐ **The furniture 404s the founder already knows about
  and the texture question are THE SAME UNBUILT BUCKET.**
- ⛔ **`SPEC-MATERIALS-REPOSITORY §3.2` is the normative plan** (a shared `MaterialResolver` + lazy
  `TextureLoader`, maps keyed into the MaterialPool) **and it is unbuilt.**
- ⚠ **The one live texture-ingest path is a decoy**: `MaterialsBucket.ts:240` writes a **base64
  data-URL** into `UserMaterialStore`, rendered only as a **CSS `background-image` swatch** — ⛔ **it
  never reaches a THREE material.** A user can "upload a texture" today and see it in the picker and
  never on the model.

⚠ ⭐ **And the consumer side is HALF-BUILT, which is worth knowing before anyone estimates this.**
`matDef.textures.normal` / `.roughness` are **read at seven sites** (`WallFragmentBuilder.ts:4681`,
`SlabFragmentBuilder.ts:1561`, `RoofFragmentBuilder.ts:179`, `CurtainWallBuilder.ts:2172,2219`,
`CurtainWallInstanceManager.ts:228`, `initUI.ts:2392`) — and **`.textures` is written by nothing**:
`materialLibrary.ts`'s `project()` returns `{ id, label, category, params }` with no `textures` key.
**All seven reads resolve `undefined` on every element, every frame.** §COMMITTED-IS-NOT-REACHABLE,
in the shape that flatters an estimate: the readers exist, so the work *looks* nearly done, and the
producer, the loader, the cache and the bucket are all absent.

**MUST**: any slice proposing texture maps names the bucket, the format (Pascal's answer is **KTX2 at
512²** — 249 maps, GPU-compressed, transcoded through a loader), and the licence of every map, per
the evidence doc's §0. **MUST NOT**: a slice ship `maps` on `MaterialRecord` while nothing can load
them — that mints a field whose only possible value is "broken".

### §10.7 — THE SLICES

⛔ **Sequenced against §9.6.c as amended by §10.1.1** (reconciliation discharged; wiring residue owned
by S22/S23) and against §10.6's hosting dependency. **Each names what it builds, what proves it, and
what it deliberately does not do.** ⭐ **A first slice that ships REAL improvement with zero asset
hosting is worth more than a complete taxonomy that cannot load.**

---

**⭐ S24 — THE COMBINATORIAL PAINT MODEL + THE THREE EMPTY PARAMETRIC FAMILIES. FIRST, and it needs
NO assets, NO new command, NO new capability row, and NO record-shape change.**

- **Builds**: `Paint & Coating` re-authored as **hue × sheen**, our own values — a designed
  architectural palette (neutrals plus hue families, the *structure* Pascal validates: ~9 neutrals +
  8 families × 3–5 steps) crossed with sheen expressed **through `roughness`** (matte / eggshell /
  satin / gloss), which the record **already carries**. Plus the three empty families a parametric
  record serves honestly: **external render/stucco**, **carpet**, and base **decking**.
- ⭐ **Why it is first, and it is not arbitrary**: it is the **only** slice that reaches all three
  §10.5 paths on day one with no new machinery. **(a)** the resolver resolves any id in the
  catalogue; **(b)** `MaterialsBucket` reads `MATERIAL_CATALOG` and is already searchable;
  **(c)** ⭐ **`finishRefCandidates()` makes every new label chat-nameable with zero resolver edits**,
  through the `wall.setSideFinishBatch` carrier **that FIN1 repaired today**. *"Make all interior
  walls sage green"* becomes a sentence that works, because the sentence machinery already works and
  only the noun was missing.
- **Proves**: `MATERIAL_CATALOG.length` rises with **0 duplicate ids**;
  `check-material-single-source.ts` **stays RC=0** (no rival vocabulary, no literal in the
  projection); `check-material-id-required.ts` **ARM B stays 0/0**; and — the only proof that matters —
  ⭐ **an executed test driving a real chat utterance naming a NEW row through the real resolver into
  `wall.setSideFinishBatch`, asserting the sideFinish on the WallStore record read back**, never a
  `success: true` and never `finishRef` in isolation (§9.3's retraction is the precedent).
- ⛔ **Deliberately does NOT**: add `maps`, `tiling` or `surfaces`; touch any producer, serializer or
  bridge; touch `WallFragmentBuilder` or anything in FIN1's tree; change `MaterialRecord`; or claim
  the render looks better (§10.4).
- ⚠ **Honest limit, stated up front**: this reaches **walls** via the one live carrier. Other
  families' `setMaterial` verbs still REFUSE (§10.5c). **A row that exists is not a row every family
  can be given.**

---

**S25 — `surfaces` APPLICABILITY + ITS FILTER, IN ONE SLICE.**

- **Builds**: `surfaces?: MaterialSurface[]` on `MaterialRecord` (`floor|wall|ceiling|roof|furniture|outdoor`)
  **and** the `MaterialsBucket` / property-inspector filter that honours it, **in the same commit**.
- **Proves**: a gate arm asserting **every record carrying `surfaces` is filtered by at least one
  live surface** — i.e. the facet has a consumer. ⭐ **This arm exists specifically because Pascal
  authored the facet on 65 records and wired nothing** (evidence §A.9).
- ⛔ **Does NOT**: enforce applicability as a *refusal* — filtering a picker is a convenience;
  refusing an authored assignment is a product decision nobody has taken.

---

**S26 — THE LAYER-SECTION PICKERS (closes the last id/colour re-creation site).**

- **Builds**: a catalogue picker in `FloorPropertySection` / `SlabLayerSection` / `WallLayerSection` /
  `CeilingPropertySection`, and **new layers seeded with a `materialId`, not a hex**.
- **Proves**: a new layer created through the real UI path carries an id that resolves.
- ⛔ **Does NOT**: migrate existing layers (that is data, and §9.10.2's 15/15 measurement shows the
  transcriptions currently agree — a migration would be churn with a repaint risk).
- ⚠ **Concurrent-lane**: `WallLayerSection` sits beside FIN1's territory. **§8.3 outranks convenience.**

---

**S27 — A REAL MATERIAL BATCH CARRIER, then the `material` value source and the family table.**

- ⭐ **This is §8.2 S10, unchanged, and it remains the largest piece and the true answer to "via
  RAC — all of theM".** §10 does not re-decide it; it re-states why it is still deferred and now
  quantifies it: **13 of 16 `*Material` verbs REFUSE with `affectedStores: NONE`**, and none of the
  53 capabilities assigns a catalogue material to a general element.
- **Builds**: one real batch carrier reaching a RENDER/PERSIST store; then `material` in
  `KNOWN_VALUE_SOURCES` resolving **through `finishRef.ts`** (⛔ never a second matcher — C68 §7.c);
  then a `MaterialFamilies` table row per C67 §1.3's generator pattern, with declared examples,
  `commandProof`, an acceptance family and an adversarial pin.
- **Proves**: **C16 §5.1 CA-21** — an **executed read-back** from the authoritative store, plus gate
  31 check **4b** executing every declared example.
- ⛔ **Does NOT ship on a DTO store** (§6.2, C68 §5.a: *"presumed DEAD until proven otherwise —
  right 13/13 times"*). ⚠ Enables *"apply oak parquet to the floor in room 00-001"* and *"make the
  roof dark slate tile"* **as sentences**; whether they *look* right is S28's and §10.4's business.

---

**S28 — ⛔ TEXTURE MAPS. BLOCKED, with the blocker named, not estimated.**

- **Blocked on §10.6**: the object-storage bucket (the same one that closes **OBJECT-STORAGE-GLB**),
  `SPEC-MATERIALS-REPOSITORY §3.2`'s unbuilt `MaterialResolver` + lazy loader, a cache keyed on the
  MaterialKey **including map URLs**, and ⛔ **a named licence for every map we ship**.
- **Only then**: `maps` + `tiling` on `MaterialRecord`, and the pattern families — **parquet**,
  **shingle**, **mosaic/pool tile**, floor-designated tile and wood, cladding profiles.
- ⭐ **The one cheap thing available before the bucket**: `project()` already has seven waiting
  consumers (§10.6) and writes no `textures` key. **Wiring the producer for a SINGLE hard-coded
  bundled map would prove the whole chain end-to-end at near-zero cost** — and would convert
  §10.6's "half-built" from a claim into a measurement. **Recommended as the de-risking probe, not
  as the feature.**
- ⛔ **Does NOT**: copy any file from `pascalorg/editor` (evidence §0.2).

---

**S29 — REFERRED OUT, NOT OWNED: the render-quality half of the founder's sentence.**

⭐ **Recorded here so it is not lost between contracts**, and explicitly **not** a C100 slice:
**AO on by default at a cheap configuration** (§10.4 — Pascal's `giIntensity: 0` / `sliceCount 1` /
`stepCount 4` + denoise is an existence proof against our L-59 flicker finding), the **missing
scene-referred grade**, the **achromatic IBL stops**, and **L-1513** (TRAA composites nothing).
**C04's territory and a render lane's work.** ⛔ **C100 MUST NOT be cited as covering any of it.**

### §10.8 — What §10 does NOT decide

Stated so it is never read as coverage (C70 §7.1).

- ⛔ It does **not** decide whether an unmaterialled wall should render light grey — **§9.9 and
  §9.10.6 S20 left that open as the founder's call, and §10 does not take it.**
- ⛔ It does **not** unblock the **acoustic facet** (§4.5, S9(b)); `nrcFromName()` still reads prose.
- ⛔ It does **not** prove any row reaches a **pixel**. Every §10.5 claim is a code and gate reading.
- ⛔ It does **not** touch the three declared rivals on the §7 ARM C ledger, nor S22/S23's residue.
- ⚠ It does **not** establish that adding rows improves what the founder sees — **§10.4 argues the
  opposite for the largest share**, and that honesty is the section's main contribution.

---

## §10.9 — ⭐ S28 IS BUILT, THE SHAPE IS AMENDED, AND ONE OF ITS TWO BLOCKERS TURNED OUT TO BE A DIFFERENT BLOCKER (2026-08-21)

> **Stamp**: 2026-08-21 · **Lanes**: MAT-1 (record + resolver + wiring), MAT-2 (assets), MAT-3
> (procedural) · **Rows**: L-1700 – L-1704, L-1720 – L-1724, L-1800.
> **Commits**: `54071cd6` (L0 record), `b58500d7` (resolver + wiring + 16 rows), `e535246d`
> (asset pipeline), `7af920ab` (procedural generators).
> **Adds and AMENDS.** §10.2.c's `tiling` shape and §10.6's blocker statement are both corrected
> below, in place, with the measurement that corrected them.

### §10.9.a — The `tiling` shape is AMENDED: real-world METRES, not a repeat count

§10.2.c proposed `tiling?: { repeatX, repeatY, rotation }`. **The shipped field is**

```ts
tiling?: { realWorldSizeM: readonly [number, number]; rotationDeg?: number }
```

⭐ **A repeat count is meaningless without the surface's size.** `repeatX: 4` is a 750 mm tile on a
3 m wall and a 3 m tile on a 12 m wall: **the same material rendering as two different products**,
which is **§2.3's defect re-created inside one material**. A real-world size is intrinsic to the
PRODUCT; the repeat is DERIVED per surface by the adapter, which is exactly §3's division of labour.

⚠ **It is also what makes the texture SHAREABLE, and that is not a separate benefit — it is the same
fact.** In THREE, `repeat` lives on the TEXTURE, not the material. A surface-derived repeat would
need one texture object per distinct surface size; `1 / realWorldSizeM` is a pure function of the
material, so a hundred parquet floors share one texture and one GPU upload
(§WEBGPU-HEAVY-SCENE-CRASH: per-element materials already defeated instancing here).

⛔ **No `sheen` field was added.** §10.2.c is right that sheen is `roughness`, and `roughness` was
already on the record. ⛔ **No `surfaces` field either** — §10.2.c's hard rule (an applicability
facet ships WITH its filter or it is not authored) still binds, and no picker filters by it yet.
**S25 is unchanged and still open.**

### §10.9.b — ⭐ §10.6's BLOCKER IS DISCHARGED, AND IT WAS NOT THE BLOCKER IT NAMED

§10.6 named the blocker as **the object-storage bucket**. Measured across the three lanes:

- ⛔ **The bucket was never the blocker.** R2 `pryzm-assets` is live, `catalogAssetUrl` rewrites
  logical paths, and `.webp` was already on the proxy's `CATALOG_ALLOWED_EXT`. MAT-2 published
  **16 CC0 materials (216.8 MB → 47.0 MB)** with **no client change at all**.
- ⛔ **The real blocker was the DECODER, and it is still there.** §10.6 and this lane's own brief
  both reasoned from `.ktx2` being on the delivery allowlist. **Delivery and decode are different
  facts**: there are **zero `KTX2Loader` references in `src`**, no Basis transcoder in `public/`,
  and `persistence-client/src/codec/ktx2.ts` is a pass-through stub. We can serve a `.ktx2` and
  cannot decode one. **WebP ships. KTX2 is UNBUILT and its blocker is named: the decoder.**
- ⛔ **And one path silently 404s.** `resolveCatalogAssetUrl` rewrites **only** `/items/…`;
  anything else is returned UNCHANGED, which in production never reaches the CDN. The L0 doc
  example shipped as `/textures/…` — it would have 404'd, invisibly, on every material. The
  resolver now REFUSES a non-`/items/` path with a named reason **before any request**.

⭐ **The lesson, because this shape has now cost two lanes:** *an allowlist is a claim about
DELIVERY. It says nothing about DECODE, and nothing about whether the URL you will actually send
is the one it allows.* Both halves must be measured separately, by running the seam.

### §10.9.c — ⭐ THE ANSWER HAS TWO HALVES, AND ONE OF THEM CANNOT 404

`MATERIAL_CATALOG` is **245 rows**, of which **40 carry maps** (cite the gate, never this number):

| half | n | source | can it fail? |
|---|---:|---|---|
| **file-backed** | 16 | ambientCG CC0, R2-hosted, WebP | 404 · CORS · decoder |
| ⭐ **procedural** | 24 | `@pryzm/procedural-textures`, generated | **none of those — it is arithmetic** |

The procedural half — herringbone, chevron, Hungarian point, Versailles, basket weave, metro,
hexagon, mosaic, plank floors — **has no file, no bucket, no CORS and no decoder**. It is the half
of the founder's *"wooden parquet materials, proper tiling floors"* that is reachable regardless of
hosting. Its map values are **generator ids**, not paths: `MaterialResolver` forks on
`isProceduralId` ahead of everything file-shaped.

**Four of §10.3.a's five EMPTY families are closed**: parquet, carpet, external render/stucco,
shingle. ⛔ **`fibre-cement cladding` remains at ZERO.**

### §10.9.d — ⛔ THE FIELD §10.6 CALLED "HALF-BUILT" WAS DELETED, NOT POPULATED

§10.6 recorded `matDef.textures` as read at seven sites and written by nothing, *"in the shape that
flatters an estimate"*. **The obvious repair — populate it — is WRONG, and a watched RED proved it.**

A `THREE.Texture` carries its `repeat`. A pre-resolved texture set is therefore only correct against
a **known uv space**, and a material definition has no surface. Three of the seven readers
re-material geometry with **no `uv` attribute at all**, where an attached map paints **texel (0,0)
over the whole element** — neither the pattern nor the base colour.

**So `StandardMaterialDef.textures` is DELETED** and replaced by `applyMaterialMaps(params, def,
uvSpace)`: the caller must state what its own UVs mean, and a caller that cannot gets nothing plus a
named reason. All eight readers converted. ⭐ **A field whose correct value depends on information
it does not carry is not half-built; it is mis-shaped.**

### §10.9.e — THE UV VERDICT, which is as much a REFUSAL as a fix

| surface | uv today | maps? |
|---|---|---|
| ⭐ **slab / floor** | **METRES** (added by L-1703; it had NONE) | **YES** |
| wall | 4 of 6 body arms emit no `uv`; the seam merge **DELETES** it | ⛔ **NO — named gap** |
| roof | none | ⛔ **NO** |
| curtain wall | 0..1 per panel, size not in scope at material time | ⛔ **NO** |

⛔ **Walls are refused deliberately.** The wall material is built ONCE, before the body arm is
chosen, so it cannot know which arm ran. Maps there would tile a wall WITH an opening differently
from an otherwise identical wall WITHOUT one — **§2.3's defect, caused by nothing in the model**.
**A visibly wrong pattern is worse than an honest flat colour.**

⭐ **The uv space is a DECLARED STAMP** (`geometry.userData`), never a heuristic: floats cannot say
whether they are metres or 0..1, and guessing from the bounding box is right until a 1 m slab makes
the two indistinguishable. **Undeclared ⇒ refuse.** That default is what makes this migratable one
builder at a time: every un-migrated surface keeps its honest flat colour and lights up the day its
builder stamps, with no edit to any consumer.

**Closing the wall gap = giving every wall body arm metre UVs.** That is a geometry slice, it is
**S30**, and it is the single highest-value piece of remaining work in this section.

### §10.9.f — The gate

**`tools/ga-gate/check-material-maps-tiling.ts`** — BUILT, five arms, all hard-0, each watched-RED
and observed to fire:

- **ARM A** — maps imply a usable `tiling`. Calls L0's `materialMapsDefect()`, the **same predicate
  the resolver uses**, so gate and runtime cannot disagree about "well-formed".
- **ARM B** — every file-backed path starts with `/items/` and is not an absolute or `data:` URL.
- **ARM C** — every file-backed path is in a format a **registered loader can decode**. Reads the
  extension list out of `MaterialResolver.ts`'s source rather than keeping a rival copy.
- **ARM D** — the file-backed rows agree with `textures.manifest.json`, compared as **SETS in both
  directions**, never as a count or a byte-diff.
- ⭐ **ARM E** — every `procedural:` source names a **LIVE generator**, and its tiling agrees with
  the generator's own computed size; **and every generator has a row**. This is the arm that makes
  the reserved scheme safe: a scheme with no generator is authored-but-unwired, and a generator with
  no row is arithmetic nobody can reach.

**NOT CHECKED, and never an inherited green** (C70 §7.1): that any map FILE exists in the bucket;
that **CORS** permits the fetch (**L-578** — no Node check enforces it); that a declared real-world
size matches the image; that any surface other than a slab carries metre UVs.

### §10.9.g — What is proven AT THE MESH, and what is not

⭐ **PROVEN AT THE MESH** (`packages/geometry-slab/__tests__/SlabRendersTexturedMaterialAtRealWorldScale.test.ts`,
22 tests): a real record — file-backed **and** procedural — driven through the real projection into
the real `SlabFragmentBuilder`, asserting the `THREE.Material` on a mesh **in the scene** carries the
texture, at `1 / realWorldSizeM`, with the right colour space, shared across slabs, on geometry whose
uv is in metres. Three watched REDs, **run and recorded**: the pre-lane code (no maps attached)
fails 9 of them, including the founder claim.

⛔ **NOT PROVEN**: that a pixel is correct on a GPU (no visual test exists); that the R2 objects
resolve from a browser (CORS, L-578); that the 16 authored base colours match their maps' averages —
they are **authored and say so**, because the WebPs are on R2 and cannot be measured in-repo.

### §10.9.h — Slice states

- ⭐ **S28 — BUILT**, and its blocker re-named (§10.9.b). `maps` + `tiling` on the record, the
  `MaterialResolver` SPEC-MATERIALS-REPOSITORY §3.2 has specified since 2026-05-22, the render path
  wired for slabs/floors, and 40 pattern rows.
- **S24 — UNCHANGED and still open.** The combinatorial paint model needs no assets and was not
  this lane's work.
- **S25 (`surfaces` + its filter) — UNCHANGED and still open**, deliberately (§10.9.a).
- **S26, S27 — UNCHANGED.**
- ⭐ **S30 — NEW: metre UVs for every wall body arm.** §10.9.e. Until it lands, "wall finishes" means
  colour, not pattern, and the code says so at the refusal site.
- **S31 — NEW: the KTX2 decoder.** A `KTX2Loader` re-export in `packages/renderer-three/src/addons/`
  plus a Basis transcoder served from `public/`. MAT-2's pipeline already emits KTX2 on a flag.
  Until then WebP ships and `.ktx2` produces a NAMED refusal.
- **S32 — NEW: `aoMap` needs a second uv set.** `ao` and `displacement` are authored on the records
  (the products have them) and are neither bound nor FETCHED: `aoMap` samples THREE's `uv1`, which
  **no geometry in this repository emits**, and `displacementMap` needs tessellation.

---

## §10.10 — ⭐ THE RANGE, THE SHEEN THAT WAS NOT RENDERING, AND THE NAME THAT MAY NOT LIE (2026-08-21)

> **Stamp**: 2026-08-21 · **Lane**: MAT2 · **Issues**: L-1900..L-1905.
> **Founder request, verbatim**: *"It works but I need way more: I need **20 microcement colours** —
> from red, blue, green, dark grey… many greys, all possible colours like: 'make all walls on level 2
> interior finish **ambar** microcement' / 'make all walls on level 2 interior finish **Blue pastel
> paint**' (also **30 different colour paints**). I want also **30+ types of tiles for kitchen and
> toilets** — with different sizes, colours, shine finishes, etc…"*
> ⚠ **This section CORRECTS §10.2.b and completes the first of §10.2.a's two axes.**

### §10.10.a — What landed

| family | before | added | after | id prefix |
|---|---:|---:|---:|---|
| Microcement | **1** | **20** | 21 | `coating-microcement-*` |
| Paint | 4 | **30** | 34 | `paint-*` |
| Ceramic tile (colour × sheen) | 26 | **34** | 60 | `tile-{gloss,satin,matt}-*` |
| **`MATERIAL_CATALOG` total** | **245** | **84** | **329** | — |

⚠ **Cite `MATERIAL_CATALOG.length`, never this table** (§0.3's rule). The table records the MOVE and
the reason; the array records the count.

⭐ **§10.2.a's first axis — SHEEN × COLOUR — is now UNFUSED for paint and tile.** The tiles ship as
three declared sheen bands (**gloss 0.06 · satin 0.35 · matt 0.80**) across the colour range, which is
what makes *"navy gloss"* and *"anthracite matt"* nameable at all. §10.2.a's second axis, **PATTERN**,
is untouched here and stays blocked on **S30** (§10.10.f).

### §10.10.b — ⛔ §10.2.b's PAINT VERDICT WAS TRUE ABOUT PHYSICS AND FALSE ABOUT THE RENDERER

§10.2.b rates **Paint & Coating** *"✅ **YES** — colour + roughness is the whole physical truth of
paint"*, blocked on *"nothing ⭐"*. The physics half is right. **The renderer half was never checked,
and it was false for walls.** Measured at `9d3b16b3`, both arms of the wall finish path:

```
instanced arm   new THREE.MeshStandardMaterial({ color })            -> roughness 1.0 (THREE default)
layered band    new THREE.MeshStandardMaterial({ color: matColor,
                                                 roughness: 0.85, ... })  -> HARD-CODED, every material
```

Neither arm *could* have carried sheen: `resolveWholeBodyFinishColor` **returns a `string`**, so a
material's `roughness`/`metalness` had nowhere to travel. `WallSideFinish` has carried `materialId`
all along — **the value was present at the store and discarded one call before the pixel**, which is
**§9.1's shape inside the one family §9.1 records as WORKING**. ⭐ *"The family resolves"* and *"the
family renders every property it resolves"* are different claims, and §9.1 flattened them.

**Fixed by L-1905** (`WallSideFinishResolver.resolveWholeBodyFinishShine` /
`resolveLayerRenderFinishShine`, consumed by both arms). Two properties are worth recording, because
each was a way to get it wrong:

- ⭐ **Colour and sheen are read off the SAME ROW.** The colour rule picks a *side* (exterior wins,
  then interior) by testing `materialColor`. Had sheen repeated that test independently, a wall could
  render **one material's colour with another material's sheen** — a defect with no name and no
  reproduction. `pickWholeBodyFinish` answers *"which finish paints this surface?"* **once** and both
  legs consume it (**C84 EI-8**).
- ⛔ **The instance cache key had to grow with it.** `_instanceMaterialCache` was **colour-keyed**, so
  `Ceramic Tile · Navy Gloss` and `Paint · Deep Navy` — near the same hue, opposite sheens — would
  have **collided**, and the second wall would silently have rendered the first's material. *A cache
  key narrower than the values it caches is not a cache; it is a silent overwrite.* Verified before
  widening it that `renderer-three`'s `materialInstanceSignature` folds `roughness` and `metalness`
  into `SCALAR_KEYS`, so `dedupInstanceMaterial` does not re-merge them one layer further down.

**MUST**: any future family that wires a `materialId` to the screen states **which properties travel**
and which are dropped. *"Material renders"* is not a verdict; it is a list.

### §10.10.c — ⛔ THE NAMING RULE: a name may not describe what the renderer cannot draw

> **A material's LABEL is a claim. It may carry a property only where some surface in this product can
> display that property. A size, a bond or a grout joint in a name that paints a flat rectangle is a
> lie in the catalogue, and it is indistinguishable from a working feature until a founder looks at a
> wall.**

Applied to this lane's 84 rows, and each exclusion is measured, not stylistic:

| excluded from the name | the measurement that forces it |
|---|---|
| **size** (`600 × 600`, `200 × 100`) | `WallFragmentBuilder.ts` calls `applyMaterialMaps(params, matDef, uvSpaceOfGeometry(null))` — **literally `null`** → `UV_NONE` → `resolveMaterialTextures` returns `state: 'no-uvs'` and writes **no slot** |
| **bond / grout / herringbone / mosaic** | the same mechanism — a pattern is a MAP |
| **RAL / NCS code** | a RAL code is a **PROCUREMENT** claim; we cannot verify a hex against a physical standard, and a wrong RAL number is an **ordering error**, not a rendering error |

⚠ **This does NOT retro-condemn the 13 rows §10.9 shipped** whose labels *do* carry a size
(`Tile · Porcelain 600 × 600, stack bond, 3 mm grout`). Those are **map-bearing** and render that size
correctly on a **slab**, whose builder passes `UV_METRES`. ⭐ **The lie is surface-relative, and that
is precisely why it is dangerous**: the same row is honest on a floor and mute on a wall. What
§10.10.c forbids is a name whose claim **no** surface can honour.

⛔ **And no row in this lane carries `maps`.** A map here would be authored, shipped, fetched and then
refused by the adapter — cost with no pixel. **MUST**: these rows gain maps in the **same commit** as
S30, never before.

⛔ **Runtime procedural generation was NOT switched on to close this.** It stays off
(`globalThis.__pryzmProceduralTexturesV1`) because §PROCEDURAL-COST (L-1820) measured **150–830 ms of
blocked main thread per pattern** and it froze the founder's demo. Build-time generation is the sound
route and is **S33** (§10.10.f), not a flag flip.

⭐ **THREE INDEPENDENT MECHANISMS SIT BETWEEN A CATALOGUE ROW AND A DRAWN PATTERN ON A WALL, and
each alone is sufficient.** Recorded together because fixing any ONE of them changes nothing, which
is the §THREE-INVALIDATION-GATES-IN-SERIES shape and the reason a single "turn on textures" task
would have failed and looked inexplicable:

| # | mechanism | measured |
|---|---|---|
| 1 | **The wall body declares no uv space** | `uvSpaceOfGeometry(null)` → `UV_NONE` → `state: 'no-uvs'`, no slot written. **S30.** |
| 2 | **The 24 `procedural:` rows do not GENERATE** | the flag is off by deliberate rollback; they *cannot 404*, and they also *do not draw*. **S33.** |
| 3 | **The 17 `/items/textures/…` rows have no bytes on this server** | `public/items/` exists, **`public/items/textures/` does not**; `server.js` mounts an explicit 404 for any unmatched `/items/*`. `tools/texture-pipeline/textures.manifest.json` describes exactly those files — **the pipeline has never been run into `public/`.** |

⚠ **Mechanism 3 is scoped to what was measured: this repository's `public/`.** Whether the
configured object-storage base serves them in production is a **separate question and was NOT
measured here** — `resolveCatalogAssetUrl` exists precisely so the two can differ (§10.9.b). ⛔ It is
therefore **not** evidence that the R2 route is broken; it is evidence that *the local one is not a
route at all*, and that a developer who sees a flat wall has three candidate causes, not one.

### §10.10.d — WHAT IS PROVEN, AND WHAT IS STILL NOT

✅ **PROVEN, by tests that drive the real code:**

- Both founder sentences resolve **end-to-end through the real zero-token ladder** to the **row id** —
  *"…finish ambar microcement"* → `coating-microcement-amber`, *"…finish Blue pastel paint"* →
  `paint-pastel-blue`. Asserted as **ids**, never as "not null": a "not null" assertion would have
  passed while amber quietly answered with warm grey.
- **Every one of the 329 rows is uniquely nameable by its own label** — an invariant over the whole
  master, not over this lane's rows.
- A gloss tile and a matt paint of near-identical hue now resolve to **different material state**, at
  the master's own values.
- A map-bearing row attaches **nothing** on a wall and **is not refused** at `UV_METRES`, so the gap is
  the **wall's geometry**, not the material.

⛔ **NOT PROVEN, and not claimed:**

- **No pixel was measured.** There is no visual test; the assertions stop at the constructed material
  and at the resolver. §9.6.c's *"real DTO through the real producer into the real bridge"* is met for
  the resolver legs and **not** for a rendered frame.
- **Nothing is proven about a wall PATTERN**, and nothing here moves S30.
- **Colour fidelity is AUTHORED.** The 84 hexes are architectural pigment approximations chosen by
  eye. They are **not** measured against any physical standard — which is exactly why §10.10.c forbids
  a RAL number: the row is honest about being an approximation only so long as it does not cite a code.
- **Persistence round-trip of these ids is untested here** (§7.1's fourth unproven axis, unchanged).

### §10.10.e — REACHABILITY WAS DERIVED, NOT AUTHORED — and that is the finding

⭐ **Not one of the 84 rows needed an alias to become chat-nameable.** `finishRef.finishRefCandidates`
matches the **master's own labels by token subset** (L-1262), so a new row is reachable from chat with
**no edit in `ai-host` at all**. This lane is the first test of that property at scale and it held:
**0** existing rows lost their own label, **0** new rows were un-nameable.

⚠ **It was not free, and the cost was paid up-front rather than discovered.** An exhaustive
**1-and-2-token sweep** over every existing label (**1 536** phrases) was run through the real matcher
**before** the rows were committed. It found **four** collisions, renamed rather than shipped:
`Black Gloss` → `Obsidian Gloss`, `Cement Grey Matt` → `Cement Matt`, `Warm Grey Matt` → `Stone Matt`,
`Plaster Pink Matt` → `Almond Matt`.

**MUST**: a future range runs that sweep before committing. **Two rows whose labels tokenise
identically make BOTH unreachable, not one** — the failure is silent and it is not local to the new
row. The invariant is now a permanent test (`L1900MaterialRangeReachableFromChat.test.ts`).

⭐ **The sweep also found something better than a collision: eleven phrases that resolved UNIQUELY and
WRONGLY.** `"pink"` resolved to **`Plasterboard · Fire Rated Pink`**, `"yellow"` to
**`Brick · London Stock Yellow`**, `"navy"` to **`Fabric · Velvet Navy`**. Those are
§L960-WOOD-IS-A-SURFACE — a *buried or unrelated* product answering a colour word because nothing else
could. They are now **named questions listing real paints**, which is C68's ruling (*an ambiguity is a
question, never a pick*) and a strict improvement, **not** a reachability loss.

### §10.10.f — SLICE STATES

- ⭐ **S24 — DISCHARGED BY ENUMERATION, and the deviation is deliberate.** S24 asked for a
  *combinatorial* paint model (hue × sheen, generated). It shipped as **84 explicit rows** instead.
  **Reason**: a generated id is an id with no row, and **§1.1** requires ONE enumerable vocabulary in
  ONE home — the chat matcher, the picker and the exhaustive-uniqueness invariant all key on the
  **labels of real rows**. A generator would have minted a second, implicit vocabulary alongside the
  master, which is the defect this contract exists to prevent. **MUST NOT** re-open S24 as a generator
  without answering that.
- ⭐ **L-1905 — BUILT.** The finish's `roughness`/`metalness` reach both wall arms (§10.10.b).
- **S30 — UNCHANGED, and now load-bearing for the founder's word "sizes".** Metre UVs for every wall
  body arm. Measured cause, unchanged: the wall body has **six** geometry constructors, **four** emit
  no `uv` attribute (`MiterPrismBuilder`, the LAYERED grid punch, the curved builder, the CSG
  single-volume bridge) and one **DELETES** `uv` during the seam merge; only the hole-extrude arm
  carries metre UVs. ⛔ **It is a geometry slice, not a materials slice**, and this lane declined it on
  that measurement rather than attempting it inside a catalogue change.
- **S33 — NEW: BUILD-TIME procedural texture generation.** ⚠ **This S33 KEEPS the number** — §10.15.f
  later minted a second, different "S33" for roof metre UVs, which is renumbered **S34** because this
  one was minted first (§10.16.f, L-10027). ⭐ **And as of 2026-08-23 this slice is the LOAD-BEARING
  one for the founder's roof sentence**: S34 gave roofs metre UVs, and 7 of the 10 roof-declared rows
  still cannot draw because this bake does not exist (§10.16.e).
  The 24 `procedural:` patterns exist and
  cannot 404, but runtime generation is **off** at ~308 ms of blocked main thread per material. Baking
  them at build time is the route to real tile patterns. ⛔ **MUST NOT** be closed by re-enabling the
  runtime flag.
- **S25, S26, S27, S31, S32 — UNCHANGED.**


---

## §10.11 — ⭐ THE CARBON FACET: a number that cannot be written without its source (2026-08-21, lane DIM46)

> **Slice:** 6D embodied carbon. **ADR:** [ADR-0351](../adrs/ADR-0351-4d-time-and-6d-carbon-are-built-and-neither-invents-a-number.md).
> **Issue-log:** L-3100 … L-3105. **Commits:** `33dfda79`, `4e0ff9a8`.
> **Files:** `packages/schemas/src/materials/materialCarbon.ts` (the vocabulary),
> `carbonFactorTable.ts` (the 20 rows), `materialRecord.ts` (+`carbon?`), `materialCatalog.ts` (the merge).

### §10.11.a — The field, and why it is ON the record

`MaterialRecord` gains **`carbon?: MaterialCarbonFacts`** — `{ density?: DensityFact; carbonA1A3?: CarbonFactorFact }`.
**OPTIONAL and ADDITIVE**, exactly as `maps`/`tiling` were (§10.9), so every one of the existing rows
stays valid unchanged and the facet landed without rewriting the catalogue.

**MUST**: the facet lives on the **record**, per §1.1. The VALUES are authored in a sibling file for
legibility — a full citation does not fit on a catalogue line — and are **merged onto the rows in
`MATERIAL_CATALOG`'s own `.map()` at module load**. A consumer reads `findMaterialRecord(id).carbon`
and never learns that `carbonFactorTable.ts` exists.

⛔ **MUST NOT**: keep a permanent `Record<materialId, factor>` beside the catalogue as the read
surface. That is a **material-keyed table that is not the master**, i.e. the seventh vocabulary
§0.2 counted six of — and unlike a colour copy it would rot silently, because a renamed material
simply stops having carbon and nothing renders differently.

⛔ **MUST NOT**: a factor keyed to an id that is not in `MATERIAL_CATALOG`. It applies to nothing,
forever, and **nothing on the 6D surface ever looks wrong**. `carbonFactorOrphans()` names them and
`packages/schemas/__tests__/materialCarbon.test.ts` asserts the set is empty.

### §10.11.b — ⭐ `verification` is a SEPARATE FACT from `source`, and this is the ruling worth carrying

**MUST**: every numeric fact carries `source`, `dataset`, `year`, `geography`, `provenance` **and**
`verification`. There is no way to construct a `DensityFact` or a `CarbonFactorFact` without one —
the type system does the work a review rule would otherwise have to do weekly.

**MUST**: `verification` answers a different question from `source`. *Cited* means the row names a
real published dataset and the row within it. *Checked* means a human re-opened that document and
confirmed the figure. **Collapsing them is how a plausible number acquires authority it has not
earned**, and a carbon figure is quoted in planning submissions, where nobody downstream can tell a
measured cell from a plausible one.

**Every factor PRYZM ships today is `UNVERIFIED_TRANSCRIPTION`.** The 6D surface states it in a red
banner on every render and the CSV carries it in its own column, so it survives being pasted.

⛔ **MUST NOT**: flip a row to `VERIFIED_AGAINST_SOURCE` without recording, in that row's own
`source` string, **who** checked it, **when**, and against **which table or page**. A verification
that cannot be re-checked is a stronger claim resting on nothing.

### §10.11.c — ⛔ THE SEEDING PROHIBITION, and the test that enforces it

**MUST NOT**: add a factor row that cannot state all five of — (a) dataset and edition, (b) the row
within it, (c) geography, (d) scope, (e) **what the published row covers that the PRYZM material does
not, or vice versa**. A row that cannot state all five stays NOT MEASURED, which is a true statement.

**MUST NOT**: a default factor, a category fallback, or a "nearest material" lookup. §5's
no-silent-fallback rule applies with more force here than to colour: a substituted colour is visibly
wrong, a substituted carbon factor is invisibly wrong.

**MUST NOT**: convert a per-kg factor to a per-m³ one by supplying a plausible density.
`carbonPerCubicMetre()` returns **`NO_DENSITY`** instead. ⭐ Two rows — `insulation-mineral-wool` and
`insulation-eps` — **ship a factor and no density ON PURPOSE**: mineral wool ranges 23–150 kg/m³ and
EPS 15–35, so the density is a **specification decision, not a property of the material**. They
exercise the refusal branch in production rather than only in a test.

**The count is a ratio, and it is gated.** `SHIPPED_CARBON_FACTOR_COUNT` = **20** of
`MATERIAL_CATALOG.length` (cite the constants, never these numbers). The test asserts the table stays
under **a quarter** of the catalogue and that 200+ materials carry no factor — so *"complete the
table with plausible values"* **fails a test rather than passing a review**. Rows deliberately
withheld include `concrete-white`, `concrete-precast`, every coated/toughened/tinted glass row, every
hardwood, all stone and all blockwork: the generic published figure does not describe them.

### §10.11.d — The consumer, and what §1.1 bought

`TakeoffLine.materialBreakdown` (L2) reports m³ **per material id — this contract's ids**, emitted by
the take-off's own measurers. A **layered wall emits one row per layer**, because
`WallSystemType.layers[]` already carries `{ thickness, materialId }` in this vocabulary. That is
§1.1's payoff made concrete: the master being reachable and singular is what let a carbon engine be
written with **no material lookup table of its own**.

### §10.11.e — What is proven, and what is not

**Proven:** the facet round-trips through `findMaterialRecord`; zero orphan keys; every shipped row
carries a citation of real length, a real year, a geography and `UNVERIFIED_TRANSCRIPTION`; the three
refusals (`NO_FACTOR` / `NO_DENSITY` / `UNKNOWN_MATERIAL`) each return a reason rather than a zero;
a concrete slab reaches the hand-derived 1084.80 kgCO₂e.

**NOT proven, and named rather than implied:**
- **No shipped figure has been verified against its source document by a human.** That is the
  largest caveat on every number this facet produces and it is §10.11.b's whole subject.
- **The T2 `UserMaterialStore` does not yet carry `carbon`.** A user-created material has no factor
  and no place to put one; the 6D surface's per-material override is a browser-local book, not the
  T2 record. Closing that is a **persistence change**, and it is named here rather than half-done.
- **No EPD or ÖKOBAUDAT import.** Factors arrive by hand, one material at a time.
- **Whether real projects tag enough elements with `materialId` for 6D to cover a meaningful share
  of their volume is UNMEASURED.** The gap ledger is built to answer it; nobody has run it on a real
  project yet.


---

## §10.12 — ⭐ THE HOSTED OPENINGS: the ladder was right, the AUTHORING SURFACE could not name a material (2026-08-23, lane OPENUI41)

### §10.12.a — The founder's report, and what was actually wrong

> *"Review the windows (and door) creation … I want **all materials to be dynamic — nothing text**.
> The materials should be **fetched from real data from the material library**, according to
> C100."* — with `Finish Material: Steel Frame` circled in red in the window inspector.

The lane brief's reading was *"the catalogue already exists and is already projected, so this is
almost certainly a **wiring** job, not a data job."* **That is half right, and the other half is
the finding.**

| measured 2026-08-23 | command | reading |
|---|---|---|
| the master is reachable | `grep -c 'params: {' packages/core-app-model/src/materialLibrary.ts` | fine |
| the RESOLVER is correct and shipped | `sed -n '90,145p' packages/geometry-window/src/windowFinishColour.ts` | **C100 §2.1's ladder, rung by rung, including the unresolved magenta.** Nothing to fix. |
| built-in **window** types carrying a `materialId` | `grep -n materialId packages/geometry-window/src/WindowSystemTypeStore.ts` | **1 hit — the interface declaration. ZERO of 8 types.** |
| built-in **door** types carrying a `materialId` | `grep -n materialId packages/geometry-door/src/DoorSystemTypeStore.ts` | **1 hit — the interface declaration. ZERO of 9 types.** |
| the type editor could author one | `apps/editor/src/ui/property-panel/FinishTypeEditorModal.ts:180-191` | **ABSENT** — a free-text name input and a colour chip |
| the window INSPECTOR could author one | `packages/geometry-window/src/WindowSection.ts:436` | **ABSENT** — `makeTextInput(win.finishMaterial)` |
| the door INSPECTOR could author one | `packages/geometry-door/src/DoorSection.ts:346-364` | **PRESENT** — real library dropdowns |

⭐ **So the defect was never in the master, the projection or the ladder. It was that the three
surfaces which AUTHOR a finish could not NAME a material** — and one of the four could, which is
why door and window had silently drifted apart. `windowFinishColour.ts:108` reads
`win.frameFinish.materialId` as its first rung and **nothing in the repository wrote that field per
window instance**: rung 1 was **DECLARED-BUT-UNREACHABLE for one of the two families.**

⚠ **§9.10.3 is NOT overturned.** It ruled the founder's *"often show, often don't"* was not a
material defect, and that ruling is untouched. It simply measured the RENDER path and not the
AUTHORING path, and the authoring path is where the name was being lost.

### §10.12.b — The rule this mints: **seeding an id without aligning the hex would have shipped a LIE**

34 finish slots (16 window + 18 door) gained a `materialId` **and** had `materialColor` set to that
master row's exact hex.

⛔ **The second half is not tidiness, it is correctness.** `doorFinishColour.ts` rung 1 infers an
explicit **user OVERRIDE** from the stored hex disagreeing with the finish it derives from, and
§2.1 requires an override to be *"distinguishable from a colour that was resolved from the
master"*. A built-in shipping `id ≠ hex` would therefore have read as **"the user deliberately
overrode this colour"** on every door in every project — and §6.1's MUST would have obliged the UI
to report that lie faithfully.

**MUST**: when a reference is added to a record that already carries a cached hex, the hex is
brought to the master's value in the same change. The two are asserted **together** by
`packages/geometry-door/__tests__/OpeningFinishIsAReference.test.ts`.

### §10.12.c — The master gained a row rather than having a wrong one mapped onto it

`steel-powder-coated-dark` (`#444444`, Metal). The `wt-steel-crittal` frame is a dark powder-coated
STEEL; the nearest existing rows were `aluminium-powder-coated-dark` (right finish, **wrong
metal**) and `steel-blackened` (`#1d1f20`, right metal, different product, far darker).

This is the `steel-grating` precedent in `materialCatalog.ts`'s own GROWTH LOG, applied again:
*"Mapping a real material onto a wrong one to satisfy a gate is how the rival vocabularies got
written in the first place."* **One row, and its hex is the preset's own, so seeding the reference
recoloured nothing for that row.**

### §10.12.d — FOUR states, and the two the old control collapsed

`packages/geometry-door/src/FinishMaterialSelect.ts` is now the ONE finish-material picker for both
families and both tiers. It classifies a slot as `resolved` / `unresolved` / `legacy` / `empty`:

- **`legacy`** — a free-text `name` and no id. Shown as `⚠ "Steel Frame" — not a library
  material`, and **the string is KEPT in the record until the user replaces it.** The old control
  rendered this identically to *"nobody has chosen one yet"*. **A user's value is never silently
  dropped**, which is the migration rule this section binds.
- **`unresolved`** — an id that names nothing. A different defect with a different fix (the
  catalogue may be what is wrong), so it gets a different sentence.

⛔ **`suggestMaterialForLegacyName` REFUSES to guess.** Exact normalised label match, then
whole-word containment, otherwise `undefined`. **`"Steel Frame"` finds nothing, and that is the
correct answer** — §5's last MUST: *"inference that passes for resolution is the same lie one
layer up."* A near-miss guess is how `wood-oak` and `wood-walnut` collapsed onto one grey-teal
(§9.4). Where a suggestion does exist it is offered as a LABELLED OPTION the user must choose.

### §10.12.e — §6.1's MUST on overrides is now satisfied for opening types

The type editor's colour chip writes an **override**; the override is marked with the master's own
value beside it and a one-click reset. ⭐ **No new field encodes "is override"**: the state IS
`materialColor ≠ masterHex(materialId)`, exactly as `doorFinishColour.ts` rung 1 already infers one.
One spelling of one rule, and no codec change.

### §10.12.f — The preview draws from the master, and that is a rendering fact

`apps/editor/src/ui/element-preview/ElementPreviewRenderer.ts` resolves each part's `materialId`
through `findMaterialById` and applies the master's **colour, metalness and roughness**. An id that
names nothing renders the designated UNRESOLVED colour and emits **one** diagnostic per distinct id
(§5). ⭐ *"Materials fetched from the library"* is therefore what lights the pixels, not a label
under them.

### §10.12.g — What is NOT closed, named rather than left as an absence

- ⛔ **The picker offers T1 only.** §1.1 resolves **T2 then T1**, and `MaterialsBucket.ts` DOES
  offer T2 ("My Materials") because it sits in `apps/editor` where the `@pryzm/core-app-model` root
  barrel is already paid for. Reaching `userMaterialStore` from an L2 geometry package would drag
  the model layer into the door/window bundles. **A user-created material is assignable to an
  opening from the Data Workbench and not from the inspector.** L-7712.
- ⛔ **Quantities and carbon still cannot read the reference, and adding it did not change that.**
  `QuantityTakeoff.ts:789-803` emits the openings line with **no `materials` array at all** and a
  hard-coded `materialGap` at `:802` naming the real blocker: *"PRYZM models no leaf thickness and
  no frame section, so there is no VOLUME to attribute … this family can only ever supply m²."*
  `CarbonModel.ts:244` multiplies `volumeM3 × kgCO2ePerM3`; with no m³ there is nothing to
  multiply. **The blocker is VOLUME, not the reference** — so this lane logged it (L-7713) rather
  than half-wiring a number that would have been zero.
- ⚠ **Two opening material vocabularies still exist**: the kernel's
  `frameMaterialId`/`leafMaterialId`/`glassMaterialId` (`packages/schemas/src/elements/{Door,Window}.ts`)
  and the legacy stores' `frameFinish.materialId`/`leafFinish.materialId`/`sillFinish.materialId`.
  Production travels the **second**. Deciding which is canonical is L-7714 and is NOT this lane's.

---

## §10.13 — ⭐ THE SCHEDULE'S ELEMENT AXIS, AND THE LAYER THAT COULD NOT NAME A MATERIAL (2026-08-23, lane MAT50)

> **Stamp**: 2026-08-23 · **Lane**: MAT50 · **Rows**: L-8600 – L-8620.
> **This is §8.2 S11's first half** (*"the schedule"*). ⛔ **S10 is NOT closed** — see §10.13.f.

### §10.13.a — The founder's two asks, and what was actually wrong

> *"COULD YOU PLEASE TRY TO EXTEND AS MUCH AS POSSIBLE TO ELEMENT VS MATERIALS? AND ALL PROPERLY
> WIRED AND ACCESSIBLE VIA RAC AND UI?"* — looking at Data › Materials › Material Schedule, where
> almost every element cell was `—`. Then, one axis deeper: *"Can you please add material for each
> layer? and that the user can change the material via UI and via RAC?"*

The lane brief's reading was that `Ceiling` was a dead column. **That is half right, and the other
half is the finding**: the axis was wrong in BOTH directions at once, which is why no count anybody
could have written about it would have been wrong.

| measured 2026-08-23 (runtime probe, not grep) | types | distinct `materialId` | column then |
|---|---|---|---|
| wall · floor · slab | 8 · 22 · 14 | 11 · 11 · 13 | yes |
| door · window | 9 · 8 | 6 · 5 | yes (seeded by §10.12, one day earlier) |
| **handrail** | **44** | **26** | ⛔ **NONE** |
| **ceiling** | 10 | **0** | ⚠ yes — could never tick |
| curtain-wall · plumbing | 20 · 19 | 0 · 0 | none |

⭐ **`handrailTypeStore` is the one that matters**: 26 real master references the founder already
owns, and the schedule could not show them. A hand-typed `ELEMENT_CATS` array of six strings was
right about its own length and wrong about its membership, in both directions simultaneously.

### §10.13.b — The rule this mints: **a dash that means two things is the same defect as a missing gate**

`—` meant both *"this family does not use this material"* and *"this family cannot name any
material."* **§CONTEXT-DATA-HONESTY: failure and empty were the same value.** Three of nine type
stores are in the second state, so a user reading a Ceiling dash concluded *"no ceiling uses
concrete"* when the truth was *"no ceiling can name anything."* Those are opposite facts with
opposite fixes (**C01 §6 rule 6**).

**MUST**: where a family cannot carry a material reference at all, the schedule renders that as its
OWN state, named in a legend — never as the same glyph used for a real, informative absence.

⛔ **Nothing is deleted to achieve this.** The Ceiling column stays; it stops claiming to be an
answer. Deleting it would have destroyed the evidence that the gap exists.

### §10.13.c — ABSENT vs UNREACHABLE vs UNSEEDED — a third state the contract now names

Ceiling is **neither absent nor unreachable**: `ceilingSystemTypeStore` is exported,
`CeilingLayer.materialId?` is declared, and the Material Schedule can reach both. **Zero built-ins
fill one.** That is a distinct state from the two C01 §6 rule 6 names, and it has a distinct fix
(seed the catalogue) from both rewiring and building.

⛔ **Seeding it is NOT a tidy-up and was NOT done here.** Per **§10.12.b** a reference added beside a
cached hex must bring the hex to the master's value in the same change. Measured: the ceiling layer
is `#F0EEE8`, the nearest master row `gypsum-plasterboard` is `#f0eeea`, and
`CeilingColourSystem.resolveLayerColour()` returns `materialColor ?? functionColour`. **They differ,
so seeding recolours every ceiling** — a founder-facing graphics decision (L-8602).

### §10.13.d — The axis is DERIVED, and the gate compares SETS

`apps/editor/src/ui/dataworkbench/materialUsageRegistry.ts`. The collector is **structural** — a
depth-bounded walk for `materialId` — rather than the six bespoke accessors it replaces
(`t.frameFinish` / `t.leafFinish` by name), which silently under-report the day a family gains a
seventh finish slot.

`materialUsageRegistry.test.ts` ARM B asserts **registry ∪ excluded == every `*TypeStore` singleton
in the repository**, discovered by scanning `packages/`. A store that ships next week is either given
a column or given a REASON; *"silently missing"* is converted into *"explicitly decided"*.

⚠ **ARM B3 was RED on its first run and was right to be**: it asserted the excluded stores had
singletons, when *"has no module-level singleton"* is precisely why three of them are excluded. Two
discoverers now (singletons vs classes), so the distinction cannot quietly re-collapse.

### §10.13.e — §6.1's MUST is now satisfied for WALL LAYERS, and the pipe was never the problem

`WallTypeEditorModal` offered `<input type="color">` and nothing else; `WallTypeSelectorWidget:459`
pushed new layers with **no `materialId` at all**. So every layer any user has ever authored carries
an unconstrained hex and no reference — **a §6.1 breach, and a raw colour input is not even the
"hand-written swatch list" that clause forbids.**

⭐ **`elementTypeAuthoringAdapters.ts:79` is `layers: draft.layers` — verbatim passthrough.** The
route from modal to store was complete end to end. **The defect was ABSENT authoring, not broken
wiring**, exactly as §10.12 found for door and window one day earlier, and the fix is a control
rather than a rewire.

The control is **`buildFinishMaterialSelect` — reused, not rebuilt.** A second picker here would be
**C68 §7.c**'s anti-pattern *"even when it is shorter"*, and would have drifted from the four honest
states (`resolved` / `unresolved` / `legacy` / `empty`) immediately. Overrides are marked with a
one-click reset per §2.2 and §10.12.e, and ⭐ **no new field encodes "is override"** — the state IS
`materialColor ≠ masterHex(materialId)`, so there is no codec change.

### §10.13.f — What is NOT closed, named rather than left as an absence

- ⛔ **S10 — the RAC half — is NOT closed, and this lane was BLOCKED from closing it by lane
  ownership, not by effort.** A per-layer material batch verb needs a row in `BATCH_REPORT_EVENTS`
  (`apps/editor/src/ui/ai/ZeroTokenChatBridge.ts:1297`), which sits inside a concurrent lane's
  declared exclusion zone, and `batchReportEventsCompleteness.spec.ts` derives its required key set
  from the handlers themselves: *"Adding a broadcasting handler without a listener now fails here."*
  ⭐ **Shipping the handler alone would turn a GREEN gate RED and print the canned "Done" over
  whatever it actually did — L-996 exactly, re-run.** The unblock is ONE row (L-8612).
- ⚠ **A design question rides with S10 and MUST NOT be decided silently.** *"make all walls interior
  finish plaster"* already works and writes `sideFinishes` — **an appearance-only field BESIDE the
  layer stack**, deliberately so, because re-finishing a face must not move the wall's thickness. A
  new *"…interior layer material oak"* would write `layers[i].materialId`. **Two near-identical
  sentences writing two different fields is a rival vocabulary in the making** (C68 §7.c). Whether
  the existing verb should ALSO name the layer's material is a founder/contract call.
- ⛔ **The `add-wall-layer` refusal is UNTOUCHED and must stay that way.**
  `CapabilityExecutionSpec.ts:687` refuses to invent a thickness because `MaterialRecord` carries no
  thickness field — it names the consequence and offers two live alternatives, which is
  §REFUSING-HALF-NEEDS-ITS-ESCAPE-HATCH done right. The founder's ask is the verb it correctly
  declines to guess at, **not** a request to loosen it.
- ⛔ **Only wall layers gained the control.** Floor, slab and ceiling type editors are separate
  surfaces and are their own slice. Stated plainly rather than reported as *"layers can name
  materials"*.
- ⛔ **Curtain-wall and plumbing remain unseeded** (0 of 20 and 0 of 19). Plumbing is additionally
  not a declared dependency of `apps/editor`, so it is on `EXCLUDED_TYPE_STORES` with that reason
  rather than added as a third un-tickable column (L-8603).

---

## §10.14 — ⭐ THE AUTHORING PANEL GAINED A SECOND MOUTH, AND IT REUSES THE LADDER RATHER THAN GROWING ONE (2026-08-23, lane OPENUI57)

### §10.14.a — The founder's ask, and the trap inside it

> *"enable AI chat while in this new creation panel — the user could either do it via UI or chat —
> 'create a window with…' and **all parameters should be accessible via RAC / AI** — this should be
> an architecturally sound implementation."*

**"All parameters" is the load-bearing phrase, and taking it literally is the trap.** The obvious
implementation is a table mapping the eight window dimensions, two finish slots, two grid axes and the
glazing opacity onto parser rules. That table would be *shorter* than what shipped and it would be the
defect: **two enumerations of one vocabulary**, drifting from the first field anyone adds — §6.2's
"authored but unwired" one layer up, and C68 §7.c's rival vocabulary exactly.

### §10.14.b — The rule this mints: **AN AI SURFACE OVER A DECLARED VOCABULARY MUST DERIVE ITS VOCABULARY FROM THE DECLARATION**

> **MUST.** Where a UI renders its controls from a declaration (here
> `ElementTypeAuthoring.finishEditor`, per C65 §3.5), any chat, RAC or AI surface over the same subject
> MUST build its vocabulary from **that same declaration** rather than from a parallel list. A field is
> then reachable by language *because* it is reachable by control, and the correspondence is
> structural rather than maintained.
>
> **MUST.** That correspondence MUST be asserted **in both directions** by a test, so that adding a
> declared field without language reach — or removing language reach for a declared field — goes red
> without anyone remembering to check. (`FinishTypeDraftIntent.spec.ts` iterates the registry's own
> `dimensions`, `slots` and `grid` and asserts each is present in `draftFieldsFor()`.)
>
> **MAY.** A LANGUAGE layer over the declaration — English morphology such as `wide → width`,
> `tall → height`, `thick → thickness` — is permitted and is not a rival vocabulary, provided its
> values are **words the declaration already uses** and that constraint is itself asserted
> (`morphologyIsGrounded()`). ⛔ It MUST NOT map to record keys or to values; it can only help reach a
> field the declaration already declares, and it can never invent one.

### §10.14.c — Material references travel the ONE ladder, and inherit its refusals unsoftened

`FinishTypeDraftIntent` resolves a spoken material through **`suggestMaterialForLegacyName`**, the
matcher `FinishMaterialSelect.ts` already owns (§10.12.d). It adds nothing to it. Concretely:

- *"frame in unobtainium"* → **refusal**, in the picker's own terms: *"not a material in the library …
  a near-enough guess here would put a colour on your type that nobody chose."* That is §5's
  prohibition on substituting a plausible value, restated at the language layer.
- A name reached by inference rather than by exact label carries **`inferred: true`**, and the chat
  says so on screen: *"(closest library match — change it above if that is not the one)"*. §5's last
  MUST — *an INFERRED value is reported as inference, not as resolution* — is therefore satisfied at
  the surface the founder actually reads, not only in the resolver's return type.

Field resolution likewise reuses **`resolveCatalogueRef`** (ADR-0314), so ambiguity behaves as it does
everywhere else in the repo: `entry: null` plus the candidate list. *"frame 0.05 m"* answers **"Frame
face or Frame depth?"** rather than picking one. ⛔ **No second matcher of either kind was written.**

### §10.14.d — §6.2's carrier rule is satisfied by a DETERMINISTIC path, and by no store of its own

§6.2 warns that *a capability reachable only through the LLM planner tests green and does not exist for
the founder*. This path never reaches a planner: the resolver is offline, zero-token and synchronous.

⛔ **It introduces no bus verb, no DTO store and no `BATCH_REPORT_EVENTS` row**, so C68 §5.a's
presumption — a plugin `produceCommand` DTO store is DEAD until proven otherwise, right 13/13 — cannot
bite: there is nothing new to presume dead. *"create it"* runs the dialog's own `validate()`, then the
existing `elementType.create`, then the existing **store read-back** in
`FinishTypeAuthoringActions.onSave` (C16 §5.1 CA-21). **The chat contains no "Done"** — it repeats what
the validator and the store said, or it says it does not know.

⛔ It also does not register as the `chatPromptHost` and does not call `tryHandleZeroToken`. Both hold
module-global singletons (`host`, `conversation`); a modal that borrowed either would take the
application's only chat surface away, or interleave two conversations into one memory, for as long as
it was open.

### §10.14.e — §2.2's authored-versus-derived rule, applied to a DIMENSION

§2.2 states for a material override that a value the user did not choose must never be
indistinguishable from one they did. **The same distinction was half-missing on the type's dimensions**
and is now closed: an unauthored field reads **`auto · 1.2 m`** — naming what it INHERITS, taken from
`resolveWindowDimensions` / `resolveDoorDimensions`, the same resolvers the placement path calls
(L-127), never a literal — and an authored one reads **`authored ×`**, which clicks back to auto.

> **MUST.** Where a type may either ASSERT a value or INHERIT one, the control MUST show which of the
> two it is doing, MUST name the inherited value rather than only the word "auto", and MUST offer the
> way back. ⛔ Clearing MUST delete the field; writing `0`, or freezing today's default into the
> record, converts "inherits" into "asserts" without the user saying so — and every element placed
> from that type carries the conversion.

### §10.14.f — What is NOT closed, named rather than left as an absence

- ⛔ **The GLOBAL chat still cannot place a single window from *"create a window with 2 m width"*.**
  `parseWindowsParametricIntent` requires a named SCOPE and reads size only as `WxH`; there is no
  singular placement verb and no door-create verb at all; `window.create` / `door.create` REFUSE by
  design; and `wall.createOpening` sits in `CHAT_UNAVAILABLE` and emits no `*_REPORT_EVENT`, so a
  capability riding it would get the canned "Done" that L-996 removed. Closing it needs four coupled
  changes across `plugins/wall`, `packages/ai-host` and `packages/command-registry` (ISSUE-LOG L-9650).
- ⛔ **T2 ("My Materials") is still absent from this picker**, unchanged from §10.12.g. The chat
  therefore inherits exactly the same reach as the control beside it — which is correct behaviour for
  a derived vocabulary, and still a gap.

---

## §10.15 — ⭐ THE REFERENCE PRODUCT'S MATERIALS: THE LICENCE VERDICT MADE STRUCTURAL, THE FACET IT VALIDATED, AND THE ROOF ANSWER THE FOUNDER WILL NOT LIKE (2026-08-23, lane PASCALMAT58)

> **Stamp**: 2026-08-23 · **Lane**: PASCALMAT58 · **Rows**: L-9700 – L-9707.
> **Founder request, verbatim**: *"check pascal editor once more — I really want the following
> materials: [dark roof shingles] I want this tiling by default on my roofs … [timber decking] and
> [basket-weave parquet] those are flooring render finishes that I want on PRYZM"*, then
> **"as requested copy ALL the materials — ALL OF THEM — and apply to the master material library in
> Data tab and to C100 — I want to access to all their materials"**.
> **Adds and AMENDS.** §10.6's hosting statement is amended again (§10.15.c); §10.7 **S25 is CLOSED**;
> a new **S33** is minted and is the one that decides whether the founder's first sentence can ever
> come true.

### §10.15.0 — The answer in four lines

> 1. ⛔ **"ALL of them" cannot be honoured for the PIXELS, and the reason is not caution — it is a
>    measurement.** The verdict was already reached by lane MAT-R (§0.2 of the evidence doc) and is
>    **independently re-confirmed here on a complete local clone**. What was missing was any
>    MECHANISM: the rule lived in a README, a JSON comment key and a research doc, and was enforced
>    inside one script's allowlist that **no procedural or hand-authored row ever passes through.**
> 2. ⭐ **It CAN be honoured for the TAXONOMY, and that turned out to be the valuable half.** Their
>    `MaterialTarget` — each material declaring which element slots it suits — is the DECLARED form
>    of the axis lane MAT50 derived. **§10.7 S25 is now CLOSED**, facet and filter in one commit.
> 3. ⭐ **Three of the founder's four named finishes ALREADY EXISTED in this master.** The gap was
>    never the catalogue; it was that nothing let him find them. The two real gaps — a **dark**
>    shingle and **decking** — are now ten procedural rows that need no bucket, no CORS and no
>    decoder.
> 4. ⛔ **"This tiling BY DEFAULT on my roofs" is BLOCKED, and not on a default.** A roof carries no
>    `uv` attribute anywhere in the pipeline, so `applyMaterialMaps` refuses its maps on every roof,
>    unconditionally. **Changing the default today would darken every existing roof in every project
>    and still show no shingle pattern.** That is strictly worse than doing nothing, so it was not
>    done. §10.15.f.

### §10.15.a — ⛔ THE LICENCE VERDICT, RE-MEASURED, AND THE SENTENCE THAT DECIDES EACH HALF

Re-measured **2026-08-23** on a complete local clone (`288` tracked files = `288` on disk,
`git status --porcelain` empty — so this is the repository, not a partial checkout).

| subject | verdict | the sentence that decided it |
|---|---|---|
| **the manifest / the taxonomy** | ✅ **CLEARED_FOR_REDISTRIBUTION** | MIT: *"The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software."* — a **condition**, and it is now discharged structurally (§10.15.b). |
| ⛔ **the 288 texture binaries** | ⛔ **NOT_ESTABLISHED** | **there is no sentence, and that is the finding.** No CREDITS / NOTICE / attribution / per-directory README anywhere under `apps/editor/public/material/**`; **zero** occurrences of `ambientCG`, `Poly Haven`, `CC0` or `attribution` in the entire repository. |

⭐ **THREE PIECES OF NEW EVIDENCE this lane found that the prior research did not have**, each of
which independently strengthens the refusal:

1. **The whole asset tree arrived in ONE squashed vendor-bump commit** — `45a8cce`,
   *"Bump plugin-bones to d1c3c8b (night-10 dawn batch) (#711)"*. `git log -- apps/editor/public/material`
   returns **exactly one commit**, and its message names no texture source. There is no per-asset
   history to chase even in principle.
2. ⭐ **The repository demonstrably KNOWS the rule it did not apply here.**
   `wiki/blender-edit-mode-research.md:406`: *"Blender is GPL-licensed. Its behavior and manuals can
   guide an independent implementation, but **copying Blender source into this MIT repository
   requires license review**."* **Licence review was performed and recorded for CODE, and recorded
   for none of the 288 binaries.** This is not an oversight we can read as "probably CC0".
3. ⛔ **Their own manifest cannot resolve its own assets — `235` of the `314` paths it cites DO NOT
   EXIST in their repository.** Every `roofing`, `wood` and `flooring` material — including all four
   the founder named — points at `_512.ktx2` files that were never committed, while the `.webp` /
   `.jpg` maps that ARE on disk are referenced by nothing. So *"copy their manifest"* would have
   imported a table that **404s on 75 % of its own URLs**, and the 79 paths that DO resolve are the
   **KTX2-only** families this repo cannot decode (§10.9.b, S31). ⭐ **The subset that works upstream
   and the subset we could use do not intersect.**

> ⚠ **The naming inference is recorded and is NOT the basis of the verdict.** `finewood_27`,
> `hungarian_parquet_10`, `statuaretto`, `green_labradorite` read as commercial PBR-vendor house
> style, and PRYZM's own pipeline uses `WoodFloor043`-style ambientCG ids — a different convention
> entirely. **That is a suspicion. The verdict rests on the ABSENCE of any statement of origin**, and
> would be identical if every filename were bland.

### §10.15.b — ⭐ THE RULE EXISTED AND NOTHING ENFORCED IT WHERE ROWS ARE ACTUALLY WRITTEN

This is the section worth carrying, because the defect is not "we had no policy".

*"No file from `pascalorg/editor` is copied, downloaded, vendored or derived from"* was already
written in **three** places — `tools/texture-pipeline/README.md`, the `$comment` key of
`sources/materials.json`, and the evidence doc — and mechanically enforced in **one**:
`acquire.mjs`'s `ALLOWED_LICENCES` gate, which runs **before any network call**.

> ⛔ **That gate governs exactly the path that DOWNLOADS.** Every `procedural:` row and every
> hand-authored row is typed straight into `materialCatalog.ts` and passes through it **never**. A
> licence rule enforced only on the acquisition path is not enforced on the authoring path, and the
> authoring path is where most rows come from.

**The fix is a LEDGER AT L0, and its shape is not invented here — it is lane RATE53's, adopted:**
`packages/schemas/src/materials/materialProvenance.ts` carries `MaterialUpstream` with a three-valued
`MaterialLicenceStatus` (`CLEARED_FOR_REDISTRIBUTION` / `LICENSED_NOT_REDISTRIBUTABLE` /
`NOT_ESTABLISHED`) **plus `licenceNote` — the sentence in the licence that decided it**. `MaterialRecord`
gains `upstream?: MaterialUpstreamId`.

**MUST**: a catalogue row that names an `upstream` names one whose status is
`CLEARED_FOR_REDISTRIBUTION`.
**MUST**: a verdict other than `NOT_ESTABLISHED` quotes a sentence and names a reading date. ⛔ A
verdict with no quoted sentence is an opinion.
**MUST NOT**: a `NOT_ESTABLISHED` row carry a `licenceNote` — claiming both *"we read it"* and
*"nobody read it"*.
**MUST**: an `attributionRequired` upstream's text be reproduced in the shipped **`NOTICE.md`**.

> ⭐ **AND THE ATTRIBUTION IS RETAINED EVEN THOUGH IT IS ARGUABLY NOT OWED.** A taxonomy is an idea,
> and ideas are not licensable, so taking *"materials declare their suitable surfaces"* needs no
> grant at all. `NOTICE.md` reproduces the MIT text anyway: the cost of the entry is nothing, and the
> cost of being wrong about where the idea/expression line sits is not.

**Enforced by three new arms on `tools/ga-gate/check-material-single-source.ts`, each watched-RED and
observed to fire before being left green** (ARM A stays hard-0 and untouched):

| arm | checks | first reading |
|---|---|---|
| **D** (hard-0) | every declared `surfaces` list is well-formed. ⛔ **An EMPTY array is the failure it exists for** — `surfaces: []` reads as NOT DECLARED to every consumer while looking deliberate in a diff | clean |
| **E** (hard-0) | no shipped row names an uncleared upstream; every non-`NOT_ESTABLISHED` upstream quotes a sentence and a date | clean; watched RED at **34 findings** |
| **F** (hard-0) | `NOTICE.md` reproduces every required attribution paragraph, compared as **CONTAINMENT**, never a byte-diff (a gate that fails on a reflowed paragraph is switched off within a week) | clean; watched RED at **1 finding** |

⚠ **ARM E checks ROWS against the ledger — NOT that the ledger is free of refusals.** The ledger is
**expected** to carry `NOT_ESTABLISHED` entries, and a test asserts `unclearedMaterialUpstreams()` is
**non-empty**: ⭐ *a ledger with no refusals in it has not been used.* If anyone ever "tidies away"
the Pascal-textures row, that test goes red and a reviewer has to say out loud that the provenance
question was resolved.

### §10.15.c — ⛔ HOSTING: §10.6's QUESTION IS ANSWERED, AND SIZE WAS NEVER THE VARIABLE

The brief asked whether 18 MB belongs in the image or on R2, contrasting it with `public/items`'
~185 MB. **Measured, the size is not the deciding factor and never was.**

- ⭐ **The seam already exists and already works**: `/items/textures/**` → `resolveCatalogAssetUrl`
  → R2 `pryzm-assets`. Sixteen CC0 materials ship through it today with **no client change**
  (§10.9.b). **A new file-backed material needs no hosting decision at all.**
- ⭐ **The repo's rule is already "bytes in R2, hashes in git"**: `textures.manifest.json` carries a
  SHA-256 for every archive and every published file, so the set is **verifiable without being
  committed**. `public/items` is the counter-example the pipeline's own README cites — binaries in
  git that then have to be `.dockerignore`d back out.
- ⛔ **The two REAL constraints are DECODE and PROVENANCE**, and Pascal's assets fail on both:
  `RASTER_EXTENSIONS` in `MaterialResolver.ts` is `.png .jpg .jpeg .webp .avif` — **`.jpg` decodes,
  `.ktx2` does not** (S31) — and **17 of their 65 material directories are KTX2-only**, carrying a
  single `.webp` thumbnail and nothing else.

> **MUST**: a slice proposing new file-backed maps names the bucket, the format **against
> `MaterialResolver`'s registered loaders**, and the licence per map. **MUST NOT**: a slice cite
> asset SIZE as the hosting blocker. §10.6 named a bucket, §10.9.b corrected it to a decoder, and
> this section adds the third: **provenance is a hosting precondition, not a paperwork step after
> one.**

### §10.15.d — ⭐ S25 IS CLOSED: `surfaces` IS THE DECLARED FORM OF THE AXIS MAT50 DERIVED

§10.7 S25 required the facet to ship **with its filter, in the same commit**, precisely because *"Pascal
authored the facet on 65 records and wired nothing"*. Both halves ship here.

⭐ **AND SO DID WE, one layer down, for two days.** `tools/texture-pipeline/sources/materials.json`
has carried `"surfaces": ["floor"]` per material **since 2026-08-21**, `acquire.mjs` copied it into
`textures.manifest.json`, and `emit-catalog-rows.mjs` **dropped it on the floor at every emit,
because there was no field at L0 to put it in.** The data was right, the pipeline was right, and the
destination did not exist. The emitter now **REFUSES** a manifest material that declares none.

> ⛔ **THE ONE PLACE WE DELIBERATELY DIVERGE FROM THE REFERENCE PRODUCT, AND IT IS THE WHOLE DESIGN.**
> Theirs reads *"Absent = universal (e.g. flat colors)"*. **We do not adopt that.** Under it, *"nobody
> has classified this"* and *"this suits everything"* are **the same value** — so the first filter
> anyone ships confidently offers polished marble for a roof. That is §5's *"a failure and a beige
> material are the same value"*, relocated into an applicability facet.
>
> **MUST**: `surfaces` absent means **NOT DECLARED**. `isDeclaredForSurface()` returns **`null`**, not
> a boolean, so the compiler makes every caller see the third state (§10.13.c's ABSENT / UNREACHABLE /
> UNSEEDED, extended).

**MUST NOT: collapse DECLARED suitability into the schedule's DERIVED element axis.** They are two
facts. The axis measures what a family **references** (§10.13.d); `surfaces` states what the product
**suits**. A shingle suits a roof whether or not any roof names it, and merging them destroys the one
reading that is worth having — *"you have seven roofing finishes and none of them is on a roof."*

### §10.15.e — WHAT LANDED, AND WHAT THE FOUNDER CAN CLICK

**Ten new rows, every one PROCEDURAL** — `@pryzm/procedural-textures`, arithmetic, **no file, no
bucket, no CORS, no decoder, and no chain of title to establish.**

- **7 roofing**: asphalt 3-tab in **charcoal** / slate grey / weathered brown, architectural laminated
  charcoal, natural slate, cedar shingle, silvered cedar.
- **3 decking**: oak, thermo-ash, grey composite.

⭐ **THE PATTERN ENGINE NEEDED NO NEW LAYOUT CODE FOR EITHER FAMILY**, and that is the finding, not
the rows. A shingle course, a slate roof and a deck are **running bonds** — the same layout as a plank
floor and a subway tile. Only *product dimensions in millimetres* and a `SurfaceProfile` were written.
§10.3.b said *"parquet, shingle and mosaic are PATTERN"*; measured, **they are the SAME pattern**.

> ⛔ **THE MODULE OF A ROOF COURSE IS THE VISIBLE TAB × THE EXPOSURE, NOT THE PRODUCT'S SIZE**, and
> getting that wrong is the commonest way a roof texture ships at the wrong physical scale. A 3-tab
> asphalt strip is a 1000 mm sheet but the eye sees a **333 mm tab at 143 mm exposure**; the rest is
> lapped under the course above. A slate is 500 × 250 laid at a **200 mm gauge**. Every row here is
> keyed on the visible module, and `check-material-maps-tiling.ts` **ARM E** holds each row's
> `realWorldSizeM` to the generator's own computed cell — so the scale is derived, never transcribed.

**Reachability, measured, not assumed:**

| path | state |
|---|---|
| **Data tab › BIM Material Library** | ⭐ **NEW: a "Suitable for" chip row** — Floor · Wall · Ceiling · Roof · Furniture · Outdoor · **∅ Not declared**, read from L0 so a seventh surface needs no edit here. One `applyFilters()` over BOTH axes (two independent hide passes race: whichever ran last wins, so typing after picking a chip would silently un-filter it). |
| **Data tab › Material Schedule** | ⭐ **NEW: a `Suitable For (declared)` column**, deliberately **beside** and not merged into the derived family matrix. ⚠ It renders the words **`not declared`** and **NOT `∅`** — ∅ already means *"this family cannot yet name a material"* in that same table, and one glyph for two unrelated absences would be §10.13.b committed inside its own fix. |
| **Chat / RAC** | ⭐ **already reachable with no resolver edit** — `finishRefCandidates()` token-matches every master LABEL (§10.5c). *"make the roof dark charcoal shingle"* is nameable the moment the row exists. ⛔ **But the CARRIER is unchanged**: `roof.setMaterial` still REFUSES with `affectedStores: NONE`. **S27 is not closed by this lane.** |

⭐ **AND THREE OF THE FOUNDER'S FOUR NAMED FINISHES ALREADY EXISTED before this lane ran** —
`roof-tile-clay-012` / `roof-tile-clay-grey-015` (the clay scallop), `parquet-oak-basket-weave` +
`parquet-ash-basket-weave-double` (the basket weave), and the plank floors. **The catalogue was not
the gap; the picker was.** A test now pins all four by id, asserts each is declared for the right
surface and carries a real-world scale, so the claim cannot rot into a label match.

### §10.15.f — ⛔ THE ROOF DEFAULT: NOT CHANGED, AND THE REASON IS MEASURED

The founder's first sentence is *"I want this tiling by default on my roofs"*. **Both halves of it are
blocked, and the second is the one that matters.**

1. ⛔ **A ROOF CANNOT CARRY A TEXTURE AT ALL TODAY.**
   > ⭐ **SUPERSEDED 2026-08-23 (lane ROOF7, §10.16, L-10020). This paragraph is now FALSE, and it is
   > left standing because it is the exact measurement that made §10.16 buildable.** The roof pipeline
   > emits metre UVs on ten of its eleven entry points and `RoofFragmentBuilder` passes its own
   > geometry; `uvSpaceOfGeometry(null)` is gone from `geometry-roof`. ⚠ **The SECOND half of the
   > sentence — *"assigning a shingle to a roof shows no course lines"* — is STILL TRUE for the seven
   > `procedural:` rows this section shipped, for a DIFFERENT reason: §10.10.c's mechanism 2, the
   > generation flag. See §10.16.e before quoting either half.**

   `RoofFragmentBuilder.ts:197` calls
   `applyMaterialMaps(params, matDef, uvSpaceOfGeometry(null))` — **literally `null`** — and nothing
   in `geometry-roof` or in the three kernel roof builders (`buildExtruded`, `buildMultiLevel`,
   `buildVariableHeight`) emits a `uv` attribute or calls `stampMetreUvs()`. So **every** roof
   resolves `UV_NONE` and its maps are refused, by design (§10.9.e: *a visibly wrong pattern is worse
   than an honest flat colour*). **Assigning a shingle to a roof today changes its COLOUR and shows no
   course lines.**
2. ⚠ **Blast radius of the default itself.** `composeRoofMaterialKey`'s `DEFAULT_SHINGLE` is
   `#c8a46e`, a warm tan, and it applies to **every roof that carries no explicit `materialColor`** —
   i.e. retroactively, everywhere, because §2.2's "editing the master changes every element that
   references it" cuts both ways for a default. Switching it to charcoal would **darken every roof in
   every existing project**.

> ⛔ **1 and 2 together are why this lane did not do it.** Not "it is risky": **the change would
> deliver the cost (every existing model restyled) and none of the benefit (still no tiling).** That
> is a strictly worse state than before, and shipping it and calling it the founder's request would
> have been the defect this contract keeps logging.

**⭐ S33 — NEW, and it is the slice that decides this: metre UVs for the roof SHINGLE face.**

> ⛔ **RENUMBERED S34, AND BUILT — 2026-08-23 (lane ROOF7, §10.16).** Two corrections in one box.
> **(1) The NUMBER was already taken** — §10.10.f minted *"S33 — BUILD-TIME procedural texture
> generation"* two days earlier, and the two slices are **in series on this same founder sentence**,
> so *"S33 is done"* would have been ambiguous in precisely the case where the distinction decides
> whether a pattern appears (§10.16.f, L-10027). **The roof slice is S34.**
> **(2) The SIZING was right about the risk and wrong about the shape of the work.** All ten entry
> points already funnel through `RoofGeometryBuilder.generate()`, and a frame derived from a
> TRIANGLE's own normal needs no generator knowledge — so it is **one call, not ten edits**. ⚠ The
> paragraph's real warning stands and was honoured: the naive plan projection was tried as a watched
> RED and leaves `flat` GREEN while failing nine pitched forms.

The
sibling of **S30** (walls), and cheaper: a roof's shingle slot is one continuous sloped plane per
segment, so it has none of the wall's "which body arm ran" ambiguity that made S30 a refusal. **Until
S33 lands, "shingle" on a roof means a colour.** Once it lands, every row shipped here starts tiling
**with no edit to any of them** — that is exactly what §10.9.e's declared-stamp default was built for.

⚠ **S33 IS SIZED, NOT HAND-WAVED, AND THE SIZING CHANGES ITS SHAPE.**
`packages/geometry-roof/src/RoofGeometryBuilder.ts` is **1540 lines** with **ten** distinct generator
entry points (flat, shed, gable, hip, dutch-hip, mansard, gambrel, segmented, concave-pitched,
general-pitched) plus a merge path, and every one of them would need UVs.

⛔ **And the obvious cheap version is WRONG, which is the part worth writing down.** A roof is ONE
`BufferGeometry` with four material groups, so the tempting fix — stamp a planar XZ metre-UV the way a
slab does — **foreshortens the pattern up the slope by `cos(pitch)`**: 13 % compression at 30°, and
**41 % at 45°**. Courses would read at the correct size across the eave and visibly wrong up the
rafter, which is the axis a roof is most read along. Correct UVs are **slope-distance**, parameterised
per face. ⛔ **Doing half of the ten generators would give some roof types true tiling and others a
squashed one — worse than the uniform, honest refusal that exists now.** A partial fix here is not a
smaller version of the fix.

⛔ **And the DEFAULT is a founder decision, not an engineering one**, and it is recorded as open
rather than taken: *"charcoal shingle" restyles every existing roof; "leave the tan" means new
projects still start on a colour nobody chose.* §9.9 / §9.10.6 S20 left the sibling question (should
an unmaterialled wall render light grey) open as the founder's call for the same reason, and this
contract does not take either.

### §10.15.g — What is NOT closed, named rather than left as an absence

- ⭐ **S33 → RENUMBERED S34, AND BUILT 2026-08-23** (lane ROOF7, §10.16). It was *"the single
  thing standing between the founder's sentence and the rows that already exist"* — ⛔ **and it was
  not the only thing.** Measured after it landed: **7 of the 10 roof-declared rows are `procedural:`
  and their generator does not run** (§10.10.c mechanism 2 = §10.10.f's S33). **One gate of three
  removed; the load-bearing one is now the build-time bake.** §10.16.e.
- ⛔ **S27 (a real material carrier)** — unchanged. `roof.setMaterial` and eleven siblings still
  REFUSE with `affectedStores: NONE`. Chat can NAME every new row and cannot APPLY one to a roof.
- ⛔ **The other 55 of Pascal's 65 material sets are NOT reproduced**, and will not be from that
  source. The route that exists is `tools/texture-pipeline/sources/materials.json` — declare a CC0
  asset, re-run the acquirer, get provenance and SHA-256s. ⚠ **Not run in this lane: it needs
  network**, and inventing manifest rows without executing the acquirer would produce exactly the
  unverifiable provenance this section refuses.
- ⚠ **`surfaces` is declared on 50 of the catalogue's rows** — the 16 file-backed and the 34
  procedural. **The remaining ~290 read NOT DECLARED, which is the intended state**, exactly as
  §10.11.c's carbon facet ships 20 measured against ~309 NOT MEASURED. ⛔ Bulk-classifying them to
  make a column look complete would be authoring claims nobody checked.
- ⛔ **No gate can check that a DECLARED surface is architecturally CORRECT.** A weak category
  plausibility assertion exists (a roof-declared row must not be `Glass` or `Fabric & Soft`) and it is
  a smoke alarm, not a fire inspection. Stated so it is never read as coverage (C70 §7.1).
- ⚠ **Memory cost, stated because textures are not free.** A procedural set is generated **once per
  material, lazily, and cached on (path × scale)** — never per element. At `1024²` a three-channel set
  is ~12 MB of RGBA; the decking rows run at `1536²`. ⛔ **Nothing is generated for a material nobody
  places**, which is why 34 procedural rows cost zero until used. The founder's session runs the WebGL
  fallback and this path touches no node-material compilation, so `§L-361-WEBGPU-TRANSMISSION-GUARD`
  is not in scope.

---

## §10.16 — ⭐ THE ROOF CAN CARRY A TEXTURE NOW, THE CHEAP FIX WAS AVOIDED, AND THE REASON THE FOUNDER STILL SEES A COLOUR IS A DIFFERENT MECHANISM (2026-08-23, lane ROOF7)

> **Stamp**: 2026-08-23 · **Lane**: ROOF7 · **Rows**: L-10020 – L-10027.
> **Slice**: **S34** — the roof metre-UV slice §10.15.f minted as *"S33"*. ⛔ **That number was already
> taken** by §10.10.f's *"S33 — build-time procedural texture generation"*, and the two are **in
> series on the same founder sentence**, so the collision is corrected here rather than tolerated
> (§10.16.f, L-10027).
> **Founder request, verbatim** (via §10.15): *"[dark roof shingles] I want this tiling by default on
> my roofs."*
> **Adds and AMENDS.** §10.15.f's *"a roof cannot carry a texture at all"* is now FALSE and is
> corrected in place; §10.15.g's S33 line is re-stamped BUILT-as-S34; §10.10.f's S33 keeps its number.
> **Proof**: `packages/geometry-roof/__tests__/RoofSlopeUvsReachMesh.test.ts` — **30 tests AT THE
> MESH**, three watched REDs **run and recorded**.

### §10.16.0 — The answer in four lines

> 1. ⭐ **A ROOF CARRIES `uv` NOW, IN METRES, MEASURED UP THE RAFTER — on ten of the eleven generator
>    entry points.** `RoofFragmentBuilder`'s `uvSpaceOfGeometry(null)` is gone; the geometry declares
>    its own space and `applyMaterialMaps` binds at `1 / realWorldSizeM`.
> 2. ⛔ **The cheap fix was avoided and PROVEN wrong by a watched RED, not by argument.** The naive
>    plan projection leaves `flat` green and fails **nine** pitched forms — the "half true, half
>    squashed" state §10.15.f named, reproduced on demand.
> 3. ⛔ **BARREL REFUSES BY NAME.** A 20-strip cylinder needs arc length, not a per-face frame. No
>    `uv`, no map, an honest flat colour, and a reason on `geometry.userData`.
> 4. ⛔ **THE FOUNDER STILL SEES A COLOUR ON `roof-shingle-asphalt-charcoal`, AND THE REASON IS NO
>    LONGER THIS ONE.** Measured: **10 roof-declared rows, all 10 map-bearing — 7 of them
>    `procedural:`, and runtime procedural generation is OFF by deliberate rollback** (§10.10.c).
>    S34 removed one gate of three in series; §10.10.f's S33 is the next.

### §10.16.a — ⛔ THE DEFECT, AND WHY BOTH HALVES HAD TO LAND TOGETHER

§10.15.f measured it exactly: `RoofFragmentBuilder.ts:197` called
`applyMaterialMaps(params, matDef, uvSpaceOfGeometry(null))` — **literally `null`** — and no roof
builder anywhere emitted a `uv` attribute. **Two independent nulls, and fixing either alone renders
nothing**: metre UVs with the argument still `null` are unread, and the geometry passed to an adapter
over a `uv`-less mesh would paint texel (0,0) across the whole roof. Both shipped in one change.

⭐ **MEASURED after** — production `uvSpaceOfGeometry(null)` sites under `packages/*/src` fall
**5 → 4**: `WallFragmentBuilder.ts:4894` (**S30**), `CurtainWallBuilder.ts:2179`/`:2229`,
`CurtainWallInstanceManager.ts:246`. **Roof is at zero.** ⚠ Re-run the grep; this is the number that
rots.

### §10.16.b — ⭐ THE PARAMETERISATION, AND WHY TEN GENERATORS COST ONE CALL

§10.15.f sized S33/S34 at *"1540 lines with ten distinct generator entry points … every one of them
would need UVs"* and warned that doing half would be worse than doing none. **Measured, the sizing was
right about the risk and wrong about the shape of the work.** All ten already funnel their finished
triangle soup through `RoofGeometryBuilder.generate()`, and the correct frame is derivable from a
TRIANGLE, which needs no generator knowledge at all:

```
h  = normalise(up x n)     — horizontal in the face plane: ALONG THE EAVE
s  = n x h                 — up-slope  in the face plane: ALONG THE RAFTER
uv = ( (p - c).h , (p - c).s )      c = geometry centroid — PHASE only, never scale
```

`h` and `s` are unit and orthogonal, so **the uv map is an ISOMETRY of every face**: one metre
travelled on the roof is one unit travelled in uv, in any direction. ⭐ **That is the entire
correctness claim, and it is the one a plan projection fails** — the plan compresses the up-slope axis
by `cos(pitch)` and leaves the eave axis alone, which is why the error is invisible on a flat roof and
41 % at 45°.

**Covered (10 of 10):** flat · shed · gable · hip · dutch-hip · gambrel · mansard · segmented (merge
path) · concave-pitched (wing decomposition) · general-pitched (ring stack). Each has its own test
row, so a routing change cannot silently drop one.

⛔ **REFUSED (1):** **barrel** — §10.16.d.

> **MUST**: a roof surface that declares metre UVs declares them for the SLOPE. **MUST NOT**: a roof
> builder adopt the slab's dominant-axis projection. It is right for a slab because a slab is
> horizontal, and it is the one thing §10.15.f singled out as a trap.

### §10.16.c — ⛔ THE SPLIT MAY NOT CHANGE A PIXEL, AND TWO SEPARATE THINGS COULD HAVE

A ridge vertex belongs to two slopes and two gable-end triangles — four planes, one vertex — so
vertices split per (vertex × frame). **Both ways that could have restyled every existing roof are
closed and tested:**

1. ⛔ **`computeVertexNormals()` after a split flat-shades the eave.** The eave-top vertex is shared
   between the slope and the vertical fascia, so today's normals are averaged across that crease.
   Duplicates therefore **COPY their source's already-computed normal**; nothing is recomputed.
2. ⛔ **`_mergeGeometries` re-runs `computeVertexNormals()` on each input it concatenates.** A split
   segment geometry would come back flat-shaded through the merge. The pass runs at the OUTERMOST
   `generate()` only; `_buildSegmentedGeometry` calls a private `_generateSegment()` instead.

⭐ **PROVEN ABSOLUTELY, not by inspection.** The public per-form statics do not run the pass, so
`generateGable(d)` **is** the pre-slice geometry and `generate(d)` is the post-slice one. The suite
expands both to a triangle soup — **positions AND normals, in draw order** — and asserts `toEqual` for
seven forms, plus that every material `group` still covers the identical index range.

### §10.16.d — ⛔ BARREL REFUSES, AND THE REFUSAL IS THE ROLLOUT BEING LEGIBLE

`generateBarrel` approximates a cylinder with **20 flat strips**. A per-face frame gives each strip
its own origin-relative axis; at a shared strip edge the two frames disagree by
`Δθ × distance-to-origin` — **metres of pattern jump, twenty times across one roof**. A cylinder is
developable and its honest parameterisation is **arc length**, which belongs inside `generateBarrel`
where the radius and the angle already exist.

So a barrel emits no `uv`, resolves `UV_NONE`, binds no map, keeps the flat colour it has today, and
records `geometry.userData.pryzmUvRefusal` naming the reason. A roof carrying a barrel **segment**
refuses as a whole. ⚠ **Barrel was never one of §10.15.f's ten** — it is the eleventh entry point, and
naming it here is the difference between a partial rollout and an unstated one.

### §10.16.e — ⛔ WHAT THE FOUNDER ACTUALLY SEES, MEASURED — THIS IS ONE GATE OF THREE

**MEASURED 2026-08-23** over `materialCatalog.ts`: **10 rows declare `surfaces` including `roof`, and
ALL TEN carry `maps`.**

| rows | source | after S34, what still stands between the row and a pattern |
|---:|---|---|
| **3** | file-backed WebP — `roof-tile-clay-012`, `roof-tile-clay-grey-015`, `shingle-timber-weathered-013` | **only the bytes.** §10.10.c measured `public/items/textures/` **absent locally**; whether R2 serves them in production is a **separate and unmeasured** question (§10.9.b). |
| ⛔ **7** | `procedural:` — the whole §10.15.e shingle family, incl. `roof-shingle-asphalt-charcoal` | ⛔ **the generator does not run.** `globalThis.__pryzmProceduralTexturesV1` is off by deliberate rollback at **150–830 ms of blocked main thread per pattern** (§PROCEDURAL-COST). **That is §10.10.f's S33.** |

⭐ **The answer to *"what happens when I put `roof-shingle-asphalt-charcoal` on a 45° roof?"* is: the
charcoal `#3a3a3c`, flat — for ONE reason now instead of two.** Set the procedural flag in that
session and the same roof tiles at **0.999 × 1.716 m measured up the rafter**, which no flag could
have produced before this slice. ⛔ **MUST NOT** close §10.10.f's S33 by enabling that flag in
production.

⚠ **AND THE DEFAULT IS STILL NOT TAKEN, deliberately (§10.15.f, L-10026).** `DEFAULT_SHINGLE` /
`DEFAULT_MATERIAL_COLOR` remains `#c8a46e`. The trade **moved** — tiling is now possible — but it did
not resolve: *"charcoal by default"* would restyle every roof in every existing project and still tile
for **none** of the seven shingle rows the founder named. A test pins `#c8a46e` so the change has to
be made on purpose.

### §10.16.f — ⛔ THE SLICE NUMBER COLLISION, AND WHY IT MATTERED HERE SPECIFICALLY

**§10.10.f (2026-08-21, MAT2) minted "S33 — BUILD-TIME procedural texture generation." §10.15.f
(2026-08-23, PASCALMAT58) minted "S33 — metre UVs for the roof SHINGLE face."** Each lane took *"the
next number"* from the section it was writing rather than from the whole slice list.

⚠ **They are not merely two slices with one name — they are the two remaining gates IN SERIES on one
founder sentence** (§10.16.e). *"S33 is done"* would have been ambiguous in exactly the case where the
distinction decides whether a pattern appears. **The roof slice is S34**; §10.10.f's S33 keeps its
number because it was minted first.

⭐ **This is C100's own recurring defect one level down** — a number transcribed into prose rots — and
the mitigation that exists for CONTRACT ids (`check-contract-index-equivalence.ts`, comparing SETS in
both directions, never a count) **has no equivalent for SLICE ids.** Named as an absence rather than
left as one.

### §10.16.g — What is proven AT THE MESH, and what is not

✅ **PROVEN** (`RoofSlopeUvsReachMesh.test.ts`, 30 tests, the real `RoofFragmentBuilder` driven
through the real `FrameScheduler` into a real `THREE.Scene`):

- a roof mesh's **slot-3 material** carries `map` / `normalMap` / `roughnessMap` at
  **`1 / realWorldSizeM`**, the size READ FROM `MATERIAL_CATALOG`;
- the geometry **declares** `metres`, and a second product at a different size tiles differently on
  the identical roof;
- ⭐ the eave→ridge uv edge on a 45° roof measures **5.657 m (4·√2)**, not **4 m** — and the course
  count up the rafter is **√2 ×** the plan-projection answer;
- the shingle surface is **isometric edge-by-edge** on all ten covered forms;
- barrel **refuses** on all four observable axes;
- the rendered triangle soup — positions **and** normals — is **bit-identical** to the pre-slice
  geometry on seven forms, and the material groups are unchanged.

⭐ **WATCHED RED, RUN AND RECORDED** — RED-A (`uvSpaceOfGeometry(null)`, i.e. the code as it stood
that morning) **14 failed / 16 passed**; RED-B (the naive plan projection) **13 failed / 17 passed**,
with `flat` staying GREEN, which *is* the "half true, half squashed" argument demonstrated; RED-C
(recompute normals after the split) **8 failed / 22 passed**.

⛔ **NOT PROVEN, and not claimed** (C70 §7.1 — never an inherited green):

- **No pixel was measured.** There is no visual test; every assertion stops at the constructed
  `THREE.Material` and the `uv` attribute on a mesh in a scene.
- **Nothing here proves the seven procedural rows draw** — §10.16.e says the opposite.
- **Nothing here proves a file-backed roof map RESOLVES from a browser** (bytes, CORS — L-578).
- **The `uv` PHASE is unproven as an aesthetic** — courses are correctly SIZED and start wherever the
  geometry centroid puts them. No rule aligns a course to the eave line; that is a real gap and it is
  §10.16.h.
- **`aoMap` is still unbound** — it samples `uv1`, which this geometry does not emit (S32 unchanged).

### §10.16.h — Slice states after this lane

- ⭐ **S34 (roof metre UVs) — BUILT**, 10 of 11 entry points; barrel refuses by name (§10.16.d).
- **§10.10.f's S33 (build-time procedural bake) — UNCHANGED and now the LOAD-BEARING one** for the
  founder's sentence: 7 of the 10 roof rows are behind it (§10.16.e).
- **S30 (wall metre UVs) — UNCHANGED.** The wall's six body constructors are a different problem
  (§10.10.f) and this lane's per-face frame does not transfer to it: a wall's material is built ONCE,
  before the body arm is chosen, so the geometry is not in hand at material time. ⚠ **The roof's fix
  works because `RoofFragmentBuilder` builds the geometry FIRST and the material SECOND.** That
  ordering, not the arithmetic, is the transferable finding.
- **S27 (a real material carrier) — UNCHANGED.** `roof.setMaterial` still REFUSES with
  `affectedStores: NONE`. ⚠ Chat can NAME every roofing row and cannot APPLY one. The reachable path
  today is `CreateRoofCommand`'s `materialId` → `RoofData.materialId` → this builder.
  ⚠ **Two scene-traversal re-material paths also stop refusing on roofs with no edit** —
  `PropertyInspector.onMaterialChange` and `initUI`'s visual-style sweep both already pass
  `uvSpaceOfGeometry(child.geometry)`, which was `UV_NONE` for every roof and is now `metres`. ⛔ **Not
  claimed as a win, because both then assign `child.material = new MeshStandardMaterial(...)` — a
  SINGLE material over a roof's four-slot array.** That flattening is pre-existing and is NOT this
  lane's; it is recorded because those two paths change behaviour on roofs as a side effect of the
  stamp, and a reader is owed that rather than a discovery.
- **NEW, small, named: arc-length UVs for the barrel vault.** ~20 lines inside `generateBarrel`
  (`u = distance along the vault axis`, `v = R·θ`), plus a decision about the end-cap vertices it
  shares with the arc. Not attempted here; refusing was cheaper and honest.
- **NEW, named: no rule aligns a shingle course to the eave.** §10.16.g. A phase convention (v = 0 at
  the eave ring) is a further slice and is the difference between "correctly sized" and "correctly
  laid".
- **S24, S25, S26, S31, S32 — UNCHANGED.**

---

## §10.17 — ⭐ THE **INSTANCE** LAYER EDITORS: §10.12's FINDING, TWO TIERS DOWN — AND THE TWO FAMILIES PAINT A LAYER BY OPPOSITE RULES (2026-08-23, lane LAYERMAT10)

### §10.17.0 — The answer in four lines

1. §10.12 found that *"the surfaces which AUTHOR a finish could not NAME a material"* for
   door and window. **MAT50 then fixed the wall TYPE editor (§10.13 / L-8610) and the wall
   and slab INSTANCE editors were never touched.** The founder found them.
2. `WallLayersEditor` / `SlabLayersEditor` now carry the SAME picker —
   `buildFinishMaterialSelect`, no third control minted (C68 §7.c).
3. ⭐ **Establishing the precedence turned up a genuine disagreement between two element
   families**, recorded in §10.17.b. It is not a defect this lane could fix and it is not
   papered over: the UI states each family's measured rule.
4. Overrides are marked with a one-click reset per §2.2 / §10.12.e, and **no new field
   encodes "is override"** — so there is no codec change.

### §10.17.a — ABSENT, not UNREACHABLE — and the measurement that settled it

C01 §6 rule 6: the two have opposite fixes, so the question is asked before building.

```
grep materialId apps/editor/src/ui/property-panel/*.ts
  -> CurtainSubElementPanel.ts, FinishTypeDraftIntent.ts    (0 hits in either layers editor)
packages/geometry-wall/src/WallDataSchema.ts:178   materialId: z.string().optional()
packages/geometry-slab/src/SlabTypes.ts:82         materialId?: string
```

Both schemas have carried the field all along, and both save pipes are **verbatim
passthroughs** — `element.changeType` → `UpdateSlabLayersCommand` does
`structuredClone(payload.layers)`; `UpdateWallSystemTypeCommand` spreads them onto the
snapshot. **Nothing needed rewiring. The fix was a control**, exactly as §10.12 found one
tier up and §10.13 found one family over. That is three consecutive lanes finding the same
shape at a different altitude, which is the pattern worth naming:
**a schema field is not a feature until a surface can write it.**

### §10.17.b — ⛔ THE PRECEDENCE: **WALL AND SLAB DISAGREE**, measured at the builders

| family | the expression that decides a layer's colour | winner |
|---|---|---|
| **slab** — `packages/geometry-slab/src/SlabFragmentBuilder.ts:692` | `layerMasterHex ?? layer.materialColor ?? data.materialColor ?? '#909090'` | **the MATERIAL** |
| **wall** — `packages/geometry-wall/src/WallFragmentBuilder.ts:2118` and `:2586` | `sideOverride ?? layer.materialColor ?? wall.materialColor ?? WALL_DEFAULT_BODY_COLOUR` | **the layer COLOUR** — `layer.materialId` is **not read by the wall builder at all** |

⛔ **So a single shared sentence in the UI would be FALSE for one of them.** Telling a slab
user *"your colour overrides the material"* is wrong; telling a wall user *"the material is
painted"* is wrong. A swatch that silently does nothing is the §CONTEXT-DATA-HONESTY
failure — refusal and success rendered identically — and this contract has logged that shape
repeatedly. Each LAYERS table therefore carries **its own measured sentence**, tooltipped
with the full chain and the `file:line` that settles it, and a diverged layer is badged with
which of the two is actually on the mesh: `overridden` (wall) vs `material wins` (slab).

⚠ **NOT RECONCILED, AND DELIBERATELY SO.** Making the two builders agree is a rendering
change in two packages this lane does not own, and it would move pixels on every existing
wall or slab. It is recorded as a question for whoever owns that reconciliation, with the
evidence attached, rather than resolved by an unmeasured edit. **The declaration table
`LAYER_COLOUR_PRECEDENCE` is the one place the answer lives** (C84 EI-9), and it carries the
`file:line` so re-measuring is cheaper than trusting it.

### §10.17.c — The reference and the hex move together, and for walls that is load-bearing

§10.12.b's rule applies unchanged: picking a material writes `materialId` **and** brings
`materialColor` to that master row's exact value, in one change, repainting the visible
swatch. ⭐ **On a wall it is the only reason the material reaches the mesh at all**, since
the wall builder reads only the hex — so what is a correctness rule for openings is a
*functional* requirement here.

### §10.17.d — ⚠ THE STALE-MARK CASE, and why the control returns `{el, repaint}`

The override state IS `materialColor ≠ masterHex(materialId)` (§10.12.e) — derived, never
stored. But `materialColor` is edited by a control the material cell does **not** own: the
row's `<input type="color">`. **A badge painted once at build time is correct on first
render and WRONG the instant the swatch moves** — an override with no mark, which is §2.2's
MUST inverted. The cell therefore exposes `repaint()` and both editors call it from their
colour handler, rather than duplicating the divergence test in two files.

### §10.17.e — What is NOT closed, named rather than left as an absence

- ⛔ **T2 ("My Materials") is still absent from this picker**, unchanged from §10.12.g and
  §10.14.f — it is a property of `FinishMaterialSelect`, not of this wiring.
- ⛔ **The two builders still disagree** (§10.17.b). The UI is honest about it; the model is
  not yet consistent.
- ⚠ **A slab layer's material reaches the mesh through TWO independent routes** (the
  `materialMap` branch and the resolved hex) while a wall layer's reaches it through one.
  Nothing here changed that; it is why the two tables' sentences differ.

Proof: `apps/editor/src/ui/property-panel/__tests__/instanceLayerMaterial.spec.ts` — **19/19**,
driving the real editors, the real picker and the layers that reach `onSave`.

