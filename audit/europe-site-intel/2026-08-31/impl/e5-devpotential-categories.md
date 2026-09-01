# E5 LANE 2 — DEVELOPMENT-POTENTIAL: THE FOUR CATEGORIES (brief §4)

> E5 data-reuse investigation · lane `devpotential-categories` · researched 2026-09-01.
> Authority: `../E5-DATA-REUSE-BRIEF.md` §4 (four categories), §1 (A-vs-B separation, binding),
> §9 (no core expansion, binding). Baseline: the ORIGINAL audit lanes under `../lanes/` — cited
> as L2 (de-dk-ch), L3 (es-fr-pt), L4 (nl-pl-lt-ee), L5 (rest-of-europe sweep), L6 (oss+startups),
> plus REPORT.md (§A.2 standing verdict). THIS FILE IS THE DELTA: it does not re-derive what a
> lane already probed — it cites the lane row and extends.
>
> Category definitions (operational, this lane):
> **Cat 1 — raw planning data**: plan geometry/documents served machine-readably (zone polygons,
>   plan PDFs, indexes); numbers absent or document-bound.
> **Cat 2 — machine-readable rules**: the RULES themselves are typed data (numeric parameters,
>   coded enumerations) at zone/plan level — you still resolve applicability to a parcel.
> **Cat 3 — parcel-specific planning RESULT**: the state answers "for THIS parcel/plot: these
>   values/restrictions apply" (per-plot attributes, per-parcel extracts).
> **Cat 4 — PRECOMPUTED BUILDABLE ENVELOPE / development-capacity numbers**: the state (or a
>   semi-official body) has already COMPUTED the development potential — remaining building
>   right, buildable volume/3D envelope, capacity counts — and serves it.
> Boundary rule cat-3 vs cat-4: cat 3 serves the INPUTS resolved to the parcel; cat 4 serves the
> OUTPUT of a computation over those inputs (a subtraction, an extrusion, a capacity model).
>
> Every cat-4 claim below carries a live probe (PROBED + date) or an explicit NOT CONFIRMED.

## Status: COMPLETE 2026-09-01 — Part A (cat-4 hunt, 21 countries) · Part B (four-category matrix) · Part C (standing verdict re-tested: claim 2 HOLDS, claim 1 REFUTED)

## THE SIX THINGS A SYNTHESIS SHOULD TAKE FROM THIS LANE

1. **The standing verdict splits in two, and only half survives.** *"The envelope layer is
   state-served NOWHERE"* — **HOLDS on 21/21 countries** (§C.1). *"No country serves complete
   numeric envelope rules; the rules axis converges at 5–50% everywhere"* — **REFUTED as stated**
   (§C.2): the ceiling is wrong (LU **93.7–97.8%**), the floor is wrong (SI **0.5–1.1%**), and the
   shape is wrong (completeness fails on **three independent axes**, and every country fails a
   different one).
2. **Luxembourg is the find.** One CC0 GeoPackage, refreshed 2026-08-31, carries the national PAG:
   zones, **COS / CUS / CSS / DL as typed numeric columns at 93.7% strictly-positive fill on 3,017
   new-quarter zones**, overlays, building lines, servitudes, **and 653,315 cadastral parcels** —
   parcel → zone → numbers resolves inside one file (§A-13). Honest limits: **no height, no
   setbacks**; existing quarters (18,743 zones) are document-bound.
3. **Slovenia is the anti-find, and the more dangerous one.** The most complete envelope SCHEMA in
   Europe (FZ/FI/FZP/GP/V…) at **~1% fill, and the values that are present are SENTINEL ZEROS**
   (§A-18). A `DescribeFeatureType`-only audit would have crowned it. **Binding adapter rule:
   `0` means UNKNOWN.**
4. **Germany's extraction cost was misestimated.** NRW ships 87,736 Bauleitpläne as one open
   GeoPackage — **scanurl 100%, texturl 13.3%** (§A-16). The DE input is OCR over scanned drawings
   for ~87% of plans, not text parsing. Partial mitigation: **Bodenrichtwerte carry
   GFZ/GRZ/BMZ/Geschosszahl/Bauweise** (§A-15) — usable only as an explicitly-labelled
   valuation-model prior, never as a legal limit.
5. **Five state sources replace Pryzm WORK today (none replaces an envelope):** FI HSY SeutuRAMAVA
   (block reserve = right − used) · ES Madrid VEDA (**390 parcels**) · UK brownfield registers
   (37,670 sites, net dwellings) · IE RZLT (**296,293 parcels** + national `ZONE_GZT`) · LV VZD
   fz-šķēlumi (**180,691 zone × parcel intersections**, ~55% of the country).
6. **Category 4 exists in five shapes, none of them an envelope** (§B.1): remaining-right
   subtraction · capacity judgements · applicability determinations · valuation models that encode
   buildability · extruded visualisations. **The brief's premise — "if a country provides a
   precomputed envelope, Pryzm should not recreate it" — is answered: no country provides one.**

---

# PART A — THE CATEGORY-4 HUNT (probe-first; every claim probed or NOT CONFIRMED)

## A-1 · FI — HSY SeutuRAMAVA: PRECOMPUTED remaining building right per block — **CAT 4 CONFIRMED, PROBED 2026-09-01** ⭐
- **What it is:** "Pääkaupunkiseudun rakennusmaavaranto / tonttivaranto" (SeutuRAMAVA) — the
  Helsinki Region Environmental Services authority (HSY) COMPUTES, twice a year, the building-land
  reserve of every block in Helsinki/Espoo/Vantaa/Kauniainen from valid detail plans:
  **reserve = building right (rakennusoikeus) − used floor area (käytetty kerrosala)**.
- **PROBED 2026-09-01:** `https://kartta.hsy.fi/geoserver/wfs` GetCapabilities 200 (349 KB,
  keyless) — versioned layers per half-year back to 2015, newest
  `asuminen_ja_maankaytto:SeutuRAMAVA_kortteli_12026` (1/2026). GetFeature (count=1, GeoJSON) →
  block `0490100001` (Espoo): **`kala` 137777 (building right m²) · `karayht` 116900 (used
  floor area) · `laskvar_yh` 27659 (CALCULATED RESERVE total) split per use — `laskvar_ak` 20850
  (apartment blocks) · `laskvar_y` 6809 (public) — plus `rakerayht` 8092 (under-construction
  floor area) · `rekpvm` 20251219** (register date). The subtraction is DONE BY THE STATE BODY.
- **Licence:** CC BY 4.0 per HRI/avoindata.fi dataset pages
  (https://hri.fi/data/dataset/paakaupunkiseudun-tonttivaranto-kortteleittain-seuturamava,
  https://www.avoindata.fi/data/fi/dataset/paakaupunkiseudun-tonttivaranto-kortteleittain-seuturamava,
  checked 2026-09-01). Twice-yearly production. Also served per statistical area
  (SeutuRAMAVA tilastoalueittain) and — per HSY docs — a finer kaavayksikkö (plan-unit) level
  exists in the non-open SeutuCD tier (openness of that tier NOT CONFIRMED this lane).
- **Classification: CATEGORY 4 (development-capacity numbers, per-use, per-block), regional
  (4 municipalities), official, keyless, GREEN.** Limits: capacity NUMBERS not envelope GEOMETRY;
  block granularity in the open tier; Helsinki metro only. For Pryzm: consume as ground truth /
  cross-check for FI capacity computation — do NOT recreate the subtraction for these 4 kunnat.

## A-2 · ES — VEDA Madrid: per-parcel AVAILABLE edificabilidad, city-computed — **CAT 4 CONFIRMED, PROBED 2026-09-01** ⭐
- The L6 §3.8 lead ("hand to the ES data lane"), now closed with a live probe.
- **PROBED 2026-09-01:** geoportal dataset page (id `85497849-dgpe-eu-0001-87b3-fc8b28826a91`)
  names the services; ESRI REST
  `https://sigma.madrid.es/hosted/rest/services/ANALISIS_URBANO/Visor_Edificabilidad_julio2025/MapServer`
  → 200 keyless, layers: `Parcelas urbanísticas` (0) · `Parcelas Catastrales` (10) ·
  `Ambitos Vigentes Julio 2025` (12) · `Planeamiento_Vigente` (14) + per-stage layers
  (Desarrollo del Este…). Layer-0 query (outFields=*) returned a real parcel in ámbito
  **APR.16.04 "UVA DE HORTALEZA"**: **`UUBV_NM_ED = 3638.0` `UNI_TX_DEN = "m2 Plan"` — 3,638 m²
  of AVAILABLE edificabilidad — for `USP_TX_DEN = "RESIDENCIAL VIVIENDA COLECTIVA"`**, plus
  zoning ref (`ZURV_TX_NO`), protection flag, district, validity flag (`VALIDA = SI`).
