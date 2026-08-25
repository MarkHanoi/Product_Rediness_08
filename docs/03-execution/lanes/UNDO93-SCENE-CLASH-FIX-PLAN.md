# UNDO93 — measured fix plan: the 3-D scene "clash" during undo / delete / redo (2026-08-25)

**Founder report (production, today):** *"review undo - delete - redo - also the errors - it clashes
the 3d scene."* Live project: 65 elements, 7 levels, walls + slabs + stairs + curtain walls +
windows. Console family: 42× `THREE.TSL: NodeError: texture( value )`, 2× `NodeMaterial: Material
"ShaderMaterial" is not compatible`, then a WebGPU device loss and a live swap to WebGL2.

**Status of this lane's five items:** **A PLANNED** (this document — no speculative renderer change
shipped) · **B REFUTED** · **C REFUTED, root re-attributed** · **D FIXED** (`c9ecf618`) ·
**E FIXED** (`6ef57ac1`) + one PLANNED remainder (§6).

> ⛔ **Everything in §1–§3 is transcribed from source and from `node_modules/three@0.183.2`, and the
> four load-bearing claims were re-verified by hand after the sweep that produced them.** Nothing
> here was reproduced in a browser. The one thing this plan does NOT establish is which of RC-A1 /
> RC-A2 fired in the founder's session — see §4, "what is still unmeasured", and do not let a fix
> land claiming it does.

---

## 1. ⭐ The causal order is BACKWARDS from how the console reads

The console presents the device loss as the climax. **It is the epilogue, and it was correct
behaviour.** Measured:

| line | what it actually is |
|---|---|
| 42× `TSL NodeError: texture(value)` | **THE DEFECT.** First in time, unprovoked. |
| 2× `ShaderMaterial is not compatible` | **A SECOND, INDEPENDENT DEFECT** (§3). |
| `WebGPU device lost: reason="destroyed"` | **CORRECTLY IGNORED.** `isDeliberateDeviceDestroy()` (`packages/renderer-three/src/rendererRetirement.ts:446-448`) is exactly `info?.reason === 'destroyed'`. This is `retireRenderer()` → `renderer.dispose()` → `backend.destroy()` — the last step of the swap two lines below it. **The device did not fail.** This is L-1001 `§DEVICE-DESTROY-IS-NOT-DEVICE-LOSS` working as fixed. |
| `resolvedPreference=webgl (forceWebGL=true, session-override=webgl)` | **A USER ACTION, not an automatic rescue.** `session-override` is the non-persisting `backendOverride` param of `createRenderer` (`apps/editor/src/rendering/createRenderer.ts:399,432-435`), set by `RendererBackendToggle.ts:145` — the corner toggle. |
| `2998 detached of 7889 minted` | **The HEALTHY branch** of `describeRetirement()` (`rendererRetirement.ts:275`). The other 4891 were WeakRef-collected. L-948's fix is working. Not a leak signal. |

**The auto-swap gate could not have fired.** `autoWebGLHeavyScene.ts:52-63` requires **≥400 BIM
elements OR ≥1000 meshes**. The founder's session was **65 elements** and — from his own
`§LEVEL-COVERAGE` line — **615 drawn objects**. Both arms are far under. So the swap was the user
reacting to an already-broken viewport, and **the TSL errors are upstream of everything else in the
capture.**

⚠ **Do not "fix" the device-loss handler.** Three of the five lines above are already-closed
defects reporting their own success. The only real content in this capture is the 42 + the 2.

## 2. Item A, root #1 — `texture(null)` is minted INSIDE three, from a slot YOUR code nulled

**The repo makes zero direct TSL `texture(...)` calls.** Every TSL entry point goes through
`globalThis.__PRYZM_TSL__` and none destructure `texture` (`ScenePass.ts:65`, `SSGIPass.ts:128`,
`ZonePass.ts:59`, `TRAAPass.ts:76`, `OutlinePass.ts:93`, `BackgroundUniform.ts:112`, and the
`packages/render-pipeline` mirrors). So the failing node is not one we construct.

**The throw:** `node_modules/three/src/nodes/accessors/TextureNode.js:349` —
`if (!texture || texture.isTexture !== true) throw new NodeError(…)`. `Yr` is `TextureNode`.

