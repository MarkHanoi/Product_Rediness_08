# SPEC — Multi-Pane View System (design + phased build plan)

> **Stamp**: 2026-07-18 · **Status**: DRAFT (design — governs the C59 build; Phase 1a landed; Phase 1b IMPLEMENTED — 2D-left/3D-right site authoring, single-Cesium re-target, boundary→3D fix — pending founder live verification, L-412 stays OPEN)
> **Trigger**: Founder — *"the user should generally be able to swap from one view to another and project whichever view it wants in EITHER left or right split view, NATIVELY — without shortcuts — super robust for the long run."*
> **Governs / maps to**: [C59 — Multi-Pane View System](../../02-decisions/contracts/C59-MULTI-PANE-VIEW-SYSTEM.md) (normative), [C06 — UI Shell & Tools](../../02-decisions/contracts/C06-UI-SHELL-AND-TOOLS.md) §7, [C04](../../02-decisions/contracts/C04-*.md) (single rAF), audit item **L-412**. Absorbs **L-405** (view-mode switcher registry). Supersedes the narrow "3D-Site-on-right" + "enabler button" ideas.

---

## §0 — TL;DR

Replace the three incompatible view mechanisms (SVP fixed Canvas2D right pane · Cesium-owns-`#container` · MapLibre `inset:0` overlay) with **one** renderer-agnostic **pane host** abstraction: each pane can host **any** view; the user can assign/swap any view into any pane. Build it in **phases**, pure model first (landed), live hosting of the hard singleton case (Cesium) next, registry switcher + full swap after. No shortcuts, each phase verify-gated.

## §1 — The three seams we are unifying (traced, cited)

| Mechanism | File / seam | Assumption that blocks native swapping |
|---|---|---|
| SVP Canvas2D right pane | `SplitViewManager.ts:350–516` (`_buildDOM`), `477` (`appendChild(document.body)`), `493–498` (shrinks `#container` to 60%) | The right pane is a **fixed** `#svp-secondary-pane` that ONLY renders Canvas2D. Auto-opens on project load (`initScene.ts:3794`). |
| Cesium 3D Site / globe | `GISAreaLayout.ts:213,257` (`new CesiumViewport(#container)`), `CesiumViewport.ts:900–919` (container `inset:0` in parent), `setVisible` (whole-container takeover) | Cesium **hard-targets `#container`** and owns the whole thing; mutually exclusive with the 2D map. |
| MapLibre 2D map | `SiteBoundaryMap2D.ts:287–297,668` (`inset:0` overlay appended to `#container`) | A full-container overlay, not a pane-scoped surface. |

The **fix seam** is identical for all three: hand each renderer a **pane element** to mount into, resolved from a registry — not `#container`, not a hard-coded fixed pane.

## §2 — Core abstraction (design)

```
ViewType ──(VIEW_TYPE_REGISTRY)──▶ ViewTypeDescriptor { rendererKind, singleton, label }
PaneLayout : Record<PaneId, ViewType|null>          ← the pure state (reducer in paneViewModel.ts)
PaneHost(paneEl) : mount(viewType) / unmount() / resize()   ← live wiring, delegates to a mounter
mounter(rendererKind) : attaches the ONE renderer instance's canvas into paneEl
```

- **Pure layer (Phase 1a, landed):** `apps/editor/src/engine/views/paneViewModel.ts` — `assignViewToPane` (moves singletons, never clones), `swapPanes`, `validatePaneLayout` (double-mount guard), `resolveHostPane`. Unit-tested (`__tests__/PaneViewModel.test.ts`, 10 tests).
- **Live layer (phased):** `PaneHost` + per-`RendererKind` mounters that RE-TARGET the existing singleton (Cesium viewer, WebGPU renderer) rather than constructing a new one. The pane shell **mirrors** SplitViewManager's split geometry (left/divider/right, divider-drag → `controller.resize`) while hosting arbitrary renderers — it does **not** reuse `SplitViewManager`, which is hard-wired to a Canvas2D plan surface and cannot host Cesium/MapLibre. Phase 1b lands this as `SiteAuthoringPaneShell`; literal reuse/consolidation of the legacy class is deferred to Phase 4.

## §3 — Hard constraints, addressed explicitly

