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
- **S11** — SPEC-MATERIALS-REPOSITORY §3.2–§3.5: textures, per-element assignment, the schedule, IFC.
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
with no gate is a wish. Four shrink-only arms, baselined at the 2026-08-19 measurement:
**ARM A** a schema with a colour field and no `materialId` · **ARM B** a stored `materialId` that
resolves to nothing · **ARM C** a producer minting a key without the master resolver · **ARM D** a
per-family serializer that does not persist `materialId`.

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
check `ProjectLoader`'s read side, only the write side; it does not measure IFC/GLB material export
at all; and it cannot tell a *deliberate* family default from a *forgotten* one. Per C70 §7.1 those
four axes are **UNPROVEN**, never green.

### §9.8 — Slices

| slice | what | state |
|---|---|---|
| **S13** | `materialLibrary.ts`'s four `0x` wall presets: master row, or C04 view style? | NAMED, blocked on a design decision |
| **S14** | Reconcile drifted ids to master ids (ARM B → 0) | OPEN — prerequisite for S16 |
| **S15** | Persist `materialId` in the five serializers that drop it (ARM D → 0) | OPEN — coordinated with the persistence lane |
| **S16** | Route every producer's colour slot through the resolver (ARM C → 0) | OPEN — blocked on S14 |
| **S17** | `door` + `window` gain `materialId` (ARM A → 0), with a real carrier per §6.2 | OPEN — largest, and C67/C68-bound |
| **S18** | IFC `IfcRelAssociatesMaterial` (C25) | OPEN — nothing reaches export today |
