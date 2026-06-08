# Generative Layout — World-Model Living-Graph Strategy

**Stamp:** 2026-06-08 · **Status:** STRATEGY (review/analyse/document — *before* implementing)
**Thesis:** PRYZM's residential layout generator should not be a room-packer. It should be a
**world-model living graph** — a persistent, typed, queryable, bidirectionally-editable semantic
graph that ingests the *site & climate* as context, represents the *program → zones → rooms →
adjacencies → openings → furniture* as nodes/edges, **projects geometry as a view of the graph**,
scores candidates with *graph metrics* (adjacency, path, acoustic, daylight, ventilation), and over
time **learns typology priors**. This document reviews the founder's Room Layout Engine **SPEC v3.0**,
benchmarks how the leading engines (Forma/Spacemaker, Hypar, Finch, TestFit, Delve, the academic
floorplan lines) architect generative logic, and maps a phased path from what PRYZM has today to that
world model.

> **Governance:** STRATEGY sits above contracts only as *vision*; the binding rules remain the
> C-contracts + the SPECs. This doc feeds: [SPEC-LAYOUT-ALGORITHM-MASTER](../03-execution/specs/SPEC-LAYOUT-ALGORITHM-MASTER.md)
> (the orchestration ruler), [SPEC-TGL-DETERMINISTIC-LAYOUT-ENGINE](../03-execution/specs/SPEC-TGL-DETERMINISTIC-LAYOUT-ENGINE.md)
> (the engine), the v3.0 spec (normative target), and [building-graph strategy](PRYZM-BUILDING-GRAPH-AND-RELATIONAL-AI-FOUNDATION.md).
> **Web-research caveat:** the competitive section below is written from engineering knowledge
> (training cutoff Jan 2026); web verification was unavailable in this session — treat the per-engine
> specifics as *to-verify* before quoting externally.

---

## 1. Why "world-model living graph" (the strategic frame)

A *world model* is an internal, structured representation an agent reasons over before acting. For
generative layout that means: the engine doesn't reason about *pixels or rectangles* — it reasons
about a **graph of typed spatial relationships** and only *renders* geometry from it. Three
consequences that decide the architecture:

