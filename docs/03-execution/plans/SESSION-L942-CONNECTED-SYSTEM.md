# SESSION BRIEF — make wall moves PROPAGATE, 100%

**Single-objective session. Written 2026-08-17 after THREE failed production fixes.**
Paste everything below as the first message of the next session.

---

## 0. THE MISSION — one thing, and it is not "close L-942"

Make this true, in the browser, on the founder's own model:

> **A wall moves. Everything that depends on it follows. Nothing is left open, doubled,
> floating, or silently refused.**

**Do not stop at "the gate no longer blocks."** That is a symptom. Three fixes have already
been shipped to production, each correct in isolation, each at the wrong layer, and the
founder is still blocked. **The exit condition is the founder moving a perimeter wall in
`app.pryzm.so` and the model staying whole.**

## 1. ⛔ READ THIS BEFORE WRITING ANY CODE — the three failures, and why each looked green

L-942: **every wall move that breaks a junction is hard-blocked in production.** The founder's
console, unchanged across all three attempts:

```
[wallPlacementGate] §L-921-ATOMIC-GESTURE blocking wall <id>: the move is clear of every
opening, but its junction re-weld cannot be done soundly
(cascade ok=true, incumbentBreach=true) — nothing dispatched.
```

⭐ **`cascade ok=true, incumbentBreach=true` means THE GEOMETRY IS SOUND AND THE POLICY
REFUSED.** Every fix so far has been aimed at the policy. None has yet made the gesture work.

| # | SHA | What was fixed | Why it was still broken |
|---|---|---|---|
| 1 | `c2e8ba00` | shipped the incumbent gate | its **escape hatch (C83 §10.6) was never shipped** — a gate that can only say "no" |
| 2 | `6c676413` | threaded the discriminator into `WallMoveReweldService`; proved the follow there (11/11, 664/664, 9/9) | **a user's gesture does not go through the service.** It goes through `wallPlacementGate` → `moveReweldPreflight`, which **builds its own partner list** |
| 3 | `9bb11a4c` | threaded it at all three gate call sites; root tsc RC=0 | **still refuses.** Typechecked, never executed at the gate layer. Root cause NOT established |

> ⭐ **THE LESSON, and it is the reason this brief exists:** *proving a fix at the layer that
> **computes** is worth nothing if the layer that **decides** keeps its own copy of the
> inputs.* [[committed-is-not-reachable]] — three times in one day, each time with green
> tests.

**So: DO NOT WRITE A FIX FIRST. Establish the root cause first, at the layer the user
touches.** A fourth wrong-layer fix costs another 25-minute deploy and more of the founder's
trust.

## 2. START HERE — the diagnostic, before anything else

Run this in the browser console on `app.pryzm.so` (F12), project open, after a wall refuses:

```js
const g = window.semanticGraphManager;
const wid = '<the wall id from the refusal message>';
const q = g.getJoinedWalls(wid);
console.log('ok:', q.ok, '| ids:', q.joinedWallIds);
console.log('junctions:', JSON.stringify(q.junctions, null, 1));
```

**Branch on the answer — each points at a different layer, and only one of them is the
`§10.6` logic:**

| Reading | Meaning | Where the bug is |
|---|---|---|
| `junctions: undefined` | the reader change isn't live, or this isn't the object that was patched | build/bundling, or a second `SemanticGraphManager` instance |
| `junctions: [{wallId, junctionType: undefined}]` | **edges exist but carry NO metadata** | the WRITER — `WallRebuildCoordinator._flush` is bailing (`builder-lacks-junction-index` / `index-refused`) or never running |
| `junctionType: 'T', junctionDegree: 3` | the corner genuinely is not mutual | **§10.6 does not cover the founder's shape** — see §4, this is the likely one |
| `junctionType: 'L', junctionDegree: 2` | metadata correct | the bug is downstream, inside the gate |

