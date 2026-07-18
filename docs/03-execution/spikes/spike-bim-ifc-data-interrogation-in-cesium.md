# SPIKE — Interrogating & manipulating BIM / IFC DATA inside the Cesium geospatial view

> **Stamp**: 2026-07-18 · **Status**: SPIKE (research-only — QUEUED, **NOT priority**; NO runtime code changed; research NOT yet done — this is a stub capturing the ask + the architectural context)
> **Tracking**: [L-414](../../04-reference/V1-LAUNCH-READINESS-AUDIT.md) · Severity **P3 (backlog)**
> **Trigger**: Founder ask, during the buildable-envelope Cesium-render work — *"Keep this as a SPIKE — but if in the future we want to manipulate / interrogate the DATA in the Cesium views, we should look into this. Check how the data is structured in PRYZM and how IFC data in Cesium could adapt to a super-performant and flexible process. This should be QUEUED — not priority."* Observed: PRYZM renders BIM massing + the buildable envelope in the Cesium / Forma 3D Site, but the Cesium view is today a **passive context / drape surface** — you cannot select / query / interrogate BIM or IFC data in it.
> **Scope of the eventual research**: (1) how PRYZM's BIM data is structured (schemas + element stores + IFC Psets + ThatOpen fragments); (2) how that data could be represented in Cesium as **queryable / pickable features** performantly; (3) how the existing Cesium↔BIM bridge + the Inspect (C27) / Data-panel (C28) selection surfaces could extend onto the Cesium view; (4) whether a new governing contract is required (the C55 context-only tension).
> **Companion contracts**: [C12 — Geospatial](../../02-decisions/contracts/C12-GEOSPATIAL.md), [C55 — Geodata Analytical Layers](../../02-decisions/contracts/C55-GEODATA-ANALYTICAL-LAYERS.md), [C19 — Site Model & Parcel](../../02-decisions/contracts/C19-SITE-MODEL-AND-PARCEL.md), [C03 — Schemas/Commands/State](../../02-decisions/contracts/C03-SCHEMAS-COMMANDS-AND-STATE.md), [C27 — BIM 3.0 Inspect](../../02-decisions/contracts/C27-BIM3-INSPECT-MODEL.md), [C28 — Data Panel & Automation](../../02-decisions/contracts/C28-DATA-PANEL-AND-AUTOMATION.md), [C25 — IFC Export](../../02-decisions/contracts/C25-IFC-EXPORT-PRODUCTION.md), [C26 — Revit Round-trip](../../02-decisions/contracts/C26-REVIT-ROUND-TRIP.md), [C10 — Performance & Observability](../../02-decisions/contracts/C10-PERFORMANCE-AND-OBSERVABILITY.md), [C04 — Rendering & Scheduling](../../02-decisions/contracts/C04-RENDERING-AND-SCHEDULING.md).

---

## §0 — TL;DR (what this stub records; research NOT yet done)

The founder wants a *future* capability: the Cesium / Forma 3D Site view should let you **select, query, and manipulate the BIM / IFC data** of what is rendered there — not just look at it. Today it is a passive backdrop: the BIM model is baked into the geospatial view as a **whole-scene glTF blob** with no per-element identity, so nothing in it is pickable or queryable at the element level.

This stub captures the ask, the current data/render architecture, and — the load-bearing finding — that **no contract currently governs interactive BIM/IFC data interrogation inside the geospatial view**, and that doing so sits in tension with **C55 §1.2** ("layers DRAPE; they never become BIM geometry" — the Cesium surface is framed as read-only context). Resolving that tension (context-only vs interactive-BIM) is a **founder decision** the eventual spike must surface, not silently resolve. **Research (the candidate directions in §3) is not yet done.**

---

## §1 — How PRYZM's BIM data is structured today (to be verified in the full spike)

- **Element schemas** are pure Zod in `packages/schemas/` (L0, P5 — no THREE/DOM/I-O). IFC-specific per-element metadata (property sets) lives in `packages/schemas/src/ifc/IfcElementMeta.ts` ("IFC Pset" carrier).
- **Element stores** (per element-type, the C03 state layer) hold the authored instances; every element carries a stable id.
- **IFC interop** — `plugins/ifc-import` / `plugins/ifc-export` (governed by **C12 §1.2/§1.3** for `IfcProjectedCRS`, **C25** for IFC4X3 export, **C26** for Revit round-trip); PRYZM uses **ThatOpen / OpenBIM fragments** (`@thatopen`) — fragment IDs already surface across `packages/picking/src/gpu-pick.ts`, `packages/persistence-client/src/loader/ProjectSerializer.ts`, and the renderer.
- **Inspect / data surfaces** — **C27** (BIM 3.0 Inspect: master tree Site→Building→Level→Apartment→Room→ElementType→ElementInstance, selection-driven isolation via `packages/visibility/`) and **C28** (Data Panel & automation, Pset editing) are the *existing* BIM-data interrogation surfaces — but only in the main editor canvas, **not** the Cesium view.

## §2 — How the BIM model reaches Cesium today (audited, read-only — the "passive" problem)

File: `apps/editor/src/ui/geospatial/CesiumViewport.ts`.

