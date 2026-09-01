# C65 — Element Type System

**Status:** ACTIVE (normative) · **Established:** 2026-08-09 · **Founder request:** 2026-08-09
**Owns:** what an element TYPE is, where it lives, how it is created, and how it survives a save.
**Does not own:** how an INSTANCE is created (that is [C11](./C11-ELEMENT-CREATION-PIPELINE.md)),
nor how an element is drawn (that is [C09 §4](./C09-AI-AND-VISIBILITY-INTENT.md) and Contract-23).

**Related:** [ADR-0309](../adrs/ADR-0309-element-types-are-project-state.md)

---

## §1 — Why this contract exists

The founder, 2026-08-09:

> "I want to enable robust element NEW TYPE creation. For walls: the user selects WALL → in the
> wall type dropdown they pick **NEW TYPE** or **DUPLICATE**. The modal is not project-compliant —
> **it falls back to default, which is not correct.** The element types must be saved in the user
> project/session — when the user re-opens the project, all new types created must remain, robustly.
> This should be done for ALL elements — windows, doors, curtain walls, floors, ceilings, slabs,
> columns, beams, stairs, ideally absolutely all, even beds."

A **type** is the reusable definition an instance points at: a wall's layer stack and thickness, a
door's leaf and frame, a window's operation and glazing, a bed's dimensions and asset. Every mature
BIM tool has this concept; PRYZM has parts of it, per family, with no single rule governing where a
type lives or whether it is ever saved.

This contract exists because the failure the founder describes — *"it falls back to default"* — is
not a UI bug. It is the absence of a stated answer to **"is a type project state?"**. Without that
answer each family answered differently, and the ones that answered "no" silently discard the
user's work at the next project open.

---

## §2 — The four tiers (normative)

Every type resolvable in the product belongs to **exactly one** tier:

| Tier | Lives in | Editable by user | Survives project close | Shared across projects |
|---|---|---|---|---|
| **T1 — Built-in** | application code | ✗ | n/a | yes (ships with the app) |
| **T2 — Project** | the project snapshot | ✓ | **✓ — this is the founder's requirement** | ✗ |
| **T3 — User library** | per-user storage | ✓ | ✓ | yes (that user) |
| **T4 — Marketplace** | plugin / family pack | ✗ (consumed) | ✓ | yes (published) |

**§2.1 — T2 is mandatory and is the subject of this contract.** T3 and T4 are DECLARED HERE so the
architecture leaves room for them, and are **explicitly out of scope** until T2 is complete. A T2
implementation that makes T3 impossible later is a design failure; a T2 implementation that does
not ship T3 today is correct.

### §2.0 — ⭐ **T0 — THE DEFINITION TIER, DECLARED ABOVE T1** (added 2026-09-01, lane EXT · audit §6.2 / §3.2 · ADR-0376 D5)

> **§2.1 extends the architecture's room DOWNWARD, to T3 and T4, and says so.** The same courtesy is
> owed **upward**, and it was never paid: this contract's four tiers all answer *"where does a type
> LIVE?"* and none answers *"where does the thing a type is a CONFIGURATION OF live?"* **That is a
> different question, and leaving it unasked is how the repository ended up with the answer being
> `WindowBuilder.ts`.**

| Tier | What it is | Lives in | Authorable at runtime |
|---|---|---|---|
| **T0 — Definition** | the parametric **thing itself**: its parameters, its geometry rules, its material slots, its host requirements. A Type (T1–T4) is a **named set of VALUES over a Definition.** | ⚠ **for elements: NOWHERE — see below.** For the component model: `packages/file-format/src/family-schema.ts` (`FamilyDocument`) | ⚠ split — see §2.0.2 |
| **T1–T4** | as §2 | as §2 | as §2 |

#### §2.0.1 — ⛔ MEASURED: elements have **no** definition tier, and that is the whole cost

```
grep -rl "ComponentDefinition" packages apps plugins --include=*.ts   ->  0
grep -rl "SemanticClass"       packages apps plugins --include=*.ts   ->  0
```

**An element kind IS a compiled Zod schema** — not data, not authorable, not versionable per
project. There is no T0 to sit a T2 type on top of, which is why §3.5's *"ONE abstraction, not N
stores"* has to be re-argued for every family: `ElementType` is a payload keyed by a family name,
because the family itself is code.

⭐ **The cost, stated as a number rather than a worry:** the "definition" of a window is
`WindowBuilder.ts` — **2,086 lines of hand-written TypeScript, one per family** — so *a second
family costs a second two-thousand-line builder.* **T0's absence is the reason the type system
scales linearly in engineers.**

