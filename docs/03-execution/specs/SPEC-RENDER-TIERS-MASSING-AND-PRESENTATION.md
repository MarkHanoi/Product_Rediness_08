# SPEC — Dual render tiers: Massing (Forma) + Presentation (Spacio)

Status: DRAFT 2026-06-05 · Owner: site/visualisation · Governs: C04 (rendering),
SPEC-FORMA-SITE-VIEW (massing tier). Founder-requested ("an option more simple
like Forma — and another like Spacio — way nicer and detailed").

## §1 — Intent

Two deliberately distinct visual tiers the user can switch between on the 3D view:

| Tier | Name (UI) | Surface | Look | Use |
|---|---|---|---|---|
| **T-MASS** | **Massing** | Cesium site view (`CesiumViewport`) | clean pastel/white extruded blocks + white context massing + soft ground shadow | feasibility, site/context, sun studies, "what fits" |
| **T-PRES** | **Presentation** | BIM 3D WebGPU view (Pascal + SSGI) | white (or use-coloured) architectural model with **articulated facades** (windows, balconies, parapets), studio ground + soft sky, soft ambient/contact shadows, **entourage** (trees + scale people) | client-facing presentation, the "nice render" |

T-MASS is largely shipped (SPEC-FORMA-SITE-VIEW + §10 A.21.D-FORMA). T-PRES is the
new target. **Key architectural point:** the Spacio-quality detailed look is NOT a
Cesium feature — it is the existing BIM 3D view (real walls/windows/doors/handrails/
furniture already render there via `PascalSceneLighting` + SSGI + soft shadows) put
into a **presentation render mode**. We are NOT building a new renderer; we are
adding a studio environment + entourage + material presets on top of the geometry
PRYZM already has.

## §2 — Reference image analysis (founder-supplied)

### Image A — Spacio massing/working view (grey, plan-oblique)
- Flat **grey** extruded masses, labelled on the roof (`VI`, `VII`); **white edge
  outlines** on the active mass; context masses a darker grey.
- **Measurement HUD**: live perpendicular dimension lines on edges (`7.93 m`,
  `15.56 m`, `27.51 m`, `14.11 m`), a `perpendicular` snap tag, and a readout card
  (`Distance 16.09 m · Angle −90.00°`). Edit **handles/arrows** on each face.
- A single **tree** with soft shadow; neutral very-light ground; a blue construction
  guide-line across the plot. Right-edge vertical toolbar: `3D / fit / camera /
  sun / pan / LOD / comment / terrain / …`.
- Takeaway: this is the *working massing* mode = our T-MASS + edit gizmos + a
  measurement overlay. Confirms T-MASS direction (clean blocks, edge outlines,
  roof labels, soft shadow, one entourage tree).

### Image B — Spacio presentation, white model (two towers)
- Two **white** residential blocks, ~7–8 storeys, with a **regular window grid**
  (dark recessed mullioned windows), **recessed balconies** with slim railings on
  one facade, a **flat roof with a raised parapet** and a grey roof deck.
- **Entourage**: one detailed **tree** casting a soft directional shadow; **two
  scale people** figures at the base also casting shadows.
- **Environment**: seamless light warm-grey **studio ground** (no texture), soft
  **gradient sky/background**, a single low-angle **sun** giving soft contact
  shadows + gentle side shading. Subtle **ambient occlusion** in the balcony
  recesses and at the ground contact. No photoreal textures — a "white card model".
- Takeaway: T-PRES target #1 = white-model + window/balcony/parapet articulation +
  studio env + soft sun + entourage. PRYZM already HAS the walls/windows/handrails/
  roof geometry; the gap is the **environment + entourage + white-model materials**.

### Image C — Spacio presentation, use-coloured + face edit
- Same building stock but **coloured by use**: terracotta/orange, cream/yellow,
  white, and one **face selected** (translucent lilac/blue) with an **edit gizmo**
  (move/rotate/mirror/duplicate/delete toolbar) and a **push-pull "face" handle** +
  a `19.83 m` dimension. Context buildings behind in muted tones.
- Takeaway: T-PRES target #2 = **per-mass/per-use colour-coding** (matches our
  `FORMA_USE_COLOURS`) + **face-level direct editing** in the presentation view.
  Face-editing is a much larger BIM-interaction feature — OUT of scope for the
  visual tier; tracked separately. The *colour-by-use* part IS in scope.