- The live BIM scene is **serialised to a single glTF/GLB and placed as a native `Cesium.Model` scene primitive** — `realModelOnGlobe` (photoreal globe) and `realModelOnForma` (Forma massing) (`:513–541`, `loadBimGltf` path `:7758–7905`, `scene.primitives.add(newModel)` `:7905`). The class-comment at `:7758` explicitly documents *"WHY a glTF model primitive and not the `CesiumThreeBridge` overlay"* — the renderer-agnostic bridge is glTF (serialise the whole BIM scene → one `Cesium.Model`), which Cesium depth-tests against terrain/tiles.
- **Picking is whole-object.** `viewer.scene.pick(...)` at `:1707` resolves to `pickedObject.primitive instanceof Cesium.Model` (`:1712`) — it identifies **the whole model primitive**, not an element. There are **no `EXT_mesh_features` / `EXT_structural_metadata` feature IDs** in the exported glTF (grep: none), so Cesium has no per-element handle to select, highlight, or attach metadata to.
- Net: the geospatial view is a **passive drape / context surface** — exactly the founder's observation. The seam to change it is the BIM→glTF export (add per-feature metadata) + the pick handler (feature-ID pick) — but that is a cross-layer change, not a local one.

## §2.1 — The C55 tension (the load-bearing governance finding — FOUNDER DECISION, do not auto-resolve)

- **C55 §1.2** ("Layers DRAPE; they never become BIM geometry") makes draped analytical layers **read-only context**, never BIM. It governs the *analytical geodata layers* subsystem specifically — it does **not** literally govern picking the BIM massing model that is already placed in the view. So making the BIM model pickable is **not a present C55 violation**.
- BUT the **spirit** of C55 (and the way the Cesium/Forma view is framed across C12/C55) is "the geospatial surface is context." The founder's ask — make BIM/IFC data **interactive** in that surface — is a **forward tension** with that framing.
- **No contract governs** interactive BIM/IFC data interrogation / manipulation inside the geospatial view: **C27/C28** cover BIM inspect + data but only on the editor canvas; **C55** covers drape layers (context-only); **C12** covers coordinates. This is a **coverage gap** (logged to `MISSING-CONTRACTS-AUDIT-2026-06-01.md`). Part of the spike's job is to determine whether a new contract (or a C55/C27/C28 amendment) is needed.
- **Founder decision — RESOLVED (2026-07-18): DIRECTION CHOSEN, DEFERRED.** The founder settled the context-only-vs-interactive question: the geospatial view **should eventually become a first-class interactive BIM/IFC surface** (*"definitely nice to have"*), NOT stay permanently context-only — but explicitly **queued, not-priority (post-September)**. So the spike no longer needs to *surface* the direction; its job is now to (1) time the pickup (post-September, unassigned), and (2) when picked up, deliver the **governing contract FIRST** (a C55 §1.2 amendment + C27/C28 extension, or a new geospatial-interrogation contract) *before any code* — C55 stays as-written (context-only) until then.

## §3 — Candidate research directions (NOT yet investigated — the spike's job)

1. **Per-feature metadata in the geospatial payload** — export the BIM scene as **3D Tiles + `EXT_mesh_features` + `EXT_structural_metadata`** (glTF) instead of an opaque GLB, so each element carries a feature ID + its Pset metadata; enables Cesium **feature-ID picking** + styling.
2. **ThatOpen fragment IDs → Cesium feature IDs** — reuse the existing fragment identity (already used by `gpu-pick.ts` / the serializer) as the stable per-element key across the editor canvas and the Cesium surface (one identity, two render surfaces).
3. **Streaming vs in-memory** — 3D-Tiles streaming (city-scale, LOD, "super-performant" per the founder) vs the current single-GLB in-memory model; tie to the **C10** perf budget + the L-355/L-358 GLB-export-perf work.
4. **Selection bridge** — extend the **C27 Inspect** selection + **C28 Data-panel** binding so a pick in Cesium drives the same `IsolationVisibilityIntent` (P7) / data-panel selection as a pick in the editor canvas (one selection model, not a parallel one).
5. **Command surface & spans** — any manipulation must route through the command bus (P6) with OTel spans (P8); "manipulate" (edit-in-Cesium) is a much larger scope than "interrogate" (read/select) and should be phased.

**Flag**: this spans layers — the BIM data model (C03/schemas) + IFC/ThatOpen (C25/C26) + the Cesium render + the bridge (C12/C55/CesiumViewport) + performance (C10). It is not a single-package change. Fast-vs-correct is N/A (this is a spike); the correct end-state would require a governing contract first.

## §4 — Verdict (interim — full research pending)

**QUEUED / NOT priority** (founder-explicit). This stub reserves the seam and records the C55 context-only-vs-interactive-BIM decision for the founder. No runtime code changes; no contract authored yet. When picked up, run §3 as the research agenda and return a recommendation on (a) the data representation, (b) the selection/bridge design, (c) the perf path, and (d) whether a new contract is needed.

---

## §5 — Sources / audited files (read-only)

- `apps/editor/src/ui/geospatial/CesiumViewport.ts` — BIM-on-globe glTF placement (`realModelOnGlobe`/`realModelOnForma` `:513–541`; `loadBimGltf` `:7758–7905`; `scene.primitives.add` `:7905`); whole-object pick (`scene.pick` `:1707`, `instanceof Cesium.Model` `:1712`); the "why glTF not CesiumThreeBridge" note (`:7758–7775`).
- `packages/schemas/src/ifc/IfcElementMeta.ts` — IFC Pset per-element metadata carrier.
- `packages/picking/src/gpu-pick.ts`, `packages/persistence-client/src/loader/ProjectSerializer.ts` — ThatOpen fragment identity usage.
- Contracts: C12, C55 (§1.2), C19, C03, C27, C28, C25, C26, C10, C04.
- Gap log: `docs/02-decisions/MISSING-CONTRACTS-AUDIT-2026-06-01.md` (L-414 entry).
