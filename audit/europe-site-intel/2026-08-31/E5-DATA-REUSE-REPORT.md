# E5 — THE DATA-REUSE / BUILD-LESS REPORT (A–J)

> **Synthesis, 2026-09-01.** Authority: `E5-DATA-REUSE-BRIEF.md` — §1 (A-vs-B separation) and §9
> (no core expansion) are BINDING on every row below. This report consumes four E5 lane files and
> the original 2026-08-31 audit; **it re-derives nothing a lane proved and cites the lane row
> instead.** Every load-bearing claim carries a citation. NOT CONFIRMED stays visible.
>
> **Citation keys**
> `E5-A §n` → `impl/e5-asis-national-sweep.md` (lane 1, AS-IS national sweep) ·
> `E5-B §n` → `impl/e5-devpotential-categories.md` (lane 2, the four categories) ·
> `E5-C §n` → `impl/e5-oss-delta.md` (lane 3, OSS delta, pass 1 + pass 2) ·
> `ES3D §n` → `impl/es-catastro-3d-investigation.md` (the Spain Catastro investigation) ·
> `L1…L7` → the original audit lanes under `lanes/` · `REPORT §X` → `REPORT.md` ·
> `SUP §10` → `impl/e1a-gate-supplement.md` §10 (the 20-parcel baseline) ·
> `PLAN` → `docs/03-execution/plans/EUROPE-IMPLEMENTATION-PLAN.md` (the E1–E11 wave ladder).
>
> ⚠ **§B IS PRELIMINARY.** The brief routes the Spain deep dive through
> `ES-CATASTRO-3D-MEMO.md`. **That file does not exist on disk at the time of writing.** §B is
> therefore written from the investigator's in-progress findings file
> `impl/es-catastro-3d-investigation.md`, which is complete for P1–P6 and lane 2 (Q4/Q5/Q6) and
> **has not yet landed the FXCC-retrievability lane**. Every §B statement is provisional on that
> lane and on the memo superseding it.

---

## THE ANSWER IN SEVEN LINES

1. **Problem A (what exists) is largely a CONSUME problem.** 15 of the 18 as-is components are
   consumable today in the priority countries; 9 of 15 countries carry the full rich-Catastro
   pattern; **floor-level geometry exists in exactly two — Spain and Slovenia.**
2. **Problem B (what may be built) is where Pryzm's product lives, and the envelope layer is
   served by NOBODY** — 0 of 21 states, 0 OSS projects, 0 commercial vendors in Europe.
3. **The old "rules are 5–50% everywhere" verdict is REFUTED**: Luxembourg serves four numeric
   parameters nationally at **93.7%**; Slovenia serves a complete schema at **0.5%** with sentinel
   zeros. Rule availability needs **three axes**, never one percentage.
4. **For an address today: 78–89% of the chain exists in the structured countries, ~56% in the
   document countries, 44–56% in the absent/transitional ones** — and the last two steps
   (envelope, development potential) are Pryzm's for **every** address in Europe.
5. **Fifteen workstreams stop** (the states and the OSS field already did them) and **eleven
   must be built** (nobody has).
6. **E5 adds no core.** Every finding lands as a data row, a probe, or a sequencing change.
7. ⛔ **The biggest new risk is not scarcity, it is FALSE ABUNDANCE**: four European sources
   (SI sentinel zeros · ES `heightBelowGround = 3 × floors` · EUBUCCO's ML-imputed "100%" ·
   DE Bodenrichtwert GFZ) will **silently overstate** if consumed naively.

---

## §0 — WHAT E5 CORRECTS IN THE STANDING ARTEFACTS (read before quoting the audit)

The E5 lanes issued corrections to facts the 2026-08-31 audit — and their own pass-1 sweeps —
recorded. Anyone quoting a number from `REPORT.md` should check this table first.

