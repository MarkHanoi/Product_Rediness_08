# Phase 2B — Plan View (The Highest-Risk Sub-Project)
## Q2 of Phase 2 · Months 16–18 · Sprints S31–S36

> **Strategic anchor**: subordinate to `08-VISION.md` → `10-MASTER-IMPLEMENTATION-PLAN-36M.md` → this file.
> Conflict order: `06-PRYZM-IDENTITY-AND-RECOUNT.md` → `08-VISION.md` → `10-MASTER…` → this doc.

> **Authority note (added 2026-04-27).** This document is *implementation guidance* and is subordinate to:
>
> 1. The 12 specs in `docs/03-execution/specs/` (SPEC-01..SPEC-12).
> 2. The 22 strategic ADRs in `docs/02-decisions/adrs/` (the `[strategic ADR-001]`..`[strategic ADR-024]` collective range — individual files live as `adrs/ADR-NNN-<slug>.md`).
> 3. `docs/archive/pryzm3-internal/superseded-2026-04-30/03_STATUS/CRITICAL-REVIEW-2026-04-27.md`.
> 4. `docs/03-execution/plans/legacy/plan-detail/01-MASTER-36M.md`.
>
> Where this phase document conflicts with any of the above, the higher-precedence document wins. **ADR citations**: bare `ADR-NNN` is forbidden. Use `[strategic ADR-NNN]` for entries in `02-decisions/adrs/`, or fully-qualified `code-level ADR docs/02-decisions/adrs/NNNN-<slug>.md` for sprint-scoped decisions.
>
> **Sprint-scoped ADRs introduced in this document** (slug map):
>
> | §3 heading | Code-level slug | Sprint | Subordinate to |
> |---|---|---|---|
> | ADR-023 — Plan view renderer architecture (Canvas2D, dirty flags, no THREE) | `docs/02-decisions/adrs/0023-plan-view-canvas2d-renderer.md` | S31 | `[strategic ADR-016]` (drawing engine) |
> | ADR-024 — Section view cut algorithm | `docs/02-decisions/adrs/0024-section-cut-algorithm.md` | S35 | SPEC-04 §section-cut |
> | ADR-025 — Multi-view sync strategy | `docs/02-decisions/adrs/0025-multi-view-sync.md` | S36 | SPEC-04 §1 |
>
> **Numbering collision notes.** The strategic series has `[strategic ADR-024]` (constraint solver). Phase 2B's sprint-scoped `0024-section-cut-algorithm.md` lives in the `docs/02-decisions/adrs/` namespace and does not collide with the strategic numbering — they collide only when text refers to "ADR-024" without qualification, which is exactly why the `[strategic …]` vs `code-level …` convention exists. The strategic ADR-024's "Naming note" already documents this historical collision.

**SPECs binding Phase 2B**

| SPEC | Section | Sprints |
|---|---|---|
| SPEC-01 (Robustness) | §3, §6 | All |
| SPEC-04 (Drawing primitives) | All | S31–S36 |
| SPEC-10 (Plugin manifest + capability surface) | All | All |

**Capacity envelope**

> **Capacity envelope (`[strategic ADR-018]`).** Phase 2B accepts the 6-sprint scope. If sprint capacity is exhausted, the cut-list defined in `02-decisions/adrs/ADR-018-capacity-cut-list.md` is the ratified order; in 2B the most likely cuts are the multi-view sync polish (S36) and section-view far-projection depth complexity (S35). Defer items per the `[strategic ADR-018]` ranking — never improvise scope reductions.

---

## Executive Summary

**Sub-phase goal**: By end of M18, the PRYZM 2 plan view is a full replacement for the PRYZM 1 plan view, passing all 10 Contract 44 gaps (plan-vs-SVP parity matrix), rendering annotations, section view, and multi-view sync. The per-project fallback flag `featureFlags.plan_view_v2` is retained through the M24 beta in case any regression surfaces — enabling any project to fall back to the PRYZM 1 plan view without data loss.

**Why 2B is the highest-risk sub-project of the entire 36-month plan**: PRYZM 1's plan view is 54 files, including `PlanViewCanvas.ts` (2,150 LOC), `PlanViewAnnotationRenderer.ts` (2,589 LOC), `PlanViewService.ts` (~620 LOC), `PlanViewManager.ts` (~580 LOC), `EdgeProjectorService.ts` (1,867 LOC). The visual quality bar is extremely high — the < 2 px visual diff tolerance on a 30-case parity fixture is tight. The Visibility-Intent 11-wave system permeates plan view rendering. And plan view must sync with 3D and section view within a single frame.

**The compound risk in 2B**: the rendering complexity (plan view) is compounded by the interaction complexity (Contract 44 gaps in selection, drag, and per-view style), which is compounded by the infrastructure complexity (multi-view sync through view-state). Any single sprint overrun cascades into the M24 beta gate. The primary mitigation is the **D5 mandatory visual diff measurement** — every sprint's D5 must show the current visual diff score. A > 5 px score at D5 is a sprint-level halt trigger.

**Built-in safety**: `featureFlags.plan_view_v2` is a per-project boolean in the project manifest. Toggling it to `false` switches the editor to PRYZM 1's plan view for that project. This flag is active from S31 D1. It means 2B can be iterated aggressively — any regression causes a flag toggle, not a production incident.

---

## §0 Reading Conventions

**Visual diff as a first-class metric**: unlike previous sub-phases where the primary metric was performance (ms, fps), 2B's primary metric is **visual correctness**. The visual-diff harness (`apps/bench/visual-diff-plan.ts`) runs every sprint and is added to the CI pipeline at S31. Any PR that increases the visual diff score above the sprint's tolerance threshold is blocked.

**The `CanvasHost` contract**: plan view does NOT use THREE.js. It owns a 2D HTML Canvas. The `packages/renderer/` package is irrelevant to plan view. The `FrameScheduler` directs plan view render calls. The `SceneCommitter` is irrelevant. This is an important boundary — any import of THREE in `plugins/plan-view/` will fail the `pryzm-no-three-in-kernel` lint gate (which extends to the plan view committer boundary as well — plan view IS its own committer via the Canvas2D context).

**Sprint tolerance track**: visual diff tolerance tightens sprint by sprint:
- S31: < 10 px (foundation — only walls/slabs/doors; annotation not yet rendered).
- S32: < 5 px (annotations added but text layout may have minor differences).
- S33: < 2 px (Contract 44 fully closed; this is the final tolerance held through M24).
- S34: < 2 px (maintained through annotations migration).
- S35: < 5 px (new — section view, loose tolerance on first delivery).
- S36: section view < 2 px (tightened at end of 2B).

---

## §1 Track Allocation for 2B

Track A and Track B must coordinate tightly in 2B — plan view does not cleanly separate into "logic" and "visual". The split is instead **geometry math** (A) vs **rendering + interaction** (B), with a mandatory paired session at D5 every sprint.

### Track A — Pure Math, Stores, Handlers, Edge Cases (Agent A)

| Item | Sprint |
|---|---|
| `plugins/plan-view/style-resolver.ts` — per-view style (G4) | S33 |
| `plugins/plan-view/level-scoped-renderers.ts` (G1–G3) | S33 |
| `packages/stores/AnnotationStore.ts` | S34 |
| `plugins/annotations/handlers/` — 8 handlers | S34 |
| `packages/stores/SectionStore.ts` | S35 |
| `plugins/section-view/handlers/` — 6 handlers | S35 |
| `packages/geometry-kernel/producers/section-cut.ts` | S35 |
| `packages/view-state/view-sync.ts` — cross-view propagation | S36 |
| Contract 44 gap tests (G1–G10) | S33 |

### Track B — Rendering, Interaction, Visual Diff (Agent B)

