# NEXT — Berlin (11000, DE-BE)

> **Last updated:** 2026-07-23 · **Maintainer:** UNASSIGNED · **Status:** SCAFFOLD

---

## 1 — WHERE WE STOPPED (the one-paragraph truth)

Research is complete at the mechanism level. Berlin's four-regime structure (modern B-Plan, 1958/60 Baunutzungsplan, §34, §35) is documented and the FIS-Broker is confirmed as the access point for both XPlanung and the legacy Baunutzungsplan layer. The actual first engineering task is the **regime classifier** — a spatial cross-query that places each parcel into exactly one of the four regimes before any numeric sourcing can begin. The Baunutzungsplan Baustufen translation table (needed to convert pre-BauNVO grading to GRZ/GFZ equivalents) does not exist in XPlanGML and requires historical archive research. §34 is documented as covering large former East Berlin districts. No live probe has been run on any of the three layers. No rule pack has started. Estimate: ~30–35 dev-days once properly unblocked.

---

## 2 — THE NUMBER (what % of clicks, which denominator, and why)

**Zoning full-envelope resolution: 0% (not started).**

Denominator: Berlin parcels under regime (a) B-Plan with non-null GRZ/GFZ/Höhe in XPlanGML. Both the numerator and denominator are currently zero — the regime classifier must be built before either can be measured.

---

## 3 — BLOCKERS (ordered by dependency)

### B1 — Regime classifier not built (gate for ALL Berlin numeric work)

- **What it is.** A per-parcel classification into: (a) modern B-Plan §30, (b) 1958/60 Baunutzungsplan §173(3) BBauG, (c) §34 unplanned interior, (d) §35 outlying area. Without this, no numeric sourcing can begin and no meaningful denominator can be stated.
- **Why it blocks.** Everything — GRZ/GFZ lookup, Baustufen translation, §34 refusal — depends on first knowing which regime governs.
- **What would unblock it.** Build the spatial cross-query: (1) probe FIS-Broker for B-Plan polygon covering the parcel → if found, regime (a); (2) probe FIS-Broker for Baunutzungsplan polygon → if found and no B-Plan, regime (b); (3) classify remainder as (c) by built-fabric presence or (d) by outlying location.
- **THE EXACT RESUME STEP.**
  ```bash
  # Step 1: FIS-Broker — available B-Plan layers (XPlanung)
  curl "https://fbinter.stadt-berlin.de/fb/wfs/geometry/senstadt/re_bplan\
  ?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities" \
    | grep -E '<Name>|FeatureType' | head -20

  # Step 2: FIS-Broker — check for Baunutzungsplan legacy layer
  # Search for "Baunutzungsplan" or "baunp" in FIS-Broker capabilities
  curl "https://fbinter.stadt-berlin.de/fb/wfs/geometry/senstadt\
  ?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities" \
    | grep -i -E 'baunutzungsplan|baunp|bnp|1958|1960'

  # Step 3: GetFeature — one modern West Berlin parcel (Mitte district)
  # (~52.519, 13.406 — near Alexanderplatz)
  curl "https://fbinter.stadt-berlin.de/fb/wfs/geometry/senstadt/re_bplan\
  ?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature\
  &BBOX=13.400,52.515,13.415,52.525,EPSG:4326\
  &SRSNAME=EPSG:4326&COUNT=3&OUTPUTFORMAT=application/json" \
    | python3 -m json.tool | grep -E '"GRZ|GFZ|hoeheMax|hoeheMN|Nutzungsschablone|Baustufe"'

  # Step 4: Same bbox against the Baunutzungsplan layer (if found in Step 2)
  ```

### B2 — Baunutzungsplan Baustufen translation table unavailable

- **What it is.** The 1958/60 Baunutzungsplan uses "Baustufen" grading (e.g. I, II, IIa, III) that predates BauNVO zone types. There is no standard conversion table mapping Baustufen to GRZ/GFZ equivalents in any machine-readable source found in research.
- **Why it blocks.** Without the translation table, regime (b) parcels cannot produce a numeric envelope — only a refusal or a heavily-caveated estimate.
- **What would unblock it (ascending cost):**
  1. Check whether FIS-Broker digitised Baunutzungsplan records carry GRZ/GFZ as computed attributes (most likely: NO, since XPlanGML predates the 1958/60 plan) — 0.5 days.
  2. Locate and read the original 1958/60 Baunutzungsplan legend/key from Berlin Senate Stadtentwicklungsamt archive — 2–3 days.
  3. Build a Baustufen→GRZ/GFZ lookup table from that legend — 1 day.
- **THE EXACT RESUME STEP.** First: probe FIS-Broker Baunutzungsplan layer for a known West Berlin parcel and inspect whether GRZ/GFZ attributes are present. If not: contact Berlin Stadtentwicklungsamt (SenStadtWohn) for the 1958/60 Baunutzungsplan legend document.

### B3 — Baunutzungsplan voidance status unknown per area

- **What it is.** OVG Berlin-Brandenburg 2020 established that Baunutzungsplan figures can be voided as *funktionslos* when they are no longer realizable given actual development. There is no database of voided figures. A manual case-law search is required per target area before using any Baunutzungsplan-derived value.
- **Why it blocks.** Shipping a Baunutzungsplan-derived GFZ without a voidance check is the German equivalent of shipping Marseille without the graphic-primacy check — confidently wrong in a legally material direction.
- **What would unblock it.** Establish a "voidance risk protocol": treat all Baunutzungsplan figures as `corroborated, voidance-risk`; run a case-law search per target area before elevating to `published`; add product-visible caveat language. This is a procedural unblock, not a data source.
- **THE EXACT RESUME STEP.** Draft the voidance-risk caveat language and add it to `sources/SOURCES.md §A` as the standard disclaimer for any future Baunutzungsplan row. Decision: treat regime (b) as a refusal-with-caveat at first pass rather than a full envelope.

