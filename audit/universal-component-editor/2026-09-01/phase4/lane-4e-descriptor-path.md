# LANE 4E — the descriptor path, turned on for ONE family

**§COMPONENT-RENDER** · audit §12 Phase 4E · **ADR-0376 D10** · audit §5.4 / §11.3 **R13** ·
spec §66 / §67 / §75 / **§76 F** · C84 §6 · C100 §5 · P1 / P2 / P3
Measured **2026-09-02**, Windows 11, headless Chromium 1228 (ANGLE/SwiftShader) + happy-dom.

---

## 0 · THE VERDICT, IN TWO SENTENCES THAT MUST BE KEPT APART

**⭐ A placed component instance RENDERS. It was placed by the real bus verb into the real
composed runtime's authoritative store, its geometry was regenerated from its family definition
by the real kernel, and it painted 11,388 pixels onto a real WebGL2 drawing buffer** — read back
with `gl.readPixels`, screenshotted, and re-measured after a type swap that halved it to 5,505.
`runtime.scene.mount()` was called from code for the first time in this repository's history to
do it.

**⛔ Those pixels are NOT in the editor's viewport, and this lane did not put them there.** They
are in `@pryzm/renderer`'s `Renderer`, which **no production surface constructs** — the shipping
viewport is `apps/editor/src/engine/initScene.ts`'s WebGPU/WebGL renderer drawing into an OBC
world scene on its own overlay canvas. Wiring `scene.mount()` into `src/main.ts` would put a
SECOND renderer on the page beside it. **That is the ~544-file PRYZM-3 renderer migration audit
§5.4 explicitly refuses to make this programme's job, and I refused it too.**

So: the descriptor path is **PROVEN and REPAIRED**, and the **production call site is DESCOPED,
not faked** — the outcome ADR-0376 D10 pre-authorised, reached on the evidence rather than on a
budget.

---

## 1 · WHAT `runtime.scene.mount()` ACTUALLY DID — three breaks, none of them "no caller"

Audit §5.4 says the facade *"shares every byte of the soft-fail / span / tornDown / event
semantics"* with the compose-time path and *"simply has no caller"*. The first half is true and
the second half is true **and dangerously incomplete**. I did not read that sentence and act on
it; I executed the path and watched it.

`apps/editor/__tests__/lane4eSceneMountProbe.test.ts` was written **against the broken behaviour**
and its three ⭐ arms **PASSED** — the transcript is
`lane-4e-probe-PREFIX-SEEN-PASSING-ON-BROKEN.txt` (6/6 green). Reproduced independently in
headless Chromium (`lane-4e-render-BEFORE-loop-fix.json`).

| # | The break | How it was measured | Reading |
|---|---|---|---|
| **B1** | **`mount()` builds a SECOND, COMPLETE data runtime** — a second bus, a second copy of every element store, a second registration of every handler. `bootstrapRenderEverything` called `bootstrapWithEverything(opts)` itself. | census of `performance.mark('pryzm:bootstrap:stores:start')`, which `bootstrap.everything.ts` emits once per invocation. Patches nothing, mocks nothing. | **2** after mount (1 before) |
| **B2** | **The committers land on a host the caller cannot reach.** They were registered on the SECOND runtime's `CommitterHost` and its registry was what the scene reconciler watched, while `bootstrapScene` returned `host: input.committerHost` — the caller's, on which nothing was registered and to which no store was bound. | `runtime.scene.host.get('wall')` after a resolved mount | **`undefined`** |
| **B3** | **The frame loop is never started.** `FrameScheduler.start(adapter)` is what attaches the rAF pump; `bootstrapRenderEverything` constructs a scheduler, installs the scene reconciler as a `pre-render` tick listener, attaches the renderer's draw as a tick listener, calls `markDirty('camera')` — **and never calls `start()`**. `running === false`, so the flag is recorded and nothing ever drains it. | after B1+B2 were fixed: the store had the record, the dispatcher reached the committer, the bake produced one solid, the committer attached one mesh — and `renderer.scene.getObjectByName('component:…')` was `undefined` | **`litPixels: 0`** |

