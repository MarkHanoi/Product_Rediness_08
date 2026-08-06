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

## §15 — Milestone 2 Implementation Log (2026-08-06, fourth pass — code changes)

This section is appended, not a rewrite, per C31 §1.2 discipline. It records Milestone 2 proper
(§10): replacing the `location` step's plain text-input card with a real Cesium globe the search
box floats over, reusing the existing `CesiumViewport` singleton, the existing `siteEntryModel`
pure reducer, and the existing geocoder — adding only presentation, per §9/§10's scope.

### §15.1 — Re-verification findings (what was actually found before touching code)

- **The `location` step's prior implementation**: `OnboardingStepController.ts`'s
  `renderLocationStep()` (was `:436-499`) built a plain DOM card — prompt, hint, a text
  `<input data-testid="onboarding-location-input">`, a "Find location" submit button, a status
  line, and a "Skip — no location" button — with NO Cesium/globe of any kind behind it.
  `handleGeocode()` (was `:501-542`) called `geocodeAddress()` (OSM Nominatim, NOT Google — see
  §12 conflict #6, already corrected) directly and set `this.picked` on the first result. This
  confirmed the task brief's description exactly.
- **`siteEntryModel.ts`/`SiteEntryStore`/`SiteEntryPanel`**: re-grepped
  `siteEntryStore|SiteEntryStore|siteEntryModel|SiteEntryPanel|cesiumSiteEntryCameraPort|GlobeCameraHost`
  across `apps/editor/src` excluding their own `engine/views/` directory — **zero consumers**,
  confirming §13.1's finding still stands. `SiteEntryPanel.ts` (179 lines) IS genuinely fully
  built — pure DOM chrome, zero copy/state of its own, every string from `describeSiteEntryPanel()`
  — the PRD's "already built" claim for it holds. `siteEntryModel.ts` (790 lines, 38 of 39
  `SiteEntryModel.test.ts` cases passing — the one failure is the pre-existing, out-of-scope
  Murcia `es-30005-alcantarilla` jurisdiction-predicate defect, unrelated to this pass) and
  `siteEntryStore.ts` (255 lines) are both complete, tested, production-shaped modules that were
  simply never wired to a live UI. `GlobeHeroSearch` did not exist under any name — confirmed via
  `grep -rn "GlobeHeroSearch"` returning nothing before this pass.
- **The existing `CesiumViewport` mount path**: the ONE construction site is
  `GISAreaLayout.ts:390`, `cesiumViewport = new CesiumViewport(viewport, runtime ?? null)`, inside
  `toggleGIS(true)`'s lazy `Promise.all` import block (first activation only — idempotent on
  repeat calls). `toggleGIS(true)` alone (without the separate `pryzmEnterSiteView` split-pane
  entry point) already yields a **solo, full-screen** Cesium view: it mounts/shows the viewport
  (`cesiumViewport.setVisible(true)`, `CesiumViewport.ts:12443`) which raises its z-index above
  the BIM canvases and hides them (`setBimCanvasesHidden(true)`), and disables the Three.js camera
  controls — exactly the "solo-paned" shape §10 Milestone 2 asks for, with no `SiteAuthoringPaneShell`/
  `PaneHost` split needed. `toggleGIS` is exposed as the already-typed global `window.pryzmToggleGIS`
  (`GISAreaLayout.ts:1217`), the SAME idiom `OnboardingStepController.ts` already uses for the
  "Draw it on the map" path (`:704-738` in the pre-Milestone-2 file).
