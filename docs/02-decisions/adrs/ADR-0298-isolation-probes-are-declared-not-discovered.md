# ADR-0298 — Isolation probes are DECLARED, not discovered

| Field | Value |
|---|---|
| **Status** | Proposed — 2026-08-07 |
| **Tag** | `§PROBE-SET-DECLARED` |
| **Owner** | Project lifecycle |
| **Motivated by** | L-694 (new project inherited the previous project's globe while the audit printed `✓ loaded clean`), §L-676 (the partial predecessor), L-690/L-693 (the same shape in two other subsystems) |
| **Constraints** | C13 (project lifecycle & isolation), C04 |
| **Related** | ADR-0292 (*no tool reports a result it cannot verify against external ground truth*) — this is the isolation-specific instance of that invariant |

---

## Context

`ProjectIsolationAudit` reports a project as clean by asking every **registered** scope owner whether it still holds foreign state. It has now failed the same way **twice**, in the same subsystem family, for the same structural reason.

**§L-676** swept `ui/geospatial/**`, `ui/site/**` and `plugins/geospatial/**` and registered an owner for each. `ui/layout/GISAreaLayout.ts` was in none of those directories, so it registered nothing — and a subsystem that registers nothing is not reported as *unknown*, it is **absent from the report entirely**. The audit then printed:

```
[ProjectIsolationAudit] ✓ project … loaded clean — 15 stores + scene + 4 scope probe(s)
```

…while a closure variable in the unregistered file held the previous project's coordinates and flew the camera back to them.

**The audit could not have caught this.** Its population is *the set of things that registered*. An omission is, by construction, not in that set.

> ⚠ **A green probe is evidence about the probe's MODEL, not about the system.**

This is the same failure the audit log records in two other places: a type-picker review that enumerated the branches of the ladder it was reviewing (L-692), and a creation-capability review with no declared matrix to compare against (L-693). In each case the reviewing artefact derived its population from the thing under review.

## Decision

**The set of subsystems that MUST hold a project-isolation probe is DECLARED in one place, and the audit checks reality against that declaration — not against whatever happened to register.**

1. A single **declared expected probe set** (name, owning module, why it holds project-scoped state) lives with the isolation machinery, versioned in the repo.
2. `ProjectIsolationAudit` fails when a declared owner is **missing at runtime**, exactly as loudly as when a registered owner reports foreign state. *"Expected probe `gis.areaLayout` did not register"* is a failure, never a silent absence.
3. A **static check** (`tools/ga-gate/`, alongside `check-project-isolation.ts`) fails CI when a module holds module-level or closure-level mutable state reachable from a project surface and is not in the declared set. New subsystems are therefore born declared or born failing — never born invisible.
4. The declaration is the **contract surface**: adding a subsystem that holds project state is a deliberate edit to that list, reviewable in a diff.

## Consequences

- The audit's answer changes meaning: `✓ clean` becomes *"every subsystem we require to answer, answered, and none holds foreign state"* rather than *"nobody who spoke up is dirty."*
- Isolation regressions of the L-676/L-694 shape become **impossible to introduce silently**; the failure moves from a founder noticing Barcelona on a new project to a red gate.
- Cost: one list to maintain, and a static check that will initially flag genuine pre-existing debt. That debt is the point — it is currently invisible.

## Alternatives rejected

- **Broaden the directory sweep.** This is what §L-676 did. It fixes the instance and leaves the mechanism: the next subsystem outside the swept directories is invisible again. L-694 is the proof.
- **Make the audit discover state by reflection.** Cannot see closure variables (`lastGeocodeFrame` was one), which is precisely where L-694 lived.
- **Trust code review.** Two review passes already missed it.

## Open

Whether the declared set should also carry *what* each owner must reset (fields/keys), so the probe can be checked for **completeness** as well as presence. L-694's second gap was a probe that was present but modelled the wrong property — it never counted the camera seat. Presence alone would not have caught that; only stamping ownership **on the resource** did. That may warrant a follow-up, and it is deliberately not decided here.