**⭐ The lesson is the ORDER in which those appear, not the count.** B1 and B2 are invisible until
something mounts; B3 is invisible until B1 and B2 are fixed. Each one alone is sufficient to make
the path produce zero pixels, and **each one alone is sufficient to explain zero pixels** — so
anybody who had turned this on and stopped at the first cause would have reported a different
root than the true one, three times over. That is why the audit's *"it simply has no caller"* is
the sentence to distrust: **an uncalled path and a broken path are the same value**
([[context-data-honesty-family]]), and this one was both.

**B3 also indicts this function's own docstring**, step 9: *"`scheduler.markDirty('camera')` —
paint a first frame so the canvas is not blank before the user clicks anything."* That is an
intent the code could not deliver, written beside the line that fails to deliver it.

### 1.1 · A fourth defect, on the same seam, in the honesty axis

**§SCENE-BOOTSTRAP-SOFT-FAIL-WAS-DROPPED.** `bootstrapRenderEverything` catches a failed
`Renderer.init()` into its own `rendererError` field and returns normally. `bootstrapScene`'s
`RenderEverythingBootstrapFn` type **never declared that field**, so its success branch could not
read it and hardcoded `rendererError: null`. The slot the caller received then read
`renderer === null` **and** `rendererError === null` — **byte-identical to the IDLE, no-canvas
state**. `composeRuntime`'s `runScene` branches on exactly those two fields, so it emitted no
`scene.ready` event and did not even reach the `console.error` it keeps for this case.

**A dead GPU and "no canvas was supplied" were the same value.** Measured: before the fix
`rt.scene.rendererError` read `null` in happy-dom where `Renderer.init` had genuinely thrown
`RendererInitError: [Renderer] canvas.getContext…`.

---

## 2 · THE REPAIR — three files, additive, default behaviour byte-identical

⚠ **These three files are outside the lane row's literal OWNS list** (`plugins/component/src/committer/**`
plus "the canvas-mount call site"). I am naming that rather than burying it. The reason is that
D10 says **ATTEMPT it**, and every one of B1–B3 lives in the mount CHAIN, not at the call site: a
committer registered at the call site would have received nothing, three times over, for three
different reasons. Building the component's render wiring ON TOP of a known rival runtime would
have been the R1 shape — adding a second answer rather than repairing the one that exists.