#### §2.0.2 — WHERE T0 IS ALREADY BUILT, AND WHY C65 DOES NOT ABSORB IT

A complete, Zod-pure, content-addressed, signed, migrating T0 **exists** — the component document
model in `packages/file-format/src/family-schema.ts`, with typed parameters, an expression
resolver, material slots, reference planes and solid features. It is not reachable from
`apps/editor` (that is the programme's headline gap, not this contract's).

> **§2.0.2a — MUST. C65 declares T0; it does not define it.** The Definition model is the subject of
> its own contract, **C111**, exactly as T4 is C07/C40's subject rather than C65's. This section
> exists so that *"is there a tier above Type?"* has a written answer of **yes, and it is somebody
> else's to specify** — never an answer inferred from C65's silence, which is the inference §2.1
> was written to prevent one direction over.

> **§2.0.2b — MUST. `Component` is the vocabulary here** (**ADR-0376 D5**). The `family-*` package
> names and the `.pryzm-family` extension are **FROZEN legacy spellings** — wire/identity names
> under C69 §1.1, not renamed — and **no NEW symbol in this contract's scope may use `Family`.**
> ⛔ The equivalence `FamilyDefinition ≡ ComponentDefinition` is declared **once**, in C111, and is
> deliberately **not restated here** (C84 EI-9: a decision written twice is a decision that will
> diverge).

> **§2.0.2c — MUST. A T2 type over a T0 definition still obeys every rule in §3.** Project state
> (§3.1), commands only (§3.2), declared scope (§3.3), **visible unresolved state (§3.4)**, one
> abstraction (§3.5), edit-propagates-to-instances (§3.6), deep-copy duplicate (§3.7). ⭐ **§3.4 is
> the one that gets harder and matters most**: a T2 type can dangle its **definition** as well as
> its id, and *"this component's definition is missing"* MUST be as visible and as
> non-destructive as *"this type is missing."* **Two unresolved states, both named, neither a
> silent default.**

> **§2.0.2d — MUST NOT.** No family may gain a *"New definition"* affordance before §3.9's rule is
> satisfied for it — creation, persistence and restore all wired. **T0 is where an orphan
> affordance is most expensive**, because a definition is not minutes of a user's work, it is the
> thing their other work points at.

**§2.2 — A type created by a user in a project is T2 BY DEFAULT.** "Promote to library" (T2 → T3)
is a later, explicit user action. Silently writing a user's type outside the project is a privacy
and isolation error ([C22](./C22-PRIVACY-AND-PII-TIER.md), [C13](./C13-PROJECT-LIFECYCLE-AND-ISOLATION.md)).

---

## §3 — Binding rules

These follow from existing contracts. They are restated here because the code has diverged from
several of them, and because "types" is the seam where the divergence becomes user-visible data loss.

### §3.1 — A type is PROJECT STATE and MUST round-trip the snapshot (C05)

A T2 type MUST be written by `ProjectSerializer` and restored by `ProjectLoader`. **A type that
exists only in a runtime store is lost at the next project open, and the user is not told.**

⚠ Adding a type collection to the snapshot is a FILE-FORMAT change: it requires a `SCHEMA_VERSION`
decision and, if the shape can appear in older snapshots, a migration
([C47](./C47-FILE-FORMAT-VERSIONING.md)). A snapshot written by a newer client and opened by an
older one MUST degrade honestly, never silently drop the types.

### §3.2 — Types are created, edited, duplicated and deleted through COMMANDS (P6, C16)

No UI may write a type store directly. Each mutation is a command per
[C16](./C16-COMMAND-AUTHORING-PROTOCOL.md), with a working inverse, so type authoring is undoable
like every other edit. A type change that cannot be undone is not acceptable: it is often several
minutes of a user's work.

### §3.3 — The T2 store MUST be project-scoped and DECLARED (C13 §3.10, §3.11, ADR-0298)

The type store MUST register with `ProjectScopeRegistry` and appear in `declaredProjectScopes.ts`
with `resets`/`counts` declarations. **A store that registers no `clear` MUST fail a test** (C13
§3.10). Without this, types leak across projects — the exact defect class the isolation audit
caught twice in the last week (L-752, L-713).

### §3.4 — A MISSING type MUST be visible, never a silent default

⚠ **This is the founder's complaint, generalised, and it is the most important rule here.**

