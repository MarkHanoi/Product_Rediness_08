# Belgium — Forensic Planning-Data Research (2026-07-31)

> **Status:** Founder forensic-research consolidation. Durable, browsable, DD-ready.
> **Scope:** Brussels-Capital Region + Wallonia (incl. Liège). Flanders is covered in the
> separate master study (`BELGIUM-MASTER-DATA-SOURCE-STUDY.md`).
> **Honesty convention:** every claim is tagged **[CONFIRMED]** (verified, or verified by a
> live probe on the stated date) or **[UNVERIFIED]** (asserted, needs live access to confirm).
> No numeric envelope value is fabricated. Where a value is genuinely absent it is recorded as
> `null` — never coerced to `0`.

---

## 1 — Executive summary

| Region | Character | Parcel source | Zoning backbone | Envelope numbers | Height source |
|---|---|---|---|---|---|
| **Brussels** | Multi-surface official ecosystem; legislation-rich | Federal CadGIS (via UrbIS combined product) | PRAS (CC0) | RRU Titre I depth **[CONFIRMED]**; FAR **absent** | UrbIS-3D (CityGML) geometry-derived |
| **Wallonia** | GIS-rich, legislation-poor (the inverse of Brussels) | Federal CadGIS | Plan de Secteur (PDS), CC-BY | CoDT **delegates** numbers to SOL/GCU instruments | LiDAR MNT 2021-22 50 cm |

**One-line takeaway:** Brussels gives you the *rules* (RRU Titre I is legally encodable for depth)
but the *geometry* must be composed; Wallonia gives you machine-readable *polygon→document linkage*
today (PDS→Wallex verified end-to-end) but the *envelope-rule extraction stays human-gated*.

---

## 2 — Brussels (Region)

### 2.1 It is NOT a single bot-blocked endpoint

The earlier "bot-blocked PRAS" observation was misleading: Brussels planning data is a
**multi-surface official ecosystem**, not one fragile endpoint. **[CONFIRMED — architecture]**

Canonical parcel source = the official **UrbIS "Parcels and buildings" COMBINED product**, which
fuses three federal/regional authorities:

- **Federal CadGIS** parcels
- **Paradigm** buildings
- **BeSt** addresses

Key stable identifiers carried through the combined product: **[CONFIRMED — schema intent]**

| Identifier | Meaning |
|---|---|
| `INSPIRE_ID` | Stable INSPIRE feature id |
| `CAPA_ID` / `CAPAKEY` | Parcel link (the pan-Belgian cadastral key) |
| `BL_ID` | Block id |

Access surfaces (in priority order):

1. **datastore.brussels** GeoPackage (primary bulk product)
2. **data.gov.be** mirror
3. **OGC API Features** (data.mobility.brussels)
4. **Opendatasoft** (opendata.brussels.be)
5. **GeoServer WFS** (fallback)

**Recommended architecture:** nightly GeoPackage → PostGIS sync, with **live WFS as fallback only**.
**[CONFIRMED — recommendation]**

### 2.2 Height is not in base UrbIS Buildings

Height is **not** an attribute of the base UrbIS Buildings layer. It lives in a separate product,
**UrbIS-3D (CityGML)**, which carries `RoofSurface` / `GroundSurface`: **[CONFIRMED — product split]**

```
height = maxRoofZ − minGroundZ
```

A **DSM** is a second, independent height source. A **reusable CityGML parser** works across
Brussels / Berlin / Hamburg / Netherlands — i.e. the parser is amortised across multiple
jurisdictions. **[CONFIRMED — reuse claim]**

### 2.3 Street width P is geometrically computable

Street-width **P** is **computable from geometry** — **[CONFIRMED — method]** — using UrbIS
**Street-Sections / StreetSurfaces / Sidewalk polygons**. It is:

- **NOT** a `largeur_rue` attribute (no such attribute is relied upon)
- **NOT** the transport-network centreline

### 2.4 PRAS — the zoning backbone