- WMS twin: `...Visor_Edificabilidad_julio2025/MapServer?...service=WMS`. EPSG:25830. Updates:
  semiannual editions (enero/julio; enero-2026 edition exists —
  https://experience.arcgis.com/experience/63ae249db4014c6ebbec6a9d6beb5ac7). Licence: Madrid
  open-data aviso legal (https://datos.madrid.es/egob/catalogo/aviso-legal) — attribution-style
  reuse; VERBATIM terms not read this lane (YELLOW-GREEN pending that read).
- ⛔ **SCOPE CORRECTED 2026-09-01 (re-probed this lane; the earlier entry did not state a
  denominator, and the denominator is the whole story).** Server-side counts on the same service:
  **layer 0 `Parcelas urbanísticas` holds 391 features in total — 390 of them with
  `UUBV_NM_ED > 0`** (`.../MapServer/0/query?where=1=1&returnCountOnly=true` → `{"count":391}`;
  `where=UUBV_NM_ED>0` → `{"count":390}`; `VALIDA='SI'` → 391). For contrast on the same service:
  layer 10 `Parcelas Catastrales` **1,080** · layer 12 `Ambitos Vigentes Julio 2025` **717** ·
  layer 14 `Planeamiento_Vigente` **39,745** · layers 7/8 are the single-polygon Desarrollo del
  Este stage-1 areas (Los Ahijones, Los Berrocales). **So the precomputed edificabilidad payload
  is ~390 urbanistic parcels, not "Madrid".** The payload sample re-verified identically on
  re-probe (`UUBV_NM_ED 3638.0 · "m2 Plan" · RESIDENCIAL VIVIENDA COLECTIVA · ZURV_TX_NO "RB" ·
  VALIDA "SI"`). **Do not let this row travel as "Madrid serves per-parcel edificabilidad" —
  it serves it for a few hundred development parcels.**
- **Classification: CATEGORY 4 (precomputed available-buildability m² per parcel per lucrative
  use), MUNICIPAL scope (Madrid city), and further scoped to ámbitos de ordenación under the
  PGOUM (development areas) — NOT the whole consolidated urban fabric.** For Pryzm: this is
  exactly the "permitted − consumed" delta Pryzm computes; in Madrid's ámbitos the city already
  serves it. Consume as calibration/ground truth for the ES permitted-GFA path; note it
  complements (not replaces) the NZ-ring work — consolidated-city parcels stay rule-derived.

## A-3 · LT — TPDR 3D permitted-height VOLUMES — **CAT 4 (3D envelope visualisation) CONFIRMED at service level, PROBED 2026-09-01**
- L4 LT-2 recorded these as DOC-ONLY (from the VTPSI spec). Delta: **live directory + service
  probe.** `https://tpdr.planuojustatau.lt/arcgis/rest/services/duomenu_viesinimas?f=json` →
  lists **8 SceneServer services** (`b_mstd_dp_reglam_z_max_auk_m`, `b_sav_bp_funkc_max_auk_m`,
  `b_savd10000_bp_tipas/funkc_stat_auk`, `k_d_dp_reglam_z_max_auk_m`, …) alongside ASGR/ribos/
  sprendiniai. `b_mstd_dp_reglam_z_max_auk_m/SceneServer?f=json` → 200, layer 0 **"Teritorijos
  naudojimo reglamentas (B_MSTD - MAX_AUK_M)", layerType `3DObject`** — regulation zones EXTRUDED
  by permitted height, served as 3D objects by the state, keyless.
- **Classification: CATEGORY 4-geometry (a state-served 3D buildable-height envelope), national,
  BUT: it is a VISUALISATION product (ESRI Multipatch/I3S), extruded from terrain by MAX_AUK_M
  only — no setbacks, no coverage, no FAR shaping; and ASGR value fill is ~14–18% (L4 LT-1).**
  Pryzm verdict stands as L4 wrote it: consume the ATTRIBUTES (ASGR), not the Multipatch; but for
  the report, Lithuania is the one EU state serving any precomputed 3D envelope layer at all.

## A-4 · UK (England) — statutory brownfield-land registers: per-site DWELLING-CAPACITY numbers — **CAT 4 (capacity numbers) CONFIRMED, PROBED 2026-09-01**
- **PROBED 2026-09-01:** `https://www.planning.data.gov.uk/entity.json?dataset=brownfield-land&limit=1`
  → 200, **count 37,670 sites**; the first entity carries **`minimum-net-dwellings 15` ·
  `maximum-net-dwellings 15` · `hectares 0.26` · `deliverable yes` · `ownership-status` ·
  `planning-permission-status permissioned` · `quality authoritative`** + point geometry +
  site-plan URL. Statutory basis: Brownfield Land Registers Regulations 2017 (each LPA must
  publish; the national platform aggregates). Licence OGL v3 (L5 UK row). England-only,
  self-declared incomplete (L5).
- **Classification: CATEGORY 4 (development-capacity numbers per site — net dwellings), national
  aggregation of LPA-computed values.** Consistent with L5's structural verdict (no by-right
  envelope in a discretionary system): the state cannot serve an envelope, so it serves
  CAPACITY JUDGEMENTS instead. For Pryzm: a UK Product-A enrichment layer, not an envelope source.

## A-5 · NL — provincial plancapaciteit monitors: planned-dwelling capacity — **CAT 4-adjacent (pipeline capacity, not rule-derived), searched 2026-09-01**
- `plancapaciteit.nl` (Monitor Plancapaciteit — Noord-Holland + Flevoland, MRA) and
  `planmonitorwonen.nl` (other provinces, e.g. Overijssel) collect per-location housing-plan
  capacity (hard/soft plans, dwelling counts); GIS shapefiles + a national "Inventarisatie
  Plancapaciteit" roll-up (ABF/BZK). Dataset registered on data.overheid.nl
  ("Woningbouwplannen", https://data.overheid.nl/en/dataset/17863-woningbouwplannen;
  Overijssel vlakken dataset 63369; checked 2026-09-01, catalog-level — services NOT probed).
- **Honest classification: these are MUNICIPALLY DECLARED housing-pipeline counts, not
  computed-from-rules buildability** — capacity of PLANS, not of LAND under rules. Cat 4 by the
  brief's letter ("development-capacity numbers"), but methodologically declarative (survey), not
  a precomputed envelope. Pryzm use: demand/context signal, NOT an envelope substitute. The
  rule-derived envelope for NL remains Pryzm-DERIVED from IMOW/IMRO numbers (L4 NL-1, NL-5).

## A-6 · FR — UrbanSIMUL (Cerema/INRAE): national parcel-level constructibility model — **CAT 4 EXISTS, ACCESS-GATED (public actors only), checked 2026-09-01**
- `https://urbansimul.cerema.fr/` — national tool over 5M+ parcel/unite-fonciere records:
  "gisements fonciers potentiels", constructibility scoring, "capacites constructives" modelled
  with ML + spatial statistics; free — **but access restricted to "acteurs publics de la
  planification et du foncier et a leurs prestataires"** (urbansimul.cerema.fr/a-propos +
  /presentation + cerema.fr flyer, checked 2026-09-01). No open API/bulk found; outputs not
  redistributable to a commercial SaaS by default.
- **Classification: CATEGORY 4, state-computed, IDENTITY/ELIGIBILITY-GATED — record the gate, not
  "missing" (SE/DK lesson).** Two consequences for Pryzm: (a) the French state already believes
  parcel-level constructibility is computable from open inputs (validation); (b) a possible
  side-door is acting as *prestataire* of a collectivite on a project basis — a partnership
  question, not a data-adapter question. NOT a consumable source today. Related open output:
  Cerema's "Cartofriches" (friches inventory) — site inventory, no capacity numbers (not probed).

## A-7 · CH — capacity models exist at three levels, none open at parcel level — checked 2026-09-01
- **ARE Bauzonenstatistik Schweiz** (https://www.are.admin.ch/de/bauzonenstatistik-schweiz,
  checked 2026-09-01): national statistics incl. UNBUILT building-zone shares (2022: 234,337 ha
  total; ~11–17% unbuilt) — aggregate, canton/commune level, open. **CAT 4 at the WRONG
  granularity** (no parcel numbers).