If an instance references a type id that no longer resolves — deleted, never restored, from a
newer file, from an uninstalled pack — the product MUST NOT quietly substitute a default and carry
on. That makes "your type was lost" and "this element is a default wall" the same value, which is
the `§CONTEXT-DATA-HONESTY` failure this repository keeps paying for (L-716, L-752, L-779).

The instance MUST resolve to an explicit **unresolved-type** state that is:
- visible in the UI (the element is drawn, but marked),
- distinguishable from a deliberate default,
- reported once per project load with the count and the missing ids,
- **non-destructive**: an unresolved type MUST NOT be overwritten by an autosave that would
  discard the reference.

### §3.5 — ONE abstraction, not N stores

There MUST be a single `ElementType` concept — identity, name, family, provenance/tier, and a
family-specific payload — with the family payload validated by its own schema
([C03](./C03-SCHEMAS-COMMANDS-AND-STATE.md), L0 Zod, pure).

⚠ **N divergent per-family stores is how this repository's drift begins.** In the last week alone:
three plan-limit tables that disagreed (L-756, silent data loss), two typology id lists that
disagreed (a residential request silently produced an apartment), two copies of one style resolver
that disagreed (L-777). The spine stays element-agnostic; specialise only inside the family module.

Adding a family MUST be a registration, not a branch. `if (family === 'wall')` in shared code is a
violation.

### §3.6 — Editing a type affects every instance of it (normative)

PRYZM follows Revit semantics: a type edit propagates to all instances referencing it. This is
powerful and dangerous, so:
- the UI MUST state the instance count before applying an edit,
- the edit MUST be a single undoable command (§3.2),
- **DUPLICATE is the safe path** and MUST be offered alongside edit whenever instances exist.

### §3.7 — Duplicate is a deep copy with a new identity

A duplicated type MUST NOT share mutable structure with its source (a layer array edited in one
must not change the other), MUST receive a fresh id, and MUST resolve a non-colliding name
deterministically.

### §3.8 — The creation surface is a real editor, not a form

For families with internal structure (wall, floor, ceiling, slab, curtain wall, roof), the modal
MUST show what is being built: an ordered layer stack with per-layer thickness and material, and a
**visual section/plan preview** that updates as layers change. Total thickness MUST be derived from
the layers, never entered independently — two sources for one number is §3.5's defect at field
scale.

For the **hosted-opening families (door, window)** a type is not a layer stack: it is a set of
**named finish slots** (door: frame + leaf; window: frame + sill) plus a glazing opacity, with
ride-along data (standard dimensions, leaf segments, sidelight, tags) the user does not re-enter.
Their editor MUST show the finish slots with a live preview, and everything it does not show MUST
**carry verbatim** through duplicate — a duplicate that re-enters only the visible fields is a
lossy copy, which violates §3.7. The slots are DECLARED per family
(`ElementTypeAuthoringRegistry.finishEditor`) and rendered by ONE generic editor
(`FinishTypeEditorModal`), never by a per-family branch (§3.5). *(Added 2026-08-10 when door and
window became authorable; the section previously described only the layered families.)*

Accessibility is not optional ([C43](./C43-ACCESSIBILITY.md)): keyboard-complete, AA contrast,
focus order following visual order.

### §3.9 — No affordance without an implementation

⚠ A family MUST NOT offer "New type" / "Duplicate" unless creation, persistence and restore are all
wired for it. A menu entry that produces nothing is worse than a missing one: it reads as done and
this codebase has repeatedly shipped exactly that (a 23-gate CI suite invoked by nothing, 424 OTel
spans with no provider, an IFC4X3 exporter behind a slot that throws, `requirePlan()` with zero call
sites). **Ship families one at a time, fully.**

---

## §4 — AS-IS

**Verified 2026-08-10 for wall, door, window** (read at the code, per file — not inferred). The
remaining families stay PENDING on the three-axis audit (EXISTS · WIRED · PERSISTED,
`agent/c12-element-types`) and MUST be recorded here from that audit, not assumed.

