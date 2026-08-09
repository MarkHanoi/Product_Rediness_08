# ADR-0309 — Element types are PROJECT state, and a missing type is never a silent default

**Status:** ACCEPTED · **Date:** 2026-08-09 · **Establishes:** [C65](../contracts/C65-ELEMENT-TYPE-SYSTEM.md)

**Founder request:** 2026-08-09 · **Context tag:** `§ELEMENT-TYPE-SYSTEM`

---

## 1. Context

The founder asked for "robust element NEW TYPE creation" across every family — walls, windows,
doors, curtain walls, floors, ceilings, slabs, columns, beams, stairs, "ideally absolutely all, even
beds" — with a real layer editor for walls, and one specific complaint:

> "The modal is not project-compliant — **it falls back to default**, which is not correct. The
> element types must be saved in the user project/session — when the user re-opens the project, all
> new types created must remain, robustly."

Production logs confirm a type concept already exists and resolves through per-family chokepoints
(`systemTypeId=dt-solid-timber`, `systemTypeId=wt-timber-casement`, "Wall + Slab system type stores
loaded"). So this is not a greenfield feature. It is a **system with parts built, no stated rule
about where a type lives, and at least one family that silently discards the user's work.**

## 2. The decision

Two rules, from which C65 follows.

### 2.1 — A user-created type is PROJECT state

It is written by `ProjectSerializer`, restored by `ProjectLoader`, scoped per C13, and undoable per
C16. Not a runtime store. Not localStorage. Not "the tool's current config".

The alternative — types as application or user-global state — was rejected because a wall type is a
**design decision about this building**, not a preference. Two projects on one machine must be able
to hold different "Exterior 300mm" definitions without one overwriting the other, and a project sent
to a collaborator must carry its own types or it is not the same model.

A user library (T3) and marketplace packs (T4) are declared in C65 §2 so the architecture leaves
room for them, and deliberately deferred. **T2 must not be built in a way that makes T3 impossible.**

### 2.2 — An unresolved type is an explicit state, not a default

If an instance references a type that no longer resolves, the product does **not** substitute a
default. It resolves to a visible, non-destructive `unresolved` state.

This is the load-bearing half of the decision, and it generalises the founder's complaint. "Falls
back to default" is not merely wrong output — it makes **"your type was lost"** and **"this is a
default wall"** the same value. That is the `§CONTEXT-DATA-HONESTY` failure this repository has paid
for three times in one week:

- **L-716** — a false `AND` in a readiness gate; "not ready" and "cannot ever be ready" were one value.
- **L-752** — the isolation audit compared stores only; a leak that lived in the scene reported "✓ loaded clean".
- **L-779** — a 500 from the server rendered as an empty project, which the autosave then persisted.

⚠ Each of those was found by a founder noticing something looked wrong, never by the system saying
so. A type system that silently defaults would join that list, and would do it while the user
watched a wall they authored turn back into a generic one.

## 3. Consequences

- Adding a type collection to the snapshot is a **file-format change** (C47): schema version, and a
  migration if older snapshots can contain the shape.
- The type store must be **declared** in `declaredProjectScopes.ts` or it leaks across projects —
  the defect class caught twice recently (L-713, L-752).
- Editing a type propagates to every instance (Revit semantics), so the UI must state the instance
  count before applying, and DUPLICATE must be offered whenever instances exist.
- Families ship **one at a time, fully**. A "New type" entry that produces nothing is worse than a
  missing one.

## 4. Alternatives rejected

| Option | Why rejected |
|---|---|
| Types in a runtime store only | This is the current defect: work lost at project close, silently. |
| Types in `localStorage` / user-global | A wall type is a decision about *this building*. Two projects would collide, and a shared project would arrive typeless. |
| One store per family | The drift trap. In one week this repo produced three disagreeing plan-limit tables (silent data loss), two disagreeing typology id lists (a residential request silently produced an apartment), and two copies of one style resolver (authored colours discarded). One abstraction, family-specific payloads. |
| Fall back to a default when a type is missing | Makes data loss indistinguishable from a design choice. See §2.2. |
| Build all ~15 families at once | Half-wired is worse than absent: everyone believes it is done. Walls first, completely, with the extension cost documented. |

## 5. What is NOT decided here

- **The AS-IS.** A three-axis audit (EXISTS · WIRED · PERSISTED, per family) is in progress and will
  be recorded in C65 §4. ⚠ It is deliberately left blank rather than inferred — writing a confident
  AS-IS on top of an unknown is how a contract comes to disagree with its code, which C01's
  governance order then resolves *against the contract*.
- Whether any family already satisfies §3.1. The founder's report is evidence at least one does not.
- The T3 promotion gesture and its storage.
