# CONTEXT EVERYWHERE — CAN EACH COUNTRY BAKE NATIONALLY? (lane ASSESS, 2026-09-01)

> Lane: context-everywhere assessment · blocks the Regions lane. Foreground-verified this
> session (probe ledger §8; every `RC` read immediately after the command).
> **Authority:** `../E4-EXECUTION-CONTROL.md` (all ten controls — control 9 UNKNOWN≠zero and
> control 10 no-scope-expansion bind every cell) · `../E5-DATA-REUSE-REPORT.md` (BINDING source
> verdicts: **Overture backbone + national override** (E5 §A.5/G.1 A13) · **EUBUCCO NEVER
> authoritative** (E5 §A.5 ⛔: heights 56.7% / floors 79.9% ML-imputed) · **MS GlobalML EXCLUDED**
> until the founder clears its licence) · `e5-asis-national-sweep.md` (**E5-A**) ·
> `../lanes/rest-of-europe-sweep.md` (**L5**) · `e3a-mapterhorn-verdict.md` (**E3A**, ADOPT —
> the bake-time DTM switch landed in `bd5134de`, verified in-tree this session:
> `terrain.mjs` `--dtm-source mapterhorn`, DEFAULT OFF, no REGIONS row routes to it).
> Citation keys: `E5 §…` = the E5 report · `E5-A §…` / `E5-A P2 <CC>` = the AS-IS sweep (Part 1
> section / Part 2 table row) · `L5 <CC>` = the 20-country sweep's country section ·
> `bake §…` / `hs:` / `terrain:` = `tools/context-bake/{bake,heightSources,terrain}.mjs` ·
> **PROBE** = a live probe run by THIS lane, 2026-09-01, ledger §8.
> ⭐ mtimes checked before consuming: E5-A 2026-09-01 09:07 · L5 2026-08-31 23:24 · E3A
> 2026-09-01 05:41 · bake.mjs 2026-08-09 (unchanged) · terrain.mjs 2026-09-01 16:30 (= the
> `bd5134de` seam) · `git diff --stat tools/context-bake/` clean — nothing inherited is dirty.

---

## 0 · The answer in five lines

1. **Every European country in scope can get a whole-country region row NOW for FOOTPRINTS** —
   the bake's default source (Geofabrik OSM extract, per `bake §ALL_REGIONS`) exists for all 25,
   and `buildingsSource:'overture'` is the wired fallback for thin-OSM countries (bake
   §BAKE-OVERTURE). **No European country is CITY-FALLBACK or BLOCKED for context footprints.**
   The fallback machinery exists but nothing here needs it — that is the finding, per country, below.
2. **Terrain is off the per-country critical path** (E3A ADOPT; endpoint re-verified live this
   session: `tilejson.json` HTTP 200, `encoding terrarium` — PROBE-9). What stays national per
   country is ONE datum-lift constant (`terrain: TERRAIN_SOURCES.geoidSepM`) — **13 of 25
   countries already have the row; 15 new constants are owed** (§4) — and L-584 legal sampling,
   which is not a context concern.
3. **Heights are the axis that differentiates the verdicts**: 2 countries measured-wired today
   (ES, DK-key), 1 written-but-unwired (CH — `stampSwissHeightsOnGeojsonseq` exists at
   hs:1977 and is NOT imported by bake.mjs), ~8 with a real channel needing a stamp build,
   ~4 floors-only (derived, row must say so), ~10 honestly mass-only today.
4. **SIZE is a budget decision, not a discovery**: measured pbf sum for the scope ≈ 30 GB →
   projected tiles **~24–57 GB** at the Spain calibration, vs the **10 GB R2 free-tier budget**
   `bake §L-607` itself states. Continent-scale publish requires paid R2 (cash-trivial,
   ~$0.36–0.86/mo at $0.015/GB-mo) **and** the per-region-bake + incremental-sync workflow
   switch that bake.mjs's own comment names — an operational change, NOT a redesign (§5).
5. ⛔ This lane baked NOTHING and published NOTHING. The local toolchain is measured absent
   (osmium/tippecanoe/duckdb/docker all `missing` — PROBE-1), so the executable proof here is
   the pipeline's own plan/preflight (`--check` RC=0 with provisioned heap) plus its fail-loud
   controls firing (§7). The real national bakes run on the CI runner/Docker, sequenced, and
   publish stays a deliberate later step (bake §BAKE-BY-REGION: an s3 sync REPLACES the tileset).

---

## 1 · The pipeline shape a new country consumes (read-only recap — NOT redesigned)

