# ADR-0023 — Plan-view renderer architecture (Canvas2D, dirty flags, no THREE)

- Status: **Accepted** (2026-04-27)
- Sprint: **S31** (Phase 2B — Plan-view canvas host + dirty-flag rendering, Q2 / M16)
- Authors: PRYZM 2 BIM rebuild
- Subordinate to: **`[strategic ADR-016]`** (drawing engine architecture; Canvas2D is the
  screen back-end of the SPEC-04 vector primitive model)
- Related code-level ADRs: ADR-0003 (FrameScheduler priority vs deadline), ADR-0006
  (idle-continuation budget), ADR-0009 (frozen producer signature),
  **ADR-0025 (S29 plan-view canvas architecture — promoted from skeleton to full impl by this ADR)**
- Related strategic SPECs: `SPEC-04-DRAWING-ENGINE.md`, `SPEC-30-PLAN-VIEW-PERFORMANCE.md`
- Related phase doc: `docs/03_PRYZM3/reference/phases/PHASE-2/2B-Q2-M16-M18-PLAN-VIEW.md` §S31

---

## Context

S29 delivered a **skeleton** plan-view canvas host (a vanilla 2D `HTMLCanvas` driven by
`FrameScheduler` dirty flags — see `ADR-0025`).  S31 promotes that skeleton to the **first
full-sprint implementation** of the plan view: walls + slabs + doors with poché fills
and edge classification, sourced from the S30 `packages/geometry-kernel/edge-projection.ts`
and `packages/geometry-kernel/poche.ts` modules, rendered through a dedicated
`PlanViewRenderer` class.  Three architectural questions need a code-level decision before
the Canvas2D back-end is the **only** screen renderer for plan view:

1. **Does the host walk stores directly, or does it consume a pre-projected scene?**
   The Canvas2D back-end of SPEC-04 §3.1 must consume a primitive stream;
   in S31 the upstream is the S30 `Edge2D[]` + `PocheFill[]` classifier output, not
   the full `Primitive[]` stream of SPEC-04 §2.1 (that arrives in S35 once
   `packages/drawing-primitives/` ships).
2. **What is the coordinate convention** between world XYZ (the L1 store space)
   and canvas pixel xy?  A wrong-sign on Z silently produces a mirrored render
   that is visually identical at small zooms but fails the visual-diff CI gate
   (per Kill-switch K2B-1 — see PHASE-2B §S31 Exit Criteria).
3. **How does the renderer integrate with the FrameScheduler so the
   60 fps interactive / 0 fps idle invariant holds across both 3D and 2D
   surfaces simultaneously?**

`SPEC-30 §9` ("Anti-patterns this SPEC forbids") sets the constraints:
no `requestAnimationFrame` outside the renderer, no DOM in the producers,
no "render everything every frame".  This ADR answers the three questions above
within those constraints.

---

## Decision

### §1. The plan-view screen renderer is **vanilla `HTMLCanvas` 2D** — not THREE

