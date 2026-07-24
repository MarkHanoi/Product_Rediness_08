# Belgium (`be`) — Jurisdiction Overview

**Level:** country · **ISO 3166-1:** `BE` · **Join key:** NIS/INS code (6-digit municipality code) ·
**Subdivision law:** Regions (ISO 3166-2: `BE-BRU` Brussels-Capital, `BE-VLG` Flanders, `BE-WAL` Wallonia) ·
**Last updated:** 2026-07-24 · **Maintainer:** UNASSIGNED · **Status:** RESEARCH COMPLETE — implementation pipeline ready

> **This file is the country-level umbrella.** Municipality-level packs live under
> `be/<region-iso>/<slug>/`. The national legal structure and regional data sources are fully
> characterised; no rule pack is implemented yet.

> ⚠ **READ THIS FIRST.** Belgium is constitutionally NOT one country study — it is three independent
> legal-system integrations wearing one country's name. Spatial planning was devolved to the three
> Regions as an **exclusive** competence by the special laws of 8 August 1980 (Flanders/Wallonia)
> and 12 January 1989 (Brussels-Capital). There is no Belgian BauNVO, no Belgian GPU, no Belgian
> PDM-equivalent decree. Treat "Belgium" as three unrelated national studies bolted together, with
> one shared federal layer (the cadastre). See PART A of `findings/BELGIUM-MASTER-DATA-SOURCE-STUDY.md`.

---

## 1 — What governs here (national structure)

### 1.1 The one federal layer: cadastre (AGDP/AAPD)

```
SPF Finances / FOD Financiën
  → AGDP/AAPD (Administration générale de la Documentation patrimoniale)
    → CadGIS / CADMAP — single national parcel dataset
      → WFS: https://ccff02.minfin.fgov.be/geoservices/arcgis/rest/services/INSPIRE/CP/MapServer/
              exts/InspireFeatureDownload/service
      → ATOM feed: https://opendata.fin.belgium.be/download/ATOM/
                   tt098dcb-f5c7-49b8-8e0b-7c3811630d85-en.xml
      ✅ VERIFIED LIVE 2026-07-24 — HTTP 200, application/xml
      Licence: CC-equivalent open-data (French/Dutch), no key required
```

The CADMAP dataset includes: cadastral units, divisions, sections, blocks, cadastral plan parcels,
**and** building sublayers ("buildings managed by AGDP" and "buildings managed by the regions").
**This is the mirror image of Germany's pattern** — in Germany the zone taxonomy (BauNVO) is federal
and the cadastre is per-Land; in Belgium the cadastre is federal and everything else (zoning,
height, setbacks, heritage, LiDAR) is per-Region.

**The cadastre is the single genuine cross-region efficiency** — build the CadGIS/CADMAP ingestion
once; it serves all three regions' parcels identically.

---

### 1.2 The three regional planning codes — a constitutional fork, not a config difference

