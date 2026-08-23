# ADR-0359 — An element preview is a DECLARATIVE SUBJECT drawn through ONE shared context

- **Status**: ACCEPTED
- **Date**: 2026-08-23
- **Lane**: OPENUI41 · **Issues**: L-7720 … L-7728
- **Supersedes**: nothing. **Superseded by**: nothing.
- **Governed by**: [C04](../contracts/C04-RENDERING-AND-SCHEDULING.md) (rendering & scheduling),
  [C06](../contracts/C06-UI-SHELL-AND-TOOLS.md) (UI shell),
  [C100](../contracts/C100-MASTER-MATERIAL-DATABASE.md) §2.1/§5,
  [C65](../contracts/C65-ELEMENT-TYPE-SYSTEM.md) §3.4/§3.5, P2, P3.

---

## Context

The founder asked for *"a small preview — a 3D canvas scene of the window we are creating; the
user can navigate the small scene, rotate etc. to interrogate the window (or door), like a 3D
showroom of a library element."*

Three constraints shaped the answer, and one of the three turned out to be **narrower than it
was briefed**.

### The constraint that was overstated — recorded, not quietly relied upon

The lane brief stated: *"P2 is a hard-fail invariant … ⛔ You may not `import * as THREE` in a UI
panel. A mini 3-D canvas written the obvious way fails CI immediately."*

**Measured** — `sed -n '1,110p' tools/ga-gate/check-three-imports.ts`. The gate's pattern is

```
/^\s*import\b.*\bfrom\s*['"]three(?:\/[^'"]+)?['"]/
```

and its own header lists, under *"NOT matched (P2-compliant paths through the owner)"*:
`'@pryzm/renderer-three/three' · the THREE namespace sub-path`.

**P2 is not "THREE may only be USED inside `renderer-three`"; it is "THREE may only be REACHED
through its owner."** `apps/editor/src/ui` already contains three `WebGLRenderer` construction
sites doing exactly that — `furniture-carousel/FurnitureThumbnailService.ts:62`,
`furniture-carousel/FloatingObjectCarousel.ts:294`, `data/PIPRenderer.ts:52` — and the P2 gate
reads **0 violations** with all three present.

⚠ This correction matters beyond this ADR: designing *around* an invariant that does not say what
it was believed to say produces an architecture whose shape nobody can later justify.

### The two constraints that are real

- **P3 — one rAF owner.** `tools/ga-gate/check-raf-count.ts` reads exactly 1 owner
  (`frame-scheduler/src/RafAdapter.ts`). A preview may not run its own loop.
- **Live WebGL contexts are capped.** Browsers commonly permit 8–16 and evict the **oldest** when
  a new one is created. In this application the oldest is **the main viewport**.

---

## Decision

### 1. A preview subject is DECLARATIVE and THREE-free

`OpeningPreviewSubject` is a list of axis-aligned boxes in metres, each carrying a **`materialId`**
(C100 §2.1) and, only for the legacy case, a `fallbackHex`. It contains no THREE type, so the
translation *"what is a window type shaped like"* stays where the window type lives, and the
renderer stays a generic box-and-material drawer that knows nothing about openings.

⭐ **Every dimension comes from `resolveWindowDimensions` / `resolveDoorDimensions`**, whose own
docstrings state *"preview and placement MUST both call this so `preview ≡ placed door`"* (L-127).
Not one number is a literal in the subject builder. **A preview that measured itself would be the
second source of truth L-127 was raised to kill.**

### 2. The renderer is a MODULE SINGLETON with exactly one offscreen context

One `WebGLRenderer` on one 512² offscreen canvas, for the whole application, for its whole life.
Every visible preview is a plain 2-D canvas receiving a `drawImage` blit.

**N panels open ⇒ still exactly ONE context.** A renderer per panel would have been a context
leak against a hard cap whose eviction victim is the founder's main viewport — directly against
the standing constraint *"don't compromise graphics."*

### 3. It renders ON DEMAND. There is no loop.

No `requestAnimationFrame`, no continuous tick listener. A draw is requested on orbit, parameter
edit, mount or resize, and each request is coalesced through
`getFrameScheduler().scheduleOnce('element-preview-draw', …)`, so many pointermove events inside
one frame produce **one** draw.

**An idle preview costs zero frames, zero draw calls and zero GPU time. It is not cheap; it is not
running.**

This is enforceable rather than aspirational because `PreviewSubject.key` names **exactly** the
inputs the image depends on: typing in the Name field does not re-render, and moving the mullion
slider does.

### 4. The port is three methods and no THREE crosses it

```ts
mountElementPreview(host, { subject, heightPx })
  -> { setSubject(s), resetView(), dispose(), el }
```

The shape `SheetEditorRendererBridge` established for the sheet editor: a UI surface that needs
rendering goes through a narrow typed port and never holds a renderer handle.

### 5. `dispose()` RELEASES the context, it does not park it

When the last mounted preview disposes, `renderer.dispose()` + `forceContextLoss()`.

⚠ Parking would be the tempting optimisation and it is the wrong one: **a retained context still
counts against the cap**, and the cap's victim is the oldest context.

---

## Consequences

**Good**

- One context, bounded and released. The main viewport is never the eviction victim.
- Zero cost when idle; P2 and P3 both green with the feature present.
- The showroom lights its pixels from `MATERIAL_CATALOG`'s real colour **and** metalness/roughness,
  so *"materials from the library"* is a rendering fact, not a label.
- A second consumer (inspector, pre-draw picker, marketplace card) needs no new context.

**Costs, stated rather than implied**

- ⚠ **The preview is a SCHEMATIC MASSING of the type, not the placed element.** It shows member
  sizes, subdivision, sill projection, leaf thickness and real materials. It does **not** show the
  wall reveal, the swing arc, the ironmongery or the rebate profile. Driving the real
  `WindowBuilder` would have required faking a wall, a level, a rebuild coordinator and a scene
  for a type that is not placed and may never be saved — §FAKE-MORE-CAPABLE-THAN-REAL.
- Panels draw sequentially into their own 2-D canvases. Many simultaneous previews cost one blit
  each per interaction; only one is ever being interacted with.
- ⛔ The renderer is **not** unit-tested: happy-dom has no WebGL and a mock would be a fake more
  capable than the real thing. P2/P3 are enforced by real gates over the real file; the blit, the
  context release and the visual result are **NOT machine-checked**.

**When to revisit**

- A second consumer appears → lift `ElementPreviewRenderer` + `ElementPreviewCanvas` (which are
  already generic over `PreviewSubject`) into `packages/renderer-three/src/preview/`. They live
  beside their single consumer today deliberately; the family→subject translation stays in
  `apps/editor` regardless, because `renderer-three` must not learn what a window is.
- WebGPU becomes the default backend → the rig gains a backend choice. It is WebGL today because
  the founder's machine reports `GPU: WebGL · webgl-only` and it must work there **first**.
