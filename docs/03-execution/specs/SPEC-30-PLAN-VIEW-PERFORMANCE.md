# SPEC-30 — Plan-View Performance Budget & Architecture

| Field | Value |
|---|---|
| Status | Active — normative |
| Version | 1.0 |
| Date | 2026-04-27 |
| Owner | Architecture lead + Drawing-engine lead |
| Closes | `GAP-REVIEW-2026-04-27.md §22.3 (PHASE-2B 54-files-in-3-sprints risk), §29 #7,#20` |
| Phases | **2B (the highest-risk sub-project — preparation + pre-port at S31; Phase 2A holds no gap-closure work per 2026-04-27 directive)**, 3A (Visibility-Intent migration) |
| Replaces / extends | SPEC-04 §4 hidden-line; SPEC-29 (consumes vector primitives) |

> Phase 2B is the project's single most likely slip. SPEC-30 makes it tractable by pinning **what the plan view must do**, **how fast**, and **on what budget**, plus the **pre-port migration** that converts the legacy 11-wave Visibility-Intent system without a 6-month freeze. Without this SPEC, "54 files in 3 sprints" is a wish.

---

## §1 What plan view is

Plan view is a 2D top-down projection of the BIM model at a chosen cut elevation, with:
- Hidden-line classification (Cut / Beyond / Hidden / Symbolic).
- Symbol overlay (door swings, window leaves, MEP symbols).
- Annotation overlay (dimensions, tags, leaders, north arrow, scale bar).
- Hatch / poché overlay for cut elements (solid black for cut walls, etc.).
- Visibility-Intent rules (the 11-wave system) applied per element.
- Pan / zoom / select / drag / edit interactivity.

Plan view is the **most-used view in BIM**. It is also where Pascal / Revit / ArchiCAD differentiate from sketchier tools. We commit to **desktop-CAD parity** at GA per `09-AS-IS-VS-TO-BE` D8.

---

## §2 Performance budget (binding contracts)

| Workload | Cold open | Pan | Zoom | Edit feedback |
|---|---|---|---|---|
| Empty plan | < 200 ms | n/a | n/a | n/a |
| Small (50 elements) | < 600 ms | 60 fps | 60 fps | < 50 ms |
| Medium (500 elements) | < 1.2 s | 60 fps | 60 fps | < 80 ms |
| Large (5,000 elements) | < 3 s | 30 fps min | 30 fps min | < 150 ms |
| Torture (50,000 elements) | < 8 s | 15 fps min | 15 fps min | < 500 ms |

Hidden-line cost (BVH-accelerated): < 30% of cold-open budget at every tier.
Symbol layer cost: < 10% at every tier.
Hatch / poché layer cost: < 15% at every tier.

CI bench `apps/bench/plan-view-perf.ts` exercises all four tiers + four operations (cold open, pan, zoom, edit). Any miss > 10% on M-class hardware is a hard fail at S40 onward.

---

## §3 Architecture (the 5-layer pipeline)

```
[1] Source: BIM model + ViewSettings + Visibility-Intent rules
       ↓
[2] Visibility resolver: collapse 11-wave VI into a flat per-element decision
       ↓
[3] Slicer: cut at elevation; classify edges (Cut / Beyond / Hidden / Symbolic)
       ↓
[4] Symbol & hatch producers: per-family symbol emission + cut-element hatching
       ↓
[5] Renderer: SVG (paint) / Canvas2D (overlays) / PDF (export)
```

Each stage is **pure, headless, and benchable**. The renderer is the only stage that touches the DOM.

### §3.1 Stage [2] — visibility resolver
- Input: model + `ViewSettings` + `VisibilityIntent[]`.
- Output: `ResolvedVI` (per element: visible Y/N, line style, override category, override fill).
- Implementation: `packages/visibility/resolver.ts` (pure).
- Per-element complexity: O(rules × elements) = O(rN). Optimised by BVH-frustum culling: rules with bounding-area constraints touch only intersecting elements.
- Performance budget: < 50 ms for 5k elements + 50 rules.

### §3.2 Stage [3] — slicer
- Input: model + cut elevation.
- Output: classified 2D edges (Line / Polyline) per element.
- Implementation: `packages/geometry-kernel/edge-projection.ts` (lit at S31 per PHASE-2B §Gap-Closure; Phase 2A holds no gap-closure work per 2026-04-27 directive).
- BVH-accelerated; per-element complexity O(faces × log n).
- Performance budget: < 30% of cold-open per §2.

### §3.3 Stage [4] — symbol & hatch
- Input: classified edges + per-family symbol producers (per SPEC-21 Step 8) + hatch styles.
- Output: `VectorPrimitiveSet` per layer.
- Implementation: `plugins/<family>/plan-symbol.ts` + `packages/geometry-kernel/poche.ts` (lit at S31 per PHASE-2B §Gap-Closure).

### §3.4 Stage [5] — renderer
- SVG backend for paint (per SPEC-29 §4.1).
- Canvas2D backend for overlays (snap, hover, selection box) — DOM-attached for fast immediate-mode draw.
- PDF backend for export.

---

## §4 Plan-view envelope (per SPEC-13 §5.1)

```ts
interface PlanViewContext extends BaseContext {
  family: 'planView';
  viewId: ViewId;
  cutPlane: { z: number; range: { below: number; above: number } };
  visibleElementIds: ReadonlyArray<InstanceId>;
  visibilityIntent: ResolvedVI;          // already collapsed
  scale: ViewScale;                      // 1:50, 1:100, etc.
  symbolLibrary: SymbolLibraryRef;
  styles: { stroke: StrokeStyleEnvelope; hatch: HatchStyleEnvelope; text: TextStyleEnvelope };
  cropRegion?: Polygon2D;                // clip to a sub-area
  scopeBox?: BBox3D;                     // 3D crop
}
```

