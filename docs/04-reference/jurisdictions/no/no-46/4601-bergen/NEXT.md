# NEXT — Bergen (4601, NO-46)

> **What this file is.** Where we stopped on Bergen, exactly why, and precisely what to do
> to go further the moment it becomes possible.
> **Last updated:** 2026-07-24 · **Maintainer:** UNASSIGNED · **Status:** SCAFFOLD

---

## 1 — WHERE WE STOPPED (the one-paragraph truth)

Bergen's national mechanism is confirmed — the same SOSI Plan schema, the same hensynssone H570 heritage overlay, the same § 29-4 fallback, the same grad av utnytting method menu as Trondheim and Oslo. What is not confirmed is Bergen's own planregister delivery endpoint. The Geonorge kartkatalog equivalent of "Planregister Trondheim kommune" has not been located for Bergen in this pass. This is a 10-minute search, not a mechanism-design problem. Once the endpoint is confirmed and probed with GetFeature, Bergen's ingestion code should be near-identical to Trondheim's — the same SOSI Plan reader with a different URL. Bergen's additional open item is the format of its own verneverdig-building list (equivalent to Oslo's Gul liste), which is referenced in heritage guidance but not confirmed as a machine-readable dataset.

---

## 2 — THE NUMBER (what % of clicks, which denominator, and why)

**Zoning full-envelope resolution: 0% (not started).**

Denominator: any Bergen parcel covered by a reguleringsplan with %-BYA/BRA and height readable from a structured source. **This denominator is unknown** until the planregister WFS endpoint is located and probed, and the regime classifier runs.

---

## 3 — BLOCKERS

### B1 — Bergen planregister WFS endpoint not located (primary gate)

- **What it is.** Bergen's planregister delivery point (equivalent to Trondheim's confirmed Geonorge kartkatalog entry) has not been found in this pass.
- **Why it blocks.** Without the endpoint, no WFS probe can be run and no Bergen data pipeline can be built.
- **What would unblock it.** Two parallel searches, same method used for Trondheim:
  1. Search Geonorge kartkatalog for "Planregister Bergen kommune"
  2. Check Bergen kommune's own open-data portal
- **THE EXACT RESUME STEP.**
  ```bash
  # Geonorge kartkatalog search
  curl "https://kartkatalog.geonorge.no/api/search?text=planregister+bergen+kommune&limit=5" \
    | python3 -m json.tool | grep -i "uuid\|title\|url\|accessUrl"

  # Bergen open-data portal (if it exists)
  curl "https://open.bergen.kommune.no/api/3/action/package_search?q=planregister&rows=5" \
    | python3 -m json.tool
  ```
  Record: Geonorge UUID if found; WFS endpoint URL; access terms.

### B2 — Bergen planregister WFS attribute schema not known

- **What it is.** Once the endpoint is found (B1), a GetFeature probe must confirm the attribute schema — same probe as Trondheim B2.
- **Why it blocks.** Determines whether Bergen can use the Trondheim SOSI Plan reader directly (expected: yes, same schema) or whether Bergen has any local schema extension.
- **THE EXACT RESUME STEP.** After B1: run the same GetCapabilities + DescribeFeatureType + GetFeature probe as Trondheim NEXT.md §B2, using Bergen's own endpoint and a Bergen parcel BBOX (Bergen city centre / Bryggen area approx WGS84: 5.3230, 60.3960).

### B3 — Bergen verneverdig-building list format and access not confirmed

- **What it is.** Bergen's own municipal heritage list (verneverdig-building list, equivalent to Oslo's Gul liste) is referenced in Bergen heritage guidance but its data format (GIS layer, list, PDF) and access method are not confirmed.
- **Why it blocks.** Cannot integrate the Bergen-specific heritage overlay without knowing the access method.
- **THE EXACT RESUME STEP.** Check `byantikvar.bergen.kommune.no` or Bergen kommune's own cultural heritage pages for a machine-readable verneverdig-building dataset or WMS/WFS link.

### B4 — FKB-Bygning licence not resolved (same as Trondheim and Oslo)

- **What it is.** FKB-Bygning building footprints require a Norge digitalt agreement or reseller purchase for commercial use.
- **THE EXACT RESUME STEP.** Same as Trondheim B4 — one licence step covers all Norwegian cities.

