# USA — Vision Shift: From Dataset Aggregation to Institution Compilation

> **Stamp:** 2026-07-24 · **Status:** THEORETICAL FRAMEWORK — captures the research vision
> shift that emerged from cross-jurisdiction study (France → Germany → Norway → USA).  
> **Origin:** Research memos produced during USA jurisdiction analysis, 2026-07-24.  
> **Companion:** `USA-INSTITUTIONAL-GRAPH-ANALYSIS.md` (the empirical proof) · `../RATE.md` (metric)

---

## The Old Question vs the New Question

Every jurisdiction studied so far has been analysed with the same question:

> "What open datasets exist nationally that answer zoning questions?"

This is the **dataset-aggregation model**. It produces defensible, comparable headline rates.
But the US — precisely because it is structurally unlike every European jurisdiction studied —
reveals a fundamental limitation in the model.

For Europe:

```
National Government
    ↓
National Planning Portal
    ↓
Municipal Plans
```

The chain is hierarchical. Dataset aggregation is the right tool: find the national portal, measure
its structured-field coverage.

For the US, the institutional structure is not hierarchical:

```
              Federal

     /        |        \

States  Counties  MPOs  Tribes

      \      |      /

 Municipalities

       /     |      \

Utilities  FEMA  DOT  EPA

      \      |      /

         Parcel
```

This is a **distributed institutional graph**. No single national portal exists because no single
national authority exists. Dataset aggregation applied to this structure returns: "no national API,
therefore ~0% for zoning."

That answer is technically correct for the old question. It is the wrong question.

---

## The New Question

> **"What machine-readable institutional state already exists across the distributed graph
> of US public agencies, and what does the ceiling become once that graph is compiled into
> a common Planning Intermediate Representation?"**

This is the **institution compilation model**. It treats every public agency as a computational
node that computes one projection of the parcel's true state. Nobody has merged them. The task
is to build the compiler that merges them.

---

## The Three Key Insights

### Insight 1 — Every agency is a compiler

For any single parcel in Los Angeles, the following independent institutions each compute a
projection:

```
County Assessor         → parcel geometry, land use class, tax status
County Recorder         → ownership chain, encumbrances
City Planning           → zoning district, overlay designations
Building Department     → permit history, current use, code compliance
Public Works            → street frontage, sidewalk, sewer connection
FEMA                    → flood zone designation (SFHA / X / AE)
US Fish & Wildlife      → wetland classification (if applicable)
Army Corps              → Section 404 wetland boundary
EPA                     → Superfund proximity, air quality district
USGS                    → terrain elevation, LiDAR-derived height
FAA                     → airspace surface (if near airport)
School District         → attendance boundary (affects value)
Utility Companies       → capacity, easements
Historic Commission     → landmark / contributing structure designation
Air Quality District    → emissions zone, CEQA triggers
```

That is ~15–20 independent computational nodes per parcel. **Each node already publishes its
output as machine-readable data.** Nobody has assembled the full parcel state.

### Insight 2 — ArcGIS REST is the hidden national standard

People think US planning data is fragmented. Semantically: yes. Technically: far less than expected.

Thousands of US governments use **ArcGIS REST** as their GIS infrastructure. The consequence
is that `GET /arcgis/rest/services/.../FeatureServer/0?f=json` returns a machine-readable field
schema — field names, types, coded-value domains, relationships — for any layer, on any server,
from any of the thousands of ArcGIS deployments across US municipalities and counties.

This means the semantic problem (Chicago says `ZoningClass`, NYC says `ZoneDist1`) is separable
from the technical problem (how to query the data). The technical problem is solved by the ArcGIS
standard. The semantic problem is a classification task: map local field names to a universal
Planning Intermediate Representation (Planning IR).

Similarly for **Socrata** (Chicago, NYC, SF, Seattle, Boston, DC, LA), **CKAN** (data.gov + city
portals), and **OpenDataSoft** (additional city portals). Each is a standard API. One crawler per
platform × four platforms = access to hundreds of structured city datasets.

### Insight 3 — The problem is semantics, not data

Chicago says `ZoningClass`. NYC says `ZoneDist1`. Phoenix says `ZONE_CODE`.

Different names. Same concept. This is a solved problem in knowledge engineering:

