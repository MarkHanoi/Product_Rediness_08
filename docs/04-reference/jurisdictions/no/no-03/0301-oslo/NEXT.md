# NEXT — Oslo (0301, NO-03)

> **What this file is.** Where we stopped on Oslo, exactly why, and precisely what to do
> to go further the moment it becomes possible.
> **Last updated:** 2026-07-24 · **Maintainer:** UNASSIGNED · **Status:** SCAFFOLD

---

## 1 — WHERE WE STOPPED (the one-paragraph truth)

Oslo has the richest single-city tooling of the three studied: a per-parcel "Grad av utnytting" faktaark that resolves historical calculation-method era, nightly-updated plan layers via Planinnsyn, and confirmed open access to the interactive viewer and base plan lookup. The wall is that all of this is confirmed only as a click-in-map viewer (`od2.pbe.oslo.kommune.no/kart/`) — a standalone machine-readable WFS serving the same reguleringsplan geometry + bestemmelser text for programmatic per-parcel queries has not been located. This is the single most important confirmation needed before any Oslo engineering estimate can be made. If a WFS exists, Oslo may be the cheapest Norwegian city to integrate (the faktaark already resolves the historical-method problem for you). If only the viewer exists, budget a scraping/automation layer against the click-viewer instead.

---

## 2 — THE NUMBER (what % of clicks, which denominator, and why)

**Zoning full-envelope resolution: 0% (not started).**

Denominator: any Oslo parcel covered by a reguleringsplan or kommuneplan bestemmelse with %-BYA/BRA and height readable from a structured source (WFS attribute or bestemmelser text). **This denominator is unknown** until the WFS status is resolved and the regime classifier runs.

The Oslo faktaark path, if automatable, would give per-parcel historical-method identification — a materially higher structured-access rate than any other studied city.

---

## 3 — BLOCKERS

### B1 — Oslo planregister WFS status not confirmed (primary gate)

- **What it is.** Oslo's Planinnsyn is confirmed as an interactive click-viewer (nightly-updated, covers all plan layers). Whether a machine-readable WFS serving the same data exists for programmatic use is not confirmed.
- **Why it blocks.** The entire Oslo integration approach depends on whether a WFS exists. WFS = API pipeline. No WFS = scraping layer.
- **What would unblock it.** Two parallel checks:
  1. Search Oslo's open-data catalogue: `data.oslo.kommune.no` (CKAN) for a "planregister" or "reguleringsplan" dataset with a WFS distribution.
  2. Search Geonorge kartkatalog: `https://kartkatalog.geonorge.no/?text=planregister+oslo+kommune`
- **THE EXACT RESUME STEP.**
  ```bash
  # Check Geonorge kartkatalog for an Oslo planregister entry
  curl "https://kartkatalog.geonorge.no/api/search?text=planregister+oslo+kommune&limit=5" \
    | python3 -m json.tool | grep -i "uuid\|title\|url"

  # Check Oslo open-data catalogue
  curl "https://data.oslo.kommune.no/api/3/action/package_search?q=planregister&rows=5" \
    | python3 -m json.tool | grep -i "name\|url\|wfs"
  ```
  Record: WFS endpoint URL if found, or confirmed-absent if neither source yields a result.

### B2 — Oslo faktaark automation feasibility not confirmed

- **What it is.** The "Grad av utnytting" faktaark (`od2.pbe.oslo.kommune.no/pages/faktaark/Grad%20av%20utnytting.html`) is confirmed as a published page. Whether it is a per-parcel dynamic page (queried by gnr/bnr) or a static explanatory page is not confirmed.
- **Why it blocks.** If it is a per-parcel API (even a page rendered with URL parameters), it could be automated to resolve the historical-method era + sometimes a grad av utnytting value per parcel — which would be the highest-leverage Oslo-specific capability.
- **THE EXACT RESUME STEP.** Inspect the faktaark URL: try loading `https://od2.pbe.oslo.kommune.no/pages/faktaark/Grad%20av%20utnytting.html?gnr=215&bnr=128` (or a similar gnr/bnr parameter) and observe whether the output changes per parcel.

### B3 — Oslo Gul liste format and access not confirmed

- **What it is.** Oslo's municipal "Gul liste" (Yellow List) of conservation-worthy buildings — separate from Askeladden — is a city-specific heritage overlay that must be sourced separately. Its data format (GIS layer, downloadable CSV/JSON, PDF list) and access method are not confirmed.
- **Why it blocks.** Cannot integrate the heritage overlay without knowing the access method.
- **THE EXACT RESUME STEP.** Check `byantikvaren.oslo.kommune.no` for a "Gul liste" download or WMS/WFS link. Search Oslo open-data catalogue for "Gul liste" or "verneverdig."

### B4 — PBE gebyrforskrift (priced product boundary) not fully read

