# Spike — set-out dimension preview (distance to surrounding walls) while drawing (2026-06-20)

**Founder request:** when creating walls / windows / doors, show a **set-out** reference — a live
dimension (in **blue**) from the element being drawn to the SURROUNDING walls, not only the length
of the wall itself. Today, placing an internal partition gives no feedback on how far the start
point is from existing walls. Like a CAD/Revit *listening / temporary dimension*.

## Spike findings — what exists today

- **Wall draw tool:** `apps/editor/src/engine/views/plantools/WallPlanToolHandler.ts`. Drawing is a
  two-click (or polyline) flow; `_drawWallPreview()` (line ~391) renders the in-progress wall onto a
  **2D overlay canvas** (`CanvasRenderingContext2D`).
- **Coordinate transform:** `planCanvas.worldToScreen(worldX, worldZ) → {sx, sy}` and
  `planCanvas.getPixelsPerUnit()` are the only primitives needed to draw world-space geometry on the
  overlay. The handler already uses both.
- **Existing dimension feedback:** the wall's OWN length renders as a blue (`#1e40af`) `"NNNN mm"`
  label at the segment midpoint (line ~492-503). There is **no** dimension relating the wall to
  OTHER walls — that is the entire gap.
- **`WallDimensionInput`** (§04-12) is a TYPED-length entry (user types a wall length); unrelated to
  set-out distance. Not reusable for this.
- **Existing wall data:** all walls on the level are available via `window.wallStore.getState()`;
  each wall carries a `baseLine` (array of `{x,y,z}` points). Perpendicular/parallel set-out is a
  pure 2D computation over those baselines (drop `y`).

## Design — pure core + thin additive render

The hard part (which wall is the relevant set-out reference + the perpendicular distance) is **pure
2D geometry** and can be unit-tested with NO browser. Split accordingly:

1. **Pure helper** `setOutDimensions.ts` — `computeSetOutDimensions(point, segments, opts)`:
   - Input: the live point (start point first, then cursor), the level's wall segments
     (`{a:{x,z}, b:{x,z}}`), and a search radius.
   - Output: up to 2 orthogonal set-out dims — the nearest wall whose face the point projects onto,
     measured along +X/−X and along +Z/−Z (axis-aligned set-out, the architect's "this partition is
     1200 mm off that wall"). Each dim = `{ fromPoint, toPoint, distanceMm, axis }`.
   - Only walls the point genuinely projects onto (the foot of the perpendicular lies within the
     wall span) qualify — so we never draw a misleading dimension to a wall the point is "past".
   - Deterministic, dependency-free → full unit coverage now.
2. **Render** in `_drawWallPreview()` (additive): for each returned dim, draw a thin **blue dashed
   line** with arrow ticks + a `"NNNN mm"` label, using `worldToScreen`. Blue = set-out reference,
   distinct from the purple wall band + the existing own-length label.

### Why this split is low-risk
- The pure helper is verifiable WITHOUT a browser (unit tests) — the substantive logic ships safe.
- The render is **read-only + additive** — it draws extra lines on the preview overlay. Worst case
  it draws nothing or a wrong line; it CANNOT affect the committed wall geometry or break creation.
- The visual still needs a browser glance to confirm placement/legibility before it's "done" — so
  the render lands behind the same browser-verify gate as other UI work, but with zero downside if
  it's off.

## Extension to windows / doors
The founder named walls + windows + doors. Windows/doors are HOSTED on a wall, so their set-out is
"offset along the host wall from each end / from the nearest opening" — a different (1D-along-wall)
computation. The wall set-out helper is the foundation; the hosted-element set-out is a follow-up
that reuses the same render layer with an along-wall distance. Scope this spike to WALLS first.

## Architectural soundness — checked against the contracts / ADRs (founder ask)

Both implementations were verified against governance before landing:

- **C18 §41 (Element Preview Visual Contract).** The unified-purple `#6600FF` rule binds *creation
  GHOSTS*. A set-out dimension is a **functional measurement**, explicitly the kind §2.4 lists as
  out-of-scope ("edit-operation state colours … green/blue/red … functional, not a ghost"). So blue
  is contract-legitimate. To honour §1 (no inline invented preview colours) the render REUSES the
  existing wall-length-label blue (`#1e40af`) already in `_drawWallPreview`, not a new hex.
- **C18 §5 (preview parity).** Additive — the wall already has a preview; this enriches it, removes
  nothing. No parity regression.
- **C06 (UI shell & tools).** Escape = *cancel the in-progress stroke* (clear points, keep drawing),
  per the `PlanToolHandler.cancel()` vs `deactivate()` split and the §4 keyboard table. The ESC fix
  restores that contract (the modal's capture-phase handler currently usurps it).
- **P2 (single THREE owner).** The helper + render use ZERO THREE — a 2D `CanvasRenderingContext2D`
  overlay. Clean.
- **P3 (single rAF).** No new `requestAnimationFrame`; the render runs inside the existing
  event-driven `_drawWallPreview` (onMouseMove), same as today's length label.
- **P6 (commands are the only mutation path).** The set-out preview is READ-ONLY — it dispatches no
  command and writes no store. It only reads `window.wallStore` to draw a hint.
- **P8 (span per new exported function).** Verified NOT applicable here: NO sibling helper in
  `apps/editor/src/engine/views/plantools/` carries a span, and the L7.5 transitional editor view
  layer is outside the package/plane span boundary (memory: "P8 spans live at the plane boundary,
  not in factories"). Adding a span on a per-mousemove hot path would also be a perf anti-pattern.
- **Layering (8-layer model).** `setOutDimensions.ts` has ZERO imports — pure leaf, no upward
  dependency. Lives in the editor (L7.5) alongside the tool that consumes it.

## Related finding (same session) — ESC during footprint/preview draw "goes off"
`PlanViewToolOverlay._onKeyDown` correctly routes ESC → `activeHandler.cancel()` (clear stroke,
keep drawing) and calls `stopPropagation()` — but `ApartmentLayoutModal`/`HouseLayoutModal` register
their Escape handlers with `{ capture: true }` on `window`, so the modal's capture-phase
`dismiss()` fires FIRST and tears down the whole preview before the tool's cancel runs.
`stopPropagation()` does not stop the capture-phase sibling. Fix candidate (needs browser verify):
the modal Escape handler should no-op while an in-progress plan stroke is active, or the overlay
should claim Escape in the capture phase via `stopImmediatePropagation`. Documented for a follow-up.
