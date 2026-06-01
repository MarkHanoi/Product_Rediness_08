# Apartment — Spatial-Cognition Stack & Implementation Plan (2026-05-29)

**Third companion** to `APARTMENT-LAYOUT-STATUS-2026-05-29.md` (history + tactical tiers + strategic framework) and `APARTMENT-DRIVING-PRINCIPLES-AND-ROOM-ELEMENT-MATRIX-2026-05-29.md` (per-room driving principles + element × room matrix).

**Purpose.** Move beyond the "more rules" trap by reframing PRYZM as a **hierarchical spatial-cognition system** — not one generator, but a *stack* of seven engines with successive reduction of ambiguity across scales. Includes a status-tracked implementation plan keyed to package files.

**Reading order.**

1. `APARTMENT-LAYOUT-STATUS-2026-05-29.md` §1–§4 (where we are tactically).
2. `APARTMENT-LAYOUT-STATUS-2026-05-29.md` §5 (the 5-layer architectural-excellence model).
3. **This doc** (the 7-layer cognition stack + staged optimisation + status-tracked plan).
4. `APARTMENT-DRIVING-PRINCIPLES-AND-ROOM-ELEMENT-MATRIX-2026-05-29.md` for the local-rule layer detail.

---

## §1 — Phase model (where PRYZM stands)

| Phase | Name | What it does | PRYZM today |
|---|---|---|---|
| **Phase 1** | **Constraint satisfaction** | Adjacency legality, room dimensions, circulation validity, furniture fit, deterministic subdivision. Answers *"Can this apartment work?"* | ✅ Strong |
| **Phase 2** | **Spatial intelligence** | Hierarchy, sightlines, façade scoring, semantic edge typing, compositional alignment, environmental fields. Answers *"What kind of inhabitation does this support?"* | 🟡 ~10 % |
| **Phase 3** | **Architectural authorship** | Typology priors, perceptual simulation, human-behavioural simulation, AI-guided architectural critique. Answers *"What should this apartment feel like to inhabit?"* | ❌ 0 % |

PRYZM is **between Phase 1 and Phase 2**. The mistake most systems make at this transition is *adding hundreds more rules* — producing brittle systems with emergent contradictions and "correct but soulless" plans. The correct direction is a **hierarchical architectural cognition stack**.

---

## §2 — The architectural-cognition principle

Architects do **not** solve everything simultaneously. They think in layers of decreasing abstraction. A Foster-level or Kuma-level process is **not** a giant weighted optimisation — it is **successive reduction of ambiguity across scales**.

| Scale | Question | PRYZM today |
|---|---|---|
| Urban | Where does the building belong? | ❌ Out of scope |
| Building | What is the organisational order? | ❌ Begins with `multi-apartment-floor-plate-brief` (queued) |
| Floor | What is public vs private? | 🟡 Implicit via `privacy: 'public'/'circulation'/'private'/'service'` in ROOM_RULES |
| Apartment | What deserves light? | 🟡 `windowMandatory` flag only — no value field |
| Room | How is the body oriented? | ✅ Furniture archetypes encode this (`anchor: 'opposite-door'`, `excludeWindowWall`) |
| Furniture | How is activity supported? | 🟡 Object placement; activity simulation absent |
| Material | What atmosphere emerges? | ❌ Materials are finish categories |

**Today's engine collapses too many scales into one stage.** That is the root issue — and it's why local-rule additions produce diminishing returns.

---

## §3 — The 7-Layer Cognition Stack

The target architecture. Each layer feeds the next; subdivision *emerges from upstream fields* rather than being an arbitrary partition.

### §3.A — Environmental Intelligence Engine

**Runs FIRST, before any room subdivision.** The "world understanding" layer.

**Inputs.** Orientation, latitude, climate, urban density, noise, views, neighbouring buildings, façade lengths, corner conditions, ventilation opportunities.

**Outputs.** Continuous scalar fields across the shell:

- `daylightField(x, y)` — solar penetration depth + seasonal variation.
- `privacyField(x, y)` — exposure to street, neighbours, sightlines.
- `noiseField(x, y)` — environmental acoustic exposure.
- `thermalDesirabilityField(x, y)` — south-facing morning sun vs west afternoon heat.
- `viewQualityField(x, y)` — what each exterior edge looks at.
- `ventilationField(x, y)` — cross-breeze paths.

