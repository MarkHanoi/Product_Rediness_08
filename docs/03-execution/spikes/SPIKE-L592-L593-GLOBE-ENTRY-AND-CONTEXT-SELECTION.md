# SPIKE — L-592 (context-building selection) · L-593 (3D globe entry flow)

**2026-07-22.** Two founder spikes, investigated against the code and the contract set. **Neither is
implemented; nothing here is a fix.**

---
---

# L-592 — Are the 3D-Site context buildings queryable / selectable?

## Step 1 — Classification

**NEW FEATURE.** Not a bug (nothing behaves wrongly), not a gap (no spec ever promised it).

**Severity: P2 — post-launch acceptable.** Nothing today depends on selecting a neighbour: the
envelope, the depth construction and the generators all read context through
`setNeighbourFootprints`, never through a selection. It is a **capability** the massing view lacks,
not a defect a user hits.

⚠ **But it carries a P1-shaped honesty risk the moment it ships** — see §Blocker below.

## Step 2 — Architectural alignment (searched, not assumed)

| Where | Finding |
|---|---|
| `C12-GEOSPATIAL` | Covers context buildings as **rendered geometry** (§191: fetched, near ring + far LOD ring) and the raycast at §149. **Says nothing about selection or query.** |
| `C19-SITE-MODEL-AND-PARCEL` | Owns the *parcel* selection surface. **Context buildings are not site model objects** — they are transient scene decoration, never persisted. |
| `C57-PARCEL-DATA-LAYER` | Parcel adapters. Context footprints are NOT parcels; do not route them here. |
| `C06-UI-SHELL-AND-TOOLS` | §206 `contextualBar` z-layer 9100 for "selection-driven contextual edit bars"; §208 `popover` 20000. **A query panel has a z-slot already defined** — it must take the next slot, never a hand-picked `z-index` (§233). |
| `C59-MULTI-PANE-VIEW-SYSTEM` | `site-3d` is a pane-hosted view. Any chrome sits **above its own pane only** (§1.3). |
| ADRs | **None constrain this.** |
| specs | `SPEC-FORMA-SITE-VIEW.md` covers the Forma view; **no selection/query spec.** |
| strategy | `STR-12-site-and-cognition-strategy.md` — site cognition. No conflict. |

> ⚠ **COVERAGE GAP (a finding in its own right): no contract covers the 3D-Site scene's SELECTION
> model.** BIM selection has `SelectionBus`/`SelectionManager`/`gpu-pick`; the Cesium scene has an
> ad-hoc `ScreenSpaceEventHandler`. **Two selection models, neither contracted.** Logged to
> `MISSING-CONTRACTS-AUDIT`.

**No conflict found between the request and the architecture.**

## Step 3 — The architecturally-sound approach

**The infrastructure already exists. This is one branch plus a panel, not new plumbing.**

- `CesiumViewport.ts:1899` already installs a `ScreenSpaceEventHandler` and calls
  `scene.pick(movement.position)` on `LEFT_CLICK`, inside the **§FORMA-CLICK-NO-NAV** try/catch.
- It branches on `Cesium.Model` (GLB) and `Cesium3DTileFeature`. **It does NOT branch on a picked
  Entity**, so a context building falls through to *"clicked away — deselect"*.
- The data is **already retained**: `contextBuildingPlacements: Array<{ entity, feature }>`
  (`CesiumViewport.ts:898`, pushed at :6207) pairs each entity with its `ContextBuildingFeature` —
  OSM tags, `heightM`, `heightProvenance`, `syntheticId`.

⇒ **Correct fix:** add an Entity branch that resolves `pickedObject.id` back through
`contextBuildingPlacements`, and render a **read-only** info panel on the existing `contextualBar` /
`popover` z-slot. **It must stay inside the §FORMA-CLICK-NO-NAV guard** — that guard exists because
an escaping pick throw once matched `ViewportCrashGuard`'s keywords, showed the crash fallback, and
its "Back to projects" link **full-reloaded the app and lost the open project**.

