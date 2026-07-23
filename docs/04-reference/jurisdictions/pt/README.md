# Portugal (`pt`) — Jurisdiction Overview

**Level:** country · **ISO 3166-1:** `PT` · **Join key:** DICOFRE (Divisão Administrativa — 4-digit district+município code; 6-digit includes parish) · **Subdivision law:** Districts (ISO 3166-2 `pt-<01..18>`); used as routing folders only — Portuguese zoning law is national→municipal (no regional intermediate) · **Last updated:** 2026-07-23 · **Maintainer:** UNASSIGNED · **Status:** RESEARCH COMPLETE — legal structure fully characterised; cadastral-regime confirmation gates every city; no rule pack implemented

> **This file is the country-level umbrella.** Municipality-level packs live under
> `pt/<pt-##>/<DICOFRE>-<slug>/`. The national legal structure and national data sources are fully
> characterised in this file and in `findings/PORTUGAL-MASTER-DATA-SOURCE-STUDY.md`. That study
> is the Portugal analogue of `de/findings/GERMANY-MASTER-DATA-SOURCE-STUDY.md` and
> `fr/findings/FRANCE-MASTER-DATA-SOURCE-STUDY.md` — same method, same rigour.

---

## 1 — What governs here (national structure)

### 1.1 Legal hierarchy

```
Constituição da República Portuguesa
  → Lei n.º 31/2014 (Lei de Bases Gerais da Política Pública de Solos, Ordenamento do Território e Urbanismo)
      → RJIGT — Regime Jurídico dos Instrumentos de Gestão Territorial
          (Decreto-Lei n.º 80/2015, as amended — the main IGT framework statute)
          → PDM (Plano Diretor Municipal) — operative for all ~308 municípios — the primary instrument
          → PU (Plano de Urbanização) — sector-level detail overlay
          → PP (Plano de Pormenor) — plot-level detail overlay; PP/PPI most binding where it exists
          → Intermunicipal variants: PDI / PUI / PPI
      → DR 15/2015 (Decreto Regulamentar n.º 15/2015)
          — national criteria for solo classification (urbano / rústico) and qualification categories
          — MANDATORY taxonomy for every PDM; category names differ per PDM, criteria do not
      → RJUE — Regime Jurídico da Urbanização e Edificação
          (Decreto-Lei n.º 555/99, most recently reformed by DL 10/2024 + 2026 revision in train)
          — governs licensing procedure (comunicação prévia vs licenciamento prévio)
          — the licensing-track split is itself a signal: "no precise parameters" → full licensing
  → RGEU (Regulamento Geral das Edificações Urbanas, 1951, partially in force)
      — nationwide habitability minimums (room dimensions, ventilation, natural light)
      — NOT a geometric setback formula (unlike Germany's LBO Abstandsflächen)
  → Lei n.º 107/2001 + DL n.º 309/2009 — heritage classification; ZGP/ZEP protection zones
      — administered nationally by DGPC (Direção-Geral do Património Cultural)
  → DL n.º 72/2023 — unified "cadastro predial" regime (operative 21 Nov 2023)
      — unifies CGPR and SiNErGIC into one "cadastro predial" with NIC identifier per prédio
```

**Portugal's central structural difference from Spain and Germany:** the issue is not which numeric
mechanism (BauNVO §17 ceilings / BauGB regime classifier for Germany; PLU zone codes for France) —
it is the **parcel geometry layer**, which in France and Germany is treated as the already-solved
precondition. In Portugal it is the **load-bearing open question**. Confirming the cadastral regime
for each candidate city (CGPR / SiNErGIC / no-cadastre) is the **prerequisite step**, not a
parallel task. No dev-day estimate for any Portuguese city can be given until this is confirmed.

### 1.2 The two zoning categories (DR 15/2015 — national, hard-coded everywhere)

Unlike France (each commune invents its own zone letters) or Germany (BauNVO provides the zone
taxonomy AND §17 numeric ceilings), Portugal's **DR 15/2015** provides a national taxonomy of zone
classes but **attaches no numeric ceilings to them**. The two top-level categories are:

| Category | Portuguese term | Character |
|---|---|---|
| **Urban land** | Solo urbano | Land inside municipal settlement boundaries; subdivided by each PDM into "categorias de espaço" (e.g. "Espaços residenciais", "Espaços centrais") |
| **Rural land** | Solo rústico | Everything outside settlement boundaries, plus environmental protection land |

**Post-2015 structural fact (hard-code this):** the prior intermediate category **"solo urbanizável"**
was **abolished nationwide** by the 2015 reform (implementing Lei 31/2014). Portuguese law now
recognises only **solo urbano** and **solo rústico**. An older PDM that still references
"solo urbanizável" is either still in the amendment process or uses the term with different meaning.
This is the Portuguese analogue of France's ALUR abolishing COS — a datable, nationwide, structural
fact that can be written as a constant.

**DR 15/2015 categorisation taxonomy (national, invariant across PDMs):**

| Solo urbano subcategory | Typical PDM label (varies) | Numeric rules? |
|---|---|---|
| Espaços urbanos consolidados | e.g. "Espaços centrais e residenciais consolidados" (Lisbon); "Espaços de atividade económica" | Set per PDM; índice de utilização + cércea in each PDM regulamento |
| Espaços urbanizáveis | "Espaços de expansão urbana" etc. | Set per PDM |
| Espaços de uso especial | Equipamentos, turismo, etc. | Set per PDM |

**No numeric DR 15/2015 ceiling** — not even the softer §17-BauNVO-style sanity bound Germany
offers. Portugal's national taxonomy stops at category names; all numeric parameters (índice,
cércea, afastamentos) are per-PDM. This is closer to France's position than Germany's.

### 1.3 The licensing-track split (RJUE) — Portugal's §34/RNU analogue

Portugal's analogue to Germany's §34 (unplanned interior) and France's RNU (no-plan fallback)
is **procedural, not a fallback rulebook**. Under RJUE (DL 555/99, reformed DL 10/2024):

- Where **precise urbanistic parameters exist** for a parcel → the **comunicação prévia** (lighter,
  shorter) track applies.
- Where **no precise parameters exist** (no covering PP/PU/PDM with numeric values) → the **full
  licenciamento prévio** track applies, with case-by-case municipal discretion.

**This is the Portugal analogue of Germany's §34 regime identification question** — but it gates the
*administrative procedure*, not a numeric rule. The correct engine output for a parcel in the
full-licensing zone is a reasoned refusal (no numeric envelope), not an estimate.

The RJUE reform (DL 10/2024) explicitly uses "áreas cujos parâmetros urbanísticos se encontrem
efetivamente definidos" as the positive trigger for comunicação prévia — meaning **Portuguese law
itself distinguishes "parameterised" from "not parameterised" land**, and this is a signal worth
probing per municipality before committing dev-days.

### 1.4 Working vocabulary (national terms, per-PDM values)