**Why.** Architects do not treat the façade equally. THIS edge is precious; THIS edge absorbs bathrooms / services. Without this layer, all later allocation is naive.

### §3.B — Spatial Hierarchy Engine

**The single most important layer.** Decides what is *primary*, *secondary*, *concealed*, *celebrated*.

**Generates.**

1. **Arrival sequence** — compressed threshold → partial concealment → reveal toward daylight.
2. **Privacy gradient** — public / semi-public / private / intimate / service.
3. **Spatial climax** — which space is emotionally dominant (usually living, corner salon, view-facing zone).
4. **Movement narrative** — how the body travels through the apartment.

Without this layer the engine produces *room packing*, not architecture.

### §3.C — Semantic Topology Graph

**Replaces the flat bubble graph with typed semantic edges.** Different edge types receive different geometric treatment.

| Edge type | Geometric meaning |
|---|---|
| `SOCIAL_FLOW` | Wide opening, visual continuity (e.g. living↔dining) |
| `INTIMATE_ACCESS` | Narrow, concealed (e.g. master↔ensuite) |
| `BUFFER` | Indirect adjacency (e.g. bedroom—corridor—bathroom) |
| `SERVICE_ACCESS` | Efficient shortest path (e.g. kitchen↔utility) |
| `CEREMONIAL_THRESHOLD` | Axial alignment (e.g. hall↔living in formal layouts) |
| `VISUAL_CONNECTION` | Sightline, not physical (e.g. salon↔balcony) |
| `ACOUSTIC_SEPARATION` | Required wall + acoustic insulation (e.g. master↔WC) |

This is where plans begin feeling *architectural* rather than diagrammatic.

### §3.D — Compositional Geometry Engine

**Beyond legality + compactness + allocation.** Adds compositional order fields:

- **Alignment fields** — wet walls stack; corridor walls align; opening jambs share a vertical axis.
- **Proportional grids** — rooms reference a shared module (3 × 600 mm = 1800 mm wall stud spacing).
- **Structural rhythm** — column spacing supports both span + room sizing.
- **Façade rhythm** — exterior openings march to a regular cadence.
- **Opening cadence** — interior doors share a head height; window sills align.
- **Axis persistence** — visual axes from the entry extend through aligned doorways.

This is why real architecture feels *coherent* — not because every room is optimal, but because *lines align, rhythms repeat, walls reinforce each other, openings feel intentional*.

### §3.E — Perceptual Simulation Engine

**Where PRYZM becomes extraordinary.** Simulates the inhabitant's perceptual experience.

- Human eye movement; sightline tracing from the entry.
- Compression / expansion sequence (threshold → wide release).
- Daylight reveal — what surface does the morning sun strike first?
- Visual termination — where does the eye stop?
- Perceived spaciousness — diagonal sightlines extend small rooms.

**Why.** A 55 m² apartment can *feel* larger than a 70 m² apartment because views extend diagonally, daylight penetrates deeply, corridors disappear, sightlines terminate in windows. Architects know this intuitively; PRYZM must simulate it.

### §3.F — Human Behavioural Simulation

**The "life works" layer.** Beyond furniture fit.

Simulate:

- Waking at night → bedroom-to-bathroom path comfort.
- Carrying laundry → utility-to-bathroom-to-bedroom path width.
- Cooking for guests → kitchen-to-dining flow + island clearance.
- Opening fridge + oven simultaneously → clearance around the cook.
- Kids running → corridor visibility + safety.
- Acoustics during hosting → sound-isolation between living + bedrooms.
- Path congestion at peak occupancy.

Catches psychologically awkward plans, friction-heavy layouts, and hidden discomfort.

### §3.G — Typology Priors

**Architecture is culturally encoded.** A Parisian apartment is not a generic plan — it contains social assumptions, domestic rituals, façade etiquette, circulation philosophy.

| Typology | Prior |
|---|---|
| **Haussmann (Paris)** | Salon on façade; enfilade reception; service deep (kitchen / bedroom). WC isolated. |
| **Nordic compact** | Daylight maximisation; compressed wet core; communal living dominant. |
| **Japanese micro-unit** | Threshold compression (genkan); flexible rooms (engawa, fusuma); wet core compressed. |
| **Mediterranean** | Thermal courtyard logic; shaded loggia; cross-ventilation. |
| **London developer** | Pragmatic compactness; en-suite ratio max; storage minimal. |
| **NYC loft** | Open flexible hierarchy; column grid celebrated; service core central. |

