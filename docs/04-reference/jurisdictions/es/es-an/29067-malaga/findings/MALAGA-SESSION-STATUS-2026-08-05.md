# Málaga — session status, 2026-08-05

> `MALAGA_ENVELOPE_VERIFIED = false` — NOT LIVE, by design. No visible behavior change from any
> of today's work; this is real engineering/research progress on a gate that stays shut.

## What exists today

**38 zone codes transcribed** from the real Documento C (Normas urbanísticas y ordenanzas, FEB-2018
consolidation — the locally-saved corpus turned out to be Documento A, the descriptive Memoria,
not the binding text; the real one was fetched live). **9 real footprints** (`UAS-1..5`, `UAD-1/2`,
`CTP-1/2`), **29 structural refusals**, all cited. See
[`MALAGA-ENGINE-PROGRESS-2026-08-05.md`](./MALAGA-ENGINE-PROGRESS-2026-08-05.md).

**No resolver exists** — every live zone-identity lead (Geoportal, Open Data, CKAN, ArcGIS REST)
came back negative: real datasets exist, none carry a zone-code field. Correctly not built, since
a resolver against an unreachable service could only return transport errors.

## Documento B — the zoning maps, found and checked this session

Never investigated before this session. `P.2.1` ("Calificación", the real zoning plan, 35 sheets)
is CAD-derived with zone codes as extractable text per the original scan — but no coordinate grid.
`P.2.9` ("Alineaciones, Alturas y Rasantes", 114 sheets) is fully vector and self-georeferencing
(real UTM tick labels as text), and independently carries normative per-street heights. See
[`MALAGA-ENGINE-PROGRESS-2026-08-05.md`](./MALAGA-ENGINE-PROGRESS-2026-08-05.md) §9.

## Raster-to-parcel classification feasibility — REJECTED

[`RASTER-PARCEL-ZONING-FEASIBILITY-2026-08-05.md`](./RASTER-PARCEL-ZONING-FEASIBILITY-2026-08-05.md)
mirrors Córdoba's methodology. Geometry side worked well and is reusable regardless of the
rejection:

- **Datum pinned empirically: P.2.9 is ED50/EPSG:23030**, not ETRS89 — the same ~234 m trap
  Córdoba's CUS series already set. Reading it as ETRS89 needs a (−112, −206) m correction;
  ED50 puts the correlation peak at exactly (0,0).
- **Gridless registration works**: `P.2.1` sheet 24 (no printed coordinate grid) registered to
  ≤1 m accuracy with **zero manual control points**, by correlating its ink against two
  independent templates (real Catastro parcels + `P.2.9`'s vector base). Reusable recipe for any
  future ungridded sheet, any city.
- **Boundary coincidence is strong**: 89.6% of real ordinance-boundary length falls within 1 m of
  a real Catastro parcel edge (6.72× chance rate) — stronger than any Córdoba sheet measured.
- **Partial ground truth was found and used honestly**: `P.2.9`'s own filled ordinance polygons
  (an independent drawing, different scale) let real accuracy be measured for `MC`/`OA-2`: 98.7%
  parcel accuracy, but — same pattern as Córdoba — 4 of 5 errors land at full confidence.

**Why REJECT anyway, and not "insufficient ground truth"**: the decisive argument needs no ground
truth at all. **Only 3 of the 38 zone codes are colour-unique on the legend** (`MC`, `H`, `CO`) —
and **all three already structurally refuse** in the shipped pack. The one thing this pipeline can
validate well is therefore a better-sourced *refusal*, not a new number. Every one of the 9
real-footprint zones shares an ambiguous family-level legend swatch spanning a wide parameter
range (`UAS-1…5` share one fill across FAR 0.20–0.60 — a 3× span the colour cannot resolve). This
holds true even with a perfect answer key, which is why the study didn't need to (and structurally
couldn't) hedge toward "not enough data to say."

**Also refutes an earlier optimistic claim from this same session** (the Documento B
investigation's §9.3/§9.11, that subzone codes extract as OCR-free vector text): measured directly
that the embedded images are drawn *after* the text layer (so any underlying text is invisible in
the actual rendering), with no recoverable registration, and where hidden text does exist it
agrees with the visible printed colour only 10% of the time. The digit needs real OCR — untested
for Málaga, and Córdoba's own OCR attempt this session failed on an analogous problem.

## The real next step, if this is worth pursuing further

**Administrative, not engineering: request the actual MicroStation `.dgn` CAD masters** the
published PDFs were exported from. That's the one plausible path to real subzone-level vector
data, versus more raster-classification engineering against a structural ceiling that measurement
already closed.
