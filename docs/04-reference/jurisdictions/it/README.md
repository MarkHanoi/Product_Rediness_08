# Italy (`it`) — Jurisdiction Overview

**Level:** country · **ISO 3166-1:** `IT` · **Join key:** ISTAT codice comune (6 digits) ·
**Subdivision law:** Regions (ISO 3166-2, `it-<subdiv>`) — 19 regions + 2 autonomous provinces ·
**Last updated:** 2026-07-23 · **Maintainer:** UNASSIGNED · **Status:** RESEARCH COMPLETE — implementation pipeline NOT started

> **This file is the country-level umbrella.** Municipality-level packs live under
> `it/<region-iso>/<ISTAT6>-<slug>/`. The national data-source layer is characterised at research
> level; no rule pack is implemented yet.

---

## 1 — What governs here (national structure)

### 1.1 Legal hierarchy

```
Costituzione (Art. 117 Title V) → "governo del territorio" = CONCURRENT REGIONAL COMPETENCE
  → National floor:
      DM 2 aprile 1968 n. 1444 — zone taxonomy (A–F) + density/distance ceilings
      Codice Civile Art. 873 — national minimum boundary setback (3 m)
      DPR 380/2001 (Testo Unico dell'Edilizia) — national building-permit code
        Art. 2-bis → regional derogation regime for Art. 9 building distances
  → Regional planning law (one per region / autonomous province — NOT one national code):
      PRG (Piano Regolatore Generale) — classic 1942-law instrument (Piedmont, Umbria, Marche, …)
      PGT (Piano di Governo del Territorio) — Lombardy only (L.R. 12/2005)
      PUC (Piano Urbanistico Comunale) — Liguria, Campania, Sardinia
      PSC (Piano Strutturale Comunale) — Friuli, Campania, Basilicata, Calabria, Tuscany
      PUG (Piano Urbanistico Generale) — Emilia-Romagna, Puglia, Sicily; Lazio = PUGC
      PAT + PI (Piano di Assetto del Territorio + Piano degli Interventi) — Veneto (L.R. 11/2004)
      PCTP — Autonomous Province of Bolzano
  → Municipal plan within the regional instrument (numbers + operative zoning)
  → Regolamento Edilizio / REC / RUEC / RET — building-code layer (name varies by region)
```

**Italy's central structural difference from France and Germany:** the planning *instrument itself*
— not just its numbers, its legal architecture — is regional. A "PUC" in Campania and a "PGT" in
Lombardy are not two labels for the same mechanism the way `UA` in two French communes is at least
the same *kind* of document. This means a rule-engine kind built for reading a Lombard PGT's *Piano
delle Regole* may share almost nothing structurally with what is needed for a Campanian PUC. Italy
thus has France's "every commune writes its own numbers" problem, Germany's "delivery is
state-by-state" problem, AND a third problem neither has: the operative instrument *type* differs
by region and the zoning *mechanism* can differ again by city within one region.

### 1.2 The regional-instrument split (must be resolved before any city work)

| Regional instrument | Regions / provinces using it |
|---|---|
| **PRG** (Piano Regolatore Generale) | Piedmont, AP Trento, Umbria, Marche, Abruzzo, Molise, Valle d'Aosta |
| **PGT** (Piano di Governo del Territorio) | **Lombardy only** (L.R. 12/2005) |
| **PUC** (Piano Urbanistico Comunale) | Liguria, Campania, Sardinia |
| **PSC** (Piano Strutturale Comunale) | Friuli VG, Campania, Basilicata, Calabria, Tuscany |
| **PUG** (Piano Urbanistico Generale) | Emilia-Romagna, Puglia, Sicily; Lazio = PUGC |
| **PAT + PI** | Veneto (L.R. 11/2004) — structural plan + operational plan, split |
| **PCTP** | AP Bolzano — entirely separate cadastral system too |