User-selectable; per-typology overrides apply on top of the universal rules.

---

## §4 — Staged hierarchical optimisation (six stages)

**CRITICAL technical decision: do NOT make one giant optimiser.** Use **staged hierarchical optimisation** that mirrors how architects actually think.

| Stage | Engine layer | Produces | Consumed by |
|---|---|---|---|
| 1 | §3.A Environmental | Façade values + daylight + noise fields | Stages 2–4 |
| 2 | §3.B Hierarchy | Public/private map + circulation narrative + climax zones | Stages 3, 4, 6 |
| 3 | §3.C Semantic graph | Typed room relationships | Stage 4 |
| 4 | §3.D Geometry | Actual subdivision (rooms + walls + openings) | Stages 5, 6 |
| 5 | §3.E + §3.F | Furnishing + activity simulation + behavioural validation | Stage 6 |
| 6 | §3.E perceptual | Emotional quality metrics (Pareto-ranked) | The ranker / user |

**Each stage commits its decisions BEFORE the next runs.** Backtracking is allowed (a Stage 5 failure can return to Stage 4 with new constraints) but is the exception, not the rule. This is what gives the system *architectural authority* — decisions cohere because they propagate down from higher abstractions.

---

## §5 — The Spatial Intent Field (the single highest-leverage feature)

If one transformative feature were the sole next investment, it would be the **Spatial Intent Field**:

Instead of room adjacency only, the engine maintains continuous fields of:

- **importance** (where the design "should resolve")
- **privacy** (how shielded from the entry)
- **openness** (how spatially continuous)
- **calmness** (acoustic + visual quiet)
- **daylight** (solar value)
- **sociality** (suitability for gathering)
- **exposure** (façade prominence)

**Subdivision emerges from fields** rather than from arbitrary rectangle packing. This is much closer to how architects think; it absorbs Stages 1–3 into a unified upstream substrate.

---

## §6 — The AI question (very important)

**Do NOT hand full layout generation to an LLM.** LLMs are weak at geometry, weak at constraints, weak at consistency, weak at exact topology. They are **very strong** at architectural interpretation, typology inference, atmosphere language, hierarchy reasoning, critique, concept synthesis.

| Component | Technology |
|---|---|
| Geometry | Deterministic engine |
| Constraints | Deterministic |
| Optimisation | Deterministic / Pareto |
| Perception scoring | Simulation |
| Architectural critique | AI |
| Typology synthesis | AI |
| Style priors | AI |
| Intent interpretation | AI |

**AI guides the engine; AI does not replace it.** This is the critical distinction. The engine produces deterministic, watertight geometry. The AI layer interprets, critiques, and synthesises.

---

## §7 — PRYZM today vs the target (gap analysis per layer)

Concrete cross-references to current package state.

### §7.A — Environmental Intelligence Engine

**Today.** ❌ Largely absent. `FacadeOrientationService` (SL-3) returns per-shell-edge cardinal direction. No daylight depth, no noise, no view, no thermal, no field representation.

**What exists.** `packages/spatial-index/FacadeOrientationService.ts` returns `'N'|'S'|'E'|'W'` for shell edges. Consumed by D-TGL but only as a flag, not as a value field.

**Gap.** No per-edge or per-(x,z)-cell scoring; no continuous field; no consumer of the field.

### §7.B — Spatial Hierarchy Engine

**Today.** 🟡 Partial via `privacy: 'public'/'circulation'/'private'/'service'` on ROOM_RULES + the `connected` + `circulation` axes in `objectives.ts`. No arrival sequence, no spatial climax, no movement narrative.

**What exists.** `programRules.ts` privacy classes; `objectives.ts` `circulation` axis (Space-Syntax public-shallow / private-deep gradient — recent commit `587f7b0` added `§ADJACENCY-PREFERENCE`).

**Gap.** No "compressed threshold → reveal" generator. No spatial-climax identification. No movement-narrative scoring.

### §7.C — Semantic Topology Graph

**Today.** 🟡 Edges typed only as `via: 'open' | 'door'` (in `AdjacencyEdge`). No social-flow / intimate-access / buffer / service / ceremonial typing.

**What exists.** `bubbleGraph.ts` `AdjacencyEdge { a, b, via: 'open' | 'door' }`; `§KITCHEN-DISTINCT` (`2244585`) forced all kitchen edges to `door`.

