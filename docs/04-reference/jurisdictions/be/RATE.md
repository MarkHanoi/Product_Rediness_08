# Data Readiness Rate — Belgium (`be`) national

**Headline rate: ~10–14%**
*(blended across 3 independent regional systems; see §2 for the per-region breakdown — the
per-region number is the load-bearing figure, not the national blend)*

> **Structured dimensional fill rate**: the fraction of parcel-level building-rule queries that
> return a complete, machine-readable answer (zone code + height/floors/FAR via structured
> provision codes) without reading a PDF plan document. Methodology mirrors the cross-jurisdiction
> benchmark (Denmark/Sweden/Germany/France). **All probe results are from live HTTP calls executed
> 2026-07-24.** Where a result is stated rather than probed, it is marked `stated`.

| Jurisdiction | Rate | Basis |
|---|---|---|
| Denmark | ~87% | Plandata.dk WFS; keyless; structured dimensions in plan features |
| Sweden (post-2022 plans, optimistic) | ~40–55% | NGP STAC/OAPIF; Planbestämmelsekatalog; geo-blocked from non-SE IPs |
| Germany (national) | ~28% | XPlanung; Stufe 1 = boundary only; GRZ/GFZ in PDF |
| France (national) | ~22% | GPU WFS; zone ID works; numeric rules in PDF |
| **Belgium (national, blended)** | **~10–14%** | 3 independent regional systems (VCRO/CoDT/CoBAT); zone-boundary hit is near-universal, structured numeric provisions are near-absent in all three |
| Italy (national) | ~8–10% | Regional fragmentation; no national standard |

Belgium's position on this list is **deceptive if read as a single number.** Its zone-boundary
coverage (does a zoning plan / parcel intersection resolve at all) is arguably the best of any
country in this benchmark — Wallonia's plan de secteur and Brussels' PRAS give 100% legal
territorial coverage since the 1970s–80s, with no Germany-§34-style "no plan exists here" gap
and no France-RNU-style qualitative fallback zone. What collapses Belgium's rate is the next step:
none of the three regions expose a Sweden-style Planbestämmelsekatalog or a Denmark-style
structured-dimension-in-plan-feature model. The height/FAR/setback number, where one exists at
all, sits in a PDF or is deliberately left to a discretionary test — not in a queryable API field,
in any of the three regions, for any of the layers probed in this pass.

---

## §1 — Field-by-field breakdown

