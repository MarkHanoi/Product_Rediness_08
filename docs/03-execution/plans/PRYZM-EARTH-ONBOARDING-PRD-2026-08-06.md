# PRYZM Earth Onboarding — Product Vision, Technical Architecture & Phased Plan

> **Stamp**: 2026-08-06 · **Status**: PROPOSAL — planning/architecture document, zero code changes.
> **Type**: PRD-driven execution plan, named per the founder's explicit filename request rather than
> the terser `plans/` convention (e.g. `climate-gis-overlay-plan-2026-06-18.md`); treat this as a
> `docs/03-execution/plans/` document in every other respect (supersede-in-place discipline per
> [C31 §1.2](../../02-decisions/contracts/C31-DOCUMENTATION-AUTHORING-PROTOCOL.md), no derivative
> `*-AUDIT.md` forks).
> **Author's scope discipline**: this document makes **zero** code changes and touches **zero** files
> outside `docs/`. Another agent is concurrently editing `CesiumViewport.ts`, `GISAreaLayout.ts`,
> `ManualAdminZonePanel.ts`, and `siteDispatch.ts` on manual-zone-entry bug fixes; nothing here should
> be read as instructions to touch those files right now.
> **Relates to (read in full to produce this doc)**: [C12-GEOSPATIAL](../../02-decisions/contracts/C12-GEOSPATIAL.md),
> [C19-SITE-MODEL-AND-PARCEL](../../02-decisions/contracts/C19-SITE-MODEL-AND-PARCEL.md),
> [C57-PARCEL-DATA-LAYER](../../02-decisions/contracts/C57-PARCEL-DATA-LAYER.md),
> [C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE](../../02-decisions/contracts/C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md),
> [C59-MULTI-PANE-VIEW-SYSTEM](../../02-decisions/contracts/C59-MULTI-PANE-VIEW-SYSTEM.md),
> [C60-SITE-ENTRY-AND-JURISDICTION-COVERAGE](../../02-decisions/contracts/C60-SITE-ENTRY-AND-JURISDICTION-COVERAGE.md),
> [C06-UI-SHELL-AND-TOOLS](../../02-decisions/contracts/C06-UI-SHELL-AND-TOOLS.md),
> [ADR-0268](../../02-decisions/adrs/ADR-0268-cesium-3d-tiles-georeferenced-building-placement.md),
> [STR-03-engineering-vision](../../01-strategy/STR-03-engineering-vision.md),
> [STR-04-architecture](../../01-strategy/STR-04-architecture.md),
> [onboarding-workflow-design-2026-06-03.md](./onboarding-workflow-design-2026-06-03.md).

---

## §0 — The one question, answered first

**"Why should PRYZM start with the Earth instead of an empty project?"**

Because in this specific product, "start with land" is not a delight feature bolted onto onboarding —
it is the mechanism by which PRYZM is allowed to tell the truth. C60 already codifies the founder's own
decision on this exact question: PRYZM holds **exactly one fully-lit jurisdiction** today (Barcelona,
plus a growing set of in-progress Spanish/regional packs — Córdoba, Sevilla, Granada, Málaga, Aragón —
each gated behind its own rule-pack registration), and a product that lets a user fill in a name,
building type, and unit count *before* it has looked at the actual plot is a product that invites a
promise it cannot keep. A form-first flow lets a user describe a 12-storey apartment building in a
place PRYZM has no zoning pack for, and only fails them at generate-time, deep into a session they've
already invested in. A land-first flow fails them **at the map**, honestly, before they have typed a
single word about the building — "not covered yet, here's what PRYZM can answer nearby" — which is
strictly kinder and, per [C58 §1.4](../../02-decisions/contracts/C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md)
and [C63](../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md) (denominator = buildable
land, refusal is a correct answer), is the same honesty discipline the rest of the compliance engine is
built on, moved one screen earlier.

Second reason, product-specific rather than generic: PRYZM's own differentiator set explicitly
excludes "generative design as a primary autonomous surface" ([STR-03 §8](../../01-strategy/STR-03-engineering-vision.md)) —
the architect stays in the loop. A form ("apartment, 6 units, 4 storeys") asks the user to guess a
massing before the constraint that actually determines it — the parcel, its zoning, its buildable
envelope — exists in the system. Land-first inverts that: the constraint arrives first, computed
honestly (or honestly refused), and the architect's typology choice is then a real decision made
against real numbers, not a blind guess later corrected by a compliance report. This is also why the
existing onboarding pipeline (`OnboardingStepController.ts`) is already ordered `location → site →
confirm → generate` and not `typology → generate → site` — the current implementation independently
arrived at land-first for the same reason, it just does it inside a chat-modal shell rather than an
immersive globe.

Third, competitively: Forma, Cesium ion, and Google Earth all monetize "the beautiful globe" as the
product. PRYZM's globe is not the product — it is the honest front door to a compliance-and-design
engine that, once a parcel is chosen, must compute a real buildable envelope from real zoning data.
The emotional payoff the PRD asks for ("I am working with the real world") is earned legitimately here,
because everything downstream of parcel selection is real georeferenced, real cadastral, and
real-zoning-sourced data — not a demo skin over a placeholder.

---

## §1 — Current architecture review (grounded in code + contracts, not assumption)

### §1.1 — The current onboarding flow is already land-oriented, but wrapped in a modal-and-chat shell

Reading `apps/editor/src/ui/platform/ProjectHub.ts` (the dashboard) and
`apps/editor/src/ui/onboarding/OnboardingStepController.ts` end to end, today's flow is:

1. **Dashboard → "+ New Project"** opens `#ph-new-modal` (`ProjectHub.ts:1311-1322`) — a modal with
   `#ph-new-name`, `#ph-new-description`, and `#ph-new-type` fields. **This is a direct, verified
   conflict with the PRD**, which explicitly asks that clicking New Project not open a modal asking for
   name/description/building type. The modal exists today, in code, right now.
2. Its primary CTA (`handleCreate('guided')`, `ProjectHub.ts:1334-1370`) does **not** blank-create the
   project from those fields. It closes the modal and calls `onStartOnboarding({ name, projectType })`
   — the modal's fields become a *seed*, not a blocking form. If that callback is unwired it falls back
   to a blank create (defensive default, never a dead end).
3. The host runs the RAC (role/team/typology) chat, captures a `PipelineBrief`, and calls
   `briefBootstrap.ts`'s `createAndOpenProject(name)` (`briefBootstrap.ts:199-292`), which is
   `PlatformRouter.createAndOpenProject` (`PlatformRouter.ts:900-954`) — creates the project via the
   persistence client, opens it, and (`briefBootstrap.ts:246`) launches
   `startOnboardingStepFlow` — **after** the project already exists and is open.
4. `OnboardingStepController` (2,542 lines) then drives, per its own header comment
   (`OnboardingStepController.ts:1-59`): `location → site → confirm → generate`:
   - **`location`** — address input → `geocodeAddress` (A.8.a) → `dispatchSiteLocation` (threads into
     `createSiteFromRect`, `siteDispatch.ts`).
   - **`site`** — two choices: *"Use a default footprint"* (a hardcoded 10×8 m rectangle,
     `DEFAULT_PARCEL_WIDTH_M`/`DEPTH_M`, `:98-99`) or *"Draw it on the map"*, which triggers the
     **§GIS-HANDOFF (L-412)** pattern (`:734`): `window.pryzmToggleGIS(true)` mounts the 2D-map-left /
     3D-Site-right split (`GISAreaLayout.mountGISArea`), then `window.pryzmStartBoundaryDraw()` arms
     Cesium's polygon draw tool, and the controller **waits** for the `site.parcel-boundary-set` runtime
     event (with a 60 s watchdog that falls back to the default rectangle rather than hanging, `:770`).
   - **`confirm`** (O.7.1) — *"Generate your {typology} with AI?"* — the boundary stays visible; nothing
     auto-generates silently (this superseded an earlier silent-auto-generate design, per the
     `§7.1`/`§7.5` comments at the top of the file).
   - **`generate`** — `generateApartmentFromBoundary` / `generateHouseFromBoundary` /
     `generateResidentialFromBoundary` / office-tower path, then
     `enterCanvasWithSitePlanUnderlay` lands the user in the editor canvas with the site plan already
     underlaid.

