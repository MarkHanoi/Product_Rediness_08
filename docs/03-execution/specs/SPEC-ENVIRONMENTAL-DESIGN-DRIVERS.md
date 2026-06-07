# SPEC — Environmental & Architectural Design Drivers (house/typology layout)

**Status:** DRAFT (2026-06-07) · founder-authored brief · tracker A.21.D29 #4
**Governs:** the layout-generation pipeline (D-TGL + houseOrchestrator + apartment) — how
site, climate, acoustic, ventilation, privacy, structure, services and regulation drive
WHERE rooms, walls, glazing, cores and openings go.
**Relates to:** SPEC-APARTMENT-COGNITION-STACK, the dimensional+topology validator
frameworks, C19 (Climate), C18 (Site), [[stair-space-efficiency-objective]].

---

## 0. Why

Today the generator resolves geometry (dissection → subdivision → walls) with only weak
environmental awareness (a climate-driven window-orientation pass, A.21.D6). The founder's
brief codifies the FULL set of design drivers a competent architect resolves, AND the
ORDER in which conflicts between them are resolved. This SPEC is the normative source for
turning those drivers into engine objectives/constraints — incrementally.

## 1. The conflict-resolution hierarchy (THE core rule)

Plan generation must resolve drivers in PRIORITY ORDER; a higher layer wins conflicts. A
ventilation path that compromises privacy is **rerouted**, not the privacy screen.

| # | Consideration | Primary effect on layout | Category |
|---|---|---|---|
| 1 | Orientation & solar | which way rooms face, where glazing goes | Site-fixed |
| 2 | Topography & levels | section strategy, entry level, retaining | Site-fixed |
| 3 | Views & outlook | key room positions, glazing orientation | Site-fixed |
| 4 | Privacy & overlooking | window positions, room adjacencies, screening | Site-fixed |
| 5 | Acoustic zoning | room placement, buffer zones, vertical stacking | Env. performance |
| 6 | Natural ventilation | plan depth, opening positions, stack paths | Env. performance |
| 7 | Structure & spans | wall/column positions, floor strategy | Technical systems |
| 8 | Services zoning | wet-room clustering, vertical pipe stacks | Technical systems |
| 9 | Circulation & access | corridor length, door widths, **stair position** | Technical systems |
| 10 | Fire escape | dead-end limits, protected routes, stair enclosure | Form & regulation |
| 11 | Rainfall & drainage | roof form, overhang positions, surface falls | Form & regulation |
| 12 | Form compactness | footprint shape, surface-to-volume ratio | Form & regulation |

**Resolution order = categories top-down:** Site-fixed → Environmental performance →
Technical systems → Form & regulation. Within the engine this maps to objective WEIGHTS
(higher layer = higher weight) + HARD constraints for regulation (10) and structure (7).

**The central tension to encode:** acoustic zoning (5, wants closed rooms + buffers) and
natural ventilation (6, wants open through-connections) pull opposite ways; the CORRIDOR is
where it's resolved (airflow path + acoustic barrier via high-level transom vents over solid
door cores). Services (8) and structure (7) are INPUTS, not consequences.

## 2. Solar (driver 1) — extends A.21.D6

- Main living facade faces the equator (S in N-hemisphere); elongate plan E–W.
- Room placement by sun path: **S** = living/dining/kitchen (daytime rooms); **N** =
  garage/utility/bath/storage (cold-side buffer); **E** = bedrooms (morning light); **W**
  needs shading (overheating).
- Glazing: maximise S, minimise N; high-SHGC S glass, low-SHGC E/W.
- Shading: fixed S overhang sized from latitude (block high summer sun, admit low winter
  sun); vertical fins/blinds on W. Deciduous trees on S.
- Thermal mass inside the insulation envelope; S-facing roof 30–45° for PV.
- Plan depth ≤ 8–10 m for daylight; roof-lights/clerestories for deep/N rooms.
- **Tension:** maximise winter sun, control summer sun; daylight + solar heat arrive
  together through the same glazing — balance via shading + glass spec + mass.

## 3. Wind (driver, feeds 1/6) — extends A.21.D6 wind data

- Map BOTH winter (cold, exclude) and summer (cooling, invite) winds — usually different
  directions. Present the narrow face to the dominant cold wind.
