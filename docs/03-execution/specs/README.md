# Specs — per-system normative specifications

> 56 spec files (39 numbered SPEC-NN + 17 special-named). One per major capability. Numbered `SPEC-NN-<TOPIC>.md`.
> **Reconciled 2026-06-03**: numbering range corrected (highest is **SPEC-48**; 14, 16–20, 22, 23, 25 are unassigned/absent).

## §1 — What a spec is

A spec is the **engineering charter for a single capability**. It defines:

- **Wire format** — bytes / JSON / IFC entity shape
- **Schema tables** — Zod schemas, fields, defaults, validation
- **Algorithm** — pseudocode, step-by-step
- **Public API** — function signatures, types
- **Test obligations** — what the conformance suite checks
- **Performance targets** — if any (per [C10](../../02-decisions/contracts/C10-PERFORMANCE-AND-OBSERVABILITY.md))

A spec is NORMATIVE — code MUST conform to it. But specs sit BELOW contracts in the authority order; if a contract changes, the spec is updated to match.

## §2 — Numbering

Monotonic `SPEC-NN` (2-digit). Once assigned, never moves. Currently assigned through **SPEC-48** (with 14, 16–20, 22, 23, 25 unassigned) + a number of special-purpose SPEC-* without numbers (e.g. SPEC-APARTMENT-LAYOUT-GENERATOR).

The legacy plan `PLAN-GENERATIVE-DESIGN-SPRINTS.md` lives here too as a historical artefact.

## §3 — Anatomy

```markdown
# SPEC-NN — <Capability>

> **Stamp**: YYYY-MM-DD · **Status**: DRAFT | ACTIVE | SUPERSEDED
> **Depends on**: C03, C11, ADR-…
> **Owner**: <package or team>

## §1 — Scope
What this spec covers. What it does NOT cover (out-of-scope).

## §2 — Invariants
The rules code MUST obey.

## §3 — Schema
Tables, field types, defaults.

## §4 — Algorithm
Step-by-step pseudocode.

## §5 — API surface
Public functions + types.

## §6 — Conformance tests
What the test suite checks.

## §7 — Performance targets
If any.

## §8 — Migration
How to evolve when this spec changes.
```

## §4 — Full index

| ID | Title |
|---|---|
| SPEC-01 | Geometry Kernel |
| SPEC-02 | Persistence |
| SPEC-03 | Sync CRDT |
| SPEC-04 | Drawing Engine |
| SPEC-05 | Type Catalog |
| SPEC-06 | Rooms + Levels |
| SPEC-07 | AI Layer |
| SPEC-08 | Security + Collab |
| SPEC-09 | Plugin SDK |
| SPEC-10 | (see directory) |
| ... | (full list: `ls SPEC-*.md`) |
| SPEC-48 | Constraint Solver (latest) |

Special-named specs (no number):
- `SPEC-APARTMENT-LAYOUT-GENERATOR.md`
- `SPEC-ARCHITECTURAL-PROGRAM-RULES.md`
- `SPEC-FURNITURE-LAYOUT-ENGINE.md`
- `SPEC-CEILING-LAYOUT-ENGINE.md`
- `SPEC-LIGHTING-LAYOUT-ENGINE.md`
- `SPEC-TGL-DETERMINISTIC-LAYOUT-ENGINE.md`
- `SPEC-SEMANTIC-DESIGN-ASSISTANT.md`
- `PLAN-GENERATIVE-DESIGN-SPRINTS.md` (historical plan; not normative)

## §5 — When to write a new spec

You're writing a spec when:

- You're defining the **wire format** for a new file type or message.
- You're defining the **algorithm contract** for a new engine (apartment generator, sheet renderer, IFC exporter).
- You're defining the **schema** for a new domain type.

You're NOT writing a spec when:

- It's a UI / UX decision → `03-execution/plans/` or `05-guides/`
- It's a one-time roadmap → `03-execution/plans/`
- It's a per-decision rationale → `02-decisions/adrs/`
- It's a binding rule for everyone → `02-decisions/contracts/`

## §6 — Cross-reference

- Contracts that govern spec authoring: [C16 Command Authoring Protocol](../../02-decisions/contracts/C16-COMMAND-AUTHORING-PROTOCOL.md)
- Performance targets: [C10 Performance & Observability](../../02-decisions/contracts/C10-PERFORMANCE-AND-OBSERVABILITY.md)
- Schema purity (L0): [P5 in 01-strategy/engineering-vision.md §2](../../01-strategy/engineering-vision.md)
