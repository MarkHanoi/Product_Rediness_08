# C04 — Rendering & Scheduling

> **Stamp**: 2026-05-02 · **Status**: CANONICAL  
> **Scope**: `packages/renderer-three/` (single THREE owner, L1), `packages/frame-scheduler/` (single rAF, L1), `packages/scene-committer/` (L4), `packages/renderer/` (abstract renderer, L4), `packages/render-runtime/` (L4).  
> **Key principles**: P2 (single THREE owner), P3 (single rAF).

---

## §1 — Single THREE Owner (P2)

### §1.1 — The invariant

`import * as THREE` is **only permitted in `packages/renderer-three/`**. Every other package that needs a THREE type MUST import it via the `RendererHandle` or a typed re-export from `renderer-three`.

**CI gate**: `eslint-plugin-boundaries` — hard-fail.

### §1.2 — Why

Three.js bundles `~1.1 MB` gzipped. Allowing multiple packages to import it directly creates: (a) bundle duplication when dynamic-import splitting is applied, (b) version skew bugs when modules resolve different copies, (c) deep coupling that prevents swapping the renderer. All of these have been observed in PRYZM 1.

### §1.3 — Renderer handle

`packages/renderer-three/` exposes a `RendererHandle` interface that all callers use. Callers receive a `RendererHandle` from `composeRuntime().renderer`. They MUST NOT reach into THREE geometry objects directly; they use the typed API on `RendererHandle`.

```ts
interface RendererHandle {
  readonly canvas:    HTMLCanvasElement;
  readonly camera:    CameraHandle;
  attach(container: HTMLElement): void;
  detach(): void;
  resize(width: number, height: number): void;
  dispose(): void;
}
```

### §1.4 — WebGL / WebGPU fallback

`packages/renderer-three/` MUST attempt WebGPU first, fall back to WebGL 2, then plain WebGL. It MUST log the selected backend at init time. It MUST NOT throw on fallback — a headless/no-GPU environment returns a no-op renderer.

**Amendment (Wave A15 S121, 2026-05-03)**: The WebGPU adapter (`WebGPURendererAdapter`) MUST NOT be wired into the production boot path until P2 is fully green (the `check-three-imports.ts` CI gate exits 0 with zero violations). Until that gate is green, the fallback chain MUST route to `WebGLRendererAdapter` as its concrete implementation. This prevents the TSL pipeline from activating in environments where the P2 isolation invariant is not yet proven. The `RendererHandle` abstraction and `WebGLRendererAdapter` are available from Wave A15 S121 onward; `WebGPURendererAdapter` is gated behind P2 closure. Context-loss recovery callbacks MUST be wired via `setupContextLossHandlers` (exported from `@pryzm/renderer-three`); implementations MUST pause the render loop on `webglcontextlost` and invoke `onContextRestored` listeners on `webglcontextrestored`.

**Amendment (ADR-0267 §AUTO-WEBGL-HEAVY, 2026-07-17) — Known-behavior, not a violation**: The persisted backend toggle (`pryzm.renderer.backend` ∈ {`auto`, `webgpu`, `webgl`}, ADR-0076/ADR-0077) has an adaptive **Auto** mode. In **Auto** mode only, on a **real WebGPU** backend (`RenderPipelineManager.isRealWebGPUBackend()` / `status.webGpuActive`), when a scene becomes **device-loss-risk** per the shared `isHeavyModel` heuristic (**≥ 15 levels AND ≥ 1000 elements, OR ≥ 4000 elements** — the exact `LevelScoped3DCullingService` predicate, now exported), the editor **proactively live-swaps WebGPU→WebGL once per session** BEFORE the heavy PSO-compile that TDRs the GPU on some hardware (L-361). This is intentional: heavy WebGPU scenes are unstable on that hardware class while WebGL renders them cleanly. An **explicit** `webgpu` / `webgl` selection is ALWAYS respected (Auto is the only adaptive mode). The REACTIVE device-loss recovery (§FIX-HEAVY-SCENE-3D-SCALABILITY cap → WebGL safe-mode, ADR-0089) is retained as the safety net for anything that slips through. Implemented in `apps/editor/src/rendering/autoWebGLHeavyScene.ts`, fired from the batch GPU-compile-start hook (batched generators) and the per-add tier pass (non-batched residential). See ADR-0267 + L-362.

> ⚠ **CORRECTED 2026-08-20 (lane SWAP1, L-1413) — the paragraph above states a predicate the code has never used, and understates the firing sites. MEASURED, not read.**
>
> The founder opened a project — **294 elements / 3,191 meshes / 7 levels** — and the 3D viewport was empty. His console carries the swap firing with `reason=tier:post-load`. Against the predicate this amendment quotes, that scene is **not heavy on either arm** (7 < 15 levels; 233 counted element roots < 1,000 and < 4,000). It swapped anyway.
>
> **The two verdicts, measured through the public seams (`apps/editor/__tests__/autoWebGLHeavyScene.contractPredicate.test.ts`):**
>
> | predicate | where it lives | verdict for 233 elems / 3,191 meshes / 7 levels |
> |---|---|---|
> | `isHeavyModel(levelCount, elementCount)` — the one this amendment quotes | `packages/core-app-model/src/rendering/LevelScoped3DCullingService.ts:180` | **false** |
> | `isSwapWorthyHeavyScene(elementCount, sceneMeshCount)` — the one that actually gates the swap | `apps/editor/src/rendering/autoWebGLHeavyScene.ts` | **true** (mesh arm: 3,191 ≥ 1,000) → `swap('webgl-classic')` |
>
> **`isHeavyModel` has ZERO call sites outside its own file.** Its own JSDoc claimed *"EXPORTED as the single source of truth … the Auto-mode proactive WebGL fallback reuses this EXACT predicate"* — that sentence was false when written here and false in the source; both are corrected. This is C84 §3.5.1 axis (d), the CALL axis: a predicate that is exported, documented as the authority, and invoked by nobody.
>
> **The divergence was DELIBERATE and is CORRECT — only its record was missing.** ADR-0267 §Fix-1 (L-366) split the swap threshold away from the massing-LOD threshold on purpose: a normal ~6-storey generation (~1,300 elements / ~1,645 meshes) reliably TDR'd the device yet never tripped `isHeavyModel`, so reusing it left the building on WebGPU to crash. ⛔ **Do NOT "fix" this by pointing the swap at `isHeavyModel` — that re-opens L-361.** The NORMATIVE predicate for the backend swap is, and remains:
>
> > **≥ 400 top-level BIM element roots, OR ≥ 1,000 scene meshes** (`SWAP_ELEMENT_THRESHOLD` / `SWAP_MESH_THRESHOLD`, either arm). The mesh arm is optional per call site: a caller without a live mesh count relies on the element arm alone. `isHeavyModel` (≥ 15 levels AND ≥ 1,000 elements, OR ≥ 4,000 elements) governs **massing LOD only** and is deliberately far higher.
>
> **There are THREE firing sites, not two:**
> 1. `apps/editor/src/engine/initBatchLifecycle.ts:121` — batch GPU-compile-start (batched generators). *Pre-empts.*
> 2. `apps/editor/src/ui/generation/buildingGenerationLifecycle.ts:307` — start-of-generation, before any geometry exists (ADR-0267 start-of-generation refinement, L-367). *Pre-empts.*
> 3. `apps/editor/src/engine/initScene.ts:2845` — the per-add tier pass, `tier:${reason}`. This is **also reached once per project OPEN** via `_runConsolidatedTierPbrPass = () => runTierPbrPass('post-load')` (initScene:2875), fired from the `pryzm-project-loaded` listener at initScene:3583. **That is the founder's `reason=tier:post-load`, and it pre-empts nothing.**