⭐ **The value is `null`/`undefined`, NOT a disposed texture.** A disposed `THREE.Texture` still has
`isTexture === true` and would fail later and differently (`bindTexture: attempt to use a deleted
object`). **This exonerates the whole dispose-on-delete family for THIS error** — including the two
genuine ADR-0297 violations in §6, which must still be fixed but cannot produce this line.

**The mechanism, in three's own source:**

1. `ReferenceNode.js:266-268` — `else if (uniformType === 'texture') { node = texture(null); }`. The
   `TextureNode` is **born with `value === null`**.
2. `MaterialNode.js:13` — `const _propertyCache = new Map();` — **module-global, shared by every
   material in the process.** `MaterialNode.js:104` returns **one process-wide
   `MaterialReferenceNode` per slot name** (`'map'`, `'envMap'`, `'normalMap'`, …).
3. `MaterialNode.setup()` guards *creation* (`MaterialNode.js:125`: `if (material.map &&
   material.map.isTexture === true)`) by reading `builder.context.material` — but
   `MaterialReferenceNode.updateReference()` (`MaterialReferenceNode.js:62`) resolves from
   `state.material`. **When a live material's texture slot is nulled after its node-builder state
   was cached, the shared node's `.value` is `null` at the next `setup()` → the throw.**

**42× = 42 render objects re-setup in one build.** That is a burst, which points at a single sweep
over the scene rather than a per-element event.

### RC-A1 — `PBRSceneUpgrader.restore()` writes a bare `null` into every live standard material

`packages/core-app-model/src/rendering/PBRSceneUpgrader.ts:204-209` (**verified by hand**):

```ts
mat.envMapIntensity = snap.envMapIntensity;
mat.roughness       = snap.roughness;
mat.metalness       = snap.metalness;
mat.toneMapped      = snap.toneMapped;
mat.envMap          = null;      // :208  UNGUARDED — and NOT a restore
mat.needsUpdate     = true;      // :209  forces the node-graph rebuild
```

⭐ **The snapshot does not record `envMap` at all.** `upgradeNewMeshes` stores exactly four fields
(`:236-242`: `uuid`, `envMapIntensity`, `roughness`, `metalness`, `toneMapped`) while writing
`if (envMap) mat.envMap = envMap;` at `:244`. So `restore()` cannot restore the slot it clears —
the `null` is unconditional, and `needsUpdate = true` on the next line is what forces the rebuild
that re-runs `setup()`. **This is the strongest candidate for a burst of 42**, because it is a
`scene.traverse` writing the same slot on every material at once, and it is driven by
`SceneQualityTierManager` / `RenderingPipelineCoordinator.ts:414-415` — i.e. by exactly the churn a
65-element undo/delete/redo session produces.

### RC-A2 — `detachTextureFromScene()` nulls 24 texture slots on live materials, by design

`packages/renderer-three/src/safeDispose.ts:1069-1098` (**verified by hand**, `:1090-1091`):

```ts
for (const slot of TEXTURE_MATERIAL_SLOTS) {   // :1032-1058 — 24 slots incl. map, envMap, transmissionMap
    if (rec[slot] === texture) { rec[slot] = null; touched = true; }
}
if (touched) (mat as Material).needsUpdate = true;
```

plus `scene.environment = null` / `scene.background = null` at `:1077-1078`. Callers:
`safeDisposeTexture()` (`:1121`) ← `ProceduralSkyService.ts:286` (env-map re-bake) and `:198`
(deactivate), and the boundary release-queue drain at `safeDispose.ts:419`.

⭐ **This function was written for the classic-WebGL failure mode** — its own docblock
(`safeDispose.ts:1005-1029`) cites `bindTexture: attempt to use a deleted object`. **On a
node-compiling backend the remedy for the WebGL fault IS the WebGPU fault.** There is no
`isWebGPU` branch and no re-point-to-a-sentinel. It is the unguarded site in the literal sense.

### Ranked, with the honest confidence

