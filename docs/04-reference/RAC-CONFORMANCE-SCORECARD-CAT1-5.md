# RAC Conformance Scorecard — Categories 1–5

**Measured 2026-08-11** · harness `tools/rac-conformance/` · branch `main`
**Scope**: the founder's operations 1–53 — PROJECT/STRUCTURE, WALLS, OPENINGS,
SLABS, ROOFS. Categories 6–10 are a separate agent's scorecard.

> This document is a MEASUREMENT, not a plan. Every number in it is produced by
> a re-runnable script named at the bottom. Where a claim could not be
> established, the cell says **UNPROVEN** — which is a different fact from FAIL,
> and the two are never merged.

---

## 0 — Why this exists

The 2026-08-11 engineering audit found D14 to be the strongest subsystem in the
repository — 45 capabilities, 319 bus commands, **UNDECLARED: 0**, 138 examples
executed, 24 adversarial utterances non-mutating — and then named the exact
limit of that strength:

> It proves **declaration ↔ route**. It does **not** prove **route →
> AUTHORITATIVE STATE**. §8 questions 7–9 are UNPROVEN for every sampled
> capability.

"It worked" is seven different claims. This scorecard scores all seven,
independently, for every operation:

| | verdict | what would prove it |
|---|---|---|
| **V1** | RESOLVE | the utterance lands on the intended capability, not a rival grammar |
| **V2** | DISPATCH | it reaches the intended bus command **carrying the intended numbers** |
| **V3** | STATE | the store the **renderer and persistence** consult now holds the new value — not `success === true`, not a call count, not the plugin DTO store |
| **V4** | PERSIST | save → reload → still there |
| **V5** | UNDO | one undo reverses it, and reverses **the right thing** |
| **V6** | SYNC | it reaches the collaboration layer (only where C66 claims it does) |
| **V7** | REPORT | the transcript is TRUE — partial says partial, refusal names its code |

---

## 1 — Headline

**Of 53 operations the founder named in categories 1–5, 24 have no route at all,
and the RAC's answer to most of them is silence.**

| | count |
|---|---|
| operations scored | **55** (53 named + 2 split where one name covered two asks) |
| **V1 RESOLVE** | 26 PASS · **24 FAIL** · 5 UNPROVEN |
| **V2 DISPATCH** | 25 PASS · **27 FAIL** · 3 UNPROVEN |
| **V3 STATE** | 0 PASS · **1 FAIL** · 54 UNPROVEN |
| **V4 PERSIST** | 0 PASS · **1 FAIL** · 54 UNPROVEN |
| **V5 UNDO** | 0 PASS · 0 FAIL · **55 UNPROVEN** |
| **V6 SYNC** | 0 PASS · 0 FAIL · **55 UNPROVEN** |
| **V7 REPORT** | 2 PASS · **21 FAIL** · 32 UNPROVEN |

**V3–V6 are UNPROVEN for all but one row, and that is the honest answer, not a
harness failure.** The audit's gap is not closed by this pass; it is *measured
and localised*. §6 states exactly what is needed to close it and hands over the
diff.

**The one exception is the most important result in this document.** For
`set-roof-pitch` — the only roof-editing capability the chat has — V3 and V4 are
not UNPROVEN but **FAIL, proven by static call-graph evidence**: the verb it
dispatches is registered by a handler that writes a store with **no committer,
no reader, and no serializer**. The chat says "Done" and the roof does not
change. §5.

Three results matter more than the tally:

1. **One adversarial utterance MUTATED, destructively.** `undo would remove the
   wall, right?` — a hypothetical — dispatches `element.delete` on the selected
   wall. §4.
2. **`set-roof-pitch`, the only roof-editing capability the chat has, is routed
   to a verb claimed by TWO handlers that disagree about which store is
   authoritative.** The D14 gate cannot see this class of defect at all. §5.
3. **The founder-flagged category-5 geometry defects are FIXED.** Every
   measurement below is 300.00 mm against 300 mm requested, spread 0.000 mm. §3.
4. **`set-roof-pitch` writes a dead store — PROVEN, not suspected.** And because
   the defect is in the VERB, not in the chat, the roof **property panel** and the
   **3-D move gizmo** dispatch the same dead verb. §5.

---

## 2 — The scorecard

`PASS` / `FAIL` / `UNPR` = UNPROVEN. Reasons for every non-PASS are in §7.