**Fast vs correct — they differ, and I do not recommend the fast one.**
- *Fast:* stash a lookup on the entity and read it in the click handler.
- *Correct:* route selection through a **typed accessor** over `contextBuildingPlacements` (already
  the pairing of record), and treat the panel as **read-only** — a context building is **not** a
  model object and must never become editable or persist. Also honour **P4**: no `window as any`.

**Layers touched:** client only. No server, no schema, no persistence. **This is the one item today
that is genuinely single-layer.**

### 🔴 THE BLOCKER THAT MUST BE IN THE SPEC BEFORE ANY UI SHIPS

**A query panel that reports a height without its provenance would manufacture false confidence at
the exact moment a user trusts it most.** Measured (L-582): context heights are **0.9% surveyed ·
79.3% `building:levels` × an assumed 3.2 m · 19.8% a fabricated 9 m**. The scene already draws
assumed-height buildings translucent (§CTX-ASSUMED-HEIGHT-VISIBLE) precisely so a guess does not
render like a measurement. **A panel saying "Height: 9 m" would undo that.** Any panel MUST surface
`heightProvenance`, and `syntheticId` must never be presented as an OSM id (it is minted from
`(z, x, y, index)`).

---
---

# L-593 — 3D globe entry: zoom world → country → city → parcel

## Step 1 — Classification

**NEW FEATURE** — an alternative **entry/navigation flow**. Not a gap: nothing specified it.

**Severity: P2**, with one **P1 sub-item** (§Conflict). The current 2D map entry works and is
shipped; this is a materially better front door, not a missing one. **It does not move the Barcelona
end-to-end number at all** — it changes how a user arrives at a parcel, not what we can answer once
they do.

## Step 2 — Architectural alignment

**⚠ FIRST FINDING: WE ALREADY HAVE THE 3D GLOBE. This is not "build a globe".**

`CesiumViewport` already runs a real Cesium globe with a **photoreal tiles path** (Google/ESRI,
gated on `VITE_CESIUM_TOKEN` / Google Maps key; keyless falls back to ESRI-satellite / Forma
flat-ground — `CesiumViewport.ts:180–197`), `flyToFormaSite()`, `frameSiteLocation()`, a globe ground
anchor (`globeGroundAnchor.ts`), and a **"3D Site / Globe" launcher already in the UI**. The
requested capability is therefore **progressive disclosure and selection ON an existing globe**, not
a new renderer.

| Where | Finding |
|---|---|
| `C59-MULTI-PANE-VIEW-SYSTEM` | **`site-3d` is already a registered `ViewType`.** A globe entry is a view assignment, **not** a new mechanism. ⚠ §2 invariant 1: ONE Cesium instance — the globe and the 3D Site are **the same viewer at different camera altitudes**, and must never become two. |
| `C12-GEOSPATIAL` | The LTP-ENU frame + `proj4` projector. A globe-scale camera is above the ENU frame's valid range; **the frame is established when a site is chosen**, so the globe stage must not assume one exists. |
| `C19-SITE-MODEL-AND-PARCEL` | §1.3 `dispatchSiteLocation` sets the origin; §1.4 the parcel boundary is **one-shot immutable**. ⇒ **The globe's country/city stages are PRE-SITE — they must not write site state.** Only the final parcel pick may dispatch. |
| `C57-PARCEL-DATA-LAYER` | §3.1 the jurisdiction adapter registry — this is what a country stage would have to consult to know whether we can answer there. |
| `C06-UI-SHELL-AND-TOOLS` | z-layers for the stage panels; §233 forbids hand-picked `z-index`. |
| `SPEC-FORMA-SITE-VIEW.md` | The Forma/3D site view. **Does not cover a globe-scale entry flow.** |
| ADRs | **None found constraining a globe entry flow.** |
| strategy | `STR-12-site-and-cognition-strategy.md`, `STR-02-product-vision.md` — site-first flow. Consistent. |

