# ADR-017 — Element Type Catalog Scope

| Field | Value |
|---|---|
| Status | **Accepted** — 2026-04-27 |
| Closes | `CONFLICT-ANALYSIS.md §6.7`; `CRITICAL-REVIEW-2026-04-27.md §B5` |
| Required by | Sprint S11 (Phase 1C — first per-family type lands) |
| Owner | Architecture lead |
| Implementation | `packages/types-schema/`, `packages/material-library/`, `packages/types-runtime/` |
| Spec dependency | `SPEC-05-TYPE-CATALOG.md` |
| Replaces | The thin 271-line `02-decisions/contracts/17-ELEMENT-TYPES-AND-MATERIALS-CONTRACT.md` |

---

## Context

`CRITICAL-REVIEW-2026-04-27.md §B5` and `CONFLICT-ANALYSIS.md §3.12 / §6.7` identify the legacy element-types contract as a critical gap: its 271 lines lack the family-vs-type-vs-instance model, type-vs-instance parameter scoping, layer composition for walls/floors/roofs, IFC mapping (only mentioned), material library inheritance, and the loadable/system family distinction.

Without a real type catalog: schedules are wrong (no group-by-type), IFC export is wrong (no `IfcRelDefinesByType`), the Component Editor (D10) is impossible (no loadable-family schema to edit). Every element family added in Phase 1C without this in place bakes a thin model into the codebase that everything later has to work around.

---

## Decision

**The legacy contract is replaced by `SPEC-05`. The catalog ships in v1 with a frozen scope: the family taxonomy, the parameter system, the layer composition model, IFC mapping, and the M36 ship-with-product type list. The Component Editor (loadable-family authoring) is Phase 3A. MEP / civil / advanced curtain-wall mullion families are post-GA.**

### What ships in v1

#### Family taxonomy (per SPEC-05 §1)
- **System families** (defined in code): `Wall`, `Floor`, `Roof`, `Ceiling`, `Stair`, `Railing`, `Curtain Wall`, `Curtain Grid`.
- **Loadable families** (user-authorable Phase 3A): `Door`, `Window`, `Furniture`, `Casework`, `Plumbing Fixture`, `Lighting Fixture`, `Generic Model`.

Family / Type / Instance is the canonical hierarchy. A type is a named configuration of a family; an instance references a type. Resolution order: `instance.parameters[k] ?? type[k] ?? family.defaults[k]`.

#### Parameter system (per SPEC-05 §2)
- Type vs instance parameters declared in the family schema (Zod).
- "Reset to type" clears an instance override.
- Setting an instance parameter equal to its type value is a no-op.

#### Layer composition (per SPEC-05 §3)
- Walls/floors/roofs carry `layers[]` of `{ function, thicknessMm, materialId, wraps, isCore, graphics }`.
- Exactly one core layer per type (defines centerline reference and the analytic-display split per SPEC-01 §2).
- Layers render as parallel boundary lines in plan/section with material hatches in cut-poche.

#### Material library (per SPEC-05 §4)
- Single material schema covers appearance (PBR), thermal, acoustic, cost, hatch, IFC mapping.
- Layer references material by `materialId`; no duplication.
- 40 ship-with-product materials at M36 GA (SPEC-05 §7.5).

#### IFC mapping (per SPEC-05 §5)
- Type-level entity selection + predefined type + property-set mapping.
- M36 GA target: ≥ 95% instance properties round-trip; 100% geometry round-trip.
- Round-trip preserves type identity via `IfcRelDefinesByType`.

#### Top reference / level association (per SPEC-05 §6)
- Walls: `level` (top = level + offset), `unconnected` (fixed height), `attached` (host element).
- Level changes propagate through `level` and `attached` references.

#### Ship-with-product catalog (M36 GA — per SPEC-05 §7)
- 12 wall types, 8 floor/roof types, 8 door types, 8 window types, 40 materials.
- All ship in `packages/types-builtin/` and load at boot.