| Region | Code | Current form | Regional zoning instrument | Regional building-envelope instrument |
|---|---|---|---|---|
| **Flanders** | **VCRO** (Vlaamse Codex Ruimtelijke Ordening) | Codified 2009; "Codextrein" 2017 and further amendments | **Gewestplannen** (1970s–80s royal-decree land-use plans) increasingly superseded by **RUPs** (ruimtelijke uitvoeringsplannen — regional/provincial/municipal) | No single regional building-code text; envelope rules inside each RUP's **stedenbouwkundige voorschriften**, tested against **goede ruimtelijke ordening** (VCRO Art. 4.3.1) |
| **Wallonia** | **CoDT** (Code du Développement Territorial), successor to **CWATU** | CWATU 1984 → CoDT 2016, most recently reformed May 2025 | **23 plans de secteur**, adopted 1977–1987, full regional coverage, still legally binding | **Guide régional d'urbanisme (GRU)** — largely indicative, not binding; envelope compatibility tested against **bon aménagement des lieux** (CoDT Art. D.IV.13) |
| **Brussels-Capital** | **CoBAT** (Code Bruxellois de l'Aménagement du Territoire) | Arrêté 9 April 2004; reformed by ordonnance 30 November 2017 | **PRAS** (Plan Régional d'Affectation du Sol) — region-wide land-use plan | **RRU** (Règlement Régional d'Urbanisme) — 7 Titres, region-wide numeric-ish baseline; overridable by **PPAS**, **RRUZ**, or **PAD** |

**Why this is worse than Germany's Länder split:** Germany's 16 Länder each write their own LBO,
but all implement one shared BauNVO zone taxonomy and one shared XPlanGML exchange schema. Belgium's
three regions share no zone taxonomy, no numeric-envelope mechanism, and no exchange schema — the
three codes were drafted independently after devolution in 1980/1989 and carry no cross-reference
to one another.

---

### 1.3 The pervasive discretionary layer — the single biggest Belgian structural finding

In all three regions, the operative test for whether a specific building envelope is permittable is
**a mandatory discretionary compatibility judgment**, not a numeric lookup. This test survives under
a different name per region:

| Region | Test name | Governing article | Scope |
|---|---|---|---|
| **Flanders** | *goede ruimtelijke ordening* | VCRO Art. 4.3.1 | Applies to **every permit**, including ones inside a fully adopted RUP with numeric provisions; a clear numeric RUP provision settles it, but some RUPs explicitly declare a parameter "vrij" (free) |
| **Wallonia** | *bon aménagement des lieux* | CoDT Art. D.IV.13 | Close to the load-bearing mechanism for most envelope questions; the plan de secteur supplies only broad affectation, not height/FAR |
| **Brussels** | *bon aménagement des lieux* | CoBAT / RRU practice | Derogation-justification standard from the RRU Titre I baseline; Brussels is the one region with a numeric text to derogate *from* |

**Unlike Germany's §34** (which applies only where no B-Plan exists), **this test is layered on top
of every permit in all three regions**, including inside fully zoned, numerically-specified plans.
Belgium leans further toward "engineer must reason about context" than any of France, Germany, or
Portugal.

**Flemish-specific statutory trap — VCRO Art. 7.4.2/2 ("clichering"):** percentage-based objectives
and provisions in RUPs adopted after 1 September 2009 must be treated as non-existent by the
permitting authority. This is a **blanket statutory nullification** of an entire category of numeric
plan provisions. Any Flemish card sourcing a percentage-based RUP provision must check Art. 7.4.2/2
applicability before shipping it as a live value.

---

### 1.4 Height / gabarit mechanisms per region

| Region | Numeric-ish baseline? | Instrument | Coverage | API attribute? |
|---|---|---|---|---|
| **Brussels** | **Yes** — closest to a numeric text | RRU Titre I ("Caractéristiques des constructions et de leurs abords") — context-relative formulas (e.g. H = P + 3.00 + D) | Region-wide default; overridable by RRUZ or PPAS | ❌ Prose formulas in PDF, not a queryable attribute |
| **Flanders** | **No** regional baseline | Each RUP's *stedenbouwkundige voorschriften* — where a height ceiling is stated at all | Per-RUP zone; many RUPs leave height "vrij" | ❌ Linked as text/PDF from DSI plan-element geometry; no numeric attribute confirmed |
| **Wallonia** | **No** regional baseline | Plan de secteur carries only broad affectation; GRU is indicative | Plan de secteur: 100% coverage since 1977–1987 | ❌ No height dimension in plan de secteur layer; GRU is PDF-only |

**The key finding:** Brussels is the **only** region with something resembling a region-wide gabarit
code. Flanders and Wallonia route most real envelope questions through the discretionary test.

---

### 1.5 Setbacks

No Belgium-wide setback formula exists (unlike Germany's height-proportional Abstandsflächen
concept). Per region:

- **Brussels (RRU Titre I):** "implantation" and "profondeur de bâti" treated explicitly — but as
  context-relative prose formulas (H = P + 3.00 + D), not a queryable API field.
- **Wallonia:** folded into the bon-aménagement-des-lieux discretionary judgment.
- **Flanders:** set per-zone inside each RUP's voorschriften, where stated at all.

Treat as a recurring category, not a recurring formula. Each region requires its own kind.

---

### 1.6 No provision-code semantic catalogue (the single starkest gap vs. Sweden)

No Belgian region publishes anything resembling Sweden's Planbestämmelsekatalog — a machine-readable
catalogue mapping plan-provision codes to numeric meaning. This is the structural fact that caps
Belgium's data-readiness rate below Sweden's and Germany's Stufe-2 aspiration. Raising Belgium's
rate durably would require a **policy change**, not just better data engineering against what already
exists.

---

## 2 — National data sources

### 2.1 Parcel geometry — CADMAP/CadGIS (federal)

| Layer | Source | Access | Licence | Confidence |
|---|---|---|---|---|
| Parcel geometry + building sublayers | CADMAP, maintained by AGDP/SPF Finances | **Single national WFS** — `ccff02.minfin.fgov.be/geoservices/arcgis/rest/services/INSPIRE/CP/` | CC-equivalent open-data; no key | `VERIFIED LIVE` — 2026-07-24, HTTP 200 |

⚠ The CadGIS/WFS layer is a visualization/bulk-geometry product, not the certified legal extract.
An official cadastral-plan extract costs €11 and a cadastral-matrix extract €5.50 — the "presumption
vs. certified extract" distinction already flagged for Portugal.

The CADMAP building sublayer ("buildings managed by AGDP") may carry a height or storey-count
attribute — **not yet probed**. Confirm before assuming only footprint geometry is present; if it
exists, this is a free, nationally-consistent building-height source unlike anything in Germany's
per-Land landscape.

### 2.2 Zoning / plan layers — three independent regional systems

| Region | Instrument | Endpoint | Status |
|---|---|---|---|
| **Wallonia** | Plan de secteur (`LU.ZoningElement_pds`) + RUP-equivalent layers | WMS: `geoservices.wallonie.be/geoserver/inspire_lu/ows` · OGC API Features: `…/ogc/features/v1/openapi` | ✅ **VERIFIED LIVE** 2026-07-24 — HTTP 200, full capabilities; CRS: EPSG:31370, 4326, 3857; free, no key |
| **Brussels** | PRAS (`PERSPECTIVE_FR:Affectations`) | GeoServer: `gis.urban.brussels/geoserver/PERSPECTIVE_FR/ows` | ⚠ Bot-blocked on direct fetch; confirmed via third-party aggregator cache (wfs.michelstuyts.be) |
| **Flanders** | Gewestplan + RUP (DSI namespace: `lu:lu_gewrup_*`, `lu:lu_prorup_*`, `lu:lu_si_gv`, `lu:lu_hov_*`) | `geoservices.informatievlaanderen.be/overdrachtdiensten/GRB/wfs` | ⚠ Robots.txt-blocked on direct fetch; confirmed free ("kosteloos") via search-engine cache of capabilities |

⚠ **Wallonia** is Belgium's strongest confirmed zoning endpoint — fully open, modern (OGC API
Features + WMS), not geo-blocked. Its layers are affectation/boundary-only; no height, FAR, or
gabarit attribute confirmed anywhere in the capabilities document.

