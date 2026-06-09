# ANALYSIS — Cesium 3D globe getting stuck (read-only spike)

**Status:** ANALYSED, QUEUED (no code change in this pass), 2026-06-09
**Trigger:** founder report (Cesium 3D globe is getting stuck) plus prod console log on /#/start.
**Scope:** read-only investigation. Names the two distinct failures, the suspected root of each (with file:line), and a proposed fix direction for each. No runtime code edited.

## 0. The two problems are independent

The prod log interleaves two unrelated failure families that co-occur on the /#/start route (which mounts both the GIS/Cesium surface and the collaboration replay):

1. Problem A, zero-size framebuffer freeze. Repeated WebGL error `GL_INVALID_FRAMEBUFFER_OPERATION: glClear / glDrawElements / glDrawArrays: Framebuffer is incomplete: Attachment has zero size`. Cesium is asked to render into a canvas / render target whose backing drawing-buffer is 0x0. The GL context refuses every draw call; the globe never paints and the view appears stuck.

2. Problem B, collaboration catch-up replay factory gaps. During CRDT catch-up replay:
   - `Factory failed for type: ADD_OPENING TypeError: Cannot read properties of undefined (reading 'id') at ... roofId` — an ADD_OPENING remote command whose host element is undefined.
   - `No factory for type: CREATE_STAIR_RAILING / CREATE_FLOORS_BY_ROOM_TYPE / CREATE_VIEW_DEFINITION / CREATE_ANNOTATION` — 25 commands skipped (no factory for these types).

They are filed together because the founder saw them in the same session, but they have separate roots and separate fixes.

## 1. Problem A, zero-size framebuffer (the actual stuck globe)

### 1.1 Symptom

`Framebuffer is incomplete: Attachment has zero size`, repeated on glClear / glDrawElements / glDrawArrays. This is the canonical WebGL signature of a render pass against a drawing buffer sized 0x0: at least one colour/depth attachment has width or height 0, so the framebuffer is not complete and the driver rejects every draw call. Result: a black / never-updating globe (stuck).

### 1.2 Why it happens here, the construction + visibility design

CesiumViewport is constructed hidden and only revealed by setVisible(true):

- The outer container is created with display:none at construction, `apps/editor/src/ui/geospatial/CesiumViewport.ts:402` (this.container.style.display = "none").
- The viewer is constructed into that hidden container during mount() (`CesiumViewport.ts:466`, new Cesium.Viewer(cesiumInternalContainer, ...)).
- A display:none element has clientWidth/clientHeight === 0, so the Cesium canvas drawing buffer is created 0x0.

The problem is the set of paths that call scene.requestRender() (or rely on Cesium own render loop) while the container is still display:none / 0-size:

- The mount-time forced resize fires on a fixed setTimeout(..., 100) regardless of visibility, `CesiumViewport.ts:794-804` (this.viewer.resize(); this.viewer.scene.requestRender();). If the GIS surface has not been shown, the container is still 0x0 at +100 ms, so this renders into a zero-size buffer.
- camera.moveEnd is wired at `CesiumViewport.ts:807` and renders via camera changes; frameSiteLocation() calls requestRender() directly (`CesiumViewport.ts:932`), and so does setFormaMode() (`:995`). The mount-time frameSiteLocation(initialLoc..., { instant: true }) at `:770` runs inside mount(), i.e. before any setVisible(true), so it requests a render into the 0x0 buffer.
- subscribeToSiteLocation() (`CesiumViewport.ts:941`) flies the camera on every site.location-changed (`:958` flyTo). If a geocode / onboarding location event arrives while the globe is hidden, it triggers a render at 0x0.

### 1.3 The mitigation that exists, and the gap

forceResizeAndRender() (`CesiumViewport.ts:4032`) is the intended cure: setVisible(true) (`:4055`) flips display:block, raises the z-index, then calls forceResizeAndRender('setVisible(true)') (`:4063`) and re-runs it on the next requestAnimationFrame (`:4046`). The comment at `:4029-4031` explicitly acknowledges the failure: a viewer mounted into a 0-size / freshly-shown container otherwise renders nothing until the next user-driven resize.

The gap: the guard only covers the setVisible(true) transition. It does NOT stop the other render-triggering paths (mount setTimeout, moveEnd, frameSiteLocation, setFormaMode, site.location-changed) from firing requestRender() while the container is still 0x0. Whenever one of those races ahead of (or arrives independently of) setVisible(true), Cesium issues a draw against the incomplete framebuffer, hence the repeated zero size errors. On /#/start the onboarding location handoff plus the construction-time framing are exactly such early, possibly-hidden renders.

There is no single width>0 and height>0 precondition gating render in this file. setVisible checks display !== 'none' (`:4067`) but never the actual clientWidth/clientHeight, and a container can be display:block yet still laid out at 0 height for a frame (the `:4044` comment notes the container often gets its real size a frame after display flips).