- **Raum+ (ETH Zurich)** (raumplus.ethz.ch): the methodology behind several cantons' parcel-level
  "Siedlungsflachenreserven" (inner-development reserves incl. floor-area reserves). Platform
  access is CANTON-INTERNAL (survey tool with municipalities) — **CAT 4 EXISTS, GATED; no open
  dataset found** (checked 2026-09-01; NOT CONFIRMED as machine-consumable anywhere).
- Canton Zurich Raumbeobachtung + opendata.swiss `bauzonen-im-kanton-zurich`: open zone data +
  indicators; per-parcel capacity NOT served openly (catalog check 2026-09-01).
- Private: Amenti (L6 §3.3, human-in-loop 1-hour feasibility) — the commercial cat-4 for CH.
- **CH verdict: consume ARE statistics as context; the parcel-level capacity layer remains
  Pryzm-DERIVED (consistent with L2 CH-6: numerics are Reglement-PDF-bound).**

## A-8 · DK — Vurderingsstyrelsen land-valuation model ENCODES buildability — **CAT 4-adjacent (value-assessment model), checked 2026-09-01; parameter exposure NOT CONFIRMED**
- The brief explicitly asks for "cadastre value-assessment models that encode buildability".
  Denmark's new property-valuation system is exactly that: grundvaerdi is computed from the
  parcel's **"bedste okonomiske planlagte anvendelse og udnyttelse"** — best economic use AND
  utilisation drawn from **Plandata + BBR** (vurderingsportalen.dk "Sadan fastsaetter vi
  grundvaerdi", retsinformation SKR 10145 03/12/2024; checked 2026-09-01). Where the plan basis
  allows multiple uses, a value is computed PER USE and the highest wins — i.e. the state runs a
  per-parcel highest-and-best-use computation over the same Plandata fields Pryzm consumes
  (L2 DK-1).
- Distribution: **Ejendomsvurdering (VUR) is a Datafordeler dataset**
  (https://datafordeler.dk/dataoversigt/ejendomsvurdering-vur/ejendomsvurdering/, checked
  2026-09-01) — free, key-gated like BBR (L2 DK-3). **NOT CONFIRMED this lane: whether VUR
  exposes the model's INPUT parameters (assumed byggeret/udnyttelse per use) or only the
  resulting values.** Schema read owed at DK adapter time.
- **Pryzm use: cross-check oracle** — a state-computed utilisation judgement per parcel to
  validate the DK envelope path's plan-layer precedence (byggefelt→delomrade→lokalplan→ramme,
  L2 DK-1). Not a rules source.

## A-9 · BE (Flanders) — "vermoedelijk ROP": state-computed register of buildable unbuilt parcels — **CAT 4 (site inventory, semi-automatic), checked 2026-09-01; open geodata NOT CONFIRMED**
- Departement Omgeving computes since 2019 a SEMI-AUTOMATIC "suspected register of unbuilt
  parcels" (vermoedelijk ROP) — ~**43,800 ha of unbuilt residential-zoned parcels** — alongside
  the statutory municipal ROP (register onbebouwde percelen)
  (https://omgeving.vlaanderen.be/nl/onbebouwde-percelen +
  /nl/dataverrijking-van-de-database-onbebouwde-percelen +
  https://indicatoren.omgeving.vlaanderen.be/indicatoren/onbebouwde-woonpercelen, checked
  2026-09-01). Parcel-level identification of WHERE development is legally possible = the
  applicability half of cat 4, computed by the region.
- **NOT CONFIRMED: whether the parcel-level layer is served as open geodata** (indicator pages
  are aggregate; Geopunt/datavindplaats record not located this lane). No capacity NUMBERS
  (dwellings/GFA) claimed. Flag for the BE adapter: one catalog query owed.

## A-10 · DE — Baulandkataster (§200(3) BauGB): per-city development-potential registers — **CAT 4 (site inventory), per-city, checked 2026-09-01; NOT machine-standardised**
- §200(3) BauGB lets municipalities publish Baulandkataster/Bauluckenkataster (building-gap and
  potential-site registers). Verified current examples (checked 2026-09-01): Dusseldorf serves a
  **WMS** (geoportal.de record 2d65c051-9d08-4031-ac46-bd1289296940); Aachen, Bonn, Detmold,
  Braunschweig, Aalen, Saarbrucken publish city registers; Brandenburg ran a 2024 state pilot for
  a digital Baulucken-/Potenzialflachenkataster (mil.brandenburg.de 2024-09-13); Hessen runs a
  state "Flachenpotenzial" cadastre programme.
- **Classification: CAT 4 site inventories, OPT-IN PER CITY, mostly viewer/WMS grade, no common
  schema, rarely with capacity numbers.** Not a consumable national layer; where a launch city
  has one, ingest as candidate-site enrichment. (Syte GmbH remains the private DE cat-4 — L6 §3.1.)

## A-11 · SE — Skatteverket/Lantmateriet riktvarde model: the state PRICES byggratt per value zone — **CAT 4-adjacent (value model), checked 2026-09-01; quantity NOT served**
- Property taxation of flerbostadshus land values byggratt at **kr/m2 BTA per value area**;
  the zones + value indications ship as a Lantmateriet vector product
  ("Riktvardeomraden med riktvardeangivelser, vektor" —
  https://www.lantmateriet.se/sv/geodata/vara-produkter/produktlista/riktvardeomraden-med-riktvardeangivelser-vektor/;
  Skatteverket rattslig vagledning riktvardekartor; both checked 2026-09-01, catalog/doc level).
- **Honest limit: the model prices the VALUE of a m2 of building right; the QUANTITY of byggratt
  per property comes from the detaljplan/declaration — not served here.** So this encodes
  buildability ECONOMICS, not an envelope. Pryzm use: monetisation/context layer only. The SE
  rules source remains NGP detaljplaner + Planbestammelsekatalogen (L5 SE row).

## A-12 · NO / PL — capacity computed inside planning PROCESSES, not served as data — checked 2026-09-01
- **NO:** "fortettingspotensial"/"utbyggingspotensial" analyses exist as per-kommune planning
  studies (regjeringen.no knutepunkt report; Geonorge DOK catalog) — **no state dataset of
  parcel-level development capacity found; NOT CONFIRMED as data.** Tomtly (L6 §3.11) is the
  private automation proof that reguleringsplan BYA/height retrieval per address works.
- **PL:** "chlonnosc" (absorption capacity) + "bilans terenow" are STATUTORY COMPUTATIONS the
  gmina must run for the plan ogolny (70–130% of demand rule, 2015 amendment lineage; POG
  justification documents) — the state computes capacity but publishes it inside PLAN DOCUMENTS,
  not as machine-readable data. **NOT CONFIRMED as served data anywhere.** Private report
  vendors (OnGeo "potencjal inwestycyjny" — L6 §3.9) fill the gap commercially.

## A-13 · LU — the national PAG GPKG: COS/CUS/CSS/DL as typed numeric columns at 93.7% strictly-positive / 97.8% non-null fill — **CAT 2 AT NEAR-COMPLETE FILL, PROBED 2026-09-01** ⭐⭐ THE VERDICT-REFUTING FIND
- L5 listed LU in the "structured-plan family" as "PAG national GML" — plan GEOMETRY through one
  national channel. **The delta: the numbers are in there, typed, and nearly all filled.**
- **PROBED 2026-09-01 (full download + schema read, not a capabilities sniff):**
  `https://data.public.lu/api/1/datasets/?q=PAG` → **95 datasets, every one `cc-zero`**, one of
  them the national shortcut `pag-geometries-de-tous-les-pag-version-2011-en-vigueur`
  (last_update **2026-08-31T02:35Z** — one day before this probe).
  Resource `https://download.data.public.lu/resources/pag-geometries-de-tous-les-pag-version-2011-en-vigueur/20260831-023526/pag.gpkg.zip`
  → HTTP 200, **259,912,001 bytes**, unzipped **617 MB GeoPackage**, read directly via `sqlite3`.
