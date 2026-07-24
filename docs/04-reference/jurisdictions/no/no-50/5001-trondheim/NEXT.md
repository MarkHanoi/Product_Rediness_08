# NEXT — Trondheim (5001, NO-50)

> **What this file is.** Where we stopped on Trondheim, exactly why, and precisely what to do
> to go further the moment it becomes possible.
> **Last updated:** 2026-07-24 · **Maintainer:** UNASSIGNED · **Status:** SCAFFOLD

---

## 1 — WHERE WE STOPPED (the one-paragraph truth)

Trondheim is the recommended first Norwegian city for one reason: its planregister is confirmed open (Geonorge kartkatalog, "no conditions apply to access and use," UUID `21c83653-b9c2-4931-bad0-a67e4c0f6be6`), which no other Norwegian city in this study can claim at the same level of certainty. What has NOT been done: the live WFS GetCapabilities URL has not been fetched from the kartkatalog distribution section, no GetFeature has been run against a real parcel, and no reguleringsbestemmelser document has been read for a specific Trondheim parcel. The central open question is whether the Trondheim WFS returns arealformål/hensynssone codes and/or a bestemmelser URL as structured attributes, or returns plan boundary + plan ID only (PDF-link-only situation, same negative as Hamburg). This single probe resolves the build path for all of Norway.

---

## 2 — THE NUMBER (what % of clicks, which denominator, and why)

**Zoning full-envelope resolution: 0% (not started).**

Denominator for structured-path: any Trondheim parcel covered by a detaljregulering with non-null arealformål + %-BYA or BRA + height attributes in the WFS response (or from the bestemmelser text reached via a URL returned in the WFS response). **This denominator is unknown until the live probe below runs.**

§ 29-4 fallback path: any Trondheim parcel NOT covered by a reguleringsplan. Fraction unknown; for rural/peri-urban Trondheim the fraction may be non-trivial.

---

## 3 — BLOCKERS

### B1 — Trondheim planregister WFS endpoint URL not fetched (primary gate)

- **What it is.** The Geonorge kartkatalog page for "Planregister Trondheim kommune" (UUID `21c83653-b9c2-4931-bad0-a67e4c0f6be6`) is confirmed. The live WFS GetCapabilities URL embedded in the distribution/access section of that page has not been retrieved.
- **Why it blocks.** Cannot run GetCapabilities or GetFeature without the endpoint URL.
- **What would unblock it.** Open the kartkatalog UUID page and copy the WFS endpoint URL from the "Distribusjoner" / "Tilgang og bruk" section.
- **THE EXACT RESUME STEP.**
  ```bash
  curl "https://kartkatalog.geonorge.no/api/getdata/21c83653-b9c2-4931-bad0-a67e4c0f6be6" \
    | python3 -m json.tool | grep -i "url\|wfs\|endpoint\|distribusjoner"
  ```
  Or: fetch the HTML page at `https://kartkatalog.geonorge.no/metadata/planregister-trondheim-kommune/21c83653-b9c2-4931-bad0-a67e4c0f6be6` and locate the WFS URL in the distribution table.

### B2 — WFS attribute schema not known (determines build path for all of Norway)

- **What it is.** Once the endpoint URL is known, a GetCapabilities + DescribeFeatureType + GetFeature probe must confirm: which attributes are returned — specifically whether arealformål code, hensynssone code, planstatus, and any bestemmelser URL or numeric value are present.
- **Why it blocks.** If arealformål is present as an attribute, Trondheim (and every other SOSI-Plan-compliant Norwegian kommune) can be ingested via an attribute pipeline. If the WFS returns geometry + plan ID only (same negative as Hamburg), all numeric values must come from a text/NLP pipeline against the bestemmelser document.
- **What would unblock it.**
  ```bash
  # Step 1: GetCapabilities — confirm layer names
  curl "<WFS_ENDPOINT>?SERVICE=WFS&REQUEST=GetCapabilities"

  # Step 2: DescribeFeatureType — confirm attribute names
  curl "<WFS_ENDPOINT>?SERVICE=WFS&REQUEST=DescribeFeatureType&TYPENAMES=<LAYER_NAME>"

  # Step 3: GetFeature — one real plan feature near Torvet, Trondheim (EPSG:25832)
  # Torvet (Trondheim city centre) approx WGS84: 10.3954, 63.4305
  curl "<WFS_ENDPOINT>?SERVICE=WFS&REQUEST=GetFeature&TYPENAMES=<LAYER>&BBOX=10.394,63.429,10.397,63.432,EPSG:4326&COUNT=2&SRSNAME=EPSG:4326"
  ```
  Record: field names present, any non-null arealformål/hensynssone/planstatus value, any bestemmelser URL.

### B3 — Bestemmelser text format not confirmed for a specific parcel

- **What it is.** One Trondheim reguleringsbestemmelser document (Brannkvartalet, 2004) is confirmed as parseable HTML/text. Newer plans may differ. No bestemmelser for a specific target parcel has been read.
- **Why it blocks.** Cannot build the NLP/transcription pipeline without knowing the source format (HTML, PDF text layer, scanned raster, or structured markup) for a representative sample.
- **What would unblock it.** After B2 probe: if a bestemmelser URL is returned in the WFS feature, fetch that URL and inspect the content type (HTML/text = best case; PDF = check for text layer; scanned raster = worst case, OCR required).
- **THE EXACT RESUME STEP.** Fetch the bestemmelser URL from the B2 probe response. `curl -I <bestemmelser_url>` to check content-type; then `curl <bestemmelser_url> | head -200` to inspect structure.