Each change is an **optional parameter or an unread return field**; omitting it reproduces the
previous behaviour exactly, so every pre-existing call site is unchanged. `bootstrapRenderEverything`
has **exactly one** caller in the repository (`composeRuntime`'s lazy loader) — verified by grep.

| File | Change | §-tag |
|---|---|---|
| `apps/editor/src/bootstrap.render.everything.ts` | `RenderEverythingOptions.inner?: EverythingRuntime` — **adopt** the caller's data half instead of constructing a rival (the discipline ADR-0318 applies to the element-store slot: *identity, not construction*). `inner.start()` and `inner.tearDown()` now fire **only for a runtime this function built**. | §COMPONENT-RENDER-MOUNT-ADOPTS-INNER |
| ″ | `scheduler.start()` after `renderer.attachTo(...)`, and `scheduler.stop()` in `tearDown` — **only for a scheduler this function constructed**, because the option's own doc says fixtures inject one *"to verify the dirty-tick wiring without spinning up rAF"*. | §COMPONENT-RENDER-LOOP-WAS-NEVER-STARTED |
| `packages/renderer/src/SceneBootstrap.ts` | `SceneBootstrapInput.innerRuntime?: unknown` forwarded to the loader as `inner`; `RenderEverythingBootstrapFn` gains the `rendererError?: Error \| null` the producer has always returned, and the success branch now **reads** it and reports `outcome: 'soft-fail'` instead of a hardcoded `null`. | §SCENE-BOOTSTRAP-SOFT-FAIL-WAS-DROPPED |
| `packages/runtime-composer/src/composeRuntime.ts` | one line: `innerRuntime: inner` beside the pre-existing `committerHost: inner.host`. **That line is what makes `committerHost` mean anything.** | §COMPONENT-RENDER-MOUNT-ADOPTS-INNER |

⛔ **`innerRuntime` is typed `unknown` on purpose.** Its concrete type is `EverythingRuntime`, an
L7 app type, and `SceneBootstrap.ts` is L5 — the same layer constraint that already forces
`loadRenderEverything` to be injected rather than imported. Producer and consumer are both in
`apps/editor` and type-check each other where they meet.

### 2.1 · The probe flipped, in the right direction

Same file, same three arms, **after** the repair (`lane-4e-probe-FLIPPED-after-fix.txt`, verbatim):

```
× P2  AssertionError: expected 1 to be 2 // Object.is equality
× P3  AssertionError: expected WallCommitter{ …(9) } to be undefined
× P5  AssertionError: expected RendererInitError: [Renderer] canvas.getC… to be null
```

The file is now a **two-way regression test** asserting the post-fix values, with the pre-fix
readings quoted verbatim in its header: **8/8 green** (`lane-4e-probe-PASSING.txt`).

⭐ It also carries **P7**, a finding rather than a fix: `runtime.stores.wall` is `undefined` on
the composed `StoresSlot`, while `bootstrapRenderEverything` reads `inner.stores.wall` and throws
by name if it is missing — and the mount succeeds. **The composer's typed `stores` facade and
`EverythingRuntime.stores` are two surfaces over the element stores with different key sets**,
which is L-11530's shape exactly and is why lane 4C had to ADOPT `component` into `StoresSlot` for
the serializer to see it. Recorded, not repaired: widening `StoresSlot` is a composition-root
decision with a per-family census behind it, and inventing a `wall` key to make one assertion
green would be a rival answer to "where do stores live".

---

## 3 · THE COMMITTER — `plugins/component/src/committer/**`

`ComponentCommitter implements PrimitiveCommitter<ComponentData, THREE.Group>`,
`primitiveType = 'component'`.

**⭐ It is the first committer in this repository written for a family whose geometry is
REGENERATED rather than stored.** Every other one receives a DTO that already carries its
numbers — a wall's start/end/height, a slab's loop, a furniture scale — and calls a synchronous
producer. Lane 4C's record deliberately carries **none** of them, because a resolved value stored
is a derived value stored (C84 §8.i), and spec §66's F-2 falsifier rests entirely on that absence.
This committer is where the absence is **paid for**.

Two **required, defaulted-to-nothing PORTS** (`ports.ts`), both structurally typed so this
package takes no dependency on `@pryzm/family-instance` or `@pryzm/file-format` — the precedent
is lane 4D's own `FamilyInput`, *"kept structurally typed so this package does not depend on the
loader"*:

- **`bake`** — `(definitionId, typeId, instanceOverrides) → BakeResultLike`. The occurrence's
  `instanceParameters` map is passed **straight through**; nothing is merged and nothing is
  cached, because `resolveParameter()` inside the bake is the one resolver and a second merge here
  would be a second answer to "what is this instance's width".
- **`definitions`** — `has(definitionId): boolean`. ⛔ **There is no project-level
  component-definition registry in this repository** (lane 4C measured and declared it), and this
  lane did not build one. A rendering lane inventing the registry would be a rival to whatever the
  real one turns out to be. So the committer **asks**, and `false` is a first-class answer.

⛔ **Neither port has a default.** No `?? kernelGeometryAdapter`, no built-in stub. A committer
that could manufacture its own definition source could render something for a `definitionId` that
names nothing — and a fake built from the header cannot falsify the header
([[fake-more-capable-than-real]]).

### 3.1 · Three behaviours a screenshot cannot show

- **§COMPONENT-RENDER-ASYNC-SEAM.** `PrimitiveCommitter` is **synchronous** at all four methods;
  the family bake is a `Promise` (4D's bake computes synchronously and is a promise only because
  `startActiveSpan` wraps it). So `onAdd` returns an **empty** `THREE.Group` and the solids arrive
  as children later. Stated, not smoothed: **anything that counts children immediately after
  dispatch reads 0 and is right.** `onGeometryReady` is the only honest signal.
- **§COMPONENT-RENDER-GENERATION-GUARD.** Spec §66's exit criterion ends *"and no stale derived
  geometry overwrites newer state"*. Two rebuilds can be in flight and the second is not
  guaranteed to resolve last, so each element carries a monotonic generation and a bake that
  resolves under a superseded one **discards its own result**.
- **The transform/geometry split.** `geometryKeyOf()` covers `definitionId | typeId |
  instanceParameters` (keys **sorted**, because JS object key order is insertion order and
  `{w,h}` and `{h,w}` are the same override set). `origin` and `rotation` are deliberately
  excluded: moving twenty placed components must not re-resolve twenty parameter ladders.

### 3.2 · What it refuses to draw

An unresolvable `definitionId`, and a bake whose every solid was refused, both render as an
**empty, marked, counted, logged** group — `pryzmUnresolvedDefinition` / `pryzmBakeRefusal` /
`pryzmBakeError` on `userData`, and a `stats` counter for each. ⛔ **Never a placeholder box.**
Spec §75 forbids demo-only geometry and C100 §5 gives the reason one family over: a
wrong-but-believable stand-in is worse than an absence, because nothing ever prompts anybody to
look. `material-bridge.ts` follows C100 §5 from its first commit rather than by retrofit — an
`unresolved:` key is **magenta**, and the default grey is documented as *"this family has no
material pipeline yet"*, never as a resolved material.

### 3.3 · One disclosed duplication — §COMPONENT-RENDER-BRIDGE-DUP

`geometry-bridge.ts` is the **third** per-plugin copy of a twelve-line descriptor→`BufferGeometry`
translation (`plugins/wall`, `plugins/furniture`, plus `packages/geometry-wall`'s crease-welding
variant). `@pryzm/plugin-sdk` exports `BufferGeometryDescriptor`, `MaterialPool`,
`PrimitiveCommitter` and `bindStore` — **and no bridge**. The alternatives were an import of
another *plugin's* committer subpath (coupling the component family to the wall family for a THREE
API call) or the L2 wall copy (whose crease welding would change a vertex count lane 4D asserts
on). I took the per-plugin convention the two existing committers establish, and **logged the
duplication here rather than repeating it silently**. The right fix is to promote one onto the SDK
facade; that is a `packages/plugin-sdk` change this lane does not own.

