# ENVELOPE GEOMETRY CENSUS — LANE CENSUS-CENTRAL (DE · AT · CH · LI · PL · CZ · SK · HU · SI)

> Campaign: envelope-geometry-census 2026-09-02 · Authority: `docs/01-strategy/STR-EUROPEAN-ENVELOPE-SOURCES.md`
> (§8 Type A explicit GEOMETRY > Type B explicit PARAMETERS > Type C derive; §10 defines this census).
> Question, verbatim: *"Across Europe, where does an authoritative source already publish the GEOMETRIC
> CONSEQUENCE of planning rules?"*
> Method: REUSED probe-verified rows from `audit/europe-site-intel/2026-08-31/lanes/germany-denmark-switzerland.md`,
> `lanes/rest-of-europe-sweep.md`, `lanes/netherlands-poland-lithuania-estonia.md`,
> `impl/e5-asis-national-sweep.md` (cited per row, never re-derived) + **NET-NEW live probes this lane
> (2026-09-02)** on the envelope-geometry axes those sweeps did not ask. Every live probe ran with
> `User-Agent: PRYZM-Research/1.0 (+https://pryzm.app; contact pryzmhello@gmail.com)`; raw payloads in
> `transcripts-central/` beside this file. UNKNOWN ≠ absent ≠ zero; the probe that would close each
> UNKNOWN is named. GetCapabilities was never treated as an inventory — feature types were enumerated
> and features fetched.

---

## TYPE-A HEADLINE — every place in this lane where explicit envelope/field/line geometry is SERVED, with the live proof

1. **DE / Mecklenburg-Vorpommern — Baulinie + Baugrenze as WFS feature types, LIVE.**
   `https://demo.bauleitplaene-mv.de/ows/xplanung` GetCapabilities → HTTP 200, 59,719B; feature types
   include **`ms:bp_baulinie_lines`, `ms:bp_baugrenze_lines`**, `ms:bp_baugebietsteilflaeche_polygons`
   (the GRZ/GFZ/Z carrier, re-proved 2026-08-31), `ms:bp_gebaeudeflaeche_polygons`. GetFeature
   `bp_baugrenze_lines` → HTTP 200: inline `gml:Curve` EPSG:25833, **`rechtscharakter=1000` /
   `Festsetzung (1000)`** (legally binding determination), plus schema slots `bautiefe`
   (building depth), `geschossmin`/`geschossmax`, `hoehenangabe` on the same feature — building-line
   geometry WITH envelope parameters on one object. (`transcripts-central/mv-caps.xml`, `mv-baugrenze-f1.xml`)

2. **DE / Hamburg — a full XPlanGML 5.1 OBJECT WFS the 2026-08-31 lane missed.**
   `https://geodienste.hamburg.de/HH_WFS_xplan_dls` ("XPlanWFS51") GetCapabilities → HTTP 200, 181,823B —
   **`xplan:BP_BauGrenze`, `xplan:BP_BauLinie`, `xplan:BP_UeberbaubareGrundstuecksFlaeche`
   (buildable-plot-area polygons = the German byggefelt), `xplan:BP_BaugebietsTeilFlaeche`** among ~80
   BP_/FP_ types. Live GetFeature BP_BauGrenze → HTTP 200, inline curve EPSG:25832,
   `rechtscharakter=1000`, xlink to its `BP_Bereich` (plan linkage). **Honest counts (resultType=hits):
   BauGrenze 45 · BauLinie 0 · UeberbaubareGrundstuecksFlaeche 41 · BaugebietsTeilFlaeche 6** — this
   5.1 endpoint carries a small (new-plan) corpus; Hamburg's older-version DLS endpoints (4.1/5.0
   sibling services exist per the Aachen/KRZN xPlanBox pattern) were NOT enumerated this lane — probe
   named: enumerate `geodienste.hamburg.de` xplan services per XPlanung version.
   ⭐ The 2026-08-31 lane's Hamburg row ("plan outline + PDF only", from `HH_WFS_Bebauungsplaene`) was
   **a different service on the same host** — the GetCapabilities-is-not-an-inventory lesson, again.
   (`hh-xplan-caps.xml`, `hh-baugrenze-f1.xml`, `hh-hits-*.xml`)