> ⚠⚠ **CORRECTED AGAIN 2026-08-20 (lane WEBGL4, L-1480) — the SAME paragraph carries THREE more claims that the code contradicts, and one of them is the sentence a founder was told to rely on.** MEASURED at `apps/editor/src/rendering/autoWebGLHeavyScene.ts` and `apps/editor/src/engine/initScene.ts`, HEAD.
>
> **(a) “In **Auto** mode only, on a **real WebGPU** backend” — FALSE on both halves.** The gate is `backendBenefitsFromClassicSwap()` (autoWebGLHeavyScene.ts:194-197), which reads the **live resolved backend**, not the persisted pref, and returns true for `'webgpu'` **AND `'webgl-fallback'`**. §Fix-3/L-382 deliberately replaced the Auto-only + real-WebGPU-only gates precisely because the founder's box boots `'webgl-fallback'` from a persisted `'webgl'` pref — the case that MUST upgrade, which both old gates short-circuited. The mode is not consulted anywhere in the decision.
>
> **(b) “An **explicit** `webgpu` / `webgl` selection is ALWAYS respected (Auto is the only adaptive mode)” — FALSE, and deliberately so.** ADR-0267 §Fix-3 (L-366) REMOVED the explicit-pin honour for device-loss-risk scenes. `fireSwapToWebGL(reason, pref === 'webgpu', …)` (autoWebGLHeavyScene.ts:308/353) takes the pin only as **log wording**, then swaps regardless — the code's own message says so out loud: *“switched WebGPU→WebGL for stability despite the explicit WebGPU pin. Re-pick WebGPU to override.”* ⛔ **Do NOT “fix” the code to honour the pin — that re-opens L-361.** The CODE is intentional; this SENTENCE was the stale half. Only **light** scenes (which never reach the gate) still honour a pin.
>
> **(c) ⭐ NOT PREVIOUSLY RECORDED ANYWHERE — the swap OVERWRITES the user's stored pick.** `initScene.ts:4626`: `setRendererBackendPreference(intendedClassicWebGL ? 'webgl' : pref)`. A `'webgl-classic'` swap is not round-trippable (`getRendererBackendPreference` accepts only `auto|webgpu|webgl`), so it persists the nearest user-facing value — **`'webgl'`, on top of an explicit `'webgpu'`**. The pin is therefore not merely overridden **for this session**; it is **destroyed on disk**. The next boot resolves `'webgl'` → `forceWebGL` → `'webgl-fallback'` **before the heuristic runs at all**. That is why a founder who re-picks WebGPU keeps landing back on a WebGL backend on the following open, and why “re-pick WebGPU to override” understates what happened to him. ⚠ The *swap* is intentional; **persisting over the pin is not** — §DIAG-FIX-WEBGPU-BACKEND-OSCILLATION added the per-call `backendOverride` parameter for exactly this reason (“without calling `setRendererBackendPreference('webgl')` — which previously silently clobbered the user's persisted choice”, createRenderer.ts:233-243) and this call site does not use it. **It is the L-203 defect, re-created at a different seam.**
>
> **(d) ⭐⭐ THE COST THIS AMENDMENT NEVER STATED.** The swap target is **not “WebGL” in general** — since §L-372B/L-382 it is `swap('webgl-classic')` → a genuine classic `THREE.WebGLRenderer`, backend **`'webgl-only'`**, a THIRD backend with no TSL/node compile and its own constructor options (`WebGLRendererAdapter.ts:94` is the repo's ONLY `logarithmicDepthBuffer: true`, set on neither of the other two backends). `fireSwapToWebGL`'s own comment asserts *“the material-safety audit confirmed the generated scene is 100% classic materials, so it renders correctly (walls/slabs/glass/stairs/furniture + WebGLShadowMap shadows) on the classic renderer.”* **That is a prose-justified verdict with no gate behind it, and the founder's screenshots falsify it**: on `'webgl-only'` his six-storey building renders as black outline profiles with no solid surfaces, and the same scene renders correctly the moment he swaps to WebGPU. ⭐ **A stability guard that moves the user onto a path where lit geometry does not draw is not a stability guard.** Tracked as L-1481; the honest reading of this amendment today is *“the swap avoids a device loss by moving the user to a backend that currently cannot draw his building.”*

**§1.4a — The backend decision is taken at the point of MAXIMUM ATTACHED STATE (OPEN, L-1414, 2026-08-20)**

`reason=tier:post-load` means the swap decision for a project OPEN is taken **after** all 3,191 meshes exist and have rendered. ADR-0267's whole premise is *"swap BEFORE the heavy PSO-compile that would TDR the device"* — at `post-load` that compile has already happened and survived, so the swap buys nothing it was designed to buy while paying the maximum possible cost: `§RENDERER-LIVE-SWAP` disposes the TSL pipeline, builds a second renderer on a second canvas, re-binds five services and retires the old renderer **against a fully populated scene**. It fires on *every* project open above the threshold, so this is not an edge case.

**The correct shape is to decide the backend BEFORE the scene is populated** — the other two firing sites already do exactly that, and site (2) is the proof that it is achievable. ⚠ **NOT DONE, and honestly so:** the project-load path can supply an element count and a level count from the snapshot before any mesh is built (`ProjectLoader` already logs `walls/slabs/levels/curtainWalls/rooms/doors/windows` at load start), but it **cannot supply a mesh count** — and the founder's project trips the swap ONLY on the mesh arm (233 element roots < 400). Moving the decision earlier therefore requires a **mesh-count ESTIMATE from element counts**, i.e. a new per-family multiplier. This contract's own §INST.2 records why that is refused on sight: *"512 is ARBITRARY, and raising it is NOT the fix."* Inventing a multiplier to make the timing work would trade a timing defect for an arbitrary-constant defect. **The decision stays where it is until the estimate can be DERIVED (for example from the previous session's measured mesh count for the same project, persisted), and this clause is the record that it is wrong — not the record that it is fine.**

**§1.4b — `§RETIRE-RENDERER-DETACHES-LISTENERS` DETACHES A RENDERER, NOT THE BUILDING (NORMATIVE, L-1411, 2026-08-20)**

The live-swap log line `old renderer retired — N render object(s) detached from their materials/geometries` has been read as *"N scene objects were unbound and something must re-attach them."* **It does not mean that, and there is no re-attach to look for.** MEASURED at the founder's exact scale (`packages/renderer-three/__tests__/rendererRetirement.populatedScene.test.ts`, real three r183 `RenderObjects` + real `retireRenderer()` + a real populated `THREE.Scene` of 3,181 meshes):

| quantity | before retire | after retire |
|---|---|---|
| scene meshes holding a live material **and** a non-empty position attribute | **3,181** | **3,181** |
| `'dispose'` listeners on those materials + geometries | **6,362** (2 per render object) | **0** |
| scene children | 3,181 | 3,181 |

`RenderObject.dispose()` (RenderObject.js:904-911) removes the retired renderer's two listeners and deletes its own per-object pipeline / binding / node state. It never touches `mesh.material` or `mesh.geometry`. The incoming renderer mints its own draw state on its first frame — and when the incoming renderer is the §L-372B classic `THREE.WebGLRenderer`, it mints **no** `RenderObject` at all; it compiles `WebGLProgram`s from the same materials the scene still holds. **A "missing re-attach" is not a defect this seam can have.** Do not re-open it without a measurement that contradicts the table above.

**§1.4c — A retirement count of `0` MUST say WHICH zero (NORMATIVE, L-1410, 2026-08-20)**

The same log line reported `0`, `3181`, `6936` and `6937` across one day of founder sessions, and a prior lane flagged the `0` without being able to investigate it — because one word covered three states. `retireRenderer()` now carries a monotonic mint counter and a derived classification (`classifyRetirement` / `mintedRenderObjectCount` / `describeRetirement`, `packages/renderer-three/src/rendererRetirement.ts`), and the retirement log MUST print all three facts together:

* **`mints-none`** — a classic `THREE.WebGLRenderer` exposes no `RenderObjects`. `0` is **complete and correct**: nothing was ever attached.
* **`untracked`** — the renderer owns `RenderObjects` but was never instrumented. `0` means **the sweep looked in the wrong place** and every listener it registered is about to outlive it (L-948). Warned loudly (pre-existing).
* **`tracked`** — read the detached count **against the mint count**. `detached === 0 && minted > 0` was **silent** before L-1410 and is now warned: the tracking set was emptied by something other than this seam.

⛔ A bare count with no denominator and no kind is not an acceptable diagnostic here. This project has been wrong about an unqualified `0` from a counter repeatedly — a version count, an audit detector, an in-flight guard, a rescue that rescued nothing.

**§1.4d — An instrument MUST NOT name a backend it did not resolve (NORMATIVE, L-1412, 2026-08-20)**

The founder's console carried, one line apart:

```
[renderer-three] backend: webgl1 (§L-372B classic THREE.WebGLRenderer)
[RenderPipelineManager] §PERF-WEBGL2-NO-TSL WebGL2 backend detected …
```

Two components naming two different backends for one live renderer. **The DECISION was never wrong** — `RenderPipelineManager.isRealWebGPUBackend()` answers one boolean and this is its `false` arm, which by construction covers BOTH the `WebGPURenderer` WebGL2 fallback and a classic `THREE.WebGLRenderer`; it is the same partition `isNativeWebGpuBackend()` / `isLightweightWebGlBackend()` express at the app layer (lane BG1, L-1191). **Only the LABEL lied**, and it lied by hardcoding a backend name into a branch that resolves none — the identical defect `UnifiedFrameLoop` was corrected for (a hardcoded `"WebGPU"` in a block that read no backend state). The message now reports the boolean it evaluated and the evidence it evaluated it from, and explicitly declines to name which of the two WebGL renderers is live. ⛔ **Do NOT resolve this by adding a backend-string comparison inside `RenderPipelineManager`** — it is L1 and cannot see the app-layer `RendererBackend` vocabulary; a third spelling of the partition is what produced the disagreement in the first place.

**§1.4e — `§SWAP-PAINTS-THE-BUILDING`: the swap reports whether it painted (L-1411, 2026-08-20)**

`§RENDERER-LIVE-SWAP` now prints, immediately after the swap and again one second later (`apps/editor/src/engine/initScene.ts`): scene mesh count; how many of those hold a **live material AND a non-empty position attribute** (derived by traversal, never a hand-listed set of element types); whether the single rAF loop is running; whether the lightweight WebGL render path is armed; `RenderPipelineManager.getFrameSkipReport()` (§L900-FRAME-SKIP-ATTRIBUTION — which names the exact gate a stalled viewport is stalled at); and the renderer's own draw-call / triangle counters. The second reading is the decisive one: `framesPresented > 0` with `drawCalls > 0` means the swap painted, and any remaining blankness is a COMPOSITING question (§1.5); `framesPresented === 0` names the gate instead. This exists because *"the viewport is empty after the swap"* has now been investigated twice from a console transcript with neither reading available.


**WebGPU-safety measures on the NON-swapped (light-scene) WebGPU path (L-363/L-364, 2026-07-17)**: Auto-WebGL (above) only diverts HEAVY scenes to WebGL — light scenes still render on real WebGPU, so `RenderPipelineManager` MUST keep two TSL-safety guards on that path. (1) **TSL-init guard** (L-319 §SS-FIX-TSL-NOT-LOADED-BEFORE-SCENEPASS): every `createScenePass()` caller (`_buildPipeline` / `_buildPhase3Pipeline` / `_fullRebuild`) short-circuits when `globalThis.__PRYZM_TSL__` is not yet loaded — `bind()` sets `_webGpuActive = true` before awaiting `_loadTSL()`, so a batch's `autoEnablePerf → _fullRebuild` in that window would otherwise call `createScenePass()` pre-`initTSL()` and throw. (2) **Transmission guard** (L-361 §L-361-WEBGPU-TRANSMISSION-GUARD): at each batch boundary, on real WebGPU only, `_neutralizeTransmissionForWebGPU()` falls transmission glass back to opacity glass (`transmission = 0` + `needsUpdate`) so the `MeshPhysicalNodeMaterial` transmission/refraction node graph — which emits invalid WGSL ("expected a float") on three r183's WebGPU backend — is never generated. WebGL is untouched by both (keeps the full TSL/refractive-glass path). See L-363 + L-364.

### §1.5 — Viewport background: ONE authority, READ not PUSHED (NORMATIVE, L-1191)

> The viewport background has been reported wrong FOUR times — L-326, L-326 reopened,
> L-1148 (`cd11d547`), L-1191 — always as *"the WebGL background should always be white,
> it still sometimes comes grey"*. Each of the first three fixes armed **one more code
> path**. **The enumeration WAS the defect**; this section exists so the fifth report
> cannot be fixed the same way.

> ⚠⚠ **THE FIFTH AND SIXTH REPORTS ARRIVED (2026-08-20) AND NEITHER WAS A BACKGROUND.**
> The box above braced for a fifth *background* fix. What actually came was two reports of
> a **flat, undifferentiated viewport** whose cause is not in this section's authority at
> all — and reading them as background reports is now the predictable mistake:
>
> - **L-1353 (lane BG1, 🟡 OPEN)** — the grey is very likely the 4 km `ShadowMaterial`
>   ground catcher **compositing as fully shadowed**, i.e. something **DRAWN**, not a
>   background. Measured, deliberately not fixed without a browser reading.
> - **L-1470 (lane RENDER3, ✅ FIXED)** — founder: *"ALL MATERIALS GONE ON THE VIEW"*, flat
>   white, **WebGPU live**. It was neither a background nor the material database. A
>   **SECOND surface** — OBC's WebGL canvas — was sized to **0×0** by OBC's own unguarded
>   `ResizeObserver` (`@thatopen/components` index.mjs:14535 has no `Math.max`, no `> 0`,
>   no `||`) the moment `mainRendererVisibility` set `display:none` on its **parent**
>   container, and every draw into it was discarded.
>
> ⭐⭐ **THE RULE THIS ADDS, and it is the one that generalises:** on the native-WebGPU path
> the overlay presents `presenceAlpha = step(0.0001, contentAlpha)` — **alpha 0 in every
> empty-space pixel** — so *what the user sees in those pixels is whatever is BEHIND the
> overlay*. **A flat or wrong viewport is therefore a COMPOSITING question before it is a
> background question,** and this section's five surfaces cannot answer it. ⛔ **Do not
> route a "the viewport is white/grey/flat" report into §1.5 by reflex.** Establish first
> whether the pixel is *painted* (a background), *drawn* (L-1353), or *never delivered
> because its surface had no area* (L-1470). Those are three different subsystems and
> §1.5 owns only the first.

**§1.5.1 — Two mechanisms, and only one of them may be enumerated.**
A backend paints the flat viewport background by exactly one of two mechanisms, and
which one is a **function of the resolved backend**, never of a flag:

| backend | mechanism | `scene.background` | clear prime |
|---|---|---|---|
| `webgpu` (native) | TSL output node — `mix(bgUniform, sceneColor, hasGeometry)` | **MUST be `null`** — a Color gives every pixel alpha=1 and defeats the `hasGeometry` mask (the Phase-5 "whitening layer") | **transparent** (`0x000000, 0`) |
| `webgl-fallback` | scene property + per-frame opaque clear | **MUST be a Color** | **opaque** (`_lightweightBgColor, 1`) |
| `webgl-only` | scene property + per-frame opaque clear | **MUST be a Color** | **opaque** |

The WebGPU mechanism is structural — if a frame is presented, the background is in it.
The WebGL mechanism is not, so it is the one that keeps breaking, and it is the one this
section governs.

**§1.5.2 — The rules.**

1. **`packages/renderer-three/src/pipeline/RenderPipelineManager` is the SINGLE RUNTIME
   WRITER** of the flat viewport background (`_applyViewportBackground()`,
   §VIEWPORT-BG-ONE-AUTHORITY-RUNTIME). `LIGHT_BG_HEX` / `DARK_BG_HEX` in
   `pipeline/BackgroundUniform.ts` are the single COLOUR authority; `SceneTheme` and the
   `#container` boot CSS **derive** from them (§VIEWPORT-BG-ONE-AUTHORITY, 2026-08-08).
   A **texture** background (HDRI / panorama / procedural sky) is owned by its provider
   and MUST NOT be stomped — this authority owns the FLAT colour only (C84 EI-9).
2. **No other seam may take a background decision it does not own.** In particular
   `scene.background = null` and `setClearColor(0x000000, 0)` are **native-WebGPU-shaped
   decisions**. `initScene` took both **unconditionally** at boot (`:2084`) and at the
   live-swap seam (`:4414`) — at seams that had **already resolved the backend** — and was
   correct only because `rpm.bind()` happened to run *later in the same function* and
   overwrite them. **A single authority whose correctness depends on the statement ORDER
   of a rival writer is not a single authority.** Both are now gated on
   `isNativeWebGpuBackend()`. Do not un-gate them.
3. **Backend membership is a COMPLEMENT, never a list.**
   `apps/editor/src/rendering/createRenderer.ts` exports the ONE pair —
   `isNativeWebGpuBackend()` and `isLightweightWebGlBackend()` (defined as its
   complement, so they **partition** `RendererBackend` by construction). Every arm that
   must decide "does this backend need the lightweight per-frame render, the per-frame OBC
   base clear, and an opaque clear?" MUST read that predicate. **Writing
   `b === 'webgl-fallback' || b === 'webgl-only'` by hand is a contract violation** — that
   is how the boot arm came to list **one** of the two and the rollback arm **neither**.
   Pinned by `apps/editor/__tests__/viewportBackgroundBackendVocabulary.test.ts`.
4. **Every arm that re-seats the renderer MUST re-assert BOTH backend-shaped arms.**
   There are **four**, and they must stay symmetric: **boot** (`initScene` §PERF-WEBGL2-
   RENDER-ON-MOVE), **live swap** (§RENDERER-LIVE-SWAP step 5), **live-swap ROLLBACK**, and
   **recovery** (`RenderPipelineManager.recoverPipeline`, §L-326). The rollback arm
   asserted **neither** until L-1191. The failure mode when an arm forgets is *not* "wrong
   colour" — it is **"no frame at all"**, and the app-chrome grey (`--app-bg` `#e8edf6`, on
   `#container` / `<bim-viewport>`) shows through the transparent overlay. That is what
   "grey" has meant every time.
5. **Report the HEX, never the word "grey".** Five surfaces can be "the background of the
   3D view" (overlay clear → `scene.background` → OBC base canvas → `<bim-viewport>` CSS →
   `#container` CSS). `window.pryzmViewportBackgroundReport()` (§VIEWPORT-BG-PROBE, L-1191)
   names all five plus the resolved backend and whether the lightweight render is armed; it
   also prints unconditionally after every live swap. **Any new report of a wrong viewport
   background MUST carry its output.** Two of the four previous fixes changed a surface that
   was already correct, because no report ever carried a hex.