A country = **one region row** in `bake.mjs ALL_REGIONS` (pbfUrl + national bbox + clipped path)
**+ one height-source row** (`hs:SOURCES` entry + `hs:REGION_SOURCE` mapping + a `heightJoin`
tag on the region **+ a stamp-bbox city list** — mandatory for whole-country joins per
bake §HEIGHT-STAMP-BUDGET, proven live this session: `--check` exits **5** at a 2,349 MB heap
and **0** at 13,086 MB with `NODE_OPTIONS=--max-old-space-size=12288`, PROBE-1/2)
**+ optionally the Mapterhorn DTM switch** for the country's terrain city rows
(`--dtm-source mapterhorn`, default OFF, E3A §5).
The three precedent rows this lane's shape copies, read first per the brief:
- **spain** — national bbox `-9.55,35.90,4.60,43.90`, `heightJoin:'mds'` (9 stamp bboxes from
  `hs:MDS_CITY_BBOXES`); pbf ~1.3 GB → tiles **~1–2.5 GB across four layers** (bake §L-607 —
  ⚠ the layer set is now SEVEN: buildings/roads/water/parks/landuse/rail/trees, per the
  `--check` output, so that calibration is a floor, not a ceiling).
- **denmark** — national bbox incl. Bornholm, `heightJoin:'dhm'` (4 stamp bboxes,
  `hs:DHM_CITY_BBOXES`), apikey-gated: no `DATAFORDELER_API_KEY` ⇒ join `blocked` ⇒ honest OSM
  default, never fabricated (bake §BAKE-DENMARK).
- **netherlands** — national bbox, **NO heightJoin** (3DBAG refused per-tile at country scale;
  the OSM-footprint join is the named follow-up, `hs:REGION_SOURCE netherlands`) — the
  precedent that a national row with honest assumed heights is legitimate and already shipped.
Honesty gates armed for every new row (verified in-source this session): §MEASURED-HEIGHT-GATE
(a declared join producing nothing = NON-ZERO EXIT, bake:338), §HEIGHT-STAMP-BUDGET preflight
(exit 5 before any download), the `--region` typo guard (unknown region = exit 2, proven —
PROBE-2), and `--check`'s fail-loud on Overture-without-DuckDB.

