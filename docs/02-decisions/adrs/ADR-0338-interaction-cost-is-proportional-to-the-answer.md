# ADR-0338 — Interaction cost must be proportional to the ANSWER, not to the model

| Field | Value |
|---|---|
| **Status** | Accepted — 2026-08-21 |
| **Tag** | `§NAV-PICK-QUADRATIC` |
| **Owner** | Rendering / picking |
| **Closes** | Founder, 2026-08-21 ~11:00 UK: *"I just tested last deployment from 15 min ago — and the scene is still frozen — whereas this morning — european time — was not!"* and, on the prior deploy: *"the performance is terrible - the main scene is stuck on pryzm app - nothing can be done - is frozen!"* |
| **Constraints** | C04 (rendering/scheduling), C06 §13.3 (one owner per surface), P3 (single rAF), P2 (THREE only in `renderer-three`), P8 |
| **Extends** | **ADR-0302** (`§EDIT-COST-IS-PROPORTIONAL`) — same principle, different clock |
| **Related** | ADR-0076 Axis 3 (element instancing), ADR-0077 (live backend swap), ADR-0297 (GPU resource lifetime), ADR-0007 (WebGPU/WebGL2 dual mode), `§SELECT-INSTANCED-PICK`, `§INSTANCE-GROUP-SPILL` (L-1400) |
| **Implemented by** | `89dacf75` (mitigation), `50df40a5` (cure), `47efc9e1` (probe) |

---

## Context

**ADR-0302 established that per-EDIT render cost must be proportional to the edit.**
It found ~120 `scene.traverse()` sites and named the shape: *"four consumers asking
the same question — what is in the scene now? — because none of them is told what
changed."*

This ADR records the same defect on the **interaction clock**, which ADR-0302 did
not cover, and which is worse because it is driven by the mouse rather than by a
command.

### The measurement

`InstancedElementRenderer` is a **module-level singleton**
(`packages/core-app-model/src/rendering/InstancedElementRenderer.ts`, the
`instancedElementRenderer` export). Its `_elements` map therefore holds **every
instanced registration in the project at once** — windows, walls, furniture,
columns, beams, railings — not one family's worth.

`_createGroup` installed two closures on **every** group, and both answered a
question about **one group** by walking **the whole map**:

| Closure | Cost | Called by `gpu-pick.ts _syncInstancedGroup` (lines 1190-1201) |
|---|---|---|
| `getOccupiedInstanceSlots()` | `O(N)` | **once per group** |
| `getInstanceElementId(slot)` | `O(N)` | **once per occupied slot** |

`SelectionManager` drives `syncPickScene()` from the **hover rAF**. One pass was
therefore `G·N + N²`, **per pointermove**.

Measured through the real renderer and the real closures, running the exact
membership-signature loop from `gpu-pick.ts` (28 groups, 4 materials × 7 levels):

| N (instanced registrations) | BEFORE | AFTER | ratio |
|---|---|---|---|
| 500 | 7.9 ms | 0.30 ms | 26× |
| 1 000 | 13.7 ms | 0.51 ms | 27× |
| 2 000 | 73.0 ms | 4.58 ms | 16× |
| 4 000 | **312.4 ms** | 1.40 ms | 223× |
| 6 000 | **550.0 ms** | 1.39 ms | 395× |

BEFORE quadruples on a doubling (13.7 → 73.0 → 312.4). That is a clean quadratic.
A 60 Hz frame is 16.7 ms. **312 ms of blocked main thread per mouse movement is
not a stutter — it is an unusable application**, and it is why the founder could
open the project, see it draw, and then do nothing at all.

### Why it detonated on 2026-08-21 and not before

**The quadratic was always there. What changed was N.** `f80ed827` (09:09 UK)
flipped `handrail` and `stairRailing` to instance by default. Its own census
measures **240 railing elements as 4920 meshes** — instanced, that is **4920 new
rows** in `_elements` where there had been zero. Squaring a number you have just
multiplied by ten is a hundredfold cost.

That is the whole regression shape, and it is the reason the fix belongs in the
data structure rather than in the flag: **any future family flip re-detonates a
latent quadratic**, and the next one will not arrive with a bisect window this
clean.

---

## §1 — WebGPU vs WebGL: what the backend does and does not explain

The founder reported the freeze on **two different projects** and on **two
different backends** — `webgl-classic` on the earlier session, `webgpu` on the
later one. That pairing is diagnostic, and it is worth stating what it rules out.

