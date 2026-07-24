# Finland (`fi`) — national zoning jurisdiction

**Level:** country · **ISO 3166-1:** `FI` · **Join key:** municipality code (kuntanumero, Statistics Finland 3-digit code) · **Subdivision law:** national (Alueidenkäyttölaki + Rakentamislaki, both effective 1.1.2025) — no mandatory region layer · **Last updated:** 2026-07-24 · **Maintainer:** UNASSIGNED · **Status:** RESEARCH COMPLETE — no rule pack implemented yet

> Finland is structurally the strongest case encountered across all country studies. One national planning act
> (Alueidenkäyttölaki + Rakentamislaki, replacing the old MRL from 1.1.2025) applies uniformly across
> all **~309 municipalities (kunta)**, with one national three-tier plan hierarchy and one national plan-symbol
> standard. Critically, a live government-run national programme — **Ryhti** — is actively building a
> machine-readable national zoning data layer (**kaavatietomalli**, ISO 19109/19103/19107-based), already
> serving two regions (South Savo, North Savo) via open API, with a hard national legal deadline of
> **1.1.2029** for full building-data submission. Consequently this folder is **flat** per
> JURISDICTION-PLAYBOOK §2. Region/municipality folders are added only when a local instrument actually
> governs differently; today none does for the structured-envelope path.

---

## 1 — What governs here

### 1.1 Legal hierarchy

```
Suomen perustuslaki (Constitution)
  → Alueidenkäyttölaki (Land Use Act, effective 1.1.2025, replacing MRL)
      → Asemakaava (detailed/local plan) — the binding municipal zoning instrument; primary instrument
          → Kaavamerkinnät ja -määräykset (plan markings and regulations) — national standard symbol set
          → Kaavatietomalli (national zoning data model, ISO 19109/19103/19107) — machine-readable schema
          → Ryhti (national built-environment information system, Ministry of the Environment)
      → Yleiskaava (general/master plan) — municipality scale; binding in rural areas; some shore/coast areas
      → Maakuntakaava (regional plan) — prepared by regional council; strategic guidelines
  → Rakentamislaki (Building Act, effective 1.1.2025, replacing MRL building provisions)
      → Submission obligation: municipalities must submit building data to Ryhti from 1.1.2029 at latest
      → Building-permit data in kaavatietomalli format mandatory from start of 2026
  → Rakentamisasetus (Building Decree) — subordinate regulation
```

**Finland's central structural advantage over every other jurisdiction studied except Denmark:** the
instrument names and hierarchy are identical everywhere — there is no "PGT-only-in-Lombardy" or
"PLU-versus-PLUi" problem. Every municipality's asemakaava is structurally the same document kind as
every other municipality's asemakaava. The engineering problem is **"ingest one data model, handle
rollout-timing variance,"** not "build 21 separate GeometricRule kinds."

### 1.2 The two zoning regimes (must be resolved per parcel before numeric sourcing)

| Regime | Basis | Governs | Numeric rules available? |
|---|---|---|---|
| **(a) Ryhti-migrated region** | Kaavatietomalli (ISO 19109/19103/19107) + VOOKA migration | Plans for South Savo and North Savo are already live; additional regions being migrated under VOOKA | YES — structured plan attributes via kaavatietomalli OGC API; free and open |
| **(b) Pre-migration / non-Ryhti municipality** | Old asemakaava plan documents; municipal WebGIS and PDF | All other regions; plan content is the same national instrument, but not yet in the machine-readable API | PARTIAL — national symbol system is uniform, but numeric fields are in PDF/municipal WebGIS, not the national API |

⚠ **The Ryhti rollout split is the single most important variable in Finnish coverage.**
Unlike Italy's genuine per-region legal variation, Finland's split is purely a timing/migration question —
the legal mechanism is identical everywhere, only the data delivery is bimodal. The VOOKA project is the
rollout vehicle; 1.1.2029 is the hard legal backstop.

### 1.3 Kaavatietomalli — the national zoning data model