3. **DE / NRW — the state serves the plan INDEX; municipal-IT xPlanBox instances serve the OBJECTS.**
   State level re-probed: `https://ogc-api.nrw.de/inspire-lu-bplan/v1/collections?f=json` → HTTP 200,
   collections = **`['spatialplan']` only** (82,007 plans, outline + PDF links — banked 2026-08-31; no
   Baugrenze/Baulinie collection). NET-NEW: **KRZN (Kommunales Rechenzentrum Niederrhein), Kreis Kleve**
   `https://xplanservices.krzn.de/kleve/xplansyn-wfs/services/xplansynwfspre` GetCapabilities → HTTP 200,
   441,629B, full xplan-syn model incl. `xplan:BP_BauGrenze`, `xplan:BP_BauLinie`, `xplan:BP_Baugebiet`,
   `xplan:BP_AbweichungVonBaugrenze`. GetFeature BP_BauGrenze → **numberMatched=161**; first feature:
   `xpVersion=5.4`, `xpPlanName=Schneppenbaum_Nr_5_Hasselt-Sued_11_vereinfachte_Aenderung`,
   `rechtscharakterWert=Festsetzung`, geometry inline. Aachen runs the same stack
   (`xplanung.aachen.de/xplan-wfs/services/wfs41|wfs50`, surfaced by search, not probed). **NRW verdict:
   Land = index; the object tier is FEDERATED one level lower (municipal IT providers), consumable
   where it exists.** (`nrw-collections.json`, `nrw-krzn-kleve-caps.xml`, `nrw-krzn-baugrenze-*.xml`)

4. **SI — national WFS serves REGULATION LINES typed "Gradbena meja" (building/construction boundary), LIVE.**
   `https://ipi.eprostor.gov.si/wfs-si-mnvp-pa/ows` GetCapabilities → HTTP 200: **`SI.MNVP.PA:REG_CRTE_OPN`
   "Regulacijske črte (OPN)"** + `REG_POVRSINE_OPN` "Regulacijske površine (OPN)" + `NRP_OPN`
   (land use) + `EUP_OPN`/`PEUP_OPN` (planning units). GetFeature REG_CRTE_OPN → HTTP 200:
   **`REGL_VR_OP=Gradbena meja`** (typed line kind, `REGL_VR_ID=5`), **plan linkage** (`ID_PA=3668`,
   `NAZIV_AKTA=Tehnična posodobitev OPN Občine Središče ob Dragi…`), **validity dates**
   (`DATUM_VEL=2024-03-09`), geometry. Counts (hits): **REG_CRTE 10,869 · REG_POVRSINE 13,632 ·
   NRP_OPN 403,788** — the DK-byggefelt SHAPE (geometry + type + plan + validity) on a national,
   keyless endpoint; corpus partial (fills as municipalities pass ZUreP-3 technical updates).
   (`si-pa-wfs-caps.xml`, `si-regcrte-f1.xml`, `si-*-hits.xml`)

