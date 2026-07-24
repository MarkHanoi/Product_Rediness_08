# Switzerland (`ch`) — human verification sign-off

**Verifier:** UNASSIGNED · **Date:** — · **Pack version / commit:** —

---

## Status

**NO VALUES VERIFIED BY A HUMAN AGAINST A PRIMARY SOURCE YET.**

The context-data layer is confirmed from official swisstopo/BFS product documentation (product pages,
Objektkatalog, opendata.swiss dataset pages). No live HTTP probe has been run. No legal/zoning
value (zone code, Ausnützungsziffer, height rule) has been read from any ÖREB/RDPPF endpoint or
cantonal planning document for any specific Swiss parcel.

Per playbook §3.4 and L-449: a pack may NOT ship `confidence: 'structured'` without this file
completed. All Switzerland pack values must remain `null` / `refused` until a human verifier has
completed the table below for each field.

---

## What was checked, against which document version

| Field | Verified against (doc + version/date) | Method | Verdict |
|---|---|---|---|
| swissBUILDINGS3D 2.0 — LOD2, coverage, accuracy, formats, licence | swisstopo product page (read 2026-07-24) | Document read | ⚠ Research-confirmed; NOT live-probed |
| swissBUILDINGS3D 3.0 Beta — canton list, EGID attribute, biannual cadence | opendata.swiss dataset page (read 2026-07-24) | Document read | ⚠ Research-confirmed; NOT live-probed |
| swissTLM3D — roads, water, parks/trees coverage, accuracy, attributes, licence | Objektkatalog swissTLM3D v1.7–2.4 (read 2026-07-24) | Document read | ⚠ Research-confirmed; NOT live-probed |
| GWR — Stufe A attributes, update cadence, API access | BFS GWR product documentation (read 2026-07-24) | Document read | ⚠ Research-confirmed; NOT live-probed; Merkmalskatalog PDF not read field-by-field |
| swissSURFACE3D / swissALTI3D — specs, coverage, licence | swisstopo product documentation (read 2026-07-24) | Document read | ⚠ Research-confirmed; NOT live-probed |
| ÖREB/RDPPF — any canton zone/FAR/height field | — | — | ❌ NOT CHECKED — zero ÖREB queries run |
| Heritage overlay — any canton | — | — | ❌ NOT CHECKED |
| Any specific Swiss parcel — building-rule envelope | — | — | ❌ NOT CHECKED |

---

## What I could NOT confirm (and why it stays unshippable)

- **All ÖREB/RDPPF legal fields** — no probe run; whether structured fields exist vs. PDF URL is unknown.
- **GWR Merkmalskatalog full field schema** — PDF at `housing-stat.ch/files/881-2200.pdf` not read
  field-by-field; cannot confirm exact Stufe A field names and domain values.
- **swissBUILDINGS3D CityGML version** — no sample tile downloaded; CityGML 2.0 vs. 3.0 unconfirmed.
- **Any live HTTP endpoint status** — no endpoint has been directly fetched; all product specs are
  from documentation, not live GetCapabilities or API responses.
- **Heritage overlay** — no cantonal Denkmalschutz WMS/WFS probed.

---

## Caveats that must remain visible in the product

- **3.0 Beta canton list is dated 2026-07-24 and is biannually updated.** Re-check before any
  region-by-region build plan. Do not treat the list as static.
- **GWR tree data / individual trees from swissTLM3D** — Zürich explicitly rates its own Baumkataster
  as authoritative over swissTLM3D tree data. Present swissTLM3D tree data as a national fallback,
  not as a primary tree inventory, unless a city's own cadastre is absent or not open.
- **EGID in 2.0 geometry** — EGID is NOT in the 2.0 model file; it must be joined from GWR via
  coordinate match. This is a join step, not a direct attribute read.

---

**Sign-off:** NOT YET SIGNED OFF. This file must be completed by a named verifier before any
Switzerland pack field may ship `confidence: 'structured'`. All pack values remain `null` / refused
until sign-off. — UNASSIGNED, date TBD.