- **27 feature classes, national, one schema** (per the règlement ministériel 01/07/2016 graphic-
  part model + RGD 08/03/2017 content model). Row counts measured this probe:

  | layer | rows | what it carries |
  |---|---:|---|
  | `PAG_PAG_ZONAGE` | 46,191 | base zones, **nationally coded** `CATEGORIE` (HAB_1 11,661 · FOR 10,461 · AGR 7,006 · MIX_v 3,543 · BEP 3,286 · HAB_2 1,855 · MIX_u/r/c · ECO_c1/r/n · JAR · REC · VIT · PARC · SPEC · GARE · COM) |
  | **`PAG_PAG_NQ_PAP`** | **3,017** | **`COS_MIN/COS_MAX` · `CUS_MIN/CUS_MAX` · `CSS_MAX` · `DL_MIN/DL_MAX`** + `DENOMINATION` + written-part filenames |
  | `PAG_PAG_ZONES_QE` | 18,743 | existing-quarter zones — **no numerics**, only `NOM_FICHIER_EC/GR` (DOCX written part) |
  | `PAG_PAG_ZONES_SUPERPOSEES` | 8,027 | overlays, coded `CATEGORIE` |
  | `PAG_PAG_ALIGN_A_RESP` | 2,442 | **alignments to respect = building lines, as geometry** |
  | `PAG_PAG_CONST_A_CONS_POLY/LIGNE/POINT` | 13,269 / 804 / 2,655 | constructions to preserve |
  | `PAG_PAG_GABARIT_A_SAUV_POLY/POINT` | 7,057 / 66 | gauges to preserve |
  | `PAG_PAG_COULOIRS_ET_ESP_RES` | 1,172 | reserved corridors, with **`LARGEUR` (width)** |
  | `PAG_PAG_ZONE_SERV_URB` | 5,743 | servitudes urbanistiques (`CODE`,`LIB`) |
  | `PAG_PAG_PAP_APPROUVE` | 2,252 | approved PAPs |
  | `PAG_PAG_ZAD` | 583 | zones d'aménagement différé |
  | `PAG_PAG_FOND_DE_PLAN` | **653,315** | **cadastral parcels with `NUM_CADAST` — the parcel base ships INSIDE the planning dataset** |
  | `PAG_PAG_BATIMENT` | 214,335 | building footprints (plan base) |
  | `PAG_PAG_PERIMETRE` | 1,418 | plan perimeters · `LIMITES_COMMUNALES` 95 |
  | `PAG_INFORMATIONS_SUPPLEMENTAIRES_*` | 32,939 | supplementary info (coded) |
  | `PAG_ARTIKEL17_BIOTOPE_*` | 1,065 | biotope protection |

- **MEASURED FILL on `PAG_PAG_NQ_PAP` (n=3,017, 94 distinct `CODE_COM`):**
  `COS_MAX` **3,010 / 99.8%** (range 0.0–1.0) · `CUS_MAX` **3,010 / 99.8%** (0.0–10.0) ·
  `CSS_MAX` **3,010 / 99.8%** (0.0–1.0) · `DL_MAX` **2,950 / 97.8%** (0.0–500 dwellings/ha) ·
  minima sparser by design (`COS_MIN` 46.0% · `CUS_MIN` 51.6% · `DL_MIN` 52.5%).
  **ALL FOUR MAXIMA PRESENT (non-null) TOGETHER: 2,950 of 3,017 = 97.8%.**
  ⭐ **AND THE ZEROS WERE CHECKED — they are MEANINGFUL, unlike Slovenia's (A-18).** Strictly
  positive: `COS_MAX>0` **2,998 / 99.4%** · `CUS_MAX>0` **2,998 / 99.4%** · `CSS_MAX>0` **3,000 /
  99.4%** · `DL_MAX>0` **2,827 / 93.7%**; **all four strictly positive together: 2,826 = 93.7%.**
  The 12 rows with `COS_MAX=0` are all **ZAD** (zones d'aménagement différé — deferred-development
  zones, e.g. `'Beyren B07 - Kallek (ZAD)'`), where a zero degré d'utilisation is the CORRECT
  statement, not a placeholder; the 123 `DL_MAX=0` rows are non-residential zones. Likewise the
  sparse minima are mostly a genuine "no minimum" (`COS_MIN` 1,345 of 1,389 non-nulls are 0).
  **Quote 93.7% (strictly positive, the conservative figure) or 97.8% (non-null) — say which.**
  Real rows: `('Ell - Um Bierg','C116', COS_MAX 0.5, CUS_MAX 0.7, CSS_MAX 0.75, DL_MAX 30.0)` ·
  `('Helfent - Route de Longwy-Ouest (PAP approuvé REF16354/61C)','C061', COS 0.0–0.75,
  CUS 0.0–1.4, CSS 0.9, DL 0.0–65.0)`.
- **Classification: CATEGORY 2 at a fill rate no other audited country approaches** — the RULES
  are typed data (coverage COS, floor-area ratio CUS, sealing CSS, dwelling density DL), national,
  CC0, one file, monthly-fresh, and joinable to parcels **without leaving the dataset**
  (`FOND_DE_PLAN.NUM_CADAST`). It is **not** cat 4: no envelope is computed, and **no max HEIGHT,
  no setback distances, no storey count** are in the model — those live in the PAP / the DOCX
  written part. And its scope is **PAP-"nouveau quartier" zones only**: the 18,743 `ZONES_QE`
  (existing quarters — where most buildable land in a mature country actually is) carry **zero
  numerics** and remain document-bound, exactly as L5 described the rest of Europe.
- **This is the single most valuable data-reuse find of the lane. See PART C — it refutes the
  standing verdict's universality.**

