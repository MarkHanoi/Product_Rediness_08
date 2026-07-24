# Data Readiness Rate — Finland (`fi`) national

**Headline rate: ~55–65% (Ryhti live regions) / ~30–35% (non-Ryhti regions)**
*(documentation-level estimate only — no live API probes have been run; see §3 for the bimodal breakdown)*

> **Structured dimensional fill rate** — the fraction of parcel-level building-rule queries that return a
> complete, machine-readable answer (**zone/use code + a density metric [FAR / coverage / tehokkuusluku] +
> height/kerrosluku**) **without reading an ordinance text/PDF**. This definition is IDENTICAL across every
> jurisdiction (Denmark / Madrid / Barcelona / Norway / Germany / France / Italy / Sweden …) so the scores
> are directly comparable. **All estimates are documentation-level from public primary sources; no live
> endpoint probes have been executed. Treat as research-grade, not field-verified.**

| Jurisdiction | Rate | Basis |
|---|---|---|
| Denmark | ~96% | Plandata.dk WFS; keyless; structured dimensions in plan features |
| Madrid | ~68% | PGOU structured WebGIS |
| Saudi (national) | ~55% | |
| **Finland (Ryhti live regions: South/North Savo)** | **~55–65% (est.)** | Kaavatietomalli API; documentation-level; no live probe |
| Barcelona | ~48% | Structured provision codes + geometry construction |
| Norway (national) | ~32% | |
| **Finland (non-Ryhti regions)** | **~30–35% (est.)** | Same national mechanism; plan data in PDF/municipal WebGIS |
| Germany (national) | ~28% | XPlanung Stufe 1; GRZ/GFZ in PDF |
| France (national) | ~22% | GPU WFS; zone ID works; numeric rules in PDF |
| Italy (national) | ~8–10% | Regional fragmentation; no national standard |