The **kaavatietomalli** is a genuine, published, ISO-standards-based schema (ISO 19109 General Feature
Model + ISO 19103 + ISO 19107 spatial standards) — not an ad-hoc national format. It enables
machine-readable plan markings and regulations with a nationally unified structure, while allowing
locally-appropriate plan solutions. This is the direct equivalent of what Italy, France, and Germany
each lack at a national level.

**Known structural caveat (self-disclosed):** the kaavatietomalli does not require "kaavayksikkö"
(plan-unit) objects, because not all municipalities use them — smaller municipalities flagged this in
the KAATIO cooperative working groups. Plan-units remain part of the data model (so municipalities that
use them can benefit), but not every municipality's data will carry the same object granularity.

### 1.4 Plan-symbol standard

Unlike Italy's DM 1444 (numeric-floor decree, not the operative plan symbol set), Finland has a
**national standard symbol library** for kaavamerkinnät ja -määräykset (plan markings and regulations),
issued by the Ministry of the Environment, used by every municipality drafting an asemakaava or yleiskaava.
This means the symbol/attribute meaning is always national — the "query key problem" (Italy's DM 1444
letters may or may not be operative) does not exist in Finland. The specific numeric values (e.g.
tehokkuusluku/FAR, kerrosluku/storey count) remain locally set per plan.

### 1.5 Setback and density model

- **Density metric:** tehokkuusluku (e) — FAR equivalent (floor area / plot area) — set per plot in the
  asemakaava using the national symbol standard.
- **Height/storeys:** kerrosluku — set per plot in the asemakaava.
- **Setbacks:** expressed in the asemakaava plan drawing; no national formula-based setback equivalent to
  Germany's Abstandsflächen. Treat as `null` / plan-text-only until confirmed structured in a Ryhti feature
  response.

---

## 2 — National data sources

### 2.1 Parcels / cadastre — Maanmittauslaitos (NLS)

| Layer | Source | Access | Licence | Confidence |
|---|---|---|---|---|
| Parcel geometry | OGC API Features — `https://avoin-paikkatieto.maanmittauslaitos.fi/kiinteisto-avoin/simple-features/v3/` | Free API key (self-service via NLS "My Account" / email registration — no formal contract) | CC Attribution 4.0 (NLS open-data licence) | `published` |
| Cadastral unit identifiers + boundary markers | Same endpoint — open "simple" product tier | Same API key | Same CC BY 4.0 | `published` |
| Usage-right units (road easements, nature reserves, power-line corridors) | Same endpoint | Same | Same | `published` |
| Lainhuuto- ja kiinnitystiedot (ownership/mortgage history) | Licensed product tier — same endpoint family, different access class | Paid contract required | Contract | `stated` |

⚠ **Two live caveats:**
1. The API key for the open tier is self-service (email registration, no contract) — lighter than most EU
   countries. Refreshed nightly by 2am; available 24/7.
2. **Åland** (autonomous Swedish-speaking province) maintains its own separate land registry and building
   permitting administration by statute. Treat Åland as its own jurisdiction. Its cadastral exposure via
   NLS API is unconfirmed — needs separate check.

### 2.2 Zoning — Ryhti / kaavatietomalli

