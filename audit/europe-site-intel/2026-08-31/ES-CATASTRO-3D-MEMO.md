# SPAIN CATASTRO 3D — DECISION MEMO

> **Brief:** `ES-CATASTRO-3D-BRIEF.md` (ten questions · A/B/C/D classification · A–H output). ·
> **Date:** 2026-09-01. · **Status:** investigation COMPLETE; nothing built (brief: *"Do not build
> until this investigation is complete"*).
>
> **Evidence base — four lanes, all in `impl/`, cited by section throughout and never re-derived here:**
> `es-catastro-3d-investigation.md` **§P1–P6** (predecessor: INSPIRE WFS probed · `Licencia.pdf`
> read · BU-WFS spec read · the DGC's own *Catastro 3D en Internet* paper read · SEC guide +
> `licdescargaES.pdf` read · ATOM bulk probed) · **§L2** (what the model encodes, measured at
> municipality scale) · `es-catastro-3d-l1-fxcc-kml-channels.md` **§L1** (85 live requests,
> 14:27–14:53 UTC — the floor channels) · `es-catastro-3d-L3-comparison-planning.md` **§L3**
> (comparison · planning content · combine-with). Plus, used not re-derived:
> `e5-asis-national-sweep.md` §E5-7 (Slovenia), `e5-oss-delta.md` §P-8 (EUBUCCO v0.2),
> `lane-fed-buildings-federation.md` (the federation scaffold, being built concurrently),
> `impl/e3b-state-heights-verdict.md` (MDSnE).
>
> **Classification, per the brief, on every row:** **A** authoritative machine-readable ·
> **B** downloadable but access-constrained · **C** visual-only viewer · **D** derived geometry
> Pryzm could calculate. Confidence tiers are the FROZEN model's
> (`packages/schemas/src/siteintel/confidence.ts`): 1 `authoritative-machine-readable` ·
> 3 `deterministic-inference` · 6 `uncertain-missing`.
>
> **Where the lanes disagreed I took the stronger evidence and say so at the point of conflict**
> (live probe > document > inference). Four such resolutions are marked ⚖.

---

## THE ONE-LINE ANSWER

**Catastro is the best national AS-IS *semantic* source in Europe and one of only two European
floor-level *geometry* sources — and it contains no metric height and no planning rule at all.**
Footprint-per-floor **YES**; metric heights **NO**; buildable envelope **NOTHING**.
Spain's cadastre encodes **storeys, not heights** (§L2-1, four independent sources, two measured).

---

## A · WHAT CATASTRO ACTUALLY GIVES PRYZM

### A.1 The channel map, classified

| # | Channel | Access (measured) | Bulk? | Class | What it carries |
|---|---|---|---|---|---|
| 1 | **INSPIRE Buildings — ATOM bulk** `…/INSPIRE/buildings/ES.SDGC.BU.atom.xml` → per-municipality ZIP | **keyless** (§P6) | ✅ per-muni, 2×/yr | **A** | `Building`: currentUse · numberOfDwellings · numberOfBuildingUnits · dateOfConstruction · `OfficialArea` · conditionOfConstruction · façade-photo `documentLink`. `BuildingPart`: **footprint + floors above/below**. `OtherConstruction`: nature |
| 2 | **INSPIRE Buildings — WFS** `wfsBU.aspx` (`GetBuildingByParcel`; bbox ≤ 4 km² / 5,000 feats) | keyless, **burst-fragile** (§P1, §L3-0) | per-bbox | **A** (access **B** at volume) | same content, **live** — *"actualizados al momento de la invocación"* (§P3) |
| 3 | **`Consulta_DNPRC`** (OVC `.svc` JSON) | **keyless** (§L2-4) | ✅ via CAT bulk | **A** | **per-unit floor code `pt` + use `luso` + area `sfc` + year `ant`** — floor-level *attributes*, nationally |
| 4 | **CAT format — descarga masiva**, per province | Cl@ve / certificate (§P5 §5.6) | ✅ 2×/yr | **B** | **registro tipo 14**: Bloque/Escalera/**Planta**/Puerta · Código de Destino · superficies · tipología constructiva |
| 5 | **Shapefile `CONSTRU`**, per province | Cl@ve / certificate | ✅ 2×/yr | **B** | the planta-general polygon + the **roman-numeral volumetría** (`REFCAT` + `CONSTRU VARCHAR2(16)`) — the bulk twin of channel 6 (§L1-1) |
| 6 | **FXCC planta general** `GeneraFXCU1.aspx?…&captcha=` | **parcel-bound captcha token** | ❌ (use 5) | **B** | DXF `PG-LP/-LI/-AA/-AS` — **strictly 2D, zero DXF group-code 30/38** (§L1-1) |
| 7 | **FXCC por plantas** `FXCC/DescargaFXCC.aspx?…&captcha=` | **parcel-bound captcha token** | ⛔ **NO BULK AT ANY TIER** | **B** | `PS01…PSnn` per significant floor + `-AU` unit codes · `-AS` areas · **`-TO` free-text room labels** (`SALA`, `V PORTERO`, `AZOTEA`) found in no other channel; `.asc` **above/below-rasante split** (§L1-2) |
| 8 | ⭐ **KML por plantas** `FXCC/FXCC_KML.aspx?refcat=&del=&mun=` | ⭐ **KEYLESS, un-gated, cold** | ⛔ **NO BULK AT ANY TIER** | **B** | **per-floor closed prisms + per-unit designator + plain-language use + uso symbology** (§L1-4) |
| 9 | Parcel KML `BuscarParcelaGoogle3D.aspx?tipo=3d` | keyless (**browser UA required**) | — | **D** | 100 % `footprint × roman-numeral × 3 m` — **Pryzm already holds both inputs. Compute it, do not fetch it** (§L1-3) |
| 10 | Visor 3D (SEC §3.1.1.6) | browser | — | **C** | visual only. **NOT probed, NOT scraped**, per the brief |

**⚖ Resolution 1 — §L2-6 Path 3 is corrected by §L1.** L2, reading the SEC guide, wrote *"only the
floor-level GEOMETRY is Class-B/CAPTCHA-gated"*. **False as measured:** the captcha gates the FXCC
**ZIP**; `FXCC_KML.aspx` served the same per-floor geometry **cold** — HTTP 200, 177,075 B,
`application/vnd.google-earth.kml+xml`, no cookie / session / referer / captcha / UA-spoof
(§L1-0, 14:38 UTC). **Live probe beats document.** The *technical* gate is absent; the *licence* and
*coverage* constraints are not — which is why row 8 stays **B**, not **A**.

### A.2 The floor-level product is real, and richer than the brief assumed

`FXCC_KML.aspx` on `2255404VK4725E` (Madrid): **7 Folders · 41 Placemarks · 430 Polygons**; every
unit a **closed watertight prism** (2 horizontal faces + N wall quads); `<name>` = unit designator
(`V.DR`, `CCE.IZ`, `AAL.T1`), `<description>` = use in plain language (`Vivienda` / `Local` /
`Local COMUN` / `Almacén`), `<styleUrl>` = the DGC's uso symbology (§L1-4).

Three things make it trustworthy; one makes it dangerous.

- ⭐ **The geometry validates against the alphanumeric independently.** Polygon integration:
  PLANTA GENERAL Σ **724.3 m²** vs `.asc` parcel **723**; SOTANO Σ **157.6** vs `.asc`
  bajo-rasante **157.00** (§L1-4).
- ⭐ **Per-floor footprints genuinely differ** — 359.9 → **335.2 m²** at PLANTA 04 (−6.9 %): real
  information *not* derivable from floors × footprint, and consistent with Madrid's own
  `VPLA_V_ORDENANZA` reading `IT_ATICO = "Si. Retranqueado 3m"` (§L1-4). Two independent sources,
  one fact.
- ⭐ **The KML pre-expands `NUMPLR`** and labels the copies `(1/4)…(4/4)`. ⛔ But the copies are
  **one surveyed croquis replicated**: `2255401VK4725E` renders **8 floors from 5 distinct croquis**.
  *"Spain has per-floor geometry"* is an overstatement. The true claim is **"per-floor-GROUP
  geometry, expanded with an explicit `(n/m)` marker"** (§L2-3 spec + §L1-4 measured).

### A.3 ⛔ What is NOT there — verified rather than assumed

- **No metric height anywhere.** Floor height is the hard-coded **3.0 m constant in 55/55 bands
  across 9 buildings** (§L1-4) — the constant the DGC's own engineers describe in 2008 (§P4) — and
  `heightBelowGround` ≡ **3 × numberOfFloorsBelowGround, exactly, 27,005 / 27,005** Granollers parts
  (§L2-1). The CAT format contains **zero occurrences of the string "altura"**; in Catastro's
  vocabulary *altura* **means storey count** (`FICCFormatoUinficado2012.pdf`: *"un edificio de dos
  **alturas** se codifica **II**"*) (§L2-1).
  ⛔ **`heightBelowGround` is a source-side tier-3 inference wearing a tier-1 attribute's clothes.**
- **No roof geometry, no pitch, no eaves height, no ground elevation, no Z ordinate.**
  `horizontalGeometryReference = footPrint` in 100 % of features; **both** FXCC variants carry
  **zero DXF group-code 30/38** (§L2-2, §L1-1, §L1-2).
- **Floors are nil at `Building` level in 100 % of cases.** Barcelona 08900, measured city-wide: the
  literal open tag `<bu-ext2d:numberOfFloorsAboveGround>` occurs **0 times in 337 MB** of
  `building.gml`, while **319,092 / 319,098 BuildingParts** carry it (§L3-4). An adapter reading
  floors off `Building` gets a nil for every building in Spain and silently produces zero-storey
  massing.
- **`OfficialArea` self-declares `sourceStatus = NotOfficial`** in 6,030 / 6,030 (§L2-2).
  ⚖ *Resolution 2: lane ES-1.2's "official gross floor area 19,567 m²" — the number is right, the
  word "official" is the element's name, not its declared status. Measured field beats prose. Cite
  it as `grossFloorArea (sourceStatus=NotOfficial)`.*
- ⭐ **There is no single official Spanish GFA.** Four official channels on one building
  (`2255404VK4725E`): DNPRC **1,900** · FXCC por-plantas **1,920** · FXCC planta-general **1,928** ·
  KML integration **1,932 m²** — spread **32 m² / 1.7 %** (§L1-8). Pick one channel, name it, and
  never present the figure as exact.

---

## B · WHAT CAN BE AUTOMATED

Ranked by defensibility. Every row's rate and licence basis is measured or read, never assumed.

| # | Automatable | Class | Basis |
|---|---|---|---|
| **B1** | **INSPIRE ATOM bulk mirror** — whole municipality, keyless, no captcha, un-blocked | **A** | 44.6 MB Barcelona ZIP fetched in 37 s at 14:58 UTC **while the OVC query host was blocked** (§L3-0). This is the plane to build on |
| **B2** | **DNPRC per-parcel at a low steady rate** — floor code + use + area + year, national, keyless | **A** | §L2-4. PRYZM's 7-day-cache proxy (`server/jurisdiction/parcelZoningProxy.js`) already survives on this plane precisely because its steady rate is tiny |
| **B3** | **`CONSTRU` shapefile + CAT type-14, per province, 2×/yr, authenticated** — the channel the DGC *built* for volume | **B** | §P5 §5.6, §L1-1, §L1-6 |
| **B4** | **Compute channel 9 instead of fetching it** — parcel-KML content is `footprint × roman numeral × 3 m` | **D** | §L1-3. Zero new information; both inputs already arrive in B1/B3 |
| **B5** | **`FXCC_KML.aspx` on demand, one parcel at a time, cached forever** — the ONLY per-floor geometry in Spain | **B** | §L1-4 / §L1-10. Measured **20/20 HTTP 200 at 0.69 req/s** (5 refcats × 4 rounds, 29 s; no 429, no challenge, no degradation) ≈ 1 % of the documented allowance |
| **B6** | **MDSnE `mdsn_e025` zonal sampling** for measured total height — already live in PRYZM | **D**, SURVEYED | `fetchSpainBuildingHeights` / `stampMdsHeightsOnGeojsonseq`, re-verified in `impl/e3b-state-heights-verdict.md`; registry row `es-cnig-mds-edificacion-wcs` |

**The rate picture, stated per host — do not average it.**

- `www.catastro.hacienda.gob.es` (ATOM / documents plane): **un-blocked**; served a 44.6 MB download
  without complaint (§L3-0).
- `www1.sedecatastro.gob.es` (`FXCC_KML.aspx`): **20/20 clean at 0.69 req/s** (§L1-6). *20 requests
  establishes no ceiling; the breaking point was deliberately not sought.*
- `ovc.catastro.meh.es` (INSPIRE WFS + `.svc`): soft-blocked after **~20 requests in ~10 min**;
  **host-scoped** (the host ROOT answered 400), **IP-scoped** (an independent vantage point served
  the same URL in the same minute), duration **≥ 7.5 h** (§P1, §L3-0).
- Documented, for the `.svc` family only: **7,200 req/h per IP → 4-hour denial** (§P5 §3.2).

⚖ **Resolution 3: §P1's "~20 requests trips it" and §L1's "20/20 clean" are BOTH true — different
hosts.** Never carry one host's WAF posture to another. (The corollary bit twice in this
investigation: §L1-3 also measured a cold `curl` with no User-Agent returning **HTTP 400 at 2,189 B
— byte-identical in size to P1's block page** — which is a **UA filter**, not a block.)

---

## C · WHAT CANNOT / SHOULD NOT BE AUTOMATED

| # | Refused | Why |
|---|---|---|
| **C1** | **Channels 6, 7 and the FXCC PDF at any volume** | Reaching them means **minting the anti-automation token programmatically**. The token is parcel-bound (a Barcelona-issued token on a Madrid refcat → 302), unforgeable (40 zeros → 302), mandatory, but replayable (§L1-6). ⚠ **No visual challenge fired in the path exercised — that is a fact about the gate, not a licence.** The DGC's stated purpose is *"evitar descargas automatizadas"* (§P5); P2 §4 authorises automatic per-user suspension on access *intensidad / frecuencia*; P5 §3.2 excludes *"barrido sistemático"*. **Take channel 6 from bulk (B3) instead.** |
| **C2** | ⛔ **Channel 7's unique content has no compliant route at scale** | `-TO` room labels and the above/below-rasante split exist in **no bulk product at any access tier** (§L1-6). Treat as **unavailable at scale** — not as "hard to get" |
| **C3** | **Systematic sweep of `FXCC_KML.aspx`** | Keyless ≠ permitted. Undocumented, unversioned, no published contract; **must never become a hard dependency** (§L1-10) |
| **C4** | **The Visor 3D** | Class **C**, never scraped — brief constraint, honoured: not probed |
| **C5** | **Per-parcel querying of `ovc.catastro.meh.es` at volume** | Burst-fragile, opaque, no published quota for the `.aspx`/`.svc` families, recovery ≥ 7.5 h once tripped (§L3-0). ⛔ **Do not re-probe that host from a production IP to find the recovery horizon** |
| **C6** | **Consuming `heightBelowGround` as a measurement** | It is `3 × floors` at source (§L2-1) |
| **C7** | **Deriving any envelope, height or GFA allowance from a ponencia coefficient** | RD 1020/1993 authorises an edificabilidad taken from *"la media de las edificabilidades existentes; o … la más frecuente"* — **the mean or mode of what already stands** (§L3-6e). Reading it as permitted buildability is exactly the SURVEYED-as-NORMATIVE overstatement the never-overstate gate forbids |
| **C8** | **Re-serving raw GML / FXCC / KML / tiles, or branding output *"cartografía catastral"*** | §P2 §1/§3 — see the licence verdict |

---

## ⚖ LICENCE VERDICT — EXPLICIT, PER USE (closes the standing founder item)

### 🟢 **GREEN — DG Catastro data used as PRYZM uses it** (3D reconstruction, envelopes, massing, zonal stats), **subject to four binding conditions.**

`Licencia.pdf` (§P2, fetched, 100,483 B) and `licdescargaES.pdf` (§P5) authorise massive download,
web-service access, and **public use INCLUDING COMMERCIAL of TRANSFORMED information**. PRYZM's
outputs are unambiguous transformations (the art. 21 TRLPI test: the modification must produce a
*different work*). The four conditions are mandatory, not advisory:

1. **Transform.** Redistribution of the original untransformed information is forbidden —
   *"no se autoriza la difusión, distribución o comercialización de la información original
   suministrada, que no puede ser difundida por Internet… sin su previa transformación"*.
2. **Cite "Dirección General del Catastro" AND the date of access** in every derived product
   (`licdescargaES.pdf`, explicit).
3. **Never identify output as *"cartografía catastral"* / *"información catastral"*** or a
   confusable term; derived data carries **no fehaciencia** (evidentiary status).
4. **10-year term**, resetting on access to an updated version; suspension is automatic on access
   intensity; revocation for misuse → BOE publication → Ley 37/2007 art. 11 sanctions.

### 🔴 **RED**
Re-serving raw GML / FXCC / KML / tiles · branding output as cadastral cartography · presenting any
derived value as authoritative-cadastral · systematic sweep of the captcha-gated or undocumented
per-parcel channels.

### ⚖ Resolution 4 — the repo's ES source-registry rows are WRONG about the licence, and this memo overturns them

`packages/site-parcel-data/src/sourceRegistry/es.ts` carries, on **all three ES rows**,
`licence.id = 'CC-BY-4.0 (Catastro resolution 2023) — Licencia.pdf located, NOT fetched verbatim'`
with `verifiedDate: null`. **The licence has now been fetched and read (§P2), and it is not CC BY.**
The service metadata agrees: all 53 DG-Catastro entries in the BU ATOM carry
`<rights>Copyright (c) 2012, ES.SDGC; all rights reserved</rights>`, and **the only CC-licensed
entries in that index are the FORAL ones** (Navarra CC BY 4.0, Bizkaia CC BY 3.0 ES). The CC-BY
belief conflates IGN/CNIG (PNOA/MDSnE — genuinely CC BY) or the foral feeds with DG Catastro.
**Document read beats registry note — and the registry note says of itself "NOT fetched verbatim".**
The colour does **not** change (GREEN for PRYZM's purpose); the **basis, the id, and the four duties**
do. → **H1.**

⚠ **Three different licence statements ship inside one product family**: the ISO 19115 metadata
inside the ATOM ZIP declares `useLimitation = "No conditions apply"` and
`otherConstraints = "no limitation"`; the ATOM declares all rights reserved; `Licencia.pdf` requires
transformation (§L2-5). **`Licencia.pdf` governs — it is the actual licence instrument; a metadata
string is not a grant.** Flagged, not resolved.

### Adjacent sources, for completeness
Madrid LoD2 🟢 **GREEN** (commercial reuse allowed; attribution *"Origen de los datos: Ayuntamiento
de Madrid"*) · SIU national WFS 🟢 **GREEN** (CC BY 4.0) · **Barcelona CartoBCN 🟡 NOT CONFIRMED**
(no `<rights>` in the ATOM; the UI's `condicions d'ús` were not read — gating) · Overture 🟡
**YELLOW** (ODbL — keep separable) · EUBUCCO v0.2 🟡 **YELLOW** · MS GlobalML **excluded** (founder
item, unresolved).

---

## D · RECOMMENDED SPAIN AS-IS SOURCE HIERARCHY

The brief's Q8 proposed `Catastro → national/regional LoD2 → Overture → EUBUCCO/fallback`.
**Two corrections, and then it stands.**

1. ⛔ **There is no national and no regional Spanish LoD2.** Verified by six probes, each with a
   control (§L3-2): datos.gob.es returns **0 items** for every 3D term while `lidar`→5 and
   `catastro`→5; IDEAndalucía CityGML **0** while LiDAR **232**; GeoEuskadi CityGML **0** while
   LiDAR **49**; ICV CityGML **0**; ICGC's 3D city models are **commissioned projects**; Navarra has
   none; `awesome-citygml` lists **exactly one** Spanish entry. **Spain has TWO CITY products** —
   Madrid (keyless 1.55 GB SLPK, roof-line restitution at 1:1000, cuatrimestral) and Barcelona
   CartoBCN. That rung must read *city*, not *national/regional*.
2. **Split the hierarchy by VALUE, not by source.** For *geometry* the city LoD2 outranks Catastro
   where it exists; for *semantics* Catastro is first **everywhere, including inside Madrid and
   Barcelona**, because neither city model carries use, dwellings, year or GFA (§L3-1).

### D.1 Geometry / massing
| Rank | Source | Class | Tier | Note |
|---|---|---|---|---|
| 1 | **Madrid / Barcelona city LoD2** | A | 1 | 2 municipalities of ~8,100. ⚠ *"LoD2" is not a quality guarantee* — Madrid's 2016 vintage admits *"modelos de cubiertas **sin precisión geométrica**"* while the 2025 vintage claims measured roof-line restitution. **Read the vintage's own lineage** (§L3-3) |
| 2 | **Catastro INSPIRE BU (ATOM bulk)** — footprint + floors per **BuildingPart** | A | 1 | national minus foral. The part decomposition **is** the massing model — 92.1 % of multi-part buildings are stepped (§L2-2) |
| 3 | **Per-floor footprint by threshold-union over parts** — `⋃{part : floorsAbove ≥ k}` | **D** | **3** | needs no FXCC, works nationally, straight from bulk (§L2-6 Path 1) |
| 4 | **`FXCC_KML.aspx` per-floor prisms**, on demand only | B | 1 *where retrieved* | adds interior subdivision, per-unit use, real per-floor perimeter differences. **Coverage is the binding constraint — D.3** |
| 5 | **Overture** | **D** | 3 | in Spain it is **97.8 % OpenStreetMap** by first source in the audited bbox; `num_floors` 90.6 %, `height` **12.8 %** (§L3-5). Backbone and GERS join target — never the authoritative floors source when Catastro's part-level floors are one call away |
| 6 | **EUBUCCO v0.2 / GlobalBuildingAtlas** | D | 3 | ⛔ EUBUCCO's floors are **ground-truth 16.6 %**, height 43.2 %; the rest is ML-imputed (`e5-oss-delta.md` §P-8). Never authoritative — **and for Spain there is no reason to use it at all** |

### D.2 Height — a separate ladder, because Catastro has none
| Rank | Source | Class | Tier |
|---|---|---|---|
| 1 | **MDSnE `mdsn_e025` P90 zonal** (PRYZM live) | D, **SURVEYED** | 3 |
| 2 | **floors × `METRES_PER_LEVEL`** where MDSnE has no sample | D, **ASSUMED** | 3 |
| — | ⛔ **Catastro `heightBelowGround` · parcel-KML z · by-floor-KML z** | — | **never tier 1** |

⚠ Two hard limits carried from `e3b`: per-footprint MDSnE coverage is only **32–40 % in dense
centres** (`minSamples:3` at 2.5 m sampling after erosion), and the constant at
`heightSources.mjs:51` is **3.2 m** while e3b measured city centres at **~3.76–3.84 m/floor** — it
understates by ~0.6 m/floor. And `H / n_floors` is **wrong in a known direction**: ground-floor
commercial storeys are systematically taller than the residential floors above, which uniform
division silently denies (§L2-6). ⛔ **A per-floor model whose slab elevations came from
`H_MDSnE / n` must never be presented as "the building's floors."**

### D.3 ⛔ The coverage fact that decides where floor-level geometry may appear in a product
`FXCC_KML.aspx`, measured (§L1-5): **Barcelona block 0/5** — including PRYZM's flagship parcel
`2940601DF3824B` — vs **Madrid block 10/10**. City spot-check: Madrid ✅ · Valencia ✅ · Málaga ✅ ·
Sevilla ⚠ degenerate · **Barcelona ❌ · Zaragoza ❌ · Vigo ❌ · Murcia ❌**. **0/5 vs 10/10 across whole
blocks is territorial, not a per-building lottery. No coverage index exists** — the only way to know
is to ask and inspect. n is far too small to publish a percentage, and none is published.

### D.4 Semantics (use · dwellings · year · GFA · per-floor use and area) — one answer
**Catastro first, everywhere, nationally: INSPIRE BU + DNPRC.** Barcelona 08900 measured:
`currentUse` **99.7 %**, `numberOfDwellings` **100 %**, `dateOfConstruction` ~100 %, `OfficialArea`
~100 %, over **69,897 buildings** (§L3-4).

---

## E · DOES THIS CHANGE E5? — **DATA, NOT ARCHITECTURE. NO ARCHITECTURAL CHANGE IS REQUESTED.**

`E4-EXECUTION-CONTROL.md` **§1** (the architecture gate is not reopened unless a concrete
implementation test demonstrates failure), **§2** (no additional canonical entities, fields or
abstractions) and **§10** (record discoveries for the appropriate later lane) are all satisfied by
what follows. The federation scaffold being built concurrently
(`lane-fed-buildings-federation.md`) needs **no new entity, no new field, no new tier, no new
matcher and no new abstraction** from this investigation. **No implementation test in this
investigation demonstrated a federation failure, so §1's precondition is not met and the gate stays
shut.**

### E.1 What changes — five DATA rows, all cheap

| # | Change | Where | Evidence |
|---|---|---|---|
| **E-1** ⭐ | **The ES licence rows are wrong and must be rewritten.** `CC-BY-4.0 (Catastro resolution 2023)` → **custom DGC transformation licence**. Colour stays **GREEN**; the `id`, the four duties and `verifiedDate` change (the PDF has now been fetched and read) | `sourceRegistry/es.ts`, all 3 rows | §P2 |
| **E-2** | **The ATOM bulk mirror deserves its own registry row**, separate from the WFS row — different host, different failure mode, **and it is the plane that stays up when the query plane is blocked** | `sourceRegistry/es.ts` | §L3-0, §P6 |
| **E-3** ⚠ | **`FEDERATION_CONFLATION_STRATEGY.ES = 'bridge-file'` is correct but must not be misread.** The Overture GERS bridge is to **IGN-España (BTN)** — *not* to Catastro. A bridged Overture↔IGN join does **not** yield Catastro refcats; **Catastro conflation stays geometric or refcat-keyed** | federation `sourcePriority.ts` §4(a) | `e5-oss-delta.md` §D1 / §P-1 |
| **E-4** | **Freshness becomes measured data**: the bulk plane refreshes twice yearly (first week Feb + Aug) and **the August-2026 refresh had NOT landed at 14:58 UTC on 2026-09-01** — Barcelona's ZIP was dated **2026-02-20**. Six months stale at probe time; live currency requires the WFS, i.e. the plane that soft-blocks | registry `updateFrequency` | §L3-4 |
| **E-5** | **EUBUCCO can be dropped from the Spain path entirely.** Catastro part-level floors are ~100 % populated nationally; an ML-imputed floor count adds nothing but risk | federation tier-3 rows | §L3-4 + `e5-oss-delta.md` §P-8 |

### E.2 What does NOT enter E5 — the decisive judgement

⛔ **Per-floor geometry (channels 7 + 8) must NOT become an E5 federation source.** Three
disqualifying facts, all measured: **no bulk product contains it at any access tier** (§L1-6);
**coverage is territorial and Barcelona is a miss** (§L1-5); **the endpoint is undocumented,
unversioned and may vanish without notice** (§L1-0). E5's acceptance criterion is *"any EU address
renders parcel + neighbours"* — a source that cannot answer for whole cities cannot sit in that path.

**Its correct home is E10 (Development Potential).** E10's entry condition already reads *"existing
GFA from ES DNPRC/wfsBU"*; per-floor geometry is the same question one level finer — user-initiated,
one parcel, long-cached, never swept. **Record it for E10; do not expand E5's scope** (control §10).

### E.3 ⭐ A correction owed to the E5 national sweep
`e5-asis-national-sweep.md` §3.1 records ES and SI as the two floor-level-geometry countries. True —
**but the two are not comparable at scale, and this memo resolves it.** Slovenia's `ETAZE` is a
**keyless WFS returning `numberMatched 2,307` in one Ljubljana km², carrying `VISINA_ETAZE` (floor
height) and `NADMORSKA_VISINA` (floor altitude) as real numbers, CC BY 4.0, with a JGP bulk
channel** (§E5-7). Spain's is **per-parcel only, no bulk at any tier, territorially patchy, and
carries no height at all — every metre in it is the 3 m constant.**
⇒ **Of the two, only Slovenia's floor-level product is usable at federation scale.** Spain is richer
on *use and unit semantics* and on *national register coverage*; Slovenia is strictly richer on the
*vertical axis*. That distinction belongs in the sweep row.

---

## F · WHAT CATASTRO DOES **NOT** PROVIDE FOR THE BUILDABLE ENVELOPE

**Answer to Q9: NOTHING. Zero machine-readable planning content.** Established five independent ways
(§L3-6):

- **The bulk interchange format carries none.** CAT tipo 11 (finca) = codes, address, surfaces,
  X/Y — then a long run of *"campo intencionadamente en blanco"*. Tipo 14 = planta, puerta, destino,
  years, surfaces, and *"Tipología constructiva según Normas Técnicas de **Valoración**"* — a
  **valuation** typology, not a planning one. The only "class" field in the whole format is
  **Clase del Bien inmueble (UR, RU, BI)**.
- **The per-parcel query service carries none.** The complete `Consulta_DNPRC` key set contains no
  designation, no buildability, no height, no setback, no alignment. `luso` is the **use of a
  unit**; it is not a land classification.
- ⛔ **`CP:CadastralZoning` is NOT zoning.** The DGC's own CP-WFS spec defines `GetZoning` as
  *"**Manzanas** de urbana y **polígonos** de rústica"* — **cadastral subdivision**. An adapter that
  maps it to "zoning" ships a category error **with an INSPIRE citation attached**.
- **The UR/RU flag is planning-*derived* but carries no parameter.** TRLCI art. 7.2 defines urban
  land as *"el clasificado o definido por el planeamiento urbanístico como urbano…"* — a
  two-values-plus-BICE **tax flag** that lags the plan. It tells you which side of a line a parcel
  sits on; **never what may be built.**
- **The ponencia is a valuation input, not a rule** — RD 1020/1993 expressly permits its
  edificabilidad to be *"la media de las edificabilidades existentes; o … la más frecuente"* (C7).

**Also missing, specifically for the envelope:** máxima altura reguladora · retranqueos ·
alineaciones · profundidad edificable · ocupación · protection status · **ground elevation /
rasante** (tier 6 from Catastro — PRYZM's terrain supplies it) · **roof geometry** (tier 6 — nothing,
anywhere) · **floor-to-floor of a named storey** (**does not exist in any Spanish register**).

⚠ **And the rasante gap is a *legal* defect, not a cosmetic one** — the L-584 family. Catastro models
everything as resting on terrain with no ground datum (§P4); on a sloping parcel "planta baja" is not
one elevation, and the ordinance measures at the **façade**, not the centroid (§L2-7 item 3).

### F.1 The named failure modes that would make a reconstruction wrong (§L2-7, §L1-7 — carry these forward)
Mezzanines (`EPT`/`ALT` count as a floor and are nowhere near a storey) · ⛔ **the semisótano ordering
trap** — FXCC *instructs producers to misorder the stack to satisfy a validator*, so **never stack on
`.asc` sequence; key on the floor code** · sloped ground · courtyards (`PTO` excluded from computed
surface; 818 `gml:interior` rings in Granollers — **honour interior rings**) · `plantas
significativas` collapse · 50 %-coefficient areas (`TZA`/`SOP` are recorded **post-coefficient**, so
summing gives **computable**, not physical, area) · casas engalabernadas · **non-georeferenced legacy
FXCC** (permitted for municipalities without georeferenced cartography — façade-oriented, and it will
land in the wrong place if assumed UTM) · the foral gap · **footprint vs roof** (Catastro serves
footprints, MDSnE measures roofs — eaves overhang biases every zonal join).

---

## G · BEST OFFICIAL PLANNING SOURCES TO COMBINE WITH CATASTRO

Ranked by adapter cost against coverage (§L3-7). **Two rows are new and probed in this investigation.**

| # | Source | Coverage | Gives | Class · Licence | Verdict |
|---|---|---|---|---|---|
| 1 | **Madrid CM** `idem.comunidad.madrid/geoserver3/wfs` · `sitcm:VPLA_V_ORDENANZA` | 1 CCAA, 6.7 M people | ordenanza + NZ/grado + tipología + `IT_ATICO` retranqueo + plan citation; altura 70.2 % / plantas 72.9 % regionally (**capital only 3.6 %**) | A · 🟢 | **wire first.** ⚠ query in **EPSG:25830** — a 4326 bbox returns 0 features *silently* |
| 2 | ⭐ **Barcelona CartoBCN product 107** (NEW) `w20.bcn.cat/CartoBCN/getFile.ashx?prod=107.BARCELONA.2` | 1 city, **daily** refresh | **21,298 qualification polygons**; `CLAU` 100 % (669 distinct) · `CLASSIFIC` 100 % · `TIPUS_ORD` 38.2 % · `ALCADES` 36.4 % | A · 🟡 **licence NOT CONFIRMED** | wire **after** reading the `condicions d'ús`. ⛔ `ALCADES` is free text and sometimes **`Veure plànol 26`** — a pointer to a drawing, i.e. a refusal, not a height |
| 3 | **AMB Refós** `qualificacio_refos_3857` (PRYZM production) | 36 munis | qualification polygons | A · 🟢 | keep as the Barcelona primary; 107 is the cross-check |
| 4 | **Región de Murcia** municipal GeoServer | 1 CCAA | `Edificabilidad`, `Enlace_ficha`, **the only measured ES alineación geometry** | A · 🟢 | the alignment pilot. ⚠ `pgou_ejes` is a **road axis, not an alignment** |
| 5 | ⭐ **SIU national WFS** (NEW) `mapas.fomento.gob.es/arcgis/services/SIU/`**`Servicios_OGC`**`/MapServer/WFSServer` | **NATIONAL** | `ClaseSuelo` · sector/recinto geometry · `UsoSuelo` — **live GetFeature confirmed** over the audited Madrid parcel | A · 🟢 **CC BY 4.0** | the **national classification spine**. ⛔ **never a parameter source** — `OGC_Sectores` carries `IdSector` and *nothing else*; edificabilidad lives in separate SIU spreadsheets |
| 6–12 | C. Valenciana (READ) · Illes Balears (READ) · **Galicia** (schema-mandated, **not served**) · **Andalucía** (template ships **0 rows**) · **Aragón** (`edificab` non-zero **1.3 %**, `aprove` **0.0 %**) · **Extremadura** (`CALIFICACION_*` returns `msGeometry` and nothing else) · Castilla y León (*"sin validez jurídica, carácter informativo"*) | 1 CCAA each | thin → empty | A(thin/empty) | document-rule regions; monitor |
| — | **País Vasco / Navarra** | foral | **outside DG Catastro entirely** | — | **fence the national assumption** — separate cadastre *and* planning adapters |

⭐ **Two findings worth acting on beyond the ranking.**
(a) The **SIU catalogue URL is dead** (`Servicios_OGC_SIU` → HTTP 499 / REST 404) **while the service
is alive under a different name** — a textbook *bulk-vs-query-endpoint-false-refusal*.
(b) CartoBCN 107 **independently corroborates the repo's Barcelona depth saga**: the municipality's
own planning delivery carries `FONDARIA1/2/3/4` on **0.8 %** of polygons. **The depth PRYZM computes
is not a missing lookup — the datum does not exist in the plan's vector layer**, so constructing it
was correct.
⚠ And the trap next door: CartoBCN **105** looks identical and is a CAD conversion whose only
populated normative field across 114 polygons is `CLASSIFIC` (*a field name proves nothing*).

> **G verdict.** The cheapest correct pairing today is **Catastro parcel + building geometry
> (national, A) × per-CCAA planning attributes (A only in Madrid, Catalunya, Murcia)**, with **SIU as
> the national classification spine** and **PRYZM computing the envelope**. **Spain has no
> parcel-level machine-readable buildability service at any level of government.** Nothing found in
> this investigation changes that.

---

## H · MINIMUM IMPLEMENTATION REQUIRED

**NOT implemented here** — a short list feeding a future wave brief. H1–H6 and H8–H9 are E4/E5-adjacent
and cheap; **H7 belongs to E10, not E5** (§E.2).

| # | Item | Wave | Cost |
|---|---|---|---|
| **H1** ⭐ | **Rewrite the three ES licence rows** in `sourceRegistry/es.ts`: the CC-BY-4.0 claim is refuted (§P2). New `id` = custom DGC transformation licence; colour **GREEN**; `verifiedDate` set; the four duties (transform · cite DGC **+ access date** · never re-serve · never brand cadastral) recorded where an adapter can read them | E4/E5 | XS |
| **H2** ⛔ | **The ES BU adapter must read floors off `BuildingPart`, never `Building`** — 0 populated of 69,897 in Barcelona (§L3-4). Ship it as an **assertion**, not a comment: *failure and empty are the same value* | E5 | XS |
| **H3** ⛔ | **Never pass `heightBelowGround` through as measured** — it is `3 × floors` at source (§L2-1). Drop it, or re-derive with tier 3 attached | E5 | XS |
| **H4** | **GFA honesty**: cite `grossFloorArea (sourceStatus=NotOfficial)`; record that four official channels disagree by 1.7 % and that **there is no single official Spanish GFA** (§L1-8) | E5/E10 | XS |
| **H5** ⭐ | **Ship the free per-building checksum** `Σ_parts(area × (floorsAbove + floorsBelow)) / grossFloorArea` — median **1.000**, 76.9 % within ±10 % at Granollers, and adding basements moves large buildings **0.830 → 0.986** (§L2-6). A refusal gate that costs nothing. ⚠ **Re-run on a Madrid and an Andalusian municipality before it gates nationally** (§L2-9) | E5 | S |
| **H6** | **Normalise the DNPRC floor code `pt`** — Barcelona returns `"0"` / `"-1"`, Madrid returns `"00"`, same national service (§L2-4) — plus the alpha codes `SM`, `AT`, `EPT`. `es` / `pt` / `pu` are each independently optional | E5/E10 | S |
| **H7** | **IF the per-floor KML is ever wired — five defences, all mandatory** (§L1-7): **D1** subtract `3 m × (true sótano levels)` (rule exact 4/4; a naive ingest over-heights `2255407VK4725E` by **43 %**) · **D2** gate on `count(Folder with ≥1 Polygon) > 0`, **never** on HTTP status or byte length (three absence shapes, none an error status; one is a well-formed 5,886 B KML with 0 polygons that passes any validity check) · **D3** override the XML prolog to UTF-8 (it declares ISO-8859-1; the bytes are UTF-8) · **D4** a free-text floor-label parser **with a refusal branch and a fixture corpus**, never a regex shipped on faith · plus surface the FXCC date (the por-plantas artefact is **2018** and already 8 m² adrift), cache forever, user-initiated one parcel at a time | **E10** | M |
| **H8** | **Foral fence** — País Vasco + Navarra are outside DGC (95 % coverage); their ATOMs are federated in the same index under *different* licences (Navarra CC BY 4.0). Any "national ES" claim must exclude them explicitly | E5 | XS |
| **H9** | **Record ATOM freshness as data** — 2×/yr (Feb + Aug); the Aug-2026 wave had not landed on 2026-09-01 (§L3-4). Live currency needs the WFS, i.e. the plane that soft-blocks | E5 | XS |
| **H10** | **Rasante refusal** — a single ground datum per building is wrong on any sloping parcel, and wrong *legally* (L-584 family). Above a slope threshold the honest answer is a refusal, not a centroid sample (§L2-7) | E6/E10 | S |

---

## NOT CONFIRMED — and it stays NOT CONFIRMED

1. **National coverage % for by-floor data.** n = 15 parcels / 8 cities. The *territorial pattern* is
   established; **no percentage is published** (§L1-11).
2. **Whether a visual CAPTCHA ever fires**, and after how many requests. Not observed — and **not
   tested, because testing it means provoking the control** (§L1-6).
3. **The true rate ceiling of `FXCC_KML.aspx`.** 20 requests in 29 s is clean; the breaking point was
   deliberately not sought (§L1-11).
4. **Whether the Granollers GFA reconciliation holds outside Catalunya.** One municipality, one
   province (§L2-9) → H5.
5. **CartoBCN licence** — no `<rights>` in the ATOM; the UI conditions were not read. Gates G-row 2
   and the Barcelona 3D model (§L3-8).
6. **Overture ES floors provenance** — 90.6 % populated, 97.8 % OSM-sourced, only **3 of 2,087** OSM
   ways carry a `catastro` source tag. **Neither derivative of nor independent of Catastro** is
   established (§L3-5). The attractive hypothesis was formed and **dropped**.
7. **Whether `OtherConstruction` carries any nature but `openAirPool`** anywhere in Spain (two
   municipalities sampled, both 100 % pools) (§L2-9).
8. **Whether `beginLifespanVersion` resets on bulk reprocessing** — which would make the
   "70 % pre-2010" staleness figure an artefact of the 2005–09 re-cadastration spike (§L2-9).
9. **The OVC block's recovery horizon.** ≥ 7.5 h and counting; ⛔ **do not re-probe from a production
   IP to find out** (§L3-8).
10. **C. Valenciana's *Cartografía tridimensional por municipios* (2009 / 2017)** — one probe owed
    before "no regional LoD2" is closed for CV (§L3-8).
11. **Whether the `PS`-block DXF geometry is byte-identical to the KML polygons** — both validate
    against the same `.asc` areas; not diffed vertex-by-vertex (§L1-11).
12. **The FXCC DXF layer-table label alignment** — the 2024 spec's two-column table extracts with its
    label column offset by one row; the mnemonic-consistent reading was confirmed against a real file
    (§L1-2), but a visual re-check is still owed before code (§L2-9).

---

*Memo complete 2026-09-01. Investigation closed; nothing built. The one architectural request this
memo makes is that **no architectural change be made**: Catastro changes E5's source-priority
**data** — five rows, §E.1 — and nothing else, and its floor-level geometry is recorded for **E10**.*
