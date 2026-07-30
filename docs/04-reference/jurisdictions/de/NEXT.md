# NEXT — Germany (`de`)

> **What this file is.** The single place recording where we stopped on Germany, exactly why, and
> precisely what to do to go further the moment it becomes possible — so a source or technique
> found while working on any OTHER jurisdiction can be brought straight back here.
> **Last updated:** 2026-07-23 · **Maintainer:** UNASSIGNED · **Status:** RESEARCH COMPLETE — pre-implementation

---

## 1 — WHERE WE STOPPED (the one-paragraph truth)

The national legal structure is fully characterised — BauGB regime taxonomy (§30/§34/§35), BauNVO zone types and §17 density ceilings, XPlanung/XPlanGML as the standardised B-Plan exchange format, ALKIS as the parcel geometry standard, and LoD2-DE as the building-height source. Three cities were studied in depth (Hamburg, Munich, Berlin); the sequencing case is clear (Hamburg first as the only fully-digitised, no-legacy-plan, city-state option). The central unresolved question for every German city is not "which height mechanism" (B-Plan GFZ/Höhe are structured XPlanGML attributes) but "which regime governs this parcel" — the four-way §30/§34/§35/legacy-plan classifier is the prerequisite for any numeric sourcing. No pack is implemented; no live XPlanGML probe has been run.

---

## 2 — THE NUMBER (what % of clicks, which denominator, and why)

**Zoning full-envelope resolution: 0% (not started).**

**Context-data resolution: 0% (endpoints identified in research, not live-probed).**

Denominator for envelope: any German parcel for which (a) the regime classifier places it under a B-Plan, and (b) that B-Plan's GRZ/GFZ/Höhe attributes are populated in the XPlanGML delivery. Currently zero parcels classified, therefore zero resolved.

---

## 3 — BLOCKERS

### 3.1 — Regime classifier not built (prerequisite for ALL German cities)

- **What it is.** Before numeric sourcing can happen for any parcel, the pipeline must determine which of the four regimes governs it: (a) modern B-Plan, (b) historic plan (Berlin Baunutzungsplan), (c) §34 unplanned interior, (d) §35 outlying area. This is a spatial classification problem, not a lookup.
- **Why it blocks.** Without the classifier, there is no way to know whether a parcel has a numeric rule at all. Shipping a `GFZ` value for a §34 parcel would be a legal fabrication.
- **What would unblock it.** Build a cross-query: (1) probe the Land's XPlanung layer for a B-Plan polygon that covers the parcel — if found, regime (a); (2) probe any legacy-plan layer (Berlin only) for regime (b); (3) if both absent and the parcel sits in the urban fabric, regime (c); (4) otherwise regime (d).
- **THE EXACT RESUME STEP.** For Hamburg (the simplest case): fetch the Hamburg XPlanung WFS GetCapabilities, confirm the B-Plan polygon layer name, then run a `GetFeature` with the bbox of one known Hamburg parcel and verify the B-Plan coverage. Record the layer name and any auth requirement.

### 3.2 — XPlanGML structured-field completeness unknown

- **What it is.** XPlanGML mandates the schema but not that GRZ/GFZ/Höhe fields are populated. A Hamburg B-Plan may be delivered as a valid XPlanGML file with only geometry and a scanned-PDF reference.
- **Why it blocks.** If GRZ/GFZ/Höhe are empty, the ingestion pipeline returns no numeric rules even for a properly classified §30 parcel.
- **What would unblock it.** One live XPlanGML probe: fetch a Hamburg B-Plan GML file, check whether `GRZ`, `GFZ`, `hoeheMN`, or `hoeheBezugspunkt` attributes are non-null.
- **THE EXACT RESUME STEP.**
  ```bash
  # Hamburg LGV XPlanung WFS — probe for a Hamburg B-Plan
  curl "https://geodienste.hamburg.de/HH_WFS_Bebauungsplaene\
  ?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature\
  &TYPENAMES=app:hh_bp_bereiche&COUNT=1&OUTPUTFORMAT=application/json" \
    | python3 -m json.tool | grep -E '"GRZ|GFZ|hoeheMax|hoeheMN|hoeheBezug'
  ```
  Record: field names present/absent, sample value, null rate.

### 3.3 — ALKIS parcel access/licence not confirmed per Land

- **What it is.** ALKIS is operated and licensed per Land. Hamburg, Bavaria, and Berlin each have their own terms; some are free/open, others fee-based or requiring registration.
- **Why it blocks.** Cannot build a parcel-fetch pipeline without knowing the access terms.
- **What would unblock it.** Check the geoportal landing page for each target Land:
  - Hamburg: `geoportal-hamburg.de` / `transparenzportal.hamburg.de`
  - Bavaria: `geodaten.bayern.de` (Bayerische Vermessungsverwaltung)
  - Berlin: `gdi.berlin.de` / `fbinter.stadt-berlin.de` (GDI-BE — confirmed partly open)
