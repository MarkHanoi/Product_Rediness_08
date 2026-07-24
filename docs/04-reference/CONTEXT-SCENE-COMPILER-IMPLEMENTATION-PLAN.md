# Context Scene-Compiler + Height/Terrain — Implementation Plan

> Companion to [`CONTEXT-SCENE-COMPILER-AND-TERRAIN-NORTH-STAR.md`](./CONTEXT-SCENE-COMPILER-AND-TERRAIN-NORTH-STAR.md)
> (the vision) — this is the **phased, contract-mapped, status-tracked plan** to get there. Honest:
> everything is `NOT STARTED` except where a shipped artefact is named. Status vocab: NOT STARTED ·
> IN PROGRESS · BLOCKED · SHIPPED · VERIFIED. **Status tracks WORK; a stage is only "done" when it
> renders + is measured** (§CONTEXT-DATA-HONESTY / C58).

## Governance gap — a NEW contract is needed

There is **no contract** governing the context render/height/terrain subsystem as a whole today. The
pieces are split across **C12** (geospatial/coordinate transforms), **C57** (parcel data), **C58**
(zoning/envelope), and reference docs (`CONTEXT-3D-PERFORMANCE-ARCHITECTURE.md`). This programme needs
its own binding contract to bound scope + invariants:

- **Proposed: C-CONTEXT (next free C-number) — "Context Scene, Height & Terrain Engine."** Scope: the
  offline scene-compiler, the height-profile schema (regulation-aware, not a single `height_m`), the
  nDSM pipeline invariants (P90-not-max, veg rejection, terrain-plane, provenance+confidence mandatory,
  never-fabricate), terrain-mesh LOD, scene-tile format, and the render↔knowledge-graph shared-ID rule.
  **ACTION: draft + ratify before Phase 3 code lands.** Until then this plan is the interim governance.
- Cross-refs the height-profile schema into **C57** (parcel) + **C58** (envelope uses `height_to_*`) +
  **C27** (Inspect consumes the knowledge-graph half) + **L-611** (Living Building Graph).

## Phase tracker

| Phase | Goal | Unlocks | Effort | Status | Contract/ref |
|---|---|---|---|---|---|
| **0** | Baseline: OSM/Overture footprints extruded by `height`/`levels` (LOD100, flat ground) | today's 3D-Site context | shipped | **SHIPPED** | CONTEXT-3D-PERFORMANCE-ARCHITECTURE · Overture (`bake.mjs`) |
| **0b** | Density fix — Overture for OSM-thin regions (Riyadh 5.3×) | non-sparse context worldwide | shipped | **SHIPPED (landing on R2)** | CONTEXT-BUILDING-SOURCE-EVALUATION |
| **1** | **National height sources** wired into the bake (`heightSources.mjs`: 3DBAG/BD TOPO/Catastro/LoD2-DE) → real LoD1 heights, kills the 9 m default | real building heights per city (top `heightProvenance:tagged`) | M | **BUILT, not wired** (module done; 1-line bake integration pending) | CONTEXT-LOD-BUILD-PLAN · LOD-RATE-MASTER |
| **2** | **Height-profile SCHEMA** (L0 Zod): `roof_median/p90/peak`, `height_to_{parapet,ridge,eaves}`, `roof_type`, `confidence`, `source`, `epoch`, `algorithm_version` — regulation-aware, provenance-first | one data model from viz → regulatory analysis; C58 reads the right height per jurisdiction | S–M | NOT STARTED | **C-CONTEXT §schema** · C57 · C58 |
| **3** | **Terrain in 3D-Site** — compile national DTM/LiDAR → terrain-mesh LOD tiles → render under buildings. Start where DTM open (NL/DK/CH/FR/ES-ICGC) | the long-requested terrain gap; the datum heights measure from (L-584) | H | NOT STARTED | **C-CONTEXT §terrain** · C12 · CONTEXT-DATA-TERRAIN |
| **4** | **nDSM height engine** — the worldwide real-height mechanism: classify → DTM/DSM → nDSM → eroded-footprint P90 → terrain-plane → roof RANSAC → confidence. Tile-parallel build farm | measured heights + roof types anywhere LiDAR exists (→ LoD2); Saudi etc. fall back through the same interface | XL | NOT STARTED | **C-CONTEXT §ndsm** (the real IP) |
| **5** | **Scene compiler + scene tiles** — per-domain compilers (terrain/building/veg/road) → self-contained scene tiles (render assets + knowledge-graph, shared object IDs) → streaming API | Forma-class planning environment; click-a-building→planning-object (not a raycast) | XL (multi-quarter) | NOT STARTED | **C-CONTEXT §scene-tile** · C27 (Inspect) · L-611 (Living Graph) |

## Dependencies / sequencing

- **Phase 1 is the cheap near-term win** and independent — wire the height module into the bake (1 line
  documented in `CONTEXT-LOD-BUILD-PLAN.md`), reconciled with the Overture bake change.
- **Phase 2 (schema) gates Phases 3–5** — the height-profile schema is the shared datum; draft it (and
  the C-CONTEXT contract) before terrain/nDSM code, so nothing hardcodes a single `height_m`.
- **Phase 3 (terrain) is independently valuable** (the requested gap) and can proceed on open-DTM
  countries once the schema exists; it does NOT need the full nDSM engine (national DTM suffices).
- **Phase 4 (nDSM) is the moat** but XL — it is the *height* engine; terrain (3) uses the same LiDAR but
  is a smaller lift (national DTM meshes, no per-building extraction).
- **Phase 5 (scene compiler) is the destination** — do NOT start before 1–4 prove the data; it is the
  re-architecture, not a sprint.

## Honesty gates (binding on every phase)

1. Never a fabricated height presented as measured — `heightProvenance`/`confidence`/`source` mandatory.
2. P90/trimmed-median, never max (chimney/antenna). Eroded footprint. Terrain-plane, not lowest point.
3. Store a height *profile*, never collapse to one number (jurisdictions differ on ridge/parapet/eaves).
4. A stage is "SHIPPED" only when it renders + is measured — status tracks work, not the number.
5. Strict separation from the buildable-*rule* rate (C58): this is the *physical/context* axis
   (LOD-RATE), never conflated.

## Next actions (ordered)

1. **Wire Phase 1** (height module → bake) — reconcile with the Overture bake change; smallest real win.
2. **Draft C-CONTEXT + the Phase-2 height-profile schema** — the governance the founder asked for.
3. **Scope Phase 3 (terrain)** on open-DTM countries — the requested gap, independently shippable.
4. Fire a dedicated study/design agent (the founder's "put an agent on it") once capacity allows — it
   should produce the C-CONTEXT draft + the Phase-2 schema + a Phase-3 terrain-source probe.

---
*Owner: UNASSIGNED. This plan is the interim governance until C-CONTEXT is ratified. Last updated
2026-07-24. Vision: `CONTEXT-SCENE-COMPILER-AND-TERRAIN-NORTH-STAR.md`.*
