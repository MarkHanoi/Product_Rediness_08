# Turin (`001272`) — Jurisdiction Pack

**Country:** `it` · **Region:** Piedmont (Piemonte) · **ISO 3166-2:** `IT-21` · **ISTAT:** `001272` ·
**Pack id:** `it-001272-turin` ·
**Governing instrument:** PRG (Piano Regolatore Generale) — Piedmont uses the classic 1942-law instrument. Likely DM 1444 zone letters with numeric tables — **unconfirmed; primary-text read required**. ·
**Last updated:** 2026-07-23 · **Maintainer:** UNASSIGNED · **Status:** SCAFFOLD — research complete (with key assumption); no pack implemented

---

## 1 — What governs here

- **Governing-instrument chain (assumed, unconfirmed):** `parcel → PRG zone letter (A/B/C/D/E/F per DM 1444) → per-zone NTA article → numeric parameters`.
- **Rule KIND (ADR-0270 / C58 §2.2):** **Probably** `coverage-and-far` keyed to DM 1444 zone letters — but this is the **critical unconfirmed assumption**. If Turin's current PRG NTA still uses conventional DM 1444-style zone letters with per-zone numeric tables (height, coverage, density/`mc/mq`), Turin becomes a zone-letter config case (~10–15 dev-days). If the NTA has been reformed toward a Milan- or Rome-style bespoke mechanism, Turin becomes Tier 2 (~20–25+ dev-days, new engine kind). **Do not build until the NTA primary text is read.**
- **Setback-governed vs alignment-governed:** governed by PRG NTA per zone type — specific multipliers not yet read. Codice Civile Art. 873 (3 m) and DM 1444 Art. 9 (10 m between facing buildings) provide the national floor.
- **Legal-structure trap watch (P1):** the Tier 1 classification for Turin rests entirely on an **unconfirmed assumption** that the PRG NTA uses DM 1444-style zone letters. If this assumption is false, every dev-day estimate derived from it is also false. Confirm the NTA mechanism before any build work begins.

### Why Turin is the recommended first Italian city

| Factor | Turin | Milan | Rome |
|---|---|---|---|
| Governing instrument | PRG (classic, Piedmont) | PGT (Lombardy-specific) | PRG 2008 (tessuto typology) |
| Zoning mechanism | Likely DM 1444 zone letters (unconfirmed) | Territorial index + perequation (confirmed) | Tessuto typology + direct/indirect split (confirmed) |
| New engine kind needed? | Probably NO — if NTA confirmed | YES | YES |
| Building-height GIS | ✅ **ARPA Piemonte Edifici 3D** (region-wide, confirmed) | ❌ Unconfirmed | ❌ Unconfirmed |
| Regional PRG mosaic WFS | ✅ Piedmont mosaic WMS/WFS (currency caveat, but Turin as provincial capital = better coverage) | — | — |
| Dev-days estimate | **~10–15 (contingent on NTA)** | ~20–25 | ~25–30 |

**Sequencing rationale:** Turin is the cheapest first Italian city if the PRG NTA assumption holds
— the same lesson as Hamburg for Germany and Lyon for France. Building Turin before Milan or Rome
allows the national parcel baseline (Catasto WFS), the SITAP/Vincoli in Rete heritage overlay
pipeline, and the national floor rules to be established before tackling the more complex cities.
If the NTA assumption proves wrong (Turin turns out to have been reformed), the research
investment is still useful for other PRG-using regions (Umbria, Marche, Abruzzo, Molise).

### Piedmont PRG mosaic

Piedmont publishes a regional PRG mosaic WMS covering:
- `destinazioni d'uso` (land-use designations)
- `vincoli` (constraints and overlays)
- `piani esecutivi` (executive plans)

**Currency caveat:** the mosaic is explicitly of uneven currency across the region — more recently
updated for metropolitan areas and provincial capitals. Turin, as the Piedmont regional capital and
its largest city, is likely among the better-covered areas, but "plausibly better" is not
"confirmed current." Currency must be verified by a direct probe before using the mosaic layer.

### ARPA Piemonte Edifici 3D — Turin's key differentiator

ARPA Piemonte's Edifici 3D dataset provides:
- Per-building volumetric footprints with mean elevation for the entire Piedmont region
- Derived from BDTRE (Piedmont regional topographic database) + terrain sources (PST/MASE or regional altimetric data)
- Per-building data-quality/derivation code
- Licensed regionally under CC-style terms (exact terms TBD on live probe)

If this dataset's height field is reliable for Turin's urban core specifically, Turin would be the
closest Italian analogue to Lyon Métropole's "structured height attribute already on the map" case
in the France study — the key differentiator from Milan and Rome, which have no confirmed building-
height GIS layer.

---

## 2 — Pack status