| Term | Closest analogue | Definition (per DR 15/2015 / most PDMs) |
|---|---|---|
| **Cércea** | Height (building eave) | Vertical dimension from average facade ground level to eave / parapet / terrace guard line, excluding accessories (chimneys, lift rooms, tanks). Some PDMs (notably Lisbon) use **"altura da edificação"** instead — a different measurement. Confirm per PDM. |
| **Índice de utilização** (also "índice de edificação") | FAR / plot ratio | Ratio of buildable area (área de edificação) to parcel/plan area. Definition of "área de edificação" (what counts toward it) is set per PDM — unlike Germany's §20 BauNVO, there is **no national formula**. Even the formula, not just the number, is per-PDM. |
| **Moda da cércea** | Fabric-derived height | The cércea value with the greatest linear extent along a given urban front — a height rule derived by surveying the existing built fabric, not a fixed table. Treat as a new `GeometricRule` kind (`fabricDerivedHeight`), NOT a config value on an existing rule. Found in Porto's PDMP. |
| **Afastamentos / Recuos** | Setbacks | Per PDM; no national formula (unlike Germany's Abstandsflächen). RGEU sets habitability minimums but NOT a height-proportional setback formula. |
| **Colmatação** | Infill | Construction on a parcel inside an "espaço de colmatação" (infill zone within otherwise-built fabric). Recurring category across multiple PDMs. Worth its own category treatment, analogous to Barcelona's clau-12 fabric-derived fallback. |
| **Créditos de construção** | Tradeable floor-area rights | Lisbon-specific: extra buildable area via rehabilitation, heritage restoration, or green-area transfer (Arts. 84/88/89 of Lisbon incentives regulation). No France/Germany analogue in this study. A card that ignores them will understate achievable floor area. |
| **ZGP** (Zona Geral de Proteção) | Generic protection zone | Automatic 50 m zone around any pending-classification heritage asset. |
| **ZEP** (Zona Especial de Proteção) | Heritage special zone | Variable-radius protection zone for classified assets; may include **ZNA** (zona non aedificandi) where no construction is permitted. Unlike France's flat 500 m ABF circle, ZEP extent varies by asset. |

---

## 2 — National data sources

### 2.1 Parcel geometry — the inverted finding (READ THIS FIRST)

⚠ **This is the single most important structural difference vs France and Germany:**

| Regime | Coverage | Character | Engine implication |
|---|---|---|---|
| **CGPR** (Cadastro Geométrico da Propriedade Rústica) | 127 municipalities (118 mainland + 9 autonomous regions) | Built for rural (rústico) parcels, predominantly south of the Tagus; only some urban parcels lacking independent legal standing | Even inside a "covered" município, the urban parcel you actually want may not be what CGPR was built to represent |
| **SiNErGIC / CPE** pilot | 7 municipalities: Loulé, Oliveira do Hospital, Paredes, Penafiel, São Brás de Alportel, Seia, Tavira | Modern pilot under the new unified regime | Best geometry confidence within this set |
| **No cadastro predial / BUPi** | 174 municipalities — the majority | BUPi (Balcão Único do Prédio) is citizen-submitted, voluntary graphic representation — NOT authoritative parcel geometry | Cannot be used as a parcel source; badge explicitly |

**The DL 72/2023 (21 Nov 2023) unified these two prior regimes** ("cadastro predial") under one
legal framework, but this is a legal unification, not a coverage extension — the ~134/174 split
persists physically until the remaining municipalities are surveyed.

**Access:**
- **SNIC** (Sistema Nacional de Informação Cadastral), operated by **DGT** (Direção-Geral do
  Território) as "Autoridade Nacional de Cadastro Predial".
- Per-parcel download as Shapefile / GeoPackage / DXF / GeoJSON; INSPIRE WMS/WFS via **SNIG**
  (Sistema Nacional de Informação Geográfica).
- Designated **EU High-Value Dataset** (Reg. 2023/138) → strong open-access mandate.
- OGC API status as of 2026: planned 2025 — verify live whether it is operational.
- Every prédio now carries a **NIC** (Número de Identificação do Prédio) — the national parcel id.

**Legal caveat (write this into every PT parcel's provenance):** cadastral data "constitute a
presumption of its real location, geometric configuration, and area for all legal purposes,
without prejudice to the right of rectification" (DL 72/2023 Art. X). This is a **rebuttable
presumption**, softer than France's PCI-Express polygons or Germany's ALKIS Flurstück. Carry this
as a standing caveat on all Portuguese parcel geometry.

**BUPi is NOT a parcel source.** This must be stated explicitly — BUPi is a rural/mixed ownership
registration initiative. It does not produce authoritative parcel geometry. Do not wire BUPi.

### 2.2 Zoning — SNIT (the GPU equivalent)

| Layer | Source | API | Licence | Confidence |
|---|---|---|---|---|
| PDM zoning maps + regulations | **SNIT** (Sistema Nacional de Informação Territorial), operated by DGT | `snit-mais.dgterritorio.gov.pt` — geoportal with every PDM since Jan 2008 | Open (INSPIRE) | `VERIFIED-LEAD` — not live-probed this session |
| PDM zone boundary polygons | SNIT WMS/WFS | SNIT geoportal | Open | `VERIFIED-LEAD` |
| PDM regulamento (numeric rules) | Per-município PDF | None (SNIT returns zone polygon + PDF link, NOT structured numeric data) | Per-município | NOT structurally queryable |

**SNIT vs GPU (France):** SNIT is Portugal's direct structural analogue of France's GPU. Like GPU,
it gives you the zone polygon and a link to the regulation PDF. **Unlike** GPU (which has 2 pilot
communes with structured SRU numeric data), SNIT has no structured numeric equivalent — the índice
and cércea values are entirely in the PDM's own regulamento PDF. The sourcing pattern for any
Portuguese city is: SNIT → zone polygon + PDF link → read the PDF for numbers.

### 2.3 LiDAR and building elevation — Portugal's strongest layer

**This is where Portugal is ahead of both France and Germany:**

| Layer | Source | Access | Coverage | Confidence |
|---|---|---|---|---|
| **DGT national LiDAR (PRR)** | DGT (Direção-Geral do Território) — PRR-funded campaign, flown Apr 2024 – Mar 2025 | `cdd.dgterritorio.gov.pt` ("Centro de Dados do Território"); QGIS "DGT CDD Downloader" plugin | **~90% continental** (NW gap, rolling completion as of mid-2025); full Madeira/Azores TBD | `VERIFIED-LEAD` — endpoints not live-probed this session |
| Classified LAZ point cloud | DGT CDD | See above | Same | `VERIFIED-LEAD` |
| DTM 50 cm GeoTIFF | DGT CDD | See above | Same | `VERIFIED-LEAD` |
| DSM 2 m GeoTIFF | DGT CDD | See above | Same | `VERIFIED-LEAD` |
| Licence | "sem qualquer tipo de restrição" — unrestricted for any use | — | — | `VERIFIED-LEAD` |

**Density:** 10 pts/m² average, classified (ground; low/medium/high vegetation; buildings/man-made;
water; noise; bridges; RGB + NIR per point).

**Comparison:** France's LiDAR HD was ~80% covered end-2025, targeting full national coverage
end-2026. Germany's LoD2-DE requires a per-Land licence for cross-Land use. **Portugal's is already
~90%+ covered, single national campaign, single free licence, no per-region gating** — a genuine
structural advantage to bank.

**Key difference vs Spain (important for the nDSM module):** Portugal has **no national
floor-count cross-check field** equivalent to Spain's Catastro `ALTURAS`. LiDAR height stands
alone in Portugal, at a lower confidence ceiling. The nDSM module (ES + FR + PT, L-511c / L-512b)
feeds the SAME module with different inputs — do NOT one-off it per country. PT height must carry
`height_confidence` flags acknowledging the missing second field.

**DGT has NOT published an RMSE-Z figure.** Do not quote PNOA parity. Request DGT's formal
accuracy specification before badging any confidence number.

### 2.4 Building footprints — BGE (INE)

| Layer | Source | Scale | Licence | Caveat |
|---|---|---|---|---|
| **Base Geográfica de Edifícios (BGE)** | INE (Instituto Nacional de Estatística) — census purposes | 1:10,000; national coverage mainland + Madeira/Azores | CC-BY-4.0 | Built for population/dwelling counting, NOT massing. Height/storey attribute **NOT confirmed** — must verify before assuming a `HAUTEUR`-equivalent field. Height from LiDAR nDSM, not BGE. |

### 2.5 Heritage overlays — DGPC (national, queryable)

| Layer | Source | Access | Confidence |
|---|---|---|---|
| ZGP / ZEP / ZNA layers | DGPC — "Atlas do Património Classificado" | DGPC geoportal (`patrimoniocultural.gov.pt`) — four distinct queryable layers: classified/pending assets, ZGP, ZEP, Restrições | `VERIFIED-LEAD` — not live-probed this session |
| Classified assets | Same | Same | `VERIFIED-LEAD` |

**Structural difference vs France:** ZGP is an automatic 50 m radius (not France's flat 500 m ABF
circle). ZEP is custom-radius per asset. Both are machine-queryable at the national level — closer
to France's SUP layer than to Barcelona's invisible Ciutat Vella catalogue.

### 2.6 Context data layers (3D)

| Layer | Source | LOD achievable | Licence gate | Status |
|---|---|---|---|---|
| Parcels | Carta Cadastral (SNIC, DGT) where covered (~134 munis) | LOD0 (polygon) | Open (HVD mandate) | NOT live-probed — see §2.1 |
| Building footprints | BGE (INE, CC-BY-4.0) + OSM/Overture baseline | LOD1 (footprint, no height) | CC-BY-4.0 | NOT live-probed |
| Building height | DGT LiDAR nDSM (`DSM−DTM`, 90th-pctile) | LOD1 (height-attributed footprint) | Unrestricted | NOT live-probed |
| Roof shape | DGT LiDAR → RANSAC reconstruction | LOD2 (after processing) | Unrestricted | Pipeline not written |
| Roads | OSM/Overture baseline; Lisbon: CML "Rede Viária" | Object-level | ODbL / CML (UNVERIFIED) | NOT live-probed |
| Trees | Lisbon: CML "Arvoredo" per-tree; elsewhere: DGT LiDAR CHM | Object-level (Lisbon) | CC-BY (Lisbon dados.gov.pt); DGT open | NOT live-probed; DGT class codes UNVERIFIED |
| Water | SNIRH + DGT hydrography via SNIG/INSPIRE | Object-level | Open (INSPIRE) | NOT live-probed |
| Parks | Lisbon: "jardins-parques-urbanos" municipal; elsewhere: COS/COSc | Object-level (Lisbon) | To be verified (Lisbon); Open (DGT) | NOT live-probed |

**Lisbon municipal exception:** CML (Câmara Municipal de Lisboa) publishes the **"Modelo
Tridimensional da Ocupação Superficial do Concelho de Lisboa"** — a council-wide 3D model at
1:1,000 scale extruded over the municipal MDT, including balconies, setback faces, sidewalks,
tunnel entrances, and walls >0.5 m. This is closer to LOD2/3 than any single Spain municipal
source. **BLOCKER: open-redistribution licence at geodados-cml.hub.arcgis.com is UNVERIFIED.**
Do not integrate until the licence is confirmed.

---

## 3 — Overlay risk

| Overlay | Visibility in SNIT base query | Risk |
|---|---|---|
| **ZGP** (50 m pending-classification zone) | **NOT in PDM layer** — separate DGPC Atlas query | HIGH — triggers before classification is finalised; silently overstates buildability |
| **ZEP** (custom-radius classified heritage) | NOT in PDM layer — DGPC Atlas query | HIGH — may include ZNA (zero-build subzone); size is unpredictable |
| **Seismic-risk overlay** (Lisbon-specific) | Lisbon PDM environmental components | MEDIUM (Lisbon only) — a condicionante with no France/Germany parallel |
| **Créditos de construção** (Lisbon-specific) | NOT in any queryable layer — PDM regulamento Arts. 84/88/89 | MEDIUM (Lisbon only) — tradeable rights that raise achievable floor area above base PDM value; a card ignoring them UNDERSTATES |
| **RJUE "no precise instrument" trigger** | Inferred from absence of numeric parameters in PDM | HIGH — the §34/RNU equivalent; must be treated as a reasoned refusal (C58 §1.13), not a gap |

---

## 4 — Municipality coverage

| Municipality | DICOFRE (approx) | District | ISO 3166-2 | PDM | Unique risk | Pack status | Dev-days est. |
|---|---|---|---|---|---|---|---|
| **Lisboa** | 1106 (verify) | Lisboa | `pt-11` | In force since 2012 (published 2012-08-30, DR 2.ª série n.º 168) — ongoing revision | Cadastral-regime **unconfirmed**; créditos de construção; seismic overlay | NOT STARTED | Cannot estimate — cadastral gate not resolved |
| **Porto** | 1315 (verify) | Porto | `pt-13` | Aviso n.º 12773/2021 (8 Jul 2021), updated since | Cadastral-regime **unconfirmed**; moda da cércea (new rule kind); UNESCO World Heritage ZEP overlay | NOT STARTED | Cannot estimate — cadastral gate not resolved |
| **Braga** | 0303 (verify) | Braga | `pt-03` | In force; SNIT-listed; already partially sourced: índice de utilização máximo 1.20 (0.80 above cota de soleira), cércea máxima 7.5 m for "espaços residenciais" | Cadastral-regime **unconfirmed** but likely lower risk | NOT STARTED | ~8–12 if cadastral confirmed |

**Recommended sequencing:** Braga → Porto → Lisboa, mirroring Barcelona's `13a`→`13b` principle —
start with the city where numeric PDM values are already partially sourced AND the cadastral regime
is most likely to be resolved quickly (mid-size municipalities trend better than the two largest
cities on both counts).

---

## 5 — Files in this folder

```
pt/
├── README.md                               ← this file (country umbrella; legal + data sources)
├── NEXT.md                                 ← blockers, trip-wires, resume steps
├── sources/
│   ├── SOURCES.md                          ← per-field national data source citations
│   └── VERIFICATION.md                     ← human sign-off (open)
├── findings/
│   └── PORTUGAL-MASTER-DATA-SOURCE-STUDY.md  ← full legal + source mechanism study
├── topics/
│   ├── buildings-lod-height.md             ← existing context-data spike (3D)
│   ├── parks-trees.md
│   ├── roads-pedestrian.md
│   └── water.md
├── regions/
│   └── README.md                           ← routing note: districts used as DICOFRE organisers only
├── pt-11/ (Lisboa district)
│   └── 1106-lisboa/                        ← Lisboa municipality
├── pt-13/ (Porto district)
│   └── 1315-porto/                         ← Porto municipality
└── pt-03/ (Braga district)
    └── 0303-braga/                         ← Braga municipality
```

**Pre-existing files preserved:**
- `PORTUGAL-CONTEXT-DEEP-DIVE.md` — the original 3D context-data deep-dive (L-514); findings
  incorporated into `findings/PORTUGAL-MASTER-DATA-SOURCE-STUDY.md` §A.6 and topics files.
  Keep for traceability; do not delete.

---

## 6 — Open questions / unverified

> Research notes that cannot yet be cited go HERE — never in `SOURCES.md`.

- **Cadastral-regime confirmation per city (the #1 open item for every Portuguese city):** are
  Lisboa and Porto parcels inside CGPR, SiNErGIC, or no-cadastre coverage? This must be verified
  directly against DGT/SNIC before any Lisboa or Porto dev-day estimate. Braga should also be
  checked, though mid-size municipalities are more likely to have CGPR coverage.
- **SNIT WFS field names and structured-data completeness:** does the SNIT WFS return zone
  polygon + an attribute for PDM categoria de espaço, or only a reference to the PDF? A GetCapabilities
  + GetFeature probe is required before designing any SNIT ingestion pipeline.
- **DGT LiDAR class-code mapping vs ASPRS:** DGT classifies: ground, low/medium/high vegetation,
  buildings/man-made, water, noise, bridges. Confirm the exact integer class codes match the ASPRS
  scheme (or document the delta) before wiring the nDSM / CHM extraction.
- **DGT LiDAR RMSE-Z:** DGT has published no vertical accuracy specification. Do not quote PNOA
  parity. Request DGT's formal RMSE-Z before assigning any confidence tier to height data.
- **Carta Cadastral OGC API status:** planned for 2025 — verify whether it is live and what
  formats are actually available.
- **Lisbon CML 3D model licence (open redistribution?):** at geodados-cml.hub.arcgis.com — do not
  assume redistributable inside PRYZM without a direct licence check. This is a hard blocker for
  the Lisbon municipal special-case.
- **Infraestruturas de Portugal (IP) national road network — open-data status:** unconfirmed.
- **Índice de utilização formula per PDM:** unlike Germany's §20 BauNVO (national formula for
  Geschossfläche), Portugal's "área de edificação" definition is set per PDM. Even the formula
  (what counts), not just the number, is per-PDM sourcing work. Flag this in every pack.
- **Moda da cércea as a new GeometricRule kind:** Porto's PDMP defines a fabric-derived height rule
  that is numeric but context-derived (the cércea value with greatest linear extent on the urban
  front). This is not a config value on an existing rule — it requires a new kind in C58 §2.2's
  geometricRule taxonomy. A C58 amendment decision is required before authoring any Porto pack.
- **RJUE §34 fraction equivalent (RJUE procedure map):** what fraction of each city's land falls
  into the "no precise parameters" full-licensing category? Unlike Germany (public §34 coverage
  maps via XPlanung absence), Portugal has no equivalent public layer — this must be inferred from
  the PDM's own regulamento coverage or probed via SNIT.