**Height CLASS ladder used below** (the brief's five): **MR** measured raster (ES MDSnE class) ·
**RA** register attribute (CH GWR / DK BBR class) · **L2** LoD2 vector (DE Länder / NL class) ·
**FL** floors-only → bakes at `floors × METRES_PER_LEVEL` (hs:51, **3.2 m**) and the row says
DERIVED, never measured (⚠ e3b measured real ES storey height at 3.76–3.84 m — the constant
understates; carried, not fixed here) · **NONE** → P1 mass only (honest OSM defaults).

---

## 2 · THE TABLE — one row per country

> FOOTPRINTS = what the national bake consumes (bake default: Geofabrik OSM) + the national
> override channel per the E5 verdict. HEIGHTS = channel + CLASS + what's owed. TERRAIN =
> Mapterhorn (planet-wide, E3A) + the datum-lift row. SIZE = **measured** Geofabrik pbf bytes
> (PROBE-3, range-GET `Content-Range` totals) → projected tiles at the Spain calibration
> **0.8–1.9× pbf** ("est." = mirror 502-throttled mid-probe before this row was reached —
> UNMEASURED, prior-magnitude estimate, re-probe at bake time; building counts are stated ONLY
> where a document records one — a blank is UNKNOWN, measured by `osmium tags-count` on the
> clip at bake time, never guessed).

| CC | FOOTPRINTS (bake source · national override channel) | HEIGHTS (channel · CLASS · owed) | TERRAIN (datum-lift row) | SIZE (pbf → tiles · buildings) | VERDICT |
|----|---|---|---|---|---|
| **EE** | OSM `estonia-latest` · override: ETAK + `etak_ehr_hooned` state-conflated (E5-A P2 EE) | **Eesti 3D national LoD2, pre-linked to EHR ids** (E5-A P2 EE; E5 §C) · **L2** · owed: an EE CityGML stamp mirroring `lod2nrw` + EHR floors (daily CSV) as FL fallback | Mapterhorn · **NEW row** (EGM2008 @ Tallinn — compute when wired) | **122,684,556 B meas.** → ~0.1–0.25 GB · **856,360 LoD2 + 917,882 LoD1** (E5-A P2 EE) | **NATIONAL-NOW** (L2 stamp = build) |
| **LT** | OSM `lithuania-latest` · override: GRPK topo footprints open, but LT is one of E5's five conflation-primary countries (E5-A P2 LT; E5 §A.6) | per-object floors = **PRICED** RC product (E5-A P2 LT) → refused (X3 doctrine, E5 §G.3) · LiDAR agreement-gated · **NONE** (P1 mass) | Mapterhorn · **NEW row** (Vilnius) | est. ~0.35 GB → ~0.3–0.7 GB | **NATIONAL-NOW (mass-only)** — no open height channel; row bakes honest OSM defaults |
| **LV** | OSM `latvia-latest` · override: VZD cadastre weekly open SHP incl. building footprints (L5 LV) | building attrs **UNVERIFIED** (L5 LV: "floors/height attribute presence unconfirmed") · LGIA LiDAR **reported, NOT verified** · **NONE today — UNKNOWN stays UNKNOWN** (control 9) | Mapterhorn · **NEW row** (Riga) | est. ~0.25 GB → ~0.2–0.5 GB | **NATIONAL-NOW (mass-only)**; height upgrade pending one attr/LiDAR probe |
| **PL** | OSM `poland-latest` · override: BDOT10k `OT_BUBD_A` national GeoParquet, plain-URL, probed 200 / 78.6 MB (E5-A P2 PL; registry `pl-bdot10k-buildings-geoparquet`) | BDOT10k storey attribute · **FL (derived)** — ⚠ fill UNMEASURED, "one DuckDB query over the probed parquet" owed (E5-A §3.4) · LoD2-2017/LoD1×4 exist but bulk is **UI-mediated** (E5-3) — not a bake channel yet | Mapterhorn · **NEW row** (Warsaw) | **2,091,071,028 B meas.** → ~1.7–4 GB | **NATIONAL-DERIVED-HEIGHTS** (after the one parquet fill read; until then mass-only) |
| **LU** | OSM `luxembourg-latest` · override: ACT PCN cadastral footprints CC0 (L5 LU) | national LiDAR 2019 **reported, NOT verified** (L5 LU) · **NONE today** | Mapterhorn · **NEW row** (Luxembourg City) | **47,420,269 B meas.** (smallest in scope) → ~0.04–0.09 GB | **NATIONAL-NOW (mass-only)** — the cheapest whole-country row in Europe |
| **SE** ⚠ | OSM `sweden-latest` · override: Lantmäteriet Byggnad footprints (no height attr; L5 SE, internal 2026-07-25) | ⭐ **PROBED THIS LANE**: the NGP parcels/plans gate does **NOT** extend to the height channel's metadata — `api.lantmateriet.se/stac-hojd/v1` national 1 m markhöjdmodell STAC answers **HTTP 200 KEYLESS** with per-tile COG hrefs — but the **asset itself is 401-gated** (`dl1.lantmateriet.se/...tif` → HTTP 401, PROBE-4/5/6). So the gate is a **free-registration credential on downloads** (DK-DATAFORDELER shape), NOT the plans' org-onboarding gate; DSM/laser channel unprobed; nDSM = build (shares the DK module, hs:`lidar_se`) · **MR (gated-key)** | Mapterhorn · `terrain: se` geoidSepM **26.0** (row exists, verdict `token`) | **815,316,441 B meas.** → ~0.65–1.5 GB | **NATIONAL-NOW (mass-only)**; measured heights = LANTMATERIET key + nDSM stamp build — do NOT inherit the NGP plan gate onto context |
| **FI** | OSM `finland-latest` · override: NLS INSPIRE BU footprints, fully ANONYMOUS (L5 FI, internal 2026-07-25) | **FI Buildings 3D** national LoD2 CityGML CC BY 4.0 — ⚠ coverage PARTIAL, product page 2022-01-27, **current coverage NOT CONFIRMED — read the status map first** (E5-A §4/E5 §C) · else keyed KM2 DTM+DSM nDSM derive (`MML_API_KEY`, terrain: fi `token`) · **L2 (partial) / MR (keyed)** | Mapterhorn · `terrain: fi` geoidSepM **19.0** | **741,334,668 B meas.** → ~0.6–1.4 GB | **NATIONAL-NOW (mass-only)**; L2 upgrade gated on the status-map read; hs:REGION_SOURCE helsinki row already names it "candidate to add" |
| **NO** | OSM/Overture `norway-latest` — **FKB footprints REFUSED by standing doctrine, RE-CONFIRMED 2026-09-01** (E5-A §10; E5 §G.3 X3) | NDH nDSM keyless (hs:`ndh_no`, documented) · **MR** · owed: the nDSM stamp build (shares module) — FKB surveyed height stays refused | Mapterhorn · `terrain: no` geoidSepM **41.0** (keyless) | **1,373,864,352 B meas.** → ~1.1–2.6 GB | **NATIONAL-NOW (mass-only until NDH stamp)** |
| **DE** | OSM `germany-latest` · override: ALKIS GebaeudeBauwerk keyless per-Land ×16 (E5-1 — ⚠ `anzahlgs` floors slot EMPTY 0/500: never claim ALKIS floors) | **LoD2 CityGML FREE ×15 Länder** (Saarland gap; national BKG aggregate CLOSED — E5-A P2 DE) · **L2** · the `lod2nrw` stamp is LIVE for Köln (bake §LOD2-NRW-OSM-JOIN); owed: the per-Land endpoint router — stage NRW-first, Bavaria gated (hs:REGION_SOURCE munich `blocked`) | Mapterhorn · `terrain: de` geoidSepM **45.5** (NRW; Berlin/Munich per-Land constants owed — terrain BLOCKED rows name them) | **4,829,692,709 B meas.** → **~3.9–9.2 GB — Germany alone ≈ the whole R2 free tier** | **NATIONAL-NOW** (heights staged per-Land, NRW immediate; SIZE forces the §5 budget decision first) |
| **FR** | OSM `france-latest` · override: Etalab cadastre `batiments` per-commune bulk, probed 200 (E5-5) + BD TOPO `batiment` | **MNH LiDAR HD pre-computed nDSM** (E5 §A.7 — ⛔ do NOT build differencing, G.1 A8) + BD TOPO `hauteur` (hs:`bdtopo` live, city-scale today) · **MR** · owed: a national stamp (MNH raster sample mirroring `mds`, or BD TOPO WFS join) + stamp-bbox city list | Mapterhorn · `terrain: fr` geoidSepM **45.0** (keyless) | **5,071,446,543 B meas.** (largest in scope) → ~4.1–9.6 GB | **NATIONAL-NOW** (mass-only until the stamp; same §5 budget note as DE) |
| **IT** | OSM `italy-latest` — no open machine building channel exists; Overture/EUBUCCO-mirror is the PRIMARY plan for authoritative work (E5-2/E5-8; E5 §A.6) — for context the OSM clip suffices | **NONE national** (Piedmont-only regional layer, hs:`piedmont_it`; GBA/EUBUCCO ML heights excluded from authoritative use per the binding verdicts) | Mapterhorn · `terrain: it` geoidSepM **48.0** (keyless TINITALY row) | **2,224,590,284 B meas.** → ~1.8–4.2 GB | **NATIONAL-NOW (mass-only)** — replaces the rome+milan city rows (dedup per the Copenhagen precedent, bake:130) |
| **GB** ⚠ | OSM `great-britain-latest` (ODbL) · ⭐ **licence VERIFIED THIS LANE**: the keyless OS Downloads catalogue (`api.os.uk/downloads/v1/products`, HTTP 200, 26 products — PROBE-7) contains **NO building-height product and no detailed-footprint product** (only generalised OpenMapLocal/Zoomstack/VectorMapDistrict/BuiltUpAreas); OS MasterMap Building Height Attribute is absent from the open list = premium → **X3-refused** (E5 §G.3) | EA LiDAR Composite DTM/DSM 1 m, OGL v3, keyless (terrain: gb probe) → nDSM derive build, **England-only** (Scotland/Wales/NI separate portals — L5 UK) · **MR (England) / NONE (rest)** | Mapterhorn · `terrain: gb` geoidSepM **46.0** | est. ~1.9 GB → ~1.5–3.6 GB | **NATIONAL-NOW (mass-only)**; England-only MR upgrade; national verdict rests on OSM/ODbL, NOT on OS data — verified, not assumed |
| **IE** | OSM `ireland-and-northern-ireland-latest` — no cadastre by design; OSi Prime2 commercial = X3-refused (L5 IE) | none — national LiDAR PARTIAL (OPW; L5 IE) · **NONE** | Mapterhorn · **NEW row** (Dublin) | est. ~0.35 GB → ~0.3–0.7 GB | **NATIONAL-NOW (mass-only, honest-low OSM density)** |
| **CH** | OSM `switzerland-latest` · override: AV cadastral footprints + **GWR whole-country register, keyless, DAILY (946,164,577 B — E5-6)** | ⭐ **the stamp already EXISTS**: `stampSwissHeightsOnGeojsonseq` (hs:1977, STAC swissSURFACE3D−swissALTI3D nDSM, keyless CC-BY) is authored but **NOT imported by bake.mjs** (verified: the import at bake:32 carries only mds/dhm/lod2nrw) · **MR** · owed: wire the import + region row + city stamp list + the LV95 reproject leg (reproject.mjs now exists in-tree) — **the cheapest measured-height national add in Europe** · GWR floors = RA fallback | Mapterhorn · `terrain: ch` geoidSepM **49.5** (keyless) | est. ~0.45 GB → ~0.4–0.9 GB | **NATIONAL-NOW** (wire-not-build) — replaces zurich/geneva/bern city rows (dedup) |
| **AT** | OSM `austria-latest` · override: BEV DKM biannual CC BY 4.0 snapshots incl. building polygons (L5 AT) | geoland.at nationwide 1 m DTM+DSM open CC BY 4.0 → nDSM derive build (L5 AT) · GWR register **access-gated** (L5 AT) · **MR (build)** | Mapterhorn · **NEW row** (Vienna) | est. ~0.75 GB → ~0.6–1.4 GB | **NATIONAL-NOW (mass-only until nDSM stamp)** |
| **CZ** | OSM `czech-republic-latest` · override: ČÚZK INSPIRE BU WFS keyless live (E5-10: `bu:Building`+`bu:BuildingPart`, currentUse populated, `heightAboveGround` NIL) | RUIAN `pocet podlazi` floors — **DOC-level, one VFR parse owed** (E5-10; L5 CZ) · DMR5G/DMP1G "reported open — NOT verified" (L5 CZ) · **FL (derived, after the parse)** | Mapterhorn · **NEW row** (Prague) | est. ~0.95 GB → ~0.8–1.8 GB | **NATIONAL-DERIVED-HEIGHTS** (pending the VFR parse; until then mass-only) |
| **PT** (beyond Lisbon/Porto) | OSM `portugal-latest` — the pbf is ALREADY downloaded by the lisbon/porto rows; a national row reuses it · no national footprint channel (E5-A P2 PT: urban cadastre measured EMPTY; OSM/Overture primary per E5 §A.6) | DGT LiDAR 2024–25 10 pts/m² → derive — **endpoint URL still uncaptured** (hs:`dgt_pt` documented; E5-A P2 PT) · **NONE today / MR when captured** | ⭐ Mapterhorn **UNBLOCKS PT visual terrain** — terrain.mjs lists lisbon/porto BLOCKED "no open national bare-earth DTM" (PROBE-8), and E3A's switch removes exactly that dependency; `terrain: pt` geoidSepM **53.0** already recorded for the lift | est. ~0.35 GB → ~0.3–0.7 GB | **NATIONAL-NOW (mass-only)** — replaces lisbon+porto rows (dedup); first country where Mapterhorn flips a terrain BLOCKED to bakeable |
| **BE** (beyond Brussels) | OSM `belgium-latest` — pbf already downloaded by the brussels row · override: GRB GBG keyless OGC API feature-probed + federal annual snapshot (L5 BE) | regional trisection: **Wallonia MNH pre-computed** (E5 §A.7 — do not re-difference) · Flanders 3D GRB LoD1 · Brussels UrbIS 3D CC0 (L5 BE) · **MR/L2 (regional, 3 stamps)** · mass-only initially | ⭐ Mapterhorn **UNBLOCKS Brussels terrain** (terrain.mjs BLOCKED row: "Brussels-Capital DTM route/licence unsourced" — PROBE-8); `terrain: be` geoidSepM **45.0** recorded | est. ~0.6 GB → ~0.5–1.1 GB | **NATIONAL-NOW (mass-only)** — replaces brussels city row (dedup) |
| **HR** | OSM `croatia-latest` · override: DGU DKP incl. cadastral buildings, WFS + INSPIRE ATOM free bulk since 2023 (L5 HR — licence id unconfirmed) | none confirmed — "no national open height product; LiDAR partial" (L5 HR) · **NONE** | Mapterhorn · **NEW row** (Zagreb) | est. ~0.33 GB → ~0.3–0.6 GB | **NATIONAL-NOW (mass-only)** |
| **SI** | OSM `slovenia-latest` · override: GURS KN `STAVBE`/`STAVBE_OBRIS` keyless WFS, CC BY 4.0 (E5-7, live-probed) | ⭐ **register attribute WITH REAL METRES** — `STAVBE` carries lowest/highest elevation + characteristic height; `ETAZE` carries per-floor `VISINA_ETAZE`/`NADMORSKA_VISINA` (E5-7; E5 §A.2: richer than Spain on the vertical axis) · **RA** · owed: a WFS-join stamp + ⚠ fill probe first (GEOM present 1 of 2 sampled — E5 §C) | Mapterhorn · **NEW row** (Ljubljana) | est. ~0.28 GB → ~0.25–0.55 GB | **NATIONAL-NOW** (RA stamp = build; fill probe owed before the row declares a join) |
| **GR** | OSM `greece-latest` — no national footprint+height product confirmed (L5 GR); cadastre incompleteness is irrelevant to context | none (L5 GR) · **NONE** | Mapterhorn · **NEW row** (Athens) | est. ~0.9 GB → ~0.7–1.7 GB | **NATIONAL-NOW (mass-only)** |
| **HU** | OSM `hungary-latest` — Lechner cadastral geometry is PAID (L5 HU) → X3-refused; context rides OSM | none open (L5 HU) · **NONE** | Mapterhorn · **NEW row** (Budapest) | est. ~0.4 GB → ~0.3–0.8 GB | **NATIONAL-NOW (mass-only)** — the fee gate binds the cadastre, NOT OSM context |
| **RO** | OSM `romania-latest` · override: ANCPI `Constructii` REST (GeoJSON) — ⚠ registration INCOMPLETE nationally, "queryable ≠ complete" (L5 RO) | none open (L5 RO) · **NONE** | Mapterhorn · **NEW row** (Bucharest) | est. ~0.75 GB → ~0.6–1.4 GB | **NATIONAL-NOW (mass-only)** |
| **SK** | OSM `slovakia-latest` · override: ZBGIS buildings layer (L5 SK) | DMR 5.0 LiDAR "reported open — NOT verified this pass" (L5 SK) · **NONE today** | Mapterhorn · **NEW row** (Bratislava) | est. ~0.45 GB → ~0.4–0.9 GB | **NATIONAL-NOW (mass-only)** |
| **BG** | OSM `bulgaria-latest` — KAIS cadastre viewing free, bulk PAID/no open bulk (L5 BG) → context rides OSM | none open (L5 BG) · **NONE** | Mapterhorn · **NEW row** (Sofia) | est. ~0.35 GB → ~0.3–0.7 GB | **NATIONAL-NOW (mass-only)** |

**Verdict census: 25 countries in scope → 21 NATIONAL-NOW (of which ~11 mass-only today) ·
2 NATIONAL-DERIVED-HEIGHTS (PL, CZ — each gated on ONE owed fill/parse probe) · 0 CITY-FALLBACK ·
0 BLOCKED.** The founder's "everywhere possible" is satisfiable for footprints+terrain in every
scope country; heights are the staged axis, and every derived/mass-only row SAYS SO in its own
config per the honesty rules.

---

## 3 · SE and GB — the two special-honesty rows, resolved by probe (not inheritance)

- **SE**: the NGP gate the sweeps recorded is on PARCELS/PLANS (L5 SE: Basic Auth/OAuth2,
  org onboarding). This lane probed the BUILDING/HEIGHT channel separately (PROBE-4/5/6):
  the national 1 m höjdmodell **STAC catalogue is keyless-open** (HTTP 200, per-tile COG asset
  hrefs, `file:size` present) while the **asset host requires auth** (HTTP 401 on a range-GET
  of a real tile). Verdict: the context height channel carries its OWN, milder gate — a free
  Lantmäteriet credential on downloads, the exact DK `DATAFORDELER_API_KEY` shape — and the NGP
  plan gate must NOT be copied onto the context row. Also probed as controls: the old
  `distribution/produkter/hojdgrid/v1` route 404s (matches terrain.mjs's 2026-07-25 probe) and
  `distribution/produkter/byggnad/v2` returns 503 "API blocked temporarily" — the gate
  phenomenology is real, not a stale doc claim.
- **GB**: the constraint is OS licensing, and it was VERIFIED not assumed (PROBE-7): the OS
  OpenData Downloads catalogue answers keyless and lists **26 open products, none of them a
  building-height product and none a detailed footprint product**. Therefore the GB national
  verdict rests entirely on OSM (ODbL) + EA LiDAR (OGL v3, England) and is UNAFFECTED by OS
  premium licensing; licensing OS data stays refused per X3 (E5 §G.3). Scotland/Wales/NI height
  portals remain separate rows (L5 UK) — the GB national row is honest about heights being
  England-only when the EA stamp lands.

---

## 4 · The datum-lift ledger (the one terrain thing that stays national)

Rows that EXIST in `terrain.mjs TERRAIN_SOURCES` (geoidSepM, per-country): ES 51.0 (⚠ the
BCN ~49 per-city debt is E3A §6's known row-rot, carried) · DK 36.5 · NL 43.0 · DE 45.5
(NRW — Berlin/Munich per-Land constants owed) · FR 45.0 · IT 48.0 · GB 46.0 · SE 26.0 ·
FI 19.0 · NO 41.0 · CH 49.5 · PT 53.0 · BE 45.0. **13 of 25 scope countries covered.**
**NEW rows owed (15): EE, LT, LV, PL, LU, AT, CZ, IE, HR, SI, GR, HU, RO, SK, BG** — one
EGM2008 orthometric→ellipsoidal constant at the principal city each (the same one-constant
shape every existing row uses; values NOT guessed here — computed when the row is wired,
control 9). L-584 façade-rasant legal sampling stays on national DTMs and is out of context
scope (E3A §5.2 — Mapterhorn is measured-ineligible for the legal path: no per-tile datum
declaration, no nodata channel).

---

## 5 · SIZE — the budget stated up front, not discovered at publish

- **Measured pbf bytes this session (11 of 27 probed before the mirror throttled):**
  FR 5,071,446,543 · DE 4,829,692,709 · IT 2,224,590,284 · PL 2,091,071,028 ·
  NL 1,399,761,428 · NO 1,373,864,352 · SE 815,316,441 · FI 741,334,668 · DK 493,585,028 ·
  EE 122,684,556 · LU 47,420,269. ES rides the bake.mjs-documented ~1.3 GB. The remaining 15
  are flagged est. in the table (⚠ the Geofabrik proxy began returning 502/timeouts to this
  client mid-probe — ledger §8; the negative control could therefore not complete either:
  treat every est. cell as UNMEASURED, re-probe at bake time).
- **Projected total**: ~30 GB pbf for the 25-country scope → **~24–57 GB of PMTiles** at the
  Spain calibration (1.3 GB pbf → 1–2.5 GB tiles, bake §L-607) — and that calibration was
  4 layers; the pipeline now bakes 7, so lean toward the upper half.
- **The practical weight budget is the R2 free tier: 10 GB** (stated in bake §L-607's own
  words — "comfortably under R2's 10 GB free storage"). The scope exceeds it **2.4–5.7×**.
  Options, for the founder/Regions lane to pick BEFORE any publish: (a) paid R2 —
  $0.015/GB-month ⇒ ~$0.36–0.86/month for the full scope, cash-trivial, but a deliberate
  decision, not a default; (b) trim maxzoom/layers for mass-only countries; (c) stage countries.
- **The CI cliff is real and bake.mjs names its own fix**: "ONE country fits a single CI run
  (the cost cliff was whole-CONTINENT, not one country)" and "if this list grows past a handful
  of large countries, switch the workflow to bake per-region and `aws s3 sync` incrementally"
  (bake:56–57). A 25-country set REQUIRES that switch — an operational workflow change already
  designed in-comment, NOT a pipeline redesign. Until it lands, ⛔ the §BAKE-BY-REGION
  replacement warning binds: a subset bake published via full sync DELETES every other region
  from the map.
- **Heap**: every whole-country heightJoin needs its stamp-bbox list + `NODE_OPTIONS=
  --max-old-space-size=12288` (both preflight-enforced — proven RC=5 → RC=0 this session).

---

## 6 · Projected cost per verdict class (units the repo already uses)

| Work item | Cost shape | Applies to |
|---|---|---|
| Region row (bake.mjs config) | ~minutes + first-bake sanity check | all 25 (PT/BE/IT/CH replace existing city rows — dedup per the Copenhagen precedent) |
| Datum-lift TERRAIN_SOURCES row | ~1 h each (EGM2008 lookup + row) | 15 countries (§4) |
| Wire an EXISTING stamp | ~0.5 day | **CH** (import + region row + city list + LV95 leg) |
| New stamp function (mirrors mds/dhm/lod2nrw, incl. probe tests) | ~1–3 days each | EE (CityGML), FR (MNH raster), SE (nDSM, after key), NO (NDH), AT (geoland nDSM), GB (EA nDSM), SI (WFS RA join), DE (per-Land router over the live lod2nrw stamp), BE (3 regional) |
| Free credential + CI secret | ~1 h + ops | SE (Lantmäteriet), FI (MML_API_KEY), DK (exists: DATAFORDELER_API_KEY) |
| One owed probe before a join may be declared | ~0.5 day each | PL (parquet storey fill) · CZ (RUIAN VFR parse) · SI (ETAZE/STAVBE fill) · FI (Buildings-3D status map) · LV (attr schema) |
| Workflow switch: per-region bake + incremental sync | one CI workflow change (designed in bake:57) | prerequisite for >handful-of-countries publish |
| Storage | $0.015/GB-mo beyond 10 GB free | founder decision before publish |

---

## 7 · Falsification & executable proof (foreground, RC read immediately)

- **PROBE-1** `node bake.mjs --check` → **RC=5** on this box (heap 2,349 MB < the 6,000 MB
  national floor) — the §HEIGHT-STAMP-BUDGET preflight fired exactly as designed; re-run with
  `NODE_OPTIONS=--max-old-space-size=12288` → **RC=0**, "✔ every height join has a bounded
  working set and enough heap", 24 regions planned, toolchain honestly reported
  osmium/tippecanoe/duckdb/docker **all missing** (⇒ no local bake is possible here; this
  lane's proof is the plan/preflight layer, per the brief's never-publish rule).
- **PROBE-2 (fail-loud control)** `node bake.mjs --check --region atlantis` → **RC=2**,
  "unknown region(s) [atlantis]" + the known-region list — the silently-empty-tileset guard
  fires; a typo cannot bake nothing.
- **PROBE-3 (negative control, partial)** the SIZE probes used range-GETs whose 206
  `Content-Range` totals are the measurement; the planned bogus-URL 404 control could not
  complete because the mirror began 502-throttling this client first — the throttle itself
  demonstrates the 206s were real server responses, but every unmeasured cell stays flagged.
- **PROBE-4/5/6 (SE)** keyless 200 on `stac-hojd` collections AND items; **401** on the COG
  asset; 404 on the legacy route; 503 "API blocked" on `byggnad/v2` — both sides of the SE
  verdict observed, not inferred.
- **PROBE-7 (GB)** `api.os.uk/downloads/v1/products` → 200, 26 ids, zero height/building-height
  matches (`grep -i 'height|build'` over id+name → only `BuiltUpAreas` by id listing).
- **PROBE-8** `node terrain.mjs --regions` → RC=0, **590 rows, 583 bakeable / 7 BLOCKED**
  (lisbon, porto, brussels, berlin, munich, riyadh, jeddah) — the exact rows the Mapterhorn
  switch addresses for VISUAL terrain (SA excluded: geoidSepM null, lift impossible).
- **PROBE-9** `tiles.mapterhorn.com/tilejson.json` → 200, `encoding terrarium` — E3A's endpoint
  still live the day after its verdict.
- **Repo hygiene**: no repo file modified except THIS findings file (`git diff --stat
  tools/context-bake/` → empty, before and after); nothing committed; nothing published;
  root `npx tsc --noEmit -p tsconfig.json` → **RC=0** (control that the assessed tree compiles).

## 8 · Probe ledger (all 2026-09-01, this session, from this box)

| # | Target | Result |
|---|---|---|
| 1 | `bake.mjs --check` (default heap / 12,288 MB heap) | RC=5 / RC=0 |
| 2 | `bake.mjs --check --region atlantis` | RC=2 fail-loud |
| 3 | Geofabrik range-GETs ×27 attempted | 11 measured 206 totals (table); then proxy 502/timeout — remainder UNMEASURED |
| 4 | `api.lantmateriet.se/stac-hojd/v1/collections` | 200 keyless (national mhm collections) |
| 5 | `…/collections/mhm-65_3/items?limit=1` | 200 keyless; COG asset href + file:size |
| 6 | `dl1.lantmateriet.se/hojd/data/grid1m/…tif` range-GET | **401** (download gate) |
| 7 | `api.os.uk/downloads/v1/products` | 200 keyless; 26 products; no height product |
| 8 | `terrain.mjs --regions` | RC=0; 583 bakeable / 7 blocked |
| 9 | `tiles.mapterhorn.com/tilejson.json` | 200, terrarium |
| 10 | root `tsc --noEmit` | RC=0 |

## 9 · Honest gaps this lane leaves open

- 15 pbf sizes unmeasured (mirror throttle) — re-probe before scheduling CI bakes.
- Building counts: only EE carries a documented national count in scope docs; every other
  count cell is deliberately blank-UNKNOWN with the measurement command named.
- The est. tile-weight band (0.8–1.9× pbf) is calibrated on ONE country (spain) at FOUR layers;
  the first two national bakes should re-measure the ratio at seven layers before the budget
  decision is finalised.
- No local bake ran (toolchain absent — measured); the first CI `--region <country>` bake per
  new row is the real proof, behind the armed §MEASURED-HEIGHT-GATE.
- Overture flip for thin-OSM countries (GR/RO/BG/HU class): the Riyadh-style OSM-vs-Overture
  count probe per country is owed before flipping any `buildingsSource` — Europe default stays
  OSM per bake §BAKE-OVERTURE's own reasoning.