| Aspect | Value | Confidence |
|---|---|---|
| Programme name | Ryhti — national built-environment information system, Ministry of the Environment (2020–2025) | `published` |
| Data model | Kaavatietomalli — ISO 19109/19103/19107-based national zoning schema | `published` |
| **Plan OGC API base URL** | **`https://paikkatiedot.ymparisto.fi/geoserver/ryhti_plan/ogc/features/v1`** — live, public, no auth; courtesy registration via gistuki@syke.fi for production use | `verified-live` (2026-07-24) |
| **Plan collections (4 confirmed)** | `pub_valid_ld_plan_ix_gs` (valid asemakaava index), `pub_valid_lm_plan_ix_gs` (valid yleiskaava index), `pub_prep_ld_plan_ix_gs` (prep asemakaava), `pub_prep_lm_plan_ix_gs` (prep yleiskaava) — all `_ix_`-suffixed | `verified-live` (2026-07-24) |
| **`_ix_` schema — UNCONFIRMED** | Whether these collections carry numeric kaavatietomalli attributes (FAR/kerrosluku/use code) or only plan boundary + PDF link is the **rate-defining unknown** — item-level GeoJSON blocked on tooling gap (not access) | `unconfirmed` |
| **Declared bbox caveat** | All four collections declare bbox = all Finland — this is a GeoServer CRS-extent metadata default, NOT data coverage. Actual plan content is South/North Savo only | `verified-live` (trap documented) |
| Regions confirmed live | **South Savo and North Savo** — valid asemakaava and yleiskaava already in Ryhti | `published` |
| National rollout vehicle | VOOKA project — explicit goal to export all current Finnish zoning and master plans into kaavatietomalli format | `published` |
| Legal mandate date | Municipalities must submit building data to Ryhti by **1.1.2029** at latest | `published` (Rakentamislaki) |
| Building-permit data mandate | Kaavatietomalli-format building permits mandatory from **start of 2026** | `published` (Rakentamislaki) |
| Retroactive obligation | None — municipalities are NOT required to retroactively submit existing historical data (may choose to) | `published` |
| Helsinki capital region | Rollout status inside Ryhti/VOOKA specifically is NOT confirmed — needs VOOKA schedule check | `stated` |

### 2.2b Buildings/addresses — ryhti_building (separate sub-service)

| Aspect | Value | Confidence |
|---|---|---|
| **API base URL** | `https://paikkatiedot.ymparisto.fi/geoserver/ryhti_building/ogc/features/v1` | `verified-live` (2026-07-24) |
| **`open_address` collection — nationwide** | Helsinki municipality 091 record confirmed; June 2026 timestamp; nationwide coverage (NOT Savo-only unlike ryhti_plan) | `verified-live` (2026-07-24) |
| Rollout timeline | Ahead of ryhti_plan — building/address data already national while plan layer is still Savo-only | `verified-live` (2026-07-24) |

⚠ `ryhti_plan` and `ryhti_building` are **two independent sub-services on different rollout timelines**.
Do not conflate them. ryhti_building is national now; ryhti_plan content is South/North Savo only.

### 2.3 Floor-area data — SeutuRAMAVA (Helsinki capital region)