### 1.4 Proposed fix direction (Problem A)

Add a nonzero-size precondition and defer rendering until the canvas has real dimensions:

1. Central render guard. Add private canRender(): boolean returning !!this.viewer && this.container.style.display !== 'none' && this.viewer.canvas.clientWidth > 0 && this.viewer.canvas.clientHeight > 0, and route the in-file requestRender() calls through a requestRenderIfSized() wrapper. This stops every early/hidden path (mount setTimeout `:797`, frameSiteLocation `:932`, setFormaMode `:995`, the moveEnd listener `:807`, the site.location-changed flyTo `:958`) from drawing at 0x0.
2. Defer the mount-time forced resize at `:794-804` behind the same size check (or behind whenReady() plus a ResizeObserver, see below) instead of an unconditional setTimeout(100).
3. ResizeObserver on the container rather than the fixed requestAnimationFrame retry at `:4046`: observe this.container; the first observation with contentRect.width>0 and height>0 calls viewer.resize(); requestRender() exactly once. Removes the real size one frame later race the `:4044` comment describes, the resize fires precisely when layout settles, never 0x0.
4. Optionally pause Cesium own render loop while hidden, set viewer.useDefaultRenderLoop = false at construction and re-enable it in setVisible(true) once sized, so Cesium internal loop also never clears a 0x0 buffer.

Net effect: Cesium only ever clears/draws when its drawing buffer is genuinely sized, so the Framebuffer ... zero size error class disappears and the globe paints as soon as GIS is shown.

## 2. Problem B, collaboration catch-up replay factory gaps

### 2.1 Symptom B-1, No factory for type (25 skipped)

RemoteCommandDispatcher.dispatch() resolves each serialized command through CommandRegistry.create():

- CommandRegistry.create() returns null when the type is not in the REGISTRY map, `apps/editor/src/engine/CommandRegistry.ts:307-309`.
- The dispatcher logs No factory for type: <type>, toast-only and returns 'unknown-type', `apps/editor/src/engine/RemoteCommandDispatcher.ts:68-74`.
- replayCatchUp() counts that as skipped (Invariant E-3, resilient skip), `RemoteCommandDispatcher.ts:169-172`.

The four named missing types are declared command verbs with no REGISTRY entry:

| Type | Command class (exists) | Source (file) |
|---|---|---|
| CREATE_STAIR_RAILING | CreateStairRailingCommand | packages/command-registry/src/stair/CreateStairRailingCommand.ts |
| CREATE_FLOORS_BY_ROOM_TYPE | CreateFloorsByRoomTypeCommand | packages/command-registry/src/floors/CreateFloorsByRoomTypeCommand.ts |
| CREATE_VIEW_DEFINITION | CreateViewDefinitionCommand | packages/command-registry/src/views/CreateViewDefinitionCommand.ts |
| CREATE_ANNOTATION | CreateAnnotationCommand | plugins/annotations/src/commands/CreateAnnotationCommand.ts |

The REGISTRY map (`CommandRegistry.ts:151-298`) covers ~95 wall/door/window/slab/room/column/level/floor/roof/stair/beam/handrail/furniture types but omits these four. So a peer who authored a stair railing, a per-room-type floor batch, a view definition, or an annotation broadcasts a wire frame that every other client silently drops on catch-up, the elements never appear for collaborators (the same class of bug the ASSIGN_BEAM_SUPPORTS comment at `CommandRegistry.ts:275-279` already documents and fixed for beams).

This alone is a correctness gap (lost remote elements), not the globe freeze, replayCatchUp keeps going (E-3). But combined with B-2 it contributes to the stuck perception.

### 2.2 Symptom B-2, Factory failed for type: ADD_OPENING ... reading 'id' at ... roofId

ADD_OPENING IS registered, `CommandRegistry.ts:177-180` maps it to new CreateWallOpeningCommand({ wallId, openingData }). So the factory constructs; the TypeError: Cannot read properties of undefined (reading 'id') with a roofId frame means the crash happens when the constructed command is executed (or in a downstream host/roof reconcile) where the host element resolved to undefined during replay.

Two reinforcing observations:

1. The execute path is bus.dispatch(...), which is async. dispatch() calls window.runtime.bus.dispatch(type, payload, { source: 'REMOTE' }), `RemoteCommandDispatcher.ts:96-105`, and only attaches .catch(() => {}) to the returned promise. A synchronous throw inside a handler (dereferencing host.id where host is undefined because the opening host wall/roof has not been replayed yet) that escapes before the promise is returned is NOT caught by that .catch. The Factory failed for type text is the console.warn at `CommandRegistry.ts:313`, which fires when the FACTORY throws, so on this line the failure is during factory construction reacting to a missing host, with roofId in the captured stack.
2. Replay ordering does not guarantee the host exists. replayCatchUp sorts by seqNo (`RemoteCommandDispatcher.ts:157-159`) but a missing/legacy seqNo sorts to 0 (Invariant E-1 note). An ADD_OPENING (or a roof-linked reaction) can be applied before the wall/roof it hosts on exists in the local store, so the host lookup returns undefined, hence reading 'id'.