| # | operation | utterance driven | V1 | V2 | V3 | V4 | V5 | V6 | V7 |
|---|---|---|---|---|---|---|---|---|---|
| 1.1 | create project | `create a new project called Villa Alba` | FAIL | FAIL | UNPR | UNPR | UNPR | UNPR | UNPR |
| 1.2 | create site | `create a site` | FAIL | FAIL | UNPR | UNPR | UNPR | UNPR | FAIL |
| 1.3 | create building | `create a building` | FAIL | FAIL | UNPR | UNPR | UNPR | UNPR | FAIL |
| 1.4 | create Level 0 | `create level 0` | PASS | PASS | UNPR | UNPR | UNPR | UNPR | UNPR |
| 1.5 | create Level 1 | `create a new level at 3m` | PASS | FAIL | UNPR | UNPR | UNPR | UNPR | PASS |
| 1.6 | rename level | `rename Level 1 to First Floor` | FAIL | FAIL | UNPR | UNPR | UNPR | UNPR | PASS |
| 1.7 | change level elevation | `set level 1 elevation to 3.5m` | FAIL | FAIL | UNPR | UNPR | UNPR | UNPR | FAIL |
| 1.8 | add another level | `add a level` | PASS | PASS | UNPR | UNPR | UNPR | UNPR | UNPR |
| 1.9 | move a level | `move level 1 up by 500mm` | FAIL | FAIL | UNPR | UNPR | UNPR | UNPR | FAIL |
| 1.10 | delete a level | `delete level 2` | FAIL | FAIL | UNPR | UNPR | UNPR | UNPR | UNPR |
| 2.1 | create exterior wall | `draw a wall from (0,0) to (5,0) height 3m` | PASS | PASS | UNPR | UNPR | UNPR | UNPR | UNPR |
| 2.2 | create interior wall | `create an interior wall from (0,0) to (4,0)` | PASS | PASS | UNPR | UNPR | UNPR | UNPR | UNPR |
| 2.3 | set wall length | `set the wall length to 6m` | FAIL | FAIL | UNPR | UNPR | UNPR | UNPR | FAIL |
| 2.4 | set wall height | `set height to 3m` | PASS | FAIL | UNPR | UNPR | UNPR | UNPR | UNPR |
| 2.5 | set wall thickness | `make this wall 300mm thick` | PASS | PASS | UNPR | UNPR | UNPR | UNPR | UNPR |
| 2.6 | move wall | `move this wall 500mm north` | FAIL | FAIL | UNPR | UNPR | UNPR | UNPR | FAIL |
| 2.7 | rotate wall | `rotate this wall by 90 degrees` | FAIL | FAIL | UNPR | UNPR | UNPR | UNPR | FAIL |
| 2.8 | change wall type | `make all walls interior partition` | PASS | PASS | UNPR | UNPR | UNPR | UNPR | UNPR |
| 2.9 | change wall material | `make all walls white` | PASS | PASS | UNPR | UNPR | UNPR | UNPR | UNPR |
| 2.10 | add wall layer | `add a 12mm plasterboard layer to all walls` | PASS | PASS | UNPR | UNPR | UNPR | UNPR | UNPR |
| 2.11 | remove wall layer | `remove the plasterboard layer from all walls` | **FAIL** | **FAIL** | UNPR | UNPR | UNPR | UNPR | UNPR |
| 2.12 | connect / intersect walls | `join these two walls` | FAIL | FAIL | UNPR | UNPR | UNPR | UNPR | FAIL |
| 2.13 | split wall | `split this wall at the midpoint` | FAIL | FAIL | UNPR | UNPR | UNPR | UNPR | FAIL |
| 2.14 | delete wall | `remove this wall` | PASS | PASS | UNPR | UNPR | UNPR | UNPR | UNPR |
| 2.15 | undo wall deletion | `undo` | PASS | PASS | UNPR | UNPR | UNPR | UNPR | UNPR |
| 2.16 | redo wall deletion | `redo` | PASS | PASS | UNPR | UNPR | UNPR | UNPR | UNPR |
| 3.1 | add door | `add a door to this wall` | FAIL | FAIL | UNPR | UNPR | UNPR | UNPR | FAIL |
| 3.2 | move door | `move the door 500mm to the right` | FAIL | FAIL | UNPR | UNPR | UNPR | UNPR | FAIL |
| 3.3 | change door type | `change all doors to glazed timber` | PASS | PASS | UNPR | UNPR | UNPR | UNPR | UNPR |
| 3.4 | change door width | `set door width to 900mm` | PASS | PASS | UNPR | UNPR | UNPR | UNPR | UNPR |
| 3.5 | add window | `create a window in the middle of every wall segment` | PASS | PASS | UNPR | UNPR | UNPR | UNPR | UNPR |
| 3.6 | move window | `move this window 300mm left` | FAIL | FAIL | UNPR | UNPR | UNPR | UNPR | FAIL |
| 3.7 | change window size | `set the window width to 1.2m` | PASS | PASS | UNPR | UNPR | UNPR | UNPR | UNPR |
| 3.8 | delete opening | `remove every window on level 2` | PASS | PASS | UNPR | UNPR | UNPR | UNPR | UNPR |
| 3.9 | undo opening change | `undo` | PASS | PASS | UNPR | UNPR | UNPR | UNPR | UNPR |
| 3.10 | reload and verify openings | *(save/reload cycle)* | UNPR | UNPR | UNPR | UNPR | UNPR | UNPR | UNPR |
| 4.1 | create slab | `create a slab` | FAIL | FAIL | UNPR | UNPR | UNPR | UNPR | FAIL |
| 4.2 | change slab thickness | `set the slab thickness to 250mm` | PASS | FAIL | UNPR | UNPR | UNPR | UNPR | UNPR |
| 4.3 | change slab boundary | `change the slab boundary to the room outline` | FAIL | FAIL | UNPR | UNPR | UNPR | UNPR | FAIL |
| 4.4 | add floor finish | `add floor finishes to all rooms` | PASS | PASS | UNPR | UNPR | UNPR | UNPR | UNPR |
| 4.5 | change slab material | `change all slabs to rc slab monolithic 200mm` | PASS | PASS | UNPR | UNPR | UNPR | UNPR | UNPR |
| 4.6 | move slab | `set the base offset to 150 mm` | PASS | PASS | UNPR | UNPR | UNPR | UNPR | UNPR |
| 4.7 | delete slab | `delete selected` | PASS | PASS | UNPR | UNPR | UNPR | UNPR | UNPR |
| 4.8 | rebuild / reload slab | *(save/reload cycle)* | UNPR | UNPR | UNPR | UNPR | UNPR | UNPR | UNPR |
| 5.1 | create pitched roof | `create a pitched roof` | FAIL | FAIL | UNPR | UNPR | UNPR | UNPR | FAIL |
| 5.2 | create hip roof | `create a hip roof` | FAIL | FAIL | UNPR | UNPR | UNPR | UNPR | FAIL |
| 5.3 | create mansard roof | `create a mansard roof` | FAIL | FAIL | UNPR | UNPR | UNPR | UNPR | FAIL |
| 5.4 | set roof pitch | `set the roof pitch to 30 degrees` | PASS | PASS | **FAIL** | **FAIL** | UNPR | UNPR | UNPR |
| 5.5 | set ridge | `set the ridge height to 2m` | **FAIL** | **FAIL** | UNPR | UNPR | UNPR | UNPR | UNPR |
| 5.6 | set overhang | `set the roof overhang to 300mm` | FAIL | FAIL | UNPR | UNPR | UNPR | UNPR | FAIL |
| 5.7 | modify roof footprint | `change the roof footprint to the building outline` | FAIL | FAIL | UNPR | UNPR | UNPR | UNPR | FAIL |
| 5.8 | modify roof height | `set height to 3m` | PASS | PASS | UNPR | UNPR | UNPR | UNPR | UNPR |
| 5.9 | invalid footprint → REFUSE | `create a roof on a footprint of (0,0)(0,0)(0,0)` | UNPR | PASS | UNPR | UNPR | UNPR | UNPR | FAIL |
| 5.10 | impossible offset → REFUSE | `shrink the roof footprint by 50m` | UNPR | PASS | UNPR | UNPR | UNPR | UNPR | FAIL |
| 5.11 | save/reload roof, verify geometry | *(save/reload cycle)* | UNPR | UNPR | UNPR | UNPR | UNPR | UNPR | UNPR |