**§1.5.3 — OPEN, tracked, owned by `renderer-three` (NOT closed by L-1191).**

- `RenderPipelineManager.bind()` **unconditionally re-seeds `_lightweightBgColor` from its
  `initialTheme` argument**, and `recoverPipeline()` hardcodes `'light'`. Every live swap
  and every device-loss recovery therefore **discards a user-chosen scene background
  (`setColor`) and the night theme (`setTheme`)**. Push-only state reset by an arm that does
  not know the current value — the same defect shape one level down. Fix: seed from the
  manager's own current colour, or thread the live theme.
- `_lightweightWebGlActive` is **stored** state that four arms must arm, when it is
  **derivable** (`!_webGpuActive && renderer != null`). Rule 4 above is a discipline
  standing in for a structural fix; deriving it retires the enumeration entirely.
- `apps/editor/src/ui/bottom-menu/BottomActionMenu._toggleDayNight()` writes
  `scene.background` **directly**, outside the authority, and pushes its clear colour to
  `window.world.renderer.three` — the **OBC** renderer, which draws nothing in Phase 5. It
  must route through `rpm.setTheme()` / `rpm.setColor()`.
- `packages/render-pipeline/` carries an **orphan second copy** of `BackgroundUniform` whose
  `DARK_BG_HEX` is the retired grey-navy `#1f2433`. No workspace depends on it. Delete it
  before someone imports it.

---

## §2 — Single rAF Owner (P3)

### §2.1 — The invariant

`requestAnimationFrame()` is called **only** in `packages/frame-scheduler/src/RafAdapter.ts` (invoked by `packages/frame-scheduler/src/FrameScheduler.ts`). All animation, render loops, and per-frame callbacks MUST subscribe to the `FrameScheduler` interface exposed on `PryzmRuntime.scene.scheduler`.

**CI gate**: `tools/ga-gate/check-raf-count.ts` — ratchet at 1 owner, hard-fail.

### §2.2 — FrameScheduler API

> ⚠ **Drift note — this section previously described an API that never shipped; corrected
> 2026-08-07.** The contract declared `onFrame(cb, priority)` with
> `FramePriority = 'physics' | 'update' | 'render' | 'post'`. No such API exists anywhere
> in the codebase. The section below describes the API `packages/frame-scheduler/` has
> actually shipped (`FrameScheduler.ts`, `types.ts`); the invariants (§2.1, single rAF;
> the no-backward-mutation rule in §2.3) were and remain binding.

The real API (`packages/frame-scheduler/src/FrameScheduler.ts`):

```ts
// Per-frame subscription — id-keyed, priority-ordered. Mirrors PRYZM 1's
// UnifiedFrameLoop.addTickListener shape. Duplicate ids are refused.
addTickListener(id: string, cb: TickListenerCallback, priority: TickPriority): TickListenerDisposer;

// One-shot: runs on the NEXT frame at the given phase, then auto-unsubscribes.
// `reason` is a human-readable label (minted into a unique internal id).
scheduleOnce(reason: string, cb: TickListenerCallback, priority: TickPriority = 'post-render'): TickListenerDisposer;

// Thin wrapper: scheduleOnce(phase, cb, phase).
schedule(phase: TickPriority, cb: TickListenerCallback): TickListenerDisposer;

type TickPriority = 'pre-render' | 'render' | 'post-render' | 'overlay';
```

Two **distinct** priority vocabularies exist and MUST NOT be conflated:

- **`TickPriority`** (above) — the per-frame *phase* a tick listener runs in.
- **`Priority`** — a separate queue-class enum (see `types.ts`, `PRIORITIES` /
  `isPriority`) used for budgeted background work, paired with
  **`getBatchBudget(key): BudgetToken | null`** — the mechanism by which batched work
  requests a per-frame time budget instead of running unbounded.

Non-visual work MUST NOT ride the frame bus as its only driver: the frame bus stops when
rendering stops, and `§PROGRESS-SCHEDULER` (`602f286a`) exists precisely because progress
work died with it (`progressScheduler.ts` is the sanctioned path).

### §2.3 — Priority tiers (execution order per frame)

> Corrected 2026-08-07 alongside §2.2 — the tiers below are the shipped `TickPriority`
> order (`TICK_PRIORITIES`), not the never-shipped physics/update/render/post ladder.

1. **pre-render** — input sampling, element/scene state updates that must precede the commit.
2. **render** — THREE scene commit + `renderer.render()`.
3. **post-render** — work that reads the completed frame (screenshot capture, perf sampling, telemetry flush). Default phase for `scheduleOnce`.
4. **overlay** — 2D overlay/HUD painting on top of the completed frame.

A callback MUST NOT mutate state in a tier that has already executed in the current frame.
Listener errors are isolated (one throwing listener cannot kill the frame), and entries
added during iteration run on the NEXT frame — the "next frame" contract that
`scheduleOnce`/`schedule` document.

---

## §3 — Scene Committer (L4)

`packages/scene-committer/` is the bridge between the domain store (`ElementStore`) and the THREE scene graph. It:

- Subscribes to `ElementStore` changes at **render** priority.
- Computes a minimal diff (add / update / remove) between the previous committed scene and the current store snapshot.
- Issues the corresponding THREE object mutations (`mesh.position.set(...)`, `material.color.set(...)`, etc.) through `RendererHandle`.
- MUST NOT call `renderer.render()` itself; that is the responsibility of the render priority callback in `packages/render-runtime/`.

### §3.1 — Scene committer invariants

- All THREE object creation/destruction MUST go through the scene committer. No plugin or UI component MAY add objects to the THREE scene directly.
- The committer MUST be idempotent: calling it twice with the same store snapshot MUST produce the same scene state with no extra allocations.

> ⚠ **Status: declared-but-unenforced debt (measured 2026-08-07).** The first invariant is
> violated at scale today: **~86 direct `.add(` sites** put objects into the THREE scene
> without the committer, including **~15 core BIM fragment/element builders** (walls,
> slabs, stairs, roofs, furniture, …). No CI gate counts these sites, which is how the
> number got to 86 silently. The invariant is deliberately KEPT — it is the end-state the
> architecture converges on — but until a migration exists, code review must not cite
> this clause as if it described the present.
>
> The pragmatic bridge is the **`SceneDeltaChannel`** (ADR-0302 §1): rather than forcing
> all creation through the committer first, the scene publishes a per-frame mesh delta so
> consumers stop re-deriving "what is in the scene" — which removes the O(scene) cost that
> makes the direct-add sites harmful, independent of who added the mesh. Migration of the
> ~86 direct-add sites to the committer is future work and needs (a) a ratchet gate on the
> site count, shrink-only, and (b) a per-builder migration plan. An invariant nobody
> enforces is tolerable only while it is loud about it — hence this note.

### §3.1.1 — Per-edit cost is proportional to the edit (ADR-0302, binding)

Per **ADR-0302 `§EDIT-COST-IS-PROPORTIONAL`**:

- The scene publishes a per-frame **mesh delta** (added/removed since the last drain),
  drained once by the frame scheduler; consumers process **only the delta**.
- **Steady-state per-edit `scene.traverse()` count MUST be zero**, and it is an asserted
  metric, not an aspiration. A consumer that believes it needs a global answer MUST
  justify it in code; the one legitimate global — the tier's mesh count — is a counter
  maintained by the channel, exact, never sampled.
- Resize is not a project switch (ADR-0302 §2; `§RESIZE-IS-NOT-A-PROJECT-SWITCH`,
  `7131835c`/`4f75386a`).
- One owner per GPU resource, ordered against in-flight submits (ADR-0302 §3;
  §GPU-RESOURCE-LIFETIME below).
- Any cap, LOD drop, sampling limit or tier de-escalation MUST be declared/logged
  (ADR-0302 §4).

