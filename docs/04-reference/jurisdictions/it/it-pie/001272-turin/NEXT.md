# NEXT — Turin (001272, IT-21 Piedmont)

> **Last updated:** 2026-07-23 · **Maintainer:** UNASSIGNED · **Status:** SCAFFOLD — research complete (with key assumption); no live probes run; no pack started

---

## 1 — WHERE WE STOPPED (the one-paragraph truth)

Research is complete at the mechanism-assumption level. Turin is the recommended first Italian city
based on: (a) Piedmont retaining the classic PRG instrument; (b) the assumption (unconfirmed) that
the current Torino PRG NTA uses DM 1444-style zone letters with per-zone numeric tables; (c) the
Piedmont PRG mosaic WFS plausibly covering Turin at current-date currency; (d) ARPA Piemonte's
Edifici 3D dataset providing region-wide building-height context data — unique among the three
Italian cities studied. No live probe has been run against any endpoint — not the Catasto WFS, not
the Piedmont mosaic WFS, not the ARPA Piemonte Edifici 3D service. Turin's PRG NTA primary text has
not been read. The entire Tier 1 classification rests on the DM 1444 zone-letter assumption; if
the NTA has been reformed, Turin becomes Tier 2 and the dev-day estimate rises from ~10–15 to
~20–25+. The NTA read is the single most valuable next step — a half-day that collapses the
largest uncertainty in the Italy plan.

---

## 2 — THE NUMBER (what % of clicks, which denominator, and why)

**Full-envelope resolution: 0% (not started).** Estimated ceiling if Tier 1 confirmed: ~12% today;
~30–40% after NTA read and zone transcription. Denominator: Turin parcels with a confirmed PRG zone
designation (from Piedmont mosaic WFS) and applicable NTA numeric rules cited. Both numerator and
denominator are unknown — the live probes and NTA read are prerequisites.

---

## 3 — BLOCKERS (ordered by dependency)

### B1 — Turin PRG NTA primary text not read (the single most important blocker)

- **What it is.** The entire Tier 1 classification for Turin rests on an unconfirmed assumption
  that the current Torino PRG NTA uses DM 1444-style zone letters with per-zone numeric tables for
  height, coverage, and density. If this assumption holds: ~10–15 dev-days, no new engine kind. If
  it does not: Turin becomes Tier 2, and the estimate and build plan must be rebuilt from scratch.
- **Why it blocks.** No build decision should be committed for Turin until this single binary
  question is answered by reading the source.
- **What would unblock it.** Locate and read the current consolidated Torino PRG NTA.
- **THE EXACT RESUME STEP.** Navigate to `comune.torino.it/urbanistica` → Piano Regolatore
  Generale → Norme Tecniche di Attuazione. Download the consolidated NTA PDF. Read:
  1. Art. 1–15 (typically: zone classification table — confirm zone letters and DM 1444 mapping)
  2. The first per-zone parameter article (confirm: height, coverage, indice di fabbricabilità `mc/mq`)
  3. The setback article (in the NTA or the RE — Regolamento Edilizio)
  Record: zone letters used; whether they map to DM 1444 A/B/C/D/E/F exactly or use subzone
  suffixes; the numeric table structure; whether the mechanism is zone-letter-keyed or has been
  reformed to something else.

### B2 — Piedmont PRG mosaic WFS probe (zone identification baseline)

- **What it is.** The Piedmont regional PRG mosaic WMS/WFS covers destinazioni d'uso, vincoli, and
  piani esecutivi for all Piedmont municipalities. Turin is the regional capital and provincial
  capital, likely among the more recently updated areas, but currency is unconfirmed.
- **Why it blocks.** Without knowing the WFS field schema and the date of the Turin layer, zone
  identification cannot be confirmed as API-queryable. If the mosaic is current for Turin, zone
  identification is an API call; if the layer is stale, a separate probe of Turin's own SIT is needed.