> ⚠ **COVERAGE GAP: no contract or spec owns the SITE-ENTRY / ONBOARDING NAVIGATION flow.** The
> current location→draw→generate sequence lives in code (`onboarding-bootstrap`, `PlatformRouter`)
> and in memory notes, **not in a contract.** Logged to `MISSING-CONTRACTS-AUDIT`.

### 🔴 STEP 2 CONFLICT — STOPPING AND REPORTING RATHER THAN RESOLVING

**A globe that invites the user to pick ANY country advertises coverage we do not have.**

Measured today: **one city is live in production** (Barcelona), because `siteDispatch.ts` routes on
`isInBarcelona()` — a hard-coded lat/lon bbox — and there is exactly **one** rule pack registered
(`es-08019-barcelona`). Zoom into France, or Madrid, and the correct answer is *"we cannot answer
here"*.

**The founder's "show a basic data panel per country" makes this worse, not better**: it implies we
hold country-level data. **We hold none.** Fabricating a country panel to fill the stage would be the
**C58 §1.4** failure at the navigation layer — the same class as the fabricated 9 m heights.

⇒ **This is a founder decision, not an engineering one:**
- **(A) HONEST COVERAGE GLOBE** — the globe renders a **coverage layer**: Barcelona lit, everywhere
  else explicitly "not yet covered", with the country panel showing *what we can answer here* rather
  than invented statistics. Turns our biggest weakness into a legible roadmap.
- **(B) OPEN GLOBE** — navigate anywhere, and refuse at the parcel stage. Better demo, and every
  non-Barcelona user hits a dead end **after** investing zoom effort.

**I recommend (A)** and am not choosing it unilaterally.

## Step 3 — The architecturally-sound approach

**Follow C59, not a new mechanism.** The globe stages are **camera-altitude states of the single
`site-3d` view**, driven through the **view-state command** path (C59 §2 invariant 3), with the
existing `flyToFormaSite`/`frameSiteLocation` primitives for transitions. **Do not build a second
Cesium viewer, and do not add a fourth view mechanism** — C59 §0 exists because there were already
three.

**Staged disclosure = a pure state machine** (`world → country → city → parcel`), modelled the way
`paneViewModel.ts` models pane layout: **a pure, unit-tested reducer**, with the camera and panels as
its projections. Stage transitions are commands (P6), never ad-hoc camera pokes.

**Fast vs correct — they differ:**
- *Fast:* a `camera.moveEnd` listener that swaps panels on altitude thresholds.
- *Correct:* an explicit stage machine with **declared** altitude bands and a **coverage lookup**
  consulted at the country stage (C57 §3.1 adapter registry). Threshold-sniffing produces flapping at
  the boundary and has nowhere to put the coverage answer.

**Layers touched — say it up front: client + a coverage/jurisdiction data surface.** Option (A) needs
a queryable "where can PRYZM answer?" source, which today exists only as `REGISTRATIONS` in
`rulepacks/registry.ts` plus `isInBarcelona()`. **Deriving the globe's coverage layer from those two
is the only honest source** — anything hand-drawn would drift from what the engine can actually do.

⚠ **Performance (C59 §2 invariant 5):** the founder's box runs the **WebGL fallback**. A globe stage
with photoreal tiles plus the BIM pane is exactly the two-heavyweight-surface case the invariant
warns about; the entry flow should **not** hold a BIM pane live behind it.

---

## Step 5 — Queue routing

- **L-592 → GEOSPATIAL / 3D-Site queue** (Cesium scene interaction). *Not* the BIM selection queue —
  it does not touch `SelectionBus`/`gpu-pick`, and must not be made to.
- **L-593 → GEOSPATIAL / view-system queue**, sequenced **behind C59 Phase 2** (the per-pane view
  picker, currently in flight) because the globe entry is a `site-3d` view state and would otherwise
  be built against a switcher that is about to change underneath it.

## Not done in this pass, deliberately

Nothing is marked Fixed; no contract status changed to ACTIVE. Both items are **logged only**.