### §3.1.2 — §GPU-RESOURCE-LIFETIME (ADR-0297, binding)

Folded from ADR-0297's "C04 amendment" section, as amended 2026-08-07:

1. **L1 Ownership** — a GPU resource handed out by a cache is owned by that cache and MUST
   NOT be released by an element teardown; ownership is recorded ON the resource.
2. **L2 Ordering** — a GPU resource may be released only after every `Object3D`
   referencing it is detached AND the frame that last referenced it has finished
   submitting: **detach on your own tick, release at the frame boundary**
   (`scheduleGpuRelease`). A `setTimeout(0)` is a guess at a frame boundary, not the frame
   boundary.
3. `RenderPipelineManager.render()` is the **sole drain point** for deferred GPU releases.
4. A render failure MUST be classified before it is retried; a retry that cannot repair
   the fault class is a defect. A recovery MUST refuse a fault it cannot reach (e.g. a
   light-owned `LightShadow.map`) rather than burn a reconstruction that cannot work.
5. Error suppression MUST be accounted and escalate on a burst.

#### §3.1.2a — §GPU-CASTER-RELEASE-CHOKEPOINT (L-1290, 2026-08-19, binding)

> ⭐ **Added because rules 1–5 above were satisfied and the founder still lost the viewport,
> five times in one week.** Each recurrence was a NEW route (nav · whole-load · wall commit ·
> tier ceiling · handrail retype · handrail MATERIAL) reaching the same fault. What they had in
> common was not a missing rule — it was that the shadow-ordering window had to be opened by a
> caller who REMEMBERED to open it, and the answer to *"which mutation changes the shadow caster
> set?"* was an ENUMERATION of BIM events
> (`apps/editor/src/engine/geometryMutationEvents.ts`, §GEOM-CASTER-EVENT-CHOKEPOINT / L-1189).
> An enumeration cannot cover a GENERIC verb, and the fifth recurrence arrived through one:
> `element.updateParameters`.

6. **The shadow-ordering window is DERIVED from the RELEASE, not from the event that led to
   it.** `scheduleGpuRelease()` MUST detect that a released `Object3D` subtree contains a
   `castShadow` mesh and notify the frame owner, which MUST open the same submit-pause +
   shadow-freeze window `runShadowCasterMutation` defines and close it at the frame boundary
   after the release drain. **A route that does not announce itself MUST still be guarded.**
7. **Therefore the release funnel MUST have no bypass.** An element builder MUST NOT call
   `geometry.dispose()` / `material.dispose()` on a mesh in place; rule 6 is only true while
   rule 2 is universal, so a bypass silently invalidates the derivation rather than merely
   leaking. Gated shrink-only by
   `packages/renderer-three/__tests__/casterReleaseChokepoint.test.ts` ARM C, which walks the
   `packages/geometry-*` trees rather than consulting a maintained list.
8. **A guard that pauses submits MUST be bounded.** An unbounded submit pause is a frozen
   viewport — the same shape as an unbounded recovery retry (rule 4). The derived window caps
   at `MAX_CASTER_RELEASE_PAUSED_FRAMES` consecutive frames and degrades to the batch-level
   freezes rather than holding the screen dark.

> ⚠ **Scope, stated so this is not read as total.** Rule 6 covers subtree releases, which is
> the shape every builder uses. A bare `material` / `geometry` handle carries no back-reference
> to the mesh that drew with it, so `castShadow` is not knowable from it and those releases are
> NOT covered. The enumeration in `geometryMutationEvents.ts` is **retained**, not replaced:
> the two arms fail differently, and neither has been shown to subsume the other.

#### §3.1.2b — §SURFACE-WITH-NO-AREA-REFUSES-THE-PASS (L-1470, 2026-08-20, binding)

9. **A pass MUST NOT be created against, or run on, an output surface with no area.** A
   surface whose backing store is `0` in either dimension makes its framebuffer *incomplete*:
   the driver discards every draw and reports `GL_INVALID_FRAMEBUFFER_OPERATION: Framebuffer
   is incomplete: Attachment has zero size`. The submit is not merely wasted, it is
   **invisible** — see rule 12.
10. **The area MUST be derived from the surface's own BACKING STORE**
    (`getDrawingBufferSize` → `getSize` → `domElement.width/height`), never from
    `clientWidth`/`clientHeight`. Two reasons and both bind: the CSS read forces a layout
    reflow on a per-frame path, and the backing store *is* the dimension the attachments are
    allocated from, so a zero there **is** the fault rather than a correlate of it. THE ONE
    implementation is `hasDrawableArea` / `admitSurface` in
    `packages/renderer-three/src/surfaceArea.ts`; `RenderPipelineManager._isRenderTargetZeroSize()`
    delegates to it. ⛔ **Do not write a second copy** — the founder's flood happened because
    the one correct copy examined only one of the two live surfaces.
11. ⛔ **A CLAMP IS NOT A FIX.** `Math.max(1, …)` on a GL surface still discards the image and
    converts a loud, diagnosable driver error into a **silent wrong picture**. The pass must
    not run. (`PlanViewCanvas.setSize` clamps deliberately, but that is **Canvas2D** — there
    is no framebuffer to be incomplete. It is not a precedent for a GL surface.)
12. **The refusal MUST aggregate on the REASON and the message MUST survive** (§INST.4).
    Chrome caps GL error reporting at ~255 per context and then goes **permanently silent**,
    so a flood does not merely spam — it **blinds the console to every later fault on that
    context** (this is how the 488 undrawn window frames stayed invisible, L-1402). One warn
    per episode per site, one info on resume carrying the refused count, and a retrievable
    report (`window.pryzmZeroAreaSurfaceReport()`); aggregation is per **site**, so one hidden
    surface cannot mask a different refusal, and it re-arms after a resume.
13. ⭐ **ASK WHETHER THE CONDITION CAN EVER BE SATISFIED before treating a zero as transient.**
    A surface sized from a `display:none` container is **not** momentarily zero on the way to
    layout — it is zero until that container is shown again. "Wait for the next frame" is not
    a recovery strategy for a permanent condition (L-716, and L-1470 is its second instance).

> ⚠ **What rules 9–13 do NOT cover, stated so this is not read as total.** They stop *this
> codebase* drawing into a zero-area surface. They do **not** stop a third-party renderer
> zeroing its own canvas — OBC's `SimpleRenderer.resize` does exactly that, unguarded, from a
> `ResizeObserver` on the canvas's parent, and it lives in `node_modules`. Nor do they gate
> **allocation** of every offscreen target: several sites still size targets from a possibly-zero
> renderer without a guard (`ViewportPathTracer`, `SSGIService`, `EnhancedBloomService`,
> `PanoramaPanel.onResize`, `ViewRenderCache`, and `packages/renderer/src/passes/*`). Those are
> **named, not fixed** — most are opt-in or currently unreachable — and each is a rule-9 breach
> the day its path goes live.

### §3.2 — GPU picking ID-buffer requirement (Amendment — Wave A15 S121, 2026-05-03)

The picking system MUST use an offscreen `WebGLRenderTarget` ID buffer for element selection. Raycasting (`THREE.Raycaster`) is permitted ONLY in headless or no-GPU contexts where a render target cannot be allocated.

**Rationale**: Raycasting is O(n) in the number of mesh faces. At ≥ 500k elements (the IFC target model size), a single click event causes ≥ 500k triangle intersection tests, producing 16 ms+ spikes that violate NFT 16 (frame budget). An ID-buffer read is O(1): one GPU render pass encodes element indices into RGBA8 color, one `readRenderTargetPixels` call reads the clicked pixel — regardless of element count.

**Implementation reference**: `packages/picking/src/gpu-pick.ts` (`GpuPickStrategy`). The `GpuPickRenderer` interface (defined in `packages/picking/src/types.ts`) decouples the strategy from the concrete renderer and is satisfied by `WebGLRendererAdapter.readRenderTargetPixels`.

**Requirement**: `PickStrategyResolver` (in `packages/picking/src/PickStrategyResolver.ts`) MUST prefer `GpuPickStrategy` and fall back to `BvhPickStrategy` only when the GPU renderer probe fails. This resolver is the ONLY place where the strategy is selected at runtime.

---

## §3.5 — LOD System (Distance-Based, Wave A18)

**Amendment**: Wave A18-T16 · 2026-05-03 · Status: CANONICAL

