# ADR-0029 — Vector primitives + multi-backend rendering (Canvas2D / SVG / PDF / Print-Canvas)

- **Status**: Accepted (post-Phase-2B closeout, 2026-04-27)
- **Sprint**: S31-bis (skeleton); deepening at S37 (PDF native), S40 (Print-Canvas), S55 (SVG)
- **Subordinate to**: ADR-0023 (`plan-view-canvas2d-renderer`), ADR-0028 (`plan-view-canvas-architecture`)
- **Related**: SPEC-29 §3 (vector primitive set), SPEC-29 §4.3 (PDF native), SPEC-29 §4.5 (backend-equivalence visual-diff)

---

## 1. Context

The Phase 2B audit (2026-04-27) found that:

1. `packages/geometry-kernel/src/edge-projection.ts` documents itself as a *classifier* and explicitly says "Downstream, `packages/drawing-primitives/` emits the actual primitive stream".
2. `packages/drawing-primitives/` did not exist.
3. The Canvas2D draw path inside `plugins/plan-view/src/PlanViewRenderer.ts` collapsed classifier + primitive emitter into the same call.
4. `11-GAP-CLOSURE-PLAN.md §2.4 #24` claimed "Vector primitive set + 4 backends (SVG, Canvas2D, PDF, Print-Canvas)" was closed; only Canvas2D existed.

This contradicted SPEC-29 §3 + §4 and made the headline gap-closure count wrong.

## 2. Decision

Land the package as a **typed primitive stream** with one live backend (Canvas2D) and three typed-stub backends (SVG, PDF, Print-Canvas) carrying explicit sprint markers and `BackendNotImplementedError`. The kernel classifier output (`ClassifiedEdge[]`) flows through a pure `classifierToPrimitives` adapter into a `PrimitiveStream`; backends consume the stream.

| File | Role | Layer | Status |
|---|---|---|---|
| `packages/drawing-primitives/src/types.ts` | `Primitive` discriminated union (line / polyline / polygon / arc / text / hatch) + `PrimitiveStream` | L4 | live |
| `packages/drawing-primitives/src/classifier-to-primitives.ts` | Pure `(ClassifiedEdge[], PocheFill[]) → PrimitiveStream` | L4 | live |
| `packages/drawing-primitives/src/backends/canvas2d.ts` | Imperative draw against `CanvasRenderingContext2D` | L5 | live |
| `packages/drawing-primitives/src/backends/svg.ts` | SVG 1.1 string emitter | L4 | typed stub — full impl S55 |
| `packages/drawing-primitives/src/backends/pdf.ts` | Native PDF (no SVG round-trip per SPEC-29 §4.3) | L4 | typed stub — full impl S37 |
| `packages/drawing-primitives/src/backends/print-canvas.ts` | DPI-aware print canvas | L5 | typed stub — full impl S40 |

### Equivalence gate (SPEC-29 §4.5)

Until ≥2 backends are live, "equivalence" is undefined. The post-2B closeout lands a *self-equivalence* harness: the Canvas2D backend feeds a `RecordingCanvasContext` (a `CanvasRenderingContext2D`-shape stub that records every method call to a JSON command stream). Snapshot fixtures live at `tests/visual-diff/plan-view/fixtures/`. The same fixtures get re-run when SVG / PDF / Print-Canvas land — pixel-equivalence promotes to *stream-equivalence* until Playwright PNG diff lights up at S37 D5.

## 3. Consequences

- The `edge-projection.ts` header comment is now factually true.
- `PlanViewRenderer.ts` continues to draw Canvas2D directly (no refactor) — the new package is *additive*. Refactoring the renderer to consume the primitive stream is a separate sprint (S37 D2).
- `11-GAP-CLOSURE-PLAN §2.4 #24` is reclassified as **Partial** until S37 / S40 / S55.
- `BackendNotImplementedError` is exported and asserted by the stub backend tests so any caller that tries to use a not-yet-implemented backend fails loudly.

## 4. Open items (next sprint)

- S37 D2 — refactor `PlanViewRenderer` to emit through `PrimitiveStream` instead of direct `ctx.*` calls; gates on the recording-canvas harness staying green.
- S37 D3 — first real SVG / PDF backend.
- S40 D1 — Print-Canvas backend with DPI scale + bleed.
- Post-GA — WebGPU compute backend (SPEC-30 §3.2).
