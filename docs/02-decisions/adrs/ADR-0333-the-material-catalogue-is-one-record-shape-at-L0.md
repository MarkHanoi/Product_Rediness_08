# ADR-0333 — The material catalogue is ONE record shape at L0; the THREE library is a projection of it

- **Status**: ACCEPTED — 2026-08-18
- **Date**: 2026-08-18
- **Deciders**: founder request (*"we should have a MASTER MATERIAL DATABASE and all elements should
  be fed from this… no duplication… stored sound… adapted and ready via UI + AI"*), architecture lane ZA
- **Supersedes**: nothing. **EXTENDS [ADR-0217](ADR-0217-type-catalog-scope.md)** — whose ruling
  *"Layer references material by `materialId`; no duplication"* is **RETAINED AND STRENGTHENED**, not
  revisited. ADR-0217 decided the **reference model**; it never decided the catalogue's **layer**, its
  **record shape**, or **what happens when the reference does not resolve**. Those three are this ADR.
- **Evidence**: `grep -c 'params: {' packages/core-app-model/src/materialLibrary.ts` → **204**
  (two prior counts of "~140" and "129" were indentation artefacts, §3). Six-source census in
  [C85](../contracts/C85-MASTER-MATERIAL-DATABASE.md) §4. Colour-fidelity measurement for the six
  float-triplet entries: worst-case **0.951 of one 8-bit sRGB step**, computed against the
  repository's own THREE **r183**, not asserted (§4). Gate + controls: see C85 §7 and the minting
  lane's report; every control was **watched RED first**.
- **Constrains**: `packages/schemas/src/materials/**` · `packages/core-app-model/src/materialLibrary.ts`
  · `packages/core-app-model/src/stores/UserMaterialStore.ts` ·
  `packages/geometry-kernel/src/producers/_internal/composeMaterialKey.ts` ·
  `packages/ai-host/src/intents/finishRef.ts` · all 18 `plugins/*/src/committer/material-bridge.ts` ·
  every future proposal to add a material table
- **Subordinate to**: [C65](../contracts/C65-ELEMENT-TYPE-SYSTEM.md) (ACTIVE) — the tier model, project
  scoping and *"a missing type MUST be visible, never a silent default"* (§3.4) are C65's, and this ADR
  mints no rival vocabulary for any of them. Also to [C03](../contracts/C03-SCHEMAS-COMMANDS-AND-STATE.md)
  §1.1/§1.2 (the schema's home and its purity) and [C16](../contracts/C16-COMMAND-AUTHORING-PROTOCOL.md)
  §5.1 CA-21 (liveness is proven by an executed read-back).

## The ruling

> **The material catalogue is ONE record shape — plain scalars, no THREE — and it lives at L0, beneath
> every consumer. `STANDARD_MATERIAL_LIBRARY` remains the public THREE-typed accessor but becomes a
> DERIVED PROJECTION holding no data of its own. An element references a material by `materialId`; a
> resolved colour is a cache; and when a reference does not resolve, the result is a NAMED UNRESOLVED
> state, never a plausible-looking default.**

## Context

### The duplication was FORCED, not chosen

A census found **eight** live vocabularies for one concept — three more than the brief named. The
tempting reading is eight lapses of discipline. The measurement says otherwise: **four of them share one mechanical cause.**

`packages/core-app-model/src/materialLibrary.ts` line 1 is
`import * as THREE from '@pryzm/renderer-three/three'`, and every entry's colour is a `THREE.Color`
constructed at module load. **Any consumer that must stay THREE-free therefore cannot import the
master at all.** That set is not marginal — it includes `geometry-kernel`, which has **zero** THREE
imports by design and which is *the package that composes the material key and thereby decides the
rendered colour*.

The repository had already written the diagnosis down, in `finishRef.ts`'s own header:

> *"Transcribed, not imported: materialLibrary constructs `THREE.Color` instances at module load, and
> this resolver is pure."*

An honest comment explaining a copy is still a copy, and it is the strongest available evidence that
the copy was forced. A rule saying *"do not duplicate the material table"* laid over that arrangement
is **unsatisfiable** — §UNSATISFIABLE-GATE-DECOMPOSITION-IS-THE-FIX. Decompose first; then the rule
can be obeyed.

### The record shape did not need inventing — it already existed

The largest risk in this work was minting a ninth table while claiming to remove eight. It was
avoided by a census finding rather than by care: **`UserMaterialStore.UserMaterialDef` is already the
THREE-free shape**, `{ id, label, category, color, metalness, roughness, opacity, transparent,
textureUrl?, source }`, with a docstring stating the reason — *"deliberately NOT a THREE.Material, so
the store stays pure and persistable"* — and it is already persisted through `ProjectSerializer` /
`ProjectLoader` and already displayed by `MaterialsBucket.ts`.

So the built-in catalogue adopts **that** shape rather than a new one, and the two tiers C65 §2
defines (T1 built-in, T2 project) become one vocabulary discriminated by `source`, instead of two
shapes that happen to describe the same thing.

### The adapters were not the duplication, and counting files said they were

Eighteen `material-bridge.ts` files look like eighteen palettes. Reading them shows they are **key
parsers**: split a `MaterialKey` on `|`, take the colour slot, build a `MeshStandardMaterial`. Under
the test *"does a master recolour force an edit here?"* the answer is no — they are adapters, and
they stay. **This is the finding that a file count would have got backwards**, and it is why C85 §3
states the test rather than a quota.

⚠ Two things inside them were still wrong, and both were *discarding information already present*:
`plugins/handrail/.../material-bridge.ts` ignores its `key` argument entirely and returns one brown
for every handrail — while the producer emits `handrail|${materialId}|rail`, id included; and the
wall bridge degrades to beige on a malformed key with no diagnostic.

⚠ And the *justification* written in the door/window bridges — *"plugin must not import
core-app-model"*, *"respects the L7→L6 boundary"* — is measurably false. Plugins are L6,
`core-app-model` is L2, L6→L2 is downward, and **27 such imports already exist under `plugins/`**.
The false rule had already propagated into `SPEC-MATERIALS-REPOSITORY` §0 and from there into further
files, which is why it is corrected at its source.

### A field name is not a vocabulary

⚠ `materialName` looked like one stray enum to delete. Measured, it is **one field name carrying
three unrelated meanings**: a closed physical-semantics union on handrails (whose own header says
*"the name carries roughness / metalness / transparency"*), free-text prose absorbed from room
finishes on room/floor/ceiling, and a style-keyed prose palette in `floorFinish.ts`.

⭐ And the information-loss risk is **not** the obvious one. Referencing does not lose the physical
scalars — `MaterialRecord` carries `metalness`, `roughness`, `opacity` and `transparent`, so mapping
a name to a *record* GAINS information (mapping it to a *hex* would lose it). What would be destroyed
is **acoustics**: `packages/physics-host/src/PhysicsEngine.ts:62` derives an NRC coefficient by
keyword-matching that prose, and the master has no acoustic facet. The migration is blocked on a
facet, not on effort — and finding that out is why a census has to read the CONSUMERS, not just
count the declarations.

## Decision

1. **`MATERIAL_CATALOG` at `packages/schemas/src/materials/` (L0) is the single built-in material
   vocabulary.** Plain scalars; no THREE, no DOM, no I/O; satisfies P5.
2. **One record shape, `MaterialRecord`, adopted from `UserMaterialDef`**, discriminated
   `source: 'builtin' | 'user'`. T2 (`UserMaterialStore`) is not replaced; it is typed as the user
   member of the union.
3. **`STANDARD_MATERIAL_LIBRARY` is DERIVED** from `MATERIAL_CATALOG` and MUST hold no literal
   material data. Its public accessors — `STANDARD_MATERIAL_LIBRARY`, `StandardMaterialDef`,
   `MaterialCategory`, `findMaterialById`, `materialHexById` — keep their names, signatures and
   behaviour, because a concurrent lane consumes them mid-flight.
4. **Resolution order is T2, then T1**, so a user material may shadow a built-in id (C65 §2.2).
5. **`materialId` is the identity; a stored hex is legal only as an explicit user OVERRIDE**, and
   must be distinguishable as one. Precedence: override → `materialId` resolved → NAMED UNRESOLVED.
   Per C73 §1: `materialId` and an override hex are **PERSIST-OR-LOSE**; resolved colour and the
   `THREE.Material` are **REGENERABLE**.
6. **`composeMaterialKey` resolves `materialId` against the catalogue** instead of substituting
   `#d4c5b0`. This is the one point that decides the rendered colour for every family, and moving the
   resolution there is what closes the coverage gap without touching eighteen plugins.
7. **An unresolved material is a named, deduplicated diagnostic and a visibly-wrong colour** — never a
   plausible default, never a throw (C65 §3.4, C73 §4).
8. **No material capability family ships without a real batch carrier.** The carrier is absent today
   and that is stated rather than worked around.

## Consequences

**Good.** One vocabulary, reachable from L0 upward, with the THREE dependency confined to a
projection. Editing a master row now changes every element that references it, everywhere, with no
migration — which is the property *"all elements should be fed from this"* actually names. Families
that previously read no library at all resolve master materials because the resolution moved to the
kernel, not because eighteen adapters were rewritten.

**The cost, stated rather than buried.** Because reference wins, a library edit **does not** reach an
element carrying an explicit override hex. That is correct — a user who set a colour deliberately does
not want it silently undone — but it is only safe if the override is *visible as an override*, so C85
§6.1 makes that a MUST. An invisible override and a stale copy are the same value, which is the
failure mode this whole ADR is about, reappearing one level up.

**A measured colour change on six entries.** Six library rows use the float-triplet
`new THREE.Color(r, g, b)` form, which has no exact 8-bit hex. Converting them through THREE r183
moves the worst one by **0.951 of a single 8-bit sRGB step** — below the quantisation the display
pipeline already applies, i.e. not observable, but **not zero**, and a claim of "lossless" would have
been false. The other 198 are bit-identical.

**Three sources are not closed by this ADR, and each names its blocker.** `RENDER_MATERIAL_LIBRARY`
(5 of its 18 ids have no master row — a *design decision*, and guessing it would mint the seventh
table); the `materialName` enums on `HandrailTypeStore` / `CeilingTypes` / `FloorTypes` (a schema
change, and `HandrailTypeStore` is owned by a concurrent lane); and the AI family (no carrier).

**Documents that must follow** — not this ADR's territory, listed so they are not forgotten:

1. `docs/02-decisions/contracts/README.md` — C85's row, **and** row 4's range extended to `C01–C85`,
   in the minting commit. The index calls a file-without-a-row a defect.
2. `SPEC-MATERIALS-REPOSITORY.md` — corrected in place: the entry count, the false L7→L6 boundary,
   and its promotion target (it names "C16-MATERIALS-CONTRACT"; **C16 is taken** — the target is C85).
3. `SPEC-05-TYPE-CATALOG.md` §4 — its `MaterialSchema` and C85 §1.1's `MaterialRecord` describe one
   entity at different levels of ambition (SPEC-05 adds thermal/acoustic/cost/hatch/IFC). They must be
   reconciled as **one schema with optional facets**, not left as two.
4. The C65 §3.3 breach on `UserMaterialStore` — it registers with `projectScopeRegistry` but does not
   appear in `declaredProjectScopes.ts`. Found while writing C85 §4.6; owned by C65.

## Alternatives rejected

**Keep `STANDARD_MATERIAL_LIBRARY` as the master where it is, and forbid copies by rule.** Rejected:
the rule is unsatisfiable while the master is unreachable from THREE-free code. This is the status
quo that produced four of the six sources, each with an honest comment explaining why it had to
duplicate.

**Put the catalogue in `core-app-model` as a THREE-free sibling module.** Rejected: `geometry-kernel`
does not depend on `core-app-model` and should not — it is a pure math package with zero THREE
imports. The consumer that decides the pixel would still be unable to read the master, which is the
entire defect.

**Mint a new `packages/material-library` (as ADR-0217 §Storage anticipated).** Rejected **for now**:
that package does not exist, and creating a seventh location while removing six is exactly the
failure this work exists to prevent. L0 `schemas` is already a declared dependency of the decisive
consumers and already the contractual home for canonical entity schemas (C03 §1.1). If ADR-0217's
package is later built, the catalogue moves as a unit — a move, not a fork.

**Materialise: copy the resolved hex onto every element at assignment time.** Rejected: it makes a
library edit unable to reach placed elements, which contradicts ADR-0217, SPEC-05 §4.3 and the
founder's ask in the same breath. Two elements both "Oak" would render differently depending on when
they were placed. ⚠ Note this is the *opposite* of the ruling for **types** (`CatalogueFamilies.ts`
records that a type is materialised whole into fields) — deliberately, because a type is a starting
point an author diverges from and a material is a shared name the project agrees on.

**Ship the AI material family now, resolver-first, and wire the carrier later.** Rejected under
`DimensionFamilies`' own rule and C68 §5.a. Every `*.setMaterial` verb but two carries disposition
`REFUSES` with `affectedStores: NONE` — ADR-0117's twelve handlers, this repository's canonical
`§FIX-MATERIAL-DEAD-DISPATCH` exhibit. A resolver over dead verbs answers in chat and changes
nothing: green tests, no capability.
