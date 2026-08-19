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

**WebGPU-safety measures on the NON-swapped (light-scene) WebGPU path (L-363/L-364, 2026-07-17)**: Auto-WebGL (above) only diverts HEAVY scenes to WebGL — light scenes still render on real WebGPU, so `RenderPipelineManager` MUST keep two TSL-safety guards on that path. (1) **TSL-init guard** (L-319 §SS-FIX-TSL-NOT-LOADED-BEFORE-SCENEPASS): every `createScenePass()` caller (`_buildPipeline` / `_buildPhase3Pipeline` / `_fullRebuild`) short-circuits when `globalThis.__PRYZM_TSL__` is not yet loaded — `bind()` sets `_webGpuActive = true` before awaiting `_loadTSL()`, so a batch's `autoEnablePerf → _fullRebuild` in that window would otherwise call `createScenePass()` pre-`initTSL()` and throw. (2) **Transmission guard** (L-361 §L-361-WEBGPU-TRANSMISSION-GUARD): at each batch boundary, on real WebGPU only, `_neutralizeTransmissionForWebGPU()` falls transmission glass back to opacity glass (`transmission = 0` + `needsUpdate`) so the `MeshPhysicalNodeMaterial` transmission/refraction node graph — which emits invalid WGSL ("expected a float") on three r183's WebGPU backend — is never generated. WebGL is untouched by both (keeps the full TSL/refractive-glass path). See L-363 + L-364.

### §1.5 — Viewport background: ONE authority, READ not PUSHED (NORMATIVE, L-1191)

> The viewport background has been reported wrong FOUR times — L-326, L-326 reopened,
> L-1148 (`cd11d547`), L-1191 — always as *"the WebGL background should always be white,
> it still sometimes comes grey"*. Each of the first three fixes armed **one more code
> path**. **The enumeration WAS the defect**; this section exists so the fifth report
> cannot be fixed the same way.

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
11. **`ShadowMaterial` differs per backend.** On WebGPU it resolves to `ShadowNodeMaterial` +
    `ShadowMaskModel`, whose `finish()` is `diffuseColor.a.mulAssign(shadowMask.oneMinus())` —
    opacity **is** respected. `ShadowNode`'s `frustumTest` clamps `x,y ∈ [0,1] ∧ z ≤ 1` and returns
    `1` (LIT) outside, so ground **outside** the shadow frustum is invisible, never grey.
    **Corollary: grey outside the frustum is impossible. Grey everywhere means the frustum covers
    everywhere, or everything inside it is genuinely shadowed.**

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
