# ADR-0089 — Forma scene visual quality (architectural-model look: neutral massing, soft gradient shadowing, sky gradient)

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-06-30 |
| Owner | Geospatial / Cesium Forma view (`apps/editor/src/ui/geospatial`) |
| Builds on | ADR-0088 (§FORMA-AO-OPT-IN · §FORMA-RENDER-ERROR-GUARD) — KEPT intact |
| Tags | §FORMA-SCENE-QUALITY · §FORMA-AO-OPT-IN · §FORMA-RENDER-ERROR-GUARD |
| Contracts | P2 (no `import * as THREE` — Cesium only) · P4 (no `(window as any)` — typed global) · P8 (≥1 span / exported fn — the one new exported fn is a pure span-free string builder; see below) · graceful-degrade discipline |

## Context

The founder wants the Cesium "Forma" 3D site view to look **professional**, matching the
Spacio / Autodesk-Forma reference: clean neutral light-grey massing (not pure-white blown-out),
**soft gradient shadowing** (the #1 ask — ambient-occlusion in the crevices + soft directional
sun shadows), a subtle ground, and a soft vertical sky/background gradient backdrop.

The constraint is the **AO crash history** (ADR-0088): Cesium's Ambient-Occlusion HBAO
post-process fragment shader **fails to compile on some GPU/driver combos**, and Cesium treats a
shader-compile failure as FATAL — it raises `scene.renderError`, shows its error panel, and STOPS
the render loop ("Rendering has stopped"). ADR-0088 shipped AO **default-OFF** behind an opt-in
flag plus a `scene.renderError` guard. That guard must stay — but the founder explicitly wants the
AO "gradient shadowing" look back, safely.

## Decision — §FORMA-SCENE-QUALITY

A "professional architectural model" look delivered as four layers, each safe on both WebGL
backends (Cesium is always WebGL, independent of the BIM editor's WebGPU renderer):

### 1. Palette / materials — clean neutral architectural grey

`FORMA_PALETTE` retuned: ground `#D9D5CE → #DDDCD9` (cooler neutral light-grey, not warm beige),
proposed massing fill `#FFFFFF → #F4F4F2` (soft near-white so the directional shading + AO/contact
gradient define faces instead of blowing out), context fill `#E8E5DF → #D9D8D3` (quiet grey that
recedes behind the brighter proposed mass). Silhouette / boundary unchanged.

### 2. Soft gradient shadowing — AO **default-ON behind the full capability path**

AO is now ATTEMPTED by default because it is the #1 ask — but ONLY through:
(a) `isAmbientOcclusionSupported(scene)` / `WEBGL_depth_texture` feature-detect (existing in
`ensureFormaPostProcess`); (b) a guarded construct; and (c) the unchanged
**§FORMA-RENDER-ERROR-GUARD**, which sheds AO + silhouette and latches `formaPostProcessFaulted`
on the FIRST compile failure while keeping the loop alive. GPUs that compile HBAO get the lovely
crevice AO; GPUs that can't degrade to the robust fallback below — never the render-stop overlay.
The `window.__pryzmFormaAO` typed global stays as an explicit OVERRIDE (set `false` to force-OFF
on a machine known to choke past the feature-detect; set `true` is now redundant with the default).

The **robust, GPU-agnostic** half of the "gradient shadowing" — which holds even when AO can't
compile — is:
- **`scene.fog`** (very light density, high minimum brightness, neutral tint matched to the sky
  horizon): far massing melts into the ground as a gentle depth gradient instead of a hard line.
  This is the reliable "ground-AO / ambient depth" gradient.
- **Softer directional shadow** (`shadowMap.darkness` 0.30 → 0.34 + `softShadows` + a wider PCF
  tap where Cesium exposes it): contact shadows read as a *falloff gradient* under eaves / in
  crevices rather than a stark graphite silhouette. Still clearly present.

### 3. Soft sky/background gradient backdrop

Cesium's WebGL canvas clears to a single flat `scene.backgroundColor`, so a true vertical gradient
sky can't be a scene clear colour. Instead: the viewer is constructed with an **alpha-capable WebGL
context** (`contextOptions: { webgl: { alpha: true } }`); Forma mode sets
`scene.backgroundColor = Cesium.Color.TRANSPARENT`; and the soft vertical sky gradient (cool
off-white top → faintly warmer horizon, with a subtle central radial studio-lift) is painted as a
**CSS background on the container** (`buildFormaSkyGradientCss`), revealed through the transparent
canvas. A GPU/context that ignores `alpha:true` clears opaque to the flat `FORMA_PALETTE.background`
(a clean neutral, never black) — graceful fallback, no crash. Leaving Forma / dispose restores the
container's original opaque background and an opaque scene clear colour, so the photoreal globe is
unaffected.

### 4. WebGPU / WebGL parity

Cesium renders in WebGL regardless of the BIM editor's WebGPU renderer, so there is no
backend-specific code path. Every effect degrades sensibly: AO behind the capability+guard path,
fog/shadows are core GL, the sky gradient is CSS + a transparent clear with a flat-colour fallback.

## Alternatives considered

- **Re-enable Cesium SSAO unconditionally** — rejected: that is exactly the ADR-0088 crash.
- **A real gradient skybox / procedural sky shader** — rejected for a same-day demo: more shader
  surface to compile (the very risk we are avoiding) for a backdrop a CSS gradient nails for free.
- **Radial ground-darkening primitive under each building base** — deferred: fog + soft shadows
  already read as the contact gradient; revisit if the founder wants stronger base grounding.

## Consequences

- The Forma view reads as a clean Spacio/Forma architectural model: neutral massing, soft gradient
  shadows + fog depth, a soft sky-gradient backdrop. The AO crash can never blank the view.
- `FORMA_SHADOW_DARKNESS` (standalone const) is superseded by `FORMA_QUALITY.shadowDarkness` in the
  new `formaSceneQuality.ts` helper, which co-locates the tunable look constants.
- New exported function `buildFormaSkyGradientCss()` is a **pure string builder** with no side
  effects / no async — it carries no OpenTelemetry span by design, matching the span-free
  convention of the CesiumViewport UI helpers it serves (P8 "≥1 span / exported fn" applies to
  cross-module runtime side-effecting fns; this is a deterministic pure formatter).

## STRETCH (not done — clean TODO)

OSM `landuse=park/grass` green spaces + simple tree entourage were scoped as a stretch and left
out of this pass to keep the demo safe; the context-fetch data path (`contextBuildings.ts`,
`contextRoads.ts`, `contextWater.ts`) is the place to add a `contextGreen.ts` sibling later. No
half-built green layer was shipped.