| Item | Sprint |
|---|---|
| `plugins/plan-view/canvas-host.ts` — full impl | S31 |
| `plugins/plan-view/renderer.ts` — edge + poche rendering | S31 |
| `plugins/plan-view/camera.ts` — pan/zoom + dirty | S31 |
| `plugins/plan-view/annotation-renderer.ts` — pure layout | S32 |
| `plugins/plan-view/annotation-committer.ts` — Canvas2D draw | S32 |
| Visual-diff CI harness setup | S31 |
| `plugins/plan-view/selection.ts` — selection in plan drives 3D | S33 |
| `plugins/plan-view/drag.ts` — drag-in-pane via commands | S33 |
| `plugins/annotations/tool.ts` — annotation tools | S34 |
| `plugins/section-view/canvas-host.ts` | S35 |
| `plugins/section-view/renderer.ts` | S35 |
| `packages/view-state/multi-view-layout.ts` | S36 |
| `apps/bench/multi-view-sync.ts` | S36 |

### Joint Deliverables

| Item | Sprint |
|---|---|
| Code-level `0023-plan-view-canvas2d-renderer.md` — Plan view renderer architecture (Canvas2D, dirty flags, no THREE); **subordinate to `[strategic ADR-016]`** | S31 D1 |
| Code-level `0024-section-cut-algorithm.md` — Section view cut algorithm. **Note**: `[strategic ADR-024]` is the *constraint solver*; the section-cut decision is the sprint-scoped 0024 file in `docs/02-decisions/adrs/`. | S35 D1 |
| Code-level `0025-multi-view-sync.md` — Multi-view sync strategy | S36 D1 |
| `featureFlags.plan_view_v2` flag — operational from D1 S31 | S31 D1 |
| 2B demo recording (10-min screencast) | S36 D9 |
| `apps/bench/reports/M18-2B.md` | S36 D9 |

---

## §2 Sprint-by-Sprint Detail

---

### S31 — Plan-View Canvas Host + Dirty-Flag Rendering
**Weeks 61–62 (Month 16)**

---

#### Context and Why This Matters

S31 is the first full-sprint implementation sprint for plan view — S29 delivered only a skeleton. S31 must deliver a plan view that renders walls, slabs, and doors with:
- Correct **poche fills** (using `packages/geometry-kernel/poche.ts` from S30).
- Correct **edge projection** (using `packages/geometry-kernel/edge-projection.ts` from S30).
- **Dirty-flag driven** via `FrameScheduler` — 0 fps idle, 60 fps interactive (pan/zoom).
- The `featureFlags.plan_view_v2` toggle operational.

The visual diff target at S31 end is < 10 px — loose, because text and annotation rendering has not yet been added.

---

#### Implementation Detail — Full Canvas Host

```typescript
// plugins/plan-view/canvas-host.ts (full implementation)

import { CanvasHost } from '@pryzm/ui/CanvasHost';
import { FrameScheduler } from '@pryzm/frame-scheduler';
import { projectWallEdges, computePocheFills } from '@pryzm/geometry-kernel/edge-projection';
import { PlanCamera } from './camera';
import { PlanViewRenderer } from './renderer';

export class PlanViewCanvasHost extends CanvasHost {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private camera: PlanCamera;
  private renderer: PlanViewRenderer;
  private resizeObserver: ResizeObserver;
  private isDirty = true;

  constructor(
    container: HTMLElement,
    private scheduler: FrameScheduler,
    private stores: StoreRegistry,
    private levelStore: LevelStore,
  ) {
    super();
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
    this.ctx = this.canvas.getContext('2d', { alpha: false })!; // alpha:false = slightly faster compositing
    container.appendChild(this.canvas);

    this.camera = new PlanCamera(this.canvas);
    this.camera.onDirty = () => { this.isDirty = true; this.scheduler.requestFrame('plan-camera-move'); };

    this.renderer = new PlanViewRenderer(this.ctx, this.camera);

    // Subscribe to all element stores that affect plan view.
    const dirtify = () => { this.isDirty = true; this.scheduler.requestFrame('plan-view-element-change'); };
    ['wall', 'slab', 'door', 'window', 'room', 'annotation', 'dimension', 'structural'].forEach(name => {
      stores.get(name).subscribeDirty(dirtify);
    });
    levelStore.subscribeDirty(dirtify);

    // Register with the scheduler.
    scheduler.onFrame('plan-view-render', this.renderFrame.bind(this), 'interactive');

    // Responsive canvas.
    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(container);
    this.onResize();
  }

  private onResize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.scale(dpr, dpr);
    this.isDirty = true;
    this.scheduler.requestFrame('plan-view-resize');
  }

  private renderFrame(): void {
    if (!this.isDirty) return;
    this.isDirty = false;
    this.renderer.render(this.getViewData());
  }

  private getViewData(): PlanViewData {
    const snap = this.levelStore.getSnapshot();
    const levelId = snap.activeLevel;
    const levelZ = snap.levels.find(l => l.id === levelId)?.worldY ?? 0;

    const walls = this.stores.get('wall').selectors(this.stores.get('wall').getSnapshot()).byLevel(levelId);
    const doors = this.stores.get('door').selectors(this.stores.get('door').getSnapshot()).byLevel(levelId);
    const windows = this.stores.get('window').selectors(this.stores.get('window').getSnapshot()).byLevel(levelId);
    const rooms = this.stores.get('room').selectors(this.stores.get('room').getSnapshot()).byLevel(levelId);
    const annotations = this.stores.get('annotation').selectors(this.stores.get('annotation').getSnapshot()).byLevel(levelId);

    return {
      levelId, levelZ,
      edges: projectWallEdges(walls, doors, windows, levelZ),
      pocheFills: computePocheFills(walls, levelZ),
      rooms, annotations, walls, doors, windows,
    };
  }

  dispose(): void {
    this.resizeObserver.disconnect();
    this.camera.dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }
}
```

---

#### Implementation Detail — `PlanViewRenderer.ts`

```typescript
// plugins/plan-view/renderer.ts

export class PlanViewRenderer {
  constructor(private ctx: CanvasRenderingContext2D, private camera: PlanCamera) {}

  render(data: PlanViewData): void {
    const { ctx } = this;
    const { width, height } = ctx.canvas;

    // 1. Background.
    ctx.fillStyle = '#FAFAFA';
    ctx.fillRect(0, 0, width, height);

    // 2. Apply camera (pan/zoom) transform.
    ctx.save();
    this.camera.applyTransform(ctx);

    // 3. Poche fills (solid filled wall cross-sections) — drawn BEFORE edges.
    ctx.fillStyle = '#2A2A2A';  // ISO 128-21: cut material = black/dark gray
    for (const fill of data.pocheFills) {
      ctx.beginPath();
      for (let i = 0; i < fill.polygon.length; i++) {
        const [x, z] = fill.polygon[i];
        if (i === 0) ctx.moveTo(x, -z); // flip Z: world Z → canvas Y (flipped)
        else ctx.lineTo(x, -z);
      }
      ctx.closePath();
      ctx.fill();
    }

    // 4. Edges (wall outlines, opening lines).
    for (const edge of data.edges) {
      ctx.beginPath();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = this.lineWeightToPx(edge.lineWeight);
      ctx.moveTo(edge.start[0], -edge.start[1]);
      ctx.lineTo(edge.end[0], -edge.end[1]);
      ctx.stroke();
    }

    // 5. Room fills (translucent).
    // (rendered here as polygon fills with pattern or tint)
    this.renderRoomFills(data.rooms);

    ctx.restore();
  }

  private lineWeightToPx(lineWeight: number): number {
    // Convert mm lineweight to canvas pixels at current zoom.
    return lineWeight * this.camera.scale * 3.78; // 1mm ≈ 3.78px at 96 DPI
  }

  private renderRoomFills(rooms: RoomDto[]): void {
    this.ctx.globalAlpha = 0.08;
    this.ctx.fillStyle = '#2060FF';
    for (const room of rooms) {
      if (!room.computedBoundary || room.computedBoundary.length < 3) continue;
      this.ctx.beginPath();
      for (let i = 0; i < room.computedBoundary.length; i++) {
        const [x, z] = room.computedBoundary[i];
        if (i === 0) this.ctx.moveTo(x, -z);
        else this.ctx.lineTo(x, -z);
      }
      this.ctx.closePath();
      this.ctx.fill();
    }
    this.ctx.globalAlpha = 1.0;
  }

  dispose(): void {/* nothing to dispose for Canvas2D renderer */}
}
```