**Gap.** Need a typed enum (~7 edge types) consumed by `wallsAndDoors.ts` for geometric treatment (wide opening vs narrow concealed vs buffer).

### §7.D — Compositional Geometry Engine

**Today.** 🟡 Partial. `subdivide.ts` squarifies rectilinearly + applies §HARD-MIN-SIDE / §SINGLE-RECT-CARVE / §EXTEND-TO-PERIMETER / §COLLINEAR-MERGE. No alignment fields, no proportional grids, no structural rhythm, no façade rhythm enforcement.

**What exists.** D-TGL P3 squarify + the various §-tagged post-passes for rectilinear shells.

**Gap.** Needs a pre-subdivide alignment-field layer + a post-subdivide tidy pass that snaps wet walls + corridor walls + opening jambs to shared axes.

### §7.E — Perceptual Simulation Engine

**Today.** ❌ Absent. No sightline ray-casting, no compression-release simulation, no daylight reveal scoring, no perceived spaciousness metric.

**What exists.** Nothing.

**Gap.** Full new layer.

### §7.F — Human Behavioural Simulation

**Today.** ❌ Absent. `§F-Sprint-5` circulation gate verifies *reachability* (centroid-to-door clear path), not *behavioural comfort*.

**What exists.** `packages/ai-host/src/workflows/furnishLayout/validate.ts` — circulation reachability validator.

**Gap.** Full new layer (agent-based occupancy simulation).

### §7.G — Typology Priors

**Today.** ❌ Absent. ROOM_RULES encode a generic modernist baseline.

**What exists.** `apartment-furnish-quality-wishlist` + `program-rules-improvements-queue` accumulate tactical tuning, but no typology selector.

**Gap.** Full new layer (typology selector UI + per-typology RoomRule override map).

---

## §8 — Implementation plan (status-tracked)

The 7 layers × the 6 stages × specific concrete deliverables. **Each row is a unit of tracked work.** The Status column updates as commits land.

Legend:
- ⬜ Not started
- 🟦 Planning / spec
- 🟨 In progress
- ✅ Complete
- 🟥 Blocked

