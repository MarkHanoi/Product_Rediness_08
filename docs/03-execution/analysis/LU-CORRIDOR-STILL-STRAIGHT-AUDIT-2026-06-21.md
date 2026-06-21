# Why generated corridors are still straight (L/U not appearing) — audit (2026-06-21)

**Founder (live, after Step 3 shipped):** rooms are *better connected* now, but corridors are still
straight — the L/U shapes don't appear.

## Root — the L-comb is a FALLBACK, not a competing shape
Step 3 (`b865ec51`) wired `planLCorridorComb` into `tryNoPublicDoubleLoadedCarve` at exactly ONE
point: the `!combA || !combB` branch — i.e. it fires **only after BOTH the double-loaded AND the
single-loaded straight combs have failed**. It is a last-resort rescue for plates the straight carve
cannot handle at all.

Consequence: on a plate where the **straight comb succeeds** (which is now MORE common — the
`§HORZ-SHARED-WALL-FIX` from `3ad38a59` made straight corridors connect rooms on horizontal edges
that previously sealed), the L-comb's fallback is never reached → a **straight corridor ships**. The
L only appears in the extreme case where the straight double- AND single-loaded combs both bail.

So the engine treats the L-corridor as "better than a sealed squarify" but NOT as "a shape that can
beat a working straight corridor." That is why L/U don't show up on the cases the founder is testing.

## What the SPEC/ADR actually want — L/U as FIRST-CLASS competing shapes
SPEC-0074 Fix A and ADR-0073 frame the corridor as a first-class spine whose SHAPE (straight / L / U)
is chosen the way the **kitchen** chooses I/L/U: generate every admissible shape, score them, ship
the best (`chooseShape` + `generateAndRank` in `kitchenLayout.ts`). The corridor has no equivalent —
its shape is a side effect of which carve happened to succeed first, with straight always winning
because it is tried first.

## Fix options (ranked by risk)

### Option 1 (RECOMMENDED, medium risk, browser-gated) — make the L-comb COMPETE
Run `planLCorridorComb` **alongside** the straight double-loaded carve (not only on its failure), and
pick the better result by an explicit preference/score:
- Prefer L/U when it connects strictly MORE rooms to the corridor than the straight carve, OR when it
  reaches the stair (`stairsBridgedToCorridor`) and the straight carve does not, OR (founder's
  aesthetic) when the plate is non-elongated enough that an L reads better than a long thin straight
  run.
- Keep straight when it already serves every room AND the L offers no connectivity/stair gain (so
  simple rectangular plates stay straight — byte-identical where L adds nothing).
- This needs the stair `keepOut` threaded into `tryNoPublicDoubleLoadedCarve` (currently not passed)
  so the L can be stair-anchored (Step 2 already supports it). It changes MANY layouts → full
  `house*.test.ts` green + browser sign-off on several plates before deploy.

### Option 2 (smaller, lower risk) — widen the L trigger to "straight succeeds but stair sealed"
Fire the L-comb when the straight comb succeeds BUT `§DIAG-STAIR-CIRC sharesStairWall=NO` (the stair
isn't on the corridor). The stair-anchored L would bring a leg to the stair. Narrower than Option 1
(only fires when the straight corridor leaves the stair sealed), so fewer layouts change — but it
also makes L appear less often than the founder wants (only on stair-sealed plates).

### Option 3 (lowest risk, not a real fix) — leave as fallback
Current behaviour. L only on plates the straight carve can't handle. The founder has confirmed this
does NOT produce visible L/U shapes on normal plates → does not meet the ask.

## Recommendation
**Option 1** is the only one that delivers the founder's "L/U corridors should appear" — but it is a
layout-changing, scored-competition change that must be browser-verified (the 5×-revert subsystem).
It is NOT a low-risk item; it needs a dedicated, test-first, founder-verified pass. The primitive
(`planLCorridorComb`, stair-anchored, corridor-emitting) is already complete and tested, so Option 1
is "thread `keepOut` in + add the compete-and-pick decision + gate", not new geometry.

Until then, the honest status: Step 3 improved CONNECTIVITY (the founder confirmed) but the corridor
SHAPE stays straight because the L is a rescue, not a competitor.