**Critical: coordinate system flip**. Plan view maps world `(X, Z)` coordinates (horizontal plane in 3D) to canvas `(x, y)` coordinates. World Z increases away from the viewer; canvas Y increases downward. Therefore: `canvas.x = world.X`, `canvas.y = -world.Z`. Every coordinate transformation must apply this flip consistently — one missed flip produces a mirrored rendering that is visually identical but fails the visual diff test.

---

#### Implementation Detail — `PlanCamera.ts`

```typescript
// plugins/plan-view/camera.ts

export class PlanCamera {
  private panX = 0;
  private panZ = 0;
  private _scale = 50; // pixels per metre at scale 1:100

  onDirty: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    canvas.addEventListener('wheel', this.onWheel.bind(this), { passive: false });
    canvas.addEventListener('pointermove', this.onPointerMove.bind(this));
    canvas.addEventListener('pointerdown', this.onPointerDown.bind(this));
    canvas.addEventListener('pointerup', this.onPointerUp.bind(this));
  }

  get scale(): number { return this._scale; }

  applyTransform(ctx: CanvasRenderingContext2D): void {
    ctx.translate(ctx.canvas.width / 2 + this.panX, ctx.canvas.height / 2 + this.panZ);
    ctx.scale(this._scale, this._scale);
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 1.1 : 0.91;
    this._scale = Math.max(5, Math.min(500, this._scale * delta));
    this.onDirty?.();
  }

  // ... pan logic with pointerdown/move/up ...

  dispose(): void {/* remove event listeners */}
}
```

---

#### D1 — Kickoff (30 min)

- F finalises code-level `0023-plan-view-canvas2d-renderer.md` — "Plan view renderer: Canvas2D back-end of the SPEC-04 vector primitive model per `[strategic ADR-016]` (drawing engine architecture); dirty-flag driven, `FrameScheduler` owns the single render call, no THREE, coordinate system convention (world XZ → canvas xy with Z-flip)."

> **Architectural anchor (`[strategic ADR-016]`)**: the plan-view renderer is one of three back-ends of the SPEC-04 vector primitive model. The other two (SVG, PDF) ship in S31 (SVG) and S33 (PDF). This sprint's deliverable is *only* the Canvas2D back-end; the SVG/PDF back-ends consume the same `Primitive[]` stream produced upstream. Per the parity contract, all three back-ends MUST agree pixel-for-pixel where it matters and dimensionally exact where it matters more (per SPEC-04 §1).
- Activate `featureFlags.plan_view_v2` in the manifest: any project can toggle it off to fall back to PRYZM 1 plan view. This is critical — it means 2B can be iterated openly without risking existing projects.
- B: set up visual-diff CI harness (Playwright screenshot comparison) against PRYZM 1 plan view reference images in `tests/visual-diff/plan-view/`. Tolerance: 10 px for this sprint.

#### D2–D8 Parallel Work

| Day | Agent A (Math Track) | Agent B (Rendering Track) |
|---|---|---|
| D2 | Integrate `edge-projection.ts` (S30) into the plan view pipeline — confirm the `getViewData()` function calls it correctly for all wall types (straight, curved, with openings). | Implement `PlanViewRenderer` — background, poche fills, edges. Test on small fixture: poche fills visible, edges visible, zoom works. |
| D3 | Verify coordinate flip consistency: run the 5 PRYZM 1 reference screenshots through the visual-diff harness and confirm the score is actually measured (even if high). | Implement `PlanCamera` — wheel zoom, pointer pan, dirty-flag emission. Confirm 0 fps idle when not interacting (profiler). |
| D4 | Integration: `canvas-host.ts` reads from stores and calls `getViewData()` for the active level. Confirm level-switching updates the view data correctly. | Integration: `canvas-host.ts` wired to `PlanViewRenderer`. Confirm render call is exactly once per frame when dirty, never called when not dirty. |
| D5 | **Mid-sprint sync (1 h) — mandatory visual diff measurement** — run visual-diff harness on 5 cases. Report score. Target: < 10 px. If > 15 px: identify cause immediately (most likely: coordinate flip error, lineweight mapping error, or poche fill coverage). | Same session — profiling: plan view frame time should be < 4 ms at 60 fps on medium fixture (20 walls). |
| D6 | Fix any visual diff failures from D5. Common issues: (1) miter joins not projected correctly (edge-projection `subtractOpenings` has an off-by-one), (2) curved wall projection missing arcs. | Performance: confirm 60 fps with 200 walls in plan view. If not: profile canvas fill rate, reduce unnecessary re-paints. |
| D7 | Visual diff: run all 30 cases. Score. If any > 10 px: fix. Document which cases pass and which don't (acceptable for sprint 1 if annotation-related — those are added in S32). | `apps/bench/orbit-fps-plan.ts` — 2D pan/zoom equivalent. Gate: > 55 fps p95. |
| D8 | `featureFlags.plan_view_v2` toggle: confirm switching from PRYZM 2 plan view to PRYZM 1 plan view (and back) works without data loss or crash. | `docs/04-reference/architecture-detail/plan-view.md` — architecture section (renderer, camera, coordinate convention, dirty-flag strategy). |

#### D9 — Sprint Demo + Retro

- B: open medium fixture in plan view → pan and zoom → poche fills visible → level switcher changes which level is shown. Toggle `featureFlags.plan_view_v2` = false → PRYZM 1 plan view appears. Toggle back → PRYZM 2 plan view.
- A: visual diff scores on 30 cases. Target met (< 10 px on geometry-only cases). Annotation-related cases noted as pending S32.

#### S31 Exit Criteria

- [ ] Plan view renders walls/slabs/doors with poche fills and correct edges.
- [ ] Dirty-flag: 0 fps idle confirmed in DevTools profiler.
- [ ] Pan/zoom responsive at 60 fps p95.
- [ ] `featureFlags.plan_view_v2` toggle works without crash.
- [ ] Visual-diff: geometry cases < 10 px.
- [ ] `apps/bench/orbit-fps-plan.ts` > 55 fps p95.
- [ ] ADR-023 merged.

**Kill-switch K2B-1**: if visual diff > 20 px at D5 and the cause is structural (coordinate convention error or edge-projection algorithm), halt S31. Fix before continuing. A > 20 px at D5 means the foundation is wrong and S32 will compound the error.

---

### S32 — Plan-View Annotation Renderer
**Weeks 63–64 (Month 16–17)**

---

#### Context and Why This Matters

Annotations are what make a plan view a professional technical drawing — without text labels, leader lines, callout boxes, and region fills, the plan view is just a geometry diagram. S32 adds the annotation rendering layer, bringing the visual diff tolerance from 10 px to < 5 px (< 2 px target in S33 after Contract 44 closes).

The annotation renderer is split into two parts following the established pattern:
1. **Pure layout** (`annotation-renderer.ts`) — computes the position of every text label, leader line vertex, and callout box in 2D plan-view coordinates. Pure function: no DOM, no Canvas access, no `requestAnimationFrame`. Can run in a Web Worker or Node.
2. **Canvas2D committer** (`annotation-committer.ts`) — draws the layout to the Canvas2D context.

