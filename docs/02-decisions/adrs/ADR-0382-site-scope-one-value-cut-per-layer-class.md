# ADR-0382 — The 3D-Site SCOPE is ONE value, and it is cut per LAYER CLASS

**Status:** PROPOSED — Phase 1 (design + pure parts) landed; Phase 2 (render-path wiring + the
slider) gated on the extent lane; four rulings await the founder (§Q).
**Date:** 2026-09-07 · **Lane:** SCOPE-SLAB · **Issue:** L-645 (re-opened with the founder's
2026-09-07 wording) · **Grounds:** [`AUDIT-3D-SITE-SCOPE-CROP`](../../03-execution/plans/AUDIT-3D-SITE-SCOPE-CROP.md)
· **Binds:** [C12 §13](../contracts/C12-GEOSPATIAL.md) · **Absorbed into:**
[SPEC-3D-SITE-PRODUCTION-CONTEXT §7](../../03-execution/specs/SPEC-3D-SITE-PRODUCTION-CONTEXT.md)
· **Supersedes:** the retired §CTX-EARTH-SLAB approach (commits `392601e6` → `1b366ed2`)
· **Coordinates with:** lane CONTEXT-EXTENT-2X (L-13058) — `contextExtentBudget.ts`'s
`SiteContextScope` and `CesiumViewport.setContextScope`.

| Field | Value |
|---|---|
| Contracts | C12 (§7 photoreal clip · §9 SiteFrame · §12 ground layers · **§13 scope**), C19 §2.1/§4.1 (site model + commands), C57 §1.5/§1.9 (honesty), C59 §1.4/§2.10 (per-pane chrome, one viewer), C47 (file format additive), P2/P4/P6/P8 |
| Principles | ONE owner of the scope value · nothing outside the scope is constructed · inside is complete or the product says what was dropped, with the numbers |

---

## ⭐ For the founder — one paragraph

> **The 3D-Site gets a slider for the scope, circle or rectangle, and everything outside it is
> gone — terrain, ground, sea, roads, buildings, trees, people — cut on a clean vertical edge with
> a neutral slab side, on a flat pale background.** The retired attempt cut only the globe; this
> design cuts every layer at the place each one can actually be cut, from ONE stored value the
> slider writes through one command. Inside the scope every mapped feature is drawn or the product
> prints how many the cap dropped and at what scope it would not. Four things are yours to rule on
> (§Q): the default extent (complete ≈ 900 m vs 1781 m), circle vs rectangle by default (we say
> rectangle), whether the scope also applies on the photoreal globe (we say no), and whether the
> building itself is ever cropped (we say never).

---

## Context (the audit's headline, not a restatement)

The retired §CTX-EARTH-SLAB cut the globe surface to a disc and nothing else. That was doomed by
construction: measured against the shipped Cesium 1.143.0, `clippingPolygons` exists on `Globe`,
`Cesium3DTileset` and `Model` **only** — never on a `Primitive`, a `GroundPrimitive`, or an entity
`polygon` / `corridor` / `wall` — and on the 3D Site every ground layer is an entity at absolute
height (land-use ~8 km, sea ~11 km, parks, roads, rails, waterways) and every instanced tier is a
`Primitive` (far buildings, trees, people, lamps). The tan skirt wall was a LIT entity under the
Forma key light, which is what read as the "red ring". And the disc was cut at one radius while
each layer stopped at its own — the scope was never one value.

While this lane ran, CONTEXT-EXTENT-2X minted a runtime `SiteContextScope` and five
`min(scope, ceiling)` radii, which is the radial-cull half of the answer and the second scope type
in one day. This ADR converges the two on one persisted value rather than letting them rival.

---

## Decisions

### D1 — ONE value: `SiteModel.scope`, project frame, centred on the site frame origin

`packages/schemas/src/site/SiteScope.ts` — `SiteScopeSchema = { shape:'circle', radiusM } |
{ shape:'rectangle', halfWidthM, halfDepthM }`, persisted as `SiteModel.scope` (nullable, default
`null` = not authored; C47-additive). The centre is the site frame origin
(`resolveSiteFrameOrigin`, C12 §9 — never a re-read geocode) and the frame is scene-XZ / project
north, so a rectangle stays aligned with the parcel's dominant edge and is rotated onto true north
by θ exactly once, at the frame boundary. There is NO centre field and NO rotation field: both
would be a second authority for a fact the SiteFrame owns.

