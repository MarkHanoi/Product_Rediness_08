# NEXT — Antwerp (`ant-antwerp`, Flanders)

> **Last updated:** 2026-07-24 · **Maintainer:** UNASSIGNED · **Status:** SCAFFOLD

## 1 — WHERE WE STOPPED

Research is complete. The Flanders instrument cascade (gewestplan → RUP → goede ruimtelijke ordening)
is characterised, the "clichering" (Art. 7.4.2/2) nullification trap is understood, and the "vrij"
height pattern is identified as a frequent and legitimate legal outcome. The primary blocker is that
direct automated access to the Flanders DSI/GRB WFS is robots-disallowed, and the `mercator.vlaanderen.be`
alternative has not been probed. No GetFeature call has been run for any Antwerp parcel.

## 2 — THE NUMBER

**0% of clicks return a full, cited envelope (not started).** Research estimate for Flanders: ~0–5%.

## 3 — BLOCKERS

### 3.1 — Flanders DSI/GRB WFS access (robots.txt)
- **What it is.** `geoservices.informatievlaanderen.be` disallows automated access via robots.txt. All Flanders zoning and GRB building data is gated on resolving this.
- **What would unblock it.** Probe `www.mercator.vlaanderen.be` (confirmed as a separate public WFS for Flanders data; no robots restriction known).
- **THE EXACT RESUME STEP.**
  ```bash
  curl "https://www.mercator.vlaanderen.be/raadpleegdienstenmercatorpubliek/wfs\
  ?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities" | grep -i "lu:\|RUP\|gewestplan\|grondvlak"
  ```

### 3.2 — Gewestplan vs RUP classification for Antwerp (prerequisite for all numeric sourcing)
- **What it is.** For any Antwerp parcel, the pipeline must determine whether a RUP supersedes the gewestplan. This is a spatial query, not a lookup.
- **THE EXACT RESUME STEP.** Once DSI WFS is accessible: query `lu:lu_si_gv` for a known Antwerp parcel centroid; record whether a RUP deelgebied covers it and whether a voorschriften PDF URL is present.

### 3.3 — RUP voorschriften text read
- **What it is.** Even when a RUP is confirmed, whether it states a numeric height or leaves it "vrij" is only known by reading the voorschriften PDF.
- **THE EXACT RESUME STEP.** From the GetFeature response: extract the voorschriften PDF URL from the `lu:lu_si_gv` feature; download and read for "maximale bouwhoogte," "bouwlagen," "GVR," or "vrij."

### 3.4 — Art. 7.4.2/2 adoption-date check
- **What it is.** Any numeric provision from a post-2009 RUP must be checked for percentage-based nullification.
- **THE EXACT RESUME STEP.** From the RUP GetFeature: confirm adoption date (`vaststellingsdatum` or similar); if post-1 September 2009 and provision is percentage-based, flag as void.

## 4 — TRIP-WIRES

- **4.1 — If `mercator.vlaanderen.be` WFS is confirmed accessible** → run GetFeature for a known Antwerp parcel immediately. This unblocks all Flanders pack work.
- **4.2 — If any Flemish RUP voorschriften PDF is found to have a machine-readable text layer** → assess whether PDF text extraction (OCR or digital) can replace manual reading at scale, analogous to Barcelona's OCR pipeline.
- **4.3 — If Flanders' `lu_hov_*` layer is confirmed queryable** → use it to flag Art. 7.4.2/2-voided provisions automatically without per-RUP date check.

## 5 — WHAT IS ALREADY BUILT (do not redo)
- Flanders instrument cascade documented — `README.md §1`
- Flanders heritage WFS VERIFIED LIVE — `geo.onroerenderfgoed.be/geoserver/wfs`
- Art. 7.4.2/2 "clichering" legal basis confirmed from VCRO primary text

## 6 — VERIFIED SOURCES

| Source | Answers | Tier | Exact query / note |
|---|---|---|---|
| `geo.onroerenderfgoed.be/geoserver/wfs` | Flanders heritage — monuments, townscapes, archaeological sites | `VERIFIED-LIVE` 2026-07-24 | `?request=GetCapabilities` → HTTP 200 |
| VCRO Art. 7.4.2/2 | "Clichering" — post-2009 percentage-based RUP provisions void | `published` | `codex.vlaanderen.be` |
| `geoservices.informatievlaanderen.be` DSI/GRB (cached) | Flanders gewestplan + RUP zoning; GRB buildings; `lu_hov_*` nullification tracking | `corroborated` — robots-blocked origin | `mercator.vlaanderen.be` alternative unconfirmed |

## 7 — DEAD ENDS
- **Direct automated access to `geoservices.informatievlaanderen.be`:** confirmed robots-disallowed. Use `mercator.vlaanderen.be` alternative instead.

## 8 — THE SMALLEST NEXT STEP

**Probe `mercator.vlaanderen.be` WFS. Estimated: 0.5 dev-days.**

```bash
curl "https://www.mercator.vlaanderen.be/raadpleegdienstenmercatorpubliek/wfs\
?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities" | head -200
```

If the capabilities response lists DSI/RUP layers (`lu:` namespace), immediately run GetFeature
for a known Antwerp parcel (e.g. near Antwerp Central Station, approx. 4.4214°E, 51.2172°N).