## A-14 · IE — Residential Zoned Land Tax national map: 296,293 state-determined developable parcels — **CAT 4 (applicability determination, no capacity numbers), PROBED 2026-09-01**
- Ireland has **no cadastre by design** (L5 synthesis #3) and a discretionary planning system, so
  a rules/envelope layer is structurally absent. What the state DOES compute and publish is the
  statutory RZLT determination: *this parcel is zoned residential AND serviced ⇒ developable ⇒
  taxable* — the **applicability half** of development potential, decided per parcel by the local
  authority and aggregated nationally.
- **PROBED 2026-09-01:**
  `https://services.arcgis.com/NzlPQPKn5QF9v2US/arcgis/rest/services/Residential_Zoned_Land_Tax_Final_Map2026_view/FeatureServer/0`
  → 200 keyless; `?where=1=1&returnCountOnly=true` → **`{"count":296293}`**; layer name
  *"Residential Zoned Land Tax - Final Map for 2026 - Publication date: 2026-01-31"*,
  `lastEditDate` 2026-02-06, EPSG:2157. Fields: `PARCEL_ID · LOCAL_AUTHORITY(_NAME) · DATE_ADDED ·
  ZONE_ORIG · ZONE_DESC · ZONE_GZT · GZT_DESC · SITE_AREA · STATUS · LIVE_SITE`. Real feature:
  `PARCEL_ID "CWLABA2" · Carlow County Council · ZONE_ORIG "New Residential" · ZONE_GZT "R1" ·
  GZT_DESC "New / proposed residential, medium density" · SITE_AREA 1.145583 (ha) · STATUS 3 ·
  LIVE_SITE "Y"`.
- ⭐ Note `ZONE_GZT`: the national **Generic Zoning Type** vocabulary (myplan.ie GZT — L5 IE row)
  is carried on every parcel, so a per-parcel harmonised zone code exists nationally **despite**
  there being no cadastre. Licence: data.gov.ie / DHLGH open data, statutory basis Finance Act
  2021 (RZLT). 30 of 31 local authorities in the 2026 final map (per the dataset page).
- **Classification: CATEGORY 4 as an APPLICABILITY determination — NOT capacity numbers**
  (no dwelling counts, no GFA; contrast UK A-4 which does carry net-dwellings). Honest sibling of
  BE-Flanders ROP (A-9) and DE Baulandkataster (A-10), but **national, statutory, per-parcel, and
  openly served** — the best-plumbed of the three. Pryzm use: IE candidate-site + zone-code
  enrichment; the envelope stays Pryzm-derived from the development-plan document.

## A-15 · DE — Bodenrichtwerte carry GFZ / GRZ / BMZ / Geschosszahl / Bauweise as TYPED FIELDS — **CAT 4-adjacent (valuation model that encodes buildability), SCHEMA + VALUES PROBED 2026-09-01** ⭐
- This is the brief's "cadastre value-assessment models that encode buildability" clause, and in
  Germany it is **statutory and nationwide**: §196 BauGB obliges every Gutachterausschuss to
  derive Bodenrichtwerte; the BRW-Richtlinie / ImmoWertV §16(4) define the *beitragsfreie
  Grundstücksmerkmale* of the fictitious reference plot — among them the **GFZ**.
- **PROBED 2026-09-01 (Hamburg, chosen because its BRW WFS is open and keyless):**
  `https://geodienste.hamburg.de/HH_WFS_Bodenrichtwerte?service=WFS&request=GetCapabilities&version=2.0.0`
  → 200, 5 feature types (`app:lgv_brw_zoniert_alle`, `app:lgv_brw_zonen_2026`, …).
  **`DescribeFeatureType` on `app:lgv_brw_zoniert_alle` → the schema contains, verbatim:**
  `geschossfl_zahl` (GFZ) · `grundfl_zahl` (GRZ) · `baumassenzahl` (BMZ) · `geschosszahl` ·
  `bauweise` · `grdstk_tiefe` · `grdstk_breite` · `grdstk_flaeche` · `entwicklungszustand` ·
  `beitragszustand` · `nutzungsart` · `richtwert_euro` · `normrichtwert` · `baublock`.
  **Real values (GetFeature, `jahrgang=2026` filter, 800 features):**
  `nutzung_kombiniert "BH Bürohäuser" · richtwert_euro 4412.00 · geschossfl_zahl 3.30 ·
  entwicklungszustand "B Baureifes Land"`; also 7.40 and 4.00 on other office zones.
- **Honest fill:** the 800-feature slice is dominated by agricultural zones (EGA 278 · F 175 ·
  GR 152 · A 116, all with GFZ empty by definition); of the 79 `M` rows, 11 carry GFZ and 54
  carry `bauweise`. **A representative national fill rate is NOT CONFIRMED and was not measured
  this lane** — the confirmed facts are (a) the fields exist in the standard model and (b) they
  are populated for building-land zones.
- ⛔ **The overstatement trap, stated explicitly:** these are **wertrelevante** characteristics of
  a *fictitious reference plot* — what the valuation ASSUMES is prevailing/achievable in the zone
  — **not** the binding Festsetzung for any individual parcel. Reading `geschossfl_zahl` as "the
  permitted GFZ here" is precisely the class of error [[envelope-solid-overstates-partial-data]]
  and the never-overstate gate exist to stop. Legitimate uses: a **prior / plausibility band /
  cross-check**, and a labelled *"valuation-model assumption, not a legal limit"* fallback where
  no B-Plan text exists — which, per A-16, is **86.7% of NRW's plans**.
- Openness varies by Land (NRW `opengeodata.nrw.de/produkte/infrastruktur_bauen_wohnen/boris/BRW/`
  ships `BRW_EPSG25832_Shape.zip`, 223 MB, timestamped **2026-09-01T02:37Z**, plus 15 historical
  vintages 2011–2025 and a `BRW_Datenmodell.pdf` v4.1; Hamburg via the WFS above). Per-Land
  licence terms NOT read this lane.

## A-16 · DE — NRW serves 87,736 Bauleitpläne statewide as ONE open GeoPackage — but only 13.3% link a TEXT document — **CAT 1 at Land scale, MEASURED 2026-09-01** ⭐
- L2 DE-1 characterises DE as "a PDF-extraction country with an 82k-plan machine-served document
  index and structured XPlanGML only in MV-class Länder". **Delta: the largest Land now ships its
  own statewide plan index as an open GeoPackage, and it is measurable.**
- **PROBED 2026-09-01 (full download + schema read):**
  `https://www.opengeodata.nrw.de/produkte/infrastruktur_bauen_wohnen/bauleitplanung/bplan_EPSG25832_GeoPackage.zip`
  → 200, **196,350,070 bytes**, timestamp **2026-03-25**. (Note the catalog JSON at
  `.../bauleitplanung/` implies a `bplan/` sub-path that **404s** — the file sits one level up.
  A directory listing is not a download URL; probe the file, not the folder.)
- **`PlaeneNachBauGB` = 87,736 rows** across **277 distinct `gkz`** (of NRW's 396 municipalities),
  columns `planid · levelplan · name · kommune · gkz · nr · besch · aend · aendert · stand ·
  planart · datum · scanurl · texturl · legendeurl · sonsturl`.
  **MEASURED FILL:** `scanurl` **87,736 / 100.0%** · `datum` 100% · `stand` 100% · `levelplan`
  100% · `planart` 93.7% · **`texturl` 11,657 / 13.3%** · `legendeurl` 8,856 / 10.1% ·
  `sonsturl` 11,208 / 12.8%. `stand=4000` (in force) on **84,059 = 95.8%**.
  `planart` uses the XPlanung codelist (1000 → 38,740 · 10001 → 27,863 · 9999 → 7,943 · null 5,527).
  Sibling `bplanlinks_CSV.zip` (19 KB) maps municipality → its own plan portal.
- **The load-bearing number is 13.3%.** Every plan has a **scan** (raster PDF); fewer than one in
  seven has a linked **text** document. So the DE extraction pipeline's real input is OCR over
  scanned drawings for ~87% of plans, not text parsing — a materially different (and more
  expensive) engineering problem than "extract from PDF". **This belongs in the E5 irreducible-work
  section**, and it is the strongest single argument for the A-15 Bodenrichtwert prior as a
  labelled fallback.
- **Classification: CATEGORY 1 (plan geometry + document index, no numerics), Land-wide, open.**
  Not cat 2: no GRZ/GFZ/height column exists anywhere in the GeoPackage.

## A-17 · AT — Vienna encodes the Bauklasse INSIDE the zone code; the numbers live in the Bauordnung — **CAT 2 BY CODE→STATUTE JOIN, PROBED 2026-09-01**
- **PROBED 2026-09-01:** `https://data.wien.gv.at/daten/geo?service=WFS&request=GetCapabilities&version=1.1.0`
  → 200 (266 KB). Grepping the feature-type names for zoning terms returns **exactly one**
  planning layer: **`ogdwien:GENFLWIDMUNGOGD`** (plus `HOEHENLINIEOGD`, `HOEHENFESTPKTADRIAOGD`
  — survey height lines/points, problem A not B). GetFeature (GeoJSON, EPSG:4326) → real polygon:
  `WIDMUNGSKLASSE "WO" / "Wohngebiet" · **WIDMUNG "W1" / "Wohngebiet Bauklasse 1"** · BEZIRK 21 ·
  FLAECHE 12100.4 · UMFANG 693.5` + nulls for `WIDMUNG_DETAIL`, `SO_BAULICH_NUTZ`,
  `BEFRISTUNG_DATUM/PD`.
- MA 21's published product set (wien.gv.at/stadtentwicklung/flaechenwidmung/geodaten.html,
  checked 2026-09-01) is exactly three items: **"Flächenwidmungs- und Bebauungsplan" as WMTS
  (raster)**, **"Generalisierte Flächenwidmung" as Shapefile/WFS (the layer above)**, and
  **"Plandokumentsgrenzen" as WMS**. **No vector dataset carries Bebauungsbestimmungen** —
  confirmed by the capabilities grep, not merely by the page's silence.
- **Classification: CATEGORY 2 by CODE→STATUTE JOIN.** The zone value `W1` names a *Bauklasse*,
  and the Bauklassen are numerically defined in the **Wiener Bauordnung** (BO für Wien §75 — the
  height bands per class). So the height band IS machine-derivable from the zone code via a fixed
  statutory table — the same shape as L5's CY zone-coefficient join, and the same shape as PRYZM's
  existing rule-pack pattern. **But the layer is explicitly "generalisiert"**: the per-site
  Bauklasse, Bauweise (offen/geschlossen/gekuppelt), building lines and Bebauungsdichte remain in
  the WMTS raster + the plan-document PDFs. Licence CC BY 3.0 AT (L5 probe ledger).
- **Not cat 3 or 4:** nothing resolves the applicable class to a specific parcel with authority,
  and Vienna's 3D **Baukörpermodell** — despite the suggestive name — is the **as-is** building
  model (problem A per brief §1), not a permitted-envelope model. Do not conflate them.

## A-18 · SI — a COMPLETE national numeric-envelope SCHEMA at ~1% FILL, and the filled values are SENTINEL ZEROS — **MEASURED 2026-09-01** ⭐ (the exact counterpoint to A-13)
- L5 lists SI in the structured-plan family as "national land-use WFS". **Delta: the WFS carries the
  full numeric envelope vocabulary — and it is almost entirely empty, in a way that will silently
  overstate if consumed naively.**
- **PROBED 2026-09-01:** `https://ipi.eprostor.gov.si/wfs-si-mnvp-pa/wfs?service=WFS&request=GetCapabilities&version=2.0.0`
  → 200 (97 KB), **7 feature types**: `SI.MNVP.PA:NRP_OPN` (namenska raba) · `EUP_OPN` ·
  `PEUP_OPN` · `REG_POVRSINE_OPN` · `REG_CRTE_OPN` · `OBM_PA_V_PRIPRAVI` · `OBM_PA_ZAKLJUCENI`.
  Licence **CC BY 4.0**, national, "continual" update (metadata record
  `https://eprostor.gov.si/imps/srv/api/records/c621af69-132f-47c0-80f0-0e03ad37ab12`). EPSG:3794.
- **`DescribeFeatureType` on `NRP_OPN` → the attribute set is, verbatim:**
  `FI_MIN · FI_MAX` (faktor izrabe = FAR) · `FZ_MIN · FZ_MAX` (faktor zazidanosti = coverage) ·
  `FZP_MIN · FZP_MAX` (green-space factor) · `GP_MIN · GP_MAX · GP_P_MIN/MAX · GP_R_MIN/MAX`
  (building-plot size) · `E · P · S · V · VF · VK · VN · VP · VS · VZZ · STR` (storey/height/roof
  slots) · `NRP_OZN · NRP_OPIS · NRP_RAVEN · EUP_OZN · PEUP_OZN · ODRN_OZN · UON_OZN · OPPN_P ·
  NAZIV_PA · DATUM_VEL`. **On paper this is the most complete envelope schema found anywhere in
  the audit — more complete than Luxembourg's.**
- **MEASURED FILL (server-side `resultType=hits` with `PropertyIsGreaterThan 0` — a count, not a
  sample):** `NRP_OPN` total **403,788** polygons (`EUP_OPN` 101,556).
  **`FZ_MAX > 0` → 4,301 (1.07%)** · **`FI_MAX > 0` → 2,436 (0.60%)** · `FZP_MIN > 0` → 3,776
  (0.94%) · `VZZ > 0` → 4,591 (1.14%) · `GP_MAX > 0` → 2,128 (0.53%) · **`V > 0` → 0 (the height
  field is populated NOWHERE in the country).**
- ⛔ **THE TRAP, AND IT IS THE DANGEROUS KIND.** A 2,000-feature sample of residential `NRP_OZN=SS`
  (of 15,281 nationally) showed `FZ_MAX`/`FI_MAX` *present* on 5.9% of rows — **and every present
  value was `0`.** e.g. OPN Log–Dragomer `EUP_OZN LO-021 · FZ_MAX "0" · FI_MAX "0" · FZP_MIN "0"`.
  **These are SENTINELS, not measurements.** An adapter that reads `FZ_MAX` as a number gets
  "coverage ratio 0" — an *unbounded refusal or a zero envelope* on real residential land, which
  is precisely L-616 / [[envelope-solid-overstates-partial-data]] and the
  [[corpus-never-jittered-min-over-peers]] "sentinel ≠ unknown" rule. **Binding rule for any SI
  adapter: `0` on FZ/FI/FZP/GP/V means UNKNOWN, never zero.** The `> 0` hits counts above are the
  honest fill; the "present" counts are not.
- **Classification: CATEGORY 1 in practice (zone geometry + national land-use codelist, ~100%
  filled), with a CATEGORY 2 schema at ~1% fill.** SI is the cleanest available demonstration that
  **schema completeness and data completeness are different facts** — and that a lane which stops
  at `DescribeFeatureType` would have reported Slovenia as Europe's best rules country.

## A-19 · LV — VZD publishes the PLAN-ZONE-TO-PARCEL INTERSECTION as open data — **CAT 3 CONFIRMED, PROBED 2026-09-01** ⭐
- L5 lists LV in the structured-plan family as "TAPIS". **Delta: the State Land Service (VZD) also
  publishes the state-computed JOIN of the TAPIS functional zone onto the cadastral land unit —
  with the split areas — which is the applicability step, done by the state.**
- **PROBED 2026-09-01:** `https://data.gov.lv/api/3/action/package_show?id=fz-skelumi` → dataset
  **"Funkcionālās zonas un lietošanas mērķi neapbūvētām zemēm"**, licence **CC-BY-4.0**,
  metadata_modified **2026-04-02**, resources in CSV/XLSX + JSON metadata.
  Downloaded `zv_nilm_apbuves_funkcionala_zona_02042026-1.csv` → HTTP 200, **22,083,900 bytes,
  180,691 rows**, header verbatim:
  `"NovID","NovNos","TerID","TerNos","ZvKadApz","ZvPlat","Fz","FzPlat","KopSkelPlat","NilmSar","NilmSarArPlat","SkTransf"`.
  Real rows: cadastral unit `32420010002` (58,000 m²) split across **four** functional zones —
  `L 44,304 m² · M 7,820 · TA 5,647 · Ū 416` — plus `NilmSar` permitted-use codes with areas.
- Coverage is stated honestly by the publisher: *"dati par zemes vienību funkcionālām zonām
  pieejami tikai administratīvajās teritorijās, kurās TAPIS dati ir vektorizētā formā
  (~ 55% zemes vienību)"* (https://www.vzd.gov.lv/lv/funkcionalas-zonas-un-lietosanas-merki-neapbuvetam-zemem,
  checked 2026-09-01); quarterly refresh. The sibling `data.gov.lv/dati/dataset/tapis` (**CC0-1.0**,
  daily) carries the plan-document register (`tapis_projekti.csv`).
