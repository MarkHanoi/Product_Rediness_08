# Córdoba — digitization roadmap, 2026-08-05 (founder-directed strategic direction)

> Captures the founder's prioritized response to
> [`RASTER-PARCEL-ZONING-FEASIBILITY-2026-08-05.md`](./RASTER-PARCEL-ZONING-FEASIBILITY-2026-08-05.md)
> and [`RASTER-CLASSIFIER-SAFE-SUBSET-IMPLEMENTATION-2026-08-05.md`](./RASTER-CLASSIFIER-SAFE-SUBSET-IMPLEMENTATION-2026-08-05.md).
> **Status: strategic direction agreed, not yet built** (except Priority 1, partially actioned —
> see below). This is the roadmap for what comes after those two studies, not a description of
> completed work.

## Why this roadmap exists

Today's raster-classification work proved something specific and durable: **geometry/
georeferencing is a solved problem here (90%+ boundary coincidence, automatable registration);
zone-identity classification from colour or OCR is not** — the subzone digit that actually
determines the buildable number is not recoverable from the published raster by any method tested.
That reframes the whole problem. The priorities below follow from that reframe, not from "try
harder at classification."

## Priority 1 — Get the original vector data (highest ROI)

**Status: letter strengthened with today's evidence, not yet submitted.**
[`GMU-TRANSPARENCY-REQUEST-DRAFT-2026-08-04.md`](../GMU-TRANSPARENCY-REQUEST-DRAFT-2026-08-04.md)'s
Item 4 now states the technical argument precisely: georeferencing/datum/parcel-alignment are
proven feasible; the subzone digit specifically is not recoverable from the raster; therefore the
limiting factor is **data access, not PRYZM's own capability**. That's a materially stronger,
harder-to-deprioritise ask than the original "if you happen to have vector data" phrasing.
Requested formats, broadened per the founder's list: MicroStation `.dgn`, AutoCAD `.dwg`, Esri
Shapefile, File Geodatabase, PostGIS export, or "any internal GIS used to publish the PGOU."

**Submitting requires the requester's own Cl@ve/Certificado Digital — this is a human action, not
an engineering one.** One successful response here could obsolete most of Priorities 2–4 below.

## Priority 2 — Build a Derived Planning Layer (the real product asset)

Reframe manual tracing from a workaround into an official, versioned product asset:

```
Official raster
      ↓
Georeference (proven feasible today, ED50/EPSG:23030, automatable via coaco:hojas_cus)
      ↓
Trace polygon
      ↓
Human reads the subzone digit (the one step that stays human — proven not automatable this
      ↓                          session, not for lack of trying)
Derived Planning Layer  ← a first-class, versioned, queryable asset
      ↓
Every parcel inside it resolves automatically, forever
```

This is the same *shape* as the existing `resolveCordobaTracedZone.ts`/`cordobaTracedZones.json`
pattern (one record, `PAS-2`, already proven this way) — the change is treating it as the target
architecture rather than a stopgap, and building the tooling (Priority 3) to make adding records
to it fast rather than a one-off manual QGIS exercise each time.

**Not started.** The existing traced-zone mechanism is the seed of this; scaling it is real,
bounded, incremental work — each new traced record is independently reviewable and low-risk,
unlike the rejected bulk-automated classification.

## Priority 3 — Build the digitization tooling

Don't make whoever does the tracing work directly in QGIS. A purpose-built internal tool would:
show the georeferenced raster crop, propose a detected polygon boundary, let a human confirm/adjust
it and type the subzone code they read off the label, and commit straight to the Derived Planning
Layer (Priority 2) — one click per parcel/block, not a multi-tool manual GIS workflow.

**Not started — this is a real internal tool (UI + workflow), not a script.** Worth scoping as its
own dedicated feature once Priority 1's response is known (a successful data request could make
this entirely unnecessary) and once Priority 2's target schema is settled.

## Priority 4 — Separate "planning data creation" from "envelope generation"

Today these are entangled: the same pass that would identify a zone is expected to also produce a
number. They should be two different pipelines with two different QA models:

```
Planning Layer Team  →  creates/maintains the Derived Planning Layer (Priority 2), once
                              ↓
                    Envelope Engine (existing, already proven — Sevilla/Córdoba/Málaga rule packs)
                              ↓
                         runs forever, ordinary GIS lookups
```

Once a parcel has a zone code (from Priority 2, however sourced — COACo, human trace, or a future
Priority-1 data grant), computing its envelope is already solved: the existing rule-pack machinery
(`esCordobaPGOU2001.ts` et al.) just needs a zone code as input, exactly as it already does for the
pilot. **This priority is really a statement about how future work should be organized, not a
separate engineering task** — it falls out naturally once Priority 2 exists as a real layer instead
of an ad-hoc lookup.

## Priority 5 — the geometry/occupancy solver (MC footprint, etc.) — explicitly POSTPONED

Deliberately last, and likely correctly skippable for a long time: **geometry rules only matter
once the zone is known.** There is no value in perfecting an MC setback/occupation solver for land
whose zone identity itself is unresolved. This matches, independently, what today's Sevilla
engine-work pass concluded when it declined the SB/M/ST-C/CH solver for the same reason (its own
inputs were still legally/data unresolved) — two separate passes on two separate cities converged
on the same sequencing logic without being told to.

## The permanent provenance model — adopt everywhere derived data is produced

Replace any notion of an invented probability score with a record of **how the information was
actually obtained**:

```json
{
  "zone": "MC-2",
  "source": "CUS18W",
  "method": "manual_digitization",
  "verified_by": "founder",
  "verification_date": "2026-08-05",
  "official": false,
  "confidence": "verified_manual_transcription"
}
```

Notice what's deliberately absent: no `0.81`-style invented float. Every field is either a fact
(source sheet, method, date, who verified it) or a plain-language provenance TIER (`derived`,
`official`, `verified_manual_transcription`, `pipeline-extracted-unverified`, etc.) — never a
synthetic number nobody can trace back to a real measurement. This is the same discipline the
existing rule packs already apply to confidence tiers elsewhere in this repo; the change is
applying it explicitly to every future planning-layer record, not just rule-pack provenance.

## The long-term positioning this implies

Not "PRYZM automatically reads planning maps" — today's studies show that specific claim doesn't
hold up under real measurement, in Córdoba or Málaga. The durable claim: **PRYZM converts a
municipality's legacy planning documents into a permanent, auditable, machine-readable planning
database** — georeferencing and geometry solved by software, zone identity captured once by a
human and then reused forever, every record's provenance real and traceable. That's a narrower,
more honest, and more defensible claim than "full automation," and it's the one today's evidence
actually supports.