- **The existing camera-fly + geocoder mechanisms**: `CesiumViewport.flyToGeographic()`
  (`CesiumViewport.ts:12664-12701`) is a public method built FOR EXACTLY THIS (§FEAT-SITE-ENTRY-GLOBE,
  L-593, C60 §4 — its own header says so): it takes `{lat, lon, altitudeM, pitchDeg, instant?}`,
  guards a live viewer, and calls `viewer.camera.flyTo`/`setView` — the exact shape
  `siteEntryStore.ts`'s `GlobeCameraHost` interface and `cesiumSiteEntryCameraPort()` adapter
  (`siteEntryStore.ts:87-122`) already expect, structurally, with zero import edge to
  `CesiumViewport` (by design, per that file's own comment). **No new camera/tween code was
  needed anywhere.** The geocoder is `geocodeAddress()` (`ui/site/geocodeAddress.ts`) — OSM
  Nominatim `fetch`+parse, already used by both the old `handleGeocode()` and the GIS rail's own
  `siteGeocodeSearchBox.ts`; reused verbatim as an injected dependency, never re-implemented.

### §15.2 — What this pass built

1. **`apps/editor/src/ui/onboarding/GlobeHeroSearch.ts` (NEW, DOM-free)** — the thin composition
   §9 calls for. A class with `mount()`/`dispose()`/`search(query)`, constructed with FOUR injected
   dependencies (`toggleGlobe`, `getCameraHost`, `entries`, `geocode`) so it imports no `document`,
   no `window`, and no Cesium — directly unit-testable under this app's node-environment vitest
   config (mirrors `projectAutoName.ts`/`resolveSeededTypologyId.ts`'s established pattern).
   Internally it owns ONE `SiteEntryStore` (mode `'open'`, not the shipped `'coverage-gated'`
   default — see the decision below) wired to `cesiumSiteEntryCameraPort(getCameraHost)`.
   `search()` resets the store, geocodes, then dispatches `site.entry.descend` in a loop (bounded
   to 8 iterations as a defensive guard against a future reducer regression turning it infinite —
   the real stage count is 4) until the `parcel` stage is reached, producing **one discrete
   `flyTo` per intermediate stage** exactly as PRD §7 specifies ("a chain of discrete `flyTo`
   calls... never a single continuous camera-path animation computed by application code"), then
   dispatches the terminal `site.entry.select-parcel` hand-off intent. Every exported method
   carries an OTel span (`pryzm.site-entry.globe-hero-search.*`, P8).
2. **`apps/editor/src/types/globals.d.ts`** — added `pryzmGetSiteEntryCameraHost?: () => {
   flyToGeographic(...): void } | null`, declared structurally (no import, matching the file's own
   "inlined to avoid import cycles" convention) — the ONE new typed global this pass needed,
   following the exact `pryzmToggleGIS` idiom (P4: no `(window as any)` anywhere in new code).
3. **`apps/editor/src/ui/layout/GISAreaLayout.ts`** — one line,
   `window.pryzmGetSiteEntryCameraHost = () => cesiumViewport;`, registered immediately after
   `window.pryzmToggleGIS = ...`. A resolver over the existing closure variable, not a new
   reference — returns the CURRENT viewport (survives a device-loss dispose+recreate) and `null`
   before `toggleGIS(true)` has mounted one. This is the one bridge the PRD's own §9 diagram
   assumed already existed ("owns no Cesium instance — resolves the SINGLETON via the existing
   accessor") but which, on inspection, did not — `cesiumViewport` was a private closure variable
   with no accessor. Adding it is the smallest possible fix consistent with C59 §2 invariant 1
   ("no `new CesiumViewport(...)` outside its one construction site" — this adds no construction
   site, only a read).
4. **`apps/editor/src/ui/onboarding/OnboardingStepController.ts`** — `renderLocationStep()` now
   constructs a `GlobeHeroSearch` (wiring its four dependencies to the `window.pryzmToggleGIS` /
   `window.pryzmGetSiteEntryCameraHost` globals + `siteEntryCoverageEntries()` +
   `geocodeAddress`) and calls `.mount()`, which shows the solo full-screen globe BEHIND the
   existing floating search card (the card's own backdrop is a non-interactive `box-shadow`
   scrim, per `onboardingStyles.ts:500` — never a pointer-capturing full-screen div — so the globe
   stays draggable/zoomable underneath it with zero CSS changes needed). `handleGeocode()` now
   calls `hero.search(q)` instead of `geocodeAddress()` directly, and uses the returned outcome's
   `picked`/`message` in place of the old inline geocode-result handling. A new
   `leaveLocationStep()` helper disposes the `GlobeHeroSearch` (toggles the globe back off,
   restoring the BIM canvases) on every exit path from the step — Skip, an empty query treated as
   skip, and a resolved search — plus a safety-net `dispose()` in `addCleanup()`. All existing
   `data-testid`s (`onboarding-location-input`, `onboarding-location-status`,
   `onboarding-location-skip`) and the DOM structure are unchanged, so the one existing test file
   that exercises `OnboardingStepController` (`onboardingOverlayImportBranch.test.ts`, which mounts
   directly at the `site` step and never touches `location`) is unaffected — verified by running it.
5. **`apps/editor/__tests__/globeHeroSearch.test.ts` (NEW)** — 13 unit tests against
   `GlobeHeroSearch` with fake `toggleGlobe`/`getCameraHost`/`geocode`: mount/dispose
   idempotency and ordering, empty-query/no-match/thrown-geocoder failure copy, the
   discrete-flight-chain shape (5 flights: the per-search `reset` re-affirm + 3 stage descends +
   the terminal `select-parcel` confirmation — asserted with strictly-decreasing altitude across
   the 3 real descend legs), picked-location/bbox forwarding, the deliberate `'open'`-mode
   uncovered-location success case, a second search resetting rather than continuing mid-chain,
   and that neither `mount()`/`dispose()` nor `search()` ever throw even when an injected
   dependency does.

### §15.3 — A decision this pass had to make that §9/§10 did not fully specify

- **`SiteEntryStore` mode: `'open'`, not the shipped `'coverage-gated'` default.** §10's own text
  says C60's shipped default is `'coverage-gated'` (world/country/city freely navigable, the ONE
  hard gate being descent into the `parcel` stage at an uncovered point). Wiring `GlobeHeroSearch`
  with that default would have been a **regression**: the pre-existing `location` step accepted
  ANY geocoded address, covered or not, and handed it to `createSiteFromRect` — the honest "PRYZM
  cannot answer here" refusal already happens correctly downstream, at generate/envelope time
  (C58/C64), not at the anchoring step. `'open'` mode keeps the real reducer/camera machine
  (stage transitions, the coverage lookup, the honest per-stage verdict a future `SiteEntryPanel`
  mount could still render) while lifting the ONE gate that would otherwise have silently narrowed
  what a user can anchor a site to. This is exactly the founder-relevant tradeoff C60 §5 documents
  as "switching is this option and nothing else" — flagged here rather than silently defaulted.
- **No `SiteEntryPanel` mount in this pass.** §9's component hierarchy lists `SiteEntryPanel`
  (staged coverage copy — "PRYZM can answer in N jurisdictions", country/city pick lists, etc.) as
  reused chrome. This pass does NOT mount it: `GlobeHeroSearch` drives the reducer headlessly and
  reports only a `{ok, message}` outcome to the existing status line, so the location step keeps
  its current minimal copy surface rather than gaining the full coverage-browsing panel. Reason:
  `SiteEntryPanel` is built for a *browsable* world/country/city stage flow (click a country, click
  a city, then a parcel) where the user navigates the panel's own action list — the current
  `location` step is a *search-first* flow (type an address, get flown there in one gesture). Both
  are legitimate per §4.1's "Living Earth (hero search)" row, but combining them (mount the panel
  AND drive it from search) is a materially bigger interaction-design decision than "add only
  presentation" scopes for this pass. Flagged as the sharpest deferred-polish item below.

### §15.4 — Deliberately deferred to a follow-up polish pass

- **Mounting `SiteEntryPanel` in the location step** (§15.3) — would add live coverage copy
  ("PRYZM can answer in N jurisdictions…") to the globe backdrop; not attempted this pass.
- **Free-look/click-to-descend on the globe itself** (clicking a lit region without typing a
  search) — explicitly out of scope per the task brief (Milestone 4, the coverage-rectangle +
  `ScreenSpaceEventHandler` click branch C60 §8 left undone).
- **Cinematic atmosphere/lighting configuration** (§7: `scene.skyAtmosphere`,
  `globe.showGroundAtmosphere`, time-of-day lighting) — `toggleGIS(true)`'s existing Cesium mount
  uses whatever atmosphere/lighting config `CesiumViewport`'s constructor already sets up
  (unmodified by this pass); no NEW atmosphere/cloud/lighting configuration was added. This is the
  "full cinematic polish" the task brief explicitly permits deferring in favour of a working,
  honest, reuse-first version — the globe IS real, textured, and rotatable, but its specific
  lighting/atmosphere tuning for THIS onboarding moment was not art-directed in this pass.
- **A live profile of the founder's WebGL-fallback frame budget with the globe + new toggle
  behaviour** (§10 Milestone 0 / §8's flagged unknown) — still not run; this pass could not exceed
  what static reading + unit tests can determine, per §8's own honesty note.
- **Terrain-in-Forma (L-631, C12 §9)** — untouched, per the founder-escalated open conflict this
  document does not re-decide (§12 conflict #3).

### §15.5 — Verification

- `apps/editor/__tests__/globeHeroSearch.test.ts`: **13/13 passing.**
- Re-ran the full existing regression set most likely to interact with this change:
  `globeHeroSearch.test.ts` + `onboardingOverlayImportBranch.test.ts` + `SiteEntryModel.test.ts` +
  `SiteEntryStore.test.ts` + `projectHubAutoNamedOnboarding.test.ts` + `resolveSeededTypologyId.test.ts`
  — **88/89 passing**; the one failure (`SiteEntryModel.test.ts`, the Murcia
  `es-30005-alcantarilla` jurisdiction-predicate case) is the pre-existing, explicitly out-of-scope
  Murcia rule-pack defect named in this session's own task brief ("known pre-existing unrelated
  test failures — leave alone"), unrelated to any file this pass touched.
- Root `npx tsc --skipLibCheck --noEmit`: **clean, exit 0.**
- Grepped every file this pass touched for `import * as THREE` and `(window as any)`: **none
  found** (P2/P4 intact). No exported function/method added without an OTel span (P8) —
  `GlobeHeroSearch.mount/dispose/search` each carry one.
- `git status --short` was checked before any edit; the only pre-existing changes were unrelated
  (`.vs/`, `revit-addin/.../obj/` — build artifacts, untouched).

*End addendum — Milestone 2 implementation, 2026-08-06.*

---

## §17 — Milestone 4/5 spec: Progressive Loading During Camera Flight (founder-authored, 2026-08-06)

**Status: SPECIFIED, NOT STARTED.** Captured verbatim (lightly restructured) from the founder's own
brief so it survives to whichever session picks this up — this section is a REQUIREMENT SPEC, not an
implementation log; no code was touched for this section.

**Why this is its own milestone, not a Milestone 2/3 add-on**: it spans FOUR subsystems that don't
share an obvious sequencing point today (`CesiumViewport`, `GISAreaLayout`, `SiteBoundaryMap2D`,
`CesiumThreeBridge`), requires new cache-warming/predictive-streaming machinery none of the four
currently have, and its success criterion ("zero perceived loading after arrival") is exactly the kind
of cross-subsystem timing claim that needs its own honest performance investigation (mirrors Milestone
0's already-flagged need for real frame-budget profiling, §10) before any implementation — not a
plausible-looking change bolted onto the search flow. Bundling it into Milestone 2/3 is precisely the
"one PR touching multiple already-separately-governed subsystems" shape §10 rejects by name.

### §17.1 — The non-negotiable requirement

> The user should never arrive at the parcel and then wait 3–5 seconds for the GIS, parcels,
> buildings, or planning layers to load. The camera flight is free loading time... The cinematic
> flight is not just an animation — it is the application's opportunity to progressively prepare the
> entire workspace... The objective is that, by the time the camera finishes its movement, the
> complete site-authoring interface is already ready.

### §17.2 — Progressive loading pipeline, by camera scale

| Scale | Begin loading |
|---|---|
| Planet | Earth imagery, atmosphere, terrain, global labels |
| Country/Regional | Local imagery, terrain tiles, road network, building tiles, administrative boundaries |
| City | Parcel vector tiles, planning layers, existing GIS datasets, terrain mesh, photorealistic buildings, existing Cesium tiles, existing Three.js overlays |
| Neighbourhood | Parcel geometry, neighbour parcels, site envelope, planning constraints, building heights, streets, trees, utilities (future), analysis layers (future) |
| Parcel | Everything already in memory — the application simply REVEALS the interface. No loading indicators, no waiting, no spinner, no blocking. |

### §17.3 — Existing components MUST be reused, not redesigned

Once the camera reaches neighbourhood/parcel scale, transition into the EXISTING PRYZM Site
Authoring interface — do NOT redesign this workflow or create a new parcel-selection interface.
Specifically reuse, unmodified: the existing split-screen layout (2D GIS left / 3D Site right),
existing parcel highlighting, existing parcel dimensions, existing envelope computation, existing
planning overlays, existing camera behaviour, existing `CesiumViewport`, existing `GISAreaLayout`,
existing `SiteBoundaryMap2D`. **The new feature only replaces everything BEFORE this stage** — this
matches §1.3/§3.1's existing "do not duplicate the split" ruling exactly; §17 does not reopen that
question, it reinforces it.

### §17.4 — The target sequence

```
Dashboard → New Project → PRYZM Earth → Search → Fly to Location
  → (progressive streaming begins) → Terrain loads → Buildings load
  → Parcels load → Planning loads → GIS initializes
  → Split-screen fades in (Left: 2D GIS · Right: 3D Site)
  → Parcel selection → Define Site → Continue → Workspace
```

The split-screen must appear NATURALLY as the camera reaches the city — not as a hard cut the moment
a location resolves (today's actual behavior, per Milestone 2/2-polish — see §15/§16). The founder's
own framing: "the user should feel that they are gradually entering the professional GIS environment
rather than switching applications."

### §17.5 — Performance requirement: the camera flight IS the loading screen

Never stop the camera to wait for data. Instead: predictively stream tiles, preload parcel data
around the destination, initialize `GISAreaLayout` in the background, create the `CesiumViewport`
before arrival, initialize Three.js overlays during the flight, warm planning/parcel/terrain/imagery
caches. Goal: on arrival, the interface is already interactive — the user can click a parcel
immediately.

### §17.6 — Technical requirement: treat the flight as a background init pipeline

While the camera is in motion: mount `CesiumViewport` off-screen if necessary, initialize
`GISAreaLayout`, prepare `SiteBoundaryMap2D`, initialize `CesiumThreeBridge`, warm tile caches, load
nearby parcel vectors, load planning layers, resolve terrain, attach photorealistic tiles, prepare
parcel selection. By arrival, the existing GIS interface simply fades in — zero perceived loading
after arrival.

### §17.7 — Open questions this session did not resolve (flag before implementation starts)

1. **Does the flight duration (today's `flyToGeographic` timing, §15's cinematic chain) leave enough
   wall-clock time to actually warm these caches** on a realistic connection, or does the loading work
   dominate and the "flight as loading screen" framing become aspirational rather than real? This is
   exactly the kind of claim Milestone 0's frame-budget profiling (§10) was scoped to answer honestly
   — do that investigation FIRST, on a live device, before committing to a specific pipeline shape.
2. **What actually gates the split-screen reveal** — is it "all four subsystems report ready" (risk:
   the slowest one holds up the whole reveal, defeating the point) or a race with a hard ceiling
   (risk: reveals before data is real, reintroducing the loading-after-arrival the founder wants
   eliminated)? Needs an explicit design decision, not an implicit one.
3. **Terrain-in-Forma (L-631, standing founder-escalated conflict, §12 row 3)** intersects this
   directly — "warm terrain caches" during flight is exactly the kind of work that conflict blocks a
   clean answer for. Resolve L-631 before or alongside this milestone, not after.
4. Relationship to Milestone 4 ("globe-click → descend + the lit coverage rectangle") and Milestone 5
   ("progressive-streaming completeness — road network + vegetation as new data-sourcing projects,
   also where terrain-in-Forma needs a founder decision") in the existing §10 roadmap: §17 is best read
   as the concrete UX spec for what Milestones 4+5 together are FOR, not a new Milestone 7. Whoever
   picks this up should fold §17 into 4/5's scope rather than tracking it separately.

*End §17 — requirement spec only, 2026-08-06. No implementation attempted this pass (budget-constrained
session; flagged for a dedicated future pass rather than a partial/rushed attempt at a
four-subsystem, cross-cutting change).*

---

## §18 — §17 Increment 1 Implementation Log (2026-08-06, fifth pass — code changes)

This section is appended, not a rewrite, per C31 §1.2 discipline. It records §17 Increment 1 only
(per this pass's own scoping instruction): **at most 1–2 concrete, safe, verifiable prefetch/init
hooks**, triggered by the EXISTING `GlobeHeroSearch.search()` stage-reducer chain — not the full
§17.2 cache-warming table, not the gated split-reveal, not Milestone 0 profiling, not L-631.

### §18.1 — Investigation findings (grounded in code, cited)

- **Country/city scale — is anything already free?** Yes, and nothing new was added there. At
  world/country/city altitude, the mounted `CesiumViewport`'s own Cesium imagery/terrain providers
  stream tiles for whatever is on screen the moment the camera arrives — this is Cesium's own
  built-in behaviour (tile-based imagery/terrain providers fetch what's visible), not something
  this codebase's application code drives or could meaningfully "start earlier" — there is no
  additional PRYZM-owned fetch at this scale to hook. Inventing a fake "loading" step here would
  contradict the task's own instruction not to fabricate work for something already free.
- **City scale — is there an existing predictive-fetch target?** Yes: `fetchContextBuildingsNearAndFar`
  / `fetchContextBuildings` (`apps/editor/src/ui/geospatial/contextBuildings.ts:883-951`) already
  has exactly the shape needed — a per-bbox `cache: Map<string, ContextBuildingCollection>`
  (`:490`) plus an `inFlight: Map<string, Promise<...>>` de-dup guard (`:494`, `:946-950`,
  §CTX-ONE-READ-PER-BBOX/L-585) so a second caller with the SAME bbox key gets the in-flight
  promise instead of starting a cold fetch. This machinery is not new — it is the exact mechanism
  an EXISTING prefetch (§CTX-PREFETCH-ON-LOCATION, L-470, `CesiumViewport.ts:2930-2947`) already
  uses, but that existing prefetch only fires on the `site.location-changed` event, which
  `createSiteFromRect` (`OnboardingStepController.ts` site-step actions) does not emit until AFTER
  the user has left the `location` step entirely (search resolved → `renderSiteStep()` →
  eventually "Use selected parcel"/draw/default-rect calls `createSiteFromRect`,
  `createSiteFromRect.ts:189-190`). That is several user-driven steps after the camera flight
  itself. §17's ask — start this while the flight is still happening — was genuinely actionable.
  A true cadastral-parcel vector-tile fetch (as opposed to building footprints) is jurisdiction-
  specific (Spain Catastro WFS etc., `packages/site-parcel-data`) and was NOT hooked — out of scope
  per this pass's "cheapest, safest hook" instruction; `fetchContextBuildings` is what
  `FootprintParcelProvider.ts:55` itself already falls back to for "select parcel" today, so
  warming its cache is the correct-shaped target, not a substitute for the real thing.
- **Parcel scale — is there a second Cesium viewport to pre-warm?** No, confirmed precisely, per
  the task's own framing. `renderLocationStep()` (`OnboardingStepController.ts:502-524`)
  constructs `GlobeHeroSearch` and calls `.mount()` — which calls `toggleGlobe(true)` — the moment
  the `location` step is entered, i.e. BEFORE the user has typed anything, let alone before
  `search()` reaches the `parcel` stage. `toggleGlobe` resolves to `window.pryzmToggleGIS`
  (`GISAreaLayout.ts:1217`), whose ONE construction site
  (`GISAreaLayout.ts:390`, `new CesiumViewport(viewport, runtime ?? null)`) is idempotent on
  repeat calls — the singleton is already live by the time `search()` even starts. Leaving the
  `location` step (`leaveLocationStep()`, `OnboardingStepController.ts:561-564`) calls
  `globeHero.dispose()`, which calls `toggleGlobe(false)` — `CesiumViewport.setVisible(false)`
  (`CesiumViewport.ts:12443-12463`) only hides the canvas and un-hides the BIM canvases; it does
  NOT tear down or reconstruct the Cesium viewer object. So entering the next (`site`) step does
  **not** rebuild anything expensive — the singleton persists, exactly as C59 §2 invariant 1
  requires. There is no second "site view" viewport to pre-warm, and nothing to build here beyond
  what §15 already shipped (Milestone 2's `whenCameraHostReady` fix already ensures the singleton
  is genuinely live before the very first camera frame).

### §18.2 — What this pass built

One hook, additive and optional:

1. **`apps/editor/src/ui/onboarding/GlobeHeroSearch.ts`** — added an optional
   `warmContextCache?: (lat: number, lon: number) => void` to `GlobeHeroSearchOptions`. Inside
   `search()`'s existing `descend` loop, the FIRST time the reducer chain lands on the `city`
   stage (`step.state.stage === 'city'`), this fires once with the geocode result's `lat`/`lon` —
   the SAME coordinates every remaining stage (including the terminal `select-parcel` hand-off)
   uses, so it primes the exact bbox key the real render-path fetch will key on later. Wrapped in
   its own `try/catch` as a defensive backstop (the module never assumes an injected dependency is
   well-behaved), on top of the fact that every production wiring of this already never throws by
   its own contract. Every existing behaviour (the flight chain, altitudes, outcome shape, error
   copy) is completely unchanged when this option is omitted — verified by the untouched existing
   13 tests all still passing unmodified.
2. **`apps/editor/src/ui/onboarding/OnboardingStepController.ts`** — imports
   `fetchContextBuildingsNearAndFar` from `../geospatial/contextBuildings.js` and wires
   `warmContextCache` to `(lat, lon) => { void fetchContextBuildingsNearAndFar(lat, lon).catch(() => {}); }`
   — fire-and-forget, matching the exact idiom the existing L-470 prefetch already uses
   (`CesiumViewport.ts:2945-2947`). This renders nothing, touches no entity, and only primes the
   shared per-bbox cache in `contextBuildings.ts`; the later real reads (this file's own
   `createSiteFromRect`/`site.location-changed` path, and `SiteBoundaryMap2D.ts:1243`) become cache
   hits instead of cold fetches, for the identical bbox key, with zero new upstream query volume
   (still one query per site — C12 §8 — just issued one flight-stage earlier).

**Why this is safe / non-blocking**: `warmContextCache` is optional (omitting it is a no-op,
verified by a dedicated test); every call site — inside `GlobeHeroSearch` and inside
`OnboardingStepController`'s wiring — is wrapped so a throw/rejection is swallowed and never
surfaces to the caller; it does not gate, delay, or branch the existing `descend`/`flyTo` chain in
any way (it fires "alongside", not "before"); and `fetchContextBuildingsNearAndFar` itself is
already documented as never-throwing (`contextBuildings.ts:874-876`). No new Cesium/viewport
construction site (P1), no new `THREE` import (P2), no new `requestAnimationFrame` (P3), no new
`(window as any)` (P4) — grepped all three touched files, none found. `GlobeHeroSearch.search()`
already carries its P8 OTel span; no new exported function was added that lacks one.

### §18.3 — Tests

- `apps/editor/__tests__/globeHeroSearch.test.ts` — extended with 4 new cases (harness now accepts
  an optional `warmContextCache` fake): fires exactly once with the geocoded lat/lon the moment the
  chain reaches `city`; is a genuine no-op when the dependency is omitted; a throwing
  `warmContextCache` does not fail the search; a second `search()` call fires it again (once per
  search, not once ever). The file now has 20 `it(...)` cases total (§15.2 recorded 13 at
  Milestone 2; the gap reflects both this pass's 4 new cases and cases added by the
  `whenCameraHostReady` polish work reflected in the code's own "PRD §16" comments but never
  logged as its own numbered doc section — not this pass's addition, re-counted here rather than
  assumed).
- Actual run, `npx vitest run __tests__/globeHeroSearch.test.ts` (from `apps/editor/`):
  **20 passed / 20 total.**
- Broader regression sweep, `npx vitest run __tests__/globeHeroSearch.test.ts
  __tests__/onboardingOverlayImportBranch.test.ts __tests__/projectHubAutoNamedOnboarding.test.ts
  __tests__/resolveSeededTypologyId.test.ts` (from `apps/editor/`): **49 passed / 49 total**, 4
  files, 0 failures.

### §18.4 — Typecheck

- Root `npx tsc --skipLibCheck --noEmit`: **clean, exit 0**, no output.

### §18.5 — Honest assessment

This is a genuine, if modest, latency win — not a speculative one. It moves an EXISTING,
already-proven prefetch (L-470) from firing at "user has committed to a parcel and clicked through
the site step" to firing at "camera flight has reached city altitude", which per the flight's own
staged `flyTo` chain is several real seconds and at least one full user decision earlier. Because
the prefetch keys on the exact same lat/lon that the later real read uses, this is a literal cache
hit, not an approximation — `fetchForBbox` (`contextBuildings.ts:904-951`) returns the cached
value directly on a key match. That said, or honestly: this pass did **not** find much else safe
to prefetch beyond this one hook without a materially bigger change. Country/city-scale
imagery/terrain is already free via Cesium's own providers (nothing to add). A true cadastral-
parcel-vector fetch is jurisdiction-specific and was correctly left out of this pass's scope. The
"second Cesium viewport" the spec worried about pre-warming does not exist — the singleton is
already mounted by the time any of this fires, which closes off what would otherwise have been the
single highest-leverage hook in §17.2's table. So the honest framing is: **one real, verified,
safe win was found and shipped; the rest of §17.2's table genuinely has no cheap, safe target in
this codebase today** — the remaining wins (planning layers, terrain mesh, photorealistic
buildings, cadastral parcels) all require either new jurisdiction-aware fetch code or the
gated-reveal design decision §17.7 explicitly reserves for the founder, neither of which this pass
was scoped to attempt.

### §18.6 — What's left for a §17 Increment 2

- **§17.7 open question 2 — what gates the split-screen reveal.** Not attempted (explicitly
  out of scope this pass, needs the founder's own definition of "ready").
- **The full §17.2 cache-warming table** — planning layers, terrain mesh, photorealistic
  buildings, road network, vegetation. Per §18.5, most of these have no existing PRYZM-owned fetch
  function to hook yet (would be new geodata-sourcing work per Milestone 5, not a hook-up).
- **Milestone 0's live frame-budget profiling** (§10, §17.7 open question 1) — still needs a real
  device; not attempted.
- **L-631 (terrain-in-Forma)** — still open, still a founder decision, untouched by this pass.
- A genuine cadastral-parcel (not building-footprint) predictive fetch, if a jurisdiction-aware
  provider with the same cache/dedup shape as `contextBuildings.ts` gets built later — this pass's
  `warmContextCache` hook point in `GlobeHeroSearch` would accept a second/replacement callback
  with no further changes to the reducer-chain wiring.

*End §18 — §17 Increment 1 implementation, 2026-08-06.*

---

## §19 — Cesium Pre-warm Investigation Log (2026-08-06, sixth pass — investigation only, no code shipped)

**Trigger**: founder tested live — after "+ New Project" the globe visibly takes several seconds to
appear. A real console log shows the FULL BIM-engine boot (37 stores, all builder subsystems,
`DefaultViewsManager`, every handler registration — hundreds of log lines) running to completion
BEFORE `GIS toggle activated: true` fires and `CesiumViewport: Mount started` begins. This session's
task was to apply the same idiom `ensureEngineWarm()`/O.14 uses — start an expensive subsystem early,
in parallel with onboarding — to `CesiumViewport`.

### §19.1 — Is `ensureEngineWarm()` actually analogous to what Cesium needs?

`apps/editor/src/engine/engineWarmup.ts` (full file read). `ensureEngineWarm()` (`:92-105`) is called
from `PlatformRouter.showOnboarding()` (`apps/editor/src/ui/platform/PlatformRouter.ts:645`) — the
instant "+ New Project" is clicked, before any RAC step renders. What it actually warms, per its own
header (`:1-57`) and body (`warmEngineModule()`, `:73-82`): **only** the dynamic-import MODULE
download + ES-module evaluation of `@app/engine/engineLauncher` (the 2.6 MB Three.js/@thatopen/web-ifc
chunk). It explicitly does **not** call `bootstrap()` — no Three.js world, no stores, no canvas mount.
The header is blunt about why: `bootstrap()` "REQUIRES a live DOM canvas (`#container`) and an open
project context... that do not exist during onboarding, so warming it early would be unsafe /
impossible" (`:38-47`).

This makes it only **partially** analogous to Cesium. The download-ahead half of the idiom (fetch the
Cesium/`@pryzm/plugin-geospatial` bytes before they're needed) is genuinely reusable. But
`CesiumViewport`'s expensive part is not a bytes-download — it's construction against a live DOM
node (`document.getElementById('container')`, `GISAreaLayout.ts:356`) that itself does not exist
until the BIM engine's own bootstrap has created it. Cesium's real bottleneck is structurally closer
to `bootstrap()` itself (the thing `engineWarmup.ts` explicitly says CANNOT be warmed early) than to
the engine-module download (the thing it safely can).

### §19.2 — Critical architectural finding: `GISAreaLayout`/`mountGISArea` is scoped per-bootstrap, not per-app-session

Traced the full call chain, file:line at each hop:

1. `CesiumViewport`'s ONE construction site: `new CesiumViewport(viewport, runtime ?? null)`,
   `apps/editor/src/ui/layout/GISAreaLayout.ts:405`, inside the `toggleGIS` closure (`:353`), inside
   `mountGISArea(props, runtime)` (`:160`).
2. `mountGISArea` is called from exactly one place: `Layout.ts:92` — `const gis =
   mountGISArea(props, runtime);` inside `createMainLayout()` (`apps/editor/src/ui/Layout.ts:86`).
3. `createMainLayout` is called from exactly one place: `apps/editor/src/engine/initUI.ts:2786`,
   inside `initUI()` (`:375`).
4. `initUI()` is one of the subsystem-init calls inside `bootstrap()`
   (`apps/editor/src/engine/engineLauncher.ts:748`, `await initUI({...})`) — i.e. it is part of the
   SAME full bootstrap sequence (37 stores, builders, tools, `DefaultViewsManager`, handler
   registration) the founder's console log shows running to completion.
5. `toggleGIS`'s first line (`GISAreaLayout.ts:356`) does `document.getElementById('container')` and
   bails if not found — the BIM canvas element that `createMainLayout`/`initUI` themselves create as
   part of the same bootstrap. There is no DOM host for Cesium to mount into before this point.
6. The global that every caller (including the onboarding "hero globe") uses to trigger
   `toggleGIS(true)` — `window.pryzmToggleGIS` — is assigned at `GISAreaLayout.ts:1243`
   (`window.pryzmToggleGIS = (active) => toggleGIS(active);`), which is INSIDE `mountGISArea`'s own
   body. It is `undefined` for the entire duration of bootstrap and only becomes callable once
   `mountGISArea` has run once. Every call site that reaches for it does so via optional chaining
   (`w.pryzmToggleGIS?.(active)` — `OnboardingStepController.ts:506`, `:821-823`, `:1013`, `:1056`;
   `GISRailPanel.ts:105`) — a silent, correctly-defensive no-op if bootstrap hasn't run yet, not an
   error.

**Conclusion**: `GISAreaLayout` (and therefore `CesiumViewport`'s only construction site) is scoped
**per-bootstrap**, i.e. effectively per-project-open on the live boot path, not per-app-session /
available-immediately. It genuinely cannot exist before the BIM engine's own `initUI()` subsystem has
run and created the `#container` DOM element.

### §19.3 — Why §18.1's "singleton already live at the `location` step" finding does not contradict this

§18.1 (this same PRD, same day, an earlier pass) found that the onboarding hero globe's `toggleGlobe`
call (`GlobeHeroSearch.mount()` inside `renderLocationStep()`) fires "the moment the `location` step
is entered... before the user has typed anything." That is true, but it answers a different question
than this pass's — "early relative to what the user does *inside* the location step" versus "early
relative to project bootstrap." Tracing when `renderLocationStep()` itself is invoked closes that gap:

- `startOnboardingStepFlow()` (`OnboardingStepController.ts:157-163`) is documented at its own call
  site as being invoked "AFTER the project is created + opened" (`:152`).
- Its one caller, `apps/editor/src/ui/onboarding/briefBootstrap.ts:246`, only calls it from inside an
  `onLoaded` handler subscribed to `pryzm-project-loaded` (`:230`) — i.e. `renderLocationStep()`
  (and therefore the hero-globe `toggleGlobe(true)` call §18.1 examined) does not run until
  `pryzm-project-loaded` has already fired.
- `pryzm-project-loaded(empty:true)` for a brand-new project is emitted from
  `PlatformShell.setProjectContext()` (`apps/editor/src/ui/platform/PlatformShell.ts:204-205`,
  `:398-399`), and `setProjectContext()` is documented as being called by the composition-root glue
  "after the engine is ready" (`PlatformShell.ts:122-126`) — confirmed in
  `src/main.ts` (the P1 `workspaceMount.ensure()`/`show()` chain, `:277`, `:307`, `:379`,
  `:547-577`): `ensure()` lazy-boots the engine (`bootstrap()`), and only once that resolves does
  `show()` go on to call `runtime.workspace.surface.setProjectContext(...)`.

So there are two independent gates stacked on top of each other, and either one alone would already
block an earlier globe mount:

- **Gate A** — `CesiumViewport`'s construction site does not exist as *callable code* until
  `mountGISArea` has run once (§19.2), which only happens inside `initUI()`, itself only reached
  partway through `bootstrap()`.
- **Gate B** — even once Gate A closes, the onboarding flow's own trigger to call
  `toggleGIS(true)` (`renderLocationStep()`) is not invoked until `pryzm-project-loaded` fires, which
  is emitted only after `bootstrap()` has fully resolved AND `setProjectContext()` has run.

§18.1 was correct about "location step relative to typing"; this pass adds "location step relative to
bootstrap," which is the gate that actually produces the founder-reported delay.

### §19.4 — Verdict: blocked without touching P1 sequencing

Both gates terminate at the same place: `src/main.ts`'s `ensure()`/`bootstrap()`/`setProjectContext()`
chain — exactly the P1 composition-root sequencing this task's own hard constraints forbid touching.
There is no earlier hook in `PlatformShell`'s or `ProjectLoader`'s sequence that fires once the
project's shell exists but before builder subsystems finish — `mountGISArea`/`createMainLayout` is
itself one atomic step inside `initUI()`, which is itself one atomic step inside `bootstrap()`, and
`pryzm-project-loaded` (the event every downstream consumer, including the onboarding step flow,
keys off) is deliberately emitted only once that whole chain — plus the empty-snapshot load — has
settled.

**What would actually need to change, and why it's risky** (informational only, NOT attempted this
pass):

1. Split `initUI()`/`mountGISArea()` so the `CesiumViewport` construction site (and the `#container`
   DOM element it needs) is created in an early phase of `bootstrap()`, ahead of store/builder/tool
   init, rather than at its current position. This changes `bootstrap()`'s internal sequencing — the
   exact thing P1 reserves to the composition root and this task was told not to touch. It also risks
   subtle ordering bugs: several existing comments in `GISAreaLayout.ts` (`:416-433`, the `§L-446`
   runtime-injection healing logic) already document that `runtime` can be `null` at `CesiumViewport`
   construction time and self-heals later — reordering construction earlier could change which state
   that healing logic sees first.
2. Alternatively, decouple `pryzm-project-loaded` from "bootstrap fully done," e.g. an earlier
   "project shell exists" event the onboarding step flow could listen for instead. This still doesn't
   solve Gate A (the DOM host + `mountGISArea` call are still nested inside `initUI()`/`bootstrap()`),
   so it would need to be paired with (1) anyway, and touches the same `pryzm-project-loaded`
   contract at least a dozen other subsystems currently key off (`initCollaboration.ts`,
   `initDataPlatform.ts`, `initScene.ts`, `initTools.ts`, `UnderlayPersistence.ts`,
   `PlatformSaveController.ts`, several `dataworkbench` panels — all grepped, all listening for the
   SAME event with the SAME "bootstrap is done" assumption baked in). Changing its meaning without
   auditing every listener is a much bigger, riskier change than this pass's scope.

Per this task's own instruction, this is the honest, complete finding: **no safe lever exists to mount
`CesiumViewport` earlier without restructuring `bootstrap()`'s internal sequencing or the
`pryzm-project-loaded` contract — both of which are P1 composition-root concerns explicitly out of
scope for this pass.** No code was changed. `git status --short` at both the start and end of this
pass shows only pre-existing, unrelated `.vs/`/`revit-addin` build noise — nothing in `apps/editor/src`
or the PRD was touched except this section.

*End §19 — investigation only, no code shipped, 2026-08-06.*

---

*End — PRYZM Earth Onboarding PRD, 2026-08-06 — §1-§19; §17.2's full table, the gated split-reveal,
Milestone 0 profiling, L-631, and §19's P1-sequencing lever all remain open.*