- **Classification: CATEGORY 3 (parcel-specific planning result — zone + area per land unit),
  ~55% national coverage, open, official.** **NOT cat 4:** no building parameters at all — LV's
  height / intensity / density numbers live in the TIAN (apbūves noteikumi) documents, unextracted.
  For Pryzm: this removes the *plan-zone-to-parcel intersection* work for 55% of Latvia — the
  applicability half comes free; the numeric half stays document-extraction.

## A-20 · EE — the ehitusõigus attribute set RE-VERIFIED live, and its COVERAGE is the limit — **CAT 3, RE-PROBED 2026-09-01**
- L4 EE-1 is the authority (per-plot ehitusõigus incl. served max-GFA, keyless). **Delta: a
  staleness re-verification + the coverage number L4 did not state, and a NOT-CONFIRMED on cat 4.**
- **PROBED 2026-09-01:** `https://gsavalik.envir.ee/geoserver/planeeringud/wfs?service=WFS&request=GetCapabilities&version=2.0.0`
  → 200 (206 KB), 19 `detail_plan_*` + `yld_plan_*` feature types. (Note: the older
  `https://planeeringud.ee/plank/wfs` endpoint now **302-redirects to the EHR UI**
  `livekluster.ehr.ee/ui/ehr/v1/detailsearch/PLANNINGS_SEARCH` — cite gsavalik, not plank/wfs.)
- `DescribeFeatureType planeeringud:detail_plan_hoonestus` → verbatim fields incl. **`sbp`
  (suletud brutopind = gross floor area) · `sbp_mpealne` / `sbp_malune` (above/below ground) ·
  `korgus` / `korgusabs` (height / absolute height) · `protsent` (built percentage) · `tihedus`
  (density) · `arv` (building count) · `ehtyyp` (building type) · `sygavus` · `ehting`**.
  `detail_plan_krunt` → `otstarve` (use) · `pind` · `parkimis_arv` · `tingimus` · `plank_url`.
- **COUNTS (`resultType=hits`, 2026-09-01): `detail_plan_krunt` 12,088 · `detail_plan_hoonestus`
  10,301.** Against ~700k Estonian cadastral units this is the honest scope: EE serves the
  RICHEST per-plot rule payload in Europe on a **small share of the country** — the machine-readable
  requirement dates from 2020-11-01, so it grows with new plans. **The quality/coverage trade is
  the opposite of Luxembourg's and Slovenia's, and all three belong in the same table.**
- **Cat 4 for EE: NOT CONFIRMED.** No Estonian precomputed capacity/reserve product was found this
  lane; the state serves the INPUTS (very well), not a computed remainder.

## A-21 · IT / PT / CZ — cat-4 NOT CONFIRMED; the honest one-liners
- **IT:** *diritti edificatori* registers DO exist and DO record per-lot building rights
  (e.g. Comune di Brescia and Comune di Paderno Dugnano publish a "Registro dei diritti
  edificatori"; capacità edificatoria **residua** is defined in PGT norms as
  *total capacity per the territorial index − existing construction*). **But they are
  ADMINISTRATIVE REGISTERS, per-comune, not open geodata** — no WFS/API found, and transfers are
  recorded in the conservatoria, not a portal (checked 2026-09-01). Milan's own CKAN
  (`dati.comune.milano.it`, `q=PGT` → 6 datasets, none of them a rules layer) confirms the
  pattern; the PGT vectors are shapefile/WMS on the geoportale. **IT stays L5 Tier 3
  (document-locked); cat 4 NOT CONFIRMED as data.**
- **PT:** no precomputed capacity product found (checked 2026-09-01). DGT/SNIT serves IGT as
  WFS (L3 PT-1 is the authority for the national spine); the *índice de utilização* lives in the
  PDM **regulamento** text. **Cat 4 NOT CONFIRMED.**
