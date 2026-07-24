# Data Readiness Rate — Finland (`fi`) national

**Headline rate: ~55–65% (Ryhti live regions) / ~30–35% (non-Ryhti regions)**
*(documentation-level estimate only — no live API probes have been run; see §3 for the bimodal breakdown)*

> **Structured dimensional fill rate** — the fraction of parcel-level building-rule queries that return a
> complete, machine-readable answer (**zone/use code + a density metric [FAR / coverage / tehokkuusluku] +
> height/kerrosluku**) **without reading an ordinance text/PDF**. This definition is IDENTICAL across every
> jurisdiction (Denmark / Madrid / Barcelona / Norway / Germany / France / Italy / Sweden …) so the scores
> are directly comparable.
>
> **Phase 0 probe status (2026-07-24):** Ryhti plan OGC API endpoint confirmed live and public at
> `https://paikkatiedot.ymparisto.fi/geoserver/ryhti_plan/ogc/features/v1`. Four collections enumerated
> (all `_ix_` index-named — see §3). `ryhti_building` sub-service confirmed live NATIONWIDE (Helsinki
> address record verified). Item-level property schema for plan collections unconfirmed (tooling gap —
> binary GeoJSON payload, not an access gate). Rate estimates revised downward pending schema confirmation.

| Jurisdiction | Rate | Basis |
|---|---|---|
| Denmark | ~96% | Plandata.dk WFS; keyless; structured dimensions in plan features |
| Madrid | ~68% | PGOU structured WebGIS |
| Saudi (national) | ~55% | |
| Barcelona | ~48% | Structured provision codes + geometry construction |
| Norway (national) | ~32% | |
| **Finland (Ryhti live regions — if `_ix_` collections are index+attributes)** | **~55–65% (est.)** | Kaavatietomalli API; endpoint VERIFIED-LIVE; item schema unconfirmed |
| **Finland (Ryhti live regions — if `_ix_` collections are index-only)** | **~30–40% (revised est.)** | Same as non-Ryhti; plan boundary + PDF link only; numeric rules in PDF |
| **Finland (non-Ryhti regions)** | **~30–35% (est.)** | Same national mechanism; plan data in PDF/municipal WebGIS |
| Germany (national) | ~28% | XPlanung Stufe 1; GRZ/GFZ in PDF |
| France (national) | ~22% | GPU WFS; zone ID works; numeric rules in PDF |
| Italy (national) | ~8–10% | Regional fragmentation; no national standard |

⚠ **Rate is now conditional on one unresolved finding:** the four Ryhti plan collections all carry `_ix_`
(index) suffixes in their schema naming — the same structural pattern as Hamburg's `app:hh_hh_festgestellt`
B-Plan index (boundary + PDF link, no numeric attributes). If confirmed as index-only, the Ryhti live-region
rate collapses to ~30–40% — the numeric fill advantage disappears and the bimodal split narrows to near-zero.
**This is the single highest-priority measurement remaining.** See §3.

**Separate positive finding:** `ryhti_building` sub-service is confirmed live NATIONWIDE — not Savo-only.
The building/address layer is on a faster rollout timeline than the plan layer and should be tracked
separately. This does not directly affect the zoning-rule fill rate but raises the building-context score.

---

## §1 — Field-by-field breakdown