---

## 3 — Category 5 geometry, measured in millimetres

The founder's bar: *requested overhang 300 mm → measured perpendicular distance
from the source boundary = 300 mm ± tolerance.* Not "the roof looks okay."

**The oracle.** For a parallel offset by `d`, **every edge midpoint** of the
result sits exactly `d` from the source boundary. Midpoints are used
deliberately — they avoid the corner mitre wedge, where a *correct* offset also
moves the vertex further than `d`. A centroid scale pulls each point back in
proportion to its distance from the centre, so the per-edge distances fan out.
Therefore **magnitude ≈ d** proves the offset is the right size, and **spread ≈
0** proves it is an offset and not a scale. Only both together are a proof.

Tolerance: |mean − d| ≤ 1 mm **and** spread ≤ 1 mm.

| case | requested | verts src→out | mean mm | min mm | max mm | **spread mm** | verdict |
|---|---:|---|---:|---:|---:|---:|---|
| square 10×10, +overhang | 300 | 4→4 | 300.00 | 300.00 | 300.00 | **0.000** | PASS |
| elongated 40×4, +overhang | 300 | 4→4 | 300.00 | 300.00 | 300.00 | **0.000** | PASS |
| L-plan, +overhang | 300 | 6→6 | 300.00 | 300.00 | 300.00 | **0.000** | PASS |
| U-plan / courtyard, +overhang | 300 | 8→8 | 300.00 | 300.00 | 300.00 | **0.000** | PASS |
| square 10×10, inset | −200 | 4→4 | 200.00 | 200.00 | 200.00 | **0.000** | PASS |
| L-plan, inset | −200 | 6→6 | 200.00 | 200.00 | 200.00 | **0.000** | PASS |

**Impossible offset — refuse, never substitute:**

| case | result |
|---|---|
| square 10×10, inset 50 m (inradius 5 m) | `degenerate=true`, 0 verts, *"inward offset consumed the ring"* — **REFUSED, correct** |
| square 10×10, inset 5 m (exactly the inradius) | `degenerate=true`, 0 verts, *"offset collapsed the ring"* — **REFUSED, correct** |
| L-plan, inset 50 m | `degenerate=true`, 0 verts — **REFUSED, correct** |

**Degenerate footprint:**

| case | result |
|---|---|
| 3 identical points | `degenerate=true`, *"fewer than 3 distinct vertices"* — correct |
| 2 points only | `degenerate=true` — correct |
| **collinear 3 points (0,0)(5,0)(10,0)** | **`degenerate=false`** — ⚠ see below |

### 3.1 The four founder-flagged geometry defects are FIXED

All four were fixed by the concurrent `§W2A-ONE-OFFSET` change and are confirmed
gone by measurement, not by reading the diff:

| flagged defect | status |
|---|---|
| `applyOverhang` is a centroid radial dilation sold as a parallel offset — 300 mm requested delivers 212 mm | **FIXED.** Algorithm deleted; a tombstone at `packages/geometry-kernel/src/producers/_internal/roof/polygon.ts:120-159` forbids reintroduction and records the old error table (300→212.13 mm on 10×10; 29.85–298.51 mm on 40×4). Replaced by a true mitred Minkowski offset, `offsetPolygon` in `packages/geometry-kernel/src/pure/polygonOffset.ts`. **Measured 300.00 mm, spread 0.000 mm on all four plan shapes above, including the L and U the old code could not represent.** |
| `shrinkPolygon` deletes vertices and returns 2-vertex "polygons" as success | **FIXED.** Deleted; the collinear-edge branch now *translates* the vertex instead of `continue`-ing past it. Vertex count preserved 4→4, 6→6, 8→8 in every case above. |
| mansard silently returns a hip; pitched silently returns flat, identical BufferGeometry, no log | **FIXED.** `produceRoof` (`packages/geometry-kernel/src/producers/roof.ts:179-284`) genuinely branches: hip = one inward offset at −inradius; mansard = **two** offsets (skirt at −inradius·0.4 at 0.75·ridge, top at −inradius) into a 3-level build. Where a fallback does occur it now *labels* itself `{requested:'mansard', produced:'hip'}` and folds that into the geometry hash — so the substitution is no longer byte-identical or silent. |
| a convex hull is committed as the building perimeter | **NOT PRESENT.** Zero matches for `convexHull` / `grahamScan` / `monotoneChain` in any `.ts`/`.tsx` in the repo. The only convexity code is a *predicate* (`isConvexPolygon`, used to route between builders), not a hull. |

The single-implementation rule is now machine-enforced by
`tools/ga-gate/check-offset-implementations.ts` (structural match on "shifted
supporting lines" vs "radial displacement from centroid", baseline 0,
shrink-only).

### 3.2 One residual geometry finding

