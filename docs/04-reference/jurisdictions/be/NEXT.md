# NEXT — Belgium (`be`)

> **What this file is.** The single place recording where we stopped on Belgium, exactly why, and
> precisely what to do to go further the moment it becomes possible — so a source or technique
> found while working on any OTHER jurisdiction can be brought straight back here.
> **Last updated:** 2026-07-24 · **Maintainer:** UNASSIGNED · **Status:** RESEARCH COMPLETE — pre-implementation

---

## 1 — WHERE WE STOPPED (the one-paragraph truth)

The national legal structure is fully characterised — three independent regional codes (VCRO/CoDT/
CoBAT), a single federal parcel layer (CADMAP/CadGIS, VERIFIED LIVE), the pervasive discretionary
overlay (goede ruimtelijke ordening / bon aménagement des lieux), Brussels' RRU Titre I as the only
region-wide numeric-ish baseline, the VCRO Art. 7.4.2/2 "clichering" nullification trap for
Flanders, and three independent heritage/building/LiDAR systems. Wallonia's zoning WFS and Flanders'
heritage WFS are VERIFIED LIVE and free. Brussels' PRAS and Flanders' DSI/GRB zoning are confirmed
via third-party cache but directly blocked (bot detection / robots.txt). The central unresolved
question for every Belgian city is **not** "which height mechanism" — it is (a) whether any RUP/PPAS
plan feature anywhere in Belgium carries a populated numeric height/FAR attribute at all (as opposed
to a PDF link), and (b) for Brussels specifically, whether the live PRAS and RRU endpoints are
accessible from a non-Belgian IP. No pack is implemented; no GetFeature probe has been run for any
Belgian parcel.

---

## 2 — THE NUMBER (what % of clicks, which denominator, and why)

**Zoning full-envelope resolution: 0% (not started).**

**Context-data resolution: 0% (endpoints identified in research, not all live-probed).**

Denominator for envelope: any Belgian parcel for which (a) the correct regional zoning layer (plan
de secteur / RUP / PRAS) is queried and returns a hit, AND (b) the returned plan feature carries any
populated numeric height/FAR/gabarit attribute. Currently zero parcels classified and zero attributes
confirmed non-null, therefore zero resolved.

National headline rate: ~10–14% (see `RATE.md` — this is the research estimate; the actual
implementation rate starts at 0% and climbs only after GetFeature probes confirm or deny the existence
of structured numeric attributes in actual plan features).

---

## 3 — BLOCKERS

### 3.1 — Whether any Belgian plan feature carries a numeric height/FAR attribute (the top blocker)

- **What it is.** Three GetCapabilities calls / cache reads confirm the zoning layers exist and are
  real. But none of the three regional system's capabilities documents shows a height, FAR, or gabarit
  attribute. The question is whether an actual GetFeature response on a specific plan polygon carries
  a numeric attribute that GetCapabilities doesn't advertise — or whether height/FAR is in a linked
  PDF voorschriften URL, as expected.
- **Why it blocks.** If no plan feature in any region carries a numeric height attribute, the
  implementation rate ceiling is ~0% for height/FAR — zone-boundary hit only. If one or more do, the
  pack architecture changes fundamentally (no OCR/PDF pipeline needed for those cases).
- **What would unblock it.** Run a GetFeature call against each region's zoning WFS for a specific,
  known address and inspect the full GML/JSON attribute set. This requires resolving the access blocks
  for Brussels (§3.2) and Flanders (§3.3) first, or using Wallonia (which is fully open) as the
  initial test.
- **THE EXACT RESUME STEP (Wallonia first — fully open):**
  ```bash
  # Wallonia plan de secteur — WFS GetFeature for a known Liège address parcel
  # Target: parcel near Liège city centre (approx 5.5697°E, 50.6326°N)
  curl "https://geoservices.wallonie.be/geoserver/inspire_lu/ows\
  ?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature\
  &TYPENAMES=inspire_lu:LU.ZoningElement_pds\
  &BBOX=5.565,50.630,5.575,50.635,EPSG:4326\
  &SRSNAME=EPSG:4326&COUNT=5&OUTPUTFORMAT=application/json" \
    | python3 -m json.tool
  # Then check: does the returned GeoJSON feature have any height/FAR/gabarit field?
  # Record: field names present, any numeric value, or only a PDF URL
  ```