- **CZ:** NGUP (L5) is the national plan channel — cat 1, with the 2024–2026 standardisation in
  flight; **no capacity/envelope product found. Cat 4 NOT CONFIRMED.**

---

# PART B — THE FOUR-CATEGORY CLASSIFICATION (registry countries + the Tier-1 structured family)

Baseline rows are the ORIGINAL lanes, cited not re-derived. **Bold** = this lane's delta.
Each cell states the highest category reached by a *state or semi-official* source, with the
coverage limit that qualifies it.

| # | Cat 1 raw plan data | Cat 2 machine-readable RULES | Cat 3 parcel-specific RESULT | Cat 4 PRECOMPUTED capacity / envelope |
|---|---|---|---|---|
| **NL** | IMRO/IMOW plan geometry (L4 NL-1) | YES — typed norm objects in BOTH regimes, free key (L4 NL-1); the reference implementation | partial, via DSO toepasbare regels (L4 NL-1) | **A-5** provincial plancapaciteit monitors — DECLARED pipeline counts, not rule-derived |
| **EE** | planeeringud WFS (L4) | n/a at zone level | YES — per-plot `sbp` / `korgus` / `protsent` / `tihedus` (L4 EE-1; **A-20 re-verified: 12,088 krunt · 10,301 hoonestus**) | **A-20 NOT CONFIRMED** |
| **DK** | Plandata WFS keyless, 100% doklink (L2 DK-1/2) | YES — typed fields; fill 30.6 / 43.1 / 60.8% by plan level (L2 DK-1/2) | via plan-layer precedence (L2 DK-1) | **A-8** VUR valuation runs a per-parcel highest-and-best-use over the SAME Plandata fields — parameter exposure NOT CONFIRMED |
| **LT** | TPDR (L4 LT-2) | ASGR national, **14–18% fill** (L4 LT-1) | — | **A-3** YES — state-served 3D height-extrusion SceneServers; visualisation-grade, height only |
| **PL** | POG GML landing Q3–Q4 2026 (L4 PL-2) | zone level, landing (L4 PL-2) | — | **A-12** chłonność is a STATUTORY computation published inside plan DOCUMENTS — NOT CONFIRMED as data |
| **DE** | **A-16** NRW 87,736 plans in one open GPKG, 100% scan / **13.3% text**; 82k national index (L2 DE-1) | XPlanGML in MV-class Länder only (L2 DE-1) | — | **A-10** Baulandkataster §200(3) BauGB, opt-in per city · **A-15** Bodenrichtwerte carry GFZ / GRZ / BMZ / Geschosszahl / Bauweise — valuation model, NOT a legal limit |
| **CH** | ÖREB + cantonal zone data (L2 CH-1) | NO — numerics are Reglement-PDF-bound (L2 CH-6) | YES — ÖREB per-parcel restriction to exact-law chain (L2 CH-1) | **A-7** ARE Bauzonenstatistik (aggregate only) · Raum+ (canton-internal, GATED) |
| **ES** | Catastro + regional IDEs (L3) | document-bound (L3) | partial (L3) | **A-2** YES — Madrid VEDA serves AVAILABLE edificabilidad m² per use, **on 390 urbanistic parcels only** (scope corrected on re-probe) |
| **FR** | GPU national (L3 FR) | document-bound règlement (L3) | GPU per-parcel extract (L3) | **A-6** YES — UrbanSIMUL national parcel constructibility, **ELIGIBILITY-GATED to public actors** |
| **PT** | DGT/SNIT IGT WFS (L3 PT-1) | document-bound (L3) | — | **A-21 NOT CONFIRMED** |
| **BE** | Flanders GRB + zoning (L5) | — | — | **A-9** vermoedelijk ROP, ~43,800 ha computed regionally — open geodata NOT CONFIRMED |
| **UK** | planning.data.gov.uk, 108 datasets (L5) | NO — discretionary by design (L5) | — | **A-4** YES — brownfield registers, 37,670 sites with min/max net dwellings |
| **IE** | myplan.ie GZT (L5) | NO — discretionary (L5) | **A-14** YES — per-parcel harmonised zone via `ZONE_GZT` on 296,293 RZLT parcels | **A-14** YES — RZLT is a statutory per-parcel DEVELOPABLE determination (no capacity numbers) |
| **IT** | regional / comunal WFS (L5 Tier 3) | NO — NTA PDFs across ~7,900 comuni (L5) | — | **A-21 NOT CONFIRMED** |
| **NO** | SOSI + NAP 2026 (L5) | partial (L5) | — | **A-12 NOT CONFIRMED** — analyses, not data |
| **SE** | NGP detaljplaner (L5) | Planbestämmelsekatalogen, NEW plans only (L5) | — | **A-11** riktvärde model PRICES byggrätt per zone — the QUANTITY is not served |
| **FI** | Ryhti plan index (L5) | structured kaavamääräykset, new plans (L5) | — | **A-1** YES — HSY SeutuRAMAVA: reserve = right − used, per block per use; 4 municipalities |
| **LU** | PAG GML/GPKG national (L5) | **A-13** YES — COS / CUS / CSS / DL typed; of 3,017 NQ-PAP zones **97.8% carry all four maxima non-null, 93.7% strictly positive** (zeros verified MEANINGFUL — ZAD / non-residential); CC0 | — | — |
| **LV** | TAPIS register, CC0 (L5) | NO — TIAN documents (**A-19**) | **A-19** YES — VZD zone × parcel intersection with split areas, 180,691 rows, ~55% coverage | — |
| **SI** | **A-18** national NRP/EUP WFS, CC BY 4.0 | **A-18** schema is complete (FZ / FI / FZP / GP / V …) at **0.5–1.1% fill, and present values are SENTINEL ZEROS** | — | — |
| **AT** | Vienna WMTS + plan PDFs (**A-17**) | **A-17** YES by CODE→STATUTE join — Bauklasse in the zone code, height bands in BO für Wien §75 (generalised layer only) | — | — |

**Tallies across these 21 countries.** Cat 1 reached by **21/21**. A real cat 2 — typed numerics or
a statutory code-to-number join — by **8** (NL, DK, LT, DE-partial, LU, AT, SE-partial, FI-partial).
Cat 3 by **5** (EE, CH, IE, LV, FR-extract). **A cat-4 artefact of some kind exists in 12** — of which
**only 5 are openly consumable today**: FI-HSY, ES-Madrid, LT-3D, UK-brownfield, IE-RZLT.

## B.1 · The five shapes cat 4 actually takes (none of them is "a buildable envelope")

Sorting every cat-4 artefact found makes the negative result precise:

1. **Remaining-right SUBTRACTION** — FI HSY SeutuRAMAVA (right − used, per block per use) ·
   ES Madrid VEDA (available edificabilidad per parcel per use, **390 parcels**). **The only two
   that publish the number Pryzm computes.** Both are sub-national, and both are SMALL: HSY covers
   4 municipalities, VEDA a few hundred development parcels.
2. **Capacity JUDGEMENTS** — UK brownfield min/max net dwellings · NL provincial plancapaciteit.
   Human-declared, not derived from rules.
3. **Applicability determinations / site inventories** — IE RZLT (296,293 parcels) ·
   BE vermoedelijk ROP · DE Baulandkataster · LV fz-šķēlumi (cat 3 by our boundary rule, same family).
   They answer WHERE, never HOW MUCH.
4. **Valuation models that ENCODE buildability** — DE Bodenrichtwerte (GFZ/GRZ/BMZ/storeys) ·
   DK VUR highest-and-best-use · SE riktvärde byggrätt pricing · CH/Raum+ reserves.
   Numerically rich, legally non-binding. **Priors and cross-checks, never sources of truth.**
5. **Extruded VISUALISATIONS** — LT TPDR SceneServer (height only, no setbacks, no coverage).

**Nowhere in Europe does a state serve a buildable-envelope SOLID derived from the full rule set.**
Category 4 as the brief imagines it — "if a country provides it, Pryzm should NOT recreate it" —
is provided by **no country**, and by only two sub-national bodies in a numbers-only form.

---

# PART C — THE STANDING VERDICT, RE-TESTED COUNTRY BY COUNTRY