- **THE EXACT RESUME STEP.**
  ```bash
  # Step 1: GetCapabilities
  curl "https://www.geoportale.piemonte.it/geoserver/wfs\
  ?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities" \
    | grep -i 'prg\|urb\|zona\|destinaz\|piano' | head -20

  # Step 2: GetFeature — central Turin bbox (~45.0703, 7.6869 — Piazza Castello area)
  curl "https://www.geoportale.piemonte.it/geoserver/wfs\
  ?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature\
  &BBOX=7.681,45.067,7.694,45.077,EPSG:4326\
  &SRSNAME=EPSG:4326&COUNT=3&OUTPUTFORMAT=application/json" \
    | python3 -m json.tool | head -60

  # Step 3: inspect fields for zone letter (e.g. "zona", "destinazione", "classe")
  # and last_update / data_aggiornamento metadata field
  ```

### B3 — ARPA Piemonte Edifici 3D live probe (building-height baseline)

- **What it is.** ARPA Piemonte's Edifici 3D dataset (per-building volumetric footprints + mean
  elevation, region-wide) is confirmed to exist; the endpoint, field schema, and reliability of the
  height field for Turin's urban core specifically have not been live-probed.
- **Why it blocks.** Turin's key differentiator from Milan and Rome is this height dataset. Its
  value for the product depends on: (a) whether a WFS or BBOX-queryable service exists (vs.
  download-only bulk format); (b) whether the `mean_elevation` or height field is reliable for
  dense urban Turin parcels (the quality/derivation code may indicate lower confidence for
  city-centre buildings).
- **THE EXACT RESUME STEP.**
  ```bash
  # Step 1: search ARPA Piemonte open data for "Edifici 3D"
  curl "https://opendata.arpa.piemonte.it/api/3/action/package_search?q=edifici+3d" \
    | python3 -m json.tool | grep -E '"url|format|name|notes"' | head -30

  # Step 2: if WFS endpoint found:
  # GetFeature for Turin bbox — check field names and per-building quality code
  curl "<arpa-edifici3d-wfs-endpoint>\
  ?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature\
  &BBOX=7.681,45.067,7.694,45.077,EPSG:4326\
  &SRSNAME=EPSG:4326&COUNT=5&OUTPUTFORMAT=application/json" \
    | python3 -m json.tool | head -80
  ```

### B4 — Catasto WFS live probe (Turin parcel baseline)

See `../../NEXT.md §3 B1` for the exact resume step. Run this for a Turin bbox in the same session
as the Piedmont mosaic probe (B2) — both can be run in one 0.5-day session.

### B5 — Regolamento Edilizio (RE) setback rules not read

- **What it is.** Turin's Regolamento Edilizio governs setbacks. Whether the RE is part of the PRG
  NTA or a separate document, and what the setback multipliers and minimum absolute distances are,
  has not been read.
- **THE EXACT RESUME STEP.** After B1 (NTA read): if setback rules are in the NTA, record there.
  If the NTA references a separate RE, locate and read the RE setback article from
  `comune.torino.it` → Regolamento Edilizio.

---

## 4 — TRIP-WIRES (if you see X elsewhere, come back HERE and do Y)

- **4.1 — If NTA confirms DM 1444 zone letters** → Turin is Tier 1. Update `README.md §1` status
  from "ASSUMED" to "CONFIRMED"; update dev-day estimate to ~10–15; begin build plan. Port BauNVO
  zone-letter reader concept to DM 1444 mc/mq metric (same abstraction, different units).
- **4.2 — If NTA reveals a bespoke mechanism** → Turin becomes Tier 2. Update `README.md §1`,
  LEGISLATION-RATE.md, and all estimates. Re-scope as a new engine kind. Update the country-level `README.md §5`
  tier assignment.
- **4.3 — If the Piedmont PRG mosaic WFS is confirmed current for Turin** → zone identification is
  an API call. The mosaic endpoint + field schema should be shared with any other Piedmont city
  targeted in future.
- **4.4 — If ARPA Piemonte Edifici 3D is WFS-queryable** → document the exact endpoint and field
  names in `sources/SOURCES.md §A`. This asset is reusable for any Piedmont city — not just Turin.
  Update `../../../topics/buildings-lod-height.md` with confirmed endpoint.