### 2.3 Heritage overlays — three agencies, three registers

| Region | Agency | Endpoint | Status |
|---|---|---|---|
| **Flanders** | Onroerend Erfgoed | `geo.onroerenderfgoed.be/geoserver/wfs` | ✅ **VERIFIED LIVE** 2026-07-24 — HTTP 200; layers: `bes_monument`, `bes_sd_gezicht`, `bes_arch_site`, `bes_landschap`, `bes_overgangszone`; no credentials |
| **Wallonia** | AWaP (Agence wallonne du Patrimoine) | SPW Géoportail — biens classés et zones de protection | ✅ Confirmed (stated) — CC-BY 4.0; not independently re-fetched this pass |
| **Brussels** | Direction du Patrimoine culturel / urban.brussels | GIS layer on urban.brussels (exact URL unconfirmed) | ❔ Register confirmed; queryable geographic layer not independently confirmed live |

No cross-region register or shared geoportal. Three separate agencies, three separate ingestion
pipelines. Analogous to Germany's per-Land Denkmalschutz fragmentation, but without even a shared
federal vocabulary.

### 2.4 Buildings, elevation, and LiDAR — three separate base-mapping systems

| Region | Base topographic layer | LiDAR programme | Status |
|---|---|---|---|
| **Flanders** | GRB (Grootschalig Referentiebestand); `3D GRB — Gebouw LOD1` = block model with reference height from DHMV | DHMV I → DHMV II (Informatie Vlaanderen/AGIV); ~8 pts/m² per strip, ~16 pts/m² average | DHMV II full-coverage successor to DHMV I (which had gaps in 13 named centrumsteden); GRB WFS "kosteloos" confirmed via cache |
| **Wallonia** | PICC (Projet Informatique de Cartographie Continue) | Own LiDAR-derived terrain products via SPW Géoportail de Wallonie | ❔ Not confirmed as unified product comparable to DHMV in this pass — density/coverage not probed |
| **Brussels** | UrbIS (`geoservices-urbis.irisnet.be`) | No standalone Brussels LiDAR programme identified | ❔ Brussels may rely on point acquisitions per study, not a standing programme |

