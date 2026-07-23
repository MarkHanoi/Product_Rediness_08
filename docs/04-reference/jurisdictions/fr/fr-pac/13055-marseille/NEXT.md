# NEXT — Marseille / AMP Territoire 1 (13055)

> **Last updated:** 2026-07-23 · **Maintainer:** UNASSIGNED · **Status:** SCAFFOLD

---

## 1 — WHERE WE STOPPED (the one-paragraph truth)

Research is complete at the mechanism level. The PLUi AMP Territoire 1 (approved 19/12/2019) has an explicit graphic-primacy precedence rule: the graphic plan overrides the written zone articles for height, and the written article applies only where the graphic plan is silent. This means two things: (a) a new engine kind (ADR-0275) is required before any Marseille pack can be written, and (b) the critical pre-implementation probe is whether the graphic layer is machine-readable (GIS) or PDF-only. If PDF-only, the graphic-first resolution logic cannot be implemented as an API call. No live probe has been run. No rule pack has started. Euroméditerranée (OIN) must be an explicit refusal at first pass — it is a derogating instrument that entirely supersedes the PLUi inside its boundary.

---

## 2 — THE NUMBER (what % of clicks, which denominator, and why)

**Zoning full-envelope resolution: 0% (not started).**

Denominator: Marseille parcels in zones UA/UB/UC of PLUi Territoire 1, excluding Euroméditerranée (OIN), where either (a) the graphic layer supplies a machine-readable height value, or (b) the graphic layer is confirmed silent and the written fallback applies. Currently zero communes transcribed.

---

## 3 — BLOCKERS

### B1 — Graphic layer machine-readability unknown (the critical probe)

- **What it is.** The PLUi AMP Territoire 1 "règlement graphique" sets the primary height for each parcel. It may be: (A) a machine-readable GIS layer (WFS/WMS) on AMP's urbanisme portal — in which case graphic-first resolution is an API call; (B) a vector or scanned PDF plate — in which case graphic-first resolution requires a digitizing task and the estimate grows by 4–6 days.
- **Why it blocks.** Cannot design or cost ADR-0275 until the graphic layer format is known.
- **What would unblock it.** One probe against the AMP urbanisme portal and the national GPU WFS.
- **THE EXACT RESUME STEP.**
  ```bash
  # 1. GPU WFS — check feature types for AMP Territoire 1
  # Get a zone feature for a Marseille parcel (Vieux-Port area: 5.368, 43.295)
  curl "https://apicarto.ign.fr/api/gpu/zone?lon=5.368&lat=43.295" \
    | python3 -m json.tool

  # 2. From the GPU response, extract the PDF/règlement link
  # Fetch the API WFS with more attributes to look for graphic overlay fields
  curl "https://data.geopf.fr/annexes/ressources/wfs/gpu.xml\
  ?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature\
  &TYPENAMES=gpu:zone_urba\
  &BBOX=5.360,43.290,5.380,43.305,EPSG:4326\
  &SRSNAME=EPSG:4326&COUNT=3&OUTPUTFORMAT=application/json" \
    | python3 -m json.tool | grep -E '"hauteur|HAUTEUR|height|graphique|HAUTEUR_MAX"'

  # 3. Check AMP's own urbanisme portal for a graphic layer
  # Search for WMS/WFS endpoints at AMP
  curl "https://www.ampmetropole.fr/" | grep -i -E 'wfs|wms|geoportail|geoserver' | head -10
  # Also try: metropole-aix-marseille-provence.fr, sig.ampmetropole.fr
  ```

### B2 — ADR-0275 (graphic-primacy rule kind) not yet written

- **What it is.** The Marseille graphic-first/written-fallback resolution logic requires a new `GeometricRule` kind (ADR-0275) that: (1) attempts to resolve height from a graphic layer first; (2) falls back to the zone's written article only where the graphic layer is silent. This is not implementable with any existing kind.
- **Why it blocks.** No Marseille pack can be implemented without this ADR.
- **What would unblock it.** Read PLUi Territoire 1 règlement general provisions verbatim for the precedence rule language, then draft ADR-0275 with the founder.
- **THE EXACT RESUME STEP.** From the GPU probe in B1: extract the PLUi règlement PDF link. Download the PDF. Navigate to the "Dispositions générales" section. Copy the exact precedence rule language. Draft ADR-0275 using this verbatim text as the legal basis.

### B3 — Zone article values not read from primary source

- **What it is.** The storey ranges for UA (~R+4–6), UB (~R+3–4), UC (~R+1–2) cited in README §3 are from corroborated secondary research — they are descriptive characterisations of the written article, not a verbatim reading of the PLUi règlement.
- **Why it blocks.** Cannot author the written-fallback path without reading the actual zone articles (including height in metres, emprise au sol %, setback distances).
- **THE EXACT RESUME STEP.** After obtaining the PLUi Territoire 1 règlement PDF (from the GPU probe in B1): navigate to zone UA article (likely "UA.X" covering "hauteur des constructions") and read verbatim. Record: maximum height in metres, emprise au sol %, setback from road boundary, setback from side limits. Repeat for UB and UC.