1. **Single Cesium instance (no double-mount).** There is one `CesiumViewport`. Hosting "3D Site" in a pane **re-parents** `#cesium-viewport-container` into the pane element and calls `CesiumViewport.reflowContainer()` (added Phase 1a) to resize. `validatePaneLayout` guarantees only one pane ever claims `cesium`.
2. **Single rAF / P3 — no second frame LOOP (not "no rAF at all").** No pane owns a **persistent** frame loop. Canvas2D panes paint on the composition-root frame bus `pre-render` tick (as SVP already does, `SplitViewManager.ts:242–253`); Cesium runs request-render driven by the same scheduler; WebGPU renders in the one OBC loop. Adding panes adds subscribers, not loops. A **one-shot** `requestAnimationFrame` settle — a single self-cancelling frame used during pane reflow to re-frame after a re-parent/resize (Cesium's reflow primitive, reused in Phase 1b) — is **explicitly allowed**; only a self-re-scheduling per-pane render loop is forbidden.
3. **z-index / DOM ownership.** Pane elements are children of the shell pane-container with explicit `zLayers.ts` layers (C06 §7). Panes **tile** — no overlap. Per-pane chrome (view-picker, facts card, divider) is scoped to its pane.
4. **Resize.** MapLibre auto-reflows (its `ResizeObserver`, `trackResize:true`); Cesium via `reflowContainer()`; WebGPU via OBC world resize; Canvas2D via `PlanViewCanvas.setSize`. Pane resize fans out to the hosted renderer only.
5. **WebGL-fallback perf (founder's box).** The founder runs the WebGL backend. One Cesium pane + one BIM pane is the SAME single Cesium + single WebGPU already shipped — acceptable. Two `webgpu-three` panes (one device) are **forbidden** by the invariant. If continuous 3D during a draw gesture is a perf risk, the pane renders on commit / edit-settle rather than every pointermove (the existing `renderFormaMassing(false)` no-re-fly live path).
6. **No `window as any` (P4).** Any new globals typed in `src/types/globals.d.ts`.
7. **Single INJECTED site-store accessor (P1) — the Bug 2 lesson.** All site-state reads (parcel boundary, envelope, site model) MUST go through ONE shared site-store accessor so every reader and writer lands on the same store instance — never per-call-site direct `runtime.siteModelStore` reads that can diverge. Phase 1b's boundary-not-in-3D bug root-caused here: the boundary was committed into one store, but a reader that had captured a null/stale `runtime` saw an empty store → "no parcel boundary yet"; some call sites trusted `siteDispatch`'s module globals while others read `runtime.siteModelStore` directly, and the two silently diverged. **Terminal ideal (what this constraint mandates):** the site subsystem is handed the **real, composition-root-threaded runtime by injection** (`mountGISArea(props, {runtime})` / `setSiteRuntime(runtime)`), and the single shared `getSiteModelStore()` accessor reads from that injected runtime — the P1 single-composition-root rule applied to site state. **Transitional debt (NOT the ideal):** the `runtime ?? window.runtime` window-fallback shipped by the L-412 fix (`5fe0fa07`) is **time-boxed migration debt**, not doctrine. It exists only because `initUI.ts:2820` deliberately passes `createMainLayout(props, null)` (the Phase B.2 / S73-WIRE gate — threading the real runtime there would prematurely activate ~30 half-migrated child paths), so the captured runtime is null and site code reaches for `window.runtime`. That window reach-through is tolerated ONLY until Phase C threads the runtime and MUST be removed then — tracked as **L-413** (see C59 §2 invariant 7).

## §4 — Phased plan (verify-gated) — mirrors C59 §4

- **Phase 1a — Pure core. ✅ LANDED (this pass).** `paneViewModel.ts` + `PaneViewModel.test.ts` (10 tests) + `CesiumViewport.reflowContainer()`. Zero behaviour change. **Gate:** tsc clean + vitest green.
- **Phase 1b — 3D Site hostable in either pane. IMPLEMENTED — awaits founder live confirmation.** Minimal `PaneHost` (`SiteAuthoringPaneShell`) that **mirrors** SplitViewManager's split geometry (left/divider/right, divider-drag → `controller.resize`) while re-parenting the single Cesium container into a pane element, driven by the pure model — `SplitViewManager` itself is not reused (Canvas2D-only; literal consolidation is Phase 4). Recreates the founder's original ask (2D map LEFT · live 3D Site RIGHT · envelope visible during authoring) via the GENERAL host. **Built this pass:** 2D-left/3D-right site authoring, single-Cesium re-target, boundary→3D fix (single resolved site-store accessor, §3 constraint 7). **Gate:** code-trace + host unit tests done; founder browser-confirms 2D-left/3D-right + purple envelope live (pending — L-412 stays OPEN until then).
- **Phase 2 — Registry-driven switcher (absorbs L-405).** `mountResultToggleBar` → `VIEW_TYPE_REGISTRY`-backed per-pane view-picker; assignment via a view-state command (P6). BIM plan + BIM 3D become pane views. **Gate:** switcher tests; founder confirms swap 2D↔3D↔plan in either pane.
- **Phase 3 — Full swap-any-view-any-pane + N-up.** WebGPU BIM 3D re-targetable into a pane; per-pane camera state (`MultiViewCameraManager`/`ViewCameraStateStore`); optional 3rd/4th pane; per-pane persistence. **Gate:** per-pane camera + persistence tests.
- **Phase 4 — Consolidation.** Retire the three legacy container-owner code paths once everything routes through `PaneHost` — including the **literal retirement of `SplitViewManager`** (whose split geometry Phase 1b only *mirrors*), collapsing the mirrored geometry onto one shared implementation. **Gate:** regression pass; delete-only diffs.

## §5 — Acceptance (founder, per phase)

- **1a:** N/A live (pure) — CI green.
- **1b:** New project → 2D map LEFT + 3D Site RIGHT; draw/select a Barcelona parcel on the left → boundary + purple envelope + "Estimated" facts card appear on the RIGHT, live. Move 3D Site to the LEFT pane → it moves (not clones), 2D map shifts right.
- **2:** From any state, pick any view for any pane from the pane's view-picker; swap left↔right.
- **3:** Each pane keeps its own camera; reopen the project → panes restore.

## §6 — Out of scope (this design)
Real DK/ES zoning ingestion (L-399/L-400), generate-inside-envelope (L-401), presentation render tier (L-379). Those ride their own tracks and simply become **views** the pane host can mount.