| ID | Layer | Deliverable | Estimate | Status | Notes |
|---|---|---|---|---|---|
| **L1-α-1** | §3.A Environmental | `FacadeValueField` — extend `FacadeOrientationService` to a per-edge `{orientation, sunlightHours, noise, viewQuality, cornerExposure, privacyRisk, ventilation}` score. | 1 week | ⬜ | Pure layer in `packages/spatial-index/`. No D-TGL change. |
| **L1-α-2** | §3.A | `DaylightDepthField(x, z)` — approximate solar penetration depth per shell cell. North-light penalty, dual-aspect bonus. | 1 week | ⬜ | Pure. Inputs: shell polygon + window spans + latitude. |
| **L1-α-3** | §3.A | Plumb the FacadeValueField into `bubbleGraph.scaleProgramToShell` — bias high-value façade allocation to living / master. | 0.5 week | ⬜ | Depends on L1-α-1. |
| **L1-α-4** | §3.A | Modal exposes a "Façade quality" axis in the score breakdown card. | 0.5 week | ⬜ | UI in `layoutModalHtml.ts`. |
| **L2-β-1** | §3.B Hierarchy | New `hierarchy` axis in `ObjectiveVector` — rewards private rooms at depth ≥ 3 from entry + public rooms at depth ≤ 2. | 0.5 week | 🟦 | First concrete Phase 2 slice. Drafted as `§PRIVACY-DEPTH`. |
| **L2-β-2** | §3.B | `EntrySightlineScore` — ray-cast from entry door centre; penalise direct bath / WC / bedroom visibility; reward direct living-window visibility. | 1.5 weeks | ⬜ | Needs `packages/ai-host/src/workflows/apartmentLayout/tgl/sightline.ts`. |
| **L2-β-3** | §3.B | `ArrivalSequence` analysis — compressed threshold → release detection. Score the area ratio between hall and the first habitable space encountered. | 1 week | ⬜ | |
| **L2-β-4** | §3.B | `SpatialClimax` — identify the dominant room (usually living) by area + façade value + visual centrality. | 0.5 week | ⬜ | |
| **L2-β-5** | §3.B | Modal exposes "Hierarchy" axis + a textual arrival narrative ("Front door opens onto a compressed threshold; releases into the south-facing living room"). | 0.5 week | ⬜ | |
| **L3-γ-1** | §3.C Semantic graph | Add `EdgeType` enum: `SOCIAL_FLOW`, `INTIMATE_ACCESS`, `BUFFER`, `SERVICE_ACCESS`, `CEREMONIAL_THRESHOLD`, `VISUAL_CONNECTION`, `ACOUSTIC_SEPARATION`. Update `AdjacencyEdge`. | 0.5 week | ⬜ | Schema change; downstream `wallsAndDoors.ts` opt-in. |
| **L3-γ-2** | §3.C | Populate `EdgeType` in `bubbleGraph.ts` builder (kitchen↔dining = SOCIAL_FLOW; master↔ensuite = INTIMATE_ACCESS; corridor↔bath = SERVICE_ACCESS, etc.). | 0.5 week | ⬜ | |
| **L3-γ-3** | §3.C | `wallsAndDoors.ts` reads `EdgeType` and picks the door width + opening style accordingly (SOCIAL_FLOW = wide / no door; INTIMATE_ACCESS = standard; BUFFER = no direct adjacency). | 1 week | ⬜ | Depends on L3-γ-1 + L3-γ-2. |
| **L3-γ-4** | §3.C | New objective axis `edgeRealisation` — fraction of high-importance edge types (SOCIAL_FLOW, CEREMONIAL_THRESHOLD) realised with the correct geometric treatment. | 0.5 week | ⬜ | |
| **L4-δ-1** | §3.D Composition | `AlignmentField` — pre-subdivide compute axis lines from façade openings + structural column candidates. Subdivide snaps to lines within tolerance. | 1.5 weeks | ⬜ | Touches `subdivide.ts`. |
| **L4-δ-2** | §3.D | `WetStackAlignment` — penalise layouts where bathroom + ensuite + kitchen + utility don't share at least one vertical wall axis. | 0.5 week | ⬜ | Single-storey signal; major win at multi-floor. |
| **L4-δ-3** | §3.D | `OpeningCadenceScore` — reward interior doors sharing head height + window sills aligning on the same façade. | 0.5 week | ⬜ | |
| **L4-δ-4** | §3.D | `ProportionalElegance` — penalise rooms with aspect ratio > 3:1 + jagged boundaries (any vertex with internal angle > 270 °). | 0.5 week | ⬜ | Light-touch shape regulariser. |
| **L5-ε-1** | §3.E Perceptual | `SightlineGraph` — for each (room A, room B) compute longest unobstructed line. Identify diagonal sightlines through aligned doorways. | 1.5 weeks | ⬜ | Pre-req for spaciousness scoring. |
| **L5-ε-2** | §3.E | `PerceivedSpaciousness` — areaM2 × diagonal-sightline-length / shortest-side. Captures "55 m² feels larger than 70 m²" effect. | 1 week | ⬜ | |
| **L5-ε-3** | §3.E | `DaylightReveal` — at the entry, score the daylight intensity at the first wall surface the gaze strikes. Reward warm wall + window beyond. | 1 week | ⬜ | |
| **L5-ε-4** | §3.E | `VisualTermination` — for each major axis sightline, identify the terminator (door / wall / window / corner). Reward window terminators. | 0.5 week | ⬜ | |
| **L6-ζ-1** | §3.F Behaviour | `OccupancyAgent` — pure simulator placing a body at start + walking to goal through pure-path-finding, accumulating clearance violations. | 2 weeks | ⬜ | Pure layer; uses footprints + door swings as obstacles. |
| **L6-ζ-2** | §3.F | Six canonical activities: cooking-for-guests, waking-at-night, carrying-laundry, hosting-conversation, kids-running, opening-fridge-and-oven. Score each per layout. | 1.5 weeks | ⬜ | Depends on L6-ζ-1. |
| **L6-ζ-3** | §3.F | `FrictionScore` aggregate — sum of clearance violations + path-conflict events. New objective axis. | 0.5 week | ⬜ | |
| **L7-η-1** | §3.G Typology | Typology selector in the modal (Generic / Haussmann / Nordic / Japanese / Mediterranean / London / NYC). | 1 week | ⬜ | |
| **L7-η-2** | §3.G | Per-typology `RoomRule` override map; merged onto the universal `ROOM_RULES` at engine entry. | 1 week | ⬜ | |
| **L7-η-3** | §3.G | Per-typology archetype overrides for D-FLE (Haussmann salon-on-façade rule; Japanese genkan threshold; Nordic compressed wet-core). | 2 weeks | ⬜ | Per-typology archetype variant set. |
| **L7-η-4** | §3.G | AI-side architectural critique: per-layout, the AI explains *why* it ranked this option above the others in typology-relevant language. | 1.5 weeks | ⬜ | Uses the in-process AiPlane. |
| **L0-INT-1** | Cross-cut | **Intent Field substrate** — new `packages/spatial-index/SpatialIntentField.ts` with 7 channels (importance / privacy / openness / calmness / daylight / sociality / exposure). Phases L1-L3 write into it; Phase L4 reads. | 2 weeks | ⬜ | The single highest-leverage feature per §5. Builds incrementally — each channel can ship independently. |
| **L0-INT-2** | Cross-cut | **Pareto refactor** — `enumerate.ts` maintains a true Pareto frontier across (daylight, privacy, circulation, efficiency, structure, furniture, façade, acoustic) instead of weighted sum. | 2 weeks | ⬜ | Structural change; depends on most axes existing. |