| Field | Structured? | Source | Score | Probe status |
|---|---|---|---|---|
| Parcel geometry (federal cadastre) | ✅ Full | AGDP/AAPD "CADMAP" via SPF Finances; INSPIRE WFS; CC-equivalent open licence, no key | ~90% | ✅ **VERIFIED LIVE** — 2026-07-24; GetCapabilities HTTP 200, application/xml returned |
| Zone/plan boundary hit — Wallonia (plan de secteur) | ✅ Structured, INSPIRE-conformant | SPW Géoportail `inspire_lu` WMS + OGC API Features; 23 plans, 1977–1987, still 100% in force | ~95% | ✅ **VERIFIED LIVE** — WMS GetCapabilities HTTP 200 (full layer tree returned: `LU.ZoningElement_pds`, `LU.SpatialPlan_pds`, `LU.SupplementaryRegulation_pds`); OGC API Features `openapi` endpoint also HTTP 200 |
| Zone/plan boundary hit — Brussels (PRAS) | ✅ Structured | urban.brussels GeoServer, layer `PERSPECTIVE_FR:Affectations` | ~90% | ⚠ **CACHED, NOT LIVE** — exact WFS URL and layer name confirmed from search-engine cache of the GetCapabilities response; direct fetch blocked by bot detection (see §3.4) |
| Zone/plan boundary hit — Flanders (gewestplan + RUP) | ✅ Structured | Digitaal Vlaanderen DSI platform; WFS namespace `lu:` (`lu_gewrup_*`, `lu_prorup_*`, `lu_si_gv`, etc.); also `www.mercator.vlaanderen.be` public WFS | ~85–90% | ⚠ **CACHED, NOT LIVE** — layer catalogue and "kosteloos" licence confirmed from search cache of live capabilities; direct fetch blocked by robots.txt on `informatievlaanderen.be` domains (see §3.5) |
| Height / max floors — structured field, any region | ❌ Not found | None of the three regional systems expose height/gabarit as a queryable numeric API attribute; Brussels RRU Titre I is a PDF regulation with context-relative formulas; Flanders RUP voorschriften linked as text/PDF from DSI plan-element geometry; Wallonia plan de secteur carries only broad affectation, no height dimension | ~0–3% | `stated` — confirmed absent from all three capabilities documents fetched/cached in this pass |
| FAR / plot ratio — structured field, any region | ❌ Not found | Same as above — no Belgian region exposes an FAR-equivalent as a queryable attribute; Brussels CBS+ and office-quota zones ARE structured GIS layers, but neither is a floor-area ratio | ~0% | `stated` |
| Setbacks | ❌ Not structured, often discretionary | Brussels RRU Titre I formulas (H = P + 3.00 + D, etc.) require geometric computation relative to neighbours, not a lookup; Flanders/Wallonia setbacks live inside RUP/plan-de-secteur voorschriften text or are folded into the discretionary test | ~0% | `stated` — no national or regional setback-formula API found |
| Provision-code / semantic catalogue (Sweden Planbestämmelsekatalog equivalent) | ❌ Does not exist | No Belgian region publishes a national or regional catalogue mapping plan-provision codes to numeric meaning | 0% | `stated` — confirmed absent in all three regions |
| Heritage overlay — Flanders (Onroerend Erfgoed) | ✅ Full | `geo.onroerenderfgoed.be/geoserver` WFS/WMS — beschermde monumenten, stads-/dorpsgezichten, archeologische sites, landschappen, overgangszones | ~90% | ✅ **VERIFIED LIVE** — 2026-07-24; GetCapabilities HTTP 200, application/xml returned |
| Heritage overlay — Wallonia (AWaP) | ✅ Full | SPW Géoportail "Patrimoine — biens classés et zones de protection," CC-BY 4.0 | ~85% | `stated` — layer + licence confirmed from Géoportail de Wallonie catalogue page; not independently re-fetched |
| Heritage overlay — Brussels (Direction du Patrimoine culturel / urban.brussels) | ⚠ Register exists; live GIS layer unconfirmed | Registre du patrimoine protégé, maintained by Direction du Patrimoine culturel | ~50% | ❔ **UNVERIFIED** — register confirmed; queryable geographic layer equivalent to Flanders'/Wallonia's was not independently confirmed live |
| Terrain / surface height (LiDAR) — Flanders | ✅ Full, free, mostly complete | DHMV I + II, run by Informatie Vlaanderen/AGIV; ~8 pts/m² per strip, ~16 pts/m² average | ~80% | `stated` — DHMV I had gaps in 13 Flemish centrumsteden; DHMV II confirmed as full-coverage successor |
| Terrain / surface height (LiDAR) — Wallonia | ⚠ Exists, not independently confirmed | PICC continuous mapping + Wallonia's LiDAR-derived terrain products via Géoportail de Wallonie | ~40% | ❔ **UNVERIFIED** — product referenced in catalogue metadata; density/coverage parity with DHMV not probed |
| Terrain / surface height (LiDAR) — Brussels | ❔ Unconfirmed as standing programme | No standalone Brussels LiDAR programme identified; UrbIS is a base map, not confirmed as a LiDAR product | ~15% | ❔ **UNVERIFIED** — flag for direct confirmation before any Brussels dev-day estimate |
| Existing building footprints — federal layer | ✅ Structured | CADMAP building sublayers ("buildings managed by AGDP," "buildings managed by the regions") ship inside the same federal cadastral WFS | ~70% | ✅ **VERIFIED LIVE** (same GetCapabilities call as parcel geometry); height/storey attribute on this sublayer not yet probed |
| Existing building footprints — Flanders (GRB) | ✅ Structured | GRB WFS; `3D GRB — Gebouw LOD1` derives block-model buildings with a reference height from DHMV | ~75% | ⚠ **CACHED, NOT LIVE** — GRB WFS capabilities and "kosteloos" licence confirmed from search-engine cache; direct fetch blocked by robots.txt |
| Existing building footprints — Wallonia (PICC) / Brussels (UrbIS) | ⚠ Exist, not independently probed | PICC (Wallonia); UrbIS (Brussels), both confirmed as live named services in third-party WFS/WMS directories | ~50% | ❔ **UNVERIFIED** — service existence confirmed via aggregator listing, not independently fetched |
| Existing building heights (LOD1/LOD2) | ⚠ Partial, fragmented | Flanders: `3D GRB — Gebouw LOD1 DHMV II`, block model with approximate ridge-height reference, free; Wallonia/Brussels: no equivalent confirmed | ~20% | `stated` — Flanders product confirmed by name and method; no equivalent found for other two regions |