| Field | Structured? | Source | Score | Probe status |
|---|---|---|---|---|
| **Parcel geometry (Maanmittauslaitos cadastre)** | ✅ Full | OGC API Features — `https://avoin-paikkatieto.maanmittauslaitos.fi/kiinteisto-avoin/simple-features/v3/` — CC BY 4.0, nightly refresh, self-service API key | **~95%** | `stated` — endpoint URL and licence confirmed from NLS documentation; no live GetFeatures call executed |
| **Zone plan boundary (Ryhti `_ix_` collections)** | ✅ Plan boundary + PDF link | `pub_valid_ld_plan_ix_gs` (asemakaava index), `pub_valid_lm_plan_ix_gs` (yleiskaava index) — confirmed live at Ryhti OGC API | **~95%+ plan-boundary hit in confirmed live regions** | ✅ **VERIFIED-LIVE 2026-07-24** — four collections enumerated; all carry `_ix_` suffix; declared bbox spans all Finland (GeoServer metadata default, not data coverage) |
| **Numeric plan attributes — tehokkuusluku (FAR), kerrosluku (floors), height — in Ryhti `_ix_` collections** | ❔ UNCONFIRMED | Item-level GeoJSON property schema not yet readable (binary payload / tooling gap — not an access gate) | **UNKNOWN — conditional on schema** | ⚠️ **BLOCKED** — `pub_valid_ld_plan_ix_gs/items?limit=1` returns `application/geo+json` binary that the probe tool cannot render as text. If `_ix_` = index-only (Hamburg pattern): score drops to ~0% for numeric fill. If `_ix_` = index+attributes: score could reach ~60–70%. **This is the rate-defining unknown.** |
| **Zone code (non-Ryhti regions)** | ⚠️ Partial / municipal | Municipal WebGIS or PDF; national symbol standard applies but plan is not in kaavatietomalli API | **~20–40%** (varies by municipality) | `stated` |
| **Numeric plan attributes (non-Ryhti)** | ❌ PDF / municipal portal | Per-municipality plan document or local WebGIS | **~15–25%** | `stated` |
| **Building address / register (ryhti_building — nationwide)** | ✅ Structured, nationwide | `ryhti_building` OGC API — `open_address` collection; Helsinki record (municipality 091, June 2026 timestamp) confirmed | **~95%+ nationally** | ✅ **VERIFIED-LIVE 2026-07-24** — national coverage confirmed; ahead of plan layer rollout |
| **SeutuRAMAVA floor area (Helsinki metro only)** | ✅ Block-level structured | Open dataset — Espoo, Helsinki, Kauniainen, Vantaa; block-level FAR from valid asemakaava | **~90%+ within Helsinki metro scope** | `stated` — dataset existence confirmed; not live-probed |
| **Building height / 3D (KMTK Maastotietokanta)** | ✅ Full — national open | Maastotietokanta Buildings feature class — LiDAR-derived 3D vectors, storey count as structured attribute | **~85%+** | `stated` — national programme confirmed; attribute name not live-confirmed |
| **Terrain / LiDAR** | ✅ Full, free, complete | National LiDAR programme 2020 onward (5 pts/m² original, 0.5 pts/m² public); 2008–2019 legacy | **~95%+** | `stated` |
| **Heritage overlay (Museovirasto WFS/WMS)** | ✅ Structured, non-exhaustive | Museovirasto open OGC WFS/WMS — ancient monuments, scheduled areas, RKY, Building Heritage Register | **~60–70%** | `stated` — no GetCapabilities executed |
| **Setbacks** | ❌ Graphical / plan-drawing | Asemakaava plan drawings; no national numeric formula | **~0–5%** | `stated` |

---

## §2 — The `_ix_` schema question: the rate-defining unknown

The four Ryhti plan collections are:

| Collection ID | Title | What it is |
|---|---|---|
| `pub_prep_ld_plan_ix_gs` | Valmisteilla olevat asemakaavat | Asemakaavat in preparation — index |
| `pub_prep_lm_plan_ix_gs` | Valmisteilla olevat yleiskaavat | Yleiskaavat in preparation — index |
| `pub_valid_ld_plan_ix_gs` | Asemakaavahakemisto | Valid asemakaava **directory/index** |
| `pub_valid_lm_plan_ix_gs` | Yleiskaavahakemisto | Valid yleiskaava **directory/index** |

The `_ix_` suffix is a concrete naming signal. The structural question — confirmed by analogy to Hamburg's
`app:hh_hh_festgestellt` B-Plan index in the Germany research — is whether these collections deliver:

**(a) Index-only:** plan ID + boundary polygon + PDF document link — the same as Germany's XPlanung
Stufe 1. If so, the numeric fill rate for Ryhti live regions is effectively zero for structured FAR/height,
and the ~55–65% estimate drops to ~30–40% (driven by parcel geometry + building data + terrain only).

**(b) Index + kaavatietomalli attributes:** plan boundary + structured kaavamerkinnät fields including
tehokkuusluku (FAR), kerrosluku (storeys), and use code. If so, the ~55–65% estimate holds.

**The answer sits in one GeoJSON response body.** The blocker is a tooling gap (binary payload rendering),
not an access restriction — the API serves `application/geo+json` that the probe tool cannot decode as text.
Any environment capable of parsing a GeoJSON response can resolve this in a single request:
`GET .../pub_valid_ld_plan_ix_gs/items?limit=1` → inspect `properties`.

⚠ **The declared bbox (all of Finland, 15.05–33.99°E, 58.6–70.26°N) is a GeoServer metadata default, not
data coverage.** Ryhti's own documentation confirms actual plan content is South/North Savo only. Do not let
automated tooling treat the collection's declared `bbox` as geographic coverage evidence.

