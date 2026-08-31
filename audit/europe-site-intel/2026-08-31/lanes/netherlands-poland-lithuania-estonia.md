# LANE 4 — NETHERLANDS · POLAND · LITHUANIA · ESTONIA (deep audit)

> Lane of the europe-site-intel campaign (BRIEF.md §5–§6, §30, §32). Research run 2026-08-31.
> Every claim carries a URL + date-checked. Live probes marked **PROBED**; doc-only claims marked
> **DOC-ONLY**. Classification letters per BRIEF §1 (A existing data · B existing OSS · C existing
> API/service · D existing standard · E derivable · F extractable · G genuinely missing · H Pryzm IP).
> Licence colour GREEN/YELLOW/RED per §9; access-vs-ownership option 1–6 per §10
> (1 query dynamically · 2 cache · 3 mirror · 4 cloud-optimise · 5 store derived only · 6 metadata+on-demand).

## Status: COMPLETE — NL/PL/LT/EE all probed; see end-of-file lane summary

## Pryzm prior art consulted (before judging anything "new")
- `docs/04-reference/jurisdictions/nl/` — full country dir exists. 3DBAG + AHN + BRK/PDOK
  live-verified 2026-07-21/25 (spike): `api.3dbag.nl` 200 (CityJSON LoD 0/1.2/1.3/2.2, CC BY 4.0,
  EPSG:7415), AHN WCS `dtm_05m` 200 (CC0), PDOK kadastralekaart WFS v5_0 wired
  (`parcelProviders/registry.ts` `pdok-nl`, real parcel ASD04 F 6685). BGT OGC API returned
  HTTP 000 from the spike env (flagged, not dead). **DSO "Regels op de kaart" explicitly NOT YET
  PROBED — named "the critical unknown" in `nl/LEGISLATION-RATE.md`.** This lane closes that gap.
- **No `pl/`, `lt/`, `ee/` jurisdiction dirs exist** (verified `ls docs/04-reference/jurisdictions/`
  2026-08-31). Poland, Lithuania, Estonia are green-field for Pryzm.

---

# NETHERLANDS (NL) — the machine-readable-law flagship

## NL-1 · HEADLINE FINDING — the Omgevingswet rules layer IS structured objects, PROBED at schema level (2026-08-31)

**This is the architecture datapoint the brief asked for.** The Dutch national planning-rule
delivery is a **typed-object API, not documents**, in BOTH legal regimes:

### (a) Omgevingsplan / IMOW — Ozon "Omgevingsdocumenten Presenteren" API v8.5.2 — **PROBED**
- OpenAPI spec is served **keyless**:
  `https://service.pre.omgevingswet.overheid.nl/publiek/omgevingsdocumenten/api/presenteren/v8/openapi.json`
  → fetched live 2026-08-31, `version: 8.5.2`, 39 paths, 214 schemas (saved to scratchpad).
- Production base `https://service.omgevingswet.overheid.nl/publiek/omgevingsdocumenten/api/presenteren/v8/`
  (probed 2026-08-31: **503 "onderhoud Omgevingsloket"** — maintenance window at probe time, not a
  gate verdict; pre-prod probed instead). Data endpoints return **401 "Inloggegevens ontbreken"**
  without `x-api-key` (probed `/regelingen` on pre-prod).
- **Schema-level proof of structured numeric rules** (from the live openapi.json, not docs):
  - `NormSpec`: `naam` (example: **"Bouwhoogte"**), `type` (TypeNorm), `eenheid` (unit from the
    national value list `https://standaarden.omgevingswet.overheid.nl/id/waardelijst/Eenheid`),
    `groep` (Normgroep), `normwaarden[]`.
  - `NormwaardeSpec`: **`kwantitatieveWaarde: number`** · `kwalitatieveWaarde: string` ·
    **`waardeInRegeltekst`** (the honest fallback when the value only lives in rule prose) ·
    `locatieRefs` → geometry. Identifiers like `nl.imow-gm1911.normwaarde.20240101`
    (per-municipality IMOW namespaces).
  - So a norm value is: named, unit-typed, quantitative, geometry-referenced, with symbolisatie —
    exactly the §11 provenance-JSON shape Pryzm's canonical model wants. The three-way value split
    (kwantitatief / kwalitatief / in-regeltekst) is a ready-made confidence taxonomy.
- Spatial queries: `_zoek` endpoints (POST, point/line/polygon, RD EPSG:28992) on regelingen,
  regeltekstannotaties, omgevingsvergunningen etc.
- **CLASS: C (existing API) + D (IMOW/STOP-TPOD standards) · Licence: government data, reuse
  regime with attribution — YELLOW-GREEN pending the fair-use-policy read · Access option: 1
  (query dynamically), 2 (cache) in practice; bulk mirror exists (see NL-3).**
- **Gate: API key REQUIRED, but FREE and open to third-party ICT vendors.** Request form asks
  name/email/organisation/phone; separate pre-prod and production forms; fair-use policy;
  rate limit 200 req/s. Checked 2026-08-31:
  - Register page: https://developer.omgevingswet.overheid.nl/api-register/api/omgevingsdocument-presenteren/
  - Key form: https://developer.omgevingswet.overheid.nl/formulieren/api-key-aanvragen-0/ ("gratis")
  - Terms: https://developer.omgevingswet.overheid.nl/site/gebruiksvoorwaarden/ (site-level; API
    fair-use policy at /services/fair-use-policy/ — read before production use).
  - **ACTION for Pryzm: request pre-prod + production keys THIS WEEK — it is a form, not a
    procurement.** (SE/DK-style identity gates do not apply here.)

### (b) Transitional layer (bestemmingsplannen, "tijdelijk deel") — Ruimtelijke Plannen API v4 — **PROBED**
- `https://ruimte.omgevingswet.overheid.nl/ruimtelijke-plannen/api/opvragen/v4/openapi.json`
  keyless (fetched 2026-08-31, 61 paths); data endpoints 401 `Missing API Key` (same free DSO key
  regime; probed `/plannen` → Kadaster auth error).
- **IMRO2012 is ALSO structured**: `/plannen/{planId}/maatvoeringen` returns `BaseMaatvoering`
  objects — `naam` (example: **"maximum goothoogte (m), maximum bouwhoogte (m)"**), `omvang[]`
  as `{naam: "maximum goothoogte (m)", waarde: "24"}` pairs, GeoJSON `geometrie`,
  `verwijzingNaarTekst` (link to plan text). Plus `/bouwvlakken`, `/bestemmingsvlakken` (zone/use),
  `/functieaanduidingen`, `/gebiedsaanduidingen`, `/besluitvlakken`, `_zoek` spatial POSTs.
- **Why this matters:** most of NL's municipal territory in 2026 is still governed by the
  transitional layer (IMRO bestemmingsplannen absorbed van rechtswege into the omgevingsplan) —
  and that layer is queryable with numeric maatvoering values TOO. NL machine-readability is not
  "new regime only".