### What's deferred (post-GA)
- **Custom curtain-wall mullion families with arbitrary profiles** — needs constraint solver (per ADR-024) which is post-GA-only at the v1 cut.
- **MEP families** (pipe, duct, conduit, electrical) — Phase 3+ marketplace plugins.
- **Site / planting families** — Phase 3+.
- **Furniture beyond a 12-piece starter set** — relies on marketplace.
- **Nested family depth > 2** — explicitly out (per SPEC-05 §8.3).
- **Scripted families** (Python/JS in family definitions) — explicitly out (security + complexity).

### What's deleted from the legacy contract
- The 271-line legacy contract is obsolete. It is preserved in `02-decisions/contracts/` for archaeology only and marked `DEPRECATED` in its header.
- "Future Work" placeholders in the legacy contract are now decisions in SPEC-05.
- "Layer→WebGPU resolver still planned" is now decided: layers reference materials whose `appearance` block is the source of truth for the renderer (SPEC-05 §4.3).

### Storage shape
- L1 store `typeStore: TypeId → Type` per project (project-local; ships with the project file).
- L1 store `materialStore: MaterialId → Material` per project.
- Built-in catalog imported via copy-on-first-use semantics; renaming or deleting a built-in type creates a project-local override.
- Persists via the event log (`type.create.v1`, `type.update.v1`, `type.delete.v1`, `material.*.v1`) like any other L1 entity (per ADR-002 / ADR-013).

### CI gate
- Every system family in `packages/types-builtin/` MUST declare its full schema by the close of S11. Lint at `tools/lint-type-completeness.ts`. PR-blocking from S11.

---

## Consequences

**Positive:**
- Schedules, IFC export, drawing engine, AI, and Component Editor all read from the same model.
- Material library is the single source of truth for appearance/thermal/acoustic/cost/hatch — no duplication.
- The deferred scope is documented; customers know what they're getting.
- The Component Editor (Phase 3A) builds on a stable family schema.

**Negative:**
- ~6 weeks of front-loaded work (S07–S11) before any element family ships its types in earnest.
- Legacy contract supersession requires migration of any existing test-fixture data to SPEC-05's shape; small, but non-zero.
- The 12/8/8/8/40 ship-with-product list is opinionated; some customers will need a 13th wall type — that's what custom types are for.

---

## Alternatives considered

### Defer the type catalog to Phase 2
- Rejected: Phase 1C ships per-family element committers; without a type catalog they bake a thin model into the codebase that everything else works around forever. CONFLICT-ANALYSIS §6.7 calls this out explicitly.

### Per-family bespoke type schemas (no shared family/type/instance model)
- Rejected: schedules + IFC + Component Editor each need a uniform model.

### Adopt Pascal's type model verbatim
- Rejected: Pascal's "Future Work" gaps are exactly what SPEC-05 closes; copying them forward replays the gap.

### Defer the loadable-family runtime to Phase 3A; ship system-only in v1 entirely
- Considered. We do this for the Component Editor, but the *runtime* (the schema, the IFC mapping, the material library) is required earlier. Hence: schema in S11; authoring tool in Phase 3A.

---

## Phase rollout
- S07 — `packages/types-schema/` Zod schemas land; family taxonomy frozen.
- S09 — `packages/material-library/` ships with the v1 40-material set.
- S11 — first per-family type for `Wall` (Phase 1C); CI gate for type completeness active.
- S13–S20 — per-family schemas land for Floor, Roof, Column, Beam, Door, Window, Stair, Railing, Curtain Wall (Phase 1C close).
- S25 — Room/Space + Level types (Phase 2A).
- S35 — IFC type mapping verified end-to-end (Phase 2C).
- S49–S54 — Component Editor for loadable families (Phase 3A; depends on ADR-024 constraint solver).
- S72 (M36 GA) — ship-with-product catalog frozen; deferred items listed as v2 candidates.