**Total estimated effort (status: planning).** ~30 weeks of focused work to close the cognition stack. Items can interleave; many are independent. The tactical Tier 1 wishlist items in `STATUS §3` continue to ship in parallel — they close visible UX gaps that the strategic phases don't touch.

---

## §9 — Recommended near-term sequencing

If the next 2–4 weeks are the target window, ship in this order for the *largest perceived jump*:

1. **L1-α-1 + L1-α-3** — façade scoring + plumb into allocation. ~1.5 weeks. Closes the "naive façade allocation" gap.
2. **L2-β-1** — `§PRIVACY-DEPTH` / new `hierarchy` axis. ~0.5 week. Cheap; instantly improves Pareto rank.
3. **L2-β-2** — `EntrySightlineScore`. ~1.5 weeks. Catches the bath-from-entry visibility class of defect.
4. **L3-γ-1 + L3-γ-2** — typed semantic edges. ~1 week. Pre-req for everything in §3.C and §3.D.

**End-of-month state.** Façade-aware allocation, depth-aware hierarchy, sightline-aware ranking, typed edges plumbed end-to-end. Single biggest perceptual jump in the engine's history without touching furniture or window emission (the visible Tier 1 items).

**Then (1–2 months).** L4-δ-1 / L4-δ-2 / L4-δ-3 + L5-ε-1 / L5-ε-2 — compositional alignment + perceived spaciousness. This is when plans start *feeling inevitable*.

**Then (2–4 months).** L6 (behavioural sim) + L7 (typology priors). This is when plans start *feeling believable*.

---

## §10 — The endgame

> The endgame is NOT "generate apartments." The endgame is: **generate inhabitable spatial experiences.**

PRYZM eventually becomes:
- **spatial cognition** (the 7-layer stack)
- **architectural reasoning** (typed edges + hierarchy + composition)
- **environmental intelligence** (Layer A fields)
- **perceptual simulation** (Layer E + behavioural sim)
- **cultural typology synthesis** (Layer G + AI critique)

combined into **one system**. This is genuinely rare territory. None of today's commercial proptech reaches Phase 3. Reaching it requires the cognition stack outlined above, not more rules in Layer 1.

---

## §11 — Pointers

- `APARTMENT-LAYOUT-STATUS-2026-05-29.md` — history + tactical tiers + §5 architectural-excellence framework (the precursor to this doc).
- `APARTMENT-DRIVING-PRINCIPLES-AND-ROOM-ELEMENT-MATRIX-2026-05-29.md` — local-rule layer (Layer 1 in the cognition stack).
- `REMAINING-WORK-CONSOLIDATED-2026-05-29.md` — production-readiness / daily-use / other tracks (Phase 1-tier work, parallel to this).
- Engine code: `packages/ai-host/src/workflows/apartmentLayout/` (D-TGL) + `furnishLayout/` (D-FLE) + `ceilingLayout/` (D-CE) + `lightingLayout/` (D-LE).
- Per-package: `packages/spatial-index/` for L1-α-1 (Environmental Intelligence); `packages/ai-host/src/workflows/apartmentLayout/tgl/` for L2 / L3 / L4.
