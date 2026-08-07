# ADR-0302 — Per-edit render cost must be proportional to the edit, not to the scene

| Field | Value |
|---|---|
| **Status** | Accepted — 2026-08-07 |
| **Tag** | `§EDIT-COST-IS-PROPORTIONAL` |
| **Owner** | Rendering / scheduling |
| **Closes** | Founder, 2026-08-07: *"when creating specific elements, like sofas with complex geometries, the performance of the view gets impacted massively — all of a sudden. Anything that downgrades the project performance needs to be caught."* |
| **Constraints** | C04 (rendering/scheduling), P3 (single rAF), P2 (THREE only in `renderer-three`), P8 |
| **Related** | ADR-0297 (recovery levers), ADR-0299 (`§RECOVERY-MUST-REFUSE`), ADR-0292 (honest reporting) |
| **Supersedes in part** | the per-add mitigation documented in `perAddGeometryGate.ts` |

---

## Context

A measured audit of the render layer found that **a single interactive element creation pays at minimum four full `scene.traverse()` passes**, and up to six:

| Consumer | Site | Trigger |
|---|---|---|
| PBR mesh collect | `initScene.ts:2496` | every non-batched `bim-*-added/updated` |
| Tier mesh count | `initScene.ts:2549` | same event, same tick — a **second** walk |
| Transmission neutralise | `RenderPipelineManager.ts:1543` | same event — walks every material |
| Shadow-flag sweep | `PascalSceneLighting.ts:352` | same 20 events, 100 ms debounce |
| Ground catcher | `RealEnvironmentService.ts:213` | 300 ms debounce (early-exits; cheap) |
| Shadow-map realloc | `ShadowQualityUpgrader.ts:160` | on a tier change |

The census found **~120 real `scene.traverse()` call sites**; the list above is the subset that runs *per edit*.

**These are not four defects.** They are four consumers asking the same question — *"what is in the scene now?"* — because none of them is told **what changed**. Each needs only the meshes that just arrived. The existing debounces, gates and `WeakSet`s are mitigations for a missing input, not designs: `perAddGeometryGate.ts` states the consequence outright — *"each add re-walks a growing scene → O(n²)"* — and the 100 ms shadow debounce exists because *"creating 18 walls queues 18 full scene.traverse() calls in the same microtask batch, causing FPS drops to ~9 fps."*

A debounce reduces the **frequency** of an O(scene) answer. It does not make the answer O(Δ).

### The second, independent defect

`RenderPipelineManager.onProjectSwitch()` unconditionally calls `_reconcileRenderSize()` **and** `scheduleShadowRebuild()`. It is subscribed to `window.resize` **and** to a `ResizeObserver` on `#container` (`initScene.ts:1619-1649`). So every viewport-geometry change — inspector open/close, sidebar toggle, panel drag, devtools, browser zoom, a CSS transition on a neighbour, **and the split view mounting during project load** — routes into the full project-switch reconstruction 200 ms later, with WebGPU submits paused for its duration.

Resize needs `_reconcileRenderSize()`. It is being handed the heaviest lever in the renderer.

⚠ **This lever was already known to be wrong.** ADR-0297 forbids routing *recovery* through `onProjectSwitch`, and `ViewportCrashGuardRecoveryLever.test.ts:79` pins *"NEVER via onProjectSwitch()"*. The resize subscription was never audited under that rule — a `§FIX-ONCE-IMPORT-EVERYWHERE` instance.

## Decision

### 1. The scene must publish a change delta; consumers MUST NOT re-derive it

A per-frame **mesh-delta channel** — meshes added and removed since the last drain — is drained once by the frame scheduler and handed to every consumer. Each consumer processes **only the delta**.

- Per-edit traversal count in the steady state MUST be **zero**. It is a first-class, asserted metric, not an aspiration.
- A consumer that believes it needs a global answer MUST justify it in code. The one legitimate case — the tier's **mesh count** — is a **counter maintained by the channel**, not a census. An incrementally maintained count is *exact*; sampling or estimating it is forbidden.
- P3 holds: subscribe to the existing frame bus. No new rAF loop.

### 2. Resize is not a project switch

Resize MUST call only what resize requires. Rebuilding the pipeline, reallocating the shadow map, or resetting outline references from a container resize is forbidden.

> **Implemented 2026-08-07** (`§RESIZE-IS-NOT-A-PROJECT-SWITCH`, L-750): `4f75386a` adds
> `RenderPipelineManager.onViewportResize()` (only `_reconcileRenderSize()`); `7131835c`
> reroutes the `ResizeObserver` subscription to it. Verified: post-FX targets need nothing
> (PassNode re-derives from `renderer.getSize()` every frame) and the shadow map needs
> nothing (its resolution is a function of quality TIER, not viewport size — and
> reallocating it is the very operation that destroys a `ShadowDepthTexture` mid-submit).
> Pinned incl. the founder's 677→678→677 px oscillation: two `setSize` calls, ZERO shadow
> rebuilds.

### 3. One owner per GPU resource

Where two subsystems can independently reallocate one GPU resource — as the quality tier and the resize lever both can for the shadow map — that resource MUST have a single owner that orders the free against in-flight submits. **A destroyed texture reaching a submit is the signature of two owners and no ordering**, and it has produced an unrecoverable `phase=error` crash on a real 167-element project.

> **Implemented 2026-08-07** (free side): `da27ea8d` routes the shadow-target release
> through `scheduleGpuRelease()`, drained by the frame owner at the top of `render()` —
> see ADR-0297 §Amendments (2026-08-07) for the full mechanism and the refusal for
> light-owned shadow maps.

### 4. A behaviour change under load MUST be declared

Any cap, LOD drop, sampling limit or tier de-escalation MUST be logged and visible. Silent degradation reads to the user as "this is how fast it is" and is indistinguishable from a defect (ADR-0299, ADR-0292).

## Consequences

- Edit cost becomes independent of scene size. That is the property the founder asked for and the only one that survives a real project.
- Each consumer's migration is measured, not asserted: the harness reports before/after per-edit traversal counts.
- Cost: a channel is new shared infrastructure and every consumer must migrate. Partial migration leaves the O(n²) term in place — **a half-migrated channel is worse than none**, because the traversals remain while the code implies they do not.

## Two honesty defects found in the same audit — fix with the work

1. **`SHADOW_REBUILD_SCHEDULED meshCount=` is not a mesh count.** It prints `scene.children.length` — top-level children (`RenderPipelineManager.ts:1154`). Every trace carrying that number, including in reports to the founder, has been misleading. *A diagnostic that lies costs more than no diagnostic.*
2. **The quality-tier ladder is not what its constants say.** The nominal ladder is 1,500 / 2,500 / 15,000, but a one-directional cap at **1,200 meshes** bypasses hysteresis, so any real building snaps to `performance` and **cannot return** (re-escalation needs < 1,080). Either that is intended — in which case the nominal ladder is dead code and MUST be deleted — or it is a defect. **One of the two must be recorded; two live theories is not a state this may remain in.**

## The generalisable lesson

**A subsystem that must ask "what is here now?" has not been told "what changed".** Every mitigation built on top of that question — a debounce, a gate, a cache, a `WeakSet` — reduces how often the wrong question is asked without ever answering the right one. When the same expensive question appears in four unrelated subsystems, the defect is the missing channel, not the four call sites.
