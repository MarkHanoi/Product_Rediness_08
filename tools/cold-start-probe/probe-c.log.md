# PROBE C — Tier 3 sizing (Spain). Running log.

Scope: **Stage 0 discovery only** — what is published, for this municipality, and by whom.
No determination, no variable resolution, no envelope, no legal reading.

---

## 08:44:02Z — start

Read `docs/04-reference/standards/PROBE-DISCIPLINE.md`. Confirmed `tools/dataset-discovery/` NOT on
`origin/main` at start (`git ls-tree -d origin/main tools/` — 21 dirs, no dataset-discovery).

## 08:44–08:48Z — sampling frame

Needed an **SIU-independent** frame (drawing from SIU conditions on SIU coverage → biases the result).
- Tried: Wikidata SPARQL, `?m wdt:P31/wdt:P279* wd:Q2074737 ; wdt:P772 ?ine` + optional `P1082`.
  HTTP 200, 8,838 rows → **8,166 distinct INE codes**, 8,138 with population.
  Official Spain count is 8,132 → frame is +0.4% (historical/merged codes). Recorded, not corrected.
- Frame never touches `mapas.fomento.gob.es`. ✅ SIU-independent.

## 08:48Z — draw v1 (seed 20260802), 4 per band

Produced **all four `<5k` draws under 100 inhabitants** (79, 56, 44, 97) where the band median is 344
and only 20.7% of the band is <100. P(all 4) ≈ 0.0018.

⚠ Suspected PRNG defect. **Verified the shuffle instead of assuming**: 500 synthetic seeds over a
6,383-element pool with 20.7% "small" → empirical small-rate in first-4 = **0.2265** (expect 0.207),
all-4-small in **1/500** seeds (expect ~0.9/500). **Shuffle is uniform; the seed landed on a genuine
1-in-500 tail.**

## 08:50Z — two pre-registered corrections, then draw v2

