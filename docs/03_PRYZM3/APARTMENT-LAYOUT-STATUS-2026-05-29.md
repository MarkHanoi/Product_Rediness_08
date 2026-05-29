# Apartment Layout — Status & Remaining Work (2026-05-29)

**Scope.** Everything PRYZM does to turn a user-drawn exterior shell into a built apartment with rooms, doors, windows, ceiling, floor finishes, furniture and lighting — across two sub-stories: **#51 single-apartment** (shipped) and **multi-apartment floor-plate** (queued).

**Audience.** Architect / product / engineering. Each section reads as "what the user gets today" → "what the user is asking for next" → "what it would take."

**Method.** Built from `git log` (~70 commits since `21f1bbf` on 2026-05-23), the `apartmentLayout` workflow SPEC, the four memory queues (`apartment-furnish-quality-wishlist`, `program-rules-improvements-queue`, `single-apartment-fix-pass-spec`, `multi-apartment-floor-plate-brief`), and the live editor + test counts (`415 → 424` ai-host tests).

---

## §1 — Headline status

| Capability | Status | User value |
|---|---|---|
| **One-click apartment layout** from a drawn shell | ✅ Shipped end-to-end (#51) | Architect draws a rectangle, picks a card, gets a built floor plan in seconds. |
| **3-option modal with live program edit** | ✅ Shipped (§MODAL-DYNAMIC + §CLICK-FOCUS + §A11Y) | Tweak bedrooms / bathrooms / per-room m² + see diagrams refresh in place. |
| **Auto-pipeline: apartment → floor + ceiling → furnish → lighting** | ✅ Shipped (chain auto-fires + 12 s timeout fallback) | One command runs the full design pass. |
| **Per-room floor finishes by type** | ✅ Shipped (§FLOOR-FINISH `97417be`) | Timber in living/bedroom, tile in kitchen/bathroom. |
| **Kitchen with sink + hob + fridge by default** | ✅ Shipped (§KITCHEN-DEFAULT-APPLIANCES `77416c0`) | Every kitchen renders with a complete appliance set. |
| **Optional island for large open-plan kitchens** | ✅ Shipped (§KITCHEN-ISLAND `550e30a`) | Auto-adds island when there's centroid space; drops it in tight kitchens. |
| **Layout quality — distinct kitchen, size-scaled rooms** | ✅ Shipped (§KITCHEN-DISTINCT, §AREA-FRACTIONS, §BATH-CORRIDOR-ONLY, §ADJACENCY-PREFERENCE) | Kitchens never merge into the living blob; master/corridor sized as a fraction of the apartment; bath-off-bedroom forbidden; layout ranking distinguishes good from merely legal. |
| **Window emission for un-windowed apartments** | ❌ Not built | Built apartments today have NO auto-windows on bare exterior walls. |
| **Multi-apartment floor plate** (shared core + N flats) | ❌ Not built — full brief saved | New scope, ~quarter's work. |
| **Corridor connectivity validator** | 🟡 Diagnostic only (§SEALED-ROOMS `7623221`) | Surfaces sealed rooms but doesn't reject dead-end corridors. |
| **L-corner junction defect** | ❌ Open (geometry-wall package) | Black-triangle artefact at interior↔exterior L-corners. |

**Test counts at HEAD.** ai-host: **424 / 424 actuals pass**. Editor pure renderer: **38 / 38 pass**. Two pre-existing AiHost SCC barrel-load failures track separately.

---

## §2 — What's been done (chronological history)

### Phase A — engine + plane (2026-05-25 → 2026-05-26)

The deterministic offline engine — no AI tokens, runs on a laptop in milliseconds.

- `21f1bbf` D-TGL as-built + contract sync (SPEC v1.0, C09, apartment-layout SPEC §A8) — the canonical record.
- `14f41f6` User guide + offline (D-TGL) mode + FAQ/troubleshooting.
- `14d6896` `7e208bf` `01bb90d` `981e0ee` `86cf612` D-TGL P1–P9: rectilinear dissection → squarified subdivision → semantic LayoutGraph → Space-Syntax Pareto rank → geometry → reconciliation (no sealed rooms) → distinct corridor.
- `dff9ea0` `cd3449e` `eab0fc0` `eee3c66` D-FLE (Deterministic Furniture Layout Engine) F1–F8: footprints + archetypes + collision + placement solver + command emission.
- `6b60bde` WS-1.B: rooms named + typed by use (deferred-redetect timing + occupancy).
- `b8734d1` `9e6f8ec` `256a02f` doors now build, gated on actual host walls.
- `3bafb0b` `6860635` Architectural program rules database — connectivity matrix + privacy caps + room program + 248-constraint engineering DB (UK Building Regs).
- `67b4afc` `8002a67` `7b384cd` `6b79c08` Subdivide allocation, two-pass phase-2a, calmer auto-scale, room-detection diagnostic.
- `1130b94` `1883d55` Window-snap end-to-end (partitions never terminate inside a shell window).

### Phase B — engineering plumbing (2026-05-26 → 2026-05-28)

- `b46792b` `0055b03` `af7a493` `c8d3be1` `26d71a6` ADR-0055 wall pipeline (P3a fan-wind-fix, V2 pre-trim-fix, ADR-0055A addendum, P4 scope analysis).
- `32e511c` Live-fix L/T black triangle + preview-vs-build visibility.
- `0310317` Extend `apartment.layout-executed` event with drop visibility.
- `b6da0f1` §COLLINEAR-MERGE — fold per-room-edge segments into pass-through walls.
- `c25ae42` §EXTEND-TO-PERIMETER — exterior walls reach slanted shell perimeter.
- `6cb369f` `f89ebd0` `ae9bf4e` D-FLE wired + D-LE (lighting) engine + D-CE (ceiling) engine — auto-pipeline.
- `1aa1b43` `fc244cb` UI cards for Furnish/Light + manual full-pipeline shortcut + §HARD-MIN-SIDE-2M room floor.

### Phase C — modal-dynamic feature (2026-05-29)

User feedback: "I would like to be dynamic — change rooms / bedrooms / sqm and modal refreshes."

- `c278548` `760ebc7` Three architect-feedback fixes (door clear, per-room min side, bedroom rule) + §SINGLE-RECT-CARVE corridor strip + ensuite-from-master.
- `01eaa1a` Modal: exact polygons + room labels + door swing arcs.
- `cdd28d4` §MODAL-DYNAMIC — live program edit + in-place refresh.
- `b2c1c43` §MODAL-DYNAMIC part 3 — scale bar + occupancy legend.
- `3f157f9` `475f87c` §ROOM-AREAS — per-RoomType absolute area override (engine + UI).
- `f9c3662` `51e05ef` §ROOM-AREAS-BY-NAME — per-instance ("Bedroom 1") area overrides (engine + UI).
- `03577b7` §RELIABILITY — modal regenerate 15 s timeout.
- `a827345` §WINDOW-SYMBOLS — perimeter windows + front door drawn in the thumbnail.
- `7a7b147` §CHAIN-TIMEOUT — auto-fire chain reliability (12 s fallback) so a single bad stage doesn't strand the pipeline.

### Phase D — architecture pass + perf + circulation gate (2026-05-29)

User: "no shortcuts allowed."

- `ae85128` Architecture P4 + sub-zone cache soundness pass.
- `23695d3` `727139a` §F-Sprint-5 circulation gate — pure validator + editor wiring.
- `0f325cc` §VALIDATE-CACHE — `pryzmShowFurnishWarnings()` console review.
- `9ac588d` §CLICK-FOCUS — click a room polygon → focus its area input.
- `b6a66f9` §A11Y — keyboard activation for room polygons.
- `f1eaca0` §HELP — `pryzmShowApartmentHelp()` lists every pipeline console command.
- `540b25e` §VALIDATE-TOAST — surface circulation warnings on completion toast.
- `0baf434` §BUILD-TOAST — surface dropped-wall count.
- `e22ddcf` §INTERIOR-HEIGHT-MATCH promoted from live-fix to upstream constraint.
- `e0a4b44` §POLL-TELEMETRY for the two silent waits.

### Phase E — quality pass + program-rules round (2026-05-29)

After the architect tested the modal: it "looks great" but flagged 6 quality gaps + the bath-off-bedroom + adjacency soft-preference gaps.

- `8028640` §SKEL-MATCH — landing-page skeleton matches the real LandingPage (kills the silent-flash bug).
- `8463607` §QUOTA-EVICT — recover from localStorage exhaustion by evicting other projects' stale histories.
- `97417be` §FLOOR-FINISH — auto-fire `CreateFloorsByRoomTypeCommand` in the pipeline (timber/tile per room type).
- `77416c0` §KITCHEN-DEFAULT-APPLIANCES — sink + hob + fridge by default in every kitchen.
- `550e30a` §KITCHEN-ISLAND — optional centre island in large kitchens.
- `58ccd3f` §BATH-CORRIDOR-ONLY — bath off any bedroom forbidden (queue #2).
- `587f7b0` §ADJACENCY-PREFERENCE — soft pair weights (queue #6) — kitchen↔dining 1.0, kitchen↔corridor 0.3, etc. Adjacency objective now distinguishes good layouts from merely legal ones.
- `4d1f450` §WC — separate WC room type (queue #1a).
- `4e2d444` §AREA-FRACTIONS — size-scaled min/max area clamps (queue #3 + single-apartment-fix #3). Corridor capped at 10 %; master at 20 %; bedroom at 16 %; living min 15 %, kitchen min 7 %, bathroom min 5 %.
- `2244585` §KITCHEN-DISTINCT — kitchen always an enclosed room (single-apartment-fix #1). The open-plan toggle now controls living↔dining merge, not kitchen.
- `7623221` §SEALED-ROOMS — diagnostic for rooms with zero doors (single-apartment-fix #4 partial).

---

## §3 — What's remaining — from a user/business value standpoint

Sorted by how much each item changes what an architect can ship by EOD.

### Tier 1 — visible, high impact (1–2 sessions each)

#### A. Window emission engine (single-apartment-fix-pass-spec #5)

**Business value.** Today's built apartments have NO windows on bare exterior walls. The architect has to place every window manually after generation. The visible "this looks finished" jump is enormous.

**Scope.** New pure sub-engine in `packages/ai-host/src/workflows/apartmentLayout/` — input: room polygons + exterior walls + per-room rules; output: `OpeningSpec[]` for `window.create`. Per room × exterior wall:
- Living / kitchen ≥ 1.2 m wide
- Bedroom ≥ 0.9 m wide
- Bathroom ≥ 0.6 m wide (omit if no exterior wall)

Editor wiring: a new `windowLayoutTrigger.ts` mirroring `floorLayoutTrigger`, auto-firing after `apartment.layout-executed`. Throw if `windowIds.length === 0` (spec literally says this).

**Estimate.** 1 round to ship the pure engine; 1 round to wire + visualise in the modal. Probably the single highest-ROI item in the queue.

#### B. Corridor connectivity validator (single-apartment-fix-pass-spec #2)

**Business value.** Today shipped layouts have all rooms door-connected (legality gate filters disconnected candidates) — but a corridor can serve only ONE room (dead-end stub) and still pass. The spec forbids dead-end corridors.

**Scope.** Add a "corridor must touch ≥ 2 rooms via doors" gate on top of the existing `connected` check. Surface a new metric `corridorTouchCount` and prefer candidates with higher counts.

**Estimate.** 1 round. Builds on the existing `§SEALED-ROOMS` diagnostic.

#### C. Layout quality — slicing-tree placement (WS-3 P3c-1)

**Business value.** The squarify pass is greedy. A slicing-tree gives demonstrably more professional plans (rooms aligned to a coherent spine). Biggest single layout-quality lever per memory.

**Scope.** Structural refactor of D-TGL P3c. Own session focus.

**Estimate.** 1–2 weeks. Not a single round.

### Tier 2 — visible polish (1 session each)

#### D. Proper lighting (task lights)

D-LE places pendants per occupancy. Spec is incomplete: no kitchen under-cabinet, no bedside lamp on the bedside_table, no bathroom mirror light. Add per-spec entries in the lighting archetype.

#### E. Wardrobe variants

Bedroom archetype declares `wardrobe` but only the generic anchor. Add `prefer-corner` and `sliding-door` variants + size-scaled (large bedroom → wider wardrobe).

#### F. Illogical-connection legality post-pass

Rare but happens. The bubble graph + rules already enforce permissions, but the post-pass door emission occasionally picks a forbidden pair. Tighter assertion + console-error when this happens.

### Tier 3 — program-rules round (queued)

From `program-rules-improvements-queue` (4 items remaining):

- **#1b** — missing room types: balcony / terrace / storage / open_plan (`wc` already shipped).
- **#4** — `desk` + `desk_chair` FurnitureKind stubs (study reuses dining_table as workaround).
- **#5** — asymmetric door access — `accessTo` field on RoomRule, so ensuite→master is one-way.

### Tier 4 — multi-apartment floor plate (NEW SCOPE, large)

Full brief saved at `multi-apartment-floor-plate-brief.md`. Estimated **6–12 weeks** to build, broken into:

- **Phase 1** — concept of `building` / `floor_plate` / `apartment` super-shells above the current `LayoutOption`.
- **Phase 2** — shared core: lift shaft, stair core, public corridor (≥ 1.5 m Part M), entrance lobby.
- **Phase 3** — apartment mix UI (4 units, mixed bedroom counts, per-unit area targets).
- **Phase 4** — internal-corridor vs public-corridor distinction in ROOM_RULES (`apartment_corridor` vs `public_corridor`).
- **Phase 5** — structured JSON output schema + per-apartment validation summary table.

Not a single-round item.

### Tier 5 — wall-junction defects (geometry-wall package, separate owner)

- **L-corner junction** — interior↔exterior L-corner black-triangle artefact (`apartment-pre-existing-door-and-wall-finish`).
- **WallJoinResolver multi-cluster degenerate-wall bug** (`walljoinresolver-multi-cluster-bug`) — flag self-cluster walls INVALID + skip mesh build.
- **Interior-wall-on-opening conflict bug** (`interior-wall-on-opening-conflict-bug`) — block interior-wall commit on a door/window occupancy range.

### Tier 6 — perf / structural refactors

- **WS-2.C** — unify redetect + reprojection on FrameScheduler bus.
- **WS-2.D** — incremental projection (biggest perf win).
- **End-to-end happy-dom test** — needs `@thatopen/ui` mock.
- **Ranked-arrangement quality pass** — needs archetype variants first.

---

## §4 — One-paragraph recommendation (tactical)

**Ship Tier 1A next.** A new window-emission engine + auto-fire trigger turns every built apartment from "missing finishes" to "looks done" in one round. After that, corridor connectivity (Tier 1B) closes the last fix-pass spec item. Slicing-tree placement (Tier 1C) is the next big quality lever but warrants its own focused session. The multi-apartment floor plate (Tier 4) is a separate quarter-scale initiative — worth scoping but not blocking single-apartment polish.

---

# §4.5 — The next leap (strategic gaps, user-supplied 2026-05-29)

**Frame.** Everything in §3 closes *visible / functional* gaps. They're necessary but not sufficient. The engine today produces **"valid architecture."** The next leap is **"emotionally convincing architecture"** — and that doesn't come from more room rules. It comes from a different *kind* of intelligence:

> *The biggest remaining gaps are no longer "basic functionality" gaps — they are now topology intelligence gaps, architectural realism gaps, optimization hierarchy gaps, geometric robustness gaps, and human-behavior gaps. The most important thing now is preventing the engine from becoming "locally valid but globally mediocre."*

The remaining work in §3 (windows, corridor connectivity, lighting variants, wardrobe variants, etc.) is the local-rules tier. The 13 gaps below are the global-spatial-intent tier — they reshape *how* the engine scores and chooses layouts, not what rules it enforces.

## §4.5.1 — The 13 strategic gaps (priority-ordered)

| Priority | Gap | What's missing | Why it matters |
|---|---|---|---|
| 1 | **Façade + daylight intelligence** | No `FacadeSegmentAnalysis`: per-exterior-edge scoring of orientation, sunlight, noise, view, corner exposure, ventilation. No daylight propagation engine (depth, dual-aspect bonus, north-light penalty). | Façade quality drives apartment quality. Without it, living rooms don't claim the best façade and bedrooms don't avoid noisy frontage. |
| 2 | **Spatial hierarchy engine** | No `SpatialHierarchyScore`: entry visibility depth, daylight reveal gradient, privacy depth, public-frontage ratio, corridor concealment, compression→expansion ratio. | Single biggest quality multiplier. A great apartment has an arrival sequence: compressed threshold → opens to daylight → living anchors façade → private corridor branches quietly. Current rules imply this but don't optimise it. |
| 3 | **Corridor morphology** | Connectivity legality + width minima exist; corridor *shape grammar* doesn't — straightness, minimal branching, visual termination, daylight-assisted, dead-space detection (bulges / recesses), sightline blocking (no direct bath-view from entry). | The corridor is the spine — its morphology determines whether a flat reads "considered" or "developer cheap." |
| 4 | **Structural integration** | No structural grid generator (columns, load-bearing lines, transfer constraints). No wet-stack optimiser (vertical plumbing continuity, shaft grouping, MEP routing). | Without structure, layouts may be physically impossible — spans unrealistic, shafts inefficient. Essential for multi-apartment. |
| 5 | **Visibility / sightline optimisation** | No weighted visibility graph: entry→living = good, entry→bathroom = bad, kitchen→dining = good, bedroom→bedroom = bad. | Huge realism gain. Sightline rules separate "valid" from "designed." |
| 6 | **Multi-objective Pareto optimisation** | Current scoring is weighted-additive — produces mediocre compromise solutions. Need true Pareto front across daylight / privacy / circulation / efficiency / structure / furniture / façade / acoustic. | Weighted sums collapse trade-offs; Pareto preserves architecturally balanced candidates. |
| 7 | **Human movement simulation** | Furniture fits geometrically; movement comfort, collision flow, door-collision penalties, bottlenecks, awkward crossings — not simulated. Agent-based occupancy (cooking, dining, entering, waking at night, carrying laundry, hosting). | Dramatically improves realism. Catches the "you can't get from the bed to the bathroom at night without circling the wardrobe" class of defect. |
| 8 | **Compositional alignment rules** | Functional + legal correctness exists; symmetry, alignment, rhythm, compositional clarity don't. Wet walls don't align; corridor walls don't align; opening rhythms aren't enforced. | Compositional beauty matters enormously visually. Drives the "this looks designed, not generated" perception. |
| 9 | **Semantic graph topology** | Bubble graph is flat: adjacency + legality + weights. No typed edge semantics (living→dining = social-flow; corridor→bedroom = privacy-access; master→ensuite = intimate; kitchen→utility = service). | Different edge types need different geometric treatment. Today's solver treats all "open" edges the same. |
| 10 | **Typology priors** | Generic rules only. No Parisian Haussmann / Nordic compact / London developer / Japanese micro / Mediterranean courtyard / NYC loft priors. Each typology has its own hierarchy, kitchen philosophy, circulation philosophy, window ratios, privacy logic. | Massive realism leap. One typology setting could change the whole character of the output. |
| 11 | **Proportional elegance metrics** | Min-side + min-area + some proportions exist; penalties for long-thin rectangles, jagged boundaries, notch geometry, unusable corners, over-articulation don't. No rewards for orthogonality / aligned wall grids / structural coherence / façade rhythm. | Closes the "shapes are legal but ugly" gap. |
| 12 | **Activity-centred furnishing** | Object placement only. Missing: TV alignment, conversational sofa grouping, dining circulation ergonomics, sofa-to-window/view logic, reading-corner logic. | Moves furniture solver from "fits the room" to "rooms work for the activities they host." |
| 13 | **Core-first generation (multi-apartment)** | Multi-apartment brief in queue, but the system is apartment-first. Real practice is: site → core → public circulation → structural grid → façade zones → apartment subdivision → internal layouts. | Apartment-first will fail at multi-flat floor plates. Must invert the order BEFORE building the multi-apartment scope. |

## §4.5.2 — How to phase the strategic tier into delivery

These are NOT next-round commits. Each is a multi-session investment. Suggested phasing:

1. **Phase α — façade scoring + spatial-hierarchy metric** (gaps #1 + #2). Together these are the largest single quality multiplier; both add NEW scoring axes to the existing Pareto rank. Foundational for everything below. Estimated **3–4 weeks**.
2. **Phase β — corridor morphology + sightlines** (gaps #3 + #5). Layered on Phase α: once façade + hierarchy scoring exists, corridor + sightline rules score against those axes. **2–3 weeks**.
3. **Phase γ — true Pareto refactor** (gap #6). Refactor `objectives.ts` + `enumerate.ts` to maintain a Pareto frontier instead of a weighted sum. **2 weeks** structural work.
4. **Phase δ — compositional alignment + proportional elegance** (gaps #8 + #11). Pre-subdivide + post-subdivide tidy passes. **2 weeks**.
5. **Phase ε — typology priors** (gap #10). User-selectable typology in the modal; per-typology rule overrides. **1–2 weeks** + curation time.
6. **Phase ζ — structural integration** (gap #4). New SPEC; cross-cuts D-TGL subdivision. **3–4 weeks**.
7. **Phase η — core-first multi-apartment** (gap #13). The current `multi-apartment-floor-plate-brief` must be refactored to core-first BEFORE implementation — otherwise the system will hit the apartment-first trap. **Major project**, **6–12 weeks**.
8. **Phase θ — human movement sim** (gap #7). Agent simulation. **3–4 weeks**, dependent on robust furniture placement.
9. **Phase ι — activity-centred furnishing** (gap #12). Per-archetype activity rules. **2 weeks**, depends on Phase θ.
10. **Phase κ — typed semantic graph edges** (gap #9). Smaller refactor of `bubbleGraph.ts`. **1 week**, can interleave.

**Total commitment.** Roughly **20–30 weeks** of focused work to close the strategic tier. The tactical tier (§3) is ~4–6 weeks. They are independent enough to interleave — ship visible Tier 1 items per round while strategic phases land in dedicated sprints.

## §4.5.3 — Key insight (verbatim)

> *The engine is already valid architecture. The next leap is emotionally convincing architecture. That transition comes from hierarchy, sightlines, daylight, circulation experience, compositional order, human movement realism — not from adding more room rules.*

This reframes the whole `apartment-furnish-quality-wishlist`, `program-rules-improvements-queue`, and `single-apartment-fix-pass-spec` queues. Those are TACTICAL — they close the local-rule tier. The strategic tier is what makes the difference between "PRYZM produced a working plan" and "PRYZM produced a plan that feels architecturally considered."

---

# §5 — Architectural Excellence Framework (the deeper layer)

§4.5 enumerates the 13 strategic gaps — *what's missing*. §5 frames *what kind of intelligence* must be added so those gaps don't get filled in a way that produces brittle mediocrity. The 13 tactical phases live INSIDE a 5-layer architectural-intelligence model. Adding more rules to Layer 1 will not close Layers 3–5.

## §5.1 — One-sentence diagnosis

> **Your engine understands adjacency but not significance.**

Today's engine distributes constraints. Architecture distributes **importance**. That asymmetry is the real frontier — not another room rule, another archetype, another adjacency weight. After a point, more local constraints produce **brittle mediocrity** because architecture quality is increasingly an emergent *global* property, not a local one.

## §5.2 — The 5-Layer Architectural Intelligence Model

| Layer | Name | PRYZM today | What it does |
|---|---|---|---|
| **1** | **Functional topology** | ✅ Strong | Adjacency, access legality, room program, circulation validity, dimensions. Answers *"Can this apartment work?"* |
| **2** | **Geometric rationalisation** | 🟡 Partial | Subdivision, squarification, wall generation, collision avoidance. Missing: compositional alignment, proportional elegance, structural rhythm, façade rhythm. |
| **3** | **Environmental intelligence** | ❌ Absent | Solar analysis, daylight penetration depth, seasonal light, thermal comfort, ventilation paths, acoustic exposure, façade quality scoring. |
| **4** | **Perceptual choreography** | ❌ Absent | Sightlines, reveal sequencing, compression / release, threshold compression, light termination, emotional climax, where the eye travels, where the body pauses. |
| **5** | **Cultural / typological intelligence** | ❌ Absent | Parisian / Nordic / Japanese / NYC-loft / Mediterranean priors. Social assumptions, domestic rituals, façade traditions, privacy philosophy, enfilade vs open-plan logic. |

Today PRYZM has **≈ 2.5 layers** out of 5. The §4.5 strategic gaps are mostly Layers 3 + 4. Adding more Layer 1 rules will plateau the engine.

## §5.3 — Kuma vs Foster: two intelligences PRYZM still lacks

These two practices are useful framing because they sit at opposite poles of architectural excellence. PRYZM today is *closer to Foster than Kuma* (it already does graph topology, Pareto ranking, deterministic subdivision — that's Foster-shaped thinking). But it's missing pieces of both.

### §5.3.1 — Foster + Partners (systems / hierarchy / inevitability)

Foster operates in: systems integration, performance, modularity, repeatable grammars. The Foster intelligence PRYZM still lacks:

- **Hierarchical systems thinking.** Constraints are not equal-priority. Primary (structure, façade orientation, circulation spine, servicing) → secondary (apartment subdivision, room distribution) → tertiary (furniture, lighting, local refinements). The current pipeline is **too flat** — local rules and global rules compete at the same priority. The §4.5 phasing already identifies this.
- **Structural inevitability.** Great architecture *feels inevitable*: walls align, spans make sense, openings rhythmically cohere, systems reinforce one another. PRYZM's layouts can be *solved* without being *inevitable* — because geometry is locally optimised but not globally ordered. This is one of the deepest gaps.

### §5.3.2 — Kengo Kuma (atmosphere / gradients / temporal / material)

Kuma does not begin with rooms. He begins with light softness, filtering, material tactility, ambiguity of boundary, transitions between inside/outside, human bodily perception. The Kuma intelligence PRYZM still lacks:

- **Gradient conditions.** Today's engine is binary (public/private, room/corridor, inside/outside, window/no-window). Real architecture is **gradients** — semi-private, visually open but acoustically closed, compressed-then-expanded, filtered daylight, peripheral inhabitation, thickened edges, soft thresholds. Kuma's intelligence lives in *ambiguity, layered permeability, partial concealment.* Generated plans still feel "diagrammatic" because the engine produces hard semantic zoning.
- **Temporal perception.** Architects think in *movement through time* — what happens at second 1, 5, 20, 300. Entering after work; waking at 3 am; sunlight at 7 am; sound drift at night; guests arriving; moving groceries; sitting silently in winter rain. PRYZM barely models temporal occupation.
- **Material intelligence.** Today materials are *finish categories*. Architects treat them as *psychological instruments* — grain direction, acoustic softness, thermal perception, reflected light warmth, tactile edge conditions.

## §5.4 — What architects actually optimise (that algorithms usually don't)

These reframe the objective function. PRYZM today optimises legality + light + privacy + corridor-efficiency + adjacency. Architects also optimise:

- **Latent tension.** Slightly compressed entry before large living reveal; partial concealment of kitchen; asymmetry balanced by light; offset circulation for privacy. Pure optimisation tends to *erase* tension; tension creates emotional richness.
- **Memory.** Humans remember arrival, corner window, morning light, long sightline, threshold sequence — *not* adjacency-matrix correctness. PRYZM optimises what CAD can measure; architects optimise what humans remember.
- **Hierarchy.** Everything cannot be equally important. Great plans have a dominant space, servant spaces, supporting spaces, silent zones, active zones. PRYZM still distributes value too evenly.
- **Ambiguity.** Good architecture allows multiple readings, flexible use, interpretive openness. PRYZM currently over-specifies.

## §5.5 — Re-ordered phasing (supersedes §4.5.2)

The user's correction to the §4.5.2 phasing — recognising that **spatial hierarchy + visibility produce a larger perceived jump than windows do** — re-orders the strategic roadmap:

| New phase | Goal | Why this order |
|---|---|---|
| **Phase 1 — Spatial hierarchy + visibility** | Entry sightline scoring, reveal sequencing, privacy depth, visual termination, daylight climax scoring. | Largest perceived jump per unit of work. Bigger than windows. Closes Layer 4 (perceptual choreography). |
| **Phase 2 — Façade intelligence** | Per-edge orientation + noise + corner-bonus + daylight-depth + dual-aspect scoring. Living claims best façade; bathrooms avoid premium frontage. | Without this, room allocation remains naive. Closes Layer 3 (environmental intelligence). |
| **Phase 3 — Semantic edge typing** | Adjacencies become *typed*: social-flow, intimate-access, service-path, acoustic-buffer, ceremonial-transition. Different edge types get different geometric treatment. | Underrated but cheap. Closes a Layer 2 gap and unlocks Layer 4. |
| **Phase 4 — Structural inevitability** | Alignment fields, structural grids, wet-stack logic, opening rhythm coherence. | Creates "architectural authority" — what makes plans feel *inevitable*. Closes Layer 2 (geometric rationalisation). |
| **Phase 5 — Human movement simulation** | Agent-based occupancy: cooking, dining, entering, waking at night, carrying laundry, hosting. Penalise path conflicts / bottlenecks / awkward crossings. | The apartment stops being geometry and becomes *inhabitation*. Closes Layer 4 (perceptual choreography). |
| **Phase 6 — Typology priors** | Parisian / Nordic / Japanese / NYC-loft / Mediterranean. User-selectable; per-typology rule overrides. | Closes Layer 5 (cultural / typological intelligence). |
| **Phase 7 — Activity-centred furnishing** | TV alignment, conversational sofa grouping, dining circulation ergonomics, sofa-to-view logic. | Furniture solver moves from "fits the room" to "rooms work for the activities they host." Depends on Phase 5. |
| **Phase 8 — Multi-objective Pareto refactor** | Replace weighted-additive scoring with true Pareto frontier across daylight / privacy / circulation / efficiency / structure / furniture / façade / acoustic. | Weighted sums collapse trade-offs into mediocre compromises; Pareto preserves architecturally balanced candidates. |
| **Phase 9 — Compositional alignment + proportional elegance** | Pre- and post-subdivide tidy passes. Wet walls stack; corridor walls align; opening rhythms repeat. | Pre-requisite for emotional convincingness; benefits from earlier phases landing first. |
| **Phase 10 — Structural integration** | Column / load-bearing-line / wet-stack continuity / MEP routing. | Essential for multi-apartment; closes another Layer 1 → Layer 2 piece. |
| **Phase 11 — Core-first multi-apartment** | Refactor the `multi-apartment-floor-plate-brief` to core-first generation (site → core → public circ → grid → façade → apartment subdivision → internal layouts) BEFORE implementation. | Apartment-first will fail at multi-flat floor plates. Must invert order first. |
| **Phase 12 — Typed semantic graph edges** | Smaller refactor of `bubbleGraph.ts` to support Phase 3's typed edges throughout. | Cleanup; can interleave. |

**Total commitment.** ~25–35 weeks of focused work to close the strategic layers, vs ~4–6 weeks for the tactical Tier 1–3 items in §3. The two tracks interleave: ship visible Tier 1 items per round while strategic phases land in dedicated sprints.

## §5.6 — The most important transition

> Today PRYZM mostly answers: **"Can this apartment work?"**
> Architects answer: **"What should this apartment FEEL like to inhabit?"**

The gap between those two questions is the work remaining. It is not closed by another room type, another archetype, another adjacency weight. It is closed by building a **world-model of inhabitation** — exactly what Phases 1–7 above add.

## §5.7 — What NOT to do next (the biggest technical mistake)

> Do NOT continue solving this by adding local rules forever.

Beyond a point, more local constraints, more furniture rules, more adjacency weights will produce **brittle mediocrity**. Quality is increasingly an emergent *global* property. The §4.5 tactical phases must NOT crowd out the strategic phases above — they live alongside, not instead of.

## §5.8 — How this reframes the wishlist queues

The three remaining-work queues (`apartment-furnish-quality-wishlist`, `program-rules-improvements-queue`, `single-apartment-fix-pass-spec`) all live in **Layer 1**. They are necessary but not sufficient. The next leap is in Layers 3, 4, 5 — the §5.5 phasing. The next round of work should split commits across:

- **Tactical Tier 1A** (windows) — closes a visible Layer 1 gap.
- **Strategic Phase 1** (spatial hierarchy + visibility) — opens Layer 4.

Both can land in parallel because they touch different files. The strategic phases require fresh thinking; the tactical phases extend known patterns.

## §5.9 — The deeper framing: cognition stack + staged optimisation

§5 above identifies the 5 architectural-intelligence LAYERS and re-orders the phasing accordingly. The next abstraction up is the **7-Layer Cognition Stack** — engines (not just metrics) that together turn PRYZM from a layout generator into a **hierarchical spatial-cognition system**. That stack, the staged-optimisation principle (6 stages, no giant optimiser), the Spatial Intent Field, the AI-guides-engine rule, and a status-tracked implementation plan live in:

> **`APARTMENT-COGNITION-STACK-AND-IMPLEMENTATION-PLAN-2026-05-29.md`** — third companion doc, the architecturally-sound implementation roadmap with tracked status column. §5.5 phasing here is the *summary*; the cognition-stack doc is the *plan of record*.

Reading the cognition-stack doc is REQUIRED before starting any Phase 2+ work — it specifies the layer order and the staged-optimisation discipline that prevents the "one giant optimiser" mistake.

---

## §5 — Pointers

- **Pipeline help.** `pryzmShowApartmentHelp()` in the browser console lists every `pryzm…()` pipeline command.
- **Pure tests.** `pnpm --filter @pryzm/ai-host test` — 424/424 pass at HEAD.
- **Memory queues.** `apartment-furnish-quality-wishlist.md`, `program-rules-improvements-queue.md`, `single-apartment-fix-pass-spec.md`, `multi-apartment-floor-plate-brief.md`.
- **Canonical SPEC.** `docs/03_PRYZM3/reference/specs/SPEC-TGL-DETERMINISTIC-LAYOUT-ENGINE.md` (v1.0).
- **User guide.** `docs/guides/USER-GUIDE-APARTMENT-LAYOUT.md`.