| Standing claim | Where | E5 finding |
|---|---|---|
| **"No country serves complete numeric envelope rules; the rules axis converges at 5–50% everywhere"** | REPORT §A.2 (from L5 synth #4) | **REFUTED AS STATED, three ways** (E5-B §C.2): the ceiling is wrong (**LU 93.7% strictly-positive / 97.8% non-null** on 3,017 zones), the floor is wrong (**SI 0.5–1.1%**, and the present values are sentinel zeros), and the SHAPE is wrong — completeness fails on **three independent axes** and every country fails a different one. |
| "The envelope layer is state-served NOWHERE (20/20 chains)" | REPORT §A.2, §R | **HOLDS, strengthened to 21/21 countries** with a cat-4 hunt in each national language (E5-B §C.1), corroborated from a second vocabulary and from the market (E5-C §P-13). |
| **ES Catastro licence = "CC BY 4.0 (resolution 2023)"** | REPORT §G, L3 ES-1.5 | **WRONG.** `Licencia.pdf` fetched and read (ES3D §P2): a **transformation-required custom licence** — commercial use of TRANSFORMED products authorised, **redistribution of the original untransformed data forbidden**, derived products must not be branded "cartografía catastral", service suspension for access intensity is contractual. All 53 DGC ATOM entries carry `Copyright (c) 2012, ES.SDGC; all rights reserved`; only the FORAL feeds are CC BY. **GREEN-for-purpose, RED for re-serving tiles.** |
| EUBUCCO = v0.1 (200M), "v0.2 spring 2026 UNVERIFIED" | L1 §C.2, REPORT §G | **v0.2 IS RELEASED** (E5-A §9, E5-C §P-8): 322M buildings, 30 countries, ODbL with two non-ODbL pockets, **an ODbL-clean source.coop mirror in FlatGeobuf/Parquet/PMTiles**. ⛔ Its "100% height/floors" is **ML imputation** — ground truth **43.2% height / 16.6% floors**. |
| Overture bridge files bridge "seven datasets" (docs page) | E5-C §D1 (pass 1) | **REFUTED at the object store — 16 provider partitions** (E5-C §P-1), and `provider=ign_es/theme=buildings/` CONFIRMED. **`ign_es` is the only European NMA bridged.** The docs page is not an inventory. |
| "No third OSS LoD2 engine exists" | E5-C §D11 (pass 1) | **REFUTED — City3D (GPL-3.0) exists**, dormant since 2022-06-28 (E5-C §P-3). "No third *maintained* engine" survives. Pass 1 overstated an absence. |
| CODE-ACCORD "no LICENSE → gated" | E5-C §D19 (pass 1) | **REFUTED — CC-BY-4.0 on the Zenodo v1.0.0 deposit** (E5-C §P-10). An unread licence statement is not an absent licence. |
| ALKIS may carry storey counts | implicit, L2 DE | **`anzahlgs` populated 0 of 500** across two NRW bboxes (E5-A §1). DE floors stay LoD2-derived. |
| SI = "richest open building register" (doc-level) | L5 sweep SI row | **CONFIRMED LIVE AND UPGRADED**: `ETAZE` serves per-FLOOR features with geometry, floor altitude and floor height (E5-A §7). Slovenia is Europe's second floor-geometry country. |
| ES Madrid VEDA "serves per-parcel edificabilidad" | E5-B §A-2, first entry | **SCOPE CORRECTED on re-probe: 391 features in layer 0, 390 with `UUBV_NM_ED>0`**, against 39,745 planeamiento polygons. A few hundred development parcels, not Madrid. |
| INSPIRE has no sanctioned bulk path | E5-C §D17 (pass 1) | **REFINED**: a GeoPackage Good Practice was endorsed 2022-11-25 — but **no member state has published Cadastral Parcels or Buildings through it** (E5-C §P-6/§P-14). Expect WFS/Atom; do not budget on it. |

Two further corrections offered to sibling lanes by the Spain investigation, both PRELIMINARY:
`OfficialArea` self-declares **`sourceStatus=NotOfficial` in 6,030/6,030** cases (cite it as
`grossFloorArea (sourceStatus=NotOfficial)`), and `numberOfFloorsAboveGround` is nil at Building
level in **6,030 of 6,030** — floors live only on the PART (ES3D §L2-2/§L2-8).

---

# A — EUROPE-WIDE DATA ALREADY AVAILABLE (the AS-IS side)

**The headline: problem A is largely solved; problem B is not; and the two must never be
conflated** (brief §1). Measured across 15 Source-Registry countries + EE and 2 bonus countries
(the full 9-axis table is `E5-A Part 2`, every cell carrying its lane row, registry row id or
probe).

**A.1 · Nine of fifteen countries carry the full rich-Catastro AS-IS pattern** — authoritative
building geometry + floors/use + a 3D or height channel, open and machine-readable: **ES · SI ·
NL · EE · CH · FR · DK (free key) · DE (federated ×16, floors via LoD2) · PL** (E5-A §3.1).

**A.2 · Floor-level GEOMETRY exists in exactly TWO countries.** **ES** (FXCC — §B) and **SI**
(`ETAZE`, live-probed: per-floor features with `GEOM`, `NADMORSKA_VISINA` floor altitude,
`VISINA_ETAZE` floor height, `POVRSINA`; **numberMatched 2,307** in a 1 km² Ljubljana bbox;
CC BY 4.0, keyless — E5-A §7). Everywhere else floor geometry is register-held-but-not-served
(EE EHR, DK BBR), owner-gated drawings (IT planimetrie, DE Aufteilungspläne), or absent.
⭐ **Slovenia is strictly richer than Spain on the vertical axis** — real metric floor heights and
altitudes, which Spain has nowhere at all (ES3D §L2-8). **Any Pryzm capability built on floor
geometry generalises to exactly two countries today. Scope accordingly.**

**A.3 · Register-side floor DISTRIBUTION (counts, not geometry) is far more common**: ES
BuildingParts · SI `STEVILO_ETAZ` · **CH GWR** (whole-country CSV bulk, keyless, HEAD
`Content-Length 946,164,577`, `Last-Modified 2026-09-01 03:33 GMT` — floors/use/year by EGID,
refreshed DAILY — E5-A §6) · FR BD TOPO `nombre_d_etages` · DK BBR (free key) · EE EHR (daily
CSV) · CZ RUIAN (doc-level, one VFR parse owed).

**A.4 · New open channels found this wave** (all E5-PROBED 2026-09-01):
- **CH GWR national register bulk** — closes the one axis the L2 CH verdict left implicit (E5-A §6).
- **FR Etalab cadastre `batiments` per-commune bulk** — HTTP 200, 4,676,262 bytes for Bordeaux;
  ⚠ the department segment is REQUIRED in the path (404 without) (E5-A §5). FR now has two open
  building channels: cadastral bulk + BD TOPO.
- **PL 3D entry point captured** — `ModeleBudynkow3D` WMS live with LoD1 ×4 vintages + LoD2 2017;
  bulk stays UI-mediated per GUGiK's own instruction PDF (E5-A §3).
- **FI Buildings 3D** — a national LoD2 CityGML product, CC BY 4.0, exists; ⚠ **coverage is
  partial, the product page is dated 2022-01-27, current national coverage NOT CONFIRMED**
  (E5-A §4).

**A.5 · The pan-European fallback stack, with its honesty labels** (E5-A §9, E5-C §P-8/§P-9):
**Overture** (backbone, ODbL) → **EUBUCCO v0.2** (322M buildings, 30 countries; **consume the
source.coop ODbL-clean mirror**, which already excludes the CC-BY-SA Prague and **CC-BY-NC
Abruzzo** pockets; PMTiles is a drop-in shape for Pryzm's existing context pipeline) →
**GHS-OBAT** (JRC; per-footprint height/epoch/function **joined by GERS id** — resolved
E5-C §P-2 — ODbL per the licensor, *not* the CC-BY a re-host claims) → **GlobalBuildingAtlas**
(TUM 2025; global LoD1 + 3 m height raster, RMSE 1.5–8.9 m, ~2019 vintage — last resort only).
⛔ **Binding everywhere below: EUBUCCO's "100% complete" height and floor columns are 56.7% and
79.9% ML-IMPUTED. Carry the ground-truth flag or drop the value.** A June-2026 peer-reviewed
EU-27 comparison says the same independently — *"high completeness values often mask limited
semantic informativeness"* (E5-C §P-9; **abstract-level only**, MDPI returned 403 — no per-country
figure may be quoted from it).

**A.6 · The structural gap tail**: **IT** (no open machine building channel — WMS `fabbricati` is
visual, per-sheet DXF is SPID-gated, planimetrie owner-gated, **no catasto-3D programme found**),
**PT** (no national buildings; urban cadastre measured EMPTY), **GB** (no cadastre by design),
**NO** (FKB footprints licensed away by internal doctrine, RE-CONFIRMED 2026-09-01), **LT**
(per-object floors are a PRICED product). For these five, Overture/EUBUCCO/GBA conflation is **the
primary plan, not a fallback** (E5-A §2/§8/§10, §3.1).

**A.7 · Two things the STATE has already pre-computed, so Pryzm must not:**
1. **Building-height rasters** — ES **MDSnE**, FR **MNH LiDAR HD**, BE-Wallonia MNH. The states
   did the nDSM differencing; the remaining job is zonal statistics (REPORT §H.3 row 3; both
   re-verified live in `impl/e3b-state-heights-verdict.md`, 2026-09-01).
2. **Footprint↔register conflation** — EE (EHR id inside the 3D model), SI (`EID_STAVBA` keys
   floors↔buildings↔parts), NL (BAG id spine), CH (EGID) — and, for Spain only, the **Overture
   GERS bridge** (`provider=ign_es/theme=buildings/`, verified at the bucket, E5-C §P-1).
   **DE / NL / DK / FR / PT / PL / LT / EE cadastres are absent from the bridge listing** — those
   countries stay `conflation: geometric-or-none`.

---

# B — SPAIN CATASTRO DEEP DIVE ⚠ PRELIMINARY (memo not yet landed)

> Source: `impl/es-catastro-3d-investigation.md`, probed 2026-09-01. Complete for P1–P6 and lane 2
> (Q4/Q5/Q6); **the FXCC-retrievability lane has not landed**. B.5's access statements are
> provisional.

**B.1 · The decisive finding — the Spanish cadastre encodes STOREYS, NOT HEIGHTS.** Confirmed from
four independent sources, three of them measured (ES3D §L2-1):
- the CAT alphanumeric interchange format contains **zero occurrences of "altura"** across 26 pp;
  the per-floor `registro tipo 14` carries floor id, use, three areas and a construction typology
  — **no storey height, no building height, no ground elevation**;
- in Catastro's vocabulary **"altura" MEANS storey count** (*"un edificio de dos alturas se
  codifica II"*), held in a 24-character TEXT field;
- **MEASURED**: `heightBelowGround` ≡ `3 × numberOfFloorsBelowGround`, **exactly, in 27,005 of
  27,005 BuildingParts**, zero exceptions. It has `uom="m"` and looks like a measurement. It is a
  **source-side deterministic inference wearing a tier-1 attribute's clothes**;
- **`heightAboveGround` / `BuildingHeight` / `elevation`: 0 occurrences** in all three GML files of
  both a rural and an urban municipality.
The DGC's own 2008 engineering paper states the mechanism at source — *"Este valor se multiplicará
por 3 metros, como media bastante real de… la altura de una planta"* — and **the same 3 m constant
is still baked into a February-2026 national extract, eighteen years later** (ES3D §P4, §L2-1).

**B.2 · What the national INSPIRE product serves** (class A, keyless, bulk ATOM; measured at
municipality scale — ES3D §L2-2): `Building` — `currentUse`, `numberOfBuildingUnits`,
`numberOfDwellings`, `conditionOfConstruction`, `dateOfConstruction`, `grossFloorArea`, **a
keyless façade-photo `documentLink`**, `externalReference`, footprint. `BuildingPart` — footprint
+ floors above/below. **The part decomposition IS the massing model**: 5,318 buildings have >1
part and **4,896 (92.1%) are stepped**.

**B.3 · The reconstruction verdict — footprint-per-floor YES, metric heights NO** (ES3D §L2-6):
- **Path 1 (INSPIRE only — national, keyless, bulk, no CAPTCHA):**
  `Level_k = ⋃ { part : part.numberOfFloorsAboveGround ≥ k }` — a genuine stepped LoD1 massing for
  95% of Spanish territory, **with a free per-building checksum**: `Σ(area × (floorsAbove +
  floorsBelow)) / grossFloorArea` has **median 1.000 and 76.9% within ±10%** across a whole
  municipality (large buildings 0.986 / 71.4%). Pryzm can run it per building and REFUSE when it
  fails. ⚠ **One municipality, one province — NOT CONFIRMED nationally.**
- **Path 2 (FXCC-por-plantas, class B):** adds interior subdivision, ~150 use codes per recinto,
  per-unit identity, explicit courtyards (`PTO`) and overhangs (`VOL`), **already georeferenced in
  UTM metres by spec**. ⭐ **CORRECTION to the founder's premise: FXCC floors are `plantas
  significativas`** — one drawn floor stands for `NUMPLR` real floors (*"una representación
  singular de una o varias plantas reales… que tengan iguales características"*). It is
  per-floor-TYPE geometry plus a multiplicity, **not one polygon per real floor**.
- **Path 3 (DNPRC — class A, keyless, national, NO CAPTCHA):** ⭐ the most useful unremarked
  finding of the investigation — `Consulta_DNPRC` returns **per-unit floor codes**
  (`loint.es/pt/pu`), so **floor-level USE and AREA are available for ALL of Spain today, without
  FXCC and without the CAPTCHA. Only the floor GEOMETRY is gated.** Cross-channel agreement
  measured at **0.03%** (Σ per-unit `sfc` 19,573 m² vs `grossFloorArea` 19,567 m² on the audit's
  own Barcelona parcel). ⛔ Parsing trap, measured: `pt` is **not normalised** — Barcelona returns
  `"0"`/`"-1"`, Madrid returns `"00"`, same national service.

**B.4 · Accuracy and limitations, measured** (ES3D §L2-5): `horizontalGeometryEstimatedAccuracy =
0.1 m` in **33,035 of 33,035** urban features **and 1,186 of 1,186** rural ones — **a
schema-filling constant, never a per-footprint accuracy**. Lineage is two regimes (photogrammetric
restitution *or* croquis digitisation) with **no per-feature discriminator** in the INSPIRE
channel (FXCC does carry a per-parcel *escala de captura*). **70% of building records have not
changed since before 2010** (upper bound — a 2005–09 mass re-cadastration spike may be an
artefact). Geometry is `footPrint` in 100% of features while any nDSM measures the ROOF — eaves
overhang biases every zonal join. Bulk refresh is twice yearly (Feb/Aug).

**B.5 · Access and licence** (ES3D §P1/§P2/§P5 — PRELIMINARY): the INSPIRE WFS **soft-blocked the
entire `ovc.catastro.meh.es` family after ~20 requests in ~10 minutes**, and the licence makes
that **contractual, not merely infrastructural** (automatic per-user suspension for access
intensity). The documented SOAP limit is 7,200 req/h with a 4-hour penalty; the aspx WFS family
trips far earlier. `DescribeFeatureType` / `ListStoredQueries` / `DescribeStoredQueries` all return
**HTTP 400 — declared-not-served**. **The ATOM bulk mirror is the scale channel**; the national
index federates the foral cadastres (Navarra CC BY 4.0, Bizkaia CC BY 3.0 ES) even though DGC data
excludes País Vasco and Navarra (95% coverage).
⚠ **Three different licence statements ship inside one product family** — `Licencia.pdf`
(transformation required), the ATOM `<rights>` (all rights reserved), and ISO metadata inside the
ZIP (*"No conditions apply"*). **P2 is the governing instrument; a metadata string is not a
grant.** Flagged, not resolved.

**B.6 · The ES source priority the brief asked for** (Catastro vs Spanish LoD2/regional vs Overture
vs EUBUCCO): **Catastro first** for geometry, floors, use, units and existing GFA (national,
keyless, class A) → **MDSnE for the measured total height** (the state's pre-computed nDSM; the
repo already ranks `mds_edificacion` above `catastro` for every ES region) → **Overture via the
`ign_es` GERS bridge** where a stable cross-source id is needed → **EUBUCCO/GBA never for Spain**
(dominated on every axis). ⚠ Per-footprint MDSnE coverage is only **32–40% in dense centres**; for
the rest the honest value is `floors × METRES_PER_LEVEL`, and e3b measured the real centre-of-city
figure at **3.76–3.84 m/floor** against the repo's `3.2` — a tier-3 assumption understating by
~0.6 m/floor (ES3D §L2-6; `impl/e3b-state-heights-verdict.md`).

**B.7 · The line Pryzm must not cross** (ES3D §L2-6, verbatim in substance): a per-floor model
whose slab elevations came from `H_MDSnE / n` **must never be presented as "the building's
floors"**. The floor COUNT, IDENTITY, USE and AREA are authoritative; the floor ELEVATIONS are
inferred. Different tiers, and the frozen model has a field for exactly that distinction — **use
it per value, not per building.**

**B.8 · Ten named failure modes** (ES3D §L2-7, abbreviated): mezzanines (`EPT`) corrupt any `H/n`
division · ⛔ **the semisótano ordering trap — the FXCC spec instructs producers to MISORDER the
stack to satisfy a validator**, so never stack on file order, key on the floor code · sloped ground
has no cadastral datum (**the L-584 defect class — a LEGAL error, not a visual one**) · courtyards
are real interior rings (818 in one municipality) · `plantas significativas` collapse ·
50%-coefficient areas are computable, not physical · casas engalabernadas · non-georeferenced
legacy FXCC · the foral gap · footprint-vs-roof.

---

# C — OTHER NATIONAL 3D / BUILDING SOURCES

| Class | Countries | What Pryzm does |
|---|---|---|
| **State already harmonises 3D nationally** | NL (3DBAG + Kadaster 3D basisvoorziening) · EE (856,360 LoD2 + 917,882 LoD1, **pre-linked to EHR ids**) · DK (Danmark i 3D) · CH (swissBUILDINGS3D) · PL (LoD1 ×4 vintages + LoD2 2017) | **CONSUME.** Do not reconstruct and do not conflate — the join is done. |
| **Federation-required** | DE — LoD2 free in 15 Länder, Saarland gap, **the national BKG aggregate is CLOSED** | Federate 15 Land downloads (REPORT §G; L2 DE-5). |
| **Partial national product** | FI Buildings 3D (CC BY 4.0; coverage partial, **status map unread — NOT CONFIRMED**) | Read the status map before relying (E5-A §4). |
| **No open national LoD2** | IT · PT · GB · NO · LT | Overture/EUBUCCO/GBA + roofer-over-LiDAR where a licence permits. |
| **WATCH, do not pre-build** | FR — IGN runs a national **LoD2 benchmark over LidarHD**, with roofer's own author participating (E5-C §D3/§D11) · NO — Kartverket *volumgeometri* forprosjekt targets CityGML "by 2026" (E5-A §10) | **Do not spend on manufacturing FR LoD2** before re-checking. Neither is consumable today. |

**The floor-geometry prize, precisely:** two countries — ES (class B, CAPTCHA-gated FXCC, partial
by construction) and SI (class A, `ETAZE`), and only SI carries real metric floor heights. ⚠ SI's
`GEOM` is nillable and was present on **1 of 2** sampled features — **fill unmeasured; measure
before relying** (E5-A §7, §3.4).

---

# D — EUROPEAN OPEN PROJECTS / REPOS (consume, adapt, refuse)

Full 11-column assessment per candidate is `E5-C` (38 candidates over two passes). The decisions:

**D.1 · CONSUME as data** — Overture GERS bridge files (Parquet on S3; ⚠ **licence still UNSTATED
after two probes — a real hole; ask Overture before redistributing the mapping**) · GHS-OBAT (GERS
equi-join, ODbL; ⚠ **id-drift test owed — ids minted against Overture `2024-07-22.0`, current
release `2026-08-19.0`, ~13 releases**) · EUBUCCO v0.2 via the source.coop ODbL-clean mirror.

**D.2 · DEPEND ON as an external process** — **roofer** (GPL-3.0 CONFIRMED, Kadaster-funded
through 2026) for LoD2 where no state product exists; **ozgxplanung** (AGPL-3.0 CONFIRMED) as a
Docker sidecar for XPlanGML validate/parse — **never linked into the product**.

**D.3 · ADAPT the pattern, adopt no dependency** — where the OSS lane earned its keep:
- ⭐ **NREL COMPASS / `elm` (BSD-3-Clause)** — a production LLM ordinance-extraction pipeline with
  exactly the two guardrails Pryzm needs, verbatim: *"cleaned text is checked against the source
  and dropped if it drifts too far, so fabricated values never reach the database"* and *"every
  record carries a URL back to the original ordinance document."* **Permissive — Pryzm may read,
  borrow, even vendor it.** US energy-siting scope; **do not claim it works on a Bebauungsplan**
  (E5-C §D31).
- ⭐ **Catala (Apache-2.0)** — a DSL for *"deriving faithful-by-construction algorithms from
  legislative texts"*: article-by-article provenance, exceptions first-class, compiles to a
  lawyer-readable rendering. **Read before the FR/ES rule-pack vocabulary freezes.** Adopt the
  authoring discipline, never the compiler (E5-C §D27).
- ⭐ **CHEK SHACL profile INHERITANCE** — *"if a profile is declared to be the profile of another,
  the validation shapes in the latter will be included"* — the jurisdictional cascade (national →
  regional → municipal → plan → building type) expressed as DATA rather than per-country code
  branches, which brief §9 forbids in core anyway (E5-C §P-11).
- **SimPLU3D (IGN, CeCILL)** — the closest OSS ancestor of Product B found anywhere: PLU rules as
  machine parameters over a parcel, a decade ago. It **SAMPLES** compliant buildings rather than
  **COMPILING** the envelope — so the deterministic-envelope-with-provenance seat stays empty, and
  Pryzm's FR vocabulary should be checked against Brasebin's parameterisation before inventing
  names (E5-C §D20).
- **Overture `match-inspector` (MIT)** — the human-review loop for building conflation, inside
  Overture's own org. ⭐ Written by the person now leading EUBUCCO v0.2 — so "geometric matching
  needs a review loop" and "Europe's largest open conflation effort" are **one lineage, not two
  independent data points** (E5-C §P-14).

**D.4 · NAMED FALLBACK, not adopted** — **Hootenanny (GPL-3.0, NGA)**: the only mature OSS engine
with a *building-specific* conflation algorithm (10,050 commits) — but **~23 months with no
release**. If Pryzm is ever forced into geometric matching for the un-bridged cadastres, building
it in-house would reinvent that; **verify the project is alive first** (E5-C §P-4).

**D.5 · REFUSED / dominated for Europe** — VIDA combined buildings (no Europe coverage) ·
3D-GloBFP · OpenBuildingMap · OpenFisca (AGPL network clause + wrong shape) · City4CFD (while
roofer exists) · PlanX Urban Procedural 3D and 3D Cityplanner (**envelope sandboxes with
user-supplied rules — envelope UX is commoditising; the moat is jurisdictional rule depth with
provenance**).

**D.6 · The market's own statement about the empty seat.** Autodesk Forma ships zoning-responsive
envelope generation fed by Zoneomics GDE APIs (height, setbacks, lot coverage, floor-area limits)
— *"currently available for cities in the US and Canada."* ⭐ **The incumbent CAD vendor
demonstrably wants this feature and shipped it where a rules-data supplier exists. What is missing
in Europe is the DATA SUPPLY, not the envelope UX and not the demand** (E5-C §P-13).

---

# E — MACHINE-READABLE PLANNING SOURCES (the four categories)

The 21-country four-category matrix is `E5-B Part B`. Tallies: **cat 1 reached by 21/21 · a real
cat 2 by 8 (NL, DK, LT, DE-partial, LU, AT, SE-partial, FI-partial) · cat 3 by 5 (EE, CH, IE, LV,
FR-extract) · a cat-4 artefact of some kind in 12, of which only 5 are openly consumable.**

**E.1 · The find — Luxembourg.** One national **CC0** GeoPackage (259,912,001 bytes zipped / 617 MB
open, refreshed **2026-08-31**, one day before the probe; **downloaded and read with `sqlite3`,
not sniffed**): 27 feature classes including **`PAG_PAG_NQ_PAP` with `COS_MIN/MAX`, `CUS_MIN/MAX`,
`CSS_MAX`, `DL_MIN/MAX` as typed numeric columns on 3,017 new-quarter zones**, overlays, **2,442
alignments (building lines) as geometry**, servitudes, **and 653,315 cadastral parcels with
`NUM_CADAST`** — so **parcel → zone → numbers resolves inside one file, without a second
provider**. Measured fill: all four maxima non-null **97.8%**, all four strictly positive
**93.7%**; the zeros were checked and are MEANINGFUL (ZAD deferred-development zones,
non-residential zones) — **not** Slovenia-style sentinels (E5-B §A-13). Honest limits: **no max
height, no setbacks, no storey count anywhere in the model**, and the **18,743 existing-quarter
zones carry zero numerics** and stay document-bound.

**E.2 · The anti-find — Slovenia, and it is the more dangerous one.** The national WFS carries
**the most complete envelope schema in Europe** (`FI_MIN/MAX`, `FZ_MIN/MAX`, `FZP`, `GP`, storey
and height slots) at **0.5–1.1% fill** — and **the values that ARE present are sentinel zeros**
(`FZ_MAX "0"`, `FI_MAX "0"`, `FZP_MIN "0"` on real residential land); **`V > 0` on ZERO polygons
nationally**. ⛔ **Binding adapter rule: `0` on `FZ`/`FI`/`FZP`/`GP`/`V` means UNKNOWN, never
zero** — a numeric-coercing adapter yields coverage-0 / FAR-0 on residential land: L-616 and
`[[envelope-solid-overstates-partial-data]]` exactly, and the sentinel-≠-unknown rule from
`[[corpus-never-jittered-min-over-peers]]`. **A `DescribeFeatureType`-only audit would have
crowned Slovenia Europe's best rules country** (E5-B §A-18).

**E.3 · Completeness fails on three independent axes, and every country fails a different one**
(E5-B §C.2c) — this replaces the single "5–50%" figure:

| axis | fails here | measurement |
|---|---|---|
| **PARAMETER coverage** — which parameters exist at all | **LU** | COS/CUS/CSS/DL at 93.7–97.8%, **no height, no setback, no storeys** |
| **SPATIAL coverage** — how much of the country | **EE** | the richest per-plot payload in Europe on **12,088 krunt / 10,301 hoonestus** vs ~700k cadastral units. **LU fails here too**: 3,017 numeric zones vs 18,743 with none |
| **VALUE fill** — how often a present field is populated | **SI 0.5–1.1%** · **LT 14–18%** · **DK 30.6 / 43.1 / 60.8%** by plan level | server-side `hits` counts, not samples |

⭐ **LU and EE are the clean demonstration — broad-and-shallow vs narrow-and-deep. Averaging them
into one percentage destroys the only information a build/consume decision needs.**

**E.4 · The revised verdict this report adopts:**
> **No European state serves a computed buildable envelope (21/21, confirmed).** Machine-readable
> numeric planning RULES are **not** uniformly scarce: they range from **93.7% (LU — four areal
> parameters, national, CC0)** to **0.5% (SI — complete schema, empty)**. Rule availability must be
> reported per country on **three axes — parameter coverage × spatial coverage × value fill —
> never as one percentage.**

**E.5 · Other structural facts that change engineering, not merely knowledge:**
- **Germany's extraction input is a SCAN, not a text.** NRW ships **87,736 Bauleitpläne in one open
  GeoPackage** (196,350,070 bytes) — `scanurl` **100.0%**, **`texturl` 13.3%**, `stand=4000` (in
  force) 95.8%. The DE line item is **OCR over scanned drawings for ~87% of plans**, a materially
  different cost line from "extract from PDF" (E5-B §A-16). *(Method note worth keeping: the
  catalog JSON implied a `bplan/` sub-path that 404s — the file sits one level up. A directory
  listing is not a download URL.)*
- **Vienna is cat 2 by CODE→STATUTE JOIN**: the zone value `W1` names a *Bauklasse*, and the height
  bands are numerically defined in BO für Wien §75 — machine-derivable through a fixed statutory
  table, the same shape as Pryzm's existing rule packs. But the served layer is explicitly
  *generalisiert* and **no vector dataset carries Bebauungsbestimmungen** — established by a
  capabilities grep, not by a page's silence (E5-B §A-17).
- ⚠ **Vienna's 3D "Baukörpermodell" is the AS-IS building model** (problem A), **not** a permitted
  envelope. Do not conflate them on the strength of the name.
- **NL is the one country that could move the ceiling above Luxembourg's, and it is UNMEASURED** —
  the lane could not obtain a DSO key (E5-B §C.4). **The highest-value next probe in Europe.**

---

# F — EXISTING BUILDABLE-ENVELOPE / DEVELOPMENT-POTENTIAL SYSTEMS

**F.1 · The answer to the brief's premise.** Brief §4 calls category 4 the most valuable discovery
— *"if a country provides it, Pryzm should NOT recreate it."* **No country provides it.**
Re-tested over 21 countries in each national language, plus semi-official bodies, plus a second
sweep from envelope/massing/setback-solver vocabulary, plus the commercial market (E5-B §C.1,
E5-C §P-13).

**F.2 · Category 4 exists in FIVE shapes, none of them a buildable envelope** (E5-B §B.1):

| shape | instances | what it really is |
|---|---|---|
| **1 · Remaining-right SUBTRACTION** ⭐ | **FI HSY SeutuRAMAVA** — block reserve = building right − used floor area, computed twice yearly by the authority; probed twice: block `0490100001` `kala` 137777 / `karayht` 116900 / **`laskvar_yh` 27659** split per use, `rekpvm` 20251219; keyless, CC BY 4.0; **4 municipalities** · **ES Madrid VEDA** — `UUBV_NM_ED 3638.0` `"m2 Plan"` for RESIDENCIAL VIVIENDA COLECTIVA; **390 parcels of 391 in layer 0**, against 39,745 planeamiento polygons | **the only two bodies in Europe publishing the number Pryzm computes** — both sub-national, both small |
| **2 · Capacity JUDGEMENTS** | UK statutory brownfield registers (**37,670 sites**, min/max net dwellings, OGL v3, England-only) · NL provincial plancapaciteit monitors | human-declared pipeline counts, **not rule-derived** |
| **3 · Applicability determinations / site inventories** | **IE RZLT** — **296,293 parcels**, keyless ArcGIS FeatureServer, `PARCEL_ID` + the national `ZONE_GZT` vocabulary + `SITE_AREA` + `LIVE_SITE`, statutory under the Finance Act 2021, 30 of 31 local authorities — **a per-parcel harmonised zone code in a country with NO cadastre** · **LV VZD fz-šķēlumi** — **180,691 zone × parcel intersections with split areas**, CC-BY-4.0, ~55% of land units, quarterly · BE Flanders *vermoedelijk ROP* (~43,800 ha; **open geodata NOT CONFIRMED**) · DE Baulandkataster §200(3) BauGB (opt-in per city, no common schema) | they answer **WHERE**, never **HOW MUCH** |
| **4 · Valuation models that ENCODE buildability** | **DE Bodenrichtwerte** — `geschossfl_zahl` (GFZ), `grundfl_zahl` (GRZ), `baumassenzahl`, `geschosszahl`, `bauweise` as TYPED schema fields with real values (Hamburg WFS: GFZ 3.30 / 7.40 / 4.00 on Bürohäuser, `entwicklungszustand "B Baureifes Land"`; NRW ships `BRW_EPSG25832_Shape.zip`, 223 MB, timestamped **2026-09-01**, plus 15 historical vintages) · DK VUR (a state-run per-parcel highest-and-best-use over **the same Plandata fields Pryzm consumes**; parameter exposure NOT CONFIRMED) · SE riktvärde (**prices** byggrätt per value zone; never serves the QUANTITY) · CH Raum+ (canton-internal, GATED) | ⛔ **wertrelevante characteristics of a FICTITIOUS reference plot, legally non-binding.** A labelled prior / plausibility band / cross-check — **never a source of truth**, never "the permitted GFZ here" |
| **5 · Extruded VISUALISATIONS** | **LT TPDR** — 8 keyless SceneServer services, `layerType 3DObject`, regulation zones extruded by `MAX_AUK_M` | the closest thing in Europe to a state-served 3D envelope, **defeated on its own terms**: height only, no setbacks, no coverage, no FAR shaping, over an attribute layer at 14–18% fill. **A map, not an envelope** |

**F.3 · GATED, not missing** (the SE/DK lesson applied): **FR UrbanSIMUL** (Cerema/INRAE) models
parcel-level *capacités constructives* over **5M+ parcels nationally**, free but restricted to
*"acteurs publics de la planification et du foncier et à leurs prestataires"*. Two consequences:
(a) the French state believes parcel-level constructibility is computable from open inputs —
independent validation of Pryzm's thesis; (b) the side door is acting as *prestataire* of a
collectivité on a project basis. **A business-development question for the founder, not an adapter**
(E5-B §A-6).

**F.4 · NOT CONFIRMED after language-specific searching**: EE, PT, IT, CZ, NO, PL. Per the brief's
own rule that is *not found by this lane* — never the same as *does not exist*, never the same as
*refused*. **PL is the interesting one**: *chłonność* is a STATUTORY capacity computation the gmina
must run, published **inside plan documents**, not as data (E5-B §A-12/§A-21).

**F.5 · The five sources that move work from "Pryzm computes" to "Pryzm consumes" today, keyless or
CC0:** FI HSY · ES Madrid VEDA · UK brownfield · IE RZLT · LV fz-šķēlumi. **None replaces an
envelope; all five replace WORK** — three replace the applicability step, two replace the
subtraction (E5-B §C.3 item 4).

---

# G — THE DO-NOT-BUILD INVENTORY (the centrepiece)

**Classification, exactly as brief §6 defines it — five classes, two of them green:**

| mark | meaning |
|---|---|
| 🟢 **CONSUME** | consume directly — the source serves the value; Pryzm fetches and cites it |
| 🟢 **NORMALIZE** | light normalization only — units, codelists, CRS, sentinel handling; no new knowledge |
| 🟡 **CONFLATE** | requires conflation — the value exists across sources that must be matched/joined |
| 🟠 **EXTRACT** | document / AI extraction only — the value exists in prose or a scan, never as data |
| 🔴 **BUILD** | not available anywhere — Pryzm builds or derives it |

**Discipline:** every row carries the lane/probe that evidences it. Where a row's class differs by
country, the row states BOTH classes and names the countries — a component with one colour across
Europe is the exception, not the rule. **No row is an assumption.**

## G.1 — AS-IS components (problem A: what physically exists)

| # | Component | Class | Where, and the limit | Evidence | Pryzm action |
|---|---|---|---|---|---|
| A1 | **Parcel geometry** | 🟢 CONSUME | live/keyless in ~25 of 30 countries; **19/20 chains DIRECT**. Genuine absences: central Lisbon (measured 0 features), IE and GB have no cadastre by design | REPORT §R; L5 synth 3; SUP §10 row 16 | fetch + cite; **never mirror** a live-API cadastre |
| A2 | **Cadastral / authoritative building footprints** | 🟢 CONSUME (ES, DE, FR, NL, EE, SI, BE, CZ, PL, CH; DK behind a free key) · 🟡 CONFLATE (IT, PT, GB, NO, LT) | for the five 🟡 countries there is **no open authoritative channel at all** — Overture/EUBUCCO is the primary plan, not a fallback | E5-A Part 2 (per-cell citations); E5-A §2/§5/§10 | consume where 🟢; run the federation for the five |
| A3 | **Stepped massing from building PARTS** | 🟢 CONSUME | ES: 5,318 multi-part buildings, **4,896 (92.1%) stepped**; the part decomposition *is* a volumetric account | ES3D §L2-2 (measured, municipality-scale) | threshold-union per floor (A5); **do not model massing from a single footprint** |
| A4 | **Floor COUNTS (register-side)** | 🟢 CONSUME (ES parts · SI · **CH GWR daily national bulk** · FR BD TOPO · DK BBR key · EE EHR) · 🔴 BUILD/derive (DE, NL) | **DE `anzahlgs` populated 0 of 500** — the slot exists and is empty; NL BAG has use+area but no storeys | E5-A §1 (probed), §6 (probed), §3.1 | consume where served; elsewhere `height ÷ storey`, tier-3, never tagged measured |
| A5 | **Floor-level GEOMETRY** | 🟢 CONSUME (SI `ETAZE`, class A) · 🟠 EXTRACT/gated (ES FXCC — CAPTCHA, partial by construction) · 🔴 BUILD (everywhere else) | **exactly two countries in Europe.** SI's `GEOM` is nillable, **fill unmeasured** | E5-A §7 (probed); ES3D §L2-3 (2024 spec read) | consume SI; ES via FXCC where retrievable **plus** the INSPIRE threshold-union everywhere; scope the capability to two countries |
| A6 | **Floor-level USE and AREA** | 🟢 CONSUME | ⭐ **ES nationally, keyless, no CAPTCHA** (`Consulta_DNPRC` returns per-unit `es/pt/pu` floor codes) · SI `DELI_STAVB`/`PROSTORI` · EE EHR | ES3D §L2-4 (probed, two parcels, 0.03% cross-channel agreement) | consume; ⛔ normalise `pt` — Barcelona returns `"0"`/`"-1"`, Madrid `"00"` |
| A7 | **Existing GFA** | 🟢 CONSUME (ES `grossFloorArea` + DNPRC sum · SI `BRUTO_TLORISNA_POVRSINA` · EE EHR · DK BBR key) | ⚠ ES `OfficialArea` self-declares **`sourceStatus=NotOfficial`, 6,030/6,030** | ES3D §L2-2/§L2-8; E5-A §7 | consume; **cite the sourceStatus, never the element name** |
| A8 | **Measured building HEIGHT (raster)** | 🟢 CONSUME the pre-computed nDSM (ES MDSnE · FR MNH LiDAR HD · BE-Wallonia MNH) · 🔴 BUILD only the zonal statistics | ⚠ ES per-footprint coverage **32–40% in dense centres**; the fallback `floors × 3.2 m` understates by ~0.6 m/floor against a measured **3.76–3.84 m/floor** | REPORT §H.3 row 3; `impl/e3b-state-heights-verdict.md` (both re-probed live 2026-09-01) | **DO NOT build DSM−DTM differencing for ES/FR.** Zonal stats + the honesty ladder only |
| A9 | **LoD2 city models** | 🟢 CONSUME (NL 3DBAG · EE 856,360 LoD2 · DK · CH · PL · DE ×15 Länder · FI partial) · 🔴 BUILD-by-external-tool elsewhere | DE has **no open national aggregate** (BKG closed) — federate 15 Land downloads; FI coverage **NOT CONFIRMED** | E5-A Part 2, §4; L2 DE-5 | consume; **roofer as an external process** where no state product exists |
| A10 | **Terrain DTM tiles** | 🟢 CONSUME (Mapterhorn: `encoding terrarium`, lossless WebP, planet + regional PMTiles, `Last-Modified 2026-08-20`) · 🔴 BUILD only the datum lift + façade-rasant sampling | the two retained pieces are **legal requirements**, not preferences (L-584: the ordinance measures rasant at the FAÇADE) | `impl/e3a-mapterhorn-verdict.md` (ADOPT); seam implemented default-OFF in `impl/lane-terrain-mapterhorn-seam.md` | stop compiler investment; keep the two legal legs |
| A11 | **Footprint ↔ register CONFLATION** | 🟢 CONSUME where the state pre-joined (EE EHR-id-in-the-3D-model · SI `EID_STAVBA` · NL BAG spine · CH EGID) · 🟢 CONSUME the published bridge (ES) · 🟡 CONFLATE (the rest) | **`ign_es` is the only European NMA bridged to GERS** — verified at the object store, 16 provider partitions in `2026-08-19.0` | E5-A §3.2; E5-C §P-1 | **do not write a matcher for the pre-joined countries or for Spain** |
| A12 | **Stable cross-source building ID** | 🟢 CONSUME (GERS) | ⚠ **the bridge-file LICENCE is unstated after two probes** — assume the buildings theme's ODbL reach and ask Overture before redistributing the mapping | E5-C §D1, §P-1 | consume the id; **do not build an id system**; do not redistribute the mapping yet |
| A13 | **Pan-EU fallback footprints** | 🟢 CONSUME (Overture backbone · **EUBUCCO v0.2 via the source.coop ODbL-clean mirror** — FGB/Parquet/**PMTiles**) | v0.2 = 322M buildings / 30 countries; the mirror already excludes the CC-BY-SA Prague and **CC-BY-NC Abruzzo** pockets | E5-C §P-8, §S.2 item 3 | consume the mirror rather than filtering `geometry_source` yourself |
| A14 | **Fallback building ATTRIBUTES (height/epoch/function)** | 🟢 CONSUME (GHS-OBAT, **plain GERS equi-join** — zero geometric conflation) | ⚠ ids minted against Overture `2024-07-22.0`, ~13 releases behind — **one join-rate test owed before it ships**; ODbL per the JRC (the licensor), **not** the CC-BY a re-host claims | E5-C §D6, §P-2 | consume after the drift test; keep inside the ODbL isolation |
| A15 | **ML-modelled global heights (last resort)** | 🟢 CONSUME with a tier label (GlobalBuildingAtlas: 2.75B polygons, 3 m height raster, RMSE **1.5–8.9 m**, ~2019) | data ODbL; **code is MIT + Commons Clause — commercial use of the CODE restricted** | E5-A §9; E5-C §D5 | note-only until a no-LoD2 country enters rollout; **never above a national source** |
| A16 | **Façade photography** | 🟢 CONSUME | ES: a **keyless** `documentLink` GET service per building, carried in the INSPIRE GML | ES3D §P6 | consume for the photo-facade pipeline; do not source imagery separately for ES |
| A17 | **Context: roads / water / land use** | 🟢 CONSUME | Overture/OSM, already shipped as PMTiles on R2 | REPORT §H.3 row 9; L7 §5 | unchanged — this is settled |
| A18 | **3D formats, encoders, tiling, validators** | 🟢 CONSUME | cjio / CityJSON / FlatCityBuf / PMTiles / val3dity; **CHEK `IFC_BuildingEnvExtractor`** is the only OSS IFC→CityJSON LoD-ladder extractor (LGPL/GPL, self-labelled experimental) | REPORT §H.3 row 9; E5-C §P-11 | **write no encoders**; wrap tools as external processes |

## G.2 — DEVELOPMENT-POTENTIAL components (problem B: what may legally be built)

| # | Component | Class | Where, and the limit | Evidence | Pryzm action |
|---|---|---|---|---|---|
| B1 | **Plan / zone GEOMETRY** | 🟢 CONSUME | **21/21 countries reach cat 1** | E5-B Part B (21-country matrix) | fetch + cite; the plan-geometry step was already 100% DIRECT in the 20 chains (REPORT §R) |
| B2 | **Plan DOCUMENT index (the URL of the governing text)** | 🟢 CONSUME | DK **100% doklink**; **NRW 87,736 plans, `scanurl` 100%** | L2 DK-1/2; E5-B §A-16 (measured) | consume the index; **never re-catalogue plans** |
| B3 | **Zone → parcel INTERSECTION (the applicability inputs)** | 🟢 CONSUME (LV fz-šķēlumi 180,691 rows ~55% · IE RZLT 296,293 parcels · LU parcels **inside** the plan GPKG) · 🔴 BUILD elsewhere | LV/IE give WHERE, never HOW MUCH | E5-B §A-19, §A-14, §A-13 (all probed) | **do not intersect what the state already intersected** |
| B4 | **Numeric envelope RULES as typed data** | 🟢 CONSUME (**LU** COS/CUS/CSS/DL 93.7–97.8% · NL typed norm objects · DK typed fields · EE per-plot `sbp/korgus/protsent/tihedus` · LT where filled) · 🟢 NORMALIZE (AT — Bauklasse code → BO §75 statutory table) · 🟠 EXTRACT (DE, FR, CH, ES, PT, IT) · 🔴 refuse (SI — sentinel zeros) | three axes of incompleteness; every country fails a different one | E5-B §A-13/§A-17/§A-18, §C.2; L2/L4 rows | consume where typed; **no hand-written rule pack for LU** |
| B5 | **National rule VOCABULARIES / codelists** | 🟢 CONSUME | DK `bygberegnaf` · NL IMOW value lists · LT ASGR fields · **IE `ZONE_GZT`** · LU `CATEGORIE` · SI NRP codelist | REPORT §H.2 item 3 ("import the state-run vocabularies"); E5-B §A-14 | **import, never invent**; mirror verbatim tokens (frozen-model doctrine) |
| B6 | **Sentinel / unknown handling in rule sources** | 🟢 NORMALIZE (Pryzm-side, cheap) | ⛔ **SI `0` on FZ/FI/FZP/GP/V means UNKNOWN**; ⛔ **ES `heightBelowGround` is `3 × floors`, not a measurement** | E5-B §A-18 (server-side hits counts); ES3D §L2-1 (27,005/27,005) | a NORMALIZE-layer duty with two named rules — **ship the probe before the adapter** |
| B7 | **Rule NORMALISATION across regimes** | 🔴 BUILD | bebygpct+af / GRZ+GFZ+Z / AZ / MAX_INTENS / Normwaarde / ehitusõigus / COS+CUS+CSS+DL — **no mapping standard exists anywhere** | REPORT §H.4 row 2; L2 §5.4.2; E5-B (adds the LU and SI vocabularies) | Pryzm IP. Per-country semantics ARE the moat |
| B8 | **APPLICABILITY engine (which rule applies HERE)** | 🔴 BUILD | states serve it for **LV ~55%** and **IE (WHERE only)**; nowhere else, and never with the numbers attached | E5-B §B.1 shape 3; REPORT §H.4 row 1 | Pryzm IP — the core intelligence layer |
| B9 | **BUILDABLE ENVELOPE (the solid)** | 🔴 BUILD | **0 of 21 countries. 0 OSS. 0 commercial in Europe.** The nearest state artefact (LT TPDR) is height-only with no setbacks, no coverage, no FAR shaping | E5-B §C.1; E5-C §P-13; REPORT §R (0/20 chains) | Pryzm IP — **the seat is empty and the market says so** |
| B10 | **DEVELOPMENT POTENTIAL (permitted − existing)** | 🔴 BUILD · 🟢 CONSUME as calibration (FI HSY block reserve · ES Madrid VEDA 390 parcels) | the only two bodies in Europe publishing the number Pryzm computes; both sub-national and small | E5-B §A-1, §A-2 (both probed) | build; **use the two as ground truth / cross-check, never as coverage** |
| B11 | **Declared capacity numbers** | 🟢 CONSUME as enrichment | UK brownfield 37,670 sites (min/max net dwellings) · NL plancapaciteit — **human-declared, not rule-derived** | E5-B §A-4, §A-5 | a Product-A enrichment layer; ⛔ never an envelope substitute |
| B12 | **Valuation-model priors that encode buildability** | 🟠 EXTRACT/consume **as a labelled prior only** | DE Bodenrichtwerte carry GFZ/GRZ/BMZ/Geschosszahl/Bauweise as typed fields — **wertrelevante characteristics of a FICTITIOUS reference plot, legally non-binding**; national fill NOT MEASURED | E5-B §A-15 (schema + values probed) | a plausibility band / cross-check where no B-Plan text exists; ⛔ **never a legal limit** |
| B13 | **Per-parcel restriction → law EVIDENCE chain** | 🟢 CONSUME | CH ÖREB is a working national instance of the evidence graph | REPORT §H.3 row 6; L2 CH-1 | **mirror the hops; do not build a rival chain** |
| B14 | **Document → structured-rule EXTRACTION** | 🟠 EXTRACT (Pryzm builds the pipeline) | ⭐ the DE input is **OCR over scanned drawings for ~87% of plans** (`texturl` 13.3%), not text parsing | E5-B §A-16 (measured); REPORT §H.4 row 3 | build — but **ADAPT NREL COMPASS's architecture (BSD-3): drift-check against source, a URL per record** |
| B15 | **XPlanGML parse / validate** | 🟢 CONSUME as an external service | ozgxplanung, **AGPL-3.0 CONFIRMED**, 26 releases | REPORT §H.3 row 4; E5-C §D13 | Docker sidecar; **never linked into the product** |
| B16 | **Rule ENGINE / DSL** | 🔴 BUILD thin · 🟢 adopt patterns only | no adoptable engine exists (Drools/SHACL/OpenFisca/BCRL all rejected); **Catala (Apache-2.0)** is the strongest prior art for per-article provenance | REPORT §H.3 row 8, §L; E5-C §D27/§D28 | thin envelope + JSON-Logic bodies; read Catala before the vocabulary freezes |
| B17 | **Jurisdictional CASCADE representation** | 🟢 NORMALIZE / adapt the pattern | CHEK ships requirement↔shape profiles **with inheritance** — national → regional → municipal → plan → building type | E5-C §P-11 | express the cascade as DATA; ⛔ brief §9 forbids country branches in core anyway |
| B18 | **Temporal validity / point-in-time** | 🔴 BUILD · 🟢 CONSUME the raw material (NL, PL, LT, EE; **SI ships `_H` history twins of nearly every layer**) | no versioning axis exists in Pryzm today | REPORT §H.4 row 5; E5-A §7 | build the axis; consume state-served validity where it exists |
| B19 | **Precomputed 3D height extrusions** | 🟢 CONSUME the ATTRIBUTES, not the Multipatch | LT TPDR SceneServers are a visualisation over an attribute layer at **14–18% fill** | E5-B §A-3 (probed at service level); L4 LT-1/LT-2 | consume ASGR values; ⛔ do not ingest I3S/Multipatch as an envelope |
| B20 | **Candidate-site inventories** | 🟢 CONSUME (IE RZLT) · 🟡 CONFLATE (BE Flanders ROP — **open geodata NOT CONFIRMED**; DE Baulandkataster, opt-in per city, no common schema) | applicability, never capacity | E5-B §A-14, §A-9, §A-10 | ingest per launch city where it exists; never a national layer |
| B21 | **Source discovery / registry** | 🔴 BUILD (thin) | the INSPIRE centre is gone; discovery post-INSPIRE is DIY; **no INSPIRE GeoPackage exemplars exist for Cadastral Parcels or Buildings** | REPORT §H.4 row 6; E5-C §P-6/§P-14 | already built thin (35 rows / 15 countries); **keep it thin — control 6** |
| B22 | **Coverage / confidence reporting** | 🔴 BUILD | nothing external equivalent; and E5 shows one percentage cannot express rule availability | REPORT §H.4 row 8; E5-B §C.2c | extend the scorecard to **three axes**, not one score |

## G.3 — DO NOT BUILD AT ALL (whole workstreams, refused with evidence)

| # | Do not build | Evidence |
|---|---|---|
| X1 | **A pan-EU master building dataset** | Every European master attempted froze and staled within a release cycle; federation confirmed (REPORT §H.3 row 1; L1 §F.2). E5 adds that the three usable pan-EU products (Overture / EUBUCCO v0.2 / GHS-OBAT) **already exist and already join** (E5-C §P-1/§P-2/§P-8) |
| X2 | **A cadastre mirror for any country with a live API** | Nothing cadastral is mirrored today and nothing needs to be; cadastre solved or gated in ~25/30 (REPORT §H.3 row 7; L5 synth 3). ⚠ ES additionally **forbids redistribution of the original data** (ES3D §P2) |
| X3 | **Commercial survey-product licensing** (OS MasterMap, NO FKB, HU Geoshop, OSi Prime2) | Derive from open LiDAR instead — doctrine generalises lane-wide (REPORT §H.3 row 13); **NO FKB restriction RE-CONFIRMED 2026-09-01** (E5-A §10) |
| X4 | **A UK by-right envelope product** | Structurally capped by a discretionary system; crowded aggregator market. What the UK state serves instead is capacity JUDGEMENTS (E5-B §A-4; REPORT §H.3 row 10) |
| X5 | **An envelope UX sandbox / massing playground** | PlanX Urban Procedural 3D, ALPA, 3D Cityplanner all ship this with **user-supplied rules**. Envelope UX is commoditising; **the moat is jurisdictional rule depth with provenance** (E5-C §D21, §P-13) |
| X6 | **A European ordinance-extraction architecture designed from scratch** | NREL COMPASS (BSD-3) already implements the retrieve → extract → guard → cite-per-record shape at national-lab quality; zoning-gpt / ai-zoning show the academic field, **with no licensed, evaluated European result** (E5-C §D31/§D32) |

## G.4 — The inventory's own summary

- **🟢 CONSUME / NORMALIZE dominates the AS-IS side.** Of the 18 A-side components, **15 are
  consumable today in at least the priority countries**; only floor GEOMETRY, the zonal-statistics
  step and the two legal terrain legs are irreducibly Pryzm's.
- **🔴 BUILD dominates the value-creating end of the B-side.** Of the 22 B-side components, the
  🔴 rows are precisely the ones a customer pays for — **normalisation (B7), applicability (B8),
  the envelope (B9), development potential (B10), the rule engine (B16), temporal validity (B18)
  and the honest coverage report (B22)** — plus the thin source registry (B21), which is pure
  infrastructure.
- **The single most valuable negative result in the whole audit is unchanged and now stronger:
  nowhere in Europe does a state, an OSS project or a commercial vendor serve a buildable-envelope
  solid derived from the full rule set.** Category 4 as the brief imagined it is provided by
  **no country** (E5-B §C.1) and **no vendor in Europe** (E5-C §P-13).

---

# H — THE IRREDUCIBLE PRYZM LAYER (CONSUME / NORMALIZE / CONFLATE / DERIVE / OWN AS IP)

Brief §7 asks for the smallest set Pryzm must build itself, split five ways, *"the goal being to
own the last two, not to rebuild upstream."* The split below is the §G inventory re-cut by
ownership. It is then reconciled against the original audit's minimum core (REPORT §H.2) and
must-build list (§H.4) — **they converge; the four divergences are named and explained.**

## H.1 · CONSUME — fetch, cite, never own
Parcels · authoritative footprints and parts · national LoD2 · terrain tiles (Mapterhorn) ·
plan/zone geometry · plan document indexes · typed rules where a state serves them (LU, NL, DK,
EE, LT) · national vocabularies and codelists · registers (ES DNPRC, CH GWR, EE EHR, DK BBR,
SI KN) · pre-computed nDSM rasters (ES, FR, BE-W) · the ÖREB restriction→law chain · GERS ids and
the `ign_es` bridge · the pan-EU fallback stack (Overture, EUBUCCO v0.2 mirror, GHS-OBAT, GBA) ·
the five cat-4 artefacts as calibration (FI HSY, Madrid VEDA, UK brownfield, IE RZLT, LV
fz-šķēlumi) · OSS tools as external processes (roofer, ozgxplanung, val3dity, cjio).
**Pryzm's engineering here is adapters and caching — nothing else.**

## H.2 · NORMALIZE — units, CRS, codelists, and the honesty guards
CRS and units · national token mirroring (never harmonised at L0) · **and the duty E5 makes
unavoidable: demoting values that are structurally misleading at source.** Four independent
demonstrations, all measured this wave:

| source | what it serves | the normalize duty |
|---|---|---|
| SI `NRP_OPN` | `FZ_MAX`/`FI_MAX`/`FZP`/`GP`/`V` = **`0` as a sentinel** | `0` ⇒ **UNKNOWN**, never zero (E5-B §A-18) |
| ES INSPIRE `BuildingPart` | `heightBelowGround` with `uom="m"` = **`3 × floors`, 27,005/27,005** | demote to tier 3 or drop; **never pass through as authoritative** (ES3D §L2-1) |
| EUBUCCO v0.2 | height/floors at "100% completeness" | carry the **43.2% / 16.6% ground-truth flag**, or drop the value (E5-C §P-8) |
| DE Bodenrichtwerte | GFZ/GRZ/BMZ as typed fields | label as a **valuation-model assumption for a fictitious plot**, never a legal limit (E5-B §A-15) |

Plus the small ones the lanes measured: ES `pt` floor codes are not width-normalised (`"0"` vs
`"00"`); DK's `bebygpctaf` denominator basis must ride as a typed qualifier; LT `MAX_INTENS` units
stay unresolved and must REFUSE. **All of this fits the frozen model's existing provenance fields
— it needs no new entity and no new tier** (E4 controls 2, 8, 9).

## H.3 · CONFLATE — matching across sources
Needed for **eleven of the fifteen Source-Registry countries** — ES is bridged, and NL / CH / EE
(plus SI, outside the registry) are state-pre-joined, which leaves **DE · DK · FR · PT · PL · LT ·
BE · FI · IT · NO · GB** — and it is the
*primary* path for the five with no open authoritative building channel (IT, PT, GB, NO, LT).
Not needed — and must not be built — for EE, SI, NL, CH (state pre-joins) or ES (published
bridge). Includes per-source priority, dedup, height-confidence ordering, and **the ODbL
separability boundary: source layers stay separable, never physically merged** (REPORT §G — the
single biggest legal design constraint in the buildings stack).
**Scaffold status: in flight** (`packages/site-parcel-data/src/buildingsFederation/`).

## H.4 · DERIVE — Pryzm computes it from consumed inputs
Per-floor footprints by threshold-union over parts (ES, and the pattern generalises wherever parts
exist) · zonal statistics over a pre-computed nDSM · the `floors × metres-per-level` ladder with its
tier · **the buildable envelope solid** · permitted GFA · **permitted − existing** · §34/context
inference for DE (~30% of German parcels, no numeric source exists at all) · the datum lift and
**façade-rasant sampling** (a legal requirement, L-584) · the coverage/confidence scorecard.

## H.5 · OWN AS IP — the irreducible layer
1. **The deterministic parcel → envelope engine with per-rule provenance.** 0/21 states, 0 OSS,
   0 European commercial (E5-B §C.1; E5-C §P-13).
2. **The applicability engine** — which rule applies HERE, and why.
3. **Rule normalisation across regimes** — the per-country semantics ARE the moat.
4. **The declarative rule representation** with per-rule provenance (frozen E4 model).
5. **The versioned evidence graph** and point-in-time answers.
6. **The refusal / never-overstate machinery**, generalised — and E5 proves it is not defensive
   book-keeping but the product's core competence: four different European sources will silently
   overstate if consumed naively (H.2 above).
7. **The source registry as code** (thin — control 6).
8. **Corpus-scale document→rule extraction with gate-verified provenance** — the design adapted
   from COMPASS, the corpora Pryzm's own.
9. **The three-axis coverage report** (parameter × spatial × value fill) — E5's own contribution to
   what "coverage" may honestly mean.

## H.6 · Reconciliation with the original audit's minimum core (REPORT §H.2 / §H.4)

| REPORT §H.2 minimum core | E5 split | Verdict |
|---|---|---|
| 1 Source registry | OWN (thin) | **converges** — built, 35 rows / 15 countries, `lane-reg-source-registry.md` |
| 2 Adapter SDK | OWN | converges |
| 3 Canonical model | OWN (FROZEN after the R-batch) | converges — **and E5 adds nothing to it** |
| 4 Evidence graph | OWN | converges |
| 5 Rule normaliser + declarative format | OWN | converges |
| 6 Applicability engine | OWN | converges |
| 7 Deterministic geometry/envelope engine | OWN + DERIVE | converges |
| 8 Confidence/provenance + heatmap | OWN | converges, **amended to three axes** (divergence D3) |
| 9 Tile/context infra | **CONSUME**, with two DERIVE legs | **divergence D1** |
| 10 API surface | OWN | converges |

**The four divergences, stated rather than smoothed:**

- **D1 — item 9 shrinks.** The audit listed tile/context infra as core Pryzm infrastructure. E3a's
  measured verdict ADOPTS Mapterhorn as the bake-time DTM source, so the owned part reduces to the
  **datum lift + façade-rasant sampling** — retained because they are *legal* requirements, not
  preferences. (Seam implemented, **default OFF**; cutover is a later superseding commit.)
- **D2 — the CONFLATE layer shrinks in scope but not in existence.** REPORT §H.4 row 9 makes
  "GERS-keyed federation/conflation with per-source priority" a must-build. It stays — but its
  Spain leg becomes CONSUME (the published bridge), and four more countries need no matcher at all
  (state pre-joins). **Thirteen countries still do.**
- **D3 — the coverage report changes shape.** §H.4 row 8 assumed a confidence/coverage engine
  extending the C63 scorecard. E5 shows a single rules percentage is not expressible: LU 93.7%,
  SI 0.5%, EE narrow-and-deep, LU broad-and-shallow. **Three axes, or the number lies.**
- **D4 — a NORMALIZE duty the audit did not name.** Four sources (SI, ES, EUBUCCO, DE BRW) serve
  values that are structurally misleading. The audit treated overstatement as an engine-side
  concern (never-overstate on the envelope). E5 shows it starts **at ingest**. This is a layer
  duty, not a per-adapter fix — and it needs no new core, only the frozen provenance fields.

**Nothing in E5 expands the core** (brief §9, E4 controls 2/6/10). Every new source is a data row
in an existing registry or federation table; every new guard is an adapter-level normalisation
using fields the frozen model already has.

---

# I — THE 20-PARCEL MATRIX, EXTENDED WITH THE PRYZM-WORK COLUMN

**Method.** The baseline is `SUP §10` — nine steps per parcel: **P** parcel · **C** context ·
**S** planning source · **PL** applicable plan · **R** numeric rule · **E** evidence · **D** typed
constraint · **V** envelope · **DP** development potential. "Served" counts steps the state answers
DIRECT (or DIRECT-where-filled); **% = served ÷ 9**, so the arithmetic is reproducible from the
column beside it. ⚠ **Step counts are not effort weights** — the two steps nobody serves anywhere
(V, DP) and the one that forks (R) carry nearly all the engineering cost. The baseline's own
test-wide rule 4 still binds: this table is **shrink-only in the MISSING/AI direction** — a later
run may upgrade a step, but any downgrade is a regression requiring a named cause (SUP §10).

| # | CC | Parcel | Served today | % | The E5 delta for this row | **PRYZM WORK for this address** |
|---|----|---|---|---|---|---|
| 1 | DK | København Nørrebro, BFE 6021259 | P C S PL R E D | 78% | DK VUR runs a per-parcel highest-and-best-use over the SAME Plandata fields — a cross-check oracle (E5-B §A-8) | envelope + DP; the `af=4` denominator as a typed qualifier |
| 2 | DK | Aarhus Midtby, BFE 5625716 | P C S PL R E D | 78% | same | envelope; **and the REFUSAL** — `af=1` = plan-area-as-a-whole, so a per-parcel 180% GFA must be refused, not computed |
| 3 | EE | Tallinn Kalamaja 78401:101:7194 | P C S PL R E D DP(GFA) | 89% | E5 measures the coverage the lane did not state: **12,088 krunt / 10,301 hoonestus** nationally (E5-B §A-20) | envelope geometry only — the GFA number is served |
| 4 | EE | Tallinn Old Town 78401:101:0109 | P C S E | 56% | — | plan-absence handling, heritage-statute extraction, envelope, DP |
| 5 | DE | Köln, Flurstück 05495800500898 | P C S PL E | 56% | ⭐ the extraction input is a **SCAN** (NRW `texturl` 13.3%) — OCR, not text parsing (E5-B §A-16); Bodenrichtwert GFZ available as a **labelled prior** (§A-15) | OCR→rule extraction, normalisation, envelope, DP |
| 6 | DE | Cramonshagen (MV) B-Plan Nr. 4 | P C S PL R E D | 78% | ALKIS `anzahlgs` empty 0/500 — existing floors stay LoD2-derived (E5-A §1) | envelope from the storey route; tier-6 rows for the empty `gfz`/`hoehenangabe` |
| 7 | CH | Luzern parcel 3729, EGRID CH873588275009 | P C S PL E | 56% | ARE Bauzonenstatistik is aggregate-only; Raum+ parcel reserves are canton-internal/GATED (E5-B §A-7) | Reglement extraction, envelope, DP — **mirror ÖREB's chain, do not rebuild it** |
| 8 | CH | Basel parcel 0039, EGRID CH516702897010 | P C S PL E | 56% | same | as above + the `areaShare` degradation (geometry:null restrictions) |
| 9 | ES | Barcelona refcat 2940601DF3824B | P C S PL E DP(existing) | 56% | ⭐ **DNPRC serves per-floor use+area for this parcel, keyless** — Σ 19,573 m² vs `grossFloorArea` 19,567 m², 0.03% apart (ES3D §L2-4) | permitted-GFA rules (pack, human-validated), envelope, **permitted − existing** (computable TODAY here) |
| 10 | ES | Madrid refcat 2255404VK4725E | P C S PL E DP(existing) | 56% | Madrid VEDA serves available edificabilidad — **but on 390 ámbito parcels; this consolidated-city parcel is NOT among them** (E5-B §A-2) | NZ-ring rules, envelope, permitted GFA; the EPSG:25830-only trap as an acceptance gate |
| 11 | FR | Paris 11e, idu 75111000BK0051 | P C S PL E | 56% | UrbanSIMUL models exactly this nationally and **gates it to public actors** (E5-B §A-6); Etalab `batiments` adds a second building channel (E5-A §5) | règlement extraction, envelope, DP |
| 12 | FR | Lyon, idu 69382000AB0062 | P C S PL E | 56% | same | same, on a PLUi instrument |
| 13 | NL | Amsterdam ASD04 F 8039 | P C S PL R E D | 78% | ⚠ **NL rule FILL is still unmeasured — the one country that could beat Luxembourg's ceiling** (E5-B §C.4) | dual-regime merge (IMOW ∪ IMRO), envelope, DP |
| 14 | NL | Utrecht UTT00 C 1203 | P C S PL R E D | 78% | same | same |
| 15 | PT | Tavira, NIC AAA 000 582 219 | P S PL E | 44% | no cat-4 product; PT stays document-bound (E5-B §A-21) | buildings by conflation, PDM extraction, envelope; **existing GFA stays MISSING** |
| 16 | PT | Central Lisbon (measured negative) | C S PL E | 44% | — | honest absence at P + fallback geometry, extraction, envelope |
| 17 | LT | Vilnius 0101/0054:0328 | P C S PL E (+R where filled) | 56–67% | TPDR's 3D height extrusions are a **visualisation**, not an envelope (E5-B §A-3) | envelope **after** the `MAX_INTENS` unit resolution — and a REFUSAL until then |
| 18 | LT | Vilnius 0101/0054:0345 | as row 17 | 56–67% | same | same |
| 19 | PL | Warszawa 146510_8.0309.24/35 | P C S E (PL partial) | 44–56% | *chłonność* is computed by the gmina **inside plan documents**, never served as data (E5-B §A-12) | MPZP extraction now; the source-class flip document→structured when RU fills (≤2026-11-30); envelope; DP |
| 20 | PL | Kraków 126105_9.0001.311 | as row 19 | 44–56% | same | same — may be the first PL chain to flip |

## I.1 · The headline answer: "for an address today, what % exists vs what % Pryzm computes?"

**There is no one honest number. There are three, and they must be quoted with their tier.**

| tier | countries | exists today | Pryzm computes | what Pryzm computes |
|---|---|---|---|---|
| **1 — structured rules** | NL · DK · EE *(inside its 12,088 detail-planned plots)* · **LU** *(inside its 3,017 new-quarter zones)* | **78–89%** | **11–22%** | the envelope, the development potential, and the normalisation between regimes |
| **2 — document rules** | DE · FR · CH · ES · IT · PT-partial | **~56%** | **~44%** | **+ the entire numeric-rule layer by extraction** — the expensive half |
| **3 — absent / in transition** | PT · PL *(pre-RU)* · GR/BG/HU/MT-class | **44–56%** | **44–56%** | + buildings by conflation, + absence handling that stays honest |

**Two facts survive every tier, and they are the product:**
- ⭐ **The envelope step is served in 0 of 21 countries.** Whatever the percentage, **the last two
  steps are Pryzm's for every address in Europe** (E5-B §C.1; REPORT §R 0/20).
- ⭐ **A country can drop a whole tier by ADDRESS, not by country.** EE outside its detail-planned
  plots falls from tier 1 to tier 2; LU outside its new-quarter zones does the same. **Spatial
  coverage is a per-address property, and the answer must be computed per address, never quoted
  per country.**

**Cross-check against the audit's own measure.** REPORT §R aggregates 20 live chains over 7 axes
and reads **~53% DIRECT**, with the fork at the numeric-rule step (30% DIRECT + 20% conditional +
50% AI-extracted) and the envelope at **0% DIRECT / 100% derived**. The 9-step count above reads
higher (mean ~62%) because it counts the evidence step, which is DIRECT everywhere probed. **Both
are right; neither is a single truth.** Quote the tier, the denominator and the step list — or do
not quote a percentage.

**What E5 moved, and what it did not.** E5 raises the served fraction in five specific ways —
LU's typed rules for a whole country, LV/IE's state-computed applicability, SI's floor geometry
and register, CH GWR's national floors, and a cheaper conflation for Spain — **and moves the
envelope step by exactly nothing.**

---

# J — THE E5 IMPLEMENTATION ORDER (amendments to the existing plan waves)

**Binding frame (brief §9, E4 controls 2/5/6/10):** everything below is a **data row, a probe, or
a sequencing change**. No schema change. No new canonical entity. No second provenance system. No
country logic in core. The canonical model is FROZEN and E5 does not reopen it.

## J.1 · WAVE E5 — CONTEXT EUROPE (IN FLIGHT — amend, do not restart)
The federation scaffold already exists (`packages/site-parcel-data/src/buildingsFederation/`:
`gersId.ts`, `sourcePriority.ts`, `conflate.ts`, `odblStore.ts`). The E5 findings land INTO it:

**(a) Source-priority data corrections** (`sourcePriority.ts` — data, not architecture):
1. **`fed-eubucco-v01` → v0.2**, with the **source.coop ODbL-clean mirror** as the access path
   (FGB/Parquet/**PMTiles** — a shape Pryzm's context pipeline already speaks). Record the licence
   exactly: base ODbL, with CC-BY-SA (Prague) and **CC-BY-NC (Abruzzo)** excluded by the mirror.
   ⛔ Height and floors carry the **43.2% / 16.6%** ground-truth split — the flag travels or the
   value does not (E5-C §P-8).
2. **`fed-jrc-ghs-obat`**: the refusal reason **changes but does not lift**. The id space is
   RESOLVED — `id` is a **GERS 32-hex identifier**, so the join is a plain equi-join (E5-C §P-2).
   The remaining blocker is **id drift** (minted against Overture `2024-07-22.0`; current
   `2026-08-19.0`). Keep `assertUsableFederationSource` refusing it until **one join-rate test**
   passes. *(A join on an unverified key is a fabricated join — the existing header says so; only
   the reason narrows.)*
3. **`FEDERATION_CONFLATION_STRATEGY`**: set **ES = `bridge-file`** on the bucket evidence
   (`provider=ign_es/theme=buildings/`, release `2026-08-19.0`, 16 provider partitions). **Every
   other European country stays `geometric-or-none`** — one European NMA is bridged, and the
   listing is the evidence (E5-C §P-1). ⚠ Record the **unstated bridge-file licence** as an open
   hole; do not redistribute the mapping.
4. Add **GlobalBuildingAtlas** as a bottom-tier row, refused as an input until a no-LoD2 country
   enters rollout (data ODbL; **code MIT + Commons Clause**).

**(b) Source-Registry rows to add** (`packages/site-parcel-data/src/sourceRegistry/`, one row per
source, each with `theme` / `coverage` / `updateFrequency` / `adapterStatus` and a dated probe note
citing its lane — the loader rejects unprobed rows, which is exactly right):
`si.ts` **NEW** — KN WFS (`STAVBE`, `STAVBE_OBRIS`, `ETAZE`, `DELI_STAVB`) + the MNVP planning WFS
(with the sentinel caveat in the probe note) · `lu.ts` **NEW** — the PAG GeoPackage (CC0) ·
`lv.ts` **NEW** — VZD fz-šķēlumi + the TAPIS register · `ie.ts` **NEW** — RZLT FeatureServer ·
`ch.ts` — **GWR `public.madd` national bulk** · `fr.ts` — **Etalab cadastre `batiments`** ·
`pl.ts` — the `ModeleBudynkow3D` WMS (bulk UI-mediated — say so) · `fi.ts` — Buildings 3D
(**coverage NOT CONFIRMED**) + **HSY SeutuRAMAVA** · `es.ts` — **Madrid VEDA (390 parcels — the
scope belongs in the row)** + the façade-photo service · `de.ts` — the NRW Bauleitplan GeoPackage
(`texturl` 13.3% in the note) + Bodenrichtwerte (Hamburg WFS, NRW BORIS) · `gb.ts` — brownfield
registers · plus the pan-EU rows the federation table points at (Overture bridge files, EUBUCCO
v0.2 mirror, GHS-OBAT, GBA) with `registryGapReason` cleared where a row now exists.
⭐ Note the registry's own bookkeeping: **SI, LU, LV and IE currently sit in `SOURCE_ABSENCE_REASONS`** ("no dated endpoint probe"). The E5 probes ARE that evidence, dated — so those four absences are replaced by real rows rather than edited away, and the loader's no-unprobed-rows rule is satisfied by construction.

**(c) Two NORMALIZE guards, adapter-level, no core change** — **SI: `0` ⇒ UNKNOWN** on
FZ/FI/FZP/GP/V; **ES: `heightBelowGround` never tier 1** (demote or drop). Ship each with its
probe, per `[[context-data-honesty-family]]`.

**(d) One honest amendment to E5's own acceptance criterion.** PLAN §E5 says *"the 20-parcel
contextual rows all DIRECT."* **That cannot be true for IT/PT/GB/NO/LT** — those countries have no
open authoritative building channel (E5-A §3.1). Amend to: *contextual rows DIRECT where an
authoritative channel exists, DERIVED-with-provenance elsewhere, **never silently DIRECT***.
An acceptance criterion that can only be met by mislabelling is a defect in the criterion.

## J.2 · WAVE E6 — STRUCTURED-RULE COUNTRIES II (NL · LT · DK · PL)
- ⭐ **First task, before any NL adapter code: MEASURE THE NL FILL.** It is the one country that
  could move Europe's rules ceiling above Luxembourg's, and it is unmeasured (E5-B §C.4). It is
  also already the founder-gated key request (PLAN §F item 1).
- **DK**: add the VUR schema read as a **cross-check oracle** (does it expose the assumed
  utilisation per use, or only the values?) — a probe, not an adapter (E5-B §A-8).
- **LT**: unchanged — the `MAX_INTENS` unit refusal stands; TPDR's 3D layers are consumed as
  ATTRIBUTES, never as an envelope.
- **PL**: add one DuckDB read of the probed BDOT10k GeoParquet to measure storey-attribute fill
  (E5-A §3.4) — it decides whether PL floors are consume or derive.

## J.3 · WAVE E7 — THE STRUCTURED FAMILY (REORDERED by E5 evidence)
PLAN §E7 lists SE · FI · NO · LU · LV · SI as one family. **E5 reorders it and adds two members:**
1. ⭐ **LU FIRST — the cheapest structured country in Europe.** One CC0 file carries zones, the
   four numeric parameters, overlays, building lines, servitudes **and 653,315 cadastral parcels**,
   so parcel→zone→numbers resolves without a second provider. **It must NOT get a hand-written
   rule pack** — it is an input to the declarative evaluator (E5-B §A-13, §C.3 item 1). Declare
   **height and setbacks UNKNOWN** at the never-overstate gate, and the 18,743 existing-quarter
   zones **document-bound**.
2. **LV and IE next — as applicability-only adapters** (new members). LV gives the zone×parcel
   intersection for ~55% of the country; IE gives a per-parcel harmonised zone code in a country
   with no cadastre. Neither gives numbers: **the numeric half stays extraction** (E5-B §A-19/§A-14).
3. **SI — an A-side-first country.** Adopt the building register (`STAVBE`/`ETAZE`/`DELI_STAVB`)
   for context and floors; on the B-side SI is a **REFUSING** country until fill improves.
4. **FI** — consume HSY SeutuRAMAVA as capacity ground truth for four municipalities; check the
   Buildings-3D coverage map before claiming LoD2.
5. SE, NO unchanged.

## J.4 · WAVE E8 — THE DOCUMENT-RULE PIPELINE (DE · FR · CH — and now ES · PT)
- ⭐ **Re-budget the DE line.** The input is **OCR over scanned drawings for ~87% of NRW's 87,736
  plans**, not PDF text extraction (E5-B §A-16). Different tooling, different cost, different
  accuracy ceiling.
- **ADAPT the COMPASS architecture** (BSD-3, national-lab): retrieve the governing document,
  extract numeric constraints with units, **drift-check every extracted value against its source
  text and drop it rather than fabricate**, and **carry a URL back to the document per record**
  (E5-C §D31). That last property is Pryzm's never-overstate gate, already implemented by someone
  else, under a licence Pryzm may read and borrow.
- **Bodenrichtwerte as an explicitly labelled prior** where no B-Plan text exists — preceded by a
  national fill measurement, which E5 did NOT do (E5-B §A-15).
- **Read Catala before the FR/ES rule vocabulary freezes**; check FR terms against SimPLU3D's
  parameterisation rather than inventing names (E5-C §D27/§D20).
- Add **ES and PT** to this wave explicitly — both are document-rule countries and were carried in
  E11's tail.

## J.5 · WAVE E9 — TIME + PROOF
- The coverage heatmap becomes **three-axis** (parameter × spatial × value fill). A single
  "rules score" is now demonstrably unquotable (E5-B §C.2c). This is divergence **D3**.
- Consume state-served temporal material where it exists — **SI ships `_H` history twins of nearly
  every KN layer** (E5-A §7); NL/PL/LT/EE already served validity axes.

## J.6 · WAVE E10 — DEVELOPMENT POTENTIAL
- **Calibrate against the only two European bodies that publish the number**: FI HSY SeutuRAMAVA
  (block reserve, four municipalities) and ES Madrid VEDA (390 parcels). Ground truth for the
  subtraction, **never coverage** (E5-B §A-1/§A-2).
- **ES permitted − existing is computable today** — existing GFA from `grossFloorArea` + the DNPRC
  per-floor sum, cross-agreeing to 0.03% (ES3D §L2-4). Add **SI** (`BRUTO_TLORISNA_POVRSINA`) and
  **EE** (EHR) to the same list.
- UK brownfield / NL plancapaciteit enter as **Product-A enrichment**, flagged human-declared.

## J.7 · WAVE E11 + THE WATCH LIST (re-probe before building)
FR national LoD2 (IGN `lod2bench` — do not manufacture FR LoD2 before re-checking) · NO Kartverket
*volumgeometri* · PL POG/RU fill (≤2026-11-30) · FI Ryhti · EE detail-plan growth ·
**FR UrbanSIMUL — a partnership question for the founder, not an adapter** · IT/PT structural gaps
· CZ RUIAN floors (one VFR parse) · AT beyond Vienna.

## J.8 · ADDITIONS TO THE WEEK-1 PROBE REGISTER (each one-shot, each closes a named hole)
1. **NL DSO fill** (highest value in Europe) · 2. **Overture bridge-file licence** — a question to
Overture, not another fetch · 3. **GHS-OBAT join-rate against a current Overture release** ·
4. **SI `ETAZE` `GEOM` fill** · 5. **PL BDOT10k storey fill** · 6. **FI Buildings-3D coverage map** ·
7. **DE Bodenrichtwert national fill** · 8. **DK VUR schema** · 9. **BE Flanders ROP catalog
query** · 10. **the ES GFA checksum re-run on a Madrid and an Andalusian municipality** (it is one
municipality, one province today) · 11. **EUBUCCO v0.2 release date + which version the mirror
hosts** · 12. **the IJGI 15(6):252 full text** (403 on fetch; no per-country figure may be quoted
until it is read) · 13. **ES/NRW/IE licence texts verbatim** (colours are catalog-level today).

## J.9 · WHAT E5 DOES NOT CHANGE
The frozen canonical model · the ten E4 controls · REPORT §H.2's minimum core · the E1–E11 wave
ladder's shape · the hybrid architecture (Option C) · the ODbL separability constraint. **E5 is a
data wave. It changes what Pryzm fetches and what Pryzm refuses to fetch — not what Pryzm is.**

---

# CLOSING — THE TWO EXPLICIT STATEMENTS

## ⛔ STOP BUILDING — it exists, and here is the evidence

| # | Stop building | Because |
|---|---|---|
| 1 | **nDSM differencing for ES and FR** (and BE-Wallonia) | The states pre-computed it — MDSnE, MNH LiDAR HD, Wallonia MNH. Zonal statistics is the only remaining job (REPORT §H.3 row 3; e3b re-verified live 2026-09-01) |
| 2 | **Terrain tile compilation** (incl. the hand-written quantized-mesh encoder) | Mapterhorn ADOPTED on a measured trial; keep ONLY the datum lift + façade-rasant sampling, which are legal requirements (`impl/e3a-mapterhorn-verdict.md`; L-584) |
| 3 | **Footprint↔register conflation for EE, SI, NL, CH — and for ES** | Four states pre-joined it (EHR id, `EID_STAVBA`, BAG spine, EGID); Spain's is published as a GERS bridge file, verified at the object store (E5-A §3.2; E5-C §P-1) |
| 4 | **Any pan-EU master building dataset or harmonisation effort** | Overture + EUBUCCO v0.2 (322M buildings, 30 countries, ODbL-clean mirror) + GHS-OBAT (GERS equi-join) already exist and already join (E5-A §9; E5-C §P-2/§P-8) |
| 5 | **An LoD2 reconstruction engine** | roofer, GPL-3.0 confirmed, Kadaster-funded through 2026 — external process. City3D exists for the footprint-free contingency (E5-C §D9/§P-3) |
| 6 | **An XPlanGML parser/validator stack** | ozgxplanung, AGPL-3.0 confirmed, 26 releases — Docker sidecar (E5-C §D13) |
| 7 | **A GERS query client, an id system, or a footprint matcher for Spain** | `overturemaps-py` + the `ign_es` bridge (E5-C §D4/§P-1) |
| 8 | **A zone×parcel intersection for Latvia, and a zoning-code harmonisation for Ireland** | LV VZD publishes 180,691 intersections with split areas (~55%); IE carries the national `ZONE_GZT` on 296,293 parcels (E5-B §A-19/§A-14) |
| 9 | **A hand-written rule pack for Luxembourg** | The numbers are typed columns in one CC0 national file at 93.7–97.8% fill, with the parcels in the same file (E5-B §A-13) |
| 10 | **The remaining-right subtraction for HSY's four municipalities and Madrid's 390 ámbito parcels** | The state bodies publish the subtraction; consume it as ground truth (E5-B §A-1/§A-2) |
| 11 | **A rival CH evidence chain** | ÖREB is a working national instance — mirror the hops (REPORT §H.3 row 6) |
| 12 | **Cadastre mirrors for countries with live APIs; commercial survey licensing (OS MasterMap, NO FKB, HU Geoshop, OSi Prime2)** | Nothing cadastral needs mirroring; derive from open LiDAR instead. ES additionally forbids redistribution of the original data (REPORT §H.3 rows 7/13; ES3D §P2; E5-A §10) |
| 13 | **A European ordinance-extraction architecture from scratch** | NREL COMPASS (BSD-3) implements retrieve→extract→guard→cite-per-record at national-lab quality (E5-C §D31) |
| 14 | **CityJSON/3D encoders, tile formats, geometry validators** | cjio, CityJSON, FlatCityBuf, PMTiles, val3dity (REPORT §H.3 row 9) |
| 15 | **An envelope UX sandbox, and a UK by-right envelope product** | Envelope UX is commoditising (PlanX, ALPA, 3D Cityplanner, Forma); the UK is structurally capped by a discretionary regime (E5-C §D21/§P-13; REPORT §H.3 row 10) |

## ✅ MUST BUILD — it does not exist reliably anywhere, and here is the proof

| # | Must build | Proof it is genuinely missing |
|---|---|---|
| 1 | **The deterministic parcel → buildable-envelope engine, with per-rule provenance** | **0 of 21 states** (cat-4 hunt in every national language) · **0 OSS** (SimPLU3D samples, PlanX is a sandbox) · **0 commercial in Europe** — Autodesk shipped exactly this in the US/Canada with a rules-data supplier and **could not ship it here** (E5-B §C.1; E5-C §P-13; REPORT §R 0/20) |
| 2 | **The applicability engine** — which rule applies HERE, and why | The state does the WHERE for LV (~55%) and IE (no numbers), and nowhere else; every cat-4 artefact answers WHERE or HOW MUCH, never both (E5-B §B.1) |
| 3 | **Rule normalisation across regimes** | No mapping standard exists anywhere; E5 adds four more incompatible vocabularies (LU COS/CUS/CSS/DL, SI FZ/FI/FZP, IE `ZONE_GZT`, AT Bauklasse→BO §75) (REPORT §H.4 row 2) |
| 4 | **The three-axis completeness report** (parameter × spatial × value fill) | LU 93.7% with no height · EE the richest payload on 1.7% of the country · SI a complete schema at 0.5% with sentinel zeros. **One percentage cannot express this**, and nobody else publishes it (E5-B §C.2) |
| 5 | **The never-overstate / refusal machinery, applied at INGEST** | Four European sources will silently overstate if consumed naively — SI sentinel zeros · ES `heightBelowGround = 3×floors` · EUBUCCO's ML-imputed "100%" · DE Bodenrichtwert GFZ. It is jurisdiction-independent and unique to Pryzm (H.2 above; REPORT §H.4 row 10) |
| 6 | **Corpus-scale document→rule extraction with gate-verified provenance** | DE alone is ~87% OCR-over-scans across 87,736 NRW plans; CH is Reglement-PDF-bound; ES/FR/PT/IT the same. The architecture is adaptable (COMPASS), **the European corpora are not** (E5-B §A-16; E5-C §D31/§D32) |
| 7 | **The versioned evidence graph and point-in-time answers** | No versioning axis exists in Pryzm; states serve the raw material in NL/PL/LT/EE/SI only (REPORT §H.4 row 5) |
| 8 | **Per-floor massing where floor geometry does not exist** (i.e. 19 of 21 countries) | Floor geometry exists in ES (gated, partial) and SI (fill unmeasured). Everywhere else the per-floor model is Pryzm's threshold-union + a tier-labelled height ladder — **and it must never be presented as "the building's floors"** (ES3D §L2-6) |
| 9 | **§34 / context-derived inference for Germany** | ~30% of German parcels have **no numeric source at all**; nobody does it (REPORT §H.4 row 7; L2 DE-2) |
| 10 | **Geometric conflation for the eleven un-bridged, un-pre-joined registry countries — and as the PRIMARY path for IT/PT/GB/NO/LT** | One European NMA is bridged to GERS; five countries have no open authoritative building channel at all (E5-C §P-1; E5-A §3.1) |
| 11 | **The source registry as code, kept thin** | Discovery post-INSPIRE is DIY; the sanctioned INSPIRE bulk path has **no cadastral-parcel or building exemplars** (REPORT §H.4 row 6; E5-C §P-14) |

---

## HONEST GAPS THIS REPORT INHERITS AND DOES NOT CLOSE

1. **§B is PRELIMINARY** — the Catastro memo has not landed; FXCC retrievability, rate limits and
   real coverage are unmeasured, and the GFA checksum rests on **one municipality in one province**.
2. **NL rule fill unmeasured** — the highest-value open probe in Europe (E5-B §C.4).
3. **Licence holes that are real, not un-checked boxes**: the **Overture bridge-file licence**
   (unstated after two probes) · **LU height/setback existence in the PAP written parts** ·
   ES Madrid *aviso legal*, NRW/opengeodata terms, IE data.gov.ie terms (colours are catalog-level).
4. **Fills not measured**: SI `ETAZE` geometry · PL BDOT10k storeys · DE Bodenrichtwert national ·
   FI Buildings-3D coverage · CZ RUIAN floors.
5. **GHS-OBAT id drift** (13 Overture releases) and the **EUBUCCO v0.2 release date / mirror
   version** — both unresolved at source.
6. **NOT CONFIRMED stays NOT CONFIRMED**: cat 4 for EE, PT, IT, CZ, NO, PL; BE Flanders ROP as open
   geodata; DK VUR parameter exposure; whether ES `OtherConstruction` carries anything but pools.
7. **One peer-reviewed source was read at abstract level only** (IJGI 15(6):252 — MDPI 403). No
   per-country figure from it appears anywhere in this report, deliberately.
8. Every "NOT CONFIRMED" above means *not found by these lanes' searches* — **never** *does not
   exist*, and **never** *refused*.

*E5 Data-Reuse Report — synthesis complete 2026-09-01. Sources: 4 E5 lane files (≈50 live probes
and ≈40 read sources this wave) + the 7-lane 2026-08-31 audit + the E1–E4 gate and implementation
artefacts. READ-ONLY: no production code was changed by this synthesis.*