**A zero-area collinear ring is not reported as degenerate.**
`offsetPolygonOrSelf([[0,0],[5,0],[10,0]], 0.3)` returns `degenerate=false` with
3 vertices. Three collinear points have zero area and no interior; there is no
"outward" for an offset to go. The `< 3 distinct vertices` guard catches
duplicates but not collinearity. This is the surviving instance of *"a
degenerate footprint reported as success"* — much narrower than the original
`shrinkPolygon` defect, and it is the exact input row 5.9 asks about. **Not
fixed by me** (`packages/geometry-*` is another agent's tree); handed over in §6.

---

## 4 — Adversarial corpus: one destructive mutation

Fourteen read-only or hostile utterances were driven with a wall selected. A
read-only question must never mutate. **Thirteen were clean. One was not.**

| utterance | why adversarial | mutated? |
|---|---|---|
| `undo would remove the wall, right?` | hypothetical about undo | **YES — dispatches `element.delete` on the selected wall** |
| `how thick is this wall?` | informational | no (miss) |
| `what is the roof pitch?` | informational | no (miss) |
| `how many levels does this project have?` | informational | no (miss) |
| `should I make all walls interior partition?` | question *about* an operation | no (miss) |
| `why is the slab thickness 250mm?` | explanatory | no (miss) |
| `if I set the pitch to 45 degrees, what happens?` | hypothetical | no (refusal) |
| `do not delete this wall` | negation | no (miss) |
| `I did not ask you to add a level` | negation + paste-back | no (miss) |
| `Changed 4 of 6 walls — 2 skipped: no system type` | our own report fed back | no (miss) |
| `Level 1 elevation 3.0 m, 4 walls, 2 doors` | report-shaped noun phrase | no (miss) |
| `a window with 4 panes` | the `with → width` stopword repro | no (miss) |
| `the door is 900mm wide` | a statement of fact | no (refusal) |
| `can PRYZM create a mansard roof?` | capability question | no (miss) |

### F-1 — `undo would remove the wall, right?` deletes the wall

```
observed: commands[tier nl] intent=delete-selected
        → element.delete({"elementId":"rac-wall-0","elementType":"wall",
                          "source":"AI_CHAT_ZERO_TOKEN"})
```

The local-NL delete grammar matches `remove … wall` anywhere in the sentence
with no guard for hypothetical framing (`would`, `right?`) or for the fact that
the sentence's main verb is `undo`. C68 §5.f's adversarial corpus contains
negations and paste-backs but no HYPOTHETICAL-ABOUT-A-DESTRUCTIVE-VERB, so the
D14 gate's own 24-utterance corpus does not catch it either.

**The same root cause produces row 2.11:**

```
"remove the plasterboard layer from all walls"
  → element.delete on the selected WALL
```

A user asking to remove a **layer** has their entire **wall** deleted. Both are
the same defect: a destructive grammar with too-wide a match and no
hypothetical/qualifier guard. Severity is highest for a destructive verb,
because C68 §5.g's honest-report obligation cannot help after the fact.

---

## 5 — The V3 finding the D14 gate cannot see

### F-2 — `roof.update` is claimed by TWO handlers that disagree about the authoritative store

`set-roof-pitch` is the **only** roof-editing capability the chat has. It
dispatches `roof.update`. Two handlers register that verb:

| | file | writes |
|---|---|---|
| **A** | `plugins/roof/src/handlers/UpdateRoof.ts` | `produceCommand` against `ctx.stores.roof` — the **PluginRegistry DTO store**, `affectedStores: ['roof'] as const`, no `commandManager`. Enrolled in `ROOF_HANDLER_TYPES` (`plugins/roof/src/handlers/index.ts:33`). |
| **B** | `apps/editor/src/engine/initBusHandlers.ts:598` | a legacy bridge, `stores: [] as const`, running `UpdateRoofCommand` against the **authoritative geometry `RoofStore`** (`packages/geometry-roof/src/RoofStore.ts`) that `RoofFragmentBuilder` and `ProjectSerializer` read. |

**Only one can win, and the first registration does.** `CommandBus.register`
throws on a duplicate (`packages/command-bus/src/CommandBus.ts:95`), so the
bridge loop guards itself:

```ts
// apps/editor/src/engine/initBusHandlers.ts:2201
if (runtime.bus.registry?.has?.(spec.type as any)) continue;   // ← first wins
```

Signature **A** is precisely the `§FIX-CHAT-DEAD-ROUTES` shape — presumed
detached, and right 13 times out of 13 so far.

**Why the D14 gate passes it.** Check 3d classifies route liveness by the
**path** of the `commandProof` file: `packages/command-registry/**` → *"LIVE by
construction"*. `set-roof-pitch`'s proof is
`packages/command-registry/src/roofs/UpdateRoofCommand.ts`, so it passes — while
**that file's own first line reads:**

```
// TODO(E.5.x): ORPHANED — UpdateRoofHandler (plugins/roof/src/handlers/UpdateRoof.ts)
// was migrated to produceCommand (TASK-07 Phase B). This class is no longer called by
// that handler.
```

A commandProof that says *"no longer called"* proves nothing. The gate accepts
it because of **where it lives**, not because anything calls it. The gate's
liveness rule is a presumption about a directory; shadowing is invisible to it.

**Wall shows the fix that roof never received.** `wall.updateDimensions` had the
identical duplicate. L-815 (§FIX-DIMS-REACH-RECORD) resolved it by **deleting
the verb from `WALL_HANDLER_TYPES`**, leaving the editor bridge to win by
default; the handler class still exists and still names the verb, but is never
built. `'roof.update'` is still in `ROOF_HANDLER_TYPES`. **The same one-line fix
was never applied to roof.**

### F-2a — RESOLVED BY EVIDENCE: the plugin handler wins, and its store is a write-only sink

Boot order was the one fact that settled it, and it is now established from the
static call graph — unambiguous, because `composeRuntime` is **awaited** before
`startEngine` can be reached:

```
src/main.ts:399            await composeRuntime({ bootstrapFn: bootstrapWithEverything })
  → composeRuntime.ts:883    await opts.bootstrapFn(...)
  → bootstrap.everything.ts:167-202   collects every plugin.buildHandlers() …
  → bootstrap.ts:98            … and bus.register(handler)   ← A REGISTERS HERE
src/main.ts:346            await startEngine(runtime)          (only on project open)
  → engineLauncher.ts:411      initBusHandlers(runtime)        ← B hits `continue`
```

`roof` is in `ALL_PLUGINS` (`apps/editor/src/PluginRegistry.ts:263`)
unconditionally, with no feature gate, and `UpdateRoofHandler` is in
`buildRoofHandlerSet()` (`plugins/roof/src/handlers/index.ts:55`). The editor
bridge at `initBusHandlers.ts:597-602` is therefore **never registered**;
`UpdateRoofCommand` is never reached from the bus. The code says so itself, at
`engineLauncher.ts:444-455`: *"composeRuntime() already registers the
authoritative plugin handlers … first registration wins."*

**And the plugin store has no way back.** `RoofCommitter` exists
(`plugins/roof/src/committer/roof-committer.ts:65`, exported at
`plugins/roof/src/index.ts:51`) and **`new RoofCommitter` appears nowhere in the
repository**. The committer channel is closed at the composition root:
`composeRuntime.ts:883` passes no `committers`, `bootstrap.ts:107-111` iterates
`opts.committers ?? []` — an empty loop. `initBusHandlers.ts:788` states it
plainly: *"composeRuntime registers ZERO committers."* The only file that ever
builds committers, `bootstrap.render.everything.ts:113-149`, builds
wall/slab/door/window — **not roof** — and has no caller.

> **Therefore: `roof.update` writes the PluginRegistry roof DTO store, and
> nothing reads it.** Not `RoofFragmentBuilder`, not the 2-D plan projector, not
> the IFC exporter, not `ProjectSerializer`. V3 = **FAIL**. V4 = **FAIL** by
> direct consequence (`ProjectSerializer.ts:949-965` reads the geometry
> `RoofStore`, which never changed). V5 is left UNPROVEN and is moot — the ring
> buffer will faithfully reverse a change that was never visible.

**This is bigger than the chat.** The defect is in the VERB, so every dispatcher
of `roof.update` is affected, not just the RAC:

- `apps/editor/src/ui/property-panel/RoofPropertySheet.ts:317` — **the roof property panel**
- `apps/editor/src/ui/property-inspector/PropertyInspectorApply.ts:233`
- `apps/editor/src/engine/transforms/elementMove.ts:112,412` — **the 3-D move gizmo**
- `apps/editor/src/engine/registerTransformDragHandler.ts:135`

The RAC did not cause this and is not uniquely broken by it. The harness found it
because asking "did AUTHORITATIVE state change?" is a different question from
"did the command dispatch?", and nothing had asked it before.

**Verified safe by the same method** (no rival handler; the editor bridge or the
sole plugin handler wins, and it writes the authoritative store):
`slab.updateDimensions` (bridge at `initBusHandlers.ts:835`, no plugin declares
it), `element.updateParameters` (bridge at `:1622-1630`, no rival),
`element.delete` (only `plugins/view/src/handlers/DeleteElement.ts:29`, no
bridge, so no shadowing — though the verb is **unavailable between
`composeRuntime` resolving and `engineLauncher.ts:565`**, a narrower finding
worth its own look).

**Still UNPROVEN about roof:** whether `initTools.ts`'s §P3.2-RF mirror bridge
carries roof *updates* rather than only `roof.created` into the geometry store.
The surrounding comments say `<family>.created` only, but that file was not read.
If it does mirror updates, V3 changes — so this is the one thing to check before
acting on D-1.

`tools/rac-conformance/probe-route-shadowing.ts` makes the whole class
re-runnable. Current reading:

- **SHADOWED (a plugin DTO handler AND an editor bridge claim one verb): 1** — `set-roof-pitch` → `roof.update`.
- **PLUGIN-ONLY presumed-detached: 1** — `create-wall` → `wall.create` (this is the D14 gate's own `MAX_UNCLASSIFIED_GLOBAL_ROUTES` baseline of 1; the probe reaches it independently, which is a useful cross-check).
- **Clean: 39.**
- **Capabilities whose commandProof declares itself ORPHANED: 5** — `set-roof-pitch`, `set-height` (via `UpdateCeilingCommand.ts`), and the four `delete-*-scoped` (via `DeleteElementsBatchCommand.ts`).

### F-3 — the registry's declared `busCommand` is not always the verb dispatched

The registry is the D14 gate's source of truth for "which command does this
capability use", and for three capabilities it disagrees with what the resolver
actually emits:

| capability | registry declares | actually dispatched |
|---|---|---|
| `set-height` (wall) | `element.updateParameters` | **`wall.updateDimensions`** |
| `set-thickness` (slab) | `wall.updateDimensions` | **`slab.updateDimensions`** |
| `set-thickness` (roof) | `wall.updateDimensions` | (per-kind, untested here) |

These are *per-element-kind* dispatches behind one capability id — defensible
design, but it means `cap.busCommand` is a **single value describing a
one-to-many route**. Every D14 check keyed on `cap.busCommand` (phantom-command
check 2, one-dispatch check 6, the shadowing probe above) is therefore reasoning
about only one of the verbs the capability can emit. Not a defect in itself; a
**stated limit on what "UNDECLARED: 0" covers**.

### F-4 — mis-resolves: a rival grammar answers an ask it cannot perform

Four operations with no route are nonetheless *claimed* by a capability. This is
the `ElementCapabilities` lie (C68 §2.2) in live grammar rather than in a table.

| # | utterance | claimed by | what actually happens |
|---|---|---|---|
| 1.1 | `create a new project called Villa Alba` | `generate-building` | dispatches `generation.building({typology:'house'})` — asks for a **project**, gets a **generated house** |
| 1.10 | `delete level 2` | `go-to-level` | `setActiveLevel` — a **destructive** ask silently becomes **navigation**. Non-destructive, and a lie |
| 2.11 | `remove the plasterboard layer from all walls` | `delete-selected` | deletes the **wall** (see F-1) |
| 5.5 | `set the ridge height to 2m` | `set-height` | sets the roof's **overall height**. Ridge height and overall height are different quantities; this is a **silent substitution** of exactly the kind the founder flagged |

---

## 6 — What remains UNPROVEN, and how to close it

**Broken and unproven are different facts.** These are the unproven ones.

### 6.1 V3–V6 for all 55 rows — no headless composition root

P1 says production code obtains a runtime only via `composeRuntime()`. That
wires renderer, persistence client and sync against DOM/WebGL, so **the
authoritative stores cannot be reached from Node**. Every V3–V6 cell is UNPROVEN
for that one reason, recorded identically on every row.

**This is closable, and cheaply — the research is done.** The authoritative
stores are importable under **happy-dom** (not bare node), and precedent exists:

| element | AUTHORITATIVE store | reached how |
|---|---|---|
| level | `BimManager` (`packages/core-app-model/src/BimKernel.ts`) | mirrored read-only via `wallStore.getLevels()` |
| wall | `WallStore` — `@pryzm/geometry-wall` | `new WallStore(projectContext, bimManager)`, published `window.wallStore` |
| door | `doorStore` — `@pryzm/geometry-door` | **module singleton** |
| window | `windowStore` — `@pryzm/geometry-window` | **module singleton** |
| slab | `SlabStore` — `@pryzm/geometry-slab` | `window.slabStore` |
| roof | `RoofStore` — `@pryzm/geometry-roof` | `window.roofStore` |

`ProjectSerializer.serialize` reads exactly these
(`apps/editor/src/engine/persistence/ProjectSerializer.ts:949-965`), which is
what makes them authoritative rather than merely present. The **detached**
twins to avoid are `plugins/*/src/store.ts` (fresh `PluginRegistry` instances)
and `packages/stores/src/LevelStore.ts`.

The blocker for a node environment is **`@thatopen/ui` referencing `HTMLElement`
at module-eval time**, not THREE and not WebGL — stated verbatim in
`packages/geometry-wall/vitest.config.ts`. happy-dom satisfies it. Working
precedent: `packages/command-registry/__tests__/hostedTypeChange.test.ts` drives
legacy commands against the real geometry stores and asserts store-readback,
undo identity and event emission — i.e. **V3 and V5 for one capability family
already exist as a pattern**; nothing generalises it across the 45.

**Recommended next step (not taken here, as it is product-adjacent):** a
`tools/rac-conformance/vitest.config.ts` on `environment: 'happy-dom'` plus one
spec per element family that (i) seeds the authoritative store, (ii) feeds the
`BusCommandRef` this harness already produces from the real utterance into the
real handler, (iii) reads the property back out of the authoritative store, (iv)
undoes and re-reads. That closes V3 and V5 for every row whose V2 passes. V4
additionally needs `ProjectSerializer.serialize`, which dereferences `window`
unguarded at lines 944 and 971 — see the handover diff in §6.3. V6 needs a
second client and is genuinely out of reach headlessly.

### 6.2 Rows UNPROVEN for a reason other than "no runtime"

- **5.9 / 5.10 (V1)** — the ladder **MISSED** rather than refusing. Non-mutating,
  therefore safe, and the harness will not call that a PASS: a miss means we
  cannot say the system *knows* the ask is impossible, only that it did not
  act. C68 §5.g wants a refusal that names its code. Recorded UNPROVEN, with
  V7 FAIL for the same rows.
- **3.10 / 4.8 / 5.11** — pure save/reload cycles; there is no utterance to
  drive, so V1/V2 are not applicable rather than failing.

### 6.3 Product-side diffs needed — HANDED OVER, NOT APPLIED

I own tests and harness only. Three changes are needed in trees other agents
own; each is stated as an exact change, for their author to apply.

**D-1 — `plugins/roof/src/handlers/index.ts` (owner: Agent G2, `plugins/**`) —
HIGHEST PRIORITY, and it is not a chat fix.** Apply the L-815 fix that roof never
received: delete `'roof.update'` from `ROOF_HANDLER_TYPES` (line 33) and remove
`UpdateRoofHandler` from `buildRoofHandlerSet()` (line 55), so the
`initBusHandlers` bridge at `:597-602` registers and `UpdateRoofCommand` reaches
the authoritative `RoofStore`. Mirror L-815's comment verbatim in shape, so the
next reader knows which way it was decided and why.

The alternative — keeping the plugin handler and instantiating `RoofCommitter` —
is strictly more work (the committer channel is closed at
`composeRuntime.ts:883`, which passes no `committers` at all, so wiring one roof
committer means opening that channel for everything) and is the path L-815
explicitly rejected for walls. **Check the `initTools.ts` §P3.2-RF mirror first**
(see F-2a's UNPROVEN note): if it already mirrors updates, this is a documentation
fix instead.

Falsifying test to add alongside the fix: dispatch `roof.update` with
`{pitch}` and assert the change is visible in `packages/geometry-roof`'s
`RoofStore.getById(id)` — the store `ProjectSerializer.ts:949-965` reads. Today
that assertion fails.

**D-2 — `packages/command-registry/src/roofs/UpdateRoofCommand.ts`.** Either
remove the `ORPHANED — no longer called` header (it is called, by the bridge at
`initBusHandlers.ts:598`) or, if D-1 retires the bridge, delete the class. A
capability's proof file must not describe itself as dead.

**D-3 — `packages/geometry-kernel/src/pure/polygonOffset.ts` (owner: Agent D2).**
Extend the `< 3 distinct vertices` guard to reject **zero-area (collinear)**
rings. Suggested: after `dedupeRing`, `if (Math.abs(signedArea(ring)) < 1e-9)
return { polygon: [], degenerate: true, reason: 'ring has zero area (collinear
vertices)' }`. Falsifying test: `offsetPolygonOrSelf([[0,0],[5,0],[10,0]], 0.3)`
must return `degenerate: true`; it currently returns `degenerate: false`.

**D-4 — the destructive-grammar guard (owner: Agent E2 / ai-host).** Not
expressed as a diff, because the right fix is a design decision, not a line:
the local-NL `delete` grammar needs a hypothetical/qualifier stopper so
`undo would remove the wall, right?` and `remove the plasterboard LAYER` do not
reach `element.delete`. Per C67 doctrine the fix is a **hard stopper**, never a
narrowed vocabulary. Add both utterances to the C68 §5.f adversarial corpus so
the D14 gate executes them thereafter.

---

## 7 — Every FAIL, with the exact utterance and the expected property

<sub>Rows whose only non-PASS cells are the runtime-gated V3–V6 are omitted; see
§6.1. Full machine-readable detail: `--json`.</sub>

### Category 1 — PROJECT / STRUCTURE

| # | utterance | observed | expected authoritative property |
|---|---|---|---|
| 1.1 | `create a new project called Villa Alba` | `generation.building({typology:'house'})` | server `projects` row + client project-context id |
| 1.2 | `create a site` | MISS | site/parcel record consulted by the 3D-Site context loader |
| 1.3 | `create a building` | MISS | building container consulted by the level ladder |
| 1.5 | `create a new level at 3m` | **refusal**: *"Level 1 is already at 3 m — nothing was added, because two levels at the same elevation stack invisibly. Say 'add a level at 9 m', or 'duplicate level 1'…"* | `levelStore` new level, elevation 3 |
| 1.6 | `rename Level 1 to First Floor` | refusal from `rename-room`: *"Nothing is selected"* | level `.name === 'First Floor'` |
| 1.7 | `set level 1 elevation to 3.5m` | MISS | `.elevation === 3.5` **and every hosted element re-seated** |
| 1.9 | `move level 1 up by 500mm` | MISS | elevation shifted; hosted elements follow |
| 1.10 | `delete level 2` | `local go-to-level → setActiveLevel` | L2 gone; hosted elements deleted or re-hosted, **and the answer says which** |

**1.5 is not a defect — it is the best refusal in the whole run.** It names the
occupied elevation, explains the consequence, and offers two concrete
alternatives. It is scored V2 FAIL only because the row asked to *create* a
level and none was created; V7 PASS. With three levels already at 0/3/6 m this
is the correct behaviour, and it is the model the other 20 V7-FAIL rows should
copy.

### Category 2 — WALLS

| # | utterance | observed | expected authoritative property |
|---|---|---|---|
| 2.3 | `set the wall length to 6m` | MISS | `|end − start| === 6.0 m` **and joins re-resolved**. `set-length` exists but targets **furniture only** |
| 2.4 | `set height to 3m` | `wall.updateDimensions({wallId, height:3})` | correct value; **V2 FAIL only because the registry declares `element.updateParameters`** — see F-3 |
| 2.6 | `move this wall 500mm north` | MISS | start and end both translated by (0, 0.5); joins re-resolved. **No move capability exists for any element kind** |
| 2.7 | `rotate this wall by 90 degrees` | MISS | direction rotated 90°, length preserved. (`set-wall-rake` is out-of-plane lean, correctly did **not** capture this) |
| 2.11 | `remove the plasterboard layer from all walls` | **`element.delete` on the wall** | `wall.layers[]` loses one entry. See F-1 |
| 2.12 | `join these two walls` | MISS | a JunctionResolverV2 L/T/X record + mitred footprint (ADR-0055) |
| 2.13 | `split this wall at the midpoint` | MISS | one wall → two, contiguous, **hosted openings re-parented to the correct half** (C15) |

### Category 3 — OPENINGS

| # | utterance | observed | expected authoritative property |
|---|---|---|---|
| 3.1 | `add a door to this wall` | MISS | `doorStore` entry hosted on that wall with a wall-relative offset + wall re-cut. **There is no door-create verb at all** — windows have `create-windows-parametric`, doors have nothing |
| 3.2 | `move the door 500mm to the right` | MISS | `door.offset` shifted 0.5 m; wall re-cut at the new position and healed at the old |
| 3.6 | `move this window 300mm left` | MISS | `window.offset` shifted 0.3 m; wall re-cut |

### Category 4 — SLABS

| # | utterance | observed | expected authoritative property |
|---|---|---|---|
| 4.1 | `create a slab` | MISS | a slab with a boundary polygon on the active level. **The chat can EDIT a slab it cannot CREATE** |
| 4.2 | `set the slab thickness to 250mm` | `slab.updateDimensions({slabId, thickness:0.25})` | correct value; V2 FAIL is the F-3 declaration mismatch only |
| 4.3 | `change the slab boundary to the room outline` | MISS | boundary ring, measured as a polygon. Note `extend the slab 500mm past the walls` is a 500 mm outward offset — the **same primitive** category 5 needs |

### Category 5 — ROOFS

| # | utterance | observed | expected authoritative property |
|---|---|---|---|
| 5.1 | `create a pitched roof` | MISS | `roof.shape === 'gable'/'mono'`; geometry has a ridge (vertex Y not constant) |
| 5.2 | `create a hip roof` | MISS | `shape === 'hip'`; four sloping planes to a ridge shorter than the footprint |
| 5.3 | `create a mansard roof` | MISS | `shape === 'mansard'`; **two distinct slope angles per side** |
| 5.5 | `set the ridge height to 2m` | **`set-height` → roof overall height** | `roof.ridgeHeight === 2.0` **and** max vertex Y − eaves Y === 2.0 m ± 1 mm. Silent substitution — see F-4 |
| 5.6 | `set the roof overhang to 300mm` | MISS | the edge-midpoint oracle at 300 mm ± 1 mm, spread ≈ 0. **The primitive now delivers this exactly (§3) — only the sentence cannot reach it** |
| 5.7 | `change the roof footprint…` | MISS | boundary ring; vertex count preserved |
| 5.9 | `create a roof on a footprint of (0,0)(0,0)(0,0)` | MISS | no roof created **and a refusal code named**. Miss = safe but silent |
| 5.10 | `shrink the roof footprint by 50m` | MISS | refuse quoting the max feasible inset in mm. The **kernel** refuses correctly (§3); the **sentence** never reaches it |

**The shape of category 5 is worth stating plainly.** Roof bus commands exist —
`roof.create`, `roof.setShape`, `roof.setOverhang`, `roof.setPitch`,
`roof.setThickness`, `roof.move` — and the geometry beneath them is now
measurably correct to 0.000 mm spread. **The chat can reach exactly one of
them.** This is not a broken subsystem; it is a correctly-built subsystem with
almost no language surface, which is precisely the c1902a5a defect C68 was
written to prevent (the command existed, the sentence was unambiguous, the
resolver had never been told). Those verbs pass D14's `UNDECLARED: 0` because
they sit in `CHAT_UNAVAILABLE` or `ChatCommandClassification` with a stated
reason — the classification is **honest**, and it is also the roadmap.

---

## 8 — Paraphrase robustness

"Reliably" is not one sentence. Each operation's declared paraphrases were
driven; these landed only partially, meaning **the primary sentence works and a
natural rewording does not**:

| # | operation | phrasings landing correctly | the ones that do not |
|---|---|---|---|
| 2.2 | create interior wall | 1 / 2 | `draw an interior partition from (0,0) to (4,0)` → MISS |
| 3.7 | change window size | 1 / 3 | `make this window 1.2m by 1.5m` → MISS (**one ask setting two fields is not understood at all**); `set the window height to 1.5m` → lands on `set-height`, not `set-width` (correct behaviour, different capability) |
| 3.8 | delete opening | 2 / 3 | `delete all doors on level 2` → `delete-doors-scoped` (correct — the row's expectation was window-specific) |
| 4.5 | change slab material | 2 / 3 | `make the slab grey` → MISS (**no `set-slab-color`; only walls have a colour verb**) |
| 4.6 | move slab | 1 / 3 | `move the slab up 200mm`, `lower this slab by 0.2m` → MISS (**only the absolute `set the base offset to X` form is understood; no relative form**) |

The relative-vs-absolute gap in 4.6 is the same gap as rows 1.9, 2.6, 3.2 and
3.6: **PRYZM's chat has no relative-displacement grammar for any element.**

---

## 9 — How to re-run

```bash
# The scorecard: 55 operations × 7 verdicts + paraphrase + adversarial
npx tsx tools/rac-conformance/probe-categories-1-5.ts
npx tsx tools/rac-conformance/probe-categories-1-5.ts --json   # machine-readable

# Category-5 geometry, measured in millimetres (the edge-midpoint oracle)
npx tsx tools/rac-conformance/probe-geometry.ts

# Route shadowing — where two handlers claim one verb (F-2's general form)
npx tsx tools/rac-conformance/probe-route-shadowing.ts

# The capability registry, dumped
npx tsx tools/rac-conformance/dump-capabilities.ts

# The gate this harness complements — READ IT, do not edit it
npx tsx tools/ga-gate/check-chat-capability-coverage.ts
```

All probes **exit 0 always**. They are measurements, not gates: a harness that
failed CI would be under pressure to go green, and a red row is the deliverable.

**Adding an operation** is a row in
`tools/rac-conformance/operations-1-5.ts` — utterances, expected capability,
expected bus command and payload, and, mandatorily, the `authoritative` field
naming the exact property that would prove V3. That field is written even where
nothing can currently read it, because *"we do not know which store is
authoritative"* is itself a finding.

**Files** (all new; none commit product source):

- `tools/rac-conformance/operations-1-5.ts` — the operation table
- `tools/rac-conformance/probe-categories-1-5.ts` — the scorecard runner
- `tools/rac-conformance/probe-geometry.ts` — the edge-midpoint oracle
- `tools/rac-conformance/probe-route-shadowing.ts` — the V3 route probe
- `tools/rac-conformance/dump-capabilities.ts` — registry dump
- `tools/rac-conformance/ladder.ts` — shared ladder (co-owned with the categories 6–10 agent)
- `docs/04-reference/RAC-CONFORMANCE-SCORECARD-CAT1-5.md` — this document

---

## 10 — Contract mapping

| finding | contract |
|---|---|
| seven verdicts; route ≠ authoritative state | C67 §1.6, C68 §6.3 (states the runtime half is unenforced) |
| F-1 destructive mutation on a hypothetical | C68 §5.f (adversarial corpus), C67 §0 (free-form + **hard stoppers**) |
| F-2 route shadowing; ORPHANED commandProof | C68 §5.a (a LIVE command route), §6.1 check 3d; ADR-0315 U0; L-815 precedent |
| F-3 `busCommand` is one value for a one-to-many route | C68 §6.1 checks 2 and 6 — a stated limit on "UNDECLARED: 0" |
| F-4 mis-resolves claiming asks they cannot perform | C68 §2.2 + §7.d — the `ElementCapabilities` lie |
| category-5 geometry measured, not eyeballed | C11 (element creation), and the §W2A-ONE-OFFSET tombstone |
| refusal must name its code; partial says partial | C68 §5.g |
| one dispatch per mass edit (undo-neutral `runBatch`) | ADR-0314, C68 §7.f |
| hosted openings on split/delete/move | C15 |