**PRAS** (Plan Régional d'Affectation du Sol) is officially catalogued, licensed **CC0**, and
multi-surface. **[CONFIRMED — catalogue + licence]**

- Layer: `brugis:PERSPECTIVE_FR:Affectation_du_sol`
- Planning is a **vector composition**: `PRAS + CBS+ + accessibility(A/B/C) + heritage +
  office-quota + PPAS + PAD`.

### 2.5 RRU Titre I — the legal core (honest)

The **RRU Titre I** (Règlement Régional d'Urbanisme) is the encodable legal instrument. Honest
per-article status:

| Article | Content | Status |
|---|---|---|
| **Art. 4 — DEPTH** | Depth ≤ **¾ of parcel depth** (measured **excluding** the front-setback, along the parcel median axis) + neighbour rules | **[CONFIRMED + encodable]** |
| Art. 4 neighbour rules | Both built: ≤ deeper profile; ≤ shallower **+3 m** unless ≥ 3 m lateral setback | **[CONFIRMED + built]** |
| **Art. 3 — implantation** | = **alignment** (an alignment, NOT a metric distance) | **[CONFIRMED]** |

**Critical honesty markers:**

- The **`H = P + 3 + D` height formula is [UNVERIFIED] from the official text.** Art. 4 governs
  **DEPTH, not height**. **Do NOT encode `H = P + 3 + D`.**
- **Height is geometry-derived** from UrbIS-3D — not read from RRU.
- **FAR is genuinely ABSENT** from the Brussels instrument set → encode as **`null`**, never `0`.
  **[CONFIRMED — absence]**

### 2.6 Remaining honest blockers (need live access)

These require a Belgian-IP / live-access pass to resolve — **[UNVERIFIED]**:

- PPAS / PAD / RRUZ **instrument-priority chain** (which instrument overrides which)
- **PRAS attribute schema** (field names, domains)
- **UrbIS-3D** field names / CRS / LoD
- **PPAS coverage fraction** (how much of the region is covered by a PPAS)

---

## 3 — Wallonia (incl. Liège)

### 3.1 Character: GIS-rich, legislation-poor

Wallonia is the **inverse of Brussels**: abundant, well-structured GIS; the numeric envelope rules
are dispersed into delegated municipal instruments. **[CONFIRMED — character]**

- **PARCEL** = federal **CadGIS** (same pan-Belgian source as Brussels).

### 3.2 Plan de Secteur (PDS) — the legally-binding backbone

**[CONFIRMED — source + licence]**

- **Plan de Secteur (PDS)** = the legally-binding zoning backbone.
- Access: **geoservices.wallonie.be** ArcGIS REST (`AMENAGEMENT_TERRITOIRE/PDS`) + GeoPackage +
  INSPIRE OGC API. Licence **CC-BY**.
- Richer than plain zones: carries **prescriptions supplémentaires, périmètres, overlays**.
- **GRU** = **spatial overlay** layers.

### 3.3 CoDT delegates — no zone→height table

The **CoDT** (Code du Développement Territorial) **delegates**: there is **no zone→height table**
in the code. Numbers live in the municipal instruments: **[CONFIRMED — delegation]**

| Instrument | Governs |
|---|---|
| **SOL** | height / implantation / density |
| **GCU** (former RCU) / **RCB** | frontage / depth / roof |

Supporting data layers:

| Layer | Content |
|---|---|
| Terrain | LiDAR **MNT 2021-22, 50 cm** (RELIEF) |
| Flood | EAU / ZI |
| Soil | CNSW |
| Land-cover | COSW |

**Municipal-regulation index** is keyed `municipality → instrument → document → article`, seeded
from the GCU GIS inventory (**~262 municipalities**). **FAR absent.** **[CONFIRMED — index design + FAR absence]**

### 3.4 LIVE PROBE VERDICT — geoservices.wallonie.be (2026-07-31)

**[CONFIRMED — live probe, 2026-07-31]**

**PDS polygon (layer 22)** carries:

| Attribute | Meaning | Verdict |
|---|---|---|
| `ART_CODT` | Exact CoDT article, e.g. `"Art. D.II.40."` | **[CONFIRMED]** |
| `ART_CWATUPE` | Legacy CWATUPE article ref | **[CONFIRMED]** |
| **`LIEN_WALLEX`** | Resolvable **official legal URL** | **[CONFIRMED — dereferenced to REAL article-structured CoDT text; end-to-end verified]** |

**SOL + GCU** carry:

| Attribute | Meaning |
|---|---|
| `CODECARTO` | Cartographic instrument code |
| `NATURE` | Instrument nature |
| `TYPEARRETE` | Decree type |
| `DATEARRETE` | Decree date |
| **`LIENDOC`** | Deterministic deep-link: `territoire.wallonie.be/fr/liendoc/<INSTRUMENT>_VIEW/<CODECARTO>` |

**But** `LIENDOC` resolves to a **JS viewer shell** (needs the viewer API to reach the PDF) — so it
is **weaker than PDS→Wallex**. **[CONFIRMED — weaker linkage]**

Other probe facts:

- **GRU** main layer is **empty** (thematic sublayers hold the content).
- `hasAttachments: false` (the links are **string fields**, not ArcGIS attachments).
- CRS **EPSG:31370**; **SPW licence**.

**VERDICT:** polygon → document linkage is **machine-readable today**; but envelope-**rule
EXTRACTION stays human-gated** (the linked documents still require human reading to lift the
numbers). **[CONFIRMED — verdict]**

---

## 4 — Consolidated honesty ledger

| Claim | Status |
|---|---|
| Brussels multi-surface ecosystem + UrbIS combined product | CONFIRMED (architecture) |
| Brussels height via UrbIS-3D CityGML `maxRoofZ − minGroundZ` | CONFIRMED (product split) |
| Brussels street-width P geometrically computable | CONFIRMED (method) |
| PRAS CC0, layer `brugis:PERSPECTIVE_FR:Affectation_du_sol` | CONFIRMED (catalogue + licence) |
| RRU Titre I Art.4 depth ≤ ¾ parcel depth + neighbour rules | CONFIRMED + encodable |
| RRU Art.3 implantation = alignment | CONFIRMED |
| `H = P + 3 + D` height formula | **UNVERIFIED — do NOT encode** |
| Brussels FAR | Genuinely ABSENT → `null` |
| Brussels PPAS/PAD/RRUZ priority, PRAS schema, UrbIS-3D fields, PPAS coverage | UNVERIFIED (need live access) |
| Wallonia PDS legally-binding, CC-BY, geoservices.wallonie.be | CONFIRMED |
| CoDT delegates; numbers in SOL/GCU/RCB | CONFIRMED |
| PDS `LIEN_WALLEX` → real article-structured CoDT text | CONFIRMED (end-to-end, 2026-07-31) |
| SOL/GCU `LIENDOC` → JS viewer shell (weaker) | CONFIRMED (2026-07-31) |
| Wallonia FAR | Absent |
| Envelope-rule EXTRACTION | Human-gated |

---

*Consolidated 2026-07-31 from founder forensic-research session. Cross-reference:
`be/findings/BELGIUM-MASTER-DATA-SOURCE-STUDY.md`, `be/README.md §7`.*