| Layer | Backend-sensitive? | Could it produce THIS freeze? |
|---|---|---|
| Shader/TSL compilation, pipeline creation | **Yes** — WebGPU compiles pipelines, WebGL links programs | **No.** A compile stall is a one-off at first draw; it does not recur per pointermove, and it would not reproduce identically on both. |
| Draw-call submission cost | **Yes** — WebGPU amortises submissions far better | **No.** The founder's own numbers (7589 draw calls, 470 396 triangles) are heavy but they are a frame-rate problem, not a lock-up, and they differ per backend. |
| Clipping / section planes | **Yes** — `WebGPURenderer` has no `clippingPlanes` or `localClippingEnabled` at all (L-1761, measured against `three@0.183.2`) | **No**, and note `7dbc0685` **removed** `localClippingEnabled = true` precisely because it triggers an up-to-15-second all-material recompile. |
| **CPU-side scene-graph bookkeeping** | **No** — plain JS `Map` iteration | **Yes. This is the one.** |

⭐ **A defect that reproduces on both backends is a CPU defect.** The pick
membership scan is plain `Map` iteration in `core-app-model`; it never touches a
device, a queue or a shader. It costs exactly the same on WebGPU, on
`webgl-fallback`, and on `webgl-classic`.

**A note on the WebGL programs seen in a WebGPU session.** The founder's log
carries `THREE.WebGLProgram: Program Info Log … X4122` warnings while
`[renderer-three] backend: webgpu`. X4122 are HLSL/FXC precision warnings surfaced
through ANGLE. **This lane did not determine which surface compiles them** — the
candidates are the PMREM/environment path and the off-screen preview renderers,
both of which are genuine `WebGLRenderer` instances that can coexist with a
WebGPU main viewport. It is recorded here as **unexplained noise, not as
exonerated**. See §5.

### The standing consequence

`'webgl-fallback'` **says** WebGL and **is** a `WebGPURenderer` (L-1761). Any code
that branches on a backend NAME rather than probing the renderer OBJECT is wrong
by construction. `SectionClipCapabilityResolver` already does the right thing;
nothing else should be added that does not.

---

## §2 — The Pascal comparison: this is the Scene Registry finding, again

`pascalorg/editor` (researched 2026-05-25, note at
`docs/03_PRYZM3/reference/PASCALORG-EDITOR-RESEARCH.md`) is the closest public
architectural cousin to PRYZM: browser 3D architectural editor, Three.js WebGPU,
flat id-keyed stores, systems draining a dirty-node set on the frame loop.

⭐ **Its single most transferable property is negative: Pascal never traverses the
scene graph to look something up.** It maintains a **Scene Registry** —
`Map<id → Object3D>` plus `byType` sets — and every lookup, visibility toggle and
selection resolution goes through it. There is no `scene.traverse` in its hot
paths at all.

PRYZM has repeatedly paid for not having that:

| PRYZM site | Question asked | How it answered | Recorded as |
|---|---|---|---|
| `ProjectVisibilitySection` hide/isolate | *which objects are on level L / of type T?* | full `scene.traverse` + `userData` match | OI-058, `§INSTANCED-ISOLATE-FIX` |
| Per-edit PBR collect, tier count, transmission sweep, shadow sweep | *what is in the scene now?* | four `scene.traverse` passes **per element created** | **ADR-0302** |
| `InstancedElementRenderer` pick closures | *which slots of group K are occupied, and who is in slot S?* | full `_elements` scan, **twice, per group, per hover frame** | **this ADR** |

Three different subsystems, three different years, **one missing data structure**.
Each was fixed locally. `_membersByGroup` is the third local fix.

**PRYZM is genuinely ahead of Pascal** on command-bus-only mutation (P6), CRDT
collaboration, GPU instancing, multi-view projection, IFC/Revit interop and OTel
observability — none of which Pascal has, and none of which should be regressed to
get the registry. The registry is **additive** and does not trade any of them away.

**What Pascal's design would have prevented here specifically:** with a
`byGroup`/`byType` index maintained at write time, the pick path's question is a
map lookup by construction, and there is no version of the code in which flipping
a feature flag changes the complexity class of hover.

---

## Decision

### 1. A lookup index is maintained at WRITE time, never derived at READ time

`InstancedElementRenderer` maintains `_membersByGroup: Map<groupKey, Map<slot,
pickId>>`, written at **exactly the five sites that write `_elements`** —
register-commit, register-evict, `unregister`, `_removeGroup`, `clear` — the same
five that already maintain `_obbByGroup`. The two are kept **adjacent in the
source** because a sixth writer that updates one and forgets the other is a pick
that resolves the **wrong element**, which is worse than a slow one.