### B4 — Euroméditerranée (OIN) boundary not sourced

- **What it is.** Euroméditerranée is a state-led Opération d'Intérêt National (OIN) inside Marseille with its own règlement that derogates from the PLUi. Any parcel inside the OIN boundary is NOT governed by the PLUi; applying a PLUi zone rule there is a legal error.
- **Why it blocks.** Cannot ship any Marseille envelope result without first checking whether the parcel is inside the OIN. The refusal must come before the zone lookup.
- **What would unblock it.** Locate the OIN boundary as a GIS layer from EPAEM (Établissement Public d'Aménagement Euroméditerranée) or the GPU.
- **THE EXACT RESUME STEP.**
  ```bash
  # Check EPAEM / GPU for OIN boundary
  curl "https://apicarto.ign.fr/api/gpu/info?lon=5.368&lat=43.295" \
    | python3 -m json.tool | grep -i -E 'OIN|Euromediterranee|euroméd'
  # Also: browse euromediterranee.fr for GIS/download section
  ```

---

## 4 — TRIP-WIRES (if you see X elsewhere, come back HERE and do Y)

- **4.1 — If ADR-0275 (graphic-primacy) is ratified for Marseille** → the same kind architecture applies to any other French commune where the graphic plan takes explicit legal precedence over the written règlement (a common pattern in AMP; may also apply to other PLUi documents). Update this trip-wire with any identified additional communes.
- **4.2 — If Paris "plan des hauteurs" is confirmed as a GIS WFS layer** → the Paris graphic-layer ingestion (Paris NEXT.md §3.B2) uses the same query pattern as the Marseille graphic-layer probe above. What is learned there applies here.
- **4.3 — If the GPU WFS for AMP returns graphic-height attributes on zone features** → B1 resolves as "GIS-accessible" — start ADR-0275 immediately at the lower cost estimate (~22–27 dev-days).
- **4.4 — If CNIG SRU structured règlement data reaches AMP communes** → the transcription bottleneck for UA/UB/UC collapses. Monitor `cnig.fr` SRU adoption tracker.
- **4.5 — If Euroméditerranée OIN GIS boundary is published openly by EPAEM** → source it immediately as the OIN carve-out; integrate before any Marseille pack ships.

---

## 5 — WHAT IS ALREADY BUILT (do not redo)

- France national data source characterisation — `../../findings/FRANCE-MASTER-DATA-SOURCE-STUDY.md §B.3`
- National GPU and BD TOPO APIs confirmed — `../../sources/SOURCES.md`
- COS/FAR abolition (loi ALUR 2014) documented — `../../sources/SOURCES.md`

---

## 6 — VERIFIED SOURCES

| Source | Answers | Tier | Exact query / note |
|---|---|---|---|
| GPU API (`apicarto.ign.fr/api/gpu`) | Zone code, document name/date, PDF link for AMP parcels | VERIFIED-LEAD (not live-probed) | `GET /api/gpu/zone?lon=5.368&lat=43.295` |
| PLUi AMP Territoire 1 (19/12/2019) | Primary legal instrument — written règlement and graphic plan | VERIFIED-LEAD (not read) | Via GPU-returned PDF link for a Marseille commune |
| GPU SUP layer | SUP acts (flood, aviation) intersecting a Marseille parcel | VERIFIED-LEAD | `GET /api/gpu/zone` — SUP fields in response |
| BD TOPO `data.geopf.fr/wfs` | Context buildings + `HAUTEUR` | VERIFIED-LEAD (not live-probed) | National — same as Paris/Lyon probe |
| EPAEM | Euroméditerranée OIN boundary and règlement | NOT YET | `euromediterranee.fr` — GIS/data section |
| PLUi Territoire 1 règlement graphique | PRIMARY HEIGHT SOURCE for Marseille | NOT YET — machine-readability unknown | See B1 probe command |

---

## 7 — DEAD ENDS

- **AMP's own published GIS zoning layer as a legally binding source:** explicitly marked as informational only / not legally opposable by AMP's own metropolitan authority notice. Do not use it as a primary source for any legal value — it is navigation only.
- **Pays d'Aix PLUi for Marseille parcels:** wrong document. Marseille (INSEE 13055) falls under Territoire 1. The "Pays d'Aix" PLUi covers a separate Territoire and is a different document (approved 5/12/2024). Do not cross-reference — they are independent instruments.

---

## 8 — THE SMALLEST NEXT STEP that moves the number, and its cost

**Run the GPU zone probe + graphic layer probe for a Marseille parcel (B1). Estimated: 0.5 dev-days.**

This probe:
1. Confirms the GPU returns the correct PLUi document for Marseille (Territoire 1, not Pays d'Aix).
2. Reveals whether any height attributes appear on the GPU zone features — or whether height is confined to the graphic PDF.
3. Provides the PLUi règlement PDF link for the verbatim zone article reading (B3).
4. May identify the Euroméditerranée OIN boundary if GPU returns it (B4).

Record all responses verbatim in `sources/SOURCES.md §A`.