5. **CZ — the national planning standard SERVES "Zastavitelné území" (buildable territory) polygons, LIVE (pilot fill).**
   `https://mapy.gov.cz/server/rest/services` → HTTP 200, folders `UAP`, `UPD`; `UPD/DUP/MapServer` =
   the standardized plan layer set (service description: "Pilotná verzia … podľa podkladov MMR a
   Vyhlášky"): layer 15 **"Zastavitelné území"** → query `returnCountOnly` → **638 polygons**, sample
   feature carries `obec_kod=565709` (municipality linkage) + area/perimeter; layer 12 **"Plochy s
   rozdílným způsobem využití"** (zoning polygons) → **96,078**; layer 1 "Zastavěné území" → 5,554;
   layer 2 "Vymezení částí ÚP s prvky regulačního plánu" → 311. Keyless ArcGIS REST (query→JSON).
   Numeric indices stay in the textual parts. (`cz-server-services.json`, `cz-upd-*.json`)

6. **CH — the ÖREB cadastre serves building/street LINES and restriction polygons per parcel; THIRD canton live-verified this lane.**
   NET-NEW: **ZH** `https://maps.zh.ch/oereb/v2/extract/json?EGRID=CH480928387782` → HTTP 200, 40,353B:
   parcel HN8860 Horgen, LandRegistryArea 2,782 m², 3 restrictions (Grundnutzung `TypeCode C110301`,
   überlagernde Nutzung `C690902`, Lärmempfindlichkeit), each with resolvable law docs
   (`https://oerebdocs.zh.ch/getDoc?docid=1101` = Bauordnung Horgen); the ZH theme list carries
   **"Baulinien (kantonal/kommunal)" + Baulinien Eisenbahn/Flughafen/Nationalstrassen/Starkstrom**
   (`ch.BaulinienEisenbahnanlagen` code quoted in payload). Geometry NOT inlined in ZH (like BS;
   LU inlines) — the per-canton geometry seam now measured at 3 of 26. Banked (2026-08-31, reused):
   **BS extract = 11 × `ch.BauStrassenWeglinien` restrictions on one parcel**; LU extract inlines
   restriction geometry. (`zh-extract.json` + banked lane-2 CH-1)

7. **PL — a NATIONAL aggregation channel for drawn building lines exists: KIMPZP layer `wektor-lzb` = "Plany wektorowe — Linie zabudowy".**
   `https://mapy.geoportal.gov.pl/wss/ext/KrajowaIntegracjaMiejscowychPlanowZagospodarowaniaPrzestrzennego`
   GetCapabilities → HTTP 200 this lane; layers **`wektor-lzb` (building lines)**, `wektor-str`
   (zones), `wektor-pow/lin/pkt`, `granice`. WMS view + GetFeatureInfo only (no WFS), populated only
   where gminy vectorised voluntarily. Plus banked (2026-08-31, probe on the official ministry sample):
   **POG APP GML 2.0** `app:StrefaPlanistyczna` with `maksNadziemnaIntensywnoscZabudowy` (FAR),
   `maksWysokoscZabudowy` (m), `maksUdzialPowierzchniZabudowy` (% coverage), green share + versioning
   fields — Type B parameters national-mandatory; **`app:ObszarUzupelnieniaZabudowy`** (infill-permitted
   area polygons) is Type-A-shaped geometry in the same schema. (`kimpzp-caps.xml` + banked lane-4 PL-2/PL-3)

8. **AT / Upper Austria — per-STOREY zoning polygons served as WFS, LIVE (the closest AT gets to envelope objects).**
   `https://ags.doris.at/arcgis/services/HVD/MapServer/WFSServer` GetCapabilities → HTTP 200:
   **`HVD:FLWI_Geschossbezogen`** (storey-related zoning), `HVD:FLWI_Widmungen_Flächen`,
   `HVD:FLWI_Widmungen_Linien`, `HVD:FLWI_Überlagerung_Bauland`. GetFeature FLWI_Geschossbezogen →
   HTTP 200: **`KENNZAHL=11010` (Widmung code) + `GESCHOSS=1` + `GEM_NR=41008`** + InspireID + geometry —
   zoning geometry carrying a storey dimension. Baulinien/Bebauungsplan numerics are NOT here (see AT row).
   (`at-doris-hvd-caps.xml`, `at-flwi-geschoss-f1.xml`)

**Not Type A anywhere in this lane:** Vienna's OGD WFS (377 typenames enumerated this lane — no
Baulinie/Bauklasse layer; `GENFLWIDMUNGOGD` is generalised zoning only); Liechtenstein (zoning polygons
served but attribute-less, see LI row); SK and HU (nothing machine-served found).

---

## THE FOUNDER'S TABLE — one row per country

Columns verbatim from §10. "coverage" appears twice in the mandate; rendered as **cov-param**
(built-coverage %) and **cov-geo** (geographic completeness). MRQ = machine-readable quality.
Evidence: [B]=banked sweep row (dated), [P]=live probe this lane (transcript named above).