> ## ⛔ SUPERSEDED IN PART — 2026-08-18, by measurement. READ BEFORE §3.5.2.
>
> **THE LOD SYSTEM IS PROVIDED AND NEVER DRIVEN.** §3.5.2 states as fact that
> `CommitterHost.setViewDistance(metres)` is *"called every frame by the render loop"*.
> **It is called by nothing.** Measured repo-wide, `setViewDistance` has exactly **three**
> occurrences and **all three are inside its own declaration file**:
> `packages/scene-committer/src/CommitterHost.ts:43` (a comment), `:54` (a comment), `:60`
> (the declaration). **Zero call sites** in `apps/editor`, `apps/bake-worker`,
> `packages/render-runtime`, `apps/bench`, or any test. `LODManager` likewise has no importer
> outside `packages/scene-committer/` itself.
>
> **Consequence:** `_viewDistance` never changes, so `currentLODTier` (`CommitterHost.ts:65-66`)
> and the `computeLOD` call inside `applyDelta` (`:137`) are **constant for the entire
> session**. Every element is committed at whatever tier the initial value selects. The MUST in
> the paragraph below is unmet, and the 60 FPS budget it exists to protect is unprotected by
> this mechanism.
>
> ⚠ **The contract and the source agree with each other and disagree with the repository** —
> `CommitterHost.ts:54` repeats the same "called every frame" claim in its own docblock. Two
> mutually-confirming statements, both written by the same intent, neither measured. That is
> why reading the declaration is not evidence of the call.
>
> **This is the defect class C04 ITSELF NAMED**, at §SHADOW.2 rule 10: *"Know which flag you are
> writing … Several L-205-era 'fixes' adjusted a switch wired to nothing."* It is also
> [C65](C65-*.md) §3.9's exhibit list with a fifth entry, and
> [C84](C84-ELEMENT-INTEGRITY.md) **EI-12** — *a registered trigger MUST name a production
> dispatcher, proven by a call site* — applied to a per-frame setter rather than a verb table.
>
> ⭐ **Why a one-axis census would have missed it, and why that generalises:** the IMPORT axis
> finds `CommitterHost` alive and constructed in production (`apps/editor/src/bootstrap.ts:106`,
> and that file's own header at `:15` says so). Only the **CALL axis** finds the LOD input dead.
> A census on either axis alone reports the wrong answer with confidence. *(This also corrects
> a coarser reading elsewhere that treated the whole committer stack as dead in the editor: the
> HOST is constructed; it is the LOD DRIVE that is not.)*
>
> **§3.5.1's tier table and §3.5.3's invariants STAND** — they are unimplemented, not wrong.
> **§3.5.2 is a description of intent, not of the code.** Precedent for this repair is already
> in this contract at **§2.2**, which carries a note that it *"previously described an API that
> never shipped; corrected 2026-08-07"*. **This is the second instance of the same defect inside
> C04**, which is itself the finding: one correction did not prompt a sweep of the rest.
>
> *Exit condition:* the render loop calls `setViewDistance` each frame, or §3.5 is restated as
> a declared gap with a gate that fails while it remains one.

The scene-committer MUST provide a 3-tier, distance-based Level-of-Detail (LOD) system for large models (≥ 500 k elements) to maintain the 60 FPS budget (NFT 4).

### §3.5.1 — LOD tiers

| Tier | Distance (camera to element centroid) | Geometry detail |
|---|---|---|
| **0** | < 100 m | Full detail — all geometry submitted to committer |
| **1** | 100 m – 500 m | Simplified — reduced polygon geometry (committer may substitute low-poly proxy) |
| **2** | ≥ 500 m | Bounding box only — committer renders axis-aligned bounding box; full geometry skipped |

Hard-cull threshold: elements whose camera distance exceeds **1 000 m** MAY be omitted from the commit call entirely when the total element count exceeds 500 k.

### §3.5.2 — Implementation

- `packages/scene-committer/src/LODManager.ts` — `LODManager.computeLOD(distance): 0 | 1 | 2`
- `CommitterHost.setViewDistance(metres)` — called every frame by the render loop
- `CommitterHost.currentLODTier` — exposes the active tier for the current frame
- `PrimitiveCommitter` implementations receive the LOD tier via the delta context; they are responsible for geometry selection

### §3.5.3 — Invariants

- `LODManager` imports NOTHING from `three` (P2).
- LOD tier changes MUST NOT cause a frame stutter > 2 ms (the geometry swap must be deferred to the next idle frame if the cost exceeds budget).
- The bounding-box fallback in Tier 2 MUST preserve element selection hit-testing (picking still works on the bounding box).

---

## §4 — Abstract Renderer (L4)

`packages/renderer/` defines the abstract `Renderer` interface that `packages/render-runtime/` orchestrates. It MUST:
- Depend on `packages/frame-scheduler/` and `packages/scene-committer/`.
- NOT import `three` directly (P2).
- Expose only `attach`, `detach`, `resize`, `dispose`, and `onRenderComplete` in its public surface.

`packages/render-runtime/` owns the render loop: it subscribes at **render** priority, calls `scene-committer.commit()`, then calls `renderer-three.render()`.

---

## §5 — Viewport & Camera

The camera is a domain concept, not a Three.js object in the hands of the UI. The `CameraController` slot on `PryzmRuntime` wraps the Three.js camera and controls. See C06 §3 for the UI-facing camera contract.

### §5.1 — NFT targets for rendering

| NFT | Target | Bench |
|---|---|---|
| Frame budget (interactive viewport) | 16.6 ms p95 (60 FPS) | `frame-budget.bench.ts` |
| Cold-boot to first paint | < 2.5 s on M1 / Chrome | `cold-boot.bench.ts` |
| Bundle size (editor app) | < 4 MB gzipped | `bundle-size.bench.ts` |

See C10 for the full NFT table and measurement methodology.

---

## §6 — What is NOT in this contract

- How the camera is exposed to tools and plugins → C06, C07.
- The plan-view 2D rendering pipeline → C06 §4.
- The path-tracer (photorealistic mode) — `three-gpu-pathtracer` is a lazy dynamic import; its contract is in [SPEC-31].
- How renders are saved to the gallery → C05 §5.

---

## §RECOVERY — viewport crash-recovery (SCOPE-CLAIMED 2026-08-01, **NOT YET NORMATIVE**)

> **Status: coverage gap, claimed by C04, rules NOT yet ratified.** Do **not** cite this section as
> authority for an implementation. It exists so the subsystem stops being governed by a document
> that does not exist. See `docs/02-decisions/MISSING-CONTRACTS-AUDIT-2026-06-01.md` `§GAP (L-663)`.

`ViewportCrashGuard` (`apps/editor/src/ui/primitives/ViewportCrashGuard.ts`) and
`SceneCrashFallback` both open with `CONTRACT (08-ERROR-RESILIENCE-CRASH-RECOVERY §Mechanism 1)`.
**No such document exists anywhere in this repository** — not in `contracts/`, not in `adrs/`, not
in `reference/specs/`, not in the archive. The single mechanism that decides whether a render fault
is survivable therefore has **no governing contract at all**. C04 claims the scope here; the rules
below are the *open questions*, and each must be answered by an ADR before this section is promoted.

**Known Violations (open):**

- **L-663 (P1) — the crash-recovery path resets every counter that bounds it, and adds none of its
  own; and it destroys the evidence of its own trigger.** Founder repro 2026-08-01 (prod, WebGPU,
  48 meshes): editing a kitchen furniture element's arm dimensions produced a repeating
  `onProjectSwitch → SHADOW_REBUILD_SCHEDULED → Rebuilding pipeline → SHADOW_REBUILD_COMPLETE`
  cycle **with no project switch in the session**, which presents as a freeze. Three findings, all
  code-confirmed:
  1. `RenderPipelineManager.onProjectSwitch()` sets `_retryCount = 0`
     (`RenderPipelineManager.ts:1851`) — the very counter whose exhaustion (`MAX_RETRIES = 3`)
     promotes the pipeline to `phase='error'` and raises the crash overlay.
     `ViewportCrashGuard.onRetry` also clears `_hasCrashed` and `_consecutiveFailures`
     (`ViewportCrashGuard.ts:236-239`). **No recovery-attempt counter exists**, so the cycle never
     escalates to the hard reload. This contradicts **ADR-0089** §Decision, which already ruled that
     retrying the *same* graph against the *same* fault "cannot help — it only delays the same fatal
     outcome" and mandated a **downgrade** (`_downgradeToLightweightPipeline()`); that ruling was
     implemented for the shader-compile class only, and the recovery button re-opens the unbounded
     same-graph retry for every other class.
  2. `initScene.ts:2756` calls `viewportCrashGuard.handlePipelineError()` **with no argument**, and
     `PipelineStatus` (`RenderPipelineManager.ts:334-343`) carries **no `lastError`** — so the
     overlay and the Sentry capture both receive a synthetic
     `"Render pipeline retries exhausted — phase=error"`. **A guard that hides its trigger makes
     every recurrence undiagnosable.** `§I3-USEDTIMES-SUPPRESS` compounds this by logging
     `message.slice(0, 80)` with no stack (`ViewportCrashGuard.ts:103`).
  3. `onProjectSwitch()` is a **C13** project-lifecycle method (C13 §2 defines a project session as
     the span between `pryzm-project-switch` events). Reusing it as the error-recovery primitive
     couples two unrelated concerns and makes recovery unscoped to the fault it is recovering from.
  Pinned by `packages/renderer-three/__tests__/RenderPipelineManager.recoveryLoopUnbounded.test.ts`
  — a **characterisation** test that asserts today's *defective* shape so the fix must replace it.
  ⚠ The **triggering throw is not established** from the founder's log; instrumentation (finding 2)
  ships first. Full write-up + fix sequence: audit **L-663** and
  `docs/04-reference/V1-LAUNCH-IMPLEMENTATION-PLAN.md` **L-663**.

**Open questions this section must answer before it can be NORMATIVE** (each needs an ADR):
(a) what bounds a recovery attempt, and what is the escalation ladder (rebuild → downgrade →
reload)? (b) is recovery allowed to reuse a lifecycle primitive at all? (c) what is the minimum
diagnostic record a guard must preserve for every trigger it swallows *and* every trigger it
escalates? (d) how does recovery compose with the `§SHADOW` freeze latches and with `P3`
(recovery MUST NOT open a second drive loop — today it is macrotask-`setTimeout`-driven, which is
correct and must be preserved).

---

---

## §SHADOW — the sun / ground-shadow subsystem (NORMATIVE)

Written 2026-07-10 after L-205: a grey rectangle over the ground that survived **ten** root-cause
attempts. Nine were wrong. This section exists so that never happens again. See ADR-0120.

### §SHADOW.0 — The mental model

The L0 ground catcher is a huge `THREE.ShadowMaterial` plane. It paints
`alpha = opacity × (1 − shadowMask)`. Therefore:

- **lit fragment** ⇒ `shadowMask = 1` ⇒ alpha 0 ⇒ **invisible** (the intended resting state).
- **shadowed fragment** ⇒ `shadowMask = 0` ⇒ alpha = `opacity` ⇒ **visible grey**.

A shadow you can see on the ground is the catcher's *shadowed* fragments. A grey rectangle is the
catcher reporting **"everything here is in shadow."** Those are the same mechanism, not two bugs.

### §SHADOW.1 — The actual root cause of L-205

`PascalSceneLighting._enableShadowsOnScene()` set `castShadow = true` on **every mesh in the
scene**, filtered only by whether the mesh's name contained `edge`, `grid`, or `collision`.

The scene contains meshes that are not BIM elements. Among them is a ground-level plane installed
by the OBC `ShadowedScene`. It became a shadow caster. **A ground-level plane that casts a shadow
shadows the entire catcher.** Every catcher fragment inside the shadow camera reads `shadowMask = 0`
and paints `opacity` — a **solid grey rectangle bounded exactly by the shadow camera's footprint**.

The evidence was in every log we ever captured, on an **empty project**, before any wall existed and
before the catcher was even attached:

```
[PBRSceneUpgrader]     Applied — meshes: 2
[PascalSceneLighting]  Shadow flags set on 1 mesh(es).
```

Two meshes, zero BIM elements, and one just became a shadow caster.

**The single most important consequence — and the thing that defeated nine attempts:** *the grey
rectangle is always exactly the size of the shadow camera's ground footprint.* Resizing the shadow
camera therefore changed the grey's **size**, never its existence:

| shadow camera | observed grey |
|---|---|
| `±113,657 m` (the runaway fitted frustum) | grey to the horizon |
| `±50 m` (the fixed camera) | a ~100 m grey diamond |

Nine attempts read the *size* of the symptom as a clue to its *cause*. It never was.

The catcher was kept out of the caster set only by an incidental `transparent && opacity < 0.5`
check — which merely `return`s, so it never **cleared** a `castShadow` an earlier pass had set.

**Fix:** `§FIX-SHADOW-CASTER-DENYLIST` (`92f437a0`). Explicitly **demote** (clear, never merely skip)
any mesh that exists to *receive* a shadow (`role === 'ground-shadow-catcher'`, or a
`ShadowMaterial`), and any mesh whose world bounding radius exceeds `MAX_CASTER_RADIUS_M = 500`
(a 40-storey tower is ~75 m; a scene/ground plane is thousands). Demotions are logged by name, type
and radius, so an offending mesh names itself in production.

### §SHADOW.2 — Rules (normative)

1. **The caster set is an explicit allowlist concept, never "every mesh minus some names."** A mesh
   casts a shadow only if it is BIM geometry. Never derive the caster set from name substrings.
2. **A shadow RECEIVER must never CAST.** Demote by clearing `castShadow`, not by declining to set
   it — another pass may already have set it. Receivers keep `receiveShadow`.
3. **Size is a type signal.** No BIM element exceeds `MAX_CASTER_RADIUS_M`. Anything larger is scene
   infrastructure. Cap it, and log what you capped.
4. **The shadow camera MUST be bounded and finite.** Any code deriving `light.shadow.camera` extents
   from scene geometry MUST clamp the result and MUST `Number.isFinite`-assert every extent. A fit
   that exceeds the clamp is a bug in the AABB sweep: clamp, log the offending object, fall back to
   the fixed frustum. (`f4533641` derived an **84 km** radius from a scene containing one wall.)
5. **Texel density is the sharpness invariant, not the frustum.**
   `metresPerTexel = (right − left) / mapSize.width`. Any change claiming to sharpen the shadow MUST
   state its before/after `metresPerTexel` and pin it with a test. **Sharpen by raising `mapSize` on
   a stable camera — never by shrink-wrapping the camera.** (Shrink-wrapping is what produced the
   84 km runaway; it is a legitimate technique only with rule 4 in force.)
6. **Never resize a live caster's shadow map.** Writing `light.shadow.mapSize` (or disposing
   `light.shadow.map`) while the light casts makes THREE destroy + recreate the `ShadowDepthTexture`
   inside `render()` while the previous frame's command buffer still references it →
   `Destroyed texture [ShadowDepthTexture] used in a submit` → WebGPU device loss. Choose the
   allocation once, at a device-safe size (ADR-0111). Tiers may change `bias`, `normalBias`,
   `radius` — never the allocation.