```
Universal Planning Ontology
         ↓
HEIGHT / SETBACK / USE / LOT / FAR / DENSITY / COVERAGE / PARKING / FLOOD / NOISE
         ↑
Every city's field names map into ontology
```

Exactly as SQL maps Oracle, MySQL, and Postgres to a common query language. The ontology is the
SQL of planning. Once built from a seed of labelled examples (each ArcGIS schema already provides
coded-value domains that are self-describing), it can be continuously extended as new endpoints
are discovered.

---

## The Broader Vision: Land State Operating System (LSOS)

The deepest formulation emerging from this research line is not a planning assistant.
It is a **Land State Operating System (LSOS)** — a system whose responsibilities are:

1. **Maintain the current institutional state** of every parcel (assembled from all nodes).
2. **Replay history** to reconstruct any past state (every permit, rezoning, subdivision is an event).
3. **Simulate future state transitions** (what if this parcel is rezoned? subdivided? landmarked?).
4. **Compute legally reachable futures** — not yes/no approval, but the full future state space.
5. **Explain every transition** with authoritative legal provenance.
6. **Coordinate multiple institutional services** (planning, cadastre, environment, taxation, utilities).

Machine-readable planning — the subject of this jurisdiction framework — is then **one compiler**
feeding the LSOS.

### The parcel as a distributed object

Under the LSOS model, a parcel is not a row in a database. It is a **distributed object** whose
state is assembled from the outputs of 15–20 institutional nodes:

```
Parcel
  ↓
Ownership Service      → who holds rights
Planning Service       → what zone, what rules
Flood Service          → FEMA NFHL designation
Environmental Service  → wetlands, habitat, Superfund
Building Service       → existing structures, permits
Road Service           → access, frontage
Tax Service            → assessed value, class
Utility Service        → capacity, easements
```

Every service owns part of reality. The LSOS is the microservices coordinator that assembles
the full parcel state on demand.

### Government as event sourcing

Governments do not store state. They store events:

```
Subdivision → Permit → Inspection → Violation → Appeal → Rezoning → Flood Revision
```

Current parcel state = replay of all events.

This is **event sourcing**, a pattern that software engineers invented and described formally in
the 2000s. Governments have been doing it since the first land registry was created, without
calling it that.

The implication: once the institutional event stream is captured, the parcel state at any point
in time is computable, and future state transitions are simulatable.

### Rights as computable futures

Under the LSOS model, the planning question is not:

> "Can I build an apartment building here?"

It is:

> "What futures are legally reachable from this parcel's current institutional state?"

The engine returns not a yes/no but a **future state space** — all legally reachable configurations,
with the optimal legal trajectory to each:

```
Current State
     ↓
100 legal actions (permit, variance, rezoning, subdivision, ...)
     ↓
1,000 first-order states
     ↓
10,000 second-order states
     ↓
...
Optimal path to desired outcome
```

This is legal pathfinding, analogous to GPS navigation but operating on institutional state space
rather than geographic space.

---

## Why the US Is the Ideal Proving Ground

This sounds counterintuitive given the ~12% free-source rate. But the US has structural properties
that make it *the* right first proving ground for institution compilation:

1. **Decentralised = more nodes, not fewer.** Every county, municipality, special district, and
   federal agency is an independent computational node. More nodes = richer graph = higher
   information density once compiled.

2. **ArcGIS as de facto standard.** The technical heterogeneity problem is smaller than it appears.
   Thousands of nodes share the same API contract. The semantic problem is tractable.

3. **Strong open-data culture in major cities.** Chicago, NYC, LA, Austin, Seattle, Boston, DC,
   Portland, SF, Denver, Phoenix each publish hundreds of datasets. These are real APIs, not PDFs.

4. **Federal layer is uniquely strong.** FEMA NFHL, USGS 3DEP, Census TIGER, USFWS NWI, NPS NRHP,
   EPA Envirofacts, FAA OE/AAT — no European country has a comparable set of free, structured,
   national constraint layers.

5. **The market has already done part of the work.** NZA, Mercatus, Zoneomics, Regrid, Microsoft,
   and Overture have each independently solved a slice of the problem. Institution compilation
   combines these with the directly discoverable public layers into a unified graph.

The US is not a planning data desert. It is a planning data rainforest — extraordinarily rich but
unstructured. The institution compilation model is the tool that extracts the structure.

---

## Formalisation (for the research record)