### 3.2 — Brussels PRAS/RRU live access (bot detection)

- **What it is.** The `gis.urban.brussels/geoserver/PERSPECTIVE_FR/ows` endpoint is confirmed to
  exist and contain the correct layers (via third-party cache), but direct automated HTTP access is
  blocked by bot detection on the origin server.
- **Why it blocks.** Cannot independently verify: (a) live HTTP status, (b) current layer schema
  (attribute names for the PRAS zones), (c) licence terms (CC-BY or similar). Without these, a
  Brussels pack cannot be scoped.
- **What would unblock it (ascending cost).**
  1. Deploy a thin probe script from a Belgian-IP server (e.g. a Brussels-located VPS, or a Fly.io
     Brussels/AMS region with a Belgian-routed IP).
  2. Check whether the `geo.be` federal geoportal or another Belgian aggregate provides access to
     the same PRAS layer without bot detection.
  3. Contact urban.brussels directly for a service-account key or alternative access path.
- **THE EXACT RESUME STEP.** From a Belgian-IP server:
  ```bash
  curl -A "Mozilla/5.0 (compatible; PRYZM data probe)" \
    "https://gis.urban.brussels/geoserver/PERSPECTIVE_FR/ows\
  ?REQUEST=GetCapabilities&SERVICE=WFS" \
    | head -100
  ```

### 3.3 — Flanders DSI/GRB live access (robots.txt)

- **What it is.** The `geoservices.informatievlaanderen.be` domain disallows automated access via
  robots.txt. The DSI zoning layers (gewestplan + RUP) and GRB building layers are confirmed free
  ("kosteloos") and correct from search-engine cache of capabilities, but cannot be directly probed.
- **Why it blocks.** Same as Brussels: cannot verify current layer schema, attribute names, or
  whether plan-element features carry numeric voorschriften attributes rather than PDF links.
- **What would unblock it.**
  1. Check whether `www.mercator.vlaanderen.be` (a confirmed alternative public WFS portal for
     Flanders data) is NOT robots-restricted — it was confirmed in this pass as a separate endpoint.
  2. Check whether Digitaal Vlaanderen has a registered-user path or API key mechanism that
     authorises automated access (the "kosteloos" ("free") licence may not be the same as
     "robots-allowed").
- **THE EXACT RESUME STEP.** Check `mercator.vlaanderen.be` first (no robots.txt restriction known):
  ```bash
  curl "https://www.mercator.vlaanderen.be/raadpleegdienstenmercatorpubliek/wfs\
  ?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities" | head -200
  ```

### 3.4 — Per-region regime determination (prerequisite for all Belgian cities)

- **What it is.** Before numeric sourcing for any parcel, the pipeline must determine:
  - **Flanders:** is the parcel governed by a gewestplan designation, by a more recent RUP, or by
    neither? If by a RUP, does the voorschriften text state a numeric height ceiling, or leave it
    "vrij"? Is the provision post-2009 percentage-based and therefore potentially void under
    Art. 7.4.2/2?
  - **Wallonia:** which of the 23 plans de secteur governs? Has the commune adopted a GCU with real
    numeric content? (If not, bon-aménagement-des-lieux is the primary operative standard.)
  - **Brussels:** which of PRAS / RRU Titre I / RRUZ / PPAS / PAD governs this parcel's gabarit?
    (Three-way precedence check: PPAS/RRUZ/PAD override RRU; RRU is the regional default.)
- **Why it blocks.** Without this classification, there is no way to know whether a parcel has a
  numeric rule at all, or which legal instrument supplies it.
- **THE EXACT RESUME STEP.** Brussels (simplest regime check, one instrument priority order):
  verify whether a target Brussels address is inside a PPAS boundary — query the PPAS layer if
  accessible — then fall through to RRU Titre I as the default. This is the Brussels analogue of
  Germany's §30/§34/§35 classifier.

### 3.5 — Brussels LiDAR / UrbIS building height confirmation

- **What it is.** No standalone Brussels LiDAR programme was identified in this research pass. UrbIS
  is confirmed as a base map/WMS service but not as a LiDAR-derived building-height product.
- **Why it blocks.** Without a confirmed terrain/building height source for Brussels, a Brussels
  context-data LOD cannot be estimated.