| | site | confidence | why |
|---|---|---|---|
| RC-A1 | `PBRSceneUpgrader.ts:208` | **highest** | unconditional `null` + `needsUpdate`, scene-wide traverse, snapshot provably cannot restore it, tier-driven so it fires during churn |
| RC-A2 | `safeDispose.ts:1090-1091` | **high** | correct-by-design for WebGL, wrong for TSL; 24 slots; fires on every sky re-bake |
| RC-A3 | `ReflectionProbeService.ts:288`/`:307` | medium | `this._cubeTarget!.texture` non-null assertion on a target disposed at `:171`; `:307` restores a possibly-null snapshot |

**Explicitly EXONERATED, so nobody re-searches them:** `MaterialResolver.applyMaterialMaps`
(`:812-825` — every slot truthiness-guarded, and `TextureLoader` returns a real `Texture`
synchronously with pixels arriving later, so `isTexture` holds throughout); `initUI.ts:2404-2416`
(sets `undefined` on a params object for a **fresh** material); and the entire shadow path —
`ShadowNode.js:391-405` allocates a fresh `DepthTexture` per `setup()`, so `texture(depthTexture)`
at `:474/482/537` can never be null, which clears `RenderPipelineManager.ts:4765` and
`safeDispose.ts:732` (`light.shadow.map = null`) of L-981's shape here.

## 3. Item A, root #2 — the `2×` is two raw `ShaderMaterial` grids in the live WebGPU scene

`NodeBuilder.js:2958` throws when `renderer.library.fromMaterial(material)` returns `null`, i.e. for
a **raw** `ShaderMaterial` (a `LineMaterial` would print `"LineMaterial"` — that is the
already-removed prior art at `WallEdgeOverlayBuilder.ts:9-12`). **The count `2` is matched exactly,
and both are verified in the live scene:**

- **A —** `packages/core-app-model/src/InfiniteGrid3D.ts:15,21` (`new THREE.ShaderMaterial({… gl_FragColor …})`), added at `BimWorld.ts:189` (`world.scene.three.add(infiniteGrid.mesh)`); starts hidden at `:188` but `GridToggleService.ts:29,87` turns it on.
- **B —** OBC `SimpleGrid`'s `ShaderMaterial` (`uZoom` uniform; documented at `DiagnosticMaterialManager.ts:67-82`), added at `BimWorld.ts:178` (`world.scene.three.add(grid.three)`), hidden at `:197` with nothing keeping it so.

⭐ **Cross-lane note:** these are the SAME two objects as item D's untagged census rows
(`BimGrid=40/40`, and `InfiniteGrid3D.ts:80` has no `userData` at all). One pair of objects,
failing two unrelated invariants, found by two independent instruments.

Lower-priority ShaderMaterial sites that reach a scene under some configurations:
`UnderlayRenderService.ts:112-125,151`, `VGSceneApplicator.ts:224`, and `gpu-pick.ts:93`
(`DEPTH_PACK_MATERIAL`, applied as `scene.overrideMaterial` at `SelectionManager.ts:661` — that path
uses the silenced OBC WebGL renderer per `initUI.ts:1550`, so probably not TSL, but the assignment
is unconditional and deserves an assert).

## 4. Prior-art verdict: **same family, DIFFERENT leaf — this is a NEW defect**

- **L-420 / L-422 / L-424 are unrelated** — `ISSUE-LOG.md:605-606` are onboarding / site-parcel
  rows (watchdog hijacking parcel select; `createSiteFromRect` not caching the envelope). **Do not
  reopen them.** The memory note that pointed here was pointing at the wrong numbers.
- **The real prior art is L-948 / L-981 / L-1001.** L-948 (`ISSUE-LOG.md:6378`) captured an
  almost line-for-line identical console — **but its TSL throw is `TypeError: … 'usedTimes'` out of
  `NodeManager.delete()` (a stale *renderer* reference), where this one is `NodeError: texture(value)`
  out of `TextureNode.setup()` (a stale *texture-slot* value).** Different node, different failure,
  different fix — and L-948's own fix is visibly working in this capture (the `2998 / 7889` healthy
  branch it added).
- **ADR-0297 `§GPU-RESOURCE-LIFETIME` does not cover this hole.** Its invariants are L1 ownership
  and L2 detach-then-release-at-boundary. **Nothing here was *released*; something was *unbound*.**
  A new invariant is needed: *on a node-compiling backend, a texture slot on a LIVE material may be
  re-pointed but never emptied.*