---

## 4 · THE ACCEPTANCE — a rendered instance, and the numbers behind it

⛔ **The acceptance is not the unit suite.** It is
`audit/universal-component-editor/2026-09-01/phase4/lane-4e-rendered-instance.png` and the census
in `lane-4e-render-EVIDENCE.json`, taken in headless Chromium against a real
`WebGL2RenderingContext`.

**What is REAL in that run** — the composed runtime (`composeRuntime({bootstrapFn:
bootstrapWithEverything})`, `canvas: null`, exactly as `src/main.ts` boots it) · the mount
(`runtime.scene.mount(canvas)`) · the store (`runtime.stores.component`, read **off** the runtime,
never constructed) · the verb (`runtime.bus.executeCommand('component.place', …)`, lane 4C's
Path-B handler) · the geometry (lane 4D's `bakeFamilyInstance` → `kernelGeometryAdapter` →
`produceExtrude`) · the fan-out (the real `bindStore` dispatcher and the real `CommitterHost`).

**What is FIXTURE, named so it is not mistaken for capability** — the family *document* is
authored inline (no definition registry exists); the camera is aimed by hand (no view plugin is
mounted); the harness would add a light had the renderer supplied none — **it supplied two**
(`AmbientLight`, `DirectionalLight`), and that is recorded rather than assumed.

| Reading | Value |
|---|---|
| data runtimes constructed, after compose / after mount | **1 / 1** |
| `runtime.scene.renderer` / mode | present / **`webgl2`** |
| `runtime.scene.host.get('wall')` after mount | **PRESENT** |
| `component.place` → `runtime.stores.component.getState().get(id)` | **defined** |
| `runtime.scene.host.registry.get(id)` after `binding.flush()` | **defined** |
| committer stats after place | `rebuilds 1 · attachedSolids 1 · refusedBakes 0 · unresolvedDefinitions 0 · staleBakesDiscarded 0` |
| group present in `renderer.scene`, child count | **true**, **1** |
| **world bounds, TYPE_A** | **min (0, 0, 0) → max (1.2, 0.1, 1.5) m** |
| **pixel census, before place → after place** | **0 → 11,388 lit px**, bbox 184 × 115 |
| **after `component.swapType` → W600** | bounds max.x **0.6**, **5,505 lit px**, bbox 137 × 87 |
| **restored to TYPE_A** | **11,388 lit px** — the identical count, deterministically |

⭐ **Read the third-from-last row twice.** The family document authors `Width = 1200` in the
family-runtime canonical unit (mm) and the world bounds come back at **1.2 m** — lane 4D's
`§4D-ONE-LENGTH-SEAM` conversion, visible in world space on a GPU rather than asserted in a unit
test. And **the occurrence's own record never held a width**: the 1200, and then the 600, came out
of the TYPE through the one resolver. That is **§76 gate F — geometry derived from canonical
intent — demonstrated rather than argued**, and it is spec §66's F-2 mechanism at the render seam.

