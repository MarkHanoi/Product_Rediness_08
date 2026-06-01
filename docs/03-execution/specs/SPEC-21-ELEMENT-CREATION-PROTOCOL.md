# SPEC-21 — Element Creation Protocol (the canonical recipe)

| Field | Value |
|---|---|
| Status | Active — normative |
| Version | 1.0 |
| Date | 2026-04-27 |
| Owner | Architecture lead |
| Closes | `GAP-REVIEW-2026-04-27.md §10, §29 #4` (no documented recipe for new families); supersedes the implicit "Wall recipe" |
| Phases | 1B (originating recipe — historical), 2A (6 new families), 2C (sheet/schedule families), 3A (loadable component editor) |
| Replaces / extends | the informal `docs/architecture/element-recipe.md` referenced in PHASE-2A §0 |

> Every new element family in PRYZM 2 follows the same 9-step protocol from greenfield to GREEN bench gate. **No deviation without ADR sign-off.** This SPEC is the *standing recipe* for the next 12 families (Phase 2A onward) and is the artefact the Phase 1 GREEN audit promised but did not codify.

---

## §1 The 9-step recipe

Each step has an explicit deliverable, owner, exit gate, and test fixture. Steps are sequential within a family but may be pipelined across families.

### Step 1 — Schema (Zod) + Type Catalog rows
- **Deliverable:** `packages/schemas/src/families/<family>.ts` with `<Family>TypeSchema`, `<Family>InstanceSchema`, `<Family>LayerSchema` (where applicable).
- **Owner:** Track A.
- **Exit gate:** Zod schemas compile; `pnpm test packages/schemas` green.
- **Fixture:** at minimum 1 type and 3 instances in `tests/fixtures/<family>/basic.json`.

### Step 2 — Context Envelope (per SPEC-13)
- **Deliverable:** `packages/schemas/src/contexts/<family>.ts` declaring `<Family>Context extends BaseContext`.
- **Owner:** Track A.
- **Exit gate:** TypeScript compiles; `<Family>Context` consumed by step-4 producer.
- **Fixture:** envelope-stability test in `packages/schemas/__tests__/contexts/<family>.stability.test.ts`.

### Step 3 — Store + handlers
- **Deliverable:** `plugins/<family>/store.ts` (Zustand-style or per-family discipline) + handlers (Create / Update / Delete / Move / Resize / Type-swap, family-dependent count).
- **Owner:** Track A.
- **Exit gate:** all handlers idempotent; replay-from-event-log produces deepEqual store state; `pnpm test plugins/<family>` green.
- **Fixture:** 1 fixture per handler; covered handler count = handler count.

### Step 4 — Producer (pure)
- **Deliverable:** `packages/geometry-kernel/<family>/producer.ts` exporting `produce(ctx: <Family>Context): Result<BufferGeometryDescriptor, KernelError>`.
- **Owner:** Track A.
- **Exit gate:** ESLint `pryzm/no-impure-context` green; `pnpm test packages/geometry-kernel/<family>` green; **byte-identity test passes between Node and browser-worker invocations on identical fixtures**.
- **Fixture:** 5 fixtures (basic, edge, degenerate, max-complexity, regression). Per ADR-020 robustness budget.

### Step 5 — Committer
- **Deliverable:** `plugins/<family>/committer.ts` consuming the L1 store + invoking step-4 producer + writing to scene-cache.
- **Owner:** Track B.
- **Exit gate:** scene-cache contains the produced descriptor; render runtime can consume; `pnpm test plugins/<family>/committer` green.
- **Fixture:** 1 round-trip (store mutation → committer → scene-cache assertion).

### Step 6 — Tool (UI)
- **Deliverable:** `plugins/<family>/tool.ts` with at least Create + Edit + Delete UI actions.
- **Owner:** Track B.
- **Exit gate:** E2E Playwright smoke (`apps/editor-e2e/<family>.spec.ts`) creates / edits / deletes one instance.
- **Fixture:** 1 visual snapshot per default state (per SPEC-11 §6 visual gate).

### Step 7 — IFC mapping (per SPEC-05 §4)
- **Deliverable:** `packages/ifc-mapper/<family>.ts` mapping the family's instance + type to the canonical IFC class + Pset values.
- **Owner:** Track A.
- **Exit gate:** round-trip IFC export → re-import produces deepEqual element (modulo IFC-lossy fields documented in `ifc-lossy-fields.md`).
- **Fixture:** 1 IFC round-trip per family.

### Step 8 — Plan-view symbol (per SPEC-30 §4)
- **Deliverable:** `plugins/<family>/plan-symbol.ts` exporting `toPlanSymbol(ctx, viewCtx) => VectorPrimitiveSet`.
- **Owner:** Track B (Phase 2B onward).
- **Exit gate:** plan-view fixture renders; visual-diff <1% vs golden.
- **Fixture:** 1 plan-symbol golden per family.
- **Note:** Phase 1 GREEN families had this implicitly. Phase 2A families build per the existing 2A plan; plan-symbol producers + reverse-documentation of Step-2 envelopes for all 18 families land in Phase 2B at S31 → S34 (Step 8 producers per the PHASE-2B §Gap-Closure subphase).

### Step 9 — Schedule columns (per SPEC-29 §6, ADR-027)
- **Deliverable:** `plugins/<family>/schedule.ts` exporting `defaultScheduleColumns: ScheduleColumnSpec[]` and `scheduleFormulaSet: ScheduleFormulaRef[]`.
- **Owner:** Track A (Phase 2C onward).
- **Exit gate:** `apps/headless schedule --family=<family>` outputs CSV with default columns.
- **Fixture:** 1 schedule CSV golden per family.