The Helsinki metropolitan area publishes an aggregated, block-level (kortteli) structured dataset of
currently valid asemakaava floor area — **SeutuRAMAVA** — covering Espoo, Helsinki, Kauniainen, and
Vantaa, expressed in floor-area square metres. This is the Finnish analogue of what the Italy study found
only once narrowly (Lombardy's Indagine Offerta PGT) — except here it's a live open dataset for an
entire metro region's floor-area entitlement. A strong precedent for structured density data, ahead of the
national Ryhti rollout finishing.

### 2.4 Terrain and 3D buildings — Maastotietokanta / KMTK + national LiDAR

| Aspect | Value | Confidence |
|---|---|---|
| National LiDAR programme | Airborne laser-scanning from 2020 onward, 5 pts/m² original density (thinned to 0.5 pts/m² for public delivery) | `published` |
| Historical LiDAR | 2008–2019 data at 0.5 pts/m² — predates current programme | `published` |
| 3D building vectors | **KMTK Buildings feature class** — three-dimensional building vectors derived with high automation from the 5-pt-density LiDAR data; includes intended use + storey count | `published` |
| Coverage | **National and open** — the Maastotietokanta (national topographic database) covers the whole of Finland | `published` |
| Licence | Open data | `published` |

**This is the strongest positive finding across all four country studies to date.** Finland already derives
an actual national 3D building vector layer from its LiDAR programme — the direct analogue of Germany's
LoD2-DE, except Germany's is per-Land and Finland's is genuinely national and free. Storey count is a
structured national attribute for every building in the country.

⚠ **RHR (rakennus- ja huoneistorekisteri — building and dwelling register):** the richer per-building
register held by DVV (Digital and Population Data Services Agency) — ~3 million buildings with owners,
dwellings, business premises — is GDPR-restricted. Third-party access requires DVV permission. Building
massing/height is available another open way (KMTK 3D vectors above); it is specifically the
ownership/occupancy layer that is gated.

### 2.5 Heritage — Museovirasto (Finnish Heritage Agency)

| Aspect | Value | Confidence |
|---|---|---|
| Source | Museovirasto (Finnish Heritage Agency) WFS/WMS open services | `published` |
| Layers | Ancient monuments + other cultural-heritage sites (point); scheduled-monument area boundaries; protected buildings from Building Heritage Register (point + area); RKY — Nationally Significant Built Cultural Environments (point, line, area); World Heritage Sites (point + area) | `published` |
| Licence | Open vector data via standard OGC WFS/WMS | `published` |
| Building Heritage Register scope | Buildings protected under the 1985 Decree (480/85), the Church Act, the Act on the Orthodox Church, and the 1998 "Railway Agreement" — a defined, statute-driven, non-exhaustive list | `published` |

⚠ **Non-exhaustion caveat (stated with unusual clarity by Museovirasto itself):**
- NOT included: buildings/areas protected under the Act on the Protection of the Built Heritage (or the
  older Building Protection Act) → must be requested from **Lupa- ja valvontavirasto (LVV)** (Regional
  State Administrative Agency).
- NOT included: buildings/areas protected via a zoning plan → must be requested from whoever drafted the
  plan (municipality or regional council).
- A NOT FOUND result from the Museovirasto WFS does **not** certify the absence of a heritage constraint.
  The same discipline as Italy's SITAP applies here — just with a clearer list of exactly two other
  channels to check (LVV, municipality/region).

---

## 3 — Readiness estimate (same methodology as Italy/France/Germany/Sweden benchmark)

| Field | Structured? | Basis | Estimated score |
|---|---|---|---|
| Parcel geometry (Maanmittauslaitos) | ✅ Full | National, CC BY 4.0, OGC API Features, nightly refresh | ~95% |
| Zone / plan existence (Ryhti — live regions) | ✅ Structured | South Savo + North Savo live; kaavatietomalli schema; free API | ~95%+ **in live Ryhti regions only** |
| Zone / plan existence (non-Ryhti regions) | ⚠️ Partial | Municipal WebGIS / PDF; national symbol standard applies but no national API | Varies by municipality; likely 20–40% structured |
| Numeric plan attributes (FAR, height — Ryhti) | ✅ Structured (where populated) | Kaavatietomalli fields; ISO schema; OGC API | High for Ryhti regions — exact field completeness needs direct probe |
| Numeric plan attributes (non-Ryhti) | ❌ PDF / municipal portal | National symbol meaning is consistent; numbers are per-plan local | Below 30% structured |
| Building height / 3D (KMTK) | ✅ Full — national open | Maastotietokanta Buildings class, LiDAR-derived, storey count as structured attribute | ~85%+ |
| Terrain (LiDAR) | ✅ Full, free | National LiDAR programme 2020 onward, 0.5 pts/m² public; 2008–2019 legacy coverage | ~95%+ |
| Heritage overlay (Museovirasto WFS) | ✅ Structured, non-exhaustive | Open WFS/WMS; OGC standard; but explicitly non-exhaustive (two other channels required) | ~60–70% (same tier as Italy's SITAP) |
| SeutuRAMAVA floor area (Helsinki metro) | ✅ Structured | Block-level open data for Espoo/Helsinki/Kauniainen/Vantaa | Helsinki metro only |

**Headline estimate:**
- **In confirmed live Ryhti regions (South Savo, North Savo): ~55–65% (est., unverified — documentation-level)**
- **In non-Ryhti regions: ~30–35% (est., unverified — documentation-level)**
- Finland's readiness is **genuinely bimodal** — determined by Ryhti migration status, not by legal-mechanism variation.

---

## 4 — Municipality coverage

No municipality packs implemented yet. Recommended sequencing:

| City / Region | Code | ISO 3166-2 | Ryhti status | Pack status | Notes |
|---|---|---|---|---|---|
| **South Savo** | Etelä-Savo | `fi-es` | ✅ CONFIRMED LIVE | NOT STARTED | Cheapest confirmed first deployment |
| **North Savo** | Pohjois-Savo | `fi-ps` | ✅ CONFIRMED LIVE | NOT STARTED | Same as South Savo — both live now |
| **Helsinki** | 091 | `fi-18` | ❔ Uusimaa rollout date unconfirmed | NOT STARTED | Capital; SeutuRAMAVA floor-area data; own protected-buildings open data |
| **Espoo** | 049 | `fi-18` | ❔ Same as Helsinki (Uusimaa) | NOT STARTED | Part of SeutuRAMAVA |
| **Tampere** | 837 | `fi-06` | ❔ Unconfirmed | NOT STARTED | Strong open-data programme likely |
| **Turku** | 853 | `fi-19` | ❔ Unconfirmed | NOT STARTED | |
| **Oulu** | 564 | `fi-17` | ❔ Unconfirmed | NOT STARTED | |

**Recommended sequencing:** South Savo → North Savo (both confirmed-live, cheapest first deployment),
then Helsinki/Uusimaa once VOOKA migration date confirmed. Mirrors the "don't default to the capital" lesson
from France (Lyon over Paris), Germany (Hamburg over Berlin), and Italy (Turin over Rome/Milan) — except here
the confirmed-live regions are not even the capital, they are a fact of the VOOKA rollout schedule.

---

## 5 — Files in this folder

```
fi/
├── README.md                              ← this file (country umbrella)
├── NEXT.md                                ← blockers, trip-wires, resume steps
├── RATE.md                                ← structured dimensional fill rate
├── RATE-IMPLEMENTATION-PLAN.md            ← phased climb tracker
├── sources/
│   ├── SOURCES.md                         ← per-field national data-source citations
│   └── VERIFICATION.md                    ← human sign-off gate (open)
├── findings/
│   └── FINLAND-MASTER-DATA-SOURCE-STUDY.md ← full source/legal-mechanism study
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

- **Ryhti API schema and parcel-level query path:** live probes against the Ryhti OGC API for South/North Savo have NOT been run. The headline rate of 55–65% for live regions is documentation-level only. A direct GET to the Ryhti STAC/OGC API endpoint is the highest-value next action.
- **Helsinki / Uusimaa VOOKA migration date:** not confirmed in this pass. This single date determines whether the capital region is Tier 1 (live now) or Tier 2 (near-term). Check the VOOKA project schedule directly.
- **Maanmittauslaitos cadastre — live probe not run:** the OGC API Features endpoint URL is confirmed from documentation, but no actual GetFeatures call has been made. Needs a real API key obtained via NLS "My Account" registration.
- **KMTK 3D building vector — field names and height attribute names not confirmed:** the KMTK Building feature class is confirmed to carry storey count, but the exact attribute name and whether it's reliably populated per-building needs a live DescribeFeatureType + sample response.
- **Museovirasto WFS endpoint — not live-probed:** URL and layer structure not confirmed from a real GetCapabilities call.
- **Åland status:** separate cadastral/planning system, separate from mainland NLS/Ryhti systems by statute. Treat as its own jurisdiction. Coverage, API access, and plan-type taxonomy all need separate confirmation.
- **Kaavatietomalli kaavayksikkö (plan-unit) adoption rate:** self-disclosed caveat in the national study — not all municipalities use plan-units. Impact on parcel-level query completeness in Ryhti-live regions needs direct sampling.
- **RHR access-request process for research/product use:** DVV may grant access for specific legitimate use cases. Process not confirmed in this pass.