7. **Never dispose or rebuild the render pipeline off-frame.** `scheduleShadowRebuild()` →
   `_rebuildPipeline()` was fire-and-forget (`SHADOW_REBUILD_COMPLETE elapsed=0.0ms` — it timed a
   promise, not the work), so `createScenePass()` + pipeline dispose landed mid-submit.
8. **A new caster does NOT require a pipeline rebuild.** three's `LightsNode.customCacheKey()`
   hashes `light.castShadow` per-**light**, not per-caster-mesh; `ShadowNode.updateShadow()` redraws
   the depth map every frame with whatever casters exist. Rebuilding on geometry is unnecessary and
   destructive.
9. **Two renderers must not share one light's shadow state.** `world.renderer` (OBC
   `PostproductionRenderer`, a **WebGLRenderer**) and `window.pryzmRenderer` (**WebGPURenderer**)
   draw the same scene and see the same key light, which has exactly one `shadow.map` slot. The OBC
   renderer's `shadowMap.enabled` stays **false** (`BimWorld.ts`); PRYZM's WebGPU pipeline owns the
   shadow pass end-to-end. `ViewController._restore3DRendererPresentation()` enforces the same.
10. **Know which flag you are writing.** On the WebGPU node path, `renderer.shadowMap.autoUpdate` is
    **inert** — `ShadowNode.updateBefore()` gates on the per-**light** `shadow.autoUpdate` /
    `shadow.needsUpdate`. `renderer.shadowMap.enabled` is read once, at **compile** time
    (`ShadowNode.setup`). Several L-205-era "fixes" adjusted a switch wired to nothing.
    > ⚠⚠ **CORRECTED 2026-08-20 (lane WEBGL4, L-1480) — rule 10 was RIGHT about WebGPU and INCOMPLETE about WebGL, and the missing half blanked the founder's whole building.**
    > This rule taught *“the per-light flags are the WebGPU ones”*, and `RenderPipelineManager._applyShadowFreezeState()` implemented exactly that: it wrote `light.shadow.autoUpdate` **inside `if (this._webGpuActive)`**, with the comment *“WebGPU-path only (WebGL2 fallback owns its own shadowMap and honours the renderer-level flag).”*
    > **MEASURED in the installed three r183 source — the classic `WebGLShadowMap` honours BOTH flags:**
    > ```
    > node_modules/.pnpm/three@0.183.2/…/renderers/webgl/WebGLShadowMap.js
    >   :95   if ( scope.autoUpdate === false && scope.needsUpdate === false ) return;      ← renderer-level
    >   :170  if ( shadow.autoUpdate === false && shadow.needsUpdate === false ) continue;  ← PER-LIGHT
    > ```
    > The per-light flags are therefore **not a WebGPU concept**. They are read on every backend. See rule 12.

11. **`ShadowMaterial` differs per backend.** On WebGPU it resolves to `ShadowNodeMaterial` +
    `ShadowMaskModel`, whose `finish()` is `diffuseColor.a.mulAssign(shadowMask.oneMinus())` —
    opacity **is** respected. `ShadowNode`'s `frustumTest` clamps `x,y ∈ [0,1] ∧ z ≤ 1` and returns
    `1` (LIT) outside, so ground **outside** the shadow frustum is invisible, never grey.
    **Corollary: grey outside the frustum is impossible. Grey everywhere means the frustum covers
    everywhere, or everything inside it is genuinely shadowed.**