### 4.1 · The unit suite, and being seen to fail

`plugins/component/__tests__/componentCommitter.test.ts` — **7/7**
(`lane-4e-committer-PASSING.txt`). Every geometric arm runs the **real** bake; arms D and G
control only the **resolution order** of real bakes, never the geometry.

**Falsification.** The generation guard was removed and the suite re-run
(`lane-4e-committer-SEEN-FAILING.txt`):

```
× D — ⭐ a stale bake resolving LAST does not overwrite newer state (spec §66)
    AssertionError: expected 1.2000000476837158 to be close to 0.6 …
× G — onRemove detaches, and a bake still in flight for it is discarded
    AssertionError: expected 1 to be +0
```

— i.e. without the guard the **superseded 1.2 m geometry overwrites the newer 0.6 m**, which is
precisely the outcome spec §66 forbids. Restored and re-run: **7/7**, sha256 of
`ComponentCommitter.ts` identical before and after
(`08547322994eaae51478db2f35376b404bf63c3a2c6d28ba54d99f7b368e4470`).

---

## 5 · WHAT THIS DOES **NOT** ESTABLISH — and the call site I refused to write

1. **⛔ It is not the editor's viewport.** Measured, not assumed: `grep` for `scene.mount(` across
   `**/*.ts` returns **zero production call sites** (only this lane's harness, comments, and
   tests), and `Renderer.init(` returns **zero production callers** — `@pryzm/renderer`'s
   `Renderer` is constructed by nothing the user runs. The viewport is `initScene.ts`'s
   WebGPU/WebGL renderer over an OBC world scene on an overlay canvas it creates itself.
2. **⛔ I did not wire `src/main.ts`.** The lane row hands me "the canvas-mount call site
   (serialize-only)". Writing it would mount a second renderer beside `initScene`'s on the same
   page — a rendering-architecture decision with a live GPU cost, taken by a lane, to make its own
   acceptance look better. **D10 pre-authorised exactly this refusal**, and its falsifier does not
   fire: the FragmentBuilder fallback demonstrably carries 3-D for nine families today, so the
   descriptor path stays optional and the ruling does not need revisiting.
3. **No click places one.** There is no plan-view tool for this family (Phase 4F).
4. **No definition registry.** The committer's `definitions` port is the honest shape of that gap.
5. **Only `extrude` renders.** `sweep` / `loft` / `revolve` / `boolean` refuse, by lane 4D's
   measured schema-gap reasons, and the committer surfaces the refusal on `userData` instead of
   drawing something.
6. **Nothing is persisted about the render.** Correct by construction — the mesh is a projection
   (spec §19), and a cached descriptor in the record would be C84 §8.i.

**The named fallback stands: the slice's 3-D ships through the existing `*FragmentBuilder` path,
and the descriptor MIGRATION is DESCOPED, not faked (spec §75).** What changed is that the
descriptor path is no longer dark: it is repaired, measured, and one `runtime.scene.mount(canvas)`
away for whoever owns the renderer migration.

---

## 6 · GATES, read immediately, `$?` captured directly (never through a pipe)

| Gate | RC | Reading |
|---|---|---|
| `check-single-compose` (**P1**) | **0** | 1 root · 1/1 rival (declared debt) · 2/2 production callers. ⭐ This lane **removed a rival runtime that composed itself at mount time** and was counted by nothing. |
| `check-three-imports` (**P2**) | **0** | 0 direct `three` importers outside `packages/renderer-three/`; 8,379 files, directory walk — **it did see my new files**. The committer reaches THREE only through `@pryzm/renderer-three/three`. |
| `check-layer-boundaries` | **0** | `violations 48/102 · unclassified 13/13 · sdk-bypass 159/182` — **identical to the pre-lane reading**. ⚠ **And that is not a clean bill of health for my code:** this gate enumerates by `git ls-files`, and I was told not to commit, so **all of `plugins/component/` is invisible to it**. Measured by hand instead: my four committer files add **3** `@pryzm/plugin-sdk` edges (L5, not a bypass) and **3** `@pryzm/renderer-three/three` edges (L1, counted). **Projected 162/182 once tracked — within ceiling, no ceiling raised.** Stated as a projection, because that is what it is. |
| `check-raf-count` (**P3**) | **1** ⛔ | **RED, and NOT from this lane.** Two owners: `packages/frame-scheduler/src/RafAdapter.ts` (correct) and **`tools/perf/outer/outer-baseline.spec.ts`** — an **untracked** (`??`) Playwright perf spec belonging to another lane, using `page.evaluate(() => requestAnimationFrame(…))`. My `scheduler.start()` is a call **into** `GlobalRafAdapter`, not a new owner, and my harness lives under `audit/` which this gate does not scan. ⚠ CLAUDE.md records P3 as CONFIRMED GREEN at 1 owner / 5,438 files on 2026-08-29; it now reads 2 owners / 5,595 files. **Not mine to fix, and not absorbable — R7/L-836.** |