- **THE EXACT RESUME STEP.** Search `bruxelles-environnement.be` and `irisnet.be` geoservices
  catalogues directly for "MNT", "MNH", "LiDAR", "hauteur" to identify whether Bruxelles
  Environnement or CIRB runs a standing LiDAR product.

---

## 4 — TRIP-WIRES (if you see X elsewhere, come back HERE and do Y)

- **4.1 — If any GIS framework builds a PDF-plan-provision OCR/extraction pipeline for any Belgian
  or French commune** → bring it back here and assess whether it works against Flemish RUP
  voorschriften PDFs and Brussels RRU Titre I text. Belgium's PDF-only height situation is identical
  in kind to France's GPU/PLU PDF situation — the same pipeline may serve both (§3.1).
- **4.2 — If a Belgian-IP proxy or Fly.io Brussels/AMS region is set up for any other purpose** →
  immediately run the Brussels PRAS/RRU GetCapabilities and GetFeature probes (§3.2). This is the
  single cheapest unblock available.
- **4.3 — If Wallonia's OGC API Features endpoint returns structured numeric attributes in a GetFeature
  response for any LU.ZoningElement feature** → this changes the Belgian rate ceiling materially
  and should immediately trigger the equivalent probe for Flanders and Brussels (§3.1). Update
  `RATE.md §4` ceiling analysis and the per-region estimate in §2.
- **4.4 — If Flanders' `lu_hov_*` layer (clichering tracking) can be queried live** → confirm
  whether it is granular enough to identify individual voided provisions per municipality, which
  would raise confidence tier (not raw fill rate) for any Flemish numeric value sourced via the DSI
  layer. Update §3.3 and `be-vlg/ant-antwerp/NEXT.md`.
- **4.5 — If the federal CADMAP building sublayer is probed and carries a height/storey attribute** →
  this is a free, nationally-consistent building-height source that does NOT require per-region
  integration. Update `RATE.md §4` immediately and raise the existing-building-height score.
- **4.6 — If a Brussels commune adopts a new PPAS or RRUZ after 2026-07-24** → a more recent numeric
  gabarit rule may supersede the RRU Titre I default for that commune. Update `be-bru/bru-brussels/`
  with the new instrument and its access path.
- **4.7 — If Wallonia's CoDT is amended further after May 2025** → re-read CoDT Art. D.IV.13 and the
  derogation provisions; the bon-aménagement-des-lieux test has been rewritten multiple times and
  any change in its scope or standard changes the discretionary-test characterisation in §A.3 of
  the master study.

---

## 5 — WHAT IS ALREADY BUILT (do not redo)

- National legal structure characterisation (all three codes, devolution history, discretionary test)
  — `findings/BELGIUM-MASTER-DATA-SOURCE-STUDY.md`
- Country-level README + RATE.md + NEXT.md — this file set
- National SOURCES.md with citations for all confirmed layers
- Federal cadastre WFS — VERIFIED LIVE 2026-07-24; single national endpoint confirmed
- Wallonia plan de secteur WMS + OGC API Features — VERIFIED LIVE 2026-07-24
- Flanders heritage (Onroerend Erfgoed) WFS — VERIFIED LIVE 2026-07-24
- Brussels PRAS layer catalogue — confirmed via third-party aggregator cache
- Flanders DSI/GRB layer catalogue — confirmed via search-engine cache of capabilities
- Per-region city stubs — `be-bru/bru-brussels/`, `be-vlg/ant-antwerp/`, `be-wal/lie-liege/`

---

## 6 — VERIFIED SOURCES (endpoint · what it answers · confidence tier · the exact query)

