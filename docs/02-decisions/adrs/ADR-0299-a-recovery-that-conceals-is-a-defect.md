# ADR-0299 — A recovery that silently repairs a symptom destroys the evidence for the defect

| Field | Value |
|---|---|
| **Status** | Accepted — 2026-08-07 |
| **Tag** | `§RECOVERY-MUST-REFUSE` |
| **Owner** | Cross-cutting (room topology, rendering, site/context) |
| **Motivated by** | L-696 (curved floor finish, **three** founder reports), L-698 (silent `ShadowDepthTexture` white viewport), L-694 / ADR-0298 (a green probe over dirty state) |
| **Constraints** | C11, C04, C13 |
| **Related** | ADR-0297 (*"a fix that stops the symptom can permanently conceal the defect"* — the same lesson reached from rendering), ADR-0292 (honest reporting), ADR-0298 (declared probe sets) |
| **Implemented by** | `ba7ee582` (`§REFUSE-SAME-PARENT-REACH`), `7bccefd5` (`uncapturederror` subscription) |

---

## Context

Three unrelated subsystems produced the same failure in a single session. In each, a well-intentioned recovery path converted a **detectable** fault into a **plausible** one, and the plausible version cost far more to find.

**1. Room topology — the expensive one.** `RoomDetectionEngine.§DIAG-PARTITION-REACH` closes small gaps between wall sub-segments by dragging a dangling endpoint onto the nearest collinear host. It was added for a real case (resolver trim leaving partition ends short) and it works.

It also concealed `§FIX-CURVED-WALL-PRETRIM-FRAME` through **three founder reports**. A curved wall's arc was sampled in a mixed pre/post-trim frame, tearing its own tessellation by ~600 mm. Rather than surfacing as a broken ring, the tear was "recovered": the dangling end was dragged onto the wall's **own previous sub-segment**, producing a *straight chord across the arc* — geometry that is wrong but entirely plausible. It read as a modelling quirk rather than a bug, and two investigations went into the floor tool, which was innocent throughout.

⚠ **The log even named the mechanism** — `reconnected guest=…_c23.end onto host=…_c22 body — closed a 599mm dangling gap` — and was read as a **success message**, because it said "reconnected".

**2. Rendering.** `Destroyed texture … used in a submit` is a WebGPU *validation* error delivered to `uncapturederror`, not a thrown exception. `render()` returned normally, so nothing classified it, nothing reported it, and the user got a **blank viewport with no error at all**. ADR-0297 only ever caught faults that happen to throw.

**3. Project isolation.** `ProjectIsolationAudit` printed `✓ loaded clean` while the previous project's camera state was still seated (L-694). The probe answered truthfully about the fields it modelled and falsely about what the user could see.

Two further instances were found and left in place deliberately, as evidence rather than debt: `ViewportCrashGuard` logged *"Soft recovery initiated"* via a call that cannot rebuild the pipeline (L-698), and `§L-676-B` reported teardown *"complete"* while naming a scope it had not torn down (L-694).

## Decision

**A recovery must be able to distinguish the *repairable* from the *impossible*, and must refuse the impossible loudly.**

1. **A recovery may not repair a violation of an invariant it does not own.** Adjacent sub-segments of one wall share endpoints *by construction*; a gap between them is not a gap to close, it is proof of upstream corruption. `§REFUSE-SAME-PARENT-REACH` now refuses it with a `console.error` naming both segments, the shared parent and the gap.
2. **A recovery MUST report when it did no work.** An entry point that cannot perform the repair its name promises must return a failure signal, and callers MUST NOT log a recovery they did not perform.
3. **Detection MUST NOT depend on the fault throwing.** Where a platform reports faults out-of-band (WebGPU `uncapturederror`), that channel MUST be subscribed for the lifetime of the resource and routed into the same classification path as thrown faults.
4. **Where a recovery does proceed, its output MUST be marked degraded** — not returned as though it were authored data.

### The test to apply when adding any repair, fallback, or auto-heal

> **If the thing I am repairing were impossible by construction, would I notice?**

If the answer is no, the repair needs a refusal branch before it ships.

## Consequences

- Some inputs that previously produced plausible geometry now produce **visibly broken geometry plus a loud error**. That is the intended trade: *a defect that announces itself costs one session; a defect that hides costs three, plus the investigations it misdirects.*
- Recovery paths become part of the diagnostic surface rather than a way of erasing it.
- Cost: more visible failure in the short term, and a backlog of existing repairs to audit.

## Audit candidates with the same shape

`_snapNearbyCorners`, the `resolver-trim recovery` family, `repairToSimplePolygon`, `§SELECT-STUCK-STATE-SELFHEAL`, `§SELECT-GIZMO-REATTACH`, `§L-B2-RECONCILE`, and the envelope/context fallbacks already flagged under the context-data-honesty family — where *"failure and empty are the same value"* is the same defect wearing different clothes.

## Why an ADR and not a code comment

The lesson was reached **independently, three times, in three subsystems that share no code** — room topology, the render pipeline, and project lifecycle — within one session. A comment would have been local to whichever one wrote it first. ADR-0297 stated the rendering half (*"a fix that stops the symptom can permanently conceal the defect"*); this generalises it to every repair path in the product.

## Relationship to ADR-0292

ADR-0292 governs what a tool may **report**; this governs what a tool may **do** before reporting. They compose: a recovery that silently succeeds has nothing to report, which is precisely how it evades ADR-0292.