This split enables server-side annotation layout computation (for PDF export in S40) without duplicating the layout algorithm.

---

#### Implementation Detail — Pure Annotation Layout

```typescript
// plugins/plan-view/annotation-renderer.ts (pure layout)

export interface AnnotationLayout {
  id: string;
  type: 'text' | 'leader' | 'callout' | 'region';
  // For text:
  text?: { content: string; anchor: Vec2; angle: number; fontSize: number; fontWeight: 'normal' | 'bold' };
  // For leader:
  leader?: { points: Vec2[]; arrowHead: Vec2; labelAnchor: Vec2; labelText: string };
  // For callout:
  callout?: { boxCorner: Vec2; boxWidth: number; boxHeight: number; text: string; leaderPoint: Vec2 };
  // For region:
  region?: { polygon: Vec2[]; fillColor: string; fillOpacity: number; strokeColor: string };
}

export function layoutAnnotations(
  annotations: AnnotationDto[],
  camera: { scale: number; panX: number; panZ: number },
  canvasWidth: number,
  canvasHeight: number,
): AnnotationLayout[] {
  const layouts: AnnotationLayout[] = [];

  for (const ann of annotations) {
    switch (ann.type) {
      case 'text':
        layouts.push(layoutText(ann, camera));
        break;
      case 'leader':
        layouts.push(layoutLeader(ann, camera));
        break;
      case 'callout':
        layouts.push(layoutCallout(ann, camera, canvasWidth, canvasHeight));
        break;
      case 'region':
        layouts.push(layoutRegion(ann, camera));
        break;
    }
  }

  // Post-process: detect text-text overlaps and apply nudge.
  return resolveOverlaps(layouts, canvasWidth, canvasHeight);
}

function layoutLeader(ann: AnnotationDto, camera: { scale: number }): AnnotationLayout {
  // Leader: array of 2D waypoints (user-placed) → arrowhead at terminator.
  // Minimum 2 waypoints. Last waypoint = arrowhead position on the element.
  const points = ann.leaderPoints?.map(p => worldToCanvas(p, camera)) ?? [];
  const arrowHead = points[points.length - 1];
  const labelAnchor = points[0];

  return {
    id: ann.id,
    type: 'leader',
    leader: { points, arrowHead, labelAnchor, labelText: ann.text ?? '' },
  };
}

function resolveOverlaps(layouts: AnnotationLayout[], canvasW: number, canvasH: number): AnnotationLayout[] {
  // Simple greedy nudge: for each text layout, if it overlaps an earlier one, nudge it down.
  // Full force-directed label placement is a Phase 3 enhancement.
  const texts = layouts.filter(l => l.type === 'text' && l.text);
  for (let i = 1; i < texts.length; i++) {
    for (let j = 0; j < i; j++) {
      if (overlaps(texts[i].text!, texts[j].text!)) {
        texts[i].text!.anchor[1] += texts[i].text!.fontSize * 1.2; // nudge down by line height
      }
    }
  }
  return layouts;
}
```