---

## §2 — The regional-fragmentation gap: why this is a range across systems, not across time

Sweden's rate was a range because of one unresolved empirical question (what fraction of land area
is post-2022 digital). Belgium's rate is a range for a **structurally different reason**: there is
no single Belgian system to measure. Spatial planning was devolved to the three Regions as an
exclusive competence by the special laws of 8 August 1980 (Flanders/Wallonia) and 12 January 1989
(Brussels-Capital), and each Region drafted its own code — VCRO, CoDT, CoBAT — independently.
A "national Belgian rate" is a **weighted blend of three unrelated systems**, not a single
measurement with a confidence interval.

### Per-region estimate

| Region | Zone-boundary hit | Structured numeric fill | Why |
|---|---|---|---|
| **Wallonia** | ~95% (VERIFIED LIVE — plan de secteur covers 100% of the region, in force since 1977–1987, INSPIRE WMS + OGC API Features both confirmed live) | ~0–2% | The plan de secteur carries only broad affectation (zone d'habitat, activité économique, etc.), no height/FAR. The Guide régional d'urbanisme is explicitly indicative, not binding. Actual envelope answers route through "bon aménagement des lieux" (CoDT Art. D.IV.13) — a discretionary derogation test, not a lookup. |
| **Brussels-Capital** | ~90% (PRAS confirmed as a structured, queryable regional affectation layer, cached not independently re-fetched) | ~5–10% | Brussels is the one region with a region-wide gabarit-leaning text (RRU Titre I) rather than pure discretion — but Titre I's rules are context-relative formulas in a PDF regulation (H = P + 3.00 + D, etc.), not a queryable numeric attribute per parcel. The small non-zero credit reflects structured-but-non-dimensional layers that DO exist as GIS attributes (accessibility zones A/B/C under RRU Titre VIII, office-quota "soldes de bureaux admissibles" zones under PRAS). |
| **Flanders** | ~85–90% (gewestplan + RUP, both confirmed via cached capabilities) | ~0–5% | VCRO Art. 4.3.1's "goede ruimtelijke ordening" test is mandatory on every permit, including inside a fully adopted RUP. Some RUPs explicitly leave height "vrij." A post-2009 percentage-based provision may additionally be void by statute under VCRO Art. 7.4.2/2 ("clichering") regardless of what the plan text says. |

**Weighted blend** (Flanders ~57%, Wallonia ~32%, Brussels ~11% of Belgium's ~11.8M population):
the blended structured-numeric-fill rate lands at roughly **10–14% nationally** — dragged down by
Flanders' and Wallonia's near-total reliance on discretionary review, and only marginally lifted
by Brussels' partial RRU baseline.

**The single measurement that would resolve this precisely:** a Monte-Carlo point-sample against
each region's zoning WFS for one representative city per region (Antwerp, Liège, and a Brussels
commune), checking not just zone-boundary hit but whether the returned plan feature (RUP/PPAS/BPA)
carries any populated height/FAR attribute at all — the Belgian analogue of the Gothenburg NGP
land-area probe recommended for Sweden.

---

## §3 — Live probe record (2026-07-24)

### §3.1 — Federal cadastre (AGDP/AAPD, SPF Finances) ✅ VERIFIED LIVE

```
GET https://ccff02.minfin.fgov.be/geoservices/arcgis/rest/services/INSPIRE/CP/MapServer/
    exts/InspireFeatureDownload/service?request=GetCapabilities&service=WFS&version=2.0.0
→ HTTP 200, content-type application/xml;charset=utf-8
Dataset: "Cadastral parcels — INSPIRE"
Licence: CC-equivalent open-data (French/Dutch text), no key required
Also confirmed (cached, ATOM feed):
  https://opendata.fin.belgium.be/download/ATOM/tt098dcb-f5c7-49b8-8e0b-7c3811630d85-en.xml
```

Note: this federal WFS also carries building sublayers ("buildings managed by AGDP," "buildings
managed by the regions") per the INSPIRE Geoportal record — worth querying directly for a
height/storey attribute before assuming only footprint geometry is present.

**Verdict:** fully operational, free, single national endpoint — the one layer in this whole study
that does NOT need a per-region integration.

### §3.2 — Wallonia plan de secteur (SPW Géoportail) ✅ VERIFIED LIVE

```
GET https://geoservices.wallonie.be/geoserver/inspire_lu/ows?service=WMS&version=1.3.0&request=GetCapabilities
→ HTTP 200, full WMS_Capabilities XML returned
Service title: "INSPIRE - Usage des sols en Wallonie (BE) - Service de visualisation WMS"
AccessConstraints: "Accès libre et gratuit au service pour tout public"
Layers confirmed (non-exhaustive):
  LU.ZoningElement_pds           — plan de secteur zoning polygons
  LU.SpatialPlan_pds             — plan de secteur extent
  LU.SupplementaryRegulation_pds — supplementary zoning regulations
  LU.SpatialPlan_sdc / _sol      — schéma de développement communal / schéma d'orientation local
  LU.ExistingLandUse             — 15 sub-layers (SIGEC 2015–2024, WALOUS 2018, etc.)
CRS support: EPSG:4326, 3035, 31370, 4258, 3857, 3812, 3034, CRS:84
Coverage: full Walloon regional extent (bbox lon 1.82–6.97 / lat 48.94–51.42)

GET https://geoservices.wallonie.be/geoserver/inspire_lu/ogc/features/v1/openapi
→ HTTP 200, content-type application/vnd.oai.openapi+json;version=3.0
```

**Verdict:** fully operational, free, modern (OGC API Features alongside legacy WMS/WFS — comparable
modernity to Sweden's STAC/OAPIF, and NOT geo-blocked). Belgium's strongest confirmed zoning
endpoint. **The returned layers are affectation/zoning-boundary only** — no height, FAR, or gabarit
attribute appears anywhere in this capabilities document.

### §3.3 — Flanders heritage (Onroerend Erfgoed) ✅ VERIFIED LIVE

```
GET https://geo.onroerenderfgoed.be/geoserver/wfs?request=GetCapabilities
→ HTTP 200, content-type application/xml
Layers confirmed:
  vioe_geoportaal:bes_monument       — beschermde monumenten
  vioe_geoportaal:bes_sd_gezicht     — beschermde stads-/dorpsgezichten
  vioe_geoportaal:bes_arch_site      — beschermde archeologische sites
  vioe_geoportaal:bes_landschap      — beschermde cultuurhistorische landschappen
  vioe_geoportaal:bes_overgangszone  — transition/buffer zones around protected heritage
  + vastgestelde inventories of bouwkundig/archeologisch/landschappelijk erfgoed
```

**Verdict:** fully operational, free, Flanders-wide, no credentials — directly comparable in
quality to Sweden's RAÄ WMS and France's Mérimée/Palissy layer.

### §3.4 — Brussels PRAS (urban.brussels) ⚠ BOT-BLOCKED ON DIRECT FETCH

```
GET https://gis.urban.brussels/geoserver/PERSPECTIVE_FR/ows?REQUEST=GetCapabilities&SERVICE=WFS
→ Direct fetch blocked (bot detection)
```

Confirmed via third-party WFS aggregator cache (wfs.michelstuyts.be):
- `PERSPECTIVE_FR:Affectations` — PRAS zoning layer
- `PERSPECTIVE_FR:Zones_d_interet_regional_a_amenagement_differe` — ZIRAD zones
- `PERSPECTIVE_FR:Bois` — Bois (PRAS)
- Separate GeoServer instance exposing RRU Titre VIII transport-accessibility and office-quota zones

**Verdict:** service demonstrably exists and is well-populated, but this pass could not independently
verify live HTTP status or licence terms — a genuine gap to close before any Brussels dev-day
estimate, not a reason to assume the data is unavailable.

### §3.5 — Flanders zoning (DSI / gewestplan / RUP) ⚠ ROBOTS-DISALLOWED ON DIRECT FETCH

```
GET https://geoservices.informatievlaanderen.be/overdrachtdiensten/GRB/wfs (and sibling DSI/RUP endpoints)
→ Direct fetch blocked (robots.txt)
```

Confirmed via cached capabilities:
- "OGC:WFS · 1.1.0 · Het gebruik van de service is kosteloos" (free of charge)
- DSI namespace layers confirmed: `lu:lu_gewrup_roo_ct`, `lu:lu_prorup_ct/_dg/_gv`,
  `lu:lu_si_gv` (plan-element footprints with voorschriften links),
  `lu:lu_hov_dg/_sc` (tracks which older plan provisions have been statutorily nullified — the
  "clichering"/Art. 7.4.2/2 voidance tracking layer)

**Verdict:** real, free, detailed — Flanders even tracks the Art. 7.4.2/2 voidance problem as
structured data (`lu_hov_*`). Direct verification blocked only by this pass's tooling.

### §3.6 — Open gaps after this probe pass

- Whether any RUP/PPAS/BPA plan feature in Belgium carries a populated numeric height/FAR/gabarit
  attribute via WFS GetFeature (not just GetCapabilities) — not confirmed present, not exhaustively
  confirmed absent.
- Whether Brussels' RRU Titre I articles have ever been encoded as structured per-zone numeric data
  (e.g. within a PPAS/RRUZ dataset) rather than prose formulas in a regulatory PDF.
- Wallonia's and Brussels' LiDAR/terrain-model parity with Flanders' DHMV II.
- Brussels' own live PRAS/RRU capabilities response and licence terms, pending a bot-detection
  workaround (Belgian-IP deployment or an alternative access path).

---

## §4 — What would raise the rate

| Action | Rate impact | Effort |
|---|---|---|
| Probe whether any RUP/PPAS/BPA feature carries a populated numeric height/FAR field via WFS GetFeature — sample several Flemish RUPs and Brussels PPAS | Would either discover a structured path (raising scattered cases from 0% to some fraction) or conclusively confirm "PDF-only," removing the biggest remaining unknown | Medium — needs successful GetFeature calls; requires resolving robots.txt/bot-detection blocks |
| Resolve Brussels bot-detection block — deploy from Belgian-IP or EU-based infrastructure | Unblocks independent verification of PRAS/RRU/RRUZ layers and licence terms | Low–Medium |
| Confirm whether federal CADMAP building sublayer ("buildings managed by AGDP") carries a height or storey-count attribute | If yes: raises existing-building-height score materially; this layer is already confirmed free and national | Low — one GetFeature call against the already-verified federal WFS |
| Check Wallonia's and Brussels' LiDAR/terrain products directly | Resolves the largest unconfirmed gap in the terrain/LOD section | Low |
| Query the Flemish `lu_hov_*` layer for a specific municipality | Confirms whether Flanders' statutory-nullification tracking is granular enough to flag individual voided provisions automatically | Low |
| Probe Brussels CBS+ and office-quota ("soldes de bureaux admissibles") layers for actual attribute schema | These are confirmed-structured layers adjacent to (but not the same as) height/FAR — worth understanding as gating constraints | Low |

### Ceiling analysis

| Path | Ceiling |
|---|---|
| Current confirmed state (zone boundary near-universal; 0 structured height/FAR/setback fields found in any region) | ~10–14% |
| + Confirmed federal CADMAP building-height attribute (if it exists) | ~15–20% |
| + A previously-undiscovered structured numeric field inside any regional RUP/PPAS/plan-de-secteur dataset | ~20–30% (speculative — contingent on §3.6 first action) |
| + A hypothetical Belgium-wide (or single-region) provision-code catalogue analogous to Sweden's Planbestämmelsekatalog | ~50–60% (requires political/administrative action not currently underway in any region) |
| + Full coverage (all three regions structured, all attributes populated) | ~90%+ (Denmark-class) — not indicated as a near-term trajectory |

The gap between Belgium and Sweden/Denmark is not primarily a coverage-completeness problem —
Belgium's zone-boundary layer is arguably **more** complete, having no unplanned-land category at
all. It is that Belgium's underlying legal design, in two of its three regions, treats the exact
number this benchmark is measuring as something to be decided case-by-case rather than published
in advance. **Raising Belgium's rate durably would require a policy change (a structured provision
catalogue), not just better data engineering.**

---

## §5 — Comparison matrix: Belgium vs. peer jurisdictions

| Layer | Denmark | Germany | France | Sweden | Belgium |
|---|---|---|---|---|---|
| Parcel | ✅ Free-with-key, national | ⚠ Per-Land, varies | ✅ Free, national | ✅ CC0, national | ✅ Free, national — **VERIFIED LIVE**, single federal system (unlike Germany's per-Land cadastre) |
| Zone boundary/plan hit | ✅ 87% byzone | ⚠ Boundary only (Stufe 1); §34 land has no plan | ✅ 95% communes (GPU) | ⚠ 35–55% (post-2022 only) | ✅ ~90% blended — VERIFIED LIVE for Wallonia; **no "unplanned land" category exists** in any region since the 1970s–80s |
| Structured rules (height/FAR) | ✅ In plan feature | ❌ In PDF (Stufe 1) | ❌ In PDF | ✅ In Planbestämmelsekatalog IF post-2022 | ❌ In PDF, or explicitly left to discretionary review by design, **in all three regions** |
| Provision-code semantic catalogue | n/a (rules already in feature) | ❌ None | ❌ None | ✅ Planbestämmelsekatalog, ~3,700 codes | ❌ **None in any of the 3 regions** — the single starkest gap vs. Sweden |
| Setbacks | ❌ Graphical (byggelinje) | ✅ Formula (LBO per Land) | ❌ Per-commune PLU PDF | ❌ Graphical (prickmark/kryss) | ❌ Formula exists (Brussels RRU Titre I: H = P + 3.00 + D) but is prose in PDF; Flanders/Wallonia fold into discretionary review |
| Heritage | ✅ GeoDanmark (national, key) | ❌ Per-Land, fragmented | ⚠ Mérimée/Palissy WMS | ✅ RAÄ WMS — VERIFIED LIVE | ✅ Flanders VERIFIED LIVE (Onroerend Erfgoed); Wallonia confirmed (AWaP CC-BY 4.0); Brussels register exists, live GIS layer unconfirmed — **three separate agencies** |
| Terrain | ✅ DHM LiDAR, free-with-key | ⚠ Per-Land, mostly good | ✅ IGN LiDAR HD | ✅ CC0, complete, free | ⚠ Flanders good (DHMV II, some DHMV-I-era city gaps); Wallonia/Brussels unconfirmed |
| LOD2 buildings | ✅ "Danmark i 3D" free-with-key | ⚠ LoD2-DE ~70% free | ✅ BD TOPO bâtiment ~90% | ❌ Municipal, often paid | ❌ **Flanders LOD1 block model only**; no LOD2 confirmed anywhere; Wallonia/Brussels unconfirmed |
| API deployment constraint | None — keyless WFS | Per-Land — 16 endpoints | None — keyless (GPU) | ⚠ Geo-blocked from non-SE IPs | ⚠ Bot-detection on Brussels origin; robots.txt block on Flanders origin (tooling constraint, not confirmed geo-block); Wallonia fully open and unblocked |

**Belgium's differentiated advantages over the four peer jurisdictions:**
1. The parcel/cadastre layer is federal, single, and free — structurally simpler than Germany's 16-Land cadastre licensing.
2. Zone-boundary legal coverage has no gap category — Wallonia's plan de secteur and Brussels' PRAS cover 100% of their respective territories since the 1970s–80s; no §34-style "no plan exists" land.
3. Wallonia's zoning data is exposed through a modern OGC API Features endpoint — comparable modernity to Sweden's STAC/OAPIF and, unlike Sweden's NGP, not geo-blocked.

**Belgium's differentiated disadvantages:**
1. No region publishes anything resembling a provision-code semantic catalogue — Sweden's single biggest advantage over Germany and France does not exist anywhere in Belgium.
2. The gap is legal-design, not data-engineering: Flanders' and Wallonia's dominant mechanism for answering "what height/FAR applies here" is a mandatory discretionary compatibility test, which by design frequently has no number to expose via any API.
3. Three independent regional systems (VCRO/CoDT/CoBAT) mean three independent ingestion pipelines, three independent heritage registers, and three independent building/LiDAR base-map systems — no shared schema comparable to Germany's XPlanung or Sweden's NGP, even though Belgium is a much smaller country than either.
4. Two of the three regional origin servers actively resist automated access (bot detection in Brussels, robots.txt in Flanders) in ways Denmark, France, and Wallonia's own endpoint do not.

---

*Last updated: 2026-07-24 — live probes executed 2026-07-24. Federal cadastre WFS VERIFIED LIVE
(HTTP 200, XML). Wallonia plan de secteur WMS + OGC API Features VERIFIED LIVE (HTTP 200, full
capabilities/OpenAPI JSON returned). Flanders heritage WFS VERIFIED LIVE (HTTP 200, XML). Brussels
PRAS/RRU layers confirmed via third-party cache only — direct fetch bot-blocked. Flanders zoning
(DSI/GRB) confirmed via cache only — direct fetch robots-disallowed. Wallonia/Brussels LiDAR and
building-footprint parity with Flanders not independently probed. All other scores from published
primary sources (stated).*