**Field vocabulary is the extent lane's, verbatim — and the two are now ONE type.** After the
extent lane landed (`854cbdd7` + `11426e2a`), `contextExtentBudget.ts` declares
`export type SiteContextScope = SiteScope`, its `scopeOuterRadiusM` wraps the one body in
`siteScope.ts` (adding only the fallback and the range clamp the leaf owns), and it exports
`SITE_SCOPE_RANGE` — the object `resolveSiteScope` is handed. A stored value therefore reaches
`CesiumViewport.setContextScope` with no adapter, and `setContextScope` is the value's SINGLE entry
point into the context load (D8). One value, one owner, no adapter.

The write path is `site.setScope` (`packages/stores/src/site-commands/siteSetScope.ts`), the only
mutation of `SiteModel.scope` (P6); it emits `site.scope-changed`. The read path is
`SiteModelStore.getScope()` → `resolveSiteScope(stored, range)` (`siteScope.ts`), which is total:
`null` → the range's fallback; out-of-range → clamped, shape-preserving, with a note the product
prints; a non-scope → the fallback with a note. The RANGE (150 … 1781 m today) is a measured
tile-fan-out fact owned by `contextExtentBudget.ts` and is passed in, never re-stated.

### D2 — Rectangle by default; both shapes; a circle IS its polygon

**Default: rectangle.** It is what the founder's reference shows, it matches the parcel's frame
(the frame walls are orthogonal in), and it has no sagitta question. The toggle keeps both;
`convertScopeShape` is containment-preserving in both directions (circle → the square that contains
it; rectangle → the disc whose POLYGON contains it — half-diagonal / cos(π/n), not the bare
half-diagonal, or a corner building would be cut by the toggle that promised to keep it).

**THE ONE-POLYGON RULE (C12 §13.2).** A circle is rendered, clipped and tested as the n-gon
`scopePolygonXZ` emits — n from a 0.25 m sagitta bound, a multiple of 4, in [32, 256] — never as the
analytic circle. Otherwise an instance whose centre passes `x²+z² ≤ r²` can sit up to
r·(1 − cos π/n) outside the polygon the globe was cut to (1.1 m at r = 900 m, n = 64): a tree
floating past the slab edge. `createScopeContainment` answers with the polygon and uses the circle
only for fast paths that agree with it.

### D3 — The mechanism per layer class (from the audit's §4)

| Class | Layers | Mechanism |
|---|---|---|
| A · globe surface | terrain (baked or flat), base colour | `globe.clippingPolygons` = ONE polygon from `scopePolygonLatLon`, `inverse:true`, feature-detected (`ClippingPolygonCollection.isSupported`); on failure → NO clip and NO slab side (never a half-slab) |
| B · slab side + floor | new | a `Primitive`: `WallGeometry` on the scope ring (top = terrain sampled along the ring in ONE `GroundSampleBatcher` flight + 0.3 m lip; bottom = min(top) − 60 m) + a `PolygonGeometry` floor cap; `PerInstanceColorAppearance({ flat: true, translucent: false })`; `ShadowMode.DISABLED`; colour **`#E6E6E3`** |
| C · flat ground entities | land-use, sea (+ holes), parks, water areas, waterways, roads, rails | GEOMETRIC pre-clip at build (`scopeClip.ts`: `clipRingLonLat` / `clipPolylineLonLat`) — nothing outside is constructed |
| D · extruded footprints | near shadowed, near demoted, far instanced | GEOMETRIC pre-clip of the footprint ring; extrude to the feature's own height — a straddling building becomes the clean vertical section |
| E · instanced points | trees, canopies, lamps, people, furniture | centre-in-scope (`filterPointsLonLat`), dropped count printed |
| F · photoreal tileset | Google 3D Tiles | NOT applied (D6) |
| G · subject | parcel ring + cues, massing, envelopes, the BIM model, analysis overlays | NEVER cut; the slider floor keeps them inside |
| H · outside | sky / background / fog | the existing pale CSS backdrop (sky, atmosphere, sun, moon already off in Forma); `fog.enabled = false` while a scope is active |

### D4 — The slab side cannot read as a ring, by construction