| Country | Authority | Dataset | API/download | Parcel linkage | Zoning geometry | Building-FIELD geometry | Building-LINE geometry | Height | FAR | cov-param | Setbacks | Validity | Licence | cov-geo | MRQ |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **DE** | 16 Länder (xleitstelle standard; NRW/MV/HH probed) | XPlanung/XPlanGML B-Pläne; INSPIRE PLU indexes | per-Land WFS/OGC-API [P]; municipal xPlanBox WFS [P] | via ALKIS Flurstückskennzeichen (keyless WFS ×15 [B]); plan↔parcel by intersection | plan outlines near-national [B]; object-level zoning in MV/HH/xPlanBox islands [P] | **YES where vectorised**: `BP_UeberbaubareGrundstuecksFlaeche` (HH 41 live [P]), `BP_BaugebietsTeilFlaeche` (MV live [B+P]) | **YES where vectorised**: `BP_BauGrenze`/`BP_BauLinie` (MV [P], HH 45 [P], KRZN-Kleve 161 [P]) | `hoehenangabe` slot, 0% filled MV [B]; Z storeys 30% | GFZ slot, 5% fill MV [B] | GRZ 33% fill MV [B] | in-object (`bautiefe`) where vectorised [P]; else PDF | plan status + dates in model [B] | DL-DE-BY-2.0 / DL-Zero (per banked; BY gated) | corpus majority = PDF; structured = MV-class + new plans (~1–3%/yr growth) [B] | XPlanGML = excellent standard; DELIVERED fraction small |
| **AT** | 9 Bundesländer (no national standard) | Flächenwidmung per Land; Bebauungsplan = docs | Vienna OGD WFS [P re-conf]; OÖ DORIS HVD WFS [P] | BEV DKM parcels CC BY 4.0 snapshots [B]; zone↔parcel by intersection | **YES 2 Länder probed**: Vienna `GENFLWIDMUNGOGD` [B], OÖ `FLWI_Widmungen_Flächen` [P] | NO (none found; probe: remaining 7 Länder WFS enumeration) | NO as data — OÖ `FLWI_Widmungen_Linien` exists, content untyped this lane [P]; Vienna Baulinien = plan PDFs [B] | OÖ `FLWI_Geschossbezogen` GESCHOSS per zone [P]; Bauklasse heights = PDF | NO | NO | NO (PDF) | not observed in probed WFS | CC BY 3.0/4.0 AT (probed services) | 2/9 Länder machine-verified; 7 unprobed [B] | zoning GIS-ATTR; envelope numerics PDF-locked |
| **CH** | Confederation + 26 cantons (ÖREB fed. model) | ÖREB cadastre M2M; geodienste.ch NPL; ARE Bauzonen | cantonal `getegrid`/`extract/json` keyless (LU/BS [B], ZH [P]) | **EGRID native** — coords→EGRID→extract, 1 call [B] | YES national (NPL `grundnutzung` [B]; extract TypeCodes [B+P]) | NO (no byggefelt analogue; Baubereiche live in commune plan PDFs) | **YES as per-parcel restrictions**: `ch.BauStrassenWeglinien` ×11 on one BS parcel [B]; ZH Baulinien themes [P]; geometry inline LU only — cantonal-WFS fallback needed [B+P] | NOT in extract (Reglement PDF) [B] | typed OPTIONAL slot in MGDM, ~0% delivered [B] | NO | Baulinien ARE the drawn setback instrument [B] | Lawstatus + doc links best-in-class [B+P] | GREEN federal; geodienste per-canton mosaic [B] | national (all cantons run ÖREB) | evidence-graph best in Europe; numerics doc-bound |
| **LI** | Amt für Bau und Infrastruktur / ABI | INSPIRE services + AV; Zonenpläne are municipal | `service.geo.llv.li/mapserver/INSPIRE` WMS+WFS [P]; AV GPKG/DXF downloads per Gemeinde [P via portal] | AV parcels per 11 Gemeinden [P portal] | **partial**: `LU.SpatialPlan` + `LU.ZoningElement` WFS, 3,668 features, **geometry-only — DescribeFeatureType shows NO zone-code attribute** [P] | NO | NO | NO | NO | NO | NO | NO | licence.txt on portal (not read this lane — probe named) | country-wide zoning polygons; semantics absent | Zonenplan/Bauordnung per Gemeinde = PDF |
| **PL** | MRiT/GUGiK (national APP GML standard) + 2,477 gminy | POG (plan ogólny) APP GML 2.0; MPZP; KIMPZP; RU | KIMPZP WMS [P]; RU (WFS/CSW stated, endpoints undiscoverable until 2026-11-30 [B]); ULDK parcels [B] | ULDK GetParcelByXY keyless [B]; zone↔parcel by intersection | YES: MPZP boundaries + POG strefy national [B]; `wektor-str` where vectorised [P] | `app:ObszarUzupelnieniaZabudowy` (infill-permitted polygons) in POG schema [B] | **`wektor-lzb` "Linie zabudowy" national WMS layer** [P], voluntary-vectorised subset; APP GML linie zabudowy where gminy publish | `maksWysokoscZabudowy` (m) per strefa — national mandatory [B] | `maksNadziemnaIntensywnoscZabudowy` [B] | `maksUdzialPowierzchniZabudowy` % [B] | linie zabudowy layer [P] (geometry, not numeric) | `wersjaId`/`obowiazujeOd` versioning IN schema [B] | public geodetic open regime [B] | POG filling NOW (deadline was 2026-08-31; RU complete ≥2026-11-30) [B] | best-in-lane Type B; standard excellent |
| **CZ** | MMR (NGÚP) + ČÚZK | Standardized ÚP layers (DUP); RÚIAN cadastre | `mapy.gov.cz/server/rest/services/UPD/DUP` keyless REST [P]; ČÚZK WFS/bulk [B] | RÚIAN parcels daily-change [B]; `obec_kod` on plan features [P] | YES: "Plochy s rozdílným způsobem využití" 96,078 [P] | **"Zastavitelné území" polygons — 638 live (pilot fill)** [P]; reg-plan-element parts 311 [P] | regulační-plán lines defined in standard, not yet observed served — probe: DUP_HLV/DUP_ZCU layer enumeration | NO (text) | NO (text) | NO (text) | NO (text) | plan registry status; per-feature dates not checked [P] | open data; licence text unread (banked caveat stands [B]) | new/changed plans mandatory-standard; legacy stock heterogeneous [B] | emerging Type A; numerics text-bound |
| **SK** | ÚGKK (cadastre); Office for Spatial Planning (reform) | cadastre HVD WFS; územné plány = municipal PDFs | ZBGIS/INSPIRE WFS daily [B]; no planning API | cadastre HVD [B] | NO national (scattered municipal GIS) [B] | NO | NO | NO | NO | NO | NO | NO | CC-BY-tagged cadastre [B] | planning: none national; state IS ~2028 [B] | cadastre good; planning pre-digital |
| **HU** | Lechner Tudásközpont (state monopolist) | E-TÉR plans; TAKARNET cadastre (PAID) | E-TÉR/Lechner WMS/WMTS view-only (search-verified this lane); no open WFS found | cadastre PAID quarterly [B] | view-only WMS (regional plans); machine access unverified [B + search P] | NO | NO | NO | NO | NO | NO | NO | fee-gated cadastre [B] | national systems exist, closed | OTÉK rules = legal text; delivery = Lechner relationship |
| **SI** | MNVP + GURS | Prostorski akti (OPN) national aggregation; KN cadastre | `ipi.eprostor.gov.si/wfs-si-mnvp-pa/ows` keyless WFS [P]; JGP bulk [B] | KN parcels CC BY 4.0 [B]; plan features carry act id [P] | **YES national**: NRP_OPN 403,788 polygons WFS [P] | `REG_POVRSINE_OPN` regulation surfaces 13,632 [P] | **`REG_CRTE_OPN` 10,869 lines, typed (`Gradbena meja`), plan-linked, dated** [P] | NO (PIP text) | FI in municipal text [B] | FZ in municipal text [B] | regulation lines are the drawn instrument [P] | `DATUM_VEL` valid-from per feature [P] | CC BY 4.0 (banked e-prostor read) [B] | land-use national-complete; reg-lines partial (fills via ZUreP-3 updates) | strongest small-country Type A in this lane |