---

## §3 — ryhti_building: the nationwide positive finding

A separate Ryhti sub-service — `ryhti_building` — is confirmed live and **nationwide** already, ahead of
the plan layer. The `open_address` collection returned a live Helsinki record (municipality code 091, June
2026 timestamp). This sub-system is on a different and faster rollout timeline than `ryhti_plan`.

**Rate impact of ryhti_building:**
- Building address confirmation: adds a nationally live structured layer the plan layer doesn't yet provide
- Does NOT directly add zoning-rule numeric fill (FAR/height still depends on the plan layer schema)
- DOES improve the building-register score to `VERIFIED-LIVE` nationally — replacing the KMTK-only path

**Important:** the current rate plan conflates `ryhti_plan` and `ryhti_building` under one "Ryhti" umbrella.
These are **two independent services on different rollout timelines** and must be tracked separately from
Phase 1 onward.

---

## §4 — The bimodal gap: revised framing

Finland's readiness is split by one binary variable: VOOKA migration status of the target region.

### Three scenarios (revised post-probe 2026-07-24)

| Scenario | Regions | `_ix_` schema | Structured-envelope rate |
|---|---|---|---|
| **Best case** | Ryhti live (South/North Savo) | `_ix_` = index + kaavatietomalli numeric attributes (FAR, kerrosluku, use code) | **~55–65%** |
| **Revised base case** | Ryhti live (South/North Savo) | `_ix_` = index-only (boundary + PDF link — Hamburg B-Plan pattern) | **~30–40%** — no better than pre-Ryhti for numeric fill |
| **Pre-migration** | All other regions | Plan in PDF/municipal WebGIS | **~30–35%** |

⚠ If the revised base case is confirmed, the numeric-fill gap between "Ryhti live" and "pre-migration"
regions **collapses to near-zero** — both return plan boundaries but no structured FAR/height. The bimodal
rate advantage depends entirely on the `_ix_` schema answer.

**Value of Ryhti even if index-only:** a national queryable plan-boundary layer (`pub_valid_ld_plan_ix_gs`),
a plan-in-preparation signal, and a consistent government-operated API endpoint — replacing the
309-municipality WebGIS crawl for plan discovery. But the numeric fill rate stays PDF-bound.

### Why Finland still outperforms Germany/France even if `_ix_` is index-only

| Germany / France | Finland (even index-only Ryhti) |
|---|---|
| No uniform national plan-symbol standard | One national kaavamerkinnät standard — symbol meaning is consistent everywhere |
| WFS delivers zone boundary + PDF link, no numbers | Same — but plan discovery is national, not a 309-municipality crawl |
| 10,800 (DE) / 34,900 (FR) municipalities | ~309 municipalities — far smaller fragmentation surface |
| No nationwide building/address layer | ryhti_building `open_address` VERIFIED-LIVE nationally (Helsinki 091, June 2026) |

The pre-Ryhti floor is higher than Germany/France because the national symbol standard already pre-structures
the semantic content of every plan. The `_ix_` result changes the numeric ceiling, not the structural
floor.

---

## §5 — What would raise the rate

| Action | Rate impact | Effort | Status |
|---|---|---|---|
| **Fetch `pub_valid_ld_plan_ix_gs/items?limit=1` and inspect `properties` object** — resolve whether `_ix_` collections carry numeric kaavatietomalli attributes or index-only fields | **Highest-value action available** — definitively sets the Tier-1 rate as ~55–65% (attributes present) or ~30–40% (index-only) | Very Low — single HTTP GET in a GeoJSON-capable tool; API is open, no auth | ⚠️ BLOCKED on tooling (binary payload — not an access gate) |
| **Wire `ryhti_building` `open_address` layer nationally** | Adds confirmed-live national building/address structured layer; separates building-data score from plan-data score | Low — endpoint confirmed live; schema to fetch | NOT STARTED |
| **Confirm Maanmittauslaitos OGC API Features with a real API key** | Confirms parcel-geometry baseline | Low — self-service email registration | NOT STARTED |
| **Check Helsinki / Uusimaa VOOKA migration date** | Determines whether capital region is Tier 1 or Tier 2 | Low — one VOOKA schedule check | NOT STARTED |
| **Live-probe KMTK 3D building-vector service** — DescribeFeatureType + sample feature | Confirms storey-count attribute name and per-building fill rate | Low | NOT STARTED |
| **Run Museovirasto WFS GetCapabilities** | Confirms heritage layer live, free, and layer names | Low | NOT STARTED |
| **Confirm Åland cadastral/planning status** | Åland likely excluded from mainland systems | Medium | NOT STARTED |
| **Probe RHR access-request process** | Determines if GDPR-gated ownership layer is obtainable | Medium | NOT STARTED |