Belgium's three regional building/LiDAR systems are **not the same schema** — GRB/DHMV, PICC, and
UrbIS are independently specified. A cross-region building-geometry pipeline is three separate
ingestion problems, not one ingestion problem with three access points.

**DHMV I gap list (Flanders):** Dendermonde, Diest, Hasselt, Hoboken, Ieper, Kortrijk, Oudenaarde,
Ronse, Sint-Truiden, Tienen, Waregem, Riemst, Tongeren — no 3D-GRB building entities for these
under DHMV I; DHMV II is full-coverage.

### 2.5 Massing / capacity metrics — Brussels-specific additions

Brussels contributes two gating constraints not found in the other three countries studied:

- **CBS+ (Coefficient de Biotope par Surface):** ecological potential indicator; ratio of weighted
  surfaces to total site area. A structured GIS layer exists in Brussels; not a height/FAR metric
  but can gate whether a massing scenario is permittable.
- **TOTEM life-cycle comparison:** required for demolitions of buildings over 1,000 m² floor area
  (comparing life-cycle impact of renovation vs. demolition/rebuild). Not a massing metric directly,
  but a gate on demolition/rebuild scenarios in Brussels.

---

## 3 — Context-data layer status (LOD / 3D)

| Layer | Source | LOD achievable | Licence | Status |
|---|---|---|---|---|
| Building footprints (federal) | CADMAP AGDP building sublayer | LOD1 | CC-equivalent open | ✅ Footprint confirmed in WFS capabilities; height attribute not yet probed |
| Building footprints — Flanders | GRB WFS (`informatievlaanderen.be`) | LOD1 | Free ("kosteloos") | ⚠ Confirmed via cache; direct fetch robots-blocked |
| Building height (LOD1 block model) — Flanders | `3D GRB — Gebouw LOD1 DHMV II` | LOD1 | Free | ⚠ Confirmed by name and method; DHMV-I-era gaps in 13 cities |
| Building footprints — Wallonia | PICC (SPW Géoportail) | LOD1 | TBD | ❔ Existence confirmed via aggregator; not independently probed |
| Building footprints — Brussels | UrbIS WMS/WFS | LOD1 | TBD | ❔ Service confirmed; live probe not run |
| LOD2 buildings | None confirmed nationally | LOD2 — **NOT AVAILABLE** | — | ❌ Flanders has LOD1 block model only; no LOD2 confirmed anywhere; Wallonia/Brussels unconfirmed |
| Terrain / LiDAR — Flanders | DHMV II (Informatie Vlaanderen) | DTM/DSM | Free | ⚠ Full coverage in DHMV II; DHMV-I-era gaps for 13 centrumsteden |
| Terrain / LiDAR — Wallonia | SPW Géoportail terrain products | DTM/DSM | TBD | ❔ Not independently confirmed in this pass |
| Terrain / LiDAR — Brussels | Unknown standing programme | DTM/DSM | — | ❌ Not identified in this pass |

**Belgium vs France/Germany comparison:** France has a single national dataset (IGN) with open
licensing; Germany has 16 Land-operated systems sharing one schema (CityGML LoD2-DE) with
heterogeneous licensing; Belgium has three regional systems sharing **no schema at all** — GRB,
PICC, and UrbIS are independently specified products.

---

## 4 — Overlay risk

| Overlay | Queryable? | Risk |
|---|---|---|
| **Discretionary test (goede ruimtelijke ordening / bon aménagement des lieux)** | **NOT QUERYABLE** — by design | **VERY HIGH** — applies to every permit in all three regions; a sourced numeric value is legally subordinate to this test in Flanders and Wallonia; any card must carry an explicit caveat |
| **VCRO Art. 7.4.2/2 "clichering" (Flanders)** | Partially — `lu:lu_hov_*` layer tracks nullified provisions | **HIGH (Flanders-specific)** — a whole class of post-2009 percentage-based RUP figures may be statutorily void regardless of plan text |
| **RRUZ / PPAS / PAD override (Brussels)** | Partially (PPAS/RRUZ as separate layers) | **HIGH (Brussels)** — RRU Titre I is a regional default; local plans override it for specific districts |
| **Heritage overlay** | Flanders: ✅ live; Wallonia: confirmed; Brussels: unconfirmed | **HIGH** — three separate agencies; no shared register |
| **Bot-detection (Brussels PRAS)** | ⚠ Origin server bot-blocks automated access | **MEDIUM (deployment engineering)** — not a geo-block; Belgian-IP deployment or alternative access path would resolve it |
| **Robots.txt (Flanders DSI/GRB)** | ⚠ `informatievlaanderen.be` robots-disallows direct fetch | **MEDIUM (deployment engineering)** — service is free and confirmed; access via alternative path TBD |