| Source | Answers | Tier | Exact query / note |
|---|---|---|---|
| `ccff02.minfin.fgov.be/geoservices/arcgis/rest/services/INSPIRE/CP/MapServer/exts/InspireFeatureDownload/service` | Federal cadastral parcels + building sublayers (national) | `VERIFIED-LIVE` 2026-07-24 | `?request=GetCapabilities&service=WFS&version=2.0.0` → HTTP 200 |
| `geoservices.wallonie.be/geoserver/inspire_lu/ows` | Wallonia plan de secteur zoning polygons + supplementary regulations + land use | `VERIFIED-LIVE` 2026-07-24 | `?service=WMS&version=1.3.0&request=GetCapabilities` → HTTP 200; OGC API Features also live |
| `geo.onroerenderfgoed.be/geoserver/wfs` | Flanders heritage — monuments, townscapes, archaeological sites, landscapes, buffer zones | `VERIFIED-LIVE` 2026-07-24 | `?request=GetCapabilities` → HTTP 200 |
| `gis.urban.brussels/geoserver/PERSPECTIVE_FR/ows` | Brussels PRAS zoning layers | `CACHED` — confirmed via wfs.michelstuyts.be aggregator | Direct fetch bot-blocked; Belgian-IP required |
| `geoservices.informatievlaanderen.be/overdrachtdiensten/GRB/wfs` + sibling DSI endpoints | Flanders gewestplan + RUP zoning + GRB buildings + clichering tracking | `CACHED` — confirmed from search-engine cache | Direct fetch robots-disallowed; `mercator.vlaanderen.be` alternative unconfirmed |
| VCRO (Vlaamse Codex Ruimtelijke Ordening), Art. 4.3.1, 7.4.2/2 | Flanders discretionary test; percentage-based provision nullification | `published` | `codex.vlaanderen.be` |
| CoDT (Code du Développement Territorial), Art. D.IV.13 | Wallonia discretionary test; derogation standard | `published` | `region.wallonie.be` / `walllex.be` (CoDT, reformed May 2025) |
| CoBAT + RRU (arrêté 3 June 1999 Titre I, re-adopted 21 November 2006) | Brussels planning code; RRU Titre I gabarit provisions | `published` | `urban.brussels` / Brussels Moniteur belge |
| Royal Decree 30 July 2018 (cadastral-parcel definition) | CADMAP parcel-plan definition; AGDP legal basis | `published` | Belgian Moniteur belge / SPF Finances |
| SPW Géoportail — "Patrimoine — biens classés et zones de protection" | Wallonia classified heritage + protection zones | `stated` — CC-BY 4.0 confirmed from catalogue | `geoportail.wallonie.be` catalogue |

---

## 7 — DEAD ENDS (measured negatives — do NOT re-run hoping)

- **Single national Belgian zoning API:** does not exist. Belgium has no GPU, no XPlanung, no PDM.
  Spatial planning is an exclusive regional competence; there is no federal zoning layer to find.
  Do not re-search for a "Belgian national zoning API."
- **Belgium-wide provision-code semantic catalogue:** does not exist in any region (confirmed
  absent from all three regional system capabilities in this pass). Do not assume Boverket-style
  Planbestämmelsekatalog exists; it does not.
- **Structured numeric height/FAR from Wallonia's plan de secteur:** the plan de secteur layer
  carries only broad affectation categories (zone d'habitat, activité économique, etc.) — confirmed
  from the full WMS capabilities document returned in this pass. The plan de secteur was never
  designed as a numeric-envelope instrument; do not probe for height attributes in this layer.
- **Direct automated access to `geoservices.informatievlaanderen.be`:** confirmed blocked by
  robots.txt in this pass. Do not retry the same endpoint from the same tooling; use the
  `mercator.vlaanderen.be` alternative instead.

---

## 8 — THE SMALLEST NEXT STEP that moves the number, and its cost

**Run the Wallonia plan de secteur GetFeature probe. Estimated: 0.5 dev-days.**

```bash
# Wallonia OGC API Features — fetch zoning feature for a Liège address
curl "https://geoservices.wallonie.be/geoserver/inspire_lu/ogc/features/v1/collections\
/inspire_lu:LU.ZoningElement_pds/items\
?bbox=5.565,50.630,5.575,50.635&limit=5\
&f=application%2Fgeo%2Bjson" \
  | python3 -m json.tool
```

**What each outcome implies:**

- Feature returned with a numeric height/FAR/gabarit attribute non-null → structured path exists
  for Wallonia; immediately probe Flanders and Brussels equivalents; raise RATE.md ceiling to ~25–30%.
- Feature returned with only zone-affectation text fields (no numeric height) + a PDF URL → confirms
  "PDF-only" finding for Wallonia; move to confirming the same for Flanders and Brussels; proceed
  to Brussels pack with RRU Titre I as the PDF-baseline.
- No feature returned (bbox miss) → try a larger bbox or a known Walloon commune centroid; confirm
  the WFS is actually returning features and not only a boundary/extent.