- **THE EXACT RESUME STEP.** For Hamburg: curl the ALKIS WFS GetCapabilities and check for authentication headers. If no auth required, fetch one parcel by bbox and confirm AGS code field is present.

### 3.4 — §34 coverage fraction unmeasured for Munich (and unconfirmed for Hamburg)

- **What it is.** The fraction of parcels inside each city that fall under §34 (no numeric envelope possible) is unknown. For Berlin it is documented as large (entire former-East districts). For Munich it is assumed small but not measured. For Hamburg it is assumed negligible (fully West German, complete XPlanung coverage) but also not measured.
- **Why it blocks.** Without measuring the §34 fraction, the dev-day estimate for Munich is an assumption not a measurement. The same applies to the denominator in §2 (what fraction of clicks can ever get a numeric answer).
- **What would unblock it.** Run a grid-sample probe — same method as the Barcelona `probe-bcn-clau-distribution.mts` — over a sample grid across each city, classifying each point as B-Plan / §34 / §35 / water.
- **THE EXACT RESUME STEP.** For Hamburg: take a ~300 m lattice grid over the Hamburg municipal bbox, query the XPlanung B-Plan layer for each point, record B-Plan coverage vs no-coverage. Compare to area; this converts the §34 assumption into a measurement.

### 3.5 — Berlin: four-regime complexity + Baunutzungsplan voidance risk

See `de-be/11000-berlin/NEXT.md` for the full Berlin blocker set. Berlin is separately tracked because its complexity is not shared with Munich or Hamburg.

---

## 4 — TRIP-WIRES (if you see X elsewhere, come back HERE and do Y)