**What this means for the PRD**: roughly 70% of the *sequencing* the PRD asks for already exists and
already reasons about land before building type. What is missing is the **presentation layer** — a
step-overlay chat modal standing in front of Cesium is not "the entire application transitions into an
immersive Earth." The PRD's ask is a **UI/interaction rewrite of an already-sound sequence**, not a new
pipeline. This distinction matters for the roadmap (§10): the risky part is the cinematic globe and the
progressive-disclosure UI: the underlying location→site→confirm→generate machinery, the parcel commit
path, and the generate call are proven and should be reused verbatim.

### §1.2 — The GIS/Cesium substrate is production-grade already, not a placeholder to build from scratch

`apps/editor/src/ui/geospatial/CesiumViewport.ts` (12,878 lines) is not a toy globe. Verified by
reading [C12 §7](../../02-decisions/contracts/C12-GEOSPATIAL.md) and
[ADR-0268](../../02-decisions/adrs/ADR-0268-cesium-3d-tiles-georeferenced-building-placement.md)
(status: ACCEPTED, IMPLEMENTED, **verified working live** on Fly, 2026-07-17):

- It renders **Google Photorealistic 3D Tiles** (via `createGooglePhotorealistic3DTileset`,
  `CesiumViewport.ts:225`), gated behind a server-held Google Maps Platform key (`GIS-CESIUM-GOOGLE-KEY`,
  `:223-234`) — falling back to keyless ESRI-satellite imagery + a flat "Forma" ground when no key is
  configured. **There is no Google Maps JS SDK usage anywhere in `apps/editor/src`** (verified by grep)
  — the PRD's "Google Maps integration" is, concretely, this single photoreal-tiles credential, not a
  second mapping stack. Correcting the PRD's asset list on this point matters for scoping: there is one
  imagery/tiles surface, not two.
- Vertical anchoring is a solved, contract-pinned problem (C12 §1.4, §7; ADR-0268 D1–D3): a building
  anchors at the **LTP-ENU origin**, never the geocoded address; the ground datum resolves via
  `photoreal-tile-clamp` (raycasting the tile mesh itself, excluding the placed model) and is held
  **hidden** while unresolved rather than falling back to a fabricated `0` — verified live at base
  `706.90 m` ellipsoidal in Madrid.
- The BIM building is placed on the globe as a **native `Cesium.Model` glTF primitive**
  (`renderRealModelOnGlobe`, `CesiumViewport.ts:7530`) — the live WebGPU-rendered BIM scene is
  serialized to GLB and handed to Cesium, which depth-tests it against the photoreal tiles **natively**.
  `CesiumThreeBridge` (`plugins/geospatial/src/CesiumThreeBridge.ts`) shares only the THREE
  **camera + scene** with Cesium (an ENU floating-origin re-parent) — **never** the GPUDevice or canvas.
  This is precisely the PRD's "Cesium owns the Earth, Three.js owns PRYZM" split — **already shipped**,
  not a redesign. See §5 for the one open violation in this area (C12 §1.5/§9, L-604) that any new work
  must not deepen.
- Full-height massing (`resolveFullBuildingHeight`, `:8035`), context buildings via a single
  far-extent Overpass query (C12 §8, one network call per site, near/far ring split client-side), and a
  baked per-city terrain quantized-mesh pyramid (C12 §10, ADR-0278) all exist. **Known gap**: terrain
  relief is currently **OFF** in the 3D-Site/"Forma" view for every city (C12 §9, L-631, an *open,
  founder-escalated* violation — `CesiumViewport.ts:5993` early-returns before attaching terrain because
  turning it on before the SiteFrame reseat re-introduces a z-fight against context buildings). A "Level
  2: terrain streams" claim in this PRD's progressive-loading pitch (§6) is **not yet true** for the
  Forma/3D-Site altitude band and should not be promised in the roadmap without flagging this.

### §1.3 — The split-screen 2D/3D system already exists as a governed contract, not a bespoke layout

`apps/editor/src/ui/layout/GISAreaLayout.ts` (4,421 lines) implements the **§L-412 site-authoring
split** — 2D MapLibre map on the left, live Cesium 3D Site on the right, both reading/writing the same
site store. This pattern is now formally owned by
[C59 — Multi-Pane View System](../../02-decisions/contracts/C59-MULTI-PANE-VIEW-SYSTEM.md): panes are a
renderer-agnostic hosting abstraction (`PaneHost`, `PaneLayoutStore`), and C59 is explicit that there is
and must remain **exactly one Cesium viewer instance** and **exactly one WebGPU renderer** app-wide —
panes **re-parent** the existing singleton's canvas, they never construct a second one. This is the
single most load-bearing constraint on this whole PRD: **the "globe" and "3D Site" are not two things**.
They are the *same* `CesiumViewport` instance at different camera altitudes (C59 §2 invariant 1; C60 §6
invariant 5). Any implementation that spins up a second Cesium viewer "for the intro globe" and a
different one "for the 3D Site" violates C59 invariant 1 outright and would fail
`validatePaneLayout`'s double-mount guard by design.

`SiteBoundaryMap2D.ts` (2,341 lines) is the 2D half: a MapLibre GL JS map (`import maplibregl …`,
`SiteBoundaryMap2D.ts:35-45`), not Google Maps, styled as a custom "Hektar-style" cream/shadow basemap,
mounted `position: absolute; inset: 0` inside its pane.

### §1.4 — There is already a pure, contract-ratified `world → country → city → parcel` entry state machine, unwired

This is the single most important finding for this PRD, and it changes the roadmap substantially:
[**C60 — Site Entry & Jurisdiction Coverage**](../../02-decisions/contracts/C60-SITE-ENTRY-AND-JURISDICTION-COVERAGE.md)
is **exactly** the PRD's Stage 1 ask — a globe-scale entry flow with progressive stages
(`world → country → city → parcel`) driven by search/selection, honest about what PRYZM can answer at
each altitude — and **Phase 1 is already implemented, tsc + unit-test gated**:

- `apps/editor/src/engine/views/siteEntryModel.ts` — a **pure reducer** (`SiteEntryStage`,
  `SiteEntryIntent`, `SiteEntryEffect`) with zero DOM/Cesium/THREE/I-O imports, unit-pinned by 30 tests.
- `siteEntryCoverage.ts` — reads `listJurisdictionCoverage()` **live** off the shipping rule-pack
  registry (`packages/site-parcel-data/src/rulepacks/registry.ts`) — the globe cannot light a place the
  dispatcher would refuse to route into, because the same predicate (`isInBarcelona`/`extent`/
  `contains`) decides both. No hand-maintained city list exists anywhere in this layer.
- `siteEntryStore.ts` — the view-state store + command-driven transitions (`view.pane.*`-style
  intents), 9 tests.
- `SiteEntryPanel.ts` — the staged, copy-pure panel chrome (what the user reads is a unit test, not a
  screenshot review) — three-valued verdict (`covered` / `not-covered` / `unknown`), with an explicit
  rule that **no line of panel copy may contain a statistic about a place** (no population, no GDP, no
  average height — PRYZM holds none of that).
- `CesiumViewport.flyToGeographic()` — the one renderer addition C60 required, already landed.

**What is explicitly NOT done (C60 §8, honestly recorded in the contract itself)**: this flow is **not
wired into the shipping entry sequence**. It is deliberately sequenced **behind C59 Phase 3** (per-pane
camera state), because the entry flow is modelled as a *camera state of the existing `site-3d` view*
and wiring it onto the current Phase-2 switcher would build against a surface about to change under it.
Also not done: the lit coverage rectangle drawn ON the globe (data is ready, the Cesium draw call is
not — and that file is under concurrent edit right now, see the scope note at the top of this doc);
globe-click → `descend` (needs a branch in the existing click handler, same guard as L-592); and
sub-jurisdiction coverage resolution finer than a metro bbox.