Producer signature:
```ts
function producePlanView(ctx: PlanViewContext): Result<VectorPrimitiveSet, KernelError>;
```

---

## §5 The pre-port (S31, the first sprint of Phase 2B) — what unblocks the rest of 2B

The gap review identified "54 files in 3 sprints" as the project's most likely slip. Per the 2026-04-27 directive Phase 2A holds no gap-closure work, so this SPEC mandates that **the entire first sprint of Phase 2B (S31) is the pre-port** — rewriting the **5 highest-traffic plan-view operations** on the new canvas host **before** the 11-wave VI engine is touched:

1. **Selection** — pick + multi-pick + lasso.
2. **Drag** — single + multi-element.
3. **Snap** — endpoint / midpoint / centre / perpendicular / tangent / nearest.
4. **Pan** — touch + wheel + middle-mouse.
5. **Zoom** — wheel + pinch + zoom-to-fit + zoom-to-selection.

Implementation:
- Use Canvas2D backend (per SPEC-29 §4.2) for the overlay layer.
- Each operation gets its own bench (`plan-view-select.ts`, ...).
- Each operation passes the §2 budget at the Medium tier before the VI port begins.

If any of the 5 misses budget after 2 weeks, K1-2B fires (per ADR-018 T3.5 — date slip option).

Only after the 5 are green does the **VI engine port** begin (S32–S34). The legacy 11-wave system is reused via an adapter (`packages/visibility/legacy-adapter.ts`) until the new resolver hits parity, then the legacy is deleted at S58 per SPEC-27 §4.3.

---

## §6 Visibility-Intent — the 11-wave system

The legacy 11-wave system is documented in `09-AS-IS-VS-TO-BE` §6. The new architecture preserves the **rules** but replaces the **execution model** with the resolver in §3.1.

### §6.1 Wave order (frozen)
1. Element-class visibility (e.g. "hide ceilings").
2. Workset / discipline group filter.
3. Phase / construction-phase filter.
4. Design-options filter.
5. Filters by category-rule.
6. Filters by per-instance override.
7. Override graphics by category.
8. Override graphics by element rule.
9. Override graphics by per-instance.
10. Reveal hidden category (temporary).
11. Reveal hidden instance (temporary).

The new resolver runs all 11 in priority order, with per-element decision short-circuiting where possible.

### §6.2 Migration
- Legacy adapter (S32).
- Parallel parity testing (S32–S33).
- Switch primary at S34; legacy retained as fallback flag.
- Delete legacy at S58 (per SPEC-27).

---

## §7 Multi-view sync (Phase 2B end)

When two views are open (e.g. plan + section), edits in one must propagate to the other within one frame.

- Implementation: shared scene-cache + per-view resolver re-run (only for affected elements).
- Re-run scope: `packages/visibility/incremental.ts` accepts a delta from the command bus and re-resolves only impacted elements.
- Performance budget: < 50 ms incremental update for 5k-element model.

---

## §8 Print / export integration

- Plan view → PDF backend (per SPEC-29 §4.3) for sheet export.
- Print preview → print-canvas backend (per SPEC-29 §4.4).
- Export-vector to DXF / SVG (Phase 3B per ADR-018 T2.1; if cut, DXF moves to plugin).

---

## §9 Anti-patterns this SPEC forbids

- **No `requestAnimationFrame` in producers / resolver / slicer.** Only the renderer schedules frames. Producers are pure.
- **No DOM in stages [2]–[4].** DOM is renderer-only.
- **No "render everything every frame."** Incremental re-resolve + dirty-rect repaint is mandatory.
- **No skipping pre-port (S31) "to save time."** The S31 pre-port is the single largest risk-reducer in Phase 2.

---

## §10 Phase rollout

| Sprint | Deliverable |
|---|---|
| **S31** (Phase 2B start; Phase 2A holds no gap-closure work per 2026-04-27 directive) | **The heavy ratification + pre-port sprint:** edge-projection.ts + poche.ts pure (lifted from former 2A scope); SPEC-30 perf bench skeleton lit; **pre-port: 5 operations (selection, drag, snap, pan, zoom) on Canvas2D backend; bench passes Medium tier — non-negotiable**; plus the broader §Gap-Closure ratification work (SPEC-13/15/21/24/26/27/28/29/30 + ADRs 022/023/025/026/028/030) per PHASE-2B §Gap-Closure. |
| S32 | legacy VI adapter; new resolver §3.1 starts. |
| S32 | new resolver parity-tested vs legacy. |
| S33 | switch primary to new resolver; legacy as flag. |
| S34 | symbol layer integration; SPEC-29 §1 backend gate green at Medium. |
| S35 | hidden-line classifier integrated; perf bench Large tier passes. |
| S36 | multi-view sync; perf bench Torture tier passes. |
| S58 | legacy 11-wave VG deleted (per SPEC-27 §4.3). |
| S72 (M36 GA) | all four perf tiers green; SPEC-30 binding contract met. |

---

## §11 Cross-references
- ADR-015 visibility-intent placement; ADR-016 drawing engine; ADR-018 cut list (T3.5 date slip if pre-port misses); ADR-022 backend runtime.
- SPEC-04 drawing engine; SPEC-11 testing (visual gate); SPEC-13 envelopes; SPEC-21 element protocol Step 8 (plan symbols); SPEC-29 vector primitives.
- Phase docs: **PHASE-2A §6.4–§6.5 (foundations); PHASE-2B (the primary phase doc, pre-ported by this SPEC); PHASE-3A §3 visibility-intent migration**.