- **4.1 — If an XPlanGML reader is built for any German city** → reusable across every Land that publishes XPlanung with populated attributes. This is Germany's structural advantage over Spain/France — verify the field-presence first, but once confirmed, one reader serves all.
- **4.2 — If the nDSM/LoD2 height pipeline is built for any other jurisdiction** (ES, FR) → check whether the German LoD2-DE tiles feed the same module with different inputs. Likely yes — CityGML is the shared format; the adapter may need only a new tile source, not a new pipeline.
- **4.3 — If an INSPIRE Buildings WFS serving LoD2 geometries for any German Land is confirmed as open/free** → note it here. The ZSHH national feed is restricted, but Land-level INSPIRE WFS may not be.
- **4.4 — If Bavarian LoD2 licence is confirmed as free** (ZSHH host may mean preferential terms for Bavaria-local access) → Munich becomes cheaper and the LoD2 source for Bavaria is resolved. Update §3 and `de-by/09162-munich/NEXT.md`.
- **4.5 — If DiPlanung (Bavaria's mandatory XPlanung platform from 31 Oct 2026) goes live early or slips** → update the Munich timing risk note in `de-by/09162-munich/README.md` and §3.3 above.
- **4.6 — If Hamburg's legacy pre-1960 plan citation preservation is confirmed** (XPlanGML record preserves the original Hamburg-law citation, not just the numeric value) → Hamburg pre-1960 B-Plan-derived figures may be shipped at `corroborated` confidence (not `certified`). Update `de-hh/02000-hamburg/NEXT.md §B2`.
- **4.7 — If any OVG (Oberverwaltungsgericht) or BVerwG ruling voids a specific Baunutzungsplan figure** → relevant ONLY for Berlin; add it to `de-be/11000-berlin/NEXT.md §7 DEAD ENDS` and treat the affected area as §34 until a new B-Plan is adopted.

---

## 5 — WHAT IS ALREADY BUILT (do not redo)

- National legal structure characterisation — `findings/GERMANY-MASTER-DATA-SOURCE-STUDY.md`
- Country-level README + city stubs — `de/README.md`, `de-hh/02000-hamburg/`, `de-by/09162-munich/`, `de-be/11000-berlin/`
- National SOURCES.md with citations for all national standards (BauGB, BauNVO, XPlanung, ALKIS, LoD2-DE)
- Topics files with spike evidence tables — `de/topics/`
- BauNVO §17 ceiling table — static lookup, in `README.md §1.3` — do not re-derive

---

## 6 — VERIFIED SOURCES (endpoint · what it answers · confidence tier · the exact query)

| Source | Answers | Tier | Exact query / note |
|---|---|---|---|
| BauGB (federal statute) | §30/§34/§35 regime taxonomy, §20 GFZ definition | `published` | Current consolidated version on `gesetze-im-internet.de/bbaug/` |
| BauNVO (federal ordinance) | §§2–11 zone type taxonomy, §17 density ceilings | `published` | `gesetze-im-internet.de/baunutzungsv/` |
| Hamburg XPlanung WFS (Hamburg LGV) | B-Plan polygon coverage + XPlanGML attributes for Hamburg | VERIFIED-LEAD (not live-probed) | `geodienste.hamburg.de/HH_WFS_Bebauungsplaene` |
| Berlin FIS-Broker | B-Plan polygons (XPlanung) + Baunutzungsplan legacy layer | VERIFIED-LEAD (not live-probed) | `fbinter.stadt-berlin.de` |
| DiPlanung (Bavaria, from Oct 2026) | Mandatory statewide XPlanung delivery for Bavaria | `published` (mandate) | Platform live from Oct 2026 |
| ZSHH LoD2-DE (national coordination) | ~58M buildings, CityGML LoD2, ~1 m height accuracy | `published` (existence); RESTRICTED (national feed) | Per-Land tiles where open; ZSHH gateway restricted |
| OVG Berlin-Brandenburg 2020 | Baunutzungsplan voidance precedent (2 B 10.17) | `published` (court ruling) | Ruling date: 2020-09-15; Neukölln GFZ 1.5 voided as funktionslos |

---

## 7 — DEAD ENDS (measured negatives — do NOT re-run hoping)

- **Single national XPlanung API serving all 16 Länder:** does not exist. XPlanung is a standardised schema, not a national endpoint. Each Land runs its own delivery. Budget 16 separate integrations sharing one reader, not one endpoint — do not re-search for a "federal XPlanung API".
- **ZSHH national LoD2 feed as a free/open API:** explicitly INSPIRE Art. 13(1)(e) restricted — "limited group of authorised users." Do not attempt to use the ZSHH gateway as an open source; go to individual Land portals instead.
- **BauNVO zone codes as a directly queryable layer:** BauNVO zone types are in XPlanGML attributes on B-Plan features, not in a separate queryable layer. There is no "zone code API" — you get the zone type from the XPlanGML feature covering a parcel.

---

## 8 — THE SMALLEST NEXT STEP that moves the number, and its cost

**Run the Hamburg XPlanGML live probe. Estimated: 0.5 dev-days.**

```bash
# Hamburg B-Plan WFS GetCapabilities
curl "https://geodienste.hamburg.de/HH_WFS_Bebauungsplaene\
?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities" \
  | grep -E 'FeatureType|Name'

# Hamburg B-Plan GetFeature — one result for a known Hamburg parcel bbox
# (example: Hamburg-Altstadt, near Rathausmarkt)
curl "https://geodienste.hamburg.de/HH_WFS_Bebauungsplaene\
?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature\
&TYPENAMES=app:hh_bp_bereiche\
&BBOX=9.9920,53.5490,9.9980,53.5530,EPSG:4326\
&SRSNAME=EPSG:4326&COUNT=2&OUTPUTFORMAT=application/json" \
  | python3 -m json.tool

# Then check one GML file directly if the WFS returns a GML link
# Look for: GRZ, GFZ, hoeheMN, hoeheBezugspunkt, Nutzungsschablone
```

**What each outcome implies:**
- WFS returns B-Plan polygon with GRZ/GFZ/Höhe attributes non-null → Hamburg is fully addressable via XPlanGML; start Hamburg pack immediately (§30 path only, no regime classifier needed for Hamburg given full coverage).
- WFS returns geometry only (no numeric attributes) → B-Plan values are in the signed Satzung PDF only; revert to PDF-transcription path (~10–12 d estimate holds but with PDF sourcing, not API ingestion).
- WFS returns auth error → check Hamburg Transparenzportal for open-data access token / registration requirement.

---

## 9 — Composite (C63 seven-axis) resume — the geospatial probes come FIRST

> This §8 Hamburg probe is the **LEGISLATION-axis** resume step. The composite Phase-3 climb —
> [`RATE-IMPLEMENTATION-PLAN.md`](./RATE-IMPLEMENTATION-PLAN.md) — front-loads the six geospatial axes
> (PARCEL · DATA-SOURCES · HEIGHTS/LOD · TERRAIN · CONTEXT) *before* the legal ones, because in Germany
> they are the high-ROI wins. The smallest composite-moving steps, in order:

- **Phase 0 probe (VERY LOW):** VG250 WFS `GetCapabilities` at BKG, then one point-in-polygon resolve
  (`lon/lat → VG250 polygon → AGS → Land`). Enabler for all per-Land wiring; moves no cell itself.
- **Phase A probe (the first big win — NRW "German Barcelona"):** confirm `opengeodata.nrw.de` LoD2 tile
  (VERIFIED-LIVE 2026-07-24) + NRW ALKIS reverse-lookup endpoint; then wire `AbstractALKISProvider` +
  `NRWProvider`, **consume LoD2 TRUE heights directly (skip nDSM)**, add a Köln `bake.mjs` REGION, scaffold
  `de-nw/05315-koln/`. Lifts PARCEL + DATA-SOURCES + HEIGHTS + CONTEXT + TERRAIN for Köln at once.
- **Trip-wire:** the NRW data spine is *already partly wired* (`alkis-nrw`, `fetchLod2DeNrw`, `terrain.mjs
  koln`) — Köln is unscaffolded only because it lacks a bake region + dossier (`COUNTRY-RATE.md §C`).

*(Every claim here is CONVERGENT-SECONDARY except the NRW LoD2 anchor — probe each Land before it moves a
RATE cell. Added 2026-07-30 alongside the Phase-3 composite plan.)*