**Suites** — `@pryzm/runtime-composer` 179/179 · `@pryzm/renderer` 61/61 · `@pryzm/scene-committer`
78/78 · `@pryzm/plugin-component` 7 + 7 · `apps/editor` bootstrap-adjacent subset (incl. 4C's
`componentJoinThroughComposedRuntime` and `persistedFamiliesReachTheSerializerChannel`) **40/40**.
`tsc -p plugins/component` reports **0 errors inside `plugins/component`** (1,892 pre-existing
errors in transitively-included packages, unchanged by this lane).

⚠ **The full `apps/editor` suite was NOT run to completion** — it exceeded 10 minutes and contains
tests that dial `127.0.0.1:3000`. The six bootstrap-adjacent files were run instead and named
above. Do not read "40/40" as "the editor is green".

---

## 7 · FINDINGS TO LOG (proposed rows for `docs/04-reference/ISSUE-LOG.md`)

1. **`runtime.scene.mount()` composed a second data runtime** — bus, every store, every handler —
   and it was counted by nothing, including `check-single-compose`. FIXED here
   (§COMPONENT-RENDER-MOUNT-ADOPTS-INNER). ⚠ The same defect served `composeRuntime({canvas})`,
   which is the path a future renderer migration will take.
2. **`bootstrapRenderEverything` never started its FrameScheduler** — every render bootstrap in
   the repo wires listeners into a loop that does not run. FIXED here
   (§COMPONENT-RENDER-LOOP-WAS-NEVER-STARTED).
3. **`bootstrapScene` dropped the renderer soft-fail** — a failed GPU and an idle slot were the
   same value, so `scene.rendererError` could never be non-null on the success path. FIXED here
   (§SCENE-BOOTSTRAP-SOFT-FAIL-WAS-DROPPED).
4. **`runtime.stores` and `EverythingRuntime.stores` are different key sets** (`wall` is absent
   from the former). OPEN — probe arm P7 pins it.
5. **P3 `check-raf-count` is RED at HEAD-of-working-tree**, second owner
   `tools/perf/outer/outer-baseline.spec.ts` (untracked, another lane). OPEN, not mine.
6. **§COMPONENT-RENDER-BRIDGE-DUP** — a fourth copy of descriptor→`BufferGeometry` now exists
   because the SDK facade exposes none. OPEN.
7. **`check-layer-boundaries` cannot see untracked work.** A multi-lane session under a
   "do NOT commit" instruction produces a gate reading that measured none of the session's new
   files while printing a confident green. That is L-811's shape (a green over a tree it never
   read) surviving the very guard added for it, because `MIN_SCANNED_FILES` is satisfied by the
   *old* tree. OPEN.

---

## 8 · REFUSALS — things that would have made this report shorter and falser

- **Refused to wire `src/main.ts`** (§5.2). A second renderer on the page is not this lane's call.
- **Refused to render a placeholder** for an unresolvable definition or an all-refused bake. Spec
  §75; C100 §5's reasoning.
- **Refused to invent a component-definition registry** to make the render work. It would be a
  rival to the real one, minted by a rendering lane.
- **Refused to build a fourth `installSceneReconciler`** in `plugins/component` to work around B2.
  That would have made the component family render **on top of a known rival runtime** — a green
  built on the defect instead of over it.
- **Refused to claim the layer gate as evidence for my new files.** It did not read them.
- **Refused to fix the P3 breach** in another lane's untracked file, and refused to describe the
  gate as green because my part of it is.