The attached research memos (2026-07-24) articulate a mathematical formalisation of institutional
state. Simplified for this document:

Every parcel P at time t has an institutional state vector:

```
x_t = (geometry, rights, constraints, environment, improvements)
```

Every legal or administrative action is an operator:

```
x_{t+1} = T_i(x_t)
```

The planning problem is:

```
Find a path from x_today to x_desired
subject to: statutory constraints, procedural constraints, temporal constraints, institutional constraints
```

The civilisation-level formulation:

```
S(t) = Fix(C(t), E(t), P(t))
```

Where:
- `S(t)` = institutional state of society
- `C(t)` = active constraints (laws, contracts, rights, regulations)
- `E(t)` = event stream (permits, transactions, court decisions, disasters)
- `P(t)` = physical state of the world
- `Fix` = compute the state satisfying all constraints after incorporating new events

This is a mathematically meaningful research hypothesis that distinguishes government from a static
rule book: government is a distributed constraint solver continuously converging on an institutional
equilibrium, subject to new events and not always globally consistent (appeals, conflicts between
agencies, legal uncertainty are features, not bugs, of this model).

---

## What This Means for the Implementation Plan

The `RATE-IMPLEMENTATION-PLAN.md` currently describes a path from ~12% (free) to ~75–80% (commercial).
Under the institution compilation model, a new path exists:

**Path A (current) — Dataset aggregation + commercial APIs:**
```
~12% (free, dataset aggregation)
  → Phase 1–2: Footprints + city portals + Zoneomics → ~55%
  → Phase 3–5: Regrid + 3DEP + expansion → ~75–80%
```

**Path B (new) — Institution compilation:**
```
~12% (free, dataset aggregation)
  → Phase 6a: ArcGIS discovery crawl (5,000–8,000 municipal zoning endpoints) → ~40%
  → Phase 6b: Semantic normalisation (field-name ontology) → ~45%
  → Phase 6c: Federal overlay integration (FEMA, USFWS, EPA, FAA) → ~55%
  → Phase 6d: County assessor fabric (parcel geometry near-universal) → ~60–65%
  → Combined with commercial (Zoneomics + Regrid): → ~85–90%
```

Path B requires more engineering but reaches a higher ceiling and has no single-vendor dependency.
The two paths are complementary, not alternatives — Path A delivers the commercial triad quickly;
Path B builds the durable institutional graph that makes the ceiling defendable.

---

## What Must Not Be Overstated

This vision shift does not prove the US can reach Denmark's ~96%. The following gaps are structural
and do not close under institution compilation:

1. **~13,000 jurisdictions with no digital zoning data at all.** Small rural municipalities,
   recently incorporated places, and some county-unzoned territories simply do not publish
   any machine-readable planning data. Institution compilation discovers the absence; it
   cannot fill it.

2. **Numeric FAR/height absent from most ArcGIS zoning layers.** Discovery of a zone code
   (`R-1`) is not the same as discovering the numeric FAR and height limit for that zone.
   Most free zoning layers contain zone district boundaries and codes; the numeric rules live
   in ordinance text. Only Zoneomics (commercial) and the rare city-level structured table
   (NYC MapPLUTO being the outstanding example) provide the numerics as machine-readable fields.

3. **Semantic heterogeneity at the sub-zone level.** Even after field-name normalisation,
   zone code semantics differ: Chicago's `RT-4` allows different uses and densities than
   LA's `R4` despite similar-sounding codes. Without a per-jurisdiction zone taxonomy lookup,
   a cross-city density comparison is not meaningful.

4. **Government inconsistency is a feature, not a bug.** Agencies disagree. Court cases create
   temporary inconsistent states. Pending appeals mean the current zone is contested. A model
   that requires full global consistency will fail; the institution compilation model must be
   designed for **partial consistency and eventual resolution**, exactly as distributed databases
   are designed for eventual consistency.

---

*This document captures the vision shift that emerged from comparing the European jurisdiction
hierarchy with the US distributed institutional graph. It is a research framework, not a
specification. The empirical proof is in `USA-INSTITUTIONAL-GRAPH-ANALYSIS.md`. The metric
implications are in `RATE.md` §"Revised ceiling." The implementation path is in
`RATE-IMPLEMENTATION-PLAN.md` §"Phase 6."*

*Maintainer: UNASSIGNED · Date: 2026-07-24*