The retired skirt was a `wall` ENTITY with a `Color` material — LIT by the Forma `DirectionalLight`
— in `FORMA_PALETTE.ground` (a warm tan at the time), seen edge-on at grazing angles. Class B is a
`Primitive` with `PerInstanceColorAppearance({ flat: true })`: flat = unlit, so the pixel colour IS
the declared colour at every angle and under any light. The colour is a NEUTRAL grey with
R = G = B ± 3 (`#E6E6E3`), which cannot warm; it is one step below the building fill so the section
reads as "earth", not as another building. The 0.3 m lip above the sampled terrain covers the
sampled-vs-true edge mismatch on relief (a gap would show the backdrop through the rim). If the
browser check in the audit's §7.2 shows otherwise, the fix is a different neutral value, never a
lit material.

### D5 — Outside reads as cityweft's flat pale ground, not black

Nothing to add: Forma already sets `skyBox`/`skyAtmosphere`/`sun`/`moon` off,
`backgroundColor = TRANSPARENT` over a pale CSS gradient (`applyFormaSkyBackdrop`), and the globe
clip removes every terrain fragment outside the polygon. The one change is `fog.enabled = false`
while a scope is active, so the last ring of terrain inside the cut does not fade toward the horizon
colour. `depthTestAgainstTerrain` already has four writers and `enableLighting` three; the scope
state adds NO writer to either (C12 §13.7).

### D6 — The scope is a 3D-SITE feature; the photoreal globe keeps its parcel void

A `Cesium3DTileset` holds ONE `ClippingPolygonCollection` with ONE `inverse` flag; the parcel void
(`inverse:false`, C12 §7) and a scope (`inverse:true`) cannot coexist. STR §26.1.1 makes the two
Cesium views mutually exclusive and the cityweft look is the abstract one, so the scope is not
applied on the 3D Globe. Founder question Q-3 names the alternative.

### D7 — Inside is complete, or the product says what was dropped — with the numbers

1. **Every layer's READ derives from the scope**: `scopeFetchHalfDeg(scope, lat)` — the
   LONGITUDE-honest half-degree (the audit's F-1: a latitude-degree value applied to longitude reads
   the far disc only 1336 m wide E–W at Barcelona). No layer keeps a private extent (F-2).
2. **Caps on MAPPED layers are completeness facts.** When a cap would drop a feature inside the
   scope, the loader prints `capVerdict(...).line` — `trees: 3000 of 10,300 inside the scope drawn —
   7,300 dropped by the cap; complete at a scope of ~960 m` — never a bare "some were dropped"
   (C57 §1.5/§1.9 honesty). Caps on SYNTHESISED layers (people, synthetic lamps, canopy fill) are
   density parameters and are labelled as such.
3. **The slider carries a "complete" mark** at `completeScopeRadiusM(measured, layers)` — the
   largest scope at which every mapped cap holds at the site's measured density — and the default
   scope is that mark (founder question Q-1 names the alternative). At Barcelona density with
   today's caps that is ~891 m (bound by the near READ, F-2), ~960 m once the reads derive from the
   scope (bound by the tree cap), ~1,420 m once trees are raised to ~10,000 (bound by the 14,000
   building budget — the first real GPU trade).

### D8 — The slider: one per pane, one value, preview live, commit on release

- **Mount**: a per-pane control created beside `mountPaneViewPicker` in
  `SiteAuthoringPaneShell.ts` — `position:absolute` INSIDE `paneEl`, bottom-centre of ITS pane
  (C59 §2.10.3 clause 4 / L-13027: relative to the pane, never the window or `--shell-canvas-cx`).
  Never a `document.body` float (`shellFloatBudget.spec.ts`). Module: `apps/editor/src/engine/views/SiteScopeSlider.ts` — PLANNED (Phase 2).
- **One value, two handles**: two panes drive ONE Cesium viewer (C59 §2 invariant 1), so both
  sliders show the same value and the shell holds it exactly as it holds `globeFraming` today
  (`SiteAuthoringPaneShell.ts` "THE GLOBE FRAMING IS SHARED, HELD HERE").
- **Range**: `[CTX_SCOPE_MIN_RADIUS_M, CTX_SCOPE_MAX_RADIUS_M]` from the budget leaf; **floor**
  raised to `minimumScopeContainingRing(parcel, 25 m)` so the slab is never tighter than the plot;
  the current value in metres is shown; shape toggle circle / rectangle.