The verdict under test (REPORT.md §A.2, from L5 synthesis #4), verbatim:

> **"No country serves complete numeric envelope rules: the rules axis converges at 5–50%
> everywhere"** … **"The envelope layer is state-served NOWHERE (20/20 chains, §R)."**

It is TWO claims. They do not survive equally.

## C.1 · Claim 2 — "the envelope layer is state-served NOWHERE" — **HOLDS. Strengthened.**

Re-tested over 21 countries with a cat-4 hunt in each national language
(*bebaubarkeit · capacité constructible · aprovechamiento urbanístico · byggeret · byggrätt ·
bouwmogelijkheden · rakennusoikeus · ehitusõigus · apbūves intensitāte · faktor izrabe ·
chłonność · capacità edificatoria · degré d'utilisation du sol · fortettingspotensial*), plus
semi-official bodies (chambers, valuation authorities, regional monitors) as the brief directs.

**No state serves a buildable-envelope solid derived from the full rule set.** The closest artefact
found in Europe is **LT's TPDR SceneServer (A-3)** — regulation zones extruded by permitted height,
served as 3D objects by the state — and it is defeated on its own terms: height-only, no setbacks,
no coverage, no FAR shaping, over an attribute layer at 14–18% fill (L4 LT-1). It is a map, not an
envelope. **Claim 2 stands, now on 21 chains rather than 20, and with the five distinct shapes
cat-4 actually takes catalogued in §B.1 so future lanes stop re-searching the same ground.**

## C.2 · Claim 1 — "complete numeric envelope rules … 5–50% everywhere" — **REFUTED AS STATED, three ways**

### (a) The CEILING is wrong — Luxembourg, measured 93.7–97.8% ⭐
`PAG_PAG_NQ_PAP`, national, CC0, one 260 MB download refreshed 2026-08-31:
**3,017 zones · `COS_MAX` 99.8% · `CUS_MAX` 99.8% · `CSS_MAX` 99.8% · `DL_MAX` 97.8% non-null;
all four maxima together 2,950 = 97.8% non-null, and 2,826 = 93.7% STRICTLY POSITIVE** — the zeros
were checked and are meaningful (ZAD deferred zones, non-residential zones), not Slovenia-style
sentinels (A-13). Coverage ratio, floor-area ratio,
sealing ratio and dwelling density — four of the numeric envelope parameters — are served as typed
columns at a fill rate NEARLY TWICE the top of the stated band (and ~19x its floor). A verdict that says "5–50%
everywhere" is not describing Luxembourg.

### (b) The FLOOR is wrong — Slovenia, measured 0.5–1.1%, with a trap ⭐
`SI.MNVP.PA:NRP_OPN`, national, CC BY 4.0: **403,788 polygons; `FZ_MAX > 0` on 4,301 (1.07%),
`FI_MAX > 0` on 2,436 (0.60%), `GP_MAX > 0` on 2,128 (0.53%), `V > 0` on ZERO** (A-18). Below the
band — and worse than absent, because the schema is complete and **the values that ARE present are
sentinel `0`s**. A "5–50%" reading of Slovenia would have been generous by an order of magnitude,
and a `DescribeFeatureType`-only reading would have crowned it Europe's best rules country.

### (c) "Converges everywhere" is the wrong SHAPE — completeness fails on three independent axes
A single percentage cannot carry this, and the countries prove it by failing differently:

| axis of incompleteness | fails here | the measurement |
|---|---|---|
| **PARAMETER coverage** — which of the envelope parameters exist at all | **LU** | COS/CUS/CSS/DL at 93.7–97.8%, **but no max height, no setback, no storey count anywhere in the model** — those sit in the PAP and the DOCX written part |
| **SPATIAL coverage** — how much of the country the good data covers | **EE** | richest per-plot payload in Europe (`sbp`, `korgus`, `protsent`, `tihedus`) on **12,088 plots / 10,301 built-form records** vs ~700k cadastral units. **LU** fails here too: 3,017 NQ zones vs 18,743 existing-quarter zones with zero numerics |
| **VALUE fill** — how often the field that exists is populated | **SI** 0.5–1.1% · **LT** 14–18% (L4) · **DK** 30.6 / 43.1 / 60.8% by plan level (L2) | server-side `hits` counts, not samples |

**Three axes, three different failures, and a country can be excellent on one while at zero on
another.** LU and EE are the clean demonstration: LU is broad-and-shallow (national, 4 parameters,
new-development zones), EE is narrow-and-deep (few plots, the whole ehitusõigus). Averaging them
into "5–50%" destroys the only information a build/consume decision needs.

### The revised verdict this lane proposes for the E5 report

> **No European state serves a computed buildable envelope (21/21, confirmed).** Machine-readable
> numeric planning RULES, however, are NOT uniformly scarce: they range from **93.7% (LU, four
> areal parameters, national, CC0)** to **0.5% (SI, complete schema, empty)**. Rule availability
> must be reported per country on **three axes — parameter coverage × spatial coverage × value
> fill — never as one percentage**, because every country audited fails a different one.

## C.3 · Why the refutation is a CONCRETE REASON, not a debating point

1. **Luxembourg is now a cheap, early adapter, and it must NOT get a hand-written rule pack.**
   One CC0 file carries the zones, the four numeric parameters, the overlays, the building lines,
   the servitudes **and the cadastral parcel base** (`FOND_DE_PLAN`, 653,315 parcels with
   `NUM_CADAST`) — so parcel→zone→numbers resolves without leaving the dataset and without a second
   provider. Under brief §9 this is an INPUT to the existing declarative evaluator, not new core.
   The honest gap to declare at the never-overstate gate is **height and setbacks — UNKNOWN**, and
   the `ZONES_QE` existing quarters — **document-bound**.
2. **Slovenia dictates an adapter rule that would otherwise be found in production:**
   **`0` on `FZ`/`FI`/`FZP`/`GP`/`V` means UNKNOWN, never zero.** A numeric-coercing adapter yields
   coverage-0 / FAR-0 on real residential land — L-616 and
   [[envelope-solid-overstates-partial-data]] exactly, and the same sentinel-vs-unknown error as
   [[corpus-never-jittered-min-over-peers]]. **Ship the probe (the `> 0` hits count) before the
   adapter, per [[context-data-honesty-family]].**
3. **Germany's real extraction input is a SCAN, not a text.** NRW: 87,736 plans, **scanurl 100%,
   texturl 13.3%** (A-16). The DE line item is OCR-over-drawings for ~87% of plans, which is a
   different cost line from "PDF text extraction" and should be budgeted as such — and it is the
   strongest argument for A-15's Bodenrichtwert GFZ/GRZ as an explicitly-labelled prior.
4. **Five sources move from "Pryzm computes" to "Pryzm consumes", today, keyless or CC0:**
   FI HSY SeutuRAMAVA (block reserve; payload re-verified 2026-09-01 — `kala` 137777 /
   `karayht` 116900 / `laskvar_yh` 27659) · ES Madrid VEDA (**390 parcels**, scope corrected) ·
   UK brownfield registers (net dwellings) · IE RZLT (296,293 developable parcels + `ZONE_GZT`) ·
   LV VZD fz-šķēlumi (zone × parcel intersection, 180,691 rows). **None replaces an envelope; all
   five replace WORK** — three of them replace the applicability step, two replace the subtraction.
5. **One partnership question, not a data question:** FR UrbanSIMUL (A-6) proves the French state
   believes parcel-level constructibility is computable from open inputs, and gates it to public
   actors. That is a business-development item for the founder, not an adapter.

## C.4 · What this lane did NOT do (honest gaps)

- **NL fill was not measured.** L4 NL-1 establishes typed norm objects in both regimes; this lane
  did not obtain a DSO key and therefore cannot place NL on the three-axis scale. **NL is the one
  country that could move the ceiling above Luxembourg's, and it is unmeasured.** Highest-value
  next probe.
- **LU heights.** Whether any PAP/PAG GML layer carries a numeric height was NOT established —
  the DOCX written parts were not opened (the per-commune ZIPs run to ~136 MB each). Assume UNKNOWN.
- **DE Bodenrichtwert national fill** NOT measured (A-15) — only Hamburg's schema and sample values.
- **DK VUR schema** NOT read; whether it exposes the assumed utilisation per use is open (A-8).
- **BE Flanders ROP as open geodata** NOT located (A-9) — one catalog query still owed.
- **Licence verbatim reads still owed:** ES Madrid aviso legal (A-2), NRW/opengeodata terms
  (A-15/A-16), IE data.gov.ie terms (A-14). Colours in Part B are catalog-level, not clause-level.
- **SE/NO/FI structured-plan fill** rests on L5; not independently re-measured here.
- Every cat-4 "NOT CONFIRMED" in Part A means *not found by this lane's searches* — per the brief's
  own rule, that is not the same as *does not exist*, and it is never the same as *refused*.