---

## PER-COUNTRY VERDICTS (one line each)

- **DE — CONSUME-GEOMETRY on the vectorised islands (MV, HH, municipal xPlanBox e.g. KRZN/Aachen: Baulinie + Baugrenze + überbaubare Flächen live WFS), DOCUMENTS-ONLY for the corpus majority; the XPlanGML content model is the canonical DE vocabulary either way.**
- **AT — COMPILE-PARAMETERS at best: Widmung zoning geometry live in the 2 probed Länder (+ OÖ per-storey zone polygons), but building-line/envelope numerics are Bebauungsplan PDFs; 7 Länder unprobed (UNKNOWN, not absent).**
- **CH — CONSUME-GEOMETRY for Baulinien + restriction/zone polygons via the federated ÖREB machine (LU/BS banked, ZH live this lane; geometry-inlining varies per canton), DOCUMENTS-ONLY for the numeric envelope values — the extract hands you the exact source document per parcel.**
- **LI — DOCUMENTS-ONLY: 3,668 attribute-less zoning polygons on the INSPIRE WFS, cadastre downloadable per Gemeinde; the binding Zonenplan/Bauordnung is municipal PDF (11 Gemeinden).**
- **PL — COMPILE-PARAMETERS (national POG: FAR + height + coverage + green per strefa, versioned, mandatory, landing THIS QUARTER) with a partial CONSUME-GEOMETRY channel (KIMPZP linie-zabudowy + POG infill polygons); re-check RU service endpoints after 2026-11-30.**
- **CZ — STRUCTURED-RULES turning into CONSUME-GEOMETRY: the national standard already SERVES buildable-territory + zoning polygons keyless (pilot fill: 638 / 96,078), numeric indices remain in plan text.**
- **SK — DOCUMENTS-ONLY: excellent cadastre, no national machine-readable planning channel; state planning IS due ~2028 — do not build extraction before it lands.**
- **HU — OPAQUE: state-monopolist delivery (Lechner), paid cadastre, view-only plan WMS; the country adapter is a commercial relationship, not a probe.**
- **SI — CONSUME-GEOMETRY: national WFS serves typed building-boundary lines ("Gradbena meja") + regulation surfaces + complete land-use, plan-linked and validity-dated; numeric FZ/FI stay in municipal text (STRUCTURED-RULES on that axis).**