- Buffer rooms on the cold-wind side; living/bedrooms + terraces in the wind shadow.
- Cross-vent: inlet windward, outlet leeward, **offset** (diagonal sweep, not a jet);
  outlet area ≥ inlet area.
- L/U plans create sheltered leeward courtyards. Semi-permeable hedges > solid walls.
- Airtightness: seal penetrations (wind pressure drives infiltration); recessed
  porch/lobby shields the entrance.

## 4. Acoustic zoning (driver 5)

- **Room placement is the cheapest, highest-impact measure:** buffer noisy (kitchen,
  utility, WC) against quiet (bedroom, study) with a hall/WC between.
- **Vertical stack:** bedroom-above-bedroom OK; bedroom-above-kitchen/cinema = problem
  (structure-borne up the slab). Encode in multi-storey storeyAllocation.
- Windows = weakest link: asymmetric double/triple glazing + seals; airlock entry on noisy
  side. Doors: threshold + 4-edge seals (a door gap loses ~10 dB).
- Walls: mass for airborne; decoupled double-leaf for party walls; avoid back-to-back
  sockets. Floors: floating floor / resilient underlay / carpet for impact noise.
- Corridors: acoustic buffer, not dead-end; avoid doors directly opposite; lobby before
  bedrooms. Services: isolate pipes (rubber mounts), MVHR duct silencers.
- **Two principles:** airborne = mass + sealing; impact = decoupling + resilience.

## 5. Natural ventilation (driver 6)

- Two forces: wind pressure (horizontal, cross-vent) + buoyancy/stack (vertical).
- Cross-vent reach ≈ 5× floor-to-ceiling height (~12–13 m). Deeper → atrium/courtyard or
  stack chimney. Internal partitions break flow → transom/high-level vents over doors.
- Stack: low cool inlet + high warm outlet; stairwell + roof-light/ridge vent = passive
  chimney for the whole house (relevant to the stair-core decision).
- Openable area 5–10% of floor area min; top-hung/pivot windows; night purge needs thermal
  mass. Hot-dry (Córdoba): casa-de-patio — closed by day, night purge, shaded courtyard +
  water for evaporative cooling; small shaded external windows, open to the patio.
- Concepts: neutral pressure plane (below = in, above = out); ventilation must be
  ADJUSTABLE (graduated openings), not just open/shut.

## 6. The other site-fixed drivers (2/3/4) + technical (7/8) + regulation (10/11/12)

- **Topography (2):** slope → drainage, cut/fill, entry level, earth-sheltering uphill.
- **Views (3):** best view to the most-used room, not the corridor; view corridors
  entry→garden; can conflict with solar (3 < 1, solar wins on conflict).
- **Privacy (4):** screen bed/bath windows from street/neighbours; section matters (upper
  window overlooks ground terrace).
- **Structure (7):** load-bearing walls align floor-to-floor; rationalise a grid early;
  long spans (over garage/open ground) cost more — HARD input.
- **Services (8):** cluster/stack wet rooms (bath over bath, shared pipe stacks); conscious
  trade-off vs acoustic (bath-over-kitchen).
- **Fire (10, HARD):** every habitable room → direct exit or protected route; dead-end +
  travel-distance limits; protected stair.
- **Drainage (11):** roof form + overhangs follow rainfall direction + ground fall.
- **Form compactness (12):** low surface-to-volume; a rectangle beats an L for the same
  area (embodied carbon + cost) — but L/U can win on solar/wind/courtyard (weigh against 1/6).

## 7. Implementation phasing (incremental — do NOT build one giant optimiser)

Mirror the cognition-stack doctrine (staged optimisation steps, AI guides the engine):

- **E.1 ✅ SHIPPED (2026-06-07, §ENV-E1-PRIORITY).** Encode the priority hierarchy (§1) as
  objective weights + HARD constraints in the D-TGL ranking. Implemented in
  `tgl/envDrivers.ts`: `PRIORITY_BAND` (Site-fixed 1.30 > Env-perf 1.10 > Technical 1.00 >
  Form/reg 0.85) + `AXIS_PRIORITY` (each objective axis → its §1 driver category) + a
  `priorityMultiplier(axis)` applied ON TOP of the existing per-axis weights inside
  `enumerate.ts` `weightedSum`. Regulation (10) + structure (7) + form-compactness (12)
  stay HARD gates (shape/fit/envelope/connectivity admissibility in `enumerate.ts`),
  documented in `HARD_GATES`. Pareto rank is computed from RAW objectives, so the band only
  tunes the secondary weighted-sum tie-break — additive, no axis added, no raw value changed.