**Why greedy nudge instead of force-directed layout?** Force-directed label placement (like D3's `labeler`) is O(N²) per frame and introduces non-determinism (the label positions depend on iteration order, which varies by floating point precision). For Phase 2, greedy nudge is deterministic and fast. Full force-directed placement is a Phase 3 enhancement (D10 in `docs/phasse-3-backlog.md`).

---

#### Implementation Detail — Canvas2D Annotation Committer

```typescript
// plugins/plan-view/annotation-committer.ts

export class AnnotationCommitter {
  private fontFamily = 'Inter, system-ui, sans-serif';

  constructor(private ctx: CanvasRenderingContext2D) {}

  draw(layouts: AnnotationLayout[]): void {
    for (const layout of layouts) {
      switch (layout.type) {
        case 'text':    this.drawText(layout.text!); break;
        case 'leader':  this.drawLeader(layout.leader!); break;
        case 'callout': this.drawCallout(layout.callout!); break;
        case 'region':  this.drawRegion(layout.region!); break;
      }
    }
  }

  private drawText(text: AnnotationLayout['text']): void {
    const { ctx } = this;
    ctx.save();
    ctx.translate(text!.anchor[0], text!.anchor[1]);
    ctx.rotate(text!.angle);
    ctx.font = `${text!.fontWeight} ${text!.fontSize}px ${this.fontFamily}`;
    ctx.fillStyle = '#000';
    ctx.fillText(text!.content, 0, 0);
    ctx.restore();
  }

  private drawLeader(leader: AnnotationLayout['leader']): void {
    const { ctx } = this;
    ctx.beginPath();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 0.5;
    for (let i = 0; i < leader!.points.length; i++) {
      const [x, y] = leader!.points[i];
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Arrowhead at terminal point.
    this.drawArrowhead(ctx, leader!.arrowHead, leader!.points[leader!.points.length - 2]);

    // Label at origin point.
    ctx.font = `11px ${this.fontFamily}`;
    ctx.fillStyle = '#000';
    ctx.fillText(leader!.labelText, leader!.labelAnchor[0] + 4, leader!.labelAnchor[1] - 4);
  }

  private drawArrowhead(ctx: CanvasRenderingContext2D, tip: Vec2, prev: Vec2): void {
    const angle = Math.atan2(tip[1] - prev[1], tip[0] - prev[0]);
    const size = 6;
    ctx.save();
    ctx.translate(tip[0], tip[1]);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-size, -size / 3);
    ctx.lineTo(-size, size / 3);
    ctx.closePath();
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.restore();
  }

  private drawCallout(callout: AnnotationLayout['callout']): void {
    const { ctx, fontFamily } = this;
    // Box.
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(callout!.boxCorner[0], callout!.boxCorner[1], callout!.boxWidth, callout!.boxHeight);
    // Text inside box.
    ctx.font = `11px ${fontFamily}`;
    ctx.fillStyle = '#000';
    ctx.fillText(callout!.text, callout!.boxCorner[0] + 4, callout!.boxCorner[1] + 14, callout!.boxWidth - 8);
    // Leader from box to element.
    ctx.beginPath();
    ctx.moveTo(callout!.boxCorner[0] + callout!.boxWidth / 2, callout!.boxCorner[1] + callout!.boxHeight);
    ctx.lineTo(callout!.leaderPoint[0], callout!.leaderPoint[1]);
    ctx.stroke();
  }

  private drawRegion(region: AnnotationLayout['region']): void {
    const { ctx } = this;
    ctx.beginPath();
    for (let i = 0; i < region!.polygon.length; i++) {
      const [x, y] = region!.polygon[i];
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.globalAlpha = region!.fillOpacity;
    ctx.fillStyle = region!.fillColor;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = region!.strokeColor;
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }
}
```

---

#### S32 Exit Criteria

- [ ] Annotations (text, leader, callout, region) render in plan view.
- [ ] Visual diff: annotation cases < 5 px on 30-case fixture.
- [ ] Overlap resolution: text labels do not overlap when 10+ annotations are in the same level.
- [ ] Annotation layout is a pure function (no canvas access) — runs in Node test.
- [ ] OTel `pryzm.plan-view.annotation-layout`, `pryzm.plan-view.annotation-draw` spans.

---

### S33 — Plan View + SVP Parity (Contract 44 G1–G10)
**Weeks 65–66 (Month 17)**

---

#### Context and Why This Matters

Contract 44 is the formal gap matrix between PRYZM 1 plan view and PRYZM 1 SVP (Structural View Port). Its 10 gaps (G1–G10) represent real defects reported by customers that PRYZM 2 must fix **in the new architecture** — not patched in PRYZM 1. Each gap has an automated test in `tests/contract-44/`.

The 10 gaps and their fixes:

| Gap | Description | Fix |
|---|---|---|
| G1 | Plan view elements not scoped to active level | `level-scoped-renderers.ts` — every renderer takes `levelId` as input |
| G2 | Structural elements from other levels bleed through | G1 fix extends to structural elements |
| G3 | Linked levels (stacked buildings) don't isolate correctly | G1 fix + `levelId` scoping of linked model elements |
| G4 | Global style override affects all views (per-view style needed) | `style-resolver.ts` — per-view style, not global |
| G5 | Visibility flags don't persist per-view | `ViewStore` gets `elementVisibility: Map<viewId, Map<elementId, boolean>>` |
| G6 | Override graphics (material overrides) apply globally, not per-view | `style-resolver.ts` extended with per-view material overrides |
| G7 | Poche pattern ignores override material | `poche.ts` made style-resolver-aware |
| G8 | Poche pattern not applied to linked model elements | G7 fix extended to linked models |
| G9 | Selection in plan view doesn't update 3D selection | `plan-view/selection.ts` — selection dispatches to `SelectionStore` |
| G10 | Drag in plan view does not create commands (data lost on reload) | `plan-view/drag.ts` — drag dispatches `MoveElement` commands |

---

#### Implementation Detail — `style-resolver.ts` (G4, G6, G7)

```typescript
// plugins/plan-view/style-resolver.ts

export interface ViewStyleOverride {
  viewId: string;
  elementId?: string;   // null = applies to all elements
  materialId?: string;
  lineWeightOverride?: number;
  fillColorOverride?: string;
  visible?: boolean;
}

export class StyleResolver {
  constructor(
    private overrides: ViewStyleOverride[],
    private viewId: string,
  ) {}

  resolve(elementId: string, defaultStyle: ElementStyle): ElementStyle {
    // Per-view, per-element override (most specific).
    const perElement = this.overrides.find(o => o.viewId === this.viewId && o.elementId === elementId);
    if (perElement) return applyOverride(defaultStyle, perElement);

    // Per-view, all-elements override.
    const perView = this.overrides.find(o => o.viewId === this.viewId && !o.elementId);
    if (perView) return applyOverride(defaultStyle, perView);

    return defaultStyle;
  }

  resolveVisibility(elementId: string): boolean {
    const override = this.overrides.find(
      o => o.viewId === this.viewId && (o.elementId === elementId || !o.elementId)
    );
    return override?.visible ?? true;
  }
}
```

**Why per-view style in the plan view (not in the 3D view)**: Contract 44 gaps G4–G8 are specific to the plan view. The 3D view has its own style system (materials, override graphics) that is separate. The `StyleResolver` is constructed per-view-render from the current `ViewStore` state and is used only in the plan view renderer. In Phase 3B, this will be extracted to `packages/view-state/style-resolver.ts` for reuse in section view and sheets.

---

#### Implementation Detail — `plan-view/selection.ts` (G9)

```typescript
// plugins/plan-view/selection.ts

export class PlanViewSelection {
  private hoveredId: string | null = null;
  private selectedIds: Set<string> = new Set();

  constructor(
    private canvas: HTMLCanvasElement,
    private camera: PlanCamera,
    private scheduler: FrameScheduler,
    private commandBus: CommandBus,
    private hitTest: (worldX: number, worldZ: number) => string | null,
  ) {
    canvas.addEventListener('click', this.onClick.bind(this));
    canvas.addEventListener('pointermove', this.onPointerMove.bind(this));
  }

  private onClick(e: MouseEvent): void {
    const { worldX, worldZ } = this.camera.canvasToWorld(e.offsetX, e.offsetY);
    const elementId = this.hitTest(worldX, worldZ);

    if (elementId) {
      // Dispatch SelectElements command — the same command that 3D clicking dispatches.
      // This ensures plan view selection and 3D selection stay in sync through the SelectionStore.
      this.commandBus.execute({
        command: 'selection.set',
        payload: { elementIds: [elementId], additive: e.shiftKey },
      });
    } else {
      this.commandBus.execute({ command: 'selection.clear', payload: {} });
    }
  }

  private onPointerMove(e: MouseEvent): void {
    const { worldX, worldZ } = this.camera.canvasToWorld(e.offsetX, e.offsetY);
    const newHovered = this.hitTest(worldX, worldZ);
    if (newHovered !== this.hoveredId) {
      this.hoveredId = newHovered;
      this.scheduler.requestFrame('plan-hover-change');
    }
  }
}
```

**Hit testing in plan view**: the `hitTest` function performs point-in-wall AABB test (fast) followed by point-in-polygon refinement (for accuracy). The wall AABB is `wall.start`/`wall.end` ± `wall.thickness/2`. The polygon refinement uses the Shoelace formula from `packages/geometry-kernel/utils/area.ts`. This is not GPU picking (that's 3D) — it's 2D spatial hashing.

---

#### Implementation Detail — `plan-view/drag.ts` (G10)

```typescript
// plugins/plan-view/drag.ts

export class PlanViewDrag {
  private dragTarget: { elementId: string; originalPosition: Vec3 } | null = null;
  private isDragging = false;

  constructor(
    private canvas: HTMLCanvasElement,
    private camera: PlanCamera,
    private commandBus: CommandBus,
    private selectionStore: SelectionStore,
    private hitTest: (worldX: number, worldZ: number) => string | null,
  ) {
    canvas.addEventListener('pointerdown', this.onPointerDown.bind(this));
    canvas.addEventListener('pointermove', this.onPointerMove.bind(this));
    canvas.addEventListener('pointerup', this.onPointerUp.bind(this));
  }

  private onPointerDown(e: PointerEvent): void {
    const { worldX, worldZ } = this.camera.canvasToWorld(e.offsetX, e.offsetY);
    const elementId = this.hitTest(worldX, worldZ);
    if (elementId && this.selectionStore.getSnapshot().selectedIds.includes(elementId)) {
      this.dragTarget = { elementId, originalPosition: this.getElementPosition(elementId) };
      this.canvas.setPointerCapture(e.pointerId);
    }
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.dragTarget) return;
    this.isDragging = true;
    const { worldX, worldZ } = this.camera.canvasToWorld(e.offsetX, e.offsetY);
    // Issue a live preview move (ephemeral, not persisted).
    this.commandBus.execute({
      command: 'element.move.preview',
      payload: { elementId: this.dragTarget.elementId, toX: worldX, toZ: worldZ },
      ephemeral: true,
    });
  }

  private onPointerUp(e: PointerEvent): void {
    if (this.dragTarget && this.isDragging) {
      const { worldX, worldZ } = this.camera.canvasToWorld(e.offsetX, e.offsetY);
      // Issue a persisted move command.
      this.commandBus.execute({
        command: 'element.move',
        payload: { elementId: this.dragTarget.elementId, toX: worldX, toY: this.dragTarget.originalPosition[1], toZ: worldZ },
      });
    }
    this.dragTarget = null;
    this.isDragging = false;
  }
}
```

---

#### S33 Exit Criteria

- [ ] All 10 Contract 44 gap tests green: `tests/contract-44/G{1-10}.test.ts`.
- [ ] Visual diff: all 30 cases < 2 px.
- [ ] Selection in plan view drives 3D selection store (confirmed in multi-tab test).
- [ ] Drag in plan view creates persisted `element.move` commands.
- [ ] `featureFlags.plan_view_v2` still operational and still defaults to `false` for new users.

**Kill-switch K2B-2**: if Contract 44 gap G9 or G10 (selection/drag) cannot be closed within S33 without compromising the visual diff score, defer them to a Phase 2B mini-sprint (extend 2B by 1 week). These two gaps are customer-visible — they cannot be shipped as "not yet done."

---

### S34 — Annotations Migration (General, All Views)
**Weeks 67–68 (Month 17–18)**

---

#### Context and Why This Matters

S32 added annotation rendering to the plan view. S34 migrates the full annotation system — creating `plugins/annotations/` as the home for all annotation types across all views (3D, plan view, section view). This includes the `AnnotationStore`, 8 handlers, and tools that work in both 3D and plan view contexts.

The key challenge in S34 is **context-aware annotation rendering**: the same annotation DTO (a text label with a 3D anchor point) must render differently in:
- **3D view** — as a `THREE.Sprite` billboard or `THREE.Object3D` label.
- **Plan view** — as a Canvas2D text at the projected 2D position.
- **Section view** — as a Canvas2D text at the section-projected position.

The `AnnotationDto` stores a 3D anchor (`Vec3`). Each view's renderer projects it appropriately.

---

#### Implementation Detail — Cross-View Annotation Rendering

```typescript
// packages/stores/AnnotationStore.ts

export interface AnnotationDto {
  id: AnnotationId;
  type: 'text' | 'leader' | 'callout' | 'region';
  levelId: string;
  text?: string;
  anchor: Vec3;            // 3D world position; projected per-view
  leaderPoints?: Vec3[];   // 3D world waypoints; projected per-view
  viewConstraint?: string; // if set, only visible in this viewId
  fontStyle: { size: number; weight: 'normal' | 'bold'; italic: boolean };
  lineWeight: number;
  colorId: string;
}
```

**3D annotation committer**: uses a `CSS2DRenderer` (a THREE.js add-on that positions HTML `<div>` elements over the 3D canvas using CSS transforms). The label follows the anchor in world space and is always readable (no perspective distortion on text). This avoids texture-atlas font rendering complexity.

**Cross-view rendering verification**: a Playwright test opens 3D + plan view simultaneously (split pane from S36), places an annotation in 3D, and confirms it appears in both views in the correct position.

---

#### S34 Exit Criteria

- [ ] All annotation types (text, leader, callout, region) functional in 3D AND plan view.
- [ ] 8 annotation handlers with `produceWithPatches`.
- [ ] Annotation tools operational in 3D + plan view contexts.
- [ ] Visual diff maintained at < 2 px for plan view annotation rendering.
- [ ] Perf: > 55 fps with 1,000 annotations in plan view.
- [ ] `plugins/annotations/README.md` committed.

---

### S35 — Section View Foundation
**Weeks 69–70 (Month 18)**

---

#### Context and Why This Matters

Section view is conceptually simpler than plan view — it is a vertical cut rather than a horizontal one. But the section-cut algorithm has different challenges: elements that are cut vs elements that appear as projections in the far view (e.g. walls behind the section line are visible at reduced line weight). This distinction is what the `section-cut.ts` producer computes.

Code-level ADR `0024-section-cut-algorithm.md` defines the section cut algorithm. The key decision is the **cut-vs-projection distinction**: elements whose AABB intersects the section line's vertical plane within the cut depth `d` are "cut elements" (shown with poche fill at the cut face). Elements whose AABB is within the far-projection depth `D > d` are "projected elements" (shown as outline only, at reduced line weight). Elements outside `D` are not shown.

> **Naming clarification.** `[strategic ADR-024]` is the *constraint solver* (`docs/02-decisions/adrs/ADR-024-constraint-solver.md`). The section-cut decision documented in this sprint is the sprint-scoped `docs/02-decisions/adrs/0024-section-cut-algorithm.md`. Both files exist; the strategic ADR-024's "Naming note" already documents the historical collision.

---

#### Implementation Detail — Section Cut Producer

```typescript
// packages/geometry-kernel/producers/section-cut.ts

export interface SectionLineDto {
  start: Vec3;
  end: Vec3;
  cutDepth: number;   // metres in front of section line — elements within this depth are "cut"
  farDepth: number;   // metres beyond cut depth — elements shown as projections
  height: number;     // total height of the section (usually = building height)
}

export interface Cut2D {
  cutElements: Array<{ elementId: string; polygon: Vec2[]; kind: 'poche' }>;
  projectedElements: Array<{ elementId: string; edges: Edge2D[]; kind: 'projection' }>;
}

export function computeSectionCut(
  elements: AnyElementDto[],
  sectionLine: SectionLineDto,
): Cut2D {
  const sectionPlane = computeVerticalPlane(sectionLine.start, sectionLine.end);
  const cutElements: Cut2D['cutElements'] = [];
  const projectedElements: Cut2D['projectedElements'] = [];

  for (const element of elements) {
    const signedDist = distanceToPlane(element.bounds, sectionPlane);
    if (signedDist < 0) continue;  // behind the section line — not visible

    if (signedDist <= sectionLine.cutDepth) {
      // Cut element: intersect element geometry with the section plane.
      const polygon = intersectWithPlane(element, sectionPlane);
      if (polygon.length >= 3) {
        cutElements.push({ elementId: element.id, polygon, kind: 'poche' });
      }
    } else if (signedDist <= sectionLine.cutDepth + sectionLine.farDepth) {
      // Projected element: project geometry onto the section plane.
      const edges = projectOntoPlane(element, sectionPlane);
      projectedElements.push({ elementId: element.id, edges, kind: 'projection' });
    }
  }

  return { cutElements, projectedElements };
}
```

---

#### S35 Exit Criteria

- [ ] Section line tool draws a section line in plan view; section view opens and renders correct cut.
- [ ] Cut elements shown with poche fill; projected elements shown as outlines at reduced line weight.
- [ ] `section-cut.ts` is pure — runs in Node test.
- [ ] Pan/zoom works in section view.
- [ ] Visual diff vs PRYZM 1 section view: < 5 px (tolerance tightens in S36).
- [ ] ADR-024 merged.

**Kill-switch K2B-3**: if section view visual diff > 10 px after full implementation (not just skeleton), and the cause is in the `intersectWithPlane` algorithm for complex geometry (curved walls, stepped slabs), extend S35 by 3 days. Do not ship a section view with > 10 px visual error to the M24 beta.

---

### S36 — Multi-View Sync + Sub-Phase 2B Close
**Weeks 71–72 (Month 18)**

---

#### Context and Why This Matters

Multi-view sync is the last piece of 2B — edits in any view (3D, plan, section) must propagate to the other views within a single frame (16 ms p95). This seems simple (the stores already hold the truth, and all views subscribe to stores). But there are three subtle challenges:

1. **Selection sync**: selecting an element in plan view must highlight it in 3D and in section view (if the element is visible there). The `SelectionStore` is the source of truth, but each view must subscribe and re-render on selection changes without unnecessary frame ticks.
2. **Edit propagation**: a drag move in plan view sends an `element.move` command → store updates → 3D committer rebuilds the mesh → section view re-runs the cut → plan view re-projects the edges. This three-branch propagation must complete in one frame (16 ms).
3. **Split-pane layout**: the editor can show 2, 3, or 4 views simultaneously. The `multi-view-layout.ts` orchestrates pane sizing, panel visibility, and the FrameScheduler's priority across multiple active canvases.

---

#### Implementation Detail — Multi-View Layout

```typescript
// packages/view-state/multi-view-layout.ts

export type ViewLayout = '1-up' | '2-horizontal' | '2-vertical' | '3-right' | '4-equal';

export class MultiViewLayout {
  private panes: Map<string, HTMLElement> = new Map();

  constructor(
    private container: HTMLElement,
    private viewRegistry: ViewRegistry,
    private scheduler: FrameScheduler,
  ) {}

  setLayout(layout: ViewLayout): void {
    // Apply CSS grid or flexbox layout to the container.
    this.container.className = `multi-view-layout-${layout}`;

    // Activate / deactivate CanvasHosts based on which panes are visible.
    for (const [viewId, pane] of this.panes) {
      const isVisible = pane.offsetWidth > 0;
      if (isVisible) {
        this.viewRegistry.getHost(viewId)?.activate();
      } else {
        this.viewRegistry.getHost(viewId)?.deactivate(); // stop dirtying the scheduler from hidden views
      }
    }
  }

  addPane(viewId: string, host: CanvasHost): void {
    const pane = document.createElement('div');
    pane.className = 'view-pane';
    pane.setAttribute('data-view-id', viewId);
    this.container.appendChild(pane);
    host.mount(pane);
    this.panes.set(viewId, pane);
  }

  dispose(): void {
    for (const pane of this.panes.values()) pane.remove();
    this.panes.clear();
  }
}
```

---

#### Implementation Detail — `view-sync.ts`

```typescript
// packages/view-state/view-sync.ts

export class ViewSync {
  constructor(
    private stores: StoreRegistry,
    private scheduler: FrameScheduler,
  ) {
    // When any element store changes, schedule a render in all active views.
    // All views subscribe to the same stores; this ensures no view misses an update.
    const dirtifyAll = () => scheduler.requestFrame('element-change');
    ['wall', 'slab', 'door', 'window', 'room', 'annotation', 'structural', 'lighting', 'plumbing', 'furniture', 'dimension', 'section'].forEach(name => {
      stores.get(name).subscribeDirty(dirtifyAll);
    });

    // Selection changes dirty all views (selection highlight must update everywhere).
    stores.get('selection').subscribeDirty(() => scheduler.requestFrame('selection-change'));
  }
}
```

---

#### D9 — Sub-Phase 2B Demo Recording (Joint, 10-min Screencast)

Timestamped script:
- **(0:00–1:30)** Open a medium-complexity project in plan view. Pan and zoom — confirm 60 fps. Place a wall using the wall tool in 3D → appears in plan view within 1 frame.
- **(1:30–3:00)** Plan view annotation: place a leader annotation in plan view → 3D view shows the annotation as a CSS2D label → toggle `featureFlags.plan_view_v2` off → PRYZM 1 plan view → toggle back.
- **(3:00–5:00)** Contract 44 validation: select an element in plan view → 3D view selection updates. Drag an element in plan view → geometry moves in 3D view within the same frame.
- **(5:00–7:00)** Section view: draw a section line in plan view → section view pane opens → shows poche-filled cut with projected elements. Edit a wall → section view updates.
- **(7:00–9:00)** Multi-view split pane: 3D view (left) + plan view (top-right) + section view (bottom-right). Edit in 3D → all three views update simultaneously within one frame (confirm with DevTools Performance: single frame, no dropped frames).
- **(9:00–10:00)** Visual-diff bench dashboard: all 30 cases < 2 px. OTel trace showing plan-view render spans.

#### S36 Exit Criteria (= Sub-Phase 2B Exit)

- [ ] Edit in any view → change visible in all other views within 16 ms p95.
- [ ] `apps/bench/multi-view-sync.ts` < 16 ms p95.
- [ ] Contract 44: all 10 gaps green (from S33; maintained through S36).
- [ ] Visual diff: plan view < 2 px, section view < 2 px on 30-case fixture.
- [ ] `featureFlags.plan_view_v2` still operational (retained through M24 beta).
- [ ] Multi-view layout: 1-up, 2-horizontal, 2-vertical, 4-equal all functional.
- [ ] 2B demo recording committed to `docs/05-guides/developer/demos/M18-2B.mp4`.
- [ ] `apps/bench/reports/M18-2B.md` committed.
- [ ] ADRs 023–025 merged.
- [ ] 2B retro decision documented: enable `featureFlags.plan_view_v2` by default for beta users, or keep behind flag for selected users?

**Kill-switch K2B-4**: if multi-view sync latency > 30 ms p95 at S36 D5, halt. Fix before proceeding to 2C. The M24 beta gate requires < 250 ms multi-user sync AND < 16 ms multi-view edit propagation. If S36 cannot achieve < 16 ms, the problem is in the store subscription chain — not in the sync server — and must be diagnosed here.

---

## §3 Cross-Cutting Deliverables for 2B

### §3.1 ADRs

| ID | Subject | Key Decision | Sprint |
|---|---|---|---|
| Code-level `0023-plan-view-canvas2d-renderer.md` (subordinate to `[strategic ADR-016]`) | Plan view renderer architecture | Canvas2D back-end of SPEC-04 vector primitive model, no THREE, FrameScheduler dirty-flag, world XZ → canvas xy with Z-flip | S31 |
| Code-level `0024-section-cut-algorithm.md` (distinct from `[strategic ADR-024]` constraint solver) | Section view cut algorithm | Cut depth / far projection depth; cut elements = poche fill; projected elements = outline at 50% line weight | S35 |
| Code-level `0025-multi-view-sync.md` | Multi-view sync strategy | `ViewSync` subscribes all views to all element stores; `FrameScheduler.requestFrame` is the propagation mechanism; no inter-view message passing | S36 |

### §3.2 CI Gates Added in 2B

| Gate | Hard-fail Threshold | Sprint |
|---|---|---|
| Visual diff plan view (geometry) | > 10 px | S31 |
| Visual diff plan view (annotations) | > 5 px | S32 |
| Visual diff plan view (full) | > 2 px | S33 |
| Contract 44 gap tests (G1–G10) | Any failure | S33 |
| Multi-view sync latency | > 20 ms p95 | S36 |
| Section view visual diff | > 2 px | S36 |
| Plan view fps | < 50 fps p95 | S31 |

### §3.3 OTel Spans Added in 2B

| Span | Layer | Sprint |
|---|---|---|
| `pryzm.plan-view.render` | L5 (2D) | S31 |
| `pryzm.plan-view.poche` | L4 | S31 |
| `pryzm.plan-view.annotation-layout` | L4 | S32 |
| `pryzm.plan-view.annotation-draw` | L5 (2D) | S32 |
| `pryzm.section-view.cut` | L4 | S35 |
| `pryzm.section-view.render` | L5 (2D) | S35 |
| `pryzm.multi-view.sync-propagation` | L5 | S36 |

---

## §4 Risk Register (2B-Specific)

| ID | Risk | Likelihood | Impact | Mitigation | Trigger |
|---|---|---|---|---|---|
| **R2B-01** | Visual diff > 2 px after annotation rendering due to font rendering differences between Canvas2D and PRYZM 1's SVG text | High | High | Use same font family (`Inter`); match font size to px exactly. If still > 2 px, use a visual-diff tolerance of 3 px for text pixels (text AA is inherently non-deterministic) | S32 D5 |
| **R2B-02** | Contract 44 G9/G10 (selection/drag) incompatible with multi-view sync | Medium | High | K2B-2 kill-switch; extend 2B by 1 week rather than shipping broken G9/G10 | S33 |
| **R2B-03** | Section cut algorithm produces self-intersecting polygons for complex geometries (curved walls, compound roofs) | Medium | High | Code-level `0024-section-cut-algorithm.md` defines fallback: if polygon is self-intersecting, convex-hull the polygon (visible quality loss, logged). Full fix in Phase 3 | S35 |
| **R2B-04** | Multi-view edit propagation > 16 ms when all three views are active + editing | Medium | High | Profile at D5; primary bottleneck will be the section view re-cut (O(elements) on every edit) — pre-compute section cut on bake worker as a background job | S36 |
| **R2B-05** | 2B overruns by > 2 weeks, compressing 2C | Medium | Critical | `featureFlags.plan_view_v2` enables safe partial shipping; 2B retro explicitly asks "what defers to Phase 3?" | S36 |
| **R2B-06** | `featureFlags.plan_view_v2` toggle causes crash on older projects (PRYZM 1 plan view not backward compatible with new schema fields) | Low | High | Test flag toggle on 10 PRYZM 1 projects at S31 D1; any crash = immediate fix before continuing | S31 |

---

## §5 2B → 2C Handoff Checklist

- [ ] Contract 44 all 10 gaps green and maintained.
- [ ] Visual diff: plan view < 2 px, section view < 2 px on 30-case fixture.
- [ ] Multi-view sync < 16 ms p95.
- [ ] `featureFlags.plan_view_v2` retained and operational.
- [ ] ADRs 023–025 merged.
- [ ] 2B demo recording committed.
- [ ] 2B retro decision on `featureFlags.plan_view_v2` default for beta documented.
- [ ] Any deferred items documented in `docs/phase-2-backlog.md`.
- [ ] S37 sprint plan drafted.

---

## §Gap-Closure Subphase (added 2026-04-27 per `GAP-REVIEW-2026-04-27.md`; expanded 2026-04-27 to absorb all Phase-2A gap-closure)

Phase 2B is the highest-slip-risk phase, and **per the 2026-04-27 directive Phase 2A holds no gap-closure work** (Phase 2A is in active development; mid-flight new-work injection forbidden). All ratification, reverse-doc, security cleanup, drawing-primitives MVP, ESLint rule promotion, and the Canvas2D pre-port that originally targeted S25–S30.10 are now absorbed into S31 of this phase, with the original 2B plan-view work continuing S32–S36. **S31 is now an unusually heavy sprint**; its slip risk is the single largest in Phase 2 and is mitigated by ADR-018 Tier-1 cuts T1.7 (PDF-to-BIM degradation, ~1 sprint S55) and T1.8 (formula library 24→14, ~1 sprint S41), either of which buys the calendar back if S31 overruns. The pre-port itself (5 hot ops on Canvas2D) remains a non-negotiable correctness gate per SPEC-30 §5.

| Sprint | Gap-closure deliverable | Closes |
|---|---|---|
| **S31** (heavy ratification + pre-port + reverse-doc) | **All displaced Phase-2A items + pre-port:** (a) SPEC-13/15/21/24/26/27/28/29/30 published as standing references; (b) ADR-022/023/025/026/028/030 ratified; ESLint rules `pryzm/no-impure-context`, `pryzm/single-frame-owner`, `pryzm/no-react-runtime`, `pryzm/no-direct-three-examples`, `pryzm/no-circular` lit at **warning** level; (c) reverse-document envelopes for the 12 Phase-1 GREEN families + the 6 Phase-2A in-flight families (Rooms, Structural, Lighting, Plumbing, Furniture, Dimensions) per SPEC-13 §3 + SPEC-21 Step 2; (d) service-role-key removal from `server.js` per SPEC-08 §6 + ADR-028 Part F; CI gate `pnpm spec:audit-secrets` lit; service-token issuer in gateway; (e) BullMQ scheduled sweep replaces probabilistic `project_command_log` cleanup per SPEC-24 §1.3; (f) `02-decisions/contracts/` archived per SPEC-27 §5; (g) drawing-primitives schemas + Zod + SVG MVP per SPEC-29 §9; (h) `plugins/lifecycle/` skeleton + first three cross-family rules per ADR-030 Part D; (i) plugin data sandbox path reserved in `.pryzm` per SPEC-26 §11; (j) **the pre-port: rewrite the 5 highest-traffic plan-view operations (selection, drag, snap, pan, zoom) on the new Canvas2D backend per SPEC-30 §5; each must pass the SPEC-30 §2 Medium tier perf budget**; (k) Cesium mount becomes lazy + disposable per ADR-023 Part C. | gap review §6, §10, §11, §13, §22.3, §27, §29 #10–22 |
| **S32** | Legacy 11-wave Visibility-Intent adapter lit (`packages/visibility/legacy-adapter.ts`); new resolver per SPEC-30 §3.1 begins. ESLint rules `pryzm/no-impure-context`, `pryzm/single-frame-owner`, `pryzm/no-react-runtime`, `pryzm/no-direct-three-examples` promoted from warning to **error** per ADRs 022/023/025/026 Phase rollout. RLS policies generator lit per ADR-028 Part E. | SPEC-30 §6, ADR-023, ADR-028 |
| **S33** | New resolver parity-tested vs legacy on the SPEC-11 fixture corpus. Canvas2D backend (overlays) per SPEC-29 §4.2 lit; plan-view consumes `VectorPrimitiveSet`. AI proposal queue lit (`Supabase ai_proposals` per SPEC-24 §1.6, SPEC-28 §5). | SPEC-30, SPEC-29 §4.2, SPEC-28 §5 |
| **S34** | Switch primary to new resolver; legacy retained as feature flag fallback. Symbol layer integration; SPEC-29 §1 backend equivalence gate green at SPEC-30 §2 Medium tier. Plan-symbol producers (`plugins/<family>/plan-symbol.ts`) for all 18 families landed per SPEC-21 Step 8. | SPEC-21 Step 8, SPEC-29 §4.5 |
| **S35** | Hidden-line classifier integrated per SPEC-30 §3.2; perf bench Large tier passes. WebGL2 implementation; WebGPU compute deferred per ADR-025 Part E. | SPEC-30 §2 Large, ADR-025 |
| **S36** | Multi-view sync per SPEC-30 §7; perf bench Torture tier passes. SPEC-29 SVG↔Canvas2D equivalence gate green on full fixture corpus. | SPEC-30 §2 Torture |

### Updated bench gates (this phase)
The S36 bench gate (existing) now also asserts:
- `pnpm bench plan-view-perf` green at all four tiers per SPEC-30 §2.
- `pnpm test packages/visibility/incremental` green (SPEC-30 §7).
- `pnpm bench idle-cpu` shows ≤ ADR-023 §C target idle fps when each library is mounted.
- SVG / Canvas2D / PDF equivalence gate green per SPEC-29 §4.5.
- `pnpm test packages/schemas/__tests__/contexts/*.stability.test.ts` green (envelope stability per SPEC-13 §6).
- `pnpm spec:audit-secrets` green (no service-role keys).
- `pnpm spec:dep-pin three` green (three.js exact pin per ADR-025).
- `pnpm test packages/file-format/migrations` green (file-format migrators per SPEC-26 §6).

### Updated entry/exit criteria
Entry requires Phase 2A's existing exit criteria (no gap-closure prerequisite — Phase 2A held no gap-closure work). Exit to Phase 2C requires: (a) SPEC-30 §2 Torture tier (50,000 elements, 15 fps min) green; (b) SPEC-13/15/21/24/26/27/28/29/30 published; (c) ADRs 022–030 ratified; (d) S31 pre-port green at SPEC-30 §2 Medium tier — **non-negotiable**; (e) `pnpm spec:audit-secrets` and `pnpm spec:dep-pin three` green.

### Schedule risk acknowledgement
S31 is the heaviest sprint of the 36-month plan. If it slips by more than 1 sprint, **K1-2B fires** per ADR-018 T3.5 and the relief valves are ADR-018 T1.7 (PDF-to-BIM degradation at S55) and T1.8 (formula library 24→14 at S41). The expected absorption: 1-sprint S31 overrun, 1 sprint reclaimed at T1.8, net schedule unchanged at Phase 2C entry.

---

*Last updated: 2026-04-27. Owner: Founder + Architecture lead.*
*Predecessor: `phases/PHASE-2A-Q1-M13-M15-NON-ELEMENT-COMPLETION.md`. Successor: `phases/PHASE-2C-Q3-M19-M21-SHEETS-SCHEDULES.md`.*