---

## 5 — Region coverage and recommended sequencing

| Region / City | Region ISO | NIS code | Pack status | Regime complexity | Dev-days est. |
|---|---|---|---|---|---|
| **Brussels-Capital** | `BE-BRU` | 21000 | NOT STARTED | MEDIUM — RRU gives one numeric-ish regional baseline; PRAS/RRU/RRUZ/PPAS precedence check + harmony test required | ~20–25 |
| **Flanders / Antwerp** | `BE-VLG` | 11002 | NOT STARTED | HIGH — gewestplan vs RUP determination; "clichering" check; "vrij" height frequent | ~25–30 |
| **Wallonia / Liège** | `BE-WAL` | 62063 | NOT STARTED | VERY HIGH — plan de secteur affectation only; bon-aménagement-des-lieux is load-bearing; GCU adoption unclear | ~30–35 |

**Recommended sequencing: Brussels → Antwerp → Liège.**

Brussels is the only region with a region-wide gabarit text (RRU Titre I) to anchor a first
`GeometricRule` kind against, despite its PRAS/RRU/RRUZ/PPAS precedence complexity. Flanders is the
second tier — numeric content exists but is RUP-by-RUP and frequently, by design, silent on the
exact question this engine answers. Wallonia is the third tier — base zoning is oldest (1977–1987)
and most dependent on the discretionary test as the practical answer to most envelope questions.

This mirrors the principle from Germany (Hamburg → Munich → Berlin) and Spain (simpler to most
complex): start with the most defensible case, not the most representative one.

---

## 6 — Files in this folder

```
be/
├── README.md                           ← this file (country umbrella)
├── RATE.md                             ← data readiness rate (~10–14% blended)
├── NEXT.md                             ← blockers, trip-wires, resume steps
├── sources/
│   ├── SOURCES.md                      ← per-field national data source citations
│   └── VERIFICATION.md                 ← human sign-off (open)
├── findings/
│   └── BELGIUM-MASTER-DATA-SOURCE-STUDY.md  ← full source/legal-mechanism study
├── topics/
│   ├── buildings-lod-height.md
│   ├── parks-trees.md
│   ├── roads-pedestrian.md
│   └── water.md
├── regions/
│   └── README.md                       ← Belgium requires region-level routing (3 regions)
├── be-bru/
│   └── bru-brussels/                   ← Brussels-Capital Region
├── be-vlg/
│   └── ant-antwerp/                    ← Antwerp (Flanders)
└── be-wal/
    └── lie-liege/                      ← Liège (Wallonia)
```

---

## 7 — Open questions / unverified

> Research notes that cannot yet be cited go HERE — never in `SOURCES.md`.

- **Federal CADMAP building sublayer height attribute:** the WFS capabilities confirm a building
  sublayer exists ("buildings managed by AGDP"), but whether it carries a height or storey-count
  attribute is unknown. One `GetFeature` call against the already-verified federal WFS would resolve
  this — if positive, it is a free, nationally-consistent building-height source.
- **Brussels PRAS live capabilities:** direct fetch is bot-blocked; cached capabilities confirm the
  `PERSPECTIVE_FR:Affectations` layer exists. Licence terms and current layer schema need
  independent confirmation via a Belgian-IP deployment or alternative access path.
- **Flanders DSI/GRB live capabilities:** robots.txt-blocked on direct fetch; cached capabilities
  confirm the service is free and detailed. Direct verification requires a workaround.
- **Wallonia LiDAR density/resolution parity with Flanders DHMV II:** referenced in SPW Géoportail
  catalogue metadata but not independently probed in this pass.
- **Brussels LiDAR programme:** no standalone Brussels LiDAR programme identified; UrbIS confirmed
  as base map, not as LiDAR product. Direct confirmation needed before any Brussels dev-day estimate.
- **Whether any RUP/PPAS/BPA plan feature anywhere in Belgium carries a populated numeric
  height/FAR/gabarit attribute via WFS GetFeature** (vs. only a hyperlink to a PDF voorschriften
  document) — not confirmed present, not exhaustively confirmed absent. The single GetFeature probe
  that would resolve this is the highest-value remaining research action.
- **Wallonia and Brussels building-footprint service parity with Flanders GRB:** PICC and UrbIS
  confirmed by name but not independently probed for field schema or licence terms.