**What is still unmeasured — a fix must not claim otherwise:**
1. Which of RC-A1 / RC-A2 fired in the founder's session. Both are live; neither is confirmed.
2. Whether the 42 and the 2 share a trigger or merely a frame.
3. Whether undo/delete/redo *caused* the tier churn or merely coincided with it. **Nothing in this
   plan establishes that the undo path is the trigger** — the founder's sequence is circumstantial.

## 5. Fixes (minimal, per root) — ⛔ NOT SHIPPED BY THIS LANE

Per the lane brief: no speculative renderer change. Each needs a probe that reproduces the throw
before it lands.

**F-A1 (RC-A1) — `PBRSceneUpgrader` must restore what it recorded, and record what it overwrites.**
Add `envMap` to the snapshot (`:236-242`), and at `:208` write `mat.envMap = snap.envMap ?? mat.envMap`
— never a bare `null`. This is a strict bug fix independent of the backend: a `restore()` that
cannot restore is wrong on WebGL too. **Test:** upgrade → restore → assert `envMap` identity is the
pre-upgrade value, with a negative control (a material that had none stays without one).

**F-A2 (RC-A2) — a detach must re-point, not empty, on a node-compiling backend.** Introduce ONE
shared 1×1 white `THREE.Texture` sentinel in `renderer-three` and, when the active backend compiles
nodes, assign it instead of `null` at `safeDispose.ts:1090-1091` and `:1077-1078`. This keeps the
WebGL `bindTexture` fix intact (the deleted object is no longer referenced) while satisfying
`TextureNode.setup()`'s `isTexture` predicate. ⚠ The sentinel must be `isSharedGpuResource()`-marked
so nothing disposes it. **Test:** unit — after `detachTextureFromScene`, no slot that referenced the
texture is `null`, and every slot still satisfies `isTexture === true`.