- **Semantics**: pointer moves drive ONLY a preview ring (one `polyline` entity of
  `scopePolygonLatLon`, PRYZM purple, re-positioned in place) — never a load; release dispatches
  `site.setScope`; `site.scope-changed` triggers the reload. **Swap, never blank** (C12 §13.4): the
  reload builds the new layers and swaps them in; it must NOT go through a path that
  `clearContextBuildings()`s before the replacement exists (the audit's F-8 — the L-635 shape).
- **Undo**: `site.setScope` is a persisted VIEW-EXTENT fact and is NOT an undo-stack entry, like
  the split fraction (C59) and the camera — a Ctrl-Z after a slide must undo the last model edit,
  not the slab size. Stated so it is a decision, not an omission; the founder may overrule.

### D9 — The BIM model is never cropped

It is the subject the slab presents; the slider floor guarantees the parcel (and so the building)
is inside. `Model.clippingPolygons` exists and is NOT used (Q-2).

---

## Considered and rejected

1. **The retired approach — `globe.clippingPolygons` ALONE (392601e6 → 1b366ed2).** Cuts the globe
   surface only; every entity layer and every `Primitive` is untouchable by it (Cesium 1.143 source,
   audit §1). Its skirt was a lit entity that read red. Its disc was one radius among six.
   **FORBIDDEN by name in C12 §13.6.**
2. **Material / shader discard** (a `u_scope` uniform with `discard` outside). Entity materials are
   Cesium-owned; a custom `Appearance` per layer forks the render path six ways; and the geometry is
   STILL built, seated and held outside the slab — the opposite of "nothing outside is constructed".
3. **A baked bounded terrain mesh per scope.** A re-bake per slider release is not a product;
   `globe.clippingPolygons` is the right primitive on quantized mesh and it is already used for the
   parcel void on tiles (C12 §7).
4. **Fog / camera-only "quieting"** of the outside. Does not crop; the founder asked for a cut.
5. **A per-pane scope.** One Cesium viewer serves both panes (C59 §2 invariant 1); a per-pane
   value would be two copies of one fact, drifting — the `gisActionRegistry` defect shape.
6. **The scope in the view-state store instead of `SiteModel`.** It determines what is LOADED and
   must survive save/reopen with the project; view state is per session.
7. **A second scope type kept beside the extent lane's.** Two owners of one number — the exact
   L-645 defect. Converged by vocabulary instead (D1).

---

## Consequences / owed

- **C19 §2.1 field table** gains `scope` (amendment owed — C19 not edited by this lane).
- **Extent lane — DONE in Phase 1**: `SiteContextScope` is a type alias of `SiteScope`;
  `CTX_SCOPE_*` stay where they are (the measurement's owner) and are exported once as
  `SITE_SCOPE_RANGE`. **Still Phase 2**: `farFetchHalfDeg` → `scopeFetchHalfDeg` (F-1 — note the
  tile arithmetic: a longitude-honest 1781 m read at Barcelona is ~0.0213° in lon × 0.016° in lat,
  ≈108 tiles against the 112 cap, so the box must become ASYMMETRIC or the ceiling latitude-aware;
  a symmetric 0.0213° box is 144 tiles and drops to z15); `CONTEXT_PAN_FARRING_RADIUS_M` follows
  the scope (F-7).
- **Phase 2 work list** is in the lane report and SPEC §7 (file by file, function by function).
- **Verification landed**: schemas 51/51 · stores 61/61 · editor specs 53/53 · gates
  three-imports / domain-purity / cast-count / layer-boundaries / otel-spans all RC=0.

---

## §Q — Founder rulings needed

| # | Question | Options | Recommendation |
|---|---|---|---|
| Q-1 | Default scope | A: the computed complete radius (~900 m Barcelona today) · B: 1781 m (the extent lane's default) | **A** — "complete" is the invariant, "double" the experiment |
| Q-2 | Crop the BIM model? | A: never · B: cut with the slab | **A** |
| Q-3 | Scope on the photoreal 3D Globe? | A: no (keeps the parcel void) · B: yes, replacing the void | **A** |
| Q-5 | Default shape | A: rectangle · B: circle | **A** (D2) |
| Q-6 | `site.setScope` on the undo stack? | A: no (view-extent fact) · B: yes | **A** (D8) |