⛔ **The index is not a cache.** It is never rebuilt lazily, never invalidated,
never recomputed from `_elements`. A lazily-rebuilt index re-introduces the scan
it exists to remove, on whichever frame the invalidation lands.

### 2. A closure that captures a collection must be EMPTIED, not merely dropped

Both pick closures capture their `Map` **by reference**. Deleting the registry
entry in `_removeGroup` therefore left a **disposed, off-scene group fully able to
resolve element ids**. The old `O(N)` bodies read `_elements`, which `clear()`
empties, so they went quiet **by accident** — the behaviour was never designed,
and replacing the implementation exposed that.

The maps are now emptied **before** the handle is dropped, in both `_removeGroup`
and `clear()`. This was caught by the regression suite written alongside the fix,
not by review.

### 3. No test may pin a mutable default it does not own

At `9ebaae47`, `_FAMILY_DEFAULTS.handrail` was `true`;
`NavigationDrawCallCensus.spec.ts` asserted instancing ON and was green;
`geometry-window/__tests__/WindowInstancedLifetime.test.ts:136` asserted OFF and
was **RED**. `f80ed827`'s VERIFIED list does not name `geometry-window`. **Two
suites in two packages disagreed about one shipped default, nothing made them
agree, and the disagreement shipped.**

Worse, the census's BEFORE arm had **already** been broken once by that default
moving, was fixed by naming its regime, and its AFTER arm was left reading the
default — so flipping the default back broke it in the mirror image. **A
comparison with one leg tied to a mutable default lies whenever the default moves,
in either direction.**

Both census legs now NAME their regime. The default is pinned in **one** place:
`WindowInstancedLifetime`'s *"windows are ON by default; no other family is"*.

### 4. The interaction budget is stated, and it is per GESTURE

Any handler on the pointer/hover path must answer in **well under one frame
(16.7 ms)** at the largest scene the product claims to support. Cost must be
proportional to the **answer** (the group, the delta, the hit), never to the
**model**.

This is ADR-0302's rule on a faster clock: ADR-0302 governs `bim-*-added/updated`;
this governs pointermove, hover rAF, click and marquee.

### 5. Ship the probe, not the opinion

`window.pryzmPerf.pick()` runs the production closures in the production call
pattern on the live scene and prints `N`, `G`, the singleton-group count and the
**milliseconds for one pass**. Above ~16 ms the hover rAF cannot keep up.

⭐ This exists because the lane could measure the SHAPE of the cost offline but
**could not measure the founder's own N**. `[[context-data-honesty-family]]`: ship
the probe before the fix — and ship it even when you also have the fix, because a
mechanism asserted without the number is what cost this founder a working demo
earlier the same day.

---

## Consequences

**Good**

- One hover pass at N=6000 goes from **550 ms to 1.39 ms** (395×), and is now flat
  in N rather than quadratic.
- The 19.7× railing draw-call collapse from `f80ed827` becomes **safe to re-enable**;
  it was never the defect, it was the amplifier.
- A stale-resolution hazard (a disposed group still answering) is closed, and is
  now pinned by a test.
- The founder can measure the freeze himself in one console line.

**Costs / accepted**

- One extra `Map<number, string>` per instanced group. Bounded by total instance
  count; a rounding error against the `512`-slot `InstancedMesh` each group already
  allocates.
- Two write sites to keep in step with `_elements` forever. Mitigated by adjacency
  and by the field comment; **not** by a gate. See below.

**⚠ NOT DONE — stated so nobody reads this ADR as more than it is**

1. **No gate enforces §4.** There is no check that a pointer-path handler is
   sub-frame, and no census of `O(model)` reads on the interaction clock
   equivalent to ADR-0302's ~120-traverse census. Until one exists, this section
   is a rule, not an invariant.
2. **No gate enforces §1's five-writer discipline.** A sixth writer of `_elements`
   that forgets `_membersByGroup` compiles, and the regression suite would catch
   only the cases it enumerates.
3. **The Scene Registry (OI-058) is still not built.** This is the third local fix
   to the same missing structure. The next lane to touch visibility, selection or
   picking should build it rather than add a fourth.
4. **N on the founder's project is unmeasured.** Only a browser settles it —
   `window.pryzmPerf.pick()` is the instrument, and until it is run, "the
   quadratic was the whole freeze" is a hypothesis with a strong bisect behind it,
   not a measurement.
5. **The WebGL-program compilation inside a WebGPU session is unexplained** (§1).
6. **Nine of the twenty-one commits in the regression window were never investigated
   at all** by this lane, and four more were cleared only on one narrow axis each — see `ISSUE-LOG` L-1850 for the explicit
   eliminated/not-investigated split. Do not read this ADR as clearing them.