- **4.5 — If other PRG-using regions (Umbria, Marche, Abruzzo, Molise) are targeted** → check
  whether their PRG mosaic and NTA structure are similar to Piedmont/Turin. If so, the Turin pack
  NTA-transcription approach and the DM 1444 zone-letter engine kind may be portable with config
  changes only.
- **4.6 — If Italy's building-height gap is a blocker for a non-Piedmont city** → ARPA Piemonte
  Edifici 3D is Piedmont-only; confirm explicitly before assuming it covers e.g. a Lombard or Lazio
  city. Check those regions' own geoportals separately.

---

## 5 — WHAT IS ALREADY BUILT (do not redo)

- Mechanism assumption and Tier 1 classification — `../../findings/ITALY-MASTER-DATA-SOURCE-STUDY.md §B.3`
- ARPA Piemonte Edifici 3D confirmed at research level — `../../../topics/buildings-lod-height.md`
- Piedmont PRG mosaic existence confirmed — `../../README.md §2.2`
- National Catasto WFS confirmed as parcel geometry source — `../../sources/SOURCES.md §A`
- National floor rules documented — `../../sources/SOURCES.md §A`

---

## 6 — VERIFIED SOURCES

| Source | Answers | Tier | Exact query / note |
|---|---|---|---|
| Catasto WFS `wfs.cartografia.agenziaentrate.gov.it` | Parcel geometry | VERIFIED-LEAD (research; not live-probed) | `cp:CadastralParcel` — see `../../sources/SOURCES.md` |
| Piedmont PRG mosaic WFS | Zone designation (destinazione d'uso) per parcel — Turin area | VERIFIED-LEAD (existence confirmed; endpoint and field schema TBD) | `www.geoportale.piemonte.it/geoserver/wfs` |
| Turin PRG NTA (`comune.torino.it/urbanistica`) | Zone classification + per-zone numeric parameters | VERIFIED-LEAD (portal confirmed; NTA not read) | Navigate → PRG → NTA consolidated |
| ARPA Piemonte Edifici 3D | Per-building mean elevation, region-wide (including Turin) | VERIFIED-LEAD (existence confirmed; endpoint TBD) | `opendata.arpa.piemonte.it` → search "Edifici 3D" |
| SITAP `sitap.beniculturali.it` | Landscape constraints (informational) | VERIFIED-LEAD (informational only) | Turin: Savoy royal buildings (UNESCO), historic city centre |
| Vincoli in Rete `vincoliinrete.beniculturali.it` | Listed buildings + archaeology | VERIFIED-LEAD | Turin: Savoy residences listed |
| DM 1444/1968 | Zone taxonomy ceiling + distance floor | `published` | `normattiva.it` → DM 1968/1444 |
| Codice Civile Art. 873 | Boundary setback floor (3 m) | `published` | `normattiva.it` → CC Art. 873 |

---

## 7 — DEAD ENDS (measured negatives — do NOT re-run hoping)

- **National Italian zoning WFS for Turin:** confirmed absent at national level (see country-level
  NEXT.md). Piedmont mosaic is the access point for Turin zone identification.
- **DM 1444 zone letters for Milan and Rome:** confirmed inapplicable for those cities — does NOT
  imply the same finding for Turin. The Tier 1 assumption for Turin must be confirmed independently.

---

## 8 — THE SMALLEST NEXT STEP that moves the number, and its cost

**Read Turin's PRG NTA primary text (B1). Estimated: 0.5 dev-days.**

This single half-day:
1. Confirms or disproves the Tier 1 assumption — the binary outcome that determines everything else.
2. If confirmed: sets the per-zone numeric table structure for direct NTA transcription.
3. If disproved: prevents any further investment in the wrong build direction.

Run simultaneously in the same session: Catasto WFS probe (B4) and Piedmont mosaic WFS probe (B2)
— both are curl commands taking < 5 minutes total. Together with the NTA read, this is a full
0.5–1 dev-day that converts three of the five blockers from assumptions to measurements.