### (c) Coverage nuance — TAM-IMRO (do not overstate IMOW coverage)
- TAM-IMRO (temporary alternative: publishing omgevingsplan amendments in the OLD IMRO standard)
  **ended 2026-01-01** — from that date new omgevingsplan amendments MUST be STOP/TPOD
  (https://iplo.nl/regelgeving/instrumenten/omgevingsplan/wijzigen-omgevingsplan/einde-tam-imro-per-1-januari-2026/,
  checked 2026-08-31; VNG: https://vng.nl/nieuws/tam-imro-eindigt-per-1-januari-2026).
- TAM-IMRO plans in flight (design deposited before 2026) may complete under TAM; all TAM plans
  must be converted to STOP/TPOD **by 2032-01-01**.
- Press reporting (Gemeente.nu, checked 2026-08-31): before the cutoff, about two-thirds of
  municipalities fell back on TAM because STOP/TPOD tooling was "too complex and error-prone".
  **Consequence: IMOW-annotated (Normwaarde-bearing) coverage is a growing MINORITY layer in 2026;
  the IMRO maatvoering layer carries most parcels today. A NL adapter must consume BOTH APIs and
  merge by temporal validity.** This mirrors Pryzm's ES experience (per-ficha case law vs ring).

## NL-2 · Context stack (PDOK) — re-verified live 2026-08-31, closes Pryzm's flagged BGT blocker
| Source | Probe (2026-08-31) | Licence | Class | Option |
|---|---|---|---|---|
| **BGT** (large-scale base topography) `https://api.pdok.nl/lv/bgt/ogc/v1/collections` | **200 LIVE — 49 collections** (begroeidterreindeel, wegdeel, waterdeel, pand, ...). The 2026-07-21 spike's HTTP 000 was the spike env, NOT the service — **L-511 BGT blocker can be closed** | **CC0 1.0** (link in the API response itself) | A+C | 1/2; ATOM bulk exists for 3/4 |
| **3D Basisvoorziening** `https://api.pdok.nl/kadaster/3d-basisvoorziening/ogc/v1/collections` | **200 LIVE — 8 collections**: `gebouwen`, `terreinen`, `basisbestand_gebouwen`, `hoogtestatistieken_gebouwen`, `digitaalterreinmodel`, `digitaaloppervlaktemodel_20cm`/`_8cm` | **CC BY 4.0** (in response) | A+C | 1/2 |
| **3DBAG** `https://api.3dbag.nl/collections/pand` | **200 LIVE re-confirmed today** (was live-verified 2026-07-21; CityJSON LoD 0/1.2/1.3/2.2, EPSG:7415, CC BY 4.0) | CC BY 4.0 | A+C | 1/2 (or 3D Tiles bulk) |
| **BAG WFS** `https://service.pdok.nl/lv/bag/wfs/v2_0` | GetCapabilities **200** | CC BY 4.0 (BAG) | A+C | 1/2 |
| **BRK Kadastralekaart WFS v5_0** `https://service.pdok.nl/kadaster/kadastralekaart/wfs/v5_0` | GetCapabilities **200** (already WIRED in Pryzm `parcelProviders/registry.ts` as `pdok-nl`) | open (PDOK), attribution | A+C | 1 |
| **AHN** WCS `dtm_05m`/`dsm_05m` | (Pryzm live-verified 2026-07-25; not re-probed) | CC0 | A+C | 1/4 (COG available) |
| **Geometrieen Omgevingswet** (PDOK vector tiles of ALL omgevingsdocument geometries, daily refresh, Actueel v2 + Volledig v2) | DOC-ONLY (PDOK article https://www.pdok.nl/introductie/-/article/geometrie%C3%ABn-omgevingswet checked 2026-08-31; endpoint path not confirmed — get it from the PDOK dataset page when keyed work starts) | PDOK open | A | 1 (tiles) |

**NL verdict on §16 federation-vs-master:** federation wins trivially here — the state already
runs the federation (PDOK + DSO-LV). Pryzm should own NOTHING Dutch except derived envelopes and
the evidence graph (option 5).

## NL-3 · Bulk / mirror paths (for §10 options 3–4)
- **Ozon Downloadservice** ("Omgevingsdocument downloaden") — regulation versions as zip: legal
  text + GIOs + OW-objects. Doc: https://developer.omgevingswet.overheid.nl/publish/pages/204330/ozon-api-downloadservice-v1_1.pdf
  (checked 2026-08-31). DOC-ONLY (key-gated like the rest).
- **officielebekendmakingen.nl / SRU** — every STOP publication is also on the national official
  publications platform (open, keyless SRU API) — raw STOP XML mirror path without DSO keys.
  DOC-ONLY, not probed this lane; flag for the adapter phase.
- 30 APIs total in the DSO register (checked 2026-08-31,
  https://developer.omgevingswet.overheid.nl/api-register/) — incl. **Toepasbare Regels** (STTR
  executable permit-check question trees: relevant as prior art for Pryzm's rule engine — the
  Dutch state already runs machine-EXECUTABLE rules, distinct from machine-READABLE norms) and
  **Verzoeksroutering** (competent-authority resolution by activity+location).

## NL-4 · Kadaster ownership layer — the ONE priced/gated Dutch dataset
- Parcel GEOMETRY + identifiers (kadastralekaart/BRK via PDOK): **open, keyless, probed** (NL-2).
- Parcel OWNERSHIP (eigenaar/eigendomsinformatie): **NOT open data** — "ter bescherming van de
  privacy worden persoonsgegevens uit de BRK niet aangeboden als open data" (Kadaster policy,
  https://www.kadaster.nl/over-ons/beleid/openbaarheid-en-privacy, checked 2026-08-31). Priced
  products: Eigenaarsinformatie €3.70/object; verkorte info €0.24/perceel; BRK Bevragen API free
  ONLY for government via budget financing
  (https://www.kadaster.nl/zakelijk/over-ons/financieel/tarieven, checked 2026-08-31).
- **Verdict: not a blocker for Product A/B (envelope needs geometry+rules, not owners). Classify
  ownership as a gated PAID add-on (SE/DK-pattern: record the gate, data is not "missing").
  Licence RED for redistribution; option 6 (metadata + on-demand purchase) if ever needed.**

## NL-5 · §30 parcel chains (2 NL parcels, run live 2026-08-31)

### Parcel NL-A — Amsterdam centre (Dam-square block)
| Step | Result | Mode |
|---|---|---|
| Parcel | PDOK kadastralekaart WFS v5_0 bbox(121340,487190,121360,487210 RD): **ASD04 F 8039 (43 m²)**, **ASD04 F 8137 (69,670 m²)**, ASD05 G 9261 (689 m²) — live JSON, keyless | **DIRECT** |
| Buildings | 3DBAG items bbox 7415: `NL.IMBAG.Pand.0363100012243483`, `b3_dak_type: slanted`, LoD2.2 + heights — live, keyless. ⚠ API-drift note: `bbox-crs` now accepts `http://www.opengis.net/def/crs/EPSG/0/7415` but **400s on the `https://` form** the July spike used — the beta warning in Pryzm's nl/README ("pin the API version") was correct | **DIRECT** |
| Zone/plan/rules | Ozon presenteren v8 `_zoek` at point → regelteksten + omgevingsnormen (Normwaarde) + RP API v4 maatvoeringen for the tijdelijk deel. **Blocked today only by the free API key + a maintenance window**; verified end-user path: https://omgevingswet.overheid.nl/regels-op-de-kaart/ | **DIRECT (key-gated, free)** |
| Restrictions | gebiedsaanduidingen (both APIs); heritage: rijksmonument/beschermd stadsgezicht layers on PDOK (RCE services) — not probed this lane | DIRECT (expected) |
| Envelope/GFA | not delivered by the state — Pryzm computes from normwaarden (bouwhoogte, bebouwingspercentage FSI) + bouwvlak | **DERIVED (Pryzm IP)** |

### Parcel NL-B — Utrecht centre (Domplein)
| Step | Result | Mode |
|---|---|---|
| Parcel | Same WFS, bbox(136590,455890,136610,455910): **UTT00 C 1203 (164 m²)**, UTT00 C 6577 (459 m²), UTT00 C 6578 (85 m²) — live, keyless | **DIRECT** |
| Buildings | 3DBAG national — same path as NL-A (not re-pulled; national coverage confirmed by bbox extent in collection metadata) | **DIRECT** |
| Zone/plan/rules | as NL-A: dual-regime query (IMOW norm objects + IMRO maatvoeringen), free key | **DIRECT (key-gated, free)** |
| Envelope/GFA | DERIVED | DERIVED |

**NL chain verdict: every pre-envelope step is DIRECT. The Netherlands is the ONLY country in this
lane where the §30 chain has no document-derived step at all for IMOW-covered locations — and even
the transitional layer is structured. NL should be Pryzm's reference implementation for the
"authoritative machine-readable" (§3 category 1) rule path, ahead of DK (DK rate ~96% but NL richer
object model).**

## NL-6 · NL actions
1. **Request free DSO API keys (pre-prod + prod) now** — unblocks the last unprobed axis; then run
   the NL-A/NL-B rules step end-to-end and set `nl/LEGISLATION-RATE.md` (currently NOT YET
   ASSESSED) with real numbers.
2. Close the L-511 BGT blocker in `docs/04-reference/jurisdictions/nl/README.md` (BGT is live +
   CC0; probe evidence in this file).
3. Model the NL adapter on the dual-regime merge (IMOW Normwaarde ∪ IMRO maatvoering, temporal
   validity) — this shape generalises to every country with old+new plan stock.
4. IMOW/STOP-TPOD standards docs: https://docs.geostandaarden.nl/ow/imow/ (IMOW 3.x/4.0-ic,
   checked 2026-08-31) — the value lists (Eenheid, TypeNorm, Normgroep) are exactly the enum
   vocabulary Pryzm's canonical Rule model should import rather than invent (Class D: CONSUME).

---

# POLAND (PL) — mid-reform; the 2026 facts (no stale assumptions)

## PL-1 · The 2023–2026 planning reform — status AS OF TODAY (2026-08-31)
- **Plan ogólny gminy (POG)** replaces the studium. Adoption deadline was moved twice:
  2025-12-31 → 2026-06-30 → **2026-08-31 (today)**; the Aug-2026 extension was adopted by the
  Council of Ministers 2026-04-14 (checked 2026-08-31:
  https://www.rp.pl/samorzad/art43629041-to-juz-pewne-bedzie-wiecej-czasu-na-przygotowanie-planow-ogolnych,
  https://blog.ongeo.pl/plan-ogolny-gminy-termin-przesuniecie-sierpien-2026-ud316). Expect a wave
  of POG publications landing NOW and through autumn; municipalities without POG lose the ability
  to issue new WZ decisions / adopt new MPZP on the old basis.
- **Rejestr Urbanistyczny (RU) is LIVE since 2026-07-01** at
  https://rejestr-urbanistyczny.gov.pl/ (probed 2026-08-31: HTTP 200; it is an Angular SPA —
  `/api`, `/services` return the app shell). Free, no login. Contains: POG, MPZP, uchwały
  krajobrazowe, plany województw, audyty krajobrazowe + a document repository + e-Wyrys POG in
  mObywatel. **Data may be INCOMPLETE until 2026-11-30** (transition period); email notification
  service from 2026-10-01. Data is stated to be published via **WMS/WFS/CSW**
  (https://www.coi.gov.pl/aktualnosci/rejestr-urbanistyczny-wystartowal-dane-o-planowaniu-przestrzennym-w-jednym-miejscu,
  https://www.gov.pl/web/gov/skorzystaj-z-rejestru-urbanistycznego, both checked 2026-08-31), but
  the service endpoint URLs are not yet discoverable on the public pages I could reach —
  **OPEN ITEM: harvest the RU WMS/WFS endpoints from the eziudp register
  (https://integracja.gugik.gov.pl/eziudp) or the RU SPA's network calls once past the transition.**
  Support: surb.pomoc@cyfra.gov.pl.

## PL-2 · HEADLINE FINDING — POG GML is structured envelope parameters, **PROBED on the official sample**
Downloaded the ministry's official POG test GML (post-regulation-change version,
https://www.gov.pl/attachment/8dd6086a-88ba-44fb-be68-d43d14a15e36, via
https://www.gov.pl/web/zagospodarowanieprzestrzenne/przykladowe-dane, 2026-08-31; 253 KB,
namespace `https://www.gov.pl/static/zagospodarowanieprzestrzenne/schemas/app/2.0`). Feature types
and REAL attribute values found in the file:
- `app:StrefaPlanistyczna` (28 in sample): `symbol` **"SZ"**, `oznaczenie` "1SZ",
  **`maksNadziemnaIntensywnoscZabudowy` 0.8** (above-ground FAR), **`maksUdzialPowierzchniZabudowy`
  50.0** (% coverage), **`maksWysokoscZabudowy` 15.0** (m), **`minUdzialPowierzchniBiologicznieCzynnej`
  50.0** (% green), `profilPodstawowy`/`profilDodatkowy` (use profiles), full GML geometry,
  IIP identifiers, and **versioning fields** (`wersjaId`, `poczatekWersjiObiektu`, `obowiazujeOd`) —
  the §15 temporal-validity model is IN the national schema.
- Also: `app:ObszarUzupelnieniaZabudowy` (infill-permitted areas), `app:ObszarZabudowySrodmiejskiej`
  (downtown-regime areas), `app:ObszarStandardowDostepnosciInfrastrukturySpolecznej`,
  `app:AktPlanowaniaPrzestrzennego`, `app:DokumentFormalny`.
- Schema XSD: `planowaniePrzestrzenne_2_0.xsd` (53 KB, publ. 2023-11-22) at
  https://www.gov.pl/web/zagospodarowanieprzestrzenne/schematy-aplikacyjne (checked 2026-08-31).
- **CLASS: A (data) + D (standard) — a nationwide, mandatory, machine-readable zone-envelope layer
  (FAR + height + coverage + green share) is coming online in Poland THIS QUARTER. Poland jumps
  from "PDF plans + raster WMS" near the top of the structured-rule list, at the ZONE level.**
- ⚠ Honesty limits: POG strefy are gmina-wide zones (ceiling values / gminne standardy
  urbanistyczne), NOT parcel-level building lines; parcel-level detail remains MPZP (where one
  exists, ~1/3 of the country by area historically) or WZ decisions elsewhere. POG per-strefa
  values are an upper-bound deterministic envelope input, category (1) authoritative
  machine-readable; parcel-precise MPZP content is category (2)/(F) — see PL-3.

## PL-3 · MPZP (local plans) + the older APP layer
- Since **2020-10-31** every planning act must carry an APP GML dataset — but the mandatory
  minimum for MPZP is **vector plan BOUNDARY + georeferenced raster (GeoTIFF) + link to the legal
  text**, NOT vectorized zoning with attributes (https://www.gov.pl/web/zagospodarowanieprzestrzenne/standaryzacja--obowiazujace-regulacje2,
  checked 2026-08-31). A new rozporządzenie on plany miejscowe (minimal content) accompanies the
  reform (https://samorzad.pap.pl/kategoria/prawo/planowanie-przestrzenne-opublikowano-rozporzadzenie-okreslajace-minimalny-zakres).
  Full-vector MPZP ustalenia remain voluntary per gmina (e-mapa.net ecosystem etc.).
  **CLASS for MPZP numeric rules: F (extractable from raster/PDF text) with a D-standard wrapper;
  zone geometry E/A where gminy vectorised voluntarily.**
- **KIMPZP** national MPZP aggregation WMS — **PROBED LIVE 2026-08-31**:
  `https://mapy.geoportal.gov.pl/wss/ext/KrajowaIntegracjaMiejscowychPlanowZagospodarowaniaPrzestrzennego`
  (GetCapabilities 200; layers `plany`, `plany_granice`, `raster`, `wektor-str/lzb/pow/lin/pkt`,
  `granice`). View + GetFeatureInfo → plan reference + links per point. Option 1 (query) only.
- WZ decisions (warunki zabudowy) — administrative, per-case; the reform time-limits them (5 y)
  and ties them to POG. RU is the future single lookup point for them.

## PL-4 · Parcels, cadastre — **PROBED**
- **ULDK** (GUGiK parcel locator) — keyless, instant, national:
  `https://uldk.gugik.gov.pl/?request=GetParcelByXY&xy=21.0061,52.2317,4326&result=id,voivodeship,county,commune,region,parcel,geom_wkt`
  → **PROBED 2026-08-31**: parcel **`146510_8.0309.24/35`** (Warszawa, obręb 5-03-09) with full
  WKT polygon in **EPSG:2180** (native CRS — measure here, never after reprojection). Second
  probe (Kraków Rynek): **`126105_9.0001.311`**. CLASS C · GREEN (public service, geodetic open
  regime) · option 1.
- **KIEG** (Krajowa Integracja Ewidencji Gruntów) national cadastre WMS — **PROBED 2026-08-31**
  GetCapabilities 200, INSPIRE-annotated: `https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow`.
  Parcel + building outlines via GetFeatureInfo; the authoritative EGiB registers stay at POWIAT
  level (380 counties) — attribute completeness varies by powiat.
- Ownership data (EGiB subject data): gated at powiat level, fee + legal-interest test — same
  pattern as NL/SE/DK: record the gate; geometry is open, owners are not.

## PL-5 · Buildings + 3D + terrain
- **BDOT10k** (1:10k topo DB, incl. building footprints class `OT_BUBD_A` with function and
  storey attributes — attribute claim DOC-ONLY, dataset probe DIRECT): open download per powiat
  (GML/SHP/GPKG) and — notably for §27 — **national GeoParquet per object class, PROBED
  2026-08-31**: `https://opendata.geoportal.gov.pl/bdot10k/schemat2021/GeoParquet/OT_BUBD_A.parquet`
  → HTTP 200, Content-Length 78,643,200 (a cloud-optimised national buildings file served from a
  plain URL — Poland natively publishes GeoParquet; DuckDB can query it in place). CLASS A ·
  GREEN (free for any use incl. commercial since the 2020 Prawo geodezyjne amendment) · options
  1/3/4.
- **3D buildings**: national **LoD1** CityGML (vintages 2019/2021/2022/2024) + **LoD2** CityGML 2.0
  (BDOT10k footprints × ALS 4–12 pts/m² × 1 m DTM), free, "can be used freely" — download via
  geoportal "Dane do pobrania → Modele 3D budynków"
  (https://www.geoportal.gov.pl/en/data/other-data/3d-models-of-building/, checked 2026-08-31;
  download-path probe not performed — the opendata path is exposed through the map UI, OPEN ITEM
  to capture direct URLs). CLASS A · GREEN · option 3/4 for chosen cities.
- Terrain: national NMT/NMPT (LiDAR ISOK; 1 m grid), open under the same 2020 regime. DOC-ONLY
  here (well-established; not re-probed this lane).

## PL-6 · §30 parcel chains (2 PL parcels, run 2026-08-31)

### Parcel PL-A — Warszawa, dz. 24/35 obr. 5-03-09 (`146510_8.0309.24/35`)
| Step | Result | Mode |
|---|---|---|
| Parcel | ULDK GetParcelByXY → id + WKT EPSG:2180 — live, keyless | **DIRECT** |
| Buildings | BDOT10k OT_BUBD_A (GeoParquet national, probed) + LoD1/LoD2 CityGML | **DIRECT** |
| Zone | Warszawa POG: in progress under the (today's) 2026-08-31 deadline; once published → strefa + FAR/height/coverage/green from POG GML via RU | **DIRECT (pending RU fill, ≤2026-11-30)** |
| Plan | MPZP via KIMPZP GetFeatureInfo (probed service) → plan ref + raster + text link | DIRECT (reference) / **F for numeric rules** |
| Restrictions | uchwała krajobrazowa (Warszawa has one), heritage register — RU + wojewódzkie WMS; not probed | F/E |
| Rules→Envelope | POG values deterministic; MPZP parameters via text/raster extraction (AI/F) | **DERIVED + AI-EXTRACTED** |
| GFA | computable from FAR × parcel area (POG ceiling); parcel-precise needs MPZP | DERIVED |

### Parcel PL-B — Kraków, dz. 311 obr. 1 Śródmieście (`126105_9.0001.311`)
Same chain; Kraków adopted its POG earlier in 2026 (city announced adoption ahead of deadline —
verify at RU when its fill completes). All steps as PL-A.

**PL chain verdict: parcel + buildings DIRECT today; the zone-rule step flips from F to DIRECT
during Q3–Q4 2026 as POG/RU fill in — Pryzm should time the PL adapter for RIGHT AFTER 2026-11-30
(end of RU transition), and build the APP-GML (schema 2.0) reader NOW off the official samples.**

## PL-7 · PL actions
1. Build/keep an **APP GML 2.0 parser** (one schema, national) — input: official sample files
   (already fetched to scratchpad this session); this is the PL adapter's core. Class D CONSUME.
2. Watch RU service endpoints (WMS/WFS/CSW) — harvest from eziudp; re-check after 2026-11-30.
3. Use ULDK + KIEG as the live parcel resolver (mirror of Pryzm's `pdok-nl` provider pattern —
   same registry, new adapter).
4. For §27: Poland's native national GeoParquet is the cheapest EU buildings feed probed in this
   lane — a DuckDB-over-HTTP candidate with zero conversion.

---

# LITHUANIA (LT) — a consolidated-regulation layer nobody talks about, PROBED live

## LT-1 · HEADLINE FINDING — ASGR: one national layer with FAR + height + coverage + green, per-value provenance, LIVE-QUERIED (2026-08-31)
The State Territorial Planning & Construction Inspectorate (VTPSI) publishes **ASGR** ("aktuali
suvestinė informacija apie galiojančius reglamentus" — current consolidated valid regulations),
built by merging the dispositions of ALL valid planning documents (newer/more-detailed supersedes
older/coarser):
- **Live service (PROBED)**: `https://tpdr.planuojustatau.lt/arcgis/rest/services/duomenu_viesinimas/ASGR/MapServer`
  (ArcGIS REST, keyless; layer 0). Point query at Vilnius (LKS-94/EPSG:3346 582500,6061500)
  returned a polygon with `PAGR_PASK: "KT"`, `FUNKC_ZON: "U_GC_P_F"`.
- **Schema** (from VTPSI's LEIP spec, 2024-06-18, fetched 2026-08-31:
  https://www.geoportal.lt/download/Specifikacijos/VTPSI_LEIP_specifikacija_20240628.pdf):
  `PAGR_PASK` (primary use, classifier) · `NAUD_BUD` (use mode) · `NAUD_TIP` (use type) ·
  `FUNKC_ZON` (functional zone) · **`MAX_AUK_M`** (max building height, m) · **`MAX_INTENS`**
  (max plot development intensity) · **`MAX_TANKIS`** (max coverage %) · **`MIN_APZELD`**
  (min green %) · **per-value provenance columns** (`*_TP` source-document system id, `*_NR`
  document number, `*_D` approval date, `*_TPR` planning kind — for EACH of the four value
  families) · **`PILN`** completeness flag (P=full / N=possibly incomplete) · `ATN_DOK`
  (updated-from-non-spatial-documents flag). **The provenance+confidence structure Pryzm's §11
  evidence graph wants already exists as a national attribute schema here.**
- **Live fill-rate MEASURED (2026-08-31, returnCountOnly queries):** 175,557 ASGR polygons total;
  **MAX_AUK_M non-null: 31,948 (18.2%)**; **MAX_INTENS non-null: 23,920 (13.6%)** (share of
  polygons, not of area; values concentrate in urban/detail-planned zones). Sample filled rows:
  `MAX_AUK_M 8.5 · MAX_INTENS 15 · MAX_TANKIS 20` and `MAX_AUK_M 2 · MAX_INTENS 160 ·
  MAX_TANKIS 80`. ⚠ **Unit caution:** MAX_INTENS values like 15/160 vs the spec's "1 decimal"
  suggest a percent-like encoding (1.6 FAR = 160?) — resolve against the ASGR methodology BEFORE
  computing GFA; do not guess (probe-can-be-wrong-three-ways).
- **Bulk mirror (PROBED)**: `https://tpdr.planuojustatau.lt/assets/asgr.gdb.zip` → HTTP 200,
  **129,220,805 bytes, Last-Modified 2026-08-30** (daily). ESRI FGDB. Also
  `TPDR_RIBOS.zip` / `TPDR_SPRENDINIAI.zip` (registered TPD boundaries + dispositions, SHP, 24h).
- **Terms** (in the spec, repeated per service): *"Duomenys yra vieši. Naudojant būtina nurodyti
  savininką."* — public, attribution to VTPSI. Advisory caveat: ASGR is stated to be
  "rekomendacinio pobūdžio" (recommendation-grade consolidation; the legal source is the
  underlying TPD).
- **CLASS: A + C · Licence GREEN (public + attribution; confirm no share-alike in the geoportal
  licence text when wiring) · Options 1 (live query) AND 3/4 (daily FGDB mirror → GeoParquet).**

## LT-2 · TPDR/TPDRIS service constellation (from the same spec — production URLs)
- In-preparation TPD boundaries + dispositions: `https://tpdris.planuojustatau.lt/arcgis/rest/services/duomenu_viesinimas/ribos|sprendiniai/MapServer` (real-time) + VectorTileServer + `https://tpdris.planuojustatau.lt/assets/TPDRIS_RIBOS.zip|TPDRIS_SPRENDINIAI.zip`.
- Registered TPD boundaries + dispositions: `https://tpdr.planuojustatau.lt/arcgis/rest/services/duomenu_viesinimas/ribos|sprendiniai/MapServer` — attributes incl. `GALIOJA_NUO/GALIOJA_IKI` (validity window), `AKTUALI`, `VIESAS`, `TPD_URL` (link to the document card) — **temporal versioning + document linkage in the register itself**.
- **TPDR 3D — the state serves ALLOWED-HEIGHT VOLUMES**: "Registruotų TPD užstatymo aukštingumo
  tūrinio atvaizdavimo žemėlapio paslauga" — regulation-zone volumes extruded above terrain by
  the permitted-height attribute (`MAX_AUK_M` / `STAT_AUK`), ESRI Multipatch 3D scene services,
  24h refresh; plus seven per-plan-type height layers (e.g.
  `.../duomenu_viesinimas/b_mstd_dp_reglam_z_max_auk_m`, `b_sav_bp_funkc_max_auk_m`,
  `k_d_dp_reglam_z_max_auk_m`). **A European state already publishes a 3D buildable-height
  envelope visualization — directly relevant prior art for Pryzm's Product B rendering; consume
  the attributes, not the Multipatch.**
- All services: CRS **LKS-94 (EPSG:3346)** — query in it, never after reprojection.

## LT-3 · Parcels + context — **PROBED**
- **Cadastral parcels are OPEN**: Registrų centras NTR/NTK parcel geometries as open data,
  republished as a public ArcGIS FeatureServer by Statistics Lithuania:
  `https://osp-sdg.stat.gov.lt/arcgis/rest/services/ntr_sklypai/FeatureServer/0` — **PROBED
  2026-08-31**, envelope query at Vilnius returned parcels **`0101/0054:0328`** (0.1544 ha) and
  **`0101/0054:0345`** (0.0775 ha) with `unikalus_nr`, use-type code, building/address counts,
  protected-area flags (`st_p_*`). Attribution: © Registrų centras
  (https://www.registrucentras.lt/atviri-duomenys-ir-statistika; item access "public"). Source
  dataset also on data.gov.lt (NTK parcels, monthly refresh:
  https://data.gov.lt/datasets/3780/, checked 2026-08-31). CLASS A+C · GREEN (attribution) ·
  options 1/3.
  ⚠ Street/state land is often unparcelled — my first point-query on Gedimino pr. returned 0
  features; that is a data characteristic, not an outage.
- geoportal.lt is the INSPIRE hub (cadastral map view, addresses, GRPK base data; open datasets
  listed at https://www.geoportal.lt/geoportal/atviri-duomenys, checked 2026-08-31).
- **LiDAR/terrain: soft-gated** — package request + electronically signed licence agreement per
  package, approval wait (user reports 2023:
  https://blog.hillforts.eu/2023/08/08/problems-with-lithuanian-lidar-data-availability/).
  Record the GATE (SE/DK pattern); do not call terrain missing. National 3D BUILDING model: none
  published as open data (Vilnius has a city model); heights: **E (derivable)** from gated LiDAR
  + open footprints, or MODEL-derived (EUBUCCO/overture heights are estimates — lane 1's beat).
- Buildings footprints: GRPK topographic dataset (open via data.gov.lt) + NTR building points
  (pastat_sk on parcels); per-building storeys/floors live in the (non-spatial) Real Property
  Register — bulk access via Registrų centras open-data/statistics products, per-object detail is
  a priced RC product (gate, not absence).

## LT-4 · §30 parcel chains (2 LT parcels, run 2026-08-31)

### Parcel LT-A — Vilnius, kad. Nr. `0101/0054:0328`
| Step | Result | Mode |
|---|---|---|
| Parcel | stat.gov.lt FeatureServer (open RC data): geometry + unikalus_nr 440055970193, 0.1544 ha | **DIRECT** |
| Buildings | pastat_sk=0 on parcel; GRPK footprints for context | DIRECT (existence), heights E |
| Zone | ASGR polygon at parcel: PAGR_PASK/FUNKC_ZON present | **DIRECT** |
| Plan | TPDR registered-TPD layer → TPD_URL → document card + PDF | **DIRECT (reference), doc text F** |
| Restrictions | parcel-level protected-area flags (st_p_*) came WITH the parcel row; specialiosios žemės naudojimo sąlygos register not probed | DIRECT (flags) |
| Rules | MAX_AUK_M/MAX_INTENS/MAX_TANKIS where filled (18%/14% of polygons); else detailed-plan PDF → F/AI | **DIRECT where filled, else AI-EXTRACTED** |
| Envelope/GFA | DERIVED from ASGR values (after unit clarification) | DERIVED |

### Parcel LT-B — Vilnius, kad. Nr. `0101/0054:0345`
Same chain, same services (adjacent block). For geographic spread, re-run in Kaunas when the
adapter lands — services are national, nothing suggests a per-city difference.

**LT chain verdict: Lithuania is a structured-rule country ALREADY — the constraint is VALUE FILL
(≈14–18% of consolidated polygons carry numbers today, concentrated exactly where development
happens), not machine-readability. Ingest ASGR daily FGDB + live TPDR queries; fall back to the
plan document (F) where numerics are null.**

## LT-5 · LT actions
1. Wire ASGR (live query + daily FGDB) as the LT rules source; resolve MAX_INTENS units from the
   ASGR methodology first.
2. Parcel resolver: stat.gov.lt FeatureServer (or data.gov.lt monthly dump if SLA matters).
3. Record the LiDAR licence-agreement gate; request packages only for launch cities.
4. Pryzm has NO lt/ jurisdiction dir — when created, seed it from this lane file.

---

# ESTONIA (EE) — per-plot building rights as WFS attributes, PROBED live

## EE-1 · HEADLINE FINDING — the national plan register serves ehitusõigus (building rights) as typed numeric attributes per building area, LIVE-QUERIED (2026-08-31)

Estonia's PlanS defines the detail-plan **ehitusõigus** as exactly the envelope tuple (use,
max building count, max under-building area, max height/depth) — and the national planning
database serves it as **WFS attributes, keyless**:

- **Service (PROBED 2026-08-31)**: `https://livekluster.ehr.ee/api/mapserver2d/v1/mapserver?service=WFS&request=GetCapabilities`
  → 200, service title **"PLANK"**, **181 layers** across ALL plan levels: maakonnaplaneering
  (county), `plank:yldplaneering` + `yp_maakasutus`/`yp_tiheasustus`/`yp_tingimus` (comprehensive),
  `plank:detailplaneering`, `dp_kehtiv`/`dp_osakehtiv`/`dp_kehtetu`, **`dp_krunt`** (plots),
  **`dp_hoonestus`** (building areas), `dp_tingimus`, `dp_tehno`, `dp_transp`, plus national
  maritime plan layers. Endpoint published at
  https://planeerimine.ee/juhendid-ja-uuringud/planeeringute-andmekogu-planis-juhendid/planeeringute-andmekogu-wms-ja-wfs-teenused/
  (checked 2026-08-31; WMS twin on the same base URL; contact info@maaruum.ee, no key).
- **Schema (PROBED, DescribeFeatureType `dp_krunt`/`dp_hoonestus`)**: `otstarve` (use),
  **`arv`** (max buildings), **`pind`/`pindalune`/`pindpealne`** (under-building area m²,
  below/above ground), **`korgus`** (max height m), **`korgusabs`** (absolute height),
  **`sygavus`** (depth), **`tihedus`** (density/FAR), **`protsent`** (coverage %),
  **`sbp`/`sbppealne`/`sbpalune`** (closed gross floor area = GFA, total/above/below ground),
  `maxsoosak`/`minsoosak` (roof pitch), `tingimus` (free-text conditions), plus plan provenance
  (`planid`, `plannim`, `kehtestkp` adoption date, `planseis_nimi`, `url`, `kovid` municipality).
- **Live value proof (GetFeature, Tallinn/Kalamaja, 2026-08-31)** — hoonestusala
  "Kopli tn 2 või Kesk-Kalamaja tn 1": **`tihedus 2.1` · `protsent 61` · `korgus 17.4` ·
  `korgusabs 32.64` (EH2000) · `sbp 3500` (above-ground 3500) · `pind 1000` · `arv 1`** +
  `tingimus`: "Ehitusjoonest võivad Kopli tänava poole ulatuda rõdud. Ühe korruse rõdud ei või
  ületada 30% fassaadi pikkusest." — FAR + coverage + height + GFA as numbers, the qualitative
  remainder as text. **The same three-way value taxonomy as NL (kwantitatief / kwalitatief /
  in-regeltekst) exists here as numeric column vs `tingimus` prose.** A second feature in the
  same pull had `korgus "0"` / empty `korgusabs` — fill quality varies per plan; treat empty/0
  as UNKNOWN, never as "no limit" (context-data-honesty rule).
- **CLASS: A + C + D** (the layer standard is the mandatory "Planeeringu jooniste digitaalsete
  kihtide koostamise ja vormistamise juhend"; PLANK statute
  https://www.riigiteataja.ee/akt/115072023039) · **Licence GREEN** (see EE-2) ·
  **Options 1/2** (live WFS; per-plan files downloadable via `failid`/`url` attributes).

### Regime note — PLANK → PLANIS, January 2026 (do not cite stale system names)
- **PLANIS** (planning PROCEEDINGS system) went live **2026-01-08**; new plan submissions go
  there. **PLANK stopped accepting submissions in Jan 2026 and its UI stays read-only until
  June 2026**; the WMS/WFS above continues as the valid-plans service under PLANIS
  (https://planeerimine.ee/digi/plank/, checked 2026-08-31; PLANIS UI
  `https://livekluster.ehr.ee/ui/ehr/v1`). The service base — livekluster.ehr.ee — is the
  **building-register cluster**: Estonia runs planning + building register on one platform.
- ⚠ **Coverage honesty**: PLANK holds plans digitally submitted (mandatory for new plans since
  late 2024) plus back-digitised stock; a `dp_kehtiv` count of 0 at a point means "no valid dp
  IN PLANK" — older paper-era dps may exist only in municipal registers. Distinguish
  "no plan" from "plan not yet in PLANK" via the municipality before claiming vacancy.

## EE-2 · Cadastre + restrictions + context (Maa-amet → **Maa- ja Ruumiamet**) — PROBED
| Source | Probe (2026-08-31) | Licence | Class | Option |
|---|---|---|---|---|
| **Cadastral parcels WFS** `https://gsavalik.envir.ee/geoserver/ows` (`kataster:ky_kehtiv`) | **200 LIVE** — GetFeature bbox EPSG:3301 returned parcels with `tunnus`, address, use (`siht1..3` + %), area, `registr`/`muudet` dates, even taxable value (`maks_hind`) — keyless | Estonian open-data licence | A+C | 1 |
| Whole-geoserver inventory | GetCapabilities **200, 1091 layers** — cadastre, ETAK topo (`etak:e_401_hoone_ka` buildings), **restrictions** (`kpokitsendused:`/`kmakitsendused:` = kitsendusi põhjustavad objektid + their zones: gas, electricity, water bodies, heritage `muinsuskaitse:kaitsekat_a/b/c`, planning-derived `kpo_avalik_planeering_111..116`), address points, forest register | same | A+C | 1 |
| **Cadastre bulk** | Nightly whole-country downloads: GPKG 177 MB, SHP, CSV, JSON, DXF, TAB (https://geoportaal.maaamet.ee/est/ruumiandmed/maakatastri-andmed/katastriuksuste-allalaadimine-p592.html, checked 2026-08-31; DOC-ONLY, not downloaded); **annual Jan-1 snapshots back to 2012** (p613 page) — state-provided temporal versioning for §15 | same | A | 3/4 |
| **Restrictions bulk** | Kitsenduste andmete allalaadimine (https://geoportaal.maaamet.ee/est/Ruumiandmed/Kitsenduste-andmed/Kitsenduste-andmete-allalaadimine-p624.html, checked 2026-08-31, DOC-ONLY) | same | A | 3 |
| **Licence** | `https://geoportaal.maaruum.ee/opendata-licence` (fetched 2026-08-31, PDF): **custom Estonian open-data licence, NOT CC** — attribution + keep licence text, **commercial use allowed, redistribution allowed, no share-alike** | **GREEN** | — | — |
| Terrain/LiDAR | National LiDAR + 1 m DTM open via the same geoportal (long-established; DOC-ONLY this lane, not re-probed) | same | A | 1/4 |

- **Org rename**: Maa-amet is now **Maa- ja Ruumiamet** ("Land and Spatial Development Board",
  2025 merger); both `geoportaal.maaamet.ee` and `geoportaal.maaruum.ee` serve; attribution
  string per the 3D page: *"Building 3D model data: Republic of Estonia Land and Spatial
  Development Board 2026"*. Use maaruum.ee URLs in the adapter.
- CRS: **L-EST97 / EPSG:3301** everywhere — query and measure in it, never after reprojection.
- Ownership: parcel geometry+attributes are open; OWNER data sits in the land register
  (kinnistusraamat, RIK) — gated/priced there. Same record-the-gate pattern as NL-4/PL-4.

## EE-3 · Buildings + 3D (**Eesti 3D** + ehitisregister EHR)
- **Eesti 3D — national LoD2**: **856,360 LoD2 buildings + 917,882 LoD1 + roofed structures**,
  formats **CityGML / gdb / obj**, whole country, by county/municipality (Tallinn 49,816 LoD2
  objects), free under the open-data licence with attribution. Download page PROBED (fetched
  2026-08-31): https://geoportaal.maaamet.ee/eng/spatial-data/geo3d/download-3d-data-p837.html;
  dataset record https://metadata.geoportaal.ee/geonetwork/srv/api/records/85d8aaab-e411-4445-b142-2c4b5d18eb8b.
  Attributes include ETAK id, **EHR building-register id**, address id, model date, height —
  i.e. the 3D mesh is PRE-LINKED to the building register (the §16 conflation NL does via BAG id
  is already done by the state here). LoD1 is register-based (e-ehituse 3D twin), LoD2 is
  ALS-derived (https://medium.com/digiriik/ehitatud-keskkond-sai-uue-digitaalse-mõõtme-fd594f438721,
  checked 2026-08-31). CLASS A · GREEN · options 3/4 per launch city.
- **EHR (ehitisregister)** — the building register: open data **CSV, updated daily, history to
  1994** (https://imo.ut.ee/taristu/avaliku-sektori-avaandmed/ehitisregistri-avaandmed/, checked
  2026-08-31); open-data UI **PROBED 200** at `https://livekluster.ehr.ee/ui/ehr/v1/opendata`;
  public API docs **PROBED 200** at `https://swaggerui.ehr.ee/ehitise_kehtivate_andmete_teenus`
  ("Ehitise kehtivate andmete teenus" — current-data-of-building service; per-building technical
  parameters incl. **maxKorrusteArv** floors, height, areas; auth mode not yet exercised — X-tee
  membership gates SOME EHR services, the open-data channel does not). National metadata record:
  "no public access restrictions" (https://metadata.geoportaal.ee/geonetwork/srv/api/records/e588b81a-0892-44c2-83e1-6d5434d29d05,
  checked 2026-08-31). **Building PERMITS + notices also live in EHR** — Estonia's
  development-activity signal (§2 future potential) is in the same open register. CLASS A+C ·
  GREEN · options 1/3.
- ETAK↔EHR pre-joined footprints exist in the public geoserver as `etak_tuletis:etak_ehr_hooned`
  (seen in the 1091-layer caps) — a state-maintained footprint-to-register conflation layer.

## EE-4 · §30 parcel chains (2 EE parcels, run live 2026-08-31)

### Parcel EE-A — Tallinn Old Town, `78401:101:0109` (Raekoja tn 4 // 6)
| Step | Result | Mode |
|---|---|---|
| Parcel | ky_kehtiv WFS: 264 m², ÜHISKONDLIKE_EHITISTE_MAA 100%, addr Raekoja tn 4//6 — live, keyless | **DIRECT** |
| Buildings | ETAK footprints + Eesti 3D LoD2 (Tallinn covered) + EHR attributes by EHR id | **DIRECT** |
| Zone/plan | `plank:dp_kehtiv` at parcel: **0 features** (probed) — Old Town has no valid dp in PLANK; governing layer = Tallinn üldplaneering/vanalinna regime → `yp_maakasutus` gives `juhtots` (use) machine-readable, numeric limits are in plan documents | DIRECT (use) / **F (numerics)** |
| Restrictions | muinsuskaitse layers (kaitsekat_a/b/c, arheo_kultuur) + kitsendused zones on the public geoserver — layer existence probed in caps | **DIRECT** |
| Rules→Envelope | heritage-area statute + üldplaneering text → AI/F extraction, human-validated | **AI-EXTRACTED / HUMAN-VALIDATED** |
| GFA | from extracted rules; no state-served number here | DERIVED |

### Parcel EE-B — Tallinn Kalamaja, `78401:101:7194` (Kopli tn 2, ELAMUMAA, 1670 m²)
| Step | Result | Mode |
|---|---|---|
| Parcel | ky_kehtiv WFS live (registr 2023-06-12, muudet 2025-03-07) | **DIRECT** |
| Buildings | ETAK/EHR/LoD2 as EE-A | **DIRECT** |
| Zone/plan | `plank:dp_hoonestus` at parcel: hoonestusala "Kopli tn 2 või Kesk-Kalamaja tn 1" — live | **DIRECT** |
| Rules | **`tihedus 2.1` (FAR) · `protsent 61` (coverage) · `korgus 17.4 m` · `korgusabs 32.64 m` EH2000 · `sbp 3500 m²` (GFA) · `arv 1`** + balcony condition text | **DIRECT (numbers) + F (tingimus text)** |
| Restrictions | kitsendused layers at parcel (utilities/heritage) — same geoserver | DIRECT |
| Envelope/GFA | the state literally serves max GFA (`sbp`) — envelope geometry (where on the plot) still Pryzm's: hoonestusala polygon ∩ height ⇒ volume | **DIRECT (GFA number!) / DERIVED (volume)** |

**EE chain verdict: where a PLANK detail plan exists, Estonia is the FIRST country in this lane
where even max GFA arrives as a served number — the envelope step collapses to geometry assembly.
Where no dp exists (old town, rural), the fallback is üldplaneering use + document extraction.
Estonia = "DK-class structured lookup" (per the tracker's Denmark note) with a NL-class dual
regime, at small-country scale — the cheapest full-stack reference implementation available.**

## EE-5 · EE actions
1. Wire the PLANK WFS (dp_krunt + dp_hoonestus + yp_maakasutus) as the EE rules source — keyless
   today; watch the PLANIS migration (endpoint published on planeerimine.ee) for URL churn after
   June 2026.
2. Parcel resolver: `kataster:ky_kehtiv` on gsavalik.envir.ee (live query) + nightly GPKG mirror
   if SLA matters; annual snapshots give §15 time-travel for free.
3. Buildings: consume Eesti 3D LoD2 CityGML per launch city; join EHR open-data CSV by the
   EHR id ALREADY PRESENT in the 3D attributes (no conflation work).
4. Treat `korgus 0`/empty as UNKNOWN (probe showed both filled and unfilled features);
   `dp_kehtiv`=0 needs the "not-in-PLANK vs no-plan" disambiguation before claiming vacancy.
5. Pryzm has NO ee/ jurisdiction dir — when created, seed it from this lane file.

---

# LANE SUMMARY — the four-country verdict (written 2026-08-31)

## The architecture datapoint the brief asked for (NL §6)
**"How consumable is Regels-op-de-kaart for a third party?" — answer: it is a free-key,
fair-use-limited, typed-object REST API, in production, with numeric norm values
(`NormwaardeSpec.kwantitatieveWaarde`), unit value-lists, geometry references and an honest
in-regeltekst fallback — and the transitional IMRO layer is equally structured
(maatvoeringen).** Nothing audited by this lane is more consumable. The NL adapter is a JSON
mapper, not a document pipeline. Caveat: IMOW-annotated coverage is a growing minority until
TAM-IMRO conversions complete (deadline 2032); the adapter MUST merge both regimes (NL-1c).

## Machine-readable-rules ranking (this lane, as of 2026-08-31)
| Country | Rules delivery | Numeric envelope params served? | §3 category at best | Constraint |
|---|---|---|---|---|
| **NL** | typed-object APIs, both regimes (PROBED at schema level) | bouwhoogte etc. as `Normwaarde`/`maatvoering` numbers | **(1)** | free API key; dual-regime merge |
| **EE** | national WFS, per-plot attributes (PROBED with live values) | FAR, coverage, height, **GFA** as columns | **(1)** | dp coverage; fill varies |
| **LT** | national consolidated ASGR layer (PROBED live + daily FGDB) | MAX_AUK_M/INTENS/TANKIS/APZELD + per-value provenance | **(1)** | ~14–18% value fill; unit semantics |
| **PL** | POG GML zones landing NOW (official sample PROBED); MPZP = raster+text | FAR/height/coverage/green per strefa (zone, not parcel) | **(1)** zone-level, **(2)/F** parcel-level | RU fill ≤2026-11-30; MPZP extraction |

All four countries: parcels + buildings are open, keyless/free, GREEN-licence, PROBED. None of
the four needs scraping, procurement, or identity gates for the §30 pre-rules steps.

## Cross-cutting findings for the report
1. **Three states already run the provenance model Pryzm's §11 wants** (LT per-value source
   columns; NL waardeInRegeltekst + value-lists; EE tingimus-vs-column split). CONSUME their
   taxonomies as the canonical Rule vocabulary — do not invent one.
2. **Temporal versioning is state-served in all four** (NL regeling versions; PL wersjaId/
   obowiazujeOd in APP GML; LT GALIOJA_NUO/IKI; EE annual cadastre snapshots + kehtestkp).
   §15 "what applied on date X" is an adapter mapping, not new infrastructure, here.
3. **The state pre-joins what we feared to conflate**: EE 3D carries EHR ids; PL publishes
   national GeoParquet; NL PDOK serves omgevingsdocument geometries as vector tiles. The §16
   federation-beats-master expectation is CONFIRMED for this lane — own nothing except derived
   envelopes + evidence graph (option 5) everywhere.
4. **Regime transitions are live RIGHT NOW in 3 of 4** (NL TAM-IMRO ended 2026-01-01; PL POG
   deadline TODAY 2026-08-31 + RU fill to 2026-11-30; EE PLANK→PLANIS Jan–Jun 2026). Adapters
   built on last year's blog posts would be wrong in all three — every endpoint in this file
   was probed or dated instead.
5. **Sequencing recommendation**: EE first (smallest, fullest stack, keyless), NL second
   (richest, needs key + dual-regime merge), LT third (wire ASGR, fill grows), PL fourth
   (after 2026-11-30 RU transition ends).

## Open items / honest gaps (this lane)
- NL: DSO **data** responses still unprobed pending the free API key (schema-level proof only);
  fair-use policy text unread; officielebekendmakingen SRU mirror unprobed.
- PL: RU WMS/WFS endpoint URLs not yet discoverable; 3D download direct URLs not captured;
  BDOT10k OT_BUBD_A attribute schema (function/storeys) verified at DOC level only.
- LT: MAX_INTENS unit semantics unresolved (do NOT compute GFA before reading the ASGR
  methodology); geoportal.lt licence text not read verbatim (attribution requirement confirmed,
  share-alike assumed absent, verify when wiring).
- EE: EHR API auth mode not exercised; LiDAR/DTM not re-probed (DOC-ONLY); "not-in-PLANK vs
  no-plan" disambiguation path not implemented; kitsendused GetFeature not exercised (layer
  presence only).
- All: licence colours are lane judgments from primary pages, not legal review.

## Status: COMPLETE (NL, PL, LT, EE all probed; 8 parcel chains run)
