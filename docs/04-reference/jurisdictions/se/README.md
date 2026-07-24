# Sweden (`se`) — national zoning jurisdiction

**Level:** country · **ISO 3166-1:** `SE` · **Join key:** SCB kommunkod (4-digit municipality code, Statistiska centralbyrån) · **Subdivision law:** national (PBL) — no mandatory region layer · **Last updated:** 2026-07-24 · **Maintainer:** UNASSIGNED · **Status:** RESEARCH COMPLETE — no rule pack implemented yet

> Sweden's planning law (**Plan- och bygglagen 2010:900, PBL**) is a single national statute applying
> uniformly across all **290 kommuner**. Municipalities hold *planmonopol* but operate entirely within
> one national legal framework — there is no "which regional law applies here" question at all.
> Consequently this folder is **flat** per JURISDICTION-PLAYBOOK §2 ("depth follows the law, not the
> template"). Region/municipality folders are added only when a local instrument actually governs
> differently; today none does for the structured-envelope path.

---

## 1 — What governs here

### 1.1 Legal hierarchy

```
Grundlagen (Constitution) → Plan- och bygglagen (2010:900) [PBL]
  → Detaljplan — the binding municipal zoning plan (§1 kap. PBL); primary instrument
      → Planbestämmelsekatalog (Boverket BFS 2020:5) — standardised provision codes
      → NGP (Nationella geodataplattformen) — mandatory digital delivery from 2022-01-01
  → Översiktsplan — strategic/comprehensive plan; not binding but must inform detaljplan
      → ÖP-katalogen (Boverket) — national API
  → Transitional instruments — byggnadsplan, stadsplan, avstyckningsplan (pre-1987 PBL)
      → Still operative by transitional provisions; NOT required to be digitised
  → Plan- och byggförordningen (2011:338) [PBF] — the regulation completing PBL
  → Boverkets föreskrifter (BFS) — Boverket's detailed rules; BFS 2020:5 mandates digital format
```

**Sweden's central structural advantage over every other jurisdiction studied:** the issue is not
"which mechanism" (PBL is genuinely national and uniform) but **what fraction of currently-operative
zoned land area is actually digitised** — high municipal participation in NGP coexists with a likely
majority of operative plans being pre-2022, undigitised, and absent from the platform entirely.

### 1.2 The two zoning regimes (must be resolved per parcel before numeric sourcing)

| Regime | Basis | Governs | Numeric rules available? |
|---|---|---|---|
| **(a) Post-2022 detaljplan** | PBL + BFS 2020:5 + IT-Planungsrat-equivalent mandate | Plans adopted/amended from 2022-01-01; delivered to NGP digitally in standard format | YES — structured provision codes via Planbestämmelsekatalog (~3,700 codes); geometry + attributes in NGP |
| **(b) Pre-2022 detaljplan / transitional instruments** | PBL transitional provisions; original instrument remains authoritative | Plans adopted before 2022-01-01 (byggnadsplan, stadsplan, etc.); no digitisation mandate | NO — analog original is the legally authoritative document; retro-digitised versions exist in some municipalities but are **informational, not certifying** |

⚠ **The pre-2022 caveat is the single most important number in Swedish jurisdiction coverage.**
Sweden has had a modern plan system since the 1987 PBL predecessor, meaning **the majority of
currently-operative zoning by land area is very likely still pre-2022, undigitised, and absent from
NGP** — even in the 236 municipalities actively participating. High municipal participation is a
coverage-of-*process* metric, not a coverage-of-*land-area* metric. This must be measured directly
before finalising any resolution estimate.

### 1.3 Planbestämmelsekatalog — the national provision vocabulary

Boverket's **Planbestämmelsekatalog** contains ~3,700 standardised plan-provision codes, each carrying
a unique code since 2015, linkable to Boverket's detaljplan regulations. Available as open data in
three formats: XML via API, JSON via API, and Excel. This is the machine-readable semantic layer for
provision codes — equivalent to what a universal German BauNVO would need to be. No other country in
this research series has a national equivalent.

### 1.4 Setback model

PBL §4 kap. governs setbacks ("prickmark" — land not to be built on; "kryss" — land always to be
built on). In Swedish detaljplaner these are expressed as graphical/vector markings on the plan map,
not as uniform formula-based setbacks. Structured setback attributes are **not** standardised in the
Planbestämmelsekatalog to a degree comparable to Germany's Abstandsflächen formula. Treat as
`null` / plan-text-only until verified.

---

## 2 — National data sources

### 2.1 Parcels / cadastre — Lantmäteriet

| Layer | Source | Access | Licence | Confidence |
|---|---|---|---|---|
| Parcel geometry | INSPIRE-compliant cadastral boundary data, Lantmäteriet | Free with account / scope selection; some "high-value datasets" (personal-data-adjacent) require stating intended use and geographic scope | CC0 for most products | `published` |
| Address register | Lantmäteriet / INSPIRE AD | Same access model | CC0 | `published` |
| Building register | Lantmäteriet building data | Same access model | CC0 | `published` |

⚠ **Two live caveats:**
1. "High-value dataset" gate: some products require account creation, intent statement, and geographic scope selection — lighter than most EU countries, but not unconditionally keyless.
2. **"Akt" (deed/instrument) digital access is currently CLOSED** following Lantmäteriet's detailed analysis of a government security inquiry. This is a live, dated restriction — direct status check required before assuming full cadastral-document access.

### 2.2 Zoning — Nationella geodataplattformen (NGP) / detaljplan

| Aspect | Value | Confidence |
|---|---|---|
| Standard name | NGP — Nationella geodataplattformen, operated by Lantmäteriet | `published` |
| Legal mandate | BFS 2020:5 (Boverket) + PBL amendment — mandatory from 2022-01-01 for new/amended detaljplaner | `published` |
| Coverage | 284/290 municipalities signed producer agreements; **236/290 (≈81%) actively delivering digital detaljplan data** (as of April 2025, confirmed growing into 2026) | `stated` — source is April 2025 conference presentation |
| Recent delivery confirmation | Vadstena became first municipality in Östergötland to publish via NGP on 2026-02-18 — rollout still actively expanding | `published` |
| Provision semantics | Planbestämmelsekatalog API (XML/JSON) — ~3,700 codes | `published` |
| Pre-2022 plans | NOT required to be digital; analog original is legally authoritative; retro-digitised versions are informational only | `published` (PBL transitional provisions) |

⚠ **The critical gap**: the 236/290 figure measures *municipal participation*, not *land-area coverage*. A municipality that delivers one 2022-era plan to NGP counts as "active" while the bulk of its zoned land (older plans) is absent. This distinction needs direct measurement via API sampling before any per-parcel resolution estimate can be made.

### 2.3 Comprehensive plans — ÖP-katalogen (Boverket)

Boverket runs the **ÖP-katalogen** (Comprehensive Plan Catalog) with a published API for digital
*översiktsplan* (comprehensive/strategic plan, roughly analogous to the kommuneplanramme layer in
Denmark). Also nationally standardised. Coverage not confirmed in this pass.

### 2.4 Terrain — Lantmäteriet national LiDAR (complete)

| Aspect | Value | Confidence |
|---|---|---|
| Dataset | National elevation model — airborne laser scanning, nationwide, 2009–2019 complete | `published` |
| Density | 0.5–1 pts/m² (0.25 pts/m² in alpine areas) | `published` |
| Format | Height points on regular grid; derived DTM/DSM | `published` |
| Licence | Free download, open licence | `published` |
| Newer dataset | Denser forest-focused LiDAR, collection ongoing since 2018 | `published` |
| Coverage | **Complete** — unlike Italy (mid-rollout) or Germany (per-Land patchiness) | `published` |

This is the strongest terrain layer in any European jurisdiction studied so far.

### 2.5 Building height / LOD2 — municipal level, sometimes paid

| Aspect | Value | Confidence |
|---|---|---|
| National terrain point cloud | Free and complete — see §2.4 | `published` |
| Finished LOD2 building models | **Municipal product, not national** — confirmed fee-based for Stockholm (priced per Stockholm's city planning department fee schedule) | `published` |
| Other cities | Gothenburg noted as first city to deliver a building record into NGP — possibly ahead of Stockholm on open LOD2; not confirmed free | `stated` |
| National LOD2 product | No equivalent of Germany's LoD2-DE or Denmark's "Danmark i 3D" at national level | `stated` |

**Implication**: raw terrain is free and excellent; finished per-building height volumes require a
per-city check for both availability and cost.

### 2.6 Heritage — Riksantikvarieämbetet (RAÄ)

| Aspect | Value | Confidence |
|---|---|---|
| Source | RAÄ Öppna-dataportal | `published` |
| Coverage | Ancient monuments/archaeological sites; culturally historic buildings; archaeological commissions; World Heritage sites | `published` |
| Access | Download or WMS; direct API access for some datasets | `published` |
| Licence | CC0 for at least some content | `published` |
| Integration status | **Being merged into NGP** — from autumn 2022, ancient monuments + national-interest cultural-heritage areas being brought into the same platform as detaljplan and building data | `published` |

This is a structural advantage over every other country studied: heritage data is deliberately being
integrated into the same national platform as zoning and buildings, not siloed separately.

---

## 3 — Readiness estimate (same methodology as Italy/France/Germany benchmark)

| Field | Structured? | Basis | Estimated score |
|---|---|---|---|
| Parcel geometry (Lantmäteriet) | ✅ Full | National, CC0, API + bulk download | ~95% |
| Zone (post-2022 detaljplan) | ✅ Full, structured | NGP, ~236/290 municipalities live | ~81% of municipalities; **unknown % of total zoned land area — needs direct measurement** |
| Zone (pre-2022 / transitional) | ❌ Not required to be digital | Analog original authoritative; no digitisation mandate | Likely low; needs direct sampling |
| Provision meaning (numeric/rule content) | ✅ Structured | Planbestämmelsekatalog, ~3,700 codes, API (XML/JSON) | High for provisions using standard codes |
| Comprehensive plan (översiktsplan) | ✅ Structured | Boverket ÖP-katalogen API | Coverage not confirmed in this pass |
| Heritage overlay | ✅ Structured, improving | RAÄ open data + ongoing NGP integration | Moderate-high; some datasets CC0/API, some WMS-only |
| Terrain/surface height | ✅ Full, free, complete | National LiDAR 2009–2019 | ~95%+ |
| Building height (LOD2) | ⚠️ Partial, often paid | Free terrain point cloud nationally; finished LOD2 models municipal/fee-based (Stockholm confirmed) | Needs per-city check |

**Headline estimate**: materially higher than Italy (~8–10%), and very plausibly higher than Germany
(~28%) and France (~22%) for the post-2022 plan stock — but the single biggest open question is
**what fraction of Sweden's total currently-operative zoned land area (not municipalities) is actually
in NGP**, since the 2022 cutoff means high municipal participation could coexist with a majority of
*land* still governed by undigitised older plans.

---

## 4 — Municipality coverage

No municipality packs implemented yet. Recommended first cities (population + NGP delivery
confirmation):

| City | SCB kommunkod | Län | ISO 3166-2 | Pack status | Notes |
|---|---|---|---|---|---|
| **Stockholm** | 0180 | Stockholms län | `se-ab` | NOT STARTED | LOD2 confirmed fee-based; largest city |
| **Gothenburg** | 1480 | Västra Götalands län | `se-o` | NOT STARTED | First city to deliver building record to NGP — likely most data-forward |
| **Malmö** | 1280 | Skånes län | `se-m` | NOT STARTED | Third largest; strong NGP participation likely |

**Recommended sequencing:** Gothenburg → Malmö → Stockholm, mirroring Barcelona's `13a`→`13b`
principle: start with the most data-forward city (Gothenburg/NGP building delivery first), then
Malmö, then Stockholm (where LOD2 is confirmed paid).

---

## 5 — Files in this folder

```
se/
├── README.md                              ← this file (country umbrella)
├── NEXT.md                                ← blockers, trip-wires, resume steps
├── sources/
│   ├── SOURCES.md                         ← per-field national data-source citations
│   └── VERIFICATION.md                    ← human sign-off gate (open)
├── findings/
│   └── SWEDEN-MASTER-DATA-SOURCE-STUDY.md ← full source/legal-mechanism study
├── topics/
│   ├── buildings-lod-height.md
│   ├── parks-trees.md
│   ├── roads-pedestrian.md
│   └── water.md
└── regions/
    └── README.md                          ← note: law is national — no legal region split needed
```

---

## 6 — Open questions / unverified

> Research notes that cannot yet be cited go HERE — never in `SOURCES.md`.

- **The critical unverified number:** what fraction of a given municipality's total zoned area (not just new plans) is actually in NGP? Sampling built-up area coverage in a few participating municipalities is the cheapest way to establish this. Direct API query against NGP for Stockholm/Gothenburg is the highest-value action item.
- **Akt (deed/instrument) digital-access closure:** Lantmäteriet's digital access to deed information remains closed (as of research date) following a government security inquiry. Current status unknown — check directly before assuming cadastral-document access.
- **LOD2 outside Stockholm:** Gothenburg was noted as first city to deliver a building record into NGP, suggesting it may offer free LOD2. Confirmation needed.
- **Planbestämmelsekatalog code completeness:** are all ~3,700 codes routinely used in detaljplaner, or is actual adoption of structured codes partial? A sample of NGP-delivered plans should be checked for code completeness vs. free-text provisions.
- **ÖP-katalogen coverage:** how many of the 290 municipalities have submitted digital översiktsplan data and how complete are the numeric fields?
- **Pre-2022 retro-digitisation pace:** some municipalities are retro-digitising older plans voluntarily. No national count or pace data found in this pass.
