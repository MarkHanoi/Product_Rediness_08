# ADR-0081 — Office building (tower) as the 4th generative typology, with a circular concentric-ring floor plate (§OFFICE-BUILDING)

| Field | Value |
|---|---|
| Status | **Accepted** — 2026-06-30 |
| Tag | §OFFICE-BUILDING · §OFFICE-CORE-RISE-ZONE · §OFFICE-FLOOR-VARIETY · §OFFICE-PERIMETER-CULTURE · §OFFICE-DESK-COUNT |
| Owner | Generative typologies (Agent 6) |
| Closes | Demo: "add an office building typology — a 40-storey tower with a circular floor plate, preview parity with the residential building, an office floor-plate layout inside the circle, and an analytics panel" |
| Extends | [ADR-0062](./0062-doors-as-circulation-graph-entities.md) family of generative typologies; the residential-building pack/orchestrator pattern; C50 (typology pipeline) |
| Constraint reference | C50-TYPOLOGY-PIPELINE §1.7 (soft-fail not throw) / §2.6 (typology-declared brief); C01 P2 (no THREE outside renderer-three) · P4 (no `(window as any)`) · P6 (commands are the only mutation path) · P8 (≥1 span per exported fn) |

---

## Context

PRYZM ships three generative typologies — apartment, residential house, and the
multi-family residential building — each as a `@pryzm/typology-pack-*` (manifest +
brief + bridge stages) plus an L2 pure orchestrator in `@pryzm/ai-host` and an editor
controller/modal/executor. The product needs a **commercial OFFICE TOWER** typology
to demonstrate the platform is typology-agnostic beyond residential.

The office programme is fundamentally different from the residential one:

- The plate is **circular** (a 64-gon approximation), not a rectangular parcel.
- Circulation is **central by rule** (like the resi core) but the floor is organised
  as **concentric zone rings**, not a corridor-fed apartment partition.
- The **core scales with rise** — a 40-storey tower needs banked low/mid/high-rise
  lift groups + more risers + MEP, so the core is a larger fraction of GFA than a
  4-storey building. Stamping an identical core on every height is wrong.
- A tower reads as **varied floors** (café/amenity ground, sky-lobby, mechanical/
  refuge floors every ~18 storeys, executive top, open-plan in between) — not 40
  identical plates.

## Decision

Add **office-building** as the 4th typology, self-contained and GATED default-OFF
behind `globalThis.__PRYZM_OFFICE_BUILDING__`, mirroring the residential-building
gating so production is byte-identical until browser-validated.

1. **`@pryzm/ai-host` workflows/officeBuilding** (pure L2, zero THREE/DOM):
   - `generateOfficeFloorPlate()` — the centrepiece. Given a circular plate radius +
     storey count, it lays out concentric zones core-out: **centred core** (rise-
     scaled by AREA) · inner circulation ring · **open-plan desk ring(s)** · perimeter
     offices / desks-at-the-glass (culture toggle) · **collaboration pods** · outer
     circulation ring. Each ring's outer radius is solved from a cumulative-AREA target
     so the area mix hits the demo bands (open-plan 45–55%, enclosed 15–20%, collab
     10–15%, circulation 12–15%). Emits zone polygons + a **desk count** + analytics.
   - `coreFractionForRise()` (§OFFICE-CORE-RISE-ZONE) — core AREA fraction of GFA scales
     linearly from ~18% (low-rise) to ~25% (≥32 storeys), clamped.
   - `orchestrateOfficeBuilding()` — the tower stack. `classifyOfficeFloor()`
     (§OFFICE-FLOOR-VARIETY) stamps the dept presets across storeys; building analytics
     aggregate total desks across the office floors.
   - Desks come from the open-plan ring area at a **desk-density** param (4–8/1000sqft),
     with a **bench vs individual** factor and an **open-plan-first vs perimeter-
     offices-first** culture toggle (§OFFICE-PERIMETER-CULTURE / §OFFICE-DESK-COUNT).

2. **`@pryzm/typology-pack-office-building`** — C50 manifest (`category: 'workplace'`),
   the stories/floor-to-floor/radius/desk-density/desk-mode/culture/plate-shape brief,
   the typed input model, and GATED bridge stages. Registered in `composeRuntime`
   behind the flag.

3. **`apps/editor/src/ui/office-building`** — the console trigger
   `pryzmGenerateOfficeBuilding({ stories, radiusM, floorToFloorM })` (typed global),
   a controller, a modal showing the **circular plate preview SVG + an analytics
   panel** (desk count, m²/desk, % open vs enclosed, daylight-adjacent desk %, core
   efficiency, floor-type variety), and a **LIGHT executor** that — per the same-day
   demo scope — emits the representative floor plate as a slab + concentric zone
   room-bounding lines through the command bus in one `runBatch` (one undo). Full
   per-desk BIM emission for all 40 floors is deferred; zone polygons + desk counts +
   analytics make the floor read correctly today.

## Consequences

- **Positive.** A 4th typology with a genuinely different (circular, ring-based) plate
  proves the pipeline is typology-agnostic. Pure orchestrator is unit-tested (13 tests
  across the two suites). GATED + self-contained ⇒ zero risk to the three existing
  typologies; production byte-identical with the flag OFF.
- **Trade-off.** The demo executor emits zone outlines + a slab, not full per-desk
  furniture/walls for every floor — a deliberate same-day scope cut sanctioned by the
  brief. The next slice replaces it with a per-floor wall/core/desk emitter analogous
  to the residential executor.
- **Follow-ups.** Per-floor on-demand interior generation; real lift-bank zoning
  geometry inside the core; non-circular plate shapes; massing-preview extrusion in
  the Forma/Cesium path (the modal SVG stands in for now).

## Compliance

- **C50 §1.7** — every generator soft-fails (`{ status:'rejected', reason }`), never
  throws.
- **C01 P2** — no `import * as THREE` anywhere in the new code.
- **C01 P4** — the feature gate + runtime are read via narrow typed `globalThis` /
  `window` casts and a typed `globals.d.ts` augmentation, never `(window as any)`.
- **C01 P6** — all scene mutation flows through the command bus inside `runBatch`.
- **C01 P8** — every new exported workflow / controller / executor function opens ≥1
  OpenTelemetry span.
