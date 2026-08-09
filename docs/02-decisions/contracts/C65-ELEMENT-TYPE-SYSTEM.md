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

**PENDING.** A three-axis audit — EXISTS · WIRED · PERSISTED, per element family — is in progress
(`agent/c12-element-types`). It will be recorded here rather than assumed.

What is already known from production logs: system types exist and resolve through per-family
chokepoints (`systemTypeId=dt-solid-timber` via `DoorToolConfigStore`,
`systemTypeId=wt-timber-casement` via `WindowToolConfigStore`, `Wall + Slab system type stores
loaded`). So T1 exists and is wired for at least four families. **Whether any family reaches §3.1
(snapshot round-trip) is the open question, and the founder's report — "it falls back to default" —
is direct evidence that at least one does not.**

⚠ This section MUST be filled from the audit, not from inference. Writing a confident AS-IS on top
of an unknown is how a contract comes to disagree with its code.

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