**Consequence for this PRD**: the "honest coverage globe" the founder already chose (C60 §0 "the
founder decided (A): the honest coverage globe... Barcelona lit, everywhere else explicitly not yet
covered") **is this PRD's Stage 1**, nearly built. The work is not "design a new globe entry
experience" — it is "finish C59 Phase 3 far enough to wire C60, then skin C60's already-correct staged
panels with the cinematic presentation this PRD asks for." Proposing a parallel globe-intro mechanism
that does not go through `siteEntryModel.ts`/`SiteEntryStore` would be the exact "fourth ad-hoc
mechanism" C59 §0 and C60 §0 were each written to stop.

### §1.5 — The parcel/zoning/envelope pipeline is real, per-jurisdiction data, not a mock

`packages/site-parcel-data/src/providers/` (Glob'd — 60+ files) contains real per-jurisdiction adapters:
Spanish Catastro providers (Córdoba, Sevilla, Málaga, Granada, Zaragoza, Murcia, Valencia, Madrid,
Barcelona, Balears, Canarias…), a Danish `DkZoningProvider`/`ByggefeltProducer`, a Swiss
`chGrundnutzungProvider`/`chZurichBzoCatalogue`, a Dutch `resolveNlBestemmingsplan`, a French
`resolveParisPluZone`. This is [C57](../../02-decisions/contracts/C57-PARCEL-DATA-LAYER.md)'s
provider-agnostic ingestion layer: every adapter normalises to a canonical WGS84 `ParcelFeature` with
provenance (source, license, ingest timestamp), routed through a same-origin server proxy so no
government-API key ever reaches the browser (C57 §1.2). A selected parcel commits through the identical
one-shot-immutable path a hand-drawn boundary uses (C57 §1.3, C19 §1.4) — there is no second boundary
channel. This is the substrate for the PRD's "Level 6: parcel boundaries" and "Level 7: planning
overlays" — both real, both already provider-driven, both honestly degrading to "draw it yourself" on a
coverage miss (C57 §1.5) rather than fabricating a parcel.

### §1.6 — The `composeRuntime()` / P1–P8 constraints this PRD must design inside, not around

Per [STR-04-architecture §3–§4](../../01-strategy/STR-04-architecture.md): the runtime exposes a typed
`geospatial: GeospatialSlot` (projection only) among ~29 named slots, all wired through the **one**
`composeRuntime()` call. Any new "globe intro" component must be composed through this root, not booted
in a side channel. The three principles with the sharpest teeth for this specific PRD:

- **P2 (single THREE owner)** — a cinematic globe-intro animation must not reach for `THREE.*` directly;
  if it needs THREE objects (e.g. easing a camera vector) it imports from `@pryzm/renderer-three`'s
  re-export, exactly as `packages/geospatial` already must (C12 §3).
- **P3 (single rAF)** — no new persistent animation loop. C59 §2 invariant 2 already carves the correct
  exception: a **one-shot, self-cancelling** rAF settle (Cesium's own reflow/reframe primitive) is
  permitted; a **per-component continuous** loop is not. A "premium cinematic Earth → Europe → Spain →
  Andalusia → Córdoba" fly sequence is expressed as Cesium's own camera tween on the **existing** render
  loop — never a bespoke `requestAnimationFrame` driving the flight.
- **P6 (commands only)** — camera moves, stage transitions, and parcel commits are **intents dispatched
  to a store** (`SiteEntryStore.dispatch`), never direct `viewer.camera.flyTo()` calls from UI code. C60
  §4 states this explicitly: "UI handlers dispatch intents and do nothing else. A click that reaches
  `viewer.camera` … is a violation."

---

## §2 — UX review

### §2.1 — What the PRD gets right, validated against the founder's own prior decisions

- **Land-first, not form-first** — independently re-derived by the founder in the
  onboarding-workflow-design doc (§3.3, 2026-06-03: *"GIS 'wow' anchored in flow"*) and in C60 §0 (the
  honest coverage globe). This PRD's instinct matches two independent prior founder decisions.
  **Reconciled, no conflict.**
- **Progressive disclosure of GIS chrome ("the interface gradually appears")** — matches the existing
  practice: `GISAreaLayout` mounts on-demand (§GIS-HANDOFF), not as permanent chrome; C60's staged
  panels are themselves a progressive-disclosure device (world panel says less than the parcel panel).
- **No "Create Project" button; the software just continues** — this is *stronger* than what ships
  today. Today's `handleCreate('guided')` still requires the user to click "Create Project" inside the
  modal (§1.1). Removing that click is a genuine, currently-unimplemented UX improvement this PRD should
  keep, contingent on the modal itself being removed (§9 conflict list).

### §2.2 — Where the PRD's ask needs an honest amendment, not a silent implementation

- **"Typing 'Córdoba' animates smoothly... no loading screens"** — C60's `countryCode` rule (§1.3) is
  stricter than this: **PRYZM holds no country-boundary data**, so a free camera move over an arbitrary
  landmass leaves `countryCode: null` and the panel says "not covered" **without naming a country**
  (naming one from a guessed coordinate would itself be a C58 §1.4 fabrication, the exact defect class
  C60 exists to prevent). A search box that resolves "Córdoba" to a *geocoded point* can still fly
  there cinematically — that part is fine, geocoding a place name is not fabricating coverage — but the
  **country/city panels must not claim data PRYZM does not hold** (population, GDP, "coverage" beyond
  the registered rule-pack). The PRD's copy examples ("Level 8: development intelligence") must be
  scoped, per city, to what that city's rule-pack registration actually states in `answerSummary`
  (C60 §2.1) — never a generic "we support this region" claim.
- **"Trees" as a progressive-streaming layer (Level 5)** — not found anywhere in the codebase, contracts,
  or ADRs searched. This is a genuinely new capability with no existing data source (OSM tree-canopy
  data is not wired anywhere in `packages/site-parcel-data` or `CesiumViewport`). Flag this honestly in
  the roadmap as **new scope**, not a reuse of an existing layer — it should not be scheduled in an early
  milestone.
- **"Neighbouring buildings... all live"** at parcel-select time — mostly true today (Overpass context
  buildings, C12 §8) but the **far-ring** context is deliberately flat/low-poly/shadowless by design
  (perf budget, `CONTEXT_FAR_MAX_BUILDINGS = 900`), so "all live" over-promises fidelity at the far ring;
  the PRD's copy should say "near neighbours in full detail, wider context simplified for performance."

---

## §3 — Technical architecture (target state, reconciling PRD ask against actual code)

### §3.1 — The composition: one Cesium viewer, driven by one entry-state reducer, hosted in one pane system

```
composeRuntime()                                          (P1 — packages/runtime-composer)
  └─ geospatial slot (projection only, C12)
  └─ (existing) CesiumViewport singleton                  — constructed once, never twice
       ├─ Stage: 'world' | 'country' | 'city' | 'parcel'  (C60 siteEntryModel — REUSED, not reinvented)
       │    driven by SiteEntryStore.dispatch(intent)      (P6 — command-driven, no direct camera writes)
       │    intents: search-resolve → focus-country → focus-jurisdiction → descend → select-parcel
       ├─ hosted in a PaneHost pane element                (C59 — re-parented singleton canvas)
       │    solo (single-pane) during globe intro; split (2D-left/3D-right) once GIS-handoff fires
       │    (existing §L-412 pattern via GISAreaLayout / SiteAuthoringPaneShell)
       └─ camera moved ONLY by:
            - Cesium's own tween, invoked from cameraForState(stage)  (C60 §1.1 — declared OUTPUT,
              never inferred from live altitude)
            - a one-shot rAF settle after re-parent/resize            (C59 §2 invariant 2, P3)
```

### §3.2 — "Cesium owns the Earth, Three.js owns PRYZM": does the PRD's ask match the codebase, or require a change?

**It already matches**, almost exactly, and this needs to be said plainly rather than re-architected:
ADR-0268 D5 (§1.2 above) is the PRD's separation, shipped and verified live. The one place it does
**not** cleanly match is `CesiumThreeBridge.setAnchor()` (C12 §1.5, **KNOWN VIOLATION, OPEN, P1
severity, owner UNASSIGNED**): it currently re-parents BIM THREE meshes under a group carrying the
**full ECEF** transform (`eastNorthUpToFixedFrame`), i.e. a world-space magnitude of ~6.37×10⁶ m,
directly contradicting C12 §1.1's LTP-ENU/float32-precision mandate. This bridge is the THREE-side half
of "Cesium owns the Earth, Three.js owns PRYZM" — and it is the one piece of that boundary that is
**already known to leak the wrong frame into the shared scene graph**. C12 §9 (the SiteFrame authority,
DRAFT target architecture) names the fix: one `SiteFrame` object owning origin + θ + ground,
constructed once in `composeRuntime`, that this bridge re-parents into an LTP-ENU-**relative** group
instead of an ECEF one.

**Implication for this PRD, stated honestly rather than glossed over**: building the cinematic globe
intro on top of the *existing* Cesium-only camera (globe/country/city stages, before any parcel/BIM
exists) is **not** blocked by L-604/C12 §9 at all — those stages have no BIM scene graph yet, so the
ECEF-leak bug is simply not reachable. The risk only appears **after** a parcel is selected and a
building is placed on the globe (ADR-0268's territory), which is already-shipped, already-verified
functionality this PRD reuses rather than rebuilds. **Recommendation**: do not let this PRD's roadmap
attempt to fix L-604/stand up C12 §9 as a side effect of an onboarding redesign — that is C12's own,
separately-owned migration (P1 severity, its own sequencing already specified in C12 §9), and bundling
it into an onboarding PR would be exactly the kind of scope-creep C12 §9's own text warns against
("if the massing is rewritten while the frame is still sprayed, the new tiers re-inherit the spray").
Flag it here, cross-link it, and let C12's owner sequence it independently.

### §3.3 — Where P1/P2/P3 impose real constraints on the NEW surface this PRD proposes

| PRD ask | Constraint | Resolution |
|---|---|---|
| "Beautiful animated globe with atmosphere, clouds, premium animations" | P3 single rAF | Cesium's built-in atmosphere/lighting (`viewer.scene.skyAtmosphere`, `globe.showGroundAtmosphere`) + Cesium's own camera tween. **No new rAF loop.** A custom shader-driven cloud layer, if wanted later, must render on Cesium's own frame, never a second loop. |
| "Progressive streaming Level 1→8" | Existing Cesium 3D-Tiles LOD IS the progressive-imagery/terrain/buildings mechanism (Levels 1–4); parcel/planning/envelope (6–8) are already async data fetches gated behind stage transitions, not a new streaming engine | Model each level as a **stage-entry side-effect** in `siteEntryModel.ts`'s effect list, not a bespoke loader |
| "Search experience animates smoothly, no camera jumps" | C60 §1.1 forbids inferring stage from camera altitude; camera is a **projection** of stage, stage is a **cause** | A geocode search result dispatches `focus-jurisdiction`/`descend` intents; the reducer computes the new stage; `cameraForState` computes the fly-to. Never wire a search box directly to `viewer.camera.flyTo()`. |
| "Split screen 2D GIS + 3D context, reuse existing" | C59 exactly this contract already | Reuse `GISAreaLayout`'s L-412 pattern / `SiteAuthoringPaneShell` verbatim; do not build a second split-view mechanism |

---

## §4 — Interaction design

### §4.1 — The five interaction states, mapped 1:1 onto C60's four stages plus the existing post-parcel flow

| PRD stage | C60 `SiteEntryStage` | What's genuinely new | What's reused verbatim |
|---|---|---|---|
| Living Earth (hero search) | `world` | Cinematic camera intro (atmosphere/rotation on load); the search-box UI chrome; copy tone | `siteEntryModel` reducer, `listJurisdictionCoverage()`, "dark on purpose" honesty copy |
| Country reveal | `country` | Cinematic zoom animation | Coverage panel copy rules (no national statistics), `descend`/`ascend` intents |
| City reveal | `city` | — | `answerSummary` display, covered-zone-code count |
| Site discovery (split screen) | `parcel` (pre-select) | The "interface gradually appears" reveal choreography | `GISAreaLayout` split, `SiteBoundaryMap2D`, C57 parcel providers, C58 zoning |
| Parcel selected → Define Site | `parcel` (post-select, hand-off) | "Define your site" language reframe (methods, not onboarding choices) | `OnboardingStepController`'s `site` step (default-footprint / draw / — new: import), `generateXFromBoundary` |

### §4.2 — "Define your site" — reframing an existing step, not inventing one

The PRD's ✓ Use selected parcel / ✓ Draw development boundary / ✓ Import CAD-Survey-PDF triad maps
directly onto the **existing** `OnboardingStepController` `site` step's two choices (default-footprint,
draw-on-map) plus the **existing** but currently onboarding-adjacent `§SITE-OVERLAY-IMPORT` path
(`pryzmStartSitePlanOverlayImport`, referenced at `OnboardingStepController.ts:1012`) which already
lets a user import a plan/PDF as a site underlay. All three methods already exist in code; the work is
**copy and framing** (present them as "how do you want to define your development site" rather than a
binary skip-or-draw choice bolted onto a chat step), not new interaction machinery.

### §4.3 — No "Create Project" button

Achievable, but only once the modal (§1.1, §9) is removed and `createAndOpenProject` is called with an
**auto-generated** name (address / parcel refcat / municipality — all already available at the moment
of parcel selection from `PickedLocation`/`ParcelFeature.provenance`) rather than a user-typed field.
This is a real, scoped change to `ProjectHub.handleCreate` and `briefBootstrap`, not a UI-only tweak —
flagged explicitly in §9's conflict list and §10's roadmap.

---

## §5 — Scene graph architecture

Two independent scene graphs exist and must stay independent, per P2 and per ADR-0268 D5:

1. **Cesium's own internal scene graph** — 3D Tiles (photoreal imagery + buildings), the terrain
   quantized-mesh pyramid (when enabled), the placed BIM `Cesium.Model` glTF primitive, drawn context
   massing, the parcel-boundary polyline/polygon entity, any coverage-rectangle overlay (C60 Phase 2,
   not yet built). PRYZM code never constructs a second Cesium `Viewer`.
2. **THREE's scene graph, owned exclusively by `packages/renderer-three`** (P2) — the live BIM model
   while the user is authoring inside the workspace, plus (via `CesiumThreeBridge`) a camera+scene
   *reference* shared into Cesium's coordinate frame for the ENU-anchored placement moment. This bridge
   is a **read-only camera/scene projection**, never a second render target, never a second GPU device.

**For this PRD's new globe-intro surface**: no new scene graph is required. The intro stages (`world`/
`country`/`city`) have **no BIM scene at all** — there is nothing for PRYZM's THREE side to own yet.
This is precisely why C12 §9's SiteFrame/ECEF debt (§3.2) does not block the intro work: the intro
lives entirely inside Cesium's own graph until a parcel is selected, at which point the **existing**,
already-verified ADR-0268 pipeline takes over.

---

## §6 — Streaming architecture

Reconciling the PRD's "Level 1→8" pitch against what is actually wired:

| Level | PRD ask | Actual mechanism | Status |
|---|---|---|---|
| 1 — Planet imagery | Base globe imagery | Cesium default imagery / ESRI-satellite fallback | ✅ shipped |
| 2 — Terrain | Elevation relief | Baked per-city quantized-mesh pyramid (C12 §10, ADR-0278) | ⚠ **OFF in 3D-Site/Forma mode everywhere** (L-631, open, founder-escalated) — do not promise this live without resolving the sequencing conflict C12 §9 records |
| 3 — Road network | Street layer | Not found as a dedicated PRYZM layer; roads exist implicitly inside photoreal tiles / Overpass geometry, not as a toggleable network layer | ❌ not a first-class layer today |
| 4 — Buildings | Context massing | Overpass near/far ring fetch, one query per site (C12 §8) | ✅ shipped, far ring intentionally low-fidelity |
| 5 — Trees | Vegetation | Not found anywhere in the codebase | ❌ **new scope**, no data source identified |
| 6 — Parcel boundaries | Cadastral outline | C57 provider registry (60+ jurisdiction adapters), honest coverage-miss fallback | ✅ shipped, per-jurisdiction |
| 7 — Planning overlays | Zoning | C58 rule-pack registry, C60 coverage projection of the same registry | ✅ shipped, per-jurisdiction (Barcelona lit; others in progress per the git status of this session) |
| 8 — Development intelligence | Buildable envelope | C58/C64 envelope compiler, C63 city-completion scorecard | ✅ shipped where a pack is registered; honestly refuses elsewhere (never estimates) |

The honest streaming story for this PRD is therefore: **Levels 1, 4, 6, 7, 8 are real and reusable
today; Level 2 has a known, founder-escalated gap in the exact view mode this PRD lives in; Level 3 does
not exist as a layer; Level 5 does not exist at all.** A roadmap that schedules "full progressive
streaming Level 1–8" as one milestone (§10) would silently absorb two unscoped new-capability builds
(roads, trees) and one open architectural conflict (terrain-in-Forma) — split them out explicitly.

---

## §7 — Animation specification

Bound entirely by P3 (single rAF, C59 §2 invariant 2) and C60 §1.1 (stage is a cause, camera a
projection):

- **Camera moves are Cesium `Camera.flyTo`/`flyToBoundingSphere` calls**, parameterised by
  `cameraForState(stage)` (a pure function per C60's model) — never a bespoke tween loop.
- **A "cinematic Earth → Europe → Spain → Andalusia → Córdoba" search sequence** is a **chain of
  discrete `flyTo` calls**, one per intermediate stage the reducer passes through, not a single
  continuous camera-path animation computed by application code. This keeps every leg inside Cesium's
  own render loop and inside the "declared output, not inferred" discipline — each leg is a stage
  transition, each transition dispatches an intent, each intent's effect is one `flyTo`.
- **Atmosphere/cloud/lighting** are Cesium scene properties (`globe.showGroundAtmosphere`,
  `scene.fog`, `scene.skyAtmosphere`, time-of-day-driven lighting via `scene.globe.enableLighting`) —
  configuration, not new render passes; they render on Cesium's existing loop.
1. **A single self-cancelling settle rAF** is allowed for post-reparent reflow (already the pattern
   `reflowContainer()` uses) — this is the *only* place raw `requestAnimationFrame` may appear in new
   code, and only as a one-shot, per C59 §2 invariant 2's explicit carve-out.

---

## §8 — Performance strategy

| Concern | Existing mechanism | Applicability to this PRD |
|---|---|---|
| LOD | Cesium 3D-Tiles native LOD (photoreal tiles); Overpass near/far ring split (C12 §8) | Reused as-is; no new LOD system needed for the globe intro |
| Frustum culling | Cesium's native culling; the C12 §10 horizon-occlusion invariants for the baked terrain tile pyramid (a subtle, already-debugged correctness issue — a naive re-bake can horizon-cull an entire city to white, per ADR-0278) | Do not touch terrain-bake code as part of this PRD; if terrain-in-Forma (L-631) is resolved later, it inherits these invariants for free |
| GPU picking | Existing `packages/picking` (L1) drives BIM selection; Cesium has its own `scene.pick` for globe-side entity clicks (parcel select, coverage rectangle click) | The globe-click → `descend` wiring C60 §8 leaves undone needs a branch in the existing `ScreenSpaceEventHandler`/`§FORMA-CLICK-NO-NAV` guard — not a new picking system |
| Tile caching | R2-backed terrain tiles (1-day cache + 1-hour proxy revalidate, version-stamped per C12 §10.3); persistent localStorage cache for Overpass context (C12 §8, cache keys = 1 per site) | Reused; the globe intro adds no new cacheable surface until parcel selection |
| Progressive loading | Cesium tileset streaming is inherently progressive; C57's provider fetches are async with honest coverage-miss fallback | Reused |
| Instancing | Not directly relevant to the globe-intro surface (instancing concerns are a BIM-side/renderer-three concern per the `instanced-aggregate-level-visibility` pattern); irrelevant until a BIM model exists post-parcel-select | Out of scope for this PRD |
| Memory management | C59 §2 invariant 5 (perf reality): the founder's reference machine runs the **WebGL fallback**, not WebGPU; **two heavyweight GPU surfaces must not run simultaneously without an explicit budget**. C60 §6 invariant 8 is explicit that the entry flow "holds no live BIM pane behind it" — the globe intro requests the 3D Site **solo** | **This is the single sharpest constraint for the intro experience**: it must not composite a live WebGPU BIM canvas behind the photoreal globe on the founder's actual hardware. No model exists yet at this stage regardless, so this is free to honour, but any later "peek at your design while browsing the globe" feature idea would need an explicit perf budget decision first. |

**Honesty note per the task's own instruction**: exact current frame-budget headroom for the globe
intro (i.e., how much margin exists before Cesium's photoreal-tiles rendering plus any new
atmosphere/animation work would blow the founder's WebGL-fallback frame budget) is **not determinable
from static reading** — it requires a live profile on the actual hardware, which this document
explicitly cannot run (localhost is documented elsewhere in this repo's own memory notes as unusable for
this class of surface). Flag this as a measurement task for the first milestone's acceptance criteria,
not a number to invent here.

---

## §9 — Component hierarchy

```
GlobeOnboardingSurface                          (NEW — thin composition, not a new engine)
├── consumes: composeRuntime().geospatial        (existing slot)
├── owns no Cesium instance — resolves the SINGLETON via the existing accessor
│   (mirrors C59 §1.3's "re-parent, never construct")
├── SiteEntryStore                                (EXISTING — apps/editor/src/engine/views/siteEntryStore.ts)
│   └── siteEntryModel.ts                         (EXISTING — pure reducer, 30 tests)
│       └── coverage via siteEntryCoverage.ts → packages/site-parcel-data registry (EXISTING)
├── SiteEntryPanel                                (EXISTING — staged copy chrome, pane-scoped per C06 §7)
├── GlobeHeroSearch                               (NEW — "Where are you building?" input)
│   └── dispatches focus-country / focus-jurisdiction / descend intents — NO direct camera calls
├── (on descend into parcel stage, GIS-handoff fires — EXISTING §L-412 pattern)
│   └── SiteAuthoringPaneShell (C59 PaneHost)      (EXISTING)
│       ├── left pane: SiteBoundaryMap2D (MapLibre) (EXISTING)
│       └── right pane: CesiumViewport (re-parented, same singleton) (EXISTING)
├── DefineYourSitePanel                            (REFRAME of OnboardingStepController's `site` step)
│   ├── Use selected parcel                        (EXISTING — parcel commit path, C57 §1.3)
│   ├── Draw development boundary                  (EXISTING — SiteBoundaryDrawTool)
│   └── Import CAD/Survey/PDF                       (EXISTING — §SITE-OVERLAY-IMPORT)
└── (project creation: auto-named, no modal, no button — NEW, small, scoped change to
    ProjectHub.handleCreate + briefBootstrap.createAndOpenProject)
```

The only genuinely new production components are `GlobeHeroSearch` (thin, dispatch-only per P6) and the
name-auto-generation change to project creation. Everything else in this hierarchy is an existing,
contract-owned component being **composed differently**, not rebuilt.

---

## §10 — Implementation roadmap (phased, no milestone is a rewrite)

Sequencing follows the dependency the contracts themselves already state: **C60's live wiring is
explicitly queued behind C59 Phase 3** (per-pane camera/view state). This PRD's roadmap must respect
that queue rather than route around it — jumping ahead would build the cinematic globe against a
switcher surface C59 itself says is about to change.

### Milestone 0 — Instrumentation only (no user-visible change)
Profile the founder's actual WebGL-fallback frame budget with the existing Cesium globe view (§8's
flagged unknown). Confirms or corrects the perf assumptions every later milestone depends on. No code
risk — pure measurement, reversible, independently valuable regardless of what ships next.

### Milestone 1 — Remove the New-Project modal; auto-name the project (small, isolated, high-value)
Change `ProjectHub.handleCreate`/`openNewModal` so "+ New Project" calls `onStartOnboarding()` directly
with no modal and no typed name/description/type; `briefBootstrap.createAndOpenProject` synthesizes a
placeholder name ("Untitled — <date>") immediately editable later, replaced by the real
address/parcel-derived name once location resolves. **This closes the sharpest, most concrete conflict
between the PRD and the current code** (§1.1), is independently shippable, independently testable (a
few `ProjectHub` unit tests), and carries no geospatial risk at all.

### Milestone 2 — Skin the EXISTING C60 stage machine as the cinematic globe intro, on the CURRENT single-pane switcher (not gated behind C59 Phase 3)
Wire `siteEntryModel`/`SiteEntryStore` into the shipping "New Project" entry path as a **solo-paned**
Cesium view (C60 §6 invariant 8 already requires solo; this does not need per-pane camera state to be
correct — it needs exactly one pane, which exists today). Add `GlobeHeroSearch`, the atmosphere/lighting
config (§7), and the staged panel copy (already built, `SiteEntryPanel`). **This is deliberately scoped
to avoid the "queued behind C59 Phase 3" trap**: C60's *split-pane* / shared-camera-pose ambitions are
Phase-3 work, but a *solo* globe intro that hands off to the *existing* GIS-handoff split (§L-412,
already live) once a parcel is chosen needs none of that. This is the PRD's real "first safe milestone":
reuse the existing `CesiumViewport` instance, reuse the existing pure reducer, add only presentation.

### Milestone 3 — "Define your site" reframe + auto-named project completion
Rename/re-copy the existing `OnboardingStepController` `site` step per §4.2 (no new interaction
machinery); complete Milestone 1's auto-naming once parcel/address data is available at that point in
the flow (municipality + refcat, from `ParcelFeature.provenance`, C57 §1.4).

### Milestone 4 — Globe-click → descend + the lit coverage rectangle (C60 Phase 2 remainder)
Finish what C60 §8 explicitly left undone: draw the coverage rectangle from
`siteEntryCoverageEntries()` and wire a click branch into the existing
`ScreenSpaceEventHandler`/`§FORMA-CLICK-NO-NAV` guard. Both were deferred in C60 itself only because
`CesiumViewport.ts` was under concurrent edit at ratification time — check current state before
starting.

### Milestone 5 (large, explicitly NOT bundled with the above) — Progressive-streaming completeness
Resolve the terrain-in-Forma sequencing conflict (C12 §9, L-631 — this is a **founder decision**, not an
engineering one: accept the known z-fight regression now, or wait for the SiteFrame reseat). Scope and
build the road-network layer and the tree/vegetation layer as **genuinely new capabilities** (§6) with
their own data-sourcing investigation (mirroring the per-jurisdiction sourcing discipline C57/C58
already use) — do not fold these into an onboarding milestone; they are geodata-sourcing projects in
their own right.

### Milestone 6 (large, cross-contract, sequenced by C59 not this document) — Full swap-any-view-any-pane + shared camera pose
This is C59 Phase 3 itself (WebGPU BIM re-targetable into a pane, per-pane camera state, the shared
camera-pose model already pure-modelled but unwired at `sharedCameraPose.ts`). It is a **precondition**,
not a **consequence**, of a fully general "any view in any pane, same camera everywhere" experience. This
PRD's milestones 2–4 deliberately do not depend on it; a future "3D globe / 3D Site / BIM 3D all share
one camera angle" ambition does, and should be scheduled against C59's own roadmap, not this one.

**Explicitly rejected as a milestone shape**: one large PR implementing globe + streaming + split-view +
shared camera + terrain-on-Forma together. Every contract this document cites was written specifically
because that shape of change — one PR touching multiple already-separately-governed subsystems — is how
this codebase has previously accumulated "fourth ad-hoc mechanisms" (C59 §0, C60 §0) and undiagnosable
regressions (C12 §9's four-places-ground-is-resolved history). The phased list above threads through
existing seams precisely to avoid repeating that.

---

## §11 — Coding standards for the implementation phase (binding constraints, not suggestions)

For whoever implements this later:

1. **No second Cesium viewer, ever.** Every new component resolves the existing singleton through the
   accessor C59 establishes; `new CesiumViewport(...)` outside its one construction site is a defect.
2. **No `import * as THREE` outside `packages/renderer-three`** (P2, hard-fail CI gate
   `check-three-imports.ts`). A cinematic camera-easing helper that needs a `Vector3` imports it from
   `@pryzm/renderer-three`.
3. **No new `requestAnimationFrame` loop** (P3, hard-fail CI gate `check-raf-count.ts`). Only a one-shot
   settle is permitted, and only where C59 §2 invariant 2 already permits one.
4. **Every intent flows through `SiteEntryStore.dispatch`** (P6). No UI code calls `viewer.camera.*`
   directly. A code-review finding a `.flyTo(` call inside a click handler rather than inside a
   store-effect port is a violation, per the exact language C60 §4 uses for its own picker.
5. **No hand-maintained coverage/city/country list anywhere in new code** (C60 §2). If a new UI surface
   needs "which places does PRYZM cover," it calls `listJurisdictionCoverage()` — never a literal.
6. **No new `(window as any)`** (P4). If a global is genuinely needed, it is typed in
   `apps/editor/src/types/globals.d.ts`, following the existing `pryzmToggleGIS`/`pryzmStartBoundaryDraw`
   pattern.
7. **Every new exported function opens ≥1 OTel span** (P8), named `pryzm.site-entry.*` or
   `pryzm.geospatial.*` per the existing convention (C12 §3, C19 §1.7).
8. **No panel copy states a fact about a place PRYZM did not compute** (C60 §3 normative copy rules) —
   this applies to every new onboarding surface, not only the ones C60 already built.
9. **Reuse before creation, always**: before writing a new provider, mounter, store, or reducer, check
   whether `packages/site-parcel-data/src/providers/`, `apps/editor/src/engine/views/`, or
   `apps/editor/src/ui/geospatial/` already has it. This document exists specifically because that check,
   done rigorously, found that ~70% of this PRD's ask already exists.

---

## §11.1 — Addendum: sharper citations (confirmed by a second independent read-through)

A few claims above are worth pinning to exact lines for whoever implements next:

- **The modal→RAC→create chain, precisely**: `ProjectHub.ts:1311` `openNewModal()` shows `#ph-new-modal`
  → `ProjectHub.ts:1334` `handleCreate('guided')` reads the three fields and calls
  `this.callbacks.onStartOnboarding({ name, projectType })` **without creating a project yet** →
  `PlatformRouter.ts:557` wires that callback to `this.showOnboarding(seed)` → `PlatformRouter.ts:663`
  mounts `RACChatbotPanel` seeded with the modal's values → on brief-ready, `briefBootstrap.ts:199`
  calls `deps.createAndOpenProject`, arms a one-shot `runtime.events.on('pryzm-project-loaded', …)` at
  `:230`, and inside that handler calls `startOnboardingStepFlow(...)` at `:246`. So the *actual* project
  record is not created until after both the modal AND the RAC chat complete — Milestone 1 (§10) removes
  the modal step from the front of this chain; it does not need to touch the RAC/brief/create sequencing
  behind it.
- **The project starts genuinely empty, confirmed at the snapshot level**:
  `PlatformShell.ts:196-212` — a brand-new project with no local versions loads
  `this._makeEmptySnapshot(id, name)` and emits `pryzm-project-loaded` with **`empty: true`**; a second
  fallback at `:395-399` does the same when no server version exists either. `siteDispatch.ts:1097-1106`
  further notes `window.projectContext` (`@pryzm/core-app-model`) has **no `projectId` field at all** —
  only `activeLevelId`/`editorMode` — so there is no ambient site/geospatial context threaded in at boot;
  a `Site` aggregate is created lazily by `ensureSite()` (`siteDispatch.ts:1136`, deterministic id
  `site_<projectId>`) only when the onboarding flow or a manual GIS action first calls it. This confirms
  §1.6's framing: "already knows parcel/planning/terrain" (the PRD's ask for the post-creation workspace)
  is not yet true even mechanically — the empty-snapshot path is the default today, and threading the
  freshly-selected site into that first snapshot (rather than leaving it for `ensureSite()` to backfill
  later) is itself a small, identifiable increment worth folding into Milestone 3.
- **`GeospatialSlot`, exact shape** (`packages/runtime-composer/src/types.ts:3311-3323`): three members
  only — `project(latLng): xyz`, `unproject(xyz): latLng`, `isConfigured(): boolean`. It is a coordinate
  projector, not a viewer handle and not a coverage registry — confirms §1.6's characterisation and rules
  out routing any new coverage/entry logic through this slot; that logic belongs in `SiteEntryStore`
  (C60), which this slot does not touch.
- **`CesiumViewport.setVisible(visible)`** (`:12443-12463`): the concrete mount/dismount seam every new
  pane-hosting or globe-intro code reuses — `true` restores `display:block` + the raised z-index and
  hides the BIM canvases beneath it (`setBimCanvasesHidden(true)`) before forcing a resize+render; `false`
  reverses both. Confirms C59's "re-parent/re-show the one instance" model is already the literal
  mechanism in code, not just a contract aspiration.
- **Terrain-in-Forma is more nuanced than a flat "always off"**: `maybeAttachTerrainProvider`
  (`CesiumViewport.ts:6641-6680`) actually skips terrain specifically on the **true photoreal** (Google
  3D Tiles) path, because those tiles already carry ground + buildings and attaching terrain there would
  double-ground/z-fight; on the **keyless Forma flat-ground** path terrain is intended ON per a
  2026-07-26 founder directive, gated by the pure `decideBakedTerrainAttach(...)` reducer. This refines
  — but does not reverse — the C12 §9 / L-631 concern §1.2 and §6 raise: the open conflict is real, but
  it is credential-path-conditional, not a universal switch. Re-verify the live current state of
  `:5993`'s guard before any milestone assumes either behaviour.

---

## §12 — Summary of conflicts flagged for founder decision

| # | PRD ask | Conflict | Resolution proposed |
|---|---|---|---|
| 1 | "Do NOT open a modal asking for name/description/building type" | `ProjectHub.ts:1311-1370` opens exactly this modal today | Milestone 1 (§10) — small, isolated, no founder decision needed beyond confirming the auto-name scheme |
| 2 | "Cinematic globe search, no loading screens" | C60 §1.3: `countryCode` stays `null` and unnamed until a registered jurisdiction resolves — no invented country/place statistics | Keep the cinematic fly-to; scope all displayed copy to `listJurisdictionCoverage()` output only |
| 3 | Progressive streaming Level 2 (terrain) | Terrain relief is OFF in 3D-Site/Forma view everywhere today (C12 §9, L-631) — **already an open, founder-escalated conflict predating this PRD** | Do not promise terrain-in-globe-intro until the founder resolves L-631 (accept known z-fight regression now, or wait for the SiteFrame reseat) — this document does not re-decide it, it surfaces it |
| 4 | Progressive streaming Levels 3 (roads) and 5 (trees) | No existing layer or data source | Scope as their own geodata-sourcing milestones (Milestone 5), not bundled into the onboarding UI work |
| 5 | "Same camera angle in all 3D views" (implied by a single continuous immersive experience) | This is C59's own **open founder decision** (§2.7.7: angle-only vs angle-and-distance), separately unresolved | Defer to C59's roadmap; this PRD's milestones do not require it |
| 6 | "Google Maps" listed as an existing asset to reuse | No Google Maps JS SDK usage found anywhere in `apps/editor/src`; the only Google dependency is the Photorealistic 3D Tiles API key already used by Cesium | Correct the asset inventory; no separate integration exists to reuse |
| 7 | Phase 2's `directEntry` default silently seeds every new project's typology as `'apartment'` (§14.2) — a real, visible product behavior with no in-flow explanation | **Founder-directed follow-up (2026-08-06, live):** "this will need to be tackled after — depending on the plot the user will be ask to choose the typology between what makes sense according to the regulations." The silent `'apartment'` default is accepted as the interim state, NOT the final answer — it must be replaced once a site/parcel is selected. | **Zoning-informed typology prompt, post-site-selection** — once the user has picked a parcel (after Milestone 2/3's globe → site flow), PRYZM already computes the parcel's buildable envelope + zone/subzone from the site-parcel-data rule-pack pipeline (`applyZoning`, per-jurisdiction rule packs — see [[architectural-program-rules]] / the existing zoning dispatch chain). That resolved zone data should drive which typologies are OFFERED (e.g. a zone whose ordinance only permits single-family shouldn't offer "office tower"), and the user picks among the REGULATION-COMPATIBLE options rather than being defaulted silently or asked with no grounding. This is its own scoped milestone — NOT part of Milestone 2/3's globe-and-site work — because it needs: (a) a mapping from each jurisdiction's zone/subzone codes to the typology registry's ids (per-jurisdiction, mirrors the zoning rule-pack sourcing discipline C57/C58 already use — do not invent a second classification system), (b) a UI moment after site confirmation and before generate, (c) explicit fallback behavior for zones with no clean typology mapping (never silently guess — same honesty discipline as §14.2 flagged, applied correctly this time: ask, don't default). Scope and sequence this as a new numbered milestone once Milestone 2/3 land; do not bundle it into either. |

---

---

## §13 — Phase 1 Implementation Log (2026-08-06, second pass — code changes)

This section is appended, not a rewrite, per C31 §1.2 discipline. It records what was
re-verified before touching code, and exactly what this pass implemented (PRD Milestone 1 plus
the label rename this session's task brief bundled into "Phase 1").

### §13.1 — Re-verification findings (do not trust the prior pass's claims blind)

- **The modal genuinely gates creation today, confirmed at the exact call sites**:
  `ProjectHub.ts` — `#ph-new-btn` (sidebar), `#ph-card-new` (grid "+ New Project" tile), and
  `#ph-mobile-new-btn` (mobile) all called `openNewModal()`, which shows `#ph-new-modal` and
  requires the user to interact with it before `handleCreate('guided')` (bound to
  `#ph-modal-create`) reads `#ph-new-name`/`#ph-new-description`/`#ph-new-type` and calls
  `onStartOnboarding({ name, projectType })`. §1.1's characterisation stands: the modal's fields
  are a *seed* for the RAC chat, not a blocking form for a blank create — but the modal itself
  (open → type-or-not → click Create) is still a mandatory intermediate screen. Milestone 1
  removes exactly that intermediate screen.
- **`siteEntryModel.ts` is confirmed still UNWIRED** — re-grepped
  `siteEntryStore|SiteEntryStore|siteEntryModel|SiteEntryPanel` across `apps/editor/src` excluding
  its own `engine/views/` directory and its test files: zero consumers. §1.4's finding stands,
  unchanged since the PRD's first pass.
- **The label**: the single always-on GIS entry launcher (`GISAreaLayout.ts`, function
  `mountSiteViewLauncher`, `id="pryzm-site-view-launcher"`, `data-testid="site-view-launcher"`)
  read `'◉ 3D Site / Globe'` — this is the literal "user-facing GIS entry surface" the task asked
  to rename (present from any 3D view, opens the one Cesium viewer at globe/site altitude, per
  C59 §2 invariant 1). Renamed to `'◉ PRYZM Earth'`. Other view-mode SEGMENT labels inside
  already-open panes (`'◉ 3D globe'` at `GISAreaLayout.ts:1027`, `'◉ 3D Site'` at `:1041`, the
  `ctxLabel` `'3D Site'` at `:3611`) were deliberately left as-is — they distinguish sibling view
  modes from each other once already inside the GIS/Forma surface, not the product-facing entry
  point, and renaming them was not part of this scoped ask.

### §13.2 — What this pass actually touched

1. **`apps/editor/src/ui/platform/projectAutoName.ts` (NEW)** — exported, DOM-free
   `generateUntitledSiteName(now?: Date): string` producing `"Untitled Site — YYYY-MM-DD HH:MM"`.
   Isolated into its own file (rather than living inline in `ProjectHub.ts`) specifically so it
   stays unit-testable under this app's node-environment vitest config — `ProjectHub.ts` itself
   transitively imports DOM-constructing code at module scope (`AppTheme.ts` → `ViewTabBar.ts`
   calls `document.createElement` in a constructor reached at import time) and is not importable
   under `environment: 'node'`. OTel span per P8.
2. **`apps/editor/src/ui/platform/ProjectHub.ts`** — added `startGuidedOnboardingDirect()`
   (private method, OTel span): applies the same `EntitlementStore.canCreateProject` monetization
   gate `handleCreate` already applies, generates a placeholder name via
   `generateUntitledSiteName()`, and calls `this.callbacks.onStartOnboarding({ name })` directly —
   same guarded fallback-to-blank-create-on-throw `handleCreate('guided')` already used. The three
   "+ New Project" entry points (`#ph-new-btn`, `#ph-card-new` click + Enter-keydown,
   `#ph-mobile-new-btn`) now call this instead of `openNewModal()`. **The modal
   (`openNewModal`/`closeNewModal`/`handleCreate`) is NOT deleted** — it is simply no longer the
   only path in, per the task's explicit instruction not to remove code that might be reused; no
   other call site currently reuses it, but keeping it is zero-cost and reversible.
3. **`apps/editor/src/ui/layout/GISAreaLayout.ts`** — renamed the always-on GIS entry launcher's
   button text/title (`mountSiteViewLauncher`) from `'◉ 3D Site / Globe'` to `'◉ PRYZM Earth'`,
   plus the adjacent code comments that quoted the old label.
4. **`apps/editor/__tests__/projectHubAutoNamedOnboarding.test.ts` (NEW)** — 5 unit tests for
   `generateUntitledSiteName` (exact format, zero-padding, determinism for a given `Date`,
   default-to-now, non-blank guarantee). All passing.

### §13.3 — Deliberately deferred (not attempted this pass)

- **Wiring `siteEntryModel`/`SiteEntryStore` into `OnboardingStepController.ts`** — confirmed
  unwired (§13.1), and the task brief asked for it conditionally ("if it genuinely is not wired
  yet"). Deferred anyway: this PRD's own §10 sequences that wiring as **Milestone 2** — a
  materially larger change (new `GlobeHeroSearch` component, a solo-paned Cesium camera-as-
  projection-of-stage rewrite, staged panel copy review against C60 §3's no-invented-facts rule)
  that the PRD itself explicitly warns against bundling with Milestone 1 ("Explicitly rejected as
  a milestone shape... one PR touching multiple already-separately-governed subsystems"). Given
  this session's own instruction to stay conservative and flag rather than guess when a change's
  scope is ambiguous, this was left out. Re-verified finding (unwired) is recorded above so the
  next pass does not have to re-derive it.
- **RAC chat is still in the path between click and the `location` step.** The task brief's
  phrasing ("transition directly into... the location step") reads as if the RAC role/typology
  chat should be skipped entirely. It was not skipped: `PlatformRouter.showOnboarding()` only
  bypasses the RAC panel when `seededTypologyId` is resolvable from a seeded `projectType`
  (`showOnboarding` line ~720), and Milestone 1 deliberately does not guess a typology from
  nothing — that would be exactly the kind of fabrication C60 §3 (and the land-first thesis in
  PRD §0) argues against for the more consequential case of place-facts, and the same discipline
  is applied here: PRYZM does not invent a building type before the user has said what they're
  building, even to skip a screen faster. So today, after this change, clicking "+ New Project"
  goes: no modal → RAC chat (role/typology, quick) → `location` step. Removing the RAC step
  entirely is a separate, larger product decision (would need a typology-deferred generate path)
  and is out of scope for Milestone 1.
- **Milestone 3's "replace the placeholder name once location/parcel data resolves"** — not
  implemented; `generateUntitledSiteName()`'s output is not currently overwritten later in the
  flow. Flagged for whoever picks up Milestone 3.

*End addendum — Phase 1 implementation, 2026-08-06.*

---

## §14 — Phase 2 Implementation Log (2026-08-06, third pass — code changes)

Founder tested Phase 1 live and reported two problems via screenshots + a full browser console log,
both directly contradicting the PRD's "never present an empty screen" / "no modal" thesis, and gave
an explicit, direct instruction overriding §13.3's deferral: **"the goal ... is after click new
project - go directly to PRYZM EARTH."**

### §14.1 — What the founder's live evidence actually showed

1. **The RAC role/typology chat still blocked the globe**, exactly as §13.3 predicted and
   deliberately left in place pending a founder decision. The founder's decision: skip it.
2. **A second, more severe bug the console log exposed that §13.3 did not anticipate**: after the
   RAC brief resolved, `PlatformRouter`'s `createAndOpenProject` → `launchWorkspace` chain boots the
   **full BIM engine** synchronously — every builder subsystem (walls, slabs, stairs, furniture,
   lighting, 37 stores), `DefaultViewsManager` creating default 3D/plan/elevation views, the full
   engine chrome — and only *after* all of that does `[onboarding-step] starting guided flow
   (location → draw-or-skip → generate)` fire. The `location` step's overlay was mounting correctly,
   just underneath the engine's own body-mounted chrome (toolbars/floating panels), which independent
   investigation confirmed already reaches `z-index: 2147483000` elsewhere in the platform layer
   (`PlatformRouter.ts`'s §BACK-TO-PROJECT note documents the same class of issue). The overlay's own
   z-index was `1250` — so for a real user, the empty 3D workspace was momentarily visible *through*
   the gap before the overlay painted over it.

### §14.2 — The fix, and why it's the minimal safe change

- **RAC skip**: `ProjectHub.startGuidedOnboardingDirect()` (Milestone 1) now passes
  `directEntry: true` to `onStartOnboarding`. `PlatformRouter.showOnboarding()`'s existing
  `seededTypologyId` resolution (extracted to the new DOM-free `resolveSeededTypologyId.ts` for unit
  testability) defaults to `'apartment'` — the one always-available shipped generator — when
  `directEntry` is set and no confident `projectType` mapping exists. This reuses the **existing,
  already-founder-approved** IT-4e bypass (`if (getCurrentUser() && seededTypologyId)` — dated
  2026-06-11, "the live modal owns the WHOLE program brief") rather than inventing new routing
  machinery: the same code path that already skips RAC for a modal-seeded typology now also fires for
  the no-modal direct-entry gesture. The legacy modal-seeded path and the anonymous "Build something"
  RAC entry are both untouched — only `directEntry: true` (settable only by the no-modal "+ New
  Project" click) takes this branch.
  - **Explicitly a founder-confirmed override of §13.3's fabrication concern**, not a reversal of the
    underlying principle: §13.3 correctly identified that guessing a typology to skip a screen is the
    same class of fabrication C60 §3 forbids for place-facts. The founder's direct instruction is the
    resolution — PRYZM defaults new blank projects to the apartment generator (an explicit, documented,
    reviewable product default) rather than blocking on a question. This is a real, visible product
    behavior change worth the founder's attention: **every "+ New Project" click now silently seeds
    "apartment" as the typology** until the user changes it in the live design modal (per IT-4e, "the
    user adjusts the program live in the modal"). If a future generate-time UI doesn't surface an
    obvious "change building type" affordance, a user who meant to build an office will start from an
    apartment brief with no visible cue why. Flagged here for founder review — not blocked on it,
    since the instruction to proceed was explicit and direct.
- **Overlay z-index**: raised the `location`/globe step's overlay from `z-index: 1250` to
  `2147483000` — matching the value already established elsewhere in the platform layer for "must be
  above all editor chrome." This guarantees the globe overlay is opaque and on top for its full
  lifetime, **without changing engine-boot timing or sequencing** — deliberately the smaller, safer
  fix over deferring/reordering the engine boot itself (which the orchestrator's brief also flagged as
  an acceptable fallback if the boot proved unavoidably synchronous with project creation; it did, so
  this is the fix that was taken).

### §14.3 — Files changed

- `apps/editor/src/ui/platform/ProjectHub.ts` — `startGuidedOnboardingDirect()` now passes
  `directEntry: true`; `onStartOnboarding` callback type updated.
- `apps/editor/src/ui/platform/PlatformRouter.ts` — `showOnboarding()`/`onStartOnboarding` signatures
  accept `directEntry?: boolean`; `_typologyForProjectType` (private static method) extracted to the
  new `resolveSeededTypologyId.ts` module and replaced with a call to it.
- `apps/editor/src/ui/platform/resolveSeededTypologyId.ts` (new) — DOM-free, unit-tested
  `typologyForProjectType` (unchanged mapping, re-verified) + new `resolveSeededTypologyId` (adds the
  `directEntry` → `'apartment'` default).
- `apps/editor/src/ui/onboarding/onboardingStyles.ts` — `.pryzm-onboarding-panel` (or equivalent
  location-step overlay class) z-index raised `1250` → `2147483000`.
- `apps/editor/__tests__/resolveSeededTypologyId.test.ts` (new) — 12 tests covering the RAC-skip
  default, the registry-degraded case, precedence of an explicit `projectType` mapping over the
  default, and the unchanged legacy mapping behavior.

### §14.4 — Verification (orchestrator-run, independent of the implementing pass)

- `resolveSeededTypologyId.test.ts` + `projectHubAutoNamedOnboarding.test.ts`: **19/19 passing**.
- Root `tsc --skipLibCheck --noEmit`: clean.
- Grepped all four touched files for `import * as THREE` / `(window as any)`: none found (P2/P4
  intact). No exported function added without an OTel span (P8) — `resolveSeededTypologyId` carries
  one.
- Diffs read in full line-by-line before commit; the implementing agent's own final report was
  truncated/malformed (did not deliver the requested structured summary or append this log itself —
  written by the orchestrator from the verified diff instead). No PRD-doc or scope conflicts found
  beyond the typology-default tradeoff flagged in §14.2.

### §14.5 — Deliberately deferred (unchanged from §13.3 except where noted above)

- `siteEntryModel`/`SiteEntryStore` wiring — still Milestone 2 proper (the cinematic
  `GlobeHeroSearch` presentation layer), still not started.
- Milestone 3's placeholder-name replacement once parcel/address data resolves — still not
  implemented.
- Re-sequencing or deferring the engine-boot itself (vs. the z-index fix taken) — not attempted;
  flagged in §14.2 as the larger, riskier alternative this pass avoided.

*End addendum — Phase 2 implementation, 2026-08-06.*

---

*End — PRYZM Earth Onboarding PRD, 2026-08-06 — PROPOSAL, zero code changes.*