**F-A3 (root #2) — the two grids must not enter the TSL pass.** Either convert
`InfiniteGrid3D.ts:21` to a `NodeMaterial`/TSL graph, or exclude `infiniteGrid.mesh`
(`BimWorld.ts:189`) and `grid.three` (`:178`) from the scene pass while `_webGpuActive`. The
exclusion is the smaller change and is reversible; the conversion is the right end state.
**Test:** a scene census asserting zero raw `ShaderMaterial` reachable from the TSL pass root.

**F-A4 (diagnostic honesty) —** the device-lost line is logged at `WebGPURendererAdapter.ts:223-226`
*before* `isDeliberateDeviceDestroy` bails at `:237`, so a deliberate teardown prints an
indistinguishable `console.error`. It cost this investigation its first hour and it framed the
founder's report. Log deliberate destroys at `info` with the word *deliberate* in the line.

## 6. Carried remainders

**From item D (`c9ecf618` fixed the largest holder, these are the rest of the 166):**
- `WallJunctionInfillManager.ts:91-98` — one prism per wall-junction cluster, `scene.add()`-ed at the
  root with no `elementType`, no `levelId`, no `id`. Real wall-corner solid geometry that stays at
  ground level while the walls it welds lift. Same one-line shape as the fix already landed.
- The 17 plugin scene-committers (`plugins/*/src/committer/*-committer.ts`) stamp only `elementId` +
  `primitiveType`. ⚠ `ISSUE-LOG.md:16873-16880` calls whether this pipeline runs alongside the
  legacy builders *"the single most consequential unmeasured cell"* — **measure that before
  costing the fix.**
- ~71 of the 166 are legitimately excludable chrome (`BimGrid` 40, `LevelLine` 28, `project-origin`
  1, plus `InfiniteGrid3D.ts:80` and `GroundShadowCatcher.ts:117`). They should be **declared**
  — they already are, at `ISSUE-LOG.md:42755` (L-8104), by a *different* instrument that this
  census does not know about — not fixed.
- **Unfixed WJFIX92 siblings, reported not edited (WJFIX92 owns the file):**
  `WallFragmentBuilder.ts:4594-4600` (pipeline-V2 wall body) and `:4734-4740` (legacy MiterPrism
  body) both stamp `role:'geometry'` with **no `elementType`**, so the `§DIAG-OPENING-VOID`
  `bodyParts` scan (`WallRebuildCoordinator.ts:1409`, counts `'WallPart'|'WallLayer'`) is blind to
  the plain-wall arms too — i.e. WJFIX92's F-1 fix at `LayeredWallOpeningBuilder.ts:651` is
  necessary but **not sufficient**. These meshes ARE level-covered (they live under a stamped
  `wallGroup`), so they are not part of the 97.

**From item E:** `projectOrigin` is declared as stranded but the real fix is a patch-producing
handler over a patchable store — the L-11160 `boundaryLine` shape — at
`initBusHandlers.ts:519-536`. Not attempted here; it is a feature, not a gate repair.

## 7. ISSUE-LOG rows to add (⛔ this lane does not edit ISSUE-LOG — three other lanes are writing it)

- **L-11320** — coalesced `InstancedMesh` discarded the `levelId` its own merge key was built from,
  so the VISIBLE half of every coalesced group (sources are hidden) neither lifted on explode nor
  hid on solo; the decoalesce rebuild dropped it a second time. **FIXED `c9ecf618`**, 4 pins.
- **L-11321** — the §EI-7c undo-coverage gate swept by DIRECTORY NAME, so `cube`
  (`toy-cube/src/MoveCubeCommand.ts:48`) and `projectOrigin` (`initBusHandlers.ts:521`) — both real,
  both reachable, both a total Ctrl+Z no-op — were never asked about. **FIXED `6ef57ac1`**; the
  sweep is now structural ∪ directory.
- **L-11322** — ⭐ **`texture(null)` reaches `TextureNode.setup()` because a LIVE material's texture
  slot was emptied while three's module-global `MaterialNode._propertyCache` still held the shared
  `TextureNode` for that slot.** Two live unguarded writers: `PBRSceneUpgrader.ts:208` (a `restore()`
  that never recorded `envMap`) and `safeDispose.ts:1090-1091` (a WebGL-era remedy that is the
  WebGPU fault). ADR-0297 does not cover it — nothing was released, something was unbound. NOT a
  recurrence of L-948/L-981; NOT related to L-420/422/424. **PLANNED, §5 F-A1/F-A2.**
- **L-11323** — two raw `THREE.ShaderMaterial` grids (`InfiniteGrid3D.ts:21`, OBC `SimpleGrid`) sit
  in the live scene and are rejected by `NodeBuilder.fromMaterial` on the WebGPU backend, matching
  the observed `2×` exactly. Same two objects as L-11320's census rows. **PLANNED, §5 F-A3.**
- **L-11324** — a DELIBERATE `device.destroy()` is logged as `console.error` at
  `WebGPURendererAdapter.ts:223-226` before `isDeliberateDeviceDestroy` bails at `:237`, so a normal
  live swap is indistinguishable from a crash in the console. It mis-framed this report. **PLANNED,
  §5 F-A4.**
- **L-11325** — `§WALL30-ADJ-DELTA`'s hint (`TopologyLayer.ts:537-538`) tells the reader to *"check
  §MOVE-REWELD-DISPATCH for these ids"* for pairs the weld engine cannot handle by design.
  WINJOINT91 proved this for `window↔wall`; **this lane extends it to `stair↔wall`,
  `railing↔wall` and `curtainwall↔floor`** — the adjacency is bbox-only and element-type-agnostic
  (`TopologyLayer.ts:470-490`), so the hint misdirects for EVERY non-wall-wall pair. The fix is
  WINJOINT91's F-4; **not edited here to avoid a collision.**
- **L-11326** — two ADR-0297 L2 violations in element families the founder was exercising:
  `FloorPanelBuilder.ts:439-451` disposes geometry+materials in place with no
  `detachAndReleaseChildren`/`scheduleGpuRelease`, and `CurtainWallInstanceManager.ts:274-280` calls
  raw `.dispose()` on SHARED panel geometry/materials (`mat.userData.sharedMaterial = true` at
  `:261`), bypassing `isSharedGpuResource()` (INVARIANT L1). ⚠ **Neither can produce L-11322's
  error** — a disposed texture still has `isTexture === true` — but both are real. **PLANNED.**