---

## PROBE LEDGER (all live HTTP this lane, 2026-09-02, foreground, RC read immediately)

| # | Target | Request | Result | Transcript |
|---|---|---|---|---|
| 1 | DE-MV XPlanung WFS | GetCapabilities | 200, 59,719B; `bp_baulinie_lines`+`bp_baugrenze_lines` | mv-caps.xml |
| 2 | DE-MV | GetFeature bp_baugrenze_lines count=2 | 200; rechtscharakter=1000 Festsetzung, inline curve | mv-baugrenze-f1.xml |
| 3 | AT Vienna OGD WFS | GetCapabilities | 200, 371,098B; 377 typenames; NO Baulinie layer | wien-caps.xml, wien-typenames.txt |
| 4 | DE-NRW OGC API | /collections?f=json | 200; `['spatialplan']` only | nrw-collections.json |
| 5 | DE-HH xplan DLS | GetCapabilities | 200, 181,823B; XPlanWFS51 full object model | hh-xplan-caps.xml |
| 6 | DE-HH | GetFeature BP_BauGrenze count=1 | 200; inline curve, plan xlink | hh-baugrenze-f1.xml |
| 7 | DE-HH | resultType=hits ×4 types | 45 / 0 / 41 / 6 | hh-hits-*.xml |
| 8 | PL KIMPZP WMS | GetCapabilities | 200; `wektor-lzb` "Linie zabudowy" | kimpzp-caps.xml |
| 9 | CH-ZH ÖREB | extract/json?EGRID=CH480928387782 | 200, 40,353B; 3 restrictions, doc links, Baulinien themes | zh-extract.json |
| 10 | SI planning WMS | GetCapabilities | 200; REG_CRTE/REG_POVRSINE/NRP layers | si-pa-wms-caps.xml |
| 11 | SI planning WFS | GetCapabilities | 200, 96,966B; 7 feature types | si-pa-wfs-caps.xml |
| 12 | SI | GetFeature REG_CRTE_OPN count=2 + hits | 200; Gradbena meja, ID_PA, DATUM_VEL; 10,869 | si-regcrte-f1.xml, si-regcrte-hits.xml |
| 13 | SI | hits REG_POVRSINE / NRP | 13,632 / 403,788 | si-regpov-hits.xml, si-nrp-hits.xml |
| 14 | CZ mapy.gov.cz | /server/rest/services + UPD folder | 200; DUP/DUP_HLV/DUP_VPSOA/DUP_ZCU | cz-server-services.json, cz-upd-folder.json |
| 15 | CZ DUP MapServer | service JSON + layer queries 1/2/12/15 | 200; Zastavitelné území 638; Plochy RZV 96,078 | cz-dup-*.json |
| 16 | CZ | /arcgis/rest/services (root) | **503** (server variant); /server root is the live one | cz-probe-fad4fb.json |
| 17 | LI state WMS | wmsli GetCapabilities | 200, 330,130B; 120 layers, no Zonenplan | li-wmsli-caps.xml |
| 18 | LI INSPIRE WMS+WFS | GetCapabilities ×2 | 200; LU.SpatialPlan + LU.ZoningElement | li-inspire-caps.xml, li-inspire-wfs-caps.xml |
| 19 | LI | GetFeature/hits/DescribeFeatureType ZoningElement | 200; 3,668 features, **geometry-only schema** | li-zoning-*.xml |
| 20 | AT DORIS HVD WFS | GetCapabilities | 200; FLWI_* incl. Geschossbezogen | at-doris-hvd-caps.xml |
| 21 | AT DORIS | GetFeature FLWI_Geschossbezogen count=1 | 200; KENNZAHL 11010, GESCHOSS 1, GEM_NR | at-flwi-geschoss-f1.xml |
| 22 | DE-NRW KRZN Kleve | xplansyn GetCapabilities + BauGrenze hits + f1 | 200 ×3; 161 features, xpVersion 5.4 | nrw-krzn-*.xml |