---

## 4 — TRIP-WIRES (if you see X elsewhere, come back HERE and do Y)

- **4.1 — If the SOSI Plan WFS reader is built for Trondheim** → Bergen's ingestion should reuse the same reader with only the endpoint URL changed. Run a Bergen GetFeature probe to confirm the attribute schema is identical before declaring reuse complete.
- **4.2 — If B1 finds Bergen's planregister endpoint** → immediately run B2 GetFeature probe. This converts Bergen from "assumed Trondheim-shaped" to "confirmed Trondheim-shaped" (or reveals any local schema extension).
- **4.3 — If Bergen's WFS attribute schema differs from Trondheim's** → note any local extension (a Bergen-specific SOSI Plan profile is theoretically possible but would be a deviation from the national mandate). Record the difference and assess whether it requires a Bergen-specific adapter or just a configuration change.
- **4.4 — If Bergen's verneverdig list is found as a GIS layer** → integrate as a second heritage layer for Bergen parcels, analogous to Oslo's Gul liste; the two cities have parallel city-specific overlays on top of the national Askeladden/Kulturminnesøk/H570 mechanism.

---

## 5 — WHAT IS ALREADY BUILT (do not redo)

- National mechanism characterisation (applicable to Bergen unchanged) — `../../findings/NORWAY-MASTER-DATA-SOURCE-STUDY.md §B.2`
- National SOSI Plan code tables — `../../README.md §1.3` — static lookup; same codes apply to Bergen
- § 29-4 national default confirmed — `../../sources/SOURCES.md §A`
- Bergen heritage overlay mechanism confirmed (hensynssone H570 + Askeladden/Kulturminnesøk) — `sources/SOURCES.md §A`

---

## 6 — VERIFIED SOURCES (endpoint · what it answers · confidence tier · the exact query)

| Source | Answers | Tier | Exact query / note |
|---|---|---|---|
| Bergen heritage guidance page | Askeladden / Kulturminnesøk + hensynssone H570 / bevaringsområde mechanism — confirmed applicable to Bergen | `published` — CONFIRMED LIVE | `https://www.bergen.kommune.no/hvaskjer/tema/kulturminner-i-bergen/istandsetting-og-vedlikehold/hvilke-bygninger-er-fredete-eller-verneverdige` |
| Bergen planregister WFS | Plan boundary geometry + arealformål / bestemmelser attributes | UNVERIFIED — primary blocker | Search Geonorge kartkatalog + Bergen open-data portal (see B1) |
| pbl. § 29-4 + Rundskriv H-8/15 | § 29-4 fallback height / setback defaults | `published` | `lovdata.no` / `regjeringen.no` Rundskriv H-8/15 |
| Matrikkelen Eiendomskart Teig WFS | Parcel boundary geometry | `published` — CONFIRMED LIVE | `https://wfs.geonorge.no/skwms1/wfs.matrikkelen-eiendomskart-teig` |
| NDH / høydedata.no | National terrain model (DTM/DSM), free | `published` — CONFIRMED LIVE | `https://hoydedata.no` |

---

## 7 — DEAD ENDS (measured negatives — do NOT re-run hoping)

- **`BestemmelseUtnyttingsgrad` as a populated structured attribute:** confirmed as an unfinished stub nationally (2026-07-24). Do not assume Bergen populates this field before an explicit probe.
- **Single national planregister WFS for Norway:** does not exist. Bergen has its own per-kommune endpoint.

---

## 8 — THE SMALLEST NEXT STEP that moves the number, and its cost

**Search for Bergen planregister WFS on Geonorge. Estimated: 10 minutes.**

```bash
curl "https://kartkatalog.geonorge.no/api/search?text=planregister+bergen+kommune&limit=5" \
  | python3 -m json.tool
```

**What each outcome implies:**
- Bergen Geonorge entry found with WFS URL → immediately run B2 probe; Bergen is confirmed as low-cost (same reader as Trondheim)
- Not found on Geonorge → check Bergen's own open-data portal; contact Bergen Kartavdelingen
- Confirmed absent → Bergen delivers plan data only via a viewer (same situation as Oslo pre-confirmation); budget a viewer automation layer before any Bergen pack