12. **The per-light shadow flags are SCENE state, not backend state — assert them on EVERY backend (NORMATIVE, L-1480, 2026-08-20).**
    `LightShadow.autoUpdate` / `.needsUpdate` live on the `DirectionalLight`s, which **outlive the renderer**: `§RENDERER-LIVE-SWAP` (ADR-0077) deliberately keeps the same `THREE.Scene`. Any code that writes them MUST also un-write them on every backend it can be bound to, and any teardown that zeroes a freeze COUNTER MUST apply the corresponding thaw to the LIGHTS before dropping its scene reference. ⛔ **Never gate the ASSERT on a backend. Gate the freeze SOURCE instead** (`setShadowPassSuppressed` / `setShadowReallocFrozen` already early-return off the WebGPU path). Gating the assert is what strands a `false`.

    **THE FOUNDER'S DEFECT, END TO END — “I open the project and I see just LINES OF PROFILES of walls / slabs on 3D view”:**
    1. Project OPEN on native WebGPU pushes the whole-load / tier-escalation freeze (`§FIX-SHADOW-LOAD-TIER-DESTROY`, initScene:3442-3459) → `light.shadow.autoUpdate = false`.
    2. The **same** `tier:post-load` pass fires `§AUTO-WEBGL-HEAVY` (§1.4) — so the backend swap is fired **from inside that freeze window**. Structural, not coincidental.
    3. The swap calls `rpm.dispose()` first, which zeroed `_shadowReallocFreezeDepth` / `_shadowPassSuppressed` / `_shadowFrozenState` **without applying the thaw**, then `bind()` re-ran the applier against the new classic `THREE.WebGLRenderer` with `_webGpuActive === false` — skipping the per-light restore. **The counters said “not frozen”; the lights said “frozen”; three believed the lights.**
    4. `WebGLShadowMap.js:170` `continue`s forever → **`light.shadow.map` is never allocated.**
    5. `WebGLLights.js:243-259` / `:459-465` still count the caster (they key on `castShadow`, never on the map) → `numDirLightShadows === 1` → `WebGLPrograms.js:332/344` emits `USE_SHADOWMAP` + `SHADOWMAP_TYPE_PCF` → `shadowmap_pars_fragment.glsl.js:18-20` declares `uniform sampler2DShadow directionalShadowMap[1]`.
    6. `WebGLRenderer.js:2526-2533` uploads that array through `WebGLUniforms.setValueT1Array` (`:825-841`), which substitutes `emptyShadowTexture`. Its `version` is `0` forever, so `WebGLTextures.setTexture2D` (`:518`) never uploads it and `WebGLState.js:951` binds `emptyTextures[TEXTURE_2D]` — a **1×1 RGBA8 with `TEXTURE_COMPARE_MODE = NONE`**. (The SCALAR sibling `setValueT1` at `:571-584` *does* set `compareFunction`; the ARRAY path, which is the one shadows always take, does not.)
    7. A `sampler2DShadow` bound to a non-comparison colour texture is **incomplete for that sampler type** → `INVALID_OPERATION` → **the draw is dropped.** Every lit mesh, every frame.

    ⭐ **THE MESH-vs-LINE SPLIT, WHICH IS THE WHOLE DIAGNOSTIC:** `LineBasicMaterial` compiles `ShaderLib.basic` → `meshbasic.glsl.js`, which includes **no `shadowmap_*` chunk at all** and declares no shadow sampler; and `PascalSceneLighting._enableShadowsOnScene()` explicitly `return`s on `userData.role === 'edges' | 'edge-overlay'`, so edge overlays never receive a shadow flag either. **Lines draw. Solids do not.** The visible result is the wall/slab `LineSegments` overlays (`WallEdgeOverlayBuilder.ts`, `SlabFragmentBuilder.ts`) floating alone — black outline profiles in white space.

    ⭐ **WHY IT VANISHES ON WebGPU:** `WebGLShadowMap` exists ONLY on the classic `THREE.WebGLRenderer`. Native WebGPU *and* the `WebGPURenderer({forceWebGL})` WebGL2 fallback both run three's NODE shadow path (`ShadowNode`), which allocates its own depth texture and never binds an empty RGBA to a comparison sampler. The founder's own one-variable experiment — same project, same scene, minutes apart — was pointing at the shadow path all along.

    **Enforced by** `packages/renderer-three/__tests__/shadowFreezeSurvivesBackendSwap.test.ts` (drives the real `RenderPipelineManager` through bind-WebGPU → freeze → dispose → bind-classic against real `THREE.DirectionalLight` objects, and asserts `WebGLShadowMap.js:170`'s own predicate). **Tripwire:** `RenderPipelineManager.auditShadowCasters()` (`§SHADOW-CASTER-DECLARED-BUT-UNSATISFIABLE`, L-1482) runs once per bind, on the first frame presented, and names any caster whose depth pass can never run.

13. **A freeze means “reuse the map you already have.” A renderer that has never run its depth pass has no map to reuse (NORMATIVE, L-1482).** Asserting `autoUpdate = false` onto such a renderer is not a freeze, it is a permanent suppression — and on the classic WebGL path a permanent suppression is not “no shadows”, it is **no lit geometry at all** (rule 12, steps 5-7). ⭐ Ask *“can this gate ever become true?”* before asking *“why is the viewport empty?”*

### §SHADOW.3 — Debugging protocol (follow in order; do not skip to code)

L-205 cost ten attempts because it was debugged by inference. Every wrong answer was internally
consistent, survived review, and shipped. **Measure first.**

1. **Untick "Ground shadows."** Grey gone ⇒ it is the catcher. Grey stays ⇒ it is a different mesh
   and everything below is irrelevant.
2. **Untick "Cast shadows."** Grey gone ⇒ the catcher and its material are healthy; the fault is in
   what the shadow pass contains.
3. **Enumerate the caster set.** This is the step that would have ended L-205 on day one — paste
   into the browser console with geometry present and the real sun on:

   ```js
   (() => {
     const out = [];
     window.a2.scene.three.traverse((o) => {
       if (!o.isMesh || !o.castShadow) return;
       try { o.geometry.computeBoundingSphere(); } catch { /* degenerate */ }
       const r = (o.geometry?.boundingSphere?.radius ?? 0) *
                 Math.max(o.scale.x, o.scale.y, o.scale.z);
       out.push({
         name: o.name || '(unnamed)',
         material: o.material?.type,
         role: o.userData?.role ?? '',
         radius_m: +r.toFixed(1),
         y: +o.position.y.toFixed(2),
       });
     });
     out.sort((a, b) => b.radius_m - a.radius_m);
     console.table(out.slice(0, 12));
     console.log('total casters:', out.length);
   })()
   ```

   **Any large mesh at `y ≈ 0` is the bug.** A ground-level caster shadows the whole catcher.
4. **Read `§DIAG-GROUND-SHADOW`** (`RenderPipelineManager.logShadowDiagnostics`): shadow camera
   extents, `metresPerTexel`, `shadowMapType` (`RenderTarget` = healthy WebGPU;
   `WebGLRenderTarget` = a WebGL renderer claimed the slot), `lightAutoUpdate`, the freeze latches.
5. Only now form a hypothesis.

**Refuted hypotheses — do not re-attempt.** Each cost a deploy: ScenePass-not-rebuilt-on-first-caster;
catcher-outside-the-frustum; freeze-latch-unbalanced; `ViewController` disabling the live shadow map
(it writes the *silenced OBC* renderer; `BimWorld.ts` assigns `world.renderer` exactly once);
leaked `shadowMap.enabled = false`; transition-only `autoUpdate` writer; the off-frame ScenePass
rebuild (a real defect, fixed in `d9b8f7cf`, **but not the grey**); the exploded frustum (a real
latent bug, **but only the grey's size**); WebGPU reusing a foreign `WebGLRenderTarget` (refuted from
three's source — `ShadowNode.setupShadow()` always creates its own target).

### §SHADOW.4 — Current state and the safe path to sharpness

HEAD runs the **fixed ±50 m** shadow camera with a 512² map ⇒ `metresPerTexel ≈ 0.195 m`. The ground
shadow is therefore **correct but soft**. To sharpen, in this order, each verified on production
against `§DIAG-GROUND-SHADOW` before the next:

1. Raise `mapSize` **once, at allocation time**, on the fixed camera (512 → 2048 ⇒ `0.049 m/texel`,
   a 4× improvement). Device-safe: check `maxTextureSize`; degrade on `performance` and lower tiers
   (a 2048² depth texture is 4× the memory). Never resize a live map (§SHADOW.2.6).
2. Only then consider a **clamped** fit (§SHADOW.2.4), with a finite-check, a fallback to the fixed
   frustum, a log of the offending object, and a regression test that feeds it the 84 km outlier.

**Open latent bug:** the AABB sweep in the (now removed) `refitShadowToScene()` derived an 84 km
radius from a one-wall scene. The offending mesh has never been identified. If the fit is ever
reinstated, identify it first.

---

## §LEVEL-SWITCH — `projectContext.activeLevelId` is a RENDER-PIPELINE TRIGGER, not a field (NORMATIVE, added 2026-08-20, lane FURN1, L-1394..L-1398)

### §LS.1 — RULE: no orchestration may switch the active level to carry data

**An assignment to `projectContext.activeLevelId` is the most expensive statement in the editor.**
Its setter (`packages/core-app-model/src/context/ProjectContext.ts:18`) fires a subscriber list AND
a `window.dispatchEvent`, **synchronously**, and between them one switch drives:

| consequence | site | cost |
|---|---|---|
| plan view re-activation → `PlanViewManager.activate()`, which FIRST calls `deactivate()` (full canvas teardown), rebuilds the DOM, then `_ensureProjection` | `LevelPlanViewBinder.ts:200` → `ViewController.ts:1342` → `PlanViewManager.ts:152,195,821` | **cold cache ⇒ a full `EdgeProjectorService` pass** |
| `view-activated` visibility gates (floor hatch, room overlay, parcel fill) | `initScene.ts:853, 931, 990` | **3 × full `scene.traverse`** |
| wall-edge visibility + render mode | `WallEdgeVisibilityService.ts:153,173` | **2 × full `scene.traverse`** |
| room-tag auto-population | `initScene.ts:774` (and again at `:1210` from `onReprojectionNeeded`) | O(rooms × annotations) + command dispatch |
| animated camera slide | `engineLauncher.ts:1380` | frame-scheduler wake-ups |

⭐ **Therefore: a batch operation that switches the active level N times has multiplied all of the
above by N before doing any work of its own.** `triggerFurnishAllFloors` switched **eight** times
(seven storeys + a restore) on a 7-level model, purely so the HUD would follow along.

**A per-storey orchestration MUST thread its target level onto the event it emits** (the L-101
pattern) **and MUST NOT mutate the global as a side-channel.** Corollary, and the trap that made this
one dangerous: **a "cosmetic" global write with a real reader is not cosmetic.**
`LightingLayoutExecutor` read `resolveActiveLevel()` and nothing else, so the write that was
documented as decorative was the only thing telling lighting which floor to light — while the
driver's `finally` restored the original level underneath lighting's pending `setTimeout(0)`.

### §LS.2 — §VIEW-GATE-NO-OP: a visibility gate MUST NOT re-traverse for an unchanged input

The three `view-activated` gates above compute `visible = !(mode === '3D')`. **Their only input is
the view MODE.** A LEVEL switch re-activates a plan view, so the mode is identical (`'Top'` →
`'Top'`) and each gate re-walked 6113 meshes to write the values already there.

**RULE.** Guard on the **event handler**, never on the helper — the other callers (a floor rebuilt,
a room re-detected, the parcel fill re-authored) legitimately re-apply the **same** mode to **new**
geometry and must still traverse. **The first activation always runs**: `_lastX` is seeded with a
guess, and a gate that skipped because its guess happened to match would be a correctness bug, not a
saving.

### §LS.3 — the graft arm is unreachable for a BATCH, by construction

`PLAN_INCREMENTAL_SAFE_TYPES` (`ViewDependencyTracker.ts:68`) is `wall, slab, beam, ceiling, floor`.
**Furniture is not in it**, and a batch coarse-marks anyway (`markLevelsDirtyImmediate` →
`_viewsNeedingFullInvalidate`, `:620`). So every furniture batch takes the **full O(N)**
re-projection arm and logs `§DIAG-GRAFT-FALLTHROUGH … FULL re-projection because: no-graft-ids`.
That line already said *why*; **nothing counted how often** — see §LS.4.

⛔ **NOT a licence to add `furniture` to the safe set.** The exclusion is documented at
`ViewDependencyTracker.ts:50-66`: furniture injects a store-driven **whole-view symbol pass**, and
grafting it without that pass would drop its plan symbol. Whether that is still true of furniture is
**NOT MEASURED** and is the open question here.

### §LS.4 — §PERF-ZERO-IS-NOT-UNWRITTEN: the instrument was committing the defect it exists to prevent

`PerfCounters.ts`'s own header, rule 1: *"NOT ARMED IS NOT ZERO … printing it as `0` would
manufacture a false exoneration of the prime suspect."* **`pryzmPerfConsole` was doing exactly that
in the ARMED case.** It READS eighteen keys that **nothing in the repo writes** — `REDETECT_ROOMS`
(+`_AFTER_THROW`/`_MS`), every `PHASE_*` except PBR, `TRAVERSE_FIT_BOUNDS`,
`TRAVERSE_BOUNDS_CACHE`, `AUTOSAVE_*`, `CRDT_BLACKOUT_MS`, `SOCKET_*` — and rendered each as
`num(c[KEY] ?? 0)`. Under an `armed` header that printed **"room re-detection passes  0"** for a
named prime suspect nothing had ever counted.

**RULE.** `perfSnapshot().counters` holds a key **only if some call site bumped it**. A row for an
absent key MUST print `—  NO CALL SITE`, never `0`. A measured zero still prints `0`. Same for
timers, which already did this.

**RULE.** A new counter key and its call site land in the SAME change. A key that only the reporter
knows about is a silent zero wearing a measurement's clothes.

### §LS.5 — what IS instrumented now (§FURNISH-PERF)

`level.activeLevelChanged` · `view.activated` · `traverse.viewActivatedVisibilityGates` ·
`view.reprojectFull` / `view.reprojectGraft` / `view.reprojectMs` · `roomTag.populateRuns` /
`roomTag.populateMs` · `furnish.levelRuns` / `furnish.levelMs`, under a **MULTI-LEVEL
ORCHESTRATION** section. Read top-down: **everything below the first row is a multiple of it.**

### §LS.6 — NOT MEASURED

- **Wall-clock.** No browser run was taken for this change. The counts above are derived from code;
  the ratios are exact, the milliseconds are not measured. The founder's first armed
  `pryzmPerf.report()` is the measurement, and it is now possible — which it was not before.
- `EdgeProjectorService.project` cost on a 716-element level.
- Whether `BottomActionMenu`'s `_activeLevelOnly` / solo isolation is on in the founder's session,
  which would add **two more** full traversals per switch (`BottomActionMenu.ts:1193,1285`).
- `PascalSceneLighting._enableShadowsOnScene` runs **once per furniture batch** (~7 for the gesture)
  via the deferred `bim-furniture-added` window event, and `skipPbrUpgrade` does **not** suppress it
  (`initScene.ts:3838` gates on `isBatching`, which is false by the time the deferred event lands).
  **Not changed by this lane.** Same for the unconditional post-batch mesh-count traverse
  (`initScene.ts:2872`), which runs regardless of both skip flags.

---

## §INSTANCING — a fixed-size instance pool with no overflow is a CAP ON THE MODEL (NORMATIVE, added 2026-08-20, lane INST2, L-1400..L-1403)

### §INST.1 — RULE: an instancer MUST spill, and MUST NOT refuse

**A group that runs out of instance slots MUST allocate another group on the same key. It MUST NOT
return the element to the caller unplaced.**

`InstanceGroup` preallocates `INSTANCE_GROUP_MAX` (512) slots per
`(levelId × geometry-hash × material-uuid)` key. Until L-1400 the 513th `addInstance()` on a key
returned `-1` and logged *"Group full … will not be instanced"*, once per element. There was no
overflow path.

⭐ **A fixed-size pool with no overflow is not a performance tuning parameter — it is an undeclared
ceiling on the size of model the product supports**, and nothing told the user they had crossed it.

`InstancedElementRenderer.register()` now maintains a **shard chain** per base key: shard 0 is the
base key itself (so the single-shard case is byte-identical to the old behaviour), and each spill
mints `{baseKey}~s{n}`. N shards of 512 cost **N draw calls**; the behaviour they replace cost the
element.

### §INST.2 — 512 is ARBITRARY, and raising it is NOT the fix

**512 is not a GPU limit, not a driver limit, and not a `THREE.InstancedMesh` limit.** THREE holds
per-instance matrices in an `InstancedBufferAttribute` bounded only by memory; WebGL2 and WebGPU
impose no such number on instance counts. The constant's own doc comment read *"Increase if projects
exceed this per geometry type"* — which is the tell, because a real hardware limit is not something
you raise.

⛔ **A larger literal MUST NOT be offered as the remedy.** It moves the cliff to the next building
and re-arms the same silent failure. The regression test at
`packages/geometry-window/__tests__/WindowInstanceCapSpill.test.ts` includes a 200-window case
(4 shards) for exactly this reason: a constant cannot pass it, shards can.

### §INST.3 — §INSTANCE-REFUSAL-IS-INVISIBLE: a refused instance is not a fallback

⭐ **This is the part that made L-1400 a CORRECTNESS defect and not a performance one, and it is the
rule most likely to be re-broken.**

*"Will not be instanced"* reads as a graceful degradation to an ordinary mesh. It was not one.
`WindowBuilder._convertGroupToInstances` registers each sub-box and then strips the real sub-meshes
from the group **unconditionally** — it never asks whether the registration took. So a refused
instance was drawn by **nobody**.

**MEASURED** (`WindowInstanceCapSpill.test.ts`, real builder, shipped flags):

| reading | value |
|---|---|
| instance slots per single-pane window | **12** = 10 frame members + 1 glazing + 1 sill |
| frame members share one material ⇒ one group | 10 slots per window in that group |
| windows before the frame group is full | **512 / 10 = 51.2** ⇒ first refusal on window **52**, part `#2` |
| refused frame members at 100 windows on a storey | **488 of 1 200 registrations** |
| what those 488 rendered as | **nothing** — windows 52+ showed glazing and a sill with **no frame** |

**RULE.** Any builder that deletes its source meshes after registering them for instancing **MUST
NOT assume the registration succeeded**, and the instancer **MUST** publish the number it failed to
place. `InstancedElementRenderer.droppedInstanceCount` is that number and is required to read **0**;
`pryzmPerf.report()` prints it, and prints it as *unavailable* rather than `0` when the renderer is
not published (§PERF-ZERO-IS-NOT-UNWRITTEN, §LS.4).

### §INST.4 — the log MUST be aggregated on the REASON, and MUST survive

The old code emitted one `console.warn` per refused element — **488 lines, each with a stack frame,
during load, on a single storey.** That volume is what hid the finding: the founder's report of the
symptom quoted the log correctly and still could not see that 40 % of his window geometry was
missing.

**RULE.** A condition that can recur per element is reported **once per reason with a count**, never
once per element. ⭐ **The message must SURVIVE, not be deleted** — *"this key exceeded 512 slots and
spilled to 3 shards, 0 elements dropped"* is a real fact about the model and the user is entitled to
it. `_reportSpill()` emits one line per NEW shard; `spillSummary` exposes one row per real group
identity for the perf report.

⚠ `groupSummary` counts **shards**, so a spilled key appears there as several rows and drags
`collapseRatio` down for a reason that is not a defect. `spillSummary` is the honest denominator.

### §INST.5 — shard ordinals are MONOTONIC

An emptied shard is removed from its chain, but the per-key ordinal counter is **NOT** decremented.
Deriving the next ordinal from chain length would reissue a name that a live mesh already answers to
— and both `userData.id` (the GPU pick registry) and the per-group OBB store are keyed by that name.
The counter resets only in `clear()`, when no shard of any key survives.

Re-registration compares the **base** key, never the effective shard key. An element sitting in
shard 3 whose geometry and material are unchanged has not changed groups; evicting it would
reintroduce the phantom that §WALL-AUDIT-2026-W7's guard exists to prevent.

### §INST.6 — NOT MEASURED / open

- **No browser run was taken for this change.** Every number above is read off the live
  `instancedElementRenderer` in a headless test driving the real `WindowBuilder`. The counts are
  exact; frame times are not measured.
- ⭐ **THE DEEPER LEVER, unspent: why does one window need 10 instance slots at all?** A window's
  frame members are 10 separate unit boxes because each is registered individually against a shared
  `BoxGeometry(1,1,1)`. **Merging is possible WITHIN a material and impossible ACROSS one** — the
  frame/glazing/sill split is a genuine constraint, but the ten frame members are not. Merging them
  into one geometry per window TYPE would take a window from 12 slots to 3 and put ~512 windows in
  a shard instead of ~51. It is **not** done here: it needs a per-window-type merged-geometry cache
  keyed on the authored dimensions and grid, and it interacts with ADR-0297 material ownership. With
  spill in place it is a **pure performance** improvement rather than a correctness fix, which is
  why it is recorded and not rushed.
- Whether any OTHER instanced family (walls, columns, beams, handrails, stair railings, furniture)
  was also silently dropping elements at the cap. The spill fix is in the shared renderer so it
  covers them all, but **only windows were measured**.
- Memory cost of preallocating 512 slots in a shard that ends up holding three instances
  (32 KB of matrix buffer per shard, believed negligible, **not** measured).

---

## §CAM-NEAR — the perspective near plane SCALES WITH STANDOFF (NORMATIVE, added 2026-08-21, lane CAM1, L-2070..L-2072)

### §CAM-NEAR.1 — RULE: `near` is derived from the camera's standoff from the model, never fixed

**FOUNDER EVIDENCE (2026-08-21, production `071a7b2c`, WebGL):** *"Lately when I zoom in —
sometimes too much (not even to a wall) — the window disappears."* Screenshot: the wall
surface is a **flat white/grey field**, two window-shaped rectangles float in it, and the
green ground plane shows through them. The selected-element panel names a real window
(`WN033`, host `WA-01-003`), so the element exists — it is simply not drawn correctly.

**This is the L-747 defect one order of magnitude smaller, and L-747's fix did not reach
it.** L-747 capped `near` at `MAX_BIM_NEAR_M = 0.1` to stop a globe-scale `far` producing a
14 m near plane. **0.1 m is still a clip plane**, and nothing constrained the eye's
distance to geometry:

> **`controls.minDistance` measures the eye to the ORBIT TARGET, not to geometry.**
> `BimWorld` arms `minDistance = 0.2` with `infinityDolly = false`, and BOTH are working as
> designed. Orbiting a target inside a room sweeps the eye around a 0.2 m sphere that
> passes through every wall, floor and ceiling of that room; dollying toward a target 15 m
> away crosses the façade with `distance` still ≈ 15. ⛔ **Do not answer a clipping report
> by raising `minDistance`** — it is not the quantity that governs clipping.

**The rule.** For a PERSPECTIVE camera, `near` is a function of **standoff** — the distance
from the eye to the model's world AABB, which is `0` whenever the eye is inside the
building:

| standoff | `near` |
|---|---|
| 0 (inside / touching) | `NEAR_INSPECT_M` = **0.01 m** |
| ≥ `NEAR_RAMP_STANDOFF_M` = 20 m | `MAX_BIM_NEAR_M` = **0.1 m** — byte-identical to production |
| in between | linear |

Authority: `packages/core-app-model/src/navigation/adaptiveNearPlane.ts`, bound to the
existing camera-controls events in `apps/editor/src/engine/initScene.ts`.

⚠ **STANDOFF, not target distance.** Keying on `controls.distance` looks equivalent and is
not: it leaves `distance ≈ 15` at the exact moment the eye is 5 cm from the façade, so a
target-keyed rule reproduces the defect. This is the one substitution to refuse on sight.

⚠ **ORTHOGRAPHIC CAMERAS ARE OUT OF SCOPE and MUST stay out.** Plan / elevation / section
run `near = -1000, far = 1000` — a signed range meaning "in front of and behind the eye",
not a metric standoff. Applying this policy there moves `near` from -1000 to +0.01 and
clips away the whole drawing.

### §CAM-NEAR.2 — the DoubleSide wall is why it reads as a flat field, not a hole

Worth recording because the screenshot is diagnosable only with this fact.
`WallFragmentBuilder` sets `side = THREE.DoubleSide` on wall band materials (`:3708`, and
`:2373` for curved walls), with its own comment saying why — *"DoubleSide prevents
back-face culling making the wall appear transparent when viewed from inside"*. A wall is
therefore a SOLID with two drawable faces. Eye 5 cm from one face of a 0.3 m wall: the near
face is at view-depth 0.05 and is **clipped**; the far face is at 0.35 and **still draws**,
as a flat evenly-lit field exactly where the wall was; the window OPENING is a hole through
both faces and shows the ground beyond; the glass at mid-thickness (~0.15 m) survives as a
floating rectangle. Every element of the picture, accounted for.

**⛔ Corollary: BACK-FACE CULLING IS NOT AVAILABLE as an explanation for a missing PRYZM
wall.** It was a listed hypothesis for this report and it is excluded by construction.

### §CAM-NEAR.3 — DEPTH PRECISION is not a candidate for close-range dropout

A fixed-point depth buffer is at its **finest** near the near plane. Measured
(`adaptiveNearPlane.test.ts`, 24-bit, `far = 2000`): at a view distance of **0.2 m** the
depth quantum is **24 nanometres** at `near = 0.1`. z-fighting cannot delete a surface
there. ⛔ Do not answer a *"geometry vanishes when I get close"* report with a
logarithmic-depth-buffer proposal until the near plane has been read.

### §CAM-NEAR.4 — the cost, MEASURED, and where it is confined

| view distance | `near = 0.1` (today) | `near = 0.01` (this rule) |
|---|---|---|
| 0.2 m | 24 nm | 240 nm |
| 100 m | **5.96 mm** | **59.6 mm** |

⚠ **~6 cm at 100 m, not "under a centimetre".** The module header first claimed the latter
and the test that pinned it FAILED. Distant coplanar surfaces can z-fight more — **and only
while the eye is within 20 m of the model**; beyond the ramp the near plane is
byte-identical to production and the cost is exactly zero. `MAX_DEPTH_RATIO = 2e5` stops a
widened `far` compounding it, and the classic `webgl-only` backend already builds its
renderer with `logarithmicDepthBuffer: true` (`WebGLRendererAdapter.ts:94`, the repo's only
one), whose distribution is far more uniform than the figures above.

L-747's doctrine decides the trade and is unchanged: *"a precision heuristic may never clip
the model … clipping is a loss of the geometry the user is actually looking at."*

### §CAM-NEAR.5 — §EXPLODE-MOVES-THE-BOUNDS (L-2071)

`LevelExplodeController` writes `root.position.y` for every level group and — measured —
never invalidated `SceneBoundsCache` and fired none of its seven `INVALIDATING_EVENTS`.
Every consumer of those bounds therefore read the **un-exploded** stack while the model was
exploded: default framing, Fit All, and §CAM-NEAR itself. Now invalidated at the animation
**settle** point and on `deactivate()` — not per tick, because `getBounds()` rebuilds by
full scene traversal.

### §CAM-NEAR.6 — NOT MEASURED / open — read before quoting this section

- **No browser run was taken.** Every figure here comes from headless tests driving real
  `three` cameras and real geometry. The founder's screenshot has **not** been reproduced in
  a browser, and the near-plane attribution — though it accounts for every element of the
  picture — rests on that arithmetic, not on an observed repro. The decisive browser check
  is one line in his console at the moment the wall disappears:
  `window.threeCamera.near`, `window.threeCamera.far`, and the eye→target distance from
  `window.world.camera.controls`.
- **This rule does NOT guarantee freedom from clipping.** Nothing constrains the eye's
  distance to geometry; the clip plane is 10× smaller, so the failure window narrows from
  "within 10 cm" to "within 1 cm". A guarantee needs camera–geometry collision (a depth
  probe or swept query per frame). ⛔ Do not describe §CAM-NEAR as *"clipping is fixed"*.
- **The bounds include site/context geometry.** Standing 100 m from a building on a wide
  terrain still reports standoff ≈ 0 and keeps the small `near`. That errs toward NOT
  clipping, which is the direction this contract chose — but it means the depth cost in
  §CAM-NEAR.4 applies more often than *"only when nose-to-wall"* suggests.
- **Frustum culling was reasoned about, not measured.** `THREE.Frustum.intersectsSphere`
  cannot cull a sphere that CONTAINS the eye, so `FrustumCullingService` is not a candidate
  for this symptom unless a bounding sphere is not merely stale but wildly wrong. **No live
  bounding sphere was inspected.**
- **`LevelScoped3DCullingService` massing escalation is not implicated by arithmetic**:
  `isHeavyModel` needs (≥ 15 levels AND ≥ 1000 **elements**) OR ≥ 4000 **elements**, and the
  founder's `sceneMeshes=3898` is a MESH count, not an element count (see §1.4). **His
  element count was not measured.**
- **⭐ SEPARATE, UNEXPLAINED, NOT FIXED — L-2072: the GPU pick reports implausible
  distances.** His log carries `[PickResolver] §97 click hit type=Window … dist=1874.23`
  and `dist=222.34` in a close-up view. Working the perspective depth backwards
  (`near = 0.1`, `far = 2000`), those correspond to packed depths of **0.9999** and
  **0.9996** — both essentially AT the far plane, and separated by ~3e-4, far above the
  32-bit packing quantum, so this is **not** quantisation.
  `GpuPickStrategy.readDepthResult` (`packages/picking/src/gpu-pick.ts:736`) unpacks
  `packDepthToRGBA` output and unprojects it; something in that path resolves near-far for
  geometry that is metres away. §CAM-NEAR neither causes nor fixes it — but a smaller
  `near` makes the perspective depth curve steeper, so this path must be re-read before it
  is trusted.