---

## §2 Sequencing

For Phase 1 (already done): all 9 steps complete for 12 families. The audit's 163 parity fixtures are largely Step-1+Step-3+Step-4 fixtures + some Step-5.

**Phase 2A is in active development per its existing plan** (Rooms, Structural, Lighting, Plumbing, Furniture, Dimensions). Per the 2026-04-27 directive Phase 2A holds no gap-closure work; the 6 new families build through Steps 1–6 implicitly during 2A, and **Steps 7 (IFC) + 8 (plan symbols) + Step-2 envelope reverse-doc all land in Phase 2B at S31 → S34** per the PHASE-2B §Gap-Closure subphase.

If any single family takes > 5 sprint-days for Steps 1–6, K1-C kill-switch fires (per `[strategic ADR-018]` and PHASE-2A §1.1). The pattern is wrong; halt and diagnose.

---

## §3 The single canonical fixture template

Every family ships one `tests/fixtures/<family>/canonical.json` whose shape is:

```json
{
  "family": "<family>",
  "types": [ /* ≥1 */ ],
  "instances": [ /* ≥3 with varying parameters */ ],
  "envelope": {
    "level": { "z": 0, "disciplineGroup": "architectural" },
    "units": { "lengthUnit": "mm", "epsilonLength": 0.0005 },
    "materials": { /* resolved */ },
    "bake": { "lod": 0, "maxVertices": 50000, "maxMaterials": 8, "allowExpensive": false }
  },
  "expectedDescriptor": { /* expected BufferGeometryDescriptor signature — vertices count, surfaces, attribute names */ },
  "expectedIfc": { "ifcClass": "...", "psetCount": 0 },
  "expectedPlanSymbol": { "primitiveCount": 0 },
  "expectedScheduleColumns": [ /* names */ ]
}
```

CI runs `pnpm test:family <family>` which validates each step's gate against this single fixture. **Adding a family = adding a canonical fixture.**

---

## §4 Anti-patterns this SPEC forbids

- **No "kernel reaches into the store"** (`window.bimKernel.foo()`, `globalThis.stores.x`). The producer accepts only its envelope.
- **No producer-internal RNG / clock without declaring it on the envelope.**
- **No skipping Step 7 (IFC mapping)** with the excuse "this family has no IFC class." Every family has a default mapping (see `IfcBuildingElementProxy` fallback in SPEC-05 §4.5).
- **No skipping Step 8 (plan symbol)** with the excuse "this family is 3D-only." Every family has a fallback symbol (`renderInPlan: false` flag triggers a stub).
- **No deviation from the 9 steps** without an ADR explaining why (and revisiting on the next family).

---

## §5 Re-audit: do the 12 Phase-1 families pass?

| Family | Step 1 | Step 2 | Step 3 | Step 4 | Step 5 | Step 6 | Step 7 | Step 8 | Step 9 |
|---|---|---|---|---|---|---|---|---|---|
| Wall | ✓ | (implicit — codify S31) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | partial |
| Slab | ✓ | (implicit) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | partial |
| Door | ✓ | (implicit) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a |
| Window | ✓ | (implicit) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a |
| Roof | ✓ | (implicit) | ✓ | ✓ | ✓ | ✓ | ✓ | partial | partial |
| Curtain Wall | ✓ | (implicit) | ✓ | ✓ | ✓ | ✓ | partial | partial | partial |
| Grid | ✓ | (implicit) | ✓ | ✓ | ✓ | ✓ | n/a | ✓ | n/a |
| Column | ✓ | (implicit) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | partial |
| Beam | ✓ | (implicit) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | partial |
| Stair | ✓ | (implicit) | ✓ | ✓ | ✓ | ✓ | partial | ✓ | partial |
| Handrail | ✓ | (implicit) | ✓ | ✓ | ✓ | ✓ | partial | partial | n/a |
| Ceiling | ✓ | (implicit) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | partial |

**S31 work** (Phase 2B start; Phase 2A holds no gap-closure work per 2026-04-27 directive): codify Step-2 envelopes for all 18 (12 Phase-1 + 6 Phase-2A in-flight), fill Step-7 partials (Curtain Wall, Stair, Handrail), promote Step-9 partials to full schedule columns.

---

## §6 Phase rollout

| Sprint | Deliverable |
|---|---|
| S31 (Phase 2B start; Phase 2A holds no gap-closure work per 2026-04-27 directive) | SPEC-21 land; `docs/architecture/element-recipe.md` deprecated → points here. Step-2 envelopes for all 18 families (12 Phase-1 GREEN + 6 Phase-2A in-flight) codified in one reverse-doc sprint per SPEC-13 §3. |
| S32–S33 | Step-7 (IFC) for the 6 Phase-2A in-flight families. |
| S34 | Step-8 (plan symbols) for all 18 families. |
| S37–S42 | Step-9 schedule columns hardened across all 18 families. |
| S43+ | Steps 1–9 become preconditions for any new family. |

---

## §7 Cross-references
- Envelope shapes: SPEC-13.
- Producer purity: SPEC-01 §1.
- Type catalog: SPEC-05 §1, §3.
- IFC mapping table: SPEC-05 §4 + `[strategic ADR-008]`.
- Plan symbol production: SPEC-30 §4.
- Schedule formula library: SPEC-29 §6 + `[strategic ADR-027]`.
- Bench gate: PHASE-1B §10 (Wall recipe canonical), PHASE-2A §6 (multiplier reaffirmed).