### B4 — FKB-Bygning licence not resolved

- **What it is.** FKB-Bygning (building footprint + top height) requires a Norge digitalt agreement or reseller purchase for non-public entities.
- **Why it blocks.** Cannot use FKB-Bygning building footprints without a licence step. NDH terrain is fully open.
- **THE EXACT RESUME STEP.** Confirm entity type → if commercial: contact Geodata or Norkart for commercial FKB-Bygning quote (`geodata.no` / `norkart.no`), or initiate a Kartverket Norge digitalt agreement at `kartverket.no`.

---

## 4 — TRIP-WIRES (if you see X elsewhere, come back HERE and do Y)

- **4.1 — If the SOSI Plan WFS reader is built for Trondheim** → the same reader, parameterised by endpoint URL, serves every Norwegian kommune that publishes a compliant planregister WFS. Do NOT build a Trondheim-specific reader; build a generic SOSI Plan planregister reader.
- **4.2 — If B2 probe returns geometry + plan ID only (no arealformål attribute)** → Norway has the same "digital infrastructure without structured attributes" problem as Germany. Pivot to bestemmelser-text NLP pipeline (B3); update `../../RATE.md` to note this finding.
- **4.3 — If B2 probe returns arealformål + hensynssone attributes** → raise the "plan existence + arealformål" field rate in `../../RATE.md` from ~45–60% to ~75–80% for Trondheim; start planning the attribute-ingestion pipeline.
- **4.4 — If any bestemmelser document is found with a consistent structured heading pattern** (e.g. all plans use `§3 Utnyttingsgrad: %-BYA = XX`) → Norway's NLP extraction rate could be materially higher than Germany's, because the format is nationally standardised. Record the pattern and assess generalisability.
- **4.5 — If Geonorge publishes a completed `BestemmelseUtnyttingsgrad` object-catalog entry** (currently a stub) → re-probe Trondheim WFS to check whether the numeric utilisation field is now populated. This could eliminate the NLP pipeline requirement.

---

## 5 — WHAT IS ALREADY BUILT (do not redo)

- National legal structure characterisation — `../../findings/NORWAY-MASTER-DATA-SOURCE-STUDY.md`
- National SOSI Plan code tables (arealformål, hensynssone, planstatus) — `../../README.md §1.3` — static lookup, do not re-derive
- National RATE.md with field-by-field breakdown — `../../RATE.md`
- Matrikkelen Eiendomskart Teig WFS confirmed open — `../../sources/SOURCES.md §A`
- NDH terrain confirmed open — `../../sources/SOURCES.md §A`
- Trondheim planregister access terms confirmed — `../../sources/SOURCES.md §A`
- § 29-4 national default (gesimshøyde 8 m / mønehøyde 9 m; setback max(½H, 4 m)) confirmed — `../../sources/SOURCES.md §A`

---

## 6 — VERIFIED SOURCES (endpoint · what it answers · confidence tier · the exact query)

| Source | Answers | Tier | Exact query / note |
|---|---|---|---|
| Geonorge kartkatalog — Trondheim planregister | Access terms, contact, update cadence, UUID | `published` — CONFIRMED | `https://kartkatalog.geonorge.no/metadata/planregister-trondheim-kommune/21c83653-b9c2-4931-bad0-a67e4c0f6be6` |
| Trondheim planregister WFS endpoint | Layer names, attribute schema, plan boundary + attributes per parcel | VERIFIED-LEAD — endpoint URL not yet fetched | From kartkatalog UUID page distribution section — see B1 |
| pbl. § 29-4 + Rundskriv H-8/15 | § 29-4 fallback height / setback defaults | `published` | `lovdata.no` pbl. §29-4; `regjeringen.no` Rundskriv H-8/15 |
| Matrikkelen Eiendomskart Teig WFS | Parcel boundary geometry | `published` — CONFIRMED LIVE | `https://wfs.geonorge.no/skwms1/wfs.matrikkelen-eiendomskart-teig` |
| NDH / høydedata.no | National terrain model (DTM/DSM), free | `published` — CONFIRMED LIVE | `https://hoydedata.no` |

---

## 7 — DEAD ENDS (measured negatives — do NOT re-run hoping)

- **`BestemmelseUtnyttingsgrad` as a populated structured WFS attribute (national spec):** confirmed as an unfinished stub at the national object-catalog level (2026-07-24). Do not assume this attribute is populated in the Trondheim WFS before running the B2 probe — probe first.
- **Single national planregister WFS for Norway:** does not exist; per-kommune endpoints only. Do not search for one.

---

## 8 — THE SMALLEST NEXT STEP that moves the number, and its cost

**Fetch the Trondheim planregister WFS endpoint URL from the Geonorge kartkatalog page. Estimated: 15 minutes.**

```bash
curl "https://kartkatalog.geonorge.no/api/getdata/21c83653-b9c2-4931-bad0-a67e4c0f6be6" \
  | python3 -m json.tool | grep -E -i "url|wfs|endpoint|wms|distribusjoner|accessUrl|distributionUrl"
```

Then immediately run B2 GetCapabilities + DescribeFeatureType + GetFeature (Torvet bbox, see B2).

**What each outcome implies:**
- WFS returns arealformål + planstatus attributes (non-null) → structured ingestion path viable; start Trondheim pack; this reader serves all of Norway
- WFS returns geometry + plan ID only → text/NLP pipeline for bestemmelser required; estimate ~15–20 dev-days for NLP pipeline before any Norwegian pack ships
- WFS URL not found in API response → check HTML page or contact `kart.postmottak@trondheim.kommune.no` directly for WFS endpoint