| Family | Store (T1+T2) | C13 scope | C05 round-trip | Commands (§3.2) | UI authoring |
|---|---|---|---|---|---|
| **wall** | `@pryzm/geometry-wall` `WallSystemTypeStore` | ✓ `wallSystemTypeStore` | ✓ `wallSystemTypeCodec.ts` (`wallSystemTypes`) | ✓ `elementType.*` bus bridges | ✓ Duplicate/New via `WallTypeEditorModal` |
| **door** | `@pryzm/geometry-door` `DoorSystemTypeStore` | ✓ `doorSystemTypeStore` | ✓ `hostedSystemTypeCodec.ts` (`doorSystemTypes`) | ✓ same bridges, door adapter | ✓ Duplicate/New via `FinishTypeEditorModal` (2026-08-10) |
| **window** | `@pryzm/geometry-window` `WindowSystemTypeStore` | ✓ `windowSystemTypeStore` | ✓ `hostedSystemTypeCodec.ts` (`windowSystemTypes`) | ✓ same bridges, window adapter | ✓ Duplicate/New via `FinishTypeEditorModal` (2026-08-10) |

The command chokepoint is `elementType.create / duplicate / update / delete`
(`apps/editor/src/engine/initBusHandlers.ts`), with per-family store adapters and per-family draft
validation in `apps/editor/src/engine/elementTypeAuthoringAdapters.ts` (§3.5: validation moved out
of shared code when door/window arrived, because the shared validator was checking `draft.layers`).
Which families MAY author is declared in `ElementTypeAuthoringRegistry`
(`apps/editor/src/ui/property-panel/`), with a stated reason for every family that may not (§3.9).

Two defects found and fixed during the 2026-08-10 door/window wiring, recorded so the next audit
does not re-derive them:
- The window property-panel picker read `window.windowSystemTypeStore`, a global **assigned
  nowhere** — its dropdown listed only "— Plain Window —" while the pre-draw picker (direct module
  import) showed the full catalogue. The picker now imports the singleton directly.
- The same picker painted its swatch from `t.glazingFinish`, a field that does not exist on
  `WindowSystemType` (the second slot is `sillFinish`) — the swatch always showed the fallback.

⚠ There is a SECOND, divergent pair of door/window system-type stores in
`packages/core-app-model/src/stores/` (older shapes, no `dimensions` field). Production persistence,
builders and pickers all use the `geometry-door` / `geometry-window` singletons; the core-app-model
pair is §3.5 drift-in-waiting and should be retired by the audit.

---

## §5 — Verification contract

A family is DONE when all of the following hold, and not before:

1. **Create** — a user can author a new type from the family's dropdown, through a command.
2. **Duplicate** — deep copy, new id, non-colliding name (§3.7).
3. **Round-trip** — a test that creates a type, serialises, clears, loads, and asserts the type is
   present **and still referenced by its instances**. This is the founder's requirement stated as a
   test.
4. **Isolation** — the store is declared per C13 §3.11 and `check:isolation` passes.
5. **Unresolved-type honesty** — a test that a dangling type reference produces the visible
   unresolved state of §3.4, **not** a default.
6. **Undo** — a test that create / edit / duplicate / delete each invert cleanly.
7. **No orphan affordance** — a check that a family offering "New type" is registered as wired
   (§3.9).

⚠ **A positive control is required for 3 and 5.** Prove the round-trip test fails when persistence
is removed, and prove the unresolved-type test fails when the silent default is reinstated. A test
that cannot fail is decoration — the lesson of L-774, where a 25-gate suite reported 25/25 failures
because the runner itself was broken, and of L-779, where the only coverage of a route exercised a
branch that returned early.

---

## §6 — Cross-references

- [C03](./C03-SCHEMAS-COMMANDS-AND-STATE.md) — schemas, commands, state; P6.
- [C05](./C05-PERSISTENCE-AND-FILE-FORMAT.md) — snapshot round-trip (§3.1).
- [C11](./C11-ELEMENT-CREATION-PIPELINE.md) — instance creation; a type feeds the SAME pipeline.
- [C13](./C13-PROJECT-LIFECYCLE-AND-ISOLATION.md) §3.10/§3.11 — project scoping (§3.3).
- [C16](./C16-COMMAND-AUTHORING-PROTOCOL.md) — command authoring + undo (§3.2).
- [C17](./C17-BATCH-CREATION-CATALOGUE-AND-PANEL-BINDING.md) — catalogue/panel binding.
- [C18](./C18-ELEMENT-PREVIEW-VISUAL-CONTRACT.md) — preview semantics (§3.8).
- [C43](./C43-ACCESSIBILITY.md) — the modal is a keyboard-complete surface.
- [C47](./C47-FILE-FORMAT-VERSIONING.md) — schema version + migration (§3.1).
- [C07](./C07-PLUGIN-SDK-AND-MARKETPLACE.md) / [C40](./C40-MARKETPLACE-ECONOMICS.md) — T4.