The building-code layer beneath the plan is named:
- **Regolamento Edilizio (RE)** or **REC** — most regions
- **RUEC** — Campania
- **RET** (Regolamento Edilizio-Tipo) — Lombardy only

### 1.3 DM 1444/1968 zone taxonomy (nominally national — frequently superseded)

DM 2 aprile 1968, n. 1444, Art. 2, defines a closed national list of *zone territoriali omogenee*:

| Zone | Description | Art. 7–8 density ceiling (fondiario) |
|---|---|---|
| `A` | Historic centres | Conservative renovation; no net-new volume |
| `B` | Already built-up residential | 5 mc/mq (if plan is silent) |
| `C` | New residential expansion | 5 mc/mq |
| `D` | Industrial / productive | 5 mc/mq |
| `E` | Agricultural | 0.03 mc/mq (fondiario) |
| `F` | Public facilities and infrastructure | — |

Art. 9 sets the nationally inderogable minimum distance *between buildings with facing windows*:
10 m minimum (further conditions by zone type). Subject to regional derogation under DPR 380/2001
Art. 2-bis — **not a safe floor without checking each region's derogation law**.

**⚠ Critical caveat:** DM 1444's zone letters are a 1968 *minimum-standards* framework, not the plan
document itself. Many modern municipal plans still report zone letters for statistical purposes while
running a completely different operative zoning mechanism underneath. Milan (PGT territorial index)
and Rome (tessuto typology) have **abandoned the letter taxonomy for operative purposes entirely**.
Do not assume `A`/`B`/`C` letters are a universally safe query key the way BauNVO letters are in
Germany.

### 1.4 Italy's FAR-equivalent — alive nationally, but drifting away in large cities

Italy's working floor-area concept is **SUL/SLP** (*superficie utile lorda / superficie lorda di
pavimento*), paired with the **indice di fabbricabilità** (fondiario or territoriale, expressed as
`mc/mq` or `mq/mq`). Unlike France (FAR abolished nationwide since ALUR 2014), Italy's FAR
equivalent is still alive at the national floor level (DM 1444 Art. 7–8). But **individual cities
are choosing to abandon it on their own initiative** (Milan's PGT perequation system — see §B.1 of
the master study) — a *municipal choice*, not a national legal fact, so it cannot be assumed to
generalize the way "no FAR in France" safely can.

### 1.5 Three-tier sequencing recommendation (mirrors France and Germany)

| Tier | Definition | Candidate cities |
|---|---|---|
| **Tier 0** *(new — pending verification)* | Unified open-geodata system; may score closer to Denmark than to Italy's national average | **AP Bolzano** (South Tyrol NewPlan — unified planning + landscape GIS, CC0, open since 2007; see §2.1 deviation note and §7) |
| **Tier 1** | DM 1444 zone letters still operative, numeric tables zone-keyed, decent regional geodata | **Turin** *(pending primary-text confirmation of PRG NTA AND confirmation that the 2026 revision keeps the zone-letter mechanism — see §7)* |
| **Tier 2** | Bespoke city-specific mechanism replacing national taxonomy; new engine kind required | **Milan** (territorial index + perequation), **Rome** (fabric typology + intervention-mode split) |
| **Tier 3** | Unconfirmed regional mechanism — each its own research task before any estimate | Every other Italian region (Campania PUC, Veneto PAT/PI, Emilia-Romagna PUG, etc.) |

> **Sequencing note:** AP Bolzano has been promoted to a potential Tier 0 candidate — the two
> jurisdictions originally flagged as *requiring extra work* (excluded from national Catasto) may
> include Italy's strongest case. Do not finalise any city-tier ordering before a direct live probe
> of NewPlan's public access model (WFS, licence, parcel-level zoning query). See §7.

---

## 2 — National data sources

### 2.1 Parcel geometry — Catasto (Agenzia delle Entrate)