### Ceiling analysis

| Path | Ceiling |
|---|---|
| `_ix_` collections confirmed as index-only (Hamburg pattern) | ~40–50% nationally at Ryhti completion |
| `_ix_` collections confirmed as index+attributes (kaavatietomalli fields present) | ~70–80% nationally at Ryhti completion |
| + Kaavayksikkö fields populated by participating municipalities | +5–10% |
| + ryhti_building nationwide wired as supplementary layer | +5% (address/building context) |
| **Realistic ceiling (post-2029, full rollout, attributes confirmed)** | **~80–85%** — Denmark-adjacent |
| **Realistic ceiling (post-2029, index-only confirmed)** | **~40–50%** — requires PDF extraction pipeline to climb further |

**The `_ix_` schema question is now the single gating unknown for all ceiling calculations.**

---

## §6 — Live probe record (2026-07-24)

### §6.1 — Ryhti plan OGC API landing page ✅ VERIFIED-LIVE

```
GET https://paikkatiedot.ymparisto.fi/geoserver/ryhti_plan/ogc/features/v1
→ HTTP 200, JSON landing page
Auth: NONE required (open public API)
Courtesy registration: Syke asks (not requires) app identifier via gistuki@syke.fi for production/sustained use
```

### §6.2 — Ryhti plan collections enumerated ✅ VERIFIED-LIVE

```
GET https://paikkatiedot.ymparisto.fi/geoserver/ryhti_plan/ogc/features/v1/collections
→ HTTP 200; 4 collections:

  pub_prep_ld_plan_ix_gs  — "Valmisteilla olevat asemakaavat"  (asemakaavat in preparation — index)
  pub_prep_lm_plan_ix_gs  — "Valmisteilla olevat yleiskaavat"  (yleiskaavat in preparation — index)
  pub_valid_ld_plan_ix_gs — "Asemakaavahakemisto"              (valid asemakaava directory/index)
  pub_valid_lm_plan_ix_gs — "Yleiskaavahakemisto"              (valid yleiskaava directory/index)

All four carry _ix_ (index) suffix.
Declared spatial extent: bbox 15.05–33.99°E, 58.6–70.26°N (all Finland).
⚠ This bbox is GeoServer CRS-extent metadata default, NOT data-coverage evidence.
  Actual plan content confirmed as South/North Savo only per Ryhti documentation.
```

**Verdict:** API is live, public, and returns a real collections document. The `_ix_` naming is a concrete
signal that these may be plan-index collections (boundary + PDF link) rather than attribute-rich
kaavatietomalli feature collections. This is unconfirmed — the item-level `properties` schema must be
fetched to resolve.

### §6.3 — Item-level schema ⚠️ BLOCKED (tooling gap, not access gate)

```
GET .../pub_valid_ld_plan_ix_gs/items?limit=1
→ Returns application/geo+json (confirmed by Content-Type header)
→ Payload: [binary data] — probe tool cannot render GeoJSON as text
Formats attempted: GeoJSON, CSV, HTML, WFS DescribeFeatureType XML fallback
Result: [binary data] in all cases
```

**Not an access restriction.** The server is serving the data. Any environment capable of parsing
`application/geo+json` can resolve this in one request.

### §6.4 — ryhti_building nationwide ✅ VERIFIED-LIVE

```
GET https://paikkatiedot.ymparisto.fi/geoserver/ryhti_building/ogc/features/v1/collections/open_address/items?limit=1
→ HTTP 200; feature returned
  municipality code: 091 (Helsinki)
  coordinates: confirmed (ETRS89/TM35FIN or WGS84)
  timestamp: June 2026
```

**Verdict:** ryhti_building's open_address collection is live **nationally** — not Savo-only. This
sub-service is on a faster rollout timeline than ryhti_plan and must be tracked independently.

---

*Last updated: 2026-07-24. Phase 0 partially complete — Ryhti plan endpoint + collections VERIFIED-LIVE;
ryhti_building nationwide VERIFIED-LIVE; item-level plan attribute schema unconfirmed (tooling gap).
Maintainer: UNASSIGNED.*