## §3 — Spacio product study (spacio.ai)

Early-phase **feasibility** tool — "the missing tool between napkin sketch and
detailed BIM". Clean **architectural (non-photoreal)** aesthetic; massing-focused
with simplified facade articulation; auto geo-located **site context + zoning**;
**daylight factor** + **sun-hours** + **view** analysis; real-time KPIs (areas,
unit mix); permit drawings (plans/elevations/sections); IFC/Rhino/DXF/OBJ export.

PRYZM parity check (what we ALREADY have): real BIM geometry incl. windows/balconies
(✓, ahead), Pascal 3-point + SSGI + soft shadows (✓), Cesium site context + OSM
massing (✓), NOAA sun/shadow + climate (✓, ahead), IFC/DXF export (✓), apartment/
unit generation (✓, ahead). **Gaps vs the Spacio *look*:** studio presentation
environment, entourage library (trees + scale people), white-model/use-coloured
material presets, and a one-click tier toggle. We are ahead on substance, behind on
the *presentation polish* — which is exactly this SPEC.

## §4 — Phased implementation (the queue → tracker A.24)

- **A.24.1 — Tier toggle UI.** A segmented `Massing | Presentation` control on the
  3D view (brand chip style). Massing → Cesium Forma view; Presentation → BIM 3D
  view + presentation env on. Low risk (UI + existing view activation).
- **A.24.2 — Presentation environment (BIM 3D).** A `PresentationEnvironment`
  service: clean infinite studio **ground plane** (warm-grey, soft contact shadow),
  neutral **gradient sky/background**, single soft **sun** + ambient fill (reuse
  Pascal), strengthen **AO**. Toggleable; never affects the working edit view.
  Medium risk (WebGPU/Pascal env — guard behind the mode, feature-detect).
- **A.24.3 — Material presets.** "White model" (off-white walls, subtle glass,
  grey roof deck, slim dark mullions) and "Use-coloured" (drive wall material from
  room/space occupancy → `FORMA_USE_COLOURS`). Preset switch in the tier panel.
- **A.24.4 — Entourage.** A small library: **scale people** (flat billboards or low-
  poly) + **trees** (reuse the existing tree asset seen in the Cesium view) placed
  at plot corners / entrance, casting soft shadows. Provides the human-scale Spacio
  reads. Place procedurally around the building footprint.
- **A.24.5 — Massing-tier facade hint (optional bridge).** Add faint horizontal
  floor lines + a window-grid texture to the Cesium T-MASS blocks so the *simple*
  tier reads less blank without per-window geometry. Cesium-image texture, low risk.
- **A.24.6 — Use colour-coding in T-MASS.** Already scaffolded (`FORMA_USE_COLOURS`);
  drive the mass colour from the building's dominant programme; multi-mass split for
  mixed-use. Depends on per-volume use in the model.
- **A.24.7 — (stretch) Measurement HUD** on the massing view (Image A) — live edge
  dimensions + angle readout. Separate interaction feature; backlog.

## §5 — Non-goals / out of scope (this SPEC)
- Photoreal PBR/ray-traced rendering (Spacio itself is non-photoreal; PRYZM keeps
  the clean architectural look).
- Face-level push-pull editing in the presentation view (Image C gizmo) — a BIM
  interaction feature, not a visual tier.
- A second rendering engine — T-PRES REUSES the BIM WebGPU pipeline.

## §6 — Governance
Rendering-only (C04). No schema change (P5), no new mutation path (P6), single-THREE
owner (P2) untouched (Cesium primitives are not THREE; the BIM env reuses
`renderer-three`). The tier toggle is view state, not element state (P7).
