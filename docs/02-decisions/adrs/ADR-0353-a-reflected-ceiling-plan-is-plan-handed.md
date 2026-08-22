# ADR-0353 — A reflected ceiling plan is PLAN-HANDED, and the reflection is implicit in the coordinate mapping

- **Status:** Accepted — **ratifying a decision that was made in code and never written down**
- **Date:** 2026-08-22
- **Lane:** VIEWDOC20
- **Supersedes:** nothing. **Corrects:** `docs/03-execution/specs/SPEC-04-DRAWING-ENGINE.md` §6 line 212,
  which stated the opposite of the code on two counts.
- **Ratifies (does not change):** the `+Y` projection preset at
  `packages/core-app-model/src/views/ViewDefinitionTypes.ts:224` and the **absence** of any mirror
  transform on the `'ceiling-plan'` path in `apps/editor/src/engine/views/EdgeProjectorService.ts`.
- **Specified by:** [SPEC-51 §4.3](../../03-execution/specs/SPEC-51-VIEW-GENERATION-PIPELINE.md) (V-RCP-2)
- **Contracts:** C04 (rendering/scheduling), C102 (view & sheet integrity), C34 (print standards),
  C84 EI-3 (vocabulary)
- **Issue-log:** L-5512 (this decision), L-5500/L-5501 (the vocabulary split it exposed)

---

## 1 · Context — the behaviour was correct, and nothing said so

`grep -rniE "reflected ceiling|reflected-ceiling|\brcp\b" docs --include=*.md`, filtered to live
documents (not `/archive/`, `/legacy/`, `superseded`), returns **10 files** (measured 2026-08-22).
Nine mention RCP only as a member of a list. **Exactly one sentence in the entire live corpus
states RCP semantics:**

> SPEC-04 §6:212 — *"Default RCP: cut at Level + 2.4 m **looking down, mirrored**."*

That sentence is wrong twice, and the code is right twice:

| | SPEC-04 §6:212 said | The code does | Correct? |
|---|---|---|---|
| Projection direction | "looking **down**" | `ceilingPlan: { x: 0, y: **1**, z: 0 }` — **+Y, upward** (`ViewDefinitionTypes.ts:224`), selected at `EdgeProjectorService.ts:3980`; the union member's own comment reads *"Reflected Ceiling Plan — **looking upward**"* (`ViewDefinitionTypes.ts:57`) | **Code** |
| Reflection | "**mirrored**" | **no geometric mirror exists.** `rg -i "\bmirror" apps/editor/src/engine/views/` → **189 hits, every one the English sense** ("mirrors X", "a mirrored copy of the pen table") | **Code** |

⭐ **The uncomfortable part: the code was right by accident.** No document, comment, or test
asserts plan-handedness. A behaviour that is correct and unwritten is one refactor away from being
wrong — and the refactor is *especially* likely here, because the document that exists **instructs
a reader to add the mirror**. An engineer implementing SPEC-04 §6:212 faithfully would introduce
the exact defect this ADR forbids.

## 2 · Decision

**A reflected ceiling plan is drawn in the same handedness as the floor plan of the same level.**
For identical world coordinates, a point renders at the identical 2-D drawing position in the plan
and in the RCP. North is up in both. A room on the east of the plan is on the east of the RCP.

**No mirror transform is applied, and none may be added.**

## 3 · Why — the reflection is already in the coordinate mapping

An architect's mental model of an RCP is *"look up at the ceiling, then reflect the image down onto
the floor plane so it reads in plan orientation."* That is two operations, and their composition is
identity on handedness. The renderer performs that composition in one step rather than two:

- For plan-family views the projector maps world `(X, Z)` → drawing `(x, y)` and **drops Y**. That
  mapping does not consult the projection direction at all.
- The projection direction (`-Y` for plan, `+Y` for RCP) governs **clip ordering and which faces
  are toward the viewer** — S3/S4 of the pipeline — not the 2-D basis.
- The only `right`-vector basis in the projector is built in `resolveSectionVolumeBox`
  (`EdgeProjectorService.ts:1147`), whose first statement is
  `if (viewDef.viewType !== 'section' && viewDef.viewType !== 'elevation') return null;` (`:1154`).
  **It is unreachable for `'ceiling-plan'` by construction.**

Dropping Y is handedness-preserving whether you approach the plane from above or below. So the
"reflection" is not a missing step — **it is a step the coordinate convention already performed.**

⛔ **Adding a mirror on top would be a DOUBLE flip**, producing an RCP with east on the left. That
is the classic RCP bug, it looks plausible at a glance on a symmetric plan, and it is caught late
and expensively — usually by a contractor.

## 4 · Alternatives considered

**(a) Apply an explicit `scale(-1, 1)` and project downward (`-Y`), matching SPEC-04 §6:212 as
written.** Rejected. It is two errors that cancel: an RCP built this way is handed correctly but
its *depth* semantics are inverted — the near plane would face the floor, so occlusion and
face-culling resolve against the wrong side of the ceiling. It would draw the right layout with
the wrong things hidden, which is worse than an obvious failure because it survives review.

**(b) Keep the behaviour undocumented, and simply delete the wrong sentence from SPEC-04.**
Rejected. Deleting the claim removes the instruction to add the mirror but leaves the invariant
unstated, so the next implementer has nothing to check against. **An absence cannot be asserted
by a test.** This repo's characteristic defect is documentation describing behaviour that moved;
the mirror image of it is behaviour no documentation defends.

**(c) Make it a contract rather than an ADR.** Rejected. C102 §0.1's refusal table already
partitions view governance, and *"how is line work computed"* is the one question it leaves open —
SPEC-51 takes it. This is a single ratified decision inside that spec, which is what an ADR is for.

## 5 · Consequences

**Positive.** The invariant is now assertable, and cheaply — a single sign check. It closes the
gap that let a normative document instruct the opposite of the code for sixteen weeks.

**Negative / accepted.** This ADR ratifies handedness only. It says nothing about the RCP's
element set, occlusion, or styling — those remain **GAP** in SPEC-51 §2, deliberately, because
specifying them requires a measurement of the shared plan path that lane EPS19 holds and this lane
does not own. **Ratifying the one thing that was measured, rather than padding the rest, is the
point.**

## 6 · Enforcement — stated honestly

⚠ **There is no gate for this today, and this ADR does not claim one.** Saying "CI enforces this"
without naming a gate that runs is the L-809 defect, and `CLAUDE.md` carries five correction boxes
for that exact shape. What exists is the assertable form below; **building it is proposed, not
done**, and it belongs to whoever owns `apps/editor/src/engine/views/**` (lane EPS19).

For a level containing one element at world `(x = +5, z = 0)`:

```ts
// ARM A — handedness. The sign is the whole test.
expect(projectRcp(level).find(el).x).toBe(projectPlan(level).find(el).x);   // +5, NOT -5
expect(projectRcp(level).find(el).y).toBe(projectPlan(level).find(el).y);

// ARM B — the direction is still up, so ARM A cannot be satisfied by
// silently reverting the projection to -Y and passing for the wrong reason.
expect(getDirectionForView({ viewType: 'ceiling-plan', ... }).y).toBe(1);
```

⭐ **ARM B exists because ARM A alone is satisfiable by a regression.** Projecting downward with no
mirror also yields `x = +5` — it would pass ARM A while destroying the depth semantics alternative
(a) was rejected for. **One arm measures the layout, the other measures that it was reached
correctly.** A test that a wrong implementation can pass is not a test of the decision.
