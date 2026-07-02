# ADR-0101 — Wall rubber-band preview: request a render per move + defer render-tier escalation during a draw

- **Status:** Accepted
- **Date:** 2026-07-02
- **Tags:** `§FIX-WALLPREVIEW-RENDER-REQUEST`, `§DEFER-TIER-DURING-DRAW`, `§WALLPREVIEW-NO-TRAA`
- **Area:** rendering / wall tool (C04 rendering & scheduling)

## Context

Founder report: drawing the **first** wall on an **empty** project (0 elements) — the
rubber-band preview line stutters / freezes then jumps as the pointer moves back and
forth to place the second point. This is NOT scene density (empty scene) — it is the
wall tool's preview/render path.

Console evidence captured while drawing that first wall:

```
[SceneQualityTier] 72 meshes → tier=cinematic (SSGI=on TRAA=on shadows=high decorativeShadows=on)
[RenderPipelineManager] TRAA enabled (r183 TRAANode colour filter)
§I2 pipeline.usedTimes … patching … _safeDisposeRenderPipeline
Phase: phase4 | WebGPU: true | SSGI: true | TRAA: true
```

### Root causes (confirmed by reading the code)

1. **Tier escalation + pipeline rebuild mid-draw (dominant).**
   `SceneQualityTierManager` starts at cold-start (`_tier === undefined`). The first
   `bim-wall-added` geometry event (a committed wall segment) calls
   `RenderingPipelineCoordinator.applyTierForMeshCount()`. On the empty scene (~72
   meshes ≤ 1500) this evaluates to `cinematic`, and because the held tier was
   undefined the result reports `changed === true` on the **first** evaluation. That
   fires the SSGI/TRAA/shadow hooks → the WebGPU render pipeline is **disposed and
   rebuilt** (`_safeDisposeRenderPipeline`) — a visible multi-hundred-ms stall right in
   the middle of a polyline draw (segment N commits while the user is still placing
   segment N+1).

2. **TRAA ghosting the transient preview.** The same escalation turns **TRAA on**.
   TRAA (`TRAANode`, a temporal reprojection colour filter driven by a per-pixel
   velocity buffer) reprojects/accumulates across frames. A freshly-added, fast-moving
   preview line/wall has no valid velocity history, so TRAA blends it against stale
   frames → the thin line ghosts and appears to "stick" until the scene settles.

3. **Preview mutation did not request a render.** `WallTool.updatePreview()` adds/removes
   the preview `THREE.Line` + preview wall each pointer-move but never flagged the OBC
   renderer's MANUAL-mode `needsUpdate`. On the WebGPU phase-4 pipeline the PASCAL pass
   renders every rAF tick regardless, so this alone was not the empty-project repro —
   but on the OBC-MANUAL / WebGL2-lightweight on-demand paths a move between scheduled
   frames could be dropped (frozen-then-jump). Belt-and-suspenders fix.

## Decision

Three small, reversible changes — **none touch the SceneQualityTierManager /
RenderingPipelineCoordinator / ShadowQualityUpgrader internals** (owned elsewhere):

1. **`§DEFER-TIER-DURING-DRAW` — a tool-interaction latch, guarded at the trigger CALL SITE.**
   New `packages/core-app-model/src/rendering/ToolInteractionRef.ts` — a lightweight
   process-wide latch (analogous to `activePlanDrawingRef`; imports no THREE, no rAF):
   - `beginInteraction()` / `endInteraction()` — ref-counted; `WallTool` holds exactly
     one across a draw (first click → commit/cancel/deactivate), via a private balanced
     `_interactionLatched` boolean.
   - `deferTierApply(apply)` — while an interaction is active, captures the **latest**
     tier-apply and returns `true` (caller skips applying now); when the interaction
     ends at depth 0 the captured apply runs **exactly once**.

   The two `applyTierForMeshCount()` call sites in `apps/editor/src/engine/initScene.ts`
   (per-geometry-event + post-batch) now wrap the apply:
   ```ts
   const applyTier = () => renderingCoordinator.applyTierForMeshCount(n, isWebGPU);
   if (!toolInteractionRef.deferTierApply(applyTier)) applyTier();
   ```
   → the tier escalation (and its pipeline rebuild + TRAA-enable) is deferred out of the
   live draw and settles once, on commit. This fixes causes **1 and 2** for the reported
   repro (TRAA never turns on mid-draw; no mid-draw pipeline rebuild).

2. **`§FIX-WALLPREVIEW-RENDER-REQUEST` — request a repaint per preview move.**
   `WallTool.updatePreview()` calls `requestPreviewRender()`, which sets the OBC
   renderer's MANUAL-mode `needsUpdate` (mirrors `initScene.updateIfManualMode()`).
   P3-safe: **no new `requestAnimationFrame`** — it only sets the dirty flag the existing
   frame scheduler reads; a no-op on the always-on WebGPU pipeline. Fixes cause **3**.

## Consequences

- Empty-project first-wall draw no longer stalls or ghosts: the tier settles to
  `cinematic` **after** the tool commits/deactivates, not mid-rubber-band.
- Normal (non-drawing) scene loads are unchanged — the deferral only engages while a
  tool interaction is latched; the very next apply after the draw is identical to today.
- Balance is guaranteed by the private `_interactionLatched` flag (one begin per end
  across all `deactivate()`/`cancel()`/dispose paths) and by the ref ignoring an
  unbalanced `endInteraction()`.
- Residual: when TRAA is already ON for **later** walls, a moving preview can still
  ghost slightly. Fully suppressing TRAA for preview objects requires editing the
  renderer-three TRAA blend (a sibling-owned lane) and is deferred; the render-request
  keeps the preview at full rate meanwhile.

## Tests

`packages/core-app-model/src/rendering/ToolInteractionRef.test.ts` (10 cases): active
latch, ref-counting, unbalanced-end safety, `deferTierApply` capture/skip, latest-wins
flush, depth-0-only flush, throw-swallowing, reset-clears-pending.