WebSearch/WebFetch discovery (not probes): cadastre.ch ÖREB URL syntax + ZH base URL; service.geo.llv.li
download page; DORIS HVD endpoint via INSPIRE metadata records; NGÚP background (uzemniplanovani.gov.cz,
mmr.gov.cz); NRW xPlanBox instances (aachen/krzn); HU E-TÉR WMS pages (lechnerkozpont.hu).

## HONEST GAPS

1. **7 of 9 AT Länder unprobed** for Flächenwidmung WFS (Salzburg/Styria/Tyrol/NÖ/Carinthia/Vorarlberg/Burgenland) — probe: INSPIRE metadata search per Land, then caps+feature.
2. **Hamburg per-version xplan endpoints not enumerated** — the 5.1 corpus is 45 BauGrenzen; the full Hamburg vectorised stock may sit on 4.1/5.0 siblings.
3. **DE Länder beyond MV/HH/NRW/BE/BW/ST**: which of the remaining 10 serve object-level XPlanGML is UNKNOWN (Minonexus names Bremen/SH/ST/BY-pilot as structured-Festsetzung servers — LEADS, not probes).
4. **CH 23 of 26 cantons** not extract-probed; the geometry-inlining seam (LU yes / BS+ZH no) needs the per-canton matrix at ship time.
5. **CZ DUP_HLV / DUP_ZCU / DUP_VPSOA services not layer-enumerated** (regulační-plán line content may sit there); licence text still unread (banked caveat).
6. **PL RU WFS/CSW endpoints** still undiscoverable pre-transition — re-check after 2026-11-30 (banked open item, unchanged).
7. **LI licence.txt not read**; whether any Gemeinde publishes vector Zonenplan with attributes is UNKNOWN (probe: 11 municipal geoportals).
8. **SK/HU carried on banked rows** — no new probes this lane; HU E-TÉR machine access remains search-verified-only.