| Layer | Source | Access | Licence | Confidence |
|---|---|---|---|---|
| Cadastral parcel geometry | **Catasto** — Agenzia delle Entrate, Direzione Centrale Servizi Catastali | WFS: `wfs.cartografia.agenziaentrate.gov.it` · WMS: `wms.cartografia.agenziaentrate.gov.it` | **CC BY 4.0** (open) | `published` |
| Bulk download (parcels + addresses) | Agenzia delle Entrate open-data portal | Nationwide bulk download, available **since February 2025** | CC BY 4.0 | `published` |
| Scale / precision | 300,000+ sheets, >85 million parcels, 18 million buildings — not survey-grade (same precision caveat as French PCI Express) | — | — | `published` |

**⚠ Autonomous Province deviations — updated assessment:**
- **Trento:** runs its own cadastral system by statutory delegation — **excluded** from the national Agenzia WFS. Needs its own separate cadastral integration. Not confirmed in later research passes.
- **Bolzano (South Tyrol):** same WFS exclusion pattern. **However**, South Tyrol runs one of the most mature open-geodata programmes in Italy — **the original characterisation as a negative exception understates what is actually there:**
  - Geodata freely available via standard WMS/WMTS/WFS/WCS, **CC0 by default** (more permissive than the national Catasto's CC BY)
  - Open-data programme dates to **2007** — the Municipality of Merano was the first Italian municipality to open cadastral data for OpenStreetMap
  - **NewPlan**: a geographic information system for integrated management of territorial plans, merging urban and landscape-constraint layers into one system (the "planning instrument vs. landscape overlay" split that plagues mainland Italy is reportedly solved here)
  - **This may be closer to Denmark's ~96% than Italy's ~8%** — a direct live probe of NewPlan WFS availability, licence, and parcel-level zoning query mechanics is now the single highest-value unverified lead in the entire Italy research thread (see NEXT.md B7)

### 2.2 Zoning identification — no national machine-readable standard

Unlike France (GPU WFS) or Germany (XPlanung), **no national structured machine-readable municipal
zoning layer exists**. What exists instead:

| Source | What it covers | Quality | Confidence |
|---|---|---|---|
| **EU INSPIRE Geoportal** *(new — best discovery layer)* | Free federated search across all Italian planning regimes; returns per-municipality dataset records by comune name or plan type (`piano regolatore`, `PUC`, `PGT`, etc.); concrete hits confirmed for Lecce, Bari, Lavagna, Aosta, Valle d'Aosta. **⚠ caveat: some hits are georeferenced scans of historical paper plans, not current vector layers** — check `Spatial representation type` metadata before use | Discovery only; each record requires individual format/currency verification | `corroborated (discovery, not data quality)` |
| **Geoportale Lombardia** | PGT archive + cartography for every Lombard comune | Best in class — MISURC mosaic + current PGT documentary | `corroborated` |
| **Lombardy Indagine Offerta PGT** *(new)* | Region-wide structured dataset with SLP (Superficie Lorda di Pavimento) floor-area figures by function (residential vs. other) for every Lombard comune — collected under L.R. 31/2014 land-consumption monitoring; free; covers Transformation Areas and Implementation Plans | Not per-parcel FAR; aggregate by comune; best FAR-adjacent structured data found in Italy | `corroborated — schema not yet probed` |
| **Piedmont regional PRG mosaic WMS** | PRG mosaicatura — destinazioni d'uso, vincoli, piani esecutivi | Explicitly uneven currency — more recently updated for metropolitan area/provincial capitals | `corroborated (with caveat)` |
| **dati.gov.it + RNDT** *(new)* | Free public discovery layer for finding PDF/document links per comune — does not deliver structured data but allows cheap enumeration of what comuni have published before falling back to manual search | Discovery only | `corroborated` |
| **Emilia-Romagna regional geoportal** | Confirmed running full OGC stack (WMS, WFS, WCS, WPS, CS-W, INSPIRE-compliant); whether the zoning layer specifically is in that stack is **unconfirmed** — needs direct WFS capabilities check | Partial — infrastructure confirmed, zoning layer status TBD | per-region |
| **Tuscany** *(confirmed negative)* | PRG data delivered as PDF-format scanned maps, not vector — **having a geoportal does not imply having zoning-as-data** | ❌ Not useful for zone identification | N/A |
| **Palermo** *(confirmed municipal exception)* | Published its own zoning shapefile directly, CC BY 4.0 — but dated to a **2004 council resolution** (presa d'atto N.07/2004). Currency risk: may not reflect subsequent varianti. | ⚠ Structured but aged; currency check required before use | `corroborated (with strong currency caveat)` |
| **Naples** *(confirmed municipal exception)* | Publishes PUC and historic-centre typology dataset directly via open-data portal — independently, regardless of Campania's regional tier | Available | `corroborated` |
| **Puglia** | Regional SIT has genuine WMS/WFS for topographic layers; the **PUG zoning layer specifically is a planning-status tracker** (which comuni have adopted/approved their PUG), not a queryable per-parcel feature service | ❌ Zoning layer is a compliance dashboard, not a feature service | N/A |
| **Veneto IDT** *(new access-tier pattern)* | General geodata free via full OGC stack; but the "Quadro Conoscitivo" (the knowledge-base underpinning PAT/PI planning decisions under L.R. 11/2004) **requires authentication and is restricted to provinces and comuni specifically** — general public locked out of the most useful planning layer | ⚠ Tiered access — general cartography public; planning-specific layer gated to institutions | `corroborated (general); restricted (planning layer)` |
| **Campania SIT semplificato** | Region-wide platform covering all 550 Campanian comuni including Catasto, Urbanistica, Zonizzazione — but: (1) some services login-restricted per comune; (2) **explicit legal disclaimer that all thematic maps may not be current and are "for study purposes only, not evidentiary"** | ⚠ Broad coverage but explicitly non-certifying — structural Italian pattern, not one-off | `corroborated (with non-evidentiary disclaimer)` |
| **Private platforms (UrbisMap, PgtOnLine)** | Aggregate Agenzia delle Entrate cadastre + municipal SIT vectors; **UrbisMap now has a documented API** (not just web-GIS) — licensing not free but has an actual API contract | Most comprehensive mosaics; subscription required | secondary |
| **Arcai** *(new)* | AI chat layer indexing NTA/PRG/PGT/PUC documents article-by-article for 6,252 comuni (~€39/month); acknowledged failure mode on corrupted OCR documents | Commercial PDF-transcription-as-a-service; not raw structured data | secondary |

**Net assessment:** structured national zoning-rule data is **behind** where France's CNIG SRU pilot
is. The INSPIRE Geoportal and dati.gov.it+RNDT are genuine discovery improvements — collapsing the
discovery problem from "crawl 21 regional geoportals" to "query one EU endpoint per comune" — but
they do not fix the underlying data fragmentation. **The recurring Italian pattern confirmed
empirically region by region:** something free and technically real almost always exists, but always
carries one of three caveats — *not current*, *not legally certifying*, or *not publicly accessible
past the general-cartography layer*. Veneto is the clearest new example of the third caveat.

### 2.3 Heritage and protective overlays — APAR/SITAP + Vincoli in Rete (Italy's one structural advantage)

Italy is structurally ahead of both France and Germany for heritage overlay coverage:

| System | Covers | Access | Confidence |
|---|---|---|---|
| **APAR/SITAP** *(updated — re-engineered system)* | Georeferenced perimeters of landscape constraints (Codice dei Beni Culturali D.Lgs. 42/2004 Artt. 136/157 — "decreed" landscape interest) + archaeological-interest zones (Art. 142(1)(m)). **Delivered as genuine vector cartography** (polygon, line, point features — confirmed, not raster tiles). **Now OGC-compliant: WMS and WFS endpoints** aligned with other national MiBACT mapping systems, behind `sitap.cultura.gov.it`. Access model (public vs. MiBACT-restricted) requires direct live probe of the WFS endpoint. | WMS + **WFS** (OGC-compliant, APAR re-engineering) | `corroborated` *(structured access confirmed; live-probe required to confirm public access)* |
| **Vincoli in Rete** | Cultural-heritage protections (Parts II and III of D.Lgs. 42/2004 — individually listed buildings, archaeological assets) | Freely consultable | `published (with caveat)` |

**⚠ SITAP/APAR content caveat (unchanged — structured access ≠ certified content):**
Despite the access-method upgrade to genuine WFS, SITAP is still explicitly self-described as
"an archival and representational system of a purely informational and support character" given
"acknowledged incompleteness" and "variable positional accuracy." A `NOT FOUND` from SITAP does
not certify absence of a constraint — only absence of a *recorded* one. The OGC upgrade improves
*how* the data is accessed; it does not upgrade the *legal standing* of the data. Ship at
`corroborated` maximum; never `certified` without a parallel decree check. These are two separate
axes and must not be conflated.

### 2.4 Building footprints and height — no national LoD2; terrain only (PST/SIM)

| Layer | Source | Coverage | Confidence |
|---|---|---|---|
| **PST/SIM terrain** (DTM/DSM) | MASE (*Ministero dell'Ambiente*) — Piano Straordinario di Telerilevamento + PNRR SIM expansion | ~50% historical; **PNRR target: 100% by 2026** (25 cm resolution, ~8 cm vertical accuracy) | `published` |
| **Building heights — Piedmont (surveyed)** | ARPA Piemonte Edifici 3D — per-building volumetric footprints + mean elevation, derived from BDTRE + terrain; includes per-building quality code | Piedmont region only; ~10% of Italy | `corroborated` |
| **Building heights — national modeled estimate** *(new — 2025)* | **OpenBuildingMap** (published 2025): free global dataset with per-building height estimated from EU JRC Global Human Settlement built-up-characteristics layer, covering Italy. **OSM** building footprints: freely downloadable Italy extract (~2.1 GB, ODbL); continuously updated. OSM completeness is uneven (~1M OSM buildings vs. ~2.8M in Lombardy authoritative dataset per 2018 study). | ~40–50% national (modeled/estimated); coverage uneven by locale | `inferred (modeled — NOT shippable as a legal or surveyed claim; must be flagged explicitly)` |

**⚠ Critical distinction:** Piedmont's ARPA Edifici 3D (surveyed, BDTRE-derived) and
OpenBuildingMap/OSM (satellite-derived modeling) are categorically different confidence tiers.
"National modeled estimate" must never be presented at the same confidence as "Piedmont surveyed."
The original claim of "~0% everywhere outside Piedmont" is no longer accurate — but the replacement
is a modeled, not surveyed, figure. Do not use OpenBuildingMap or OSM heights for legal or
engineering claims without explicit flagging.

**No German ZSHH equivalent coordinates building-model production across regions.** Italy's national
LiDAR program (PST/SIM) produces terrain/surface models — not semantically classified building
layers. Building-height data availability must be confirmed per target city before committing a dev
estimate, starting from a lower prior than Germany.

### 2.5 National floor rules — setbacks and distances

| Rule | Basis | Value | Derogation |
|---|---|---|---|
| Minimum boundary setback | Codice Civile Art. 873 | **3 m** minimum (absent stricter local rule) | Municipal plan may set stricter; cannot go below 3 m |
| Minimum distance between buildings (facing windows) | DM 1444/1968 Art. 9 | **10 m** minimum where either facade has windows | Regional derogation allowed under DPR 380/2001 Art. 2-bis — **check each region** |

---

## 3 — Context-data layer status (LOD / 3D)

| Layer | Source | LOD achievable | Licence gate | Status |
|---|---|---|---|---|
| Building footprints | Catasto WFS (planimetrie catastali) — indicative only, not survey-grade | LOD0/LOD1 | CC BY 4.0 | Not live-probed |
| Building height | ARPA Piemonte Edifici 3D (Piedmont only) — derived from BDTRE + terrain | LOD1 with height | Regional CC | Not live-probed |
| Terrain (DTM/DSM) | PST/SIM — MASE open data | Raster (not building model) | CC BY 4.0 | Not live-probed |
| Roads / pedestrian | OpenStreetMap or regional topographic DBs | Object-level | ODbL / per-region | Not live-probed |
| Parks / green | Regional topographic DBs / OSM | Object-level | per-region / ODbL | Not live-probed |
| Water | Regional topographic DBs / OSM | Object-level | per-region / ODbL | Not live-probed |

---

## 4 — Overlay risk

| Overlay | Visibility in available layers | Risk |
|---|---|---|
| **SITAP** (landscape constraints) | Queryable via SITAP web-GIS — but explicitly incomplete and informational only | **HIGH** — a null result does not certify absence |
| **Vincoli in Rete** (listed buildings + archaeology) | Queryable separately | **HIGH** — same incompleteness caveat |
| **Piani esecutivi / strumenti attuativi** (site-specific executive plans — the §34/Pla Parcial equivalent) | Partial coverage in regional geoportals; not standardised | **VERY HIGH** — whether a numeric envelope can be read directly or whether a secondary plan must first exist is parcel-by-parcel (Rome is clearest case) |
| **Regional derogations to DM 1444 Art. 9** | Not exposed as a queryable layer | **HIGH** — the national 10 m distance floor may not be operative in any given region |
| **Autonomous Province regimes** (Trento, Bolzano) | Separate cadastral + planning systems entirely | **HIGH** — not covered by national Catasto WFS at all |

---

## 5 — Municipality coverage

| Municipality | ISTAT | Region | ISO 3166-2 | Regional instrument | Zoning mechanism | Pack status | Dev-days est. |
|---|---|---|---|---|---|---|---|
| **Turin** (Torino) | 001272 | Piedmont | `it-pie` | PRG | DM 1444 zone letters (assumed; unconfirmed) | NOT STARTED | ~10–15 (contingent on NTA confirmation) |
| **Milan** (Milano) | 015146 | Lombardy | `it-lom` | PGT (L.R. 12/2005) | Territorial index + perequation (no zone-letter table) | NOT STARTED | ~20–25 (new engine kind) |
| **Rome** (Roma) | 058091 | Lazio | `it-laz` | PRG (Roma Capitale 2008) | Tessuto typology + direct/indirect intervention split | NOT STARTED | ~25–30 (new engine kind) |

**Recommended sequencing:** Turin → Milan → Rome, mirroring Hamburg→Munich→Berlin:
start with the most defensible mechanism (if confirmed), then the new-kind cities.

---

## 6 — Files in this folder

```
it/
├── README.md                           ← this file (country umbrella)
├── NEXT.md                             ← blockers, trip-wires, resume steps
├── RATE.md                             ← data readiness rate
├── sources/
│   ├── SOURCES.md                      ← per-field national data source citations
│   └── VERIFICATION.md                 ← human sign-off (open)
├── findings/
│   └── ITALY-MASTER-DATA-SOURCE-STUDY.md  ← full source/legal-mechanism study
├── topics/
│   └── buildings-lod-height.md
├── regions/
│   └── README.md                       ← Italy requires per-region routing (21 jurisdictions)
├── it-pie/
│   └── 001272-turin/                   ← Turin / Piedmont (PRG, Tier 1 candidate)
├── it-lom/
│   └── 015146-milan/                   ← Milan / Lombardy (PGT, Tier 2)
└── it-laz/
    └── 058091-rome/                    ← Rome / Lazio (PRG 2008, Tier 2)
```

---

## 7 — Open questions / unverified

> Research notes that cannot yet be cited go HERE — never in `SOURCES.md`.

- **AP Bolzano NewPlan — highest-priority unverified lead (NEW):** South Tyrol's NewPlan is described as a unified planning + landscape-constraint GIS system with OGC services, CC0, and open since 2007. If confirmed public + parcel-queryable via WFS, Bolzano may score closer to Denmark than to Italy's national average — this would overturn "Italy is structurally the worst-performing country studied" for at least one jurisdiction. Requires: (1) direct live probe of NewPlan WFS endpoint; (2) confirmation of parcel-level zoning attribute queryability; (3) licence confirmation specifically for the planning layer vs. base cartography; (4) check whether NewPlan is GIS-browser-only or has a programmable endpoint. **Do not finalise any Italy tier list before this probe.**
- **Turin PRG NTA primary text AND incoming revision text (UPDATED — moving target):** the Tier 1 classification for Turin rests on the assumption that the current Torino PRG NTA uses DM 1444-style zone letters. **Additional caveat since initial study:** Turin's PRG is being actively rewritten in 2026 — "regime di salvaguardia" is in effect following adoption of the preliminary revision (DCC 123, March 16, 2026). The new plan is reportedly being condensed from 260 to ~80 pages. Any dev-day estimate must check whether the *incoming* plan keeps the zone-letter scheme, not just the outgoing one. This could go either direction.
- **APAR/SITAP WFS public access:** SITAP re-engineered as APAR/SITAP with genuine OGC WMS/WFS (confirmed in guida v2.0.0 documentation). Whether the endpoint behind `sitap.cultura.gov.it` requires MiBACT-affiliated authentication or is openly accessible needs a direct live probe. Structured access ≠ public access.
- **Lombardy Indagine Offerta PGT schema (NEW):** region-wide free structured dataset with SLP floor-area figures by comune (residential vs. other). The schema, granularity (per comune or per transformation area), and whether it can produce anything parcel-adjacent need direct probe. Most promising concrete lead for raising indice di fabbricabilità above 0% for Lombardy.
- **Catasto WFS field schema and authentication:** the Agenzia delle Entrate WFS endpoint has been confirmed at research level but not live-probed in this pass. Field names, GetFeature response schema, and whether authentication is required for bbox queries need direct confirmation.
- **Lombardy Geoportale PGT WFS queryability:** Lombardy hosts the PGT archive for every Lombard comune; whether this is queryable as a WFS (returning zone polygons per parcel) or only as a map service with PDFs needs direct probe.
- **ARPA Piemonte Edifici 3D licence and field schema:** confirmed to exist and be regionally licensed; the exact WFS/download endpoint, field names, and whether `mean_elevation` translates reliably to usable building height for Turin specifically needs a live probe.
- **Catasto bulk download format (Feb 2025 release):** whether the 2025 bulk open-data release includes parcel geometry in a format directly ingestible (GeoJSON, GeoPackage, Shapefile) without the WFS overhead.
- **Regional derogation laws for DM 1444 Art. 9:** each of the 21 regional/provincial instruments potentially modifies the 10 m building-distance floor. Confirming which regions have active derogation regimes before shipping any distance-related rule is required.
- **Palermo shapefile currency (NEW):** Palermo's CC BY 4.0 zoning shapefile is confirmed but dated to a 2004 council resolution (presa d'atto N.07/2004). Currency check against subsequent varianti required before use — same discipline as Piedmont mosaic currency caveat.
- **Emilia-Romagna zoning layer status (NEW):** confirmed full OGC stack; whether the zoning layer specifically (vs. topography/geology) is exposed as a WFS needs a direct capabilities check before assuming it extends the zone-identification score.
- **OpenBuildingMap vs. surveyed height (NEW):** OpenBuildingMap height is modeled from satellite-derived built-up layers — materially lower confidence than ARPA Piedmont's BDTRE-derived figures. Before using as a fallback, test against a known-surveyed reference (e.g., Piedmont ARPA data) to establish divergence.