- **Refused to declare `three` in `plugins/component/package.json`** without a matching
  `pnpm install`. ⚠ **OWED, and it is a landmine:** `plugins/wall` and `plugins/furniture` both
  declare `"three": "^0.183.2"` beside the identical `@pryzm/renderer-three/three` import, and
  resolution here only works by walk-up to the root `node_modules`. Adding it needs a lockfile
  update in the same commit ([[agent-packagejson-breaks-frozen-lockfile]]), and running an install
  under other live lanes was the larger risk. **The exports entry `"./committer"` was added — that
  one is lockfile-neutral.**

---

## 9 · ARTEFACTS

| Path | What it is |
|---|---|
| `lane-4e-rendered-instance.png` | ⭐ **the acceptance** — the placed component, rendered |
| `lane-4e-render-EVIDENCE.json` | the full post-fix browser record incl. both pixel censuses |
| `lane-4e-render-BEFORE-loop-fix.json` | the same run with B3 still live: geometry attached, `litPixels: 0` |
| `lane-4e-probe-PREFIX-SEEN-PASSING-ON-BROKEN.txt` | the probe passing **against the broken behaviour** |
| `lane-4e-probe-FLIPPED-after-fix.txt` | the three arms failing after the repair, verbatim |
| `lane-4e-probe-PASSING.txt` | the regression form, 8/8 |
| `lane-4e-committer-SEEN-FAILING.txt` / `-PASSING.txt` | the generation-guard falsification and the byte-identical restore |
| `lane-4e-gate-{compose,three,layers,raf}.txt` | the four gate transcripts |
| `lane-4e-editor-subset-PASSING.txt` | the bootstrap-adjacent editor suites, 40/40 |
| `harness/` | `render.ts` + `render.html` + `drive.mjs` + `serve.mjs` + `vite.harness.config.mts` — the instrument, with the reproduction command in the config's header |

---

## 10 · INDEPENDENT RE-VERIFICATION — second session, 2026-09-02 11:27–11:40

This section was written by a DIFFERENT session than §0–§9. The full 4E delta was inherited
uncommitted (doc mtime 10:22, transcripts 10:19, owned files 09:15–10:06); per the standing
mtime rule it was **verified by execution at the current HEAD, not redone**. Everything below is
a fresh run; transcripts are the `lane-4e-VERIFY-*` files beside this document.

### 10.1 · Tree-continuity check, before anything was re-run

Re-execution was mandatory, not courtesy: lanes 4B/4C/4D/4G re-verified in the shared tree at
11:07–11:25, **after** every 4E transcript, and their falsification cycles mutate-and-restore
shared sources. A `-newermt 10:19` sweep over every package this lane's path touches
(runtime-composer, renderer, scene-committer, family-instance/-runtime/-schema, frame-scheduler,
renderer-three, plugins/component, the two bootstrap files, apps/editor tests) found exactly
FOUR newer files: three `packages/family-instance/src/*` (4D's falsification targets — sha256
verified IDENTICAL to 4D's recorded restore hashes in `lane-4d-VERIFY-falsify-sha256.txt`) and
one unrelated Europe-wave test. **The tree content this lane measured is the tree at HEAD.**

### 10.2 · Fresh execution, RC captured directly (never through a pipe)

| Check | Inherited (10:19) | Fresh (11:27–11:40) | Transcript |
|---|---|---|---|
| committer unit suite | 7/7 | **7/7 · RC=0** | `lane-4e-VERIFY-committer-PASSING.txt` |
| scene-mount probe (apps/editor) | 8/8 | **8/8 · RC=0** | `lane-4e-VERIFY-probe-PASSING.txt` |
| `@pryzm/renderer` suite (SceneBootstrap repair) | 61/61 | **61/61 · RC=0** | `lane-4e-VERIFY-renderer-suite.txt` |
| **THE ACCEPTANCE — harness rebuilt + re-driven in headless Chromium** | 11,388 px | **REPRODUCED DIGIT-FOR-DIGIT** | see §10.3 |
| `check-single-compose` (P1) | RC=0 | **RC=0** — 1 root · 1/1 rival (declared debt) · 2/2 callers | `lane-4e-VERIFY-gate-compose.txt` |
| `check-three-imports` (P2) | RC=0 | **RC=0** — 8,396 files, 0 importers outside renderer-three | `lane-4e-VERIFY-gate-three.txt` |
| `check-layer-boundaries` | RC=0 | **RC=0** — 48/102 · 13/13 · 159/182, byte-for-byte the §6 reading; ⚠ still blind to untracked `plugins/component/` (finding §7.7 STANDS) | `lane-4e-VERIFY-gate-layers.txt` |
| `check-raf-count` (P3) | RC=1 ⛔ | **RC=1 ⛔ — UNCHANGED**, same two owners; the second is still `tools/perf/outer/outer-baseline.spec.ts`, untracked, another lane's. Not absorbable (R7/L-836), not this lane's | `lane-4e-VERIFY-gate-raf.txt` |

The 4C-owned join tests (`componentJoinThroughComposedRuntime`,
`persistedFamiliesReachTheSerializerChannel`) inside §6's 40/40 editor subset were re-executed at
this same HEAD by lane 4C's own verify session (18/18, RC=0, 11:11 —
`lane-4c-VERIFY-join-and-channel.txt`) and were not run a third time here.