Finland's rate is **genuinely bimodal** in a way none of the other countries are. It is not driven by
legal-mechanism variation (unlike Italy's 21 separate mechanisms) but by a single binary variable: whether
the target region has been migrated into the live Ryhti API under the VOOKA project. The mechanism is
identical everywhere; only the delivery timing differs.

---

## §1 — Field-by-field breakdown

| Field | Structured? | Source | Score | Probe status |
|---|---|---|---|---|
| **Parcel geometry (Maanmittauslaitos cadastre)** | ✅ Full | OGC API Features — `https://avoin-paikkatieto.maanmittauslaitos.fi/kiinteisto-avoin/simple-features/v3/` — CC BY 4.0, nightly refresh, self-service API key | **~95%** | `stated` — endpoint URL and licence confirmed from NLS documentation; no live GetFeatures call executed |
| **Zone code / asemakaava hit (Ryhti live regions)** | ✅ Structured | Ryhti OGC API — South Savo + North Savo confirmed live; kaavatietomalli schema (ISO 19109/19103/19107) | **~95%+ in confirmed live regions** | `stated` — live regions confirmed from Ministry of Environment documentation; API schema field names not probed |
| **Zone code (non-Ryhti regions)** | ⚠️ Partial / municipal | Municipal WebGIS or PDF; national symbol standard applies but plan is not in kaavatietomalli API | **~20–40%** (varies by municipality digitisation maturity) | `stated` — inferred from national-standard uniformity plus known pre-migration status |
| **Numeric plan attributes — tehokkuusluku (FAR), kerrosluku (floors), height** | ✅ Structured in Ryhti (where populated) | Kaavatietomalli fields; OGC API — Ryhti regions | **~60–70% conditional on Ryhti hit** | `stated` — kaavatietomalli schema carries these fields; actual population completeness not probed; kaavayksikkö (plan-unit) caveat may lower this |
| **Numeric plan attributes (non-Ryhti)** | ❌ PDF / municipal portal | Per-municipality plan document or local WebGIS | **~15–25%** | `stated` — national symbol meaning is consistent but numbers not in a queryable API |
| **SeutuRAMAVA floor area (Helsinki metro only)** | ✅ Block-level structured | Open dataset — Espoo, Helsinki, Kauniainen, Vantaa; block-level FAR aggregated from valid asemakaava | **~90%+ within Helsinki metro scope** | `stated` — dataset existence and scope confirmed from published description; not live-probed |
| **Building height / 3D (KMTK Maastotietokanta)** | ✅ Full — national open | Maastotietokanta Buildings feature class — LiDAR-derived 3D vectors, storey count as structured attribute, nationwide | **~85%+** | `stated` — national programme confirmed; attribute name and per-building fill rate not probed |
| **Terrain / LiDAR** | ✅ Full, free, complete | National LiDAR programme 2020 onward (5 pts/m² original, 0.5 pts/m² public); 2008–2019 legacy at 0.5 pts/m²; open data | **~95%+** | `stated` — programme confirmed from published NLS documentation |
| **Heritage overlay (Museovirasto WFS/WMS)** | ✅ Structured, non-exhaustive | Museovirasto open OGC WFS/WMS — ancient monuments, scheduled areas, RKY, World Heritage, Building Heritage Register | **~60–70%** (same tier as Italy's SITAP caveat) | `stated` — service existence and layer scope confirmed from Museovirasto published documentation; no GetCapabilities executed |
| **Setbacks** | ❌ Graphical / plan-drawing | Asemakaava plan drawings (setback lines expressed graphically); no national formula equivalent to German Abstandsflächen | **~0–5%** | `stated` — confirmed from national plan-symbol standard description |

---

## §2 — The bimodal gap: why the rate is a split, not a point

Finland's readiness is split by one binary variable: VOOKA migration status of the target region.

### Two scenarios

| Scenario | Regions | Parcel hit rate (zone + structured numeric) | Structured-envelope rate |
|---|---|---|---|
| **Tier 1 — Ryhti live** | South Savo, North Savo (confirmed) | ~95%+ for zone; ~60–70% for numeric fill | **~55–65%** |
| **Tier 2 / Tier 3 — pre-migration** | All other regions (Helsinki/Uusimaa unconfirmed; all others pending VOOKA) | ~20–40% zone via municipal WebGIS; ~15–25% numeric | **~30–35%** |

This split is structurally different from Italy's per-region legal variation. In Italy, a low-scoring region
is low because it uses a different legal mechanism that the engine does not support. In Finland, a
pre-migration region is low only because the **same mechanism** hasn't been loaded into the national API yet
— the moment VOOKA migrates it, it moves from Tier 3 to Tier 1 with no engine change required.

### Why Finland outperforms Germany and France even in pre-Ryhti regions

| Germany / France | Finland (pre-Ryhti) |
|---|---|
| No uniform national plan-symbol standard | One national kaavamerkinnät standard — symbol meaning is consistent everywhere |
| Numeric rules in local plan-regulation PDF with per-commune article numbering | Numeric rules in asemakaava PDF, but article structure follows the same national symbol library |
| WFS delivers zone boundary + PDF link, no numbers | Municipal WebGIS often carries FAR/storey codes from the national symbol set |
| 10,800 (DE) / 34,900 (FR) municipalities | ~309 municipalities — far smaller fragmentation surface |

The pre-Ryhti floor is higher than Germany/France because the national symbol standard already pre-structures
the semantic content of every plan, even when it is not yet in the API.

---

## §3 — What would raise the rate

| Action | Rate impact | Effort |
|---|---|---|
| **Live-probe the Ryhti OGC API for South Savo / North Savo** — confirm schema, auth, parcel-level query path, and numeric attribute population | Establishes Finland's real Tier-1 ceiling with field-verified data; converts estimate to measurement; **highest-value action** | Low — public API, no geo-block known |
| **Confirm Maanmittauslaitos OGC API Features with a real API key** | Confirms parcel-geometry baseline for all of Finland | Low — self-service API key registration |
| **Check Helsinki / Uusimaa VOOKA migration date** | Determines whether the capital region is Tier 1 or Tier 2; Helsinki SeutuRAMAVA floor-area data already structured | Low — one VOOKA schedule check |
| **Live-probe KMTK 3D building-vector service** — fetch DescribeFeatureType + one sample feature | Confirms storey-count attribute name and per-building fill rate | Low |
| **Run Museovirasto WFS GetCapabilities** | Confirms heritage layer is live, free, and delivers the declared layers | Low |
| **Confirm Åland cadastral/planning status independently** | Åland is likely excluded from mainland NLS/Ryhti systems — needs own jurisdiction treatment | Medium |
| **Probe RHR access-request process** | Determines whether GDPR-gated ownership/occupancy layer is obtainable for a legitimate product use case | Medium |

### Ceiling analysis

| Path | Ceiling |
|---|---|
| Ryhti national rollout complete (VOOKA finishes, 1.1.2029 legal backstop) | ~70–80% nationally |
| + Kaavayksikkö fields populated by participating municipalities | +5–10% |
| + Full structured setback attributes (would require kaavatietomalli amendment) | +5% theoretical |
| + Full heritage cross-checking (LVV + municipal plan-overlay channel) | minor (reduces red-refusal rate) |
| **Realistic ceiling (post-2029, full rollout)** | **~80–85%** — Denmark-adjacent; possibly the first country in this research programme with a credible path to Denmark-class via a government-run standard |

**The gap between Finland and Denmark is not structural — it is temporal.** Denmark's Plandata is already
complete. Finland's kaavatietomalli is the same KIND of solution; it is simply in rollout. With the 1.1.2029
legal mandate, this is the first jurisdiction in the research programme where "wait for the national
standard" is a defensible near-term strategy, not a multi-decade bet.

---

*Last updated: 2026-07-24. Research-level only — no live probes run. All figures estimated from public
primary-source documentation. No field values confirmed by direct API query. Maintainer: UNASSIGNED.*