So B-2 is: a remote opening whose host element is undefined at replay time throws, and because the throw is on the async bus path it is noisier than the E-3 resilient skip intends.

### 2.3 Why B can make the globe feel stuck

/#/start runs catch-up replay as part of session bootstrap. If a replay throw escapes the intended skip (B-2, the async-bus gap) it can reject/abort the bootstrap sequence that ALSO arms the GIS/Cesium surface, so Problem A render never gets its setVisible(true)/resize and the globe stays black. Even when it does not abort, the console flood (25 skips plus the ADD_OPENING throw) masks the real A errors and matches the founder stuck report. The two should be fixed together but for distinct reasons.

### 2.4 Proposed fix direction (Problem B)

1. Register the four missing factories in CommandRegistry.ts (mirror the ASSIGN_BEAM_SUPPORTS precedent at `:275-279`):
   - CREATE_STAIR_RAILING to new CreateStairRailingCommand(s.payload ...)
   - CREATE_FLOORS_BY_ROOM_TYPE to new CreateFloorsByRoomTypeCommand(s.payload ...)
   - CREATE_VIEW_DEFINITION to new CreateViewDefinitionCommand(s.payload ...)
   - CREATE_ANNOTATION to new CreateAnnotationCommand(s.payload ...) (the annotations plugin command, verify the registry L-tier import is allowed, or route via the bus as the dispatcher already prefers).
   Match each constructor real signature (several existing entries already special-case the serialize shape, e.g. CREATE_ROOF `:261-264`, CREATE_BEAM `:273`).
2. Make replay skip-safe against undefined hosts so a single bad ADD_OPENING can never wedge bootstrap (B-2):
   - Catch synchronous throws from the async bus path: wrap bus.dispatch(...) so a synchronous throw becomes the 'error'/'unknown-type' skip outcome rather than escaping (`RemoteCommandDispatcher.ts:96-105`). Today only the rejected promise is caught.
   - Guard ADD_OPENING (and any host-linked command): if the host wall (or roof) id does not resolve in the local store, skip with a logged reason (count it in skipped) instead of dereferencing host.id. This honours Invariant E-3 for the host-missing case the roofId stack exposes.
   - Optionally defer/retry host-linked commands whose host is not present yet to a second pass after all CREATE_* host commands replay (2-pass / topological replay), so a correct ordering does not lose the opening, stronger than skip, but skip-safe is the minimum.
3. Add a CI guard mirroring check:commandmanager: assert every broadcastable CommandType declared in packages/command-registry/src/types.ts has a REGISTRY entry (or an explicit allow-list of non-replayable verbs), so a future verb cannot silently fall into the No factory for type bucket again.

## 3. Summary table

| # | Problem | Root (file:line) | Proposed fix |
|---|---|---|---|
| A | Zero-size framebuffer freeze | Viewer constructed into display:none/0x0 container (CesiumViewport.ts:402, :466); render fired while hidden/0-size from mount setTimeout (:794-804), frameSiteLocation (:932), setFormaMode (:995), moveEnd (:807), site.location-changed (:958); the only size-guard covers setVisible(true) (:4032, :4055, :4063), not these paths | Central canRender() size guard plus requestRenderIfSized(); ResizeObserver first-nonzero resize; optionally pause useDefaultRenderLoop while hidden |
| B-1 | 25 remote commands skipped | REGISTRY missing CREATE_STAIR_RAILING / CREATE_FLOORS_BY_ROOM_TYPE / CREATE_VIEW_DEFINITION / CREATE_ANNOTATION (CommandRegistry.ts:151-298); skip path RemoteCommandDispatcher.ts:68-74, :169-172 | Register the four factories; add a CI declared-vs-registered guard |
| B-2 | ADD_OPENING throw (reading 'id' at roofId) | ADD_OPENING registered (CommandRegistry.ts:177-180) but host element undefined at replay; async-bus throw not caught by .catch (RemoteCommandDispatcher.ts:96-105); replay order does not guarantee host exists (:157-159) | Catch sync throws on the bus path; guard/skip host-missing commands; optional 2-pass topological replay |

**Governing contracts:** the real-time-collaboration contract (registry is the only wire-to-Command path; all remote commands replay through the bus) for Problem B; SPEC-FORMA-SITE-VIEW / C19 (site) for the GIS surface that hosts Problem A. No new contract needed, both are bug-class fixes against existing contracts.
