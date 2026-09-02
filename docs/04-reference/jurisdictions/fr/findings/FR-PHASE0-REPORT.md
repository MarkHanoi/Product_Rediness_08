# FR Phase 0 — Measurement Report (STOP-AND-REPORT per FR-MODULE-BUILD-BRIEF §2)

> **Lane:** FR-PHASE0 (started 2026-09-02, killed by account switch) → FR-PHASE0-FINISH (completed 2026-09-02).
> **Mandate:** `FR-MODULE-BUILD-BRIEF.md` (96cadcc4) §2 — measure, then stop. No solver written; `countryAdapters/fr/` untouched.
> **Transcripts:** `fr-phase0-transcripts/` beside this file (raw query outputs `q1`–`q13`, contract-test JSON, DescribeFeatureType XML, MD5 lists).
> All HTTP traffic used User-Agent `PRYZM-Research/1.0 (+https://pryzm.app; contact pryzmhello@gmail.com)`.

---

## 0. VERDICT — the gate

**`NOMFIC` fill = 99.16% (1,329,159 of 1,340,419 production zones). HIGH → PROCEED AS SPECIFIED.**

Wherever a zone joins a `doc_urba` row by `IDURBA`, NOMFIC fill is **100.00%** (all of PLU / PLUi / PSMV). The residual 0.84% (11,260 zones) sits entirely inside the 145,689-zone old-standard subpopulation (empty `IDURBA`), which itself fills NOMFIC at 92.27%. The brief's `zone → NOMFIC → règlement file → chapter by LIBELLE` retrieval chain is structurally sound at national scale; no architecture revision is required. One refinement (not a revision): **16.1% of filled NOMFIC values carry a `#page=NN` anchor** (214,481 zones; 1,798 documents use them, 1,764 for every zone) — the retrieval layer must parse and honour the page anchor, which makes zone-chapter location *easier*, not harder.

---

## 1. Measurement frame — state it before any number

- **Corpus:** GPU national extract, vintage **2026-08-29T02:01–02:11Z** (`extraction.json`, all layers `SUCCESS`), served as per-layer GeoPackages via the ATOM manifest behind `https://www.geoportail-urbanisme.gouv.fr/api/extraction/download-latest`.
- **Discrepancy vs the brief:** `download-latest` does **not** return an archive. It 200-serves an **ATOM manifest** (`application/atom+xml`, 23,701 bytes, 32 entries) whose entries are per-layer GPKG download URLs on `data.geopf.fr` with sizes and MD5s. Total national extract ≈ **28.6 GB** across 31 layers.
- **What was downloaded (13.4 GB of the 28.6):** `zone_urba` (3.9 GB), `prescription_surf` (6.8 GB), `prescription_lin` (2.2 GB), `doc_urba` (5.5 MB), `doc_urba_com` (3.9 MB), `document` (65 MB), `municipality` (143 MB). Every file **MD5-verified bit-perfect** against the manifest (`actual-md5.txt` = `expected-md5.txt`). Free disk was 151 GB — the national extract fit; no fallback to per-département extracts was needed.
- **Local truth:** no PostGIS/docker/duckdb. GeoPackage **is** SQLite — all queries ran under Node 24 `node:sqlite` (`DatabaseSync`, readOnly), geometry parsed by a hand WKB reader where needed. The brief's "load into PostGIS" was substituted honestly; only *spatial-join* metrics are affected (marked DEFERRED below).
- All zone/doc rows in the extract have `gpu_status = 'production'` — no draft contamination.
- "filled" everywhere below means non-NULL **and** non-empty after TRIM.

---

## 2. The §2 metrics table

