# ADR-0024 — Plan-View Annotation Pipeline (Layout / Committer Split)

**Status**: Accepted (S32, 2026-04)
**Authority**: Subordinate to **`[strategic ADR-016]`** (drawing engine architecture) and **code-level ADR-0023** (Plan-View Canvas2D Renderer).
**Supersedes / refines**: §S32 of `docs/03_PRYZM3/reference/phases/PHASE-2/2B-Q2-M16-M18-PLAN-VIEW.md` (lines 396 – 599).

---

## 1. Context

S31 landed the geometric plan-view renderer (poche, edges, doors, slabs).  Plan view becomes a *technical drawing* only when annotations land — text labels, leader lines, callout boxes, and region fills.  Without them the plan is a "geometry diagram", not a drawing customers can publish.

Two non-negotiable constraints shape the design:

1. **PDF-export pre-pass at S40 must reuse the same layout** (server-side, in `apps/bake-worker/`).  The bake worker has **no DOM, no Canvas, no `requestAnimationFrame`**.  ⇒ the layout step must be a *pure function*.
2. **Visual diff target**: < 5 px on the 30-case fixture for S32 (tightening to < 2 px in S33 once Contract 44 closes).  ⇒ every coordinate that crosses the layout/draw boundary is in **canvas CSS pixels**, deterministic across runs, and Z-flipped exactly once (in the camera projection — not here).

## 2. Decision — Layout / Committer Split

Two files, single direction of dependency:

| File | Responsibility | Layer | Bake-worker eligible? |
|---|---|---|---|
| `annotation-renderer.ts` | Pure layout: `(annotations, camera, w, h) → AnnotationLayout[]` | L4 (pure) | ✅ Yes |
| `annotation-committer.ts` | Canvas2D draw: `committer.draw(layouts)` | L5 (DOM-bound) | ❌ No |

The renderer publishes *only* the `AnnotationLayout` type.  The committer publishes *only* the `AnnotationCommitter` class.  Neither imports the other; both are imported by `PlanViewCanvasHost`.

### Coordinate conventions

- `AnnotationDto` carries world XZ (`y` is world-Z) — matches the kernel's projection output.
- `LayoutCamera.worldToCanvas` is the host's adapter; **it is the single place the Z-flip lives** for the annotation pipeline (the host composes `PlanCamera` with `(x, y) → (x, -y * scale + panY)`).
- `AnnotationLayout` carries CSS-pixel canvas coords (positive-Y down).  The committer draws at identity transform.

The result: text/leader/callout sizes stay sheet-stable through camera zoom (because they're sized in CSS pixels in the layout and drawn at identity in the committer), while regions scale with zoom (because their world polygon is projected through the camera).

## 3. Overlap Resolution

Greedy O(P · N²) nudge:

1. For each text layout `i`, walk earlier text layouts `j < i`.
2. If their AABBs intersect (`text.length × fontSize × 0.55` × `fontSize`), nudge `i.anchor.y` down by `1.2 × fontSize`.
3. Repeat across the array; cap at `MAX_OVERLAP_PASSES = 6` to bound the worst case.

### Why greedy and not force-directed?

Force-directed label placement (D3-style `labeler`) is O(N²) **per simulation step** and **non-deterministic** (label positions depend on iteration order, which varies by floating-point precision and array initialisation).  For a CI visual-diff < 5 px tolerance the non-determinism alone disqualifies it.  Phase-3 may revisit; the layout's `layoutAnnotations` signature is stable enough to swap implementations behind without callsite changes.

## 4. Font and Line-Weight Policy

- **Font family**: `Inter, system-ui, sans-serif`.  Inter is the PRYZM 1 plan-view text font; matching it is what brings the visual-diff text-band under the 5 px threshold (the residual is text antialiasing variance, which is inherently non-deterministic — SPEC-30 §2.4 accepts ≤ 3 px on text pixels).
- **Default font size**: 11 CSS px (matches PRYZM 1's `--pryzm-plan-text-size` token).
- **Default line weight**: 0.5 CSS px for leaders and callout boxes (ISO 128-21 fine line at 1:50 sheet ≈ 0.5 px).
- **Arrowhead**: triangular, 6 px long × 4 px base; angle inferred from the last two waypoints.

## 5. Telemetry

Two named spans wrap the layout and draw passes (`pryzm.plan-view.annotation-layout`, `pryzm.plan-view.annotation-draw`).  The names are constants in `tracing.ts`; the active tracer is a no-op shim until OTel lights at S37 (08-EXECUTION-PLAYBOOK.md §Telemetry).  Swap-in is `setTracer(otelTracer)` from one bootstrap point — no callsite changes.

## 6. Consequences

- ✅ Bake worker can run the layout step server-side (PDF export at S40).
- ✅ Visual diff is deterministic — same input, same output, every CI run.
- ✅ The committer is trivially mockable for tests (we use a recording fake context throughout the suite).
- ⚠️  Greedy overlap is not optimal in pathological clusters (10+ overlapping labels in a 50 × 50 px region).  Acceptable for S32; flagged for Phase-3 enhancement.
- ⚠️  Text antialiasing variance between Canvas2D and PRYZM 1's SVG renderer is inherent (covered by SPEC-30 §2.4 ≤ 3 px tolerance).

## 7. Cross-Reference

- Strategic: `[strategic ADR-016]` — drawing engine architecture
- Code-level: ADR-0023 — Plan-View Canvas2D Renderer (parent of this ADR)
- Spec: `PHASE-2B-Q2-M16-M18-PLAN-VIEW.md` §S32 (lines 396 – 599)
- Risk register: R2B-01 (text antialiasing variance) — mitigation = font-family alignment + 3 px text-pixel tolerance