### B4 — §34 coverage fraction not measured (East Berlin)

- **What it is.** §34 is documented as covering large parts of former East Berlin districts. The precise fraction is not measured.
- **Why it blocks.** Without knowing the §34 fraction, the denominator (% of Berlin clicks that can ever get a numeric answer) is an assumption.
- **What would unblock it.** Grid-sample probe over the former East Berlin district bboxes (Marzahn, Lichtenberg, Treptow, Pankow, etc.) classifying each point as B-Plan / Baunutzungsplan / §34 / §35.
- **THE EXACT RESUME STEP.** After B1 probe confirms FIS-Broker B-Plan and Baunutzungsplan layer names: run a 300 m lattice grid over the former East Berlin area (approximate: east of lon 13.44°), count the fraction of points with no B-Plan and no Baunutzungsplan polygon → that fraction approximates §34 coverage.

### B5 — BauO Bln Abstandsflächen multiplier not read

- **What it is.** Berliner Bauordnung (BauO Bln) §6 governs setbacks in Berlin. Multiplier not yet read.
- **THE EXACT RESUME STEP.** `curl "https://gesetze.berlin.de/bsbe/document/jlr-BauOBErahmen"` — navigate to §6 (Abstandsflächen). Record multiplier (typically 0.4H in Berlin dense urban zones) and minimum.

---

## 4 — TRIP-WIRES (if you see X elsewhere, come back HERE and do Y)

- **4.1 — If Hamburg or Munich XPlanGML reader is built** → the same reader covers Berlin regime (a) B-Plans (same XPlanGML schema). Port before rebuilding.
- **4.2 — If any OVG or BVerwG ruling voids additional Baunutzungsplan figures** → add to §7 DEAD ENDS with the affected area and ruling citation. The area is presumptively §34 until a new B-Plan is adopted.
- **4.3 — If Berlin publishes an official map of Baunutzungsplan-voided areas** → link it here; update regime (b) confidence from `corroborated, voidance-risk` to `corroborated` for non-voided areas.
- **4.4 — If the Baustufen legend/key is found as a digitised document** → Berlin regime (b) pack becomes feasible. Update B2 blocker status.
- **4.5 — If a unified Berlin Erhaltungsverordnung GIS layer is published** → add it as an overlay source in `sources/SOURCES.md`. Until then: treat all Erhaltungsverordnung as an unresolvable overlay risk for any Berlin parcel.

---

## 5 — WHAT IS ALREADY BUILT (do not redo)

- National XPlanung/BauGB/BauNVO characterisation — `../../findings/GERMANY-MASTER-DATA-SOURCE-STUDY.md`
- BauNVO §17 ceiling table — `../../README.md §1.3`
- OVG 2020 voidance precedent documented — `../../sources/SOURCES.md §A`
- Regime classifier design (Hamburg/Munich implementation) — **port to Berlin before rebuilding**

---

## 6 — VERIFIED SOURCES

| Source | Answers | Tier | Exact query / note |
|---|---|---|---|
| Berlin FIS-Broker (XPlanung B-Plans) | B-Plan polygon coverage + XPlanGML attributes | VERIFIED-LEAD | `fbinter.stadt-berlin.de` → `re_bplan` layer — endpoint confirmed, field names TBD |
| Berlin FIS-Broker (Baunutzungsplan 1958/60) | Legacy West-Berlin plan polygons with Baustufen grading | VERIFIED-LEAD | `fbinter.stadt-berlin.de` → Baunutzungsplan layer name TBD |
| Berlin FIS-Broker (LoD2) | CityGML LoD2 building geometry — open (GDI-BE) | VERIFIED-LEAD | `fbinter.stadt-berlin.de` → `re_3dgebaeude` or similar — see `../../topics/buildings-lod-height.md` |
| OVG Berlin-Brandenburg 2020 (Az. 2 B 10.17) | Baunutzungsplan voidance precedent | `published` | Ruling date 15 Sep 2020; Neukölln GFZ 1.5 voided |
| BauGB §§30/34/35 | Regime taxonomy | `published` | `gesetze-im-internet.de/bbaug/` |
| BauNVO §17 | Density ceilings | `published` | `gesetze-im-internet.de/baunutzungsv/__17.html` |
| BauO Bln §6 | Abstandsflächen for Berlin | VERIFIED-LEAD (not read) | `gesetze.berlin.de` → BauO Bln §6 |

---

## 7 — DEAD ENDS (measured negatives — do NOT re-run hoping)

- **Baustufen→GRZ/GFZ mapping in XPlanGML:** XPlanGML predates the 1958/60 plan and has no field for Baustufen-to-BauNVO conversion. Do not search the XPlanGML schema for this table — it is not there. Go to the Berlin Senate archive.
- **Single spatial query classifying §34 vs §30 without a separate FIS-Broker probe:** there is no negative-space query for "parcels not covered by any plan." The classifier must check plan-layer coverage first and infer §34 from absence.

---

## 8 — THE SMALLEST NEXT STEP that moves the number, and its cost

**Run the FIS-Broker layer probe (B1). Estimated: 0.5 dev-days.**

This single probe:
1. Confirms B-Plan layer name and field schema (GRZ/GFZ/Höhe) in XPlanung.
2. Locates the Baunutzungsplan legacy layer name (if it exists as a WFS endpoint).
3. Reveals whether GRZ/GFZ attributes are populated in Berlin XPlanGML (same question as Hamburg — run both probes in the same session).

Record the full response verbatim in `sources/SOURCES.md §A`. The outcome of this probe determines whether Berlin regime (b) is feasible at all (translation table path) or must default to refusal-with-caveat.