| Metric | Result | Frame / notes |
|---|---|---|
| **NOMFIC fill (THE GATE)** | **99.16%** overall (1,329,159 / 1,340,419). By joined TYPEDOC: PLU 100.00% (545,949 z), PLUI 100.00% (541,589 z), PLUi 100.00% (5,058 z), PSMV 100.00% (261 z), no-doc-row 95.45% (247,562 z). By standard shape: idurba-filled (v2017+-shaped) **100.00%** (1,194,730 z); empty-idurba (v2013-shaped) **92.27%** (145,689 z) | `zone_urba` × `doc_urba` LEFT JOIN on `idurba`. `TYPEDOC` case-varies (`PLUI`/`PLUi`). 100% of filled NOMFIC are `.pdf`-ish; 16.1% carry `#page=` anchors |
| URLFIC fill | **18.27%** (244,891 zones) | zone_urba |
| URLFIC sampled HTTP rate | 500 sampled (zone-weighted from the 244,891): **67 not URLs at all** (relative paths, some with `\` separators); of 433 testable: **200/206 = 66.5%** (288), 404 = 25.4%, TLS/DNS/timeout errors ≈ 6%, 403/400/503 ≈ 2%. **Of all 500: 57.6%** | Range-GET probes; re-probe of 30 gave 30/30 agreement. Net: direct-URL fetch works for ≈ 10.5% of all zones — NOMFIC (+ ATOM/download-by-partition) is the retrieval key, URLFIC is a bonus |
| Zone-scoped vs shared règlement | Per non-empty IDURBA (8,269 docs, 1,194,730 zones): **one distinct NOMFIC for all zones = 6,377 docs (77.1%)**; partial (1 < n < zones) = 1,891 (22.9%); fully per-zone = 1; single-zone docs = 64. Mean distinct-NOMFIC/zones = **0.067**; mean distinct-URLFIC/zones = **0.011**; 7,064 docs have zero URLFIC | Shared-file-with-`#page`-anchor is the dominant zone-scoping mechanism (1,798 docs) |
| DESTOUI / DESTCDT / DESTNON fill | **0.84% / 1.18% / 1.23%** | Near-empty nationally. Old-standard `DESTDOMI` fills 10.87% (exactly the no-idurba subpop). Machine-readable use-programming is NOT in the zone table — it lives in the règlement text |
| FORMDOMI fill + distribution | **4.61%** (61,787). Top codes verbatim (no interpretation, §10.1): `0800`×20,319 · `0700`×10,947 · `0100`×7,096 · `0200`×2,529 · `0500`×2,504 · `0300`×1,975 · `0108`×1,540 · `0107`×1,403 … 47 distinct codes, full list in `q2-output.txt` | Too sparse to build on regardless of semantics |
| Drawn setbacks (TYPEPSC=15, surf) | **51,407** total — 15/00×15,922 · 15/01×18,952 · 15/02×9,293 · 15/03×665 · 15/98×2,409 · **undocumented subtypes: 15/50×3,442 · 15/51×93 · 15/⟨empty⟩×631**. Distinct partitions 1,728; distinct idurba **1,645** | Zones *intersecting*: **DEFERRED-NEEDS-SPATIAL-DB** (proxy = the 1,645 documents). `prescription_lin` adds 69,739 more TYPEPSC=15 (1,942 partitions) |
| Plan-masse (TYPEPSC=14) | **5,291** surf polygons, **88 partitions** (76 commune-shaped `DU_<insee>`, 12 EPCI-shaped `DU_<siren>`), total area **24.6 km² = 2,462 ha** (spherical approx, outer-minus-holes, 0 parse failures) + 43 lin rows / 8 partitions | Rare and concentrated — F-A path is a niche, as the brief expected |
| Volume bonuses | TYPEPSC=30: **3,051** (30/00×82, /01×2,304, /02×519, /03×141, /04×5). TYPEPSC=29 (densité min): **717** surf (29/00×508, /01×203, /02×5, /⟨empty⟩×1) + 318 lin (29/00) | surf unless noted |
| Provenance fill (doc_urba, 23,885 rows) | `ETAT` **100.00%** (03×16,486 · 05×4,386 · 07×2,639 · others <300) · `DATAPPRO` **99.68%** · `DATEFIN` 22.21% · `NOMREG` 73.72% · `URLREG` 32.15% | §5's "DATAPPRO/DATEFIN/ETAT satisfy provenance directly" holds. NB `doc_urba` has 23,885 rows but only **14,109 distinct IDURBA** — procedure/partition duplication; dedupe before joining |
| Standard-version distribution | **No clean field exists — confirmed.** `DATEREF`/`TYPEREF` turned out to be the *cadastral referential* vintage (TYPEREF 01/02 ≈ PCI), NOT the CNIG standard. Best available signal: **idurba-filled (v2017+-shaped) = 89.13% of zones; insee-only/destdomi-shaped (v2013-era) = 10.87% (145,689 zones)**. Of those old-shaped zones, via `insee→doc_urba_com`: 131,114 z under OTHER-shaped (dateless old) ids, 7,884 under PLU, 6,618 z (108 communes) with **no doc_urba_com row at all** (nomfic 75.8% there) | Obsolete-standard documents are ~11% of zones and are precisely where the residual NOMFIC gap lives |
| ATOM document inventory | **14,701 entries** (736 pages × 20, last page 1; 0 failed pages). Families: **DU 12,792** (PLU 9,462 · CC 2,720 · PLUi 565 · PSMV 43 · POS 2) · **SUP ~1,585** (36 catégories, top: PM1×363, PT1/PT2×118 ea, AC4×113, AC1×103, I1×101) · SCOT 252 · unparsed 70 | Feed = *download-feed* pagination `f[pagination][page]=N` (curl needs `-g`) |
| PLUi leverage | **556 PLUi docs cover 13,193 communes** (min 1 / p50 19 / p90 47 / max 95 communes each) and **45.5% of national population** (31.36 M of 68.95 M). Deduped one-doc-per-commune (PSMV excluded): **25% of national pop = 30 documents; 50% = 283; 75% = 1,817** (12,601 docs cover 91.3%) | Population = live geo.api.gouv.fr (34,969 communes, Σ 68,952,941 — inherited file verified identical to live). Join = `doc_urba_com(insee↔idurba)` × population; commune-count half NOT deferred — delivered |
| RNU census (bonus, §3.3 cross-check) | `municipality` layer (extract): 35,011 non-deleted communes, **is_rnu = 6,646 (19.0%)**, population-weighted **2.77%** (1.91 M) | **Discrepancy vs the brief's published 9,461/35,010 (23.77% of surface):** the GPU flag in this extract reads materially lower. Frames differ (current GPU flag vs older SuDocUH publication; count vs surface). Per the brief's own instruction, re-derive from SuDocUH before quoting either |

## 3. Contract tests (T1) — all four §4.1 assertions PASS (re-run fresh 2026-09-02)

| # | Assertion | Result |
|---|---|---|
| A1 | `/municipality?insee=25349` → `name==='LORAY'` | **PASS** (200; also `is_rnu:false`) |
| A2 | `/municipality?geom=Point(1.654399,48.112235)` → `is_rnu===false` | **PASS** (200; commune = GUILLONVILLE) |
| A3 | `/document?geom=same` → `du_type==='PLUi'`, `partition==='DU_200070159'` | **PASS** (200, 1 feature) |
| A4 | `/zone-urba?geom=same` → MultiPolygon, `libelle==='A'` | **PASS** (200, 1 feature) |

**DescribeFeatureType diff vs §5 vendored model (`wfs_du:zone_urba`):** every §5 field present (`the_geom` for WKT). Live adds exactly the GPU bookkeeping the docs promised ("très proche" + partition): `gid, insee, idzone, lib_idzone, symbole, datappro, destdomi, partition, gpu_doc_id, gpu_status, gpu_timestamp`. Local GPKG columns = live WFS + `fid_extract`. `wfs_du:prescription_surf` likewise (adds `idpsc, lib_idpsc, txt, nature, stypepsc` bookkeeping/subtype columns). No missing §5 field anywhere.

## 4. Discrepancies & findings the brief should absorb

1. **`download-latest` is a manifest, not a download** — an ATOM feed of per-layer GPKG URLs + MD5s. Ingest tooling should read it as such (it also hands you integrity checking for free).
2. **DEST\* triple is empty in practice** (≤1.23%): permitted-uses cannot be read from `zone_urba` columns; step 4's "permitted uses" slice must come from règlement text or be typed `unresolved`.
3. **URLFIC is not a retrieval path** (18.27% fill × 57.6% fetchable ≈ 10.5% of zones; 13.4% of sampled values aren't URLs at all, some are Windows-relative paths). NOMFIC + `download-by-partition`/ATOM is the path.
4. **`#page=` anchors** (16.1% of filled NOMFIC, and 39,399 URLFIC values) are the de-facto zone-scoping mechanism — parse them.
5. **Undocumented TYPEPSC=15 subtypes 50/51** (3,535 surf + 1,827 lin rows) and 631+2,257 empty-subtype rows — not in the brief's 00/01/02/03/98 list; classify before the drawn-setback ingest.
6. **`doc_urba` IDURBA is not unique** (23,885 rows / 14,109 distinct) — dedupe by procedure before any join; naive joins silently multiply zones.
7. **TYPEDOC case-splits** (`PLUI` 612 + `PLUi` 3) — normalise case.
8. **RNU count discrepancy** (GPU flag 6,646 vs published 9,461) — see table; resolve via SuDocUH before the refusal path quotes a figure.
9. **POS documents are still in the live DB** (2,315 doc_urba rows; 2 in ATOM) — the §3.2 "treat as dead, fall through" rule will actually be exercised.
10. `prescription_surf` live WFS total (4,276,518, predecessor's probe) vs extract (4,274,439): ~0.05% drift between weekly vintage and live — expected; all TYPEPSC counts of interest matched exactly.

## 5. Deferred (named, per mandate)

- **Zones intersecting TYPEPSC=15 geometry** — needs a spatial join over 121k prescriptions × 1.34M zones: **DEFERRED-NEEDS-SPATIAL-DB** (document-level proxy delivered: 1,645 idurba / 1,728 partitions surf).
- Plan-masse commune enumeration for the 12 EPCI-shaped partitions (spatial or doc_urba_com expansion) — trivial once a spatial store exists.

## 6. Inheritance audit (predecessor lane FR-PHASE0, killed mid-run)

| Piece | Verdict |
|---|---|
| 7 GeoPackage downloads (13.4 GB) | **VERIFIED** — MD5 bit-perfect vs ATOM manifest, all seven |
| `ct1-*`, `ct-point-*` contract-test captures | **VERIFIED** — all four assertions re-run fresh, PASS |
| `dft-zone-urba.xml`, `dft-prescription-surf.xml` | **VERIFIED** — byte-identical field sets vs fresh DescribeFeatureType |
| `extract-download-latest.atom.xml`, `extract-manifest-parsed.json`, `layer-urls.txt`, headers | **VERIFIED** — sizes+MD5s confirmed against live files |
| `wfs-hits-prescription-surf.txt` | **VERIFIED** — every TYPEPSC count (51,407/5,291/717/3,051) reproduced in the extract; totals differ 0.05% (live-vs-vintage frame, stated) |
| `urlfic-sample-results.json` | **VERIFIED** — counts recomputed from the artifact; 30-URL re-probe: 30/30 agreement |
| `atom-inventory.json` (14,701 docs) | **VERIFIED** — page bounds re-checked live (p0=20, p735=1, p736=0) |
| `communes-population.json` | **VERIFIED** — identical to live geo.api.gouv.fr (34,969 communes, Σ 68,952,941) |
| Scripts `q1`–`q9` | Re-executed fresh (their prior outputs died with the transcript); `q2`'s tail loss patched via `q10-extra.mjs` |
| `gpkgwkb.py` | DISCARDED — superseded by q6's JS WKB parser; never load-bearing |
| Prior `FR-PHASE0-REPORT.md` | ABSENT — never written; this document is the first |