1. **The graph is the product; geometry is a projection.** (PRYZM's D-TGL already states this —
   SPEC-TGL §0.) Editing the graph (change a room's area, swap an adjacency) regenerates geometry —
   the BIM-2→BIM-3 "editable living graph" (A.26 / C52). A pixel/rectangle engine can't do this.
2. **Quality is graph-measurable.** Adjacency, walking-path, privacy depth, acoustic source↔receiver,
   daylight, cross-ventilation are all *graph/topology metrics* — not geometry afterthoughts. The
   scoring axes ARE graph queries.
3. **Context is graph context.** Site, climate, sun, wind, noise, outdoor areas (v3.0 §1) enter as
   *typed context nodes/fields* the layout graph is solved against — not as post-hoc analysis.

This is exactly the substrate PRYZM has been building toward across three strategic axes already in
the contracts: **WHAT-KINDS** (P0 family platform), **WHAT-EDITABLE** (C52 building graph / BIM-3),
and **WHERE-IT-LIVES** (C19 site / C21 climate / PG0 geospatial). The layout generator is where they
converge.

---

## 2. Competitive landscape — how the leaders architect generative layout

*(Knowledge-based; verify before external use.)* For each: **method · graph role · optimisation ·
environment · scale · determinism · the one idea to borrow.**

### 2.1 Autodesk Forma (formerly Spacemaker)
- **Method:** cloud generative *site/massing* design + fast environmental analysis. Massing
  variants via parametric rules + multi-objective search.
- **Graph:** weak at the room level — Forma is massing/urban scale, not interior rooms.
- **Optimisation:** multi-objective (daylight, sun hours, noise, wind, views, area) with **ML
  surrogate models** standing in for slow physics solvers so feedback is near-real-time.
- **Environment:** its crown jewel — real microclimate (sun, daylight, wind comfort, noise) as
  *first-class drivers*, accelerated by ML surrogates trained on CFD/radiation runs.
- **Scale:** site/building massing; **not** interior room layout.
- **Determinism:** analysis is reproducible; generation is search-based (not byte-identical).
- **Borrow:** **environment as a first-class generative driver, made fast via surrogates** — climate
  shouldn't be a post-hoc report; it should *shape* the plan (v3.0 §§1,6,12,14 want exactly this).

### 2.2 Hypar
- **Method:** "**functions as a service**" — composable, containerised generative *functions*; each
  takes typed inputs → emits BIM **Elements** (open-source .NET geometry/BIM lib). A workflow is a
  **graph of functions** wired together (grids → cores → space plans → …).
- **Graph:** a *function/dataflow* graph (not a room-adjacency graph), plus spatial grids.
- **Optimisation:** mostly *deterministic composition* + user-driven options; not a heavy optimiser.
- **Environment:** via plug-in analysis functions, not native.
- **Scale:** strong at *space planning* (offices, grids, cores) and parametric BIM.
- **Determinism:** deterministic functions → reproducible.
- **Borrow:** **the composable-function pipeline + a shared typed Elements model** — PRYZM's
  command-bus + C11 creation pipeline is the analogue; the lesson is *every layout stage is a pure,
  composable, individually-testable function over a shared typed model* (which the MASTER §1 spine
  already frames).

### 2.3 Finch (Finch3D)
- **Method:** **graph-based real-time** parametric generation — "the building configures itself."
  A relationship/rule graph propagates constraints live as you draw the envelope.
- **Graph:** a genuine **relationship graph** is the core engine (closest in spirit to PRYZM's UBG).
- **Optimisation:** real-time constraint propagation + metrics (area, efficiency); some ML.
- **Environment:** lighter; efficiency/area focus.
- **Scale:** building interior + massing, residential/office.
- **Determinism:** graph rules → reproducible.
- **Borrow:** **the graph IS the engine, updated in real time** — validates PRYZM's
  "graph-is-the-product" bet; the differentiator is making it *live + editable* (C52) and
  *semantic* (typed rooms/adjacencies), which Finch only partly does.

### 2.4 TestFit
- **Method:** **deterministic real-time configurators** for specific typologies (multifamily,
  parking, industrial) — hand-built solvers that pack units/parking with instant feasibility/financials.
- **Graph:** typology-specific solvers, not a general semantic graph.
- **Optimisation:** deterministic packing + financial objective; near-instant.
- **Environment:** minimal.
- **Scale:** building, typology-specialised.
- **Determinism:** fully deterministic, real-time.
- **Borrow:** **per-typology deterministic solvers that are instant and feasibility-first** — exactly
  PRYZM's typology-pipeline (C50) + D-TGL philosophy. Lesson: *specialise inside the typology pack,
  keep the spine general.*

### 2.5 Sidewalk Labs Delve (defunct, well-documented)
- **Method:** multi-objective generative *urban* design over "design priorities."
- **Graph:** scenario/objective model.
- **Optimisation:** **Pareto front across many priorities** (daylight, cost, open space, …) — the
  user explores the trade-off frontier.
- **Borrow:** **make the Pareto trade-off frontier a first-class, user-explorable output** — PRYZM
  already Pareto-ranks; the lesson is to *surface* the frontier (the option modal + living graph).

### 2.6 Academic — two lines PRYZM must know
- **ML/graph-constrained generation:** **House-GAN / House-GAN++** (graph-constrained GAN: input a
  bubble/adjacency graph → output a floorplan), **Graph2Plan** (retrieval + graph → plan),
  **RPLAN** (the 80k-plan dataset that makes ML possible), **Tell2Design** (text→layout). *Proves*:
  a room-adjacency graph is the natural conditioning signal and ML can produce plausible plans.
  *Limitation*: non-deterministic, dataset-biased, weak on hard constraints/codes, hard to edit.
- **Deterministic geometry/graph-dual:** **rectangular dual / Rodrigues–Shekhawat** graph-to-floorplan
  (an adjacency graph → a rectangular dual where each edge = a shared wall), **squarified treemaps**.
  *Proves*: you can go graph→exact rectilinear plan with provable adjacencies, no ML. *Limitation*:
  needs a graph with a valid rectangular dual; less "creative." **This is exactly D-TGL's lineage.**

### 2.7 Climate/GIS data sources (v3.0 §1)
- **Köppen–Geiger** (climate zone from lat/lon → the glazing/shading/ventilation regime), **PVGIS /
  NREL NSRDB** (irradiance/GHI, sun hours), **ERA5 / WMO** (wind), **OSM/Overpass** (streets, noise
  proxies, context — PRYZM already uses this). *Lesson:* these are *lookups/fields* that parameterise
  scoring; resolve once at SiteContext init, cache, degrade to a preset offline (v3.0 §1.3).

---

## 3. Synthesis — where the field is heading & the "right" architecture

Across all of them the convergence is clear:

1. **A typed relational graph is the core representation** (Finch, House-GAN, the rectangular-dual
   line, Hypar's Elements). Geometry is downstream.
2. **Multi-objective, Pareto-aware ranking** (Delve, Forma) — not a single score; surface the frontier.
3. **Environment as a first-class driver, made fast** (Forma's ML surrogates) — climate/sun/wind/noise
   *shape* the plan, with surrogates/lookups for speed.
4. **Deterministic, feasibility-first solvers per typology** (TestFit, Hypar) for trust + real-time;
   ML as a *prior/suggester*, not the constraint-keeper.
5. **Composable, individually-testable stages over one shared model** (Hypar functions).

**The consensus right architecture = a deterministic semantic-graph solver, multi-objective/Pareto,
environment-aware via lookups+surrogates, composable per stage, with ML as an optional prior — and
the graph kept live & editable.** PRYZM's D-TGL + UBG + C52 is *already this shape*; the gap is
breadth (climate/acoustic/ventilation/furniture-fit as graph axes) and the live/learning layer.

**Five capabilities PRYZM must have to be "the best world-model living graph for residential layout":**
1. **One persistent semantic graph** spanning site→building→storey→room→opening→furniture (UBG over
   the existing SemanticGraph/TopologyLayer/RoomGraph — C52/ADR-0061).
2. **Site/climate as typed context** the graph is solved against (C19 SiteContext + C21 climate +
   Köppen/PVGIS/ERA5 lookups) — v3.0 §1.
3. **Every quality dimension as a graph metric/Pareto axis** (adjacency, walking-path, privacy depth,
   acoustic source↔receiver, daylight/orientation, cross-ventilation, furniture-fit) — v3.0 §§5,6,12,13,14,16.
4. **Deterministic + editable + explainable** (no RNG, byte-identical, edit-graph→regen, §DIAG
   provenance) — the trust moat ML-only tools lack.
5. **Typology priors that learn** (the cognition-stack's Typology Priors layer) — ML as a *suggester*
   that proposes graphs/weights, the deterministic solver guarantees legality.

---

## 4. Audit of SPEC v3.0 against PRYZM today

v3.0's 20 sections map onto the MASTER §1 pipeline. Status: **HAVE** (live), **PARTIAL**, **GAP**.

| v3.0 § | Capability | PRYZM status | Note |
|---|---|---|---|
| §1 GIS/Climate `SiteContext` | climate-aware init | **GAP→PARTIAL** | C19 site + NOAA sun + Overpass exist; no Köppen/`SiteContext` contract, not fed to layout (G13/G14) |
| §2 Perimeter classification | shell typing | **PARTIAL** | decomposeToRects handles rect/rotated; no explicit L/T/U/courtyard classifier |
| §3 Program resolution | brief→rooms | **HAVE** | `allocateProgramToStoreys` + `enrichStoreyProgramToPlate` + `programRules` |
| §4 Zone partitioning | privacy gradient | **PARTIAL** | corridor carve + public/private bands; zoning not a hard gate (no ZONE_VIOLATION) |
| §5 Bubble graph + adjacency | weighted graph | **HAVE** | `buildBubbleGraph` + `adjacencyPreference`; **GAP**: outdoor-area nodes, negative penalties |
| §6 Acoustic zoning | source↔receiver | **PARTIAL** | `acousticRole` + soft `validateAcousticZoning`; **GAP**: not a hard gate, no external shielding (G15) |
| §7 Spatial allocation | rect-dual + squarify | **PARTIAL** | squarify + carve; not a true REL/Schnyder rectangular dual; **GAP**: constructive frontage swap |
| §8 Circulation spine | every-room-access | **HAVE** | §EVERY-ROOM-ACCESS + §CIRCULATION-REROUTE |
| §9 Multi-storey + stair | storey bands, stair | **PARTIAL** | storey loop + stair core; **GAP**: vertical wet-stack/structural align (G16), L/U stair overrun (G8), landing-not-hall (G14) |
| §10 Entrance placement | reserve-first | **PARTIAL** | `resolveEntranceDoor` + gap-aware (G4 fixed v68); **GAP**: not reserved *before* windows globally; climate lobby |
| §11 Internal doors | matrix + order | **HAVE** | door passes + matrix + caps + widths + live-clamp |
| §12 Windows (climate) | mandates + WWR | **PARTIAL** | per-room emission + mandates; **GAP**: climate WWR (G17), cross-vent (G18), every-habitable-window not yet hard |
| §13 Proximity/walking-dist | hops+metres | **GAP** | only soft adjacency; no walking-distance metric (D-PROX, G6) |
| §14 Solar & wind | per-room orient | **PARTIAL** | `solarOrientationScore` (daytime rooms); **GAP**: bedrooms unscored, wind/cold-shielding (G20) |
| §15 Aspect/min-dim | usable geometry | **PARTIAL** | min-area + min-short-side; **GAP**: explicit max-aspect re-attempt |
| §16 Furniture-fit | livability proof | **PARTIAL** | D-FLE furnishes rooms; **GAP**: not used as a *validity gate* pre-rank |
| §17 Multi-variant rank | Pareto | **HAVE (different)** | 8 deterministic strategies + Pareto over ~21 axes (vs v3.0's 24 sampled) — see §5 tension |
| §18 Severity taxonomy | FATAL/VIOL/WARN | **PARTIAL** | hard gates + soft scores exist; not formalised as 3 tiers |
| §19 Acceptance criteria | pass/fail | **PARTIAL** | several gates; not a single acceptance suite |
| §20 Gaps G1–G20 | roadmap | **tracked** | G1 wall-merge fixed v70; G12 fixed v69; others open |

**Key tension to resolve (architecture decision):** v3.0 §17 says "generate **24 variants by sampling**
degrees of freedom." PRYZM is **deterministic** (8 fixed strategies, no sampling — ADR-0061). These
aren't incompatible: keep the **deterministic enumeration** (the trust/repro moat) but *broaden the
degrees of freedom* (zone-cut ratio, corridor orientation, open-plan, master position) as **additional
fixed strategy axes**, not random samples. v3.0's "24" becomes a deterministic 4-axis product — same
intent, keeps byte-identity. **Recommendation: adopt v3.0's DOF list as deterministic strategy
dimensions; reject the "sampling" framing.**

**Other audit findings:** v3.0's area minima differ slightly from `programRules`/the 248-constraint DB
(e.g. master 13 vs DB-020 12) — reconcile against [SPEC-LAYOUT-CONSTRAINT-DATABASE]; v3.0's negative
adjacency weights (bedroom↔kitchen −2) need an engine that supports penalties (current
`preferenceBetween` is [0,1]); v3.0's hard ACOUSTIC_INFEASIBLE/ZONE_VIOLATION gates would *reduce*
yield on small/odd plots — stage them as WARN→VIOLATION→FATAL with the §DIAG provenance.

---

## 5. The PRYZM world-model living-graph architecture (target)

A single typed graph, solved deterministically, scored by graph metrics, projected to geometry,
editable, learnable:

```
        ┌── CONTEXT (typed fields/nodes) ──────────────────────────┐
        │ Site(C19) · Climate(C21,Köppen) · Sun(PVGIS) · Wind(ERA5)│
        │ Noise(OSM) · OutdoorAreas · Street · Parcel              │
        └───────────────┬──────────────────────────────────────────┘
                        │ parameterises scoring + hard gates
   Brief ─► PROGRAM ─► ZONES ─► BUBBLE GRAPH ─► RECT-DUAL/CARVE ─► ROOMS
   (typed)  (nodes)   (privacy   (weighted     (geometry projection (typed
                       bands)     adjacency,     of the graph)        nodes)
                                  +penalties)         │                │
                                                      ▼                ▼
                                            OPENINGS (doors/windows) FURNITURE
                                                      │                │
                        ┌─────────────────────────────┴────────────────┘
                        ▼  GRAPH-METRIC SCORING (Pareto over ~21+ axes)
        adjacency · walking-path · privacy-depth · acoustic(src↔rcv) ·
        solar-orient · cross-vent · frontage · furniture-fit · circulation
                        │
                        ▼  EDITABLE (C52): edit any node → re-project geometry
                        ▼  LEARNABLE (cognition-stack): typology priors suggest graphs/weights
                        ▼  EXPLAINABLE: §DIAG provenance per decision
```

**This is mostly assembly of existing PRYZM parts**, not green-field: SemanticGraph + TopologyLayer +
RoomGraphService + DependencyResolver (the graphs) → unify as the **UBG**; D-TGL (the deterministic
solver) → broaden axes; C19/C21 (context) → add `SiteContext`+Köppen and *feed it to scoring*; C52 +
A.26 (editable) → already live; cognition-stack (learning) → the long horizon.

---

## 6. Phased roadmap (review/document → then implement)

Strictly ordered so each phase has real rooms to reason over before the next:

- **P0 — Structural correctness (IN PROGRESS).** G1 wall-merge (§CONSENSUS-ON-CENTRELINE, v70) ·
  G12 drops (v69) · G14 upper-floor landing · G8 stair · G9 naming. *Nothing downstream matters until
  the engine's good plans survive the editor.* — **verify v70/v71 live first.**
- **P1 — Window/daylight completeness (v3.0 §12).** Constructive frontage swap so every habitable room
  reaches the shell + gets a window; per-room window why-zero already logged (§DIAG-WIN).
- **P2 — The graph-metric scoring layer (v3.0 §§13,14,6).** Walking-distance proximity (D-PROX),
  bedroom solar orientation, acoustic source↔receiver as *real Pareto axes* (mostly already soft —
  promote + add the missing ones). Deterministic, gated-when-absent.
- **P3 — SiteContext + climate (v3.0 §§1,12,14).** `SiteContext` contract (extend C19), Köppen lookup,
  climate WWR + cross-ventilation, wind/cold-shielding — context *feeding* scoring.
- **P4 — Validation taxonomy + acceptance (v3.0 §§18,19).** Formalise FATAL/VIOLATION/WARNING + the
  acceptance suite as a single gate with §DIAG provenance.
- **P5 — Furniture-fit as a validity gate (v3.0 §16).** Use D-FLE pre-rank, not just post-furnish.
- **P6 — The world-model layer.** UBG unification (C52), editable-graph round-trip, typology priors
  (cognition-stack) — ML as suggester, deterministic solver as guarantor.

**Decisions to ratify before P2+:** (a) deterministic DOF-expansion vs sampling (recommend
deterministic — §4); (b) penalty-capable adjacency weights (extend `preferenceBetween` to signed);
(c) how hard to make acoustic/zone/ventilation gates on small plots (stage WARN→FATAL).

---

## 7. What to do next (this session)
1. Verify v70/v71 deploy live; confirm the keystone fix makes rooms distinct (P0).
2. Reconcile v3.0 minima against `programRules` + the 248-constraint DB; record deltas.
3. Open the `SiteContext` contract draft (extend C19) — the entry point for the whole world model.
4. Promote the existing soft solar/acoustic axes + add D-PROX (P2) — these are near-free given the
   engine already has the hooks.
