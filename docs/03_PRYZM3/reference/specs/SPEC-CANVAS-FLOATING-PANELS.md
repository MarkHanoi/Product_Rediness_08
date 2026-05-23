# SPEC — "Canvas" Floating Panel Cards (movable, glass, preview-inside)

> **Status**: PLAN / proposed spec. **Created**: 2026-05-22.
> **Trigger**: architect — "I want a 'Canvas' panel card where the panels can be
> moved on the project scene — transparent background with preview within the
> card", referencing the miaw `FloatingPanel` / `ConversationCanvas` pattern
> (React + Framer Motion): draggable, resizable, glass panels, click-to-front,
> preview content inside.
> **Governs**: `apps/editor/src/ui/makeDraggable.ts`, Project Hub
> (`ProjectHub.ts` / `ProjectHubTemplates.ts`) and/or an editor floating-panel layer.

## 1. CRITICAL constraint — framework

The pasted reference is **React + Framer Motion** (`useState`, `motion.div`,
`useDragControls`). PRYZM's editor + hub UI is **vanilla TypeScript DOM**
(`document.createElement`, `innerHTML`). **The React code cannot be used
directly** — it is a pattern reference only. The implementation must be vanilla
TS built on the primitives PRYZM already has.

## 2. What PRYZM already has (build ON)

- **`makeDraggable(panel, handleSelector, excludeSelectors, runtime)`** —
  vanilla drag util. Same anchor trick as miaw's FloatingPanel (`convertToPxPosition`
  commits transform→`left/top` on drag start so the corner never jumps).
  Used today by RoomGraphPanel, EvacuationSimulatorPanel, RoomPathfinderPanel.
- **Glass styling** — the platform shell already uses translucent/`backdrop-filter`
  panels (e.g. `plat-hub-dropdown`, the SVP); reuse those tokens.
- **z-order to front** — pattern exists in SplitViewManager / image-panel z-stacks.

## 3. Pattern mapping (miaw React → PRYZM vanilla)

| miaw (React/Framer) | PRYZM (vanilla TS) |
|---------------------|--------------------|
| `FloatingPanel` `motion.div` + `useDragControls` | a `<div class="canvas-panel">` + `makeDraggable` |
| `dragControls.start` from title bar / everywhere | `dragHandleSelector` arg to `makeDraggable` |
| resize handle + `useLayoutEffect` anchor zero | a `.canvas-panel__resize` handle + pointermove/up (mirror SplitViewManager divider drag) |
| `zIndex` prop + `bringToFront` | a small z-order array + `pointerdown` → raise `style.zIndex` |
| `AnimatePresence` fade/scale | CSS transition on opacity/transform (PRYZM has no Framer) |
| glass `rgba(0,0,0,0.32)` + blur | reuse platform-shell glass tokens; **transparent bg** per request |

## 4. Proposed design (TO-BE)

A reusable **`CanvasPanelCard`** (vanilla):
- `position: fixed`, **transparent / frosted-glass** background (`backdrop-filter: blur`,
  thin border, soft shadow), rounded corners.
- A **preview region** inside (project thumbnail, or a live mini-render).
- Drag via `makeDraggable` (whole-card or a grip); **resize** handle (bottom-right);
  **click-to-front** z-order; close button.
- Optional snap-to-grid / remember-position (future: `makeDraggable`'s reserved
  runtime arg → `runtime.persistence.panelLayout`, TODO F.6.5).

**Where it applies (NEEDS CONFIRMATION):**
- **(A) Project Hub** — reimagine project cards as a *canvas* of movable glass
  cards with the preview inside (extends the white-bg preview just shipped).
- **(B) Editor scene** — make in-editor panels (property / preview / data)
  float and move over the 3D scene as glass cards.
The pattern/component is the same; only the host + content differ.

## 5. Phased plan

1. Build `CanvasPanelCard` primitive (vanilla): drag (`makeDraggable`) + resize +
   z-order + glass/transparent CSS + close. Unit-style manual test in isolation.
2. Apply to the chosen host (A or B) with the preview inside.
3. Add resize-anchor robustness (mirror SplitViewManager) + viewport clamping.
4. (Optional) persist last position/size per panel.

## 6. Verification gate

```
1. A panel card renders with a transparent/glass background and a preview inside.
2. Drag the card by its grip → it moves smoothly; corner doesn't jump on first drag.
3. Resize from the bottom-right → top-left corner stays fixed.
4. Click a back card → it raises above the others (z-order to front).
5. Multiple cards coexist and move independently.
```