- **What it is.** PBE operates a priced ordering service (Regulerings- og eiendomsbekreftelse, byggesakskart etc.) with a new price list from 1 January 2026. The interactive viewer and grad-av-utnytting faktaark are confirmed as free/open. The full scope of the priced line has not been read.
- **THE EXACT RESUME STEP.** Fetch or read the PBE gebyrforskrift (current 2026 version) from Oslo kommune's PBE pages to confirm exactly which products are free vs. priced.

---

## 4 — TRIP-WIRES (if you see X elsewhere, come back HERE and do Y)

- **4.1 — If an Oslo planregister WFS is confirmed** → Oslo is likely the richest Norwegian city to integrate. Its faktaark resolves the historical-method problem that manually requires reading an H-2300 B appendix in Trondheim and Bergen. Raise Oslo's rate estimate and sequence it as the second city after Trondheim.
- **4.2 — If the faktaark is confirmed as a per-parcel dynamic page** → Oslo has a unique programmatic asset that no other studied Norwegian city has. Consider building an Oslo faktaark scraper as a complement to the plan WFS pipeline.
- **4.3 — If the Oslo planregister WFS returns arealformål/hensynssone attributes** → the same SOSI Plan reader built for Trondheim applies directly. Record the attribute schema differences (if any) from Trondheim's.
- **4.4 — If Oslo's WFS is confirmed absent** → budget 3–5 dev-days for a Planinnsyn automation layer (headless browser or API reverse-engineering) before any Oslo pack can be built.
- **4.5 — If the Gul liste is found as a GIS layer** → integrate as the second heritage layer (after Kulturminnesøk.no) for Oslo parcels; note that the Gul liste covers conservation-worthy buildings not yet formally protected under Askeladden.

---

## 5 — WHAT IS ALREADY BUILT (do not redo)

- National legal structure characterisation — `../../findings/NORWAY-MASTER-DATA-SOURCE-STUDY.md`
- National SOSI Plan code tables — `../../README.md §1.3` — static lookup
- § 29-4 national default confirmed — `../../sources/SOURCES.md §A`
- Oslo Planinnsyn viewer confirmed live — `sources/SOURCES.md §A`
- Oslo grad av utnytting faktaark confirmed live — `sources/SOURCES.md §A`
- Historical calculation-method switching logic documented — `../../README.md §1.4`; H-2300 B veileder confirmed as the authority

---

## 6 — VERIFIED SOURCES (endpoint · what it answers · confidence tier · the exact query)

| Source | Answers | Tier | Exact query / note |
|---|---|---|---|
| Oslo Planinnsyn | Per-parcel gnr/bnr → all overlapping plan layers + bestemmelser text (click-viewer) | `published` — CONFIRMED LIVE | `https://od2.pbe.oslo.kommune.no/kart/` |
| Oslo Grad av utnytting faktaark | Historical-method era identification; bestemmelser path | `published` — CONFIRMED LIVE | `https://od2.pbe.oslo.kommune.no/pages/faktaark/Grad%20av%20utnytting.html` |
| pbl. § 29-4 + Rundskriv H-8/15 | § 29-4 fallback height / setback defaults | `published` | `lovdata.no` pbl. §29-4; `regjeringen.no` Rundskriv H-8/15 |
| Oslo planregister WFS | Plan boundary geometry + arealformål / bestemmelser attributes for programmatic query | UNVERIFIED — primary blocker | Check `data.oslo.kommune.no` and Geonorge kartkatalog — see B1 |
| Matrikkelen Eiendomskart Teig WFS | Parcel boundary geometry | `published` — CONFIRMED LIVE | `https://wfs.geonorge.no/skwms1/wfs.matrikkelen-eiendomskart-teig` |

---

## 7 — DEAD ENDS (measured negatives — do NOT re-run hoping)

- **`BestemmelseUtnyttingsgrad` as a populated structured attribute:** confirmed as an unfinished stub at the national object-catalog level (2026-07-24). Do not assume Oslo populates this field; probe explicitly.
- **Single national planregister WFS for Norway:** does not exist. Oslo (if it has a WFS) has its own per-kommune endpoint.

---

## 8 — THE SMALLEST NEXT STEP that moves the number, and its cost

**Search for an Oslo planregister WFS on Geonorge and `data.oslo.kommune.no`. Estimated: 20 minutes.**

```bash
# Geonorge kartkatalog search
curl "https://kartkatalog.geonorge.no/api/search?text=planregister+oslo&limit=5" \
  | python3 -m json.tool

# Oslo open-data catalogue search
curl "https://data.oslo.kommune.no/api/3/action/package_search?q=reguleringsplan&rows=5" \
  | python3 -m json.tool
```

**What each outcome implies:**
- WFS endpoint found in Geonorge or data.oslo.kommune.no → run GetCapabilities + GetFeature (same method as Trondheim B2); if attributes present, Oslo pack is viable via API path
- WFS not found → confirm by contacting PBE (`plan.postmottak@pbe.oslo.kommune.no`); if truly absent, budget Planinnsyn automation layer before any Oslo pack