(Reaffirms `ADR-0025 §1` for S31 onward; cites `[strategic ADR-016]` §"Alternatives
considered — THREE.js LineMaterial/SVGRenderer".)

- THREE.OrthographicCamera was rejected: it forces a second WebGL context per plan tab,
  buys nothing for line-art (no shading, no texturing), and can't model hatches /
  ISO-13567 layers / dimensional fonts.
- SVG was rejected for the **screen** back-end (text-anchor + line-join inconsistency
  across browsers; per-element DOM cost dominates above ~5,000 segments) but accepted
  for the **export** back-end (per `[strategic ADR-016]`; ships parallel S31 SVG +
  S33 PDF).

### §2. Coordinate convention: world XZ → canvas xy with **Z-flip**

(Closes PHASE-2B §S31 D6 "common visual-diff failure cause #1: coordinate flip error".)

```
   canvas.x  =  world.X
   canvas.y  = -world.Z       ← the Z-flip
```

Reasoning: world Z increases away from the viewer (right-handed Y-up); canvas Y increases
downward.  Therefore plan-view pixels are computed with a sign inversion on Z.  Applied
**once** in `PlanViewRenderer` immediately after `applyTransform(ctx)`; every
draw call within the renderer uses positive coordinates from the projected
`Edge2D` / `PocheFill` outputs and the renderer flips Z at the `moveTo` / `lineTo`
boundary.  Doing the flip later (e.g. inside the kernel projection) would invalidate
the parity contract with the SVG back-end (which uses world coords directly in its
`viewBox`) and the bake-worker tests (which assert byte-identical projection output
between Node and browser).

### §3. Dirty-flag drive — the FrameScheduler is the **only** rAF owner

(Reaffirms `ADR-0003`; extends to the new renderer + camera split.)

- `PlanViewCanvasHost` exposes a `requestRender()` method that flips a single
  `dirty: boolean` and asks the `FrameScheduler` for one `'interaction'` frame.
- The next `'render'`-priority tick drains the flag; if the flag is `false` the
  draw is skipped.
- `PlanCamera` exposes an `onDirty?: () => void` hook fired on pan / zoom; the
  host wires that hook to its own `requestRender()`.  The camera itself owns
  no rAF, no `setInterval`, no event listeners (kept pure — DOM event wiring
  lives in the host so the camera stays bake-worker-safe and unit-testable).
- Element-store mutations (wall / slab / door / window / room / annotation /
  dimension / structural / level) trigger `requestRender()` through the standard
  `subscribeDirty` channel.  No store walk in the render path — the host
  snapshots once per frame and hands the snapshot to the renderer.

The combined effect is the binding contract from `SPEC-30 §2`: 0 fps idle,
> 55 fps p95 on the Medium tier (500 elements) at the S31 exit gate,
< 16 ms steady-frame at the Large tier (5,000 elements) at the S35 exit gate.

### §4. The host / renderer / camera split

```
plugins/plan-view/src/
  CanvasHost.ts            — abstract base (lifecycle, dirty flag, scheduler wiring)
  PlanViewCanvasHost.ts    — concrete host (stores, edge-projection, poche, snapshot)
  PlanViewRenderer.ts      — pure-Canvas2D renderer (background, poche, edges, room fills)
  PlanCamera.ts            — pure pan / zoom + onDirty hook; no DOM
  projection.ts            — legacy S29 fallback projection (kept for skeleton parity)
  LevelStore.ts            — per-session active-level registry
```

Why split renderer from host?

- The host is the **integration shell** (stores + scheduler + DOM event wiring +
  ResizeObserver + DPR scaling).  It is browser-only.
- The renderer is **pure-Canvas2D draw**.  It is browser-only too, but it
  consumes only a `PlanViewData` snapshot — no stores, no scheduler.
  This makes the SVG (S31 D9) and PDF (S33) back-ends drop-in replacements:
  the upstream pipeline (host → snapshot → primitive stream) is identical;
  only the renderer changes.
- The camera is **pure data + a callback**.  No DOM ⇒ unit-testable in Node ⇒
  the supplemental view-template / view-resolution tests at S33 onward can
  drive cameras without spinning up a browser.

### §5. Feature flag `featureFlags.plan_view_v2` (operational from D1 S31)

- Per-project boolean in the project manifest.
- Default `true` for new projects; existing projects ship with the value
  written by the Phase 2A → Phase 2B migration step (always `true` per
  PHASE-2B §S31 D8 — but the toggle exists so a regression in the new
  plan view falls back to PRYZM 1's plan view without code changes).
- Toggle can be flipped at runtime; the editor watches the manifest and
  swaps the canvas host on next view open.
- Risk register reference: `R2B-06` ("toggle causes crash on older
  projects"); mitigation: test on 10 PRYZM 1 projects at S31 D1.

### §6. Visual-diff CI harness (`apps/bench/visual-diff-plan.bench.ts`)

- Runs Playwright screenshots against PRYZM 1 plan-view reference images
  in `tests/visual-diff/plan-view/`.
- Tolerance tightens sprint-by-sprint:

| Sprint | Tolerance |
|---|---|
| S31 | < 10 px (foundation — only walls / slabs / doors; annotation not yet rendered) |
| S32 | < 5 px (annotation renderer integrated) |
| S33 | < 2 px (Contract 44 closes) |
| S35 | < 1 px (full primitive parity with SVG / PDF back-ends) |

- S31 ships the harness skeleton (Playwright invocation + per-case tolerance
  threshold) + 5 baseline cases.  Hard-fail on > 20 px at D5 fires
  Kill-switch K2B-1 per PHASE-2B §S31.

---

## Consequences

**Positive:**
- One vector model, three back-ends per `[strategic ADR-016]` — bug fixed once
  applies to all three; SVG / PDF are drop-in replacements at S31 D9 / S33.
- The renderer is data-in / data-out (no GPU, no stores) — easy to test,
  easy to bench, easy to swap.
- Camera is pure data — works in bake-worker for view-template tests at S33.
- Feature flag means S31 can iterate aggressively: any regression toggles back
  to PRYZM 1 plan view, not a production incident.

**Negative:**
- Three back-ends to keep at parity ⇒ visual-diff CI gate is the only check
  that catches drift; mitigated by the snapshot suite at
  `packages/drawing-primitives/__tests__/snapshots/` (lands S35).
- The Z-flip lives in the renderer, not the kernel ⇒ a future renderer that
  forgets it produces a mirrored output that passes lint but fails CI.
  Mitigated by an inline assertion in `PlanViewRenderer` and a documented
  test-vector in `__tests__/plan-view-renderer.test.ts`.

---

## Alternatives considered

### Move the Z-flip into the kernel (`edge-projection.ts`)
Rejected: invalidates the parity contract with the SVG back-end's `viewBox`
which uses world coords directly, and breaks the bake-worker test invariant
("Node and browser produce byte-identical projection output").

### Single monolithic `PlanViewCanvasHost` (no renderer split)
Rejected: blocks the SVG / PDF back-ends from reusing the same upstream
pipeline; would need to copy-paste the snapshot logic into each new back-end.

### THREE.OrthographicCamera + custom line shader
Rejected as in `[strategic ADR-016]` — no shading need, second WebGL context
per tab, can't model hatches / ISO-13567 layers / dimensional fonts.

### Defer the feature flag to S35
Rejected: per PHASE-2B §S31 the flag is **operational from D1 S31** so 2B can
be iterated openly without risking existing projects.  Any regression flips
the flag, not a production incident.

---

## References
- `docs/03_PRYZM3/reference/specs/SPEC-04-DRAWING-ENGINE.md` §1, §3.1, §13
- `docs/03_PRYZM3/reference/specs/SPEC-30-PLAN-VIEW-PERFORMANCE.md` §2, §3, §9
- `docs/03_PRYZM3/reference/adrs/ADR-016-drawing-engine-architecture.md`
- `docs/03_PRYZM3/reference/phases/PHASE-2/2B-Q2-M16-M18-PLAN-VIEW.md` §S31
- `docs/architecture/adr/0028-plan-view-canvas-architecture.md` (S29 skeleton; superseded for
  the implementation surface by this ADR — kept for the original architectural rationale)
- `packages/geometry-kernel/src/edge-projection.ts` (S30)
- `packages/geometry-kernel/src/poche.ts` (S30)

---

## Amendment 2026-04-28 (W-07 — `plan_view_v2` runtime gate)

**Source**: W-07 of `docs/03_PRYZM3/reference/phases/audits/PHASE-2-CLOSE-IMPLEMENTATION-PLAN-2026-04-28.md`.

### v0 fallback policy

The `featureFlags.plan_view_v2` slot in
`packages/persistence-client/src/manifest.ts` (default `true`) is now **observed
at editor bootstrap** via `apps/editor/src/featureFlags/plan-view-gate.ts`.

The flag was previously a manifest field with no runtime consumer.  W-07 wires
it observably — every project open records the active mode as an OTel span
attribute (`pryzm.plan_view.version = "v2" | "v1-fallback"`), and turning the
flag off mounts an explicit fallback panel.

**The PRYZM 1 plan-view fallback target does NOT exist in this repo.** Legacy
`apps/editor` deletion lands at S61 / Phase 3C per
`docs/architecture/adr/0031-s61-staged-legacy-deletion.md`.  Until then,
flipping `plan_view_v2 = false` renders an explicit "no fallback available
in v0" panel rather than silently doing nothing.  This is intentional:

* Telemetry remains observable.
* Misconfiguration is loud (the user sees a panel, not a blank canvas).
* Flipping the flag back to `true` restores the v2 canvas host without any
  rebuild.

### Restoring an actual fallback target

Reactivating a real fallback requires the Phase 3B "legacy preservation" work
to keep the PRYZM 1 plan-view chunk reachable.  That is out of scope for the
Phase 2 close.

<!-- code-anchor: pattern="apps/editor/src/featureFlags/plan-view-gate.ts" expect="present" min="1" -->
<!-- code-anchor: pattern="apps/editor/__tests__/featureFlags.plan-view.test.ts" expect="present" min="1" -->