1. **Rejection rule**: any drawn municipality that is a provincial OR autonomous-community capital is
   rejected and replaced by the next in seeded shuffle order. (v1 drew **Mérida 06083**, capital of
   Extremadura — a capital under the brief's exclusion. Rejected → replaced by **Ibiza 07026**.)
2. **`<5k` stratum doubled to n=8.** It carries 84.35% of the national municipality weight, and the
   v1 draw was at the smallness tail. Doubling both widens coverage and de-biases the dominant stratum.

Final: **n=24**. Frame after exclusions 7,567 (excluded: foral provinces 01/20/48/31, 52 capitals,
28 without population).

Band shares of frame: `<5k` 84.353% · `5k–20k` 10.889% · `20k–50k` 3.436% · `50k–100k` 0.938% ·
`>100k` 0.383%. These are the **post-stratification weights** for the national projection.

## 08:52–08:55Z — national SIU census (not a sample)

`SIU/Planeamiento_Vigente/MapServer/0` — join of INSPIRE municipal boundaries to table `plan_mun`.
Paginated pull, attributes only, browser UA. **8,217 rows, 0 HTTP errors, 0 Esri errors.**

`FiguraVigente` national distribution:

| figure | n | % of 8,217 |
|---|---:|---:|
| Normas Subsidiarias | 2,798 | 34.0% |
| Plan General (PGOU) | 2,781 | 33.8% |
| **Sin Planeamiento** | **1,357** | **16.5%** |
| Delimitación de Suelo | 1,195 | 14.5% |
| (null) | 86 | 1.0% |

⚠ **`UrlLink` is a TRAP.** 99.0% of rows carry one — but there are only **20 DISTINCT VALUES**, each a
**per-CCAA regional register home page** (`servicios.jcyl.es/PlanPublica` ×2,248,
`dtes.gencat.cat/rpucportal` ×947, …). It is **not** a per-municipality plan document. Using
"UrlLink present" as "digital PGOU exists" would have returned **99% Tier 1/2** — a fabricated number.
The brief flagged this layer as the highest-leverage query for "digital PGOU exists"; it is not that.
**It is a routing table** — it enumerates the 18 regional planning registers to query, which is
genuinely high-leverage, for a different question.

*(R5 / "a plausible proxy is not a source" — caught before publication.)*

---

## Per-municipality Stage-0 log

Full 24-row table + per-CCAA verdicts: `probe-c.result.json`.

### Timings (measured, not reconstructed)

| stage | window | wall |
|---|---|---|
| frame + seeded draw | 08:44:02 → 08:48:15 | 4m13s |
| national SIU census (8,217 rows) | 08:52 → 08:56 | ~4m |
| **per-municipality SIU pass, all 24** | **08:55:47 → 08:56:01** | **14s → 0.6 s/municipality** |
| regional capabilities sweep (13 endpoints) | 08:58:39 → 08:58:45 | 6s |
| spatial verify pass 1 (24) | 09:00:06 → 09:00:27 | 21s |
| rounds 2–8: per-CCAA adapter discovery | ~09:03 → 09:36 | ~33m |

> ⛔ **WHAT 0.6 s/municipality IS, AND WHAT IT IS NOT — read this before quoting the number.**
>
> **0.6 s/municipality is the marginal cost of establishing that a service exists and answers.** It is
> **not** the cost of a determination and **nowhere near** the cost of an envelope. **Stage 0 only.**
> **No tier percentage was measured in this run and none should be inherited from it.**
>
> This guard sits here, beside the number, rather than in a footnote, because the number is the thing
> that will be quoted. The probe deliberately declined to state a tier estimate; that refusal is the
> correct result and it will be overridden by the first person who reads 0.6 s as onboarding cost.

**The shape of the cost is the finding.** Per-municipality marginal cost, once the CCAA adapter is
known, is **~1 second**. Essentially all the time is **per-CCAA discovery** — ~33 min for 12 CCAAs,
**≈2.8 min/CCAA**. Spain has 17 CCAAs. Sizing Tier 3 by municipality-hours is measuring the wrong
variable; the unit of work is the **autonomous community**, and there are only 17 of them.

### 09:37Z — STAND-DOWN

Reassigned by the founder to the `tools/dataset-discovery/` author. Stopped mid-round-9 (Madrid
per-municipality verification). No further public-service calls made.

---

## Dead ends and false negatives — the handover value

1. ⚠ **`SIU.plan_mun.UrlLink` is not a per-municipality document.** 99.0% coverage, **20 distinct
   values**, each a CCAA register home page. Would have yielded a fabricated ~99% Tier 1/2.
   It *is* an excellent **routing table**: the canonical register per CCAA, in one query.
2. ⚠ **Comunidad Valenciana WFS returns HTTP 200 + ZERO features in the wrong axis order, with no
   error.** `terramapas.icv.gva.es/0702_Planeamiento`, WFS 1.1.0. Measured:
   | bbox form | features |
   |---|---|
   | `lon,lat` plain | **0** |
   | `lat,lon` plain | **0** |
   | `lon,lat,EPSG:4326` | **0** |
   | **`lat,lon,EPSG:4326`** | **2** |
   | **`lat,lon,urn:ogc:def:crs:EPSG::4326`** | **2** |
   | **`x,y,EPSG:25830`** | **2** |
   It needs **lat,lon AND an explicit CRS token**. Either alone silently returns empty. Three CV
   municipalities would have been scored "no coverage".
3. ⚠ **A bbox hit is not municipality coverage.** EVERY first-pass bbox probe returned a
   **neighbouring** municipality: Medinilla→**Becedas**, Las Cuerlas→**Torralba de los Frailes**,
   Sorbas→**Lubrín**, Sabadell(08187)→**08267**, Tollos→**Benimassot**, Vall d'Uixó→**la Vilavella**,
   Paterna→**València**, Eivissa→**Santa Eulària**. Municipal extents overlap neighbours; coverage
   must be tested by **municipality attribute filter**.
4. ⚠ **Baleares MUIB self-declares invalidity in a data field.** Eivissa's `QUALIFICACIONS` rows
   carry `OBS = "Del municipi d'Eivissa el MUIB NO mostra l'actual normativa vigent. Consultau la
   informació proporcionada per l'Ajuntament"` — vector polygons present, **explicitly not the plan
   in force**. Counting polygons scores this Tier 1. Read `OBS`/`DFIVIGEN`.
5. ⚠ **Browser UA is mandatory on `mapas.fomento.gob.es`** (as briefed) — confirmed; all 8,217 rows
   pulled clean with a Chrome UA.
6. ⚠ **ArcGIS `supportsStatistics: true` is not a promise.** SIU layer 15 `returnDistinctValues` AND
   `groupByFieldsForStatistics` both return **HTTP 200 carrying an Esri 400**. A national vector
   aggregate was therefore **not measurable** by that route. HTTP 200 ≠ success on ArcGIS.
7. ✅ **Galicia 36043 is a VERIFIED empty, not a failure** — `CODINE='36043'` returns 0 across
   SIOTUGA layers 8/28/29 while the neighbour `36038` returns rows on the same query. That is how an
   empty should be established.
8. **Discovery dead ends** (all candidates tried, all 404/DNS): Madrid 9, Extremadura 7, CLM 7.
   The break came from mining the **viewer's own JS**: `idem.madrid.org/cartografia/sitcm/js/Config.js`
   revealed `idem.comunidad.madrid/geoserver3/wfs`, which serves **`sitcm:VPLA_V_ORDENANZA`** —
   region-wide **ordinance** polygons for Comunidad de Madrid. Repo doc had this region as
   "UNVERIFIED — not reached". **Fetch the viewer's config JS** before declaring a region serviceless.
9. CLM's planning viewer is an **ArcGIS Online** app (`castillalamancha.maps.arcgis.com`) — the
   service will be a hosted feature service, not a regional GeoServer. Extremadura's live host is
   `geoportal.ideex.es` (not `sitex.juntaex.es`); it publishes a
   `DIRECTORIO_DE_SERVICIOS_Y_CAPAS...pdf` service directory — start there.

## What I could NOT measure

- **Tier 1/2/3 percentages.** Stood down before the Madrid verification and before any tiering. The
  24 rows are Stage-0 facts only. **No tier estimate is stated, because none was measured.**
- **National vector coverage** — SIU statistics endpoints 400 (dead end 6).
- **Whether "vector present" implies an ordinance code that maps to a rule pack.** Only CT, VC, IB,
  MD(unverified) and CN carry an ordinance/zone code; **CL and AR carry only *clasificación*** (clase
  de suelo), which is a regime selector, not an envelope hook. AR does additionally expose
  `edificab`/`aprove`/`densidad` — **not verified as populated**, only present in the schema.
- **Whether any of it is *in force*** — only IB exposed a currency flag, and it said "no".

