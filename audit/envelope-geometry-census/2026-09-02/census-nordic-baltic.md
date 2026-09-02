# EUROPEAN ENVELOPE GEOMETRY CENSUS — LANE NORDIC-BALTIC (DK · SE · NO · FI · IS · EE · LV · LT)

> **Date:** 2026-09-02 · **Authority:** `docs/01-strategy/STR-EUROPEAN-ENVELOPE-SOURCES.md` §10
> (the founder's census mandate). **Question answered:** *where does an authoritative source
> already publish the GEOMETRIC CONSEQUENCE of planning rules?* — TYPE A (explicit geometry) >
> TYPE B (explicit parameters) > TYPE C (derive).
> **Reuse:** probe-verified rows from `audit/europe-site-intel/2026-08-31/lanes/germany-denmark-switzerland.md`
> (DK-1..DK-5, chains DK-A/DK-B), `lanes/rest-of-europe-sweep.md` (SE/NO/FI/LV),
> `lanes/netherlands-poland-lithuania-estonia.md` (LT-1..LT-5, EE-1..EE-4),
> `impl/e5-asis-national-sweep.md` (Part-2 table rows) — cited inline as **[BANKED …]**, never
> re-derived. **NEW live probes this lane** ran 2026-09-02, all foreground, User-Agent
> `PRYZM-Research/1.0 (+https://pryzm.app; contact pryzmhello@gmail.com)`; raw payloads in
> `transcripts-nordic-baltic/` beside this file. Probe ledger at the end.
> **Honesty frame:** UNKNOWN ≠ absent ≠ zero; a WMS is a picture, not a geometry channel; a
> registration gate is a GATE, not a missing dataset; GetCapabilities is not an inventory.

---

## ⭐ TYPE-A HEADLINE — where explicit envelope/field/line geometry is ALREADY SERVED

Four of this lane's eight countries serve **explicit building-field geometry as machine-readable
features today**; two more have it in the national vector model behind a gate or a render-only
channel; one has it in the model but not yet in the open channel.

### 1. DENMARK — byggefelt, THE exemplar, re-proven end-to-end TODAY (2026-09-02, all keyless)

Full chain at one Copenhagen point (Strandgade, Christianshavn, 12.5957°E 55.6761°N):

- **Parcel** — DAWA `api.dataforsyningen.dk/jordstykker?x=12.5957&y=55.6761` → HTTP 200:
  `matrikelnr 562`, ejerlav `2000153 Christianshavns Kvarter, København`, **BFE 6004659**,
  `registreretareal 8016` m². *(transcript `dk-dawa-parcel.json`)*
- **Building field** — Plandata WFS `geoserver.plandata.dk/geoserver/wfs`,
  `pdk:theme_pdk_byggefelt_vedtaget`, GeoJSON, HTTP 200 — feature `id 1490813`:
  **field geometry** MultiPolygon, 7-vertex ring starting
  `[12.5957240557, 55.6760893799], [12.5958157227, 55.6760256072], …` ·
  **`maxetager = 2`** (max floors) · **`maxbygnhjd = 6`** (max height m) · **`eareal = 250`**
  (max GFA m²) · `bygkunifelt = False` / `bygvejledende = True` (indicative field) ·
  **plan link:** `planid 9438203`, `lokplan_id 1468290`, `lp_plannr 477`,
  `lp_plannavn "Strandgade Nord"`, `status V`, `datoikraft 20120629`, `versionsnr 2`,
  **`doklink https://dokument.plandata.dk/20_1468290_1786976657855.pdf`**.
  *(transcript `dk-byggefelt-cph.json`; bbox pull returned `totalFeatures: 2826` byggefelter in
  central Copenhagen alone; national total 57,080 [BANKED DK-1].)*
- **Binding-field variant proven in the same pull** — feature `id 1214869`, Lokalplan 593
  "Lindgreens Allé II": **`bygkunifelt = True`** ("may build ONLY inside the field"),
  `bygvejledende = False`, `maxetager 1`, `maxbygnhjd 4`, ikraft 2020-07-03, doklink PDF.
- **Municipal-plan frame at the same point** — `pdk:theme_pdk_kommuneplanramme_vedtaget_v`,
  HTTP 200, 1 feature: `plannr R24.C.1.14`, `anvendelsegenerel "Blandet bolig og erhverv"`,
  **`bebygpct = 150`**, **`bebygpctaf = 1`** (= % of the area AS A WHOLE — the C63 denominator
  branch fires live at this exact point; naive per-parcel 150% would be WRONG [BANKED DK-2]),
  `maxbygnhjd = 24`, `datoikraft 20241212`,
  `doklink https://dokument.plandata.dk/11_11347088_1737715824963.pdf`.
  *(transcript `dk-ramme-at-point.json`)*

**`parcel → byggefelt(geometry) → max floors → max height → plan PDF → ramme fallback` runs
end-to-end, keyless, in three HTTP calls.** This is the strategy's §8 Type-A proof, re-verified.

### 2. LITHUANIA — statybos zona / statybos riba / statybos linija, NEW TYPE-A FIND (probed live 2026-09-02)

The TPDR national dispositions service serves **construction-zone and construction-line geometry
from registered detailed plans as first-class national layers** — an axis the 08-31 sweep did not
ask (it proved ASGR parameters; this lane proves the drawn geometry):

- `tpdr.planuojustatau.lt/arcgis/rest/services/duomenu_viesinimas/sprendiniai/MapServer` →
  HTTP 200, **277 layers**, among them (id | name | geometry): **83 | Statybos zona | Polygon**
  (36,476 features, counted live) · **85 | Statybos riba | Polyline** (construction boundary) ·
  **84 | Statybos linija | Polyline** (construction line = mandatory build-to line) ·
  **88 | Požeminio užstatymo zona | Polygon** (underground construction zone) · a second group
  (69/70/71/74) for the other plan family (686 in layer 69) · **Funkcinė zona** polygons.
  *(transcripts `lt-sprendiniai-layers.json`, `lt-statz-count.json`)*
- **Live feature (layer 83, Vilnius, keyless):** Statybos zona polygon at
  *"Žemės sklypo kad. Nr. 0101/0024:421, Antakalnio g. 75A, Vilniuje detaliojo plano užstatymo
  zonos koregavimas"* — **`MAX_AUK_M = 30`** (max height on the ZONE itself), `UZST_TIP "kt"`
  (development type), `TPD_NR T00074679`, `GALIOJA_NUO 1421828630000` (validity-from),
  `AKTUALI 1`, ring geometry in LKS-94 (`[[584827.45, 6065183.34], …]`), SHAPE.AREA 2969 m².
  *(transcript `lt-statybos-zona.json`)*
- Plus [BANKED LT-2]: TPDR already publishes **extruded allowed-height 3D volumes** (Multipatch
  scene services) — a state-served 3D envelope visualization.

**A per-plan construction-zone polygon carrying its own max-height attribute + validity + plan
linkage = a second national byggefelt, live and keyless.**

### 3. ICELAND — byggingarreitur (building site/field), NEW TYPE-A FIND (probed live 2026-09-02)

Nothing on Iceland existed in any banked sweep. Found and proven this lane:

- Skipulagsstofnun (now merged into **HMS — Húsnæðis-, mannvirkja- og skipulagsstofnun**) runs
  `luk.skipulag.is` (ArcGIS Server, keyless) behind the new Skipulagsvefsjá (opened Oct 2025).
  Services root lists **`Stafraent_deiliskipulag` (digital detail plan) FeatureServer** with
  layers: 0 Skipulagsmörk (plan boundary) · 2 **Lóðir** (lots) · 3 Kvaðir (encumbrances) ·
  **4 Byggingarreitir (building fields, Polygon)** — plus a separate **`Byggingarreitur3D`**
  FeatureServer. *(transcripts `is-services-root.json`, `is-stafraent-dsk-fs.json`)*
- **Live feature (layer 4, keyless):** `skipnr 19973` (plan number), **`haedirOfan = 1`** (floors
  above ground), `haedirNedan` (below), **`byggmagn = 3200`** (max build volume/GFA m²),
  `byggmagnOfan/Nedan/Nuv`, `ibudirFj` (dwelling cap), `nidurrif` (demolition flag),
  **`gildirFra 1739491200000`** (valid-from 2025-02-14) / `gildirTil`, `nakvaemni "1:2000"`,
  ring geometry in ISN93/EPSG:3057. *(transcript `is-byggingarreitir-sample.json`)*
- **Coverage is thin and honest: 2,039 byggingarreitir nationally** (counted live) — only
  digitally-submitted deiliskipulag; the paper/PDF stock remains documents. The certified signed
  plan stays the legal authority (island.is caveat).

**Building-field polygon + floors + GFA + validity window per plan — Iceland is a Type-A country
for its digital-plan slice.**

### 4. ESTONIA — dp_hoonestus (building areas), TYPE A [BANKED EE-1/EE-4, live-proven 2026-08-31 — reused, not re-probed]

`livekluster.ehr.ee/api/mapserver2d/v1/mapserver` (PLANK, 181 layers, keyless WFS):
**`dp_hoonestus` building-area polygons** with `tihedus` (FAR) · `protsent` (coverage %) ·
`korgus`/`korgusabs` (height rel/abs) · `sbp` (max GFA) · `arv` (building count) · `sygavus`
(depth) + plan provenance. Live Tallinn value proof banked: `tihedus 2.1 · protsent 61 ·
korgus 17.4 · sbp 3500` at Kopli tn 2. Coverage caveat: PLANK holds digitally-submitted +
back-digitised plans only; empty ≠ no plan.

### Gated / render-only / model-only Type A (do not overstate)

- **SWEDEN** — the national digital detaljplan model (BFS 2020:5, mandatory since 2022-01-01)
  carries **geometric egenskapsbestämmelser** — prickmark/korsmark ("marken får inte förses med
  byggnad" = drawn no-build polygons), placement and utformning areas — i.e. Type-A drawn
  setback/no-build geometry as data. Served via Lantmäteriet **NGP** (STAC + OGC API Features,
  **Basic Auth/OAuth2, free registration**) — 236/290 kommuner, 11,662 plans [BANKED SE row].
  NOT live-probed past the gate this lane: two candidate anonymous paths returned 404
  (`se-ngp-gate.json`, `se-ngp-stac-gate.txt`) — no anonymous channel found, gate stands.
  **VERIFIED-LEAD (gate: free reg + OAuth; probe = NGP onboarding, then pull one plan's
  bestämmelser and confirm prickmark polygons).**
- **NORWAY** — the SOSI reguleringsplan model has **byggegrense (building limit line) and
  regulert byggelinje as RpJuridiskLinje codes** plus `rpregulerthoyde` (regulated height).
  **PROBED 2026-09-02:** the new national NAP service
  `nap.ft.dibk.no/services/wms/reguleringsplaner/` (DiBK, operational per the 1.1.2026 mandate)
  is LIVE and keyless — 54 layers, all `queryable="1"`, including **`rpjuridisklinje_vn1..5`**
  and **`rpregulerthoyde_vn1..5`**; GetFeatureInfo answers well-formed GeoJSON (mechanism works;
  my two Oslo pixel probes returned 0 features — pixel luck/coverage, not a gate). But this is
  **WMS: a picture + point-info, not a bulk geometry channel**; the national VECTOR copy
  ("Reguleringsplaner landsdekkende kopi", WFS/download) is **Norge digitalt agreement-gated**
  [BANKED NO row]. **VERIFIED-LEAD (Type-A content exists nationally; open access is
  render/point-query only; vector = agreement gate).**
- **FINLAND** — the Ryhti kaavatietomalli defines **rakennusala** (building area) geometry for
  asemakaava. **RE-PROBED 2026-09-02:** the open OGC API
  (`paikkatiedot.ymparisto.fi/geoserver/ryhti_plan/ogc/features/v1/collections`) still serves
  only **4 index collections** (asemakaava/yleiskaava hakemisto + in-prep) — unchanged since
  08-31; structured plan objects stay behind the data-permit route. Helsinki's own open WFS
  (`kartta.hel.fi/ws/geoserver/avoindata/wfs`, probed) also serves kaava INDEX layers +
  Kaavayksikot only — **no rakennusala layer openly served anywhere probed**.
  **Type A EXISTS-IN-MODEL, NOT-YET-SERVED-OPEN.**
- **LATVIA** — **PROBED 2026-09-02, NEW:** TAPIS consolidated data is a **live WFS 2.0.0 under
  CC0** (`geo-dpps.viss.gov.lv/api/DPPSPackage/client/Teritorija_454_…`, found via data.gov.lv):
  18 national feature types incl. `funkcionalais_zonejums` (functional zoning),
  `teritorijas_ar_ipasiem_noteikumiem`, `apgrutinatas_teritorijas`. DescribeFeatureType on the
  zoning layer: zone `kods`/`indekss` + document linkage (`dok_id/dok_nos/dok_datums_no`) —
  **no numeric envelope attributes and NO būvlaide (building-line) layer** in the consolidated
  package. Numbers live per zone index in the TIAN legal text (likumi.lv structured HTML)
  [BANKED LV row]. **No Type A found; strong structured-rules substrate.**

---

## PER-COUNTRY TABLE (the founder's columns)

| country | authority | dataset | API/download | parcel linkage | zoning geometry | building-FIELD geometry | building-LINE geometry | height | FAR | coverage (bldg %) | setbacks | validity | licence | data coverage | machine-readable quality |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **DK** | Plan- og Landdistriktsstyrelsen (Plandata.dk) + Klimadatastyrelsen (DAWA/Datafordeler) | Lokalplaner, kommuneplanrammer, **byggefelter**, delområder + codelists | **keyless WFS** `geoserver.plandata.dk/geoserver/wfs`, 208 layers, GeoJSON; DAWA REST for parcels | spatial join; parcel keyless via DAWA (matrikelnr+BFE) | ✅ all plan layers | ✅ **57,080 byggefelter** w/ maxetager/maxbygnhjd/eareal/bygkunifelt — LIVE-PROVEN | partial (fields carry binding/indicative flags; separate line layer not needed — field IS the envelope footprint) | ✅ `maxbygnhjd` (24% plans; on fields+rammer higher) | ✅ `bebygpct` + **`bebygpctaf` denominator code** (30–61% by layer) | ✅ bebygpct family | ❌ not as attribute → BR18 defaults + plan PDF (C) | ✅ full date set + `_med_historik` versioned layers | CC BY 4.0 | national; numeric fill 30–61% by layer, doklink 100% | ⭐⭐⭐⭐⭐ reference |
| **SE** | Lantmäteriet (NGP) + Boverket (Planbestämmelsekatalogen) | digital detaljplaner (plan + planbestämmelse objects) | NGP STAC + OGC API Features — **free registration, Basic Auth/OAuth2**; Boverket rule-catalogue API open | fastighet linkage unverified (gate); spatial vs open cadastre (HVD 2025) | ✅ (gated) | ✅ in-model: egenskapsområden | ✅ in-model: **prickmark/korsmark** no-build geometry | ✅ as bestämmelse values (post-2022 plans) | ✅ (exploateringsgrad family) | ✅ | ✅ drawn (prickmark) — the SE way of serving setbacks | plan lifecycle in NGP | CC BY 4.0 | 11,662 plans / 236 of 290 kommuner (Apr 2025); pre-2022 stock scanned | ⭐⭐⭐⭐ once onboarded; UNPROVEN past gate |
| **NO** | Kartverket/DiBK (NAP since 1.1.2026) + kommuner | reguleringsplaner (SOSI plan): arealformål, RpJuridiskLinje, RpRegulertHøyde | **NAP WMS keyless (probed live)**; vector national copy = **Norge digitalt agreement**; per-kommune planregister mandatory online since 2025-07 | matrikkel Teig WFS keyless [BANKED]; spatial | ✅ (WMS open; vector gated) | in-model (felt within plans) | ✅ in-model: **byggegrense / regulert byggelinje** codes; `rpjuridisklinje` layers live on NAP WMS | ✅ SOSI attrs + `rpregulerthoyde` layers | ✅ %-BYA/%-BRA per plan | ✅ %-BYA | ✅ byggegrense IS the drawn setback | plan lifecycle in registers | NLOD (open parts) / agreement (copy) | national model since 2009; digitisation varies per kommune | ⭐⭐⭐ content there, channel gated |
| **FI** | SYKE (Ryhti) + MML + kommuner | kaavatietomalli plans; VOOKA back-conversion | open OGC API = **index layers only (re-probed today)**; full objects via data permit | kiinteistö linkage UNKNOWN (open channel is index-only); MML cadastre open | index only openly | ✅ in-model: **rakennusala** — not yet open | in-model | ✅ in-model (kerrosluku/korkeus) | ✅ in-model (tehokkuusluku e) | ✅ | partially drawn (rakennusala edge) | phased rollout thru 2026 | CC BY 4.0 (open parts) | Ryhti-live regions ~55-65% structured [BANKED] | ⭐⭐ today, ⭐⭐⭐⭐ trajectory |
| **IS** | HMS (Skipulagsstofnun) — luk.skipulag.is | **Stafrænt deiliskipulag**: Skipulagsmörk, Lóðir, Kvaðir, **Byggingarreitir** (+Byggingarreitur3D) | **keyless ArcGIS REST FeatureServer — LIVE-PROVEN**; WMS/WFS declared; SHP download via Skipulagsvefsjá | Lóðir layer in same service; national Landeignaskrá layer present on same server; spatial | ✅ plan boundaries + aðalskipulag landnotkun | ✅ **byggingarreitur w/ haedirOfan (floors), byggmagn (GFA), validity — LIVE-PROVEN** | via Kvaðir/field edges (no separate line layer found) | floors yes; height-in-m NOT seen in schema (UNKNOWN — check aðalskipulag ákvæði layers) | via byggmagn (GFA abs, not ratio) | not as % attr | drawn (field within lot) | `gildirFra/gildirTil` per feature | "opin gögn" declared on island.is; exact licence id UNKNOWN | **2,039 fields** — digital-plan slice only; PDF stock dominates | ⭐⭐⭐⭐ for the slice; thin coverage |
| **EE** | Maa- ja Ruumiamet + Regionaalministeerium (PLANK/PLANIS) | detail-plan **dp_krunt/dp_hoonestus** (building areas + ehitusõigus) | keyless WFS `livekluster.ehr.ee/api/mapserver2d/v1/mapserver`, 181 layers [BANKED, live-proven 08-31] | dp_krunt = plots; cadastre ky_kehtiv keyless WFS; spatial | ✅ all levels | ✅ **hoonestusala polygons w/ full numeric tuple** | via hoonestusala edge + tingimus text | ✅ `korgus`+`korgusabs` | ✅ `tihedus` | ✅ `protsent` | in tingimus prose (F) | `kehtestkp` + plan status; PLANK→PLANIS Jan 2026 | Estonian open licence (custom, GREEN) | digitally-submitted + back-digitised stock; fill varies | ⭐⭐⭐⭐⭐ where present |
| **LV** | VARAM/VRAA (TAPIS) via ĢEOLatvija + VZD (cadastre) | consolidated national planning layers (18 types) | **live WFS 2.0.0, CC0 — PROBED TODAY** via geo-dpps.viss.gov.lv DPPS; municipal plan GDB/SHP dumps on data.gov.lv (Rīga CC-BY) | cadastre weekly SHP + WFS [BANKED]; zoning links to DOCUMENT not parcel | ✅ `funkcionalais_zonejums` national, unified codes | ❌ none found | ❌ no būvlaide layer in consolidated WFS | ❌ not as attr → TIAN text per zone index | ❌ ditto | ❌ ditto | ❌ ditto (text) | `dok_datums_no` + doc linkage per zone | **CC0-1.0** (TAPIS) | national (all municipalities flow through TAPIS) | ⭐⭐⭐ geometry+codes machine-readable; numbers = structured legal HTML (F-extraction) |
| **LT** | VTPSI (TPDR/TPDRIS) + Registrų centras | ASGR consolidated regulations + **sprendiniai layers: Statybos zona/riba/linija** + 3D height volumes | keyless ArcGIS REST + daily FGDB bulk (`asgr.gdb.zip` 129 MB) [BANKED]; **sprendiniai layer set PROBED TODAY** | parcels open FeatureServer (RC data) [BANKED]; spatial | ✅ ASGR national polygons | ✅ **Statybos zona 36,476+686 polygons, w/ MAX_AUK_M on the zone — LIVE-PROVEN** | ✅ **Statybos riba + Statybos linija polylines — national layers** | ✅ MAX_AUK_M (zone + ASGR 18.2% fill) | ✅ MAX_INTENS (units unresolved! [BANKED LT-1 ⚠]) | ✅ MAX_TANKIS | ✅ statybos riba IS the drawn setback | GALIOJA_NUO/IKI + AKTUALI per feature | public + attribution (VTPSI); ASGR "recommendation-grade" caveat | national register; numeric fill 14-18% of polygons, urban-concentrated | ⭐⭐⭐⭐⭐ structure; fill is the limit |

---

## PER-COUNTRY VERDICTS (one line each)

- **DENMARK — CONSUME-GEOMETRY.** Proven end-to-end today, keyless, 3 HTTP calls: parcel →
  byggefelt polygon + maxetager + maxbygnhjd + eareal + doklink → ramme fallback with the
  bebygpctaf denominator code. The exemplar stands.
- **SWEDEN — COMPILE-PARAMETERS today / CONSUME-GEOMETRY behind the free-registration gate.**
  Post-2022 plans are structured objects with drawn no-build geometry (prickmark); NGP onboarding
  is the single blocking step — nothing anonymous exists (two 404 probes).
- **NORWAY — COMPILE-PARAMETERS.** Type-A byggegrense/regulert-høyde content is in the national
  model and visible on the keyless NAP WMS (54 queryable layers, GeoJSON GetFeatureInfo), but the
  open channel renders — the vector copy is Norge digitalt agreement-gated.
- **FINLAND — STRUCTURED-RULES (trajectory: CONSUME-GEOMETRY).** kaavatietomalli defines
  rakennusala; the open API still serves index layers only (re-probed unchanged); full objects =
  data-permit. Åland is a separate jurisdiction — own registry, not covered by Ryhti [BANKED].
- **ICELAND — CONSUME-GEOMETRY for the digital slice, DOCUMENTS-ONLY for the stock.**
  Byggingarreitur polygons with floors + GFA + validity live and keyless (2,039 nationally);
  everything older is certified PDF drawings.
- **ESTONIA — CONSUME-GEOMETRY.** hoonestusala polygons + the full ehitusõigus numeric tuple
  (FAR/coverage/height/GFA) live on a keyless national WFS [BANKED live proof 08-31]; empty ≠
  no-plan (PLANK coverage caveat).
- **LATVIA — STRUCTURED-RULES.** National zoning geometry + unified zone codes + document
  linkage as CC0 WFS (proven today); every number lives in TIAN legal text per zone index —
  the best F-extraction target in the lane; no field/line geometry served.
- **LITHUANIA — CONSUME-GEOMETRY.** Statybos zona/riba/linija national layers (proven today)
  on top of ASGR parameters with per-value provenance [BANKED]; the limit is numeric FILL
  (14–18%), not machine-readability; resolve MAX_INTENS units before any GFA math.

**Lane synthesis:** the Nordic-Baltic region is the world capital of Type-A envelope geometry —
**DK, EE, LT, IS serve building-field polygons today, keyless**; SE has it gated, NO has it
render-only, FI has it modelled. Only LV lacks the geometry axis entirely — and it compensates
with the cleanest licence (CC0) + unified zone codes. The strategy's `byggefelt ∩ height ∩
coverage ∩ restrictions` composition applies in four countries immediately.

---

## PROBE LEDGER (all live HTTP this lane, 2026-09-02, foreground, RC read immediately)

| # | target | request | result | transcript |
|---|---|---|---|---|
| 1 | DK plandata | DescribeFeatureType `theme_pdk_byggefelt_vedtaget` | 200, 9,418 B, RC=0 — schema incl. planid/doklink/maxetager/maxbygnhjd/eareal/bygkunifelt | `dk-byggefelt-describe.xml` |
| 2 | DK plandata | GetFeature byggefelt, CPH bbox, GeoJSON | 200, 549,722 B, RC=0 — 2,826 total, 60 returned; payloads quoted above | `dk-byggefelt-cph.json` |
| 3 | DK DAWA | `jordstykker?x=12.5957&y=55.6761` | 200, RC=0 — matr 562, BFE 6004659 | `dk-dawa-parcel.json` |
| 4 | DK plandata | GetFeature kommuneplanramme at same point | 200, RC=0 — R24.C.1.14, bebygpct 150/af=1, maxbygnhjd 24 | `dk-ramme-at-point.json` |
| 5 | LT TPDR | sprendiniai MapServer `?f=json` | 200, RC=0 — 277 layers; Statybos zona/riba/linija present | `lt-sprendiniai-layers.json` |
| 6 | LT TPDR | layer 83 query, Vilnius env, inSR=4326 | 200, RC=0 — 2 features, MAX_AUK_M=30, TPD T00074679 | `lt-statybos-zona.json` |
| 7 | LT TPDR | layers 83/69 returnCountOnly | 200/200, RC=0 — 36,476 / 686 | `lt-statz-count.json`, `lt-statz69-count.json` |
| 8 | FI Ryhti | ryhti_plan OGC collections | 200, RC=0 — still 4 index collections | `fi-ryhti-collections.json` |
| 9 | FI Helsinki | avoindata WFS GetCapabilities | 200, 303,042 B, RC=0 — kaava index + Kaavayksikot; no rakennusala | `fi-helsinki-caps.xml` |
| 10 | SE Lantmäteriet | `ogc-features/v1/detaljplan/collections` anon | **404**, RC=0 — no anonymous channel at guessed path | `se-ngp-gate.json` |
| 11 | SE Lantmäteriet | `distribution/geodatakatalog/sokning/v1/collections` anon | **404** "No matching resource", RC=0 — gate stands (documented: Basic Auth/OAuth2) | `se-ngp-stac-gate.txt` |
| 12 | SE Boverket | guessed catalogue API path | 404 (HTML error page), RC=0 — endpoint not at guessed path; catalogue API documented as open, URL to be read off boverket.se at wiring | `se-boverket-probe.json` |
| 13 | NO geonorge | old `wms.reguleringsplaner` GetCapabilities | **500** MapServer "Unable to access file" — legacy WMS dead/dying (announced end 1.1.2026) | `no-regplan-wms.xml` |
| 14 | NO NAP (DiBK) | `nap.ft.dibk.no/services/wms/reguleringsplaner/` GetCapabilities | 200, 127,801 B, RC=0 — 54 layers queryable incl. rpjuridisklinje/rpregulerthoyde ×5 vertical levels | `no-nap-wms.xml` |
| 15 | NO NAP | GetFeatureInfo rpjuridisklinje_vn2 / arealformal_vn2, Oslo | 200, RC=0 — well-formed GeoJSON, 0 features at both pixels (mechanism live; hit = pixel luck) | `no-nap-gfi2.json`, `no-nap-gfi3.json` |
| 16 | NO NAP | root page | 403, RC=0 — no public index | `no-nap-index.html` |
| 17 | IS skipulag | `luk.skipulag.is/server/rest/services` root | 200, RC=0 — 60+ services incl. Stafraent_deiliskipulag, Byggingarreitur3D, Landeignaskrá | `is-services-root.json` |
| 18 | IS skipulag | Stafraent_deiliskipulag + Byggingarreitur3D FS `?f=json` | 200/200, RC=0 — layers 0–4 incl. **4 Byggingarreitir** | `is-stafraent-dsk-fs.json`, `is-byggingarreitur3d-fs.json` |
| 19 | IS skipulag | layer 4 query, 2 features + count | 200, RC=0 — haedirOfan 1, byggmagn 3200, gildirFra; count **2,039** | `is-byggingarreitir-sample.json`, `is-byggreitir-count.json` |
| 20 | LV data.gov.lv | CKAN package_search TAPIS | 200, RC=0 — TAPIS ģeotelpiskie dati **CC0-1.0**; Rīga plan GDB/SHP CC-BY-4.0 | `lv-datagov-tapis.json` |
| 21 | LV TAPIS | DPPS package as WFS GetCapabilities | 200, 104,102 B, RC=0 — **WFS 2.0.0 live**, 18 feature types | `lv-dpps-probe.xml` |
| 22 | LV TAPIS | DescribeFeatureType funkcionalais_zonejums | 200, RC=0 — zone code + doc linkage; NO numeric envelope attrs | `lv-fz-describe.xml` |

Discovery searches (WebSearch/WebFetch, 2026-09-02): Boverket planbestämmelsekatalog pages;
island.is HMS/Skipulagsstofnun pages (Skipulagsvefsjá Oct 2025, "opin gögn", WMS/WFS declared);
luk.skipulag.is service URLs; Lantmäteriet NGP tech pages (STAC/OAPIF + Basic Auth/OAuth2);
geonorge/NAP service URLs (nap.ft.dibk.no; legacy WMS terminating 1.1.2026); data.gov.lv TAPIS.

## HONEST GAPS (what this lane did NOT do)

1. **SE**: did not onboard to NGP — prickmark-as-served remains model-level, not payload-proven.
2. **NO**: did not land a non-empty GetFeatureInfo hit; did not test the Norge digitalt gate.
3. **IS**: licence read from island.is prose ("opin gögn"), exact licence id unread; the
   aðalskipulag ákvæði (provision) layers not schema-probed — height-in-metres slot UNKNOWN;
   Byggingarreitur3D service not feature-probed.
4. **FI**: the data-permit (non-open) Ryhti product was not requested — rakennusala serving
   inside it is inferred from the kaavatietomalli spec, not from a payload.
5. **LV**: only the `Teritorija_454` DPPS package enumerated — other packages may carry more
   layers; likumi.lv TIAN structure not re-verified this lane [BANKED stands].
6. **LT**: MAX_INTENS unit question remains OPEN [BANKED LT-1 ⚠] — blocker for GFA math, not
   for geometry consumption; layer-group 69-vs-83 plan-family split not decoded.
7. **DK**: nothing — the exemplar chain is complete. (BBR remains key-gated for buildings; not
   an envelope axis.)
