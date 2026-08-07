# ADR-0306 — Fix once, import everywhere: when a fix is copied rather than shared, the defect survives its own fix

| Field | Value |
|---|---|
| **Status** | Accepted — 2026-08-07 |
| **Tag** | `§FIX-ONCE-IMPORT-EVERYWHERE` |
| **Owner** | Cross-cutting (governance) |
| **Motivated by** | `b431a17b` — the pre/post-trim arc-fitting defect fixed **three times in three files**, each fix a COPY, each copy leaving the next consumer broken |
| **Related** | ADR-0299 ("audit candidates with the same shape"), ADR-0302 §2, ADR-0303, ADR-0305 |

---

## The rule

**When a fix is copied rather than shared, the defect survives its own fix.**

A fix whose correctness depends on a frame, a convention, or a contract MUST live in ONE
module that every consumer imports, at the lowest layer that reaches them all. The remedy
for a recurring defect is never more vigilance at each copy — it is the deletion of the
copies.

The corollary that finds the instances: when the same defect is discovered independently
in a second file, STOP and hoist before fixing — the second discovery is the proof that
the first fix chose the wrong altitude.

## The motivating case (three fixes, one line of maths)

`SlabRegionTracer.wallPlanCenterline` fitted a Bézier through POST-trim endpoints with a
PRE-trim control point — a different curve, overshooting mid-span, folding the region ring
into a self-intersection and punching wedges through roof-by-region geometry. The **same
defect** had already been fixed in `WallFragmentBuilder` (`§V2-PRETRIM-FIX`) and in
`RoomDetectionEngine` (`§FIX-CURVED-WALL-PRETRIM-FRAME`, `ba7ee582`) — because each fix
was a copy, the third consumer stayed broken and produced a third founder-facing symptom.

The fix (`b431a17b`) hoisted `curvedWallTessellation.ts` to `@pryzm/core-app-model` (the
lowest package both consumers already depend on), reached by LEAF subpath exports so the
THREE-pulling barrels don't break `SlabRegionTracer`'s purity, with the old location left
as a re-export shim. `isSimple` was hoisted alongside (epsilons verbatim) so
`RoomPolygonUtils.isSimple` and the new slab refusal gate cannot drift.

## This is the dominant defect family of 2026-08-07

Instances confirmed in one day's commits (each independently discovered, each
founder-visible):

1. **Pre/post-trim arc frame** — three copies, three fixes, three symptoms (`b431a17b`,
   above).
2. **Resize routed to `onProjectSwitch()`** (`7131835c`, ADR-0302 §2) — ADR-0297 had
   already forbidden that lever for recovery and pinned it by test, but the resize
   subscription was never audited under the rule: the rule lived where it was written,
   not where the lever was pulled. The shared fix is one named entry point
   (`RenderPipelineManager.onViewportResize()`, `4f75386a` — a commit that carries this
   tag in its subject).
3. **`zoomToAll` re-implementing scene classification** (`bfed0f7d`, ADR-0305 §3) — two
   independent notions of "is this part of the model" excluded the gizmo in one place and
   framed it in another. Fix: both passes route through the one `SceneObjectClassifier`.
4. **Detached plugin store** (`7b406da1`) — `wall.setLayers` wrote a store nothing
   renders from; the identical defect class was already fixed for floor
   (`§FIX-FLOOR-TYPE-SWAP`, L-106) and slab (`§FIX-SLAB-TYPE-SWAP`); the wall lane never
   inherited the fix because the fix was a per-element patch, not a shared route.
5. **Remote replay factories** (`73edb837`, C08 §3.5) — annotation commands were dropped
   on replay by the exact failure class the file's own notes record as "already fixed"
   for furniture and stairs; fixed per-family, never as a completeness invariant, so each
   family rediscovers it.
6. **Hand-rolled double-buffered reprojection** (`5a6d82ed`, ADR-0304) — the
   compute-then-swap shape existed (`_reprojectActiveViewDoubleBuffered`, written for the
   crop drag, L-222) and the element-edit path simply never used it; two hand-rolled
   blanking copies of one operation are now one.
7. **Layered wall re-deriving the junction** (`5074471d`/`c87dc793`, ADR-0303) — the V2
   solver already answered the junction correctly; the layered branch kept a private
   legacy solver and inherited none of V2's guarantees.

## What reviewers and agents must do

- Before fixing a defect whose statement mentions a frame/convention/contract mismatch,
  `grep` for the tag or the maths of the previous fix. Finding a prior fix in another
  file means the task is a HOIST, not a patch.
- A hoist leaves a re-export shim at every old location so in-flight lanes keep resolving.
- When a rule is established about a lever (as ADR-0297 did for `onProjectSwitch`), audit
  **every caller of the lever**, not just the caller that raised the rule.