### 10.3 · The acceptance, re-executed end-to-end

The harness bundle was REBUILT from the current tree and re-driven
(`lane-4e-VERIFY-render-EVIDENCE.json`, `lane-4e-VERIFY-rendered-instance.png`). ⚠ **The first
build attempt died RC=134 — V8 OOM at Node's default heap** — the same failure mode §6's root-tsc
note and lane 4C's report record; `NODE_OPTIONS=--max-old-space-size=6144` (the root build
script's own setting) built it in 4m16s, RC=0 (`lane-4e-VERIFY-harness-build.txt`). Worth
knowing before anyone reads a heap crash as a broken harness.

Every §4 reading reproduced exactly: **1 data runtime after compose AND after mount** ·
`host.get('wall')` **PRESENT** · `rendererError` **null** · census **0 → 11,388 lit px**
(bbox 184×115) after `component.place` · TYPE_A world bounds **(0,0,0)→(1.2, 0.1, 1.5) m** (the
mm→m §4D-ONE-LENGTH-SEAM, on the GPU) · after `component.swapType` **5,505 px** (bbox 137×87,
max.x **0.6**) · restored **11,388 px, the identical count**. Committer stats: rebuilds 1→2,
attachedSolids 1, refusals/unresolved/stale all 0. The screenshot shows the lit plate.

### 10.4 · Fresh falsification — a new cycle, not a replay of §4.1's

`§COMPONENT-RENDER-GENERATION-GUARD` was neutralised at the §-tagged site ONLY (the guard
condition replaced with `if (false)`; the catch-path twin left intact — a *different* mutation
than §4.1's removal, deliberately): **2/7 failed, RC=1** — arm D
`expected 1.2000000476837158 to be close to 0.6` (the superseded bake overwrites the newer
state, spec §66's forbidden outcome) and arm G `expected 1 to be +0`
(`lane-4e-VERIFY-falsify-SEEN-FAILING.txt`). Restored from a pre-mutation copy:
`sha256sum -c` **OK** at `08547322994eaae51478db2f35376b404bf63c3a2c6d28ba54d99f7b368e4470` —
**the identical hash §4.1 recorded**, proving byte-continuity across both sessions
(`lane-4e-VERIFY-falsify-sha256.txt`) — then **7/7, RC=0**
(`lane-4e-VERIFY-falsify-RESTORED-GREEN.txt`).

### 10.5 · Root tsc + housekeeping

- Root `tsc --skipLibCheck` at `--max-old-space-size=6144`: **RC=0, zero `error TS` lines**
  (`lane-4e-VERIFY-root-tsc.txt`) — confirming §6.1-era debt stays closed at this HEAD.
- `grep -rn 'scene\.mount(' src apps packages plugins server tools` re-run: every hit is a
  comment or docstring — **still zero production callers**, §5.1 re-confirmed.
- ⚠ `lane4e-dist/` (the harness bundle, untracked, repo root) was REBUILT by this verification
  and its deletion was denied by the permission system this session. It is throwaway build
  output per the harness header — delete it freely.
- Nothing committed, per brief. Working tree: 4 repair files ` M`, probe + `plugins/component/` `??`.

**Verdict: §0's two-sentence verdict STANDS as written.** The descriptor path is proven and
repaired at HEAD; the production call site remains descoped, not faked — D10's pre-authorised
outcome, re-confirmed on fresh evidence.