| Dimension | Status | Gate condition |
|---|---|---|
| **PRG NTA primary-text read** | NOT STARTED — **critical prerequisite for ALL build work** | Read Torino PRG NTA; confirm DM 1444 zone-letter mechanism + numeric table structure |
| **Piedmont PRG mosaic WFS probe** | NOT STARTED | Live probe of Piedmont geoportal WFS for Turin bbox; confirm zone-letter field and data currency |
| **ARPA Piemonte Edifici 3D probe** | NOT STARTED | Live probe of `opendata.arpa.piemonte.it`; confirm endpoint, field schema, height-field reliability for Turin |
| **Catasto WFS probe (Turin bbox)** | NOT STARTED | Live probe — see `../../NEXT.md §3 B1` |
| **Rule pack — PRG zone-letter mechanism** | NOT STARTED — blocked on NTA confirmation | NTA confirmed; zone-letter mechanism confirmed; per-zone numeric table read |
| **Overlay: SITAP / Vincoli in Rete** | NOT STARTED | Heritage layer probe (shared with Milan/Rome once pipeline is built) |

Refusal vocabulary in use: `mechanism-unconfirmed` (NTA not yet read) · `coverage-gap` · `NOT FOUND`.

---

## 3 — Granularity (C58 §1.11)

**(Assumed, pending NTA confirmation):**
- **PRG zone-letter mechanism:** if DM 1444 zone letters apply, granularity is at the **PRG zone designation** level — the same as Hamburg's B-Plan zone or Lyon's PLU-H zone. Parameters are zone-keyed, not parcel-specific.
- **Per-parcel density:** the `indice di fabbricabilità` (fondiario, `mc/mq`) in PRG-using cities is typically a zone-level lookup, not a per-parcel attribute, unless the NTA explicitly defines parcel-specific subzones.
- If the NTA uses a different mechanism, granularity will be re-stated after the primary-text read.

---

## 4 — The number

**0% of clicks return a full, cited envelope (not started).** Denominator: Turin parcels with a confirmed PRG zone designation (from Piedmont mosaic WFS) and applicable NTA numeric rules (from primary text). Both numerator and denominator are unknown — the NTA read and the WFS probe must precede any measurement.

---

## 5 — Key data assets unique to Turin

### ARPA Piemonte Edifici 3D (building height)

This dataset is the single most important data asset differentiating Turin from Milan and Rome.
If it is:
- WFS-queryable per parcel/bbox: Turin context height is an API call — directly equivalent to
  Lyon's `pluhauteur` layer
- Download-only (bulk GeoPackage/Shapefile): a local tile index or pre-ingested height attribute
  lookup is required — more complex but achievable

Either way, Turin is the only Italian city studied where building-height context data is confirmed
to exist at region-wide scale from a publicly accessible source.

### Piedmont PRG mosaic WFS/WMS (zone identification)

The currency caveat means the mosaic cannot be used without verification, but Turin's position as
the provincial capital is the strongest available prior for current-date coverage within the Piedmont
mosaic. A single live probe confirms whether it is usable.

---

## 6 — Open questions / unverified

> Research notes that cannot yet be cited go HERE — never in `SOURCES.md`.

- **⚠ PRIMARY ASSUMPTION UNCONFIRMED:** Turin's current PRG NTA uses DM 1444-style zone letters
  with numeric tables for height, coverage, and density. This must be confirmed by reading the NTA
  primary text before any build decision. The PRG NTA was not sourced in the Italy master study pass.
- **Piedmont PRG mosaic currency for Turin:** the mosaic metadata explicitly flags uneven currency;
  Turin's layer update date relative to the current consolidated PRG must be confirmed before use.
- **ARPA Piemonte Edifici 3D height reliability for Turin urban core:** the dataset is confirmed
  to exist region-wide; whether the `mean_elevation` field is reliable for dense urban Turin parcels
  (vs. more easily classified suburban buildings) needs to be confirmed by probing Turin-bbox features
  and checking the per-building quality/derivation code.
- **Specific PRG zone letters used by Turin:** even if the mechanism is confirmed as DM 1444-style,
  the actual zone letters used in Turin's current PRG may not map 1:1 to A/B/C/D/E/F — some Italian
  cities using the PRG add sub-zone suffixes (e.g. `B1`, `B2`, `C3`) or local names. The NTA read
  will clarify the exact zone vocabulary.
- **PRG adoption date and amendment status:** Turin's current PRG was adopted under a certain
  variant/revision. Whether the NTA text on the Comune di Torino portal is the current consolidated
  version with all amendments must be confirmed before citing any article.
- **Regolamento Edilizio (RE) field for Piedmont:** the building-code layer that governs setbacks
  in PRG-using Piedmont cities is the Regolamento Edilizio. Whether Turin uses a single RE or
  has a separate RE per zone type, and what the setback multipliers and minimums are, must be read
  from the primary text.

---

**Related files:** `../../README.md` (country umbrella) · `../../findings/ITALY-MASTER-DATA-SOURCE-STUDY.md §B.3` (full Turin analysis) · `../../topics/buildings-lod-height.md` (ARPA Piemonte Edifici 3D) · `sources/SOURCES.md` · `NEXT.md` · `RATE.md`