⚠ **The writer HAS been verified to stamp the metadata** —
[`WallRebuildCoordinator.ts:177-181`](../../../apps/editor/src/engine/WallRebuildCoordinator.ts#L177)
does `junctionType: rec.type, junctionDegree: rec.degree`. But **`writeJoinedToForLevel` has
four early-return paths** that write NOTHING (`no-walls-on-level`, `builder-lacks-junction-index`,
`index-refused`, and a non-`ok` probe). **Nobody has checked which path production takes.**
That is a prime suspect and it is cheap to answer.

## 3. ⭐ THE STRONGEST UNEXPLAINED CLUE — do not skip this

A wall move that **SUCCEEDED** logged:

```
[WallMoveReweldService] §MOVE-REWELD-EMPTY-PLAN: moved wall <A> — 2 partner(s) considered
via joinedTo-graph [<B>, <C>], 0 re-weld entries and 0 refusals.
Every junction this move touched was left exactly as it was.
```

**Partners were found and NOTHING was computed** — not a follow, not a stem, not a refusal.
That is not "the discriminator said no". **That is the corner branch never being reached at
all**, which no current theory explains.

Suspects inside `computeMoveReweldPlan` (`packages/geometry-wall/src/WallMoveReweld.ts`), each
of which `continue`s silently:
- `if (dS > weldTol && dE > weldTol) continue;` — "was never joined here"
- `if (!corner) continue;` — near-parallel / degenerate
- `if (distToSegment(corner, newS, newE) > alongMoverReach) continue;`
- `if (displacement > alongPartnerReach) continue;` — spike refusal
- `if (dist(corner, far) < DEGENERATE_STUB_LENGTH) continue;`
- `authorship.kind === 'ambiguous'` → refusal, but that WOULD have been reported

**Every one of those is a silent drop.** Instrument them — a plan that considered 2 partners
and emitted nothing must SAY WHY per partner. That instrumentation is worth more than the
next fix, and it is the honest version of this codebase's own rule: *a dropped junction with
nobody told is L-921 wearing L-922's clothes.*

## 4. ⚠ THE LIKELY REAL ROOT CAUSE — §10.6 may be too narrow for real buildings

C83 §10.6 permits the follow ONLY at `junctionType === 'L' && junctionDegree === 2`.

**The founder's model is a cross/T-shaped perimeter** (see the screenshots in ISSUE-LOG L-942).
Real perimeters produce corners that the junction resolver may classify as `T`, `Y`, `X` or
`N-WAY`, not `L`. And the refusal quoted a partner shift of **6513 mm** — a 6.5 m move, which
does not look like a simple 2-wall corner re-seat.

> **So the question the next session must answer is architectural, not mechanical:**
> **on a real closed perimeter, what junction types actually occur, and which of them SHOULD
> follow?**

The founder's rule (§5 below) says *the adjacent perimeter walls must extend, shorten, rotate
or reposition as necessary to maintain a closed perimeter*. That is a statement about a
**closed loop**, not about degree-2 corners. **§10.6's `L`/2 test may be measuring the wrong
property.**

⛔ **DO NOT simply widen the predicate to make it pass.** L-922 is the reason the narrow test
exists: an interior wall's move dragged a **perimeter** baseline 2.19 m and re-seated three
hosted doors. **Whatever replaces the test must still refuse THAT**, and
`wallMoveReweldSeam.test.ts` holds a load-bearing control that proves it (it goes RED when the
discriminator check is removed — verify that still holds).

**A promising direction, not a decision:** the discriminator that matters may be
*"is the partner part of the same closed loop as the subject?"* rather than the junction's
degree. If so it is a **C83 §10.6 amendment and needs founder confirmation** — §10.6 was
itself confirmed on 2026-08-17, and §10.6.7 records that shipping a gate without its escape
hatch is what caused this.

## 5. THE FOUNDER'S SPEC — capture this to a doc; it exists nowhere else

Issued 2026-08-17, verbatim intent. **This is the definition of done for the programme, not
just for L-942.**

> **PRYZM 3.0 — Architectural Topological and Parametric Wall Behaviour.** The building model
> must behave as a **connected architectural system**, not a collection of independent
> geometric objects.

1. **Perimeter wall behaviour.** A closed external perimeter is ONE connected boundary. Move
   one perimeter wall: it moves **perpendicular to its own wall vector**; it stays connected;
   **the adjacent perimeter walls extend, shorten, rotate or reposition as necessary to keep
   the perimeter closed and valid**; corners resolve automatically. No gaps, no overlaps.
2. **Elements dependent on the perimeter.** When the perimeter changes, regenerate: structural
   /architectural **slabs, floor finishes, ceilings, roof geometry, roof finishes, affected
   rooms**. Preserve thicknesses, offsets, levels unless the user changes them.
   *(⚠ THIS IS THE SUSPECTED LARGE GAP AND IS UNAUDITED.)*
3. **Interior walls.** Four connected interior walls define a room. Move one: connected walls
   adapt, endpoints stay joined, **room boundary regenerates**, area and dimensions update,
   floor finishes and ceilings adapt.
4. **Polyline / multi-segment walls.** A polyline behaves as ONE connected system. Move a
   segment: neighbours follow, corners stay connected, the polyline stays continuous, bounded
   rooms update.
5. **Perimeter ↔ interior.** An interior wall connected to the perimeter follows when the
   perimeter moves, stays connected, and its downstream walls adapt. Never produce
   disconnected ends, gaps, overlaps, floating walls or invalid rooms. **The connection is a
   persistent RELATIONSHIP, not a coincidence of coordinates.**
6. **Hierarchical dependency.** DESIGN INTENT → BUILDING PERIMETER → CONNECTED WALL NETWORK →
   ROOM BOUNDARIES → SLABS/FLOORS/FINISHES → CEILINGS → ROOFS. A change at any level
   propagates down. The user should not redraw dependents by hand.
7. **Preserve intent, not coordinates.** Ask *"what architectural relationships must remain
   true after this change?"*, not *"which objects have fixed coordinates?"*
8. **Core principle — MOVE → PROPAGATE → RECOMPUTE.** Not MOVE → BREAK → MANUALLY REPAIR.

## 6. A SECOND, SEPARATE DEFECT FOUND IN THE SAME LOG — file it

```
[SlabWallConnectivityService] §L-921-SLAB-PREFLIGHT preview failed (non-fatal):
TypeError: t.getAll is not a function
  at h6.canExecute (...)
```

**A preflight is CRASHING on every wall move.** Marked non-fatal — but a preflight that throws
answers nothing, and this whole programme exists because *"I could not look"* and *"nothing is
wrong"* must never be the same value. The slab arm of the gesture is currently blind. Almost
certainly a store-shape mismatch (something is passed a bare object where a store with
`getAll()` is expected). File it and fix it; it is independent of the §10.6 work and may be
masking slab-side propagation failures relevant to spec §2.

## 7. STATE — what is committed, what is proven, what is not

**Production: `9bb11a4c`, bundle proof 6/6.** Still refuses. `main` is ahead with test work.

**Green and must stay green** (they do NOT prove the gesture works — that is the point):
- `packages/command-registry/__tests__/wallMoveReweldSeam.test.ts` **11/11** — holds C83
  §10.6.5's three controls incl. the **load-bearing L-922 `T`/degree-3 control**, verified to
  go RED under negative control
- `packages/command-registry/__tests__/hostedOpeningHostMoveSeam.test.ts` **9/9** — the
  extend+shrink round-trip; a door's world position is preserved (`offset 0.000 → 2.000 m`)
- `packages/geometry-wall` **664/664** · root tsc **RC=0**

**Known failing — stale defect-measurements, NOT broken behaviour** (9 tests, two files):
`L936InteriorLPairMove.measure.test.ts`, `L932AngledWallMove.measure.test.ts`. Their describe
blocks literally say *"the partner is REACHED, **and then deliberately left behind**"*. They
measured the defect. ⛔ **Do not flip numbers until green** — derive the expected seat
analytically, assert the far endpoint byte-identical, assert the loop is still closed.

**A workflow (`wzxiwzxrk`) was running at session end**: a gate-layer reachability test, a
census of every partner-construction site, and the measure-test rewrites. **Check `git log`
and read its results before doing anything — the census in particular may already name the
fourth call site.**

**⚠ There is still NO test that drives `wallPlacementGate`.** Writing one is the single
highest-value artefact this session can produce, whatever the root cause turns out to be.

## 8. DISCIPLINE — every one of these was broken on 2026-08-17

- **MEASURE, never infer.** A stated premise lost to a measurement **six times**; four were
  the agent's own, two inside its own fix.
- **§EXIT-CODE-THROUGH-A-PIPE.** Never `| tail` a verdict. `CMD > out.txt 2>&1; echo "RC=$?"
  >> out.txt`, then read the file. Misread **five times**; once the text said FAILED and the
  piped code said 0.
- **Root tsc: `NODE_OPTIONS=--max-old-space-size=8192`.** Exit **134** = OOM, not a type
  error, no diagnostics printed. Misread four times.
- **A control that cannot fail is not a control.** Watch every assertion go red first. One
  L-922 control this session stayed GREEN with the safety check removed.
- **A refusing half and its escape hatch ship together, or neither ships** (C83 §10.6.7).
- **Exit 3 is never absorbable** (C70 §5.1).
- **Never `git stash`** (global across worktrees). Commit scoped paths; never `git add -A`.
- **Clean up probe artefacts** — two lanes left `__scratchProbe.test.ts` and
  `tsconfig.__probe.json` behind, and they ran as suite failures.
- **Deploy:** read `DEPLOY-CONTRACT-MANUAL-FLY.md` **§6.7 first**. The bundle proof failed a
  HEALTHY deploy and says `ROLL BACK NOW, DO NOT RETRY`. Do not run it until the deploy script
  has EXITED. **L-941 is that fix and it is HIGH.**

## 9. THE ORDER OF WORK

1. **Diagnose** (§2 probe + §3 instrumentation). Do not fix anything yet.
2. **Write the gate-layer test** that reproduces the founder's refusal. Watch it fail.
3. **Establish the root cause** and say plainly which of the four §2 branches it is.
4. **If it is §4** — the predicate is too narrow — **stop and put the amendment to the founder
   before coding.** It changes what §10.1 permits, and that is exactly the decision that must
   not be made on an agent's reading of intent.
5. **Fix, prove at the gate layer, prove the L-922 control still goes red, deploy, and ask the
   founder to confirm in the browser.**
6. Only then: the 9 stale measure tests, the slab-preflight crash (§6), and spec §2's audit.

**Do not report this as fixed until the founder has moved a wall and said so.** That sentence
has been written three times today and been wrong three times.
