# «Jurisdiction» — Envelope Rules → Geometry

> **What this doc is.** The single place that records, for this jurisdiction, **every rule that
> shapes the buildable envelope** AND **how each rule materialises into geometry**. The rule pack
> is CODE; `SOURCES.md` is per-field provenance; this doc is the **bridge**: rule → citation →
> the geometric operation it drives → the envelope shape the user sees.
>
> **Why it exists.** A buildable envelope is not one number — it is the *intersection* of several
> legal limits, each of which changes the SHAPE differently: a height limit raises a ceiling, a
> setback insets the footprint, a FAR/edificabilitat caps the VOLUME, a depth/courtyard rule
> carves the interior. Presenting only some of them overstates what is buildable (see L-616). This
> doc forces every rule to be named, sourced, and mapped to its geometry — so nothing is silently
> dropped and nothing is silently fabricated (**C58 §1.4**).
>
> **One per jurisdiction.** Country-level rules → the country folder's `ENVELOPE-RULES.md`;
> municipality-specific rules → the municipality folder's. A city doc may say "inherits the
> national rule for X" and only record its overrides.

Governed by **C58** (§1.2 fidelity · §1.3 explain-why · §1.4 never a guess-as-fact · §1.6 per-field
provenance). Companion to `docs/04-reference/jurisdictions/ENVELOPE-REALISM-MATRIX.md` (which grades
whether the engine currently HONOURS these rules per jurisdiction).

---

## 0 · Status

| Field | Value |
|---|---|
| Governing instrument(s) | «PGOU / lokalplan / BZO / PLU + article refs» |
| Envelope model | «envelope-defined · coverage+depth · FAR-only · ring-only · refusal» |
| Engine branch that renders it | «`ZoningRulesEngine.ts` setback-inset · block-derived-alignment · tiered-occupation · explicit-area · refusal» |
| Realism verdict (see matrix) | «REALISTIC · OVERSTATES-A · OVERSTATES-B · REFUSES» |
| Gate flag | «`XX_CERTIFIED` — ON/OFF, why» |

## 1 · The envelope parameters (the rules)

Every parameter that constrains the envelope. Mark each: **structured** (queryable feed),
**PDF** (in the ordinance document only — human-gated sourcing), or **absent**.

| Parameter | Value / rule | Source | Structured? | Citation (article · doc · URL) |
|---|---|---|---|---|
| Max height (m) | | | | |
| Max storeys | | | | |
| Edificabilitat / FAR (m²/m²) | | | | |
| Ocupació / coverage / *área de implantación* (%) | | | | |
| Setbacks (front/side/rear, m) | | | | |
| Buildable depth / *profunditat edificable* (m) | | | | |
| Courtyard / patio / *friareal* (interior open-space rule) | | | | |
| Tiers / stepbacks | | | | |
| Permitted use | | | | |

## 2 · How the rules materialise into geometry (rule → operation)

The heart of the doc. For each rule above that is present, state the **geometric operation** it
drives and in what ORDER. This is what turns a table of numbers into the purple solid.

| Rule | Geometric operation | Order | Notes / engine hook |
|---|---|---|---|
| Max height | extrude to `maxHeight_m` (the legal ceiling / shell) | last | `CesiumViewport` shell |
| FAR / edificabilitat | cap the VOLUME: floorspace ≤ FAR × parcel area → `farLimitedHeight_m` (L-616) | with height | `ZoningRulesEngine` FAR cap |
| Setbacks | inset the parcel ring per edge | 1st | `insetPolygonPerEdge` |
| Depth / *profunditat* | clip the inset to a depth band measured from the **block/street frontage** | after inset | `block-derived-alignment` |
| Courtyard / patio / friareal | **carve the interior** — the band leaves the block centre open | with depth | (see depth band) |
| Coverage / ocupació | cap covered area ≤ coverage × parcel (binds volume, not shape) | with FAR | tiered-occupation cap |
| Tiers | stack prisms at stepback heights | last | `tiered-occupation` |

**The resulting shape, in one sentence:** «e.g. "a depth-band around the street frontage, inset by
the party-wall setbacks, extruded to the FAR-limited height inside the legal height shell, with the
block interior left as courtyard."»

## 3 · Sourcing status — what's real vs human-gated vs a gap

- **Structured (free, queryable now):** «…»
- **PDF-gated (human sourcing needed — the real cost):** «…» — same class as
  `barcelona-data-pipeline-map` (the GIS gives the spatial key; the per-zone numbers are the cost).
- **Absent / no source:** «…» — the honest refusal / upper-bound cases.

## 4 · Cross-references

- Rule pack: «`packages/site-parcel-data/src/rulepacks/xxx.ts`»
- Provenance: `SOURCES.md` · `VERIFICATION.md` (this folder)
- `ENVELOPE-REALISM-MATRIX.md` (does the engine honour this today?)
- Related audit items: «L-NNN»
