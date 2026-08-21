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