- **E.2 ✅ SHIPPED (2026-06-07, §ENV-E2-SOLAR).** Solar room-placement bias (§2): orient
  daytime rooms (living/dining/kitchen) to the equator face, buffers (garage/utility/bath/
  ensuite/wc/storage) to the cold face — a SOFT objective. Implemented as the
  `solarOrientation` objective axis (`tgl/objectives.ts` ← `solarOrientationScore` in
  `tgl/envDrivers.ts`), reusing the A.21.D6 sun source (`windowEmission/solarOrientation.ts`
  `equatorFacingDir`). Latitude threads apartment + house paths via
  `runDeterministicLayout` → `enumerate` (`solarLatDeg`) → `computeObjectives`. GRACEFUL
  DEGRADATION: neutral 1.0 (rank-invisible) when no latitude / near-equatorial / degenerate,
  so layouts without site data are byte-identical. Tests: `__tests__/tglEnvDrivers.test.ts`.
- **E.3 ✅ SHIPPED (2026-06-07, §ENV-E3-ACOUSTIC).** Acoustic-zoning objective (§4,
  driver 5, Env-performance band): a SOFT `acousticZoning` axis (`tgl/objectives.ts` ←
  `acousticZoningScore` in `tgl/envDrivers.ts`) that penalises a QUIET room
  (bedroom/master/study) directly adjacent to a NOISY room (kitchen/utility/laundry/wc/
  bathroom) and REWARDS a hall/corridor/wc/storage BUFFER between them — using the
  `ADJACENT_TO` shared-wall edges the engine already builds (no new geometry). For
  MULTI-STOREY houses the vertical-stack preference (bedroom-above-bedroom OK;
  bedroom-directly-above-kitchen/noisy penalised, structure-borne) ships as a SOFT
  storey-allocation preference: `verticalStackAcousticScore` (`tgl/envDrivers.ts`) +
  `storeyAcousticProfiles`/`storeyAcousticPreference` (`houseLayout/storeyAllocation.ts`)
  — a preference, NOT a hard gate (the allocation is never dropped). Axis mapped to the
  env-performance band in `envDrivers.ts` `AXIS_PRIORITY`. GRACEFUL DEGRADATION: neutral
  1.0 (rank-invisible) when no quiet↔noisy relation / no adjacency data, so layouts with
  no acoustic tension are byte-identical (Pareto equality invariant preserved). Tests:
  `__tests__/tglEnvDriversE3E4.test.ts`.
- **E.4 ✅ SHIPPED (2026-06-07, §ENV-E4-VENT).** Natural-ventilation objective (§5,
  driver 6, Env-performance band): a SOFT `naturalVentilation` axis (`tgl/objectives.ts`
  ← `naturalVentilationScore` in `tgl/envDrivers.ts`) that REWARDS cross-ventilation
  potential — habitable rooms with window openings on ≥2 differently-oriented external
  façades — and PENALISES plan depth beyond the cross-vent reach (≈5× floor-to-ceiling,
  ~12.5 m) for habitable rooms; a stair/stairwell stack path nudges the score up. Uses
  the existing Window/Opening + external-Wall (`isExternal`, `baseLine`) graph data (no
  new geometry). Axis mapped to the env-performance band in `AXIS_PRIORITY`. GRACEFUL
  DEGRADATION: neutral 1.0 when no external walls / no scorable habitable room, so
  layouts without window/wall data are byte-identical (Pareto equality invariant
  preserved). Tests: `__tests__/tglEnvDriversE3E4.test.ts`.
- **E.5** Privacy/views (§3/§4) once a real Site context (C18) is wired.
- **E.6** Services/structure inputs (§7/§8) — wet-room clustering + structural grid.
Each step ships behind its own objective axis + tests; conflicts resolved by §1 order.

## 8. Acceptance

A generated house: daytime rooms on the sun face, buffers on the cold face; noisy/quiet
separated with a buffer + sane vertical stack; plan depth ventilation-viable with a stack
path; wet rooms clustered; protected stair + escape; conflicts resolved in §1 order with a
logged rationale (feeds the Living/Building Graph "why" surface).
